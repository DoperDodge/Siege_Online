// Tonic's Second Wind (Project Redmond R3, gadgets/R3_OPERATORS.md §2; the medic's updated version, Ulo's pick): every
// teammate wears a patch Tonic sets off from his wrist monitor (slot 2, held up): the wheel's pick (or Auto: a downed
// teammate first, else the most hurt, else himself) and Fire. On a body on its feet it heals 45 over 6 s, up to its
// most; on a downed one it stops the bleeding and gets him up 2.5 s later with 25. One teammate's patch at a time, his
// own apart (and when he's down, the ability key gets him up). Five a round. An EMP on him stops the monitor; one on a
// patched body stops its patch. His client hears his team twice a second. A bot playing Tonic patches a downed teammate.
import { describe, expect, it } from "vitest";
import {
  applyDamage,
  autoPatch,
  Btn,
  botLoadout,
  ByteReader,
  defaultLoadoutPick,
  encodeLobbyAction,
  Hand,
  handleRoomMessage,
  isFormat,
  loadGameData,
  PawnMode,
  Phase,
  Room,
  TICK_HZ,
  ticks,
  type FormatMode,
  type GameEvent,
} from "../src/index.js";
import { scene, type Scene } from "./interactions/harness.js";

const data = loadGameData();
const k = data.gadgets.get("second_wind")!.patch!;

/** Tonic (client 0) and his teammates (the other defenders), standing apart in the open. */
async function team(ops: string[] = ["tonic", "mute"]) {
  const s = await scene(ops);
  s.room.pickLoadout(s.clients[0].id, defaultLoadoutPick(s.sim.data, "tonic"));
  s.wait(8);
  ops.forEach((_, i) => s.teleport(i, -4 + i * 3, 0, 12, 0));
  return s;
}

/** Tonic's monitor out (Z) and Fire once (with whatever he's picked: Auto by default). */
function patch(s: Scene) {
  if (s.body(0).state.hand !== Hand.Ability) s.handOut(0, Hand.Ability);
  s.press(0, Btn.Fire);
  s.wait(1);
}

/** Down a body (the damage of a body's worth, not a kill). */
function down(s: Scene, i: number) {
  const b = s.body(i);
  applyDamage(s.sim, b, { amount: b.state.hp, kill: false });
  expect(b.state.mode).toBe(PawnMode.Downed);
  s.wait(2);
}

