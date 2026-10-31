// The server's side of the gadget table (Phase 8, gadgets/DESIGN.md §3–§4): the simulation's gadget events become
// entries (a throw flies, a placed gadget stands, a detonator sets its oldest device off, a pick-up takes one away),
// throws are stepped to where they rest, stick or go off, fuses and outdoor signals run out on the server's ticks,
// and steel going up breaks what's on its wall. Every change is a table op the room sends with the next snapshot.
import type { Vec3 } from "../core/math.js";
import type { GadgetData } from "../data/schemas.js";
import { indoors } from "../intel/bpCamera.js";
import type { Sim } from "../sim.js";
import type { SimEvent } from "../weapons/step.js";
import { ticks } from "../weapons/ticks.js";
import { FLOOR_NY, Flights, isFlying, type FlightEnd } from "./flight.js";
import { KIND_BP_CAMERA, kindId, kindOf } from "./kinds.js";
import { GFlag, type Gadget } from "./table.js";

type ThrowUse = Extract<GadgetData["use"], { kind: "throw" }>;

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
      sim.gadgets.add({ ...base, pos: e.pos, vel: [0, 0, 0], flags, panel: e.panel, fuseEnd: fuse, signalEnd: out ? sim.tick + ticks(sim.data.intel.bulletproofCamera.outdoorSignalS) : 0 });
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

  /** Once a tick, after the room handled the step's events: flights, fuses, outdoor signals. */
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
      else if (now.signalEnd !== 0 && tick >= now.signalEnd && !(now.flags & GFlag.Lost)) sim.gadgets.update(now.id, { flags: now.flags | GFlag.Lost });
    }
    this.flights.prune((id) => {
      const g = sim.gadgets.get(id);
      return g !== undefined && isFlying(g);
    });
  }

  /** One tick of a throw: its first hit cuts its fuse; at its end it goes off, or rests, sticks or settles there. */
  private fly(g: Gadget, use: ThrowUse) {
    const f = this.flights.at(g, use, Math.max(0, this.sim.tick - g.launchTick));
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
