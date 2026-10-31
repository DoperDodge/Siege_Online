// Interaction rows of Phase 8 M3 (gadgets/DESIGN.md §6, §9, §12): the stun's flash, smoke, the Impact EMP's DSEG,
// barbed wire, the deployable shield, the proximity alarm, the observation blocker, and the level's ingredients. Each
// sets its scene up on the Gadget Lab level (its default camera over the door wall, its fire extinguisher, gas pipe and
// metal detector) and goes through the room's own path: a gadget set off as its fuse or impact sets it off, a body's
// keys, a shot, a knife, a scan from a camera or a drone.
import { expect } from "vitest";
import {
  ATTACK,
  Btn,
  defaultLoadoutPick,
  DEFENSE,
  GadgetServer,
  GFlag,
  kindOf,
  PawnMode,
  raycastLevel,
  Sim,
  Stance,
  ticks,
  type Gadget,
  type GameEvent,
  type Pawn,
  type Vec3,
} from "../../src/index.js";
import { input } from "../helpers.js";
import { scene, type Scene } from "./harness.js";
import { row } from "./registry.js";

/** A scene on the Gadget Lab (Sledge client 0 and Mute client 1 unless `ops` says), everyone out of the way. */
async function lab(ops: string[] = ["sledge", "mute"]) {
  const s = await scene(ops, "gadget_lab");
  s.park();
  return s;
}

/** The events of a kind client i was sent. */
const sent = <K extends GameEvent["kind"]>(s: Scene, i: number, kind: K) => s.clients[i].events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

/** The level's ingredient of a kind (the room put it in the table). */
const ingredient = (s: Scene, kind: string) => s.sim.gadgets.list.find((g) => g.kind === kindOf(kind))!;

/** A gadget of client i's side gone off at `at`, as its fuse or impact sets it off: what's left of it (a smoke cloud). */
function goOff(s: Scene, kind: string, i: number, at: Vec3): Gadget | undefined {
  const g = s.put(kind, i, at);
  s.setOff(g);
  return s.sim.gadgets.get(g.id);
}

/** Client i on the defenders' cameras (a match's: the test turns them on), at the first working one. */
function onCameras(s: Scene, i: number, look: { yaw?: number; pitch?: number } = {}) {
  s.sim.matchRules.cameras = true;
  s.press(i, Btn.Observe, look);
  expect(s.ctrlOf(i).cam).toBeGreaterThan(0);
}

/** Client i (an attacker) as a pilot with its drones (as in prep), the first out at (x, z) facing `yawDeg`: that drone. */
function pilot(s: Scene, i: number, x: number, z: number, yawDeg = 0): Pawn {
  s.room.spawnPilot(s.clients[i].id, null, 0, ATTACK);
  s.room.rosterChanged(); // as the match director does after spawning pilots
  s.wait(8);
  const drone = s.sim.dronesOf(s.ctrlOf(i)).find((p) => p.state.mode === PawnMode.Walk)!;
  s.sim.placeDrone(drone.id, x, 0.02, z, yawDeg);
  s.wait(8);
  return drone;
}

/** Client i walking forward toward `yawDeg` (Sprint held when `sprint`) for `n` ticks: its horizontal speed then. */
function walkSpeed(s: Scene, i: number, yawDeg: number, n: number, sprint = false): number {
  s.clients[i].cmd = { forward: 1, yaw: yawDeg * (Math.PI / 180), buttons: sprint ? Btn.Sprint : 0 };
  s.wait(n);
  const st = s.body(i).state;
  s.clients[i].cmd = { yaw: yawDeg * (Math.PI / 180) };
  return Math.hypot(st.vx, st.vz);
}

// ---------------------------------------------------------------- the stun's flash

row("generic.stun", "player.defender", async () => {
  // Facing it 5 m away: fully blinded for its 5 s (UNVERIFIED for defenders: Fandom's numbers); facing away 6 m off,
  // only ringing ears (within 8 m).
  const s = await lab(["sledge", "mute", "pulse"]);
  s.teleport(1, 0, 0, 16);
  s.teleport(2, 4, 0, 16);
  s.clients[2].cmd = { yaw: Math.PI }; // facing +z, away from it
  s.wait(4);
  goOff(s, "stun", 0, [0, 1.0, 11]);
  expect(sent(s, 1, "stunned")).toEqual([{ kind: "stunned", seconds: 5, blind: 1, ring: true, concuss: false }]);
  expect(sent(s, 2, "stunned")).toEqual([{ kind: "stunned", seconds: 5, blind: 0, ring: true, concuss: false }]);
});

