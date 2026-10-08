// Hit registration on the server (Phase 3 M6; DECISIONS D-044, D-046): what stops a bullet, which bodies
// each pellet reaches as the shooter saw them, and how a shot's pellets add up per body.
import { describe, expect, it } from "vitest";
import {
  HitboxHistory,
  loadGameData,
  PawnMode,
  QUERY_STATIC,
  resolveLoadout,
  defaultLoadoutPick,
  shotOnBodies,
  Sim,
  tracePellets,
  traceStatic,
  type Vec3,
} from "../src/index.js";

const data = loadGameData();
const down: Vec3 = [0, -1, 0];

describe("what stops a bullet", () => {
  it("the level does; the invisible ramp over a staircase (a movement helper) doesn't", async () => {
    const sim = await Sim.create("movement_lab");
    // stairs_platform: 12 steps of 0.25 m × 0.3 m from (14, 0, 8) toward −Z. Straight down onto step 6's tread.
    const origin: Vec3 = [14, 10, 8 - 0.3 * 5.5];
    const ray = new sim.R.Ray({ x: origin[0], y: origin[1], z: origin[2] }, { x: 0, y: -1, z: 0 });
    const walking = sim.world.castRay(ray, 20, true, undefined, QUERY_STATIC)!.timeOfImpact;
    const bullet = traceStatic(sim, origin, down, 20)!;
    expect(bullet).toBeCloseTo(10 - 0.25 * 6, 4); // the tread itself
    expect(walking).toBeLessThan(bullet - 0.02); // feet stop on the ramp above it
    // A wall: the lab's outer north wall (face at z = −31.75) stops a level shot.
    expect(traceStatic(sim, [0, 1.5, 0], [0, 0, -1], 100)).toBeCloseTo(31.75, 3);
  });
});

async function lineUp(operators: string[], zs: number[]) {
  const sim = await Sim.create("movement_lab");
  const pawns = operators.map((op, i) => {
    const lo = resolveLoadout(data, defaultLoadoutPick(data, op)).loadout;
    const p = sim.spawnPawn(op, 0, 0, zs[i], 0, null, undefined, lo, 1);
    return p;
  });
  for (let i = 0; i < 40; i++) sim.step(new Map(), new Set(), true); // settle on the floor
  const history = new HitboxHistory(sim, 32);
  for (let i = 0; i < 4; i++) {
    sim.step(new Map(), new Set(), true);
    history.record();
  }
  return { sim, pawns, history, tick: sim.tick - 2 };
}

describe("pellets against bodies (as the shooter saw them)", () => {
  it("penetration: none stops at the first body, full goes through all of them at 70 % each", async () => {
    const { sim, pawns, history, tick } = await lineUp(["sledge", "mute", "pulse"], [4, 6, 8]);
    const torso = pawns[0].state.y + 1.2;
    const origin: Vec3 = [0, torso, 0];
    const along: Vec3[] = [[0, 0, 1]];
    const none = tracePellets(sim, history, origin, along, tick, "none", new Set());
    expect(none[0].hits.map((h) => h.id)).toEqual([pawns[0].id]);
    expect(none[0].end).toBeCloseTo(none[0].hits[0].t, 9);
    const full = tracePellets(sim, history, origin, along, tick, "full", new Set());
    expect(full[0].hits.map((h) => [h.id, h.zone, +h.mult.toFixed(4)])).toEqual([
      [pawns[0].id, "torso", 1],
      [pawns[1].id, "torso", 0.7],
      [pawns[2].id, "torso", 0.49],
    ]);
    // Ignored bodies (the shooter's own, the dead) let it through.
    const past = tracePellets(sim, history, origin, along, tick, "none", new Set([pawns[0].id]));
    expect(past[0].hits[0].id).toBe(pawns[1].id);
  });

  it("a body that left, or came back as a new life with the same id, is not shot where it used to be", async () => {
    const { sim, pawns, history, tick } = await lineUp(["sledge", "mute"], [4, 6]);
    const origin: Vec3 = [0, pawns[0].state.y + 1.2, 0];
    const hitIds = () => tracePellets(sim, history, origin, [[0, 0, 1]], tick, "none", new Set())[0].hits.map((h) => h.id);
    expect(hitIds()).toEqual([pawns[0].id]);
    sim.respawn(pawns[0].id); // same id, a new life: the remembered frames are of the old one
    expect(hitIds()).toEqual([pawns[1].id]);
    sim.removePawn(pawns[1].id);
    expect(hitIds()).toEqual([]);
  });

  it("a shotgun blast adds its pellets up per body; buckshot headshots are ×1.5 per pellet, not a kill", async () => {
    const { sim, pawns, history, tick } = await lineUp(["sledge"], [5]);
    const m590 = resolveLoadout(data, { ...defaultLoadoutPick(data, "sledge"), primary: { weapon: "m590a1", sight: null, barrel: null, grip: null, underbarrel: null } }).loadout.weapons[0];
    const s = pawns[0].state;
    const torso: Vec3 = [0, s.y + 1.2, 0];
    const eight: Vec3[] = Array.from({ length: 8 }, () => [0, 0, 1]);
    const blast = shotOnBodies(data.combat, m590.damage!, tracePellets(sim, history, torso, eight, tick, m590.damage!.penetration, new Set()), () => ({}));
    expect(blast).toHaveLength(1);
    expect(blast[0].pellets).toBe(8);
    expect(blast[0].kill).toBe(false);
    const one = shotOnBodies(data.combat, m590.damage!, tracePellets(sim, history, torso, eight.slice(0, 1), tick, "none", new Set()), () => ({}));
    expect(blast[0].amount).toBe(8 * one[0].amount);
    // At the head: a multiple per pellet (D-047), never an instant kill.
    const head = pawns[0].state.y + 1.62;
    const hb = shotOnBodies(data.combat, m590.damage!, tracePellets(sim, history, [0, head, 0], eight.slice(0, 1), tick, "none", new Set()), () => ({}));
    expect(hb[0].zone).toBe("head");
    expect(hb[0].kill).toBe(false);
    expect(hb[0].amount).toBe(Math.floor(one[0].amount * data.combat.pellet.headMultiplier));
  });
});

describe("damage application", () => {
  it("is ignored by the dead, hurts the living, kills at 0 and stops the body blocking", async () => {
    const { applyDamage } = await import("../src/index.js");
    const { sim, pawns } = await lineUp(["sledge"], [5]);
    const p = pawns[0];
    expect(applyDamage(sim, p, { amount: 30, kill: false })).toEqual({ outcome: "hurt", removed: 30 });
    expect(p.state.hp).toBe(80);
    expect(applyDamage(sim, p, { amount: 500, kill: false })).toEqual({ outcome: "killed", removed: 80 });
    expect(p.state.mode).toBe(PawnMode.Dead);
    expect(applyDamage(sim, p, { amount: 1, kill: true }).outcome).toBe("ignored");
    expect(p.collider.collisionGroups() & 0xffff).toBe(0); // no longer solid
  });
});
