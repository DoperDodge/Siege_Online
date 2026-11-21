// Patch's feeds (Ulo's test, Phase 8): on her Crossover, a lean goes on past her drones to the cameras she hacked, round
// all of them (a second hacked camera too), and on past the last one back to her drone; Observe on a camera goes back to
// her body. On the Gadget Lab: Patch is client 0, Lull client 1.
import { describe, expect, it } from "vitest";
import { Btn, kindOf, PawnKind, ticks, type Pawn, type Vec3 } from "../src/index.js";
import { scene, type Scene } from "./interactions/harness.js";

/** Patch throws a Crossover (Z) from 4 m behind (x, z) and drives it, put down there facing `yawDeg`. */
function crossoverAt(s: Scene, x: number, z: number, yawDeg = 0): Pawn {
  s.teleport(0, x, 0, z + 4, yawDeg);
  s.press(0, Btn.Ability);
  s.wait(4);
  const k = s.sim.pawns.get(s.ctrlOf(0).drone)!;
  expect([k.kind, k.crossover]).toEqual([PawnKind.Drone, true]);
  s.sim.placeDrone(k.id, x, 0.02, z, yawDeg);
  s.wait(8);
  return k;
}

/** Patch, on her Crossover, looks at `at` and holds Fire for a hack's time. */
function hack(s: Scene, at: Vec3) {
  const k = s.sim.pawns.get(s.ctrlOf(0).drone)!;
  const eye: Vec3 = [k.state.x, k.state.y + 0.1, k.state.z];
  const view = s.look(eye, at);
  s.clients[0].cmd = { ...view };
  s.wait(4);
  s.clients[0].cmd = { ...view, buttons: Btn.Fire };
  s.wait(ticks(s.sim.data.gadgets.get("crossover_drone")!.crossover!.hackS) + 8);
  s.clients[0].cmd = { ...view };
  s.wait(2);
}

/** Patch leans once and lets go (the harness's `press` would keep the lean held). */
const lean = (s: Scene, dir: -1 | 1) => {
  s.clients[0].cmd = { lean: dir };
  s.wait(1);
  s.clients[0].cmd = {};
  s.wait(3);
};

describe("Patch's feeds: her drones, then the cameras she hacked", () => {
  it("a lean goes from her Crossover to each hacked camera in turn and back round to the Crossover; Observe on a camera goes to her body", async () => {
    const s = await scene(["patch", "lull"], "gadget_lab");
    s.park();
    s.sim.matchRules.cameras = true;
    // Two cameras to hack: the level's (CAM_LAB, number 0) and a Armoured Camera of Lull's (number 1).
    const level = s.sim.level.def.cameras[0];
    const bp = s.put("armoured_camera", 1, [0, s.sim.data.gadgets.get("armoured_camera")!.sizeM[1] / 2, 13]);
    expect(bp.kind).toBe(kindOf("armoured_camera"));
    const k = crossoverAt(s, 0, 16);
    hack(s, bp.pos);
    s.sim.placeDrone(k.id, level.pos[0], 0.02, level.pos[2] - 4, 180);
    s.wait(8);
    hack(s, level.pos);
    expect([s.sim.camTeam(0), s.sim.camTeam(1)]).toEqual([0, 0]);
    const ctrl = s.ctrlOf(0);
    // On the Crossover (her only drone out): right goes to the first hacked camera, right again to the second (Ulo: "if
    // you hack a second cam, you can't view it"), and right once more back to the Crossover ("you can't switch back").
    expect([ctrl.drone, ctrl.cam]).toEqual([k.id, 0]);
    lean(s, 1);
    expect([ctrl.drone, ctrl.cam]).toEqual([0, 1]);
    lean(s, 1);
    expect([ctrl.drone, ctrl.cam]).toEqual([0, 2]);
    lean(s, 1);
    expect([ctrl.drone, ctrl.cam]).toEqual([k.id, 0]);
    // Left from the Crossover wraps to the last camera; left again, the first.
    lean(s, -1);
    expect([ctrl.drone, ctrl.cam]).toEqual([0, 2]);
    lean(s, -1);
    expect([ctrl.drone, ctrl.cam]).toEqual([0, 1]);
    // Her ability key on a camera throws nothing (her second Crossover stays in hand).
    const out = s.sim.dronesOf(ctrl).filter((p) => p.state.mode !== 0).length;
    s.press(0, Btn.Ability);
    s.wait(4);
    expect([ctrl.cam, s.sim.dronesOf(ctrl).filter((p) => p.state.mode !== 0).length]).toEqual([1, out]);
    // Observe on a camera: back to her body, as from a drone.
    s.press(0, Btn.Observe);
    expect([ctrl.drone, ctrl.cam]).toEqual([0, 0]);
  });
});
