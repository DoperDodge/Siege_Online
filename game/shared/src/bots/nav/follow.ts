// A bot's legs (Phase 9 M2, bots/DESIGN.md §3): the input that walks its body along a nav path. Waypoints in turn, the
// body facing where it goes unless the brain wants it to look elsewhere (then it strafes); crouched where the way is
// low; each link taken the way a player takes it (face the sill and Vault, Interact at a ladder and climb, walk off a
// ledge, melee a barricade down first); stuck, it tries a vault, then searches again.
import { TICK_HZ } from "../../core/constants.js";
import { forwardXZ, wrapAngle, type Vec3 } from "../../core/math.js";
import type { Pawn } from "../../player/pawn.js";
import { Btn, PawnMode, Stance } from "../../player/types.js";
import type { Sim } from "../../sim.js";
import { LinkKind, type NavLink } from "./grid.js";
import type { NavRoute, PathStep } from "./search.js";
import type { NavWorld } from "./world.js";

/** What the legs ask of the body this tick (the brain adds aim, fire and the rest). */
export interface Stride {
  forward: number;
  strafe: number;
  /** The yaw to face (where it walks, or the brain's look). */
  yaw: number;
  /** Pitch to hold (a barricade being broken is looked at), or null: the brain's. */
  pitch: number | null;
  buttons: number;
  stance: Stance;
}

export const FollowState = {
  /** Nowhere to go. */
  Idle: 0,
  Walking: 1,
  /** There (within its radius). */
  Arrived: 2,
  /** No way there, or stuck for good: the brain picks something else. */
  Failed: 3,
} as const;
export type FollowState = (typeof FollowState)[keyof typeof FollowState];

/** How close counts as at a waypoint (m), at a link's start, and at the goal by default. */
const NEAR = 0.35;
const AT_LINK = 0.22;
/** No progress toward the waypoint for this long (s): try something; for twice as long: search again; 4×: give up. */
const STUCK_S = 1.2;
/** Turn rate while walking (rad/s) when nothing else is looked at. */
const WALK_TURN = 7;
/** Where on a barricade each blow goes in turn (across and up its face, as fractions of its half size). */
const SWING_SPOTS: readonly [number, number][] = [
  [0, 0],
  [-0.6, 0.5],
  [0.6, 0.5],
  [-0.6, -0.5],
  [0.6, -0.5],
  [0, 0.8],
  [0, -0.8],
  [-0.9, 0],
  [0.9, 0],
];

export class PathFollower {
  state: FollowState = FollowState.Idle;
  goal: Vec3 | null = null;
  /** How near the goal counts as there. */
  radius = NEAR;
  /** Sprint along the way (the brain's choice: no enemy about). */
  sprint = false;
  /** Allow links of these kinds (a drone can't vault; an attacker may not want to drop in). */
  allow: ((l: NavLink) => boolean) | undefined;
  private route: NavRoute | null = null;
  private steps: PathStep[] = [];
  private idx = 0;
  private done = false;
  /** The link under way (taken from steps[idx - 1] to steps[idx]) and its ticks. */
  private taking: NavLink | null = null;
  private takingT = 0;
  private lastMelee = -1e9;
  /** Blows struck at the barricade being broken. */
  private swings = 0;
  /** Progress watch: the best distance to the waypoint, and when it last improved. */
  private best = Infinity;
  private bestAt = 0;
  private retries = 0;

  /** Go to `goal` (feet); searches lazily. Same goal again: carries on. */
  goTo(goal: Vec3, radius = NEAR): void {
    if (this.goal && Math.hypot(goal[0] - this.goal[0], goal[1] - this.goal[1], goal[2] - this.goal[2]) < 0.2 && this.state !== FollowState.Failed) {
      this.radius = radius;
      return;
    }
    this.goal = [goal[0], goal[1], goal[2]];
    this.radius = radius;
    this.state = FollowState.Walking;
    this.route = null;
    this.steps = [];
    this.retries = 0;
    this.taking = null;
  }

  stop(): void {
    this.goal = null;
    this.state = FollowState.Idle;
    this.route = null;
    this.steps = [];
    this.taking = null;
  }

