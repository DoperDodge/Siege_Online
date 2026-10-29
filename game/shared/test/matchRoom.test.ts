// A match room (Phase 6 M2; match/DESIGN.md §2, §4–§7) with in-process clients: the lobby, the round's phases with
// bodies (defenders at the site for prep, attackers at their spawns for action), red walls, run-outs, the kill plane,
// leaving, the score and the end — driven through the room's real messages, as the server's are.
import { describe, expect, it } from "vitest";
import {
  ATTACK,
  ByteReader,
  Cause,
  ClientSession,
  DEFENSE,
  DT,
  encodeLobbyAction,
  encodeMatchAction,
  encodePickLoadout,
  defaultLoadoutPick,
  ErrorCode,
  handleRoomMessage,
  isFormat,
  loadGameData,
  Phase,
  PawnMode,
  Room,
  Stance,
  WinReason,
  type GameEvent,
  type LobbyAction,
  type MatchAction,
} from "../src/index.js";

const data = loadGameData();
const custom = data.modes.get("custom")!;
if (!isFormat(custom)) throw new Error("custom");

/** Custom with short timers: a match plays in seconds of test time. */
const quick = (over: Record<string, unknown> = {}) => ({
  match: {
    ...custom.match,
    rounds: 2,
    swapEvery: 1,
    overtime: { rounds: 1, winBy: 1, swapEvery: 1 },
    bans: null,
    seconds: { ...custom.match.seconds, pick: 5, prep: 5, action: 30, roundEnd: 2 },
    ...over,
  },
});

async function matchRoom(format = "custom", seed = 5) {
  const room = await Room.create("MATCH", "oregon", { format, seed });
  const clock = { t: 0 };
  type Client = { name: string; session: ClientSession; id: number; toServer: Uint8Array[]; events: GameEvent[]; errors: { code: number; message: string }[] };
  const clients: Client[] = [];
  const add = async (name: string) => {
    const toServer: Uint8Array[] = [];
    const events: GameEvent[] = [];
    const errors: Client["errors"] = [];
    const session = new ClientSession({ send: (b) => toServer.push(b), now: () => clock.t, onEvents: (_t, evs) => events.push(...evs), onError: (code, message) => errors.push({ code, message }) });
    const c: Client = { name, session, id: 0, toServer, events, errors };
    const id = room.join(name, { send: (b) => session.handle(b), buffered: () => 0 });
    if (id === null) throw new Error(`${name} couldn't join`);
    c.id = id;
    await session.loaded();
    clients.push(c);
    return c;
  };
  const tick = () => {
    clock.t += DT * 1000;
    for (const c of clients) if (c.session.ready) c.session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0 });
    for (const c of clients)
      for (const b of c.toServer.splice(0)) {
        if (!handleRoomMessage(room, c.id, b[0], new ByteReader(b.subarray(1)))) throw new Error(`unexpected message ${b[0]}`);
      }
    room.step();
  };
  const lobby = (c: Client, a: LobbyAction) => c.toServer.push(encodeLobbyAction(a));
  const act = (c: Client, a: MatchAction) => c.toServer.push(encodeMatchAction(a));
  const match = room.director!.match;
  /** Tick until `done` (at most `seconds` of match time). */
  const until = (done: () => boolean, seconds: number, what: string) => {
    for (let i = 0; i < seconds / DT; i++) {
      if (done()) return;
      tick();
    }
    throw new Error(`timed out waiting for ${what} (phase ${match.phase}, round ${match.round})`);
  };
  const bodyOf = (c: Client) => {
    const ctrl = room.bodyOf(c.id);
    return ctrl ? room.sim.pawns.get(ctrl.possessedPawnId)! : null;
  };
  return { room, match, clients, add, tick, lobby, act, until, bodyOf };
}

