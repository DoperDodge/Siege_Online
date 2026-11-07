// The team planner (Phase 9 M4, bots/DESIGN.md §6): one per side per round, server-side, knowing what its team could.
// Defense: in prep it hands out the site plan's jobs (data/maps/<level>/bot_strats.json) to its bots — reinforce the
// walls and hatches top-down while the pool lasts, barricade the site's doors, cut the rotation holes — then gives
// each bot a role: anchors hold spots in the site's rooms (found at prep start from their sight lines to the rooms'
// ways in, so nothing is hand placed), roamers walk their areas; in action anchors hold and roamers roam (back to the
// site in the last minute); after a plant everyone goes for the defuser and the nearest disables it.
import { TICK_HZ } from "../core/constants.js";
import type { Vec3 } from "../core/math.js";
import type { SiteStrat } from "../data/schemas.js";
import { Phase, type Match } from "../match/match.js";
import { DEFENSE } from "../match/rules.js";
import type { Sim } from "../sim.js";
import type { NavWorld } from "./nav/world.js";
import type { BotRng } from "./rng.js";
import { floorSpot, hatchSpot, holdSpots, LOOK_H, roomAt, roomSpots, sees, sides, standAt, throwSpot, waysIn, wallSpot, WORK_M, type UseSpot } from "./places.js";
import type { PanelEntry } from "../destruction/panels.js";
import { slotGadget } from "../gadgets/hands.js";
import type { Pawn } from "../player/pawn.js";

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
  | { kind: "retake"; defuser: Vec3 }
  /** Drive its drone to `to` (prep), pinging what it sees. */
  | { kind: "drone"; to: Vec3 }
  /** Go through `via` (spots, in order) to `to`. */
  | { kind: "go"; via: Vec3[]; to: Vec3 }
  /** Plant the defuser at `spot` (the carrier). */
  | { kind: "plant"; spot: Vec3 }
  /** Pick the dropped defuser up. */
  | { kind: "pickup"; at: Vec3 }
  /** Use a gadget (bots/use.ts). */
  | GadgetTask
  /** Skopós: walk her idle shell to `to` (into it, there, and back to the shell she was in). */
  | { kind: "shell"; to: Vec3 }
  /** Brava: a Kludge drone thrown and driven toward `to`, hacking the other side's devices it finds on the way. */
  | { kind: "kludge"; to: Vec3 }
  /** Keep near this teammate's body (an order, M6). */
  | { kind: "follow"; pawnId: number };

/**
 * A gadget used as a player does (gadgets/DESIGN.md §2) from slot `slot`, from `stand` (null: where it is) with the
 * view on `look`: placed (Fire held), thrown (Fire) or lobbed (ADS), swung (Fire held: a blow at each of `spots`, or
 * at `look`, until panel `panel` is open), held up `seconds`, or a device out set off ("detonate"). A remote device or
 * a fused charge is then left from `cover` (set off from there, or waited out `seconds`). `tag` names it.
 */
export interface GadgetTask {
  kind: "gadget";
  slot: 1 | 2;
  how: "place" | "throw" | "lob" | "swing" | "hold" | "detonate";
  stand: Vec3 | null;
  look: Vec3;
  spots?: Vec3[];
  panel?: number;
  cover?: Vec3;
  seconds?: number;
  crouch?: boolean;
  tag: string;
}

/** A job in the planner's queue: its task, who has it (member id; 0: nobody), done. */
interface Job {
  task: Task;
  by: number;
  done: boolean;
  /** Tries that failed (it's dropped after two). */
  fails: number;
  /** Only this bot's (its own gadget's), and not before this panel's reinforcement is done (Mira's mirror). */
  only?: number;
  after?: number;
}

/** A bot's own jobs outside the site are left this long before prep ends (s): time to get back in. */
const OWN_OUT_S = 14;
/** An anchor's own jobs outside the site are left this long before prep ends (s): its way back is longer. */
const ANCHOR_OWN_OUT_S = 22;
/** The plan's first walls (or hatches) are reinforced before the bots' own gadgets go up. */
const URGENT = 2;

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
    case "drone":
    case "go":
      return t.to;
    case "plant":
      return t.spot;
    case "pickup":
      return t.at;
    case "gadget":
      return t.stand ?? t.look;
    case "shell":
    case "kludge":
      return t.to;
    case "follow":
    case "roam":
      return [0, 0, 0];
  }
}

