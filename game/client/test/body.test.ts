// The operators' bodies (Phase 10 M8, render/DESIGN.md §11), without a GPU: every operator has a look and a body
// within the budget; what's drawn is where it's hit (the skeleton's joints are the hitboxes' own, the trunk and the
// head stay inside them, the body under its capsule's top); the IK's math; a gun is shouldered and pointed where the
// body looks, both hands on it, for every weapon and stance; a stride's planted foot doesn't slide; a dead body falls
// and comes to rest on the floor with its bones their length; the pawn view draws it, hides it in first person, and
// carries what's on its back until it's used.
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  Btn,
  defaultLoadoutPick,
  eyePose,
  Hand,
  initialPawnState,
  isGun,
  loadGameData,
  loadPresentationData,
  PawnMode,
  poseHitboxes,
  ReloadKind,
  resolveLoadout,
  resolveWeapon,
  ShieldAt,
  shieldHold,
  Stance,
  WeaponAct,
  type Hitbox,
  type PawnState,
} from "@redmond/shared";
import { buildBody, operatorLook } from "../src/render/bodyModel.js";
import { Gait, pistolHeld, poseBody, type PoseIn } from "../src/render/bodyPose.js";
import { Ragdoll } from "../src/render/bodyRagdoll.js";
import { BONE, BONES, BodyRig, LEN, twoBone } from "../src/render/bodyRig.js";
import { buildGun, type GunModel } from "../src/render/gunKit.js";
import { PawnView } from "../src/render/labScene.js";

const data = loadGameData();
const m = data.movement;
const hbData = data.hitboxes;

function state(over: Partial<PawnState> = {}): PawnState {
  return { ...initialPawnState(0, 0, 0, 0, 100), grounded: true, ...over };
}
const STANCES: Record<string, Partial<PawnState>> = {
  stand: {},
  crouch: { stance: Stance.Crouch, stanceFrom: Stance.Crouch },
  prone: { stance: Stance.Prone, stanceFrom: Stance.Prone },
  leanLeft: { lean: -1 },
  crouchLeanRight: { stance: Stance.Crouch, stanceFrom: Stance.Crouch, lean: 1 },
  halfCrouched: { stance: Stance.Crouch, stanceFrom: Stance.Stand, stanceT: 0.5 },
  goingProne: { stance: Stance.Prone, stanceFrom: Stance.Crouch, stanceT: 0.6 },
  knocked: { mode: PawnMode.Knocked, knockLie: 1, knockTicks: 30 },
  upsideDown: { mode: PawnMode.Rappel, ropeTurn: 1, y: 2 },
  onItsSide: { mode: PawnMode.Rappel, ropeTurn: 0.5, y: 2 },
  turned: { yaw: 2.2, x: 4, z: -3 },
};

/** How far a point is outside a capsule (negative: inside). */
function gap(p: THREE.Vector3, hb: Hitbox): number {
  const a = new THREE.Vector3(...hb.a);
  const ab = new THREE.Vector3(...hb.b).sub(a);
  const t = ab.lengthSq() > 0 ? Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq())) : 0;
  return p.distanceTo(a.addScaledVector(ab, t)) - hb.radius;
}

/** A body's vertices where its bones put them, with the bone each rides. */
function posed(geo: THREE.BufferGeometry, matrices: readonly THREE.Matrix4[], bone?: number): { p: THREE.Vector3; bone: number }[] {
  const pos = geo.getAttribute("position");
  const skin = geo.getAttribute("skinIndex");
  const out: { p: THREE.Vector3; bone: number }[] = [];
  for (let i = 0; i < pos.count; i++) {
    const b = bone ?? skin.getX(i);
    out.push({ p: new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(matrices[b]), bone: b });
  }
  return out;
}

const OPERATORS = [...data.operators.keys()];

describe("the operators' looks and bodies (operator_looks.json, render/bodyModel.ts)", () => {
  it("every operator has a look of its own, and a body within the budget, bound a vertex to a bone", () => {
    const looks = loadPresentationData().operatorLooks.looks;
    expect(OPERATORS.length).toBe(18); // the twelve, Ohm, Tonic, Shunt, Latch, Bailiff and Rivet (R3)
    const seen = new Set<string>();
    for (const id of [...OPERATORS, "default"]) {
      expect(looks[id], `${id} has a look`).toBeDefined();
      const look = operatorLook(id);
      seen.add(JSON.stringify(look));
      const g = buildBody(look);
      // PLAN §12.2: a character ≤ 40k triangles; ours is a small part of that (so no LODs are needed: §13).
      expect(g.triangles, `${id}'s triangles`).toBeGreaterThan(2500);
      expect(g.triangles, `${id}'s triangles`).toBeLessThan(9000);
      const pos = g.body.getAttribute("position");
      const nor = g.body.getAttribute("normal");
      const skin = g.body.getAttribute("skinIndex");
      const weight = g.body.getAttribute("skinWeight");
      const used = new Set<number>();
      for (let i = 0; i < pos.count; i++) {
        expect(weight.getX(i)).toBe(1);
        expect(weight.getY(i) + weight.getZ(i) + weight.getW(i)).toBe(0);
        used.add(skin.getX(i));
        expect(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i))).toBeCloseTo(1, 4);
        expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
      }
      // Every bone carries something.
      expect([...used].sort((a, b) => a - b)).toEqual(BONES.map((_, i) => i));
      expect(look.back === "none").toBe(g.back === null);
      g.body.dispose();
      g.back?.dispose();
    }
    // No two operators dressed the same.
    expect(seen.size).toBe(OPERATORS.length + 1);
    expect(operatorLook("nobody")).toBe(looks.default);
  });
});

