// Aiming, recoil and spread (Phase 3 M5, DECISIONS D-041): how long ADS takes in the simulation, the
// recoil it steps (seeded per body, so a client predicts it exactly), what recoil does to the view, and
// where the server sends the pellets.
import { describe, expect, it } from "vitest";
import {
  adsAccuracy,
  Btn,
  DEG,
  defaultLoadoutPick,
  hashPawnState,
  loadGameData,
  pelletDirections,
  Sim,
  spreadCone,
  Stance,
  viewDir,
  wrapAngle,
  type InputCmd,
  type LoadoutPick,
  type SimEvent,
  type WeaponPick,
} from "../src/index.js";
import { input, run, settle } from "./helpers.js";

const data = loadGameData();
const wp = (weapon: string, o: Partial<WeaponPick> = {}): WeaponPick => ({ weapon, sight: null, barrel: null, grip: null, underbarrel: null, ...o });
const kicks = (events: readonly SimEvent[]) => events.filter((e): e is Extract<SimEvent, { kind: "kick" }> => e.kind === "kick");

/**
 * A body whose client absorbs recoil the way the lab does: unless the test says otherwise, each input
 * carries the view the body ended the last tick with.
 */
async function shooter(operator: string, primary?: WeaponPick, secondary?: WeaponPick) {
  const d = defaultLoadoutPick(data, operator);
  const pick: LoadoutPick = { operator, primary: primary ?? d.primary, secondary: secondary ?? d.secondary, gadgets: d.gadgets };
  const sim = await Sim.create("movement_lab");
  const ctrl = sim.addPlayer("tester", operator, 0, undefined, pick);
  settle(sim, ctrl);
  const pawn = () => sim.pawns.get(ctrl.possessedPawnId)!;
  const s = () => pawn().state;
  const tick = (cmd: Partial<InputCmd> = {}) => {
    sim.step(new Map([[ctrl.id, input({ yaw: s().yaw, pitch: s().pitch, stance: s().stance, ...cmd })]]));
    return sim.events;
  };
  /** Ticks until `done` (at most `max`); returns how many it took. */
  const until = (done: () => boolean, cmd: Partial<InputCmd> = {}, max = 200) => {
    for (let n = 1; n <= max; n++) {
      tick(cmd);
      if (done()) return n;
    }
    return -1;
  };
  return { sim, ctrl, pawn, s, tick, until, weapon: () => pawn().loadout!.weapons[s().slot] };
}

describe("aiming down sights", () => {
  for (const [label, op, pick] of [
    ["iron sight", "sledge", wp("l85a2")],
    ["laser", "sledge", wp("l85a2", { underbarrel: "laser" })],
    ["magnified sight", "sledge", wp("l85a2", { sight: "magnified" })],
    ["shotgun", "sledge", wp("m590a1")],
  ] as const) {
    it(`${pick.weapon}, ${label}: full after the weapon's ADS ticks, ×1.1 out of a sprint, out again in 0.25 s`, async () => {
      const g = await shooter(op, pick);
      const w = g.weapon();
      expect(g.until(() => g.s().adsQ === 65535, { buttons: Btn.Ads })).toBe(w.ads.ticks);
      expect(g.until(() => g.s().adsQ === 0)).toBe(w.ads.exitTicks);
      expect(w.ads.exitTicks).toBe(16);
      // Sprinting, then aiming: the sprint ends that tick and the sights come up 10% slower.
      g.until(() => g.s().sprinting, { forward: 1, buttons: Btn.Sprint });
      run(g.sim, g.ctrl, { forward: 1, buttons: Btn.Sprint }, 0.5);
      expect(g.until(() => g.s().adsQ === 65535, { forward: 1, buttons: Btn.Sprint | Btn.Ads })).toBe(w.ads.fromSprintTicks);
      expect(g.s().sprinting).toBe(false);
      expect(w.ads.fromSprintTicks).toBeGreaterThan(w.ads.ticks);
    });
  }

  it("the spread cone narrows along the class's ADS curve and widens with speed (buckshot)", async () => {
    const g = await shooter("sledge", wp("m590a1"));
    const w = g.weapon();
    const s = g.s();
    expect(spreadCone(w, { ...s, adsQ: 0, vx: 0, vz: 0 })).toBeCloseTo(w.spread.hip, 9);
    expect(spreadCone(w, { ...s, adsQ: 65535, vx: 0, vz: 0 })).toBeCloseTo(w.spread.ads, 9);
    const mid = spreadCone(w, { ...s, adsQ: 32768, vx: 0, vz: 0 });
    expect(mid).toBeCloseTo(w.spread.hip + (w.spread.ads - w.spread.hip) * adsAccuracy(w, 32768), 9);
    expect(spreadCone(w, { ...s, adsQ: 0, vx: 3, vz: 4 })).toBeCloseTo(w.spread.hip + 5 * w.spread.perMps, 9);
    expect(w.spread.perMps).toBeGreaterThan(0);
  });

  it("a long drop takes the sights down (Siege X); landing lets them come back up", async () => {
    const g = await shooter("sledge");
    g.sim.teleport(g.pawn().id, 0, 4, 12, 0, Stance.Stand); // open floor below
    const fall: [number, number][] = [];
    while (!g.s().grounded && fall.length < 200) {
      g.tick({ buttons: Btn.Ads });
      if (!g.s().grounded) fall.push([g.s().airPeakY - g.s().y, g.s().adsQ]);
    }
    const limit = data.gunplay.rules.adsDropCancelM;
    const early = fall.filter(([drop]) => drop <= limit - 0.05);
    const late = fall.filter(([drop]) => drop > limit + 0.05);
    expect(early.length).toBeGreaterThan(2);
    expect(late.length).toBeGreaterThan(2);
    expect(early.at(-1)![1]).toBeGreaterThan(early[0][1]); // aiming while the drop is short
    expect(late.at(-1)![1]).toBeLessThan(late[0][1]); // forced out once it's long
    expect(g.until(() => g.s().adsQ === 65535, { buttons: Btn.Ads })).toBeGreaterThan(0);
  });
});

