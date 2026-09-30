// Lag-compensation framework (Phase 2): hitbox history, rewinding, and ray tests.
import { describe, expect, it } from "vitest";
import { HitboxHistory, initRapier, poseHitboxes, quatFromTo, rayCapsule, Stance, type Hitbox, type Vec3 } from "../src/index.js";
import { labWith, run } from "./helpers.js";

describe("rayCapsule", () => {
  it("matches hand-worked cases", () => {
    const a: Vec3 = [0, 0, 0];
    const b: Vec3 = [0, 1, 0];
    expect(rayCapsule([-5, 0.5, 0], [1, 0, 0], a, b, 0.5)).toBeCloseTo(4.5, 9); // side
    expect(rayCapsule([0, 5, 0], [0, -1, 0], a, b, 0.5)).toBeCloseTo(3.5, 9); // top cap
    expect(rayCapsule([0, -5, 0], [0, 1, 0], a, b, 0.5)).toBeCloseTo(4.5, 9); // bottom cap
    expect(rayCapsule([-5, 0.5, 2], [1, 0, 0], a, b, 0.5)).toBeNull(); // passes beside it
    expect(rayCapsule([5, 0.5, 0], [1, 0, 0], a, b, 0.5)).toBeNull(); // pointing away
    expect(rayCapsule([0.1, 0.5, 0], [1, 0, 0], a, b, 0.5)).toBe(0); // starts inside
    expect(rayCapsule([-5, 2, 0], [1, 0, 0], a, a, 0.5)).toBeNull(); // sphere (a === b), missed
  });

  it("agrees with Rapier's own raycast on 500 random rays", async () => {
    const R = await initRapier();
    const world = new R.World({ x: 0, y: 0, z: 0 });
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
    let hits = 0;
    for (let i = 0; i < 500; i++) {
      const a: Vec3 = [rnd(), rnd(), rnd()];
      const b: Vec3 = [a[0] + rnd() * 0.6, a[1] + rnd() * 0.6, a[2] + rnd() * 0.6];
      const r = 0.05 + Math.abs(rnd()) * 0.2;
      const o: Vec3 = [rnd() * 4, rnd() * 4, rnd() * 4];
      const tgt: Vec3 = [(a[0] + b[0]) / 2 + rnd() * 0.4, (a[1] + b[1]) / 2 + rnd() * 0.4, (a[2] + b[2]) / 2 + rnd() * 0.4];
      const len = Math.hypot(tgt[0] - o[0], tgt[1] - o[1], tgt[2] - o[2]);
      const d: Vec3 = [(tgt[0] - o[0]) / len, (tgt[1] - o[1]) / len, (tgt[2] - o[2]) / len];
      const seg: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const sl = Math.hypot(...seg);
      const q = quatFromTo([0, 1, 0], [seg[0] / sl, seg[1] / sl, seg[2] / sl]);
      const col = world.createCollider(
        R.ColliderDesc.capsule(sl / 2, r)
          .setTranslation((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
          .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }),
      );
      const ref = col.castRay(new R.Ray({ x: o[0], y: o[1], z: o[2] }, { x: d[0], y: d[1], z: d[2] }), 100, true);
      const ours = rayCapsule(o, d, a, b, r);
      world.removeCollider(col, false);
      if (ref < 0) expect(ours, `ray ${i}`).toBeNull();
      else {
        hits++;
        expect(ours, `ray ${i}`).not.toBeNull();
        expect(Math.abs(ours! - ref), `ray ${i}`).toBeLessThan(1e-4); // Rapier works in float32
      }
    }
    expect(hits).toBeGreaterThan(100); // both hits and misses were exercised
  });
});

describe("HitboxHistory", () => {
  const same = (x: Hitbox[], y: Hitbox[]) => {
    expect(x.map((h) => h.part)).toEqual(y.map((h) => h.part));
    x.forEach((h, i) => {
      for (let k = 0; k < 3; k++) {
        expect(h.a[k]).toBeCloseTo(y[i].a[k], 9);
        expect(h.b[k]).toBeCloseTo(y[i].b[k], 9);
      }
    });
  };

  it("rewinds to the exact pose of a past tick (stance and lean included) and interpolates between ticks", async () => {
    const { sim, ctrl, pawn } = await labWith();
    const hist = new HitboxHistory(64);
    const poses = new Map<number, Hitbox[]>();
    for (let i = 0; i < 100; i++) {
      run(sim, ctrl, { forward: 1, lean: i > 30 ? 1 : 0, stance: i > 60 ? Stance.Crouch : Stance.Stand, yawDeg: i }, 1 / 64);
      hist.record(sim);
      poses.set(sim.tick, poseHitboxes(sim.data.movement, sim.data.hitboxes, pawn.state));
    }
    const now = sim.tick;
    expect(hist.range).toEqual({ oldest: now - 63, newest: now });
    for (const back of [0, 1, 20, 63]) same(hist.at(now - back).get(pawn.id)!, poses.get(now - back)!);
    same(hist.at(now - 63.5).get(pawn.id)!, poses.get(now - 63)!); // just past the oldest frame: clamps to it
    expect(hist.at(now - 80).size).toBe(0); // far older than the buffer: nothing
    const mid = hist.at(now - 10.5).get(pawn.id)!;
    const p0 = poses.get(now - 11)!;
    const p1 = poses.get(now - 10)!;
    expect(mid[0].a[2]).toBeCloseTo((p0[0].a[2] + p1[0].a[2]) / 2, 9);
  });

  it("a shot aimed where a moving target was hits only when rewound, and the rewind is capped", async () => {
    const { sim, ctrl, pawn } = await labWith();
    const hist = new HitboxHistory(64);
    const heads = new Map<number, Vec3>();
    for (let i = 0; i < 64; i++) {
      run(sim, ctrl, { strafe: 1 }, 1 / 64); // walking sideways at 3 m/s
      hist.record(sim);
      heads.set(sim.tick, poseHitboxes(sim.data.movement, sim.data.hitboxes, pawn.state).find((h) => h.part === "head")!.a);
    }
    const now = sim.tick;
    const shoot = (back: number, maxRewind = 12.8) => {
      const h = heads.get(now - back)!;
      const origin: Vec3 = [h[0], h[1], h[2] + 10]; // from 10 m behind (+Z), aiming straight at that head
      return hist.raycast(origin, [0, 0, -1], 50, now - back, now, maxRewind);
    };
    expect(shoot(0)?.part).toBe("head");
    expect(shoot(6)?.part).toBe("head"); // ~94 ms ago: rewound, still a headshot
    expect(shoot(6, 0)?.part).not.toBe("head"); // without rewind the target has moved ~0.28 m on
    expect(shoot(20)?.part).not.toBe("head"); // 312 ms ago: beyond the 200 ms cap, so no rewind that far
    expect(hist.raycast([0, 1.6, 30], [0, 0, -1], 50, now, now, 12.8, new Set([pawn.id]))).toBeNull(); // shooter ignored
  });
});
