// Interaction rows of Phase 8 M8 (gadgets/DESIGN.md §6, §7, §12): Brava's Kludge drones, their hacks, and what the
// devices they convert do, on the Gadget Lab. Brava (client 0) throws a Kludge with Z, as a player does, and drives it
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

/** Brava (client 0) and `other` (client 1, and more) on the Gadget Lab, everyone out of the way. */
async function lab(...others: string[]) {
  const s = await scene(["brava", ...(others.length ? others : ["mute"])], "gadget_lab");
  s.park();
  return s;
}

const data = (s: Scene, id: string) => s.sim.data.gadgets.get(id)!;
const kdata = (s: Scene) => data(s, "kludge_drone").kludge!;

/** The events of a kind client i was sent. */
const sent = <K extends GameEvent["kind"]>(s: Scene, i: number, kind: K) => s.clients[i].events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

/**
 * Brava throws a Kludge drone (Z) from where she stands (4 m behind it) and drives it, put down at (x, z) facing
 * `yawDeg`: the Kludge.
 */
function kludgeAt(s: Scene, x: number, z: number, yawDeg = 0): Pawn {
  s.teleport(0, x, 0, z + 4, yawDeg);
  s.press(0, Btn.Ability);
  s.wait(4);
  const k = s.sim.pawns.get(s.ctrlOf(0).drone)!;
  expect([k.kind, k.kludge]).toEqual([PawnKind.Drone, true]);
  s.sim.placeDrone(k.id, x, 0.02, z, yawDeg);
  s.wait(8);
  return k;
}

/** Brava, driving her Kludge, looks at `at` and holds Fire for a hack's time and `extra` ticks more. */
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

/** Whether Brava's hack events so far include one that finished. */
const hacked = (s: Scene) => sent(s, 0, "hack").some((e) => e.stage === 1);
/** Whether any hack started. */
const started = (s: Scene) => sent(s, 0, "hack").some((e) => e.stage === 0);

/** An entry of a defenders' gadget (Mute's: client 1) on the floor at (x, z). */
const defenders = (s: Scene, kind: string, x: number, z: number, over: Partial<Gadget> = {}) => s.put(kind, 1, [x, data(s, kind).sizeM[1] / 2, z], over);

/** An entry as it is now. */
const now = (s: Scene, g: Gadget) => s.sim.gadgets.get(g.id);

/** The table's default camera on the Gadget Lab (CAM_LAB, the level's first), the cameras on as a match has them. */
function cams(s: Scene) {
  s.sim.matchRules.cameras = true;
  return 0;
}

// ================================================================ what a Kludge hacks

row("brava.kludge_drone", "mute.signal_disruptor", async () => {
  // Converted: it jams the defenders now. The hack starts from outside its 2.6 m (inside, the Kludge is jammed).
  const s = await lab();
  const j = defenders(s, "signal_disruptor", 0, 13.6);
  kludgeAt(s, 0, 15.5);
  hack(s, j.pos);
  expect(started(s)).toBe(false);
  s.sim.placeDrone(s.ctrlOf(0).drone, 0, 0.02, 16.5, 0);
  s.wait(4);
  hack(s, j.pos);
  expect([hacked(s), now(s, j)!.team]).toEqual([true, ATTACK]);
  expect(pointJammed(s.sim, DEFENSE, [0, 0.5, 13])).toBe(true);
});

row("brava.kludge_drone", "generic.bulletproof_camera", async () => {
  // Converted: the defenders lose it, the attackers watch it (on her Kludge, a lean past her drones opens it).
  const s = await lab();
  const i = cams(s);
  s.sim.matchRules.camsBroken = 1 << i; // the level's own camera out of the way
  const cam = defenders(s, "bulletproof_camera", 0, 13);
  const index = s.sim.level.def.cameras.length;
  expect(s.sim.camTeam(index)).toBe(DEFENSE);
  kludgeAt(s, 0, 16);
  hack(s, cam.pos);
  expect([hacked(s), s.sim.camTeam(index)]).toEqual([true, ATTACK]);
  s.press(0, 0, { lean: 1 });
  expect(s.ctrlOf(0).cam).toBe(index + 1);
  s.press(1, Btn.Observe);
  expect(s.ctrlOf(1).cam).toBe(0);
});

