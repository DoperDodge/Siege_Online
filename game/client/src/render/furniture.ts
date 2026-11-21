// The cover props as furniture (Phase 10 M6, render/DESIGN.md §9.1): each map's props (exterior.json) drawn as what it
// is, built in code (kit.ts) to fill its box, which still collides (and is hidden while the art shows). Millrace's 19
// (R2.3, D-199): the looms, the spinning frame, the carding engine, the dye vats, the boiler, the water wheel, the
// sluice gate, the race's debris, the footbridge, the bales, the bolt rack, the clerk's desk, the plan chest and the
// mending table.
//
// What's drawn is what collides: every piece keeps to its box (within a few centimetres) and is closed down to the
// floor, so no gap under it reads as room for a drone or a line to see feet through; a metal piece (bullets stop at
// it) shows no gap anywhere. Only small things stand on top (a tap, a vise), never past the box's footprint.
// Furniture faces away from the nearer wall (its doors, its seat; a bed's head is at the nearer wall); a piece
// standing free shows a finished back.
import type { BuiltLevel, Renderable } from "@redmond/shared";
import { Kit, type V3 } from "./kit.js";
import type { LevelArt } from "./levelArt.js";

type Mat = (material: string) => number;
type Side = "px" | "nx" | "pz" | "nz";

/** How far each of a box's sides (in its own frame: +x, −x, +z, −z) is from a wall (Infinity past WALL_LOOK_M). */
export type Walls = Record<Side, number>;

/** How far out from a side a wall is looked for, and how near counts as standing against it. */
const WALL_LOOK_M = 1.5;
const AGAINST_M = 0.3;

/** What a model is fitted to: the prop's box, its size, the walls behind its sides, the materials, a seeded random. */
export interface Fit {
  r: Renderable;
  s: V3;
  walls: Walls;
  m: Mat;
  rand: () => number;
  /** Small things on top too (plates, papers, pots, a lamp): High's dressing. */
  dress: boolean;
}

export type Furniture = (k: Kit, f: Fit) => void;

const OPPOSITE: Record<Side, Side> = { px: "nx", nx: "px", pz: "nz", nz: "pz" };
const TURN: Record<Side, number> = { pz: 0, nz: Math.PI, px: Math.PI / 2, nx: -Math.PI / 2 };

/** A box's yaw from its quaternion (props turn about y only). */
function yawOf(q: readonly number[]): number {
  return 2 * Math.atan2(q[1], q[3]);
}

/** A seeded random number generator (mulberry32), seeded from a string: the same furniture every time. */
export function seeded(id: string): () => number {
  let s = 0x9e3779b9;
  for (let i = 0; i < id.length; i++) s = Math.imul(s ^ id.charCodeAt(i), 0x85ebca6b) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The model for a prop by its id, or null. */
export function furnitureFor(id: string): Furniture | null {
  if (/^PROP_LOOM_/.test(id)) return loom;
  if (/^PROP_SPINNER/.test(id)) return spinner;
  if (/^PROP_CARDER/.test(id)) return carder;
  if (/^PROP_VAT_/.test(id)) return vat;
  if (/^PROP_BOILER/.test(id)) return boiler;
  if (/^PROP_WHEEL/.test(id)) return waterWheel;
  if (/^PROP_SLUICE_GATE/.test(id)) return sluiceGate;
  if (/^PROP_RACE_DEBRIS/.test(id)) return raceDebris;
  if (/^PROP_FOOTBRIDGE/.test(id)) return footbridge;
  if (/^PROP_BALES/.test(id)) return bales;
  if (/^PROP_BOLTS/.test(id)) return boltRack;
  if (/^PROP_DESK_DISPATCH/.test(id)) return clerkDesk;
  if (/^PROP_DESK_DRAFT/.test(id)) return planChest;
  if (/^PROP_TABLE_MEND/.test(id)) return mendingTable;
  return null;
}

const WALL_SURFACES = new Set(["HARD_WALL", "SOFT_WALL", "REINFORCEABLE", "REINFORCED_WALL", "WINDOW"]);

/** How far each side of a box is from a wall: out from three points along the side at knee height, the middle distance. */
export function wallsAround(level: BuiltLevel, r: Renderable): Walls {
  const walls = level.renderables.filter((w) => (w.kind === "solid" || w.kind === "panel") && WALL_SURFACES.has(w.surface));
  const yaw = yawOf(r.quat);
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  const y = r.center[1] - r.size[1] / 2 + Math.min(0.5, r.size[1] / 2);
  const inWall = (lx: number, lz: number) => {
    const x = r.center[0] + lx * c + lz * s;
    const z = r.center[2] - lx * s + lz * c;
    return walls.some((w) => {
      const wy = yawOf(w.quat);
      const [dx, dz] = [x - w.center[0], z - w.center[2]];
      const u = dx * Math.cos(wy) - dz * Math.sin(wy);
      const v = dx * Math.sin(wy) + dz * Math.cos(wy);
      return Math.abs(u) <= w.size[0] / 2 && Math.abs(v) <= w.size[2] / 2 && Math.abs(y - w.center[1]) <= w.size[1] / 2;
    });
  };
  const [hx, hz] = [r.size[0] / 2, r.size[2] / 2];
  /** From a point on a side outward (ox, oz): how far to the first wall. */
  const out = (px: number, pz: number, ox: number, oz: number) => {
    for (let d = 0.05; d <= WALL_LOOK_M + 1e-9; d += 0.05) if (inWall(px + ox * d, pz + oz * d)) return d;
    return Infinity;
  };
  const side = (at: (t: number) => [number, number, number, number]) => [-0.3, 0, 0.3].map((t) => out(...at(t))).sort((a, b) => a - b)[1];
  return {
    px: side((t) => [hx, t * r.size[2], 1, 0]),
    nx: side((t) => [-hx, t * r.size[2], -1, 0]),
    pz: side((t) => [t * r.size[0], hz, 0, 1]),
    nz: side((t) => [t * r.size[0], -hz, 0, -1]),
  };
}

/** Whether a side stands against a wall. */
export function against(walls: Walls, side: Side): boolean {
  return walls[side] <= AGAINST_M;
}

/** One prop's model, built in the world (null if the prop has none). */
export function fitFurniture(level: BuiltLevel, r: Renderable, art: LevelArt, kit = new Kit(), dress = true): Kit | null {
  const model = furnitureFor(r.id);
  if (!model) return null;
  const f: Fit = { r, s: [r.size[0], r.size[1], r.size[2]], walls: wallsAround(level, r), m: (x) => art.fixedStyle(x), rand: seeded(r.id), dress };
  kit.place([r.center[0], r.center[1], r.center[2]], yawOf(r.quat));
  model(kit, f);
  return kit;
}

/**
 * Every prop with a model, built into one geometry per storey (by `storeyOf`, so a storey hidden hides its furniture),
 * with the small things on top if `dress`; and the ids of the boxes they stand for (the art hides those boxes).
 */
export function buildFurniture(level: BuiltLevel, art: LevelArt, storeyOf: (r: Renderable) => number, dress = true): { kits: Map<number, Kit>; ids: Set<string> } {
  const kits = new Map<number, Kit>();
  const ids = new Set<string>();
  for (const r of level.renderables) {
    if (!r.visible || r.kind !== "solid" || !furnitureFor(r.id)) continue;
    const storey = storeyOf(r);
    let kit = kits.get(storey);
    if (!kit) kits.set(storey, (kit = new Kit()));
    fitFurniture(level, r, art, kit, dress);
    ids.add(r.id);
  }
  return { kits, ids };
}

/** Turn the kit so the model's +z is `front` and its x runs along that side; the model's size [width, height, depth]. */
function orient(k: Kit, f: Fit, front: Side): V3 {
  k.place([f.r.center[0], f.r.center[1], f.r.center[2]], yawOf(f.r.quat) + TURN[front]);
  return front === "pz" || front === "nz" ? [f.s[0], f.s[1], f.s[2]] : [f.s[2], f.s[1], f.s[0]];
}

/** The long sides of a box, the +side first. */
function longSides(f: Fit): [Side, Side] {
  return f.s[0] >= f.s[2] ? ["pz", "nz"] : ["px", "nx"];
}

/** A piece about as deep as it's long (it may turn any way). */
function squarish(f: Fit): boolean {
  return Math.max(f.s[0], f.s[2]) / Math.min(f.s[0], f.s[2]) < 1.25;
}

/** The side with the nearest wall of those given (the first if none is nearer). */
function nearest(f: Fit, sides: readonly Side[]): Side {
  return sides.reduce((best, x) => (f.walls[x] < f.walls[best] ? x : best), sides[0]);
}

/** The side a one-sided piece faces: away from the nearer wall of its long sides (of any side when it's squarish). */
function facing(f: Fit): Side {
  const back = nearest(f, squarish(f) ? ["pz", "nz", "px", "nx"] : longSides(f));
  return f.walls[back] < Infinity ? OPPOSITE[back] : longSides(f)[0];
}

// ---------------------------------------------------------------------------------------------------------------------
// Parts

/** Materials a run of cabinet fronts is drawn in. */
interface FrontMats {
  body: number;
  metal: number;
  black: number;
  glass: number;
}

/** How a run of cabinets from x0 to x1 splits into units about 60 cm wide: their count and width. */
function unitsOf(x0: number, x1: number): { n: number; uw: number } {
  const n = Math.max(1, Math.round((x1 - x0) / 0.6));
  return { n, uw: (x1 - x0) / n };
}

/**
 * A run of cabinet fronts on a face at z = `face` (facing +z, or −z with dir −1), from x0 to x1 and y0 to y1: units
 * about 60 cm wide (unitsOf), each a drawer over a door; a sink's unit two doors, a stove's the oven.
 */
function fronts(k: Kit, x0: number, x1: number, y0: number, y1: number, face: number, dir: 1 | -1, m: FrontMats, special: (unit: number) => "sink" | "stove" | null): void {
  const { n, uw } = unitsOf(x0, x1);
  const T = 0.02;
  const z = face + (dir * T) / 2;
  const gap = 0.004;
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * uw;
    const kind = special(i);
    if (kind === "stove") {
      // The oven: a control strip with knobs, a door with a window and a bar handle.
      const stripH = 0.1;
      k.box([cx, y1 - stripH / 2, z], [uw - gap, stripH - gap, T], m.metal);
      for (let j = 0; j < 4; j++) k.cylinder([cx + (j - 1.5) * (uw / 5), y1 - stripH / 2, face + dir * (T + 0.012)], 0.018, 0.024, "z", m.black, 10);
      const dh = y1 - stripH - y0;
      k.box([cx, y0 + dh / 2, z], [uw - gap, dh - gap, T], m.metal);
      k.box([cx, y0 + dh * 0.52, face + dir * (T + 0.002)], [uw * 0.7, dh * 0.42, 0.004], m.glass);
      k.box([cx, y0 + dh * 0.86, face + dir * (T + 0.016)], [uw * 0.75, 0.018, 0.018], m.metal);
      continue;
    }
    const drawerH = kind === "sink" ? 0 : Math.min(0.16, (y1 - y0) * 0.22);
    if (drawerH > 0) {
      k.box([cx, y1 - drawerH / 2, z], [uw - gap, drawerH - gap, T], m.body);
      k.box([cx, y1 - drawerH / 2, face + dir * (T + 0.01)], [Math.min(0.14, uw * 0.4), 0.014, 0.02], m.metal);
    }
    const dh = y1 - drawerH - y0;
    const doors = kind === "sink" || uw > 0.75 ? 2 : 1;
    const dw = uw / doors;
    for (let j = 0; j < doors; j++) {
      const dx = cx - uw / 2 + (j + 0.5) * dw;
      door(k, dx, y0 + dh / 2, dw - gap, dh - gap, face, dir, m.body);
      // The handle on the door's opening edge (toward the unit's middle for a pair).
      const hx = doors === 2 ? (j === 0 ? dx + dw / 2 - 0.05 : dx - dw / 2 + 0.05) : dx + dw / 2 - 0.05;
      k.box([hx, y0 + dh - 0.1, face + dir * (T + 0.01)], [0.014, 0.1, 0.02], m.metal);
    }
  }
}

