// The walk graph (DESIGN §9.2 check 10, M3): where a body can stand and where it can walk to, read from the
// physics world the Sim moves bodies in. Every collider a body collides with (walls, slabs, open steps and the
// invisible ramps over them, rails, panels' movement boxes, props) is rasterised into columns cellM square, each
// column a list of solid spans. A node is a span's walkable top with room above it for a crouching body and
// nothing a body can't step over within its radius; nodes in neighbouring columns join when the step between
// them is one a body takes (≤ maxStepHeight), and each ladder joins its foot to its top. Drops are left out:
// what the graph joins, a body walks both ways. A head start for the Phase 9 navmesh.
import { G_MOVE_HELPER, G_PANEL, G_PROP, G_STATIC } from "../../game/shared/src/physics/rapier.js";
import type { Sim } from "../../game/shared/src/sim.js";

export interface WalkGraph {
  cellM: number;
  /** The grid's corner (metres) and size in columns. */
  x0: number;
  z0: number;
  w: number;
  h: number;
  /** Column c's nodes are first[c] .. first[c + 1] - 1, lowest first. */
  first: Int32Array;
  /** Each node's floor height. */
  y: Float32Array;
  /** Each node's connected component (the id of one node in it). */
  comp: Int32Array;
  /** Each ladder's foot and top node (-1: no node there). */
  ladders: { id: string; foot: number; top: number }[];
}

export interface WalkGraphOptions {
  cellM?: number;
  /** The area [x0, z0, x1, z1] in metres (default: the level's bounds). */
  area?: [number, number, number, number];
  /** Join each ladder's foot to its top (default true; off, a test can see what only a ladder reaches). */
  ladders?: boolean;
}

/** A collider as a box: centre, half extents and the world directions of its three axes. */
/** The character controller's offset (sim.ts createCharacterController): a body keeps that far off what it touches. */
const SKIN_M = 0.02;

interface Box {
  t: [number, number, number];
  he: [number, number, number];
  axes: [number, number, number][];
}

