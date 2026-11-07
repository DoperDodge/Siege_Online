// Ulo's camera requests after Phase 8 (D-155): a camera flipped back to looks where its viewer left it; Observe opens
// the feed last watched; Skopós's idle shell is one of her feeds (her shell view, from which she swaps), reached with
// Observe and the lean as the cameras are, in place of its barrier's camera (which her teammates still watch).
import { describe, expect, it } from "vitest";
import { Btn, DEFENSE, DEG, PawnMode, SHELL_VIEW, Sim, ticks, type InputCmd } from "../src/index.js";
import { input } from "./helpers.js";
import { scene } from "./interactions/harness.js";

type Look = Partial<InputCmd> & { yawDeg?: number };

/** A defender (`op`) on Oregon with the match's cameras. */
async function oregon(op = "mute") {
  const sim = await Sim.create("oregon");
  sim.matchRules.cameras = true;
  const c = sim.addPlayer("def", op, 0, undefined, undefined, DEFENSE);
  const step = (cmd: Look = {}, n = 1) => {
    for (let i = 0; i < n; i++) sim.step(new Map([[c.id, input(cmd)]]));
  };
  step({}, 8);
  return { sim, c, step, cams: sim.level.def.cameras };
}

/** A key's press and release, looking `look`. */
function press(step: (cmd?: Look) => void, buttons: number, look: Look = {}) {
  step({ ...look, buttons });
  step(look);
}

describe("a camera keeps where you left it looking (D-155)", () => {
  it("flipped back to, a camera looks where it was left; the next opens its own way, not turned toward the last one's mouse", async () => {
    const { c, step, cams } = await oregon();
    press(step, Btn.Observe, { yawDeg: cams[0].yawDeg });
    expect(c.cam).toBe(1);
    // Turned 40° right and 20° down (60°/s: done well within 2 s).
    const look = { yawDeg: cams[0].yawDeg + 40, pitch: -20 * DEG };
    step(look, 128);
    const left = { yaw: c.camYaw, pitch: c.camPitch };
    expect((left.yaw - cams[0].yawDeg * DEG) / DEG).toBeCloseTo(40, 3);
    expect(left.pitch / DEG).toBeCloseTo(-20, 3);
    // On to the next, the mouse still where the first looked: it opens looking its own way, unturned.
    step({ ...look, lean: 1 });
    expect(c.cam).toBe(2);
    expect(c.camYaw).toBe(Math.fround(cams[1].yawDeg * DEG));
    // The page then looks where the new camera does (lab.ts); back to the first: exactly where it was left.
    step({ yawDeg: cams[1].yawDeg });
    step({ yawDeg: cams[1].yawDeg, lean: -1 });
    expect(c.cam).toBe(1);
    expect([c.camYaw, c.camPitch]).toEqual([left.yaw, left.pitch]);
  });

  it("Observe opens the camera last watched, as it was left; the first time, the first", async () => {
    const { sim, c, step, cams } = await oregon();
    expect(c.lastCam).toBe(0);
    press(step, Btn.Observe, { yawDeg: cams[0].yawDeg });
    step({ yawDeg: cams[0].yawDeg, lean: 1 });
    step({ yawDeg: cams[1].yawDeg });
    step({ yawDeg: cams[1].yawDeg, lean: 1 });
    expect(c.cam).toBe(3);
    step({ yawDeg: cams[2].yawDeg - 25 }, 96);
    const left = { yaw: c.camYaw, pitch: c.camPitch };
    expect(c.lastCam).toBe(sim.camKey(2));
    press(step, Btn.Observe);
    expect(c.cam).toBe(0);
    step({ forward: 1 }, 32);
    // (Checked on the press's tick: from the next, the page looks where the camera does and the mouse leads.)
    step({ buttons: Btn.Observe });
    expect(c.cam).toBe(3);
    expect([c.camYaw, c.camPitch]).toEqual([left.yaw, left.pitch]);
  });

  it("the camera last watched broken since: Observe opens the next working one after it", async () => {
    const { sim, c, step, cams } = await oregon();
    press(step, Btn.Observe, { yawDeg: cams[0].yawDeg });
    step({ yawDeg: cams[0].yawDeg, lean: -1 });
    expect(c.cam).toBe(cams.length);
    step({ yawDeg: cams[cams.length - 1].yawDeg });
    press(step, Btn.Observe);
    sim.matchRules.camsBroken = 1 << (cams.length - 1);
    press(step, Btn.Observe);
    expect(c.cam).toBe(1); // round the list from the broken last
  });

  it("each camera's view is remembered, the oldest dropped past the limit", async () => {
    const { c, step, cams } = await oregon();
    press(step, Btn.Observe, { yawDeg: cams[0].yawDeg });
    for (let i = 1; i < cams.length; i++) {
      step({ yawDeg: cams[i - 1].yawDeg, lean: 1 });
      step({ yawDeg: cams[i].yawDeg });
    }
    expect(c.camViews.map((v) => v.key)).toEqual(cams.map((_, i) => 2 * (i + 1)));
  });
});

