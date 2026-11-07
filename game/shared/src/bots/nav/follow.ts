// A bot's legs (Phase 9 M2, bots/DESIGN.md §3): the input that walks its body along a nav path. Waypoints in turn, the
// body facing where it goes unless the brain wants it to look elsewhere (then it strafes); crouched where the way is
// low; each link taken the way a player takes it (face the sill and Vault, Interact at a ladder and climb, walk off a
// ledge, melee a barricade down first); stuck, it tries a vault, then searches again.
import { TICK_HZ } from "../../core/constants.js";
import { forwardXZ, wrapAngle, type Vec3 } from "../../core/math.js";
import type { Pawn } from "../../player/pawn.js";
import { Btn, PawnMode, Stance } from "../../player/types.js";
import type { Sim } from "../../sim.js";
import { LinkKind, type NavGrid, type NavLink } from "./grid.js";
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

/** Getting this far (m) while walking isn't stuck. */
const UNSTUCK_M = 0.5;
/** A goal given up on stays given up this long (s) when asked for again. */
const FAILED_HOLD_S = 3;
/** A goal moved less than this (m), within its route's last region, keeps the route. */
const REAIM_M = 3;

export class PathFollower {
  state: FollowState = FollowState.Idle;
  goal: Vec3 | null = null;
  /** How near the goal counts as there. */
  radius = NEAR;
  /** Sprint along the way (the brain's choice: no enemy about). */
  sprint = false;
  /** Allow links of these kinds (a drone can't vault; an attacker may not want to drop in). */
  allow: ((l: NavLink) => boolean) | undefined;
  /** Driving a drone: under a door's barricade, not through it. */
  drone = false;
  private route: NavRoute | null = null;
  /** The grid its route is on (a moved goal's region is looked up there), and its world. */
  private grid: NavGrid | null = null;
  private nav: NavWorld | null = null;
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
  /** Where the body was when it last got UNSTUCK_M on while walking, when, and the last tick it walked. */
  private anchor: Vec3 | null = null;
  private anchorAt = 0;
  private lastWalk = -10;
  /** Where it last gave up going (and when, its own ticks): asked there again soon after, it doesn't start over. */
  private failedGoal: Vec3 | null = null;
  private failedAt = -1e9;
  private retries = 0;
  /** When the barricade a link breaks was gone (its tick of the link; -1: still up). */
  private clearAt = -1;
  /** The goal moved while a link was under way: a new route once it's done. */
  private reroute = false;
  /** The sim tick it was last asked for a stride (legs not asked lately aren't walking anywhere, whatever their state). */
  tickedAt = -1;

  /** Go to `goal` (feet); searches lazily. Same goal again: carries on. */
  goTo(goal: Vec3, radius = NEAR): void {
    if (this.goal && Math.hypot(goal[0] - this.goal[0], goal[1] - this.goal[1], goal[2] - this.goal[2]) < 0.2 && this.state !== FollowState.Failed) {
      this.radius = radius;
      return;
    }
    // Asked again where it just gave up (stuck, no way): it stays given up a while, so the asker can give up too.
    if (this.state === FollowState.Failed && this.failedGoal && Math.hypot(goal[0] - this.failedGoal[0], goal[1] - this.failedGoal[1], goal[2] - this.failedGoal[2]) < 0.5 && this.ticks - this.failedAt < FAILED_HOLD_S * TICK_HZ) return;
    // A new goal while a link's under way (a barricade being knifed, a vault, a ladder): the link's finished first (it
    // gives up by itself in a few seconds), then the way on is found again toward the new goal (dropping the link each
    // time a sound is heard again would never get a barricade down).
    if (this.taking && this.goal && this.state === FollowState.Walking) {
      this.goal = [goal[0], goal[1], goal[2]];
      this.radius = radius;
      this.reroute = true;
      return;
    }
    // A goal moved a little (a sound heard again, a teammate walking on) and still in its route's last region: the
    // same route, only its end moved (a new search costs a millisecond; bots re-aim like this many times a second).
    const g = this.grid;
    if (g && this.goal && this.route && this.state === FollowState.Walking && !this.taking && this.route.version === g.version && Math.hypot(goal[0] - this.goal[0], goal[2] - this.goal[2]) < REAIM_M) {
      const n = g.nodeNear(goal[0], goal[1], goal[2], 1, 0.9);
      if (n >= 0 && g.regionOf(n) === g.regionOf(this.route.goal)) {
        this.goal = [goal[0], goal[1], goal[2]];
        this.radius = radius;
        this.route.goal = n;
        // The stretch in hand led to the old end: the next one is found toward the new.
        if (this.done) this.steps = [];
        this.done = false;
        return;
      }
    }
    this.goal = [goal[0], goal[1], goal[2]];
    this.radius = radius;
    this.state = FollowState.Walking;
    this.route = null;
    this.steps = [];
    this.retries = 0;
    this.taking = null;
    this.reroute = false;
  }

