// Default cameras (Phase 7 M3, intel/DESIGN.md §3): a defender's Observe opens them, a lean goes round the working
// ones, the view turns within each camera's limits at its turn rate; a bullet's path through one breaks it.
import { describe, expect, it } from "vitest";
import { applyDamage, ATTACK, Btn, camerasOnRay, CAMERA_HALF_M, Cause, DEFENSE, DEG, PawnMode, Sim, type InputCmd } from "../src/index.js";
import { input } from "./helpers.js";

async function defender(team = DEFENSE) {
  const sim = await Sim.create("oregon");
  sim.matchRules.cameras = true;
  const c = sim.addPlayer("def", team === DEFENSE ? "mute" : "thermite", 0, undefined, undefined, team);
  const body = sim.pawns.get(c.possessedPawnId)!;
  const step = (cmd: Partial<InputCmd> & { yawDeg?: number } = {}, n = 1) => {
    for (let i = 0; i < n; i++) sim.step(new Map([[c.id, input(cmd)]]));
  };
  step({}, 8);
  return { sim, c, body, step, cams: sim.level.def.cameras };
}
/** A key's press and release, looking `yawDeg` (the client looks where a camera faces when it opens one). */
const press = (step: (cmd?: Partial<InputCmd> & { yawDeg?: number }) => void, buttons: number, yawDeg = 0) => {
  step({ buttons, yawDeg });
  step({ yawDeg });
};

describe("default cameras (Phase 7 M3)", () => {
  it("Observe opens the first, facing its way, the body standing idle; a new lean goes round them; Observe closes it", async () => {
    const { sim, c, body, step, cams } = await defender();
    expect(cams.length).toBe(8);
    const stood = { x: body.state.x, z: body.state.z };
    press(step, Btn.Observe, cams[0].yawDeg);
    expect([c.cam, c.camYaw]).toEqual([1, Math.fround(cams[0].yawDeg * DEG)]);
    expect(sim.prompt(c.id)).toBeNull();
    step({ forward: 1 }, 32);
    expect(Math.hypot(body.state.x - stood.x, body.state.z - stood.z)).toBeLessThan(0.01);
    step({ lean: 1 });
    expect(c.cam).toBe(2);
    step({ lean: 1 }, 4); // held: no new lean
    expect(c.cam).toBe(2);
    step({ lean: 0 });
    step({ lean: -1 });
    step({ lean: 0 });
    step({ lean: -1 }); // round the list: the last
    expect(c.cam).toBe(cams.length);
    step({ lean: 0 });
    press(step, Btn.Observe);
    expect(c.cam).toBe(0);
    step({ forward: 1 }, 16);
    expect(Math.hypot(body.state.x - stood.x, body.state.z - stood.z)).toBeGreaterThan(0.2);
  });

  it("the view turns toward the mouse at 60°/s, no further than 60° from the camera's facing, and tilts from −60° to +10°", async () => {
    const { c, step, cams } = await defender();
    press(step, Btn.Observe, cams[0].yawDeg);
    const face = cams[0].yawDeg * DEG;
    step({ yawDeg: cams[0].yawDeg + 170 }, 32); // half a second: 30° toward it
    expect((c.camYaw - face) / DEG).toBeCloseTo(30, 0);
    step({ yawDeg: cams[0].yawDeg + 170 }, 128);
    expect((c.camYaw - face) / DEG).toBeCloseTo(60, 3);
    step({ pitch: 80 * DEG }, 192);
    expect(c.camPitch / DEG).toBeCloseTo(10, 3);
    step({ pitch: -80 * DEG }, 192);
    expect(c.camPitch / DEG).toBeCloseTo(-60, 3);
  });

  it("broken ones are skipped, and one broken while watched hands over to the next working; with none left it closes", async () => {
    const { sim, c, step, cams } = await defender();
    sim.matchRules.camsBroken = 0b11; // the first two
    press(step, Btn.Observe);
    expect(c.cam).toBe(3);
    sim.matchRules.camsBroken |= 1 << 2;
    step({});
    expect(c.cam).toBe(4);
    sim.matchRules.camsBroken = (1 << cams.length) - 1;
    step({});
    expect(c.cam).toBe(0);
    press(step, Btn.Observe);
    expect(c.cam).toBe(0);
  });

  it("only defenders, only in a match, never while down (going down closes them)", async () => {
    const atk = await defender(ATTACK);
    press(atk.step, Btn.Observe);
    expect(atk.c.cam).toBe(0);
    const lab = await defender();
    lab.sim.matchRules.cameras = false;
    press(lab.step, Btn.Observe);
    expect(lab.c.cam).toBe(0);
    const { sim, c, body, step } = await defender();
    press(step, Btn.Observe);
    expect(c.cam).toBe(1);
    applyDamage(sim, body, { amount: body.state.hp - 1, kill: false, cause: Cause.Bullet });
    applyDamage(sim, body, { amount: 5, kill: false, cause: Cause.Bullet });
    expect(body.state.mode).toBe(PawnMode.Downed);
    step({});
    expect(c.cam).toBe(0);
    press(step, Btn.Observe);
    expect(c.cam).toBe(0);
  });

  it("a ray through a camera's box breaks it, short of where the bullet stopped; a broken one is left out", async () => {
    const { sim, cams } = await defender();
    const level = sim.level.def;
    const cam = cams[3];
    const from = [cam.pos[0], cam.pos[1], cam.pos[2] + 5];
    const dir = [0, 0, -1];
    expect(camerasOnRay(level, from, dir, 10, 0)).toBe(1 << 3);
    expect(camerasOnRay(level, from, dir, 5 - CAMERA_HALF_M - 0.01, 0)).toBe(0); // stopped before it
    expect(camerasOnRay(level, from, dir, 10, 1 << 3)).toBe(0);
    expect(camerasOnRay(level, [from[0] + 0.5, from[1], from[2]], dir, 10, 0)).toBe(0); // passes beside it
  });
});
