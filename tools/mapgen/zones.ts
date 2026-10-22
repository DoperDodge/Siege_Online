// Zones (DESIGN §5.11, P34): areas later phases give meaning to, as boxes in world metres.
// - building, one per storey: its footprint (the space inside its walls and the walls themselves; the roofs are
//   outside, map_features §10) from its floor up to the next storey's floor, so a body anywhere inside is in one
//   storey's zone.
// - spawn_peek and out_of_bounds: map_features §10's candidates (UNVERIFIED) at the doors and windows layout.json
//   names: a box `zone.depthM` deep in front of the opening, inside it (where a defender stands to peek at the
//   attackers' spawn) or outside it (a run-out), as high as the opening's top, looking out of it.
// - rappel: the outer faces of the exterior walls above ground (map_features §8: every roof edge anchors a rappel
//   down the wall under it), a thin box just outside each stretch of face, looking out of it; none on the walls
//   of layout.rappel.refuse.
import { distanceInside, greedyRects } from "./grid.js";
import type { Floor } from "./research.js";
import { CELL_M, storeyOfBox, type RoomsResult } from "./rooms.js";
import type { Layout, WallsPart } from "./schema.js";
import type { Opening, Solid, Zone } from "./walls.js";

/** A wall cell this close to the inside of the building (metres) is part of its shell: no wall is thicker. */
const SHELL_M = 0.6;
/** Rappel faces are sampled at every plan cell along a wall face (the boxes' ends are on that grid), this far out (metres). */
const PROBE_M = 0.1;
/** Faces looking the same way this close together (metres) are one face: a soft panel set into a hard wall's line. */
const PLANE_M = 0.15;
/** A rappel face's box is this thick, just outside the face, and at least this long (metres). */
const FACE_M = 0.05;
const MIN_FACE_M = 0.5;

type V3 = [number, number, number];

