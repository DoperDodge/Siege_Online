// Path search over the nav grid (Phase 9 M2, bots/DESIGN.md §3): A* over the chunks' regions first (a few thousand), then
// over the nodes of the regions on that route (and those next to them), then the path pulled straight where a straight
// walk stays on nodes. Links (vaults, ladders, drops) are steps of their own in the path, each saying how it's taken.
import type { Vec3 } from "../../core/math.js";
import { LinkKind, NAV_CELL, NavFlag, NODE_SPAN, REGION_SPAN, type NavGrid, type NavLink } from "./grid.js";

/** One step of a path: a point to walk to, or a link to take from the point before it. */
export interface PathStep {
  pos: Vec3;
  /** The link that gets here (from the step before), or null: walk. */
  link: NavLink | null;
  /** The way here is low: crouch. */
  crouch: boolean;
}

/** The regions a way crosses (nav/search.ts route), refined into steps a stretch at a time as it's walked. */
export interface NavRoute {
  regions: number[];
  start: number;
  goal: number;
  /** The grid's version it was found on. */
  version: number;
}

export interface NavPath {
  steps: PathStep[];
  /** Its cost (metres walked, links by their cost). */
  cost: number;
  /** The grid's version it was found on. */
  version: number;
}

/** A min-heap of [key, value] pairs (keys: priorities). */
class Heap {
  private readonly keys: number[] = [];
  private readonly vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && k[r] < k[l] ? r : l;
        if (k[c] >= lastK) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}

/** Costs of walking crouched (slower) and of each link kind, on top of the metres. */
const CROUCH_COST = 1.6;

export class NavSearch {
  /** The region graph: each region's outgoing edges (region id → cost). */
  private readonly adj = new Map<number, Map<number, number>>();
  /** The node graph's searches give up after this many nodes (a route the regions said exists but isn't). */
  maxNodes = 120_000;
  /** Nodes the last search looked at (tests and the bench). */
  lastExpanded = 0;

  constructor(
    readonly grid: NavGrid,
    /** A search on a copy of this one's grid: its region graph copied instead of worked out again. */
    from?: NavSearch,
  ) {
    if (from) for (const [r, m] of from.adj) this.adj.set(r, new Map(m));
    else for (let k = 0; k < grid.chunks.length; k++) this.chunkEdges(k);
  }

  /** After grid.rebuild: the region edges out of these chunks (and the ladders') again. */
  refresh(chunks: Iterable<number>): void {
    const set = new Set(chunks);
    for (const l of this.grid.links) if (l?.kind === LinkKind.Ladder) set.add(Math.floor(l.from / NODE_SPAN));
    for (const k of set) this.chunkEdges(k);
  }

  private regionPos(region: number): Vec3 {
    const k = Math.floor(region / REGION_SPAN);
    const c = this.grid.chunks[k];
    const r = c.regions[region % REGION_SPAN];
    return this.grid.nodePos(k * NODE_SPAN + r.rep);
  }

