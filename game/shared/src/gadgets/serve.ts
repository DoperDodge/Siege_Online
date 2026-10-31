// The server's side of the gadget table (Phase 8, gadgets/DESIGN.md §3–§4): the simulation's gadget events become
// entries (a throw flies, a placed gadget stands, a detonator sets its oldest device off, a pick-up takes one away),
// throws are stepped to where they rest, stick or go off, fuses and outdoor signals run out on the server's ticks,
// and steel going up breaks what's on its wall. Every change is a table op the room sends with the next snapshot.
import { isIdleShell } from "../combat/apply.js";
import { DEG, forwardXZ, type Vec3 } from "../core/math.js";
import type { GadgetData } from "../data/schemas.js";
import { indoors } from "../intel/bpCamera.js";
import { raycastLevel } from "../level/raycast.js";
import { droneHitboxes } from "../player/drone.js";
import { poseHitboxes, type Hitbox } from "../player/hitboxes.js";
import { currentHeight } from "../player/stance.js";
import type { Pawn } from "../player/pawn.js";
import { PawnKind, PawnMode } from "../player/types.js";
import type { Sim } from "../sim.js";
import type { SimEvent } from "../weapons/step.js";
import { ticks, ticksOrZero } from "../weapons/ticks.js";
import { FLOOR_NY, Flights, isFlying, type FlightEnd } from "./flight.js";
import { KIND_BP_CAMERA, kindId, kindOf } from "./kinds.js";
import { GFlag, type Gadget } from "./table.js";

type ThrowUse = Extract<GadgetData["use"], { kind: "throw" }>;
type Tripwire = NonNullable<GadgetData["tripwire"]>;

/** The closest distance between segments ab and cd (and the point on ab it's at). */
function segSeg(a: Vec3, b: Vec3, c: Vec3, d: Vec3): { dist: number; at: Vec3 } {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
  const w = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
  const dot = (x: number[], y: number[]) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const A = dot(u, u);
  const B = dot(u, v);
  const C = dot(v, v);
  const D = dot(u, w);
  const E = dot(v, w);
  const den = A * C - B * B;
  let s = den > 1e-12 ? Math.max(0, Math.min(1, (B * E - C * D) / den)) : 0;
  let t = C > 1e-12 ? (B * s + E) / C : 0;
  if (t < 0 || t > 1) {
    t = Math.max(0, Math.min(1, t));
    s = A > 1e-12 ? Math.max(0, Math.min(1, (B * t - D) / A)) : 0;
  }
  const p: Vec3 = [a[0] + u[0] * s, a[1] + u[1] * s, a[2] + u[2] * s];
  const q = [c[0] + v[0] * t, c[1] + v[1] * t, c[2] + v[2] * t];
  return { dist: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), at: p };
}

/** What a gadget going off does (M1: it's gone; the blasts, smoke, stuns and EMPs come with M2 and M3). */
export type GoOff = (g: Gadget, at: Vec3, end: FlightEnd | null) => void;

export class GadgetServer {
  private readonly flights: Flights;

  /**
   * A remote device left the table without its owner's detonator (destroyed, its wall reinforced, a lab tool): its
   * owner has one fewer waiting (the room takes it off their body and corrects them).
   */
  onLost: (g: Gadget, data: GadgetData) => void = () => {};

  constructor(
    private readonly sim: Sim,
    /** Called as a gadget goes off, before it leaves the table. */
    private readonly goOff: GoOff = () => {},
  ) {
    this.flights = new Flights({ q: sim, rules: sim.data.gadgetRules, gravity: sim.data.movement.gravity });
  }

  private dataOf(g: Gadget): GadgetData | undefined {
    return this.sim.data.gadgets.get(kindId(g.kind) ?? "");
  }

