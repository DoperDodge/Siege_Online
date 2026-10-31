// Interaction rows of Phase 8 M5 (gadgets/DESIGN.md §7, §12): Thermite's Exothermic Charge and Fuze's Cluster Charge.
// For the surfaces, the detonator and the bullets, the operator (client 0) takes his charge out of his slot 2 with Z
// and places it with Fire held, as a player does, and presses his detonator; the rest put a charge straight into the
// table and set it off through the room's own path (gadgets/serve.ts `detonated`, as the detonator does), on the
// Gadget Lab's walls, floors, hatch, gadgets and bodies.
import { expect } from "vitest";
import {
  ATTACK,
  blastEffects,
  blastFalloff,
  Btn,
  DEFENSE,
  eyePose,
  GFlag,
  Hand,
  kindOf,
  L_BACK,
  L_CORE,
  L_FRONT,
  L_STEEL,
  PawnKind,
  PawnMode,
  Stance,
  ticks,
  type Gadget,
  type GameEvent,
  type InputCmd,
  type Pawn,
  type Vec3,
} from "../../src/index.js";
import { scene, type Scene } from "./harness.js";
import { row } from "./registry.js";

/** `ops` (Thermite or Fuze first, client 0) on the Gadget Lab, everyone out of the way. */
async function lab(ops: string[]) {
  const s = await scene(ops, "gadget_lab");
  s.park();
  return s;
}

const data = (s: Scene, id: string) => s.sim.data.gadgets.get(id)!;
const KIND_GRENADE = kindOf("cluster_grenade");
const DOWN_OR_DEAD = [PawnMode.Downed, PawnMode.Dead];

/** Client 0's charges left and waiting for his detonator (his slot 2). */
const left = (s: Scene) => s.body(0).state.g2;
const waiting = (s: Scene) => s.body(0).state.w2;

/** Blast events of a kind so far (client 0's). */
const blasts = (s: Scene, kind: string) => s.clients[0].events.filter((e) => e.kind === "blast" && e.gadget === kindOf(kind)).length;

/** The room's down or kill event for a pawn. */
function fell(s: Scene, id: number) {
  return s.clients[0].events.find((e): e is Extract<GameEvent, { kind: "down" | "kill" }> => (e.kind === "down" || e.kind === "kill") && e.victimPawn === id);
}

/** Whether a panel has no material in any of `layers` at the world point. */
const holeAt = (s: Scene, id: string, layers: number[], p: Vec3) => layers.every((l) => !s.solidAt(id, l, p));

/** Client 0 places his charge looking at `at` (the harness's `plant`): the entry, or undefined. */
const plant = (s: Scene, at: Vec3, hold: Partial<InputCmd> = {}) => s.plant(0, at, hold);

/** Client 0 presses his detonator (Z first if it isn't in hand). */
const detonate = (s: Scene) => s.detonate(0);

/** An entry of `kind` (client 0's) on a panel's face toward +z at (x, y), standing off it as one placed there does. */
function onWall(s: Scene, kind: string, id: string, x: number, y: number, faceZ = -5.9): Gadget {
  const pos: Vec3 = [x, y, faceZ + data(s, kind).sizeM[2] / 2];
  return s.put(kind, 0, pos, s.onPanel(id, pos));
}

/** Set a remote device off as its detonator does (Thermite's burns, Fuze's drills), and run `after` seconds. */
function setOffBy(s: Scene, g: Gadget, after: number) {
  s.room.gadgetServer.detonated(s.sim.gadgets.get(g.id)!);
  s.wait(ticks(after));
}

/** Thermite's charge set off, its burn run out (and its blast's ops applied). */
const burnOut = (s: Scene, g: Gadget) => setOffBy(s, g, data(s, "exothermic_charge").burnS! + 0.06);

/** How long a set-off cluster charge takes until its last grenade has gone off (`drill`: through steel or a shield). */
function clusterS(s: Scene, drill: boolean) {
  const c = data(s, "cluster_charge").cluster!;
  const k = data(s, "cluster_grenade").use;
  return (drill ? c.drillS : 0) + (c.count - 1) * c.everyS + (k.kind === "throw" ? k.fuseS! : 0) + 0.2;
}

