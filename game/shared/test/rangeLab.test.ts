// The Range Lab (Phase 3 M10, DECISIONS D-052): its level, the scripted dummies, and how a room hosts them.
import { describe, expect, it } from "vitest";
import {
  Btn,
  ByteReader,
  capsuleFree,
  ClientSession,
  decodeInput,
  decodeLabTool,
  DT,
  dummyInput,
  DUMMY_STANCE,
  encodeLabTool,
  fnv1a,
  loadGameData,
  Msg,
  PawnMode,
  QUERY_STATIC,
  Room,
  Sim,
  Stance,
  TICK_HZ,
  writePawnState,
  ByteWriter,
  type GameEvent,
  type InputCmd,
  type MoveContext,
} from "../src/index.js";

const data = loadGameData();
const level = data.levels.get("range_lab")!;
const FIRING_LINE_Z = 20;
const dummyDef = (id: string) => level.dummies.find((d) => d.id === id)!;

describe("the Range Lab level", () => {
  it("every dummy's spot is clear of the level, and every distance says how far it is from the firing line", async () => {
    const sim = await Sim.create("range_lab");
    sim.step(new Map());
    const ctx = { R: sim.R, world: sim.world, data, level: sim.level, events: [] } as unknown as MoveContext;
    for (const d of level.dummies) expect(capsuleFree(ctx, null, d.pos[0], d.pos[1] + 0.02, d.pos[2], data.movement.stance.stand.height, QUERY_STATIC), d.id).toBe(true);
    const labelled = [...level.solids.map((s) => ({ label: s.label ?? "", z: s.center[2] })), ...level.markers.map((m) => ({ label: m.label, z: m.pos[2] }))];
    const distances = labelled.filter((l) => /^\d+ m$/.test(l.label));
    expect(distances.length).toBeGreaterThanOrEqual(13); // 5–50 m every 5 m, and the 13, 18 and 28 m posts
    for (const l of distances) expect(FIRING_LINE_Z - l.z, l.label).toBeCloseTo(parseInt(l.label), 6);
    for (const d of level.dummies.filter((d) => d.id.startsWith("lane_"))) expect(FIRING_LINE_Z - d.pos[2]).toBeCloseTo(parseInt(d.id.slice(5)), 6);
    expect(new Set(distances.map((l) => l.label))).toEqual(new Set(["5 m", "10 m", "13 m", "15 m", "18 m", "20 m", "25 m", "28 m", "30 m", "35 m", "40 m", "45 m", "50 m"]));
  });
});

describe("dummy scripts", () => {
  it("are pure: the same tick, body and definition give the same input", async () => {
    const sim = await Sim.create("range_lab");
    const s = sim.addPlayer("d", "mute");
    const state = sim.pawns.get(s.possessedPawnId)!.state;
    for (const d of level.dummies) for (const t of [0, 77, 1000]) expect(dummyInput(t, state, d)).toEqual(dummyInput(t, { ...state }, d));
  });

  it("in a room: static ones hold their spot and stance, the strafer walks its span, the peeker leans both ways", async () => {
    const room = await Room.create("RANGE", "range_lab", { lab: true, seed: 3 });
    const pawnOf = (id: string) => [...room.sim.pawns.values()].find((p) => room.roster().find((e) => e.name === (dummyDef(id).name ?? id))?.pawnIds.includes(p.id))!;
    const xs: number[] = [];
    const leans = new Set<number>();
    for (let t = 0; t < 8 * TICK_HZ; t++) {
      room.step();
      xs.push(pawnOf("strafe").state.x);
      leans.add(Math.sign(Math.round(pawnOf("peek").state.lean * 10)));
    }
    for (const id of ["lane_05", "lane_50", "row_crouch", "row_prone", "row_lean_r", "doorway"]) {
      const d = dummyDef(id);
      const s = pawnOf(id).state;
      expect(Math.hypot(s.x - d.pos[0], s.z - d.pos[2]), id).toBeLessThan(0.05);
      expect([s.stance, s.mode], id).toEqual([DUMMY_STANCE[d.stance], PawnMode.Walk]);
      if (d.lean) expect(s.lean * d.lean, id).toBeGreaterThan(0.99);
    }
    const strafe = dummyDef("strafe");
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(strafe.span * 0.8);
    expect(Math.max(...xs.map((x) => Math.abs(x - strafe.pos[0])))).toBeLessThan(strafe.span / 2 + 0.5);
    expect(leans).toEqual(new Set([-1, 0, 1]));
    // The one on the revive pad starts down (and stays down: nobody is reviving it).
    expect(pawnOf("revive").state.mode).toBe(PawnMode.Downed);
    expect(room.roster().filter((e) => e.kind === 1)).toHaveLength(level.dummies.length);
  });
});

/** Every pawn's exact state, hashed. */
const worldHash = (room: Room) => {
  const w = new ByteWriter(4096);
  for (const p of [...room.sim.pawns.values()].sort((a, b) => a.id - b.id)) writePawnState(w, p.state);
  return fnv1a(w.finish());
};