/** A shaker door: a slab with a raised frame round a recessed panel, on a face at z = `face` facing dir. */
function door(k: Kit, cx: number, cy: number, w: number, h: number, face: number, dir: 1 | -1, mat: number): void {
  const T = 0.016;
  const R = Math.min(0.06, w * 0.18, h * 0.18);
  k.box([cx, cy, face + (dir * T) / 2], [w, h, T], mat);
  const z = face + dir * (T + 0.004);
  k.box([cx - w / 2 + R / 2, cy, z], [R, h, 0.008], mat);
  k.box([cx + w / 2 - R / 2, cy, z], [R, h, 0.008], mat);
  k.box([cx, cy + h / 2 - R / 2, z], [w - 2 * R, R, 0.008], mat);
  k.box([cx, cy - h / 2 + R / 2, z], [w - 2 * R, R, 0.008], mat);
}

/**
 * A pleated drop of cloth along a side: strips about 10 cm wide, every other one set in 1.2 cm, overlapping so no gap
 * shows; from `top` down to `bottom`, along x (at z = at) or along z (at x = at), its face toward `out`.
 */
function pleats(k: Kit, along: "x" | "z", from: number, to: number, at: number, out: 1 | -1, top: number, bottom: number, mat: number): void {
  const n = Math.max(2, Math.round((to - from) / 0.1));
  const step = (to - from) / n;
  const T = 0.008;
  for (let i = 0; i < n; i++) {
    const c = from + (i + 0.5) * step;
    const inset = i % 2 ? 0.012 : 0;
    const p = at - out * (T / 2 + inset);
    const len = step + 0.02;
    if (along === "x") k.box([c, (top + bottom) / 2, p], [len, top - bottom, T], mat);
    else k.box([p, (top + bottom) / 2, c], [T, top - bottom, len], mat);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Millrace's cover props (Project Redmond R2.3): the mill's machines and fittings. Metal ones (bullets stop at them)
// are closed bodies at every height — a loom's cast frames and harness, a spinning frame's cabinet and creel, a carding
// engine's side plates, square riveted vats, a brick-set boiler — so no gap shows where none can be shot through.

/** Points along an arc of a circle in a plane (centre, radius, from angle a0 to a1, n steps), as [p, q] pairs. */
function arc(cp: number, cq: number, r: number, a0: number, a1: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cp + Math.cos(a) * r, cq + Math.sin(a) * r]);
  }
  return out;
}

