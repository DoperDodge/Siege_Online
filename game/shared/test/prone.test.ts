// The lying-down body (second adversarial review): it must never put the camera or a hitbox inside a
// wall, and it must lie on ramps and stairs in every direction.
import { describe, expect, it } from "vitest";
import { DEG, proneWeight, Stance, type InputCmd } from "../src/index.js";
import { bodyOverlaps, labWith, run, teleport } from "./helpers.js";

type Lab = Awaited<ReturnType<typeof labWith>>;

/** Run `seconds` of input; returns every overlap seen while fully prone (hitbox part or "eye"). */
function runChecked(lab: Lab, cmd: Partial<InputCmd> & { yawDeg?: number }, seconds: number, whenUpright = false): string[] {
  const seen = new Set<string>();
  for (let i = 0; i < Math.round(seconds * 64); i++) {
    run(lab.sim, lab.ctrl, cmd, 1 / 64);
    if (whenUpright || proneWeight(lab.pawn.state) === 1) for (const p of bodyOverlaps(lab.sim, lab.pawn)) seen.add(p);
  }
  return [...seen];
}

describe("prone body: walls", () => {
  // wall_n's face is at z = -31.75; wall_w's face is at x = -31.75.
  const cases: [string, number, Partial<InputCmd>][] = [
    ["crawling in at 10°", 10, { forward: 1 }],
    ["crawling in at 45°", 45, { forward: 1 }],
    ["backing in at 200°", 200, { forward: -1 }],
    ["backing in at 225°", 225, { forward: -1 }],
  ];
  for (const [name, yaw, cmd] of cases) {
    it(`${name}: nothing ends up inside the wall`, async () => {
      const lab = await labWith();
      teleport(lab.sim, lab.ctrl, -1, 0, -29, yaw, Stance.Prone);
      expect(runChecked(lab, { ...cmd, stance: Stance.Prone, yawDeg: yaw }, 8)).toEqual([]);
      expect(lab.pawn.state.z).toBeLessThan(-30.3); // it really got to the wall
    });
  }

  it("strafing into a wall stops the body at it, and you can still stand up there", async () => {
    const lab = await labWith();
    teleport(lab.sim, lab.ctrl, -29.5, 0, 3, 0, Stance.Prone);
    expect(runChecked(lab, { strafe: -1, stance: Stance.Prone }, 8)).toEqual([]);
    expect(lab.pawn.state.x).toBeLessThan(-31.2);
    run(lab.sim, lab.ctrl, { stance: Stance.Stand }, 1.5);
    expect(lab.pawn.state.stance).toBe(Stance.Stand);
    expect(lab.pawn.state.stanceT).toBe(1);
  });

  it("leaning while prone stops the arms at a wall", async () => {
    const lab = await labWith();
    // Facing -X beside sample_soft (z 16.9..17.1): your right side is toward the wall.
    teleport(lab.sim, lab.ctrl, -4.5, 0, 17.45, 90, Stance.Prone);
    expect(runChecked(lab, { stance: Stance.Prone, yawDeg: 90, lean: 1 }, 1)).toEqual([]);
    expect(lab.pawn.state.lean).toBeLessThan(0.5);
    run(lab.sim, lab.ctrl, { stance: Stance.Prone, yawDeg: 90, lean: -1 }, 1);
    expect(lab.pawn.state.lean).toBe(-1); // nothing on the left
  });

  it("turning while getting up next to a wall stays out of it (prone limits last until you're up)", async () => {
    const lab = await labWith();
    teleport(lab.sim, lab.ctrl, -4.5, 0, 17.95, 0, Stance.Prone);
    run(lab.sim, lab.ctrl, { forward: 1, stance: Stance.Prone }, 3); // head against sample_soft
    expect(runChecked(lab, { stance: Stance.Stand, yawDeg: 90 }, 1.5, true)).toEqual([]);
  });

  it("you can't go prone where the body would reach into a box", async () => {
    for (const z of [6.65, 6.8]) {
      // vault_050's face is at z = 6.2; facing it, the head and hands would reach past it.
      const lab = await labWith();
      teleport(lab.sim, lab.ctrl, -6, 0, z, 0);
      run(lab.sim, lab.ctrl, { stance: Stance.Prone }, 1.5);
      expect(lab.pawn.state.stance, `feet at z=${z}`).toBe(Stance.Stand);
    }
  });
});

