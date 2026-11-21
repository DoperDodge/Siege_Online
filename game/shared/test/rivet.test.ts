// Rivet's Stud Driver (Project Redmond R3, gadgets/R3_OPERATORS.md §2; Ulo's design: hard breaches in a circle, a
// vertical line and an X, each a hole a body gets through once it's set off). Fire lays a salvo of studs where the view
// meets a wall, a floor or a hatch, out to 25 m; the reload key picks which (the Ring, the Spine, the Cross). On a wall
// a salvo goes at the height that puts its hole's bottom a ledge over the floor (the Spine's from the floor). Up to three
// wait; his detonator sets them all off together, each cutting its shape through every layer, steel too. A Damper in
// reach of one keeps that one from going; a live Arc Pack burns one out; a bullet into one of its studs destroys it.
import { describe, expect, it } from "vitest";
import {
  Btn,
  ByteReader,
  decodePanelOps,
  encodePanelOps,
  GadgetAct,
  GFlag,
  Hand,
  holeBelow,
  kindOf,
  L_BACK,
  L_FRONT,
  L_STEEL,
  loadGameData,
  PawnMode,
  salvoCut,
  studBoxes,
  ticks,
  type Gadget,
  type Vec3,
} from "../src/index.js";
import { scene, type Scene } from "./interactions/harness.js";
import { botLoadout, encodeLobbyAction, handleRoomMessage, isFormat, Phase, Room, TICK_HZ, type FormatMode } from "../src/index.js";

const data = loadGameData();
const driver = data.gadgets.get("stud_driver")!;
const cycle = ticks(driver.use.kind === "launch" ? driver.use.cycleS : 0) + 2;
const RING = 0;
const SPINE = 1;
const CROSS = 2;
/** The plain soft wall's front face (toward +z): its middle across, and its face. */
const SOFT_X = -8;
const FACE = -5.9;
/** The reinforced wall's middle across (the same face). */
const STEEL_X = 11.5;

/** Rivet (client 0, attacking) and Lull (client 1, defending) on the Gadget Lab, out of the way. */
async function lab(ops = ["rivet", "lull"]) {
  const s = await scene(ops, "gadget_lab");
  s.park();
  return s;
}

const salvos = (s: Scene) => s.sim.gadgets.list.filter((g) => data.gadgets.get(kindName(g))?.salvo);
const kindName = (g: Gadget) => ["stud_ring", "stud_spine", "stud_cross"].find((k) => kindOf(k) === g.kind) ?? "";

/**
 * Rivet's driver out (Z), its salvo `pattern` picked with the reload key, and Fire pressed looking at `at` from where he
 * stands: the salvo it laid, or undefined.
 */
function lay(s: Scene, at: Vec3, pattern = RING): Gadget | undefined {
  const aim = s.aimAt(0, at);
  if (s.body(0).state.hand !== Hand.Ability) s.handOut(0, Hand.Ability, aim);
  for (let k = 0; k < 3 && s.body(0).state.pattern !== pattern; k++) s.press(0, Btn.Reload, aim);
  expect(s.body(0).state.pattern).toBe(pattern);
  if (s.body(0).state.gAct === GadgetAct.Shoot) s.wait(cycle);
  const before = new Set(s.sim.gadgets.list.map((g) => g.id));
  s.press(0, Btn.Fire, aim);
  s.wait(2);
  return s.sim.gadgets.list.find((g) => !before.has(g.id));
}

/** Where the panel `id`'s front face is cut through (front and back skins) at (x, y). */
const open = (s: Scene, id: string, x: number, y: number) => !s.solidAt(id, L_FRONT, [x, y, FACE]) && !s.solidAt(id, L_BACK, [x, y, FACE - 0.2]);