/** The slot holding gadget `gid` with one left (1 or 2), or 0. */
export function slotWith(sim: Sim, b: Pawn, gid: string): 1 | 2 | 0 {
  if (slotGadget(sim.data, b.loadout, 1)?.id === gid && b.state.g1 > 0) return 1;
  return slotGadget(sim.data, b.loadout, 2)?.id === gid && b.state.g2 > 0 ? 2 : 0;
}

/** A gadget task from a use spot. */
function gadgetTask(slot: 1 | 2, how: GadgetTask["how"], at: UseSpot, tag: string, extra: Partial<GadgetTask> = {}): GadgetTask {
  return { kind: "gadget", slot, how, stand: at.stand, look: at.look, tag, ...extra };
}

/** Cover from a charge: a place to stand `d` m back from where it was put, on the same floor (or where it was put from). */
export function coverFrom(nav: NavWorld, at: UseSpot, d = 3): Vec3 {
  const dx = at.stand[0] - at.look[0];
  const dz = at.stand[2] - at.look[2];
  const len = Math.hypot(dx, dz) || 1;
  for (const back of [d, d * 0.75, d * 1.3]) {
    const p = standAt(nav, [at.stand[0] + (dx / len) * back, at.stand[1], at.stand[2] + (dz / len) * back], 0.8);
    if (p && Math.abs(p[1] - at.stand[1]) < 0.15) return p;
  }
  return at.stand;
}

/**
 * A hard breach of wall `e` from room `from` by this body (M7): Thermite's Exothermic Charge, set off from cover; else
 * a Hard Breach Charge (Striker's EMP at the wall first), waited out from cover. None: it has neither.
 */
export function hardBreachTasks(sim: Sim, nav: NavWorld, b: Pawn, e: PanelEntry, from: string | null): Task[] {
  const at = wallSpot(sim, nav, e, from, 0.8, 0.9);
  if (!at || e.panel.kind !== "wall") return [];
  const index = e.panel.spec.index;
  const cover = coverFrom(nav, at);
  const thermite = slotWith(sim, b, "exothermic_charge");
  if (thermite) return [gadgetTask(thermite, "place", at, `therm${index}`, { cover })];
  const hbc = slotWith(sim, b, "hard_breach_charge");
  if (!hbc) return [];
  const out: Task[] = [];
  // Striker's EMP at the wall first: a jammer behind it would stop the charge.
  const emp = slotWith(sim, b, "impact_emp");
  const far = wallSpot(sim, nav, e, from, 3.2, 1.3);
  if (emp && far) out.push(gadgetTask(emp, "throw", far, `emp${index}`));
  out.push(gadgetTask(hbc, "place", { stand: at.stand, look: [at.look[0], at.look[1] + 0.1, at.look[2]] }, `hbc${index}`, { cover, seconds: 5 }));
  return out;
}

/**
 * A soft breach of `e` (a hatch from above, or a wall from room `from`) by this body (M7): Sledge's hammer (a blow, low
 * and high on a wall), a Cluster Charge or a breach charge on it, set off from cover. None: it has none of them.
 */
export function softBreachTasks(sim: Sim, nav: NavWorld, b: Pawn, e: PanelEntry, from: string | null): Task[] {
  const hatch = e.panel.kind === "hatch";
  const at = hatch ? hatchSpot(sim, nav, e) : wallSpot(sim, nav, e, from, 0.7, 0.55);
  if (!at) return [];
  const index = e.panel.spec.index;
  const hammer = slotWith(sim, b, "breaching_hammer");
  if (hammer) {
    const spots = hatch ? [at.look] : [at.look, [at.look[0], at.look[1] + 0.95, at.look[2]] as Vec3];
    return [gadgetTask(hammer, "swing", at, `ham${index}`, { spots, panel: index, crouch: hatch })];
  }
  const charge = slotWith(sim, b, "cluster_charge") || slotWith(sim, b, "breach_charge");
  if (!charge) return [];
  const put = hatch ? at : wallSpot(sim, nav, e, from, 0.8, 1.0);
  if (!put) return [];
  return [gadgetTask(charge, "place", put, `soft${index}`, { cover: coverFrom(nav, put, hatch ? 2.5 : 3) })];
}

/**
 * Any opening this body can make in `e` from room `from` (an order, M6): a hard breach, a soft breach, an impact
 * grenade at a soft wall, else the knife (a crouch-size hole in a soft wall, a barricade broken). None: nothing it can do.
 */
