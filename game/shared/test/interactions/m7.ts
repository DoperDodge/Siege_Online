// Interaction rows of Phase 8 M7 (gadgets/DESIGN.md §7, §12): Vista's Blind Pane, on the Gadget Lab. Vista (client 0)
// takes it out of her slot 2 with Z and holds Fire at a reinforceable wall for 5 s, as a player does; the attacker
// (client 1) comes at it from the other side. The reinforceable wall (reinforce_2) stands for the CSV's "soft wall"
// (a Mirror needs a reinforceable one); the reinforced wall's steel went up from its +z side, Vista's.
import { expect } from "vitest";
import {
  ATTACK,
  Btn,
  GFlag,
  Hand,
  kindOf,
  L_BACK,
  L_CORE,
  L_FRONT,
  L_STEEL,
  PawnMode,
  seesThrough,
  sightPast,
  Stance,
  ticks,
  type Gadget,
  type GameEvent,
  type Vec3,
} from "../../src/index.js";
import { scene, type Scene } from "./harness.js";
import { row } from "./registry.js";

/** Vista (client 0) and `other` (client 1) on the Gadget Lab, everyone out of the way. */
async function lab(other = "cleave") {
  const s = await scene(["vista", other], "gadget_lab");
  s.park();
  return s;
}

const data = (s: Scene, id: string) => s.sim.data.gadgets.get(id)!;

/**
 * Vista puts a Blind Pane into a wall's +z face (its face at z −5.9) at x from 0.9 m in front of it, standing (or
 * crouched), as a player does, and has her weapon back in hand: the mirror.
 */
function mirrorAt(s: Scene, x: number, crouch = false): Gadget {
  s.teleport(0, x, 0, -5.0);
  const hold = crouch ? { stance: Stance.Crouch } : {};
  const g = s.plant(0, [x, crouch ? 1.0 : 1.5, -5.9], hold);
  s.clients[0].cmd = {};
  s.wait(4);
  expect(g, "the mirror went in").toBeDefined();
  // Her second one (if any) back away: her weapon in hand again (Z puts it away).
  if (s.body(0).state.hand === Hand.Ability) s.press(0, Btn.Ability);
  s.wait(48);
  return g!;
}

/** A mirror's canister (the server put it on her side with it). */
const canisterOf = (s: Scene, m: Gadget) => s.sim.gadgets.list.find((g) => g.kind === kindOf("pane_canister") && Math.hypot(g.pos[0] - m.pos[0], g.pos[2] - m.pos[2]) < 1)!;

/** The mirror as it is now (undefined: gone). */
const now = (s: Scene, m: Gadget) => s.sim.gadgets.get(m.id);

/** Whether a panel has no material in any of `layers` at the world point. */
const holeAt = (s: Scene, id: string, layers: number[], p: Vec3) => layers.every((l) => !s.solidAt(id, l, p));

/** How far sight goes from `from` along z (toward `dz`), up to 3 m. */
const sightZ = (s: Scene, from: Vec3, dz: number) => sightPast(s.sim, from, [0, 0, dz], 3)?.t ?? 3;

/** The events of a kind client i was sent. */
const sent = <K extends GameEvent["kind"]>(s: Scene, i: number, kind: K) => s.clients[i].events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

/** An entry of client i's on a wall's −z face (at −6.1, facing −z: the far side from Vista) at (x, y). */
function onFarFace(s: Scene, kind: string, i: number, id: string, x: number, y: number): Gadget {
  const pos: Vec3 = [x, y, -6.1 - data(s, kind).sizeM[2] / 2];
  return s.put(kind, i, pos, { yaw: 0, flags: 0, panel: s.panel(id).panel.spec.index });
}

// ================================================================ placing it

row("vista.blind_pane", "surface.soft_wall", async () => {
  // On a reinforceable wall not yet reinforced, at her head height standing (crouched: lower), in 5 s: its window is
  // burnt through every layer, its canister on her side; it can't be picked up. 2 a round.
  const s = await lab();
  const n = s.body(0).state.g2;
  const m = mirrorAt(s, 1.6);
  expect([m.panel, n]).toEqual([s.panel("reinforce_2").panel.spec.index, 2]);
  expect([m.pos[1], m.pos[2]]).toEqual([expect.closeTo(1.5, 1), expect.closeTo(-6, 2)]);
  expect(holeAt(s, "reinforce_2", [L_FRONT, L_CORE, L_BACK], [1.6, 1.5, -6])).toBe(true);
  expect(s.solidAt("reinforce_2", L_FRONT, [1.6, 1.9, -6])).toBe(true);
  expect(canisterOf(s, m).pos[2]).toBeGreaterThan(-5.9);
  const low = mirrorAt(s, 0.1, true);
  expect(low.pos[1]).toBeCloseTo(1.0, 1);
  expect(s.body(0).state.g2).toBe(0);
  expect(data(s, "blind_pane").pickUp).toBe(false);
});

