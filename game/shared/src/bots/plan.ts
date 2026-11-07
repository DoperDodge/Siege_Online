// The team planner (Phase 9 M4, bots/DESIGN.md §6): one per side per round, server-side, knowing what its team could.
// Defense: in prep it hands out the site plan's jobs (data/maps/<level>/bot_strats.json) to its bots — reinforce the
// walls and hatches top-down while the pool lasts, barricade the site's doors, cut the rotation holes — then gives
// each bot a role: anchors hold spots in the site's rooms (found at prep start from their sight lines to the rooms'
// ways in, so nothing is hand placed), roamers walk their areas; in action anchors hold and roamers roam (back to the
// site in the last minute); after a plant everyone goes for the defuser and the nearest disables it.
import { TICK_HZ } from "../core/constants.js";
import type { Vec3 } from "../core/math.js";
import type { LevelDef, SiteStrat } from "../data/schemas.js";
import type { PanelEntry } from "../destruction/panels.js";
import { raycastLevel } from "../level/raycast.js";
import { Phase, type Match } from "../match/match.js";
import { DEFENSE } from "../match/rules.js";
import type { Sim } from "../sim.js";
import type { NavWorld } from "./nav/world.js";
import type { BotRng } from "./rng.js";

/** A job or a role for one bot, as its planner gives it. */
export type Task =
  /** Hold Use at a wall section or a hatch from `stand`, looking at `look`, until it has steel. */
  | { kind: "reinforce"; panel: number; section: number; stand: Vec3; look: Vec3 }
  /** Hold Use at an empty door frame until a barricade stands in it. */
  | { kind: "barricade"; panel: number; stand: Vec3; look: Vec3 }
  /** Knife a hole through a wall from `stand`: a blow at each of `spots` in turn. */
  | { kind: "hole"; panel: number; stand: Vec3; spots: Vec3[] }
  /** Hold a spot, watching `face`. */
  | { kind: "hold"; spot: Vec3; face: Vec3; room: string }
  /** Walk the rooms `rooms`, a spot at a time. */
  | { kind: "roam"; rooms: string[] }
  /** Go to the planted defuser and disable it. */
  | { kind: "retake"; defuser: Vec3 };

/** A job in the planner's queue: its task, who has it (member id; 0: nobody), done. */
interface Job {
  task: Task;
  by: number;
  done: boolean;
  /** Tries that failed (it's dropped after two). */
  fails: number;
}

/** Where a body stands working a wall (m from its face), and the height looked at on it. */
const WORK_M = 0.75;
const LOOK_H = 1.25;
/** Anchors and roamers in a team of five (fewer: anchors first). */
const ROAMERS_OF_FIVE = 2;
/** Roamers come back to the site this long before the action phase ends (s; research §5's "last 60 s"). */
const FALL_BACK_S = 60;
/** Barricades go up in the last seconds of prep (or once everything else is done). */
const BARRICADE_LAST_S = 15;
/** An anchor takes a job outside the site only with this much prep left (to get back in before the doors shut). */
const ANCHOR_OUT_S = 28;

/** Where a task is worked from. */
function jobAt(t: Task): Vec3 {
  switch (t.kind) {
    case "reinforce":
    case "barricade":
    case "hole":
      return t.stand;
    case "hold":
      return t.spot;
    case "retake":
      return t.defuser;
    case "roam":
      return [0, 0, 0];
  }
}

/** The room a point is in (by the level's room rectangles and storeys), or null. */
export function roomAt(level: LevelDef, x: number, y: number, z: number): string | null {
  for (const r of level.rooms) {
    const st = level.storeys.find((s) => s.id === r.storey);
    if (!st || y < st.floorY - 0.4 || y > st.ceilingY) continue;
    for (const q of r.rects) if (x >= Math.min(q[0], q[2]) - 0.05 && x <= Math.max(q[0], q[2]) + 0.05 && z >= Math.min(q[1], q[3]) - 0.05 && z <= Math.max(q[1], q[3]) + 0.05) return r.id;
  }
  return null;
}

