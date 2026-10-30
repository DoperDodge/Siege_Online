// Quick Match's pre-setups (match/DESIGN.md §9): what a site's `preSetup` in the level puts up as prep starts, as
// panel ops the room applies and sends like any other: steel on every section of each wall listed, from the side its
// room is on (a hatch from its top), and each rotation hole cut through its wall. On top of the defenders' pool.
import type { DestructionData, LevelDef } from "../data/schemas.js";
import { L_BACK, L_CORE, L_FRONT, type PanelOp } from "../destruction/panel.js";
import type { IndexedOp, PanelSet } from "../destruction/panels.js";

/** A wall's room is looked for this far past each of its faces (as the map generator checks it, tools/mapgen/markers.ts). */
const PROBE_M = 0.3;

/** The ops of a site's pre-setup, in the order listed (none for a site without one, or a panel the level doesn't have). */
export function preSetupOps(level: LevelDef, panels: PanelSet, d: DestructionData, siteId: string): IndexedOp[] {
  const pre = level.sites.find((s) => s.id === siteId)?.preSetup;
  if (!pre) return [];
  const out: IndexedOp[] = [];
  for (const r of pre.reinforce) {
    const e = panels.byId.get(r.panel);
    if (!e) continue;
    const side = e.panel.kind === "hatch" ? 1 : sideOf(level, e.frame.center, e.frame.n, e.frame.t, r.from);
    if (side === null) continue;
    for (let section = 0; section < e.panel.sectionCount; section++) out.push({ panel: e.panel.spec.index, op: { kind: "reinforce", section, side } });
  }
  for (const h of pre.holes) {
    const e = panels.byId.get(h.panel);
    const size = d.rotationHoles[h.size];
    if (!e) continue;
    const p = e.panel;
    // Centred across the wall, in whole cells; [u0, u1) × [v0, v1) from the bottom.
    const half = size.widthM / 2 / p.cellU;
    const mid = p.w / 2;
    const shape = { kind: "rect", u0: Math.round(mid - half), v0: Math.round(size.bottomM / p.cellV), u1: Math.round(mid + half), v1: Math.round(size.topM / p.cellV) } as const;
    for (const layer of [L_FRONT, L_CORE, L_BACK]) if (p.layers[layer]) out.push({ panel: p.spec.index, op: { kind: "cut", layer, shape, hard: false } satisfies PanelOp });
  }
  return out;
}

/** The side of a wall (0: −n, 1: +n) its room `from` is on: the face whose probe lands in the room, or null. */
function sideOf(level: LevelDef, c: readonly number[], n: readonly number[], t: number, from: string | undefined): 0 | 1 | null {
  const room = level.rooms.find((r) => r.id === from);
  if (!room) return null;
  for (const side of [0, 1] as const) {
    const k = (side ? 1 : -1) * (t / 2 + PROBE_M);
    const x = c[0] + n[0] * k;
    const z = c[2] + n[2] * k;
    if (room.rects.some(([x0, z0, x1, z1]) => x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1))) return side;
  }
  return null;
}
