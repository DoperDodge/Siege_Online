// Ohm's Brownout Pucks (Project Redmond R3 M5, gadgets/R3_OPERATORS.md §2): thrown or lobbed from his slot 2, a puck
// skids along the floor (little comes back off it, little is lost along it); 1.5 s after it comes to rest it pulses
// once: the defenders' electronics within 4.5 m, through walls and floors, are off for 12 s and their bodies jammed as
// long; the attackers' own devices aren't touched. One bullet destroys it before it pulses. A bot playing Ohm lobs one
// at the plan's first hard breach before it's blown.
import { describe, expect, it } from "vitest";
import {
  Btn,
  botLoadout,
  ByteReader,
  defaultLoadoutPick,
  encodeLobbyAction,
  GFlag,
  Hand,
  handleRoomMessage,
  isFormat,
  kindId,
  kindOf,
  loadGameData,
  Phase,
  Room,
  TICK_HZ,
  ticks,
  type FormatMode,
  type Gadget,
  type Vec3,
} from "../src/index.js";
import { scene, type Scene } from "./interactions/harness.js";

const PUCK = kindOf("brownout_puck");
const data = loadGameData();
const puckData = data.gadgets.get("brownout_puck")!;
const REST_S = puckData.use.kind === "throw" ? puckData.use.restS! : 0;

/** Ohm (client 0) takes his pucks out (Z) and throws one (Fire; ADS lobs it) looking `look`: its entry. */
function toss(s: Scene, look: { yaw: number; pitch: number }, lob = false): Gadget {
  s.handOut(0, Hand.Ability, look);
  const before = new Set(s.sim.gadgets.list.map((g) => g.id));
  s.press(0, lob ? Btn.Ads : Btn.Fire, look);
  s.wait(ticks(s.sim.data.gadgetRules.throw.windupS) + 1);
  const g = s.sim.gadgets.list.find((e) => !before.has(e.id) && e.kind === PUCK);
  if (!g) throw new Error("no puck thrown");
  return g;
}

/** Where a thrown entry was each tick until it stopped flying (or `max` ticks), the last its rest. */
function follow(s: Scene, g: Gadget, max = 30 * TICK_HZ): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < max; i++) {
    const now = s.sim.gadgets.get(g.id);
    if (!now) break;
    out.push(s.room.gadgetServer.whereNow(now));
    if (!(now.flags & GFlag.Flying)) break;
    s.wait(1);
  }
  return out;
}

const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

describe("Ohm's loadout (R3)", () => {
  it("his slot 2 is the Brownout Puck, 3 a round; his kit is our own operator's", async () => {
    const op = data.operators.get("ohm")!;
    expect([op.name, op.side, op.ability.id, op.ability.name]).toEqual(["Ohm", "attacker", "brownout_puck", "Brownout Pucks"]);
    const s = await scene(["ohm", "mute"]);
    s.room.pickLoadout(s.clients[0].id, defaultLoadoutPick(s.sim.data, "ohm"));
    s.wait(8);
    expect(s.body(0).state.g2).toBe(3);
  });
});

