// Interaction rows of Phase 8 M8 (gadgets/DESIGN.md §6, §7, §12): Patch's Crossover drones, their hacks, and what the
// devices they convert do, on the Gadget Lab. Patch (client 0) throws a Crossover with Z, as a player does, and drives it
// (the test puts it where the row needs it); Fire held on a device hacks it (net/room.ts hacks). A converted jammer,
// blocker or alarm is one a hack switched to the attackers (an entry of team 0).
import { expect } from "vitest";
import {
  ATTACK,
  Btn,
  DEFENSE,
  defaultLoadoutPick,
  GFlag,
  heartbeats,
  Hand,
  kindOf,
  PawnKind,
  PawnMode,
  pawnJammed,
  pointJammed,
  ticks,
  type Gadget,
  type GameEvent,
  type Pawn,
  type Vec3,
} from "../../src/index.js";
import { scene, type Scene } from "./harness.js";
import { row } from "./registry.js";

/** Patch (client 0) and `other` (client 1, and more) on the Gadget Lab, everyone out of the way. */
async function lab(...others: string[]) {
  const s = await scene(["patch", ...(others.length ? others : ["lull"])], "gadget_lab");
  s.park();
  return s;
}

const data = (s: Scene, id: string) => s.sim.data.gadgets.get(id)!;
const kdata = (s: Scene) => data(s, "crossover_drone").crossover!;

/** The events of a kind client i was sent. */
const sent = <K extends GameEvent["kind"]>(s: Scene, i: number, kind: K) => s.clients[i].events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

/**
 * Patch throws a Crossover drone (Z) from where she stands (4 m behind it) and drives it, put down at (x, z) facing
 * `yawDeg`: the Crossover.
 */
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

/** Patch, driving her Crossover, looks at `at` and holds Fire for a hack's time and `extra` ticks more. */
function hack(s: Scene, at: Vec3, extra = 8) {
  const k = s.sim.pawns.get(s.ctrlOf(0).drone)!;
  const view = s.look(s.sim.eyeOf(k).pos, at);
  s.clients[0].cmd = { ...view };
  s.wait(4);
  s.clients[0].cmd = { ...view, buttons: Btn.Fire };
  s.wait(ticks(kdata(s).hackS) + extra);
  s.clients[0].cmd = { ...view };
  s.wait(2);
}

/** Whether Patch's hack events so far include one that finished. */
const hacked = (s: Scene) => sent(s, 0, "hack").some((e) => e.stage === 1);
/** Whether any hack started. */
const started = (s: Scene) => sent(s, 0, "hack").some((e) => e.stage === 0);

/** An entry of a defenders' gadget (Lull's: client 1) on the floor at (x, z). */
const defenders = (s: Scene, kind: string, x: number, z: number, over: Partial<Gadget> = {}) => s.put(kind, 1, [x, data(s, kind).sizeM[1] / 2, z], over);

/** An entry as it is now. */
const now = (s: Scene, g: Gadget) => s.sim.gadgets.get(g.id);

/** The table's default camera on the Gadget Lab (CAM_LAB, the level's first), the cameras on as a match has them. */
function cams(s: Scene) {
  s.sim.matchRules.cameras = true;
  return 0;
}

// ================================================================ what a Crossover hacks

row("patch.crossover_drone", "lull.damper", async () => {
  // Converted: it jams the defenders now. The hack starts from outside its 2.6 m (inside, the Crossover is jammed).
  const s = await lab();
  const j = defenders(s, "damper", 0, 13.6);
  crossoverAt(s, 0, 15.5);
  hack(s, j.pos);
  expect(started(s)).toBe(false);
  s.sim.placeDrone(s.ctrlOf(0).drone, 0, 0.02, 16.5, 0);
  s.wait(4);
  hack(s, j.pos);
  expect([hacked(s), now(s, j)!.team]).toEqual([true, ATTACK]);
  expect(pointJammed(s.sim, DEFENSE, [0, 0.5, 13])).toBe(true);
});