describe("the skeleton (render/bodyRig.ts)", () => {
  it("two-bone IK keeps the bones' lengths, bends toward the hint, and stretches only past reach", () => {
    const root = new THREE.Vector3(0.2, 1.4, 0);
    const mid = new THREE.Vector3();
    const hint = new THREE.Vector3(0.3, -1, 0.2);
    for (const target of [new THREE.Vector3(0.1, 1.05, -0.35), new THREE.Vector3(0.25, 1.38, -0.1), new THREE.Vector3(0.5, 1.2, 0.2)]) {
      const k = twoBone(root, target, 0.29, 0.33, hint, mid);
      expect(k).toBe(1);
      expect(mid.distanceTo(root)).toBeCloseTo(0.29, 6);
      expect(mid.distanceTo(target)).toBeCloseTo(0.33, 6);
      // The bend is on the hint's side of the line from the root to the target.
      const dir = target.clone().sub(root).normalize();
      const off = mid.clone().sub(root);
      off.addScaledVector(dir, -off.dot(dir));
      expect(off.dot(hint)).toBeGreaterThan(0);
    }
    // Past reach: both bones stretched alike, straight.
    const far = new THREE.Vector3(0.2, 1.4, -0.93);
    const k = twoBone(root, far, 0.29, 0.33, hint, mid);
    expect(k).toBeCloseTo(0.93 / 0.62, 6);
    expect(mid.distanceTo(root) + mid.distanceTo(far)).toBeCloseTo(0.93, 6);
  });

  it("a lying body's legs shorten to its hitboxes' (which are short) and still bend at the knee", () => {
    const rig = new BodyRig();
    const standing = poseHitboxes(m, hbData, state());
    rig.frame(standing);
    expect(rig.lyingLegs()).toBeCloseTo(1, 1);
    const lying = poseHitboxes(m, hbData, state(STANCES.prone));
    rig.frame(lying);
    const scale = rig.lyingLegs();
    expect(scale).toBeGreaterThan(0.6);
    expect(scale).toBeLessThan(0.85);
    rig.solve({ legScale: scale, flatFeet: false });
    const j = rig.joints;
    // Thigh and shin shortened alike; the ankle where the hitbox's leg ends; no stretch.
    expect(j.hipL.distanceTo(j.kneeL)).toBeCloseTo(LEN.thigh * scale, 6);
    expect(j.kneeL.distanceTo(j.ankleL)).toBeCloseTo(LEN.shin * scale, 6);
    expect(j.ankleL.distanceTo(new THREE.Vector3(...lying[6].b))).toBeLessThan(1e-9);
    // A foot drawn up toward the hip (a crawl) bends the knee rather than shrinking the leg more.
    const up = rig.rest.footL.clone().lerp(j.hipL, 0.3);
    rig.solve({ legScale: scale, flatFeet: false, footL: up });
    expect(j.hipL.distanceTo(j.kneeL)).toBeCloseTo(LEN.thigh * scale, 6);
    const line = up.clone().sub(j.hipL).normalize();
    const off = j.kneeL.clone().sub(j.hipL);
    expect(off.addScaledVector(line, -off.dot(line)).length()).toBeGreaterThan(0.12);
  });

  it("hangs on the hitboxes: the head, shoulders and hips are theirs in every stance; each bone spans its joints", () => {
    const rig = new BodyRig();
    for (const [name, over] of Object.entries(STANCES)) {
      const s = state(over);
      const parts = poseHitboxes(m, hbData, s);
      rig.frame(parts);
      rig.solve({ legScale: name === "prone" ? rig.lyingLegs() : 1 });
      const j = rig.joints;
      const eq = (a: THREE.Vector3, b: readonly number[], what: string) => expect(a.distanceTo(new THREE.Vector3(...b)), `${name}: ${what}`).toBeLessThan(1e-9);
      eq(j.head, parts[0].a, "head");
      eq(j.shoulderL, parts[4].a, "left shoulder");
      eq(j.shoulderR, parts[5].a, "right shoulder");
      eq(j.hipL, parts[6].a, "left hip");
      eq(j.hipR, parts[7].a, "right hip");
      eq(j.handL, parts[4].b, "left hand");
      eq(j.ankleR, parts[7].b, "right ankle");
      // The frame is square and right-handed, its front the way the body faces (a standing body's: its yaw).
      expect(Math.abs(rig.right.dot(rig.up))).toBeLessThan(1e-9);
      expect(rig.forward.clone().cross(rig.right).distanceTo(rig.up.clone().negate())).toBeLessThan(1e-9);
      if (name === "stand" || name === "turned") expect(rig.forward.distanceTo(new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)))).toBeLessThan(1e-9);
      // Each bone: at its joint, its y to the next one, its axes square (y stretched to span).
      const span: [number, THREE.Vector3, THREE.Vector3, number][] = [
        [BONE.upperArmL, j.shoulderL, j.elbowL, LEN.upperArm],
        [BONE.foreArmL, j.elbowL, j.handL, LEN.foreArm],
        [BONE.upperArmR, j.shoulderR, j.elbowR, LEN.upperArm],
        [BONE.foreArmR, j.elbowR, j.handR, LEN.foreArm],
        [BONE.thighL, j.hipL, j.kneeL, LEN.thigh],
        [BONE.shinL, j.kneeL, j.ankleL, LEN.shin],
        [BONE.thighR, j.hipR, j.kneeR, LEN.thigh],
        [BONE.shinR, j.kneeR, j.ankleR, LEN.shin],
        [BONE.spine, j.pelvis, j.chest, LEN.spine],
      ];
      for (const [b, from, to, len] of span) {
        const mat = rig.matrices[b];
        expect(new THREE.Vector3().setFromMatrixPosition(mat).distanceTo(from), `${name}: ${BONES[b]} at its joint`).toBeLessThan(1e-9);
        expect(new THREE.Vector3(0, len, 0).applyMatrix4(mat).distanceTo(to), `${name}: ${BONES[b]} spans`).toBeLessThan(1e-6);
      }
      for (const mat of rig.matrices) {
        const [x, y, z] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        mat.extractBasis(x, y, z);
        expect(x.length()).toBeCloseTo(1, 6);
        expect(z.length()).toBeCloseTo(1, 6);
        expect(Math.abs(x.dot(y)) + Math.abs(y.dot(z)) + Math.abs(x.dot(z))).toBeLessThan(1e-6);
        expect(x.clone().cross(y).dot(z)).toBeGreaterThan(0);
      }
    }
  });
});

