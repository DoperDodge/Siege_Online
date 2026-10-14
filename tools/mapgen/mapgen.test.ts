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
import { wallSchema, type SpanDef, type WallDef } from "./schema.js";
import { compileWalls } from "./walls.js";

const ROOT = join(import.meta.dirname, "..", "..");
const MAP = join(ROOT, "data", "maps", "oregon");
const inputs = loadInputs(ROOT);
const { level, report } = compile(inputs);
const extracted = JSON.parse(readFileSync(join(MAP, "extracted.json"), "utf8")) as Extracted;
type Box = { id: string; center: number[]; size: number[]; surface: string; bodiesOnly?: boolean; panel?: { sections?: number; empty?: boolean; construction?: string } };
const solids = level.solids as Box[];
const k = inputs.layout.units.mPerU;
const spansOf = (floor: string) => inputs.walls.find((w) => w.floor === floor)!.walls.flatMap((w) => w.spans.map((s) => ({ wall: w, span: s })));

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

  it("the compiled walls keep every room of the plan closed: no gap to the outside or between rooms", () => {
    const lines = inputs.walls.find((p) => p.floor === "1F")!.walls;
    const open = new Set(lines.flatMap((w) => w.spans.filter((x) => x.kind === "OPEN").map((x) => x.id)));
    const passages = solids.filter((b) => b.id.endsWith(".head") && open.has(b.id.slice(0, -5)));
    expect(passages.length).toBe(open.size);
    const found = enclosureLeaks(solids, passages, planGrid(lines, k), [-3, 3, 56, 47], 0.025, k);
    expect(found).toEqual({ toOutside: [], between: [], rooms: expect.any(Number) as number });
    expect(found.rooms).toBeGreaterThanOrEqual(14); // 1F's enclosed areas (open-plan rooms count as one)
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
      const used = new Set(part.dropped.map((x) => x.from));
      for (const w of part.walls) {
        for (const id of w.from ?? []) used.add(id);
        for (const s of w.spans) for (const id of s.from ?? []) used.add(id);
      }
      const ex = extracted.floors[part.floor];
      for (const item of [...ex.walls, ...ex.openings]) if (!used.has(item.id)) missing.push(`${part.floor}: ${item.id}`);
    }
    expect(missing).toEqual([]);
  });
});

describe("the junction rule on small layouts", () => {
  const fr = frames(inputs.layout);
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

describe("oregon 1F against the research", () => {
  const spans = spansOf("1F");

  it("all 17 soft walls of surfaces.md §2.2 are panels with their reinforcement sections, centred on the research", () => {
    const rows = softWalls(ROOT).filter((s) => s.floor === "1F");
    expect(rows).toHaveLength(17);
    for (const row of rows) {
      const span = spans.find((s) => s.span.id === row.id);
      expect(span, row.id).toBeDefined();
      const solid = solids.find((s) => s.id === row.id)!;
      expect([solid.surface, solid.panel?.sections], row.id).toEqual(["REINFORCEABLE", row.sections]);
      // The research rectangle is r6calls' soft-wall vector; the compiled panel is centred on it.
      const [cx, cz] = [((row.x[0] + row.x[1]) / 2) * k, ((row.y[0] + row.y[1]) / 2) * k];
      const along = row.axis === "H" ? Math.abs(solid.center[0] - cx) : Math.abs(solid.center[2] - cz);
      const across = row.axis === "H" ? Math.abs(solid.center[2] - cz) : Math.abs(solid.center[0] - cx);
      expect(across, row.id).toBeLessThan(0.5 * k + 0.05); // 0.5 u, plus snapping
      expect(along, row.id).toBeLessThan(0.15); // a junction can move an end up to half a wall
    }
    expect(solids.filter((s) => s.surface === "REINFORCEABLE")).toHaveLength(17);
  });

  it("every door, exterior opening and passage of layout_notes §6.2 is there, as the research types it", () => {
    // Rows with no span along a wall are open-plan links (no wall to put an opening in): rooms, in M2.
    const rows = connections(ROOT).filter((r) => r.floor === "1F" && r.type !== "SOFT" && r.line !== null);
    const wallOpenings = rows.filter((r) => !(r.type === "OPEN" && r.span === null));
    const differences: string[] = [];
    for (const row of wallOpenings) {
      const tag = `${row.roomA} | ${row.roomB}`;
      const found = spans.filter((s) => s.span.research === `layout_notes §6: ${tag} (${row.typeText})`);
      if (found.length !== 1) {
        differences.push(`${tag} ${row.type}: ${found.length} spans`);
        continue;
      }
      const kind: SpanDef["kind"] = found[0].span.kind;
      if (row.type === "DOOR" && kind !== "DOOR") differences.push(`${tag}: a door in the research, ${kind} here`);
      if (row.type === "OPEN" && kind !== "OPEN") differences.push(`${tag}: open in the research, ${kind} here`);
      if (row.type === "EXT_OPENING") {
        if (kind !== "DOOR" && kind !== "WINDOW") differences.push(`${tag}: an exterior opening, ${kind} here`);
        if (row.guess && kind !== row.guess) differences.push(`${tag}: research guesses ${row.guess}, ${kind} here`);
        if (report.openings[found[0].span.id] !== "exterior") differences.push(`${tag}: compiled as interior`);
      } else if (row.type === "DOOR" && report.openings[found[0].span.id] !== "interior") differences.push(`${tag}: compiled as exterior`);
    }
    expect(differences).toEqual([]);
    expect(wallOpenings.filter((r) => r.type === "EXT_OPENING")).toHaveLength(12);
    expect(wallOpenings.filter((r) => r.type === "DOOR")).toHaveLength(18);
  });

  it("exterior doors and windows start barricaded, inside doors are empty frames, windows have glass", () => {
    for (const [id, side] of Object.entries(report.openings)) {
      const bar = solids.find((s) => s.id === `${id}.bar`)!;
      expect(bar.surface, id).toBe("BARRICADE");
      expect(bar.panel?.empty === true, id).toBe(side === "interior");
      const glass = solids.find((s) => s.id === `${id}.glass`);
      if (bar.panel?.construction === "barricade_window") expect(glass?.surface, id).toBe("WINDOW");
    }
    expect(Object.values(report.openings).filter((v) => v === "exterior")).toHaveLength(12);
  });

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
