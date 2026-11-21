// Rivet's Stud Driver and its salvos (Project Redmond R3, gadgets/R3_OPERATORS.md §2; Ulo's design: hard breaches in a
// circle, a vertical line and an X, each a hole a body gets through once it's set off). The driver (data `driver`) lays
// one of its salvos (data `salvo`: gadget files of their own) where the view meets a surface (gadgets/place.ts
// salvoSpot); each salvo is a remote device whose blast cuts its shape (data/destruction.json `explosives`). Here:
// where a salvo's studs are (its model, and what a bullet has to meet to destroy it), how far its hole reaches below
// its middle (so its bottom can go a ledge over the floor), and which driver lays a kind.
import { forwardXZ, rightXZ, type Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import type { ExplosiveData, GadgetData } from "../data/schemas.js";
import type { GadgetBox } from "./hits.js";
import { kindId, kindOf } from "./kinds.js";
import { GFlag, type Gadget } from "./table.js";

/** Half a stud's box (m): what a bullet has to meet. */
export const STUD_HALF_M = 0.035;

/** The shape a salvo cuts (its blast's `cut`), or null. */
export function salvoCut(data: GameData, g: GadgetData): ExplosiveData | null {
  const cut = g.salvo ? g.blast?.cut : undefined;
  return (cut && data.destruction.explosives[cut]) || null;
}

/** How far a salvo's hole reaches below its middle where it's deepest across (m): its bottom, where a body gets through. */
export function holeBelow(ex: ExplosiveData): number {
  if (ex.shape === "disc") return ex.diameterM / 2;
  if (ex.shape === "rect") return ex.hM / 2;
  // An X: under its middle, the lower of its round middle and its two arms crossing there (each `armM` across, at 45°).
  return Math.max(ex.hubM / 2, ex.armM / Math.SQRT2);
}

/**
 * Where a salvo's studs are on its surface, from its middle (m: x across to its right, y up it; onSurface puts them in
 * the world): the Ring's eight round its edge, the Spine's six up its middle, the Cross's nine along its arms.
 */
export function studPoints(ex: ExplosiveData): [number, number][] {
  if (ex.shape === "disc") {
    const r = ex.diameterM / 2 - 0.09;
    return Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4) * r, Math.sin((i * Math.PI) / 4) * r]);
  }
  if (ex.shape === "rect") {
    const h = ex.hM / 2 - 0.1;
    return Array.from({ length: 6 }, (_, i) => [0, -h + (2 * h * i) / 5]);
  }
  const out: [number, number][] = [[0, 0]];
  for (const t of [ex.spanM / 4, ex.spanM / 2]) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) out.push([sx * t, sy * t]);
  return out;
}

/**
 * A point on an entry's surface (x across, y up it), in the world; one lying flat on a floor has its top toward its
 * placer (as its model lies: render/gadgetModels.ts).
 */
export function onSurface(g: Pick<Gadget, "pos" | "yaw" | "flags">, x: number, y: number): Vec3 {
  const [rx, rz] = rightXZ(g.yaw);
  if (g.flags & GFlag.Flat) {
    const [fx, fz] = forwardXZ(g.yaw);
    return [g.pos[0] + rx * x - fx * y, g.pos[1], g.pos[2] + rz * x - fz * y];
  }
  return [g.pos[0] + rx * x, g.pos[1] + y, g.pos[2] + rz * x];
}

/** A salvo's studs as boxes (what a bullet, a knife or a blast's reach meets of it), or null for anything else. */
export function studBoxes(data: GameData, g: Pick<Gadget, "kind" | "pos" | "yaw" | "flags">): GadgetBox[] | null {
  const d = data.gadgets.get(kindId(g.kind) ?? "");
  const ex = d && salvoCut(data, d);
  if (!ex) return null;
  const h = STUD_HALF_M;
  return studPoints(ex).map(([x, y]) => ({ pos: onSurface(g, x, y), yaw: g.yaw, pitch: 0, half: [h, h, h] as Vec3, glass: false }));
}

/**
 * A driver's salvos `owner` has out that its detonator sets off now: not off under an EMP, not set off already, and
 * ones `ok` takes (not in an enemy jammer's reach, not on a surface Shunt's pack makes live).
 */
export function salvosOut(list: readonly Gadget[], owner: number, driver: GadgetData, ok: (g: Gadget) => boolean): Gadget[] {
  const kinds = new Set((driver.driver?.lays ?? []).map(kindOf));
  return list.filter((x) => x.owner === owner && kinds.has(x.kind) && !(x.flags & (GFlag.Off | GFlag.Active)) && ok(x));
}

/** The driver that lays salvos of `kind` (Rivet's Stud Driver), or null. */
export function driverOf(data: GameData, kind: string): GadgetData | null {
  for (const g of data.gadgets.values()) if (g.driver?.lays.includes(kind)) return g;
  return null;
}

/** The salvo a driver lays now (its `pattern`'s), or null. */
export function laidBy(data: GameData, driver: GadgetData, pattern: number): GadgetData | null {
  const lays = driver.driver?.lays;
  return (lays && data.gadgets.get(lays[pattern % lays.length])) || null;
}
