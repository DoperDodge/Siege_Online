// Bots' navigation grid (Phase 9 M2, bots/DESIGN.md §3, D-158): where a body can stand and how it gets from one place to
// another, read from the physics world the simulation moves bodies in (as the map generator's walk graph is,
// tools/mapgen/walkgraph.ts), so it can't disagree with movement.
//
// The level's area is cut into columns NAV_CELL square. Every collider a body collides with (walls, slabs, the
// stairs' ramps, rails, panels' movement boxes, props, solid gadgets) is laid into the columns it covers as solid
// spans; a node is a span's walkable top with a crouching body's height free above it and nothing within the body's
// radius in that height (measured to each upright box's footprint exactly, a tilted one's conservatively). Nodes in
// neighbouring columns a step apart are joined (worked out when asked, from the heights); links join what a body
// reaches by other means: a vault (the movement code's own planner), a ladder, a drop off a ledge.
//
// The columns are grouped into CHUNK × CHUNK chunks, each holding its own nodes, so a chunk is rebuilt on its own when
// what's in it changes (a hole, a breach, a reinforcement, a gadget). Each chunk's nodes split into regions (joined
// within the chunk), the units the long-range search runs over (nav/search.ts).
import { G_GADGET, G_MOVE_HELPER, G_PANEL, G_PROP, G_STATIC, type Collider } from "../../physics/rapier.js";
import type { Sim } from "../../sim.js";

/** A column's side (metres). */
export const NAV_CELL = 0.25;
/** Columns per chunk side. */
export const CHUNK = 16;
/** Node ids: a chunk's index times NODE_SPAN plus the node's index in the chunk. */
export const NODE_SPAN = 4096;
/** Region ids: a chunk's index times REGION_SPAN plus the region's index in the chunk. */
export const REGION_SPAN = 256;
/** The character controller's offset (sim.ts): a body keeps that far off what it touches. */
const SKIN = 0.02;
/** The highest drop a link takes (m): the fall's damage starts at 3 m (data/movement.json fall.safeHeight). */
export const MAX_DROP = 3.6;
/** What breaking a barricade costs a path, as metres walked (a few melee swings). */
const BREAK_COST = 6;

/** A node's flags. */
export const NavFlag = {
  /** A standing body fits (else a crouching one only). */
  Stand: 1,
  /** On a ramp (a staircase's invisible slope, any tilted box's top): joined to flat floor only where they meet level. */
  Ramp: 2,
} as const;
/** How far a ramp's node and a flat one may differ in height and still join (you get onto stairs at their ends). */
const RAMP_JOIN = 0.12;

/** How a link is taken. */
export const LinkKind = {
  /** Face it (`yaw`) and press Vault: over a sill or rail, or up onto a ledge. */
  Vault: 1,
  /** Climb a ladder (`up`) or come down one. */
  Ladder: 2,
  /** Walk off a ledge (`yaw`) and fall. */
  Drop: 3,
  /** A standing barricade (`panel`) in a doorway or window: break it (facing `yaw`), then walk or vault through. */
  Barricade: 4,
} as const;
export type LinkKind = (typeof LinkKind)[keyof typeof LinkKind];

export interface NavLink {
  kind: LinkKind;
  from: number;
  to: number;
  /** The way to face to take it. */
  yaw: number;
  /** Its cost as metres walked. */
  cost: number;
  /** A ladder's index (Ladder), up or down. */
  ladder: number;
  up: boolean;
  /** A barricade's panel index (Barricade; -1 otherwise), and whether the way through is a vault (a window). */
  panel: number;
  vault: boolean;
  /** Where it ends (its `to` is found again from it when the chunk there is rebuilt). */
  tx: number;
  ty: number;
  tz: number;
}

export interface NavChunk {
  readonly ci: number;
  readonly cj: number;
  /** Column c (local, j * CHUNK + i) has nodes first[c] .. first[c + 1] - 1, lowest first. */
  first: Int32Array;
  y: Float32Array;
  flags: Uint8Array;
  /** Each node's column in the chunk (j * CHUNK + i). */
  col: Uint8Array;
  /** Column c's solid spans (merged, lowest first) are spanFirst[c] .. spanFirst[c + 1] - 1, from y0 to y1. */
  spanFirst: Int32Array;
  y0: Float32Array;
  y1: Float32Array;
  /** Each node's walking neighbours (node ids; -1: none), 8 a node: +i, -i, +j, -j, then the diagonals. */
  nb: Int32Array;
  /** Each node's region (local index). */
  region: Uint8Array;
  /** Each region's representative node (local index) and its size. */
  regions: { rep: number; size: number }[];
  /** Links starting at this chunk's nodes (indices into NavGrid.links). */
  links: number[];
  /** Bumped every rebuild. */
  version: number;
}

/** A collider as a box: centre, half extents, its axes in the world, its bounds, which axis is up (-1: tilted). */
interface Box {
  t: [number, number, number];
  he: [number, number, number];
  axes: [number, number, number][];
  up: number;
  /** An upright box's two level axes (the indices that aren't `up`). */
  p: number;
  q: number;
  min: [number, number, number];
  max: [number, number, number];
  /** A body vaults onto it or over it (the level's tag). */
  vault: boolean;
  /** Its collider's handle. */
  handle: number;
}

/** Which colliders bodies collide with (what walkgraph.ts reads, and solid gadgets). */
const BLOCKS = G_STATIC | G_MOVE_HELPER | G_PANEL | G_PROP | G_GADGET;

export class NavGrid {
  readonly cell = NAV_CELL;
  /** The grid's corner (metres) and size in columns and chunks. */
  readonly x0: number;
  readonly z0: number;
  readonly w: number;
  readonly h: number;
  readonly cw: number;
  readonly ch: number;
  readonly chunks: NavChunk[];
  /** Every link (a removed one is null: its index may be reused). */
  readonly links: (NavLink | null)[] = [];
  private readonly freeLinks: number[] = [];
  /** Each ladder's ("L" and its index) and barricade's ("B" and its panel index) links. */
  private readonly special = new Map<string, number[]>();
  /** Bumped every rebuild of any chunk (searches started before it check their paths again). */
  version = 0;
  /** Each chunk's first node in a dense numbering of every node (searches index arrays by it), and the total. */
  offset = new Int32Array(0);
  private readonly r: number;
  private readonly step: number;
  private readonly crouchH: number;
  private readonly standH: number;
  private readonly minUp: number;

