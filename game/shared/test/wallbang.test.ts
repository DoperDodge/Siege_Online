// Bullets and the knife through panels (Phase 4 M4, destruction/hits.ts, combat/hitreg.ts, net/room.ts):
// a bullet passes what it can break and makes holes as it goes, stops at steel, metal and studs it can't
// cut, goes through at most two walls, wears hatches, barricades and glass down, and is judged against the
// panels as its shooter had them. Bodies behind a wall take less damage; the knife punches a round hole.
import { describe, expect, it } from "vitest";
import {
  Btn,
  bulletDamage,
  ByteReader,
  ClientSession,
  decodeInput,
  decodeLabTool,
  DT,
  encodeLabTool,
  eyePose,
  L_BACK,
  L_CORE,
  L_FRONT,
  levelSchema,
  loadGameData,
  meleeOnPanels,
  Msg,
  PanelHistory,
  poseHitboxes,
  Room,
  Sim,
  Stance,
  bulletThroughPanels,
  type DestructionTier,
  type GameEvent,
  type InputCmd,
  type PanelHitRule,
  type PanelOp,
  type Vec3,
} from "../src/index.js";
import { roomWith } from "./roomHarness.js";

const data = loadGameData();
const d = data.destruction;
const tier = (name: DestructionTier): PanelHitRule => d.bullets.tiers[name]!;
const DOWN: Vec3 = [0, -1, 0];
const NORTH: Vec3 = [0, 0, -1];

/**
 * A yard of sample panels, each wall 3 m wide (x −1.5…1.5 about its centre) facing z: studs every 40 cm from
 * the −x edge, 5 cm wide (the first at x −1.10…−1.05 on a wall centred on 0), so x = 0 is between studs and
 * x = 0.125 is on one.
 */
async function yard() {
  const def = levelSchema.parse({
    id: "yard",
    name: "Yard",
    spawns: [{ id: "s", pos: [0, 0, 5], yawDeg: 0 }],
    solids: [
      { id: "floor", center: [0, -0.25, 0], size: [200, 0.5, 200], surface: "HARD_FLOOR" },
      { id: "w1", center: [0, 1.25, -5], size: [3, 2.5, 0.2], surface: "SOFT_WALL" },
      { id: "w2", center: [0, 1.25, -7], size: [3, 2.5, 0.2], surface: "SOFT_WALL" },
      { id: "w3", center: [0, 1.25, -9], size: [3, 2.5, 0.2], surface: "SOFT_WALL" },
      { id: "semi", center: [10, 1.25, -5], size: [3, 2.5, 0.2], surface: "SOFT_WALL", panel: { construction: "semi_wall" } },
      { id: "steel", center: [20, 1.25, -5], size: [3, 2.5, 0.2], surface: "REINFORCEABLE", panel: { reinforced: true, reinforcedFrom: "minus" } },
      { id: "glass", center: [30, 1.25, -5], size: [1.5, 1.2, 0.05], surface: "WINDOW" },
      { id: "hatch", center: [40, 1.0, -5], size: [1.6, 0.1, 1.6], surface: "HATCH" },
      { id: "deck", center: [50, 1.0, -5], size: [3, 0.1, 3], surface: "SOFT_FLOOR" },
    ],
  });
  const sim = await Sim.create("yard", { ...data, levels: new Map(data.levels).set("yard", def) });
  const index = (id: string) => sim.level.panels.byId.get(id)!.panel.spec.index;
  return { sim, index, through: (rule: PanelHitRule, origin: Vec3, dir: Vec3, maxT = 50, view?: { tick: number; history: PanelHistory }) => bulletThroughPanels(sim.level.panels, d, rule, origin, dir, maxT, view) };
}
const cutLayers = (ops: { op: PanelOp }[]) => ops.filter((o) => o.op.kind === "cut").map((o) => (o.op as Extract<PanelOp, { kind: "cut" }>).layer);

