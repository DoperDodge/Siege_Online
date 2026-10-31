// Drones (Phase 7 M1, intel/DESIGN.md §2): the Throw key throws one and drives it, Observe enters one out and leaves
// it, a lean switches, F picks one up;
// they drive at full speed in every direction, jump on a cooldown, boost, fall without harm, fit through Oregon's
// drone holes but not walls, and any shot destroys one. Teammates' drones are in the feed list too, watched (M6, §5).
import { describe, expect, it } from "vitest";
import { applyDamage, ATTACK, Btn, Cause, DEFENSE, DEG, PawnKind, PawnMode, Sim, type InputCmd, type Pawn } from "../src/index.js";
import { input } from "./helpers.js";

/** An attacker with two drones held, standing on `level`'s spawn (Oregon: the first of `group`). */
async function attacker(level = "range_lab", group?: string) {
  const sim = await Sim.create(level);
  const spawn = group ? sim.level.def.spawns.findIndex((s) => s.group === group) : 0;
  const c = sim.addPlayer("atk", "thermite", spawn, undefined, undefined, ATTACK);
  sim.addDrone(c.id);
  sim.addDrone(c.id);
  const body = sim.pawns.get(c.possessedPawnId)!;
  const [d1, d2] = sim.dronesOf(c);
  const yawDeg = sim.level.def.spawns[spawn].yawDeg;
  const step = (cmd: Partial<InputCmd> & { yawDeg?: number } = {}, n = 1) => {
    for (let i = 0; i < n; i++) sim.step(new Map([[c.id, input({ yawDeg, ...cmd })]]));
  };
  step({}, 16);
  return { sim, c, body, d1, d2, step, yawDeg };
}

const hspeed = (p: Pawn) => Math.hypot(p.state.vx, p.state.vz);
const press = (step: (cmd?: Partial<InputCmd>) => void, buttons: number) => {
  step({ buttons });
  step({});
};

