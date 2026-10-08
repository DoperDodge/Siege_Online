// Three.js scene for labs: greybox level colored by surface class (PLAN §9.1), labels, pawn bodies
// built from hitbox capsules, and an F3 hitbox visualizer.
import * as THREE from "three";
import { eyePose, isDowned, PawnMode, poseHitboxes, type BuiltLevel, type GameData, type Hitbox, type PawnState, type Renderable } from "@redmond/shared";
import { buildGun, gunKey, type GunLook, type GunModel } from "./gunKit.js";

export const SURFACE_COLORS: Record<Renderable["surface"], number> = {
  SOFT_WALL: 0xe6c34a,
  REINFORCEABLE: 0x4d8fe0,
  REINFORCED_WALL: 0x2f5f9e,
  HARD_WALL: 0x8a8f96,
  SOFT_FLOOR: 0xc9a86a,
  HARD_FLOOR: 0x4a4f57,
  HATCH: 0x58b36b,
  BARRICADE: 0x9b6a3c,
  WINDOW: 0x9fd6e8,
  PROP: 0xa58156,
  INGREDIENT: 0xd9534f,
  LADDER: 0xe08a2e,
};

/** `low`: no shadows and no anti-aliasing (`?lowgfx`: slow devices, and the browser tests' software rendering). */
export function createRenderer(container: HTMLElement, low = false): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * Draw everything in `scene` once, hidden things included, so every shader it needs is compiled and checked
 * now. A shader's first draw blocks until it is ready (hundreds of ms on software rendering; compile() alone
 * doesn't finish the job there), and in the middle of a fight that frame would also hold back your input.
 * Lights keep their state: showing one would change the light count every shader is built for.
 */
export function warmShaders(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const saved: [THREE.Object3D, boolean, boolean][] = [];
  scene.traverse((o) => {
    if ((o as THREE.Light).isLight) return;
    saved.push([o, o.visible, o.frustumCulled]);
    o.visible = true;
    o.frustumCulled = false;
  });
  renderer.render(scene, camera);
  for (const [o, visible, culled] of saved) {
    o.visible = visible;
    o.frustumCulled = culled;
  }
}

export function createLabScene(level: BuiltLevel): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb4c7);
  scene.fog = new THREE.Fog(0x9fb4c7, 60, 140);

  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x3a3f36, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -36;
  sc.right = sc.top = 36;
  sc.near = 1;
  sc.far = 90;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const materials = new Map<string, THREE.Material>();
  const material = (r: Renderable) => {
    const key = r.id === "floor" ? "floor" : r.surface;
    let mat = materials.get(key);
    if (!mat) {
      mat =
        key === "floor"
          ? new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.95 })
          : new THREE.MeshStandardMaterial({ color: SURFACE_COLORS[r.surface], roughness: 0.85, metalness: r.surface === "LADDER" ? 0.4 : 0 });
      materials.set(key, mat);
    }
    return mat;
  };

  for (const r of level.renderables) {
    if (!r.visible) continue;
    if (r.label) labels.push(labelSprite(r.label, r.center[0], r.center[1] + r.size[1] / 2 + 0.4, r.center[2]));
    if (r.kind === "panel") continue; // drawn from its cells (PanelView)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(r.size[0], r.size[1], r.size[2]), material(r));
    mesh.position.set(r.center[0], r.center[1], r.center[2]);
    mesh.quaternion.set(r.quat[0], r.quat[1], r.quat[2], r.quat[3]);
    if (r.id === "floor") {
      const tex = (mesh.material as THREE.MeshStandardMaterial).map!;
      tex.repeat.set(r.size[0] / 2, r.size[2] / 2);
    }
    mesh.castShadow = r.id !== "floor";
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  scene.add(...labels);
  return scene;
}

const labels: THREE.Sprite[] = [];

/** Hide labels right next to the camera (they're sized in world units and would fill the screen). */
export function updateLabels(camera: THREE.Camera) {
  for (const l of labels) l.visible = l.position.distanceToSquared(camera.position) > 3.5 * 3.5;
}

function gridTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4a4f57";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#5a606a";
  g.lineWidth = 2;
  g.strokeRect(0, 0, 128, 128);
  g.strokeStyle = "#51565f";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, 128);
  g.moveTo(0, 64);
  g.lineTo(128, 64);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function labelSprite(text: string, x: number, y: number, z: number): THREE.Sprite {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = "600 30px system-ui, sans-serif";
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 28;
  c.width = w;
  c.height = 48;
  g.font = font;
  g.fillStyle = "rgba(10,12,16,0.72)";
  g.beginPath();
  g.roundRect(0, 0, w, 48, 10);
  g.fill();
  g.fillStyle = "#f3f4f6";
  g.textBaseline = "middle";
  g.fillText(text, 14, 25);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set((w / 48) * 0.34, 0.34, 1);
  sprite.position.set(x, y, z);
  return sprite;
}

/** A pawn drawn as capsules around its hitboxes (placeholder body until the art pass), plus a wireframe. */
export class PawnView {
  readonly body = new THREE.Group();
  readonly wire = new THREE.Group();
  private readonly bodyParts: CapsuleParts[] = [];
  private readonly wireParts: CapsuleParts[] = [];
  private readonly tag: THREE.Sprite | null;
  private readonly materials: THREE.Material[];
  private gun: GunModel | null = null;
  private gunLook = "";
  private gunVisible = false;

