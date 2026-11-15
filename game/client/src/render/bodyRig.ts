// A body's skeleton, solved from where its hitboxes are (Phase 10 M8, render/DESIGN.md §11). The simulation poses a
// body as eight capsules (player/hitboxes.ts poseHitboxes: head, neck, torso, pelvis, two arms, two legs), through
// every stance, lean, slope, rope and knockdown; what's drawn hangs on the same points, so what's drawn is where it's
// hit: the head, the shoulders, the hips and the pelvis are the capsules' own; the spine runs between them; elbows and
// knees are found by two-bone IK from the shoulders to where the hands are and from the hips to the feet.
//
// The hands and feet default to the capsules' ends. A pose (bodyPose.ts) may move them — hands onto a gun's grip and
// handguard, feet through a stride — and says which way the elbows and knees bend. Nothing here knows about the game's
// state: it's geometry (and tested as such).
//
// Bones are rigid: each is a matrix (its joint's place, its frame, and a stretch along its length where it must span
// two joints: the spine as a crouch shortens it, the neck, a limb at full reach). A torso bone's frame is x right,
// y up the spine, z back; a limb bone's is y along the limb away from the body and, hanging at rest, x right and
// z forward (its front).
import * as THREE from "three";
import type { Hitbox } from "@redmond/shared";

export const BONES = ["pelvis", "spine", "chest", "neck", "head", "upperArmL", "foreArmL", "upperArmR", "foreArmR", "thighL", "shinL", "footL", "thighR", "shinR", "footR"] as const;
export type BoneName = (typeof BONES)[number];
export const BONE = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;

/**
 * The model's lengths (m): the upper arm; the forearm to the middle of the hand (the hand is the forearm's end);
 * thigh and shin (hip to ankle a little over the standing hitbox leg's 0.86: standing, the knees are just bent, and a
 * foot can step out from under its hip); the spine and the neck as modelled (their bones stretch to what the hitboxes
 * give).
 */
export const LEN = { upperArm: 0.29, foreArm: 0.33, thigh: 0.455, shin: 0.435, spine: 0.47, neck: 0.17 } as const;
/** How far over the shoulders' line the neck starts, and how far under the head's middle it ends. */
const NECK_BASE_M = 0.04;
const NECK_TOP_M = 0.07;

/** What a pose asks of the skeleton beyond the hitboxes (all in the world; omitted: the hitbox's own). */
export interface RigPose {
  /** Where the middle of each hand goes. */
  handL?: THREE.Vector3;
  handR?: THREE.Vector3;
  /** Where each ankle goes. */
  footL?: THREE.Vector3;
  footR?: THREE.Vector3;
  /** Which way each elbow and knee bends from the straight line (a direction; default: elbows down and out, knees forward). */
  elbowL?: THREE.Vector3;
  elbowR?: THREE.Vector3;
  kneeL?: THREE.Vector3;
  kneeR?: THREE.Vector3;
  /** Which way the face looks and where the top of the head is (directions; default: the chest's facing and its up). */
  look?: THREE.Vector3;
  lookUp?: THREE.Vector3;
  /**
   * Feet flat (standing, walking: soles level, toes the way the body faces), or hanging on from their shins with the
   * toes pointed (lying, on a rope, in the air).
   */
  flatFeet?: boolean;
  /** A flat foot tipped onto its toes (rad, the heel up: a stride's push off) or back onto its heel (negative). */
  footPitchL?: number;
  footPitchR?: number;
  /**
   * The legs' bones this many times their length (lying down, the hitboxes' legs are short, and the model's shorten
   * to them rather than fold: BodyRig.lyingLegs); 1 if not given.
   */
  legScale?: number;
}

const X = new THREE.Vector3();
const Y = new THREE.Vector3();
const Z = new THREE.Vector3();
const T1 = new THREE.Vector3();
const T2 = new THREE.Vector3();
const S = new THREE.Vector3();