/** Run `n` ticks, keeping every cluster grenade that came out (as first seen: where it left, how, when). */
function watch(s: Scene, n: number, seen = new Map<number, Gadget>()) {
  for (let i = 0; i < n; i++) {
    s.tick();
    for (const g of s.sim.gadgets.list) if (g.kind === KIND_GRENADE && !seen.has(g.id)) seen.set(g.id, { ...g });
  }
  return seen;
}

/** Skopós's idle shell (client i's other body), moved to (x, z) facing `yawDeg`. */
function idleShell(s: Scene, i: number, x: number, z: number): Pawn {
  const ctrl = s.sim.controllers.get(s.clients[i].session.ctrl!.id)!;
  const idle = s.sim.pawns.get(ctrl.pawnIds.find((id) => id !== ctrl.possessedPawnId)!)!;
  s.sim.teleport(idle.id, x, 0, z, 180);
  s.wait(2);
  return idle;
}

/** A gadget gone from the table; a Bulletproof Camera's glass broken instead (it stays in the feed list). */
function expectDestroyed(s: Scene, e: Gadget) {
  const now = s.sim.gadgets.get(e.id);
  if (e.kind === kindOf("bulletproof_camera")) expect(now!.flags & GFlag.Broken).toBe(GFlag.Broken);
  else expect(now).toBeUndefined();
}

// ================================================================ Thermite's Exothermic Charge

row("thermite.exothermic_charge", "surface.reinforced_wall", async () => {
  // Placed in 3 s on steel (standing on the floor below where he looks), his detonator sets it burning (sparks both
  // sides: GFlag.Active) and 3 s later a large hole goes through every layer, steel included (ours 1.5 × 2.0 m round
  // where it sat: from the floor up, to walk through).
  const s = await lab(["thermite", "mute"]);
  const n = left(s);
  s.teleport(0, 11.5, 0, -5.0);
  const g = plant(s, [11.5, 1.4, -5.9])!;
  expect([g.panel, left(s), waiting(s), s.body(0).state.hand]).toEqual([s.panel("reinforced").panel.spec.index, n - 1, 1, Hand.AbilityDetonator]);
  expect(g.pos[1] - data(s, "exothermic_charge").sizeM[1] / 2).toBeCloseTo(0.02, 2);
  s.teleport(0, 11.5, 0, -2.0); // out of his own blast
  detonate(s);
  s.wait(ticks(1.5));
  expect([s.sim.gadgets.get(g.id)!.flags & GFlag.Active, waiting(s)]).toEqual([GFlag.Active, 0]);
  expect(s.solidAt("reinforced", L_STEEL, [11.5, 1.0, -6])).toBe(true);
  s.wait(ticks(1.5) + 4);
  expect(s.sim.gadgets.get(g.id)).toBeUndefined();
  const all = [L_FRONT, L_CORE, L_BACK, L_STEEL];
  for (const p of [[11.5, 1.0], [10.85, 0.05], [12.15, 0.05], [10.85, 1.8], [12.15, 1.8]] as const) expect(holeAt(s, "reinforced", all, [p[0], p[1], -6]), `${p}`).toBe(true);
  expect(s.solidAt("reinforced", L_STEEL, [11.5, 2.2, -6])).toBe(true);
});

row("thermite.exothermic_charge", "surface.reinforced_hatch", async () => {
  // One charge opens a reinforced hatch whole (1,000,000 into its pool, Y5S3).
  const s = await lab(["thermite", "mute"]);
  s.room.queuePanelOp(s.panel("hatch").panel.spec.index, { kind: "reinforce", section: 0, side: 1 });
  s.wait(2);
  s.teleport(0, 10, 3.0, 8.9);
  const g = plant(s, [10, 3.0, 8.0], { stance: Stance.Crouch })!;
  expect(g.flags & GFlag.Flat).toBe(GFlag.Flat);
  s.clients[0].cmd = {};
  s.teleport(0, 10, 3.0, 11.5);
  detonate(s);
  s.wait(ticks(3) + 4);
  expect(s.panel("hatch").panel.broken).toBe(true);
});