describe("a Brownout Puck's flight (R3)", () => {
  it("thrown down at the floor it hardly bounces: it skids on along the floor, then rests on it", async () => {
    const s = await scene(["ohm", "mute"]);
    s.teleport(0, 0, 0, 14, 0);
    const puck = toss(s, { yaw: 0, pitch: -0.35 });
    const path = follow(s, puck);
    const r = s.sim.data.gadgetRules.throw.radiusM;
    const first = path.findIndex((p) => p[1] <= r + 0.01);
    expect(first).toBeGreaterThan(0);
    const after = path.slice(first);
    // Never more than a few centimetres off the floor once it's down, and a good way along it before it stops.
    expect(Math.max(...after.map((p) => p[1]))).toBeLessThan(0.12);
    const rest = path[path.length - 1];
    expect(flat(path[first], rest)).toBeGreaterThan(1.0);
    expect(rest[1]).toBeCloseTo(r, 2);
    expect(s.sim.gadgets.get(puck.id)!.flags & (GFlag.OnFloor | GFlag.Flying)).toBe(GFlag.OnFloor);
  });

  it("a frag thrown the same way bounces (the pucks' own bounce, not every throw's)", async () => {
    const s = await scene(["sledge", "mute"]);
    s.room.pickLoadout(s.clients[0].id, { ...defaultLoadoutPick(s.sim.data, "sledge"), gadgets: ["frag"] });
    s.wait(8);
    s.teleport(0, 0, 0, 14, 0);
    const look = { yaw: 0, pitch: -0.35 };
    s.handOut(0, Hand.Gadget, look);
    const before = new Set(s.sim.gadgets.list.map((g) => g.id));
    s.press(0, Btn.Fire, look);
    s.wait(ticks(s.sim.data.gadgetRules.throw.windupS) + 1);
    const frag = s.sim.gadgets.list.find((e) => !before.has(e.id))!;
    const path: Vec3[] = [];
    for (let i = 0; i < 64 && s.sim.gadgets.get(frag.id); i++) {
      path.push(s.room.gadgetServer.whereNow(s.sim.gadgets.get(frag.id)!));
      s.wait(1);
    }
    const r = s.sim.data.gadgetRules.throw.radiusM;
    const first = path.findIndex((p) => p[1] <= r + 0.01);
    expect(Math.max(...path.slice(first).map((p) => p[1]))).toBeGreaterThan(0.2);
  });
});

describe("a Brownout Puck's pulse (R3)", () => {
  /** Ohm 3.5 m from the reinforceable wall at z −6 (its front face −5.9), a Damper of Mute's 1.5 m behind it and another 6 m behind it. */
  async function atWall() {
    const s = await scene(["ohm", "mute"]);
    s.teleport(0, 1, 0, -2.4, 0);
    s.teleport(1, 20, 0, 20, 0);
    const near = s.put("signal_disruptor", 1, [1, 0.06, -7.5]);
    const far = s.put("signal_disruptor", 1, [1, 0.06, -12.2]);
    return { s, near, far };
  }

  it(`${REST_S} s after it rests it pulses once: a Damper behind the wall within 4.5 m is off for 12 s, one further isn't; then it's on again`, async () => {
    const { s, near, far } = await atWall();
    const puck = toss(s, { yaw: 0, pitch: -0.55 });
    const path = follow(s, puck);
    const rest = path[path.length - 1];
    expect(rest[2]).toBeGreaterThan(-5.95); // against the wall's face, this side
    expect(Math.hypot(rest[0] - near.pos[0], rest[1] - near.pos[1], rest[2] - near.pos[2])).toBeLessThan(4.5);
    const restTick = s.sim.tick;
    s.wait(ticks(REST_S) - 3);
    expect([s.sim.gadgets.get(puck.id)?.id, s.sim.gadgets.get(near.id)!.flags & GFlag.Off]).toEqual([puck.id, 0]);
    s.wait(4);
    expect(s.sim.gadgets.get(puck.id)).toBeUndefined();
    expect(s.sim.gadgets.get(near.id)!.flags & GFlag.Off).toBe(GFlag.Off);
    expect(s.sim.gadgets.get(far.id)!.flags & GFlag.Off).toBe(0);
    expect(s.sim.gadgets.get(near.id)!.offEnd - restTick - ticks(REST_S)).toBeLessThanOrEqual(ticks(12) + 2);
    expect(s.sim.gadgets.get(near.id)!.offEnd - restTick - ticks(REST_S)).toBeGreaterThanOrEqual(ticks(12) - 2);
    s.wait(ticks(12) + 2);
    expect(s.sim.gadgets.get(near.id)!.flags & GFlag.Off).toBe(0);
  });

  it("a defender's body in reach behind the wall is jammed as long; Ohm's own team's devices aren't touched", async () => {
    const { s } = await atWall();
    s.teleport(1, 1, 0, -8.5, 0);
    const own = s.put("claymore", 0, [2.5, 0.05, -4.5]);
    const puck = toss(s, { yaw: 0, pitch: -0.55 });
    follow(s, puck);
    s.wait(ticks(REST_S) + 2);
    expect(s.body(1).state.jammed).toBeGreaterThan(ticks(12) - 8);
    expect(s.sim.gadgets.get(own.id)!.flags & GFlag.Off).toBe(0);
  });

  it("one bullet destroys it before it pulses: nothing goes off", async () => {
    const { s, near } = await atWall();
    s.teleport(1, 3, 0, -2.5, 0);
    const puck = s.put("brownout_puck", 0, [1, 0.04, -5.5], { fuseEnd: s.sim.tick + ticks(30) });
    s.shootAt(1, puck.pos);
    expect(s.sim.gadgets.get(puck.id)).toBeUndefined();
    s.wait(4);
    expect(s.sim.gadgets.get(near.id)!.flags & GFlag.Off).toBe(0);
  });
});

