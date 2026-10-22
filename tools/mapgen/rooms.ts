// Rooms (DESIGN §5.5): each storey's plan in metres at 5 cm, rasterised from the compiled boxes that stand on
// it (walls, panels, frames, headers and rails, so every opening is closed) and flooded from its edge. The
// layout's splits are virtual walls between rooms the plan shows as one space (an open-plan hall and its
// stairs). A room is the region its seed falls in; it compiles to rectangles (the HUD's lookup, later the
// sites) and an anchor, the spot nearest its middle where a body fits, for goTo and its label.
import type { Frames } from "./frames.js";
import { distanceInside, greedyRects, maxIn, PlanGrid, type Rect } from "./grid.js";
import type { Floor } from "./research.js";
import type { Layout } from "./schema.js";
import type { Solid } from "./walls.js";

/** The plan cell, metres: the panel cell, so every edge lands on the snap grid. */
export const CELL_M = 0.05;
/** A room rectangle thinner than this is a doorway's sliver: left out of the room's rectangles. */
const SLIVER_M = 0.3;
/** How far from every wall a room's anchor stands (a body's radius and a margin), metres. */
const ANCHOR_CLEAR_M = 0.45;
/** An enclosed space with no room this big or bigger is reported (smaller ones are wall junction pockets). */
const UNNAMED_REPORT_M2 = 2;

export interface StoreyPlan {
  floor: Floor;
  /** 1 where a box of this storey stands in plan, 2 outside the building (flooded from the edge), 0 inside. */
  grid: PlanGrid;
  /** 1 on a split (a virtual wall between rooms: the floor under it is floor) or in a well (no floor, no room). */
  split: Uint8Array;
  /** The index in `rooms` of each cell's room, -1 for none. */
  room: Int16Array;
}

export interface CompiledRoom {
  id: string;
  callout: string;
  storey: Floor;
  /** Floor rectangles [x0, z0, x1, z1], metres. */
  rects: Rect[];
  anchor: [number, number, number];
}

export interface RoomsResult {
  rooms: CompiledRoom[];
  plans: Map<Floor, StoreyPlan>;
  errors: string[];
  warnings: string[];
}

/**
 * The distance (distanceInside's count: 1 next to the edge) at which a cell's centre is at least `m` metres
 * from the edge: it is (d − 0.5) cells away, and the chessboard count never overstates the true distance.
 */
export const clearCells = (m: number) => Math.ceil(m / CELL_M + 0.5);

const snapOut = (v: number, dir: -1 | 1) => (dir < 0 ? Math.floor(v / CELL_M) : Math.ceil(v / CELL_M)) * CELL_M;

/** The storey a compiled box stands on: the highest whose floor is at or below its bottom (give or take 1 cm). */
export function storeyOfBox(layout: Layout, b: Pick<Solid, "center" | "size">): Floor | null {
  const bottom = b.center[1] - b.size[1] / 2;
  let at: Floor | null = null;
  for (const s of layout.storeys) if (s.floorY <= bottom + 0.01) at = s.id;
  return at;
}

/** Mark the plan footprint of a box (metres) by cell centres. */
export function fillBox(g: PlanGrid, b: Pick<Solid, "center" | "size">) {
  g.fillCentres(b.center[0] - b.size[0] / 2, b.center[2] - b.size[2] / 2, b.center[0] + b.size[0] / 2, b.center[2] + b.size[2] / 2);
}