row("brava.kludge_drone", "generic.bulletproof_camera_dart", async () => {
  // Hacked, its dart is the defenders' no more: Brava watching it presses the gadget key, nothing fires.
  const s = await lab();
  s.sim.matchRules.camsBroken = 1 << cams(s);
  const cam = defenders(s, "bulletproof_camera", 0, 13);
  kludgeAt(s, 0, 16);
  hack(s, cam.pos);
  s.press(0, 0, { lean: 1 });
  expect(s.ctrlOf(0).cam).toBeGreaterThan(0);
  s.press(0, Btn.Gadget);
  s.wait(2);
  expect([sent(s, 0, "emp").length, now(s, cam)!.readyAt]).toEqual([0, cam.readyAt]);
});

for (const kind of ["proximity_alarm", "observation_blocker"])
  row("brava.kludge_drone", `generic.${kind}`, async () => {
    // Converted: it works for the attackers now.
    const s = await lab();
    const g = defenders(s, kind, 0, 13, { yaw: Math.PI });
    kludgeAt(s, 0, 16);
    hack(s, g.pos);
    expect([hacked(s), now(s, g)!.team]).toEqual([true, ATTACK]);
  });

row("brava.kludge_drone", "generic.nitro_cell", async () => {
  // It can't be controlled: disabled at once (Mute's detonator can't set it off) and destroyed a little later, without
  // its blast; Mute's detonator has nothing left.
  const s = await lab();
  s.room.pickLoadout(s.clients[1].id, { ...defaultLoadoutPick(s.sim.data, "mute"), gadgets: ["nitro_cell"] });
  s.wait(8);
  s.teleport(1, 0, 0, 10, 180);
  s.press(1, Btn.Gadget);
  s.wait(ticks(s.sim.data.gadgetRules.equipS) + 2);
  s.press(1, Btn.Fire, { yaw: Math.PI, pitch: -0.7 });
  s.wait(64);
  const nitro = s.sim.gadgets.list.find((g) => g.kind === kindOf("nitro_cell"))!;
  s.teleport(1, 0, 0, 4, 180);
  kludgeAt(s, nitro.pos[0], nitro.pos[2] + 3);
  hack(s, nitro.pos);
  expect([hacked(s), now(s, nitro)!.flags & GFlag.Off]).toEqual([true, GFlag.Off]);
  s.press(1, Btn.Fire);
  s.wait(ticks(kdata(s).destroyS) + 4);
  const blasts = s.clients[0].events.filter((e) => e.kind === "blast" && e.gadget === kindOf("nitro_cell")).length;
  expect([now(s, nitro), blasts, s.body(1).state.w1]).toEqual([undefined, 0, 0]);
});

row("brava.kludge_drone", "camera.default", async () => {
  // Converted: the defenders lose the level's camera, the attackers get its feed.
  const s = await lab();
  const i = cams(s);
  const cam = s.sim.level.def.cameras[i];
  kludgeAt(s, cam.pos[0], cam.pos[2] - 4, 180);
  hack(s, cam.pos);
  expect([hacked(s), s.sim.matchRules.camsHacked & (1 << i), s.sim.camTeam(i)]).toEqual([true, 1 << i, ATTACK]);
  s.press(1, Btn.Observe);
  expect(s.ctrlOf(1).cam).toBe(0);
});

