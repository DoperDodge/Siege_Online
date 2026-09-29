// Shared movement simulation: the exact same code runs on the server (authority) and in the
// browser (prediction). Rapier's deterministic build makes both produce bit-identical results.
import RAPIER from "@dimforge/rapier3d-deterministic-compat";

export type Rapier = typeof RAPIER;
export type World = InstanceType<Rapier["World"]>;
export type Collider = ReturnType<World["createCollider"]>;
export type CharacterController = ReturnType<World["createCharacterController"]>;

export const TICK_HZ = 64;
export const DT = 1 / TICK_HZ;
// Placeholder speed: real per-rating speeds are UNVERIFIED (research/core_mechanics.md, question 1).
export const WALK_SPEED = 4.5;
export const GRAVITY = -9.81;
export const CAPSULE_HALF_HEIGHT = 0.6;
export const CAPSULE_RADIUS = 0.3;

// Interaction groups: upper 16 bits = membership, lower 16 bits = filter.
const G_STATIC = 0x0001;
const G_PLAYER = 0x0002;
const STATIC_GROUPS = (G_STATIC << 16) | (G_STATIC | G_PLAYER);
// Players collide with static geometry only (player-vs-player blocking comes later).
const PLAYER_GROUPS = (G_PLAYER << 16) | G_STATIC;

export interface InputCmd {
  seq: number;
  moveX: number; // quantized to 1/127 steps in [-1, 1]
  moveZ: number;
  yaw: number; // radians, quantized to float32
}

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
}

export async function initPhysics(): Promise<Rapier> {
  await RAPIER.init();
  return RAPIER;
}

/** Quantize an input the same way the wire format does, so prediction uses identical values. */
export function quantizeInput(seq: number, moveX: number, moveZ: number, yaw: number): InputCmd {
  const q = (v: number) => Math.max(-127, Math.min(127, Math.round(v * 127))) / 127;
  return { seq, moveX: q(moveX), moveZ: q(moveZ), yaw: Math.fround(yaw) };
}

/** Test yard: floor, a 1 m block (too tall to step), a 0.3 m step (auto-step), a 15° ramp, a wall. */
export function buildWorld(R: Rapier): { world: World; controller: CharacterController } {
  const world = new R.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = DT;
  const add = (desc: InstanceType<Rapier["ColliderDesc"]>) => world.createCollider(desc.setCollisionGroups(STATIC_GROUPS));
  add(R.ColliderDesc.cuboid(20, 0.5, 20).setTranslation(0, -0.5, 0));
  add(R.ColliderDesc.cuboid(1, 0.5, 1).setTranslation(4, 0.5, 0));
  add(R.ColliderDesc.cuboid(1, 0.15, 1).setTranslation(-4, 0.15, 2));
  const half = (15 * Math.PI) / 180 / 2;
  add(R.ColliderDesc.cuboid(2, 0.1, 1.5).setTranslation(0, 0.5, -5).setRotation({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) }));
  add(R.ColliderDesc.cuboid(0.1, 1.5, 6).setTranslation(-8, 1.5, 0));
  world.step(); // builds the broad-phase for queries

  const controller = world.createCharacterController(0.02);
  controller.enableAutostep(0.35, 0.2, false);
  controller.enableSnapToGround(0.3);
  controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
  return { world, controller };
}

export function spawnPlayer(R: Rapier, world: World, x: number, z: number): { collider: Collider; state: PlayerState } {
  const y = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;
  const collider = world.createCollider(
    R.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS).setTranslation(x, y, z).setCollisionGroups(PLAYER_GROUPS),
  );
  const t = collider.translation();
  return { collider, state: { x: t.x, y: t.y, z: t.z, vy: 0, grounded: false } };
}

/** Advance one player by exactly one tick of input. Pure function of (state, input, static world). */
export function stepPlayer(controller: CharacterController, collider: Collider, state: PlayerState, input: InputCmd): PlayerState {
  let mx = input.moveX;
  let mz = input.moveZ;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  const vx = (mx * cos + mz * sin) * WALK_SPEED;
  const vz = (-mx * sin + mz * cos) * WALK_SPEED;
  // Siege has no jump: vertical motion is gravity only.
  const vy = state.grounded ? GRAVITY * DT : state.vy + GRAVITY * DT;

  collider.setTranslation({ x: state.x, y: state.y, z: state.z });
  controller.computeColliderMovement(collider, { x: vx * DT, y: vy * DT, z: vz * DT }, undefined, PLAYER_GROUPS);
  const m = controller.computedMovement();
  const next = { x: state.x + m.x, y: state.y + m.y, z: state.z + m.z };
  collider.setTranslation(next);
  const t = collider.translation(); // read back as stored (float32) so both sides round identically
  const grounded = controller.computedGrounded();
  // State is kept float32-exact so a snapshot (sent as float32) can restore it without drift.
  return { x: t.x, y: t.y, z: t.z, vy: grounded ? 0 : Math.fround(vy), grounded };
}

/** Scripted input pattern used by automated tests (walks a square, crosses the step and ramp). */
export function autoInput(seq: number, phase = 0): InputCmd {
  const t = (seq + phase) / TICK_HZ;
  const leg = Math.floor(t / 1.5) % 4;
  const dirs = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];
  const [mx, mz] = dirs[leg];
  return quantizeInput(seq, mx, mz, 0.3 * Math.sin(t));
}
