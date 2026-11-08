// The art pass on a page (Phase 10, render/DESIGN.md §5, §6): loads the texture sets and the sky for the graphics
// preset, builds the level's art materials (levelArt.ts), compiles them before they show, and swaps them in for the
// greybox's — the static boxes (each instanced mesh gets its own copy of the unit box with every box's style as an
// instance attribute) and the panels (PanelView's override) — or back (the P palette on a map). The sky's dome, haze
// and sun come with the textures; on Medium and High the probes (probes/probeField.ts) are baked in workers and, once
// their first pass is in, light the level in place of each storey's hemisphere light, with the sky as the environment.
// The greybox stays until the textures arrive.
import * as THREE from "three";
import { loadArtData, type BuiltLevel } from "@redmond/shared";
import { Architecture } from "./architecture.js";
import { buildBackdrop } from "./backdrop.js";
import { buildDressing } from "./dressing.js";
import { buildFurniture } from "./furniture.js";
import { aimSun, DAYLIGHT, storeyOf, type LabScene } from "./labScene.js";
import { LevelArt } from "./levelArt.js";
import { buildOutside } from "./outside.js";
import type { PanelView } from "./panelView.js";
import { openSkySH, ProbeField } from "./probes/probeField.js";
import { roomLamps, staticBoxes } from "./probes/scene.js";
import type { QualityPreset } from "./quality.js";
import { loadSky, SkyView } from "./sky.js";
import type { StoreyView } from "./storeyView.js";
import { loadTextureSets, type TextureSets } from "./textures.js";

/** The sun a little brighter than the HDRI's hazy one: shadows that read in a fight (render/DESIGN.md §6.1). */
export const SUN_GAIN = 1.6;
/** Rays per probe in the bake. */
const RAYS = 64;
/** The eye's adaptation: exposure = (light / daylight) ^ -EXPOSURE_POWER, at most EXPOSURE_MAX. */
const EXPOSURE_POWER = 0.6;
const EXPOSURE_MAX = 3.2;

export class ArtView {
  private art: LevelArt | null = null;
  private sets: TextureSets | null = null;
  private sky: SkyView | null = null;
  /** The probe field (Medium, High), once the art is loading. */
  probes: ProbeField | null = null;
  private shownNow = false;
  /** Frames, glazing bars, hatch borders and lamp fixtures (architecture.ts). */
  private architecture: Architecture | null = null;
  /** The outside's items as models (outside.ts), and the boxes they stand for: hidden while the art shows. */
  private outside: THREE.Mesh | null = null;
  /** The cover props as furniture (furniture.ts), one mesh per storey; their boxes hidden too. */
  private furniture: THREE.Mesh[] = [];
  private readonly hidden: { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4 }[] = [];
  /** Past the play area: the ground on, the woods, the hills (backdrop.ts). */
  private backdrop: THREE.Mesh[] = [];
  private renderer: THREE.WebGLRenderer | null = null;
  /** Triangles in the models (the stats overlay). */
  modelTriangles = 0;
  /** Each static mesh's greybox material, to put back. */
  private readonly grey = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  /** The open sky's irradiance on a face up (the sun and the sky): what "daylight" means for lightAt. */
  private daylight = 1;

  constructor(
    private readonly lab: LabScene,
    private readonly panels: PanelView,
    private readonly level: BuiltLevel,
    private readonly storeyView: StoreyView | null,
  ) {}

  /** The textures are in and the materials compiled. */
  get ready(): boolean {
    return this.art !== null;
  }

  /** Whether the art is what's drawn now. */
  get shown(): boolean {
    return this.shownNow;
  }

  /** The texture arrays' size and GPU memory (the stats overlay), or null before they're in. */
  get textures(): { size: number; sets: number; gpuBytes: number } | null {
    return this.sets && { size: this.sets.size, sets: this.sets.layer.size, gpuBytes: this.sets.gpuBytes };
  }