/** A bone's matrix: at `origin`, its y along `yDir`, its x as near `xHint` as it can be, stretched `stretch` along y. */
function bone(out: THREE.Matrix4, origin: THREE.Vector3, yDir: THREE.Vector3, xHint: THREE.Vector3, fallback: THREE.Vector3, stretch = 1): void {
  Y.copy(yDir);
  if (Y.lengthSq() < 1e-12) Y.set(0, 1, 0);
  Y.normalize();
  Z.crossVectors(xHint, Y);
  // (A limb lying along the hint: any side will do, the same one every time.)
  if (Z.lengthSq() < 1e-6) Z.crossVectors(fallback, Y);
  if (Z.lengthSq() < 1e-6) Z.crossVectors(Math.abs(Y.y) < 0.9 ? T1.set(0, 1, 0) : T1.set(1, 0, 0), Y);
  Z.normalize();
  X.crossVectors(Y, Z);
  out.makeBasis(X, Y, Z);
  if (stretch !== 1) out.scale(S.set(1, stretch, 1));
  out.setPosition(origin);
}

/**
 * Two-bone IK: the middle joint between `root` and `target` for bones l1 and l2 long, bent toward `hint`. A target
 * past reach is met by stretching (the returned factor on both lengths, 1 within reach).
 */
export function twoBone(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, hint: THREE.Vector3, mid: THREE.Vector3): number {
  const d = Math.max(1e-4, root.distanceTo(target));
  const k = l1 + l2 < d ? d / (l1 + l2) : 1;
  const a1 = l1 * k;
  const a2 = l2 * k;
  const dir = T1.subVectors(target, root).divideScalar(d);
  // Along the line to the target, then out from it toward the hint.
  const along = Math.min(a1, Math.max(-a1, (a1 * a1 - a2 * a2 + d * d) / (2 * d)));
  const out = Math.sqrt(Math.max(0, a1 * a1 - along * along));
  const side = T2.copy(hint).addScaledVector(dir, -hint.dot(dir));
  if (side.lengthSq() < 1e-8) side.set(0, 1, 0).addScaledVector(dir, -dir.y);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
  side.normalize();
  mid.copy(root).addScaledVector(dir, along).addScaledVector(side, out);
  return k;
}

export class BodyRig {
  /** Each bone's matrix in the world (BONES' order). */
  readonly matrices = BONES.map(() => new THREE.Matrix4());
  /** The joints as solved (the world). */
  readonly joints = {
    head: new THREE.Vector3(),
    neck: new THREE.Vector3(),
    chest: new THREE.Vector3(),
    pelvis: new THREE.Vector3(),
    shoulderL: new THREE.Vector3(),
    shoulderR: new THREE.Vector3(),
    elbowL: new THREE.Vector3(),
    elbowR: new THREE.Vector3(),
    handL: new THREE.Vector3(),
    handR: new THREE.Vector3(),
    hipL: new THREE.Vector3(),
    hipR: new THREE.Vector3(),
    kneeL: new THREE.Vector3(),
    kneeR: new THREE.Vector3(),
    ankleL: new THREE.Vector3(),
    ankleR: new THREE.Vector3(),
  };
  /** The chest's frame: its right, up along the spine, and the way it faces. */
  readonly right = new THREE.Vector3(1, 0, 0);
  readonly up = new THREE.Vector3(0, 1, 0);
  readonly forward = new THREE.Vector3(0, 0, -1);
  /** The hands and feet as the hitboxes have them (a pose starts from these). */
  readonly rest = { handL: new THREE.Vector3(), handR: new THREE.Vector3(), footL: new THREE.Vector3(), footR: new THREE.Vector3() };

  /** The frame and the rest points from a body's hitboxes (poseHitboxes' eight, in its order): before a pose is made. */
  frame(parts: readonly Hitbox[]): void {
    const j = this.joints;
    j.head.fromArray(parts[0].a);
    j.shoulderL.fromArray(parts[4].a);
    j.shoulderR.fromArray(parts[5].a);
    j.hipL.fromArray(parts[6].a);
    j.hipR.fromArray(parts[7].a);
    j.pelvis.fromArray(parts[3].a).add(T1.fromArray(parts[3].b)).multiplyScalar(0.5);
    j.chest.addVectors(j.shoulderL, j.shoulderR).multiplyScalar(0.5);
    this.rest.handL.fromArray(parts[4].b);
    this.rest.handR.fromArray(parts[5].b);
    this.rest.footL.fromArray(parts[6].b);
    this.rest.footR.fromArray(parts[7].b);
    this.axes();
  }

