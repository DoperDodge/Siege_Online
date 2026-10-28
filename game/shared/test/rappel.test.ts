// Rappel (Phase 5 M8, research/core_mechanics.md §6; Ulo's corrections, D-116): hooking on by holding the vault
// key at a face's foot, a roof edge or a window, the moves onto the rope, moving on it and its ends, turning over,
// swinging into a window (a rappel breach), the view and the knife on it, who may, and the state on the wire.
import { describe, expect, it } from "vitest";
import {
  applyDamage,
  Btn,
  ByteReader,
  ByteWriter,
  Cause,
  ClientSession,
  decodeInput,
  decodeLabTool,
  DEG,
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
  planVault,
  poseHitboxes,
  RappelFlag,
  readPawnState,
  ropeAt,
  ropeRun,
  ropeYawRange,
  Room,
  Sim,
  Stance,
  stanceKeyOf,
  ticks,
  wrapAngle,
  writePawnState,
  type InputCmd,
  type PlayerController,
  type RopeStart,
} from "../src/index.js";
import { run, settle } from "./helpers.js";

/** The Big Tower's north face (z 7.3, looking north): one rope from the ground to the Cat Walk's top (9.2 m). */
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

/**
 * Hold the vault key long enough to hook on (and a tick more), then wait out the move onto the rope from `start`,
 * the view following the body as the move turns it (as the client's does: ropeYawRange).
 */
function hookOn(sim: Sim, ctrl: PlayerController, yawDeg: number, start: RopeStart = "foot", stance = Stance.Stand) {
  const R = sim.data.movement.rappel;
  const s = sim.pawns.get(ctrl.possessedPawnId)!.state;
  run(sim, ctrl, { yawDeg, buttons: Btn.Vault, stance }, R.holdSeconds + 2 / 64);
  for (let t = ticks(start === "top" ? R.edgeAttachSeconds : start === "window" ? R.windowAttachSeconds : R.attachSeconds); t >= 0; t--) run(sim, ctrl, { yaw: s.yaw, stance }, 1 / 64);
}

/** How far a body on the Big Tower's north rope is out from the rope's line (a swing takes it out). */
const outOnTower = (sim: Sim, z: number) => TOWER.z - sim.data.movement.stance.collisionRadius - sim.data.movement.rappel.wallGap - z;

/** Facing the way `rad` faces (to float noise). */
const facing = (yaw: number, rad: number) => Math.abs(wrapAngle(yaw - rad)) < 1e-5;