  /** The probes' state for the stats overlay and tests: none, baking, or the passes done and how long they took. */
  get probeState(): { passes: number; ready: boolean; firstMs: number; allMs: number } | null {
    const p = this.probes;
    return p && { passes: p.passes, ready: p.ready, firstMs: Math.round(p.timing.first), allMs: Math.round(p.timing.all) };
  }

  /**
   * Load the preset's textures and the sky, build the materials (and the probe field, Medium and High) and compile
   * their shaders against the scene's lights (a shader's first draw would otherwise stall the page). False if there's
   * nothing to load (the greybox).
   */
  async load(preset: QualityPreset, renderer: THREE.WebGLRenderer, camera: THREE.Camera): Promise<boolean> {
    if (!preset.textures || this.art) return !!this.art;
    const [sets, skyData] = await Promise.all([loadTextureSets(preset.textures), loadSky()]);
    const art = new LevelArt(this.level, sets, loadArtData());
    const lab = this.lab;
    const lamps = roomLamps(this.level, (id) => art.lampOf(id));
    if (skyData) {
      const sky = new SkyView(skyData, renderer, preset.probes);
      this.sky = sky;
      lab.scene.add(sky.dome);
      if (lab.scene.fog instanceof THREE.Fog) {
        lab.scene.fog.color.copy(sky.horizon);
        lab.scene.fog.near = 90;
        lab.scene.fog.far = 280;
      }
      aimSun(lab, sky.sunDir, preset.shadowMap);
      renderer.shadowMap.needsUpdate = true;
      lab.sun.color.copy(sky.sunColor);
      if (sky.env) {
        lab.scene.environment = sky.env;
        lab.scene.environmentIntensity = 0;
      }
      this.daylight = sky.daylight(SUN_GAIN);
      if (preset.probes) {
        const info = skyData.info;
        const sun = { dir: [...info.sun.dir] as [number, number, number], irradiance: info.sun.irradiance.map((v) => v * SUN_GAIN) as [number, number, number] };
        const env = { w: info.env.width, h: info.env.height, data: skyData.env, scale: 1 };
        this.probes = new ProbeField(this.level, (boxes, grids) => art.bakeScene(boxes, grids, env, sun, lamps, RAYS), staticBoxes(this.level, (r) => art.styleOf(r)));
        const up = sun.irradiance.map((v) => v * Math.max(0, sun.dir[1]));
        this.probes.uniforms.uSkySH.value = openSkySH(skyData.env, info.env.width, info.env.height, up, 0.3);
        art.attachProbes(this.probes.uniforms);
      }
    }
    for (const part of this.lab.staticParts) {
      this.grey.set(part.mesh, part.mesh.material);
      const inst = part.mesh as THREE.InstancedMesh;
      if (!inst.isInstancedMesh) continue;
      const geo = part.mesh.geometry.clone();
      geo.setAttribute("aArt", new THREE.InstancedBufferAttribute(Float32Array.from(part.boxes, (r) => art.styleOf(r)), 1));
      part.mesh.geometry = geo;
    }
    // One of each kind of mesh the materials go on, compiled with the level's lights, fog and environment.
    const probes = new THREE.Scene();
    const box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    const flat = new THREE.BufferGeometry();
    flat.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), 3));
    const one = new THREE.InstancedMesh(box.clone(), art.staticMaterial(), 1);
    one.geometry.setAttribute("aArt", new THREE.InstancedBufferAttribute(new Float32Array([0]), 1));
    probes.add(one, new THREE.Mesh(box, art.staticMaterial()));
    for (const key of ["skin:SOFT_WALL", "skin:BARRICADE", "core:wood", "core:metal", "steel"]) {
      const m = art.panelMaterial(key);
      if (m) probes.add(new THREE.Mesh(flat, m));
    }
    for (const o of probes.children) {
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false;
    }
    if (this.sky) probes.add(new THREE.Mesh(this.sky.dome.geometry, this.sky.dome.material));
    const glass = art.panelMaterial("glass");
    if (glass) probes.add(new THREE.Mesh(flat, glass));
    await renderer.compileAsync(probes, camera, lab.scene);
    box.dispose();
    flat.dispose();
    one.geometry.dispose();
    this.art = art;
    this.sets = sets;
    this.architecture = new Architecture(lab, this.level, art, lamps);
    this.architecture.setVisible(false);
    const outside = buildOutside(this.level, art);
    this.outside = new THREE.Mesh(outside.kit.geometry(), art.staticMaterial());
    this.outside.name = "outside";
    this.outside.castShadow = this.outside.receiveShadow = true;
    this.outside.visible = false;
    lab.storeys[storeyOf(this.level.def.storeys, 0)].add(this.outside);
    this.modelTriangles = outside.kit.triangles;
    const furniture = buildFurniture(this.level, art, (r) => storeyOf(this.level.def.storeys, r.center[1] - r.size[1] / 2), preset.dressing === "all");
    for (const [storey, kit] of furniture.kits) {
      const mesh = new THREE.Mesh(kit.geometry(), art.staticMaterial());
      mesh.name = `furniture ${this.level.def.storeys[storey]?.id ?? storey}`;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.visible = false;
      lab.storeys[storey].add(mesh);
      this.furniture.push(mesh);
      this.modelTriangles += kit.triangles;
    }
    // The dressing (dressing.ts): walls and rugs on Medium, the low clutter too on High; drawn with the furniture.
    const dressing = preset.dressing !== "none" && art.map ? buildDressing(this.level, art, art.map, preset.dressing === "all") : null;
    for (const [storey, kit] of dressing?.kits ?? []) {
      const mesh = new THREE.Mesh(kit.geometry(), art.staticMaterial());
      mesh.name = `dressing ${this.level.def.storeys[storey]?.id ?? storey}`;
      mesh.receiveShadow = true;
      mesh.visible = false;
      lab.storeys[storey].add(mesh);
      this.furniture.push(mesh);
      this.modelTriangles += kit.triangles;
    }
    // The street runs on past the bounds east and west: no woods on it.
    const backdrop = buildBackdrop(this.level, art, (_x, z) => z > 56.5 && z < 68.5);
    if (backdrop) {
      this.backdrop = backdrop.meshes;
      for (const m of backdrop.meshes) {
        m.visible = false;
        lab.scene.add(m);
      }
      this.modelTriangles += backdrop.triangles;
    }
    for (const part of lab.staticParts) {
      const inst = part.mesh as THREE.InstancedMesh;
      if (!inst.isInstancedMesh) continue;
      part.boxes.forEach((r, index) => {
        if (!outside.ids.has(r.id) && !furniture.ids.has(r.id)) return;
        const matrix = new THREE.Matrix4();
        inst.getMatrixAt(index, matrix);
        this.hidden.push({ mesh: inst, index, matrix });
      });
    }
    this.renderer = renderer;
    renderer.shadowMap.needsUpdate = true;
    // The probes bake in the background; their first pass switches the light over.
    if (this.probes) void this.probes.bake(2, () => this.applyLight());
    return true;
  }

  /** Draw the art (true) or the greybox (false). Nothing changes before the art is ready. */
  show(on: boolean): void {
    const art = this.art;
    if (!art || on === this.shownNow) return;
    this.shownNow = on;
    for (const [mesh, grey] of this.grey) mesh.material = on ? art.staticMaterial() : grey;
    this.panels.setMaterialOverride(on ? (key) => art.panelMaterial(key) : null);
    this.architecture?.setVisible(on);
    if (this.outside) this.outside.visible = on;
    for (const m of this.furniture) m.visible = on;
    for (const m of this.backdrop) m.visible = on;
    // The boxes the models stand for: out of sight (scaled to nothing) while they show, back after.
    const none = new THREE.Matrix4().makeScale(0, 0, 0);
    const touched = new Set<THREE.InstancedMesh>();
    for (const h of this.hidden) {
      h.mesh.setMatrixAt(h.index, on ? none : h.matrix);
      touched.add(h.mesh);
    }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
    if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
    this.applyLight();
  }

  /** The probes light the level while the art shows and they're in; else each storey's own light (the greybox's). */
  private applyLight(): void {
    const probe = this.shownNow && !!this.probes?.ready;
    const lab = this.lab;
    lab.scene.environmentIntensity = probe ? 1 : 0;
    if (this.probes) this.probes.uniforms.uProbeOn.value = probe ? 1 : 0;
    const sun = this.sky ? this.sky.sunIntensity * SUN_GAIN : DAYLIGHT.sun;
    if (this.storeyView) this.storeyView.setArtLight(probe ? sun : null);
    else {
      lab.hemi.intensity = probe ? 0 : DAYLIGHT.hemi;
      lab.sun.intensity = probe ? sun : DAYLIGHT.sun;
    }
  }

  private frames = 0;

  /**
   * Each frame, before the world is drawn: the sky round the camera, and every few frames, any new body, gadget or
   * effect's material lit by the probes as the level is (levelArt.ts litPatch).
   */
  frame(camera: THREE.Camera): void {
    this.sky?.follow(camera);
    if (this.probes && this.art && this.frames++ % 15 === 0) {
      const art = this.art;
      this.lab.scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material;
        if (!mat) return;
        if (Array.isArray(mat)) for (const m of mat) art.litPatch(m);
        else art.litPatch(mat);
      });
    }
  }

  /** Panels whose drawing changed (PanelView.lastChanged): the probes bake again round them. */
  panelsChanged(indices: readonly number[]): void {
    if (indices.length) this.probes?.panelsChanged(indices);
  }

  /**
   * How bright it is at a point against the open daylight, from the probes (null before they're in): their light, and
   * the sun's where they see the open sky (it lights the yard directly, not through them). The gun in hand's light,
   * and the exposure's.
   */
  lightAt(x: number, y: number, z: number): number | null {
    if (!this.shownNow || !this.probes?.ready || !this.art || !this.sky) return null;
    // Round the point (a lamp overhead or a window beside it shouldn't set the whole room's look).
    const l = { irradiance: 0, sky: 0 };
    let n = 0;
    for (const [dx, dz] of [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
      const at = this.probes.lightAt(x + dx, y, z + dz, this.art.classAt(x, y, z));
      if (!at) continue;
      l.irradiance += at.irradiance;
      l.sky += at.sky;
      n++;
    }
    // No probe this high: the open sky.
    if (!n) return 1;
    l.irradiance /= n;
    l.sky /= n;
    // The sun counts where the probes see open sky (the yard sees nearly half the sphere); a room seeing a little
    // sky through its windows isn't sunlit for that.
    const open = Math.min(1, Math.max(0, (l.sky - 0.2) / 0.2));
    const sun = this.sky.sunLuminance * SUN_GAIN * Math.max(0, this.sky.sunDir.y) * open;
    return (l.irradiance + sun) / this.daylight;
  }

  /**
   * Each frame: the eye adapting to where the camera is, as a game camera does — up to EXPOSURE_MAX times brighter
   * in a dim room, back to 1 in the open, over about half a second (art and probes only; 1 otherwise).
   */
  adapt(renderer: THREE.WebGLRenderer, x: number, y: number, z: number, dt: number): void {
    const k = this.lightAt(x, y, z);
    const target = k === null ? 1 : Math.min(EXPOSURE_MAX, Math.max(1, Math.pow(Math.max(k, 1e-3), -EXPOSURE_POWER)));
    const now = renderer.toneMappingExposure;
    renderer.toneMappingExposure = Math.abs(target - now) < 1e-3 ? target : now + (target - now) * (1 - Math.exp(-dt / 0.5));
  }

  dispose(): void {
    this.show(false);
    this.probes?.dispose();
    this.architecture?.dispose();
    if (this.outside) {
      this.outside.removeFromParent();
      this.outside.geometry.dispose();
    }
    for (const m of [...this.backdrop, ...this.furniture]) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    this.sky?.dispose();
    this.art?.dispose();
    for (const t of this.sets ? [this.sets.color, this.sets.normal, this.sets.orm] : []) t.dispose();
  }
}
