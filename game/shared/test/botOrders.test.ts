// Orders to bot teammates off the comm wheel (Phase 9 M6; bots/DESIGN.md §8; data/intel.json `botOrders`): Go here
// and Hold here (the last ping's spot), Breach this (the wall or hatch pinged), Follow me, Regroup, and the old
// callouts that mean something to bots (Push, Rotate, Help).
import { describe, expect, it } from "vitest";
import { ATTACK, botLoadout, ByteReader, DEFENSE, encodeLobbyAction, handleRoomMessage, isFormat, loadGameData, panelAt, Phase, PawnMode, Room, sides, TICK_HZ, type FormatMode, type Pawn, type Vec3 } from "../src/index.js";

const data = loadGameData();
const mode = data.modes.get("bot_training")!;
if (!isFormat(mode)) throw new Error("bot_training");
const bt: FormatMode = mode;
const callout = (name: string) => data.intel.callouts.indexOf(name);

/** The person on Blue with four bot teammates playing `mates`, against five bots; Blue attacks first unless `defend`. */
async function team(mates: string[], defend = false, seed = 4) {
  const room = await Room.create("ORD", "oregon", { format: "bot_training", seed });
  const host = room.join("you", { send() {}, buffered: () => 0 })!;
  const send = (b: Uint8Array) => handleRoomMessage(room, host, b[0], new ByteReader(b.subarray(1)));
  const rules = { ...bt.match, swapEvery: 24, overtime: null, firstAttack: defend ? "orange" : "blue", bots: { ...bt.match.bots!, size: [5, 5], site: "SITE_DINING" }, seconds: { ...bt.match.seconds, pick: 8, prep: 40, action: 180 } };
  send(encodeLobbyAction({ kind: "change", change: { kind: "rules", rules: { match: rules } } } as Parameters<typeof encodeLobbyAction>[0]));
  room.step();
  send(encodeLobbyAction({ kind: "start" }));
  room.step();
  const m = room.director!.match;
  const until = (done: () => boolean, seconds: number) => {
    for (let i = 0; i < seconds * TICK_HZ && !done(); i++) room.step();
    return done();
  };
  expect(until(() => m.phase === Phase.Planning, 5)).toBe(true);
  const person = [...m.players.values()].find((p) => p.bot === null)!;
  const side = () => m.sideOf(person.id);
  const mine = [...m.players.values()].filter((p) => p.bot !== null && m.sideOf(p.id) === side());
  expect(mine.length).toBe(4);
  mine.forEach((p, k) => room.pickLoadout(p.id, botLoadout(data, mates[k])));
  room.pickLoadout(person.id, botLoadout(data, defend ? "mute" : "thermite"));
  const body = (id: number): Pawn => room.sim.pawns.get(room.bodyOf(id)!.possessedPawnId)!;
  const you = () => body(person.id);
  /** The person pings `at` (where their view's ray landed). */
  const ping = (at: Vec3) => (room as unknown as { ping(ctrl: number, pos: Vec3, gadget: number, heart: boolean): void }).ping(room.bodyOf(person.id)!.id, at, -1, false);
  const order = (name: string) => room.onCallout(person.id, callout(name));
  const near = (a: Pawn, p: readonly number[], r: number) => Math.hypot(a.state.x - p[0], a.state.z - p[2]) < r && Math.abs(a.state.y - p[1]) < 1.5;
  const info = () => mine.map((p, k) => `${mates[k]} ${body(p.id).state.x.toFixed(1)},${body(p.id).state.y.toFixed(1)},${body(p.id).state.z.toFixed(1)} order ${JSON.stringify(room.botOf(p.id)!.ordered(room.sim.tick))?.slice(0, 120)} doing ${room.botOf(p.id)!.doing}`).join("\n");
  return { room, m, until, person, mine, body, you, ping, order, near, info };
}

