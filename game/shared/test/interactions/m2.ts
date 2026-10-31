// Interaction rows of Phase 8 M2 (gadgets/DESIGN.md §5, §12): the lethal generics' blasts on gadgets, drones, surfaces
// and bodies, the Claymore's tripwire, and bullets and the knife on the fragile gadgets. Each sets its scene up on the
// Destruction Lab level and goes through the room's own path: a gadget set off as its fuse, detonator or tripwire sets
// it off (or a body placing one with its hands and its fuse running out), a shot down the sights, a knife.
import { expect } from "vitest";
import {
  ATTACK,
  blastEffects,
  Btn,
  defaultLoadoutPick,
  GFlag,
  kindId,
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
  type Vec3,
} from "../../src/index.js";
import { scene, type Scene } from "./harness.js";
import { row } from "./registry.js";

/** The client on a gadget's side: 0 (Sledge, an attacker) or 1 (Mute, a defender). */
const sideOf = (s: Scene, kind: string) => (s.sim.data.gadgets.get(kind)!.side === "attacker" ? 0 : 1);

const CHARGES = new Set(["breach_charge", "hard_breach_charge"]);

/** A charge on a panel's face toward +z at `pos` (its face, as one placed there stands off it), its side's. */
function charge(s: Scene, kind: string, id: string, x: number, y: number, faceZ: number): Gadget {
  const pos: Vec3 = [x, y, faceZ + s.sim.data.gadgets.get(kind)!.sizeM[2] / 2];
  return s.put(kind, sideOf(s, kind), pos, s.onPanel(id, pos));
}

/** A charge on the plain soft wall's front at (x, y). */
const onSoftWall = (s: Scene, kind: string, x = -8, y = 1.0) => charge(s, kind, "soft_plain", x, y, -5.9);

/** A charge lying on a floor or hatch's top (at y 3.0, the platform's) at (x, z). */
function onTop(s: Scene, kind: string, id: string, x: number, z: number): Gadget {
  const pos: Vec3 = [x, 3.0 + s.sim.data.gadgets.get(kind)!.sizeM[2] / 2, z];
  return s.put(kind, sideOf(s, kind), pos, s.onPanel(id, pos, true));
}

/** The damage the blast of `g` going off now does to client i's body (as the room computes it, before it does). */
function damageOf(s: Scene, g: Gadget): (i: number) => number {
  const fx = blastEffects(s.sim, g, s.sim.data.gadgets.get(kindId(g.kind)!)!.blast!, g.pos);
  const bodies = fx.bodies.map((b) => ({ id: b.pawn.id, damage: b.damage }));
  return (i) => bodies.find((b) => b.id === s.body(i).id)?.damage ?? 0;
}

const DOWN_OR_DEAD = [PawnMode.Downed, PawnMode.Dead];

/** The room's down or kill event for client i's body: whose it was, with what. */
function fell(s: Scene, i: number) {
  const id = s.body(i).id;
  return s.clients[0].events.find((e): e is Extract<GameEvent, { kind: "down" | "kill" }> => (e.kind === "down" || e.kind === "kill") && e.victimPawn === id);
}

const blasts = (s: Scene) => s.clients[0].events.filter((e) => e.kind === "blast").length;

/** Whether a panel has no material in any of `layers` at the world point. */
const holeAt = (s: Scene, id: string, layers: number[], p: Vec3) => layers.every((l) => !s.solidAt(id, l, p));

// ---------------------------------------------------------------- what a blast destroys

/** A target where it would be: a charge on the plain soft wall at waist height, the rest on the floor 0.9 m in front. */
const targetOf = (s: Scene, kind: string) => (CHARGES.has(kind) ? onSoftWall(s, kind) : s.put(kind, sideOf(s, kind), [-8, 0.1, -5.0]));

/** A blast close to those: a Breach Charge on that wall too, the rest on the floor 1.3 m out (the Claymore facing the wall). */
const sourceOf = (s: Scene, kind: string) => (CHARGES.has(kind) ? onSoftWall(s, kind, -8.3) : s.put(kind, sideOf(s, kind), [-8, 0.07, -4.6], { yaw: 0 }));

