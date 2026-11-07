// Where a Bot Training drill puts everyone (Phase 9 M8, bots/DESIGN.md §10; data/modes/drill_*.json `drill`): the
// duel's two spots across a door, the defenders spread over a storey (a room each), the defuser planted in the site
// with the attackers round it and the defenders in the rooms about the site. Spots are on the bots' nav grid (where a
// body stands), the same for the person and the bots; a spot is [x, y, z] and the yaw (degrees) it faces.
import type { Vec3 } from "../core/math.js";
import type { Drill } from "../data/schemas.js";
import type { NavWorld } from "../bots/nav/world.js";
import { holdSpots, roomAt, roomSpots, sees, standAt } from "../bots/places.js";
import type { BotRng } from "../bots/rng.js";
import type { Sim } from "../sim.js";

/** A place to put a body: its feet, the yaw it faces (degrees), and the point it watches. */
export interface DrillSpot {
  pos: Vec3;
  yawDeg: number;
  face: Vec3;
}

/** The yaw (degrees) that looks from `a` toward `b` (yaw 0 faces −z). */
function yawToward(a: Vec3, b: Vec3): number {
  return (Math.atan2(-(b[0] - a[0]), -(b[2] - a[2])) * 180) / Math.PI;
}

/**
 * The duel's spots for round `round` (1-based): the drill's doors in turn, one either side `apartM` out, facing the door
 * ([the attacker's, the defender's], which side alternates with the door). Null: no door it can use.
 */
export function duelSpots(sim: Sim, nav: NavWorld, drill: Drill, round: number): [DrillSpot, DrillSpot] | null {
  const doors = drill.doors.map((id) => sim.level.panels.byId.get(id)).filter((e) => e !== undefined);
  for (let k = 0; k < doors.length; k++) {
    const e = doors[(round - 1 + k) % doors.length];
    const f = e.frame;
    const floor = f.center[1] - f.h / 2;
    const door: Vec3 = [f.center[0], floor + 1.2, f.center[2]];
    const ends = [1, -1].map((s) => standAt(nav, [f.center[0] + f.n[0] * drill.apartM * s, floor, f.center[2] + f.n[2] * drill.apartM * s], 1.2));
    if (!ends[0] || !ends[1]) continue;
    const spots = ends.map((p) => ({ pos: p!, yawDeg: yawToward(p!, door), face: door })) as [DrillSpot, DrillSpot];
    return round % 2 === 0 ? [spots[1], spots[0]] : spots;
  }
  return null;
}

/** `n` spots over a storey for clearing it: a room each (as many as there are), the best hold spot in it, at random. */
export function spreadSpots(sim: Sim, nav: NavWorld, storey: string, n: number, rng: BotRng): DrillSpot[] {
  const rooms = sim.level.def.rooms.filter((r) => r.storey === storey).map((r) => r.id);
  for (let i = rooms.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
  }
  const out: DrillSpot[] = [];
  for (const room of rooms) {
    if (out.length >= n) break;
    const h = holdSpots(sim, nav, room, 1, rng)[0];
    if (h) out.push({ pos: h.spot, yawDeg: yawToward(h.spot, h.face), face: h.face });
  }
  return out;
}

/** Where the defuser goes for a retake: a spot in one of the site's rooms, clear of its edges by `margin`. Null: none. */
export function plantedSpot(sim: Sim, nav: NavWorld, site: string, rng: BotRng): Vec3 | null {
  const level = sim.level.def;
  const st = level.sites.find((s) => s.id === site);
  if (!st) return null;
  const margin = (st.plantMarginM ?? 0.5) + 0.4;
  const spots = st.rooms.flatMap((room) => {
    const r = level.rooms.find((x) => x.id === room);
    if (!r) return [];
    return roomSpots(nav, level, room, 0.75).filter((p) => r.rects.some((q) => p[0] >= Math.min(q[0], q[2]) + margin && p[0] <= Math.max(q[0], q[2]) - margin && p[2] >= Math.min(q[1], q[3]) + margin && p[2] <= Math.max(q[1], q[3]) - margin));
  });
  return spots.length ? spots[rng.int(spots.length)] : null;
}

/**
 * Spots round a planted defuser at `at` for `n` bodies: the attackers 2–7 m from it where they see it; the defenders
 * 9–22 m off in rooms that aren't the site's, facing it.
 */
export function aroundSpots(sim: Sim, nav: NavWorld, at: Vec3, site: string, attackers: boolean, n: number, rng: BotRng): DrillSpot[] {
  const level = sim.level.def;
  const siteRooms = level.sites.find((s) => s.id === site)?.rooms ?? [];
  const [lo, hi] = attackers ? [2, 7] : [9, 22];
  const target: Vec3 = [at[0], at[1] + 0.4, at[2]];
  const cands: Vec3[] = [];
  for (let r = lo; r <= hi; r += 1.5)
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2 + rng.next() * 0.3;
      for (const dy of attackers ? [0] : [0, -3.4, 3.4]) {
        const p = standAt(nav, [at[0] + Math.cos(ang) * r, at[1] + dy, at[2] + Math.sin(ang) * r], 0.6);
        if (!p) continue;
        const room = roomAt(level, p[0], p[1] + 0.3, p[2]);
        if (attackers ? !sees(sim, [p[0], p[1] + 1.6, p[2]], target) : room === null || siteRooms.includes(room)) continue;
        if (!cands.some((c) => Math.hypot(c[0] - p[0], c[2] - p[2]) < 2 && Math.abs(c[1] - p[1]) < 1)) cands.push(p);
      }
    }
  const out: DrillSpot[] = [];
  while (out.length < n && cands.length) {
    const p = cands.splice(rng.int(cands.length), 1)[0];
    out.push({ pos: p, yawDeg: yawToward(p, at), face: target });
  }
  return out;
}
