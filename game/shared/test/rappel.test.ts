// Rappel (Phase 5 M8, research/core_mechanics.md §6): hooking on at a face's foot or a roof edge, moving on the
// rope, its ends, climbing in through a window, upside down, who may, and the state on the wire.
import { describe, expect, it } from "vitest";
import {
  applyDamage,
  Btn,
  ByteReader,
  ByteWriter,
  ClientSession,
  decodeInput,
  decodeLabTool,
  DT,
  encodeLabTool,
  eyePose,
  findRappel,
  hashPawnState,
  movementPrompt,
  Msg,
  PAWN_STATE_BYTES,
  PawnMode,
  planBreach,
  poseHitboxes,
  RappelFlag,
  readPawnState,
  ropeAt,
  Room,
  Sim,
  Stance,
  ticks,
  writePawnState,
  type InputCmd,
  type PlayerController,
} from "../src/index.js";
import { run, settle } from "./helpers.js";

/** The Big Tower's north face: one rope from the ground to the Cat Walk's top (9.2 m). */
const TOWER = { x: 40.15, z: 7.3, yawDeg: 180 } as const;

async function oregon(op = "sledge") {
  const sim = await Sim.create("oregon");
  const ctrl = sim.addPlayer("roper", op);
  const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
  return { sim, ctrl, pawn };
}

/** Stand at (x, y, z) facing yawDeg and settle. */
function stand(sim: Sim, ctrl: PlayerController, x: number, y: number, z: number, yawDeg: number) {
  sim.teleport(ctrl.possessedPawnId, x, y, z, yawDeg, Stance.Stand);
  settle(sim, ctrl, 0.3);
  run(sim, ctrl, { yawDeg }, 0.2);
}

/**
 * The rappel breach events of the step just run, applied to the panels as the room applies them (Room.completeBreach):
 * through, the glass and barricades break; bounced back, the glass breaks and each barricade takes the kick.
 */
function applyBreaches(sim: Sim, log: { panels: number[]; through: boolean }[] = []) {
  const kick = sim.data.destruction.barricade.rappelKickDamage;
  for (const e of sim.events) {
    if (e.kind !== "rappelBreach") continue;
    log.push({ panels: e.panels, through: e.through });
    for (const i of e.panels) {
      const p = sim.level.panels.list[i].panel;
      sim.level.panels.apply(i, { kind: "damage", amount: e.through || p.kind === "glass" ? Math.max(1, p.hp) : kick, hard: false });
    }
  }
  return log;
}

/** Hold Interact long enough to hook on (and a tick more). */
const hookOn = (sim: Sim, ctrl: PlayerController, yawDeg: number, stance = Stance.Stand) =>
  run(sim, ctrl, { yawDeg, buttons: Btn.Interact, stance }, sim.data.movement.rappel.holdSeconds + 2 / 64);

describe("rappel faces (D-105's zones)", () => {
  it("a tower's storeys hang one rope; a face over a roof starts at the roof", async () => {
    const { sim } = await oregon();
    const faces = sim.level.rappel;
    expect(faces).toHaveLength(55);
    const north = faces.findIndex((f) => f.id === "rappel:1F:N01");
    expect(ropeAt(faces, north, TOWER.x, TOWER.z, 1)).toEqual([0, expect.closeTo(9.2, 5)]);
    // The Kids' Dorms' north wall stands on the Meeting roof (3.2 m).
    const kids = faces.findIndex((f) => f.id === "rappel:2F:N03");
    expect(ropeAt(faces, kids, 28, 23.65, 4)?.map((v) => +v.toFixed(2))).toEqual([3.2, 6.2]);
    expect(ropeAt(faces, kids, 28, 23.65, 1)).toBeNull();
  });
});

