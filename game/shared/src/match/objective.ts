// The defuser as the simulation sees it (match/DESIGN.md §8, D-120): who carries it, where it lies or is planted,
// where a plant may happen and how long the holds take, so a client predicts its own holds the way the server
// judges them. The room keeps it up to date (net/matchDirector.ts); everything here is pure geometry.
import { DEG } from "../core/math.js";
import type { LevelDef, ObjectiveData } from "../data/schemas.js";

export interface DefuserState {
  /** The pawn carrying it (0: nobody). */
  carrier: number;
  /** Where it lies after a drop (on the floor), or null. */
  dropped: [number, number, number] | null;
  /** Where it was planted, or null. */
  planted: [number, number, number] | null;
  /** The round's site (level.json sites[].id): the rooms a plant must be in; null where it isn't known. */
  site: string | null;
  /** Planting is open now (the action phase). */
  canPlant: boolean;
  /** The format's plant and disable holds, in ticks. */
  plantTicks: number;
  disableTicks: number;
}

/** How far above or below a body's feet the defuser may be and still be reached (stairs, a step). */
export const DEFUSER_REACH_DY = 1.2;
/** A plant counts this far below a room's floor (a ramp) and up to its ceiling. */
const FLOOR_SLACK = 0.3;

/** Where a site's defuser may go: its rooms' floor areas, with the storey heights, and the margin from the edges. */
export interface SiteArea {
  rects: { x0: number; z0: number; x1: number; z1: number; floorY: number; ceilingY: number }[];
  margin: number;
}

/** A site's plantable area from the level, or null for no such site. */
export function siteArea(level: LevelDef, siteId: string): SiteArea | null {
  const site = level.sites.find((s) => s.id === siteId);
  if (!site) return null;
  const rects: SiteArea["rects"] = [];
  for (const roomId of site.rooms) {
    const room = level.rooms.find((r) => r.id === roomId);
    const storey = room && level.storeys.find((s) => s.id === room.storey);
    if (!room || !storey) continue;
    for (const [x0, z0, x1, z1] of room.rects) rects.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), floorY: storey.floorY, ceilingY: storey.ceilingY });
  }
  return { rects, margin: site.plantMarginM };
}

/**
 * Feet at (x, y, z) are inside the site's rooms and at least the margin from their outer edges ("no-drop zone at
 * the site edges", research §5): the spot and the spots the margin away along each axis all lie on the rooms' floors.
 */
export function inSite(area: SiteArea, x: number, y: number, z: number): boolean {
  const on = (px: number, pz: number) => area.rects.some((r) => px >= r.x0 && px <= r.x1 && pz >= r.z0 && pz <= r.z1 && y >= r.floorY - FLOOR_SLACK && y <= r.ceilingY);
  const m = area.margin;
  return on(x, z) && on(x + m, z) && on(x - m, z) && on(x, z + m) && on(x, z - m);
}

/** A dropped defuser within pickup range of feet at (x, y, z) (no need to look at it, research §5). */
export function canPickUp(o: ObjectiveData, at: readonly [number, number, number], x: number, y: number, z: number): boolean {
  return Math.hypot(at[0] - x, at[2] - z) <= o.defuser.pickupRangeM && Math.abs(at[1] - y) <= DEFUSER_REACH_DY;
}

/** A planted defuser within a defender's reach, faced within the data's angle (yaw: 0 faces −Z, positive turns left). */
export function canDisable(o: ObjectiveData, at: readonly [number, number, number], x: number, y: number, z: number, yaw: number): boolean {
  const dx = at[0] - x;
  const dz = at[2] - z;
  const d = Math.hypot(dx, dz);
  if (d > o.defuser.disableReachM || Math.abs(at[1] - y) > DEFUSER_REACH_DY) return false;
  if (d < 0.25) return true; // standing over it
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return (dx * fx + dz * fz) / d >= Math.cos(o.defuser.disableFacingDeg * DEG);
}
