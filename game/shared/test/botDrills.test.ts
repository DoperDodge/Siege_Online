// Bot Training's drills and setup (Phase 9 M8; bots/DESIGN.md §2, §10; data/modes/drill_*.json): each drill sets its
// rounds up as it says and ends them as it should; "counter my pick" answers your operator.
import { describe, expect, it } from "vitest";
import {
  ATTACK,
  ByteReader,
  DEFENSE,
  encodeLobbyAction,
  handleRoomMessage,
  isFormat,
  loadGameData,
  Phase,
  PawnKind,
  PawnMode,
  Room,
  roomAt,
  TICK_HZ,
  WinReason,
  type FormatMode,
  type Pawn,
} from "../src/index.js";

const data = loadGameData();

/** A drill (or Bot Training with `bots` changed) started with the person in it. */
async function drill(format: string, seed = 3, bots?: Partial<NonNullable<FormatMode["match"]["bots"]>>) {
  const room = await Room.create("DRL", "oregon", { format, seed });
  const host = room.join("you", { send() {}, buffered: () => 0 })!;
  const send = (b: Uint8Array) => handleRoomMessage(room, host, b[0], new ByteReader(b.subarray(1)));
  const mode = data.modes.get(format)!;
  if (!isFormat(mode)) throw new Error(format);
  if (bots) send(encodeLobbyAction({ kind: "change", change: { kind: "bots", bots: { ...mode.match.bots!, ...bots } } }));
  room.step();
  send(encodeLobbyAction({ kind: "start" }));
  room.step();
  const m = room.director!.match;
  const until = (done: () => boolean, seconds: number) => {
    for (let i = 0; i < seconds * TICK_HZ && !done(); i++) room.step();
    return done();
  };
  const person = [...m.players.values()].find((p) => p.bot === null)!;
  const body = (id: number): Pawn | undefined => {
    const c = room.bodyOf(id);
    return c ? room.sim.pawns.get(c.possessedPawnId) : undefined;
  };
  return { room, m, until, person, body, send };
}

