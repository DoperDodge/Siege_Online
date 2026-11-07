// Places in the level for bots (Phase 9 M4–M7, bots/DESIGN.md §6, §7.4): the room a point is in, spots on the nav grid
// in a room, a panel's two sides, a room's ways in, spots to hold, and (M7) where to stand and what to look at to put
// a device on a wall or a floor, throw one into a room or swing at a panel.
import type { Vec3 } from "../core/math.js";
import type { LevelDef } from "../data/schemas.js";
import type { PanelEntry } from "../destruction/panels.js";
import { raycastLevel } from "../level/raycast.js";
import type { Sim } from "../sim.js";
import type { NavWorld } from "./nav/world.js";
import type { BotRng } from "./rng.js";

/** Where a body stands working a wall (m from its face), and the height looked at on it. */
export const WORK_M = 0.75;
export const LOOK_H = 1.25;

/** The room a point is in (by the level's room rectangles and storeys), or null. */
export function roomAt(level: LevelDef, x: number, y: number, z: number): string | null {
  for (const r of level.rooms) {
    const st = level.storeys.find((s) => s.id === r.storey);
    if (!st || y < st.floorY - 0.4 || y > st.ceilingY) continue;
    for (const q of r.rects) if (x >= Math.min(q[0], q[2]) - 0.05 && x <= Math.max(q[0], q[2]) + 0.05 && z >= Math.min(q[1], q[3]) - 0.05 && z <= Math.max(q[1], q[3]) + 0.05) return r.id;
  }
  return null;
}

/** Nav nodes' positions inside a room, about `step` m apart. */
export function roomSpots(nav: NavWorld, level: LevelDef, roomId: string, step = 0.75): Vec3[] {
  const room = level.rooms.find((r) => r.id === roomId);
  const st = room && level.storeys.find((s) => s.id === room.storey);
  if (!room || !st) return [];
  const out: Vec3[] = [];
  for (const q of room.rects) {
    const [x0, z0, x1, z1] = [Math.min(q[0], q[2]), Math.min(q[1], q[3]), Math.max(q[0], q[2]), Math.max(q[1], q[3])];
    for (let x = x0 + step / 2; x < x1; x += step)
      for (let z = z0 + step / 2; z < z1; z += step) {
        for (const y of [st.floorY, room.anchor[1]]) {
          const n = nav.grid.nodeNear(x, y, z, step / 2, 0.5);
          if (n < 0) continue;
          const p = nav.grid.nodePos(n);
          if (roomAt(level, p[0], p[1], p[2]) === roomId && !out.some((o) => Math.hypot(o[0] - p[0], o[2] - p[2]) < step * 0.6 && Math.abs(o[1] - p[1]) < 0.5)) out.push(p);
        }
      }
  }
  return out;
}

/** A panel's two sides at floor level, `d` m out from its middle (wall panels), and the room each is in. */
export function sides(level: LevelDef, e: PanelEntry, d: number, uOff = 0): { pos: Vec3; room: string | null }[] {
  const f = e.frame;
  const floor = f.center[1] - f.h / 2;
  return [1, -1].map((s) => {
    const pos: Vec3 = [f.center[0] + f.n[0] * d * s + f.u[0] * uOff, floor, f.center[2] + f.n[2] * d * s + f.u[2] * uOff];
    return { pos, room: roomAt(level, pos[0], pos[1] + 0.3, pos[2]) };
  });
}

/** A place to stand on the nav grid near `p` (within `within` m), or null. */
export function standAt(nav: NavWorld, p: Vec3, within = 0.8): Vec3 | null {
  const n = nav.grid.nodeNear(p[0], p[1], p[2], within, 0.8);
  return n >= 0 ? nav.grid.nodePos(n) : null;
}

