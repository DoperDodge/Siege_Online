// How a body holds itself (Phase 10 M8, render/DESIGN.md §11): from its state alone, where its hands and feet go,
// which way its head looks, and where the gun or the gadget in its hands is. The hitboxes place the trunk, the head,
// the shoulders and the hips (bodyRig.ts); this adds what they don't say: a gun shouldered and pointed where the body
// looks (lower from the hip, up to the eye when aiming), the other hand on its handguard, a reload, the knife, a
// gadget's throw or placing, a stride under a moving body, a ladder's rungs, a rope, a crawl.
//
// Nothing here is authored animation: every pose is computed, so it holds for any stance blend, lean, slope and
// weapon. And nothing here plays: the simulation never reads it.
import * as THREE from "three";
import { crouchWeight, currentHeight, DeployKind, eyePose, GadgetAct, PawnMode, TICK_HZ, ticks, proneWeight, ReloadKind, ropeIdle, WeaponAct, WFlag, type GameData, type Hitbox, type PawnState, type ResolvedWeapon } from "@redmond/shared";
import { BodyRig, LEN, type RigPose } from "./bodyRig.js";
import type { GunModel } from "./gunKit.js";

/** A body's stride and what else eases from frame to frame. */
export class Gait {
  /** The left foot's place in its cycle, 0…1 (the right's is half a cycle on). */
  phase = 0;
  /** How much of a stride shows: 0 standing … 1 moving. */
  amp = 0;
  /** Off the ground: 0 … 1. */
  air = 0;
  /** Sprinting: 0 … 1. */
  sprint = 0;
  /** Which way it moves in its own frame (forward, right). */
  dirF = 1;
  dirR = 0;
  /** When it was last advanced (seconds); negative: never. */
  at = -1;
}

/**
 * A gadget in the hands: its drawn size, held up to the face (a sensor, a tablet), or swung in both hands (a hammer:
 * how long its swing takes and when in it the blow lands, seconds, its data's).
 */
export interface HeldItem {
  size: readonly [number, number, number];
  up: boolean;
  swing: { swingS: number; hitS: number } | null;
}

export interface PoseIn {
  data: GameData;
  s: PawnState;
  /** poseHitboxes for the state, and the rig framed from them. */
  parts: readonly Hitbox[];
  rig: BodyRig;
  /**
   * The gun in its hands (none: a gadget is, or it's down); held like a pistol (pistolHeld) or shouldered; its
   * weapon's reload (null: none known, a reload just tips it).
   */
  gun: GunModel | null;
  pistol: boolean;
  reload: ResolvedWeapon["reload"] | null;
  /** A gadget in its hands instead. */
  held: HeldItem | null;
  /** Fuze's shield raised in front: his hands are on its grips (the hitboxes have them there). */
  shieldUp: boolean;
  gait: Gait;
  /** Seconds (any clock that runs on). */
  now: number;
  /** Ticks a weapon swap takes. */
  swapTicks: number;
}

