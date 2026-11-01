// Skopós's gadgets are one pool for both shells (research/operators/skopos.md; the review, Phase 8 M12): the shell
// she's in holds them, the idle one none, and they go with her when she swaps.
import { describe, expect, it } from "vitest";
import { Btn, Sim, ticks } from "../src/index.js";
import { input, run } from "./helpers.js";

describe("Skopós's gadget pool", () => {
  it("is in the shell she's in, none in the other, and moves with her when she swaps", async () => {
    const sim = await Sim.create("movement_lab");
    const c = sim.addPlayer("skopos", "skopos");
    const [first, second] = sim.bodyIds(c).map((id) => sim.pawns.get(id)!);
    expect(c.possessedPawnId).toBe(first.id);
    const stock = first.state.g1;
    expect(stock).toBeGreaterThan(0);
    expect([second.state.g1, second.state.g2]).toEqual([0, 0]);
    run(sim, c, {}, 0.5);
    // Z looks through the other shell; F swaps into it (its transfer and activation times).
    sim.step(new Map([[c.id, input({ buttons: Btn.Ability })]]));
    run(sim, c, {}, 0.1);
    sim.step(new Map([[c.id, input({ buttons: Btn.Interact })]]));
    const p = sim.data.operators.get("skopos")!.ability.params as { transferSeconds: number; activationSeconds: number };
    for (let i = 0; i < ticks(p.transferSeconds + p.activationSeconds) + 4; i++) sim.step(new Map([[c.id, input()]]));
    expect(c.possessedPawnId).toBe(second.id);
    expect([first.state.g1, second.state.g1]).toEqual([0, stock]);
  });
});