  /**
   * How much shorter the legs' bones are for a body lying as its hitboxes do (after `frame`): the hitboxes' own leg, a
   * little over, against the model's (1: no shorter, standing).
   */
  lyingLegs(): number {
    const j = this.joints;
    const span = Math.max(j.hipL.distanceTo(this.rest.footL), j.hipR.distanceTo(this.rest.footR));
    return Math.min(1, (span * 1.04) / (LEN.thigh + LEN.shin));
  }

  /** The chest's frame from the joints as they are (the shoulders, the pelvis). */
  axes(): void {
    const j = this.joints;
    this.right.subVectors(j.shoulderR, j.shoulderL);
    if (this.right.lengthSq() < 1e-8) this.right.set(1, 0, 0);
    this.right.normalize();
    this.up.subVectors(j.chest, j.pelvis);
    if (this.up.lengthSq() < 1e-8) this.up.set(0, 1, 0);
    this.up.normalize();
    // Square to the spine.
    this.right.addScaledVector(this.up, -this.right.dot(this.up)).normalize();
    this.forward.crossVectors(this.up, this.right).normalize();
  }

  /** Solve the bones for a pose (after `frame`): the elbows and knees found for where the hands and feet go. */
  solve(pose: RigPose = {}): void {
    const j = this.joints;
    const { right, up, forward } = this;
    const legs = pose.legScale ?? 1;
    j.neck.copy(j.chest).addScaledVector(up, NECK_BASE_M);
    // The arms: elbows down and out unless the pose says. The legs: knees forward unless it says.
    for (const side of [-1, 1] as const) {
      const L = side < 0;
      const hand = (L ? j.handL : j.handR).copy((L ? pose.handL : pose.handR) ?? (L ? this.rest.handL : this.rest.handR));
      const elbowHint = (L ? pose.elbowL : pose.elbowR) ?? new THREE.Vector3().copy(up).multiplyScalar(-0.9).addScaledVector(right, side * 0.5).addScaledVector(forward, -0.25);
      twoBone(L ? j.shoulderL : j.shoulderR, hand, LEN.upperArm, LEN.foreArm, elbowHint, L ? j.elbowL : j.elbowR);
      const ankle = (L ? j.ankleL : j.ankleR).copy((L ? pose.footL : pose.footR) ?? (L ? this.rest.footL : this.rest.footR));
      const kneeHint = (L ? pose.kneeL : pose.kneeR) ?? new THREE.Vector3().copy(forward).addScaledVector(up, 0.25);
      twoBone(L ? j.hipL : j.hipR, ankle, LEN.thigh * legs, LEN.shin * legs, kneeHint, L ? j.kneeL : j.kneeR);
    }
    this.bones(pose);
  }

