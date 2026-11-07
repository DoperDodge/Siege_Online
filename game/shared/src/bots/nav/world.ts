// A room's navigation (Phase 9 M2, bots/DESIGN.md §3): its grid and search, kept up with the room's world. A panel whose
// movement boxes changed (a hole, a breach, a broken barricade) or a solid gadget made or gone marks the chunks under it;
// a few are rebuilt each tick (a budget), the rest wait. At a round's start (the panels as the level built them) the grid
// goes back to a copy of the level's pristine one, built once per level per process.
import type { Collider } from "../../physics/rapier.js";
import type { Sim } from "../../sim.js";
import { clearHoldCache } from "../places.js";
import { NAV_CELL, NavGrid, type NavLink } from "./grid.js";
import { NavSearch } from "./search.js";

/** The level's grid as built (panels whole, barricades up, no gadget) and its search, by level id: built once, copied per room. */
const pristine = new Map<string, { grid: NavGrid; search: NavSearch }>();

/** How far round a changed box its chunks are rebuilt (a body's radius and a column). */
const MARGIN = 0.6;

/** Vault probes from this near a change (m) are made again (a vault's reach and length). */
const PROBE_MARGIN = 2.5;
/** New route searches a tick, all the bots together (bots/DESIGN.md §12: the search budget). */
const ROUTES_PER_TICK = 3;

export class NavWorld {
  grid: NavGrid;
  search: NavSearch;
  /** Each panel's movement boxes as last seen (a rebuilt panel has a new array). */
  private seen: (readonly Collider[])[];
  private solidsAt = -1;
  /** Each solid gadget's colliders as last seen, and the box of the world they took (marked again when they go). */
  private solids = new Map<number, { cs: readonly Collider[]; box: [number, number, number, number] }>();
  /** Chunks waiting to be rebuilt. */
  private readonly dirty = new Set<number>();
  /** Chunks rebuilt so far (tests, the bench). */
  rebuilt = 0;
  /** New routes searched this tick (at most ROUTES_PER_TICK: the rest wait a tick), and the tick. */
  private routes = 0;
  private routesTick = -1;

  constructor(readonly sim: Sim) {
    const id = sim.level.def.id;
    let base = pristine.get(id);
    if (!base) {
      // Built on this room's simulation, which is as the level built it while the grid is first needed (a match's lobby).
      const grid = new NavGrid(sim);
      grid.build();
      base = { grid, search: new NavSearch(grid) };
      pristine.set(id, base);
    }
    this.grid = base.grid.clone(sim);
    this.search = new NavSearch(this.grid, base.search);
    this.seen = sim.level.panels.list.map((e) => e.colliders);
    // The solid gadgets there are now (the level's ingredients) are in the pristine grid: seen, not rebuilt round.
    this.seeSolids();
    // Anything already different from the level as built (a lab room's walls, gadgets up) is rebuilt as it's seen.
    this.notice();
  }

  /** The grid back to the level as built (a round's start: the panels were reset, no gadget left). */
  reset(): void {
    const base = pristine.get(this.sim.level.def.id)!;
    this.grid = base.grid.clone(this.sim);
    this.search = new NavSearch(this.grid, base.search);
    this.dirty.clear();
    this.seen = this.sim.level.panels.list.map((e) => e.colliders);
    this.seeSolids();
    this.notice();
  }

  /** Take the solid gadgets there are now as seen (the grid already has them). */
  private seeSolids(): void {
    this.solidsAt = this.sim.solidsVersion;
    this.solids.clear();
    for (const [id, cs] of this.sim.solidColliders()) this.solids.set(id, { cs, box: boundsOf(cs) });
  }

  /**
   * Whether a new route may be searched this tick (a bot asking past the tick's budget waits for the next: when many
   * want one at once, prep's start, the searches spread over a few ticks instead of all landing in one).
   */
  takeRoute(): boolean {
    if (this.sim.tick !== this.routesTick) {
      this.routesTick = this.sim.tick;
      this.routes = 0;
    }
    return this.routes++ < ROUTES_PER_TICK;
  }

  /** A link a bot couldn't take: out of the grid (and the region graph), so routes go another way. */
  blockLink(link: NavLink): void {
    const k = this.grid.blockLink(link);
    if (k >= 0) this.search.refresh([k]);
  }

  /** Whether chunks are waiting to be rebuilt. */
  get pending(): number {
    return this.dirty.size;
  }

  /** Each tick: notice what changed, and rebuild up to `budget` chunks of it. */
  step(budget = 1): void {
    this.notice();
    if (this.dirty.size === 0) return;
    const now: number[] = [];
    for (const k of this.dirty) {
      if (now.length >= budget) break;
      now.push(k);
    }
    for (const k of now) this.dirty.delete(k);
    const around = this.grid.rebuild(now);
    this.search.refresh(around);
    this.rebuilt += now.length;
  }

  /** Rebuild everything changed now (tests). */
  flush(): void {
    this.notice();
    while (this.dirty.size) this.step(this.dirty.size);
  }

  private notice(): void {
    const list = this.sim.level.panels.list;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.colliders === this.seen[i]) continue;
      this.seen[i] = e.colliders;
      this.mark(e.min[0], e.min[2], e.max[0], e.max[2]);
    }
    if (this.sim.solidsVersion !== this.solidsAt) {
      this.solidsAt = this.sim.solidsVersion;
      const now = this.sim.solidColliders();
      // Gone or changed: the box they took; new: the box they take. One gone and another the same where it was (the
      // level's ingredients put back at a round's start) changes nothing.
      const gone: [number, number, number, number][] = [];
      for (const [id, s] of [...this.solids])
        if (now.get(id) !== s.cs) {
          gone.push(s.box);
          this.solids.delete(id);
        }
      const same = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-3);
      for (const [id, cs] of now) {
        if (this.solids.has(id)) continue;
        const box = boundsOf(cs);
        this.solids.set(id, { cs, box });
        const twin = gone.findIndex((g) => same(g, box));
        if (twin >= 0) gone.splice(twin, 1);
        else this.mark(...box);
      }
      for (const g of gone) this.mark(...g);
    }
  }

  /** Mark the chunks under a box of the world (with a margin) to be rebuilt. */
  mark(x0: number, z0: number, x1: number, z1: number): void {
    for (const k of this.grid.chunksIn(x0 - MARGIN, z0 - MARGIN, x1 + MARGIN, z1 + MARGIN)) this.dirty.add(k);
    // A vault started up to a body's reach and a vault's length away may cross what changed: probed again.
    this.grid.forgetProbes(x0 - PROBE_MARGIN, z0 - PROBE_MARGIN, x1 + PROBE_MARGIN, z1 + PROBE_MARGIN);
  }
}

/** The box of the world [x0, z0, x1, z1] some colliders take (each by its centre and the length of its half extents). */
function boundsOf(cs: readonly Collider[]): [number, number, number, number] {
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const c of cs) {
    const t = c.translation();
    const he = c.halfExtents?.();
    const r = he ? Math.hypot(he.x, he.y, he.z) : 1;
    b[0] = Math.min(b[0], t.x - r);
    b[1] = Math.min(b[1], t.z - r);
    b[2] = Math.max(b[2], t.x + r);
    b[3] = Math.max(b[3], t.z + r);
  }
  return b;
}

/** Forget the levels' pristine grids (tests that change a level's data); the hold spots worked out on them too. */
export function clearNavCache(): void {
  pristine.clear();
  clearHoldCache();
}

void NAV_CELL;