describe("Bot Training drills (Phase 9 M8)", () => {
  it("the six drills are formats with a drill block; Bot Training's own has none", () => {
    const drills = [...data.modes.values()].filter(isFormat).filter((m) => m.match.drill);
    expect(drills.map((m) => m.id).sort()).toEqual(["drill_clear", "drill_custom", "drill_drone", "drill_duel", "drill_retake", "drill_site_hold"]);
    expect((data.modes.get("bot_training") as FormatMode).match.drill).toBeNull();
    // The duel's doors and the storey to clear are Oregon's.
    const level = data.levels.get("oregon")!;
    expect(level.storeys.some((s) => s.id === (data.modes.get("drill_clear") as FormatMode).match.drill!.storey)).toBe(true);
    void level;
  });

  it("1v1 aim duel: straight into action either side of a doorway, no defuser; the round ends on a kill; the next is at the next door, sides swapped", async () => {
    const { room, m, until, person, body } = await drill("drill_duel", 3);
    expect(until(() => m.phase === Phase.Action, 20)).toBe(true);
    expect(m.sides[ATTACK].length).toBe(1);
    expect(m.sides[DEFENSE].length).toBe(1);
    expect(room.sim.objective).toBeNull();
    const ids = [m.sides[ATTACK][0], m.sides[DEFENSE][0]];
    const [a, d] = ids.map((id) => body(id)!);
    const apart = Math.hypot(a.state.x - d.state.x, a.state.z - d.state.z);
    expect(apart).toBeGreaterThan(6);
    expect(apart).toBeLessThan(10);
    const first = room.director!.drillSpots.get(ids[0])!.pos;
    // The person stands still facing the door: the bot takes the round.
    expect(until(() => m.phase === Phase.RoundEnd, 30)).toBe(true);
    expect(m.history[0].reason).toBe(WinReason.Elimination);
    expect(m.history[0].winner).toBe(m.players.get(ids.find((id) => id !== person.id)!)!.team);
    expect(until(() => m.phase === Phase.Action && m.round === 2, 30)).toBe(true);
    // Round 2: sides swapped, another door.
    expect(m.sideOf(person.id)).not.toBe(m.history[0].attackers === m.players.get(person.id)!.team ? ATTACK : DEFENSE);
    const now = room.director!.drillSpots.get(m.sides[ATTACK][0])!.pos;
    expect(Math.hypot(now[0] - first[0], now[2] - first[2])).toBeGreaterThan(3);
  }, 120000);

  it("retake: the round starts with the defuser planted in the site, the attackers round it, the defender bots off in the rooms about; they come and disable it", async () => {
    const { room, m, until, person, body } = await drill("drill_retake", 4);
    expect(until(() => m.phase === Phase.PostPlant, 30)).toBe(true);
    expect(m.sides[DEFENSE].length).toBe(3);
    const at = room.sim.objective!.planted!;
    const site = room.sim.level.def.sites.find((s) => s.id === m.site)!;
    expect(site.rooms).toContain(roomAt(room.sim.level.def, at[0], at[1] + 0.3, at[2]));
    const you = body(person.id)!;
    expect(Math.hypot(you.state.x - at[0], you.state.z - at[2])).toBeLessThan(8);
    for (const id of m.sides[DEFENSE]) {
      const b = body(id)!;
      expect(Math.hypot(b.state.x - at[0], b.state.y - at[1], b.state.z - at[2])).toBeGreaterThan(8);
    }
    // You step away (far off): the defenders retake.
    room.sim.teleport(you.id, 75, 0, 70, 0);
    expect(until(() => m.phase === Phase.RoundEnd, 60)).toBe(true);
    expect(m.history[0].reason).toBe(WinReason.Disabled);
  }, 120000);

  it("site hold: you defend alone against five attacking bots, who drone in prep", async () => {
    const { m, until, person, room } = await drill("drill_site_hold", 5);
    expect(until(() => m.phase === Phase.Prep, 40)).toBe(true);
    expect(m.sideOf(person.id)).toBe(DEFENSE);
    expect(m.sides[DEFENSE]).toEqual([person.id]);
    expect(m.sides[ATTACK].length).toBe(5);
    until(() => false, 2);
    const drones = [...room.sim.pawns.values()].filter((p) => p.kind === PawnKind.Drone && p.team === ATTACK && p.state.mode === PawnMode.Walk);
    expect(drones.length).toBeGreaterThanOrEqual(5);
  }, 120000);

  it("clear a floor: five defender bots on the first floor, a room each, no defuser; they hold there", async () => {
    const { room, m, until, body } = await drill("drill_clear", 6);
    expect(until(() => m.phase === Phase.Action, 30)).toBe(true);
    expect(room.sim.objective).toBeNull();
    const level = room.sim.level.def;
    const rooms = m.sides[DEFENSE].map((id) => {
      const b = body(id)!;
      return roomAt(level, b.state.x, b.state.y + 0.3, b.state.z);
    });
    expect(rooms.every((r) => r !== null && level.rooms.find((x) => x.id === r)!.storey === "1F")).toBe(true);
    expect(new Set(rooms).size).toBe(5);
    // A few seconds on, still there (holding the spots they were put on).
    until(() => false, 6);
    for (const id of m.sides[DEFENSE]) {
      const b = body(id)!;
      const spot = room.director!.drillSpots.get(id)!.pos;
      expect(Math.hypot(b.state.x - spot[0], b.state.z - spot[2])).toBeLessThan(1.5);
    }
  }, 120000);

  it("drone and call: the round is over when prep is, won by the attacker who found every defender; lost otherwise", async () => {
    const { room, m, until } = await drill("drill_drone", 7);
    expect(until(() => m.phase === Phase.Prep, 40)).toBe(true);
    // Every defender pinged (as a ping on each would).
    const spot = (room as unknown as { spotted(p: Pawn, by: number, side: number): void }).spotted.bind(room);
    for (const id of m.sides[DEFENSE]) spot(room.sim.pawns.get(room.bodyOf(id)!.possessedPawnId)!, 0, ATTACK);
    expect(room.director!.foundCount).toBe(5);
    expect(until(() => m.phase === Phase.RoundEnd, 70)).toBe(true);
    expect(m.history[0].reason).toBe(WinReason.Found);
    expect(m.history[0].winner).toBe(m.attackers);
    // Round 2, nobody found: the defenders win when prep ends.
    expect(until(() => m.phase === Phase.Prep && m.round === 2, 60)).toBe(true);
    expect(until(() => m.phase === Phase.RoundEnd, 70)).toBe(true);
    expect(m.history[1].reason).toBe(WinReason.Time);
    expect(m.history[1].winner).not.toBe(m.history[1].attackers);
  }, 120000);

  it("custom scenario: rounds start straight from action (a moment's prep, no drones)", async () => {
    const { room, m, until } = await drill("drill_custom", 8);
    expect(until(() => m.phase === Phase.Prep, 40)).toBe(true);
    const prepAt = room.sim.tick;
    expect([...room.sim.pawns.values()].some((p) => p.kind === PawnKind.Drone && p.state.mode === PawnMode.Walk)).toBe(false);
    expect(until(() => m.phase === Phase.Action, 10)).toBe(true);
    expect(room.sim.tick - prepAt).toBeLessThanOrEqual(4 * TICK_HZ);
    expect(room.sim.objective).not.toBeNull();
  }, 120000);

  it("counter my pick: the defending bots answer your Thermite with Mute, Mira and Lesion", async () => {
    const { room, m, until, person } = await drill("bot_training", 9, { picks: "counter" });
    expect(until(() => m.phase === Phase.Planning, 10)).toBe(true);
    room.pickOperator(person.id, "thermite");
    expect(until(() => m.sides[DEFENSE].every((id) => m.players.get(id)!.operator !== null), 40)).toBe(true);
    const ops = m.sides[DEFENSE].map((id) => m.players.get(id)!.operator);
    for (const op of ["mute", "mira", "lesion"]) expect(ops).toContain(op);
  }, 120000);
});
