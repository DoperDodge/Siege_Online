// Gadgets online (Phase 8 M1, gadgets/DESIGN.md §3, §11): a throw or a placed gadget reaches every client's table
// with the snapshot after it, byte for byte the server's (the hash agrees); its thrower predicted it all (no
// corrections); a late joiner gets the table whole, and so does a client that missed ops or disagrees.
import { describe, expect, it } from "vitest";
import { Btn, GFlag, kindOf, ticks } from "../src/index.js";
import { roomWith } from "./roomHarness.js";

/** In front of the Destruction Lab's plain soft wall, 1.4 m from it, facing it. */
const SOFT = { x: -8, y: 0, z: -4.5, yawDeg: 0 };

async function setup(ops = ["sledge", "fuze"]) {
  const h = await roomWith("destruction_lab", ops);
  const wait = (n: number) => {
    for (let i = 0; i < n; i++) h.tick();
  };
  wait(16);
  /** Every client's table is the server's. */
  const agree = () => h.clients.every((c) => c.session.sim!.gadgets.hash() === h.room.sim.gadgets.hash() && c.session.sim!.gadgets.list.length === h.room.sim.gadgets.list.length);
  return { ...h, wait, agree };
}

describe("gadgets online (Phase 8 M1)", () => {
  it("a frag thrown: every client has it flying, then resting, then gone at its fuse; the thrower predicted it all", async () => {
    const { room, clients, tick, wait, agree } = await setup();
    const [a, b] = clients;
    const missed = a.session.mispredictions.length;
    a.cmd = { buttons: Btn.Gadget };
    tick();
    a.cmd = {};
    wait(ticks(room.sim.data.gadgetRules.equipS) + 2);
    a.cmd = { buttons: Btn.Fire, pitch: -0.2 };
    wait(ticks(room.sim.data.gadgetRules.throw.windupS) + 1);
    a.cmd = { pitch: -0.2 };
    wait(2);
    const [g] = room.sim.gadgets.list;
    expect([g.kind, g.flags & GFlag.Flying, g.owner]).toEqual([kindOf("frag"), GFlag.Flying, a.session.ctrl!.id]);
    expect(agree()).toBe(true);
    expect(b.session.sim!.gadgets.list[0]).toEqual(g);
    // It lands: everyone hears where it rests.
    for (let i = 0; i < 4 * 64 && room.sim.gadgets.list[0]?.flags & GFlag.Flying; i++) tick();
    wait(2);
    expect(room.sim.gadgets.list[0].flags & GFlag.Flying).toBe(0);
    expect(agree()).toBe(true);
    // Gone at its fuse.
    wait(3 * 64);
    expect([room.sim.gadgets.list.length, agree()]).toEqual([0, true]);
    expect(a.session.mispredictions.length).toBe(missed);
  }, 60_000);

  it("a Breach Charge placed: everyone has it; a late joiner gets the table; its detonator takes it away for everyone", async () => {
    const { room, clients, add, tick, wait, agree } = await setup();
    const [, f] = clients;
    room.onLabTool(f.id, { kind: "teleport", ...SOFT });
    wait(16);
    const missed = f.session.mispredictions.length;
    f.cmd = { buttons: Btn.Gadget };
    tick();
    f.cmd = {};
    wait(ticks(room.sim.data.gadgetRules.equipS) + 2);
    f.cmd = { buttons: Btn.Fire };
    for (let i = 0; i < 3 * 64 && room.sim.gadgets.list.length === 0; i++) tick();
    f.cmd = {};
    wait(4);
    expect(room.sim.gadgets.list.map((g) => g.kind)).toEqual([kindOf("breach_charge")]);
    expect(agree()).toBe(true);
    const late = await add("mute");
    wait(2);
    expect(late.session.sim!.gadgets.list).toEqual(room.sim.gadgets.list);
    // The detonator is out after placing: Fire sets it off.
    f.cmd = { buttons: Btn.Fire };
    tick();
    f.cmd = {};
    wait(4);
    expect([room.sim.gadgets.list.length, agree()]).toEqual([0, true]);
    expect(f.session.mispredictions.length).toBe(missed);
  }, 60_000);

  it("lab tools: Clear gadgets takes a waiting charge away (its detonator goes, the next charge comes out); Refill gives them back", async () => {
    const { room, clients, tick, wait, agree } = await setup();
    const [, f] = clients;
    room.onLabTool(f.id, { kind: "teleport", ...SOFT });
    wait(16);
    f.cmd = { buttons: Btn.Gadget };
    tick();
    f.cmd = {};
    wait(ticks(room.sim.data.gadgetRules.equipS) + 2);
    f.cmd = { buttons: Btn.Fire };
    for (let i = 0; i < 3 * 64 && room.sim.gadgets.list.length === 0; i++) tick();
    f.cmd = {};
    wait(4);
    const own = () => f.session.sim!.pawns.get(f.session.ctrl!.possessedPawnId)!.state;
    expect([own().w1, own().g1, own().hand]).toEqual([1, 2, 2]); // the detonator in hand
    room.onLabTool(f.id, { kind: "clearGadgets" });
    wait(4);
    expect([room.sim.gadgets.list.length, agree()]).toEqual([0, true]);
    expect([own().w1, own().g1, own().hand]).toEqual([0, 2, 1]); // corrected: the next charge out
    room.onLabTool(f.id, { kind: "refill" });
    wait(4);
    expect(own().g1).toBe(3);
  }, 60_000);

  it("a client not reading gets the whole table with its next snapshot; one whose table disagrees asks for it again", async () => {
    const { room, clients, tick, wait, agree } = await setup();
    const [a, b] = clients;
    b.buffered = 1 << 30;
    a.cmd = { buttons: Btn.Gadget };
    tick();
    a.cmd = {};
    wait(ticks(room.sim.data.gadgetRules.equipS) + 2);
    a.cmd = { buttons: Btn.Fire };
    wait(ticks(room.sim.data.gadgetRules.throw.windupS) + 1);
    a.cmd = {};
    wait(4);
    expect(b.session.sim!.gadgets.list.length).toBe(0);
    b.buffered = 0;
    wait(2);
    expect(agree()).toBe(true);
    // Tampered with: the next ops' hash disagrees, it asks, and gets the table.
    b.session.sim!.gadgets.replace([]);
    for (let i = 0; i < 6 * 64 && room.sim.gadgets.list.length > 0; i++) tick();
    wait(4);
    expect(agree()).toBe(true);
    expect(room.stats.gadgetResyncs + b.session.stats.gadgetStates).toBeGreaterThan(0);
  }, 60_000);
});