/** Where something held is, in the world. */
export interface Placed {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export interface PoseOut {
  pose: RigPose;
  /** The gun: where it is, and whether its magazine is in it. Null: not in the hands (it isn't drawn). */
  gun: (Placed & { magIn: boolean; slung: boolean }) | null;
  held: Placed | null;
  /** The knife, mid-stab. */
  knife: Placed | null;
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const lerp = THREE.MathUtils.lerp;
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Held like a pistol: at arm's length in both hands (no stock to shoulder). */
export const pistolHeld = (weaponClass: string) => weaponClass === "handgun" || weaponClass === "machine_pistol" || weaponClass === "hand_cannon";

// The stance (metres, in the body's frame: right, up, forward from the point under it).
const FOOT_Y = 0.08;
const STAND = { l: v(-0.125, FOOT_Y, 0.1), r: v(0.135, FOOT_Y, -0.09) };
const CROUCH = { l: v(-0.14, FOOT_Y, 0.17), r: v(0.15, FOOT_Y, -0.15) };
const UNDER = { l: v(-0.115, FOOT_Y, 0.0), r: v(0.115, FOOT_Y, 0.0) };
/** How far a foot gets ahead of and behind its place in a stride (half its span), and to the side when stepping across. */
const STRIDE_HALF_M = 0.29;
const SIDE_HALF_M = 0.1;
/** From the ankle to the ball of the foot (a heel up lifts the ankle by this times the tip's sine). */
const BALL_M = 0.13;

/** The stride for a speed (m/s): how far the body goes in a cycle of two steps, and the share of it a foot is down. */
function strideFor(speed: number): { cycle: number; stance: number } {
  const cycle = Math.min(2.7, Math.max(1.0, 0.9 + 0.38 * speed));
  return { cycle, stance: Math.min(0.62, (2 * STRIDE_HALF_M) / cycle) };
}

/** One foot's place in its stride at phase p: how far along (−1 behind … 1 ahead), how high, how far onto its toes. */
function footCycle(p: number, stance: number, lift: number): { along: number; up: number; pitch: number } {
  if (p < stance) {
    // Down: carried back under the body; the heel comes up as it goes behind.
    const t = p / stance;
    const push = smooth((t - 0.55) / 0.45);
    return { along: 1 - 2 * t, up: 0, pitch: 0.55 * push };
  }
  // Up: swung forward, the toes trailing at first and up for the heel's landing.
  const t = (p - stance) / (1 - stance);
  const pitch = t < 0.5 ? lerp(0.55, 0.1, t / 0.5) : lerp(0.1, -0.22, (t - 0.5) / 0.5);
  return { along: -1 + 2 * smooth(t), up: Math.sin(Math.PI * t) * lift, pitch };
}

/**
 * Pose a body for its state. `rig.frame(parts)` first; the result's `pose` goes to `rig.solve`, and the gun, the
 * gadget and the knife to where it says.
 */
export function poseBody(i: PoseIn): PoseOut {
  const { data, s, rig, gait } = i;
  const m = data.movement;
  const j = rig.joints;
  const pose: RigPose = {};
  const out: PoseOut = { pose, gun: null, held: null, knife: null };

  const dt = gait.at < 0 ? 0 : Math.min(0.1, Math.max(0, i.now - gait.at));
  gait.at = i.now;

  // The view's frame, and the body's (the view's without its pitch: leaning rolls both, a rope turns both over).
  const eye = eyePose(m, data.hitboxes, s);
  const E = v(...eye.pos);
  const qView = new THREE.Quaternion().setFromEuler(new THREE.Euler(s.pitch, s.yaw, eye.roll, "YXZ"));
  const qBody = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.yaw, eye.roll, "YXZ"));
  const R = v(1, 0, 0).applyQuaternion(qBody);
  const U = v(0, 1, 0).applyQuaternion(qBody);
  const F = v(0, 0, -1).applyQuaternion(qBody);
  /** A point from `from`, `r` to the body's right, `u` up it, `f` ahead. */
  const at = (from: THREE.Vector3, r: number, u: number, f: number) => from.clone().addScaledVector(R, r).addScaledVector(U, u).addScaledVector(F, f);

  const prone = proneWeight(s);
  const crouch = crouchWeight(m, currentHeight(m, s)) * (1 - prone);
  const speed = Math.hypot(s.vx, s.vz);
  const walking = s.mode === PawnMode.Walk || s.mode === PawnMode.Vault;

