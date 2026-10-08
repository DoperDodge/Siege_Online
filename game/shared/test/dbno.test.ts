// Down but not out and reviving (Phase 3 M7; DECISIONS D-048, D-049; research/core_mechanics.md §10):
// when 0 HP downs or kills, bleeding, crawling, the downed body against walls, ladders and vaults, and
// reviving in the simulation (the room-level side is in combat.test.ts).
import { describe, expect, it } from "vitest";
import {
  applyDamage,
  bleedTick,
  Btn,
  Cause,
  DT,
  initialPawnState,
  isDowned,
  loadGameData,
  PawnMode,
  proneWeight,
  Sim,
  Stance,
  ticks,
  type InputCmd,
  type Pawn,
  type PlayerController,
} from "../src/index.js";
import { bodyOverlaps, input } from "./helpers.js";

const data = loadGameData();
const dbno = data.combat.dbno;
type Cmd = Partial<InputCmd> & { yawDeg?: number };

/** Players in one sim, each with its own input each tick. */
async function world(players: { op?: string; team?: number; at: [number, number, number]; yawDeg?: number }[]) {
  const sim = await Sim.create("movement_lab");
  const ctrls = players.map((p, i) => sim.addPlayer(`p${i}`, p.op ?? "sledge", 0, undefined, undefined, p.team ?? 0));
  const pawn = (c: PlayerController) => sim.pawns.get(c.possessedPawnId)!;
  const step = (cmds: Cmd[] = [], n = 1) => {
    for (let k = 0; k < n; k++) sim.step(new Map(ctrls.map((c, i) => [c.id, input({ yaw: pawn(c).state.yaw, stance: pawn(c).state.stance, ...cmds[i] })])));
  };
  players.forEach((p, i) => sim.teleport(ctrls[i].possessedPawnId, ...p.at, p.yawDeg ?? 0));
  step([], 30);
  return { sim, ctrls, pawn, step };
}

const down = (sim: Sim, p: Pawn) => applyDamage(sim, p, { amount: p.state.hp, kill: false, cause: Cause.Bullet });

describe("health at 0: down or dead (core_mechanics.md §10.1)", () => {
  it("down the first time; dead on a headshot, a lethal cause, a second down or overkill past 20", async () => {
    const w = await world([{ at: [0, 0, 12] }, { at: [4, 0, 12] }]);
    const p = w.pawn(w.ctrls[0]);
    const fresh = () => w.sim.respawn(p.id);
    expect(applyDamage(w.sim, p, { amount: 110, kill: false })).toEqual({ outcome: "downed", removed: 110 });
    expect([p.state.mode, p.state.hp, p.state.downHp, p.state.downs, p.state.invulnTicks]).toEqual([PawnMode.Downed, 0, 20, 1, ticks(dbno.invulnSeconds)]);
    // Overkill: 20 past the health left still downs, 21 kills (placeholder rule).
    fresh();
    expect(applyDamage(w.sim, p, { amount: 130, kill: false }).outcome).toBe("downed");
    fresh();
    expect(applyDamage(w.sim, p, { amount: 131, kill: false }).outcome).toBe("killed");
    fresh();
    expect(applyDamage(w.sim, p, { amount: 0, kill: true }).outcome).toBe("killed"); // headshot
    for (const cause of [Cause.Fall, Cause.Explosive]) {
      fresh();
      expect(applyDamage(w.sim, p, { amount: 200, kill: false, cause }).outcome).toBe("killed");
    }
    fresh();
    expect(applyDamage(w.sim, p, { amount: 999, kill: false, cause: Cause.Melee }).outcome).toBe("killed"); // the knife never downs
    fresh();
    p.state.downs = 1; // already went down once
    expect(applyDamage(w.sim, p, { amount: 110, kill: false }).outcome).toBe("killed");
  });

  it("Skopós has no DBNO; the last one up dies when the mode says so", async () => {
    const w = await world([{ op: "skopos", at: [0, 0, 12] }, { at: [4, 0, 12] }, { at: [-4, 0, 12], team: 1 }]);
    const sk = w.pawn(w.ctrls[0]);
    expect(applyDamage(w.sim, sk, { amount: sk.state.hp, kill: false }).outcome).toBe("killed");
    const a = w.pawn(w.ctrls[1]);
    const enemy = w.pawn(w.ctrls[2]);
    // a's only teammate (Skopós) is dead: last one up.
    expect(applyDamage(w.sim, a, { amount: 110, kill: false }, { lastAliveDies: true }).outcome).toBe("killed");
    // The enemy's side has nobody else either, but the rule is off: down.
    expect(applyDamage(w.sim, enemy, { amount: 110, kill: false }, { lastAliveDies: false }).outcome).toBe("downed");
  });

  it("down: a moment of invulnerability, then the 20 HP pool; a headshot or the knife finishes it", async () => {
    const w = await world([{ at: [0, 0, 12] }]);
    const p = w.pawn(w.ctrls[0]);
    down(w.sim, p);
    expect(applyDamage(w.sim, p, { amount: 5, kill: false }).outcome).toBe("ignored");
    w.step([], ticks(dbno.invulnSeconds));
    expect(applyDamage(w.sim, p, { amount: 5, kill: false })).toEqual({ outcome: "hurt", removed: 5 });
    expect(p.state.downHp).toBeLessThan(15);
    expect(applyDamage(w.sim, p, { amount: 0, kill: true }).outcome).toBe("killed");
    w.sim.respawn(p.id);
    down(w.sim, p);
    w.step([], 30);
    expect(applyDamage(w.sim, p, { amount: 1, kill: false, cause: Cause.Melee }).outcome).toBe("killed");
  });
});

