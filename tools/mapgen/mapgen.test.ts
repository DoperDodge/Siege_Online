// The Oregon generator (tools/mapgen, DESIGN §9.2): the committed level.json is exactly what the layout
// compiles to; hard geometry never covers a panel; the compiled walls close the building where the plan does;
// the wall files still match the extraction; every 1F soft wall and opening the research lists is there with
// the right kind and sections; and the level runs: spawns stand on the ground, attackers outside.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crossFileProblems, loadGameData, missingUnverifiedPaths, QUERY_STATIC, Sim } from "../../game/shared/src/index.js";
import { checkLevel } from "./checks.js";
import { frames } from "./frames.js";
import { compile, loadInputs } from "./compile.js";
import { readableJson } from "./format.js";
import { enclosureLeaks, planGrid } from "./enclosure.js";
import type { Extracted } from "./import.js";
import { connections, softWalls } from "./research.js";
import { FLOOR_IDS, wallSchema, type SpanDef, type WallDef } from "./schema.js";
import type { Floor } from "./research.js";
import { compileWalls } from "./walls.js";

const ROOT = join(import.meta.dirname, "..", "..");
const MAP = join(ROOT, "data", "maps", "oregon");
const inputs = loadInputs(ROOT);
const { level, report } = compile(inputs);
const extracted = JSON.parse(readFileSync(join(MAP, "extracted.json"), "utf8")) as Extracted;
type Box = { id: string; center: number[]; size: number[]; surface: string; bodiesOnly?: boolean; drawOnly?: boolean; panel?: { sections?: number; empty?: boolean; construction?: string } };
const solids = level.solids as Box[];
const k = inputs.layout.units.mPerU;
const spansOf = (floor: string) => inputs.walls.find((w) => w.floor === floor)!.walls.flatMap((w) => w.spans.map((s) => ({ wall: w, span: s })));
const fr = frames(inputs.layout);