describe("a room with dummies", () => {
  it("two rooms with the same seed and the same lab tools stay identical for 2000 ticks, deaths and respawns included", async () => {
    const make = async () => {
      const room = await Room.create("SAME1", "range_lab", { lab: true, seed: 42 });
      const sent: Uint8Array[] = [];
      const id = room.join("p", { send: (b) => sent.push(b), buffered: () => 0 })!;
      return { room, sent, id };
    };
    const [a, b] = [await make(), await make()];
    const targets = [...a.room.sim.pawns.values()].filter((p) => a.room.roster().some((e) => e.kind === 1 && e.pawnIds.includes(p.id))).map((p) => p.id);
    let deaths = 0;
    for (let t = 0; t < 2000; t++) {
      if (t % 150 === 0) {
        const tool = { kind: "damage" as const, pawnId: targets[(t / 150) % targets.length], amount: 500, kill: false };
        a.room.onLabTool(a.id, tool);
        b.room.onLabTool(b.id, tool);
      }
      if (t === 1500) for (const r of [a, b]) r.room.onLabTool(r.id, { kind: "resetDummies" });
      a.room.step();
      b.room.step();
      deaths += [...a.room.sim.pawns.values()].filter((p) => p.state.mode === PawnMode.Dead).length;
      if (t % 50 === 0) expect(worldHash(a.room), `tick ${t}`).toBe(worldHash(b.room));
    }
    expect(deaths).toBeGreaterThan(0);
    expect(worldHash(a.room)).toBe(worldHash(b.room));
    // Byte for byte the same messages to the player in both rooms.
    expect(a.sent.length).toBe(b.sent.length);
    expect(fnv1a(new Uint8Array(a.sent.flatMap((m) => [...m])))).toBe(fnv1a(new Uint8Array(b.sent.flatMap((m) => [...m]))));
  });

  it("a shot on a dummy: the hit goes to the shooter only, no one is told of damage taken, the kill goes to everyone; 3 s later it's back", async () => {
    // Two players, Room and ClientSessions in one process (zero latency).
    const room = await Room.create("SHOT1", "range_lab", { lab: true, seed: 5 });
    const clock = { t: 0 };
    const clients = ["sledge", "thermite"].map((op, i) => {
      const toServer: Uint8Array[] = [];
      const events: GameEvent[] = [];
      const session = new ClientSession({ send: (b) => toServer.push(b), now: () => clock.t, onEvents: (_t, evs) => events.push(...evs) });
      const id = room.join(`p${i}`, { send: (b) => session.handle(b), buffered: () => 0 }, op)!;
      return { session, id, toServer, events };
    });
    await Promise.all(clients.map((c) => c.session.loaded()));
    const tick = (cmds: Partial<Omit<InputCmd, "seq">>[] = []) => {
      clock.t += DT * 1000;
      clients.forEach((c, i) => c.session.ready && c.session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...cmds[i] }));
      for (const c of clients)
        for (const b of c.toServer.splice(0)) {
          const r = new ByteReader(b.subarray(1));
          if (b[0] === Msg.Input) room.onInput(c.id, decodeInput(r));
          else if (b[0] === Msg.LabTool) room.onLabTool(c.id, decodeLabTool(r));
        }
      room.step();
    };
    for (let i = 0; i < 20; i++) tick();
    // A stands 5 m in front of the 5 m dummy (lane_05 at x −1.5, z 15) and aims at its head.
    const lane = dummyDef("lane_05");
    const target = room.roster().find((e) => e.kind === 1 && e.name === lane.name)!;
    const pawnId = target.pawnIds[0];
    clients[0].toServer.push(encodeLabTool({ kind: "teleport", x: lane.pos[0], y: 0, z: lane.pos[2] + 5, yawDeg: 0 }));
    for (let i = 0; i < 60; i++) tick([{ buttons: Btn.Ads }]);
    const aim = { yaw: 0, pitch: 0, buttons: Btn.Ads };
    tick([{ ...aim, buttons: Btn.Ads | Btn.Fire }]);
    for (let i = 0; i < 4; i++) tick([aim]);
    const [a, b] = clients;
    const hits = a.events.filter((e) => e.kind === "hitConfirm");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ victimPawn: pawnId, headshot: true, killed: true });
    expect(b.events.filter((e) => e.kind === "hitConfirm")).toHaveLength(0);
    expect([...a.events, ...b.events].filter((e) => e.kind === "damageTaken")).toHaveLength(0);
    for (const c of clients) expect(c.events.filter((e) => e.kind === "kill")).toEqual([expect.objectContaining({ victimPawn: pawnId, victimCtrl: target.controllerId, headshot: true })]);
    // The body lies there for dummyRespawnS, then stands on its spot again: the same pawn, a new life.
    const life = room.sim.pawns.get(pawnId)!.life;
    for (let i = 0; i < data.modes.get("lab")!.dummyRespawnS * TICK_HZ - 10; i++) tick();
    expect(room.sim.pawns.get(pawnId)!.state.mode).toBe(PawnMode.Dead);
    for (let i = 0; i < 20; i++) tick();
    const back = room.sim.pawns.get(pawnId)!;
    expect(back.state.mode).toBe(PawnMode.Walk);
    expect(back.state.hp).toBe(back.state.maxHp);
    expect(back.life).toBe(life + 1);
    expect(Math.hypot(back.state.x - lane.pos[0], back.state.z - lane.pos[2])).toBeLessThan(0.05);
    // Everyone's roster lists the dummies (kind 1) by name.
    expect(b.session.roster.filter((e) => e.kind === 1).map((e) => e.name)).toContain(lane.name);
  });
});

