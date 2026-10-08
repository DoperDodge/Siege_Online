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

/** A ray's crossing of one layer of a panel: where, and which cell (and quarter cell). */
export interface LayerCrossing {
  /** Metres along the ray to the layer's middle (where its cell is read). */
  t: number;
  /** Metres along the ray to where it enters the layer (marks, line-of-sight distances). */
  face: number;
  /** The face it entered through: 2 the panel's front or back, 0 or 1 a side or top edge (u, v). */
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
 * Every layer the ray crosses inside the panel's box within (0, maxT], nearest first. A ray running along
 * the face (inside the box, parallel to it) crosses no layer. Steel is crossed on its section's side only.
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
  if (Math.abs(d[2]) < 1e-9) return [];
  const out: LayerCrossing[] = [];
  const cross = (layer: number, side: number) => {
    const l = p.layers[layer]!;
    const [lo, hi] = layerSlab(p, frame, layer, side);
    const t = ((lo + hi) / 2 - o[2]) / d[2];
    if (t < t0 - 1e-9 || t > t1 + 1e-9 || t <= 0) return;
    const fu = Math.min(Math.max((o[0] + d[0] * t + half[0]) / p.cellU, 0), p.w - 1e-6);
    const fv = Math.min(Math.max((o[1] + d[1] * t + half[1]) / p.cellV, 0), p.h - 1e-6);
    const u = Math.floor(fu);
    const v = Math.floor(fv);
    if (layer === L_STEEL) {
      // Sections ever reinforced: steel cut away since may still be there for a shot judged in the past.
      const s = p.sectionOf(u);
      if (!(p.everReinforced & (1 << s)) || ((p.steelSides >> s) & 1) !== side) return;
    }
    // Where it enters the layer: through the face toward it, or through the box's edge if it came in there.
    const faceT = ((d[2] > 0 ? lo : hi) - o[2]) / d[2];
    const viaEdge = faceT < t0;
    out.push({ t, face: viaEdge ? t0 : Math.min(faceT, t), axis: viaEdge ? entry : 2, layer, side, u, v, u4: Math.floor(fu * 4), v4: Math.floor(fv * 4), solid: l[v * p.w + u] === 1 });
  };
  for (const layer of [L_FRONT, L_CORE, L_BACK]) if (p.layers[layer]) cross(layer, 0);
  if (p.layers[L_STEEL] && p.everReinforced) {
    cross(L_STEEL, 0);
    cross(L_STEEL, 1);
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
