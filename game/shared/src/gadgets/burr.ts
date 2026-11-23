// Thistle's Burr mines (Phase 8 M10; research/operators/lesion.md; data/gadgets/burr_mine.json `burr`). The simulation keeps
// what a body predicts (a needle in it stops its sprint; pulling it is an Interact hold, sim.ts holdNeedle); the
// server sets the mines off and bites the needled (gadgets/serve.ts sting, needles).
import type { GameData } from "../data/load.js";
import type { GadgetData } from "../data/schemas.js";

export type BurrData = NonNullable<GadgetData["burr"]>;

/** The Burr mines' numbers (the one gadget with `burr`), or null in data without them. */
export function burrData(data: GameData): BurrData | null {
  for (const g of data.gadgets.values()) if (g.burr) return g.burr;
  return null;
}
