// Room + ClientSession in one process, messages delivered in order once per tick (zero latency unless a
// test holds them back). Covers the Phase 2 review findings: respawn, operator picks, withheld inputs,
// shots, lobby errors and resyncs.
import { describe, expect, it } from "vitest";
import {
  Btn,
  ByteReader,
  ClientSession,
  decodeInput,
  decodeLabTool,
  decodePickOperator,
  decodePing,
  DT,
  encodeError,
  encodeLabTool,
  encodePickOperator,
  ErrorCode,
  MAX_HOLD_TICKS,
  Msg,
  Room,
  Stance,
  type InputCmd,
  type ShotResult,
} from "../src/index.js";

type Cmd = Partial<Omit<InputCmd, "seq">>;

async function harness(operators: string[]) {
  const room = await Room.create("TEST1", "movement_lab", { lab: true });
  const clock = { t: 0 };
  const clients = operators.map((op, i) => {
    const toClient: Uint8Array[] = [];
    const toServer: Uint8Array[] = [];
    const shots: ShotResult[] = [];
    const session = new ClientSession({ send: (b) => toServer.push(b), now: () => clock.t, onShot: (s) => shots.push(s) });
    const id = room.join(`p${i}`, { send: (b) => toClient.push(b), buffered: () => 0 }, op)!;
    return { session, id, toClient, toServer, shots, holdUp: false };
  });
  const toServer = (c: (typeof clients)[number]) => {
    for (const b of c.toServer.splice(0)) {
      const r = new ByteReader(b.subarray(1));
      if (b[0] === Msg.Input) room.onInput(c.id, decodeInput(r));
      else if (b[0] === Msg.Resync) room.onResync(c.id);
      else if (b[0] === Msg.Ping) room.onPing(c.id, decodePing(r).clientTime);
      else if (b[0] === Msg.LabTool) room.onLabTool(c.id, decodeLabTool(r));
      else if (b[0] === Msg.PickOperator) room.pickOperator(c.id, decodePickOperator(r).operatorId);
    }
  };
  const toClients = () => {
    for (const c of clients) for (const b of c.toClient.splice(0)) c.session.handle(b);
  };
  toClients();
  await Promise.all(clients.map((c) => c.session.loaded()));
  /** One tick: every client predicts and sends (unless `holdUp`), the server steps, snapshots arrive. */
  const tick = (cmds: Cmd[] = []) => {
    clock.t += DT * 1000;
    clients.forEach((c, i) => {
      c.session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...cmds[i] });
      if (!c.holdUp) toServer(c);
    });
    room.step();
    toClients();
  };
  const ticks = (n: number, cmds: Cmd[] = []) => {
    for (let i = 0; i < n; i++) tick(cmds);
  };
  ticks(8); // everyone has their first correction and is predicting
  return { room, clients, tick, ticks, toServer, clock };
}

const own = (c: { session: ClientSession }) => c.session.sim!.pawns.get(c.session.ctrl!.possessedPawnId)!.state;

