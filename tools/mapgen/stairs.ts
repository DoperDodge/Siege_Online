// Stairs and ladders (DESIGN §5.7, M3). Each run of layout.stairs climbs from one storey's floor to the next.
// A straight run is one flight that fills its shaft; a switchback is two flights side by side with a landing at
// the far end and a wall between them; a quarter-turn is an L, one flight up a side of its shaft to a square
// landing in the far corner and one along the far side toward the turn. Flights are open (level stairs with solid: false; the builder adds the
// invisible ramp), so a run can stand over the one below it. The floor above loses the run's hole: the treads
// with less than headroomM under that slab, through to where the run arrives. The hole gets a rail where no wall
// stands, the run doesn't arrive and no flight passes low over the edge. A ladder stands on a wall face (or a
// slab's edge) from its storey's floor to the next. Every number is a placeholder (P19, P20) until Ulo walks them.
import type { Frames } from "./frames.js";
import { CELL_M } from "./rooms.js";
import type { Rect } from "./grid.js";
import type { Floor } from "./research.js";
import type { Layout } from "./schema.js";
import type { Solid } from "./walls.js";

type Dir = "N" | "S" | "E" | "W";
/** Plan directions (x east, z south) and the engine's yaw for facing them (0 faces −z, 90 faces −x). */
const DIRS: Record<Dir, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const YAW: Record<Dir, number> = { N: 0, W: 90, S: 180, E: -90 };
/** The wall between a switchback's flights, and a rail's blocker and bar. */
const DIVIDER_M = 0.1;
const RAIL_M = 0.05;
const BAR_M = 0.05;
/** A landing's slab. */
const LANDING_M = 0.2;
/** Where the foot (before the first riser, clear of the ramp's toe) and the arrival (past the top) are checked. */
const FOOT_CHECK_M = 0.6;
const TOP_CHECK_M = 0.3;
/**
 * A body's radius and a margin (data/movement.json stance.collisionRadius 0.3): climbing, a body's head reaches
 * this far back under the slab it is leaving, so the hole starts that much sooner.
 */
const BODY_REACH_M = 0.35;

export interface Flight {
  id: string;
  start: [number, number, number];
  yawDeg: number;
  steps: number;
  rise: number;
  run: number;
  width: number;
  surface: "HARD_FLOOR";
  solid: false;
}

export interface Ladder {
  id: string;
  base: [number, number, number];
  height: number;
  yawDeg: number;
  width: number;
}

export interface CompiledRun {
  id: string;
  from: Floor;
  to: Floor;
  /** Before the first riser on the floor below (FOOT_CHECK_M), and past the top on the floor above (TOP_CHECK_M). */
  foot: [number, number, number];
  top: [number, number, number];
  footRoom?: string;
  topRoom?: string;
  flights: Flight[];
  /** The hole in the floor above, metres [x0, z0, x1, z1] (rectangles of whole cells). */
  holes: Rect[];
  /** The last tread: the hole's edge across it is where the run arrives (no rail). */
  arrival: Rect;
}

export interface StairsResult {
  flights: Flight[];
  ladders: Ladder[];
  /** Landings and the walls between a switchback's flights. */
  solids: Solid[];
  runs: CompiledRun[];
  /** Per storey, the holes its floor loses. */
  holes: Map<Floor, Rect[]>;
  errors: string[];
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const snap = (v: number) => Math.round(v / CELL_M) * CELL_M;

/** Steps and the boxes they stand in, as the builder makes them (open: two risers deep). */
export function stepBoxes(f: Flight): { rect: Rect; y0: number; y1: number }[] {
  const [fx, fz] = [-Math.sin((f.yawDeg * Math.PI) / 180), -Math.cos((f.yawDeg * Math.PI) / 180)];
  const [rx, rz] = [-fz, fx];
  return Array.from({ length: f.steps }, (_, i) => {
    const top = f.start[1] + f.rise * (i + 1);
    const [a0, a1] = [f.run * i, f.run * (i + 1)];
    const xs = [f.start[0] + fx * a0 + rx * (f.width / 2), f.start[0] + fx * a1 - rx * (f.width / 2)];
    const zs = [f.start[2] + fz * a0 + rz * (f.width / 2), f.start[2] + fz * a1 - rz * (f.width / 2)];
    return { rect: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] as Rect, y0: Math.max(f.start[1], top - 2 * f.rise), y1: top };
  });
}

