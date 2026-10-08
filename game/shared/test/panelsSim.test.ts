// Panels in the simulation (Phase 4 M3, destruction/panels.ts, level/raycast.ts): an intact panel collides
// exactly like the box it replaced, rays stop at a panel's first cell with material, a hole big enough lets
// a body through, floors that are never passable stay solid, and a broken hatch drops whoever stands on it.
import { describe, expect, it } from "vitest";
import { buildLevel, L_BACK, L_CORE, L_FRONT, levelSchema, loadGameData, PawnMode, raycastLevel, Sim, Stance, type PanelOp, type Vec3 } from "../src/index.js";
import { input, run, settle, teleport } from "./helpers.js";

const cutAll = (u0: number, v0: number, u1: number, v1: number): PanelOp[] =>
  [L_FRONT, L_CORE, L_BACK].map((layer) => ({ kind: "cut", layer, shape: { kind: "rect", u0, v0, u1, v1 }, hard: false }));

describe("panels in the level", () => {
  it("an intact panel's box is the very collider the plain level builds, in the same place in the order", async () => {
    const sim = await Sim.create("movement_lab");
    const world = new sim.R.World({ x: 0, y: -9.81, z: 0 });
    const plain = buildLevel(sim.R, world, sim.level.def);
    expect(plain.panels.list.length).toBe(0);
    expect(sim.level.panels.list.map((e) => e.info.id)).toEqual(["sample_soft", "sample_reinforceable", "sample_hatch"]);
    for (const e of sim.level.panels.list) {
      expect(e.colliders.length, e.info.id).toBe(1);
      const c = e.colliders[0];
      const p = world.getCollider(c.handle);
      expect(plain.solids.get(c.handle)?.id).toBe(e.info.id);
      expect([c.translation(), c.rotation(), c.halfExtents()]).toEqual([p.translation(), p.rotation(), p.halfExtents()]);
      expect(sim.level.solids.get(c.handle)).toEqual(plain.solids.get(c.handle));
    }
    expect(sim.level.renderables.filter((r) => r.kind === "panel").map((r) => [r.id, r.panel])).toEqual([
      ["sample_soft", 0],
      ["sample_reinforceable", 1],
      ["sample_hatch", 2],
    ]);
  });

  it("a ray stops where it enters the first skin on either side, and goes on through a hole in every layer", async () => {
    const sim = await Sim.create("movement_lab");
    const front = raycastLevel(sim, [-4.5, 1.2, 15], [0, 0, 1], 50)!;
    expect(front.t).toBeCloseTo(1.9, 9);
    expect(front.normal.map((x) => x + 0)).toEqual([0, 0, -1]);
    expect([front.panel?.entry.info.id, front.panel?.crossing.layer]).toEqual(["sample_soft", L_FRONT]);
    const back = raycastLevel(sim, [-4.5, 1.2, 19], [0, 0, -1], 50)!;
    expect(back.t).toBeCloseTo(1.9, 9);
    expect(back.normal.map((x) => x + 0)).toEqual([0, 0, 1]);
    expect(back.panel?.crossing.layer).toBe(L_BACK);
    // Cut both skins around the ray, between two studs: it passes on to the far yard wall.
    const p = sim.level.panels.byId.get("sample_soft")!;
    const { u, v } = front.panel!.crossing;
    for (const op of cutAll(u - 1, v - 1, u + 2, v + 2)) sim.level.panels.apply(p.panel.spec.index, op);
    const through = raycastLevel(sim, [-4.5, 1.2, 15], [0, 0, 1], 50)!;
    expect(through.panel).toBeNull();
    expect(through.t).toBeCloseTo(32 - 0.25 - 15, 5);
    // A stud stops a ray the skins let through.
    const stud = 8; // the first stud's cells start 0.375 m in
    expect(p.panel.solid(L_CORE, stud, v)).toBe(true);
    for (const op of cutAll(stud - 1, v - 1, stud + 2, v + 2).filter((o) => o.kind === "cut" && o.layer !== L_CORE)) sim.level.panels.apply(0, op);
    const x = p.frame.center[0] - p.frame.w / 2 + (stud + 0.5) * p.panel.cellU;
    const atStud = raycastLevel(sim, [x, 1.2, 15], [0, 0, 1], 50)!;
    expect(atStud.panel?.crossing.layer).toBe(L_CORE);
    expect(atStud.t).toBeCloseTo(1.92, 9); // the core starts behind the 2 cm skin
  });

  it("a body walks into an intact wall and stops; through a breach-sized hole it walks on", async () => {
    const sim = await Sim.create("movement_lab");
    const ctrl = sim.addPlayer("tester", "sledge");
    settle(sim, ctrl);
    teleport(sim, ctrl, -4.5, 0, 15.5, 180);
    run(sim, ctrl, { forward: 1, yawDeg: 180 }, 2);
    const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
    expect(pawn.state.z).toBeLessThan(16.9 - 0.25);
    expect(pawn.state.z).toBeGreaterThan(16.3);
    // A 1 m × 2.1 m opening: cells 10–30 across, 0–42 up.
    const e = sim.level.panels.byId.get("sample_soft")!;
    let changed = false;
    for (const op of cutAll(10, 0, 30, 42)) changed = sim.level.panels.apply(e.panel.spec.index, op).movementChanged || changed;
    expect(changed).toBe(true);
    expect(e.colliders.length).toBeGreaterThan(1);
    for (const c of e.colliders) expect(sim.level.solids.get(c.handle)?.id).toBe("sample_soft");
    run(sim, ctrl, { forward: 1, yawDeg: 180 }, 2);
    expect(pawn.state.z).toBeGreaterThan(17.6);
    expect(pawn.state.mode).toBe(PawnMode.Walk);
  });

  it("the same ops on two sims at the same tick keep a body walking through the hole bit-identical", async () => {
    const make = async () => {
      const sim = await Sim.create("movement_lab");
      const ctrl = sim.addPlayer("tester", "brava");
      sim.teleport(ctrl.possessedPawnId, -4.2, 0, 15.6, 180);
      return { sim, ctrl };
    };
    const [A, B] = [await make(), await make()];
    for (let t = 0; t < 300; t++) {
      if (t === 40 || t === 90) for (const s of [A, B]) for (const op of cutAll(8 + t / 10, 0, 28 + t / 10, 44)) s.sim.level.panels.apply(0, op);
      const cmd = input({ forward: 1, strafe: t % 50 < 25 ? 0.3 : -0.3, yawDeg: 180, stance: t > 200 ? Stance.Crouch : Stance.Stand });
      A.sim.step(new Map([[A.ctrl.id, cmd]]));
      B.sim.step(new Map([[B.ctrl.id, cmd]]));
      expect(B.sim.pawns.get(B.ctrl.possessedPawnId)!.state, `tick ${t}`).toEqual(A.sim.pawns.get(A.ctrl.possessedPawnId)!.state);
    }
    expect(A.sim.level.panels.hash()).toBe(B.sim.level.panels.hash());
    expect(A.sim.pawns.get(A.ctrl.possessedPawnId)!.state.z).toBeGreaterThan(17.5);
  });
});

