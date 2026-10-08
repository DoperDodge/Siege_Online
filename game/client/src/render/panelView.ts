// Destructible panels drawn from their cells (Phase 4 M3): one mesh per layer, built from boxes over the
// layer's cells (greedy rectangles) and rebuilt whenever the panel changes. Skins wear the surface's greybox
// colour (PLAN §9.1), the core is wood or metal, and steel is a dark plate on the side it went up from.
import * as THREE from "three";
import { greedyRects, L_CORE, L_STEEL, layerSlab, STEEL_PLATE_M, type PanelEntry, type PanelSet } from "@redmond/shared";
import { SURFACE_COLORS } from "./labScene.js";

const WOOD = 0x8b6a43;
const METAL = 0x7d848c;
const STEEL = 0x56606b;

export class PanelView {
  private readonly groups: THREE.Group[] = [];
  private readonly drawn: number[] = [];
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();

  constructor(
    scene: THREE.Scene,
    private readonly panels: PanelSet,
  ) {
    for (const e of panels.list) {
      const g = new THREE.Group();
      g.position.set(e.frame.center[0], e.frame.center[1], e.frame.center[2]);
      g.quaternion.set(e.frame.quat[0], e.frame.quat[1], e.frame.quat[2], e.frame.quat[3]);
      scene.add(g);
      this.groups.push(g);
      this.drawn.push(-1);
    }
    // One hidden mesh per material, so warmShaders readies them all before the first reinforcement or window.
    const probes = new THREE.Group();
    for (const key of ["skin:SOFT_WALL", "core:wood", "core:metal", "steel", "glass"]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), this.material(key));
      m.visible = false;
      probes.add(m);
    }
    scene.add(probes);
    this.update();
  }

  /** Redraw every panel that changed since the last call (cheap when nothing did). */
  update(): void {
    for (let i = 0; i < this.panels.list.length; i++) {
      const e = this.panels.list[i];
      if (e.panel.version === this.drawn[i]) continue;
      this.drawn[i] = e.panel.version;
      this.build(e, this.groups[i]);
    }
  }

  private build(e: PanelEntry, g: THREE.Group) {
    for (const child of [...g.children]) {
      (child as THREE.Mesh).geometry.dispose();
      g.remove(child);
    }
    const p = e.panel;
    const c = p.spec.construction;
    const half = e.frame.t / 2;
    p.layers.forEach((cells, layer) => {
      if (!cells) return;
      if (layer === L_STEEL) {
        // Each section's plate on its own side, just proud of the face.
        for (const side of [0, 1]) {
          const mask = new Uint8Array(cells.length);
          for (let v = 0; v < p.h; v++)
            for (let u = 0; u < p.w; u++) {
              const s = p.sectionOf(u);
              if (((p.steelSides >> s) & 1) === side) mask[v * p.w + u] = cells[v * p.w + u];
            }
          const slab: [number, number] = side ? [half - 0.002, half + STEEL_PLATE_M] : [-half - STEEL_PLATE_M, -half + 0.002];
          this.addLayer(e, g, mask, slab, "steel");
        }
        return;
      }
      const key = c.kind === "glass" ? "glass" : layer === L_CORE ? (p.coreMetal ? "core:metal" : "core:wood") : `skin:${c.kind === "barricade" ? "BARRICADE" : e.info.surface}`;
      this.addLayer(e, g, cells, layerSlab(p, e.frame, layer), key);
    });
  }

  /** The layer's cells as boxes in the panel's own axes, spanning `slab` through it. */
  private addLayer(e: PanelEntry, g: THREE.Group, cells: Uint8Array, slab: [number, number], key: string) {
    const p = e.panel;
    const rects = greedyRects(cells, p.w, p.h);
    if (!rects.length) return;
    const { axes, w, h } = e.frame;
    const pos: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    const centre = [0, 0, 0];
    const size = [0, 0, 0];
    for (const r of rects) {
      centre[axes[0]] = ((r.u0 + r.u1) / 2) * p.cellU - w / 2;
      centre[axes[1]] = ((r.v0 + r.v1) / 2) * p.cellV - h / 2;
      centre[axes[2]] = (slab[0] + slab[1]) / 2;
      size[axes[0]] = (r.u1 - r.u0) * p.cellU;
      size[axes[1]] = (r.v1 - r.v0) * p.cellV;
      size[axes[2]] = slab[1] - slab[0];
      appendBox(pos, nor, idx, centre, size);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material(key));
    mesh.castShadow = key !== "glass";
    mesh.receiveShadow = true;
    g.add(mesh);
  }

  private material(key: string): THREE.MeshStandardMaterial {
    let m = this.materials.get(key);
    if (m) return m;
    if (key === "glass") m = new THREE.MeshStandardMaterial({ color: SURFACE_COLORS.WINDOW, roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
    else if (key === "steel") m = new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.45, metalness: 0.7 });
    else if (key === "core:metal") m = new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.5, metalness: 0.6 });
    else if (key === "core:wood") m = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.9 });
    else m = new THREE.MeshStandardMaterial({ color: SURFACE_COLORS[key.slice(5) as keyof typeof SURFACE_COLORS], roughness: 0.85 });
    this.materials.set(key, m);
    return m;
  }
}

/** The six faces of an axis-aligned box (4 vertices each, outward normals). */
const FACES: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function appendBox(pos: number[], nor: number[], idx: number[], c: number[], s: number[]) {
  for (const n of FACES) {
    const k = n.findIndex((x) => x !== 0);
    // Two axes across the face, ordered so the winding faces outward.
    const a = (k + 1) % 3;
    const b = (k + 2) % 3;
    const base = pos.length / 3;
    for (const [da, db] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const v = [0, 0, 0];
      v[k] = c[k] + (n[k] * s[k]) / 2;
      v[a] = c[a] + (da * s[a]) / 2;
      v[b] = c[b] + (db * s[b]) / 2;
      pos.push(v[0], v[1], v[2]);
      nor.push(n[0], n[1], n[2]);
    }
    if (n[k] > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
}
