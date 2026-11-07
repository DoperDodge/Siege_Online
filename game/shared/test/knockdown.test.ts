// The knockdown (D-156): Fuze's bash knocks a body on its feet down. It turns to face him, is shoved back onto its back,
// lies, and gets up; its player's keys and mouse do nothing until it's up. Its hitboxes (and what's drawn) tip back with
// it, its player's client predicts it from the correction on, and others get it in the remote record.
import { describe, expect, it } from "vitest";
import { Btn, defaultLoadoutPick, loadedOf, PawnMode, poseHitboxes, quantizeRemote, remoteState, ShieldAt, ticks } from "../src/index.js";
import { scene, type Scene } from "./interactions/harness.js";

/** `ops` on `level`, everyone out of the way; the clients in `shields` (0: Fuze) carry the Ballistic Shield. */
async function lab(ops = ["fuze", "mute"], level = "gadget_lab", shields = [0]) {
  const s = await scene(ops, level);
  for (const i of shields) s.room.pickLoadout(s.clients[i].id, { ...defaultLoadoutPick(s.sim.data, "fuze"), primary: { weapon: "ballistic_shield", sight: null, barrel: null, grip: null, underbarrel: null } });
  s.wait(8);
  s.park();
  return s;
}

/** Client i standing at (x, z) facing `yaw` (0: toward −z; π: toward +z). */
function stand(s: Scene, i: number, x: number, z: number, yaw = 0) {
  s.teleport(i, x, 0, z);
  s.clients[i].cmd = { yaw };
  s.wait(4);
}

/** Run ticks until `pred` holds, at most `max`: whether it did. */
function until(s: Scene, pred: () => boolean, max = 128): boolean {
  for (let n = 0; n < max && !pred(); n++) s.wait(1);
  return pred();
}

const facing = (yaw: number, want: number) => Math.abs(Math.atan2(Math.sin(yaw - want), Math.cos(yaw - want)));

describe("Fuze's bash knocks a body down (D-156)", () => {
  it("shoved back onto its back facing him, it lies, then it's up: its player's keys and mouse do nothing until then", async () => {
    const s = await lab();
    stand(s, 0, 0, 12);
    stand(s, 1, 0.2, 10.9, Math.PI / 2);
    const kd = s.sim.data.combat.knockdown;
    const mute = s.body(1);
    const { hp } = mute.state;
    const z0 = mute.state.z;
    const ammo = loadedOf(mute.state);
    const missed = s.room.stats.mismatchCorrections;
    s.press(0, Btn.Melee);
    expect(until(s, () => mute.state.mode === PawnMode.Knocked, 48)).toBe(true);
    // He faces Fuze (toward +z) whatever way he faced, and his player holds forward and fire and turns the mouse.
    expect(facing(mute.state.yaw, Math.PI)).toBeLessThan(0.2);
    s.clients[1].cmd = { forward: 1, buttons: Btn.Fire, yaw: 1 };
    s.wait(ticks(kd.fallS) + ticks(kd.downS) - 2);
    // Shoved back (away from Fuze) about pushM, flat on his back, unhurt, nothing fired, the mouse ignored.
    expect(mute.state.mode).toBe(PawnMode.Knocked);
    expect(z0 - mute.state.z).toBeGreaterThan(kd.pushM - 0.2);
    expect(z0 - mute.state.z).toBeLessThan(kd.pushM + 0.3);
    expect(mute.state.knockLie).toBeGreaterThan(0.95);
    expect(facing(mute.state.yaw, Math.PI)).toBeLessThan(0.2);
    expect([mute.state.hp, loadedOf(mute.state)]).toEqual([hp, ammo]);
    // Lying where he is: his head on the floor behind his feet (away from Fuze), his hitboxes low.
    const boxes = poseHitboxes(s.sim.data.movement, s.sim.data.hitboxes, mute.state);
    const head = boxes.find((b) => b.part === "head")!;
    expect(head.a[1]).toBeLessThan(0.45);
    expect(head.a[2]).toBeLessThan(mute.state.z - 1.2);
    expect(Math.max(...boxes.map((b) => Math.max(b.a[1], b.b[1]) + b.radius))).toBeLessThan(0.75);
    // Up again once the get-up is over (not before), and his keys work again.
    expect(until(s, () => mute.state.mode === PawnMode.Walk, ticks(kd.getUpS) + 6)).toBe(true);
    expect(loadedOf(mute.state)).toBe(ammo);
    const z1 = mute.state.z;
    s.clients[1].cmd = { forward: 1, yaw: Math.PI };
    s.wait(24);
    expect(mute.state.z - z1).toBeGreaterThan(0.3);
    // His client predicted it all from the correction that knocked him down: no misprediction since.
    expect(s.room.stats.mismatchCorrections).toBe(missed);
  });

  it("knocked against a wall right behind, he slumps against it instead of lying flat, his head short of it", async () => {
    // The Destruction Lab's soft wall: its face toward +z at z −5.9 (x round −12).
    const s = await lab(["fuze", "mute"], "destruction_lab");
    stand(s, 0, -12, -4.2);
    stand(s, 1, -12, -5.25, Math.PI);
    const mute = s.body(1);
    s.press(0, Btn.Melee);
    expect(until(s, () => mute.state.mode === PawnMode.Knocked, 48)).toBe(true);
    const kd = s.sim.data.combat.knockdown;
    s.wait(ticks(kd.fallS) + ticks(kd.downS) - 2);
    expect(mute.state.mode).toBe(PawnMode.Knocked);
    expect(mute.state.knockLie).toBeLessThan(0.35);
    const head = poseHitboxes(s.sim.data.movement, s.sim.data.hitboxes, mute.state).find((b) => b.part === "head")!;
    expect(head.a[2] - head.radius).toBeGreaterThan(-5.9);
  });

  it("on a raised shield's plate it only knocks the shield aside (a guard break), its carrier on his feet", async () => {
    const s = await lab(["fuze", "fuze"], "gadget_lab", [0, 1]);
    stand(s, 0, 0, 12);
    stand(s, 1, 0, 11.0, Math.PI);
    expect(s.body(1).state.shieldAt).toBe(ShieldAt.Front);
    s.press(0, Btn.Melee);
    expect(until(s, () => s.body(1).state.shieldAt === ShieldAt.None, 48)).toBe(true);
    expect(s.body(1).state.mode).toBe(PawnMode.Walk);
    expect(s.body(1).state.guard).toBeGreaterThan(0);
  });

  it("others get it in the remote record: the mode, and how far over (to 1/255)", async () => {
    const s = await lab();
    const st = { ...s.body(1).state, mode: PawnMode.Knocked, knockTicks: 20, knockLie: 0.6 };
    const back = remoteState(quantizeRemote(st));
    expect(back.mode).toBe(PawnMode.Knocked);
    expect(back.knockLie).toBeCloseTo(0.6, 2);
    expect(back.ropeTurn).toBe(0);
    // A body on a rope keeps the byte for its turn.
    const rope = remoteState(quantizeRemote({ ...s.body(1).state, mode: PawnMode.Rappel, ropeTurn: 0.4 }));
    expect([rope.ropeTurn, rope.knockLie]).toEqual([Math.round(0.4 * 255) / 255, 0]);
  });
});
