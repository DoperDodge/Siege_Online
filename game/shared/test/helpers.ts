import { capsuleHalfHeight, DEG, Sim, Stance, TICK_HZ, type InputCmd, type Pawn, type PlayerController } from "../src/index.js";

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

/** Move a pawn to feet position (x, y, z) standing, facing yawDeg, and let it settle. */
export function teleport(sim: Sim, ctrl: PlayerController, x: number, y: number, z: number, yawDeg = 0, stance = Stance.Stand) {
  const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
  const m = sim.data.movement;
  const r = m.stance.collisionRadius;
  const dims = m.stance[stance === Stance.Stand ? "stand" : stance === Stance.Crouch ? "crouch" : "prone"];
  const hh = capsuleHalfHeight(dims.height, r);
  pawn.collider.setHalfHeight(hh);
  pawn.collider.setTranslation({ x, y: y + hh + r + 0.02, z });
  Object.assign(pawn.state, { x, y: y + 0.02, z, vx: 0, vy: 0, vz: 0, yaw: yawDeg * DEG, stance, stanceFrom: stance, stanceT: 1, airPeakY: y + 0.02, grounded: false, lean: 0 });
  run(sim, ctrl, { yawDeg, stance }, 0.25);
  return pawn;
}

export const hspeed = (p: Pawn) => Math.hypot(p.state.vx, p.state.vz);
