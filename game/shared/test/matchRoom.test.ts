// A match room (Phase 6 M2; match/DESIGN.md §2, §4–§7) with in-process clients: the lobby, the round's phases with
// bodies (defenders at the site for prep, attackers at their spawns for action), red walls, run-outs, the kill plane,
// leaving, the score and the end — driven through the room's real messages, as the server's are.
import { describe, expect, it } from "vitest";
import {
  applyDamage,
  ATTACK,
  Btn,
  ByteReader,
  Cause,
  ClientSession,
  DEFENSE,
  DEG,
  DT,
  encodeLobbyAction,
  encodeMatchAction,
  encodePickLoadout,
  defaultLoadoutPick,
  ErrorCode,
  handleRoomMessage,
  hash4,
  isFormat,
  loadGameData,
  Phase,
  PawnMode,
  Room,
  Stance,
  WinReason,
  type GameEvent,
  type InputCmd,
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
  /** `cmd`: this client's input for the next ticks (as roomHarness.ts has it). */
  type Client = { name: string; session: ClientSession; id: number; toServer: Uint8Array[]; events: GameEvent[]; errors: { code: number; message: string }[]; cmd: Partial<Omit<InputCmd, "seq">> };
  const clients: Client[] = [];
  const add = async (name: string) => {
    const toServer: Uint8Array[] = [];
    const events: GameEvent[] = [];
    const errors: Client["errors"] = [];
    const session = new ClientSession({
      send: (b) => toServer.push(b),
      now: () => clock.t,
      onEvents: (_t, evs) => events.push(...evs),
      onError: (code, message) => errors.push({ code, message }),
      trackMispredictions: true,
    });
    const c: Client = { name, session, id: 0, toServer, events, errors, cmd: {} };
    const id = room.join(name, { send: (b) => session.handle(b), buffered: () => 0 });
    if (id === null) throw new Error(`${name} couldn't join`);
    c.id = id;
    await session.loaded();
    clients.push(c);
    return c;
  };
  const tick = () => {
    clock.t += DT * 1000;
    for (const c of clients) if (c.session.ready) c.session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...c.cmd });
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
  /** Put a member's body somewhere (the server moves it; its client is corrected) and let it settle. */
  const place = (c: Client, x: number, y: number, z: number, yawDeg: number) => {
    const body = bodyOf(c)!;
    room.sim.teleport(body.id, x, y, z, yawDeg);
    room.correct(c.id);
    c.cmd = { yaw: yawDeg * DEG };
    for (let i = 0; i < 20; i++) tick();
  };
  /** Start a quick match with these players (the first is host) and these rules; returns once planning is on. */
  const start = async (names: string[], rules: Record<string, unknown>) => {
    const cs: Client[] = [];
    for (const n of names) cs.push(await add(n));
    tick();
    lobby(cs[0], { kind: "change", change: { kind: "rules", rules } });
    tick();
    for (const c of cs.slice(1)) lobby(c, { kind: "ready", ready: true });
    tick();
    lobby(cs[0], { kind: "start" });
    tick();
    return cs;
  };
  return { room, match, clients, add, tick, lobby, act, until, bodyOf, place, start };
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

