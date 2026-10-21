// The Oregon generator (tools/mapgen, DESIGN §9.2): the committed level.json is exactly what the layout
// compiles to; hard geometry never covers a panel; the compiled walls close the building where the plan does;
// the wall files still match the extraction; every 1F soft wall and opening the research lists is there with
// the right kind and sections; and the level runs: spawns stand on the ground, attackers outside.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Btn, bulletThroughPanels, crossFileProblems, DEG, levelSchema, loadGameData, missingUnverifiedPaths, PawnMode, QUERY_BULLET, QUERY_STATIC, Sim, Stance, type InputCmd, type Vec3 } from "../../game/shared/src/index.js";
import { checkLevel } from "./checks.js";
import { frames } from "./frames.js";
import { compile, loadInputs } from "./compile.js";
import { readableJson } from "./format.js";
import { enclosureLeaks, planGrid } from "./enclosure.js";
import { planSvg } from "./plans.js";
import { distanceInside, PlanGrid } from "./grid.js";
import type { Extracted } from "./import.js";
import { connections, hatchTable, roomTable, softFloorTable, softWalls } from "./research.js";
import { CELL_M, clearCells, compileRooms, storeyOfBox } from "./rooms.js";
import { FLOOR_IDS, wallSchema, type SpanDef, type WallDef } from "./schema.js";
import type { Floor } from "./research.js";
import { compileStairs, type CompiledRun } from "./stairs.js";
import { compileWalls } from "./walls.js";
import { buildWalkGraph, nodeNear, nodesIn, type WalkGraph } from "./walkgraph.js";

