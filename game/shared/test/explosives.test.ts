// The Destruction Lab's explosive tools (Phase 4 M7, destruction/explosives.ts): each cuts its shape out of
// the panel you look at, by its rules (studs, steel only for hard charges, hatches and barricades), and in a
// room the cut reaches everyone; Reset walls puts every panel back and refills the pools.
import { describe, expect, it } from "vitest";
import { explosiveOps, L_BACK, L_CORE, L_FRONT, L_STEEL, Sim, type IndexedOp, type Vec3 } from "../src/index.js";
import { roomWith } from "./roomHarness.js";

const NORTH: Vec3 = [0, 0, -1];
const DOWN: Vec3 = [0, -1, 0];

async function lab() {
  const sim = await Sim.create("destruction_lab");
  const d = sim.data.destruction;
  const boom = (id: string, origin: Vec3, dir: Vec3, maxT = 50) => explosiveOps(sim.level.panels, d, d.explosives[id]!, origin, dir, maxT);
  const apply = (ops: IndexedOp[]) => ops.map(({ panel, op }) => sim.level.panels.apply(panel, op));
  const panel = (id: string) => sim.level.panels.byId.get(id)!.panel;
  return { sim, d, boom, apply, panel };
}
const holes = (cells: Uint8Array | null) => (cells ? cells.reduce((n, c) => n + (c ? 0 : 1), 0) : 0);

describe("explosives on panels", () => {
  it("a Breach Charge cuts its 1.0 × 1.8 m rectangle out of both skins and the studs, opening the wall to bodies", async () => {
    const { boom, apply, panel, d } = await lab();
    const ops = boom("breach_charge", [-12, 1.0, -5], NORTH);
    expect(ops.map((o) => (o.op.kind === "cut" ? o.op.layer : -1))).toEqual([L_FRONT, L_BACK, L_CORE]);
    const changes = apply(ops);
    expect(changes.some((c) => c.movementChanged)).toBe(true);
    const p = panel("soft_studs");
    const cells = (d.explosives.breach_charge!.shape === "rect" ? 1.0 * 1.8 : 0) / (p.cellU * p.cellV);
    expect(holes(p.layers[L_FRONT])).toBeGreaterThanOrEqual(cells - 1);
    expect(holes(p.layers[L_CORE]!)).toBeGreaterThan(0);
  });

  it("only the hard charges cut steel; to anything else a reinforced section is unbreakable", async () => {
    const { boom, apply, panel } = await lab();
    expect(boom("breach_charge", [11.5, 1.2, -5], NORTH)).toEqual([]);
    expect(boom("impact_grenade", [11.5, 1.2, -5], NORTH)).toEqual([]);
    const ops = boom("exothermic_charge", [11.5, 1.2, -5], NORTH);
    expect(ops.map((o) => (o.op.kind === "cut" ? [o.op.layer, o.op.hard] : null))).toEqual([
      [L_FRONT, true],
      [L_BACK, true],
      [L_CORE, true],
      [L_STEEL, true],
    ]);
    const before = holes(panel("reinforced").layers[L_STEEL]);
    apply(ops);
    expect(holes(panel("reinforced").layers[L_STEEL])).toBeGreaterThan(before + 100);
  });

  it("an Impact Grenade opens an unreinforced hatch; a reinforced one takes only the hard charges' damage", async () => {
    const { boom, apply, panel, sim } = await lab();
    apply(boom("impact_grenade", [10, 5, 8], DOWN));
    expect(panel("hatch").broken).toBe(true);
    sim.level.panels.reset(panel("hatch").spec.index);
    sim.level.panels.apply(panel("hatch").spec.index, { kind: "reinforce", section: 0, side: 1 });
    apply(boom("frag_grenade", [10, 5, 8], DOWN));
    expect(panel("hatch").broken).toBe(false);
    apply(boom("hard_breach_charge", [10, 4.6, 8], DOWN));
    expect(panel("hatch").broken).toBe(true);
  });

  it("any explosive breaks a barricade or a window; a soft floor only gets a hole", async () => {
    const { boom, apply, panel } = await lab();
    apply(boom("frag_grenade", [-10, 1.2, 9], NORTH));
    expect(panel("door_a").broken).toBe(true);
    apply(boom("nitro_cell", [-3, 1.5, 4], [0, 0, 1]));
    expect(panel("window_glass").broken).toBe(true);
    const changes = apply(boom("nitro_cell", [14.5, 5, 8], DOWN));
    expect(changes.some((c) => c.movementChanged)).toBe(false);
    expect(holes(panel("soft_floor").layers[L_FRONT])).toBeGreaterThan(0);
  });

  it("a charge needs the panel within 2 m; a throw reaches 20 m", async () => {
    const { boom } = await lab();
    expect(boom("breach_charge", [-12, 1.0, -2], NORTH)).toEqual([]);
    expect(boom("impact_grenade", [-12, 1.0, 5], NORTH).length).toBeGreaterThan(0); // 11 m, nothing in between
  });
});

