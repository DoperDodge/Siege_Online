// The first-person gun (Phase 3 M9): drawn in its own scene after the world with the depth cleared, so it
// never pokes into walls, by its own camera with a fixed field of view. Pose and motion come from the
// predicted body state each frame (hip, aiming, sprinting, swapping, reloading, the knife) plus cosmetic
// kick and sway; none of it feeds back into the simulation. The guns are gunKit.ts's (gun_kit.json).
//
// Your arms (Phase 10 M9, render/DESIGN.md §12; fpArms.ts): the right hand closed round the gun's grip and the left
// cupped under its handguard (or on a grip fitted there, or both on a pistol's), riding the gun through everything it
// does. A reload takes the left hand to the magazine, down out of the picture with it and back with the next on the
// weapon's own timings (from empty, on to the bolt's release); a shotgun's shells go in one at a time. The knife is in
// the right fist; a gadget lies in the right palm, is held up in both hands, or (a hammer) swung in both.
import * as THREE from "three";
import { DEG, GadgetAct, isDowned, lerp, loadPresentationData, PawnMode, ReloadKind, ticks, WeaponAct, type GadgetData, type GameData, type GunKit, type PawnState, type ResolvedWeapon } from "@redmond/shared";
import { operatorLook } from "./bodyModel.js";
import { pistolHeld } from "./bodyPose.js";
import { FpArms, handFrame, PALM, PALM_SURFACE_Z } from "./fpArms.js";
import { heldShape, knifeShape, shapeModel, type ShapeModel } from "./gadgetShapes.js";
import { buildGun, gunKey, type GunModel } from "./gunKit.js";
import { warmShaders } from "./labScene.js";

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** Progress 0…1 of `t` through [a, b], eased. */
const through = (t: number, a: number, b: number) => smooth(clamp01((t - a) / Math.max(1e-6, b - a)));

/** Where the hands are on a gun, in its own frame: the right on its grip; the left; on its magazine; on its bolt's release. */
interface GunHands {
  right: THREE.Matrix4;
  left: THREE.Matrix4;
  leftPose: "fore" | "grip";
  mag: THREE.Matrix4;
  bolt: THREE.Matrix4;
  /** Where a shell goes in (a shotgun's port), for the hand that feeds it. */
  port: THREE.Matrix4;
}

/** How far a grip leans back as it goes down (most of ours: 15°). */
const GRIP_RAKE = 15 * DEG;

/** The hands' frames on a gun (gun frame: x right, y up, z back). */
function gunHands(gun: GunModel, pistol: boolean, verticalGrip: boolean): GunHands {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const grip = gun.hold.grip;
  // The right hand: its x down the grip, its fingers forward round the front of it, its back to the right.
  const right = handFrame(new THREE.Matrix4(), grip, v(0, -Math.cos(GRIP_RAKE), Math.sin(GRIP_RAKE)), v(0, -0.25, -1));
  // A left hand closed round something upright (a grip under the handguard, a pistol's grip from the left, a
  // magazine): its thumb side up, fingers forward, its back to the left.
  const upright = (at: THREE.Vector3, palm: { x: number; y: number; z: number } = PALM) => handFrame(new THREE.Matrix4(), at, v(0, 1, 0), v(0, 0, -1), palm);
  let left: THREE.Matrix4;
  let leftPose: GunHands["leftPose"] = "fore";
  if (pistol || !gun.hold.fore) {
    // Both hands on the one grip: the left wrapped over the right's fingers from its side.
    left = upright(v(grip.x - 0.014, grip.y - 0.016, grip.z - 0.004));
    leftPose = "grip";
  } else if (verticalGrip) {
    left = upright(gun.hold.fore);
    leftPose = "grip";
  } else {
    // Cupped under the handguard: its thumb side forward, fingers across under it to the right, its back down.
    left = handFrame(new THREE.Matrix4(), gun.hold.fore, v(0, 0, -1), v(1, 0.3, 0), { x: 0, y: PALM.y, z: 0.014 });
  }
  const magAt = gun.hold.mag ? gun.hold.mag.clone() : v(grip.x, grip.y - 0.02, grip.z - 0.1);
  // A pistol's magazine is inside its grip: the hand takes it by what shows under the butt.
  if (pistol) magAt.y = grip.y - 0.085;
  const mag = upright(v(magAt.x - 0.006, magAt.y - 0.03, magAt.z), { x: 0, y: PALM.y, z: -0.027 });
  // The bolt's release, on the left of the receiver over the magazine: slapped with the flat of the hand.
  // (Its fingers along the receiver, forward and a little up; its back to the left: the axis is their cross.)
  const along = v(0, 0.3, -0.95).normalize();
  const bolt = handFrame(new THREE.Matrix4(), v(-0.022, grip.y + 0.065, grip.z - 0.075), along.clone().cross(v(-1, 0, 0)), along, { x: 0, y: 0.03, z: PALM_SURFACE_Z });
  // A shotgun's loading port, under the receiver ahead of the trigger: the hand comes up under it.
  const port = handFrame(new THREE.Matrix4(), v(0, grip.y + 0.012, grip.z - 0.1), v(0, 0, -1), v(1, 0.5, 0), { x: 0, y: 0.1, z: PALM_SURFACE_Z - 0.006 });
  return { right, left, leftPose, mag, bolt, port };
}

