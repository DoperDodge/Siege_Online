// The Bulletproof Camera (Phase 7 M5, intel/DESIGN.md §4): a defender's gadget (Phase 8: an entry of the gadget table,
// placed like any other, gadgets/hands.ts), which joins the defenders' cameras after the level's and turns like them
// (all the way round on the floor); its EMP dart jams drones (net/room.ts). Its front is bulletproof; a bullet from the
// side or the back, a knife, or steel going up on its wall breaks it (gadgets/hits.ts). Placed outdoors it loses its
// signal after a while.
import type { Vec3 } from "../core/math.js";
import type { IntelData, LevelDef } from "../data/schemas.js";
import { raycastLevel, type LevelQuery } from "../level/raycast.js";

type BpData = IntelData["bulletproofCamera"];

/**
 * Whether a point is inside one of the level's rooms (on its storey, floor to ceiling); outside them is outdoors. A
 * level without rooms (a lab) has no outdoors.
 */
export function indoors(level: LevelDef, x: number, y: number, z: number): boolean {
  if (level.rooms.length === 0) return true;
  return level.rooms.some((room) => {
    const s = level.storeys.find((st) => st.id === room.storey);
    if (!s || y < s.floorY - 0.5 || y > s.ceilingY + 0.5) return false;
    return room.rects.some(([x0, z0, x1, z1]) => x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1));
  });
}

/**
 * Where an EMP dart fired from `from` along unit `dir` bursts: the first drone it meets (within `hitM` of its path; the
 * centres in `drones`), else the level, else `dartRangeM` out.
 */
export function dartBurst(q: LevelQuery, d: BpData, from: Vec3, dir: Vec3, drones: readonly Vec3[], hitM: number): Vec3 {
  let t = raycastLevel(q, from, dir, d.dartRangeM)?.t ?? d.dartRangeM;
  for (const p of drones) {
    const v = [p[0] - from[0], p[1] - from[1], p[2] - from[2]];
    const along = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
    if (along < 0 || along > t) continue;
    const off = Math.hypot(v[0] - dir[0] * along, v[1] - dir[1] * along, v[2] - dir[2] * along);
    if (off <= hitM) t = along;
  }
  return [from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t];
}
