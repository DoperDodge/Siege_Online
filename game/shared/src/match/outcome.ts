// Who wins a Bomb round, and why (research/round_flow.md §4, every playlist), from what the room sees this tick.
import { ATTACK, DEFENSE, type Side } from "./rules.js";

/** How a round was won (the round banner and the scoreboard's round history). */
export const WinReason = {
  /** The other side has nobody left up (research §4 cases 1, 6 and 9). */
  Elimination: 0,
  /** The action timer ran out with no plant under way (cases 2 and 4). */
  Time: 1,
  /** The planted defuser's fuse ran out (case 5). */
  Detonated: 2,
  /** A defender finished disabling the planted defuser (case 7). */
  Disabled: 3,
  /** The hatch the defuser was planted on was destroyed (case 8). */
  Deactivated: 4,
} as const;
export type WinReason = (typeof WinReason)[keyof typeof WinReason];

/** What the room sees at the end of a tick in action or post-plant. */
export interface RoundFacts {
  /** Players on each side with their body alive and not down (Skopós: her active shell). */
  attackersUp: number;
  defendersUp: number;
  /**
   * Players each side started the round with: a side with none (Practice) can't be eliminated, and a side
   * whose players have all gone still counts them, so it is.
   */
  attackersPlaying: number;
  defendersPlaying: number;
  /** The defuser is planted (and its fuse running). */
  planted: boolean;
  /** An attacker is holding the plant. */
  plantInProgress: boolean;
  /** The action timer has run out (only while not planted). */
  timeUp: boolean;
  /** The fuse has run out (only while planted). */
  fuseDone: boolean;
  /** A defender finished disabling it while the fuse was still running. */
  disabled: boolean;
  /** The hatch under it was destroyed. */
  deactivated: boolean;
}

/**
 * The round's winner (a side) and why, or null while it goes on. Planted, defenders can't win by eliminating
 * the attackers: they must disable it (research §4). Both sides out in the same tick goes to the attackers if
 * planted, else to the defenders (case 9). A plant under way when the timer runs out plays on (case 3).
 */
export function roundOutcome(f: RoundFacts): { winner: Side; reason: WinReason } | null {
  const attackersOut = f.attackersPlaying > 0 && f.attackersUp === 0;
  const defendersOut = f.defendersPlaying > 0 && f.defendersUp === 0;
  if (f.planted) {
    if (f.disabled) return { winner: DEFENSE, reason: WinReason.Disabled };
    if (f.deactivated) return { winner: DEFENSE, reason: WinReason.Deactivated };
    if (defendersOut) return { winner: ATTACK, reason: WinReason.Elimination };
    if (f.fuseDone) return { winner: ATTACK, reason: WinReason.Detonated };
    return null;
  }
  if (attackersOut) return { winner: DEFENSE, reason: WinReason.Elimination };
  if (defendersOut) return { winner: ATTACK, reason: WinReason.Elimination };
  if (f.timeUp && !f.plantInProgress) return { winner: DEFENSE, reason: WinReason.Time };
  return null;
}
