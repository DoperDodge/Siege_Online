// The server's side of the gadget table (Phase 8, gadgets/DESIGN.md §3–§4): the simulation's gadget events become
// entries (a throw flies, a placed gadget stands, a detonator sets its oldest working device off, a pick-up takes one
// away), throws are stepped to where they rest, stick or go off, fuses and outdoor signals run out on the server's
// ticks, and steel going up breaks what's on its wall. M3: smoke stays as a cloud for its time, EMPs disable (DSEG)
// until a tick, alarms and the metal detector sound while someone's in reach, barbed wire bites who moves in it, and
// the level's ingredients go through their stages. M5: a detonator sets Thermite's charge burning (it goes off after
// its burn) and Fuze's drilling (its grenades come out on the far side one after another, then it falls); Fuze's are
// one at a time. M7: a Black Mirror burns its window out of its wall as it's placed and gets its canister; the
// canister destroyed, the glass is ejected 4 s later; it falls with its wall. Every change is a table op the room sends
// with the next snapshot.
import { isIdleShell } from "../combat/apply.js";
import { DEG, forwardXZ, type Vec3 } from "../core/math.js";
import type { GadgetData } from "../data/schemas.js";
import { explosiveOps } from "../destruction/explosives.js";
import type { IndexedOp } from "../destruction/panels.js";
import { indoors } from "../intel/bpCamera.js";
import { raycastLevel } from "../level/raycast.js";
import { droneHitboxes } from "../player/drone.js";
import { poseHitboxes, type Hitbox } from "../player/hitboxes.js";
import { isDowned } from "../player/downed.js";
import { currentHeight } from "../player/stance.js";
import type { Pawn } from "../player/pawn.js";
import { PawnKind, PawnMode } from "../player/types.js";
import type { Sim } from "../sim.js";
import type { SimEvent } from "../weapons/step.js";
import { ticks, ticksOrZero } from "../weapons/ticks.js";
import { FLOOR_NY, Flights, isFlying, type FlightEnd } from "./flight.js";
import { inFrame, inWireBox, jetOf } from "./areas.js";
import { isCloud, pawnDistance } from "./blast.js";
import { behindOf, fanVelocity, tubeTip, type ClusterData } from "./cluster.js";
import { empReach } from "./electronics.js";
import { gadgetOnRay } from "./hits.js";
import { pointJammed } from "./jammers.js";
import { canisterSpot, mirrorHeld, mirrorOf, windowOps } from "./mirror.js";
import { isIngredient, KIND_BP_CAMERA, KIND_SHELL_SHIELD, kindId, kindOf } from "./kinds.js";
import { detonatable, GFlag, type Gadget } from "./table.js";

const KIND_WIRE = kindOf("barbed_wire");
/** A reinforced wall's bar crushes what stands this close to either face of it (Phase 8 M6; ours)... */
const FOOT_OUT_M = 0.35;
/** ...with its box's centre this low off the wall's bottom (ours). */
const FOOT_UP_M = 0.4;
/** A body moving this fast or more is moving through barbed wire (it bites). */
const MOVING_MPS = 0.3;
/** What a set-off ingredient is doing, for the room: a fire extinguisher's burst, a gas pipe's jet or its blast, a metal detector destroyed. */
export type IngredientStage = "burst" | "jet" | "blast" | "destroyed";

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
  let s: number;
  let t: number;
  if (C <= 1e-12) {
    // cd is a point: the point of ab nearest it.
    s = A > 1e-12 ? Math.max(0, Math.min(1, -D / A)) : 0;
    t = 0;
  } else {
    s = den > 1e-12 ? Math.max(0, Math.min(1, (B * E - C * D) / den)) : 0;
    t = (B * s + E) / C;
    if (t < 0 || t > 1) {
      t = Math.max(0, Math.min(1, t));
      s = A > 1e-12 ? Math.max(0, Math.min(1, (B * t - D) / A)) : 0;
    }
  }
  const p: Vec3 = [a[0] + u[0] * s, a[1] + u[1] * s, a[2] + u[2] * s];
  const q = [c[0] + v[0] * t, c[1] + v[1] * t, c[2] + v[2] * t];
  return { dist: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), at: p };
}

/** What a gadget going off does (the room's: blasts, stuns, EMPs; smoke stays as a cloud here). */
export type GoOff = (g: Gadget, at: Vec3, end: FlightEnd | null) => void;

