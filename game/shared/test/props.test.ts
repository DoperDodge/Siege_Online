// Props and bullets (Phase 5 M5, DESIGN amendment 3; data/destruction.json props, combat/hitreg.ts): a prop with
// a class is solid to bodies and sight, but a bullet goes through it like a panel (damage ×0.7, one surface
// toward the limit of two, no hole) unless its class stops bullets (metal, concrete). A PROP without a class,
// like the labs' boxes, stops bullets as before.
import { describe, expect, it } from "vitest";
import { crossFileProblems, levelSchema, loadGameData, pelletPath, raycastLevel, Sim, Stance, type BodyEntry, type PanelHitRule, type Vec3 } from "../src/index.js";

const data = loadGameData();
const d = data.destruction;
const NORTH: Vec3 = [0, 0, -1];
const EYE_Y = 1.2;

/**
 * Lanes running north from z = 0, each 5 m apart in x, with what stands across them: two wooden shelves (x 0), a
 * metal fridge (x 5), a sofa (x 10), a classless box (x 15), two wooden shelves and a soft wall (x 20), three
 * wooden shelves (x 25).
 */
async function yard() {
  const prop = (id: string, x: number, z: number, cls?: string) => ({ id, center: [x, 1, z], size: [2, 2, 0.4], surface: "PROP", ...(cls ? { prop: cls } : {}) });
  const def = levelSchema.parse({
    id: "props",
    name: "Props",
    spawns: [{ id: "s", pos: [0, 0, 5], yawDeg: 0 }],
    solids: [
      { id: "floor", center: [0, -0.25, 0], size: [200, 0.5, 200], surface: "HARD_FLOOR" },
      prop("shelf_a", 0, -3, "wood"),
      prop("shelf_b", 0, -5, "wood"),
      prop("fridge", 5, -3, "metal"),
      prop("sofa", 10, -3, "soft"),
      prop("box", 15, -3),
      prop("shelf_c", 20, -3, "wood"),
      prop("shelf_d", 20, -5, "wood"),
      { id: "wall", center: [20, 1.25, -7], size: [3, 2.5, 0.2], surface: "SOFT_WALL" },
      prop("shelf_e", 25, -3, "wood"),
      prop("shelf_f", 25, -5, "wood"),
      prop("shelf_g", 25, -7, "wood"),
    ],
  });
  return Sim.create("props", { ...data, levels: new Map(data.levels).set("props", def) });
}

/** A body standing 9 m up the lane (its torso), for the pellet to find if nothing stopped it first. */
const bodyAt9 = (maxDistance: number): BodyEntry[] => (maxDistance > 9 ? [{ id: 7, parts: [{ part: "torso", t: 9 }] }] : []);
const rifle: PanelHitRule = d.bullets.tiers.medium!;

describe("bullets through props (DESIGN amendment 3)", () => {
  it("go through wooden and soft props at ×0.7 each, and stop at a metal one or a classless PROP", async () => {
    const sim = await yard();
    const shot = (x: number) => pelletPath(sim, [x, EYE_Y, 0], NORTH, bodyAt9, "none", { rule: rifle });
    const m = d.wallbang.damageMult;
    const two = shot(0); // two wooden shelves
    expect(two.hits.map((h) => [h.id, +h.mult.toFixed(6)])).toEqual([[7, +(m * m).toFixed(6)]]);
    expect([two.surfaces, two.wall, two.ops]).toEqual([2, null, []]); // no holes in props
    expect(shot(10).hits.map((h) => +h.mult.toFixed(6))).toEqual([m]); // the sofa
    for (const x of [5, 15]) {
      const stopped = shot(x); // the fridge; the classless box
      expect([x, stopped.hits, +stopped.wall!.toFixed(6)]).toEqual([x, [], 2.8]);
    }
  });

  it("count toward the two surfaces with panels: two shelves and then a wall stop it at the wall, three shelves at the third", async () => {
    const sim = await yard();
    const shot = (x: number) => pelletPath(sim, [x, EYE_Y, 0], NORTH, bodyAt9, "none", { rule: rifle });
    const wall = shot(20);
    expect([wall.hits, wall.surfaces, +wall.wall!.toFixed(6)]).toEqual([[], 2, 6.9]); // the wall's face, one surface too many
    const three = shot(25);
    expect([three.hits, three.surfaces, +three.wall!.toFixed(6)]).toEqual([[], 2, 6.8]);
    // Without a panel rule (panels stop it), props still go by the same rule.
    const plain = pelletPath(sim, [0, EYE_Y, 0], NORTH, bodyAt9, "none");
    expect(plain.hits.map((h) => h.id)).toEqual([7]);
  });

  it("are solid to bodies and to sight", async () => {
    const sim = await yard();
    // Sight (marks, lasers, the knife's line) stops at the first shelf's face.
    expect(+raycastLevel(sim, [0, EYE_Y, 0], NORTH, 20)!.t.toFixed(6)).toBe(2.8);
    // A body walking north into the shelf stops in front of it.
    const ctrl = sim.addPlayer("walker", "sledge");
    const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
    sim.teleport(pawn.id, 0, 0, 0, 0, Stance.Stand);
    for (let seq = 1; seq <= 128; seq++) sim.step(new Map([[ctrl.id, { seq, forward: 1, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0 }]]));
    expect(pawn.state.z).toBeGreaterThan(-2.8 + 0.2);
  });

  it("decide the same way on every machine: two sims, the same pellets", async () => {
    const [a, b] = [await yard(), await yard()];
    for (const x of [0, 5, 10, 15, 20, 25]) {
      const run = (sim: Sim) => pelletPath(sim, [x, EYE_Y, 0], NORTH, bodyAt9, "none", { rule: rifle });
      expect(run(b)).toEqual(run(a));
    }
  });

  it("a prop class must be one of data/destruction.json's, on a PROP", () => {
    const def = levelSchema.parse({
      id: "bad",
      name: "Bad",
      spawns: [{ id: "s", pos: [0, 0, 5], yawDeg: 0 }],
      solids: [
        { id: "floor", center: [0, -0.25, 0], size: [20, 0.5, 20], surface: "HARD_FLOOR" },
        { id: "odd", center: [0, 1, -3], size: [1, 2, 1], surface: "PROP", prop: "glass" },
        { id: "wallprop", center: [3, 1, -3], size: [1, 2, 1], surface: "HARD_WALL", prop: "wood" },
      ],
    });
    const problems = crossFileProblems({ ...data, levels: new Map([["bad", def]]) }).join("\n");
    expect(problems).toMatch(/solid "odd": prop class "glass" isn't in .* props\.classes/);
    expect(problems).toMatch(/solid "wallprop" has a prop class but is a HARD_WALL/);
  });
});