row("thermite.exothermic_charge", "surface.soft_wall", async () => {
  // On a soft wall too: a larger opening than a Breach Charge's, studs and all.
  const s = await lab(["thermite", "mute"]);
  s.teleport(0, -12, 0, -5.0);
  expect(plant(s, [-12, 1.0, -5.9])).toBeDefined();
  s.teleport(0, -12, 0, -2.0);
  detonate(s);
  s.wait(ticks(3) + 4);
  const all = [L_FRONT, L_CORE, L_BACK];
  for (const p of [[-12, 1.0], [-12.65, 0.05], [-11.35, 0.05], [-12.65, 1.8], [-11.35, 1.8]] as const) expect(holeAt(s, "soft_studs", all, [p[0], p[1], -6]), `${p}`).toBe(true);
  const breach = s.sim.data.destruction.explosives.breach_charge;
  const exo = s.sim.data.destruction.explosives.exothermic_charge;
  expect(exo.shape === "rect" && breach.shape === "rect" && exo.wM * exo.hM > breach.wM * breach.hM).toBe(true);
});

row("thermite.exothermic_charge", "surface.soft_floor", async () => {
  // A bigger hole in a floor to see and shoot through; the metal joists stay (floors are never passable).
  const s = await lab(["thermite", "mute"]);
  const floor = s.panel("soft_floor").panel;
  const joists = floor.layers[L_CORE]!.reduce((a, b) => a + b, 0);
  s.teleport(0, 14.5, 3.0, 9.3);
  expect(plant(s, [14.5, 3.0, 8.4], { stance: Stance.Crouch })).toBeDefined();
  s.clients[0].cmd = {};
  s.teleport(0, 17, 3.0, 11.5);
  detonate(s);
  s.wait(ticks(3) + 4);
  expect(holeAt(s, "soft_floor", [L_FRONT, L_BACK], [14.5, 2.95, 8.4])).toBe(true);
  expect(floor.layers[L_CORE]!.reduce((a, b) => a + b, 0)).toBe(joists);
});

row("thermite.exothermic_charge", "surface.hatch", async () => {
  // An unreinforced hatch is opened.
  const s = await lab(["thermite", "mute"]);
  s.teleport(0, 10, 3.0, 8.9);
  expect(plant(s, [10, 3.0, 8.0], { stance: Stance.Crouch })).toBeDefined();
  s.clients[0].cmd = {};
  s.teleport(0, 10, 3.0, 11.5);
  detonate(s);
  s.wait(ticks(3) + 4);
  expect(s.panel("hatch").panel.broken).toBe(true);
});

row("thermite.exothermic_charge", "surface.hard_wall", async () => {
  // Not on a hard wall: Fire held there places nothing.
  const s = await lab(["thermite", "mute"]);
  const n = left(s);
  s.teleport(0, -8, 0, 7.0);
  expect(plant(s, [-8, 1.0, 6.1])).toBeUndefined();
  expect([left(s), waiting(s)]).toEqual([n, 0]);
});

row("thermite.exothermic_charge", "surface.barricade", async () => {
  // A barricade is a breakable surface: it goes on one (UNVERIFIED), and the blast breaks it.
  const s = await lab(["thermite", "mute"]);
  s.teleport(0, -10, 0, 7.0);
  const g = plant(s, [-10, 1.0, 6.05])!;
  expect(g.panel).toBe(s.panel("door_a").panel.spec.index);
  s.teleport(0, -10, 0, 10.0);
  detonate(s);
  s.wait(ticks(3) + 4);
  expect(s.panel("door_a").panel.broken).toBe(true);
});

/** Defender gadgets 1.1 m behind the plain soft wall, on the floor: the charge on its front at waist height reaches them. */
for (const kind of ["deployable_shield", "barbed_wire", "bulletproof_camera", "nitro_cell", "proximity_alarm", "observation_blocker"])
  row("thermite.exothermic_charge", `generic.${kind}`, async () => {
    const s = await lab(["thermite", "mute"]);
    const e = s.put(kind, 1, [-8.6, data(s, kind).sizeM[1] / 2, -7.0], { yaw: Math.PI });
    s.wait(2);
    burnOut(s, onWall(s, "exothermic_charge", "soft_plain", -8, 1.0));
    expectDestroyed(s, e);
  });

