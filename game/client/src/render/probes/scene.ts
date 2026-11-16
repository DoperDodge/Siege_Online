// What the probe bake needs from a level (render/DESIGN.md §6.3), gathered on the page: the level's boxes as the light
// sees them (the static boxes, and each panel's cells where anything still stands, as boxes over greedy rectangles),
// the grids, the room maps and styles (levelArt.ts) with each material's albedo, and the lamps. Plain arrays, sent to
// the bake's workers.
import { greedyRects, L_BACK, L_CORE, L_FRONT, L_STEEL, type BuiltLevel, type PanelEntry, type Renderable } from "@redmond/shared";
import { BOX_STRIDE, BoxClass } from "./bvh.js";
import { LAMP_STRIDE, type GridSpec } from "./bake.js";

/** A box's rotation rows from a unit quaternion (x, y, z, w). */
function rows(q: readonly number[]): number[] {
  const [x, y, z, w] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}

/** The level's static boxes (every visible renderable but the panels), their class from `styleOf` (levelArt.ts). */
export function staticBoxes(level: BuiltLevel, styleOf: (r: Renderable) => number): Float32Array {
  const list = level.renderables.filter((r) => r.visible && r.kind !== "panel");
  const out = new Float32Array(list.length * BOX_STRIDE);
  list.forEach((r, i) => out.set([r.center[0], r.center[1], r.center[2], r.size[0] / 2, r.size[1] / 2, r.size[2] / 2, ...rows(r.quat), styleOf(r)], i * BOX_STRIDE));
  return out;
}

/**
 * A panel's boxes as the light sees it: its cells where any layer still stands (a skin, the core, a steel plate),
 * greedy rectangles through its whole thickness. Glass lets light through; a barricade half of it.
 */
export function panelBoxes(e: PanelEntry): number[] {
  const p = e.panel;
  const c = p.spec.construction;
  const cls = c.kind === "glass" ? BoxClass.Glass : c.kind === "barricade" ? BoxClass.Barricade : BoxClass.Solid;
  const mask = new Uint8Array(p.w * p.h);
  for (const l of [L_FRONT, L_CORE, L_BACK, L_STEEL]) {
    const layer = p.layers[l];
    if (layer) for (let i = 0; i < mask.length; i++) if (layer[i]) mask[i] = 1;
  }
  const out: number[] = [];
  const [au, av, an] = e.frame.axes;
  const R = rows(e.frame.quat);
  const [x0, y0] = [-e.frame.w / 2, -e.frame.h / 2];
  for (const r of greedyRects(mask, p.w, p.h)) {
    const lc = [0, 0, 0];
    const lh = [0, 0, 0];
    lc[au] = x0 + ((r.u0 + r.u1) / 2) * p.cellU;
    lc[av] = y0 + ((r.v0 + r.v1) / 2) * p.cellV;
    lc[an] = 0;
    lh[au] = ((r.u1 - r.u0) / 2) * p.cellU;
    lh[av] = ((r.v1 - r.v0) / 2) * p.cellV;
    lh[an] = e.frame.t / 2;
    // The centre in the world: the frame's centre plus its rotation of the local centre.
    const wx = e.frame.center[0] + R[0] * lc[0] + R[1] * lc[1] + R[2] * lc[2];
    const wy = e.frame.center[1] + R[3] * lc[0] + R[4] * lc[1] + R[5] * lc[2];
    const wz = e.frame.center[2] + R[6] * lc[0] + R[7] * lc[1] + R[8] * lc[2];
    out.push(wx, wy, wz, lh[0], lh[1], lh[2], ...R, cls);
  }
  return out;
}