  /** The path's remaining points (the overlay, tests). */
  remaining(): Vec3[] {
    return this.steps.slice(this.idx).map((s) => s.pos);
  }

  /**
   * This tick's stride for `pawn` toward the goal. `look`: a yaw the brain wants to face (it then walks without
   * turning to the way: strafing); null: face the way.
   */
  tick(nav: NavWorld, sim: Sim, pawn: Pawn, look: number | null): Stride {
    const s = pawn.state;
    const still: Stride = { forward: 0, strafe: 0, yaw: look ?? s.yaw, pitch: null, buttons: 0, stance: Stance.Stand };
    if (!this.goal || this.state === FollowState.Idle || this.state === FollowState.Failed) return still;
    // A scripted move under way (a vault, a ladder's dismount): nothing to do but wait.
    if (s.mode === PawnMode.Vault) return still;
    const pos: Vec3 = [s.x, s.y, s.z];
    if (Math.hypot(pos[0] - this.goal[0], pos[2] - this.goal[2]) <= this.radius && Math.abs(pos[1] - this.goal[1]) < 1.2) {
      this.state = FollowState.Arrived;
      this.taking = null;
      return { ...still, stance: this.lowHere(nav, pos) ? Stance.Crouch : Stance.Stand };
    }
    this.state = FollowState.Walking;
    if (s.mode === PawnMode.Ladder) return this.onLadder(look, s.yaw);
    if (!this.ensurePath(nav, pos)) return still;
    if (this.taking) return this.takeLink(sim, pawn, look);

    // The next waypoint; a link starts at the one before it.
    let target = this.steps[this.idx];
    while (target && !target.link && this.idx < this.steps.length - 1 && dist2(pos, target.pos) < NEAR) target = this.steps[++this.idx];
    if (!target) return still;
    if (target.link) {
      const start = this.steps[this.idx - 1]?.pos ?? pos;
      if (dist2(pos, start) <= AT_LINK + (target.link.kind === LinkKind.Drop ? 0.15 : 0)) {
        this.taking = target.link;
        this.takingT = 0;
        return this.takeLink(sim, pawn, look);
      }
      return this.walkTo(start, pos, pawn, look, this.lowAt(nav, start), AT_LINK);
    }
    if (dist2(pos, target.pos) < NEAR && this.idx === this.steps.length - 1) {
      // The end of this stretch: the next one is found next tick.
      if (this.done) return { ...still, stance: target.crouch ? Stance.Crouch : Stance.Stand };
      this.steps = [];
      return still;
    }
    return this.walkTo(target.pos, pos, pawn, look, target.crouch || this.lowHere(nav, pos), NEAR);
  }

  /** A route and a stretch of steps to walk; false: none (failed, or waiting). */
  private ensurePath(nav: NavWorld, pos: Vec3): boolean {
    const grid = nav.grid;
    // The grid changed under the route: find it again.
    if (this.route && this.route.version !== grid.version && !this.taking) {
      this.route = null;
      this.steps = [];
    }
    if (!this.route) {
      this.route = nav.search.route(pos, this.goal!);
      this.steps = [];
      if (!this.route) {
        this.state = FollowState.Failed;
        return false;
      }
    }
    if (this.idx >= this.steps.length || this.steps.length === 0) {
      const at = grid.nodeNear(pos[0], pos[1], pos[2], 1, 0.9);
      // The links it's allowed first; none of them leads there (a defender's own barricades shut it out): any.
      const part = at >= 0 ? (nav.search.refine(at, this.route, 4, this.allow) ?? (this.allow ? nav.search.refine(at, this.route, 4) : null)) : null;
      if (!part) {
        // Off the route (pushed, fell): a new one from here, at most a few times in a row.
        this.route = null;
        if (++this.retries > 4) this.state = FollowState.Failed;
        return false;
      }
      this.steps = part.steps;
      this.done = part.done;
      this.idx = Math.min(1, this.steps.length - 1);
      this.best = Infinity;
      this.bestAt = 0;
    }
    return true;
  }

