// What a blast does (Phase 8 M2, gadgets/DESIGN.md §5; Ubisoft's RealBlast, research/destruction.md §5): damage to
// bodies and drones by a falloff curve, from the blast to each one's nearest hitbox point, stopped by the level and
// steel, a fraction getting through each soft surface on the way (shrapnel); a charge on a wall hurts its placer's side
// by its own curve; the Claymore only in front (and a little behind), for what it destroys too. Gadgets, barricades and
// drones in its destruction range are destroyed; its cut goes into the panel it's on (a charge) or every panel close by (a grenade). This computes
// it; the room applies it (net/room.ts: damage with credit, panel ops, the gadget table).
import { DEG, forwardXZ, type Vec3 } from "../core/math.js";
import type { BlastFalloff, GadgetData } from "../data/schemas.js";
import { explosiveOps } from "../destruction/explosives.js";
import { L_STEEL } from "../destruction/panel.js";
import type { IndexedOp, PanelEntry } from "../destruction/panels.js";
import { QUERY_BULLET } from "../physics/rapier.js";
import { droneHitboxes } from "../player/drone.js";
import { poseHitboxes, type Hitbox } from "../player/hitboxes.js";
import type { Pawn } from "../player/pawn.js";
import { PawnKind, PawnMode } from "../player/types.js";
import type { Sim } from "../sim.js";
import { kindId } from "./kinds.js";
import { GFlag, type Gadget } from "./table.js";

type Blast = NonNullable<GadgetData["blast"]>;

export interface BlastEffects {
  /** Each body or drone it reaches, and the damage (whole points, at least 1). */
  bodies: { pawn: Pawn; damage: number }[];
  /** Entries it destroys (not the one that went off). */
  gadgets: Gadget[];
  /** What it does to panels, in order. */
  panelOps: IndexedOp[];
}

/** Damage at `d` metres by a falloff curve. */
export function blastFalloff(f: BlastFalloff, d: number): number {
  if (d <= f.fullM) return f.max;
  if (d >= f.zeroM) return 0;
  return (f.max * (f.zeroM - d)) / (f.zeroM - f.fullM);
}

/**
 * What a blast's line from `from` to `to` meets: the level or steel stop it; each soft panel it passes (by its solid
 * material) lets `throughSoft` through. `skip`: the panel the charge itself is on, which neither stops nor dims its own
 * blast (it's blowing a hole in it: a Hard Breach Charge's steel too).
 */
export function blastLine(sim: Sim, from: Vec3, to: Vec3, skip: number): { blocked: boolean; soft: number } {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-6) return { blocked: false, soft: 0 };
  const dir: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
  const ray = new sim.R.Ray({ x: from[0], y: from[1], z: from[2] }, { x: dir[0], y: dir[1], z: dir[2] });
  if (sim.world.castRay(ray, len, true, undefined, QUERY_BULLET)) return { blocked: true, soft: 0 };
  const passed = new Set<number>();
  for (const { entry, crossing } of sim.level.panels.crossings(from, dir, len)) {
    const index = entry.panel.spec.index;
    if (!crossing.solid || index === skip) continue;
    if (crossing.layer === L_STEEL) return { blocked: true, soft: 0 };
    passed.add(index);
  }
  return { blocked: false, soft: passed.size };
}

/** The point of a capsule nearest `p`. */
function nearestOn(h: Hitbox, p: Vec3): Vec3 {
  const ab = [h.b[0] - h.a[0], h.b[1] - h.a[1], h.b[2] - h.a[2]];
  const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - h.a[0]) * ab[0] + (p[1] - h.a[1]) * ab[1] + (p[2] - h.a[2]) * ab[2]) / len2)) : 0;
  const c: Vec3 = [h.a[0] + ab[0] * t, h.a[1] + ab[1] * t, h.a[2] + ab[2] * t];
  // Out to the capsule's surface toward p (the centre if p is inside it).
  const v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d = Math.hypot(v[0], v[1], v[2]);
  if (d <= h.radius) return c;
  return [c[0] + (v[0] / d) * h.radius, c[1] + (v[1] / d) * h.radius, c[2] + (v[2] / d) * h.radius];
}