  constructor(readonly sim: Sim) {
    const m = sim.data.movement;
    const b = sim.level.def.bounds;
    if (!b) throw new Error("NavGrid: the level has no bounds");
    this.x0 = b.min[0];
    this.z0 = b.min[2];
    this.w = Math.ceil((b.max[0] - b.min[0]) / NAV_CELL);
    this.h = Math.ceil((b.max[2] - b.min[2]) / NAV_CELL);
    this.cw = Math.ceil(this.w / CHUNK);
    this.ch = Math.ceil(this.h / CHUNK);
    this.r = m.stance.collisionRadius + SKIN;
    this.step = m.step.maxStepHeight;
    this.crouchH = m.stance.crouch.height;
    this.standH = m.stance.stand.height;
    this.minUp = Math.cos((m.step.maxSlopeDeg * Math.PI) / 180);
    this.chunks = Array.from({ length: this.cw * this.ch }, (_, k) => ({
      ci: k % this.cw,
      cj: Math.floor(k / this.cw),
      first: new Int32Array(CHUNK * CHUNK + 1),
      y: new Float32Array(0),
      flags: new Uint8Array(0),
      col: new Uint8Array(0),
      spanFirst: new Int32Array(CHUNK * CHUNK + 1),
      y0: new Float32Array(0),
      y1: new Float32Array(0),
      nb: new Int32Array(0),
      region: new Uint8Array(0),
      regions: [],
      links: [],
      version: 0,
    }));
  }

  /** Build every chunk's nodes, then every link and region (the first build). */
  build(): void {
    for (let k = 0; k < this.chunks.length; k++) this.buildNodes(k);
    for (let k = 0; k < this.chunks.length; k++) this.buildNeighbours(k);
    for (let k = 0; k < this.chunks.length; k++) this.buildLinks(k, true);
    this.sim.level.ladders.forEach((_, i) => this.buildLadder(i));
    for (const e of this.sim.level.panels.list) if (e.panel.kind === "barricade") this.buildBarricade(e.panel.spec.index);
    for (let k = 0; k < this.chunks.length; k++) this.buildRegions(k);
    this.numberNodes();
    this.version++;
  }

  /** A copy of this grid for another simulation of the same level as it is now (a room's, from a level's pristine one). */
  /**
   * The grid version each chunk was last rebuilt at (none: as built). A route that crosses no chunk rebuilt since it
   * was found still holds (its regions' and nodes' numbers are the same): only those through a change look again.
   */
  readonly rebuiltAt = new Map<number, number>();

  /**
   * Each chunk's nodes inside the building (1) or not (0), and its regions with a node inside (red walls keep a
   * defender's feet in the building in prep: bots/DESIGN.md §12): worked out when first asked, again after a rebuild.
   */
  private readonly insideNodes = new Map<number, { nodes: Uint8Array; regions: Uint8Array }>();

  private insideOfChunk(k: number): { nodes: Uint8Array; regions: Uint8Array } {
    let had = this.insideNodes.get(k);
    if (had) return had;
    const c = this.chunks[k];
    const nodes = new Uint8Array(c.y.length);
    const regions = new Uint8Array(REGION_SPAN);
    for (let n = 0; n < c.y.length; n++) {
      const [x, y, z] = this.nodePos(k * NODE_SPAN + n);
      if (!this.sim.insideBuilding(x, y, z)) continue;
      nodes[n] = 1;
      regions[c.region[n]] = 1;
    }
    this.insideNodes.set(k, (had = { nodes, regions }));
    return had;
  }

  /** Whether a node is inside the building. */
  insideAt(n: number): boolean {
    return this.insideOfChunk(Math.floor(n / NODE_SPAN)).nodes[n % NODE_SPAN] === 1;
  }

  /** Whether a region has a node inside the building. */
  regionInside(r: number): boolean {
    return this.insideOfChunk(Math.floor(r / REGION_SPAN)).regions[r % REGION_SPAN] === 1;
  }

  /** Whether a route found at `version` through these regions (and from and to these nodes) still holds. */
  routeHolds(version: number, regions: readonly number[], nodes: readonly number[]): boolean {
    if (version === this.version) return true;
    if (this.rebuiltAt.size === 0) return true;
    for (const r of regions) if ((this.rebuiltAt.get(Math.floor(r / REGION_SPAN)) ?? -1) > version) return false;
    for (const n of nodes) if ((this.rebuiltAt.get(Math.floor(n / NODE_SPAN)) ?? -1) > version) return false;
    return true;
  }

  clone(sim: Sim): NavGrid {
    const g = new NavGrid(sim);
    this.chunks.forEach((c, k) => {
      const d = g.chunks[k];
      d.first = c.first.slice();
      d.y = c.y.slice();
      d.flags = c.flags.slice();
      d.col = c.col.slice();
      d.spanFirst = c.spanFirst.slice();
      d.y0 = c.y0.slice();
      d.y1 = c.y1.slice();
      d.nb = c.nb.slice();
      d.region = c.region.slice();
      d.regions = c.regions.map((r) => ({ ...r }));
      d.links = [...c.links];
      d.version = c.version;
    });
    g.links.push(...this.links.map((l) => (l ? { ...l } : null)));
    g.freeLinks.push(...this.freeLinks);
    for (const [key, at] of this.special) g.special.set(key, [...at]);
    g.offset = this.offset.slice();
    g.version = this.version;
    for (const [key, p] of this.probes) g.probes.set(key, p);
    return g;
  }

  /**
   * Vault probes made (the movement code's own vault, run from a node toward a prop: the costliest part of a rebuild),
   * kept by where and which way: a chunk rebuilt because a door was barricaded a few metres off needn't probe its
   * tables again. Those in an area that changed are forgotten (NavWorld.mark), so they're probed afresh.
   */
  private readonly probes = new Map<string, { x: number; z: number; plan: ReturnType<Sim["probeVault"]> }>();