  /** Given up on the goal (stuck, or no way there). */
  private fail(): void {
    this.state = FollowState.Failed;
    this.failedGoal = this.goal;
    this.failedAt = this.ticks;
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
    this.ticks++;
    this.tickedAt = sim.tick;
    this.nav = nav;
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
        this.clearAt = -1;
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
    this.grid = grid;
    // The grid changed under the route (a chunk it crosses was rebuilt): find it again. A change elsewhere leaves it.
    if (this.route && this.route.version !== grid.version && !this.taking) {
      const r = this.route;
      if (grid.routeHolds(r.version, r.regions, [r.start, r.goal, ...this.steps.slice(this.idx).flatMap((st) => (st.link ? [st.link.from, st.link.to] : []))])) r.version = grid.version;
      else {
        this.route = null;
        this.steps = [];
      }
    }
    if (!this.route) {
      // A new route waits its turn when many bots want one this tick.
      if (!nav.takeRoute()) return false;
      this.route = nav.search.route(pos, this.goal!);
      this.steps = [];
      if (!this.route) {
        this.fail();
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
        if (++this.retries > 4) this.fail();
        return false;
      }
      this.steps = part.steps;
      this.done = part.done;
      this.idx = Math.min(1, this.steps.length - 1);
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
    // Stuck: the body trying to walk but not getting half a metre on (whatever the waypoints: a new route from the
    // same place is still stuck), for how long.
    const now = this.tickCount++;
    // (Across the floor: bobbing up and down, a jump or a vault tap that goes nowhere, isn't getting on.)
    if (!this.anchor || Math.hypot(pos[0] - this.anchor[0], pos[2] - this.anchor[2]) > UNSTUCK_M || now - this.lastWalk > 2) {
      this.anchor = [pos[0], pos[1], pos[2]];
      this.anchorAt = now;
    }
    this.lastWalk = now;
    const stuckFor = (now - this.anchorAt) / TICK_HZ;
    let buttons = 0;
    // Stuck long enough to search again: crouched (a low beam, a stair's underside the grid missed by a few
    // centimetres) and stepping to one side and the other of the way as it goes.
    let side = 0;
    if (stuckFor > STUCK_S) {
      // Something's in the way: try climbing it, then search again and wriggle, then give up.
      if (stuckFor <= STUCK_S * 2) buttons |= vaultTap(now);
      if (stuckFor > STUCK_S * 2 && stuckFor <= STUCK_S * 2 + 1.5 / TICK_HZ) {
        this.route = null;
        this.steps = [];
        this.retries++;
      }
      if (stuckFor > STUCK_S * 2) side = Math.floor(now / (TICK_HZ * 0.6)) % 2 ? 0.8 : -0.8;
      if (stuckFor > STUCK_S * 4 || this.retries > 4) {
        this.fail();
        return { forward: 0, strafe: 0, yaw: s.yaw, pitch: null, buttons: 0, stance: Stance.Stand };
      }
    }
    // Slow down onto a waypoint that turns hard; otherwise full speed.
    const speed = len < near * 2 ? 0.6 : 1;
    const yaw = look ?? turnToward(s.yaw, way, WALK_TURN / TICK_HZ);
    // The way, relative to the facing (and a step across it, wriggling).
    const rel = wrapAngle(way - yaw);
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const forward = clamp(Math.cos(rel) * speed - Math.sin(rel) * side);
    const strafe = clamp(-Math.sin(rel) * speed - Math.cos(rel) * side);
    if (this.sprint && !low && !side && look === null && Math.abs(rel) < 0.3 && len > 2) buttons |= Btn.Sprint;
    return { forward, strafe, yaw, pitch: null, buttons, stance: low || side ? Stance.Crouch : Stance.Stand };
  }
  private tickCount = 0;
  /** Its ticks (every tick asked, walking or not). */
  private ticks = 0;

  /** A link under way: each kind as a player takes it. */
  private takeLink(sim: Sim, pawn: Pawn, look: number | null): Stride {
    const s = pawn.state;
    const l = this.taking!;
    const t = this.takingT++;
    const facing = Math.abs(wrapAngle(s.yaw - l.yaw)) < 0.15;
    const turn = turnToward(s.yaw, l.yaw, 0.35);
    const base: Stride = { forward: 0, strafe: 0, yaw: turn, pitch: 0, buttons: 0, stance: Stance.Stand };
    // Too long on one link (blocked by a body, a barricade put back up, a drop's lip it can't get off, a window too low
    // to get through once its planks are gone): leave it and search again; a drop, vault or barricade that doesn't go
    // is taken out of the grid for the round (no body would get through it either). A ladder's only left.
    if (t > TICK_HZ * (l.kind === LinkKind.Drop || l.kind === LinkKind.Vault ? 4 : 10)) {
      if (l.kind !== LinkKind.Ladder) this.nav?.blockLink(l);
      return this.leaveLink();
    }
    const end = this.steps[this.idx].pos;
    const arrived = () => {
      this.taking = null;
      this.idx = Math.min(this.idx + 1, this.steps.length);
      if (this.reroute) {
        this.reroute = false;
        this.route = null;
        this.steps = [];
      }
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
        // Walked on over the gap, or still on the lip (it didn't fall): a drop that doesn't go (out of the grid for the
        // round), and a search again from wherever it is.
        if (t > TICK_HZ * 1.5 && s.grounded && s.y > end[1] + 0.5) {
          this.nav?.blockLink(l);
          return this.leaveLink();
        }
        // Not off the edge by now: something low over it (a staircase above the lip), so crouched.
        return { ...base, forward: facing ? 0.7 : 0, stance: t > TICK_HZ * 0.75 ? Stance.Crouch : Stance.Stand };
      }
      case LinkKind.Ladder: {
        if (s.mode === PawnMode.Walk && t > 8 && Math.abs(s.y - end[1]) < 0.4) return arrived();
        // Grab it (Interact, a press: every few ticks until on it).
        return facing && t % 8 === 0 ? { ...base, buttons: Btn.Interact } : base;
      }
      case LinkKind.Barricade: {
        if (this.drone) {
          // Under the barricade's gap.
          if (dist2([s.x, s.y, s.z], end) < NEAR) return arrived();
          return { ...base, forward: facing ? 1 : 0.3 };
        }
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
        // Gone: through the doorway, or over the sill; not through 4 s after (a body in the way on the far side, a sill
        // the movement code won't take from here), it doesn't go: out of the grid for the round, and another way.
        if (this.clearAt < 0) this.clearAt = t;
        if (t - this.clearAt > TICK_HZ * 4) {
          this.nav?.blockLink(l);
          return this.leaveLink();
        }
        if (l.vault) {
          if (t > 4 && s.mode === PawnMode.Walk && dist2([s.x, s.y, s.z], end) < 0.7) return arrived();
          return facing ? { ...base, buttons: vaultTap(t) } : base;
        }
        if (dist2([s.x, s.y, s.z], end) < NEAR) return arrived();
        // Crouched under a low one (a window level with the roof outside it: the grid only joins those a body fits
        // through crouched).
        const low = e !== undefined && e.frame.center[1] + e.frame.h / 2 - s.y < sim.data.movement.stance.stand.height + 0.05;
        return { ...base, forward: facing ? 1 : 0.3, stance: low ? Stance.Crouch : Stance.Stand };
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
    this.reroute = false;
    // Link after link that doesn't go: given up (as after a few routes that lead nowhere).
    if (++this.retries > 4) this.fail();
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
