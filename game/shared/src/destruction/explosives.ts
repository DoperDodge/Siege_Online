// The Destruction Lab's explosive tools (Phase 4 M7; research/destruction.md §4, data/destruction.json
// `explosives`): each cuts its shape (a rectangle for charges, a disc for grenades and the Remote Charge, an X for Rivet's
// Cross) out of the first panel along the view, centred where the view meets it. Only the shapes: placing, throwing,
// fuses and damage to players come with the gadgets (Phase 8).
import type { Vec3 } from "../core/math.js";
import type { DestructionData, ExplosiveData } from "../data/schemas.js";
import { L_BACK, L_CORE, L_FRONT, L_STEEL, type CutShape } from "./panel.js";
import type { IndexedOp, PanelSet } from "./panels.js";

/** How far the lab places each kind (lab conveniences): a charge on a panel you stand at, a throw up to 20 m. */
export const explosiveReach = (ex: ExplosiveData) => (ex.shape === "rect" ? 2 : 20);

/**
 * The ops one explosive makes on the first panel along `dir` from `origin`, nearer than `maxT` (plain level
 * geometry): its shape out of both skins and, if it cuts studs, the wooden core (metal never goes); out of
 * steel only if it is a hard charge, and nothing at all where the view meets a reinforced section otherwise
 * (an unbreakable surface to it). A hatch takes the explosive's damage (its reinforced-hatch damage, hard,
 * once reinforced); a barricade or window breaks. Empty if the view meets no panel within reach.
 */
export function explosiveOps(panels: PanelSet, d: DestructionData, ex: ExplosiveData, origin: Vec3, dir: Vec3, maxT: number): IndexedOp[] {
  const first = panels.crossings(origin, dir, Math.min(maxT, explosiveReach(ex)))[0];
  if (!first) return [];
  const { entry, crossing: c } = first;
  const p = entry.panel;
  const panel = p.spec.index;
  if (p.kind === "barricade" || p.kind === "glass") return [{ panel, op: { kind: "damage", amount: Math.max(1, p.hp), hard: false } }];
  if (p.kind === "hatch") {
    const reinforced = p.reinforced !== 0;
    return [{ panel, op: { kind: "damage", amount: reinforced ? ex.reinforcedHatchDamage : ex.hatchDamage, hard: reinforced } }];
  }
  if (!ex.hard && p.reinforced & (1 << p.sectionOf(c.u))) return [];
  const shapes: CutShape[] = [];
  if (ex.shape === "disc") shapes.push({ kind: "disc", u4: c.u4, v4: c.v4, r4: Math.round((2 * ex.diameterM) / d.cellM) });
  else if (ex.shape === "cross") {
    // Rivet's Cross (R3), centred on the point: its round middle, and its two arms corner to corner (quarter cells).
    const hu = Math.round(((ex.spanM / 2) * 4) / p.cellU);
    const hv = Math.round(((ex.spanM / 2) * 4) / p.cellV);
    const r4 = Math.round((2 * ex.armM) / d.cellM);
    shapes.push({ kind: "disc", u4: c.u4, v4: c.v4, r4: Math.round((2 * ex.hubM) / d.cellM) });
    shapes.push({ kind: "line", u4a: c.u4 - hu, v4a: c.v4 - hv, u4b: c.u4 + hu, v4b: c.v4 + hv, r4 });
    shapes.push({ kind: "line", u4a: c.u4 - hu, v4a: c.v4 + hv, u4b: c.u4 + hu, v4b: c.v4 - hv, r4 });
  } else {
    // Centred on the point, in whole cells.
    const uM = c.u4 / 4;
    const vM = c.v4 / 4;
    const hw = ex.wM / 2 / p.cellU;
    const hh = ex.hM / 2 / p.cellV;
    shapes.push({ kind: "rect", u0: Math.round(uM - hw), v0: Math.round(vM - hh), u1: Math.round(uM + hw), v1: Math.round(vM + hh) });
  }
  const layers = [L_FRONT, L_BACK, ...(ex.studs ? [L_CORE] : []), ...(ex.hard ? [L_STEEL] : [])];
  return layers.filter((l) => p.layers[l]).flatMap((layer) => shapes.map((shape) => ({ panel, op: { kind: "cut", layer, shape, hard: ex.hard } }) as IndexedOp));
}
