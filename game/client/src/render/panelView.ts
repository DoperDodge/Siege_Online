// Destructible panels drawn from their cells (Phase 4 M3, M8): one mesh per layer, built from boxes over the
// layer's cells (greedy rectangles). Skins wear the surface's greybox colour (PLAN §9.1), the core is wood or
// metal, and steel is a dark plate on the side it went up from. Caps in the skins' colour close the gap
// between the skins at the panel's edges (a free-standing wall's ends and top). When a panel changes, only
// the layers whose drawn cells changed are rebuilt; each box is 8 shared corners, lit flat (no normals to
// build), so a shot-up wall redraws within PLAN §8.2's main-thread budget.
import * as THREE from "three";
import { greedyRects, L_BACK, L_CORE, L_FRONT, L_STEEL, layerSlab, STEEL_PLATE_M, type Panel, type PanelEntry, type PanelSet } from "@redmond/shared";
import { SURFACE_COLORS } from "./labScene.js";

const WOOD = 0x8b6a43;
const METAL = 0x7d848c;
const STEEL = 0x56606b;

/**
 * What a panel draws, in this order: front skin, core, back skin, the steel plate on the −n side, on the +n
 * side, and the caps at its edges.
 */
const SLOTS = 6;
/** How deep a cap is (it only shows its outer face, and from inside through a hole near the edge). */
const CAP_M = 0.004;

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
    for (const key of ["skin:SOFT_WALL", "core:wood", "core:metal", "steel", "glass"]) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), 3));
      const m = new THREE.Mesh(geo, this.material(key));
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
      const d = this.drawn[i];
      if (d.panel === e.panel && d.version === e.panel.version) continue;
      d.panel = e.panel;
      d.version = e.panel.version;
      this.build(e, d, this.groups[i]);
    }
  }

  /**
   * Only what can be seen: the core near a hole in either skin (a few cells around it, for looking in at an
   * angle), and a skin only where no steel plate covers it. Faces hidden 2 cm behind another would otherwise
   * fight it for depth at a distance (a 16-bit depth buffer can't tell them apart past ~10 m).
   */
  private build(e: PanelEntry, d: Drawn, g: THREE.Group) {
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
    const wanted: { cells: Uint8Array | null; slab: [number, number]; key: string; caps?: true }[] = [
      { cells: hidePlate(front, plates?.[0]), slab: layerSlab(p, e.frame, L_FRONT), key: skin },
      { cells: p.layers[L_CORE] && exposed(p.layers[L_CORE], front, back, p.w, p.h), slab: layerSlab(p, e.frame, L_CORE), key: p.coreMetal ? "core:metal" : "core:wood" },
      { cells: hidePlate(back, plates?.[1]), slab: layerSlab(p, e.frame, L_BACK), key: skin },
      // Each plate just proud of its face.
      { cells: plates?.[0] ?? null, slab: [-half - STEEL_PLATE_M, -half + 0.002], key: "steel" },
      { cells: plates?.[1] ?? null, slab: [half - 0.002, half + STEEL_PLATE_M], key: "steel" },
      // Between two skins (walls, floors, hatches), across the core's depth.
      { cells: front && back ? edgeCaps(front, back, p.w, p.h) : null, slab: layerSlab(p, e.frame, L_CORE), key: skin, caps: true },
    ];
    let changed = false;
    wanted.forEach((w, slot) => {
      const before = d.cells[slot];
      if (w.cells === null ? before === null : before !== null && sameCells(before, w.cells)) return;
      changed = true;
      d.meshes[slot]?.geometry.dispose();
      d.meshes[slot] = null;
      d.cells[slot] = w.cells && w.cells.slice();
      const geo = w.cells && (w.caps ? capBoxes(e, w.cells, w.slab) : boxes(e, w.cells, w.slab));
      if (!geo) return;
      geo.boundingSphere = d.bounds;
      const mesh = new THREE.Mesh(geo, this.material(w.key));
      // Studs sit right behind a 2 cm skin: their shadows only streak the skin (shadow-map precision).
      mesh.castShadow = w.key !== "glass" && !w.key.startsWith("core:");
      mesh.receiveShadow = true;
      d.meshes[slot] = mesh;
    });
    if (!changed) return;
    g.clear();
    for (const m of d.meshes) if (m) g.add(m);
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
    else m = new THREE.MeshStandardMaterial({ ...flat, color: SURFACE_COLORS[key.slice(5) as keyof typeof SURFACE_COLORS], roughness: 0.85 });
    this.materials.set(key, m);
    return m;
  }
}

/** Two triangles a face, outward: corner c of a box is (x, y, z) = (c & 1, c & 2, c & 4) high or low. */
const BOX = [1, 3, 7, 1, 7, 5, 0, 4, 6, 0, 6, 2, 2, 6, 7, 2, 7, 3, 0, 1, 5, 0, 5, 4, 4, 5, 7, 4, 7, 6, 0, 2, 3, 0, 3, 1];

/** A box in the panel's own axes, metres from its centre: [u0, u1, v0, v1] across the face, through `slab`. */
type FaceBox = [number, number, number, number];

/** The cells as boxes in the panel's own axes, spanning `slab` through it; null if there are none. */
function boxes(e: PanelEntry, cells: Uint8Array, slab: [number, number]): THREE.BufferGeometry | null {
  const p = e.panel;
  const [x0, y0] = [-e.frame.w / 2, -e.frame.h / 2];
  return boxGeometry(
    e,
    greedyRects(cells, p.w, p.h).map((r) => [x0 + r.u0 * p.cellU, x0 + r.u1 * p.cellU, y0 + r.v0 * p.cellV, y0 + r.v1 * p.cellV]),
    slab,
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
  const runs = (from: number, n: number, box: (a: number, b: number) => FaceBox) => {
    for (let i = 0; i < n; ) {
      if (!caps[from + i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < n && caps[from + j]) j++;
      out.push(box(i, j));
      i = j;
    }
  };
  runs(0, p.w, (a, b) => [-hw + a * p.cellU, -hw + b * p.cellU, -hh, -hh + CAP_M]);
  runs(p.w, p.w, (a, b) => [-hw + a * p.cellU, -hw + b * p.cellU, hh - CAP_M, hh]);
  runs(2 * p.w, p.h, (a, b) => [-hw, -hw + CAP_M, -hh + a * p.cellV, -hh + b * p.cellV]);
  runs(2 * p.w + p.h, p.h, (a, b) => [hw - CAP_M, hw, -hh + a * p.cellV, -hh + b * p.cellV]);
  return boxGeometry(e, out, slab);
}

/** The boxes as one geometry; null if there are none. */
function boxGeometry(e: PanelEntry, list: FaceBox[], slab: [number, number]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  const [au, av, an] = e.frame.axes;
  const pos = new Float32Array(list.length * 24);
  const idx = list.length * 8 > 0xffff ? new Uint32Array(list.length * 36) : new Uint16Array(list.length * 36);
  const lo = [0, 0, 0];
  const hi = [0, 0, 0];
  lo[an] = slab[0];
  hi[an] = slab[1];
  for (let k = 0; k < list.length; k++) {
    [lo[au], hi[au], lo[av], hi[av]] = list[k];
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