/** A rectangle w × h turned `a` about its middle (p, q), as a prism's corners. */
function turned(p: number, q: number, w: number, h: number, a: number): [number, number][] {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, v]) => [p + (u * w * c) / 2 - (v * h * s) / 2, q + (u * w * s) / 2 + (v * h * c) / 2]);
}

/** A thin straight slab across x (from x0 to x1) from a to b in the (y, z) plane, `t` thick either side: a sloping sheet. */
function sheet(k: Kit, a: readonly [number, number], b: readonly [number, number], t: number, x0: number, x1: number, mat: number): void {
  const [dy, dz] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dy, dz) || 1;
  const [ny, nz] = [(-dz / len) * t, (dy / len) * t];
  k.prism(
    [
      [a[0] + ny, a[1] + nz],
      [b[0] + ny, b[1] + nz],
      [b[0] - ny, b[1] - nz],
      [a[0] - ny, a[1] - nz],
    ],
    "x",
    x0,
    x1,
    mat,
  );
}

/** A row of rivet heads along x on a face at z (facing dir), every `step` from x0 to x1. */
function rivets(k: Kit, x0: number, x1: number, y: number, z: number, dir: 1 | -1, step: number, mat: number): void {
  const n = Math.max(1, Math.round((x1 - x0) / step));
  for (let i = 0; i <= n; i++) k.cylinder([x0 + ((x1 - x0) * i) / n, y, z + dir * 0.006], 0.011, 0.012, "z", mat, 6);
}

/**
 * A power loom: cast-iron end frames, a closed base with the cloth roll at the front, the breast beam, the sley and
 * reed, the harness of heddle frames, the top rail, and the warp coming off its beam at the back over the back rest to
 * the heddles. The front faces away from the nearer wall (the weaver's side).
 */
function loom(k: Kit, f: Fit): void {
  const [w, h, d] = orient(k, f, facing(f));
  const [y0, y1] = [-h / 2, h / 2];
  const green = f.m("metal_green");
  const steel = f.m("steel");
  const beam = f.m("wood_dark");
  const warp = f.m("cloth_white");
  const cloth = f.m(f.rand() < 0.5 ? "fabric_grey" : "cloth_check");
  const FR = 0.09;
  const inner = w - 2 * FR;
  const H1 = 0.55 * h;
  // The end frames, a raised rim round each one's outer face.
  for (const sx of [-1, 1]) {
    k.box([sx * (w / 2 - FR / 2 - 0.01), 0, 0], [FR, h, d - 0.02], green);
    const ox = sx * (w / 2 - 0.005);
    k.box([ox, y1 - 0.04, 0], [0.012, 0.06, d - 0.06], green);
    for (const sz of [-1, 1]) k.box([ox, 0, sz * (d / 2 - 0.04)], [0.012, h - 0.04, 0.05], green);
    k.box([ox, y0 + H1, 0], [0.012, 0.05, d - 0.1], green);
    k.box([ox, y0 + H1 * 0.5, d / 4], [0.008, 0.12, 0.2], f.m("metal_yellow"));
  }
  // The base, closed to the floor, set in at the front and back.
  k.box([0, y0 + H1 / 2, 0], [inner + 0.02, H1, d - 0.24], green);
  k.box([0, y0 + 0.03, 0], [inner + 0.02, 0.06, d - 0.16], f.m("paint_black"));
  // At the front: the cloth roll, the cloth down to it from the breast beam, the breast beam.
  const rollY = y0 + 0.3 * h;
  k.cylinder([0, rollY, d / 2 - 0.12], 0.1, inner - 0.04, "x", cloth, 14);
  for (const sx of [-1, 1]) k.cylinder([sx * (inner / 2 - 0.01), rollY, d / 2 - 0.12], 0.04, 0.03, "x", steel, 10);
  // Panels in the base's front, either side of a crank guard.
  for (const sx of [-1, 1]) k.box([sx * inner * 0.25, y0 + H1 * 0.7, d / 2 - 0.115], [inner * 0.42, H1 * 0.3, 0.012], f.m("paint_black"));
  k.box([0, y0 + H1 + 0.04, d / 2 - 0.07], [inner, 0.08, 0.12], beam);
  // The sley and its reed, and a shuttle box at each end.
  const sleyY = y0 + H1 + 0.14;
  k.box([0, sleyY, d / 2 - 0.11], [inner, 0.06, 0.1], beam);
  k.box([0, sleyY + 0.09, d / 2 - 0.13], [inner - 0.05, 0.12, 0.015], steel);
  for (const sx of [-1, 1]) k.box([sx * (inner / 2 - 0.12), sleyY + 0.06, d / 2 - 0.11], [0.22, 0.07, 0.11], beam);
  // The harness: two heddle frames, their wires a sheet between wooden bars, to the top rail.
  const hy0 = y0 + H1 + 0.05;
  const hy1 = y1 - 0.11;
  for (const z of [d / 2 - 0.19, d / 2 - 0.27]) {
    k.box([0, (hy0 + hy1) / 2, z], [inner + 0.02, hy1 - hy0, 0.03], steel);
    for (const y of [hy0 + 0.02, hy1 - 0.02]) k.box([0, y, z], [inner + 0.02, 0.04, 0.045], beam);
  }
  k.box([0, y1 - 0.06, d / 2 - 0.23], [inner + 0.02, 0.12, 0.18], green);
  // At the back: the warp beam (yarn between flanges), the warp up from it to the back rest, then forward to the
  // heddles.
  const wbY = y0 + 0.45 * h;
  const wbZ = -d / 2 + 0.22;
  k.cylinder([0, wbY, wbZ], 0.2, inner - 0.12, "x", warp, 16);
  for (const sx of [-1, 1]) k.cylinder([sx * (inner / 2 - 0.05), wbY, wbZ], 0.24, 0.03, "x", steel, 16);
  const restY = y1 - 0.1;
  const restZ = -d / 2 + 0.08;
  k.box([0, (wbY + restY) / 2, -d / 2 + 0.045], [inner - 0.14, restY - wbY, 0.012], warp);
  k.cylinder([0, restY, restZ], 0.05, inner, "x", steel, 10);
  // The warp from over the back rest forward and down to the heddles' eyes: a thin slab in (y, z), in bands of two
  // shades (its threads, run front to back).
  const bands = Math.max(4, Math.round((inner - 0.14) / 0.12));
  const bw = (inner - 0.14) / bands;
  const shade = f.m("fabric_grey");
  for (let i = 0; i < bands; i++) {
    const x0 = -inner / 2 + 0.07 + i * bw;
    sheet(k, [restY + 0.05, restZ], [(hy0 + hy1) / 2, d / 2 - 0.29], i % 2 ? 0.006 : 0.0065, x0, x0 + bw, i % 2 ? shade : warp);
  }
  if (f.dress) {
    // An oil can on the breast beam's end and a spare pirn or two.
    k.cylinder([inner / 2 - 0.1, y0 + H1 + 0.13, d / 2 - 0.06], 0.035, 0.1, "y", f.m("metal_rust"), 10);
    for (let i = 0; i < 2; i++) k.cylinder([-inner / 2 + 0.2 + i * 0.08, y0 + H1 + 0.1, d / 2 - 0.05], 0.018, 0.14, "x", f.m("wood_stain"), 8);
  }
}

/**
 * A ring spinning frame, worked from both long sides: the headstock (its gear case) at one end, a closed cabinet low
 * down, on each side the spindle rail with its row of bobbins in front of a back board, the ring rail and the drafting
 * rollers, and the creel above with roving bobbins hanging along each side under a top board.
 */
