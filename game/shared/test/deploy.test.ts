// Reinforcing, barricades and hatches (Phase 4 M6, destruction/deploy.ts, sim.ts, net/room.ts) in the
// Destruction Lab: a defender facing a wall section holds Interact for 4.5 s and steel goes up on their side
// from the team's pool; attackers can't (but can in lab rooms); letting go cancels; a hatch is reinforced
// only from above; barricades go up in 2 s, come off in 1 s, and break after three knife hits.
import { describe, expect, it } from "vitest";
import {
  Btn,
  bulletThroughPanels,
  deployTicks,
  DeployKind,
  L_FRONT,
  L_STEEL,
  PawnMode,
  Sim,
  Stance,
  TICK_HZ,
  type Pawn,
  type PlayerController,
  type SimEvent,
} from "../src/index.js";
import { input } from "./helpers.js";
import { roomWith } from "./roomHarness.js";

const DEG = Math.PI / 180;

async function lab(operator = "mute") {
  const sim = await Sim.create("destruction_lab");
  sim.deployRules = { anyone: false, pools: [10, 10] };
  const ctrl = sim.addPlayer("p", operator);
  const pawn = sim.pawns.get(ctrl.possessedPawnId)!;
  return { sim, ctrl, pawn };
}
/** Step with the same input `ticks` times, collecting the simulation's events. */
function hold(sim: Sim, ctrl: PlayerController, cmd: Parameters<typeof input>[0], ticks: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.step(new Map([[ctrl.id, input(cmd)]]));
    out.push(...sim.events);
  }
  return out;
}
const at = (sim: Sim, pawn: Pawn, x: number, y: number, z: number, yawDeg: number) => {
  sim.teleport(pawn.id, x, y, z, yawDeg);
  hold(sim, [...sim.controllers.values()].find((c) => c.pawnIds.includes(pawn.id))!, { yawDeg }, 20);
};

