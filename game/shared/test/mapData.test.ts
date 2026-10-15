// Map metadata in level definitions (Phase 5, DECISIONS D-076): optional fields the labs leave out,
// invisible blockers that stop bodies but not bullets, the cross-file checks, and the kill plane.
import { describe, expect, it } from "vitest";
import { applyDamage, crossFileProblems, DT, levelSchema, loadGameData, PawnMode, raycastLevel, Sim, Stance, type GameData, type LevelDef, type SimEvent } from "../src/index.js";
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
      { id: "deck#r0c0", center: [-2, 3.1, 8], size: [2, 0.2, 2], surface: "SOFT_FLOOR", panel: { region: "deck" } },
      { id: "deck#r0c1", center: [0, 3.1, 8], size: [2, 0.2, 2], surface: "SOFT_FLOOR", panel: { region: "deck" } },
    ],
    bounds: { min: [-10, -6, -10], max: [10, 6, 10], killY: -5 },
    plan: { mPerU: 0.15, frames: { "1F": { ax: 1, bx: 0, ay: 1, by: 0 } } },
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
    lvl.solids.push({ id: "soft_fence", center: [0, 1, 5], size: [4, 2, 0.2], yawDeg: 0, surface: "SOFT_WALL", vaultable: false, bodiesOnly: true, drawOnly: false });
    lvl.solids.push({ id: "soft_bar", center: [0, 1, 6], size: [4, 0.05, 0.05], yawDeg: 0, surface: "SOFT_WALL", vaultable: false, bodiesOnly: false, drawOnly: true });
    lvl.solids.push({ id: "both", center: [0, 1, 7], size: [4, 0.05, 0.05], yawDeg: 0, surface: "HARD_WALL", vaultable: false, bodiesOnly: true, drawOnly: true });
    lvl.bounds!.killY = 0;
    lvl.plan!.frames = { "2F": { ax: 1, bx: 0, ay: 1, by: 0 } };
    lvl.solids.find((s) => s.id === "deck#r0c1")!.center[1] = 3.2;
    const problems = crossFileProblems(withLevel(lvl)).join("\n");
    expect(problems).toMatch(/data\/maps\/map_test\/layout\.json: room "1F_YARD" is on storey "2F"/);
    expect(problems).toMatch(/site "S1" names room "1F_NOWHERE"/);
    expect(problems).toMatch(/bomb "S1A" of site "S1" is in "1F_ELSEWHERE"/);
    expect(problems).toMatch(/camera "CAM1" names room "1F_GONE"/);
    expect(problems).toMatch(/two solids share the id "floor"/);
    expect(problems).toMatch(/solid "soft_fence" stops bodies only/);
    expect(problems).toMatch(/solid "soft_bar" is drawn only/);
    expect(problems).toMatch(/solid "both" can't both stop bodies only and be drawn only/);
    expect(problems).toMatch(/bounds\.killY 0 isn't below the lowest solid or spawn \(-0\.5\)/);
    expect(problems).toMatch(/plan\.frames has no frame for storey "1F"/);
    expect(problems).toMatch(/solid "deck#r0c1" is in region "deck" but isn't the same surface at the same height as "deck#r0c0"/);
  });

  it("a drawn-only bar is drawn and stops nothing", async () => {
    const lvl = clone(testMap());
    lvl.solids.push({ id: "bar", center: [0, 1, -3], size: [10, 0.05, 0.05], yawDeg: 0, surface: "HARD_WALL", vaultable: false, bodiesOnly: false, drawOnly: true });
    const sim = await Sim.create("map_test", withLevel(lvl));
    expect(sim.level.renderables.find((r) => r.id === "bar")!.visible).toBe(true);
    expect(raycastLevel(sim, [0, 1, 0], [0, 0, -1], 4)).toBeNull(); // through the bar, short of the fence
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

  it("a body that bleeds out on the step the kill plane brings it back reports the life it died in", async () => {
    /** Down a body falling off the east edge; `bleedSteps`: how many steps of bleeding it has left. */
    const fall = async (bleedSteps: number | null) => {
      const sim = await Sim.create("map_test", withLevel(testMap()));
      const ctrl = sim.addPlayer("faller", "sledge");
      const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
      sim.teleport(pawn.id, 11, 0, 3, -90); // just past the edge
      sim.step(new Map());
      expect(applyDamage(sim, pawn, { amount: pawn.state.hp, kill: false }).outcome).toBe("downed");
      const d = sim.data.combat.dbno;
      if (bleedSteps !== null) pawn.state.downHp = Math.fround((d.hp * DT * (bleedSteps - 0.5)) / d.bleedStillSeconds);
      const life = pawn.life;
      let deaths: SimEvent[] = [];
      let steps = 0;
      while (pawn.life === life && steps < 64 * 5) {
        sim.step(new Map());
        steps++;
        deaths = sim.events.filter((e) => e.kind === "death"); // this step's
      }
      return { steps, deaths, life, pawn };
    };
    const { steps } = await fall(null); // how long the fall to the kill plane takes
    const { deaths, life, pawn } = await fall(steps);
    // It bled out on the very step the kill plane sent it back: the event names the life it died in.
    expect(deaths).toEqual([{ kind: "death", pawnId: pawn.id, cause: "bleed", life }]);
    expect([pawn.life, pawn.state.mode]).toEqual([life + 1, PawnMode.Walk]); // back at spawn, in a new life
  });
});
