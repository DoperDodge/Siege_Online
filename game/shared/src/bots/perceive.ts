// A bot's senses (Phase 9 M3, bots/DESIGN.md §4, D-158): what it knows of the other side, from what it sees, hears and is
// told, and nothing else. Sight: enemies in its view cone, their hitbox points tested with rays through the level as it
// is (holes see through, soft walls' cells don't, smoke and solid gadgets block), the more of a body showing and the
// nearer and more central it is, the sooner it's noticed. Hearing (placeholders until Phase 11's audio): gunshots (the
// shot events every client gets), footsteps worked out from enemies' speed, being hit (the damage indicator's
// direction). Told: its team's pings and spotted marks, and what its teammates saw, shared on the team's board after a
// delay (voice comms). Each enemy it knows of is a contact: where it was last known, when, how, and how sure.
import { TICK_HZ } from "../core/constants.js";
import type { Vec3 } from "../core/math.js";
import type { BotDifficulty } from "../data/schemas.js";
import { smokeOnSegment } from "../gadgets/areas.js";
import { raycastLevel } from "../level/raycast.js";
import type { GameEvent } from "../net/events.js";
import { eyePose, poseHitboxes, type Hitbox } from "../player/hitboxes.js";
import { droneEye } from "../player/drone.js";
import type { Pawn } from "../player/pawn.js";
import { PawnKind, PawnMode, Stance } from "../player/types.js";
import type { Sim } from "../sim.js";
import { viewDir } from "../weapons/spread.js";
import type { BotRng } from "./rng.js";

export const Source = { Seen: 1, Heard: 2, Told: 3 } as const;
export type Source = (typeof Source)[keyof typeof Source];

/** An enemy a bot knows of. */
export interface Contact {
  pawnId: number;
  kind: PawnKind;
  /** Where it was last known (feet), when (tick), how, and how far off that may be (m). */
  pos: Vec3;
  at: number;
  source: Source;
  uncertainty: number;
  /** In sight on the last look, and noticed (it may be shot at). */
  visible: boolean;
  detected: boolean;
  /** Noticing it while it's in sight: 0 → 1 (then detected). */
  noticing: number;
  /** The tick it was last noticed in sight (the reaction time runs from there). */
  spottedAt: number;
  /** Its points in sight on the last look (world): head, chest, legs (null: hidden). */
  head: Vec3 | null;
  chest: Vec3 | null;
  legs: Vec3 | null;
  /** Down but not out (when last seen). */
  downed: boolean;
  /** Where it was on the last looks (tick, chest), for leading and lagging a moving target. */
  trail: { tick: number; p: Vec3 }[];
}

/** One sighting on a team's board: where an enemy was, when. */
export interface Report {
  pos: Vec3;
  tick: number;
  kind: PawnKind;
}

/**
 * What a team's bots tell each other (voice comms): where each enemy was seen over the last few seconds, so a teammate
 * hears of it a moment later (where it was then, not where it is now).
 */
export class TeamBoard {
  readonly reports = new Map<number, Report[]>();

  report(pawnId: number, pos: Vec3, tick: number, kind: PawnKind): void {
    let list = this.reports.get(pawnId);
    if (!list) this.reports.set(pawnId, (list = []));
    list.push({ pos: [pos[0], pos[1], pos[2]], tick, kind });
    while (list.length > 64 || (list.length > 1 && tick - list[0].tick > BOARD_KEEP_S * TICK_HZ)) list.shift();
  }

  /** The newest sighting of each enemy at least `delay` ticks old (what's been said by now). */
  said(now: number, delay: number): Map<number, Report> {
    const out = new Map<number, Report>();
    for (const [id, list] of this.reports) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (now - list[i].tick >= delay) {
          out.set(id, list[i]);
          break;
        }
      }
    }
    return out;
  }

  forget(pawnId: number): void {
    this.reports.delete(pawnId);
  }
}

/** How long a board keeps sightings (s). */
const BOARD_KEEP_S = 4;

/** How far a body can be seen (m), a drone. */
const SIGHT_M = 60;
const DRONE_SIGHT_M = 22;
/** Looks a second (every 4 ticks). */
export const LOOK_EVERY = 4;
/** A contact not heard of for this long is forgotten (s). */
const FORGET_S = 25;
/** How fast what's known of a contact goes stale (m of uncertainty a second). */
const STALE_MPS = 1.2;
/** Gunshots heard this far (m): suppressed, and not. Placeholders until Phase 11. */
const SHOT_HEARD_M = 45;
const SUPPRESSED_HEARD_M = 14;
/** Footsteps heard this far (m) by speed: sprinting, walking, crouch-walking; slower is silent. Placeholders. */
const STEPS = [
  { minSpeed: 4, m: 20 },
  { minSpeed: 2.2, m: 10 },
  { minSpeed: 1, m: 4 },
] as const;

