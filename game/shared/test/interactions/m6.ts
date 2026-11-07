// Interaction rows of Phase 8 M6 (gadgets/DESIGN.md §6, §7, §12): Mute's Signal Disruptor and Pulse's Cardiac
// Sensor, on the Gadget Lab. A jammer is put straight into the table (Mute's, a defender's) unless the row is about
// placing one; charges are placed and set off with their owners' hands and detonators, as a player does, since the
// detonator is what a jammer stops.
import { expect } from "vitest";
import {
  applyDamage,
  ATTACK,
  Btn,
  defaultLoadoutPick,
  eyePose,
  GFlag,
  Hand,
  heartbeats,
  kindOf,
  L_BACK,
  L_FRONT,
  PawnKind,
  PawnMode,
  pawnJammed,
  pointJammed,
  Stance,
  ticks,
  type Gadget,
  type GameEvent,
  type Pawn,
  type Vec3,
} from "../../src/index.js";
import { scene, type Scene } from "./harness.js";
import { row } from "./registry.js";

/** `ops` (Sledge and Mute unless it says) on the Gadget Lab, everyone out of the way. */
async function lab(ops: string[] = ["sledge", "mute"]) {
  const s = await scene(ops, "gadget_lab");
  s.park();
  return s;
}

const data = (s: Scene, id: string) => s.sim.data.gadgets.get(id)!;

/** A Signal Disruptor of client i's (Mute's: client 1) standing on the floor at (x, z). */
function jammer(s: Scene, x: number, z: number, i = 1): Gadget {
  const g = s.put("signal_disruptor", i, [x, data(s, "signal_disruptor").sizeM[1] / 2, z]);
  s.wait(2);
  return g;
}

/** The events of a kind client i was sent. */
const sent = <K extends GameEvent["kind"]>(s: Scene, i: number, kind: K) => s.clients[i].events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

/** Blast events of a gadget kind so far (client 0's). */
const blasts = (s: Scene, kind: string) => sent(s, 0, "blast").filter((e) => e.gadget === kindOf(kind)).length;

/** Client i takes `gadgets` in its loadout (its operator's default otherwise). */
function gadgets(s: Scene, i: number, op: string, ids: string[]) {
  s.room.pickLoadout(s.clients[i].id, { ...defaultLoadoutPick(s.sim.data, op), gadgets: ids });
  s.wait(8);
}

/** Client i (an attacker) as a pilot with its drones (as in prep), the first out at (x, z) facing `yawDeg`: that drone. */
function pilot(s: Scene, i: number, x: number, z: number, yawDeg = 0): Pawn {
  s.room.spawnPilot(s.clients[i].id, null, 0, ATTACK);
  s.room.rosterChanged();
  s.wait(8);
  const drone = s.sim.dronesOf(s.ctrlOf(i)).find((p) => p.state.mode === PawnMode.Walk)!;
  s.sim.placeDrone(drone.id, x, 0.02, z, yawDeg);
  s.wait(8);
  return drone;
}

/** Whether an entry is set off and going (Thermite's burning, Fuze's drilling), or gone (it went off). */
const setOff = (s: Scene, g: Gadget) => {
  const now = s.sim.gadgets.get(g.id);
  return now === undefined || (now.flags & GFlag.Active) !== 0;
};

// ================================================================ what a jammer jams

row("mute.signal_disruptor", "drone.standard", async () => {
  // Inside its 2.6 m an attacker's drone loses its driver (its feed static); between that and 4.875 m its feed shows
  // static as a warning and it drives on; further out nothing. (No phase rule: in prep too.)
  const s = await lab();
  jammer(s, 0, 14);
  const drone = pilot(s, 0, 0, 16, 0);
  expect([pawnJammed(s.sim, drone), pawnJammed(s.sim, drone, true)]).toEqual([true, true]);
  const drive = () => {
    const z0 = drone.state.z;
    s.clients[0].cmd = { forward: 1 };
    s.wait(32);
    s.clients[0].cmd = {};
    s.wait(16);
    return Math.abs(drone.state.z - z0);
  };
  expect(drive()).toBeLessThan(0.05);
  s.sim.placeDrone(drone.id, 0, 0.02, 18, 180);
  s.wait(8);
  expect([pawnJammed(s.sim, drone), pawnJammed(s.sim, drone, true)]).toEqual([false, true]);
  expect(drive()).toBeGreaterThan(0.5);
  s.sim.placeDrone(drone.id, 0, 0.02, 22, 180);
  s.wait(8);
  expect(pawnJammed(s.sim, drone, true)).toBe(false);
});

