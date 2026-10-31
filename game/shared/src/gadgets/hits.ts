// What a ray meets in the gadget table (Phase 8, gadgets/DESIGN.md §3): each entry is its data's box (`sizeM`: width,
// height, depth), turned to its facing, around its centre; one lying flat on a floor has its depth up. Bullets, the
// knife and the pick-up hold ask this; the Bulletproof Camera's bulletproof front is the shot judge's (bpCamsShot).
import { DEG, forwardXZ, rightXZ, type Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import { kindId } from "./kinds.js";
import { GFlag, type Gadget, type GadgetTable } from "./table.js";

/** A point or a direction in an entry's own frame: x to its right, y up, z out of its front. */
export function localOf(g: Gadget, v: readonly number[], point: boolean): Vec3 {
  const [fx, fz] = forwardXZ(g.yaw);
  const [rx, rz] = rightXZ(g.yaw);
  const [x, y, z] = point ? [v[0] - g.pos[0], v[1] - g.pos[1], v[2] - g.pos[2]] : v;
  return [x * rx + z * rz, y, x * fx + z * fz];
}

/** Half its box in its own frame (lying flat: its depth is up and its height along its facing). */
export function halfSize(g: Gadget, size: readonly [number, number, number]): Vec3 {
  const [w, h, d] = size;
  return g.flags & GFlag.Flat ? [w / 2, d / 2, h / 2] : [w / 2, h / 2, d / 2];
}

/** Where a ray (in the box's frame) enters the box of half sizes `half` round the origin, before `maxT`; null if it misses. */
export function enterBox(o: Vec3, d: Vec3, half: Vec3, maxT: number): number | null {
  let t0 = 0;
  let t1 = maxT;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (Math.abs(o[a]) > half[a]) return null;
      continue;
    }
    const ta = (-half[a] - o[a]) / d[a];
    const tb = (half[a] - o[a]) / d[a];
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return null;
  }
  return t0;
}

/** Metres along a ray from `origin` (unit `dir`) to where it meets an entry's box, or null. */
export function rayToGadget(data: GameData, g: Gadget, origin: Vec3, dir: Vec3, maxT: number): number | null {
  const gd = data.gadgets.get(kindId(g.kind) ?? "");
  if (!gd || g.flags & GFlag.Flying) return null;
  return enterBox(localOf(g, origin, true), localOf(g, dir, false), halfSize(g, gd.sizeM), maxT);
}

/** The nearest entry along a ray (before `maxT`) that `keep` accepts, and how far it is, or null. */
export function gadgetOnRay(table: GadgetTable, data: GameData, origin: Vec3, dir: Vec3, maxT: number, keep: (g: Gadget) => boolean): { g: Gadget; t: number } | null {
  let best: { g: Gadget; t: number } | null = null;
  for (const g of table.list) {
    if (!keep(g)) continue;
    const t = rayToGadget(data, g, origin, dir, best ? best.t : maxT);
    if (t !== null && (!best || t < best.t)) best = { g, t };
  }
  return best;
}

/**
 * The Bulletproof Cameras a bullet (`anyFace` false) or a knife breaks along a ray before `maxT`: a bullet coming at
 * a camera's front within data/intel.json `bulletproofCamera.frontDeg` of straight on meets its plate and leaves it
 * whole; from the side or the back, or the knife on any face, it breaks. Broken ones are left out.
 */
export function bpCamsBroken(cams: readonly Gadget[], data: GameData, origin: Vec3, dir: Vec3, maxT: number, anyFace = false): Gadget[] {
  const plate = Math.cos(data.intel.bulletproofCamera.frontDeg * DEG);
  const out: Gadget[] = [];
  for (const c of cams) {
    if (c.flags & GFlag.Broken) continue;
    if (rayToGadget(data, c, origin, dir, maxT) === null) continue;
    if (!anyFace && -localOf(c, dir, false)[2] >= plate) continue;
    out.push(c);
  }
  return out;
}