export class Perception {
  readonly contacts = new Map<number, Contact>();
  /** Teammates' deaths heard of (where, when): a place to trade toward. */
  lastMateDown: { pos: Vec3; tick: number } | null = null;
  /** The direction it was last hit from (yaw), and when. */
  hitFrom: { yaw: number; tick: number } | null = null;
  /** Each spotted enemy's mark, until when (tick). */
  private readonly spottedUntil = new Map<number, number>();

  constructor(
    private readonly rng: BotRng,
    private readonly memberSlot: number,
  ) {}

  /**
   * One tick: what it was told and heard (`events`, its client's), then a look (every LOOK_EVERY ticks, staggered),
   * then the board. `me` is its body.
   */
  update(sim: Sim, me: Pawn, ctrlId: number, d: BotDifficulty, events: readonly GameEvent[], board: TeamBoard, mates: readonly Pawn[]): void {
    const now = sim.tick;
    for (const e of events) this.event(sim, me, ctrlId, d, e, now);
    if ((now + this.memberSlot) % LOOK_EVERY === 0) {
      this.look(sim, me, d, board, now);
      this.listen(sim, me, d, now);
      this.fromBoard(board, d, now, me);
    }
    // Stale: what isn't refreshed grows less sure, and is forgotten.
    for (const [id, c] of this.contacts) {
      const p = sim.pawns.get(id);
      if (!p || p.state.mode === PawnMode.Dead || now - c.at > FORGET_S * TICK_HZ) {
        this.contacts.delete(id);
        board.forget(id);
        continue;
      }
      if (!c.visible) c.uncertainty = Math.max(c.uncertainty, ((now - c.at) / TICK_HZ) * STALE_MPS);
    }
    void mates;
  }

  /** The detected enemy in sight it should deal with first (nearest, a standing one before a downed one), or null. */
  target(me: Pawn): Contact | null {
    let best: Contact | null = null;
    let bestScore = -Infinity;
    for (const c of this.contacts.values()) {
      if (!c.visible || !c.detected) continue;
      const dist = Math.hypot(c.pos[0] - me.state.x, c.pos[2] - me.state.z);
      const score = -dist - (c.downed ? 25 : 0) - (c.kind === PawnKind.Drone ? 15 : 0);
      if (score > bestScore) [best, bestScore] = [c, score];
    }
    return best;
  }

  /** The freshest enemy it knows of but can't see (seen, heard or told), within `seconds`. */
  recent(now: number, seconds: number): Contact | null {
    let best: Contact | null = null;
    for (const c of this.contacts.values()) {
      if (c.visible || c.kind === PawnKind.Drone || now - c.at > seconds * TICK_HZ) continue;
      if (!best || c.at > best.at) best = c;
    }
    return best;
  }

  // ------------------------------------------------------------------ sight

