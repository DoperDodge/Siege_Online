// Oregon's cover props as furniture (Phase 10 M6, render/DESIGN.md §9.1): each of the 29 props (exterior.json, D-104)
// drawn as what it is — tables under cloths, the pews, sofas, counters and the island with their doors and drawers,
// the sideboard, the bookcase, the workbench, the washers, chest freezers, beds, the curtained bunks, the wardrobe, the
// game table — built in code (kit.ts) to fill its box, which still collides (and is hidden while the art shows).
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
function seeded(id: string): () => number {
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
  if (/^PROP_DINING_TABLE/.test(id)) return (k, f) => clothTable(k, f, "cloth_check");
  if (/^PROP_MEETING_TABLE/.test(id)) return (k, f) => clothTable(k, f, "cloth_white");
  if (/^PROP_DINING_BENCH/.test(id)) return (k, f) => sofa(k, f, "fabric_blue", true);
  if (/^PROP_GAME_SOFA/.test(id)) return (k, f) => sofa(k, f, "plaid", false);
  if (/^PROP_DINING_CABINET/.test(id)) return (k, f) => counter(k, f, { top: "wood_dark", body: "wood_stain", kick: "wood_dark" });
  if (/^PROP_KITCHEN_COUNTER_N/.test(id)) return (k, f) => counter(k, f, { top: "counter_top", body: "cabinet_green", kick: "paint_black", sink: -0.22, stove: 0.22 });
  if (/^PROP_KITCHEN_COUNTER/.test(id)) return (k, f) => counter(k, f, { top: "counter_top", body: "cabinet_green", kick: "paint_black" });
  if (/^PROP_KITCHEN_ISLAND/.test(id)) return (k, f) => counter(k, f, { top: "wood_table", body: "cabinet_cream", kick: "paint_black", both: true });
  if (/^PROP_GARAGE_BENCH/.test(id)) return (k, f) => counter(k, f, { top: "wood_ply", body: "wood_ply", kick: "wood_stain", vise: true });
  if (/^PROP_MEETING_BENCH/.test(id)) return pews;
  if (/^PROP_MEETING_BOOKCASE/.test(id)) return bookcase;
  if (/^PROP_LAUNDRY_TABLE/.test(id)) return (k, f) => skirtedTable(k, f, "fabric_blue");
  if (/^PROP_SUPPLY_TABLE/.test(id)) return panelTable;
  if (/^PROP_LAUNDRY_WASHERS/.test(id)) return washers;
  if (/^PROP_FREEZER_CHEST/.test(id)) return freezers;
  if (/^PROP_DORMS_BUNKS/.test(id)) return bunks;
  if (/^PROP_DORMS_WARDROBE/.test(id)) return wardrobe;
  if (/^PROP_GAME_TABLE/.test(id)) return gameTable;
  if (/^PROP_MASTER_BED/.test(id)) return (k, f) => bed(k, f, "plaid");
  if (/^PROP_(KIDS|DORMS)_BED/.test(id)) return (k, f) => bed(k, f, ["fabric_blue", "fabric_green", "fabric_red", "fabric_brown"][Math.floor(f.rand() * 4)]);
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

/** Whether a piece facing `front` stands free behind (no wall against its back): its back is finished too. */
function freeBehind(f: Fit, front: Side): boolean {
  return !against(f.walls, OPPOSITE[front]);
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
// Models

/** A table under a cloth to just over the floor (pleated on all four sides). */
function clothTable(k: Kit, f: Fit, cloth: string): void {
  const [w, h, d] = f.s;
  const [y0, y1] = [-h / 2, h / 2];
  const c = f.m(cloth);
  const T = 0.012;
  k.box([0, y1 - T / 2, 0], [w, T, d], c);
  // A rounded hem along the top's edges.
  for (const z of [d / 2 - 0.012, -d / 2 + 0.012]) k.cylinder([0, y1 - 0.012, z], 0.012, w, "x", c, 6);
  for (const x of [w / 2 - 0.012, -w / 2 + 0.012]) k.cylinder([x, y1 - 0.012, 0], 0.012, d, "z", c, 6);
  const bottom = y0 + 0.025;
  const top = y1 - 0.01;
  pleats(k, "x", -w / 2, w / 2, d / 2, 1, top, bottom, c);
  pleats(k, "x", -w / 2, w / 2, -d / 2, -1, top, bottom, c);
  pleats(k, "z", -d / 2, d / 2, w / 2, 1, top, bottom, c);
  pleats(k, "z", -d / 2, d / 2, -w / 2, -1, top, bottom, c);
  if (f.dress) setting(k, f, w, d, y1, cloth === "cloth_white" ? "meeting" : "meal");
}

/**
 * What's laid on a table along its long sides (its top at y): plates and cups for a meal, a jug in the middle; for a
 * meeting, papers and mugs, a jug every couple of metres.
 */
function setting(k: Kit, f: Fit, w: number, d: number, y: number, kind: "meal" | "meeting"): void {
  const long = w >= d;
  const [L, D] = long ? [w, d] : [d, w];
  const at = (a: number, b: number, yy: number): V3 => (long ? [a, yy, b] : [b, yy, a]);
  const n = Math.max(1, Math.floor((L - 0.3) / 0.62));
  const white = f.m("enamel_white");
  for (const side of [-1, 1])
    for (let i = 0; i < n; i++) {
      const a = -L / 2 + 0.15 + (i + 0.5) * ((L - 0.3) / n);
      if (kind === "meal") {
        k.cylinder(at(a, side * (D / 2 - 0.25), y + 0.008), 0.12, 0.016, "y", white, 16);
        k.cylinder(at(a + 0.18, side * (D / 2 - 0.13), y + 0.045), 0.038, 0.09, "y", white, 10);
      } else {
        k.box(at(a, side * (D / 2 - 0.24), y + 0.003), long ? [0.22, 0.006, 0.3] : [0.3, 0.006, 0.22], f.m("paint_white"), (f.rand() - 0.5) * 0.3);
        k.cylinder(at(a + 0.2, side * (D / 2 - 0.12), y + 0.05), 0.036, 0.1, "y", white, 10);
      }
    }
  const jugs = kind === "meal" ? 1 : Math.max(1, Math.round(L / 2));
  for (let j = 0; j < jugs; j++) k.cylinder(at(-L / 2 + ((j + 0.5) * L) / jugs, 0, y + 0.11), 0.07, 0.22, "y", f.m("chrome"), 12, true, 0.055);
}

/** A table with a wooden top and a pleated skirt hiding what's stored under it. */
function skirtedTable(k: Kit, f: Fit, skirt: string): void {
  const [w, h, d] = f.s;
  const [y0, y1] = [-h / 2, h / 2];
  const wood = f.m("wood_table");
  const c = f.m(skirt);
  const T = 0.04;
  k.box([0, y1 - T / 2, 0], [w, T, d], wood);
  const top = y1 - T;
  const bottom = y0 + 0.02;
  const inset = 0.02;
  pleats(k, "x", -w / 2 + inset, w / 2 - inset, d / 2 - inset, 1, top, bottom, c);
  pleats(k, "x", -w / 2 + inset, w / 2 - inset, -d / 2 + inset, -1, top, bottom, c);
  pleats(k, "z", -d / 2 + inset, d / 2 - inset, w / 2 - inset, 1, top, bottom, c);
  pleats(k, "z", -d / 2 + inset, d / 2 - inset, -w / 2 + inset, -1, top, bottom, c);
  if (f.dress) {
    // Folded towels in stacks, and a laundry basket.
    const towels = ["fabric_blue", "fabric_red", "cloth_white", "fabric_green", "fabric_grey"].map(f.m);
    const long = w >= d;
    const L = long ? w : d;
    for (let i = 0; i < 4; i++) {
      const a = -L / 2 + 0.3 + i * 0.4;
      const n = 2 + Math.floor(f.rand() * 4);
      for (let j = 0; j < n; j++) k.box(long ? [a, y1 + 0.02 + j * 0.04, -0.1] : [-0.1, y1 + 0.02 + j * 0.04, a], [0.32, 0.038, 0.24], towels[(i + j) % towels.length]);
    }
    const b: V3 = long ? [L / 2 - 0.4, y1 + 0.15, 0.05] : [0.05, y1 + 0.15, L / 2 - 0.4];
    k.box(b, long ? [0.5, 0.3, 0.36] : [0.36, 0.3, 0.5], f.m("plastic_white"));
    k.box([b[0], b[1] + 0.12, b[2]], long ? [0.44, 0.07, 0.3] : [0.3, 0.07, 0.44], f.m("fabric_blue"));
  }
}

/** A sturdy work table: a thick top on square legs, plywood panels closing the sides between them. */
function panelTable(k: Kit, f: Fit): void {
  const [w, h, d] = f.s;
  const [y0, y1] = [-h / 2, h / 2];
  const top = f.m("wood_ply");
  const frame = f.m("wood_stain");
  const T = 0.045;
  k.box([0, y1 - T / 2, 0], [w, T, d], top);
  const L = 0.07;
  const legH = h - T;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box([sx * (w / 2 - 0.02 - L / 2), y0 + legH / 2, sz * (d / 2 - 0.02 - L / 2)], [L, legH, L], frame);
  // An apron under the top, and panels set in 2 cm, from the floor to the apron.
  const apron = 0.09;
  const ay = y1 - T - apron / 2;
  k.box([0, ay, d / 2 - 0.03], [w - 0.06, apron, 0.02], frame);
  k.box([0, ay, -d / 2 + 0.03], [w - 0.06, apron, 0.02], frame);
  k.box([w / 2 - 0.03, ay, 0], [0.02, apron, d - 0.06], frame);
  k.box([-w / 2 + 0.03, ay, 0], [0.02, apron, d - 0.06], frame);
  const ph = legH - apron - 0.015;
  const py = y0 + 0.015 + ph / 2;
  k.box([0, py, d / 2 - 0.045], [w - 0.1, ph, 0.012], top);
  k.box([0, py, -d / 2 + 0.045], [w - 0.1, ph, 0.012], top);
  k.box([w / 2 - 0.045, py, 0], [0.012, ph, d - 0.1], top);
  k.box([-w / 2 + 0.045, py, 0], [0.012, ph, d - 0.1], top);
  if (f.dress) {
    // Supplies: crates, a cardboard box, a lantern, a jerry can.
    const long = w >= d;
    const at = (a: number, b: number, yy: number): V3 => (long ? [a, yy, b] : [b, yy, a]);
    const L = long ? w : d;
    k.box(at(-L / 2 + 0.35, -0.05, y1 + 0.15), long ? [0.5, 0.3, 0.38] : [0.38, 0.3, 0.5], f.m("wood_ply"));
    k.box(at(-L / 2 + 0.35, -0.05, y1 + 0.302), long ? [0.46, 0.006, 0.34] : [0.34, 0.006, 0.46], f.m("wood_stain"));
    k.box(at(0.05, 0.08, y1 + 0.13), long ? [0.42, 0.26, 0.32] : [0.32, 0.26, 0.42], f.m("cardboard"));
    k.cylinder(at(L / 2 - 0.45, 0, y1 + 0.12), 0.07, 0.24, "y", f.m("metal_bunk"), 10);
    k.box(at(L / 2 - 0.2, -0.1, y1 + 0.16), long ? [0.18, 0.32, 0.3] : [0.3, 0.32, 0.18], f.m("paint_red"));
  }
}

/** Base cabinets under a top: a toe kick, doors and drawers on the front (and the back if it stands free). */
function counter(k: Kit, f: Fit, o: { top: string; body: string; kick: string; sink?: number; stove?: number; both?: boolean; vise?: boolean }): void {
  const front = facing(f);
  const [w, h, d] = orient(k, f, front);
  const [y0, y1] = [-h / 2, h / 2];
  const back = o.both || freeBehind(f, front);
  const mats: FrontMats = { body: f.m(o.body), metal: f.m("chrome"), black: f.m("paint_black"), glass: f.m("glass_dark") };
  const TOP = o.vise ? 0.06 : 0.035;
  const KICK = 0.09;
  // The toe kick, set in 5 cm at the front (and at the back when it shows).
  const kf = d / 2 - 0.05;
  const kb = back ? -d / 2 + 0.05 : -d / 2 + 0.01;
  k.box([0, y0 + KICK / 2, (kf + kb) / 2], [w - 0.02, KICK, kf - kb], f.m(o.kick));
  // The carcass, its fronts' faces 1 cm inside the top's edge.
  const cf = d / 2 - 0.03;
  const cb = back ? -d / 2 + 0.03 : -d / 2 + 0.005;
  const cy0 = y0 + KICK;
  const cy1 = y1 - TOP;
  k.box([0, (cy0 + cy1) / 2, (cf + cb) / 2], [w - 0.01, cy1 - cy0, cf - cb], mats.body);
  k.box([0, y1 - TOP / 2, 0], [w, TOP, d], f.m(o.top));
  // The sink and the stove take the units nearest where they're asked for (a fraction of the run from its middle).
  const [x0, x1] = [-w / 2 + 0.005, w / 2 - 0.005];
  const { n, uw } = unitsOf(x0, x1);
  const unitAt = (frac: number | undefined) => (frac === undefined ? -1 : Math.min(n - 1, Math.max(0, Math.floor((frac * w - x0) / uw))));
  const sinkUnit = unitAt(o.sink);
  const stoveUnit = unitAt(o.stove) === sinkUnit ? -1 : unitAt(o.stove);
  const centre = (i: number) => x0 + (i + 0.5) * uw;
  fronts(k, x0, x1, cy0, cy1, cf, 1, mats, (i) => (i === sinkUnit ? "sink" : i === stoveUnit ? "stove" : null));
  if (back) fronts(k, x0, x1, cy0, cy1, cb, -1, mats, () => null);
  if (sinkUnit >= 0) {
    // A steel sink in the top, and its tap at the back.
    const sx = centre(sinkUnit);
    k.box([sx, y1 + 0.002, 0.02], [Math.min(0.78, uw - 0.04), 0.004, Math.min(0.5, d - 0.16)], mats.metal);
    k.box([sx, y1 + 0.0045, 0.02], [Math.min(0.68, uw - 0.12), 0.003, Math.min(0.4, d - 0.26)], f.m("steel"));
    const tz = -d / 2 + 0.07;
    k.cylinder([sx, y1 + 0.13, tz], 0.016, 0.26, "y", mats.metal, 10);
    k.cylinder([sx, y1 + 0.25, tz + 0.08], 0.013, 0.17, "z", mats.metal, 10);
  }
  if (stoveUnit >= 0) {
    // The hob: four burners on the top.
    const sx = centre(stoveUnit);
    for (const bx of [-0.15, 0.15]) for (const bz of [-0.12, 0.12]) k.cylinder([sx + bx * Math.min(1, uw / 0.6), y1 + 0.006, bz * Math.min(1, d / 0.6)], 0.075, 0.012, "y", mats.black, 14);
  }
  if (f.dress) {
    const glass = f.m("glass_dark");
    if (stoveUnit >= 0) {
      // A pot with its lid on one burner, a kettle on another.
      const sx = centre(stoveUnit);
      const bz = 0.12 * Math.min(1, d / 0.6);
      k.cylinder([sx - 0.15 * Math.min(1, uw / 0.6), y1 + 0.08, -bz], 0.1, 0.13, "y", f.m("steel"), 16);
      k.cylinder([sx - 0.15 * Math.min(1, uw / 0.6), y1 + 0.15, -bz], 0.104, 0.012, "y", f.m("steel"), 16);
      k.cylinder([sx + 0.15 * Math.min(1, uw / 0.6), y1 + 0.085, bz], 0.075, 0.14, "y", f.m("enamel_white"), 14, true, 0.06);
    }
    if (sinkUnit >= 0 && sinkUnit + 1 < n) {
      // A dish rack beside the sink, plates standing in it.
      const rx = centre(sinkUnit + 1);
      k.box([rx, y1 + 0.02, 0], [0.42, 0.04, 0.3], f.m("chrome"));
      for (let i = 0; i < 4; i++) k.cylinder([rx - 0.12 + i * 0.07, y1 + 0.13, 0], 0.11, 0.012, "x", f.m("enamel_white"), 14);
    }
    if (o.top === "counter_top" && sinkUnit < 0) {
      // Jars along the back, a cutting board, a bread box.
      for (let i = 0; i < 3; i++) k.cylinder([-w / 2 + 0.2 + i * 0.13, y1 + 0.08, -d / 2 + 0.12], 0.05, 0.16, "y", i === 1 ? f.m("cardboard") : glass, 12);
      k.box([0.1, y1 + 0.01, 0.02], [0.42, 0.02, 0.28], f.m("wood_table"));
      if (w > 1.2) k.box([w / 2 - 0.3, y1 + 0.1, -d / 2 + 0.2], [0.38, 0.2, 0.24], f.m("wood_stain"));
    }
    if (o.both) {
      // On the island: a fruit bowl and a cutting board.
      k.cylinder([-0.3, y1 + 0.04, 0], 0.17, 0.08, "y", f.m("wood_table"), 16, true, 0.12);
      for (const [fx, fz, c] of [[-0.35, 0.03, "paint_red"], [-0.26, -0.05, "metal_yellow"], [-0.27, 0.07, "fabric_green"]] as const) k.cylinder([fx, y1 + 0.11, fz], 0.04, 0.07, "y", f.m(c), 8);
      k.box([0.5, y1 + 0.012, 0.1], [0.45, 0.024, 0.3], f.m("wood_ply"));
    }
    if (o.body === "wood_stain") {
      // On the sideboard: a lamp and a stack of plates.
      k.cylinder([-w / 2 + 0.25, y1 + 0.08, 0], 0.05, 0.16, "y", f.m("wood_dark"), 12, true, 0.07);
      k.cylinder([-w / 2 + 0.25, y1 + 0.24, 0], 0.16, 0.16, "y", f.m("cloth_white"), 16, true, 0.11);
      for (let i = 0; i < 5; i++) k.cylinder([w / 2 - 0.3, y1 + 0.008 + i * 0.016, 0], 0.12, 0.014, "y", f.m("enamel_white"), 16);
    }
    if (o.vise) for (let i = 0; i < 3; i++) k.cylinder([0.15 + i * 0.2, y1 + 0.07, -d / 2 + 0.15], 0.08, 0.14, "y", f.m(i === 1 ? "paint_blue" : "steel"), 14);
  }
  if (o.vise) {
    // A vise at the front corner, and a red toolbox on the bench.
    const vx = w / 2 - 0.2;
    k.box([vx, y1 + 0.05, d / 2 - 0.08], [0.18, 0.1, 0.12], f.m("metal_bunk"));
    k.box([vx, y1 + 0.06, d / 2 - 0.015], [0.2, 0.06, 0.02], f.m("metal_bunk"));
    k.box([-w / 2 + 0.35, y1 + 0.1, -0.05], [0.45, 0.2, 0.22], f.m("paint_red"));
    k.box([-w / 2 + 0.35, y1 + 0.215, -0.05], [0.2, 0.03, 0.03], f.m("paint_black"));
  }
}

/** Two pews back to back: seats closed to the floor at the front, backrests meeting under a cap rail, solid ends. */
function pews(k: Kit, f: Fit): void {
  const [w, h, d] = orient(k, f, longSides(f)[0]);
  const [y0, y1] = [-h / 2, h / 2];
  const wood = f.m("wood_stain");
  const dark = f.m("wood_dark");
  const END = 0.05;
  const inner = w - 2 * END;
  for (const sx of [-1, 1]) k.box([sx * (w / 2 - END / 2), 0, 0], [END, h, d], dark);
  const seatY = y0 + 0.45;
  const seatD = Math.min(0.44, d / 2 - 0.1);
  const backT = 0.05;
  for (const sz of [-1, 1]) {
    k.box([0, seatY - 0.025, sz * (d / 2 - seatD / 2)], [inner, 0.05, seatD], wood);
    // Under the seat, closed: a panel from the floor up to it, set in 4 cm.
    k.box([0, y0 + (seatY - 0.05 - y0) / 2, sz * (d / 2 - 0.05)], [inner, seatY - 0.05 - y0, 0.02], dark);
    // The backrest, from the seat up to the cap.
    const bz = sz * (d / 2 - seatD - backT / 2);
    k.box([0, (seatY + y1 - 0.04) / 2, bz], [inner, y1 - 0.04 - seatY, backT], wood);
  }
  // Between the backrests, under the seats: closed; the cap rail over the backrests.
  const between = d - 2 * seatD;
  k.box([0, y0 + (seatY - y0) / 2, 0], [inner, seatY - y0, Math.max(0.02, between - 0.02)], dark);
  k.box([0, y1 - 0.02, 0], [inner + 0.02, 0.04, between + 0.04], dark);
}

/** A sofa: a base closed to the floor, seat cushions, arms, a back with cushions; two-sided (back to back) if `double`. */
function sofa(k: Kit, f: Fit, cover: string, double: boolean): void {
  const front = double ? longSides(f)[0] : facing(f);
  const [w, h, d] = orient(k, f, front);
  const [y0, y1] = [-h / 2, h / 2];
  const c = f.m(cover);
  const base = y0 + 0.4;
  const ARM = 0.2;
  const armTop = y0 + Math.min(0.64, h - 0.12);
  // The base, from the floor (a little in at the foot) to under the cushions; the arms.
  k.box([0, y0 + 0.02, 0], [w - 0.06, 0.04, d - 0.06], f.m("wood_dark"));
  k.box([0, (y0 + 0.04 + base) / 2, 0], [w - 0.02, base - y0 - 0.04, d - 0.02], c);
  for (const sx of [-1, 1]) {
    k.box([sx * (w / 2 - ARM / 2), (y0 + 0.04 + armTop) / 2, 0], [ARM, armTop - y0 - 0.04, d], c);
    k.cylinder([sx * (w / 2 - ARM / 2), armTop, 0], ARM / 2, d, "z", c, 10);
  }
  // The back (down the middle of a double), its top rounded.
  const inner = w - 2 * ARM;
  const backT = double ? 0.3 : 0.22;
  const backZ = double ? 0 : -d / 2 + backT / 2;
  const R = backT / 2 - 0.005;
  k.box([0, (base + y1 - backT / 2) / 2, backZ], [inner, y1 - backT / 2 - base, backT], c);
  k.cylinder([0, y1 - backT / 2, backZ], R, inner, "x", c, 12);
  // Seat cushions from the back's face to the front, back cushions leaning on the back.
  const n = Math.max(1, Math.round(inner / 0.7));
  const cw = inner / n;
  const row = (zBack: number, zFront: number) => {
    const dir = Math.sign(zFront - zBack);
    for (let i = 0; i < n; i++) {
      const x = -inner / 2 + (i + 0.5) * cw;
      k.box([x, base + 0.07, (zBack + zFront) / 2], [cw - 0.015, 0.14, Math.abs(zFront - zBack)], c);
      k.box([x, (base + 0.14 + y1 - 0.08) / 2, zBack + dir * 0.07], [cw - 0.03, y1 - 0.08 - base - 0.14, 0.14], c);
    }
  };
  if (double) {
    row(backT / 2, d / 2 - 0.01);
    row(-backT / 2, -d / 2 + 0.01);
  } else row(-d / 2 + backT, d / 2 - 0.01);
}

/** A double-sided low bookcase: shelves of books both ways, a panel down the middle, solid ends. */
function bookcase(k: Kit, f: Fit): void {
  const [w, h, d] = orient(k, f, longSides(f)[0]);
  const [y0, y1] = [-h / 2, h / 2];
  const wood = f.m("wood_stain");
  const dark = f.m("wood_dark");
  const T = 0.025;
  for (const sx of [-1, 1]) k.box([sx * (w / 2 - T / 2), 0, 0], [T, h, d], wood);
  k.box([0, y1 - T / 2, 0], [w, T, d], wood);
  const PLINTH = 0.08;
  k.box([0, y0 + PLINTH / 2, 0], [w - 2 * T, PLINTH, d - 0.06], dark);
  k.box([0, y0 + PLINTH + T / 2, 0], [w - 2 * T, T, d - 0.01], wood);
  const lo = y0 + PLINTH + T;
  const hi = y1 - T;
  k.box([0, (lo + hi) / 2, 0], [w - 2 * T, hi - lo, 0.02], dark);
  const shelf = (lo + hi) / 2;
  k.box([0, shelf, 0], [w - 2 * T, T, d - 0.01], wood);
  const bays = Math.max(1, Math.round((w - 2 * T) / 0.8));
  const bw = (w - 2 * T) / bays;
  for (let i = 1; i < bays; i++) k.box([-w / 2 + T + i * bw, (lo + hi) / 2, 0], [0.02, hi - lo, d - 0.01], wood);
  const colours = ["paint_red", "paint_blue", "paint_green", "fabric_brown", "cabinet_cream", "paint_black", "wood_dark", "fabric_red"].map(f.m);
  for (const [b0, b1] of [
    [lo, shelf - T / 2],
    [shelf + T / 2, hi],
  ])
    for (let i = 0; i < bays; i++)
      for (const sz of [-1, 1]) {
        let x = -w / 2 + T + i * bw + 0.012;
        const end = -w / 2 + T + (i + 1) * bw - 0.012;
        while (x < end - 0.02) {
          const bwid = Math.min(end - x, 0.022 + f.rand() * 0.03);
          if (f.rand() < 0.06) {
            x += bwid; // a gap
            continue;
          }
          const bh = (b1 - b0) * (0.62 + f.rand() * 0.3);
          const bd = Math.min(d / 2 - 0.03, 0.15 + f.rand() * 0.06);
          k.box([x + bwid / 2, b0 + bh / 2, sz * (d / 2 - 0.012 - bd / 2)], [bwid - 0.002, bh, bd], colours[Math.floor(f.rand() * colours.length)]);
          x += bwid;
        }
      }
  if (f.dress) {
    // On top: a plant in its pot, a few books lying flat.
    k.cylinder([-w / 4, y1 + 0.07, 0], 0.09, 0.14, "y", f.m("paint_red"), 14, true, 0.07);
    k.cylinder([-w / 4, y1 + 0.23, 0], 0.15, 0.18, "y", f.m("foliage"), 10, true, 0.02);
    for (let i = 0; i < 3; i++) k.box([w / 4, y1 + 0.015 + i * 0.03, 0], [0.24 - i * 0.02, 0.028, 0.17], colours[i]);
  }
}

/** Washing machines side by side: white boxes with round glass doors and a control strip. */
function washers(k: Kit, f: Fit): void {
  const front = facing(f);
  const [w, h, d] = orient(k, f, front);
  const [y0, y1] = [-h / 2, h / 2];
  const enamel = f.m("enamel_white");
  const chrome = f.m("chrome");
  const glass = f.m("glass_dark");
  const n = Math.max(1, Math.round(w / 0.68));
  const uw = w / n;
  // A dark core inside them all: the gaps between the machines show no light through.
  k.box([0, 0.02, -0.01], [w - 0.04, h - 0.05, d - 0.06], f.m("paint_black"));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * uw;
    k.box([x, y0 + 0.025, -0.01], [uw - 0.03, 0.05, d - 0.04], f.m("paint_black"));
    k.box([x, (y0 + 0.05 + y1) / 2, 0], [uw - 0.012, h - 0.05, d - 0.01], enamel);
    // The control strip along the top front, its dial and the detergent drawer.
    k.box([x, y1 - 0.06, d / 2 - 0.004], [uw - 0.03, 0.1, 0.008], f.m("plastic_white"));
    k.cylinder([x + uw * 0.25, y1 - 0.06, d / 2 + 0.008], 0.028, 0.02, "z", chrome, 14);
    k.box([x - uw * 0.25, y1 - 0.06, d / 2 + 0.002], [uw * 0.28, 0.06, 0.008], enamel);
    // The door: a chrome ring round dark glass.
    const dy = y0 + 0.05 + (h - 0.05) * 0.42;
    const r = Math.min(0.2, uw * 0.32);
    k.cylinder([x, dy, d / 2 + 0.006], r, 0.02, "z", chrome, 24);
    k.cylinder([x, dy, d / 2 + 0.012], r * 0.78, 0.02, "z", glass, 24);
  }
  if (f.dress) k.box([-w / 2 + 0.25, y1 + 0.13, -0.1], [0.14, 0.26, 0.09], f.m("paint_blue"));
}

/** Chest freezers side by side: white bodies, lids with a seal line and a handle, a grille low at the front. */
function freezers(k: Kit, f: Fit): void {
  const front = facing(f);
  const [w, h, d] = orient(k, f, front);
  const [y0, y1] = [-h / 2, h / 2];
  const enamel = f.m("enamel_white");
  const n = Math.max(1, Math.round(w / 1.15));
  const uw = w / n;
  const LID = 0.08;
  k.box([0, 0.02, 0], [w - 0.04, h - 0.05, d - 0.06], f.m("paint_black"));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * uw;
    k.box([x, y0 + 0.025, 0], [uw - 0.06, 0.05, d - 0.06], f.m("paint_black"));
    k.box([x, (y0 + 0.05 + y1 - LID) / 2, 0], [uw - 0.015, h - 0.05 - LID - 0.008, d - 0.015], enamel);
    k.box([x, y1 - LID - 0.004, 0], [uw - 0.02, 0.008, d - 0.02], f.m("rubber"));
    k.box([x, y1 - LID / 2, 0], [uw - 0.008, LID, d - 0.004], enamel);
    k.box([x, y1 - LID / 2, d / 2 + 0.01], [Math.min(0.3, uw * 0.35), 0.03, 0.02], f.m("chrome"));
    k.box([x + uw * 0.25, y0 + 0.13, d / 2 - 0.004], [uw * 0.3, 0.1, 0.008], f.m("steel"));
  }
}

