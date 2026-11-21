// Hull's Plate (Project Redmond R3, gadgets/R3_OPERATORS.md §2): a heavy plate held with his sidearm, which fires from
// the hip only. Folded it's 0.7 m across, from the floor to just under his eyes (he looks and shoots over it). His
// ability key braces it: over 0.4 s its sides and top come out until it covers him from the floor to over his head, a
// metre across; braced he walks at 0.55 (no sprint) with no weapon, and a blast ahead of him reaches him only a tenth
// through it, never knocking it aside. It folds back over 0.3 s, or when anything takes the plate down.
import { describe, expect, it } from "vitest";
import { blastEffects, Btn, eyePose, GFlag, Hand, kindOf, loadGameData, pawnHitboxes, PawnMode, platePose, Sim, type Pawn, type PlayerController } from "../src/index.js";
import { hspeed, input, run, teleport } from "./helpers.js";
import { scene } from "./interactions/harness.js";
import { botLoadout, ByteReader, encodeLobbyAction, handleRoomMessage, isFormat, Phase, Room, sees, TICK_HZ, type FormatMode } from "../src/index.js";

const data = loadGameData();
const plate = data.weapons.get("hull_plate")!;
if (plate.class !== "shield") throw new Error("hull_plate");
const k = plate.shield;
const brace = k.brace!;

/** Hull on the Movement Lab, settled, facing −z. */
async function hull() {
  const sim = await Sim.create("movement_lab");
  const ctrl = sim.addPlayer("hull", "hull", 0);
  teleport(sim, ctrl, 0, 0, 0);
  return { sim, ctrl, pawn: sim.pawns.get(ctrl.possessedPawnId)! };
}

/** A tick with these buttons pressed (once), then let go. */
function press(sim: Sim, ctrl: PlayerController, buttons: number) {
  sim.step(new Map([[ctrl.id, input({ buttons })]]));
  sim.step(new Map([[ctrl.id, input({})]]));
}

/** The plate's hitboxes' lowest and highest points (over his feet), and how wide they reach either side. */
function reach(sim: Sim, p: Pawn) {
  const parts = pawnHitboxes(sim.data.movement, sim.data.hitboxes, p).filter((h) => h.part === "shield");
  const ys = parts.flatMap((h) => [h.a[1] - h.radius, h.b[1] + h.radius]);
  const xs = parts.flatMap((h) => [h.a[0] - h.radius, h.a[0] + h.radius]);
  return { bottom: Math.min(...ys) - p.state.y, top: Math.max(...ys) - p.state.y, width: Math.max(...xs) - Math.min(...xs) };
}

const shotsWith = (sim: Sim, ctrl: PlayerController, buttons: number, seconds: number) => {
  let n = 0;
  for (let i = 0; i < seconds * 64; i++) {
    sim.step(new Map([[ctrl.id, input({ buttons })]]));
    n += sim.events.filter((e) => e.kind === "shot").length;
  }
  return n;
};

