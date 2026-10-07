// The knife (Phase 3 M8; DECISIONS D-050; research/core_mechanics.md §12): the swing's timeline in the
// simulation, and what a swing reaches (judged on the server like a shot).
import { describe, expect, it } from "vitest";
import {
  applyDamage,
  Btn,
  Cause,
  eyePose,
  judgeMelee,
  loadGameData,
  PawnMode,
  poseHitboxes,
  Sim,
  Stance,
  ticks,
  WeaponAct,
  type Hitbox,
  type InputCmd,
  type Pawn,
  type SimEvent,
} from "../src/index.js";
import { input } from "./helpers.js";

const data = loadGameData();
const melee = data.combat.melee;
type Cmd = Partial<InputCmd> & { yawDeg?: number };

async function people(spots: { at: [number, number, number]; yawDeg?: number; op?: string }[]) {
  const sim = await Sim.create("movement_lab");
  const ctrls = spots.map((p, i) => sim.addPlayer(`p${i}`, p.op ?? "sledge", 0, undefined, undefined, i === 0 ? 0 : 1));
  const pawn = (i: number) => sim.pawns.get(ctrls[i].possessedPawnId)!;
  const events: SimEvent[] = [];
  const step = (cmds: Cmd[] = [], n = 1) => {
    for (let k = 0; k < n; k++) {
      sim.step(new Map(ctrls.map((c, i) => [c.id, input({ yaw: pawn(i).state.yaw, pitch: pawn(i).state.pitch, stance: pawn(i).state.stance, ...cmds[i] })])));
      events.push(...sim.events);
    }
  };
  spots.forEach((p, i) => sim.teleport(ctrls[i].possessedPawnId, ...p.at, p.yawDeg ?? 0));
  step([], 30);
  return { sim, pawn, step, events };
}

/** Everyone posed as they are now (what a rewound frame would hold). */
const posed = (sim: Sim): Map<number, Hitbox[]> => new Map([...sim.pawns.values()].map((p) => [p.id, poseHitboxes(sim.data.movement, sim.data.hitboxes, p.state)]));
const swing = (sim: Sim, a: Pawn) => judgeMelee(sim, eyePose(sim.data.movement, sim.data.hitboxes, a.state).pos, a.state, a.state.yaw, posed(sim), new Set([a.id]));

describe("the swing (DECISIONS D-050)", () => {
  it("lands impactSeconds after the press and can't be repeated before the swing ends", async () => {
    const w = await people([{ at: [0, 0, 12] }]);
    const impacts = () => w.events.filter((e) => e.kind === "meleeImpact").length;
    w.step([{ buttons: Btn.Melee }]);
    expect(w.pawn(0).state.meleeTicks).toBe(1);
    w.step([{}], ticks(melee.impactSeconds) - 1);
    expect(impacts()).toBe(0);
    w.step([{}]);
    expect(impacts()).toBe(1); // exactly impactSeconds after the press
    // Mashing the key during the swing does nothing...
    for (let i = 0; i < ticks(melee.cycleSeconds) - ticks(melee.impactSeconds) - 2; i++) w.step([{ buttons: i % 2 ? Btn.Melee : 0 }]);
    expect(w.pawn(0).state.meleeTicks).toBeGreaterThan(0);
    w.step([{}], 2);
    expect(w.pawn(0).state.meleeTicks).toBe(0);
    // ...and a press once it's over swings again.
    w.step([{ buttons: Btn.Melee }]);
    w.step([{}], ticks(melee.impactSeconds));
    expect(impacts()).toBe(2);
  });

  it("cancels a reload, holds fire and aim, ends a sprint; not on a ladder or while down", async () => {
    const w = await people([{ at: [0, 0, 12] }]);
    const s = () => w.pawn(0).state;
    w.step([{ buttons: Btn.Fire }], 10);
    w.step([{ buttons: Btn.Reload }]);
    expect(s().wAct).toBe(WeaponAct.Reload);
    const loaded = s().loaded0;
    w.step([{ buttons: Btn.Melee }]);
    expect(s().wAct).toBe(WeaponAct.Ready);
    w.step([{ buttons: Btn.Fire | Btn.Ads }], 10);
    expect([s().loaded0, s().adsQ]).toEqual([loaded, 0]);
    w.step([{}], 40);
    w.step([{ forward: 1, buttons: Btn.Sprint }], 40);
    expect(s().sprinting).toBe(true);
    w.step([{ forward: 1, buttons: Btn.Sprint | Btn.Melee }]);
    w.step([{ forward: 1, buttons: Btn.Sprint }]);
    expect(s().sprinting).toBe(false);
    // Down: no knife.
    w.step([{}], 60);
    applyDamage(w.sim, w.pawn(0), { amount: s().hp, kill: false });
    w.step([{ buttons: Btn.Melee }]);
    expect(s().meleeTicks).toBe(0);
  });
});

