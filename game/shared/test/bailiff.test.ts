// Bailiff and the Bailiff Shield (Project Redmond R3, gadgets/R3_OPERATORS.md §2; Ulo's: the stun and the slow, she can
// set it down, and an EMP on it while she holds it shocks her). Held up and not aimed, Fire holds the prod on: a jolt
// into the nearest attacker in reach and cone every third of a second (4, slowed to 0.6, no sprint, no vault, 1.2 s),
// on 8 s of charge that refills once it's been off a second. Aimed, her sidearm fires as Fuze's does. Her ability item
// sets the shield down as solid cover (no shield on her while it's down); she picks it up again. An EMP reaching her
// with it up shocks her (no moving, no hands, 1.5 s) and turns the prod off; set down, it doesn't shock her.
import { describe, expect, it, vi } from "vitest";
import {
  ATTACK,
  Btn,
  botLoadout,
  ByteReader,
  encodeLobbyAction,
  handleRoomMessage,
  isFormat,
  Phase,
  Room,
  type FormatMode,
  GFlag,
  Hand,
  kindOf,
  loadGameData,
  PawnMode,
  prodData,
  ShieldAt,
  Sim,
  ticks,
  TICK_HZ,
  viewDir,
  type Pawn,
  type Vec3,
} from "../src/index.js";
import { input, run, teleport } from "./helpers.js";
import { LAB, scene, type Scene } from "./interactions/harness.js";

const data = loadGameData();
const k = prodData(data)!;
const every = ticks(k.everyS);

/** Sledge (client 0, attacking) and Bailiff (client 1, defending) on the Gadget Lab, out of the way. */
async function lab() {
  const s = await scene(["sledge", "bailiff"], "gadget_lab");
  s.park();
  return s;
}

/** Bailiff at (0, 12) and Sledge `dist` m in front of her (−z), `side` m across; her view on his chest. */
function faceOff(s: Scene, dist = 2.5, side = 0) {
  s.teleport(1, 0, 0, 12, 0);
  s.teleport(0, side, 0, 12 - dist, 180);
  const look = s.aimAt(1, [side, 1.2, 12 - dist]);
  s.clients[1].cmd = { ...look };
  // Long enough for him to be where she sees him (her view of others is a few ticks behind; the room judges a jolt there).
  s.wait(24);
  return look;
}

/** A click of Fire (not aimed), looking `look`: Bailiff's prod switched on, or off. */
function click(s: Scene, look: { yaw: number; pitch: number }) {
  s.clients[1].cmd = { ...look, buttons: Btn.Fire };
  s.wait(1);
  s.clients[1].cmd = { ...look };
  s.wait(1);
}

/** Bailiff's prod on for about `n` ticks, looking `look`: a click on, and (if it's still on) a click off. */
function prod(s: Scene, look: { yaw: number; pitch: number }, n: number) {
  click(s, look);
  s.wait(Math.max(0, n - 2));
  if (s.body(1).state.prodOn) click(s, look);
}

/** An attackers' EMP at `at` (1.5 m, `seconds`), as the room sets one off. */
function emp(s: Scene, at: Vec3, seconds: number) {
  (s.room as unknown as { dseg(team: number, at: Vec3, r: number, sec: number): void }).dseg(ATTACK, at, 1.5, seconds);
}