row("mute.signal_disruptor", "generic.breach_charge", async () => {
  // A Breach Charge can't be set off while it, or Fuze, is within 2.6 m of a working jammer of the defenders'; his
  // detonator press does nothing (and spends nothing) until the jammer's gone.
  const s = await lab(["fuze", "mute"]);
  gadgets(s, 0, "fuze", ["breach_charge"]);
  s.teleport(0, -8, 0, -5.0);
  const g = s.place(0, [-8, 1.2, -5.9])!;
  s.teleport(0, -8, 0, 4.0);
  const j = jammer(s, -8.5, -7.0);
  expect(pointJammed(s.sim, ATTACK, g.pos)).toBe(true);
  s.detonate(0, 1);
  s.wait(4);
  expect([s.sim.gadgets.get(g.id)?.id, s.body(0).state.w1]).toEqual([g.id, 1]);
  s.room.gadgetServer.destroy(j);
  // Fuze himself inside one (the charge outside it): the same.
  jammer(s, -8.5, 4.5);
  s.detonate(0, 1);
  s.wait(4);
  expect(s.sim.gadgets.get(g.id)?.id).toBe(g.id);
  s.teleport(0, -8, 0, 9.0);
  s.detonate(0, 1);
  s.wait(4);
  expect([s.sim.gadgets.get(g.id), s.body(0).state.w1]).toEqual([undefined, 0]);
});

row("mute.signal_disruptor", "generic.hard_breach_charge", async () => {
  // Fuse-driven, not remote: one within a jammer's reach goes off when its fuse runs out.
  const s = await lab(["fuze", "mute"]);
  const pos: Vec3 = [11.5, 1.0, -5.9 + data(s, "hard_breach_charge").sizeM[2] / 2];
  const g = s.put("hard_breach_charge", 0, pos, { ...s.onPanel("reinforced", pos), fuseEnd: s.sim.tick + ticks(1) });
  jammer(s, 11.5, -5.2);
  expect(pointJammed(s.sim, ATTACK, g.pos)).toBe(true);
  s.wait(ticks(1) + 4);
  expect([s.sim.gadgets.get(g.id), blasts(s, "hard_breach_charge")]).toEqual([undefined, 1]);
});

row("mute.signal_disruptor", "generic.claymore", async () => {
  // Automated: a Claymore within a jammer's reach still goes off when a defender crosses a laser.
  const s = await lab();
  const clay = s.put("claymore", 0, [0, 0.07, 13], { yaw: 0 });
  jammer(s, 1.0, 13.3);
  s.wait(32);
  s.teleport(1, -0.75, 0, 11.7);
  s.wait(2);
  expect([s.sim.gadgets.get(clay.id), blasts(s, "claymore")]).toEqual([undefined, 1]);
});

for (const [op, kind] of [["fuze", "cluster_charge"], ["thermite", "exothermic_charge"]] as const)
  row("mute.signal_disruptor", `${op}.${kind}`, async () => {
    // Not while the charge (or its owner) is within 2.6 m of a working jammer (Y10S4); a jammer put down once it's set
    // off doesn't stop it.
    const s = await lab([op, "mute"]);
    s.teleport(0, -8.6, 0, -5.0);
    const g = s.plant(0, [-8.6, 1.0, -5.9])!;
    s.teleport(0, -8, 0, 4.0);
    const j = jammer(s, -8.6, -7.0);
    s.detonate(0);
    s.wait(4);
    expect(setOff(s, g)).toBe(false);
    s.room.gadgetServer.destroy(j);
    // Its owner inside one instead.
    const k = jammer(s, -8.5, 4.6);
    s.detonate(0);
    s.wait(4);
    expect(setOff(s, g)).toBe(false);
    s.room.gadgetServer.destroy(k);
    s.detonate(0);
    s.wait(2);
    expect(setOff(s, g)).toBe(true);
    jammer(s, -8.6, -6.9);
    const end = op === "fuze" ? 0.5 : data(s, kind).burnS! + 0.1;
    s.wait(ticks(end));
    // It went on: Fuze's grenades come out, Thermite's charge goes off.
    if (op === "fuze") expect(s.sim.gadgets.list.some((e) => e.kind === kindOf("cluster_grenade"))).toBe(true);
    else expect(blasts(s, kind)).toBe(1);
  });

