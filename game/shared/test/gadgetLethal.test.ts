// The lethal gadgets on the server (Phase 8 M2, gadgets/DESIGN.md §5, §7): the Claymore's tripwire (armed 1 s after it's
// placed, three lasers, enemies only, not Skopós's idle shell), impact grenades going off on the first body they meet,
// and in a room a frag's blast: damage credited to its thrower, everyone told, what it destroys.
import { describe, expect, it } from "vitest";
import { ATTACK, Btn, DEFENSE, GadgetServer, GFlag, isIngredient, kindOf, Sim, ticks, type Gadget, type GameEvent, type Vec3 } from "../src/index.js";
import { roomWith } from "./roomHarness.js";

/** A sim on the Gadget Lab with a server side whose blasts are only recorded. */
async function lab() {
  const sim = await Sim.create("gadget_lab");
  const went: { g: Gadget; at: Vec3 }[] = [];
  const server = new GadgetServer(sim, (g, at) => went.push({ g, at }));
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      sim.step(new Map());
      server.step();
    }
  };
  return { sim, server, went, step };
}

describe("the Claymore's tripwire (Phase 8 M2)", () => {
  it("armed 1 s after it's placed; a defender crossing a laser sets it off; an attacker doesn't", async () => {
    const { sim, server, went, step } = await lab();
    const a = sim.addPlayer("a", "brava", 0, undefined, undefined, ATTACK);
    const d = sim.addPlayer("d", "mute", 1, undefined, undefined, DEFENSE);
    const atk = sim.pawns.get(a.possessedPawnId)!;
    const def = sim.pawns.get(d.possessedPawnId)!;
    sim.teleport(atk.id, 10, 0, 16, 0);
    sim.teleport(def.id, -10, 0, 16, 0);
    step(2);
    // On the open floor facing −z (its lasers ahead and 30° either side, 2 m).
    server.onEvent({ kind: "place", pawnId: atk.id, seq: 1, slot: 1, gadget: "claymore", pos: [0, 0.07, 13], yaw: 0, onFloor: true, flat: false, panel: -1 });
    const [clay] = sim.gadgets.list;
    expect(clay.readyAt - sim.tick).toBe(ticks(1));
    // The attacker stands on its middle laser: nothing.
    sim.teleport(atk.id, 0, 0, 12, 0);
    step(ticks(1) + 4);
    expect(went).toEqual([]);
    // A defender on it before it's armed: nothing either (a fresh one).
    sim.teleport(atk.id, 10, 0, 16, 0);
    server.onEvent({ kind: "place", pawnId: atk.id, seq: 2, slot: 1, gadget: "claymore", pos: [-6, 0.07, 13], yaw: 0, onFloor: true, flat: false, panel: -1 });
    sim.teleport(def.id, -6, 0, 12, 0);
    step(ticks(1) - 2);
    expect(went).toEqual([]);
    step(4);
    expect(went.map((w) => w.g.kind)).toEqual([kindOf("claymore")]);
    expect(sim.gadgets.list.map((g) => g.id)).toEqual([clay.id]); // the one that went off is gone
    // Its side laser (30° to the right of its facing, 2 m long) catches a defender there too.
    const [fx, fz] = [Math.sin(-30 * (Math.PI / 180)) * -1.5, -Math.cos(-30 * (Math.PI / 180)) * 1.5];
    sim.teleport(def.id, 0 + fx, 0, 13 + fz, 0);
    step(2);
    expect(went.length).toBe(2);
  });

  it("Skopós's idle shell standing on a laser doesn't set it off; it does once she's in that shell", async () => {
    const { sim, server, went, step } = await lab();
    const a = sim.addPlayer("a", "brava", 0, undefined, undefined, ATTACK);
    const s = sim.addPlayer("s", "skopos", 1, undefined, undefined, DEFENSE);
    const [active, idle] = s.pawnIds.map((id) => sim.pawns.get(id)!);
    sim.teleport(sim.pawns.get(a.possessedPawnId)!.id, 10, 0, 16, 0);
    sim.teleport(active.id, -10, 0, 16, 0);
    sim.teleport(idle.id, 0, 0, 12, 0, 1);
    step(2);
    server.onEvent({ kind: "place", pawnId: a.possessedPawnId, seq: 1, slot: 1, gadget: "claymore", pos: [0, 0.07, 13], yaw: 0, onFloor: true, flat: false, panel: -1 });
    step(ticks(1) + 8);
    expect(went).toEqual([]);
    s.possessedPawnId = idle.id; // she's in it now (the swap itself is Phase 1's, D-139)
    step(2);
    expect(went.length).toBe(1);
  });
});