export function buildWalkGraph(sim: Sim, opts: WalkGraphOptions = {}): WalkGraph {
  const m = sim.data.movement;
  const c = opts.cellM ?? 0.1;
  const b = sim.level.def.bounds;
  const area = opts.area ?? (b ? [b.min[0], b.min[2], b.max[0], b.max[2]] : null);
  if (!area) throw new Error("buildWalkGraph: the level has no bounds; pass an area");
  const [x0, z0] = [area[0], area[1]];
  const w = Math.ceil((area[2] - x0) / c);
  const h = Math.ceil((area[3] - z0) / c);
  const step = m.step.maxStepHeight;
  const height = m.stance.crouch.height;
  const minUp = Math.cos((m.step.maxSlopeDeg * Math.PI) / 180);

  // ---- the colliders bodies collide with, as boxes
  const boxes: Box[] = [];
  sim.world.forEachCollider((col) => {
    if (!((col.collisionGroups() >>> 16) & (G_STATIC | G_MOVE_HELPER | G_PANEL | G_PROP)) || col.isSensor() || !col.isEnabled()) return;
    if (col.shapeType() !== sim.R.ShapeType.Cuboid) throw new Error(`buildWalkGraph: collider ${col.handle} isn't a box`);
    const he = col.halfExtents()!;
    const t = col.translation();
    const q = col.rotation();
    boxes.push({ t: [t.x, t.y, t.z], he: [he.x, he.y, he.z], axes: [rotate(q, [1, 0, 0]), rotate(q, [0, 1, 0]), rotate(q, [0, 0, 1])] });
  });

  // ---- each column's solid intervals (two passes: count, then fill), flagged walkable on top or not
  const count = new Int32Array(w * h + 1);
  const raster = (box: Box, put: (col: number, y0: number, y1: number, walk: boolean) => void) => {
    const up = box.axes.findIndex((a) => Math.abs(a[1]) > 1 - 1e-6);
    // The box's reach in x and z, and the columns under it.
    const ex = box.axes.reduce((s, a, k) => s + Math.abs(a[0]) * box.he[k], 0);
    const ez = box.axes.reduce((s, a, k) => s + Math.abs(a[2]) * box.he[k], 0);
    const i0 = Math.max(0, Math.floor((box.t[0] - ex - x0) / c));
    const i1 = Math.min(w - 1, Math.floor((box.t[0] + ex - x0) / c));
    const j0 = Math.max(0, Math.floor((box.t[2] - ez - z0) / c));
    const j1 = Math.min(h - 1, Math.floor((box.t[2] + ez - z0) / c));
    if (up >= 0) {
      // Upright (turned about y at most): a wall, a slab, a step. Every column whose square it overlaps, so a
      // rail thinner than a column still blocks; the clearance below allows for the half column that adds.
      const [p, q] = [0, 1, 2].filter((k) => k !== up);
      const [ap, aq] = [box.axes[p], box.axes[q]];
      const aligned = Math.abs(ap[0]) < 1e-6 || Math.abs(ap[2]) < 1e-6;
      const [y0, y1] = [box.t[1] - box.he[up], box.t[1] + box.he[up]];
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          if (!aligned) {
            const [dx, dz] = [x0 + (i + 0.5) * c - box.t[0], z0 + (j + 0.5) * c - box.t[2]];
            if (Math.abs(dx * ap[0] + dz * ap[2]) > box.he[p] + (c / 2) * (Math.abs(ap[0]) + Math.abs(ap[2]))) continue;
            if (Math.abs(dx * aq[0] + dz * aq[2]) > box.he[q] + (c / 2) * (Math.abs(aq[0]) + Math.abs(aq[2]))) continue;
          }
          put(j * w + i, y0, y1, true);
        }
      }
      return;
    }
    // Tilted (a ramp): where the vertical line through each column's centre crosses it; walkable where the face it
    // leaves the box through, at the top, is no steeper than a body climbs (a ramp's top, not a steep slab's end).
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const o = [x0 + (i + 0.5) * c - box.t[0], 0, z0 + (j + 0.5) * c - box.t[2]];
        let lo = -Infinity;
        let hi = Infinity;
        let top = -1;
        for (let k = 0; k < 3 && lo <= hi; k++) {
          const a = box.axes[k];
          const s = o[0] * a[0] + o[2] * a[2]; // the line's offset along axis k at y = box centre
          if (Math.abs(a[1]) < 1e-9) {
            if (Math.abs(s) > box.he[k]) hi = -Infinity;
            continue;
          }
          const [ya, yb] = [(-box.he[k] - s) / a[1], (box.he[k] - s) / a[1]];
          lo = Math.max(lo, Math.min(ya, yb));
          if (Math.max(ya, yb) < hi) [hi, top] = [Math.max(ya, yb), k];
        }
        if (lo <= hi) put(j * w + i, box.t[1] + lo, box.t[1] + hi, top >= 0 && Math.abs(box.axes[top][1]) >= minUp);
      }
    }
  };
  for (const box of boxes) raster(box, (col) => count[col + 1]++);
  for (let k = 0; k < w * h; k++) count[k + 1] += count[k];
  const n = count[w * h];
  const iy0 = new Float32Array(n);
  const iy1 = new Float32Array(n);
  const iwalk = new Uint8Array(n);
  const fill = count.slice(0, w * h);
  for (const box of boxes) {
    raster(box, (col, y0, y1, walk) => {
      const k = fill[col]++;
      iy0[k] = y0;
      iy1[k] = y1;
      iwalk[k] = walk ? 1 : 0;
    });
  }

  // ---- merge each column's intervals into spans, lowest first (touching ones join: a wall on a slab)
  const spanFirst = new Int32Array(w * h + 1);
  const sy0 = new Float32Array(n);
  const sy1 = new Float32Array(n);
  const swalk = new Uint8Array(n);
  let spans = 0;
  const order: number[] = [];
  for (let col = 0; col < w * h; col++) {
    spanFirst[col] = spans;
    order.length = 0;
    for (let k = count[col]; k < count[col + 1]; k++) order.push(k);
    order.sort((a, b) => iy0[a] - iy0[b]);
    for (const k of order) {
      const last = spans - 1;
      if (last >= spanFirst[col] && iy0[k] <= sy1[last] + 0.01) {
        if (iy1[k] > sy1[last] + 1e-4) {
          sy1[last] = iy1[k];
          swalk[last] = iwalk[k];
        } else if (iy1[k] > sy1[last] - 1e-4) swalk[last] |= iwalk[k];
        continue;
      }
      sy0[spans] = iy0[k];
      sy1[spans] = iy1[k];
      swalk[spans] = iwalk[k];
      spans++;
    }
  }
  spanFirst[w * h] = spans;

  // ---- nodes: walkable tops with a crouching body's height above them and nothing in its way within its
  // radius and the controller's skin (Sim: 2 cm). A box blocks every column it overlaps, so the face nearest a
  // node lies within half a column's diagonal of a blocked centre: counting centres that far out more joins
  // no gap a body can't pass, at the price of seeing some up to that much narrower than they are.
  const reach = m.stance.collisionRadius + SKIN_M + (c * Math.SQRT2) / 2;
  const disc: [number, number][] = [];
  const r = Math.ceil(reach / c);
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (Math.hypot(di, dj) * c <= reach + 1e-9) disc.push([di, dj]);
  const blocked = (i: number, j: number, y: number) => {
    for (const [di, dj] of disc) {
      const [ii, jj] = [i + di, j + dj];
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const col = jj * w + ii;
      for (let s = spanFirst[col]; s < spanFirst[col + 1]; s++) if (sy0[s] < y + height && sy1[s] > y + step) return true;
    }
    return false;
  };
  const first = new Int32Array(w * h + 1);
  const ys: number[] = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const col = j * w + i;
      first[col] = ys.length;
      for (let s = spanFirst[col]; s < spanFirst[col + 1]; s++) {
        if (!swalk[s]) continue;
        const room = (s + 1 < spanFirst[col + 1] ? sy0[s + 1] : Infinity) - sy1[s];
        if (room >= height && !blocked(i, j, sy1[s])) ys.push(sy1[s]);
      }
    }
  }
  first[w * h] = ys.length;
  const y = Float32Array.from(ys);

  // ---- join neighbours a step apart, and each ladder's foot to its top
  const parent = new Int32Array(y.length).map((_, k) => k);
  const find = (k: number): number => {
    while (parent[k] !== k) k = parent[k] = parent[parent[k]];
    return k;
  };
  const union = (a: number, b: number) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const col = j * w + i;
      for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const [ii, jj] = [i + di, j + dj];
        if (ii < 0 || jj >= h || ii >= w) continue;
        const other = jj * w + ii;
        for (let a = first[col]; a < first[col + 1]; a++) for (let b2 = first[other]; b2 < first[other + 1]; b2++) if (Math.abs(y[a] - y[b2]) <= step) union(a, b2);
      }
    }
  }
  const graph: WalkGraph = { cellM: c, x0, z0, w, h, first, y, comp: new Int32Array(0), ladders: [] };
  for (const L of sim.level.ladders) {
    // Where a body climbs from and where the climb sets it down (game/shared/src/player/movement.ts).
    const off = m.stance.collisionRadius + 0.05;
    const [cx, cz] = [L.base[0] - L.forward[0] * off, L.base[2] - L.forward[1] * off];
    const d = off + m.ladder.dismountForward;
    const foot = nodeNear(graph, cx, L.base[1], cz);
    const top = nodeNear(graph, cx + L.forward[0] * d, L.base[1] + L.height, cz + L.forward[1] * d);
    if (foot >= 0 && top >= 0 && opts.ladders !== false) union(foot, top);
    graph.ladders.push({ id: L.id, foot, top });
  }
  graph.comp = parent.map((_, k) => find(k));
  return graph;
}