function spinner(k: Kit, f: Fit): void {
  const [w, h, d] = orient(k, f, longSides(f)[0]);
  const [y0, y1] = [-h / 2, h / 2];
  const green = f.m("metal_green");
  const steel = f.m("steel");
  const yarn = f.m("cloth_white");
  const wood = f.m("wood_stain");
  const HEAD = Math.min(0.55, w * 0.12);
  // The headstock at −x: a case with its gear cover; the tail frame at +x.
  k.box([-w / 2 + HEAD / 2 + 0.005, 0, 0], [HEAD, h, d - 0.02], green);
  k.box([-w / 2 + 0.008, y0 + h * 0.55, 0], [0.012, h * 0.6, d - 0.2], f.m("paint_black"));
  k.cylinder([-w / 2 + 0.012, y0 + h * 0.62, 0], 0.22, 0.02, "x", steel, 18);
  k.box([w / 2 - 0.05, 0, 0], [0.09, h, d - 0.02], green);
  const x0 = -w / 2 + HEAD - 0.01;
  const x1 = w / 2 - 0.1;
  const L = x1 - x0;
  const xc = (x0 + x1) / 2;
  // The cabinet low down, and the top board over the creel.
  k.box([xc, y0 + 0.26, 0], [L, 0.52, d - 0.2], green);
  k.box([xc, y1 - 0.02, 0], [L, 0.04, d - 0.3], green);
  for (const sz of [-1, 1]) {
    const face = sz * (d / 2);
    // The spindle rail, a back board behind the bobbins, the ring rail, the drafting rollers' beam.
    k.box([xc, y0 + 0.545, face - sz * 0.075], [L, 0.05, 0.13], steel);
    k.box([xc, y0 + 0.76, face - sz * 0.17], [L, 0.42, 0.04], green);
    k.box([xc, y0 + 0.75, face - sz * 0.085], [L, 0.035, 0.1], steel);
    k.box([xc, y0 + 0.99, face - sz * 0.1], [L, 0.09, 0.15], steel);
    for (const dz of [0.04, 0.09]) k.cylinder([xc, y0 + 1.045, face - sz * dz], 0.018, L - 0.02, "x", f.m("chrome"), 8);
    // The creel's board, roving bobbins hanging in front of it.
    k.box([xc, (y0 + 1.02 + y1 - 0.04) / 2, face - sz * 0.17], [L, y1 - 0.04 - (y0 + 1.02), 0.04], green);
    const nr = Math.max(1, Math.floor(L / 0.2));
    for (let i = 0; i < nr; i++) k.cylinder([x0 + (i + 0.5) * (L / nr), y0 + 1.24, face - sz * 0.1], 0.05, 0.24, "y", yarn, 8);
    // The bobbins on their spindles.
    const nb = Math.max(1, Math.floor(L / 0.075));
    for (let i = 0; i < nb; i++) {
      const x = x0 + (i + 0.5) * (L / nb);
      k.cylinder([x, y0 + 0.66, face - sz * 0.07], 0.011, 0.2, "y", wood, 6);
      k.cylinder([x, y0 + 0.66, face - sz * 0.07], 0.026, 0.13, "y", yarn, 6);
    }
  }
}

/**
 * A carding engine: plain cast side plates its whole length (the arch of the great cylinder in relief on them), the
 * cylinder's and the doffer's covers on top with the flats over the cylinder, the lap on its stand at the feed end
 * and the doffer's comb and calender rolls at the delivery end, a deck between.
 */
function carder(k: Kit, f: Fit): void {
  const [w, h, d] = orient(k, f, longSides(f)[0]);
  const [y0, y1] = [-h / 2, h / 2];
  const green = f.m("metal_green");
  const steel = f.m("steel");
  const black = f.m("paint_black");
  const inner = d - 0.16;
  // The great cylinder's centre and radius; the doffer's.
  const cx = -w * 0.08;
  const R = Math.min(0.62, h * 0.42);
  const cy = y1 - 0.04 - R;
  const dR = R * 0.45;
  const dx = cx + R + dR + 0.08;
  const dy = y0 + h * 0.5;
  for (const sz of [-1, 1]) {
    const face = sz * (d / 2 - 0.05);
    k.box([0, 0, face], [w - 0.02, h - 0.02, 0.08], green);
    // On the plate, the cylinder's and the doffer's ends: steel discs with black spokes and bosses; a drive pulley.
    const out = face + sz * 0.045;
    const disc = (x: number, y: number, r: number, spokes: number) => {
      k.prism(arc(x, y, r, 0, Math.PI * 2, 24).slice(0, 24), "z", out - sz * 0.005, out + sz * 0.003, steel);
      for (let i = 0; i < spokes; i++) {
        const a = (Math.PI * 2 * i) / spokes + 0.3;
        k.prism(turned(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.9, Math.max(0.03, r * 0.12), a), "z", out + sz * 0.003, out + sz * 0.005, black);
      }
      k.cylinder([x, y, out + sz * 0.004], r * 0.18, 0.01, "z", black, 12);
    };
    disc(cx, cy, R - 0.03, 6);
    disc(dx, dy, dR - 0.02, 4);
    disc(-w / 2 + 0.35, y0 + 0.3, 0.2, 4);
  }
  // The deck between the plates, and the covers over the cylinder and the doffer (their top halves).
  k.box([0, y0 + h * 0.42, 0], [w - 0.24, 0.06, inner], green);
  k.prism(arc(cx, cy, R, 0, Math.PI, 16), "z", -inner / 2, inner / 2, steel);
  k.prism(arc(dx, dy, dR, -0.2, Math.PI + 0.2, 10), "z", -inner / 2, inner / 2, steel);
  // The flats: slats across the cylinder's top.
  for (let i = 1; i < 12; i++) {
    const a = (Math.PI * i) / 12;
    k.prism(turned(cx + Math.cos(a) * (R + 0.012), cy + Math.sin(a) * (R + 0.012), 0.08, 0.02, a - Math.PI / 2), "z", -inner / 2 + 0.02, inner / 2 - 0.02, black);
  }
  // The feed end (−x): its guard, the lap on its stand.
  k.box([-w / 2 + 0.11, 0, 0], [0.04, h - 0.02, inner], green);
  k.cylinder([-w / 2 + 0.25, y0 + 0.62, 0], 0.22, inner - 0.04, "z", f.m("cloth_white"), 16);
  k.cylinder([-w / 2 + 0.25, y0 + 0.62, 0], 0.03, inner + 0.02, "z", steel, 8);
  k.box([-w / 2 + 0.22, y0 + 0.2, 0], [0.24, 0.4, inner], green);
  // The delivery end (+x): its guard, the doffer comb, the calender rolls and the trumpet.
  k.box([w / 2 - 0.08, 0, 0], [0.04, h - 0.02, inner], green);
  k.box([w / 2 - 0.05, y0 + h * 0.55, 0], [0.04, 0.05, inner - 0.04], steel);
  for (const yy of [y0 + h * 0.66, y0 + h * 0.72]) k.cylinder([w / 2 - 0.05, yy, 0], 0.03, inner - 0.1, "z", f.m("chrome"), 10);
  k.cylinder([w / 2 - 0.05, y0 + h * 0.62, 0], 0.03, 0.06, "x", f.m("chrome"), 10, true, 0.012);
}