describe("down but not out (core_mechanics.md §10.2)", () => {
  it("lies down, bleeds out after exactly the reference number of ticks lying still, and can't fire", async () => {
    const w = await world([{ at: [0, 0, 12] }]);
    const p = w.pawn(w.ctrls[0]);
    down(w.sim, p);
    let ref = dbno.hp;
    let n = 0;
    while (ref > 0) {
      ref = Math.fround(ref - (dbno.hp * DT) / dbno.bleedStillSeconds);
      n++;
    }
    let t = 0;
    const shotsBefore = p.state.loaded0;
    while (p.state.mode === PawnMode.Downed && t < 10000) {
      w.step([{ buttons: Btn.Fire | Btn.Ads, stance: Stance.Stand }]);
      t++;
    }
    expect(t).toBe(n);
    expect(p.state.mode).toBe(PawnMode.Dead);
    expect(p.state.loaded0).toBe(shotsBefore);
    expect(n / 64).toBeCloseTo(dbno.bleedStillSeconds, 0);
  });

  it("crawls no faster than the crawl speed and bleeds twice as fast doing it; a revive in progress stops both", async () => {
    const w = await world([{ at: [-20, 0, 26], yawDeg: -90 }]);
    const p = w.pawn(w.ctrls[0]);
    down(w.sim, p);
    w.step([], 80); // lie down
    expect(p.state.stance).toBe(Stance.Prone);
    const hp0 = p.state.downHp;
    const x0 = p.state.x;
    let fastest = 0;
    for (let i = 0; i < 128; i++) {
      w.step([{ forward: 1, buttons: Btn.Sprint }]);
      fastest = Math.max(fastest, Math.hypot(p.state.vx, p.state.vz));
    }
    expect(fastest).toBeLessThanOrEqual(dbno.crawlSpeed + 1e-6);
    expect(p.state.x - x0).toBeGreaterThan(0.8); // it did crawl (+X)
    const lost = hp0 - p.state.downHp;
    expect(lost).toBeGreaterThan(1.8 * ((dbno.hp * 2) / dbno.bleedStillSeconds)); // ~2 s at the fast rate
    // Someone reviving: the body holds still and stops bleeding.
    p.state.revivedBy = 999;
    const held = { hp: p.state.downHp, x: p.state.x };
    w.step([{ forward: 1 }], 32);
    expect(p.state.downHp).toBe(held.hp);
    expect(Math.abs(p.state.x - held.x)).toBeLessThan(0.05);
  });

  it("a bleed tick is the same float32 sum on every machine", () => {
    const s = initialPawnState(0, 0, 0, 0, 100);
    s.mode = PawnMode.Downed;
    s.downHp = dbno.hp;
    let ref = dbno.hp;
    for (let i = 0; i < 100; i++) {
      bleedTick(data.combat, s, i % 3 === 0);
      ref = Math.fround(ref - (dbno.hp * DT) / (i % 3 === 0 ? dbno.bleedMovingSeconds : dbno.bleedStillSeconds));
      expect(s.downHp).toBe(ref);
    }
  });

  it("crawling into a wall never puts the downed body or its eye inside it", async () => {
    const w = await world([{ at: [-1, 0, -29], yawDeg: 10 }]);
    const p = w.pawn(w.ctrls[0]);
    down(w.sim, p);
    const seen = new Set<string>();
    for (let i = 0; i < 64 * 6; i++) {
      w.step([{ forward: 1, yawDeg: 10 }]);
      if (p.state.stance === Stance.Prone && p.state.stanceT >= 1) for (const part of bodyOverlaps(w.sim, p)) seen.add(part);
    }
    expect([...seen]).toEqual([]);
    expect(p.state.z).toBeLessThan(-30.2); // it reached the wall
  });

  it("downed on the stairs: lies down along them and crawls up and down without sinking into a step", async () => {
    const w = await world([{ at: [14, 1.5, 6.35], yawDeg: 0 }]); // on step 6 of stairs_platform (tread z 6.2–6.5, top 1.5 m)
    const p = w.pawn(w.ctrls[0]);
    down(w.sim, p);
    let lying = 0;
    for (let i = 0; i < 64 * 3; i++) {
      w.step([{ forward: i % 128 < 64 ? 1 : -1 }]);
      if (proneWeight(p.state) < 1) continue; // (standing or crouching, legs touch the step ahead; prone.test.ts checks the same way)
      lying++;
      expect(bodyOverlaps(w.sim, p, 0.05), `tick ${i}`).toEqual([]);
    }
    expect(lying).toBeGreaterThan(100);
    expect(isDowned(p.state)).toBe(true);
  });

  it("downed on a ladder lets go and falls; downed mid-vault finishes the vault, then lies down", async () => {
    const w = await world([{ at: [-16, 0, -5.8], yawDeg: 0 }]);
    const p = w.pawn(w.ctrls[0]);
    w.step([{ buttons: Btn.Interact }]);
    w.step([{ forward: 1 }], 64);
    expect(p.state.mode).toBe(PawnMode.Ladder);
    expect(p.state.y).toBeGreaterThan(1);
    down(w.sim, p);
    expect([p.state.mode, p.state.ladder]).toEqual([PawnMode.Downed, -1]);
    w.step([], 64);
    expect(p.state.y).toBeLessThan(0.1);
    expect(p.state.mode).toBe(PawnMode.Downed);

    const v = await world([{ at: [-6, 0, 3] }]); // in front of the 0.5 m vault-over
    const q = v.pawn(v.ctrls[0]);
    for (let i = 0; i < 64 && q.state.mode !== PawnMode.Vault; i++) v.step([{ buttons: Btn.Vault }]);
    expect(q.state.mode).toBe(PawnMode.Vault);
    down(v.sim, q);
    expect(q.state.mode).toBe(PawnMode.Vault); // the vault carries on...
    expect(isDowned(q.state)).toBe(true);
    v.step([], 64);
    expect(q.state.mode).toBe(PawnMode.Downed); // ...and then the body is down where it landed
  });
});