/** `keepOut`: per storey, rectangles (metres) a room's anchor keeps clear of (the stairs: stairs.ts stairKeepOut). */
export function compileRooms(layout: Layout, fr: Frames, wallSolids: Solid[], keepOut: Map<Floor, Rect[]> = new Map()): RoomsResult {
  const k = layout.units.mPerU;
  const errors: string[] = [];
  const warnings: string[] = [];
  const plans = new Map<Floor, StoreyPlan>();
  const rooms: CompiledRoom[] = [];
  const emitted = new Set<Floor>(layout.emit);
  const byStorey = new Map<Floor, Solid[]>();
  for (const b of wallSolids) {
    const s = storeyOfBox(layout, b);
    if (s && !b.drawOnly) (byStorey.get(s) ?? byStorey.set(s, []).get(s)!).push(b);
  }

  for (const storey of layout.storeys) {
    const floor = storey.id;
    const boxes = byStorey.get(floor) ?? [];
    if (!emitted.has(floor) || boxes.length === 0) continue;
    // The storey's boxes and a metre of margin, on the cell grid.
    const x0 = snapOut(Math.min(...boxes.map((b) => b.center[0] - b.size[0] / 2)) - 1, -1);
    const z0 = snapOut(Math.min(...boxes.map((b) => b.center[2] - b.size[2] / 2)) - 1, -1);
    const x1 = snapOut(Math.max(...boxes.map((b) => b.center[0] + b.size[0] / 2)) + 1, 1);
    const z1 = snapOut(Math.max(...boxes.map((b) => b.center[2] + b.size[2] / 2)) + 1, 1);
    const grid = new PlanGrid(x0, z0, x1, z1, CELL_M);
    for (const b of boxes) fillBox(grid, b);
    grid.floodOutside();

    // Splits and wells, on a copy: the floor under a split is still floor.
    const split = new Uint8Array(grid.w * grid.h);
    const marks = new PlanGrid(x0, z0, x1, z1, CELL_M);
    for (const well of layout.wells.filter((w) => w.floor === floor)) {
      for (const r of well.rects) {
        const [ax, ay] = fr.toWorld(well.frame, r[0], r[1]);
        const [bx, by] = fr.toWorld(well.frame, r[2], r[3]);
        marks.fillCentres(ax * k, ay * k, bx * k, by * k);
      }
    }
    for (const sp of layout.splits.filter((s) => s.floor === floor)) {
      const [ax, ay] = fr.toWorld(sp.frame, sp.axis === "H" ? sp.span[0] : sp.at, sp.axis === "H" ? sp.at : sp.span[0]);
      const [bx, by] = fr.toWorld(sp.frame, sp.axis === "H" ? sp.span[1] : sp.at, sp.axis === "H" ? sp.at : sp.span[1]);
      // Two cells wide, centred on the line: a 4-connected flood can't cross it.
      if (sp.axis === "H") marks.fillCentres(ax * k, ay * k - CELL_M, bx * k, ay * k + CELL_M);
      else marks.fillCentres(ax * k - CELL_M, ay * k, ax * k + CELL_M, by * k);
    }
    for (let i = 0; i < split.length; i++) split[i] = marks.cells[i] === 1 && grid.cells[i] === 0 ? 1 : 0;
    const flood = new PlanGrid(x0, z0, x1, z1, CELL_M);
    flood.cells.set(grid.cells);
    for (let i = 0; i < split.length; i++) if (split[i]) flood.cells[i] = 1;
    const { labels, count } = flood.labelInside();

    // One pass for each region's size, middle and bounding box.
    const stats = Array.from({ length: count + 1 }, () => ({ n: 0, sx: 0, sz: 0, i0: grid.w, j0: grid.h, i1: 0, j1: 0 }));
    for (let c = 0; c < labels.length; c++) {
      const st = stats[labels[c]];
      if (labels[c] === 0) continue;
      const [i, j] = [c % grid.w, Math.floor(c / grid.w)];
      st.n++;
      st.sx += i;
      st.sz += j;
      st.i0 = Math.min(st.i0, i);
      st.j0 = Math.min(st.j0, j);
      st.i1 = Math.max(st.i1, i + 1);
      st.j1 = Math.max(st.j1, j + 1);
    }
    const roomOfLabel = new Int16Array(count + 1).fill(-1);
    const claimed = new Map<number, string>();
    for (const r of layout.rooms.filter((x) => x.floor === floor)) {
      const [wx, wy] = fr.toWorld(r.frame, r.seed[0], r.seed[1]);
      const i = grid.index(wx * k, wy * k);
      const where = `${r.id}'s seed (${r.seed.join(", ")} ${r.frame} u)`;
      if (i < 0 || grid.cells[i] === 2) {
        errors.push(`${where} is outside the ${floor} building`);
        continue;
      }
      if (grid.cells[i] === 1 || split[i]) {
        errors.push(`${where} is on a wall or a split`);
        continue;
      }
      const label = labels[i];
      const other = claimed.get(label);
      if (other) {
        errors.push(`${r.id} and ${other} are one space on ${floor}: a split between them is missing, or an opening is drawn closed`);
        continue;
      }
      claimed.set(label, r.id);
      roomOfLabel[label] = rooms.length;
      rooms.push({ ...roomShape(grid, labels, label, stats[label], storey.floorY, warnings, r.id, keepOut.get(floor) ?? []), id: r.id, callout: r.callout, storey: floor });
    }
    const room = new Int16Array(grid.w * grid.h);
    for (let c = 0; c < labels.length; c++) room[c] = labels[c] ? roomOfLabel[labels[c]] : -1;
    for (let label = 1; label <= count; label++) {
      const st = stats[label];
      const area = st.n * CELL_M * CELL_M;
      if (claimed.has(label) || area < UNNAMED_REPORT_M2) continue;
      const [nx, ny] = fr.toNative(floor, (grid.x0 + (st.sx / st.n + 0.5) * CELL_M) / k, (grid.y0 + (st.sz / st.n + 0.5) * CELL_M) / k);
      warnings.push(`${floor}: an enclosed space of ${area.toFixed(1)} m² around (${nx.toFixed(1)}, ${ny.toFixed(1)} ${floor} u) is no room`);
    }
    plans.set(floor, { floor, grid, split, room });
  }
  return { rooms, plans, errors, warnings };
}

