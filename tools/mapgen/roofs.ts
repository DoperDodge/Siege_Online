// Roofs (DESIGN §5.8). A record covers the footprint of the storey under it (the storey whose walls stop at its
// eave) inside its rectangles, where no storey above stands and no roof listed before it covers. Flat: a
// HARD_FLOOR slab with its top at the eave, cut back where walls run up into it, as a floor is. Gable and mono
// (one rectangle, on the outer faces of the walls): ramps (the LevelDef's 0.2 m slabs) from the eave lines up to
// the ridge, or from the low side up, reaching OVERHANG_M past the eaves and past an end nothing closes; a
// ceiling slab at the eave unless `ceiling` is false; and steps closing each end of the roof that nothing else
// closes (a storey above, or a roof beside it at least as high). With no ceiling the room below looks up into
// the roof, and the walls under it are raised to it in steps instead.
import { greedyRects, type Rect } from "./grid.js";
import type { Floor } from "./research.js";
import { CELL_M, fillBox, storeyOfBox, type RoomsResult } from "./rooms.js";
import type { Layout } from "./schema.js";
import type { Solid } from "./walls.js";

/** The builder's ramp thickness (game/shared/src/level/builder.ts addRamp). */
export const RAMP_T = 0.2;
/** How far a pitched roof reaches past its eaves, and past an end nothing closes. */
const OVERHANG_M = 0.15;
/**
 * The height of each step filling a gable end or raising a wall: no more than the ramp is thick, so a step's
 * top corner, at the roof's underside on one side, stays inside the ramp on the other.
 */
const STEP_M = 0.2;
/** A gap between a wall's top and the roof thinner than this is left (a wall just under an eave). */
const GAP_M = 0.15;
/** A box the roof raises reaches this close to the eave: lower ones (sills, barricades) have a box over them. */
const RAISE_FROM_M = 0.25;

export interface Ramp {
  id: string;
  /** The middle of the top surface's low edge. */
  start: [number, number, number];
  /** The way it rises: 0 north (−z), 90 west (−x). */
  yawDeg: number;
  /** Along the slope. */
  length: number;
  angleDeg: number;
  width: number;
  surface: "HARD_FLOOR";
  label?: string;
}

type RoofDef = Layout["roofs"][number];
type Side = "N" | "E" | "S" | "W";

/** A pitched roof's geometry: it slopes along `axis` (0: x, 2: z) between eaves a0 and a1; its ends are b0 and b1 along the other axis. */
interface Pitch {
  axis: 0 | 2;
  a0: number;
  a1: number;
  b0: number;
  b1: number;
  /** Where the underside is at the eave: both sides (a gable), or the low side (a mono). */
  low: "both" | "a0" | "a1";
  tan: number;
  cos: number;
  /** Each end of the roof (and a mono's high side) is closed by something beside it, or left open. */
  open: Partial<Record<Side, boolean>>;
}

export interface Roof {
  def: RoofDef;
  storey: Floor;
  /** The storeys standing on that one: what they stand over closes a roof's end. */
  above: Floor[];
  eave: number;
  slab: number;
  /** Its rectangles, metres. */
  rects: Rect[];
  /** The plan cells it covers, on its storey's plan grid. */
  cells: Uint8Array;
  pitch?: Pitch;
}

