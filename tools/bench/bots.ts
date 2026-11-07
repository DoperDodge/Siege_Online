// Bot Training's server tick (Phase 9 M10; PLAN §18: ≤ 5 ms at 10 players including 9 bots; bots/DESIGN.md §12): a Bot
// Training room with one silent person and nine bots plays whole rounds headless, every room step timed, by phase, with
// where the time went: the bots' brains (each one's think), the navigation catching up with changed walls (rebuilds),
// the team planners (made as prep starts), and the rest of the step (the simulation, the gadgets, the match).
// Numbers depend on the machine: PROGRESS records a run.
//   npm run bench:bots [-- --rounds 2 --seed 3 --site SITE_LAUNDRY]    prints a table, writes builds/bench/bots.json
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { Bot, ByteReader, encodeLobbyAction, handleRoomMessage, isFormat, loadGameData, NavWorld, PHASE_NAMES, Phase, Room, TICK_HZ, type FormatMode } from "@redmond/shared";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const ROUNDS = Number(arg("rounds", "2"));
const SEED = Number(arg("seed", "3"));
const SITE = arg("site", "");

const stats = (xs: number[]) => {
  if (!xs.length) return { p50: 0, p95: 0, p99: 0, max: 0, n: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { p50: +at(0.5).toFixed(3), p95: +at(0.95).toFixed(3), p99: +at(0.99).toFixed(3), max: +s[s.length - 1].toFixed(3), n: s.length };
};

// Where the time goes: the bots' brains, the navigation's catch-up, the planners (timed around their methods).
let brainMs = 0;
let navMs = 0;
let planMs = 0;
const wrap = (proto: Record<string, unknown>, name: string, add: (ms: number) => void) => {
  const f = proto[name] as (...a: unknown[]) => unknown;
  proto[name] = function (this: unknown, ...a: unknown[]) {
    const t = performance.now();
    try {
      return f.apply(this, a);
    } finally {
      add(performance.now() - t);
    }
  };
};
wrap(Bot.prototype as unknown as Record<string, unknown>, "think", (ms) => (brainMs += ms));
wrap(NavWorld.prototype as unknown as Record<string, unknown>, "step", (ms) => (navMs += ms));
wrap(Room.prototype as unknown as Record<string, unknown>, "plans", (ms) => (planMs += ms));

const data = loadGameData();
const bt = data.modes.get("bot_training")!;
if (!isFormat(bt)) throw new Error("bot_training");
const mode: FormatMode = bt;
const room = await Room.create("BENCH", "oregon", { format: "bot_training", seed: SEED });
const person = room.join("bench", { send() {}, buffered: () => 0 })!;
const send = (b: Uint8Array) => handleRoomMessage(room, person, b[0], new ByteReader(b.subarray(1)));
const rules = { ...mode.match, rounds: Math.max(2, ROUNDS + (ROUNDS % 2)), overtime: null, bots: { ...mode.match.bots!, size: [5, 5], site: SITE || null } };
send(encodeLobbyAction({ kind: "change", change: { kind: "rules", rules: { match: rules } } } as Parameters<typeof encodeLobbyAction>[0]));
room.step();
send(encodeLobbyAction({ kind: "start" }));
const m = room.director!.match;

const byPhase = new Map<string, number[]>();
const spikes: { tick: number; phase: string; ms: number; brains: number; nav: number; plans: number }[] = [];
const all: number[] = [];
let rounds = 0;
const limit = (ROUNDS * 330 + 60) * TICK_HZ;
for (let i = 0; i < limit && m.phase !== Phase.MatchEnd && rounds < ROUNDS; i++) {
  const before = m.phase;
  [brainMs, navMs, planMs] = [0, 0, 0];
  const t = performance.now();
  room.step();
  const ms = performance.now() - t;
  const name = PHASE_NAMES[before];
  if (before !== Phase.Lobby) {
    all.push(ms);
    let list = byPhase.get(name);
    if (!list) byPhase.set(name, (list = []));
    list.push(ms);
  }
  if (ms > 5) spikes.push({ tick: room.sim.tick, phase: name, ms: +ms.toFixed(2), brains: +brainMs.toFixed(2), nav: +navMs.toFixed(2), plans: +planMs.toFixed(2) });
  if (before !== Phase.RoundEnd && m.phase === Phase.RoundEnd) rounds++;
}

const out = {
  node: process.version,
  date: new Date().toISOString().slice(0, 10),
  seed: SEED,
  rounds,
  players: m.players.size,
  bots: [...m.players.values()].filter((p) => p.bot !== null).length,
  all: stats(all),
  over5ms: all.filter((x) => x > 5).length,
  phases: Object.fromEntries([...byPhase].map(([k, v]) => [k, stats(v)])),
  spikes: spikes.sort((a, b) => b.ms - a.ms).slice(0, 15),
  history: m.history.map((h) => ({ round: h.round, winner: h.winner, reason: h.reason, site: h.site })),
};
const dir = join(process.cwd(), "builds", "bench");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "bots.json"), JSON.stringify(out, null, 2));
console.log(`Bot Training, ${out.players} players (${out.bots} bots), ${rounds} rounds, seed ${SEED}: room step ms`);
console.log(`  all      p50 ${out.all.p50} / p95 ${out.all.p95} / p99 ${out.all.p99} / max ${out.all.max} (${out.over5ms} of ${out.all.n} ticks over 5 ms)`);
for (const [k, v] of Object.entries(out.phases)) console.log(`  ${k.padEnd(9)} p50 ${v.p50} / p95 ${v.p95} / p99 ${v.p99} / max ${v.max} (${v.n})`);
console.log("  worst ticks:", out.spikes.slice(0, 8).map((s) => `${s.ms} ms (${s.phase}; brains ${s.brains}, nav ${s.nav}, plans ${s.plans})`).join("; "));