describe("Tonic and his Second Wind (R3)", () => {
  it("is a defender, 3 / 1, with five patches on a monitor in slot 2", async () => {
    const op = data.operators.get("tonic")!;
    expect([op.name, op.side, op.healthRating, op.speedRating, op.ability.id, op.ability.name]).toEqual(["Tonic", "defender", 3, 1, "second_wind", "Second Wind"]);
    const s = await team();
    expect(s.body(0).state.g2).toBe(5);
  });

  it("Auto: a hurt teammate's patch heals 45 over 6 s, a point at a time, up to his most; one of Tonic's patches gone", async () => {
    const s = await team();
    const mate = s.body(1);
    mate.state.hp = 30;
    s.wait(2);
    patch(s);
    expect(s.body(0).state.g2).toBe(4);
    expect(mate.state.healLeft).toBeGreaterThan(0);
    s.wait(ticks(k.healS / 2));
    expect(mate.state.hp).toBeGreaterThanOrEqual(30 + Math.floor(k.heal / 2) - 1);
    expect(mate.state.hp).toBeLessThanOrEqual(30 + Math.ceil(k.heal / 2) + 1);
    s.wait(ticks(k.healS / 2) + 2);
    expect([mate.state.hp, mate.state.healLeft]).toEqual([30 + k.heal, 0]);
    // Near his most: no further than it.
    mate.state.hp = mate.state.maxHp - 10;
    s.wait(2);
    patch(s);
    s.wait(ticks(k.healS) + 2);
    expect(mate.state.hp).toBe(mate.state.maxHp);
  });

  it("a downed teammate's patch stops his bleeding and gets him up 2.5 s later with 25", async () => {
    const s = await team();
    down(s, 1);
    const mate = s.body(1);
    patch(s);
    expect(mate.state.patchTicks).toBeGreaterThan(0);
    const blood = mate.state.downHp;
    s.wait(ticks(k.reviveS) - 4);
    expect([mate.state.mode, mate.state.downHp]).toEqual([PawnMode.Downed, blood]);
    s.wait(6);
    expect([mate.state.mode, mate.state.hp]).toEqual([PawnMode.Walk, k.reviveHp]);
  });

  it("one teammate's patch at a time; his own apart from it", async () => {
    const s = await team(["tonic", "mute", "pulse"]);
    s.body(1).state.hp = 20;
    s.body(2).state.hp = 40;
    s.body(0).state.hp = 50;
    s.wait(2);
    patch(s); // Auto: Mute, the most hurt
    expect([s.body(1).state.healLeft > 0, s.body(2).state.healLeft]).toEqual([true, 0]);
    // Pulse picked while Mute's patch works: nothing.
    s.room.onJegeoPick(s.clients[0].id, { kind: "patch", pawnId: s.body(2).id });
    s.wait(2);
    patch(s);
    expect([s.body(2).state.healLeft, s.body(0).state.g2]).toEqual([0, 4]);
    // His own: yes.
    s.room.onJegeoPick(s.clients[0].id, { kind: "patch", pawnId: s.body(0).id });
    s.wait(2);
    patch(s);
    expect([s.body(0).state.healLeft > 0, s.body(0).state.g2]).toEqual([true, 3]);
    // Mute's done: Pulse's can go now (Auto would take him too).
    s.wait(ticks(k.healS) + 2);
    s.room.onJegeoPick(s.clients[0].id, { kind: "none" });
    s.wait(2);
    patch(s);
    expect(s.body(2).state.healLeft).toBeGreaterThan(0);
  });

  it("down, his ability key sets his own patch off and gets him up", async () => {
    const s = await team();
    down(s, 0);
    s.press(0, Btn.Ability);
    s.wait(1);
    expect(s.body(0).state.patchTicks).toBeGreaterThan(0);
    s.wait(ticks(k.reviveS) + 2);
    expect([s.body(0).state.mode, s.body(0).state.hp, s.body(0).state.g2]).toEqual([PawnMode.Walk, k.reviveHp, 4]);
  });

  it("five a round: with none left Fire does nothing", async () => {
    const s = await team(["tonic", "mute", "pulse", "lesion", "mira"]);
    for (let i = 0; i < 5; i++) {
      for (let j = 1; j < 5; j++) s.body(j).state.healLeft = 0;
      s.body(1 + (i % 4)).state.hp = 30;
      s.wait(ticks(k.healS) + 2);
      patch(s);
    }
    expect(s.body(0).state.g2).toBe(0);
    s.wait(ticks(k.healS) + 2);
    s.body(1).state.hp = 10;
    s.wait(2);
    patch(s);
    expect(s.body(1).state.healLeft).toBe(0);
  });

  it("an EMP on Tonic stops his monitor; one on a patched teammate stops his patch (down, he bleeds again)", async () => {
    const s = await team();
    const dseg = (team: number, at: [number, number, number]) => (s.room as unknown as { dseg(t: number, at: [number, number, number], r: number, sec: number): void }).dseg(team, at, 1.5, 6);
    s.body(1).state.hp = 30;
    s.wait(2);
    const tonic = s.body(0);
    dseg(0, [tonic.state.x, tonic.state.y + 1, tonic.state.z]);
    patch(s);
    expect([s.body(1).state.healLeft, tonic.state.g2]).toEqual([0, 5]);
    s.wait(ticks(6) + 2);
    down(s, 1);
    patch(s);
    expect(s.body(1).state.patchTicks).toBeGreaterThan(0);
    const mate = s.body(1);
    dseg(0, [mate.state.x, mate.state.y + 0.3, mate.state.z]);
    expect(mate.state.patchTicks).toBe(0);
    const blood = mate.state.downHp;
    s.wait(TICK_HZ);
    expect(mate.state.downHp).toBeLessThan(blood);
  });

  it("his client hears his team twice a second: him first, health and its most, down, patched", async () => {
    const s = await team();
    down(s, 1);
    const before = s.clients[0].events.length;
    s.wait(40);
    const v = s.clients[0].events.slice(before).filter((e): e is Extract<GameEvent, { kind: "vitals" }> => e.kind === "vitals");
    expect(v.length).toBeGreaterThanOrEqual(1);
    const last = v[v.length - 1];
    expect(last.bodies.map((b) => b.pawnId)).toEqual([s.body(0).id, s.body(1).id]);
    expect(last.bodies[1].down).toBe(true);
    expect(last.bodies[0].maxHp).toBe(s.body(0).state.maxHp);
    // Mute (client 1) isn't told: he has no monitor.
    expect(s.clients[1].events.some((e) => e.kind === "vitals")).toBe(false);
  });

  it("Auto picks the downed teammate nearest to bleeding out, else the most hurt by share, else himself if hurt", async () => {
    const s = await team(["tonic", "mute", "pulse"]);
    const [t, a, b] = [s.body(0), s.body(1), s.body(2)];
    expect(autoPatch(t, [t, a, b], false)).toBeNull();
    a.state.hp = 60;
    b.state.hp = 50;
    expect(autoPatch(t, [t, a, b], false)).toBe(b);
    down(s, 1);
    expect(autoPatch(t, [t, a, b], false)).toBe(a);
    t.state.hp = 40;
    expect(autoPatch(t, [t, a, b], true)).toBe(t);
  });
});

