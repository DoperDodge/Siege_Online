// Quick Match's pre-setups (match/preSetup.ts, match/DESIGN.md §9) on Oregon: each site's walls reinforced from the
// side of the room the data names (a hatch from its top), and its rotation holes cut so that bodies get through them.
import { describe, expect, it } from "vitest";
import { Btn, preSetupOps, Sim, Stance, type PanelEntry } from "../src/index.js";
import { input, run, teleport } from "./helpers.js";

/** Is (x, z) on a room's floor? */
const inRoom = (sim: Sim, id: string, x: number, z: number) =>
  sim.level.def.rooms.find((r) => r.id === id)!.rects.some(([x0, z0, x1, z1]) => x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1));

/** A point `d` metres off a panel's face on `side` (0: −n, 1: +n), at its middle. */
const offFace = (e: PanelEntry, side: number, d: number): [number, number] => {
  const k = (side ? 1 : -1) * (e.frame.t / 2 + d);
  return [e.frame.center[0] + e.frame.n[0] * k, e.frame.center[2] + e.frame.n[2] * k];
};

describe("Quick Match pre-setups (match/DESIGN.md §9)", () => {
  it("every Oregon site has one: its walls get steel on every section facing their room, a hatch from its top, and each hole is clear for a body", async () => {
    const sim = await Sim.create("oregon");
    const d = sim.data.destruction;
    for (const site of sim.level.def.sites) {
      for (const e of sim.level.panels.list) if (e.panel.modified) sim.level.panels.reset(e.panel.spec.index);
      const pre = site.preSetup!;
      expect(pre.reinforce.length, site.id).toBe(2);
      const ops = preSetupOps(sim.level.def, sim.level.panels, d, site.id);
      for (const o of ops) sim.level.panels.apply(o.panel, o.op);
      for (const r of pre.reinforce) {
        const e = sim.level.panels.byId.get(r.panel)!;
        const all = (1 << e.panel.sectionCount) - 1;
        expect(e.panel.reinforced, `${site.id} ${r.panel}`).toBe(all);
        if (e.panel.kind === "hatch") expect(e.panel.steelSides, r.panel).toBe(1);
        else {
          // Every section's steel went up from one side, and the room named is on it.
          expect([0, all], r.panel).toContain(e.panel.steelSides);
          expect(inRoom(sim, r.from!, ...offFace(e, e.panel.steelSides ? 1 : 0, 0.3)), `${r.panel} faces ${r.from}`).toBe(true);
        }
      }
      for (const h of pre.holes) {
        const e = sim.level.panels.byId.get(h.panel)!;
        const size = d.rotationHoles[h.size];
        // No box a body collides with is left inside the opening (its edges in whole 10 cm cells).
        const [u0, u1] = [e.frame.w / 2 - size.widthM / 2 + 0.1, e.frame.w / 2 + size.widthM / 2 - 0.1];
        const [v0, v1] = [size.bottomM + 0.1, size.topM - 0.1];
        const blocked = e.panel.movementRects().filter((m) => m.u0 < u1 && m.u1 > u0 && m.v0 < v1 && m.v1 > v0);
        expect(blocked, `${site.id} ${h.panel}`).toEqual([]);
      }
      // Steel on each section of each wall, three layers cut per hole.
      const sections = pre.reinforce.reduce((n, r) => n + sim.level.panels.byId.get(r.panel)!.panel.sectionCount, 0);
      expect(ops.length, site.id).toBe(sections + 3 * pre.holes.length);
    }
  });

  it("a body vaults through a vault hole (Dining → Kitchen) and walks crouched through a crouch hole (Supply → Laundry); without them the wall stops it", async () => {
    const sim = await Sim.create("oregon");
    const ctrl = sim.addPlayer("tester", "sledge");
    const p = sim.pawns.get(ctrl.possessedPawnId)!;
    // SW-1F-05 runs along z at x 20.35; the Dining is west of it. Facing east (yaw −90°), Space vaults through.
    const vaultWall = sim.level.panels.byId.get("SW-1F-05")!.frame.center;
    const vault = () => {
      teleport(sim, ctrl, vaultWall[0] - 0.65, 0, vaultWall[2], -90);
      sim.step(new Map([[ctrl.id, input({ yawDeg: -90, buttons: Btn.Vault })]]));
      run(sim, ctrl, { yawDeg: -90 }, 1.5);
      return inRoom(sim, "1F_KITCHEN", p.state.x, p.state.z) && p.state.x > vaultWall[0] + 0.3;
    };
    // SW-B-06 runs along x at z 30.3; the Supply Room's strip is north of it. Crouched, facing south (180°), walk through.
    const crouchWall = sim.level.panels.byId.get("SW-B-06")!.frame.center;
    const crouch = () => {
      teleport(sim, ctrl, crouchWall[0], -3.2, crouchWall[2] - 0.6, 180, Stance.Crouch);
      run(sim, ctrl, { yawDeg: 180, forward: 1, stance: Stance.Crouch }, 1.5);
      return inRoom(sim, "B_LAUNDRY", p.state.x, p.state.z) && p.state.z > crouchWall[2] + 0.4;
    };
    expect([vault(), crouch()]).toEqual([false, false]);
    for (const id of ["SITE_DINING", "SITE_LAUNDRY"]) for (const o of preSetupOps(sim.level.def, sim.level.panels, sim.data.destruction, id)) sim.level.panels.apply(o.panel, o.op);
    expect([vault(), crouch()]).toEqual([true, true]);
  });
});
