// Sledge's hammer and the room's rewind (the review, Phase 8 M12): a blow is judged against bodies as he saw them, and
// charged there; the simulation (predicted) only charges the level, panels and gadgets in reach. Before, it asked
// where bodies were on the server now, and a body that had just stepped away took no blow the swinger saw land.
import { describe, expect, it } from "vitest";
import { ATTACK, Btn, PawnMode, ticks, type Vec3 } from "../src/index.js";
import { scene, type Scene } from "./interactions/harness.js";

const hammer = (s: Scene) => {
  const u = s.sim.data.gadgets.get("breaching_hammer")!.use;
  if (u.kind !== "swing") throw new Error("the hammer is swung");
  return u;
};

/** Sledge (client 0) takes his hammer out (Z) looking at `at` and starts one swing. */
function swing(s: Scene, at: Vec3) {
  const aim = s.aimAt(0, at);
  s.press(0, Btn.Ability, aim);
  s.wait(ticks(s.sim.data.gadgetRules.equipS) + 2);
  s.press(0, Btn.Fire, aim);
  return aim;
}

describe("the hammer against bodies and drones (rewound, charged by the room)", () => {
  it("a blow lands on a body where Sledge saw it, though it stepped away on the server just before: a kill, 2 charges", async () => {
    const s = await scene(["sledge", "mute"], "gadget_lab");
    s.park();
    s.teleport(1, 0, 0, 13);
    s.teleport(0, 0, 0, 14.2);
    const before = s.body(0).state.g2;
    swing(s, [0, 1.2, 13]);
    // Two ticks before the blow lands (the press took one), Mute is 2.5 m aside on the server, not yet on Sledge's screen.
    s.wait(Math.max(0, ticks(hammer(s).hitS) - 4));
    s.sim.teleport(s.body(1).id, 2.5, 0, 13, 0);
    s.wait(12);
    expect(s.body(1).state.mode).toBe(PawnMode.Dead);
    expect(before - s.body(0).state.g2).toBe(hammer(s).killCharges);
  });

  it("a blow on a teammate's drone destroys it for one charge", async () => {
    const s = await scene(["sledge", "mute", "thermite"], "gadget_lab");
    s.park();
    s.room.spawnPilot(s.clients[2].id, null, 0, ATTACK);
    s.room.rosterChanged();
    s.wait(8);
    const drone = s.sim.dronesOf(s.ctrlOf(2)).find((p) => p.state.mode === PawnMode.Walk)!;
    s.teleport(0, 0, 0, 14);
    s.sim.placeDrone(drone.id, 0, 0.02, 13.3, 0);
    s.wait(8);
    const before = s.body(0).state.g2;
    swing(s, [drone.state.x, drone.state.y + 0.06, drone.state.z]);
    s.wait(ticks(hammer(s).swingS) + 4);
    expect(drone.state.mode).toBe(PawnMode.Dead);
    expect(before - s.body(0).state.g2).toBe(1);
  });
});
