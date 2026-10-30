// The Bulletproof Camera (Phase 7 M5, intel/DESIGN.md §4): a defender places one by holding the gadget key at a wall
// or the floor within reach (sim.ts); it joins the defenders' cameras after the level's, turns like them (all the way
// round on the floor), and its EMP dart jams drones (net/room.ts). Its front is bulletproof; a bullet from the side or
// the back, a knife, or steel going up on its wall breaks it. Placed outdoors it loses its signal after a while. The
// room keeps the round's list (MatchSimRules.bpCams) and every client gets it with the match's state.
import { forwardXZ, rightXZ, type Vec3 } from "../core/math.js";
import { DEG } from "../core/math.js";
import type { IntelData, LevelDef } from "../data/schemas.js";
import { raycastLevel, type LevelQuery } from "../level/raycast.js";

type BpData = IntelData["bulletproofCamera"];

/** A Bulletproof Camera placed this round. */
export interface BpCam {
  /** Its box's centre (metres), and the way it faces (radians: on a wall, out of it; on the floor, the placer's way). */
  pos: Vec3;
  yaw: number;
  onFloor: boolean;
  /** The controller of the defender who placed it. */
  owner: number;
  /** Shot from the side or the back, knifed, or its wall reinforced: no feed for the rest of the round. */
  broken: boolean;
  /** Placed outdoors: the tick its signal ends (0: indoors, it never does). */
  signalEnd: number;
  /** The tick its EMP dart is ready again. */
  dartReady: number;
  /** The panel it's on (its index), or −1. */
  panel: number;
}

/** A surface this steep or flatter is a floor; one steeper than the other is a wall (its normal's height). */
const FLOOR_NY = 0.8;
const WALL_NY = 0.3;

/**
 * Where a hold of the gadget key would put a camera: on the first surface along the view (from `eye`, unit `dir`;
 * the level, its props and its panels) within reach. On a floor it sits on it facing `yaw` (the placer's way); on a
 * wall it faces out of it. Null: nothing within reach, or a ceiling or a slope.
 */
export function cameraSpot(q: LevelQuery, d: BpData, eye: Vec3, dir: Vec3, yaw: number): Omit<BpCam, "owner" | "broken" | "signalEnd" | "dartReady"> | null {
  const hit = raycastLevel(q, eye, dir, d.reachM);
  if (!hit) return null;
  const at: Vec3 = [eye[0] + dir[0] * hit.t, eye[1] + dir[1] * hit.t, eye[2] + dir[2] * hit.t];
  const [nx, ny, nz] = hit.normal;
  const panel = hit.panel ? hit.panel.entry.panel.spec.index : -1;
  if (ny >= FLOOR_NY) return { pos: [at[0], at[1] + d.sizeM[1] / 2, at[2]], yaw, onFloor: true, panel };
  if (Math.abs(ny) > WALL_NY) return null;
  const len = Math.hypot(nx, nz);
  const out = d.sizeM[2] / 2 / len;
  return { pos: [at[0] + nx * out, at[1], at[2] + nz * out], yaw: Math.atan2(-nx, -nz), onFloor: false, panel };
}

/** A point in a camera's own frame: x to its right, y up, z out of its front. */
function local(c: BpCam, v: readonly number[], point: boolean): Vec3 {
  const [fx, fz] = forwardXZ(c.yaw);
  const [rx, rz] = rightXZ(c.yaw);
  const [x, y, z] = point ? [v[0] - c.pos[0], v[1] - c.pos[1], v[2] - c.pos[2]] : v;
  return [x * rx + z * rz, y, x * fx + z * fz];
}

/** Whether a ray (in the box's frame) passes through the box of half sizes `half` around the origin before `maxT`. */
function throughBox(o: Vec3, d: Vec3, half: Vec3, maxT: number): boolean {
  let t0 = 0;
  let t1 = maxT;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (Math.abs(o[a]) > half[a]) return false;
      continue;
    }
    const ta = (-half[a] - o[a]) / d[a];
    const tb = (half[a] - o[a]) / d[a];
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * The cameras a ray from `origin` along unit `dir` passes through before `maxT`, as a bit each (camera i: bit i), the
 * broken ones left out. A bullet coming at a camera's front within `frontDeg` of straight on meets its bulletproof
 * plate and leaves it whole; `anyFace` (the knife): every face breaks.
 */
export function bpCamsOnRay(cams: readonly BpCam[], d: BpData, origin: Vec3, dir: Vec3, maxT: number, anyFace = false): number {
  const half: Vec3 = [d.sizeM[0] / 2, d.sizeM[1] / 2, d.sizeM[2] / 2];
  const plate = Math.cos(d.frontDeg * DEG);
  let hit = 0;
  cams.forEach((c, i) => {
    if (i >= 32 || c.broken) return;
    const ld = local(c, dir, false);
    if (!throughBox(local(c, origin, true), ld, half, maxT)) return;
    if (!anyFace && -ld[2] >= plate) return;
    hit |= 1 << i;
  });
  return hit;
}

/** Whether a point is inside one of the level's rooms (on its storey, floor to ceiling); outside them is outdoors. */
export function indoors(level: LevelDef, x: number, y: number, z: number): boolean {
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