describe("room and client session", () => {
  it("respawning gives the client its new body (no endless corrections) and tells everyone else", async () => {
    const h = await harness(["sledge", "mute"]);
    const [a, b] = h.clients;
    h.ticks(32, [{ forward: 1 }]);
    const oldPawns = [...a.session.ctrl!.pawnIds];
    a.toServer.push(encodeLabTool({ kind: "respawn" }));
    h.ticks(16, [{ forward: 1 }]);
    const ctrl = a.session.ctrl!;
    expect(ctrl.pawnIds).not.toEqual(oldPawns);
    expect(a.session.sim!.pawns.has(ctrl.possessedPawnId)).toBe(true);
    expect(a.session.ready).toBe(true);
    const before = h.room.memberInfo(a.id)!.corrections;
    h.ticks(64, [{ forward: 1 }]);
    expect(h.room.memberInfo(a.id)!.corrections - before).toBe(0);
    // b knows the new body: its roster lists it and it's drawn as a remote, not the old one.
    expect(b.session.roster.find((e) => e.name === "p0")!.pawnIds).toEqual(ctrl.pawnIds);
    expect(b.session.remoteIds()).toContain(ctrl.possessedPawnId);
    expect(b.session.remoteIds()).not.toContain(oldPawns[0]);
  });

  it("inputs in flight for the old body don't move the new one after an operator pick", async () => {
    const h = await harness(["sledge"]);
    const [a] = h.clients;
    // Sprinting, with ~6 ticks of inputs still on their way when the pick reaches the server.
    a.holdUp = true;
    h.ticks(6, [{ forward: 1, buttons: Btn.Sprint }]);
    a.toServer.unshift(encodePickOperator("fuze"));
    h.toServer(a);
    const fresh = h.room.sim.pawns.get(h.room.roster()[0].pawnIds[0])!.state;
    const spawn = { x: fresh.x, z: fresh.z };
    a.holdUp = false;
    h.ticks(20); // standing still on the new body
    const state = h.room.sim.pawns.get(a.session.ctrl!.possessedPawnId)!.state;
    expect(a.session.ctrl!.operatorId).toBe("fuze");
    expect(Math.hypot(state.x - spawn.x, state.z - spawn.z)).toBeLessThan(0.01); // never sprinted off
    expect(own(a).x).toBe(state.x);
    expect(own(a).z).toBe(state.z);
  });

  it("a player who stops sending inputs is held still briefly, then falls like anyone else", async () => {
    const h = await harness(["sledge"]);
    const [a] = h.clients;
    a.toServer.push(encodeLabTool({ kind: "teleport", x: 0, y: 3, z: 12, yawDeg: 0 })); // in the air
    h.tick();
    a.holdUp = true; // inputs stop reaching the server (a stall, or a cheat)
    const pawn = () => h.room.sim.pawns.get(a.session.ctrl!.possessedPawnId)!.state;
    const y0 = pawn().y;
    h.ticks(MAX_HOLD_TICKS - 2);
    expect(pawn().y).toBe(y0); // a short stall costs nothing
    h.ticks(48);
    expect(pawn().y).toBeLessThan(y0 - 2.5); // fell (and landed)
  });

  it("a test shot rides on the input: it's judged with that input's view, and claimed view times are bounded", async () => {
    const h = await harness(["sledge", "mute"]);
    const [a, b] = h.clients;
    a.toServer.push(encodeLabTool({ kind: "teleport", x: 0, y: 0, z: 4, yawDeg: 180 }));
    b.toServer.push(encodeLabTool({ kind: "teleport", x: 0, y: 0, z: 12, yawDeg: 0 }));
    h.ticks(40, [{ yaw: Math.PI, pitch: -0.05 }]);
    h.tick([{ yaw: Math.PI, pitch: -0.05, buttons: Btn.Fire }]);
    h.ticks(2, [{ yaw: Math.PI, pitch: -0.05 }]);
    expect(a.shots).toHaveLength(1);
    expect(a.shots[0].hit?.pawnId).toBe(b.session.ctrl!.possessedPawnId);
    expect(a.shots[0].dir[2]).toBeGreaterThan(0.99); // along the input's view (+Z), not some older one
    // Holding the button doesn't fire again; looking away and firing misses.
    h.ticks(10, [{ yaw: Math.PI, pitch: -0.05, buttons: Btn.Fire }]);
    expect(a.shots).toHaveLength(1);
    h.ticks(2, [{ yaw: 0 }]);
    h.tick([{ yaw: 0, buttons: Btn.Fire }]);
    h.tick();
    expect(a.shots).toHaveLength(2);
    expect(a.shots[1].hit).toBeNull();
    // A client claiming it draws others far in the past is held to the interpolation ceiling (150 ms ≈
    // 9.6 ticks behind its newest snapshot), well inside the 200 ms (12.8-tick) rewind cap.
    a.holdUp = true;
    h.ticks(10);
    const now = h.room.sim.tick;
    a.toServer.length = 0;
    const cmd = { seq: (h.room.memberInfo(a.id)!.lastSeq + 1) & 0xffff, forward: 0, strafe: 0, yaw: Math.PI, pitch: -0.05, buttons: Btn.Fire, stance: Stance.Stand, lean: 0 as const };
    h.room.onInput(a.id, { cmd, predictedHash: 0, epoch: a.session.epoch, snapTick: now & 0xffff, viewBackQ8: 0xffff });
    h.room.step();
    for (const b of a.toClient.splice(0)) a.session.handle(b);
    expect(a.shots).toHaveLength(3);
    expect(a.shots[2].serverTick - a.shots[2].rewoundTick).toBeLessThan(11.5);
  });

  it("lobby errors reach the page before any level is loaded", () => {
    const errors: number[] = [];
    const s = new ClientSession({ send: () => {}, now: () => 0, onError: (code) => errors.push(code) });
    s.handle(encodeError(ErrorCode.NoSuchRoom, "No room with code ABCDE"));
    expect(errors).toEqual([ErrorCode.NoSuchRoom]);
  });

  it("after a resync, players who left in the meantime are gone (no ghosts)", async () => {
    const h = await harness(["sledge", "mute", "fuze"]);
    const [a, , c] = h.clients;
    expect(a.session.remoteIds()).toHaveLength(2);
    // a's baselines are out (as after a checksum mismatch); while it waits, c leaves.
    (a.session as unknown as { awaitingReset: boolean }).awaitingReset = true;
    h.room.leave(c.id);
    h.clients.splice(2, 1);
    h.ticks(4);
    expect(a.session.remoteIds()).toHaveLength(2); // the removal was skipped
    h.room.onResync(a.id);
    h.ticks(4);
    expect(a.session.remoteIds()).toHaveLength(1);
    expect([...a.session.sim!.pawns.values()].filter((p) => p.proxy)).toHaveLength(1);
  });

  it("a lost resync request is sent again", async () => {
    const h = await harness(["sledge", "mute"]);
    const [a] = h.clients;
    (a.session as unknown as { awaitingReset: boolean }).awaitingReset = true;
    a.holdUp = true;
    h.ticks(80); // over a second
    expect(a.toServer.some((m) => m[0] === Msg.Resync)).toBe(true);
    a.holdUp = false;
    h.ticks(4);
    expect((a.session as unknown as { awaitingReset: boolean }).awaitingReset).toBe(false);
  });
});
