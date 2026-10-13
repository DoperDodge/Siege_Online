// Map metadata in level definitions (Phase 5, DECISIONS D-076): optional fields the labs leave out,
// invisible blockers that stop bodies but not bullets, the cross-file checks, and the kill plane.
import { describe, expect, it } from "vitest";
import { crossFileProblems, levelSchema, loadGameData, raycastLevel, Sim, Stance, type GameData, type LevelDef } from "../src/index.js";
import { input, run } from "./helpers.js";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A 20 x 20 m floor with a 6 m drop on its east side, a bodies-only wall across it, and map metadata. */
function testMap(): LevelDef {
  return levelSchema.parse({
    id: "map_test",
    name: "Map test",
    spawns: [
      { id: "lab", pos: [0, 0, 0], yawDeg: 0 },
      { id: "a1", pos: [-5, 0, 5], yawDeg: 90, side: "attack", group: "A_TEST" },
    ],
    solids: [
      { id: "floor", center: [0, -0.25, 0], size: [20, 0.5, 20], surface: "HARD_FLOOR" },
      { id: "fence", center: [0, 1, -5], size: [10, 2, 0.2], surface: "HARD_WALL", bodiesOnly: true },
    ],
    bounds: { min: [-10, -6, -10], max: [10, 6, 10], killY: -5 },
    storeys: [{ id: "1F", floorY: 0, ceilingY: 3 }],
    rooms: [{ id: "1F_YARD", callout: "Yard", storey: "1F", rects: [[-10, -10, 10, 10]], anchor: [0, 0, 0] }],
    sites: [{ id: "S1", name: "Yard", rooms: ["1F_YARD"], bombs: [{ id: "S1A", pos: [1, 0, 1], room: "1F_YARD" }], plantMarginM: 0.5 }],
    cameras: [{ id: "CAM1", pos: [9, 2.5, 9], yawDeg: 45, pitchDeg: -20, room: "1F_YARD" }],
    ingredients: [{ id: "FE1", kind: "fire_extinguisher", pos: [-9, 1, 0], yawDeg: -90, room: "1F_YARD" }],
    zones: [{ id: "Z_OOB", kind: "out_of_bounds", boxes: [{ center: [0, 0, 15], size: [20, 4, 10] }] }],
  });
}

function withLevel(level: LevelDef): GameData {
  const data = loadGameData();
  return { ...data, levels: new Map(data.levels).set(level.id, level) };
}

describe("map metadata", () => {
  it("the labs parse unchanged: every new field is optional", () => {
    const data = loadGameData();
    for (const lvl of data.levels.values()) {
      if (lvl.id === "oregon") continue;
      expect(lvl.bounds, lvl.id).toBeUndefined();
      expect([lvl.storeys, lvl.rooms, lvl.sites, lvl.cameras, lvl.ingredients, lvl.zones], lvl.id).toEqual([[], [], [], [], [], []]);
      expect(lvl.solids.every((s) => !s.bodiesOnly), lvl.id).toBe(true);
    }
  });

  it("a map with every field passes the cross-file checks", () => {
    const data = withLevel(testMap());
    expect(crossFileProblems(data)).toEqual([]);
  });

  it("names the broken reference, the duplicate id and a kill plane above the level", () => {
    const lvl = clone(testMap());
    lvl.rooms[0].storey = "2F";
    lvl.sites[0].rooms.push("1F_NOWHERE");
    lvl.sites[0].bombs[0].room = "1F_ELSEWHERE";
    lvl.cameras[0].room = "1F_GONE";
    lvl.solids.push({ ...lvl.solids[0] });
    lvl.solids.push({ id: "soft_fence", center: [0, 1, 5], size: [4, 2, 0.2], yawDeg: 0, surface: "SOFT_WALL", vaultable: false, bodiesOnly: true });
    lvl.bounds!.killY = 0;
    const problems = crossFileProblems(withLevel(lvl)).join("\n");
    expect(problems).toMatch(/data\/maps\/map_test\/layout\.json: room "1F_YARD" is on storey "2F"/);
    expect(problems).toMatch(/site "S1" names room "1F_NOWHERE"/);
    expect(problems).toMatch(/bomb "S1A" of site "S1" is in "1F_ELSEWHERE"/);
    expect(problems).toMatch(/camera "CAM1" names room "1F_GONE"/);
    expect(problems).toMatch(/two solids share the id "floor"/);
    expect(problems).toMatch(/solid "soft_fence" stops bodies only/);
    expect(problems).toMatch(/bounds\.killY 0 isn't below the lowest solid or spawn \(-0\.5\)/);
  });

  it("a bodies-only wall stops a body but not a bullet, and isn't drawn", async () => {
    const sim = await Sim.create("map_test", withLevel(testMap()));
    const fence = sim.level.renderables.find((r) => r.id === "fence")!;
    expect(fence.visible).toBe(false);
    const shot = raycastLevel(sim, [0, 1.2, 0], [0, 0, -1], 30);
    expect(shot).toBeNull(); // nothing but the open yard north of the spawn
    const ctrl = sim.addPlayer("walker", "sledge");
    run(sim, ctrl, { forward: 1, yawDeg: 0 }, 3);
    const p = sim.pawns.get(ctrl.possessedPawnId)!.state;
    expect(p.z).toBeGreaterThan(-5 + 0.1 + 0.25); // stopped at the fence's south face
    expect(p.z).toBeLessThan(-4);
  });

  it("a body that falls below the kill plane comes back to spawn 0 standing, unhurt", async () => {
    const sim = await Sim.create("map_test", withLevel(testMap()));
    const ctrl = sim.addPlayer("faller", "sledge");
    const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
    sim.teleport(pawn.id, 9.6, 0, 3, -90);
    let lowest = 0;
    let back = -1;
    for (let t = 0; t < 64 * 4 && back < 0; t++) {
      sim.step(new Map([[ctrl.id, input({ forward: 1, yawDeg: -90 })]]));
      lowest = Math.min(lowest, pawn.state.y);
      if (lowest < -1 && Math.hypot(pawn.state.x, pawn.state.z) < 0.01) back = t;
    }
    expect(lowest).toBeLessThan(-1); // it went over the edge
    expect(back).toBeGreaterThan(0);
    expect(pawn.state.y).toBeGreaterThan(-5);
    run(sim, ctrl, {}, 0.5);
    expect([pawn.state.x, pawn.state.z]).toEqual([0, 0]);
    expect(pawn.state.stance).toBe(Stance.Stand);
    expect(pawn.state.hp).toBe(pawn.state.maxHp);
  });
});