row("thermite.exothermic_charge", "skopos.shell_idle", async () => {
  // Her idle shell behind the wall is a body to the blast: hurt by its far-side curve (UNVERIFIED); the shell she's in isn't.
  const s = await lab(["thermite", "skopos"]);
  const idle = idleShell(s, 1, -6.5, -8.5);
  const g = onWall(s, "exothermic_charge", "soft_plain", -8, 1.0);
  setOffBy(s, g, data(s, "exothermic_charge").burnS! - 0.05); // the blast's damage where she stands just before it
  const want = blastEffects(s.sim, g, data(s, "exothermic_charge").blast!, g.pos).bodies.find((b) => b.pawn === idle)?.damage ?? 0;
  expect(want).toBeGreaterThan(0);
  expect(want).toBeLessThan(100);
  const [hp, active] = [idle.state.hp, s.body(1).state.hp];
  s.wait(8);
  expect([s.sim.gadgets.get(g.id), idle.state.hp, s.body(1).state.hp]).toEqual([undefined, hp - want, active]);
});

row("thermite.exothermic_charge", "player.defender", async () => {
  // 220 on the far side (Y11S3.1): all of it close to the wall, less by its curve further, none past 3.5 m.
  const s = await lab(["thermite", "mute"]);
  const g = onWall(s, "exothermic_charge", "soft_plain", -8, 1.0);
  const b = data(s, "exothermic_charge").blast!;
  const hurt = () => blastEffects(s.sim, g, b, g.pos).bodies.find((x) => x.pawn === s.body(1))?.damage ?? 0;
  s.teleport(1, -6.8, 0, -8.6);
  const far = hurt();
  expect(far).toBeGreaterThan(0);
  expect(far).toBeLessThan(220);
  s.teleport(1, -6.8, 0, -10.5);
  expect(hurt()).toBe(0);
  s.teleport(1, -8.6, 0, -6.6);
  expect(hurt()).toBe(220);
  burnOut(s, g);
  expect(DOWN_OR_DEAD).toContain(s.body(1).state.mode);
  expect(fell(s, s.body(1).id)?.weapon).toBe("exothermic_charge");
});

row("thermite.exothermic_charge", "player.attacker", async () => {
  // Everyone in it, Thermite too; on his side it's lethal only at point blank: right at it he's down or dead, a
  // teammate 1.5 m back on his side takes nothing.
  const s = await lab(["thermite", "mute", "sledge"]);
  const g = onWall(s, "exothermic_charge", "soft_plain", -8, 1.0);
  s.teleport(0, -8, 0, -5.45);
  s.teleport(2, -9, 0, -4.0);
  const fx = blastEffects(s.sim, g, data(s, "exothermic_charge").blast!, g.pos);
  expect(fx.bodies.find((x) => x.pawn === s.body(2))).toBeUndefined();
  const hp = s.body(2).state.hp;
  burnOut(s, g);
  expect(DOWN_OR_DEAD).toContain(s.body(0).state.mode);
  expect(s.body(2).state.hp).toBe(hp);
});

// ================================================================ Fuze's Cluster Charge

