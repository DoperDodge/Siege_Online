// Where a placed gadget goes (Phase 8, gadgets/DESIGN.md §2; the Bulletproof Camera's rule from Phase 7 made general):
// on the first surface along the view within the gadget's reach, if its data allows that surface. On a floor it
// stands facing the placer's way; on a wall it faces out of it. A charge placed on a breakable floor or hatch lies
// flat on it. Fuze's Cluster Charge also goes on a deployable shield's face (M5).
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

/** Whether a gadget that goes on `on` may go where the view met the level (`shield`: on a solid gadget's face). */
function allowed(on: readonly PlaceOn[], floor: boolean, hit: PanelHit | null, shield: boolean): boolean {
  const p = hit?.entry.panel;
  const breakable = p !== undefined && !p.broken && (p.kind === "wall" || p.kind === "floor" || p.kind === "hatch" || (p.kind === "barricade" && !p.empty));
  return on.some((o) => {
    if (o === "floor") return floor;
    if (o === "wall") return !floor;
    if (o === "shield") return shield && !floor;
    if (!breakable || !hit) return false;
    return o === "steel" ? steelAt(p, hit) : !steelAt(p, hit);
  });
}

/** A level query that also knows the gadget table's solid gadgets (a deployable shield: the Sim's). */
export interface PlaceQuery extends LevelQuery {
  /** How far along a ray the first solid gadget's box is (within `maxT`), or null. */
  solidOnRay?(origin: Vec3, dir: Vec3, maxT: number): number | null;
}

/**
 * Where holding Fire would put this gadget, the view from `eye` along unit `dir` (`yaw` the placer's): null when the
 * view meets nothing within reach, a ceiling, a slope, or a surface the gadget can't go on.
 */
export function placeSpot(q: PlaceQuery, g: PlaceData, eye: Vec3, dir: Vec3, yaw: number): PlaceSpot | null {
  const hit = raycastLevel(q, eye, dir, g.use.reachM);
  if (!hit) return null;
  const at: Vec3 = [eye[0] + dir[0] * hit.t, eye[1] + dir[1] * hit.t, eye[2] + dir[2] * hit.t];
  const [nx, ny, nz] = hit.normal;
  const floor = ny >= FLOOR_NY;
  if (!floor && Math.abs(ny) > WALL_NY) return null;
  // The view met a solid gadget (sight stops at a deployable shield) where it met anything.
  const solid = !hit.panel && g.use.on.includes("shield") ? q.solidOnRay?.(eye, dir, hit.t + 0.05) : null;
  const shield = solid !== null && solid !== undefined && Math.abs(solid - hit.t) < 0.03;
  if (!allowed(g.use.on, floor, hit.panel, shield)) return null;
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
  const pos: Vec3 = [at[0] + nx * out, at[1], at[2] + nz * out];
  if (g.use.toFloor && hit.panel) pos[1] = floorHeight(q, g, pos, [nx / len, 0, nz / len], hit.panel.entry.panel.spec.index) ?? pos[1];
  return { pos, yaw: Math.atan2(-nx, -nz), onFloor: false, flat: false, panel };
}

/**
 * Where a `toFloor` charge stands on its wall (Thermite's, Phase 8 M5): its box's centre height just above the floor
 * under `pos` (out of the wall along `n`), if the same panel is there to go on that low; else null (it stays where
 * the view met it).
 */
function floorHeight(q: PlaceQuery, g: PlaceData, pos: Vec3, n: Vec3, panel: number): number | null {
  const floor = raycastLevel(q, pos, [0, -1, 0], 4);
  if (!floor) return null;
  const y = pos[1] - floor.t + g.sizeM[1] / 2 + 0.02;
  if (y >= pos[1]) return null;
  const from: Vec3 = [pos[0] + n[0] * 0.3, y, pos[2] + n[2] * 0.3];
  const back = raycastLevel(q, from, [-n[0], 0, -n[2]], 0.6);
  return back?.panel && back.panel.entry.panel.spec.index === panel && allowed(g.use.on, false, back.panel, false) ? y : null;
}
