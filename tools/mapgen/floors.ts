// Floors (DESIGN §5.6): each storey's floor as slabs and panels. The ground (the floor of the first storey
// above ground) covers the play area; any other storey's floor covers its footprint, cut back where boxes of
// the storey below run up into it (exterior walls reach the next floor). Out of it come the hatches (a HATCH
// panel: the largest rectangle of the research square inside the room on top), the wells (no floor), and the
// soft floors (SOFT_FLOOR tiles of at most tileMaxM, in whole joist spacings, the tiles of one area sharing a
// region so a bullet counts them as one surface). What's left is hard slab, in as few rectangles as the
// greedy cover gives. Stairwell holes come with the stairs (M3).
import type { Frames } from "./frames.js";
import { distanceInside, greedyRects, maxIn, subtractRects, type Rect } from "./grid.js";
import type { Floor } from "./research.js";
import { CELL_M, clearCells, fillBox, storeyOfBox, type RoomsResult } from "./rooms.js";
import type { Layout } from "./schema.js";
import type { Solid } from "./walls.js";

/** Soft-floor tiles are cut in whole joist spacings (data/destruction.json soft_floor core), so joists line up across seams. */
const JOIST_M = 0.4;
/** A soft-floor rectangle thinner than this (a doorway's sliver) stays hard slab. */
const SLIVER_M = 0.3;
/** How far a soft floor reaches past its rooms' walls to meet the wall of the room below. */
const OVERHANG_M = 0.15;
/** A strip along part of a soft floor's edge gets a tile of its own from this long (shorter ones are corners). */
const STRIP_MIN_M = 0.5;

export interface HatchReport {
  id: string;
  storey: Floor;
  /** The panel, metres [x0, z0, x1, z1]. */
  rect: Rect;
  /** How much of the research square was given up on each side to keep inside the top room, u [W, N, E, S]. */
  clipU: [number, number, number, number];
}

export interface FloorsResult {
  solids: Solid[];
  hatches: HatchReport[];
  warnings: string[];
  errors: string[];
  /** Per storey: hard slab boxes, soft-floor tiles, hatches. */
  counts: Record<string, { slabs: number; tiles: number; hatches: number }>;
}

/** Split a length into tiles of at most `max`, each a whole number of joist spacings except the last. */
export function tileSizes(len: number, max: number): number[] {
  const n = Math.ceil(len / max - 1e-9);
  if (n <= 1) return [len];
  const most = Math.floor(max / JOIST_M + 1e-9) * JOIST_M;
  const step = Math.min(most, Math.ceil(len / n / JOIST_M - 1e-9) * JOIST_M);
  const last = len - (n - 1) * step;
  // Joist spacings don't fit (a short last tile, or one over the cap): equal tiles instead.
  if (last < JOIST_M - 1e-9 || last > max + 1e-9) return Array.from({ length: n }, () => len / n);
  return [...Array.from({ length: n - 1 }, () => step), last];
}

