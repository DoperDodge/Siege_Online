// Fuze's Ballistic Shield (Phase 8 M11, player/shield.ts, gadgets/DESIGN.md §8): its loadout, where its plate is,
// the plate's hitboxes, aimed-only fire, its speed, and what knocks it aside that no CSV row covers (a stun).
import { describe, expect, it } from "vitest";
import {
  Btn,
  DEG,
  defaultLoadoutPick,
  DeployKind,
  eyePose,
  Hand,
  isPickable,
  loadGameData,
  PawnMode,
  placeShield,
  quantizeRemote,
  remoteState,
  resolveLoadout,
  ShieldAt,
  pawnHitboxes,
  plateBend,
  poseHitboxes,
  shieldFrame,
  shieldHitboxes,
  shieldPlace,
  Sim,
  Stance,
  ticks,
  type LoadoutPick,
  type Pawn,
} from "../src/index.js";
import { input, run, teleport } from "./helpers.js";
import { scene } from "./interactions/harness.js";

const data = loadGameData();
const SHIELD = { weapon: "ballistic_shield", sight: null, barrel: null, grip: null, underbarrel: null };
const shieldPick = (): LoadoutPick => ({ ...defaultLoadoutPick(data, "fuze"), primary: SHIELD });

/** Fuze on the Movement Lab, with the shield (or his default AK-12), settled and facing −z. */
async function fuze(withShield = true) {
  const sim = await Sim.create("movement_lab");
  const ctrl = sim.addPlayer("fuze", "fuze", 0, undefined, withShield ? shieldPick() : undefined);
  const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
  teleport(sim, ctrl, 0, 0, 0);
  return { sim, ctrl, pawn };
}

describe("the Ballistic Shield's loadout", () => {
  it("can be picked (the GONNE-6 still can't), and holds the secondary pistol, aimed in the shield's time", () => {
    expect([isPickable(data, "ballistic_shield"), isPickable(data, "gonne_6")]).toEqual([true, false]);
    const { loadout, problem } = resolveLoadout(data, shieldPick());
    expect(problem).toBeNull();
    const k = loadout.shield!;
    expect(k).not.toBeNull();
    const pistol = defaultLoadoutPick(data, "fuze").secondary.weapon;
    expect(loadout.weapons.map((w) => w.id)).toEqual([pistol, pistol]);
    expect([loadout.weapons[0].ads.ticks, loadout.weapons[0].ads.fromSprintTicks]).toEqual([ticks(k.pistolAdsS.walk), ticks(k.pistolAdsS.sprint)]);
    expect(resolveLoadout(data, defaultLoadoutPick(data, "fuze")).loadout.shield).toBeNull();
  });
});

describe("where the plate is", () => {
  it("up in front with the pistol, on the back for a gadget, prone or a hold, and gone while knocked aside, down or dead", async () => {
    const { sim, ctrl, pawn } = await fuze();
    const s = pawn.state;
    expect([s.hand, s.shieldAt]).toEqual([Hand.Weapon, ShieldAt.Front]);
    // His gadget in hand (3): on his back.
    sim.step(new Map([[ctrl.id, input({ buttons: Btn.Gadget })]]));
    run(sim, ctrl, {}, 0.5);
    expect([s.hand !== Hand.Weapon, s.shieldAt]).toEqual([true, ShieldAt.Back]);
    sim.step(new Map([[ctrl.id, input({ buttons: Btn.Gadget })]]));
    run(sim, ctrl, {}, 0.5);
    expect([s.hand, s.shieldAt]).toEqual([Hand.Weapon, ShieldAt.Front]);
    // Prone: on his back.
    run(sim, ctrl, { stance: Stance.Prone }, 1.5);
    expect(s.shieldAt).toBe(ShieldAt.Back);
    run(sim, ctrl, { stance: Stance.Stand }, 1.5);
    expect(s.shieldAt).toBe(ShieldAt.Front);
    // A hold (a needle pulled, a plant): on his back.
    s.deployKind = DeployKind.Needle;
    placeShield(pawn);
    expect(s.shieldAt).toBe(ShieldAt.Back);
    s.deployKind = DeployKind.None;
    // Knocked aside: gone until its time is out.
    s.guard = 3;
    placeShield(pawn);
    expect(s.shieldAt).toBe(ShieldAt.None);
    run(sim, ctrl, {}, 4 / 64);
    expect([s.guard, s.shieldAt]).toEqual([0, ShieldAt.Front]);
    // Dead: gone.
    s.mode = PawnMode.Dead;
    placeShield(pawn);
    expect(s.shieldAt).toBe(ShieldAt.None);
  });

  it("goes to others in the remote record, so a rewind puts it where it was", async () => {
    const { pawn } = await fuze();
    for (const at of [ShieldAt.None, ShieldAt.Front, ShieldAt.Back]) {
      pawn.state.shieldAt = at;
      expect(remoteState(quantizeRemote(pawn.state)).shieldAt).toBe(at);
    }
  });
});