/**
 * What a set-off cluster charge drills through before its grenades come out (Phase 8 M5): steel where it sits (a
 * reinforced section or a reinforced hatch), a solid gadget behind it (a deployable shield, `shield`), or neither (a
 * soft surface: at once).
 */
export function drillOf(sim: Sim, g: Gadget): { steel: boolean; shield: Gadget | null } {
  const entry = g.panel >= 0 ? sim.level.panels.list[g.panel] : undefined;
  if (entry) {
    const p = entry.panel;
    if (p.kind === "hatch") return { steel: p.reinforced !== 0, shield: null };
    if (p.kind !== "wall") return { steel: false, shield: null };
    const f = entry.frame;
    const u = (g.pos[0] - f.center[0]) * f.u[0] + (g.pos[1] - f.center[1]) * f.u[1] + (g.pos[2] - f.center[2]) * f.u[2] + f.w / 2;
    const col = Math.max(0, Math.min(p.w - 1, Math.floor(u / p.cellU)));
    return { steel: (p.reinforced & (1 << p.sectionOf(col))) !== 0, shield: null };
  }
  const depth = sim.data.gadgets.get(kindId(g.kind) ?? "")?.sizeM[2] ?? 0;
  const hit = gadgetOnRay(sim.gadgets, sim.data, g.pos, behindOf(g), depth / 2 + 0.1, (e) => e.id !== g.id && !isFlying(e) && sim.data.gadgets.get(kindId(e.kind) ?? "")?.solid === true);
  return { steel: false, shield: hit?.g ?? null };
}


export class GadgetServer {
  private readonly flights: Flights;

