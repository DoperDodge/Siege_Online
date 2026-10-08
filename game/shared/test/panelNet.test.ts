// Destruction over the network (Phase 4 M5, net/panels.ts): panel ops round-trip exactly, every client ends
// with the server's panels (a hole made by one player's shots, a player who joins later, a client that fell
// out of step), and a body walks through a breach the server opened with its prediction holding.
import { describe, expect, it } from "vitest";
import {
  Btn,
  ByteReader,
  ClientSession,
  decodePanelOps,
  DT,
  encodeLabTool,
  encodePanelOps,
  L_BACK,
  L_CORE,
  L_FRONT,
  Msg,
  PROTOCOL_VERSION,
  Room,
  Stance,
  wireOp,
  handleRoomMessage,
  type GameEvent,
  type IndexedOp,
  type InputCmd,
  type PanelOp,
} from "../src/index.js";

describe("panel ops on the wire", () => {
  it("every kind of op round-trips exactly, with the tick and hash; cuts are whole 16-bit numbers", () => {
    const ops: IndexedOp[] = [
      { panel: 0, op: { kind: "cut", layer: L_BACK, shape: { kind: "disc", u4: 81, v4: -3, r4: 10 }, hard: false } },
      { panel: 3, op: { kind: "cut", layer: 3, shape: { kind: "rect", u0: -2, v0: 0, u1: 40, v1: 36 }, hard: true } },
      { panel: 1, op: { kind: "damage", amount: 0.35, hard: false } },
      { panel: 2, op: { kind: "damage", amount: 1_000_000, hard: true } },
      { panel: 2, op: { kind: "reinforce", section: 1, side: 1 } },
      { panel: 4, op: { kind: "barricade", up: true } },
    ];
    const bytes = encodePanelOps({ tick: 123456, ops, hash: 0xdeadbeef });
    expect(bytes[0]).toBe(Msg.PanelOps);
    const back = decodePanelOps(new ByteReader(bytes.subarray(1)), 5);
    expect(back).toEqual({ tick: 123456, ops, hash: 0xdeadbeef });
    expect(() => decodePanelOps(new ByteReader(bytes.subarray(1)), 4)).toThrow(/no such panel/);
    expect(wireOp({ kind: "cut", layer: L_FRONT, shape: { kind: "disc", u4: 1e9, v4: 2.4, r4: 4.6 }, hard: false })).toEqual({
      kind: "cut",
      layer: L_FRONT,
      shape: { kind: "disc", u4: 0x7fff, v4: 2, r4: 5 },
      hard: false,
    });
    expect(PROTOCOL_VERSION).toBe(8);
  });
});

/** A room and in-process clients at zero latency (the ClientSession code the page runs). */
async function roomWith(levelId: string, ops: string[]) {
  const room = await Room.create("WALLS", levelId, { lab: true, seed: 11 });
  const clock = { t: 0 };
  type Client = { session: ClientSession; id: number; toServer: Uint8Array[]; events: GameEvent[]; cmd: Partial<Omit<InputCmd, "seq">> };
  const clients: Client[] = [];
  const add = async (op: string) => {
    const toServer: Uint8Array[] = [];
    const events: GameEvent[] = [];
    const session = new ClientSession({ send: (b) => toServer.push(b), now: () => clock.t, onEvents: (_t, evs) => events.push(...evs), trackMispredictions: true });
    const id = room.join(`p${clients.length}`, { send: (b) => session.handle(b), buffered: () => 0 }, op)!;
    await session.loaded();
    const c: Client = { session, id, toServer, events, cmd: {} };
    clients.push(c);
    return c;
  };
  for (const op of ops) await add(op);
  const tick = () => {
    clock.t += DT * 1000;
    for (const c of clients) if (c.session.ready) c.session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...c.cmd });
    for (const c of clients)
      for (const b of c.toServer.splice(0)) {
        const r = new ByteReader(b.subarray(1));
        if (!handleRoomMessage(room, c.id, b[0], r)) throw new Error(`unexpected message ${b[0]}`);
      }
    room.step();
  };
  return { room, clients, add, tick };
}