  // The head looks where the view does (most of its pitch: the trunk can't bend to share it).
  pose.look = v(0, 0, -1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(s.pitch * 0.8, s.yaw, eye.roll, "YXZ")));
  pose.lookUp = U.clone();

  // ---- Lying: knocked onto its back, or down and crawling.
  if (s.mode === PawnMode.Knocked) {
    // Its arms fall out to its sides as it goes over; it looks up the way its chest faces.
    const lie = smooth(s.knockLie);
    pose.look = rig.forward.clone();
    pose.lookUp = rig.up.clone();
    pose.handL = rig.rest.handL.clone().lerp(j.shoulderL.clone().addScaledVector(rig.right, -0.42).addScaledVector(rig.up, -0.2).addScaledVector(rig.forward, 0.02), lie);
    pose.handR = rig.rest.handR.clone().lerp(j.shoulderR.clone().addScaledVector(rig.right, 0.42).addScaledVector(rig.up, -0.2).addScaledVector(rig.forward, 0.02), lie);
    pose.elbowL = rig.right.clone().multiplyScalar(-1).addScaledVector(rig.up, -0.4);
    pose.elbowR = rig.right.clone().addScaledVector(rig.up, -0.4);
    pose.flatFeet = false;
    return out;
  }
  if (s.mode === PawnMode.Downed) {
    // Down: one hand to the wound, the other dragging it along, the legs trailing (a crawl works them in turn).
    gait.phase = (gait.phase + (dt * speed) / 0.9) % 1;
    const reach = Math.sin(gait.phase * Math.PI * 2) * Math.min(1, speed / 0.3);
    pose.handL = at(j.shoulderL, -0.06, 0, 0).addScaledVector(rig.up, 0.34 + 0.12 * reach);
    pose.handL.y = Math.max(pose.handL.y, s.y + 0.06);
    pose.handR = j.pelvis.clone().lerp(j.chest, 0.45).addScaledVector(rig.right, 0.1).addScaledVector(rig.forward, 0.2);
    pose.elbowL = v(0, 0.3, 0).addScaledVector(rig.right, -1);
    pose.elbowR = v(0, 0.2, 0).addScaledVector(rig.right, 1);
    pose.kneeL = v(0, 0.15, 0).addScaledVector(rig.right, -1);
    pose.kneeR = v(0, 0.15, 0).addScaledVector(rig.right, 1);
    pose.footL = rig.rest.footL.clone().addScaledVector(rig.up, 0.14 * Math.max(0, reach));
    pose.footR = rig.rest.footR.clone().addScaledVector(rig.up, 0.14 * Math.max(0, -reach));
    pose.flatFeet = false;
    pose.legScale = rig.lyingLegs();
    return out;
  }

  // ---- The feet.
  const feet = v(s.x, s.y, s.z);
  const R0 = v(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
  const F0 = v(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
  const ground = (p: THREE.Vector3) => feet.clone().addScaledVector(R0, p.x).addScaledVector(F0, p.z).setY(s.y + p.y);
  gait.sprint = THREE.MathUtils.damp(gait.sprint, s.sprinting && walking ? 1 : 0, 9, dt);
  if (s.mode === PawnMode.Ladder) ladder(i, pose, at, out);
  else if (s.mode === PawnMode.Rappel) {
    // On a rope: the feet out ahead on the wall, the knees a little bent.
    pose.footL = at(j.hipL, -0.04, -0.52, 0.5);
    pose.footR = at(j.hipR, 0.04, -0.52, 0.5);
    pose.kneeL = F.clone().addScaledVector(U, 0.6).addScaledVector(R, -0.2);
    pose.kneeR = F.clone().addScaledVector(U, 0.6).addScaledVector(R, 0.2);
    pose.flatFeet = false;
  } else if (prone < 1) {
    // Standing or crouched: the feet set apart, the left ahead; moving, a stride along the way it goes.
    const vF = s.vx * F0.x + s.vz * F0.z;
    const vR = s.vx * R0.x + s.vz * R0.z;
    const moving = s.grounded && speed > 0.25;
    gait.amp = THREE.MathUtils.damp(gait.amp, moving ? Math.min(1, speed / 1.2) : 0, 10, dt);
    gait.air = THREE.MathUtils.damp(gait.air, s.grounded || s.mode !== PawnMode.Walk ? 0 : 1, 12, dt);
    if (speed > 0.25) {
      gait.dirF = THREE.MathUtils.damp(gait.dirF, vF / speed, 12, dt);
      gait.dirR = THREE.MathUtils.damp(gait.dirR, vR / speed, 12, dt);
    }
    const st = strideFor(speed);
    gait.phase = (gait.phase + (dt * speed) / st.cycle) % 1;
    const lift = lerp(0.07, 0.17, gait.sprint) * lerp(1, 0.7, crouch);
    const idle = { l: STAND.l.clone().lerp(CROUCH.l, crouch), r: STAND.r.clone().lerp(CROUCH.r, crouch) };
    for (const left of [true, false]) {
      const c = footCycle((gait.phase + (left ? 0 : 0.5)) % 1, st.stance, lift);
      const base = left ? UNDER.l : UNDER.r;
      const stride = v(base.x + gait.dirR * c.along * SIDE_HALF_M, base.y + c.up + Math.sin(Math.max(0, c.pitch)) * BALL_M, base.z + gait.dirF * c.along * STRIDE_HALF_M);
      const p = (left ? idle.l : idle.r).clone().lerp(stride, gait.amp);
      // In the air the legs hang a little bent.
      p.lerp(v(base.x, FOOT_Y + 0.1, -0.06), gait.air);
      const w = ground(p);
      // (A body going prone: the feet slide out to where the lying hitboxes have them.)
      if (prone > 0) w.lerp(left ? rig.rest.footL : rig.rest.footR, prone);
      if (left) {
        pose.footL = w;
        pose.footPitchL = c.pitch * gait.amp * (1 - gait.air);
      } else {
        pose.footR = w;
        pose.footPitchR = c.pitch * gait.amp * (1 - gait.air);
      }
    }
    pose.kneeL = F.clone().addScaledVector(R, -0.12 - 0.25 * crouch).addScaledVector(U, 0.2);
    pose.kneeR = F.clone().addScaledVector(R, 0.12 + 0.25 * crouch).addScaledVector(U, 0.2);
    pose.flatFeet = prone < 0.5;
  } else {
    // Prone: the legs as the hitboxes lie (short: the model's shorten to them); crawling, each knee is drawn up in turn.
    gait.phase = (gait.phase + (dt * speed) / 0.8) % 1;
    const crawl = Math.sin(gait.phase * Math.PI * 2) * Math.min(1, speed / 0.4);
    pose.footL = rig.rest.footL.clone().addScaledVector(rig.up, 0.16 * Math.max(0, crawl));
    pose.footR = rig.rest.footR.clone().addScaledVector(rig.up, 0.16 * Math.max(0, -crawl));
    pose.flatFeet = false;
    pose.kneeL = v(0, 0.25, 0).addScaledVector(R, -1);
    pose.kneeR = v(0, 0.25, 0).addScaledVector(R, 1);
  }
  if (prone > 0) pose.legScale = lerp(1, rig.lyingLegs(), prone);

  // ---- The hands.
  if (s.mode === PawnMode.Ladder) return out;
  // Elbows: down and out from the body (a lying body's out to its sides).
  const elbowL = U.clone().multiplyScalar(-1).addScaledVector(R, lerp(-0.4, -1.3, prone)).addScaledVector(F, -0.15);
  const elbowR = U.clone().multiplyScalar(-1).addScaledVector(R, lerp(0.7, 1.3, prone)).addScaledVector(F, -0.3);
  pose.elbowL = elbowL;
  pose.elbowR = elbowR;

  // Busy with something a body does with its hands (work, below): reviving, building, the defuser, a pick-up.
  const working = s.reviveTicks > 0 || s.deployKind !== 0;
  if (i.held && !working) {
    gadget(i, pose, out, { E, qView, qBody, R, U, F, at });
    return out;
  }
  if (!i.gun) {
    if (working) work(i, pose, { E, R, U, F, at });
    return out;
  }
  const gun = i.gun;
  const aim = smooth(s.adsQ / 65535);
  const pistol = i.pistol;
  const qGun = qView.clone();
  let origin: THREE.Vector3;
  let slung = false;
  if (working) {
    // Both hands at work: the gun hangs across the chest on its sling.
    work(i, pose, { E, R, U, F, at });
    slung = true;
    qGun.copy(qBody).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.15, 0.5, 0.2, "YXZ")));
    origin = at(j.chest, 0.06, -0.2, 0.17).sub(gun.hold.grip.clone().applyQuaternion(qGun));
  } else if (i.shieldUp) {
    // Behind Fuze's raised shield: in his right hand where the hitboxes have it (on the plate's grip, and out past its
    // side as he aims: D-169).
    origin = rig.rest.handR.clone().sub(gun.hold.grip.clone().applyQuaternion(qGun));
  } else if (pistol) {
    // At arm's length ahead of the shoulders: low and close from the hip, up on the eye's line aiming. It turns up and
    // down about the shoulders' line (the arms', so they reach at any angle).
    const pivot = at(j.chest, 0, 0.046, 0);
    const eyeUp = E.clone().sub(pivot).dot(U);
    const sight = v(lerp(0.06, 0.012, aim), eyeUp + lerp(-0.2, -0.03, aim), -lerp(0.4, 0.5, aim));
    origin = pivot.add(sight.applyQuaternion(qView)).sub(gun.sight.clone().applyQuaternion(qGun));
  } else {
    // Shouldered: its butt at the right shoulder (from the hip), up beside the jaw aiming (the sight a little under the
    // eye's line: the head stays where it's hit); it turns up and down about its butt.
    const butt = v(0, gun.sight.y - 0.09, gun.hold.back);
    const sr = j.shoulderR;
    const toEye = E.clone().sub(sr);
    const adsR = toEye.dot(R) + 0.03;
    const adsU = toEye.dot(U) - 0.135;
    const hipR = -0.115;
    const hipU = Math.min(0.03, adsU);
    // (Pointed steeply up or down it comes off the jaw, back toward the shoulder: the arms reach.)
    const up = aim * (1 - 0.75 * smooth((Math.abs(s.pitch) - 0.4) / 0.5));
    const place = at(sr, lerp(hipR, adsR, up), lerp(hipU, adsU, up), lerp(0.06, 0.045, aim));
    origin = place.sub(butt.clone().applyQuaternion(qGun));
  }

  // Sprinting: the gun down across the body. Swapping: the new one comes up. Reloading: tipped over, the other hand to
  // its magazine and the pouch. The knife: the gun drops as the blade goes in.
  let magIn = true;
  let leftOff: THREE.Vector3 | null = null;
  let rightOff: THREE.Vector3 | null = null;
  /** A reload's left hand, given where it holds the gun and where the magazine is (both in the world). */
  let reloadHand: ((fore: THREE.Vector3, atMag: THREE.Vector3) => THREE.Vector3) | null = null;
  // Going along a rope, onto it or over on it: the left hand on the rope over the harness.
  if (s.mode === PawnMode.Rappel && !ropeIdle(s)) leftOff = v(s.x, s.y + m.stance.stand.height / 2 + (s.ropeTurn > 0.5 ? 0.05 : 0.62), s.z).addScaledVector(F, 0.16);
  if (!slung) {
    if (gait.sprint > 0.001 && !i.shieldUp) {
      const q = qBody.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pistol ? -0.9 : -0.5, pistol ? 0.1 : 0.75, 0.15, "YXZ")));
      const grip = at(j.chest, pistol ? 0.2 : 0.14, pistol ? -0.34 : -0.2, pistol ? 0.16 : 0.2);
      const o = grip.sub(gun.hold.grip.clone().applyQuaternion(q));
      qGun.slerp(q, gait.sprint);
      origin.lerp(o, gait.sprint);
    }
    if (s.wAct === WeaponAct.Equip) {
      const p = 1 - smooth(s.actTicks / Math.max(1, i.swapTicks));
      origin.addScaledVector(U, -0.3 * p).addScaledVector(F, -0.08 * p);
      qGun.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9 * p, 0, 0)));
    } else if (s.wAct === WeaponAct.Reload && i.reload && i.reload.kind !== "none") {
      const r = i.reload;
      const pouch = at(j.pelvis, -0.2, 0.03, 0.06);
      if (r.kind === "magazine") {
        const tac = s.reloadKind === ReloadKind.Tactical;
        const total = Math.max(1, tac ? r.tacticalTicks : r.emptyTicks);
        const t = Math.min(1, s.actTicks / total);
        const tOut = (tac ? r.magOutTacticalTicks : r.magOutEmptyTicks) / total;
        const tIn = (tac ? r.refillTacticalTicks : r.refillEmptyTicks) / total;
        magIn = !(s.wflags & WFlag.MagOut) || (s.wflags & WFlag.Refilled) !== 0;
        const dip = Math.sin(Math.PI * t);
        origin.addScaledVector(U, -0.05 * dip);
        qGun.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2 * dip, 0, 0.45 * dip)));
        const mid = (tOut + tIn) / 2;
        // To the magazine, down to the pouch with it, back up with the new one, and on to the handguard.
        reloadHand = (fore, atMag) => {
          if (t < tOut) return fore.lerp(atMag, smooth(t / Math.max(0.01, tOut * 0.7)));
          if (t < mid) return atMag.lerp(pouch, smooth((t - tOut) / Math.max(0.01, mid - tOut)));
          if (t < tIn) return pouch.lerp(atMag, smooth((t - mid) / Math.max(0.01, tIn - mid)));
          return atMag.lerp(fore, smooth((t - tIn) / Math.max(0.01, (1 - tIn) * 0.8)));
        };
      } else {
        // A shell at a time: from the pouch to the port and back.
        const per = Math.max(1, r.perShellTicks);
        const t = (s.actTicks % per) / per;
        qGun.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0.5)));
        reloadHand = (_fore, atMag) => pouch.lerp(atMag, Math.sin(Math.PI * t));
      }
    }
    if (s.meleeTicks > 0) {
      const cycle = Math.max(1, ticks(data.combat.melee.cycleSeconds));
      const p = Math.min(1, (s.meleeTicks - 1) / cycle);
      const stab = Math.sin(Math.PI * Math.min(1, p * 1.5));
      origin.addScaledVector(U, -0.16 * stab).addScaledVector(R, -0.06 * stab);
      qGun.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5 * stab, 0.3 * stab, 0)));
      // The knife in the right hand, out along the view from the shoulder.
      const from = at(j.shoulderR, -0.02, -0.14, 0.2);
      rightOff = from.addScaledVector(v(0, 0, -1).applyQuaternion(qView), 0.1 + 0.34 * stab);
      out.knife = { position: rightOff.clone().addScaledVector(v(0, 0, -1).applyQuaternion(qView), 0.05), quaternion: qView.clone() };
    }
  }

  // The hands on it: the right on its grip; the left under its handguard, as far along as the arm goes, or (a pistol,
  // a gun with no room there) on the grip with the right. Behind a raised shield the left stays on the plate.
  const onGun = (p: THREE.Vector3) => p.clone().applyQuaternion(qGun).add(origin);
  if (!slung) {
    pose.handR = rightOff ?? onGun(gun.hold.grip);
    if (!i.shieldUp) {
      // Where the left hand holds it: under the handguard, drawn back toward the grip until the arm reaches (the body
      // stands square on, as its hitboxes do: the hand of a long gun ends up at its magazine well).
      let fore: THREE.Vector3;
      if (gun.hold.fore && !pistol) {
        fore = gun.hold.fore.clone();
        const reach = (LEN.upperArm + LEN.foreArm) * 0.97;
        for (let k = 0; k < 24 && onGun(fore).distanceTo(j.shoulderL) > reach && fore.z < gun.hold.grip.z - 0.07; k++) fore.z += 0.02;
      } else fore = v(gun.hold.grip.x - 0.028, gun.hold.grip.y - 0.012, gun.hold.grip.z - 0.012);
      if (leftOff) pose.handL = leftOff;
      else if (reloadHand) pose.handL = reloadHand(onGun(fore), onGun(gun.hold.mag ?? v(0, gun.hold.grip.y + 0.02, gun.hold.grip.z - 0.1)));
      else pose.handL = onGun(fore);
    }
    // Aiming down a long gun, the head goes over to its stock.
    if (!pistol && aim > 0) pose.lookUp = U.clone().addScaledVector(R, 0.2 * aim);
  }
  out.gun = { position: origin, quaternion: qGun, magIn, slung };
  return out;
}

