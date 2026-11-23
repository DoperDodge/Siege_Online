// The defenders' camera list is the level's, then the Armoured Cameras, then Twain's idle shells (Phase 8 M10): a
// camera placed mid-round shifts the shells' numbers, and someone watching one stays on it (the review, M12), as the
// controller remembers the entry it watches.
import { describe, expect, it } from "vitest";
import { Btn, DEFENSE } from "../src/index.js";
import { scene } from "./interactions/harness.js";

describe("watching Twain's shell camera when a Armoured Camera goes up", () => {
  it("the view stays on the shell's camera though its number moves", async () => {
    const s = await scene(["cleave", "twain", "lull"], "gadget_lab");
    s.park();
    s.sim.matchRules.cameras = true;
    const shells = () => s.sim.shellCams();
    expect(shells().length).toBe(1);
    // Lull opens the cameras and leans left from the first: round to the last, the shell's.
    s.press(2, Btn.Observe);
    s.clients[2].cmd = { lean: -1 };
    s.wait(1);
    s.clients[2].cmd = {};
    s.wait(3);
    const ctrl = s.ctrlOf(2);
    const before = s.sim.camCount();
    expect(ctrl.cam).toBe(before);
    s.put("armoured_camera", 2, [0, s.sim.data.gadgets.get("armoured_camera")!.sizeM[1] / 2, 20], { team: DEFENSE });
    s.wait(4);
    expect(s.sim.camCount()).toBe(before + 1);
    expect(ctrl.cam).toBe(before + 1); // still the shell's (one further on), not the new camera
    expect(ctrl.camEntry).toBe(shells()[0].id);
  });
});
