// Three.js scene for labs and maps: greybox level colored by surface class (PLAN §9.1), its static boxes
// drawn instanced per material and storey (tools/mapgen/DESIGN.md E4), labels and a map's room callouts by
// storey (E9), pawn bodies built from hitbox capsules, and an F3 hitbox visualizer.
import * as THREE from "three";
import { eyePose, isDowned, PawnMode, poseHitboxes, type BuiltLevel, type GameData, type Hitbox, type PanelSpec, type PawnState, type Renderable } from "@redmond/shared";
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
  // Only the level casts shadows, and it changes only when a panel does: the shadow map is drawn when the
  // page asks for it (shadowMap.needsUpdate), not every frame (tools/mapgen/DESIGN.md amendment 8).
  renderer.shadowMap.autoUpdate = false;
  // A lost context takes the shadow map with it, and three only carries the old request over: draw it again.
  // (three's own listener, added by the constructor, has rebuilt the renderer's state by the time this runs.)
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    renderer.shadowMap.needsUpdate = true;
  });
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
  const shadowsAsked = renderer.shadowMap.needsUpdate;
  renderer.render(scene, camera);
  for (const [o, visible, culled] of saved) {
    o.visible = visible;
    o.frustumCulled = culled;
  }
  // A shadow map that draw made has the hidden things in it too: ask for it again, with the scene as it is.
  if (shadowsAsked) renderer.shadowMap.needsUpdate = true;
}

/**
 * The light every level is lit by, and a map's storeys above ground keep: the hemisphere light's sky and ground
 * colours and intensity, and the sun's intensity (StoreyView dims a storey below ground).
 */
export const DAYLIGHT = { sky: 0xdfe9f5, ground: 0x3a3f36, hemi: 1.1, sun: 2.2 } as const;

/** A room's callout floats this far over its anchor (a spot on the floor), about eye height. */
export const CALLOUT_UP_M = 1.6;

/** A level's scene, and the parts of it the page works with. */
export interface LabScene {
  scene: THREE.Scene;
  /**
   * The level's static boxes, a group per storey (`storey:<id>`, in the level's order), or one group
   * (`storey:all`) when the level has no storeys. Hiding one changes the shadows: ask for a new shadow map
   * (renderer.shadowMap.needsUpdate).
   */
  storeys: THREE.Group[];
  /**
   * The labels, a group per storey as the boxes are (`labels:<id>`: a label goes with the box or panel it
   * names), and the rooms' callouts (`callouts:<id>`). A map shows only the storey you're on (StoreyView).
   */
  labelGroups: THREE.Group[];
  calloutGroups: THREE.Group[];
  /** This scene's labels, callouts included (updateLabels hides the ones next to the camera). */
  labels: THREE.Sprite[];
  /** The rooms' callouts, in the level's order. */
  callouts: THREE.Sprite[];
  /** The static boxes' materials, by surface ("floor": the labs' textured floor). */
  materials: ReadonlyMap<string, THREE.MeshStandardMaterial>;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  /** Where the level is: its bounds (a map), else the box around everything drawn. */
  box: THREE.Box3;
  /** Boxes drawn instanced, and the meshes the static boxes take (a draw call each, per pass). */
  staticBoxes: number;
  staticMeshes: number;
}

/** Every instanced box is this one scaled, turned and moved. */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/**
 * The level as a scene. Every visible renderable but the panels (PanelView draws those) is drawn by one
 * InstancedMesh per material and storey, the unit box scaled per instance (exact for boxes): a map's
 * thousand boxes take a few dozen draw calls instead of one each (tools/mapgen/DESIGN.md E4). Nothing
 * raycasts the scene (shots and the laser ask the shared code's physics), so instancing only has to look
 * the same. The labs' textured floor stays a mesh of its own: its texture repeat is per mesh.
 */