describe("what's drawn is where it's hit", () => {
  it("the head and the trunk stay in their hitboxes, and the body under its capsule's top, in every stance", () => {
    const worst: Record<string, number> = {};
    for (const id of [...OPERATORS, "default"]) {
      const g = buildBody(operatorLook(id));
      const rig = new BodyRig();
      for (const [name, over] of Object.entries(STANCES)) {
        const s = state(over);
        const parts = poseHitboxes(m, hbData, s);
        rig.frame(parts);
        rig.solve({ flatFeet: name !== "prone" && name !== "knocked" && name !== "upsideDown" && name !== "onItsSide", legScale: name === "prone" || name === "goingProne" ? rig.lyingLegs() : 1 });
        const verts = posed(g.body, rig.matrices);
        // The head's parts: in the head's sphere, give or take a helmet's thickness and a mask's snout.
        // The trunk's (the pelvis, the belly, the chest, the neck): in the trunk's capsules, give or take a pouch's depth.
        let head = -Infinity;
        let trunk = -Infinity;
        const past = (p: THREE.Vector3) => Math.min(...parts.slice(0, 6).map((hb) => gap(p, hb)));
        for (const { p, bone } of verts) {
          if (bone === BONE.head) head = Math.max(head, gap(p, parts[0]));
          else if (bone === BONE.pelvis || bone === BONE.spine || bone === BONE.chest || bone === BONE.neck) trunk = Math.max(trunk, past(p));
        }
        worst[`head ${id}`] = Math.max(worst[`head ${id}`] ?? -1, head);
        worst[`trunk ${id}`] = Math.max(worst[`trunk ${id}`] ?? -1, trunk);
        expect(head, `${id} ${name}: the head past its hitbox`).toBeLessThan(0.06);
        expect(trunk, `${id} ${name}: the trunk past its hitboxes`).toBeLessThan(0.1);
        // What's carried on the back is kit, not body: a pack keeps as close; only Sledge's hammer (its head over his
        // shoulder) and a radio's aerial stand off it.
        if (g.back) {
          const back = posed(g.back, rig.matrices, BONE.chest);
          verts.push(...back);
          expect(Math.max(...back.map(({ p }) => past(p))), `${id} ${name}: what's on its back`).toBeLessThan(operatorLook(id).back === "hammer" || operatorLook(id).back === "radio" ? 0.2 : 0.1);
        }
        // Upright on the floor: nothing over the capsule the body moves in, nothing under the floor.
        if (name === "stand" || name === "crouch" || name === "leanLeft" || name === "halfCrouched") {
          const height = Math.max(...parts.map((hb) => Math.max(hb.a[1], hb.b[1]) + hb.radius));
          let top = -Infinity;
          let bottom = Infinity;
          for (const { p } of verts) {
            top = Math.max(top, p.y);
            bottom = Math.min(bottom, p.y);
          }
          expect(top, `${id} ${name}: its top`).toBeLessThan(height + 0.03);
          expect(bottom, `${id} ${name}: its soles`).toBeGreaterThan(-0.012);
          expect(bottom, `${id} ${name}: its soles`).toBeLessThan(0.02);
        }
      }
      g.body.dispose();
      g.back?.dispose();
    }
    // (What the loosest are: a record for whoever tightens them.)
    expect(Math.max(...Object.values(worst))).toBeLessThan(0.1);
  });
});