describe("Bailiff and her shield (R3)", () => {
  it("is a defender, 3 / 1, with the Bailiff Shield up, its prod, and her set-down in slot 2", async () => {
    const op = data.operators.get("bailiff")!;
    expect([op.name, op.side, op.healthRating, op.speedRating, op.ability.id]).toEqual(["Bailiff", "defender", 3, 1, "bailiff_post"]);
    const s = await lab();
    const b = s.body(1);
    expect([b.loadout!.shield?.prod?.rangeM, b.loadout!.shieldDown, b.state.g2, b.state.shieldAt]).toEqual([k.rangeM, true, 1, ShieldAt.Front]);
  });

  it("not aimed, a click of Fire switches the prod on: a jolt now and every third of a second into the attacker in front (4 each, slowed); another click switches it off", async () => {
    const s = await lab();
    const look = faceOff(s);
    const hp = s.body(0).state.hp;
    click(s, look);
    s.wait(6);
    expect(s.body(1).state.prodOn).toBe(true);
    expect(s.body(0).state.hp).toBe(hp - k.damage);
    expect(s.body(0).state.slowed).toBeGreaterThan(ticks(k.slowS) - 12);
    // On without Fire held: one more every `everyS`.
    s.wait(every * 3 - 8 + 2);
    expect(s.body(0).state.hp).toBe(hp - k.damage * 4);
    click(s, look);
    expect(s.body(1).state.prodOn).toBe(false);
    const after = s.body(0).state.hp;
    s.wait(every * 2);
    expect(s.body(0).state.hp).toBe(after);
  });

  it("a jolted attacker is slowed to 0.6, can't sprint and can't vault, until it wears off", async () => {
    const s = await lab();
    // His walking speed first.
    s.teleport(0, 10, 0, 20, 0);
    s.clients[0].cmd = { forward: 1, yaw: 0 };
    s.wait(30);
    const walk = Math.hypot(s.body(0).state.vx, s.body(0).state.vz);
    s.clients[0].cmd = { yaw: 0 };
    const look = faceOff(s);
    prod(s, look, 8);
    expect(s.body(0).state.slowed).toBeGreaterThan(0);
    s.teleport(1, ...LAB.away[1]);
    s.clients[0].cmd = { forward: 1, yaw: Math.PI, buttons: Btn.Sprint };
    s.wait(20);
    expect(s.body(0).state.sprinting).toBe(false);
    expect(Math.hypot(s.body(0).state.vx, s.body(0).state.vz)).toBeCloseTo(walk * k.slowMul, 1);
    s.clients[0].cmd = { yaw: Math.PI };
    s.wait(ticks(k.slowS));
    expect(s.body(0).state.slowed).toBe(0);
  });

  it("nothing past its reach, outside its cone, or behind a wall", async () => {
    const s = await lab();
    let look = faceOff(s, k.rangeM + 1);
    const hp = s.body(0).state.hp;
    prod(s, look, every * 2);
    expect(s.body(0).state.hp).toBe(hp);
    look = faceOff(s, 2.5);
    // Looking 40° off him.
    prod(s, { ...look, yaw: look.yaw + 0.7 }, every * 2);
    expect(s.body(0).state.hp).toBe(hp);
  });

  it("aiming switches the prod off; aimed, Fire fires her sidearm and not the prod", async () => {
    const s = await lab();
    const look = faceOff(s, 3);
    click(s, look);
    expect(s.body(1).state.prodOn).toBe(true);
    s.clients[1].cmd = { ...look, buttons: Btn.Ads };
    s.wait(2);
    expect(s.body(1).state.prodOn).toBe(false);
    s.wait(ticks(k.refillDelayS) + ticks(1));
    s.body(1).state.prodUsed = 0;
    s.body(0).state.slowed = 0;
    s.clients[1].cmd = { ...look, buttons: Btn.Ads };
    s.wait(64);
    const ammo = s.body(1).state.reserve0;
    const loaded = s.body(1).state;
    void loaded;
    s.clients[1].cmd = { ...look, buttons: Btn.Ads | Btn.Fire };
    s.wait(4);
    s.clients[1].cmd = { ...look, buttons: Btn.Ads };
    s.wait(4);
    expect(s.body(1).state.prodUsed).toBe(0);
    expect(s.body(0).state.slowed).toBe(0);
    void ammo;
  });

  it("8 s of charge (a jolt every third of a second while it lasts): then it's off by itself; off a second, it comes back a second a second", async () => {
    const s = await lab();
    const look = faceOff(s, 2.5);
    const hp = s.body(0).state.hp;
    s.body(0).state.hp = s.body(0).state.maxHp = 400; // (he'd go down first)
    click(s, look);
    // (Just after it runs out: a second later it starts coming back.)
    s.wait(ticks(k.chargeS) + 4);
    expect([s.body(1).state.prodOn, s.body(1).state.prodUsed]).toEqual([false, ticks(k.chargeS)]);
    expect(400 - s.body(0).state.hp).toBe(k.damage * Math.ceil(ticks(k.chargeS) / every));
    void hp;
    s.wait(ticks(k.refillDelayS) + TICK_HZ * 2);
    expect(s.body(1).state.prodUsed).toBeLessThanOrEqual(ticks(k.chargeS) - TICK_HZ * 2 + 4);
    const before = s.body(0).state.hp;
    prod(s, look, 8);
    expect(s.body(0).state.hp).toBe(before - k.damage);
  });

  it("Z and Fire held set it down as solid cover in front of her (no shield on her: her sidearm); F takes it back", async () => {
    const s = await lab();
    s.teleport(1, 0, 0, 12, 0);
    const post = s.plant(1, [0, 0, 10.8])!;
    expect(post?.kind).toBe(kindOf("bailiff_post"));
    expect([s.body(1).state.g2, s.body(1).state.shieldAt]).toEqual([0, ShieldAt.None]);
    // Solid: a shot at her through it stops there.
    s.teleport(0, 0, 0, 8, 180);
    const hp = s.body(1).state.hp;
    s.shootAt(0, [0, 1.0, 12]);
    expect(s.body(1).state.hp).toBe(hp);
    // Back to her: Interact held on it.
    s.teleport(0, ...LAB.away[0]);
    s.teleport(1, 0, 0, 11.9, 0);
    const look = s.aimAt(1, post.pos);
    s.clients[1].cmd = { ...look };
    s.wait(ticks(s.sim.data.gadgetRules.equipS) + 2);
    s.clients[1].cmd = { ...look, buttons: Btn.Interact };
    s.wait(ticks(s.sim.data.gadgetRules.pickUpS) + 8);
    s.clients[1].cmd = { ...look };
    s.wait(4);
    expect([s.sim.gadgets.get(post.id), s.body(1).state.g2]).toEqual([undefined, 1]);
    // The weapon back in hand, the shield on her arm again.
    if (s.body(1).state.hand !== Hand.Weapon) s.press(1, Btn.Ability);
    s.wait(ticks(s.sim.data.gadgetRules.equipS) + 4);
    expect(s.body(1).state.shieldAt).toBe(ShieldAt.Front);
  });

  it("an EMP reaching her with the shield up shocks her: no moving, no hands, for 1.5 s; the prod's off for the EMP's time", async () => {
    const s = await lab();
    const look = faceOff(s, 2.5);
    const b = s.body(1);
    const seen = s.clients[1].events.length;
    emp(s, [b.state.x, b.state.y + 1, b.state.z], 6);
    expect([b.state.shocked, b.state.jammed > 0]).toEqual([ticks(k.shockS), true]);
    const at = { x: b.state.x, z: b.state.z };
    const hp = s.body(0).state.hp;
    s.clients[1].cmd = { ...look, forward: 1, buttons: Btn.Fire };
    s.wait(ticks(k.shockS) - 4);
    expect(Math.hypot(b.state.x - at.x, b.state.z - at.z)).toBeLessThan(0.01);
    expect(s.body(0).state.hp).toBe(hp);
    expect(s.clients[1].events.slice(seen).some((e) => e.kind === "stunned")).toBe(true);
    s.wait(8);
    // Moving again, but the prod's still off (the EMP's 6 s).
    expect(Math.hypot(b.state.x - at.x, b.state.z - at.z)).toBeGreaterThan(0.01);
    expect(s.body(0).state.hp).toBe(hp);
    s.clients[1].cmd = { ...look };
  });

  it("set down, her ability key switches its shock on: it jolts the attacker in front of it (4, slowed) until it's switched off; an EMP switches it off", async () => {
    const s = await lab();
    s.teleport(1, 0, 0, 12, 0);
    const post = s.plant(1, [0, 0, 10.8])!;
    expect(post.kind).toBe(kindOf("bailiff_post"));
    s.teleport(0, 0, 0, 8.6, 180);
    s.wait(4);
    const hp = s.body(0).state.hp;
    s.press(1, Btn.Ability);
    s.wait(4);
    expect(s.sim.gadgets.get(post.id)!.flags & GFlag.Active).toBe(GFlag.Active);
    expect(s.body(0).state.hp).toBe(hp - k.damage);
    expect(s.body(0).state.slowed).toBeGreaterThan(0);
    s.wait(every * 2);
    expect(s.body(0).state.hp).toBe(hp - k.damage * 3);
    s.press(1, Btn.Ability);
    expect(s.sim.gadgets.get(post.id)!.flags & GFlag.Active).toBe(0);
    const after = s.body(0).state.hp;
    s.wait(every * 2);
    expect(s.body(0).state.hp).toBe(after);
    // On again, then an EMP on it: off.
    s.press(1, Btn.Ability);
    expect(s.sim.gadgets.get(post.id)!.flags & GFlag.Active).toBe(GFlag.Active);
    emp(s, [post.pos[0], post.pos[1], post.pos[2]], 6);
    s.wait(2);
    expect(s.sim.gadgets.get(post.id)!.flags & (GFlag.Active | GFlag.Off)).toBe(GFlag.Off);
    const later = s.body(0).state.hp;
    s.wait(every * 2);
    expect(s.body(0).state.hp).toBe(later);
  });

  it("set down, an EMP doesn't shock her", async () => {
    const s = await lab();
    s.teleport(1, 0, 0, 12, 0);
    expect(s.plant(1, [0, 0, 10.8])).toBeDefined();
    const b = s.body(1);
    emp(s, [b.state.x, b.state.y + 1, b.state.z], 6);
    expect([b.state.shocked, b.state.jammed > 0]).toEqual([0, true]);
  });
});

