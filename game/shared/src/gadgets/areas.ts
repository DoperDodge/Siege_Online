// Where the M3 gadgets act (Phase 8 M3, gadgets/DESIGN.md §6, §9): barbed wire's box, smoke clouds, an observation
// blocker's barrier, a gas pipe's jet and fire, a metal detector's frame. The simulation asks the wire (a body's
// speed, predicted) and the server the rest; everything here reads only the table's entries and the level.
import { forwardXZ, rightXZ, type Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import type { GadgetData, GadgetRules } from "../data/schemas.js";
import { raycastLevel, type LevelQuery } from "../level/raycast.js";
import type { Pawn } from "../player/pawn.js";
import { localOf } from "./hits.js";
import { kindId, kindOf } from "./kinds.js";
import { GFlag, type Gadget, type GadgetTable } from "./table.js";

const KIND_WIRE = kindOf("barbed_wire");
const KIND_EXTINGUISHER = kindOf("fire_extinguisher");
const KIND_PIPE = kindOf("gas_pipe");

/** Whether a body's feet (with its collision radius `r`) are in a wire's box, and its feet within the wire's height. */
export function inWireBox(g: Gadget, size: readonly [number, number, number], x: number, y: number, z: number, r: number): boolean {
  const [lx, , lz] = localOf(g, [x, y, z], true);
  const floor = g.pos[1] - size[1] / 2;
  return Math.abs(lx) <= size[0] / 2 + r && Math.abs(lz) <= size[2] / 2 + r && y >= floor - 0.3 && y <= floor + size[1];
}

/**
 * How fast an enemy wire lets a pawn move (1: not in one): its `slow` for a body, `droneSlow` for a drone; the
 * slowest when several overlap (they don't stack).
 */
export function wireSlow(data: GameData, table: GadgetTable, pawn: Pawn, drone: boolean): number {
  const s = pawn.state;
  const wire = data.gadgets.get("barbed_wire")?.wire;
  if (!wire) return 1;
  const size = data.gadgets.get("barbed_wire")!.sizeM;
  const r = drone ? 0.1 : data.movement.stance.collisionRadius;
  let slow = 1;
  for (const g of table.list) {
    if (g.kind !== KIND_WIRE || g.team === pawn.team || g.flags & GFlag.Flying) continue;
    if (inWireBox(g, size, s.x, s.y, s.z, r)) slow = Math.min(slow, drone ? wire.droneSlow : wire.slow);
  }
  return slow;
}

/** The radius of an entry's smoke now, or 0: a smoke grenade's cloud, a set-off fire extinguisher's. */
export function cloudRadius(data: GameData, g: Gadget): number {
  if (!(g.flags & GFlag.Active)) return 0;
  if (g.kind === KIND_EXTINGUISHER) return data.gadgetRules.ingredients.fire_extinguisher.cloud.radiusM;
  return data.gadgets.get(kindId(g.kind) ?? "")?.cloud?.radiusM ?? 0;
}

/** Where a segment from `from` to `to` first enters a smoke cloud (metres along it), or null. */
export function smokeOnSegment(data: GameData, table: GadgetTable, from: Vec3, to: Vec3): number | null {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-9) return null;
  const u = [d[0] / len, d[1] / len, d[2] / len];
  let best: number | null = null;
  for (const g of table.list) {
    const r = cloudRadius(data, g);
    if (r <= 0) continue;
    // The sphere round its centre: from inside it, at once.
    const o = [from[0] - g.pos[0], from[1] - g.pos[1], from[2] - g.pos[2]];
    const b = o[0] * u[0] + o[1] * u[1] + o[2] * u[2];
    const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
    if (c <= 0) return 0;
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t >= 0 && t <= len && (best === null || t < best)) best = t;
  }
  return best;
}

/**
 * An observation blocker's barrier (its data's `barrier`): a rectangle standing on the floor under it, facing its
 * placer's way, `heightM` tall and as wide as `widthM` allows before a wall on either side (its arms stop there).
 */
export function barrierOf(q: LevelQuery, b: NonNullable<GadgetData["barrier"]>, g: Gadget, size: readonly number[]): { centre: Vec3; n: Vec3; t: Vec3; half: number; floor: number; top: number } {
  const [fx, fz] = forwardXZ(g.yaw);
  const [rx, rz] = rightXZ(g.yaw);
  const floor = g.pos[1] - size[1] / 2;
  const mid: Vec3 = [g.pos[0], floor + Math.min(1, b.heightM / 2), g.pos[2]];
  const reach = (sx: number) => raycastLevel(q, mid, [rx * sx, 0, rz * sx], b.widthM / 2)?.t ?? b.widthM / 2;
  const right = reach(1);
  const left = reach(-1);
  const shift = (right - left) / 2;
  return { centre: [g.pos[0] + rx * shift, floor, g.pos[2] + rz * shift], n: [fx, 0, fz], t: [rx, 0, rz], half: (right + left) / 2, floor, top: floor + b.heightM };
}

/** Where a segment first crosses a barrier rectangle (metres along it), or null. */
export function crossesBarrier(bar: ReturnType<typeof barrierOf>, from: Vec3, to: Vec3): number | null {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const dn = d[0] * bar.n[0] + d[2] * bar.n[2];
  if (len < 1e-9 || Math.abs(dn) < 1e-9) return null;
  const s = ((bar.centre[0] - from[0]) * bar.n[0] + (bar.centre[2] - from[2]) * bar.n[2]) / dn;
  if (s < 0 || s > 1) return null;
  const p = [from[0] + d[0] * s, from[1] + d[1] * s, from[2] + d[2] * s];
  const along = (p[0] - bar.centre[0]) * bar.t[0] + (p[2] - bar.centre[2]) * bar.t[2];
  if (Math.abs(along) > bar.half || p[1] < bar.floor || p[1] > bar.top) return null;
  return s * len;
}

/** A gas pipe's jet: from the pipe along its facing, `lengthM` long (shorter where a wall is), `radiusM` round. */
export function jetOf(q: LevelQuery, k: GadgetRules["ingredients"]["gas_pipe"], g: Gadget): { a: Vec3; b: Vec3; r: number } {
  const [fx, fz] = forwardXZ(g.yaw);
  const len = raycastLevel(q, g.pos, [fx, 0, fz], k.jet.lengthM)?.t ?? k.jet.lengthM;
  return { a: g.pos, b: [g.pos[0] + fx * len, g.pos[1], g.pos[2] + fz * len], r: k.jet.radiusM };
}

/** Whether a point is in a metal detector's frame (its box). */
export function inFrame(g: Gadget, size: readonly [number, number, number], p: Vec3): boolean {
  const [lx, ly, lz] = localOf(g, p, true);
  return Math.abs(lx) <= size[0] / 2 && Math.abs(ly) <= size[1] / 2 && Math.abs(lz) <= size[2] / 2;
}

export const isPipe = (g: Gadget) => g.kind === KIND_PIPE;
