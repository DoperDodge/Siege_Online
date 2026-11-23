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
import { pistolHeld, shellCycle } from "./bodyPose.js";
import { FpArms, handFrame, PALM, PALM_SURFACE_Z } from "./fpArms.js";
import { heldShape, knifeShape, restsAt, SENSOR_DISPLAY, shapeModel, type ShapeModel } from "./gadgetShapes.js";
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
  /** Whether the magazine comes out with the hand (a double's breech and a revolver's cylinder are loaded in place). */
  magMoves: boolean;
  bolt: THREE.Matrix4;
  /** Where a shell goes in (a shotgun's port, a double's breech, a revolver's cylinder), for the hand that feeds it. */
  port: THREE.Matrix4;
}

/** A reload under way: how far through it is and (a magazine's) when it's out and in; a shell at a time, its cycle. */
interface Reload {
  t: number;
  out: number;
  in: number;
  empty: boolean;
  shells: { k: number; shell: boolean } | null;
}

/** How far a grip leans back as it goes down (most of ours: 15°). */
const GRIP_RAKE = 15 * DEG;

/** The hands' frames on a gun (gun frame: x right, y up, z back). */
function gunHands(gun: GunModel, pistol: boolean): GunHands {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const grip = gun.hold.grip;
  // The right hand: its x down the grip, its fingers forward round the front of it, its back to the right.
  const right = handFrame(new THREE.Matrix4(), grip, v(0, -Math.cos(GRIP_RAKE), Math.sin(GRIP_RAKE)), v(0, -0.25, -1));
  // A left hand closed round something upright (a grip under the handguard, a pistol's grip from the left, a
  // magazine): its thumb side up, fingers forward, its back to the left.
  const upright = (at: THREE.Vector3, palm: { x: number; y: number; z: number } = PALM) => handFrame(new THREE.Matrix4(), at, v(0, 1, 0), v(0, 0, -1), palm);
  let left: THREE.Matrix4;
  let leftPose: GunHands["leftPose"] = "fore";
  if (gun.hold.fore && gun.hold.foreGrip) {
    // On an upright grip ahead (fitted or built on, a Vector's magazine): a machine pistol's too.
    left = upright(gun.hold.fore);
    leftPose = "grip";
  } else if (pistol || !gun.hold.fore) {
    // Both hands on the one grip: the left wrapped over the right's fingers from its side.
    left = upright(v(grip.x - 0.014, grip.y - 0.016, grip.z - 0.004));
    leftPose = "grip";
  } else {
    // Cupped under the handguard: its thumb side forward, fingers across under it to the right, its back down.
    left = handFrame(new THREE.Matrix4(), gun.hold.fore, v(0, 0, -1), v(1, 0.3, 0), { x: 0, y: PALM.y, z: 0.014 });
  }
  // A shotgun's port (or a double's breech, a revolver's cylinder): the hand comes up under it, its fingertips there.
  const portAt = gun.hold.port ?? v(0, grip.y + 0.012, grip.z - 0.1);
  const port = handFrame(new THREE.Matrix4(), portAt, v(0, 0, -1), v(1, 0.5, 0), { x: 0, y: 0.1, z: PALM_SURFACE_Z - 0.006 });
  // The magazine: the palm on its left face, round its lower part (what shows of a pistol's under its butt; an LMG's
  // box by its side). One that doesn't come out: the hand goes to where shells go in instead.
  const box = gun.hold.magBox;
  const mag = box ? upright(v(box.min.x, box.min.y + (box.max.y - box.min.y) * 0.4, (box.min.z + box.max.z) / 2), { x: 0, y: PALM.y, z: PALM_SURFACE_Z }) : port.clone();
  // The bolt's release, on the left of the receiver over the magazine: slapped with the flat of the hand.
  // (Its fingers along the receiver, forward and a little up; its back to the left: the axis is their cross.)
  const along = v(0, 0.3, -0.95).normalize();
  const bolt = handFrame(new THREE.Matrix4(), v(-0.022, grip.y + 0.065, grip.z - 0.075), along.clone().cross(v(-1, 0, 0)), along, { x: 0, y: 0.03, z: PALM_SURFACE_Z });
  return { right, left, leftPose, mag, magMoves: box !== null, bolt, port };
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
/** Where under an item lying in the palm the palm is (its own frame: a little behind its middle). */
const HELD_PALM_Z = 0.01;
/** How many guns stay built (the primary, the secondary, one more after a loadout change, Ohm's pistol). */
const GUNS_KEPT = 4;
/** How long a gadget that's a gun takes to come up to the eye (s): a pistol's (the 5.7's `adsS`). */
const GADGET_ADS_S = 0.24;

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
  /** Murmur's Blood Oxygen Sensor all the way up: the page draws its readout (sensorScreen). */
  private sensorUp = false;
  /** Ohm's pistol aimed (R3): ADS held with it out (the page's, set each frame); it comes up to the eye. */
  scoped = false;
  /** A gadget that's a gun is in hand this frame (Ohm's pistol): the page draws what its sight shows (lensScreen). */
  gadgetGun = false;
  /** That gun's aiming, uneased (0…1), and its shot as last seen (a new one kicks it). */
  private aimRaw = 0;
  private shooting = false;
  private lastShootTicks = 0;
  /** Where the palm under it is, its own frame: how low it comes there, and how far back (gadgetShapes.ts restsAt). */
  private heldRest = { y: 0, z: 0 };
  /** A held-up item's screen (Murmur's sensor, Relay's tablet): lit, facing the eye. */
  private screen: THREE.Mesh | null = null;
  private heldKey = "";
  private readonly flash: THREE.Sprite;
  private readonly fill: THREE.HemisphereLight;
  private readonly keyLight: THREE.DirectionalLight;
  private flashUntil = 0;
  private kick = 0;
  private sprintW = 0;
  /** How far the gun is tipped over for a reload, and for a shotgun's shells (eased). */
  private reloadW = 0;
  private shellW = 0;
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
   * `swapTicks` the loadout's swap time; `dt` seconds since the last frame. `behindShield`: a raised shield's pistol,
   * hidden until it's aimed over it; `besideShield`: a pistol held one-handed beside one, from the hip (Hull's, R3).
   */
  update(now: number, dt: number, w: ResolvedWeapon | null, s: PawnState, swapTicks: number, gadget: { data: GadgetData; detonator: boolean } | null = null, behindShield = false, besideShield = false) {
    const show = w !== null && s.mode !== PawnMode.Dead && !isDowned(s);
    this.knife.visible = false;
    this.shell.visible = false;
    this.arms.setHand("left", null);
    this.arms.setHand("right", null);
    // A gadget that's a gun (R3: Ohm's Brownout Pistol, a "shoot" item; Rivet's Stud Driver, a "launch" one) is posed as
    // a gun is; any other as a gadget.
    const isGun = gadget?.data.use.kind === "shoot" || gadget?.data.use.kind === "launch";
    const gadgetGun = show && gadget !== null && !gadget.detonator && isGun ? gadget.data : null;
    this.gadgetGun = gadgetGun !== null;
    this.poseHeld(show && !gadgetGun ? gadget : null, s);
    this.rig.visible = show && (!gadget || gadgetGun !== null);
    if (gadgetGun) {
      this.poseGadgetGun(now, dt, gadgetGun, s);
      this.arms.update();
      return;
    }
    if (!show || !w || gadget) {
      this.aim = 0;
      this.arms.update();
      return;
    }
    const gun = this.useGun(`w:${gunKey({ id: w.id, class: w.class, pick: w.pick })}`, () => buildGun({ id: w.id, class: w.class, pick: w.pick }, this.kit), pistolHeld(w.class));
    // Aiming: the sight line comes onto the view axis, adsDistance in front of the eye.
    this.aim = smooth(s.adsQ / 65535);
    // Hail's pistol is behind his raised shield until it's slid down far enough to aim over (Phase 8 M11).
    if (behindShield && this.aim < 0.6) this.rig.visible = false;
    // Swapping: the new weapon comes up from below; reloading: a dip and a roll, the magazine out and back.
    let reload: Reload | null = null;
    let tilt = 0;
    let equip: number | null = null;
    if (s.wAct === WeaponAct.Equip) equip = Math.min(1, s.actTicks / Math.max(1, swapTicks));
    else if (s.wAct === WeaponAct.Reload && w.reload.kind !== "none") {
      const r = w.reload;
      if (r.kind === "magazine") {
        const tac = s.reloadKind === ReloadKind.Tactical;
        const total = Math.max(1, tac ? r.tacticalTicks : r.emptyTicks);
        const t = Math.min(1, s.actTicks / total);
        reload = { t, out: (tac ? r.magOutTacticalTicks : r.magOutEmptyTicks) / total, in: (tac ? r.refillTacticalTicks : r.refillEmptyTicks) / total, empty: !tac, shells: null };
        tilt = through(t, 0, 0.14) * (1 - through(t, 0.86, 1));
      } else {
        reload = { t: 0, out: 0, in: 1, empty: false, shells: shellCycle(s.actTicks, s.reloadKind === ReloadKind.Empty, r) };
        tilt = 1;
      }
    }
    // Magnified sights: once fully aimed, the scope overlay replaces the gun (see the lab's .scope).
    this.placeGun(now, dt, gun, s, { equip, reload, tilt, hideAimed: w.ads.zoom > 1, oneHanded: behindShield || besideShield });
  }

  /**
   * Ohm's Brownout Pistol (R3, Ulo's design) as a gun: the gun kit's big-slide pistol with its coil shroud and its
   * curved sight (gunKit.ts); Rivet's Stud Driver too, the kit's hand cannon with its drum. Aimed (the page's `scoped`: ADS held with it out) it comes up to the eye over a pistol's
   * aiming time; a round kicks it; then the magazine's changed over the reload time (the 5.7's, Ulo): the left hand
   * takes the empty one off the bottom of the grip, down out of the picture, and back with the next, as a pistol's
   * reload goes. Taken out, it comes up from below.
   */
  private poseGadgetGun(now: number, dt: number, data: GadgetData, s: PawnState) {
    const u = data.use;
    if (u.kind !== "shoot" && u.kind !== "launch") return;
    // (Rivet's driver, R3: its own irons; a salvo's kick, then the next loaded over its cycle as a magazine's changed.)
    const look = { id: data.id, class: "handgun", pick: { sight: u.kind === "shoot" ? "emp" : null, barrel: null, grip: null, underbarrel: null } };
    const gun = this.useGun(`g:${gunKey(look)}`, () => buildGun(look, this.kit), true);
    this.reticle = "posts";
    // Aiming, eased over a pistol's ADS time (it's the page's, not the simulation's).
    this.aimRaw = THREE.MathUtils.clamp(this.aimRaw + (this.scoped ? dt : -dt) / GADGET_ADS_S, 0, 1);
    this.aim = smooth(this.aimRaw);
    let equip: number | null = null;
    let reload: Reload | null = null;
    let tilt = 0;
    if (s.gAct === GadgetAct.Equip) equip = Math.min(1, s.gTicks / Math.max(1, ticks(this.data.gadgetRules.equipS)));
    else if (s.gAct === GadgetAct.Shoot) {
      // The round's kick as it goes; then the magazine changed over the rest (out a quarter of the way, in by half).
      if (s.gTicks < this.lastShootTicks || !this.shooting) this.kick = 1;
      const total = Math.max(1, ticks(u.kind === "shoot" ? u.reloadS : u.cycleS));
      const t = Math.min(1, s.gTicks / total);
      reload = { t, out: 0.25, in: 0.5, empty: false, shells: null };
      tilt = through(t, 0.04, 0.16) * (1 - through(t, 0.86, 1));
    }
    this.shooting = s.gAct === GadgetAct.Shoot;
    this.lastShootTicks = this.shooting ? s.gTicks : 0;
    this.placeGun(now, dt, gun, s, { equip, reload, tilt, hideAimed: false, oneHanded: false });
  }

  /** The gun built for `key` (kept among the last few built), made the one in hand. */
  private useGun(key: string, build: () => GunModel, pistol: boolean): GunModel {
    if (key !== this.key) {
      // The last few guns in hand stay built (a swap back and forth builds nothing): the newest last.
      if (this.gun) this.gun.group.visible = false;
      let built = this.guns.get(key);
      if (built) this.guns.delete(key);
      else {
        built = build();
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
      this.hands = gunHands(built, pistol);
      this.leftKnown = false;
    }
    return this.gun!;
  }

  /**
   * The gun in hand placed for this frame: at the hip or on the eye's line (`aim`), coming up from below as it's taken
   * out (`equip`, 0…1), tipped over for a reload (`tilt`) and its hands working it (`reload`), sprinting, the knife,
   * kick, sway and breath; hidden once fully aimed through a magnified sight (`hideAimed`).
   */
  private placeGun(now: number, dt: number, gun: GunModel, s: PawnState, o: { equip: number | null; reload: Reload | null; tilt: number; hideAimed: boolean; oneHanded: boolean }) {
    const vm = this.kit.viewmodel;
    const hip = new THREE.Vector3(...vm.hip);
    const ads = new THREE.Vector3(0, 0, -vm.adsDistance).sub(gun.sight);
    const pos = hip.lerp(ads, this.aim);
    const rot = new THREE.Euler(0, 0, 0, "YXZ");
    // Sprinting: lowered and turned in.
    this.sprintW = THREE.MathUtils.damp(this.sprintW, s.sprinting ? 1 : 0, 10, dt);
    pos.add(new THREE.Vector3(...vm.sprint.offset).multiplyScalar(this.sprintW));
    rot.y += vm.sprint.yawDeg * DEG * this.sprintW;
    rot.x += vm.sprint.pitchDeg * DEG * this.sprintW;
    gun.mag.position.copy(gun.magHome);
    if (o.equip !== null) {
      pos.y -= (1 - smooth(o.equip)) * vm.downFor.equip;
      rot.x -= (1 - smooth(o.equip)) * 0.6;
    }
    const reload = o.reload;
    // Up, in and tipped over for the hand that works it (gun_kit.json `viewmodel.reload`), eased on and off (a reload
    // cut short, the last shell in); aimed through it, the gun stays on the eye's line (its reticle is drawn there).
    this.reloadW = THREE.MathUtils.damp(this.reloadW, o.tilt * (1 - this.aim), 12, dt);
    this.shellW = THREE.MathUtils.damp(this.shellW, reload?.shells ? 1 : 0, 12, dt);
    {
      const k = this.reloadW;
      pos.add(new THREE.Vector3(...vm.reload.offset).multiplyScalar(k));
      rot.x += k * vm.reload.pitchDeg * DEG;
      rot.y += k * vm.reload.yawDeg * DEG;
      rot.z += k * (vm.reload.rollDeg + this.shellW * vm.reload.shellRollDeg) * DEG;
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
    gun.group.visible = !(o.hideAimed && this.aim > 0.92);
    this.flash.visible = now < this.flashUntil && gun.group.visible;
    if (this.flash.visible) this.flash.position.copy(gun.muzzle).applyEuler(rot).add(pos);
    if (this.rig.visible && gun.group.visible && this.hands) this.poseArms(gun, this.hands, new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1)), reload, o.oneHanded, dt);
    else this.leftKnown = false;
    if (stab) {
      // The knife in the right fist (whether or not the gun is drawn): its handle across the palm, the blade out past
      // the thumb.
      this.knife.updateMatrix();
      const handle = handFrame(new THREE.Matrix4(), new THREE.Vector3(0, -0.001, 0.052), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0));
      this.arms.setHand("right", new THREE.Matrix4().multiplyMatrices(this.knife.matrix, handle), "fist");
    }
    this.arms.update();
  }

  /** Where the left hand goes out of the picture to (a magazine dropped in a pouch, the next one taken), camera space. */
  private static readonly AWAY = new THREE.Vector3(-0.1, -0.56, -0.12);

  /** The left hand as it was last drawn, in the gun's frame (a hold that changes at once is eased over: a reload cut short). */
  private readonly leftInGun = new THREE.Matrix4();
  private leftKnown = false;

  /**
   * The hands on the gun (`at`: its place in the camera's space): the right on its grip; the left under its handguard
   * (or on a grip there), or working a reload: to the magazine, away with it and back with the next (which it carries:
   * a double's breech and a revolver's cylinder are loaded in place, a shell in the hand), then (from empty) the bolt's
   * release; a shell at a time into a shotgun. The left eases over in the gun's frame when its hold jumps.
   */
  private poseArms(gun: GunModel, hands: GunHands, at: THREE.Matrix4, reload: Reload | null, oneHanded: boolean, dt: number) {
    const onGun = (m: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(at, m);
    this.arms.setHand("right", onGun(hands.right), "grip");
    // Hail's other hand is on his shield.
    if (oneHanded) {
      this.leftKnown = false;
      return;
    }
    const fore = onGun(hands.left);
    const hand = new THREE.Matrix4();
    let pose: "fore" | "grip" | "hold" | "flat" = hands.leftPose;
    let shell = false;
    if (!reload) hand.copy(fore);
    else {
      const mag = onGun(hands.mag);
      // Away: the hand as it holds the magazine, down out of the picture.
      const away = mag.clone().setPosition(Viewmodel.AWAY);
      if (reload.shells) {
        // From the pouch with a shell up to the port, in, and down for the next (bodyPose.ts shellCycle).
        const port = onGun(hands.port);
        between(hand, away.copy(port).setPosition(Viewmodel.AWAY), port, reload.shells.k);
        pose = "hold";
        shell = reload.shells.shell;
      } else {
        // A magazine: to it, off with it, back with the next, home; then the bolt's release (from empty) and the handguard.
        const { t } = reload;
        const down = reload.out + (reload.in - reload.out) * 0.4;
        const up = reload.out + (reload.in - reload.out) * 0.58;
        pose = "hold";
        if (t < reload.out) {
          const k = through(t, 0, reload.out * 0.8);
          between(hand, fore, mag, k);
          pose = k < 0.5 ? hands.leftPose : "hold";
        } else if (t < down) between(hand, mag, away, through(t, reload.out, down));
        else if (t < up) hand.copy(away);
        else if (t < reload.in) {
          between(hand, away, mag, through(t, up, reload.in));
          // Loaded in place (a breech, a cylinder): it brings shells, not a magazine.
          shell = !hands.magMoves;
        } else if (reload.empty) {
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
      }
    }
    // Eased in the gun's frame (the gun's own motion carries it at once; only a change of hold is eased).
    const toGun = new THREE.Matrix4().copy(at).invert();
    const target = new THREE.Matrix4().multiplyMatrices(toGun, hand);
    if (this.leftKnown) between(this.leftInGun, this.leftInGun, target, 1 - Math.exp(-dt * 30));
    else this.leftInGun.copy(target);
    this.leftKnown = true;
    hand.multiplyMatrices(at, this.leftInGun);
    this.arms.setHand("left", hand, pose);
    if (shell) {
      // A shell along the fingers until it's pushed in.
      this.shell.visible = true;
      this.shell.matrix.copy(hand).multiply(new THREE.Matrix4().makeTranslation(0, 0.105, PALM_SURFACE_Z - 0.012));
      this.shell.matrixWorldNeedsUpdate = true;
    }
    // The magazine goes with the hand while it's out of the gun.
    if (reload && !reload.shells && hands.magMoves && reload.t >= reload.out && reload.t < reload.in) {
      const moved = new THREE.Vector3().setFromMatrixPosition(this.leftInGun).sub(new THREE.Vector3().setFromMatrixPosition(hands.mag));
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
        // A swung item (Cleave's hammer, Phase 8 M4) is drawn long; anything else no bigger than a hand holds.
        const cap = gadget.data.use.kind === "swing" ? 0.6 : 0.3;
        const shape = heldShape(gadget.detonator ? "detonator" : gadget.data.id, gadget.data.sizeM, cap);
        const [w, h, d] = shape.size;
        this.heldSize = [w, h, d];
        this.heldRest = restsAt(shape.parts, HELD_PALM_Z, -h / 2);
        this.heldModel = shapeModel(shape.parts);
        this.held = this.heldModel.group;
        this.held.name = "held";
        this.camera.add(this.held);
        // (Dowser's coil, R3, has no screen: what it reads is outlined where it is, the page's.)
        if (!gadget.detonator && gadget.data.use.kind === "hold" && !gadget.data.coil) {
          // Its screen, on the face toward the eye once it's up (blue: Relay's tablet). (Murmur's Blood Oxygen Sensor's
          // screen: its plane only says where it is, for the page to draw the readout there.)
          const S = SENSOR_DISPLAY;
          this.screen = gadget.data.sensor
            ? new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), new THREE.MeshBasicMaterial())
            : new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, h * 0.72), new THREE.MeshBasicMaterial({ color: 0x0c4a6e }));
          if (gadget.data.sensor) {
            this.screen.position.set(S.cx, S.cy, S.z);
            this.screen.visible = false;
          } else this.screen.position.set(0, h * 0.06, d / 2 + 0.001);
          this.held.add(this.screen);
        }
      }
    }
    this.sensorUp = false;
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
    if (gadget?.data.id === "dropped_phone") {
      // A phone out of the pocket to turn a call off (Relay's): up in front in the right hand, its screen to the eye.
      this.held.position.set(0.05, -0.13, -0.3);
      this.held.rotation.set(1.2, -0.12, 0.08);
      this.holdHeld("palm");
      return;
    }
    if (u?.kind === "hold" && !gadget?.detonator) {
      // Held up like a scope (Relay's tablet): it comes up from the hip over its equip time to just under the eyes, its
      // screen toward them. Murmur's Blood Oxygen Sensor is held in his right hand, low on the right of the view, its
      // emitter forward and its little screen tilted up to his eyes; once it's up the page draws its readout there
      // (sensorScreen) and the people it reads where they are.
      const k = smooth(up);
      if (gadget?.data.coil) {
        // Dowser's Divining Coil (R3): in the right hand, held out ahead and low on the right, its coil leaning forward
        // over what it reads (its outlines are the page's).
        this.held.position.set(lerp(0.2, 0.13, k), lerp(-0.42, -0.2, k), lerp(-0.45, -0.42, k));
        this.held.rotation.set(lerp(-0.9, -0.55, k), lerp(-0.4, -0.12, k), 0);
        this.holdHeld("palm");
        return;
      }
      if (gadget?.data.sensor) {
        // Our own (D-183): in the right hand, low on the right, its top leaning away so the screen faces the eyes.
        this.held.position.set(lerp(0.2, 0.12, k), lerp(-0.42, -0.145, k), lerp(-0.45, -0.36, k));
        this.held.rotation.set(lerp(-0.9, -0.3, k), lerp(-0.4, -0.18, k), 0);
        this.sensorUp = up >= 1;
        this.holdHeld("palm");
        return;
      }
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
      // Palm up under it, where it rests, the thumb to the outside, the fingers closed up round it.
      this.arms.setHand("right", on(handFrame(new THREE.Matrix4(), v(0, this.heldRest.y, this.heldRest.z), v(-1, 0, 0), v(0, 0.2, -1), { x: 0, y: PALM.y, z: PALM_SURFACE_Z })), "hold");
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

  /**
   * Murmur's Blood Oxygen Sensor all the way up: where its screen is on the view (0..1 across from the left, 0..1 down
   * from the top), its four corners in order (top left, top right, bottom right, bottom left), for the page to draw the
   * readout there; null otherwise.
   */
  sensorScreen(): [number, number][] | null {
    if (!this.sensorUp || !this.held || !this.screen) return null;
    this.held.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    const g = this.screen.geometry as THREE.PlaneGeometry;
    const { width: w, height: h } = g.parameters;
    return [
      [-w / 2, h / 2],
      [w / 2, h / 2],
      [w / 2, -h / 2],
      [-w / 2, -h / 2],
    ].map(([x, y]) => {
      const p = new THREE.Vector3(x, y, 0).applyMatrix4(this.screen!.matrixWorld).project(this.camera);
      return [(p.x + 1) / 2, (1 - p.y) / 2];
    });
  }

  /**
   * Where the lens of the gun in hand is on the page (R3, Ohm's curved sight), once it's up to the eye: its middle
   * and half its width and height, as fractions of the page (0…1 from the top left); null otherwise.
   */
  lensScreen(): { cx: number; cy: number; rx: number; ry: number } | null {
    const gun = this.gun;
    if (!this.gadgetGun || !gun?.lens || !gun.group.visible || this.aim < 0.5) return null;
    gun.group.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    const at = (x: number, y: number) => {
      const p = new THREE.Vector3(gun.lens!.center.x + x, gun.lens!.center.y + y, gun.lens!.center.z).applyMatrix4(gun.group.matrixWorld).project(this.camera);
      return [(p.x + 1) / 2, (1 - p.y) / 2] as const;
    };
    const c = at(0, 0);
    const r = at(gun.lens.halfW, 0);
    const t = at(0, gun.lens.halfH);
    return { cx: c[0], cy: c[1], rx: Math.abs(r[0] - c[0]), ry: Math.abs(t[1] - c[1]) };
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