row("vista.blind_pane", "surface.reinforced_wall", async () => {
  // On steel only from the side it went up from (its +z side here, hers); from the other side it doesn't go.
  const s = await lab();
  s.teleport(0, 12.5, 0, -7.0, 180);
  expect(s.plant(0, [12.5, 1.5, -6.1])).toBeUndefined();
  const m = mirrorAt(s, 11.5);
  expect(holeAt(s, "reinforced", [L_FRONT, L_BACK, L_STEEL], [11.5, 1.5, -6])).toBe(true);
  expect(m.panel).toBe(s.panel("reinforced").panel.spec.index);
});

row("vista.blind_pane", "surface.hard_wall", async () => {
  // Not on a hard wall.
  const s = await lab();
  s.teleport(0, -8, 0, 7.0);
  expect(s.plant(0, [-8, 1.5, 6.1])).toBeUndefined();
});

row("vista.blind_pane", "surface.barricade", async () => {
  // Not on a barricade (UNVERIFIED: every source says walls).
  const s = await lab();
  s.teleport(0, -10, 0, 7.0);
  expect(s.plant(0, [-10, 1.5, 6.05])).toBeUndefined();
});

row("vista.blind_pane", "surface.soft_floor", async () => {
  // Not on a floor (UNVERIFIED: every source says walls).
  const s = await lab();
  s.teleport(0, 14.5, 3.0, 9.3);
  expect(s.plant(0, [14.5, 3.0, 8.4])).toBeUndefined();
});

row("action.reinforce", "vista.blind_pane", async () => {
  // A wall holding a Mirror can't be reinforced afterwards (UNVERIFIED in the current build): Vista holds Interact at it.
  const s = await lab();
  mirrorAt(s, 1.6);
  const panel = s.panel("reinforce_2").panel;
  for (const x of [1.6, 0]) {
    s.teleport(0, x, 0, -5.0, 0);
    s.clients[0].cmd = { buttons: Btn.Interact };
    s.wait(ticks(s.sim.data.destruction.reinforcement.deploySeconds) + 32);
    s.clients[0].cmd = {};
    s.wait(2);
  }
  expect(panel.reinforced).toBe(0);
});

// ================================================================ the glass

row("vista.blind_pane", "player.attacker", async () => {
  // Clear from her side, black from his; bulletproof both ways; its canister on her side.
  const s = await lab();
  const m = mirrorAt(s, 1.6);
  const her: Vec3 = [1.6, 1.5, -5.2];
  const his: Vec3 = [1.6, 1.5, -6.8];
  expect([seesThrough(m, her), seesThrough(m, his)]).toEqual([true, false]);
  expect(sightZ(s, her, -1)).toBeGreaterThan(1.5);
  expect(sightZ(s, his, 1)).toBeCloseTo(0.78, 1);
  s.teleport(1, 1.6, 0, -7.0, 180);
  const [hers, his0] = [s.body(0).state.hp, s.body(1).state.hp];
  s.shootAt(0, [1.6, 1.5, -7.0]);
  s.shootAt(1, [1.6, 1.5, -5.0]);
  expect([s.body(0).state.hp, s.body(1).state.hp]).toEqual([hers, his0]);
  expect(canisterOf(s, m).pos[2]).toBeGreaterThan(-5.9);
});

row("vista.blind_pane", "drone.standard", async () => {
  // A drone on the far side sees black: its camera's sight stops at the glass, looking up through it; once the glass
  // is ejected, through the empty frame it sees on.
  const s = await lab();
  const m = mirrorAt(s, 1.6);
  s.room.spawnPilot(s.clients[1].id, null, 0, ATTACK);
  s.room.rosterChanged();
  s.wait(8);
  const drone = s.sim.dronesOf(s.ctrlOf(1)).find((p) => p.state.mode === PawnMode.Walk)!;
  s.sim.placeDrone(drone.id, 1.6, 0.02, -7.0, 180);
  s.wait(8);
  const eye = s.sim.eyeOf(drone).pos;
  const to: Vec3 = [1.6 - eye[0], 1.5 - eye[1], -6.0 - eye[2]];
  const len = Math.hypot(...to);
  const dir: Vec3 = [to[0] / len, to[1] / len, to[2] / len];
  expect(sightPast(s.sim, eye, dir, 6)!.t).toBeLessThan(len);
  s.room.gadgetServer.destroy(canisterOf(s, m));
  s.wait(ticks(data(s, "blind_pane").mirror!.ejectS) + 2);
  expect(sightPast(s.sim, eye, dir, 6)?.t ?? 6).toBeGreaterThan(len + 0.5);
});