  /** Walk toward `to`: face it (or `look`, strafing), crouched where it's low; watch for being stuck. */
  private walkTo(to: Vec3, pos: Vec3, pawn: Pawn, look: number | null, low: boolean, near: number): Stride {
    const s = pawn.state;
    const dx = to[0] - pos[0];
    const dz = to[2] - pos[2];
    const len = Math.hypot(dx, dz);
    const way = Math.atan2(-dx, -dz);
    // Progress: closer than ever by 5 cm, or note how long it's been.
    const now = this.tickCount++;
    if (len < this.best - 0.05) {
      this.best = len;
      this.bestAt = now;
    }
    const stuckFor = (now - this.bestAt) / TICK_HZ;
    let buttons = 0;
    if (stuckFor > STUCK_S) {
      // Something's in the way: try climbing it, then search again, then give up.
      buttons |= vaultTap(now);
      if (stuckFor > STUCK_S * 2 && stuckFor <= STUCK_S * 2 + 1 / TICK_HZ) {
        this.route = null;
        this.steps = [];
        this.retries++;
      }
      if (stuckFor > STUCK_S * 4 || this.retries > 4) {
        this.state = FollowState.Failed;
        return { forward: 0, strafe: 0, yaw: s.yaw, pitch: null, buttons: 0, stance: Stance.Stand };
      }
    }
    // Slow down onto a waypoint that turns hard; otherwise full speed.
    const speed = len < near * 2 ? 0.6 : 1;
    const yaw = look ?? turnToward(s.yaw, way, WALK_TURN / TICK_HZ);
    // The way, relative to the facing.
    const rel = wrapAngle(way - yaw);
    const forward = Math.cos(rel) * speed;
    const strafe = -Math.sin(rel) * speed;
    if (this.sprint && !low && look === null && Math.abs(rel) < 0.3 && len > 2) buttons |= Btn.Sprint;
    return { forward, strafe, yaw, pitch: null, buttons, stance: low ? Stance.Crouch : Stance.Stand };
  }
  private tickCount = 0;

  /** A link under way: each kind as a player takes it. */
  private takeLink(sim: Sim, pawn: Pawn, look: number | null): Stride {
    const s = pawn.state;
    const l = this.taking!;
    const t = this.takingT++;
    const facing = Math.abs(wrapAngle(s.yaw - l.yaw)) < 0.15;
    const turn = turnToward(s.yaw, l.yaw, 0.35);
    const base: Stride = { forward: 0, strafe: 0, yaw: turn, pitch: 0, buttons: 0, stance: Stance.Stand };
    // Too long on one link (blocked by a body, a barricade put back up): leave it and search again.
    if (t > TICK_HZ * 10) return this.leaveLink();
    const end = this.steps[this.idx].pos;
    const arrived = () => {
      this.taking = null;
      this.idx = Math.min(this.idx + 1, this.steps.length);
      this.best = Infinity;
      return this.tick0(look, s.yaw);
    };
    switch (l.kind) {
      case LinkKind.Vault:
        if (t > 4 && s.mode === PawnMode.Walk && dist2([s.x, s.y, s.z], end) < 0.6 && Math.abs(s.y - end[1]) < 0.4) return arrived();
        return facing ? { ...base, buttons: vaultTap(t) } : base;
      case LinkKind.Drop: {
        // Down on the floor below (wherever the fall carried it): on with the path.
        if (s.grounded && Math.abs(s.y - end[1]) < 0.4 && dist2([s.x, s.y, s.z], end) < 3) return arrived();
        if (!s.grounded) return { ...base, yaw: s.yaw };
        // Walked on over the gap (it didn't fall): search again from wherever it is.
        if (t > TICK_HZ * 1.5 && s.grounded && s.y > end[1] + 0.5) return this.leaveLink();
        return { ...base, forward: facing ? 0.7 : 0 };
      }
      case LinkKind.Ladder: {
        if (s.mode === PawnMode.Walk && t > 8 && Math.abs(s.y - end[1]) < 0.4) return arrived();
        // Grab it (Interact, a press: every few ticks until on it).
        return facing && t % 8 === 0 ? { ...base, buttons: Btn.Interact } : base;
      }
      case LinkKind.Barricade: {
        const list = sim.level.panels.list;
        const e = list[l.panel];
        const standing = e && !e.panel.empty && !e.panel.broken;
        // A window's glass may stand behind the planks: it goes too before the vault.
        const glass = l.vault ? list.find((o) => o.panel.kind === "glass" && !o.panel.broken && Math.hypot(o.frame.center[0] - e.frame.center[0], o.frame.center[1] - e.frame.center[1], o.frame.center[2] - e.frame.center[2]) < 0.4) : undefined;
        const target = standing ? e : glass;
        if (target) {
          // Swing at it, each blow at another part of it (a blow's hole lets the next one at the same spot through).
          const f = target.frame;
          const [ou, ov] = SWING_SPOTS[this.swings % SWING_SPOTS.length];
          const p = [0, 1, 2].map((k) => f.center[k] + f.u[k] * ou * f.w * 0.4 + f.v[k] * ov * f.h * 0.4);
          const eye = s.y + sim.data.movement.stance.stand.eye;
          const aimYaw = Math.atan2(-(p[0] - s.x), -(p[2] - s.z));
          const pitch = Math.atan2(p[1] - eye, Math.hypot(p[0] - s.x, p[2] - s.z));
          const yaw = turnToward(s.yaw, aimYaw, 0.35);
          let buttons = 0;
          if (Math.abs(wrapAngle(s.yaw - aimYaw)) < 0.05 && Math.abs(s.pitch - pitch) < 0.05 && sim.tick - this.lastMelee > TICK_HZ * 0.6) {
            buttons = Btn.Melee;
            this.lastMelee = sim.tick;
            this.swings++;
          }
          return { ...base, yaw, pitch, buttons };
        }
        // Gone: through the doorway, or over the sill.
        if (l.vault) {
          if (t > 4 && s.mode === PawnMode.Walk && dist2([s.x, s.y, s.z], end) < 0.7) return arrived();
          return facing ? { ...base, buttons: vaultTap(t) } : base;
        }
        if (dist2([s.x, s.y, s.z], end) < NEAR) return arrived();
        return { ...base, forward: facing ? 1 : 0.3 };
      }
    }
    return arrived();
  }

