// Interaction rows of Phase 8 M11 (gadgets/DESIGN.md §8): Fuze's Ballistic Shield, on the Gadget Lab. Fuze carries
// it as his primary (with his pistol) and holds it up in front, facing where a test says; bullets, knives, Sledge's
// hammer, blasts and Gu needles meet it through the room's own paths, as a player's would.
import { expect } from "vitest";
import { blastEffects, Btn, defaultLoadoutPick, DeployKind, kindId, PawnMode, ShieldAt, suppressed, ticks, type Gadget, type Vec3 } from "../../src/index.js";
import { scene, type Scene } from "./harness.js";
import { row } from "./registry.js";

/** `ops` on the Gadget Lab, everyone out of the way; client `fuze` (0 unless it says) carries the Ballistic Shield. */
async function lab(ops: string[], fuze = 0) {
  const s = await scene(ops, "gadget_lab");
  s.room.pickLoadout(s.clients[fuze].id, { ...defaultLoadoutPick(s.sim.data, "fuze"), primary: { weapon: "ballistic_shield", sight: null, barrel: null, grip: null, underbarrel: null } });
  s.wait(8);
  s.park();
  return s;
}

/** The shield's numbers (data/weapons/ballistic_shield.json `shield`) on client i's body. */
const shield = (s: Scene, i = 0) => s.body(i).loadout!.shield!;

/** Client i standing at (x, z) facing `yaw` (0: toward −z; π: toward +z), its shield up. */
function stand(s: Scene, i: number, x: number, z: number, yaw = 0) {
  s.teleport(i, x, 0, z);
  s.clients[i].cmd = { yaw };
  s.wait(4);
}

/** Run ticks until `pred` holds, at most `max`: whether it did. */
function until(s: Scene, pred: () => boolean, max = 128): boolean {
  for (let n = 0; n < max && !pred(); n++) s.wait(1);
  return pred();
}

/** What a blast of entry `g` does to client i's body (gadgets/blast.ts), as it would set off now. */
function damageOf(s: Scene, g: Gadget, i = 0): number {
  const fx = blastEffects(s.sim, g, s.sim.data.gadgets.get(kindId(g.kind)!)!.blast!, g.pos);
  return fx.bodies.find((b) => b.pawn.id === s.body(i).id)?.damage ?? 0;
}

/** The same with client i's shield down: the blast's whole damage. */
function unshielded(s: Scene, g: Gadget, i = 0): number {
  const st = s.body(i).state;
  const at = st.shieldAt;
  st.shieldAt = ShieldAt.None;
  try {
    return damageOf(s, g, i);
  } finally {
    st.shieldAt = at;
  }
}

/** Sledge (client 0) takes his hammer out (Z) and swings it once looking at `at`. */
function swing(s: Scene, at: Vec3) {
  const aim = s.aimAt(0, at);
  s.press(0, Btn.Ability, aim);
  s.wait(ticks(s.sim.data.gadgetRules.equipS) + 2);
  s.press(0, Btn.Fire, aim);
}

// ================================================================ what meets the shield

row("weapon.bullet", "fuze.ballistic_shield", async () => {
  // Mute shoots Fuze's raised shield: each bullet stops at its plate (Fuze unhurt); 5 hits suppress him (no sprinting,
  // Y9S4); with no hit for 7 s it's gone, and he sprints again.
  const s = await lab(["fuze", "mute"]);
  stand(s, 0, 0, 12, Math.PI);
  stand(s, 1, 0, 18);
  const k = shield(s);
  expect(s.body(0).state.shieldAt).toBe(ShieldAt.Front);
  const hp = s.body(0).state.hp;
  for (let n = 0; n < k.suppression.hitsToTrigger; n++) s.shootAt(1, [0, 1.3, 12]);
  expect([s.body(0).state.hp, s.body(0).state.suppress]).toEqual([hp, k.suppression.hitsToTrigger]);
  expect(suppressed(s.body(0).loadout, s.body(0).state)).toBe(true);
  s.clients[0].cmd = { yaw: Math.PI, forward: 1, buttons: Btn.Sprint };
  s.wait(16);
  expect(s.body(0).state.sprinting).toBe(false);
  stand(s, 0, 0, 12, Math.PI);
  s.wait(ticks(k.suppression.falloffS));
  expect([s.body(0).state.suppress, suppressed(s.body(0).loadout, s.body(0).state)]).toEqual([0, false]);
  s.clients[0].cmd = { yaw: Math.PI, forward: 1, buttons: Btn.Sprint };
  s.wait(16);
  expect(s.body(0).state.sprinting).toBe(true);
});