export function breachTasks(sim: Sim, nav: NavWorld, b: Pawn, e: PanelEntry, from: string | null): Task[] {
  const p = e.panel;
  if (p.kind === "wall") {
    const hard = hardBreachTasks(sim, nav, b, e, from);
    if (hard.length) return hard;
  }
  if (p.kind === "wall" || p.kind === "hatch") {
    const soft = softBreachTasks(sim, nav, b, e, from);
    if (soft.length) return soft;
  }
  const index = p.spec.index;
  const soft = p.kind === "wall" && p.reinforced === 0;
  const impact = slotWith(sim, b, "impact_grenade");
  const far = soft && impact ? wallSpot(sim, nav, e, from, 2.6, 0.9) : null;
  if (impact && far) return [gadgetTask(impact, "throw", far, `imp${index}`)];
  if (!soft && p.kind !== "barricade") return [];
  const at = wallSpot(sim, nav, e, from, WORK_M, 0);
  if (!at) return [];
  const f = e.frame;
  const size = sim.data.destruction.rotationHoles.crouch;
  const floor = f.center[1] - f.h / 2;
  const spots: Vec3[] = [];
  const [bottom, top, width] = p.kind === "barricade" ? [0.5, 1.5, 0.6] : [size.bottomM, size.topM, size.widthM];
  for (let v = bottom + 0.12; v <= top - 0.08; v += 0.2) for (let u = -width / 2 + 0.12; u <= width / 2 - 0.08; u += 0.2) spots.push([f.center[0] + f.u[0] * u, floor + v, f.center[2] + f.u[2] * u]);
  return [{ kind: "hole", panel: index, stand: at.stand, spots }];
}

/** A panel's face at floor level on room `room`'s side (0.3 m out), or its middle's foot. */
function faceIn(level: Sim["level"]["def"], e: PanelEntry, room: string): Vec3 {
  const s = sides(level, e, 0.3);
  return (s.find((x) => x.room === room) ?? s[0]).pos;
}

/** The first way into a room (a door, a wall, a hatch over it), at floor height, or null. */
function firstWay(sim: Sim, room: string): Vec3 | null {
  const w = waysIn(sim, room)[0];
  return w ? [w[0], w[1] - LOOK_H, w[2]] : null;
}

/** A defending team's planner for one round. */
export class DefensePlanner {
  private readonly jobs: Job[] = [];
  /** Each bot's role once its jobs are done (or now, in action): an anchor's hold spot is chosen when it first asks. */
  private readonly roles = new Map<number, Task | "anchor">();
  /** Each anchor room's hold spots, and who holds each (member id; 0: free). */
  private readonly spots = new Map<string, { spot: Vec3; face: Vec3; by: number }[]>();
  private planted = false;
  /** Bots whose own gadget jobs are made (once each has a body). */
  private readonly equipped = new Set<number>();
  /** Told to rotate (the roamers back to the site). */
  private rotated = false;

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
      if (!this.equipped.has(id) && this.bodyPawn(id)) {
        this.equipped.add(id);
        this.ownJobs(id);
      }
      const mine = this.jobs.find((j) => j.by === id && !j.done);
      if (mine) return mine.task;
      // A free job in the plan's order: of the next few, the nearest. Barricades only from inside the site, and only
      // once the rest is done or prep is nearly over (a door barricaded early shuts out teammates still working outside).
      const me = this.bodyOf(id);
      const others = this.jobs.filter((j) => !j.done && j.only === undefined && j.task.kind !== "barricade" && j.fails < 2 && this.jobFits(j));
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
      const near = (j: Job) => (me ? Math.hypot(jobAt(j.task)[0] - me[0], (jobAt(j.task)[1] - me[1]) * 2, jobAt(j.task)[2] - me[2]) : 0) + (outside(j) === roamer ? 0 : 6);
      // The plan's first walls before anything else (every section of its first URGENT walls: one each, nearest first).
      const first = [...new Set(this.jobs.filter((j) => j.task.kind === "reinforce").map((j) => (j.task as { panel: number }).panel))].slice(0, URGENT);
      const urgent = this.jobs.filter((j) => j.task.kind === "reinforce" && first.includes(j.task.panel) && j.by === 0 && !j.done && j.fails < 2 && this.jobFits(j));
      urgent.sort((a, b) => near(a) - near(b));
      if (urgent[0]) {
        urgent[0].by = id;
        return urgent[0].task;
      }
      // Then its own gadgets (the nearest of its next few), then the team's.
      const own = this.jobs.filter((j) => j.only === id && j.by === 0 && !j.done && j.fails < 2 && this.jobFits(j) && (!outside(j) || time > (roamer ? OWN_OUT_S : ANCHOR_OWN_OUT_S))).slice(0, 3);
      own.sort((a, b) => near(a) - near(b));
      if (own[0]) {
        own[0].by = id;
        return own[0].task;
      }
      const free = this.jobs
        .filter((j) => j.by === 0 && j.only === undefined && !j.done && j.fails < 2 && this.jobFits(j) && (j.task.kind !== "barricade" || (inSite && (late || others.length === 0))) && (roamer || !outside(j) || (!this.hasRoamers() && time > ANCHOR_OUT_S)))
        .slice(0, 3);
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
    return this.jobs.map((j) => ({ kind: j.task.kind, panel: "panel" in j.task ? (j.task.panel ?? -1) : -1, by: j.by, done: j.done, fails: j.fails }));
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

