// Lesion's Gu mines (Phase 8 M10; research/operators/lesion.md; data/gadgets/gu_mine.json `gu`). The simulation keeps
// what a body predicts (a needle in it stops its sprint; pulling it is an Interact hold, sim.ts holdNeedle); the
// server sets the mines off and bites the needled (gadgets/serve.ts sting, needles).
import type { GameData } from "../data/load.js";
import type { GadgetData } from "../data/schemas.js";

export type GuData = NonNullable<GadgetData["gu"]>;

/** The Gu mines' numbers (the one gadget with `gu`), or null in data without them. */
export function guData(data: GameData): GuData | null {
  for (const g of data.gadgets.values()) if (g.gu) return g.gu;
  return null;
}
