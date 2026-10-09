// Reinforcing and barricades (Phase 4 M6; research/destruction.md §6, §8, §9; data/destruction.json
// `reinforcement` and `barricade`): what holding Interact at a panel would do now. The hold itself lives on
// the body (PawnState deploy*, sim.ts), so a client predicts it like a revive; the steel or the planks are a
// panel op the server applies when the hold completes (net/room.ts).
import type { Vec3 } from "../core/math.js";
import { DEG } from "../core/math.js";
import type { DestructionData } from "../data/schemas.js";
import { ticks } from "../weapons/ticks.js";
import { L_STEEL } from "./panel.js";
import type { PanelSet } from "./panels.js";

export const DeployKind = { None: 0, Reinforce: 1, BarricadeUp: 2, BarricadeOff: 3 } as const;

export interface DeployAction {
  kind: number;
  panel: number;
  section: number;
  /** The side the body is on (0: −n, 1: +n): steel goes up on it. */
  side: number;
}

/** Who may reinforce and barricade, and the reinforcements left: the room's rules, sent to every client. */
export interface DeployRules {
  /** Lab rooms let attackers do it too (data/modes `defenderToolsForAll`); otherwise defenders only. */
  anyone: boolean;
  /** Reinforcements left per team (attackers 0, defenders 1). */
  pools: [number, number];
}

/** The defenders' team (sim.ts sideTeam). */
const DEFENDERS = 1;
/** How far beyond its edge a body may stand and still work a wall panel (it reaches over). */
const EDGE_SLACK = 0.3;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Ticks of holding Interact each action takes. */
export function deployTicks(d: DestructionData, kind: number): number {
  return ticks(kind === DeployKind.Reinforce ? d.reinforcement.deploySeconds : kind === DeployKind.BarricadeUp ? d.barricade.deploySeconds : d.barricade.removeSeconds);
}

/**
 * What a body of `team` standing at `feet`, looking from `eye` along unit `dir`, would do by holding
 * Interact: the first panel along the view (nearer than `maxT`, where plain level geometry is) if it is
 * within reach and faced squarely enough (reinforcement.reach and facingDeg): reinforce the section looked
 * at (a hatch only from above, never a section reinforced before or a broken hatch, a damaged section only
 * if the data allows it, and only with a reinforcement left), put a barricade up in an empty or broken
 * frame, or pry a standing one off.
 */
export function deployAction(d: DestructionData, panels: PanelSet, eye: Vec3, dir: Vec3, feet: Vec3, team: number, rules: DeployRules, maxT: number): DeployAction | null {
  if (team !== DEFENDERS && !rules.anyone) return null;
  const r = d.reinforcement;
  const first = panels.crossings(eye, dir, Math.min(maxT, r.reach + 1.5))[0];
  if (!first) return null;
  const { entry, crossing } = first;
  const p = entry.panel;
  const f = entry.frame;
  const rel: Vec3 = [feet[0] - f.center[0], feet[1] - f.center[1], feet[2] - f.center[2]];
  const along = dot(rel, f.n);
  const side = along > 0 ? 1 : 0;
  const offU = Math.max(0, Math.abs(dot(rel, f.u)) - f.w / 2);
  const offV = Math.max(0, Math.abs(dot(rel, f.v)) - f.h / 2);
  if (p.kind === "hatch" || p.kind === "floor") {
    // Standing on it or beside it, above it (a floor's n is up).
    if (Math.hypot(offU, offV) > r.reach || along < f.t / 2 - 0.05) return null;
  } else if (Math.abs(along) - f.t / 2 > r.reach || offU > EDGE_SLACK) return null;
  // Facing it: the view within facingDeg of straight at the face.
  if (dot(dir, f.n) * (side ? -1 : 1) < Math.cos(r.facingDeg * DEG)) return null;
  const index = p.spec.index;
  if (p.layers[L_STEEL] && (p.kind === "wall" || p.kind === "hatch")) {
    if (p.kind === "hatch" && r.hatchFromTopOnly && side !== 1) return null;
    const section = p.kind === "hatch" ? 0 : p.sectionOf(crossing.u);
    if (p.broken || p.reinforcedBefore(section) || (!r.canReinforceDamaged && p.sectionDamaged(section)) || rules.pools[team] <= 0) return null;
    return { kind: DeployKind.Reinforce, panel: index, section, side };
  }
  if (p.kind === "barricade") return { kind: p.empty || p.broken ? DeployKind.BarricadeUp : DeployKind.BarricadeOff, panel: index, section: 0, side };
  return null;
}
