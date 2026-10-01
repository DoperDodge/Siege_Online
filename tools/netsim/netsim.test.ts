// The netsim harness as a regression test (PLAN §17 Phase 2 / §19): 10 clients at 100 ms round trip with
// jitter, stalls and clock drift. Short runs here; `npm run netsim` runs longer ones.
import { describe, expect, it } from "vitest";
import { runNetsim } from "./netsim.js";

describe("netsim: 10 clients, 100 ms round trip, jitter, stalls, drift", () => {
  it("spread out (no contact): no desyncs, nothing dropped, only the expected corrections", async () => {
    const r = await runNetsim({ seconds: 10, spread: true, crowd: false, seed: 2 });
    expect(r.desyncs).toEqual([]);
    expect(r.room.droppedInputs).toBe(0);
    for (const c of r.perClient) {
      expect(c.resyncs, c.name).toBe(0);
      // The join (and the teleport, usually in the same snapshot). Stalls cost none: the server holds a
      // player still until their late inputs arrive, then catches up. A little slack for the known
      // ~1e-4 m divergence at wall corners.
      expect(c.corrections, c.name).toBeLessThanOrEqual(3);
      expect(c.downKbps, c.name).toBeLessThan(40); // payload; well under 64 kbps with headers
      expect(c.rttMs, c.name).toBeGreaterThan(95);
    }
  }, 60000);

  it("crowded (constant contact): still no desyncs, resyncs or dropped inputs", async () => {
    const r = await runNetsim({ seconds: 10, seed: 3 });
    expect(r.desyncs).toEqual([]);
    expect(r.room.droppedInputs).toBe(0);
    for (const c of r.perClient) {
      expect(c.resyncs, c.name).toBe(0);
      expect(c.corrections / 10, c.name).toBeLessThan(5); // per second; bumping into people mispredicts
    }
    expect(r.serverTickMs.mean).toBeLessThan(5); // PLAN §18 budget
  }, 60000);
});