export interface ZonesResult {
  zones: Zone[];
  errors: string[];
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
/** A box from two corners (metres). */
const span = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => ({
  center: [r4((x0 + x1) / 2), r4((y0 + y1) / 2), r4((z0 + z1) / 2)] as V3,
  size: [r4(x1 - x0), r4(y1 - y0), r4(z1 - z0)] as V3,
});

/** The wall lines a compiled wall box belongs to: a hard part's, a corner post's two, a panel's or an opening's. */
function linesOf(id: string, wallOfSpan: Map<string, string>): string[] {
  if (id.startsWith("post:")) return id.slice(5).split("|");
  if (id.includes("#")) return [id.slice(0, id.indexOf("#"))];
  const spanId = id.replace(/\.(head|sill|bar|glass)$/, "");
  return [wallOfSpan.get(spanId) ?? spanId];
}

export function compileZones(layout: Layout, openings: Opening[], wallSolids: Solid[], rooms: RoomsResult, parts: WallsPart[]): ZonesResult {
  const d = layout.defaults;
  const zones: Zone[] = [];
  const errors: string[] = [];
  const storey = (f: Floor) => layout.storeys.find((s) => s.id === f)!;
  /** Where the zones of a storey stop: the next storey's floor, or a wall's height over the top one. */
  const topOf = (f: Floor) => {
    const i = layout.storeys.findIndex((s) => s.id === f);
    const next = layout.storeys[i + 1];
    return next ? next.floorY : storey(f).floorY + d.wallHeightM;
  };

  // ---- The building, storey by storey: the plan's inside and the walls next to it.
  const shell = new Map<Floor, (x: number, z: number) => boolean>();
  for (const s of layout.storeys) {
    const plan = rooms.plans.get(s.id);
    if (!plan) continue;
    const g = plan.grid;
    // Each cell's distance from the inside, in cells (0 inside): walls this near are the building's.
    const far = distanceInside(g.w, g.h, (i) => g.cells[i] !== 0);
    const reach = Math.round(SHELL_M / CELL_M);
    const keep = (i: number) => g.cells[i] === 0 || (g.cells[i] === 1 && far[i] <= reach);
    shell.set(s.id, (x, z) => {
      const i = g.index(x, z);
      return i >= 0 && keep(i);
    });
    const [y0, y1] = [s.floorY, topOf(s.id)];
    const boxes = greedyRects(g.w, g.h, keep).map(([i0, j0, i1, j1]) => span(g.x0 + i0 * CELL_M, y0, g.y0 + j0 * CELL_M, g.x0 + i1 * CELL_M, y1, g.y0 + j1 * CELL_M));
    if (boxes.length) zones.push({ id: `building:${s.id}`, kind: "building", boxes });
  }

  // ---- Spawn peeks and run-outs: a box in front of each opening named, inside it or outside it.
  const byId = new Map(openings.map((o) => [o.id, o]));
  const attackGroups = new Set(layout.spawns.filter((s) => s.side === "attack").map((s) => s.group));
  for (const z of layout.zones) {
    if (z.faces !== undefined && !attackGroups.has(z.faces)) errors.push(`zone ${z.id}: it faces "${z.faces}", which isn't an attackers' spawn group`);
    for (const id of z.openings) {
      const o = byId.get(id);
      if (!o) {
        errors.push(`zone ${z.id}: "${id}" isn't a door or window of the compiled walls`);
        continue;
      }
      if (!o.exterior) {
        errors.push(`zone ${z.id}: ${id} isn't in an outside wall`);
        continue;
      }
      const side = z.kind === "spawn_peek" ? -o.out : o.out;
      const near = o.at + (side * o.t) / 2;
      const far = near + side * d.zone.depthM;
      const [p0, p1] = [Math.min(near, far), Math.max(near, far)];
      const [y0, y1] = [storey(o.floor).floorY, storey(o.floor).floorY + o.y1];
      const box = o.axis === "H" ? span(o.a0, y0, p0, o.a1, y1, p1) : span(p0, y0, o.a0, p1, y1, o.a1);
      const normal: V3 = o.axis === "H" ? [0, 0, o.out] : [o.out, 0, 0];
      zones.push({ id: `${z.id}:${id}`, kind: z.kind, boxes: [box], normal, ...(z.faces !== undefined ? { faces: z.faces } : {}) });
    }
  }

  // ---- Rappel faces: where a wall of the shell above ground has the outside right in front of it.
  const wallOfSpan = new Map<string, string>();
  const lineIds = new Set<string>();
  for (const p of parts) {
    for (const w of p.walls) {
      lineIds.add(w.id);
      for (const s of w.spans) wallOfSpan.set(s.id, w.id);
    }
  }
  const refuse = new Set(layout.rappel.refuse);
  for (const id of refuse) if (!lineIds.has(id)) errors.push(`rappel.refuse: "${id}" isn't a wall line of the walls parts`);
  interface Face {
    /** 0: it looks along x; 2: along z. */
    axis: 0 | 2;
    dir: -1 | 1;
    plane: number;
    s0: number;
    s1: number;
    top: number;
  }
  for (const s of layout.storeys) {
    const plan = rooms.plans.get(s.id);
    const inShell = shell.get(s.id);
    if (s.underground || !plan || !inShell) continue;
    const faces: Face[] = [];
    for (const b of wallSolids) {
      if (b.drawOnly || b.bodiesOnly || (b.surface !== "HARD_WALL" && b.surface !== "REINFORCEABLE")) continue;
      if (storeyOfBox(layout, b) !== s.id || !inShell(b.center[0], b.center[2])) continue;
      if (linesOf(b.id, wallOfSpan).some((id) => refuse.has(id))) continue;
      for (const [axis, dir] of [[0, -1], [0, 1], [2, -1], [2, 1]] as const) {
        const along = axis === 0 ? 2 : 0;
        const plane = b.center[axis] + (dir * b.size[axis]) / 2;
        const [a0, a1] = [b.center[along] - b.size[along] / 2, b.center[along] + b.size[along] / 2];
        const n = Math.max(1, Math.round((a1 - a0) / CELL_M));
        const at = (i: number) => (i === n ? a1 : a0 + i * CELL_M);
        let run: [number, number] | null = null;
        const flush = () => {
          if (run) faces.push({ axis, dir, plane, s0: run[0], s1: run[1], top: b.center[1] + b.size[1] / 2 });
          run = null;
        };
        for (let i = 0; i < n; i++) {
          const a = (at(i) + at(i + 1)) / 2;
          const p = plane + dir * PROBE_M;
          if (axis === 0 ? plan.grid.outside(p, a) : plan.grid.outside(a, p)) {
            if (run) run[1] = at(i + 1);
            else run = [at(i), at(i + 1)];
          } else flush();
        }
        flush();
      }
    }
    // One face for each stretch: faces looking the same way, in (nearly) one plane, that touch or overlap.
    const merged: Face[] = [];
    for (const f of [...faces].sort((p, q) => p.axis - q.axis || p.dir - q.dir || p.s0 - q.s0 || p.plane - q.plane)) {
      const m = merged.find((m) => m.axis === f.axis && m.dir === f.dir && Math.abs(m.plane - f.plane) <= PLANE_M && f.s0 <= m.s1 + CELL_M && f.s1 >= m.s0 - CELL_M);
      if (!m) {
        merged.push({ ...f });
        continue;
      }
      m.s0 = Math.min(m.s0, f.s0);
      m.s1 = Math.max(m.s1, f.s1);
      m.plane = f.dir < 0 ? Math.min(m.plane, f.plane) : Math.max(m.plane, f.plane);
      m.top = Math.max(m.top, f.top);
    }
    const named = new Map<string, number>();
    for (const f of merged.filter((f) => f.s1 - f.s0 >= MIN_FACE_M).sort((p, q) => p.axis - q.axis || p.dir - q.dir || p.plane - q.plane || p.s0 - q.s0)) {
      const compass = f.axis === 0 ? (f.dir < 0 ? "W" : "E") : f.dir < 0 ? "N" : "S";
      const n = (named.get(compass) ?? 0) + 1;
      named.set(compass, n);
      const [q0, q1] = f.dir < 0 ? [f.plane - FACE_M, f.plane] : [f.plane, f.plane + FACE_M];
      const box = f.axis === 0 ? span(q0, s.floorY, f.s0, q1, f.top, f.s1) : span(f.s0, s.floorY, q0, f.s1, f.top, q1);
      const normal: V3 = f.axis === 0 ? [f.dir, 0, 0] : [0, 0, f.dir];
      zones.push({ id: `rappel:${s.id}:${compass}${String(n).padStart(2, "0")}`, kind: "rappel", boxes: [box], normal });
    }
  }
  return { zones, errors };
}
