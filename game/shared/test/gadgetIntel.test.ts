// Pinging gadgets (Phase 8 M3, gadgets/DESIGN.md §12): a ping on an enemy gadget marks that gadget (its kind goes with
// the ping, for its icon); your own side's gadgets don't stop your view.
import { describe, expect, it } from "vitest";
import { Btn, kindOf, type GameEvent } from "../src/index.js";
import { scene } from "./interactions/harness.js";

describe("pinging gadgets (Phase 8 M3)", () => {
  it("a ping on an enemy gadget is that gadget's (its kind with it); one on your own side's goes past it", async () => {
    const s = await scene(["sledge", "mute"], "gadget_lab");
    s.park();
    const pings = () => s.clients[0].events.filter((e): e is Extract<GameEvent, { kind: "ping" }> => e.kind === "ping");
    s.teleport(0, 2, 0, 19);
    const alarm = s.put("proximity_alarm", 1, [2, 0.05, 15]);
    s.press(0, Btn.Ping, s.aimAt(0, alarm.pos));
    expect(pings().map((e) => [e.gadget, e.pos])).toEqual([[kindOf("proximity_alarm"), alarm.pos]]);
    // His own Claymore where the alarm was: the ping goes past it, to the floor beyond (after its cooldown).
    s.room.onLabTool(s.clients[0].id, { kind: "clearGadgets" });
    const clay = s.put("claymore", 0, [2, 0.07, 15]);
    s.wait(40);
    s.press(0, Btn.Ping, s.aimAt(0, clay.pos));
    const last = pings().at(-1)!;
    expect(last.gadget).toBe(-1);
    expect(last.pos[2]).toBeLessThan(15);
  }, 60_000);
});
