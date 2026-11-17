// Three.js scene for labs and maps: greybox level colored by surface class (PLAN §9.1), its static boxes
// drawn instanced per material and storey (tools/mapgen/DESIGN.md E4), labels and a map's room callouts by
// storey (E9), pawn bodies built from hitbox capsules, and an F3 hitbox visualizer.
import * as THREE from "three";
import type { QualityPreset } from "./quality.js";
import { ShieldModel } from "./shieldModel.js";
import {
  Btn,
  droneHitboxes,
  handSlot,
  ReloadKind,
  TICK_HZ,
  WeaponAct,
  WFlag,
  isDowned,
  PawnKind,
  PawnMode,
  poseHitboxes,
  shieldHold,
  shieldPlace,
  type BuiltLevel,
  type GameData,
  type Hitbox,
  type PanelSpec,
  type PawnState,
  type Renderable,
  type ResolvedWeapon,
  type ShieldPlate,
} from "@redmond/shared";
import { BodyModel, operatorLook } from "./bodyModel.js";
import { Gait, pistolHeld, poseBody, type HeldItem } from "./bodyPose.js";
import { Ragdoll } from "./bodyRagdoll.js";
import { droneShape, heldShape, knifeShape, SHAPE_MATERIALS, shapeModel, type ShapeMat, type ShapeModel } from "./gadgetShapes.js";
import { buildGun, gunKey, type GunLook, type GunModel } from "./gunKit.js";

/**
 * The render layer of the level's opaque surfaces (the art's static boxes, architecture, furniture, the outside,
 * panels other than glass): drawn into the depth buffer alone before each frame on Medium and High (the depth
 * pre-pass, render/DESIGN.md §13, lab.ts drawWorld), so the level's heavy shader then runs once a pixel. Everything
 * else (glass, bodies, effects, labels, the sky) stays off it.
 */
export const PREPASS_LAYER = 2;

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

/** A renderer for the graphics preset (quality.ts): its antialiasing, pixel ratio and sun shadows. */
export function createRenderer(container: HTMLElement, preset: QualityPreset): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: preset.antialias, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, preset.maxPixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = preset.shadowMap > 0;
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
  /** Each static mesh with the boxes it draws, in instance order (the art pass styles them per box: artView.ts). */
  staticParts: { mesh: THREE.Mesh; boxes: readonly Renderable[] }[];
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
export function createLabScene(level: BuiltLevel, shadowMap = 4096): LabScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb4c7);
  scene.fog = new THREE.Fog(0x9fb4c7, 60, 140);

  const hemi = new THREE.HemisphereLight(DAYLIGHT.sky, DAYLIGHT.ground, DAYLIGHT.hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, DAYLIGHT.sun);
  sun.castShadow = true;
  const box = levelBox(level);
  fitSun(sun, box, shadowMap);
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
  // A flight's steps and a ladder's rails and rungs go with the storey they start from (an open step's bottom is
  // a riser or two under its tread, near the top that's the storey above).
  const startY = new Map<string, number>([...level.def.stairs.map((f) => [f.id, f.start[1]] as const), ...level.def.ladders.map((l) => [l.id, l.base[1]] as const)]);
  /** The height a box goes with a storey by: a flight's or ladder's start, a floor's top, else its bottom. */
  const heightOf = (r: Renderable) => {
    const of = r.kind === "stair_step" ? r.id.replace(/_step\d+$/, "") : r.kind === "ladder_rail" || r.kind === "ladder_rung" ? r.id.replace(/_(rail|rung)[^_]*$/, "") : null;
    const floor = r.kind === "solid" || r.kind === "panel" ? floorTopHeight(r.surface, r.center, r.size) : null;
    return (of !== null ? startY.get(of) : undefined) ?? floor ?? r.center[1] - r.size[1] / 2;
  };
  const labels: THREE.Sprite[] = [];
  const label = (text: string, r: Renderable) => {
    const sprite = labelSprite(text, r.center[0], r.center[1] + r.size[1] / 2 + 0.4, r.center[2]);
    labels.push(sprite);
    labelGroups[storeyOf(level.def.storeys, heightOf(r))].add(sprite);
  };
  /** The boxes each instanced mesh draws, by storey and material. */
  const batches = new Map<string, { storey: number; surface: string; material: THREE.Material; boxes: Renderable[] }>();
  let staticMeshes = 0;
  const staticParts: LabScene["staticParts"] = [];
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
    const storey = storeyOf(level.def.storeys, heightOf(r));
    if (r.id === "floor") {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(r.size[0], r.size[1], r.size[2]), material(r));
      mesh.position.set(r.center[0], r.center[1], r.center[2]);
      mesh.quaternion.set(r.quat[0], r.quat[1], r.quat[2], r.quat[3]);
      (mesh.material as THREE.MeshStandardMaterial).map!.repeat.set(r.size[0] / 2, r.size[2] / 2);
      mesh.receiveShadow = true; // nothing is under it to cast onto
      mesh.layers.enable(PREPASS_LAYER);
      storeys[storey].add(mesh);
      staticMeshes++;
      staticParts.push({ mesh, boxes: [r] });
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
    mesh.layers.enable(PREPASS_LAYER);
    storeys[b.storey].add(mesh);
    staticBoxes += b.boxes.length;
    staticMeshes++;
    staticParts.push({ mesh, boxes: b.boxes });
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
  return { scene, storeys, labelGroups, calloutGroups, labels, callouts, materials, hemi, sun, box, staticBoxes, staticMeshes, staticParts };
}