export interface RoofsResult {
  roofs: Roof[];
  solids: Solid[];
  ramps: Ramp[];
  errors: string[];
  warnings: string[];
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const sideOf = (p: Pitch, end: "a0" | "a1" | "b0" | "b1"): Side =>
  p.axis === 0 ? ({ a0: "W", a1: "E", b0: "N", b1: "S" } as const)[end] : ({ a0: "N", a1: "S", b0: "W", b1: "E" } as const)[end];

/** How far into the roof from its eave (both eaves for a gable, the low one for a mono) a point is, along the slope. */
function inward(p: Pitch, a: number): number {
  return p.low === "both" ? Math.min(a - p.a0, p.a1 - a) : p.low === "a0" ? a - p.a0 : p.a1 - a;
}

/** The underside's height at (x, z) (a flat roof's slab bottom). */
export function underside(roof: Roof, x: number, z: number): number {
  const p = roof.pitch;
  return p ? roof.eave + p.tan * Math.max(0, inward(p, p.axis === 0 ? x : z)) : roof.eave - roof.slab;
}

/** The top surface's height at (x, z). */
export function topOf(roof: Roof, x: number, z: number): number {
  const p = roof.pitch;
  return p ? underside(roof, x, z) + RAMP_T / p.cos : roof.eave;
}

/**
 * Where along the slope the underside is above `y`, as [from, to] between the eaves (null for nowhere): the
 * across extent of a step at that height.
 */
function aboveAt(p: Pitch, eave: number, y: number): [number, number] | null {
  const m = Math.max(0, (y - eave) / p.tan);
  const [from, to] = p.low === "both" ? [p.a0 + m, p.a1 - m] : p.low === "a0" ? [p.a0 + m, p.a1] : [p.a0, p.a1 - m];
  return to - from > 1e-6 ? [from, to] : null;
}

export function compileRoofs(layout: Layout, rooms: RoomsResult, wallSolids: Solid[]): RoofsResult {
  const k = layout.units.mPerU;
  const d = layout.defaults;
  const storeys = layout.storeys;
  const errors: string[] = [];
  const warnings: string[] = [];
  const solids: Solid[] = [];
  const ramps: Ramp[] = [];
  const roofs: Roof[] = [];
  /** Where a storey's walls stop: the next floor, or the default wall height on the top storey. */
  const wallTop = (i: number) => (storeys[i + 1] ? storeys[i + 1].floorY : storeys[i].floorY + d.wallHeightM);
  const claimed = new Map<Floor, Uint8Array>();
  const pierced = new Map<Floor, Uint8Array>();

  // ---- What each roof covers, in order: the storey's footprint inside its rectangles, less the storeys above
  // and the roofs before it.
  for (const def of layout.roofs) {
    const si = storeys.findIndex((s, i) => !s.underground && Math.abs(wallTop(i) - def.eaveY) < 1e-6);
    if (si < 0) {
      errors.push(`${def.id}: no storey's walls stop at its eave (${def.eaveY} m)`);
      continue;
    }
    const storey = storeys[si];
    const plan = rooms.plans.get(storey.id);
    if (!plan) {
      warnings.push(`${def.id}: ${storey.id} isn't compiled, so no roof over it`);
      continue;
    }
    const g = plan.grid;
    const above = storeys.slice(si + 1).map((s) => s.id).filter((f) => rooms.plans.has(f));
    const rects = def.rects.map((r): Rect => [Math.min(r[0], r[2]) * k, Math.min(r[1], r[3]) * k, Math.max(r[0], r[2]) * k, Math.max(r[1], r[3]) * k]);
    const taken = claimed.get(storey.id) ?? claimed.set(storey.id, new Uint8Array(g.w * g.h)).get(storey.id)!;
    const cells = new Uint8Array(g.w * g.h);
    for (const r of rects) {
      // The cells whose centres are inside the rectangle.
      const i0 = Math.max(0, Math.ceil((r[0] - g.x0) / CELL_M - 0.5));
      const i1 = Math.min(g.w, Math.ceil((r[2] - g.x0) / CELL_M - 0.5));
      const j0 = Math.max(0, Math.ceil((r[1] - g.y0) / CELL_M - 0.5));
      const j1 = Math.min(g.h, Math.ceil((r[3] - g.y0) / CELL_M - 0.5));
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const c = j * g.w + i;
          if (g.cells[c] === 2 || taken[c]) continue;
          const [x, z] = [g.x0 + (i + 0.5) * CELL_M, g.y0 + (j + 0.5) * CELL_M];
          if (above.some((f) => !rooms.plans.get(f)!.grid.outside(x, z))) continue;
          cells[c] = 1;
          taken[c] = 1;
        }
      }
    }
    const roof: Roof = { def, storey: storey.id, above, eave: def.eaveY, slab: (storeys[si + 1] ?? storey).slabM, rects, cells };
    if (!cells.some((c) => c === 1)) warnings.push(`${def.id}: covers nothing (the storeys above and the roofs before it cover its rectangles)`);
    if (def.shape !== "flat") {
      const pitchDeg = def.pitchDeg;
      if (rects.length !== 1) errors.push(`${def.id}: a ${def.shape} roof is one rectangle`);
      if (pitchDeg === undefined || !(pitchDeg > 0 && pitchDeg < 60)) errors.push(`${def.id}: a ${def.shape} roof needs pitchDeg between 0 and 60`);
      if (def.shape === "gable" ? !def.ridge : !def.low) errors.push(`${def.id}: a ${def.shape} roof needs ${def.shape === "gable" ? "ridge" : "low"}`);
      if (rects.length === 1 && pitchDeg !== undefined && pitchDeg > 0 && pitchDeg < 60 && (def.shape === "gable" ? def.ridge : def.low)) {
        const [x0, z0, x1, z1] = rects[0];
        const alongX = def.shape === "gable" ? def.ridge === "EW" : def.low === "N" || def.low === "S";
        const a = (pitchDeg * Math.PI) / 180;
        roof.pitch = {
          axis: alongX ? 2 : 0,
          ...(alongX ? { a0: z0, a1: z1, b0: x0, b1: x1 } : { a0: x0, a1: x1, b0: z0, b1: z1 }),
          low: def.shape === "gable" ? "both" : def.low === "W" || def.low === "N" ? "a0" : "a1",
          tan: Math.tan(a),
          cos: Math.cos(a),
          open: {},
        };
        // A pitched roof's eaves rest on the storey: most of its rectangle is the footprint.
        let n = 0;
        let inside = 0;
        for (let z = z0 + CELL_M / 2; z < z1; z += 4 * CELL_M) {
          for (let x = x0 + CELL_M / 2; x < x1; x += 4 * CELL_M) {
            n++;
            if (!g.outside(x, z)) inside++;
          }
        }
        if (inside < 0.97 * n) warnings.push(`${def.id}: ${Math.round((100 * (n - inside)) / n)}% of its rectangle is off ${storey.id}'s footprint`);
      }
    }
    if (def.shape === "flat" && !def.ceiling) warnings.push(`${def.id}: a flat roof is its own ceiling (ceiling: false does nothing)`);
    roofs.push(roof);
  }

  /** Is (x, z) inside a roof's cover: a pitched roof's rectangle, a flat roof's cells? */
  const covers = (o: Roof, x: number, z: number) => {
    if (o.pitch) return o.rects.some((r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]);
    const g = rooms.plans.get(o.storey)!.grid;
    const i = g.index(x, z);
    return i >= 0 && o.cells[i] === 1;
  };
  /**
   * How high what stands beside a roof at (x, z) reaches: a storey above (no limit), else the highest other roof.
   * `ceiled`: only roofs with a ceiling count (the space under one without is open to the room below it, so it
   * doesn't close the roof space over a ceiling).
   */
  const besideTop = (self: Roof, x: number, z: number, ceiled = false) => {
    if (self.above.some((f) => !rooms.plans.get(f)!.grid.outside(x, z))) return Infinity;
    let top = -Infinity;
    for (const o of roofs) if (o !== self && (!ceiled || !o.pitch || o.def.ceiling) && covers(o, x, z)) top = Math.max(top, topOf(o, x, z));
    return top;
  };

  for (const roof of roofs) {
    const { def, eave } = roof;
    const g = rooms.plans.get(roof.storey)!.grid;
    const y0 = eave - roof.slab;
    // ---- The slab (a flat roof, or a pitched roof's ceiling): its cells less where walls run up into it.
    if (!roof.pitch || def.ceiling) {
      let pierce = pierced.get(roof.storey);
      if (!pierce) {
        const grid = g.blank();
        for (const b of wallSolids) {
          if (b.drawOnly || storeyOfBox(layout, b) !== roof.storey) continue;
          if (b.center[1] + b.size[1] / 2 > y0 + 0.01 && b.center[1] - b.size[1] / 2 < eave - 0.01) fillBox(grid, b);
        }
        pierced.set(roof.storey, (pierce = grid.cells));
      }
      const deck = (c: number) => roof.cells[c] === 1 && pierce![c] !== 1;
      const mine = greedyRects(g.w, g.h, deck).map((c, i): Solid => {
        const [x0, z0, x1, z1] = [g.x0 + c[0] * CELL_M, g.y0 + c[1] * CELL_M, g.x0 + c[2] * CELL_M, g.y0 + c[3] * CELL_M];
        return {
          id: roof.pitch ? `${def.id}.ceiling#${i}` : `${def.id}#${i}`,
          center: [r4((x0 + x1) / 2), r4((y0 + eave) / 2), r4((z0 + z1) / 2)],
          size: [r4(x1 - x0), r4(eave - y0), r4(z1 - z0)],
          surface: "HARD_FLOOR",
        };
      });
      const area = (s: Solid) => s.size[0] * s.size[2];
      if (!roof.pitch && mine.length) mine.reduce((a, b) => (area(b) > area(a) ? b : a)).label = def.callout;
      solids.push(...mine);
    }
    const p = roof.pitch;
    if (!p) continue;

    // ---- Which ends something closes: sampled a cell past the edge, along its whole length.
    const across = (a: number, b: number): [number, number] => (p.axis === 0 ? [a, b] : [b, a]);
    const n = Math.max(1, Math.ceil((p.a1 - p.a0) / CELL_M));
    const step = (p.a1 - p.a0) / n;
    const besideEnd = (b: number, ceiled = false) => Array.from({ length: n }, (_, i) => besideTop(roof, ...across(p.a0 + (i + 0.5) * step, b), ceiled));
    const ends = (["b0", "b1"] as const).map((end) => {
      const b = end === "b0" ? p.b0 - CELL_M / 2 : p.b1 + CELL_M / 2;
      const beside = besideEnd(b);
      p.open[sideOf(p, end)] = beside.every((t) => t < eave + 0.01);
      // Over a ceiling, the end steps stand wherever a roof without one is all that's beside (its room sees in).
      return { end, beside: def.ceiling ? besideEnd(b, true) : beside };
    });
    if (p.low !== "both") {
      // A mono roof's high side stands against something taller (the walls under it stop at the eave).
      const high = p.low === "a0" ? "a1" : "a0";
      const at = high === "a1" ? p.a1 + CELL_M / 2 : p.a0 - CELL_M / 2;
      const m = Math.max(1, Math.ceil((p.b1 - p.b0) / CELL_M));
      const top = eave + (p.a1 - p.a0) * p.tan;
      const closed = Array.from({ length: m }, (_, i) => p.b0 + (i + 0.5) * ((p.b1 - p.b0) / m)).every((b) => besideTop(roof, ...across(at, b)) >= top);
      p.open[sideOf(p, high)] = !closed;
      if (!closed) warnings.push(`${def.id}: its high ${sideOf(p, high)} side stands against nothing as tall, and stays open`);
    }

    // ---- The ramps: from each eave (the low one of a mono) up to the ridge (the high side), overhanging the
    // eave, and the ends nothing closes.
    const lo = p.b0 - (p.open[sideOf(p, "b0")] ? OVERHANG_M : 0);
    const hi = p.b1 + (p.open[sideOf(p, "b1")] ? OVERHANG_M : 0);
    const run = p.low === "both" ? (p.a1 - p.a0) / 2 : p.a1 - p.a0;
    const startY = eave + RAMP_T / p.cos - OVERHANG_M * p.tan;
    const ramp = (from: "a0" | "a1"): Ramp => {
      const a = from === "a0" ? p.a0 - OVERHANG_M : p.a1 + OVERHANG_M;
      const [x, z] = across(a, (lo + hi) / 2);
      // Rising toward +x is yaw −90, toward −x 90, toward +z 180, toward −z 0.
      const yawDeg = p.axis === 0 ? (from === "a0" ? -90 : 90) : from === "a0" ? 180 : 0;
      return { id: `${def.id}.${sideOf(p, from)}`, start: [r4(x), r4(startY), r4(z)], yawDeg, length: r4((run + OVERHANG_M) / p.cos), angleDeg: def.pitchDeg!, width: r4(hi - lo), surface: "HARD_FLOOR" };
    };
    const mine = p.low === "both" ? [ramp("a0"), ramp("a1")] : [ramp(p.low)];
    mine[0].label = def.callout;
    ramps.push(...mine);

    // ---- The ends: steps on the end wall up to the underside, where nothing beside covers them.
    if (def.ceiling) {
      const t = d.wallM.ext;
      for (const { end, beside } of ends) {
        const [b0, b1] = end === "b0" ? [p.b0, p.b0 + t] : [p.b1 - t, p.b1];
        for (let s = 0; ; s++) {
          const y = eave + s * STEP_M;
          const span = aboveAt(p, eave, y);
          if (!span) break;
          // The runs of samples nothing beside covers up to this step's top, cut to where the underside is above it.
          const pieces: [number, number][] = [];
          for (let i = 0; i < n; ) {
            if (beside[i] >= y + STEP_M - 1e-6) {
              i++;
              continue;
            }
            let j = i;
            while (j + 1 < n && beside[j + 1] < y + STEP_M - 1e-6) j++;
            const [from, to] = [Math.max(span[0], p.a0 + i * step), Math.min(span[1], p.a0 + (j + 1) * step)];
            if (to - from > 0.02) pieces.push([from, to]);
            i = j + 1;
          }
          pieces.forEach(([from, to], q) => {
            const [x0, z0] = across(from, b0);
            const [x1, z1] = across(to, b1);
            solids.push({
              id: `${def.id}.${sideOf(p, end)}#${s}${pieces.length > 1 ? `.${q}` : ""}`,
              center: [r4((x0 + x1) / 2), r4(y + STEP_M / 2), r4((z0 + z1) / 2)],
              size: [r4(x1 - x0), STEP_M, r4(z1 - z0)],
              surface: "HARD_WALL",
            });
          });
        }
      }
      continue;
    }

    // ---- No ceiling: every wall under the roof (and the boxes on its top, headers and soft walls) raised to the
    // underside in steps. Its ends are left to what stands under them.
    for (const { end, beside } of ends) {
      if (beside.some((t) => t < eave + 0.01)) warnings.push(`${def.id}: has no ceiling, and its ${sideOf(p, end)} end is closed only by the walls under it`);
    }
    const [rx0, rz0, rx1, rz1] = roof.rects[0];
    for (const b of wallSolids) {
      if (b.drawOnly || b.bodiesOnly || b.surface === "BARRICADE" || b.surface === "WINDOW" || storeyOfBox(layout, b) !== roof.storey) continue;
      const top = b.center[1] + b.size[1] / 2;
      if (top < eave - RAISE_FROM_M) continue;
      const [cx0, cz0] = [Math.max(rx0, b.center[0] - b.size[0] / 2), Math.max(rz0, b.center[2] - b.size[2] / 2)];
      const [cx1, cz1] = [Math.min(rx1, b.center[0] + b.size[0] / 2), Math.min(rz1, b.center[2] + b.size[2] / 2)];
      if (cx1 - cx0 < 0.1 || cz1 - cz0 < 0.1) continue;
      const [c0, c1] = p.axis === 0 ? [cx0, cx1] : [cz0, cz1];
      // Its highest underside: at its point nearest the ridge (the high side).
      const ridge = p.low === "both" ? Math.min(Math.max((p.a0 + p.a1) / 2, c0), c1) : p.low === "a0" ? c1 : c0;
      const highest = eave + p.tan * inward(p, ridge);
      if (highest - top < GAP_M) continue;
      for (let s = 0; top + s * STEP_M < highest; s++) {
        const y = top + s * STEP_M;
        const span = aboveAt(p, eave, y);
        const [from, to] = span ? [Math.max(span[0], c0), Math.min(span[1], c1)] : [0, 0];
        if (to - from < 0.02) break;
        const [x0, z0, x1, z1] = p.axis === 0 ? [from, cz0, to, cz1] : [cx0, from, cx1, to];
        solids.push({
          id: `${def.id}.over:${b.id}#${s}`,
          center: [r4((x0 + x1) / 2), r4(y + STEP_M / 2), r4((z0 + z1) / 2)],
          size: [r4(x1 - x0), STEP_M, r4(z1 - z0)],
          surface: "HARD_WALL",
        });
      }
    }
  }
  return { roofs, solids, ramps, errors, warnings };
}