/** A bed: a divan base to the floor, a headboard, the mattress, a blanket draped down its sides, the pillows. */
function bed(k: Kit, f: Fit, blanket: string): void {
  // The head: a short side against a wall, else the first short side.
  // The head: at the nearer wall of its short sides (of any side when it's squarish), else its first short side.
  const shorts: Side[] = f.s[0] >= f.s[2] ? ["px", "nx"] : ["pz", "nz"];
  const head = nearest(f, squarish(f) ? [...shorts, "pz", "nz", "px", "nx"] : shorts);
  const [w, h, d] = orient(k, f, OPPOSITE[head]); // +z is the foot
  const [y0, y1] = [-h / 2, h / 2];
  const BASE = Math.min(0.28, h * 0.46);
  const MAT = Math.min(0.2, h * 0.33);
  const top = y0 + BASE + MAT;
  const c = f.m(blanket);
  const HB = 0.04;
  k.box([0, 0, -d / 2 + HB / 2], [w, h, HB], f.m("wood_stain"));
  k.box([0, y1 - 0.015, -d / 2 + HB / 2], [w, 0.03, HB + 0.02], f.m("wood_dark"));
  // The plinth, set in at the sides and the foot, up against the headboard.
  k.box([0, y0 + 0.02, (HB - 0.035) / 2], [w - 0.07, 0.04, d - HB - 0.035], f.m("wood_dark"));
  k.box([0, y0 + 0.04 + (BASE - 0.04) / 2, HB / 2], [w - 0.02, BASE - 0.04, d - HB - 0.02], f.m("fabric_grey"));
  k.box([0, y0 + BASE + MAT / 2, HB / 2], [w - 0.04, MAT, d - HB - 0.04], f.m("mattress"));
  // The blanket over the foot three quarters, down the sides and the foot.
  const L = (d - HB) * 0.74;
  const zc = d / 2 - 0.005 - L / 2;
  const drop = MAT + 0.12;
  k.box([0, top + 0.02, zc], [w - 0.008, 0.04, L], c);
  for (const sx of [-1, 1]) k.box([sx * (w / 2 - 0.008), top + 0.04 - drop / 2, zc], [0.016, drop, L], c);
  k.box([0, top + 0.04 - drop / 2, d / 2 - 0.008], [w - 0.008, drop, 0.016], c);
  // The sheet folded back over its head edge, and the pillows.
  k.box([0, top + 0.046, zc - L / 2 + 0.08], [w - 0.004, 0.012, 0.16], f.m("cloth_white"));
  const n = w > 1.3 ? 2 : 1;
  const pw = (w - 0.12) / n - 0.06;
  const ph = Math.min(0.09, y1 - top - 0.01);
  for (let i = 0; i < n; i++) k.box([-w / 2 + 0.06 + (i + 0.5) * ((w - 0.12) / n), top + ph / 2, -d / 2 + HB + 0.24], [pw, ph, 0.36], f.m("cloth_white"));
}