describe("drones (Phase 7 M1)", () => {
  it("are pawns of their attacker's controller, held until thrown: no collider anyone's movement or sight sees", async () => {
    const { c, d1, d2, sim } = await attacker();
    expect([d1.kind, d2.kind, d1.ownerId, d1.state.mode, d2.state.mode]).toEqual([PawnKind.Drone, PawnKind.Drone, c.id, PawnMode.Held, PawnMode.Held]);
    expect(sim.bodyIds(c)).toEqual([c.possessedPawnId]);
    expect(c.pawnIds).toEqual([c.possessedPawnId, d1.id, d2.id]);
    expect([d1.state.hp, d1.state.maxHp]).toEqual([1, 1]);
  });

  it("Throw throws a held drone ahead and drives it while the body stands; Observe, back to the body; Throw, the second; a lean goes round those out; F beside one puts it back in hand; Observe goes to one out", async () => {
    const { sim, c, body, d1, d2, step } = await attacker();
    const stood = { x: body.state.x, z: body.state.z };
    press(step, Btn.Throw);
    expect([c.drone, d1.state.mode, sim.viewedPawnId(c.id)]).toEqual([d1.id, PawnMode.Walk, d1.id]);
    step({}, 64); // it lands
    expect(d1.state.grounded).toBe(true);
    const parked = { x: d1.state.x, z: d1.state.z };
    step({ forward: 1 }, 64);
    expect(Math.hypot(d1.state.x - parked.x, d1.state.z - parked.z)).toBeGreaterThan(2);
    expect(Math.hypot(body.state.x - stood.x, body.state.z - stood.z)).toBeLessThan(0.01);
    press(step, Btn.Observe);
    expect([c.drone, sim.viewedPawnId(c.id)]).toEqual([0, body.id]);
    // Back in the body, the keys move it again; the drone, left at speed, rolls to a stop and stays there.
    step({}, 16);
    expect(hspeed(d1)).toBe(0);
    const left = { x: d1.state.x, z: d1.state.z };
    step({ forward: 1 }, 16);
    expect(Math.hypot(body.state.x - stood.x, body.state.z - stood.z)).toBeGreaterThan(0.2);
    expect(Math.hypot(d1.state.x - left.x, d1.state.z - left.z)).toBeLessThan(0.01);
    press(step, Btn.Throw);
    expect([c.drone, d2.state.mode]).toEqual([d2.id, PawnMode.Walk]);
    step({}, 64);
    step({ lean: 1 });
    expect(c.drone).toBe(d1.id);
    step({ lean: 1 }, 4); // still held: no new lean
    expect(c.drone).toBe(d1.id);
    step({ lean: 0 });
    step({ lean: -1 });
    expect(c.drone).toBe(d2.id);
    step({ lean: 0 });
    // Out of the drone, next to it: F picks it up (only its owner can).
    press(step, Btn.Observe);
    sim.teleport(body.id, d2.state.x + 0.6, d2.state.y, d2.state.z, 90);
    step({ yawDeg: 90 }, 16);
    expect(sim.prompt(c.id)).toBe("pickUpDrone");
    press(step, Btn.Interact);
    expect(d2.state.mode).toBe(PawnMode.Held);
    // Throw throws it again (one held); from the body, Observe goes to the first out.
    press(step, Btn.Throw);
    expect(c.drone).toBe(d2.id);
    press(step, Btn.Observe);
    press(step, Btn.Observe);
    expect(c.drone).toBe(d1.id);
  });

  it("drive at 4 m/s forward, sideways or both; a boost: ×1.5 for 2 s, then 10 s from its start before the next", async () => {
    const { sim, c, d1, step, yawDeg } = await attacker();
    press(step, Btn.Throw);
    step({}, 64);
    expect(c.drone).toBe(d1.id);
    // Each run starts from the same open spot down the range, at rest (the boost's clock keeps going).
    const home = { x: d1.state.x, y: d1.state.y, z: d1.state.z };
    const run = (cmd: Partial<InputCmd>, seconds = 0.5) => {
      sim.placeDrone(d1.id, home.x, home.y, home.z, yawDeg);
      step({}, 8);
      if (cmd.buttons) step(cmd);
      step({ ...cmd, buttons: 0 }, Math.round(seconds * 64));
      return hspeed(d1);
    };
    expect(run({ forward: 1 })).toBeCloseTo(4, 3);
    expect(run({ strafe: 1 })).toBeCloseTo(4, 3);
    expect(run({ forward: 1, strafe: 1 })).toBeCloseTo(4, 3);
    // Boosted from the press (tick 0) for 2 s: still at 0.5 s and at 1.2 s, over by 2.5 s.
    expect(run({ forward: 1, buttons: Btn.Sprint })).toBeCloseTo(6, 3);
    expect(run({ forward: 1 })).toBeCloseTo(6, 3);
    step({}, 64);
    expect(run({ forward: 1 })).toBeCloseTo(4, 3);
    // Another press before 12 s from the first: nothing; after: boosted again.
    expect(run({ forward: 1, buttons: Btn.Sprint })).toBeCloseTo(4, 3);
    step({}, 9 * 64);
    expect(run({ forward: 1, buttons: Btn.Sprint })).toBeCloseTo(6, 3);
  });

  it("jump 1 m once every 3 s, and fall without harm", async () => {
    const { sim, d1, step } = await attacker();
    press(step, Btn.Throw);
    step({}, 64);
    const floor = d1.state.y;
    let top = floor;
    step({ buttons: Btn.Vault });
    for (let i = 0; i < 64; i++) {
      step({});
      top = Math.max(top, d1.state.y);
    }
    expect(top - floor).toBeCloseTo(1, 1);
    expect(d1.state.grounded).toBe(true);
    // A second press within 3 s of the first: no jump.
    step({ buttons: Btn.Vault });
    step({}, 16);
    expect(d1.state.y - floor).toBeLessThan(0.01);
    step({}, 2 * 64);
    step({ buttons: Btn.Vault });
    step({}, 16);
    expect(d1.state.y - floor).toBeGreaterThan(0.5);
    // Dropped from 6 m: down unharmed.
    sim.placeDrone(d1.id, d1.state.x, floor + 6, d1.state.z, 0);
    step({}, 3 * 64);
    expect([d1.state.mode, d1.state.hp, d1.state.grounded]).toEqual([PawnMode.Walk, 1, true]);
    expect(applyDamage(sim, d1, { amount: 50, kill: false, cause: Cause.Fall }).outcome).toBe("ignored");
  });

  it("any shot destroys one; a held drone can't be hurt", async () => {
    const { sim, d1, d2, step } = await attacker();
    press(step, Btn.Throw);
    step({}, 8);
    expect(applyDamage(sim, d2, { amount: 50, kill: false, cause: Cause.Bullet }).outcome).toBe("ignored");
    expect(applyDamage(sim, d1, { amount: 1, kill: false, cause: Cause.Bullet }).outcome).toBe("killed");
    expect(d1.state.mode).toBe(PawnMode.Dead);
    // A destroyed drone ends the drive.
    step({});
    expect(sim.controllers.values().next().value!.drone).toBe(0);
  });

  it("fit through Oregon's drone holes (0.4 × 0.2 m) both ways, but not through the wall beside one", async () => {
    const { sim, c, d1, step } = await attacker("oregon", "C_CONSTRUCTION");
    /** From 0.6 m before the hole (or before the wall `side` metres along it), facing through (`dir` ±1), drive 1 s. */
    const through = (zoneId: string, dir: number, side = 0): boolean => {
      const box = sim.level.def.zones.find((z) => z.id === zoneId)!.boxes[0];
      const [cx, cy, cz] = box.center;
      const alongZ = box.size[2] < box.size[0];
      const bottom = cy - box.size[1] / 2;
      const [sx, sz] = alongZ ? [cx + side, cz - 0.6 * dir] : [cx - 0.6 * dir, cz + side];
      const yawDeg = alongZ ? (dir > 0 ? 180 : 0) : dir > 0 ? -90 : 90;
      sim.placeDrone(d1.id, sx, bottom + 0.02, sz, yawDeg);
      c.drone = d1.id;
      step({ yawDeg }, 8);
      step({ forward: 1, yawDeg }, 64);
      return (alongZ ? d1.state.z - cz : d1.state.x - cx) * dir > 0.4;
    };
    press(step, Btn.Throw);
    step({}, 32);
    // The floor-level holes with nothing right behind them (1F.dt4 has a prop 0.3 m behind it on one side; 2F.dt2 is
    // 0.9 m up its wall: a jump).
    for (const id of ["B.dt2", "B.dt3", "1F.dt6", "1F.dt2", "2F.dt1"]) {
      expect([through(id, 1), through(id, -1)], id).toEqual([true, true]);
      expect(through(id, 1, 1), `${id}, 1 m along the wall`).toBe(false);
    }
  });
});

