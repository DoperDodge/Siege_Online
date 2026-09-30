// Damage hitboxes and eye position for a pawn pose. The server will rewind these for lag compensation
// (PLAN §5), so they follow stance AND lean exactly like the camera does. All proportions come from
// data/hitboxes.json (placeholders until Phase 3 tuning).
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

const partRadius = (hb: HitboxData, part: BodyPart) =>
  hb.parts[part.startsWith("arm") ? "arm" : part.startsWith("leg") ? "leg" : (part as "head" | "neck" | "torso" | "pelvis")].radius;

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
  const hand = hip + st.handAboveHip;
  return [
    ["head", p(0, head, -st.headForward), p(0, head, -st.headForward)],
    ["neck", p(0, chest + st.neckBaseAboveChest, 0), p(0, neckTop, 0)],
    ["torso", p(0, hip + st.torsoBaseAboveHip, 0), p(0, chest, 0)],
    ["pelvis", p(-hw, hip, 0), p(hw, hip, 0)],
    ["arm_l", p(-sw, chest, 0), p(-st.handHalfWidth, hand, -st.handForward)],
    ["arm_r", p(sw, chest, 0), p(st.handHalfWidth, hand, -st.handForward)],
    ["leg_l", p(-hw, hip, 0), p(-hw, st.footHeight, -st.footForward)],
    ["leg_r", p(hw, hip, 0), p(hw, st.footHeight, -st.footForward)],
  ];
}

/** Lying-down pose on flat ground, before lean and tilt. */
function pronePoseFlat(hb: HitboxData, eye: number): Seg[] {
  const p0 = hb.prone;
  const hw = hb.standing.hipHalfWidth;
  const neckFront = -p0.headForward + hb.parts.head.radius;
  const sw = p0.shoulderHalfWidth;
  return [
    ["head", [0, eye, -p0.headForward], [0, eye, -p0.headForward]],
    ["neck", [0, p0.neckFrontHeight, neckFront], [0, p0.neckRearHeight, -p0.shoulderForward]],
    ["torso", [0, p0.chestHeight, -p0.shoulderForward], [0, p0.torsoRearHeight, p0.torsoRearBack]],
    ["pelvis", [-hw, p0.hipHeight, p0.hipBack], [hw, p0.hipHeight, p0.hipBack]],
    ["arm_l", [-sw, p0.shoulderHeight, -p0.shoulderForward], [-p0.handHalfWidth, p0.handHeight, -p0.handForward]],
    ["arm_r", [sw, p0.shoulderHeight, -p0.shoulderForward], [p0.handHalfWidth, p0.handHeight, -p0.handForward]],
    ["leg_l", [-hw, p0.thighHeight, p0.thighBack], [-hw * p0.footSpread, p0.footHeight, p0.footBack]],
    ["leg_r", [hw, p0.thighHeight, p0.thighBack], [hw * p0.footSpread, p0.footHeight, p0.footBack]],
  ];
}

/**
 * Place a flat prone point on the ground. The upper body (ahead of the feet point) shifts sideways when
 * leaning and pitches by `tiltF`; the legs (behind the hips) pitch by `tiltB` (radians, positive = rising
 * toward the head), and the spine bends smoothly in between, so the body lies on ramps, stairs, crests
 * and troughs. `tiltSide` then rolls the whole body to lie across a slope.
 */
function proneLocal(hb: HitboxData, v: Vec3, leanShift: number, tF: number, tB: number, side: number, lift: number): Vec3 {
  const z = v[2];
  const hip = hb.prone.hipBack;
  const t = z <= 0 ? tF : z >= hip ? tB : tF + ((tB - tF) * z) / hip;
  const c = Math.cos(t);
  const sn = Math.sin(t);
  const x = v[0] + (z < 0 ? leanShift : 0);
  const y = v[1] * c - z * sn;
  const cr = Math.cos(side);
  const sr = Math.sin(side);
  return [x * cr - y * sr, x * sr + y * cr + lift, v[1] * sn + z * c];
}

/**
 * How far the lying body rises where the ground bends under it (a crest or a trough): the torso spans
 * the hinge, so without this it would sag into the ground there. 0 on flat ground and even slopes.
 */
