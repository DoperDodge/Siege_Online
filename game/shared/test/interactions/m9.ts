// Interaction rows of Phase 8 M9 (gadgets/DESIGN.md §7, §9, §12): Dokkaebi's tablet, its Jegeo Payload and the dead
// defenders' phones she hacks, on the Gadget Lab. Dokkaebi (client 0) takes her tablet out with Z and presses Fire
// looking at a defender her team has spotted (the test marks him as a scan does: the room's `spot`), as a player does;
// the upload runs while she keeps it up. A defender killed through the room (the lab's damage tool, as any death)
// drops his phone where he fell; Fire with no live target in her aim hacks one.
import { expect } from "vitest";
import {
  ATTACK,
  Btn,
  defaultLoadoutPick,
  DEFENSE,
  Hand,
  heartbeats,
  heartOf,
  kindOf,
  PawnKind,
  PawnMode,
  pawnJammed,
  pointJammed,
  seesThrough,
  ticks,
  type Gadget,
  type GameEvent,
  type InputCmd,
  type Pawn,
} from "../../src/index.js";
import { scene, type Scene } from "./harness.js";
import { row } from "./registry.js";

/** Dokkaebi (client 0) and `others` (Mute unless it says: clients 1, 2) on the Gadget Lab, everyone out of the way. */
async function lab(...others: string[]) {
  const s = await scene(["dokkaebi", ...(others.length ? others : ["mute"])], "gadget_lab");
  s.park();
  return s;
}

const jegeo = (s: Scene) => s.sim.data.gadgets.get("jegeo_payload")!.jegeo!;

/** The events of a kind client i was sent. */
const sent = <K extends GameEvent["kind"]>(s: Scene, i: number, kind: K) => s.clients[i].events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

/** How many of client i's Jegeo events are of `stage` (0 started, 1 done, 2 cut, 3 ringing, 4 a phone hacked). */
const stage = (s: Scene, i: number, n: number) => sent(s, i, "jegeo").filter((e) => e.stage === n).length;

type Look = Partial<InputCmd>;

/**
 * Defender i at (x, 12) and Dokkaebi 6 m behind him (z 18) looking at his heart, her tablet up (Z); `spot`: marked by
 * her team (as a scan does) for a minute. Her view.
 */
function ready(s: Scene, i = 1, spot = true, x = 0): Look {
  s.teleport(i, x, 0, 12);
  s.teleport(0, x, 0, 18);
  if (spot) s.room.spot(s.body(i).id, 60);
  const look = s.aimAt(0, heartOf(s.sim, s.body(i)));
  s.handOut(0, Hand.Ability, look);
  return look;
}

/** She presses Fire with the tablet up, looking `look`. */
const call = (s: Scene, look: Look = {}) => s.press(0, Btn.Fire, look);

/** The rest of an upload's time from her press (and a few ticks more). */
const upload = (s: Scene) => s.wait(ticks(jegeo(s).uploadS) + 2);

/** Whether client i's phone is gone (a payload went off on it). */
const phoneLost = (s: Scene, i: number) => s.ctrlOf(i).phoneLost === true;

/** Defender i (or one of his bodies) killed through the room, as a death is (the lab's damage tool): his phone drops. */
function kill(s: Scene, i: number, pawn: Pawn = s.body(i)) {
  s.room.onLabTool(s.clients[i].id, { kind: "damage", pawnId: pawn.id, amount: 1000, kill: true });
  s.wait(2);
  expect(pawn.state.mode).toBe(PawnMode.Dead);
}

/** The dead defenders' phones on the floor now. */
const phones = (s: Scene) => s.sim.gadgets.list.filter((g) => g.kind === kindOf("dropped_phone"));

/** A Signal Disruptor of client i's (Mute's unless it says) on the floor at (x, z). */
function jammer(s: Scene, x: number, z: number, i = 1): Gadget {
  const g = s.put("signal_disruptor", i, [x, s.sim.data.gadgets.get("signal_disruptor")!.sizeM[1] / 2, z]);
  s.wait(2);
  return g;
}