/** A pawn's hitboxes now (a body's or a drone's). */
function hitboxesOf(sim: Sim, pawn: Pawn): Hitbox[] {
  return pawn.kind === PawnKind.Drone ? droneHitboxes(sim.data.intel.drone, pawn.state) : poseHitboxes(sim.data.movement, sim.data.hitboxes, pawn.state);
}

/** The way a gadget on a wall faces (out of it, toward its placer's side), or null off a wall. */
function wallFacing(g: Pick<Gadget, "yaw" | "flags">): Vec3 | null {
  if (g.flags & (GFlag.OnFloor | GFlag.Flat | GFlag.Flying)) return null;
  const [fx, fz] = forwardXZ(g.yaw);
  return [fx, 0, fz];
}

/** Whether a point is in the Claymore's arc: within `arcDeg` of its facing, or within `behindM` behind it. */
function inArc(b: Blast, g: Pick<Gadget, "yaw">, at: Vec3, p: Vec3): boolean {
  if (b.arcDeg >= 360) return true;
  const [fx, fz] = forwardXZ(g.yaw);
  const vx = p[0] - at[0];
  const vz = p[2] - at[2];
  const h = Math.hypot(vx, vz);
  if (h < 1e-6) return true;
  const ahead = (vx * fx + vz * fz) / h;
  if (ahead >= Math.cos((b.arcDeg / 2) * DEG)) return true;
  return Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]) <= b.behindM;
}

/** Panels whose box comes within `r` of `p`, with the nearest point of each. */
function panelsNear(sim: Sim, p: Vec3, r: number): { entry: PanelEntry; at: Vec3; d: number }[] {
  const out: { entry: PanelEntry; at: Vec3; d: number }[] = [];
  for (const entry of sim.level.panels.list) {
    const f = entry.frame;
    const rel = [p[0] - f.center[0], p[1] - f.center[1], p[2] - f.center[2]];
    const dot = (a: Vec3) => rel[0] * a[0] + rel[1] * a[1] + rel[2] * a[2];
    const lu = Math.max(-f.w / 2, Math.min(f.w / 2, dot(f.u)));
    const lv = Math.max(-f.h / 2, Math.min(f.h / 2, dot(f.v)));
    const ln = Math.max(-f.t / 2, Math.min(f.t / 2, dot(f.n)));
    const at: Vec3 = [0, 1, 2].map((k) => f.center[k] + f.u[k] * lu + f.v[k] * lv + f.n[k] * ln) as Vec3;
    const d = Math.hypot(at[0] - p[0], at[1] - p[1], at[2] - p[2]);
    if (d <= r) out.push({ entry, at, d });
  }
  return out.sort((a, b) => a.d - b.d);
}

/**
 * What the blast of entry `g` (kind and data `data`) going off at `at` does now. `g.panel` is the panel a charge is
 * on (its cut goes there, and that panel doesn't dim its damage).
 */