/**
 * Bunk beds, one or two side by side: metal frames, two mattresses, panels at the head and foot, curtains hung down
 * the long sides over the lower bunk, guard panels along the upper one, a valance under the lower: no gap anywhere
 * (they're metal: bullets stop at them, so nothing may look see-through).
 */
function bunks(k: Kit, f: Fit): void {
  const front = facing(f);
  const [w, h, d] = orient(k, f, front);
  // Each bunk runs along the box's length (the width of this frame when the front is a long side).
  const len = w;
  const across = d;
  const [y0, y1] = [-h / 2, h / 2];
  const metal = f.m("metal_bunk");
  const n = Math.max(1, Math.round(across / 1.0));
  const bw = across / n;
  const lowY = y0 + 0.42;
  const upY = y0 + Math.min(1.32, h - 0.25);
  const curtains = ["fabric_red", "fabric_green", "fabric_blue"].map(f.m);
  for (let i = 0; i < n; i++) {
    const z0 = -across / 2 + i * bw;
    const zc = z0 + bw / 2;
    const P = 0.05;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box([sx * (len / 2 - P / 2), 0, zc + sz * (bw / 2 - P / 2)], [P, h, P], metal);
    // Head and foot: solid panels between the posts.
    for (const sx of [-1, 1]) k.box([sx * (len / 2 - P / 2), (y0 + 0.02 + y1) / 2, zc], [0.02, h - 0.02, bw - 2 * P], metal);
    // The mattresses on their frames.
    for (const yy of [lowY, upY]) {
      k.box([0, yy - 0.03, zc], [len - 2 * P, 0.06, bw - 0.02], metal);
      k.box([0, yy + 0.08, zc], [len - 2 * P - 0.01, 0.16, bw - 2 * P - 0.01], f.m("mattress"));
      k.box([0, yy + 0.165, zc], [len * 0.62, 0.02, bw - 2 * P], curtains[(i + 1) % 3]);
      k.box([-len / 2 + P + 0.22, yy + 0.2, zc], [0.34, 0.06, bw - 2 * P - 0.1], f.m("cloth_white"));
    }
  }
  // Down each long side: a valance under the lower bunk, a curtain from the upper frame to the lower mattress, the
  // guard panel along the upper bunk to the top.
  for (const sz of [-1, 1]) {
    const face = sz * (across / 2 - 0.02);
    const c = curtains[sz > 0 ? 0 : 1];
    pleats(k, "x", -len / 2 + 0.05, len / 2 - 0.05, face, sz as 1 | -1, lowY - 0.06, y0 + 0.02, c);
    pleats(k, "x", -len / 2 + 0.05, len / 2 - 0.05, face, sz as 1 | -1, upY - 0.06, lowY + 0.14, c);
    k.box([0, (upY + 0.12 + y1 - 0.01) / 2, sz * (across / 2 - 0.025)], [len - 0.1, y1 - 0.01 - upY - 0.12, 0.02], metal);
    k.box([0, upY - 0.03, sz * (across / 2 - 0.025)], [len - 0.1, 0.06, 0.02], metal);
    k.box([0, lowY + 0.1, sz * (across / 2 - 0.025)], [len - 0.1, 0.05, 0.02], metal);
  }
  // A ladder up the front at the foot end.
  const lx = len / 2 - 0.3;
  const lz = across / 2 - 0.005;
  for (const dx of [-0.17, 0.17]) k.box([lx + dx, (y0 + upY + 0.15) / 2, lz], [0.025, upY + 0.15 - y0, 0.01], metal);
  for (let y = y0 + 0.3; y < upY; y += 0.28) k.box([lx, y, lz], [0.34, 0.025, 0.01], metal);
}