row("patch.crossover_drone", "generic.armoured_camera", async () => {
  // Converted: the defenders lose it, the attackers watch it (on her Crossover, a lean past her drones opens it).
  const s = await lab();
  const i = cams(s);
  s.sim.matchRules.camsBroken = 1 << i; // the level's own camera out of the way
  const cam = defenders(s, "armoured_camera", 0, 13);
  const index = s.sim.level.def.cameras.length;
  expect(s.sim.camTeam(index)).toBe(DEFENSE);
  crossoverAt(s, 0, 16);
  hack(s, cam.pos);
  expect([hacked(s), s.sim.camTeam(index)]).toEqual([true, ATTACK]);
  s.press(0, 0, { lean: 1 });
  expect(s.ctrlOf(0).cam).toBe(index + 1);
  s.press(1, Btn.Observe);
  expect(s.ctrlOf(1).cam).toBe(0);
});

row("patch.crossover_drone", "generic.armoured_camera_dart", async () => {
  // Hacked, its dart is the defenders' no more: Patch watching it presses the gadget key, nothing fires.
  const s = await lab();
  s.sim.matchRules.camsBroken = 1 << cams(s);
  const cam = defenders(s, "armoured_camera", 0, 13);
  crossoverAt(s, 0, 16);
  hack(s, cam.pos);
  s.press(0, 0, { lean: 1 });
  expect(s.ctrlOf(0).cam).toBeGreaterThan(0);
  s.press(0, Btn.Gadget);
  s.wait(2);
  expect([sent(s, 0, "emp").length, now(s, cam)!.readyAt]).toEqual([0, cam.readyAt]);
});

for (const kind of ["proximity_alarm", "feed_blocker"])
  row("patch.crossover_drone", `generic.${kind}`, async () => {
    // Converted: it works for the attackers now.
    const s = await lab();
    const g = defenders(s, kind, 0, 13, { yaw: Math.PI });
    crossoverAt(s, 0, 16);
    hack(s, g.pos);
    expect([hacked(s), now(s, g)!.team]).toEqual([true, ATTACK]);
  });

row("patch.crossover_drone", "generic.remote_charge", async () => {
  // It can't be controlled: disabled at once (Lull's detonator can't set it off) and destroyed a little later, without
  // its blast; Lull's detonator has nothing left.
  const s = await lab();
  s.room.pickLoadout(s.clients[1].id, { ...defaultLoadoutPick(s.sim.data, "lull"), gadgets: ["remote_charge"] });
  s.wait(8);
  s.teleport(1, 0, 0, 10, 180);
  s.press(1, Btn.Gadget);
  s.wait(ticks(s.sim.data.gadgetRules.equipS) + 2);
  s.press(1, Btn.Fire, { yaw: Math.PI, pitch: -0.7 });
  s.wait(64);
  const remoteCharge = s.sim.gadgets.list.find((g) => g.kind === kindOf("remote_charge"))!;
  s.teleport(1, 0, 0, 4, 180);
  crossoverAt(s, remoteCharge.pos[0], remoteCharge.pos[2] + 3);
  hack(s, remoteCharge.pos);
  expect([hacked(s), now(s, remoteCharge)!.flags & GFlag.Off]).toEqual([true, GFlag.Off]);
  s.press(1, Btn.Fire);
  s.wait(ticks(kdata(s).destroyS) + 4);
  const blasts = s.clients[0].events.filter((e) => e.kind === "blast" && e.gadget === kindOf("remote_charge")).length;
  expect([now(s, remoteCharge), blasts, s.body(1).state.w1]).toEqual([undefined, 0, 0]);
});

row("patch.crossover_drone", "camera.default", async () => {
  // Converted: the defenders lose the level's camera, the attackers get its feed.
  const s = await lab();
  const i = cams(s);
  const cam = s.sim.level.def.cameras[i];
  crossoverAt(s, cam.pos[0], cam.pos[2] - 4, 180);
  hack(s, cam.pos);
  expect([hacked(s), s.sim.matchRules.camsHacked & (1 << i), s.sim.camTeam(i)]).toEqual([true, 1 << i, ATTACK]);
  s.press(1, Btn.Observe);
  expect(s.ctrlOf(1).cam).toBe(0);
});

