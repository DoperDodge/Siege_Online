// The broad-phase refresh (physics/rapier.ts) runs Rapier's physics pipeline directly instead of
// world.step(), which also re-maps every handle (DECISIONS D-073). Bodies must move exactly as they did with
// world.step(), and queries must still see colliders the moment they are added, moved or removed. Re-run
// on any Rapier upgrade: the refresh relies on 0.21's World fields.
import { describe, expect, it } from "vitest";
import { Btn, hashPawnState, L_BACK, L_CORE, L_FRONT, refreshBroadPhase, Sim, Stance, STATIC_GROUPS, type InputCmd, type PanelOp, type World } from "../src/index.js";
import { input } from "./helpers.js";

/**
 * Make this world's refresh call Rapier's own world.step() instead, whatever it does in this version: the
 * baseline the direct pipeline call is held to.
 */
function useWorldStep(world: World): { steps: number } {
  const pipeline = world.physicsPipeline;
  const direct = pipeline.step;
  const count = { steps: 0 };
  const viaWorld = () => {
    pipeline.step = direct; // world.step() runs the real pipeline step, not this
    try {
      world.step();
    } finally {
      pipeline.step = viaWorld;
    }
    count.steps++;
  };
  pipeline.step = viaWorld;
  return count;
}

/** Two bodies walk, sprint, vault and crouch into walls and through a cut wall; one leaves and comes back. */
async function script(stock: boolean): Promise<{ hashes: number[]; travelled: number; steps: number }> {
  const sim = await Sim.create("movement_lab");
  const count = stock ? useWorldStep(sim.world) : { steps: 0 };
  const a = sim.addPlayer("a", "sledge");
  let b = sim.addPlayer("b", "thermite");
  const hashes: number[] = [];
  const start = sim.pawns.get(a.possessedPawnId)!.state;
  const [x0, z0] = [start.x, start.z];
  const cut: PanelOp[] = [L_FRONT, L_CORE, L_BACK].map((layer) => ({ kind: "cut", layer, shape: { kind: "rect", u0: 4, v0: 0, u1: 36, v1: 48 }, hard: false }));
  for (let t = 0; t < 640; t++) {
    if (t === 120) for (const op of cut) sim.level.panels.apply(sim.level.panels.byId.get("sample_soft")!.panel.spec.index, op);
    if (t === 300) sim.removePlayer(b.id);
    if (t === 340) b = sim.addPlayer("b2", "thermite");
    const yaw = t < 200 ? 15 : t < 400 ? 180 : -60;
    const cmd = (p: Partial<InputCmd> & { yawDeg?: number }) => input(p);
    sim.step(
      new Map([
        [a.id, cmd({ forward: 1, yawDeg: yaw, buttons: t % 160 < 60 ? Btn.Sprint : t % 90 === 30 ? Btn.Vault : 0 })],
        [b.id, cmd({ forward: 1, strafe: t % 120 < 60 ? 1 : -1, yawDeg: -yaw, stance: t % 200 < 80 ? Stance.Crouch : Stance.Stand })],
      ]),
    );
    for (const id of [...sim.pawns.keys()].sort((p, q) => p - q)) hashes.push(id, hashPawnState(sim.pawns.get(id)!.state));
  }
  const end = sim.pawns.get(a.possessedPawnId)!.state;
  return { hashes, travelled: Math.hypot(end.x - x0, end.z - z0), steps: count.steps };
}

describe("broad-phase refresh", () => {
  it("moves bodies exactly as world.step() does, through cuts, leaves and joins", async () => {
    const fast = await script(false);
    const stock = await script(true);
    expect(fast.travelled).toBeGreaterThan(3);
    expect(stock.steps).toBeGreaterThan(640);
    expect(fast.hashes.length).toBe(stock.hashes.length);
    expect(fast.hashes).toEqual(stock.hashes);
  });

  it("queries see a collider as soon as it is added, moved or removed", async () => {
    const sim = await Sim.create("movement_lab");
    const { R, world } = sim;
    const down = (x: number) => world.castRay(new R.Ray({ x, y: 9, z: 25 }, { x: 0, y: -1, z: 0 }), 20, true, undefined, STATIC_GROUPS);
    expect(down(-20)?.timeOfImpact).toBeCloseTo(9, 6); // the floor
    const box = world.createCollider(R.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(-20, 3, 25).setCollisionGroups(STATIC_GROUPS));
    refreshBroadPhase(world);
    expect(down(-20)?.timeOfImpact).toBeCloseTo(5.5, 6);
    box.setTranslation({ x: 20, y: 3, z: 25 });
    refreshBroadPhase(world);
    expect(down(-20)?.timeOfImpact).toBeCloseTo(9, 6);
    expect(down(20)?.timeOfImpact).toBeCloseTo(5.5, 6);
    world.removeCollider(box, false);
    refreshBroadPhase(world);
    expect(down(20)?.timeOfImpact).toBeCloseTo(9, 6);
    // Every collider in the engine (the WASM set) has its wrapper, and no wrapper outlives its collider. (Rapier's
    // binding swallows an error thrown inside the callback, so the handles are collected and checked after it.)
    const raw = (world.colliders as unknown as { raw: { len(): number; forEachColliderHandle(f: (h: number) => void): void } }).raw;
    expect(world.colliders.len()).toBe(raw.len());
    const unwrapped: number[] = [];
    raw.forEachColliderHandle((h) => {
      if (!world.colliders.get(h)) unwrapped.push(h);
    });
    expect(unwrapped).toEqual([]);
  });
});