export function compileStairs(layout: Layout, fr: Frames): StairsResult {
  const k = layout.units.mPerU;
  const d = layout.defaults.stairs;
  const floorY = (id: string) => layout.storeys.find((s) => s.id === id)?.floorY;
  const slabM = (id: string) => layout.storeys.find((s) => s.id === id)!.slabM;
  const out: StairsResult = { flights: [], ladders: [], solids: [], runs: [], holes: new Map(), errors: [] };

  for (const st of layout.stairs) {
    for (const run of st.runs) {
      const id = `${st.id}:${run.from}>${run.to}`;
      const y0 = run.from === "EXT" ? floorY("1F") : floorY(run.from);
      const y1 = run.to === "EXT" ? floorY("1F") : floorY(run.to);
      if (y0 === undefined || y1 === undefined || run.from === "EXT" || run.to === "EXT") {
        out.errors.push(`${id}: runs to or from the outside come with the outside (M4)`);
        continue;
      }
      const rise = y1 - y0;
      if (rise <= 0) {
        out.errors.push(`${id}: ${run.to} isn't above ${run.from}`);
        continue;
      }
      const steps = run.steps ?? Math.ceil(rise / d.riserMaxM - 1e-9);
      // The shaft in metres, snapped to the plan cells; its own axes: along the way up, across to the right.
      const [sx0, sz0, sx1, sz1] = run.shaft.map((u) => snap(u * k));
      const [fx, fz] = DIRS[run.up];
      const [rx, rz] = [-fz, fx];
      const len = run.up === "N" || run.up === "S" ? sz1 - sz0 : sx1 - sx0;
      const across = run.up === "N" || run.up === "S" ? sx1 - sx0 : sz1 - sz0;
      // The foot edge's middle: the shaft's edge you start from.
      const foot0: [number, number] = [(sx0 + sx1) / 2 - fx * ((sx1 - sx0) / 2), (sz0 + sz1) / 2 - fz * ((sz1 - sz0) / 2)];
      /** A point at `a` metres along the way up and `c` across (right of the shaft's middle line). */
      const at = (a: number, c: number): [number, number] => [foot0[0] + fx * a + rx * c, foot0[1] + fz * a + rz * c];
      const rectOf = (a0: number, a1: number, c0: number, c1: number): Rect => {
        const [p, q] = [at(a0, c0), at(a1, c1)];
        return [r4(Math.min(p[0], q[0])), r4(Math.min(p[1], q[1])), r4(Math.max(p[0], q[0])), r4(Math.max(p[1], q[1]))];
      };
      const flight = (i: number, a0: number, c: number, dir: 1 | -1, base: number, count: number, tread: number, width: number): Flight => {
        const [px, pz] = at(a0, c);
        const facing = dir === 1 ? run.up : ({ N: "S", S: "N", E: "W", W: "E" } as const)[run.up];
        return { id: `${id}#${i}`, start: [r4(px), r4(base), r4(pz)], yawDeg: YAW[facing], steps: count, rise: r4(rise / steps), run: r4(tread), width: r4(width), surface: "HARD_FLOOR", solid: false };
      };
      const ceiling = y1 - slabM(run.to); // the underside of the slab above
      /**
       * The first step (0-based) of a flight the slab above must open over: a body climbs the line through the
       * nosings (a riser above the treads; the builder's ramp), and its head reaches BODY_REACH_M back, so the
       * hole starts where that line, BODY_REACH_M on, comes within headroomM of the slab.
       */
      const needsHole = (base: number, count: number, tread: number) => {
        for (let i = 0; i < count; i++) if (base + (rise / steps) * (i + 1 + BODY_REACH_M / tread) + d.headroomM > ceiling + 1e-6) return i;
        return count;
      };
      let flights: Flight[];
      let holes: Rect[];
      let arrival: Rect;
      if (run.plan === "straight") {
        const tread = len / steps;
        if (tread < d.treadM * 0.7 || tread > d.treadM * 1.5) out.errors.push(`${id}: ${steps} steps make ${tread.toFixed(3)} m treads in a ${len.toFixed(2)} m shaft`);
        const f = flight(0, 0, 0, 1, y0, steps, tread, across);
        flights = [f];
        const h = needsHole(y0, steps, tread);
        holes = h < steps ? [rectOf(h * tread, len, -across / 2, across / 2)] : [];
        arrival = rectOf(len - tread, len, -across / 2, across / 2);
      } else if (run.plan === "switchback") {
        if (!run.turn) {
          out.errors.push(`${id}: a switchback needs a turn`);
          continue;
        }
        const width = run.widthM ?? (across - DIVIDER_M) / 2;
        const n1 = Math.ceil(steps / 2);
        const n2 = steps - n1;
        const tread = d.treadM;
        const landing = len - n1 * tread;
        if (landing < width * 0.8) out.errors.push(`${id}: the landing is only ${landing.toFixed(2)} m deep (${n1} treads of ${tread} m in a ${len.toFixed(2)} m shaft)`);
        // Turning left, the first flight is on the right: you come back down the left.
        const side = run.turn === "left" ? 1 : -1;
        const c1 = side * (across / 2 - width / 2);
        const yLanding = y0 + (rise / steps) * n1;
        const f1 = flight(0, 0, c1, 1, y0, n1, tread, width);
        const f2 = flight(1, len - landing, -c1, -1, yLanding, n2, tread, width);
        flights = [f1, f2];
        const landingRect = rectOf(len - landing, len, -across / 2, across / 2);
        out.solids.push({
          id: `${id}.landing`,
          center: [r4((landingRect[0] + landingRect[2]) / 2), r4(yLanding - LANDING_M / 2), r4((landingRect[1] + landingRect[3]) / 2)],
          size: [r4(landingRect[2] - landingRect[0]), LANDING_M, r4(landingRect[3] - landingRect[1])],
          surface: "HARD_FLOOR",
        });
        // The wall between the flights, up to the landing, from the floor below to the floor above (a run
        // stacked on it carries it on up).
        const div = rectOf(0, len - landing, -DIVIDER_M / 2, DIVIDER_M / 2);
        out.solids.push({
          id: `${id}.divider`,
          center: [r4((div[0] + div[2]) / 2), r4((y0 + y1) / 2), r4((div[1] + div[3]) / 2)],
          size: [r4(div[2] - div[0]), r4(y1 - y0), r4(div[3] - div[1])],
          surface: "HARD_WALL",
        });
        const h1 = needsHole(y0, n1, tread);
        const lo = (c: number) => (c > 0 ? [c - width / 2 - DIVIDER_M / 2, across / 2] : [-across / 2, c + width / 2 + DIVIDER_M / 2]);
        const [a1, b1] = lo(c1);
        const [a2, b2] = lo(-c1);
        holes = [];
        if (h1 < n1) holes.push(rectOf(h1 * tread, len - landing, a1, b1));
        holes.push(rectOf(len - landing, len, -across / 2, across / 2)); // the landing and the turn
        holes.push(rectOf(len - landing - n2 * tread, len - landing, a2, b2)); // the second flight, all of it
        holes.push(rectOf(len - landing - n2 * tread, len - landing, -DIVIDER_M / 2, DIVIDER_M / 2)); // over the divider
        arrival = rectOf(len - landing - n2 * tread, len - landing - (n2 - 1) * tread, a2, b2);
      } else {
        if (!run.turn) {
          out.errors.push(`${id}: a quarter-turn needs a turn`);
          continue;
        }
        // Turning right, the first flight runs up the left side, the landing fills the far left corner and the
        // second flight leaves it along the far side, to the right; the steps split as the two legs' lengths do.
        const width = run.widthM ?? Math.min(len, across) / 2;
        const side = run.turn === "right" ? 1 : -1;
        const [len1, len2] = [len - width, across - width];
        const n1 = Math.max(1, Math.min(steps - 1, Math.round((steps * len1) / (len1 + len2))));
        const n2 = steps - n1;
        const [t1, t2] = [len1 / n1, len2 / n2];
        for (const t of [t1, t2]) if (t < d.treadM * 0.7 || t > d.treadM * 1.5) out.errors.push(`${id}: ${n1} + ${n2} steps make ${t.toFixed(3)} m treads in a ${len.toFixed(2)} x ${across.toFixed(2)} m shaft`);
        const yLanding = y0 + (rise / steps) * n1;
        const f1 = flight(0, 0, -side * (across / 2 - width / 2), 1, y0, n1, t1, width);
        const c2 = -side * (across / 2 - width); // where the second flight leaves the landing
        const [px, pz] = at(len - width / 2, c2);
        const to = (Object.keys(DIRS) as Dir[]).find((k) => DIRS[k][0] === side * rx && DIRS[k][1] === side * rz)!;
        const f2: Flight = { id: `${id}#1`, start: [r4(px), r4(yLanding), r4(pz)], yawDeg: YAW[to], steps: n2, rise: r4(rise / steps), run: r4(t2), width: r4(width), surface: "HARD_FLOOR", solid: false };
        flights = [f1, f2];
        const landingRect = rectOf(len - width, len, -side * (across / 2), c2);
        out.solids.push({
          id: `${id}.landing`,
          center: [r4((landingRect[0] + landingRect[2]) / 2), r4(yLanding - LANDING_M / 2), r4((landingRect[1] + landingRect[3]) / 2)],
          size: [r4(landingRect[2] - landingRect[0]), LANDING_M, r4(landingRect[3] - landingRect[1])],
          surface: "HARD_FLOOR",
        });
        // The hole: from where the first flight needs it, or the landing, or the second flight, on to the top.
        const h1 = needsHole(y0, n1, t1);
        const overLanding = h1 < n1 || yLanding + d.headroomM > ceiling + 1e-6;
        const h2 = overLanding ? 0 : needsHole(yLanding, n2, t2);
        holes = [];
        if (h1 < n1) holes.push(rectOf(h1 * t1, len1, -side * (across / 2), c2));
        if (overLanding) holes.push(landingRect);
        if (h2 < n2) holes.push(rectOf(len - width, len, c2 + side * h2 * t2, side * (across / 2)));
        arrival = rectOf(len - width, len, side * (across / 2 - t2), side * (across / 2));
      }
      const last = flights[flights.length - 1];
      const [lx, lz] = [-Math.sin((last.yawDeg * Math.PI) / 180), -Math.cos((last.yawDeg * Math.PI) / 180)];
      const end = [last.start[0] + lx * last.run * last.steps, last.start[2] + lz * last.run * last.steps];
      const first = flights[0];
      const [ffx, ffz] = [-Math.sin((first.yawDeg * Math.PI) / 180), -Math.cos((first.yawDeg * Math.PI) / 180)];
      out.flights.push(...flights);
      out.runs.push({
        id,
        from: run.from,
        to: run.to,
        foot: [r4(first.start[0] - ffx * FOOT_CHECK_M), y0, r4(first.start[2] - ffz * FOOT_CHECK_M)],
        top: [r4(end[0] + lx * TOP_CHECK_M), y1, r4(end[1] + lz * TOP_CHECK_M)],
        ...(run.foot ? { footRoom: run.foot } : {}),
        ...(run.top ? { topRoom: run.top } : {}),
        flights,
        holes,
        arrival,
      });
      const list = out.holes.get(run.to) ?? out.holes.set(run.to, []).get(run.to)!;
      list.push(...holes.map((h) => [Math.floor(h[0] / CELL_M + 1e-6), Math.floor(h[1] / CELL_M + 1e-6), Math.ceil(h[2] / CELL_M - 1e-6), Math.ceil(h[3] / CELL_M - 1e-6)].map((c) => r4(c * CELL_M)) as Rect));
    }
  }

  for (const l of layout.ladders) {
    const y0 = floorY(l.from)!;
    const y1 = floorY(l.to)!;
    const [wx, wy] = fr.toWorld(l.frame, l.at[0], l.at[1]);
    out.ladders.push({ id: l.id, base: [r4(wx * k), y0, r4(wy * k)], height: r4(y1 - y0), yawDeg: YAW[l.facing], width: l.widthM });
  }
  return out;
}