/** Nav nodes' positions inside a room, about `step` m apart. */
export function roomSpots(nav: NavWorld, level: LevelDef, roomId: string, step = 0.75): Vec3[] {
  const room = level.rooms.find((r) => r.id === roomId);
  const st = room && level.storeys.find((s) => s.id === room.storey);
  if (!room || !st) return [];
  const out: Vec3[] = [];
  for (const q of room.rects) {
    const [x0, z0, x1, z1] = [Math.min(q[0], q[2]), Math.min(q[1], q[3]), Math.max(q[0], q[2]), Math.max(q[1], q[3])];
    for (let x = x0 + step / 2; x < x1; x += step)
      for (let z = z0 + step / 2; z < z1; z += step) {
        for (const y of [st.floorY, room.anchor[1]]) {
          const n = nav.grid.nodeNear(x, y, z, step / 2, 0.5);
          if (n < 0) continue;
          const p = nav.grid.nodePos(n);
          if (roomAt(level, p[0], p[1], p[2]) === roomId && !out.some((o) => Math.hypot(o[0] - p[0], o[2] - p[2]) < step * 0.6 && Math.abs(o[1] - p[1]) < 0.5)) out.push(p);
        }
      }
  }
  return out;
}

/** A panel's two sides at floor level, `d` m out from its middle (wall panels), and the room each is in. */
function sides(level: LevelDef, e: PanelEntry, d: number, uOff = 0): { pos: Vec3; room: string | null }[] {
  const f = e.frame;
  const floor = f.center[1] - f.h / 2;
  return [1, -1].map((s) => {
    const pos: Vec3 = [f.center[0] + f.n[0] * d * s + f.u[0] * uOff, floor, f.center[2] + f.n[2] * d * s + f.u[2] * uOff];
    return { pos, room: roomAt(level, pos[0], pos[1] + 0.3, pos[2]) };
  });
}

/** A place to stand on the nav grid near `p` (within `within` m), or null. */
function standAt(nav: NavWorld, p: Vec3, within = 0.8): Vec3 | null {
  const n = nav.grid.nodeNear(p[0], p[1], p[2], within, 0.8);
  return n >= 0 ? nav.grid.nodePos(n) : null;
}

/** The ways into a room: its door frames (any barricade frame with a side in it), soft walls and hatches over it. */
function waysIn(sim: Sim, roomId: string): Vec3[] {
  const level = sim.level.def;
  const out: Vec3[] = [];
  for (const e of sim.level.panels.list) {
    const k = e.panel.kind;
    const f = e.frame;
    if (k === "barricade" || k === "wall") {
      if (!sides(level, e, 0.5).some((s) => s.room === roomId)) continue;
      out.push([f.center[0], f.center[1] - f.h / 2 + LOOK_H, f.center[2]]);
    } else if (k === "hatch") {
      if (roomAt(level, f.center[0], f.center[1] - 1.2, f.center[2]) === roomId) out.push([f.center[0], f.center[1], f.center[2]]);
    }
  }
  return out;
}

/** Whether the eye sees `p` (nothing that blocks sight short of it, by 0.35 m). */
function sees(sim: Sim, eye: Vec3, p: Vec3): boolean {
  const d: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 0.5) return true;
  const hit = raycastLevel(sim, eye, [d[0] / len, d[1] / len, d[2] / len], len);
  return !hit || hit.t > len - 0.35;
}

/**
 * Spots to hold in a room, best first: a node whose eye sees the room's ways in, from a fair distance (not on top of
 * one), with a wall at its back; each with the way in it watches. At most `n`, 2 m apart.
 */
export function holdSpots(sim: Sim, nav: NavWorld, roomId: string, n: number, rng: BotRng): { spot: Vec3; face: Vec3 }[] {
  const ways = waysIn(sim, roomId);
  const cands = roomSpots(nav, sim.level.def, roomId, 0.75);
  const scored = cands.map((c) => {
    const eye: Vec3 = [c[0], c[1] + 1.6, c[2]];
    let score = 0;
    let face: Vec3 | null = null;
    let best = -Infinity;
    for (const w of ways) {
      const d = Math.hypot(w[0] - c[0], w[2] - c[2]);
      if (!sees(sim, eye, w)) continue;
      const v = d < 2 ? -1 : d < 3 ? 0.5 : d <= 9 ? 1 : 0.6;
      score += v;
      if (v > best) [best, face] = [v, w];
    }
    return { spot: c, face: face ?? ways[0] ?? [c[0], c[1] + 1.4, c[2] - 1], score: score + rng.next() * 0.3 };
  });
  scored.sort((a, b) => b.score - a.score);
  const out: { spot: Vec3; face: Vec3 }[] = [];
  for (const s of scored) {
    if (out.length >= n) break;
    if (out.some((o) => Math.hypot(o.spot[0] - s.spot[0], o.spot[2] - s.spot[2]) < 2)) continue;
    out.push({ spot: s.spot, face: s.face });
  }
  return out;
}

