// The generator's own rules (tools/mapgen, DESIGN §9.2), on small layouts and levels built here: the level checks
// (hard geometry into a panel, faces of two colours in one plane, the stairs' steps), the plan grid, the junction rule
// where walls meet (posts, frames and panels leave no slot and every room closed), the walk graph (gaps, props, ramps,
// mantles), and the report (the UNVERIFIED list by file and record, a frame's alternative). Each map's own checks run
// on its compiled level (millrace.test.ts). The walls compile in Millrace's layout: its storeys, wall weights and grid.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { levelSchema, loadGameData, Sim, type Vec3 } from "../../game/shared/src/index.js";
import { checkLevel, coplanarFaces } from "./checks.js";
import { compile, loadInputs } from "./compile.js";
import { enclosureLeaks, planGrid } from "./enclosure.js";
import { frames } from "./frames.js";
import { PlanGrid } from "./grid.js";
import { mapReport, reportMarkdown, unverifiedList } from "./report.js";
import { CELL_M } from "./rooms.js";
import { wallSchema, type WallDef } from "./schema.js";
import { flightBoxes } from "./stairs.js";
import { compileWalls } from "./walls.js";
import { buildWalkGraph, nodeNear } from "./walkgraph.js";

const ROOT = join(import.meta.dirname, "..", "..");
const inputs = loadInputs(ROOT, "millrace");
const k = inputs.layout.units.mPerU;
const fr = frames(inputs.layout);

describe("the level checks", () => {
  it("catch a hard box in a panel, two faces of different surfaces in one plane, and a step flush with another surface", () => {
    // A hard box pushed 10 cm into a soft wall's end is caught.
    const soft = { id: "SW-T", center: [0, 1.5, 0], size: [4, 3, 0.2], surface: "REINFORCEABLE" };
    const intruder = { id: "intruder", center: [soft.center[0] + soft.size[0] / 2, soft.center[1], soft.center[2]], size: [0.2, 1, 0.3], surface: "HARD_WALL" };
    expect(checkLevel([soft, intruder] as never).errors.join()).toMatch(/SW-T \(REINFORCEABLE\) and intruder \(HARD_WALL\) overlap by 0\.100 m/);
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

describe("the walk graph on small levels", () => {
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

  it("a vaultable top a body mantles onto (0.9 m) joins the floor beside it; a plain one, or one too tall to mantle (1.6 m), doesn't", async () => {
    for (const [h, vaultable, joined] of [
      [0.9, true, true],
      [0.9, false, false],
      [1.6, true, false],
    ] as const) {
      // A deck at x 2..6, its west face a ledge.
      const g = await flat(`mantle_${h}_${vaultable}`, [{ id: "deck", center: [4, h / 2, 0], size: [4, h, 4], surface: "HARD_FLOOR", vaultable }]);
      const [floor, deck] = [nodeNear(g, -3, 0, 0), nodeNear(g, 4, h, 0)];
      expect(Math.min(floor, deck), `${h} m, ${vaultable}`).toBeGreaterThanOrEqual(0);
      expect(g.comp[floor] === g.comp[deck], `${h} m, ${vaultable}`).toBe(joined);
    }
  });

});

describe("the report", () => {
  it("lists every UNVERIFIED value by file and record: each file's own list, a record by its collection and id, never an empty one", () => {
    const root = mkdtempSync(join(tmpdir(), "mapgen-report-"));
    try {
      const dir = join(root, "data", "maps", "t");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "layout.json"),
        JSON.stringify({
          _unverified: ["units.mPerU"],
          zones: [
            { id: "PEEK_X", _unverified: ["openings", "faces"] },
            { id: "PEEK_Y", _unverified: [] },
          ],
          // A site and its first defender spawn share an id; their records don't.
          sites: [{ id: "SITE_X", _unverified: ["rooms"] }],
          spawns: [{ id: "SITE_X", _unverified: ["at"] }],
          defaults: { door: { _unverified: ["headM"] } },
        }),
      );
      writeFileSync(join(dir, "walls_1F.json"), JSON.stringify({ walls: [{ id: "1F.w001", spans: [{ id: "SW-1F-01", _unverified: ["sections"] }] }] }));
      const list = unverifiedList(root, { ...inputs, layout: { ...inputs.layout, parts: ["walls_1F.json"] } }, "t");
      expect(list).toEqual([
        { file: "layout.json", record: "(file)", fields: ["units.mPerU"] },
        { file: "layout.json", record: "zones PEEK_X", fields: ["openings", "faces"] },
        { file: "layout.json", record: "sites SITE_X", fields: ["rooms"] },
        { file: "layout.json", record: "spawns SITE_X", fields: ["at"] },
        { file: "layout.json", record: "defaults.door", fields: ["headM"] },
        { file: "walls_1F.json", record: "spans SW-1F-01", fields: ["sections"] },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("names where each hatch lands under both options of a frame with an alternative, and which one is in use", () => {
    // Millrace's frames have none: give the basement's one (the same affine), and the three hatches down into it are compared.
    const layout = { ...inputs.layout, frames: { ...inputs.layout.frames, B: { ...inputs.layout.frames.B, alt: { ax: 1, bx: 0, ay: 1, by: 0 } } } };
    const alt = compile({ ...inputs, layout });
    const landings = alt.report.frames.B;
    expect(Object.keys(alt.report.frames)).toEqual(["B"]);
    expect([landings.main.map((l) => l.hatch).sort(), landings.alt.map((l) => l.hatch).sort()]).toEqual([
      ["H3", "H4", "H6"],
      ["H3", "H4", "H6"],
    ]);
    const md = reportMarkdown(alt, mapReport(ROOT, { ...inputs, layout }, alt), { B: "alt" });
    for (const heading of ["## Counts", "## Budgets", "## Frames with an alternative", "## UNVERIFIED"]) expect(md).toContain(heading);
    expect(md).toMatch(/\*\*B alt\*\* \(in use\)/);
    expect(md).toMatch(/\*\*B main\*\*: H\d/);
  });
});