/** The node nearest (x, y, z) within `within` metres across and a step up or down, or -1. */
export function nodeNear(g: WalkGraph, x: number, y: number, z: number, within = 0.3): number {
  const r = Math.ceil(within / g.cellM);
  const [ci, cj] = [Math.floor((x - g.x0) / g.cellM), Math.floor((z - g.z0) / g.cellM)];
  let best = -1;
  let bestD = Infinity;
  for (let j = cj - r; j <= cj + r; j++) {
    for (let i = ci - r; i <= ci + r; i++) {
      if (i < 0 || j < 0 || i >= g.w || j >= g.h) continue;
      const col = j * g.w + i;
      const across = Math.hypot(g.x0 + (i + 0.5) * g.cellM - x, g.z0 + (j + 0.5) * g.cellM - z);
      if (across > within) continue;
      for (let k = g.first[col]; k < g.first[col + 1]; k++) {
        const d = across + Math.abs(g.y[k] - y);
        if (Math.abs(g.y[k] - y) <= 0.4 && d < bestD) [best, bestD] = [k, d];
      }
    }
  }
  return best;
}

/** The nodes inside a rectangle [x0, z0, x1, z1] (metres) whose floors lie in [y0, y1). */
export function nodesIn(g: WalkGraph, rect: readonly number[], y0: number, y1: number): number[] {
  const out: number[] = [];
  const i0 = Math.max(0, Math.floor((Math.min(rect[0], rect[2]) - g.x0) / g.cellM));
  const i1 = Math.min(g.w - 1, Math.floor((Math.max(rect[0], rect[2]) - g.x0) / g.cellM));
  const j0 = Math.max(0, Math.floor((Math.min(rect[1], rect[3]) - g.z0) / g.cellM));
  const j1 = Math.min(g.h - 1, Math.floor((Math.max(rect[1], rect[3]) - g.z0) / g.cellM));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const col = j * g.w + i;
      for (let k = g.first[col]; k < g.first[col + 1]; k++) if (g.y[k] >= y0 && g.y[k] < y1) out.push(k);
    }
  }
  return out;
}

/** Rotate v by the unit quaternion q. */
function rotate(q: { x: number; y: number; z: number; w: number }, v: [number, number, number]): [number, number, number] {
  const [x, y, z] = v;
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  return [x + q.w * tx + (q.y * tz - q.z * ty), y + q.w * ty + (q.z * tx - q.x * tz), z + q.w * tz + (q.x * ty - q.y * tx)];
}