describe("everyone ends with the server's panels", () => {
  it("one player's shots hole a wall: the other player and one who joins later have the same panels", async () => {
    const { room, clients, add, tick } = await roomWith("range_lab", ["sledge", "mute"]);
    for (let i = 0; i < 20; i++) tick();
    const [a, b] = clients;
    a.toServer.push(encodeLabTool({ kind: "teleport", x: -8.3, y: 0, z: 16, yawDeg: 0 }));
    for (let i = 0; i < 40; i++) tick();
    // Full auto into the soft wall, sweeping across it.
    for (let i = 0; i < 90; i++) {
      a.cmd = { yaw: Math.sin(i / 10) * 0.2, pitch: -0.05, buttons: Btn.Fire };
      tick();
    }
    a.cmd = {};
    for (let i = 0; i < 10; i++) tick();
    const server = room.sim.level.panels;
    const wall = server.byId.get("wallbang_wall")!.panel;
    expect(wall.modified).toBe(true);
    expect(room.stats.panelOps).toBeGreaterThan(20);
    for (const c of [a, b]) {
      expect(c.session.sim!.level.panels.hash()).toBe(server.hash());
      expect(c.session.stats.panelMismatches).toBe(0);
      expect(c.session.stats.panelOps).toBe(room.stats.panelOps);
    }
    const late = await add("thermite");
    for (let i = 0; i < 4; i++) tick();
    expect(late.session.stats.panelStates).toBe(1);
    expect(late.session.sim!.level.panels.hash()).toBe(server.hash());
    expect([...late.session.sim!.level.panels.byId.get("wallbang_wall")!.panel.layers[L_FRONT]!]).toEqual([...wall.layers[L_FRONT]!]);
    expect(room.stats.panelResyncs).toBe(0);
  });

  it("a client whose panels fell out of step asks once and gets the server's state back", async () => {
    const { room, clients, tick } = await roomWith("movement_lab", ["sledge"]);
    for (let i = 0; i < 10; i++) tick();
    const [a] = clients;
    // Something only this client did (a bug, a bad memory): its panels now differ.
    a.session.sim!.level.panels.apply(0, { kind: "cut", layer: L_FRONT, shape: { kind: "rect", u0: 0, v0: 0, u1: 10, v1: 10 }, hard: false });
    room.queuePanelOp(1, { kind: "cut", layer: L_BACK, shape: { kind: "disc", u4: 40, v4: 40, r4: 6 }, hard: false });
    for (let i = 0; i < 3; i++) tick();
    expect(a.session.stats.panelMismatches).toBe(1);
    expect(room.stats.panelResyncs).toBe(1);
    expect(a.session.stats.panelStates).toBe(2); // on joining, and now
    expect(a.session.sim!.level.panels.hash()).toBe(room.sim.level.panels.hash());
    expect(a.session.sim!.level.panels.list[0].panel.modified).toBe(false); // the stray hole is gone
  });
});

describe("walking through a breach the server opened", () => {
  it("the client moves through it with its prediction holding, and stands where the server has it", async () => {
    const { room, clients, tick } = await roomWith("movement_lab", ["sledge"]);
    for (let i = 0; i < 10; i++) tick();
    const [a] = clients;
    a.toServer.push(encodeLabTool({ kind: "teleport", x: -4.5, y: 0, z: 15.6, yawDeg: 180 }));
    for (let i = 0; i < 20; i++) tick();
    a.cmd = { forward: 1, yaw: Math.PI };
    for (let i = 0; i < 40; i++) tick(); // up against the wall
    const body = () => room.sim.pawns.get(a.session.ctrl!.possessedPawnId)!.state;
    expect(body().z).toBeLessThan(16.7);
    const before = a.session.stats.corrections;
    const breach: PanelOp[] = [L_FRONT, L_CORE, L_BACK].map((layer) => ({ kind: "cut", layer, shape: { kind: "rect", u0: 10, v0: 0, u1: 30, v1: 42 }, hard: false }));
    for (const op of breach) room.queuePanelOp(0, op);
    for (let i = 0; i < 90; i++) tick();
    expect(body().z).toBeGreaterThan(17.6);
    const predicted = a.session.sim!.pawns.get(a.session.ctrl!.possessedPawnId)!.state;
    expect(Math.hypot(predicted.x - body().x, predicted.z - body().z)).toBeLessThan(0.3); // a tick or two ahead, same path
    // The opening came as a surprise (the server pushed the body on before the client knew): at most one correction for it.
    expect(a.session.stats.corrections - before).toBeLessThanOrEqual(1);
  });
});
