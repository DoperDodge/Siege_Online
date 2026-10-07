// The first-person gun (Phase 3 M9): drawn in its own scene after the world with the depth cleared, so it
// never pokes into walls, by its own camera with a fixed field of view. Pose and motion come from the
// predicted body state each frame (hip, aiming, sprinting, swapping, reloading, the knife) plus cosmetic
// kick and sway; none of it feeds back into the simulation. Shapes are placeholders (gun_kit.json).
import * as THREE from "three";
import { DEG, isDowned, lerp, loadPresentationData, PawnMode, ReloadKind, ticks, WeaponAct, WFlag, type GameData, type GunKit, type PawnState, type ResolvedWeapon } from "@redmond/shared";
import { buildGun, gunKey, type GunModel } from "./gunKit.js";
import { warmShaders } from "./labScene.js";

const smooth = (t: number) => t * t * (3 - 2 * t);

export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly kit: GunKit;
  private readonly rig = new THREE.Group();
  private gun: GunModel | null = null;
  private key = "";
  private readonly knife: THREE.Mesh;
  private readonly flash: THREE.Sprite;
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
    this.scene.add(new THREE.HemisphereLight(0xe8eef5, 0x3a3f36, 1.6));
    const key = new THREE.DirectionalLight(0xfff1dc, 1.8);
    key.position.set(0.6, 1, 0.4);
    this.scene.add(key, this.camera);
    this.camera.add(this.rig);
    const blade = new THREE.BoxGeometry(0.012, 0.03, 0.2);
    this.knife = new THREE.Mesh(blade, new THREE.MeshStandardMaterial({ color: this.kit.colors.knife, metalness: 0.8, roughness: 0.25 }));
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
  update(now: number, dt: number, w: ResolvedWeapon | null, s: PawnState, swapTicks: number) {
    const vm = this.kit.viewmodel;
    const show = w !== null && s.mode !== PawnMode.Dead && !isDowned(s);
    this.rig.visible = show;
    this.knife.visible = false;
    if (!show || !w) {
      this.aim = 0;
      return;
    }
    const look = { class: w.class, pick: w.pick };
    if (gunKey(look) !== this.key) {
      this.gun?.dispose();
      this.gun = buildGun(look, this.kit);
      this.key = gunKey(look);
      this.reticle = this.gun.reticle;
      this.rig.add(this.gun.group);
    }
    const gun = this.gun!;
    // Aiming: the sight line comes onto the view axis, adsDistance in front of the eye.
    this.aim = smooth(s.adsQ / 65535);
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

  /** Draw over the world (call after rendering the world scene; clears depth first). */
  render(renderer: THREE.WebGLRenderer) {
    if (!this.rig.visible && !this.knife.visible) return;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }
}