describe("a bot playing Tonic (R3)", () => {
  const mode = data.modes.get("bot_training")!;
  if (!isFormat(mode)) throw new Error("bot_training");
  const bt: FormatMode = mode;

  it("gets a downed teammate up with a patch from wherever he is", async () => {
    const room = await Room.create("TON", "millrace", { format: "bot_training", seed: 3 });
    const host = room.join("you", { send() {}, buffered: () => 0 })!;
    const send = (b: Uint8Array) => handleRoomMessage(room, host, b[0], new ByteReader(b.subarray(1)));
    const rules = { ...bt.match, swapEvery: 24, overtime: null, firstAttack: "blue", bots: { ...bt.match.bots!, size: [1, 5], site: "SITE_BOILER" }, seconds: { ...bt.match.seconds, pick: 8, prep: 45, action: 180 } };
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
    const ops = ["tonic", "mute", "pulse", "lesion", "mira"];
    const bots = [...m.players.values()].filter((p) => p.bot !== null);
    bots.forEach((p, k) => room.pickLoadout(p.id, botLoadout(data, ops[k])));
    expect(step(() => m.phase === Phase.Action, 60)).toBe(true);
    // The person (attacking alone) out of the way, far off in the yard.
    const you = [...m.players.values()].find((p) => p.bot === null)!;
    room.sim.teleport(room.sim.pawns.get(room.bodyOf(you.id)!.possessedPawnId)!.id, 60, 0, 60, 0);
    const body = (id: number) => room.sim.pawns.get(room.bodyOf(id)!.possessedPawnId)!;
    const tonic = body(bots[0].id);
    const mate = body(bots[3].id);
    applyDamage(room.sim, mate, { amount: mate.state.hp, kill: false });
    expect(mate.state.mode).toBe(PawnMode.Downed);
    const ok = step(() => mate.state.mode === PawnMode.Walk, 15);
    expect(ok, `tonic g2 ${tonic.state.g2} doing ${room.botOf(bots[0].id)!.doing}`).toBe(true);
    expect(tonic.state.g2).toBeLessThan(5);
  }, 300000);
});

describe("Tonic's patch and a revive by hand (R3_OPERATORS.md §3)", () => {
  const hand = data.combat.revive;

  /** Tonic (0), the downed teammate (1) and one who revives him by hand (2), Tonic's monitor out. */
  async function trio() {
    const s = await team(["tonic", "mute", "pulse"]);
    s.handOut(0, Hand.Ability);
    down(s, 1);
    s.wait(16);
    return s;
  }

  /** Client 2 starts reviving client 1 by hand: 0.8 m to his +x side, facing him, Interact held. */
  function byHand(s: Scene) {
    const b = s.body(1).state;
    s.clients[2].cmd = { yaw: Math.PI / 2 };
    s.teleport(2, b.x + 0.8, 0, b.z, 90);
    s.clients[2].cmd = { yaw: Math.PI / 2, buttons: Btn.Interact };
    s.wait(3);
    expect(s.body(2).state.reviveTarget).toBe(s.body(1).id);
  }

  /** Tonic's patch on client 1 (Auto: the downed teammate): the server's tick it began. */
  function patched(s: Scene) {
    patch(s);
    expect(s.body(1).state.patchTicks).toBeGreaterThan(0);
    return s.sim.tick - (ticks(k.reviveS) - s.body(1).state.patchTicks);
  }

  /** The server's tick client 1 is on his feet (looking at most `max` ticks on). */
  function upAt(s: Scene, max: number) {
    for (let n = 0; s.body(1).state.mode === PawnMode.Downed && n < max; n++) s.wait(1);
    expect(s.body(1).state.mode).toBe(PawnMode.Walk);
    return s.sim.tick;
  }

  it("the hand's revive nearly done when he's patched: he's up when it's done, with its health, before the patch's time is out", async () => {
    const s = await trio();
    byHand(s);
    s.wait(ticks(hand.seconds) - TICK_HZ); // about a second of it left
    const from = patched(s);
    const up = upAt(s, ticks(k.reviveS) + 8);
    expect(up - from).toBeLessThan(TICK_HZ + 4);
    expect(s.body(1).state.hp).toBe(hand.revivedHp);
    // The patch is done with him at his next step: it doesn't heal him on top.
    s.wait(TICK_HZ);
    expect([s.body(1).state.hp, s.body(1).state.patchTicks, s.body(1).state.healLeft]).toEqual([hand.revivedHp, 0, 0]);
    s.clients[2].cmd = {};
  });

  it("the patch first, the hand's revive begun after: he's up when the patch's time is out, with its health; the hand's revive ends", async () => {
    const s = await trio();
    const from = patched(s);
    s.wait(TICK_HZ / 2);
    byHand(s);
    const up = upAt(s, ticks(hand.seconds));
    expect(Math.abs(up - from - ticks(k.reviveS))).toBeLessThanOrEqual(2);
    expect(s.body(1).state.hp).toBe(k.reviveHp);
    s.wait(2);
    expect([s.body(2).state.reviveTarget, s.body(1).state.revivedBy]).toEqual([0, 0]);
    s.clients[2].cmd = {};
  });
});
