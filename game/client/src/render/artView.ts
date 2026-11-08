// The art pass on a page (Phase 10, render/DESIGN.md §5): loads the texture sets for the graphics preset, builds the
// level's art materials (levelArt.ts), compiles them before they show, and swaps them in for the greybox's — the static
// boxes (each instanced mesh gets its own copy of the unit box with every box's style as an instance attribute) and
// the panels (PanelView's override) — or back (the P palette on a map). The greybox stays until the textures arrive.
import * as THREE from "three";
import { loadArtData, type BuiltLevel } from "@redmond/shared";
import type { LabScene } from "./labScene.js";
import { LevelArt } from "./levelArt.js";
import type { PanelView } from "./panelView.js";
import { loadTextureSets, type TextureSets } from "./textures.js";

export class ArtView {
  private art: LevelArt | null = null;
  private sets: TextureSets | null = null;
  private shownNow = false;
  /** Each static mesh's greybox material, to put back. */
  private readonly grey = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

  constructor(
    private readonly lab: LabScene,
    private readonly panels: PanelView,
    private readonly level: BuiltLevel,
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

  /**
   * Load the sets at `size` pixels, build the materials and compile their shaders against `scene`'s lights (a
   * shader's first draw would otherwise stall the page). False if there's nothing to load (size 0: the greybox).
   */
  async load(size: number, renderer: THREE.WebGLRenderer, camera: THREE.Camera): Promise<boolean> {
    if (!size || this.art) return !!this.art;
    const sets = await loadTextureSets(size);
    const art = new LevelArt(this.level, sets, loadArtData());
    for (const part of this.lab.staticParts) {
      this.grey.set(part.mesh, part.mesh.material);
      const inst = part.mesh as THREE.InstancedMesh;
      if (!inst.isInstancedMesh) continue;
      const geo = part.mesh.geometry.clone();
      geo.setAttribute("aArt", new THREE.InstancedBufferAttribute(Float32Array.from(part.boxes, (r) => art.styleOf(r)), 1));
      part.mesh.geometry = geo;
    }
    // One of each kind of mesh the materials go on, compiled with the level's lights and fog.
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
    await renderer.compileAsync(probes, camera, this.lab.scene);
    box.dispose();
    flat.dispose();
    one.geometry.dispose();
    this.art = art;
    this.sets = sets;
    return true;
  }

  /** Draw the art (true) or the greybox (false). Nothing changes before the art is ready. */
  show(on: boolean): void {
    const art = this.art;
    if (!art || on === this.shownNow) return;
    this.shownNow = on;
    for (const [mesh, grey] of this.grey) mesh.material = on ? art.staticMaterial() : grey;
    this.panels.setMaterialOverride(on ? (key) => art.panelMaterial(key) : null);
  }

  dispose(): void {
    this.show(false);
    this.art?.dispose();
    for (const t of this.sets ? [this.sets.color, this.sets.normal, this.sets.orm] : []) t.dispose();
  }
}
