// The Bulletproof Camera (Phase 7 M5, intel/DESIGN.md §4): a defender who picked it holds the gadget key at a wall or
// the floor to place it (the room adds it to the round's); it joins the defenders' cameras after the level's and
// turns like them, all the way round on the floor; broken, or outdoors past its signal, it's skipped; a bullet from
// the side or the back breaks it, not one at its bulletproof front; a dart bursts on the first drone on its way.
import { describe, expect, it } from "vitest";
import { bpCamsOnRay, Btn, dartBurst, DEFENSE, DEG, Sim, wrapAngle, type BpCam, type InputCmd, type SimEvent } from "../src/index.js";
import { input } from "./helpers.js";

/** In the Laundry, 1.4 m from its south wall (a panel), facing it. */
const WALL: [number, number, number] = [39.345, -3.2, 31.805];

async function defender(op = "mute") {
  const sim = await Sim.create("oregon");
  sim.matchRules.cameras = true;
  const c = sim.addPlayer("def", op, 0, undefined, undefined, DEFENSE);
  const body = sim.pawns.get(c.possessedPawnId)!;
  sim.teleport(body.id, ...WALL, 0);
  const events: SimEvent[] = [];
  const step = (cmd: Partial<InputCmd> & { yawDeg?: number } = {}, n = 1) => {
    for (let i = 0; i < n; i++) {
      sim.step(new Map([[c.id, input(cmd)]]));
      events.push(...sim.events);
    }
  };
  step({}, 8);
  const placed = () => events.filter((e): e is Extract<SimEvent, { kind: "camera" }> => e.kind === "camera");
  return { sim, c, body, step, placed };
}

/** A camera as the room keeps it, from a "camera" event. */
const kept = (e: Extract<SimEvent, { kind: "camera" }>, owner: number): BpCam => ({
  pos: [Math.fround(e.pos[0]), Math.fround(e.pos[1]), Math.fround(e.pos[2])],
  yaw: Math.fround(e.yaw),
  onFloor: e.onFloor,
  owner,
  broken: false,
  signalEnd: 0,
  lost: false,
  dartReady: 0,
  panel: e.panel,
});

describe("placing a Bulletproof Camera (Phase 7 M5)", () => {
  it("the gadget key held 1 s at a wall: on it, facing out of it, the body still meanwhile; one fewer left, then none", async () => {
    const { sim, body, step, placed } = await defender();
    expect(body.state.gadgets).toBe(1);
    const stood = { x: body.state.x, z: body.state.z };
    step({ buttons: Btn.Gadget, forward: 1 }, 63);
    expect(placed()).toEqual([]);
    expect(Math.hypot(body.state.x - stood.x, body.state.z - stood.z)).toBeLessThan(0.01);
    step({ buttons: Btn.Gadget });
    expect(placed().length).toBe(1);
    const cam = placed()[0];
    expect([cam.onFloor, cam.panel, Math.abs(wrapAngle(cam.yaw))]).toEqual([false, 97, Math.PI]);
    expect(cam.pos[2]).toBeCloseTo(30.4 + sim.data.intel.bulletproofCamera.sizeM[2] / 2, 1);
    expect(body.state.gadgets).toBe(0);
    // None left: holding it again does nothing.
    step({}, 2);
    step({ buttons: Btn.Gadget }, 80);
    expect(placed().length).toBe(1);
  });

  it("let go early, nothing is placed; on the floor it sits facing the placer's way; never on a ceiling or out of reach", async () => {
    const { sim, body, step, placed } = await defender();
    step({ buttons: Btn.Gadget }, 40);
    step({}, 2);
    expect([placed().length, body.state.gadgets]).toEqual([0, 1]);
    step({ pitch: 80 * DEG }, 4);
    expect(sim.cameraSpotFor(body)).toBeNull(); // the ceiling
    step({ yawDeg: 90 }, 4);
    expect(sim.cameraSpotFor(body)).toBeNull(); // nothing within reach that way
    step({ yawDeg: 90, pitch: -60 * DEG }, 4);
    const spot = sim.cameraSpotFor(body)!;
    expect([spot.onFloor, spot.yaw]).toEqual([true, body.state.yaw]);
    expect(spot.pos[1] - body.state.y).toBeCloseTo(sim.data.intel.bulletproofCamera.sizeM[1] / 2, 1);
    step({ yawDeg: 90, pitch: -60 * DEG, buttons: Btn.Gadget }, 64);
    expect(placed().map((e) => e.onFloor)).toEqual([true]);
  });

  it("only a defender in a match who picked it", async () => {
    const other = await defender("pulse");
    expect(other.body.state.gadgets).toBe(0);
    other.step({ buttons: Btn.Gadget }, 80);
    expect(other.placed()).toEqual([]);
    const lab = await defender();
    lab.sim.matchRules.cameras = false;
    lab.step({ buttons: Btn.Gadget }, 80);
    expect(lab.placed()).toEqual([]);
  });
});

