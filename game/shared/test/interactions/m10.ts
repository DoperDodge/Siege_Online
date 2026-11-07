// Interaction rows of Phase 8 M10 (gadgets/DESIGN.md §7, §12): Lesion's Gu mines, and Skopós's idle shell's barrier,
// camera and knife, on the Gadget Lab (the defuser's row on Oregon, which has sites). Lesion or Skopós is client 1; Lesion
// throws his mines with Z as a player does, or a test puts one straight into the table on the floor; the attacker
// (client 0, Sledge unless it says) walks into it, shoots, knifes or blows it up.
import { expect } from "vitest";
import {
  applyDamage,
  ATTACK,
  Btn,
  DeployKind,
  defaultLoadoutPick,
  eyePose,
  GFlag,
  guData,
  Hand,
  heartOf,
  kindOf,
  L_BACK,
  L_CORE,
  PawnKind,
  PawnMode,
  pointJammed,
  Stance,
  ticks,
  type Gadget,
  type Pawn,
} from "../../src/index.js";
import { scene, type Scene } from "./harness.js";
import { row } from "./registry.js";

/** `ops` (Sledge and Lesion unless it says) on the Gadget Lab, everyone out of the way. */
async function lab(ops: string[] = ["sledge", "lesion"]) {
  const s = await scene(ops, "gadget_lab");
  s.park();
  return s;
}

const gu = (s: Scene) => guData(s.sim.data)!;

/** A Gu mine of client i's (Lesion's: client 1) at rest on the floor at (x, z). */
function mine(s: Scene, x: number, z: number, i = 1): Gadget {
  return s.put("gu_mine", i, [x, s.sim.data.gadgets.get("gu_mine")!.sizeM[1] / 2, z]);
}

/** Whether an entry is still in the table. */
const there = (s: Scene, g: Gadget) => s.sim.gadgets.get(g.id) !== undefined;

/** Client i walks (teleported) to within half a metre of a mine: whether it's needled after. */
function stepOn(s: Scene, i: number, g: Gadget): boolean {
  s.teleport(i, g.pos[0] + 0.5, 0, g.pos[2]);
  s.wait(2);
  return s.body(i).state.needled;
}

/** A Signal Disruptor of client i's (a defender's unless `team` says) on the floor at (x, z). */
const jammer = (s: Scene, x: number, z: number, i = 1, team?: number) =>
  s.put("signal_disruptor", i, [x, s.sim.data.gadgets.get("signal_disruptor")!.sizeM[1] / 2, z], team === undefined ? {} : { team });

// ================================================================ what a mine does

