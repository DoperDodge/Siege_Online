// Where a placed gadget goes (Phase 8, gadgets/DESIGN.md §2; the Armoured Camera's rule from Phase 7 made general):
// on the first surface along the view within the gadget's reach, if its data allows that surface. On a floor it
// stands facing the placer's way; on a wall it faces out of it. A charge placed on a breakable floor or hatch lies
// flat on it. Hail's Hailstone Drill also goes on a deployable shield's face (M5). Vista's Blind Pane (M7) goes into a
// reinforceable wall at her head height, standing or crouched, from its steel's side if it's reinforced.
import type { Vec3 } from "../core/math.js";
import type { ExplosiveData, GadgetData, PlaceOn } from "../data/schemas.js";
import type { Panel } from "../destruction/panel.js";
import type { PanelEntry, PanelHit } from "../destruction/panels.js";
import { raycastLevel, type LevelQuery } from "../level/raycast.js";
import { L_STEEL } from "../destruction/panel.js";
import { FLOOR_NY } from "./flight.js";
import { windowFits } from "./mirror.js";
import { packSnap } from "./arcs.js";
import { holeBelow } from "./studs.js";

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

/**
 * Whether a gadget that goes on `on` may go where the view (along `dir`) met the level (`shield`: on a solid gadget's
 * face).
 */