describe("reinforcing a wall (in the simulation)", () => {
  it("a defender facing a section holds F for 4.5 s, standing still: a deploy event for that section, from their side", async () => {
    const { sim, ctrl, pawn } = await lab();
    at(sim, pawn, 0.4, 0, -5.0, 0); // 0.9 m from the 2-section wall's +z face, looking at its left half
    expect(sim.prompt(ctrl.id)).toBe("reinforce");
    const start = { x: pawn.state.x, z: pawn.state.z };
    const n = deployTicks(sim.data.destruction, DeployKind.Reinforce);
    expect(n).toBe(Math.round(4.5 * TICK_HZ));
    const events = hold(sim, ctrl, { yawDeg: 0, buttons: Btn.Interact, forward: 1 }, n);
    const deploys = events.filter((e) => e.kind === "deploy");
    expect(deploys).toEqual([{ kind: "deploy", pawnId: pawn.id, action: DeployKind.Reinforce, panel: sim.level.panels.byId.get("reinforce_2")!.panel.spec.index, section: 0, side: 1 }]);
    expect(Math.hypot(pawn.state.x - start.x, pawn.state.z - start.z)).toBeLessThan(1e-6);
    expect(pawn.state.deployKind).toBe(DeployKind.None);
    // Holding on doesn't start another: that takes a fresh press.
    expect(hold(sim, ctrl, { yawDeg: 0, buttons: Btn.Interact }, 10).length).toBe(0);
  });

  it("a stall mid-hold (ticks with no input) pauses it; with F still held when inputs come back, it completes", async () => {
    const { sim, ctrl, pawn } = await lab();
    at(sim, pawn, 0.4, 0, -5.0, 0);
    const n = deployTicks(sim.data.destruction, DeployKind.Reinforce);
    hold(sim, ctrl, { yawDeg: 0, buttons: Btn.Interact }, 100);
    for (let i = 0; i < 20; i++) sim.step(new Map()); // the server stepping the body without input (a stalled client)
    expect([pawn.state.deployKind, pawn.state.deployTicks]).toEqual([DeployKind.Reinforce, 100]);
    const events = hold(sim, ctrl, { yawDeg: 0, buttons: Btn.Interact }, n - 100);
    expect(events.filter((e) => e.kind === "deploy")).toHaveLength(1);
  });

  it("hands are busy meanwhile: fire, aim and the knife do nothing while F is held, and it still completes", async () => {
    const { sim, ctrl, pawn } = await lab();
    at(sim, pawn, 0.4, 0, -5.0, 0);
    hold(sim, ctrl, { yawDeg: 0 }, TICK_HZ); // the weapon up
    const n = deployTicks(sim.data.destruction, DeployKind.Reinforce);
    const busy = Btn.Interact | Btn.Fire | Btn.Ads;
    const during = hold(sim, ctrl, { yawDeg: 0, buttons: busy | Btn.Melee }, 1).concat(hold(sim, ctrl, { yawDeg: 0, buttons: busy }, n - 2));
    expect(during.filter((e) => e.kind === "shot" || e.kind === "meleeImpact")).toEqual([]);
    expect([pawn.state.adsQ, pawn.state.meleeTicks, pawn.state.deployKind]).toEqual([0, 0, DeployKind.Reinforce]);
    expect(hold(sim, ctrl, { yawDeg: 0, buttons: busy }, 1).filter((e) => e.kind === "deploy")).toHaveLength(1);
    // Free again: the same buttons fire.
    expect(hold(sim, ctrl, { yawDeg: 0, buttons: Btn.Fire }, 10).filter((e) => e.kind === "shot").length).toBeGreaterThan(0);
  });

  it("the data decides whether a damaged section takes steel, and whether the reinforcer is held still", async () => {
    const { sim, ctrl, pawn } = await lab();
    at(sim, pawn, 0.4, 0, -5.0, 0);
    const e = sim.level.panels.byId.get("reinforce_2")!;
    const [u0, u1] = e.panel.sectionRange(sim.deployActionFor(pawn)!.section);
    sim.level.panels.apply(e.panel.spec.index, { kind: "cut", layer: L_FRONT, shape: { kind: "disc", u4: 2 * (u0 + u1), v4: 2 * e.panel.h, r4: 4 }, hard: false });
    const r = sim.data.destruction.reinforcement;
    expect(sim.prompt(ctrl.id)).toBe("reinforce"); // reinforcement.canReinforceDamaged: true
    try {
      r.canReinforceDamaged = false;
      expect(sim.prompt(ctrl.id)).toBeNull();
      r.canReinforceDamaged = true;
      r.locksReinforcer = false;
      const start = { x: pawn.state.x, z: pawn.state.z };
      hold(sim, ctrl, { yawDeg: 0, buttons: Btn.Interact, strafe: 1 }, 10);
      expect(Math.hypot(pawn.state.x - start.x, pawn.state.z - start.z)).toBeGreaterThan(0.1);
    } finally {
      r.canReinforceDamaged = true;
      r.locksReinforcer = true;
    }
  });

  it("letting go, looking away, standing too far, an empty pool or being an attacker: nothing", async () => {

    const { sim, ctrl, pawn } = await lab();
    at(sim, pawn, 0.4, 0, -5.0, 0);
    hold(sim, ctrl, { yawDeg: 0, buttons: Btn.Interact }, 2 * TICK_HZ);
    expect(pawn.state.deployKind).toBe(DeployKind.Reinforce);
    expect(hold(sim, ctrl, { yawDeg: 0 }, 1)).toEqual([]);
    expect([pawn.state.deployKind, pawn.state.deployTicks]).toEqual([0, 0]);
    at(sim, pawn, 0.4, 0, -5.0, 90);
    expect(sim.prompt(ctrl.id)).toBeNull();
    at(sim, pawn, 0.4, 0, -3.4, 0); // 2.5 m away
    expect(sim.prompt(ctrl.id)).toBeNull();
    at(sim, pawn, 0.4, 0, -5.0, 0);
    sim.deployRules = { anyone: false, pools: [10, 0] };
    expect(sim.prompt(ctrl.id)).toBeNull();
    const att = await lab("sledge");
    at(att.sim, att.pawn, 0.4, 0, -5.0, 0);
    expect(att.sim.prompt(att.ctrl.id)).toBeNull();
    att.sim.deployRules = { anyone: true, pools: [10, 10] };
    expect(att.sim.prompt(att.ctrl.id)).toBe("reinforce");
  });
});