row("lesion.gu_mine", "player.attacker", async () => {
  // Lesion throws one (Z, Fire; 1 to start) and it settles on the floor. Sledge walking within 1 m sets it off: it's
  // gone, 3 damage and a needle in him (no sprinting), then 12 every 2 s. A second mine: its 3 and a bite at once, the
  // timer started again. He pulls the needle (F held 2 s, standing): no more bites, sprinting again. Lesion has his
  // next mine 25 s on, and never more than 8 in all.
  const s = await lab();
  s.teleport(1, 0, 0, 17);
  expect(s.body(1).state.g2).toBe(1);
  s.handOut(1, Hand.Ability, { pitch: -0.6 });
  s.press(1, Btn.Fire, { pitch: -0.6 });
  s.wait(96);
  const g = s.sim.gadgets.list.find((e) => e.kind === kindOf("gu_mine"))!;
  expect(g).toBeDefined();
  expect([g.flags & GFlag.Flying, g.pos[1] < 0.2, s.body(1).state.g2]).toEqual([0, true, 0]);
  s.teleport(1, 20, 0, 25);
  const hp = s.body(0).state.hp;
  expect(stepOn(s, 0, g)).toBe(true);
  expect([there(s, g), hp - s.body(0).state.hp]).toEqual([false, gu(s).hit]);
  s.clients[0].cmd = { forward: 1, buttons: Btn.Sprint };
  s.wait(16);
  expect(s.body(0).state.sprinting).toBe(false);
  s.clients[0].cmd = {};
  const before = s.body(0).state.hp;
  s.wait(ticks(gu(s).everyS));
  expect(before - s.body(0).state.hp).toBe(gu(s).damage);
  // A second mine at his feet: its hit and a bite at once; the next bite a whole period later.
  const second = s.body(0).state.hp;
  mine(s, s.body(0).state.x + 0.3, s.body(0).state.z);
  s.wait(2);
  expect(second - s.body(0).state.hp).toBe(gu(s).hit + gu(s).damage);
  const third = s.body(0).state.hp;
  s.wait(ticks(gu(s).everyS) - 8);
  expect(s.body(0).state.hp).toBe(third);
  // The pull: F held standing for its time.
  s.clients[0].cmd = { buttons: Btn.Interact };
  s.wait(4);
  expect(s.body(0).state.deployKind).toBe(DeployKind.Needle);
  s.wait(ticks(gu(s).pullS));
  s.clients[0].cmd = {};
  s.wait(2);
  expect(s.body(0).state.needled).toBe(false);
  const clean = s.body(0).state.hp;
  s.wait(ticks(2 * gu(s).everyS));
  expect(s.body(0).state.hp).toBe(clean);
  s.clients[0].cmd = { forward: 1, buttons: Btn.Sprint };
  s.wait(16);
  expect(s.body(0).state.sprinting).toBe(true);
  s.clients[0].cmd = {};
  // Lesion's next mine, 25 s after the round's start: by now he has it; at 8 given, no more.
  const regen = s.sim.data.gadgets.get("gu_mine")!.regen!;
  s.wait(ticks(regen.everyS));
  expect(s.body(1).state.g2).toBeGreaterThanOrEqual(1);
  s.body(1).state.regenMade = s.sim.data.gadgets.get("gu_mine")!.count;
  const held = s.body(1).state.g2;
  s.wait(ticks(regen.everyS) + 2);
  expect(s.body(1).state.g2).toBe(held);
});

row("lesion.gu_mine", "player.attacker_dbno", async () => {
  // A downed attacker sets it off (it's gone: Y5S1), but no needle goes in.
  const s = await lab();
  s.teleport(0, 0, 0, 13);
  applyDamage(s.sim, s.body(0), { amount: s.body(0).state.hp, kill: false }, s.room.rules);
  s.wait(2);
  expect(s.body(0).state.mode).toBe(PawnMode.Downed);
  const g = mine(s, 0.5, 13);
  s.wait(2);
  expect([there(s, g), s.body(0).state.needled]).toEqual([false, false]);
});

row("lesion.gu_mine", "player.defender", async () => {
  // Lesion and his side walk over it: nothing, and it stays.
  const s = await lab();
  const g = mine(s, 0, 13);
  const hp = s.body(1).state.hp;
  expect(stepOn(s, 1, g)).toBe(false);
  s.wait(8);
  expect([there(s, g), s.body(1).state.hp]).toEqual([true, hp]);
});

