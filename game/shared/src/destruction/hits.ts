// What a bullet or the knife does to the panels in its way (Phase 4 M4; research/destruction.md §3–§4,
// data/destruction.json). A bullet passes the material it can break, making a hole in each layer, and stops
// at what it can't: steel, metal supports, and wooden studs its tier doesn't cut (wallbang.uncutStudsStop).
// It goes into at most wallbang.maxSurfaces panels; the next one stops it. Hatches, barricades and glass
// also wear down. Nothing is applied here: the ops come back, each with where along the ray it happens, for
// the room to apply at the end of the tick (and to drop if a body stopped the bullet first).
import type { Vec3 } from "../core/math.js";
import type { DestructionData } from "../data/schemas.js";
import type { PanelHistory } from "./history.js";
import { L_CORE, L_STEEL, type PanelOp } from "./panel.js";
import type { PanelEntry, PanelSet } from "./panels.js";
import { panelCrossings, type LayerCrossing } from "./world.js";

/** How a bullet or a blade treats panels (a weapon's tier rule, or data/destruction.json `melee`). */
export interface PanelHitRule {
  holeDiameterM: number;
  studs: boolean;
  /** Studs only this close to where it came from (buckshot). */
  studsWithinM?: number;
  hatchDamage: number;
  barricadeDamage: number;
}

export interface PanelOpAt {
  /** Metres along the ray. */
  t: number;
  panel: number;
  op: PanelOp;
}

export interface PanelPassage {
  /** Where the panels stopped it (metres along the ray), or null. */
  stop: number | null;
  /** Where it met material in each panel it went through, in order: damage past each is multiplied down. */
  enters: number[];
  ops: PanelOpAt[];
}

/** The panels as some client had them: every change after `tick` undone (destruction/history.ts). */
export interface PanelView {
  tick: number;
  history: PanelHistory;
}

function solidAs(e: PanelEntry, c: LayerCrossing, view: PanelView | undefined): boolean {
  const p = e.panel;
  if (!view || !view.history.changedSince(p.spec.index, view.tick)) return c.solid;
  return view.history.solidAt(p.spec.index, c.layer, c.v * p.w + c.u, p.w * p.h, view.tick, c.solid);
}

/** A disc of `diameterM` around the crossing, in quarter cells. */
function disc(c: LayerCrossing, diameterM: number, cellM: number, hard = false): PanelOp {
  return { kind: "cut", layer: c.layer, shape: { kind: "disc", u4: c.u4, v4: c.v4, r4: Math.round((2 * diameterM) / cellM) }, hard };
}

const cutsStuds = (rule: PanelHitRule, t: number) => rule.studs && (rule.studsWithinM === undefined || t <= rule.studsWithinM);

/** Hit points a hit takes off a breakable panel (glass breaks at any). */
function wear(e: PanelEntry, rule: PanelHitRule): number {
  const kind = e.panel.kind;
  return kind === "hatch" ? rule.hatchDamage : kind === "barricade" ? rule.barricadeDamage : kind === "glass" ? 1 : 0;
}

/**
 * A bullet from `origin` along unit `dir` through the panels, up to `maxT` (where plain level geometry
 * stops it), as the shooter's client had them (`view`).
 */
export function bulletThroughPanels(panels: PanelSet, d: DestructionData, rule: PanelHitRule, origin: Vec3, dir: Vec3, maxT: number, view?: PanelView): PanelPassage {
  const out: PanelPassage = { stop: null, enters: [], ops: [] };
  let current: PanelEntry | null = null;
  let last = false;
  for (const { entry, crossing: c } of panels.crossings(origin, dir, maxT)) {
    if (!solidAs(entry, c, view)) continue;
    const index = entry.panel.spec.index;
    if (entry !== current) {
      current = entry;
      // One wall too many: this one stops it, where it hits.
      if (out.enters.length >= d.wallbang.maxSurfaces) last = true;
      else out.enters.push(c.face);
      const w = wear(entry, rule);
      if (w > 0) out.ops.push({ t: c.face, panel: index, op: { kind: "damage", amount: w, hard: false } });
    }
    const core = c.layer === L_CORE;
    if (c.layer === L_STEEL || (core && (entry.panel.coreMetal || (!cutsStuds(rule, c.t) && d.wallbang.uncutStudsStop)))) {
      out.stop = c.face;
      break;
    }
    if (entry.panel.kind !== "glass" && (!core || cutsStuds(rule, c.t))) out.ops.push({ t: c.t, panel: index, op: disc(c, rule.holeDiameterM, d.cellM) });
    if (last) {
      out.stop = c.face;
      break;
    }
  }
  return out;
}

/**
 * The knife (data/destruction.json `melee`) against the first panel material within `reach` along the view,
 * nearer than `maxT` (plain level geometry): a round hole in the skin it hits, and in the far skin too with
 * melee.bothSkins; a stud, metal or steel stops the blade. Wear on a hatch or barricade. Null if it reaches
 * no panel.
 */
export function meleeOnPanels(panels: PanelSet, d: DestructionData, origin: Vec3, dir: Vec3, reach: number, maxT: number, view?: PanelView): PanelPassage | null {
  const rule = d.melee;
  let hit: { entry: PanelEntry; crossing: LayerCrossing } | null = null;
  for (const h of panels.crossings(origin, dir, Math.min(reach, maxT))) {
    if (solidAs(h.entry, h.crossing, view)) {
      hit = h;
      break;
    }
  }
  if (!hit) return null;
  const { entry } = hit;
  const index = entry.panel.spec.index;
  const out: PanelPassage = { stop: hit.crossing.face, enters: [hit.crossing.face], ops: [] };
  const w = wear(entry, rule);
  if (w > 0) out.ops.push({ t: hit.crossing.face, panel: index, op: { kind: "damage", amount: w, hard: false } });
  let skins = 0;
  for (const c of panelCrossings(entry.panel, entry.frame, origin, dir, Infinity)) {
    if (c.t < hit.crossing.t || !solidAs(entry, c, view)) continue;
    if (c.layer === L_STEEL || (c.layer === L_CORE && !(rule.studs && !entry.panel.coreMetal))) break;
    if (entry.panel.kind !== "glass") out.ops.push({ t: c.t, panel: index, op: disc(c, rule.holeDiameterM, d.cellM) });
    if (c.layer !== L_CORE && ++skins >= (rule.bothSkins ? 2 : 1)) break;
  }
  return out;
}