/**
 * Rails round the holes of each storey's floor, where the floor beyond the edge is open: not under a wall of
 * that storey (`walls`, its boxes), not where a run arrives, and not under a flight passing lower than the
 * rail's top. A vaultable blocker for bodies to rail height and a bar drawn on top, as the Cat Walk's rails.
 * Under the same edges, beside a flight or landing whose walkers' heads reach the slab and where the storey
 * below has no wall alongside, a guard: a blocker for bodies from the stair up to the slab, so a head never
 * meets the slab beside the hole, with a handrail drawn a rail's height over each tread it has room for.
 */
export function stairRails(layout: Layout, stairs: StairsResult, walls: Solid[]): Solid[] {
  const railH = layout.defaults.rail.hM;
  const rails: Solid[] = [];
  const steps = stairs.flights.flatMap((f) => stepBoxes(f));
  const covers = (r: Rect, x: number, z: number) => x > r[0] + 1e-6 && x < r[2] - 1e-6 && z > r[1] + 1e-6 && z < r[3] - 1e-6;
  for (const [floor, holes] of stairs.holes) {
    const y = layout.storeys.find((s) => s.id === floor)!.floorY;
    if (!holes.length) continue;
    const mine = walls.filter((b) => !b.drawOnly && Math.abs(b.center[1] - b.size[1] / 2 - y) < 0.02);
    const underWall = (x: number, z: number) => mine.some((b) => Math.abs(x - b.center[0]) < b.size[0] / 2 && Math.abs(z - b.center[2]) < b.size[2] / 2);
    const arrivals = stairs.runs.filter((r) => r.to === floor).map((r) => r.arrival);
    /** A flight passes over the cell lower than a rail's top. */
    const lowFlight = (x: number, z: number) => {
      const c: Rect = [x - CELL_M / 2, z - CELL_M / 2, x + CELL_M / 2, z + CELL_M / 2];
      return steps.some((s) => s.y0 < y + railH && s.y1 > y && s.rect[0] < c[2] - 1e-6 && s.rect[2] > c[0] + 1e-6 && s.rect[1] < c[3] - 1e-6 && s.rect[3] > c[1] + 1e-6);
    };
    // The holes on the cell grid, with a cell of margin.
    const x0 = Math.min(...holes.map((h) => h[0])) - CELL_M;
    const z0 = Math.min(...holes.map((h) => h[1])) - CELL_M;
    const w = Math.round((Math.max(...holes.map((h) => h[2])) + CELL_M - x0) / CELL_M);
    const h = Math.round((Math.max(...holes.map((h) => h[3])) + CELL_M - z0) / CELL_M);
    const hole = new Uint8Array(w * h);
    for (const r of holes) {
      for (let j = Math.round((r[1] - z0) / CELL_M); j < Math.round((r[3] - z0) / CELL_M); j++) {
        for (let i = Math.round((r[0] - x0) / CELL_M); i < Math.round((r[2] - x0) / CELL_M); i++) hole[j * w + i] = 1;
      }
    }
    const centre = (i: number, j: number): [number, number] => [x0 + (i + 0.5) * CELL_M, z0 + (j + 0.5) * CELL_M];
    // An edge needs a rail when the cell beyond it is open floor.
    const wants = (i: number, j: number, di: number, dj: number) => {
      if (!hole[j * w + i] || hole[(j + dj) * w + i + di]) return false;
      const [hx, hz] = centre(i, j);
      const [ox, oz] = centre(i + di, j + dj);
      if (underWall(ox, oz)) return false;
      if (arrivals.some((a) => covers(a, hx, hz))) return false;
      return !lowFlight(ox, oz) && !lowFlight(hx, hz);
    };
    /**
     * Rows of edges facing ±z, then columns facing ±x: each run of edges `pick` gives a value for, as the strip
     * just outside the hole it runs along (metres), with the values edge by edge.
     */
    const strips = <T>(pick: (i: number, j: number, di: number, dj: number) => T | null, place: (r: Rect, vals: T[], alongX: boolean) => void) => {
      for (const dj of [-1, 1]) {
        for (let j = 1; j < h - 1; j++) {
          for (let i = 1; i < w - 1; ) {
            const vals: T[] = [];
            for (let v = pick(i, j, 0, dj); v !== null; v = i + vals.length < w - 1 ? pick(i + vals.length, j, 0, dj) : null) vals.push(v);
            if (!vals.length) {
              i++;
              continue;
            }
            const z = z0 + (dj < 0 ? j * CELL_M - RAIL_M : (j + 1) * CELL_M);
            place([x0 + i * CELL_M, z, x0 + (i + vals.length) * CELL_M, z + RAIL_M], vals, true);
            i += vals.length;
          }
        }
      }
      for (const di of [-1, 1]) {
        for (let i = 1; i < w - 1; i++) {
          for (let j = 1; j < h - 1; ) {
            const vals: T[] = [];
            for (let v = pick(i, j, di, 0); v !== null; v = j + vals.length < h - 1 ? pick(i, j + vals.length, di, 0) : null) vals.push(v);
            if (!vals.length) {
              j++;
              continue;
            }
            const x = x0 + (di < 0 ? i * CELL_M - RAIL_M : (i + 1) * CELL_M);
            place([x, z0 + j * CELL_M, x + RAIL_M, z0 + (j + vals.length) * CELL_M], vals, false);
            j += vals.length;
          }
        }
      }
    };
    const box = (r: Rect, y0: number, y1: number): Pick<Solid, "center" | "size"> => ({
      center: [r4((r[0] + r[2]) / 2), r4((y0 + y1) / 2), r4((r[1] + r[3]) / 2)],
      size: [r4(Math.max(r[2] - r[0], RAIL_M)), r4(y1 - y0), r4(Math.max(r[3] - r[1], RAIL_M))],
    });
    let n = 0;
    strips(
      (i, j, di, dj) => (wants(i, j, di, dj) ? true : null),
      (r) => {
        rails.push({ id: `rail:${floor}#${n}`, ...box(r, y, y + railH), surface: "HARD_WALL", vaultable: true, bodiesOnly: true });
        rails.push({ id: `rail:${floor}#${n++}.bar`, ...box(r, y + railH - BAR_M, y + railH), size: [r4(Math.max(r[2] - r[0], BAR_M)), BAR_M, r4(Math.max(r[3] - r[1], BAR_M))], surface: "HARD_WALL", drawOnly: true });
      },
    );

    // The guards, under the slab: where this storey's runs climb with their heads at the slab.
    const ceiling = y - layout.storeys.find((s) => s.id === floor)!.slabM;
    const here = stairs.runs.filter((r) => r.to === floor);
    const lowFloors = here.map((r) => layout.storeys.find((s) => s.id === r.from)!.floorY);
    const below = [
      ...walls.filter((b) => !b.drawOnly && lowFloors.some((f) => Math.abs(b.center[1] - b.size[1] / 2 - f) < 0.02)),
      ...stairs.solids.filter((b) => b.id.endsWith(".divider")),
    ];
    const walledBelow = (x: number, z: number) => below.some((b) => Math.abs(x - b.center[0]) < b.size[0] / 2 && Math.abs(z - b.center[2]) < b.size[2] / 2);
    const treads = here.flatMap((r) => r.flights.flatMap((f) => stepBoxes(f)));
    const landings = stairs.solids.filter((b) => b.id.endsWith(".landing") && here.some((r) => b.id === `${r.id}.landing`));
    /** The highest tread or landing of this storey's runs over (x, z), or null. */
    const stairTop = (x: number, z: number) => {
      let top: number | null = null;
      for (const t of treads) if (covers(t.rect, x, z)) top = Math.max(top ?? -Infinity, t.y1);
      for (const l of landings) if (Math.abs(x - l.center[0]) < l.size[0] / 2 && Math.abs(z - l.center[2]) < l.size[2] / 2) top = Math.max(top ?? -Infinity, l.center[1] + l.size[1] / 2);
      return top;
    };
    const headroom = layout.defaults.stairs.headroomM;
    const guarded = (i: number, j: number, di: number, dj: number): number | null => {
      if (!hole[j * w + i] || hole[(j + dj) * w + i + di]) return null;
      const s = stairTop(...centre(i, j));
      if (s === null || s + headroom <= ceiling + 1e-6 || s >= ceiling - 1e-6) return null;
      return walledBelow(...centre(i + di, j + dj)) ? null : s;
    };
    let g = 0;
    strips(guarded, (r, tops, alongX) => {
      const id = `guard:${floor}#${g++}`;
      rails.push({ id, ...box(r, Math.min(...tops), ceiling), surface: "HARD_WALL", bodiesOnly: true });
      // The handrail: over each tread along the guard (its edges of one height), where it fits under the slab.
      let bars = 0;
      for (let a = 0; a < tops.length; ) {
        let b = a;
        while (b < tops.length && Math.abs(tops[b] - tops[a]) < 1e-6) b++;
        if (tops[a] + railH <= ceiling - 1e-6) {
          const part: Rect = alongX ? [r[0] + a * CELL_M, r[1], r[0] + b * CELL_M, r[3]] : [r[0], r[1] + a * CELL_M, r[2], r[1] + b * CELL_M];
          rails.push({ id: `${id}.bar${bars++}`, ...box(part, tops[a] + railH - BAR_M, tops[a] + railH), surface: "HARD_WALL", drawOnly: true });
        }
        a = b;
      }
    });
  }
  return rails;
}