row("lesion.gu_mine", "objective.defuser", async () => {
  // On Oregon, Sledge carrying the defuser in the Laundry can plant; needled, he can't plant (his Interact pulls the
  // needle instead) nor drop it; the needle out, he can plant again.
  const s = await scene(["sledge", "lesion"], "oregon");
  const LAUNDRY = [39.345, -3.2, 32.805] as const;
  s.teleport(1, 30, -3.2, 20);
  s.teleport(0, LAUNDRY[0], LAUNDRY[1], LAUNDRY[2]);
  s.sim.objective = { carrier: s.body(0).id, dropped: null, planted: null, site: "SITE_LAUNDRY", canPlant: true, plantTicks: ticks(7), disableTicks: ticks(7) };
  expect(s.sim.defuserActionFor(s.body(0))).toBe("plant");
  const g = s.put("gu_mine", 1, [LAUNDRY[0] + 0.4, LAUNDRY[1] + 0.03, LAUNDRY[2]]);
  s.wait(2);
  expect([there(s, g), s.body(0).state.needled, s.sim.defuserActionFor(s.body(0))]).toEqual([false, true, null]);
  s.press(0, Btn.Drop);
  expect([s.sim.objective!.carrier, s.sim.objective!.dropped]).toEqual([s.body(0).id, null]);
  s.clients[0].cmd = { buttons: Btn.Interact };
  s.wait(4);
  expect(s.body(0).state.deployKind).toBe(DeployKind.Needle);
  s.wait(ticks(gu(s).pullS));
  s.clients[0].cmd = {};
  s.wait(2);
  expect([s.body(0).state.needled, s.sim.defuserActionFor(s.body(0))]).toEqual([false, "plant"]);
});

row("lesion.gu_mine", "drone.standard", async () => {
  // A drone rolling over it doesn't set it off.
  const s = await lab();
  s.room.spawnPilot(s.clients[0].id, null, 0, ATTACK);
  s.room.rosterChanged();
  s.wait(8);
  const drone = s.sim.dronesOf(s.ctrlOf(0)).find((p) => p.state.mode === PawnMode.Walk)!;
  const g = mine(s, 0, 13);
  s.sim.placeDrone(drone.id, 0.3, 0.02, 13, 0);
  s.wait(16);
  expect(there(s, g)).toBe(true);
});

row("lesion.gu_mine", "brava.kludge_drone", async () => {
  // Nor does Brava's Kludge.
  const s = await lab(["brava", "lesion"]);
  s.teleport(0, 0, 0, 17);
  s.press(0, Btn.Ability);
  s.wait(4);
  const k: Pawn = s.sim.pawns.get(s.ctrlOf(0).drone)!;
  expect([k.kind, k.kludge]).toEqual([PawnKind.Drone, true]);
  const g = mine(s, 0, 13);
  s.sim.placeDrone(k.id, 0.3, 0.02, 13, 0);
  s.wait(16);
  expect(there(s, g)).toBe(true);
});

// ================================================================ what takes a mine

row("weapon.bullet", "lesion.gu_mine", async () => {
  // One bullet destroys it: nobody's needled.
  const s = await lab();
  const g = mine(s, 0, 13);
  s.teleport(0, 0, 0, 16);
  s.shootAt(0, g.pos);
  expect([there(s, g), s.body(0).state.needled]).toEqual([false, false]);
});

row("player.melee", "lesion.gu_mine", async () => {
  // A knife on it sets it off: the knifer, close, is needled (lesion.md).
  const s = await lab();
  const g = mine(s, 0, 13);
  s.teleport(0, 0, 0, 13.7);
  s.knife(0, g.pos, { stance: Stance.Crouch });
  expect([there(s, g), s.body(0).state.needled]).toEqual([false, true]);
});

row("sledge.breaching_hammer", "lesion.gu_mine", async () => {
  // The hammer on it sets it off too, Sledge needled (UNVERIFIED: the CSV's trigger_sting).
  const s = await lab();
  const g = mine(s, 0, 13);
  s.teleport(0, 0, 0, 13.85);
  s.clients[0].cmd = { stance: Stance.Crouch };
  s.wait(32);
  const aim = { stance: Stance.Crouch, ...s.aimAt(0, g.pos) };
  s.handOut(0, Hand.Ability, aim);
  s.press(0, Btn.Fire, aim);
  s.wait(ticks(1));
  expect([there(s, g), s.body(0).state.needled]).toEqual([false, true]);
});

row("thermite.exothermic_charge", "lesion.gu_mine", async () => {
  // Its blast destroys a mine on the far side of the wall.
  const s = await lab(["thermite", "lesion"]);
  s.teleport(0, -8, 0, -5.0);
  const c = s.plant(0, [-8, 1.4, -5.9])!;
  s.teleport(0, -8, 0, 4.0);
  const g = mine(s, -7.4, -7.0);
  s.detonate(0);
  s.wait(ticks(3.2));
  expect([s.sim.gadgets.get(c.id), there(s, g)]).toEqual([undefined, false]);
});

