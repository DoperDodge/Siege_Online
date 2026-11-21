// Tonic's Second Wind (Project Redmond R3, gadgets/R3_OPERATORS.md §2; the medic's updated version, Ulo's pick): a patch
// set off on a body works in the body's own step, so its owner's client predicts it once the server has set it going
// (net/room.ts patches): on its feet, its health comes back a point at a time over the heal's time, up to its most; down,
// it doesn't bleed, and when its time's out it's up again with the patch's health, as a revive leaves a body.
import type { GameData } from "../data/load.js";
import type { GadgetData } from "../data/schemas.js";
import { isDowned } from "../player/downed.js";
import { PawnMode, type PawnState } from "../player/types.js";
import { ticks } from "../weapons/ticks.js";

export type PatchData = NonNullable<GadgetData["patch"]>;

/** The patch's numbers (the gadget that has them: Second Wind), or null. */
export function patchData(data: GameData): PatchData | null {
  for (const g of data.gadgets.values()) if (g.patch) return g.patch;
  return null;
}

/** Whether a patch is working on this body (healing it, or getting it up). */
export const patchWorking = (s: PawnState) => s.healLeft > 0 || s.patchTicks > 0;

/** A patch set going on a body (the room's, net/room.ts): down, its time to get up; on its feet, its heal. */
export function startPatch(k: PatchData, s: PawnState): void {
  if (s.mode === PawnMode.Downed) {
    s.patchTicks = Math.max(1, ticks(k.reviveS));
    return;
  }
  s.healLeft = k.heal;
  s.healTicks = 0;
}

/** A patch stopped (an EMP on the body): no more heal, and down it bleeds again. */
export function stopPatch(s: PawnState): void {
  s.healLeft = 0;
  s.healTicks = 0;
  s.patchTicks = 0;
}

/**
 * One tick of a patch on a body (player/movement.ts stepPawn). Returns true the tick it gets the body up from down.
 * Off its feet the heal stops (a body going down loses what's left of it).
 */
export function stepPatch(data: GameData, s: PawnState): boolean {
  if (s.patchTicks === 0 && s.healLeft === 0) return false;
  const k = patchData(data);
  if (!k) {
    stopPatch(s);
    return false;
  }
  let up = false;
  if (s.patchTicks > 0) {
    if (s.mode !== PawnMode.Downed) s.patchTicks = 0;
    else if (--s.patchTicks === 0) {
      // Up again with the patch's health, still lying down, as a revive leaves a body (sim.ts endRevive).
      s.mode = PawnMode.Walk;
      s.hp = Math.min(s.maxHp, k.reviveHp);
      s.downHp = 0;
      s.invulnTicks = 0;
      up = true;
    }
  }
  if (s.healLeft > 0) {
    if (s.mode === PawnMode.Dead || isDowned(s)) {
      s.healLeft = 0;
      s.healTicks = 0;
      return up;
    }
    const total = Math.max(1, ticks(k.healS));
    s.healTicks = Math.min(0xffff, s.healTicks + 1);
    // What should have come back by now, a point at a time; past its most it's spent all the same.
    const due = Math.min(k.heal, Math.floor((s.healTicks * k.heal) / total));
    while (k.heal - s.healLeft < due && s.healLeft > 0) {
      if (s.hp < s.maxHp) s.hp++;
      s.healLeft--;
    }
    if (s.healTicks >= total) {
      s.healLeft = 0;
      s.healTicks = 0;
    }
  }
  return up;
}
