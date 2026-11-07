// Damage hitboxes and eye position for a pawn pose. The server will rewind these for lag compensation
// (PLAN §5), so they follow stance AND lean exactly like the camera does. All proportions come from
// data/hitboxes.json (placeholders until Phase 3 tuning).
import { DEG, lerp, rotateXZ, type Vec3 } from "../core/math.js";
import type { HitboxData, MovementData } from "../data/schemas.js";
import { currentEyeHeight, currentHeight, proneWeight } from "./stance.js";
import { PawnMode, type PawnState } from "./types.js";

/**
 * "drone": the one box of an attacker's drone (Phase 7, player/drone.ts). "shield": Fuze's Ballistic Shield's plate
 * (Phase 8 M11, player/shield.ts): it takes no damage; what meets it first stops there.
 */
export type BodyPart = "head" | "neck" | "torso" | "pelvis" | "arm_l" | "arm_r" | "leg_l" | "leg_r" | "drone" | "shield";

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

/** How far a body on a rope is turned over (Phase 5 M8): 0 right side up, π upside down (PawnState.ropeTurn). */
export const ropeRoll = (s: PawnState) => (s.mode === PawnMode.Rappel ? Math.PI * s.ropeTurn : 0);

/** Hanging upside down on a rope, or more than half turned over. */
export const upsideDown = (s: PawnState) => s.mode === PawnMode.Rappel && s.ropeTurn > 0.5;

/**
 * A knocked-down body (D-156, PawnMode.Knocked) tipped back `knockLie` of the way onto its back: turned about the line
 * across its feet `lift` up (a torso's thickness, so it comes to rest on its back, not through the floor), its front
 * turning up. Its facing stays what it faces (what knocked it down).
 */
function knockTip(s: PawnState, v: Vec3, lift: number): Vec3 {
  if (s.mode !== PawnMode.Knocked || s.knockLie <= 0) return v;
  const t = (s.knockLie * Math.PI) / 2;
  const c = Math.cos(t);
  const n = Math.sin(t);
  const up = v[1] - lift;
  // (The local frame's z is backward: up turns toward it, and the front, at −z, turns up.)
  return [v[0], lift + up * c - v[2] * n, up * n + v[2] * c];
}

/**
 * A local point on the body to the world. On a rope the body turns over about its view's forward axis through the
 * middle of the same capsule `height` tall: halfway, it lies on its side; upside down, right is left and the head
 * hangs at the bottom. Knocked down, it tips back onto its back (knockTip, about `lift` over its feet).
 */
function toWorld(s: PawnState, p: Vec3, height: number, lift: number): Vec3 {
  const v = knockTip(s, p, lift);
  const roll = ropeRoll(s);
  let [lx, ly] = [v[0], v[1]];
  if (roll !== 0) {
    const [c, n, mid] = [Math.cos(roll), Math.sin(roll), height / 2];
    [lx, ly] = [v[0] * c - (v[1] - mid) * n, mid + v[0] * n + (v[1] - mid) * c];
  }
  const [x, z] = rotateXZ(lx, v[2], s.yaw);
  return [s.x + x, s.y + ly, s.z + z];
}

export function poseHitboxes(m: MovementData, hb: HitboxData, s: PawnState): Hitbox[] {
  const leanOffset = s.lean * m.lean.offset;
  const height = currentHeight(m, s);
  const up = uprightPose(hb, height, currentEyeHeight(m, s), leanOffset);
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
    return { part, a: toWorld(s, la, height, hb.parts.torso.radius), b: toWorld(s, lb, height, hb.parts.torso.radius), radius: partRadius(hb, part) };
  });
}

/** Where Fuze's Ballistic Shield's plate is on a body (Phase 8 M11, player/shield.ts shieldPlace). */
export type ShieldPlace = "front" | "back";

/** The plate's numbers (data/weapons/ballistic_shield.json `shield.plate`). */
export interface ShieldPlate {
  widthM: number;
  heightM: number;
  chamferM: number;
  curveM: number;
  frontM: number;
  aboveEyeM: number;
  adsBelowEyeM: number;
  window: { widthM: number; heightM: number };
}

/** How far Fuze's raised shield has slid down for aiming (0 up … 1 down): the body's aiming progress (`adsQ`). */
export const shieldLowered = (s: PawnState) => Math.min(1, Math.max(0, s.adsQ / 65535));