for (const [kind, i] of [["impact_emp", 0], ["frag", 0], ["stun", 0], ["smoke", 0]] as const)
  row("mute.signal_disruptor", `generic.${kind}`, async () => {
    // No remote signal: thrown into a jammer's reach, it goes off at its fuse (or impact) all the same.
    const s = await lab();
    const j = jammer(s, 0, 13);
    const g = s.put(kind, i, [0.6, 0.05, 13.6]);
    expect(pointJammed(s.sim, ATTACK, g.pos)).toBe(true);
    s.setOff(g);
    expect(blasts(s, kind)).toBe(1);
    // An EMP disables the jammer (DSEG), a frag destroys it.
    if (kind === "impact_emp") expect(s.sim.gadgets.get(j.id)!.flags & GFlag.Off).toBe(GFlag.Off);
  });

row("mute.signal_disruptor", "sledge.breaching_hammer", async () => {
  // Mechanical: inside a jammer's reach, Sledge's hammer breaks a soft wall as ever.
  const s = await lab();
  s.teleport(0, -12, 0, -5.0);
  jammer(s, -12.6, -4.6);
  expect(pawnJammed(s.sim, s.body(0))).toBe(true);
  const at: Vec3 = [-12.1, 1.3, -5.9];
  s.handOut(0, Hand.Ability, s.aimAt(0, at));
  s.press(0, Btn.Fire, s.aimAt(0, at));
  s.wait(ticks(1));
  expect([L_FRONT, L_BACK].every((l) => !s.solidAt("soft_studs", l, [-12.29, 1.3, -6]))).toBe(true);
});

row("mute.signal_disruptor", "generic.nitro_cell", async () => {
  // Friendly: Mute sets off his own Nitro Cell lying by his own jammer, standing by it.
  const s = await lab();
  gadgets(s, 1, "mute", ["nitro_cell"]);
  s.teleport(1, 0, 0, 16);
  s.press(1, Btn.Gadget);
  s.wait(ticks(s.sim.data.gadgetRules.equipS) + 2);
  s.press(1, Btn.Fire, { pitch: -0.7 });
  s.wait(64);
  const nitro = s.sim.gadgets.list.find((g) => g.kind === kindOf("nitro_cell"))!;
  jammer(s, nitro.pos[0] + 0.5, nitro.pos[2]);
  s.teleport(1, 0, 0, 24);
  jammer(s, 0.5, 24);
  expect(pawnJammed(s.sim, s.body(1))).toBe(false);
  s.press(1, Btn.Fire);
  s.wait(4);
  expect([s.sim.gadgets.get(nitro.id), blasts(s, "nitro_cell")]).toEqual([undefined, 1]);
});

row("mute.signal_disruptor", "generic.bulletproof_camera", async () => {
  // Friendly: a Bulletproof Camera beside Mute's jammer keeps its feed.
  const s = await lab();
  s.put("bulletproof_camera", 1, [0, 0.06, 14]);
  jammer(s, 0.4, 14);
  expect(s.sim.camWorks(s.sim.level.def.cameras.length)).toBe(true);
});

row("mute.signal_disruptor", "skopos.shell_idle", async () => {
  // Friendly: Skopós swaps between her shells with a jammer at her feet.
  const s = await lab(["sledge", "skopos"]);
  s.teleport(1, 0, 0, 12);
  jammer(s, 0.4, 12.4);
  const shell = s.body(1);
  for (const b of [Btn.Ability, 0, Btn.Interact, 0]) {
    s.clients[1].cmd = { buttons: b };
    s.tick();
  }
  const p = s.sim.data.operators.get("skopos")!.ability.params;
  s.wait(ticks(p.transferSeconds + p.activationSeconds + p.swapCooldownSeconds) + 4);
  expect(s.body(1)).not.toBe(shell);
});