row("fuze.cluster_charge", "lesion.gu_mine", async () => {
  // Its grenades destroy a mine in the room behind the wall.
  const s = await lab(["fuze", "lesion"]);
  const g = mine(s, -7.2, -9.0);
  s.teleport(0, -8, 0, -5.0);
  s.plant(0, [-8, 1.0, -5.9]);
  s.teleport(0, -8, 0, 4.0);
  s.detonate(0);
  s.wait(ticks(3));
  expect(there(s, g)).toBe(false);
});

row("generic.breach_charge", "lesion.gu_mine", async () => {
  // A Breach Charge's blast destroys a mine close behind its wall.
  const s = await lab(["fuze", "lesion"]);
  s.room.pickLoadout(s.clients[0].id, { ...defaultLoadoutPick(s.sim.data, "fuze"), gadgets: ["breach_charge"] });
  s.wait(8);
  s.teleport(0, -8, 0, -5.0);
  const c = s.place(0, [-8, 1.2, -5.9])!;
  s.teleport(0, -8, 0, 4.0);
  const g = mine(s, -8, -6.8);
  s.detonate(0, 1);
  s.wait(4);
  expect([s.sim.gadgets.get(c.id), there(s, g)]).toEqual([undefined, false]);
});

row("generic.claymore", "lesion.gu_mine", async () => {
  // A Claymore set off with a mine in its arc destroys it (the defender who sets it off isn't Lesion's enemy: no sting).
  const s = await lab(["sledge", "lesion", "mute"]);
  const clay = s.put("claymore", 0, [0, 0.07, 13], { yaw: 0 });
  const g = mine(s, 0, 11.8);
  s.wait(32);
  s.teleport(2, -0.75, 0, 11.7);
  s.wait(2);
  expect([s.sim.gadgets.get(clay.id), there(s, g)]).toEqual([undefined, false]);
});

row("generic.frag", "lesion.gu_mine", async () => {
  // A frag going off a metre away destroys it.
  const s = await lab();
  const g = mine(s, 0, 13);
  s.setOff(s.put("frag", 0, [1.0, 0.04, 13]));
  expect(there(s, g)).toBe(false);
});

// ================================================================ what doesn't touch a mine

row("generic.impact_emp", "lesion.gu_mine", async () => {
  // Mechanical: an EMP on it does nothing; it still needles who steps on it.
  const s = await lab();
  const g = mine(s, 0, 13);
  s.setOff(s.put("impact_emp", 0, [0.5, 0.05, 13]));
  expect(s.sim.gadgets.get(g.id)!.flags & GFlag.Off).toBe(0);
  expect(stepOn(s, 0, g)).toBe(true);
});

row("mute.signal_disruptor", "lesion.gu_mine", async () => {
  // A jammer beside it changes nothing: it needles who steps on it.
  const s = await lab();
  jammer(s, 0.6, 13);
  const g = mine(s, 0, 13);
  expect(pointJammed(s.sim, ATTACK, g.pos)).toBe(true);
  expect(stepOn(s, 0, g)).toBe(true);
});

row("mute.signal_disruptor_converted", "lesion.gu_mine", async () => {
  // Nor does a jammer Brava converted (it jams the defenders' devices; a mine is none).
  const s = await lab();
  jammer(s, 0.6, 13, 1, ATTACK);
  const g = mine(s, 0, 13);
  expect(stepOn(s, 0, g)).toBe(true);
});

