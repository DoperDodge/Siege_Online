// Wall lines to level solids (DESIGN §5.3–§5.4): hard segments between the spans, one reinforceable panel per
// soft span, door and window frames with their barricades and glass, open passages with a header, drone-hole
// slots. Ends meet perpendicular walls by the junction rule, so a hard box never overlaps a panel and every
// corner is closed (a hard post fills an L corner where neither end is hard).
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
  /** Centreline (z for H, x for V), metres, placed so both faces are on the snap grid. */
  at: number;
  /** The drawn centreline, metres, before snapping. */
  drawnAt: number;
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
      return { def: w, floor: part.floor, axis: w.axis, at, drawnAt: (w.axis === "H" ? ay : ax) * k, s0: (w.axis === "H" ? ax : ay) * k, s1: (w.axis === "H" ? bx : by) * k, t, drawnHalf, spans };
    });

    // ---- Junctions: where each end meets a perpendicular wall. A hard end runs on across a wall that is hard
    // there; any other end stops at the face of what it meets, so nothing hard overlaps a panel or a frame. At an
    // L corner the two ends are settled together, and where neither is hard a post fills the corner square.
    type EndKind = "hard" | "panel" | "opening";
    /** What line m has across [lo, hi] (metres along m), by its drawn extent and spans. */
    const across = (m: Line, lo: number, hi: number) => {
      const a = Math.max(lo, m.s0);
      const b = Math.min(hi, m.s1);
      if (b - a <= 1e-6) return { reach: "none" as const, hard: false, panel: false, opening: false };
      let covered = 0;
      let panel = false;
      let opening = false;
      for (const s of m.spans) {
        const o = Math.min(b, s.a1) - Math.max(a, s.a0);
        if (o <= 1e-6) continue;
        covered += o;
        if (s.def.kind === "SOFT") panel = true;
        else opening = true; // doors, windows, passages and drone holes keep their frame clear
      }
      const reach = m.s0 <= lo + 1e-6 && m.s1 >= hi - 1e-6 ? ("full" as const) : ("partial" as const);
      return { reach, hard: b - a - covered > 1e-6, panel, opening };
    };
    /**
     * What a line has where one of its ends meets wall m: the span nearest the corner among those drawn to that
     * end or reaching into m's band (each give or take END_STICK_U), else hard. A door drawn across the corner
     * square makes the end a frame even when its jamb isn't at the drawn end.
     */
    const endKind = (l: Line, start: boolean, m: Line): EndKind => {
      const e = start ? l.s0 : l.s1;
      const stick = END_STICK_U * k;
      let best: { kind: SpanDef["kind"]; gap: number } | null = null;
      for (const s of l.spans) {
        const atEnd = Math.abs((start ? s.a0 : s.a1) - e) <= stick;
        const gap = Math.max(0, s.a0 - m.at, m.at - s.a1); // from m's centreline to the span
        if (!atEnd && gap >= m.t / 2 + stick) continue;
        if (!best || gap < best.gap) best = { kind: s.def.kind, gap };
      }
      return !best ? "hard" : best.kind === "SOFT" ? "panel" : "opening";
    };
    /** A soft wall is built at interior thickness, centred on the grid line nearest its line's drawn centre. */
    const panelAt = (l: Line) => snap(l.drawnAt);
    /** The centre and half-thickness of a line's part where one of its ends meets m. */
    const endBand = (l: Line, start: boolean, m: Line): [number, number] => (endKind(l, start, m) === "panel" ? [panelAt(l), d.wallM.int / 2] : [l.at, l.t / 2]);
    /** The perpendicular wall an end meets: one that is there across this line's band beats a nearer one that stops short. */
    const partnerOf = (l: Line, start: boolean): Line | null => {
      const e = start ? l.s0 : l.s1;
      let best: Line | null = null;
      let bestD = Infinity;
      let bestThere = false;
      for (const m of lines) {
        if (m === l || m.axis === l.axis) continue;
        const dist = Math.abs(e - m.at);
        if (dist > m.drawnHalf + d.junctionU * k) continue;
        const reach = l.drawnHalf + d.junctionU * k;
        if (l.at < m.s0 - reach || l.at > m.s1 + reach) continue;
        const there = across(m, l.at - l.t / 2, l.at + l.t / 2).reach !== "none";
        if ((there && !bestThere) || (there === bestThere && dist < bestD - 1e-9)) {
          best = m;
          bestD = dist;
          bestThere = there;
        }
      }
      return best;
    };
    const partners = lines.map((l) => [partnerOf(l, true), partnerOf(l, false)] as const);
    /** L corners where neither end is hard: the two ends' bands (centre, half-thickness), taken before ends move. */
    const posts: { h: Line; v: Line; x: [number, number]; z: [number, number] }[] = [];
    const newEnds = lines.map((l, i) => {
      const out: [number, number] = [l.s0, l.s1];
      for (const start of [true, false]) {
        const m = partners[i][start ? 0 : 1];
        if (!m) continue;
        const body = start ? 1 : -1; // which way the line runs from this end
        const lKind = endKind(l, start, m);
        const mi = lines.indexOf(m);
        const mStart = partners[mi][0] === l ? true : partners[mi][1] === l ? false : null;
        let e: number;
        if (mStart !== null) {
          // An L corner. A hard end runs on to the other's far face (at that end's own thickness); an end that
          // isn't hard stops at the other's face, the hard end's near face or the post between two that aren't.
          const [mc, mh] = endBand(m, mStart, l);
          const mHard = endKind(m, mStart, l) === "hard";
          if (lKind === "hard") e = mc - body * mh;
          else e = mc + body * mh;
          if (lKind !== "hard" && !mHard && l.axis === "H") posts.push({ h: l, v: m, x: [mc, mh], z: endBand(l, start, m) });
        } else {
          // A T: this end meets the other wall's run (or an end that met someone else).
          const [lc, lh] = endBand(l, start, m);
          const a = across(m, lc - lh, lc + lh);
          if (a.reach === "none") {
            warnings.push(`${l.def.id}: an end is near ${m.def.id}, which doesn't reach it; left as drawn`);
            continue;
          }
          if (lKind === "hard") {
            if (a.reach === "full" && !a.panel && !a.opening) e = m.at - (body * m.t) / 2; // across a hard wall: close it
            else if (a.opening || !a.panel) e = m.at + (body * m.t) / 2; // a frame, or a wall that stops in the band
            else e = panelAt(m) + (body * d.wallM.int) / 2; // up to the panel's face (over the hard part beside it)
          } else {
            // A panel or a frame touches nothing hard: the outer face of whatever is there.
            e = a.hard || a.opening ? m.at + (body * m.t) / 2 : panelAt(m) + (body * d.wallM.int) / 2;
          }
        }
        out[start ? 0 : 1] = e;
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
    /** Each line's band as rasterised above (u): along [lo, hi], across within `half` of `at`. */
    const bands = lines.map((m) => ({ m, lo: m.s0 / k - 0.25, hi: m.s1 / k + 0.25, at: m.at / k, half: Math.max(m.t / 2, m.drawnHalf) / k + 0.25 }));
    /**
     * What lies past one face of a line at `a` (metres along it): the first cell clear of walls beyond its band
     * as rasterised above, outside the building (true) or inside it (false). The probe steps over a parallel
     * wall drawn against this one (up to 1.5 m); null where it meets a perpendicular wall: a junction, where
     * what lies beyond that wall says nothing about this one.
     */
    const sideAt = (l: Line, a: number, side: -1 | 1): boolean | null => {
      const from = Math.max(l.t / 2, l.drawnHalf) + (0.25 + 2 * grid.cellU) * k;
      for (let off = from; off <= from + 1.5 + 1e-9; off += grid.cellU * k) {
        const [x, y] = l.axis === "H" ? [a / k, (l.at + side * off) / k] : [(l.at + side * off) / k, a / k];
        const crosses = bands.some((b) => b.m.axis !== l.axis && (b.m.axis === "H" ? x >= b.lo && x <= b.hi && Math.abs(y - b.at) <= b.half : y >= b.lo && y <= b.hi && Math.abs(x - b.at) <= b.half));
        if (crosses) return null;
        const i = grid.index(x, y);
        if (i < 0) return true; // off the plan
        if (grid.cells[i] !== 1) return grid.cells[i] === 2;
      }
      return null;
    };
    /** Which sides of a line are outside at `a`: [−perp side, +perp side]. */
    const sides = (l: Line, a: number): [boolean, boolean] => [sideAt(l, a, -1) === true, sideAt(l, a, 1) === true];

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

    /**
     * Where a line is exterior (a face outside the building, or both: a free-standing wall), as runs [from, to,
     * out] along it. Sampled every 25 cm; a sample whose probe runs into another wall (a junction) takes its
     * neighbours' class, and where they differ the run changes on that wall's centreline.
     */
    const classOf = new Map<Line, { from: number; to: number; out: boolean }[]>();
    const classes = (l: Line) => {
      const known = classOf.get(l);
      if (known) return known;
      const n = Math.max(1, Math.round((l.s1 - l.s0) / 0.25));
      const step = (l.s1 - l.s0) / n;
      const cls: (boolean | null)[] = [];
      for (let i = 0; i < n; i++) {
        const a = l.s0 + (i + 0.5) * step;
        const [neg, pos] = [sideAt(l, a, -1), sideAt(l, a, 1)];
        cls.push(neg === true || pos === true ? true : neg === false && pos === false ? false : null);
      }
      // A lone sample against both its neighbours is a probe slipping past a wall end, not a change.
      for (let i = 1; i + 1 < n; i++) if (cls[i] !== null && cls[i - 1] !== null && cls[i - 1] === cls[i + 1] && cls[i] !== cls[i - 1]) cls[i] = cls[i - 1];
      const runs: { from: number; to: number; out: boolean | null }[] = [];
      for (let i = 0; i < n; i++) {
        const last = runs[runs.length - 1];
        if (last && last.out === cls[i]) last.to = l.s0 + (i + 1) * step;
        else runs.push({ from: l.s0 + i * step, to: l.s0 + (i + 1) * step, out: cls[i] });
      }
      const out: { from: number; to: number; out: boolean }[] = [];
      for (let i = 0; i < runs.length; i++) {
        const r = runs[i];
        if (r.out !== null) {
          out.push({ from: r.from, to: r.to, out: r.out });
          continue;
        }
        const before = runs[i - 1]?.out ?? null;
        const after = runs[i + 1]?.out ?? null;
        if (before === null || after === null || before === after) {
          // Nothing known on one side (an end at a corner), or the same on both: that class. No sample known at
          // all (a short piece between junctions): exterior, so the building's shell is never left low.
          out.push({ from: r.from, to: r.to, out: before ?? after ?? true });
          continue;
        }
        // The class changes at the wall that blocked the probes: the perpendicular one nearest the run's middle.
        const mid = (r.from + r.to) / 2;
        let cut = mid;
        let bestD = Infinity;
        for (const m of lines) {
          if (m.axis === l.axis || m.at < r.from - 0.3 || m.at > r.to + 0.3 || l.at < m.s0 - 1 || l.at > m.s1 + 1) continue;
          if (Math.abs(m.at - mid) < bestD) {
            bestD = Math.abs(m.at - mid);
            cut = Math.min(r.to, Math.max(r.from, m.at));
          }
        }
        out.push({ from: r.from, to: cut, out: before }, { from: cut, to: r.to, out: after });
      }
      // Merge neighbours of one class and snap the changes to the grid (the ends stay where they are).
      const merged: { from: number; to: number; out: boolean }[] = [];
      for (const r of out) {
        const last = merged[merged.length - 1];
        if (last && last.out === r.out) last.to = r.to;
        else if (r.to - r.from > 1e-9) merged.push({ ...r });
      }
      for (let i = 1; i < merged.length; i++) merged[i].from = merged[i - 1].to = snap(merged[i].from);
      classOf.set(l, merged);
      return merged;
    };
    /** Is a line exterior at `a`? */
    const outsideAt = (l: Line, a: number) => {
      const runs = classes(l);
      return (runs.find((r) => a < r.to) ?? runs[runs.length - 1]).out;
    };
    /** A hard stretch cut where the line changes between inside and outside, each piece at its own height. */
    const stretches = (l: Line, a0: number, a1: number): [number, number, number][] => {
      if (l.def.topM !== undefined) return [[a0, a1, l.def.topM]];
      const pieces: [number, number, number][] = [];
      for (const r of classes(l)) {
        const p0 = Math.max(a0, r.from);
        const p1 = Math.min(a1, r.to);
        if (p1 - p0 < 0.025) continue; // a sliver past a change: the piece beside it covers it
        pieces.push([p0, p1, r.out ? topOut : topIn]);
      }
      if (!pieces.length) return [[a0, a1, outsideAt(l, (a0 + a1) / 2) ? topOut : topIn]];
      pieces[0][0] = a0;
      pieces[pieces.length - 1][1] = a1;
      for (let i = 1; i < pieces.length; i++) pieces[i][0] = pieces[i - 1][1];
      return pieces;
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
          solids.push(box(l, s.def.id, s.a0, s.a1, 0, h, panelAt(l) - l.at, d.wallM.int, { surface: "REINFORCEABLE", label: s.def.id, panel: { sections: s.def.sections, ...(s.def.construction ? { construction: s.def.construction } : {}) } }));
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

    // ---- Corner posts: an L corner where neither end is hard (a panel, or a door or window frame, at each)
    // leaves the corner square to nobody; a hard post fills it, exactly where the two ends stopped.
    for (const { h, v, x: [x, hx], z: [z, hz] } of posts) {
      const hgt = Math.max(topOf(h, x), topOf(v, z));
      solids.push({ id: `post:${[h.def.id, v.def.id].sort().join("|")}`, center: [x, floorY + hgt / 2, z], size: [2 * hx, hgt, 2 * hz], surface: "HARD_WALL" });
    }
  }
  return { solids, zones, warnings, exterior, footprint: { minX, minY, maxX, maxY }, grids };
}