row("brava.kludge_drone", "skopos.shell_idle", async () => {
  // Her idle shell overheats (she's warned) and burns out unless she wakes it: she lives on in the other, but can't
  // swap any more.
  const s = await lab("skopos");
  const ctrl = s.sim.controllers.get(s.clients[1].session.ctrl!.id)!;
  const idle = s.sim.pawns.get(ctrl.pawnIds.find((id) => id !== ctrl.possessedPawnId)!)!;
  s.sim.teleport(idle.id, 0, 0, 13, 0);
  s.wait(2);
  kludgeAt(s, 0, 16);
  hack(s, [0, 1.0, 13]);
  expect(hacked(s)).toBe(true);
  expect(sent(s, 1, "overheat").length).toBe(1);
  s.wait(ticks(kdata(s).overheatS) + 4);
  expect([idle.state.mode, s.body(1).state.mode]).toEqual([PawnMode.Dead, PawnMode.Walk]);
});

row("brava.kludge_drone", "skopos.shell_active", async () => {
  // The shell she's in can't be hacked.
  const s = await lab("skopos");
  s.teleport(1, 0, 0, 13, 0);
  kludgeAt(s, 0, 16);
  hack(s, [0, 1.0, 13]);
  expect(started(s)).toBe(false);
});

for (const [kind, note] of [
  ["mira.black_mirror", "black_mirror"],
  ["generic.deployable_shield", "deployable_shield"],
  ["generic.barbed_wire", "barbed_wire"],
] as const)
  row("brava.kludge_drone", kind, async () => {
    // Not electronic: no hack starts on it.
    const s = await lab();
    const g = defenders(s, note, 0, 13);
    kludgeAt(s, 0, 16);
    hack(s, g.pos);
    expect(started(s)).toBe(false);
  });

row("brava.kludge_drone", "pulse.cardiac_sensor", async () => {
  // In Pulse's hand, never in the world: nothing to hack on him (UNVERIFIED: inferred).
  const s = await lab("pulse");
  s.teleport(1, 0, 0, 13, 0);
  s.handOut(1, Hand.Ability);
  kludgeAt(s, 0, 16);
  hack(s, [0, 1.2, 13]);
  expect(started(s)).toBe(false);
});

row("brava.kludge_drone", "drone.standard", async () => {
  // Never her own side's devices: a teammate's drone in front of it isn't a target.
  const s = await lab("mute", "sledge");
  s.room.spawnPilot(s.clients[2].id, null, 0, ATTACK);
  s.room.rosterChanged();
  s.wait(8);
  const drone = s.sim.dronesOf(s.ctrlOf(2)).find((p) => p.state.mode === PawnMode.Walk)!;
  s.sim.placeDrone(drone.id, 0, 0.02, 13, 0);
  kludgeAt(s, 0, 16);
  hack(s, [0, 0.1, 13]);
  expect(started(s)).toBe(false);
});

// ================================================================ what stops a Kludge

row("mute.signal_disruptor", "brava.kludge_drone", async () => {
  // Inside an enemy jammer's 2.6 m a Kludge loses its driver and can't hack.
  const s = await lab();
  const cam = defenders(s, "bulletproof_camera", 0, 12.5);
  defenders(s, "signal_disruptor", 0.5, 15);
  const k = kludgeAt(s, 0, 16);
  expect(pawnJammed(s.sim, k)).toBe(true);
  const z = k.state.z;
  s.clients[0].cmd = { forward: 1 };
  s.wait(32);
  expect(Math.abs(k.state.z - z)).toBeLessThan(0.05);
  hack(s, cam.pos);
  expect(started(s)).toBe(false);
});

row("generic.bulletproof_camera_dart", "brava.kludge_drone", async () => {
  // A dart's EMP on a Kludge jams it (UNVERIFIED: as other attacker electronics): no driving, no hack, for its time.
  const s = await lab();
  const cam = defenders(s, "bulletproof_camera", 0, 12.5);
  const k = kludgeAt(s, 0, 16);
  const b = s.sim.data.intel.bulletproofCamera;
  s.room.gadgetServer.emp(DEFENSE, [0, 0.2, 16], b.dartRadiusM, b.disableS);
  expect(k.state.jammed).toBeGreaterThan(0);
  hack(s, cam.pos);
  expect(started(s)).toBe(false);
});

