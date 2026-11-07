// The bot soak, short (Phase 9 M10; PLAN §19): a round of 5v5 bots on two of Oregon's sites with a watching client — no
// crash, no desync, no bot stuck. `npm run soak` plays every site for longer.
import { describe, expect, it } from "vitest";
import { soak } from "./soak.js";

describe("bot soak (Phase 9 M10)", () => {
  it.each(["SITE_LAUNDRY", "SITE_DORMS"])("a round on %s: nothing crashes, the watcher never disagrees with the server, no bot is stuck", async (site) => {
    const r = await soak(site, 1, 11);
    const why = JSON.stringify({ crash: r.crash, desyncs: r.desyncs, stuck: r.stuck, rounds: r.rounds });
    expect(r.crash, why).toBeNull();
    expect(r.rounds, why).toBe(1);
    expect(r.desyncs, why).toEqual({ panel: 0, gadget: 0, errors: [] });
    expect(r.stuck, why).toEqual([]);
  }, 300000);
});