interface Frame {
  E: THREE.Vector3;
  R: THREE.Vector3;
  U: THREE.Vector3;
  F: THREE.Vector3;
  at: (from: THREE.Vector3, r: number, u: number, f: number) => THREE.Vector3;
}

/**
 * The hands at work (the gun slung meanwhile), moving as they work: up on a wall putting up a reinforcement or a
 * barricade, or taking one down; down ahead reviving who's on the floor, planting the defuser or disabling it; one
 * hand down for something picked up; a hand to the other arm pulling a needle out.
 */
function work(i: PoseIn, pose: RigPose, f: Frame): void {
  const j = i.rig.joints;
  const beat = Math.sin(i.now * 9);
  const kind = i.s.deployKind;
  const down = () => (pose.look = f.F.clone().addScaledVector(f.U, -0.9).normalize());
  if (i.s.reviveTicks > 0 || kind === DeployKind.Plant || kind === DeployKind.Disable) {
    pose.handL = f.at(j.chest, -0.13, -0.5, 0.42);
    pose.handR = f.at(j.chest, 0.13, -0.5 + 0.04 * beat, 0.42);
    down();
  } else if (kind === DeployKind.PickUp) {
    pose.handR = f.at(j.chest, 0.12, -0.52, 0.4);
    down();
  } else if (kind === DeployKind.Needle) {
    pose.handR = f.at(j.shoulderL, 0.02, -0.2 + 0.02 * beat, 0.14);
    pose.handL = f.at(j.shoulderL, -0.02, -0.32, 0.22);
  } else {
    pose.handL = f.at(j.chest, -0.13, -0.02 + 0.05 * beat, 0.5);
    pose.handR = f.at(j.chest, 0.13, -0.06 - 0.05 * beat, 0.5);
  }
}

