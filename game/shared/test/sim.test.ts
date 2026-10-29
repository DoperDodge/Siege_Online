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

describe("standsFree (the lab's free camera puts a body down only where it fits)", () => {
  it("is true where a standing body has room, false in a wall or under a ceiling too low to stand", async () => {
    const { sim } = await labWith();
    expect(sim.standsFree(0, 0, 12)).toBe(true); // open floor
    expect(sim.standsFree(14, 3, 2.9)).toBe(true); // on the 3 m platform
    expect(sim.standsFree(-16, 0, -8)).toBe(false); // inside the tower
    expect(sim.standsFree(18, 0, -8.5)).toBe(false); // the crouch tunnel: its ceiling is at 1.45 m
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

  /** The movement lab with these spawns, and these walls added (3 m tall, HARD_WALL). */
  async function labWithSpawns(spawns: { id: string; pos: [number, number, number]; yawDeg: number }[], walls: [cx: number, cz: number, sx: number, sz: number][] = []) {
    const data = loadGameData();
    const lab = data.levels.get("movement_lab")!;
    const solids = [...lab.solids, ...walls.map(([cx, cz, sx, sz], i) => ({ id: `extra_${i}`, center: [cx, 1.5, cz], size: [sx, 3, sz], surface: "HARD_WALL" }))];
    const tight = levelSchema.parse({ ...lab, id: "tight", spawns, solids });
    return Sim.create("tight", { ...data, levels: new Map(data.levels).set("tight", tight) });
  }

  it("Skopós's second shell stands the other way when a wall is to the right of the spawn", async () => {
    // Right next to wall_e (x 31.75..32.25): 1.5 m to the right is inside it.
    const sim = await labWithSpawns([{ id: "by_wall", pos: [30.6, 0, 0], yawDeg: 0 }]);
    const [a, b] = sim.addPlayer("p", "skopos").pawnIds.map((id) => sim.pawns.get(id)!.state);
    expect([a.x, a.z, b.x, b.z].map((v) => +v.toFixed(5) + 0)).toEqual([30.6, 0, 30.6 - 1.5, 0]);
  });

  it("Skopós's second shell never stands on the far side of a thin wall", async () => {
    // Facing west, so the right is +z: 1.5 m that way is clear floor, but behind winwall_left (z -0.1..0.1).
    const sim = await labWithSpawns([{ id: "by_thin_wall", pos: [3.2, 0, -0.8], yawDeg: -90 }]);
    const [a, b] = sim.addPlayer("p", "skopos").pawnIds.map((id) => sim.pawns.get(id)!.state);
    expect([a.x, a.z, b.x, b.z].map((v) => +v.toFixed(5) + 0)).toEqual([3.2, -0.8, 3.2, -0.8 - 1.5]);
  });

  it("a Skopós join with no room for the second shell on any side leaves nothing behind", async () => {
    // A closet 1.2 m square: one body fits, and no second one 1.5 m away is inside it.
    const sim = await labWithSpawns(
      [{ id: "closet", pos: [24, 0, 20], yawDeg: 0 }],
      [
        [24, 19.3, 1.6, 0.2],
        [24, 20.7, 1.6, 0.2],
        [24.7, 20, 0.2, 1.6],
        [23.3, 20, 0.2, 1.6],
      ],
    );
    const colliders = sim.world.colliders.len();
    expect(() => sim.addPlayer("p", "skopos")).toThrow(/second shell/);
    expect(sim.pawns.size).toBe(0);
    expect(sim.world.colliders.len()).toBe(colliders);
    // One body still joins there.
    expect(sim.addPlayer("q", "sledge").pawnIds).toHaveLength(1);
  });

  it("every spawn on every map has room for Skopós's second shell", async () => {
    const data = loadGameData();
    for (const id of data.levels.keys()) {
      const sim = await Sim.create(id, data);
      for (const [i, spawn] of sim.level.def.spawns.entries()) {
        const ctrl = sim.addPlayer("p", "skopos", i); // throws, naming the spawn, when there's no room
        const [a, b] = ctrl.pawnIds.map((pid) => sim.pawns.get(pid)!.state);
        const where = `${id} spawn ${spawn.id}`;
        expect(Math.hypot(a.x - spawn.pos[0], a.z - spawn.pos[2]), where).toBeCloseTo(0, 5);
        expect(Math.hypot(b.x - spawn.pos[0], b.z - spawn.pos[2]), where).toBeCloseTo(1.5, 5);
        sim.removePlayer(ctrl.id);
      }
    }
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