describe("what a swing reaches", () => {
  it("someone right in front, within reach; nobody a step too far, off to the side, or behind a wall", async () => {
    // Facing −Z (yaw 0) at (0, 0, 12); the other player 1.2 m ahead.
    const near = await people([{ at: [0, 0, 12] }, { at: [0, 0, 10.8], yawDeg: 180 }]);
    expect(swing(near.sim, near.pawn(0))).toMatchObject({ pawnId: near.pawn(1).id });
    const far = await people([{ at: [0, 0, 12] }, { at: [0, 0, 12 - melee.reach - 0.6], yawDeg: 180 }]);
    expect(swing(far.sim, far.pawn(0))).toBeNull();
    // 1.2 m away but 50° off to the left: outside the 20° cone.
    const side = await people([{ at: [0, 0, 12] }, { at: [-1.2 * Math.sin(50 * (Math.PI / 180)), 0, 12 - 1.2 * Math.cos(50 * (Math.PI / 180))] }]);
    expect(swing(side.sim, side.pawn(0))).toBeNull();
    // Either side of a 0.2 m wall (sample_hard: z 16.9–17.1), 1.15 m apart: in reach, but not through it.
    const wall = await people([{ at: [1.5, 0, 17.55] }, { at: [1.5, 0, 16.4], yawDeg: 180 }]);
    expect(Math.hypot(wall.pawn(1).state.x - wall.pawn(0).state.x, wall.pawn(1).state.z - wall.pawn(0).state.z)).toBeLessThan(melee.reach);
    expect(swing(wall.sim, wall.pawn(0))).toBeNull();
    const open = await people([{ at: [5.5, 0, 17.55] }, { at: [5.5, 0, 16.4], yawDeg: 180 }]); // the same, beside the walls
    expect(swing(open.sim, open.pawn(0))).toMatchObject({ pawnId: open.pawn(1).id });
  });

  it("someone lying down at your feet is in reach (measured across the floor)", async () => {
    const w = await people([{ at: [0, 0, 12] }, { at: [0, 0, 10.9], yawDeg: 90 }]);
    applyDamage(w.sim, w.pawn(1), { amount: w.pawn(1).state.hp, kill: false });
    w.step([], 90); // lies down
    expect(w.pawn(1).state.stance).toBe(Stance.Prone);
    expect(swing(w.sim, w.pawn(0))).toMatchObject({ pawnId: w.pawn(1).id });
    // And the knife finishes a downed body.
    w.step([], 30); // past the moment of invulnerability
    expect(applyDamage(w.sim, w.pawn(1), { amount: 0, kill: false, cause: Cause.Melee }).outcome).toBe("killed");
    expect(w.pawn(1).state.mode).toBe(PawnMode.Dead);
  });

  it("of two in reach, the nearer one", async () => {
    const w = await people([{ at: [0, 0, 12] }, { at: [0.15, 0, 10.6] }, { at: [-0.1, 0, 11.0] }]);
    expect(swing(w.sim, w.pawn(0))!.pawnId).toBe(w.pawn(2).id);
  });
});