/**
 * A square dye vat of riveted iron plates on a low plinth: corner angles, a band round it with its rivets, a lip, the
 * dye a hand's width under it, a drain cock low on one side, a paddle laid across the rim.
 */
function vat(k: Kit, f: Fit): void {
  const [w, h, d] = f.s;
  const [y0, y1] = [-h / 2, h / 2];
  const plate = f.m("metal_rust");
  const steel = f.m("steel");
  const P = 0.12;
  k.box([0, y0 + P / 2, 0], [w - 0.06, P, d - 0.06], f.m("concrete_wall"));
  const T = 0.04;
  const wy0 = y0 + P;
  const wy1 = y1 - 0.05;
  for (const s of [-1, 1]) {
    k.box([s * (w / 2 - 0.03 - T / 2 + 0.02), (wy0 + wy1) / 2, 0], [T, wy1 - wy0, d - 0.04], plate);
    k.box([0, (wy0 + wy1) / 2, s * (d / 2 - 0.03 - T / 2 + 0.02)], [w - 0.04, wy1 - wy0, T], plate);
  }
  // The floor of the tank and the dye in it.
  k.box([0, wy0 + 0.03, 0], [w - 0.1, 0.06, d - 0.1], plate);
  const dye = (f.r.id.endsWith("2") ? ["paint_red", "fabric_red"] : ["paint_blue", "fabric_blue"])[f.rand() < 0.5 ? 0 : 1];
  k.box([0, y1 - 0.2, 0], [w - 0.1, 0.02, d - 0.1], f.m(dye));
  // The lip, the band and its rivets, the corner angles.
  for (const s of [-1, 1]) {
    k.box([0, y1 - 0.025, s * (d / 2 - 0.02)], [w, 0.05, 0.05], steel);
    k.box([s * (w / 2 - 0.02), y1 - 0.025, 0], [0.05, 0.05, d - 0.1], steel);
    const bandY = (wy0 + wy1) / 2;
    k.box([0, bandY, s * (d / 2 - 0.005)], [w - 0.08, 0.07, 0.012], steel);
    k.box([s * (w / 2 - 0.005), bandY, 0], [0.012, 0.07, d - 0.08], steel);
    rivets(k, -w / 2 + 0.12, w / 2 - 0.12, bandY, s * (d / 2), s as 1 | -1, 0.15, steel);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box([sx * (w / 2 - 0.025), (wy0 + wy1) / 2, sz * (d / 2 - 0.025)], [0.06, wy1 - wy0, 0.06], steel);
  k.cylinder([w / 2 - 0.005, wy0 + 0.12, 0.3], 0.04, 0.05, "x", f.m("metal_yellow"), 10);
  // A paddle laid across the rim.
  k.box([0.25, y1 + 0.02, 0], [0.06, 0.04, d - 0.1], f.m("wood_stain"), 0.12);
  k.box([0.25 - 0.02, y1 + 0.02, d / 2 - 0.35], [0.16, 0.035, 0.3], f.m("wood_stain"), 0.12);
}

/**
 * A boiler in its brick setting: the brickwork round the shell to near its top, a rendered crown over it, the cast
 * front on the end away from the nearer wall with the shell's end, two furnace doors and their ash pits, the gauge
 * glasses and the pressure gauge; on the crown the steam pipe, the stop valve and the safety valve.
 */
function boiler(k: Kit, f: Fit): void {
  const front: Side = f.walls.px >= f.walls.nx ? "px" : "nx";
  const [w, h, d] = orient(k, f, front);
  const [y0, y1] = [-h / 2, h / 2];
  const brick = f.m("brick");
  const iron = f.m("paint_black");
  const steel = f.m("steel");
  const brass = f.m("metal_yellow");
  const FRONT = 0.1;
  k.box([0, y0 + (h - 0.2) / 2, -FRONT / 2], [w - 0.02, h - 0.2, d - FRONT - 0.02], brick);
  k.box([0, y1 - 0.11, (0.02 - FRONT) / 2], [w - 0.24, 0.2, d - FRONT - 0.02], f.m("concrete_wall"));
  // A band of stone along the brickwork's middle.
  for (const s of [-1, 1]) k.box([s * (w / 2 - 0.005), y0 + h * 0.45, -FRONT / 2], [0.012, 0.08, d - FRONT - 0.04], f.m("concrete_wall"));
  // The front: a cast plate, the shell's end and its rivets, the furnace doors over their ash pits.
  const fz = d / 2 - FRONT / 2;
  k.box([0, y0 + (h - 0.02) / 2, fz], [w - 0.02, h - 0.02, FRONT], iron);
  const shellY = y0 + h * 0.62;
  const shellR = Math.min(w / 2 - 0.08, h * 0.36);
  k.cylinder([0, shellY, d / 2 + 0.004], shellR, 0.01, "z", f.m("metal_rust"), 24);
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16;
    k.cylinder([Math.cos(a) * (shellR - 0.04), shellY + Math.sin(a) * (shellR - 0.04), d / 2 + 0.01], 0.012, 0.012, "z", steel, 6);
  }
  for (const sx of [-1, 1]) {
    const fx = sx * w * 0.22;
    k.cylinder([fx, shellY - shellR * 0.35, d / 2 + 0.014], Math.min(0.17, w * 0.13), 0.02, "z", iron, 16);
    k.box([fx, shellY - shellR * 0.35, d / 2 + 0.021], [0.16, 0.025, 0.012], brass);
    k.box([fx, y0 + 0.22, d / 2 + 0.01], [Math.min(0.34, w * 0.26), 0.24, 0.02], iron);
    k.cylinder([sx * (w / 2 - 0.12), shellY + shellR * 0.55, d / 2 + 0.006], 0.018, 0.26, "y", f.m("glass_dark"), 8);
  }
  k.cylinder([0, shellY + shellR * 0.75, d / 2 + 0.008], 0.075, 0.026, "z", f.m("enamel_white"), 16);
  k.cylinder([0, shellY + shellR * 0.75, d / 2 + 0.021], 0.08, 0.008, "z", brass, 16);
  // On the crown: the steam pipe along it, the stop valve and the safety valve.
  const topY = y1 - 0.05;
  k.cylinder([w * 0.18, topY + 0.09, -0.1], 0.06, d - 0.8, "z", steel, 10);
  k.cylinder([w * 0.18, topY + 0.14, d / 2 - 0.5], 0.09, 0.2, "y", iron, 12);
  k.cylinder([w * 0.18, topY + 0.27, d / 2 - 0.5], 0.12, 0.03, "y", steel, 12);
  k.cylinder([-w * 0.18, topY + 0.12, -d / 2 + 0.6], 0.07, 0.24, "y", brass, 10);
  k.box([-w * 0.18 + 0.12, topY + 0.24, -d / 2 + 0.6], [0.3, 0.025, 0.03], iron);
  k.cylinder([0, topY + 0.03, -0.4], 0.22, 0.04, "y", iron, 16);
}

/**
 * The water wheel, the top of it over the pit's floor: a drum of boards (its circle cut by the floor), iron rings at
 * its faces with arms out from the hub, the buckets' boards round its rim, the axle through the hub.
 */