describe("prone body: ground", () => {
  it("the legs lie over a curb instead of inside it", async () => {
    const lab = await labWith();
    teleport(lab.sim, lab.ctrl, -6, 0, 8.2, 0); // the 0.3 m curb (z 8.7..9.3) is behind you
    expect(runChecked(lab, { stance: Stance.Prone }, 1.5)).toEqual([]);
    expect(lab.pawn.state.stance).toBe(Stance.Prone);
    expect(lab.pawn.state.tiltB).toBeLessThan(-10 * DEG); // legs rise onto it
  });

  for (const yaw of [0, 45, 90, 180]) {
    it(`you can go prone on stairs facing ${yaw}°, and the body follows them`, async () => {
      const lab = await labWith();
      teleport(lab.sim, lab.ctrl, 14, 0, 9.5, 0);
      run(lab.sim, lab.ctrl, { forward: 1 }, 1); // walk a few steps up
      run(lab.sim, lab.ctrl, { yawDeg: yaw }, 0.3);
      expect(runChecked(lab, { stance: Stance.Prone, yawDeg: yaw }, 1.5)).toEqual([]);
      const s = lab.pawn.state;
      expect(s.stance).toBe(Stance.Prone);
      expect(s.stanceT).toBe(1);
      const stairs = Math.atan(0.25 / 0.3);
      const along = stairs * Math.cos(yaw * DEG);
      expect(s.tiltF).toBeCloseTo(Math.atan(Math.tan(stairs) * Math.cos(yaw * DEG)), 2);
      expect(Math.abs(s.tiltF - s.tiltB)).toBeLessThan(1e-3);
      if (yaw === 90) expect(s.tiltSide).toBeCloseTo(stairs, 2);
      expect(Math.sign(s.tiltF)).toBe(Math.sign(Math.round(along * 100)));
    });
  }

  it("you can go prone on a 40° ramp facing up or down", async () => {
    for (const yaw of [0, 180]) {
      const lab = await labWith();
      teleport(lab.sim, lab.ctrl, -20, 1.35, 12.47, yaw);
      expect(runChecked(lab, { stance: Stance.Prone, yawDeg: yaw }, 1.5)).toEqual([]);
      expect(lab.pawn.state.stance).toBe(Stance.Prone);
      expect(lab.pawn.state.tiltF).toBeCloseTo((yaw === 0 ? 40 : -40) * DEG, 2);
    }
  });

  it("crawling up and down a flight of stairs keeps every hitbox out of the steps", async () => {
    const up = await labWith();
    teleport(up.sim, up.ctrl, 14, 0, 9.6, 0, Stance.Prone);
    expect(runChecked(up, { forward: 1, stance: Stance.Prone }, 9)).toEqual([]);
    expect(up.pawn.state.y).toBeGreaterThan(2.9); // made it to the platform
    const down = await labWith();
    teleport(down.sim, down.ctrl, 14, 3, 3.6, 180, Stance.Prone);
    expect(runChecked(down, { forward: 1, stance: Stance.Prone, yawDeg: 180 }, 9)).toEqual([]);
    expect(down.pawn.state.y).toBeLessThan(0.1);
  });

  it("crawling over a crest keeps the body out of it, and you can't crawl off a drop taller than a step", async () => {
    const lab = await labWith();
    teleport(lab.sim, lab.ctrl, -20, 0, 15.5, 0, Stance.Prone);
    expect(runChecked(lab, { forward: 1, stance: Stance.Prone }, 10)).toEqual([]);
    // ramp_40 ends 2.57 m up in mid-air: the crawl stops at its top edge instead of falling off.
    expect(lab.pawn.state.y).toBeGreaterThan(2.4);
    expect(lab.pawn.state.grounded).toBe(true);
  });
});

describe("prone body: final review", () => {
  it("leaning away from a post and crawling into it keeps the lean and keeps the arm out of the post", async () => {
    const lab = await labWith();
    teleport(lab.sim, lab.ctrl, 1.35, 0, -11.5, 0, Stance.Prone); // lean_post_a is ahead-right (x 1.8..2.2)
    run(lab.sim, lab.ctrl, { stance: Stance.Prone, lean: -1 }, 0.3);
    expect(runChecked(lab, { stance: Stance.Prone, lean: -1, strafe: 1 }, 2)).toEqual([]);
    expect(lab.pawn.state.lean).toBe(-1);
  });

  it("the same at the prone tunnel's mouth, where you couldn't stand up to get out", async () => {
    const lab = await labWith();
    teleport(lab.sim, lab.ctrl, 22, 0, -4.5, 0, Stance.Prone);
    while (lab.pawn.state.z > -5.85) run(lab.sim, lab.ctrl, { forward: 1, stance: Stance.Prone }, 1 / 64);
    run(lab.sim, lab.ctrl, { stance: Stance.Prone, lean: -1 }, 0.3);
    expect(runChecked(lab, { stance: Stance.Prone, lean: -1, strafe: 1 }, 2)).toEqual([]);
    const z = lab.pawn.state.z;
    run(lab.sim, lab.ctrl, { stance: Stance.Prone, forward: -1 }, 1);
    expect(lab.pawn.state.z).toBeGreaterThan(z + 0.3); // and you can crawl back out
  });

  it("lying down on a ledge's edge is refused instead of sliding off into the ledge", async () => {
    for (const yaw of [180, 0]) {
      const lab = await labWith();
      // platform_3m: z 1.4..4.4, top at 3 m. Shuffle to its -Z edge, then try to go prone.
      teleport(lab.sim, lab.ctrl, 14, 3, 2.5, yaw);
      const dir = yaw === 180 ? -1 : 1;
      for (let i = 0; i < 600 && lab.pawn.state.z > 1.2; i++) run(lab.sim, lab.ctrl, { forward: dir, buttons: 16, yawDeg: yaw, stance: Stance.Crouch }, 1 / 64);
      run(lab.sim, lab.ctrl, { yawDeg: yaw, stance: Stance.Crouch }, 0.5);
      expect(runChecked(lab, { yawDeg: yaw, stance: Stance.Prone }, 3, true)).toEqual([]);
      expect(lab.pawn.state.y).toBeGreaterThan(2.9); // still up on the platform
    }
  });

  it("a body that somehow overlaps a wall can still crawl away from it", async () => {
    const lab = await labWith();
    // Put the lying body's head end into wall_n (face at z = -31.75) directly, bypassing every check.
    lab.sim.teleport(lab.ctrl.possessedPawnId, -1, 0, -31.3, 0, Stance.Prone);
    run(lab.sim, lab.ctrl, { stance: Stance.Prone }, 0.1);
    expect(bodyOverlaps(lab.sim, lab.pawn)).not.toEqual([]);
    run(lab.sim, lab.ctrl, { stance: Stance.Prone, forward: -1 }, 1.5);
    expect(lab.pawn.state.z).toBeGreaterThan(-30.6);
    expect(bodyOverlaps(lab.sim, lab.pawn)).toEqual([]);
  });
});