/** The ways into a room: its door frames (any barricade frame with a side in it), soft walls and hatches over it. */
export function waysIn(sim: Sim, roomId: string): Vec3[] {
  const level = sim.level.def;
  const out: Vec3[] = [];
  for (const e of sim.level.panels.list) {
    const k = e.panel.kind;
    const f = e.frame;
    if (k === "barricade" || k === "wall") {
      if (!sides(level, e, 0.5).some((s) => s.room === roomId)) continue;
      out.push([f.center[0], f.center[1] - f.h / 2 + LOOK_H, f.center[2]]);
    } else if (k === "hatch") {
      if (roomAt(level, f.center[0], f.center[1] - 1.2, f.center[2]) === roomId) out.push([f.center[0], f.center[1], f.center[2]]);
    }
  }
  return out;
}

/** Whether the eye sees `p` (nothing that blocks sight short of it, by 0.35 m). */
export function sees(sim: Sim, eye: Vec3, p: Vec3): boolean {
  const d: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 0.5) return true;
  const hit = raycastLevel(sim, eye, [d[0] / len, d[1] / len, d[2] / len], len);
  return !hit || hit.t > len - 0.35;
}

/**
 * Spots to hold in a room, best first: a node whose eye sees the room's ways in, from a fair distance (not on top of
 * one), with a wall at its back; each with the way in it watches. At most `n`, 2 m apart.
 */
export function holdSpots(sim: Sim, nav: NavWorld, roomId: string, n: number, rng: BotRng): { spot: Vec3; face: Vec3 }[] {
  const ways = waysIn(sim, roomId);
  const cands = roomSpots(nav, sim.level.def, roomId, 0.75);
  const scored = cands.map((c) => {
    const eye: Vec3 = [c[0], c[1] + 1.6, c[2]];
    let score = 0;
    let face: Vec3 | null = null;
    let best = -Infinity;
    for (const w of ways) {
      const d = Math.hypot(w[0] - c[0], w[2] - c[2]);
      if (!sees(sim, eye, w)) continue;
      const v = d < 2 ? -1 : d < 3 ? 0.5 : d <= 9 ? 1 : 0.6;
      score += v;
      if (v > best) [best, face] = [v, w];
    }
    return { spot: c, face: face ?? ways[0] ?? [c[0], c[1] + 1.4, c[2] - 1], score: score + rng.next() * 0.3 };
  });
  scored.sort((a, b) => b.score - a.score);
  const out: { spot: Vec3; face: Vec3 }[] = [];
  for (const s of scored) {
    if (out.length >= n) break;
    if (out.some((o) => Math.hypot(o.spot[0] - s.spot[0], o.spot[2] - s.spot[2]) < 2)) continue;
    out.push({ spot: s.spot, face: s.face });
  }
  return out;
}

/** Where a bot stands and what it looks at to use a device (M7): a spot on the nav grid and a point in the level. */
export interface UseSpot {
  stand: Vec3;
  look: Vec3;
}

/**
 * A device on a wall panel (a charge, a mirror): standing `dist` m out from its face on the side in room `from` (else
 * whichever side has a place to stand), `uOff` m along it from its middle, looking at the face `height` m over the floor.
 */
export function wallSpot(sim: Sim, nav: NavWorld, e: PanelEntry, from: string | null, dist: number, height: number, uOff = 0): UseSpot | null {
  const level = sim.level.def;
  const f = e.frame;
  const both = sides(level, e, dist, uOff);
  const order = from ? [...both.filter((s) => s.room === from), ...both.filter((s) => s.room !== from)] : both;
  for (const side of order) {
    const stand = standAt(nav, side.pos, 0.5);
    if (!stand) continue;
    // The face on that side: out from the middle of its thickness by half of it, toward where it's stood.
    const s = (side.pos[0] - f.center[0]) * f.n[0] + (side.pos[2] - f.center[2]) * f.n[2] > 0 ? 1 : -1;
    const look: Vec3 = [f.center[0] + f.n[0] * s * (f.t / 2) + f.u[0] * uOff, stand[1] + height, f.center[2] + f.n[2] * s * (f.t / 2) + f.u[2] * uOff];
    return { stand, look };
  }
  return null;
}