row("mute.signal_disruptor", "pulse.cardiac_sensor", async () => {
  // Friendly: Pulse's sensor up beside Mute's jammer still shows Sledge's heartbeat.
  const s = await lab(["pulse", "sledge", "mute"]);
  s.teleport(0, -8, 0, -8.5, 180);
  jammer(s, -8.5, -8.2, 2);
  s.handOut(0, Hand.Ability, { yaw: Math.PI });
  s.teleport(1, -8, 0, -4.0);
  expect(heartbeats(s.sim, s.body(0)).map((p) => p.id)).toEqual([s.body(1).id]);
});

row("mute.signal_disruptor", "player.attacker", async () => {
  // A jammer isn't DSEG: an attacker inside its reach keeps his sights (no EMP on him) and shoots as ever.
  const s = await lab();
  s.teleport(0, -8, 0, -2.5);
  jammer(s, -8.4, -2.2);
  expect([pawnJammed(s.sim, s.body(0)), s.body(0).state.jammed]).toEqual([true, 0]);
  const shots = s.room.stats.shots;
  s.shootAt(0, [-8, 1.2, -5.9]);
  expect(s.room.stats.shots).toBe(shots + 1);
});

// ================================================================ what destroys or disables a jammer

row("thermite.exothermic_charge", "mute.signal_disruptor", async () => {
  // Its blast destroys a jammer in reach, but only one far enough from it that it can be set off at all: one within
  // 2.6 m stops the trigger and lives.
  const s = await lab(["thermite", "mute"]);
  s.teleport(0, -8, 0, -5.0);
  const g = s.plant(0, [-8, 1.4, -5.9])!;
  s.teleport(0, -8, 0, 4.0);
  const near = jammer(s, -8, -7.5);
  s.detonate(0);
  s.wait(ticks(3.2));
  expect([s.sim.gadgets.get(g.id)?.id, s.sim.gadgets.get(near.id)?.id]).toEqual([g.id, near.id]);
  s.room.gadgetServer.destroy(near);
  const far = jammer(s, -8, -8.6);
  expect(pointJammed(s.sim, ATTACK, g.pos)).toBe(false);
  expect(Math.hypot(far.pos[0] - g.pos[0], far.pos[1] - g.pos[1], far.pos[2] - g.pos[2])).toBeLessThan(data(s, "exothermic_charge").blast!.destroyM);
  s.detonate(0);
  s.wait(ticks(3.2));
  expect([s.sim.gadgets.get(g.id), s.sim.gadgets.get(far.id)]).toEqual([undefined, undefined]);
});

row("fuze.cluster_charge", "mute.signal_disruptor", async () => {
  // Its grenades destroy a jammer in the room, when the charge is placed out of the jammer's reach.
  const s = await lab(["fuze", "mute"]);
  const j = jammer(s, -7.2, -9.0);
  s.teleport(0, -8, 0, -5.0);
  const g = s.plant(0, [-8, 1.0, -5.9])!;
  expect(pointJammed(s.sim, ATTACK, g.pos)).toBe(false);
  s.teleport(0, -8, 0, 4.0);
  s.detonate(0);
  s.wait(ticks(3));
  expect(s.sim.gadgets.get(j.id)).toBeUndefined();
});

row("sledge.breaching_hammer", "mute.signal_disruptor", async () => {
  // A swing at a jammer destroys it (UNVERIFIED: any damage does).
  const s = await lab();
  const j = jammer(s, 0, 13);
  s.teleport(0, 0, 0, 13.85);
  s.clients[0].cmd = { stance: Stance.Crouch };
  s.wait(32);
  const aim = { stance: Stance.Crouch, ...s.aimAt(0, j.pos) };
  s.handOut(0, Hand.Ability, aim);
  s.press(0, Btn.Fire, aim);
  s.wait(ticks(1));
  expect(s.sim.gadgets.get(j.id)).toBeUndefined();
});