/** Gone from the table; a Bulletproof Camera's glass broken instead (it stays in the feed list, as a broken default camera does). */
function expectDestroyed(s: Scene, e: Gadget) {
  const now = s.sim.gadgets.get(e.id);
  if (e.kind === kindOf("bulletproof_camera")) expect(now!.flags & GFlag.Broken).toBe(GFlag.Broken);
  else expect(now).toBeUndefined();
}

const DEFENDERS = ["deployable_shield", "barbed_wire", "bulletproof_camera", "nitro_cell", "proximity_alarm", "observation_blocker"];
const ATTACKERS = ["breach_charge", "hard_breach_charge", "claymore"];
const DESTROYS: [string, string[]][] = [
  ["breach_charge", DEFENDERS],
  ["claymore", DEFENDERS],
  ["frag", DEFENDERS],
  ["nitro_cell", ATTACKERS],
  ["impact_grenade", ATTACKERS],
];
for (const [from, targets] of DESTROYS)
  for (const kind of targets)
    row(`generic.${from}`, `generic.${kind}`, async () => {
      const s = await scene();
      s.park();
      const e = targetOf(s, kind);
      s.setOff(sourceOf(s, from));
      expectDestroyed(s, e);
    });

for (const from of ["nitro_cell", "impact_grenade"])
  row(`generic.${from}`, "drone.standard", async () => {
    // Any damage destroys a drone: Sledge as a pilot (prep's) with his drones, the first out where he spawned.
    const s = await scene();
    s.park();
    s.room.spawnPilot(s.clients[0].id, null, 0, ATTACK);
    s.wait(8);
    const drone = [...s.sim.pawns.values()].find((p) => p.kind === PawnKind.Drone && p.state.mode === PawnMode.Walk)!;
    s.setOff(s.put(from, 1, [drone.state.x + 1, drone.state.y + 0.05, drone.state.z]));
    expect(drone.state.mode).toBe(PawnMode.Dead);
    expect(s.clients[0].events.some((e) => e.kind === "droneDestroyed" && e.pawnId === drone.id)).toBe(true);
  });

// ---------------------------------------------------------------- blasts on bodies

row("generic.breach_charge", "player.defender", async () => {
  // Lethal close on the far side (ours: 150 within 0.5 m, none past 3 m): Mute right behind the wall is down or dead,
  // credited to the charge; Pulse 3.5 m behind it is untouched.
  const s = await scene(["sledge", "mute", "pulse"]);
  s.park();
  s.teleport(1, -8, 0, -6.5);
  s.teleport(2, -8, 0, -9.6);
  const g = onSoftWall(s, "breach_charge");
  const dmg = damageOf(s, g);
  expect(dmg(1)).toBeGreaterThanOrEqual(100);
  expect(dmg(2)).toBe(0);
  const hp = s.body(2).state.hp;
  s.setOff(g);
  expect(DOWN_OR_DEAD).toContain(s.body(1).state.mode);
  expect(fell(s, 1)?.weapon).toBe("breach_charge");
  expect(s.body(2).state.hp).toBe(hp);
});

row("generic.breach_charge", "player.attacker", async () => {
  // Its placer's side: 50 at most (Y4S1), by its own curve, none past 1 m (Fandom). Sledge placed it and stands at it.
  const s = await scene(["sledge", "mute", "thermite"]);
  s.park();
  s.teleport(0, -8, 0, -5.45);
  s.teleport(2, -8, 0, -4.2);
  const g = onSoftWall(s, "breach_charge");
  const dmg = damageOf(s, g);
  expect(dmg(0)).toBeGreaterThan(0);
  expect(dmg(0)).toBeLessThanOrEqual(50);
  expect(dmg(2)).toBe(0);
  const hp = s.body(0).state.hp;
  s.setOff(g);
  expect(s.body(0).state.hp).toBe(hp - dmg(0));
});

