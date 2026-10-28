// Rappel faces (Phase 5 M8): the level's rappel zones (DECISIONS D-105: a thin box just outside each outside wall
// above ground, its normal looking out) as the planes a rope hangs on. Faces in one plane one above the other (a
// tower's storeys) make one rope, so a body can rappel from the Cat Walk's roof down to the ground.
import type { LevelDef } from "../data/schemas.js";

export interface RappelFace {
  id: string;
  /** Outward unit normal (horizontal, x and z). */
  n: [number, number];
  /** The wall's outer face: n·(x, z) = d. */
  d: number;
  /** Along the face: u = t·(x, z), t = (−n.z, n.x); the face spans u0..u1. */
  t: [number, number];
  u0: number;
  u1: number;
  y0: number;
  y1: number;
}

/** Faces whose walls stand this close to one plane hang one rope (storeys' walls a few centimetres apart). */
const PLANE_M = 0.1;
/** Faces this close one above the other join. */
const JOIN_M = 0.05;

/** The level's rappel faces, in zone order (a body's `rappel` is an index into this). */
export function rappelFaces(def: LevelDef): RappelFace[] {
  const out: RappelFace[] = [];
  for (const z of def.zones) {
    if (z.kind !== "rappel") continue;
    if (!z.normal) throw new Error(`rappel zone ${z.id} has no normal`);
    const len = Math.hypot(z.normal[0], z.normal[2]);
    const n: [number, number] = [z.normal[0] / len, z.normal[2] / len];
    const t: [number, number] = [-n[1], n[0]];
    for (const b of z.boxes) {
      if (b.yawDeg !== 0) throw new Error(`rappel zone ${z.id}: a face's box is turned (only upright, axis-aligned faces are built)`);
      // Thin along the normal: the wall's face is its inner side.
      const thick = Math.abs(n[0]) * b.size[0] + Math.abs(n[1]) * b.size[2];
      const along = Math.abs(t[0]) * b.size[0] + Math.abs(t[1]) * b.size[2];
      const cu = t[0] * b.center[0] + t[1] * b.center[2];
      out.push({
        id: z.id,
        n,
        d: n[0] * b.center[0] + n[1] * b.center[2] - thick / 2,
        t,
        u0: cu - along / 2,
        u1: cu + along / 2,
        y0: b.center[1] - b.size[1] / 2,
        y1: b.center[1] + b.size[1] / 2,
      });
    }
  }
  return out;
}

/** Whether two faces hang one rope where they overlap: the same way out, the same plane. */
export const samePlane = (a: RappelFace, b: RappelFace) => a.n[0] * b.n[0] + a.n[1] * b.n[1] > 0.999 && Math.abs(a.d - b.d) <= PLANE_M;

/** A rope's run: its bottom and top, and the outermost of its faces' planes (a body on it hangs off that one). */
export interface RopeRun {
  y0: number;
  y1: number;
  d: number;
}

/**
 * The rope of face `i` at along-position `u` (t·(x, z)): from the bottom to the top of the faces in its plane over
 * that spot, joined where one stands on another, the run that height `y` is in (within a few centimetres), or null.
 * Its `d` is the outermost plane among the faces joined (storeys' walls a few centimetres apart: a body hanging off
 * it clears each on the way up).
 */
export function ropeRun(faces: readonly RappelFace[], i: number, u: number, y: number): RopeRun | null {
  const f = faces[i];
  const runs: RappelFace[] = [];
  for (const g of faces) if (samePlane(f, g) && u >= g.u0 - 1e-6 && u <= g.u1 + 1e-6) runs.push(g);
  runs.sort((a, b) => a.y0 - b.y0);
  let cur: RopeRun | null = null;
  for (const g of runs) {
    if (cur && g.y0 <= cur.y1 + JOIN_M) {
      cur.y1 = Math.max(cur.y1, g.y1);
      cur.d = Math.max(cur.d, g.d);
      continue;
    }
    if (cur && y >= cur.y0 - JOIN_M && y <= cur.y1 + JOIN_M) return cur;
    cur = { y0: g.y0, y1: g.y1, d: g.d };
  }
  return cur && y >= cur.y0 - JOIN_M && y <= cur.y1 + JOIN_M ? cur : null;
}

/** The rope of face `i` at (x, z), the run that height `y` is in: its bottom and top (ropeRun), or null. */
export function ropeAt(faces: readonly RappelFace[], i: number, x: number, z: number, y: number): [number, number] | null {
  const f = faces[i];
  const run = ropeRun(faces, i, f.t[0] * x + f.t[1] * z, y);
  return run ? [run.y0, run.y1] : null;
}

/**
 * The rope a body hangs on, drawn from where it is: on face `face`'s rope when the body carries it, else (a body
 * seen from afar doesn't) the face whose rope line (`hang` out from the rope's plane, or up to `slack` further out: a
 * swing) it's nearest and whose extent it's in (at an inside corner, the next wall's line passes close by too). Where
 * that rope is fixed at its top (a body's height `height`, its middle on the rope's run), or null.
 */
export function ropeOf(faces: readonly RappelFace[], x: number, y: number, z: number, hang: number, height: number, slack = 0, face = -1): { x: number; z: number; top: number } | null {
  let best: { x: number; z: number; top: number } | null = null;
  let bestOff = Infinity;
  for (let i = 0; i < faces.length; i++) {
    if (face >= 0 && i !== face) continue;
    const f = faces[i];
    const u = f.t[0] * x + f.t[1] * z;
    if (face < 0 && (u < f.u0 - 1e-3 || u > f.u1 + 1e-3)) continue;
    const run = ropeRun(faces, i, u, y + height / 2);
    if (!run) continue;
    const out = f.n[0] * x + f.n[1] * z - run.d;
    if (out < hang - 0.05 || out > hang + slack + 0.05 || Math.abs(out - hang) >= bestOff) continue;
    best = { x: f.n[0] * (run.d + hang) + f.t[0] * u, z: f.n[1] * (run.d + hang) + f.t[1] * u, top: run.y1 };
    bestOff = Math.abs(out - hang);
  }
  return best;
}