/**
 * A device on a hatch, from above: standing on it (a little off its middle) and looking down at its middle (a hammer's
 * blow, a charge laid on it). Null when there's no standing on it.
 */
export function hatchSpot(sim: Sim, nav: NavWorld, e: PanelEntry): UseSpot | null {
  const f = e.frame;
  const top = f.center[1] + f.t / 2;
  const off = Math.min(0.35, f.w / 2 - 0.1);
  const stand = standAt(nav, [f.center[0] + f.u[0] * off, top, f.center[2] + f.u[2] * off], 0.4);
  if (!stand || Math.abs(stand[1] - top) > 0.3) return null;
  void sim;
  return { stand, look: [f.center[0] - f.u[0] * 0.1, top, f.center[2] - f.u[2] * 0.1] };
}

/**
 * A device on the floor in room `room` (a jammer, wire, a shield, a claymore): standing in it (the spot nearest `near`
 * if given, else the room's middle), looking at the floor `ahead` m on toward `near` (or `toward`), which it must see.
 */
export function floorSpot(sim: Sim, nav: NavWorld, room: string, near: Vec3 | null, toward: Vec3 | null = null, ahead = 1.1): UseSpot | null {
  const level = sim.level.def;
  const spots = roomSpots(nav, level, room, 0.75);
  if (!spots.length) return null;
  const r = level.rooms.find((x) => x.id === room)!;
  const mid: Vec3 = near ?? [r.anchor[0], r.anchor[1], r.anchor[2]];
  const by = (p: Vec3) => Math.hypot(p[0] - mid[0], p[2] - mid[2]);
  const order = [...spots].sort((a, b) => by(a) - by(b));
  // Not right on top of `near` (a wall, a door): a little back from it, so the floor ahead is between.
  const aim = toward ?? near;
  for (const stand of order.slice(0, 12)) {
    if (near && by(stand) < ahead * 0.6) continue;
    const to = aim ?? [stand[0] + 1, stand[1], stand[2]];
    const dx = to[0] - stand[0];
    const dz = to[2] - stand[2];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const d = Math.min(ahead, Math.max(0.6, len - 0.4));
    const n = nav.grid.nodeNear(stand[0] + (dx / len) * d, stand[1], stand[2] + (dz / len) * d, 0.35, 0.3);
    if (n < 0) continue;
    const look = nav.grid.nodePos(n);
    if (Math.abs(look[1] - stand[1]) > 0.2 || !sees(sim, [stand[0], stand[1] + 1.6, stand[2]], [look[0], look[1] + 0.05, look[2]])) continue;
    return { stand, look: [look[0], look[1] + 0.02, look[2]] };
  }
  return null;
}

/**
 * A throw from `from` into room `room` (a mine, a grenade): standing at `from` (or in the room), looking at a spot of the
 * room it sees from its eye, 2.5–9 m off. Null when it sees none.
 */
export function throwSpot(sim: Sim, nav: NavWorld, room: string, from: Vec3 | null, rng: BotRng | null = null): UseSpot | null {
  const level = sim.level.def;
  const spots = roomSpots(nav, level, room, 1);
  const stands = from ? [from] : spots;
  for (const stand of stands.slice(0, 8)) {
    const eye: Vec3 = [stand[0], stand[1] + 1.6, stand[2]];
    const ok = spots.filter((p) => {
      const d = Math.hypot(p[0] - stand[0], p[2] - stand[2]);
      return d >= 2.5 && d <= 9 && sees(sim, eye, [p[0], p[1] + 0.3, p[2]]);
    });
    if (!ok.length) continue;
    const look = rng ? ok[rng.int(ok.length)] : ok[0];
    return { stand, look: [look[0], look[1] + 0.2, look[2]] };
  }
  return null;
}
