// Millrace through the generator (Project Redmond R2; tools/mapgen, DESIGN §9.2): the checks any map must pass. The
// committed level.json is exactly what its layout compiles to and loads with the game data; hard geometry never covers
// a panel, panels never overlap, and the budgets hold, as the report lists them; the compiled walls close every room
// where the plan does, and the shell between the interior and exterior wall tops; spawns stand on the ground (attackers
// outside, facing the building); a room's rectangles hold every spot of it a body fits, its anchor stands clear and holds
// a body; soft floors are slab-thick tiles a bullet goes up through, meeting the walls under them; each hatch lies in its
// top room's floor over its bottom room, holds a body until it breaks and drops it into that room; every staircase walks
// up and down, its open sides too; the walk graph joins every room to the attackers' spawns only by the ways in left
// open; the outside's items, the props, sites, cameras and ingredients stand where they may, and the generator reports
// one that doesn't; the zones (the building's, spawn peeks, rappel faces) are where they belong; the roofs cover the
// building and hold a body; and two sims given the same ops end the same.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bulletThroughPanels, crossFileProblems, DEG, levelSchema, loadGameData, missingUnverifiedPaths, pelletPath, QUERY_BULLET, QUERY_STATIC, Sim, Stance, type InputCmd, type LevelDef, type PanelOp, type Vec3 } from "../../game/shared/src/index.js";
import { BUDGET, checkLevel } from "./checks.js";
import { compile, loadInputs } from "./compile.js";
import { enclosureLeaks, planGrid } from "./enclosure.js";
import { readableJson } from "./format.js";
import { frames } from "./frames.js";
import { distanceInside } from "./grid.js";
import { CELL_M, clearCells, compileRooms, floorShift, storeyOfBox } from "./rooms.js";
import { compileStairs, flightBoxes, type CompiledRun } from "./stairs.js";
import { compileWalls } from "./walls.js";
import { mapReport, reportMarkdown } from "./report.js";
import { buildWalkGraph, nodeNear, nodesIn, type WalkGraph } from "./walkgraph.js";

const ROOT = join(import.meta.dirname, "..", "..");
const MAP_ID = "millrace";
const MAP = join(ROOT, "data", "maps", MAP_ID);
const inputs = loadInputs(ROOT, MAP_ID);
const compiled = compile(inputs);
const { level, report } = compiled;
type Box = { id: string; center: number[]; size: number[]; surface: string; bodiesOnly?: boolean; drawOnly?: boolean; vaultable?: boolean; panel?: { sections?: number; empty?: boolean; construction?: string; region?: string } };
const solids = level.solids as Box[];
const k = inputs.layout.units.mPerU;
const fr = frames(inputs.layout);
const shiftOf = (room: string) => floorShift(inputs.layout, room);
/** The storeys with wall files (the basement, 1F, 2F). */
const FLOORS = inputs.walls.map((w) => w.floor);
/** The ground the buildings and the race stand on, with a margin (world metres: x0, z0, x1, z1). */
const AREA: [number, number, number, number] = [-7, -8, 63, 41];
type Room = { id: string; callout: string; storey: string; rects: [number, number, number, number][]; anchor: [number, number, number] };
const rooms = level.rooms as Room[];
const storey = (id: string) => inputs.layout.storeys.find((s) => s.id === id)!;
const inRoom = (r: Room, x: number, z: number) => r.rects.some(([x0, z0, x1, z1]) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && z >= z0 - 1e-6 && z <= z1 + 1e-6);
let seq = 0;
const cmd = (c: Partial<InputCmd> & { yawDeg?: number }): InputCmd => {
  const { yawDeg, ...rest } = c;
  return { seq: ++seq, forward: 0, strafe: 0, yaw: (yawDeg ?? 0) * DEG, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...rest };
};
/** A Sim of the compiled level with one body in it. */
const walker = async () => {
  const sim = await Sim.create(MAP_ID);
  const ctrl = sim.addPlayer("walker", "sledge");
  return { sim, ctrl, pawn: sim.pawns.get(ctrl.possessedPawnId)! };
};
const steps = (sim: Sim, n: number) => {
  for (let t = 0; t < n; t++) sim.step(new Map());
};