row("player.melee", "fuze.ballistic_shield", async () => {
  // Mute knifes Fuze's raised shield: no damage, and it's knocked aside (a guard break, Y9S1; ours 1 s), then up again.
  // From behind, the knife finds Fuze himself (and kills, as on anyone standing).
  const s = await lab(["fuze", "mute"]);
  stand(s, 0, 0, 12, Math.PI);
  stand(s, 1, 0, 13.2);
  const k = shield(s);
  const hp = s.body(0).state.hp;
  const aim = s.aimAt(1, [0, 1.3, 12]);
  s.clients[1].cmd = aim;
  s.wait(4);
  s.press(1, Btn.Melee, aim);
  expect(until(s, () => s.body(0).state.shieldAt === ShieldAt.None, 64)).toBe(true);
  expect([s.body(0).state.hp, s.body(0).state.guard > 0]).toEqual([hp, true]);
  s.wait(ticks(k.guardBreak.seconds) + 2);
  expect(s.body(0).state.shieldAt).toBe(ShieldAt.Front);
  stand(s, 1, 0, 10.8, Math.PI);
  const back = s.aimAt(1, [0, 1.3, 12]);
  s.clients[1].cmd = back;
  s.wait(4);
  s.press(1, Btn.Melee, back);
  s.wait(48);
  expect([PawnMode.Downed, PawnMode.Dead]).toContain(s.body(0).state.mode);
});

row("sledge.breaching_hammer", "fuze.ballistic_shield", async () => {
  // Sledge's blow on Fuze's raised shield knocks him to the ground (Y10S2: "the shield aside and the operator to the
  // ground", D-156), unhurt: he goes over onto his back, his shield nowhere, and gets up once the knockdown's time is
  // out, the shield back up. Fuze is his teammate here, as he always is in our roster: friendly fire is on in the lab
  // (UNVERIFIED vs a friendly shield; ours: a teammate's blow does what its damage would, nothing with it off).
  const s = await lab(["sledge", "fuze"], 1);
  stand(s, 1, 0, 13, Math.PI);
  stand(s, 0, 0, 14.2);
  const kd = s.sim.data.combat.knockdown;
  const hp = s.body(1).state.hp;
  swing(s, [0, 1.2, 13]);
  expect(until(s, () => s.body(1).state.mode === PawnMode.Knocked, 128)).toBe(true);
  expect([s.body(1).state.shieldAt, s.body(1).state.hp]).toEqual([ShieldAt.None, hp]);
  s.wait(ticks(kd.fallS) + ticks(kd.downS));
  expect(s.body(1).state.knockLie).toBeGreaterThan(0.9);
  expect(until(s, () => s.body(1).state.mode === PawnMode.Walk, ticks(kd.getUpS) + 8)).toBe(true);
  s.wait(2);
  expect([s.body(1).state.shieldAt, s.body(1).state.hp]).toEqual([ShieldAt.Front, hp]);
});

row("generic.nitro_cell", "fuze.ballistic_shield", async () => {
  // A Nitro Cell going off in front of Fuze's raised shield: 66% of its damage absorbed (Y9S1.3); behind him, none.
  // Either way, 30 hp or more knocks the shield aside (a guard break).
  const s = await lab(["fuze", "mute"]);
  stand(s, 0, 0, 12);
  const k = shield(s);
  const front = s.put("nitro_cell", 1, [0, 0.05, 8]);
  const whole = unshielded(s, front);
  const less = Math.max(1, Math.round(whole * (1 - k.absorb)));
  expect(whole).toBeGreaterThanOrEqual(k.guardBreak.blastHp);
  expect(damageOf(s, front)).toBe(less);
  let hp = s.body(0).state.hp;
  s.setOff(front);
  expect([hp - s.body(0).state.hp, s.body(0).state.shieldAt]).toEqual([less, ShieldAt.None]);
  s.wait(ticks(k.guardBreak.seconds) + 4);
  expect(s.body(0).state.shieldAt).toBe(ShieldAt.Front);
  const behind = s.put("nitro_cell", 1, [0, 0.05, 17]);
  const all = unshielded(s, behind);
  expect(all).toBeGreaterThanOrEqual(k.guardBreak.blastHp);
  expect(damageOf(s, behind)).toBe(all);
  hp = s.body(0).state.hp;
  s.setOff(behind);
  expect([hp - s.body(0).state.hp, s.body(0).state.shieldAt]).toEqual([all, ShieldAt.None]);
});

