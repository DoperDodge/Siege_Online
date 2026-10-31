// An attacker's drone (Phase 7, intel/DESIGN.md §2): a small upright cylinder as wide and tall as the drone, moved by
// its own character controller against the level, panels, props and the stairs' ramps (never bodies, nor the helpers
// that stop only bodies), driven at full speed in every direction, a jump every few seconds and a boost. Its state is a PawnState like a body's, so
// it is predicted, corrected and sent like one; only the fields it uses change.
import { DT } from "../core/constants.js";
import { clamp, DEG, forwardXZ, rightXZ } from "../core/math.js";
import type { IntelData } from "../data/schemas.js";
import { DRONE_GROUPS, QUERY_DRONE, type Collider, type Rapier, type World } from "../physics/rapier.js";
import type { Hitbox } from "./hitboxes.js";
import type { MoveContext } from "./movement.js";
import type { Pawn } from "./pawn.js";
import { Btn, PawnMode, type InputCmd, type PawnState } from "./types.js";
import { ticks } from "../weapons/ticks.js";

type DroneData = IntelData["drone"];

/** The drone's collider: an upright cylinder of the drone's width and height. */
export function droneCollider(R: Rapier, world: World, d: DroneData): Collider {
  const [w, h] = d.sizeM;
  return world.createCollider(R.ColliderDesc.cylinder(h / 2, w / 2).setCollisionGroups(DRONE_GROUPS));
}

/** Put a drone's collider where its state says (its feet at the state's y). */
export function poseDrone(d: DroneData, pawn: Pawn): void {
  const s = pawn.state;
  pawn.collider.setTranslation({ x: s.x, y: s.y + d.sizeM[1] / 2, z: s.z });
}

/** Copy the collider's position (float32 as Rapier keeps it) back into the state. */
function readDrone(d: DroneData, pawn: Pawn): void {
  const t = pawn.collider.translation();
  pawn.state.x = t.x;
  pawn.state.y = Math.fround(t.y - d.sizeM[1] / 2);
  pawn.state.z = t.z;
}

/**
 * One tick of a drone out in the world (mode Walk; held and destroyed drones don't move). `driver`: its driver's
 * input, or null for a parked drone (it settles under gravity). Forward / strafe at `speedMps` whatever the mix, reached at
 * `accelMps2` on the ground (`airControl` of it in the air); the mouse turns it and tilts its camera; Space jumps
 * when grounded and the cooldown is over; a Shift press starts a boost when it's ready.
 */
