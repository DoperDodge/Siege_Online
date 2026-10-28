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

/**
 * The rope of face `i` at (x, z): from the bottom to the top of the faces in its plane over that spot, joined where
 * one stands on another, the run that height `y` is in (within a few centimetres), or null.
 */
export function ropeAt(faces: readonly RappelFace[], i: number, x: number, z: number, y: number): [number, number] | null {
  const f = faces[i];
  const u = f.t[0] * x + f.t[1] * z;
  const runs: [number, number][] = [];
  for (const g of faces) if (samePlane(f, g) && u >= g.u0 - 1e-6 && u <= g.u1 + 1e-6) runs.push([g.y0, g.y1]);
  runs.sort((a, b) => a[0] - b[0]);
  let cur: [number, number] | null = null;
  for (const r of runs) {
    if (cur && r[0] <= cur[1] + JOIN_M) {
      cur[1] = Math.max(cur[1], r[1]);
      continue;
    }
    if (cur && y >= cur[0] - JOIN_M && y <= cur[1] + JOIN_M) return cur;
    cur = [r[0], r[1]];
  }
  return cur && y >= cur[0] - JOIN_M && y <= cur[1] + JOIN_M ? cur : null;
}

/**
 * The rope a body hangs on, drawn from where it is: the face whose rope line (`hang` out from the wall) it's on and
 * whose extent it's in, and that rope's run at its middle (a body's height `height`), or null. Works for bodies
 * seen from afar too, which don't carry their face.
 */
export function ropeOf(faces: readonly RappelFace[], x: number, y: number, z: number, hang: number, height: number): [number, number] | null {
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    const u = f.t[0] * x + f.t[1] * z;
    if (u < f.u0 - 1e-3 || u > f.u1 + 1e-3 || Math.abs(f.n[0] * x + f.n[1] * z - f.d - hang) > 0.05) continue;
    const rope = ropeAt(faces, i, x, z, y + height / 2);
    if (rope) return rope;
  }
  return null;
}