describe("a drone and the stairs (Ulo's test)", () => {
  it("drives up a staircase (its ramp, as bodies walk up it): Oregon's S1, from the basement to the landing and on up to 1F", async () => {
    const { sim, c, d1, step } = await attacker("oregon", "C_CONSTRUCTION");
    press(step, Btn.Throw);
    step({}, 32);
    /** From (x, y, z) facing `yawDeg`, drive until `done` (at most 3 s). */
    const drive = (x: number, y: number, z: number, yawDeg: number, done: () => boolean) => {
      sim.placeDrone(d1.id, x, y + 0.02, z, yawDeg);
      c.drone = d1.id;
      step({ yawDeg }, 8);
      for (let i = 0; i < 3 * 64 && !done(); i++) step({ forward: 1, yawDeg });
    };
    // Flight 0 rises north (−z) from (37, −3.2, 11.5) to the landing at −1.6 m.
    drive(37, -3.2, 12.4, 0, () => d1.state.z < 8.6);
    expect(d1.state.z).toBeLessThan(8.6);
    expect(d1.state.y).toBeCloseTo(-1.6, 1);
    // Flight 1 rises south (+z) from the landing (38.7, −1.6, 9.1) to 1F.
    drive(38.7, -1.6, 8.6, 180, () => d1.state.z > 11.9);
    expect(d1.state.z).toBeGreaterThan(11.9);
    expect(d1.state.y).toBeCloseTo(0, 1);
  });
});

