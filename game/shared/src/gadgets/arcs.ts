// Shunt's Arc Packs (Project Redmond R3, gadgets/R3_OPERATORS.md §2): which surfaces a pack makes live. A pack standing
// on a floor (not in the air, not off under an EMP, not broken) electrifies the reinforced wall section or barricade it
// stands by and any deployable shield or barbed wire of its side's there (gadgets/serve.ts arcs burns devices out on
// them; net/room.ts shocks a knife on them). Read the same way by the server and by every client (its sparks).
import type { Vec3 } from "../core/math.js";
import type { GameData } from "../data/load.js";
import type { GadgetData } from "../data/schemas.js";
import type { PanelEntry } from "../destruction/panels.js";
import { raycastLevel, type LevelQuery } from "../level/raycast.js";
import type { Sim } from "../sim.js";
import { kindId } from "./kinds.js";
import { GFlag, type Gadget } from "./table.js";

export type ArcData = NonNullable<GadgetData["arc"]>;

/** The packs' numbers (the gadget that has them: the Arc Pack), or null. */
export function arcData(data: GameData): ArcData | null {
  for (const g of data.gadgets.values()) if (g.arc) return g.arc;
  return null;
}

/** Whether an entry is a pack that's live now. */
export function packLive(sim: Sim, g: Gadget): boolean {
  return !!sim.data.gadgets.get(kindId(g.kind) ?? "")?.arc && !(g.flags & (GFlag.Flying | GFlag.Off | GFlag.Broken));
}

/** Whether a panel is one a pack electrifies: a wall section with steel up, or a barricade standing. */
const arcable = (e: PanelEntry) => {
  const p = e.panel;
  return (p.kind === "wall" && p.reinforced > 0) || (p.kind === "barricade" && !p.broken && !p.empty);
};

/**
 * Where a pack put on the floor at `pos` (its box's middle; `size` its box) goes instead: against the foot of the
 * reinforced wall section or standing barricade whose face is within `snapM` in front of it (along its width, at its
 * foot), its front (the prongs) into it, at the same height; the nearest such face. Null when there's none, or the way
 * to it along the floor is blocked or has no floor (it stays where it was put). `panel`: the floor panel under it, or −1.
 */
export function packSnap(q: LevelQuery, size: readonly [number, number, number], pos: Vec3, snapM: number): { pos: Vec3; yaw: number; panel: number } | null {
  let best: { e: PanelEntry; n: number; u: number; gap: number } | null = null;
  for (const e of q.level.panels.list) {
    if (!arcable(e)) continue;
    const f = e.frame;
    const rel = [pos[0] - f.center[0], pos[1] - f.center[1], pos[2] - f.center[2]];
    const n = rel[0] * f.n[0] + rel[1] * f.n[1] + rel[2] * f.n[2];
    const u = rel[0] * f.u[0] + rel[1] * f.u[1] + rel[2] * f.u[2];
    const v = rel[0] * f.v[0] + rel[1] * f.v[1] + rel[2] * f.v[2];
    const gap = Math.abs(n) - f.t / 2;
    if (gap < 0 || gap > snapM || Math.abs(u) > f.w / 2 || v < -f.h / 2 - 0.3 || v > -f.h / 2 + 0.6) continue;
    if (!best || gap < best.gap) best = { e, n, u, gap };
  }
  if (!best) return null;
  const f = best.e.frame;
  const [w, , d] = size;
  const side = best.n < 0 ? -1 : 1;
  const u = Math.max(-(f.w / 2 - w / 2), Math.min(f.w / 2 - w / 2, best.u));
  const out = f.t / 2 + d / 2 + 0.01;
  const to: Vec3 = [f.center[0] + f.u[0] * u + f.n[0] * side * out, pos[1], f.center[2] + f.u[2] * u + f.n[2] * side * out];
  // Nothing in the way along the floor (a prop by the wall), and floor under it at the same height.
  const dx = to[0] - pos[0];
  const dz = to[2] - pos[2];
  const len = Math.hypot(dx, dz);
  if (len > 1e-3) {
    const hit = raycastLevel(q, pos, [dx / len, 0, dz / len], len + d / 2);
    if (hit && hit.t < len + d / 2 - 0.02) return null;
  }
  const floor = raycastLevel(q, [to[0], to[1] + 0.2, to[2]], [0, -1, 0], 0.2 + size[1]);
  if (!floor || Math.abs(to[1] + 0.2 - floor.t - (pos[1] - size[1] / 2)) > 0.05) return null;
  // Facing the face: forwardXZ(yaw) is −side × its normal. On the floor panel under it, if it's one.
  return { pos: to, yaw: Math.atan2(side * f.n[0], side * f.n[2]), panel: floor.panel?.entry.panel.spec.index ?? -1 };
}