/** The pose for a state with a gun in the hands. */
function withGun(s: PawnState, gun: GunModel, weaponClass: string, over: Partial<PoseIn> = {}) {
  const rig = new BodyRig();
  const parts = poseHitboxes(m, hbData, s);
  rig.frame(parts);
  const gait = new Gait();
  gait.at = 0;
  const posedBody = poseBody({ data, s, parts, rig, gun, pistol: pistolHeld(weaponClass), reload: null, held: null, shieldUp: false, gait, now: 0, swapTicks: 30, ...over });
  rig.solve(posedBody.pose);
  return { rig, parts, out: posedBody };
}

describe("holding a gun (render/bodyPose.ts)", () => {
  it("every weapon is pointed where the body looks with both hands on it, in every stance, from the hip and aimed", () => {
    const problems: string[] = [];
    let checked = 0;
    for (const w of data.weapons.values()) {
      if (!isGun(w)) continue;
      const weapon = resolveWeapon(data, { weapon: w.id, sight: null, barrel: null, grip: null, underbarrel: null });
      const gun = buildGun({ id: w.id, class: w.class, pick: weapon.pick });
      // Its hold: the grip under the sight line and behind the muzzle; a hand under the handguard ahead of the grip.
      expect(gun.hold.grip.y, `${w.id}: the grip under the sight`).toBeLessThan(gun.sight.y);
      expect(gun.hold.grip.z, `${w.id}: the grip behind the muzzle`).toBeGreaterThan(gun.muzzle.z);
      expect(gun.hold.back, `${w.id}: its butt behind the grip`).toBeGreaterThan(gun.hold.grip.z);
      if (gun.hold.fore) expect(gun.hold.fore.z, `${w.id}: the other hand ahead of the grip`).toBeLessThan(gun.hold.grip.z - 0.05);
      for (const [stance, over] of Object.entries({ stand: {}, crouch: STANCES.crouch, prone: STANCES.prone, lean: STANCES.crouchLeanRight })) {
        for (const ads of [0, 65535]) {
          for (const pitch of [-0.9, -0.3, 0, 0.4, 0.9]) {
            const s = state({ ...over, adsQ: ads, pitch, yaw: 0.7 });
            const { rig, out } = withGun(s, gun, w.class);
            const what = `${w.id} ${stance} ${ads ? "aimed" : "hip"} pitch ${pitch}`;
            checked++;
            if (!out.gun) {
              problems.push(`${what}: no gun`);
              continue;
            }
            // Pointed along the view.
            const eye = eyePose(m, hbData, s);
            const view = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(s.pitch, s.yaw, eye.roll, "YXZ"));
            const barrel = new THREE.Vector3(0, 0, -1).applyQuaternion(out.gun.quaternion);
            if (barrel.angleTo(view) > 1e-6) problems.push(`${what}: off the view by ${barrel.angleTo(view).toFixed(3)} rad`);
            // The right hand on its grip; the left on the gun too; the arms reach.
            const onGun = (p: THREE.Vector3) => p.clone().applyQuaternion(out.gun!.quaternion).add(out.gun!.position);
            const j = rig.joints;
            const gripGap = j.handR.distanceTo(onGun(gun.hold.grip));
            if (gripGap > 1e-6) problems.push(`${what}: right hand ${gripGap.toFixed(3)} m off the grip`);
            const local = j.handL.clone().sub(out.gun.position).applyQuaternion(out.gun.quaternion.clone().invert());
            if (Math.abs(local.x) > 0.04 || local.y > gun.sight.y || local.z > gun.hold.back || local.z < gun.muzzle.z) problems.push(`${what}: left hand off the gun (${local.toArray().map((n) => n.toFixed(2))})`);
            const reachR = j.shoulderR.distanceTo(j.handR) / (LEN.upperArm + LEN.foreArm);
            const reachL = j.shoulderL.distanceTo(j.handL) / (LEN.upperArm + LEN.foreArm);
            // (The left of a square-on body is short of a long gun's handguard: it holds as far along as it reaches, and
            // may stretch a few hundredths, which doesn't show.)
            if (reachR > 1.001) problems.push(`${what}: right arm stretched ×${reachR.toFixed(3)}`);
            if (reachL > 1.05) problems.push(`${what}: left arm stretched ×${reachL.toFixed(3)}`);
            // Aimed and level, a long gun's sight is at the eye's line (a little under it: the head stays where it's hit).
            if (ads && pitch === 0 && !pistolHeld(w.class) && stance === "stand") {
              const sight = onGun(gun.sight).sub(new THREE.Vector3(...eye.pos));
              const off = sight.addScaledVector(view, -sight.dot(view)).length();
              if (off > 0.07) problems.push(`${what}: sight ${off.toFixed(3)} m off the eye's line`);
            }
          }
        }
      }
      gun.dispose();
    }
    expect(problems.slice(0, 12).join("\n")).toBe("");
    expect(checked).toBeGreaterThan(1000);
  });

  it("a reload takes the left hand to the magazine and the pouch, the magazine out while the simulation has it out", () => {
    const { loadout } = resolveLoadout(data, defaultLoadoutPick(data, "thermite"));
    const w = loadout.weapons[0];
    expect(w.reload.kind).toBe("magazine");
    if (w.reload.kind !== "magazine") return;
    const gun = buildGun({ id: w.id, class: w.class, pick: w.pick });
    const at = (ticks: number, flags = 0) => withGun(state({ wAct: WeaponAct.Reload, reloadKind: ReloadKind.Tactical, actTicks: ticks, wflags: flags }), gun, w.class, { reload: w.reload });
    const idle = withGun(state(), gun, w.class);
    const start = at(0);
    expect(start.rig.joints.handL.distanceTo(idle.rig.joints.handL)).toBeLessThan(0.02);
    expect(start.out.gun!.magIn).toBe(true);
    // Half way: the hand is down at the belt, the magazine out.
    const mid = at(Math.round((w.reload.magOutTacticalTicks + w.reload.refillTacticalTicks) / 2), 1);
    expect(mid.out.gun!.magIn).toBe(false);
    expect(mid.rig.joints.handL.y).toBeLessThan(idle.rig.joints.handL.y - 0.2);
    expect(mid.rig.joints.handL.distanceTo(mid.rig.joints.pelvis)).toBeLessThan(0.3);
    // Done: back under the handguard, the magazine in.
    const end = at(w.reload.tacticalTicks, 3);
    expect(end.out.gun!.magIn).toBe(true);
    expect(end.rig.joints.handL.distanceTo(idle.rig.joints.handL)).toBeLessThan(0.02);
    gun.dispose();
  });
});