row("brava.kludge_drone", "lesion.gu_mine", async () => {
  // Mechanical: Brava's hack doesn't start on it.
  const s = await lab(["brava", "lesion"]);
  const g = mine(s, 0, 13);
  s.teleport(0, 0, 0, 20);
  s.press(0, Btn.Ability);
  s.wait(4);
  const k = s.sim.pawns.get(s.ctrlOf(0).drone)!;
  s.sim.placeDrone(k.id, 0, 0.02, 16, 0);
  s.wait(8);
  const view = s.look(s.sim.eyeOf(k).pos, g.pos);
  s.clients[0].cmd = { ...view };
  s.wait(4);
  s.clients[0].cmd = { ...view, buttons: Btn.Fire };
  s.wait(ticks(s.sim.data.gadgets.get("kludge_drone")!.kludge!.hackS) + 8);
  s.clients[0].cmd = { ...view };
  s.wait(2);
  expect([s.clients[0].events.some((e) => e.kind === "hack"), there(s, g)]).toEqual([false, true]);
});

row("dokkaebi.jegeo_payload", "lesion.gu_mine", async () => {
  // Not phone-run: Lesion's phone blown up, he still throws his mines and they still needle.
  const s = await lab(["dokkaebi", "lesion"]);
  s.teleport(1, 0, 0, 12);
  s.teleport(0, 0, 0, 18);
  s.room.spot(s.body(1).id, 60);
  const look = s.aimAt(0, heartOf(s.sim, s.body(1)));
  s.handOut(0, Hand.Ability, look);
  s.press(0, Btn.Fire, look);
  s.wait(ticks(s.sim.data.gadgets.get("jegeo_payload")!.jegeo!.uploadS) + 2);
  expect(s.ctrlOf(1).phoneLost).toBe(true);
  s.teleport(1, 0, 0, 6);
  s.handOut(1, Hand.Ability, { pitch: -0.6 });
  s.press(1, Btn.Fire, { pitch: -0.6 });
  s.wait(96);
  const g = s.sim.gadgets.list.find((e) => e.kind === kindOf("gu_mine"))!;
  expect(g).toBeDefined();
  s.teleport(1, 20, 0, 25);
  expect(stepOn(s, 0, g)).toBe(true);
});

row("action.reinforce", "lesion.gu_mine", async () => {
  // A mine at the foot of a wall section Lesion reinforces is crushed by its bar; one further out isn't.
  const s = await lab();
  const panel = s.panel("reinforce_2").panel;
  const foot = mine(s, 1.8, -5.7);
  const out = mine(s, 2.4, -4.9);
  s.teleport(1, 1.6, 0, -5.0, 0);
  s.clients[1].cmd = { buttons: Btn.Interact };
  for (let i = 0; i < 8 * 64 && panel.reinforced === 0; i++) s.tick();
  s.clients[1].cmd = {};
  s.wait(2);
  expect(panel.reinforced).not.toBe(0);
  expect([there(s, foot), there(s, out)]).toEqual([false, true]);
});

// ================================================================ Skopós: her idle shell's barrier and camera, her knife

/**
 * Skopós (client 1) and `ops` (Sledge first unless it says), her idle shell put at (x, z) facing `yawDeg` (its barrier
 * goes up in front of it, net/room.ts shellShields), the cameras on as a match has them. `tough`: the shell given hp
 * enough to live through the blast a row sets off (a blast goes through the barrier: it would kill the shell, and its
 * barrier would go with it before anyone could see it broken).
 */
async function shells(ops: string[] = ["sledge", "skopos"], x = 0, z = 13, yawDeg = 0, tough = false) {
  const s = await lab(ops);
  s.sim.matchRules.cameras = true;
  const ctrl = s.ctrlOf(1);
  const idle = s.sim.pawns.get(s.sim.bodyIds(ctrl).find((id) => id !== ctrl.possessedPawnId)!)!;
  if (tough) idle.state.hp = idle.state.maxHp = 5000;
  s.sim.teleport(idle.id, x, 0, z, yawDeg);
  s.wait(4);
  const barrier = () => s.sim.shellCams()[0];
  expect(barrier(), "her idle shell's barrier").toBeDefined();
  /** The idle shell's camera's place in the defenders' list (after the level's and the Bulletproof Cameras). */
  const cam = s.sim.level.def.cameras.length + s.sim.bpCams().length;
  return { s, idle, barrier, cam };
}

