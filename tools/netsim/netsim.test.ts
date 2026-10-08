// The netsim harness as a regression test (PLAN §17 Phase 2 / §19): 10 clients at 100 ms round trip with
// jitter, stalls and clock drift. Short runs here; `npm run netsim` runs longer ones.
import { describe, expect, it } from "vitest";
import { runHitreg, runNetsim } from "./netsim.js";

describe("netsim: 10 clients, 100 ms round trip, jitter, stalls, drift", () => {
  it("spread out (no contact): no desyncs, nothing dropped, only the expected corrections", async () => {
    const r = await runNetsim({ seconds: 10, spread: true, crowd: false, seed: 2 });
    expect(r.desyncs).toEqual([]);
    expect(r.room.droppedInputs).toBe(0);
    for (const c of r.perClient) {
      expect(c.resyncs, c.name).toBe(0);
      // Mispredictions: none expected (stalls cost none: the server holds a player still until their late
      // inputs arrive, then catches up). A little slack for the known ~1e-4 m divergence at wall corners.
      // The join, teleports, hits and respawns are the server's doing and counted apart (D-043).
      expect(c.corrections - c.forced, c.name).toBeLessThanOrEqual(2);
      expect(c.downKbps, c.name).toBeLessThan(40); // payload; well under 64 kbps with headers
      expect(c.rttMs, c.name).toBeGreaterThan(95);
    }
  }, 60000);

  it("a 300 ms stall while holding Fire (spraying, reloading, swapping) costs no misprediction", async () => {
    // The stall comes inside the first magazine (31 rounds at 670 rpm last 2.8 s), and the sprayer fires through it.
    const r = await runNetsim({ seconds: 10, spread: true, crowd: false, seed: 5, jitterMs: 10, sprayStall: { client: 0, atS: 1, ms: 300 } });
    expect(r.desyncs).toEqual([]);
    expect(r.room.droppedInputs).toBe(0);
    expect(r.sprayStallShots).toBeGreaterThanOrEqual(3);
    const sprayer = r.perClient[0];
    expect(sprayer.resyncs).toBe(0);
    expect(sprayer.corrections - sprayer.forced, "mispredictions").toBe(0);
  }, 60000);

  it("a fight (Phase 3 M11): two teams spray, down, revive and knife each other; no desyncs, inside the budgets", async () => {
    const r = await runNetsim({ seconds: 20, combat: true, seed: 4 });
    expect(r.desyncs).toEqual([]);
    expect(r.room.droppedInputs).toBe(0);
    expect(r.combat.downs).toBeGreaterThanOrEqual(5);
    expect(r.combat.reviveStarts).toBeGreaterThanOrEqual(1); // (in the open, most are cut short)
    expect(r.combat.knifeKills).toBeGreaterThanOrEqual(1);
    expect(r.combat.kills).toBeGreaterThan(r.combat.knifeKills);
    for (const c of r.perClient) {
      expect(c.resyncs, c.name).toBe(0);
      expect(c.downKbps, c.name).toBeLessThan(64); // PLAN §18
      expect((c.corrections - c.forced) / 20, c.name).toBeLessThan(5); // per second, as crowded: bumping mispredicts
    }
    expect(r.serverTickMs.mean).toBeLessThan(5);
  }, 90000);

  it("crowded (constant contact): still no desyncs, resyncs or dropped inputs", async () => {
    const r = await runNetsim({ seconds: 10, seed: 3 });
    expect(r.desyncs).toEqual([]);
    expect(r.room.droppedInputs).toBe(0);
    for (const c of r.perClient) {
      expect(c.resyncs, c.name).toBe(0);
      expect((c.corrections - c.forced) / 10, c.name).toBeLessThan(5); // per second; bumping into people mispredicts
    }
    expect(r.serverTickMs.mean).toBeLessThan(5); // PLAN §18 budget
  }, 60000);
});

describe("netsim hitreg: a still shooter at 100 ms round trip aims at heads as it draws them (Phase 3 M0)", () => {
  // Four targets cycle strafing, sprinting, lean and crouch spam, crawling prone and vaulting.
  it("no jitter: the server judges every shot exactly as the shooter's own ray on what it drew", async () => {
    const r = await runHitreg({ seconds: 15, jitterMs: 0 });
    expect(r.shots).toBeGreaterThan(30);
    expect(r.judged).toBe(r.shots);
    expect(r.agree, r.disagreements.join("\n")).toBe(r.shots);
    expect(r.headHits / r.shots).toBeGreaterThan(0.85);
    // Every head the shooter hit on screen is a headshot on the server.
    expect(r.headSeen).toBeGreaterThan(20);
    expect(r.headAgree).toBe(r.headSeen);
    // Phase 3 M6: the damage the server applies is what the shooter's view says, kills included.
    expect(r.damageAgree, r.disagreements.join("\n")).toBe(r.shots);
    expect(r.kills).toBeGreaterThan(r.shots * 0.8);
  }, 60000);

  it("10 ms jitter: at least 99 % of uncapped shots agree, and the 250 ms cap isn't reached", async () => {
    const r = await runHitreg({ seconds: 15, jitterMs: 10, seed: 4 });
    expect(r.judged).toBe(r.shots);
    expect(r.uncappedAgree / (r.judged - r.capped), r.disagreements.join("\n")).toBeGreaterThanOrEqual(0.99);
    expect(r.headAgreeUncapped / r.headSeenUncapped).toBeGreaterThanOrEqual(0.99);
    expect(r.over250).toBe(0);
    expect(r.rewindMs.max).toBeLessThanOrEqual(250);
  }, 60000);

  it("control: with rewinding off the same shots mostly miss the head", async () => {
    const r = await runHitreg({ seconds: 15, jitterMs: 10, seed: 4, maxRewindTicks: 0 });
    expect(r.headHits / r.shots).toBeLessThan(0.5);
  }, 60000);
});
