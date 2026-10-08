// Bullet damage (research/core_mechanics.md §9, weapons_notes.md §4.3, §4.8; values in data/combat.json).
// Runs on the server only, so it needs no float32 care; its results reach clients as integer HP.
import type { CombatData } from "../data/schemas.js";
import type { BodyPart } from "../player/hitboxes.js";
import { falloffAt } from "../weapons/damage.js";
import type { ResolvedDamage } from "../weapons/loadout.js";

export type Zone = "head" | "neck" | "torso" | "pelvis" | "arm" | "leg";

export const zoneOf = (part: BodyPart): Zone => (part.startsWith("arm") ? "arm" : part.startsWith("leg") ? "leg" : (part as Zone));

const CORE: readonly Zone[] = ["head", "neck", "torso", "pelvis"];

export interface BodyEntry {
  /** The pawn the ray entered. */
  id: number;
  /** Every hitbox the ray enters on this pawn, nearest first. */
  parts: { part: BodyPart; t: number }[];
}

export interface BodyHit {
  id: number;
  zone: Zone;
  /** Distance along the ray to the counted part. */
  t: number;
  /** Damage left after earlier bodies (full penetration). */
  mult: number;
}

/**
 * Which bodies a bullet damages, and where (core_mechanics.md §9.3). `bodies` must be ordered by their first
 * hit. Without penetration only the first part counts. With penetration a bullet through a limb counts the core
 * part behind it (head, neck, torso or pelvis), and of several core parts only the first (the "lower-back
 * rule": a torso shot never travels up into a headshot). Simple penetration stops at the first body; full goes
 * on, each further body taking `fullNextBodyMultiplier` of the damage.
 */
export function penetrationChain(combat: CombatData, penetration: ResolvedDamage["penetration"], bodies: BodyEntry[]): BodyHit[] {
  const out: BodyHit[] = [];
  let mult = 1;
  for (const body of bodies) {
    if (body.parts.length === 0) continue;
    let counted = body.parts[0];
    if (penetration !== "none") counted = body.parts.find((p) => CORE.includes(zoneOf(p.part))) ?? counted;
    out.push({ id: body.id, zone: zoneOf(counted.part), t: counted.t, mult });
    if (penetration !== "full") break;
    mult *= combat.penetration.fullNextBodyMultiplier;
    if (!combat.penetration.fullCumulative) mult = combat.penetration.fullNextBodyMultiplier;
  }
  return out;
}

export type BulletOutcome = { kill: true; headshot: boolean } | { kill: false; amount: number; headshot: boolean };

export interface BulletOptions {
  /** Damage left after penetrating earlier bodies (1 for the first). */
  mult?: number;
  /** Friendly-fire scale when the target is a teammate. */
  scale?: number;
  /** The target is Skopós's idle shell: headshots do a multiple instead of killing (skopos.md §3.3). */
  idleShell?: boolean;
}

/** One bullet's (or pellet's) effect on one body part at `distM` meters. */
export function bulletDamage(combat: CombatData, damage: ResolvedDamage, distM: number, zone: Zone, opts: BulletOptions = {}): BulletOutcome {
  let d = falloffAt(damage.falloff, distM);
  const pelletHead = damage.head === "pellet" && (zone === "head" || (zone === "neck" && combat.pellet.neckCountsAsHead));
  const headshot = zone === "head" || zone === "neck";
  if (headshot && opts.idleShell) d *= combat.idleShellHeadMultiplier;
  else if (pelletHead) d *= combat.pellet.headMultiplier;
  else {
    const z = combat.zones[headshot && damage.head === "pellet" ? "torso" : zone];
    if (z === "kill") return { kill: true, headshot };
    d *= z;
  }
  d *= (opts.mult ?? 1) * (opts.scale ?? 1);
  if (d <= 0) return { kill: false, amount: 0, headshot };
  const rounded = combat.rounding === "floor" ? Math.floor(d) : Math.round(d);
  return { kill: false, amount: Math.max(1, rounded), headshot };
}
