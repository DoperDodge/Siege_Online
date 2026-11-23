// The Bailiff Shield's prod (Project Redmond R3, gadgets/R3_OPERATORS.md §2; data/weapons/bailiff_shield.json
// `shield.prod`; Ulo's: the stun and the slow, a click of Fire switching it on and off). The body's own step runs it
// (predicted): held up and not aimed, a click of Fire switches it on, and on it jolts every `everyS` while its charge
// lasts (a `prod` event the room judges: net/room.ts judgeProd); another click, aiming, the shield going down or its
// charge running out switch it off, and off its charge refills once it's been off `refillDelayS`. A body it jolts is slowed for `slowS` (its own step counts it
// down: no sprint, no vault, its speed × `slowMul`). An EMP on Bailiff turns it off (her `jammed`); one reaching her
// with it up shocks her (`shocked`: no moving, no hands; the room sets it, player/movement.ts holds her still).
import { DEG, type Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import type { ShieldData } from "../data/schemas.js";
import { viewDir } from "../weapons/spread.js";
import { ticks } from "../weapons/ticks.js";
import type { Hitbox } from "./hitboxes.js";
import type { Pawn } from "./pawn.js";
import { shieldUp } from "./shield.js";
import { Btn, Hand, PawnMode, type InputCmd } from "./types.js";

export type ProdData = NonNullable<ShieldData["shield"]["prod"]>;

/** The prod's numbers (the shield that has one: the Bailiff Shield), or null in data without it. */
export function prodData(data: GameData): ProdData | null {
  for (const w of data.weapons.values()) if (w.class === "shield" && w.shield.prod) return w.shield.prod;
  return null;
}

/** Whether a body's prod can jolt now: its shield up, its hands free, not aimed, not off under an EMP or shocked. */
export function prodReady(pawn: Pawn, input: InputCmd): boolean {
  const k = pawn.loadout?.shield?.prod;
  const s = pawn.state;
  return !!k && shieldUp(s) && s.hand === Hand.Weapon && s.mode === PawnMode.Walk && !(input.buttons & Btn.Ads) && s.jammed === 0 && s.shocked === 0 && s.meleeTicks === 0 && s.prodUsed < ticks(k.chargeS);
}

/**
 * A tick of a body's prod (its own step; `pressed`: the buttons pressed this tick). A click of Fire with the shield up
 * and not aiming switches it on or off (Ulo's). On, it uses its charge, with a jolt at once and every `everyS` after (a
 * `prod` event); it goes off by itself when it can't jolt (aimed, the shield not up, an EMP, a shock) or its charge is
 * spent. Off, once it's been off `refillDelayS` its charge comes back a second a second; the wait for its next jolt runs
 * on, so switching it off and on again doesn't jolt sooner.
 */
export function stepProd(pawn: Pawn, input: InputCmd, pressed: number, events: { push(e: { kind: "prod"; pawnId: number; seq: number; yaw: number; pitch: number }): void }): void {
  const k = pawn.loadout?.shield?.prod;
  if (!k) return;
  const s = pawn.state;
  if (pressed & Btn.Fire && !(input.buttons & Btn.Ads) && shieldUp(s) && s.hand === Hand.Weapon) s.prodOn = !s.prodOn;
  if (s.prodOn && !prodReady(pawn, input)) s.prodOn = false;
  if (s.prodOn) {
    s.prodIdle = 0;
    s.prodUsed = Math.min(0xffff, s.prodUsed + 1);
    if (s.prodNext === 0) {
      events.push({ kind: "prod", pawnId: pawn.id, seq: input.seq, yaw: s.yaw, pitch: s.pitch });
      s.prodNext = Math.max(1, ticks(k.everyS));
    }
    s.prodNext--;
    if (s.prodUsed >= ticks(k.chargeS)) s.prodOn = false;
    return;
  }
  // Off, the wait for the next jolt runs on (it isn't reset): switched back on, it jolts at once only if a jolt's time
  // has gone by since the last (the review: clicking it off and on jolted every other tick).
  if (s.prodNext > 0) s.prodNext--;
  s.prodIdle = Math.min(0xffff, s.prodIdle + 1);
  if (s.prodIdle >= ticks(k.refillDelayS) && s.prodUsed > 0) s.prodUsed--;
}

/** What a body's speed is multiplied by while a prod's jolt slows it (1: not slowed). */
export function prodSlow(data: GameData, pawn: Pawn): number {
  if (pawn.state.slowed === 0) return 1;
  return prodData(data)?.slowMul ?? 1;
}

/** How much of a body's prod's charge is left (0 … 1), or null when it has none. */
export function prodLeft(pawn: Pawn): number | null {
  const k = pawn.loadout?.shield?.prod;
  return k ? Math.max(0, 1 - pawn.state.prodUsed / ticks(k.chargeS)) : null;
}

/**
 * Who a jolt from `eye` along the view (`yaw`, `pitch`) meets (the room's, on the bodies as the prodder saw them): the
 * nearest body whose nearest part is within `rangeM` of the eye and `halfDeg` of the view, nothing solid between (the
 * level's `blocked(from, to)`), not one in `ignore`. Its pawn id and the point, or null.
 */
export function prodTarget(eye: Vec3, yaw: number, pitch: number, bodies: ReadonlyMap<number, Hitbox[]>, ignore: ReadonlySet<number>, k: ProdData, blocked: (from: Vec3, to: Vec3) => boolean): { pawnId: number; point: Vec3 } | null {
  const dir = viewDir(yaw, pitch);
  const cosCone = Math.cos(k.halfDeg * DEG);
  let best: { pawnId: number; point: Vec3; dist: number } | null = null;
  for (const [id, boxes] of bodies) {
    if (ignore.has(id)) continue;
    let mine: { point: Vec3; dist: number } | null = null;
    for (const h of boxes) {
      // The point of the part nearest the view's line within reach, and its angle off the view.
      const p = nearestOnSegment(h.a, h.b, eye, dir, k.rangeM);
      const d: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
      const len = Math.hypot(d[0], d[1], d[2]);
      const reach = Math.max(0, len - h.radius);
      if (reach > k.rangeM) continue;
      const cos = len > 1e-4 ? (d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2]) / len : 1;
      // Its radius widens the cone for it: a part's edge in the cone counts.
      const edge = len > 1e-4 ? Math.cos(Math.max(0, Math.acos(Math.min(1, cos)) - Math.atan2(h.radius, len))) : 1;
      if (edge < cosCone) continue;
      if (!mine || reach < mine.dist) mine = { point: p, dist: reach };
    }
    if (!mine || blocked(eye, mine.point)) continue;
    if (!best || mine.dist < best.dist || (mine.dist === best.dist && id < best.pawnId)) best = { pawnId: id, ...mine };
  }
  return best ? { pawnId: best.pawnId, point: best.point } : null;
}

/** The point of segment a–b nearest the ray from `o` along unit `d` (out to `maxT`). */
function nearestOnSegment(a: Vec3, b: Vec3, o: Vec3, d: Vec3, maxT: number): Vec3 {
  let best = a;
  let bestD = Infinity;
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    const p: Vec3 = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    const rel: Vec3 = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
    const t = Math.max(0, Math.min(maxT, rel[0] * d[0] + rel[1] * d[1] + rel[2] * d[2]));
    const dd = Math.hypot(rel[0] - d[0] * t, rel[1] - d[1] * t, rel[2] - d[2] * t);
    if (dd < bestD) {
      bestD = dd;
      best = p;
    }
  }
  return best;
}