row("fuze.cluster_charge", "surface.soft_wall", async () => {
  // Through a soft wall at once: its hole, and 5 grenades out on the far side one after another, from his left to his
  // right (he faces −z: −x first), each going off in the order they came out; then it falls. One at a time: placing a
  // second (on the next wall but two, out of the grenades' reach: they'd destroy it) sets the first off, the second waiting.
  const s = await lab(["fuze", "mute"]);
  const n = left(s);
  s.teleport(0, -8.6, 0, -5.0);
  const first = plant(s, [-8.6, 1.0, -5.9])!;
  expect([waiting(s), s.sim.gadgets.list.filter((g) => g.kind === KIND_GRENADE).length]).toEqual([1, 0]);
  s.teleport(0, 6, 0, -5.0);
  const second = plant(s, [6, 1.0, -5.9])!;
  s.teleport(0, -8, 0, 4.0); // out of the grenades' way
  const seen = watch(s, ticks(clusterS(s, false)), watch(s, 0));
  expect([left(s), waiting(s), s.sim.gadgets.get(first.id), s.sim.gadgets.get(second.id)?.flags ?? -1]).toEqual([n - 2, 1, undefined, second.flags]);
  expect(holeAt(s, "soft_plain", [L_FRONT, L_BACK], [-8.6, 1.0, -6])).toBe(true);
  const out = [...seen.values()];
  const c = data(s, "cluster_charge").cluster!;
  expect(out.length).toBe(c.count);
  expect(out.every((g) => g.pos[2] < -6.1)).toBe(true);
  expect(out.map((g) => g.launchTick)).toEqual(out.map((g) => g.launchTick).sort((a, b) => a - b));
  expect(out[1].launchTick - out[0].launchTick).toBe(ticks(c.everyS));
  expect(out[0].vel[0]).toBeLessThan(0);
  expect(out[out.length - 1].vel[0]).toBeGreaterThan(0);
  expect(blasts(s, "cluster_grenade")).toBe(c.count);
  // The second goes when he presses his detonator, wherever he is.
  detonate(s);
  watch(s, ticks(clusterS(s, false)));
  expect([s.sim.gadgets.get(second.id), blasts(s, "cluster_grenade"), waiting(s)]).toEqual([undefined, 2 * c.count, 0]);
});

row("fuze.cluster_charge", "surface.soft_floor", async () => {
  // Through a floor at once: a hole to see through (the joists stay), its grenades dropping into the room below.
  const s = await lab(["fuze", "mute"]);
  const floor = s.panel("soft_floor").panel;
  const joists = floor.layers[L_CORE]!.reduce((a, b) => a + b, 0);
  s.teleport(0, 14.5, 3.0, 9.0);
  const g = plant(s, [14.5, 3.0, 8.3], { stance: Stance.Crouch })!;
  expect(g.flags & GFlag.Flat).toBe(GFlag.Flat);
  s.clients[0].cmd = {};
  s.teleport(0, 17, 3.0, 11.5);
  detonate(s);
  const seen = watch(s, 4);
  const first = [...seen.values()][0];
  expect(first.pos[1]).toBeLessThan(2.9);
  expect(first.vel[1]).toBeLessThan(0);
  expect(holeAt(s, "soft_floor", [L_FRONT, L_BACK], [14.5, 2.95, 8.3])).toBe(true);
  expect(floor.layers[L_CORE]!.reduce((a, b) => a + b, 0)).toBe(joists);
});

row("fuze.cluster_charge", "surface.hatch", async () => {
  // Through a hatch at once (a soft surface): its grenades drop below; the hatch itself stays (only the tube goes through).
  const s = await lab(["fuze", "mute"]);
  s.teleport(0, 10, 3.0, 8.9);
  expect(plant(s, [10, 3.0, 8.0], { stance: Stance.Crouch })).toBeDefined();
  s.clients[0].cmd = {};
  s.teleport(0, 10, 3.0, 11.5);
  detonate(s);
  const first = [...watch(s, 4).values()][0];
  expect(first.pos[1]).toBeLessThan(2.9);
  expect(s.panel("hatch").panel.broken).toBe(false);
});

row("fuze.cluster_charge", "surface.barricade", async () => {
  // Through a barricade at once: it breaks, and the grenades go on into the room.
  const s = await lab(["fuze", "mute"]);
  s.teleport(0, -10, 0, 7.0);
  expect(plant(s, [-10, 1.0, 6.05])?.panel).toBe(s.panel("door_a").panel.spec.index);
  s.teleport(0, -10, 0, 12.0);
  detonate(s);
  const first = [...watch(s, 4).values()][0];
  expect(first.pos[2]).toBeLessThan(5.95);
  expect(s.panel("door_a").panel.broken).toBe(true);
});

