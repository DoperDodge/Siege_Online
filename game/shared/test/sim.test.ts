// Skopós shell swapping, ladders and spawning (second adversarial review).
import { describe, expect, it } from "vitest";
import { Btn, DEG, levelSchema, loadGameData, operatorSchema, PawnMode, Sim, Stance } from "../src/index.js";
import { labWith, run, teleport } from "./helpers.js";

describe("ladders", () => {
  it("can only be grabbed from a settled stand: stand up first", async () => {
    for (const stance of [Stance.Crouch, Stance.Prone]) {
      const { sim, ctrl, pawn } = await labWith();
      // The tower ladder is on the tower's south face (z = -6.5), facing -Z.
      teleport(sim, ctrl, -16, 0, stance === Stance.Prone ? -5.35 : -5.8, 0, stance);
      expect(sim.prompt(ctrl.id)).toBeNull();
      run(sim, ctrl, { buttons: Btn.Interact, stance }, 1 / 64);
      expect(pawn.state.mode).toBe(PawnMode.Walk);
      run(sim, ctrl, { stance: Stance.Stand }, 1.2);
      teleport(sim, ctrl, -16, 0, -5.8, 0);
      expect(sim.prompt(ctrl.id)).toBe("ladder");
      run(sim, ctrl, { buttons: Btn.Interact }, 1 / 64);
      expect(pawn.state.mode).toBe(PawnMode.Ladder);
    }
  });
});

describe("Skopós shell camera and swap", () => {
  it("a key held since before the camera opened isn't a fresh press when you come back", async () => {
    const { sim, ctrl, pawn } = await labWith("skopos");
    teleport(sim, ctrl, -16, 0, -5.8, 180); // at the ladder, facing away from it
    run(sim, ctrl, { buttons: Btn.Interact, yawDeg: 180 }, 1 / 64); // F held from here on
    run(sim, ctrl, { buttons: Btn.Interact | Btn.Ability, yawDeg: 180 }, 1 / 64); // Z: camera opens
    expect(ctrl.shellCam).toBe(true);
    run(sim, ctrl, { buttons: Btn.Interact, yawDeg: 180 }, 0.2);
    sim.teleport(pawn.id, -16, 0, -5.8, 0); // meanwhile the body now faces the ladder
    run(sim, ctrl, { buttons: Btn.Interact | Btn.Ability, yawDeg: 0 }, 1 / 64); // Z: back in the body, F still held
    expect(ctrl.shellCam).toBe(false);
    run(sim, ctrl, { buttons: Btn.Interact, yawDeg: 0 }, 0.2);
    expect(pawn.state.mode).toBe(PawnMode.Walk); // no ladder grab from the old, held F
  });

  it("opening or closing the camera doesn't turn either body to the other one's view", async () => {
    const { sim, ctrl } = await labWith("skopos");
    const [a, b] = ctrl.pawnIds.map((id) => sim.pawns.get(id)!);
    sim.teleport(b.id, b.state.x, 0, b.state.z, 90, Stance.Crouch);
    run(sim, ctrl, { yawDeg: 0 }, 0.1);
    run(sim, ctrl, { buttons: Btn.Ability, yawDeg: 0 }, 1 / 64); // open: this tick's view is still A's
    expect(ctrl.shellCam).toBe(true);
    expect(b.state.yaw).toBeCloseTo(90 * DEG, 4);
    run(sim, ctrl, { yawDeg: 120 }, 0.2); // look around through B
    expect(b.state.yaw).toBeCloseTo(120 * DEG, 4);
    run(sim, ctrl, { buttons: Btn.Ability, yawDeg: 120 }, 1 / 64); // close: this tick's view is still B's
    expect(ctrl.shellCam).toBe(false);
    expect(a.state.yaw).toBeCloseTo(0, 4);
  });

  it("the swap keeps running through dropped inputs, and the new shell wakes up standing", async () => {
    const { sim, ctrl } = await labWith("skopos");
    const b = sim.pawns.get(ctrl.pawnIds[1])!;
    run(sim, ctrl, { buttons: Btn.Ability }, 1 / 64);
    run(sim, ctrl, { buttons: Btn.Interact }, 1 / 64);
    expect(ctrl.swapPhase).toBe(1);
    for (let i = 0; i < Math.ceil(2.7 * 64); i++) sim.step(new Map()); // every input lost
    expect(ctrl.swapPhase).toBe(0);
    expect(ctrl.possessedPawnId).toBe(b.id);
    expect(b.state.stance).toBe(Stance.Stand);
  });

  it("a Skopós join that can't place both shells leaves nothing behind", async () => {
    const data = loadGameData();
    const lab = data.levels.get("movement_lab")!;
    // Right next to wall_e (x 31.75..32.25): the second shell would land inside it.
    const tight = levelSchema.parse({ ...lab, id: "tight", spawns: [{ id: "by_wall", pos: [30.6, 0, 0], yawDeg: 0 }] });
    const sim = await Sim.create("tight", { ...data, levels: new Map(data.levels).set("tight", tight) });
    const colliders = sim.world.colliders.len();
    expect(() => sim.addPlayer("p", "skopos")).toThrow(/second shell/);
    expect(sim.pawns.size).toBe(0);
    expect(sim.world.colliders.len()).toBe(colliders);
  });

  it("rejects shell offsets and swap timings that can't work", async () => {
    const skopos = loadGameData().operators.get("skopos")!;
    const withParams = (p: Record<string, number>) => ({ ...skopos, ability: { ...skopos.ability, params: { ...skopos.ability.params, ...p } } });
    expect(operatorSchema.safeParse(withParams({ transferSeconds: 0 })).success).toBe(false);
    expect(operatorSchema.safeParse(withParams({ activationSeconds: -1 })).success).toBe(false);
    expect(operatorSchema.safeParse(withParams({ swapCooldownSeconds: 0 })).success).toBe(true);
    const data = loadGameData();
    const cramped = operatorSchema.parse(withParams({ idleShellOffset: 0.4 }));
    const sim = await Sim.create("movement_lab", { ...data, operators: new Map(data.operators).set("skopos", cramped) });
    expect(() => sim.addPlayer("p", "skopos")).toThrow(/two body radii/);
    expect(sim.pawns.size).toBe(0);
  });
});