  /** The simulation's gadget events of the step just taken (its tick already counted: a throw leaves at this tick). */
  onEvent(e: SimEvent): void {
    const sim = this.sim;
    if (e.kind === "throw" || e.kind === "place") {
      const pawn = sim.pawns.get(e.pawnId);
      const g = sim.data.gadgets.get(e.gadget);
      const kind = kindOf(e.gadget);
      if (!pawn || pawn.ownerId === null || !g || kind < 0) return;
      const base = { kind, owner: pawn.ownerId, team: pawn.team, yaw: e.yaw, panel: -1, launchTick: 0, fuseEnd: 0, signalEnd: 0, readyAt: 0, seq: e.seq };
      if (e.kind === "throw") {
        const fuse = g.use.kind === "throw" && g.use.fuseS !== undefined ? sim.tick + ticks(g.use.fuseS) : 0;
        sim.gadgets.add({ ...base, pos: e.pos, vel: e.vel, flags: GFlag.Flying, launchTick: sim.tick, fuseEnd: fuse });
        return;
      }
      const fuse = g.use.kind === "place" && g.use.fuseS !== undefined ? sim.tick + ticks(g.use.fuseS) : 0;
      // A Bulletproof Camera placed outdoors loses its signal after a while (research/intel.md §4).
      const out = kind === KIND_BP_CAMERA && !indoors(sim.level.def, ...e.pos);
      const flags = (e.onFloor ? GFlag.OnFloor : 0) | (e.flat ? GFlag.Flat : 0);
      // A tripwire arms its time after it's placed (the Claymore: `readyAt`).
      const armed = g.tripwire ? sim.tick + ticksOrZero(g.tripwire.armS) : 0;
      sim.gadgets.add({ ...base, pos: e.pos, vel: [0, 0, 0], flags, panel: e.panel, fuseEnd: fuse, signalEnd: out ? sim.tick + ticks(sim.data.intel.bulletproofCamera.outdoorSignalS) : 0, readyAt: armed });
      return;
    }
    if (e.kind === "detonate") {
      const pawn = sim.pawns.get(e.pawnId);
      const kind = kindOf(e.gadget);
      // Its owner's oldest of that kind out (the controller's: Skopós's shells share theirs).
      const g = pawn && sim.gadgets.list.find((x) => x.owner === pawn.ownerId && x.kind === kind);
      if (g) this.trigger(g, null);
      return;
    }
    if (e.kind === "pickUpGadget") {
      const pawn = sim.pawns.get(e.pawnId);
      const g = sim.gadgets.get(e.gadgetId);
      if (pawn && g && g.owner === pawn.ownerId) sim.gadgets.remove(g.id);
    }
  }

  /** A gadget goes off where it is: what it does, then it's gone. */
  trigger(g: Gadget, end: FlightEnd | null): void {
    const at: Vec3 = end ? end.pos : this.whereNow(g);
    this.goOff(g, at, end);
    this.sim.gadgets.remove(g.id);
  }

  /** Where an entry is now: a flying one where its flight has got to, else where it stands. */
  whereNow(g: Gadget): Vec3 {
    const use = this.dataOf(g)?.use;
    if (!isFlying(g) || use?.kind !== "throw") return [g.pos[0], g.pos[1], g.pos[2]];
    const f = this.flights.at(g, use, Math.max(0, this.sim.tick - g.launchTick));
    return [f.pos[0], f.pos[1], f.pos[2]];
  }

  /** Once a tick, after the room handled the step's events: flights, fuses, tripwires, outdoor signals. */
  step(): void {
    const sim = this.sim;
    const tick = sim.tick;
    for (const g of [...sim.gadgets.list]) {
      const d = this.dataOf(g);
      if (!d) continue;
      if (isFlying(g) && d.use.kind === "throw") this.fly(g, d.use);
      const now = sim.gadgets.get(g.id);
      if (!now) continue;
      if (now.fuseEnd !== 0 && tick >= now.fuseEnd) this.trigger(now, null);
      else if (d.tripwire && !isFlying(now) && tick >= now.readyAt && this.tripped(now, d.tripwire)) this.trigger(now, null);
      else if (now.signalEnd !== 0 && tick >= now.signalEnd && !(now.flags & GFlag.Lost)) sim.gadgets.update(now.id, { flags: now.flags | GFlag.Lost });
    }
    this.flights.prune((id) => {
      const g = sim.gadgets.get(id);
      return g !== undefined && isFlying(g);
    });
    for (const id of this.checkedTo.keys()) if (!sim.gadgets.get(id)) this.checkedTo.delete(id);
  }

  /** A pawn's hitboxes now (a body's or a drone's). */
  private hitboxes(p: Pawn): Hitbox[] {
    return p.kind === PawnKind.Drone ? droneHitboxes(this.sim.data.intel.drone, p.state) : poseHitboxes(this.sim.data.movement, this.sim.data.hitboxes, p.state);
  }

  /**
   * Whether an enemy body crosses one of a tripwire's lasers (the Claymore, research/gadgets.md §3.3): straight out
   * from it at its height, along its facing turned by each angle, up to `lengthM` or what stops sight first (they pass
   * holes and gaps). A body crosses one where its own capsule (what it walks with, feet to head) does: a thin hitbox
   * would let a standing body straddle a laser between its feet. Not its own team, the dead, or Skopós's idle shell
   * (it fires when she wakes that shell).
   */
  private tripped(g: Gadget, t: Tripwire): boolean {
    const sim = this.sim;
    const m = sim.data.movement;
    const r = m.stance.collisionRadius;
    const bodies = [...sim.pawns.values()].filter((p) => p.kind === PawnKind.Body && p.team !== g.team && p.state.mode !== PawnMode.Dead && p.state.mode !== PawnMode.Held && !isIdleShell(sim, p));
    if (bodies.length === 0) return false;
    for (const deg of t.anglesDeg) {
      const [fx, fz] = forwardXZ(g.yaw + deg * DEG);
      const dir: Vec3 = [fx, 0, fz];
      const len = raycastLevel(sim, g.pos, dir, t.lengthM)?.t ?? t.lengthM;
      const end: Vec3 = [g.pos[0] + fx * len, g.pos[1], g.pos[2] + fz * len];
      for (const p of bodies) {
        const s = p.state;
        const top = Math.max(r, currentHeight(m, s) - r);
        if (segSeg(g.pos, end, [s.x, s.y + r, s.z], [s.x, s.y + top, s.z]).dist <= r) return true;
      }
    }
    return false;
  }