describe("recoil (stepped in the simulation, D-041)", () => {
  it("a spray climbs the view the same way in two sims, whatever their tick counters say", async () => {
    const one = await shooter("sledge");
    const two = await shooter("sledge");
    two.sim.tick += 777;
    const start = one.s().pitch;
    for (let i = 0; i < 160; i++) {
      one.tick({ buttons: Btn.Fire | (i > 100 ? Btn.Reload : 0) });
      two.tick({ buttons: Btn.Fire | (i > 100 ? Btn.Reload : 0) });
      expect(hashPawnState(two.s()), `tick ${i}`).toBe(hashPawnState(one.s()));
    }
    expect((one.s().pitch - start) / DEG).toBeGreaterThan(3);
    expect(one.s().yaw).not.toBe(0); // and it wanders sideways
  });

  it("each kick event is exactly the view change recoil made that tick", async () => {
    const g = await shooter("sledge");
    let total = 0;
    for (let i = 0; i < 120; i++) {
      const before = { yaw: g.s().yaw, pitch: g.s().pitch };
      const ks = kicks(g.tick({ buttons: i < 60 ? Btn.Fire : 0 })).filter((k) => k.pawnId === g.pawn().id);
      expect(ks.length).toBeLessThanOrEqual(1);
      const k = ks[0] ?? { dYaw: 0, dPitch: 0 };
      expect(wrapAngle(g.s().yaw - before.yaw)).toBeCloseTo(k.dYaw, 6);
      expect(g.s().pitch - before.pitch).toBeCloseTo(k.dPitch, 6);
      total += Math.abs(k.dPitch);
    }
    expect(total).toBeGreaterThan(0);
  });

  it("the pitch limit drops the excess instead of saving it up", async () => {
    const g = await shooter("sledge");
    const max = data.movement.look.pitchMaxDeg * DEG;
    const start = max - 0.2 * DEG;
    let applied = 0;
    for (let i = 0; i < 64; i++) {
      for (const k of kicks(g.tick({ buttons: Btn.Fire, pitch: i === 0 ? start : g.s().pitch }))) applied += k.dPitch;
      expect(g.s().pitch).toBeLessThanOrEqual(max + 1e-6);
    }
    expect(applied).toBeLessThanOrEqual(0.2 * DEG + 1e-6);
    expect(g.s().recoilPendP).toBeLessThan(data.gunplay.recoilTemplates.assault_rifle.cameraUpDegPerS * DEG); // not piling up
    // Lowering the view afterwards isn't fought by stored-up kick.
    g.tick({ pitch: 0 });
    g.tick();
    expect(g.s().pitch).toBeCloseTo(0, 6);
  });

  it("lying against a wall, a sideways kick that would swing the body into it is dropped", async () => {
    const g = await shooter("sledge");
    g.sim.teleport(g.pawn().id, -1, 0, -31, 0, Stance.Prone); // facing wall_n (face at z = -31.75)
    run(g.sim, g.ctrl, { forward: 1, stance: Stance.Prone }, 2);
    const yaw = g.s().yaw;
    let climbed = 0;
    for (let i = 0; i < 64; i++) {
      for (const k of kicks(g.tick({ buttons: Btn.Fire, stance: Stance.Prone }))) {
        expect(k.dYaw).toBe(0);
        climbed += k.dPitch;
      }
    }
    expect(g.s().yaw).toBe(yaw);
    expect(climbed).toBeGreaterThan(0);
    expect(g.s().pitch).toBeLessThanOrEqual(data.movement.stance.pronePitchMaxDeg * DEG + 1e-6);
  });

  it("Reaper MK2: the kick changes stage at bullets 3, 10 and 25 (official Y11S2.3)", async () => {
    const g = await shooter("sledge", undefined, wp("reaper_mk2"));
    g.tick({ buttons: Btn.Swap });
    g.until(() => g.s().wAct === 0);
    const w = g.weapon();
    expect(w.id).toBe("reaper_mk2");
    expect(w.recoil.stages.map((st) => st.fromShot)).toEqual([0, 3, 10, 25]);
    // Mark each stage with its own jitter-free kick, then read back which stage every bullet used.
    w.recoil.stages.forEach((st, i) => Object.assign(st, { up: (i + 1) * 1e-3, upJitter: 0, side: 0, sideJitter: 0 }));
    const used: number[] = [];
    for (let i = 0; i < 200 && used.length < 30; i++) {
      const ev = g.tick({ buttons: Btn.Fire });
      if (ev.some((e) => e.kind === "shot")) used.push(Math.round(kicks(ev)[0].dPitch / 1e-3) - 1);
    }
    expect(used).toEqual(Array.from({ length: 30 }, (_, n) => (n < 3 ? 0 : n < 10 ? 1 : n < 25 ? 2 : 3)));
  });
});

