// Reinforcing a wall section crushes what's on that section and the devices at its foot (Phase 8 M3, M6), and only
// those (the review, M12): a camera on the wall's other section stays, and a grenade resting at the foot, its fuse
// running, or a smoke cloud there isn't crushed (as a blast spares a cloud).
import { describe, expect, it } from "vitest";
import { Btn, GFlag } from "../src/index.js";
import { scene } from "./interactions/harness.js";

describe("reinforcing one section of a wall", () => {
  it("leaves the other section's camera, a frag at the foot (it still goes off) and a smoke cloud alone", async () => {
    const s = await scene(["sledge", "mute"]);
    s.park();
    const entry = s.sim.level.panels.byId.get("reinforce_2")!;
    const panel = entry.panel;
    const d = s.sim.data.gadgets.get("bulletproof_camera")!;
    // The wall runs x −2.5…2.5 at z −6 (its face toward +z at −5.9): Mute reinforces the right section (x > 0).
    const left = s.put("bulletproof_camera", 1, [-1.8, 1.5, -5.9 + d.sizeM[2] / 2], { yaw: Math.PI, flags: 0, panel: panel.spec.index });
    const right = s.put("bulletproof_camera", 1, [1.8, 1.5, -5.9 + d.sizeM[2] / 2], { yaw: Math.PI, flags: 0, panel: panel.spec.index });
    const frag = s.put("frag", 0, [1.2, 0.06, -5.75], { fuseEnd: s.sim.tick + 20 * 64 });
    const smoke = s.put("smoke", 0, [0.8, 0.06, -5.7], { flags: GFlag.OnFloor | GFlag.Active, fuseEnd: s.sim.tick + 20 * 64 });
    s.teleport(1, 1.6, 0, -5.0, 0);
    s.clients[1].cmd = { buttons: Btn.Interact };
    for (let i = 0; i < 8 * 64 && panel.reinforced === 0; i++) s.tick();
    s.clients[1].cmd = {};
    s.wait(2);
    expect(panel.reinforced).not.toBe(0);
    const flags = (id: number) => s.sim.gadgets.get(id)?.flags;
    expect([(flags(right.id) ?? 0) & GFlag.Broken, (flags(left.id) ?? -1) & GFlag.Broken]).toEqual([GFlag.Broken, 0]);
    expect([s.sim.gadgets.get(frag.id)?.id, s.sim.gadgets.get(smoke.id)?.id]).toEqual([frag.id, smoke.id]);
  });
});