row("weapon.bullet", "vista.blind_pane", async () => {
  // Bulletproof from both sides, shattered too.
  const s = await lab();
  const m = mirrorAt(s, 1.6);
  s.teleport(1, 1.6, 0, -7.0, 180);
  const hp = s.body(1).state.hp;
  s.shootAt(0, [1.6, 1.5, -7.0]);
  s.knife(0, [1.6, 1.5, -6.0]);
  expect(now(s, m)!.flags & GFlag.Hit).toBe(GFlag.Hit);
  s.shootAt(0, [1.6, 1.5, -7.0]);
  expect(s.body(1).state.hp).toBe(hp);
});

row("player.melee", "vista.blind_pane", async () => {
  // A knife hit from either side shatters it (Y6S2): opaque both ways, still bulletproof, still in the wall, still
  // ejectable by its canister.
  const s = await lab();
  const a = mirrorAt(s, 1.6);
  const b = mirrorAt(s, 0.1);
  s.teleport(0, 1.6, 0, -5.4, 0);
  s.knife(0, [1.6, 1.5, -6.0]);
  s.teleport(1, 0.1, 0, -6.9, 180);
  s.knife(1, [0.1, 1.5, -6.0]);
  for (const m of [a, b]) {
    const g = now(s, m)!;
    expect([g.flags & GFlag.Hit, seesThrough(g, [m.pos[0], 1.5, -5.2])]).toEqual([GFlag.Hit, false]);
  }
  s.room.gadgetServer.destroy(canisterOf(s, a));
  s.wait(ticks(data(s, "blind_pane").mirror!.ejectS) + 2);
  expect(now(s, a)!.flags & GFlag.Broken).toBe(GFlag.Broken);
});

row("cleave.breaching_maul", "vista.blind_pane", async () => {
  // A swing at the glass shatters it as a knife does (UNVERIFIED for the hammer).
  const s = await lab();
  const m = mirrorAt(s, 1.6);
  s.teleport(1, 1.6, 0, -6.9, 180);
  const at: Vec3 = [1.6, 1.5, -6.0];
  s.handOut(1, Hand.Ability, s.aimAt(1, at));
  s.press(1, Btn.Fire, s.aimAt(1, at));
  s.wait(ticks(1));
  expect(now(s, m)!.flags & GFlag.Hit).toBe(GFlag.Hit);
});

row("generic.impact_emp", "vista.blind_pane", async () => {
  // Not electronic: an Impact EMP at it does nothing to it.
  const s = await lab();
  const m = mirrorAt(s, 1.6);
  const before = now(s, m)!.flags;
  s.setOff(s.put("impact_emp", 1, [1.6, 1.4, -6.3]));
  expect(now(s, m)!.flags).toBe(before);
});

row("generic.stun", "vista.blind_pane", async () => {
  // A stun on the far side still blinds Vista looking through her Mirror (Fandom).
  const s = await lab();
  mirrorAt(s, 1.6);
  s.teleport(0, 1.6, 0, -5.0, 0);
  s.clients[0].cmd = { yaw: 0, pitch: 0 };
  s.wait(4);
  s.setOff(s.put("stun", 1, [1.6, 1.5, -7.0]));
  expect(sent(s, 0, "stunned").some((e) => e.blind > 0)).toBe(true);
});

// ================================================================ the canister

row("vista.blind_pane_canister", "vista.blind_pane", async () => {
  // Its canister destroyed, the glass is ejected 4 s later: an open hole in its frame, shot through both ways.
  const s = await lab();
  const m = mirrorAt(s, 1.6);
  s.room.gadgetServer.destroy(canisterOf(s, m));
  s.wait(ticks(data(s, "blind_pane").mirror!.ejectS) - 8);
  expect(now(s, m)!.flags & (GFlag.Active | GFlag.Broken)).toBe(GFlag.Active);
  s.wait(12);
  expect(now(s, m)!.flags & GFlag.Broken).toBe(GFlag.Broken);
  s.teleport(1, 1.6, 0, -7.0, 180);
  const hp = s.body(1).state.hp;
  s.shootAt(0, [1.6, 1.5, -7.0]);
  expect(s.body(1).state.hp).toBeLessThan(hp);
});

row("weapon.bullet", "vista.blind_pane_canister", async () => {
  // Either team can shoot it, from her side: one bullet, and the glass goes.
  const s = await lab();
  const m = mirrorAt(s, 1.6);
  const c = canisterOf(s, m);
  s.teleport(1, 0.5, 0, -4.0);
  s.shootAt(1, c.pos);
  expect([s.sim.gadgets.get(c.id), now(s, m)!.flags & GFlag.Active]).toEqual([undefined, GFlag.Active]);
});