/** Whether an entry is broken (a barrier a blast took: no collider, its camera left). */
const broken = (g: Gadget | undefined) => g !== undefined && (g.flags & GFlag.Broken) !== 0;

row("weapon.bullet", "skopos.idle_shell_shield", async () => {
  // Bulletproof, its head-height window too: Sledge shooting at the shell's head from in front hits the barrier; the
  // shell is unhurt and the barrier whole.
  const { s, idle, barrier } = await shells(["sledge", "skopos"], 0, 13, 180);
  s.teleport(0, 0, 0, 17);
  const hp = idle.state.hp;
  s.shootAt(0, eyePose(s.sim.data.movement, s.sim.data.hitboxes, idle.state).pos);
  expect([idle.state.hp, broken(barrier())]).toEqual([hp, false]);
});

row("weapon.bullet", "skopos.shell_idle", async () => {
  // Bullets that reach the idle shell hurt it as a body. Its barrier is the game's (D-157): armour in front with wings
  // angled back, a glass canopy over its head, its sides and back open. From in front, even right up at the barrier
  // aiming down at its head, they stop at the armour or the glass; from beside it or behind, they hurt it.
  const { s, idle } = await shells(["sledge", "skopos"], 0, 13, 180);
  const hp = idle.state.hp;
  // Standing against its front (the shell faces +z), at the crouched shell's head under the canopy.
  s.teleport(0, 0, 0, 14.2);
  s.shootAt(0, eyePose(s.sim.data.movement, s.sim.data.hitboxes, idle.state).pos);
  expect(idle.state.hp).toBe(hp);
  s.teleport(0, 4, 0, 13);
  s.shootAt(0, heartOf(s.sim, idle));
  const beside = idle.state.hp;
  expect(beside).toBeLessThan(hp);
  s.teleport(0, 0, 0, 9);
  s.shootAt(0, heartOf(s.sim, idle));
  expect(idle.state.hp).toBeLessThan(beside);
});

row("weapon.bullet", "skopos.shell_active", async () => {
  // The shell she's in is her body: a bullet hurts it.
  const s = await lab(["sledge", "skopos"]);
  s.teleport(1, 0, 0, 13);
  s.teleport(0, 0, 0, 17);
  const hp = s.body(1).state.hp;
  s.shootAt(0, heartOf(s.sim, s.body(1)));
  expect(s.body(1).state.hp).toBeLessThan(hp);
});

row("generic.frag", "skopos.idle_shell_shield", async () => {
  // Not blast-proof: a frag going off in front of it, within its 3.6 m, breaks it; its entry stays, broken, as the shell's
  // camera (the shell, a little further, out of its reach). A blast's damage gets through it: the M2 row.
  const { s, barrier } = await shells(["sledge", "skopos"], 0, 13, 180);
  const b = barrier();
  s.setOff(s.put("frag", 0, [0, 0.04, b.pos[2] + 3.2]));
  expect([broken(barrier()), s.sim.shellCams().length]).toEqual([true, 1]);
});

row("generic.breach_charge", "skopos.idle_shell_shield", async () => {
  // A Breach Charge on the soft wall breaks the barrier of the shell crouched just behind it.
  const { s, barrier } = await shells(["fuze", "skopos"], -7.6, -7.2, 180, true);
  s.room.pickLoadout(s.clients[0].id, { ...defaultLoadoutPick(s.sim.data, "fuze"), gadgets: ["breach_charge"] });
  s.wait(8);
  s.teleport(0, -8, 0, -5.0);
  s.place(0, [-8, 1.2, -5.9]);
  s.teleport(0, -8, 0, 4.0);
  s.detonate(0, 1);
  s.wait(4);
  expect(broken(barrier())).toBe(true);
});