row("fuze.cluster_charge", "surface.reinforced_wall", async () => {
  // Steel since Y6S3: it drills 1.75 s first (Y11S2.3), then its tube is through (a hole in the steel too) and the grenades come out.
  const s = await lab(["fuze", "mute"]);
  s.teleport(0, 11.5, 0, -5.0);
  const g = plant(s, [11.5, 1.0, -5.9])!;
  s.teleport(0, 11.5, 0, -1.0);
  detonate(s);
  const drill = ticks(data(s, "cluster_charge").cluster!.drillS);
  const seen = watch(s, drill - 6);
  expect([seen.size, s.sim.gadgets.get(g.id)!.flags & GFlag.Active, s.solidAt("reinforced", L_STEEL, [11.5, 1.0, -6])]).toEqual([0, GFlag.Active, true]);
  watch(s, 10, seen);
  expect(seen.size).toBeGreaterThan(0);
  expect([...seen.values()][0].pos[2]).toBeLessThan(-6.1);
  expect(holeAt(s, "reinforced", [L_FRONT, L_BACK, L_STEEL], [11.5, 1.0, -6])).toBe(true);
});

row("fuze.cluster_charge", "surface.reinforced_hatch", async () => {
  // A reinforced hatch the same: 1.75 s of drilling, then the grenades drop below.
  const s = await lab(["fuze", "mute"]);
  s.room.queuePanelOp(s.panel("hatch").panel.spec.index, { kind: "reinforce", section: 0, side: 1 });
  s.wait(2);
  s.teleport(0, 10, 3.0, 8.9);
  expect(plant(s, [10, 3.0, 8.0], { stance: Stance.Crouch })).toBeDefined();
  s.clients[0].cmd = {};
  s.teleport(0, 10, 3.0, 11.5);
  detonate(s);
  const drill = ticks(data(s, "cluster_charge").cluster!.drillS);
  const seen = watch(s, drill - 6);
  expect(seen.size).toBe(0);
  watch(s, 10, seen);
  expect([...seen.values()][0].pos[1]).toBeLessThan(2.9);
  expect([s.panel("hatch").panel.broken, s.panel("hatch").panel.reinforced]).toEqual([false, 1]);
});

row("fuze.cluster_charge", "surface.hard_wall", async () => {
  // Not on a hard wall.
  const s = await lab(["fuze", "mute"]);
  const n = left(s);
  s.teleport(0, -8, 0, 7.0);
  expect(plant(s, [-8, 1.0, 6.1])).toBeUndefined();
  expect(left(s)).toBe(n);
});

row("fuze.cluster_charge", "generic.deployable_shield", async () => {
  // On a deployable shield's front (Y8S3): it drills 1.75 s, its glass shatters, the grenades come out behind it, and
  // their blasts destroy it.
  const s = await lab(["fuze", "mute"]);
  const shield = s.put("deployable_shield", 1, [0, 0.5, 13], { yaw: Math.PI });
  s.wait(2);
  s.teleport(0, 0, 0, 14.2);
  const g = plant(s, [0, 0.6, 13.06])!;
  expect([g.panel, g.pos[2]]).toEqual([-1, expect.closeTo(13.16, 2)]);
  s.teleport(0, 0, 0, 22);
  detonate(s);
  const drill = ticks(data(s, "cluster_charge").cluster!.drillS);
  const seen = watch(s, drill + 4);
  expect(s.sim.gadgets.get(shield.id)!.flags & GFlag.Hit).toBe(GFlag.Hit);
  expect([...seen.values()][0].pos[2]).toBeLessThan(12.94);
  watch(s, ticks(clusterS(s, false)), seen);
  expect(s.sim.gadgets.get(shield.id)).toBeUndefined();
});

/** Defender gadgets 2 m behind the plain soft wall: the grenades out of a charge on its front destroy them. */
for (const kind of ["bulletproof_camera", "nitro_cell", "barbed_wire", "proximity_alarm", "observation_blocker"])
  row("fuze.cluster_charge", `generic.${kind}`, async () => {
    const s = await lab(["fuze", "mute"]);
    const e = s.put(kind, 1, [-8.6, data(s, kind).sizeM[1] / 2, -8.1], { yaw: Math.PI });
    s.wait(2);
    setOffBy(s, onWall(s, "cluster_charge", "soft_plain", -8, 1.0), clusterS(s, false));
    expectDestroyed(s, e);
  });