describe("oregon level.json", () => {
  it("is exactly what the layout compiles to, and compiling is deterministic", () => {
    const text = readableJson(level);
    expect(readableJson(compile(loadInputs(ROOT)).level)).toBe(text);
    expect(readFileSync(join(MAP, "level.json"), "utf8"), "level.json is stale: run npm run mapgen").toBe(text);
  });

  it("loads with the game data, and every placeholder path in layout.json exists", () => {
    const data = loadGameData();
    expect(data.levels.get("oregon")).toBeDefined();
    expect(crossFileProblems(data)).toEqual([]);
    const raw = JSON.parse(readFileSync(join(MAP, "layout.json"), "utf8")) as Record<string, unknown> & { _unverified: string[] };
    expect(missingUnverifiedPaths(raw, raw._unverified)).toEqual([]);
  });

  it("no hard box overlaps a panel, no panels overlap, and the budgets hold", () => {
    expect(report.errors).toEqual([]);
    expect(checkLevel(solids as never).errors).toEqual([]);
    // The check itself: a hard box pushed 5 cm into a soft wall is caught.
    const soft = solids.find((s) => s.id === "SW-1F-03")!;
    const intruder = { id: "intruder", center: [soft.center[0] + soft.size[0] / 2, soft.center[1], soft.center[2]], size: [0.2, 1, 0.3], surface: "HARD_WALL" };
    expect(checkLevel([soft, intruder] as never).errors.join()).toMatch(/SW-1F-03 \(REINFORCEABLE\) and intruder \(HARD_WALL\) overlap by 0\.100 m/);
  });

  /** A storey's wall lines, its plan in world u, its storey record and the one above. */
  const storeyOf = (floor: Floor) => {
    const part = inputs.walls.find((p) => p.floor === floor)!;
    const lines = part.walls;
    const i = inputs.layout.storeys.findIndex((s) => s.id === floor);
    // Rails don't divide rooms: bodies are kept out of a well, sight and bullets aren't.
    const plan = planGrid(
      lines.filter((w) => w.kind !== "rail"),
      k,
      (x, y) => fr.toWorld(part.frame, x, y),
    );
    return { lines, plan, storey: inputs.layout.storeys[i], next: inputs.layout.storeys[i + 1] };
  };
  /** The passages a storey declares open: OPEN spans (closed by their header's footprint) and drone holes. */
  const declared = (floor: Floor) => {
    const { lines } = storeyOf(floor);
    const open = new Set(lines.filter((w) => w.kind !== "rail").flatMap((w) => w.spans.filter((x) => x.kind === "OPEN").map((x) => x.id)));
    const heads = solids.filter((b) => b.id.endsWith(".head") && open.has(b.id.slice(0, -5)));
    const holes = new Set(lines.flatMap((w) => w.spans.filter((x) => x.kind === "DRONE_HOLE").map((x) => x.id)));
    const slots = (level.zones as { id: string; boxes: { center: number[]; size: number[] }[] }[])
      .filter((z) => holes.has(z.id))
      .flatMap((z) => z.boxes.map((b) => ({ id: z.id, ...b, surface: "HARD_WALL" })));
    return { heads, open, slots, holes };
  };

  it.each(FLOOR_IDS)("the compiled walls keep every room of %s's plan closed at 1.2 m and at 0.1 m: no gap to the outside or between rooms", (floor) => {
    const { plan, storey } = storeyOf(floor);
    const { heads, open, slots, holes } = declared(floor);
    expect(heads.length).toBe(open.size);
    expect(slots.length).toBe(holes.size);
    const checks: [number, Box[]][] = [
      [1.2, heads],
      [0.1, [...heads, ...slots]],
    ];
    for (const [above, passages] of checks) {
      const found = enclosureLeaks(solids, passages, plan, [-3, 3, 56, 47], 0.025, k, storey.floorY + above);
      expect(found, `${floor} at ${above} m`).toEqual({ toOutside: [], between: [], rooms: expect.any(Number) as number });
    }
  });

  it.each(FLOOR_IDS)("%s: the building's shell is closed between the interior and exterior wall tops", (floor) => {
    const { plan, storey, next } = storeyOf(floor);
    const top = (b: Box) => +(b.center[1] + b.size[1] / 2 - storey.floorY).toFixed(2);
    const pieces = solids.filter((b) => /#\d/.test(b.id) && !b.bodiesOnly && !b.drawOnly && Math.abs(b.center[1] - b.size[1] / 2 - storey.floorY) < 0.01);
    const [topIn, topOut] = next ? [next.floorY - next.slabM - storey.floorY, storey.underground ? next.floorY - next.slabM - storey.floorY : next.floorY - storey.floorY] : [inputs.layout.defaults.wallHeightM, inputs.layout.defaults.wallHeightM];
    expect([...new Set(pieces.map(top))].sort(), floor).toEqual([...new Set([topIn, topOut].map((t) => +t.toFixed(2)))].sort());
    if (topOut - topIn < 0.05) return; // no band: every wall reaches the same height
    expect(enclosureLeaks(solids, [], plan, [-3, 3, 56, 47], 0.025, k, storey.floorY + (topIn + topOut) / 2).toOutside, floor).toEqual([]);
  });

  it("spawns stand on the ground: spawn 0 for the labs, the three attacker insertion points outside", async () => {
    const sim = await Sim.create("oregon");
    const lvl = sim.level.def;
    expect(lvl.spawns[0].side).toBeUndefined();
    expect(lvl.spawns.filter((s) => s.side === "attack").map((s) => s.group)).toEqual(["A_JUNKYARD", "B_STREET", "C_CONSTRUCTION"]);
    const fp = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const s of solids.filter((b) => b.surface !== "HARD_FLOOR" && !b.bodiesOnly)) {
      fp.minX = Math.min(fp.minX, s.center[0]);
      fp.maxX = Math.max(fp.maxX, s.center[0]);
      fp.minZ = Math.min(fp.minZ, s.center[2]);
      fp.maxZ = Math.max(fp.maxZ, s.center[2]);
    }
    for (const s of lvl.spawns) {
      const hit = sim.world.castRay(new sim.R.Ray({ x: s.pos[0], y: s.pos[1] + 1, z: s.pos[2] }, { x: 0, y: -1, z: 0 }), 3, true, undefined, QUERY_STATIC);
      expect(hit?.timeOfImpact, s.id).toBeCloseTo(1, 1);
      const inBounds = s.pos[0] > lvl.bounds!.min[0] && s.pos[0] < lvl.bounds!.max[0] && s.pos[2] > lvl.bounds!.min[2] && s.pos[2] < lvl.bounds!.max[2];
      expect(inBounds, s.id).toBe(true);
      if (s.side === "attack") {
        const outside = s.pos[0] < fp.minX || s.pos[0] > fp.maxX || s.pos[2] < fp.minZ || s.pos[2] > fp.maxZ;
        expect(outside, s.id).toBe(true);
      }
    }
    // Two bodies join and walk; the level is a working room level.
    const a = sim.addPlayer("a", "sledge");
    const b = sim.addPlayer("b", "mute");
    for (let t = 0; t < 64; t++) sim.step(new Map());
    for (const c of [a, b]) expect(sim.pawns.get(c.possessedPawnId)!.state.grounded).toBe(true);
  });

  it("the wall files still match the extraction, except where curated by hand", () => {
    const problems: string[] = [];
    for (const part of inputs.walls) {
      const ex = extracted.floors[part.floor];
      const boxes = new Map(ex.walls.map((w) => [w.id, w]));
      const opens = new Map(ex.openings.map((o) => [o.id, o]));
      for (const w of part.walls) {
        if (w.src === "hand" || w.src === "ulo") continue;
        const from = (w.from ?? []).map((id) => boxes.get(id)!);
        if (from.some((b) => !b)) problems.push(`${w.id}: from names a box extracted.json doesn't have`);
        const along = from.flatMap((b) => (w.axis === "H" ? [b.rect[0], b.rect[2]] : [b.rect[1], b.rect[3]]));
        const lo = Math.min(...along, ...w.spans.map((s) => s.at[0]));
        const hi = Math.max(...along, ...w.spans.map((s) => s.at[1]));
        if (Math.abs(lo - w.span[0]) > 0.5 || Math.abs(hi - w.span[1]) > 0.5) problems.push(`${w.id}: span ${w.span} drifted from the extraction (${lo}..${hi})`);
        // Every box, not just the nearest: a line that swallowed a wall drawn elsewhere has one far off.
        if (from.length && Math.max(...from.map((b) => Math.abs(b.c - w.at))) > 0.5) problems.push(`${w.id}: a box is off its centreline ${w.at}`);
        for (const s of w.spans) {
          if (s.src === "hand" || s.src === "ulo" || !s.from) continue;
          const src = boxes.get(s.from[0]) ?? opens.get(s.from[0]);
          if (!src) {
            problems.push(`${s.id}: from names ${s.from[0]}, which extracted.json doesn't have`);
            continue;
          }
          const [a0, a1] = w.axis === "H" ? [src.rect[0], src.rect[2]] : [src.rect[1], src.rect[3]];
          if (s.kind === "DRONE_HOLE") {
            if (Math.abs((s.at[0] + s.at[1]) / 2 - (a0 + a1) / 2) > 0.5) problems.push(`${s.id}: drone hole drifted from its icon`);
          } else if (Math.abs(a0 - s.at[0]) > 0.5 || Math.abs(a1 - s.at[1]) > 0.5) problems.push(`${s.id}: ${s.at} drifted from the extraction (${a0}..${a1})`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("every extracted wall and opening is used by a wall file, or dropped there with a reason", () => {
    const missing: string[] = [];
    for (const part of inputs.walls) {
      // A soft wall's box is also in its line's `from`: it counts only as a SOFT span's source.
      const dropped = new Set(part.dropped.map((x) => x.from));
      const byLine = new Set<string>();
      const bySpan = new Set<string>();
      const bySoft = new Set<string>();
      for (const w of part.walls) {
        for (const id of w.from ?? []) byLine.add(id);
        for (const s of w.spans) for (const id of s.from ?? []) (s.kind === "SOFT" ? bySoft : bySpan).add(id);
      }
      const ex = extracted.floors[part.floor];
      for (const item of ex.walls) {
        const used = item.surface === "SOFT" ? bySoft.has(item.id) : byLine.has(item.id) || bySpan.has(item.id);
        if (!used && !dropped.has(item.id)) missing.push(`${part.floor}: ${item.id}${item.surface === "SOFT" ? " (soft wall)" : ""}`);
      }
      for (const item of ex.openings) if (!bySpan.has(item.id) && !dropped.has(item.id)) missing.push(`${part.floor}: ${item.id}`);
    }
    expect(missing).toEqual([]);
  });

  it("every soft wall in the research is a SOFT span with its section count, on every floor", () => {
    const problems: string[] = [];
    const rows = softWalls(ROOT);
    expect(rows).toHaveLength(32);
    for (const row of rows) {
      const spans = inputs.walls.find((p) => p.floor === row.floor)!.walls.flatMap((w) => w.spans.map((s) => ({ w, s })));
      const hit = spans.filter(({ s }) => s.id === row.id);
      if (hit.length !== 1) {
        problems.push(`${row.id}: ${hit.length} spans with this id on ${row.floor}`);
        continue;
      }
      const { w, s } = hit[0];
      if (s.kind !== "SOFT" || s.sections !== row.sections) problems.push(`${row.id}: ${s.kind} with ${s.kind === "SOFT" ? s.sections : "no"} sections, research says ${row.sections}`);
      if (w.axis !== row.axis) problems.push(`${row.id}: on a ${w.axis} line, research says ${row.axis}`);
    }
    expect(problems).toEqual([]);
  });
});

describe("the junction rule on small layouts", () => {
  const wall = (id: string, axis: "H" | "V", at: number, span: [number, number], spans: unknown[] = [], weight: "int" | "ext" = "int") =>
    wallSchema.parse({ id, axis, at, span, weight, src: "hand", spans });
  const soft = (id: string, at: [number, number]) => ({ kind: "SOFT", id, at, sections: 1 });
  const door = (id: string, at: [number, number]) => ({ kind: "DOOR", id, at });
  /** Compile walls in the 1F frame and check the result: no overlaps, every room closed. */
  const build = (walls: WallDef[]) => {
    const out = compileWalls(inputs.layout, fr, [{ floor: "1F", frame: "1F", walls }], [40, 40, 220, 220]);
    const leaks = enclosureLeaks(out.solids, [], planGrid(walls, k), [6, 6, 30, 30], 0.01, k);
    return { out, leaks, overlaps: checkLevel(out.solids).errors };
  };
  /** The far two sides of the room the tests build in the corner at (100, 100). */
  const farSides = () => [wall("t.h2", "H", 140, [100, 140]), wall("t.v2", "V", 140, [100, 140])];

  it("two soft walls meeting at a corner get a hard post, and the room stays closed", () => {
    const { out, leaks, overlaps } = build([wall("t.h1", "H", 100, [100, 140], [soft("t.s1", [100, 120])]), wall("t.v1", "V", 100, [100, 140], [soft("t.s2", [100, 120])]), ...farSides()]);
    expect(out.solids.map((x) => x.id)).toContain("post:t.h1|t.v1");
    expect(overlaps).toEqual([]);
    expect(leaks).toEqual({ toOutside: [], between: [], rooms: 1 });
  });

  it("a soft wall meeting a door frame at a corner gets a post too, beside the door", () => {
    const { out, leaks, overlaps } = build([wall("t.h1", "H", 100, [100, 140], [soft("t.s1", [100, 120])]), wall("t.v1", "V", 100, [100, 140], [door("t.d1", [100, 108])]), ...farSides()]);
    expect(out.solids.map((x) => x.id)).toContain("post:t.h1|t.v1");
    expect(overlaps).toEqual([]);
    expect(leaks).toEqual({ toOutside: [], between: [], rooms: 1 });
  });

  it("a soft wall meeting a door frame at an L, both exterior lines drawn only to the other's band edge, is closed by a post", () => {
    const { out, leaks, overlaps } = build([
      wall("t.h1", "H", 100, [102.3, 140], [soft("t.s1", [102.3, 120])], "ext"),
      wall("t.v1", "V", 100, [102.3, 140], [door("t.d1", [102.3, 110])], "ext"),
      ...farSides(),
    ]);
    const post = out.solids.find((x) => x.id === "post:t.h1|t.v1")!;
    expect(post.size[0]).toBeCloseTo(0.3, 6); // the door frame's full thickness, where the panel stops
    expect(post.size[2]).toBeCloseTo(0.2, 6); // the panel's thickness, where the frame stops
    expect(overlaps).toEqual([]);
    expect(leaks).toEqual({ toOutside: [], between: [], rooms: 1 });
  });

  it("a thin wall's soft wall stays on its drawn centre beside a door drawn across the corner, leaving no slot", () => {
    // A 0.25 m line's faces snap to the grid, its centre doesn't: the panel goes on the grid line nearest the drawn centre.
    const v = wallSchema.parse({ id: "t.v1", axis: "V", at: 100, span: [98.5, 140], weight: 0.25, src: "hand", spans: [soft("t.s1", [99.5, 106.5])] });
    const { leaks, overlaps } = build([wall("t.h1", "H", 100, [98, 140], [door("t.d1", [99.5, 106.5])], "ext"), v, ...farSides()]);
    expect(overlaps).toEqual([]);
    expect(leaks).toEqual({ toOutside: [], between: [], rooms: 1 });
  });

  /** A T: stem `stem` (H, z 100 u) runs east from bar `bar` (V, x 100 u) between two rooms. */
  const tee = (bar: WallDef, stem: WallDef) =>
    build([bar, stem, wall("t.hn", "H", 80, [100, 140]), wall("t.hs", "H", 120, [100, 140]), wall("t.ve", "V", 140, [80, 120])]);

  it("a frame or a soft wall at a stem's end stops at the bar's hard face where the bar's soft wall covers only part of the stem", () => {
    for (const end of [door("t.d1", [100, 108]), soft("t.s2", [100, 112])]) {
      const { leaks, overlaps } = tee(wall("t.bar", "V", 100, [80, 120], [soft("t.s1", [100.4, 112])], "ext"), wall("t.stem", "H", 100, [100, 140], [end]));
      expect(overlaps).toEqual([]);
      expect(leaks).toEqual({ toOutside: [], between: [], rooms: 2 });
    }
  });

  it("a stem meets the panel of a thick numeric-weight bar on the grid, from either side", () => {
    for (const weight of [0.25, 1.05, 1.25]) {
      const bar = wallSchema.parse({ id: "t.bar", axis: "V", at: 100, span: [80, 120], weight, src: "hand", spans: [soft("t.s1", [92, 108])] });
      const { leaks, overlaps } = tee(bar, wall("t.stem", "H", 100, [100, 140]));
      expect(overlaps, `${weight} m`).toEqual([]);
      expect(leaks, `${weight} m`).toEqual({ toOutside: [], between: [], rooms: 2 });
    }
  });

  it("a facade keeps the exterior height into a concave corner, and changes to interior on the wall that ends the outside", () => {
    // Two wings: "w" is the east wing's west facade north of the west wing's north facade "h3" (z 130.4 u), and
    // the wall between the wings south of it. "h3" meets "w" at the inside corner of the outside's notch.
    const walls = [
      wall("t.w", "V", 100, [97.7, 162.3], [], "ext"),
      wall("t.n", "H", 100, [97.7, 142.3], [], "ext"),
      wall("t.e", "V", 140, [97.7, 162.3], [], "ext"),
      wall("t.s", "H", 160, [57.7, 142.3], [], "ext"),
      wall("t.wst", "V", 60, [128.1, 162.3], [], "ext"),
      wall("t.h3", "H", 130.4, [57.7, 100], [], "ext"),
    ];
    const out = compileWalls(inputs.layout, fr, [{ floor: "1F", frame: "1F", walls }], [40, 40, 220, 220]);
    const [f1, f2] = ["1F", "2F"].map((id) => inputs.layout.storeys.find((s) => s.id === id)!);
    const [topIn, topOut] = [f2.floorY - f2.slabM - f1.floorY, f2.floorY - f1.floorY];
    const pieces = (id: string) => out.solids.filter((x) => x.id.startsWith(`${id}#`)).map((x) => [+(x.center[2] - x.size[2] / 2).toFixed(2), +(x.center[2] + x.size[2] / 2).toFixed(2), +x.size[1].toFixed(2)]);
    expect(out.solids.filter((x) => x.id.startsWith("t.h3#")).every((x) => Math.abs(x.size[1] - topOut) < 1e-6)).toBe(true);
    const cut = Math.round((130.4 * k) / 0.05) * 0.05; // on h3's centreline (snapped)
    expect(pieces("t.w")).toEqual([
      [14.85, +cut.toFixed(2), topOut], // from n's far face
      [+cut.toFixed(2), 24.15, topIn], // to s's far face
    ]);
    const leaks = enclosureLeaks(out.solids, [], planGrid(walls, k), [6, 6, 30, 30], 0.01, k, (topIn + topOut) / 2);
    expect(leaks.toOutside).toEqual([]);
  });

  it("a wall ending on the soft wall of a thick (exterior) line meets the panel's face, leaving no slot", () => {
    const { out, leaks, overlaps } = build([
      wall("t.v1", "V", 100, [80, 160], [soft("t.s1", [104, 136])], "ext"),
      wall("t.h1", "H", 120, [100, 140]),
      wall("t.h0", "H", 80, [100, 140]),
      wall("t.h2", "H", 160, [100, 140]),
      wall("t.v2", "V", 140, [80, 160]),
    ]);
    const tee = out.solids.find((x) => x.id === "t.h1#0")!;
    const panel = out.solids.find((x) => x.id === "t.s1")!;
    expect(tee.center[0] - tee.size[0] / 2).toBeCloseTo(panel.center[0] + panel.size[0] / 2, 6);
    expect(overlaps).toEqual([]);
    expect(leaks).toEqual({ toOutside: [], between: [], rooms: 2 });
  });
});

describe.each(FLOOR_IDS)("oregon %s against the research", (floor) => {
  const spans = spansOf(floor);
  const part = inputs.walls.find((p) => p.floor === floor)!;
  const storey = inputs.layout.storeys.find((s) => s.id === floor)!;
  /** Compiled boxes standing on this storey's floor. */
  const onStorey = (b: Box) => Math.abs(b.center[1] - b.size[1] / 2 - storey.floorY) < 0.01;

  it("every soft wall of surfaces.md §2 on this floor is a panel with its reinforcement sections, centred on the research", () => {
    const rows = softWalls(ROOT).filter((s) => s.floor === floor);
    for (const row of rows) {
      const span = spans.find((s) => s.span.id === row.id);
      expect(span, row.id).toBeDefined();
      const solid = solids.find((s) => s.id === row.id)!;
      expect([solid.surface, solid.panel?.sections], row.id).toEqual(["REINFORCEABLE", row.sections]);
      // The research rectangle is r6calls' soft-wall vector on this floor's image; the compiled panel is centred on it.
      const [wx, wy] = fr.toWorld(part.frame, (row.x[0] + row.x[1]) / 2, (row.y[0] + row.y[1]) / 2);
      const [cx, cz] = [wx * k, wy * k];
      const along = row.axis === "H" ? Math.abs(solid.center[0] - cx) : Math.abs(solid.center[2] - cz);
      const across = row.axis === "H" ? Math.abs(solid.center[2] - cz) : Math.abs(solid.center[0] - cx);
      expect(across, row.id).toBeLessThan(0.5 * k + 0.05); // 0.5 u, plus snapping
      expect(along, row.id).toBeLessThan(0.15); // a junction can move an end up to half a wall
    }
    expect(solids.filter((s) => s.surface === "REINFORCEABLE" && onStorey(s)).map((s) => s.id).sort()).toEqual(rows.map((r) => r.id).sort());
    if (floor === "1F") expect(rows).toHaveLength(17);
  });

  it("every door, exterior opening and passage of layout_notes §6 on this floor is there, as the research types it", () => {
    // Rows with no span along a wall are open-plan links (no wall to put an opening in): rooms join them.
    const rows = connections(ROOT).filter((r) => r.floor === floor && r.type !== "SOFT" && r.line !== null);
    const wallOpenings = rows.filter((r) => !(r.type === "OPEN" && r.span === null));
    const differences: string[] = [];
    /** No wall line of this floor runs along the middle of the row's span: a passage between two walls' ends. */
    const gap = (row: (typeof rows)[number]) => {
      const [a, b] = row.span!;
      const [lo, hi] = [a + 0.2 * (b - a), b - 0.2 * (b - a)];
      return !part.walls.some((w) => w.axis === row.axis && Math.abs(w.at - row.line!) <= 4 && Math.min(hi, w.span[1]) - Math.max(lo, w.span[0]) > 0);
    };
    for (const row of wallOpenings) {
      const tag = `${row.roomA} | ${row.roomB}`;
      const found = spans.filter((s) => s.span.research === `layout_notes §6: ${tag} (${row.typeText})`);
      if (found.length === 0 && row.type === "OPEN" && gap(row)) continue; // open by having no wall there
      if (found.length !== 1) {
        differences.push(`${tag} ${row.type}: ${found.length} spans`);
        continue;
      }
      const kind: SpanDef["kind"] = found[0].span.kind;
      if (found[0].span.hard) {
        // Built as wall by the official blueprint (amendment 7): it must say why, and be one flag from its kind.
        if (!found[0].span.note?.includes("P36")) differences.push(`${tag}: built as wall without the P36 note`);
        continue;
      }
      if (row.type === "DOOR" && kind !== "DOOR") differences.push(`${tag}: a door in the research, ${kind} here`);
      if (row.type === "OPEN" && kind !== "OPEN") differences.push(`${tag}: open in the research, ${kind} here`);
      if (row.type === "EXT_OPENING") {
        if (kind !== "DOOR" && kind !== "WINDOW") differences.push(`${tag}: an exterior opening, ${kind} here`);
        if (row.guess && kind !== row.guess) differences.push(`${tag}: research guesses ${row.guess}, ${kind} here`);
        if (report.openings[found[0].span.id] !== "exterior") differences.push(`${tag}: compiled as interior`);
      } else if (row.type === "DOOR" && report.openings[found[0].span.id] !== "interior") differences.push(`${tag}: compiled as exterior`);
    }
    expect(differences).toEqual([]);
    if (floor === "1F") {
      expect(wallOpenings.filter((r) => r.type === "EXT_OPENING")).toHaveLength(12);
      expect(wallOpenings.filter((r) => r.type === "DOOR")).toHaveLength(18);
    }
  });

  it("exterior doors and windows start barricaded, inside doors are empty frames, windows have glass", () => {
    const ids = new Set(spans.map((s) => s.span.id));
    const mine = Object.entries(report.openings).filter(([id]) => ids.has(id));
    for (const [id, side] of mine) {
      const bar = solids.find((s) => s.id === `${id}.bar`)!;
      expect(bar.surface, id).toBe("BARRICADE");
      expect(bar.panel?.empty === true, id).toBe(side === "interior");
      const glass = solids.find((s) => s.id === `${id}.glass`);
      if (bar.panel?.construction === "barricade_window") expect(glass?.surface, id).toBe("WINDOW");
    }
    // Every research exterior opening is compiled (or built as wall, P36), and one the research doesn't list
    // says why it is there.
    const byId = new Map(spans.map((s) => [s.span.id, s.span]));
    const research = connections(ROOT).filter((r) => r.floor === floor && r.type === "EXT_OPENING" && r.line !== null);
    const walledUp = spans.filter((s) => s.span.hard && s.span.research);
    const exterior = mine.filter(([, v]) => v === "exterior").map(([id]) => byId.get(id)!);
    expect(exterior.filter((s) => s.research).length, "exterior openings, against layout_notes §6").toBe(research.length - walledUp.length);
    for (const s of exterior.filter((x) => !x.research)) expect(s.note, `${s.id}: an exterior opening the research doesn't list`).toMatch(/Not in layout_notes/);
  });
});

describe("oregon 1F samples", () => {
  it("the Destruction Lab's Oregon samples match the compiled soft walls", () => {
    const lab = loadGameData().levels.get("destruction_lab")!;
    for (const [sample, id] of [["oregon_1f_05", "SW-1F-05"], ["oregon_1f_14", "SW-1F-14"], ["oregon_1f_17", "SW-1F-17"]] as const) {
      const a = lab.solids.find((s) => s.id === sample)!;
      const b = solids.find((s) => s.id === id)!;
      expect(a.panel?.sections, id).toBe(b.panel?.sections);
      expect(Math.abs(Math.max(a.size[0], a.size[2]) - Math.max(b.size[0], b.size[2])), id).toBeLessThanOrEqual(0.1);
    }
  });
});