/** The cameras on, as a match has them; `bpOnly`: the level's own out of the way (a Bulletproof Camera is the first). */
function cams(s: Scene, bpOnly = false) {
  s.sim.matchRules.cameras = true;
  if (bpOnly) s.sim.matchRules.camsBroken = 1;
  return s.sim.level.def.cameras.length;
}

// ================================================================ the Jegeo Payload

row("dokkaebi.jegeo_payload", "player.defender", async () => {
  // Spotted, in front of her (within 25°, through anything): Fire starts a 7 s upload with one of her charges (1 to
  // start) and his phone rings; done, it explodes: 40 hp, a fire where he stood, his phone gone for the round. Not
  // spotted, or with no charge, nothing; a charge comes back in 25 s. A defender whose phone is gone can't be called
  // again. Pulse dismisses one (Interact held 1.5 s): nothing happens to him, and he can't be called for 14 s.
  const s = await lab("mute", "pulse");
  const look = ready(s, 1, false);
  call(s, look);
  expect(stage(s, 0, 0)).toBe(0);
  s.room.spot(s.body(1).id, 60);
  const hp = s.body(1).state.hp;
  call(s, look);
  expect([stage(s, 0, 0), stage(s, 1, 3)]).toEqual([1, 1]);
  const started = sent(s, 0, "jegeo").at(-1)!;
  expect([started.pawnId, started.ticks, started.charges]).toEqual([s.body(1).id, ticks(jegeo(s).uploadS), 0]);
  s.wait(ticks(jegeo(s).uploadS) - 32);
  expect([s.body(1).state.hp, phoneLost(s, 1)]).toEqual([hp, false]);
  s.wait(34);
  expect([s.body(1).state.hp, phoneLost(s, 1), stage(s, 0, 1), stage(s, 1, 1)]).toEqual([hp - jegeo(s).damage, true, 1, 1]);
  // Its fire: he's standing in it.
  s.wait(ticks(jegeo(s).fire.everyS));
  expect(s.body(1).state.hp).toBeLessThan(hp - jegeo(s).damage);
  s.teleport(1, 20, 0, 25);
  // No charge: Pulse, spotted, isn't called.
  const atPulse = ready(s, 2, true, 6);
  call(s, atPulse);
  expect(stage(s, 0, 0)).toBe(1);
  // 50 s on she has two; Mute (his phone gone) isn't called, Pulse is, and dismisses it.
  s.wait(ticks(2 * jegeo(s).regenS));
  const atMute = ready(s, 1, true, 0);
  call(s, atMute);
  expect(stage(s, 0, 0)).toBe(1);
  const pulseHp = s.body(2).state.hp;
  call(s, ready(s, 2, true, 6));
  expect([stage(s, 0, 0), stage(s, 2, 3)]).toEqual([2, 1]);
  s.clients[2].cmd = { buttons: Btn.Interact };
  s.wait(ticks(jegeo(s).dismissS) + 2);
  s.clients[2].cmd = {};
  expect([stage(s, 0, 2), stage(s, 2, 2)]).toEqual([1, 1]);
  upload(s);
  expect([s.body(2).state.hp, phoneLost(s, 2), stage(s, 2, 1)]).toEqual([pulseHp, false, 0]);
  // Not him again for 14 s (from the cut), though she has a charge.
  call(s, ready(s, 2, true, 6));
  expect(stage(s, 0, 0)).toBe(2);
  s.wait(ticks(jegeo(s).cooldownS));
  call(s, ready(s, 2, true, 6));
  expect(stage(s, 0, 0)).toBe(3);
});

row("dokkaebi.jegeo_payload", "skopos.shell_active", async () => {
  // Done on the shell she's in (its 40 hp): no swapping, nor her idle shell's camera, for the rest of the round.
  const s = await lab("skopos");
  const look = ready(s);
  const shell = s.body(1);
  s.press(1, Btn.Ability);
  expect(s.ctrlOf(1).shellCam).toBe(true);
  s.press(1, Btn.Ability);
  expect(s.ctrlOf(1).shellCam).toBe(false);
  const hp = shell.state.hp;
  call(s, look);
  upload(s);
  expect([shell.state.hp, phoneLost(s, 1)]).toEqual([hp - jegeo(s).damage, true]);
  s.teleport(1, 6, 0, 12);
  for (const b of [Btn.Ability, 0, Btn.Interact, 0]) {
    s.clients[1].cmd = { buttons: b };
    s.tick();
  }
  expect(s.ctrlOf(1).shellCam).toBe(false);
  const p = s.sim.data.operators.get("skopos")!.ability.params;
  s.wait(ticks(p.transferSeconds + p.activationSeconds) + 4);
  expect(s.body(1)).toBe(shell);
});