  /** On a ladder (got on by a link): climb the way the link goes, off at the top by itself or at the foot. */
  private onLadder(look: number | null, yaw: number): Stride {
    const up = this.taking?.kind === LinkKind.Ladder ? this.taking.up : true;
    return { forward: up ? 1 : -1, strafe: 0, yaw: look ?? yaw, pitch: up ? 0.6 : -0.6, buttons: 0, stance: Stance.Stand };
  }

  private leaveLink(): Stride {
    this.taking = null;
    this.route = null;
    this.steps = [];
    this.retries++;
    return { forward: 0, strafe: 0, yaw: 0, pitch: null, buttons: 0, stance: Stance.Stand };
  }

  /** A still stride (between a link's end and the next tick's walk). */
  private tick0(look: number | null, yaw: number): Stride {
    return { forward: 0, strafe: 0, yaw: look ?? yaw, pitch: null, buttons: 0, stance: Stance.Stand };
  }

  /** Whether the way at `pos` is low (the nearest node is crouch-only). */
  private lowHere(nav: NavWorld, pos: Vec3): boolean {
    return this.lowAt(nav, pos);
  }

  private lowAt(nav: NavWorld, pos: Vec3): boolean {
    const n = nav.grid.nodeNear(pos[0], pos[1], pos[2], 0.3, 0.5);
    return n >= 0 && (nav.grid.nodeFlags(n) & 1) === 0;
  }
}

/**
 * The vault key tapped (down 3 ticks, up 6): at an outside wall a held key hooks a rope on (movement.ts rappelHold)
 * and a tap vaults; elsewhere the vault starts the tick it's down.
 */
function vaultTap(t: number): number {
  return t % 9 < 3 ? Btn.Vault : 0;
}

/** Horizontal distance. */
function dist2(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/** A yaw turned toward `to` by at most `max` radians. */
export function turnToward(from: number, to: number, max: number): number {
  const d = wrapAngle(to - from);
  return wrapAngle(from + Math.sign(d) * Math.min(Math.abs(d), max));
}

void forwardXZ;
