// What a ray meets in the level (Phase 4 M3): plain geometry through Rapier, destructible panels cell by
// cell, so a hole lets it through. Bullets, the knife's line of sight, marks and laser dots all ask this.
import type { Vec3 } from "../core/math.js";
import type { PanelHit } from "../destruction/panels.js";
import { crossingNormal } from "../destruction/world.js";
import { QUERY_BULLET, type Rapier, type World } from "../physics/rapier.js";
import type { BuiltLevel } from "./builder.js";

/** What a level query needs (a Sim, or movement's context). */
export interface LevelQuery {
  R: Rapier;
  world: World;
  level: BuiltLevel;
}

export interface LevelHit {
  /** Metres along the ray to the surface. */
  t: number;
  /** The surface's outward normal there. */
  normal: Vec3;
  /** The panel cell it met, if it was a panel. */
  panel: PanelHit | null;
}

/**
 * The first thing along the ray within maxDist that bullets and sight can't pass: level geometry other
 * than movement helpers (DECISIONS D-046), or a panel cell with material in it. Null if nothing.
 */
export function raycastLevel(q: LevelQuery, origin: Vec3, dir: Vec3, maxDist: number): LevelHit | null {
  const ray = new q.R.Ray({ x: origin[0], y: origin[1], z: origin[2] }, { x: dir[0], y: dir[1], z: dir[2] });
  const hit = q.world.castRayAndGetNormal(ray, maxDist, true, undefined, QUERY_BULLET);
  const ph = q.level.panels.firstSolid(origin, dir, hit ? hit.timeOfImpact : maxDist);
  if (ph && (!hit || ph.crossing.face < hit.timeOfImpact)) return { t: ph.crossing.face, normal: crossingNormal(ph.entry.frame, ph.crossing, dir), panel: ph };
  return hit ? { t: hit.timeOfImpact, normal: [hit.normal.x, hit.normal.y, hit.normal.z], panel: null } : null;
}