row("generic.hard_breach_charge", "player.defender", async () => {
  // 5 to anyone on or right next to it (its blast ~0.5 m): Mute right behind the wall it's on; 1 m behind, nothing.
  const s = await scene();
  s.park();
  s.teleport(1, -8, 0, -6.45);
  const g = onSoftWall(s, "hard_breach_charge");
  expect(damageOf(s, g)(1)).toBe(5);
  const hp = s.body(1).state.hp;
  s.setOff(g);
  expect(s.body(1).state.hp).toBe(hp - 5);
  s.teleport(1, -8, 0, -7.4);
  expect(damageOf(s, onSoftWall(s, "hard_breach_charge"))(1)).toBe(0);
});

row("generic.hard_breach_charge", "player.attacker", async () => {
  // The same 5 to its placer standing at it.
  const s = await scene();
  s.park();
  s.teleport(0, -8, 0, -5.45);
  const g = onSoftWall(s, "hard_breach_charge");
  expect(damageOf(s, g)(0)).toBe(5);
  const hp = s.body(0).state.hp;
  s.setOff(g);
  expect(s.body(0).state.hp).toBe(hp - 5);
});

row("generic.claymore", "player.defender", async () => {
  // A defender stepping onto its middle laser sets it off at once: 155 within 2 m (Y11S3), credited to it.
  const s = await scene();
  s.park();
  const clay = s.put("claymore", 0, [0, 0.07, 13], { yaw: 0 });
  s.wait(2);
  s.room.onLabTool(s.clients[1].id, { kind: "teleport", x: 0, y: 0, z: 12, yawDeg: 0 });
  expect(damageOf(s, s.sim.gadgets.get(clay.id)!)(1)).toBe(155);
  s.wait(3);
  expect(s.sim.gadgets.get(clay.id)).toBeUndefined();
  expect(DOWN_OR_DEAD).toContain(s.body(1).state.mode);
  expect(fell(s, 1)?.weapon).toBe("claymore");
});

row("generic.frag", "player.defender", async () => {
  // 150 within 1.5 m (our placeholder; none past 3.6 m, Y7S3): Mute next to it is down or dead, credited to it.
  const s = await scene();
  s.park();
  s.teleport(1, 0, 0, 12);
  const g = s.put("frag", 0, [0.5, 0.04, 12]);
  expect(damageOf(s, g)(1)).toBe(150);
  s.setOff(g);
  expect(DOWN_OR_DEAD).toContain(s.body(1).state.mode);
  expect(fell(s, 1)?.weapon).toBe("frag");
});

row("generic.frag", "player.attacker", async () => {
  // Everyone in it, its own thrower too: Sledge 3 m from his own frag takes its damage there.
  const s = await scene();
  s.park();
  s.teleport(0, 0, 0, 12);
  const g = s.put("frag", 0, [0, 0.04, 15]);
  const want = damageOf(s, g)(0);
  expect(want).toBeGreaterThan(0);
  expect(want).toBeLessThan(100);
  const hp = s.body(0).state.hp;
  s.setOff(g);
  expect(s.body(0).state.hp).toBe(hp - want);
});

row("generic.frag", "skopos.shell_idle", async () => {
  // Her idle shell is a body to a blast (its barrier comes in M10): hurt by its curve; the shell she's in isn't.
  const s = await scene(["sledge", "skopos"]);
  s.park();
  const ctrl = s.sim.controllers.get(s.clients[1].session.ctrl!.id)!;
  const idle = s.sim.pawns.get(ctrl.pawnIds.find((id) => id !== ctrl.possessedPawnId)!)!;
  const g = s.put("frag", 0, [idle.state.x, 0.04, idle.state.z - 3]);
  const fx = blastEffects(s.sim, g, s.sim.data.gadgets.get("frag")!.blast!, g.pos);
  const want = fx.bodies.find((b) => b.pawn === idle)?.damage ?? 0;
  expect(want).toBeGreaterThan(0);
  expect(want).toBeLessThan(100);
  const [hp, active] = [idle.state.hp, s.body(1).state.hp];
  s.setOff(g);
  expect([idle.state.hp, s.body(1).state.hp]).toEqual([hp - want, active]);
});