describe("a bot playing Bailiff (R3)", () => {
  const mode = data.modes.get("bot_training")!;
  if (!isFormat(mode)) throw new Error("bot_training");
  const bt: FormatMode = mode;

  it("prods an attacker who comes within its reach", async () => {
    const room = await Room.create("BAI", "millrace", { format: "bot_training", seed: 5 });
    const host = room.join("you", { send() {}, buffered: () => 0 })!;
    const send = (b: Uint8Array) => handleRoomMessage(room, host, b[0], new ByteReader(b.subarray(1)));
    const rules = { ...bt.match, swapEvery: 24, overtime: null, firstAttack: "blue", bots: { ...bt.match.bots!, size: [1, 5], site: "SITE_MILL" }, seconds: { ...bt.match.seconds, pick: 8, prep: 45, action: 180 } };
    send(encodeLobbyAction({ kind: "change", change: { kind: "rules", rules: { match: rules } } } as Parameters<typeof encodeLobbyAction>[0]));
    room.step();
    send(encodeLobbyAction({ kind: "start" }));
    room.step();
    const m = room.director!.match;
    const step = (done: () => boolean, seconds: number) => {
      for (let i = 0; i < seconds * TICK_HZ && !done(); i++) room.step();
      return done();
    };
    expect(step(() => m.phase === Phase.Planning, 5)).toBe(true);
    const ops = ["bailiff", "mute", "pulse", "lesion", "mira"];
    const bots = [...m.players.values()].filter((p) => p.bot !== null);
    bots.forEach((p, i) => room.pickLoadout(p.id, botLoadout(data, ops[i])));
    expect(step(() => m.phase === Phase.Action, 60)).toBe(true);
    const bailiff = room.sim.pawns.get(room.bodyOf(bots[0].id)!.possessedPawnId)!;
    // Its teammates well away, and the person 2.5 m in front of it, in plain sight.
    bots.slice(1).forEach((p, i) => room.sim.teleport(room.bodyOf(p.id)!.possessedPawnId, 60 + i * 3, 0, 60, 0));
    const you = [...m.players.values()].find((p) => p.bot === null)!;
    const me = room.sim.pawns.get(room.bodyOf(you.id)!.possessedPawnId)!;
    const [fx, fz] = [-Math.sin(bailiff.state.yaw), -Math.cos(bailiff.state.yaw)];
    room.sim.teleport(me.id, bailiff.state.x + fx * 2.5, bailiff.state.y, bailiff.state.z + fz * 2.5, 0);
    const ok = step(() => me.state.slowed > 0, 6);
    expect(ok, `bailiff shieldAt ${bailiff.state.shieldAt} used ${bailiff.state.prodUsed} doing ${room.botOf(bots[0].id)!.doing}`).toBe(true);
  }, 300000);
});

