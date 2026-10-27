// The Oregon generator (tools/mapgen, DESIGN §9.2): the committed level.json is exactly what the layout
// compiles to; hard geometry never covers a panel; the compiled walls close the building where the plan does;
// the wall files still match the extraction; every 1F soft wall and opening the research lists is there with
// the right kind and sections; and the level runs: spawns stand on the ground, attackers outside.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Btn, bulletThroughPanels, crossFileProblems, DEG, levelSchema, loadGameData, missingUnverifiedPaths, PawnMode, pelletPath, QUERY_BULLET, QUERY_STATIC, Sim, Stance, type InputCmd, type PanelOp, type Vec3 } from "../../game/shared/src/index.js";
import { BUDGET, checkLevel, coplanarFaces } from "./checks.js";
import { frames } from "./frames.js";
import { compile, loadInputs } from "./compile.js";
import { readableJson } from "./format.js";
import { enclosureLeaks, planGrid } from "./enclosure.js";
import { planSvg } from "./plans.js";
import { distanceInside, PlanGrid } from "./grid.js";
import type { Extracted } from "./import.js";
import { connections, droneHoleTable, hatchTable, markerTables, roomTable, siteTable, softFloorTable, softWalls } from "./research.js";
import { CELL_M, clearCells, compileRooms, storeyOfBox } from "./rooms.js";
import { FLOOR_IDS, wallSchema, type SpanDef, type WallDef } from "./schema.js";
import type { Floor } from "./research.js";
import { compileStairs, flightBoxes, type CompiledRun } from "./stairs.js";
import { compileWalls } from "./walls.js";
import { mapReport, reportMarkdown, wallDrift } from "./report.js";
import { idList, walkChecklist, withChecklist } from "./checklist.js";
import { buildWalkGraph, nodeNear, nodesIn, type WalkGraph } from "./walkgraph.js";