row("dokkaebi.jegeo_payload", "generic.bulletproof_camera", async () => {
  // His phone gone, Mute can't watch cameras: the Bulletproof Camera he was on closes, won't open again, and its dart
  // isn't his to fire; Pulse watches it and fires it.
  const s = await lab("mute", "pulse");
  const index = cams(s, true);
  s.put("bulletproof_camera", 1, [6, 0.06, 6]);
  const look = ready(s);
  s.press(1, Btn.Observe);
  expect(s.ctrlOf(1).cam).toBe(index + 1);
  call(s, look);
  upload(s);
  expect(s.ctrlOf(1).cam).toBe(0);
  s.press(1, Btn.Observe);
  s.press(1, Btn.Gadget);
  s.wait(2);
  expect([s.ctrlOf(1).cam, sent(s, 1, "emp").length]).toEqual([0, 0]);
  s.press(2, Btn.Observe);
  expect(s.ctrlOf(2).cam).toBe(index + 1);
  s.press(2, Btn.Gadget);
  s.wait(2);
  expect(sent(s, 2, "emp").length).toBe(1);
});

row("dokkaebi.jegeo_payload", "camera.default", async () => {
  // The level's camera: Mute's view of it closes and won't open again; Pulse still watches it.
  const s = await lab("mute", "pulse");
  cams(s);
  const look = ready(s);
  s.press(1, Btn.Observe);
  expect(s.ctrlOf(1).cam).toBe(1);
  call(s, look);
  upload(s);
  expect(s.ctrlOf(1).cam).toBe(0);
  s.press(1, Btn.Observe);
  expect(s.ctrlOf(1).cam).toBe(0);
  s.press(2, Btn.Observe);
  expect(s.ctrlOf(2).cam).toBe(1);
});

row("dokkaebi.jegeo_payload", "mute.signal_disruptor", async () => {
  // Not run from his phone (UNVERIFIED: inferred): Mute's jammer jams on after his phone blew up.
  const s = await lab();
  const j = jammer(s, 6, 12);
  call(s, ready(s));
  upload(s);
  expect(phoneLost(s, 1)).toBe(true);
  expect([s.sim.gadgets.get(j.id)?.flags, pointJammed(s.sim, ATTACK, [6, 0.5, 12])]).toEqual([j.flags, true]);
});

row("dokkaebi.jegeo_payload", "pulse.cardiac_sensor", async () => {
  // Not run from his phone (UNVERIFIED: inferred): Pulse's sensor, up, still shows her heartbeat after his phone blew up.
  const s = await lab("pulse");
  const look = ready(s);
  s.teleport(1, 0, 0, 12, 180);
  s.handOut(1, Hand.Ability, { yaw: Math.PI });
  const hearts = () => heartbeats(s.sim, s.body(1)).map((p) => p.id);
  expect(hearts()).toContain(s.body(0).id);
  call(s, look);
  upload(s);
  expect(phoneLost(s, 1)).toBe(true);
  expect(hearts()).toContain(s.body(0).id);
});

row("dokkaebi.jegeo_payload", "mira.black_mirror", async () => {
  // Not run from her phone (UNVERIFIED: inferred): Mira's Black Mirror stands, clear from her side, after her phone blew up.
  const s = await lab("mira");
  s.teleport(1, 1.6, 0, -5.0);
  const m = s.plant(1, [1.6, 1.5, -5.9]);
  expect(m, "the mirror went in").toBeDefined();
  s.clients[1].cmd = {};
  if (s.body(1).state.hand === Hand.Ability) s.press(1, Btn.Ability);
  s.wait(48);
  const flags = s.sim.gadgets.get(m!.id)!.flags;
  call(s, ready(s));
  upload(s);
  expect(phoneLost(s, 1)).toBe(true);
  const now = s.sim.gadgets.get(m!.id)!;
  expect([now.flags, seesThrough(now, [1.6, 1.5, -4.5])]).toEqual([flags, true]);
});