row("generic.impact_grenade", "fuze.ballistic_shield", async () => {
  // An Impact Grenade going off just in front of Fuze's raised shield: its 40 (Y9S1.3) less 66%, and the shield knocked
  // aside (40 ≥ 30) for its guard break, then up again.
  const s = await lab(["fuze", "mute"]);
  stand(s, 0, 0, 12);
  const k = shield(s);
  const g = s.put("impact_grenade", 1, [0, 0.05, 11.7]);
  expect(unshielded(s, g)).toBe(40);
  const less = Math.round(40 * (1 - k.absorb));
  expect(damageOf(s, g)).toBe(less);
  const hp = s.body(0).state.hp;
  s.setOff(g);
  expect([hp - s.body(0).state.hp, s.body(0).state.shieldAt]).toEqual([less, ShieldAt.None]);
  s.wait(ticks(k.guardBreak.seconds) + 4);
  expect(s.body(0).state.shieldAt).toBe(ShieldAt.Front);
});

row("lesion.gu_mine", "fuze.ballistic_shield", async () => {
  // A needle in Fuze: the shield stays up, but pulling the needle (F held 2 s) takes it off, onto his back, for the
  // pull (Y5S1.1: shield users un-equip it to pull one); once the needle's out it's up again.
  const s = await lab(["fuze", "lesion"]);
  stand(s, 0, 0, 12);
  s.put("gu_mine", 1, [0.4, s.sim.data.gadgets.get("gu_mine")!.sizeM[1] / 2, 12]);
  s.wait(2);
  expect([s.body(0).state.needled, s.body(0).state.shieldAt]).toEqual([true, ShieldAt.Front]);
  s.clients[0].cmd = { buttons: Btn.Interact };
  s.wait(4);
  expect([s.body(0).state.deployKind, s.body(0).state.shieldAt]).toEqual([DeployKind.Needle, ShieldAt.Back]);
  s.wait(ticks(s.sim.data.gadgets.get("gu_mine")!.gu!.pullS));
  s.clients[0].cmd = {};
  s.wait(2);
  expect([s.body(0).state.needled, s.body(0).state.shieldAt]).toEqual([false, ShieldAt.Front]);
});

// ================================================================ what the shield does

row("fuze.ballistic_shield", "player.defender", async () => {
  // Fuze's melee with his shield up is a bash: no damage since Y9S4 (it was 65); Mute in front of him is knocked down
  // (D-156; Fandom: shoved back onto his back, like Oryx's dash and Nomad's Airjab), facing Fuze, and gets up later.
  const s = await lab(["fuze", "mute"]);
  stand(s, 0, 0, 12);
  stand(s, 1, 0, 10.9);
  const kd = s.sim.data.combat.knockdown;
  const hp = s.body(1).state.hp;
  const z = s.body(1).state.z;
  s.press(0, Btn.Melee);
  expect(until(s, () => s.body(1).state.mode === PawnMode.Knocked, 48)).toBe(true);
  expect(Math.abs(s.body(1).state.yaw - Math.PI) < 0.05 || Math.abs(s.body(1).state.yaw + Math.PI) < 0.05).toBe(true); // he faces Fuze
  s.wait(ticks(kd.fallS) + 2);
  expect(s.body(1).state.hp).toBe(hp);
  expect(s.body(1).state.z).toBeLessThan(z - kd.pushM + 0.15);
  expect(until(s, () => s.body(1).state.mode === PawnMode.Walk, ticks(kd.downS) + ticks(kd.getUpS) + 8)).toBe(true);
});

row("fuze.ballistic_shield", "surface.barricade", async () => {
  // Fuze sprinting with his shield up into a fresh barricade stops at it (since Y11S1 a shield can't dash through an
  // undamaged one); his bash wears it as a knife does; worn, he sprints through it, breaking it.
  const s = await lab(["fuze", "mute"]);
  const door = s.panel("door_a").panel;
  stand(s, 0, -10, 7.4);
  s.clients[0].cmd = { forward: 1, buttons: Btn.Sprint };
  s.wait(64);
  expect([door.broken, door.hp, s.body(0).state.sprinting, s.body(0).state.z > 6.05]).toEqual([false, door.spec.hp, true, true]);
  s.clients[0].cmd = {};
  s.wait(8);
  s.press(0, Btn.Melee, s.aimAt(0, [-10, 1.2, 6.05]));
  s.wait(48);
  expect([door.broken, door.hp < door.spec.hp]).toEqual([false, true]);
  s.clients[0].cmd = { forward: 1, buttons: Btn.Sprint };
  s.wait(32);
  expect(door.broken).toBe(true);
});