describe("rappel faces (D-105's zones)", () => {
  it("a tower's storeys hang one rope; a face over a roof starts at the roof", async () => {
    const { sim } = await oregon();
    const faces = sim.level.rappel;
    expect(faces).toHaveLength(55);
    const north = faces.findIndex((f) => f.id === "rappel:1F:N01");
    expect(ropeAt(faces, north, TOWER.x, TOWER.z, 1)).toEqual([0, expect.closeTo(9.2, 5)]);
    expect(ropeRun(faces, north, TOWER.x, 1)?.d).toBeCloseTo(-TOWER.z, 5); // n = (0, -1): d = -z
    // The Kids' Dorms' north wall stands on the Meeting roof (3.2 m).
    const kids = faces.findIndex((f) => f.id === "rappel:2F:N03");
    expect(ropeAt(faces, kids, 28, 23.65, 4)?.map((v) => +v.toFixed(2))).toEqual([3.2, 6.2]);
    expect(ropeAt(faces, kids, 28, 23.65, 1)).toBeNull();
  });

  it("walls a few centimetres apart one over the other hang one rope off the outermost, so a body climbs past the step (the Garage's east wall)", async () => {
    const { sim, ctrl, pawn } = await oregon();
    const m = sim.data.movement;
    const faces = sim.level.rappel;
    const [low, high] = ["rappel:1F:E03", "rappel:2F:E05"].map((id) => faces.findIndex((f) => f.id === id));
    expect(faces[high].d - faces[low].d).toBeCloseTo(0.1, 5); // the 2F wall stands 10 cm further out
    expect(ropeRun(faces, low, 40.8, 1)).toEqual({ y0: 0, y1: expect.closeTo(6.2, 5), d: faces[high].d });
    stand(sim, ctrl, 44.12, 0, 40.8, 90); // at the 1F wall's foot, facing it (west)
    expect(findRappel((sim as any).ctx, pawn)?.face).toBe(low);
    hookOn(sim, ctrl, 90);
    expect(pawn.state.x - faces[high].d).toBeCloseTo(m.stance.collisionRadius + m.rappel.wallGap, 3);
    for (let t = 0; t < 64 * 6 && pawn.state.mode === PawnMode.Rappel; t++) run(sim, ctrl, { yawDeg: 90, forward: 1 }, 1 / 64);
    run(sim, ctrl, { yawDeg: 90 }, 1);
    // Up past the step, and over the top onto the roof.
    expect([pawn.state.mode, pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([PawnMode.Walk, true, 6.2]);
    expect(pawn.state.x).toBeLessThan(faces[high].d);
  });
});

describe("hooking on", () => {
  it("at a face's foot, facing it: holding the vault key for holdSeconds hooks on and moves onto the rope over attachSeconds; letting go early doesn't", async () => {
    const { sim, ctrl, pawn } = await oregon();
    const m = sim.data.movement;
    const R = m.rappel;
    stand(sim, ctrl, TOWER.x, 0, TOWER.z - 0.6, TOWER.yawDeg);
    expect([findRappel((sim as any).ctx, pawn)?.start, sim.prompt(ctrl.id)]).toEqual(["foot", "rappel"]);
    // Half the hold, then let go: nothing (and nothing to vault here either).
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Vault }, R.holdSeconds / 2);
    expect([pawn.state.mode, pawn.state.rappelTicks]).toEqual([PawnMode.Walk, ticks(R.holdSeconds / 2)]);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, 0.1);
    expect([pawn.state.mode, pawn.state.rappelTicks, pawn.state.rappel]).toEqual([PawnMode.Walk, 0, -1]);
    // The whole hold: hooked on, moving onto the rope rather than snapping there.
    const z0 = pawn.state.z;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Vault }, R.holdSeconds);
    expect([pawn.state.mode, pawn.state.moveDur]).toEqual([PawnMode.Rappel, Math.fround(R.attachSeconds)]);
    const line = TOWER.z - m.stance.collisionRadius - m.rappel.wallGap;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, R.attachSeconds / 2);
    expect(pawn.state.z).toBeGreaterThan(z0 + 0.05);
    expect(pawn.state.z).toBeLessThan(line - 0.05);
    expect(sim.prompt(ctrl.id)).toBeNull();
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, R.attachSeconds / 2 + 2 / 64);
    expect([pawn.state.moveDur, pawn.state.rappelFlags & RappelFlag.Inverted, pawn.state.ropeTurn]).toEqual([0, 0, 0]);
    // On the rope's line, the body's capsule a wallGap off the wall, facing it.
    expect(pawn.state.z).toBeCloseTo(line, 3);
    expect(facing(pawn.state.yaw, Math.PI)).toBe(true);
  });

  it("where a vault can be had too (the Dorms' big window from inside, opened): a tap of the vault key vaults out, a hold climbs out onto the rope", async () => {
    for (const hold of [false, true]) {
      const { sim, ctrl, pawn } = await oregon();
      for (const [id, op] of [
        ["bar", { kind: "barricade", up: false }],
        ["glass", { kind: "damage", amount: 1, hard: false }],
      ] as const)
        sim.level.panels.apply(sim.level.panels.byId.get(`2F.o021.${id}`)!.panel.spec.index, op);
      stand(sim, ctrl, 21.1, 3.2, 31.9, 90); // in the Dorms Main Hall, facing the window (west)
      expect([sim.prompt(ctrl.id), findRappel((sim as any).ctx, pawn)?.start]).toEqual(["rappelVault", "window"]);
      if (hold) {
        hookOn(sim, ctrl, 90, "window");
        expect([pawn.state.mode, pawn.state.moveDur, pawn.state.rappelFlags & RappelFlag.Inverted]).toEqual([PawnMode.Rappel, 0, 0]);
      } else {
        run(sim, ctrl, { yawDeg: 90, buttons: Btn.Vault }, 3 / 64);
        expect(pawn.state.mode).toBe(PawnMode.Walk); // still held: it might be a hold yet
        run(sim, ctrl, { yawDeg: 90 }, 1 / 64);
        expect(pawn.state.mode).toBe(PawnMode.Vault);
        run(sim, ctrl, { yawDeg: 90 }, 1.5);
        expect([pawn.state.mode, pawn.state.grounded]).toEqual([PawnMode.Walk, true]);
      }
      expect(pawn.state.x).toBeLessThan(20.3); // outside: on the Dining roof, or on the rope over it
    }
  });

  it("at a barricaded door in a wall (a lab room gives both sides both tools, on their own keys): Space holds for the rope, F for the barricade; an attacker is shown the rope first, a defender the barricade", async () => {
    // The 1F south wall at x 3.8 (rappel:1F:S02), the 1F.o005 barricade in view.
    for (const [op, prompt] of [
      ["sledge", "rappel"],
      ["mute", "unbarricade"],
    ] as const) {
      const { sim, ctrl, pawn } = await oregon(op);
      sim.deployRules = { anyone: true, rappel: true, pools: [10, 10] };
      stand(sim, ctrl, 3.775, 0, 39.1, 0);
      expect(sim.prompt(ctrl.id), op).toBe(prompt);
      run(sim, ctrl, { yawDeg: 0, buttons: Btn.Interact }, 2 / 64);
      expect([pawn.state.rappelTicks, pawn.state.deployKind !== 0], op).toEqual([0, true]);
      run(sim, ctrl, { yawDeg: 0 }, 2 / 64);
      run(sim, ctrl, { yawDeg: 0, buttons: Btn.Vault }, 2 / 64);
      expect([pawn.state.rappelTicks, pawn.state.deployKind], op).toEqual([2, 0]);
    }
  });

  it("a tick without the player's input (a stall) leaves the hold as it is: it goes on when input comes back, the key still held", async () => {
    const { sim, ctrl, pawn } = await oregon();
    stand(sim, ctrl, TOWER.x, 0, TOWER.z - 0.6, TOWER.yawDeg);
    const hold = ticks(sim.data.movement.rappel.holdSeconds);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Vault }, 10 / 64);
    expect(pawn.state.rappelTicks).toBe(10);
    for (let i = 0; i < 6; i++) sim.step(new Map()); // no input from its player
    expect([pawn.state.mode, pawn.state.rappelTicks]).toEqual([PawnMode.Walk, 10]);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Vault }, (hold - 10) / 64);
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

  it("at a roof edge facing out over it: over the edge onto the rope under it over edgeAttachSeconds, turning upside down on the way; the stance key turns it back over turnSeconds, holding it still", async () => {
    const { sim, ctrl, pawn } = await oregon();
    const m = sim.data.movement;
    const R = m.rappel;
    // On the Kids roof (6.2 m), at its north edge over the Kids' Dorms' wall.
    stand(sim, ctrl, 28, 6.2, 24.0, 0);
    expect(findRappel((sim as any).ctx, pawn)?.start).toBe("top");
    run(sim, ctrl, { yawDeg: 0, buttons: Btn.Vault }, R.holdSeconds);
    const s = pawn.state;
    expect([s.mode, s.rappelFlags & RappelFlag.Inverted, s.ropeTurn]).toEqual([PawnMode.Rappel, RappelFlag.Inverted, 0]);
    const follow = (n: number) => {
      for (let t = 0; t < n; t++) run(sim, ctrl, { yaw: s.yaw }, 1 / 64); // the view follows the move
    };
    follow(ticks(R.edgeAttachSeconds / 2));
    expect(s.ropeTurn).toBeGreaterThan(0.3);
    expect(s.ropeTurn).toBeLessThan(0.7);
    follow(ticks(R.edgeAttachSeconds / 2) + 2);
    expect([s.moveDur, s.ropeTurn]).toEqual([0, 1]);
    expect(facing(s.yaw, Math.PI)).toBe(true); // turned to the wall (south)
    expect(s.y + m.stance.stand.height).toBeLessThanOrEqual(6.2);
    const eye = eyePose(m, sim.data.hitboxes, s);
    expect(eye.pos[1] - s.y).toBeLessThan(0.3);
    expect(eye.roll).toBeCloseTo(Math.PI, 5);
    const boxes = poseHitboxes(m, sim.data.hitboxes, s);
    const head = boxes.find((h) => h.part === "head")!;
    const legs = boxes.filter((h) => h.part.startsWith("leg"));
    expect(head.a[1]).toBeLessThan(Math.min(...legs.flatMap((l) => [l.a[1], l.b[1]])));
    // The stance key turns it right side up over turnSeconds (halfway, on its side); W held meanwhile moves nothing.
    const at = [s.x, s.y, s.z];
    run(sim, ctrl, { yawDeg: 180, stance: Stance.Crouch, forward: 1 }, R.turnSeconds / 2);
    expect(s.ropeTurn).toBeCloseTo(0.5, 5);
    expect(eyePose(m, sim.data.hitboxes, s).roll).toBeCloseTo(Math.PI / 2, 5);
    expect(movementPrompt((sim as any).ctx, pawn)).toBeNull();
    run(sim, ctrl, { yawDeg: 180, stance: Stance.Crouch, forward: 1 }, R.turnSeconds / 2);
    expect([s.ropeTurn, s.rappelFlags & RappelFlag.Inverted]).toEqual([0, 0]);
    expect([s.x, s.y, s.z]).toEqual(at);
    // And back.
    run(sim, ctrl, { yawDeg: 180 }, R.turnSeconds + 1 / 64);
    expect([s.ropeTurn, s.rappelFlags & RappelFlag.Inverted]).toEqual([1, RappelFlag.Inverted]);
  });

  it("out of a window with nothing to stand on outside (the Big Tower's 2F window, opened): over the sill and down onto the rope outside, turning to the wall", async () => {
    const { sim, ctrl, pawn } = await oregon();
    const m = sim.data.movement;
    const R = m.rappel;
    const ctx = (sim as any).ctx;
    const panel = (id: string) => sim.level.panels.byId.get(`2F.o006.${id}`)!.panel;
    stand(sim, ctrl, 42.3, 3.2, 7.9, 0); // in the 2F Tower, facing the window (north)
    expect(findRappel(ctx, pawn)).toBeNull(); // its glass and barricade in the way
    sim.level.panels.apply(panel("bar").spec.index, { kind: "barricade", up: false });
    expect(findRappel(ctx, pawn)).toBeNull(); // the glass still
    sim.level.panels.apply(panel("glass").spec.index, { kind: "damage", amount: 1, hard: false });
    expect([sim.prompt(ctrl.id), findRappel(ctx, pawn)?.start]).toEqual(["rappel", "window"]); // nothing outside to vault onto
    run(sim, ctrl, { yawDeg: 0, buttons: Btn.Vault }, R.holdSeconds);
    let apex = pawn.state.y;
    for (let t = 0; t < ticks(R.windowAttachSeconds) + 2; t++) {
      run(sim, ctrl, { yaw: pawn.state.yaw }, 1 / 64);
      apex = Math.max(apex, pawn.state.y);
    }
    expect(apex).toBeGreaterThan(4.1); // over the sill
    expect([pawn.state.mode, pawn.state.moveDur, pawn.state.rappelFlags & RappelFlag.Inverted]).toEqual([PawnMode.Rappel, 0, 0]);
    expect([pawn.state.x, pawn.state.y]).toEqual([expect.closeTo(42.3, 2), expect.closeTo(4.1 - R.windowHangBelowSill, 2)]);
    expect(pawn.state.z).toBeCloseTo(TOWER.z - m.stance.collisionRadius - m.rappel.wallGap, 3);
    expect(facing(pawn.state.yaw, Math.PI)).toBe(true);
    // Down to the ground.
    run(sim, ctrl, { yawDeg: 180, forward: -1 }, 2);
    run(sim, ctrl, { yawDeg: 180 }, 0.3);
    expect([pawn.state.mode, pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([PawnMode.Walk, true, 0]);
  });

  it("Skopós (a lab room lets her rappel): her shell's camera opens on the rope, but she can't swap shells there, and the body hangs still meanwhile", async () => {
    const { sim, ctrl, pawn } = await oregon("skopos");
    sim.deployRules.rappel = true;
    stand(sim, ctrl, TOWER.x, 0, TOWER.z - 0.6, TOWER.yawDeg);
    hookOn(sim, ctrl, TOWER.yawDeg);
    expect(pawn.state.mode).toBe(PawnMode.Rappel);
    const at = [pawn.state.x, pawn.state.y, pawn.state.z];
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Ability }, 1 / 64);
    expect([ctrl.shellCam, sim.viewedPawnId(ctrl.id) !== pawn.id]).toEqual([true, true]);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, forward: 1, stance: Stance.Crouch }, 0.5);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Interact }, 1 / 64); // the swap's key
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, 1);
    expect([ctrl.shellCam, ctrl.swapPhase, ctrl.possessedPawnId]).toEqual([true, 0, pawn.id]);
    expect([pawn.state.mode, pawn.state.ropeTurn, pawn.state.x, pawn.state.y, pawn.state.z]).toEqual([PawnMode.Rappel, 0, ...at]);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Ability }, 1 / 64);
    expect([ctrl.shellCam, pawn.state.mode]).toEqual([false, PawnMode.Rappel]);
  });
});