  private chunkEdges(k: number): void {
    const g = this.grid;
    const c = g.chunks[k];
    for (let r = 0; r < REGION_SPAN; r++) this.adj.delete(k * REGION_SPAN + r);
    const add = (a: number, b: number, extra: number) => {
      if (a === b) return;
      let m = this.adj.get(a);
      if (!m) this.adj.set(a, (m = new Map()));
      const pa = this.regionPos(a);
      const pb = this.regionPos(b);
      const cost = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) + extra;
      const had = m.get(b);
      if (had === undefined || cost < had) m.set(b, cost);
    };
    const nb: [number, number][] = [];
    const base = k * NODE_SPAN;
    // Each pair of regions once (many edge nodes join the same two): its cost is the same each time.
    const pairs = new Set<number>();
    for (let n = 0; n < c.y.length; n++) {
      // Only nodes on the chunk's edge have neighbours in another chunk.
      const col = c.col[n];
      const li = col % 16;
      const lj = col >> 4;
      if (li !== 0 && li !== 15 && lj !== 0 && lj !== 15) continue;
      nb.length = 0;
      g.neighbours(base + n, nb);
      const a = g.regionOf(base + n);
      for (const [m] of nb) {
        if (Math.floor(m / NODE_SPAN) === k) continue;
        const b = g.regionOf(m);
        const key = a * 0x200000 + b; // region ids are under 2^21 (8192 chunks of 256)
        if (pairs.has(key)) continue;
        pairs.add(key);
        add(a, b, 0);
      }
    }
    for (const at of c.links) {
      const l = g.links[at];
      if (l) add(g.regionOf(l.from), g.regionOf(l.to), l.cost);
    }
  }

  /** The region route from one region to another (A* on the region graph), or null. */
  regionRoute(from: number, to: number): number[] | null {
    if (from === to) return [from];
    const goal = this.regionPos(to);
    const h = (r: number) => {
      const p = this.regionPos(r);
      return Math.hypot(p[0] - goal[0], p[1] - goal[1], p[2] - goal[2]);
    };
    const gs = new Map<number, number>([[from, 0]]);
    const parent = new Map<number, number>();
    const open = new Heap();
    open.push(h(from), from);
    const closed = new Set<number>();
    while (open.size) {
      const r = open.pop();
      if (closed.has(r)) continue;
      if (r === to) {
        const out = [r];
        let x = r;
        while (parent.has(x)) out.push((x = parent.get(x)!));
        return out.reverse();
      }
      closed.add(r);
      const gr = gs.get(r)!;
      for (const [s, cost] of this.adj.get(r) ?? []) {
        const ng = gr + cost;
        if (ng < (gs.get(s) ?? Infinity)) {
          gs.set(s, ng);
          parent.set(s, r);
          open.push(ng + h(s), s);
        }
      }
    }
    return null;
  }

  /** A route from `from` to `to` (feet positions): the regions it crosses, its start and goal nodes; null: none. */
  route(from: Vec3, to: Vec3): NavRoute | null {
    const g = this.grid;
    const a = g.nodeNear(from[0], from[1], from[2], 1, 0.9);
    const b = g.nodeNear(to[0], to[1], to[2], 1.5, 1.2);
    if (a < 0 || b < 0) return null;
    const regions = this.regionRoute(g.regionOf(a), g.regionOf(b));
    return regions ? { regions, start: a, goal: b, version: g.version } : null;
  }

  /**
   * The next stretch of a route from node `at`: a node path through the route's regions from the one `at` is in up to
   * `ahead` regions on (or the goal, if that's nearer), as steps. `done`: it reaches the goal. Null: `at` isn't on the
   * route, or the way along it is gone (search the route again).
   */
  refine(at: number, route: NavRoute, ahead = 4, allow?: (l: NavLink) => boolean): { steps: PathStep[]; done: boolean } | null {
    const g = this.grid;
    const here = route.regions.indexOf(g.regionOf(at));
    if (here < 0) return null;
    const last = Math.min(route.regions.length - 1, here + ahead);
    const done = last === route.regions.length - 1;
    const corridor = new Set<number>(route.regions.slice(Math.max(0, here - 1), last + 1));
    for (const r of route.regions.slice(here, last + 1)) for (const s of this.adj.get(r)?.keys() ?? []) corridor.add(s);
    const target = done ? -1 : route.regions[last];
    const found = this.nodeSearch(at, done ? route.goal : -1, target, corridor, allow);
    if (!found) return null;
    return { steps: this.smooth(found.nodes, found.links), done };
  }

  /** A whole path from `from` to `to` (the route refined to its end), or null. */
  path(from: Vec3, to: Vec3, allow?: (l: NavLink) => boolean): NavPath | null {
    const route = this.route(from, to);
    if (!route) return null;
    const steps: PathStep[] = [];
    let at = route.start;
    for (let guard = 0; guard < 1000; guard++) {
      const part = this.refine(at, route, 4, allow);
      if (!part) return null;
      steps.push(...(steps.length ? part.steps.slice(1) : part.steps));
      if (part.done) break;
      const end = part.steps[part.steps.length - 1].pos;
      const next = this.grid.nodeNear(end[0], end[1], end[2], 0.2, 0.1);
      if (next < 0 || next === at) return null;
      at = next;
    }
    let cost = 0;
    for (let i = 1; i < steps.length; i++) {
      const [a, b] = [steps[i - 1].pos, steps[i].pos];
      cost += steps[i].link ? steps[i].link!.cost : Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    return { steps, cost, version: this.grid.version };
  }

  private gs = new Float32Array(0);
  private parent = new Int32Array(0);
  private via = new Int32Array(0);
  private stamp = new Uint32Array(0);
  private closed = new Uint32Array(0);
  /** The corridor's regions, marked with the search's number. */
  private inCorridor = new Uint32Array(0);
  private search = 0;

  /**
   * A* over nodes in `corridor`'s regions, to node `goal` or, if it's -1, to any node of region `target` (aiming at
   * its representative node). Typed arrays indexed by the grid's dense numbering, marked per search, so nothing is
   * cleared or allocated per node.
   */
  private nodeSearch(a: number, goal: number, target: number, corridor: Set<number>, allow?: (l: NavLink) => boolean): { nodes: number[]; links: (NavLink | null)[] } | null {
    const g = this.grid;
    const total = g.nodeCount;
    if (this.gs.length < total) {
      const n = Math.ceil(total * 1.25);
      this.gs = new Float32Array(n);
      this.parent = new Int32Array(n);
      this.via = new Int32Array(n);
      this.stamp = new Uint32Array(n);
      this.closed = new Uint32Array(n);
    }
    const regionsMax = g.chunks.length * REGION_SPAN;
    if (this.inCorridor.length < regionsMax) this.inCorridor = new Uint32Array(regionsMax);
    const S = ++this.search;
    for (const r of corridor) this.inCorridor[r] = S;
    const aim = goal >= 0 ? g.nodePos(goal) : this.regionPos(target);
    const [ax, ay, az] = aim;
    const chunks = g.chunks;
    const cw = g.cw;
    const x0 = g.x0;
    const z0 = g.z0;
    const offset = g.offset;
    const gs = this.gs;
    const stamp = this.stamp;
    const closed = this.closed;
    const parent = this.parent;
    const via = this.via;
    const inCorridor = this.inCorridor;
    const h = (n: number): number => {
      const c = chunks[(n / NODE_SPAN) | 0];
      const local = n % NODE_SPAN;
      const col = c.col[local];
      const dx = x0 + (c.ci * 16 + (col & 15) + 0.5) * NAV_CELL - ax;
      const dy = (c.y[local] - ay) * 1.5;
      const dz = z0 + (c.cj * 16 + (col >> 4) + 0.5) * NAV_CELL - az;
      // A little greedy (1.2): far fewer nodes looked at, paths a few per cent longer at most.
      return 1.2 * Math.sqrt(dx * dx + dy * dy + dz * dz);
    };
    const open = new Heap();
    const d0 = offset[(a / NODE_SPAN) | 0] + (a % NODE_SPAN);
    stamp[d0] = S;
    gs[d0] = 0;
    parent[d0] = -1;
    via[d0] = -1;
    open.push(h(a), a);
    let expanded = 0;
    const DIAG = NAV_CELL * Math.SQRT2;
    while (open.size) {
      const n = open.pop();
      const kn = (n / NODE_SPAN) | 0;
      const ln = n % NODE_SPAN;
      const cn = chunks[kn];
      const dn = offset[kn] + ln;
      if (closed[dn] === S) continue;
      if (n === goal || (goal < 0 && kn * REGION_SPAN + cn.region[ln] === target)) {
        const nodes: number[] = [];
        const links: (NavLink | null)[] = [];
        for (let x = n; x >= 0; ) {
          const dx = g.dense(x);
          nodes.push(x);
          links.push(via[dx] >= 0 ? g.links[via[dx]] : null);
          x = parent[dx];
        }
        nodes.reverse();
        links.reverse();
        return { nodes, links };
      }
      closed[dn] = S;
      this.lastExpanded = ++expanded;
      if (expanded > this.maxNodes) return null;
      const gn = gs[dn];
      const stand = (cn.flags[ln] & NavFlag.Stand) !== 0;
      const nb = cn.nb;
      for (let k = 0; k < 8; k++) {
        const m = nb[ln * 8 + k];
        if (m < 0) continue;
        const km = (m / NODE_SPAN) | 0;
        const lm = m % NODE_SPAN;
        const cm = km === kn ? cn : chunks[km];
        if (inCorridor[km * REGION_SPAN + cm.region[lm]] !== S) continue;
        const step = (k < 4 ? NAV_CELL : DIAG) * (stand && cm.flags[lm] & NavFlag.Stand ? 1 : CROUCH_COST);
        const ng = gn + step;
        const dm = offset[km] + lm;
        if (stamp[dm] === S && ng >= gs[dm]) continue;
        stamp[dm] = S;
        gs[dm] = ng;
        parent[dm] = n;
        via[dm] = -1;
        open.push(ng + h(m), m);
      }
      for (const at of cn.links) {
        const l = g.links[at];
        if (!l || l.from !== n || (allow && !allow(l))) continue;
        const km = (l.to / NODE_SPAN) | 0;
        const lm = l.to % NODE_SPAN;
        if (inCorridor[km * REGION_SPAN + chunks[km].region[lm]] !== S) continue;
        const ng = gn + l.cost;
        const dm = offset[km] + lm;
        if (stamp[dm] === S && ng >= gs[dm]) continue;
        stamp[dm] = S;
        gs[dm] = ng;
        parent[dm] = n;
        via[dm] = at;
        open.push(ng + h(l.to), l.to);
      }
    }
    void cw;
    return null;
  }

  /** The node path as steps: links kept, walks pulled straight where a straight walk stays on nodes. */
  private smooth(nodes: number[], links: (NavLink | null)[]): PathStep[] {
    const g = this.grid;
    const steps: PathStep[] = [{ pos: g.nodePos(nodes[0]), link: null, crouch: (g.nodeFlags(nodes[0]) & NavFlag.Stand) === 0 }];
    let i = 0;
    while (i < nodes.length - 1) {
      if (links[i + 1]) {
        steps.push({ pos: g.nodePos(nodes[i + 1]), link: links[i + 1], crouch: (g.nodeFlags(nodes[i + 1]) & NavFlag.Stand) === 0 });
        i++;
        continue;
      }
      // The farthest node along the walk (no link in between) reached in a straight line on nodes of the same kind.
      let j = i + 1;
      const crouch = (g.nodeFlags(nodes[i + 1]) & NavFlag.Stand) === 0;
      while (j + 1 < nodes.length && !links[j + 1] && ((g.nodeFlags(nodes[j + 1]) & NavFlag.Stand) === 0) === crouch && this.straight(nodes[i], nodes[j + 1])) j++;
      steps.push({ pos: g.nodePos(nodes[j]), link: null, crouch });
      i = j;
    }
    return steps;
  }

  /** Whether a straight walk from node a to node b stays on nodes, each a step from the last. */
  straight(a: number, b: number): boolean {
    const g = this.grid;
    const pa = g.nodePos(a);
    const pb = g.nodePos(b);
    const len = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
    const n = Math.max(1, Math.ceil(len / (NAV_CELL * 0.5)));
    let y = pa[1];
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      const x = pa[0] + (pb[0] - pa[0]) * t;
      const z = pa[2] + (pb[2] - pa[2]) * t;
      const i = Math.floor((x - g.x0) / NAV_CELL);
      const j = Math.floor((z - g.z0) / NAV_CELL);
      const m = g.nodeAt(i, j, y);
      if (m < 0) return false;
      y = g.nodeY(m);
      // A diagonal crossing between columns: both sides must hold too (no corner cut).
      const fx = (x - g.x0) / NAV_CELL - i;
      const fz = (z - g.z0) / NAV_CELL - j;
      if ((fx < 0.15 || fx > 0.85) && (fz < 0.15 || fz > 0.85)) {
        const di = fx < 0.5 ? -1 : 1;
        const dj = fz < 0.5 ? -1 : 1;
        if (g.nodeAt(i + di, j, y) < 0 || g.nodeAt(i, j + dj, y) < 0) return false;
      }
    }
    return Math.abs(y - pb[1]) <= 0.36;
  }
}
