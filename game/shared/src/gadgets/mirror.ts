// Mira's Black Mirror (Phase 8 M7; research/operators/mira.md §3; data/gadgets/black_mirror.json `mirror`): a
// window cut through every layer of a reinforceable wall and filled with glass, its entry standing in the middle of
// the wall's thickness, a solid box (sim.syncSolids) that stops bullets, blasts and bodies both ways. Seen through
// from the side it was placed from (its facing) while it's whole; a knife's shatter (GFlag.Hit) makes it opaque both
// ways; its canister destroyed, it's ejecting (GFlag.Active) and then ejected (GFlag.Broken: no glass, an open hole
// in its frame). It falls with its wall: when too much of a band round its window is gone through every layer.
import { forwardXZ, rightXZ, type Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import type { GadgetData } from "../data/schemas.js";
import { L_STEEL, type CutShape } from "../destruction/panel.js";
import type { IndexedOp, PanelEntry, PanelSet } from "../destruction/panels.js";
import { raycastLevel, type LevelHit, type LevelQuery } from "../level/raycast.js";
import type { Sim } from "../sim.js";
import { rayToGadget } from "./hits.js";
import { kindId } from "./kinds.js";
import { GFlag, type Gadget, type GadgetTable } from "./table.js";

export type MirrorData = NonNullable<GadgetData["mirror"]>;

/** An entry's gadget data and mirror, or null for anything else. */
export function mirrorOf(data: GameData, g: Gadget): { d: GadgetData; m: MirrorData } | null {
  const d = data.gadgets.get(kindId(g.kind) ?? "");
  return d?.mirror ? { d, m: d.mirror } : null;
}

/** Where a point is on a panel's face, in metres from its corner (u across, v up). */
function onPanel(entry: PanelEntry, p: Vec3): { u: number; v: number } {
  const f = entry.frame;
  const r = [p[0] - f.center[0], p[1] - f.center[1], p[2] - f.center[2]];
  return { u: r[0] * f.u[0] + r[1] * f.u[1] + r[2] * f.u[2] + f.w / 2, v: r[0] * f.v[0] + r[1] * f.v[1] + r[2] * f.v[2] + f.h / 2 };
}

/** Whether a glass `w` × `h` centred at `p` lies within the panel's face. */
export function windowFits(entry: PanelEntry, p: Vec3, w: number, h: number): boolean {
  const { u, v } = onPanel(entry, p);
  return u - w / 2 >= 0 && u + w / 2 <= entry.frame.w && v - h / 2 >= 0 && v + h / 2 <= entry.frame.h;
}

/** The ops that burn a mirror's window out of its wall: its glass's rectangle out of every layer there is, steel too. */
export function windowOps(panels: PanelSet, g: Gadget, d: GadgetData): IndexedOp[] {
  const entry = panels.list[g.panel];
  if (!entry) return [];
  const p = entry.panel;
  const { u, v } = onPanel(entry, g.pos);
  const [w, h] = d.sizeM;
  const shape: CutShape = { kind: "rect", u0: Math.round((u - w / 2) / p.cellU), v0: Math.round((v - h / 2) / p.cellV), u1: Math.round((u + w / 2) / p.cellU), v1: Math.round((v + h / 2) / p.cellV) };
  return p.layers.flatMap((cells, layer) => (cells ? [{ panel: g.panel, op: { kind: "cut" as const, layer, shape, hard: layer === L_STEEL } }] : []));
}

/**
 * Whether a mirror's wall still holds it: of the cells in a band `frameM` wide round its window (on the panel), no
 * more than `lossMax` are gone through every layer.
 */
export function mirrorHeld(panels: PanelSet, g: Gadget, d: GadgetData, m: MirrorData): boolean {
  const entry = panels.list[g.panel];
  if (!entry) return false;
  const p = entry.panel;
  if (p.broken) return false;
  const { u, v } = onPanel(entry, g.pos);
  const [w, h] = d.sizeM;
  const cu0 = Math.max(0, Math.floor((u - w / 2 - m.frameM) / p.cellU));
  const cu1 = Math.min(p.w - 1, Math.floor((u + w / 2 + m.frameM) / p.cellU));
  const cv0 = Math.max(0, Math.floor((v - h / 2 - m.frameM) / p.cellV));
  const cv1 = Math.min(p.h - 1, Math.floor((v + h / 2 + m.frameM) / p.cellV));
  let total = 0;
  let gone = 0;
  for (let cv = cv0; cv <= cv1; cv++)
    for (let cu = cu0; cu <= cu1; cu++) {
      const mu = (cu + 0.5) * p.cellU;
      const mv = (cv + 0.5) * p.cellV;
      // The window itself isn't the band.
      if (Math.abs(mu - u) < w / 2 && Math.abs(mv - v) < h / 2) continue;
      total++;
      const i = cv * p.w + cu;
      if (p.layers.every((cells) => !cells || !cells[i])) gone++;
    }
  return total === 0 || gone / total <= m.lossMax;
}

/**
 * Where a mirror's canister goes: on its placer's side, under the glass at its left as she faces it (the mirror's
 * own right: it faces her), off the wall's face.
 */
export function canisterSpot(data: GameData, g: Gadget, thicknessM: number): Vec3 | null {
  const a = mirrorOf(data, g);
  const c = a && data.gadgets.get(a.m.canister);
  if (!a || !c) return null;
  const [fx, fz] = forwardXZ(g.yaw);
  const [rx, rz] = rightXZ(g.yaw);
  const out = thicknessM / 2 + c.sizeM[2] / 2 + 0.01;
  const left = a.d.sizeM[0] / 2 - 0.12;
  const down = -a.d.sizeM[1] / 2 - c.sizeM[1] / 2 - 0.02;
  return [g.pos[0] + fx * out + rx * left, g.pos[1] + down, g.pos[2] + fz * out + rz * left];
}

/** Whether a mirror's glass is clear seen from `eye`: whole (not shattered, ejecting or not), and `eye` on its placer's side. */
export function seesThrough(g: Gadget, eye: Vec3): boolean {
  if (g.flags & GFlag.Hit) return false;
  const [fx, fz] = forwardXZ(g.yaw);
  return (eye[0] - g.pos[0]) * fx + (eye[2] - g.pos[2]) * fz > 0;
}

/** The mirrors standing in their walls with glass (not ejected): what sight, bullets and blasts meet. */
export function glassOf(data: GameData, table: GadgetTable): Gadget[] {
  return table.list.filter((g) => !(g.flags & (GFlag.Flying | GFlag.Broken)) && mirrorOf(data, g) !== null);
}

/**
 * What sight meets along a ray from `origin` (unit `dir`) within `maxT` (raycastLevel), seeing through a mirror
 * whose glass is clear from `origin` (one-way, from its placer's side). Scans and pings ask this.
 */
export function sightPast(sim: LevelQuery & Pick<Sim, "data" | "gadgets">, origin: Vec3, dir: Vec3, maxT: number): LevelHit | null {
  let from = 0;
  for (let k = 0; k < 4; k++) {
    const start: Vec3 = [origin[0] + dir[0] * from, origin[1] + dir[1] * from, origin[2] + dir[2] * from];
    const hit = raycastLevel(sim, start, dir, maxT - from);
    if (!hit || hit.panel) return hit && { ...hit, t: hit.t + from };
    const clear = glassOf(sim.data, sim.gadgets).find((g) => {
      const t = rayToGadget(sim.data, g, start, dir, hit.t + 0.05);
      return t !== null && Math.abs(t - hit.t) < 0.05 && seesThrough(g, origin);
    });
    if (!clear) return { ...hit, t: hit.t + from };
    from += hit.t + (mirrorOf(sim.data, clear)?.d.sizeM[2] ?? 0.04) + 0.02;
  }
  return null;
}