  /**
   * The bones from the joints as they are (a pose's last step; all a ragdoll needs, its joints being its own): each
   * limb's bones stretched to span their joints.
   */
  bones(pose: Pick<RigPose, "look" | "lookUp" | "flatFeet" | "footPitchL" | "footPitchR"> = {}): void {
    const j = this.joints;
    const m = this.matrices;
    const { right, up, forward } = this;

    // The trunk: the pelvis across the hips, the spine up to the shoulders' line, the chest on it, the neck, the head.
    const hipRight = T1.subVectors(j.hipR, j.hipL);
    if (hipRight.lengthSq() < 1e-8) hipRight.copy(right);
    const hips = new THREE.Vector3().copy(hipRight).normalize();
    const spineLen = Math.max(0.05, j.pelvis.distanceTo(j.chest));
    bone(m[BONE.pelvis], j.pelvis, up, hips, forward);
    bone(m[BONE.spine], j.pelvis, up, new THREE.Vector3().addVectors(hips, right), forward, spineLen / LEN.spine);
    bone(m[BONE.chest], j.chest, up, right, forward);
    const toHead = new THREE.Vector3().subVectors(j.head, j.neck);
    const neckLen = Math.max(0.02, toHead.length() - NECK_TOP_M);
    bone(m[BONE.neck], j.neck, toHead, right, forward, neckLen / LEN.neck);
    // The head: facing where it looks (its z is the back of the head), the chest's way if the pose doesn't say.
    const hz = new THREE.Vector3().copy(pose.look ?? forward).negate();
    if (hz.lengthSq() < 1e-8) hz.copy(forward).negate();
    hz.normalize();
    const hx = new THREE.Vector3().crossVectors(pose.lookUp ?? up, hz);
    if (hx.lengthSq() < 1e-6) hx.crossVectors(up, hz);
    if (hx.lengthSq() < 1e-6) hx.copy(right);
    hx.normalize();
    const hy = new THREE.Vector3().crossVectors(hz, hx);
    m[BONE.head].makeBasis(hx, hy, hz).setPosition(j.head);

    // The arms.
    for (const side of [-1, 1] as const) {
      const L = side < 0;
      const shoulder = L ? j.shoulderL : j.shoulderR;
      const hand = L ? j.handL : j.handR;
      const elbow = L ? j.elbowL : j.elbowR;
      const upper = new THREE.Vector3().subVectors(elbow, shoulder);
      const fore = new THREE.Vector3().subVectors(hand, elbow);
      bone(m[L ? BONE.upperArmL : BONE.upperArmR], shoulder, upper, right, forward, upper.length() / LEN.upperArm);
      bone(m[L ? BONE.foreArmL : BONE.foreArmR], elbow, fore, right, up, fore.length() / LEN.foreArm);
    }

    // The legs; feet flat, or on the ends of their shins.
    for (const side of [-1, 1] as const) {
      const L = side < 0;
      const hip = L ? j.hipL : j.hipR;
      const ankle = L ? j.ankleL : j.ankleR;
      const knee = L ? j.kneeL : j.kneeR;
      const thigh = new THREE.Vector3().subVectors(knee, hip);
      bone(m[L ? BONE.thighL : BONE.thighR], hip, thigh, right, forward, thigh.length() / LEN.thigh);
      const shin = new THREE.Vector3().subVectors(ankle, knee);
      bone(m[L ? BONE.shinL : BONE.shinR], knee, shin, right, forward, shin.length() / LEN.shin);
      const foot = m[L ? BONE.footL : BONE.footR];
      if (pose.flatFeet ?? true) {
        // Sole down, toes the way the body faces (level); tipped onto its toes or its heel if the pose says.
        const toe = new THREE.Vector3(forward.x, 0, forward.z);
        if (toe.lengthSq() < 1e-6) toe.set(-up.x, 0, -up.z);
        if (toe.lengthSq() < 1e-6) toe.set(0, 0, -1);
        toe.normalize();
        const fy = new THREE.Vector3(0, 1, 0);
        const fx = new THREE.Vector3().crossVectors(toe, fy);
        const pitch = (L ? pose.footPitchL : pose.footPitchR) ?? 0;
        if (pitch) {
          toe.applyAxisAngle(fx, -pitch);
          fy.applyAxisAngle(fx, -pitch);
        }
        foot.makeBasis(fx, fy, toe.negate()).setPosition(ankle);
      } else {
        // Hanging on from its shin, the toes pointed: along the shin and toward its front.
        const along = shin.clone().normalize();
        const shinM = m[L ? BONE.shinL : BONE.shinR].elements;
        const front = new THREE.Vector3(shinM[8], shinM[9], shinM[10]).normalize();
        const toe = new THREE.Vector3().copy(along).multiplyScalar(0.75).addScaledVector(front, 0.65).normalize();
        const fx = new THREE.Vector3().crossVectors(toe, front).normalize();
        if (fx.lengthSq() < 1e-6) fx.copy(right);
        const fy = new THREE.Vector3().crossVectors(fx, toe);
        foot.makeBasis(fx, fy, toe.negate()).setPosition(ankle);
      }
    }
  }
}