/**
 * Where the stairs take a storey's floor space, for rooms' anchors to keep clear of (rooms.ts): the holes in its
 * floor and a cell round them (the rails), the flights that start on it, the guards beside them (`rails`, from
 * stairRails), and its landings and dividers.
 */
export function stairKeepOut(layout: Layout, stairs: StairsResult, rails: Solid[] = []): Map<Floor, Rect[]> {
  const out = new Map<Floor, Rect[]>();
  const add = (floor: Floor, r: Rect) => (out.get(floor) ?? out.set(floor, []).get(floor)!).push(r);
  for (const [floor, holes] of stairs.holes) for (const h of holes) add(floor, [h[0] - CELL_M, h[1] - CELL_M, h[2] + CELL_M, h[3] + CELL_M]);
  for (const run of stairs.runs) for (const f of run.flights) for (const s of stepBoxes(f)) add(run.from, s.rect);
  // The guards under the slabs' edges (stairRails), on the storey they hang in.
  for (const g of rails) {
    if (g.drawOnly || !g.id.startsWith("guard:")) continue;
    const bottom = g.center[1] - g.size[1] / 2;
    const floor = [...layout.storeys].reverse().find((st) => st.floorY <= bottom + 0.01)?.id;
    if (floor) add(floor, [g.center[0] - g.size[0] / 2, g.center[2] - g.size[2] / 2, g.center[0] + g.size[0] / 2, g.center[2] + g.size[2] / 2]);
  }
  for (const s of stairs.solids) {
    const bottom = s.center[1] - s.size[1] / 2;
    const floor = [...layout.storeys].reverse().find((st) => st.floorY <= bottom + 0.25)?.id;
    if (floor) add(floor, [s.center[0] - s.size[0] / 2, s.center[2] - s.size[2] / 2, s.center[0] + s.size[0] / 2, s.center[2] + s.size[2] / 2]);
  }
  return out;
}