const ROOT = join(import.meta.dirname, "..", "..");
const MAP = join(ROOT, "data", "maps", "oregon");
const inputs = loadInputs(ROOT);
const { level, report } = compile(inputs);
const extracted = JSON.parse(readFileSync(join(MAP, "extracted.json"), "utf8")) as Extracted;
type Box = { id: string; center: number[]; size: number[]; surface: string; bodiesOnly?: boolean; drawOnly?: boolean; panel?: { sections?: number; empty?: boolean; construction?: string; region?: string } };
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

  it("the committed plans are what the level draws (research/oregon/compare)", () => {
    for (const floor of inputs.layout.emit) expect(readFileSync(join(ROOT, "research", "oregon", "compare", `${floor}.svg`), "utf8") === planSvg(ROOT, level, floor), `${floor}.svg is stale: run npm run mapgen`).toBe(true);
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

describe("grid helpers", () => {
  it("a blank grid has the same cells as its model, wherever it starts", () => {
    const off: string[] = [];
    for (let a = -400; a <= 400; a += 7) {
      for (let n = 1; n <= 300; n += 13) {
        const g = new PlanGrid(a * CELL_M, -a * CELL_M, (a + n) * CELL_M, (n - a) * CELL_M, CELL_M);
        const b = g.blank();
        if (b.x0 !== g.x0 || b.y0 !== g.y0 || b.w !== g.w || b.h !== g.h) off.push(`${a}, ${n}: ${g.w}×${g.h} → ${b.w}×${b.h}`);
      }
    }
    expect(off).toEqual([]);
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

describe("oregon rooms and floors", () => {
  type Room = { id: string; callout: string; storey: string; rects: [number, number, number, number][]; anchor: [number, number, number] };
  const rooms = level.rooms as Room[];
  const storey = (id: string) => inputs.layout.storeys.find((s) => s.id === id)!;
  const inRoom = (r: Room, x: number, z: number) => r.rects.some(([x0, z0, x1, z1]) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && z >= z0 - 1e-6 && z <= z1 + 1e-6);
  const data = loadGameData();
  /** A Sim of the compiled level with one body in it. */
  const walker = async () => {
    const sim = await Sim.create("oregon");
    const ctrl = sim.addPlayer("walker", "sledge");
    return { sim, pawn: sim.pawns.get(ctrl.possessedPawnId)! };
  };
  const steps = (sim: Sim, n: number) => {
    for (let t = 0; t < n; t++) sim.step(new Map());
  };

  it("has every room of layout_notes §2 on its storey, with a callout, rectangles and an anchor inside them", () => {
    const research = roomTable(ROOT);
    expect(research).toHaveLength(49);
    expect(rooms.map((r) => r.id).sort()).toEqual(research.map((r) => r.id).sort());
    for (const r of rooms) {
      expect(r.storey, r.id).toBe(research.find((x) => x.id === r.id)!.floor);
      expect(r.callout, r.id).not.toBe("");
      expect(r.anchor[1], r.id).toBe(storey(r.storey).floorY);
      expect(inRoom(r, r.anchor[0], r.anchor[2]), r.id).toBe(true);
    }
    expect(report.errors).toEqual([]);
  });

  it("every spot of a room where a body fits is in its rectangles (the HUD's lookup)", () => {
    const out = compileRooms(inputs.layout, fr, compileWalls(inputs.layout, fr, inputs.walls, inputs.exterior.playable).solids);
    const open = clearCells(0.3);
    const problems: string[] = [];
    for (const plan of out.plans.values()) {
      const g = plan.grid;
      // Each room's bounding box on the plan, to work its distances out in.
      const bounds = new Map<number, [number, number, number, number]>();
      for (let c = 0; c < plan.room.length; c++) {
        const index = plan.room[c];
        if (index < 0) continue;
        const [i, j] = [c % g.w, Math.floor(c / g.w)];
        const b = bounds.get(index) ?? bounds.set(index, [i, j, i + 1, j + 1]).get(index)!;
        [b[0], b[1], b[2], b[3]] = [Math.min(b[0], i), Math.min(b[1], j), Math.max(b[2], i + 1), Math.max(b[3], j + 1)];
      }
      for (const [index, [i0, j0, i1, j1]] of bounds) {
        const room = rooms.find((r) => r.id === out.rooms[index].id)!;
        const w = i1 - i0;
        const cell = (c: number) => (j0 + Math.floor(c / w)) * g.w + i0 + (c % w);
        const dist = distanceInside(w, j1 - j0, (c) => plan.room[cell(c)] === index);
        let missed = 0;
        for (let c = 0; c < dist.length; c++) {
          const at = cell(c);
          if (dist[c] >= open && !inRoom(room, g.x0 + ((at % g.w) + 0.5) * CELL_M, g.y0 + (Math.floor(at / g.w) + 0.5) * CELL_M)) missed++;
        }
        if (missed) problems.push(`${room.id}: ${missed} cells 0.3 m clear of its edge are in none of its rectangles`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("every room's anchor stands 0.45 m clear of the walls and stairs around it (a body's width where it can't be)", () => {
    // A room the stairs fill (1F Tower Stairs) gets the clearest spot left, and says so in a warning.
    const crowded = new Set(report.warnings.map((w) => /^(\S+): no spot 0\.45 m clear/.exec(w)?.[1]).filter(Boolean));
    const radius = loadGameData().movement.stance.collisionRadius;
    const problems: string[] = [];
    for (const r of rooms) {
      for (const b of solids) {
        if (b.drawOnly || ["HARD_FLOOR", "SOFT_FLOOR", "HATCH"].includes(b.surface) || storeyOfBox(inputs.layout, b as never) !== r.storey) continue;
        const dx = Math.max(b.center[0] - b.size[0] / 2 - r.anchor[0], 0, r.anchor[0] - b.center[0] - b.size[0] / 2);
        const dz = Math.max(b.center[2] - b.size[2] / 2 - r.anchor[2], 0, r.anchor[2] - b.center[2] - b.size[2] / 2);
        if (Math.hypot(dx, dz) < (crowded.has(r.id) ? radius : 0.45) - 1e-6) problems.push(`${r.id}'s anchor is ${Math.hypot(dx, dz).toFixed(3)} m from ${b.id}`);
      }
    }
    expect([...crowded]).toEqual(["1F_TOWER_STAIRS"]);
    expect(problems).toEqual([]);
  });

  it("a hatch whose top room doesn't compile is reported, not a crash", () => {
    const layout = structuredClone(inputs.layout);
    layout.rooms.find((r) => r.id === "1F_MEETING_HALL")!.seed = [-500, -500];
    const out = compile({ ...inputs, layout });
    expect(out.report.errors.join("\n")).toMatch(/1F_MEETING_HALL's seed \(-500, -500 1F u\) is outside the 1F building/);
  });

  it("a body put at any room's anchor stands there, on that storey's floor", async () => {
    const { sim, pawn } = await walker();
    const problems: string[] = [];
    for (const r of rooms) {
      sim.teleport(pawn.id, r.anchor[0], r.anchor[1], r.anchor[2], 0);
      steps(sim, 32);
      if (!pawn.state.grounded || Math.abs(pawn.state.y - r.anchor[1]) > 0.05) problems.push(`${r.id}: at y ${pawn.state.y.toFixed(2)}, grounded ${pawn.state.grounded}`);
    }
    expect(problems).toEqual([]);
  });

  it("builds every soft floor of surfaces.md §4.2 as slab-thick tiles of one region, each at most tileMaxM", () => {
    const research = softFloorTable(ROOT);
    expect(inputs.layout.softFloors.map((f) => f.id).sort()).toEqual(research.map((r) => r.id).sort());
    const tiles = solids.filter((s) => s.surface === "SOFT_FLOOR");
    for (const f of inputs.layout.softFloors) {
      const mine = tiles.filter((t) => t.panel?.region === f.id);
      if (f.hard) {
        expect(mine, f.id).toEqual([]);
        continue;
      }
      expect(mine.length, f.id).toBeGreaterThan(0);
      const s = storey(f.floor);
      const max = f.tileMaxM ?? inputs.layout.defaults.softFloor.tileMaxM;
      for (const t of mine) {
        expect([+(t.center[1] + t.size[1] / 2).toFixed(4), +t.size[1].toFixed(4)], t.id).toEqual([s.floorY, s.slabM]);
        expect(Math.max(t.size[0], t.size[2]), t.id).toBeLessThanOrEqual(max + 1e-6);
        if (/#e\d/.test(t.id)) {
          // A strip along part of the edge, out to the wall below: at most 15 cm deep, at least 0.5 m long.
          expect(Math.min(t.size[0], t.size[2]), t.id).toBeLessThanOrEqual(0.15 + 1e-6);
          expect(Math.max(t.size[0], t.size[2]), t.id).toBeGreaterThanOrEqual(0.5 - 1e-6);
        } else expect(Math.min(t.size[0], t.size[2]), t.id).toBeGreaterThanOrEqual(0.3 - 1e-6);
      }
    }
    expect(tiles.every((t) => t.panel?.region !== undefined)).toBe(true);
  });

  it("seen from below, a soft floor meets the walls of the room under it (no strip of hard ceiling over 0.5 m)", () => {
    // Walls above needn't stand on the walls below (an outside wall over a thinner inside one): the strip
    // between a soft floor's edge and the wall below is that room's ceiling, and soft too (corner bits aside).
    const C = 0.05;
    const key = (i: number, j: number) => i * 100000 + j;
    const lo = (b: Box, a: number) => b.center[a] - b.size[a] / 2;
    const hi = (b: Box, a: number) => b.center[a] + b.size[a] / 2;
    const strips: string[] = [];
    inputs.layout.storeys.forEach((st, si) => {
      const below = inputs.layout.storeys[si - 1];
      if (!below) return;
      const soft = new Set<number>();
      const hardCells = new Set<number>();
      for (const t of solids.filter((b) => (b.surface === "SOFT_FLOOR" || b.surface === "HARD_FLOOR") && Math.abs(hi(b, 1) - st.floorY) < 0.01)) {
        const into = t.surface === "SOFT_FLOOR" ? soft : hardCells;
        for (let i = Math.round(lo(t, 0) / C); i < Math.round(hi(t, 0) / C); i++) for (let j = Math.round(lo(t, 2) / C); j < Math.round(hi(t, 2) / C); j++) into.add(key(i, j));
      }
      for (const r of rooms.filter((r) => r.storey === below.id)) {
        const cells = new Set<number>();
        for (const [x0, z0, x1, z1] of r.rects) for (let i = Math.round(x0 / C); i < Math.round(x1 / C); i++) for (let j = Math.round(z0 / C); j < Math.round(z1 / C); j++) cells.add(key(i, j));
        // The room's edge cells with hard ceiling, within 15 cm of a soft floor.
        const hard = new Set<number>();
        for (const c of cells) {
          const [i, j] = [Math.floor(c / 100000), c % 100000];
          const edge = [key(i - 1, j), key(i + 1, j), key(i, j - 1), key(i, j + 1)].some((q) => !cells.has(q));
          const nearSoft = [-3, -2, -1, 1, 2, 3].some((d) => soft.has(key(i + d, j)) || soft.has(key(i, j + d)));
          if (hardCells.has(c) && edge && nearSoft) hard.add(c); // under hard slab (a stairwell or a well has none)
        }
        const seen = new Set<number>();
        for (const c of hard) {
          if (seen.has(c)) continue;
          const run = [c];
          seen.add(c);
          for (let q = 0; q < run.length; q++) for (const d of [100000, -100000, 1, -1]) if (hard.has(run[q] + d) && !seen.has(run[q] + d)) (seen.add(run[q] + d), run.push(run[q] + d));
          const is = run.map((x) => Math.floor(x / 100000));
          const js = run.map((x) => x % 100000);
          const long = Math.max(Math.max(...is) - Math.min(...is), Math.max(...js) - Math.min(...js)) + 1;
          if (long * C > 0.5 + 1e-9) strips.push(`${r.id}: ${(long * C).toFixed(2)} m of hard ceiling at x ${(Math.min(...is) * C).toFixed(2)}, z ${(Math.min(...js) * C).toFixed(2)}`);
        }
      }
    });
    expect(strips).toEqual([]);
  });

  it("a bullet from the room below goes up through every soft floor, into one surface", async () => {
    const { sim } = await walker();
    const up: Vec3 = [0, 1, 0];
    const misses: string[] = [];
    for (const f of inputs.layout.softFloors.filter((x) => !x.hard)) {
      const mine = solids.filter((t) => t.panel?.region === f.id).sort((a, b) => b.size[0] * b.size[2] - a.size[0] * a.size[2]);
      const t = mine[0];
      // Between the joists (every 0.4 m from the tile's −x edge), along the tile, wherever nothing hard stands under it.
      let passed = false;
      for (let i = 0; i < Math.floor(t.size[0] / 0.4) && !passed; i++) {
        const o: Vec3 = [t.center[0] - t.size[0] / 2 + 0.2 + 0.4 * i, t.center[1] - t.size[1] / 2 - 1.2, t.center[2]];
        const hard = sim.world.castRay(new sim.R.Ray({ x: o[0], y: o[1], z: o[2] }, { x: 0, y: 1, z: 0 }), 3, true, undefined, QUERY_BULLET);
        const free = hard ? hard.timeOfImpact : 3;
        if (free < 1.2 + t.size[1] + 0.05) continue; // a wall top or a slab under the tile here
        const p = bulletThroughPanels(sim.level.panels, data.destruction, data.destruction.bullets.tiers.medium!, o, up, free);
        passed = p.stop === null && p.enters.length === 1;
      }
      if (!passed) misses.push(f.id);
    }
    expect(misses).toEqual([]);
  });

  it("puts each hatch of surfaces.md §5 in its top room's floor, over its bottom room, at least 1.2 m clear", () => {
    const research = hatchTable(ROOT);
    expect(research.map((h) => h.id)).toEqual(["H1", "H2", "H3", "H4", "H5", "H6"]);
    for (const row of research) {
      const h = solids.find((s) => s.id === row.id)!;
      const authored = inputs.layout.hatches.find((x) => x.id === row.id)!;
      expect([h.surface, authored.top, authored.bottom], row.id).toEqual(["HATCH", row.top, row.bottom]);
      const [top, bottom] = [rooms.find((r) => r.id === row.top)!, rooms.find((r) => r.id === row.bottom)!];
      expect(+(h.center[1] + h.size[1] / 2).toFixed(4), row.id).toBe(storey(top.storey).floorY);
      expect(Math.min(h.size[0], h.size[2]), row.id).toBeGreaterThanOrEqual(1.2);
      // The square r6calls draws, give or take 0.5 u a side (H5 straddles the Attic's wall: amendment 6).
      const clip = report.hatches.find((x) => x.id === row.id)!.clipU;
      expect(Math.max(...clip), row.id).toBeLessThanOrEqual(row.id === "H5" ? 6 : 0.5);
      // Inside the top room, and the opening over the bottom room's floor (0.5 u in from each side).
      const m = 0.5 * k;
      for (let x = h.center[0] - h.size[0] / 2 + m; x <= h.center[0] + h.size[0] / 2 - m + 1e-9; x += 0.1) {
        for (let z = h.center[2] - h.size[2] / 2 + m; z <= h.center[2] + h.size[2] / 2 - m + 1e-9; z += 0.1) {
          expect(inRoom(top, x, z), `${row.id} at (${x.toFixed(2)}, ${z.toFixed(2)}) in ${top.id}`).toBe(true);
          expect(inRoom(bottom, x, z), `${row.id} at (${x.toFixed(2)}, ${z.toFixed(2)}) over ${bottom.id}`).toBe(true);
        }
      }
    }
  });

  it("a body on a hatch stands until it breaks, then drops into the room the research names", async () => {
    const { sim, pawn } = await walker();
    const problems: string[] = [];
    for (const row of hatchTable(ROOT)) {
      const h = solids.find((s) => s.id === row.id)!;
      const bottom = rooms.find((r) => r.id === row.bottom)!;
      sim.teleport(pawn.id, h.center[0], h.center[1] + h.size[1] / 2, h.center[2], 0);
      steps(sim, 16);
      const stood = pawn.state.grounded && Math.abs(pawn.state.y - (h.center[1] + h.size[1] / 2)) < 0.05;
      const e = sim.level.panels.byId.get(row.id)!;
      const broke = sim.level.panels.apply(e.panel.spec.index, { kind: "damage", amount: 1000, hard: false }).broke;
      steps(sim, 128);
      const landed = pawn.state.grounded && Math.abs(pawn.state.y - storey(bottom.storey).floorY) < 0.05 && inRoom(bottom, pawn.state.x, pawn.state.z);
      if (!stood || !broke || !landed) problems.push(`${row.id}: stood ${stood}, broke ${broke}, landed in ${row.bottom} ${landed} (at ${pawn.state.x.toFixed(2)}, ${pawn.state.y.toFixed(2)}, ${pawn.state.z.toFixed(2)})`);
    }
    expect(problems).toEqual([]);
  });
});


describe("oregon stairs and the ladder (M3)", () => {
  const stairs = compileStairs(inputs.layout, fr);
  type Room = { id: string; storey: string; rects: [number, number, number, number][] };
  const roomAt = (storey: string, x: number, z: number) =>
    (level.rooms as Room[]).find((r) => r.storey === storey && r.rects.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1))?.id ?? "outside";
  let seq = 0;
  const cmd = (c: Partial<InputCmd> & { yawDeg?: number }): InputCmd => {
    const { yawDeg, ...rest } = c;
    return { seq: ++seq, forward: 0, strafe: 0, yaw: (yawDeg ?? 0) * DEG, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...rest };
  };
  /** The way up a run: its foot, each flight's foot and top (across a switchback's landing between), its arrival. */
  const wayUp = (run: CompiledRun): [number, number][] => {
    const pts: [number, number][] = [[run.foot[0], run.foot[2]]];
    for (const f of run.flights) {
      const [fx, fz] = [-Math.sin(f.yawDeg * DEG), -Math.cos(f.yawDeg * DEG)];
      const len = f.run * f.steps;
      pts.push([f.start[0] + fx * 0.2, f.start[2] + fz * 0.2], [f.start[0] + fx * (len + 0.25), f.start[2] + fz * (len + 0.25)]);
    }
    pts.push([run.top[0], run.top[2]]);
    return pts;
  };
  /** Walk a body along the points (yaw toward the next, forward held); where it ends up. */
  const walk = (sim: Sim, ctrl: { id: number }, pawn: { state: { x: number; y: number; z: number } }, pts: [number, number][]) => {
    let k = 1;
    for (let t = 0; t < 64 * 30 && k < pts.length; t++) {
      const [tx, tz] = pts[k];
      const [dx, dz] = [tx - pawn.state.x, tz - pawn.state.z];
      if (Math.hypot(dx, dz) < 0.2) {
        k++;
        continue;
      }
      sim.step(new Map([[ctrl.id, cmd({ forward: 1, yawDeg: Math.atan2(-dx, -dz) / DEG })]]));
    }
    for (let t = 0; t < 32; t++) sim.step(new Map([[ctrl.id, cmd({})]]));
    return { reached: k >= pts.length, x: pawn.state.x, y: pawn.state.y, z: pawn.state.z };
  };

  it("builds every staircase inside the building as runs between storeys, with the ladder to the Cat Walk", () => {
    expect(stairs.errors).toEqual([]);
    expect(stairs.runs.map((r) => r.id).sort()).toEqual(["S1:1F>2F", "S1:B>1F", "S2:1F>2F", "S2:B>1F", "S3:1F>2F", "S3:B>1F", "S4:1F>2F"]);
    expect((level as { stairs: unknown[] }).stairs.length).toBe(stairs.flights.length);
    expect((level as { ladders: { id: string }[] }).ladders.map((l) => l.id)).toEqual(["L1"]);
    for (const f of stairs.flights) expect(f.rise, f.id).toBeLessThanOrEqual(loadGameData().movement.step.maxStepHeight);
  });

  it("a body walks up every run from the room it starts in to the one it names, and back down", async () => {
    const sim = await Sim.create("oregon");
    const ctrl = sim.addPlayer("walker", "sledge");
    const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
    const problems: string[] = [];
    for (const run of stairs.runs) {
      const up = wayUp(run);
      sim.teleport(pawn.id, run.foot[0], run.foot[1], run.foot[2], 0, Stance.Stand);
      const a = walk(sim, ctrl, pawn, up);
      const room = roomAt(run.to, a.x, a.z);
      if (!a.reached || Math.abs(a.y - run.top[1]) > 0.05 || room !== run.topRoom) problems.push(`${run.id} up: at (${a.x.toFixed(2)}, ${a.y.toFixed(2)}, ${a.z.toFixed(2)}) in ${room}, reached ${a.reached}`);
      const b = walk(sim, ctrl, pawn, [...up].reverse());
      const from = roomAt(run.from, b.x, b.z);
      if (!b.reached || Math.abs(b.y - run.foot[1]) > 0.05 || from !== run.footRoom) problems.push(`${run.id} down: at (${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.z.toFixed(2)}) in ${from}, reached ${b.reached}`);
    }
    expect(problems).toEqual([]);
  });

  it("a body walking straight up any flight 5 cm in from an open side gets to its top: the slab never meets its head", async () => {
    const sim = await Sim.create("oregon");
    const ctrl = sim.addPlayer("walker", "sledge");
    const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
    const problems: string[] = [];
    for (const f of stairs.flights) {
      const [fx, fz] = [-Math.sin(f.yawDeg * DEG), -Math.cos(f.yawDeg * DEG)];
      const len = f.run * f.steps;
      const at = (a: number, c: number): [number, number] => [f.start[0] + fx * a - fz * c, f.start[2] + fz * a + fx * c];
      for (const side of [-1, 1]) {
        // An open side only: a wall alongside (10 cm out, its length, its height) keeps bodies 0.3 m off it anyway.
        const [p, q] = [at(0.1, side * f.width / 2), at(len - 0.1, side * (f.width / 2 + 0.1))];
        const strip = [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
        const [y0, y1] = [f.start[1] + 0.3, f.start[1] + f.rise * f.steps - 0.3];
        const walled = solids.some(
          (b) =>
            !b.drawOnly && !b.bodiesOnly && !["HARD_FLOOR", "SOFT_FLOOR", "HATCH"].includes(b.surface) &&
            b.center[0] + b.size[0] / 2 > strip[0] + 0.01 && b.center[0] - b.size[0] / 2 < strip[2] - 0.01 &&
            b.center[2] + b.size[2] / 2 > strip[1] + 0.01 && b.center[2] - b.size[2] / 2 < strip[3] - 0.01 &&
            b.center[1] + b.size[1] / 2 > y0 && b.center[1] - b.size[1] / 2 < y1,
        );
        if (walled) continue;
        // On the first tread, 5 cm in from that side, facing up the flight.
        const c = side * (f.width / 2 - 0.05);
        sim.teleport(pawn.id, f.start[0] + fx * 0.15 - fz * c, f.start[1] + f.rise, f.start[2] + fz * 0.15 + fx * c, f.yawDeg, Stance.Stand);
        let along = 0;
        for (let t = 0; t < 64 * 6 && along < len - 0.1; t++) {
          sim.step(new Map([[ctrl.id, cmd({ forward: 1, yawDeg: f.yawDeg })]]));
          along = (pawn.state.x - f.start[0]) * fx + (pawn.state.z - f.start[2]) * fz;
        }
        if (along < len - 0.1) problems.push(`${f.id} ${side < 0 ? "left" : "right"} side: stopped ${along.toFixed(2)} m up its ${len.toFixed(2)} m`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("the ladder takes you from the 2F Tower up onto the Cat Walk, and back down from the top", async () => {
    const sim = await Sim.create("oregon");
    const ctrl = sim.addPlayer("climber", "sledge");
    const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
    const m = sim.data.movement;
    const l = stairs.ladders[0];
    const [fx, fz] = [-Math.sin(l.yawDeg * DEG), -Math.cos(l.yawDeg * DEG)];
    const off = m.stance.collisionRadius + 0.05;
    const press = (c: Partial<InputCmd> & { yawDeg?: number }, ticks: number) => {
      for (let t = 0; t < ticks; t++) sim.step(new Map([[ctrl.id, cmd(c)]]));
    };
    sim.teleport(pawn.id, l.base[0] - fx * off, l.base[1], l.base[2] - fz * off, l.yawDeg, Stance.Stand);
    press({ yawDeg: l.yawDeg }, 16);
    press({ yawDeg: l.yawDeg, buttons: Btn.Interact }, 1);
    expect(pawn.state.mode).toBe(PawnMode.Ladder);
    press({ yawDeg: l.yawDeg, forward: 1 }, 64 * 3);
    press({ yawDeg: l.yawDeg }, 64);
    expect(pawn.state.mode).toBe(PawnMode.Walk);
    expect(pawn.state.y).toBeCloseTo(l.base[1] + l.height, 1);
    expect(roomAt("3F", pawn.state.x, pawn.state.z)).toBe("3F_CATWALK");
    // Turn round to face the well, grab it from the top, climb down to the 2F Tower.
    press({ yawDeg: l.yawDeg + 180 }, 16);
    press({ yawDeg: l.yawDeg + 180, buttons: Btn.Interact }, 1);
    expect(pawn.state.mode).toBe(PawnMode.Ladder);
    press({ yawDeg: l.yawDeg + 180, forward: -1 }, 64 * 3);
    expect(pawn.state.mode).toBe(PawnMode.Walk);
    expect(pawn.state.y).toBeCloseTo(l.base[1], 1);
    expect(roomAt("2F", pawn.state.x, pawn.state.z)).toBe("2F_TOWER");
    expect(pawn.state.hp).toBe(pawn.state.maxHp);
  });
});

describe("oregon walk graph (M3, DESIGN §9.2 check 10)", () => {
  type Room = { id: string; storey: string; rects: [number, number, number, number][] };
  const storeys = level.storeys as { id: string; floorY: number }[];
  /** A storey's floors, from its own level up to the next one's (the flights that start on it count as its). */
  const band = (id: string): [number, number] => {
    const y = storeys.find((s) => s.id === id)!.floorY;
    return [y - 0.1, Math.min(...storeys.map((s) => s.floorY).filter((f) => f > y), Infinity) - 0.1];
  };
  const junkyard = (level.spawns as { id: string; pos: Vec3 }[]).find((s) => s.id === "A_JUNKYARD")!;
  /** The rooms with a floor node in the component of attacker spawn A (the Junkyard). */
  const reached = (g: WalkGraph) => {
    const start = nodeNear(g, ...junkyard.pos);
    const main = g.comp[start];
    const rooms = (level.rooms as Room[]).filter((r) => r.rects.some((rect) => nodesIn(g, rect, ...band(r.storey)).some((n) => g.comp[n] === main)));
    return { start, main, rooms: rooms.map((r) => r.id) };
  };
  const breakAll = (sim: Sim, kind: string) => {
    for (const e of sim.level.panels.list) if (e.panel.kind === kind) sim.level.panels.apply(e.panel.spec.index, { kind: "damage", amount: 1e9, hard: false });
  };

  it("from the Junkyard attacker spawn, every barricade broken and nothing breached, a body walks to every room on every storey", async () => {
    const sim = await Sim.create("oregon");
    breakAll(sim, "barricade");
    const g = buildWalkGraph(sim);
    const r = reached(g);
    expect(r.start).toBeGreaterThanOrEqual(0);
    expect((level.rooms as Room[]).map((x) => x.id).filter((id) => !r.rooms.includes(id))).toEqual([]);
    for (const s of storeys) {
      const [y0, y1] = band(s.id);
      expect(g.comp.some((c, n) => c === r.main && g.y[n] >= y0 && g.y[n] < y1), s.id).toBe(true);
    }
    // The ladder joins the 2F Tower to the Cat Walk.
    for (const l of g.ladders) expect([l.id, g.comp[l.foot], g.comp[l.top]]).toEqual([l.id, r.main, r.main]);
  });

  it("a barricade shuts its doorway: the Main Entrance's two sides join only once it is broken", async () => {
    const sim = await Sim.create("oregon");
    const sides = (g: WalkGraph) => [nodeNear(g, 37.95, 0, 41.5), nodeNear(g, 37.95, 0, 43.4)];
    const up = buildWalkGraph(sim);
    const [inside, outside] = sides(up);
    expect(Math.min(inside, outside)).toBeGreaterThanOrEqual(0);
    expect(up.comp[inside]).not.toBe(up.comp[outside]);
    expect(reached(up).rooms).toEqual([]); // every way in is barricaded at the start
    sim.level.panels.apply(sim.level.panels.byId.get("1F.o011.bar")!.panel.spec.index, { kind: "damage", amount: 1e9, hard: false });
    const open = buildWalkGraph(sim);
    const [a, b] = sides(open);
    expect(open.comp[a]).toBe(open.comp[b]);
    expect(reached(open).rooms).toContain("1F_LOBBY");
  });

  /** The walk graph of a 20 m square floor with these boxes and ramps on it. */
  const flat = async (id: string, solids: unknown[], ramps: unknown[] = []) => {
    const data = loadGameData();
    const lab = data.levels.get("movement_lab")!;
    const level = levelSchema.parse({
      ...lab,
      id,
      solids: [{ id: "floor", center: [0, -0.1, 0], size: [20, 0.2, 20], surface: "HARD_FLOOR" }, ...solids],
      ramps,
      stairs: [],
      ladders: [],
      spawns: [{ id: "s", pos: [-8, 0, -8], yawDeg: 0 }],
    });
    return buildWalkGraph(await Sim.create(id, { ...data, levels: new Map(data.levels).set(id, level) }), { area: [-10, -10, 10, 10] });
  };

  it("joins the two sides of a wall through a gap a body fits (1 m), never through one it doesn't (0.6 m)", async () => {
    for (const [gap, joined] of [
      [0.6, false],
      [1.0, true],
    ] as const) {
      // A 0.2 m wall across the floor at x 0, the gap at z 0.
      const g = await flat(`gap_${gap}`, [
        { id: "north", center: [0, 1.5, (-10 - gap / 2) / 2], size: [0.2, 3, 10 - gap / 2], surface: "HARD_WALL" },
        { id: "south", center: [0, 1.5, (10 + gap / 2) / 2], size: [0.2, 3, 10 - gap / 2], surface: "HARD_WALL" },
      ]);
      const [a, b] = [nodeNear(g, -3, 0, 0), nodeNear(g, 3, 0, 0)];
      expect(Math.min(a, b), `${gap} m`).toBeGreaterThanOrEqual(0);
      expect(g.comp[a] === g.comp[b], `${gap} m`).toBe(joined);
    }
  });

  it("a ramp a body climbs (25°) joins the floor to the deck it leads to; one steeper than maxSlopeDeg (60°) doesn't", async () => {
    for (const [deg, joined] of [
      [25, true],
      [60, false],
    ] as const) {
      // A deck 1 m up at x 2..4, the ramp's top edge on its west edge.
      const rad = (deg * Math.PI) / 180;
      const g = await flat(
        `ramp_${deg}`,
        [{ id: "deck", center: [3, 0.5, 0], size: [2, 1, 2], surface: "HARD_FLOOR" }],
        [{ id: "ramp", start: [2 - 1 / Math.tan(rad), 0, 0], yawDeg: -90, length: 1 / Math.sin(rad), angleDeg: deg, width: 1.5, surface: "HARD_FLOOR" }],
      );
      const [floor, deck] = [nodeNear(g, -3, 0, 0), nodeNear(g, 3, 1, 0)];
      expect(Math.min(floor, deck), `${deg}°`).toBeGreaterThanOrEqual(0);
      expect(g.comp[floor] === g.comp[deck], `${deg}°`).toBe(joined);
    }
  });

  it("without the ladder, nothing reaches the Cat Walk: the graph doesn't leak through floors or walls", async () => {
    const sim = await Sim.create("oregon");
    breakAll(sim, "barricade");
    const r = reached(buildWalkGraph(sim, { ladders: false }));
    expect((level.rooms as Room[]).map((x) => x.id).filter((id) => !r.rooms.includes(id))).toEqual(["3F_CATWALK"]);
  });
});
