// The gadget table and its wire (Phase 8 M1, gadgets/DESIGN.md §3–§4): the server's ops make a client's table the
// server's, byte for byte (the same hash); the whole table round-trips; flights are the same wherever they're stepped.
import { describe, expect, it } from "vitest";
import {
  ByteReader,
  decodeGadgetOps,
  decodeGadgetState,
  encodeGadgetOps,
  encodeGadgetState,
  Flights,
  GadgetTable,
  GFlag,
  kindOf,
  MSG_GADGET_OPS,
  MSG_GADGET_STATE,
  Sim,
  type Gadget,
  type GadgetData,
} from "../src/index.js";

type ThrowUse = Extract<GadgetData["use"], { kind: "throw" }>;

const entry = (over: Partial<Gadget> = {}): Omit<Gadget, "id"> => ({
  kind: kindOf("frag"),
  owner: 3,
  team: 0,
  pos: [1.1, 0.04, -2.3],
  yaw: 0.7,
  vel: [0, 0, 0],
  flags: GFlag.OnFloor,
  panel: -1,
  launchTick: 100,
  fuseEnd: 356,
  signalEnd: 0,
  readyAt: 0,
  seq: 70001,
  ...over,
});

describe("the gadget table (Phase 8 M1)", () => {
  it("keeps entries float32-exact in id order; ops replayed on another table give the same entries and hash", () => {
    const server = new GadgetTable();
    const a = server.add(entry());
    const b = server.add(entry({ kind: kindOf("nitro_cell"), flags: GFlag.Flying, vel: [1.3, 2.7, -9.1], team: 1, panel: 12 }));
    expect([a.id, b.id]).toEqual([1, 2]);
    expect(a.pos[0]).toBe(Math.fround(1.1));
    expect(a.seq).toBe(70001 & 0xffff);
    server.update(a.id, { flags: a.flags | GFlag.Broken });
    server.remove(b.id);
    const c = server.add(entry({ kind: kindOf("bulletproof_camera"), signalEnd: 2000 }));
    const client = new GadgetTable();
    const ops = server.takeOps();
    expect(ops.map((o) => o.kind)).toEqual(["put", "put", "put", "remove", "put"]);
    const msg = decodeGadgetOps(new ByteReader(encodeGadgetOps({ tick: 7, ops, hash: server.hash() }).subarray(1)));
    for (const op of msg.ops) client.apply(op);
    expect(client.list).toEqual(server.list);
    expect([client.hash(), msg.tick]).toEqual([server.hash(), 7]);
    expect(client.list.map((g) => g.id)).toEqual([a.id, c.id]);
    expect(server.takeOps()).toEqual([]);
  });

  it("a new round clears it; ids go on counting; the whole table round-trips", () => {
    const server = new GadgetTable();
    server.add(entry());
    server.clear();
    const d = server.add(entry({ flags: GFlag.Flying, vel: [0.5, 1, 2] }));
    expect(d.id).toBe(2);
    const bytes = encodeGadgetState(server.list);
    expect(bytes[0]).toBe(MSG_GADGET_STATE);
    const client = new GadgetTable();
    client.replace(decodeGadgetState(new ByteReader(bytes.subarray(1))));
    expect([client.list, client.hash()]).toEqual([server.list, server.hash()]);
    // Ops already in a table a client was sent whole do nothing more (a member who joined mid-tick).
    for (const op of server.takeOps()) client.apply(op);
    expect(client.hash()).toBe(server.hash());
    expect(encodeGadgetOps({ tick: 1, ops: [], hash: 0 })[0]).toBe(MSG_GADGET_OPS);
  });

  it("refuses a malformed message: a kind past the list, ids out of order", () => {
    const bad = encodeGadgetState([{ ...entry(), id: 2 }, { ...entry(), id: 1 }] as Gadget[]);
    expect(() => decodeGadgetState(new ByteReader(bad.subarray(1)))).toThrow();
    const kind = encodeGadgetState([{ ...entry({ kind: 250 }), id: 1 }] as Gadget[]);
    expect(() => decodeGadgetState(new ByteReader(kind.subarray(1)))).toThrow();
  });
});

describe("flights (Phase 8 M1)", () => {
  it("a frag thrown at a wall bounces back and rests on the floor; stepped elsewhere, the same path to the last bit", async () => {
    const sim = await Sim.create("destruction_lab");
    const use = sim.data.gadgets.get("frag")!.use as ThrowUse;
    const ctx = { q: sim, rules: sim.data.gadgetRules, gravity: sim.data.movement.gravity };
    // From 3 m in front of the plain soft wall (z −5.9), at 12 m/s toward it.
    const g: Gadget = { id: 1, ...entry({ pos: [-8, 1.5, -3], vel: [0, 1, -12], flags: GFlag.Flying }) };
    const a = new Flights(ctx).at(g, use, 64 * 6);
    const b = new Flights(ctx);
    for (let t = 0; t <= 64 * 6; t += 7) b.at(g, use, t); // a little at a time, like a client drawing it
    const bb = b.at(g, use, 64 * 6);
    expect(a.end?.how).toBe("rest");
    expect(a.firstHit).toBeGreaterThan(0);
    expect(Math.max(...a.path.map((p) => p[2]))).toBeLessThanOrEqual(-3 + 1e-9); // never past where it left, behind
    expect(Math.min(...a.path.map((p) => p[2]))).toBeGreaterThan(-5.9); // never through the wall
    expect(a.end!.pos[1]).toBeCloseTo(sim.data.gadgetRules.throw.radiusM, 2);
    expect(bb.path).toEqual(a.path);
    expect(bb.end).toEqual(a.end);
  });

  it("an impact grenade goes off where it first hits; one that meets nothing goes off after 20 m", async () => {
    const sim = await Sim.create("destruction_lab");
    const ctx = { q: sim, rules: sim.data.gadgetRules, gravity: sim.data.movement.gravity };
    const use = sim.data.gadgets.get("impact_grenade")!.use as ThrowUse;
    const wall = new Flights(ctx).at({ id: 1, ...entry({ pos: [-8, 1.5, -3], vel: [0, 0, -15], flags: GFlag.Flying }) }, use, 200);
    expect([wall.end?.how, wall.end?.panel !== -1]).toEqual(["impact", true]);
    expect(wall.end!.pos[2]).toBeCloseTo(-5.9 + sim.data.gadgetRules.throw.radiusM, 2);
    // Straight up over the open middle: 20 m of flight, then it goes off in the air.
    const up = new Flights(ctx).at({ id: 2, ...entry({ pos: [0, 1.5, 20], vel: [0, 30, 0], flags: GFlag.Flying }) }, use, 400);
    expect([up.end?.how, up.end?.normal]).toEqual(["impact", null]);
    expect(up.travelled).toBeGreaterThanOrEqual(20);
  });
});