export function proneBendLift(hb: HitboxData, tF: number, tB: number): number {
  if (tF === tB) return 0;
  const [, a, b] = pronePoseFlat(hb, 0)[2]; // the torso
  const r = hb.parts.torso.radius;
  const pa = proneLocal(hb, a, 0, tF, tB, 0, 0);
  const pb = proneLocal(hb, b, 0, tF, tB, 0, 0);
  let lift = 0;
  for (let i = 0; i <= 8; i++) {
    const y = lerp(pa[1], pb[1], i / 8);
    const z = lerp(pa[2], pb[2], i / 8);
    // The ground runs through the feet point along each half's tilt; keep the torso a radius above it.
    const t = z < 0 ? tF : tB;
    lift = Math.max(lift, r / Math.cos(t) - (y + z * Math.tan(t)));
  }
  return lift;
}

/**
 * Size of the lying-down body on flat ground, measured from the feet point: how far every prone hitbox
 * reaches forward, backward, sideways and up. The prone clearance boxes (movement.ts) use exactly this,
 * so the camera, head, arms and legs can never end up inside a wall.
 */
export function proneBodyExtents(m: MovementData, hb: HitboxData): { front: number; back: number; halfWidth: number; top: number } {
  let front = 0;
  let back = 0;
  let halfWidth = 0;
  let top = 0;
  for (const [part, a, b] of pronePoseFlat(hb, m.stance.prone.eye)) {
    const r = partRadius(hb, part);
    for (const [x, y, z] of [a, b]) {
      front = Math.max(front, r - z);
      back = Math.max(back, z + r);
      halfWidth = Math.max(halfWidth, Math.abs(x) + r);
      top = Math.max(top, y + r);
    }
  }
  return { front, back, halfWidth, top };
}

function toWorld(s: PawnState, v: Vec3): Vec3 {
  const [x, z] = rotateXZ(v[0], v[2], s.yaw);
  return [s.x + x, s.y + v[1], s.z + z];
}

export function poseHitboxes(m: MovementData, hb: HitboxData, s: PawnState): Hitbox[] {
  const leanOffset = s.lean * m.lean.offset;
  const up = uprightPose(hb, currentHeight(m, s), currentEyeHeight(m, s), leanOffset);
  const w = proneWeight(s);
  const prone = w > 0 ? pronePoseFlat(hb, m.stance.prone.eye) : null;
  const shift = leanOffset * m.lean.proneOffsetScale;
  const lift = prone ? proneBendLift(hb, s.tiltF, s.tiltB) : 0;
  return up.map(([part, a, b], i) => {
    let la = a;
    let lb = b;
    if (prone) {
      const pa = proneLocal(hb, prone[i][1], shift, s.tiltF, s.tiltB, s.tiltSide, lift);
      const pb = proneLocal(hb, prone[i][2], shift, s.tiltF, s.tiltB, s.tiltSide, lift);
      la = [lerp(a[0], pa[0], w), lerp(a[1], pa[1], w), lerp(a[2], pa[2], w)];
      lb = [lerp(b[0], pb[0], w), lerp(b[1], pb[1], w), lerp(b[2], pb[2], w)];
    }
    return { part, a: toWorld(s, la), b: toWorld(s, lb), radius: partRadius(hb, part) };
  });
}

/** Camera position (world) and roll for a pawn state; `leanOverride` evaluates a different lean amount. */
export function eyePose(m: MovementData, hb: HitboxData, s: PawnState, leanOverride?: number): { pos: Vec3; roll: number } {
  const lean = leanOverride ?? s.lean;
  const w = proneWeight(s);
  const upright: Vec3 = [lean * m.lean.offset, currentEyeHeight(m, s), 0];
  const shift = lean * m.lean.offset * m.lean.proneOffsetScale;
  const prone = w > 0 ? proneLocal(hb, [0, m.stance.prone.eye, -hb.prone.headForward], shift, s.tiltF, s.tiltB, s.tiltSide, proneBendLift(hb, s.tiltF, s.tiltB)) : upright;
  const local: Vec3 = [lerp(upright[0], prone[0], w), lerp(upright[1], prone[1], w), lerp(upright[2], prone[2], w)];
  const rollScale = lerp(1, m.lean.proneRollScale, w);
  return { pos: toWorld(s, local), roll: -lean * m.lean.rollDeg * DEG * rollScale };
}
