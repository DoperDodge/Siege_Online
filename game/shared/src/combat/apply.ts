// Damage to a body on the server (Phase 3 M6–M7; DECISIONS D-043, D-044, D-048): it changes the current
// state, so the owner's client gets a correction, and the room reports what happened. Health reaching 0
// downs a body (DBNO) when the rules allow it, otherwise kills it (research/core_mechanics.md §10.1).
import type { ModeData } from "../data/schemas.js";
import { isDowned } from "../player/downed.js";
import type { Pawn } from "../player/pawn.js";
import { PawnMode } from "../player/types.js";
import type { Sim } from "../sim.js";
import { ticks } from "../weapons/ticks.js";
import { parkWeapon } from "../weapons/step.js";

/** Why a body took damage. */
export const Cause = { Bullet: 0, Melee: 1, Fall: 2, Explosive: 3, Lab: 4, Reflect: 5, Bleed: 6 } as const;
export type Cause = (typeof Cause)[keyof typeof Cause];
export const CAUSE_MAX = 6;
/** The names data/combat.json uses (`dbno.lethalCauses`). */
const CAUSE_NAMES = ["bullet", "melee", "fall", "explosive", "lab", "reflect", "bleed"] as const;

export type DamageOutcome = "ignored" | "hurt" | "downed" | "killed";

/** Damage to apply: an amount of health, or an instant kill (a headshot), and why. */
export interface Damage {
  amount: number;
  kill: boolean;
  cause?: Cause;
}

/**
 * Apply damage to a body as it is now:
 * - dead: ignored (a second shot judged in the same tick);
 * - down: ignored for a moment after going down, else it comes out of the 20 HP pool (a headshot or melee
 *   finishes it);
 * - on its feet: a headshot or melee kills; otherwise health drops, and at 0 the body goes down if it can
 *   (operator allows it, first time this life, not a lethal cause, not overkill, not the last one up when
 *   the mode says so), else dies.
 * `removed` is the health (or down pool) it actually lost.
 */
export function applyDamage(sim: Sim, pawn: Pawn, d: Damage, rules?: Pick<ModeData, "lastAliveDies">): { outcome: DamageOutcome; removed: number } {
  const s = pawn.state;
  const combat = sim.data.combat;
  const cause = d.cause ?? Cause.Bullet;
  if (s.mode === PawnMode.Dead) return { outcome: "ignored", removed: 0 };
  if (cause === Cause.Melee) {
    // The knife: lethal on bodies standing or down (core_mechanics.md §10.1, §12), or a set amount.
    const v = isDowned(s) ? combat.melee.vsDowned : combat.melee.vsStanding;
    d = v === "kill" ? { ...d, kill: true } : { ...d, amount: v };
  }
  if (isDowned(s)) {
    if (s.invulnTicks > 0) return { outcome: "ignored", removed: 0 };
    // (The pool bleeds in fractions; what it loses is reported in whole points.)
    if (d.kill) return kill(sim, pawn, Math.ceil(s.downHp));
    if (d.amount <= 0) return { outcome: "ignored", removed: 0 };
    if (s.downHp > d.amount) {
      s.downHp = Math.fround(s.downHp - d.amount);
      return { outcome: "hurt", removed: d.amount };
    }
    return kill(sim, pawn, Math.ceil(s.downHp));
  }
  if (d.kill) return kill(sim, pawn, s.hp);
  if (d.amount <= 0) return { outcome: "ignored", removed: 0 };
  if (s.hp > d.amount) {
    s.hp -= d.amount;
    return { outcome: "hurt", removed: d.amount };
  }
  const removed = s.hp;
  const canDown =
    (sim.data.operators.get(pawn.operatorId)?.combat?.canDbno ?? true) &&
    s.downs < combat.dbno.downsPerRound &&
    !(combat.dbno.lethalCauses as readonly string[]).includes(CAUSE_NAMES[cause]) &&
    d.amount - s.hp <= combat.dbno.overkillKillsAbove &&
    !(rules?.lastAliveDies && !teammateUp(sim, pawn));
  if (!canDown) return kill(sim, pawn, removed);
  // Down but not out: the 20 HP pool, a moment of invulnerability, and whatever it was doing stops. A body
  // mid-vault finishes the vault first; one on a ladder lets go and falls.
  s.hp = 0;
  s.downHp = combat.dbno.hp;
  s.downs++;
  s.invulnTicks = Math.min(255, ticks(combat.dbno.invulnSeconds));
  if (s.mode === PawnMode.Ladder) {
    s.ladder = -1;
    s.grounded = false;
  }
  if (s.mode !== PawnMode.Vault) s.mode = PawnMode.Downed;
  s.lean = 0;
  s.sprinting = false;
  s.meleeTicks = 0;
  parkWeapon(s);
  s.adsQ = 0;
  dropRevive(sim, pawn);
  return { outcome: "downed", removed };
}

function kill(sim: Sim, pawn: Pawn, removed: number): { outcome: DamageOutcome; removed: number } {
  const s = pawn.state;
  s.hp = 0;
  s.downHp = 0;
  s.mode = PawnMode.Dead;
  s.sprinting = false;
  dropRevive(sim, pawn);
  sim.refreshPawn(pawn.id); // a dead body stops blocking at once
  return { outcome: "killed", removed };
}

/** A reviver who goes down or dies lets go of the body it was picking up. */
function dropRevive(sim: Sim, pawn: Pawn) {
  const t = pawn.state.reviveTarget ? sim.pawns.get(pawn.state.reviveTarget) : undefined;
  if (t && t.state.revivedBy === pawn.id) {
    t.state.revivedBy = 0;
    sim.onReviveCut?.(t);
  }
  pawn.state.reviveTarget = 0;
  pawn.state.reviveTicks = 0;
}

/** Another player on the same team is on their feet (the "last one up dies" rule). */
function teammateUp(sim: Sim, pawn: Pawn): boolean {
  for (const c of sim.controllers.values()) {
    if (c.id === pawn.ownerId) continue;
    const p = sim.pawns.get(c.possessedPawnId);
    if (p && p.team === pawn.team && p.state.mode !== PawnMode.Dead && !isDowned(p.state)) return true;
  }
  return false;
}

/** Skopós's shell that isn't being driven (her other body): it takes headshots differently and its loss isn't an elimination. */
export function isIdleShell(sim: Sim, pawn: Pawn): boolean {
  if (pawn.ownerId === null) return false;
  const c = sim.controllers.get(pawn.ownerId);
  return c !== undefined && c.pawnIds.length > 1 && c.possessedPawnId !== pawn.id;
}
