// Millrace through the generator (Project Redmond R2; tools/mapgen, DESIGN §9.2): the checks any map must pass. The
// committed level.json is exactly what its layout compiles to and loads with the game data; hard geometry never covers
// a panel, panels never overlap, and the budgets hold; the compiled walls close every room where the plan does, and the
// shell between the interior and exterior wall tops; spawns stand on the ground (attackers outside, facing the
// building); a room's rectangles hold every spot of it a body fits, its anchor stands clear and holds a body; soft floors
// are slab-thick tiles a bullet goes up through, meeting the walls under them; each hatch lies in its top room's floor
// over its bottom room, holds a body until it breaks and drops it into that room; and every staircase walks up and down.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bulletThroughPanels, crossFileProblems, DEG, loadGameData, missingUnverifiedPaths, QUERY_BULLET, QUERY_STATIC, Sim, Stance, type InputCmd, type Vec3 } from "../../game/shared/src/index.js";
import { BUDGET, checkLevel } from "./checks.js";
import { compile, loadInputs } from "./compile.js";
import { enclosureLeaks, planGrid } from "./enclosure.js";
import { readableJson } from "./format.js";
import { frames } from "./frames.js";
import { distanceInside } from "./grid.js";
import { CELL_M, clearCells, compileRooms, floorShift, storeyOfBox } from "./rooms.js";
import { compileStairs, flightBoxes, type CompiledRun } from "./stairs.js";
import { compileWalls } from "./walls.js";

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