describe("Skopós's idle shell is one of her feeds (D-155)", () => {
  it("in a match, after the last camera and before the first: Observe closes it and opens it again, and F swaps from it", async () => {
    const { sim, c, step, cams } = await oregon("skopos");
    const first = c.possessedPawnId;
    const other = sim.otherPawn(c.id)!;
    press(step, Btn.Observe, { yawDeg: cams[0].yawDeg });
    expect(c.cam).toBe(1);
    // Left from the first camera: her shell, the last of her feeds.
    step({ yawDeg: cams[0].yawDeg, lean: -1 });
    expect([c.cam, c.shellCam, sim.viewedPawnId(c.id)]).toEqual([0, true, other.id]);
    expect(c.lastCam).toBe(SHELL_VIEW);
    // Its view is the shell's own facing (the step turns the shell with the mouse after the first tick).
    step({ yawDeg: 25 }, 2);
    expect(other.state.yaw).toBeCloseTo(25 * DEG, 5);
    // Right from her shell: round to the first camera, and back.
    step({ yawDeg: 25, lean: 1 });
    expect([c.cam, c.shellCam]).toEqual([1, false]);
    step({ yawDeg: cams[0].yawDeg });
    step({ yawDeg: cams[0].yawDeg, lean: -1 });
    expect(c.shellCam).toBe(true);
    step({ yawDeg: 25 });
    // Observe: back to her body; again: her shell, the feed she was last on.
    press(step, Btn.Observe, { yawDeg: 25 });
    expect([c.cam, c.shellCam, sim.viewedPawnId(c.id)]).toEqual([0, false, first]);
    press(step, Btn.Observe, { yawDeg: 25 });
    expect([c.cam, c.shellCam]).toEqual([0, true]);
    // F swaps from it, as from her ability key's view; mid-swap the feeds' keys do nothing.
    press(step, Btn.Interact, { yawDeg: 25 });
    expect(c.swapPhase).toBe(1);
    step({ yawDeg: 25, lean: 1 });
    step({ yawDeg: 25 });
    press(step, Btn.Observe, { yawDeg: 25 });
    expect([c.cam, c.swapPhase, sim.viewedPawnId(c.id)]).toEqual([0, 1, other.id]);
    const params = sim.data.operators.get("skopos")!.ability.params;
    step({ yawDeg: 25 }, ticks(params.transferSeconds) + ticks(params.activationSeconds) + 4);
    expect([c.swapPhase, c.possessedPawnId]).toEqual([0, other.id]);
  });

  it("her ability key from a camera goes onto her shell, and again back to her body", async () => {
    const { sim, c, step, cams } = await oregon("skopos");
    press(step, Btn.Observe, { yawDeg: cams[0].yawDeg });
    step({ yawDeg: cams[0].yawDeg, lean: 1 });
    expect(c.cam).toBe(2);
    press(step, Btn.Ability, { yawDeg: cams[1].yawDeg });
    expect([c.cam, c.shellCam, sim.viewedPawnId(c.id)]).toEqual([0, true, sim.otherPawn(c.id)!.id]);
    press(step, Btn.Ability);
    expect([c.cam, c.shellCam, sim.viewedPawnId(c.id)]).toEqual([0, false, c.possessedPawnId]);
  });

  it("with no cameras (a lab), Observe opens her shell view and closes it; a lean stays on it", async () => {
    const sim = await Sim.create("movement_lab");
    const c = sim.addPlayer("skopos", "skopos");
    const step = (cmd: Look = {}, n = 1) => {
      for (let i = 0; i < n; i++) sim.step(new Map([[c.id, input(cmd)]]));
    };
    step({}, 8);
    expect(sim.matchRules.cameras).toBe(false);
    press(step, Btn.Observe);
    expect([c.cam, c.shellCam]).toEqual([0, true]);
    step({ lean: 1 });
    step({});
    expect([c.cam, c.shellCam]).toEqual([0, true]);
    press(step, Btn.Observe);
    expect(c.shellCam).toBe(false);
  });

  it("someone else with no shell and no cameras: Observe does nothing", async () => {
    const sim = await Sim.create("movement_lab");
    const c = sim.addPlayer("mute", "mute");
    sim.step(new Map([[c.id, input({ buttons: Btn.Observe })]]));
    sim.step(new Map([[c.id, input({})]]));
    expect([c.cam, c.shellCam, c.lastCam]).toEqual([0, false, 0]);
  });

  it("in a room: her own barrier's camera isn't one of hers (her shell view takes its place), a teammate's list keeps it; the client predicts it all", async () => {
    const s = await scene(["skopos", "mute"], "gadget_lab");
    s.park();
    // A match's cameras, on the room's simulation and each client's (a match's state tells clients so).
    for (const sim of [s.sim, ...s.clients.map((c) => c.session.sim!)]) sim.matchRules.cameras = true;
    s.wait(4);
    const barrier = s.sim.shellCams()[0];
    expect(barrier.owner).toBe(s.ctrlOf(0).id);
    const n = s.sim.camCount();
    expect(s.sim.shellCamAt(n - 1)?.id).toBe(barrier.id);
    const before = s.room.stats.mismatchCorrections;
    // Skopós: left from the first camera is her shell view, not her barrier's camera.
    s.press(0, Btn.Observe);
    expect(s.ctrlOf(0).cam).toBe(1);
    s.clients[0].cmd = { lean: -1 };
    s.wait(1);
    s.clients[0].cmd = {};
    s.wait(3);
    expect([s.ctrlOf(0).cam, s.ctrlOf(0).shellCam]).toEqual([0, true]);
    // Mute: left from the first is the barrier's camera.
    s.press(1, Btn.Observe);
    s.clients[1].cmd = { lean: -1 };
    s.wait(1);
    s.clients[1].cmd = {};
    s.wait(3);
    expect([s.ctrlOf(1).cam, s.ctrlOf(1).camEntry]).toEqual([n, barrier.id]);
    // Back and forth, closed and opened again: every client predicted the server's controller exactly.
    s.press(1, Btn.Observe);
    s.press(1, Btn.Observe);
    expect(s.ctrlOf(1).cam).toBe(n);
    s.press(0, Btn.Observe);
    s.press(0, Btn.Observe);
    expect(s.ctrlOf(0).shellCam).toBe(true);
    s.wait(8);
    expect(s.room.stats.mismatchCorrections).toBe(before);
    expect(s.clients[0].session.ctrl!.lastCam).toBe(SHELL_VIEW);
    expect(s.clients[1].session.ctrl!.camViews).toEqual(s.ctrlOf(1).camViews);
    expect(s.body(0).state.mode).toBe(PawnMode.Walk);
  });
});
