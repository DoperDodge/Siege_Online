// The Bulletproof Camera (Phase 7 M5, intel/DESIGN.md §4; a gadget like any other since Phase 8, gadgets/DESIGN.md §2):
// a defender who picked it takes it out with the gadget key and holds Fire at a wall or the floor to place it (the
// room adds it to the gadget table); it joins the defenders' cameras after the level's and turns like them, all the way
// round on the floor; broken, or outdoors past its signal, it's skipped; a bullet from the side or the back breaks it,
// not one at its bulletproof front; a dart bursts on the first drone on its way.
import { describe, expect, it } from "vitest";
import { bpCamsBroken, Btn, dartBurst, DEFENSE, DEG, GadgetAct, GadgetServer, GFlag, Hand, KIND_BP_CAMERA, Sim, ticks, wrapAngle, type Gadget, type InputCmd, type SimEvent } from "../src/index.js";
import { input } from "./helpers.js";

/** In the Laundry, 1.4 m from its south wall (a panel), facing it. */
const WALL: [number, number, number] = [39.345, -3.2, 31.805];

async function defender(op = "mute") {
  const sim = await Sim.create("oregon");
  sim.matchRules.cameras = true;
  const server = new GadgetServer(sim);
  const c = sim.addPlayer("def", op, 0, undefined, undefined, DEFENSE);
  const body = sim.pawns.get(c.possessedPawnId)!;
  sim.teleport(body.id, ...WALL, 0);
  const events: SimEvent[] = [];
  // As a room does: the step's gadget events into the table, then its flights and timers.
  const step = (cmd: Partial<InputCmd> & { yawDeg?: number } = {}, n = 1) => {
    for (let i = 0; i < n; i++) {
      sim.step(new Map([[c.id, input(cmd)]]));
      events.push(...sim.events);
      for (const e of sim.events) server.onEvent(e);
      server.step();
    }
  };
  step({}, 8);
  const placed = () => events.filter((e): e is Extract<SimEvent, { kind: "place" }> => e.kind === "place");
  /** The gadget key, then its equip time: the camera in hand, ready. */
  const takeOut = (cmd: Partial<InputCmd> & { yawDeg?: number } = {}) => {
    step({ ...cmd, buttons: Btn.Gadget });
    step(cmd, ticks(sim.data.gadgetRules.equipS));
  };
  return { sim, c, body, step, placed, takeOut };
}

describe("placing a Bulletproof Camera (Phase 7 M5, Phase 8's hands)", () => {
  it("taken out, then Fire held 1 s at a wall: on it, facing out of it, the body still meanwhile; one fewer left, then none", async () => {
    const { sim, body, step, placed, takeOut } = await defender();
    expect(body.state.g1).toBe(1);
    takeOut();
    expect([body.state.hand, body.state.gAct]).toEqual([Hand.Gadget, GadgetAct.Ready]);
    const stood = { x: body.state.x, z: body.state.z };
    step({ buttons: Btn.Fire, forward: 1 }, 63);
    expect(placed()).toEqual([]);
    expect(Math.hypot(body.state.x - stood.x, body.state.z - stood.z)).toBeLessThan(0.01);
    step({ buttons: Btn.Fire });
    expect(placed().length).toBe(1);
    const cam = placed()[0];
    expect([cam.onFloor, cam.panel, Math.abs(wrapAngle(cam.yaw))]).toEqual([false, 97, Math.PI]);
    expect(cam.pos[2]).toBeCloseTo(30.4 + sim.data.gadgets.get("bulletproof_camera")!.sizeM[2] / 2, 1);
    // None left: back to the weapon, and the key does nothing more.
    expect([body.state.g1, body.state.hand]).toEqual([0, Hand.Weapon]);
    expect(sim.bpCams().length).toBe(1);
    step({}, 2);
    step({ buttons: Btn.Gadget });
    expect(body.state.hand).toBe(Hand.Weapon);
  });

  it("let go early, nothing is placed; on the floor it sits facing the placer's way; never on a ceiling or out of reach", async () => {
    const { sim, body, step, placed, takeOut } = await defender();
    takeOut();
    step({ buttons: Btn.Fire }, 40);
    step({}, 2);
    expect([placed().length, body.state.g1]).toEqual([0, 1]);
    step({ pitch: 80 * DEG }, 4);
    expect(sim.gadgets.list.length).toBe(0);
    step({ pitch: 80 * DEG, buttons: Btn.Fire }, 70);
    expect(placed()).toEqual([]); // the ceiling
    step({ yawDeg: 90, buttons: Btn.Fire }, 70);
    expect(placed()).toEqual([]); // nothing within reach that way
    step({ yawDeg: 90, pitch: -60 * DEG }, 4);
    step({ yawDeg: 90, pitch: -60 * DEG, buttons: Btn.Fire }, 64);
    expect(placed().map((e) => [e.onFloor, Math.fround(e.yaw)])).toEqual([[true, body.state.yaw]]);
    expect(placed()[0].pos[1] - body.state.y).toBeCloseTo(sim.data.gadgets.get("bulletproof_camera")!.sizeM[1] / 2, 1);
  });

  it("only with one in a slot: Pulse's gadget key takes out his own gadget, and puts it away again", async () => {
    const other = await defender("pulse");
    expect(other.body.state.g1).toBe(1); // his first, the Nitro Cell
    other.takeOut();
    expect(other.body.state.hand).toBe(Hand.Gadget);
    other.step({ buttons: Btn.Gadget });
    other.step({}, 2);
    expect(other.body.state.hand).toBe(Hand.Weapon);
    expect(other.sim.bpCams()).toEqual([]);
  });
});