/** On a ladder: hands and feet on its rungs in turn as it climbs, the gun slung. */
function ladder(i: PoseIn, pose: RigPose, at: Frame["at"], out: PoseOut): void {
  const { s, rig } = i;
  const j = rig.joints;
  const RUNG = 0.3;
  // Rungs are at their heights in the world; each hand and foot takes the one nearest where it wants to be, the left
  // and right a rung apart.
  const rung = (y: number, odd: boolean) => (Math.round((y - (odd ? RUNG : 0)) / (2 * RUNG)) * 2 + (odd ? 1 : 0)) * RUNG;
  const hands = j.chest.y + 0.18;
  const feetY = s.y + 0.2;
  pose.handL = at(j.shoulderL, 0.04, 0, 0.36).setY(rung(hands, false));
  pose.handR = at(j.shoulderR, -0.04, 0, 0.36).setY(rung(hands, true));
  pose.footL = at(j.hipL, -0.02, 0, 0.3).setY(rung(feetY, true) + 0.08);
  pose.footR = at(j.hipR, 0.02, 0, 0.3).setY(rung(feetY, false) + 0.08);
  pose.kneeL = rig.forward.clone().addScaledVector(rig.right, -0.35);
  pose.kneeR = rig.forward.clone().addScaledVector(rig.right, 0.35);
  pose.look = rig.forward.clone().addScaledVector(rig.up, 0.35).normalize();
  pose.flatFeet = true;
  if (i.gun) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.yaw, 0, "YXZ")).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.2, 0.5, 0.2, "YXZ")));
    out.gun = { position: at(j.chest, 0.05, -0.22, -0.16).sub(i.gun.hold.grip.clone().applyQuaternion(q)), quaternion: q, magIn: true, slung: true };
  }
}