describe("orders to bot teammates (Phase 9 M6)", () => {
  it("the comm wheel has the orders, and every order callout is one of its callouts", () => {
    for (const name of ["Go here", "Hold here", "Breach this", "Follow me", "Regroup"]) expect(callout(name)).toBeGreaterThanOrEqual(0);
    for (const name of Object.keys(data.intel.botOrders)) expect(data.intel.callouts).toContain(name);
    expect(data.intel.callouts.length).toBeLessThanOrEqual(16);
  });

  it("Go here: the nearest bot goes to the pinged spot and holds there; Follow me: one keeps near you as you move; Regroup: all come to you", async () => {
    const { room, m, until, mine, body, you, ping, order, near, info } = await team(["sledge", "brava", "striker", "dokkaebi"]);
    expect(until(() => m.phase === Phase.Action, 60)).toBe(true);
    // In the Junkyard (open ground west of the house).
    room.sim.teleport(you().id, -21, 0, 46, 0);
    const spot: Vec3 = [-21.1, 0, 38];
    ping(spot);
    order("Go here");
    const goer = mine.find((p) => room.botOf(p.id)!.ordered(room.sim.tick) !== null)!;
    expect(goer, info()).toBeDefined();
    expect(until(() => near(body(goer.id), spot, 1.5), 30), info()).toBe(true);
    // It stays there (holding) a while.
    until(() => false, 4);
    expect(near(body(goer.id), spot, 1.5), info()).toBe(true);
    // Follow me: you walk off (teleported along the Junkyard); the follower keeps up.
    order("Follow me");
    const follower = mine.find((p) => room.botOf(p.id)!.ordered(room.sim.tick)?.kind === "follow")!;
    expect(follower, info()).toBeDefined();
    for (const p of [[-25, 0, 50], [-17, 0, 52]] as Vec3[]) {
      room.sim.teleport(you().id, p[0], p[1], p[2], 0);
      expect(until(() => near(body(follower.id), p, 3.2), 20), info()).toBe(true);
    }
    // Regroup: every bot teammate on its feet comes to you.
    order("Regroup");
    const at: Vec3 = [you().state.x, you().state.y, you().state.z];
    const up = () => mine.filter((p) => body(p.id).state.mode === PawnMode.Walk);
    expect(until(() => up().every((p) => near(body(p.id), at, 4)), 30), info()).toBe(true);
  }, 300000);

  it("Breach this: a teammate with something to open it with opens the pinged wall", async () => {
    const { room, m, until, you, ping, order, info } = await team(["sledge", "brava", "striker", "dokkaebi"], false, 5);
    expect(until(() => m.phase === Phase.Action, 60)).toBe(true);
    // A soft wall of the Showers (the plan's soft breach for Sledge), pinged from the Showers' side.
    const e = room.sim.level.panels.byId.get("SW-1F-03")!;
    const s = sides(room.sim.level.def, e, 0.05).find((x) => x.room === "1F_SHOWERS")!;
    const at: Vec3 = [s.pos[0], s.pos[1] + 1.2, s.pos[2]];
    expect(panelAt(room.sim, at)?.panel.spec.id).toBe("SW-1F-03");
    const stand = sides(room.sim.level.def, e, 2).find((x) => x.room === "1F_SHOWERS")!.pos;
    room.sim.teleport(you().id, stand[0], stand[1], stand[2], 0);
    ping(at);
    order("Breach this");
    expect(until(() => e.panel.modified, 45), info()).toBe(true);
  }, 300000);

  it("Push: the attacking bots drop their jobs before the way in; Rotate: the defending bots' roamers come back to the site", async () => {
    const a = await team(["sledge", "brava", "striker", "thermite"], false, 6);
    expect(a.until(() => a.m.phase === Phase.Action, 60)).toBe(true);
    a.until(() => false, 1);
    expect(a.room.attackPlan!.jobList().some((j) => !j.done)).toBe(true);
    a.order("Push");
    expect(a.room.attackPlan!.jobList().every((j) => j.done)).toBe(true);
    expect(a.mine.every((p) => a.room.attackPlan!.taskOf(p.id)?.kind !== "gadget")).toBe(true);
    void ATTACK;

    const d = await team(["mute", "mira", "lesion", "sentry"], true, 7);
    expect(d.until(() => d.m.phase === Phase.Action, 60)).toBe(true);
    const plan = d.room.defensePlan!;
    const anchors = data.bots.strats.get("oregon")!.sites.SITE_DINING.defense.anchors;
    const roamer = d.mine.find((p) => plan.taskOf(p.id)?.kind === "roam" && !(plan.taskOf(p.id) as { rooms: string[] }).rooms.every((r) => anchors.includes(r)));
    expect(roamer).toBeDefined();
    d.order("Rotate");
    const t = plan.taskOf(roamer!.id);
    expect(t?.kind === "roam" && t.rooms.every((r) => anchors.includes(r))).toBe(true);
    void DEFENSE;
  }, 300000);
});