row("dokkaebi.jegeo_payload", "generic.nitro_cell", async () => {
  // Not run from his phone (UNVERIFIED: the Nitro Cell isn't on Ubisoft's list): Mute sets his off after his phone blew up.
  const s = await lab();
  s.room.pickLoadout(s.clients[1].id, { ...defaultLoadoutPick(s.sim.data, "mute"), gadgets: ["nitro_cell"] });
  s.wait(8);
  s.teleport(1, 0, 0, 12);
  s.press(1, Btn.Gadget);
  s.wait(ticks(s.sim.data.gadgetRules.equipS) + 2);
  s.press(1, Btn.Fire, { yaw: Math.PI / 2, pitch: -0.7 });
  s.wait(64);
  const nitro = s.sim.gadgets.list.find((g) => g.kind === kindOf("nitro_cell"));
  expect(nitro, "the Nitro Cell is out").toBeDefined();
  call(s, ready(s));
  upload(s);
  expect(phoneLost(s, 1)).toBe(true);
  s.press(1, Btn.Fire);
  s.wait(4);
  const blasts = sent(s, 1, "blast").filter((e) => e.gadget === kindOf("nitro_cell")).length;
  expect([s.sim.gadgets.get(nitro!.id), blasts]).toEqual([undefined, 1]);
});

row("dokkaebi.jegeo_payload", "player.attacker", async () => {
  // Its fire is no one's (UNVERIFIED: its size and bite are ours): Dokkaebi walking into it is hurt, every 0.5 s, until
  // it's out 5 s on.
  const s = await lab();
  call(s, ready(s));
  upload(s);
  s.teleport(1, 20, 0, 25);
  s.teleport(0, 0.8, 0, 12);
  const hp = s.body(0).state.hp;
  s.wait(2 * ticks(jegeo(s).fire.everyS));
  expect(s.body(0).state.hp).toBeLessThan(hp);
  s.wait(ticks(jegeo(s).fire.seconds));
  const after = s.body(0).state.hp;
  s.wait(64);
  expect(s.body(0).state.hp).toBe(after);
});

// ================================================================ the phones she hacks

row("dokkaebi.camera_hack", "camera.default", async () => {
  // Mute dead, his phone on the floor where he fell: Fire with no live target hacks it from anywhere, and for 20 s the
  // attackers watch the defenders' cameras (Observe, with no drone out); then they're closed. Each phone once, 2 hacks
  // a round (UNVERIFIED: siege.gg's test server).
  const s = await lab("mute", "pulse");
  cams(s);
  s.teleport(0, 20, 0, 25);
  s.press(0, Btn.Observe);
  expect(s.ctrlOf(0).cam).toBe(0);
  s.teleport(1, -10, 0, 12);
  kill(s, 1);
  expect(phones(s).map((g) => [g.team, Math.round(g.pos[0]), Math.round(g.pos[2])])).toEqual([[DEFENSE, -10, 12]]);
  s.handOut(0, Hand.Ability);
  call(s);
  expect(stage(s, 0, 4)).toBe(1);
  expect(sent(s, 0, "jegeo").at(-1)!.ticks).toBe(ticks(jegeo(s).camS));
  s.press(0, Btn.Observe);
  expect(s.ctrlOf(0).cam).toBe(1);
  s.wait(ticks(jegeo(s).camS));
  expect([s.ctrlOf(0).cam, s.sim.matchRules.camsLent]).toEqual([0, false]);
  s.press(0, Btn.Observe);
  expect(s.ctrlOf(0).cam).toBe(0);
  // That phone again: nothing. Pulse's: her second hack. A third phone: no more this round.
  call(s);
  expect(stage(s, 0, 4)).toBe(1);
  kill(s, 2);
  call(s);
  expect(stage(s, 0, 4)).toBe(2);
  s.put("dropped_phone", 0, [10, 0.01, 10], { team: DEFENSE });
  call(s);
  expect(stage(s, 0, 4)).toBe(2);
});

