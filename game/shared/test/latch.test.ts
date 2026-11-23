// Latch's Snare Latches (Project Redmond R3, gadgets/R3_OPERATORS.md §2; a trapper that does damage, Ulo's): put on a
// door's or window's frame (aimed anywhere at the opening: it goes on the jamb nearer the aim, on his side, at shin
// height; a window's along its sill), it arms 1.5 s later and its wire runs across the opening. The first attacker on
// his feet through it springs it: 35 at once, then 5 a second, slowed and no sprint, until he pulls it off (Interact
// held 1.5 s) or goes down; the defenders are shown where he is. Defenders and drones pass it; an EMP doesn't touch it;
// one bullet breaks it; Latch picks his own back up before it's sprung.
import { describe, expect, it } from "vitest";
import {
  applyDamage,
  ATTACK,
  Btn,
  botLoadout,
  ByteReader,
  encodeLobbyAction,
  forwardXZ,
  frameOf,
  GFlag,
  handleRoomMessage,
  isFormat,
  kindOf,
  loadGameData,
  PawnMode,
  Phase,
  Room,
  shieldUp,
  ticks,
  TICK_HZ,
  wireLength,
  type FormatMode,
  type Gadget,
  type Vec3,
} from "../src/index.js";
import { LAB, scene, type Scene } from "./interactions/harness.js";

const data = loadGameData();
const latch = data.gadgets.get("snare_latch")!;
const k = latch.snare!;
const arm = ticks(latch.tripwire!.armS);

/** Cleave (client 0, attacking) and Latch (client 1, defending) on the Gadget Lab, out of the way. */
async function lab() {
  const s = await scene(["cleave", "latch"], "gadget_lab");
  s.park();
  return s;
}

/** The lab's empty door frame (x −6, z 6, 1 m wide, 0.1 m thick): Latch, on its −z side, aims at the floor in it. */
function onDoor(s: Scene, aimX = -6.25): Gadget {
  s.teleport(1, -6, 0, 4.8);
  const g = s.plant(1, [aimX, 0, 5.95])!;
  expect(g).toBeDefined();
  s.teleport(1, ...LAB.away[1]);
  return g;
}

/** Client i walks straight through the door frame from the +z side (toward −z), until snared or `n` ticks. */
function through(s: Scene, i = 0, n = 150, buttons = 0) {
  s.teleport(i, -6, 0, 7.8, 0);
  s.clients[i].cmd = { forward: 1, yaw: 0, buttons };
  for (let t = 0; t < n && !s.body(i).state.snared; t++) s.wait(1);
  s.clients[i].cmd = { yaw: 0 };
}

const entry = (s: Scene, g: Gadget) => s.sim.gadgets.get(g.id);