describe("in a lab room", () => {
  it("steel goes up on the reinforcer's side from the team's pool; everyone sees it; bullets from the far side stop at it", async () => {
    const { room, clients, tick } = await roomWith("destruction_lab", ["mute"]);
    for (let i = 0; i < 10; i++) tick();
    const [a] = clients;
    room.onLabTool(a.id, { kind: "teleport", x: 2.2, y: 0, z: -5.0, yawDeg: 0 });
    for (let i = 0; i < 20; i++) tick();
    expect(a.session.sim!.deployRules).toEqual({ anyone: true, pools: [10, 10] });
    a.cmd = { buttons: Btn.Interact };
    for (let i = 0; i < 4.5 * TICK_HZ + 10; i++) tick();
    a.cmd = {};
    for (let i = 0; i < 4; i++) tick();
    const wall = room.sim.level.panels.byId.get("reinforce_2")!.panel;
    expect([wall.reinforced, wall.steelSides]).toEqual([0b10, 0b10]); // section 1 (x > 1), from the +z side
    expect(room.sim.deployRules.pools).toEqual([10, 9]);
    expect(a.session.sim!.deployRules.pools).toEqual([10, 9]);
    expect(a.session.sim!.level.panels.hash()).toBe(room.sim.level.panels.hash());
    expect(a.session.stats.corrections - 1).toBeLessThanOrEqual(1); // the teleport's, and at most one more
    // That section can't be reinforced again.
    expect(room.sim.prompt(a.session.ctrl!.id)).toBeNull();
    // A rifle from the −z side: through the front skin and the core, then the plate on the +z side stops it.
    const p = bulletThroughPanels(room.sim.level.panels, room.sim.data.destruction, room.sim.data.destruction.bullets.tiers.high!, [2.2, 1.2, -9], [0, 0, 1], 10);
    expect(p.stop).toBeCloseTo(9 - 5.9 - 0.001, 6);
  });

  it("a hatch is reinforced from above, never from below, and then shrugs off bullets", async () => {
    const { room, clients, tick } = await roomWith("destruction_lab", ["mute", "mute"]);
    for (let i = 0; i < 10; i++) tick();
    const [top, below] = clients;
    room.onLabTool(below.id, { kind: "teleport", x: 10, y: 0, z: 8, yawDeg: 0 });
    room.onLabTool(top.id, { kind: "teleport", x: 10, y: 3, z: 9.0, yawDeg: 0 });
    below.cmd = { pitch: 89 * DEG };
    top.cmd = { pitch: -55 * DEG };
    for (let i = 0; i < 30; i++) tick();
    expect(room.sim.prompt(below.session.ctrl!.id)).toBeNull();
    expect(room.sim.prompt(top.session.ctrl!.id)).toBe("reinforce");
    top.cmd = { pitch: -55 * DEG, buttons: Btn.Interact };
    for (let i = 0; i < 4.5 * TICK_HZ + 10; i++) tick();
    const hatch = room.sim.level.panels.byId.get("hatch")!.panel;
    expect([hatch.reinforced, hatch.steelSides, hatch.steelHp]).toEqual([1, 1, 1_000_000]);
    const shots = bulletThroughPanels(room.sim.level.panels, room.sim.data.destruction, room.sim.data.destruction.bullets.tiers.explosive!, [10.2, 1, 8.2], [0, 1, 0], 5);
    expect(shots.stop).not.toBeNull();
    for (const { panel, op } of shots.ops) room.sim.level.panels.apply(panel, op);
    expect([hatch.broken, hatch.steelHp]).toEqual([false, 1_000_000]);
    expect(hatch.layers[L_STEEL]!.every((c) => c === 1)).toBe(true);
  });

  it("a barricade goes up in an empty door in 2 s and blocks it; three knife hits break it; it comes off in 1 s", async () => {
    const { room, clients, tick } = await roomWith("destruction_lab", ["mute"]);
    for (let i = 0; i < 10; i++) tick();
    const [a] = clients;
    const body = () => room.sim.pawns.get(a.session.ctrl!.possessedPawnId)!.state;
    const door = room.sim.level.panels.byId.get("door_b")!.panel;
    room.onLabTool(a.id, { kind: "teleport", x: -6, y: 0, z: 7.0, yawDeg: 0 });
    for (let i = 0; i < 20; i++) tick();
    expect(room.sim.prompt(a.session.ctrl!.id)).toBe("barricade");
    a.cmd = { buttons: Btn.Interact };
    for (let i = 0; i < 2 * TICK_HZ + 6; i++) tick();
    a.cmd = {};
    for (let i = 0; i < 4; i++) tick();
    expect([door.empty, door.broken, door.hp]).toEqual([false, false, room.sim.data.destruction.barricade.hp]);
    // It blocks: walking at it, the body stays on this side.
    a.cmd = { forward: 1 };
    for (let i = 0; i < 60; i++) tick();
    expect(body().z).toBeGreaterThan(6.05);
    // Three knife hits (the knife's cycle apart).
    a.cmd = {};
    for (let k = 0; k < 3; k++) {
      a.cmd = { buttons: Btn.Melee };
      tick();
      a.cmd = {};
      for (let i = 0; i < room.sim.data.combat.melee.cycleSeconds * TICK_HZ + 4; i++) tick();
    }
    expect(door.broken).toBe(true);
    a.cmd = { forward: 1 };
    for (let i = 0; i < 90; i++) tick();
    expect(body().z).toBeLessThan(5.5); // through the door
    expect(body().mode).toBe(PawnMode.Walk);
    // Back on the far side of the door, put it up again over the broken one, then pry it off.
    room.onLabTool(a.id, { kind: "teleport", x: -6, y: 0, z: 5.0, yawDeg: 180 });
    a.cmd = { yaw: Math.PI };
    for (let i = 0; i < 20; i++) tick();
    a.cmd = { yaw: Math.PI, buttons: Btn.Interact };
    for (let i = 0; i < 2 * TICK_HZ + 6; i++) tick();
    a.cmd = { yaw: Math.PI };
    tick();
    expect([door.empty, door.broken]).toEqual([false, false]);
    expect(room.sim.prompt(a.session.ctrl!.id)).toBe("unbarricade");
    a.cmd = { yaw: Math.PI, buttons: Btn.Interact };
    for (let i = 0; i < 1 * TICK_HZ + 6; i++) tick();
    expect(door.empty).toBe(true);
    expect(a.session.sim!.level.panels.hash()).toBe(room.sim.level.panels.hash());
    expect(body().stance).toBe(Stance.Stand);
  });
});