describe("a bot playing Ohm (R3)", () => {
  const mode = data.modes.get("bot_training")!;
  if (!isFormat(mode)) throw new Error("bot_training");
  const bt: FormatMode = mode;

  it("lobs a puck to the foot of the Mill's first hard breach wall, on the Warping side", async () => {
    const room = await Room.create("OHM", "millrace", { format: "bot_training", seed: 4 });
    const host = room.join("you", { send() {}, buffered: () => 0 })!;
    const send = (b: Uint8Array) => handleRoomMessage(room, host, b[0], new ByteReader(b.subarray(1)));
    const rules = { ...bt.match, swapEvery: 24, overtime: null, firstAttack: "orange", bots: { ...bt.match.bots!, size: [1, 5], site: "SITE_MILL" }, seconds: { ...bt.match.seconds, pick: 8, prep: 45, action: 180 } };
    send(encodeLobbyAction({ kind: "change", change: { kind: "rules", rules: { match: rules } } } as Parameters<typeof encodeLobbyAction>[0]));
    room.step();
    send(encodeLobbyAction({ kind: "start" }));
    room.step();
    const m = room.director!.match;
    const step = (done: () => boolean, seconds: number) => {
      for (let i = 0; i < seconds * TICK_HZ && !done(); i++) room.step();
      return done();
    };
    expect(step(() => m.phase === Phase.Planning, 5)).toBe(true);
    const ops = ["ohm", "thermite", "striker", "sledge", "fuze"];
    const bots = [...m.players.values()].filter((p) => p.bot !== null);
    bots.forEach((p, k) => room.pickLoadout(p.id, botLoadout(data, ops[k])));
    expect(step(() => m.phase === Phase.Action, 60)).toBe(true);
    // The person (defending alone) out of the way: in the Coal Store, in the basement at the other end.
    const you = [...m.players.values()].find((p) => p.bot === null)!;
    room.sim.teleport(room.sim.pawns.get(room.bodyOf(you.id)!.possessedPawnId)!.id, 11, -3.2, 35.5, 0);
    const wall = room.sim.level.panels.byId.get("SW-1F-01")!;
    let landed: Vec3 | null = null;
    const ok = step(() => {
      for (const g of room.sim.gadgets.list) if (kindId(g.kind) === "brownout_puck" && !(g.flags & GFlag.Flying)) landed ??= [g.pos[0], g.pos[1], g.pos[2]];
      return landed !== null;
    }, 90);
    const jobs = room.attackPlan!.jobList().filter((j) => j.task.kind === "gadget" && j.task.tag.startsWith("puck"));
    expect(ok, JSON.stringify(jobs)).toBe(true);
    expect(jobs.length).toBe(1);
    const f = wall.frame;
    // Within a couple of metres of the wall, on the Warping side.
    const off = (landed![0] - f.center[0]) * f.n[0] + (landed![2] - f.center[2]) * f.n[2];
    const along = (landed![0] - f.center[0]) * f.u[0] + (landed![2] - f.center[2]) * f.u[2];
    expect(Math.abs(off)).toBeLessThan(2.5);
    expect(Math.abs(along)).toBeLessThan(f.w / 2 + 1);
  }, 300000);
});
