// Bot soak (Phase 9 M10; PLAN §19, bots/DESIGN.md §12): headless 5v5 Bot Training matches on a site, a watching client
// connected as a player would be, checking that nothing crashes, the watcher's panels and gadgets never disagree with
// the server's (no desync: their hashes are checked on every op), and no bot is stuck (trying to walk somewhere for
// 10 s without getting a metre on). Short in CI (soak.test.ts), long by hand (npm run soak).
import { performance } from "node:perf_hooks";
import { ByteReader, ClientSession, Doing, DT, encodeLobbyAction, FollowState, handleRoomMessage, isFormat, loadGameData, Phase, PawnMode, Room, Stance, TICK_HZ, type FormatMode, type Vec3 } from "@redmond/shared";

export interface SoakReport {
  site: string;
  seed: number;
  rounds: number;
  ticks: number;
  /** Real seconds it took. */
  seconds: number;
  crash: string | null;
  desyncs: { panel: number; gadget: number; errors: string[] };
  stuck: { bot: string; at: Vec3; doing: string; task: string; seconds: number; goal: Vec3 | null; path: Vec3[]; phase: number; op: string; drone: boolean }[];
  tickMs: { p50: number; p99: number; max: number };
  history: { round: number; winner: number; reason: number }[];
}

/** A bot trying to walk this long (s) without getting this far (m) is stuck. */
const STUCK_S = 10;
const STUCK_M = 1;

export async function soak(site: string, rounds: number, seed = 5, onStuck?: (room: Room, id: number) => void): Promise<SoakReport> {
  const data = loadGameData();
  const bt = data.modes.get("bot_training")!;
  if (!isFormat(bt)) throw new Error("bot_training");
  const mode: FormatMode = bt;
  const t0 = performance.now();
  const room = await Room.create("SOAK", "oregon", { format: "bot_training", seed });
  const clock = { t: 0 };
  const toServer: Uint8Array[] = [];
  const errors: string[] = [];
  const session = new ClientSession({ send: (b) => toServer.push(b), now: () => clock.t, onError: (code, message) => errors.push(`${code} ${message}`) });
  const id = room.join("watcher", { send: (b) => session.handle(b), buffered: () => 0 })!;
  await session.loaded();
  const flush = () => {
    for (const b of toServer.splice(0)) handleRoomMessage(room, id, b[0], new ByteReader(b.subarray(1)));
  };
  const step = () => {
    clock.t += DT * 1000;
    if (session.ready) session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0 });
    flush();
    room.step();
  };
  const rules = { ...mode.match, rounds: Math.max(2, rounds + (rounds % 2)), overtime: null, bots: { ...mode.match.bots!, size: [5, 5] as [number, number], site } };
  const lobby = (b: Uint8Array) => handleRoomMessage(room, id, b[0], new ByteReader(b.subarray(1)));
  lobby(encodeLobbyAction({ kind: "change", change: { kind: "rules", rules: { match: rules } } } as Parameters<typeof encodeLobbyAction>[0]));
  step();
  lobby(encodeLobbyAction({ kind: "start" }));
  const m = room.director!.match;
  const stuck: SoakReport["stuck"] = [];
  const watch = new Map<number, { at: Vec3; since: number }>();
  const times: number[] = [];
  let crash: string | null = null;
  let played = 0;
  const limit = rounds * 330 * TICK_HZ;
  try {
    for (let i = 0; i < limit && played < rounds && m.phase !== Phase.MatchEnd; i++) {
      const before = m.phase;
      const t = performance.now();
      step();
      times.push(performance.now() - t);
      if (before !== Phase.RoundEnd && m.phase === Phase.RoundEnd) played++;
      // Stuck: walking toward a goal more than a couple of metres off (on a task, or going to look), not getting on.
      if (m.phase !== Phase.Action && m.phase !== Phase.Prep && m.phase !== Phase.PostPlant) {
        watch.clear();
        continue;
      }
      for (const p of m.players.values()) {
        if (p.bot === null) continue;
        const bot = room.botOf(p.id);
        const c = room.bodyOf(p.id);
        const pawn = c ? room.sim.pawns.get(c.drone || c.possessedPawnId) : undefined;
        if (!bot || !pawn || pawn.state.mode === PawnMode.Dead || pawn.state.mode === PawnMode.Downed) {
          watch.delete(p.id);
          continue;
        }
        const s = pawn.state;
        const goal = bot.legs.goal;
        // (Given up and asked again counts: a bot that fails and retries in place is as stuck as one pushing a wall.)
        // (Its legs driven this tick: legs left walking while it stands watching something aren't trying to get anywhere.)
        const moving = room.sim.tick - bot.legs.tickedAt <= 1 && (bot.legs.state === FollowState.Walking || bot.legs.state === FollowState.Failed) && goal !== null && Math.hypot(goal[0] - s.x, goal[2] - s.z) > 2 && (bot.doing === Doing.Task || bot.doing === Doing.Investigate || bot.doing === Doing.Revive);
        const w = watch.get(p.id);
        if (!moving || !w || Math.hypot(s.x - w.at[0], s.y - w.at[1], s.z - w.at[2]) >= STUCK_M) {
          watch.set(p.id, { at: [s.x, s.y, s.z], since: room.sim.tick });
          continue;
        }
        if (room.sim.tick - w.since >= STUCK_S * TICK_HZ) {
          const plan = m.sideOf(p.id) === 0 ? room.attackPlan : room.defensePlan;
          const task = bot.ordered(room.sim.tick) ?? plan?.taskOf(p.id) ?? null;
          stuck.push({
            bot: p.name,
            at: [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)],
            doing: Object.entries(Doing).find(([, v]) => v === bot.doing)?.[0] ?? String(bot.doing),
            task: task ? JSON.stringify(task).slice(0, 220) : "-",
            seconds: STUCK_S,
            goal: goal ? [+goal[0].toFixed(2), +goal[1].toFixed(2), +goal[2].toFixed(2)] : null,
            path: bot.legs.remaining().slice(0, 4).map((q) => [+q[0].toFixed(2), +q[1].toFixed(2), +q[2].toFixed(2)] as Vec3),
            phase: m.phase,
            op: p.operator ?? "",
            drone: !!c?.drone,
          });
          onStuck?.(room, p.id);
          watch.set(p.id, { at: [s.x, s.y, s.z], since: room.sim.tick });
        }
      }
    }
  } catch (e) {
    crash = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const at = (q: number) => +(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0).toFixed(2);
  return {
    site,
    seed,
    rounds: played,
    ticks: times.length,
    seconds: +((performance.now() - t0) / 1000).toFixed(1),
    crash,
    desyncs: { panel: session.stats.panelMismatches, gadget: session.stats.gadgetMismatches, errors },
    stuck,
    tickMs: { p50: at(0.5), p99: at(0.99), max: at(1) },
    history: m.history.map((h) => ({ round: h.round, winner: h.winner, reason: h.reason })),
  };
}
