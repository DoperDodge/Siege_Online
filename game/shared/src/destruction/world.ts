// Where panels are in the world (Phase 4 M3): a level solid's box as a panel frame (width u, height or
// depth v, thickness n), the spec its construction gives it, and which cells a ray crosses in each layer.
import { DEG, quatYawPitch, rotateXZ, type Vec3 } from "../core/math.js";
import type { DestructionData, LevelDef } from "../data/schemas.js";
import { L_BACK, L_CORE, L_FRONT, L_STEEL, type Panel, type PanelSpec } from "./panel.js";

export type LevelSolid = LevelDef["solids"][number];

export interface PanelFrame {
  center: Vec3;
  /** World unit vectors along the width (u), the height or a floor's depth (v), and through it (n: front → back). */
  u: Vec3;
  v: Vec3;
  n: Vec3;
  /** Width, height (or depth) and thickness, metres. */
  w: number;
  h: number;
  t: number;
  /** The box's rotation (a yaw), and which of its local axes (x 0, y 1, z 2) carry u, v and n. */
  quat: [number, number, number, number];
  axes: readonly [number, number, number];
}

/** The construction id a level solid is built as, or null if it isn't destructible. */
export function constructionOf(d: DestructionData, s: LevelSolid): string | null {
  return s.panel?.construction ?? d.surfaces[s.surface] ?? null;
}

/**
 * A wall, barricade or window stands: its width runs along the longer horizontal side, its thickness the
 * shorter. A floor or hatch lies flat: width along x, depth along z, thickness up.
 */
export function panelFrame(s: LevelSolid, flat: boolean): PanelFrame {
  const yaw = s.yawDeg * DEG;
  const [xx, xz] = rotateXZ(1, 0, yaw);
  const [zx, zz] = rotateXZ(0, 1, yaw);
  const ax: Vec3 = [xx, 0, xz];
  const az: Vec3 = [zx, 0, zz];
  const ay: Vec3 = [0, 1, 0];
  const [sx, sy, sz] = s.size;
  const base = { center: [...s.center] as Vec3, quat: quatYawPitch(yaw, 0) };
  if (flat) return { ...base, u: ax, v: az, n: ay, w: sx, h: sz, t: sy, axes: [0, 2, 1] };
  if (sx >= sz) return { ...base, u: ax, v: ay, n: az, w: sx, h: sy, t: sz, axes: [0, 1, 2] };
  return { ...base, u: az, v: ay, n: ax, w: sz, h: sy, t: sx, axes: [2, 1, 0] };
}

export function panelSpec(d: DestructionData, s: LevelSolid, index: number, constructionId: string): { spec: PanelSpec; frame: PanelFrame } {
  const c = d.constructions[constructionId];
  const frame = panelFrame(s, c.kind === "floor" || c.kind === "hatch");
  const hp = c.kind === "hatch" ? c.hp : c.kind === "barricade" ? d.barricade.hp : c.kind === "glass" ? 1 : 0;
  const spec: PanelSpec = {
    index,
    id: s.id,
    constructionId,
    construction: c,
    widthM: frame.w,
    heightM: frame.h,
    thicknessM: frame.t,
    cellM: d.cellM,
    sections: s.panel?.sections ?? (c.kind === "wall" ? 2 : 1),
    steelHeightM: d.reinforcement.steelHeightM,
    reinforced: s.panel?.reinforced ?? s.surface === "REINFORCED_WALL",
    reinforcedSide: s.panel?.reinforcedFrom === "minus" ? 0 : 1,
    empty: s.panel?.empty ?? false,
    hp,
    reinforcedHatchHp: d.reinforcement.reinforcedHatchHp,
    canReReinforce: d.reinforcement.canReReinforce,
    passableBelowHp: d.barricade.passableBelowHp,
  };
  return { spec, frame };
}

/**
 * Steel goes up over the skin on the reinforcer's side (research/destruction.md §6–§7: a plate anchored
 * top and bottom), drawn this thick, just proud of the face. A ray meets it before that side's skin.
 */
export const STEEL_PLATE_M = 0.006;
const STEEL_PLANE = 0.0005;

