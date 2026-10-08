// The Destruction Lab level (Phase 4): it loads, every destructible surface class is there, built as the
// right construction, and the platform's hatch and soft floor sit in holes in its deck.
import { describe, expect, it } from "vitest";
import { L_STEEL, raycastLevel, Sim } from "../src/index.js";

describe("the Destruction Lab level", () => {
  it("has every surface class as a panel, built as its construction", async () => {
    const sim = await Sim.create("destruction_lab");
    const kinds = Object.fromEntries(sim.level.panels.list.map((e) => [e.info.id, `${e.panel.spec.constructionId}${e.panel.reinforced ? " reinforced" : ""}${e.panel.empty ? " empty" : ""}`]));
    expect(kinds).toEqual({
      soft_studs: "soft_wall",
      soft_plain: "soft_wall_no_studs",
      semi: "semi_wall",
      reinforce_2: "reinforceable_wall",
      reinforce_3: "reinforceable_wall",
      reinforced: "reinforceable_wall reinforced",
      door_a: "barricade_door",
      door_b: "barricade_door empty",
      window_glass: "glass",
      window_barricade: "barricade_window",
      hatch: "hatch",
      soft_floor: "soft_floor",
    });
    const three = sim.level.panels.byId.get("reinforce_3")!.panel;
    expect(three.sectionCount).toBe(3);
    // The reinforced wall's steel stops 40 cm short of its 3 m top.
    const r = sim.level.panels.byId.get("reinforced")!.panel;
    expect(r.layers[L_STEEL]!.slice((r.h - 1) * r.w).every((c) => c === 0)).toBe(true);
    expect(r.layers[L_STEEL]![0]).toBe(1);
  });

  it("the platform's hatch and soft floor cover holes in its deck: below them is the ground", async () => {
    const sim = await Sim.create("destruction_lab");
    for (const [x, id] of [
      [10, "hatch"],
      [14.5, "soft_floor"],
    ] as const) {
      const hit = raycastLevel(sim, [x, 5, 8], [0, -1, 0], 10)!;
      expect(hit.panel?.entry.info.id).toBe(id);
      const e = sim.level.panels.byId.get(id)!;
      for (let layer = 0; layer < 3; layer++) sim.level.panels.apply(e.panel.spec.index, { kind: "cut", layer, shape: { kind: "rect", u0: 0, v0: 0, u1: 100, v1: 100 }, hard: false });
      expect(raycastLevel(sim, [x, 5, 8], [0, -1, 0], 10)!.t).toBeCloseTo(5, 6); // the ground
    }
  });
});