function waterWheel(k: Kit, f: Fit): void {
  const [w, h, d] = orient(k, f, longSides(f)[0]);
  const y0 = -h / 2;
  // The circle through the box's bottom corners and the middle of its top.
  const half = w / 2;
  const c = (h * h - half * half) / (2 * h);
  const R = h - c;
  const cy = y0 + c;
  const a0 = -Math.asin(Math.min(1, c / R));
  // The circle's part over the floor (its ends on the floor).
  const seg = arc(0, cy, R, a0, Math.PI - a0, 40).map(([x, y]) => [x, Math.max(y0, y)] as [number, number]);
  const wood = f.m("wood_dark");
  const iron = f.m("paint_black");
  // The drum of boards to its faces.
  k.prism(seg, "z", -d / 2 + 0.005, d / 2 - 0.005, wood);
  // On each face, an iron band round the rim in short straight pieces, with its bolts.
  for (const sz of [-1, 1]) {
    const z0 = sz * (d / 2 - 0.005);
    const z1 = sz * (d / 2 + 0.01);
    const n = 30;
    for (let i = 0; i < n; i++) {
      const a = a0 + ((Math.PI - 2 * a0) * (i + 0.5)) / n;
      const [px, py] = [Math.cos(a) * (R - 0.07), cy + Math.sin(a) * (R - 0.07)];
      if (py < y0 + 0.08) continue;
      k.prism(turned(px, py, (2 * Math.PI * R) / (2 * n) + 0.02, 0.12, a + Math.PI / 2), "z", z0, z1, iron);
      k.cylinder([px, py, z1], 0.018, 0.012, "z", f.m("steel"), 6);
    }
  }
  // The buckets' boards round the rim (proud a centimetre), from floor to floor over the top.
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const a = a0 + 0.04 + ((Math.PI - 2 * a0 - 0.08) * i) / n;
    const [px, py] = [Math.cos(a) * (R - 0.02), cy + Math.sin(a) * (R - 0.02)];
    if (py < y0 + 0.03) continue;
    k.prism(turned(px, py, 0.06, 0.05, a + Math.PI / 2), "z", -d / 2 + 0.04, d / 2 - 0.04, f.m("planks_raw"));
  }
  // The arms from the hub on each face, the hub and the axle.
  for (const sz of [-1, 1]) {
    const z0 = sz * (d / 2 - 0.005);
    const z1 = sz * (d / 2 + 0.012);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + 0.2;
      const len = R - 0.14;
      const ey = cy + Math.sin(a) * len;
      if (ey < y0 + 0.08) continue;
      k.prism(turned(Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.5, len, 0.09, a), "z", z0, z1, iron);
    }
    k.cylinder([0, cy, sz * (d / 2 + 0.005)], Math.min(0.28, c - 0.01), 0.03, "z", iron, 16);
  }
  k.cylinder([0, cy, 0], Math.min(0.09, c - 0.03), d + 0.05, "z", f.m("steel"), 12);
}

/**
 * A sluice gate across the race: steel guides at its ends, the leaf between them (a thick riveted plate braced across
 * both faces), the head beam over it, and on the beam the gear case, the rack up from the leaf and the hand wheel.
 */
function sluiceGate(k: Kit, f: Fit): void {
  const [w, h, d] = orient(k, f, longSides(f)[0]);
  const [y0, y1] = [-h / 2, h / 2];
  const steel = f.m("steel");
  const rust = f.m("metal_rust");
  const G = 0.14;
  for (const sx of [-1, 1]) k.box([sx * (w / 2 - G / 2 - 0.005), 0, 0], [G, h, d - 0.02], steel);
  const leafTop = y1 - 0.38;
  const inner = w - 2 * G;
  k.box([0, (y0 + leafTop) / 2, 0], [inner + 0.02, leafTop - y0, 0.25], rust);
  for (const yy of [y0 + 0.18, (y0 + leafTop) / 2, leafTop - 0.12]) {
    k.box([0, yy, 0], [inner, 0.08, 0.31], rust);
    for (const sz of [-1, 1]) rivets(k, -inner / 2 + 0.08, inner / 2 - 0.08, yy, sz * 0.155, sz as 1 | -1, 0.12, steel);
  }
  // The head beam, the gear case on it, the rack, the hand wheel (its rim in segments, two spokes).
  k.box([0, y1 - 0.19, 0], [w - 0.02, 0.37, d - 0.04], steel);
  k.box([0.18, y1 + 0.07, 0], [0.3, 0.14, 0.24], f.m("metal_green"));
  k.box([-0.12, y1 + 0.1, 0], [0.07, 0.2, 0.06], steel);
  for (let i = 0; i < 4; i++) k.box([-0.08, y1 + 0.03 + i * 0.045, 0], [0.02, 0.02, 0.05], steel);
  const [hx, hy, hr] = [0.18, y1 + 0.18, 0.14];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * (i + 0.5)) / n;
    k.prism(turned(hx + Math.cos(a) * hr, hy + Math.sin(a) * hr, 2 * hr * Math.sin(Math.PI / n) + 0.01, 0.025, a + Math.PI / 2), "z", 0.13, 0.155, rust);
  }
  for (const a of [0, Math.PI / 2]) k.prism(turned(hx, hy, 2 * hr, 0.02, a), "z", 0.135, 0.15, rust);
}

/**
 * What the dry race has washed into a heap: silt under it, broken boards and a few logs, chunks of concrete, an old
 * bucket on its side. Kept to its box, low and lumpy.
 */
function raceDebris(k: Kit, f: Fit): void {
  const [w, h, d] = f.s;
  const y0 = -h / 2;
  const silt = f.m("ground_dirt");
  // The bank of silt (to above a foot's height all round), and the heap on it in two smaller tiers.
  k.box([0, y0 + 0.16, 0], [w - 0.04, 0.32, d - 0.04], silt);
  k.box([-0.1, y0 + 0.38, 0.05], [w * 0.7, 0.14, d * 0.7], silt, 0.05);
  k.box([0.05, y0 + 0.48, -0.05], [w * 0.4, 0.1, d * 0.45], silt, -0.1);
  // Logs lying on it, one along it and one across.
  k.cylinder([-0.1, y0 + 0.58, 0.25], 0.12, w * 0.75, "x", f.m("bark"), 10);
  k.cylinder([0.55, y0 + 0.62, -0.05], 0.1, d * 0.7, "z", f.m("bark"), 10);
  // Boards across it at angles (kept inside the box by their length).
  const boards = [
    [0.1, y0 + 0.74, 0.0, w * 0.8, 0.22, 0.35],
    [-0.3, y0 + 0.56, -0.25, w * 0.55, 0.18, -0.6],
    [0.3, y0 + 0.45, 0.2, w * 0.45, 0.2, 0.9],
  ] as const;
  for (const [x, y, z, len, bw, yaw] of boards) k.box([x, y, z], [len, 0.035, bw], f.m("planks_raw"), yaw);
  for (const [x, z, sz, yaw] of [[0.7, -0.4, 0.3, 0.4], [-0.75, 0.35, 0.26, -0.3], [-0.5, -0.45, 0.2, 1.0]] as const) k.box([x, y0 + 0.32 + sz / 2, z], [sz, sz, sz * 0.8], f.m("concrete_wall"), yaw);
  k.cylinder([-0.55, y0 + 0.58, -0.3], 0.13, 0.3, "x", f.m("metal_rust"), 12, true, 0.1);
}

