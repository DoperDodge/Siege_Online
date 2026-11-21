// Relay picks the defender on her tablet (Ulo's request after Phase 10): Fire sends the Ringer to the one
// she picked, wherever she's looking, if he's identified; not to one nobody has identified; a dead defender's phone
// picked is hacked instead.
import { describe, expect, it } from "vitest";
import { Btn, Hand } from "../src/index.js";
import { scene } from "./interactions/harness.js";

describe("Relay's tablet pick", () => {
  it("sends to the identified defender she picked, whatever she's looking at; not to one nobody identified", async () => {
    const s = await scene(["relay", "lull"], "gadget_lab");
    s.park();
    s.teleport(1, 1.6, 0, -2.0, 0);
    s.teleport(0, 1.6, 0, 1.0, 0);
    // Looking away from him (behind her): her aim isn't on him.
    const away = { yaw: Math.PI, pitch: 0 };
    s.handOut(0, Hand.Ability, away);
    const target = s.body(1).id;
    // Picked but not identified: nothing goes.
    s.room.onRingerPick(s.clients[0].id, { kind: "defender", pawnId: target });
    s.press(0, Btn.Fire, away);
    s.wait(3);
    expect(s.body(1).state.ringing).toBe(false);
    expect(s.clients[0].events.some((e) => e.kind === "ringer" && e.stage === 0)).toBe(false);
    // Identified (a drone's scan or a ping): it goes to him, her back still turned.
    s.room.spot(target, 60);
    s.press(0, Btn.Fire, away);
    s.wait(3);
    expect(s.body(1).state.ringing).toBe(true);
    expect(s.clients[0].events.some((e) => e.kind === "ringer" && e.stage === 0 && e.pawnId === target)).toBe(true);
  });
});