interface Box {
  id: string;
  center: [number, number, number];
  size: [number, number, number];
  surface: string;
  drawOnly?: boolean;
  bodiesOnly?: boolean;
}

interface Room {
  id: string;
  storey: string;
  rects: [number, number, number, number][];
}

/**
 * The roofs against the assembled level (DESIGN §9.2 check 8 and M4's tests): every room has something over it
 * (a floor, a hatch, a soft floor, a roof; through a stairwell or the Cat Walk's well to what is over that);
 * every eave rests on a wall or a slab at its height; and no roof rises over the sill of a window or door that
 * looks out onto it.
 */
export function checkRoofs(layout: Layout, roofs: Roof[], solids: Box[], rooms: Room[]): string[] {
  const errors: string[] = [];
  const lo = (b: Box, a: number) => b.center[a] - b.size[a] / 2;
  const hi = (b: Box, a: number) => b.center[a] + b.size[a] / 2;
  const things = solids.filter((b) => !b.drawOnly && !b.bodiesOnly);
  // A 2 m bucket grid over the boxes, so each probe only meets its neighbours.
  const BUCKET = 2;
  const buckets = new Map<string, Box[]>();
  for (const b of things) {
    for (let i = Math.floor(lo(b, 0) / BUCKET); i <= Math.floor(hi(b, 0) / BUCKET); i++) {
      for (let j = Math.floor(lo(b, 2) / BUCKET); j <= Math.floor(hi(b, 2) / BUCKET); j++) {
        const key = `${i},${j}`;
        (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(b);
      }
    }
  }
  const near = (x: number, z: number) => buckets.get(`${Math.floor(x / BUCKET)},${Math.floor(z / BUCKET)}`) ?? [];
  const holds = (b: Box, x: number, z: number) => x >= lo(b, 0) && x <= hi(b, 0) && z >= lo(b, 2) && z <= hi(b, 2);
  const pitched = roofs.filter((r) => r.pitch);
  const inRect = (r: Roof, x: number, z: number) => r.rects.some((q) => x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3]);

  // ---- Cover: spots every half metre over each room's rectangles.
  const covering = new Set(["HARD_FLOOR", "SOFT_FLOOR", "HATCH"]);
  for (const room of rooms) {
    const floorY = layout.storeys.find((s) => s.id === room.storey)?.floorY;
    if (floorY === undefined) continue;
    let total = 0;
    const open: [number, number][] = [];
    for (const [x0, z0, x1, z1] of room.rects) {
      const [nx, nz] = [Math.max(1, Math.round((x1 - x0) / 0.5)), Math.max(1, Math.round((z1 - z0) / 0.5))];
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const [x, z] = [x0 + ((i + 0.5) * (x1 - x0)) / nx, z0 + ((j + 0.5) * (z1 - z0)) / nz];
          total++;
          const over = near(x, z).some((b) => covering.has(b.surface) && lo(b, 1) > floorY + 0.5 && holds(b, x, z)) || pitched.some((r) => inRect(r, x, z) && underside(r, x, z) > floorY + 0.5);
          if (!over) open.push([x, z]);
        }
      }
    }
    if (open.length) errors.push(`${room.id}: nothing over it at ${open.length} of ${total} spots, e.g. (${open[0].map((v) => v.toFixed(2)).join(", ")}) m`);
  }

  // ---- Eaves: every 0.25 m along each eave line, a box top within 5 cm of the eave a step either side of it.
  for (const r of pitched) {
    const p = r.pitch!;
    for (const edge of p.low === "both" ? (["a0", "a1"] as const) : ([p.low] as const)) {
      const a = edge === "a0" ? p.a0 : p.a1;
      const n = Math.max(1, Math.round((p.b1 - p.b0) / 0.25));
      let loose = 0;
      for (let i = 0; i < n; i++) {
        const b = p.b0 + ((i + 0.5) * (p.b1 - p.b0)) / n;
        const rests = [-0.1, 0.1].some((da) => {
          const [x, z] = p.axis === 0 ? [a + da, b] : [b, a + da];
          return near(x, z).some((q) => holds(q, x, z) && Math.abs(hi(q, 1) - r.eave) <= 0.05);
        });
        if (!rests) loose++;
      }
      if (loose > 0.1 * n) errors.push(`${r.def.id}: its ${sideOf(p, edge)} eave rests on nothing at ${r.eave} m along ${Math.round((100 * loose) / n)}% of it`);
    }
  }

  // ---- Openings: a window's sill or a door's threshold over a roof stays above the roof's top beside it.
  for (const o of things.filter((b) => b.surface === "WINDOW" || b.surface === "BARRICADE")) {
    const bottom = lo(o, 1);
    // The opening's middle, a body's radius out on each side of the wall.
    const thin = o.size[0] < o.size[2] ? 0 : 2;
    for (const side of [-1, 1]) {
      const [x, z] = thin === 0 ? [o.center[0] + side * 0.4, o.center[2]] : [o.center[0], o.center[2] + side * 0.4];
      for (const r of pitched) {
        if (!inRect(r, x, z) || bottom < r.eave - 0.01) continue;
        // Its whole width: the roof's highest top along it.
        const half = Math.max(o.size[0], o.size[2]) / 2;
        const top = Math.max(...[-half, 0, half].map((t) => (thin === 0 ? topOf(r, x, z + t) : topOf(r, x + t, z))));
        if (top > bottom + 0.05) errors.push(`${r.def.id} rises to ${top.toFixed(2)} m outside ${o.id}, over its bottom at ${bottom.toFixed(2)} m`);
      }
    }
  }
  return errors;
}
