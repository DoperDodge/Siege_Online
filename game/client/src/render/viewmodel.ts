// The first-person gun (Phase 3 M9): drawn in its own scene after the world with the depth cleared, so it
// never pokes into walls, by its own camera with a fixed field of view. Pose and motion come from the
// predicted body state each frame (hip, aiming, sprinting, swapping, reloading, the knife) plus cosmetic
// kick and sway; none of it feeds back into the simulation. The guns are gunKit.ts's (gun_kit.json).
import * as THREE from "three";
import { DEG, GadgetAct, isDowned, lerp, loadPresentationData, PawnMode, ReloadKind, ticks, WeaponAct, WFlag, type GadgetData, type GameData, type GunKit, type PawnState, type ResolvedWeapon } from "@redmond/shared";
import { heldShape, knifeShape, shapeModel, type ShapeModel } from "./gadgetShapes.js";
import { buildGun, gunKey, type GunModel } from "./gunKit.js";
import { warmShaders } from "./labScene.js";

const smooth = (t: number) => t * t * (3 - 2 * t);
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
  private gun: GunModel | null = null;
  private key = "";
  /** The guns built, by their key (gunKit.ts gunKey), the one in hand last. */
  private readonly guns = new Map<string, GunModel>();
  private readonly knife: THREE.Object3D;
  /** A gadget in hand (Phase 8): its shaped model (gadgetShapes.ts), or a detonator; rebuilt when what's held changes. */
  private held: THREE.Object3D | null = null;
  private heldModel: ShapeModel | null = null;
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
    this.poseHeld(show ? gadget : null, s);
    this.rig.visible = show && !gadget;
    if (!show || !w || gadget) {
      this.aim = 0;
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
    if (s.wAct === WeaponAct.Equip) {
      const p = Math.min(1, s.actTicks / Math.max(1, swapTicks));
      pos.y -= (1 - smooth(p)) * vm.downFor.equip;
      rot.x -= (1 - smooth(p)) * 0.6;
    } else if (s.wAct === WeaponAct.Reload && w.reload.kind !== "none") {
      const total = w.reload.kind === "magazine" ? (s.reloadKind === ReloadKind.Tactical ? w.reload.tacticalTicks : w.reload.emptyTicks) : w.reload.perShellTicks;
      const t = w.reload.kind === "magazine" ? Math.min(1, s.actTicks / Math.max(1, total)) : (s.actTicks % Math.max(1, total)) / Math.max(1, total);
      const dip = Math.sin(Math.PI * t);
      pos.y -= dip * vm.downFor.reload;
      rot.z += dip * 0.35;
      rot.x += dip * 0.15;
      if (w.reload.kind === "magazine" && s.wflags & WFlag.MagOut && !(s.wflags & WFlag.Refilled)) gun.mag.position.y -= 0.18; // out, not yet back
    }
    // The knife: the gun drops away and a blade sweeps right to left.
    if (s.meleeTicks > 0) {
      const cycle = ticks(this.data.combat.melee.cycleSeconds);
      const p = Math.min(1, (s.meleeTicks - 1) / cycle);
      pos.y -= Math.sin(Math.PI * p) * 0.25;
      this.knife.visible = true;
      this.knife.position.set(lerp(0.25, -0.2, smooth(Math.min(1, p * 1.6))), -0.12, -0.32);
      this.knife.rotation.set(0, lerp(0.9, -0.6, p), -0.4);
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
    gun.group.position.copy(pos);
    gun.group.rotation.copy(rot);
    // Magnified sights: once fully aimed, the scope overlay replaces the gun (see the lab's .scope).
    gun.group.visible = !(w.ads.zoom > 1 && this.aim > 0.92);
    this.flash.visible = now < this.flashUntil && gun.group.visible;
    if (this.flash.visible) this.flash.position.copy(gun.muzzle).applyEuler(rot).add(pos);
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
      return;
    }
    this.held.position.set(0.2 + windup * 0.06, -0.2 - (1 - smooth(up)) * 0.25 - placing * 0.12 + windup * 0.08 - strike * 0.1, -0.45 + windup * 0.12 - strike * 0.15);
    this.held.rotation.set(-0.2 - windup * 0.8 + (u?.kind === "swing" ? 0.7 - strike * 1.8 : 0), -0.3, 0);
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