row("thermite.exothermic_charge", "skopos.idle_shell_shield", async () => {
  // Thermite's blast breaks it on the far side of the wall.
  const { s, barrier } = await shells(["thermite", "skopos"], -7.6, -7.2, 180, true);
  s.teleport(0, -8, 0, -5.0);
  s.plant(0, [-8, 1.4, -5.9]);
  s.teleport(0, -8, 0, 4.0);
  s.detonate(0);
  s.wait(ticks(3.2));
  expect(broken(barrier())).toBe(true);
});

row("fuze.cluster_charge", "skopos.idle_shell_shield", async () => {
  // His grenades in the room behind the wall break it.
  const { s, barrier } = await shells(["fuze", "skopos"], -7.0, -8.0, 180, true);
  s.teleport(0, -8, 0, -5.0);
  s.plant(0, [-8, 1.0, -5.9]);
  s.teleport(0, -8, 0, 4.0);
  s.detonate(0);
  s.wait(ticks(3));
  expect(broken(barrier())).toBe(true);
});

row("sledge.breaching_hammer", "skopos.idle_shell_shield", async () => {
  // A swing at it breaks it as a blast would (UNVERIFIED: the CSV's placeholder).
  const { s, barrier } = await shells(["sledge", "skopos"], 0, 13, 180);
  const b = barrier();
  s.teleport(0, 0, 0, 14.4);
  s.clients[0].cmd = { stance: Stance.Crouch };
  s.wait(32);
  const aim = { stance: Stance.Crouch, ...s.aimAt(0, b.pos) };
  s.handOut(0, Hand.Ability, aim);
  s.press(0, Btn.Fire, aim);
  s.wait(ticks(1));
  expect(broken(barrier())).toBe(true);
});

row("generic.claymore", "skopos.idle_shell_shield", async () => {
  // Her active shell walking into a Claymore's laser sets it off: the barrier in its arc breaks.
  const { s, barrier } = await shells(["sledge", "skopos"], 0, 11.3, 180, true);
  const clay = s.put("claymore", 0, [0, 0.07, 13], { yaw: 0 });
  s.wait(32);
  s.teleport(1, -0.75, 0, 11.7);
  s.wait(2);
  expect([s.sim.gadgets.get(clay.id), broken(barrier())]).toEqual([undefined, true]);
});

row("skopos.shell_idle", "player.attacker", async () => {
  // Her idle shell is a camera for the defence: Mute opens the cameras, goes on to it, and spots Sledge in front of it.
  const { s, cam } = await shells(["sledge", "skopos", "mute"], 0, 13, 180);
  s.teleport(0, 0, 0, 18);
  s.press(2, Btn.Observe);
  for (let k = 0; k < 4 && s.ctrlOf(2).cam !== cam + 1; k++) s.press(2, 0, { lean: 1 });
  expect(s.ctrlOf(2).cam).toBe(cam + 1);
  expect(s.scan(2, s.body(0))).toBe(true);
});

row("generic.smoke", "skopos.shell_idle", async () => {
  // Not a thermal camera: a smoke cloud between her idle shell and Sledge hides him from it.
  const { s, cam } = await shells(["sledge", "skopos", "mute"], 0, 13, 180);
  s.teleport(0, 0, 0, 20);
  s.press(2, Btn.Observe);
  for (let k = 0; k < 4 && s.ctrlOf(2).cam !== cam + 1; k++) s.press(2, 0, { lean: 1 });
  expect(s.ctrlOf(2).cam).toBe(cam + 1);
  expect(s.scan(2, s.body(0))).toBe(true);
  s.setOff(s.put("smoke", 0, [0, 0.05, 16.5]));
  expect(s.scan(2, s.body(0))).toBe(false);
});