row("generic.stun", "player.attacker", async () => {
  // Attackers the same, its thrower too: Sledge facing his own stun 5 m away.
  const s = await lab();
  s.teleport(0, 0, 0, 16);
  goOff(s, "stun", 0, [0, 1.0, 11]);
  expect(sent(s, 0, "stunned")).toEqual([{ kind: "stunned", seconds: 5, blind: 1, ring: true, concuss: false }]);
});

row("generic.stun", "skopos.shell_active", async () => {
  // Skopós in her shell: blinded like anyone (UNVERIFIED).
  const s = await lab(["sledge", "skopos"]);
  s.teleport(1, 0, 0, 16);
  goOff(s, "stun", 0, [0, 1.0, 11]);
  expect(sent(s, 1, "stunned").map((e) => e.blind)).toEqual([1]);
});

row("generic.stun", "generic.deployable_shield", async () => {
  // Its slits let the flash through: Mute behind a shield, the stun low on its far side (the shield is between them, as
  // the level's sight sees it), is blinded all the same.
  const s = await lab();
  s.teleport(1, 0, 0, 16);
  s.put("deployable_shield", 1, [0, 0.5, 15]);
  s.wait(2);
  const eye: Vec3 = [0, 1.6, 16];
  const stun: Vec3 = [0, 0.05, 14.5];
  const d: Vec3 = [stun[0] - eye[0], stun[1] - eye[1], stun[2] - eye[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  expect(raycastLevel(s.sim, eye, [d[0] / len, d[1] / len, d[2] / len], len)?.t).toBeLessThan(len - 0.1);
  goOff(s, "stun", 0, stun);
  expect(sent(s, 1, "stunned").map((e) => e.blind)).toEqual([1]);
});

row("generic.stun", "camera.default", async () => {
  // A camera isn't blinded, nor who watches one: Mute faces the stun with his body but is on the camera over the door
  // wall, which faces it too; nothing, and the camera works.
  const s = await lab();
  s.teleport(1, -6, 0, 1);
  s.clients[1].cmd = { yaw: Math.PI };
  s.wait(4);
  onCameras(s, 1, { yaw: Math.PI });
  goOff(s, "stun", 0, [-8, 1.5, 4.5]);
  expect([sent(s, 1, "stunned"), s.ctrlOf(1).cam, s.sim.camWorks(0)]).toEqual([[], 1, true]);
});

row("generic.stun", "generic.bulletproof_camera", async () => {
  // Nor a Bulletproof Camera: Mute watches his own on the floor, the stun right in front of it and of his body; its
  // glass and feed are fine.
  const s = await lab();
  s.teleport(1, 0, 0, 16);
  const cam = s.put("bulletproof_camera", 1, [0, 0.06, 13]);
  s.sim.matchRules.camsBroken = 1; // the level's camera out of the way: his first is this one
  onCameras(s, 1);
  goOff(s, "stun", 0, [0, 0.5, 12]);
  expect([sent(s, 1, "stunned"), s.sim.gadgets.get(cam.id)!.flags & (GFlag.Broken | GFlag.Off)]).toEqual([[], 0]);
});

row("generic.stun", "drone.standard", async () => {
  // Nor a drone, nor its driver: Sledge on his drone 1 m from the stun; the drone drives on.
  const s = await lab();
  const drone = pilot(s, 0, 0, 12);
  goOff(s, "stun", 1, [0, 0.3, 11]);
  expect([sent(s, 0, "stunned"), drone.state.mode, drone.state.jammed]).toEqual([[], PawnMode.Walk, 0]);
});

// ---------------------------------------------------------------- smoke

row("generic.smoke", "camera.default", async () => {
  // A camera can't see through it: Mute scans Sledge from the camera over the door wall and spots him; with a cloud
  // between them (2.5 m round), he doesn't.
  const s = await lab();
  s.teleport(0, -8, 0, -2);
  onCameras(s, 1);
  expect(s.scan(1, s.body(0))).toBe(true);
  goOff(s, "smoke", 0, [-8, 0.05, 2]);
  expect(s.scan(1, s.body(0))).toBe(false);
});

row("generic.smoke", "drone.standard", async () => {
  // Nor a drone: Sledge's drone scans Mute and spots him; with a cloud between them, it doesn't.
  const s = await lab();
  pilot(s, 0, 6, 26);
  s.teleport(1, 6, 0, 16);
  expect(s.scan(0, s.body(1))).toBe(true);
  goOff(s, "smoke", 0, [6, 0.05, 21]);
  expect(s.scan(0, s.body(1))).toBe(false);
});

row("generic.smoke", "generic.bulletproof_camera", async () => {
  // A Bulletproof Camera sees through it (thermal): Mute scans Sledge through a cloud from his own, and spots him.
  const s = await lab();
  s.put("bulletproof_camera", 1, [0, 1.5, 23.9]);
  s.sim.matchRules.camsBroken = 1;
  onCameras(s, 1);
  s.teleport(0, 0, 0, 14);
  goOff(s, "smoke", 0, [0, 0.05, 19]);
  expect(s.scan(1, s.body(0))).toBe(true);
});

row("generic.smoke", "player.defender", async () => {
  // A defender's view stops at it too (it hides players inside, UNVERIFIED): Mute's ping at Sledge through a cloud
  // lands on the cloud's near side, not on Sledge or the wall beyond.
  const s = await lab();
  s.teleport(1, 0, 0, 20);
  s.teleport(0, 0, 0, 12.5);
  goOff(s, "smoke", 0, [0, 0.05, 16]);
  s.press(1, Btn.Ping, s.aimAt(1, [0, 1.2, 12.5]));
  const ping = sent(s, 1, "ping").at(-1)!;
  expect(ping.pos[2]).toBeGreaterThan(17.5);
  expect(ping.pos[2]).toBeLessThan(18.6);
});

// ---------------------------------------------------------------- the Impact EMP (DSEG)

/** An Impact EMP (Sledge's) gone off at `at`. */
const empAt = (s: Scene, at: Vec3) => goOff(s, "impact_emp", 0, at);

row("generic.impact_emp", "generic.bulletproof_camera", async () => {
  // Within its 2 m a Bulletproof Camera's feed goes for its 9 s, then comes back.
  const s = await lab();
  const cam = s.put("bulletproof_camera", 1, [0, 0.06, 14]);
  const i = s.sim.level.def.cameras.length; // its place in the defenders' list, after the level's
  empAt(s, [0, 0.1, 12.5]);
  expect([s.sim.gadgets.get(cam.id)!.flags & GFlag.Off, s.sim.camWorks(i)]).toEqual([GFlag.Off, false]);
  s.wait(ticks(9) + 2);
  expect([s.sim.gadgets.get(cam.id)!.flags & GFlag.Off, s.sim.camWorks(i)]).toEqual([0, true]);
});

row("generic.impact_emp", "generic.proximity_alarm", async () => {
  // An alarm EMP'd doesn't sound for 9 s, then does.
  const s = await lab();
  const alarm = s.put("proximity_alarm", 1, [2, 0.05, 14]);
  empAt(s, [2, 0.1, 13]);
  s.teleport(0, 2, 0, 13.6);
  s.wait(16);
  expect(sent(s, 0, "alarm")).toEqual([]);
  s.wait(ticks(9));
  expect(sent(s, 0, "alarm").some((e) => e.gadget === alarm.id && e.on)).toBe(true);
});

row("generic.impact_emp", "generic.nitro_cell", async () => {
  // A Nitro Cell EMP'd can't be set off: Mute presses his detonator and nothing goes off, until it wears off.
  const s = await lab();
  s.room.pickLoadout(s.clients[1].id, { ...defaultLoadoutPick(s.sim.data, "mute"), gadgets: ["nitro_cell"] });
  s.wait(8);
  s.teleport(1, 0, 0, 16);
  s.press(1, Btn.Gadget);
  s.wait(ticks(s.sim.data.gadgetRules.equipS) + 2);
  s.press(1, Btn.Fire, { pitch: -0.7 });
  s.wait(64);
  const nitro = s.sim.gadgets.list.find((g) => g.kind === kindOf("nitro_cell"))!;
  expect(nitro.flags & GFlag.Flying).toBe(0);
  s.teleport(1, 0, 0, 24); // out of the EMP's 2 m (an EMP on him would stop him too) and of its blast
  empAt(s, [nitro.pos[0], nitro.pos[1] + 0.1, nitro.pos[2]]);
  s.press(1, Btn.Fire);
  s.wait(4);
  expect([s.sim.gadgets.get(nitro.id)?.id, sent(s, 1, "blast").length]).toEqual([nitro.id, 1]); // the EMP's only
  s.wait(ticks(9));
  s.press(1, Btn.Fire);
  s.wait(4);
  expect([s.sim.gadgets.get(nitro.id), sent(s, 1, "blast").length]).toEqual([undefined, 2]);
});

row("generic.impact_emp", "generic.observation_blocker", async () => {
  // An observation blocker EMP'd is down (UNVERIFIED): Sledge's drone spots Mute through it; once it's back, it can't.
  const s = await lab();
  pilot(s, 0, 6, 26);
  s.teleport(1, 6, 0, 16);
  const ob = s.put("observation_blocker", 1, [6, 0.125, 20]);
  empAt(s, [6, 0.3, 20.5]);
  expect(s.sim.gadgets.get(ob.id)!.flags & GFlag.Off).toBe(GFlag.Off);
  expect(s.scan(0, s.body(1))).toBe(true);
  s.wait(ticks(9));
  expect(s.scan(0, s.body(1))).toBe(false);
});

row("generic.impact_emp", "camera.default", async () => {
  // The level's camera within 2 m: its feed is off for 9 s (Mute on it is put off it), then back.
  const s = await lab();
  onCameras(s, 1);
  empAt(s, [-8, 1.2, 5.0]);
  s.wait(2);
  expect([s.sim.matchRules.camsOff, s.sim.camWorks(0), s.ctrlOf(1).cam]).toEqual([1, false, 0]);
  s.wait(ticks(9));
  expect([s.sim.matchRules.camsOff, s.sim.camWorks(0)]).toEqual([0, true]);
});

row("generic.impact_emp", "generic.barbed_wire", async () => {
  // Mechanical: nothing.
  const s = await lab();
  const wire = s.put("barbed_wire", 1, [0, 0.225, 14]);
  empAt(s, [0, 0.3, 14]);
  expect(s.sim.gadgets.get(wire.id)!.flags & GFlag.Off).toBe(0);
});

row("generic.impact_emp", "generic.deployable_shield", async () => {
  // Mechanical: nothing.
  const s = await lab();
  const shield = s.put("deployable_shield", 1, [0, 0.5, 14]);
  empAt(s, [0, 0.3, 14.3]);
  expect(s.sim.gadgets.get(shield.id)!.flags & GFlag.Off).toBe(0);
});

row("generic.impact_emp", "player.defender", async () => {
  // A defender in it (DSEG): no observation tools for 9 s (Mute's cameras don't open), then back.
  const s = await lab();
  s.sim.matchRules.cameras = true;
  s.teleport(1, 0, 0, 14);
  empAt(s, [0, 0.5, 14.5]);
  expect(s.body(1).state.jammed).toBeGreaterThan(0);
  s.press(1, Btn.Observe);
  expect(s.ctrlOf(1).cam).toBe(0);
  s.wait(ticks(9));
  s.press(1, Btn.Observe);
  expect(s.ctrlOf(1).cam).toBeGreaterThan(0);
});

row("generic.impact_emp", "drone.standard", async () => {
  // Its own side's drones: nothing (UNVERIFIED; it's the attackers' EMP).
  const s = await lab();
  const drone = pilot(s, 0, 0, 14);
  goOff(s, "impact_emp", 1, [0, 0.3, 14.2]); // (put as Mute's only to have a body to own it: its team is what counts)
  expect(drone.state.jammed).toBeGreaterThan(0); // a defenders' EMP does reach it
  const s2 = await lab();
  const own = pilot(s2, 0, 0, 14);
  s2.setOff(s2.put("impact_emp", 0, [0, 0.3, 14.2], { team: ATTACK, owner: s2.ctrlOf(0).id }));
  expect(own.state.jammed).toBe(0);
});

row("generic.impact_emp", "skopos.shell_idle", async () => {
  // Her idle shell in it: she can't swap into it (its shell camera doesn't open) until it wears off.
  const s = await lab(["sledge", "skopos"]);
  const c = s.ctrlOf(1);
  const idle = s.sim.pawns.get(c.pawnIds.find((id) => id !== c.possessedPawnId)!)!;
  empAt(s, [idle.state.x, idle.state.y + 1, idle.state.z]);
  expect([idle.state.jammed > 0, s.body(1).state.jammed]).toEqual([true, 0]);
  s.press(1, Btn.Ability);
  expect(c.shellCam).toBe(false);
  s.wait(ticks(9));
  s.press(1, Btn.Ability);
  expect(c.shellCam).toBe(true);
});

row("generic.impact_emp", "skopos.shell_active", async () => {
  // The shell she's in: no observation tools (her shell camera, so no swap) until it wears off.
  const s = await lab(["sledge", "skopos"]);
  s.teleport(1, 0, 0, 14);
  empAt(s, [0, 0.5, 14.5]);
  expect(s.body(1).state.jammed).toBeGreaterThan(0);
  s.press(1, Btn.Ability);
  expect(s.ctrlOf(1).shellCam).toBe(false);
  s.wait(ticks(9));
  s.press(1, Btn.Ability);
  expect(s.ctrlOf(1).shellCam).toBe(true);
});

row("generic.impact_emp", "ingredient.metal_detector", async () => {
  // The metal detector EMP'd doesn't sound for 9 s.
  const s = await lab();
  const det = ingredient(s, "metal_detector");
  empAt(s, [det.pos[0], 0.2, det.pos[2] + 1]);
  s.teleport(0, det.pos[0], 0, det.pos[2]);
  s.wait(8);
  expect(sent(s, 0, "alarm")).toEqual([]);
  s.wait(ticks(9));
  expect(sent(s, 0, "alarm").some((e) => e.gadget === det.id && e.on)).toBe(true);
});

// ---------------------------------------------------------------- the observation blocker

row("generic.observation_blocker", "drone.standard", async () => {
  // Its barrier hides what's behind it from the attackers' drones: Sledge's drone spots Mute; with Mute's blocker
  // between them, it doesn't.
  const s = await lab();
  pilot(s, 0, 6, 26);
  s.teleport(1, 6, 0, 16);
  expect(s.scan(0, s.body(1))).toBe(true);
  s.put("observation_blocker", 1, [6, 0.125, 20]);
  expect(s.scan(0, s.body(1))).toBe(false);
});

row("generic.observation_blocker", "camera.default", async () => {
  // Not from its own side's cameras: Mute's own blocker between the camera and Sledge, and Mute spots him from it.
  const s = await lab();
  s.teleport(0, -8, 0, -2);
  s.put("observation_blocker", 1, [-8, 0.125, 2]);
  onCameras(s, 1);
  expect(s.scan(1, s.body(0))).toBe(true);
});

row("generic.observation_blocker_converted", "camera.default", async () => {
  // Hacked to the attackers' side (Brava, M8), it hides from the defenders' cameras instead (UNVERIFIED).
  const s = await lab();
  s.teleport(0, -8, 0, -2);
  s.put("observation_blocker", 1, [-8, 0.125, 2], { team: ATTACK });
  onCameras(s, 1);
  expect(s.scan(1, s.body(0))).toBe(false);
});

row("generic.observation_blocker", "player.attacker", async () => {
  // Players don't see it and aren't stopped by it: Sledge pings through it from his body (it lands beyond it); from his
  // drone, the same ping stops on it.
  const s = await lab(["sledge", "mute", "thermite"]);
  s.put("observation_blocker", 1, [6, 0.125, 20]);
  s.teleport(0, 6, 0, 26);
  const beyond: Vec3 = [6, 0, 14];
  s.press(0, Btn.Ping, s.aimAt(0, beyond));
  expect(sent(s, 0, "ping").at(-1)!.pos[2]).toBeLessThan(19);
  pilot(s, 2, 6, 26);
  const from = s.sim.viewOf(s.ctrlOf(2))!.pos;
  s.press(2, Btn.Ping, s.look(from, beyond));
  expect(sent(s, 2, "ping").filter((e) => e.ctrl === s.ctrlOf(2).id).at(-1)!.pos[2]).toBeCloseTo(20, 1);
});

// ---------------------------------------------------------------- the proximity alarm

row("generic.proximity_alarm", "player.attacker", async () => {
  // An attacker within its 3 m sets it off for everyone to hear (the one who did is named); it goes quiet as he leaves.
  const s = await lab();
  const alarm = s.put("proximity_alarm", 1, [2, 0.05, 15]);
  s.teleport(0, 2, 0, 16.5);
  for (const i of [0, 1]) expect(sent(s, i, "alarm")).toEqual([{ kind: "alarm", gadget: alarm.id, pos: alarm.pos, on: true, pawnId: s.body(0).id }]);
  s.teleport(0, 2, 0, 25);
  expect(sent(s, 1, "alarm").at(-1)).toMatchObject({ on: false });
});

row("generic.proximity_alarm", "player.defender", async () => {
  // Defenders don't set it off.
  const s = await lab();
  s.put("proximity_alarm", 1, [2, 0.05, 15]);
  s.teleport(1, 2, 0, 15.5);
  s.wait(8);
  expect(sent(s, 1, "alarm")).toEqual([]);
});

row("generic.proximity_alarm", "drone.standard", async () => {
  // Nor do drones (UNVERIFIED).
  const s = await lab();
  s.put("proximity_alarm", 1, [2, 0.05, 15]);
  pilot(s, 0, 2, 15.6);
  s.wait(8);
  expect(sent(s, 1, "alarm")).toEqual([]);
});

row("generic.proximity_alarm_converted", "player.defender", async () => {
  // Hacked to the attackers' side (Brava, M8), defenders set it off (UNVERIFIED).
  const s = await lab();
  const alarm = s.put("proximity_alarm", 1, [2, 0.05, 15], { team: ATTACK });
  s.teleport(1, 2, 0, 16.5);
  expect(sent(s, 1, "alarm").map((e) => [e.gadget, e.on, e.pawnId])).toEqual([[alarm.id, true, s.body(1).id]]);
});

row("environment.outdoors", "generic.proximity_alarm", async () => {
  // In a match's prep it can't go outdoors (ours: one that comes to rest out there is destroyed); after prep it can.
  const sim = await Sim.create("oregon");
  const server = new GadgetServer(sim);
  let prep = true;
  server.inPrep = () => prep;
  const c = sim.addPlayer("def", "mute", 0, undefined, undefined, DEFENSE);
  const street = sim.level.def.spawns.find((sp) => sp.group === "B_STREET")!.pos;
  const thrown = (seq: number) => {
    server.onEvent({ kind: "throw", pawnId: c.possessedPawnId, seq, slot: 1, gadget: "proximity_alarm", pos: [street[0], street[1] + 1, street[2]], vel: [0, -3, 0], yaw: 0 });
    for (let i = 0; i < 64; i++) {
      sim.step(new Map([[c.id, input()]]));
      server.step();
    }
  };
  thrown(1);
  expect(sim.gadgets.list).toEqual([]);
  prep = false;
  thrown(2);
  expect(sim.gadgets.list.map((g) => g.flags & GFlag.Flying)).toEqual([0]);
});

// ---------------------------------------------------------------- barbed wire

/** Mute's wire across the open floor at z 20 (2.5 m along x). */
const wire = (s: Scene) => s.put("barbed_wire", 1, [0, 0.225, 20]);

row("generic.barbed_wire", "player.attacker", async () => {
  // In it an attacker walks at half speed and can't sprint (Y3S2.2), and loses 5 for every second he moves (Y9S2).
  const s = await lab();
  wire(s);
  s.teleport(0, -1.6, 0, 24);
  const free = walkSpeed(s, 0, -90, 40, true);
  expect(s.body(0).state.sprinting).toBe(true);
  s.teleport(0, -1.4, 0, 20);
  const hp = s.body(0).state.hp;
  const slowed = walkSpeed(s, 0, -90, 40, true);
  expect(s.body(0).state.sprinting).toBe(false);
  expect(slowed).toBeCloseTo(s.sim.data.movement.speed.walkByRating["2"] * 0.5, 1);
  expect(free).toBeGreaterThan(slowed * 2.5);
  s.wait(30);
  const lost = hp - s.body(0).state.hp;
  expect(lost > 0 && lost % 5 === 0).toBe(true);
});

row("generic.barbed_wire", "player.defender", async () => {
  // Defenders aren't slowed: Mute sprints through his own wire as fast as anywhere.
  const s = await lab();
  wire(s);
  s.teleport(1, -1.6, 0, 24);
  const free = walkSpeed(s, 1, -90, 40, true);
  s.teleport(1, -1.4, 0, 20);
  const speed = walkSpeed(s, 1, -90, 40, true);
  expect([s.body(1).state.sprinting, speed]).toEqual([true, free]);
});

row("generic.barbed_wire", "drone.standard", async () => {
  // Drones only a little ("minimally": ours 90 %).
  const s = await lab();
  wire(s);
  const drone = pilot(s, 0, -1.4, 20, -90);
  s.clients[0].cmd = { forward: 1, yaw: -Math.PI / 2 };
  s.wait(24);
  expect(Math.hypot(drone.state.vx, drone.state.vz)).toBeCloseTo(s.sim.data.intel.drone.speedMps * 0.9, 1);
});

row("player.melee", "generic.barbed_wire", async () => {
  // Two knife hits destroy it (from either side): after one it's still there.
  const s = await lab();
  const w = s.put("barbed_wire", 1, [0, 0.225, 14]);
  s.teleport(0, 0, 0, 14.9);
  s.knife(0, w.pos, { stance: Stance.Crouch });
  expect(s.sim.gadgets.get(w.id)!.flags & GFlag.Hit).toBe(GFlag.Hit);
  s.knife(0, w.pos, { stance: Stance.Crouch });
  expect(s.sim.gadgets.get(w.id)).toBeUndefined();
});

// ---------------------------------------------------------------- the deployable shield

row("generic.deployable_shield", "player.attacker", async () => {
  // It stops an attacker's bullets (its slits too) and his body: Sledge's shot at Mute's legs hurts him; behind the
  // shield, the same shot doesn't, and Sledge can't walk through it.
  const s = await lab();
  s.teleport(1, 0, 0, 13);
  s.teleport(0, 0, 0, 17);
  const hp = s.body(1).state.hp;
  s.shootAt(0, [0.1, 0.6, 13]); // his thigh
  expect(s.body(1).state.hp).toBeLessThan(hp);
  s.room.onLabTool(s.clients[1].id, { kind: "respawn" });
  s.wait(8);
  s.teleport(1, 0, 0, 13);
  s.put("deployable_shield", 1, [0, 0.5, 14]);
  s.wait(2);
  const full = s.body(1).state.hp;
  s.shootAt(0, [0.1, 0.6, 13]);
  expect(s.body(1).state.hp).toBe(full);
  walkSpeed(s, 0, 0, 96);
  expect(s.body(0).state.z).toBeGreaterThan(14.3);
});

row("weapon.bullet", "generic.deployable_shield", async () => {
  // Bulletproof: shot, it stands, whole.
  const s = await lab();
  const shield = s.put("deployable_shield", 1, [0, 0.5, 14]);
  s.teleport(0, 0, 0, 17);
  s.shootAt(0, [0, 0.6, 14]);
  expect(s.sim.gadgets.get(shield.id)).toEqual(shield);
});

row("generic.deployable_shield", "generic.frag", async () => {
  // It stops a blast's damage: a frag on its far side and Mute right behind it, unhurt; the blast destroys it.
  const s = await lab();
  const shield = s.put("deployable_shield", 1, [0, 0.5, 14]);
  s.teleport(1, 0, 0, 13.4);
  s.wait(2);
  const hp = s.body(1).state.hp;
  goOff(s, "frag", 0, [0, 0.04, 14.2]);
  expect([s.body(1).state.hp, s.sim.gadgets.get(shield.id)]).toEqual([hp, undefined]);
});

row("generic.deployable_shield", "drone.standard", async () => {
  // It stops a drone (UNVERIFIED): Sledge's drone driving at it stops in front of it.
  const s = await lab();
  s.put("deployable_shield", 1, [0, 0.5, 15]);
  const drone = pilot(s, 0, 0, 18);
  s.clients[0].cmd = { forward: 1, yaw: 0 };
  s.wait(96);
  expect(drone.state.z).toBeGreaterThan(15.06);
});

row("player.melee", "generic.deployable_shield", async () => {
  // A knife hit makes its glass opaque, and then Mute can't pick it up.
  const s = await lab();
  const shield = s.put("deployable_shield", 1, [0, 0.5, 14]);
  s.room.pickLoadout(s.clients[1].id, { ...defaultLoadoutPick(s.sim.data, "mute"), gadgets: ["deployable_shield"] });
  s.wait(8);
  s.teleport(0, 0, 0, 14.7);
  s.knife(0, [0, 0.8, 14.06]);
  expect(s.sim.gadgets.get(shield.id)!.flags & GFlag.Hit).toBe(GFlag.Hit);
  s.teleport(0, 6, 0, 25);
  s.teleport(1, 0, 0, 12.8);
  const look = s.aimAt(1, [0, 0.6, 14]);
  s.clients[1].cmd = { ...look, buttons: Btn.Interact };
  s.wait(ticks(s.sim.data.gadgetRules.pickUpS) + 8);
  s.clients[1].cmd = { ...look };
  expect(s.sim.gadgets.get(shield.id)).toBeDefined();
  expect(s.sim.gadgetToPickUp(s.body(1))).toBeNull();
});

// ---------------------------------------------------------------- the level's ingredients

row("weapon.bullet", "ingredient.fire_extinguisher", async () => {
  // Shot, it bursts into its cloud.
  const s = await lab();
  const ext = ingredient(s, "fire_extinguisher");
  s.teleport(0, ext.pos[0], 0, ext.pos[2] + 4);
  s.shootAt(0, ext.pos);
  expect(s.sim.gadgets.get(ext.id)!.flags & GFlag.Active).toBe(GFlag.Active);
});

row("weapon.bullet", "ingredient.gas_pipe", async () => {
  // Shot, its flame jet starts.
  const s = await lab();
  const pipe = ingredient(s, "gas_pipe");
  s.teleport(0, pipe.pos[0] + 2.5, 0, pipe.pos[2] + 4);
  s.shootAt(0, pipe.pos);
  expect(s.sim.gadgets.get(pipe.id)!.flags & (GFlag.Active | GFlag.Hit)).toBe(GFlag.Active);
});

row("weapon.bullet", "ingredient.metal_detector", async () => {
  // Shot, it's destroyed.
  const s = await lab();
  const det = ingredient(s, "metal_detector");
  s.teleport(0, det.pos[0], 0, det.pos[2] + 4);
  s.shootAt(0, det.pos);
  expect(s.sim.gadgets.get(det.id)).toBeUndefined();
});

row("player.melee", "ingredient.metal_detector", async () => {
  // Knifed, it's destroyed.
  const s = await lab();
  const det = ingredient(s, "metal_detector");
  s.teleport(0, det.pos[0], 0, det.pos[2] + 0.9);
  s.knife(0, [det.pos[0], det.pos[1], det.pos[2] + 0.25]);
  expect(s.sim.gadgets.get(det.id)).toBeUndefined();
});

row("generic.frag", "ingredient.fire_extinguisher", async () => {
  // A blast sets it off.
  const s = await lab();
  const ext = ingredient(s, "fire_extinguisher");
  goOff(s, "frag", 0, [ext.pos[0], 0.04, ext.pos[2] + 0.6]);
  expect(s.sim.gadgets.get(ext.id)!.flags & GFlag.Active).toBe(GFlag.Active);
});

row("generic.frag", "ingredient.gas_pipe", async () => {
  // A blast sets it off (UNVERIFIED: "when damaged").
  const s = await lab();
  const pipe = ingredient(s, "gas_pipe");
  goOff(s, "frag", 0, [pipe.pos[0], 0.04, pipe.pos[2] + 0.6]);
  expect(s.sim.gadgets.get(pipe.id)!.flags & GFlag.Active).toBe(GFlag.Active);
});

row("ingredient.fire_extinguisher", "player.defender", async () => {
  // Its burst concusses those close by: Mute 1.5 m from it when it's shot.
  const s = await lab();
  const ext = ingredient(s, "fire_extinguisher");
  s.teleport(1, ext.pos[0] + 1.5, 0, ext.pos[2] + 0.6);
  s.teleport(0, ext.pos[0], 0, ext.pos[2] + 6);
  s.shootAt(0, ext.pos);
  expect(sent(s, 1, "stunned")).toEqual([{ kind: "stunned", seconds: 3, blind: 0, ring: true, concuss: true }]);
});

row("ingredient.gas_pipe", "player.attacker", async () => {
  // Its jet burns who's in it: Sledge in front of the pipe when it's set off.
  const s = await lab();
  const pipe = ingredient(s, "gas_pipe");
  s.teleport(0, pipe.pos[0], 0, pipe.pos[2] + 1.5);
  const hp = s.body(0).state.hp;
  s.room.gadgetServer.ignite(pipe);
  s.wait(20);
  expect(s.body(0).state.hp).toBeLessThan(hp);
});

row("ingredient.gas_pipe", "drone.standard", async () => {
  // A drone under it is destroyed by its blast or the fire after its jet (UNVERIFIED).
  const s = await lab();
  const pipe = ingredient(s, "gas_pipe");
  const drone = pilot(s, 0, pipe.pos[0], pipe.pos[2] + 0.6);
  s.room.gadgetServer.ignite(pipe);
  const k = s.sim.data.gadgetRules.ingredients.gas_pipe;
  s.wait(ticks(k.jet.seconds) + ticks(k.fire.seconds) + 8);
  expect(drone.state.mode).toBe(PawnMode.Dead);
  expect(s.sim.gadgets.get(pipe.id)!.flags & GFlag.Broken).toBe(GFlag.Broken);
});

row("ingredient.metal_detector", "player.attacker", async () => {
  // It beeps while an attacker walks through it.
  const s = await lab();
  const det = ingredient(s, "metal_detector");
  s.teleport(0, det.pos[0], 0, det.pos[2] + 2);
  walkSpeed(s, 0, 0, 48);
  expect(sent(s, 1, "alarm").some((e) => e.gadget === det.id && e.on && e.pawnId === s.body(0).id)).toBe(true);
});