/** A wardrobe: a plinth, tall panelled doors, a cornice; doors both ways if it stands free and deep. */
function wardrobe(k: Kit, f: Fit): void {
  const front = facing(f);
  const [w, h, d] = orient(k, f, front);
  const [y0, y1] = [-h / 2, h / 2];
  const wood = f.m("wood_stain");
  const dark = f.m("wood_dark");
  const both = freeBehind(f, front) && d > 1.0;
  const PLINTH = 0.08;
  const CORNICE = 0.07;
  // The plinth, set in 3 cm at the front (and at the back when it has doors there too).
  const pb = both ? -d / 2 + 0.03 : -d / 2;
  k.box([0, y0 + PLINTH / 2, (d / 2 - 0.03 + pb) / 2], [w - 0.04, PLINTH, d / 2 - 0.03 - pb], dark);
  k.box([0, y1 - CORNICE / 2, 0], [w, CORNICE, d], dark);
  const cf = d / 2 - 0.025;
  const cb = both ? -d / 2 + 0.025 : -d / 2;
  const cy0 = y0 + PLINTH;
  const cy1 = y1 - CORNICE;
  k.box([0, (cy0 + cy1) / 2, (cf + cb) / 2], [w - 0.01, cy1 - cy0, cf - cb], wood);
  const n = Math.max(2, Math.round(w / 0.55));
  const dw = (w - 0.03) / n;
  for (const [face, dir] of both ? ([[cf, 1], [cb, -1]] as const) : ([[cf, 1]] as const)) {
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.015 + (i + 0.5) * dw;
      const dh = cy1 - cy0 - 0.02;
      door(k, x, cy0 + 0.01 + dh * 0.32, dw - 0.006, dh * 0.62, face, dir, wood);
      door(k, x, cy0 + 0.01 + dh * 0.82, dw - 0.006, dh * 0.34, face, dir, wood);
      const hx = i % 2 ? x - dw / 2 + 0.05 : x + dw / 2 - 0.05;
      k.box([hx, cy0 + dh * 0.6, face + dir * 0.03], [0.015, 0.14, 0.02], f.m("chrome"));
    }
  }
}