row("generic.nitro_cell", "player.attacker", async () => {
  // 171 within 2 m (Fandom): Sledge at it is down or dead; Thermite 4.5 m away takes less by its curve.
  const s = await scene(["sledge", "mute", "thermite"]);
  s.park();
  s.teleport(0, 0, 0, 12);
  s.teleport(2, 4.5, 0, 12.8);
  const g = s.put("nitro_cell", 1, [0, 0.05, 12.8]);
  const dmg = damageOf(s, g);
  expect(dmg(0)).toBe(171);
  expect(dmg(2)).toBeGreaterThan(0);
  expect(dmg(2)).toBeLessThan(100);
  const hp = s.body(2).state.hp;
  s.setOff(g);
  expect(DOWN_OR_DEAD).toContain(s.body(0).state.mode);
  expect(fell(s, 0)?.weapon).toBe("nitro_cell");
  expect(s.body(2).state.hp).toBe(hp - dmg(2));
});

row("generic.impact_grenade", "player.attacker", async () => {
  // 40 within 0.5 m, none past 2 m (Y9S1.3).
  const s = await scene();
  s.park();
  s.teleport(0, 0, 0, 12);
  const g = s.put("impact_grenade", 1, [0, 0.05, 12.35]);
  expect(damageOf(s, g)(0)).toBe(40);
  const hp = s.body(0).state.hp;
  s.setOff(g);
  expect(s.body(0).state.hp).toBe(hp - 40);
});

// ---------------------------------------------------------------- the Claymore's tripwire

row("player.attacker", "generic.claymore", async () => {
  // Attackers walk through its lasers (its owner and a teammate, on its middle and right ones); a defender doesn't.
  const s = await scene(["sledge", "mute", "thermite"]);
  s.park();
  const clay = s.put("claymore", 0, [0, 0.07, 13], { yaw: 0 });
  s.teleport(0, 0, 0, 12);
  s.teleport(2, 0.75, 0, 11.7);
  s.wait(32);
  expect([s.sim.gadgets.get(clay.id)?.id, blasts(s)]).toEqual([clay.id, 0]);
  s.teleport(1, -0.75, 0, 11.7);
  s.wait(2);
  expect([s.sim.gadgets.get(clay.id), blasts(s)]).toEqual([undefined, 1]);
});

row("generic.claymore", "skopos.shell_idle", async () => {
  // Her idle shell standing on a laser doesn't set it off; it goes off once she wakes that shell.
  const s = await scene(["sledge", "skopos"]);
  s.park();
  const c = s.clients[1];
  const swap = () => {
    for (const b of [Btn.Ability, 0, Btn.Interact, 0]) {
      c.cmd = { buttons: b };
      s.tick();
    }
    const p = s.sim.data.operators.get("skopos")!.ability.params;
    s.wait(ticks(p.transferSeconds + p.activationSeconds + p.swapCooldownSeconds) + 4);
  };
  s.teleport(1, 0, 0, 12);
  const shell = s.body(1);
  swap(); // she's in her other shell: this one idles where it stands
  expect(s.body(1)).not.toBe(shell);
  const clay = s.put("claymore", 0, [0, 0.07, 13], { yaw: 0 });
  s.wait(32);
  expect([s.sim.gadgets.get(clay.id)?.id, blasts(s)]).toEqual([clay.id, 0]);
  swap(); // back into it
  expect(s.body(1)).toBe(shell);
  expect([s.sim.gadgets.get(clay.id), blasts(s)]).toEqual([undefined, 1]);
});