row("generic.observation_blocker", "brava.kludge_drone", async () => {
  // A defenders' observation blocker's screen between it and a camera hides the camera from it (Y8S2): no hack (the
  // blocker itself stands off to the side, out of its view); with the blocker gone, the hack goes.
  const s = await lab();
  const cam = defenders(s, "bulletproof_camera", 0, 11);
  const blocker = defenders(s, "observation_blocker", 1.0, 12.5, { yaw: 0 });
  kludgeAt(s, 0, 15);
  hack(s, cam.pos);
  expect(started(s)).toBe(false);
  s.room.gadgetServer.destroy(now(s, blocker)!);
  hack(s, cam.pos);
  expect([hacked(s), now(s, cam)!.team]).toEqual([true, ATTACK]);
});

for (const from of ["nitro_cell", "impact_grenade"])
  row(`generic.${from}`, "brava.kludge_drone", async () => {
    // Any damage destroys it.
    const s = await lab();
    const k = kludgeAt(s, 0, 16);
    s.setOff(s.put(from, 1, [0.5, 0.05, 16]));
    expect(k.state.mode).toBe(PawnMode.Dead);
  });

row("weapon.bullet", "brava.kludge_drone", async () => {
  // One bullet destroys it.
  const s = await lab();
  const k = kludgeAt(s, 0, 16);
  s.teleport(1, 0, 0, 12, 180);
  s.shootAt(1, [0, 0.1, 16]);
  expect(k.state.mode).toBe(PawnMode.Dead);
});

row("pulse.cardiac_sensor", "brava.kludge_drone", async () => {
  // Pulse's sensor shows Brava's heartbeat while she drives, not her Kludge.
  const s = await lab("pulse");
  const k = kludgeAt(s, 0, 14);
  s.teleport(1, 0, 0, 10, 180);
  s.handOut(1, Hand.Ability, { yaw: Math.PI });
  const hearts = heartbeats(s.sim, s.body(1)).map((p) => p.id);
  expect([hearts.includes(s.body(0).id), hearts.includes(k.id)]).toEqual([true, false]);
});

// ================================================================ what a converted device does

/** A Signal Disruptor of Mute's that a Kludge converted (its team the attackers'), on the floor at (x, z). */
const converted = (s: Scene, kind: string, x: number, z: number, over: Partial<Gadget> = {}) => defenders(s, kind, x, z, { ...over, team: ATTACK });

row("mute.signal_disruptor_converted", "drone.standard", async () => {
  // It no longer jams attackers' drones.
  const s = await lab("mute", "sledge");
  converted(s, "signal_disruptor", 0, 13);
  s.room.spawnPilot(s.clients[2].id, null, 0, ATTACK);
  s.room.rosterChanged();
  s.wait(8);
  const drone = s.sim.dronesOf(s.ctrlOf(2)).find((p) => p.state.mode === PawnMode.Walk)!;
  s.sim.placeDrone(drone.id, 0, 0.02, 14, 0);
  s.wait(4);
  expect(pawnJammed(s.sim, drone)).toBe(false);
});

for (const [op, kind] of [["thermite", "exothermic_charge"], ["fuze", "cluster_charge"]] as const)
  row("mute.signal_disruptor_converted", `${op}.${kind}`, async () => {
    // It frees the wall: his charge right by it goes when he presses his detonator.
    const s = await scene([op, "mute"], "gadget_lab");
    s.park();
    s.teleport(0, -8, 0, -5.0);
    const g = s.plant(0, [-8, 1.0, -5.9])!;
    s.teleport(0, -8, 0, 4.0);
    converted(s, "signal_disruptor", -8.4, -6.9);
    s.detonate(0);
    s.wait(2);
    expect(s.sim.gadgets.get(g.id) === undefined || (s.sim.gadgets.get(g.id)!.flags & GFlag.Active) !== 0).toBe(true);
  });

