// Latch's Snare Latches (Project Redmond R3, gadgets/R3_OPERATORS.md §2; data/gadgets/snare_latch.json `snare`). The
// simulation keeps what a snared body predicts (slowed, no sprint: sim.ts slowOf; pulling it off is an Interact hold,
// sim.ts holdSnare); the server springs a latch whose wire an enemy body crosses and bites the snared (gadgets/serve.ts
// snap, snares); the room tells the snared body's owner and shows him to the other side (net/room.ts).
import { forwardXZ, type Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import type { GadgetData } from "../data/schemas.js";
import type { PanelEntry, PanelSet } from "../destruction/panels.js";
import { raycastLevel, type LevelQuery } from "../level/raycast.js";
import type { Pawn } from "../player/pawn.js";
import type { Gadget } from "./table.js";

export type SnareData = NonNullable<GadgetData["snare"]>;

/** The snare's numbers (the gadget that has them: the Snare Latch), or null in data without it. */
export function snareData(data: GameData): SnareData | null {
  for (const g of data.gadgets.values()) if (g.snare) return g.snare;
  return null;
}

/** What a snared body's speed is multiplied by now (1: not snared). */
export function snareSlow(data: GameData, pawn: Pawn): number {
  if (!pawn.state.snared) return 1;
  return snareData(data)?.speedMul ?? 1;
}

/**
 * The door's or window's opening a latch is at the side of (its barricade's or glass's panel), or null: the nearest
 * whose width (and a little more) takes in the latch, at its height, through it within 0.25 m.
 */
export function frameOf(panels: PanelSet, pos: Vec3): PanelEntry | null {
  let best: PanelEntry | null = null;
  let bestN = Infinity;
  for (const e of panels.list) {
    const k = e.panel.kind;
    if (k !== "barricade" && k !== "glass") continue;
    const f = e.frame;
    const rel = [pos[0] - f.center[0], pos[1] - f.center[1], pos[2] - f.center[2]];
    const u = Math.abs(rel[0] * f.u[0] + rel[1] * f.u[1] + rel[2] * f.u[2]);
    const v = rel[0] * f.v[0] + rel[1] * f.v[1] + rel[2] * f.v[2];
    const n = Math.abs(rel[0] * f.n[0] + rel[1] * f.n[1] + rel[2] * f.n[2]);
    if (u > f.w / 2 + 0.05 || v < -f.h / 2 - 0.1 || v > f.h / 2 || n > f.t / 2 + 0.25 || n >= bestN) continue;
    best = e;
    bestN = n;
  }
  return best;
}

/**
 * How far a latch's wire runs (R3): straight out of it across its opening to the far jamb (its frame's width from the
 * latch), or `tripwire.lengthM` when it's at none; stopped sooner by what stops sight.
 */
export function wireLength(q: LevelQuery, g: Gadget, d: GadgetData): number {
  const max = d.tripwire?.lengthM ?? 0;
  const [fx, fz] = forwardXZ(g.yaw);
  const sight = raycastLevel(q, g.pos, [fx, 0, fz], max)?.t ?? max;
  const f = frameOf(q.level.panels, g.pos)?.frame;
  if (!f) return sight;
  const u = Math.abs((g.pos[0] - f.center[0]) * f.u[0] + (g.pos[2] - f.center[2]) * f.u[2]);
  return Math.min(sight, u + f.w / 2);
}