/** A plank footbridge: stringers along its sides, sills at its ends, planks across tight together, a curb each side. */
function footbridge(k: Kit, f: Fit): void {
  const [w, h, d] = orient(k, f, longSides(f)[0]);
  const [y0, y1] = [-h / 2, h / 2];
  const dark = f.m("wood_dark");
  const DECK = 0.05;
  for (const sz of [-1, 1]) k.box([0, y0 + (h - DECK) / 2, sz * (d / 2 - 0.07)], [w - 0.02, h - DECK, 0.12], dark);
  for (const sx of [-1, 1]) k.box([sx * (w / 2 - 0.07), y0 + (h - DECK) / 2, 0], [0.12, h - DECK, d - 0.02], dark);
  // Planks across, tight (a few millimetres up or down from each other shows where they meet).
  const n = Math.max(1, Math.round((w - 0.02) / 0.2));
  const pw = (w - 0.02) / n;
  for (let i = 0; i < n; i++) k.box([-w / 2 + 0.01 + (i + 0.5) * pw, y1 - DECK / 2 + (i % 2 ? 0.003 : 0), 0], [pw, DECK, d - 0.02], f.m(i % 3 === 1 ? "wood_stain" : "planks_raw"));
  for (const sz of [-1, 1]) {
    k.box([0, y1 + 0.05, sz * (d / 2 - 0.06)], [w - 0.06, 0.1, 0.09], dark);
    for (let x = -w / 2 + 0.3; x < w / 2 - 0.2; x += 0.9) k.box([x, y0 + (h - DECK) / 2, sz * (d / 2 - 0.005)], [0.08, h - DECK - 0.04, 0.012], f.m("metal_rust"));
  }
}

/**
 * Bales of wool in hessian stacked to fill a box (a cover prop, R2.3, and the yard's: outside.ts): layers no taller
 * than 0.8 m, as many across as fit about 1.2 by 0.8 m, pressed together (no gap to see, drive or stand through), each
 * with two steel straps round it; the top layer one short at a corner when it isn't the only one.
 */
export function baleStack(k: Kit, s: readonly [number, number, number], m: (x: string) => number, rand: () => number): void {
  const [w, h, d] = s;
  const y0 = -h / 2;
  const layers = Math.max(1, Math.ceil(h / 0.8 - 1e-6));
  const lh = h / layers;
  const lengthX = w >= d;
  const nx = Math.max(1, Math.round(w / (lengthX ? 1.2 : 0.8)));
  const nz = Math.max(1, Math.round(d / (lengthX ? 0.8 : 1.2)));
  const [bw, bd] = [w / nx, d / nz];
  const sack = [m("fabric_brown"), m("cardboard")];
  const strap = m("metal_galvanized");
  for (let l = 0; l < layers; l++) {
    const yc = y0 + (l + 0.5) * lh;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        if (layers > 1 && l === layers - 1 && nx * nz > 2 && i === nx - 1 && j === 0) continue;
        const [cx, cz] = [-w / 2 + (i + 0.5) * bw, -d / 2 + (j + 0.5) * bd];
        const yaw = 0;
        // Each a few millimetres into its neighbours.
        const [sx, sz] = [bw + 0.004, bd + 0.004];
        k.box([cx, yc, cz], [sx, lh + 0.004, sz], sack[(i + j + l) % 2 === 0 ? 0 : rand() < 0.3 ? 1 : 0], yaw);
        // The straps round it, across its longer side.
        const alongX = sx >= sz;
        for (const t of [-0.25, 0.25]) {
          const off = t * (alongX ? sx : sz);
          const [ox, oz] = alongX ? [off * Math.cos(yaw), -off * Math.sin(yaw)] : [off * Math.sin(yaw), off * Math.cos(yaw)];
          k.box([cx + ox, yc, cz + oz], alongX ? [0.03, lh, sz + 0.008] : [sx + 0.008, lh, 0.03], strap, yaw);
        }
      }
  }
}

/** Bales stacked in the Bale Store. */
function bales(k: Kit, f: Fit): void {
  baleStack(k, f.s, f.m, f.rand);
}

/**
 * A rack of cloth in bolts, worked from both sides: solid ends, a plinth, shelves and a top board, the bolts lying
 * front to back side by side on each shelf (a second row in the hollows over them), each its own colour.
 */
function boltRack(k: Kit, f: Fit): void {
  const [w, h, d] = orient(k, f, longSides(f)[0]);
  const [y0, y1] = [-h / 2, h / 2];
  const wood = f.m("wood_stain");
  const colours = ["fabric_blue", "fabric_red", "fabric_green", "fabric_brown", "fabric_grey", "cloth_white", "plaid", "cloth_check"].map(f.m);
  const END = 0.05;
  for (const sx of [-1, 1]) k.box([sx * (w / 2 - END / 2 - 0.005), 0, 0], [END, h, d - 0.02], wood);
  k.box([0, 0, 0], [0.05, h - 0.02, d - 0.06], wood);
  const shelves = [y0 + 0.08, y0 + 0.08 + (h - 0.12) / 3, y0 + 0.08 + (2 * (h - 0.12)) / 3];
  k.box([0, y0 + 0.04, 0], [w - 0.02, 0.08, d - 0.04], f.m("wood_dark"));
  for (const sy of shelves.slice(1)) k.box([0, sy - 0.015, 0], [w - 0.1, 0.03, d - 0.04], wood);
  k.box([0, y1 - 0.02, 0], [w - 0.02, 0.04, d - 0.02], wood);
  const r = 0.1;
  const len = d - 0.12;
  for (const sy of shelves)
    for (const half of [-1, 1]) {
      const [x0, x1] = half < 0 ? [-w / 2 + END + 0.01, -0.035] : [0.035, w / 2 - END - 0.01];
      const n = Math.max(1, Math.floor((x1 - x0) / (2 * r + 0.005)));
      const step = (x1 - x0) / n;
      for (let i = 0; i < n; i++) k.cylinder([x0 + (i + 0.5) * step, sy + r, 0], r, len, "z", colours[Math.floor(f.rand() * colours.length)], 10);
      for (let i = 0; i + 1 < n; i++) if (f.rand() < 0.8) k.cylinder([x0 + (i + 1) * step, sy + r + r * 1.72, 0], r, len - 0.04, "z", colours[Math.floor(f.rand() * colours.length)], 10);
    }
}

/**
 * A clerk's desk to work from either side: a plinth, drawers over cupboards on both long sides, a top with a lip; on it
 * a ledger, dockets on a spike, a telephone and a lamp.
 */