/**
 * The panels a pack electrifies (their indices): a reinforced wall section, or a barricade standing, whose face is
 * within `reachM` of the pack, along its width and down at the pack's height (a pack on the floor by its foot).
 */
export function arcPanels(sim: Sim, g: Gadget, reachM: number): number[] {
  const out: number[] = [];
  for (const e of sim.level.panels.list) {
    if (!arcable(e)) continue;
    const p = e.panel;
    const f = e.frame;
    const rel = [g.pos[0] - f.center[0], g.pos[1] - f.center[1], g.pos[2] - f.center[2]];
    const across = Math.abs(rel[0] * f.n[0] + rel[1] * f.n[1] + rel[2] * f.n[2]) - f.t / 2;
    const along = Math.abs(rel[0] * f.u[0] + rel[1] * f.u[1] + rel[2] * f.u[2]);
    const up = rel[0] * f.v[0] + rel[1] * f.v[1] + rel[2] * f.v[2];
    if (across <= reachM && along <= f.w / 2 + 0.1 && up >= -f.h / 2 - 0.3 && up <= f.h / 2) out.push(p.spec.index);
  }
  return out;
}

/** The deployable shields and barbed wire of the pack's side's it electrifies: within `reachM` of it, past their own half size. */
export function arcGadgets(sim: Sim, g: Gadget, reachM: number): Gadget[] {
  return sim.gadgets.list.filter((x) => {
    if (x.id === g.id || x.team !== g.team || x.flags & (GFlag.Flying | GFlag.Broken)) return false;
    const d = sim.data.gadgets.get(kindId(x.kind) ?? "");
    if (!d || !(d.wire || (d.solid && d.side === "defender" && !d.mirror && !d.parts))) return false;
    return Math.hypot(x.pos[0] - g.pos[0], x.pos[2] - g.pos[2]) <= reachM + Math.max(d.sizeM[0], d.sizeM[2]) / 2 && Math.abs(x.pos[1] - g.pos[1]) < 1.2;
  });
}

/**
 * Whether an entry is a device of the other side's on a live surface now (`live`: liveSurfaces, if already worked
 * out): its detonator can't set it off, and it's burnt out (gadgets/serve.ts arcs).
 */
export function onLiveSurface(sim: Sim, g: Gadget, live?: ReturnType<typeof liveSurfaces>): boolean {
  if (g.panel < 0 || !arcData(sim.data)) return false;
  const pack = (live ?? liveSurfaces(sim)).panels.get(g.panel);
  return pack !== undefined && pack.team !== g.team;
}

/** Every live surface now: each electrified panel's index, and each electrified shield's or wire's entry id, to the pack doing it. */
export function liveSurfaces(sim: Sim): { panels: Map<number, Gadget>; gadgets: Map<number, Gadget> } {
  const panels = new Map<number, Gadget>();
  const gadgets = new Map<number, Gadget>();
  const k = arcData(sim.data);
  if (!k) return { panels, gadgets };
  for (const g of sim.gadgets.list) {
    if (!packLive(sim, g)) continue;
    for (const i of arcPanels(sim, g, k.reachM)) if (!panels.has(i)) panels.set(i, g);
    for (const x of arcGadgets(sim, g, k.reachM)) if (!gadgets.has(x.id)) gadgets.set(x.id, g);
  }
  return { panels, gadgets };
}
