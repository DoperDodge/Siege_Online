// Where a placed gadget goes (Phase 8, gadgets/DESIGN.md §2; the Bulletproof Camera's rule from Phase 7 made general):
// on the first surface along the view within the gadget's reach, if its data allows that surface. On a floor it
// stands facing the placer's way; on a wall it faces out of it. A charge placed on a breakable floor or hatch lies
// flat on it.
import type { Vec3 } from "../core/math.js";
import type { GadgetData, PlaceOn } from "../data/schemas.js";
import type { Panel } from "../destruction/panel.js";
import type { PanelHit } from "../destruction/panels.js";
import { raycastLevel, type LevelQuery } from "../level/raycast.js";
import { FLOOR_NY } from "./flight.js";

/** A surface steeper than a floor and no steeper than this is a wall (its normal's height, either way). */
export const WALL_NY = 0.3;

export interface PlaceSpot {
  /** The gadget's box centre, and the way it faces. */
  pos: Vec3;
  yaw: number;
  /** On a floor (standing, or lying flat when `flat`); else on a wall. */
  onFloor: boolean;
  flat: boolean;
  /** The panel it's on (its index), or −1. */
  panel: number;
}

export type PlaceData = GadgetData & { use: Extract<GadgetData["use"], { kind: "place" }> };

export const isPlaced = (g: GadgetData): g is PlaceData => g.use.kind === "place";

/** Whether the panel has steel where the view met it (a wall's section there, or a hatch). */
function steelAt(p: Panel, hit: PanelHit): boolean {
  if (p.kind === "hatch") return p.reinforced !== 0;
  return p.kind === "wall" && (p.reinforced & (1 << p.sectionOf(hit.crossing.u))) !== 0;
}

/** Whether a gadget that goes on `on` may go where the view met the level. */
function allowed(on: readonly PlaceOn[], floor: boolean, hit: PanelHit | null): boolean {
  const p = hit?.entry.panel;
  const breakable = p !== undefined && !p.broken && (p.kind === "wall" || p.kind === "floor" || p.kind === "hatch" || (p.kind === "barricade" && !p.empty));
  return on.some((o) => {
    if (o === "floor") return floor;
    if (o === "wall") return !floor;
    if (!breakable || !hit) return false;
    return o === "steel" ? steelAt(p, hit) : !steelAt(p, hit);
  });
}

/**
 * Where holding Fire would put this gadget, the view from `eye` along unit `dir` (`yaw` the placer's): null when the
 * view meets nothing within reach, a ceiling, a slope, or a surface the gadget can't go on.
 */
export function placeSpot(q: LevelQuery, g: PlaceData, eye: Vec3, dir: Vec3, yaw: number): PlaceSpot | null {
  const hit = raycastLevel(q, eye, dir, g.use.reachM);
  if (!hit) return null;
  const at: Vec3 = [eye[0] + dir[0] * hit.t, eye[1] + dir[1] * hit.t, eye[2] + dir[2] * hit.t];
  const [nx, ny, nz] = hit.normal;
  const floor = ny >= FLOOR_NY;
  if (!floor && Math.abs(ny) > WALL_NY) return null;
  if (!allowed(g.use.on, floor, hit.panel)) return null;
  const panel = hit.panel ? hit.panel.entry.panel.spec.index : -1;
  const [w, h, d] = g.sizeM;
  void w;
  if (floor) {
    // A gadget meant for floors stands on one; a charge on a breakable floor lies on it.
    const flat = !g.use.on.includes("floor");
    return { pos: [at[0], at[1] + (flat ? d : h) / 2, at[2]], yaw, onFloor: true, flat, panel };
  }
  const len = Math.hypot(nx, nz);
  const out = d / 2 / len;
  return { pos: [at[0] + nx * out, at[1], at[2] + nz * out], yaw: Math.atan2(-nx, -nz), onFloor: false, flat: false, panel };
}