/** The static boxes and every panel's boxes in one array. */
export function joinBoxes(statics: Float32Array, panels: readonly number[][]): Float32Array {
  const n = panels.reduce((s, b) => s + b.length, 0);
  const out = new Float32Array(statics.length + n);
  out.set(statics, 0);
  let at = statics.length;
  for (const b of panels) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

/** Probe spacing inside the building (x and z, then y), and outside. */
const FINE: [number, number, number] = [0.75, 0.8, 0.75];
const COARSE = 3;

/**
 * The bake's grids: a fine one over the rooms (from just over the lowest storey's floor to a roof's height over the
 * highest) and a coarse one over the whole level; a level without rooms (a lab) gets one grid at 1.5 m.
 */
export function bakeGrids(level: BuiltLevel): GridSpec[] {
  const def = level.def;
  const b = def.bounds;
  const box = b ? { min: b.min, max: b.max } : levelExtent(level);
  const grid = (min: number[], max: number[], s: readonly number[]): GridSpec => {
    const dims = [0, 1, 2].map((k) => Math.max(2, Math.ceil((max[k] - min[k]) / s[k]) + 1)) as [number, number, number];
    return { origin: [min[0], min[1], min[2]], spacing: [s[0], s[1], s[2]], dims };
  };
  const top = Math.min(box.max[1], 30);
  if (!def.rooms.length || !def.storeys.length) return [grid([box.min[0], Math.max(box.min[1], -2), box.min[2]], [box.max[0], Math.min(top, 12), box.max[2]], [1.5, 1.5, 1.5])];
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of def.rooms)
    for (const q of r.rects) {
      x0 = Math.min(x0, q[0]);
      z0 = Math.min(z0, q[1]);
      x1 = Math.max(x1, q[2]);
      z1 = Math.max(z1, q[3]);
    }
  const m = 3;
  const lo = def.storeys[0].floorY + 0.4;
  const hi = def.storeys[def.storeys.length - 1].ceilingY + 4;
  const fine = grid([x0 - m, lo, z0 - m], [x1 + m, hi, z1 + m], FINE);
  const coarse = grid([box.min[0], -1, box.min[2]], [box.max[0], Math.min(top, 24), box.max[2]], [COARSE, COARSE, COARSE]);
  return [fine, coarse];
}

function levelExtent(level: BuiltLevel): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const r of level.renderables) {
    if (!r.visible) continue;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], r.center[k] - r.size[k] / 2);
      max[k] = Math.max(max[k], r.center[k] + r.size[k] / 2);
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : { min: [-10, 0, -10], max: [10, 5, 10] };
}

/** Lamps are spread about this far apart over a room (a fixture lights about LAMP_CELL_M²), this far under the ceiling. */
const LAMP_SPACING_M = 3.5;
const LAMP_CELL_M2 = 12;
const LAMP_DROP_M = 0.45;
/** A rect smaller than this (m²) gets no lamp of its own (a closet's light comes from the room next to it). */
const LAMP_MIN_M2 = 2;

/**
 * The rooms' lamps (render/DESIGN.md §6.6): fixtures spread over each rect of the room about LAMP_SPACING_M apart, just
 * under its storey's ceiling, each lighting its share of the floor: its colour and intensity (irradiance at 1 m) are
 * `light(roomId)` for a share of LAMP_CELL_M², scaled by its share; null leaves a room unlit.
 */
export function roomLamps(level: BuiltLevel, light: (roomId: string) => [number, number, number] | null): Float32Array {
  const out: number[] = [];
  level.def.rooms.forEach((r, i) => {
    const storey = level.def.storeys.find((s) => s.id === r.storey);
    const c = light(r.id);
    if (!storey || !c) return;
    for (const q of r.rects) {
      const [w, d] = [q[2] - q[0], q[3] - q[1]];
      if (w * d < LAMP_MIN_M2) continue;
      const nx = Math.max(1, Math.round(w / LAMP_SPACING_M));
      const nz = Math.max(1, Math.round(d / LAMP_SPACING_M));
      const k = (w * d) / (nx * nz) / LAMP_CELL_M2;
      for (let a = 0; a < nx; a++)
        for (let b = 0; b < nz; b++) out.push(q[0] + ((a + 0.5) * w) / nx, storey.ceilingY - LAMP_DROP_M, q[1] + ((b + 0.5) * d) / nz, c[0] * k, c[1] * k, c[2] * k, i + 1);
    }
  });
  return new Float32Array(out);
}

export { LAMP_STRIDE };