describe("a bullet through soft walls", () => {
  it("between studs: a hole in both skins, and on to whatever is next", async () => {
    const { through, index } = await yard();
    const p = through(tier("medium"), [0, 1.2, 0], NORTH, 6);
    expect(p.stop).toBeNull();
    expect(p.enters.map((t) => +t.toFixed(6))).toEqual([4.9]);
    expect(cutLayers(p.ops)).toEqual([L_BACK, L_FRONT]); // it comes from the +z side: the back skin first
    expect(p.ops.every((o) => o.panel === index("w1"))).toBe(true);
    // A medium bullet's 5 cm hole is the one cell it crosses.
    expect(p.ops[0].op).toMatchObject({ shape: { kind: "disc", r4: 2 } });
  });

  it("a stud stops a bullet whose tier can't cut it; buckshot cuts it up close, not beyond 5 m", async () => {
    const { through } = await yard();
    const onStud = (z: number, rule: PanelHitRule) => through(rule, [0.125, 1.2, z], NORTH, 6 + z);
    const medium = onStud(0, tier("medium"));
    expect(medium.stop).toBeCloseTo(4.92, 9);
    expect(cutLayers(medium.ops)).toEqual([L_BACK]);
    const close = onStud(-2, tier("full_close_range"));
    expect(close.stop).toBeNull();
    expect(cutLayers(close.ops)).toEqual([L_BACK, L_CORE, L_FRONT]);
    const far = onStud(2, tier("full_close_range"));
    expect(far.stop).toBeCloseTo(6.92, 9);
    expect(cutLayers(far.ops)).toEqual([L_BACK]);
    expect(cutLayers(onStud(2, tier("full")).ops)).toEqual([L_BACK, L_CORE, L_FRONT]); // full tier: any range
  });

  it("goes into at most two walls: the third stops it where it hits", async () => {
    const { through, index } = await yard();
    const p = through(tier("medium"), [0, 1.2, 0], NORTH, 50);
    expect(p.enters).toHaveLength(2);
    expect(p.stop).toBeCloseTo(8.9, 9);
    const last = p.ops[p.ops.length - 1];
    expect([last.panel, (last.op as Extract<PanelOp, { kind: "cut" }>).layer]).toEqual([index("w3"), L_BACK]);
  });

  it("metal studs stop every bullet; between them it passes", async () => {
    const { through } = await yard();
    expect(through(tier("explosive"), [10.125, 1.2, 0], NORTH, 6).stop).toBeCloseTo(4.92, 9);
    expect(through(tier("medium"), [10, 1.2, 0], NORTH, 6).stop).toBeNull();
  });

  it("steel stops it: from the far side after both skins, from the steel's side at once", async () => {
    const { through } = await yard();
    const far = through(tier("high"), [20, 1.2, 0], NORTH, 10);
    expect(cutLayers(far.ops)).toEqual([L_BACK, L_FRONT]);
    expect(far.stop).toBeCloseTo(5.1 - 0.001, 9); // the plate over the front skin
    const near = through(tier("explosive"), [20, 1.2, -10], [0, 0, 1], 10);
    expect([near.ops, near.stop]).toEqual([[], 4.9]);
  });
});

describe("breakable panels and floors", () => {
  it("glass breaks at any hit and the bullet goes on, a wall's worth of damage lost", async () => {
    const { through, sim, index } = await yard();
    const p = through(tier("low"), [30, 1.2, 0], NORTH, 10);
    expect([p.stop, p.enters.length, p.ops]).toEqual([null, 1, [{ t: expect.any(Number), panel: index("glass"), op: { kind: "damage", amount: 1, hard: false } }]]);
    expect(sim.level.panels.apply(index("glass"), p.ops[0].op).broke).toBe(true);
  });

  it("a hatch takes the tier's wear per bullet and a hole in each skin; a DMR opens it in 9", async () => {
    const { through, sim, index } = await yard();
    const p = through(tier("high"), [40.2, 3, -5], DOWN, 5);
    expect(p.ops[0].op).toEqual({ kind: "damage", amount: d.bullets.tiers.high!.hatchDamage, hard: false });
    expect(cutLayers(p.ops)).toEqual([L_BACK, L_FRONT]); // the top skin (+n is up) first
    // Each shot somewhere new (a bullet through an earlier hole touches nothing and wears nothing).
    let shots = 0;
    while (!sim.level.panels.list[index("hatch")].panel.broken && shots < 50) {
      const at: Vec3 = [39.4 + (shots % 4) * 0.35, 3, -5.5 + Math.floor(shots / 4) * 0.35];
      for (const { panel, op } of through(tier("high"), at, DOWN, 5).ops) sim.level.panels.apply(panel, op);
      shots++;
    }
    expect(shots).toBe(9);
  });

  it("a soft floor's metal joists stop bullets; between them they pass", async () => {
    const { through } = await yard();
    expect(through(tier("explosive"), [48.5 + 0.425, 3, -5], DOWN, 5).stop).toBeCloseTo(1.95 + 0.02, 9);
    expect(through(tier("low"), [48.5 + 0.2, 3, -5], DOWN, 5).stop).toBeNull();
  });
});