describe("the plate's hitboxes", () => {
  it("stand across him in front (frontM at the middle, curving back round his sides), a rigid heightM down from aboveEyeM over the eyes, the outer ones only up to the top part's shoulders; swing aside to his left as he aims (never into the floor); tilt whole with a lean; on the back behind the torso; none prone", async () => {
    const { sim, pawn } = await fuze();
    const k = pawn.loadout!.shield!;
    const m = sim.data.movement;
    const hb = sim.data.hitboxes;
    const s = { ...pawn.state, yaw: 0, x: 0, y: 0, z: 0, lean: 0, adsQ: 0 };
    const eye = eyePose(m, hb, s).pos[1];
    type Boxes = ReturnType<typeof shieldHitboxes>;
    const top = (boxes: Boxes) => Math.max(...boxes.map((b) => Math.max(b.a[1], b.b[1]) + b.radius));
    const bottom = (boxes: Boxes) => Math.min(...boxes.map((b) => Math.min(b.a[1], b.b[1]) - b.radius));
    const len = (b: Boxes[number]) => Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]);
    const front = shieldHitboxes(m, hb, s, k.plate, "front");
    expect(front).toHaveLength(7);
    expect(front.every((b) => b.part === "shield")).toBe(true);
    // The middle capsule frontM ahead; the outer ones nearer him, the plate curving back round his sides (u = ±6/7).
    expect(front[3].a[2]).toBeCloseTo(-k.plate.frontM, 4);
    expect(front[0].a[2]).toBeCloseTo(-k.plate.frontM + plateBend(k.plate, 6 / 7), 4);
    expect(front[0].a[2] - front[3].a[2]).toBeGreaterThan(0.02);
    expect(front[6].a[2]).toBeCloseTo(front[0].a[2], 6);
    const width = Math.max(...front.map((b) => b.a[0] + b.radius)) - Math.min(...front.map((b) => b.a[0] - b.radius));
    expect(width).toBeCloseTo(k.plate.widthM, 4);
    expect(top(front)).toBeCloseTo(eye + k.plate.aboveEyeM, 3);
    expect(bottom(front)).toBeCloseTo(eye + k.plate.aboveEyeM - k.plate.heightM, 3);
    // Its narrower top part: the outer capsules (past it) stop at its shoulders, the ones within it go to its top.
    const topOf = (b: Boxes[number]) => Math.max(b.a[1], b.b[1]) + b.radius;
    expect(topOf(front[0])).toBeCloseTo(top(front) - k.plate.shoulderM, 3);
    expect(topOf(front[1])).toBeCloseTo(top(front), 3);
    // Fully aimed it has swung aside to his left by sideM (the pistol clears its right edge), its left edge drawn back
    // round his side, dropM lower; half aimed, half way across (the swing is eased: quick in its middle).
    const aimed = shieldHitboxes(m, hb, { ...s, adsQ: 65535 }, k.plate, "front");
    expect(aimed[3].a[0]).toBeCloseTo(-k.plate.ads.sideM, 3);
    expect(aimed[0].a[2]).toBeGreaterThan(aimed[6].a[2] + 0.1);
    expect(top(aimed)).toBeLessThan(top(front) - k.plate.ads.dropM + 0.01);
    expect(shieldHitboxes(m, hb, { ...s, adsQ: 32768 }, k.plate, "front")[3].a[0]).toBeCloseTo(-k.plate.ads.sideM / 2, 2);
    // Crouched and aimed it stays over the floor.
    const crouched = { ...s, stance: Stance.Crouch, stanceFrom: Stance.Crouch, stanceT: 1, adsQ: 65535 };
    expect(bottom(shieldHitboxes(m, hb, crouched, k.plate, "front"))).toBeGreaterThanOrEqual(0.02 - 1e-6);
    // Leaning right, it tilts whole (as far as the view rolls): its top goes right, its right side dips, nothing on it
    // stretches, and its window stays in front of the eyes, carried across with the head (lean · offset), standing and
    // crouched (Ulo: crouched, a lean bared the head).
    const leaning = shieldHitboxes(m, hb, { ...s, lean: 1 }, k.plate, "front");
    expect(leaning[3].b[0] - front[3].b[0]).toBeGreaterThan(0.1);
    expect(Math.max(leaning[6].a[1], leaning[6].b[1])).toBeLessThan(Math.max(leaning[0].a[1], leaning[0].b[1]));
    for (let i = 0; i < 7; i++) expect(len(leaning[i])).toBeCloseTo(len(front[i]), 6);
    const atEyes = (b: Boxes[number], y: number) => b.a[0] + ((y - b.a[1]) / (b.b[1] - b.a[1])) * (b.b[0] - b.a[0]);
    expect(atEyes(leaning[3], eye)).toBeCloseTo(m.lean.offset, 4);
    const crouch = { ...s, stance: Stance.Crouch, stanceFrom: Stance.Crouch, stanceT: 1 };
    const crouchEye = eyePose(m, hb, crouch).pos[1];
    expect(atEyes(shieldHitboxes(m, hb, { ...crouch, lean: -1 }, k.plate, "front")[3], crouchEye)).toBeCloseTo(-m.lean.offset, 4);
    // Crouched it's held crouchRaiseM higher over the eyes (over his shoulders).
    expect(top(shieldHitboxes(m, hb, crouch, k.plate, "front"))).toBeCloseTo(crouchEye + k.plate.aboveEyeM + k.plate.crouchRaiseM, 3);
    // Facing +x (yaw −90°), its middle is frontM out along +x.
    const turned = shieldHitboxes(m, hb, { ...s, yaw: -90 * DEG }, k.plate, "front");
    expect(turned[3].a[0]).toBeCloseTo(k.plate.frontM, 4);
    const back = shieldHitboxes(m, hb, s, k.plate, "back");
    expect(back.every((b) => b.a[2] > 0.1)).toBe(true);
    expect(shieldHitboxes(m, hb, { ...s, stance: Stance.Prone, stanceFrom: Stance.Prone, stanceT: 1 }, k.plate, "back")).toEqual([]);
    expect(shieldPlace({ ...s, shieldAt: ShieldAt.None })).toBeNull();
  });

  it("held up, his hands are on its grips behind it, crossed (no arm out past the plate, so nothing of his is hit through it); aiming, his right hand comes out with the pistol", async () => {
    const { sim, pawn } = await fuze();
    const k = pawn.loadout!.shield!;
    const m = sim.data.movement;
    const hb = sim.data.hitboxes;
    const s = { ...pawn.state, yaw: 0, x: 0, y: 0, z: 0, lean: 0, adsQ: 0, shieldAt: ShieldAt.Front as typeof pawn.state.shieldAt };
    const arms = (st: typeof s) => pawnHitboxes(m, hb, { ...pawn, state: st }).filter((b) => b.part === "arm_l" || b.part === "arm_r");
    // Facing −z: the plate's back is at −(frontM − its capsules' radius); every arm stays behind it.
    const plateBack = -k.plate.frontM + k.plate.widthM / 2 / 7;
    for (const b of arms(s)) expect(Math.min(b.a[2], b.b[2]) - b.radius).toBeGreaterThan(plateBack);
    // Crossed: the left arm's hand on the right of his middle, the right arm's on the left.
    const [l, r] = arms(s);
    expect([l.b[0] > 0, r.b[0] < 0]).toEqual([true, true]);
    // Aiming, the right hand comes out in front (the pistol) and over to its own side.
    const aimedR = arms({ ...s, adsQ: 65535 })[1];
    expect(aimedR.b[0]).toBeGreaterThan(0);
    expect(aimedR.b[2]).toBeLessThan(r.b[2] - 0.1);
    // Without the shield up the hands are where any body's are.
    expect(arms({ ...s, shieldAt: ShieldAt.None })[1].b).toEqual(poseHitboxes(m, hb, s).find((b) => b.part === "arm_r")!.b);
    // Crouched, his shoulders hunch behind it: each arm's top (at the shoulder) under the plate's top part's shoulders,
    // so behind its wider body (Ulo: crouched, the shoulders showed); standing they are anyway.
    for (const st of [s, { ...s, stance: Stance.Crouch, stanceFrom: Stance.Crouch, stanceT: 1 }]) {
      const f = shieldFrame(m, hb, st, k.plate, "front")!;
      for (const b of arms(st)) expect(b.a[1] + b.radius).toBeLessThan(f.y1 - f.shoulder);
    }
  });

  it("how far it has slid down goes to others in the remote record (8 steps), with the shield up only", async () => {
    const { pawn } = await fuze();
    const sent = (adsQ: number, shieldAt: number) => remoteState(quantizeRemote({ ...pawn.state, adsQ, shieldAt })).adsQ;
    expect([sent(0, ShieldAt.Front), sent(65535, ShieldAt.Front), sent(65535, ShieldAt.Back), sent(65535, ShieldAt.None)]).toEqual([0, 65535, 0, 0]);
    expect(sent(30000, ShieldAt.Front)).toBe(Math.round((3 / 7) * 65535));
  });
});