row("generic.breach_charge", "mute.signal_disruptor", async () => {
  // A jammer stops the detonator of a Breach Charge close enough to destroy it; once an Impact EMP has it, the charge
  // goes and destroys it.
  const s = await lab(["fuze", "mute"]);
  gadgets(s, 0, "fuze", ["breach_charge"]);
  s.teleport(0, -8, 0, -5.0);
  const g = s.place(0, [-8, 1.2, -5.9])!;
  s.teleport(0, -8, 0, 4.0);
  const j = jammer(s, -8, -6.8);
  s.detonate(0, 1);
  s.wait(4);
  expect(s.sim.gadgets.get(g.id)?.id).toBe(g.id);
  s.setOff(s.put("impact_emp", 0, [-8, 0.05, -7.0]));
  s.detonate(0, 1);
  s.wait(4);
  expect([s.sim.gadgets.get(g.id), s.sim.gadgets.get(j.id)]).toEqual([undefined, undefined]);
});

row("generic.claymore", "mute.signal_disruptor", async () => {
  // A defender sets off a Claymore with a jammer in its arc: destroyed.
  const s = await lab();
  const clay = s.put("claymore", 0, [0, 0.07, 13], { yaw: 0 });
  const j = jammer(s, 0, 11.8);
  s.wait(32);
  s.teleport(1, -0.75, 0, 11.7);
  s.wait(2);
  expect([s.sim.gadgets.get(clay.id), s.sim.gadgets.get(j.id)]).toEqual([undefined, undefined]);
});

row("generic.frag", "mute.signal_disruptor", async () => {
  // A frag going off a metre away destroys it.
  const s = await lab();
  const j = jammer(s, 0, 13);
  s.setOff(s.put("frag", 0, [1.0, 0.04, 13]));
  expect(s.sim.gadgets.get(j.id)).toBeUndefined();
});

row("generic.impact_emp", "mute.signal_disruptor", async () => {
  // Within the EMP's 2 m a jammer is off for its 9 s (it jams nothing), then back on.
  const s = await lab();
  const j = jammer(s, 0, 13);
  const at: Vec3 = [0.5, 1.0, 13];
  expect(pointJammed(s.sim, ATTACK, at)).toBe(true);
  s.setOff(s.put("impact_emp", 0, [1.0, 0.05, 13]));
  expect([s.sim.gadgets.get(j.id)!.flags & GFlag.Off, pointJammed(s.sim, ATTACK, at)]).toEqual([GFlag.Off, false]);
  s.wait(ticks(9) + 2);
  expect([s.sim.gadgets.get(j.id)!.flags & GFlag.Off, pointJammed(s.sim, ATTACK, at)]).toEqual([0, true]);
});

row("weapon.bullet", "mute.signal_disruptor", async () => {
  // One bullet destroys it.
  const s = await lab();
  const j = jammer(s, 0, 13);
  s.teleport(0, 0, 0, 16);
  s.shootAt(0, j.pos);
  expect(s.sim.gadgets.get(j.id)).toBeUndefined();
});

row("player.melee", "mute.signal_disruptor", async () => {
  // A knife hit destroys it.
  const s = await lab();
  const j = jammer(s, 0, 13);
  s.teleport(0, 0, 0, 13.7);
  s.knife(0, j.pos, { stance: Stance.Crouch });
  expect(s.sim.gadgets.get(j.id)).toBeUndefined();
});

row("action.reinforce", "mute.signal_disruptor", async () => {
  // A jammer at the foot of a wall section Mute reinforces is crushed by its bar; one further out isn't.
  const s = await lab();
  const panel = s.panel("reinforce_2").panel;
  const foot = jammer(s, 1.8, -5.7);
  const out = jammer(s, 2.2, -5.2);
  s.teleport(1, 1.6, 0, -5.0, 0);
  s.clients[1].cmd = { buttons: Btn.Interact };
  for (let i = 0; i < 8 * 64 && panel.reinforced === 0; i++) s.tick();
  s.clients[1].cmd = {};
  s.wait(2);
  expect(panel.reinforced).not.toBe(0);
  expect([s.sim.gadgets.get(foot.id), s.sim.gadgets.get(out.id)?.id]).toEqual([undefined, out.id]);
});