function clerkDesk(k: Kit, f: Fit): void {
  const front = facing(f);
  const [w, h, d] = orient(k, f, front);
  const [y0, y1] = [-h / 2, h / 2];
  const body = f.m("wood_stain");
  const mats: FrontMats = { body, metal: f.m("metal_yellow"), black: f.m("paint_black"), glass: f.m("glass_dark") };
  const TOP = 0.04;
  const KICK = 0.08;
  k.box([0, y0 + KICK / 2, 0], [w - 0.08, KICK, d - 0.1], f.m("wood_dark"));
  const [cf, cb] = [d / 2 - 0.03, -d / 2 + 0.03];
  k.box([0, (y0 + KICK + y1 - TOP) / 2, 0], [w - 0.01, h - KICK - TOP, cf - cb], body);
  k.box([0, y1 - TOP / 2, 0], [w, TOP, d], f.m("wood_dark"));
  fronts(k, -w / 2 + 0.005, w / 2 - 0.005, y0 + KICK, y1 - TOP, cf, 1, mats, () => null);
  fronts(k, -w / 2 + 0.005, w / 2 - 0.005, y0 + KICK, y1 - TOP, cb, -1, mats, () => null);
  // A rail along its back edge (stops papers going over).
  k.box([0, y1 + 0.03, -d / 2 + 0.03], [w - 0.1, 0.06, 0.03], f.m("wood_dark"));
  if (f.dress) {
    k.box([-w / 2 + 0.45, y1 + 0.03, 0.05], [0.5, 0.06, 0.36], f.m("fabric_green"), 0.08);
    k.box([-w / 2 + 0.45, y1 + 0.062, 0.05], [0.46, 0.004, 0.32], f.m("paint_white"), 0.08);
    k.cylinder([0, y1 + 0.005, 0.1], 0.06, 0.01, "y", f.m("paint_black"), 10);
    k.cylinder([0, y1 + 0.08, 0.1], 0.004, 0.15, "y", f.m("steel"), 6);
    for (let i = 0; i < 6; i++) k.box([0, y1 + 0.03 + i * 0.012, 0.1], [0.1, 0.003, 0.14], f.m("paint_white"), i * 0.4);
    k.box([w / 2 - 0.35, y1 + 0.035, 0.05], [0.2, 0.07, 0.16], f.m("paint_black"));
    k.cylinder([w / 2 - 0.35, y1 + 0.1, 0.05], 0.025, 0.22, "x", f.m("paint_black"), 8);
    k.cylinder([w / 2 - 0.15, y1 + 0.01, -0.15], 0.07, 0.02, "y", f.m("metal_yellow"), 12);
    k.cylinder([w / 2 - 0.15, y1 + 0.12, -0.15], 0.008, 0.22, "y", f.m("metal_yellow"), 6);
    k.cylinder([w / 2 - 0.15, y1 + 0.27, -0.15], 0.12, 0.09, "y", f.m("metal_green"), 14, true, 0.04);
  }
}

/**
 * A plan chest under a drawing board: a plinth, shallow drawers in rows on both long sides with brass pulls, a top, and
 * on it the board on its stand tilted toward the front; rolled plans, a T-square and a set square.
 */
function planChest(k: Kit, f: Fit): void {
  const front = facing(f);
  const [w, h, d] = orient(k, f, front);
  const [y0, y1] = [-h / 2, h / 2];
  const body = f.m("wood_stain");
  const dark = f.m("wood_dark");
  const brass = f.m("metal_yellow");
  const KICK = 0.08;
  const TOP = 0.035;
  k.box([0, y0 + KICK / 2, 0], [w - 0.06, KICK, d - 0.08], dark);
  k.box([0, (y0 + KICK + y1 - TOP) / 2, 0], [w - 0.01, h - KICK - TOP, d - 0.04], body);
  k.box([0, y1 - TOP / 2, 0], [w, TOP, d], dark);
  const rows = 5;
  const rh = (h - KICK - TOP) / rows;
  const cols = Math.max(1, Math.round(w / 1.0));
  const cw = (w - 0.02) / cols;
  for (const [face, dir] of [[d / 2 - 0.02, 1], [-d / 2 + 0.02, -1]] as const)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x = -w / 2 + 0.01 + (c + 0.5) * cw;
        const y = y0 + KICK + (r + 0.5) * rh;
        k.box([x, y, face + dir * 0.006], [cw - 0.012, rh - 0.01, 0.012], body);
        k.box([x, y + rh * 0.15, face + dir * 0.016], [0.16, 0.022, 0.012], brass);
      }
  // The board on its stand, tilted up toward the back; the drawing pinned to it.
  const bw = w - 0.3;
  const [zf, zb] = [d / 2 - 0.12, -d / 2 + 0.12];
  const rise = Math.min(0.28, (zf - zb) * Math.sin(0.25));
  const boardY = (z: number) => y1 + 0.04 + (rise * (zf - z)) / (zf - zb);
  for (const sx of [-1, 1]) {
    const top = boardY(zb + 0.25) - 0.016;
    k.box([sx * (bw / 2 - 0.1), (y1 + top) / 2, zb + 0.25], [0.05, top - y1, 0.05], dark);
  }
  sheet(k, [boardY(zf), zf], [boardY(zb), zb], 0.015, -bw / 2, bw / 2, f.m("wood_ply"));
  const [pa, pb] = [d / 2 - 0.2, -d / 2 + 0.3];
  sheet(k, [boardY(pa) + 0.018, pa], [boardY(pb) + 0.018, pb], 0.002, -bw / 2 + 0.2, bw / 2 - 0.6, f.m("paint_white"));
  if (f.dress) {
    for (let i = 0; i < 3; i++) k.cylinder([0.6 + i * 0.09, y1 + 0.04, d / 2 - 0.05], 0.035, 0.6 + i * 0.1, "x", f.m(i === 1 ? "cardboard" : "paint_white"), 10);
    sheet(k, [boardY(0.03) + 0.024, 0.03], [boardY(-0.03) + 0.024, -0.03], 0.005, -0.45, 0.45, f.m("wood_table"));
  }
}

/**
 * A mending table: a long top on solid ends, a length of cloth spread over it hanging to the floor down both long
 * sides (pleated), and the menders' things on it: shears, spools, a pin cushion, a lamp.
 */
function mendingTable(k: Kit, f: Fit): void {
  const [w, h, d] = orient(k, f, longSides(f)[0]);
  const [y0, y1] = [-h / 2, h / 2];
  const wood = f.m("wood_table");
  const cloth = f.m(["fabric_grey", "cloth_check", "plaid", "fabric_blue"][Math.floor(f.rand() * 4)]);
  k.box([0, y1 - 0.02, 0], [w, 0.04, d], wood);
  for (const sx of [-1, 1]) k.box([sx * (w / 2 - 0.04), (y0 + y1 - 0.04) / 2, 0], [0.06, h - 0.04, d - 0.06], f.m("wood_stain"));
  k.box([0, y1 + 0.004, 0], [w - 0.3, 0.008, d + 0.01], cloth);
  for (const sz of [-1, 1]) pleats(k, "x", -w / 2 + 0.15, w / 2 - 0.15, sz * (d / 2 + 0.005), sz as 1 | -1, y1, y0 + 0.02, cloth);
  if (f.dress) {
    k.box([-0.5, y1 + 0.015, 0.2], [0.24, 0.012, 0.05], f.m("steel"), 0.3);
    k.box([-0.5, y1 + 0.02, 0.22], [0.24, 0.012, 0.05], f.m("steel"), -0.2);
    for (let i = 0; i < 5; i++) k.cylinder([0.3 + i * 0.09, y1 + 0.04, -0.3], 0.025, 0.07, "y", f.m(["paint_red", "paint_blue", "cloth_white", "fabric_green", "paint_black"][i]), 8);
    k.cylinder([0.9, y1 + 0.03, 0.1], 0.06, 0.05, "y", f.m("fabric_red"), 10);
    k.cylinder([-w / 2 + 0.4, y1 + 0.01, -0.4], 0.08, 0.02, "y", f.m("paint_black"), 12);
    k.cylinder([-w / 2 + 0.4, y1 + 0.13, -0.4], 0.01, 0.24, "y", f.m("steel"), 6);
    k.cylinder([-w / 2 + 0.4, y1 + 0.28, -0.34], 0.1, 0.08, "y", f.m("paint_black"), 14, true, 0.04);
  }
}