row("fuze.cluster_charge", "skopos.shell_idle", async () => {
  // Her idle shell in the room is a body to the grenades (UNVERIFIED): hurt; the shell she's in isn't.
  const s = await lab(["fuze", "skopos"]);
  const idle = idleShell(s, 1, -6.5, -9.0);
  const [hp, active] = [idle.state.hp, s.body(1).state.hp];
  setOffBy(s, onWall(s, "cluster_charge", "soft_plain", -8, 1.0), clusterS(s, false));
  expect(idle.state.hp).toBeLessThan(hp);
  expect(s.body(1).state.hp).toBe(active);
});

row("fuze.cluster_charge", "player.defender", async () => {
  // Each grenade: lethal to everyone within 1.2 m, to the 100 hp (1-health) operators within 2 m, nothing past 4.2 m
  // (Fandom); credited to the Cluster Charge.
  const s = await lab(["fuze", "mute"]);
  const b = data(s, "cluster_grenade").blast!;
  const most = Math.max(...Object.values(s.sim.data.movement.healthByRating));
  expect(blastFalloff(b.damage, 1.2)).toBeGreaterThanOrEqual(most);
  expect(blastFalloff(b.damage, 2.0)).toBeGreaterThanOrEqual(s.sim.data.movement.healthByRating["1"]);
  expect(blastFalloff(b.damage, 4.2)).toBe(0);
  s.teleport(1, 0, 0, 13.6);
  s.setOff(s.put("cluster_grenade", 0, [0, 0.04, 13]));
  expect(DOWN_OR_DEAD).toContain(s.body(1).state.mode);
  expect(fell(s, s.body(1).id)?.weapon).toBe("cluster_charge");
});

row("fuze.cluster_charge", "drone.standard", async () => {
  // Its blasts destroy drones of both teams: a teammate's drone (Sledge's, as a pilot) beside one goes.
  const s = await lab(["fuze", "mute", "sledge"]);
  s.room.spawnPilot(s.clients[2].id, null, 0, ATTACK);
  s.room.rosterChanged();
  s.wait(8);
  const drone = [...s.sim.pawns.values()].find((p) => p.kind === PawnKind.Drone && p.team === s.body(0).team && p.state.mode === PawnMode.Walk)!;
  s.setOff(s.put("cluster_grenade", 0, [drone.state.x + 1, drone.state.y + 0.04, drone.state.z]));
  expect(drone.state.mode).toBe(PawnMode.Dead);
  expect(s.clients[2].events.some((e) => e.kind === "droneDestroyed" && e.pawnId === drone.id)).toBe(true);
});

// ================================================================ what stops them

/** The Bulletproof Camera's dart (Phase 7 M5): a 0.75 m EMP for its 6 s (data/intel.json). */
function dart(s: Scene, at: Vec3) {
  const b = s.sim.data.intel.bulletproofCamera;
  s.room.gadgetServer.emp(DEFENSE, at, b.dartRadiusM, b.disableS);
}

for (const [op, kind] of [["thermite", "exothermic_charge"], ["fuze", "cluster_charge"]] as const)
  row("generic.bulletproof_camera_dart", `${op}.${kind}`, async () => {
    // A dart on the charge (from the wall's far side) or on him: his detonator does nothing until it wears off (Y10S4).
    const s = await lab([op, "mute"]);
    s.teleport(0, -8, 0, -5.0);
    const g = plant(s, [-8, 1.0, -5.9])!;
    s.teleport(0, -8, 0, 4.0);
    const active = () => s.sim.gadgets.get(g.id)?.flags ?? 0;
    dart(s, [-8, 1.0, -6.5]);
    expect([active() & GFlag.Off, s.body(0).state.jammed]).toEqual([GFlag.Off, 0]);
    detonate(s);
    s.wait(4);
    expect(active() & GFlag.Active).toBe(0);
    s.wait(ticks(s.sim.data.intel.bulletproofCamera.disableS));
    expect(active() & GFlag.Off).toBe(0);
    dart(s, eyePose(s.sim.data.movement, s.sim.data.hitboxes, s.body(0).state).pos);
    expect(s.body(0).state.jammed).toBeGreaterThan(0);
    detonate(s);
    s.wait(4);
    expect(active() & GFlag.Active).toBe(0);
    s.wait(ticks(s.sim.data.intel.bulletproofCamera.disableS));
    detonate(s);
    s.wait(2);
    expect(s.sim.gadgets.get(g.id) === undefined || (active() & GFlag.Active) !== 0).toBe(true);
  });