describe("millrace level.json", () => {
  it("is exactly what the layout compiles to, and compiling is deterministic", () => {
    const text = readableJson(level);
    expect(readableJson(compile(loadInputs(ROOT, MAP_ID)).level)).toBe(text);
    expect(readFileSync(join(MAP, "level.json"), "utf8"), "level.json is stale: run npm run mapgen -- --map millrace").toBe(text);
  });

  it("loads with the game data, and every placeholder path in layout.json exists", () => {
    const data = loadGameData();
    expect(data.levels.get(MAP_ID)).toBeDefined();
    expect(crossFileProblems(data)).toEqual([]);
    const raw = JSON.parse(readFileSync(join(MAP, "layout.json"), "utf8")) as Record<string, unknown> & { _unverified: string[] };
    expect(missingUnverifiedPaths(raw, raw._unverified)).toEqual([]);
  });

  it("no hard box overlaps a panel, no panels overlap, and the budgets hold", () => {
    expect(report.errors).toEqual([]);
    expect(checkLevel(solids as never).errors).toEqual([]);
    expect(checkLevel(level.solids as never, (level.stairs as Parameters<typeof flightBoxes>[0][]).flatMap(flightBoxes)).errors).toEqual([]);
    // What the client downloads first (DESIGN §8).
    expect(Buffer.byteLength(readableJson(level))).toBeLessThanOrEqual(BUDGET.levelBytes);
  });

  it("the report lists the budgets, each within its limit, and no UNVERIFIED value (Millrace is ours: nothing to confirm against a source)", () => {
    const r = mapReport(ROOT, inputs, compiled);
    expect(r.budgets.map((b) => b.name)).toEqual(["solids", "panels", "panel cells per layer", "cells per layer of the largest panel", "level.json bytes"]);
    for (const b of r.budgets) expect(b.value, b.name).toBeLessThanOrEqual(b.limit);
    expect(r.unverified).toEqual([]);
    const md = reportMarkdown(compiled, r, {}, inputs.layout.name);
    for (const heading of ["# Millrace: the generator's report", "## Counts", "## Budgets", "## Frames with an alternative", "## Warnings (0)", "## UNVERIFIED (0 values in 0 records)"]) expect(md).toContain(heading);
  });

  /** A storey's wall lines, its plan in world u, its storey record and the one above. */
  const storeyOf = (floor: string) => {
    const part = inputs.walls.find((p) => p.floor === floor)!;
    const i = inputs.layout.storeys.findIndex((s) => s.id === floor);
    // Rails don't divide rooms: bodies are kept out of a well, sight and bullets aren't.
    const plan = planGrid(
      part.walls.filter((w) => w.kind !== "rail"),
      k,
      (x, y) => fr.toWorld(part.frame, x, y),
    );
    return { lines: part.walls, plan, storey: inputs.layout.storeys[i], next: inputs.layout.storeys[i + 1] };
  };
  /** The passages a storey declares open: OPEN spans (closed by their header's footprint) and drone holes. */
  const declared = (floor: string) => {
    const { lines } = storeyOf(floor);
    const open = new Set(lines.filter((w) => w.kind !== "rail").flatMap((w) => w.spans.filter((x) => x.kind === "OPEN").map((x) => x.id)));
    const heads = solids.filter((b) => b.id.endsWith(".head") && open.has(b.id.slice(0, -5)));
    const holes = new Set(lines.flatMap((w) => w.spans.filter((x) => x.kind === "DRONE_HOLE").map((x) => x.id)));
    const slots = (level.zones as { id: string; boxes: { center: number[]; size: number[] }[] }[])
      .filter((z) => holes.has(z.id))
      .flatMap((z) => z.boxes.map((b) => ({ id: z.id, ...b, surface: "HARD_WALL" })));
    return { heads, open, slots, holes };
  };

  it.each(FLOORS)("the compiled walls keep every room of %s's plan closed at 1.2 m and at 0.1 m: no gap to the outside or between rooms", (floor) => {
    const { plan, storey: st } = storeyOf(floor);
    const { heads, open, slots, holes } = declared(floor);
    expect(heads.length).toBe(open.size);
    expect(slots.length).toBe(holes.size);
    const checks: [number, Box[]][] = [
      [1.2, heads],
      [0.1, [...heads, ...slots]],
    ];
    for (const [above, passages] of checks) {
      const found = enclosureLeaks(solids, passages, plan, AREA, 0.025, k, st.floorY + above);
      expect(found, `${floor} at ${above} m`).toEqual({ toOutside: [], between: [], rooms: expect.any(Number) as number });
    }
  });

  it.each(FLOORS)("%s: the building's shell is closed between the interior and exterior wall tops", (floor) => {
    const { plan, storey: st, next } = storeyOf(floor);
    const top = (b: Box) => +(b.center[1] + b.size[1] / 2 - st.floorY).toFixed(2);
    // The walls' pieces: not the steps a roof stands on them (roofs.ts), which start at their tops, nor the
    // outside's boxes (exterior.ts) on the ground.
    const others = new Set([...inputs.layout.roofs.map((r) => r.id), ...inputs.exterior.items.map((i) => i.id), ...inputs.exterior.props.map((i) => i.id)]);
    const pieces = solids.filter((b) => /#\d/.test(b.id) && !others.has(b.id) && !others.has(b.id.split(/[.#]/)[0]) && !b.bodiesOnly && !b.drawOnly && Math.abs(b.center[1] - b.size[1] / 2 - st.floorY) < 0.01);
    const [topIn, topOut] = next ? [next.floorY - next.slabM - st.floorY, st.underground ? next.floorY - next.slabM - st.floorY : next.floorY - st.floorY] : [inputs.layout.defaults.wallHeightM, inputs.layout.defaults.wallHeightM];
    expect(pieces.length, floor).toBeGreaterThan(0);
    for (const t of new Set(pieces.map(top))) expect([+topIn.toFixed(2), +topOut.toFixed(2)], `${floor}: a wall piece ${t} m tall`).toContain(t);
    if (topOut - topIn < 0.05) return; // no band: every wall reaches the same height
    expect(enclosureLeaks(solids, [], plan, AREA, 0.025, k, st.floorY + (topIn + topOut) / 2).toOutside, floor).toEqual([]);
  });

  it("spawns stand on the ground: spawn 0 for the labs, five attackers in a row from each insertion point (within 8 m of it), outside the building, facing it", async () => {
    // Sim.create refuses a spawn whose body would overlap anything, outside items included.
    const sim = await Sim.create(MAP_ID);
    const lvl = sim.level.def;
    expect(lvl.spawns[0].side).toBeUndefined();
    const attack = lvl.spawns.filter((s) => s.side === "attack");
    const groups = [...new Set(attack.map((s) => s.group))];
    expect(groups).toEqual(["A_RIVERBANK", "B_RAIL_SIDING", "C_YARD_GATE"]);
    // The building: every storey's rooms; its middle, the rooms' anchors' mean.
    const anchors = lvl.rooms.map((r) => r.anchor);
    const middle = [anchors.reduce((a, p) => a + p[0], 0) / anchors.length, anchors.reduce((a, p) => a + p[2], 0) / anchors.length];
    const fromRooms = (x: number, z: number) => Math.min(...lvl.rooms.flatMap((r) => r.rects.map(([x0, z0, x1, z1]) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)))));
    for (const g of groups) {
      const mine = attack.filter((s) => s.group === g);
      expect(mine, g).toHaveLength(5);
      expect(mine[0].id, g).toBe(g);
      for (const s of mine) expect(Math.hypot(s.pos[0] - mine[0].pos[0], s.pos[2] - mine[0].pos[2]), s.id).toBeLessThanOrEqual(8 + 1e-6);
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
});

describe("millrace rooms and floors", () => {
  const data = loadGameData();

  it("every room has a callout, rectangles and an anchor inside them on its storey's floor", () => {
    for (const r of rooms) {
      expect(r.callout, r.id).not.toBe("");
      expect(r.rects.length, r.id).toBeGreaterThan(0);
      expect(r.anchor[1], r.id).toBeCloseTo(storey(r.storey).floorY + shiftOf(r.id), 6);
      expect(inRoom(r, r.anchor[0], r.anchor[2]), r.id).toBe(true);
    }
  });

  it("every spot of a room where a body fits is in its rectangles (the HUD's lookup)", () => {
    const out = compileRooms(inputs.layout, fr, compileWalls(inputs.layout, fr, inputs.walls, inputs.exterior.playable).solids);
    const open = clearCells(0.3);
    const problems: string[] = [];
    for (const plan of out.plans.values()) {
      const g = plan.grid;
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
    const crowded = new Set(report.warnings.map((w) => /^(\S+): no spot 0\.45 m clear/.exec(w)?.[1]).filter(Boolean));
    const radius = data.movement.stance.collisionRadius;
    const problems: string[] = [];
    for (const r of rooms) {
      for (const b of solids) {
        if (b.drawOnly || ["HARD_FLOOR", "SOFT_FLOOR", "HATCH"].includes(b.surface) || storeyOfBox(inputs.layout, b as never) !== r.storey) continue;
        const dx = Math.max(b.center[0] - b.size[0] / 2 - r.anchor[0], 0, r.anchor[0] - b.center[0] - b.size[0] / 2);
        const dz = Math.max(b.center[2] - b.size[2] / 2 - r.anchor[2], 0, r.anchor[2] - b.center[2] - b.size[2] / 2);
        if (Math.hypot(dx, dz) < (crowded.has(r.id) ? radius : 0.45) - 1e-6) problems.push(`${r.id}'s anchor is ${Math.hypot(dx, dz).toFixed(3)} m from ${b.id}`);
      }
    }
    expect([...crowded]).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("a hatch whose top room doesn't compile is reported, not a crash", () => {
    const layout = structuredClone(inputs.layout);
    // 2F_CARDING_STORE holds H1 in its floor.
    layout.rooms.find((r) => r.id === "2F_CARDING_STORE")!.seed = [-500, -500];
    const out = compile({ ...inputs, layout });
    expect(out.report.errors.join("\n")).toMatch(/2F_CARDING_STORE's seed \(-500, -500 world u\) is outside the 2F building/);
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

  it("builds every soft floor as slab-thick tiles of one region, each at most tileMaxM", () => {
    const tiles = solids.filter((s) => s.surface === "SOFT_FLOOR");
    expect(inputs.layout.softFloors.filter((f) => !f.hard).length).toBeGreaterThan(0);
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
        const room = rooms.find((r) => r.storey === f.floor && inRoom(r, t.center[0], t.center[2]));
        expect([+(t.center[1] + t.size[1] / 2).toFixed(4), +t.size[1].toFixed(4)], t.id).toEqual([+(s.floorY + (room ? shiftOf(room.id) : 0)).toFixed(4), s.slabM]);
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
        const hard = new Set<number>();
        for (const c of cells) {
          const [i, j] = [Math.floor(c / 100000), c % 100000];
          const edge = [key(i - 1, j), key(i + 1, j), key(i, j - 1), key(i, j + 1)].some((q) => !cells.has(q));
          const nearSoft = [-3, -2, -1, 1, 2, 3].some((d) => soft.has(key(i + d, j)) || soft.has(key(i, j + d)));
          if (hardCells.has(c) && edge && nearSoft) hard.add(c);
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

  it("puts each hatch in its top room's floor, over its bottom room, at least 1.2 m clear", () => {
    expect(inputs.layout.hatches.length).toBeGreaterThan(0);
    for (const authored of inputs.layout.hatches) {
      const h = solids.find((s) => s.id === authored.id)!;
      expect(h.surface, authored.id).toBe("HATCH");
      const [top, bottom] = [rooms.find((r) => r.id === authored.top)!, rooms.find((r) => r.id === authored.bottom)!];
      expect([top?.id, bottom?.id], authored.id).toEqual([authored.top, authored.bottom]);
      expect(+(h.center[1] + h.size[1] / 2).toFixed(4), authored.id).toBe(+(storey(top.storey).floorY + shiftOf(top.id)).toFixed(4));
      expect(Math.min(h.size[0], h.size[2]), authored.id).toBeGreaterThanOrEqual(1.2);
      // Inside the top room, and the opening over the bottom room's floor (5 cm in from each side).
      const m = 0.05;
      for (let x = h.center[0] - h.size[0] / 2 + m; x <= h.center[0] + h.size[0] / 2 - m + 1e-9; x += 0.1) {
        for (let z = h.center[2] - h.size[2] / 2 + m; z <= h.center[2] + h.size[2] / 2 - m + 1e-9; z += 0.1) {
          expect(inRoom(top, x, z), `${authored.id} at (${x.toFixed(2)}, ${z.toFixed(2)}) in ${top.id}`).toBe(true);
          expect(inRoom(bottom, x, z), `${authored.id} at (${x.toFixed(2)}, ${z.toFixed(2)}) over ${bottom.id}`).toBe(true);
        }
      }
    }
  });

  it("a body on a hatch stands until it breaks, then drops into the room under it (onto its floor, or what stands on it)", async () => {
    const { sim, pawn } = await walker();
    const problems: string[] = [];
    for (const authored of inputs.layout.hatches) {
      const h = solids.find((s) => s.id === authored.id)!;
      const bottom = rooms.find((r) => r.id === authored.bottom)!;
      sim.teleport(pawn.id, h.center[0], h.center[1] + h.size[1] / 2, h.center[2], 0);
      steps(sim, 16);
      const stood = pawn.state.grounded && Math.abs(pawn.state.y - (h.center[1] + h.size[1] / 2)) < 0.05;
      const e = sim.level.panels.byId.get(authored.id)!;
      const broke = sim.level.panels.apply(e.panel.spec.index, { kind: "damage", amount: 1000, hard: false }).broke;
      steps(sim, 128);
      // H1 drops onto Mending's table.
      const floorY = storey(bottom.storey).floorY;
      const landed = pawn.state.grounded && pawn.state.y > floorY - 0.05 && pawn.state.y < floorY + 1.2 && inRoom(bottom, pawn.state.x, pawn.state.z);
      if (!stood || !broke || !landed) problems.push(`${authored.id}: stood ${stood}, broke ${broke}, landed in ${authored.bottom} ${landed} (at ${pawn.state.x.toFixed(2)}, ${pawn.state.y.toFixed(2)}, ${pawn.state.z.toFixed(2)})`);
    }
    expect(problems).toEqual([]);
  });
});

describe("millrace stairs", () => {
  const stairs = compileStairs(inputs.layout, fr);
  const roomAt = (st: string, x: number, z: number) => rooms.find((r) => r.storey === st && inRoom(r, x, z))?.id ?? "outside";
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
    let i = 1;
    for (let t = 0; t < 64 * 30 && i < pts.length; t++) {
      const [tx, tz] = pts[i];
      const [dx, dz] = [tx - pawn.state.x, tz - pawn.state.z];
      if (Math.hypot(dx, dz) < 0.2) {
        i++;
        continue;
      }
      sim.step(new Map([[ctrl.id, cmd({ forward: 1, yawDeg: Math.atan2(-dx, -dz) / DEG })]]));
    }
    for (let t = 0; t < 32; t++) sim.step(new Map([[ctrl.id, cmd({})]]));
    return { reached: i >= pts.length, x: pawn.state.x, y: pawn.state.y, z: pawn.state.z };
  };

  it("builds every staircase as runs between storeys and the outside, each step a step a body can take; no ladder", () => {
    expect(stairs.errors).toEqual([]);
    expect(stairs.runs.map((r) => r.id).sort()).toEqual(["ST_FIRING:B>1F", "ST_GALLERY:1F>2F", "ST_MAIN:1F>2F", "ST_MAIN:B>1F", "ST_OFFICE:1F>2F", "ST_RACE:B>EXT"]);
    expect((level as { stairs: { id: string }[] }).stairs.filter((f) => stairs.flights.some((g) => g.id === f.id))).toHaveLength(stairs.flights.length);
    expect((level as { ladders: unknown[] }).ladders).toEqual([]);
    for (const f of stairs.flights) expect(f.rise, f.id).toBeLessThanOrEqual(loadGameData().movement.step.maxStepHeight);
  });

  it("a body walking straight up any flight 5 cm in from an open side gets to its top: the slab never meets its head", async () => {
    const { sim, ctrl, pawn } = await walker();
    const problems: string[] = [];
    let open = 0;
    for (const f of stairs.flights) {
      const [fx, fz] = [-Math.sin(f.yawDeg * DEG), -Math.cos(f.yawDeg * DEG)];
      const len = f.run * f.steps;
      const at = (a: number, c: number): [number, number] => [f.start[0] + fx * a - fz * c, f.start[2] + fz * a + fx * c];
      for (const side of [-1, 1]) {
        // An open side only: a wall alongside (10 cm out, its length, its height) keeps bodies 0.3 m off it anyway.
        const [p, q] = [at(0.1, (side * f.width) / 2), at(len - 0.1, side * (f.width / 2 + 0.1))];
        const strip = [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
        const [y0, y1] = [f.start[1] + 0.3, f.start[1] + f.rise * f.steps - 0.3];
        const alongside = (b: Box) =>
          !b.drawOnly &&
          !["HARD_FLOOR", "SOFT_FLOOR", "HATCH"].includes(b.surface) &&
          b.center[0] + b.size[0] / 2 > strip[0] + 0.01 &&
          b.center[0] - b.size[0] / 2 < strip[2] - 0.01 &&
          b.center[2] + b.size[2] / 2 > strip[1] + 0.01 &&
          b.center[2] - b.size[2] / 2 < strip[3] - 0.01 &&
          b.center[1] + b.size[1] / 2 > y0 &&
          b.center[1] - b.size[1] / 2 < y1;
        if (solids.some((b) => !b.bodiesOnly && alongside(b))) continue;
        open++;
        // On the first tread, 5 cm in from that side, facing up the flight; beside a guard (bodies only), just clear of
        // it: no body stands inside one.
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
    expect(open).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  it("a body walks up every run from the room at its foot to the room at its top (outside, if none), and back down", async () => {
    const { sim, ctrl, pawn } = await walker();
    const problems: string[] = [];
    for (const run of stairs.runs) {
      const up = wayUp(run);
      sim.teleport(pawn.id, run.foot[0], run.foot[1], run.foot[2], 0, Stance.Stand);
      const a = walk(sim, ctrl, pawn, up);
      // The rooms the run joins: those at its top and its foot (Millrace's runs don't name them).
      const [topRoom, footRoom] = [run.topRoom ?? roomAt(run.to, run.top[0], run.top[2]), run.footRoom ?? roomAt(run.from, run.foot[0], run.foot[2])];
      const room = roomAt(run.to, a.x, a.z);
      if (!a.reached || Math.abs(a.y - run.top[1]) > 0.05 || room !== topRoom) problems.push(`${run.id} up: at (${a.x.toFixed(2)}, ${a.y.toFixed(2)}, ${a.z.toFixed(2)}) in ${room}, not ${topRoom}, reached ${a.reached}`);
      const b = walk(sim, ctrl, pawn, [...up].reverse());
      const from = roomAt(run.from, b.x, b.z);
      if (!b.reached || Math.abs(b.y - run.foot[1]) > 0.05 || from !== footRoom) problems.push(`${run.id} down: at (${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.z.toFixed(2)}) in ${from}, not ${footRoom}, reached ${b.reached}`);
    }
    expect(problems).toEqual([]);
  });
});

describe("millrace walk graph (DESIGN §9.2 check 10)", () => {
  const storeys = level.storeys as { id: string; floorY: number }[];
  /** A storey's floors: its own level and what a body climbs onto from it (the flights that start on it count as its). */
  const band = (id: string): [number, number] => {
    const y = storeys.find((s) => s.id === id)!.floorY;
    return [y - 0.1, Math.min(y + 2, ...storeys.map((s) => s.floorY - 0.1).filter((f) => f > y))];
  };
  const riverbank = (level.spawns as { id: string; pos: Vec3 }[]).find((s) => s.id === "A_RIVERBANK")!;
  /** The rooms with a floor node in the component of attacker spawn A (the riverbank). */
  const reached = (g: WalkGraph) => {
    const start = nodeNear(g, ...riverbank.pos);
    const main = g.comp[start];
    return { start, main, rooms: rooms.filter((r) => r.rects.some((rect) => nodesIn(g, rect, ...band(r.storey)).some((n) => g.comp[n] === main))).map((r) => r.id) };
  };
  /** A Sim of Millrace without its stairs whose ids start so ("ST_RACE:": the race's steps down from the bank). */
  const without = async (prefix: string) => {
    // (loadGameData() is shared: the level goes into a copy of its map.)
    const data = { ...loadGameData(), levels: new Map(loadGameData().levels) };
    const def = structuredClone(data.levels.get(MAP_ID)!);
    def.stairs = def.stairs.filter((f) => !f.id.startsWith(prefix));
    data.levels.set(MAP_ID, def);
    return Sim.create(MAP_ID, data);
  };

  it("from the riverbank attacker spawn, nothing broken, a body walks to every room on every storey: down the race's steps, through the Wheel Pit's arch (D-183)", async () => {
    const g = buildWalkGraph(await Sim.create(MAP_ID));
    const r = reached(g);
    expect(r.start).toBeGreaterThanOrEqual(0);
    expect(rooms.map((x) => x.id).filter((id) => !r.rooms.includes(id))).toEqual([]);
    for (const s of storeys) {
      const [y0, y1] = band(s.id);
      expect(g.comp.some((c, n) => c === r.main && g.y[n] >= y0 && g.y[n] < y1), s.id).toBe(true);
    }
    expect(g.ladders).toEqual([]);
  });

  it("the outside is one piece: from the riverbank a body walks to every attacker spawn, and down the race's steps to its floor; without them, into no room (every other way in starts barricaded, the graph leaks through no floor or wall)", async () => {
    const outside = async (sim: Sim) => {
      const g = buildWalkGraph(sim);
      const main = g.comp[nodeNear(g, ...riverbank.pos)];
      const lost = (level.spawns as { id: string; side?: string; pos: Vec3 }[]).filter((s) => s.side === "attack").filter((s) => g.comp[nodeNear(g, ...s.pos)] !== main);
      const race = nodeNear(g, -2.5, -3.2, 20);
      return { lost: lost.map((s) => s.id), raceFloor: race >= 0 && g.comp[race] === main, rooms: reached(g).rooms.length };
    };
    expect(await outside(await Sim.create(MAP_ID))).toEqual({ lost: [], raceFloor: true, rooms: rooms.length });
    expect(await outside(await without("ST_RACE:"))).toEqual({ lost: [], raceFloor: false, rooms: 0 });
  });

  it("the play area's edge holds a body in: walking at it from inside, on each side, it stops at the edge", async () => {
    const { sim, ctrl, pawn } = await walker();
    const [px0, pz0, px1, pz1] = inputs.exterior.playable.map((u) => u * k);
    // From 3 m inside, at a spot clear of the outside's items, walking straight at the edge for 4 s.
    for (const [x, z, yawDeg] of [
      [0, pz0 + 3, 0],
      [0, pz1 - 3, 180],
      [px0 + 3, 0, 90],
      [px1 - 3, 0, -90],
    ] as const) {
      sim.teleport(pawn.id, x, 0, z, yawDeg, Stance.Stand);
      for (let t = 0; t < 64 * 4; t++) sim.step(new Map([[ctrl.id, cmd({ forward: 1, yawDeg })]]));
      const st = pawn.state;
      expect([yawDeg, st.x > px0 && st.x < px1 && st.z > pz0 && st.z < pz1 && st.grounded && Math.abs(st.y) < 0.05]).toEqual([yawDeg, true]);
    }
  });

  it("a barricade shuts its doorway: the north door into the Loom Hall (1F.o003) joins its two sides only once it is broken", async () => {
    // Without the race's steps, so the doorway is the only way in.
    const sim = await without("ST_RACE:");
    const sides = (g: WalkGraph) => [nodeNear(g, 12, 0, 0.6), nodeNear(g, 12, 0, -0.6)];
    const up = buildWalkGraph(sim);
    const [inside, outside] = sides(up);
    expect(Math.min(inside, outside)).toBeGreaterThanOrEqual(0);
    expect(up.comp[inside]).not.toBe(up.comp[outside]);
    expect(reached(up).rooms).toEqual([]);
    sim.level.panels.apply(sim.level.panels.byId.get("1F.o003.bar")!.panel.spec.index, { kind: "damage", amount: 1e9, hard: false });
    const open = buildWalkGraph(sim);
    const [a, b] = sides(open);
    expect(open.comp[a]).toBe(open.comp[b]);
    expect(reached(open).rooms).toContain("1F_LOOM_HALL");
  });
});

describe("millrace outside, props, sites, cameras and ingredients (DESIGN §5.9–§5.11)", () => {
  type Item = (typeof inputs.exterior.items)[number];
  const holds = (r: Room, x: number, z: number, eps = 0.02) => r.rects.some(([x0, z0, x1, z1]) => x >= Math.min(x0, x1) - eps && x <= Math.max(x0, x1) + eps && z >= Math.min(z0, z1) - eps && z <= Math.max(z0, z1) + eps);
  const roomOf = (id: string) => rooms.find((r) => r.id === id)!;
  const storeys = level.storeys as { id: string; floorY: number; ceilingY: number }[];
  const floorOf = (id: string) => storeys.find((s) => s.id === id)!;
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

  it("nothing outside stands in a room: an item placed inside the building is reported, turned by its yaw", () => {
    expect(report.errors.filter((e) => e.startsWith("exterior.json"))).toEqual([]);
    const withItem = (item: Item) => compile({ ...inputs, exterior: { ...inputs.exterior, items: [...inputs.exterior.items, item] } });
    const bales = inputs.exterior.items.find((i) => i.id === "EXT_BALES_2")!;
    // Across the office wing's east wall (its outer face at 401 u), into Dispatch.
    expect(withItem({ ...bales, id: "EXT_TEST", rect: [392, 88, 408, 99] }).report.errors).toContain("exterior.json EXT_TEST: stands in 1F_DISPATCH");
    // A plank 0.3 m wide and 6 m long beside that wall's outer face: clear lying north–south, in Dispatch turned a quarter.
    const plank = { ...bales, id: "EXT_TEST", rect: [402, 75, 404, 115] as [number, number, number, number] };
    expect(withItem(plank).report.errors.filter((e) => e.includes("EXT_TEST"))).toEqual([]);
    expect(withItem({ ...plank, yawDeg: 90 }).report.errors).toContain("exterior.json EXT_TEST: stands in 1F_DISPATCH");
  });

  it("each site's bombs stand on their room's floor in its two rooms, with the default plant margin", () => {
    type Site = { id: string; rooms: string[]; bombs: { id: string; pos: Vec3; room: string }[]; plantMarginM: number };
    const sites = level.sites as Site[];
    expect(sites.map((x) => x.id)).toEqual(inputs.layout.sites.map((x) => x.id));
    for (const site of sites) {
      const def = inputs.layout.sites.find((x) => x.id === site.id)!;
      expect(site.rooms).toEqual(def.rooms);
      expect(site.plantMarginM).toBe(inputs.layout.defaults.site.plantMarginM);
      expect(site.bombs.map((b) => b.room).sort()).toEqual([...def.rooms].sort());
      for (const b of site.bombs) expect([b.id, holds(roomOf(b.room), b.pos[0], b.pos[2], 0), b.pos[1]]).toEqual([b.id, true, floorOf(roomOf(b.room).storey).floorY]);
    }
  });

  it("each camera is on a wall of its room under the ceiling looking into it, or outside on a post or the building's face", () => {
    const cams = level.cameras as { id: string; pos: Vec3; yawDeg: number; pitchDeg: number; room?: string }[];
    expect(cams.map((c) => c.id)).toEqual(inputs.layout.cameras.map((c) => c.id));
    for (const c of cams) {
      const [x, y, z] = c.pos;
      const want = inputs.layout.cameras.find((d) => d.id === c.id)!.room ?? null;
      expect([c.id, c.room ?? null, c.pitchDeg, wallBehind(x, y, z)]).toEqual([c.id, want, inputs.layout.defaults.camera.pitchDeg, true]);
      if (!c.room) {
        // On a post, or on the building's face looking out of it (the point ahead outside every room).
        const post = solids.some((b) => b.id === `${c.id}.post`);
        expect([c.id, post || !rooms.some((r) => holds(r, ...ahead(x, z, c.yawDeg, 1)))]).toEqual([c.id, true]);
        continue;
      }
      const r = roomOf(c.room);
      expect([c.id, holds(r, x, z), y]).toEqual([c.id, true, Math.round((floorOf(r.storey).ceilingY - inputs.layout.defaults.camera.belowCeilingM) * 1e4) / 1e4]);
      expect([c.id, holds(r, ...ahead(x, z, c.yawDeg, 1))]).toEqual([c.id, true]); // looking into the room
    }
  });

  it("each extinguisher and gas pipe is on a wall of its room at its height, facing out of it", () => {
    const ings = level.ingredients as { id: string; kind: string; pos: Vec3; yawDeg: number; room?: string }[];
    expect(ings.map((g) => [g.id, g.kind])).toEqual(inputs.layout.ingredients.map((g) => [g.id, g.kind]));
    const d = inputs.layout.defaults.ingredient;
    for (const g of ings) {
      const [x, y, z] = g.pos;
      const want = inputs.layout.ingredients.find((i) => i.id === g.id)!.room!;
      const r = roomOf(want);
      expect([g.id, g.room, Math.round((y - floorOf(r.storey).floorY - shiftOf(r.id)) * 1e4) / 1e4]).toEqual([g.id, want, g.kind === "gas_pipe" ? d.gasPipeM : d.fireExtinguisherM]);
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
        expect([x.id, x.pos[1]]).toEqual([x.id, floorOf(roomOf(site.rooms[where[mine.indexOf(x)]]).storey).floorY]);
        const yaw = (Math.atan2(-(mx - x.pos[0]), -(mz - x.pos[2])) * 180) / Math.PI;
        expect(Math.abs(((x.yawDeg - yaw + 540) % 360) - 180), x.id).toBeLessThan(0.1);
      }
    }
  });

  it("places the cover props as PROPs with a class, on their storey's floor (or where they're set) wholly in a room; those a body vaults vaultable", () => {
    type Solid = Box & { prop?: string; yawDeg?: number };
    const props = (solids as Solid[]).filter((b) => b.surface === "PROP" && b.prop !== undefined);
    expect(props.map((b) => b.id).sort()).toEqual(inputs.exterior.props.map((p) => p.id).sort());
    const classes = loadGameData().destruction.props.classes;
    const step = loadGameData().movement.step.maxStepHeight;
    for (const b of props) {
      const def = inputs.exterior.props.find((p) => p.id === b.id)!;
      const st = floorOf(def.level as string);
      const bottom = b.center[1] - b.size[1] / 2;
      const room = rooms.find((r) => r.storey === st.id && holds(r, b.center[0], b.center[2], 0));
      // Wholly in that room: every corner of its footprint, turned by its yaw, 5 cm in.
      const yaw = ((b.yawDeg ?? 0) * Math.PI) / 180;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => {
        const [dx, dz] = [i * (b.size[0] / 2 - 0.05), j * (b.size[2] / 2 - 0.05)];
        return [b.center[0] + dx * Math.cos(yaw) + dz * Math.sin(yaw), b.center[2] - dx * Math.sin(yaw) + dz * Math.cos(yaw)];
      });
      const whole = room !== undefined && corners.every(([x, z]) => holds(room, x, z, 0));
      // A step's height (the footbridge, walked onto) isn't a vault; up to a vault's height, it is.
      const vault = b.size[1] <= loadGameData().movement.vault.maxOverHeight && b.size[1] > step;
      expect([b.id, Object.hasOwn(classes, b.prop!), Math.abs(bottom - (def.baseY ?? st.floorY)) < 1e-6, whole, !!b.vaultable]).toEqual([b.id, true, true, true, vault]);
    }
  });

  it("refuses a prop in a doorway or an open passage, on a hatch, on the stairs, or into a wall", () => {
    const withProp = (id: string, change: Partial<(typeof inputs.exterior.props)[number]>) =>
      compile({ ...inputs, exterior: { ...inputs.exterior, props: inputs.exterior.props.map((p) => (p.id === id ? { ...p, ...change } : p)) } }).report.errors;
    // The mending table across the door between Spinning and Mending (1F.o032).
    expect(withProp("PROP_TABLE_MEND", { rect: [201.667, 70, 208.333, 76.667] })).toContain("exterior.json PROP_TABLE_MEND: stands in the doorway of 1F.o032");
    // A metre square of it in the open passage from the Mill Corridor to the Stair Hall (1F.o055).
    const passage = compileWalls(inputs.layout, fr, inputs.walls, inputs.exterior.playable).passages.find((p) => p.id === "1F.o055")!;
    const [px, pz] = (passage.axis === "H" ? [(passage.a0 + passage.a1) / 2, passage.at] : [passage.at, (passage.a0 + passage.a1) / 2]).map((m) => m / k);
    expect(withProp("PROP_TABLE_MEND", { rect: [px - 3.33, pz - 3.33, px + 3.33, pz + 3.33] })).toContain("exterior.json PROP_TABLE_MEND: stands in the doorway of 1F.o055");
    // The carding engine on hatch H1, in the Carding Store's floor.
    expect(withProp("PROP_CARDER", { rect: [198, 92, 210, 103] })).toContain("exterior.json PROP_CARDER: stands on the hatch H1");
    // The table on the main stairs' first flight up from 1F.
    expect(withProp("PROP_TABLE_MEND", { rect: [290, 16.667, 296.667, 23.333] })).toContain("exterior.json PROP_TABLE_MEND: stands on the stairs");
    // The table across the wall between the Warping Room and the Foreman's Office.
    expect(withProp("PROP_TABLE_MEND", { rect: [170, 56, 177, 66] })).toContain("exterior.json PROP_TABLE_MEND: goes into 1F.w026#2.0");
  });

  it("a bullet goes through the mending table (wood) at ×0.7 and stops at a loom (metal)", async () => {
    const sim = await Sim.create(MAP_ID);
    const rifle = { rule: loadGameData().destruction.bullets.tiers.medium! };
    const bodyAt = (t: number) => (max: number) => (max > t ? [{ id: 9, parts: [{ part: "torso" as const, t }] }] : []);
    // East at waist height across the table (x 29 to 33 m) to a body 6 m on.
    const table = pelletPath(sim, [28, 0.5, 14.8], [1, 0, 0], bodyAt(6), "none", rifle);
    expect([table.hits.map((h) => +h.mult.toFixed(6)), table.surfaces]).toEqual([[0.7], 1]);
    // East in the Loom Hall at 0.8 m into the first loom (from x 2.5 m): stopped at its face.
    const loom = pelletPath(sim, [1.5, 0.8, 10.3], [1, 0, 0], bodyAt(3), "none", rifle);
    expect([loom.hits, +loom.wall!.toFixed(2)]).toEqual([[], 1]);
  });

  it("reports a marker it can't place: a camera far from every wall of its room, a bomb outside its room", () => {
    const moved = compile({
      ...inputs,
      layout: {
        ...inputs.layout,
        // CAM3 into the middle of the Loom Hall; bomb 2A over in the Mending Room.
        cameras: inputs.layout.cameras.map((c) => (c.id === "CAM3" ? { ...c, at: [60, 70] as [number, number] } : c)),
        sites: inputs.layout.sites.map((x) => (x.id === "SITE_MILL" ? { ...x, bombs: [{ ...x.bombs[0], at: [213.333, 106.667] as [number, number] }, x.bombs[1]] } : x)),
      },
    });
    expect(moved.report.errors).toContain("camera CAM3: no wall of 1F_LOOM_HALL within 2 m of its marker reaches 2.70 m");
    expect(moved.report.errors.join("\n")).toMatch(/site SITE_MILL: bomb 2A at \([\d.]+, [\d.]+\) isn't in 1F_SPINNING/);
  });

  it("compiles each site's Quick Match pre-setup, and reports one that names no reinforceable wall or hatch, a wall away from its room, or a hole in a hard wall", () => {
    const sites = compiled.level.sites as LevelDef["sites"];
    expect(sites.map((x) => [x.id, x.preSetup?.reinforce.map((r) => r.panel), x.preSetup?.holes.map((h) => `${h.panel} ${h.size}`)])).toEqual([
      ["SITE_BOILER", ["H4", "H6"], ["SW-B-01 crouch"]],
      ["SITE_MILL", ["SW-1F-01", "SW-1F-02"], ["SW-1F-04 vault"]],
      ["SITE_DISPATCH", ["SW-1F-06", "H2"], []],
      ["SITE_OFFICES", ["SW-2F-06", "SW-2F-11"], ["SW-2F-04 vault"]],
    ]);
    const bad = compile({
      ...inputs,
      layout: {
        ...inputs.layout,
        sites: inputs.layout.sites.map((x) =>
          x.id === "SITE_MILL"
            ? { ...x, preSetup: { ...x.preSetup!, reinforce: [{ panel: "SW-1F-01", from: "1F_DISPATCH" }, { panel: "H3", from: "1F_SPINNING" }, { panel: "SW-1F-99", from: "1F_SPINNING" }], holes: [{ panel: "1F.w018", size: "vault" as const }] } }
            : x,
        ),
      },
    });
    expect(bad.report.errors).toEqual(
      expect.arrayContaining([
        "site SITE_MILL: pre-setup wall SW-1F-01 doesn't stand beside 1F_DISPATCH (1F_WARPING, 1F_SPINNING)",
        'site SITE_MILL: pre-setup hatch H3 is reinforced from its top, so it takes no "from"',
        "site SITE_MILL: pre-setup SW-1F-99 is neither a reinforceable wall nor a hatch",
        "site SITE_MILL: pre-setup hole in 1F.w018, which isn't a reinforceable wall",
      ]),
    );
  });

  it("puts an outside marker on the building's outer face, looking or facing out; reports one inside the building, and an inside one in no room", () => {
    // 1.4 m south of the mill's south wall at x 18 m (world u 120, 142.667): more than 1.5 m from every room.
    const outside: [number, number] = [120, 142.667];
    type Cam = (typeof inputs.layout.cameras)[number];
    type Ing = (typeof inputs.layout.ingredients)[number];
    const withMarkers = (cams: (c: Cam) => Cam, ings: (g: Ing) => Ing) => compile({ ...inputs, layout: { ...inputs.layout, cameras: inputs.layout.cameras.map(cams), ingredients: inputs.layout.ingredients.map(ings) } });
    const near = withMarkers(
      (c) => (c.id === "CAM1" ? { ...c, frame: "world", at: outside } : c),
      (g) => (g.id === "ING5" ? { ...g, level: "EXT", room: undefined, frame: "world", at: outside } : g),
    );
    expect(near.report.errors).toEqual([]);
    const cam = (near.level.cameras as { id: string; pos: Vec3; yawDeg: number; room?: string }[]).find((c) => c.id === "CAM1")!;
    const pipe = (near.level.ingredients as { id: string; pos: Vec3; yawDeg: number; room?: string }[]).find((g) => g.id === "ING5")!;
    for (const m of [cam, pipe]) {
      // On the wall's outer face (z 20.15 m), in no room, looking or facing south: out from the wall.
      expect([m.room, Math.abs(m.pos[2] - 20.15) < 0.1, Math.abs(m.pos[0] - 18) < 0.01], m.id).toEqual([undefined, true, true]);
      expect(-Math.cos((m.yawDeg * Math.PI) / 180), m.id).toBeGreaterThan(0.99);
    }
    expect((near.level.solids as { id: string }[]).some((b) => b.id === "CAM1.post")).toBe(false);
    // An outside camera whose marker is in the Warping Room; an extinguisher on 1F whose marker is out there.
    const bad = withMarkers(
      (c) => (c.id === "CAM1" ? { ...c, frame: "world", at: [150, 33.333] } : c),
      (g) => (g.id === "ING1" ? { ...g, room: undefined, frame: "world", at: outside } : g),
    );
    expect(bad.report.errors).toEqual(["camera CAM1: its marker at (22.50, 5.00) is inside the building, but its level is EXT", "fire_extinguisher ING1: its marker at (18.00, 21.40) is in no room on 1F"]);
  });
});

describe("millrace zones and rappel faces (DESIGN §5.11)", () => {
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
    for (const r of rooms) {
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
    // On a walkable roof, on its slabs or halfway up its slopes, a body is out.
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
    for (const sp of level.spawns as { id: string; pos: Vec3; side?: string }[]) {
      const at = buildingAt([sp.pos[0], sp.pos[1] + 0.9, sp.pos[2]]);
      if (sp.side === "attack" || sp.side === "defense") expect(at.length, sp.id).toBe(sp.side === "attack" ? 0 : 1);
    }
  });

  it("each storey's building zone holds the walls round its rooms, middles and corners", () => {
    const touches = (b: Box, r: Room) =>
      r.rects.some(([x0, z0, x1, z1]) => b.center[0] - b.size[0] / 2 <= Math.max(x0, x1) + 0.05 && b.center[0] + b.size[0] / 2 >= Math.min(x0, x1) - 0.05 && b.center[2] - b.size[2] / 2 <= Math.max(z0, z1) + 0.05 && b.center[2] + b.size[2] / 2 >= Math.min(z0, z1) - 0.05);
    for (const s of storeys) {
      const walls = solids.filter((b) => !b.drawOnly && !b.bodiesOnly && (b.surface === "HARD_WALL" || b.surface === "REINFORCEABLE") && storeyOfBox(inputs.layout, b as never) === s.id && rooms.some((r) => r.storey === s.id && touches(b, r)));
      expect(walls.length, s.id).toBeGreaterThan(0);
      for (const b of walls) {
        // Its middle and its corners, 2 cm in, a metre over the floor.
        const [hx, hz] = [b.size[0] / 2 - 0.02, b.size[2] / 2 - 0.02];
        for (const [i, j] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]) expect(buildingAt([b.center[0] + i * hx, s.floorY + 1, b.center[2] + j * hz]), `${b.id} (${i}, ${j})`).toEqual([`building:${s.id}`]);
      }
    }
  });

  it("puts the spawn peeks inside their doors and windows and a run-out outside, looking out toward their spawn", () => {
    // Millrace has no run-out of its own: one is added outside the mill's south door to check where it goes.
    const runOut = { id: "RUN_S", kind: "out_of_bounds" as const, openings: ["1F.o017"], _unverified: [] };
    const withRun = compile({ ...inputs, layout: { ...inputs.layout, zones: [...inputs.layout.zones, runOut] } });
    expect(withRun.report.errors).toEqual([]);
    const all = withRun.level.zones as LevelZone[];
    const authored = [...inputs.layout.zones, runOut].flatMap((z) => z.openings.map((id) => ({ ...z, opening: id })));
    const placed = all.filter((z) => z.kind === "spawn_peek" || z.kind === "out_of_bounds");
    expect(placed.map((z) => z.id).sort()).toEqual(authored.map((z) => `${z.id}:${z.opening}`).sort());
    expect(new Set(authored.map((z) => (z as { faces?: string }).faces))).toEqual(new Set(["A_RIVERBANK", "B_RAIL_SIDING", "C_YARD_GATE", undefined]));
    expect(new Set(authored.map((z) => z.kind))).toEqual(new Set(["spawn_peek", "out_of_bounds"]));
    const depth = inputs.layout.defaults.zone.depthM;
    for (const a of authored) {
      const z = placed.find((c) => c.id === `${a.id}:${a.opening}`)!;
      const o = opened.find((p) => p.id === a.opening)!;
      expect(o.exterior, o.id).toBe(true);
      expect(z.boxes.length).toBe(1);
      const [b] = z.boxes;
      const normal: Vec3 = o.axis === "H" ? [0, 0, o.out] : [o.out, 0, 0];
      const faces = (a as { faces?: string }).faces;
      expect([z.kind, z.faces, z.normal], z.id).toEqual([a.kind, faces, normal]);
      // From the floor to the opening's top, as wide as the opening, depthM deep, against its inner face or its outer one.
      const y0 = floorOf(o.floor);
      expect([b.center[1] - b.size[1] / 2, b.center[1] + b.size[1] / 2].map((v) => +v.toFixed(4)), z.id).toEqual([y0, +(y0 + o.y1).toFixed(4)]);
      expect((o.axis === "H" ? [b.size[0], b.size[2]] : [b.size[2], b.size[0]]).map((v) => +v.toFixed(4)), z.id).toEqual([+(o.a1 - o.a0).toFixed(4), depth]);
      const middle = a.kind === "spawn_peek" ? outFrom(o, -o.t - depth / 2, y0 + 1.2) : outFrom(o, depth / 2, y0 + 1.2);
      expect(middle.map((v, i) => Math.abs(v - b.center[i]) < 1e-3 || i === 1), z.id).toEqual([true, true, true]);
      expect(buildingAt(middle, all), z.id).toEqual(a.kind === "spawn_peek" ? [`building:${o.floor}`] : []);
      // The spawn it faces is out in front of it.
      for (const sp of (level.spawns as { pos: Vec3; group?: string }[]).filter((x) => faces !== undefined && x.group === faces)) {
        expect((sp.pos[0] - b.center[0]) * normal[0] + (sp.pos[2] - b.center[2]) * normal[2], `${z.id} looks toward ${faces}`).toBeGreaterThan(0);
      }
    }
  });

  it("has a rappel face just outside every outside wall above ground, from its floor to its top: a wall behind it, the outside in front", () => {
    const rappel = zones.filter((z) => z.kind === "rappel");
    expect(rappel).toHaveLength(16);
    expect(new Set(rappel.map((z) => z.id.split(":")[1]))).toEqual(new Set(["1F", "2F"]));
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
      const count = Math.ceil((len - 0.1) / 0.5);
      for (let i = 0; i <= count; i++) {
        const at = (m: number): Vec3 => {
          const p: Vec3 = [0, y0 + 2.5, 0];
          p[axis] = wallSide + n[axis] * m;
          p[along] = lo + 0.05 + ((len - 0.1) * i) / count;
          return p;
        };
        expect(walls.some((w) => inBox(w, at(-0.1))), `${z.id}: a wall behind ${at(0)}`).toBe(true);
        expect(buildingAt(at(0.3)), `${z.id}: outside in front of ${at(0)}`).toEqual([]);
      }
    }
    // Every outside door and window above ground is on one, across all of it.
    for (const o of opened.filter((x) => x.exterior && floorOf(x.floor) >= 0)) expect(facesOver(o).length, o.id).toBe(1);
  });

  it("leaves out the faces of a wall rappel is refused on, and reports a zone or a refusal it can't place", () => {
    const line = inputs.walls.find((p) => p.floor === "2F")!.walls.find((w) => w.spans.some((x) => x.id === "2F.o017"))!;
    const refused = compile({ ...inputs, layout: { ...inputs.layout, rappel: { refuse: [line.id, "2F.w999"] } } });
    const window = opened.find((o) => o.id === "2F.o017")!;
    expect(facesOver(window).length).toBe(1);
    expect(facesOver(window, refused.level.zones as LevelZone[])).toEqual([]);
    expect(refused.report.errors).toEqual([`rappel.refuse: "2F.w999" isn't a wall line of the walls parts`]);
    // The other storeys' faces don't change.
    const others = (among: LevelZone[]) => among.filter((z) => z.kind === "rappel" && !z.id.startsWith("rappel:2F:"));
    expect(others(refused.level.zones as LevelZone[])).toEqual(others(zones));
    // A zone at an opening the walls don't have, at an inside door, or facing a defenders' group.
    const inside = opened.find((o) => !o.exterior)!.id;
    const bad = compile({ ...inputs, layout: { ...inputs.layout, zones: [{ id: "Z1", kind: "spawn_peek", openings: ["2F.o999", inside], faces: "SITE_OFFICES", _unverified: [] }] } });
    expect(bad.report.errors).toEqual([`zone Z1: it faces "SITE_OFFICES", which isn't an attackers' spawn group`, `zone Z1: "2F.o999" isn't a door or window of the compiled walls`, `zone Z1: ${inside} isn't in an outside wall`]);
  });
});

describe("millrace roofs (DESIGN §5.8)", () => {
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
  /** A Sim of a compiled variant of the level. */
  const simOf = async (level2: Record<string, unknown>, id: string) => {
    const def = levelSchema.parse({ ...level2, id });
    return Sim.create(id, { ...loadGameData(), levels: new Map(loadGameData().levels).set(id, def) });
  };

  it("every roof covers part of the building and every room has a floor, a hatch or a roof over it", () => {
    expect(report.warnings.filter((w) => roofs.some((r) => w.startsWith(`${r.id}:`)))).toEqual([]);
    expect(report.errors).toEqual([]);
    // Without the boiler house's roof the rooms under it are open to the sky (the Boiler Room where its stairs come up), and the check says which.
    const open = withRoofs((r) => (r.id === "RF_BOILER" ? null : r))
      .report.errors.filter((e) => e.includes("nothing over it"))
      .map((e) => e.slice(0, e.indexOf(":")));
    expect(open.sort()).toEqual(["1F_ENGINE_ROOM", "1F_FIRING_FLOOR", "B_BOILER_ROOM"]);
  });

  it("an eave off its walls, or a slope rising over a window's sill, is reported", () => {
    // The mill's roof 10 u south: its south eave hangs out over the yard, 1.5 m off the wall.
    const off = withRoofs((r) => (r.id === "RF_MILL" ? { ...r, rects: [[0, 10, 320, 143.333]] } : r));
    expect(off.report.errors.join("\n")).toMatch(/RF_MILL: its S eave rests on nothing at 6\.2 m/);
    // Millrace has no low roof against a taller wall: a lean-to added on the mill's south wall rises over the sill of
    // the 2F window there (2F.o015).
    const leanTo = { ...roofs.find((r) => r.id === "RF_BOILER")!, id: "RF_TEST", shape: "mono" as const, low: "S" as const, pitchDeg: 12, eaveY: 3.2, rects: [[53.333, 133.333, 146.667, 173.333]] as [number, number, number, number][] };
    const steep = compile({ ...inputs, layout: { ...inputs.layout, roofs: [...roofs, leanTo] } });
    expect(steep.report.errors.join("\n")).toMatch(/RF_TEST rises to [\d.]+ m outside 2F\.o015\.glass/);
  });

  it("a pitched roof's open end is closed by steps, up to the slope: a level shot along the ridge stops at the end", async () => {
    const sim = await Sim.create(MAP_ID);
    // The mill roof's west end, from over the race: shots at heights from the eave to just under the ridge, across the
    // gable, each stopped within the end's wall thickness (0.3 m) of its face.
    const r = roofs.find((q) => q.id === "RF_MILL")!;
    const [x0, z0, , z1] = r.rects[0].map((u) => u * k);
    let shots = 0;
    for (const y of [6.3, 6.8, 7.3, 7.8, 8.3, 8.8, 9.3, 9.8]) {
      for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        const z = z0 + f * (z1 - z0);
        if (topAt("RF_MILL", x0 + 0.01, z) - 0.25 < y) continue; // above the slope there
        shots++;
        const hit = sim.world.castRay(new sim.R.Ray({ x: x0 - 3, y, z }, { x: 1, y: 0, z: 0 }), 10, true, undefined, QUERY_STATIC);
        expect(hit?.timeOfImpact, `y ${y} z ${z.toFixed(2)}`).toBeGreaterThan(3 - 0.16);
        expect(hit!.timeOfImpact, `y ${y} z ${z.toFixed(2)}`).toBeLessThan(3 + 0.31);
      }
    }
    expect(shots).toBeGreaterThan(20);
  });

  it("a pitched roof with no ceiling raises the walls under it to its slope: the room looks up into the roof, and a shot over the walls' tops stops at them", async () => {
    const open = withRoofs((r) => (r.id === "RF_MILL" ? { ...r, ceiling: false } : r));
    expect(open.report.errors).toEqual([]);
    const sim = await simOf(open.level, "millrace_no_ceiling");
    // Up from the Pattern Room's floor (2F): the roof's underside, not a ceiling at the eave.
    const up = sim.world.castRay(new sim.R.Ray({ x: 22, y: 4, z: 15 }, { x: 0, y: 1, z: 0 }), 20, true, undefined, QUERY_STATIC);
    expect(4 + up!.timeOfImpact).toBeGreaterThan(topAt("RF_MILL", 22, 15) - 0.6);
    // Level shots east above the eave, in the Pattern Room and the Carding Store: stopped at their east walls' faces (x 26, 36).
    for (const [x, y, z, wall] of [[22, 6.6, 15, 25.9], [22, 7.0, 5, 25.9], [30, 6.6, 15, 35.9]]) {
      const hit = sim.world.castRay(new sim.R.Ray({ x, y, z }, { x: 1, y: 0, z: 0 }), 30, true, undefined, QUERY_STATIC);
      expect(x + hit!.timeOfImpact, `from ${x}, ${y}, ${z}`).toBeCloseTo(wall, 2);
    }
    // With the ceiling (as built), the room's top is the ceiling slab at the eave.
    const built = await Sim.create(MAP_ID);
    const lid = built.world.castRay(new built.R.Ray({ x: 22, y: 4, z: 15 }, { x: 0, y: 1, z: 0 }), 20, true, undefined, QUERY_STATIC);
    expect(4 + lid!.timeOfImpact).toBeCloseTo(6, 2);
  });

  it("a body stands on the flat roofs and on the slopes, where it is put, without sliding", async () => {
    const { sim, pawn } = await walker();
    const problems: string[] = [];
    for (const [id, xu, zu] of [
      ["RF_MILL", 100, 30],
      ["RF_MILL", 200, 100],
      ["RF_MILL", 250, 60],
      ["RF_OFFICE", 360, 120],
      ["RF_BOILER", 100, 210],
    ] as const) {
      const [x, z] = [xu * k, zu * k];
      const top = topAt(id, x, z);
      sim.teleport(pawn.id, x, top + 0.3, z, 0);
      steps(sim, 64);
      const st = pawn.state;
      const off = Math.hypot(st.x - x, st.z - z);
      if (!st.grounded || Math.abs(st.y - top) > 0.06 || off > 0.05) problems.push(`${id}: at y ${st.y.toFixed(2)} (roof ${top.toFixed(2)}), ${off.toFixed(2)} m off, grounded ${st.grounded}`);
    }
    expect(problems).toEqual([]);
  });
});

describe("millrace determinism (DESIGN §9.2 check 12)", () => {
  it("two Sims given the same panel-op log and the same inputs end with the same panels, and a body walks through the same hole", async () => {
    const make = async () => {
      const sim = await Sim.create(MAP_ID);
      const ctrl = sim.addPlayer("tester", "sledge");
      // In the Mending Room south of its 4 m soft wall to the Spinning Room (SW-1F-03, z 11), facing it (netsim's wall fight).
      sim.teleport(ctrl.possessedPawnId, 35, 0, 12.6, 0);
      return { sim, ctrl };
    };
    const [A, B] = [await make(), await make()];
    const panels = A.sim.level.panels.list;
    const wall = panels.findIndex((e) => e.panel.spec.id === "SW-1F-03");
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
    for (let t = 0; t < 160; t++) {
      for (let i = 0; i < 8; i++) {
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
      const input = cmd({ forward: t > 40 ? 1 : 0, yawDeg: 0 });
      A.sim.step(new Map([[A.ctrl.id, input]]));
      B.sim.step(new Map([[B.ctrl.id, input]]));
      expect(B.sim.pawns.get(B.ctrl.possessedPawnId)!.state, `tick ${t}`).toEqual(A.sim.pawns.get(A.ctrl.possessedPawnId)!.state);
    }
    expect(B.sim.level.panels.hash()).toBe(A.sim.level.panels.hash());
    expect(panels.filter((e) => e.panel.modified).length).toBeGreaterThan(100);
    // Through the hole, into the Spinning Room beyond the wall (z 10.9).
    expect(A.sim.pawns.get(A.ctrl.possessedPawnId)!.state.z).toBeLessThan(10);
  }, 60000);
});
