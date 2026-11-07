// Throws (Phase 8, gadgets/DESIGN.md §4): a thrown gadget is a small ball under gravity, stepped a tick at a time from
// its launch by the same code on the server and on every client, against what sight can't pass (the level, its
// props and panels; never bodies, which machines see at different times). By its data it bounces, goes off where it
// first hits, sticks, or settles on the first flat thing it meets (a wall drops it). The server's ops say where it
// really ended, so a client's copy never drifts for long.
import { DT } from "../core/constants.js";
import type { Vec3 } from "../core/math.js";
import type { GadgetData, GadgetRules } from "../data/schemas.js";
import { raycastLevel, type LevelQuery } from "../level/raycast.js";
import { GFlag, type Gadget } from "./table.js";

/** A surface this flat or flatter is something a gadget can rest or settle on (its normal's height). */
export const FLOOR_NY = 0.8;

export interface FlightEnd {
  /** Came to rest (or ran out of time), stuck where it hit, went off (where it hit, or in the air), settled. */
  how: "rest" | "stick" | "impact" | "settle";
  /** Ticks after the launch. */
  after: number;
  pos: Vec3;
  /** The surface it ended on (null: in the air). */
  normal: Vec3 | null;
  /** The panel it ended on (its index), or −1. */
  panel: number;
}

export interface Flight {
  /** Where it was each tick from the launch (index 0: where it left). */
  readonly path: Vec3[];
  /** Ticks after the launch of its first hit, or −1. */
  firstHit: number;
  /** How it ended, once it has. */
  end: FlightEnd | null;
  pos: Vec3;
  vel: Vec3;
  travelled: number;
}

export interface FlightContext {
  q: LevelQuery;
  rules: GadgetRules;
  /** Gravity (m/s², negative: data/movement.json). */
  gravity: number;
}

/** A flight from its launch, not yet stepped. */
export function launch(pos: Vec3, vel: Vec3): Flight {
  return { path: [[pos[0], pos[1], pos[2]]], firstHit: -1, end: null, pos: [pos[0], pos[1], pos[2]], vel: [vel[0], vel[1], vel[2]], travelled: 0 };
}

/** One tick of a flight that hasn't ended (gadgets/DESIGN.md §4). */
export function stepFlight(ctx: FlightContext, use: Extract<GadgetData["use"], { kind: "throw" }>, f: Flight): void {
  if (f.end) return;
  const t = ctx.rules.throw;
  const after = f.path.length; // this step's tick after the launch
  const v = f.vel;
  v[1] += ctx.gravity * DT;
  const move: Vec3 = [v[0] * DT, v[1] * DT, v[2] * DT];
  const len = Math.hypot(move[0], move[1], move[2]);
  const end = (how: FlightEnd["how"], normal: Vec3 | null, panel: number) => {
    f.end = { how, after, pos: [f.pos[0], f.pos[1], f.pos[2]], normal, panel };
    v[0] = v[1] = v[2] = 0;
  };
  /** It met a surface (`n` its normal): what its data says it does. */
  const contact = (n: Vec3, panel: number) => {
    if (f.firstHit < 0) f.firstHit = after;
    if (use.flight === "impact") end("impact", n, panel);
    else if (use.flight === "stick") end("stick", n, panel);
    else if (use.flight === "settle" && n[1] >= FLOOR_NY) end("settle", n, panel);
    else if (use.flight === "settle") {
      // A wall drops it straight down (research/operators/lesion.md: it falls almost straight after a wall or a ceiling).
      v[0] = 0;
      v[2] = 0;
      v[1] = Math.min(v[1], 0);
    } else {
      // A bounce: `restitution` of the speed into the surface comes back out, `friction` of the speed along it is lost.
      const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
      if (vn < 0) {
        for (let i = 0; i < 3; i++) {
          const along = v[i] - vn * n[i];
          v[i] = along * (1 - t.friction) - t.restitution * vn * n[i];
        }
      }
      if (n[1] >= FLOOR_NY && Math.hypot(v[0], v[1], v[2]) < t.restMps) end("rest", n, panel);
    }
  };
  if (len > 0) {
    const dir: Vec3 = [move[0] / len, move[1] / len, move[2] / len];
    const hit = raycastLevel(ctx.q, f.pos, dir, len + t.radiusM);
    if (hit) {
      const go = Math.max(0, hit.t - t.radiusM);
      for (let i = 0; i < 3; i++) f.pos[i] += dir[i] * go;
      f.travelled += go;
      contact(hit.normal, hit.panel ? hit.panel.entry.panel.spec.index : -1);
    } else {
      for (let i = 0; i < 3; i++) f.pos[i] += move[i];
      f.travelled += len;
      // Rolling or skimming along a floor the ray ahead passed over: kept on top of it, and that's a contact too.
      const below = raycastLevel(ctx.q, f.pos, [0, -1, 0], t.radiusM);
      if (below && below.normal[1] >= FLOOR_NY) {
        f.pos[1] += t.radiusM - below.t;
        if (v[1] < 0) contact(below.normal, below.panel ? below.panel.entry.panel.spec.index : -1);
      }
    }
  }
  if (!f.end && use.flight === "impact" && use.maxTravelM !== undefined && f.travelled >= use.maxTravelM) end("impact", null, -1);
  if (!f.end && after * DT >= t.maxS) end("rest", null, -1);
  f.path.push([f.pos[0], f.pos[1], f.pos[2]]);
}

/**
 * Every flying entry's flight, stepped as far as it's asked for and kept (one per entry id: a server steps each a tick
 * at a time; a client steps what it draws up to the tick it draws).
 */
export class Flights {
  private readonly byId = new Map<number, Flight>();

  constructor(private readonly ctx: FlightContext) {}

  /** The flight of a flying entry, stepped up to `ticksAfter` ticks after its launch (or its end, if sooner). */
  at(g: Gadget, use: Extract<GadgetData["use"], { kind: "throw" }>, ticksAfter: number): Flight {
    let f = this.byId.get(g.id);
    if (!f) this.byId.set(g.id, (f = launch(g.pos, g.vel)));
    while (!f.end && f.path.length <= ticksAfter) stepFlight(this.ctx, use, f);
    return f;
  }

  /** Forget the flights of entries that aren't flying any more (or are gone). */
  prune(flying: (id: number) => boolean): void {
    for (const id of this.byId.keys()) if (!flying(id)) this.byId.delete(id);
  }

  clear(): void {
    this.byId.clear();
  }
}

/** Whether an entry is still in the air. */
export const isFlying = (g: Gadget) => (g.flags & GFlag.Flying) !== 0;