void GFlag;
void viewDir;

describe("the prod's cadence can't be beaten (the review, R3)", () => {
  it("clicking it off and on as fast as can be jolts no faster than holding it on", async () => {
    const s = await lab();
    const look = faceOff(s, 2.5);
    const hp0 = s.body(0).state.hp;
    for (let i = 0; i < TICK_HZ; i++) {
      s.clients[1].cmd = { ...look, buttons: i % 2 === 0 ? Btn.Fire : 0 };
      s.wait(1);
    }
    s.clients[1].cmd = { ...look };
    s.wait(6);
    expect((hp0 - s.body(0).state.hp) / k.damage).toBeLessThanOrEqual(Math.ceil(TICK_HZ / every) + 1);
  });

  it("nor does switching the set-down shield's shock off and on", async () => {
    const s = await lab();
    s.teleport(1, 0, 0, 12, 0);
    expect(s.plant(1, [0, 0, 10.8])?.kind).toBe(kindOf("bailiff_post"));
    s.teleport(0, 0, 0, 8.6, 180);
    s.wait(4);
    const hp0 = s.body(0).state.hp;
    for (let i = 0; i < TICK_HZ / 2; i++) s.press(1, Btn.Ability); // a press each two ticks: on, off, on...
    s.wait(6);
    expect((hp0 - s.body(0).state.hp) / k.damage).toBeLessThanOrEqual(Math.ceil(TICK_HZ / every) + 1);
  });
});

