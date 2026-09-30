// Lag compensation (PLAN §5): the server keeps ~1 s of every pawn's hitboxes, in the exact stance and
// lean pose of each tick, and tests a shot against them as they were when the shooter saw them (capped
// at 200 ms). Level geometry is tested as it is now; destruction at the rewound time joins in Phase 4.
import type { Vec3 } from "../core/math.js";
import type { Hitbox } from "../player/hitboxes.js";
import { poseHitboxes } from "../player/hitboxes.js";
import { PawnMode } from "../player/types.js";
import type { Sim } from "../sim.js";

export interface RewindHit {
  pawnId: number;
  part: Hitbox["part"];
  distance: number;
  point: Vec3;
}

interface Frame {
  tick: number;
  pawns: Map<number, Hitbox[]>;
}

export class HitboxHistory {
  private readonly frames: (Frame | undefined)[];

  /** `capacity` ticks of history (64 = 1 s at 64 Hz). */
  constructor(readonly capacity = 64) {
    this.frames = new Array(capacity);
  }

  /** Store every live pawn's hitboxes for the sim's current tick (call once per tick, after stepping). */
  record(sim: Sim): void {
    const pawns = new Map<number, Hitbox[]>();
    for (const p of sim.pawns.values()) {
      if (p.state.mode === PawnMode.Dead) continue;
      pawns.set(p.id, poseHitboxes(sim.data.movement, sim.data.hitboxes, p.state));
    }
    this.frames[sim.tick % this.capacity] = { tick: sim.tick, pawns };
  }

  private frame(tick: number): Frame | undefined {
    const f = this.frames[((tick % this.capacity) + this.capacity) % this.capacity];
    return f && f.tick === tick ? f : undefined;
  }

  /** Newest and oldest ticks still held. */
  get range(): { oldest: number; newest: number } | null {
    let oldest = Infinity;
    let newest = -Infinity;
    for (const f of this.frames) {
      if (!f) continue;
      oldest = Math.min(oldest, f.tick);
      newest = Math.max(newest, f.tick);
    }
    return newest === -Infinity ? null : { oldest, newest };
  }

  /**
   * Hitboxes as they were at `tick` (fractional ticks interpolate between the two stored poses, which is
   * what an interpolating client actually saw). Pawns missing from either frame use the one they are in.
   */
  at(tick: number): Map<number, Hitbox[]> {
    const t0 = Math.floor(tick);
    const a = this.frame(t0);
    const b = this.frame(t0 + 1);
    const u = tick - t0;
    if (!a && !b) return new Map();
    if (!a || !b || u === 0) return new Map((a ?? b)!.pawns);
    const out = new Map<number, Hitbox[]>();
    for (const [id, ha] of a.pawns) {
      const hb = b.pawns.get(id);
      if (!hb) {
        out.set(id, ha);
        continue;
      }
      out.set(id, ha.map((h, i) => ({ part: h.part, radius: h.radius, a: lerp3(h.a, hb[i].a, u), b: lerp3(h.b, hb[i].b, u) })));
    }
    for (const [id, hb] of b.pawns) if (!out.has(id)) out.set(id, hb);
    return out;
  }

  /**
   * The first hitbox a ray crosses, with the pawns rewound to `viewTick` (clamped to at most `maxRewind`
   * ticks before `nowTick`), stopping at `maxDistance` (e.g. where it hits a wall). `ignore` skips pawns
   * (the shooter's own bodies).
   */
  raycast(origin: Vec3, dir: Vec3, maxDistance: number, viewTick: number, nowTick: number, maxRewind: number, ignore: ReadonlySet<number> = new Set()): RewindHit | null {
    const tick = Math.min(nowTick, Math.max(viewTick, nowTick - maxRewind));
    let best: RewindHit | null = null;
    for (const [pawnId, boxes] of this.at(tick)) {
      if (ignore.has(pawnId)) continue;
      for (const h of boxes) {
        const t = rayCapsule(origin, dir, h.a, h.b, h.radius);
        if (t !== null && t <= maxDistance && (!best || t < best.distance)) {
          best = { pawnId, part: h.part, distance: t, point: [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t] };
        }
      }
    }
    return best;
  }
}

const lerp3 = (a: Vec3, b: Vec3, u: number): Vec3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];

/** Distance along a unit-length ray to a capsule (segment a–b, radius r), or null. A start inside hits at 0. */
export function rayCapsule(o: Vec3, d: Vec3, a: Vec3, b: Vec3, r: number): number | null {
  const ba: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const oa: Vec3 = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const baba = dot(ba, ba);
  if (baba < 1e-12) return raySphere(o, d, a, r);
  const bard = dot(ba, d);
  const baoa = dot(ba, oa);
  const rdoa = dot(d, oa);
  const oaoa = dot(oa, oa);
  // Already inside?
  const s = Math.min(1, Math.max(0, baoa / baba));
  const cx = a[0] + ba[0] * s - o[0];
  const cy = a[1] + ba[1] * s - o[1];
  const cz = a[2] + ba[2] * s - o[2];
  if (cx * cx + cy * cy + cz * cz <= r * r) return 0;
  // Infinite cylinder, then clip to the segment; otherwise the end caps (spheres).
  const qa = baba - bard * bard;
  const qb = baba * rdoa - baoa * bard;
  const qc = baba * oaoa - baoa * baoa - r * r * baba;
  let best: number | null = null;
  if (qa > 1e-12) {
    const h = qb * qb - qa * qc;
    if (h >= 0) {
      const t = (-qb - Math.sqrt(h)) / qa;
      const y = baoa + t * bard;
      if (t >= 0 && y > 0 && y < baba) best = t;
    }
  }
  for (const c of [a, b]) {
    const t = raySphere(o, d, c, r);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

function raySphere(o: Vec3, d: Vec3, c: Vec3, r: number): number | null {
  const oc: Vec3 = [o[0] - c[0], o[1] - c[1], o[2] - c[2]];
  const bq = dot(oc, d);
  const cq = dot(oc, oc) - r * r;
  if (cq <= 0) return 0;
  const h = bq * bq - cq;
  if (h < 0) return null;
  const t = -bq - Math.sqrt(h);
  return t >= 0 ? t : null;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
