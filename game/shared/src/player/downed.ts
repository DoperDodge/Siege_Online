// Down but not out (Phase 3 M7; DECISIONS D-048; research/core_mechanics.md §10): a body at 0 HP that can
// still be revived. It lies down (crouched where there's no room), crawls slowly, and bleeds out of a
// 20 HP pool, faster while crawling; a teammate reviving it pauses the bleed. Times are placeholders
// (data/combat.json `dbno`).
import { DT } from "../core/constants.js";
import type { CombatData } from "../data/schemas.js";
import { PawnMode, type PawnState } from "./types.js";

/** Down but not out, including a body that went down mid-vault (it finishes the vault first). */
export const isDowned = (s: PawnState): boolean => s.mode === PawnMode.Downed || (s.mode === PawnMode.Vault && s.downHp > 0);

/** One tick of bleeding, faster while crawling. Returns true when the body bled out (it is now dead). */
export function bleedTick(combat: CombatData, s: PawnState, moving: boolean): boolean {
  const d = combat.dbno;
  s.downHp = Math.fround(s.downHp - (d.hp * DT) / (moving ? d.bleedMovingSeconds : d.bleedStillSeconds));
  if (s.downHp > 0) return false;
  s.downHp = 0;
  s.mode = PawnMode.Dead;
  return true;
}
