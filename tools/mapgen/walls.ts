// Wall lines to level solids (DESIGN §5.3–§5.4): hard segments between the spans, one reinforceable panel per
// soft span, door and window frames with their barricades and glass, open passages with a header, drone-hole
// slots. Ends meet perpendicular walls by the junction rule, so a hard box never overlaps a panel and every
// corner is closed (a hard post fills a corner two panels would leave open).
import type { Frames } from "./frames.js";
import { PlanGrid } from "./grid.js";
import type { Layout, SpanDef, WallDef } from "./schema.js";
import type { Floor } from "./research.js";

/** A compiled box (metres, axis-aligned): what level.json's solids hold. */
export interface Solid {
  id: string;
  center: [number, number, number];
  size: [number, number, number];
  surface: "HARD_WALL" | "HARD_FLOOR" | "REINFORCEABLE" | "BARRICADE" | "WINDOW";
  vaultable?: boolean;
  bodiesOnly?: boolean;
  label?: string;
  panel?: { construction?: string; sections?: number; empty?: boolean };
}

export interface Zone {
  id: string;
  kind: "drone_hole";
  boxes: { center: [number, number, number]; size: [number, number, number] }[];
}

/** A wall line in world metres, after the frame and before the junction rule moved its ends. */
interface Line {
  def: WallDef;
  floor: Floor;
  axis: "H" | "V";
  /** Centreline (z for H, x for V), metres, on the snap grid. */
  at: number;
  s0: number;
  s1: number;
  /** Thickness, metres. */
  t: number;
  /** Half the drawn raster band, metres: how far from the centreline the image shows the wall. */
  drawnHalf: number;
  spans: { def: SpanDef; a0: number; a1: number }[];
}

export interface WallsResult {
  solids: Solid[];
  zones: Zone[];
  warnings: string[];
  /** Per compiled exterior opening: its id and which way is outside. */
  exterior: Map<string, boolean>;
  /** The storey footprint (world u), for spawn facing and later checks. */
  footprint: { minX: number; minY: number; maxX: number; maxY: number };
  /** Each storey's plan raster after the flood (inside = 0), for checks and debugging. */
  grids: Map<Floor, PlanGrid>;
}

/** Raster band half-widths (u): 7 px interior, 12–13 px exterior (tools/mapgen/extract, wallgeo.py). */
const DRAWN_HALF_U = { int: 1.24, ext: 2.3 } as const;
/** A span edge this close to a line end (u) moves with the end. */
const END_STICK_U = 0.6;

const snapTo = (x: number, step: number) => {
  const r = Math.round(x / step) * step;
  return Math.round(r * 1e6) / 1e6;
};