describe("spread (server-only pellets, D-041)", () => {
  const cone = 4 * DEG;
  const angle = (a: number[], b: number[]) => Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));

  it("pellets are a pure function of (seed, controller, input, pellet) and stay inside the cone", () => {
    const a = pelletDirections(1234, 7, 99, 8, 0.3, -0.1, cone);
    expect(pelletDirections(1234, 7, 99, 8, 0.3, -0.1, cone)).toEqual(a);
    expect(pelletDirections(1235, 7, 99, 8, 0.3, -0.1, cone)).not.toEqual(a);
    expect(pelletDirections(1234, 7, 100, 8, 0.3, -0.1, cone)).not.toEqual(a);
    const f = viewDir(0.3, -0.1);
    for (const d of a) {
      expect(Math.hypot(...d)).toBeCloseTo(1, 9);
      expect(angle(d, f)).toBeLessThanOrEqual(cone + 1e-9);
    }
    expect(pelletDirections(1234, 7, 99, 3, 0.3, -0.1, 0)).toEqual([f, f, f]);
  });

  it("they cover the cone evenly: mean angle 2/3 of it, as often left as right, up as down", () => {
    const yaw = -1.2;
    const pitch = 0.4;
    const f = viewDir(yaw, pitch);
    const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    let sum = 0;
    let rightN = 0;
    let upN = 0;
    const n = 4000;
    for (let seq = 0; seq < n; seq++) {
      const d = pelletDirections(42, 3, seq, 1, yaw, pitch, cone)[0];
      sum += angle(d, f);
      if (d[0] * right[0] + d[2] * right[2] > 0) rightN++;
      if (d[1] > f[1]) upN++;
    }
    expect(sum / n / cone).toBeCloseTo(2 / 3, 1);
    expect(Math.abs(rightN / n - 0.5)).toBeLessThan(0.03);
    expect(Math.abs(upN / n - 0.5)).toBeLessThan(0.03);
  });
});