describe("hooking on", () => {
  it("at a face's foot, facing it: holding Interact for holdSeconds hooks on, right side up; letting go early doesn't", async () => {
    const { sim, ctrl, pawn } = await oregon();
    stand(sim, ctrl, TOWER.x, 0, TOWER.z - 0.6, TOWER.yawDeg);
    expect(findRappel((sim as any).ctx, pawn)?.top).toBe(false);
    // Half the hold, then let go: nothing.
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Interact }, sim.data.movement.rappel.holdSeconds / 2);
    expect([pawn.state.mode, pawn.state.rappelTicks]).toEqual([PawnMode.Walk, expect.any(Number)]);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, 0.1);
    expect([pawn.state.mode, pawn.state.rappelTicks, pawn.state.rappel]).toEqual([PawnMode.Walk, 0, -1]);
    hookOn(sim, ctrl, TOWER.yawDeg);
    expect(pawn.state.mode).toBe(PawnMode.Rappel);
    expect(pawn.state.rappelFlags & RappelFlag.Inverted).toBe(0);
    // On the rope's line: the body's capsule a wallGap off the wall.
    const m = sim.data.movement;
    expect(TOWER.z - pawn.state.z).toBeCloseTo(m.stance.collisionRadius + m.rappel.wallGap, 3);
  });

  it("at a barricaded door in a wall (lab rooms give both sides both tools): an attacker gets the rope, a defender the barricade", async () => {
    // The 1F south wall at x 3.8 (rappel:1F:S02), the 1F.o005 barricade in view.
    for (const [op, prompt] of [
      ["sledge", "rappel"],
      ["mute", "unbarricade"],
    ] as const) {
      const { sim, ctrl } = await oregon(op);
      sim.deployRules = { anyone: true, rappel: true, pools: [10, 10] };
      stand(sim, ctrl, 3.775, 0, 39.1, 0);
      expect(sim.prompt(ctrl.id), op).toBe(prompt);
      run(sim, ctrl, { yawDeg: 0, buttons: Btn.Interact }, 2 / 64);
      const s = sim.pawns.get(ctrl.possessedPawnId)!.state;
      expect([s.rappelTicks > 0, s.deployKind !== 0], op).toEqual([op === "sledge", op === "mute"]);
    }
  });

  it("a tick without the player's input (a stall) leaves the hold as it is: it goes on when F comes back, still held", async () => {
    const { sim, ctrl, pawn } = await oregon();
    stand(sim, ctrl, TOWER.x, 0, TOWER.z - 0.6, TOWER.yawDeg);
    const hold = ticks(sim.data.movement.rappel.holdSeconds);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Interact }, 10 / 64);
    expect(pawn.state.rappelTicks).toBe(10);
    for (let i = 0; i < 6; i++) sim.step(new Map()); // no input from its player
    expect([pawn.state.mode, pawn.state.rappelTicks]).toEqual([PawnMode.Walk, 10]);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Interact }, (hold - 10) / 64);
    expect(pawn.state.mode).toBe(PawnMode.Rappel);
  });

  it("not facing the wall, too far from it, or a defender outside a lab room: no rope offered", async () => {
    const { sim, ctrl, pawn } = await oregon();
    stand(sim, ctrl, TOWER.x, 0, TOWER.z - 0.6, 0); // back to the wall
    expect(findRappel((sim as any).ctx, pawn)).toBeNull();
    stand(sim, ctrl, TOWER.x, 0, TOWER.z - 1.5, TOWER.yawDeg); // a metre too far
    expect(findRappel((sim as any).ctx, pawn)).toBeNull();
    const d = await oregon("mute");
    stand(d.sim, d.ctrl, TOWER.x, 0, TOWER.z - 0.6, TOWER.yawDeg);
    expect(findRappel((d.sim as any).ctx, d.pawn)).toBeNull();
    d.sim.deployRules.rappel = true; // a lab room's rules
    expect(findRappel((d.sim as any).ctx, d.pawn)).not.toBeNull();
  });

  it("at a roof edge facing out over it: hooks on upside down under the edge, the eye at the bottom of the body", async () => {
    const { sim, ctrl, pawn } = await oregon();
    // On the Kids roof (6.2 m), at its north edge over the Kids' Dorms' wall.
    stand(sim, ctrl, 28, 6.2, 24.0, 0);
    expect(findRappel((sim as any).ctx, pawn)?.top).toBe(true);
    hookOn(sim, ctrl, 0);
    const s = pawn.state;
    expect([s.mode, s.rappelFlags & RappelFlag.Inverted]).toEqual([PawnMode.Rappel, RappelFlag.Inverted]);
    expect(s.y + sim.data.movement.stance.stand.height).toBeLessThanOrEqual(6.2);
    const eye = eyePose(sim.data.movement, sim.data.hitboxes, s);
    expect(eye.pos[1] - s.y).toBeLessThan(0.3);
    expect(eye.roll).toBeCloseTo(Math.PI, 5);
    const head = poseHitboxes(sim.data.movement, sim.data.hitboxes, s).find((h) => h.part === "head")!;
    const legs = poseHitboxes(sim.data.movement, sim.data.hitboxes, s).filter((h) => h.part.startsWith("leg"));
    expect(head.a[1]).toBeLessThan(Math.min(...legs.flatMap((l) => [l.a[1], l.b[1]])));
    // The stance key turns it right side up, and back.
    run(sim, ctrl, { yawDeg: 0, stance: Stance.Crouch }, 0.1);
    expect(s.rappelFlags & RappelFlag.Inverted).toBe(0);
    run(sim, ctrl, { yawDeg: 0, stance: Stance.Stand }, 0.1);
    expect(s.rappelFlags & RappelFlag.Inverted).toBe(RappelFlag.Inverted);
  });
});