row("generic.claymore", "surface.barricade", async () => {
  // Outside the barricaded door, facing it: its middle laser passes under the barricade (its 15 cm gap at the bottom)
  // and Mute behind the door sets it off. Facing the solid wall beside the door, Mute behind that is safe.
  const s = await scene();
  s.park();
  s.teleport(1, -8, 0, 5.2);
  const walled = s.put("claymore", 0, [-8, 0.07, 7.0], { yaw: 0 });
  s.wait(32);
  expect([s.sim.gadgets.get(walled.id)?.id, blasts(s)]).toEqual([walled.id, 0]);
  s.room.onLabTool(s.clients[0].id, { kind: "clearGadgets" });
  s.teleport(1, -10, 0, 5.2);
  const clay = s.put("claymore", 0, [-10, 0.07, 7.0], { yaw: 0 });
  s.wait(3);
  expect([s.sim.gadgets.get(clay.id), blasts(s)]).toEqual([undefined, 1]);
});

// ---------------------------------------------------------------- blasts on surfaces

/** A floor's line-of-sight hole: both skins gone where it went off, its metal joists all there, a body standing on it held up. */
function expectLosOnly(s: Scene, joists: number) {
  const floor = s.panel("soft_floor").panel;
  expect(holeAt(s, "soft_floor", [L_FRONT, L_BACK], [14.55, 2.95, 8.05])).toBe(true);
  expect(floor.layers[L_CORE]!.reduce((a, b) => a + b, 0)).toBe(joists);
  s.teleport(0, 14.5, 3.0, 8.05);
  s.wait(32);
  expect(s.body(0).state.y).toBeGreaterThan(2.9);
}
const joistsOf = (s: Scene) => s.panel("soft_floor").panel.layers[L_CORE]!.reduce((a, b) => a + b, 0);

row("generic.breach_charge", "surface.soft_wall", async () => {
  // A walk-through opening (ours: 1.0 × 1.8 m from the floor) through both skins and the wooden studs: Sledge walks
  // through it, crouched.
  const s = await scene();
  s.park();
  const studs: Vec3[] = [
    [-12.29, 0.9, -6],
    [-11.89, 0.9, -6],
  ];
  for (const p of studs) expect(s.solidAt("soft_studs", L_CORE, p)).toBe(true);
  s.setOff(charge(s, "breach_charge", "soft_studs", -12, 0.9, -5.9));
  for (const p of [[-12, 0.9, -6], [-12.4, 0.2, -6], [-11.6, 1.6, -6], ...studs] as Vec3[]) expect(holeAt(s, "soft_studs", [L_FRONT, L_CORE, L_BACK], p)).toBe(true);
  s.teleport(0, -12, 0, -4.8);
  s.clients[0].cmd = { forward: 1, stance: Stance.Crouch };
  s.wait(3 * 64);
  expect(s.body(0).state.z).toBeLessThan(-6.6);
});

row("generic.breach_charge", "surface.soft_floor", async () => {
  // Floors are never passable (yellow light): a hole to see and shoot through.
  const s = await scene();
  s.park();
  const joists = joistsOf(s);
  s.setOff(onTop(s, "breach_charge", "soft_floor", 14.5, 8));
  expectLosOnly(s, joists);
});

row("generic.breach_charge", "surface.hatch", async () => {
  const s = await scene();
  s.park();
  s.setOff(onTop(s, "breach_charge", "hatch", 10, 8));
  expect(s.panel("hatch").panel.broken).toBe(true);
});

row("generic.breach_charge", "surface.barricade", async () => {
  const s = await scene();
  s.park();
  s.setOff(charge(s, "breach_charge", "door_a", -10, 1.0, 6.05));
  expect(s.panel("door_a").panel.broken).toBe(true);
});

/** Client 0 as Fuze carrying `gadget` (his first slot), standing at `at` facing −z. */
async function fuzeWith(gadget: string, at: Vec3) {
  const s = await scene();
  s.park();
  s.room.pickLoadout(s.clients[0].id, { ...defaultLoadoutPick(s.sim.data, "fuze"), gadgets: [gadget] });
  s.wait(8);
  s.teleport(0, ...at);
  return s;
}

/** Steel up on the hatch (from the top), as a defender reinforcing it leaves it. */
function reinforceHatch(s: Scene) {
  s.room.queuePanelOp(s.panel("hatch").panel.spec.index, { kind: "reinforce", section: 0, side: 1 });
  s.wait(2);
  expect(s.panel("hatch").panel.reinforced).toBe(1);
}