/** A defending team's planner for one round. */
export class DefensePlanner {
  private readonly jobs: Job[] = [];
  /** Each bot's role once its jobs are done (or now, in action): an anchor's hold spot is chosen when it first asks. */
  private readonly roles = new Map<number, Task | "anchor">();
  /** Each anchor room's hold spots, and who holds each (member id; 0: free). */
  private readonly spots = new Map<string, { spot: Vec3; face: Vec3; by: number }[]>();
  private planted = false;

  constructor(
    private readonly sim: Sim,
    private readonly nav: NavWorld,
    private readonly match: Match,
    readonly site: string,
    private readonly strat: SiteStrat | null,
    /** The team's bots (member ids), in slot order. */
    private readonly bots: readonly number[],
    private readonly rng: BotRng,
    /** A member's controller id (its body), or 0. */
    private readonly ctrlOf: (memberId: number) => number = () => 0,
  ) {
    this.makeJobs();
    this.makeRoles();
  }

  /** What bot `id` should do now. */
  taskOf(id: number): Task | null {
    if (this.planted) return this.retake();
    if (this.match.phase === Phase.Prep) {
      const mine = this.jobs.find((j) => j.by === id && !j.done);
      if (mine) return mine.task;
      // A free job in the plan's order: of the next few, the nearest. Barricades only from inside the site, and only
      // once the rest is done or prep is nearly over (a door barricaded early shuts out teammates still working outside).
      const me = this.bodyOf(id);
      const others = this.jobs.filter((j) => !j.done && j.task.kind !== "barricade" && j.fails < 2 && this.jobFits(j));
      const late = this.match.ticksLeft(this.sim.tick) < BARRICADE_LAST_S * TICK_HZ;
      const inSite = me !== null && this.siteRooms().includes(roomAt(this.sim.level.def, me[0], me[1] + 0.3, me[2]) ?? "");
      // A job outside the site's rooms is a roamer's (it stays out there); an anchor takes one only with time to come back.
      const role = this.roles.get(id);
      const roamer = role !== undefined && role !== "anchor" && role.kind === "roam";
      const outside = (j: Job) => {
        const p = jobAt(j.task);
        return !this.siteRooms().includes(roomAt(this.sim.level.def, p[0], p[1] + 0.3, p[2]) ?? "");
      };
      const time = this.match.ticksLeft(this.sim.tick) / TICK_HZ;
      const free = this.jobs
        .filter((j) => j.by === 0 && !j.done && j.fails < 2 && this.jobFits(j) && (j.task.kind !== "barricade" || (inSite && (late || others.length === 0))) && (roamer || !outside(j) || (!this.hasRoamers() && time > ANCHOR_OUT_S)))
        .slice(0, 3);
      const near = (j: Job) => (me ? Math.hypot(jobAt(j.task)[0] - me[0], (jobAt(j.task)[1] - me[1]) * 2, jobAt(j.task)[2] - me[2]) : 0) + (outside(j) === roamer ? 0 : 6);
      free.sort((a, b) => near(a) - near(b));
      if (free[0]) {
        free[0].by = id;
        return free[0].task;
      }
    }
    return this.roleOf(id);
  }

  /** The prep jobs as they stand (tests, the overlay): what, who has it, done, fails. */
  jobList(): { kind: Task["kind"]; panel: number; by: number; done: boolean; fails: number }[] {
    return this.jobs.map((j) => ({ kind: j.task.kind, panel: "panel" in j.task ? j.task.panel : -1, by: j.by, done: j.done, fails: j.fails }));
  }

  /** Bot `id` finished its job (`ok`), or gave up on it. */
  report(id: number, ok: boolean): void {
    const j = this.jobs.find((x) => x.by === id && !x.done);
    if (!j) return;
    if (ok) j.done = true;
    else {
      j.fails++;
      j.by = 0;
      if (j.fails >= 2) j.done = true;
    }
  }