/** A wall that takes reinforcement shows its sections: seams on its faces (PanelView) and a count in its label. */
export function showsSections(spec: PanelSpec): boolean {
  return spec.construction.kind === "wall" && spec.construction.reinforceable;
}

/** How far under a storey's floor a box's bottom (its own 0.2 m slab) or a body's feet (a top step) still count as on it. */
export const STOREY_SLACK_M = 0.25;

/**
 * A floor (a slab, soft-floor tile or hatch: flat, of a floor surface) goes with the storey whose floor its top
 * is, by the height this gives: a room's floor can hang lower than its storey's slab (Oregon's
 * layout.floorShifts), and its bottom would put it with the storey below. A raised floor's slab is thick (solid
 * down to the storey's slab), so its bottom puts it with its storey.
 */
export function floorTopHeight(surface: string, center: readonly number[], size: readonly number[]): number | null {
  return (surface === "HARD_FLOOR" || surface === "SOFT_FLOOR" || surface === "HATCH") && size[1] <= 0.3 ? center[1] + size[1] / 2 - 0.01 : null;
}

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
 * which keeps its shadows about as sharp as a lab's; `most` caps it (the graphics preset's).
 */
function fitSun(sun: THREE.DirectionalLight, box: THREE.Box3, most: number, dir: THREE.Vector3 = SUN) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  sun.target.position.copy(center);
  sun.position.copy(center).addScaledVector(dir, size.length() / 2 + 10);
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
  const map = Math.min(most || 2048, Math.max(size.x, size.z) > 80 ? 4096 : 2048);
  sun.shadow.mapSize.set(map, map);
  // The bias is a fraction of the camera's depth range: keep it the same distance whatever the level's size.
  sun.shadow.bias = -SHADOW_BIAS_M / (cam.far - cam.near);
}

/**
 * Turn the sun toward unit direction `dir` (the art pass's sky: sky.ts), its shadow camera fitted round the level
 * again (a map of up to `most` texels). The page then asks for a new shadow map.
 */