const ROOT = join(import.meta.dirname, "..", "..");
const MAP = join(ROOT, "data", "maps", "oregon");
const inputs = loadInputs(ROOT);
const compiled = compile(inputs);
const { level, report } = compiled;
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
    // Two faces of different colours in one plane flicker: a wall's top flush with a slab's top is caught...
    const slab = { id: "slab", center: [0, -0.1, 0], size: [4, 0.2, 4], surface: "HARD_FLOOR" };
    const stub = { id: "stub", center: [1, -0.05, 0], size: [0.2, 0.1, 1], surface: "HARD_WALL" };
    expect(coplanarFaces([slab, stub] as never)).toEqual(["slab (HARD_FLOOR) and stub (HARD_WALL) share a face looking +y at 0.000 m"]);
    // ...turned a quarter turn too; a face something lies flat against (two bottoms on the ground) isn't seen.
    expect(coplanarFaces([slab, { ...stub, size: [1, 0.1, 0.2], yawDeg: 90 }] as never)).toHaveLength(1);
    const ground = { id: "ground", center: [0, -0.5, 0], size: [10, 1, 10], surface: "HARD_FLOOR" };
    const fence = { id: "fence", center: [0, 0.5, 0], size: [1, 1, 0.2], surface: "HARD_WALL" };
    const wreck = { id: "wreck", center: [0.2, 0.3, 0], size: [1, 0.6, 1], surface: "PROP" };
    expect(coplanarFaces([ground, fence, wreck] as never)).toEqual([]);
    expect(coplanarFaces([fence, wreck] as never)).toHaveLength(1);
    // A panel isn't cover: a hole in it would show the face.
    expect(coplanarFaces([{ ...ground, surface: "SOFT_FLOOR" }, fence, wreck] as never)).toHaveLength(1);
    // The stairs' steps are checked too: a step's top flush with a slab of another surface is caught.
    const flight = { id: "F", start: [0, 0, 0] as Vec3, yawDeg: 0, steps: 2, rise: 0.2, run: 0.3, width: 1, surface: "HARD_FLOOR" as const, solid: false };
    const ledge = { id: "ledge", center: [0, 0.05, -0.15], size: [2, 0.3, 0.4], surface: "HARD_WALL" };
    expect(checkLevel([ledge] as never, flightBoxes(flight)).errors).toEqual(["ledge (HARD_WALL) and F.step0 (HARD_FLOOR) share a face looking +y at 0.200 m"]);
    expect(checkLevel(level.solids as never, (level.stairs as Parameters<typeof flightBoxes>[0][]).flatMap(flightBoxes)).errors).toEqual([]);
    // What the client downloads first (DESIGN §8).
    expect(Buffer.byteLength(readableJson(level))).toBeLessThanOrEqual(BUDGET.levelBytes);
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
    // The walls' pieces: not the steps a roof stands on them (roofs.ts), which start at their tops, nor the
    // outside's boxes (exterior.ts) on the ground.
    const others = new Set([...inputs.layout.roofs.map((r) => r.id), ...inputs.exterior.items.map((i) => i.id), ...inputs.exterior.props.map((i) => i.id)]);
    const pieces = solids.filter((b) => /#\d/.test(b.id) && !others.has(b.id) && !others.has(b.id.split(/[.#]/)[0]) && !b.bodiesOnly && !b.drawOnly && Math.abs(b.center[1] - b.size[1] / 2 - storey.floorY) < 0.01);
    const [topIn, topOut] = next ? [next.floorY - next.slabM - storey.floorY, storey.underground ? next.floorY - next.slabM - storey.floorY : next.floorY - storey.floorY] : [inputs.layout.defaults.wallHeightM, inputs.layout.defaults.wallHeightM];
    expect([...new Set(pieces.map(top))].sort(), floor).toEqual([...new Set([topIn, topOut].map((t) => +t.toFixed(2)))].sort());
    if (topOut - topIn < 0.05) return; // no band: every wall reaches the same height
    expect(enclosureLeaks(solids, [], plan, [-3, 3, 56, 47], 0.025, k, storey.floorY + (topIn + topOut) / 2).toOutside, floor).toEqual([]);
  });

  it("spawns stand on the ground: spawn 0 for the labs, five attackers within 3 m of each insertion point, outside the building, facing it", async () => {
    // Sim.create refuses a spawn whose body would overlap anything, outside items included.
    const sim = await Sim.create("oregon");
    const lvl = sim.level.def;
    expect(lvl.spawns[0].side).toBeUndefined();
    const attack = lvl.spawns.filter((s) => s.side === "attack");
    const groups = [...new Set(attack.map((s) => s.group))];
    expect(groups).toEqual(["A_JUNKYARD", "B_STREET", "C_CONSTRUCTION"]);
    // The building: every storey's rooms; its middle, the rooms' anchors' mean.
    const anchors = lvl.rooms.map((r) => r.anchor);
    const middle = [anchors.reduce((a, p) => a + p[0], 0) / anchors.length, anchors.reduce((a, p) => a + p[2], 0) / anchors.length];
    const fromRooms = (x: number, z: number) => Math.min(...lvl.rooms.flatMap((r) => r.rects.map(([x0, z0, x1, z1]) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)))));
    for (const g of groups) {
      const mine = attack.filter((s) => s.group === g);
      expect(mine, g).toHaveLength(5);
      // The first is the insertion point itself (r6calls); the rest stand within 3 m of it.
      expect(mine[0].id, g).toBe(g);
      for (const s of mine) expect(Math.hypot(s.pos[0] - mine[0].pos[0], s.pos[2] - mine[0].pos[2]), s.id).toBeLessThanOrEqual(3 + 1e-6);
    }
    for (const s of lvl.spawns) {
      const hit = sim.world.castRay(new sim.R.Ray({ x: s.pos[0], y: s.pos[1] + 1, z: s.pos[2] }, { x: 0, y: -1, z: 0 }), 3, true, undefined, QUERY_STATIC);
      expect(hit?.timeOfImpact, s.id).toBeCloseTo(1, 1);
      const inBounds = s.pos[0] > lvl.bounds!.min[0] && s.pos[0] < lvl.bounds!.max[0] && s.pos[2] > lvl.bounds!.min[2] && s.pos[2] < lvl.bounds!.max[2];
      expect(inBounds, s.id).toBe(true);
      if (s.side !== "attack") continue;
      expect(fromRooms(s.pos[0], s.pos[2]), s.id).toBeGreaterThan(10);
      // Facing the building: within 10 degrees of its middle.
      const want = Math.atan2(-(middle[0] - s.pos[0]), -(middle[1] - s.pos[2])) / DEG;
      expect(Math.abs(((s.yawDeg - want + 540) % 360) - 180), s.id).toBeLessThan(10);
    }
    // Two bodies join and walk; the level is a working room level.
    const a = sim.addPlayer("a", "sledge");
    const b = sim.addPlayer("b", "mute");
    for (let t = 0; t < 64; t++) sim.step(new Map());
    for (const c of [a, b]) expect(sim.pawns.get(c.possessedPawnId)!.state.grounded).toBe(true);
  });

  it("the wall files still match the extraction, except where curated by hand", () => {
    const { drift } = wallDrift(inputs, extracted);
    expect(drift.length).toBeGreaterThan(300);
    const far = drift.filter((d) => d.du > 0.5);
    expect(far.map((d) => `${d.floor} ${d.id}: ${d.du === Infinity ? "from names a box extracted.json doesn't have" : `${d.what} drifted ${d.du} u from the extraction`}`)).toEqual([]);
  });

  it("the report lists the budgets, every UNVERIFIED value by file and record, and the drift", () => {
    const r = mapReport(ROOT, inputs, compiled, extracted);
    for (const b of r.budgets) expect(b.value, b.name).toBeLessThanOrEqual(b.limit);
    expect(r.budgets.map((b) => b.name)).toEqual(["solids", "panels", "panel cells per layer", "cells per layer of the largest panel", "level.json bytes"]);
    const find = (file: string, record: string) => r.unverified.find((u) => u.file === file && u.record === record)?.fields;
    expect(find("layout.json", "(file)")).toContain("units.mPerU");
    expect(find("layout.json", "zones PEEK_C_TOWER")).toEqual(["openings", "faces"]);
    expect(find("walls_1F.json", "spans SW-1F-03")).toBeDefined();
    // A site and its first defender spawn share an id; their records don't.
    expect(find("layout.json", "sites SITE_DORMS")).toBeDefined();
    expect(find("layout.json", "spawns SITE_DORMS")).toBeDefined();
    expect(new Set(r.unverified.map((u) => `${u.file} ${u.record}`)).size).toBe(r.unverified.length);
    expect(new Set(r.unverified.map((u) => u.file))).toEqual(new Set(["layout.json", ...inputs.layout.parts]));
    // A record with nothing left to verify isn't listed.
    expect(r.unverified.every((u) => u.fields.length > 0)).toBe(true);
    expect(r.curated.length).toBeGreaterThan(0);
    const md = reportMarkdown(compiled, r, { B: "alt" });
    for (const heading of ["## Counts", "## Budgets", "## Frames with an alternative", "## UNVERIFIED", "## Drift from the extraction"]) expect(md).toContain(heading);
    expect(md).toMatch(/\*\*B alt\*\* \(in use\)/);
  });

  it("the walk's checklist lists everything built, where it was built, and walkthrough.md has it fresh (DESIGN §9.4)", () => {
    const list = walkChecklist(inputs, compiled);
    const refs = new Set(list.items.map((i) => i.ref));
    const want = [
      ...compiled.walk.spans.map((s) => `span:${s.id}`),
      ...compiled.walk.splits.map((_, n) => `split:${n}`),
      ...new Set((level.stairs as { id: string }[]).map((f) => `stairs:${f.id.split("#")[0]}`)),
      ...(level.ladders as { id: string }[]).map((l) => `ladder:${l.id}`),
      ...solids.filter((s) => s.surface === "HATCH").map((s) => `hatch:${s.id}`),
      ...new Set(solids.filter((s) => s.surface === "SOFT_FLOOR").map((s) => `softfloor:${s.panel?.region}`)),
      ...(level.sites as { bombs: { id: string }[] }[]).flatMap((s) => s.bombs.map((b) => `bomb:${b.id}`)),
      ...(level.spawns as { id: string; side?: string }[]).filter((s) => s.side).map((s) => `spawn:${s.id}`),
      ...(level.cameras as { id: string }[]).map((c) => `camera:${c.id}`),
      ...(level.ingredients as { id: string }[]).map((g) => `ingredient:${g.id}`),
      ...inputs.exterior.props.map((p) => `prop:${p.id}`),
      ...inputs.layout.roofs.map((r) => `roof:${r.id}`),
      ...inputs.exterior.items.map((i) => `item:${i.id}`),
    ];
    expect(want.filter((r) => !refs.has(r))).toEqual([]);
    // A span with a room on either side is in that room's line; every room has a way in.
    for (const s of compiled.walk.spans) expect(list.items.some((i) => i.ref === `span:${s.id}` && (i.room !== null || i.text !== "")), s.id).toBe(true);
    const line = (id: string) => list.lines.find((l) => l.includes(`(\`${id}\`)`)) ?? "";
    for (const r of level.rooms as { id: string }[]) {
      expect(list.items.some((i) => i.room === r.id && /^(door |open |gap in the rail|stairs |ladder )/.test(i.text)), `${r.id} has no way in`).toBe(true);
    }
    // What the M6 review found missing or misplaced in the hand-made list.
    expect(line("B_FREEZER")).toContain("open north, to Freezer Hall, no wall between");
    expect(line("B_FREEZER")).toContain("open south, to Freezer Stairs, no wall between");
    expect(line("1F_TOWER_STAIRS")).toContain("open south, to Tower, no wall between");
    expect(line("B_SUPPLY")).toContain("door west to Closet (B.o008)");
    expect(line("1F_KITCHEN")).toContain("drone hole south, to Security Corridor (1F.dt4)");
    expect(line("1F_SECURITY_CORRIDOR")).toContain("drone hole north, to Kitchen (1F.dt4)");
    expect(line("1F_LOBBY")).not.toContain("1F.dt4");
    expect(line("3F_CATWALK")).toContain("window west to the outside (3F.o003");
    expect(list.lines.join("\n")).toContain("drone hole **1F.dt3** on 1F, into an enclosed space that is no room (beside White Stairs)");
    const outside = list.lines.slice(list.lines.indexOf("#### Outside and roofs")).join("\n");
    expect(outside).toMatch(/\*\*CAM1\*\*.*\*\*CAM2\*\*.*\*\*CAM3\*\*/);
    expect(outside).toContain("Meeting Roof (`RF_MEETING_W`, gable 10°)");
    expect(outside).toContain("0.8 m: EXT_GARDEN_S, EXT_GARDEN_W; 0.6 m: EXT_BED_NE#0–3");
    expect(idList(["EXT_FENCE_N4", "EXT_A", "EXT_FENCE_N1", "EXT_FENCE_N2"])).toBe("EXT_A, EXT_FENCE_N1–2, EXT_FENCE_N4");
    // walkthrough.md carries this list (npm run mapgen), and a ticked line stays ticked through a rewrite.
    const doc = readFileSync(join(ROOT, "research", "oregon", "walkthrough.md"), "utf8");
    expect(withChecklist(doc, list.lines) === doc, "the checklist in research/oregon/walkthrough.md is stale: run npm run mapgen").toBe(true);
    const ticked = doc.replace("- [ ] **Freezer** (`B_FREEZER`)", "- [x] **Freezer** (`B_FREEZER`)");
    expect(ticked).not.toBe(doc);
    expect(withChecklist(ticked, list.lines)).toBe(ticked);
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

  it("every drone hole of layout_notes §5.4 is a slot on its floor, or dropped there with a reason; the basement's copy of the 1F chevron counts once", () => {
    const rows = droneHoleTable(ROOT);
    expect(rows).toHaveLength(12);
    // r6calls' drone-tunnel icons, by the id a wall file gives them ("0-dt-rect2903": B's rect2903).
    const icons = new Map(extracted.points.filter((p) => p.kind === "dt").map((p) => [`${FLOOR_IDS.indexOf(p.floor)}-dt-${p.id}`, p]));
    const problems: string[] = [];
    const matched = new Set<string>();
    for (const row of rows) {
      const inRow = (x: number, y: number) => x >= row.x[0] - 0.5 && x <= row.x[1] + 0.5 && y >= row.y[0] - 0.5 && y <= row.y[1] + 0.5;
      const part = inputs.walls.find((p) => p.floor === row.floor)!;
      const slots = part.walls.flatMap((w) => w.spans.filter((s) => s.kind === "DRONE_HOLE" && (w.axis === "H" ? inRow((s.at[0] + s.at[1]) / 2, w.at) : inRow(w.at, (s.at[0] + s.at[1]) / 2))));
      const dropped = part.dropped.filter((d) => icons.has(d.from) && inRow(...icons.get(d.from)!.c));
      if (slots.length + dropped.length !== 1) problems.push(`${row.floor} ${row.between}: ${slots.length} slots and ${dropped.length} dropped icons`);
      for (const d of dropped) if (!d.note.includes("layout_notes")) problems.push(`${d.from}: dropped without the research's reason`);
      for (const s of slots) matched.add(s.id);
    }
    expect(problems).toEqual([]);
    // No slot the research doesn't have.
    const all = inputs.walls.flatMap((p) => p.walls.flatMap((w) => w.spans.filter((s) => s.kind === "DRONE_HOLE").map((s) => s.id)));
    expect(all.filter((id) => !matched.has(id))).toEqual([]);
    expect(all).toHaveLength(10);
    // The basement's south chevron is 1F's, drawn again on the basement image: built once, on 1F.
    const [b, f] = ["0-dt-rect22247", "1-dt-rect3171-4"].map((id) => icons.get(id)!);
    expect([b.rect[0], b.rect[2]]).toEqual([f.rect[0], f.rect[2]]);
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

  it("builds every staircase as runs between storeys and the outside, with the ladder to the Cat Walk", () => {
    expect(stairs.errors).toEqual([]);
    expect(stairs.runs.map((r) => r.id).sort()).toEqual(["S1:1F>2F", "S1:B>1F", "S2:1F>2F", "S2:B>1F", "S3:1F>2F", "S3:B>1F", "S4:1F>2F", "S5:B>EXT", "S6:EXT>2F"]);
    expect((level as { stairs: { id: string }[] }).stairs.filter((f) => stairs.flights.some((g) => g.id === f.id))).toHaveLength(stairs.flights.length);
    expect((level as { ladders: { id: string }[] }).ladders.map((l) => l.id)).toEqual(["L1"]);
    for (const f of stairs.flights) expect(f.rise, f.id).toBeLessThanOrEqual(loadGameData().movement.step.maxStepHeight);
  });

  it("a body walks up every run from the room it starts in to the one it names (outside, if none), and back down", async () => {
    const sim = await Sim.create("oregon");
    const ctrl = sim.addPlayer("walker", "sledge");
    const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
    const problems: string[] = [];
    for (const run of stairs.runs) {
      const up = wayUp(run);
      sim.teleport(pawn.id, run.foot[0], run.foot[1], run.foot[2], 0, Stance.Stand);
      const a = walk(sim, ctrl, pawn, up);
      const room = roomAt(run.to, a.x, a.z);
      if (!a.reached || Math.abs(a.y - run.top[1]) > 0.05 || room !== (run.topRoom ?? "outside")) problems.push(`${run.id} up: at (${a.x.toFixed(2)}, ${a.y.toFixed(2)}, ${a.z.toFixed(2)}) in ${room}, reached ${a.reached}`);
      const b = walk(sim, ctrl, pawn, [...up].reverse());
      const from = roomAt(run.from, b.x, b.z);
      if (!b.reached || Math.abs(b.y - run.foot[1]) > 0.05 || from !== (run.footRoom ?? "outside")) problems.push(`${run.id} down: at (${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.z.toFixed(2)}) in ${from}, reached ${b.reached}`);
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
        const alongside = (b: (typeof solids)[number]) =>
          !b.drawOnly && !["HARD_FLOOR", "SOFT_FLOOR", "HATCH"].includes(b.surface) &&
          b.center[0] + b.size[0] / 2 > strip[0] + 0.01 && b.center[0] - b.size[0] / 2 < strip[2] - 0.01 &&
          b.center[2] + b.size[2] / 2 > strip[1] + 0.01 && b.center[2] - b.size[2] / 2 < strip[3] - 0.01 &&
          b.center[1] + b.size[1] / 2 > y0 && b.center[1] - b.size[1] / 2 < y1;
        if (solids.some((b) => !b.bodiesOnly && alongside(b))) continue;
        // On the first tread, 5 cm in from that side, facing up the flight; beside a guard (bodies only), just
        // clear of it: no body stands inside one, and from in there it can hook onto its top edge.
        const r = sim.data.movement.stance.collisionRadius;
        const c = side * (f.width / 2 - (solids.some((b) => b.bodiesOnly && alongside(b)) ? r + 0.02 : 0.05));
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

  it("the outside is one piece: from the Junkyard a body walks to every attacker spawn, down S5 to the Bunker and up S6 to the Meeting roof", async () => {
    // Barricades stay up: broken, the building would join the passage to the rest through the basement's east door.
    /** Which of the passage's floor at the Bunker's door and the Meeting roof east of the Attic (past S6's landing) the spawns reach. */
    const outside = async (without: string | null) => {
      // (loadGameData() is shared: the level goes into a copy of its map.)
      const data = { ...loadGameData(), levels: new Map(loadGameData().levels) };
      const def = structuredClone(data.levels.get("oregon")!);
      def.stairs = def.stairs.filter((f) => without === null || !f.id.startsWith(without));
      data.levels.set("oregon", def);
      const g = buildWalkGraph(await Sim.create("oregon", data));
      const main = g.comp[nodeNear(g, ...junkyard.pos)];
      const lost = (level.spawns as { id: string; side?: string; pos: Vec3 }[]).filter((s) => s.side === "attack").filter((s) => g.comp[nodeNear(g, ...s.pos)] !== main);
      const reach = (x: number, y: number, z: number) => {
        const n = nodeNear(g, x, y, z);
        return n >= 0 && g.comp[n] === main;
      };
      return { lost: lost.map((s) => s.id), passage: reach(335 * k, -3.2, 127 * k), meetingRoof: reach(285 * k, 3.2, 140 * k) };
    };
    expect(await outside(null)).toEqual({ lost: [], passage: true, meetingRoof: true });
    // Each way in hangs on its stairs.
    expect(await outside("S5:")).toEqual({ lost: [], passage: false, meetingRoof: true });
    expect(await outside("S6:")).toEqual({ lost: [], passage: true, meetingRoof: false });
  });

  it("the play area's edge holds a body in: walking at it from inside, on each side, it stops at the edge", async () => {
    const sim = await Sim.create("oregon");
    const ctrl = sim.addPlayer("walker", "sledge");
    const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
    const [px0, pz0, px1, pz1] = inputs.exterior.playable.map((u) => u * k);
    let seq = 0;
    // From 3 m inside, at a spot clear of the outside's items, walking straight at the edge for 4 s.
    for (const [x, z, yawDeg] of [[0, pz0 + 3, 0], [0, pz1 - 3, 180], [px0 + 3, 0, 90], [px1 - 3, 0, -90]] as const) {
      sim.teleport(pawn.id, x, 0, z, yawDeg, Stance.Stand);
      for (let t = 0; t < 64 * 4; t++) sim.step(new Map([[ctrl.id, { seq: ++seq, forward: 1, strafe: 0, yaw: yawDeg * DEG, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0 }]]));
      const s = pawn.state;
      expect([yawDeg, s.x > px0 && s.x < px1 && s.z > pz0 && s.z < pz1 && s.grounded && Math.abs(s.y) < 0.05]).toEqual([yawDeg, true]);
    }
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

  it("a prop shuts a gap it stands across, with a bullet class (its own collision group) or without", async () => {
    for (const cls of [undefined, "wood"]) {
      // The 1 m gap of the test before, a wardrobe across it.
      const g = await flat(`gap_prop_${cls ?? "none"}`, [
        { id: "north", center: [0, 1.5, -5.25], size: [0.2, 3, 9.5], surface: "HARD_WALL" },
        { id: "south", center: [0, 1.5, 5.25], size: [0.2, 3, 9.5], surface: "HARD_WALL" },
        { id: "wardrobe", center: [0.4, 1, 0], size: [0.6, 2, 1.4], surface: "PROP", ...(cls ? { prop: cls } : {}) },
      ]);
      const [a, b] = [nodeNear(g, -3, 0, 0), nodeNear(g, 3, 0, 0)];
      expect(Math.min(a, b), cls ?? "no class").toBeGreaterThanOrEqual(0);
      expect(g.comp[a] === g.comp[b], cls ?? "no class").toBe(false);
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

describe("oregon outside (M4, DESIGN §5.9)", () => {
  type Item = (typeof inputs.exterior.items)[number];
  const withItem = (item: Item) => compile({ ...inputs, exterior: { ...inputs.exterior, items: [...inputs.exterior.items, item] } });
  const reel = inputs.exterior.items.find((i) => i.id === "EXT_REEL")!;

  it("nothing outside stands in a room: an item placed inside the building is reported, turned by its yaw", () => {
    expect(report.errors.filter((e) => e.startsWith("exterior.json"))).toEqual([]);
    // Where the reel first went: across the Meeting Hall's east wall (its outer face at 293 u).
    expect(withItem({ ...reel, id: "EXT_TEST", rect: [282, 144, 298, 160] }).report.errors).toContain("exterior.json EXT_TEST: stands in 1F_MEETING_HALL");
    // A plank 0.3 m wide and 6 m long beside that wall's outer face: clear lying north–south, in the hall turned
    // a quarter.
    const plank = { ...reel, id: "EXT_TEST", rect: [295, 132, 297, 172] as [number, number, number, number] };
    expect(withItem(plank).report.errors.filter((e) => e.includes("EXT_TEST"))).toEqual([]);
    expect(withItem({ ...plank, yawDeg: 90 }).report.errors).toContain("exterior.json EXT_TEST: stands in 1F_MEETING_HALL");
  });
});

describe("oregon sites, cameras and ingredients (M5, DESIGN §5.11)", () => {
  type Room = { id: string; callout: string; storey: string; rects: [number, number, number, number][] };
  const rooms = level.rooms as Room[];
  const roomOf = (id: string) => rooms.find((r) => r.id === id)!;
  const holds = (r: Room, x: number, z: number, eps = 0.02) =>
    r.rects.some(([x0, z0, x1, z1]) => x >= Math.min(x0, x1) - eps && x <= Math.max(x0, x1) + eps && z >= Math.min(z0, z1) - eps && z <= Math.max(z0, z1) + eps);
  const storeys = level.storeys as { id: string; floorY: number; ceilingY: number }[];
  const storey = (id: string) => storeys.find((s) => s.id === id)!;
  /** A solid box at height y whose footprint is within `near` metres of (x, z), with (x, z) outside it. */
  const wallBehind = (x: number, y: number, z: number, near = 0.08) =>
    solids.some((b) => {
      if (b.drawOnly || b.bodiesOnly || y <= b.center[1] - b.size[1] / 2 || y >= b.center[1] + b.size[1] / 2) return false;
      const dx = Math.max(b.center[0] - b.size[0] / 2 - x, 0, x - b.center[0] - b.size[0] / 2);
      const dz = Math.max(b.center[2] - b.size[2] / 2 - z, 0, z - b.center[2] - b.size[2] / 2);
      return Math.hypot(dx, dz) > 0 && Math.hypot(dx, dz) <= near;
    });
  /** The point `m` metres ahead along a yaw (0 faces north, −z; 90 west, −x). */
  const ahead = (x: number, z: number, yawDeg: number, m: number): [number, number] => [x - Math.sin((yawDeg * Math.PI) / 180) * m, z - Math.cos((yawDeg * Math.PI) / 180) * m];

  it("has the four bomb sites of layout_notes §3, A and B as r6calls letters them, each bomb at its marker on its room's floor", () => {
    type Site = { id: string; rooms: string[]; bombs: { id: string; pos: Vec3; room: string }[]; plantMarginM: number };
    const research = siteTable(ROOT);
    expect(research.map((r) => r.number)).toEqual([1, 2, 3, 4]);
    const name = (id: string) => `${roomOf(id).storey} ${roomOf(id).callout}`;
    for (const row of research) {
      const def = inputs.layout.sites.find((s) => s.number === row.number)!;
      expect([row.number, def.rooms.map(name)]).toEqual([row.number, [row.a, row.b]]);
      // Each marker inside the research's box for it (the floor's own u).
      def.bombs.forEach((b, i) => {
        const [[x0, x1], [y0, y1]] = i === 0 ? row.markerA : row.markerB;
        expect([b.id, b.at[0] >= x0 && b.at[0] <= x1 && b.at[1] >= y0 && b.at[1] <= y1]).toEqual([b.id, true]);
      });
      const site = (level.sites as Site[]).find((s) => s.id === def.id)!;
      expect(site.rooms).toEqual(def.rooms);
      expect(site.plantMarginM).toBe(0.5);
      for (const b of site.bombs) {
        expect([b.id, holds(roomOf(b.room), b.pos[0], b.pos[2], 0), b.pos[1]]).toEqual([b.id, true, storey(roomOf(b.room).storey).floorY]);
      }
    }
  });

  it("has r6calls' eight cameras (map_features §2), each on a wall of its room under the ceiling looking into it, or outside on a post", () => {
    // The research's rooms by our ids: Rear Stage is r6calls' 1F "Tower" (map_features §0.4).
    const want: Record<string, string | null> = { CAM1: null, CAM2: null, CAM3: null, CAM4: "B_FREEZER", CAM5: "1F_TOWER", CAM6: "1F_LOBBY", CAM7: "1F_SHOWER_CORRIDOR", CAM8: "2F_ARMORY_CORRIDOR" };
    const research = markerTables(ROOT).cameras;
    expect(research.map((c) => c.id)).toEqual(Object.keys(want));
    expect(research.map((c) => c.floor)).toEqual(["EXT", "EXT", "EXT", "B", "1F", "1F", "1F", "2F"]);
    const cams = level.cameras as { id: string; pos: Vec3; yawDeg: number; pitchDeg: number; room?: string }[];
    expect(cams.map((c) => c.id)).toEqual(Object.keys(want));
    for (const c of cams) {
      const [x, y, z] = c.pos;
      expect([c.id, c.room ?? null, c.pitchDeg, wallBehind(x, y, z)]).toEqual([c.id, want[c.id], -20, true]);
      if (!c.room) {
        expect(solids.some((b) => b.id === `${c.id}.post`)).toBe(true);
        continue;
      }
      const r = roomOf(c.room);
      expect([c.id, holds(r, x, z), y]).toEqual([c.id, true, Math.round((storey(r.storey).ceilingY - 0.3) * 1e4) / 1e4]);
      expect([c.id, holds(r, ...ahead(x, z, c.yawDeg, 1))]).toEqual([c.id, true]); // looking into the room
    }
  });

  it("has r6calls' seven extinguishers and two gas pipes (map_features §3), each on a wall of its room, facing out of it", () => {
    const want: Record<string, string> = {
      ING1: "B_CORRIDOR",
      ING2: "B_FREEZER_HALL", // the Freezer's north arm
      ING3: "1F_SECURITY_CORRIDOR",
      ING4: "1F_KITCHEN_CORRIDOR",
      ING5: "1F_LOBBY",
      ING6: "2F_TROPHY",
      ING7: "2F_LOW_ATTIC",
      ING8: "1F_ARMORY_STAIRS", // the PC callout "Main Stairs" is r6calls' Armory Stairs (map_features §0.4)
      ING9: "2F_ATTIC",
    };
    const research = markerTables(ROOT).ingredients;
    expect(research.map((g) => [g.id, g.kind.includes("gas") ? "gas_pipe" : "fire_extinguisher"])).toEqual(
      inputs.layout.ingredients.map((g) => [g.id, g.kind]),
    );
    const ings = level.ingredients as { id: string; kind: string; pos: Vec3; yawDeg: number; room?: string }[];
    expect(ings.filter((g) => g.kind === "fire_extinguisher")).toHaveLength(7);
    expect(ings.filter((g) => g.kind === "gas_pipe")).toHaveLength(2);
    for (const g of ings) {
      const [x, y, z] = g.pos;
      const r = roomOf(want[g.id]);
      expect([g.id, g.room, Math.round((y - storey(r.storey).floorY) * 1e4) / 1e4]).toEqual([g.id, want[g.id], g.kind === "gas_pipe" ? 1.2 : 1]);
      expect([g.id, wallBehind(x, y, z), holds(r, x, z), holds(r, ...ahead(x, z, g.yawDeg, 0.3))]).toEqual([g.id, true, true, true]);
    }
  });

  it("has five defenders at each site, three in its A room and two in its B, on the floor, facing between the bombs", () => {
    type Spawn = { id: string; side?: string; group?: string; pos: Vec3; yawDeg: number };
    type Site = { id: string; rooms: string[]; bombs: { pos: Vec3 }[] };
    const spawns = (level.spawns as Spawn[]).filter((x) => x.side === "defense");
    const sites = level.sites as Site[];
    expect([...new Set(spawns.map((x) => x.group))].sort()).toEqual(sites.map((x) => x.id).sort());
    for (const site of sites) {
      const mine = spawns.filter((x) => x.group === site.id);
      const where = mine.map((x) => site.rooms.findIndex((id) => holds(roomOf(id), x.pos[0], x.pos[2], 0)));
      expect([site.id, where.filter((i) => i === 0).length, where.filter((i) => i === 1).length]).toEqual([site.id, 3, 2]);
      const [mx, mz] = [(site.bombs[0].pos[0] + site.bombs[1].pos[0]) / 2, (site.bombs[0].pos[2] + site.bombs[1].pos[2]) / 2];
      for (const x of mine) {
        expect([x.id, x.pos[1]]).toEqual([x.id, storey(roomOf(site.rooms[where[mine.indexOf(x)]]).storey).floorY]);
        const yaw = (Math.atan2(-(mx - x.pos[0]), -(mz - x.pos[2])) * 180) / Math.PI;
        expect(Math.abs(((x.yawDeg - yaw + 540) % 360) - 180), x.id).toBeLessThan(0.1);
      }
    }
    // A body fits at every spawn: Sim.create refuses one that overlaps anything (props included).
  });

  it("places the major cover props as PROPs with a class, on their storey's floor in a room; low ones vaultable, bunk beds not", () => {
    type Solid = Box & { prop?: string; vaultable?: boolean };
    const props = (solids as Solid[]).filter((b) => b.surface === "PROP" && b.prop !== undefined);
    expect(props.map((b) => b.id).sort()).toEqual(inputs.exterior.props.map((p) => p.id).sort());
    const classes = loadGameData().destruction.props.classes;
    for (const b of props) {
      const bottom = b.center[1] - b.size[1] / 2;
      const st = storeys.find((x) => Math.abs(x.floorY - bottom) < 1e-6);
      const room = rooms.find((r) => r.storey === st?.id && holds(r, b.center[0], b.center[2], 0));
      // Wholly in that room: every corner of its footprint, turned by its yaw, 5 cm in.
      const yaw = (((b as { yawDeg?: number }).yawDeg ?? 0) * Math.PI) / 180;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => {
        const [dx, dz] = [i * (b.size[0] / 2 - 0.05), j * (b.size[2] / 2 - 0.05)];
        return [b.center[0] + dx * Math.cos(yaw) + dz * Math.sin(yaw), b.center[2] - dx * Math.sin(yaw) + dz * Math.cos(yaw)];
      });
      const whole = room !== undefined && corners.every(([x, z]) => holds(room, x, z, 0));
      const bunk = b.id.includes("BUNK");
      expect([b.id, Object.hasOwn(classes, b.prop!), st?.id !== undefined, whole, !!b.vaultable]).toEqual([b.id, true, true, true, b.size[1] <= 1.1 && !bunk]);
    }
  });

  it("refuses a prop in a doorway or an open passage, on a hatch, on the stairs, or into a wall", () => {
    const withProp = (id: string, change: Partial<(typeof inputs.exterior.props)[number]>) =>
      compile({ ...inputs, exterior: { ...inputs.exterior, props: inputs.exterior.props.map((p) => (p.id === id ? { ...p, ...change } : p)) } }).report.errors;
    // The Master's bed where the render first put it: its corner in front of the Master's south door.
    expect(withProp("PROP_MASTER_BED", { rect: [250, 244, 266, 262] })).toContain("exterior.json PROP_MASTER_BED: stands in the doorway of 2F.o018");
    // A Kids' Dorms bed on hatch H4.
    expect(withProp("PROP_KIDS_BED_W", { frame: "world", rect: [140, 182, 148, 189] })).toContain("exterior.json PROP_KIDS_BED_W: stands on the hatch H4");
    // The Kitchen island on the Tower Stairs' first flight up from 1F.
    expect(withProp("PROP_KITCHEN_ISLAND", { frame: "world", rect: [244, 66, 250, 74] })).toContain("exterior.json PROP_KITCHEN_ISLAND: stands on the stairs");
    // The island, a metre square, in the middle of the open passage from the Security Corridor to the Lobby (1F.o017).
    const passage = compileWalls(inputs.layout, fr, inputs.walls, inputs.exterior.playable).passages.find((p) => p.id === "1F.o017")!;
    const [px, pz] = (passage.axis === "H" ? [(passage.a0 + passage.a1) / 2, passage.at] : [passage.at, (passage.a0 + passage.a1) / 2]).map((m) => m / k);
    expect(withProp("PROP_KITCHEN_ISLAND", { frame: "world", rect: [px - 3.33, pz - 3.33, px + 3.33, pz + 3.33] })).toContain("exterior.json PROP_KITCHEN_ISLAND: stands in the doorway of 1F.o017");
    // The Dorms' east bed where it was first traced, across the wall into the Game Room.
    expect(withProp("PROP_DORMS_BED_E", { rect: [201, 225, 209, 239] })).toContain("exterior.json PROP_DORMS_BED_E: goes into 2F.w067#0");
  });

  it("a bullet goes through the Kitchen island (wood) at ×0.7 and stops at a chest freezer (metal)", async () => {
    const sim = await Sim.create("oregon");
    const rifle = { rule: loadGameData().destruction.bullets.tiers.medium! };
    const bodyAt = (t: number) => (max: number) => (max > t ? [{ id: 9, parts: [{ part: "torso" as const, t }] }] : []);
    // East at waist height across the island (x 22.5 to 25.8 m) to a body 6 m on.
    const island = pelletPath(sim, [21.5, 0.5, 27], [1, 0, 0], bodyAt(6), "none", rifle);
    expect([island.hits.map((h) => +h.mult.toFixed(6)), island.surfaces]).toEqual([[0.7], 1]);
    // East in the Freezer at 0.4 m into the chest by its west end (from x 23.1 m): stopped at its face.
    const chest = pelletPath(sim, [22, -2.8, 31.2], [1, 0, 0], bodyAt(3), "none", rifle);
    expect([chest.hits, +chest.wall!.toFixed(2)]).toEqual([[], 1.08]);
  });

  it("reports a marker it can't place: a camera far from every wall of its room, a bomb outside its room", () => {
    const moved = compile({
      ...inputs,
      layout: {
        ...inputs.layout,
        // CAM6 into the middle of the Meeting Hall; bomb 2A over in the Kitchen.
        cameras: inputs.layout.cameras.map((c) => (c.id === "CAM6" ? { ...c, at: [250, 160] as [number, number] } : c)),
        sites: inputs.layout.sites.map((s) => (s.id === "SITE_DINING" ? { ...s, bombs: [{ ...s.bombs[0], at: [176.54, 175.7] as [number, number] }, s.bombs[1]] } : s)),
      },
    });
    expect(moved.report.errors).toContain("camera CAM6: no wall of 1F_MEETING_HALL within 2 m of its marker reaches 2.70 m");
    expect(moved.report.errors.join("\n")).toMatch(/site SITE_DINING: bomb 2A at \([\d.]+, [\d.]+\) isn't in 1F_DINING/);
  });

  it("puts an outside marker on the building's outer face, looking or facing out; reports one inside the building, and an inside one in no room", () => {
    // 1.4 m south of the 1F south wall at x 18 m (world u 120, 283.33): more than 1.5 m from every room.
    const outside: [number, number] = [120, 283.333];
    type Cam = (typeof inputs.layout.cameras)[number];
    type Ing = (typeof inputs.layout.ingredients)[number];
    const withMarkers = (cams: (c: Cam) => Cam, ings: (g: Ing) => Ing) =>
      compile({ ...inputs, layout: { ...inputs.layout, cameras: inputs.layout.cameras.map(cams), ingredients: inputs.layout.ingredients.map(ings) } });
    const near = withMarkers(
      (c) => (c.id === "CAM1" ? { ...c, frame: "world", at: outside } : c),
      (g) => (g.id === "ING8" ? { ...g, level: "EXT", room: undefined, frame: "world", at: outside } : g),
    );
    expect(near.report.errors).toEqual([]);
    const cam = (near.level.cameras as { id: string; pos: Vec3; yawDeg: number; room?: string }[]).find((c) => c.id === "CAM1")!;
    const pipe = (near.level.ingredients as { id: string; pos: Vec3; yawDeg: number; room?: string }[]).find((g) => g.id === "ING8")!;
    for (const m of [cam, pipe]) {
      // On the wall's outer face (z about 41.1 m), in no room, looking or facing south: out from the wall.
      expect([m.room, Math.abs(m.pos[2] - 41.15) < 0.1, Math.abs(m.pos[0] - 18) < 0.01], m.id).toEqual([undefined, true, true]);
      expect(-Math.cos((m.yawDeg * Math.PI) / 180), m.id).toBeGreaterThan(0.99);
    }
    expect((near.level.solids as { id: string }[]).some((b) => b.id === "CAM1.post")).toBe(false);
    // An outside camera whose marker is in the Meeting Hall; an extinguisher on 1F whose marker is out there.
    const bad = withMarkers(
      (c) => (c.id === "CAM1" ? { ...c, frame: "world", at: [250, 160] } : c),
      (g) => (g.id === "ING3" ? { ...g, room: undefined, frame: "world", at: outside } : g),
    );
    expect(bad.report.errors).toEqual(["camera CAM1: its marker at (37.50, 24.00) is inside the building, but its level is EXT", "fire_extinguisher ING3: its marker at (18.00, 42.50) is in no room on 1F"]);
  });
});

describe("oregon zones and rappel faces (M5, DESIGN §5.11)", () => {
  type ZoneBox = { center: Vec3; size: Vec3 };
  type LevelZone = { id: string; kind: string; boxes: ZoneBox[]; normal?: Vec3; faces?: string };
  const zones = level.zones as LevelZone[];
  const storeys = level.storeys as { id: string; floorY: number }[];
  const floorOf = (f: string) => storeys.find((s) => s.id === f)!.floorY;
  const inBox = (b: ZoneBox, p: Vec3, eps = 1e-6) => p.every((v, a) => Math.abs(v - b.center[a]) <= b.size[a] / 2 + eps);
  /** The building zones holding a point. */
  const buildingAt = (p: Vec3, among = zones) => among.filter((z) => z.kind === "building" && z.boxes.some((b) => inBox(b, p))).map((z) => z.id);
  const opened = compileWalls(inputs.layout, fr, inputs.walls, inputs.exterior.playable).openings;
  type Opening = (typeof opened)[number];
  /** The point `m` metres out from an opening's outer face (negative: in from it), at its middle, at height y. */
  const outFrom = (o: Opening, m: number, y: number): Vec3 => {
    const across = o.at + o.out * (o.t / 2 + m);
    const along = (o.a0 + o.a1) / 2;
    return o.axis === "H" ? [along, y, across] : [across, y, along];
  };
  /** The rappel faces over an opening: on its storey, looking out of it, against its outer face, across all of it. */
  const facesOver = (o: Opening, among = zones) =>
    among.filter((z) => {
      if (z.kind !== "rappel" || z.id.split(":")[1] !== o.floor) return false;
      const [b] = z.boxes;
      const [axis, along] = o.axis === "H" ? [2, 0] : [0, 2];
      if (z.normal![axis] !== o.out) return false;
      const wallSide = b.center[axis] - (o.out * b.size[axis]) / 2;
      return Math.abs(wallSide - (o.at + (o.out * o.t) / 2)) <= 0.2 && b.center[along] - b.size[along] / 2 <= o.a0 + 1e-6 && b.center[along] + b.size[along] / 2 >= o.a1 - 1e-6;
    });

  it("each storey's building zone holds its rooms and walls, from its floor to the next storey's; the roofs and the attackers' spawns are outside", () => {
    expect(zones.filter((z) => z.kind === "building").map((z) => z.id)).toEqual(storeys.map((s) => `building:${s.id}`));
    storeys.forEach((s, i) => {
      const top = storeys[i + 1]?.floorY ?? s.floorY + inputs.layout.defaults.wallHeightM;
      for (const b of zones.find((z) => z.id === `building:${s.id}`)!.boxes) expect([b.center[1] - b.size[1] / 2, b.center[1] + b.size[1] / 2].map((v) => +v.toFixed(4)), s.id).toEqual([s.floorY, top]);
    });
    // Every room, at chest height over its rectangles' middles and at its anchor, is in its storey's zone and no other.
    for (const r of level.rooms as { id: string; storey: string; rects: [number, number, number, number][]; anchor: Vec3 }[]) {
      const y = floorOf(r.storey) + 1.2;
      for (const [x, z] of [...r.rects.map(([x0, z0, x1, z1]) => [(x0 + x1) / 2, (z0 + z1) / 2]), [r.anchor[0], r.anchor[2]]]) expect(buildingAt([x, y, z]), r.id).toEqual([`building:${r.storey}`]);
    }
    // In an outside door or window (its wall's middle line) a body is in; a metre out of it, out.
    const outside = opened.filter((o) => o.exterior);
    expect(outside.length).toBe(report.counts.exteriorOpenings);
    for (const o of outside) {
      const y = floorOf(o.floor) + (o.y0 + o.y1) / 2;
      expect(buildingAt(outFrom(o, -o.t / 2, y)), o.id).toEqual([`building:${o.floor}`]);
      expect(buildingAt(outFrom(o, 1, y)), o.id).toEqual([]);
    }
    // On a walkable roof, on its slabs or halfway up its slopes, a body is out (map_features §10: the roofs are outside).
    type Ramp = { id: string; start: Vec3; yawDeg: number; length: number; angleDeg: number };
    for (const roof of inputs.layout.roofs.filter((r) => r.walkable)) {
      const slabs = solids.filter((b) => b.id.startsWith(`${roof.id}#`) && !b.id.includes("."));
      const ramps = (level.ramps as Ramp[]).filter((r) => r.id.startsWith(`${roof.id}.`));
      expect(slabs.length + ramps.length, roof.id).toBeGreaterThan(0);
      for (const b of slabs) expect(buildingAt([b.center[0], b.center[1] + b.size[1] / 2 + 0.9, b.center[2]]), b.id).toEqual([]);
      for (const r of ramps) {
        const [run, rise] = [(r.length / 2) * Math.cos(r.angleDeg * DEG), (r.length / 2) * Math.sin(r.angleDeg * DEG)];
        expect(buildingAt([r.start[0] - Math.sin(r.yawDeg * DEG) * run, r.start[1] + rise + 0.9, r.start[2] - Math.cos(r.yawDeg * DEG) * run]), r.id).toEqual([]);
      }
    }
    // Attackers spawn outside it, defenders inside.
    for (const s of level.spawns as { id: string; pos: Vec3; side?: string }[]) {
      const at = buildingAt([s.pos[0], s.pos[1] + 0.9, s.pos[2]]);
      if (s.side) expect(at.length, s.id).toBe(s.side === "attack" ? 0 : 1);
    }
  });

  it("each storey's building zone holds the walls round its rooms, whatever their thickness (the basement's are 1.25 m in places)", () => {
    type Room = { storey: string; rects: [number, number, number, number][] };
    const touches = (b: Box, r: Room) =>
      r.rects.some(([x0, z0, x1, z1]) => b.center[0] - b.size[0] / 2 <= Math.max(x0, x1) + 0.05 && b.center[0] + b.size[0] / 2 >= Math.min(x0, x1) - 0.05 && b.center[2] - b.size[2] / 2 <= Math.max(z0, z1) + 0.05 && b.center[2] + b.size[2] / 2 >= Math.min(z0, z1) - 0.05);
    let thick = 0;
    for (const s of storeys) {
      const walls = solids.filter(
        (b) => !b.drawOnly && !b.bodiesOnly && (b.surface === "HARD_WALL" || b.surface === "REINFORCEABLE") && storeyOfBox(inputs.layout, b as never) === s.id && (level.rooms as Room[]).some((r) => r.storey === s.id && touches(b, r)),
      );
      expect(walls.length, s.id).toBeGreaterThan(0);
      for (const b of walls) {
        if (Math.min(b.size[0], b.size[2]) > 0.6) thick++;
        // Its middle and its corners, 2 cm in, a metre over the floor.
        const [hx, hz] = [b.size[0] / 2 - 0.02, b.size[2] / 2 - 0.02];
        for (const [i, j] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]) expect(buildingAt([b.center[0] + i * hx, s.floorY + 1, b.center[2] + j * hz]), `${b.id} (${i}, ${j})`).toEqual([`building:${s.id}`]);
      }
    }
    expect(thick).toBeGreaterThan(0);
  });

  it("puts map_features §10's spawn peeks inside their doors and windows and its run-outs outside, looking out toward their spawn", () => {
    const authored = inputs.layout.zones.flatMap((z) => z.openings.map((id) => ({ ...z, opening: id })));
    const compiled = zones.filter((z) => z.kind === "spawn_peek" || z.kind === "out_of_bounds");
    expect(compiled.map((z) => z.id).sort()).toEqual(authored.map((z) => `${z.id}:${z.opening}`).sort());
    expect(new Set(authored.map((z) => z.faces))).toEqual(new Set(["A_JUNKYARD", "B_STREET", "C_CONSTRUCTION", undefined]));
    expect(new Set(authored.map((z) => z.kind))).toEqual(new Set(["spawn_peek", "out_of_bounds"]));
    const depth = inputs.layout.defaults.zone.depthM;
    for (const a of authored) {
      const z = compiled.find((c) => c.id === `${a.id}:${a.opening}`)!;
      const o = opened.find((p) => p.id === a.opening)!;
      expect(o.exterior, o.id).toBe(true);
      expect(z.boxes.length).toBe(1);
      const [b] = z.boxes;
      const normal: Vec3 = o.axis === "H" ? [0, 0, o.out] : [o.out, 0, 0];
      expect([z.kind, z.faces, z.normal], z.id).toEqual([a.kind, a.faces, normal]);
      // From the floor to the opening's top, as wide as the opening, depthM deep, against its inner face or its outer one.
      const y0 = floorOf(o.floor);
      expect([b.center[1] - b.size[1] / 2, b.center[1] + b.size[1] / 2].map((v) => +v.toFixed(4)), z.id).toEqual([y0, +(y0 + o.y1).toFixed(4)]);
      expect((o.axis === "H" ? [b.size[0], b.size[2]] : [b.size[2], b.size[0]]).map((v) => +v.toFixed(4)), z.id).toEqual([+(o.a1 - o.a0).toFixed(4), depth]);
      const middle = a.kind === "spawn_peek" ? outFrom(o, -o.t - depth / 2, y0 + 1.2) : outFrom(o, depth / 2, y0 + 1.2);
      expect(middle.map((v, i) => Math.abs(v - b.center[i]) < 1e-3 || i === 1), z.id).toEqual([true, true, true]);
      expect(buildingAt(middle), z.id).toEqual(a.kind === "spawn_peek" ? [`building:${o.floor}`] : []);
      // The spawn it faces is out in front of it.
      for (const s of (level.spawns as { pos: Vec3; group?: string }[]).filter((s) => a.faces !== undefined && s.group === a.faces)) {
        expect((s.pos[0] - b.center[0]) * normal[0] + (s.pos[2] - b.center[2]) * normal[2], `${z.id} looks toward ${a.faces}`).toBeGreaterThan(0);
      }
    }
  });

  it("has a rappel face just outside every outside wall above ground, from its floor to its top: a wall behind it, the outside in front", () => {
    const rappel = zones.filter((z) => z.kind === "rappel");
    expect(rappel.length).toBeGreaterThan(40);
    expect(new Set(rappel.map((z) => z.id.split(":")[1]))).toEqual(new Set(["1F", "2F", "3F"]));
    const walls = solids.filter((b) => !b.drawOnly && !b.bodiesOnly && (b.surface === "HARD_WALL" || b.surface === "REINFORCEABLE")) as unknown as ZoneBox[];
    for (const z of rappel) {
      const [b] = z.boxes;
      const n = z.normal!;
      const [axis, along] = n[0] !== 0 ? [0, 2] : [2, 0];
      const y0 = floorOf(z.id.split(":")[1]);
      expect(+(b.center[1] - b.size[1] / 2).toFixed(4), z.id).toBe(y0);
      expect(b.center[1] + b.size[1] / 2, z.id).toBeGreaterThanOrEqual(y0 + 3 - 1e-6);
      expect([+b.size[axis].toFixed(4), b.size[along] >= 0.5], z.id).toEqual([0.05, true]);
      // Every half metre along it, above the doors' and windows' heads: a wall right behind it, outside in front.
      const wallSide = b.center[axis] - (n[axis] * b.size[axis]) / 2;
      const [lo, len] = [b.center[along] - b.size[along] / 2, b.size[along]];
      const steps = Math.ceil((len - 0.1) / 0.5);
      for (let i = 0; i <= steps; i++) {
        const at = (m: number): Vec3 => {
          const p: Vec3 = [0, y0 + 2.5, 0];
          p[axis] = wallSide + n[axis] * m;
          p[along] = lo + 0.05 + ((len - 0.1) * i) / steps;
          return p;
        };
        expect(walls.some((w) => inBox(w, at(-0.1))), `${z.id}: a wall behind ${at(0)}`).toBe(true);
        expect(buildingAt(at(0.3)), `${z.id}: outside in front of ${at(0)}`).toEqual([]);
      }
    }
    // Every outside door and window above ground is on one, across all of it.
    for (const o of opened.filter((o) => o.exterior && floorOf(o.floor) >= 0)) expect(facesOver(o).length, o.id).toBe(1);
  });

  it("leaves out the faces of a wall rappel is refused on, and reports a zone or a refusal it can't place", () => {
    const line = inputs.walls.find((p) => p.floor === "2F")!.walls.find((w) => w.spans.some((s) => s.id === "2F.o021"))!;
    const refused = compile({ ...inputs, layout: { ...inputs.layout, rappel: { refuse: [line.id, "2F.w999"] } } });
    const big = opened.find((o) => o.id === "2F.o021")!;
    expect(facesOver(big).length).toBe(1);
    expect(facesOver(big, refused.level.zones as LevelZone[])).toEqual([]);
    expect(refused.report.errors).toEqual([`rappel.refuse: "2F.w999" isn't a wall line of the walls parts`]);
    // The other storeys' faces don't change.
    const others = (among: LevelZone[]) => among.filter((z) => z.kind === "rappel" && !z.id.startsWith("rappel:2F:"));
    expect(others(refused.level.zones as LevelZone[])).toEqual(others(zones));

    // A zone at a span built as wall (2F.o005, P36), at an inside door, or facing a defenders' group.
    const inside = opened.find((o) => !o.exterior)!.id;
    const bad = compile({ ...inputs, layout: { ...inputs.layout, zones: [{ id: "Z1", kind: "spawn_peek", openings: ["2F.o005", inside], faces: "SITE_DORMS", _unverified: [] }] } });
    expect(bad.report.errors).toEqual([
      `zone Z1: it faces "SITE_DORMS", which isn't an attackers' spawn group`,
      `zone Z1: "2F.o005" isn't a door or window of the compiled walls`,
      `zone Z1: ${inside} isn't in an outside wall`,
    ]);
  });
});

describe("oregon roofs (M4, DESIGN §5.8)", () => {
  const roofs = inputs.layout.roofs;
  type RoofDef = (typeof roofs)[number];
  const withRoofs = (change: (r: RoofDef) => RoofDef | null) => compile({ ...inputs, layout: { ...inputs.layout, roofs: roofs.map(change).filter((r): r is RoofDef => r !== null) } });
  /** A pitched roof's top surface at (x, z) metres, worked out from its record: the eave, the ramp's thickness, the slope. */
  const topAt = (id: string, x: number, z: number) => {
    const r = roofs.find((q) => q.id === id)!;
    if (r.shape === "flat") return r.eaveY;
    const [x0, z0, x1, z1] = r.rects[0].map((u) => u * k);
    const a = (r.pitchDeg! * Math.PI) / 180;
    const across = r.shape === "gable" ? (r.ridge === "NS" ? Math.min(x - x0, x1 - x) : Math.min(z - z0, z1 - z)) : { W: x - x0, E: x1 - x, N: z - z0, S: z1 - z }[r.low!];
    return r.eaveY + 0.2 / Math.cos(a) + Math.tan(a) * across;
  };

  it("every roof covers part of the building and every room has a floor, a hatch or a roof over it", () => {
    expect(report.warnings.filter((w) => roofs.some((r) => w.startsWith(`${r.id}:`)))).toEqual([]);
    expect(report.errors).toEqual([]);
    // Without the Dining roof the rooms under it are open to the sky, and the check says which.
    const open = withRoofs((r) => (r.id === "RF_DINING" ? null : r))
      .report.errors.filter((e) => e.includes("nothing over it"))
      .map((e) => e.slice(0, e.indexOf(":")));
    expect(open.sort()).toEqual(["1F_DINING", "1F_DINING_HALLWAY", "1F_SHOWERS", "1F_SHOWER_CORRIDOR", "1F_SMALL_TOWER"]);
  });

  it("an eave off its walls, or a slope rising over a window's sill, is reported", () => {
    // The Small Tower roof 10 u south: its south eave hangs over the Dining roof, 3 m below it.
    const off = withRoofs((r) => (r.id === "RF_SMALL_TOWER" ? { ...r, rects: [[3.67, 185.67, 98.67, 240.33]] } : r));
    expect(off.report.errors.join("\n")).toMatch(/RF_SMALL_TOWER: its S eave rests on nothing at 6.2 m/);
    // The Meeting roof at 25 degrees: its ridge comes up over the sill of the 2F Tower's south window.
    const steep = withRoofs((r) => (r.id === "RF_MEETING_W" ? { ...r, pitchDeg: 25 } : r));
    expect(steep.report.errors.join("\n")).toMatch(/RF_MEETING_W rises to [\d.]+ m outside 2F\.o012\.glass/);
  });

  it("a pitched roof's open end is closed by steps, up to the slope: a level shot along the ridge stops at the end", async () => {
    const sim = await Sim.create("oregon");
    // The Dorms roof's west end, from the Dining roof: shots at heights from the eave to just under the ridge, across
    // the gable, each stopped within the end's wall thickness (0.3 m) of its face.
    const r = roofs.find((q) => q.id === "RF_DORMS")!;
    const [x0, z0, , z1] = r.rects[0].map((u) => u * k);
    for (const y of [6.3, 6.8, 7.3, 7.8]) {
      for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        const z = z0 + f * (z1 - z0);
        if (topAt("RF_DORMS", x0 + 0.01, z) - 0.25 < y) continue; // above the slope there
        const hit = sim.world.castRay(new sim.R.Ray({ x: x0 - 3, y, z }, { x: 1, y: 0, z: 0 }), 10, true, undefined, QUERY_STATIC);
        expect(hit?.timeOfImpact, `y ${y} z ${z.toFixed(2)}`).toBeGreaterThan(3 - 0.16);
        expect(hit!.timeOfImpact, `y ${y} z ${z.toFixed(2)}`).toBeLessThan(3 + 0.31);
      }
    }
  });

  it("a roof with a ceiling is closed where it meets one without: from the Kitchen Corridor, a shot into the Tower's west roof space stops at its end", async () => {
    const sim = await Sim.create("oregon");
    // Under the Meeting roof west of the Attic (no ceiling, open to the corridor), level shots north at the
    // Tower West roof's south end (z 14.95 m), at heights between its ceiling and its slope.
    for (const [x, y] of [[30.5, 3.3], [31, 3.32], [31.5, 3.45]]) {
      const hit = sim.world.castRay(new sim.R.Ray({ x, y, z: 15.5 }, { x: 0, y: 0, z: -1 }), 10, true, undefined, QUERY_STATIC);
      expect(hit?.timeOfImpact, `x ${x} y ${y}`).toBeCloseTo(15.5 - 14.95, 2);
    }
  });

  it("from the 2F Small Tower, a body goes through the Office and vaults out of its north window onto the Dining roof (M4's done-when)", async () => {
    const sim = await Sim.create("oregon");
    // The Small Tower's own south opening is built as wall (D-087); its door east (2F.o020, an empty frame) leads
    // into the Office.
    const g = buildWalkGraph(sim);
    expect(g.comp[nodeNear(g, 8.5, 3.2, 27.85)]).toBe(g.comp[nodeNear(g, 13.15, 3.2, 27.3)]);
    // The Office's north window (2F.o000, its wall at z 26.5 m), barricade and glass broken: run at it and vault.
    for (const id of ["2F.o000.bar", "2F.o000.glass"]) sim.level.panels.apply(sim.level.panels.byId.get(id)!.panel.spec.index, { kind: "damage", amount: 1e9, hard: false });
    const ctrl = sim.addPlayer("vaulter", "sledge");
    const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
    sim.teleport(pawn.id, 13.15, 3.2, 27.3, 0, Stance.Stand);
    let seq = 0;
    for (let t = 0; t < 64 * 2; t++) sim.step(new Map([[ctrl.id, { seq: ++seq, forward: 1, strafe: 0, yaw: 0, pitch: 0, buttons: Btn.Vault, stance: Stance.Stand, lean: 0 }]]));
    for (let t = 0; t < 32; t++) sim.step(new Map([[ctrl.id, { seq: ++seq, forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0 }]]));
    const s = pawn.state;
    expect([s.z < 26.2, s.grounded, Math.abs(s.y - 3.2) < 0.05], `at ${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)}`).toEqual([true, true, true]);
  });

  it("a body stands on the flat roofs and on the slopes, where it is put, without sliding", async () => {
    const sim = await Sim.create("oregon");
    const ctrl = sim.addPlayer("roofer", "sledge");
    const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
    const problems: string[] = [];
    for (const [id, xu, zu] of [
      ["RF_DINING", 110, 200],
      ["EXT_BALCONY", 250, 278],
      ["RF_KIDS", 190, 180],
      ["RF_MEETING_W", 210, 130],
      ["RF_DORMS", 200, 245],
      ["RF_TOWER", 250, 74],
      ["RF_SMALL_TOWER", 40, 190],
    ] as const) {
      const [x, z] = [xu * k, zu * k];
      const top = topAt(id, x, z);
      sim.teleport(pawn.id, x, top + 0.3, z, 0);
      for (let t = 0; t < 64; t++) sim.step(new Map());
      const s = pawn.state;
      const off = Math.hypot(s.x - x, s.z - z);
      if (!s.grounded || Math.abs(s.y - top) > 0.06 || off > 0.05) problems.push(`${id}: at y ${s.y.toFixed(2)} (roof ${top.toFixed(2)}), ${off.toFixed(2)} m off, grounded ${s.grounded}`);
    }
    expect(problems).toEqual([]);
  });
});

describe("oregon determinism (DESIGN §9.2 check 12)", () => {
  it("two Sims given the same panel-op log and the same inputs end with the same panels, and a body walks through the same hole", async () => {
    const make = async () => {
      const sim = await Sim.create("oregon");
      const ctrl = sim.addPlayer("tester", "sledge");
      // South of the Kitchen's 4 m soft wall to the Security room, facing it (netsim's wall fight).
      sim.teleport(ctrl.possessedPawnId, 22.55, 0, 28.65, 180);
      return { sim, ctrl };
    };
    const [A, B] = [await make(), await make()];
    const panels = A.sim.level.panels.list;
    const wall = panels.findIndex((e) => e.panel.spec.id === "SW-1F-06");
    expect(wall).toBeGreaterThanOrEqual(0);
    let seed = 11;
    const rnd = (n: number) => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 8) % n;
    /** A seeded op on any panel but the wall the body walks to: holes of every size in any layer, lines, boxes, steel, damage, barricades. */
    const randomOp = (): [number, PanelOp] => {
      let index = rnd(panels.length);
      if (index === wall) index = (index + 1) % panels.length;
      const p = panels[index].panel;
      const layer = rnd(4);
      const hard = rnd(3) === 0;
      const r = rnd(10);
      if (r < 5) return [index, { kind: "cut", layer, shape: { kind: "disc", u4: rnd(4 * p.w), v4: rnd(4 * p.h), r4: 1 + rnd(16) }, hard }];
      if (r < 7) {
        const [u0, v0] = [rnd(p.w), rnd(p.h)];
        return [index, { kind: "cut", layer, shape: { kind: "rect", u0, v0, u1: u0 + 1 + rnd(p.w), v1: rnd(2) ? v0 + 1 : p.h }, hard }];
      }
      if (r < 8) return [index, { kind: "reinforce", section: rnd(3), side: rnd(2) }];
      if (r < 9) return [index, { kind: "damage", amount: [0.15, 2, 40][rnd(3)], hard }];
      return [index, { kind: "barricade", up: rnd(2) === 0 }];
    };
    let seq = 0;
    for (let t = 0; t < 160; t++) {
      for (let k = 0; k < 8; k++) {
        const [index, op] = randomOp();
        const [a, b] = [A.sim.level.panels.apply(index, op), B.sim.level.panels.apply(index, op)];
        expect(b, `tick ${t}: ${JSON.stringify(op)} on ${panels[index].panel.spec.id}`).toEqual(a);
      }
      // A breach in the wall ahead, every layer, a little after the start.
      if (t === 30) {
        const p = panels[wall].panel;
        const mid = Math.floor(p.w / 2);
        for (const sim of [A.sim, B.sim]) for (const layer of [0, 1, 2]) sim.level.panels.apply(wall, { kind: "cut", layer, shape: { kind: "rect", u0: mid - 10, v0: 0, u1: mid + 10, v1: 40 }, hard: false });
      }
      const input: InputCmd = { seq: ++seq, forward: t > 40 ? 1 : 0, strafe: 0, yaw: 180 * DEG, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0 };
      A.sim.step(new Map([[A.ctrl.id, input]]));
      B.sim.step(new Map([[B.ctrl.id, input]]));
      expect(B.sim.pawns.get(B.ctrl.possessedPawnId)!.state, `tick ${t}`).toEqual(A.sim.pawns.get(A.ctrl.possessedPawnId)!.state);
    }
    expect(B.sim.level.panels.hash()).toBe(A.sim.level.panels.hash());
    expect(panels.filter((e) => e.panel.modified).length).toBeGreaterThan(100);
    // Through the hole, into the Security room beyond the wall (z 31.15).
    expect(A.sim.pawns.get(A.ctrl.possessedPawnId)!.state.z).toBeGreaterThan(32);
  }, 60000);
});