describe("a drone and a door barricade (Phase 7 M1)", () => {
  it("drives under one put up in a door: its 0.15 m gap opens 0.2 m for movement (no body is that low)", async () => {
    const { sim, c, d1, step } = await attacker("oregon", "C_CONSTRUCTION");
    const e = sim.level.panels.list.find((x) => x.panel.kind === "barricade" && x.frame.h > 1.5)!;
    sim.level.panels.apply(e.panel.spec.index, { kind: "barricade", up: true });
    expect(e.panel.empty).toBe(false);
    const [nx, , nz] = e.frame.n;
    const [cx, cy, cz] = e.frame.center;
    const bottom = cy - e.frame.h / 2;
    const yawDeg = (Math.atan2(-nx, -nz) * 180) / Math.PI; // facing along the normal
    press(step, Btn.Throw);
    step({}, 32);
    sim.placeDrone(d1.id, cx - nx * 0.6, bottom + 0.02, cz - nz * 0.6, yawDeg);
    c.drone = d1.id;
    step({ yawDeg }, 8);
    step({ forward: 1, yawDeg }, 64);
    expect((d1.state.x - cx) * nx + (d1.state.z - cz) * nz).toBeGreaterThan(0.4);
  });
});

describe("a drone's view (Phase 7 M1)", () => {
  it("is at its camera, low over the floor, tilting within its limits", async () => {
    const { sim, d1, step } = await attacker();
    press(step, Btn.Throw);
    step({ pitch: 80 * DEG }, 4);
    expect(d1.state.pitch).toBeCloseTo(60 * DEG, 5);
    const eye = sim.eyeOf(d1);
    expect(eye.pos[1] - d1.state.y).toBeCloseTo(sim.data.intel.drone.eyeM, 5);
    expect(eye.yaw).toBe(d1.state.yaw);
  });
});