describe("the stride", () => {
  it("standing still both feet are flat on the floor, apart; a planted foot doesn't slide as the body walks or sprints", () => {
    const rig = new BodyRig();
    const still = state();
    rig.frame(poseHitboxes(m, hbData, still));
    const gait = new Gait();
    const at0 = poseBody({ data, s: still, parts: poseHitboxes(m, hbData, still), rig, gun: null, pistol: false, reload: null, held: null, shieldUp: false, gait, now: 0, swapTicks: 30 });
    expect(at0.pose.footL!.y).toBeCloseTo(0.08, 6);
    expect(at0.pose.footR!.y).toBeCloseTo(0.08, 6);
    expect(at0.pose.footL!.x).toBeLessThan(-0.08);
    expect(at0.pose.footR!.x).toBeGreaterThan(0.08);
    // The left foot ahead (−z is the way it faces).
    expect(at0.pose.footL!.z).toBeLessThan(at0.pose.footR!.z - 0.1);

    // Forward at three speeds; sideways, at an angle and backward (the body facing −z, yaw 0: x is its right).
    const ways: [number, boolean, number, number][] = [
      [2.85, false, 0, -1],
      [1.4, false, 0, -1],
      [4.6, true, 0, -1],
      [2.5, false, 1, 0],
      [2.5, false, -1, 0],
      [2.85, false, Math.SQRT1_2, -Math.SQRT1_2],
      [2.0, false, 0, 1],
    ];
    for (const [speed, sprinting, dx, dz] of ways) {
      const g = new Gait();
      const dt = 1 / 120;
      let planted: THREE.Vector3 | null = null;
      let slid = 0;
      let lifted = 0;
      let steps = 0;
      let wasDown = false;
      for (let i = 0; i < 120 * 6; i++) {
        const t = i * dt;
        const s = state({ x: dx * speed * t, z: dz * speed * t, vx: dx * speed, vz: dz * speed, sprinting });
        const parts = poseHitboxes(m, hbData, s);
        rig.frame(parts);
        const out = poseBody({ data, s, parts, rig, gun: null, pistol: false, reload: null, held: null, shieldUp: false, gait: g, now: t, swapTicks: 30 });
        rig.solve(out.pose);
        if (t < 1.5) continue; // (the stride comes in over the first moments)
        const foot = out.pose.footL!;
        const down = (out.pose.footPitchL ?? 0) === 0 && foot.y < 0.0801;
        if (down) {
          if (!wasDown) {
            planted = foot.clone();
            steps++;
          }
          slid = Math.max(slid, Math.hypot(foot.x - planted!.x, foot.z - planted!.z));
        }
        lifted = Math.max(lifted, foot.y - 0.08);
        wasDown = down;
        // The legs reach: no more than a hair past their length.
        expect(rig.joints.hipL.distanceTo(rig.joints.ankleL) / (LEN.thigh + LEN.shin), `at ${speed} m/s`).toBeLessThan(1.03);
      }
      const way = `at ${speed} m/s toward (${dx.toFixed(2)}, ${dz.toFixed(2)})`;
      expect(steps, `steps ${way}`).toBeGreaterThan(3);
      expect(slid, `a planted foot slid ${way}`).toBeLessThan(0.02);
      expect(lifted, `the swing's lift ${way}`).toBeGreaterThan(0.05);
    }
  });
});