/** The largest rectangle of cells where `keep` holds (histogram method), as [i0, j0, i1, j1) or null. */
function largestRect(w: number, h: number, keep: (i: number) => boolean): Rect | null {
  const heights = new Int32Array(w);
  let best: Rect | null = null;
  let bestArea = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) heights[i] = keep(j * w + i) ? heights[i] + 1 : 0;
    const stack: number[] = [];
    for (let i = 0; i <= w; i++) {
      const hgt = i < w ? heights[i] : 0;
      while (stack.length && heights[stack[stack.length - 1]] >= hgt) {
        const top = stack.pop()!;
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const area = heights[top] * (i - left);
        if (area > bestArea) {
          bestArea = area;
          best = [left, j - heights[top] + 1, i, j + 1];
        }
      }
      stack.push(i);
    }
  }
  return best;
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function compileFloors(layout: Layout, fr: Frames, wallSolids: Solid[], rooms: RoomsResult, playable: Rect): FloorsResult {
  const k = layout.units.mPerU;
  const d = layout.defaults;
  const solids: Solid[] = [];
  const hatches: HatchReport[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const counts: FloorsResult["counts"] = {};
  const emitted = new Set<Floor>(layout.emit);
  const order = layout.storeys;
  const groundStorey = order.find((s) => !s.underground);
  const toM = (frame: keyof Layout["frames"], r: Rect): Rect => {
    const [ax, ay] = fr.toWorld(frame, r[0], r[1]);
    const [bx, by] = fr.toWorld(frame, r[2], r[3]);
    return [Math.min(ax, bx) * k, Math.min(ay, by) * k, Math.max(ax, bx) * k, Math.max(ay, by) * k];
  };
  const slab = (id: string, r: Rect, y0: number, y1: number, extra: Partial<Solid> & Pick<Solid, "surface">): Solid => ({
    id,
    center: [r4((r[0] + r[2]) / 2), r4((y0 + y1) / 2), r4((r[1] + r[3]) / 2)],
    size: [r4(r[2] - r[0]), r4(y1 - y0), r4(r[3] - r[1])],
    ...extra,
  });
  const roomIndex = new Map(rooms.rooms.map((r, i) => [r.id, i]));

  for (let si = 0; si < order.length; si++) {
    const storey = order[si];
    const floor = storey.id;
    if (!emitted.has(floor)) continue;
    const [y0, y1] = [storey.floorY - storey.slabM, storey.floorY];
    const count = (counts[floor] = { slabs: 0, tiles: 0, hatches: 0 });
    const plan = rooms.plans.get(floor);
    if (!plan) {
      if (storey === groundStorey) {
        const [px0, pz0, px1, pz1] = playable.map((u) => u * k);
        solids.push(slab("ground#0", [px0, pz0, px1, pz1], y0, y1, { surface: "HARD_FLOOR" }));
        count.slabs = 1;
      } else warnings.push(`${floor}: no walls, so no floor`);
      continue;
    }
    const g = plan.grid;
    const n = g.w * g.h;
    const cellRect = (c: Rect): Rect => [g.x0 + c[0] * CELL_M, g.y0 + c[1] * CELL_M, g.x0 + c[2] * CELL_M, g.y0 + c[3] * CELL_M].map(r4) as Rect;
    /** The cells whose centres are inside a rectangle (metres), as an index range. */
    const span = (r: Rect) => {
      const i0 = Math.max(0, Math.ceil((r[0] - g.x0) / CELL_M - 0.5));
      const i1 = Math.min(g.w, Math.ceil((r[2] - g.x0) / CELL_M - 0.5));
      const j0 = Math.max(0, Math.ceil((r[1] - g.y0) / CELL_M - 0.5));
      const j1 = Math.min(g.h, Math.ceil((r[3] - g.y0) / CELL_M - 0.5));
      return { i0, i1, j0, j1 };
    };
    // ---- What the floor covers: the storey's footprint (boxes and what they enclose), less what the storey
    // below runs up into the slab. 0 nothing, 1 hard, 2 soft, 3 hatch, 4 hole.
    const kind = new Uint8Array(n);
    for (let c = 0; c < n; c++) kind[c] = g.cells[c] === 2 ? 0 : 1;
    const below = order[si - 1];
    if (below) {
      const pierce = g.blank();
      for (const b of wallSolids) {
        if (b.drawOnly || storeyOfBox(layout, b) !== below.id) continue;
        if (b.center[1] + b.size[1] / 2 > y0 + 0.01 && b.center[1] - b.size[1] / 2 < y1 - 0.01) fillBox(pierce, b);
      }
      for (let c = 0; c < n; c++) if (pierce.cells[c] === 1) kind[c] = 0;
    }
    // ---- Wells: no floor where nothing stands.
    for (const well of layout.wells.filter((w) => w.floor === floor)) {
      for (const r of well.rects) {
        const { i0, i1, j0, j1 } = span(toM(well.frame, r));
        for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if (kind[j * g.w + i] === 1 && g.cells[j * g.w + i] === 0) kind[j * g.w + i] = 4;
      }
    }
    // ---- Hatches whose top room is on this storey: the largest rectangle of the square inside that room.
    const groundHoles: Rect[] = [];
    for (const h of layout.hatches) {
      const top = roomIndex.get(h.top);
      if (top === undefined) {
        if (!layout.rooms.some((r) => r.id === h.top)) errors.push(`hatch ${h.id}: top room ${h.top} isn't in rooms`);
        continue;
      }
      if (rooms.rooms[top].storey !== floor) continue;
      const want = toM(h.frame, h.rect);
      const { i0, i1, j0, j1 } = span(want);
      const w = i1 - i0;
      const best = largestRect(w, j1 - j0, (c) => {
        const cell = (j0 + Math.floor(c / w)) * g.w + i0 + (c % w);
        return plan.room[cell] === top && (storey === groundStorey || kind[cell] === 1);
      });
      if (!best) {
        errors.push(`hatch ${h.id}: no floor of ${h.top} inside its square`);
        continue;
      }
      const cells: Rect = [i0 + best[0], j0 + best[1], i0 + best[2], j0 + best[3]];
      for (let j = cells[1]; j < cells[3]; j++) for (let i = cells[0]; i < cells[2]; i++) kind[j * g.w + i] = 3;
      const r = cellRect(cells);
      solids.push(slab(h.id, r, y0, y1, { surface: "HATCH", label: h.id }));
      hatches.push({ id: h.id, storey: floor, rect: r, clipU: [r[0] - want[0], r[1] - want[1], want[2] - r[2], want[3] - r[3]].map((v) => r4(Math.max(0, v) / k)) as HatchReport["clipU"] });
      if (storey === groundStorey) groundHoles.push(r);
      count.hatches++;
    }
    if (storey === groundStorey) {
      // ---- The ground: the whole play area, less the hatches (and, later, stairwells and the bunker's trench).
      const [px0, pz0, px1, pz1] = playable.map((u) => u * k);
      subtractRects([px0, pz0, px1, pz1], groundHoles).forEach((r, i) => solids.push(slab(`ground#${i}`, r, y0, y1, { surface: "HARD_FLOOR" })));
      count.slabs = solids.filter((s) => s.id.startsWith("ground#")).length;
      continue;
    }
    // ---- Soft floors: their rectangles' floor inside the walls, as tiles of one region per area.
    const region = new Int16Array(n).fill(-1);
    const soft = layout.softFloors.filter((f) => f.floor === floor && !f.hard);
    soft.forEach((f, fi) => {
      if (f.use === "alt" && !f.alt) errors.push(`${f.id}: use is "alt" but it has none`);
      for (const r of f.use === "alt" && f.alt ? f.alt : f.rects) {
        const { i0, i1, j0, j1 } = span(toM(f.frame, r));
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++) {
            const c = j * g.w + i;
            if (kind[c] === 1 && g.cells[c] === 0) {
              kind[c] = 2;
              region[c] = fi;
            }
          }
        }
      }
    });
    // ---- A soft floor ends at its rooms' walls on this storey, which needn't stand over the walls of the room
    // below: an outside wall overhangs a thinner inside one, a line is drawn a few centimetres off, a room ends
    // at a split. The strip left between the soft floor and the wall below is that room's ceiling, so a soft
    // floor's rectangle grows across it where it runs the rectangle's whole edge, over a room below the soft
    // floor covers and next to a wall below: seen from below, the soft floor meets the room's walls with no
    // strip of hard ceiling between (a wall standing mid-ceiling keeps hard floor under it).
    const planBelow = below ? rooms.plans.get(below.id) : undefined;
    let roomBelow = (_c: number): number => -1;
    let wallBelow = (_c: number): boolean => false;
    let nearWallBelow: Int32Array = new Int32Array(0);
    if (planBelow) {
      const gb = planBelow.grid;
      const [di, dj] = [Math.round((g.x0 - gb.x0) / CELL_M), Math.round((g.y0 - gb.y0) / CELL_M)];
      const at = (c: number) => {
        const [i, j] = [(c % g.w) + di, Math.floor(c / g.w) + dj];
        return i < 0 || j < 0 || i >= gb.w || j >= gb.h ? -1 : j * gb.w + i;
      };
      roomBelow = (c) => (at(c) < 0 ? -1 : planBelow.room[at(c)]);
      wallBelow = (c) => at(c) >= 0 && gb.cells[at(c)] === 1;
      nearWallBelow = distanceInside(g.w, g.h, (c) => roomBelow(c) >= 0);
    }
    const reach = Math.round(OVERHANG_M / CELL_M);
    /** Per soft floor, the rooms below it. */
    const under = soft.map(() => new Set<number>());
    if (planBelow) for (let c = 0; c < n; c++) if (region[c] >= 0) under[region[c]].add(roomBelow(c));
    for (const u of under) u.delete(-1);
    /** Whether a cell can join soft floor `fi`'s strip: 0 no; 1 hard floor over a wall below; 2 hard floor over a room below it covers, near a wall below. */
    const strip = (c: number, fi: number) => {
      if (kind[c] !== 1) return 0;
      if (wallBelow(c)) return 1;
      return nearWallBelow[c] > 0 && nearWallBelow[c] <= reach && under[fi].has(roomBelow(c)) ? 2 : 0;
    };
    /**
     * A rectangle of cells grown across the strips along its edges, its new cells soft floor `fi`: each side
     * moves out by up to `reach` cells while the whole row beyond it can join the strip, some of it over a room.
     */
    const grow = (r: Rect, fi: number): Rect => {
      const line = (cells: [number, number][]) => {
        const s = cells.map(([i, j]) => strip(j * g.w + i, fi));
        return s.every((v) => v > 0) && s.some((v) => v === 2);
      };
      const span = (a: number, b: number) => Array.from({ length: b - a }, (_, t) => a + t);
      const column = (i: number) => i >= 0 && i < g.w && line(span(out[1], out[3]).map((j) => [i, j]));
      const row = (j: number) => j >= 0 && j < g.h && line(span(out[0], out[2]).map((i) => [i, j]));
      const out: Rect = [r[0], r[1], r[2], r[3]];
      for (let t = 0; t < reach && column(out[0] - 1); t++) out[0]--;
      for (let t = 0; t < reach && column(out[2]); t++) out[2]++;
      for (let t = 0; t < reach && row(out[1] - 1); t++) out[1]--;
      for (let t = 0; t < reach && row(out[3]); t++) out[3]++;
      for (let j = out[1]; j < out[3]; j++) {
        for (let i = out[0]; i < out[2]; i++) {
          const c = j * g.w + i;
          if (kind[c] === 1) (kind[c] = 2), (region[c] = fi);
        }
      }
      return out;
    };
    soft.forEach((f, fi) => {
      const inArea = (c: number) => kind[c] === 2 && region[c] === fi;
      const rects = greedyRects(g.w, g.h, inArea);
      // Worked out only if a thin rectangle needs it: is part of it open floor, not a doorway's sliver?
      let dist: Int32Array | undefined;
      const open = (cells: Rect) => maxIn((dist ??= distanceInside(g.w, g.h, inArea)), g.w, cells) >= clearCells(SLIVER_M);
      const mine: Solid[] = [];
      const max = f.tileMaxM ?? d.softFloor.tileMaxM;
      /** A rectangle (metres) as tiles of at most `max`, in whole joist spacings. */
      const tile = (r: Rect, id: string) => {
        const xs = tileSizes(r4(r[2] - r[0]), max);
        const zs = tileSizes(r4(r[3] - r[1]), max);
        let z = r[1];
        zs.forEach((dz, row) => {
          let x = r[0];
          xs.forEach((dx, col) => {
            mine.push(slab(`${id}.r${row}c${col}`, [x, z, x + dx, z + dz], y0, y1, { surface: "SOFT_FLOOR", panel: { region: f.id } }));
            x += dx;
          });
          z += dz;
        });
      };
      rects.forEach((cells, ri) => {
        if (Math.min(cells[2] - cells[0], cells[3] - cells[1]) * CELL_M < SLIVER_M - 1e-9 && !open(cells)) {
          // A doorway's sliver: hard slab.
          for (let j = cells[1]; j < cells[3]; j++) for (let i = cells[0]; i < cells[2]; i++) kind[j * g.w + i] = 1;
          return;
        }
        tile(cellRect(planBelow ? grow(cells, fi) : cells), `${f.id}#${ri}`);
      });
      if (planBelow) {
        // What's left of the strips, where one runs along only part of an edge: within `reach` cells of the soft
        // floor, tiles of their own, those long enough to see (corner bits stay hard).
        const left = new Uint8Array(n); // steps from the soft floor, 0 for none
        const queue: number[] = [];
        for (let c = 0; c < n; c++) if (kind[c] === 2 && region[c] === fi) queue.push(c);
        for (let q = 0; q < queue.length; q++) {
          const c = queue[q];
          if (left[c] >= reach) continue;
          const [i, j] = [c % g.w, Math.floor(c / g.w)];
          for (const m of [i > 0 ? c - 1 : -1, i < g.w - 1 ? c + 1 : -1, j > 0 ? c - g.w : -1, j < g.h - 1 ? c + g.w : -1]) {
            if (m < 0 || left[m] || strip(m, fi) !== 2) continue;
            left[m] = left[c] + 1;
            queue.push(m);
          }
        }
        greedyRects(g.w, g.h, (c) => left[c] > 0).forEach((cells, k) => {
          if (Math.max(cells[2] - cells[0], cells[3] - cells[1]) * CELL_M < STRIP_MIN_M - 1e-9) return;
          for (let j = cells[1]; j < cells[3]; j++) for (let i = cells[0]; i < cells[2]; i++) (kind[j * g.w + i] = 2), (region[j * g.w + i] = fi);
          tile(cellRect(cells), `${f.id}#e${k}`);
        });
      }
      // The area's id on its largest tile, so it can be checked by eye.
      const area = (t: Solid) => t.size[0] * t.size[2];
      if (mine.length) mine.reduce((a, b) => (area(b) > area(a) ? b : a)).label = f.id;
      else warnings.push(`${f.id}: no floor inside its rectangles on ${floor}`);
      solids.push(...mine);
      count.tiles += mine.length;
    });
    // ---- Hard slab: everything else the floor covers.
    greedyRects(g.w, g.h, (c) => kind[c] === 1).forEach((cells, i) => {
      solids.push(slab(`slab:${floor}#${i}`, cellRect(cells), y0, y1, { surface: "HARD_FLOOR" }));
      count.slabs++;
    });
  }
  return { solids, hatches, warnings, errors, counts };
}