row("dokkaebi.camera_hack", "generic.bulletproof_camera", async () => {
  // A Bulletproof Camera is among them, to watch only: her gadget key on it fires no dart (UNVERIFIED: pre-remaster).
  const s = await lab();
  const index = cams(s, true);
  const cam = s.put("bulletproof_camera", 1, [6, 0.06, 6]);
  s.teleport(1, -10, 0, 12);
  kill(s, 1);
  s.handOut(0, Hand.Ability);
  call(s);
  s.press(0, Btn.Observe);
  expect(s.ctrlOf(0).cam).toBe(index + 1);
  s.press(0, Btn.Gadget);
  s.wait(2);
  expect([sent(s, 0, "emp").length, s.sim.gadgets.get(cam.id)!.readyAt]).toEqual([0, cam.readyAt]);
});

row("dokkaebi.camera_hack", "skopos.circuit_board", async () => {
  // Skopós's idle shell destroyed isn't his elimination: no phone. His shell destroyed with him in it, he's out and
  // drops his circuit board where it fell, hacked as a phone is.
  const s = await lab("skopos");
  cams(s);
  const ctrl = s.ctrlOf(1);
  const idle = s.sim.pawns.get(ctrl.pawnIds.find((id) => id !== ctrl.possessedPawnId && s.sim.pawns.get(id)?.kind === PawnKind.Body)!)!;
  kill(s, 1, idle);
  expect(phones(s)).toEqual([]);
  s.teleport(1, -10, 0, 12);
  kill(s, 1);
  expect(phones(s).map((g) => [Math.round(g.pos[0]), Math.round(g.pos[2])])).toEqual([[-10, 12]]);
  s.handOut(0, Hand.Ability);
  call(s);
  expect(stage(s, 0, 4)).toBe(1);
  s.press(0, Btn.Observe);
  expect(s.ctrlOf(0).cam).toBe(1);
});

// ================================================================ what stops her

row("mute.signal_disruptor", "dokkaebi.jegeo_payload", async () => {
  // Mute standing in his jammer can't be called; out of it he can, and walking into it cuts the upload: nothing
  // happens to him (her charge is spent).
  const s = await lab();
  jammer(s, 6, 12);
  const inside = ready(s, 1, true, 5.5);
  const hp = s.body(1).state.hp;
  call(s, inside);
  expect(stage(s, 0, 0)).toBe(0);
  s.teleport(1, 0, 0, 12);
  call(s, s.aimAt(0, heartOf(s.sim, s.body(1))));
  expect(stage(s, 0, 0)).toBe(1);
  s.wait(64);
  s.teleport(1, 5.5, 0, 12);
  expect([stage(s, 0, 2), stage(s, 1, 2)]).toEqual([1, 1]);
  upload(s);
  expect([s.body(1).state.hp, phoneLost(s, 1), stage(s, 0, 1)]).toEqual([hp, false, 0]);
});

row("mute.signal_disruptor", "dokkaebi.tablet", async () => {
  // Dokkaebi standing in a jammer can't start an upload (UNVERIFIED: as a remote charge's detonator); out of it she can,
  // and stepping back into it cuts the upload.
  const s = await lab();
  const look = ready(s);
  jammer(s, 0.5, 18);
  expect(pawnJammed(s.sim, s.body(0))).toBe(true);
  call(s, look);
  expect(stage(s, 0, 0)).toBe(0);
  s.teleport(0, 0, 0, 21.5);
  call(s, s.aimAt(0, heartOf(s.sim, s.body(1))));
  expect(stage(s, 0, 0)).toBe(1);
  s.wait(64);
  s.teleport(0, 0, 0, 18);
  expect(stage(s, 0, 2)).toBe(1);
  upload(s);
  expect(phoneLost(s, 1)).toBe(false);
});

