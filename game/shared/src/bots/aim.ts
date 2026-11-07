// A bot's aim (Phase 9 M3, bots/DESIGN.md §7): where its view goes each tick when it fights. It picks a point on the
// target (the head by `headshotBias`, less often the farther; else the chest), draws an aim error when it takes a new
// target that settles over `settleMs`, follows a moving target `trackLagMs` behind, turns no faster than `turnRateDeg`,
// and pulls only `recoilControl` of its weapon's climb back down while firing. Everything from data/bots/difficulty.json.
import { TICK_HZ } from "../core/constants.js";
import { DEG, wrapAngle, type Vec3 } from "../core/math.js";
import type { BotDifficulty } from "../data/schemas.js";
import type { Contact } from "./perceive.js";
import type { BotRng } from "./rng.js";

/** A view: yaw and pitch (radians). */
export interface View {
  yaw: number;
  pitch: number;
}

/** The view that looks from `eye` at `p`. */
export function lookAt(eye: Vec3, p: Vec3): View {
  const dx = p[0] - eye[0];
  const dy = p[1] - eye[1];
  const dz = p[2] - eye[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** The angle between two views (radians). */
export function viewGap(a: View, b: View): number {
  const dyaw = wrapAngle(a.yaw - b.yaw) * Math.cos((a.pitch + b.pitch) / 2);
  return Math.hypot(dyaw, a.pitch - b.pitch);
}

export class Aim {
  /** The target aimed at (pawn id; -1: none), the part, and the error drawn when it was taken. */
  private target = -1;
  private part: "head" | "chest" = "chest";
  private errYaw = 0;
  private errPitch = 0;
  private takenAt = 0;

  constructor(private readonly rng: BotRng) {}

  /** Forget the target (the next one gets a fresh error). */
  drop(): void {
    this.target = -1;
  }

  /**
   * The view for this tick toward contact `c` from `eye`, starting from the body's view now (`now`, with its weapon's
   * climb in it); `firing`: it's shooting (the climb is only partly pulled down). Returns the view, the point aimed at and
   * how far the view is off it (radians) and how big the target looks (its angular half size).
   */
  step(c: Contact, eye: Vec3, now: View, d: BotDifficulty, tick: number, asked: View | null): { view: View; point: Vec3; off: number; size: number } {
    if (c.pawnId !== this.target) {
      this.target = c.pawnId;
      this.takenAt = tick;
      const dist = Math.hypot(c.pos[0] - eye[0], c.pos[2] - eye[2]);
      const head = this.rng.next() < d.headshotBias * Math.max(0.2, 1 - dist / 40);
      this.part = head ? "head" : "chest";
      const err = d.aimErrorDeg * DEG;
      this.errYaw = this.rng.normal() * err;
      this.errPitch = this.rng.normal() * err * 0.6;
    }
    // The point: the part chosen if it shows, else whatever does; behind a moving target by the tracking lag.
    let point = (this.part === "head" ? (c.head ?? c.chest) : (c.chest ?? c.head)) ?? c.legs ?? [c.pos[0], c.pos[1] + 1.1, c.pos[2]];
    const lagTick = tick - (d.trackLagMs / 1000) * TICK_HZ;
    const past = c.trail.find((t) => t.tick >= lagTick);
    const last = c.trail[c.trail.length - 1];
    if (past && last && last.tick > past.tick) point = [point[0] - (last.p[0] - past.p[0]), point[1] - (last.p[1] - past.p[1]), point[2] - (last.p[2] - past.p[2])];
    // The error settles away.
    const settle = Math.exp(-(tick - this.takenAt) / ((d.settleMs / 1000) * TICK_HZ));
    const truth = lookAt(eye, point);
    const want: View = { yaw: truth.yaw + this.errYaw * settle, pitch: truth.pitch + this.errPitch * settle };
    // The weapon's kick since last tick (the view now less the one it asked for) pulled back by `recoilControl` at once,
    // as a player's hand does; then toward the point, no faster than its turn rate.
    const kickYaw = asked ? wrapAngle(now.yaw - asked.yaw) : 0;
    const kickPitch = asked ? now.pitch - asked.pitch : 0;
    const from: View = { yaw: wrapAngle(now.yaw - kickYaw * d.recoilControl), pitch: now.pitch - kickPitch * d.recoilControl };
    const max = (d.turnRateDeg * DEG) / TICK_HZ;
    const gain = 0.35;
    let dyaw = wrapAngle(want.yaw - from.yaw) * gain;
    let dpitch = (want.pitch - from.pitch) * gain;
    const len = Math.hypot(dyaw, dpitch);
    if (len > max) {
      dyaw *= max / len;
      dpitch *= max / len;
    }
    const view: View = { yaw: wrapAngle(from.yaw + dyaw), pitch: Math.max(-1.4, Math.min(1.4, from.pitch + dpitch)) };
    const dist = Math.max(0.5, Math.hypot(point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]));
    const size = Math.atan((this.part === "head" ? 0.11 : 0.2) / dist);
    return { view, point, off: viewGap(view, truth), size };
  }
}
