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
  it("stand across him in front (frontM at the middle, curveM nearer at the edges), a rigid heightM down from aboveEyeM over the eyes, the top corners cut; slide down as he aims (crouched, no further than the floor); bend with a lean; on the back behind the torso; none prone", async () => {
    const { sim, pawn } = await fuze();
    const k = pawn.loadout!.shield!;
    const m = sim.data.movement;
    const hb = sim.data.hitboxes;
    const s = { ...pawn.state, yaw: 0, x: 0, y: 0, z: 0, lean: 0, adsQ: 0 };
    const eye = eyePose(m, hb, s).pos[1];
    type Boxes = ReturnType<typeof shieldHitboxes>;
    const top = (boxes: Boxes) => Math.max(...boxes.map((b) => Math.max(b.a[1], b.b[1]) + b.radius));
    const bottom = (boxes: Boxes) => Math.min(...boxes.map((b) => Math.min(b.a[1], b.b[1]) - b.radius));
    const front = shieldHitboxes(m, hb, s, k.plate, "front");
    expect(front).toHaveLength(7);
    expect(front.every((b) => b.part === "shield")).toBe(true);
    // The middle capsule frontM ahead; the outer ones nearer him by the curve (u = ±6/7 across).
    expect(front[3].a[2]).toBeCloseTo(-k.plate.frontM, 4);
    expect(front[0].a[2]).toBeCloseTo(-k.plate.frontM + k.plate.curveM * (6 / 7) ** 2, 4);
    expect(front[6].a[2]).toBeCloseTo(front[0].a[2], 6);
    const width = Math.max(...front.map((b) => b.a[0] + b.radius)) - Math.min(...front.map((b) => b.a[0] - b.radius));
    expect(width).toBeCloseTo(k.plate.widthM, 4);
    expect(top(front)).toBeCloseTo(eye + k.plate.aboveEyeM, 3);
    expect(bottom(front)).toBeCloseTo(eye + k.plate.aboveEyeM - k.plate.heightM, 3);
    // Its cut top corners: the edge capsules stop chamferM under the middle's top.
    const edgeTop = Math.max(front[0].a[1], front[0].b[1]) + front[0].radius;
    expect(edgeTop).toBeCloseTo(top(front) - k.plate.chamferM, 3);
    // Fully aimed it has slid down by aboveEye + adsBelowEye (the head over it), all of it; half aimed, half as far.
    const slide = k.plate.aboveEyeM + k.plate.adsBelowEyeM;
    const aimed = shieldHitboxes(m, hb, { ...s, adsQ: 65535 }, k.plate, "front");
    expect(top(aimed)).toBeCloseTo(eye - k.plate.adsBelowEyeM, 3);
    expect(bottom(aimed)).toBeCloseTo(eye - k.plate.adsBelowEyeM - k.plate.heightM, 3);
    expect(top(shieldHitboxes(m, hb, { ...s, adsQ: 32768 }, k.plate, "front"))).toBeCloseTo(eye + k.plate.aboveEyeM - slide * (32768 / 65535), 3);
    // Crouched and aimed it comes to rest on the floor (it slides no further), and he aims over its top.
    const crouched = { ...s, stance: Stance.Crouch, stanceFrom: Stance.Crouch, stanceT: 1, adsQ: 65535 };
    const low = shieldHitboxes(m, hb, crouched, k.plate, "front");
    expect(bottom(low)).toBeCloseTo(0.02, 3);
    expect(top(low)).toBeCloseTo(0.02 + k.plate.heightM, 3);
    expect(top(low)).toBeLessThan(eyePose(m, hb, crouched).pos[1]);
    // Leaning right, it bends with his spine: its top goes right by about the lean's offset (a little more, being over
    // the eyes), its bottom (under the hips) not at all.
    const leaning = shieldHitboxes(m, hb, { ...s, lean: 1 }, k.plate, "front");
    expect(leaning[3].b[0] - front[3].b[0]).toBeGreaterThan(m.lean.offset);
    expect(leaning[3].a[0] - front[3].a[0]).toBeCloseTo(0, 6);
    // Facing +x (yaw −90°), its middle is frontM out along +x.
    const turned = shieldHitboxes(m, hb, { ...s, yaw: -90 * DEG }, k.plate, "front");
    expect(turned[3].a[0]).toBeCloseTo(k.plate.frontM, 4);
    const back = shieldHitboxes(m, hb, s, k.plate, "back");
    expect(back.every((b) => b.a[2] > 0.1)).toBe(true);
    expect(shieldHitboxes(m, hb, { ...s, stance: Stance.Prone, stanceFrom: Stance.Prone, stanceT: 1 }, k.plate, "back")).toEqual([]);
    expect(shieldPlace({ ...s, shieldAt: ShieldAt.None })).toBeNull();
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