export function compileWalls(layout: Layout, fr: Frames, parts: { floor: Floor; frame: keyof Layout["frames"]; walls: WallDef[] }[], playable: [number, number, number, number]): WallsResult {
  const k = layout.units.mPerU;
  const snap = (x: number) => snapTo(x, layout.units.snapM);
  const d = layout.defaults;
  const warnings: string[] = [];
  const solids: Solid[] = [];
  const zones: Zone[] = [];
  const exterior = new Map<string, boolean>();
  const grids = new Map<Floor, PlanGrid>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const part of parts) {
    const storey = layout.storeys.find((s) => s.id === part.floor);
    if (!storey) throw new Error(`layout.json: no storey "${part.floor}"`);
    const lines: Line[] = part.walls.map((w) => {
      if (w.kind === "rail") throw new Error(`walls_${part.floor}.json ${w.id}: rails arrive with M2 (DESIGN amendment 12)`);
      // Frames are separable affines, so an H line stays H: map its centreline and its span separately.
      const [ax, ay] = fr.toWorld(part.frame, w.axis === "H" ? w.span[0] : w.at, w.axis === "H" ? w.at : w.span[0]);
      const [bx, by] = fr.toWorld(part.frame, w.axis === "H" ? w.span[1] : w.at, w.axis === "H" ? w.at : w.span[1]);
      const along = (u: number) => {
        const [x, y] = fr.toWorld(part.frame, w.axis === "H" ? u : w.at, w.axis === "H" ? w.at : u);
        return (w.axis === "H" ? x : y) * k;
      };
      const t = typeof w.weight === "number" ? w.weight : d.wallM[w.weight];
      const drawnHalf = typeof w.weight === "number" ? w.weight / 2 : DRAWN_HALF_U[w.weight] * k;
      // Snap a face, not the centre, so an odd thickness (a 1.05 m pillar) still has both faces on the grid.
      const at = Math.round((snap((w.axis === "H" ? ay : ax) * k - t / 2) + t / 2) * 1e6) / 1e6;
      const spans = [...w.spans]
        .map((s) => ({ def: s, a0: along(s.at[0]), a1: along(s.at[1]) }))
        .sort((p, q) => p.a0 - q.a0);
      for (let i = 1; i < spans.length; i++) {
        if (spans[i].a0 < spans[i - 1].a1 - 1e-9) throw new Error(`walls_${part.floor}.json ${w.id}: spans ${spans[i - 1].def.id} and ${spans[i].def.id} overlap`);
      }
      return { def: w, floor: part.floor, axis: w.axis, at, s0: (w.axis === "H" ? ax : ay) * k, s1: (w.axis === "H" ? bx : by) * k, t, drawnHalf, spans };
    });

    // ---- Junctions: where each end meets a perpendicular wall, and whether a corner is left open.
    type What = "hard" | "panel" | "opening" | "none";
    const kindAt = (m: Line, lo: number, hi: number): What => {
      // What line m is across [lo, hi] (metres along m): "none" past its ends.
      if (hi < m.s0 || lo > m.s1) return "none";
      let what: What = "hard";
      for (const s of m.spans) {
        if (s.a1 <= lo || s.a0 >= hi) continue;
        if (s.def.kind === "SOFT") what = what === "opening" ? what : "panel";
        else what = "opening"; // doors, windows, passages and drone holes keep their frame clear
      }
      return what;
    };
    const endKind = (l: Line, start: boolean): What => {
      const e = start ? l.s0 : l.s1;
      const s = start ? l.spans[0] : l.spans[l.spans.length - 1];
      if (!s || Math.abs((start ? s.a0 : s.a1) - e) > END_STICK_U * k) return "hard";
      return s.def.kind === "SOFT" ? "panel" : "opening";
    };
    /** Each wall end that met a perpendicular wall: whether it ran on across it, and its half-thickness there. */
    const ends: { l: Line; m: Line; start: boolean; extended: boolean; half: number; mAt: What }[] = [];
    const newEnds = lines.map((l) => {
      const out: [number, number] = [l.s0, l.s1];
      for (const start of [true, false]) {
        const e = start ? l.s0 : l.s1;
        const body = start ? 1 : -1; // which way the line runs from this end
        let best: Line | null = null;
        let bestD = Infinity;
        for (const m of lines) {
          if (m === l || m.axis === l.axis) continue;
          const dist = Math.abs(e - m.at);
          if (dist > m.drawnHalf + d.junctionU * k) continue;
          const reach = l.drawnHalf + d.junctionU * k;
          if (l.at < m.s0 - reach || l.at > m.s1 + reach) continue;
          if (dist < bestD - 1e-9) {
            best = m;
            bestD = dist;
          }
        }
        if (!best) continue;
        const mAt = kindAt(best, l.at - l.t / 2, l.at + l.t / 2);
        const lEnd = endKind(l, start);
        // A soft wall is built at interior thickness whatever its line's weight: stop at the panel's own face.
        const mHalf = mAt === "panel" ? d.wallM.int / 2 : best.t / 2;
        const extended = lEnd === "hard" && (mAt === "hard" || mAt === "none");
        out[start ? 0 : 1] = extended ? best.at - (body * best.t) / 2 : best.at + body * mHalf;
        ends.push({ l, m: best, start, extended, half: lEnd === "panel" ? d.wallM.int / 2 : l.t / 2, mAt });
      }
      return out;
    });
    lines.forEach((l, i) => {
      const [n0, n1] = newEnds[i];
      for (const s of l.spans) {
        if (Math.abs(s.a0 - l.s0) <= END_STICK_U * k) s.a0 = n0;
        if (Math.abs(s.a1 - l.s1) <= END_STICK_U * k) s.a1 = n1;
      }
      l.s0 = snap(Math.min(n0, n1));
      l.s1 = snap(Math.max(n0, n1));
      for (const s of l.spans) {
        s.a0 = snap(Math.max(s.a0, l.s0));
        s.a1 = snap(Math.min(s.a1, l.s1));
      }
    });

    // ---- Footprint: walls with every opening closed, flooded from the play area's edge.
    const grid = new PlanGrid(playable[0], playable[1], playable[2], playable[3], 0.5);
    for (const l of lines) {
      const half = Math.max(l.t / 2, l.drawnHalf) / k + 0.25;
      const [a, b] = [l.s0 / k - 0.25, l.s1 / k + 0.25];
      if (l.axis === "H") grid.fill(a, l.at / k - half, b, l.at / k + half);
      else grid.fill(l.at / k - half, a, l.at / k + half, b);
    }
    grid.floodOutside();
    grids.set(part.floor, grid);
    for (let j = 0; j < grid.h; j++) {
      for (let i = 0; i < grid.w; i++) {
        if (grid.cells[j * grid.w + i] !== 0) continue;
        const x = grid.x0 + (i + 0.5) * grid.cellU;
        const y = grid.y0 + (j + 0.5) * grid.cellU;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    /** Which sides of a line are outside at `a` (metres along it): [−perp side, +perp side]. */
    const sides = (l: Line, a: number): [boolean, boolean] => {
      // Probe past the band as rasterised above (the drawn width, plus padding, plus two cells).
      const off = Math.max(l.t / 2, l.drawnHalf) + (0.25 + 2 * grid.cellU) * k;
      const p = (s: number): [number, number] => (l.axis === "H" ? [a / k, (l.at + s * off) / k] : [(l.at + s * off) / k, a / k]);
      return [grid.outside(...p(-1)), grid.outside(...p(1))];
    };

    // ---- Heights (placeholders P3, P5): interior walls stop under the next slab, exterior walls reach the next floor.
    const idx = layout.storeys.indexOf(storey);
    const next = layout.storeys[idx + 1];
    const floorY = storey.floorY;
    const topIn = next ? next.floorY - next.slabM - floorY : d.wallHeightM;
    const topOut = next ? next.floorY - floorY : d.wallHeightM;

    const box = (l: Line, id: string, a0: number, a1: number, y0: number, y1: number, perp: number, thick: number, extra: Partial<Solid> & Pick<Solid, "surface">): Solid => {
      const along = (a0 + a1) / 2;
      const len = a1 - a0;
      const c = l.at + perp;
      return {
        id,
        center: l.axis === "H" ? [along, floorY + (y0 + y1) / 2, c] : [c, floorY + (y0 + y1) / 2, along],
        size: l.axis === "H" ? [len, y1 - y0, thick] : [thick, y1 - y0, len],
        ...extra,
      };
    };

    /** Exterior at `a` along a line: one side outside the building (or both, a free-standing wall). */
    const outsideAt = (l: Line, a: number) => {
      const [neg, pos] = sides(l, a);
      return neg !== pos || (neg && pos);
    };
    /**
     * A hard stretch cut where it changes between inside and outside, so each piece takes its own height:
     * sampled every 25 cm, runs shorter than 60 cm (a probe landing in a corner) folded into their neighbour.
     */
    const stretches = (l: Line, a0: number, a1: number): [number, number, number][] => {
      if (l.def.topM !== undefined) return [[a0, a1, l.def.topM]];
      const n = Math.max(1, Math.round((a1 - a0) / 0.25));
      const step = (a1 - a0) / n;
      const runs: { from: number; to: number; out: boolean }[] = [];
      for (let i = 0; i < n; i++) {
        const out = outsideAt(l, a0 + (i + 0.5) * step);
        const last = runs[runs.length - 1];
        if (last && last.out === out) last.to = i + 1;
        else runs.push({ from: i, to: i + 1, out });
      }
      for (let i = 0; i < runs.length; i++) {
        if (runs.length === 1 || (runs[i].to - runs[i].from) * step >= 0.6) continue;
        const into = i > 0 ? runs[i - 1] : runs[i + 1];
        into.from = Math.min(into.from, runs[i].from);
        into.to = Math.max(into.to, runs[i].to);
        runs.splice(i--, 1);
        for (let j = 1; j < runs.length; j++) {
          if (runs[j].out === runs[j - 1].out) {
            runs[j - 1].to = runs[j].to;
            runs.splice(j--, 1);
          }
        }
      }
      return runs.map((r) => [r.from === 0 ? a0 : snap(a0 + r.from * step), r.to === n ? a1 : snap(a0 + r.to * step), r.out ? topOut : topIn]);
    };

    /** The wall top at `a` along a line: its override, else the next floor outside and under the slab inside. */
    const topOf = (l: Line, a: number) => (l.def.topM !== undefined ? l.def.topM : outsideAt(l, a) ? topOut : topIn);

    for (const l of lines) {
      const top = (a0: number, a1: number) => topOf(l, (a0 + a1) / 2);
      // Hard parts: everything between spans; drone holes are slots cut out of them.
      const placed = new Set<string>();
      let cursor = l.s0;
      let seg = 0;
      const hard = (a0: number, a1: number) => {
        if (a1 - a0 < 0.025) return;
        const holes = l.spans.filter((s) => s.def.kind === "DRONE_HOLE" && s.a0 >= a0 - 1e-9 && s.a1 <= a1 + 1e-9);
        for (const s of holes) placed.add(s.def.id);
        const id = `${l.def.id}#${seg++}`;
        const pieces: Solid[] = [];
        const solidRun = (c0: number, c1: number) => {
          if (c1 - c0 < 0.025) return;
          for (const [r0, r1, h] of stretches(l, c0, c1)) pieces.push(box(l, "", r0, r1, 0, h, 0, l.t, { surface: "HARD_WALL" }));
        };
        let c = a0;
        for (const s of holes) {
          const mid = snap((s.a0 + s.a1) / 2);
          const h0 = mid - d.droneHole.wM / 2;
          const h1 = mid + d.droneHole.wM / 2;
          solidRun(c, h0);
          pieces.push(box(l, "", h0, h1, d.droneHole.hM, top(h0, h1), 0, l.t, { surface: "HARD_WALL" }));
          const slot = box(l, s.def.id, h0, h1, 0, d.droneHole.hM, 0, l.t, { surface: "HARD_WALL" });
          zones.push({ id: s.def.id, kind: "drone_hole", boxes: [{ center: slot.center, size: slot.size }] });
          c = h1;
        }
        solidRun(c, a1);
        pieces.forEach((p, i) => solids.push({ ...p, id: pieces.length === 1 ? id : `${id}.${i}` }));
      };
      for (const s of l.spans) {
        if (s.def.kind === "DRONE_HOLE") continue;
        hard(cursor, s.a0);
        cursor = s.a1;
        const w = s.a1 - s.a0;
        if (w < 0.05) {
          warnings.push(`${l.def.id}: span ${s.def.id} is under one 5 cm cell after snapping; dropped`);
          continue;
        }
        const h = top(s.a0, s.a1);
        const [neg, pos] = sides(l, (s.a0 + s.a1) / 2);
        const isExterior = neg !== pos;
        const out = pos && !neg ? 1 : -1; // toward the outside (−perp when both or neither are)
        if (s.def.kind === "SOFT") {
          solids.push(box(l, s.def.id, s.a0, s.a1, 0, h, 0, d.wallM.int, { surface: "REINFORCEABLE", label: s.def.id, panel: { sections: s.def.sections, ...(s.def.construction ? { construction: s.def.construction } : {}) } }));
          continue;
        }
        if (s.def.kind === "OPEN") {
          const head = s.def.headM === undefined ? d.open.headM : s.def.headM;
          if (head !== null && h - head >= 0.05) solids.push(box(l, `${s.def.id}.head`, s.a0, s.a1, head, h, 0, l.t, { surface: "HARD_WALL" }));
          continue;
        }
        exterior.set(s.def.id, isExterior);
        const barricade = s.def.barricade ?? (isExterior ? "standing" : "empty");
        if (s.def.kind === "DOOR") {
          const head = s.def.headM ?? d.door.headM;
          if (h - head >= 0.05) solids.push(box(l, `${s.def.id}.head`, s.a0, s.a1, head, h, 0, l.t, { surface: "HARD_WALL" }));
          if (barricade !== "none") {
            solids.push(box(l, `${s.def.id}.bar`, s.a0, s.a1, 0, head, 0, d.door.barricadeM, { surface: "BARRICADE", ...(barricade === "empty" ? { panel: { empty: true } } : {}) }));
          }
          continue;
        }
        // WINDOW: a vaultable sill, a header, glass toward the outside and the barricade toward the inside.
        const sill = s.def.sillM ?? d.window.sillM;
        const head = s.def.headM ?? d.window.headM;
        solids.push(box(l, `${s.def.id}.sill`, s.a0, s.a1, 0, sill, 0, l.t, { surface: "HARD_WALL", vaultable: true }));
        if (h - head >= 0.05) solids.push(box(l, `${s.def.id}.head`, s.a0, s.a1, head, h, 0, l.t, { surface: "HARD_WALL" }));
        if (s.def.glass ?? d.window.glass) solids.push(box(l, `${s.def.id}.glass`, s.a0, s.a1, sill, head, out * 0.05, d.window.glassM, { surface: "WINDOW" }));
        if (barricade !== "none") {
          const bar: Solid["panel"] = { construction: "barricade_window", ...(barricade === "empty" ? { empty: true } : {}) };
          solids.push(box(l, `${s.def.id}.bar`, s.a0, s.a1, sill, head, -out * 0.04, d.window.barricadeM, { surface: "BARRICADE", panel: bar }));
        }
      }
      hard(cursor, l.s1);
      for (const s of l.spans) {
        if (s.def.kind === "DRONE_HOLE" && !placed.has(s.def.id)) throw new Error(`walls_${l.floor}.json ${l.def.id}: drone hole ${s.def.id} isn't inside a hard part of the wall`);
      }
    }

    // ---- Corner posts: where two walls meet at a corner and both stopped short of each other (a panel, or a
    // door or window frame, at each end), nobody covers the corner square; a hard post fills it. Where the
    // other wall runs on past with a doorway there, the square is that doorway and stays open.
    const posts = new Set<string>();
    for (const a of ends) {
      if (a.extended) continue;
      const b = ends.find((x) => x.l === a.m && x.m === a.l);
      if (!b) {
        // The other wall runs on past this end: it covers the corner itself (or it's its doorway).
        if (a.mAt === "none") warnings.push(`${a.l.def.id}: an end stops at ${a.m.def.id}, which doesn't reach it`);
        continue;
      }
      if (b.extended) continue; // the other wall's end covers the corner
      const id = `post:${[a.l.def.id, a.m.def.id].sort().join("|")}`;
      if (posts.has(id)) continue;
      posts.add(id);
      const [h, v] = a.l.axis === "H" ? [a.l, a.m] : [a.m, a.l];
      const [hEnd, vEnd] = a.l.axis === "H" ? [a, b] : [b, a];
      const x = v.at;
      const z = h.at;
      const hgt = Math.max(topOf(h, x), topOf(v, z));
      solids.push({ id, center: [x, floorY + hgt / 2, z], size: [2 * vEnd.half, hgt, 2 * hEnd.half], surface: "HARD_WALL" });
    }
  }
  return { solids, zones, warnings, exterior, footprint: { minX, minY, maxX, maxY }, grids };
}