type Box = { id: string; center: number[]; size: number[]; surface: string; drawOnly?: boolean; bodiesOnly?: boolean };
type Room = { id: string; storey: string; rects: Rect[] };

/**
 * The runs and ladders against the assembled level: each run starts and arrives in the rooms it names; no
 * step, landing or wall between flights runs into anything else; every tread has headroomM over it; no hole cuts
 * under a wall of the storey above; a ladder's foot and its top stand on floor, with nothing in the climber's way.
 */
export function checkStairs(layout: Layout, stairs: StairsResult, solids: Box[], rooms: Room[]): string[] {
  const errors: string[] = [];
  const d = layout.defaults.stairs;
  const lo = (b: Box, a: number) => b.center[a] - b.size[a] / 2;
  const hi = (b: Box, a: number) => b.center[a] + b.size[a] / 2;
  const overlap = (r: Rect, b: Box, m = 0.01) => r[0] < hi(b, 0) - m && r[2] > lo(b, 0) + m && r[1] < hi(b, 2) - m && r[3] > lo(b, 2) + m;
  const inRoom = (id: string, x: number, z: number) => rooms.find((r) => r.id === id)?.rects.some((q) => x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3]) ?? false;
  const things = solids.filter((b) => !b.drawOnly);
  const own = new Set(stairs.solids.map((s) => s.id));
  const steps = stairs.flights.map((f) => ({ f, boxes: stepBoxes(f) }));
  for (const run of stairs.runs) {
    if (run.footRoom && !inRoom(run.footRoom, run.foot[0], run.foot[2])) errors.push(`${run.id}: its foot (${run.foot[0]}, ${run.foot[2]}) isn't in ${run.footRoom}`);
    if (run.topRoom && !inRoom(run.topRoom, run.top[0], run.top[2])) errors.push(`${run.id}: it arrives at (${run.top[0]}, ${run.top[2]}), not in ${run.topRoom}`);
  }
  for (const { f, boxes } of steps) {
    boxes.forEach((s, i) => {
      // Runs into something: a wall, a slab, a rail, another flight.
      for (const b of things) {
        if (own.has(b.id) && b.id.endsWith(".landing")) continue; // a flight starts or ends on its landing
        if (overlap(s.rect, b) && s.y0 < hi(b, 1) - 0.01 && s.y1 > lo(b, 1) + 0.01) {
          errors.push(`${f.id} step ${i} runs into ${b.id}`);
          break;
        }
      }
      for (const o of steps) {
        if (o.f === f) continue;
        const hit = o.boxes.findIndex((q) => s.rect[0] < q.rect[2] - 0.01 && s.rect[2] > q.rect[0] + 0.01 && s.rect[1] < q.rect[3] - 0.01 && s.rect[3] > q.rect[1] + 0.01 && s.y0 < q.y1 - 0.01 && s.y1 > q.y0 + 0.01);
        if (hit >= 0) errors.push(`${f.id} step ${i} runs into ${o.f.id} step ${hit}`);
      }
      // Headroom over the tread: anything whose bottom is less than headroomM above it.
      const tread: Rect = [s.rect[0] + 0.05, s.rect[1] + 0.05, s.rect[2] - 0.05, s.rect[3] - 0.05];
      const low = [
        ...things.filter((b) => overlap(tread, b, 0) && lo(b, 1) > s.y1 + 0.01 && lo(b, 1) < s.y1 + d.headroomM - 1e-6).map((b) => [b.id, lo(b, 1)] as const),
        ...steps
          .filter((o) => o.f !== f)
          .flatMap((o) => o.boxes.map((q, j) => [`${o.f.id} step ${j}`, q] as const))
          .filter(([, q]) => tread[0] < q.rect[2] && tread[2] > q.rect[0] && tread[1] < q.rect[3] && tread[3] > q.rect[1] && q.y0 > s.y1 + 0.01 && q.y0 < s.y1 + d.headroomM - 1e-6)
          .map(([id, q]) => [id, q.y0] as const),
      ];
      if (low.length) {
        const [id, y] = low.reduce((a, b) => (b[1] < a[1] ? b : a));
        errors.push(`${f.id} step ${i}: ${(y - s.y1).toFixed(2)} m of headroom under ${id}`);
      }
    });
  }
  for (const s of stairs.solids) {
    for (const b of things) {
      if (b.id === s.id || own.has(b.id)) continue;
      const r: Rect = [lo(s, 0), lo(s, 2), hi(s, 0), hi(s, 2)];
      if (overlap(r, b) && lo(s, 1) < hi(b, 1) - 0.01 && hi(s, 1) > lo(b, 1) + 0.01) errors.push(`${s.id} runs into ${b.id}`);
    }
  }
  for (const [floor, holes] of stairs.holes) {
    const y = layout.storeys.find((s) => s.id === floor)!.floorY;
    for (const h of holes) {
      const wall = things.find((b) => b.surface !== "HARD_FLOOR" && !b.bodiesOnly && !own.has(b.id) && Math.abs(lo(b, 1) - y) < 0.02 && overlap(h, b));
      if (wall) errors.push(`the stairwell hole [${h.join(", ")}] in ${floor}'s floor runs under ${wall.id}`);
    }
  }
  for (const l of stairs.ladders) {
    const [fx, fz] = [-Math.sin((l.yawDeg * Math.PI) / 180), -Math.cos((l.yawDeg * Math.PI) / 180)];
    // The climber's column in front of the ladder (a body's radius out), and the floor at the foot and past the top.
    const off = 0.35;
    const column: Rect = [l.base[0] - fx * off - 0.25, l.base[2] - fz * off - 0.25, l.base[0] - fx * off + 0.25, l.base[2] - fz * off + 0.25];
    const inWay = things.find((b) => overlap(column, b) && lo(b, 1) < l.base[1] + l.height + 1.8 - 0.01 && hi(b, 1) > l.base[1] + 0.01);
    if (inWay) errors.push(`${l.id}: ${inWay.id} is in the climber's way`);
    const onFloor = (x: number, z: number, y: number) => things.some((b) => overlap([x - 0.1, z - 0.1, x + 0.1, z + 0.1], b, 0) && Math.abs(hi(b, 1) - y) < 0.02);
    if (!onFloor(l.base[0] - fx * off, l.base[2] - fz * off, l.base[1])) errors.push(`${l.id}: no floor at its foot`);
    if (!onFloor(l.base[0] + fx * 0.6, l.base[2] + fz * 0.6, l.base[1] + l.height)) errors.push(`${l.id}: no floor where you step off at the top`);
  }
  return errors;
}
