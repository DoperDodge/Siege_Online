// Default cameras (Phase 7, intel/DESIGN.md §3): the level's cameras as small boxes a bullet breaks, and the limits a
// viewer's view turns within.
import type { LevelDef } from "../data/schemas.js";

/** Half the size of a camera's box (a placeholder: the camera body as a 0.24 m cube around its position). */
export const CAMERA_HALF_M = 0.12;

/**
 * The cameras a ray from `origin` along unit `dir` passes through before `maxT`, as a bit each (camera i: bit i), the
 * broken ones (`broken`) left out.
 */
export function camerasOnRay(level: LevelDef, origin: readonly number[], dir: readonly number[], maxT: number, broken: number): number {
  let hit = 0;
  level.cameras.forEach((cam, i) => {
    if (i >= 32 || broken & (1 << i)) return;
    let t0 = 0;
    let t1 = maxT;
    for (let a = 0; a < 3; a++) {
      const lo = cam.pos[a] - CAMERA_HALF_M - origin[a];
      const hi = cam.pos[a] + CAMERA_HALF_M - origin[a];
      if (Math.abs(dir[a]) < 1e-9) {
        if (lo > 0 || hi < 0) return;
        continue;
      }
      const ta = lo / dir[a];
      const tb = hi / dir[a];
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
      if (t0 > t1) return;
    }
    hit |= 1 << i;
  });
  return hit;
}
