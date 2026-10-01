// Lag compensation (PLAN §5): the server keeps ~1 s of every pawn exactly as clients received it (the
// quantized snapshot states) and, for a shot, rebuilds the hitboxes the shooter was looking at: the same
// interpolation between the same two snapshots the client drew, stance and lean included (the rewind is
// capped per room, DECISIONS D-045). Level geometry is tested as it is now; destruction at the rewound time
// joins in Phase 4.
import type { Vec3 } from "../core/math.js";
import type { BodyEntry } from "../combat/damage.js";
import type { Hitbox } from "../player/hitboxes.js";
import { poseHitboxes } from "../player/hitboxes.js";
import { PawnMode } from "../player/types.js";
import type { Sim } from "../sim.js";
import { interpolateRemote, quantizeRemote, remoteState, SNAPSHOT_EVERY, type RemoteQ } from "./snapshot.js";

export interface RewindHit {
  pawnId: number;
  part: Hitbox["part"];
  distance: number;
  point: Vec3;
}

interface Frame {
  tick: number;
  pawns: Map<number, { q: RemoteQ; maxHp: number }>;
}

/** Which snapshot ticks one client was sent (a client blends only the snapshots it actually received). */
export interface SentTicks {
  has(tick: number): boolean;
}

/** The last `capacity` snapshot ticks sent to one client. */
export class SentRing implements SentTicks {
  private readonly ticks: number[];
  constructor(readonly capacity = 64) {
    this.ticks = new Array(capacity).fill(-1);
  }
  add(tick: number) {
    this.ticks[(tick / SNAPSHOT_EVERY) % this.capacity] = tick;
  }
  has(tick: number) {
    return tick >= 0 && this.ticks[(tick / SNAPSHOT_EVERY) % this.capacity] === tick;
  }
}

export class HitboxHistory {
  private readonly frames: (Frame | undefined)[];
  /** Hitboxes already built for a (frame, frame, blend) this tick: all pellets of a shot, all shots of a tick. */
  private readonly memo = new Map<string, Map<number, Hitbox[]>>();

  /** `capacity` snapshots of history (32 snapshots = 1 s at 64 Hz with a snapshot every 2nd tick). */
  constructor(
    private readonly sim: Sim,
    readonly capacity = 32,
  ) {
    this.frames = new Array(capacity);
  }

  /** Call once per tick after stepping; snapshot ticks store every live pawn as clients receive it. */
  record(): void {
    this.memo.clear();
    const tick = this.sim.tick;
    if (tick % SNAPSHOT_EVERY !== 0) return;
    const pawns = new Map<number, { q: RemoteQ; maxHp: number }>();
    for (const p of this.sim.pawns.values()) {
      if (p.state.mode === PawnMode.Dead) continue;
      pawns.set(p.id, { q: quantizeRemote(p.state), maxHp: p.state.maxHp });
    }
    this.frames[(tick / SNAPSHOT_EVERY) % this.capacity] = { tick, pawns };
  }

  private frame(tick: number): Frame | undefined {
    const slot = (((tick / SNAPSHOT_EVERY) % this.capacity) + this.capacity) % this.capacity;
    const f = this.frames[slot];
    return f && f.tick === tick ? f : undefined;
  }

  /** Oldest and newest stored snapshot ticks. */
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
   * Every pawn's hitboxes as a client drew them at render time `tick` (fractional): the two snapshots
   * around it, blended with interpolateRemote. With `sent`, only snapshots that client was sent count (it
   * blends across one it was never sent). A pawn in only one of the two is drawn from that one.
   */
  at(tick: number, sent?: SentTicks): Map<number, Hitbox[]> {
    let a: Frame | undefined;
    let b: Frame | undefined;
    if (!sent) {
      const t0 = Math.floor(tick / SNAPSHOT_EVERY) * SNAPSHOT_EVERY;
      a = this.frame(t0);
      b = this.frame(t0 + SNAPSHOT_EVERY);
    } else {
      for (const f of this.frames) {
        if (!f || !sent.has(f.tick)) continue;
        if (f.tick <= tick && (!a || f.tick > a.tick)) a = f;
        if (f.tick > tick && (!b || f.tick < b.tick)) b = f;
      }
    }
    const u = a && b ? (tick - a.tick) / (b.tick - a.tick) : 0;
    const key = `${a?.tick}:${b?.tick}:${u}`;
    const cached = this.memo.get(key);
    if (cached) return cached;
    const out = new Map<number, Hitbox[]>();
    const m = this.sim.data.movement;
    const hb = this.sim.data.hitboxes;
    const ids = new Set([...(a?.pawns.keys() ?? []), ...(b?.pawns.keys() ?? [])]);
    for (const id of ids) {
      const pa = a?.pawns.get(id);
      const pb = b?.pawns.get(id);
      const sa = pa && remoteState(pa.q, pa.maxHp);
      const sb = pb && remoteState(pb.q, pb.maxHp);
      const s = sa && sb ? interpolateRemote(sa, sb, u) : (sa ?? sb)!;
      out.set(id, poseHitboxes(m, hb, s));
    }
    this.memo.set(key, out);
    return out;
  }

  /** The render tick a shot is judged at: `viewTick`, but at most `maxRewind` ticks before `nowTick`. */
  static rewound(viewTick: number, nowTick: number, maxRewind: number): number {
    return Math.min(nowTick, Math.max(viewTick, nowTick - maxRewind));
  }

  /**
   * The first hitbox a ray crosses, with the pawns rewound to render time `viewTick` (clamped to at most
   * `maxRewind` ticks before `nowTick`), stopping at `maxDistance` (e.g. where it hits a wall). `ignore`
   * skips pawns (the shooter's own bodies).
   */
  raycast(
    origin: Vec3,
    dir: Vec3,
    maxDistance: number,
    viewTick: number,
    nowTick: number,
    maxRewind: number,
    ignore: ReadonlySet<number> = new Set(),
    sent?: SentTicks,
  ): RewindHit | null {
    const first = this.raycastAll(origin, dir, maxDistance, HitboxHistory.rewound(viewTick, nowTick, maxRewind), ignore, sent)[0];
    if (!first) return null;
    const { part, t } = first.parts[0];
    return { pawnId: first.id, part, distance: t, point: [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t] };
  }

  /**
   * Every pawn the ray enters before `maxDistance` at render time `tick` (no cap applied here), nearest
   * first, each with all the hitboxes it crosses, nearest first: what penetration (combat/damage.ts) needs.
   */
  raycastAll(origin: Vec3, dir: Vec3, maxDistance: number, tick: number, ignore: ReadonlySet<number> = new Set(), sent?: SentTicks): BodyEntry[] {
    const out: BodyEntry[] = [];
    for (const [pawnId, boxes] of this.at(tick, sent)) {
      if (ignore.has(pawnId)) continue;
      const parts: BodyEntry["parts"] = [];
      for (const h of boxes) {
        const t = rayCapsule(origin, dir, h.a, h.b, h.radius);
        if (t !== null && t <= maxDistance) parts.push({ part: h.part, t });
      }
      if (parts.length === 0) continue;
      parts.sort((x, y) => x.t - y.t);
      out.push({ id: pawnId, parts });
    }
    return out.sort((x, y) => x.parts[0].t - y.parts[0].t || x.id - y.id);
  }
}

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