  private look(sim: Sim, me: Pawn, d: BotDifficulty, board: TeamBoard, now: number) {
    const s = me.state;
    const m = sim.data.movement;
    // Through its body's eyes, or its drone's camera (as wide as the drone's, however good its eyes).
    const eye = eyeOf(sim, me);
    const view = viewDir(s.yaw, s.pitch);
    const half = (((me.kind === PawnKind.Drone ? sim.data.intel.drone.fovDeg : d.fovDeg) * Math.PI) / 360);
    const dt = LOOK_EVERY / TICK_HZ;
    for (const c of this.contacts.values()) c.visible = false;
    for (const p of sim.pawns.values()) {
      if (p.team === me.team || p.id === me.id || p.state.mode === PawnMode.Dead || p.state.mode === PawnMode.Held) continue;
      const drone = p.kind === PawnKind.Drone;
      const ps = p.state;
      const to: Vec3 = [ps.x - eye[0], ps.y + (drone ? 0.1 : 1.1) - eye[1], ps.z - eye[2]];
      const dist = Math.hypot(to[0], to[1], to[2]);
      if (dist > (drone ? DRONE_SIGHT_M : SIGHT_M) || dist < 1e-3) continue;
      const cos = (to[0] * view[0] + to[1] * view[1] + to[2] * view[2]) / dist;
      const off = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (off > half) {
        const c = this.contacts.get(p.id);
        if (c) c.noticing = Math.max(0, c.noticing - dt);
        continue;
      }
      // Its points, posed as they are (a lean shows the head and a shoulder past a corner).
      let head: Vec3 | null = null;
      let chest: Vec3 | null = null;
      let legs: Vec3 | null = null;
      if (drone) chest = this.inSight(sim, eye, [ps.x, ps.y + 0.08, ps.z]) ? [ps.x, ps.y + 0.08, ps.z] : null;
      else {
        const boxes = poseHitboxes(m, sim.data.hitboxes, ps);
        head = this.partInSight(sim, eye, boxes, "head");
        chest = this.partInSight(sim, eye, boxes, "torso");
        legs = this.partInSight(sim, eye, boxes, "leg_l") ?? this.partInSight(sim, eye, boxes, "leg_r");
      }
      const exposure = drone ? (chest ? 0.6 : 0) : (head ? 0.3 : 0) + (chest ? 0.5 : 0) + (legs ? 0.2 : 0);
      let c = this.contacts.get(p.id);
      if (exposure <= 0) {
        if (c) c.noticing = Math.max(0, c.noticing - dt);
        continue;
      }
      if (!c) {
        c = blank(p, now);
        this.contacts.set(p.id, c);
      }
      // Noticing: faster the more of it shows, the nearer and the more central it is, and when it moves.
      const speed = Math.hypot(ps.vx, ps.vz);
      const near = Math.max(0.35, Math.min(1.6, 1.6 - dist / 35));
      const central = 1 - 0.6 * (off / half);
      const moving = speed > 1.5 ? 1.3 : speed > 0.3 ? 1.1 : ps.stance === Stance.Prone ? 0.6 : 0.85;
      const base = (d.reactionMs / 1000) * 0.6;
      c.noticing += (dt * exposure * near * central * moving) / base;
      c.visible = true;
      c.head = head;
      c.chest = chest;
      c.legs = legs;
      c.downed = ps.mode === PawnMode.Downed;
      c.kind = p.kind;
      if (!c.detected && (c.noticing >= 1 || (c.source !== Source.Seen && c.uncertainty < 3 && c.noticing >= 0.5))) {
        // Something it already knew of there (heard, told) is noticed sooner.
        c.detected = true;
        c.spottedAt = now;
      }
      if (c.detected) {
        c.pos = [ps.x, ps.y, ps.z];
        c.at = now;
        c.source = Source.Seen;
        c.uncertainty = 0;
        const aim = chest ?? head ?? legs!;
        c.trail.push({ tick: now, p: [aim[0], aim[1], aim[2]] });
        if (c.trail.length > 12) c.trail.shift();
        board.report(p.id, c.pos, now, p.kind);
      }
    }
    // Out of sight: noticing an enemy starts over next time (but what's known of it stays).
    for (const c of this.contacts.values()) {
      if (c.visible) continue;
      c.head = c.chest = c.legs = null;
      if (c.detected && c.source === Source.Seen && now - c.at > LOOK_EVERY) c.detected = false;
    }
  }

