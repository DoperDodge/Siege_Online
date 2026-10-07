// The knife (Phase 3 M8; DECISIONS D-050; research/core_mechanics.md §12): what a swing reaches, judged on
// the server against everyone as the attacker's client drew them (net/lagComp.ts), like a shot. Reach is
// measured across the floor from the attacker's body, with a height allowance, so a standing player can
// reach someone lying down; the part must be inside a cone around where they look, with nothing solid in
// between. All of it is placeholder (data/combat.json `melee`).
import { DEG, forwardXZ, type Vec3 } from "../core/math.js";
import type { Hitbox } from "../player/hitboxes.js";
import type { Sim } from "../sim.js";
import { traceStatic } from "./hitreg.js";
import { zoneOf, type Zone } from "./damage.js";

export interface MeleeHit {
  pawnId: number;
  zone: Zone;
  /** Across the floor from the attacker's body to the part hit. */
  reach: number;
}

/**
 * The body a knife swing from `eye` (attacker standing at `feet`, looking along `yaw`) reaches, among the
 * posed `bodies` (rewound): the nearest across the floor, lowest id on a tie; `ignore` skips bodies (the
 * attacker's own, the dead). Null if none.
 */
export function judgeMelee(sim: Sim, eye: Vec3, feet: { x: number; z: number }, yaw: number, bodies: ReadonlyMap<number, Hitbox[]>, ignore: ReadonlySet<number>): MeleeHit | null {
  const m = sim.data.combat.melee;
  const [fx, fz] = forwardXZ(yaw);
  const cosCone = Math.cos(m.coneHalfAngleDeg * DEG);
  let best: MeleeHit | null = null;
  for (const [id, boxes] of bodies) {
    if (ignore.has(id)) continue;
    let mine: (MeleeHit & { point: Vec3 }) | null = null;
    for (const h of boxes) {
      const p = surfacePoint(eye, h);
      const dx = p[0] - feet.x;
      const dz = p[2] - feet.z;
      const reach = Math.hypot(dx, dz);
      if (reach > m.reach || Math.abs(p[1] - eye[1]) > m.verticalReach) continue;
      if (reach > 1e-3 && (dx * fx + dz * fz) / reach < cosCone) continue; // outside the cone
      if (!mine || reach < mine.reach) mine = { pawnId: id, zone: zoneOf(h.part), reach, point: p };
    }
    if (!mine) continue;
    // Nothing solid between the eye and the part (a thin wall, a floor edge).
    const d: Vec3 = [mine.point[0] - eye[0], mine.point[1] - eye[1], mine.point[2] - eye[2]];
    const len = Math.hypot(...d);
    if (len > 1e-4) {
      const wall = traceStatic(sim, eye, [d[0] / len, d[1] / len, d[2] / len], len);
      if (wall !== null && wall < len - 0.05) continue;
    }
    if (!best || mine.reach < best.reach || (mine.reach === best.reach && id < best.pawnId)) best = { pawnId: id, zone: mine.zone, reach: mine.reach };
  }
  return best;
}

/** The point on a hitbox capsule's surface nearest to `p`. */
function surfacePoint(p: Vec3, h: Hitbox): Vec3 {
  const ab: Vec3 = [h.b[0] - h.a[0], h.b[1] - h.a[1], h.b[2] - h.a[2]];
  const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const u = l2 > 1e-12 ? Math.max(0, Math.min(1, ((p[0] - h.a[0]) * ab[0] + (p[1] - h.a[1]) * ab[1] + (p[2] - h.a[2]) * ab[2]) / l2)) : 0;
  const c: Vec3 = [h.a[0] + ab[0] * u, h.a[1] + ab[1] * u, h.a[2] + ab[2] * u];
  const v: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d = Math.hypot(...v);
  if (d <= h.radius) return p; // inside it
  return [c[0] + (v[0] / d) * h.radius, c[1] + (v[1] / d) * h.radius, c[2] + (v[2] / d) * h.radius];
}