describe("in a room", () => {
  it("an explosive id the data doesn't have (one every object has, like constructor) does nothing", async () => {
    const { room, clients, tick } = await roomWith("destruction_lab", ["sledge", "mute"]);
    for (let i = 0; i < 10; i++) tick();
    const [a, b] = clients;
    const hatch = room.sim.level.panels.byId.get("hatch")!.panel;
    room.onLabTool(a.id, { kind: "teleport", x: 10, y: 0, z: 8, yawDeg: 0 }); // under the hatch
    for (let i = 0; i < 10; i++) tick();
    const up = Math.PI / 2 - 0.01;
    for (const id of ["__proto__", "constructor", "toString", "hasOwnProperty"]) room.onLabTool(a.id, { kind: "explosive", id, yaw: 0, pitch: up });
    for (let i = 0; i < 4; i++) tick(); // a client that can't read an op would throw here
    expect(room.stats.panelOps).toBe(0);
    expect(hatch.hp).toBe(hatch.spec.hp);
    room.onLabTool(a.id, { kind: "explosive", id: "frag_grenade", yaw: 0, pitch: up });
    for (let i = 0; i < 4; i++) tick();
    expect(hatch.broken).toBe(true);
    for (const c of [a, b]) expect(c.session.sim!.level.panels.hash()).toBe(room.sim.level.panels.hash());
  });

  it("a throw stops at plain level geometry: through a hard wall, nothing", async () => {
    const { room, clients, tick } = await roomWith("destruction_lab", ["sledge"]);
    for (let i = 0; i < 10; i++) tick();
    const [a] = clients;
    const wall = room.sim.level.panels.byId.get("soft_studs")!.panel;
    room.onLabTool(a.id, { kind: "teleport", x: -12, y: 0, z: 10, yawDeg: 0 }); // the doors' hard wall 4 m ahead, the soft wall beyond
    for (let i = 0; i < 10; i++) tick();
    room.onLabTool(a.id, { kind: "explosive", id: "impact_grenade", yaw: 0, pitch: -0.05 });
    for (let i = 0; i < 4; i++) tick();
    expect(wall.modified).toBe(false);
    room.onLabTool(a.id, { kind: "teleport", x: -12, y: 0, z: 5, yawDeg: 0 }); // this side of it
    for (let i = 0; i < 10; i++) tick();
    room.onLabTool(a.id, { kind: "explosive", id: "impact_grenade", yaw: 0, pitch: -0.05 });
    for (let i = 0; i < 4; i++) tick();
    expect(wall.modified).toBe(true);
  });

  it("the lab tool's cut reaches everyone; Reset walls puts every panel back and refills the pools", async () => {
    const { room, clients, tick } = await roomWith("destruction_lab", ["sledge", "mute"]);
    for (let i = 0; i < 10; i++) tick();
    const [a, b] = clients;
    const fresh = room.sim.level.panels.hash();
    room.onLabTool(a.id, { kind: "teleport", x: -8, y: 0, z: -4.5, yawDeg: 0 });
    for (let i = 0; i < 10; i++) tick();
    room.onLabTool(a.id, { kind: "explosive", id: "breach_charge", yaw: 0, pitch: -0.3 });
    room.sim.deployRules.pools[1] = 3; // as if the defenders had reinforced
    for (let i = 0; i < 4; i++) tick();
    expect(room.sim.level.panels.byId.get("soft_plain")!.panel.modified).toBe(true);
    for (const c of [a, b]) expect(c.session.sim!.level.panels.hash()).toBe(room.sim.level.panels.hash());
    room.onLabTool(b.id, { kind: "resetPanels" });
    for (let i = 0; i < 4; i++) tick();
    expect(room.sim.level.panels.hash()).toBe(fresh);
    expect(room.sim.deployRules.pools).toEqual([10, 10]);
    for (const c of [a, b]) {
      expect(c.session.sim!.level.panels.hash()).toBe(fresh);
      expect(c.session.sim!.deployRules.pools).toEqual([10, 10]);
      expect(c.session.stats.panelMismatches).toBe(0);
    }
  });
});