describe("Hull and his Plate (R3)", () => {
  it("is an attacker, 3 / 1, with the Hull Plate and his pistol in it, fired from the hip only", async () => {
    const op = data.operators.get("hull")!;
    expect([op.name, op.side, op.healthRating, op.speedRating, op.loadout.primaries, op.ability.name]).toEqual(["Hull", "attacker", 3, 1, ["hull_plate"], "Brace"]);
    expect([k.noAds, k.hipFire, brace.folded.widthM, brace.folded.heightM, k.plate.widthM, k.plate.heightM]).toEqual([true, true, 0.7, 1.55, 1.0, 1.86]);
    const { pawn } = await hull();
    expect(pawn.loadout!.shield).not.toBeNull();
    expect(pawn.loadout!.weapons.map((w) => w.id)).toEqual([op.loadout.secondaries[0], op.loadout.secondaries[0]]);
  });

  it("folded: from the floor to just under his eyes, 0.7 m across; his pistol fires from the hip and is never aimed", async () => {
    const { sim, ctrl, pawn } = await hull();
    const r = reach(sim, pawn);
    expect(r.bottom).toBeLessThan(0.05);
    expect(r.top).toBeLessThan(sim.data.movement.stance.stand.eye);
    expect(r.width).toBeCloseTo(brace.folded.widthM, 1);
    // From the hip: shots without aiming; ADS held does nothing.
    expect(shotsWith(sim, ctrl, Btn.Fire, 0.4)).toBeGreaterThan(0);
    run(sim, ctrl, { buttons: Btn.Ads }, 0.5);
    expect(pawn.state.adsQ).toBe(0);
  });

  it("his ability key braces it over 0.4 s, covering him from the floor to over his head, a metre across; again, it folds back over 0.3 s", async () => {
    const { sim, ctrl, pawn } = await hull();
    press(sim, ctrl, Btn.Ability);
    expect(pawn.state.braced).toBe(true);
    run(sim, ctrl, {}, brace.extendS / 2);
    expect(pawn.state.braceQ).toBeGreaterThan(0);
    expect(pawn.state.braceQ).toBeLessThan(65535);
    run(sim, ctrl, {}, brace.extendS / 2 + 0.05);
    expect(pawn.state.braceQ).toBe(65535);
    expect(platePose(k, pawn.state)).toEqual(k.plate);
    const r = reach(sim, pawn);
    const head = sim.data.movement.stance.stand.height;
    expect(r.bottom).toBeLessThan(0.05);
    expect(r.top).toBeGreaterThan(head);
    expect(r.width).toBeCloseTo(k.plate.widthM, 1);
    press(sim, ctrl, Btn.Ability);
    expect(pawn.state.braced).toBe(false);
    run(sim, ctrl, {}, brace.retractS + 0.03);
    expect(pawn.state.braceQ).toBe(0);
    expect(reach(sim, pawn).top).toBeLessThan(sim.data.movement.stance.stand.eye);
  });

  it("braced: no weapon (Fire does nothing), walk only, at 0.55 against his folded 0.75", async () => {
    const { sim, ctrl, pawn } = await hull();
    run(sim, ctrl, { forward: 1 }, 1.5);
    const folded = hspeed(pawn);
    run(sim, ctrl, {}, 1);
    press(sim, ctrl, Btn.Ability);
    run(sim, ctrl, {}, brace.extendS + 0.1);
    expect(shotsWith(sim, ctrl, Btn.Fire, 0.4)).toBe(0);
    run(sim, ctrl, { forward: 1, buttons: Btn.Sprint }, 1.5);
    expect(pawn.state.sprinting).toBe(false);
    expect(hspeed(pawn) / folded).toBeCloseTo(brace.speedMul / k.moveSpeedMult, 2);
  });

  it("whatever takes the plate down (a gadget out) unbraces it", async () => {
    const { sim, ctrl, pawn } = await hull();
    press(sim, ctrl, Btn.Ability);
    run(sim, ctrl, {}, brace.extendS + 0.1);
    press(sim, ctrl, Btn.Gadget);
    run(sim, ctrl, {}, 0.5);
    expect(pawn.state.hand).toBe(Hand.Gadget);
    expect([pawn.state.braced, pawn.state.braceQ]).toEqual([false, 0]);
  });

  it("a blast ahead: folded, it loses `absorb` of it and a strong one knocks the plate aside; braced, a tenth reaches him and it stays", async () => {
    const frag = data.gadgets.get("frag")!;
    const hurtBy = async (braced: boolean) => {
      const { sim, ctrl, pawn } = await hull();
      if (braced) {
        press(sim, ctrl, Btn.Ability);
        run(sim, ctrl, {}, brace.extendS + 0.1);
      }
      const g = sim.gadgets.add({ kind: kindOf("frag"), owner: 0, team: 1, pos: [0, 0.1, -1.6], yaw: 0, vel: [0, 0, 0], flags: GFlag.OnFloor, panel: -1, launchTick: 0, fuseEnd: 0, signalEnd: 0, readyAt: 0, offEnd: 0, seq: 0 });
      return blastEffects(sim, g, frag.blast!, g.pos).bodies.find((b) => b.pawn.id === pawn.id)!;
    };
    const [folded, braced] = [await hurtBy(false), await hurtBy(true)];
    expect(braced.damage).toBeLessThan(folded.damage);
    expect(braced.damage / folded.damage).toBeCloseTo(brace.blastThrough / (1 - k.absorb), 1);
    expect([folded.guard, braced.guard]).toEqual([true, false]);
  });
});

