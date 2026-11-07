// End-to-end check of Bot Training offline (Phase 9 M10; bots/DESIGN.md §12, PLAN §19): a solo match against bots in
// a browser, the room in the page's own worker (no server room). The Play page's "Play vs bots (offline)" opens the
// match page; its lobby fills both teams around you with Normal bots (4 with you, 5 against) and you're the host. You
// set short timers and start: you attack round 1 and defend round 2 (Bot Training's sides alternate). Each round you
// pick an operator on the planning screen (your team's bots pick after you, all different); in prep, attacking, you look
// through your drone; in action the bots' bodies get about and fight (kills on the scoreboard) while you stand still. Each
// round's end screen has your round report, the match ends with its summary, and the Play page then counts both rounds in
// your training stats (this browser's storage). The server here only serves the pages.
// Requires `npm run build` first. Screenshots go to builds/e2e.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = 21200 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = fileURLToPath(new URL("../../builds/e2e/", import.meta.url));
const SERVER = fileURLToPath(new URL("../../game/server/dist/main.js", import.meta.url));
const shot = (name) => join(OUT, name);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Phases (match/match.ts). */
const P = { Lobby: 0, Ban: 1, Planning: 2, Prep: 3, Action: 4, PostPlant: 5, RoundEnd: 6, MatchEnd: 7 };

const server = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "inherit"] });
const result = { checks: {}, rounds: [] };
let ok = false;
let browser;
const errors = [];

