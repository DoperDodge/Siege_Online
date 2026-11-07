// What a ray meets in the gadget table (Phase 8, gadgets/DESIGN.md §3): each entry is its data's box (`sizeM`: width,
// height, depth), turned to its facing, around its centre; one lying flat on a floor has its depth up. Bullets, the
// knife and the pick-up hold ask this; the Bulletproof Camera's bulletproof front is the shot judge's (bpCamsShot).
import { DEG, forwardXZ, rightXZ, type Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import { tubeBox } from "./cluster.js";
import { isIngredient, kindId } from "./kinds.js";
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

/** An entry's box (width, height, depth): its gadget data's, or an ingredient's (data/gadgets.json `ingredients`). */
export function sizeOf(data: GameData, kind: number): readonly [number, number, number] | null {
  const id = kindId(kind) ?? "";
  if (isIngredient(kind)) return data.gadgetRules.ingredients[id as keyof GameData["gadgetRules"]["ingredients"]].sizeM;
  return data.gadgets.get(id)?.sizeM ?? null;
}

/** One box of an entry: its centre, its facing and its half sizes in its own frame. */
export interface GadgetBox {
  pos: Vec3;
  /** Its facing (radians, as an entry's), and how far it leans back (radians: its top toward its back). */
  yaw: number;
  pitch: number;
  half: Vec3;
  /** Drawn see-through (Skopós's barrier's canopy): it stops what the rest does. */
  glass: boolean;
}

/**
 * The boxes of an entry built of `parts` (Skopós's idle shell's barrier, the game's model: D-157), or null for a plain
 * one: each centred `at` (across, up from the entry's bottom, forward from its position), turned with the entry and by
 * its own `yawDeg`, leaning back `pitchDeg`.
 */
export function partBoxes(data: GameData, g: Pick<Gadget, "kind" | "pos" | "yaw">): GadgetBox[] | null {
  const d = data.gadgets.get(kindId(g.kind) ?? "");
  if (!d?.parts) return null;
  const [fx, fz] = forwardXZ(g.yaw);
  const [rx, rz] = rightXZ(g.yaw);
  const base = g.pos[1] - d.sizeM[1] / 2;
  return d.parts.map((p) => ({
    pos: [g.pos[0] + rx * p.at[0] + fx * p.at[2], base + p.at[1], g.pos[2] + rz * p.at[0] + fz * p.at[2]] as Vec3,
    yaw: g.yaw + p.yawDeg * DEG,
    pitch: p.pitchDeg * DEG,
    half: [p.sizeM[0] / 2, p.sizeM[1] / 2, p.sizeM[2] / 2] as Vec3,
    glass: p.glass,
  }));
}

/** A ray's point (or direction) in a part's own frame: across, up and forward of it, its lean back undone. */
function partLocal(b: GadgetBox, v: readonly number[], point: boolean): Vec3 {
  const [x, y, z] = localOf({ pos: b.pos, yaw: b.yaw, flags: 0 } as unknown as Gadget, v, point);
  const c = Math.cos(b.pitch);
  const n = Math.sin(b.pitch);
  // Leaning back turns its up toward its back (−forward) and its forward up.
  return [x, y * c - z * n, y * n + z * c];
}

/**
 * Metres along a ray from `origin` (unit `dir`) to where it meets an entry's box, or null. A set-off cluster charge's
 * tube (Phase 8 M5, gadgets/cluster.ts) is part of it: it can be shot from the surface's far side. One built of parts
 * (partBoxes) is met where the ray meets its first part.
 */
export function rayToGadget(data: GameData, g: Gadget, origin: Vec3, dir: Vec3, maxT: number): number | null {
  const size = sizeOf(data, g.kind);
  if (!size || g.flags & GFlag.Flying) return null;
  const parts = partBoxes(data, g);
  if (parts) {
    let best: number | null = null;
    for (const b of parts) {
      const t = enterBox(partLocal(b, origin, true), partLocal(b, dir, false), b.half, best ?? maxT);
      if (t !== null && (best === null || t < best)) best = t;
    }
    return best;
  }
  const o = localOf(g, origin, true);
  // A gas pipe stands from the floor up, its entry `pointM` up it (Ulo's test): its box is that much higher than centred.
  if (isIngredient(g.kind) && kindId(g.kind) === "gas_pipe") o[1] -= size[1] / 2 - data.gadgetRules.ingredients.gas_pipe.pointM;
  const d = localOf(g, dir, false);
  const t = enterBox(o, d, halfSize(g, size), maxT);
  const tube = tubeBox(data, g);
  if (!tube) return t;
  const tt = enterBox([o[0] - tube.center[0], o[1] - tube.center[1], o[2] - tube.center[2]], d, tube.half, t ?? maxT);
  return tt !== null && (t === null || tt < t) ? tt : t;
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