row("generic.breach_charge", "surface.reinforced_wall", async () => {
  // Its light is red on steel (an unbreakable surface to it): holding Fire places nothing. On the soft wall it goes on.
  const s = await fuzeWith("breach_charge", [11.5, 0, -4.9]);
  expect(s.place(0, [11.5, 1.0, -5.9])).toBeUndefined();
  s.teleport(0, -8, 0, -4.9);
  expect(s.place(0, [-8, 1.0, -5.9])?.kind).toBe(kindOf("breach_charge"));
});

row("generic.breach_charge", "surface.reinforced_hatch", async () => {
  // On the hatch it goes on; once the hatch is reinforced it doesn't.
  const s = await fuzeWith("breach_charge", [10, 3.0, 8.8]);
  expect(s.place(0, [10, 3.0, 8])?.kind).toBe(kindOf("breach_charge"));
  s.room.onLabTool(s.clients[0].id, { kind: "clearGadgets" });
  reinforceHatch(s);
  expect(s.place(0, [10, 3.0, 8])).toBeUndefined();
});

/** A square hole (ours: 0.8 m) at (x, y) on a wall at z −6 through `layers`: 0.6 m off its centre the wall is whole. */
function expectSmallHole(s: Scene, id: string, x: number, y: number, layers: number[]) {
  expect(holeAt(s, id, layers, [x, y, -6])).toBe(true);
  for (const [dx, dy] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) expect(s.solidAt(id, L_FRONT, [x + dx, y + dy, -6])).toBe(true);
}

row("generic.hard_breach_charge", "surface.reinforced_wall", async () => {
  // Placed in 2 s, it goes off 4 s later by itself (not remote, Y7S3): a square hole through the steel, too small to
  // walk through.
  const s = await fuzeWith("hard_breach_charge", [11.5, 0, -4.9]);
  const hbc = s.place(0, [11.5, 1.0, -5.9])!;
  expect(hbc.kind).toBe(kindOf("hard_breach_charge"));
  s.wait(ticks(4) + 4);
  expect(s.sim.gadgets.get(hbc.id)).toBeUndefined();
  expectSmallHole(s, "reinforced", 11.5, 1.0, [L_FRONT, L_CORE, L_BACK, L_STEEL]);
});

row("generic.hard_breach_charge", "surface.reinforced_hatch", async () => {
  // On a reinforced hatch it takes the whole hatch (ours: one charge; the Y5S3 rule wants 3 of its cones on it).
  const s = await fuzeWith("hard_breach_charge", [10, 3.0, 8.8]);
  reinforceHatch(s);
  expect(s.place(0, [10, 3.0, 8])?.kind).toBe(kindOf("hard_breach_charge"));
  s.teleport(0, 10, 3.0, 11);
  s.wait(ticks(4) + 4);
  expect(s.panel("hatch").panel.broken).toBe(true);
});

row("generic.hard_breach_charge", "surface.soft_wall", async () => {
  const s = await scene();
  s.park();
  s.setOff(onSoftWall(s, "hard_breach_charge"));
  expectSmallHole(s, "soft_plain", -8, 1.0, [L_FRONT, L_BACK]);
});

row("generic.hard_breach_charge", "surface.barricade", async () => {
  const s = await scene();
  s.park();
  s.setOff(charge(s, "hard_breach_charge", "door_a", -10, 1.0, 6.05));
  expect(s.panel("door_a").panel.broken).toBe(true);
});

row("generic.hard_breach_charge", "surface.hard_wall", async () => {
  // Nothing opens a hard wall: holding Fire at one places nothing.
  const s = await fuzeWith("hard_breach_charge", [-8, 0, 7.0]);
  expect(s.place(0, [-8, 1.0, 6.1])).toBeUndefined();
});