/** A body (client i) put in front of the wall at x, facing it, the vault key pressed: whether it ended up past the wall. */
function vaultsThrough(s: Scene, i: number, x: number): boolean {
  s.teleport(i, x, 0, FACE + 0.75, 0);
  s.wait(8);
  if (!s.sim.probeVault(x, 0, FACE + 0.75, 0)) return false;
  s.press(i, Btn.Vault);
  s.wait(96);
  return s.body(i).state.z < FACE - 0.4 && s.body(i).state.mode === PawnMode.Walk;
}

describe("Rivet and his Stud Driver (R3)", () => {
  it("is an attacker, 2 / 2, with three salvos in slot 2 that lay a Ring, a Spine or a Cross", async () => {
    const op = data.operators.get("rivet")!;
    expect([op.name, op.side, op.healthRating, op.speedRating, op.ability.id, op.ability.name]).toEqual(["Rivet", "attacker", 2, 2, "stud_driver", "Stud Driver"]);
    expect(driver.driver!.lays).toEqual(["stud_ring", "stud_spine", "stud_cross"]);
    for (const id of driver.driver!.lays) {
      const g = data.gadgets.get(id)!;
      const ex = salvoCut(data, g)!;
      expect([g.remote, g.operator, ex.hard, ex.studs], id).toEqual([true, "rivet", true, true]);
    }
    const s = await lab();
    expect([s.body(0).state.g2, s.body(0).state.pattern]).toEqual([3, 0]);
  });

  it("the reload key picks the next salvo while the driver's out; Fire lays it where he aims, from across the room", async () => {
    const s = await lab();
    s.teleport(0, SOFT_X, 0, 4.5, 0);
    const ring = lay(s, [SOFT_X, 1.4, FACE], RING)!;
    expect(kindName(ring)).toBe("stud_ring");
    expect(ring.panel).toBe(s.panel("soft_plain").panel.spec.index);
    expect([ring.pos[0], ring.pos[2]]).toEqual([expect.closeTo(SOFT_X, 1), expect.closeTo(FACE + 0.025, 2)]);
    // Laid, the driver stays out for the next (it can go a cycle later); the pick goes round.
    expect([s.body(0).state.hand, s.body(0).state.g2, s.body(0).state.w2]).toEqual([Hand.Ability, 2, 1]);
    const aim = s.aimAt(0, [SOFT_X, 1.4, FACE]);
    for (const want of [SPINE, CROSS, RING]) {
      s.press(0, Btn.Reload, aim);
      expect(s.body(0).state.pattern).toBe(want);
    }
    // Out of reach (25 m), or at the hard floor: nothing laid, nothing spent.
    s.teleport(0, SOFT_X, 0, 24, 0);
    expect(lay(s, [SOFT_X, 1.4, FACE], SPINE)).toBeUndefined();
    expect(lay(s, [SOFT_X, 0, 20], SPINE)).toBeUndefined();
    expect(s.body(0).state.g2).toBe(2);
  });

  it("on a wall a salvo's hole bottom goes a ledge over the floor wherever up the wall he aims (the Spine's from the floor)", async () => {
    for (const [pattern, aimY] of [[RING, 2.5], [RING, 0.5], [SPINE, 2.6], [CROSS, 0.4]] as const) {
      const s = await lab();
      s.teleport(0, SOFT_X, 0, 0, 0);
      const g = lay(s, [SOFT_X, aimY, FACE], pattern)!;
      const d = data.gadgets.get(kindName(g))!;
      const ex = salvoCut(data, d)!;
      const bottom = g.pos[1] - holeBelow(ex);
      if (d.salvo!.ledgeM > 0) expect(bottom, `${d.id} aimed at ${aimY}`).toBeCloseTo(d.salvo!.ledgeM, 2);
      else expect(bottom, `${d.id} aimed at ${aimY}`).toBeLessThan(0);
    }
  });

  it("his detonator sets off every salvo together, each cutting its own shape: a circle, a slot up from the floor, an X", async () => {
    const s = await lab(["rivet", "lull"]);
    s.teleport(0, -8, 0, 4, 0);
    const ring = lay(s, [-12, 1.4, FACE], RING)!;
    const spine = lay(s, [-8, 1.4, FACE], SPINE)!;
    const cross = lay(s, [-4, 1.4, FACE], CROSS)!;
    expect([ring, spine, cross].map(kindName)).toEqual(["stud_ring", "stud_spine", "stud_cross"]);
    // All three out, the driver's last: the detonator's in hand.
    expect([s.body(0).state.hand, s.body(0).state.g2, s.body(0).state.w2]).toEqual([Hand.AbilityDetonator, 0, 3]);
    s.teleport(0, -8, 0, 6, 0);
    s.press(0, Btn.Fire);
    s.wait(4);
    expect(salvos(s)).toEqual([]);
    expect(s.body(0).state.w2).toBe(0);
    // The Ring: a round hole, its bottom a ledge over the floor.
    const rc = ring.pos[1];
    expect(open(s, "soft_studs", -12, rc)).toBe(true);
    expect(open(s, "soft_studs", -12 + 0.55, rc)).toBe(true);
    expect(open(s, "soft_studs", -12, rc - 0.65)).toBe(true);
    expect(s.solidAt("soft_studs", L_FRONT, [-12, 0.3, FACE])).toBe(true);
    expect(s.solidAt("soft_studs", L_FRONT, [-12 + 0.62, rc + 0.62, FACE])).toBe(true);
    // The Spine: a slot from the floor up, narrow.
    expect(open(s, "soft_plain", -8, 0.03)).toBe(true);
    expect(open(s, "soft_plain", -8, 1.85)).toBe(true);
    expect(s.solidAt("soft_plain", L_FRONT, [-8 + 0.5, 1.0, FACE])).toBe(true);
    expect(s.solidAt("soft_plain", L_FRONT, [-8, 2.2, FACE])).toBe(true);
    // The Cross: its middle and its arms' ends; between its arms, the wall.
    const cc = cross.pos[1];
    expect(open(s, "semi", -4, cc)).toBe(true);
    for (const [dx, dy] of [[0.75, 0.75], [-0.75, 0.75], [0.75, -0.75], [-0.75, -0.75]]) expect(open(s, "semi", -4 + dx, cc + dy), `arm ${dx},${dy}`).toBe(true);
    for (const [dx, dy] of [[0.85, 0], [-0.85, 0], [0, 0.85]]) expect(s.solidAt("semi", L_FRONT, [-4 + dx, cc + dy, FACE]), `between ${dx},${dy}`).toBe(true);
  });

  it("every hole is one a body gets through: it vaults through the Ring and the Cross, and walks through the Spine", async () => {
    for (const pattern of [RING, CROSS]) {
      const s = await lab(["rivet", "cleave"]);
      s.teleport(0, SOFT_X, 0, 2, 0);
      lay(s, [SOFT_X, 1.4, FACE], pattern);
      // (Before it's set off, the wall's whole: no way through.)
      expect(vaultsThrough(s, 1, SOFT_X), `pattern ${pattern}, not set off`).toBe(false);
      s.teleport(1, 0, 0, 10);
      s.detonate(0);
      s.wait(4);
      expect(vaultsThrough(s, 1, SOFT_X), `pattern ${pattern}`).toBe(true);
      // A little off its middle, too.
      s.teleport(1, 0, 0, 10);
      expect(vaultsThrough(s, 1, SOFT_X + 0.15), `pattern ${pattern}, off its middle`).toBe(true);
    }
    const s = await lab(["rivet", "cleave"]);
    s.teleport(0, SOFT_X, 0, 2, 0);
    lay(s, [SOFT_X, 1.4, FACE], SPINE);
    s.detonate(0);
    s.wait(4);
    // (No vault: it's a slot from the floor.)
    expect(s.sim.probeVault(SOFT_X, 0, FACE + 0.75, 0)).toBeNull();
    s.teleport(1, SOFT_X, 0, FACE + 1.2, 0);
    s.clients[1].cmd = { yaw: 0, pitch: 0, forward: 1 };
    s.wait(150);
    s.clients[1].cmd = {};
    expect(s.body(1).state.z).toBeLessThan(FACE - 0.5);
  });

  it("it cuts reinforced steel too", async () => {
    const s = await lab();
    s.teleport(0, STEEL_X, 0, 3, 0);
    const g = lay(s, [STEEL_X, 1.4, FACE], RING)!;
    expect(g.panel).toBe(s.panel("reinforced").panel.spec.index);
    s.detonate(0);
    s.wait(4);
    expect(s.solidAt("reinforced", L_STEEL, [STEEL_X, g.pos[1], -6])).toBe(false);
    expect(s.solidAt("reinforced", L_STEEL, [STEEL_X, 0.2, -6])).toBe(true);
  });

  it("on a hatch from above it lies flat, and its blast takes the hatch whole", async () => {
    const s = await lab();
    s.teleport(0, 10, 3.0, 9.6, 180);
    const g = lay(s, [10, 3.0, 8], SPINE)!;
    expect(g.flags & GFlag.Flat).toBeTruthy();
    expect(g.panel).toBe(s.panel("hatch").panel.spec.index);
    s.teleport(0, 7, 3.0, 11);
    s.detonate(0);
    s.wait(4);
    expect(s.panel("hatch").panel.broken).toBe(true);
  });

  it("no more than three wait at once; a Damper in reach of one keeps it from going (it waits), the others go", async () => {
    const s = await lab();
    s.teleport(0, -8, 0, 4, 0);
    lay(s, [-12, 1.4, FACE], RING);
    const jammed = lay(s, [-8, 1.4, FACE], RING)!;
    lay(s, [-4, 1.4, FACE], RING);
    expect(s.body(0).state.g2).toBe(0);
    s.put("damper", 1, [-8, data.gadgets.get("damper")!.sizeM[1] / 2, FACE + 1.0]);
    s.teleport(0, -8, 0, 8, 0);
    s.press(0, Btn.Fire);
    s.wait(4);
    expect(salvos(s).map((g) => g.id)).toEqual([jammed.id]);
    expect([s.body(0).state.hand, s.body(0).state.w2]).toEqual([Hand.AbilityDetonator, 1]);
    // Pressed again, still jammed: nothing.
    s.press(0, Btn.Fire);
    s.wait(4);
    expect(salvos(s).map((g) => g.id)).toEqual([jammed.id]);
  });

  it("a live Arc Pack by the reinforced wall burns out a salvo on it", async () => {
    const s = await lab(["rivet", "shunt"]);
    s.teleport(1, STEEL_X, 0, -4.7);
    expect(s.plant(1, [STEEL_X, 0, -5.72])).toBeDefined();
    s.teleport(1, 25, 0, 25);
    s.teleport(0, STEEL_X, 0, 3, 0);
    const g = lay(s, [STEEL_X, 1.4, FACE], CROSS)!;
    s.wait(ticks(data.gadgets.get("arc_pack")!.arc!.burnS) + 4);
    expect(s.sim.gadgets.get(g.id)).toBeUndefined();
    expect(s.body(0).state.w2).toBe(0);
  });

  it("a bullet into one of its studs destroys a salvo; one through the Ring's empty middle doesn't", async () => {
    const s = await lab(["rivet", "lull"]);
    s.teleport(0, SOFT_X, 0, 4, 0);
    const g = lay(s, [SOFT_X, 1.4, FACE], RING)!;
    s.teleport(0, 25, 0, 25);
    s.teleport(1, SOFT_X + 0.4, 0, 1.5, 0);
    s.shootAt(1, [SOFT_X + 0.25, g.pos[1] + 0.1, FACE]);
    expect(s.sim.gadgets.get(g.id)).toBeDefined();
    const stud = studBoxes(data, g)![0].pos;
    s.shootAt(1, stud);
    expect(s.sim.gadgets.get(g.id)).toBeUndefined();
    // His detonator's told: none of it waits now.
    expect(s.body(0).state.w2).toBe(0);
  });

  it("a Cross's arms go on the wire as thick segments, and come off it the same", () => {
    const ops = [{ panel: 3, op: { kind: "cut" as const, layer: 1, shape: { kind: "line" as const, u4a: -12, v4a: 40, u4b: 88, v4b: 140, r4: 24 }, hard: true } }];
    const r = new ByteReader(encodePanelOps({ tick: 7, ops, hash: 99 }));
    r.u8();
    expect(decodePanelOps(r, 10)).toEqual({ tick: 7, ops, hash: 99 });
  });
});