export function createLabScene(level: BuiltLevel): LabScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb4c7);
  scene.fog = new THREE.Fog(0x9fb4c7, 60, 140);

  const hemi = new THREE.HemisphereLight(DAYLIGHT.sky, DAYLIGHT.ground, DAYLIGHT.hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, DAYLIGHT.sun);
  sun.castShadow = true;
  const box = levelBox(level);
  fitSun(sun, box);
  scene.add(sun, sun.target);

  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (r: Renderable) => {
    const key = r.id === "floor" ? "floor" : r.surface;
    let mat = materials.get(key);
    if (!mat) {
      mat =
        key === "floor"
          ? new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.95 })
          : new THREE.MeshStandardMaterial({ color: SURFACE_COLORS[r.surface], roughness: 0.85, metalness: r.surface === "LADDER" ? 0.4 : 0 });
      if (key === "HARD_FLOOR") worldGrid(mat);
      materials.set(key, mat);
    }
    return mat;
  };

  const ids = level.def.storeys.length ? level.def.storeys.map((s) => s.id) : ["all"];
  const groups = (kind: string) =>
    ids.map((id) => {
      const g = new THREE.Group();
      g.name = `${kind}:${id}`;
      scene.add(g);
      return g;
    });
  const storeys = groups("storey");
  const labelGroups = groups("labels");
  const calloutGroups = groups("callouts");
  const labels: THREE.Sprite[] = [];
  const label = (text: string, r: Renderable) => {
    const sprite = labelSprite(text, r.center[0], r.center[1] + r.size[1] / 2 + 0.4, r.center[2]);
    labels.push(sprite);
    labelGroups[storeyOf(level.def.storeys, r.center[1] - r.size[1] / 2)].add(sprite);
  };
  /** The boxes each instanced mesh draws, by storey and material. */
  const batches = new Map<string, { storey: number; surface: string; material: THREE.Material; boxes: Renderable[] }>();
  let staticMeshes = 0;
  for (const r of level.renderables) {
    if (!r.visible) continue;
    if (r.kind === "panel") {
      // Drawn from its cells (PanelView). A reinforceable wall says how many sections it has, so the counts
      // can be checked by eye without reinforcing (DESIGN amendment 13).
      const spec = r.panel !== undefined ? level.panels.list[r.panel]?.panel.spec : undefined;
      const n = spec && showsSections(spec) ? spec.sections : 0;
      const text = [r.label, n ? `${n} section${n === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
      if (text) label(text, r);
      continue;
    }
    if (r.label) label(r.label, r);
    const storey = storeyOf(level.def.storeys, r.center[1] - r.size[1] / 2);
    if (r.id === "floor") {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(r.size[0], r.size[1], r.size[2]), material(r));
      mesh.position.set(r.center[0], r.center[1], r.center[2]);
      mesh.quaternion.set(r.quat[0], r.quat[1], r.quat[2], r.quat[3]);
      (mesh.material as THREE.MeshStandardMaterial).map!.repeat.set(r.size[0] / 2, r.size[2] / 2);
      mesh.receiveShadow = true; // nothing is under it to cast onto
      storeys[storey].add(mesh);
      staticMeshes++;
      continue;
    }
    const key = `${storey}:${r.surface}`;
    let batch = batches.get(key);
    if (!batch) batches.set(key, (batch = { storey, surface: r.surface, material: material(r), boxes: [] }));
    batch.boxes.push(r);
  }

  const m = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const size = new THREE.Vector3();
  let staticBoxes = 0;
  for (const b of batches.values()) {
    const mesh = new THREE.InstancedMesh(UNIT_BOX, b.material, b.boxes.length);
    b.boxes.forEach((r, i) => mesh.setMatrixAt(i, m.compose(at.set(...r.center), turn.set(...r.quat), size.set(...r.size))));
    // Culling tests a sphere around all of the mesh's boxes, which the unit box's own sphere is not.
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = b.surface;
    storeys[b.storey].add(mesh);
    staticBoxes += b.boxes.length;
    staticMeshes++;
  }

  // Each room's callout over its anchor, with the room's storey (tools/mapgen/DESIGN.md E9).
  const callouts: THREE.Sprite[] = [];
  for (const room of level.def.rooms) {
    const [x, y, z] = room.anchor;
    const sprite = labelSprite(room.callout, x, y + CALLOUT_UP_M, z, CALLOUT);
    const on = level.def.storeys.findIndex((s) => s.id === room.storey);
    calloutGroups[on >= 0 ? on : storeyOf(level.def.storeys, y)].add(sprite);
    labels.push(sprite);
    callouts.push(sprite);
  }
  return { scene, storeys, labelGroups, calloutGroups, labels, callouts, materials, hemi, sun, box, staticBoxes, staticMeshes };
}

/** A wall that takes reinforcement shows its sections: seams on its faces (PanelView) and a count in its label. */
export function showsSections(spec: PanelSpec): boolean {
  return spec.construction.kind === "wall" && spec.construction.reinforceable;
}

/** How far under a storey's floor a box's bottom (its own 0.2 m slab) or a body's feet (a top step) still count as on it. */
export const STOREY_SLACK_M = 0.25;

/**
 * The storey a box is drawn with, by its place in `storeys` (listed by height): the last whose floor, less
 * STOREY_SLACK_M, is at or below the box's bottom (a storey's own 0.2 m slab hangs just under its floorY), or
 * the first for anything lower. 0 when the level has no storeys.
 */
export function storeyOf(storeys: readonly { floorY: number }[], bottom: number): number {
  let at = 0;
  for (let i = 0; i < storeys.length; i++) if (storeys[i].floorY - STOREY_SLACK_M <= bottom) at = i;
  return at;
}

/** Hide labels right next to the camera (they're sized in world units and would fill the screen). */
export function updateLabels(labels: readonly THREE.Sprite[], camera: THREE.Camera) {
  for (const l of labels) l.visible = l.position.distanceToSquared(camera.position) > 3.5 * 3.5;
}

/** Towards the sun. Every level keeps this direction; only the shadow camera moves to fit the level. */
const SUN = new THREE.Vector3(18, 30, 12).normalize();
/** The shadow bias in metres: what -0.0005 came to over the 89 m depth of the old fixed shadow camera. */
const SHADOW_BIAS_M = 0.045;

/** Where the level is: its bounds if it has them (a map), else the box around everything drawn (a lab). */
function levelBox(level: BuiltLevel): THREE.Box3 {
  const b = level.def.bounds;
  if (b) return new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max));
  const box = new THREE.Box3();
  const unit = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  const m = new THREE.Matrix4();
  for (const r of level.renderables) {
    if (!r.visible) continue;
    m.compose(new THREE.Vector3(...r.center), new THREE.Quaternion(...r.quat), new THREE.Vector3(...r.size));
    box.union(unit.clone().applyMatrix4(m));
  }
  return box.isEmpty() ? box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1)) : box;
}

/**
 * The sun's shadow camera, just around `box` as the sun sees it, so the whole level casts and receives
 * shadows and no texel is spent outside it (DESIGN amendment 8). A level over 80 m across gets a 4096 map,
 * which keeps its shadows about as sharp as a lab's.
 */
function fitSun(sun: THREE.DirectionalLight, box: THREE.Box3) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  sun.target.position.copy(center);
  sun.position.copy(center).addScaledVector(SUN, size.length() / 2 + 10);
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  // The camera as the shadow pass places it (LightShadow.updateMatrices), to measure the box from it.
  const cam = sun.shadow.camera;
  cam.position.copy(sun.position);
  cam.lookAt(center);
  cam.updateMatrixWorld();
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
  const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < 8; i++) {
    const corner = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    corner.applyMatrix4(cam.matrixWorldInverse);
    lo.min(corner);
    hi.max(corner);
  }
  const margin = 0.5;
  cam.left = lo.x - margin;
  cam.right = hi.x + margin;
  cam.bottom = lo.y - margin;
  cam.top = hi.y + margin;
  cam.near = Math.max(0.1, -hi.z - margin); // the camera looks down -z
  cam.far = -lo.z + margin;
  cam.updateProjectionMatrix();
  const map = Math.max(size.x, size.z) > 80 ? 4096 : 2048;
  sun.shadow.mapSize.set(map, map);
  // The bias is a fraction of the camera's depth range: keep it the same distance whatever the level's size.
  sun.shadow.bias = -SHADOW_BIAS_M / (cam.far - cam.near);
}

/** A floor's grid lines (sRGB): every metre, and stronger every 5 m, a little lighter than HARD_FLOOR. */
const GRID_MINOR = 0x575d66;
const GRID_MAJOR = 0x666d78;

/**
 * A grid on the material's upward faces, a line every metre and a stronger one every 5 m, placed by the
 * world position (instanced or not), so every big floor is also a ruler (DESIGN amendment 16). A texture
 * would stretch with each box's scale. Lines stay about a pixel wide and fade out before they crowd together
 * in the distance.
 */
function worldGrid(mat: THREE.Material) {
  const rgb = (hex: number) => {
    const c = new THREE.Color(hex); // in the shader's linear working space
    return `vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} )`;
  };
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vGridPos;\nvarying float vGridUp;").replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vec4 gridPos = vec4( transformed, 1.0 );
      vec3 gridNormal = objectNormal;
      #ifdef USE_INSTANCING
        gridPos = instanceMatrix * gridPos;
        gridNormal = mat3( instanceMatrix ) * gridNormal; // a box face's normal keeps its direction when scaled
      #endif
      vGridPos = ( modelMatrix * gridPos ).xyz;
      vGridUp = normalize( mat3( modelMatrix ) * gridNormal ).y;`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vGridPos;
        varying float vGridUp;
        // How much of the pixel lies on a line every spacing metres, px pixels wide; faded out where a cell
        // gets under about 5 pixels (they would shimmer).
        float gridLine( vec2 p, float spacing, float px ) {
          vec2 c = p / spacing;
          vec2 w = max( fwidth( c ), vec2( 1e-6 ) );
          vec2 d = abs( fract( c - 0.5 ) - 0.5 ) / w;
          vec2 on = clamp( 0.5 * px + 0.5 - d, 0.0, 1.0 ) * ( 1.0 - smoothstep( 0.1, 0.3, w ) );
          return max( on.x, on.y );
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float gridUp = step( 0.9, vGridUp );
        diffuseColor.rgb = mix( diffuseColor.rgb, ${rgb(GRID_MINOR)}, gridUp * gridLine( vGridPos.xz, 1.0, 1.0 ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, ${rgb(GRID_MAJOR)}, gridUp * gridLine( vGridPos.xz, 5.0, 1.5 ) );`,
      );
  };
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

/** How a label looks: its height in the world (metres), its font, and its text and backing colours. */
export interface LabelStyle {
  heightM: number;
  font: string;
  color: string;
  back: string;
}

/** The level's own labels (a soft wall's id and sections, a lab's signs) and players' name tags. */
export const TAG: LabelStyle = { heightM: 0.34, font: "600 30px system-ui, sans-serif", color: "#f3f4f6", back: "rgba(10,12,16,0.72)" };
/** A room's callout: bigger, and warm, so it stands apart from the level's own labels. */
const CALLOUT: LabelStyle = { heightM: 0.46, font: "700 30px system-ui, sans-serif", color: "#ffd48a", back: "rgba(10,12,16,0.8)" };

function labelSprite(text: string, x: number, y: number, z: number, style: LabelStyle = TAG): THREE.Sprite {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  g.font = style.font;
  const w = Math.ceil(g.measureText(text).width) + 28;
  c.width = w;
  c.height = 48;
  g.font = style.font;
  g.fillStyle = style.back;
  g.beginPath();
  g.roundRect(0, 0, w, 48, 10);
  g.fill();
  g.fillStyle = style.color;
  g.textBaseline = "middle";
  g.fillText(text, 14, 25);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.name = text;
  sprite.scale.set((w / 48) * style.heightM, style.heightM, 1);
  sprite.position.set(x, y, z);
  return sprite;
}

/**
 * A pawn drawn as capsules around its hitboxes (placeholder body until the art pass), plus a wireframe.
 * Nothing of it casts a shadow: the shadow map is only redrawn when the level changes (createRenderer), so a
 * moving body's shadow would stay behind where the map was last drawn.
 */
export class PawnView {
  readonly body = new THREE.Group();
  readonly wire = new THREE.Group();
  /** The body's capsules (the body group also holds the name tag and the gun). */
  private readonly shape = new THREE.Group();
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
      this.bodyParts.push(new CapsuleParts(this.shape, i === 0 ? headMat : mat, true));
      this.wireParts.push(new CapsuleParts(this.wire, wireMat, false));
    }
    this.body.add(this.shape);
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
   * First person: our own body isn't drawn (and casts no shadow, see the class), and its gun is the
   * viewmodel instead. The body itself stays visible, so its laser still leaves from its gun.
   */
  setFirstPerson(on: boolean) {
    this.shape.visible = !on;
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