describe("the defuser (match/DESIGN.md §8)", () => {
  /** The attacker and the defender of a 1v1 round. */
  const sides = <C extends { id: number }>(t: Awaited<ReturnType<typeof matchRoom>>, cs: C[]) => {
    const atk = cs.find((c) => t.match.sideOf(c.id) === ATTACK)!;
    const def = cs.find((c) => t.match.sideOf(c.id) === DEFENSE)!;
    return [atk, def] as const;
  };
  /** In the Laundry, 0.5 m and more from its walls and clear of its table: the site's first defender spawn. */
  const LAUNDRY: [number, number, number] = [39.345, -3.2, 32.805];

  it("its carrier plants it in the site (7 s held, predicted), the fuse runs out: attackers; next round a defender disables it in time: defenders", async () => {
    const t = await matchRoom("custom", 3);
    const cs = await t.start(["a", "b"], quick({ siteReveal: "roundStart" }));
    let [atk, def] = sides(t, cs);
    t.act(def, { kind: "siteVote", site: "SITE_LAUNDRY" });
    t.until(() => t.match.phase === Phase.Action, 15, "action");
    t.tick();
    const carrier = t.bodyOf(atk)!;
    expect(t.room.sim.objective).toMatchObject({ carrier: carrier.id, site: "SITE_LAUNDRY", canPlant: true, planted: null });
    const [atkClient, defClient] = [atk, def];
    expect(atkClient.session.match!.defuser!.carrier).toBe(carrier.id);
    expect(defClient.session.match!.defuser!.carrier).toBe(0); // defenders don't see the carrier
    // Outside the site there's no plant; inside, the prompt and a 7 s hold, the body held still.
    const atkCtrl = t.room.bodyOf(atk.id)!;
    expect(t.room.sim.prompt(atkCtrl.id)).not.toBe("plant");
    t.place(atkClient, ...LAUNDRY, 0);
    expect(t.room.sim.prompt(atkCtrl.id)).toBe("plant");
    const missedBefore = atkClient.session.mispredictions.length;
    const stood = { ...t.bodyOf(atk)!.state };
    atkClient.cmd = { yaw: 0, forward: 1, buttons: Btn.Interact };
    // The planter crouches for the plant (data/objective.json plantCrouches), with the stance key still on stand.
    t.until(() => t.bodyOf(atk)!.state.stance === Stance.Crouch, 1, "crouching to plant");
    t.until(() => t.match.phase === Phase.PostPlant, 8, "the plant");
    expect(t.match.phase).toBe(Phase.PostPlant);
    const planted = t.room.sim.objective!.planted!;
    expect(Math.hypot(planted[0] - stood.x, planted[2] - stood.z)).toBeLessThan(0.01); // held still while planting, W held
    expect(t.room.sim.objective!.carrier).toBe(0);
    expect(atkClient.session.mispredictions.length).toBe(missedBefore); // the hold was predicted
    t.tick();
    expect(defClient.session.match!.defuser!.planted).not.toBeNull();
    t.until(() => t.bodyOf(atk)!.state.stance === Stance.Stand, 1, "standing up after the plant");
    atkClient.cmd = {};
    // The fuse (45 s): the attackers win.
    t.until(() => t.match.phase === Phase.RoundEnd, 47, "the fuse");
    expect(t.match.history[0]).toMatchObject({ reason: WinReason.Detonated, winner: t.match.players.get(atk.id)!.team });

    // Round 2, sides swapped: plant again, then the defender disables it facing it from 1 m.
    t.until(() => t.match.phase === Phase.Planning && t.match.round === 2, 5, "round 2");
    [atk, def] = sides(t, cs);
    t.act(def, { kind: "siteVote", site: "SITE_LAUNDRY" });
    t.until(() => t.match.phase === Phase.Action, 15, "round 2's action");
    t.tick();
    const [a2, d2] = [atk, def];
    t.place(a2, ...LAUNDRY, 0);
    a2.cmd = { yaw: 0, buttons: Btn.Interact };
    t.until(() => t.match.phase === Phase.PostPlant, 8, "round 2's plant");
    a2.cmd = {};
    const p2 = t.room.sim.objective!.planted!;
    t.place(d2, p2[0] + 1, -3.2, p2[2], 90); // facing −x, toward it
    expect(t.room.sim.prompt(t.room.bodyOf(def.id)!.id)).toBe("disable");
    d2.cmd = { yaw: 90 * DEG, buttons: Btn.Interact };
    t.until(() => t.match.phase === Phase.RoundEnd, 8, "the disable");
    expect(t.match.history[1]).toMatchObject({ reason: WinReason.Disabled, winner: t.match.players.get(def.id)!.team });
  }, 120_000);

  it("drops where its carrier goes down, and a teammate picks it up from 1 m by pressing Use", async () => {
    // A seed whose first attackers are Blue, the team of two.
    let seed = 1;
    while ((hash4(seed, 0, 1, 0) & 1) !== 0) seed++;
    const t = await matchRoom("custom", seed);
    const cs = await t.start(["a", "b", "c"], quick({ siteReveal: "roundStart" }));
    expect(t.match.attackers).toBe(0);
    t.until(() => t.match.phase === Phase.Action, 15, "action");
    t.tick();
    const [first, second] = t.match.sides[ATTACK].map((id) => cs.find((c) => c.id === id)!);
    const body = t.bodyOf(first)!;
    expect(t.room.sim.objective!.carrier).toBe(body.id);
    t.place(first, ...LAUNDRY, 0);
    t.room.killBody(body.id, Cause.Lab);
    t.tick();
    const dropped = t.room.sim.objective!.dropped!;
    expect(t.room.sim.objective!.carrier).toBe(0);
    expect(Math.hypot(dropped[0] - LAUNDRY[0], dropped[2] - LAUNDRY[2])).toBeLessThan(0.1);
    expect(second.session.match!.defuser!.dropped).not.toBeNull();
    // 0.8 m away, looking the other way: a press picks it up.
    t.place(second, LAUNDRY[0] + 0.8, LAUNDRY[1], LAUNDRY[2], 90);
    expect(t.room.sim.prompt(t.room.bodyOf(second.id)!.id)).toBe("pickUp");
    second.cmd = { yaw: 90 * DEG, buttons: Btn.Interact };
    t.tick();
    t.tick();
    expect(t.room.sim.objective!.carrier).toBe(t.bodyOf(second)!.id);
    expect(t.room.sim.objective!.dropped).toBeNull();
    t.tick();
    expect(second.session.match!.carrier).toBe(second.id);
  }, 60_000);

  it("a plant under way when the timer runs out finishes and counts; let go after it, the defenders win on time", async () => {
    const t = await matchRoom("custom", 3);
    const cs = await t.start(["a", "b"], quick({ siteReveal: "roundStart" }));
    for (const round of [1, 2]) {
      const [a, def] = sides(t, cs);
      t.act(def, { kind: "siteVote", site: "SITE_LAUNDRY" });
      t.until(() => t.match.phase === Phase.Action && t.match.round === round, 20, `round ${round}'s action`);
      t.place(a, ...LAUNDRY, 0);
      // Start the 7 s plant 3 s before the 30 s run out.
      t.until(() => t.room.sim.tick >= t.match.phaseEnd - 3 * 64, 31, "3 s left");
      a.cmd = { yaw: 0, buttons: Btn.Interact };
      t.until(() => t.room.sim.tick >= t.match.phaseEnd + 64, 5, "a second past the timer");
      expect(t.match.phase).toBe(Phase.Action); // the plant under way keeps the round going
      if (round === 1) {
        t.until(() => t.match.phase === Phase.PostPlant, 4, "the late plant");
        a.cmd = {};
        t.until(() => t.match.phase === Phase.RoundEnd, 47, "the fuse");
        expect(t.match.history[0].reason).toBe(WinReason.Detonated);
      } else {
        a.cmd = {}; // let go before it's done
        t.tick();
        t.tick();
        expect(t.match.phase).toBe(Phase.RoundEnd);
        expect(t.match.history[1]).toMatchObject({ reason: WinReason.Time, winner: t.match.players.get(def.id)!.team });
      }
      t.until(() => t.match.phase === Phase.Planning || t.match.phase === Phase.MatchEnd, 5, "the next round");
    }
  }, 120_000);
});