/** A room's rectangles (slivers left out) and its anchor, worked out inside its bounding box. */
function roomShape(
  grid: PlanGrid,
  labels: Int32Array,
  label: number,
  st: { n: number; sx: number; sz: number; i0: number; j0: number; i1: number; j1: number },
  floorY: number,
  warnings: string[],
  id: string,
  keepOut: Rect[],
): Pick<CompiledRoom, "rects" | "anchor"> {
  const [w, h] = [st.i1 - st.i0, st.j1 - st.j0];
  const mine = (c: number) => labels[(st.j0 + Math.floor(c / w)) * grid.w + st.i0 + (c % w)] === label;
  const round = (v: number) => Math.round(v * 1e4) / 1e4;
  const toM = (r: Rect): Rect => [grid.x0 + (st.i0 + r[0]) * CELL_M, grid.y0 + (st.j0 + r[1]) * CELL_M, grid.x0 + (st.i0 + r[2]) * CELL_M, grid.y0 + (st.j0 + r[3]) * CELL_M].map(round) as Rect;
  const cells = greedyRects(w, h, mine);
  const all = cells.map(toM);
  const dist = distanceInside(w, h, mine);
  // A thin rectangle is a doorway's sliver, unless part of it is open floor: the greedy cover also cuts thin
  // strips across a room where two wall faces are a few centimetres out of line.
  const open = clearCells(SLIVER_M);
  const big = all.filter((r, i) => Math.min(r[2] - r[0], r[3] - r[1]) >= SLIVER_M - 1e-9 || maxIn(dist, w, cells[i]) >= open);
  const area = (r: Rect) => (r[2] - r[0]) * (r[3] - r[1]);
  const rects = big.length ? big : [all.reduce((a, b) => (area(b) > area(a) ? b : a))];
  // Anchor: the cell clear of walls (and of the stairs) by ANCHOR_CLEAR_M nearest the room's middle (else the
  // clearest one).
  const free = (c: number) => {
    if (!mine(c)) return false;
    const x = grid.x0 + (st.i0 + (c % w) + 0.5) * CELL_M;
    const z = grid.y0 + (st.j0 + Math.floor(c / w) + 0.5) * CELL_M;
    return !keepOut.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3]);
  };
  const clear = keepOut.length ? distanceInside(w, h, free) : dist;
  const [cx, cz] = [st.sx / st.n - st.i0, st.sz / st.n - st.j0];
  const need = clearCells(ANCHOR_CLEAR_M);
  let best = -1;
  let bestScore = Infinity;
  let clearest = -1;
  for (let c = 0; c < w * h; c++) {
    if (!free(c)) continue;
    if (clearest < 0 || clear[c] > clear[clearest]) clearest = c;
    if (clear[c] < need) continue;
    const score = ((c % w) - cx) ** 2 + (Math.floor(c / w) - cz) ** 2;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (best < 0) {
    warnings.push(`${id}: no spot ${ANCHOR_CLEAR_M} m clear of walls and stairs; its anchor is the clearest one`);
    best = clearest;
  }
  const ax = grid.x0 + (st.i0 + (best % w) + 0.5) * CELL_M;
  const az = grid.y0 + (st.j0 + Math.floor(best / w) + 0.5) * CELL_M;
  return { rects, anchor: [round(ax), floorY, round(az)] };
}