describe("a dead body falls (render/bodyRagdoll.ts)", () => {
  it("a joint that starts under the floor (a body that lay on a slope) is set on it, not thrown up; a floor blown away under it, it falls again", () => {
    const rig = new BodyRig();
    const s = state({ stance: Stance.Prone, stanceFrom: Stance.Prone, tiltB: 0.5, y: 1 });
    const parts = poseHitboxes(m, hbData, s);
    rig.frame(parts);
    rig.solve({ flatFeet: false, legScale: rig.lyingLegs() });
    // (Lying uphill on stairs: its legs are well under the flat floor the corpse rule finds at its feet.)
    expect(Math.min(rig.joints.ankleL.y, rig.joints.ankleR.y)).toBeLessThan(1 - 0.2);
    const doll = new Ragdoll(rig.joints, new THREE.Vector3(), new THREE.Vector3(), 1);
    let top = 0;
    for (let i = 0; i < 60 * 6; i++) {
      doll.step(1 / 60);
      top = Math.max(top, doll.at("pelvis").y);
    }
    expect(top - 1).toBeLessThan(0.4);
    expect(doll.asleep).toBe(true);
    expect(doll.at("pelvis").y - 1).toBeLessThan(0.3);
    // The floor goes 3 m down: awake, it falls onto the new one.
    doll.setFloor(-2);
    expect(doll.asleep).toBe(false);
    for (let i = 0; i < 60 * 6; i++) doll.step(1 / 60);
    expect(doll.at("pelvis").y + 2).toBeLessThan(0.3);
    expect(doll.at("pelvis").y + 2).toBeGreaterThan(0);
    // Settled at once (a body first seen dead): at rest on the floor in one go.
    const now = new Ragdoll(rig.joints, new THREE.Vector3(), new THREE.Vector3(), 1);
    now.settle();
    expect(now.asleep).toBe(true);
    expect(now.at("head").y - 1).toBeLessThan(0.35);
  });

  it("from standing it comes to rest on the floor near where it died, its bones their length, and lies still", () => {
    const rig = new BodyRig();
    const s = state({ x: 3, y: 1.5, z: -2, yaw: 0.4 });
    const parts = poseHitboxes(m, hbData, s);
    rig.frame(parts);
    rig.solve();
    const doll = new Ragdoll(rig.joints, new THREE.Vector3(1.5, 0, 0), new THREE.Vector3(0, 0, 0.9), 1.5);
    const head0 = doll.at("head").y;
    for (let i = 0; i < 60 * 6; i++) doll.step(1 / 60);
    expect(doll.asleep).toBe(true);
    doll.write(rig);
    const j = rig.joints;
    // Down: the head and the chest near the floor, nothing under it.
    expect(head0 - 1.5).toBeGreaterThan(1.5);
    expect(j.head.y - 1.5).toBeLessThan(0.35);
    expect(j.chest.y - 1.5).toBeLessThan(0.35);
    for (const p of Object.values(j)) expect(p.y).toBeGreaterThanOrEqual(1.5);
    // Near where it died, carried on a little by its speed.
    expect(Math.hypot(j.pelvis.x - 3, j.pelvis.z + 2)).toBeLessThan(2);
    // Its limbs their length, its trunk its shape.
    expect(j.shoulderL.distanceTo(j.elbowL)).toBeCloseTo(LEN.upperArm, 1);
    expect(j.elbowR.distanceTo(j.handR)).toBeCloseTo(LEN.foreArm, 1);
    expect(j.hipL.distanceTo(j.kneeL)).toBeCloseTo(LEN.thigh, 1);
    expect(j.kneeR.distanceTo(j.ankleR)).toBeCloseTo(LEN.shin, 1);
    expect(j.shoulderL.distanceTo(j.shoulderR)).toBeCloseTo(0.4, 1);
    expect(j.pelvis.distanceTo(j.chest)).toBeCloseTo(0.468, 1);
    // Still: more steps move nothing.
    const before = j.head.clone();
    doll.step(1);
    doll.write(rig);
    expect(rig.joints.head.distanceTo(before)).toBe(0);
    // The bones it gives are whole numbers (nothing collapsed to a point or blew up).
    for (const mat of rig.matrices) for (const e of mat.elements) expect(Number.isFinite(e)).toBe(true);
  });
});