describe("the defuser's edge cases", () => {
  it("planted on a hatch that is then destroyed: deactivated, the defenders win; and once planted, the last attacker up goes down instead of dying", async () => {
    const t = await matchRoom("custom", 3);
    const cs = await t.start(["a", "b"], quick({ siteReveal: "roundStart" }));
    const atk = cs.find((c) => t.match.sideOf(c.id) === ATTACK)!;
    const def = cs.find((c) => t.match.sideOf(c.id) === DEFENSE)!;
    t.act(def, { kind: "siteVote", site: "SITE_DORMS" });
    t.until(() => t.match.phase === Phase.Action, 15, "action");
    t.tick();
    // H4, in the Kids' Dorms' floor (one of the site's rooms).
    const h4 = t.room.sim.level.panels.byId.get("H4")!;
    const top = h4.max[1];
    const [hx, hz] = [(h4.min[0] + h4.max[0]) / 2, (h4.min[2] + h4.max[2]) / 2];
    t.place(atk, hx, top, hz, 0);
    atk.cmd = { yaw: 0, buttons: Btn.Interact };
    t.until(() => t.match.phase === Phase.PostPlant, 8, "the plant on the hatch");
    atk.cmd = {};
    // The last attacker standing goes down, not out: the defuser is planted (core_mechanics.md §10.1).
    const body = t.bodyOf(atk)!;
    expect(applyDamage(t.room.sim, body, { amount: body.state.hp, kill: false }, t.room.rules).outcome).toBe("downed");
    t.room.sim.refreshPawn(body.id);
    t.tick();
    expect(t.match.phase).toBe(Phase.PostPlant);
    // The hatch breaks under it: deactivated.
    t.room.queuePanelOp(h4.panel.spec.index, { kind: "damage", amount: 1e6, hard: false });
    t.tick();
    t.tick();
    expect(h4.panel.broken).toBe(true);
    expect(t.match.history[0]).toMatchObject({ reason: WinReason.Deactivated, winner: t.match.players.get(def.id)!.team });
  }, 60_000);
});