export function aimSun(lab: LabScene, dir: THREE.Vector3, most: number): void {
  fitSun(lab.sun, lab.box, most, dir);
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

/** A label facing the camera at (x, y, z), sized in the world by its style. */
export function labelSprite(text: string, x: number, y: number, z: number, style: LabelStyle = TAG): THREE.Sprite {
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
 * A pawn: an operator's body (Phase 10 M8, render/DESIGN.md §11: bodyModel.ts on the skeleton bodyRig.ts solves from
 * its hitboxes, posed by bodyPose.ts; a dead one falls, bodyRagdoll.ts) with what it holds, or a drone; plus the
 * hitboxes' wireframe (F3). Nothing of it casts a shadow: the shadow map is only redrawn when the level changes
 * (createRenderer), so a moving body's shadow would stay behind where the map was last drawn.
 */
export class PawnView {
  readonly body = new THREE.Group();
  readonly wire = new THREE.Group();
  /** The body itself (the body group also holds the name tag, the gun and what else it holds). */
  private readonly shape = new THREE.Group();
  private readonly model: BodyModel | null = null;
  private readonly gait = new Gait();
  private ragdoll: Ragdoll | null = null;
  /** Its speed as it was last alive (a dead body falls on with it), and when it was last drawn (seconds). */
  private readonly lastVel = new THREE.Vector3();
  private lastAt = -1;
  /** When it was last drawn alive (seconds): a ragdoll starts from that pose only if it was just now. */
  private aliveAt = -1;
  /** Its ragdoll at rest and drawn so (nothing more to do for it). */
  private restDrawn = false;
  /** Whether its held gadget was placed this frame (the pose says where; on a ladder or at work it isn't). */
  private heldPlaced = false;
  /**
   * Another player's body (drawn from snapshots, which carry neither its speed nor how far along its acts are): those
   * are worked out here from how it moves and when each act began. Set by its page.
   */
  remote = false;
  private readonly est = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, aim: 0, at: -1, reloadFrom: -1, meleeFrom: -1 };
  /** Posed at least once (a body first seen dead falls from where its hitboxes lie). */
  private posed = false;
  private readonly wireParts: CapsuleParts[] = [];
  private readonly tag: THREE.Sprite | null;
  private readonly materials: THREE.Material[];
  /** The body's own colours, which glow white in a Bulletproof Camera's thermal view (heat). */
  private readonly skin: THREE.MeshStandardMaterial[];
  private hot = false;
  private gun: GunModel | null = null;
  /** The weapon the gun is (its reload's timings), and whether it's held like a pistol. */
  private weapon: ResolvedWeapon | null = null;
  private pistol = false;
  /** A gadget in its hands (Phase 8): its shaped model, drawn instead of the gun. */
  private held: THREE.Object3D | null = null;
  private heldModel: ShapeModel | null = null;
  private heldItem: HeldItem | null = null;
  /** The knife, drawn while it stabs. */
  private knife: ShapeModel | null = null;
  /** Fuze's Ballistic Shield (Phase 8 M11): its curved plate and window where its state says (your own too). */
  private shield: ShieldModel | null = null;
  private plate: ShieldPlate | null = null;
  private heldKey = "";
  private gunLook = "";
  private gunVisible = false;
  /** The rope a body on one hangs from (Phase 5 M8): from over its body up to the rope's top. */
  private readonly rope: THREE.Line;
  /** A drone (Phase 7): its model in place of the capsules; its wheels, turned by how far it has rolled. */
  private readonly drone: THREE.Group | null = null;
  private readonly droneWheels: THREE.Object3D[] = [];
  private droneR = 0.06;
  private droneLast: { x: number; z: number } | null = null;
  private firstPerson = false;

  /**
   * `name` puts a name tag over the head (other players online); `wireColor` colours the hitbox view; `color` a
   * drone's stripe; `operatorId` dresses a body (data/presentation/operator_looks.json), null for none at all: only
   * its hitboxes' wireframe (where the server judged a hit body to be).
   */
  constructor(
    private readonly scene: THREE.Scene,
    color: number,
    name?: string,
    wireColor = 0xff3b3b,
    kind = PawnKind.Body,
    droneSize: readonly [number, number, number] = [0.22, 0.12, 0.18],
    operatorId?: string | null,
  ) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const wireMat = new THREE.MeshBasicMaterial({ color: wireColor, wireframe: true, depthTest: false, transparent: true, opacity: 0.75 });
    this.materials = [mat, wireMat];
    this.skin = [mat];
    for (let i = 0; i < 8; i++) this.wireParts.push(new CapsuleParts(this.wire, wireMat, false));
    if (kind === PawnKind.Body && operatorId !== null) {
      this.model = new BodyModel(operatorLook(operatorId));
      this.shape.add(this.model.group);
      this.skin.push(this.model.material);
    }
    this.body.add(this.shape);
    const ropeMat = new THREE.LineBasicMaterial({ color: 0xd8c08a });
    this.materials.push(ropeMat);
    this.rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), ropeMat);
    this.rope.frustumCulled = false;
    this.rope.visible = false;
    this.body.add(this.rope);
    this.tag = name ? labelSprite(name, 0, 0, 0) : null;
    if (this.tag) {
      this.tag.scale.multiplyScalar(kind === PawnKind.Drone ? 0.4 : 0.7);
      this.body.add(this.tag);
    }
    if (kind === PawnKind.Drone) {
      // The drone's model (gadgetShapes.ts, Phase 10 M7): its hull, and two wheels that turn as it drives; its team's
      // colour on the stripe and hubs; all of it glows in a thermal view.
      const [w, h] = droneSize;
      const shape = droneShape(droneSize, w > 0.26);
      const mats = new Map<ShapeMat, THREE.MeshStandardMaterial>();
      const matOf = (m: ShapeMat) => {
        if (m === "team") return mat;
        let x = mats.get(m);
        if (!x) {
          const p = SHAPE_MATERIALS[m];
          x = new THREE.MeshStandardMaterial({ color: p.color, roughness: p.roughness, metalness: p.metalness, emissive: p.emissive ?? 0x000000 });
          mats.set(m, x);
          this.materials.push(x);
          if (!p.emissive) this.skin.push(x);
        }
        return x;
      };
      const drone = new THREE.Group();
      for (const [m, g] of shape.hull) drone.add(new THREE.Mesh(g, matOf(m)));
      const tyre = w * 0.18;
      for (const side of [-1, 1]) {
        const wheel = new THREE.Group();
        for (const [m, g] of shape.wheel) wheel.add(new THREE.Mesh(g, matOf(m)));
        wheel.position.x = side * (w / 2 - tyre / 2);
        drone.add(wheel);
        this.droneWheels.push(wheel);
      }
      this.droneR = h / 2;
      this.shape.visible = false;
      this.body.add(drone);
      this.drone = drone;
    }
    scene.add(this.body, this.wire);
  }

  /** Seen through a Bulletproof Camera's thermal view (Phase 7): the body (or drone) glows white. */
  heat(on: boolean) {
    if (on === this.hot) return;
    this.hot = on;
    for (const m of this.skin) m.emissive.setHex(on ? 0xffffff : 0x000000);
  }

  /**
   * Pose the body for a state and place what it holds; `now` (seconds, any clock that runs on) moves its stride and a
   * dead body's fall; `swapTicks` is its loadout's swap time.
   */
  update(data: GameData, state: PawnState, now = performance.now() / 1000, swapTicks = 30) {
    if (this.drone) return this.updateDrone(data, state);
    // Fuze with his shield up in front: his hands on its grips behind it (D-169).
    const shieldUp = this.plate !== null && shieldPlace(state) === "front";
    const parts = poseHitboxes(data.movement, data.hitboxes, state, shieldUp ? shieldHold(data.movement, this.plate!, state) : undefined);
    parts.forEach((hb, i) => this.wireParts[i].place(hb, 1.02));
    const model = this.model;
    if (!model) return;
    const rig = model.rig;
    const dt = this.lastAt < 0 ? 0 : Math.min(0.1, Math.max(0, now - this.lastAt));
    this.lastAt = now;
    // What it holds shows while it's up: none while down, knocked down (D-156) or dead.
    const dead = state.mode === PawnMode.Dead;
    const armed = !dead && state.mode !== PawnMode.Knocked && !isDowned(state);
    this.armed = armed;
    let gunAt: ReturnType<typeof poseBody>["gun"] = null;
    let knifeAt: ReturnType<typeof poseBody>["knife"] = null;
    this.heldPlaced = false;
    if (dead) {
      // It falls from the pose it died in (bodyRagdoll.ts) onto the floor the state has it on (the lab's corpse) — if it
      // was drawn alive just now, here. Else (first seen dead, after a killcam's replay, a jump) it lies where its
      // hitboxes do, at rest at once.
      if (!this.ragdoll) {
        const fresh = this.posed && now - this.aliveAt < 0.5 && Math.hypot(rig.joints.pelvis.x - state.x, rig.joints.pelvis.z - state.z) < 2.5;
        if (!fresh) {
          rig.frame(parts);
          const up = new THREE.Vector3(0, 1, 0);
          rig.solve({ flatFeet: false, legScale: rig.lyingLegs(), kneeL: up, kneeR: up });
        }
        // Tipped back and a little to a side (which, by where it stood).
        const back = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
        const side = Math.sin(state.x * 12.9898 + state.z * 78.233) * 0.5;
        const push = back.multiplyScalar(0.9).add(new THREE.Vector3(Math.cos(state.yaw) * side, 0, -Math.sin(state.yaw) * side));
        this.ragdoll = fresh ? new Ragdoll(rig.joints, this.lastVel, push, state.y) : new Ragdoll(rig.joints, new THREE.Vector3(), new THREE.Vector3(), state.y);
        if (!fresh) this.ragdoll.settle();
        this.restDrawn = false;
      }
      // The floor under it as the corpse rule finds it now (a hatch blown under it: it falls again).
      this.ragdoll.setFloor(state.y);
      if (!this.ragdoll.asleep || !this.restDrawn) {
        this.ragdoll.step(dt);
        this.ragdoll.write(rig);
        this.restDrawn = this.ragdoll.asleep;
      }
    } else {
      this.ragdoll = null;
      this.aliveAt = now;
      const s = this.remote ? this.estimated(state, now, dt) : state;
      this.lastVel.set(s.vx, s.vy, s.vz).clampLength(0, 7);
      rig.frame(parts);
      const hands = armed && this.held === null;
      const posed = poseBody({
        data,
        s,
        parts,
        rig,
        gun: hands ? this.gun : null,
        pistol: this.pistol,
        reload: this.weapon?.reload ?? null,
        held: armed ? this.heldItem : null,
        shieldUp,
        gait: this.gait,
        now,
        swapTicks,
      });
      rig.solve(posed.pose);
      gunAt = posed.gun;
      knifeAt = posed.knife;
      if (this.held && posed.held) {
        this.held.position.copy(posed.held.position);
        this.held.quaternion.copy(posed.held.quaternion);
        this.heldPlaced = true;
      }
    }
    this.posed = true;
    // What's on its back: there unless it's the item in its hands (Sledge's hammer, Thermite's charge, ...). (Before the
    // bones are copied: the item placed with them on the frame it comes back.)
    const back = model.look.back;
    model.showBack(back === "pack" || back === "radio" || back === "battery" || back === "medbag" || back === "reel" || handSlot(state.hand) !== 2);
    model.sync();
    if (this.tag) this.tag.position.set(rig.joints.head.x, rig.joints.head.y + 0.42, rig.joints.head.z);
    this.gunVisible = this.gun !== null && gunAt !== null;
    if (this.gun) {
      this.gun.group.visible = this.gunVisible && !this.firstPerson;
      if (gunAt) {
        this.gun.group.position.copy(gunAt.position);
        this.gun.group.quaternion.copy(gunAt.quaternion);
        this.gun.mag.visible = gunAt.magIn;
      }
    }
    if (this.held) this.held.visible = armed && !this.firstPerson && this.heldPlaced;
    if (knifeAt && !this.knife) {
      this.knife = shapeModel(knifeShape());
      this.body.add(this.knife.group);
    }
    if (this.knife) {
      this.knife.group.visible = knifeAt !== null && !this.firstPerson;
      if (knifeAt) {
        this.knife.group.position.copy(knifeAt.position);
        this.knife.group.quaternion.copy(knifeAt.quaternion);
      }
    }
    // Fuze's shield (Phase 8 M11): in your own first person too, where you look through its window.
    this.shield?.update(data, state, shieldPlace(state));
  }

  /**
   * Another player's state with what its snapshots don't carry worked out (render/DESIGN.md §11): its velocity from how
   * it moved between frames; how far it aims, eased, from the aiming bit; how far along a reload or a stab is, from
   * when the bit for it came on (a reload timed as a tactical one, its magazine out and in by the weapon's timings).
   */
  private estimated(state: PawnState, now: number, dt: number): PawnState {
    const e = this.est;
    const gap = e.at < 0 ? Infinity : now - e.at;
    const jumped = Math.hypot(state.x - e.x, state.z - e.z) > 3;
    if (gap > 1e-4 && gap < 0.5 && !jumped) {
      const k = 1 - Math.exp(-gap * 12);
      e.vx += ((state.x - e.x) / gap - e.vx) * k;
      e.vy += ((state.y - e.y) / gap - e.vy) * k;
      e.vz += ((state.z - e.z) / gap - e.vz) * k;
    } else if (gap >= 0.5 || jumped) e.vx = e.vy = e.vz = 0;
    e.x = state.x;
    e.y = state.y;
    e.z = state.z;
    e.at = now;
    // (Fuze's shield sends its own aiming: how far down it has slid.)
    const aimTo = state.shieldAt === 1 ? state.adsQ / 65535 : state.prevButtons & Btn.Ads ? 1 : 0;
    e.aim += (aimTo - e.aim) * (1 - Math.exp(-dt * 9));
    if (state.wAct === WeaponAct.Reload) e.reloadFrom = e.reloadFrom < 0 ? now : e.reloadFrom;
    else e.reloadFrom = -1;
    if (state.meleeTicks > 0) e.meleeFrom = e.meleeFrom < 0 ? now : e.meleeFrom;
    else e.meleeFrom = -1;
    const s = { ...state, vx: e.vx, vy: e.vy, vz: e.vz, adsQ: Math.round(e.aim * 65535) };
    if (e.reloadFrom >= 0) {
      s.actTicks = Math.floor((now - e.reloadFrom) * TICK_HZ);
      s.reloadKind = ReloadKind.Tactical;
      const r = this.weapon?.reload;
      s.wflags = r?.kind === "magazine" ? (s.actTicks >= r.magOutTacticalTicks ? WFlag.MagOut : 0) | (s.actTicks >= r.refillTacticalTicks ? WFlag.Refilled : 0) : 0;
    }
    if (e.meleeFrom >= 0) s.meleeTicks = 1 + Math.floor((now - e.meleeFrom) * TICK_HZ);
    return s;
  }

  /** Fuze's Ballistic Shield's plate on this body (its loadout's), or none (Phase 8 M11). */
  setShield(plate: ShieldPlate | null) {
    if (plate === this.plate) return;
    this.plate = plate;
    if (this.shield) {
      this.body.remove(this.shield.mesh);
      this.shield.dispose();
      this.shield = null;
    }
    if (plate) {
      this.shield = new ShieldModel(plate);
      this.body.add(this.shield.mesh);
    }
  }

  /** Alive and not down, as its last update had it (what it holds shows only then). */
  private armed = true;

  /**
   * The gadget in its hands (its id, or "detonator", and its data's size; `up`: held up to the face; `swing`: swung
   * in both hands, Sledge's hammer, with its swing's timing), or none: the gun shows again. Its shaped model
   * (gadgetShapes.ts), no bigger than a hand holds (a swung one its own length).
   */
  setHeld(held: { id: string; size: readonly number[] } | null, up = false, swing: HeldItem["swing"] = null) {
    const key = held ? `${held.id}:${held.size.join(",")}:${up}:${swing !== null}` : "";
    if (key === this.heldKey) return;
    this.heldKey = key;
    this.heldModel?.dispose();
    this.heldModel = null;
    this.held = null;
    this.heldItem = null;
    if (!held) return;
    const shape = heldShape(held.id, [held.size[0], held.size[1], held.size[2]], swing ? 1.2 : 0.3);
    this.heldModel = shapeModel(shape.parts);
    this.heldItem = { size: shape.size, up, swing };
    this.held = this.heldModel.group;
    this.body.add(this.held);
  }

  /** A drone: its box where it is, turned to its yaw; a destroyed one lies tipped over; a held one isn't drawn. */
  private updateDrone(data: GameData, state: PawnState) {
    const d = data.intel.drone;
    const drone = this.drone!;
    drone.visible = state.mode !== PawnMode.Held && !this.firstPerson;
    drone.position.set(state.x, state.y + d.sizeM[1] / 2, state.z);
    drone.rotation.set(0, state.yaw, state.mode === PawnMode.Dead ? 1.2 : 0, "YXZ");
    // The wheels roll with it: by how far it moved along its facing since it was last drawn.
    if (this.droneLast) {
      const along = -(state.x - this.droneLast.x) * Math.sin(state.yaw) - (state.z - this.droneLast.z) * Math.cos(state.yaw);
      if (Math.abs(along) < 1) for (const wh of this.droneWheels) wh.rotation.x -= along / this.droneR;
    }
    this.droneLast = { x: state.x, z: state.z };
    const boxes = droneHitboxes(d, state);
    this.wireParts.forEach((w, i) => (i < boxes.length ? w.place(boxes[i], 1.02) : w.hide()));
    if (this.tag) this.tag.position.set(state.x, state.y + d.sizeM[1] + 0.2, state.z);
  }

  /** Draw a rope from (x, y0, z) up to where it's fixed (a swing angles it out), or none (null). */
  setRope(x: number, y0: number, z: number, anchor: { x: number; z: number; top: number } | null) {
    this.rope.visible = anchor !== null && anchor.top > y0;
    if (!anchor || !this.rope.visible) return;
    const pos = this.rope.geometry.getAttribute("position") as THREE.BufferAttribute;
    pos.setXYZ(0, x, y0, z);
    pos.setXYZ(1, anchor.x, anchor.top, anchor.z);
    pos.needsUpdate = true;
  }

  /** The gun this body holds (from the roster's loadout; `weapon`: its timings, for its reload), or none. */
  setWeapon(look: GunLook | null, weapon: ResolvedWeapon | null = null) {
    this.weapon = weapon;
    this.pistol = look ? pistolHeld(look.class) : false;
    const key = look ? gunKey(look) : "";
    if (key === this.gunLook) return;
    this.gun?.dispose();
    this.gun = look ? buildGun(look) : null;
    this.gunLook = key;
    if (this.gun) this.body.add(this.gun.group);
  }

  /** Where the gun in this body's hands ends, in the world (null without one drawn): where its shots are seen to leave. */
  muzzle(): THREE.Vector3 | null {
    if (!this.gun || !this.gunVisible || !this.body.visible) return null;
    this.gun.group.updateMatrixWorld();
    return this.gun.muzzle.clone().applyMatrix4(this.gun.group.matrixWorld);
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
    this.firstPerson = on;
    if (this.drone) {
      // Looking through it: not drawn (its own camera would see its insides).
      if (on) this.drone.visible = false;
      return;
    }
    this.shape.visible = !on;
    if (this.gun) this.gun.group.visible = this.gunVisible && !on;
    // (Only while armed, as update has it: a body killed holding a gadget doesn't keep it by its head, the review, M12.)
    if (this.held) this.held.visible = !on && this.armed;
    if (this.knife && on) this.knife.group.visible = false;
  }

  /** Remove from the scene and free the GPU resources it owns. */
  dispose() {
    this.gun?.dispose();
    this.setHeld(null);
    this.setShield(null);
    this.model?.dispose();
    this.knife?.dispose();
    this.rope.geometry.dispose();
    this.drone?.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
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

  /** Not drawn (a drone uses one of a body's eight). */
  hide() {
    this.cyl.visible = this.capA.visible = this.capB.visible = false;
  }

  place(hb: Hitbox, grow: number) {
    this.capA.visible = this.capB.visible = true;
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