  /** `name` puts a name tag over the head (other players online); `wireColor` colours the hitbox view. */
  constructor(
    private readonly scene: THREE.Scene,
    color: number,
    name?: string,
    wireColor = 0xff3b3b,
  ) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5 });
    const wireMat = new THREE.MeshBasicMaterial({ color: wireColor, wireframe: true, depthTest: false, transparent: true, opacity: 0.75 });
    this.materials = [mat, headMat, wireMat];
    for (let i = 0; i < 8; i++) {
      this.bodyParts.push(new CapsuleParts(this.body, i === 0 ? headMat : mat, true));
      this.wireParts.push(new CapsuleParts(this.wire, wireMat, false));
    }
    this.tag = name ? labelSprite(name, 0, 0, 0) : null;
    if (this.tag) {
      this.tag.scale.multiplyScalar(0.7);
      this.body.add(this.tag);
    }
    scene.add(this.body, this.wire);
  }

  update(data: GameData, state: PawnState) {
    const parts = poseHitboxes(data.movement, data.hitboxes, state);
    parts.forEach((hb, i) => {
      this.bodyParts[i].place(hb, 1);
      this.wireParts[i].place(hb, 1.02);
    });
    if (this.tag) {
      const head = parts[0]; // the head capsule comes first
      this.tag.position.set(head.b[0], Math.max(head.a[1], head.b[1]) + head.radius + 0.3, head.b[2]);
    }
    // The gun it holds: in front of the chest along the view (placeholder until the art pass); none while
    // down or dead.
    this.gunVisible = this.gun !== null && state.mode !== PawnMode.Dead && !isDowned(state);
    if (this.gun) {
      this.gun.group.visible = this.gunVisible;
      const eye = eyePose(data.movement, data.hitboxes, state).pos;
      const rot = new THREE.Euler(state.pitch, state.yaw, 0, "YXZ");
      this.gun.group.position.set(...eye).add(new THREE.Vector3(0.16, -0.22, -0.2).applyEuler(rot));
      this.gun.group.rotation.copy(rot);
    }
  }

  /** The gun this body holds (from the roster's loadout), or none. */
  setWeapon(look: GunLook | null) {
    const key = look ? gunKey(look) : "";
    if (key === this.gunLook) return;
    this.gun?.dispose();
    this.gun = look ? buildGun(look) : null;
    this.gunLook = key;
    if (this.gun) this.body.add(this.gun.group);
  }

  /** Where this body's laser leaves from, in the world (null without a visible laser). */
  laserOrigin(): THREE.Vector3 | null {
    if (!this.gun?.laser || !this.gunVisible || !this.body.visible) return null;
    this.gun.group.updateMatrixWorld();
    return this.gun.laser.clone().applyMatrix4(this.gun.group.matrixWorld);
  }

  /**
   * First person: our own body draws nothing (no colour, no depth) but still casts its shadow
   * (core_mechanics.md §15: you see your own shadow), and its gun is the viewmodel instead.
   */
  setFirstPerson(on: boolean) {
    for (const m of this.materials.slice(0, 2)) {
      m.colorWrite = !on;
      m.depthWrite = !on;
    }
    if (this.gun) this.gun.group.visible = this.gunVisible && !on;
  }

  /** Remove from the scene and free the GPU resources it owns. */
  dispose() {
    this.gun?.dispose();
    this.scene.remove(this.body, this.wire);
    for (const m of this.materials) m.dispose();
    if (this.tag) {
      this.tag.material.map?.dispose();
      this.tag.material.dispose();
    }
  }
}

const CYL = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
const SPH = new THREE.SphereGeometry(1, 14, 10);
const WIRE_CYL = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
const WIRE_SPH = new THREE.SphereGeometry(1, 8, 6);
const UP = new THREE.Vector3(0, 1, 0);

/** An exact capsule from a unit cylinder plus two unit spheres, re-scaled every frame. */
export class CapsuleParts {
  private readonly cyl: THREE.Mesh;
  private readonly capA: THREE.Mesh;
  private readonly capB: THREE.Mesh;

  constructor(parent: THREE.Group, mat: THREE.Material, solid: boolean) {
    this.cyl = new THREE.Mesh(solid ? CYL : WIRE_CYL, mat);
    this.capA = new THREE.Mesh(solid ? SPH : WIRE_SPH, mat);
    this.capB = new THREE.Mesh(solid ? SPH : WIRE_SPH, mat);
    for (const m of [this.cyl, this.capA, this.capB]) {
      m.castShadow = solid;
      if (!solid) m.renderOrder = 10;
      parent.add(m);
    }
  }

  place(hb: Hitbox, grow: number) {
    const a = new THREE.Vector3(...hb.a);
    const b = new THREE.Vector3(...hb.b);
    const r = hb.radius * grow;
    const dir = b.clone().sub(a);
    const len = dir.length();
    this.capA.position.copy(a);
    this.capB.position.copy(b);
    this.capA.scale.setScalar(r);
    this.capB.scale.setScalar(r);
    this.cyl.visible = len > 1e-4;
    if (this.cyl.visible) {
      this.cyl.position.copy(a).add(b).multiplyScalar(0.5);
      this.cyl.quaternion.setFromUnitVectors(UP, dir.normalize());
      this.cyl.scale.set(r, len, r);
    }
  }
}