/** A game table: a green felt top inside cushioned rails, a deep apron and a solid base. */
function gameTable(k: Kit, f: Fit): void {
  const [w, h, d] = f.s;
  const [y0, y1] = [-h / 2, h / 2];
  const wood = f.m("wood_dark");
  const RAIL = 0.07;
  const felt = y1 - 0.035;
  k.box([0, felt - 0.01, 0], [w - 2 * RAIL + 0.01, 0.02, d - 2 * RAIL + 0.01], f.m("felt_green"));
  for (const sz of [-1, 1]) k.box([0, y1 - 0.035, sz * (d / 2 - RAIL / 2)], [w, 0.07, RAIL], wood);
  for (const sx of [-1, 1]) k.box([sx * (w / 2 - RAIL / 2), y1 - 0.035, 0], [RAIL, 0.07, d - 2 * RAIL], wood);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cylinder([sx * (w / 2 - RAIL), y1 + 0.001, sz * (d / 2 - RAIL)], 0.04, 0.004, "y", f.m("paint_black"), 12);
  const apron = 0.16;
  k.box([0, y1 - 0.07 - apron / 2, 0], [w - 0.02, apron, d - 0.02], f.m("wood_stain"));
  const baseTop = y1 - 0.07 - apron;
  k.box([0, (y0 + baseTop) / 2, 0], [w - 0.1, baseTop - y0, d - 0.1], wood);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box([sx * (w / 2 - 0.06), (y0 + baseTop) / 2, sz * (d / 2 - 0.06)], [0.1, baseTop - y0, 0.1], f.m("wood_stain"));
}
