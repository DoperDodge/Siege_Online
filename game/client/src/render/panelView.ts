// Destructible panels drawn from their cells (Phase 4 M3, M8): one mesh per layer, built from boxes over the
// layer's cells (greedy rectangles). Skins wear the surface's greybox colour (PLAN §9.1), the core is wood or
// metal, and steel is a dark plate on the side it went up from. Caps in the skins' colour close the gap
// between the skins at the panel's edges (a free-standing wall's ends and top). A reinforceable wall shows
// the boundaries between its sections as thin dark seams on both faces. When a panel changes, only the
// layers whose drawn cells changed are rebuilt; each box is 8 shared corners, lit flat (no normals to
// build), so a shot-up wall redraws within PLAN §8.2's main-thread budget. On a map, the storey views hide
// the panels of the storeys above you and can recolour the skins (render/storeyView.ts).
import * as THREE from "three";
import { greedyRects, L_BACK, L_CORE, L_FRONT, L_STEEL, layerSlab, STEEL_PLATE_M, type Panel, type PanelEntry, type PanelSet } from "@redmond/shared";
import { showsSections, SURFACE_COLORS } from "./labScene.js";

const WOOD = 0x8b6a43;
const METAL = 0x7d848c;
const STEEL = 0x56606b;
const SEAM = 0x1c232c;

/**
 * What a panel draws, in this order: front skin, core, back skin, the steel plate on the −n side, on the +n
 * side, the caps at its edges, and its section seams.
 */
const SLOTS = 7;
/** How deep a cap is (it only shows its outer face, and from inside through a hole near the edge). */
const CAP_M = 0.004;
/** How wide a section seam is, and how far it stands off the skin or steel it is drawn on. */
const SEAM_M = 0.03;
const SEAM_LIFT = 0.001;

interface Drawn {
  /** The panel object and version drawn (a reset panel is a new object at version 0). */
  panel: Panel | null;
  version: number;
  /** Per slot: the cells drawn (a copy), and their mesh. */
  cells: (Uint8Array | null)[];
  meshes: (THREE.Mesh | null)[];
  /** Every box of this panel lies inside it (no need to measure each new mesh). */
  bounds: THREE.Sphere;
}