describe("holding the shield", () => {
  /** Shots fired over `seconds` holding `buttons`. */
  const shots = (w: { sim: Sim; ctrl: { id: number } }, buttons: number, seconds: number) => {
    let n = 0;
    for (let i = 0; i < ticks(seconds); i++) {
      w.sim.step(new Map([[w.ctrl.id, input({ buttons })]]));
      n += w.sim.events.filter((e) => e.kind === "shot").length;
    }
    return n;
  };

  it("fires the pistol only aimed, once the aim is done (no hip fire); Swap does nothing", async () => {
    const w = await fuze();
    const s = w.pawn.state;
    expect(shots(w, Btn.Fire, 0.5)).toBe(0);
    run(w.sim, w.ctrl, {}, 0.5);
    // Aiming: nothing until the shield's aim time is over, then it fires.
    const k = w.pawn.loadout!.shield!;
    expect(shots(w, Btn.Ads, k.pistolAdsS.walk - 0.1)).toBe(0);
    expect(shots(w, Btn.Ads | Btn.Fire, 0.05)).toBe(0);
    run(w.sim, w.ctrl, { buttons: Btn.Ads }, 0.2);
    expect(shots(w, Btn.Ads | Btn.Fire, 0.05)).toBe(1);
    run(w.sim, w.ctrl, {}, 1);
    w.sim.step(new Map([[w.ctrl.id, input({ buttons: Btn.Swap })]]));
    run(w.sim, w.ctrl, {}, 1);
    expect(s.slot).toBe(0);
  });

  it("walks at moveSpeedMult of Fuze's speed with his AK-12", async () => {
    const speedOf = async (withShield: boolean) => {
      const w = await fuze(withShield);
      run(w.sim, w.ctrl, { forward: 1 }, 1.5);
      return Math.hypot(w.pawn.state.vx, w.pawn.state.vz);
    };
    const [shielded, plain] = [await speedOf(true), await speedOf(false)];
    const k = resolveLoadout(data, shieldPick()).loadout.shield!;
    expect(shielded / plain).toBeCloseTo(k.moveSpeedMult, 2);
  });
});