  /**
   * An impact gadget's path this tick against bodies and drones (the server's alone: a client's flight leaves them out):
   * the first one it meets, not its thrower's, sets it off there.
   */
  private hitsBody(g: Gadget, from: Vec3, to: Vec3): Vec3 | null {
    const r = this.sim.data.gadgetRules.throw.radiusM;
    let best: { d: number; at: Vec3 } | null = null;
    for (const p of this.sim.pawns.values()) {
      if (p.ownerId === g.owner || p.state.mode === PawnMode.Dead || p.state.mode === PawnMode.Held) continue;
      for (const h of this.hitboxes(p)) {
        const s = segSeg(from, to, h.a, h.b);
        if (s.dist > h.radius + r) continue;
        const d = Math.hypot(s.at[0] - from[0], s.at[1] - from[1], s.at[2] - from[2]);
        if (!best || d < best.d) best = { d, at: s.at };
      }
    }
    return best?.at ?? null;
  }

  /** How far along its path each impact flight has been checked against bodies (by entry id). */
  private readonly checkedTo = new Map<number, number>();

  /** One tick of a throw: its first hit cuts its fuse; at its end it goes off, or rests, sticks or settles there. */
  private fly(g: Gadget, use: ThrowUse) {
    const f = this.flights.at(g, use, Math.max(0, this.sim.tick - g.launchTick));
    if (use.flight === "impact") {
      // Bodies and drones on the way first: it goes off on the first it meets.
      for (let k = (this.checkedTo.get(g.id) ?? 0) + 1; k < f.path.length; k++) {
        const at = this.hitsBody(g, f.path[k - 1], f.path[k]);
        if (at) {
          this.checkedTo.delete(g.id);
          this.trigger(g, { how: "impact", after: k, pos: at, normal: null, panel: -1 });
          return;
        }
      }
      this.checkedTo.set(g.id, f.path.length - 1);
    }
    if (f.firstHit >= 0 && use.afterHitS !== undefined && g.fuseEnd !== 0) {
      const cut = g.launchTick + f.firstHit + ticks(use.afterHitS);
      if (cut < g.fuseEnd) g = this.sim.gadgets.update(g.id, { fuseEnd: cut })!;
    }
    const end = f.end;
    if (!end) return;
    if (end.how === "impact") {
      this.trigger(g, end);
      return;
    }
    const n = end.normal;
    const onFloor = n !== null && n[1] >= FLOOR_NY;
    // Stuck on a wall it faces out of it; on a floor it keeps the thrower's way.
    const yaw = n && !onFloor && end.how === "stick" ? Math.atan2(-n[0], -n[2]) : g.yaw;
    this.sim.gadgets.update(g.id, { pos: end.pos, yaw, flags: (g.flags & ~GFlag.Flying) | (onFloor || end.how !== "stick" ? GFlag.OnFloor : 0), panel: end.panel, vel: [0, 0, 0] });
  }

  /** Steel went up on a panel: what's on it breaks (a camera's glass) or is destroyed (research CSV `action.reinforce`). */
  reinforced(panel: number): void {
    for (const g of [...this.sim.gadgets.list]) {
      if (g.panel !== panel) continue;
      if (g.kind === KIND_BP_CAMERA) this.sim.gadgets.update(g.id, { flags: g.flags | GFlag.Broken });
      else this.destroy(g);
    }
  }

  /** An entry destroyed (not set off): gone, and a remote device's owner told. */
  destroy(g: Gadget): void {
    const d = this.dataOf(g);
    this.sim.gadgets.remove(g.id);
    if (d?.remote) this.onLost(g, d);
  }

  /** An entry in a blast's destruction range: a Bulletproof Camera's glass breaks (it keeps its place in the list); the rest are destroyed. */
  blastHit(g: Gadget): void {
    if (g.kind === KIND_BP_CAMERA) this.sim.gadgets.update(g.id, { flags: g.flags | GFlag.Broken });
    else this.destroy(g);
  }

  /** Break these Bulletproof Cameras' glass (shot from the side or the back, knifed). */
  breakCams(cams: readonly Gadget[]): void {
    for (const c of cams) this.sim.gadgets.update(c.id, { flags: c.flags | GFlag.Broken });
  }

  /** Everything gone (a lab tool; a new round clears the table itself): remote devices' owners told. */
  clear(): void {
    const lost = this.sim.gadgets.list.filter((g) => this.dataOf(g)?.remote);
    this.flights.clear();
    this.sim.gadgets.clear();
    for (const g of lost) this.onLost(g, this.dataOf(g)!);
  }
}