describe("a bot playing Hull (R3)", () => {
  const mode = data.modes.get("bot_training")!;
  if (!isFormat(mode)) throw new Error("bot_training");
  const bt: FormatMode = mode;

  it("braces its plate at an enemy in sight far off, stepping in behind it", async () => {
    const room = await Room.create("HULL", "millrace", { format: "bot_training", seed: 4 });
    const host = room.join("you", { send() {}, buffered: () => 0 })!;
    const send = (b: Uint8Array) => handleRoomMessage(room, host, b[0], new ByteReader(b.subarray(1)));
    const rules = { ...bt.match, swapEvery: 24, overtime: null, firstAttack: "orange", bots: { ...bt.match.bots!, size: [1, 5], site: "SITE_MILL" }, seconds: { ...bt.match.seconds, pick: 8, prep: 45, action: 180 } };
    send(encodeLobbyAction({ kind: "change", change: { kind: "rules", rules: { match: rules } } } as Parameters<typeof encodeLobbyAction>[0]));
    room.step();
    send(encodeLobbyAction({ kind: "start" }));
    room.step();
    const m = room.director!.match;
    const step = (done: () => boolean, seconds: number) => {
      for (let i = 0; i < seconds * TICK_HZ && !done(); i++) room.step();
      return done();
    };
    expect(step(() => m.phase === Phase.Planning, 5)).toBe(true);
    const ops = ["hull", "thermite", "striker", "sledge", "fuze"];
    const bots = [...m.players.values()].filter((p) => p.bot !== null);
    bots.forEach((p, i) => room.pickLoadout(p.id, botLoadout(data, ops[i])));
    expect(step(() => m.phase === Phase.Action, 60)).toBe(true);
    const hullBody = room.sim.pawns.get(room.bodyOf(bots[0].id)!.possessedPawnId)!;
    expect(hullBody.loadout?.shield?.brace).toBeDefined();
    // The person (defending) put in the open in front of him, 14 m off, where he sees him.
    const you = [...m.players.values()].find((p) => p.bot === null)!;
    const yourBody = room.sim.pawns.get(room.bodyOf(you.id)!.possessedPawnId)!;
    let braced = false;
    const ok = step(() => {
      const h = hullBody.state;
      if (room.sim.tick % 32 === 0 && !braced) {
        const [fx, fz] = [-Math.sin(h.yaw), -Math.cos(h.yaw)];
        const at: [number, number, number] = [h.x + fx * 14, h.y, h.z + fz * 14];
        if (sees(room.sim, [h.x, h.y + 1.6, h.z], [at[0], at[1] + 1.4, at[2]])) room.sim.teleport(yourBody.id, at[0], at[1] + 0.05, at[2], 0);
      }
      braced ||= h.braced && h.braceQ > 0;
      return braced;
    }, 90);
    expect(ok).toBe(true);
  }, 300000);
});

describe("Hull's brace as others see it (the review, R3)", () => {
  it("a rewound shot meets the braced plate: shot at his eye from 6 m, braced, he takes nothing", async () => {
    const s = await scene(["hull", "mute"], "destruction_lab");
    s.park();
    s.teleport(0, 0, 0, 12, 0);
    s.teleport(1, 0, 0, 6, 180);
    s.clients[0].cmd = { yaw: 0 };
    s.wait(10);
    s.press(0, Btn.Ability, { yaw: 0 });
    s.wait(60);
    const hull = s.body(0);
    expect([hull.state.braced, hull.state.braceQ]).toEqual([true, 65535]);
    const top = (hs: ReturnType<typeof pawnHitboxes>) => Math.max(...hs.filter((h) => h.part === "shield").flatMap((h) => [h.a[1] + h.radius, h.b[1] + h.radius])) - hull.state.y;
    const now = top(pawnHitboxes(s.sim.data.movement, s.sim.data.hitboxes, hull));
    expect(top(s.room.history.at(s.sim.tick - 4).get(hull.id)!)).toBeCloseTo(now, 2);
    const eye = eyePose(s.sim.data.movement, s.sim.data.hitboxes, hull.state).pos;
    const hp = hull.state.hp;
    s.shootAt(1, [eye[0], eye[1] + 0.02, eye[2]]);
    expect(s.body(0).state.hp).toBe(hp);
  });
});

describe("Hull knocked down braced (the review, R3)", () => {
  it("gets up with it folded: the knockdown took the plate down, and it doesn't come back braced", async () => {
    const { sim, ctrl, pawn } = await hull();
    press(sim, ctrl, Btn.Ability);
    run(sim, ctrl, {}, brace.extendS + 0.2);
    expect([pawn.state.braced, pawn.state.braceQ]).toEqual([true, 65535]);
    expect(sim.knockDown(pawn, [0, 1, -2])).toBe(true);
    for (let n = 0; pawn.state.mode === PawnMode.Knocked && n < TICK_HZ * 10; n++) sim.step(new Map([[ctrl.id, input({})]]));
    expect(pawn.state.mode).toBe(PawnMode.Walk);
    run(sim, ctrl, {}, 0.1);
    expect([pawn.state.braced, pawn.state.braceQ]).toEqual([false, 0]);
  });
});