  private vaultProbe(x: number, y: number, z: number, yaw: number): ReturnType<Sim["probeVault"]> {
    const key = `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)},${Math.round(yaw * 1000)}`;
    const had = this.probes.get(key);
    if (had) return had.plan;
    const plan = this.sim.probeVault(x, y, z, yaw);
    this.probes.set(key, { x, z, plan });
    return plan;
  }

  /** Forget the vault probes made from inside a box of the world [x0, z0]–[x1, z1] (something there changed). */
  forgetProbes(x0: number, z0: number, x1: number, z1: number): void {
    for (const [key, p] of this.probes) if (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1) this.probes.delete(key);
  }

  /** The dense numbering (after any chunk's nodes changed). */
  private numberNodes(): void {
    const o = new Int32Array(this.chunks.length + 1);
    for (let k = 0; k < this.chunks.length; k++) o[k + 1] = o[k] + this.chunks[k].y.length;
    this.offset = o;
  }

  /** How many nodes there are. */
  get nodeCount(): number {
    return this.offset[this.chunks.length] ?? 0;
  }

  /** A node's place in the dense numbering. */
  dense(id: number): number {
    return this.offset[Math.floor(id / NODE_SPAN)] + (id % NODE_SPAN);
  }

  /**
   * Rebuild these chunks (what's in them changed): their nodes and regions, and the links starting in them or in a
   * chunk next to them (a link may end in a rebuilt chunk). Returns the chunks whose links were redone.
   */
  rebuild(chunks: Iterable<number>): number[] {
    const set = new Set(chunks);
    for (const k of set) {
      this.buildNodes(k);
      this.insideNodes.delete(k);
    }
    const around = new Set<number>();
    for (const k of set) for (const n of this.chunkNeighbours(k, true)) around.add(n);
    // A rebuilt chunk's edge nodes are a neighbour chunk's nodes' neighbours too: its own nodes' lists whole, the
    // neighbours' only along the edge they share with it.
    for (const k of around) this.buildNeighbours(k, set.has(k) ? undefined : set);
    for (const k of around) {
      if (set.has(k)) this.buildLinks(k, true);
      else {
        // A chunk next to a rebuilt one: its drops into the rebuilt chunks again (a new hole may be next to its nodes),
        // and its vaults that end in one pointed at the node now there (or dropped).
        this.buildLinks(k, false, set);
        for (const at of [...this.chunks[k].links]) {
          const l = this.links[at];
          if (!l || l.kind !== LinkKind.Vault || !set.has(Math.floor(l.to / NODE_SPAN))) continue;
          const to = this.nodeNear(l.tx, l.ty, l.tz, 0.3, 0.3);
          if (to < 0) this.removeLink(at);
          else l.to = to;
        }
      }
    }
    // Ladders and barricades with an end in a rebuilt chunk, or a barricade in or next to one (it may have broken).
    for (const [key, ats] of [...this.special]) {
      const touched = ats.some((at) => {
        const l = this.links[at];
        return l && (set.has(Math.floor(l.from / NODE_SPAN)) || set.has(Math.floor(l.to / NODE_SPAN)));
      });
      const [kind, idx] = [key[0], Number(key.slice(1))];
      if (kind === "B") {
        const f = this.sim.level.panels.list[idx].frame;
        const k = this.chunkOf(Math.floor((f.center[0] - this.x0) / NAV_CELL), Math.floor((f.center[2] - this.z0) / NAV_CELL));
        if (touched || around.has(k)) this.buildBarricade(idx);
      } else if (touched) this.buildLadder(idx);
    }
    for (const k of set) this.buildRegions(k);
    this.numberNodes();
    this.version++;
    for (const k of set) this.rebuiltAt.set(k, this.version);
    return [...around];
  }

  // ------------------------------------------------------------------ lookups

  /** The chunk index of column (i, j), or -1 outside the grid. */
  chunkOf(i: number, j: number): number {
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return Math.floor(j / CHUNK) * this.cw + Math.floor(i / CHUNK);
  }