describe("judged as the shooter had the panels", () => {
  it("steel put up after the shooter's newest tick isn't there for that shot; a hole made since still costs damage", async () => {
    const { through, sim, index } = await yard();
    const history = new PanelHistory();
    const apply = (tick: number, i: number, op: PanelOp) => {
      const e = sim.level.panels.list[i];
      history.record(tick, i, e.panel.w * e.panel.h, sim.level.panels.apply(i, op));
    };
    // Section 0 of the steel wall is already reinforced (level); cut it away entirely at tick 10.
    apply(10, index("steel"), { kind: "cut", layer: 3, shape: { kind: "rect", u0: 0, v0: 0, u1: 30, v1: 60 }, hard: true });
    const origin: Vec3 = [19, 1.2, -10];
    expect(through(tier("medium"), origin, [0, 0, 1], 10).stop).toBeNull(); // now: no steel
    expect(through(tier("medium"), origin, [0, 0, 1], 10, { tick: 9, history }).stop).toBeCloseTo(4.9, 9); // as of tick 9: steel
    expect(through(tier("medium"), origin, [0, 0, 1], 10, { tick: 10, history }).stop).toBeNull();
    // A clean hole through w1 at tick 20: a later shooter who had it passes untouched; one who didn't loses damage.
    for (const layer of [L_FRONT, L_BACK]) apply(20, index("w1"), { kind: "cut", layer, shape: { kind: "rect", u0: 28, v0: 22, u1: 32, v1: 26 }, hard: false });
    const at: Vec3 = [0, 1.2, 0];
    expect(through(tier("medium"), at, NORTH, 6, { tick: 20, history }).enters).toEqual([]);
    expect(through(tier("medium"), at, NORTH, 6, { tick: 19, history }).enters).toHaveLength(1);
  });
});

describe("the knife on a panel", () => {
  it("punches a 25 cm hole through both skins between studs, one at a stud, nothing out of reach", async () => {
    const { sim, index } = await yard();
    const knife = (x: number, z: number) => meleeOnPanels(sim.level.panels, d, [x, 1.5, z], NORTH, data.combat.melee.reach, Infinity);
    const open = knife(0, -4)!;
    expect(cutLayers(open.ops)).toEqual([L_BACK, L_FRONT]);
    expect(open.ops[0].op).toMatchObject({ shape: { kind: "disc", r4: 10 } });
    expect(cutLayers(knife(0.125, -4)!.ops)).toEqual([L_BACK]);
    expect(knife(0, -3)).toBeNull();
    const hatch = meleeOnPanels(sim.level.panels, d, [40.2, 2.2, -5], DOWN, data.combat.melee.reach, Infinity)!;
    expect(hatch.ops[0].op).toEqual({ kind: "damage", amount: d.melee.hatchDamage, hard: false });
    // Ten hits open a hatch, each somewhere new.
    let hits = 0;
    while (!sim.level.panels.list[index("hatch")].panel.broken && hits < 50) {
      const at: Vec3 = [39.4 + (hits % 4) * 0.4, 2.2, -5.6 + Math.floor(hits / 4) * 0.4];
      for (const { panel, op } of meleeOnPanels(sim.level.panels, d, at, DOWN, data.combat.melee.reach, Infinity)?.ops ?? []) sim.level.panels.apply(panel, op);
      hits++;
    }
    expect(hits).toBe(10);
  });
});

