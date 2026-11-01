// Dokkaebi's upload is timed by the room's ticks (the review, Phase 8 M12): the room runs her upload again for every
// catch-up step it takes for anyone, and it used to count each of those as a tick, so another player's uplink hiccups
// made the 7 s upload finish early; and a catch-up step for someone else read as her letting go of Fire.
import { describe, expect, it } from "vitest";
import { Btn, Hand, heartOf, ticks } from "../src/index.js";
import { scene } from "./interactions/harness.js";

describe("Dokkaebi's upload and other players' catch-up steps", () => {
  it("takes its whole time while a third player's inputs arrive in bursts", async () => {
    const s = await scene(["dokkaebi", "mute", "sledge"], "gadget_lab");
    s.park();
    s.teleport(1, 0, 0, 12);
    s.teleport(0, 0, 0, 18);
    s.room.spot(s.body(1).id, 60);
    const look = s.aimAt(0, heartOf(s.sim, s.body(1)));
    s.handOut(0, Hand.Ability, look);
    const t = s.sim.data.gadgets.get("jegeo_payload")!.jegeo!;
    const done = () => s.clients[0].events.some((e) => e.kind === "jegeo" && e.stage === 1);
    s.press(0, Btn.Fire, look);
    expect(s.clients[0].events.some((e) => e.kind === "jegeo" && e.stage === 0)).toBe(true);
    const from = s.sim.tick;
    // Sledge's uplink: 12 ticks held, then all at once, again and again (the room catches up a tick at a time).
    let n = 0;
    while (!done() && n < ticks(t.uploadS) + 64) {
      s.clients[2].hold = n % 24 < 12;
      s.wait(1);
      n++;
    }
    s.clients[2].hold = false;
    expect(done()).toBe(true);
    expect(s.sim.tick - from).toBeGreaterThanOrEqual(ticks(t.uploadS) - 2);
  });
});
