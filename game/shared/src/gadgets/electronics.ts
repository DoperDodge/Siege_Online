// Electronics (Phase 8 M3, gadgets/DESIGN.md §6): an EMP's DSEG. An Impact EMP grenade or a Armoured Camera's dart
// disables the other side's electronics within its radius, through walls (ours): gadgets whose data says
// `electronic` (and the metal detector) until a tick (GFlag.Off: no feed, trigger, laser, alarm or barrier), bodies
// and drones for a while (PawnState.jammed: a body can't use its sights' optics, cameras or drones, or set its
// devices off; a drone doesn't move), and default cameras (the defenders': their feeds go to static). Mechanical
// gadgets never mind it; applying it again refreshes it. This finds what an EMP reaches; the room applies it.
import type { Vec3 } from "../core/math.js";
import { raycastLevel } from "../level/raycast.js";
import { PawnMode } from "../player/types.js";
import type { Pawn } from "../player/pawn.js";
import type { Sim } from "../sim.js";
import { pawnDistance } from "./blast.js";
import { isIngredient, kindId, kindOf } from "./kinds.js";
import { GFlag, type Gadget } from "./table.js";
import { DEFENSE } from "../match/rules.js";

const KIND_DETECTOR = kindOf("metal_detector");

/** Whether an EMP disables this entry (an electronic gadget, the metal detector). */
export function isElectronic(sim: Sim, g: Gadget): boolean {
  if (isIngredient(g.kind)) return g.kind === KIND_DETECTOR;
  return sim.data.gadgets.get(kindId(g.kind) ?? "")?.electronic ?? false;
}

/** What an EMP of `team`'s going off at `at` reaches within `radiusM`: entries, bodies and drones, default cameras (bits). */
export function empReach(sim: Sim, team: number, at: Vec3, radiusM: number): { gadgets: Gadget[]; pawns: Pawn[]; cams: number } {
  const near = (p: readonly number[]) => Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]) <= radiusM;
  const gadgets = sim.gadgets.list.filter((g) => g.team !== team && !(g.flags & (GFlag.Flying | GFlag.Broken)) && isElectronic(sim, g) && near(g.pos));
  const pawns = [...sim.pawns.values()].filter(
    (p) => p.team !== team && p.state.mode !== PawnMode.Dead && p.state.mode !== PawnMode.Held && !p.proxy && pawnDistance(sim, p, at) <= radiusM,
  );
  let cams = 0;
  if (team !== DEFENSE) sim.level.def.cameras.forEach((c, i) => void (i < 32 && near(c.pos) && (cams |= 1 << i)));
  return { gadgets, pawns, cams };
}

/**
 * What Ohm's scope marks (R3, gadgets/R3_OPERATORS.md §2): every device of the other side's that an EMP would turn
 * off, within `rangeM` of `from`, through anything: electronic entries in the table (not in the air, not broken) and,
 * for an attacker, the level's cameras still standing. Where each is, nearest first.
 */
export function empTargets(sim: Sim, team: number, from: Vec3, rangeM: number): Vec3[] {
  const d = (p: readonly number[]) => Math.hypot(p[0] - from[0], p[1] - from[1], p[2] - from[2]);
  const out: Vec3[] = [];
  for (const g of sim.gadgets.list) if (g.team !== team && !(g.flags & (GFlag.Flying | GFlag.Broken)) && isElectronic(sim, g) && d(g.pos) <= rangeM) out.push([g.pos[0], g.pos[1], g.pos[2]]);
  if (team !== DEFENSE && sim.matchRules.cameras)
    sim.level.def.cameras.forEach((c, i) => void (i < 32 && !(sim.matchRules.camsBroken & (1 << i)) && d(c.pos) <= rangeM && out.push([c.pos[0], c.pos[1], c.pos[2]])));
  return out.sort((a, b) => d(a) - d(b));
}

/**
 * Where a round shot from `origin` along unit `dir` stops against the level (its walls, floors, panels and props), just
 * short of it, within `rangeM`; null if nothing's in range. (The room's judge adds bodies and shields, rewound; an
 * offline page has only this.)
 */
export function roundStop(sim: Sim, origin: Vec3, dir: Vec3, rangeM: number): Vec3 | null {
  const hit = raycastLevel(sim, origin, dir, rangeM);
  if (!hit) return null;
  const t = Math.max(0, hit.t - 0.05);
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
}