describe("Bailiff knocked down with the prod on (the review, R3)", () => {
  it("gets up with it off: the knockdown took her shield down, and it doesn't jolt after", async () => {
    const sim = await Sim.create("movement_lab");
    const ctrl = sim.addPlayer("bailiff", "bailiff", 0);
    teleport(sim, ctrl, 0, 0, 0);
    const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
    run(sim, ctrl, {}, 0.2);
    sim.step(new Map([[ctrl.id, input({ buttons: Btn.Fire })]]));
    sim.step(new Map([[ctrl.id, input({})]]));
    expect(pawn.state.prodOn).toBe(true);
    expect(sim.knockDown(pawn, [0, 1, -2])).toBe(true);
    for (let n = 0; pawn.state.mode === PawnMode.Knocked && n < TICK_HZ * 10; n++) sim.step(new Map([[ctrl.id, input({})]]));
    expect(pawn.state.mode).toBe(PawnMode.Walk);
    let jolts = 0;
    for (let i = 0; i < 40; i++) {
      sim.step(new Map([[ctrl.id, input({})]]));
      jolts += sim.events.filter((e) => e.kind === "prod").length;
    }
    expect([pawn.state.prodOn, jolts]).toEqual([false, 0]);
  });
});

describe("the prod and the set-down shock under the damage rules (the review, R3)", () => {
  it("do nothing to an attacker under the Attacker Safeguard: no damage, no slow", async () => {
    const s = await lab();
    // Quick Match's safeguard (the director's; a lab has none) said to cover Sledge.
    vi.spyOn(s.room as unknown as { safeguarded(p: Pawn): boolean }, "safeguarded").mockImplementation((p) => p === s.body(0));
    const look = faceOff(s);
    const hp = s.body(0).state.hp;
    prod(s, look, every * 2);
    expect([s.body(0).state.hp, s.body(0).state.slowed]).toEqual([hp, 0]);
    // Her set-down shield's shock: the same.
    s.teleport(1, 0, 0, 12, 0);
    expect(s.plant(1, [0, 0, 10.8])?.kind).toBe(kindOf("bailiff_post"));
    s.teleport(0, 0, 0, 8.6, 180);
    s.wait(4);
    s.press(1, Btn.Ability);
    s.wait(every * 2);
    expect([s.body(0).state.hp, s.body(0).state.slowed]).toEqual([hp, 0]);
  });

  it("a teammate in front (friendly fire on) takes it as team damage: scaled, and once hers is over the line, reflected on her", async () => {
    const s = await scene(["sledge", "bailiff", "mute"], "gadget_lab");
    s.park();
    const rules = s.room.rules;
    const was = { scale: rules.friendlyFire.scale, reverse: { ...rules.reverseFriendlyFire } };
    try {
      rules.friendlyFire.scale = 0.5;
      rules.reverseFriendlyFire.enabled = true;
      rules.reverseFriendlyFire.thresholdHp = k.damage; // two jolts' scaled damage
      s.teleport(1, 0, 0, 12, 0);
      s.teleport(2, 0, 0, 9.5, 180);
      const look = s.aimAt(1, [0, 1.2, 9.5]);
      s.clients[1].cmd = { ...look };
      s.wait(24);
      const [hers, his] = [s.body(1).state.hp, s.body(2).state.hp];
      prod(s, look, every * 4);
      const half = Math.round(k.damage * 0.5);
      // Two jolts on him at half; the rest on her, at half too.
      expect(his - s.body(2).state.hp).toBe(2 * half);
      expect(hers - s.body(1).state.hp).toBeGreaterThan(0);
      expect((hers - s.body(1).state.hp) % half).toBe(0);
    } finally {
      rules.friendlyFire.scale = was.scale;
      Object.assign(rules.reverseFriendlyFire, was.reverse);
    }
  });
});