describe("on the rope", () => {
  async function onTower() {
    const o = await oregon();
    stand(o.sim, o.ctrl, TOWER.x, 0, TOWER.z - 0.6, TOWER.yawDeg);
    hookOn(o.sim, o.ctrl, TOWER.yawDeg);
    expect(o.pawn.state.mode).toBe(PawnMode.Rappel);
    return o;
  }

  it("W climbs at climbSpeed, S descends at descendSpeed, A and D move along the wall at strafeSpeed", async () => {
    const { sim, ctrl, pawn } = await onTower();
    const R = sim.data.movement.rappel;
    const y0 = pawn.state.y;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, forward: 1 }, 1);
    expect(pawn.state.y - y0).toBeCloseTo(R.climbSpeed, 1);
    const y1 = pawn.state.y;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, forward: -1 }, 0.25);
    expect(y1 - pawn.state.y).toBeCloseTo(R.descendSpeed * 0.25, 1);
    // Facing the wall (south), D (right as seen) moves west along it.
    const x0 = pawn.state.x;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, strafe: 1 }, 0.5);
    expect(x0 - pawn.state.x).toBeCloseTo(R.strafeSpeed * 0.5, 1);
    const x1 = pawn.state.x;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, strafe: -1, buttons: Btn.Sprint }, 0.5);
    expect(pawn.state.x - x1).toBeCloseTo(R.sprintStrafeSpeed * 0.5, 1);
    expect(pawn.state.mode).toBe(PawnMode.Rappel);
  });

  it("stops at the face's ends, lands on the floor at the bottom, and Interact lets go", async () => {
    const { sim, ctrl, pawn } = await onTower();
    // East along the wall (A, facing it) to its end, 0.3 m in from the tower's corner.
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, strafe: -1 }, 5);
    expect(pawn.state.mode).toBe(PawnMode.Rappel);
    expect(pawn.state.x).toBeLessThanOrEqual(44.4 + 1e-3);
    // Down: off the rope onto the ground.
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, forward: 1 }, 1);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, forward: -1 }, 2);
    expect([pawn.state.mode, pawn.state.rappel]).toEqual([PawnMode.Walk, -1]);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, 0.3);
    expect([pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([true, 0]);
    // Back on and up two metres: Interact lets go, and the body falls.
    hookOn(sim, ctrl, TOWER.yawDeg);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, forward: 1 }, 1.4);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Interact }, 1 / 64);
    expect(pawn.state.mode).toBe(PawnMode.Walk);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, 1.5);
    expect([pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([true, 0]);
  });

  /** Along to the Big Tower's 2F north window (2F.o006, x 41.65–42.95, sill 4.1 m), the feet 0.7 m under the sill. */
  async function atTowerWindow() {
    const o = await onTower();
    const { sim, ctrl, pawn } = o;
    const target = 42.3;
    for (let t = 0; t < 400 && Math.abs(pawn.state.x - target) > 0.05; t++) run(sim, ctrl, { yawDeg: TOWER.yawDeg, strafe: pawn.state.x < target ? -0.5 : 0.5 }, 1 / 64);
    for (let t = 0; t < 400 && pawn.state.y < 3.4; t++) run(sim, ctrl, { yawDeg: TOWER.yawDeg, forward: 0.5 }, 1 / 64);
    expect(pawn.state.mode).toBe(PawnMode.Rappel);
    const panel = (id: string) => sim.level.panels.byId.get(`2F.o006.${id}`)!.panel;
    return { ...o, panel };
  }

  it("climbs in through an open window (Space): a vault from the rope", async () => {
    const { sim, ctrl, pawn, panel } = await atTowerWindow();
    sim.level.panels.apply(panel("bar").spec.index, { kind: "barricade", up: false });
    sim.level.panels.apply(panel("glass").spec.index, { kind: "damage", amount: 1, hard: false });
    expect(movementPrompt((sim as any).ctx, pawn)).toBe("rappelIn");
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Vault }, 1 / 64);
    expect([pawn.state.mode, pawn.state.rappelTicks]).toEqual([PawnMode.Vault, 0]); // straight in, no swing
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, 1.5);
    expect([pawn.state.mode, pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([PawnMode.Walk, true, 3.2]);
    expect(pawn.state.z).toBeGreaterThan(TOWER.z + 0.3); // inside the 2F Tower
  });

  it("rappel breach: Space at the glass and barricade swings in; a fresh barricade bounces the body back with a kick, a worn one gives way", async () => {
    const { sim, ctrl, pawn, panel } = await atTowerWindow();
    const ctx = (sim as any).ctx;
    const [bar, glass] = [panel("bar"), panel("glass")];
    expect(movementPrompt(ctx, pawn)).toBe("rappelBreach");
    expect(planBreach(ctx, pawn)).toMatchObject({ panels: [bar.spec.index, glass.spec.index].sort((a, b) => a - b), through: false });
    const B = sim.data.destruction.barricade;
    const swing = ticks(sim.data.movement.rappel.breachSeconds);
    /** Step one tick with `cmd`, the breach events it made applied as the room applies them. */
    const breaches: { panels: number[]; through: boolean }[] = [];
    const step = (cmd: Parameters<typeof run>[2]) => {
      run(sim, ctrl, cmd, 1 / 64);
      applyBreaches(sim, breaches);
    };
    // The swing: nothing moves while it lasts (W, the stance key), and the hands are busy.
    const at = [pawn.state.x, pawn.state.y, pawn.state.z];
    step({ yawDeg: TOWER.yawDeg, buttons: Btn.Vault });
    expect(pawn.state.rappelTicks).toBe(1);
    expect(movementPrompt(ctx, pawn)).toBeNull();
    for (let t = 1; t < swing - 1; t++) step({ yawDeg: TOWER.yawDeg, forward: 1, stance: Stance.Crouch, buttons: Btn.Ads });
    expect([pawn.state.x, pawn.state.y, pawn.state.z]).toEqual(at);
    expect([pawn.state.mode, pawn.state.rappelFlags & RappelFlag.Inverted, pawn.state.adsQ]).toEqual([PawnMode.Rappel, 0, 0]);
    expect(breaches).toHaveLength(0);
    // Its end: bounced back, the glass broken and the barricade kicked.
    step({ yawDeg: TOWER.yawDeg, stance: Stance.Crouch });
    step({ yawDeg: TOWER.yawDeg, stance: Stance.Crouch });
    expect(breaches).toEqual([{ panels: [bar.spec.index, glass.spec.index].sort((a, b) => a - b), through: false }]);
    expect([pawn.state.mode, pawn.state.rappelTicks, pawn.state.rappelFlags & RappelFlag.Inverted]).toEqual([PawnMode.Rappel, 0, 0]);
    expect([pawn.state.x, pawn.state.y, pawn.state.z]).toEqual(at);
    expect([glass.broken, bar.broken, bar.hp]).toEqual([true, false, B.hp - B.rappelKickDamage]);
    // Worn to rappelThroughHp: the next swing goes through, breaking the barricade, into the 2F Tower.
    expect(planBreach(ctx, pawn)).toMatchObject({ panels: [bar.spec.index], through: true });
    step({ yawDeg: TOWER.yawDeg, stance: Stance.Crouch, buttons: Btn.Vault });
    for (let t = 1; t < swing; t++) step({ yawDeg: TOWER.yawDeg, stance: Stance.Crouch });
    expect(breaches[1]).toEqual({ panels: [bar.spec.index], through: true });
    expect([pawn.state.mode, bar.broken]).toEqual([PawnMode.Vault, true]);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, stance: Stance.Crouch }, 1.5);
    expect([pawn.state.mode, pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([PawnMode.Walk, true, 3.2]);
    expect(pawn.state.z).toBeGreaterThan(TOWER.z + 0.3);
  });

  it("into a Dorms window from the roof (M8's done-when): hooked on upside down at the Kids' Dorms' roof edge, turned to the wall and over, down to the window, two swings in", async () => {
    const { sim, ctrl, pawn } = await oregon();
    const bar = sim.level.panels.byId.get("2F.o004.bar")!.panel;
    const glass = sim.level.panels.byId.get("2F.o004.glass")!.panel;
    stand(sim, ctrl, 27.875, 6.3, 24.04, 0);
    expect(movementPrompt((sim as any).ctx, pawn)).toBe("rappel");
    hookOn(sim, ctrl, 0);
    expect([pawn.state.mode, pawn.state.rappelFlags & RappelFlag.Inverted]).toEqual([PawnMode.Rappel, RappelFlag.Inverted]);
    // Face the wall (south) and turn right side up (the crouch key, kept down), then down to the window.
    const held = { yawDeg: 180, stance: Stance.Crouch };
    run(sim, ctrl, held, 2 / 64);
    expect(pawn.state.rappelFlags & RappelFlag.Inverted).toBe(0);
    for (let t = 0; t < 200 && pawn.state.y > 3.55; t++) run(sim, ctrl, { ...held, forward: -1 }, 1 / 64);
    run(sim, ctrl, held, 2 / 64);
    expect([pawn.state.mode, movementPrompt((sim as any).ctx, pawn)]).toEqual([PawnMode.Rappel, "rappelBreach"]);
    const swing = ticks(sim.data.movement.rappel.breachSeconds);
    const log: { panels: number[]; through: boolean }[] = [];
    for (let k = 0; k < 2; k++) {
      run(sim, ctrl, { ...held, buttons: Btn.Vault }, 1 / 64);
      for (let t = 1; t < swing + 1; t++) {
        run(sim, ctrl, held, 1 / 64);
        applyBreaches(sim, log);
      }
    }
    expect(log.map((e) => e.through)).toEqual([false, true]);
    expect([glass.broken, bar.broken]).toEqual([true, true]);
    run(sim, ctrl, held, 1.5);
    expect([pawn.state.mode, pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([PawnMode.Walk, true, 3.2]);
    expect(pawn.state.z).toBeGreaterThan(23.95); // in the Kids' Dorms (z 23.95–30.45)
  });

  it("into the Dorms' big window from the Dining roof: hooked on at the wall's foot, two swings into the Dorms Main Hall", async () => {
    const { sim, ctrl, pawn } = await oregon();
    const bar = sim.level.panels.byId.get("2F.o021.bar")!.panel;
    stand(sim, ctrl, 19.75, 3.6, 31.9, -90); // on the Dining roof, facing the Dorms Main Hall's west wall
    expect([pawn.state.grounded, sim.prompt(ctrl.id)]).toEqual([true, "rappel"]);
    hookOn(sim, ctrl, -90);
    expect([pawn.state.mode, movementPrompt((sim as any).ctx, pawn)]).toEqual([PawnMode.Rappel, "rappelBreach"]);
    const swing = ticks(sim.data.movement.rappel.breachSeconds);
    const log: { panels: number[]; through: boolean }[] = [];
    for (let k = 0; k < 2; k++) {
      run(sim, ctrl, { yawDeg: -90, buttons: Btn.Vault }, 1 / 64);
      for (let t = 1; t < swing + 1; t++) {
        run(sim, ctrl, { yawDeg: -90 }, 1 / 64);
        applyBreaches(sim, log);
      }
    }
    expect([log.map((e) => e.through), bar.broken]).toEqual([[false, true], true]);
    run(sim, ctrl, { yawDeg: -90 }, 1.5);
    expect([pawn.state.mode, pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([PawnMode.Walk, true, 3.2]);
    expect(pawn.state.x).toBeGreaterThan(20.5); // in the Dorms Main Hall (x 20.5–30)
  });

  it("a swing waits through a stall, and the stance key held through it doesn't turn the body over", async () => {
    const { sim, ctrl, pawn } = await atTowerWindow();
    const swing = ticks(sim.data.movement.rappel.breachSeconds);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, stance: Stance.Crouch }, 2 / 64);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, stance: Stance.Crouch }, 2 / 64);
    expect(pawn.state.rappelFlags & RappelFlag.Inverted).toBe(RappelFlag.Inverted); // the crouch key turned it over
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, 2 / 64); // and standing back
    for (let i = 0; i < 6; i++) sim.step(new Map());
    expect(pawn.state.rappelFlags & RappelFlag.Inverted).toBe(0);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Vault }, 10 / 64);
    for (let i = 0; i < swing; i++) sim.step(new Map());
    expect([pawn.state.mode, pawn.state.rappelTicks]).toEqual([PawnMode.Rappel, 10]);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, (swing - 10) / 64);
    expect([pawn.state.mode, pawn.state.rappelTicks]).toEqual([PawnMode.Rappel, 0]); // bounced back (no room to kick it)
  });

  it("no breach upside down, and a window shot out mid-swing is climbed in through", async () => {
    const { sim, ctrl, pawn, panel } = await atTowerWindow();
    const ctx = (sim as any).ctx;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, stance: Stance.Crouch }, 2 / 64);
    expect(pawn.state.rappelFlags & RappelFlag.Inverted).toBe(RappelFlag.Inverted);
    expect(movementPrompt(ctx, pawn)).toBeNull();
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, stance: Stance.Crouch, buttons: Btn.Vault }, 2 / 64);
    expect(pawn.state.rappelTicks).toBe(0);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, 2 / 64);
    expect(movementPrompt(ctx, pawn)).toBe("rappelBreach");
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Vault }, 2 / 64);
    expect(pawn.state.rappelTicks).toBeGreaterThan(0);
    for (const id of ["bar", "glass"]) sim.level.panels.apply(panel(id).spec.index, { kind: "damage", amount: 1e9, hard: false });
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, sim.data.movement.rappel.breachSeconds);
    expect(pawn.state.mode).toBe(PawnMode.Vault);
  });

  it("climbing up a face under a roof goes over the top onto it", async () => {
    const { sim, ctrl, pawn } = await oregon();
    // The Kids' Dorms' north wall from the Meeting roof (its ridge, about 4 m up) up to the Kids roof (6.2 m).
    stand(sim, ctrl, 33, 4.3, 23.0, 180);
    run(sim, ctrl, { yawDeg: 180 }, 0.5);
    expect(pawn.state.grounded).toBe(true);
    hookOn(sim, ctrl, 180);
    expect(pawn.state.mode).toBe(PawnMode.Rappel);
    run(sim, ctrl, { yawDeg: 180, forward: 1 }, 3);
    run(sim, ctrl, { yawDeg: 180 }, 0.5);
    expect([pawn.state.mode, pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([PawnMode.Walk, true, 6.2]);
    expect(pawn.state.z).toBeGreaterThan(23.65);
  });

  it("lethal damage on the rope kills outright (no down but not out)", async () => {
    const { sim, pawn } = await onTower();
    applyDamage(sim, pawn, { amount: 500, cause: "bullet" } as never);
    expect(pawn.state.mode).toBe(PawnMode.Dead);
  });
});