describe("match rooms", () => {
  it("1v1 (first to 3): lobby, prep with the defender at the voted site behind red walls, action with the attacker at their spawn, rounds won both ways, overtime and the end", async () => {
    const t = await matchRoom();
    const host = await t.add("host");
    const guest = await t.add("guest");
    t.tick();
    // Joining: no bodies, and each player sees the lobby with both of them.
    expect([t.room.bodyOf(host.id), t.room.bodyOf(guest.id)]).toEqual([null, null]);
    expect(host.session.match).toMatchObject({ phase: Phase.Lobby, host: host.id, you: host.id, format: "custom" });
    expect(host.session.match!.players.map((p) => p.name)).toEqual(["host", "guest"]);
    expect(host.session.matchRules).not.toBeNull();
    // Only the host changes the rules; the guest's start is refused and so is starting before everyone is ready.
    t.lobby(guest, { kind: "change", change: { kind: "rules", rules: quick({ rounds: 4 }) } });
    t.lobby(host, { kind: "start" });
    t.tick();
    expect(guest.errors.at(-1)).toMatchObject({ code: ErrorCode.Refused, message: "Only the host can do that" });
    expect(host.errors.at(-1)?.message).toMatch(/Waiting for guest/);
    // A change of rules un-readies everyone; then the guest readies and the host starts.
    t.lobby(host, { kind: "change", change: { kind: "rules", rules: quick({ rounds: 4 }) } });
    t.tick();
    t.lobby(guest, { kind: "ready", ready: true });
    t.tick();
    t.lobby(host, { kind: "start" });
    t.tick();
    expect(t.match.phase).toBe(Phase.Planning);
    expect(JSON.parse(guest.session.matchRules!).match.seconds.prep).toBe(5);

    const [atk, def] = t.match.attackers === t.match.players.get(host.id)!.team ? [host, guest] : [guest, host];
    t.lobby(atk, { kind: "ready", ready: false }); // the lobby is over: refused, harmlessly
    atk.toServer.push(encodePickLoadout(defaultLoadoutPick(data, "thermite")));
    def.toServer.push(encodePickLoadout(defaultLoadoutPick(data, "mute")));
    t.act(def, { kind: "siteVote", site: "SITE_LAUNDRY" });
    t.act(atk, { kind: "spawn", group: "C_CONSTRUCTION" });
    t.act(atk, { kind: "siteVote", site: "SITE_DORMS" }); // attackers don't vote
    t.tick();
    expect(atk.errors.at(-1)?.message).toMatch(/Not voting on the site/);
    // The attacker doesn't know the site; the defender does once it's chosen.
    t.until(() => t.match.phase === Phase.Prep, 10, "prep");
    t.tick();
    expect(atk.session.match!.site).toBeNull();
    expect(def.session.match!.site).toBe("SITE_LAUNDRY");
    expect(def.session.match!.redWalls).toBe(true);
    expect(t.room.sim.matchRules.redWalls).toBe(true);
    expect(def.session.sim!.matchRules.redWalls).toBe(true);
    const defBody = t.bodyOf(def)!;
    expect(defBody.operatorId).toBe("mute");
    expect(defBody.team).toBe(DEFENSE);
    const laundry = t.room.sim.level.def.spawns.filter((s) => s.group === "SITE_LAUNDRY")[0];
    expect(Math.hypot(defBody.state.x - laundry.pos[0], defBody.state.z - laundry.pos[2])).toBeLessThan(1.5);
    expect(t.bodyOf(atk)).toBeNull();
    expect(t.room.sim.deployRules.pools).toEqual([0, 6]);

    // Action: the attacker at C Construction; the red walls come down.
    t.until(() => t.match.phase === Phase.Action, 10, "action");
    t.tick();
    const atkBody = t.bodyOf(atk)!;
    const construction = t.room.sim.level.def.spawns.find((s) => s.group === "C_CONSTRUCTION")!;
    expect(atkBody.operatorId).toBe("thermite");
    expect(Math.hypot(atkBody.state.x - construction.pos[0], atkBody.state.z - construction.pos[2])).toBeLessThan(1.5);
    expect(t.room.sim.matchRules.redWalls).toBe(false);
    expect(def.session.match!.players.find((p) => p.id === atk.id)!.operator).toBe("thermite");
    // The defender goes down and, the last one up, dies: the attackers win by elimination.
    t.room.killBody(t.bodyOf(def)!.id, Cause.Lab);
    t.tick();
    expect(t.match.history[0]).toMatchObject({ round: 1, winner: t.match.players.get(atk.id)!.team, reason: WinReason.Elimination, site: "SITE_LAUNDRY" });
    expect(t.match.phase).toBe(Phase.RoundEnd);

    // Round 2: the sides swap (nobody picks: the timer does). Time runs out: the defenders win.
    t.until(() => t.match.phase === Phase.Prep, 15, "round 2's prep");
    expect([t.match.round, t.match.sideOf(atk.id)]).toEqual([2, DEFENSE]);
    expect(t.bodyOf(atk)!.team).toBe(DEFENSE);
    t.until(() => t.match.phase === Phase.Action, 10, "round 2's action");
    t.until(() => t.match.phase === Phase.RoundEnd, 35, "round 2's end");
    const A = t.match.players.get(atk.id)!.team;
    const D = t.match.players.get(def.id)!.team;
    expect(t.match.history[1]).toMatchObject({ round: 2, reason: WinReason.Time, winner: A });
    // Rounds 3 and 4: the other player wins both, as defender then attacker: 2–2.
    for (const r of [3, 4]) {
      t.until(() => t.match.phase === Phase.Action && t.match.round === r, 20, `round ${r}'s action`);
      t.tick();
      t.room.killBody(t.bodyOf(atk)!.id, Cause.Lab);
      t.tick();
      expect(t.match.history[r - 1]).toMatchObject({ round: r, reason: WinReason.Elimination, winner: D });
    }
    expect(t.match.score[A]).toBe(2);
    expect(t.match.score[D]).toBe(2);

    // Overtime: the side swaps going in; the attacker leaves mid-action and dies there: the defenders win the match.
    t.until(() => t.match.phase === Phase.Action && t.match.round === 5, 20, "overtime's action");
    t.tick();
    expect(t.match.overtime()).toBe(true);
    const leaver = t.match.sideOf(host.id) === ATTACK ? host : guest;
    const stayer = leaver === host ? guest : host;
    const leaverBody = t.bodyOf(leaver)!;
    t.room.leave(leaver.id);
    t.tick();
    expect(leaverBody.state.mode).toBe(PawnMode.Dead);
    expect(stayer.events.some((e) => e.kind === "kill" && e.cause === Cause.Left)).toBe(true);
    t.until(() => t.match.phase === Phase.MatchEnd, 5, "the match end");
    expect(t.match.winner).toBe(t.match.players.get(stayer.id)!.team);
    expect(stayer.session.match).toMatchObject({ phase: Phase.MatchEnd, winner: t.match.winner, host: stayer.id });
    expect(stayer.session.match!.history.map((h) => h.reason)).toEqual([WinReason.Elimination, WinReason.Time, WinReason.Elimination, WinReason.Elimination, WinReason.Elimination]);
    expect(t.room.bodyOf(stayer.id)).toBeNull();
    // Back to the lobby (the new host is the one still here).
    t.lobby(stayer, { kind: "backToLobby" });
    t.tick();
    expect(t.match.phase).toBe(Phase.Lobby);
  }, 60_000);

  it("2v3: uneven teams spawn and play; a defender outside in action is detected (attackers see it); out of the map is death", async () => {
    const t = await matchRoom("custom", 9);
    const cs = [];
    for (const name of ["a", "b", "c", "d", "e"]) cs.push(await t.add(name));
    // Blue 2, Orange 3: the joiners alternate, so move one.
    t.tick();
    const blue = cs.filter((c) => t.match.players.get(c.id)!.team === 0);
    expect(blue.length).toBe(3);
    t.lobby(cs[0], { kind: "move", member: blue[2].id, team: 1 });
    t.lobby(cs[0], { kind: "change", change: { kind: "rules", rules: quick({ rounds: 4 }) } });
    t.tick();
    for (const c of cs.slice(1)) t.lobby(c, { kind: "ready", ready: true });
    t.tick();
    t.lobby(cs[0], { kind: "start" });
    t.tick();
    expect(t.match.phase).toBe(Phase.Planning);
    expect([t.match.team(0).length, t.match.team(1).length]).toEqual([2, 3]);
    const attackers = cs.filter((c) => t.match.sideOf(c.id) === ATTACK);
    const defenders = cs.filter((c) => t.match.sideOf(c.id) === DEFENSE);
    t.until(() => t.match.phase === Phase.Action, 15, "action");
    t.tick();
    expect(attackers.every((c) => t.bodyOf(c)?.team === ATTACK)).toBe(true);
    expect(defenders.every((c) => t.bodyOf(c)?.team === DEFENSE)).toBe(true);
    // Every operator is unique within a team.
    for (const side of [attackers, defenders]) expect(new Set(side.map((c) => t.bodyOf(c)!.operatorId)).size).toBe(side.length);
    // A defender outside the building: detected after the grace second, by the attackers only.
    const runner = t.bodyOf(defenders[0])!;
    const out = t.room.sim.level.def.spawns.find((s) => s.group === "B_STREET")!;
    t.room.sim.teleport(runner.id, out.pos[0] + 2, out.pos[1], out.pos[2]);
    for (let i = 0; i < 1.2 / DT + 10; i++) t.tick();
    expect(attackers[0].session.match!.detected).toEqual([runner.id]);
    expect(defenders[1].session.match!.detected).toEqual([]);
    // Below the kill plane: dead.
    const faller = t.bodyOf(attackers[0])!;
    t.room.sim.teleport(faller.id, out.pos[0], t.room.sim.level.def.bounds!.killY - 5, out.pos[2]);
    t.tick();
    expect(faller.state.mode).toBe(PawnMode.Dead);
    expect(t.match.players.get(attackers[0].id)!.deaths).toBe(1);
    // The other attackers die too: the defenders win the round by elimination.
    for (const c of attackers.slice(1, -1)) t.room.killBody(t.bodyOf(c)!.id, Cause.Lab);
    t.tick();
    expect(t.match.phase).toBe(Phase.Action);
    t.room.killBody(t.bodyOf(attackers.at(-1)!)!.id, Cause.Lab);
    t.tick();
    expect(t.match.history[0]).toMatchObject({ reason: WinReason.Elimination, winner: t.match.players.get(defenders[0].id)!.team });
  }, 60_000);
});