  /** "Rotate" off a person's comm wheel (M6): the roamers come back to the site's rooms now. */
  rotate(): void {
    this.rotated = true;
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

  /** A bot's body, or null. */
  private bodyPawn(id: number): Pawn | null {
    const c = this.sim.controllers.get(this.ctrlOf(id));
    return (c && this.sim.pawns.get(c.possessedPawnId)) || null;
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
    // Roamers come back to the site for the last minute (or when told to rotate).
    if (r?.kind === "roam" && this.match.phase === Phase.Action && (this.rotated || this.match.ticksLeft(this.sim.tick) < FALL_BACK_S * TICK_HZ)) {
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
    if (t.kind === "gadget" && j.only !== undefined) {
      // Its owner still has one, and (a mirror) the wall's steel is up first: nothing of its reinforcement left to do.
      const b = this.bodyPawn(j.only);
      if (!b || (t.slot === 1 ? b.state.g1 : b.state.g2) <= 0) return false;
      if (j.after !== undefined && this.jobs.some((x) => x.task.kind === "reinforce" && x.task.panel === j.after && !x.done && x.fails < 2 && this.jobFits(x))) return false;
    }
    return true;
  }

  /**
   * A bot's own gadget jobs (M7, bots/DESIGN.md §7.4), once it has a body in prep: its operator's devices where the
   * site plan puts them (Mute's jammers, Mira's mirrors once their wall has steel, Lesion's mines, Sentry's wire and
   * shield, Skopós's idle shell into the plan's other room), a defender's impact grenades for the plan's rotation holes,
   * and its generic gadget at the site's ways in (wire, a shield, a camera, an observation blocker, an alarm).
   */
  private ownJobs(id: number) {
    const sim = this.sim;
    const body = this.bodyPawn(id);
    if (!body) return;
    const level = sim.level.def;
    const byId = sim.level.panels.byId;
    const op = this.match.players.get(id)?.operator ?? "";
    const slots = [slotGadget(sim.data, body.loadout, 1), slotGadget(sim.data, body.loadout, 2)];
    const slotOf = (gid: string): 1 | 2 | 0 => (slots[0]?.id === gid ? 1 : slots[1]?.id === gid ? 2 : 0);
    const room = (r: string) => level.rooms.some((x) => x.id === r);
    let tags = 0;
    const add = (slot: 1 | 2, how: GadgetTask["how"], at: UseSpot | null, extra: Partial<GadgetTask> = {}, after?: number) => {
      if (!at) return;
      const task: GadgetTask = { kind: "gadget", slot, how, stand: at.stand, look: at.look, tag: `${id}.${tags++}`, ...extra };
      this.jobs.push({ task, by: 0, done: false, fails: 0, only: id, after });
    };
    const planned = new Set<string>();
    for (const spot of this.strat?.defense.gadgets[op] ?? []) {
      if (op === "skopos") {
        // Her idle shell into the plan's last room (she anchors in the first).
        continue;
      }
      const gid = spot.gadget ?? slots[1]?.id ?? "";
      const slot = slotOf(gid);
      const g = slot ? slots[slot - 1] : null;
      if (!slot || !g) continue;
      planned.add(gid);
      // As many as it carries, or will (a regenerating item: its jobs wait for the next one).
      const made = this.jobs.filter((j) => j.only === id && j.task.kind === "gadget" && j.task.slot === slot).length;
      if (made >= Math.max(g.count, slot === 1 ? body.state.g1 : body.state.g2)) continue;
      const e = spot.panel ? byId.get(spot.panel) : spot.near ? byId.get(spot.near) : undefined;
      if (g.use.kind === "throw") {
        if (spot.room && room(spot.room)) add(slot, "throw", throwSpot(sim, this.nav, spot.room, null, this.rng));
      } else if (g.use.kind === "place" && g.use.on.includes("reinforceable")) {
        if (e) add(slot, "place", wallSpot(sim, this.nav, e, spot.from ?? null, 0.7, 1.45), {}, e.panel.spec.index);
      } else if (g.use.kind === "place" && spot.room && room(spot.room)) {
        const near = e ? faceIn(level, e, spot.room) : null;
        add(slot, "place", floorSpot(sim, this.nav, spot.room, near, near ?? firstWay(sim, spot.room)));
      }
    }
    if (op === "skopos") {
      const rooms = (this.strat?.defense.gadgets.skopos ?? []).map((x) => x.room).filter((r): r is string => !!r && room(r));
      const last = rooms[rooms.length - 1];
      const spots = last ? roomSpots(this.nav, level, last, 1) : [];
      const to = spots[Math.floor(spots.length / 2)];
      if (to) this.jobs.push({ task: { kind: "shell", to }, by: 0, done: false, fails: 0, only: id });
    }
    // Impact grenades: the plan's rotation holes blown from a few metres (a knife's job less).
    const impact = slotOf("impact_grenade");
    if (impact) {
      for (const h of (this.strat?.defense.holes ?? []).slice(0, body.state.g1)) {
        const e = byId.get(h.panel);
        const at = e ? wallSpot(sim, this.nav, e, h.from, 2.6, 0.9) : null;
        if (!e || !at) continue;
        const knife = this.jobs.find((j) => j.task.kind === "hole" && j.task.panel === e.panel.spec.index && j.by === 0 && !j.done);
        if (knife) knife.done = true;
        add(impact, "throw", at);
      }
    }
    // Its generic gadget (slot 1), if the plan didn't place it: at the site's ways in, from inside.
    const g1 = slots[0];
    if (g1 && !planned.has(g1.id) && g1.id !== "impact_grenade" && g1.id !== "nitro_cell") {
      const doors = this.siteDoors();
      for (let k = 0; k < Math.min(body.state.g1, doors.length); k++) {
        const d = doors[(k + this.bots.indexOf(id)) % doors.length];
        if (g1.use.kind === "place") add(1, "place", floorSpot(sim, this.nav, d.room, d.at, d.at, g1.id === "deployable_shield" ? 1.4 : 1.0));
        else if (g1.use.kind === "throw") {
          const at = floorSpot(sim, this.nav, d.room, d.at, d.at, 1.6);
          if (at) add(1, "throw", { stand: at.stand, look: [d.at[0], d.at[1] + 1.6, d.at[2]] });
        }
      }
    }
  }

  /** The site's doors (empty or barricaded frames between a site room and another), each from its site room's side. */
  private siteDoors(): { room: string; at: Vec3 }[] {
    const level = this.sim.level.def;
    const rooms = this.siteRooms();
    const out: { room: string; at: Vec3 }[] = [];
    for (const e of this.sim.level.panels.list) {
      if (e.panel.kind !== "barricade" || e.frame.h < 1.6) continue;
      const s = sides(level, e, 0.6);
      const inside = s.find((x) => x.room !== null && rooms.includes(x.room));
      const other = s.find((x) => x !== inside);
      if (!inside || !other || (other.room !== null && rooms.includes(other.room))) continue;
      out.push({ room: inside.room!, at: faceIn(level, e, inside.room!) });
    }
    return out;
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
    // Pulse roams the plan's rooms above or below the site, scanning (M7); the rest share out as anchors and roamers.
    const pulseRooms = (this.strat?.defense.gadgets.pulse ?? []).map((x) => x.room).filter((r): r is string => !!r);
    const bots = this.bots.filter((id) => !(pulseRooms.length && this.match.players.get(id)?.operator === "pulse"));
    for (const id of this.bots) if (!bots.includes(id)) this.roles.set(id, { kind: "roam", rooms: pulseRooms });
    const n = bots.length;
    // Of five, two roam; of fewer, fewer (one roamer from four; none from three or fewer).
    const roamers = roam.length ? Math.max(0, Math.min(ROAMERS_OF_FIVE, n - 3)) : 0;
    const anchors = n - roamers;
    // Hold spots in every anchor room, enough for all the anchors in either.
    for (const r of anchorsRooms) this.spots.set(r, holdSpots(this.sim, this.nav, r, anchors, this.rng).map((h) => ({ ...h, by: 0 })));
    bots.forEach((id, k) => {
      if (k < anchors) this.roles.set(id, "anchor");
      else {
        const r = roam[(k - anchors) % roam.length];
        this.roles.set(id, { kind: "roam", rooms: [r, ...roam.filter((x) => x !== r).slice(0, 1)] });
      }
    });
  }
}

/**
 * An attacking team's planner for one round (Phase 9 M5). Prep: each bot's drone toward a bomb of a site it could be
 * (spread over the four, all to the found one once it's found). Action: each bot in through its spawn group's way in
 * (the plan's rooms) to a spot in the site's rooms, the defuser's carrier planting there; one watching a flank; the
 * dropped defuser picked up by the nearest; after the plant, holds round it.
 */
export class AttackPlanner {
  /** Each bot's way in this round (spots), worked out when it first asks in action. */
  private readonly ways = new Map<number, Task>();
  /** Each bot's jobs before its way in (M7: breaches, Brava's Kludge), made for the site it then went for. */
  private readonly jobs = new Map<number, Job[]>();
  private jobsFor: string | null = null;
  /** Told to push: no more jobs before the way in. */
  private pushed = false;

  constructor(
    private readonly sim: Sim,
    private readonly nav: NavWorld,
    private readonly match: Match,
    private readonly bots: readonly number[],
    private readonly rng: BotRng,
    /** A member's controller id (its body), or 0. */
    private readonly ctrlOf: (memberId: number) => number,
  ) {}

  /** The site, as the attackers know it: found, or a guess (the nearest to the bot's spawn) until then. */
  private site(from: Vec3 | null): string | null {
    const level = this.sim.level.def;
    if (this.match.siteRevealed && this.match.site) return this.match.site;
    if (!from) return level.sites[0]?.id ?? null;
    let best: string | null = null;
    let bestD = Infinity;
    for (const st of level.sites)
      for (const b of st.bombs) {
        const d = Math.hypot(b.pos[0] - from[0], b.pos[1] - from[1], b.pos[2] - from[2]);
        if (d < bestD) [best, bestD] = [st.id, d];
      }
    return best;
  }

  private body(id: number): { pos: Vec3; pawnId: number } | null {
    const ctrlId = this.ctrlOf(id);
    const c = this.sim.controllers.get(ctrlId);
    const p = c ? this.sim.pawns.get(c.possessedPawnId) : undefined;
    return p ? { pos: [p.state.x, p.state.y, p.state.z], pawnId: p.id } : null;
  }

  taskOf(id: number): Task | null {
    const m = this.match;
    const level = this.sim.level.def;
    const me = this.body(id);
    if (m.phase === Phase.Prep) {
      // Droning: the k-th bot toward the k-th site's first bomb (or the found site's bombs, shared out).
      const k = this.bots.indexOf(id);
      const sites = m.siteRevealed && m.site ? level.sites.filter((x) => x.id === m.site) : level.sites;
      const st = sites[k % Math.max(1, sites.length)];
      const bomb = st?.bombs[Math.floor(k / Math.max(1, sites.length)) % Math.max(1, st.bombs.length)];
      return bomb ? { kind: "drone", to: [bomb.pos[0], bomb.pos[1], bomb.pos[2]] } : null;
    }
    const o = this.sim.objective;
    if (!o) return null;
    // After the plant: hold round the defuser.
    if (o.planted) return this.guard(id, o.planted);
    // The dropped defuser: the nearest bot picks it up.
    if (o.dropped && o.carrier === 0) {
      const d = o.dropped;
      const nearest = this.bots.map((b) => ({ b, at: this.body(b) })).filter((x) => x.at).sort((a, b) => dist(a.at!.pos, d) - dist(b.at!.pos, d))[0];
      if (nearest?.b === id) return { kind: "pickup", at: [d[0], d[1], d[2]] };
    }
    const site = this.site(me?.pos ?? null);
    if (!site) return null;
    const stInfo = level.sites.find((x) => x.id === site)!;
    // The carrier plants as soon as it's in one of the site's rooms (a spot clear of the room's edges).
    if (me && o.carrier === me.pawnId) {
      const here = roomAt(level, me.pos[0], me.pos[1] + 0.3, me.pos[2]);
      if (here && stInfo.rooms.includes(here)) {
        const spot = this.plantSpot(here, me.pos);
        if (spot) return { kind: "plant", spot };
      }
    }
    // Its jobs first (a breach on the way in, Brava's Kludge ahead of the team), then its way in.
    if (this.jobsFor !== site && !this.pushed) this.makeJobs(site);
    const job = this.jobs.get(id)?.find((j) => !j.done && j.fails < 2);
    if (job) return job.task;
    let way = this.ways.get(id);
    if (!way || (way.kind === "go" && !stInfo.rooms.includes(roomAt(level, way.to[0], way.to[1] + 0.3, way.to[2]) ?? ""))) {
      way = this.wayIn(id, site, me?.pos ?? null);
      this.ways.set(id, way);
    }
    return way;
  }

  /** "Push" off a person's comm wheel (M6): the jobs before the way in are dropped; everyone goes in now. */
  push(): void {
    for (const list of this.jobs.values()) for (const j of list) j.done = true;
    this.pushed = true;
  }

  /** Bot `id` finished its job (`ok`), or gave up on it (tried again once). */
  report(id: number, ok: boolean): void {
    const j = this.jobs.get(id)?.find((x) => !x.done && x.fails < 2);
    if (!j) return;
    if (ok) j.done = true;
    else j.fails++;
  }

  /** The jobs as they stand (tests): each bot's, what and done. */
  jobList(): { by: number; task: Task; done: boolean; fails: number }[] {
    return [...this.jobs].flatMap(([by, list]) => list.map((j) => ({ by, task: j.task, done: j.done, fails: j.fails })));
  }

  /**
   * The team's jobs for `site` (M7, bots/DESIGN.md §7.4): each of the plan's hard breaches to the first bot of its
   * operators who has the charge (Thermite's Exothermic; Striker's EMP then a Hard Breach Charge; Fuze's Hard Breach
   * Charge), each soft breach to one too (Sledge's hammer, Fuze's Cluster Charge, else anyone's breach charge), one
   * breach a bot; Brava's Kludge first, toward the first hard breach's far side.
   */
  private makeJobs(site: string) {
    this.jobsFor = site;
    const sim = this.sim;
    const level = sim.level.def;
    const strat = sim.data.bots.strats.get(level.id)?.sites[site];
    const st = level.sites.find((x) => x.id === site);
    // Keep what's done; make the rest afresh.
    for (const list of this.jobs.values()) for (let i = list.length - 1; i >= 0; i--) if (!list[i].done) list.splice(i, 1);
    if (!strat || !st) return;
    const byId = sim.level.panels.byId;
    const bots = this.bots.map((id) => ({ id, op: this.match.players.get(id)?.operator ?? "", body: this.pawnOf(id) })).filter((b) => b.body !== null) as { id: number; op: string; body: Pawn }[];
    const busy = new Set<number>();
    const add = (id: number, task: Task) => {
      let list = this.jobs.get(id);
      if (!list) this.jobs.set(id, (list = []));
      list.push({ task, by: id, done: false, fails: 0 });
    };
    const slotOf = (b: Pawn, gid: string) => slotWith(sim, b, gid);
    // Brava: her Kludge toward the far side of the first hard breach (where the jammers are), else the site.
    for (const b of bots) {
      if (b.op !== "brava" || slotGadget(sim.data, b.body.loadout, 2)?.use.kind !== "drone") continue;
      const hb = strat.attack.hardBreach.map((h) => byId.get(h.panel)).find((e) => e);
      const far = hb ? sides(level, hb, 1.5).find((x) => x.room !== null && st.rooms.includes(x.room)) : undefined;
      const to = far?.pos ?? roomSpots(this.nav, level, st.rooms[0], 1.5)[0];
      if (to) add(b.id, { kind: "kludge", to });
    }
    for (const h of strat.attack.hardBreach) {
      const e = byId.get(h.panel);
      if (!e) continue;
      for (const op of h.ops) {
        const b = bots.find((x) => x.op === op && !busy.has(x.id));
        const tasks = b ? hardBreachTasks(sim, this.nav, b.body, e, h.from) : [];
        if (!b || !tasks.length) continue;
        busy.add(b.id);
        for (const t of tasks) add(b.id, t);
        break;
      }
    }
    for (const h of strat.attack.softBreach) {
      const e = byId.get(h.panel);
      if (!e) continue;
      const cands = [...h.ops.map((op) => bots.find((x) => x.op === op && !busy.has(x.id))), ...bots.filter((x) => !busy.has(x.id) && slotOf(x.body, "breach_charge"))];
      for (const b of cands) {
        const tasks = b ? softBreachTasks(sim, this.nav, b.body, e, h.from) : [];
        if (!b || !tasks.length) continue;
        busy.add(b.id);
        for (const t of tasks) add(b.id, t);
        break;
      }
    }
  }

  /** A bot's body now, or null. */
  private pawnOf(id: number): Pawn | null {
    const c = this.sim.controllers.get(this.ctrlOf(id));
    return (c && this.sim.pawns.get(c.possessedPawnId)) || null;
  }

  /** A spot to plant in a room: a node at least the plant margin and a body's width inside its edges, near `from`. */
  private plantSpot(room: string, from: Vec3): Vec3 | null {
    const spots = roomSpots(this.nav, this.sim.level.def, room, 0.5);
    const area = this.sim.level.def.sites.find((s) => s.rooms.includes(room));
    const margin = (area?.plantMarginM ?? 0.5) + 0.35;
    const r = this.sim.level.def.rooms.find((x) => x.id === room)!;
    const inside = (p: Vec3) => r.rects.some((q) => p[0] >= Math.min(q[0], q[2]) + margin && p[0] <= Math.max(q[0], q[2]) - margin && p[2] >= Math.min(q[1], q[3]) + margin && p[2] <= Math.max(q[1], q[3]) - margin);
    const ok = spots.filter(inside).sort((a, b) => dist(a, from) - dist(b, from));
    return ok[0] ?? null;
  }

  /** A bot's way in: its spawn group's rooms from the plan (a spot in each), then a spot in a site room. */
  private wayIn(id: number, site: string, from: Vec3 | null): Task {
    const level = this.sim.level.def;
    const strat = this.sim.data.bots.strats.get(level.id)?.sites[site] ?? null;
    const st = level.sites.find((x) => x.id === site)!;
    const group = this.match.players.get(id)?.spawn ?? "";
    const plan = strat?.attack.spawns[group];
    const k = this.bots.indexOf(id);
    // Half the team the plan's main way, the rest its others in turn.
    const rooms = plan ? (k % 2 === 0 || plan.alt.length === 0 ? plan.via : plan.alt[(k >> 1) % plan.alt.length]) : [];
    const via: Vec3[] = [];
    let at = from;
    for (const r of rooms) {
      const spots = roomSpots(this.nav, level, r, 1.5);
      if (!spots.length) continue;
      const near = at ? spots.sort((a, b) => dist(a, at!) - dist(b, at!))[Math.min(spots.length - 1, this.rng.int(3))] : spots[0];
      via.push(near);
      at = near;
    }
    const room = st.rooms[k % st.rooms.length];
    const inside = roomSpots(this.nav, level, room, 1.0);
    const to = inside[this.rng.int(Math.max(1, inside.length))] ?? via[via.length - 1] ?? from ?? [0, 0, 0];
    return { kind: "go", via, to };
  }

  /** After the plant: hold a spot 4–9 m from the defuser that sees it, facing it. */
  private guard(id: number, at: readonly [number, number, number]): Task {
    const prev = this.ways.get(id);
    if (prev?.kind === "hold") return prev;
    const level = this.sim.level.def;
    const room = roomAt(level, at[0], at[1] + 0.3, at[2]);
    const def: Vec3 = [at[0], at[1] + 0.3, at[2]];
    const cands = [...(room ? roomSpots(this.nav, level, room, 1) : []), ...this.nearbySpots(at)].filter((p) => {
      const d = dist(p, at);
      return d >= 3 && d <= 10 && sees(this.sim, [p[0], p[1] + 1.6, p[2]], def);
    });
    const spot = cands[this.rng.int(Math.max(1, cands.length))] ?? [at[0], at[1], at[2]];
    const t: Task = { kind: "hold", spot, face: def, room: room ?? "" };
    this.ways.set(id, t);
    return t;
  }

  /** Nodes round a point (every 1.5 m within 8 m). */
  private nearbySpots(at: readonly [number, number, number]): Vec3[] {
    const out: Vec3[] = [];
    for (let dx = -8; dx <= 8; dx += 1.5)
      for (let dz = -8; dz <= 8; dz += 1.5) {
        const n = this.nav.grid.nodeNear(at[0] + dx, at[1], at[2] + dz, 0.7, 0.6);
        if (n >= 0) out.push(this.nav.grid.nodePos(n));
      }
    return out;
  }
}

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
