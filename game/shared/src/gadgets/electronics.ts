// Electronics (Phase 8 M3, gadgets/DESIGN.md §6): an EMP's DSEG. An Impact EMP grenade or a Bulletproof Camera's dart
// disables the other side's electronics within its radius, through walls (ours): gadgets whose data says
// `electronic` (and the metal detector) until a tick (GFlag.Off: no feed, trigger, laser, alarm or barrier), bodies
// and drones for a while (PawnState.jammed: a body can't use its sights' optics, cameras or drones, or set its
// devices off; a drone doesn't move), and default cameras (the defenders': their feeds go to static). Mechanical
// gadgets never mind it; applying it again refreshes it. This finds what an EMP reaches; the room applies it.
import type { Vec3 } from "../core/math.js";
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
