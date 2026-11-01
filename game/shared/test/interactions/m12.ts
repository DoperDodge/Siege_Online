// Interaction rows of Phase 8 M12: the last ones, Phase 7's observation tools seen through the CSV (intel/DESIGN.md):
// the Bulletproof Camera's EMP dart fired from the camera with the gadget key (net/room.ts darts), drones and the
// level's camera destroyed by a bullet or a knife, and scans from a drone, a camera and a Bulletproof Camera. On the
// Gadget Lab: Sledge (or Fuze) is client 0, Mute client 1.
import { expect } from "vitest";
import { ATTACK, Btn, defaultLoadoutPick, GFlag, PawnMode, ticks, type Gadget, type Pawn, type Vec3 } from "../../src/index.js";
import { scene, type Scene } from "./harness.js";
import { row } from "./registry.js";

/** `ops` (Sledge and Mute unless it says) on the Gadget Lab, everyone out of the way. */
async function lab(ops: string[] = ["sledge", "mute"]) {
  const s = await scene(ops, "gadget_lab");
  s.park();
  return s;
}

/** Client 0 as Fuze carrying `gadget` (his slot 1), placed with 3 as a player does. */
async function fuzeWith(gadget: string) {
  const s = await lab(["fuze", "mute"]);
  s.room.pickLoadout(s.clients[0].id, { ...defaultLoadoutPick(s.sim.data, "fuze"), gadgets: [gadget] });
  s.wait(8);
  s.park();
  return s;
}

const dartData = (s: Scene) => s.sim.data.intel.bulletproofCamera;

/**
 * Mute's Bulletproof Camera at `at` (facing −z), and Mute watching it: the level's camera marked broken (a match's
 * cameras, the test turns them on) so his is the first that works.
 */
function onBpCam(s: Scene, at: Vec3): Gadget {
  const cam = s.put("bulletproof_camera", 1, at);
  s.sim.matchRules.cameras = true;
  s.sim.matchRules.camsBroken = 1;
  s.press(1, Btn.Observe);
  expect(s.ctrlOf(1).cam).toBe(s.sim.level.def.cameras.length + 1);
  return cam;
}