describe("watching a Bulletproof Camera (Phase 7 M5)", () => {
  it("joins the cameras after the level's; on a wall it turns 80° either way of its facing, on the floor all the way round", async () => {
    const { sim, c, step, takeOut } = await defender();
    takeOut();
    step({ buttons: Btn.Fire }, 64);
    const n = sim.level.def.cameras.length;
    step({ buttons: Btn.Observe });
    step({});
    expect(c.cam).toBe(1);
    const face = sim.bpCams()[0].yaw;
    step({ lean: -1, yaw: face }); // round the list backwards: the last, the Bulletproof Camera (looking its way)
    expect(c.cam).toBe(n + 1);
    expect(c.camYaw).toBe(Math.fround(wrapAngle(face)));
    step({ lean: 0, yaw: face + 170 * DEG }, 192);
    expect(wrapAngle(c.camYaw - face) / DEG).toBeCloseTo(80, 3);
    // On the floor: all the way round.
    const { id: _, ...first } = sim.bpCams()[0];
    sim.gadgets.add({ ...first, flags: GFlag.OnFloor, yaw: 0 });
    step({ lean: 1, yaw: 0 }); // the next: the one on the floor
    expect(c.cam).toBe(n + 2);
    step({ lean: 0, yaw: 170 * DEG }, 192);
    expect(c.camYaw / DEG).toBeCloseTo(170, 3);
  });

  it("broken, or outdoors once the room says its signal is gone, it's skipped: a viewer goes on to the next working camera", async () => {
    const { sim, c, step, takeOut } = await defender();
    takeOut();
    step({ buttons: Btn.Fire }, 64);
    const n = sim.level.def.cameras.length;
    step({ buttons: Btn.Observe });
    step({ lean: -1 });
    expect(c.cam).toBe(n + 1);
    step({ lean: 0 }, 3);
    expect(c.cam).toBe(n + 1);
    const id = sim.bpCams()[0].id;
    sim.gadgets.update(id, { flags: GFlag.Lost });
    step({});
    expect(c.cam).toBe(1); // round to the first
    step({ lean: -1 });
    expect(c.cam).toBe(n); // the level's last: the Bulletproof Camera is skipped
    sim.gadgets.update(id, { flags: GFlag.Broken });
    step({ lean: 0 });
    step({ lean: 1 });
    expect(c.cam).toBe(1);
  });
});

describe("a round's Bulletproof Cameras gone (Phase 7 M5)", () => {
  it("a defender still watching last round's is handed on to the level's first camera", async () => {
    const { sim, c, step, takeOut } = await defender();
    takeOut();
    step({ buttons: Btn.Fire }, 64);
    step({ buttons: Btn.Observe });
    step({ lean: -1 });
    expect(c.cam).toBe(sim.level.def.cameras.length + 1);
    sim.gadgets.clear();
    step({ lean: 0 });
    expect(c.cam).toBe(1);
    expect(() => sim.camLimits(8) && sim.camLens(8, 0)).not.toThrow(); // asked about one that's gone
  });
});

describe("a Bulletproof Camera's plate and its dart (Phase 7 M5)", () => {
  // Facing −z (yaw 0) at (0, 1, 0).
  const cam: Gadget = { id: 1, kind: KIND_BP_CAMERA, owner: 1, team: DEFENSE, pos: [0, 1, 0], yaw: 0, vel: [0, 0, 0], flags: 0, panel: -1, launchTick: 0, fuseEnd: 0, signalEnd: 0, readyAt: 0, seq: 0 };

  it("a bullet at its front within 50° of straight on meets the plate; from the side or the back it breaks it; a knife, any face", async () => {
    const data = (await Sim.create("range_lab")).data;
    const at = (deg: number): [number, number, number] => [Math.sin(deg * DEG), 0, Math.cos(deg * DEG)]; // toward the camera's front
    const from = (dir: [number, number, number]): [number, number, number] => [-dir[0] * 5, 1 - dir[1] * 5, -dir[2] * 5];
    const broken = (...a: Parameters<typeof bpCamsBroken> extends [unknown, unknown, ...infer R] ? R : never) => bpCamsBroken([cam], data, ...a).length;
    expect(broken(from(at(0)), at(0), 10)).toBe(0);
    expect(broken(from(at(40)), at(40), 10)).toBe(0);
    expect(broken(from(at(60)), at(60), 10)).toBe(1);
    expect(broken([-5, 1, 0], [1, 0, 0], 10)).toBe(1); // the side
    expect(broken([0, 1, 5], [0, 0, -1], 10)).toBe(1); // the back
    expect(broken(from(at(0)), at(0), 10, true)).toBe(1); // the knife
    expect(broken([-5, 1, 0], [1, 0, 0], 4.9)).toBe(0); // stopped short
    expect(broken([-5, 1.3, 0], [1, 0, 0], 10)).toBe(0); // over it
    expect(bpCamsBroken([{ ...cam, flags: GFlag.Broken }], data, [-5, 1, 0], [1, 0, 0], 10)).toEqual([]);
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