  /** A body part's middle, if a ray from the eye reaches it. */
  private partInSight(sim: Sim, eye: Vec3, boxes: Hitbox[], part: string): Vec3 | null {
    const b = boxes.find((h) => h.part === part);
    if (!b) return null;
    const p: Vec3 = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2, (b.a[2] + b.b[2]) / 2];
    return this.inSight(sim, eye, p) ? p : null;
  }

  /** Whether nothing that blocks sight is between the eye and a point (the level, panels' cells, solid gadgets, smoke). */
  inSight(sim: Sim, eye: Vec3, p: Vec3): boolean {
    const d: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-6) return true;
    const dir: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
    const hit = raycastLevel(sim, eye, dir, len);
    if (hit && hit.t < len - 0.05) return false;
    return smokeOnSegment(sim.data, sim.gadgets, eye, p) === null;
  }

  // ------------------------------------------------------------------ hearing and being told

  private event(sim: Sim, me: Pawn, ctrlId: number, d: BotDifficulty, e: GameEvent, now: number) {
    switch (e.kind) {
      case "shotFx": {
        const p = sim.pawns.get(e.pawnId);
        if (!p || p.team === me.team) return;
        const dist = Math.hypot(p.state.x - me.state.x, p.state.y - me.state.y, p.state.z - me.state.z);
        if (dist > (e.suppressed ? SUPPRESSED_HEARD_M : SHOT_HEARD_M)) return;
        this.heard(p, dist, d, now);
        return;
      }
      case "damageTaken": {
        if (!e.from) return;
        const yaw = Math.atan2(-(e.from[0] - me.state.x), -(e.from[2] - me.state.z));
        this.hitFrom = { yaw, tick: now };
        // Who: whoever it was, roughly there.
        for (const p of sim.pawns.values()) {
          if (p.ownerId === e.attackerCtrl && p.team !== me.team && p.kind === PawnKind.Body) {
            const c = this.contacts.get(p.id) ?? blank(p, now);
            if (c.source !== Source.Seen || !c.visible) {
              c.pos = [e.from[0], e.from[1] - 1.5, e.from[2]];
              c.at = now;
              c.source = Source.Heard;
              c.uncertainty = 2;
              this.contacts.set(p.id, c);
            }
          }
        }
        return;
      }
      case "spotted": {
        this.spottedUntil.set(e.pawnId, now + e.ticks);
        return;
      }
      case "kill":
      case "down": {
        const victim = sim.pawns.get(e.victimPawn);
        if (victim && victim.team === me.team && victim.id !== me.id && e.victimCtrl !== ctrlId) this.lastMateDown = { pos: [victim.state.x, victim.state.y, victim.state.z], tick: now };
        if (e.kind === "kill") {
          this.contacts.delete(e.victimPawn);
          this.spottedUntil.delete(e.victimPawn);
        }
        return;
      }
    }
  }

  /** An enemy heard at distance `dist`: roughly where it is. */
  private heard(p: Pawn, dist: number, d: BotDifficulty, now: number) {
    let c = this.contacts.get(p.id);
    if (c && c.visible) return;
    if (!c) {
      c = blank(p, now);
      this.contacts.set(p.id, c);
    }
    // Less sure the farther, and the less it trusts its ears.
    const err = dist * (0.12 + 0.2 * (1 - d.soundUse));
    const a = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(0, err);
    c.pos = [p.state.x + Math.cos(a) * r, p.state.y, p.state.z + Math.sin(a) * r];
    c.at = now;
    c.source = Source.Heard;
    c.uncertainty = err;
  }

  /** Footsteps (placeholder hearing): enemies moving near enough for their speed, half as far through a floor. */
  private listen(sim: Sim, me: Pawn, d: BotDifficulty, now: number) {
    for (const p of sim.pawns.values()) {
      if (p.team === me.team || p.kind !== PawnKind.Body || p.state.mode !== PawnMode.Walk || !p.state.grounded) continue;
      const s = p.state;
      const speed = Math.hypot(s.vx, s.vz);
      const step = STEPS.find((st) => speed >= st.minSpeed);
      if (!step) continue;
      const dy = Math.abs(s.y - me.state.y);
      const range = step.m * (dy > 2.4 ? 0.5 : 1) * (0.5 + 0.5 * d.soundUse);
      const dist = Math.hypot(s.x - me.state.x, s.y - me.state.y, s.z - me.state.z);
      if (dist <= range) this.heard(p, dist, d, now);
    }
    // Spotted marks: where each marked enemy is, while the mark lasts.
    for (const [id, until] of this.spottedUntil) {
      const p = sim.pawns.get(id);
      if (!p || now > until || p.state.mode === PawnMode.Dead) {
        this.spottedUntil.delete(id);
        continue;
      }
      const c = this.contacts.get(id) ?? blank(p, now);
      if (c.visible) continue;
      c.pos = [p.state.x, p.state.y, p.state.z];
      c.at = now;
      c.source = Source.Told;
      c.uncertainty = 0.5;
      this.contacts.set(id, c);
    }
  }

  /** What teammates saw, once the comms delay has passed (less is shared, and later, at lower coordination). */
  private fromBoard(board: TeamBoard, d: BotDifficulty, now: number, me: Pawn) {
    const delay = (0.3 + (1 - d.coordination) * 1.5) * TICK_HZ;
    for (const [id, r] of board.said(now, delay)) {
      if (now - r.tick > 8 * TICK_HZ) continue;
      const c = this.contacts.get(id);
      if (c && c.at >= r.tick) continue;
      const fresh = c ?? { ...blank({ id, kind: r.kind } as Pawn, now) };
      fresh.pos = [r.pos[0], r.pos[1], r.pos[2]];
      fresh.at = r.tick;
      fresh.source = Source.Told;
      fresh.uncertainty = 1 + ((now - r.tick) / TICK_HZ) * STALE_MPS;
      this.contacts.set(id, fresh);
    }
    void me;
  }
}

function blank(p: Pick<Pawn, "id" | "kind">, now: number): Contact {
  return { pawnId: p.id, kind: p.kind, pos: [0, 0, 0], at: now, source: Source.Heard, uncertainty: 10, visible: false, detected: false, noticing: 0, spottedAt: 0, head: null, chest: null, legs: null, downed: false, trail: [] };
}

/** Where a pawn sees from: a body's eye, or a drone's camera. */
export function eyeOf(sim: Sim, p: Pawn): Vec3 {
  return p.kind === PawnKind.Drone ? droneEye(sim.data.intel.drone, p.state).pos : eyePose(sim.data.movement, sim.data.hitboxes, p.state).pos;
}