row("patch.crossover_drone", "twain.shell_idle", async () => {
  // Her idle shell overheats (she's warned) and burns out unless she wakes it: she lives on in the other, but can't
  // swap any more.
  const s = await lab("twain");
  const ctrl = s.sim.controllers.get(s.clients[1].session.ctrl!.id)!;
  const idle = s.sim.pawns.get(ctrl.pawnIds.find((id) => id !== ctrl.possessedPawnId)!)!;
  s.sim.teleport(idle.id, 0, 0, 13, 0);
  s.wait(2);
  crossoverAt(s, 0, 16);
  hack(s, [0, 1.0, 13]);
  expect(hacked(s)).toBe(true);
  expect(sent(s, 1, "overheat").length).toBe(1);
  s.wait(ticks(kdata(s).overheatS) + 4);
  expect([idle.state.mode, s.body(1).state.mode]).toEqual([PawnMode.Dead, PawnMode.Walk]);
});

row("patch.crossover_drone", "twain.shell_active", async () => {
  // The shell she's in can't be hacked.
  const s = await lab("twain");
  s.teleport(1, 0, 0, 13, 0);
  crossoverAt(s, 0, 16);
  hack(s, [0, 1.0, 13]);
  expect(started(s)).toBe(false);
});

for (const [kind, note] of [
  ["vista.blind_pane", "blind_pane"],
  ["generic.deployable_shield", "deployable_shield"],
  ["generic.barbed_wire", "barbed_wire"],
] as const)
  row("patch.crossover_drone", kind, async () => {
    // Not electronic: no hack starts on it.
    const s = await lab();
    const g = defenders(s, note, 0, 13);
    crossoverAt(s, 0, 16);
    hack(s, g.pos);
    expect(started(s)).toBe(false);
  });

row("patch.crossover_drone", "murmur.blood_oxygen_sensor", async () => {
  // In Murmur's hand, never in the world: nothing to hack on him (UNVERIFIED: inferred).
  const s = await lab("murmur");
  s.teleport(1, 0, 0, 13, 0);
  s.handOut(1, Hand.Ability);
  crossoverAt(s, 0, 16);
  hack(s, [0, 1.2, 13]);
  expect(started(s)).toBe(false);
});

row("patch.crossover_drone", "drone.standard", async () => {
  // Never her own side's devices: a teammate's drone in front of it isn't a target.
  const s = await lab("lull", "cleave");
  s.room.spawnPilot(s.clients[2].id, null, 0, ATTACK);
  s.room.rosterChanged();
  s.wait(8);
  const drone = s.sim.dronesOf(s.ctrlOf(2)).find((p) => p.state.mode === PawnMode.Walk)!;
  s.sim.placeDrone(drone.id, 0, 0.02, 13, 0);
  crossoverAt(s, 0, 16);
  hack(s, [0, 0.1, 13]);
  expect(started(s)).toBe(false);
});

// ================================================================ what stops a Crossover

row("lull.damper", "patch.crossover_drone", async () => {
  // Inside an enemy jammer's 2.6 m a Crossover loses its driver and can't hack.
  const s = await lab();
  const cam = defenders(s, "armoured_camera", 0, 12.5);
  defenders(s, "damper", 0.5, 15);
  const k = crossoverAt(s, 0, 16);
  expect(pawnJammed(s.sim, k)).toBe(true);
  const z = k.state.z;
  s.clients[0].cmd = { forward: 1 };
  s.wait(32);
  expect(Math.abs(k.state.z - z)).toBeLessThan(0.05);
  hack(s, cam.pos);
  expect(started(s)).toBe(false);
});

