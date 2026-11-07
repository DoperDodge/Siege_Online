// Interaction rows that earlier phases and Phase 8 M1 already built (gadgets/DESIGN.md §10): the gadget kits, the
// Bulletproof Camera's plate, glass, wall and signal, a drone under a door's barricade, the knife on a barricade and a
// soft wall.
import { expect } from "vitest";
import {
  ATTACK,
  Btn,
  DEFENSE,
  defaultLoadoutPick,
  GadgetServer,
  GFlag,
  loadoutPickProblem,
  meleeOnPanels,
  resolveLoadout,
  Sim,
  slotCounts,
  ticks,
  type Vec3,
} from "../../src/index.js";
import { input } from "../helpers.js";
import { scene } from "./harness.js";
import { row } from "./registry.js";

/** A kit takes exactly two different gadgets of its side's pool, each with its generic count (research/operators/{striker,sentry}.md §3). */
async function kit(op: "striker" | "sentry", a: string, b: string, other: string) {
  const sim = await Sim.create("range_lab");
  const data = sim.data;
  const pick = (gadgets: string[]) => ({ ...defaultLoadoutPick(data, op), gadgets });
  expect(loadoutPickProblem(data, pick([a, b]))).toBeNull();
  expect(loadoutPickProblem(data, pick([a, a]))).not.toBeNull(); // the same twice
  expect(loadoutPickProblem(data, pick([a]))).not.toBeNull(); // one only
  expect(loadoutPickProblem(data, pick([a, other]))).not.toBeNull(); // the other side's
  const lo = resolveLoadout(data, pick([a, b])).loadout;
  expect(lo.slots).toEqual([a, b]);
  expect(slotCounts(data, lo)).toEqual([data.gadgets.get(a)!.count, data.gadgets.get(b)!.count]);
  // Every pair of the pool is allowed: 21 of the 7.
  const pool = data.operators.get(op)!.loadout.gadgetKit!.pool;
  let pairs = 0;
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) pairs += loadoutPickProblem(data, pick([pool[i], pool[j]])) === null ? 1 : 0;
  expect([pool.length, pairs]).toEqual([7, 21]);
}

row("striker.gadget_kit", "loadout.attacker_generic_pool", () => kit("striker", "frag", "claymore", "nitro_cell"));
row("sentry.gadget_kit", "loadout.defender_generic_pool", () => kit("sentry", "barbed_wire", "nitro_cell", "frag"));

/** A Bulletproof Camera on the Destruction Lab's plain soft wall (its face at z −5.9), facing out of it, Mute's. */
async function camOnWall() {
  const s = await scene(["sledge", "mute"]);
  const panel = s.sim.level.panels.byId.get("soft_plain")!.panel.spec.index;
  const d = s.sim.data.gadgets.get("bulletproof_camera")!;
  const cam = s.put("bulletproof_camera", 1, [-8, 1.5, -5.9 + d.sizeM[2] / 2], { yaw: Math.PI, flags: 0, panel });
  const now = () => s.sim.gadgets.get(cam.id)!;
  return { ...s, cam, now };
}

row("weapon.bullet", "generic.bulletproof_camera", async () => {
  const s = await camOnWall();
  s.teleport(0, -8, 0, -3.5, 0); // in front of it: its plate
  s.shootAt(0, s.cam.pos);
  expect(s.now().flags & GFlag.Broken).toBe(0);
  s.teleport(0, -9.3, 0, -5.4, -90); // beside it along the wall: its weak side
  s.shootAt(0, s.cam.pos);
  expect(s.now().flags & GFlag.Broken).toBe(GFlag.Broken);
});

row("player.melee", "generic.bulletproof_camera", async () => {
  const s = await camOnWall();
  s.teleport(0, -8, 0, -5.0, 0); // knife range, at its bulletproof front
  s.knife(0, s.cam.pos);
  expect(s.now().flags & GFlag.Broken).toBe(GFlag.Broken); // shattered: no feed for the rest of the round
});

