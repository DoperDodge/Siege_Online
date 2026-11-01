// Dismissing Dokkaebi's call (Interact held) comes before reinforcing (gadgets/DESIGN.md §2): the room sets `ringing` on
// the called player's body, so his simulation doesn't start a reinforcement with the same press (the review, M12).
import { describe, expect, it } from "vitest";
import { Btn, DeployKind, Hand, heartOf, ticks } from "../src/index.js";
import { scene } from "./interactions/harness.js";

describe("dismissing Dokkaebi's call at a reinforceable wall", () => {
  it("holding F dismisses the call and starts no reinforcement", async () => {
    const s = await scene(["dokkaebi", "mute"], "gadget_lab");
    s.park();
    const wall = s.panel("reinforce_2").panel;
    // Mute facing the reinforceable wall (its face at z −5.9) where he could reinforce; Dokkaebi 6 m behind him.
    s.teleport(1, 1.6, 0, -5.0, 0);
    s.teleport(0, 1.6, 0, 1.0, 0);
    s.room.spot(s.body(1).id, 60);
    const look = s.aimAt(0, heartOf(s.sim, s.body(1)));
    s.handOut(0, Hand.Ability, look);
    s.press(0, Btn.Fire, look);
    s.wait(2);
    expect(s.body(1).state.ringing).toBe(true);
    const t = s.sim.data.gadgets.get("jegeo_payload")!.jegeo!;
    s.clients[1].cmd = { buttons: Btn.Interact };
    let reinforcing = false;
    for (let i = 0; i < ticks(t.dismissS) + 4; i++) {
      s.wait(1);
      reinforcing ||= s.body(1).state.deployKind === DeployKind.Reinforce;
    }
    s.clients[1].cmd = {};
    s.wait(4);
    expect(reinforcing).toBe(false);
    expect(s.clients[0].events.some((e) => e.kind === "jegeo" && e.stage === 2)).toBe(true);
    expect([s.body(1).state.ringing, wall.reinforced]).toEqual([false, 0]);
  });
});