describe("a bot playing Rivet (R3)", () => {
  const mode = data.modes.get("bot_training")!;
  if (!isFormat(mode)) throw new Error("bot_training");
  const bt: FormatMode = mode;

  it("lays a Spine on the Mill's first hard breach wall from the Warping side and sets it off from cover: a slot through it", async () => {
    const room = await Room.create("RIVET", "millrace", { format: "bot_training", seed: 4 });
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
    const ops = ["rivet", "cleave", "pointman", "patch", "ohm"];
    const bots = [...m.players.values()].filter((p) => p.bot !== null);
    bots.forEach((p, k) => room.pickLoadout(p.id, botLoadout(data, ops[k])));
    expect(step(() => m.phase === Phase.Action, 60)).toBe(true);
    // The person (defending alone) out of the way: in the Coal Store, in the basement at the other end.
    const you = [...m.players.values()].find((p) => p.bot === null)!;
    room.sim.teleport(room.bodyOf(you.id)!.possessedPawnId, 11, -3.2, 35.5, 0);
    const wall = room.sim.level.panels.byId.get("SW-1F-01")!;
    const cells = () => wall.panel.layers[L_FRONT]!.reduce((n, c) => n + (c ? 1 : 0), 0);
    const whole = cells();
    const rivet = room.sim.pawns.get(room.bodyOf(bots[0].id)!.possessedPawnId)!;
    let laid = false;
    const ok = step(() => {
      laid ||= room.sim.gadgets.list.some((g) => g.kind === kindOf("stud_spine") && g.panel === wall.panel.spec.index);
      return laid && cells() < whole;
    }, 120);
    const jobs = room.attackPlan!.jobList().filter((j) => j.by === bots[0].id);
    expect(ok, `${JSON.stringify(jobs)} rivet g2 ${rivet.state.g2} w2 ${rivet.state.w2} laid ${laid}`).toBe(true);
    // A slot 0.8 m wide from the floor up: some 16 cells across by 38 up, in its skin.
    expect(whole - cells()).toBeGreaterThan(400);
  }, 300000);
});

describe("Rivet's driver can't be hurried (the review, R3)", () => {
  it("to its detonator and back doesn't lay the next salvo before its cycle is up", async () => {
    const s = await lab();
    s.teleport(0, SOFT_X, 0, FACE + 3, 0);
    expect(lay(s, [SOFT_X - 0.8, 1.2, FACE])).toBeDefined();
    const aim = s.aimAt(0, [SOFT_X + 0.8, 1.2, FACE]);
    const t0 = s.sim.tick;
    s.press(0, Btn.Ability, aim); // its detonator
    s.press(0, Btn.Ability, aim); // the driver again
    s.wait(ticks(data.gadgetRules.equipS) + 2);
    expect(s.body(0).state.hand).toBe(Hand.Ability);
    expect(s.sim.tick - t0).toBeLessThan(cycle - 4);
    const before = salvos(s).length;
    s.press(0, Btn.Fire, aim);
    s.wait(2);
    expect(salvos(s).length).toBe(before);
  });
});