/** Fuze's charge drilling the reinforced wall (set off as his detonator does), and how many grenades have come out. */
function drilling(s: Scene) {
  const g = onWall(s, "cluster_charge", "reinforced", 11.5, 1.0);
  s.room.gadgetServer.detonated(g);
  s.wait(ticks(0.5));
  expect(s.sim.gadgets.get(g.id)!.flags & GFlag.Active).toBe(GFlag.Active);
  return g;
}

for (const from of ["nitro_cell", "impact_grenade"])
  row(`generic.${from}`, "fuze.cluster_charge", async () => {
    // A blast on the far side reaches its tube while it drills steel: it's destroyed, and one grenade has come out
    // (however quick, Y6S3).
    const s = await lab(["fuze", "mute"]);
    const g = drilling(s);
    const seen = watch(s, 0);
    s.room.gadgetServer.trigger(s.put(from, 1, [12.3, 0.05, -6.9]), null);
    watch(s, 3, seen);
    expect([s.sim.gadgets.get(g.id), seen.size]).toEqual([undefined, 1]);
  });

for (const from of ["nitro_cell", "impact_grenade"])
  row(`generic.${from}`, "thermite.exothermic_charge", async () => {
    // Any damage destroys it once placed: a blast beyond the soft wall it's on reaches it, and it never goes off.
    const s = await lab(["thermite", "mute"]);
    const g = onWall(s, "exothermic_charge", "soft_plain", -8, 1.0);
    s.setOff(s.put(from, 1, [-8, 0.05, -6.9]));
    expect([s.sim.gadgets.get(g.id), blasts(s, "exothermic_charge")]).toEqual([undefined, 0]);
  });

row("weapon.bullet", "fuze.cluster_charge", async () => {
  // From the far side it can't be shot until its tube is through: Mute's bullet stops at the steel; once it drills, his
  // bullet meets the tube there and destroys it, one grenade out.
  const s = await lab(["fuze", "mute"]);
  const g = onWall(s, "cluster_charge", "reinforced", 11.5, 1.0);
  s.teleport(1, 13.5, 0, -7.5);
  s.shootAt(1, [11.5, 1.0, -6.35]);
  expect(s.sim.gadgets.get(g.id)?.id).toBe(g.id);
  s.room.gadgetServer.detonated(s.sim.gadgets.get(g.id)!);
  const seen = watch(s, 0);
  const aim = s.aimAt(1, [11.5, 1.0, -6.35]);
  s.clients[1].cmd = { ...aim, buttons: Btn.Ads };
  watch(s, 64, seen);
  expect(seen.size).toBe(0);
  s.clients[1].cmd = { ...aim, buttons: Btn.Ads | Btn.Fire };
  watch(s, 1, seen);
  s.clients[1].cmd = { ...aim };
  watch(s, 8, seen);
  expect([s.sim.gadgets.get(g.id), seen.size]).toEqual([undefined, 1]);
});

row("weapon.bullet", "thermite.exothermic_charge", async () => {
  // Any damage destroys it once placed, waiting (his detonator has one fewer to set off) or burning (it never goes off).
  const s = await lab(["thermite", "mute"]);
  s.teleport(0, -8.5, 0, -5.0);
  const g = plant(s, [-8.5, 1.0, -5.9])!;
  s.teleport(0, -8, 0, 4.0);
  s.teleport(1, -8.5, 0, -2.5);
  s.shootAt(1, g.pos);
  expect([s.sim.gadgets.get(g.id), waiting(s)]).toEqual([undefined, 0]);
  s.teleport(0, -7.2, 0, -5.0);
  const h = plant(s, [-7.2, 1.0, -5.9])!;
  s.teleport(0, -8, 0, 4.0);
  detonate(s);
  s.wait(4);
  expect(s.sim.gadgets.get(h.id)!.flags & GFlag.Active).toBe(GFlag.Active);
  s.teleport(1, -7.2, 0, -2.5);
  s.shootAt(1, h.pos);
  s.wait(ticks(3));
  expect([s.sim.gadgets.get(h.id), blasts(s, "exothermic_charge")]).toEqual([undefined, 0]);
});