describe("rappel state on the wire", () => {
  it("round-trips exactly, and the hash sees each rappel field", async () => {
    const { sim, ctrl, pawn } = await oregon();
    stand(sim, ctrl, TOWER.x, 0, TOWER.z - 0.6, TOWER.yawDeg);
    hookOn(sim, ctrl, TOWER.yawDeg);
    const w = new ByteWriter(PAWN_STATE_BYTES);
    writePawnState(w, pawn.state);
    const back = readPawnState(new ByteReader(w.finish()));
    expect(back).toEqual(pawn.state);
    for (const k of ["rappel", "rappelFlags", "rappelTicks"] as const) expect(hashPawnState({ ...pawn.state, [k]: pawn.state[k] + 1 }), k).not.toBe(hashPawnState(pawn.state));
    expect(ticks(sim.data.movement.rappel.holdSeconds)).toBeGreaterThan(1);
  });
});

describe("rappel online", () => {
  const LAG = 6; // ticks each way (94 ms)

  /** A lab room on Oregon and one client LAG ticks away each way, standing at the Big Tower's foot facing it. */
  async function online(code: string) {
    const room = await Room.create(code, "oregon", { lab: true });
    const clock = { t: 0 };
    const up: { at: number; b: Uint8Array }[] = [];
    const down: { at: number; b: Uint8Array }[] = [];
    let tick = 0;
    const session = new ClientSession({ send: (b) => up.push({ at: tick + LAG, b }), now: () => clock.t });
    const id = room.join("roper", { send: (b) => down.push({ at: tick + LAG, b }), buffered: () => 0 }, "sledge")!;
    const deliver = () => {
      while (up.length && up[0].at <= tick) {
        const b = up.shift()!.b;
        const r = new ByteReader(b.subarray(1));
        if (b[0] === Msg.Input) room.onInput(id, decodeInput(r));
        else if (b[0] === Msg.LabTool) room.onLabTool(id, decodeLabTool(r));
      }
      while (down.length && down[0].at <= tick) session.handle(down.shift()!.b);
    };
    const step = (cmd: Partial<Omit<InputCmd, "seq">> = {}) => {
      clock.t += DT * 1000;
      tick++;
      if (session.sim) session.tick({ forward: 0, strafe: 0, yaw: TOWER.yawDeg * (Math.PI / 180), pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...cmd });
      room.step();
      deliver();
    };
    for (let i = 0; i < 4 * LAG && !session.sim; i++) step();
    await session.loaded();
    for (let i = 0; i < 4 * LAG; i++) step();
    up.push({ at: tick + LAG, b: encodeLabTool({ kind: "teleport", x: TOWER.x, y: 0, z: TOWER.z - 0.6, yawDeg: TOWER.yawDeg }) });
    for (let i = 0; i < 4 * LAG + 32; i++) step();
    const server = () => room.sim.pawns.get(session.ctrl!.possessedPawnId)!.state;
    return { room, session, id, step, server };
  }

  it("hooking on, climbing, moving along, turning over and coming down are predicted exactly at 100 ms each way", async () => {
    const { room, id, step, server } = await online("ROPE1");
    const before = room.memberInfo(id)!.corrections;
    const plan: [Partial<Omit<InputCmd, "seq">>, number][] = [
      [{ buttons: Btn.Interact }, ticks(room.sim.data.movement.rappel.holdSeconds) + 4],
      [{ forward: 1 }, 96],
      [{ strafe: 1 }, 40],
      [{ strafe: -1, buttons: Btn.Sprint }, 30],
      [{ stance: Stance.Crouch }, 20],
      [{ stance: Stance.Crouch, forward: -1 }, 20],
      [{ stance: Stance.Stand }, 20],
      [{ forward: -1 }, 200],
      [{}, 4 * LAG],
    ];
    let roped = false;
    for (const [cmd, n] of plan) {
      for (let i = 0; i < n; i++) {
        step(cmd);
        roped ||= server().mode === PawnMode.Rappel;
      }
    }
    expect(roped).toBe(true);
    expect([server().mode, server().grounded]).toEqual([PawnMode.Walk, true]);
    expect(room.memberInfo(id)!.corrections - before).toBe(0);
  });

  it("a rappel breach is predicted exactly too: the room breaks the glass and kicks the barricade, then breaks it as the body goes through", async () => {
    const { room, session, id, step, server } = await online("ROPE2");
    const before = room.memberInfo(id)!.corrections;
    const { holdSeconds, breachSeconds, climbSpeed, strafeSpeed } = room.sim.data.movement.rappel;
    const swing = ticks(breachSeconds);
    // Hook on, climb to 3.55 m (the window's sill is at 4.1), then along to its middle (x 42.3).
    const plan: [Partial<Omit<InputCmd, "seq">>, number][] = [
      [{ buttons: Btn.Interact }, ticks(holdSeconds) + 4],
      [{ forward: 1 }, Math.round((3.53 * 64) / climbSpeed)],
      [{ strafe: -1 }, Math.round((2.15 * 64) / strafeSpeed)],
      [{}, 8],
      [{ buttons: Btn.Vault }, 1],
      [{}, swing + 4 * LAG],
      [{ buttons: Btn.Vault }, 1],
      [{}, swing + 64 + 4 * LAG],
    ];
    for (const [cmd, n] of plan) for (let i = 0; i < n; i++) step(cmd);
    const bar = (sim: Sim) => sim.level.panels.byId.get("2F.o006.bar")!.panel;
    const glass = (sim: Sim) => sim.level.panels.byId.get("2F.o006.glass")!.panel;
    expect([server().mode, server().grounded, +server().y.toFixed(1)]).toEqual([PawnMode.Walk, true, 3.2]);
    expect(server().z).toBeGreaterThan(TOWER.z + 0.3); // in the 2F Tower
    expect([bar(room.sim).broken, glass(room.sim).broken, bar(session.sim!).broken, glass(session.sim!).broken]).toEqual([true, true, true, true]);
    expect(session.sim!.level.panels.hash()).toBe(room.sim.level.panels.hash());
    expect(room.memberInfo(id)!.corrections - before).toBe(0);
  });
});
