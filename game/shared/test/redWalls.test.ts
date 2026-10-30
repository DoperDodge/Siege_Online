// Red walls (match/DESIGN.md §6): in prep a defender can't leave the building zones; attackers, and everyone once
// they come down, can. On the Movement Lab with a building zone added, so the walls are plain to see.
import { describe, expect, it } from "vitest";
import { Btn, insideAny, loadGameData, Sim, zoneBoxes, type LevelDef } from "../src/index.js";
import { run, teleport } from "./helpers.js";

const data = loadGameData();
const base = data.levels.get("movement_lab")!;
/** A "building" around the start spot (x −3..3, z 9..15) and one in front of the 0.9 m vault block (z 2.2..6). */
const level: LevelDef = {
  ...base,
  id: "red_walls",
  zones: [
    { id: "building:a", kind: "building", boxes: [{ center: [0, 1.5, 12], size: [6, 3, 6], yawDeg: 0 }] },
    { id: "building:b", kind: "building", boxes: [{ center: [-6, 1.5, 4.1], size: [4, 3, 3.8], yawDeg: 0 }] },
  ],
};
const make = () => Sim.create(level.id, { ...data, levels: new Map(data.levels).set(level.id, level) });

describe("zones", () => {
  it("a point is inside a box, on its edge, or outside; a turned box is turned back", () => {
    const boxes = zoneBoxes(level, "building");
    expect(insideAny(boxes, 0, 0.1, 12)).toBe(true);
    expect(insideAny(boxes, 3, 0.1, 9)).toBe(true);
    expect(insideAny(boxes, 0, 0.1, 8.9)).toBe(false);
    expect(insideAny(boxes, 0, 3.2, 12)).toBe(false);
    const turned = zoneBoxes({ ...level, zones: [{ id: "t", kind: "building", boxes: [{ center: [0, 0, 0], size: [4, 2, 1], yawDeg: 90 }] }] }, "building");
    // Turned 90°, the long side runs along z.
    expect([insideAny(turned, 0, 0, 1.9), insideAny(turned, 1.9, 0, 0)]).toEqual([true, false]);
  });
});

describe("red walls", () => {
  it("stop a defender walking out of the building; an attacker walks on; down, they stop nobody", async () => {
    const sim = await make();
    const def = sim.addPlayer("def", "mute");
    const atk = sim.addPlayer("atk", "sledge");
    sim.matchRules.redWalls = true;
    teleport(sim, def, 0, 0, 12);
    teleport(sim, atk, 1.5, 0, 12);
    for (const c of [def, atk]) run(sim, c, { forward: 1 }, 2);
    const [d, a] = [def, atk].map((c) => sim.pawns.get(c.possessedPawnId)!.state);
    expect(d.z).toBeGreaterThan(8.9);
    expect(d.z).toBeLessThan(9.3);
    expect(sim.insideBuilding(d.x, d.y, d.z)).toBe(true);
    expect(a.z).toBeLessThan(7.5);
    sim.matchRules.redWalls = false;
    run(sim, def, { forward: 1 }, 1);
    expect(sim.pawns.get(def.possessedPawnId)!.state.z).toBeLessThan(7);
  });

  it("keep a vault that would land outside from starting; one that lands inside goes", async () => {
    const sim = await make();
    const def = sim.addPlayer("def", "mute");
    sim.matchRules.redWalls = true;
    teleport(sim, def, -6, 0, 3.2);
    run(sim, def, { buttons: Btn.Vault }, 1.5);
    const s = sim.pawns.get(def.possessedPawnId)!.state;
    expect(s.z).toBeGreaterThan(2.2);
    sim.matchRules.redWalls = false;
    run(sim, def, {}, 0.1);
    run(sim, def, { buttons: Btn.Vault }, 1.5);
    expect(sim.pawns.get(def.possessedPawnId)!.state.z).toBeLessThan(1.8);
  });

  it("stop a body in the air outright: a fall held back doesn't gather speed, and it drops from rest once they're down", async () => {
    const sim = await make();
    const def = sim.addPlayer("def", "mute");
    sim.matchRules.redWalls = true;
    // Just outside building a and 1.5 m up: every move it makes (the fall too) is undone, so it hangs there.
    sim.teleport(def.possessedPawnId, 0, 1.5, 8.5, 0);
    const s = sim.pawns.get(def.possessedPawnId)!.state;
    const y = s.y;
    run(sim, def, { forward: 1 }, 0.5);
    expect([s.vx, s.vy, s.vz, s.y]).toEqual([0, 0, 0, y]);
    sim.matchRules.redWalls = false;
    run(sim, def, {}, 1.5);
    expect([s.grounded, +s.y.toFixed(1)]).toEqual([true, 0]);
  });
});