row("player.melee", "vista.blind_pane_canister", async () => {
  // A knife hit destroys it; the glass goes.
  const s = await lab();
  const m = mirrorAt(s, 1.6);
  const c = canisterOf(s, m);
  s.knife(0, c.pos);
  expect([s.sim.gadgets.get(c.id), now(s, m)!.flags & GFlag.Active]).toEqual([undefined, GFlag.Active]);
});

row("generic.frag", "vista.blind_pane_canister", async () => {
  // A frag on her side pops it; the glass goes.
  const s = await lab();
  const m = mirrorAt(s, 1.6);
  const c = canisterOf(s, m);
  s.teleport(0, -4, 0, 4);
  s.setOff(s.put("frag", 1, [c.pos[0] - 0.5, 0.04, -5.4]));
  expect([s.sim.gadgets.get(c.id), now(s, m)!.flags & GFlag.Active]).toEqual([undefined, GFlag.Active]);
});

// ================================================================ its wall giving way

row("generic.breach_charge", "vista.blind_pane", async () => {
  // On a soft host wall, a Breach Charge on the far side over its frame breaches the wall round it: it falls, its
  // canister with it (the glass itself is blast-proof).
  const s = await lab();
  const m = mirrorAt(s, 1.6);
  const c = canisterOf(s, m);
  s.teleport(0, -4, 0, 4);
  s.setOff(onFarFace(s, "breach_charge", 1, "reinforce_2", 1.6, 1.2));
  expect([now(s, m), s.sim.gadgets.get(c.id)]).toEqual([undefined, undefined]);
});

row("generic.heavy_breach_charge", "vista.blind_pane", async () => {
  // On its reinforced host, a Heavy Breach Charge over its frame takes it (UNVERIFIED: guides say any hard breacher).
  const s = await lab();
  const m = mirrorAt(s, 11.5);
  s.teleport(0, -4, 0, 4);
  s.setOff(onFarFace(s, "heavy_breach_charge", 1, "reinforced", 11.5, 1.5));
  expect(now(s, m)).toBeUndefined();
});

row("generic.frag", "vista.blind_pane", async () => {
  // A frag going off on the far side right at it breaches its soft host round it: it falls. (The glass is blast-proof.)
  const s = await lab();
  const m = mirrorAt(s, 1.6);
  s.teleport(0, -4, 0, 4);
  s.setOff(s.put("frag", 1, [1.6, 1.5, -6.25], { flags: 0 }));
  expect(now(s, m)).toBeUndefined();
});

row("kiln.burn_frame", "vista.blind_pane", async () => {
  // Kiln's charge on the far (opaque) side of its reinforced wall takes it whole, frame and all.
  const s = await lab("kiln");
  const m = mirrorAt(s, 11.5);
  s.teleport(0, -4, 0, 4);
  const g = onFarFace(s, "burn_frame", 1, "reinforced", 11.5, 0.87);
  s.room.gadgetServer.detonated(g);
  s.wait(ticks(data(s, "burn_frame").burnS!) + 4);
  expect([now(s, m), s.sim.gadgets.list.some((e) => e.kind === kindOf("pane_canister"))]).toEqual([undefined, false]);
});

row("hail.hailstone_drill", "vista.blind_pane", async () => {
  // Hail plants his Hailstone Drill on its glass from the far side: it drills (1.75 s, ours), the glass shatters, and
  // the grenades come out on her side.
  const s = await lab("hail");
  const m = mirrorAt(s, 1.6);
  s.teleport(0, -4, 0, 4);
  s.teleport(1, 1.6, 0, -7.0, 180);
  const g = s.plant(1, [1.6, 1.5, -6.02])!;
  expect(g.panel).toBe(-1);
  s.teleport(1, 1.6, 0, -12);
  s.detonate(1);
  s.wait(ticks(data(s, "hailstone_drill").cluster!.drillS) + 4);
  expect(now(s, m)!.flags & GFlag.Hit).toBe(GFlag.Hit);
  const out = s.sim.gadgets.list.filter((e) => e.kind === kindOf("hailstone"));
  expect(out.length).toBeGreaterThan(0);
  expect(out[0].pos[2]).toBeGreaterThan(-5.9);
});

row("hail.hailstone_drill", "vista.blind_pane_canister", async () => {
  // Its grenades on her side destroy the canister: the glass goes 4 s later.
  const s = await lab("hail");
  const m = mirrorAt(s, 1.6);
  const c = canisterOf(s, m);
  s.teleport(0, -4, 0, 4);
  const g = onFarFace(s, "hailstone_drill", 1, "reinforce_2", 2.3, 1.0);
  s.room.gadgetServer.detonated(g);
  s.wait(ticks(3));
  expect(s.sim.gadgets.get(c.id)).toBeUndefined();
  s.wait(ticks(data(s, "blind_pane").mirror!.ejectS));
  expect((now(s, m)?.flags ?? GFlag.Broken) & GFlag.Broken).toBe(GFlag.Broken);
});