  /**
   * A remote device left the table without its owner's detonator (destroyed, its wall reinforced, a lab tool): its
   * owner has one fewer waiting (the room takes it off their body and corrects them).
   */
  onLost: (g: Gadget, data: GadgetData) => void = () => {};
  /** The room: a body or drone hurt by a gadget over time (barbed wire, a gas pipe's jet or fire), by `amount` now. */
  hurt: (g: Gadget, pawn: Pawn, amount: number) => void = () => {};
  /** The room: an alarm or a metal detector started sounding (`by`, the body in reach) or went quiet (null). */
  onAlarm: (g: Gadget, by: Pawn | null) => void = () => {};
  /** The room: a Gu mine needled this body (Phase 8 M10; its `needled` changed: its owner needs a correction). */
  onNeedle: (pawn: Pawn, g: Gadget) => void = () => {};
  /** Gu needles in bodies (Phase 8 M10; by pawn id): the tick of the next bite, and the mine (for its owner and numbers). */
  private readonly needles = new Map<number, { next: number; g: Gadget }>();
  /** The room: an ingredient set off reached a stage (its effects: smoke and concussion, a jet, a blast). */
  onIngredient: (g: Gadget, stage: IngredientStage) => void = () => {};
  /** Whether a match is in its prep phase (an alarm can't go outdoors then). */
  inPrep: () => boolean = () => false;
  /** The room: panel ops made here (a cluster charge's hole, Phase 8 M5), applied with this tick's. */
  cut: (ops: IndexedOp[]) => void = () => {};
  /** How many grenades each set-off cluster charge has let out (by entry id; the server's alone). */
  private readonly released = new Map<number, number>();
  /** Each Black Mirror's canister's entry id: its mirror's (the server's alone; M7). */
  private readonly canisters = new Map<number, number>();
  /** Entries a Kludge's hack has fizzling out (M8): the tick each is destroyed. */
  private readonly fizzles = new Map<number, number>();

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
      const base = { kind, owner: pawn.ownerId, team: pawn.team, yaw: e.yaw, panel: -1, launchTick: 0, fuseEnd: 0, signalEnd: 0, readyAt: 0, offEnd: 0, seq: e.seq };
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
      const put = sim.gadgets.add({ ...base, pos: e.pos, vel: [0, 0, 0], flags, panel: e.panel, fuseEnd: fuse, signalEnd: out ? sim.tick + ticks(sim.data.intel.bulletproofCamera.outdoorSignalS) : 0, readyAt: armed });
      if (g.mirror) this.mirrorIn(put, g, g.mirror.canister);
      return;
    }
    if (e.kind === "detonate") {
      const pawn = sim.pawns.get(e.pawnId);
      // Its owner's oldest working one of that kind out (the controller's: Skopós's shells share theirs), not one inside
      // an enemy jammer (Phase 8 M6).
      const g = pawn && detonatable(sim.gadgets.list, pawn.ownerId ?? 0, kindOf(e.gadget), (x) => !pointJammed(sim, x.team, x.pos));
      if (g) this.detonated(g);
      return;
    }
    if (e.kind === "pickUpGadget") {
      const pawn = sim.pawns.get(e.pawnId);
      const g = sim.gadgets.get(e.gadgetId);
      if (pawn && g && g.owner === pawn.ownerId) sim.gadgets.remove(g.id);
    }
  }

  /**
   * Its owner's detonator set a remote device off: Thermite's charge starts burning (it goes off `burnS` later,
   * gadgets/DESIGN.md §7), Fuze's starts drilling; the rest go off now.
   */
  detonated(g: Gadget): void {
    const d = this.dataOf(g);
    if (d?.burnS !== undefined) {
      this.sim.gadgets.update(g.id, { flags: g.flags | GFlag.Active, fuseEnd: this.sim.tick + ticks(d.burnS) });
      return;
    }
    if (d?.cluster) {
      // Through steel or a shield it drills first; through a soft surface its grenades come out at once (this tick's step).
      const drill = drillOf(this.sim, g);
      this.sim.gadgets.update(g.id, { flags: g.flags | GFlag.Active, launchTick: this.sim.tick, fuseEnd: this.sim.tick + (drill.steel || drill.shield ? ticks(d.cluster.drillS) : 0) });
      this.released.set(g.id, 0);
      return;
    }
    this.trigger(g, null);
  }

  /**
   * A set-off cluster charge's tick (Phase 8 M5): drilling until `fuseEnd`; then its tube is through (its hole cut, a
   * shield's glass shattered) and one grenade comes out every `everyS` from the tube's end, across the fan; after the
   * last it falls (gone).
   */
  private cluster(g: Gadget, c: ClusterData) {
    const tick = this.sim.tick;
    if (tick < g.fuseEnd) return;
    const n = this.released.get(g.id) ?? 0;
    if (tick - g.fuseEnd < n * ticks(c.everyS)) return;
    if (n === 0) this.breakThrough(g, c);
    this.release(g, c, n);
    if (n + 1 >= c.count) {
      this.released.delete(g.id);
      this.sim.gadgets.remove(g.id);
    }
  }

  /**
   * A Black Mirror just placed (M7): its window burnt out of every layer of its wall (applied with this tick's ops), and
   * its canister put on its placer's side under the glass.
   */
  private mirrorIn(g: Gadget, d: GadgetData, canister: string) {
    const ops = windowOps(this.sim.level.panels, g, d);
    if (ops.length) this.cut(ops);
    const at = canisterSpot(this.sim.data, g, this.sim.level.panels.list[g.panel]?.frame.t ?? 0.2);
    if (!at) return;
    const c = this.sim.gadgets.add({ kind: kindOf(canister), owner: g.owner, team: g.team, pos: at, yaw: g.yaw, vel: [0, 0, 0], flags: 0, panel: -1, launchTick: 0, fuseEnd: 0, signalEnd: 0, readyAt: 0, offEnd: 0, seq: 0 });
    this.canisters.set(c.id, g.id);
  }

  /**
   * A device a Kludge's hack can't control (a Nitro Cell, M8): disabled at once (its detonator skips it) and destroyed
   * `after` ticks later, without its blast.
   */
  fizzle(g: Gadget, after: number): void {
    const end = this.sim.tick + Math.max(1, after);
    this.sim.gadgets.update(g.id, { flags: g.flags | GFlag.Off, offEnd: Math.max(g.offEnd, end) });
    this.fizzles.set(g.id, end);
  }

  /** A Black Mirror goes (its wall gave way round it): its canister with it. */
  private mirrorOut(g: Gadget) {
    for (const [c, m] of this.canisters)
      if (m === g.id) {
        this.canisters.delete(c);
        this.sim.gadgets.remove(c);
      }
    this.sim.gadgets.remove(g.id);
  }

  /**
   * Panel ops changed a panel (the room's, after it applied them; M7): a Black Mirror in it whose wall no longer holds
   * it falls (data/gadgets/black_mirror.json `mirror.lossMax`).
   */
  panelChanged(panel: number): void {
    for (const g of [...this.sim.gadgets.list]) {
      if (g.panel !== panel) continue;
      const a = mirrorOf(this.sim.data, g);
      if (a && !mirrorHeld(this.sim.level.panels, g, a.d, a.m)) this.mirrorOut(g);
    }
  }

  /** A cluster charge's tube gets through: its hole in the panel it's on (data/destruction.json), or a shield's glass shattered. */
  private breakThrough(g: Gadget, c: ClusterData) {
    const ex = this.sim.data.destruction.explosives[c.cut];
    if (g.panel >= 0 && ex) {
      const b = behindOf(g);
      const from: Vec3 = [g.pos[0] - b[0] * 0.3, g.pos[1] - b[1] * 0.3, g.pos[2] - b[2] * 0.3];
      // A hatch keeps its hp (the tube only goes through it).
      const ops = explosiveOps(this.sim.level.panels, this.sim.data.destruction, ex, from, b, 1).filter((o) => o.op.kind !== "damage" || o.op.amount > 0);
      if (ops.length) this.cut(ops);
      return;
    }
    const shield = drillOf(this.sim, g).shield;
    if (shield) this.sim.gadgets.update(shield.id, { flags: shield.flags | GFlag.Hit });
  }

  /** Grenade `i` of a set-off cluster charge out of its tube's end, thrown across the fan with its own fuse. */
  private release(g: Gadget, c: ClusterData, i: number) {
    const k = this.sim.data.gadgets.get(c.grenade);
    const tip = tubeTip(this.sim.data, g);
    this.released.set(g.id, i + 1);
    if (!k || k.use.kind !== "throw" || !tip) return;
    const tick = this.sim.tick;
    const fuse = k.use.fuseS !== undefined ? tick + ticks(k.use.fuseS) : 0;
    this.sim.gadgets.add({ kind: kindOf(c.grenade), owner: g.owner, team: g.team, pos: tip, yaw: g.yaw, vel: fanVelocity(g, c, i), flags: GFlag.Flying, panel: -1, launchTick: tick, fuseEnd: fuse, signalEnd: 0, readyAt: 0, offEnd: 0, seq: 0 });
  }

  /** A gadget goes off where it is: what it does, then it's gone (smoke: its cloud stays there for its time). */
  trigger(g: Gadget, end: FlightEnd | null): void {
    const at: Vec3 = end ? end.pos : this.whereNow(g);
    this.goOff(g, at, end);
    const cloud = this.dataOf(g)?.cloud;
    if (cloud && this.sim.gadgets.get(g.id)) {
      this.sim.gadgets.update(g.id, { pos: at, vel: [0, 0, 0], flags: (g.flags & ~GFlag.Flying) | GFlag.OnFloor | GFlag.Active, fuseEnd: this.sim.tick + ticks(cloud.seconds) });
      return;
    }
    this.sim.gadgets.remove(g.id);
  }

  /** Where an entry is now: a flying one where its flight has got to, else where it stands. */
  whereNow(g: Gadget): Vec3 {
    const use = this.dataOf(g)?.use;
    if (!isFlying(g) || use?.kind !== "throw") return [g.pos[0], g.pos[1], g.pos[2]];
    const f = this.flights.at(g, use, Math.max(0, this.sim.tick - g.launchTick));
    return [f.pos[0], f.pos[1], f.pos[2]];
  }

  /**
   * Once a tick, after the room handled the step's events: flights, DSEG wearing off, clouds' time, fuses, tripwires
   * and alarms (not while disabled), outdoor signals, barbed wire, the ingredients.
   */
  step(): void {
    const sim = this.sim;
    const tick = sim.tick;
    for (const [id, end] of this.fizzles) {
      const g = sim.gadgets.get(id);
      if (!g) this.fizzles.delete(id);
      else if (tick >= end) {
        this.fizzles.delete(id);
        this.destroy(g);
      }
    }
    for (const g of [...sim.gadgets.list]) {
      if (isIngredient(g.kind)) {
        this.ingredient(this.wakeUp(g));
        continue;
      }
      const d = this.dataOf(g);
      if (!d) continue;
      if (isFlying(g) && d.use.kind === "throw") this.fly(g, d);
      let now = sim.gadgets.get(g.id);
      if (!now) continue;
      now = this.wakeUp(now);
      if (d.cloud && now.flags & GFlag.Active) {
        if (tick >= now.fuseEnd) sim.gadgets.remove(now.id);
        continue;
      }
      if (d.cluster && now.flags & GFlag.Active) {
        this.cluster(now, d.cluster);
        continue;
      }
      // A Black Mirror whose canister went: its glass is ejected at the end of its time (an open hole, its frame left).
      if (d.mirror) {
        if (now.flags & GFlag.Active && tick >= now.fuseEnd) sim.gadgets.update(now.id, { flags: (now.flags & ~GFlag.Active) | GFlag.Broken, fuseEnd: 0 });
        continue;
      }
      const off = (now.flags & GFlag.Off) !== 0;
      if (now.fuseEnd !== 0 && tick >= now.fuseEnd) this.trigger(now, null);
      else if (d.tripwire && !off && !isFlying(now) && tick >= now.readyAt && this.tripped(now, d.tripwire)) this.trigger(now, null);
      else if (d.gu && !isFlying(now)) {
        // A Gu mine at rest (Phase 8 M10): an enemy body within reach (a downed one too) sets it off.
        const r = d.gu.radiusM;
        if (this.bodyNear(now, (p) => pawnDistance(sim, p, now!.pos) <= r, true)) this.sting(now);
      } else if (d.alarm && !isFlying(now)) {
        const r = d.alarm.radiusM;
        this.sound(now, off || tick < now.readyAt ? null : this.bodyNear(now, (p) => pawnDistance(sim, p, now!.pos) <= r, true));
      } else if (now.signalEnd !== 0 && tick >= now.signalEnd && !(now.flags & GFlag.Lost)) sim.gadgets.update(now.id, { flags: now.flags | GFlag.Lost });
    }
    this.wires();
    this.bites();
    this.flights.prune((id) => {
      const g = sim.gadgets.get(id);
      return g !== undefined && isFlying(g);
    });
    for (const id of this.checkedTo.keys()) if (!sim.gadgets.get(id)) this.checkedTo.delete(id);
    for (const id of this.released.keys()) if (!sim.gadgets.get(id)) this.released.delete(id);
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

  /**
   * One tick of a throw: its first hit cuts its fuse; at its end it goes off, or rests, sticks or settles there (an
   * alarm arms `armS` later; in a match's prep one that ends outdoors is destroyed).
   */
  private fly(g: Gadget, d: GadgetData) {
    const use = d.use as ThrowUse;
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
    if (d.alarm && this.inPrep() && !indoors(this.sim.level.def, ...end.pos)) {
      this.destroy(g);
      return;
    }
    const readyAt = d.alarm ? this.sim.tick + ticksOrZero(d.alarm.armS) : g.readyAt;
    this.sim.gadgets.update(g.id, { pos: end.pos, yaw, flags: (g.flags & ~GFlag.Flying) | (onFloor || end.how !== "stick" ? GFlag.OnFloor : 0), panel: end.panel, vel: [0, 0, 0], readyAt });
  }

  /** An entry whose DSEG has worn off is on again. */
  private wakeUp(g: Gadget): Gadget {
    if (!(g.flags & GFlag.Off) || this.sim.tick < g.offEnd) return g;
    return this.sim.gadgets.update(g.id, { flags: g.flags & ~GFlag.Off, offEnd: 0 })!;
  }

  /**
   * An EMP of `team`'s (an Impact EMP grenade, a Bulletproof Camera's dart; gadgets/electronics.ts): the other side's
   * electronics within `radiusM` disabled for `seconds` (it refreshes), its bodies and drones jammed as long. What it
   * jammed (their owners need a correction) and the default cameras it reached, for the room.
   */
  emp(team: number, at: Vec3, radiusM: number, seconds: number): { pawns: Pawn[]; cams: number } {
    const r = empReach(this.sim, team, at, radiusM);
    const end = this.sim.tick + ticks(seconds);
    for (const g of r.gadgets) this.sim.gadgets.update(g.id, { flags: g.flags | GFlag.Off, offEnd: Math.max(g.offEnd, end) });
    for (const p of r.pawns) p.state.jammed = Math.max(p.state.jammed, ticks(seconds));
    return { pawns: r.pawns, cams: r.cams };
  }

  /** A living body (Skopós's idle shell left out) that `near` accepts: of the other side than `g`'s (`enemies`), or anyone's. */
  private bodyNear(g: Gadget, near: (p: Pawn) => boolean, enemies: boolean): Pawn | null {
    for (const p of this.sim.pawns.values()) {
      if (p.kind !== PawnKind.Body || (enemies && p.team === g.team) || p.state.mode === PawnMode.Dead || p.state.mode === PawnMode.Held) continue;
      if (!isIdleShell(this.sim, p) && near(p)) return p;
    }
    return null;
  }

  /** An alarm (or a metal detector) sounds while `by` is in reach: the room is told as it starts and stops. */
  private sound(g: Gadget, by: Pawn | null) {
    const on = by !== null;
    if (on === ((g.flags & GFlag.Active) !== 0)) return;
    this.sim.gadgets.update(g.id, { flags: on ? g.flags | GFlag.Active : g.flags & ~GFlag.Active });
    this.onAlarm(g, by);
  }

  /**
   * A Gu mine set off (Phase 8 M10; lesion.md): an enemy body within its reach, a knife or a hammer on it. It's gone, and
   * every enemy body within its reach that isn't down (nor Skopós's idle shell) is needled: its hit, then a bite every
   * `everyS`; one already needled takes the hit and a bite at once, and its timer starts again (Y8S3).
   */
  sting(g: Gadget): void {
    const k = this.dataOf(g)?.gu;
    if (!k) return;
    this.sim.gadgets.remove(g.id);
    for (const p of [...this.sim.pawns.values()]) {
      const s = p.state;
      if (p.kind !== PawnKind.Body || p.team === g.team || s.mode === PawnMode.Dead || s.mode === PawnMode.Held || isDowned(s) || isIdleShell(this.sim, p)) continue;
      if (pawnDistance(this.sim, p, g.pos) > k.radiusM) continue;
      const again = s.needled;
      s.needled = true;
      this.needles.set(p.id, { next: this.sim.tick + ticks(k.everyS), g });
      this.onNeedle(p, g);
      this.hurt(g, p, k.hit + (again ? k.damage : 0));
    }
  }

  /** The needled bitten (Phase 8 M10): a Gu's `damage` every `everyS` until the needle's pulled or the body is down or dead. */
  private bites() {
    const tick = this.sim.tick;
    for (const [id, n] of this.needles) {
      const p = this.sim.pawns.get(id);
      const k = this.dataOf(n.g)?.gu;
      if (!p || !k || !p.state.needled || p.state.mode === PawnMode.Dead || isDowned(p.state)) {
        this.needles.delete(id);
        continue;
      }
      if (tick < n.next) continue;
      n.next = tick + ticks(k.everyS);
      this.hurt(n.g, p, k.damage);
    }
  }

  /** Barbed wire's bite: every `everyS`, an enemy body moving in a wire takes its damage (once, however many it's in). */
  private wires() {
    const w = this.sim.data.gadgets.get("barbed_wire");
    if (!w?.wire || this.sim.tick % ticks(w.wire.everyS) !== 0) return;
    const r = this.sim.data.movement.stance.collisionRadius;
    for (const p of this.sim.pawns.values()) {
      const s = p.state;
      if (p.kind !== PawnKind.Body || s.mode === PawnMode.Dead || s.mode === PawnMode.Held || Math.hypot(s.vx, s.vz) < MOVING_MPS) continue;
      const g = this.sim.gadgets.list.find((e) => e.kind === KIND_WIRE && e.team !== p.team && !isFlying(e) && inWireBox(e, w.sizeM, s.x, s.y, s.z, r));
      if (g) this.hurt(g, p, w.wire.damage);
    }
  }

  /**
   * An ingredient set off (shot, knifed, in a blast): a fire extinguisher bursts into its cloud, a gas pipe starts its
   * jet, a metal detector is destroyed. Once going or spent, nothing more.
   */
  ignite(g: Gadget): void {
    if (g.flags & (GFlag.Active | GFlag.Broken) && kindId(g.kind) !== "metal_detector") return;
    const k = this.sim.data.gadgetRules.ingredients;
    const kind = kindId(g.kind);
    if (kind === "metal_detector") {
      this.sim.gadgets.remove(g.id);
      this.onIngredient(g, "destroyed");
      return;
    }
    const seconds = kind === "fire_extinguisher" ? k.fire_extinguisher.cloud.seconds : k.gas_pipe.jet.seconds;
    const e = this.sim.gadgets.update(g.id, { flags: g.flags | GFlag.Active, fuseEnd: this.sim.tick + ticks(seconds) })!;
    this.onIngredient(e, kind === "fire_extinguisher" ? "burst" : "jet");
  }

  /**
   * An ingredient's tick: a metal detector sounds while any body is in its frame (not while disabled); a fire
   * extinguisher's cloud runs out (it's spent); a gas pipe burns what's in its jet, then goes off, then burns what's in
   * its fire on the floor under it, then it's spent.
   */
  private ingredient(g: Gadget) {
    const sim = this.sim;
    const tick = sim.tick;
    const k = sim.data.gadgetRules.ingredients;
    const kind = kindId(g.kind);
    if (kind === "metal_detector") {
      const size = k.metal_detector.sizeM;
      this.sound(g, g.flags & GFlag.Off ? null : this.bodyNear(g, (p) => inFrame(g, size, [p.state.x, p.state.y + 0.9, p.state.z]), false));
      return;
    }
    if (!(g.flags & GFlag.Active)) return;
    if (kind === "fire_extinguisher") {
      if (tick >= g.fuseEnd) sim.gadgets.update(g.id, { flags: (g.flags & ~GFlag.Active) | GFlag.Broken, fuseEnd: 0 });
      return;
    }
    const pipe = k.gas_pipe;
    const fire = (g.flags & GFlag.Hit) !== 0;
    const stage = fire ? pipe.fire : pipe.jet;
    const since = tick - (g.fuseEnd - ticks(stage.seconds));
    if (since % ticks(stage.everyS) === 0) this.burn(g, fire);
    if (tick < g.fuseEnd) return;
    if (!fire) {
      this.onIngredient(g, "blast");
      sim.gadgets.update(g.id, { flags: g.flags | GFlag.Hit, fuseEnd: tick + ticks(pipe.fire.seconds) });
    } else sim.gadgets.update(g.id, { flags: (g.flags & ~(GFlag.Active | GFlag.Hit)) | GFlag.Broken, fuseEnd: 0 });
  }

  /** A gas pipe's jet or fire burns: bodies and drones in it are hurt (a drone dies of it), gadgets in it destroyed. */
  private burn(g: Gadget, fire: boolean) {
    const sim = this.sim;
    const pipe = sim.data.gadgetRules.ingredients.gas_pipe;
    let inside: (p: Vec3) => boolean;
    if (fire) {
      // On the floor under the pipe, `radiusM` round, up to waist height.
      const floor = raycastLevel(sim, g.pos, [0, -1, 0], 6);
      const y = floor ? g.pos[1] - floor.t : g.pos[1];
      inside = (p) => Math.hypot(p[0] - g.pos[0], p[2] - g.pos[2]) <= pipe.fire.radiusM && p[1] >= y - 0.2 && p[1] <= y + 1.0;
    } else {
      const jet = jetOf(sim, pipe, g);
      inside = (p) => segSeg(jet.a, jet.b, p, p).dist <= jet.r;
    }
    for (const p of [...sim.pawns.values()]) {
      if (p.state.mode === PawnMode.Dead || p.state.mode === PawnMode.Held) continue;
      const pts = this.hitboxes(p).map((h): Vec3 => [(h.a[0] + h.b[0]) / 2, (h.a[1] + h.b[1]) / 2, (h.a[2] + h.b[2]) / 2]);
      if (pts.some(inside)) this.hurt(g, p, fire ? pipe.fire.damage : pipe.jet.damage);
    }
    for (const e of [...sim.gadgets.list]) if (e.id !== g.id && !isIngredient(e.kind) && !isFlying(e) && !isCloud(sim, e) && inside(e.pos)) this.blastHit(e);
  }

  /**
   * Steel went up on a panel (its `section`, or −1 for none named): what's on it breaks (a camera's glass) or is
   * destroyed, and what stands on the floor at a wall's foot along that section is crushed by its bar (Phase 8 M6;
   * research CSV `action.reinforce`: a jammer, a Gu mine; ours: within FOOT_OUT_M of either face, its box's centre
   * under FOOT_UP_M off the wall's bottom).
   */
  reinforced(panel: number, section = -1): void {
    const entry = this.sim.level.panels.list[panel];
    const foot = entry && entry.panel.kind === "wall" && section >= 0 ? entry : null;
    /** Where an entry is across the wall's frame (along it, up it, out of it), and whether that's the section's span. */
    const across = (g: Gadget) => {
      const f = foot!.frame;
      const rel = [g.pos[0] - f.center[0], g.pos[1] - f.center[1], g.pos[2] - f.center[2]];
      const dot = (a: Vec3) => rel[0] * a[0] + rel[1] * a[1] + rel[2] * a[2];
      const p = foot!.panel;
      const [c0, c1] = p.sectionRange(section);
      const u = dot(f.u) + f.w / 2;
      return { inSection: u >= c0 * p.cellU && u <= c1 * p.cellU, up: dot(f.v) + f.h / 2, out: Math.abs(dot(f.n)) - f.t / 2 };
    };
    for (const g of [...this.sim.gadgets.list]) {
      if (g.panel === panel) {
        // On that section of the wall only (the CSV's "on that wall section"; the review, M12); a hatch is one piece.
        if (foot && !across(g).inSection) continue;
        if (g.kind === KIND_BP_CAMERA) this.sim.gadgets.update(g.id, { flags: g.flags | GFlag.Broken });
        else this.destroy(g);
        continue;
      }
      // (Skopós's idle shell's barrier isn't crushed: the shell doesn't stop a teammate reinforcing beside it, M10.)
      if (!foot || isIngredient(g.kind) || isFlying(g) || g.panel >= 0 || g.kind === KIND_SHELL_SHIELD) continue;
      // Nor a grenade resting there, its fuse running, or its cloud (as a blast spares a cloud): devices are crushed
      // (a jammer, an alarm, a camera, a Gu mine, a Nitro Cell), not a frag or a smoke (the review, M12).
      const d = this.dataOf(g);
      if (d?.use.kind === "throw" && !d.remote && !d.gu) continue;
      const at = across(g);
      if (!at.inSection || at.up > FOOT_UP_M || at.out > FOOT_OUT_M) continue;
      if (g.kind === KIND_BP_CAMERA) this.sim.gadgets.update(g.id, { flags: g.flags | GFlag.Broken });
      else this.destroy(g);
    }
  }

  /**
   * An entry destroyed (not set off): gone, and the owner of a remote device still waiting for its detonator told (one
   * already set off, burning or drilling, isn't waiting). A cluster charge destroyed once set off has let one grenade
   * out first, however quick (Y6S3 DN).
   */
  destroy(g: Gadget): void {
    const d = this.dataOf(g);
    if (d?.cluster && g.flags & GFlag.Active && (this.released.get(g.id) ?? 0) === 0) this.release(g, d.cluster, 0);
    this.released.delete(g.id);
    if (d?.mirror) {
      this.mirrorOut(g);
      return;
    }
    this.sim.gadgets.remove(g.id);
    if (d?.remote && !(g.flags & GFlag.Active)) this.onLost(g, d);
    // A Black Mirror's canister (M7): its glass is ejected `ejectS` later (unless it's going already).
    const mirror = this.canisters.get(g.id);
    if (mirror === undefined) return;
    this.canisters.delete(g.id);
    const m = this.sim.gadgets.get(mirror);
    const a = m && mirrorOf(this.sim.data, m);
    if (m && a && !(m.flags & (GFlag.Active | GFlag.Broken))) this.sim.gadgets.update(m.id, { flags: m.flags | GFlag.Active, fuseEnd: this.sim.tick + ticks(a.m.ejectS) });
  }

  /**
   * An entry in a blast's destruction range (or a fire): a Bulletproof Camera's glass breaks (it keeps its place in the
   * list), an ingredient is set off, the rest are destroyed.
   */
  blastHit(g: Gadget): void {
    // A Black Mirror's glass is blast-proof (M7): only its wall giving way takes it.
    if (mirrorOf(this.sim.data, g)) return;
    if (isIngredient(g.kind)) this.ignite(g);
    // A Bulletproof Camera's glass breaks; so does an idle shell's barrier (M10), its entry left as the shell's camera.
    else if (g.kind === KIND_BP_CAMERA || g.kind === KIND_SHELL_SHIELD) this.sim.gadgets.update(g.id, { flags: g.flags | GFlag.Broken });
    else this.destroy(g);
  }

  /** Break these Bulletproof Cameras' glass (shot from the side or the back, knifed). */
  breakCams(cams: readonly Gadget[]): void {
    for (const c of cams) this.sim.gadgets.update(c.id, { flags: c.flags | GFlag.Broken });
  }

  /** Everything gone (a lab tool; a new round clears the table itself): remote devices' owners told. */
  clear(): void {
    const lost = this.sim.gadgets.list.filter((g) => this.dataOf(g)?.remote && !(g.flags & GFlag.Active));
    this.flights.clear();
    this.released.clear();
    this.canisters.clear();
    this.fizzles.clear();
    this.sim.gadgets.clear();
    for (const g of lost) this.onLost(g, this.dataOf(g)!);
  }
}
