// Bots in match rooms (Phase 9 M1; bots/DESIGN.md §1, §2): connectionless members that fill a Bot Training lobby,
// make the planning screens' choices, stand in rounds and never take a person's place; backfill in other formats.
import { describe, expect, it } from "vitest";
import {
  ByteReader,
  ClientSession,
  DEFENSE,
  DT,
  encodeLobbyAction,
  encodeMatchAction,
  ErrorCode,
  handleRoomMessage,
  isFormat,
  loadGameData,
  Phase,
  PawnMode,
  Room,
  Stance,
  type BotsRules,
  type GameEvent,
  type InputCmd,
  type LobbyAction,
} from "../src/index.js";

const data = loadGameData();
const bt = data.modes.get("bot_training")!;
if (!isFormat(bt)) throw new Error("bot_training");

/** Bot Training with short timers. */
const quick = (over: Record<string, unknown> = {}) => ({
  match: { ...bt.match, rounds: 2, overtime: null, seconds: { ...bt.match.seconds, pick: 10, prep: 5, action: 30, roundEnd: 2 }, ...over },
});

async function botRoom(format = "bot_training", seed = 9) {
  const room = await Room.create("BOTS", "oregon", { format, seed });
  const clock = { t: 0 };
  type Client = { name: string; session: ClientSession; id: number; toServer: Uint8Array[]; events: GameEvent[]; errors: { code: number; message: string }[]; cmd: Partial<Omit<InputCmd, "seq">> };
  const clients: Client[] = [];
  const add = async (name: string) => {
    const toServer: Uint8Array[] = [];
    const c: Client = { name, session: null as unknown as ClientSession, id: 0, toServer, events: [], errors: [], cmd: {} };
    c.session = new ClientSession({
      send: (b) => toServer.push(b),
      now: () => clock.t,
      onEvents: (_t, evs) => c.events.push(...evs),
      onError: (code, message) => c.errors.push({ code, message }),
      trackMispredictions: true,
    });
    const id = room.join(name, { send: (b) => c.session.handle(b), buffered: () => 0 });
    if (id === null) throw new Error(`${name} couldn't join`);
    c.id = id;
    await c.session.loaded();
    clients.push(c);
    return c;
  };
  const tick = () => {
    clock.t += DT * 1000;
    for (const c of clients) if (c.session.ready) c.session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...c.cmd });
    for (const c of clients) for (const b of c.toServer.splice(0)) handleRoomMessage(room, c.id, b[0], new ByteReader(b.subarray(1)));
    room.step();
  };
  const lobby = (c: Client, a: LobbyAction) => c.toServer.push(encodeLobbyAction(a));
  const match = room.director!.match;
  const until = (done: () => boolean, seconds: number, what: string) => {
    for (let i = 0; i < seconds / DT; i++) {
      if (done()) return;
      tick();
    }
    throw new Error(`timed out waiting for ${what} (phase ${match.phase}, round ${match.round})`);
  };
  const bots = (team?: 0 | 1) => [...match.players.values()].filter((p) => p.bot !== null && (team === undefined || p.team === team));
  return { room, match, clients, add, tick, lobby, until, bots };
}