function allowed(on: readonly PlaceOn[], floor: boolean, hit: PanelHit | null, shield: boolean, dir: Vec3): boolean {
  const p = hit?.entry.panel;
  const breakable = p !== undefined && !p.broken && (p.kind === "wall" || p.kind === "floor" || p.kind === "hatch" || (p.kind === "barricade" && !p.empty));
  return on.some((o) => {
    if (o === "floor") return floor;
    if (o === "wall") return !floor;
    if (o === "shield") return shield && !floor;
    if (!breakable || !hit) return false;
    if (o === "reinforceable") {
      if (floor || p.kind !== "wall" || !p.layers[L_STEEL]) return false;
      if (!steelAt(p, hit)) return true;
      // Reinforced there: only from the side its steel went up from (Panel.steelSides: 1 for the +n side).
      const n = hit.entry.frame.n;
      const fromPlus = dir[0] * n[0] + dir[1] * n[1] + dir[2] * n[2] < 0;
      return ((p.steelSides >> p.sectionOf(hit.crossing.u)) & 1) === (fromPlus ? 1 : 0);
    }
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
export function placeSpot(q: PlaceQuery, g: PlaceData, eye: Vec3, dir: Vec3, yaw: number, crouched = false): PlaceSpot | null {
  if (g.use.on.includes("frame")) return frameSpot(q, g, eye, dir);
  const hit = raycastLevel(q, eye, dir, g.use.reachM);
  if (!hit) return null;
  const at: Vec3 = [eye[0] + dir[0] * hit.t, eye[1] + dir[1] * hit.t, eye[2] + dir[2] * hit.t];
  const [nx, ny, nz] = hit.normal;
  const floor = ny >= FLOOR_NY;
  if (!floor && Math.abs(ny) > WALL_NY) return null;
  // The view met a solid gadget (sight stops at a deployable shield) where it met anything.
  const solid = !hit.panel && g.use.on.includes("shield") ? q.solidOnRay?.(eye, dir, hit.t + 0.05) : null;
  const shield = solid !== null && solid !== undefined && Math.abs(solid - hit.t) < 0.03;
  if (!allowed(g.use.on, floor, hit.panel, shield, dir)) return null;
  const panel = hit.panel ? hit.panel.entry.panel.spec.index : -1;
  const [w, h, d] = g.sizeM;
  if (floor) {
    // A gadget meant for floors stands on one; a charge on a breakable floor lies on it. Shunt's pack (R3) put near a
    // reinforced wall or a barricade goes against its foot.
    const flat = !g.use.on.includes("floor");
    const pos: Vec3 = [at[0], at[1] + (flat ? d : h) / 2, at[2]];
    const snap = g.arc ? packSnap(q, g.sizeM, pos, g.arc.snapM) : null;
    return snap ? { pos: snap.pos, yaw: snap.yaw, onFloor: true, flat, panel: snap.panel } : { pos, yaw, onFloor: true, flat, panel };
  }
  const len = Math.hypot(nx, nz);
  if (g.mirror && hit.panel) {
    // In the middle of the wall's thickness, at her head height over the floor on her side, all of it on the wall.
    const entry = hit.panel.entry;
    const t = entry.frame.t / 2;
    const floorAt = raycastLevel(q, [at[0] + (nx / len) * 0.3, at[1], at[2] + (nz / len) * 0.3], [0, -1, 0], 4);
    if (!floorAt) return null;
    const mid: Vec3 = [at[0] - (nx / len) * t, at[1] - floorAt.t + (crouched ? g.mirror.crouchY : g.mirror.standY), at[2] - (nz / len) * t];
    if (!windowFits(entry, mid, w, h)) return null;
    return { pos: mid, yaw: Math.atan2(-nx, -nz), onFloor: false, flat: false, panel };
  }
  const out = d / 2 / len;
  const pos: Vec3 = [at[0] + nx * out, at[1], at[2] + nz * out];
  if (g.use.toFloor && hit.panel) pos[1] = floorHeight(q, g, pos, [nx / len, 0, nz / len], hit.panel.entry.panel.spec.index) ?? pos[1];
  return { pos, yaw: Math.atan2(-nx, -nz), onFloor: false, flat: false, panel };
}

/**
 * Where a `toFloor` charge stands on its wall (Kiln's, Phase 8 M5): its box's centre height just above the floor
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
  return back?.panel && back.panel.entry.panel.spec.index === panel && allowed(g.use.on, false, back.panel, false, [-n[0], 0, -n[2]]) ? y : null;
}

/** How far down either side of a wall a salvo looks for the floor under it (m). */
const SALVO_FLOOR_M = 6;
/** A salvo whose hole runs up from the floor goes this much lower, so its bottom row goes however the cells fall. */
const SALVO_SLACK_M = 0.06;

/**
 * Where a salvo of Rivet's (R3, gadgets/studs.ts) goes, laid by a driver that goes `on` these within `reachM`: on the
 * surface the view from `eye` along unit `dir` meets, if it's a panel the salvo may go on (else, or a ceiling or a
 * slope: null). On a floor or a hatch it lies flat where the view met it, facing the layer's way (`yaw`). On a wall it
 * goes where the view met it across the wall, at the height that puts the bottom of its hole (`ex`, holeBelow) its
 * `salvo.ledgeM` over the floor under it (the higher of the floors either side of the wall: its room's, not the ground
 * a storey down), if its wall goes that far up or down; else where the view met it.
 */
export function salvoSpot(q: PlaceQuery, laid: GadgetData, ex: ExplosiveData, on: readonly PlaceOn[], reachM: number, eye: Vec3, dir: Vec3, yaw: number): PlaceSpot | null {
  const hit = raycastLevel(q, eye, dir, reachM);
  if (!hit?.panel) return null;
  const at: Vec3 = [eye[0] + dir[0] * hit.t, eye[1] + dir[1] * hit.t, eye[2] + dir[2] * hit.t];
  const [nx, ny, nz] = hit.normal;
  const floor = ny >= FLOOR_NY;
  if ((!floor && Math.abs(ny) > WALL_NY) || !allowed(on, floor, hit.panel, false, dir)) return null;
  const entry = hit.panel.entry;
  const panel = entry.panel.spec.index;
  const d = laid.sizeM[2];
  if (floor) return { pos: [at[0], at[1] + d / 2, at[2]], yaw, onFloor: true, flat: true, panel };
  const len = Math.hypot(nx, nz);
  const n: Vec3 = [nx / len, 0, nz / len];
  const pos: Vec3 = [at[0] + n[0] * (d / 2), at[1], at[2] + n[2] * (d / 2)];
  let under = -Infinity;
  for (const out of [0.3, -(entry.frame.t + 0.3)]) {
    const from: Vec3 = [at[0] + n[0] * out, at[1], at[2] + n[2] * out];
    const down = raycastLevel(q, from, [0, -1, 0], SALVO_FLOOR_M);
    if (down) under = Math.max(under, from[1] - down.t);
  }
  if (under > -Infinity) {
    const ledge = laid.salvo?.ledgeM ?? 0;
    const y = under + ledge + holeBelow(ex) - (ledge > 0 ? 0 : SALVO_SLACK_M);
    const back = raycastLevel(q, [at[0] + n[0] * 0.3, y, at[2] + n[2] * 0.3], [-n[0], 0, -n[2]], 0.6);
    if (back?.panel?.entry === entry) pos[1] = y;
  }
  return { pos, yaw: Math.atan2(-nx, -nz), onFloor: false, flat: false, panel };
}

/** How far round a door's or window's opening the aim may land for a frame item to go on it: across, up and down, through. */
const FRAME_GRACE = { u: 0.3, v: 0.3, n: 0.7 } as const;
/** A frame item's height over a door's foot (shin height), and over a window's sill. */
const SHIN_M = 0.2;
const SILL_M = 0.03;

/**
 * Where a frame item goes (Latch's Snare Latch, R3): aimed at a door's or window's opening within reach (the view
 * meeting its barricade or glass, the floor or sill in it, a jamb, or what's past it: anywhere within the opening's box
 * grown by FRAME_GRACE), it goes on the jamb nearer the aim, on the placer's side of the opening, at shin height over a
 * door's foot or just over a window's sill, facing across the opening (its wire runs to the other jamb). An opening is
 * a barricade's frame or a window's glass (doors and windows; a barricade up or not). Null when the view meets none.
 */
function frameSpot(q: PlaceQuery, g: PlaceData, eye: Vec3, dir: Vec3): PlaceSpot | null {
  const reach = g.use.reachM;
  const t = raycastLevel(q, eye, dir, reach)?.t ?? reach;
  const at: Vec3 = [eye[0] + dir[0] * t, eye[1] + dir[1] * t, eye[2] + dir[2] * t];
  let best: { e: PanelEntry; u: number; n: number } | null = null;
  for (const e of q.level.panels.list) {
    const k = e.panel.kind;
    if (k !== "barricade" && k !== "glass") continue;
    const f = e.frame;
    const rel = [at[0] - f.center[0], at[1] - f.center[1], at[2] - f.center[2]];
    const u = rel[0] * f.u[0] + rel[1] * f.u[1] + rel[2] * f.u[2];
    const v = rel[0] * f.v[0] + rel[1] * f.v[1] + rel[2] * f.v[2];
    const n = rel[0] * f.n[0] + rel[1] * f.n[1] + rel[2] * f.n[2];
    if (Math.abs(u) > f.w / 2 + FRAME_GRACE.u || Math.abs(v) > f.h / 2 + FRAME_GRACE.v || Math.abs(n) > f.t / 2 + FRAME_GRACE.n) continue;
    if (!best || Math.abs(n) < Math.abs(best.n)) best = { e, u, n };
  }
  if (!best) return null;
  const f = best.e.frame;
  const [w, h, d] = g.sizeM;
  // The placer's side of the opening, and the jamb nearer the aim.
  const side = (eye[0] - f.center[0]) * f.n[0] + (eye[2] - f.center[2]) * f.n[2] < 0 ? -1 : 1;
  const jamb = best.u < 0 ? -1 : 1;
  const along = f.w / 2 - d / 2 - 0.005;
  const out = f.t / 2 + w / 2 + 0.01;
  const x = f.center[0] + f.u[0] * jamb * along + f.n[0] * side * out;
  const z = f.center[2] + f.u[2] * jamb * along + f.n[2] * side * out;
  const foot = f.center[1] - f.h / 2;
  // A door's foot is the floor there; a window's sill is above the floor.
  const floor = raycastLevel(q, [x, foot + 0.3, z], [0, -1, 0], 0.6);
  const door = floor !== null && Math.abs(foot + 0.3 - floor.t - foot) < 0.25;
  const y = (door ? foot + 0.3 - floor!.t + SHIN_M : foot + SILL_M) + h / 2;
  // Facing across the opening, toward the other jamb.
  return { pos: [x, y, z], yaw: Math.atan2(jamb * f.u[0], jamb * f.u[2]), onFloor: false, flat: false, panel: -1 };
}