describe("impact grenades (Phase 8 M2)", () => {
  it("go off on the first body they meet, not their thrower's; else where they hit", async () => {
    const { sim, server, went, step } = await lab();
    const s = sim.addPlayer("s", "skopos", 1, undefined, undefined, DEFENSE);
    const a = sim.addPlayer("a", "sledge", 0, undefined, undefined, ATTACK);
    const thrower = sim.pawns.get(s.possessedPawnId)!;
    const target = sim.pawns.get(a.possessedPawnId)!;
    sim.teleport(thrower.id, 0, 0, 16, 0);
    sim.teleport(s.pawnIds[1], 6, 0, 16, 0);
    sim.teleport(target.id, 0, 0, 11, 0);
    step(2);
    // Straight at the attacker, chest high, from in front of the thrower's own chest.
    server.onEvent({ kind: "throw", pawnId: thrower.id, seq: 1, slot: 1, gadget: "impact_grenade", pos: [0, 1.2, 15.4], vel: [0, 0, -15], yaw: 0 });
    for (let i = 0; i < 64 && went.length === 0; i++) step();
    expect(went.length).toBe(1);
    expect(went[0].at[2]).toBeGreaterThan(11);
    expect(went[0].at[2]).toBeLessThan(11.6);
    // Nobody on its way: it goes off on the soft wall far ahead.
    sim.teleport(target.id, 10, 0, 16, 0);
    step(2);
    server.onEvent({ kind: "throw", pawnId: thrower.id, seq: 2, slot: 1, gadget: "impact_grenade", pos: [-8, 1.5, 0], vel: [0, 0, -15], yaw: 0 });
    for (let i = 0; i < 64 && went.length === 1; i++) step();
    expect(went[1].at[2]).toBeCloseTo(-5.9 + sim.data.gadgetRules.throw.radiusM, 1);
  });
});

describe("a frag in a room (Phase 8 M2)", () => {
  it("lobbed at a dummy, it goes off at its fuse: the dummy is hurt by its thrower's frag, everyone sees the blast", async () => {
    const h = await roomWith("gadget_lab", ["sledge", "mute"]);
    const [a, b] = h.clients;
    const wait = (n: number) => {
      for (let i = 0; i < n; i++) h.tick();
    };
    wait(8);
    // The "Defender in the open" dummy stands at (3, 0, 2); Sledge 2.5 m north of it, facing it.
    h.room.onLabTool(a.id, { kind: "teleport", x: 3, y: 0, z: 4.5, yawDeg: 0 });
    h.room.onLabTool(b.id, { kind: "teleport", x: -12, y: 0, z: 16, yawDeg: 0 });
    wait(8);
    const dummy = [...h.room.sim.pawns.values()].find((p) => Math.hypot(p.state.x - 3, p.state.z - 2) < 0.3)!;
    const hp = dummy.state.hp;
    a.cmd = { buttons: Btn.Gadget };
    h.tick();
    a.cmd = {};
    wait(ticks(h.room.sim.data.gadgetRules.equipS) + 2);
    a.cmd = { buttons: Btn.Ads, pitch: -0.5 };
    wait(ticks(h.room.sim.data.gadgetRules.throw.windupS) + 1);
    a.cmd = {};
    for (let i = 0; i < 5 * 64 && h.room.sim.gadgets.list.length > 0; i++) h.tick();
    wait(4);
    const blasts = (c: { events: GameEvent[] }) => c.events.filter((e) => e.kind === "blast");
    expect([blasts(a).length, blasts(b).length]).toEqual([1, 1]);
    expect(dummy.state.hp < hp || dummy.state.mode !== 0).toBe(true);
    const feed = [...a.events, ...b.events].find((e) => (e.kind === "kill" || e.kind === "down") && (e.kind === "kill" ? e.victimPawn : e.victimPawn) === dummy.id);
    if (feed && (feed.kind === "kill" || feed.kind === "down")) expect(feed.weapon).toBe("frag");
    // The frag is gone (the level's ingredients stay in the table).
    expect(h.room.sim.gadgets.list.filter((g) => !isIngredient(g.kind))).toEqual([]);
    void GFlag;
  }, 60_000);
});