row("mute.signal_disruptor", "dokkaebi.camera_hack", async () => {
  // No effect (UNVERIFIED: ours): standing in a jammer she hacks a dead defender's phone lying by another, and watches
  // the level's camera with a third under it.
  const s = await lab("mute", "pulse");
  cams(s);
  s.teleport(1, -10, 0, 12);
  kill(s, 1);
  const [phone] = phones(s);
  jammer(s, phone.pos[0] + 0.5, phone.pos[2], 2);
  s.teleport(0, 0, 0, 18);
  jammer(s, 0.5, 18, 2);
  const cam = s.sim.level.def.cameras[0];
  jammer(s, cam.pos[0], cam.pos[2] - 1, 2);
  expect([pawnJammed(s.sim, s.body(0)), pointJammed(s.sim, ATTACK, cam.pos)]).toEqual([true, true]);
  s.handOut(0, Hand.Ability);
  call(s);
  expect(stage(s, 0, 4)).toBe(1);
  s.press(0, Btn.Observe);
  expect(s.ctrlOf(0).cam).toBe(1);
});

row("generic.impact_emp", "dokkaebi.jegeo_payload", async () => {
  // An EMP on him (a teammate's: Sledge's; UNVERIFIED) cuts her upload: nothing happens to him.
  const s = await lab("mute", "sledge");
  const look = ready(s);
  const hp = s.body(1).state.hp;
  call(s, look);
  s.wait(64);
  s.setOff(s.put("impact_emp", 2, [0, 0.05, 12.5]));
  expect(s.body(1).state.jammed).toBeGreaterThan(0);
  expect([stage(s, 0, 2), stage(s, 1, 2)]).toEqual([1, 1]);
  upload(s);
  expect([s.body(1).state.hp, phoneLost(s, 1)]).toEqual([hp, false]);
});

row("generic.bulletproof_camera_dart", "dokkaebi.tablet", async () => {
  // Pulse's dart bursting at Dokkaebi's feet EMPs her, and her upload is cut (UNVERIFIED: ours).
  const s = await lab("mute", "pulse");
  const index = cams(s, true);
  const look = ready(s);
  s.put("bulletproof_camera", 2, [3, 0.06, 18]);
  s.press(2, Btn.Observe);
  expect(s.ctrlOf(2).cam).toBe(index + 1);
  call(s, look);
  const aim = s.look(s.sim.viewOf(s.ctrlOf(2))!.pos, [0, 0, 18]);
  s.clients[2].cmd = aim;
  s.wait(96);
  s.press(2, Btn.Gadget, aim);
  s.wait(2);
  expect(s.body(0).state.jammed).toBeGreaterThan(0);
  expect([stage(s, 0, 2), stage(s, 1, 2)]).toEqual([1, 1]);
  upload(s);
  expect(phoneLost(s, 1)).toBe(false);
});

row("generic.observation_blocker", "dokkaebi.camera_hack", async () => {
  // On the defenders' cameras she hacked, their blockers hide from her as from her drones (UNVERIFIED: inferred): she
  // spots Pulse from the level's camera; with Pulse's blocker between them, she doesn't.
  const s = await lab("mute", "pulse");
  cams(s);
  s.teleport(1, 10, 0, 20);
  kill(s, 1);
  s.handOut(0, Hand.Ability);
  call(s);
  s.press(0, Btn.Observe);
  expect(s.ctrlOf(0).cam).toBe(1);
  s.teleport(2, -8, 0, -2);
  expect(s.scan(0, s.body(2))).toBe(true);
  s.put("observation_blocker", 2, [-8, 0.125, 2]);
  expect(s.scan(0, s.body(2))).toBe(false);
});

row("weapon.bullet", "defender.dropped_phone", async () => {
  // Any damage destroys a dead defender's phone (UNVERIFIED: a pre-remaster rule): Pulse shoots Mute's, and Dokkaebi
  // has nothing to hack.
  const s = await lab("mute", "pulse");
  s.teleport(1, 6, 0, 12);
  kill(s, 1);
  const [phone] = phones(s);
  s.teleport(2, 6, 0, 15);
  s.shootAt(2, phone.pos);
  expect(phones(s)).toEqual([]);
  s.handOut(0, Hand.Ability);
  call(s);
  expect(stage(s, 0, 4)).toBe(0);
});