  /** The chunks a box of the world [x0, z0]–[x1, z1] overlaps. */
  chunksIn(x0: number, z0: number, x1: number, z1: number): number[] {
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / NAV_CELL / CHUNK));
    const i1 = Math.min(this.cw - 1, Math.floor((x1 - this.x0) / NAV_CELL / CHUNK));
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / NAV_CELL / CHUNK));
    const j1 = Math.min(this.ch - 1, Math.floor((z1 - this.z0) / NAV_CELL / CHUNK));
    const out: number[] = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push(j * this.cw + i);
    return out;
  }

  /** The chunks of the columns within `r` of column (i, j) (its own first). */
  /**
   * Whether a chunk of `set` is within `r` columns of column (i, j). The square that far round it is smaller than a
   * chunk, so the chunks it touches are its corners' (no list made: a rebuild asks this of every column next to it).
   */
  private nearAny(i: number, j: number, r: number, set: ReadonlySet<number>): boolean {
    return set.has(this.chunkOf(i - r, j - r)) || set.has(this.chunkOf(i + r, j - r)) || set.has(this.chunkOf(i - r, j + r)) || set.has(this.chunkOf(i + r, j + r)) || set.has(this.chunkOf(i, j));
  }

  /** A chunk and the (up to 8) chunks around it. */
  chunkNeighbours(k: number, self = false): number[] {
    const ci = k % this.cw;
    const cj = Math.floor(k / this.cw);
    const out: number[] = [];
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!self && di === 0 && dj === 0) continue;
        const [a, b] = [ci + di, cj + dj];
        if (a >= 0 && b >= 0 && a < this.cw && b < this.ch) out.push(b * this.cw + a);
      }
    return out;
  }

  /** Column (i, j)'s node range as [chunk, first, end) (end == first: none). */
  column(i: number, j: number): [NavChunk | null, number, number] {
    const k = this.chunkOf(i, j);
    if (k < 0) return [null, 0, 0];
    const c = this.chunks[k];
    const col = (j % CHUNK) * CHUNK + (i % CHUNK);
    return [c, c.first[col], c.first[col + 1]];
  }

  /** A node's chunk, local index, column and floor height. */
  nodeChunk(id: number): NavChunk {
    return this.chunks[Math.floor(id / NODE_SPAN)];
  }

  nodeY(id: number): number {
    return this.nodeChunk(id).y[id % NODE_SPAN];
  }

  nodeFlags(id: number): number {
    return this.nodeChunk(id).flags[id % NODE_SPAN];
  }

  /** A node's column (i, j) in the grid. */
  nodeColumn(id: number): [number, number] {
    const c = this.nodeChunk(id);
    const col = c.col[id % NODE_SPAN];
    return [c.ci * CHUNK + (col % CHUNK), c.cj * CHUNK + (col >> 4)];
  }

  /** A node's position: its column's centre, on its floor. */
  nodePos(id: number): [number, number, number] {
    const [i, j] = this.nodeColumn(id);
    return [this.x0 + (i + 0.5) * NAV_CELL, this.nodeY(id), this.z0 + (j + 0.5) * NAV_CELL];
  }

  /** A node's region id (global). */
  regionOf(id: number): number {
    const c = this.nodeChunk(id);
    return (c.cj * this.cw + c.ci) * REGION_SPAN + c.region[id % NODE_SPAN];
  }

  /** The node in column (i, j) within `tol` of height y (the nearest), or -1. */
  nodeAt(i: number, j: number, y: number, tol = this.step): number {
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    const k = ((j / CHUNK) | 0) * this.cw + ((i / CHUNK) | 0);
    const c = this.chunks[k];
    const col = (j % CHUNK) * CHUNK + (i % CHUNK);
    let best = -1;
    let bestD = tol + 1e-6;
    for (let n = c.first[col], e = c.first[col + 1]; n < e; n++) {
      const d = Math.abs(c.y[n] - y);
      if (d <= bestD) {
        best = n;
        bestD = d;
      }
    }
    return best < 0 ? -1 : k * NODE_SPAN + best;
  }

  /** The node nearest (x, y, z) within `within` metres across and `up` up or down, or -1 (the nearest across first). */
  nodeNear(x: number, y: number, z: number, within = 0.75, up = 0.6): number {
    const rr = Math.ceil(within / NAV_CELL);
    const ci = Math.floor((x - this.x0) / NAV_CELL);
    const cj = Math.floor((z - this.z0) / NAV_CELL);
    let best = -1;
    let bestD = Infinity;
    for (let j = cj - rr; j <= cj + rr; j++) {
      for (let i = ci - rr; i <= ci + rr; i++) {
        const [c, a, b] = this.column(i, j);
        if (!c || a === b) continue;
        const across = Math.hypot(this.x0 + (i + 0.5) * NAV_CELL - x, this.z0 + (j + 0.5) * NAV_CELL - z);
        if (across > within) continue;
        for (let n = a; n < b; n++) {
          const dy = c.y[n] - y;
          if (dy > up || dy < -up) continue;
          const d = across + Math.abs(dy) * 0.5;
          if (d < bestD) [best, bestD] = [(c.cj * this.cw + c.ci) * NODE_SPAN + n, d];
        }
      }
    }
    return best;
  }

  /** The nodes a node joins by walking, as [node, metres] pairs pushed onto `out` (what buildNeighbours found). */
  neighbours(id: number, out: [number, number][]): void {
    const c = this.nodeChunk(id);
    const at = (id % NODE_SPAN) * 8;
    for (let k = 0; k < 8; k++) {
      const n = c.nb[at + k];
      if (n >= 0) out.push([n, k < 4 ? NAV_CELL : NAV_CELL * Math.SQRT2]);
    }
  }

  /**
   * Every node of chunk k's walking neighbours (computeNeighbours), kept for the searches; with `next`, only the nodes
   * in its edge columns next to those chunks (the rest are kept).
   */
  private buildNeighbours(k: number, next?: Set<number>): void {
    const c = this.chunks[k];
    const keep = next !== undefined && c.nb.length === c.y.length * 8;
    const nb = keep ? c.nb : new Int32Array(c.y.length * 8).fill(-1);
    const tmp: [number, number][] = [];
    for (let n = 0; n < c.y.length; n++) {
      if (keep) {
        const col = c.col[n];
        const [i, j] = [c.ci * CHUNK + (col % CHUNK), c.cj * CHUNK + (col >> 4)];
        if (!next.has(this.chunkOf(i + 1, j)) && !next.has(this.chunkOf(i - 1, j)) && !next.has(this.chunkOf(i, j + 1)) && !next.has(this.chunkOf(i, j - 1)) && !next.has(this.chunkOf(i + 1, j + 1)) && !next.has(this.chunkOf(i - 1, j - 1)) && !next.has(this.chunkOf(i + 1, j - 1)) && !next.has(this.chunkOf(i - 1, j + 1))) continue;
        nb.fill(-1, n * 8, n * 8 + 8);
      }
      tmp.length = 0;
      this.computeNeighbours(k * NODE_SPAN + n, tmp);
      let ortho = 0;
      let diag = 4;
      for (const [m, d] of tmp) nb[n * 8 + (d < NAV_CELL * 1.1 ? ortho++ : diag++)] = m;
    }
    c.nb = nb;
  }

  /**
   * The nodes a node joins by walking: its 8 neighbours' nodes within a step (a diagonal only where both sides join
   * too, so no corner is cut), as [node, metres] pairs pushed onto `out`.
   */
  private computeNeighbours(id: number, out: [number, number][]): void {
    const ramp = this.nodeFlags(id) & NavFlag.Ramp;
    // Onto a ramp from flat floor (or off it) only where the two are level: no stepping onto stairs from their side.
    const joins = (n: number) => n >= 0 && ((this.nodeFlags(n) & NavFlag.Ramp) === ramp || Math.abs(this.nodeY(n) - this.nodeY(id)) <= RAMP_JOIN);
    const [i, j] = this.nodeColumn(id);
    const y = this.nodeY(id);
    const ortho: number[] = [-1, -1, -1, -1];
    const D = DIRS4;
    for (let k = 0; k < 4; k++) {
      const n = this.nodeAt(i + D[k][0], j + D[k][1], y);
      ortho[k] = joins(n) ? n : -1;
      if (ortho[k] >= 0) out.push([n, NAV_CELL]);
    }
    for (const [di, dj, a, b] of DIAG) {
      if (ortho[a] < 0 || ortho[b] < 0) continue;
      const n = this.nodeAt(i + di, j + dj, y);
      if (joins(n)) out.push([n, NAV_CELL * Math.SQRT2]);
    }
  }

  // ------------------------------------------------------------------ building

  /** The colliders bodies collide with over a box of the world, as boxes. */
  private boxesIn(x0: number, z0: number, x1: number, z1: number): Box[] {
    const sim = this.sim;
    const b = sim.level.def.bounds!;
    const cy = (b.min[1] + b.max[1]) / 2;
    const out: Box[] = [];
    sim.world.collidersWithAabbIntersectingAabb({ x: (x0 + x1) / 2, y: cy, z: (z0 + z1) / 2 }, { x: (x1 - x0) / 2, y: (b.max[1] - b.min[1]) / 2 + 2, z: (z1 - z0) / 2 }, (col: Collider) => {
      if (!((col.collisionGroups() >>> 16) & BLOCKS) || col.isSensor() || !col.isEnabled()) return true;
      if (col.shapeType() !== sim.R.ShapeType.Cuboid) return true; // (none in the levels; a capsule or ball is left to the follower)
      const he = col.halfExtents()!;
      const t = col.translation();
      const q = col.rotation();
      const axes = [rotate(q, [1, 0, 0]), rotate(q, [0, 1, 0]), rotate(q, [0, 0, 1])];
      const hev: [number, number, number] = [he.x, he.y, he.z];
      const ext = [0, 1, 2].map((k) => axes.reduce((s, a, n) => s + Math.abs(a[k]) * hev[n], 0));
      const up = axes.findIndex((a) => Math.abs(a[1]) > 1 - 1e-6);
      out.push({
        t: [t.x, t.y, t.z],
        he: hev,
        axes,
        up,
        p: up === 0 ? 1 : 0,
        q: up === 2 ? 1 : 2,
        min: [t.x - ext[0], t.y - ext[1], t.z - ext[2]],
        max: [t.x + ext[0], t.y + ext[1], t.z + ext[2]],
        vault: sim.level.solids.get(col.handle)?.vaultable === true,
        handle: col.handle,
      });
      return true;
    });
    return out;
  }

  /** Where the vertical line through (x, z) crosses a box: [y0, y1, walkable top], or null. */
  private crossing(box: Box, x: number, z: number): [number, number, boolean] | null {
    const o = [x - box.t[0], 0, z - box.t[2]];
    if (box.up >= 0) {
      const ap = box.axes[box.p];
      const aq = box.axes[box.q];
      if (Math.abs(o[0] * ap[0] + o[2] * ap[2]) > box.he[box.p] || Math.abs(o[0] * aq[0] + o[2] * aq[2]) > box.he[box.q]) return null;
      return [box.min[1], box.max[1], true];
    }
    let lo = -Infinity;
    let hi = Infinity;
    let top = -1;
    for (let k = 0; k < 3 && lo <= hi; k++) {
      const a = box.axes[k];
      const s = o[0] * a[0] + o[2] * a[2];
      if (Math.abs(a[1]) < 1e-9) {
        if (Math.abs(s) > box.he[k]) return null;
        continue;
      }
      const [ya, yb] = [(-box.he[k] - s) / a[1], (box.he[k] - s) / a[1]];
      lo = Math.max(lo, Math.min(ya, yb));
      if (Math.max(ya, yb) < hi) [hi, top] = [Math.max(ya, yb), k];
    }
    if (lo > hi) return null;
    return [box.t[1] + lo, box.t[1] + hi, top >= 0 && Math.abs(box.axes[top][1]) >= this.minUp];
  }

  /** How far (x, z) is from an upright box's footprint (0 inside it). */
  private footDist(box: Box, x: number, z: number): number {
    const { p, q } = box;
    const dx = x - box.t[0];
    const dz = z - box.t[2];
    const u = Math.max(0, Math.abs(dx * box.axes[p][0] + dz * box.axes[p][2]) - box.he[p]);
    const v = Math.max(0, Math.abs(dx * box.axes[q][0] + dz * box.axes[q][2]) - box.he[q]);
    return Math.hypot(u, v);
  }

  /** Whether a box is in the way of a body at (x, y, z) up to `height` (a step's height over its feet doesn't count). */
  private inWay(box: Box, x: number, y: number, z: number, height: number): boolean {
    const lo = y + this.step;
    const hi = y + height;
    if (box.max[1] <= lo || box.min[1] >= hi) return false;
    if (box.max[0] < x - this.r || box.min[0] > x + this.r || box.max[2] < z - this.r || box.min[2] > z + this.r) return false;
    if (box.up >= 0) return this.footDist(box, x, z) < this.r;
    // A tilted box (a ramp, a leaning gadget): where it is under the body's centre and round its edge.
    for (let k = 0; k <= 8; k++) {
      const a = (k * Math.PI) / 4;
      const [sx, sz] = k === 8 ? [x, z] : [x + Math.cos(a) * this.r, z + Math.sin(a) * this.r];
      const c = this.crossing(box, sx, sz);
      if (c && c[1] > lo && c[0] < hi) return true;
    }
    return false;
  }

  private buildNodes(k: number): void {
    const ch = this.chunks[k];
    const c = NAV_CELL;
    const i0 = ch.ci * CHUNK;
    const j0 = ch.cj * CHUNK;
    const ax0 = this.x0 + i0 * c;
    const az0 = this.z0 + j0 * c;
    const margin = this.r + c;
    const boxes = this.boxesIn(ax0 - margin, az0 - margin, ax0 + CHUNK * c + margin, az0 + CHUNK * c + margin);
    const ys: number[] = [];
    const fl: number[] = [];
    const cols: number[] = [];
    const first = new Int32Array(CHUNK * CHUNK + 1);
    const spanFirst = new Int32Array(CHUNK * CHUNK + 1);
    const sy0: number[] = [];
    const sy1: number[] = [];
    const spans: [number, number, boolean, boolean][] = [];
    for (let lj = 0; lj < CHUNK; lj++) {
      for (let li = 0; li < CHUNK; li++) {
        const col = lj * CHUNK + li;
        first[col] = ys.length;
        spanFirst[col] = sy0.length;
        const [i, j] = [i0 + li, j0 + lj];
        if (i >= this.w || j >= this.h) continue;
        const x = this.x0 + (i + 0.5) * c;
        const z = this.z0 + (j + 0.5) * c;
        // The column's solid spans, lowest first, touching ones joined (a wall on a slab): an upright box counts in
        // every column whose square it overlaps (a rail thinner than a column still blocks), a tilted one where the
        // column's centre line crosses it.
        spans.length = 0;
        for (const b of boxes) {
          if (b.max[0] < x - c / 2 || b.min[0] > x + c / 2 || b.max[2] < z - c / 2 || b.min[2] > z + c / 2) continue;
          let hit: [number, number, boolean, boolean] | null = null;
          if (b.up >= 0) {
            const ap = b.axes[b.p];
            const aq = b.axes[b.q];
            const dx = x - b.t[0];
            const dz = z - b.t[2];
            if (Math.abs(dx * ap[0] + dz * ap[2]) <= b.he[b.p] + (c / 2) * (Math.abs(ap[0]) + Math.abs(ap[2])) && Math.abs(dx * aq[0] + dz * aq[2]) <= b.he[b.q] + (c / 2) * (Math.abs(aq[0]) + Math.abs(aq[2]))) hit = [b.min[1], b.max[1], true, false];
          } else {
            const cr = this.crossing(b, x, z);
            if (cr) hit = [cr[0], cr[1], cr[2], true];
          }
          if (hit) spans.push(hit);
        }
        spans.sort((a, b) => a[0] - b[0]);
        const merged: [number, number, boolean, boolean][] = [];
        for (const s of spans) {
          const last = merged[merged.length - 1];
          if (last && s[0] <= last[1] + 0.01) {
            if (s[1] > last[1] + 1e-4) [last[1], last[2], last[3]] = [s[1], s[2], s[3]];
            else if (s[1] > last[1] - 1e-4) {
              last[2] ||= s[2];
              last[3] &&= s[3];
            }
          } else merged.push([s[0], s[1], s[2], s[3]]);
        }
        for (const m of merged) {
          sy0.push(m[0]);
          sy1.push(m[1]);
        }
        for (let n = 0; n < merged.length; n++) {
          if (!merged[n][2]) continue;
          const y = merged[n][1];
          const room = (n + 1 < merged.length ? merged[n + 1][0] : Infinity) - y;
          if (room < this.crouchH) continue;
          let crouch = true;
          let stand = room >= this.standH + SKIN;
          for (const b of boxes) {
            if (!stand && !crouch) break;
            if (crouch && this.inWay(b, x, y, z, this.crouchH)) crouch = false;
            else if (stand && this.inWay(b, x, y, z, this.standH)) stand = false;
          }
          if (!crouch) continue;
          ys.push(y);
          fl.push((stand ? NavFlag.Stand : 0) | (merged[n][3] ? NavFlag.Ramp : 0));
          cols.push(col);
        }
      }
    }
    first[CHUNK * CHUNK] = ys.length;
    spanFirst[CHUNK * CHUNK] = sy0.length;
    if (ys.length > NODE_SPAN) throw new Error(`NavGrid: chunk ${k} has ${ys.length} nodes (at most ${NODE_SPAN})`);
    ch.first = first;
    ch.y = Float32Array.from(ys);
    ch.flags = Uint8Array.from(fl);
    ch.col = Uint8Array.from(cols);
    ch.spanFirst = spanFirst;
    ch.y0 = Float32Array.from(sy0);
    ch.y1 = Float32Array.from(sy1);
    ch.region = new Uint8Array(ys.length);
    ch.regions = [];
    ch.version++;
  }

  /** A chunk's regions: its nodes joined by walking within the chunk; each region's node nearest its middle. */
  private buildRegions(k: number): void {
    const ch = this.chunks[k];
    const n = ch.y.length;
    const seen = new Int16Array(n).fill(-1);
    const regions: { rep: number; size: number }[] = [];
    const nb: [number, number][] = [];
    const base = k * NODE_SPAN;
    for (let s = 0; s < n; s++) {
      if (seen[s] >= 0) continue;
      if (regions.length >= REGION_SPAN) throw new Error(`NavGrid: chunk ${k} has more than ${REGION_SPAN} regions`);
      const r = regions.length;
      const members: number[] = [s];
      seen[s] = r;
      for (let q = 0; q < members.length; q++) {
        nb.length = 0;
        this.neighbours(base + members[q], nb);
        for (const [m] of nb) {
          if (Math.floor(m / NODE_SPAN) !== k) continue;
          const local = m % NODE_SPAN;
          if (seen[local] >= 0) continue;
          seen[local] = r;
          members.push(local);
        }
      }
      let [sx, sy, sz] = [0, 0, 0];
      for (const m of members) {
        const p = this.nodePos(base + m);
        sx += p[0];
        sy += p[1];
        sz += p[2];
      }
      const [mx, my, mz] = [sx / members.length, sy / members.length, sz / members.length];
      let rep = members[0];
      let best = Infinity;
      for (const m of members) {
        const p = this.nodePos(base + m);
        const d = Math.hypot(p[0] - mx, (p[1] - my) * 2, p[2] - mz);
        if (d < best) [rep, best] = [m, d];
      }
      regions.push({ rep, size: members.length });
    }
    for (let s = 0; s < n; s++) ch.region[s] = seen[s];
    ch.regions = regions;
  }

  // ------------------------------------------------------------------ links

  private addLink(l: Omit<NavLink, "tx" | "ty" | "tz">): number {
    const at = this.freeLinks.pop() ?? this.links.length;
    const [tx, ty, tz] = this.nodePos(l.to);
    this.links[at] = { ...l, tx, ty, tz };
    this.nodeChunk(l.from).links.push(at);
    return at;
  }

  /** Remove one link. */
  /**
   * A link a body couldn't take (stuck at a drop's lip, a vault that doesn't go): out of the grid, and the routes
   * through its chunk look again; it's built again if its chunk is rebuilt. The chunk, or -1 (not found).
   */
  blockLink(link: NavLink): number {
    const at = this.links.indexOf(link);
    if (at < 0) return -1;
    const k = Math.floor(link.from / NODE_SPAN);
    this.removeLink(at);
    this.version++;
    this.rebuiltAt.set(k, this.version);
    return k;
  }

  private removeLink(at: number): void {
    const l = this.links[at];
    if (!l) return;
    const c = this.nodeChunk(l.from);
    c.links = c.links.filter((x) => x !== at);
    this.links[at] = null;
    this.freeLinks.push(at);
  }

  /** Drop every link starting in chunk k (or every ladder link), freeing their places. */
  private dropLinks(k: number, keep: (l: NavLink) => boolean): void {
    const ch = this.chunks[k];
    ch.links = ch.links.filter((at) => {
      const l = this.links[at];
      if (!l || keep(l)) return l !== null;
      this.links[at] = null;
      this.freeLinks.push(at);
      return false;
    });
  }

  /**
   * The vaults (`vaults`) and drops that start at chunk k's nodes; with `into`, only the drops landing in those chunks
   * (from its columns near them), the rest kept.
   */
  private buildLinks(k: number, vaults: boolean, into?: Set<number>): void {
    const landsIn = (l: NavLink) => into !== undefined && into.has(Math.floor(l.to / NODE_SPAN));
    this.dropLinks(k, (l) => l.kind === LinkKind.Ladder || l.kind === LinkKind.Barricade || (!vaults && l.kind === LinkKind.Vault) || (l.kind === LinkKind.Drop && into !== undefined && !landsIn(l)));
    const ch = this.chunks[k];
    const base = k * NODE_SPAN;
    const c = NAV_CELL;
    const i0 = ch.ci * CHUNK;
    const j0 = ch.cj * CHUNK;
    const ax0 = this.x0 + i0 * c;
    const az0 = this.z0 + j0 * c;
    const reach = this.r + 0.35;
    const vaultBoxes = vaults ? this.boxesIn(ax0 - reach, az0 - reach, ax0 + CHUNK * c + reach, az0 + CHUNK * c + reach).filter((b) => b.vault && b.up >= 0) : [];
    const v = this.sim.data.movement.vault;
    for (let lj = 0; lj < CHUNK; lj++) {
      for (let li = 0; li < CHUNK; li++) {
        const col = lj * CHUNK + li;
        const [i, j] = [i0 + li, j0 + lj];
        // Only the columns a drop into `into` could start from (two columns from its edge).
        if (into && !this.nearAny(i, j, 2, into)) continue;
        const x = this.x0 + (i + 0.5) * c;
        const z = this.z0 + (j + 0.5) * c;
        for (let n = ch.first[col]; n < ch.first[col + 1]; n++) {
          const y = ch.y[n];
          const id = base + n;
          // Vaults: facing a vaultable box near enough, at a height a vault takes, the movement code decides.
          const tried: number[] = [];
          for (const b of vaults ? vaultBoxes : []) {
            if (b.max[1] < y + v.minHeight - 0.05 || b.max[1] > y + v.maxOntoHeight + 0.05 || b.min[1] > y + v.maxOntoHeight) continue;
            const d = this.footDist(b, x, z);
            if (d < this.r - 0.01 || d > reach) continue;
            // Face it square: along the footprint's axis its nearest face is on.
            const { p, q } = b;
            const dx = x - b.t[0];
            const dz = z - b.t[2];
            const u = dx * b.axes[p][0] + dz * b.axes[p][2];
            const w2 = dx * b.axes[q][0] + dz * b.axes[q][2];
            const outU = Math.abs(u) - b.he[p];
            const outW = Math.abs(w2) - b.he[q];
            const axis = outU >= outW ? b.axes[p] : b.axes[q];
            const sgn = outU >= outW ? Math.sign(u) : Math.sign(w2);
            // Facing -sgn * axis (toward the box): yaw with forwardXZ(yaw) = that direction.
            const fx = -sgn * axis[0];
            const fz = -sgn * axis[2];
            const yaw = Math.atan2(-fx, -fz);
            if (tried.some((t) => Math.abs(Math.atan2(Math.sin(t - yaw), Math.cos(t - yaw))) < 0.2)) continue;
            tried.push(yaw);
            const plan = this.vaultProbe(x, y, z, yaw);
            if (!plan) continue;
            const to = this.nodeNear(plan.toX, plan.toY, plan.toZ, 0.45, 0.4);
            if (to < 0 || to === id) continue;
            const dist = Math.hypot(plan.toX - x, plan.toZ - z);
            if (dist < 0.4 && Math.abs(plan.toY - y) < this.step) continue;
            this.addLink({ kind: LinkKind.Vault, from: id, to, yaw, cost: dist + plan.seconds * 3, ladder: -1, up: false, panel: -1, vault: false });
          }
          // Drops: off a ledge where a neighbour column has no floor within a step, onto a floor up to MAX_DROP below
          // one or two columns out, with nothing but air in between.
          // Drops: square off a ledge (no corner: a body's edge rides a corner and it walks on over the gap), where the
          // next DROP_OPEN columns out are open air at the ledge's height, onto the floor below the last of them (up to
          // MAX_DROP down): far enough out that the body's centre is over the gap and it falls.
          for (const [di, dj] of DIRS4) {
            if (this.nodeAt(i + di, j + dj, y) >= 0) continue;
            let open = true;
            for (let out = 1; out <= DROP_OPEN && open; out++) open = this.open(i + di * out, j + dj * out, y - this.step, y + this.crouchH) && this.nodeAt(i + di * out, j + dj * out, y) < 0;
            if (!open) continue;
            const [ii, jj] = [i + di * DROP_OPEN, j + dj * DROP_OPEN];
            const lk = this.chunkOf(ii, jj);
            if (lk < 0) continue;
            const lc = this.chunks[lk];
            const lcol = (jj % CHUNK) * CHUNK + (ii % CHUNK);
            let landed = -1;
            for (let m = lc.first[lcol + 1] - 1; m >= lc.first[lcol]; m--) {
              const drop = y - lc.y[m];
              if (drop > this.step && drop <= MAX_DROP) {
                landed = lk * NODE_SPAN + m;
                break;
              }
            }
            if (landed < 0 || (into && !into.has(Math.floor(landed / NODE_SPAN)))) continue;
            // Nothing solid in the columns out between the landing and a crouching body's head on the ledge.
            const ly = this.nodeY(landed);
            let clear = true;
            for (let out = 1; out <= DROP_OPEN && clear; out++) clear = this.open(i + di * out, j + dj * out, ly + 0.05, y + this.crouchH);
            if (!clear) continue;
            const drop = y - ly;
            const yaw = Math.atan2(-di, -dj);
            this.addLink({ kind: LinkKind.Drop, from: id, to: landed, yaw, cost: NAV_CELL * DROP_OPEN + drop + (drop > 3 ? 6 : 0), ladder: -1, up: false, panel: -1, vault: false });
          }
        }
      }
    }
  }

  /** Whether column (i, j) has nothing solid between heights y0 and y1 (its spans as built). */
  private open(i: number, j: number, y0: number, y1: number): boolean {
    const k = this.chunkOf(i, j);
    if (k < 0) return false;
    const c = this.chunks[k];
    const col = (j % CHUNK) * CHUNK + (i % CHUNK);
    for (let n = c.spanFirst[col]; n < c.spanFirst[col + 1]; n++) if (c.y1[n] > y0 && c.y0[n] < y1) return false;
    return true;
  }

  /**
   * A standing barricade (a door's or a window's, by panel index): from a node in front of it to one behind it, both
   * ways, after breaking it (a door's: walk through; a window's: the vault the movement code would make once it and the
   * window's glass are gone). None once it's broken or taken down.
   */
  private buildBarricade(index: number): void {
    const key = `B${index}`;
    for (const at of this.special.get(key) ?? []) this.removeLink(at);
    const made: number[] = [];
    this.special.set(key, made);
    const list = this.sim.level.panels.list;
    const e = list[index];
    const p = e.panel;
    if (p.kind !== "barricade" || p.empty || p.broken) return;
    const f = e.frame;
    const bottom = f.center[1] - f.h / 2;
    const glass = list.filter((o) => o !== e && o.panel.kind === "glass" && !o.panel.broken && Math.hypot(o.frame.center[0] - f.center[0], o.frame.center[1] - f.center[1], o.frame.center[2] - f.center[2]) < 0.4);
    const skip = new Set([e, ...glass].flatMap((o) => o.colliders.map((c) => c.handle)));
    const d = f.t / 2 + this.r + 0.2;
    const ends = [1, -1].map((side) => {
      const x = f.center[0] + f.n[0] * d * side;
      const z = f.center[2] + f.n[2] * d * side;
      return { side, x, z, node: this.nodeNear(x, bottom - 0.5, z, 0.6, 1.0) };
    });
    for (const a of ends) {
      if (a.node < 0) continue;
      // Facing the barricade from this side.
      const yaw = Math.atan2(f.n[0] * a.side, f.n[2] * a.side);
      const floor = this.nodeY(a.node);
      if (bottom - floor < 0.3) {
        // A doorway, walked through once the planks are gone, if a body fits through it crouched, standing on its sill
        // (a window whose sill is about level with the floor, under a head lower than that, is no way through at all).
        const b = ends.find((o) => o !== a)!;
        const [cx, , cz] = f.center;
        const sill = Math.max(floor, bottom);
        const fits = this.boxesIn(cx - 0.5, cz - 0.5, cx + 0.5, cz + 0.5).every((bx) => skip.has(bx.handle) || !this.inWay(bx, cx, sill, cz, this.crouchH));
        if (fits && b.node >= 0) made.push(this.addLink({ kind: LinkKind.Barricade, from: a.node, to: b.node, yaw, cost: 2 * d + BREAK_COST, ladder: -1, up: false, panel: index, vault: false }));
        continue;
      }
      const [ax, , az] = this.nodePos(a.node);
      const plan = this.sim.probeVault(ax, floor, az, yaw, (c) => skip.has(c.handle));
      if (!plan) continue;
      const to = this.nodeNear(plan.toX, plan.toY, plan.toZ, 0.45, 0.6);
      if (to < 0 || to === a.node) continue;
      made.push(this.addLink({ kind: LinkKind.Barricade, from: a.node, to, yaw, cost: Math.hypot(plan.toX - ax, plan.toZ - az) + plan.seconds * 3 + BREAK_COST, ladder: -1, up: false, panel: index, vault: true }));
    }
  }

  /** A ladder's foot and top, joined both ways. */
  private buildLadder(index: number): void {
    const key = `L${index}`;
    for (const at of this.special.get(key) ?? []) this.removeLink(at);
    const made: number[] = [];
    this.special.set(key, made);
    const m = this.sim.data.movement;
    const L = this.sim.level.ladders[index];
    const off = m.stance.collisionRadius + 0.05;
    const [cx, cz] = [L.base[0] - L.forward[0] * off, L.base[2] - L.forward[1] * off];
    const d = off + m.ladder.dismountForward;
    const foot = this.nodeNear(cx, L.base[1], cz, 0.6, 0.4);
    const top = this.nodeNear(cx + L.forward[0] * d, L.base[1] + L.height, cz + L.forward[1] * d, 0.6, 0.4);
    if (foot < 0 || top < 0) return;
    // Facing the ladder: its forward is where the climb goes over the top.
    const yaw = Math.atan2(-L.forward[0], -L.forward[1]);
    const cost = L.height * 1.5 + 2;
    made.push(this.addLink({ kind: LinkKind.Ladder, from: foot, to: top, yaw, cost, ladder: index, up: true, panel: -1, vault: false }));
    made.push(this.addLink({ kind: LinkKind.Ladder, from: top, to: foot, yaw: yaw + Math.PI, cost, ladder: index, up: false, panel: -1, vault: false }));
  }
}

const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
/** The diagonals, each with the two orthogonal steps (indices into DIRS4) it needs. */
const DIAG = [
  [1, 1, 0, 2],
  [1, -1, 0, 3],
  [-1, 1, 1, 2],
  [-1, -1, 1, 3],
] as const;
/** Columns of open air a drop goes out over (0.5 m: the body's centre past the edge). */
const DROP_OPEN = 2;



/** Rotate v by the unit quaternion q. */
function rotate(q: { x: number; y: number; z: number; w: number }, v: [number, number, number]): [number, number, number] {
  const [x, y, z] = v;
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  return [x + q.w * tx + (q.y * tz - q.z * ty), y + q.w * ty + (q.z * tx - q.x * tz), z + q.w * tz + (q.x * ty - q.y * tx)];
}