describe("a stun", () => {
  it("knocks a raised shield aside (a concussion's guard break is always whole), whoever's it is", async () => {
    const s = await scene(["fuze", "mute"], "gadget_lab");
    s.room.pickLoadout(s.clients[0].id, shieldPick());
    s.wait(8);
    s.park();
    s.teleport(0, 0, 0, 12);
    s.wait(4);
    const body: Pawn = s.body(0);
    expect(body.state.shieldAt).toBe(ShieldAt.Front);
    const g = s.put("stun", 1, [0, 0.05, 10.5]);
    s.setOff(g);
    expect(body.state.shieldAt).toBe(ShieldAt.None);
    s.wait(ticks(body.loadout!.shield!.guardBreak.seconds) + 2);
    expect(body.state.shieldAt).toBe(ShieldAt.Front);
  });
});

describe("a teammate's bullets on the shield", () => {
  it("suppress its carrier only with friendly fire on (as a teammate's blow does nothing with it off: the review, M12)", async () => {
    const s = await scene(["fuze", "sledge"], "gadget_lab");
    s.room.pickLoadout(s.clients[0].id, shieldPick());
    s.wait(8);
    s.park();
    s.teleport(0, 0, 0, 12);
    s.clients[0].cmd = { yaw: Math.PI };
    s.teleport(1, 0, 0, 18);
    s.wait(4);
    // (The lab's preset, this room's own copy: friendly fire off, then on again.)
    const room = s.room as unknown as { labRules: { friendlyFire: { actionPhase: boolean } } };
    room.labRules = { ...room.labRules, friendlyFire: { ...room.labRules.friendlyFire, actionPhase: false } };
    s.shootAt(1, [0, 1.3, 12]);
    expect(s.body(0).state.suppress).toBe(0);
    room.labRules = { ...room.labRules, friendlyFire: { ...room.labRules.friendlyFire, actionPhase: true } };
    s.shootAt(1, [0, 1.3, 12]);
    expect(s.body(0).state.suppress).toBeGreaterThan(0);
  });
});