// ================================================================ Pulse's Cardiac Sensor

/** Pulse (client 0) behind the plain soft wall facing it (+z), his sensor up (Z). */
async function sensor(ops = ["pulse", "sledge", "mute"]) {
  const s = await lab(ops);
  s.teleport(0, -8, 0, -8.5, 180);
  s.handOut(0, Hand.Ability, { yaw: Math.PI });
  return s;
}
const hearts = (s: Scene) => heartbeats(s.sim, s.body(0)).map((p) => p.id);

row("pulse.cardiac_sensor", "player.attacker", async () => {
  // Sledge's heartbeat through the wall within 10.5 m in front of him, not past it nor behind him; only Pulse sees it,
  // and a ping looking at it marks it for his team. He can't shoot while it's up.
  const s = await sensor();
  s.teleport(1, -8, 0, -4.0);
  expect(hearts(s)).toEqual([s.body(1).id]);
  // His ping toward it (through the wall): a heartbeat ping for Mute.
  const look = s.look(eyePose(s.sim.data.movement, s.sim.data.hitboxes, s.body(0).state).pos, [-8, 1.0, -4.0]);
  s.press(0, Btn.Ping, look);
  s.wait(2);
  const ping = sent(s, 2, "ping").at(-1);
  expect(ping?.heart).toBe(true);
  expect(Math.hypot(ping!.pos[0] + 8, ping!.pos[2] + 4)).toBeLessThan(0.3);
  expect(sent(s, 1, "ping").length).toBe(0);
  const shots = s.room.stats.shots;
  s.press(0, Btn.Fire, { yaw: Math.PI });
  s.wait(4);
  expect(s.room.stats.shots).toBe(shots);
  s.teleport(1, -8, 0, 2.6);
  expect(hearts(s)).toEqual([]);
  s.teleport(1, -8, 0, -12);
  expect(hearts(s)).toEqual([]);
});

row("pulse.cardiac_sensor", "player.attacker_dbno", async () => {
  // A downed attacker still has a heartbeat (UNVERIFIED: ours).
  const s = await sensor();
  s.teleport(1, -8, 0, -4.0);
  applyDamage(s.sim, s.body(1), { amount: s.body(1).state.hp, kill: false }, s.room.rules);
  s.wait(2);
  expect(s.body(1).state.mode).toBe(PawnMode.Downed);
  expect(hearts(s)).toEqual([s.body(1).id]);
});

row("pulse.cardiac_sensor", "player.defender", async () => {
  // His own side's heartbeats aren't shown: Mute in front of him, the defender dummy behind the wall.
  const s = await sensor();
  s.teleport(2, -7, 0, -7.0);
  expect(hearts(s)).toEqual([]);
});

row("pulse.cardiac_sensor", "drone.standard", async () => {
  // A drone has no heart: Sledge's drone in front of him isn't shown (Sledge himself is out of range).
  const s = await sensor();
  const drone = pilot(s, 1, -8, -4.5);
  expect(drone.kind).toBe(PawnKind.Drone);
  expect(hearts(s)).toEqual([]);
});

row("generic.smoke", "pulse.cardiac_sensor", async () => {
  // Through smoke as through walls (UNVERIFIED: inferred).
  const s = await sensor();
  s.teleport(1, -8, 0, -4.0);
  s.setOff(s.put("smoke", 1, [-8, 0.05, -7.3]));
  expect(hearts(s)).toEqual([s.body(1).id]);
});

row("generic.impact_emp", "pulse.cardiac_sensor", async () => {
  // An Impact EMP on Pulse (within its 2 m) freezes the sensor: nothing new for its 9 s, then it shows again.
  const s = await sensor();
  s.teleport(1, -8, 0, -4.0);
  s.room.gadgetServer.emp(ATTACK, [-8, 1.0, -8.5], 2, 9);
  expect(s.body(0).state.jammed).toBeGreaterThan(0);
  expect(hearts(s)).toEqual([]);
  s.wait(ticks(9) + 2);
  expect(hearts(s)).toEqual([s.body(1).id]);
});