describe("reviving (DECISIONS D-049)", () => {
  /** B lies down at (0, 0, 12); A stands 0.8 m to its +X side, facing it. */
  async function scene(extra: { team?: number; at: [number, number, number]; yawDeg?: number }[] = [], aTeam = 0) {
    const w = await world([{ at: [0.8, 0, 12], yawDeg: 90, team: aTeam }, { at: [0, 0, 12] }, ...extra]);
    const [a, b] = [w.pawn(w.ctrls[0]), w.pawn(w.ctrls[1])];
    down(w.sim, b);
    w.step([], 80);
    return { ...w, a, b };
  }

  it("holding Interact for 256 ticks picks them up with 20 HP; letting go at 255 doesn't", async () => {
    const s = await scene();
    expect(s.sim.prompt(s.ctrls[0].id)).toBe("revive");
    const hold = (n: number) => {
      for (let i = 0; i < n; i++) s.step([{ buttons: Btn.Interact }]);
    };
    hold(255);
    expect(s.a.state.reviveTarget).toBe(s.b.id);
    expect(s.b.state.revivedBy).toBe(s.a.id);
    const pool = s.b.state.downHp;
    s.step([]); // let go
    expect([s.a.state.reviveTarget, s.b.state.revivedBy, s.b.state.mode]).toEqual([0, 0, PawnMode.Downed]);
    s.step([]);
    expect(s.b.state.downHp).toBeLessThan(pool); // bleeding again
    hold(256);
    expect([s.b.state.mode, s.b.state.hp, s.b.state.downHp, s.b.state.revivedBy]).toEqual([PawnMode.Walk, data.combat.revive.revivedHp, 0, 0]);
    expect([s.a.state.reviveTarget, s.a.state.reviveTicks]).toEqual([0, 0]);
    // Still holding the key afterwards is not a fresh press (no ladder grab, no second revive).
    expect(s.a.state.prevButtons & Btn.Interact).toBe(Btn.Interact);
    // A second down kills.
    expect(applyDamage(s.sim, s.b, { amount: 20, kill: false }).outcome).toBe("killed");
  });

  it("the reviver can't move or shoot while reviving, and the downed body stops bleeding", async () => {
    const s = await scene();
    s.step([{ buttons: Btn.Interact }]);
    const at = { x: s.a.state.x, z: s.a.state.z, hp: s.b.state.downHp, ammo: s.a.state.loaded0 };
    s.step([{ buttons: Btn.Interact | Btn.Fire, forward: 1, strafe: 1 }], 64);
    expect(Math.hypot(s.a.state.x - at.x, s.a.state.z - at.z)).toBeLessThan(0.01);
    expect(s.a.state.loaded0).toBe(at.ammo);
    expect(s.b.state.downHp).toBe(at.hp);
  });

  it("an enemy can't revive, and nobody joins a revive already under way", async () => {
    const enemy = await scene([], 1);
    enemy.step([{ buttons: Btn.Interact }], 20);
    expect(enemy.b.state.revivedBy).toBe(0);
    expect(enemy.sim.prompt(enemy.ctrls[0].id)).not.toBe("revive");
    const two = await scene([{ at: [-0.8, 0, 12], yawDeg: -90 }]);
    const c = two.pawn(two.ctrls[2]);
    two.step([{ buttons: Btn.Interact }]);
    two.step([{ buttons: Btn.Interact }, {}, { buttons: Btn.Interact }], 20);
    expect(two.b.state.revivedBy).toBe(two.a.id);
    expect(c.state.reviveTarget).toBe(0);
  });

  it("a reviver its player's buttons don't reach lets go: a tick without input, or Skopós opening her shell camera", async () => {
    // No input (the server steps a stalled body without input once its hold budget is spent).
    const s = await scene();
    s.step([{ buttons: Btn.Interact }], 10);
    expect(s.b.state.revivedBy).toBe(s.a.id);
    const onlyB = () => new Map([[s.ctrls[1].id, input({ yaw: s.b.state.yaw, stance: s.b.state.stance })]]);
    s.sim.step(onlyB());
    expect([s.a.state.reviveTarget, s.a.state.reviveTicks, s.b.state.revivedBy]).toEqual([0, 0, 0]);
    const pool = s.b.state.downHp;
    s.sim.step(onlyB());
    expect(s.b.state.downHp).toBeLessThan(pool); // bleeding again
    // Skopós: on her other shell's camera her keys drive the camera, not the body that was reviving.
    const k = await world([{ op: "skopos", at: [0.8, 0, 12], yawDeg: 90 }, { at: [0, 0, 12] }]);
    const [sa, sb] = [k.pawn(k.ctrls[0]), k.pawn(k.ctrls[1])];
    down(k.sim, sb);
    k.step([], 80);
    k.step([{ buttons: Btn.Interact }], 10);
    expect(sb.state.revivedBy).toBe(sa.id);
    k.step([{ buttons: Btn.Ability }]); // the camera opens
    expect(k.ctrls[0].shellCam).toBe(true);
    expect([sa.state.reviveTarget, sa.state.reviveTicks, sb.state.revivedBy]).toEqual([0, 0, 0]);
    k.step([{ buttons: 0 }], 2);
    k.step([{ buttons: Btn.Ability }]); // back in the body: the revive starts over, it doesn't carry on
    k.step([{ buttons: Btn.Interact }]);
    expect(sa.state.reviveTicks).toBe(1);
  });

  it("a downed body jumped back up by a teleport starts a new life: its next lethal hit downs it again", async () => {
    const s = await scene();
    const life = s.b.life;
    s.sim.teleport(s.b.id, 5, 0, 5, 0);
    expect([s.b.state.mode, s.b.state.downs, s.b.state.hp, s.b.life]).toEqual([PawnMode.Walk, 0, s.b.state.maxHp, life + 1]);
    expect(down(s.sim, s.b).outcome).toBe("downed");
  });

  it("turning away or a teleport ends a revive on both sides", async () => {
    const s = await scene();
    s.step([{ buttons: Btn.Interact }], 10);
    s.step([{ buttons: Btn.Interact, yaw: -Math.PI / 2 }], 2); // facing away (checked against the view a tick old)
    expect([s.a.state.reviveTarget, s.b.state.revivedBy]).toEqual([0, 0]);
    s.step([{ buttons: 0, yaw: Math.PI / 2 }], 2); // facing them again
    s.step([{ buttons: Btn.Interact }], 10);
    expect(s.b.state.revivedBy).toBe(s.a.id);
    s.sim.teleport(s.b.id, 5, 0, 5, 0);
    expect([s.a.state.reviveTarget, s.b.state.revivedBy, s.b.state.mode]).toEqual([0, 0, PawnMode.Walk]);
  });
});
