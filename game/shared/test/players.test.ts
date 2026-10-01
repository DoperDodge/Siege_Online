// Player-vs-player collision (Phase 2; D-023c said players didn't block each other yet).
import { describe, expect, it } from "vitest";
import { Btn, hashPawnState, PawnMode, Sim, Stance, type InputCmd, type Pawn, type PlayerController } from "../src/index.js";
import { input, labWith, run, teleport } from "./helpers.js";

const dist = (a: Pawn, b: Pawn) => Math.hypot(a.state.x - b.state.x, a.state.z - b.state.z);
const CONTACT = 2 * 0.3 + 0.02 - 1e-3; // two body radii plus the controller's gap, minus float slack

async function twoPlayers() {
  const lab = await labWith();
  const other = lab.sim.addPlayer("other", "mute");
  const b = lab.sim.pawns.get(other.possessedPawnId)!;
  return { ...lab, other, b };
}

function stepBoth(sim: Sim, ca: PlayerController, a: Partial<InputCmd> & { yawDeg?: number }, cb: PlayerController, b: Partial<InputCmd> & { yawDeg?: number }, seconds: number, each?: () => void) {
  for (let i = 0; i < Math.round(seconds * 64); i++) {
    sim.step(new Map([[ca.id, input(a)], [cb.id, input(b)]]));
    each?.();
  }
}