  /** Each tick: the defuser planted means a retake. */
  step(): void {
    this.planted = this.sim.objective?.planted !== null && this.sim.objective?.planted !== undefined && this.match.phase === Phase.PostPlant;
  }

  /** Whether any of the team's bots roams (it then does the jobs outside the site). */
  private hasRoamers(): boolean {
    for (const r of this.roles.values()) if (r !== "anchor" && r.kind === "roam") return true;
    return false;
  }

  /** A bot's feet now, or null (no body). */
  private bodyOf(id: number): Vec3 | null {
    for (const c of this.sim.controllers.values()) {
      if (this.ctrlOf(id) !== c.id) continue;
      const p = this.sim.pawns.get(c.possessedPawnId);
      return p ? [p.state.x, p.state.y, p.state.z] : null;
    }
    return null;
  }

  private roleOf(id: number): Task | null {
    const role = this.roles.get(id) ?? null;
    const r = role === "anchor" ? this.anchorSpot(id) : role;
    if (role === "anchor" && r) this.roles.set(id, r);
    // Roamers come back to the site for the last minute.
    if (r?.kind === "roam" && this.match.phase === Phase.Action && this.match.ticksLeft(this.sim.tick) < FALL_BACK_S * TICK_HZ) {
      const anchors = this.strat?.defense.anchors ?? this.siteRooms();
      return { kind: "roam", rooms: anchors };
    }
    return r;
  }

  private retake(): Task | null {
    const at = this.sim.objective?.planted;
    return at ? { kind: "retake", defuser: [at[0], at[1], at[2]] } : null;
  }

  private siteRooms(): string[] {
    return this.sim.level.def.sites.find((s) => s.id === this.site)?.rooms ?? [];
  }

  /** A job still worth doing: reinforcement left in the pool, the wall not reinforced already. */
  private jobFits(j: Job): boolean {
    const t = j.task;
    if (t.kind === "reinforce") {
      const p = this.sim.level.panels.list[t.panel].panel;
      return this.sim.deployRules.pools[DEFENSE] > 0 && !p.reinforcedBefore(t.section) && !p.broken;
    }
    if (t.kind === "barricade") {
      const p = this.sim.level.panels.list[t.panel].panel;
      return p.empty || p.broken;
    }
    return true;
  }