describe("Latch and his Snare Latches (R3)", () => {
  it("is a defender, 2 / 2, with four latches in slot 2", async () => {
    const op = data.operators.get("latch")!;
    expect([op.name, op.side, op.healthRating, op.speedRating, op.ability.id, op.ability.name]).toEqual(["Latch", "defender", 2, 2, "snare_latch", "Snare Latches"]);
    const s = await lab();
    expect(s.body(1).state.g2).toBe(4);
  });

  it("aimed at a door's opening, it goes on the jamb nearer the aim, on his side, at shin height, facing across; its wire runs to the far jamb", async () => {
    const s = await lab();
    const g = onDoor(s);
    const [w, h, d] = latch.sizeM;
    expect(g.pos[0]).toBeCloseTo(-6 - (0.5 - d / 2 - 0.005), 3);
    expect(g.pos[2]).toBeCloseTo(6 - (0.05 + w / 2 + 0.01), 3);
    expect(g.pos[1]).toBeCloseTo(0.2 + h / 2, 2);
    const [fx, fz] = forwardXZ(g.yaw);
    expect([fx, fz].map((v) => Math.round(v * 1000) / 1000)).toEqual([1, 0]);
    expect(wireLength(s.sim, g, latch)).toBeCloseTo(1 - d / 2 - 0.005, 3);
    expect(s.body(1).state.g2).toBe(3);
    // Aimed right of the middle, the other jamb; at a wall with no opening near, nowhere.
    const right = onDoor(s, -5.8);
    expect(right.pos[0]).toBeCloseTo(-6 + (0.5 - d / 2 - 0.005), 3);
    expect(forwardXZ(right.yaw)[0]).toBeCloseTo(-1, 3);
    s.teleport(1, -12, 0, -4.8);
    expect(s.plant(1, [-12, 1.0, -5.9])).toBeUndefined();
  });

  it("on a window, along its sill", async () => {
    const s = await lab();
    s.teleport(1, -3, 0, 4.9);
    const g = s.plant(1, [-3.3, 1.2, 5.95])!;
    expect(g).toBeDefined();
    expect(g.pos[1]).toBeCloseTo(0.9 + 0.03 + latch.sizeM[1] / 2, 2);
    expect(Math.abs(forwardXZ(g.yaw)[0])).toBeCloseTo(1, 3);
  });

  it("armed 1.5 s after it's put on: straight through at once, nothing; armed, the first attacker through it is caught (35, then 5 a second)", async () => {
    const s = await lab();
    const g = onDoor(s);
    through(s);
    expect([s.body(0).state.snared, entry(s, g)!.flags & GFlag.Active]).toEqual([false, 0]);
    s.wait(arm);
    const hp = s.body(0).state.hp;
    through(s);
    expect(s.body(0).state.snared).toBe(true);
    expect(entry(s, g)!.flags & GFlag.Active).toBe(GFlag.Active);
    expect(s.body(0).state.hp).toBe(hp - k.hit);
    s.wait(ticks(k.everyS) * 2 + 1);
    expect(s.body(0).state.hp).toBe(hp - k.hit - 2 * k.damage);
    // The latch is at his foot, wherever he goes.
    const at = entry(s, g)!.pos;
    expect(Math.hypot(at[0] - s.body(0).state.x, at[2] - s.body(0).state.z)).toBeLessThan(0.05);
  });

  it("snared, he's slowed to 0.7 and can't sprint", async () => {
    const s = await lab();
    s.teleport(0, 10, 0, 18, 0);
    s.clients[0].cmd = { forward: 1, yaw: 0, buttons: Btn.Sprint };
    s.wait(40);
    const free = Math.hypot(s.body(0).state.vx, s.body(0).state.vz);
    expect(s.body(0).state.sprinting).toBe(true);
    s.clients[0].cmd = { yaw: 0 };
    const g = onDoor(s);
    s.wait(arm);
    through(s);
    expect(s.body(0).state.snared).toBe(true);
    s.teleport(0, 10, 0, 18, 0);
    s.clients[0].cmd = { forward: 1, yaw: 0 };
    s.wait(40);
    const walk = Math.hypot(s.body(0).state.vx, s.body(0).state.vz);
    s.clients[0].cmd = { forward: 1, yaw: 0, buttons: Btn.Sprint };
    s.wait(40);
    expect(s.body(0).state.sprinting).toBe(false);
    expect(Math.hypot(s.body(0).state.vx, s.body(0).state.vz)).toBeCloseTo(walk, 3);
    expect(walk).toBeLessThan(free * 0.7);
    void g;
  });

  it("Interact held 1.5 s pulls it off (let go sooner, it stays): free, the latch spent, no more bites", async () => {
    const s = await lab();
    const g = onDoor(s);
    s.wait(arm);
    through(s);
    expect(s.body(0).state.snared).toBe(true);
    s.clients[0].cmd = { yaw: 0, buttons: Btn.Interact };
    s.wait(ticks(k.pullS) - 10);
    s.clients[0].cmd = { yaw: 0 };
    s.wait(2);
    expect(s.body(0).state.snared).toBe(true);
    s.clients[0].cmd = { yaw: 0, buttons: Btn.Interact };
    s.wait(ticks(k.pullS) + 2);
    s.clients[0].cmd = { yaw: 0 };
    s.wait(2);
    expect([s.body(0).state.snared, entry(s, g)]).toEqual([false, undefined]);
    const hp = s.body(0).state.hp;
    s.wait(ticks(k.everyS) * 2);
    expect(s.body(0).state.hp).toBe(hp);
  });

  it("the snap is loud: the defenders are shown where he is, and he's told", async () => {
    const s = await lab();
    onDoor(s);
    s.wait(arm);
    const before = s.clients.map((c) => c.events.length);
    through(s);
    expect(s.body(0).state.snared).toBe(true);
    s.wait(2);
    for (const i of [0, 1]) expect(s.clients[i].events.slice(before[i]).some((e) => e.kind === "spotted" && e.pawnId === s.body(0).id)).toBe(true);
  });

  it("down, he's free of it: the bites stop and the latch is gone", async () => {
    const s = await lab();
    const g = onDoor(s);
    s.wait(arm);
    through(s);
    const b = s.body(0);
    applyDamage(s.sim, b, { amount: b.state.hp, kill: false });
    expect(b.state.mode).toBe(PawnMode.Downed);
    s.wait(2);
    expect([b.state.snared, entry(s, g)]).toEqual([false, undefined]);
  });

  it("a defender walks through it and an EMP doesn't touch it (mechanical); then an attacker springs it", async () => {
    const s = await lab();
    const g = onDoor(s);
    s.wait(arm);
    through(s, 1);
    expect([s.body(1).state.snared, entry(s, g)!.flags & GFlag.Active]).toEqual([false, 0]);
    s.teleport(1, ...LAB.away[1]);
    (s.room as unknown as { dseg(team: number, at: Vec3, r: number, sec: number): void }).dseg(ATTACK, [g.pos[0], g.pos[1], g.pos[2]], 1.5, 6);
    expect(entry(s, g)!.flags & GFlag.Off).toBe(0);
    through(s);
    expect(s.body(0).state.snared).toBe(true);
  });

  it("a drone passes under it", async () => {
    const s = await lab();
    const g = onDoor(s);
    s.wait(arm);
    s.room.spawnPilot(s.clients[0].id, null, 0, ATTACK);
    s.room.rosterChanged();
    s.wait(8);
    const drone = s.sim.dronesOf(s.ctrlOf(0)).find((p) => p.state.mode === PawnMode.Walk)!;
    s.sim.placeDrone(drone.id, -6, 0.02, 7.0, 0);
    s.clients[0].cmd = { forward: 1, yaw: 0 };
    s.wait(TICK_HZ * 2);
    s.clients[0].cmd = { yaw: 0 };
    expect(drone.state.z).toBeLessThan(5.5);
    expect(entry(s, g)!.flags & GFlag.Active).toBe(0);
  });

  it("one bullet breaks it", async () => {
    const s = await lab();
    const g = onDoor(s);
    s.teleport(0, -6.2, 0, 3.4, 0);
    s.shootAt(0, [g.pos[0], g.pos[1], g.pos[2]]);
    expect(entry(s, g)).toBeUndefined();
  });

  it("Latch takes his own back (Interact held) before it's sprung, not off a leg", async () => {
    const s = await lab();
    const g = onDoor(s);
    s.teleport(1, -6.2, 0, 4.8);
    const look = s.aimAt(1, g.pos);
    s.clients[1].cmd = { ...look };
    s.wait(ticks(s.sim.data.gadgetRules.equipS) + 2);
    expect(s.sim.gadgetToPickUp(s.body(1))?.id).toBe(g.id);
    s.clients[1].cmd = { ...look, buttons: Btn.Interact };
    s.wait(ticks(s.sim.data.gadgetRules.pickUpS) + 8);
    s.clients[1].cmd = { ...look };
    expect([entry(s, g), s.body(1).state.g2]).toEqual([undefined, 4]);
    // Sprung, it's his no longer to take.
    const again = onDoor(s);
    s.wait(arm);
    through(s);
    expect(s.body(0).state.snared).toBe(true);
    const sprung = entry(s, again)!;
    expect(sprung.kind).toBe(kindOf("snare_latch"));
    s.teleport(1, s.body(0).state.x, 0, s.body(0).state.z - 1.2);
    s.clients[1].cmd = { ...s.aimAt(1, sprung.pos) };
    s.wait(4);
    expect(s.sim.gadgetToPickUp(s.body(1))).toBeNull();
  });
});