describe("floors and hatches", () => {
  /** A yard with a soft floor and a hatch standing 2 m up, nothing under them but the ground. */
  async function deck() {
    const data = loadGameData();
    const lab = data.levels.get("movement_lab")!;
    const deckLevel = levelSchema.parse({
      ...lab,
      id: "deck",
      solids: [
        ...lab.solids,
        { id: "soft_deck", center: [10, 1.95, 0], size: [2, 0.1, 2], surface: "SOFT_FLOOR" },
        { id: "hatch_deck", center: [14, 1.95, 0], size: [1.6, 0.1, 1.6], surface: "HATCH" },
      ],
    });
    const sim = await Sim.create("deck", { ...data, levels: new Map(data.levels).set("deck", deckLevel) });
    const ctrl = sim.addPlayer("tester", "sledge");
    settle(sim, ctrl);
    return { sim, ctrl, pawn: sim.pawns.get(ctrl.possessedPawnId)! };
  }

  it("a soft floor shot through every layer still holds you (never passable)", async () => {
    const { sim, ctrl, pawn } = await deck();
    teleport(sim, ctrl, 10, 2.0, 0);
    const e = sim.level.panels.byId.get("soft_deck")!;
    for (const op of cutAll(10, 10, 30, 30)) expect(sim.level.panels.apply(e.panel.spec.index, op).movementChanged).toBe(false);
    run(sim, ctrl, {}, 1);
    expect(pawn.state.y).toBeCloseTo(2.0, 1);
    // And sight goes through the hole.
    const down: Vec3 = [0, -1, 0];
    expect(raycastLevel(sim, [10, 2.5, 0], down, 5)!.panel).toBeNull();
  });

  it("a hatch holds you until it breaks, then you drop through", async () => {
    const { sim, ctrl, pawn } = await deck();
    teleport(sim, ctrl, 14, 2.0, 0);
    run(sim, ctrl, {}, 0.5);
    expect(pawn.state.y).toBeCloseTo(2.0, 1);
    const e = sim.level.panels.byId.get("hatch_deck")!;
    expect(sim.level.panels.apply(e.panel.spec.index, { kind: "damage", amount: 60, hard: false }).movementChanged).toBe(false);
    run(sim, ctrl, {}, 0.25);
    expect(pawn.state.y).toBeCloseTo(2.0, 1);
    const change = sim.level.panels.apply(e.panel.spec.index, { kind: "damage", amount: 60, hard: false });
    expect([change.broke, change.movementChanged, e.colliders.length]).toEqual([true, true, 0]);
    run(sim, ctrl, {}, 1.5);
    expect(pawn.state.y).toBeLessThan(0.05);
    expect(raycastLevel(sim, [14, 2.5, 0], [0, -1, 0], 5)!.panel).toBeNull();
  });
});