row("action.reinforce", "generic.bulletproof_camera", async () => {
  const s = await scene(["sledge", "mute"]);
  const panel = s.sim.level.panels.byId.get("reinforce_2")!.panel.spec.index;
  const d = s.sim.data.gadgets.get("bulletproof_camera")!;
  // On the reinforceable wall's right section (centre 1, −6), its face toward +z; Mute reinforces that section.
  const cam = s.put("bulletproof_camera", 1, [1.8, 1.5, -5.9 + d.sizeM[2] / 2], { yaw: Math.PI, flags: 0, panel });
  s.teleport(1, 1.8, 0, -5.0, 0);
  s.clients[1].cmd = { buttons: Btn.Interact };
  for (let i = 0; i < 8 * 64 && !(s.sim.gadgets.get(cam.id)!.flags & GFlag.Broken); i++) s.tick();
  s.clients[1].cmd = {};
  expect(s.sim.level.panels.list[panel].panel.reinforced).not.toBe(0);
  expect(s.sim.gadgets.get(cam.id)!.flags & GFlag.Broken).toBe(GFlag.Broken);
});

row("environment.outdoors", "generic.bulletproof_camera", async () => {
  // On Oregon, placed in the street (outdoors) it loses its signal 10 s later; in the Laundry (indoors) never.
  const sim = await Sim.create("oregon");
  const server = new GadgetServer(sim);
  const c = sim.addPlayer("def", "mute", 0, undefined, undefined, DEFENSE);
  const street = sim.level.def.spawns.find((sp) => sp.group === "B_STREET")!.pos;
  const place = (pos: Vec3) => server.onEvent({ kind: "place", pawnId: c.possessedPawnId, seq: 1, slot: 1, gadget: "bulletproof_camera", pos, yaw: 0, onFloor: true, flat: false, panel: -1 });
  place([street[0], street[1] + 0.06, street[2]]);
  place([39.345, -3.14, 31.805]);
  const [out, inside] = sim.gadgets.list;
  expect([out.signalEnd - sim.tick, inside.signalEnd]).toEqual([ticks(sim.data.intel.bulletproofCamera.outdoorSignalS), 0]);
  for (let i = 0; i < ticks(10) + 1; i++) {
    sim.step(new Map([[c.id, input()]]));
    server.step();
  }
  expect([sim.gadgets.get(out.id)!.flags & GFlag.Lost, sim.gadgets.get(inside.id)!.flags & GFlag.Lost]).toEqual([GFlag.Lost, 0]);
});

row("drone.standard", "surface.barricade", async () => {
  // A drone driven at the Destruction Lab's barricaded door (x −10, z 6) goes under it (its 15 cm gap).
  const sim = await Sim.create("destruction_lab");
  const c = sim.addPlayer("atk", "thermite", 0, undefined, undefined, ATTACK);
  sim.addDrone(c.id);
  const [d] = sim.dronesOf(c);
  sim.placeDrone(d.id, -10, 0.02, 7.5, 0);
  c.drone = d.id;
  for (let i = 0; i < 3 * 64; i++) sim.step(new Map([[c.id, input({ forward: 1 })]]));
  expect(d.state.z).toBeLessThan(6 - 0.5);
  expect(sim.level.panels.byId.get("door_a")!.panel.broken).toBe(false);
});

row("player.melee", "surface.barricade", async () => {
  // Three knife hits always break a barricade (research/destruction.md §8).
  const sim = await Sim.create("destruction_lab");
  const panels = sim.level.panels;
  const door = panels.byId.get("door_a")!.panel;
  const hit = (n: number) => {
    for (let i = 0; i < n; i++) {
      const r = meleeOnPanels(panels, sim.data.destruction, [-10, 1.2, 7.2], [0, 0, -1], sim.data.combat.melee.reach, 2);
      for (const o of r?.ops ?? []) panels.apply(o.panel, o.op);
    }
  };
  hit(2);
  expect(door.broken).toBe(false);
  hit(1);
  expect(door.broken).toBe(true);
});

row("player.melee", "surface.soft_wall", async () => {
  // A knife hit makes a round hole through both skins (25 cm, ours); the studs stay.
  const sim = await Sim.create("destruction_lab");
  const panels = sim.level.panels;
  const r = meleeOnPanels(panels, sim.data.destruction, [-12, 1.5, -4.9], [0, 0, -1], sim.data.combat.melee.reach, 2)!;
  const cuts = r.ops.filter((o) => o.op.kind === "cut");
  expect(cuts.length).toBeGreaterThanOrEqual(2);
  for (const o of cuts) expect(o.op.kind === "cut" && o.op.shape.kind).toBe("disc");
  expect(cuts.some((o) => o.op.kind === "cut" && o.op.layer === 1)).toBe(false); // not the core
});