/** Where the plate is on a body now: its bottom and top heights over the feet, and a point on it (see shieldFrame). */
export interface ShieldFrame {
  y0: number;
  y1: number;
  /** The plate's own height (drawn rigid: as it slides down for aiming its bottom may dip under the floor, y0 doesn't). */
  tall: number;
  /** Half its width. */
  half: number;
  /**
   * The world point `u` across it (−1 its left edge … 1 its right) at height `y` over the feet, `out` metres out of its
   * face (its window's frame stands out of it).
   */
  at(u: number, y: number, out?: number): Vec3;
}

/**
 * Fuze's Ballistic Shield's plate on a body (Phase 8 M11; the game's model, D-157). In front: a rigid plate `heightM`
 * tall, its middle `frontM` ahead, all but flat (its edges `curveM` nearer him); its top `aboveEyeM` over the eyes,
 * slid down as he aims (`aboveEyeM + adsBelowEyeM` when fully aimed: the head over it), never through the floor (crouched
 * it comes to rest on it, and he aims over its top). On the back: across his back from the hips to the shoulders. It
 * bends with his spine when he leans, as the upper body does (uprightPose). Null while prone (it's on his back then, and
 * a prone body's isn't modelled).
 */
export function shieldFrame(m: MovementData, hb: HitboxData, s: PawnState, k: ShieldPlate, place: ShieldPlace): ShieldFrame | null {
  if (proneWeight(s) > 0) return null;
  const height = currentHeight(m, s);
  const eye = currentEyeHeight(m, s);
  const st = hb.standing;
  const hip = height * st.hipHeight;
  const front = place === "front";
  const top = eye + k.aboveEyeM;
  const drop = front ? Math.min((k.aboveEyeM + k.adsBelowEyeM) * shieldLowered(s), Math.max(0, top - k.heightM - FLOOR_GAP_M)) : 0;
  const y1 = front ? top - drop : height * st.chestHeight + 0.15;
  const y0 = front ? Math.max(FLOOR_GAP_M, y1 - k.heightM) : hip;
  const tall = y1 - y0;
  const half = (front ? k.widthM : k.widthM * 0.85) / 2;
  const lean = s.lean * m.lean.offset;
  const at = (u: number, y: number, out = 0): Vec3 => {
    const bend = eye > hip ? lean * Math.max(0, (y - hip) / (eye - hip)) : 0;
    const z = front ? -k.frontM + k.curveM * u * u - out : 0.22 - k.curveM * u * u + out;
    return toWorld(s, [u * half + bend, y, z], height, hb.parts.torso.radius);
  };
  return { y0, y1, tall, half, at };
}

/** How far over the floor Fuze's plate's bottom stays (it never goes through it). */
const FLOOR_GAP_M = 0.02;

/**
 * Fuze's Ballistic Shield as hitboxes (Phase 8 M11): seven vertical capsules side by side along its plate (see
 * shieldFrame), each part "shield", the two at its edges short of its cut top corners; none while prone.
 */
export function shieldHitboxes(m: MovementData, hb: HitboxData, s: PawnState, k: ShieldPlate, place: ShieldPlace): Hitbox[] {
  const f = shieldFrame(m, hb, s, k, place);
  if (!f) return [];
  const n = 7;
  const r = f.half / n;
  const out: Hitbox[] = [];
  for (let i = 0; i < n; i++) {
    const u = -1 + (2 * i + 1) / n;
    const top = f.y1 - (i === 0 || i === n - 1 ? k.chamferM : 0) - r;
    out.push({ part: "shield", a: f.at(u, f.y0 + r), b: f.at(u, Math.max(f.y0 + r, top)), radius: r });
  }
  return out;
}

/** Camera position (world) and roll for a pawn state (upside down, half a turn more); `leanOverride` evaluates a different lean amount. */
export function eyePose(m: MovementData, hb: HitboxData, s: PawnState, leanOverride?: number): { pos: Vec3; roll: number } {
  const lean = leanOverride ?? s.lean;
  const w = proneWeight(s);
  const upright: Vec3 = [lean * m.lean.offset, currentEyeHeight(m, s), 0];
  const shift = lean * m.lean.offset * m.lean.proneOffsetScale;
  const prone = w > 0 ? proneLocal(hb, [0, m.stance.prone.eye, -hb.prone.headForward], shift, s.tiltF, s.tiltB, s.tiltSide, proneBendLift(hb, s.tiltF, s.tiltB)) : upright;
  const local: Vec3 = [lerp(upright[0], prone[0], w), lerp(upright[1], prone[1], w), lerp(upright[2], prone[2], w)];
  const rollScale = lerp(1, m.lean.proneRollScale, w);
  return { pos: toWorld(s, local, currentHeight(m, s), hb.parts.torso.radius), roll: -lean * m.lean.rollDeg * DEG * rollScale + ropeRoll(s) };
}