describe("in a room", () => {
  it("a shot through the Range Lab's soft wall hits the dummy behind it for 70 % and leaves holes", async () => {
    const room = await Room.create("WALL1", "range_lab", { lab: true, seed: 9 });
    const clock = { t: 0 };
    const toServer: Uint8Array[] = [];
    const events: GameEvent[] = [];
    const session = new ClientSession({ send: (b) => toServer.push(b), now: () => clock.t, onEvents: (_t, evs) => events.push(...evs) });
    const id = room.join("shooter", { send: (b) => session.handle(b), buffered: () => 0 }, "sledge")!;
    await session.loaded();
    const tick = (cmd: Partial<Omit<InputCmd, "seq">> = {}) => {
      clock.t += DT * 1000;
      if (session.ready) session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...cmd });
      for (const b of toServer.splice(0)) {
        const r = new ByteReader(b.subarray(1));
        if (b[0] === Msg.Input) room.onInput(id, decodeInput(r));
        else if (b[0] === Msg.LabTool) room.onLabTool(id, decodeLabTool(r));
      }
      room.step();
    };
    for (let i = 0; i < 20; i++) tick();
    const dummy = room.roster().find((e) => e.kind === 1 && e.name === "Behind the wall")!;
    const target = room.sim.pawns.get(dummy.pawnIds[0])!;
    toServer.push(encodeLabTool({ kind: "teleport", x: -8, y: 0, z: 15, yawDeg: 0 }));
    for (let i = 0; i < 60; i++) tick({ buttons: Btn.Ads });
    const me = room.sim.pawns.get(session.ctrl!.possessedPawnId)!;
    const eye = eyePose(data.movement, data.hitboxes, me.state).pos;
    const torso = poseHitboxes(data.movement, data.hitboxes, target.state).find((h) => h.part === "torso")!;
    const c = torso.a.map((v, i) => (v + torso.b[i]) / 2);
    const aim = { yaw: Math.atan2(-(c[0] - eye[0]), -(c[2] - eye[2])), pitch: Math.atan2(c[1] - eye[1], Math.hypot(c[0] - eye[0], c[2] - eye[2])), buttons: Btn.Ads };
    for (let i = 0; i < 10; i++) tick(aim);
    const wall = room.sim.level.panels.byId.get("wallbang_wall")!.panel;
    expect(wall.modified).toBe(false);
    tick({ ...aim, buttons: Btn.Ads | Btn.Fire });
    for (let i = 0; i < 4; i++) tick(aim);
    const hits = events.filter((e) => e.kind === "hitConfirm");
    expect(hits).toHaveLength(1);
    const w = me.loadout!.weapons[me.state.slot];
    const dist = Math.hypot(c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]);
    const expected = bulletDamage(data.combat, w.damage!, dist, "torso", { mult: d.wallbang.damageMult });
    expect(hits[0]).toMatchObject({ victimPawn: target.id, zone: "torso", damage: (expected as { amount: number }).amount });
    expect(wall.modified).toBe(true);
    expect(room.stats.panelOps).toBeGreaterThanOrEqual(2);
    const holes = [L_FRONT, L_BACK].map((l) => wall.layers[l]!.reduce((n, x) => n + (x ? 0 : 1), 0));
    expect(holes.every((n) => n >= 1)).toBe(true);
  });

  it("a hole the shooter's client has is open for its shots, whichever tick it was made on (ops ride with snapshots)", async () => {
    for (const parity of [0, 1]) {
      const { room, clients, tick } = await roomWith("range_lab", ["sledge"]);
      const [a] = clients;
      for (let i = 0; i < 20; i++) tick();
      const target = room.sim.pawns.get(room.roster().find((e) => e.kind === 1 && e.name === "Behind the wall")!.pawnIds[0])!;
      room.onLabTool(a.id, { kind: "teleport", x: -8, y: 0, z: 15, yawDeg: 0 });
      a.cmd = { buttons: Btn.Ads };
      for (let i = 0; i < 60; i++) tick();
      const me = room.sim.pawns.get(a.session.ctrl!.possessedPawnId)!;
      const eye = eyePose(data.movement, data.hitboxes, me.state).pos;
      const torso = poseHitboxes(data.movement, data.hitboxes, target.state).find((h) => h.part === "torso")!;
      const c = torso.a.map((v, i) => (v + torso.b[i]) / 2);
      const aim = { yaw: Math.atan2(-(c[0] - eye[0]), -(c[2] - eye[2])), pitch: Math.atan2(c[1] - eye[1], Math.hypot(c[0] - eye[0], c[2] - eye[2])), buttons: Btn.Ads };
      a.cmd = aim;
      for (let i = 0; i < 10; i++) tick();
      while ((room.sim.tick + 1) % 2 !== parity) tick(); // the next tick, which applies the hole, is even or odd
      const wall = room.sim.level.panels.byId.get("wallbang_wall")!.panel;
      for (const layer of [L_FRONT, L_CORE, L_BACK]) room.queuePanelOp(wall.spec.index, { kind: "cut", layer, shape: { kind: "rect", u0: 15, v0: 5, u1: 45, v1: 45 }, hard: false });
      // Fire as soon as the client has the hole.
      while (!a.session.sim!.level.panels.list[wall.spec.index].panel.modified) tick();
      a.cmd = { ...aim, buttons: Btn.Ads | Btn.Fire };
      tick();
      a.cmd = aim;
      for (let i = 0; i < 4; i++) tick();
      const w = me.loadout!.weapons[me.state.slot];
      const full = bulletDamage(data.combat, w.damage!, Math.hypot(c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]), "torso", { mult: 1 }) as { amount: number };
      const hits = a.events.filter((e) => e.kind === "hitConfirm").map((e) => (e as Extract<GameEvent, { kind: "hitConfirm" }>).damage);
      expect(hits, parity ? "a hole made on an odd tick" : "on an even tick").toEqual([full.amount]);
    }
  });
});