row("generic.armoured_camera_dart", "patch.crossover_drone", async () => {
  // A dart's EMP on a Crossover jams it (UNVERIFIED: as other attacker electronics): no driving, no hack, for its time.
  const s = await lab();
  const cam = defenders(s, "armoured_camera", 0, 12.5);
  const k = crossoverAt(s, 0, 16);
  const b = s.sim.data.intel.armouredCamera;
  s.room.gadgetServer.emp(DEFENSE, [0, 0.2, 16], b.dartRadiusM, b.disableS);
  expect(k.state.jammed).toBeGreaterThan(0);
  hack(s, cam.pos);
  expect(started(s)).toBe(false);
});

row("generic.feed_blocker", "patch.crossover_drone", async () => {
  // A defenders' feed blocker's screen between it and a camera hides the camera from it (Y8S2): no hack (the
  // blocker itself stands off to the side, out of its view); with the blocker gone, the hack goes.
  const s = await lab();
  const cam = defenders(s, "armoured_camera", 0, 11);
  const blocker = defenders(s, "feed_blocker", 1.0, 12.5, { yaw: 0 });
  crossoverAt(s, 0, 15);
  hack(s, cam.pos);
  expect(started(s)).toBe(false);
  s.room.gadgetServer.destroy(now(s, blocker)!);
  hack(s, cam.pos);
  expect([hacked(s), now(s, cam)!.team]).toEqual([true, ATTACK]);
});

for (const from of ["remote_charge", "impact_grenade"])
  row(`generic.${from}`, "patch.crossover_drone", async () => {
    // Any damage destroys it.
    const s = await lab();
    const k = crossoverAt(s, 0, 16);
    s.setOff(s.put(from, 1, [0.5, 0.05, 16]));
    expect(k.state.mode).toBe(PawnMode.Dead);
  });

row("weapon.bullet", "patch.crossover_drone", async () => {
  // One bullet destroys it.
  const s = await lab();
  const k = crossoverAt(s, 0, 16);
  s.teleport(1, 0, 0, 12, 180);
  s.shootAt(1, [0, 0.1, 16]);
  expect(k.state.mode).toBe(PawnMode.Dead);
});

row("murmur.blood_oxygen_sensor", "patch.crossover_drone", async () => {
  // Murmur's sensor shows Patch's heartbeat while she drives, not her Crossover.
  const s = await lab("murmur");
  const k = crossoverAt(s, 0, 14);
  s.teleport(1, 0, 0, 10, 180);
  s.handOut(1, Hand.Ability, { yaw: Math.PI });
  const hearts = heartbeats(s.sim, s.body(1)).map((p) => p.id);
  expect([hearts.includes(s.body(0).id), hearts.includes(k.id)]).toEqual([true, false]);
});

// ================================================================ what a converted device does

/** A Damper of Lull's that a Crossover converted (its team the attackers'), on the floor at (x, z). */
const converted = (s: Scene, kind: string, x: number, z: number, over: Partial<Gadget> = {}) => defenders(s, kind, x, z, { ...over, team: ATTACK });

row("lull.damper_converted", "drone.standard", async () => {
  // It no longer jams attackers' drones.
  const s = await lab("lull", "cleave");
  converted(s, "damper", 0, 13);
  s.room.spawnPilot(s.clients[2].id, null, 0, ATTACK);
  s.room.rosterChanged();
  s.wait(8);
  const drone = s.sim.dronesOf(s.ctrlOf(2)).find((p) => p.state.mode === PawnMode.Walk)!;
  s.sim.placeDrone(drone.id, 0, 0.02, 14, 0);
  s.wait(4);
  expect(pawnJammed(s.sim, drone)).toBe(false);
});