export class PanelView {
  private readonly groups: THREE.Group[] = [];
  private readonly drawn: Drawn[] = [];
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  /** The skins' colour by surface (a map's palette, StoreyView); studs, steel, glass and seams keep their own. */
  private skinColor = (surface: string): number => SURFACE_COLORS[surface as keyof typeof SURFACE_COLORS];

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
      const radius = Math.hypot(e.frame.w, e.frame.h, e.frame.t + 2 * STEEL_PLATE_M) / 2;
      this.drawn.push({ panel: null, version: -1, cells: new Array(SLOTS).fill(null), meshes: new Array(SLOTS).fill(null), bounds: new THREE.Sphere(new THREE.Vector3(), radius) });
    }
    // One hidden mesh per material, so warmShaders readies them all before the first reinforcement or window
    // (built like a panel's, without normals, so it is the same shader).
    const probes = new THREE.Group();
    for (const key of ["skin:SOFT_WALL", "core:wood", "core:metal", "steel", "glass", "seam"]) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), 3));
      const m = new THREE.Mesh(geo, this.material(key));
      m.visible = false;
      probes.add(m);
    }
    scene.add(probes);
    this.update();
  }

  /**
   * Redraw every panel that changed since the last call (cheap when nothing did). True if any mesh changed:
   * the level's shadows changed with it.
   */
  update(): boolean {
    let changed = false;
    for (let i = 0; i < this.panels.list.length; i++) {
      const e = this.panels.list[i];
      const d = this.drawn[i];
      if (d.panel === e.panel && d.version === e.panel.version) continue;
      d.panel = e.panel;
      d.version = e.panel.version;
      if (this.build(e, d, this.groups[i])) changed = true;
    }
    return changed;
  }

  /** Meshes drawn over all the panels now (the stats overlay). */
  get meshCount(): number {
    let n = 0;
    for (const d of this.drawn) for (const m of d.meshes) if (m) n++;
    return n;
  }

  /**
   * Show or hide panel `index` (StoreyView hides the storeys above you). A hidden panel still redraws as it
   * changes, so it is right the moment it shows again. True if that changed what is drawn.
   */
  setVisible(index: number, visible: boolean): boolean {
    const g = this.groups[index];
    if (g.visible === visible) return false;
    g.visible = visible;
    return true;
  }

  /** Whether panel `index` is drawn (setVisible). */
  isVisible(index: number): boolean {
    return this.groups[index].visible;
  }

  /** Colour every panel's skins by surface (a palette): only the materials change, nothing is rebuilt. */
  setSkinColors(color: (surface: string) => number): void {
    this.skinColor = color;
    for (const [key, m] of this.materials) if (key.startsWith("skin:")) m.color.setHex(color(key.slice(5)));
  }

  /**
   * Only what can be seen: the core near a hole in either skin (a few cells around it, for looking in at an
   * angle), and a skin only where no steel plate covers it. Faces hidden 2 cm behind another would otherwise
   * fight it for depth at a distance (a 16-bit depth buffer can't tell them apart past ~10 m). True if any of
   * the panel's meshes changed.
   */
  private build(e: PanelEntry, d: Drawn, g: THREE.Group): boolean {
    const p = e.panel;
    const c = p.spec.construction;
    const half = e.frame.t / 2;
    const steel = p.layers[L_STEEL];
    // Steel cells by the side their plate is on.
    let plates: [Uint8Array, Uint8Array] | null = null;
    if (steel) {
      plates = [new Uint8Array(steel.length), new Uint8Array(steel.length)];
      for (let s = 0; s < p.sectionCount; s++) {
        const [u0, u1] = p.sectionRange(s);
        const plate = plates[(p.steelSides >> s) & 1];
        for (let v = 0; v < p.h; v++) for (let u = u0, i = v * p.w + u0; u < u1; u++, i++) plate[i] = steel[i];
      }
    }
    const skin = c.kind === "glass" ? "glass" : `skin:${c.kind === "barricade" ? "BARRICADE" : e.info.surface}`;
    const front = p.layers[L_FRONT];
    const back = p.layers[L_BACK];
    /** Per slot: the cells it draws (null: nothing), its material, and the geometry for those cells. */
    const wanted: { cells: Uint8Array | null; key: string; geometry: (cells: Uint8Array) => THREE.BufferGeometry | null }[] = [
      { cells: hidePlate(front, plates?.[0]), key: skin, geometry: (cells) => boxes(e, cells, layerSlab(p, e.frame, L_FRONT)) },
      {
        cells: p.layers[L_CORE] && exposed(p.layers[L_CORE], front, back, p.w, p.h),
        key: p.coreMetal ? "core:metal" : "core:wood",
        geometry: (cells) => boxes(e, cells, layerSlab(p, e.frame, L_CORE)),
      },
      { cells: hidePlate(back, plates?.[1]), key: skin, geometry: (cells) => boxes(e, cells, layerSlab(p, e.frame, L_BACK)) },
      // Each plate just proud of its face.
      { cells: plates?.[0] ?? null, key: "steel", geometry: (cells) => boxes(e, cells, [-half - STEEL_PLATE_M, -half + 0.002]) },
      { cells: plates?.[1] ?? null, key: "steel", geometry: (cells) => boxes(e, cells, [half - 0.002, half + STEEL_PLATE_M]) },
      // Between two skins (walls, floors, hatches), across the core's depth.
      { cells: front && back ? edgeCaps(front, back, p.w, p.h) : null, key: skin, geometry: (cells) => capBoxes(e, cells, layerSlab(p, e.frame, L_CORE)) },
      // Where one reinforcement section meets the next, on both faces, reinforced or not, so the sections can
      // be counted by eye (tools/mapgen/DESIGN.md amendment 13).
      { cells: showsSections(p.spec) && p.sectionCount > 1 ? seamCells(p, plates) : null, key: "seam", geometry: (cells) => seamBoxes(e, cells) },
    ];
    let changed = false;
    wanted.forEach((w, slot) => {
      const before = d.cells[slot];
      if (w.cells === null ? before === null : before !== null && sameCells(before, w.cells)) return;
      changed = true;
      d.meshes[slot]?.geometry.dispose();
      d.meshes[slot] = null;
      d.cells[slot] = w.cells && w.cells.slice();
      const geo = w.cells && w.geometry(w.cells);
      if (!geo) return;
      geo.boundingSphere = d.bounds;
      const mesh = new THREE.Mesh(geo, this.material(w.key));
      mesh.name = w.key;
      // Studs sit right behind a 2 cm skin: their shadows only streak the skin (shadow-map precision). A seam
      // is too thin to cast anything.
      mesh.castShadow = w.key !== "glass" && w.key !== "seam" && !w.key.startsWith("core:");
      mesh.receiveShadow = true;
      d.meshes[slot] = mesh;
    });
    if (!changed) return false;
    g.clear();
    for (const m of d.meshes) if (m) g.add(m);
    return true;
  }

  private material(key: string): THREE.MeshStandardMaterial {
    let m = this.materials.get(key);
    if (m) return m;
    // Flat: lit by each face's own direction (the boxes carry no normals).
    const flat = { flatShading: true };
    if (key === "glass") m = new THREE.MeshStandardMaterial({ ...flat, color: SURFACE_COLORS.WINDOW, roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
    else if (key === "steel") m = new THREE.MeshStandardMaterial({ ...flat, color: STEEL, roughness: 0.45, metalness: 0.7 });
    else if (key === "core:metal") m = new THREE.MeshStandardMaterial({ ...flat, color: METAL, roughness: 0.5, metalness: 0.6 });
    else if (key === "core:wood") m = new THREE.MeshStandardMaterial({ ...flat, color: WOOD, roughness: 0.9 });
    // A seam lies a millimetre off its face: pulled forward in depth too, so it wins against that face at
    // any distance (as bullet marks do, fxBus.ts).
    else if (key === "seam") m = new THREE.MeshStandardMaterial({ ...flat, color: SEAM, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    else m = new THREE.MeshStandardMaterial({ ...flat, color: this.skinColor(key.slice(5)), roughness: 0.85 });
    this.materials.set(key, m);
    return m;
  }
}

/** Two triangles a face, outward: corner c of a box is (x, y, z) = (c & 1, c & 2, c & 4) high or low. */
const BOX = [1, 3, 7, 1, 7, 5, 0, 4, 6, 0, 6, 2, 2, 6, 7, 2, 7, 3, 0, 1, 5, 0, 5, 4, 4, 5, 7, 4, 7, 6, 0, 2, 3, 0, 3, 1];

/** A box in the panel's own axes, metres from its centre: [u0, u1, v0, v1] across the face, [n0, n1] through it. */
type FaceBox = [number, number, number, number, number, number];

/** The cells as boxes in the panel's own axes, spanning `slab` through it; null if there are none. */
function boxes(e: PanelEntry, cells: Uint8Array, slab: [number, number]): THREE.BufferGeometry | null {
  const p = e.panel;
  const [x0, y0] = [-e.frame.w / 2, -e.frame.h / 2];
  return boxGeometry(
    e,
    greedyRects(cells, p.w, p.h).map((r) => [x0 + r.u0 * p.cellU, x0 + r.u1 * p.cellU, y0 + r.v0 * p.cellV, y0 + r.v1 * p.cellV, slab[0], slab[1]]),
  );
}

/**
 * Where both skins reach a panel's edge (edgeCaps), a thin box closing the gap between them, flush with the
 * edge; one box per run of edge cells.
 */
function capBoxes(e: PanelEntry, caps: Uint8Array, slab: [number, number]): THREE.BufferGeometry | null {
  const p = e.panel;
  const [hw, hh] = [e.frame.w / 2, e.frame.h / 2];
  const out: FaceBox[] = [];
  const runs = (from: number, n: number, box: (a: number, b: number) => [number, number, number, number]) => {
    for (let i = 0; i < n; ) {
      if (!caps[from + i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < n && caps[from + j]) j++;
      out.push([...box(i, j), slab[0], slab[1]]);
      i = j;
    }
  };
  runs(0, p.w, (a, b) => [-hw + a * p.cellU, -hw + b * p.cellU, -hh, -hh + CAP_M]);
  runs(p.w, p.w, (a, b) => [-hw + a * p.cellU, -hw + b * p.cellU, hh - CAP_M, hh]);
  runs(2 * p.w, p.h, (a, b) => [-hw, -hw + CAP_M, -hh + a * p.cellV, -hh + b * p.cellV]);
  runs(2 * p.w + p.h, p.h, (a, b) => [hw - CAP_M, hw, -hh + a * p.cellV, -hh + b * p.cellV]);
  return boxGeometry(e, out);
}

/**
 * Where the section seams go: per face (−n, then +n), per boundary between two reinforcement sections, per
 * row of cells, 1 on the skin, 2 on a steel plate, 0 where the face has a hole on either side of the
 * boundary (a seam goes with the face it is drawn on).
 */
function seamCells(p: Panel, plates: [Uint8Array, Uint8Array] | null): Uint8Array {
  const joins = p.sectionCount - 1;
  const out = new Uint8Array(2 * joins * p.h);
  for (let side = 0; side < 2; side++) {
    const skin = p.layers[side ? L_BACK : L_FRONT];
    const plate = plates?.[side];
    const face = (i: number) => (plate?.[i] ? 2 : skin?.[i] ? 1 : 0);
    for (let s = 0; s < joins; s++) {
      const b = p.sectionRange(s)[1];
      if (b <= 0 || b >= p.w) continue; // a panel narrower than its sections
      for (let v = 0, o = (side * joins + s) * p.h; v < p.h; v++, o++) {
        const l = face(v * p.w + b - 1);
        const r = face(v * p.w + b);
        out[o] = l && r ? Math.max(l, r) : 0;
      }
    }
  }
  return out;
}

/** The seams (seamCells) as thin boxes, one per run of rows, each just proud of the skin or steel under it. */
function seamBoxes(e: PanelEntry, seams: Uint8Array): THREE.BufferGeometry | null {
  const p = e.panel;
  const joins = p.sectionCount - 1;
  const [hw, hh, half] = [e.frame.w / 2, e.frame.h / 2, e.frame.t / 2];
  const out: FaceBox[] = [];
  for (let side = 0; side < 2; side++)
    for (let s = 0; s < joins; s++) {
      const u = -hw + p.sectionRange(s)[1] * p.cellU;
      const o = (side * joins + s) * p.h;
      for (let v = 0; v < p.h; ) {
        const on = seams[o + v];
        let end = v + 1;
        while (end < p.h && seams[o + end] === on) end++;
        if (on) {
          // Sunk into what it lies on as a plate is into its skin, and standing just off its face.
          const lift = SEAM_LIFT + (on === 2 ? STEEL_PLATE_M : 0);
          const [n0, n1] = side ? [half - 0.002, half + lift] : [-half - lift, -half + 0.002];
          out.push([u - SEAM_M / 2, u + SEAM_M / 2, -hh + v * p.cellV, -hh + end * p.cellV, n0, n1]);
        }
        v = end;
      }
    }
  return boxGeometry(e, out);
}

/** The boxes as one geometry; null if there are none. */
function boxGeometry(e: PanelEntry, list: FaceBox[]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  const [au, av, an] = e.frame.axes;
  const pos = new Float32Array(list.length * 24);
  const idx = list.length * 8 > 0xffff ? new Uint32Array(list.length * 36) : new Uint16Array(list.length * 36);
  const lo = [0, 0, 0];
  const hi = [0, 0, 0];
  for (let k = 0; k < list.length; k++) {
    [lo[au], hi[au], lo[av], hi[av], lo[an], hi[an]] = list[k];
    for (let c = 0, o = k * 24; c < 8; c++, o += 3) {
      pos[o] = c & 1 ? hi[0] : lo[0];
      pos[o + 1] = c & 2 ? hi[1] : lo[1];
      pos[o + 2] = c & 4 ? hi[2] : lo[2];
    }
    for (let j = 0, base = k * 8, o = k * 36; j < 36; j++) idx[o + j] = base + BOX[j];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

/**
 * Per edge cell (the bottom row, the top row, the −u column, the +u column, in that order): 1 where both skins
 * are there, so the gap between them is closed (a hole through either skin at the edge opens it).
 */
function edgeCaps(front: Uint8Array, back: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(2 * (w + h));
  const both = (i: number) => (front[i] && back[i] ? 1 : 0);
  for (let u = 0; u < w; u++) {
    out[u] = both(u);
    out[w + u] = both((h - 1) * w + u);
  }
  for (let v = 0; v < h; v++) {
    out[2 * w + v] = both(v * w);
    out[2 * w + h + v] = both(v * w + w - 1);
  }
  return out;
}

/** A skin less the cells a steel plate covers (null: no such layer). */
function hidePlate(skin: Uint8Array | null, plate: Uint8Array | undefined): Uint8Array | null {
  if (!skin || !plate) return skin;
  const out = new Uint8Array(skin.length);
  for (let i = 0; i < skin.length; i++) out[i] = plate[i] ? 0 : skin[i];
  return out;
}

function sameCells(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** How far around a hole the core is drawn (cells): enough to look in at a steep angle. */
const CORE_MARGIN = 3;

/** Core cells within CORE_MARGIN cells of a hole in either skin (a square around each, in two passes). */
function exposed(core: Uint8Array, front: Uint8Array | null, back: Uint8Array | null, w: number, h: number): Uint8Array {
  // Holes, spread along u, then along v.
  const rows = new Uint8Array(core.length);
  const hole = (i: number) => !(front?.[i] && back?.[i]);
  for (let v = 0; v < h; v++) {
    let any = false;
    for (let u = 0; u < w && !any; u++) any = hole(v * w + u);
    if (!any) continue;
    let near = -Infinity;
    // Forward then backward: distance to the nearest hole in the row.
    for (let u = 0; u < w; u++) {
      const i = v * w + u;
      if (hole(i)) near = u;
      if (u - near <= CORE_MARGIN) rows[i] = 1;
    }
    near = Infinity;
    for (let u = w - 1; u >= 0; u--) {
      const i = v * w + u;
      if (hole(i)) near = u;
      if (near - u <= CORE_MARGIN) rows[i] = 1;
    }
  }
  const out = new Uint8Array(core.length);
  for (let u = 0; u < w; u++) {
    let near = -Infinity;
    for (let v = 0; v < h; v++) {
      if (rows[v * w + u]) near = v;
      if (v - near <= CORE_MARGIN && core[v * w + u]) out[v * w + u] = 1;
    }
    near = Infinity;
    for (let v = h - 1; v >= 0; v--) {
      if (rows[v * w + u]) near = v;
      if (near - v <= CORE_MARGIN && core[v * w + u]) out[v * w + u] = 1;
    }
  }
  return out;
}
