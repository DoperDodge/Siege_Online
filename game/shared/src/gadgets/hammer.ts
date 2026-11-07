// Sledge's breaching hammer on the level (Phase 8 M4; research/operators/sledge.md §3; data/gadgets/breaching_hammer.json
// `use`): what one blow does to the first material along the view within its reach. A soft wall or floor gets a
// rectangle `holeM` (width × height) round where the blow lands, through both faces and the wooden studs when the eye
// is within `bothSkinsM` of it across the floor (a wall stood close to, a floor hammered from above; metal studs and
// joists stay: a floor is only ever see-through), only the face it meets further away. A barricade, a window or an
// unreinforced hatch breaks; steel takes nothing (the swing is still spent). The room judges bodies and gadgets first
// (net/room.ts).
import type { Vec3 } from "../core/math.js";
import type { GadgetData } from "../data/schemas.js";
import { L_BACK, L_CORE, L_FRONT, L_STEEL, type CutShape } from "../destruction/panel.js";
import type { IndexedOp, PanelSet } from "../destruction/panels.js";

export type SwingUse = Extract<GadgetData["use"], { kind: "swing" }>;

/** The panel ops of a blow from `origin` along unit `dir`, the level clear for `maxT` (its reach, or less). */
export function hammerOps(panels: PanelSet, origin: Vec3, dir: Vec3, maxT: number, u: SwingUse): IndexedOp[] {
  const first = panels.crossings(origin, dir, maxT).find((x) => x.crossing.solid);
  if (!first) return [];
  const { entry, crossing: c } = first;
  const p = entry.panel;
  const panel = p.spec.index;
  if (p.kind === "barricade" || p.kind === "glass" || p.kind === "hatch") {
    if (p.broken || p.empty || p.reinforced !== 0) return [];
    return [{ panel, op: { kind: "damage", amount: Math.max(1, p.hp), hard: false } }];
  }
  if (c.layer === L_STEEL || p.reinforced & (1 << p.sectionOf(c.u))) return [];
  const hw = u.holeM[0] / 2 / p.cellU;
  const hh = u.holeM[1] / 2 / p.cellV;
  const uM = c.u4 / 4;
  const vM = c.v4 / 4;
  const shape: CutShape = { kind: "rect", u0: Math.round(uM - hw), v0: Math.round(vM - hh), u1: Math.round(uM + hw), v1: Math.round(vM + hh) };
  const across = Math.hypot(dir[0], dir[2]) * c.face;
  const layers = across <= u.bothSkinsM ? [L_FRONT, L_BACK, L_CORE] : [c.layer];
  return layers.filter((l) => p.layers[l]).map((layer) => ({ panel, op: { kind: "cut", layer, shape, hard: false } }));
}