for (const [op, kind] of [["kiln", "burn_frame"], ["hail", "hailstone_drill"]] as const)
  row("lull.damper_converted", `${op}.${kind}`, async () => {
    // It frees the wall: his charge right by it goes when he presses his detonator.
    const s = await scene([op, "lull"], "gadget_lab");
    s.park();
    s.teleport(0, -8, 0, -5.0);
    const g = s.plant(0, [-8, 1.0, -5.9])!;
    s.teleport(0, -8, 0, 4.0);
    converted(s, "damper", -8.4, -6.9);
    s.detonate(0);
    s.wait(2);
    expect(s.sim.gadgets.get(g.id) === undefined || (s.sim.gadgets.get(g.id)!.flags & GFlag.Active) !== 0).toBe(true);
  });

row("lull.damper_converted", "generic.remote_charge", async () => {
  // It jams the defenders' signals now (UNVERIFIED): Lull's Remote Charge by it won't go off.
  const s = await lab();
  s.room.pickLoadout(s.clients[1].id, { ...defaultLoadoutPick(s.sim.data, "lull"), gadgets: ["remote_charge"] });
  s.wait(8);
  s.teleport(1, 0, 0, 10, 180);
  s.press(1, Btn.Gadget);
  s.wait(ticks(s.sim.data.gadgetRules.equipS) + 2);
  s.press(1, Btn.Fire, { yaw: Math.PI, pitch: -0.7 });
  s.wait(64);
  const remoteCharge = s.sim.gadgets.list.find((g) => g.kind === kindOf("remote_charge"))!;
  s.teleport(1, 0, 0, 4, 180);
  converted(s, "damper", remoteCharge.pos[0] + 0.5, remoteCharge.pos[2]);
  s.press(1, Btn.Fire);
  s.wait(4);
  expect(now(s, remoteCharge)?.id).toBe(remoteCharge.id);
});

row("lull.damper_converted", "generic.armoured_camera", async () => {
  // A defenders' Armoured Camera within its reach has no feed (UNVERIFIED).
  const s = await lab();
  cams(s);
  defenders(s, "armoured_camera", 0, 13);
  const index = s.sim.level.def.cameras.length;
  expect(s.sim.camWorks(index)).toBe(true);
  converted(s, "damper", 0.5, 13);
  expect(s.sim.camWorks(index)).toBe(false);
});

row("lull.damper_converted", "camera.default", async () => {
  // The level's camera within its reach has no feed (UNVERIFIED).
  const s = await lab();
  const i = cams(s);
  const cam = s.sim.level.def.cameras[i];
  expect(s.sim.camWorks(i)).toBe(true);
  converted(s, "damper", cam.pos[0], cam.pos[2] - 0.6);
  expect(s.sim.camWorks(i)).toBe(false);
});

row("lull.damper_converted", "twain.shell_idle", async () => {
  // Swapping is a signal: one by either shell stops her swap (UNVERIFIED).
  const s = await lab("twain");
  s.teleport(1, 0, 0, 12, 0);
  const shell = s.body(1);
  const ctrl = s.sim.controllers.get(s.clients[1].session.ctrl!.id)!;
  const idle = s.sim.pawns.get(ctrl.pawnIds.find((id) => id !== ctrl.possessedPawnId)!)!;
  converted(s, "damper", idle.state.x + 0.5, idle.state.z);
  for (const b of [Btn.Ability, 0, Btn.Interact, 0]) {
    s.clients[1].cmd = { buttons: b };
    s.tick();
  }
  const p = s.sim.data.operators.get("twain")!.ability.params;
  s.wait(ticks(p.transferSeconds + p.activationSeconds) + 4);
  expect(s.body(1)).toBe(shell);
});

row("lull.damper_converted", "murmur.blood_oxygen_sensor", async () => {
  // A held sensor has no signal to jam (UNVERIFIED: inferred): Murmur beside one still sees heartbeats.
  const s = await lab("murmur");
  s.teleport(1, 0, 0, 10, 180);
  converted(s, "damper", 0.4, 10.3);
  s.handOut(1, Hand.Ability, { yaw: Math.PI });
  s.teleport(0, 0, 0, 14, 0);
  expect(heartbeats(s.sim, s.body(1)).map((p) => p.id)).toContain(s.body(0).id);
});
