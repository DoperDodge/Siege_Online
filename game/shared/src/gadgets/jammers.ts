// Mute's Signal Disruptors (Phase 8 M6; research/operators/mute.md; gadgets/DESIGN.md §6): a jammer standing in the
// gadget table (not in the air, not disabled by an EMP) jams the other side's wireless signals within its
// `jammer.radiusM`, a sphere (through floors): a remote device of theirs can't be set off while it, or its owner's
// body, is inside one (Y10S4: "signals coming in or out of the radius"), and a drone of theirs inside one loses its
// driver; inside `warnM` a drone's feed shows static. Deterministic on the table and the pawns' states, so the
// simulation predicts it like the rest. Automated devices, grenades, optics and a jammer's own side's devices don't
// mind it, nor does a device already set off (it isn't waiting for a signal any more).
import type { Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import type { GadgetData } from "../data/schemas.js";
import type { Pawn } from "../player/pawn.js";
import { PawnMode } from "../player/types.js";
import type { Sim } from "../sim.js";
import { pawnDistance } from "./blast.js";
import { kindId } from "./kinds.js";
import { GFlag, type Gadget, type GadgetTable } from "./table.js";

export type JammerData = NonNullable<GadgetData["jammer"]>;

const cache = new WeakMap<GadgetTable, { version: number; list: { g: Gadget; j: JammerData }[] }>();

/** The table's working jammers (placed, not disabled by an EMP), with their data. */
export function jammersOf(data: GameData, table: GadgetTable): readonly { g: Gadget; j: JammerData }[] {
  const hit = cache.get(table);
  if (hit && hit.version === table.version) return hit.list;
  const list: { g: Gadget; j: JammerData }[] = [];
  for (const g of table.list) {
    if (g.flags & (GFlag.Flying | GFlag.Off)) continue;
    const j = data.gadgets.get(kindId(g.kind) ?? "")?.jammer;
    if (j) list.push({ g, j });
  }
  cache.set(table, { version: table.version, list });
  return list;
}

/** Whether a point (a remote device of `team`'s) is inside a working jammer of the other side. */
export function pointJammed(sim: Pick<Sim, "data" | "gadgets">, team: number, p: Vec3): boolean {
  for (const { g, j } of jammersOf(sim.data, sim.gadgets)) {
    if (g.team === team) continue;
    if (Math.hypot(p[0] - g.pos[0], p[1] - g.pos[1], p[2] - g.pos[2]) <= j.radiusM) return true;
  }
  return false;
}

/**
 * Whether a pawn (a body pressing a detonator, a drone) is inside a working jammer of the other side, by its nearest
 * hitbox point (`warn`: inside its warning radius instead).
 */
export function pawnJammed(sim: Sim, pawn: Pawn, warn = false): boolean {
  if (pawn.state.mode === PawnMode.Dead || pawn.state.mode === PawnMode.Held) return false;
  for (const { g, j } of jammersOf(sim.data, sim.gadgets)) {
    if (g.team === pawn.team) continue;
    const r = warn ? j.warnM : j.radiusM;
    // Far beyond its reach whatever its hitboxes (they're within 2 m of its feet): no need to look closer.
    const s = pawn.state;
    if (Math.hypot(s.x - g.pos[0], s.y - g.pos[1], s.z - g.pos[2]) > r + 2.5) continue;
    if (pawnDistance(sim, pawn, g.pos) <= r) return true;
  }
  return false;
}