/** Where a grenade goes off at each surface (0.1 to 0.3 m off it), and what that leaves. */
const AT_SURFACE: Record<string, { at: Vec3; check: (s: Scene, joists: number) => void }> = {
  "surface.soft_wall": { at: [-8, 1.0, -5.8], check: (s) => expect(holeAt(s, "soft_plain", [L_FRONT, L_BACK], [-8, 1.0, -6])).toBe(true) },
  "surface.hatch": { at: [10, 3.04, 8], check: (s) => expect(s.panel("hatch").panel.broken).toBe(true) },
  "surface.soft_floor": { at: [14.5, 3.04, 8], check: expectLosOnly },
  "surface.barricade": { at: [-10, 1.0, 6.35], check: (s) => expect(s.panel("door_a").panel.broken).toBe(true) },
};
const GRENADES: [string, string[]][] = [
  ["frag", ["surface.soft_wall", "surface.hatch", "surface.soft_floor", "surface.barricade"]],
  ["impact_grenade", ["surface.soft_wall", "surface.hatch", "surface.soft_floor", "surface.barricade"]],
  ["nitro_cell", ["surface.soft_wall", "surface.barricade"]],
];
for (const [from, surfaces] of GRENADES)
  for (const surface of surfaces)
    row(`generic.${from}`, surface, async () => {
      const s = await scene();
      s.park();
      const joists = joistsOf(s);
      s.setOff(s.put(from, sideOf(s, from), AT_SURFACE[surface].at));
      AT_SURFACE[surface].check(s, joists);
    });

// ---------------------------------------------------------------- bullets and the knife

for (const kind of ["breach_charge", "hard_breach_charge", "claymore", "proximity_alarm", "observation_blocker", "nitro_cell"])
  row("weapon.bullet", `generic.${kind}`, async () => {
    // One bullet destroys it, from the other side 2.5 m away; no blast (a Nitro Cell leaves a harmless puff, Fandom).
    const s = await scene();
    s.park();
    const e = targetOf(s, kind);
    const shooter = 1 - sideOf(s, kind);
    s.teleport(shooter, -8, 0, -2.5);
    s.shootAt(shooter, e.pos);
    expect([s.sim.gadgets.get(e.id), blasts(s)]).toEqual([undefined, 0]);
  });

row("weapon.bullet", "generic.barbed_wire", async () => {
  // Immune to bullets.
  const s = await scene();
  s.park();
  const wire = s.put("barbed_wire", 1, [-8, 0.2, -5.0]);
  s.teleport(0, -8, 0, -2.5);
  s.shootAt(0, wire.pos);
  expect(s.sim.gadgets.get(wire.id)).toEqual(wire);
});

row("weapon.bullet", "generic.impact_grenade", async () => {
  // It can't be shot down in flight: Sledge's bullet goes through where Mute's grenade is, and it flies on.
  const s = await scene();
  s.park();
  s.teleport(0, -8, 0, -2.5);
  const at: Vec3 = [-8, 1.5, -5.0];
  const aim = s.aimAt(0, at);
  s.clients[0].cmd = { ...aim, buttons: Btn.Ads };
  s.wait(64);
  const g = s.put("impact_grenade", 1, at, { flags: GFlag.Flying, vel: [0, 2, 0], launchTick: s.sim.tick });
  s.clients[0].cmd = { ...aim, buttons: Btn.Ads | Btn.Fire };
  s.tick();
  s.clients[0].cmd = { ...aim };
  s.wait(4);
  expect((s.sim.gadgets.get(g.id)?.flags ?? 0) & GFlag.Flying).toBe(GFlag.Flying);
  expect(blasts(s)).toBe(0);
});

row("player.melee", "generic.observation_blocker", async () => {
  // A knife hit destroys it (its official vulnerabilities, Y8S2): Sledge crouched over it.
  const s = await scene();
  s.park();
  const ob = s.put("observation_blocker", 1, [-8, 0.125, -5.0]);
  s.teleport(0, -8, 0, -4.4);
  s.knife(0, ob.pos, { stance: Stance.Crouch });
  expect(s.sim.gadgets.get(ob.id)).toBeUndefined();
});
