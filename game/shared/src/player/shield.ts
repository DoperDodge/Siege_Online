// Fuze's Ballistic Shield (Phase 8 M11; research/weapons_notes.md §5; data/weapons/ballistic_shield.json `shield`;
// gadgets/DESIGN.md §8): where its plate is on a body now, the hitboxes it adds (bullets, the knife, the hammer and
// blasts meet it first: player/hitboxes.ts shieldHitboxes), and what wears off by itself (a guard break, suppression).
// Up in front with the pistol in the hands; on the back while a gadget, a hold (the needle, a plant) or a rope has
// them, or prone; nowhere while it's knocked aside (`guard`) or the body is down.
import { DeployKind } from "../destruction/deploy.js";
import type { HitboxData, MovementData } from "../data/schemas.js";
import { ticks } from "../weapons/ticks.js";
import { isDowned } from "./downed.js";
import { poseHitboxes, shieldHitboxes, shieldHold, type Hitbox, type ShieldPlace, type ShieldPlate } from "./hitboxes.js";
import type { Pawn } from "./pawn.js";
import { Btn, Hand, PawnMode, Stance, type PawnState } from "./types.js";
import type { ResolvedLoadout } from "../weapons/loadout.js";
import type { ShieldData } from "../data/schemas.js";

/** `PawnState.shieldAt`: where the plate is (sent to others in a remote record's flags, so a rewind puts it there). */
export const ShieldAt = { None: 0, Front: 1, Back: 2 } as const;

/**
 * Where a body's shield's plate should be now (`shieldAt`): none (no shield, knocked aside, down or dead, or knocked to
 * the ground: D-156, Fandom: a knockdown unequips it), front, back.
 */
function placeFor(lo: ResolvedLoadout | null, s: PawnState): number {
  if (!lo?.shield || s.mode === PawnMode.Dead || s.mode === PawnMode.Knocked || isDowned(s) || s.guard > 0) return ShieldAt.None;
  // Bailiff's set down as cover (R3): not on her while it's out.
  if (lo.shieldDown && s.g2 === 0) return ShieldAt.None;
  if (s.hand !== Hand.Weapon || s.deployKind !== DeployKind.None || s.mode === PawnMode.Rappel || s.mode === PawnMode.Ladder || s.stance === Stance.Prone) return ShieldAt.Back;
  return ShieldAt.Front;
}

/** Set where a body's plate is from its state now (the end of its step; the server after it knocks one aside). */
export function placeShield(pawn: Pawn): void {
  pawn.state.shieldAt = placeFor(pawn.loadout, pawn.state);
}

/** Where a body's shield's plate is (its state's `shieldAt`), or null. */
export function shieldPlace(s: PawnState): ShieldPlace | null {
  return s.shieldAt === ShieldAt.Front ? "front" : s.shieldAt === ShieldAt.Back ? "back" : null;
}

/** Whether a body holds its shield up in front now. */
export const shieldUp = (s: PawnState) => s.shieldAt === ShieldAt.Front;

/** How far a body's plate is braced (Hull's, R3): 0 folded … 1 braced. */
export const braceOf = (s: PawnState) => s.braceQ / 65535;

/**
 * A shield's plate as it is on a body now: as its data has it; Hull's (R3, `brace`) between its folded size and its
 * braced one by how far it's braced (its hitboxes and its model alike).
 */
export function platePose(k: ShieldData["shield"], s: PawnState): ShieldPlate {
  const b = k.brace;
  if (!b || s.braceQ >= 65535) return k.plate;
  const t = braceOf(s);
  const lerp = (a: number, c: number) => a + (c - a) * t;
  return { ...k.plate, widthM: lerp(b.folded.widthM, k.plate.widthM), topWidthM: lerp(b.folded.widthM, k.plate.topWidthM), heightM: lerp(b.folded.heightM, k.plate.heightM), aboveEyeM: lerp(b.folded.aboveEyeM, k.plate.aboveEyeM) };
}

/**
 * A tick of Hull's Plate's brace (R3; the body's own step, predicted): with it up in front his ability key switches it;
 * whatever takes the plate down (a gadget, a hold, a rope, a knock aside, a fall) unbraces it. It comes out over
 * `brace.extendS` and folds back over `brace.retractS`.
 */
export function stepBrace(pawn: Pawn, pressed: number): void {
  const b = pawn.loadout?.shield?.brace;
  if (!b) return;
  const s = pawn.state;
  if (pressed & Btn.Ability && shieldUp(s)) s.braced = !s.braced;
  if (!shieldUp(s)) s.braced = false;
  s.braceQ = s.braced ? Math.min(65535, s.braceQ + Math.ceil(65536 / ticks(b.extendS))) : Math.max(0, s.braceQ - Math.ceil(65536 / ticks(b.retractS)));
}

/** A body's hitboxes now: its pose's, and its shield's plate where it is (Phase 8 M11). */
export function pawnHitboxes(m: MovementData, hb: HitboxData, pawn: Pawn): Hitbox[] {
  const k = pawn.loadout?.shield;
  const place = k ? shieldPlace(pawn.state) : null;
  const plate = k ? platePose(k, pawn.state) : null;
  // Held up in front, his hands are on its grips behind it (D-169): no arm out past the plate.
  const body = poseHitboxes(m, hb, pawn.state, plate && place === "front" ? shieldHold(m, plate, pawn.state) : undefined);
  return plate && place ? [...body, ...shieldHitboxes(m, hb, pawn.state, plate, place)] : body;
}

/** Whether a body's shield has it suppressed (bullets on it lately): no sprinting, the edges of the view blurred. */
export function suppressed(lo: ResolvedLoadout | null, s: PawnState): boolean {
  return !!lo?.shield && s.suppress >= lo.shield.suppression.hitsToTrigger;
}

/** A tick of a shield's own: a guard break wears off; with no bullet on it for `falloffS`, the suppression's gone. */
export function stepShield(pawn: Pawn): void {
  const k = pawn.loadout?.shield;
  const s = pawn.state;
  if (!k) return;
  if (s.guard > 0) s.guard--;
  if (s.suppress === 0) return;
  s.suppressT = Math.min(0xffff, s.suppressT + 1);
  if (s.suppressT >= ticks(k.suppression.falloffS)) {
    s.suppress = 0;
    s.suppressT = 0;
  }
}

/** A bullet stopped by a body's shield (the server's): one more toward its suppression, to `hitsToMax`. */
export function shieldHit(pawn: Pawn): void {
  const k = pawn.loadout?.shield;
  if (!k) return;
  pawn.state.suppress = Math.min(k.suppression.hitsToMax, pawn.state.suppress + 1);
  pawn.state.suppressT = 0;
}

/** Knock a body's shield aside (a guard break: a blast, a knife, a stun) or down (Sledge's hammer) for `seconds`. */
export function knockShield(pawn: Pawn, seconds: number): void {
  if (!pawn.loadout?.shield) return;
  pawn.state.guard = Math.max(pawn.state.guard, ticks(seconds));
  placeShield(pawn);
}