describe("players block each other", () => {
  it("walking into someone stops at contact; head-on sprints never pass through", async () => {
    const { sim, ctrl, pawn, other, b } = await twoPlayers();
    sim.teleport(b.id, 0, 0, 6, 0);
    teleport(sim, ctrl, 0, 0, 9, 0); // facing -Z, 3 m behind b
    let closest = Infinity;
    stepBoth(sim, ctrl, { forward: 1 }, other, {}, 2, () => (closest = Math.min(closest, dist(pawn, b))));
    expect(closest).toBeGreaterThan(CONTACT);
    expect(dist(pawn, b)).toBeLessThan(0.7); // it did walk up to b

    sim.teleport(b.id, 0.05, 0, 2, 180); // facing +Z, toward us
    teleport(sim, ctrl, 0, 0, 9, 0);
    closest = Infinity;
    stepBoth(sim, ctrl, { forward: 1, buttons: Btn.Sprint }, other, { forward: 1, buttons: Btn.Sprint, yawDeg: 180 }, 2, () => (closest = Math.min(closest, dist(pawn, b))));
    expect(closest).toBeGreaterThan(CONTACT);
  });

  it("ten players joining on one spawn each get their own spot, and a forced pile-up separates", async () => {
    const sim = await Sim.create("movement_lab");
    const ctrls = Array.from({ length: 10 }, (_, i) => sim.addPlayer(`p${i}`, i === 3 ? "skopos" : "sledge"));
    const pawns = [...sim.pawns.values()];
    const minPair = () => Math.min(...pawns.flatMap((p, i) => pawns.slice(i + 1).map((q) => dist(p, q))));
    expect(minPair()).toBeGreaterThan(CONTACT);
    for (const p of pawns) sim.teleport(p.id, 0, 0, 12); // everyone on exactly the same spot
    for (let i = 0; i < 128; i++) sim.step(new Map(ctrls.map((c) => [c.id, input({})])));
    expect(minPair()).toBeGreaterThan(CONTACT - 0.02);
  });

  it("you can't vault onto someone standing behind the obstacle", async () => {
    const { sim, ctrl, pawn, other, b } = await twoPlayers();
    teleport(sim, ctrl, -6, 0, 3.0, 0); // facing the 0.9 m vault_090 (z 1.8..2.2)
    sim.teleport(b.id, -6, 0, 1.35, 0); // right where you'd land
    expect(sim.prompt(ctrl.id)).toBeNull();
    stepBoth(sim, ctrl, { buttons: Btn.Vault }, other, {}, 0.2);
    expect(pawn.state.mode).toBe(PawnMode.Walk);
    sim.teleport(b.id, -8, 0, 1.35, 0); // out of the way
    expect(sim.prompt(ctrl.id)).toBe("mantle");
  });

  it("landing on someone's head slides you off onto the floor", async () => {
    const { sim, ctrl, pawn, other, b } = await twoPlayers();
    sim.teleport(b.id, 0, 0, 6, 0);
    sim.teleport(pawn.id, 0.1, 2.2, 6, 0); // just above b's head
    stepBoth(sim, ctrl, {}, other, {}, 1.5);
    expect(pawn.state.y).toBeLessThan(0.1);
    expect(pawn.state.grounded).toBe(true);
    expect(dist(pawn, b)).toBeGreaterThan(CONTACT);
  });

  it("riding up against someone lying down, then stopping, settles back on the floor", async () => {
    const { sim, ctrl, pawn, other, b } = await twoPlayers();
    sim.teleport(b.id, 0, 0, 12, 0, Stance.Prone);
    stepBoth(sim, ctrl, {}, other, { stance: Stance.Prone }, 0.5);
    teleport(sim, ctrl, 0.1, 0, 14, 0);
    stepBoth(sim, ctrl, { forward: 1 }, other, { stance: Stance.Prone }, 0.6);
    stepBoth(sim, ctrl, {}, other, { stance: Stance.Prone }, 4);
    expect(pawn.state.y).toBeLessThan(0.03);
  });

  it("dead bodies don't block", async () => {
    const { sim, ctrl, pawn, other, b } = await twoPlayers();
    sim.teleport(b.id, -14.5, 6.5, -8, 0);
    stepBoth(sim, ctrl, {}, other, { forward: 1, yawDeg: 180 }, 3); // b walks off the 6.5 m tower
    expect(b.state.mode).toBe(PawnMode.Dead);
    const [x, z] = [b.state.x, b.state.z];
    teleport(sim, ctrl, x, 0, z + 2, 0);
    stepBoth(sim, ctrl, { forward: 1 }, other, {}, 1.2);
    expect(pawn.state.z).toBeLessThan(z - 0.5); // walked straight through where the body lies
  });

  it("Skopós' two shells block each other and the swap still works", async () => {
    const { sim, ctrl, pawn } = await labWith("skopos");
    const shell = sim.pawns.get(ctrl.pawnIds[1])!;
    const yaw = (Math.atan2(-(shell.state.x - pawn.state.x), -(shell.state.z - pawn.state.z)) * 180) / Math.PI;
    let closest = Infinity;
    for (let i = 0; i < 128; i++) {
      run(sim, ctrl, { forward: 1, yawDeg: yaw }, 1 / 64);
      closest = Math.min(closest, dist(pawn, shell));
    }
    expect(closest).toBeGreaterThan(CONTACT);
    run(sim, ctrl, { buttons: Btn.Ability }, 1 / 64);
    run(sim, ctrl, { buttons: Btn.Interact }, 1 / 64);
    run(sim, ctrl, {}, 2.8);
    expect(ctrl.possessedPawnId).toBe(shell.id);
  });

  it("two independent sims with ten colliding players stay bit-identical", async () => {
    const make = async () => {
      const sim = await Sim.create("movement_lab");
      const ctrls = Array.from({ length: 10 }, (_, i) => sim.addPlayer(`p${i}`, i === 4 ? "skopos" : ["sledge", "fuze", "brava", "mute"][i % 4]));
      return { sim, ctrls };
    };
    const [A, B] = [await make(), await make()];
    let seed = 99;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    let contactTicks = 0;
    for (let t = 0; t < 1280; t++) {
      const cmds = new Map(
        A.ctrls.map((c, i) => {
          const phase = Math.floor(t / 64 + i) % 5;
          const toward = Math.atan2(-(0 - A.sim.pawns.get(c.possessedPawnId)!.state.x), -(12 - A.sim.pawns.get(c.possessedPawnId)!.state.z));
          return [
            c.id,
            input({
              forward: 1,
              strafe: rnd() < 0.3 ? 1 : 0,
              yaw: toward + (rnd() - 0.5),
              buttons: (phase === 1 ? Btn.Sprint : 0) | (rnd() < 0.01 ? Btn.Ability : 0) | (rnd() < 0.02 ? Btn.Interact : 0),
              stance: phase === 3 ? Stance.Crouch : phase === 4 && i % 3 === 0 ? Stance.Prone : Stance.Stand,
              lean: phase === 2 ? 1 : 0,
            }),
          ] as [number, InputCmd];
        }),
      );
      A.sim.step(cmds);
      B.sim.step(cmds);
      const ps = [...A.sim.pawns.values()];
      if (ps.some((p, i) => ps.slice(i + 1).some((q) => dist(p, q) < 0.7))) contactTicks++;
    }
    expect(contactTicks).toBeGreaterThan(100); // they really crowded each other
    for (const [id, p] of A.sim.pawns) expect(hashPawnState(B.sim.pawns.get(id)!.state), `pawn ${id}`).toBe(hashPawnState(p.state));
  });
});