/** Mute, on his Bulletproof Camera, turns it toward `at` and fires its dart (3): where it burst, or null (it didn't fire). */
function fireDart(s: Scene, at: Vec3): Vec3 | null {
  const c = s.clients[1];
  const view = s.look(s.sim.viewOf(s.ctrlOf(1))!.pos, at);
  c.cmd = { ...view };
  s.wait(64); // the camera turns toward the view first
  const before = c.events.length;
  s.press(1, Btn.Gadget, view);
  s.wait(2);
  const e = c.events.slice(before).find((x) => x.kind === "emp");
  return e && e.kind === "emp" ? e.pos : null;
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

/** A drone's middle. */
const middle = (s: Scene, d: Pawn): Vec3 => [d.state.x, d.state.y + s.sim.data.intel.drone.sizeM[1] / 2, d.state.z];

/** Client 0's breach charge (3) on the plain soft wall at x −8, him then 10 m back. */
function chargeOnWall(s: Scene): Gadget {
  s.teleport(0, -8, 0, -5.0);
  const g = s.place(0, [-8, 1.0, -5.9])!;
  expect(g).toBeDefined();
  s.teleport(0, -8, 0, 4.0);
  return g;
}

// ================================================================ the Bulletproof Camera's dart

row("generic.bulletproof_camera_dart", "drone.standard", async () => {
  // Mute fires his camera's dart at Sledge's drone 5 m in front of it: it bursts on the drone (0.75 m, Y11S2.1), which
  // is jammed for 6 s (its driver's input does nothing) and works again after. The dart is ready 10 s later.
  const s = await lab();
  const drone = pilot(s, 0, 0, 19);
  onBpCam(s, [0, 1.5, 23.9]);
  const burst = fireDart(s, middle(s, drone))!;
  expect(Math.hypot(burst[0] - drone.state.x, burst[2] - drone.state.z)).toBeLessThan(0.3);
  expect(drone.state.jammed).toBeGreaterThan(0);
  const z = drone.state.z;
  s.clients[0].cmd = { forward: 1 };
  s.wait(32);
  expect(Math.abs(drone.state.z - z)).toBeLessThan(0.05);
  expect(fireDart(s, middle(s, drone))).toBeNull(); // recharging
  s.clients[0].cmd = {};
  s.wait(ticks(dartData(s).disableS));
  expect(drone.state.jammed).toBe(0);
  s.clients[0].cmd = { forward: 1 };
  s.wait(32);
  expect(Math.abs(drone.state.z - z)).toBeGreaterThan(0.5);
});

row("generic.bulletproof_camera_dart", "generic.claymore", async () => {
  // Its burst at a Claymore's feet turns it off (DSEG) for 6 s: it can't go off meanwhile; then it's back.
  const s = await lab();
  onBpCam(s, [0, 1.5, 23.9]);
  const g = s.put("claymore", 0, [0.3, 0.05, 18.5], { yaw: Math.PI });
  expect(fireDart(s, [0.3, 0, 18.5])).not.toBeNull();
  const flags = () => s.sim.gadgets.get(g.id)!.flags;
  expect(flags() & GFlag.Off).toBe(GFlag.Off);
  s.wait(ticks(dartData(s).disableS));
  expect(flags() & GFlag.Off).toBe(0);
});

row("generic.bulletproof_camera_dart", "generic.breach_charge", async () => {
  // Fuze's Breach Charge on a soft wall, the dart's burst on it: his detonator does nothing until the 6 s are out
  // (it can't be set off remotely meanwhile, Y10S4); then it goes off.
  const s = await fuzeWith("breach_charge");
  const g = chargeOnWall(s);
  onBpCam(s, [-8, 1.5, 0]);
  expect(fireDart(s, g.pos)).not.toBeNull();
  expect(s.sim.gadgets.get(g.id)!.flags & GFlag.Off).toBe(GFlag.Off);
  s.detonate(0, 1);
  s.wait(4);
  expect(s.sim.gadgets.get(g.id)).toBeDefined();
  s.wait(ticks(dartData(s).disableS));
  s.press(0, Btn.Fire);
  s.wait(4);
  expect(s.sim.gadgets.get(g.id)).toBeUndefined();
});

row("generic.bulletproof_camera_dart", "generic.hard_breach_charge", async () => {
  // The Hard Breach Charge isn't electronic and runs on its own fuse (no remote): a dart's burst on it changes nothing,
  // and it goes off 4 s after it was placed (UNVERIFIED: not stated, the CSV's placeholder).
  const s = await fuzeWith("hard_breach_charge");
  s.teleport(0, -8, 0, -5.0);
  const g = s.place(0, [-8, 1.0, -5.9])!;
  expect(g).toBeDefined();
  s.teleport(0, -8, 0, 4.0);
  onBpCam(s, [-8, 1.5, 0]);
  expect(fireDart(s, g.pos)).not.toBeNull();
  expect(s.sim.gadgets.get(g.id)!.flags & GFlag.Off).toBe(0);
  const use = s.sim.data.gadgets.get("hard_breach_charge")!.use;
  s.wait(ticks(use.kind === "place" ? (use.fuseS ?? 0) : 0) + 8);
  expect(s.sim.gadgets.get(g.id)).toBeUndefined();
  expect(s.solidAt("soft_plain", 0, [-8, 1.0, -5.9])).toBe(false);
});

row("generic.bulletproof_camera_dart", "player.attacker", async () => {
  // Its burst at Fuze's feet (DSEG on him): he can't set off his Breach Charge, nor look through a drone or camera,
  // until the 6 s are out; then he can.
  const s = await fuzeWith("breach_charge");
  const g = chargeOnWall(s);
  s.teleport(0, 0, 0, 18.5);
  onBpCam(s, [0, 1.5, 23.9]);
  expect(fireDart(s, [0, 0, 18.5])).not.toBeNull();
  expect(s.body(0).state.jammed).toBeGreaterThan(0);
  s.detonate(0, 1);
  s.wait(4);
  expect(s.sim.gadgets.get(g.id)).toBeDefined();
  s.wait(ticks(dartData(s).disableS));
  expect(s.body(0).state.jammed).toBe(0);
  s.press(0, Btn.Fire);
  s.wait(4);
  expect(s.sim.gadgets.get(g.id)).toBeUndefined();
});

// ================================================================ the observation tools

row("generic.bulletproof_camera", "player.attacker", async () => {
  // Mute on his Bulletproof Camera scans Sledge 10 m in front of it: spotted, for the defence (Y6S4: it can scan).
  const s = await lab();
  onBpCam(s, [0, 1.5, 23.9]);
  s.teleport(0, 0, 0, 14);
  expect(s.scan(1, s.body(0))).toBe(true);
});

row("camera.default", "player.attacker", async () => {
  // Mute on the level's camera (over the door wall) holds Fire on Sledge for a second: spotted.
  const s = await lab();
  s.teleport(0, -8, 0, -2);
  s.sim.matchRules.cameras = true;
  s.press(1, Btn.Observe);
  expect(s.ctrlOf(1).cam).toBe(1);
  expect(s.scan(1, s.body(0))).toBe(true);
});

row("drone.standard", "player.defender", async () => {
  // Sledge's drone holds its scan on Mute 10 m away: spotted, for the attackers.
  const s = await lab();
  pilot(s, 0, 6, 26);
  s.teleport(1, 6, 0, 16);
  expect(s.scan(0, s.body(1))).toBe(true);
});

// ================================================================ what destroys them

row("weapon.bullet", "drone.standard", async () => {
  // One bullet destroys a drone: Mute shoots Sledge's, 4 m away on the floor.
  const s = await lab();
  const drone = pilot(s, 0, 0, 16);
  s.teleport(1, 0, 0, 12);
  s.shootAt(1, middle(s, drone));
  expect(drone.state.mode).toBe(PawnMode.Dead);
  expect(s.clients[0].events.some((e) => e.kind === "droneDestroyed" && e.pawnId === drone.id)).toBe(true);
});

row("player.melee", "drone.standard", async () => {
  // So does a knife: Mute knifes Sledge's drone at his feet.
  const s = await lab();
  const drone = pilot(s, 0, 0, 16);
  s.teleport(1, 0, 0, 15.2);
  s.knife(1, middle(s, drone));
  expect(drone.state.mode).toBe(PawnMode.Dead);
});

row("weapon.bullet", "camera.default", async () => {
  // A bullet on the level's camera breaks it for the round: Sledge shoots it from below.
  const s = await lab();
  const cam = s.sim.level.def.cameras[0];
  s.teleport(0, cam.pos[0], 0, cam.pos[2] - 2.5);
  s.sim.matchRules.cameras = true; // a match's (the test turns them on)
  expect(s.sim.matchRules.camsBroken & 1).toBe(0);
  s.shootAt(0, cam.pos);
  expect(s.sim.matchRules.camsBroken & 1).toBe(1);
});
