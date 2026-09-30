import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadGameData, missingUnverifiedPaths, rawData } from "../src/index.js";

const csvIds = readFileSync(new URL("../../../research/weapons.csv", import.meta.url), "utf8")
  .split("\n")
  .slice(1)
  .map((line) => line.split(",")[0])
  .filter(Boolean);

describe("data files", () => {
  const data = loadGameData();

  it("all data files validate", () => {
    expect(data.operators.size).toBe(12);
    expect(data.levels.has("movement_lab")).toBe(true);
  });

  it("every _unverified marker points at a real field", () => {
    expect(missingUnverifiedPaths(rawData.movement, data.movement._unverified)).toEqual([]);
    expect(missingUnverifiedPaths(rawData.hitboxes, data.hitboxes._unverified)).toEqual([]);
  });

  it("operator ratings match the official pages (research/core_mechanics.md §1.3)", () => {
    const expected: Record<string, [number, number]> = {
      brava: [1, 3],
      fuze: [3, 1],
      thermite: [2, 2],
      striker: [2, 2],
      dokkaebi: [1, 3],
      sledge: [2, 2],
      sentry: [2, 2],
      skopos: [1, 3],
      mira: [3, 1],
      lesion: [2, 2],
      pulse: [1, 3],
      mute: [2, 2],
    };
    for (const [id, [health, speed]] of Object.entries(expected)) {
      const op = data.operators.get(id)!;
      expect([op.healthRating, op.speedRating], id).toEqual([health, speed]);
    }
  });

  it("every loadout weapon exists in research/weapons.csv", () => {
    for (const op of data.operators.values()) {
      for (const w of [...op.loadout.primaries, ...op.loadout.secondaries]) expect(csvIds, `${op.id}: ${w}`).toContain(w);
    }
  });

  it("gadget-kit operators pick two distinct gadgets from a 7-gadget pool; Skopós has two pawns", () => {
    for (const id of ["striker", "sentry"]) {
      const kit = data.operators.get(id)!.loadout.gadgetKit!;
      expect(kit).toMatchObject({ picks: 2, distinct: true });
      expect(kit.pool).toHaveLength(7);
    }
    expect(data.operators.get("skopos")!.pawns).toBe(2);
  });
});