export function stepDrone(ctx: MoveContext, pawn: Pawn, driver: InputCmd | null): void {
  const d = ctx.data.intel.drone;
  const s = pawn.state;
  if (s.mode !== PawnMode.Walk) return;
  // Jammed by a Bulletproof Camera's EMP dart: deaf to its driver until it wears off (it settles where it is).
  const jammed = s.jammed > 0;
  if (jammed) s.jammed--;
  const input = jammed ? null : driver;
  const pressed = input ? input.buttons & ~s.prevButtons : 0;
  if (s.jumpCd > 0) s.jumpCd--;
  if (s.boostTicks > 0) s.boostTicks--;
  if (s.boostCd > 0) s.boostCd--;
  if (input) {
    s.yaw = input.yaw;
    s.pitch = clamp(input.pitch, d.pitchMinDeg * DEG, d.pitchMaxDeg * DEG);
    if (pressed & Btn.Sprint && s.boostCd === 0) {
      s.boostTicks = ticks(d.boost.seconds);
      s.boostCd = ticks(d.boost.seconds + d.boost.rechargeS);
    }
  }
  // Where the driver wants to go, at full speed in any direction (research/intel.md §1: strafing at full speed).
  let f = input?.forward ?? 0;
  let st = input?.strafe ?? 0;
  const len = Math.hypot(f, st);
  if (len > 1) {
    f /= len;
    st /= len;
  }
  // An enemy's barbed wire slows it a little (Phase 8 M3).
  const speed = d.speedMps * (s.boostTicks > 0 ? d.boost.mult : 1) * (ctx.slowOf?.(pawn) ?? 1);
  const [fx, fz] = forwardXZ(s.yaw);
  const [rx, rz] = rightXZ(s.yaw);
  const wx = (fx * f + rx * st) * speed;
  const wz = (fz * f + rz * st) * speed;
  const maxDv = d.accelMps2 * DT * (s.grounded ? 1 : d.airControl);
  const dvx = wx - s.vx;
  const dvz = wz - s.vz;
  const dl = Math.hypot(dvx, dvz);
  if (dl <= maxDv) {
    s.vx = wx;
    s.vz = wz;
  } else {
    s.vx += (dvx / dl) * maxDv;
    s.vz += (dvz / dl) * maxDv;
  }
  const g = ctx.data.movement.gravity;
  if (pressed & Btn.Vault && s.grounded && s.jumpCd === 0) {
    s.vy = Math.sqrt(-2 * g * d.jumpHeightM);
    s.jumpCd = ticks(d.jumpCooldownS);
    s.grounded = false;
  } else s.vy = s.grounded ? g * DT : s.vy + g * DT;

  poseDrone(d, pawn);
  const want = { x: s.vx * DT, y: s.vy * DT, z: s.vz * DT };
  // On the ground, the step follows its plane so the speed holds up a staircase's ramp (the controller alone would
  // turn most of it into pushing against the slope; bodies do the same, player/movement.ts).
  const n = s.grounded ? groundNormal(ctx, pawn, d) : null;
  if (n && n.y >= Math.cos(ctx.data.movement.step.maxSlopeDeg * DEG) && n.y < 1) want.y += -(n.x * want.x + n.z * want.z) / n.y;
  ctx.dcc.computeColliderMovement(pawn.collider, want, undefined, QUERY_DRONE);
  const got = ctx.dcc.computedMovement();
  const t = pawn.collider.translation();
  pawn.collider.setTranslation({ x: t.x + got.x, y: t.y + got.y, z: t.z + got.z });
  const grounded = ctx.dcc.computedGrounded();
  // A wall takes the speed it stops; landing or a ceiling ends the fall or the jump.
  if (Math.abs(got.x) < Math.abs(want.x) - 1e-6) s.vx = got.x / DT;
  if (Math.abs(got.z) < Math.abs(want.z) - 1e-6) s.vz = got.z / DT;
  if ((grounded && s.vy < 0) || (s.vy > 0 && got.y < want.y - 1e-6)) s.vy = 0;
  s.grounded = grounded;
  readDrone(d, pawn);
  s.prevButtons = driver ? driver.buttons : s.prevButtons;
  s.vx = Math.fround(s.vx);
  s.vy = Math.fround(s.vy);
  s.vz = Math.fround(s.vz);
  s.yaw = Math.fround(s.yaw);
  s.pitch = Math.fround(s.pitch);
  poseDrone(d, pawn);
}

/** The ground's normal straight under a drone (what it drives on: the level, panels, props and the stairs' ramps), or null. */
function groundNormal(ctx: MoveContext, pawn: Pawn, d: DroneData): { x: number; y: number; z: number } | null {
  const t = pawn.collider.translation();
  const hit = ctx.world.castRayAndGetNormal(new ctx.R.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 }), d.sizeM[1] / 2 + 0.15, true, undefined, QUERY_DRONE);
  return hit ? hit.normal : null;
}

/** A drone's camera: `eyeM` over its bottom, facing its yaw and tilt. */
export function droneEye(d: DroneData, s: PawnState): { pos: [number, number, number]; yaw: number; pitch: number } {
  return { pos: [s.x, s.y + d.eyeM, s.z], yaw: s.yaw, pitch: s.pitch };
}

/** What a bullet hits: one capsule across the drone, as tall as it is and as wide. */
export function droneHitboxes(d: DroneData, s: PawnState): Hitbox[] {
  const [w, h] = d.sizeM;
  const radius = h / 2;
  const half = Math.max(0, w / 2 - radius);
  const [rx, rz] = rightXZ(s.yaw);
  const cy = s.y + h / 2;
  return [{ part: "drone", a: [s.x - rx * half, cy, s.z - rz * half], b: [s.x + rx * half, cy, s.z + rz * half], radius }];
}
