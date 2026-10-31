// Pulse's Cardiac Sensor (Phase 8 M6; research/operators/pulse.md; data/gadgets/cardiac_sensor.json `sensor`): held
// up (out of his slot 2, ready), it shows him the other side's heartbeats: living bodies, downed ones too (ours), within
// `rangeM` of his eye through anything, within `fanDeg` of his facing across the floor. Not drones, not his own side
// (Skopós's shells are defenders). An EMP on him (DSEG) freezes it: nothing new while it lasts (his client keeps what
// it showed). Only he sees them; a ping while it's up shares the one nearest his crosshair (Sim.ping).
import { DEG, forwardXZ, type Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import type { GadgetData } from "../data/schemas.js";
import { eyePose } from "../player/hitboxes.js";
import type { Pawn } from "../player/pawn.js";
import { currentHeight } from "../player/stance.js";
import { GadgetAct, Hand, PawnKind, PawnMode } from "../player/types.js";
import type { Sim } from "../sim.js";
import { slotGadget } from "./hands.js";

export type SensorData = NonNullable<GadgetData["sensor"]>;

/** The sensor a body holds up now (out of its slot 2 and ready), or null. */
export function sensorUp(data: GameData, pawn: Pawn): SensorData | null {
  const s = pawn.state;
  if (pawn.kind !== PawnKind.Body || s.hand !== Hand.Ability || s.gAct === GadgetAct.Equip || s.mode === PawnMode.Dead || s.mode === PawnMode.Held) return null;
  return slotGadget(data, pawn.loadout, 2)?.sensor ?? null;
}

/** Where a body's heart is: at its chest, part way up its height in its stance. */
export function heartOf(sim: Sim, p: Pawn): Vec3 {
  const s = p.state;
  return [s.x, s.y + currentHeight(sim.data.movement, s) * 0.6, s.z];
}

/** The heartbeats a body's sensor shows it now, nearest first (none while it isn't up, or while an EMP has the body). */
export function heartbeats(sim: Sim, pawn: Pawn): Pawn[] {
  const k = sensorUp(sim.data, pawn);
  if (!k || pawn.state.jammed > 0) return [];
  const eye = eyePose(sim.data.movement, sim.data.hitboxes, pawn.state).pos;
  const [fx, fz] = forwardXZ(pawn.state.yaw);
  const half = Math.cos((k.fanDeg / 2) * DEG);
  const out: { p: Pawn; d: number }[] = [];
  for (const p of sim.pawns.values()) {
    if (p.kind !== PawnKind.Body || p.team === pawn.team || p.state.mode === PawnMode.Dead || p.state.mode === PawnMode.Held) continue;
    const h = heartOf(sim, p);
    const v = [h[0] - eye[0], h[1] - eye[1], h[2] - eye[2]];
    const d = Math.hypot(v[0], v[1], v[2]);
    if (d > k.rangeM) continue;
    const across = Math.hypot(v[0], v[2]);
    if (k.fanDeg < 360 && across > 0.3 && (v[0] * fx + v[2] * fz) / across < half) continue;
    out.push({ p, d });
  }
  return out.sort((a, b) => a.d - b.d).map((x) => x.p);
}