const P0 = new THREE.Vector3();
const P1 = new THREE.Vector3();
const Q0 = new THREE.Quaternion();
const Q1 = new THREE.Quaternion();
const S0 = new THREE.Vector3();
/** A frame part way from one to another (their places in a line, their turns the short way). */
function between(out: THREE.Matrix4, a: THREE.Matrix4, b: THREE.Matrix4, t: number): THREE.Matrix4 {
  a.decompose(P0, Q0, S0);
  b.decompose(P1, Q1, S0);
  return out.compose(P0.lerp(P1, t), Q0.slerp(Q1, t), S0.set(1, 1, 1));
}
/** The gun's own lights in daylight: a sky fill and a key from above right. */
const VIEWMODEL_FILL = 1.6;
const VIEWMODEL_KEY = 1.8;
/** And the sky's reflections on it, once the art has the sky (setEnvironment). */
const VIEWMODEL_ENV = 0.6;
/** How many guns stay built (the primary, the secondary, one more after a loadout change). */
const GUNS_KEPT = 3;

export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly kit: GunKit;
  private readonly rig = new THREE.Group();
  /** Your arms (fpArms.ts), in the camera's space as the gun is. */
  private readonly arms: FpArms;
  /** The hands' frames on the gun in hand (its own frame), rebuilt with it. */
  private hands: GunHands | null = null;
  /** A shotgun's shell in the left hand as it's fed in. */
  private readonly shell: THREE.Mesh;
  private gun: GunModel | null = null;
  private key = "";
  /** The guns built, by their key (gunKit.ts gunKey), the one in hand last. */
  private readonly guns = new Map<string, GunModel>();
  private readonly knife: THREE.Object3D;
  /** A gadget in hand (Phase 8): its shaped model (gadgetShapes.ts), or a detonator; rebuilt when what's held changes. */
  private held: THREE.Object3D | null = null;
  private heldModel: ShapeModel | null = null;
  /** Its size as drawn (across, up, deep). */
  private heldSize: [number, number, number] = [0, 0, 0];
  /** A held-up item's screen (Pulse's sensor, Dokkaebi's tablet): lit, facing the eye. */
  private screen: THREE.Mesh | null = null;
  private heldKey = "";
  private readonly flash: THREE.Sprite;
  private readonly fill: THREE.HemisphereLight;
  private readonly keyLight: THREE.DirectionalLight;
  private flashUntil = 0;
  private kick = 0;
  private sprintW = 0;
  private bob = 0;
  /** Aiming progress as last drawn (0 hip … 1 down the sights) and what the sight shows. */
  aim = 0;
  reticle: GunModel["reticle"] = "posts";

  constructor(private readonly data: GameData) {
    this.kit = loadPresentationData().gunKit;
    this.camera = new THREE.PerspectiveCamera(this.kit.viewmodel.fovDeg, 1, 0.01, 10);
    this.fill = new THREE.HemisphereLight(0xe8eef5, 0x3a3f36, VIEWMODEL_FILL);
    this.keyLight = new THREE.DirectionalLight(0xfff1dc, VIEWMODEL_KEY);
    this.keyLight.position.set(0.6, 1, 0.4);
    this.scene.add(this.fill, this.keyLight, this.camera);
    this.camera.add(this.rig);
    this.knife = shapeModel(knifeShape()).group;
    this.knife.visible = false;
    this.camera.add(this.knife);
    this.arms = new FpArms(operatorLook(undefined));
    this.camera.add(this.arms.group);
    // A shell: its hull along its own y, a brass head at the bottom.
    const hull = new THREE.CylinderGeometry(0.0102, 0.0102, 0.062, 10);
    hull.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: hull.getAttribute("position").count }, (_, i) => (hull.getAttribute("position").getY(i) < -0.018 ? [0.72, 0.55, 0.2] : [0.5, 0.06, 0.05])).flat(), 3));
    this.shell = new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 }));
    this.shell.visible = false;
    this.shell.matrixAutoUpdate = false;
    this.camera.add(this.shell);
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,244,210,1)");
    grad.addColorStop(0.35, "rgba(255,180,70,0.8)");
    grad.addColorStop(1, "rgba(255,120,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.setScalar(0.16);
    this.flash.visible = false;
    this.rig.add(this.flash);
  }

  /** Whose arms these are: their sleeves, skin and gloves (data/presentation/operator_looks.json). */
  setOperator(operatorId: string | undefined) {
    this.arms.setLook(operatorLook(operatorId));
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Ready the flash and knife shaders at load, not on the first shot or swing (it would stall that frame). */
  warm(renderer: THREE.WebGLRenderer) {
    warmShaders(renderer, this.scene, this.camera);
  }

  /** Our own shot left: kick the gun back and, unless suppressed, flash the muzzle. */
  shot(now: number, suppressed: boolean) {
    this.kick = 1;
    if (!suppressed) this.flashUntil = now + 45;
  }

  /**
   * Pose for this frame. `w` is the weapon in hand (null: nothing to hold), `s` the body's state,
   * `swapTicks` the loadout's swap time; `dt` seconds since the last frame.
   */
  update(now: number, dt: number, w: ResolvedWeapon | null, s: PawnState, swapTicks: number, gadget: { data: GadgetData; detonator: boolean } | null = null, behindShield = false) {
    const vm = this.kit.viewmodel;
    const show = w !== null && s.mode !== PawnMode.Dead && !isDowned(s);
    this.knife.visible = false;
    this.shell.visible = false;
    this.arms.setHand("left", null);
    this.arms.setHand("right", null);
    this.poseHeld(show ? gadget : null, s);
    this.rig.visible = show && !gadget;
    if (!show || !w || gadget) {
      this.aim = 0;
      this.arms.update();
      return;
    }
    const look = { id: w.id, class: w.class, pick: w.pick };
    const key = gunKey(look);
    if (key !== this.key) {
      // The last few guns in hand stay built (a swap back and forth builds nothing): the newest last.
      if (this.gun) this.gun.group.visible = false;
      let built = this.guns.get(key);
      if (built) this.guns.delete(key);
      else {
        built = buildGun(look, this.kit);
        this.rig.add(built.group);
      }
      this.guns.set(key, built);
      for (const [k, g] of this.guns) {
        if (this.guns.size <= GUNS_KEPT) break;
        g.dispose();
        this.guns.delete(k);
      }
      this.gun = built;
      this.key = key;
      this.reticle = built.reticle;
      this.hands = gunHands(built, pistolHeld(w.class), w.pick.grip === "vertical" && built.hold.fore !== null);
    }
    const gun = this.gun!;
    // Aiming: the sight line comes onto the view axis, adsDistance in front of the eye.
    this.aim = smooth(s.adsQ / 65535);
    // Fuze's pistol is behind his raised shield until it's slid down far enough to aim over (Phase 8 M11).
    if (behindShield && this.aim < 0.6) this.rig.visible = false;
    const hip = new THREE.Vector3(...vm.hip);
    const ads = new THREE.Vector3(0, 0, -vm.adsDistance).sub(gun.sight);
    const pos = hip.lerp(ads, this.aim);
    const rot = new THREE.Euler(0, 0, 0, "YXZ");
    // Sprinting: lowered and turned in.
    this.sprintW = THREE.MathUtils.damp(this.sprintW, s.sprinting ? 1 : 0, 10, dt);
    pos.add(new THREE.Vector3(...vm.sprint.offset).multiplyScalar(this.sprintW));
    rot.y += vm.sprint.yawDeg * DEG * this.sprintW;
    rot.x += vm.sprint.pitchDeg * DEG * this.sprintW;
    // Swapping: the new weapon comes up from below; reloading: a dip and a roll, the magazine out and back.
    gun.mag.position.copy(gun.magHome);
    /** A reload under way: how far through it is, and (a magazine's) when the magazine comes out and when the next is in. */
    let reload: { t: number; out: number; in: number; empty: boolean; shells: boolean } | null = null;
    if (s.wAct === WeaponAct.Equip) {
      const p = Math.min(1, s.actTicks / Math.max(1, swapTicks));
      pos.y -= (1 - smooth(p)) * vm.downFor.equip;
      rot.x -= (1 - smooth(p)) * 0.6;
    } else if (s.wAct === WeaponAct.Reload && w.reload.kind !== "none") {
      const r = w.reload;
      const tac = s.reloadKind === ReloadKind.Tactical;
      const total = Math.max(1, r.kind === "magazine" ? (tac ? r.tacticalTicks : r.emptyTicks) : r.perShellTicks);
      const t = r.kind === "magazine" ? Math.min(1, s.actTicks / total) : (s.actTicks % total) / total;
      reload =
        r.kind === "magazine"
          ? { t, out: (tac ? r.magOutTacticalTicks : r.magOutEmptyTicks) / total, in: (tac ? r.refillTacticalTicks : r.refillEmptyTicks) / total, empty: !tac, shells: false }
          : { t, out: 0, in: 1, empty: false, shells: true };
      // Up, in and tipped over for the hand that works it (gun_kit.json `viewmodel.reload`): all the way through a
      // shotgun's shells, eased in and out of a magazine's change.
      const k = reload.shells ? 1 : through(t, 0, 0.14) * (1 - through(t, 0.86, 1));
      pos.add(new THREE.Vector3(...vm.reload.offset).multiplyScalar(k * (1 - this.aim * 0.5)));
      rot.x += k * vm.reload.pitchDeg * DEG;
      rot.y += k * vm.reload.yawDeg * DEG;
      rot.z += k * (vm.reload.rollDeg + (reload.shells ? vm.reload.shellRollDeg : 0)) * DEG;
    }
    // The knife: the gun drops away and a blade sweeps right to left.
    let stab = false;
    if (s.meleeTicks > 0) {
      const cycle = ticks(this.data.combat.melee.cycleSeconds);
      const p = Math.min(1, (s.meleeTicks - 1) / cycle);
      pos.y -= Math.sin(Math.PI * p) * 0.25;
      this.knife.visible = true;
      this.knife.position.set(lerp(0.25, -0.2, smooth(Math.min(1, p * 1.6))), -0.12, -0.32);
      this.knife.rotation.set(0, lerp(0.9, -0.6, p), -0.4);
      stab = true;
    }
    // Cosmetic kick (the real recoil moves the view itself, D-041) and a little walking sway.
    this.kick = Math.max(0, this.kick - dt * 14);
    pos.z += this.kick * vm.kickBack;
    rot.x += this.kick * vm.kickPitchDeg * DEG;
    const speed = Math.hypot(s.vx, s.vz);
    this.bob += dt * speed * 2.2;
    const sway = (1 - this.aim * 0.85) * Math.min(1, speed / 3);
    pos.x += Math.sin(this.bob) * 0.006 * sway;
    pos.y += Math.abs(Math.cos(this.bob)) * 0.006 * sway;
    // Standing still it's never quite still: a breath's rise and fall, less down the sights.
    const breath = (1 - this.aim * 0.7) * (1 - Math.min(1, speed / 1.5));
    pos.y += Math.sin(now * 0.0019) * 0.0016 * breath;
    rot.z += Math.sin(now * 0.0011) * 0.004 * breath;
    gun.group.position.copy(pos);
    gun.group.rotation.copy(rot);
    // Magnified sights: once fully aimed, the scope overlay replaces the gun (see the lab's .scope).
    gun.group.visible = !(w.ads.zoom > 1 && this.aim > 0.92);
    this.flash.visible = now < this.flashUntil && gun.group.visible;
    if (this.flash.visible) this.flash.position.copy(gun.muzzle).applyEuler(rot).add(pos);
    if (this.rig.visible && gun.group.visible && this.hands) this.poseArms(gun, this.hands, new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1)), reload, stab, behindShield);
    this.arms.update();
  }

  /** Where the left hand goes out of the picture to (a magazine dropped in a pouch, the next one taken), camera space. */
  private static readonly AWAY = new THREE.Vector3(-0.1, -0.56, -0.12);

  /**
   * The hands on the gun (`at`: its place in the camera's space): the right on its grip, or round the knife; the left
   * under its handguard, or working a reload: to the magazine, away with it and back with the next (which it carries),
   * then (from empty) the bolt's release; a shell at a time into a shotgun.
   */
  private poseArms(gun: GunModel, hands: GunHands, at: THREE.Matrix4, reload: { t: number; out: number; in: number; empty: boolean; shells: boolean } | null, stab: boolean, oneHanded: boolean) {
    const onGun = (m: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(at, m);
    if (stab) {
      // The knife in the right fist: its handle across the palm, the blade out past the thumb.
      this.knife.updateMatrix();
      const handle = handFrame(new THREE.Matrix4(), new THREE.Vector3(0, -0.001, 0.052), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0));
      this.arms.setHand("right", new THREE.Matrix4().multiplyMatrices(this.knife.matrix, handle), "fist");
    } else this.arms.setHand("right", onGun(hands.right), "grip");
    // Fuze's other hand is on his shield.
    if (oneHanded) return;
    const fore = onGun(hands.left);
    if (!reload) {
      this.arms.setHand("left", fore, hands.leftPose);
      return;
    }
    const mag = onGun(hands.mag);
    // Away: the hand as it holds the magazine, down out of the picture.
    const away = mag.clone().setPosition(Viewmodel.AWAY);
    const hand = new THREE.Matrix4();
    const { t } = reload;
    if (reload.shells) {
      // Up from the pouch with a shell, in at the port, and back for the next.
      const port = onGun(hands.port);
      const k = t < 0.55 ? through(t, 0.05, 0.5) : 1 - through(t, 0.6, 0.95);
      between(hand, away.copy(port).setPosition(Viewmodel.AWAY), port, k);
      this.arms.setHand("left", hand, "hold");
      // The shell lies along the fingers until it's pushed in.
      this.shell.visible = t < 0.55;
      this.shell.matrix.copy(hand).multiply(new THREE.Matrix4().makeTranslation(0, 0.105, PALM_SURFACE_Z - 0.012));
      this.shell.matrixWorldNeedsUpdate = true;
      return;
    }
    // A magazine: to it, off with it, back with the next, home; then the bolt's release (from empty) and the handguard.
    const down = reload.out + (reload.in - reload.out) * 0.4;
    const up = reload.out + (reload.in - reload.out) * 0.58;
    let pose: "fore" | "grip" | "hold" | "flat" = "hold";
    if (t < reload.out) {
      const k = through(t, 0, reload.out * 0.8);
      between(hand, fore, mag, k);
      pose = k < 0.5 ? hands.leftPose : "hold";
    } else if (t < down) between(hand, mag, away, through(t, reload.out, down));
    else if (t < up) hand.copy(away);
    else if (t < reload.in) between(hand, away, mag, through(t, up, reload.in));
    else if (reload.empty) {
      const slap = reload.in + (1 - reload.in) * 0.45;
      const bolt = onGun(hands.bolt);
      if (t < slap) {
        between(hand, mag, bolt, through(t, reload.in, slap));
        pose = "flat";
      } else {
        const k = through(t, slap + (1 - slap) * 0.15, 1);
        between(hand, bolt, fore, k);
        pose = k < 0.5 ? "flat" : hands.leftPose;
      }
    } else {
      const k = through(t, reload.in, reload.in + (1 - reload.in) * 0.8);
      between(hand, mag, fore, k);
      pose = k < 0.5 ? "hold" : hands.leftPose;
    }
    this.arms.setHand("left", hand, pose);
    // The magazine goes with the hand while it's out of the gun.
    if (t >= reload.out && t < reload.in) {
      const toGun = new THREE.Matrix4().copy(at).invert();
      const moved = new THREE.Vector3().setFromMatrixPosition(hand).applyMatrix4(toGun).sub(new THREE.Vector3().setFromMatrixPosition(hands.mag));
      gun.mag.position.copy(gun.magHome).add(moved);
    }
  }

  /**
   * A gadget in hand (Phase 8, gadgets/hands.ts): its model at most a hand's size (a big placed one packed), low on
   * the right; it comes up as it's taken out, draws back for a throw and goes down while it's being placed.
   */
  private poseHeld(gadget: { data: GadgetData; detonator: boolean } | null, s: PawnState) {
    const key = gadget ? `${gadget.data.id}:${gadget.detonator}` : "";
    if (key !== this.heldKey) {
      this.heldKey = key;
      this.heldModel?.dispose();
      this.heldModel = null;
      this.held = null;
      if (this.screen) {
        this.screen.geometry.dispose();
        (this.screen.material as THREE.Material).dispose();
        this.screen = null;
      }
      if (gadget) {
        // A swung item (Sledge's hammer, Phase 8 M4) is drawn long; anything else no bigger than a hand holds.
        const cap = gadget.data.use.kind === "swing" ? 0.6 : 0.3;
        const shape = heldShape(gadget.detonator ? "detonator" : gadget.data.id, gadget.data.sizeM, cap);
        const [w, h, d] = shape.size;
        this.heldSize = [w, h, d];
        this.heldModel = shapeModel(shape.parts);
        this.held = this.heldModel.group;
        this.camera.add(this.held);
        if (!gadget.detonator && gadget.data.use.kind === "hold") {
          // Its screen, on the face toward the eye once it's up (green: Pulse's heartbeats; blue: Dokkaebi's tablet).
          this.screen = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, h * 0.72), new THREE.MeshBasicMaterial({ color: gadget.data.sensor ? 0x0f5132 : 0x0c4a6e }));
          this.screen.position.set(0, h * 0.06, d / 2 + 0.001);
          this.held.add(this.screen);
        }
      }
    }
    if (!this.held) return;
    const equip = this.data.gadgetRules.equipS * 64;
    const up = s.gAct === GadgetAct.Equip ? Math.min(1, s.gTicks / Math.max(1, equip)) : 1;
    const windup = s.gAct === GadgetAct.Throw || s.gAct === GadgetAct.Lob ? Math.min(1, s.gTicks / Math.max(1, this.data.gadgetRules.throw.windupS * 64)) : 0;
    const placing = s.gAct === GadgetAct.Place ? 1 : 0;
    // A swing: brought down to its blow (`hitS` in), then back up.
    const u = gadget?.data.use;
    let strike = 0;
    if (u?.kind === "swing" && s.gAct === GadgetAct.Swing) {
      const p = Math.min(1, s.gTicks / Math.max(1, u.swingS * 64));
      const hit = u.hitS / u.swingS;
      strike = p < hit ? smooth(p / hit) : 1 - smooth((p - hit) / Math.max(1e-6, 1 - hit));
    }
    if (u?.kind === "hold" && !gadget?.detonator) {
      // Held up to the face like a scope (Pulse's sensor, Ulo's test; Dokkaebi's tablet the same): it comes up from the
      // hip over its equip time to just under the eyes, its screen toward them.
      const k = smooth(up);
      this.held.position.set(lerp(0.2, 0, k), lerp(-0.42, -0.06, k), lerp(-0.45, -0.24, k));
      this.held.rotation.set(lerp(-0.9, -0.08, k), lerp(-0.4, 0, k), 0);
      this.holdHeld("up");
      return;
    }
    this.held.position.set(0.2 + windup * 0.06, -0.2 - (1 - smooth(up)) * 0.25 - placing * 0.12 + windup * 0.08 - strike * 0.1, -0.45 + windup * 0.12 - strike * 0.15);
    this.held.rotation.set(-0.2 - windup * 0.8 + (u?.kind === "swing" ? 0.7 - strike * 1.8 : 0), -0.3, 0);
    this.holdHeld(u?.kind === "swing" && !gadget?.detonator ? "swing" : "palm");
  }

  /**
   * The hands on the gadget in them: lying in the right palm; held up by its sides in both; or (a hammer, its handle
   * standing along its own y) the right low on its grip and the left a little up it.
   */
  private holdHeld(how: "palm" | "up" | "swing") {
    const held = this.held!;
    held.updateMatrix();
    const [w, h] = this.heldSize;
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const on = (m: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(held.matrix, m);
    if (how === "palm") {
      // Palm up under it, the thumb to the outside, the fingers closed up round it.
      this.arms.setHand("right", on(handFrame(new THREE.Matrix4(), v(0, -h / 2, 0.01), v(-1, 0, 0), v(0, 0.2, -1), { x: 0, y: PALM.y, z: PALM_SURFACE_Z })), "hold");
    } else if (how === "up") {
      // By its lower corners: palms in, fingers behind it, thumbs up along its face's edges (clear of its screen).
      const palm = { x: 0, y: 0.05, z: -0.014 };
      this.arms.setHand("right", on(handFrame(new THREE.Matrix4(), v(w / 2, -h * 0.36, 0), v(0, -0.3, -0.9), v(-0.12, 0.95, -0.3), palm)), "edge");
      this.arms.setHand("left", on(handFrame(new THREE.Matrix4(), v(-w / 2, -h * 0.36, 0), v(0, 0.3, 0.9), v(0.12, 0.95, -0.3), palm)), "edge");
    } else {
      this.arms.setHand("right", on(handFrame(new THREE.Matrix4(), v(0, -h / 2 + h * 0.12, 0), v(0, -1, 0), v(0, 0, -1))), "grip");
      this.arms.setHand("left", on(handFrame(new THREE.Matrix4(), v(0, -h / 2 + h * 0.36, 0), v(0, 1, 0), v(0, 0, -1))), "grip");
    }
  }

  /** Light the gun as the world around it is lit: `k` of daylight (a map's basement is darker). */
  setLight(k: number) {
    this.fill.intensity = VIEWMODEL_FILL * k;
    this.keyLight.intensity = VIEWMODEL_KEY * k;
    this.scene.environmentIntensity = VIEWMODEL_ENV * k;
  }

  /** The sky's environment (the art pass, Phase 10 M7): the gun's metal reflects it, as the light at the eye dims it. */
  setEnvironment(env: THREE.Texture | null) {
    this.scene.environment = env;
  }

  /** Draw over the world (call after rendering the world scene; clears depth first). */
  render(renderer: THREE.WebGLRenderer) {
    if (!this.rig.visible && !this.knife.visible && !this.held) return;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }
}
