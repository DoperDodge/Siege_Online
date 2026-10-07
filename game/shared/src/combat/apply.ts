// Damage to a body on the server (Phase 3 M6; DECISIONS D-043, D-044): it changes the current state, so
// the owner's client gets a correction, and the room reports what happened. Health reaching 0 is death in
// M6; M7 adds DBNO in front of it.
import type { Pawn } from "../player/pawn.js";
import { PawnMode } from "../player/types.js";
import type { Sim } from "../sim.js";

export type DamageOutcome = "ignored" | "hurt" | "killed";

/** Damage to apply: an amount of health, or an instant kill (a headshot). */
export interface Damage {
  amount: number;
  kill: boolean;
}

/**
 * Apply damage to a body as it is now. A body that is already dead ignores it (a second shot judged in the
 * same tick); otherwise it loses health and dies at 0 (and stops blocking players at once).
 */
export function applyDamage(sim: Sim, pawn: Pawn, d: Damage): { outcome: DamageOutcome; removed: number } {
  const s = pawn.state;
  if (s.mode === PawnMode.Dead || (!d.kill && d.amount <= 0)) return { outcome: "ignored", removed: 0 };
  if (!d.kill && s.hp > d.amount) {
    s.hp -= d.amount;
    return { outcome: "hurt", removed: d.amount };
  }
  const removed = s.hp;
  s.hp = 0;
  s.mode = PawnMode.Dead;
  s.sprinting = false;
  sim.refreshPawn(pawn.id);
  return { outcome: "killed", removed };
}

/** Skopós's shell that isn't being driven (her other body): it takes headshots differently and its loss isn't an elimination. */
export function isIdleShell(sim: Sim, pawn: Pawn): boolean {
  if (pawn.ownerId === null) return false;
  const c = sim.controllers.get(pawn.ownerId);
  return c !== undefined && c.pawnIds.length > 1 && c.possessedPawnId !== pawn.id;
}