describe("the pawn view draws the body (render/labScene.ts)", () => {
  it("one skinned mesh on the rig; hidden in first person; the gun in its hands; dead, it falls", () => {
    const scene = new THREE.Scene();
    const view = new PawnView(scene, 0x3b82f6, undefined, undefined, undefined, undefined, "sledge");
    const { loadout } = resolveLoadout(data, defaultLoadoutPick(data, "sledge"));
    const w = loadout.weapons[0];
    view.setWeapon({ id: w.id, class: w.class, pick: w.pick }, w);
    const s = state({ ...initialPawnState(0, 0, 0, 0, 100, loadout), grounded: true });
    view.update(data, s, 0);
    const skinned: THREE.SkinnedMesh[] = [];
    view.body.traverse((o) => void ((o as THREE.SkinnedMesh).isSkinnedMesh && skinned.push(o as THREE.SkinnedMesh)));
    expect(skinned.length).toBe(1);
    const mesh = skinned[0];
    expect(mesh.skeleton.bones.length).toBe(BONES.length);
    // The bones are where the hitboxes put the body: the head's at the head.
    const head = new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.bones[BONE.head].matrixWorld);
    expect(head.distanceTo(new THREE.Vector3(...poseHitboxes(m, hbData, s)[0].a))).toBeLessThan(1e-9);
    // Culled by a sphere round it (not by its parts' own bounds, which are in their bones' frames).
    expect(mesh.boundingSphere!.center.y).toBeGreaterThan(0.8);
    const drawn = () => {
      const out: string[] = [];
      view.body.traverseVisible((o) => void ((o as THREE.Mesh).isMesh && out.push(o.name)));
      return out;
    };
    // The body, the hammer on its back, the gun's parts.
    expect(drawn()).toContain("body");
    expect(drawn()).toContain("body-back");
    expect(drawn().length).toBeGreaterThan(3);
    // Its shots are seen to leave from the end of the gun in its hands: ahead of it (it faces −z), at chest height.
    const muzzle = view.muzzle()!;
    expect(muzzle.z).toBeLessThan(-0.45);
    expect(muzzle.y).toBeGreaterThan(1.2);
    expect(muzzle.y).toBeLessThan(1.65);
    expect(Math.abs(muzzle.x)).toBeLessThan(0.2);
    // The hammer in his hands: not on his back.
    view.setHeld({ id: "breaching_hammer", size: data.gadgets.get("breaching_hammer")!.sizeM }, false, { swingS: 0.8, hitS: 0.4 });
    view.update(data, { ...s, hand: Hand.Ability }, 0.1);
    expect(drawn()).not.toContain("body-back");
    view.setHeld(null);
    view.update(data, s, 0.2);
    expect(drawn()).toContain("body-back");
    view.setFirstPerson(true);
    expect(drawn()).toEqual([]);
    view.setFirstPerson(false);
    // Dead: the gun goes, and the body comes down from standing over the next seconds.
    const dead = { ...s, mode: PawnMode.Dead, hp: 0 };
    view.update(data, dead, 0.3);
    expect(view.muzzle()).toBeNull();
    const headAt = () => new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.bones[BONE.head].matrixWorld).y;
    expect(headAt()).toBeGreaterThan(1.4);
    for (let i = 1; i <= 240; i++) view.update(data, dead, 0.3 + i / 60);
    expect(headAt()).toBeLessThan(0.4);
    expect(drawn()).toContain("body");
    expect(drawn().filter((n) => n !== "body" && n !== "body-back")).toEqual([]);
    // Alive again (a respawn, a killcam's replay): up on its hitboxes at once.
    view.update(data, s, 5);
    expect(headAt()).toBeGreaterThan(1.6);
    view.dispose();
    expect(scene.children.length).toBe(0);
  });

  it("Fuze's pistol is in his right hand where the hitboxes have it behind his raised shield, and out past it as he aims", () => {
    const { loadout } = resolveLoadout(data, { ...defaultLoadoutPick(data, "fuze"), primary: { weapon: "ballistic_shield", sight: null, barrel: null, grip: null, underbarrel: null } });
    const plate = loadout.shield!.plate;
    const w = loadout.weapons[1];
    const gun = buildGun({ id: w.id, class: w.class, pick: w.pick });
    for (const adsQ of [0, 65535]) {
      const s = state({ slot: 1, shieldAt: ShieldAt.Front, adsQ });
      const rig = new BodyRig();
      const parts = poseHitboxes(m, hbData, s, shieldHold(m, plate, s));
      rig.frame(parts);
      const gait = new Gait();
      const out = poseBody({ data, s, parts, rig, gun, pistol: true, reload: w.reload, held: null, shieldUp: true, gait, now: 0, swapTicks: 30 });
      rig.solve(out.pose);
      // Both hands where the hitboxes' arms end (the grips), the pistol's grip in the right one, pointed along the view.
      expect(rig.joints.handR.distanceTo(new THREE.Vector3(...parts[5].b))).toBeLessThan(1e-9);
      expect(rig.joints.handL.distanceTo(new THREE.Vector3(...parts[4].b))).toBeLessThan(1e-9);
      const grip = gun.hold.grip.clone().applyQuaternion(out.gun!.quaternion).add(out.gun!.position);
      expect(grip.distanceTo(rig.joints.handR)).toBeLessThan(1e-9);
      expect(new THREE.Vector3(0, 0, -1).applyQuaternion(out.gun!.quaternion).distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-9);
    }
    gun.dispose();
  });

  it("another player's body (its snapshots carry no speed or progress) strides as it moves, aims, and reloads from when it began", () => {
    const scene = new THREE.Scene();
    const view = new PawnView(scene, 0xf97316, undefined, undefined, undefined, undefined, "thermite");
    view.remote = true;
    const { loadout } = resolveLoadout(data, defaultLoadoutPick(data, "thermite"));
    const w = loadout.weapons[0];
    view.setWeapon({ id: w.id, class: w.class, pick: w.pick }, w);
    const mesh = () => {
      let found: THREE.SkinnedMesh | null = null;
      view.body.traverse((o) => void ((o as THREE.SkinnedMesh).isSkinnedMesh && (found = o as THREE.SkinnedMesh)));
      return found as unknown as THREE.SkinnedMesh;
    };
    const boneAt = (b: number) => new THREE.Vector3().setFromMatrixPosition(mesh().skeleton.bones[b].matrixWorld);
    // As a snapshot gives it: no velocity, though it moves 2.5 m/s along -z. Its feet go up and down (a stride).
    let lowest = Infinity;
    let highest = -Infinity;
    for (let i = 0; i < 180; i++) {
      const t = i / 60;
      view.update(data, state({ z: -2.5 * t }), t);
      if (t > 1) {
        lowest = Math.min(lowest, boneAt(BONE.footL).y);
        highest = Math.max(highest, boneAt(BONE.footL).y);
      }
    }
    expect(highest - lowest).toBeGreaterThan(0.05);
    // Aiming (the aiming bit): the gun comes up to the eye over a few frames.
    const gunY = () => {
      let g: THREE.Object3D | null = null;
      view.body.traverse((o) => void (o.name === "magazine" && (g = o.parent)));
      return (g as unknown as THREE.Object3D).position.y;
    };
    for (let i = 0; i < 60; i++) view.update(data, state({ z: -7.5 }), 3 + i / 60);
    const hip = gunY();
    for (let i = 0; i < 60; i++) view.update(data, state({ z: -7.5, prevButtons: Btn.Ads }), 4 + i / 60);
    expect(gunY()).toBeGreaterThan(hip + 0.05);
    // Reloading (the reloading bit): the left hand goes down for the magazine as the weapon's timings say it would.
    expect(w.reload.kind).toBe("magazine");
    if (w.reload.kind !== "magazine") return;
    const handL = () => new THREE.Vector3(0, LEN.foreArm, 0).applyMatrix4(mesh().skeleton.bones[BONE.foreArmL].matrixWorld);
    view.update(data, state({ z: -7.5 }), 6);
    const before = handL().y;
    const mid = (w.reload.magOutTacticalTicks + w.reload.refillTacticalTicks) / 2 / 64;
    view.update(data, state({ z: -7.5, wAct: WeaponAct.Reload }), 6.01);
    view.update(data, state({ z: -7.5, wAct: WeaponAct.Reload }), 6.01 + mid);
    expect(handL().y).toBeLessThan(before - 0.15);
    view.dispose();
  });

  it("a body drawn only as its hitboxes (where the server judged a hit one to be) builds no model", () => {
    const scene = new THREE.Scene();
    const ghost = new PawnView(scene, 0x22c55e, undefined, 0x22c55e, undefined, undefined, null);
    ghost.update(data, state(), 0);
    let skinned = 0;
    let wire = 0;
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned++;
      else if ((o as THREE.Mesh).isMesh && o.visible) wire++;
    });
    expect(skinned).toBe(0);
    expect(wire).toBeGreaterThan(8);
    ghost.dispose();
  });
});