describe("bots and Latch's latches (R3)", () => {
  const mode = data.modes.get("bot_training")!;
  if (!isFormat(mode)) throw new Error("bot_training");
  const bt: FormatMode = mode;

  /** Bot Training on Millrace with the person on `side` alone and five bots of `ops` against him, up to the action phase. */
  async function match(ops: string[], firstAttack: "blue" | "orange", site: string) {
    const room = await Room.create("LAT", "millrace", { format: "bot_training", seed: 5 });
    const host = room.join("you", { send() {}, buffered: () => 0 })!;
    const send = (b: Uint8Array) => handleRoomMessage(room, host, b[0], new ByteReader(b.subarray(1)));
    const rules = { ...bt.match, swapEvery: 24, overtime: null, firstAttack, bots: { ...bt.match.bots!, size: [1, 5], site }, seconds: { ...bt.match.seconds, pick: 8, prep: 45, action: 180 } };
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
    const bots = [...m.players.values()].filter((p) => p.bot !== null);
    bots.forEach((p, i) => room.pickLoadout(p.id, botLoadout(data, ops[i])));
    expect(step(() => m.phase === Phase.Action, 60)).toBe(true);
    return { room, m, bots, step };
  }

  it("a bot playing Latch puts his latches on the site's doors in prep, each on a frame", async () => {
    const { room, bots } = await match(["latch", "lull", "murmur", "thistle", "vista"], "blue", "SITE_MILL");
    const ctrl = room.bodyOf(bots[0].id)!;
    const mine = room.sim.gadgets.list.filter((g) => g.kind === kindOf("snare_latch") && g.owner === ctrl.id);
    expect(mine.length, `doing ${room.botOf(bots[0].id)!.doing}`).toBeGreaterThanOrEqual(2);
    for (const g of mine) expect(frameOf(room.sim.level.panels, g.pos)?.panel.kind).toBe("barricade");
  }, 300000);

  it("a snared bot attacker pulls it off when nothing's in sight", async () => {
    const { room, bots, step } = await match(["cleave", "kiln", "pointman", "hail", "patch"], "orange", "SITE_BOILER");
    const body = room.sim.pawns.get(room.bodyOf(bots[0].id)!.possessedPawnId)!;
    expect(body.team).toBe(ATTACK);
    body.state.snared = true;
    expect(step(() => !body.state.snared, 4)).toBe(true);
  }, 300000);

  it("one snared mid-knife pulls it off too, its first press of Interact lost to the knife (the review)", async () => {
    const { room, bots, step } = await match(["cleave", "kiln", "pointman", "hail", "patch"], "orange", "SITE_BOILER");
    const body = room.sim.pawns.get(room.bodyOf(bots[0].id)!.possessedPawnId)!;
    body.state.snared = true;
    body.state.meleeTicks = 1;
    expect(step(() => !body.state.snared, 5)).toBe(true);
  }, 300000);
});