describe("watching a Bulletproof Camera (Phase 7 M5)", () => {
  it("joins the cameras after the level's; on a wall it turns 80° either way of its facing, on the floor all the way round", async () => {
    const { sim, c, step, placed } = await defender();
    step({ buttons: Btn.Gadget }, 64);
    sim.matchRules.bpCams.push(kept(placed()[0], c.id));
    const n = sim.level.def.cameras.length;
    step({ buttons: Btn.Observe });
    step({});
    expect(c.cam).toBe(1);
    const face = sim.matchRules.bpCams[0].yaw;
    step({ lean: -1, yaw: face }); // round the list backwards: the last, the Bulletproof Camera (looking its way)
    expect(c.cam).toBe(n + 1);
    expect(c.camYaw).toBe(Math.fround(wrapAngle(face)));
    step({ lean: 0, yaw: face + 170 * DEG }, 192);
    expect(wrapAngle(c.camYaw - face) / DEG).toBeCloseTo(80, 3);
    // On the floor: all the way round.
    sim.matchRules.bpCams.push({ ...sim.matchRules.bpCams[0], onFloor: true, yaw: 0 });
    step({ lean: 1, yaw: 0 }); // the next: the one on the floor
    expect(c.cam).toBe(n + 2);
    step({ lean: 0, yaw: 170 * DEG }, 192);
    expect(c.camYaw / DEG).toBeCloseTo(170, 3);
  });

  it("broken, or outdoors once the room says its signal is gone, it's skipped: a viewer goes on to the next working camera", async () => {
    const { sim, c, step, placed } = await defender();
    step({ buttons: Btn.Gadget }, 64);
    sim.matchRules.bpCams.push(kept(placed()[0], c.id));
    const n = sim.level.def.cameras.length;
    step({ buttons: Btn.Observe });
    step({ lean: -1 });
    expect(c.cam).toBe(n + 1);
    step({ lean: 0 }, 3);
    expect(c.cam).toBe(n + 1);
    sim.matchRules.bpCams[0].lost = true;
    step({});
    expect(c.cam).toBe(1); // round to the first
    step({ lean: -1 });
    expect(c.cam).toBe(n); // the level's last: the Bulletproof Camera is skipped
    sim.matchRules.bpCams[0].lost = false;
    sim.matchRules.bpCams[0].broken = true;
    step({ lean: 0 });
    step({ lean: 1 });
    expect(c.cam).toBe(1);
  });
});

describe("a round's Bulletproof Cameras gone (Phase 7 M5)", () => {
  it("a defender still watching last round's is handed on to the level's first camera", async () => {
    const { sim, c, step, placed } = await defender();
    step({ buttons: Btn.Gadget }, 64);
    sim.matchRules.bpCams.push(kept(placed()[0], c.id));
    step({ buttons: Btn.Observe });
    step({ lean: -1 });
    expect(c.cam).toBe(sim.level.def.cameras.length + 1);
    sim.matchRules.bpCams = [];
    step({ lean: 0 });
    expect(c.cam).toBe(1);
    expect(() => sim.camLimits(8) && sim.camLens(8, 0)).not.toThrow(); // asked about one that's gone
  });
});

describe("a Bulletproof Camera's plate and its dart (Phase 7 M5)", () => {
  // Facing −z (yaw 0) at (0, 1, 0).
  const cam: BpCam = { pos: [0, 1, 0], yaw: 0, onFloor: false, owner: 1, broken: false, signalEnd: 0, lost: false, dartReady: 0, panel: -1 };

  it("a bullet at its front within 50° of straight on meets the plate; from the side or the back it breaks it; a knife, any face", async () => {
    const k = (await Sim.create("range_lab")).data.intel.bulletproofCamera;
    const at = (deg: number): [number, number, number] => [Math.sin(deg * DEG), 0, Math.cos(deg * DEG)]; // toward the camera's front
    const from = (dir: [number, number, number]): [number, number, number] => [-dir[0] * 5, 1 - dir[1] * 5, -dir[2] * 5];
    expect(bpCamsOnRay([cam], k, from(at(0)), at(0), 10)).toBe(0);
    expect(bpCamsOnRay([cam], k, from(at(40)), at(40), 10)).toBe(0);
    expect(bpCamsOnRay([cam], k, from(at(60)), at(60), 10)).toBe(1);
    expect(bpCamsOnRay([cam], k, [-5, 1, 0], [1, 0, 0], 10)).toBe(1); // the side
    expect(bpCamsOnRay([cam], k, [0, 1, 5], [0, 0, -1], 10)).toBe(1); // the back
    expect(bpCamsOnRay([cam], k, from(at(0)), at(0), 10, true)).toBe(1); // the knife
    expect(bpCamsOnRay([cam], k, [-5, 1, 0], [1, 0, 0], 4.9)).toBe(0); // stopped short
    expect(bpCamsOnRay([cam], k, [-5, 1.3, 0], [1, 0, 0], 10)).toBe(0); // over it
    expect(bpCamsOnRay([{ ...cam, broken: true }], k, [-5, 1, 0], [1, 0, 0], 10)).toBe(0);
  });

  it("a dart bursts on the first drone on its way, else where it meets the level, else at its range", async () => {
    const sim = await Sim.create("range_lab");
    const k = sim.data.intel.bulletproofCamera;
    const from: [number, number, number] = [0, 1.5, 0];
    const dir: [number, number, number] = [0, 0, -1];
    const near: [number, number, number] = [0.05, 1.5, -3];
    const far: [number, number, number] = [0, 1.5, -5];
    expect(dartBurst(sim, k, from, dir, [far, near], 0.11)).toEqual([0, 1.5, -3]);
    expect(dartBurst(sim, k, from, dir, [[0.5, 1.5, -3]], 0.11)).toEqual([0, 1.5, -k.dartRangeM]); // beside its way
    const down = dartBurst(sim, k, from, [0, -1, 0], [], 0.11);
    expect(down[1]).toBeCloseTo(0, 1); // the range's floor
  });
});