row("mute.signal_disruptor_converted", "generic.nitro_cell", async () => {
  // It jams the defenders' signals now (UNVERIFIED): Mute's Nitro Cell by it won't go off.
  const s = await lab();
  s.room.pickLoadout(s.clients[1].id, { ...defaultLoadoutPick(s.sim.data, "mute"), gadgets: ["nitro_cell"] });
  s.wait(8);
  s.teleport(1, 0, 0, 10, 180);
  s.press(1, Btn.Gadget);
  s.wait(ticks(s.sim.data.gadgetRules.equipS) + 2);
  s.press(1, Btn.Fire, { yaw: Math.PI, pitch: -0.7 });
  s.wait(64);
  const nitro = s.sim.gadgets.list.find((g) => g.kind === kindOf("nitro_cell"))!;
  s.teleport(1, 0, 0, 4, 180);
  converted(s, "signal_disruptor", nitro.pos[0] + 0.5, nitro.pos[2]);
  s.press(1, Btn.Fire);
  s.wait(4);
  expect(now(s, nitro)?.id).toBe(nitro.id);
});

row("mute.signal_disruptor_converted", "generic.bulletproof_camera", async () => {
  // A defenders' Bulletproof Camera within its reach has no feed (UNVERIFIED).
  const s = await lab();
  cams(s);
  defenders(s, "bulletproof_camera", 0, 13);
  const index = s.sim.level.def.cameras.length;
  expect(s.sim.camWorks(index)).toBe(true);
  converted(s, "signal_disruptor", 0.5, 13);
  expect(s.sim.camWorks(index)).toBe(false);
});

row("mute.signal_disruptor_converted", "camera.default", async () => {
  // The level's camera within its reach has no feed (UNVERIFIED).
  const s = await lab();
  const i = cams(s);
  const cam = s.sim.level.def.cameras[i];
  expect(s.sim.camWorks(i)).toBe(true);
  converted(s, "signal_disruptor", cam.pos[0], cam.pos[2] - 0.6);
  expect(s.sim.camWorks(i)).toBe(false);
});

row("mute.signal_disruptor_converted", "skopos.shell_idle", async () => {
  // Swapping is a signal: one by either shell stops her swap (UNVERIFIED).
  const s = await lab("skopos");
  s.teleport(1, 0, 0, 12, 0);
  const shell = s.body(1);
  const ctrl = s.sim.controllers.get(s.clients[1].session.ctrl!.id)!;
  const idle = s.sim.pawns.get(ctrl.pawnIds.find((id) => id !== ctrl.possessedPawnId)!)!;
  converted(s, "signal_disruptor", idle.state.x + 0.5, idle.state.z);
  for (const b of [Btn.Ability, 0, Btn.Interact, 0]) {
    s.clients[1].cmd = { buttons: b };
    s.tick();
  }
  const p = s.sim.data.operators.get("skopos")!.ability.params;
  s.wait(ticks(p.transferSeconds + p.activationSeconds) + 4);
  expect(s.body(1)).toBe(shell);
});

row("mute.signal_disruptor_converted", "pulse.cardiac_sensor", async () => {
  // A held sensor has no signal to jam (UNVERIFIED: inferred): Pulse beside one still sees heartbeats.
  const s = await lab("pulse");
  s.teleport(1, 0, 0, 10, 180);
  converted(s, "signal_disruptor", 0.4, 10.3);
  s.handOut(1, Hand.Ability, { yaw: Math.PI });
  s.teleport(0, 0, 0, 14, 0);
  expect(heartbeats(s.sim, s.body(1)).map((p) => p.id)).toContain(s.body(0).id);
});