/** A gadget in the hands: carried ready, held up to the face, drawn back for a throw, pressed on for placing, swung. */
function gadget(i: PoseIn, pose: RigPose, out: PoseOut, f: Frame & { qView: THREE.Quaternion; qBody: THREE.Quaternion }): void {
  const { s, rig } = i;
  const held = i.held!;
  const j = rig.joints;
  const aimDir = new THREE.Vector3(0, 0, -1).applyQuaternion(f.qView);
  const [w, h] = held.size;
  const q = f.qView.clone();
  let item: THREE.Vector3;
  const t = s.gTicks / TICK_HZ;
  const rules = i.data.gadgetRules;
  if (held.swing) {
    // A hammer in both hands, its head up over the right shoulder; the blow comes over and down ahead as it lands, and
    // back up after.
    let blow = 0;
    if (s.gAct === GadgetAct.Swing) {
      const p = Math.min(1, t / Math.max(1e-3, held.swing.swingS));
      const hit = held.swing.hitS / Math.max(1e-3, held.swing.swingS);
      blow = p < hit ? smooth(p / Math.max(1e-3, hit)) : 1 - smooth((p - hit) / Math.max(1e-3, 1 - hit));
    }
    // Its handle stands along its own y, the head at the top: tipped back over the shoulder, then over and down ahead.
    q.copy(f.qBody).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(lerp(0.5, -1.45, blow), 0.2 * (1 - blow), 0, "YXZ")));
    const along = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    // The right hand low on its wrapped grip, ahead of the chest; the left a third of the way up it.
    const low = -h / 2 + h * 0.12;
    const grip = f.at(j.chest, 0.08, lerp(-0.2, -0.26, blow), lerp(0.24, 0.42, blow));
    item = grip.clone().addScaledVector(along, -low);
    pose.handR = grip;
    pose.handL = grip.clone().addScaledVector(along, h * 0.3);
  } else if (held.up) {
    // Held up in both hands to look at.
    item = f.E.clone().add(new THREE.Vector3(0, -0.07, -0.3).applyQuaternion(f.qView));
    pose.handL = item.clone().addScaledVector(f.R, -(w / 2 + 0.01)).addScaledVector(f.U, -0.02);
    pose.handR = item.clone().addScaledVector(f.R, w / 2 + 0.01).addScaledVector(f.U, -0.02);
    pose.look = aimDir.clone().addScaledVector(f.U, -0.2).normalize();
  } else {
    // In the right hand ahead of the chest; back over the shoulder for a throw, low behind for a lob, out ahead in
    // both hands to place; coming up from the belt as it's taken out.
    const ready = f.at(j.chest, 0.17, -0.12, 0.3).addScaledVector(aimDir, 0.04);
    let hand = ready;
    const windup = smooth(t / Math.max(1e-3, rules.throw.windupS));
    if (s.gAct === GadgetAct.Equip) hand = f.at(j.pelvis, 0.2, 0.02, 0.1).lerp(ready, smooth(t / Math.max(1e-3, rules.equipS)));
    else if (s.gAct === GadgetAct.Throw) hand = ready.lerp(f.at(j.shoulderR, 0.08, 0.2, -0.16), windup);
    else if (s.gAct === GadgetAct.Lob) hand = ready.lerp(f.at(j.shoulderR, 0.06, -0.5, -0.12), windup);
    else if (s.gAct === GadgetAct.Place) {
      hand = ready.lerp(f.E.clone().add(new THREE.Vector3(0.09, -0.2, -0.46).applyQuaternion(f.qView)), smooth(t / 0.25));
      pose.handL = hand.clone().addScaledVector(f.R, -0.18);
    }
    pose.handR = hand;
    // The item sits in the fist, most of it over it.
    item = hand.clone().addScaledVector(f.U, Math.min(0.08, h * 0.35)).addScaledVector(aimDir, 0.03);
  }
  out.held = { position: item, quaternion: q };
}