describe("a teammate's drone (Phase 7 M6, intel/DESIGN.md §5)", () => {
  /** Two attackers in the range lab: a with two drones, b with none; and a defender, d. */
  async function team() {
    const sim = await Sim.create("range_lab");
    const a = sim.addPlayer("a", "thermite", 0, undefined, undefined, ATTACK);
    sim.addDrone(a.id);
    sim.addDrone(a.id);
    const b = sim.addPlayer("b", "sledge", 0, undefined, undefined, ATTACK);
    const d = sim.addPlayer("d", "mute", 0, undefined, undefined, DEFENSE);
    const step = (ca: Partial<InputCmd> & { yawDeg?: number } = {}, cb: Partial<InputCmd> & { yawDeg?: number } = {}, n = 1, cd: Partial<InputCmd> = {}) => {
      for (let i = 0; i < n; i++) sim.step(new Map([[a.id, input(ca)], [b.id, input(cb)], [d.id, input(cd)]]));
    };
    step({}, {}, 16);
    step({ buttons: Btn.Throw }); // a throws their first and drives it
    step({}, {}, 64);
    return { sim, a, b, d, step, drone: sim.dronesOf(a)[0] };
  }

  it("comes after your own in the feed list: watched, not driven; your view is your own; Observe takes you back", async () => {
    const { sim, a, b, step, drone } = await team();
    expect(a.drone).toBe(drone.id);
    expect(sim.feedDrones(b).map((p) => p.id)).toEqual([drone.id]);
    step({}, { buttons: Btn.Observe });
    step();
    expect([b.drone, sim.viewedPawnId(b.id)]).toEqual([drone.id, drone.id]);
    const at = { x: drone.state.x, z: drone.state.z };
    const body = sim.pawns.get(b.possessedPawnId)!;
    const stood = { x: body.state.x, z: body.state.z };
    step({}, { forward: 1, yawDeg: 90 }, 32);
    expect(Math.hypot(drone.state.x - at.x, drone.state.z - at.z)).toBeLessThan(0.01); // b's keys don't drive it
    expect(Math.hypot(body.state.x - stood.x, body.state.z - stood.z)).toBeLessThan(0.01); // nor their body
    expect(b.camYaw).toBeCloseTo(90 * DEG, 5);
    expect(sim.viewOf(b)).toMatchObject({ yaw: b.camYaw, pitch: b.camPitch });
    expect(sim.viewOf(b)!.pos[1] - drone.state.y).toBeCloseTo(sim.data.intel.drone.eyeM, 5);
    step({ forward: 1 }, { yawDeg: 90 }, 32); // a drives it on
    expect(Math.hypot(drone.state.x - at.x, drone.state.z - at.z)).toBeGreaterThan(0.5);
    expect(b.drone).toBe(drone.id);
    step({}, { buttons: Btn.Observe });
    expect(b.drone).toBe(0);
    step();
    // a losing it takes b off it.
    step({}, { buttons: Btn.Observe });
    step();
    expect(b.drone).toBe(drone.id);
    applyDamage(sim, drone, { amount: 1, kill: false, cause: Cause.Bullet });
    step();
    expect([a.drone, b.drone]).toEqual([0, 0]);
  });

  it("your own come first, then theirs, a new lean going round them all; an enemy's drone is never in it", async () => {
    const { sim, b, d, step, drone } = await team();
    // b gets a drone of their own, out.
    const mine = sim.addDrone(b.id);
    sim.placeDrone(mine.id, 3, 0.02, -3, 0);
    expect(sim.feedDrones(b).map((p) => p.id)).toEqual([mine.id, drone.id]);
    step({}, { buttons: Btn.Observe });
    step();
    expect(b.drone).toBe(mine.id);
    step({}, { lean: 1 });
    expect(b.drone).toBe(drone.id);
    step({}, { lean: 0 });
    step({}, { lean: 1 });
    expect(b.drone).toBe(mine.id);
    expect(sim.feedDrones(d)).toEqual([]);
    step({}, {}, 1, { buttons: Btn.Observe });
    expect(d.drone).toBe(0);
  });

  it("in prep, where you are your first drone, a new lean goes to a teammate's and back", async () => {
    const { sim, a, step, drone } = await team();
    const p = sim.addPilot("p", "fuze", ATTACK);
    const own = sim.addDrone(p.id);
    sim.placeDrone(own.id, -3, 0.02, -3, 0);
    const run = (cmd: Partial<InputCmd> & { yawDeg?: number }, n = 1) => {
      for (let i = 0; i < n; i++) sim.step(new Map([[a.id, input({})], [p.id, input(cmd)]]));
    };
    run({}, 16);
    expect([p.possessedPawnId, p.drone]).toEqual([own.id, 0]);
    run({ lean: 1 });
    expect([p.drone, sim.viewedPawnId(p.id)]).toEqual([drone.id, drone.id]);
    const parked = { x: own.state.x, z: own.state.z };
    run({ lean: 0, forward: 1 }, 32); // watching: their own drone stays parked, the teammate's isn't driven
    expect(Math.hypot(own.state.x - parked.x, own.state.z - parked.z)).toBeLessThan(0.01);
    run({ lean: 1 });
    expect([p.drone, sim.viewedPawnId(p.id)]).toEqual([0, own.id]);
    run({ lean: 0, forward: 1 }, 32);
    expect(Math.hypot(own.state.x - parked.x, own.state.z - parked.z)).toBeGreaterThan(0.5);
    void step;
  });
});
