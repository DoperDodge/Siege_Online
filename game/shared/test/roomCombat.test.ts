// Room + ClientSession in one process (zero latency): who gets the credit for a kill, what a revive cut from
// the other side costs the downed player, and how far withheld inputs can delay a bleed-out (Phase 3 review).
import { describe, expect, it } from "vitest";
import {
  Btn,
  ByteReader,
  ClientSession,
  decodeInput,
  decodeLabTool,
  DT,
  encodeEvents,
  encodeLabTool,
  encodeWelcome,
  loadGameData,
  MAX_HOLD_TICKS,
  Msg,
  PawnMode,
  Room,
  Stance,
  TICK_HZ,
  type GameEvent,
  type InputCmd,
  type LabTool,
} from "../src/index.js";

const data = loadGameData();
type Cmd = Partial<Omit<InputCmd, "seq">>;

async function harness(operators: string[]) {
  const room = await Room.create("FIGHT", "movement_lab", { lab: true, seed: 7 });
  const clock = { t: 0 };
  const clients = operators.map((op, i) => {
    const toServer: Uint8Array[] = [];
    const events: GameEvent[] = [];
    const session = new ClientSession({ send: (b) => toServer.push(b), now: () => clock.t, onEvents: (_t, evs) => events.push(...evs) });
    const id = room.join(`p${i}`, { send: (b) => session.handle(b), buffered: () => 0 }, op)!;
    /** A client that doesn't tick at all on some ticks (its inputs never exist, unlike late ones). */
    return { session, id, toServer, events, skip: (): boolean => false };
  });
  await Promise.all(clients.map((c) => c.session.loaded()));
  const tick = (cmds: Cmd[] = []) => {
    clock.t += DT * 1000;
    clients.forEach((c, i) => {
      if (c.session.ready && !c.skip()) c.session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...cmds[i] });
      for (const b of c.toServer.splice(0)) {
        const r = new ByteReader(b.subarray(1));
        if (b[0] === Msg.Input) room.onInput(c.id, decodeInput(r));
        else if (b[0] === Msg.LabTool) room.onLabTool(c.id, decodeLabTool(r));
      }
    });
    room.step();
  };
  const ticks = (n: number, cmds: Cmd[] = []) => {
    for (let i = 0; i < n; i++) tick(cmds);
  };
  const lab = (c: (typeof clients)[number], tool: LabTool) => c.toServer.push(encodeLabTool(tool));
  const pawnOf = (c: (typeof clients)[number]) => room.sim.pawns.get(c.session.ctrl!.possessedPawnId)!;
  /** The lab tool's damage: all of a body's health downs it, with nobody to credit. */
  const downSelf = (c: (typeof clients)[number]) => lab(c, { kind: "damage", pawnId: pawnOf(c).id, amount: pawnOf(c).state.hp, kill: false });
  ticks(10);
  return { room, clients, tick, ticks, lab, pawnOf, downSelf };
}

const mispredictions = (room: Room, memberId: number) => {
  const i = room.memberInfo(memberId)!;
  return i.corrections - i.forcedCorrections;
};

describe("room combat: credit, revives and stalls", () => {
  it("downed by nobody (a lab tool), then knifed: the kill is the knifer's, with no assist", async () => {
    const h = await harness(["sledge", "sledge"]);
    const [a, b] = h.clients;
    h.lab(a, { kind: "teleport", x: 0, y: 0, z: 12, yawDeg: 0 });
    h.lab(b, { kind: "teleport", x: 0, y: 0, z: 10.9, yawDeg: 90 });
    h.ticks(10);
    h.downSelf(b);
    h.ticks(130); // lies down, past the moment of invulnerability
    expect(h.pawnOf(b).state.mode).toBe(PawnMode.Downed);
    h.tick([{ buttons: Btn.Melee }]);
    h.ticks(30);
    expect(a.events.find((e) => e.kind === "kill")).toMatchObject({ victimPawn: h.pawnOf(b).id, killerCtrl: a.session.ctrl!.id, assistCtrl: 0, weapon: "knife" });
  });

  it("a revive cut from the reviver's side (it goes down) corrects the downed player at once: no misprediction", async () => {
    const h = await harness(["sledge", "sledge"]);
    const [a, b] = h.clients;
    const facingB = { yaw: Math.PI / 2 }; // A, at +X of B, looks along −X
    h.lab(b, { kind: "teleport", x: 0, y: 0, z: 12, yawDeg: 0 });
    h.lab(a, { kind: "teleport", x: 0.8, y: 0, z: 12, yawDeg: 90 });
    h.ticks(10, [facingB]);
    h.downSelf(b);
    h.ticks(80, [facingB]);
    h.ticks(20, [{ ...facingB, buttons: Btn.Interact }]);
    expect(h.pawnOf(b).state.revivedBy).toBe(h.pawnOf(a).id);
    const before = { corrections: h.room.memberInfo(b.id)!.corrections, wrong: mispredictions(h.room, b.id) };
    h.downSelf(a); // the reviver goes down mid-revive
    h.ticks(20, [{ ...facingB, buttons: Btn.Interact }]);
    expect(h.pawnOf(b).state.revivedBy).toBe(0);
    expect(h.room.memberInfo(b.id)!.corrections).toBeGreaterThan(before.corrections);
    expect(mispredictions(h.room, b.id)).toBe(before.wrong);
  });

  it("a downed player whose client skips one tick in five can't slow the bleed-out by more than the hold budget", async () => {
    const h = await harness(["sledge", "sledge"]);
    const [, b] = h.clients;
    h.lab(b, { kind: "teleport", x: 0, y: 0, z: 12, yawDeg: 0 });
    h.ticks(10);
    h.downSelf(b);
    h.ticks(60); // lying still, bleeding
    const pool = h.pawnOf(b).state.downHp;
    let n = 0;
    b.skip = () => n++ % 5 === 4;
    h.ticks(640);
    const perTick = data.combat.dbno.hp / (data.combat.dbno.bleedStillSeconds * TICK_HZ);
    expect(pool - h.pawnOf(b).state.downHp).toBeGreaterThan((640 - MAX_HOLD_TICKS - 2) * perTick);
  });
});

describe("joining while something happens", () => {
  it("events that arrive while the level loads are replayed after it; one that fails is reported, and loading still finishes", async () => {
    const seen: number[] = [];
    const bad: unknown[] = [];
    const session = new ClientSession({
      send: () => {},
      now: () => 0,
      onEvents: (tick) => {
        seen.push(tick);
        throw new Error("the page isn't ready for this yet");
      },
      onBadMessage: (e) => bad.push(e),
    });
    session.handle(encodeWelcome({ roomCode: "JOIN1", tick: 100, levelId: "movement_lab", controllerId: 7 }));
    session.handle(encodeEvents(101, [{ kind: "shotFx", pawnId: 3, slot: 0, suppressed: false, ends: [[0, 1, 0]] }])); // the level is still loading
    const loaded = await Promise.race([session.loaded().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 5000))]);
    expect(seen).toEqual([101]);
    expect(bad).toHaveLength(1);
    expect(loaded).toBe(true);
  });
});
