// Brava's Kludge drone (Phase 8 M8; research/operators/brava.md §3–4; data/gadgets/kludge_drone.json `kludge`): what
// a Kludge its owner drives can start hacking, and where a hack's target is while it runs. A target is the other
// side's device nearest the Kludge's crosshair within `coneDeg` and `rangeM`, in sight (the level, solid gadgets and
// what the room's `blocked` says: smoke, the other side's observation blockers): a gadget whose data says how a hack
// takes it (`hack`), a default camera of theirs, or Skopós's idle shell. The room runs the hack (net/room.ts).
import { DEG, type Vec3 } from "../core/math.js";
import { isIdleShell } from "../combat/apply.js";
import type { GameData } from "../data/load.js";
import type { GadgetData } from "../data/schemas.js";
import type { Pawn } from "../player/pawn.js";
import { PawnKind, PawnMode } from "../player/types.js";
import type { Sim } from "../sim.js";
import { abilityItem } from "../weapons/loadout.js";
import { kindId } from "./kinds.js";
import { sightPast } from "./mirror.js";
import { heartOf } from "./sensor.js";
import { GFlag } from "./table.js";

export type KludgeData = NonNullable<GadgetData["kludge"]>;

/** What a Kludge can hack: a gadget table entry, a default camera (by its place in the level's list), Skopós's idle shell. */
export type HackTarget = { kind: "gadget"; id: number } | { kind: "camera"; index: number } | { kind: "shell"; pawnId: number };

/** A Kludge drone's data (its operator's ability item), or null for any other pawn. */
export function kludgeOf(data: GameData, pawn: Pawn): KludgeData | null {
  if (pawn.kind !== PawnKind.Drone || !pawn.kludge) return null;
  const id = abilityItem(data, pawn.operatorId);
  return (id && data.gadgets.get(id)?.kludge) || null;
}

/** Where a hack's target is now, or null when it's gone or no longer the other side's (`team`: the hacker's). */
export function hackTargetPos(sim: Sim, t: HackTarget, team: number): Vec3 | null {
  if (t.kind === "gadget") {
    const g = sim.gadgets.get(t.id);
    return g && g.team !== team && !(g.flags & (GFlag.Flying | GFlag.Broken)) ? g.pos : null;
  }
  if (t.kind === "camera") {
    const cam = sim.level.def.cameras[t.index];
    return cam && sim.camTeam(t.index) !== team && sim.camWorks(t.index) ? cam.pos : null;
  }
  const p = sim.pawns.get(t.pawnId);
  return p && p.team !== team && p.state.mode !== PawnMode.Dead && isIdleShell(sim, p) ? heartOf(sim, p) : null;
}

/**
 * The target a Kludge driven from `view` can start hacking now: the other side's device nearest its crosshair, or null.
 * `blocked`: whether something the room knows of hides a point from it (smoke, the other side's observation blocker).
 */
export function hackTargetFor(
  sim: Sim,
  kludge: Pawn,
  k: KludgeData,
  view: { pos: Vec3; yaw: number; pitch: number },
  blocked: (from: Vec3, to: Vec3) => boolean,
): HackTarget | null {
  const team = kludge.team;
  const candidates: HackTarget[] = [];
  for (const g of sim.gadgets.list) if (sim.data.gadgets.get(kindId(g.kind) ?? "")?.hack) candidates.push({ kind: "gadget", id: g.id });
  if (sim.matchRules.cameras) sim.level.def.cameras.forEach((_, index) => candidates.push({ kind: "camera", index }));
  for (const p of sim.pawns.values()) if (p.kind === PawnKind.Body) candidates.push({ kind: "shell", pawnId: p.id });
  const cp = Math.cos(view.pitch);
  const look: Vec3 = [-Math.sin(view.yaw) * cp, Math.sin(view.pitch), -Math.cos(view.yaw) * cp];
  const cone = Math.cos(k.coneDeg * DEG);
  let best: { t: HackTarget; cos: number } | null = null;
  for (const t of candidates) {
    const at = hackTargetPos(sim, t, team);
    if (!at) continue;
    const d: Vec3 = [at[0] - view.pos[0], at[1] - view.pos[1], at[2] - view.pos[2]];
    const dist = Math.hypot(d[0], d[1], d[2]);
    if (dist > k.rangeM || dist < 1e-3) continue;
    const dir: Vec3 = [d[0] / dist, d[1] / dist, d[2] / dist];
    const cos = dir[0] * look[0] + dir[1] * look[1] + dir[2] * look[2];
    if (cos < cone || (best && cos <= best.cos)) continue;
    const wall = sightPast(sim, view.pos, dir, dist);
    if ((wall && wall.t < dist - 0.15) || blocked(view.pos, at)) continue;
    best = { t, cos };
  }
  return best?.t ?? null;
}
