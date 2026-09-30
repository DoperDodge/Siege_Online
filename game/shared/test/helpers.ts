import { DEG, eyePose, poseHitboxes, QUERY_STATIC, quatFromTo, Sim, Stance, TICK_HZ, type InputCmd, type Pawn, type PlayerController, type Vec3 } from "../src/index.js";

export async function labWith(operatorId = "sledge"): Promise<{ sim: Sim; ctrl: PlayerController; pawn: Pawn }> {
  const sim = await Sim.create("movement_lab");
  const ctrl = sim.addPlayer("tester", operatorId);
  const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
  settle(sim, ctrl);
  return { sim, ctrl, pawn };
}

let seq = 0;
export function input(p: Partial<InputCmd> & { yawDeg?: number } = {}): InputCmd {
  const { yawDeg, ...rest } = p;
  return { seq: ++seq, forward: 0, strafe: 0, yaw: (yawDeg ?? 0) * DEG, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...rest };
}

/** Step the sim for `seconds` with the same input every tick. */
export function run(sim: Sim, ctrl: PlayerController, cmd: Partial<InputCmd> & { yawDeg?: number }, seconds: number) {
  const ticks = Math.round(seconds * TICK_HZ);
  for (let i = 0; i < ticks; i++) sim.step(new Map([[ctrl.id, input(cmd)]]));
}

export function settle(sim: Sim, ctrl: PlayerController, seconds = 0.5) {
  run(sim, ctrl, {}, seconds);
}

/** Move the controller's pawn to feet position (x, y, z) in a settled stance, then let it settle. */
export function teleport(sim: Sim, ctrl: PlayerController, x: number, y: number, z: number, yawDeg = 0, stance = Stance.Stand) {
  sim.teleport(ctrl.possessedPawnId, x, y, z, yawDeg, stance);
  run(sim, ctrl, { yawDeg, stance }, 0.25);
  return sim.pawns.get(ctrl.possessedPawnId)!;
}

export const hspeed = (p: Pawn) => Math.hypot(p.state.vx, p.state.vz);

/**
 * Hitboxes (shrunk by `shrink`) and the camera that overlap level geometry. Floors and ramps are solid,
 * so a small shrink tolerates hitboxes that just touch the ground.
 */
export function bodyOverlaps(sim: Sim, pawn: Pawn, shrink = 0.03): string[] {
  const out: string[] = [];
  const hit = (pos: Vec3, rot: [number, number, number, number], shape: InstanceType<typeof sim.R.Ball> | InstanceType<typeof sim.R.Capsule>) =>
    sim.world.intersectionWithShape({ x: pos[0], y: pos[1], z: pos[2] }, { x: rot[0], y: rot[1], z: rot[2], w: rot[3] }, shape, undefined, QUERY_STATIC, pawn.collider) !== null;
  for (const hb of poseHitboxes(sim.data.movement, sim.data.hitboxes, pawn.state)) {
    const d: Vec3 = [hb.b[0] - hb.a[0], hb.b[1] - hb.a[1], hb.b[2] - hb.a[2]];
    const len = Math.hypot(...d);
    const mid: Vec3 = [(hb.a[0] + hb.b[0]) / 2, (hb.a[1] + hb.b[1]) / 2, (hb.a[2] + hb.b[2]) / 2];
    const r = hb.radius - shrink;
    const shape = len < 1e-6 ? new sim.R.Ball(r) : new sim.R.Capsule(len / 2, r);
    const rot = len < 1e-6 ? ([0, 0, 0, 1] as [number, number, number, number]) : quatFromTo([0, 1, 0], [d[0] / len, d[1] / len, d[2] / len]);
    if (hit(mid, rot, shape)) out.push(hb.part);
  }
  if (hit(eyePose(sim.data.movement, sim.data.hitboxes, pawn.state).pos, [0, 0, 0, 1], new sim.R.Ball(0.05))) out.push("eye");
  return out;
}