/** A layer's extent through the panel, metres along n from the centre: [toward −n, toward +n]. Steel: per side. */
export function layerSlab(p: Panel, frame: PanelFrame, layer: number, side = 0): [number, number] {
  const c = p.spec.construction;
  const half = frame.t / 2;
  if (!("skinM" in c)) return [-half, half];
  if (layer === L_FRONT) return [-half, -half + c.skinM];
  if (layer === L_CORE) return [-half + c.skinM, half - c.skinM];
  if (layer === L_BACK) return [half - c.skinM, half];
  return side ? [half - 2 * STEEL_PLANE, half] : [-half, -half + 2 * STEEL_PLANE];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A ray's passage through one cell of one layer of a panel: where, and which cell (and quarter cell). */
export interface LayerCrossing {
  /** Metres along the ray to the middle of its stretch in the cell (where the cell is read). */
  t: number;
  /** Metres along the ray to where it enters the cell (marks, line-of-sight distances). */
  face: number;
  /** The face it entered through: 2 the layer's front or back, 0 or 1 a side or top edge (u, v) of the panel or the cell. */
  axis: number;
  layer: number;
  /** Steel: the side its section went up from (0 −n, 1 +n). */
  side: number;
  u: number;
  v: number;
  u4: number;
  v4: number;
  /** Material in that cell. */
  solid: boolean;
}

/**
 * Every cell of every layer the ray passes through inside the panel's box within (0, maxT], nearest first. A
 * ray through a layer at an angle passes a cell or two; one that came in through an edge and runs along the
 * face passes many (it meets the wall's end, not nothing). Steel is crossed on its section's side only.
 */
export function panelCrossings(p: Panel, frame: PanelFrame, origin: Vec3, dir: Vec3, maxT: number): LayerCrossing[] {
  const rel: Vec3 = [origin[0] - frame.center[0], origin[1] - frame.center[1], origin[2] - frame.center[2]];
  const o = [dot(rel, frame.u), dot(rel, frame.v), dot(rel, frame.n)];
  const d = [dot(dir, frame.u), dot(dir, frame.v), dot(dir, frame.n)];
  const half = [frame.w / 2, frame.h / 2, frame.t / 2];
  let t0 = 0;
  let t1 = maxT;
  let entry = 2;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < -half[k] || o[k] > half[k]) return [];
      continue;
    }
    let a = (-half[k] - o[k]) / d[k];
    let b = (half[k] - o[k]) / d[k];
    if (a > b) [a, b] = [b, a];
    if (a > t0) (t0 = a), (entry = k);
    t1 = Math.min(t1, b);
    if (t0 > t1) return [];
  }
  const out: LayerCrossing[] = [];
  // Cell coordinates along the ray: (A + du t, B + dv t).
  const A = (o[0] + half[0]) / p.cellU;
  const B = (o[1] + half[1]) / p.cellV;
  const du = d[0] / p.cellU;
  const dv = d[1] / p.cellV;
  const walk = (layer: number, side: number) => {
    const l = p.layers[layer]!;
    const [lo, hi] = layerSlab(p, frame, layer, side);
    // The ray's stretch inside the layer, within the box.
    let s0 = t0;
    let s1 = t1;
    let axis = entry;
    if (Math.abs(d[2]) < 1e-12) {
      if (o[2] < lo || o[2] > hi) return;
    } else {
      let a = (lo - o[2]) / d[2];
      let b = (hi - o[2]) / d[2];
      if (a > b) [a, b] = [b, a];
      if (a > s0) (s0 = a), (axis = 2);
      s1 = Math.min(s1, b);
    }
    if (s1 - s0 <= 1e-9 || s1 <= 0) return;
    // Cell by cell (a grid walk), starting in the cell it goes into.
    const ts = Math.min(s0 + 1e-7, (s0 + s1) / 2);
    let u = Math.min(Math.max(Math.floor(A + du * ts), 0), p.w - 1);
    let v = Math.min(Math.max(Math.floor(B + dv * ts), 0), p.h - 1);
    let tu = du > 0 ? (u + 1 - A) / du : du < 0 ? (u - A) / du : Infinity;
    let tv = dv > 0 ? (v + 1 - B) / dv : dv < 0 ? (v - B) / dv : Infinity;
    const su = Math.abs(1 / du);
    const sv = Math.abs(1 / dv);
    let enter = s0;
    for (let guard = p.w + p.h + 2; guard > 0; guard--) {
      const leave = Math.min(tu, tv, s1);
      // Steel only on sections ever reinforced (cut away since, it may still be there for a shot judged in
      // the past), from this side.
      const s = layer === L_STEEL ? p.sectionOf(u) : 0;
      if (leave > enter && (layer !== L_STEEL || (p.everReinforced & (1 << s) && ((p.steelSides >> s) & 1) === side))) {
        const t = (enter + leave) / 2;
        const fu = Math.min(Math.max(A + du * t, u), u + 1 - 1e-6);
        const fv = Math.min(Math.max(B + dv * t, v), v + 1 - 1e-6);
        out.push({ t, face: enter, axis, layer, side, u, v, u4: Math.floor(fu * 4), v4: Math.floor(fv * 4), solid: l[v * p.w + u] === 1 });
      }
      if (leave >= s1) return;
      if (tu <= tv) {
        u += du > 0 ? 1 : -1;
        enter = tu;
        tu += su;
        axis = 0;
      } else {
        v += dv > 0 ? 1 : -1;
        enter = tv;
        tv += sv;
        axis = 1;
      }
      if (u < 0 || u >= p.w || v < 0 || v >= p.h) return;
    }
  };
  for (const layer of [L_FRONT, L_CORE, L_BACK]) if (p.layers[layer]) walk(layer, 0);
  if (p.layers[L_STEEL] && p.everReinforced) {
    walk(L_STEEL, 0);
    walk(L_STEEL, 1);
  }
  return out.sort((a, b) => a.t - b.t);
}

/** The outward normal of the face a crossing entered through (facing back along the ray). */
export function crossingNormal(frame: PanelFrame, c: LayerCrossing, dir: Vec3): Vec3 {
  const axis = [frame.u, frame.v, frame.n][c.axis];
  const s = dot(dir, axis) > 0 ? -1 : 1;
  return [axis[0] * s, axis[1] * s, axis[2] * s];
}

/** World point of cell (u, v) of a layer (its centre), for effects. */
export function cellWorld(p: Panel, frame: PanelFrame, layer: number, u: number, v: number, side = 0): Vec3 {
  const du = (u + 0.5) * p.cellU - frame.w / 2;
  const dv = (v + 0.5) * p.cellV - frame.h / 2;
  const [lo, hi] = layerSlab(p, frame, layer, side);
  const dn = (lo + hi) / 2;
  return [0, 1, 2].map((k) => frame.center[k] + frame.u[k] * du + frame.v[k] * dv + frame.n[k] * dn) as Vec3;
}