row("dokkaebi.camera_hack", "skopos.shell_idle", async () => {
  // Her idle shell's camera is among the feeds a hacked phone lends the attackers (UNVERIFIED: ours).
  const { s, cam } = await shells(["dokkaebi", "skopos", "mute"], 0, 13, 180);
  s.teleport(2, -10, 0, 12);
  s.room.onLabTool(s.clients[2].id, { kind: "damage", pawnId: s.body(2).id, amount: 1000, kill: true });
  s.wait(2);
  s.handOut(0, Hand.Ability);
  s.press(0, Btn.Fire);
  expect(s.sim.matchRules.camsLent).toBe(true);
  s.press(0, Btn.Observe);
  for (let k = 0; k < 4 && s.ctrlOf(0).cam !== cam + 1; k++) s.press(0, 0, { lean: 1 });
  expect(s.ctrlOf(0).cam).toBe(cam + 1);
});

row("action.reinforce", "skopos.shell_idle", async () => {
  // Her idle shell crouched at the wall doesn't stop Mute reinforcing the section beside it, nor is its barrier crushed.
  const { s, barrier } = await shells(["sledge", "skopos", "mute"], 2.3, -5.4, 180);
  const panel = s.panel("reinforce_2").panel;
  s.teleport(2, 1.4, 0, -5.0, 0);
  s.clients[2].cmd = { buttons: Btn.Interact };
  for (let i = 0; i < 8 * 64 && panel.reinforced === 0; i++) s.tick();
  s.clients[2].cmd = {};
  s.wait(2);
  expect(panel.reinforced).not.toBe(0);
  expect(barrier()).toBeDefined();
});

/** Client i (standing at its spot, facing a wall's −z face… or a door) knifes the point `at`. */
function knifeAt(s: Scene, i: number, at: [number, number, number]) {
  s.knife(i, at);
}

row("skopos.shell_active", "surface.soft_wall", async () => {
  // Her knife (since Y11S1, as Aruni's) makes a bigger hole than anyone's and cuts the wooden studs; Sledge's, a small
  // one that leaves them.
  const s = await lab(["sledge", "skopos"]);
  // A stud of the wall with studs, at chest height.
  let x = -12.6;
  for (let k = 0; k < 120 && !s.solidAt("soft_studs", L_CORE, [x, 1.3, -6]); k++) x += 0.01;
  expect(s.solidAt("soft_studs", L_CORE, [x, 1.3, -6])).toBe(true);
  s.teleport(1, x, 0, -5.4);
  knifeAt(s, 1, [x, 1.3, -5.9]);
  // (The skin facing them, +z, is the panel's back layer; the knife goes in downward, so look where it went in.)
  expect([s.solidAt("soft_studs", L_BACK, [x, 1.3, -5.9]), s.solidAt("soft_studs", L_CORE, [x, 1.3, -6]), s.solidAt("soft_studs", L_BACK, [x + 0.22, 1.3, -5.9])]).toEqual([false, false, false]);
  // Sledge's, further along: a smaller hole (0.22 m off it is still whole).
  const y = -11.0;
  s.teleport(0, y, 0, -5.4);
  knifeAt(s, 0, [y, 1.3, -5.9]);
  expect([s.solidAt("soft_studs", L_BACK, [y, 1.3, -5.9]), s.solidAt("soft_studs", L_BACK, [y + 0.22, 1.3, -5.9])]).toEqual([false, true]);
});

row("skopos.shell_active", "surface.barricade", async () => {
  // Her knife breaks a barricade in one hit (UNVERIFIED: as Aruni's); Sledge's only wears it.
  const s = await lab(["sledge", "skopos"]);
  const door = s.panel("door_a").panel;
  s.teleport(0, -10, 0, 6.9);
  knifeAt(s, 0, [-10, 1.2, 6.05]);
  expect(door.broken).toBe(false);
  s.teleport(0, 20, 0, 25);
  s.teleport(1, -10, 0, 6.9);
  knifeAt(s, 1, [-10, 1.2, 6.05]);
  expect(door.broken).toBe(true);
});