describe("bots in match rooms (Phase 9 M1)", () => {
  it("a Bot Training lobby fills both teams around its one person, at each team's difficulty; the bots are ready, never host", async () => {
    const t = await botRoom();
    const you = await t.add("you");
    t.tick();
    expect(t.match.hostId).toBe(you.id);
    expect(t.bots(0).length).toBe(4);
    expect(t.bots(1).length).toBe(5);
    expect(t.room.size).toBe(1); // only people count: the server drops a room only bots are in
    expect(t.bots().every((p) => p.ready && p.bot === "normal" && /^BOT [A-Z]/.test(p.name))).toBe(true);
    expect(new Set(t.bots().map((p) => p.name)).size).toBe(9);
    // The lobby tells the person who's a bot.
    const view = you.session.match!;
    expect(view.players.filter((p) => p.bot === "normal").length).toBe(9);
    expect(view.players.find((p) => p.id === you.id)!.bot).toBeNull();

    // The host's settings: 3 v 2, Orange Elite. The teams follow at once.
    const bots: BotsRules = { fill: true, size: [3, 2], difficulty: ["normal", "elite"], picks: "random", site: null };
    t.lobby(you, { kind: "change", change: { kind: "bots", bots } });
    t.tick();
    expect([t.bots(0).length, t.bots(1).length]).toEqual([2, 2]);
    expect(t.bots(1).every((p) => p.bot === "elite")).toBe(true);
    // Removing a bot takes one off its team's size; it doesn't come back.
    t.lobby(you, { kind: "kick", member: t.bots(1)[0].id });
    t.tick();
    t.tick();
    expect(t.bots(1).length).toBe(1);
    expect(JSON.parse(you.session.matchRules!).match.bots.size).toEqual([3, 1]);
  });

  it("a person joining takes a bot's place, even in a full lobby; moving onto a team of bots takes one's place there", async () => {
    const t = await botRoom();
    const you = await t.add("you");
    t.tick();
    expect(t.match.players.size).toBe(10);
    const friend = await t.add("friend");
    t.tick();
    expect(t.match.players.size).toBe(10);
    expect(t.match.players.get(friend.id)!.bot).toBeNull();
    expect(t.match.hostId).toBe(you.id);
    const [mine, other] = [t.match.players.get(you.id)!.team, t.match.players.get(friend.id)!.team];
    expect(t.match.team(other).filter((p) => p.bot === null).length).toBe(other === mine ? 2 : 1);
    // The friend moves to the host's team (full of bots and the host): a bot there makes way, and one fills theirs.
    if (other !== mine) {
      t.lobby(friend, { kind: "team", team: mine });
      t.tick();
      expect(friend.errors).toEqual([]);
      expect(t.match.players.get(friend.id)!.team).toBe(mine);
      expect(t.match.team(mine).length).toBe(5);
      expect(t.match.team(other).length).toBe(5);
    }
    // The person leaving the lobby: a bot takes the free place.
    t.room.leave(friend.id);
    t.tick();
    expect(t.match.players.size).toBe(10);
  });

  it("a match plays: bots pick operators (after the person on their team), defenders' bots agree on a site, attackers' choose spawns, bodies stand in each round, rounds end on time", async () => {
    const t = await botRoom();
    const you = await t.add("you");
    t.tick();
    t.lobby(you, { kind: "change", change: { kind: "rules", rules: quick() } });
    t.tick();
    t.lobby(you, { kind: "start" });
    t.tick();
    expect(you.errors).toEqual([]);
    expect(t.match.phase).toBe(Phase.Planning);
    // Bot Training's first round: Blue (the host's team) attacks; sides alternate every round.
    expect(t.match.attackers).toBe(0);
    // The person's team's bots wait for the person (until the last seconds): the enemy bots have picked already.
    t.until(() => t.bots(1).every((p) => p.operator !== null), 4, "the enemy bots' picks");
    expect(t.bots(0).every((p) => p.operator === null)).toBe(true);
    t.until(() => t.match.phase === Phase.Prep, 12, "prep");
    // Everyone has an operator, all different on a side; the site is one the defenders' bots all voted for.
    const atk = t.match.sides[0].map((id) => t.match.players.get(id)!);
    const def = t.match.sides[DEFENSE].map((id) => t.match.players.get(id)!);
    expect(atk.every((p) => p.operator) && def.every((p) => p.operator)).toBe(true);
    expect(new Set(def.map((p) => p.operator)).size).toBe(5);
    expect(new Set(def.map((p) => p.siteVote))).toEqual(new Set([t.match.site]));
    expect(atk.filter((p) => p.bot).every((p) => p.spawn !== null)).toBe(true);
    // Defenders' bodies stand at the site in prep, and turn their heads (their own input, applied by the room).
    const botDef = def.find((p) => p.bot)!;
    const ctrl = t.room.bodyOf(botDef.id)!;
    const pawn = t.room.sim.pawns.get(ctrl.possessedPawnId)!;
    const yaw0 = pawn.state.yaw;
    for (let i = 0; i < 64 * 3; i++) t.tick();
    expect(pawn.state.mode).toBe(PawnMode.Walk);
    expect(Math.abs(pawn.state.yaw - yaw0)).toBeGreaterThan(0.01);
    expect(t.room.memberInfo(botDef.id)!.lastSeq).toBeGreaterThan(64);
    // No bot is ever corrected (the server's state is theirs).
    expect(t.room.memberInfo(botDef.id)!.corrections).toBe(0);
    t.until(() => t.match.phase === Phase.RoundEnd, 40, "the round's end on time");
    expect(t.match.history[0]).toMatchObject({ winner: 1 }); // nobody planted: the defenders win on time
    t.until(() => t.match.phase === Phase.MatchEnd, 60, "the match end");
    expect(t.match.round).toBe(2);
    expect(t.match.history[1].attackers).toBe(1); // alternating
    // Bots walk now (M2): one brushing past the person's body moves it a little as the server has the bot where the
    // client didn't yet: a correction or two, as with any other player walking into you.
    expect(you.session.mispredictions.length).toBeLessThanOrEqual(3);
    expect(you.errors).toEqual([]);
  });

  it("Bot Training's fixed site: the defenders' vote can't change it", async () => {
    const t = await botRoom();
    const you = await t.add("you");
    t.tick();
    t.lobby(you, { kind: "change", change: { kind: "rules", rules: quick({ firstAttack: "orange", bots: { ...bt.match.bots!, site: "SITE_MEETING" } }) } });
    t.tick();
    t.lobby(you, { kind: "start" });
    t.tick();
    expect(t.match.sideOf(you.id)).toBe(DEFENSE);
    you.toServer.push(encodeMatchAction({ kind: "siteVote", site: "SITE_DORMS" }));
    t.tick();
    expect(you.errors.at(-1)).toMatchObject({ code: ErrorCode.Refused });
    t.until(() => t.match.phase === Phase.Prep, 12, "prep");
    expect(t.match.site).toBe("SITE_MEETING");
  });

  it("backfill: Unranked's host turns bots on and the empty slots fill; Ranked can't have bots", async () => {
    const t = await botRoom("unranked");
    const you = await t.add("you");
    t.tick();
    expect(t.bots().length).toBe(0);
    t.lobby(you, { kind: "change", change: { kind: "bots", bots: { fill: true, size: [2, 2], difficulty: ["hard", "hard"], picks: "fixed", site: "SITE_DORMS" } } });
    t.tick();
    // A toggle format's bots fill every slot, pick at random and leave the site to the vote.
    expect(t.bots().length).toBe(9);
    expect(JSON.parse(you.session.matchRules!).match.bots).toMatchObject({ size: [5, 5], picks: "random", site: null, difficulty: ["hard", "hard"] });
    // Removing one: the format fills every slot, so the host is told to turn them off instead.
    t.lobby(you, { kind: "kick", member: t.bots()[0].id });
    t.tick();
    expect(you.errors.at(-1)?.message).toMatch(/turn its bots off/);
    t.lobby(you, { kind: "change", change: { kind: "bots", bots: null } });
    t.tick();
    expect(t.bots().length).toBe(0);

    const r = await botRoom("ranked");
    const me = await r.add("me");
    r.tick();
    r.lobby(me, { kind: "change", change: { kind: "bots", bots: { fill: true, size: [5, 5], difficulty: ["normal", "normal"], picks: "random", site: null } } });
    r.tick();
    expect(me.errors.at(-1)?.message).toMatch(/can't have bots/);
    expect(r.bots().length).toBe(0);
  });
});