describe("on the rope", () => {
  async function onTower() {
    const o = await oregon();
    stand(o.sim, o.ctrl, TOWER.x, 0, TOWER.z - 0.6, TOWER.yawDeg);
    hookOn(o.sim, o.ctrl, TOWER.yawDeg);
    expect([o.pawn.state.mode, o.pawn.state.moveDur]).toEqual([PawnMode.Rappel, 0]);
    return o;
  }

  it("W climbs at climbSpeed, S descends at descendSpeed (rapidDescendSpeed with sprint), A and D move along the wall at strafeSpeed (sprintStrafeSpeed with sprint)", async () => {
    const { sim, ctrl, pawn } = await onTower();
    const R = sim.data.movement.rappel;
    const y0 = pawn.state.y;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, forward: 1 }, 2);
    expect(pawn.state.y - y0).toBeCloseTo(R.climbSpeed * 2, 1);
    let y1 = pawn.state.y;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, forward: -1 }, 0.25);
    expect(y1 - pawn.state.y).toBeCloseTo(R.descendSpeed * 0.25, 1);
    y1 = pawn.state.y;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, forward: -1, buttons: Btn.Sprint }, 0.25);
    expect(y1 - pawn.state.y).toBeCloseTo(R.rapidDescendSpeed * 0.25, 1);
    // Facing the wall (south), D (right as seen) moves west along it.
    const x0 = pawn.state.x;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, strafe: 1 }, 0.5);
    expect(x0 - pawn.state.x).toBeCloseTo(R.strafeSpeed * 0.5, 1);
    const x1 = pawn.state.x;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, strafe: -1, buttons: Btn.Sprint }, 0.5);
    expect(pawn.state.x - x1).toBeCloseTo(R.sprintStrafeSpeed * 0.5, 1);
    expect(pawn.state.mode).toBe(PawnMode.Rappel);
  });

  it("the view turns at most yawLimitDeg either side of facing the wall (the client's view is held to the same range)", async () => {
    const { sim, ctrl, pawn } = await onTower();
    const lim = sim.data.movement.rappel.yawLimitDeg;
    expect(ropeYawRange(sim.level, sim.data, pawn.state)).toEqual({ center: expect.closeTo(Math.PI, 5), half: lim * DEG });
    const yawAfter = (deg: number) => {
      run(sim, ctrl, { yawDeg: deg }, 1 / 64);
      return Math.round(pawn.state.yaw / DEG);
    };
    expect([yawAfter(100), yawAfter(-100), yawAfter(180)]).toEqual([100, -100, 180]);
    expect([yawAfter(45), yawAfter(-45)]).toEqual([180 - lim, lim - 180]);
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

  it("the knife works on the rope (Ulo), but not while turning over", async () => {
    const { sim, ctrl, pawn } = await onTower();
    const melee = sim.data.combat.melee;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Melee }, 1 / 64);
    expect(pawn.state.meleeTicks).toBe(1);
    let impacts = 0;
    for (let t = 0; t < ticks(melee.cycleSeconds) + 1; t++) {
      run(sim, ctrl, { yawDeg: TOWER.yawDeg }, 1 / 64);
      impacts += sim.events.filter((e) => e.kind === "meleeImpact" && e.pawnId === pawn.id).length;
    }
    expect([impacts, pawn.state.meleeTicks]).toEqual([1, 0]);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, stance: Stance.Crouch }, 2 / 64); // turning over
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, stance: Stance.Crouch, buttons: Btn.Melee }, 1 / 64);
    expect([pawn.state.meleeTicks, pawn.state.ropeTurn > 0 && pawn.state.ropeTurn < 1]).toEqual([0, true]);
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

  it("Space at an open window swings the body out swingOutM from the wall and back over swingSeconds (the view held still), then in through it", async () => {
    const { sim, ctrl, pawn, panel } = await atTowerWindow();
    const R = sim.data.movement.rappel;
    sim.level.panels.apply(panel("bar").spec.index, { kind: "barricade", up: false });
    sim.level.panels.apply(panel("glass").spec.index, { kind: "damage", amount: 1, hard: false });
    expect(movementPrompt((sim as any).ctx, pawn)).toBe("rappelIn");
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Vault }, 1 / 64);
    expect(pawn.state.rappelTicks).toBe(1);
    expect(ropeYawRange(sim.level, sim.data, pawn.state)).toEqual({ center: pawn.state.yaw, half: 0 });
    let most = 0;
    for (let t = 1; t < ticks(R.swingSeconds); t++) {
      run(sim, ctrl, { yawDeg: TOWER.yawDeg }, 1 / 64);
      most = Math.max(most, outOnTower(sim, pawn.state.z));
    }
    expect(most).toBeCloseTo(R.swingOutM, 2);
    expect(pawn.state.mode).toBe(PawnMode.Vault); // back at the wall: in
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, 1.5);
    expect([pawn.state.mode, pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([PawnMode.Walk, true, 3.2]);
    expect(pawn.state.z).toBeGreaterThan(TOWER.z + 0.3); // inside the 2F Tower
  });

  it("rappel breach: Space at the glass and barricade swings into them; a fresh barricade bounces the body off (out bounceOutM and back) with a kick, a worn one gives way", async () => {
    const { sim, ctrl, pawn, panel } = await atTowerWindow();
    const ctx = (sim as any).ctx;
    const R = sim.data.movement.rappel;
    const [bar, glass] = [panel("bar"), panel("glass")];
    const both = [bar.spec.index, glass.spec.index].sort((a, b) => a - b);
    expect(movementPrompt(ctx, pawn)).toBe("rappelBreach");
    expect(planBreach(ctx, pawn)).toMatchObject({ panels: both, through: false });
    const B = sim.data.destruction.barricade;
    const [swing, bounce] = [ticks(R.swingSeconds), ticks(R.bounceSeconds)];
    /** Step one tick with `cmd`, the breach events it made applied as the room applies them. */
    const breaches: { panels: number[]; through: boolean }[] = [];
    const step = (cmd: Parameters<typeof run>[2]) => {
      run(sim, ctrl, cmd, 1 / 64);
      applyBreaches(sim, breaches);
    };
    // The swing, out and back: W and the stance key do nothing meanwhile, and the hands are busy.
    const y = pawn.state.y;
    step({ yawDeg: TOWER.yawDeg, buttons: Btn.Vault });
    expect(pawn.state.rappelTicks).toBe(1);
    expect(movementPrompt(ctx, pawn)).toBeNull();
    let most = 0;
    for (let t = 1; t < swing - 1; t++) {
      step({ yawDeg: TOWER.yawDeg, forward: 1, stance: Stance.Crouch, buttons: Btn.Ads });
      most = Math.max(most, outOnTower(sim, pawn.state.z));
    }
    expect(most).toBeCloseTo(R.swingOutM, 2);
    expect([pawn.state.y, pawn.state.mode, pawn.state.rappelFlags & RappelFlag.Inverted, pawn.state.adsQ]).toEqual([y, PawnMode.Rappel, 0, 0]);
    expect(breaches).toHaveLength(0);
    // Back at the wall: bounced off, the glass broken and the barricade kicked; out bounceOutM and back in.
    step({ yawDeg: TOWER.yawDeg, stance: Stance.Crouch });
    expect(breaches).toEqual([{ panels: both, through: false }]);
    most = 0;
    for (let t = 0; t < bounce; t++) {
      step({ yawDeg: TOWER.yawDeg, stance: Stance.Crouch });
      most = Math.max(most, outOnTower(sim, pawn.state.z));
    }
    expect(most).toBeCloseTo(R.bounceOutM, 2);
    expect([pawn.state.mode, pawn.state.rappelTicks, pawn.state.rappelFlags & RappelFlag.Inverted, pawn.state.ropeTurn]).toEqual([PawnMode.Rappel, 0, 0, 0]);
    expect(outOnTower(sim, pawn.state.z)).toBeCloseTo(0, 4);
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

  it("turning away mid-swing doesn't lose the window: the view holds still through it", async () => {
    const { sim, ctrl, pawn } = await atTowerWindow();
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Vault }, 1 / 64);
    const log: { panels: number[]; through: boolean }[] = [];
    for (let t = 1; t < ticks(sim.data.movement.rappel.swingSeconds); t++) {
      run(sim, ctrl, { yawDeg: TOWER.yawDeg + 90 }, 1 / 64);
      applyBreaches(sim, log);
    }
    expect([log.length, facing(pawn.state.yaw, Math.PI)]).toEqual([1, true]);
  });

  it("into a Dorms window from the roof (M8's done-when): over the Kids' Dorms' roof edge upside down, right side up, down to the window, two swings in", async () => {
    const { sim, ctrl, pawn } = await oregon();
    const R = sim.data.movement.rappel;
    const bar = sim.level.panels.byId.get("2F.o004.bar")!.panel;
    const glass = sim.level.panels.byId.get("2F.o004.glass")!.panel;
    stand(sim, ctrl, 27.875, 6.3, 24.04, 0);
    expect(movementPrompt((sim as any).ctx, pawn)).toBe("rappel");
    hookOn(sim, ctrl, 0, "top");
    expect([pawn.state.mode, pawn.state.ropeTurn]).toEqual([PawnMode.Rappel, 1]);
    // Facing the wall now (south): right side up (the crouch key, kept down), then down to the window.
    const held = { yawDeg: 180, stance: Stance.Crouch };
    run(sim, ctrl, held, R.turnSeconds + 1 / 64);
    expect(pawn.state.ropeTurn).toBe(0);
    for (let t = 0; t < 200 && pawn.state.y > 3.55; t++) run(sim, ctrl, { ...held, forward: -1 }, 1 / 64);
    run(sim, ctrl, held, 2 / 64);
    expect([pawn.state.mode, movementPrompt((sim as any).ctx, pawn)]).toEqual([PawnMode.Rappel, "rappelBreach"]);
    const whole = ticks(R.swingSeconds) + ticks(R.bounceSeconds);
    const log: { panels: number[]; through: boolean }[] = [];
    for (let k = 0; k < 2; k++) {
      run(sim, ctrl, { ...held, buttons: Btn.Vault }, 1 / 64);
      for (let t = 1; t < whole; t++) {
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
    const R = sim.data.movement.rappel;
    const bar = sim.level.panels.byId.get("2F.o021.bar")!.panel;
    stand(sim, ctrl, 19.75, 3.6, 31.9, -90); // on the Dining roof, facing the Dorms Main Hall's west wall
    expect([pawn.state.grounded, sim.prompt(ctrl.id)]).toEqual([true, "rappel"]);
    hookOn(sim, ctrl, -90);
    expect([pawn.state.mode, movementPrompt((sim as any).ctx, pawn)]).toEqual([PawnMode.Rappel, "rappelBreach"]);
    const whole = ticks(R.swingSeconds) + ticks(R.bounceSeconds);
    const log: { panels: number[]; through: boolean }[] = [];
    for (let k = 0; k < 2; k++) {
      run(sim, ctrl, { yawDeg: -90, buttons: Btn.Vault }, 1 / 64);
      for (let t = 1; t < whole; t++) {
        run(sim, ctrl, { yawDeg: -90 }, 1 / 64);
        applyBreaches(sim, log);
      }
    }
    expect([log.map((e) => e.through), bar.broken]).toEqual([[false, true], true]);
    run(sim, ctrl, { yawDeg: -90 }, 1.5);
    expect([pawn.state.mode, pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([PawnMode.Walk, true, 3.2]);
    expect(pawn.state.x).toBeGreaterThan(20.5); // in the Dorms Main Hall (x 20.5–30)
  });

  it("a stall holds a turn, a swing and the stance key as they are; each goes on when input comes back", async () => {
    const { sim, ctrl, pawn } = await atTowerWindow();
    const R = sim.data.movement.rappel;
    const stall = (n: number) => {
      for (let i = 0; i < n; i++) sim.step(new Map()); // no input from its player
    };
    const crouch = { yawDeg: TOWER.yawDeg, stance: Stance.Crouch };
    // Turning over, stalled halfway: the turn waits.
    run(sim, ctrl, crouch, R.turnSeconds / 2);
    expect(pawn.state.ropeTurn).toBeCloseTo(0.5, 5);
    stall(6);
    expect(pawn.state.ropeTurn).toBeCloseTo(0.5, 5);
    run(sim, ctrl, crouch, R.turnSeconds / 2);
    expect(pawn.state.ropeTurn).toBe(1);
    // Upside down with the crouch key held: a stall (whose idle input stands) leaves it upside down.
    stall(6);
    expect([stanceKeyOf(pawn.state), pawn.state.rappelFlags & RappelFlag.Inverted]).toEqual([Stance.Crouch, RappelFlag.Inverted]);
    run(sim, ctrl, crouch, 2 / 64);
    expect([stanceKeyOf(pawn.state), pawn.state.ropeTurn, pawn.state.rappelFlags & RappelFlag.Inverted]).toEqual([Stance.Crouch, 1, RappelFlag.Inverted]);
    // Right side up again, then a swing stalled partway: it waits, and goes on.
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, R.turnSeconds + 1 / 64);
    expect(pawn.state.ropeTurn).toBe(0);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Vault }, 10 / 64);
    stall(ticks(R.swingSeconds));
    expect([pawn.state.mode, pawn.state.rappelTicks]).toEqual([PawnMode.Rappel, 10]);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, (ticks(R.swingSeconds) + ticks(R.bounceSeconds) - 10) / 64);
    expect([pawn.state.mode, pawn.state.rappelTicks]).toEqual([PawnMode.Rappel, 0]); // bounced off (nobody applied the kick)
  });

  it("no swing upside down, and a window shot out mid-swing is climbed in through", async () => {
    const { sim, ctrl, pawn, panel } = await atTowerWindow();
    const ctx = (sim as any).ctx;
    const R = sim.data.movement.rappel;
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, stance: Stance.Crouch }, R.turnSeconds + 1 / 64);
    expect(pawn.state.ropeTurn).toBe(1);
    expect(movementPrompt(ctx, pawn)).toBeNull();
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, stance: Stance.Crouch, buttons: Btn.Vault }, 2 / 64);
    expect(pawn.state.rappelTicks).toBe(0);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, R.turnSeconds + 1 / 64);
    expect(movementPrompt(ctx, pawn)).toBe("rappelBreach");
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, buttons: Btn.Vault }, 2 / 64);
    expect(pawn.state.rappelTicks).toBeGreaterThan(0);
    for (const id of ["bar", "glass"]) sim.level.panels.apply(panel(id).spec.index, { kind: "damage", amount: 1e9, hard: false });
    run(sim, ctrl, { yawDeg: TOWER.yawDeg }, R.swingSeconds);
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
    for (let t = 0; t < 64 * 3 && pawn.state.mode === PawnMode.Rappel; t++) run(sim, ctrl, { yawDeg: 180, forward: 1 }, 1 / 64);
    run(sim, ctrl, { yawDeg: 180 }, 1);
    expect([pawn.state.mode, pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([PawnMode.Walk, true, 6.2]);
    expect(pawn.state.z).toBeGreaterThan(23.65);
  });

  it("the Balcony: climbing its wall goes over the railing onto it (Ulo); from it, facing out over the railing, a hold goes over it onto the rope, upside down", async () => {
    const { sim, ctrl, pawn } = await oregon();
    const H = sim.data.movement.stance.stand.height;
    // At the foot of the 1F wall under the Balcony (rappel:1F:S05, z 42.6; the railing on it is z 42.3–42.6, 3.2–4.2 m).
    stand(sim, ctrl, 36.8, 0, 43.2, 0);
    expect(sim.prompt(ctrl.id)).toBe("rappel");
    hookOn(sim, ctrl, 0);
    for (let t = 0; t < 64 * 4 && pawn.state.mode === PawnMode.Rappel; t++) run(sim, ctrl, { yawDeg: 0, forward: 1 }, 1 / 64);
    let apex = pawn.state.y;
    for (let t = 0; t < 64; t++) {
      run(sim, ctrl, { yawDeg: 0 }, 1 / 64);
      apex = Math.max(apex, pawn.state.y);
    }
    expect([pawn.state.mode, pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([PawnMode.Walk, true, 3.2]);
    expect(apex).toBeGreaterThan(4.2); // over the railing's top
    expect(pawn.state.z).toBeLessThan(42.3); // behind it, on the Balcony
    stand(sim, ctrl, 36.8, 3.2, 41.9, 180);
    expect(findRappel((sim as any).ctx, pawn)?.start).toBe("top");
    hookOn(sim, ctrl, 180, "top");
    expect([pawn.state.mode, pawn.state.ropeTurn]).toEqual([PawnMode.Rappel, 1]);
    expect(pawn.state.z).toBeGreaterThan(42.6);
    expect(pawn.state.y + H).toBeLessThanOrEqual(3.2);
  });

  it("at the rope's foot over a ledge narrower than the body (the Kids' Dorms' north wall, on the Kitchen's): S takes it off the rope onto the ledge", async () => {
    const { sim, ctrl, pawn } = await oregon();
    stand(sim, ctrl, 27.875, 6.3, 24.04, 0);
    hookOn(sim, ctrl, 0, "top");
    const held = { yawDeg: 180, stance: Stance.Crouch };
    run(sim, ctrl, held, sim.data.movement.rappel.turnSeconds + 1 / 64);
    for (let t = 0; t < 64 * 3 && pawn.state.mode === PawnMode.Rappel; t++) run(sim, ctrl, { ...held, forward: -1 }, 1 / 64);
    run(sim, ctrl, { yawDeg: 180 }, 0.5);
    expect([pawn.state.mode, pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([PawnMode.Walk, true, 3.2]);
  });

  it("Space doesn't swing up onto a roof over the wall (the Garage's south wall): that's W's, over the top", async () => {
    const { sim, ctrl, pawn } = await oregon();
    const ctx = (sim as any).ctx;
    stand(sim, ctrl, 47.7, 0, 40.5, 0); // at the wall's foot (rappel:1F:S03, z 39.9), facing it (north)
    hookOn(sim, ctrl, 0);
    expect(pawn.state.mode).toBe(PawnMode.Rappel);
    for (let t = 0; t < 128 && pawn.state.y < 1.86; t++) run(sim, ctrl, { yawDeg: 0, forward: 1 }, 1 / 64);
    expect(planVault(ctx, pawn)?.toY).toBeCloseTo(3.2, 1); // a vault from here lands on the roof...
    expect(movementPrompt(ctx, pawn)).toBeNull(); // ...but isn't offered
    run(sim, ctrl, { yawDeg: 0, buttons: Btn.Vault }, 2 / 64);
    expect([pawn.state.mode, pawn.state.rappelTicks]).toEqual([PawnMode.Rappel, 0]);
    for (let t = 0; t < 64 && pawn.state.mode === PawnMode.Rappel; t++) run(sim, ctrl, { yawDeg: 0, forward: 1 }, 1 / 64);
    run(sim, ctrl, { yawDeg: 0 }, 1);
    expect([pawn.state.mode, pawn.state.grounded, +pawn.state.y.toFixed(1)]).toEqual([PawnMode.Walk, true, 3.2]);
    expect(pawn.state.z).toBeLessThan(39.9); // on the Garage roof
  });

  it("lethal damage on the rope kills outright; the same on foot downs (DBNO)", async () => {
    const { sim, pawn } = await onTower();
    applyDamage(sim, pawn, { amount: pawn.state.hp + 1, kill: false, cause: Cause.Bullet });
    expect(pawn.state.mode).toBe(PawnMode.Dead);
    const o = await oregon();
    stand(o.sim, o.ctrl, TOWER.x, 0, TOWER.z - 0.6, TOWER.yawDeg);
    applyDamage(o.sim, o.pawn, { amount: o.pawn.state.hp + 1, kill: false, cause: Cause.Bullet });
    expect(o.pawn.state.mode).toBe(PawnMode.Downed);
  });
});

describe("rappel state on the wire", () => {
  it("round-trips exactly (mid-turn too), and the hash sees each rappel field", async () => {
    const { sim, ctrl, pawn } = await oregon();
    stand(sim, ctrl, TOWER.x, 0, TOWER.z - 0.6, TOWER.yawDeg);
    hookOn(sim, ctrl, TOWER.yawDeg);
    run(sim, ctrl, { yawDeg: TOWER.yawDeg, stance: Stance.Crouch }, 5 / 64);
    expect(pawn.state.ropeTurn).toBeCloseTo(5 / ticks(sim.data.movement.rappel.turnSeconds), 5);
    const w = new ByteWriter(PAWN_STATE_BYTES);
    writePawnState(w, pawn.state);
    expect(readPawnState(new ByteReader(w.finish()))).toEqual(pawn.state);
    for (const k of ["rappel", "rappelFlags", "rappelTicks", "ropeTurn"] as const) expect(hashPawnState({ ...pawn.state, [k]: pawn.state[k] + 1 }), k).not.toBe(hashPawnState(pawn.state));
    expect(ticks(sim.data.movement.rappel.holdSeconds)).toBeGreaterThan(1);
  });
});

describe("rappel online", () => {
  const LAG = 6; // ticks each way (94 ms)
  /** Longer than the room holds a player still for (MAX_HOLD_TICKS): the body is stepped on without input. */
  const STALL = 24;

  /**
   * A lab room on Oregon and one client LAG ticks away each way, standing at the Big Tower's foot facing it.
   * `stall(n)`: the client's next n ticks of input reach the room only after them (a lag spike).
   */
  async function online(code: string) {
    const room = await Room.create(code, "oregon", { lab: true });
    const clock = { t: 0 };
    const up: { at: number; b: Uint8Array }[] = [];
    const down: { at: number; b: Uint8Array }[] = [];
    let tick = 0;
    let spikeEnd = 0;
    const session = new ClientSession({ send: (b) => up.push({ at: Math.max(tick, spikeEnd) + LAG, b }), now: () => clock.t });
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
      if (session.sim) session.tick({ forward: 0, strafe: 0, yaw: TOWER.yawDeg * DEG, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...cmd });
      room.step();
      deliver();
    };
    const stall = (n: number) => {
      spikeEnd = tick + n;
    };
    for (let i = 0; i < 4 * LAG && !session.sim; i++) step();
    await session.loaded();
    for (let i = 0; i < 4 * LAG; i++) step();
    up.push({ at: tick + LAG, b: encodeLabTool({ kind: "teleport", x: TOWER.x, y: 0, z: TOWER.z - 0.6, yawDeg: TOWER.yawDeg }) });
    for (let i = 0; i < 4 * LAG + 32; i++) step();
    const server = () => room.sim.pawns.get(session.ctrl!.possessedPawnId)!.state;
    /** Corrections that were mispredictions (not the room's own doing, such as a stall's). */
    const mispredicted = () => room.memberInfo(id)!.corrections - room.memberInfo(id)!.forcedCorrections;
    return { room, session, id, step, stall, server, mispredicted };
  }

  /** A step of a plan: an input held for some ticks (in the breach's plan, a lag spike as it starts if `spike`). */
  type Leg = [Partial<Omit<InputCmd, "seq">>, number, boolean?];

  it("hooking on, climbing, moving along, turning over and back and coming down are predicted exactly at 100 ms each way, through a lag spike mid-hold, mid-turn or upside down", async () => {
    // Each spike in a room of its own: after one, the room holds back as many inputs as it stepped the body on
    // without (so it's never ahead of room time), and that backlog would cover a second spike.
    for (const at of [1, 6, 7]) {
      const { room, step, stall, server, mispredicted } = await online(`ROPE1${at}`);
      const R = room.sim.data.movement.rappel;
      const before = mispredicted();
      const stalls = room.stats.stalls;
      const plan: Leg[] = [
        [{ buttons: Btn.Vault }, 10],
        [{ buttons: Btn.Vault }, ticks(R.holdSeconds) + ticks(R.attachSeconds)],
        [{ forward: 1 }, 96],
        [{ strafe: 1 }, 40],
        [{ strafe: -1, buttons: Btn.Sprint }, 30],
        [{ stance: Stance.Crouch }, 12],
        [{ stance: Stance.Crouch }, 40],
        [{ stance: Stance.Crouch, forward: -1 }, 30],
        [{ stance: Stance.Stand }, 40],
        [{ forward: -1, buttons: Btn.Sprint }, 200],
        [{}, 4 * LAG],
      ];
      let [roped, upsideDown] = [false, false];
      plan.forEach(([cmd, n], i) => {
        if (i === at) stall(STALL);
        for (let k = 0; k < n; k++) {
          step(cmd);
          roped ||= server().mode === PawnMode.Rappel;
          upsideDown ||= server().ropeTurn === 1;
        }
      });
      expect([roped, upsideDown], `spike at ${at}`).toEqual([true, true]);
      expect([server().mode, server().grounded], `spike at ${at}`).toEqual([PawnMode.Walk, true]);
      expect(room.stats.stalls - stalls, `spike at ${at}`).toBe(1);
      expect(mispredicted() - before, `spike at ${at}`).toBe(0);
    }
  });

  it("a rappel breach is predicted exactly too, through a lag spike mid-swing: the room breaks the glass and kicks the barricade, then breaks it as the body goes through", async () => {
    const { room, session, step, stall, server, mispredicted } = await online("ROPE2");
    const before = mispredicted();
    const stalls = room.stats.stalls;
    const { holdSeconds, attachSeconds, swingSeconds, bounceSeconds, climbSpeed, strafeSpeed } = room.sim.data.movement.rappel;
    const whole = ticks(swingSeconds) + ticks(bounceSeconds);
    // Hook on, climb to 3.55 m (the window's sill is at 4.1), then along to its middle (x 42.3).
    const plan: Leg[] = [
      [{ buttons: Btn.Vault }, ticks(holdSeconds) + ticks(attachSeconds) + 4],
      [{ forward: 1 }, Math.round((3.53 * 64) / climbSpeed)],
      [{ strafe: -1 }, Math.round((2.15 * 64) / strafeSpeed)],
      [{}, 8],
      [{ buttons: Btn.Vault }, 1],
      [{}, 10],
      [{}, whole + 4 * LAG, true],
      [{ buttons: Btn.Vault }, 1],
      [{}, whole + 64 + 4 * LAG],
    ];
    for (const [cmd, n, spike] of plan) {
      if (spike) stall(STALL);
      for (let i = 0; i < n; i++) step(cmd);
    }
    const bar = (sim: Sim) => sim.level.panels.byId.get("2F.o006.bar")!.panel;
    const glass = (sim: Sim) => sim.level.panels.byId.get("2F.o006.glass")!.panel;
    expect([server().mode, server().grounded, +server().y.toFixed(1)]).toEqual([PawnMode.Walk, true, 3.2]);
    expect(server().z).toBeGreaterThan(TOWER.z + 0.3); // in the 2F Tower
    expect([bar(room.sim).broken, glass(room.sim).broken, bar(session.sim!).broken, glass(session.sim!).broken]).toEqual([true, true, true, true]);
    expect(session.sim!.level.panels.hash()).toBe(room.sim.level.panels.hash());
    expect(room.stats.stalls - stalls).toBe(1);
    expect(mispredicted() - before).toBe(0);
  });
});