export function blastEffects(sim: Sim, g: Pick<Gadget, "id" | "kind" | "yaw" | "flags" | "panel">, data: GadgetData, at: Vec3): BlastEffects {
  const b = data.blast;
  const out: BlastEffects = { bodies: [], gadgets: [], panelOps: [] };
  if (!b) return out;
  const facing = wallFacing(g);
  // Bodies and drones (not one in its owner's hand), each by its hitbox point nearest the blast.
  for (const pawn of sim.pawns.values()) {
    const s = pawn.state;
    if (s.mode === PawnMode.Dead || s.mode === PawnMode.Held) continue;
    let best = 0;
    for (const h of hitboxesOf(sim, pawn)) {
      const p = nearestOn(h, at);
      if (!inArc(b, g, at, p)) continue;
      const d = Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]);
      // A charge on a wall: its placer's side (the side it faces) by `near`, the far side by `damage`.
      const curve = facing && b.near && (p[0] - at[0]) * facing[0] + (p[2] - at[2]) * facing[2] > 0 ? b.near : b.damage;
      if (d >= curve.zeroM && curve.zeroM > 0) continue;
      const line = blastLine(sim, at, p, g.panel);
      if (line.blocked) continue;
      best = Math.max(best, blastFalloff(curve, d) * b.throughSoft ** line.soft);
    }
    if (best > 0) out.bodies.push({ pawn, damage: Math.max(1, Math.round(best)) });
  }
  // Gadgets in its destruction range (and the Claymore's arc), in sight of it (the level and steel shelter them).
  for (const e of sim.gadgets.list) {
    if (e.id === g.id || e.flags & GFlag.Flying) continue;
    const d = Math.hypot(e.pos[0] - at[0], e.pos[1] - at[1], e.pos[2] - at[2]);
    if (d > b.destroyM || !inArc(b, g, at, e.pos) || blastLine(sim, at, e.pos, e.panel === g.panel ? g.panel : -1).blocked) continue;
    if (!sim.data.gadgets.get(kindId(e.kind) ?? "")) continue;
    out.gadgets.push(e);
  }
  // Panels: a charge cuts its shape into the panel it's on; a grenade cuts every panel within `cutM` (smaller with
  // distance), breaks barricades and wears hatches; barricades within its destruction range break too.
  const ex = b.cut ? sim.data.destruction.explosives[b.cut] : undefined;
  if (ex && g.panel >= 0 && facing) {
    const from: Vec3 = [at[0] + facing[0] * 0.3, at[1], at[2] + facing[2] * 0.3];
    out.panelOps.push(...explosiveOps(sim.level.panels, sim.data.destruction, ex, from, [-facing[0], 0, -facing[2]], 1));
  } else if (ex && g.panel >= 0 && g.flags & GFlag.Flat) {
    out.panelOps.push(...explosiveOps(sim.level.panels, sim.data.destruction, ex, [at[0], at[1] + 0.3, at[2]], [0, -1, 0], 1));
  } else if (ex) {
    for (const { entry, at: near, d } of panelsNear(sim, at, b.cutM)) {
      if (blastLine(sim, at, near, entry.panel.spec.index).blocked && d > 0.05) continue;
      const scale = ex.shape === "disc" ? Math.max(0.2, 1 - d / Math.max(b.cutM, 1e-6)) : 1;
      const v: Vec3 = [near[0] - at[0], near[1] - at[1], near[2] - at[2]];
      const len = Math.hypot(v[0], v[1], v[2]);
      // From just off its surface into it (from the blast when it's not right on it).
      const dir: Vec3 = len > 1e-4 ? [v[0] / len, v[1] / len, v[2] / len] : [-entry.frame.n[0], -entry.frame.n[1], -entry.frame.n[2]];
      const from: Vec3 = [near[0] - dir[0] * 0.2, near[1] - dir[1] * 0.2, near[2] - dir[2] * 0.2];
      const sized = ex.shape === "disc" ? { ...ex, diameterM: ex.diameterM * scale } : ex;
      const ops = explosiveOps(sim.level.panels, sim.data.destruction, sized, from, dir, 0.4).filter((o) => o.panel === entry.panel.spec.index);
      out.panelOps.push(...ops);
    }
  }
  for (const { entry, at: near } of panelsNear(sim, at, b.destroyM)) {
    const p = entry.panel;
    if (p.kind !== "barricade" || p.broken || p.empty || out.panelOps.some((o) => o.panel === p.spec.index)) continue;
    if (!inArc(b, g, at, near) || blastLine(sim, at, near, p.spec.index).blocked) continue;
    out.panelOps.push({ panel: p.spec.index, op: { kind: "damage", amount: Math.max(1, p.hp), hard: false } });
  }
  return out;
}