try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) break;
    } catch {}
    await sleep(100);
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // Every wait is polled on a timer: a slow runner's page may draw a frame a second or so (see match.mjs).
  const until = (fn, arg, timeout) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
  const view = () => page.evaluate(() => window.__match.view);
  const phase = (ph, timeout = 60000) => until((ph) => window.__match.view.phase === ph, ph, timeout);
  const me = (v) => v.players.find((p) => p.id === v.you);

  // ---------------------------------------------------------------- the Play page

  await page.goto(`${BASE}/play.html`);
  await page.fill(".name", "Solo");
  result.checks.playButtonSaysWhatItDoes = (await page.textContent(".vs-bots"))?.trim() === "Play vs bots (offline)";
  result.checks.noStatsYet = /counted here/.test((await page.textContent(".my-training")) ?? "");
  await Promise.all([page.waitForURL(/\/labs\/match\.html\?.*offline=1/, { timeout: 30000 }), page.click(".vs-bots")]);
  await until(() => window.__match?.view && window.__lab?.net?.room, null, 90000);

  // ---------------------------------------------------------------- the lobby

  let v = await view();
  result.lobby = { room: await page.evaluate(() => window.__lab.net.room), players: v.players.map((p) => [p.name, p.team, p.bot]) };
  result.checks.offlineRoom = result.lobby.room === "LOCAL" && v.format === "bot_training" && v.phase === P.Lobby;
  result.checks.youHostAmongNineBots = v.host === v.you && v.players.length === 10 && v.players.filter((p) => p.bot === "normal").length === 9 && me(v).bot === null && me(v).team === 0;
  // Short timers, two rounds, no overtime; Blue (your team) attacks first.
  await page.evaluate(() => {
    const r = window.__match.rules;
    const match = { ...structuredClone(r.match), rounds: 2, overtime: null, firstAttack: "blue", seconds: { ...r.match.seconds, pick: 12, prep: 15, action: 45, roundEnd: 8 } };
    window.__match.lobby({ kind: "change", change: { kind: "rules", rules: { match } } });
  });
  await until(() => window.__match.rules?.match.rounds === 2 && window.__match.rules.match.seconds.action === 45, null, 10000);
  await page.screenshot({ path: shot("bots-lobby.png") });
  if (!me(await view()).ready) await page.click(".match-screen [data-act=ready]");
  await page.click(".match-screen [data-act=start]");

  // ---------------------------------------------------------------- the rounds

  for (let round = 1; round <= 2; round++) {
    const r = { round };
    result.rounds.push(r);
    await until((round) => window.__match.view.phase === 2 && window.__match.view.round === round, round, 30000);
    v = await view();
    r.side = me(v).side;
    // Your operator first (the first one free on your side's list): your team's bots pick after you.
    await until(() => document.querySelector(".match-screen [data-act=op]:not([disabled])") !== null, null, 10000);
    await page.click(".match-screen [data-act=op]:not([disabled])");
    await page.screenshot({ path: shot(`bots-planning-${round}.png`) });
    await phase(P.Prep, 30000);
    v = await view();
    const team = v.players.filter((p) => p.team === me(v).team);
    const enemy = v.players.filter((p) => p.team !== me(v).team);
    // Your team's picks (the other team's are hidden from you, D-120): one each, all different.
    r.operators = team.map((p) => p.operator);
    r.teamPicked = team.length === 5 && enemy.length === 5 && team.every((p) => p.operator) && new Set(r.operators).size === team.length;
    // Prep: attacking, you look through your drone (Phase 7); the bots drone or fortify meanwhile.
    await until(() => window.__lab.net?.own !== null && window.__lab.net.viewedKind !== null, null, 15000).catch(() => {});
    r.prep = { viewed: await page.evaluate(() => window.__lab.net.viewedKind) };
    await sleep(8000);
    await page.screenshot({ path: shot(`bots-prep-${round}.png`) });
    await phase(P.Action, 30000);
    // Action: the bots' bodies get about (a few metres in ten seconds), and they fight (the feed has shots, downs, kills).
    const where = () => page.evaluate(() => window.__lab.net.remotes.filter((x) => x.state).map((x) => ({ id: x.id, p: [x.state.x, x.state.y, x.state.z] })));
    const before = await where();
    await sleep(10000);
    const after = await where();
    const moved = before.filter((b) => {
      const a = after.find((x) => x.id === b.id);
      return a && Math.hypot(a.p[0] - b.p[0], a.p[2] - b.p[2]) > 2;
    });
    r.bodiesMoved = moved.length;
    await page.screenshot({ path: shot(`bots-action-${round}.png`) });
    // To the round's end: its screen has your report; dead (likely, standing still), the camera was on your killer or a teammate.
    await until(() => window.__match.view.phase >= 6, null, 120000);
    r.dead = await page.evaluate(() => window.__lab.net.dead);
    r.spectating = await page.evaluate(() => window.__match.spectating);
    await until(() => document.querySelector(".report .report-title")?.textContent === "YOUR ROUND", null, 15000).catch(() => {});
    r.report = await page.evaluate(() => document.querySelector(".report")?.textContent ?? null);
    v = await view();
    const h = v.history[round - 1];
    r.end = h ? { winner: h.winner, reason: h.reason, attackers: h.attackers } : null;
    r.feed = v.players.map((p) => [p.name, p.kills, p.deaths]);
    await page.screenshot({ path: shot(`bots-round-end-${round}.png`) });
  }
  const [r1, r2] = result.rounds;
  result.checks.youAttackThenDefend = r1.side === 0 && r2.side === 1 && r1.end?.attackers === 0 && r2.end?.attackers === 1;
  result.checks.yourTeamPicks = r1.teamPicked && r2.teamPicked;
  // Round 1 you attack: in prep you look through your drone; round 2 you defend: through your body.
  result.checks.youDroneInPrep = r1.prep.viewed === 1 && r2.prep.viewed === 0;
  result.checks.botsGetAbout = r1.bodiesMoved >= 3 && r2.bodiesMoved >= 3;
  result.checks.botsFight = [...r1.feed, ...r2.feed].some(([, kills]) => kills > 0);
  result.checks.roundsEnd = r1.end !== null && r2.end !== null;
  result.checks.reportEachRound = [r1, r2].every((r) => typeof r.report === "string" && /YOUR ROUND/.test(r.report) && /(Died|Survived)/.test(r.report) && /Damage/.test(r.report));

  // ---------------------------------------------------------------- the match's end, and your stats

  await phase(P.MatchEnd, 60000);
  await until(() => window.__match.screen === "summary", null, 15000);
  v = await view();
  result.end = { score: v.score, winner: v.winner, history: v.history.map((h) => [h.round, h.attackers, h.winner, h.reason]) };
  result.checks.summaryAfterTwoRounds = v.history.length === 2;
  await page.screenshot({ path: shot("bots-summary.png") });
  await page.goto(`${BASE}/play.html`);
  const stats = await page.textContent(".my-training");
  result.stats = stats;
  result.checks.statsCountBothRounds = /Bot Training\s*2\b/.test(stats ?? "") || (await page.$$eval(".training-stats tr", (rows) => rows.some((tr) => /Bot Training/.test(tr.textContent) && tr.children[1]?.textContent === "2")));
  await page.screenshot({ path: shot("bots-play-stats.png"), fullPage: true });

  result.errors = errors;
  result.checks.noPageErrors = errors.length === 0;
  ok = Object.values(result.checks).every(Boolean);
} catch (e) {
  result.errors = [...errors, String(e?.stack ?? e)];
} finally {
  console.log(JSON.stringify(result, null, 2));
  console.log(`[e2e] bot-training: ${ok ? "PASS" : "FAIL"}`);
  await browser?.close();
  server.kill();
  process.exit(ok ? 0 : 1);
}