  private makeJobs() {
    const sim = this.sim;
    const level = sim.level.def;
    const nav = this.nav;
    const byId = sim.level.panels.byId;
    // 1. Reinforcements, the plan's order, each section a job.
    for (const r of this.strat?.defense.reinforce ?? []) {
      const e = byId.get(r.panel);
      if (!e) continue;
      const p = e.panel;
      const f = e.frame;
      if (p.kind === "hatch") {
        // From above, beside it, looking down at it.
        const top = f.center[1] + f.t / 2;
        const around = [1, -1].flatMap((s) => [
          [f.center[0] + f.u[0] * (f.w / 2 + 0.45) * s, top, f.center[2] + f.u[2] * (f.w / 2 + 0.45) * s],
          [f.center[0] + f.v[0] * (f.h / 2 + 0.45) * s, top, f.center[2] + f.v[2] * (f.h / 2 + 0.45) * s],
        ]) as Vec3[];
        const stand = around.map((a) => standAt(nav, a, 0.5)).find((x) => x !== null);
        if (stand) this.jobs.push({ task: { kind: "reinforce", panel: p.spec.index, section: 0, stand, look: [f.center[0], top, f.center[2]] }, by: 0, done: false, fails: 0 });
        continue;
      }
      for (let sct = 0; sct < p.sectionCount; sct++) {
        const [u0, u1] = p.sectionRange(sct);
        const uMid = ((u0 + u1) / 2) * p.cellU - f.w / 2;
        const side = sides(level, e, WORK_M, uMid).find((s) => s.room === r.from) ?? sides(level, e, WORK_M, uMid)[0];
        const stand = standAt(nav, side.pos, 0.6);
        if (!stand) continue;
        const look: Vec3 = [f.center[0] + f.u[0] * uMid, f.center[1] - f.h / 2 + LOOK_H, f.center[2] + f.u[2] * uMid];
        this.jobs.push({ task: { kind: "reinforce", panel: p.spec.index, section: sct, stand, look }, by: 0, done: false, fails: 0 });
      }
    }
    // 2. Rotation holes (data/destruction.json rotationHoles), knifed from the room named.
    const sizes = sim.data.destruction.rotationHoles;
    for (const h of this.strat?.defense.holes ?? []) {
      const e = byId.get(h.panel);
      if (!e) continue;
      const f = e.frame;
      const side = sides(level, e, WORK_M).find((s) => s.room === h.from) ?? sides(level, e, WORK_M)[0];
      const stand = standAt(nav, side.pos, 0.6);
      if (!stand) continue;
      const size = sizes[h.size];
      const floor = f.center[1] - f.h / 2;
      const spots: Vec3[] = [];
      for (let v = size.bottomM + 0.12; v <= size.topM - 0.08; v += 0.2)
        for (let u = -size.widthM / 2 + 0.12; u <= size.widthM / 2 - 0.08; u += 0.2) spots.push([f.center[0] + f.u[0] * u, floor + v, f.center[2] + f.u[2] * u]);
      this.jobs.push({ task: { kind: "hole", panel: e.panel.spec.index, stand, spots }, by: 0, done: false, fails: 0 });
    }
    // 3. Barricades, last (a door barricaded early shuts out teammates still working outside): every empty door frame between a site room and another room, worked from the site's side.
    const rooms = this.siteRooms();
    for (const e of sim.level.panels.list) {
      if (e.panel.kind !== "barricade" || !(e.panel.empty || e.panel.broken) || e.frame.h < 1.6) continue;
      const s = sides(level, e, WORK_M);
      const inside = s.find((x) => x.room !== null && rooms.includes(x.room));
      const outside = s.find((x) => x !== inside);
      if (!inside || !outside || (outside.room !== null && rooms.includes(outside.room))) continue;
      const stand = standAt(nav, inside.pos, 0.6);
      if (!stand) continue;
      const f = e.frame;
      this.jobs.push({ task: { kind: "barricade", panel: e.panel.spec.index, stand, look: [f.center[0], f.center[1] - f.h / 2 + LOOK_H, f.center[2]] }, by: 0, done: false, fails: 0 });
    }
  }

  /**
   * An anchor's spot: in the site room it's in now if it's in one (doors are barricaded by then: walking round to
   * another room may not be possible), else the room with the fewest anchors; the best free spot there.
   */
  private anchorSpot(id: number): Task | null {
    const me = this.bodyOf(id);
    const here = me ? roomAt(this.sim.level.def, me[0], me[1] + 0.3, me[2]) : null;
    const rooms = [...this.spots.keys()];
    const taken = (r: string) => this.spots.get(r)!.filter((s) => s.by !== 0).length;
    const free = (r: string) => this.spots.get(r)!.some((s) => s.by === 0);
    const room = here && this.spots.has(here) && free(here) ? here : rooms.filter(free).sort((a, b) => taken(a) - taken(b))[0];
    const s = room ? this.spots.get(room)!.find((x) => x.by === 0) : undefined;
    if (!room || !s) return { kind: "roam", rooms: rooms.length ? rooms : this.siteRooms() };
    s.by = id;
    return { kind: "hold", spot: s.spot, face: s.face, room };
  }

  private makeRoles() {
    const anchorsRooms = this.strat?.defense.anchors ?? this.siteRooms();
    const roam = this.strat?.defense.roam ?? [];
    const n = this.bots.length;
    // Of five, two roam; of fewer, fewer (one roamer from four; none from three or fewer).
    const roamers = roam.length ? Math.max(0, Math.min(ROAMERS_OF_FIVE, n - 3)) : 0;
    const anchors = n - roamers;
    // Hold spots in every anchor room, enough for all the anchors in either.
    for (const r of anchorsRooms) this.spots.set(r, holdSpots(this.sim, this.nav, r, anchors, this.rng).map((h) => ({ ...h, by: 0 })));
    this.bots.forEach((id, k) => {
      if (k < anchors) this.roles.set(id, "anchor");
      else {
        const r = roam[(k - anchors) % roam.length];
        this.roles.set(id, { kind: "roam", rooms: [r, ...roam.filter((x) => x !== r).slice(0, 1)] });
      }
    });
  }
}