describe("Latch's latches and Hull (R3_OPERATORS.md §3)", () => {
  it("Hull walking through braced springs it, as anyone on his feet does (his plate stays braced)", async () => {
    const plate = data.weapons.get("hull_plate")!;
    if (plate.class !== "shield" || !plate.shield.brace) throw new Error("hull_plate");
    const s = await scene(["hull", "latch"], "gadget_lab");
    s.park();
    const g = onDoor(s);
    s.wait(arm);
    const hull = s.body(0);
    s.teleport(0, -6, 0, 7.8, 0);
    s.press(0, Btn.Ability, { yaw: 0 });
    s.wait(ticks(plate.shield.brace.extendS) + 4);
    expect([hull.state.braced, hull.state.braceQ]).toEqual([true, 65535]);
    const hp = hull.state.hp;
    s.clients[0].cmd = { forward: 1, yaw: 0 };
    for (let t = 0; t < 256 && !hull.state.snared; t++) s.wait(1);
    s.clients[0].cmd = { yaw: 0 };
    expect(hull.state.snared).toBe(true);
    expect(entry(s, g)!.flags & GFlag.Active).toBe(GFlag.Active);
    expect(hull.state.hp).toBe(hp - k.hit);
    expect(hull.state.braced).toBe(true);
    // Pulling it off (Interact held its time) takes his hands off the plate: it folds, and comes back up after.
    s.clients[0].cmd = { yaw: 0, buttons: Btn.Interact };
    s.wait(ticks(k.pullS) + 4);
    s.clients[0].cmd = { yaw: 0 };
    s.wait(TICK_HZ);
    expect([hull.state.snared, hull.state.braced, hull.state.braceQ, shieldUp(hull.state)]).toEqual([false, false, 0, true]);
  });
});

describe("two latches on one door (the review, R3)", () => {
  it("only one shuts on a body at once, the other staying armed; pulled off, the one sprung is gone from the table", async () => {
    const s = await lab();
    s.teleport(1, -6, 0, 4.8);
    const a = s.plant(1, [-6.25, 0, 5.95]);
    s.teleport(1, -6, 0, 4.8);
    const b = s.plant(1, [-5.8, 0, 5.95]);
    expect([a, b].every((g) => g !== undefined)).toBe(true);
    s.teleport(1, ...LAB.away[1]);
    s.wait(arm + 2);
    const hp = s.body(0).state.hp;
    through(s);
    s.wait(2);
    expect(s.body(0).state.snared).toBe(true);
    expect(s.body(0).state.hp).toBe(hp - k.hit);
    const latches = () => s.sim.gadgets.list.filter((g) => g.kind === kindOf("snare_latch"));
    const sprung = latches().filter((g) => g.flags & GFlag.Active);
    expect(sprung).toHaveLength(1);
    const other = latches().find((g) => g.id !== sprung[0].id)!;
    s.clients[0].cmd = { yaw: 0, buttons: Btn.Interact };
    s.wait(ticks(k.pullS) + 4);
    s.clients[0].cmd = { yaw: 0 };
    s.wait(4);
    // The one sprung is spent (none left behind in the table); the other is still there (and, as he's still across its
    // wire, it may have shut on him now).
    expect(s.sim.gadgets.get(sprung[0].id)).toBeUndefined();
    expect(latches().map((g) => g.id)).toEqual([other.id]);
  });
});
