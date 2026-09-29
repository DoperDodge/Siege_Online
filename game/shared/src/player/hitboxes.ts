// Damage hitboxes and eye position for a pawn pose. The server will rewind these for lag compensation
// (PLAN §5), so they follow stance AND lean exactly like the camera does. Shapes are placeholders
// from data/hitboxes.json until Phase 3 tuning.
import { DEG, lerp, rotateXZ, type Vec3 } from "../core/math.js";
import type { HitboxData, MovementData } from "../data/schemas.js";
import { currentEyeHeight, currentHeight, proneWeight } from "./stance.js";
import type { PawnState } from "./types.js";

export type BodyPart = "head" | "neck" | "torso" | "pelvis" | "arm_l" | "arm_r" | "leg_l" | "leg_r";

/** A capsule from `a` to `b` (a sphere when a === b). */
export interface Hitbox {
  part: BodyPart;
  a: Vec3;
  b: Vec3;
  radius: number;
}

/** Local frame: x = right, y = up, z = backward (forward is -z); origin at the feet. */
type Seg = [BodyPart, Vec3, Vec3];

const PRONE_HEAD_FORWARD = 0.45;

function uprightPose(hb: HitboxData, height: number, eye: number, leanOffset: number): Seg[] {
  const st = hb.standing;
  const hip = height * st.hipHeight;
  const chest = height * st.chestHeight;
  const head = eye;
  const neckTop = Math.min(height * st.neckHeight, head - hb.parts.head.radius * 0.8);
  const hw = st.hipHalfWidth;
  const sw = st.shoulderHalfWidth;
  // Lean bends the spine: lateral shift grows linearly from the hips to the head (procedural spine).
  const bend = (y: number) => (head > hip ? leanOffset * Math.max(0, (y - hip) / (head - hip)) : 0);
  const p = (x: number, y: number, z: number): Vec3 => [x + bend(y), y, z];
  return [
    ["head", p(0, head, -0.02), p(0, head, -0.02)],
    ["neck", p(0, chest + 0.02, 0), p(0, neckTop, 0)],
    ["torso", p(0, hip + 0.08, 0), p(0, chest, 0)],
    ["pelvis", p(-hw, hip, 0), p(hw, hip, 0)],
    ["arm_l", p(-sw, chest, 0), p(-sw * 0.5, hip + 0.12, -0.35)],
    ["arm_r", p(sw, chest, 0), p(sw * 0.5, hip + 0.12, -0.35)],
    ["leg_l", p(-hw, hip, 0), p(-hw, 0.08, -0.08)],
    ["leg_r", p(hw, hip, 0), p(hw, 0.08, -0.08)],
  ];
}

function pronePose(hb: HitboxData, eye: number, leanOffset: number): Seg[] {
  const hw = hb.standing.hipHalfWidth;
  // Upper body shifts sideways when leaning prone (less than upright).
  const shift = (z: number) => (z < 0 ? leanOffset * 0.6 : 0);
  const p = (x: number, y: number, z: number): Vec3 => [x + shift(z), y, z];
  return [
    ["head", p(0, eye, -PRONE_HEAD_FORWARD), p(0, eye, -PRONE_HEAD_FORWARD)],
    ["neck", p(0, 0.26, -0.33), p(0, 0.27, -0.25)],
    ["torso", p(0, 0.2, -0.2), p(0, 0.19, 0.3)],
    ["pelvis", p(-hw, 0.17, 0.42), p(hw, 0.17, 0.42)],
    ["arm_l", p(-0.2, 0.22, -0.2), p(-0.12, 0.24, -0.75)],
    ["arm_r", p(0.2, 0.22, -0.2), p(0.12, 0.24, -0.75)],
    ["leg_l", p(-hw, 0.12, 0.5), p(-hw * 1.4, 0.1, 1.2)],
    ["leg_r", p(hw, 0.12, 0.5), p(hw * 1.4, 0.1, 1.2)],
  ];
}

function toWorld(s: PawnState, v: Vec3): Vec3 {
  const [x, z] = rotateXZ(v[0], v[2], s.yaw);
  return [s.x + x, s.y + v[1], s.z + z];
}

export function poseHitboxes(m: MovementData, hb: HitboxData, s: PawnState): Hitbox[] {
  const leanOffset = s.lean * m.lean.offset;
  const up = uprightPose(hb, currentHeight(m, s), currentEyeHeight(m, s), leanOffset);
  const w = proneWeight(s);
  const prone = w > 0 ? pronePose(hb, m.stance.prone.eye, leanOffset) : null;
  const radius = (part: BodyPart) => hb.parts[part.startsWith("arm") ? "arm" : part.startsWith("leg") ? "leg" : (part as "head" | "neck" | "torso" | "pelvis")].radius;
  return up.map(([part, a, b], i) => {
    let la = a;
    let lb = b;
    if (prone) {
      const [, pa, pb] = prone[i];
      la = [lerp(a[0], pa[0], w), lerp(a[1], pa[1], w), lerp(a[2], pa[2], w)];
      lb = [lerp(b[0], pb[0], w), lerp(b[1], pb[1], w), lerp(b[2], pb[2], w)];
    }
    return { part, a: toWorld(s, la), b: toWorld(s, lb), radius: radius(part) };
  });
}

/** Camera position (world) and roll for a pawn state; `leanOverride` evaluates a different lean amount. */
export function eyePose(m: MovementData, s: PawnState, leanOverride?: number): { pos: Vec3; roll: number } {
  const lean = leanOverride ?? s.lean;
  const w = proneWeight(s);
  const upright: Vec3 = [lean * m.lean.offset, currentEyeHeight(m, s), 0];
  const prone: Vec3 = [lean * m.lean.offset * 0.6, m.stance.prone.eye, -PRONE_HEAD_FORWARD];
  const local: Vec3 = [lerp(upright[0], prone[0], w), lerp(upright[1], prone[1], w), lerp(upright[2], prone[2], w)];
  return { pos: toWorld(s, local), roll: -lean * m.lean.rollDeg * DEG * (1 - 0.4 * w) };
}
