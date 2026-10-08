// End-to-end check of the online Movement Lab (PLAN §17 Phase 2): the production server and two headless
// browsers with 100 ms of simulated round-trip latency each. Requires `npm run build` first.
// Checks: create and join by code, each player sees the other move, a test shot at a moving player hits
// thanks to lag compensation, leaving updates the roster, and a server restart reaches the clients.
// Screenshots go to builds/e2e/ (gitignored).
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = 18900 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = fileURLToPath(new URL("../../builds/e2e/", import.meta.url));
const SERVER = fileURLToPath(new URL("../../game/server/dist/main.js", import.meta.url));
const shot = (name) => join(OUT, name);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAG = 100; // ms of extra round trip on each client

const server = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "inherit"] });
const result = { checks: {} };
let ok = false;
let browser;

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
  const errors = [];
  // Separate contexts: two different "computers" (no shared storage).
  const open = async (url) => {
    // Small windows: two pages share one software-rendering CPU here; a real GPU draws far faster.
    const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(url);
    await page.waitForFunction(() => window.__lab?.net?.ready, null, { timeout: 30000 });
    return page;
  };
  const net = (page) => page.evaluate(() => window.__lab.net);

  // A creates a room; B joins it with the code.
  const a = await open(`${BASE}/labs/movement_lab.html?online&autotest=1&lag=${LAG}`);
  const room = (await net(a)).room;
  const b = await open(`${BASE}/labs/movement_lab.html?room=${room}&autotest=1&lag=${LAG}`);
  await a.waitForFunction(() => window.__lab.net.players.length === 2 && window.__lab.net.remotes.length === 1, null, { timeout: 10000 });
  await b.waitForFunction(() => window.__lab.net.remotes.length === 1, null, { timeout: 10000 });
  result.room = room;
  result.checks.roomCodeFormat = /^[A-HJ-NP-Z2-9]{5}$/.test(room);
  result.checks.bothInRoster = (await net(b)).players.length === 2;
  result.checks.urlIsInvite = (await b.evaluate(() => location.search)).includes(`room=${room}`);

  // A stands 3 m left of the line of fire, 8 m in front of B, who faces A.
  await a.evaluate(() => window.__lab.teleport(-3, 0, 12, 0));
  await b.evaluate(() => {
    window.__lab.teleport(0, 0, 4, 180);
    // ~3° down: the ray crosses A's torso at 8 m. Aiming down sights, so the rifle's shot has no spread.
    window.__lab.input = { pitch: -0.052, buttons: 8 /* Btn.Ads */ };
  });
  await sleep(1500);
  const aStart = (await net(a)).own;
  const bSeesStart = (await net(b)).remotes[0].state;
  result.positions = { aStart: { x: aStart.x, z: aStart.z }, bSeesA: { x: bSeesStart.x, z: bSeesStart.z } };
  result.checks.remoteMatchesOwn = Math.hypot(aStart.x - bSeesStart.x, aStart.z - bSeesStart.z) < 0.05;

  // A slow-walks right across B's line of fire (slow enough that one 15 fps frame can't carry A past the
  // torso). B fires at the moment A, as B sees A, crosses the line.
  await a.evaluate(() => (window.__lab.input = { strafe: 1, buttons: 16 /* Btn.SlowWalk */ }));
  const fired = await b.evaluate(
    () =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const check = () => {
          const seen = window.__lab.net.remotes[0]?.state;
          if (seen && seen.x >= -0.08) {
            window.__lab.fire();
            resolve({ seenX: seen.x });
          } else if (performance.now() - t0 > 8000) resolve(null);
          else requestAnimationFrame(check);
        };
        check();
      }),
  );
  const aAtFire = (await net(a)).own; // A's own (predicted) position, read just after B fired
  await b.waitForFunction(() => window.__lab.net.lastShot !== null, null, { timeout: 5000 });
  const shotResult = (await net(b)).lastShot;
  await b.screenshot({ path: shot("online-shot.png") });
  await sleep(1200);
  await a.evaluate(() => (window.__lab.input = null));
  await sleep(800); // A comes to a stop
  const aEnd = (await net(a)).own;
  await sleep(600);
  const bSeesEnd = (await net(b)).remotes[0].state;
  result.hud = { a: await a.locator(".hud-tr").textContent(), b: await b.locator(".hud-tr").textContent() };
  const fps = (t) => Number(/(\d+) fps/.exec(t ?? "")?.[1] ?? NaN);
  result.fps = { a: fps(result.hud.a), b: fps(result.hud.b) }; // two software-rendered pages sharing a CPU
  result.positions.aEnd = { x: aEnd.x, z: aEnd.z };
  result.positions.bSeesAEnd = { x: bSeesEnd.x, z: bSeesEnd.z };
  await b.screenshot({ path: shot("online-b-sees-a.png") });
  await a.screenshot({ path: shot("online-a.png") });

  const rewoundMs = shotResult ? ((shotResult.serverTick - shotResult.rewoundTick) * 1000) / 64 : null;
  result.shot = { fired, aXAtFire: aAtFire.x, hit: shotResult?.hit, rewoundMs, targetName: shotResult?.targetName, origin: shotResult?.origin, dir: shotResult?.dir, wall: shotResult?.wallDistance, claimedMs: shotResult ? ((shotResult.serverTick - shotResult.viewTick) * 1000) / 64 : null };
  result.checks.shotFired = fired !== null;
  result.checks.movingTargetHit = shotResult?.hit !== null && shotResult?.hit !== undefined;
  // Lag compensation did the work: by the time the shot reached the server, A had moved on well past
  // the torso's radius (0.19 m), and the server rewound about one-way latency + interpolation delay.
  result.checks.targetHadMovedOn = aAtFire.x - fired.seenX > 0.19;
  // (Near the 250 ms cap here: software rendering runs these pages at ~15 fps, and snapshots handled once a
  // frame look jittery, so the interpolation delay grows toward its 150 ms maximum.)
  result.checks.rewindInRange = rewoundMs !== null && rewoundMs > 60 && rewoundMs <= 250 + 1e-6;
  result.checks.bSawAMove = bSeesEnd.x - bSeesStart.x > 2 && Math.abs(bSeesEnd.x - aEnd.x) < 0.05;

  // No contact anywhere: corrections only for the join and the teleport.
  const aNet = await net(a);
  const bNet = await net(b);
  result.corrections = { a: aNet.corrections, b: bNet.corrections, rttA: aNet.rttMs, rttB: bNet.rttMs };
  // (Every correction so far is the server's doing: joins, teleports, the hit; mispredictions are checked
  // against the server's own count at the end.)
  result.checks.fewCorrections = aNet.corrections <= 5 && bNet.corrections <= 4;
  result.checks.noResyncs = aNet.resyncs === 0 && bNet.resyncs === 0;
  result.checks.rttIncludesSimulatedLag = aNet.rttMs > LAG * 0.9 && aNet.rttMs < LAG + 80;

  // Damage (Phase 3 M6): the moving-target shot took the server's damage off A, B's hit marker says how
  // much, and A was told. Then a headshot kills A, and both feeds say so.
  const bHit = bNet.events.find((e) => e.kind === "hitConfirm");
  const aTook = aNet.events.find((e) => e.kind === "damageTaken");
  result.damage = { hit: bHit, took: aTook, aHp: aNet.hp };
  result.checks.bodyShotDamage = !!bHit && !bHit.killed && bHit.zone !== "head" && aNet.hp === 110 - bHit.damage && aTook?.amount === bHit.damage;
  await a.evaluate(() => window.__lab.teleport(0, 0, 12, 0));
  await b.evaluate(() => {
    window.__lab.teleport(0, 0, 4, 180);
    window.__lab.input = { pitch: 0, buttons: 8 /* Btn.Ads */ }; // eye level: A's head
  });
  await sleep(1500);
  await b.evaluate(() => window.__lab.fire());
  await a.waitForFunction(() => window.__lab.net.dead, null, { timeout: 5000 }).catch(() => {});
  await sleep(300);
  const aDead = await net(a);
  const bAfterKill = await net(b);
  await b.screenshot({ path: shot("online-kill.png") });
  await a.screenshot({ path: shot("online-killed.png") });
  const kill = (n) => n.events.find((e) => e.kind === "kill");
  result.kill = { a: kill(aDead), b: kill(bAfterKill), aMessage: await a.locator(".center-msg").textContent() };
  result.checks.headshotKills = aDead.dead && kill(bAfterKill)?.headshot === true && kill(aDead)?.victimPawn === aDead.pawnId;
  // (Both players are Sledge here, so it's a team kill: friendly fire is on in lab rooms, D-051.)
  const fed = /eliminated|team-killed/;
  result.checks.killFeedOnBoth = fed.test(await a.locator(".killfeed").textContent()) && fed.test(await b.locator(".killfeed").textContent());
  result.checks.deathMessageNamesKiller = /Killed by/.test(result.kill.aMessage ?? "");
  await b.evaluate(() => (window.__lab.input = null));

  // Respawn online (the K key): a new body arrives, the page keeps running, and B sees the new body.
  const beforeRespawn = await net(a);
  await a.keyboard.press("KeyK");
  await a.waitForFunction((old) => window.__lab.net.ready && window.__lab.net.pawnId !== old, beforeRespawn.pawnId, { timeout: 5000 }).catch(() => {});
  const afterRespawn = await net(a);
  await sleep(1500);
  const settled = await net(a);
  const bAfterRespawn = await net(b);
  result.respawn = { oldPawn: beforeRespawn.pawnId, newPawn: afterRespawn.pawnId, correctionsAfter: settled.corrections - afterRespawn.corrections };
  result.checks.respawnNewBody = afterRespawn.pawnId !== beforeRespawn.pawnId && afterRespawn.ready;
  result.checks.respawnKeepsRunning = settled.frames > afterRespawn.frames + 5 && settled.corrections - afterRespawn.corrections <= 1;
  result.checks.respawnSeenByOthers = bAfterRespawn.remotes.some((r) => r.id === afterRespawn.pawnId) && !bAfterRespawn.remotes.some((r) => r.id === beforeRespawn.pawnId);

  // Down but not out (Phase 3 M7): A takes its whole health (lab tool) and goes down; B, a teammate, kneels
  // beside A facing it and holds Interact; after 4 s A is up again with 20 HP.
  await a.evaluate(() => window.__lab.teleport(0, 0, 12, 0));
  await sleep(500);
  await a.evaluate(() => window.__lab.hurt(window.__lab.net.hp));
  await a.waitForFunction(() => window.__lab.net.own?.mode === 4, null, { timeout: 5000 }).catch(() => {});
  const aDown = await net(a);
  await sleep(1500); // lies down
  await b.evaluate(() => {
    window.__lab.teleport(0.8, 0, 12, 90);
    window.__lab.input = { buttons: 4 /* Btn.Interact, held */ };
  });
  await a.waitForFunction(() => window.__lab.net.own?.mode === 0, null, { timeout: 9000 }).catch(() => {});
  const aUp = await net(a);
  await b.evaluate(() => (window.__lab.input = null));
  await a.screenshot({ path: shot("online-revived.png") });
  result.revive = { downMode: aDown.own?.mode, downHp: aDown.own?.downHp, upMode: aUp.own?.mode, upHp: aUp.own?.hp, events: aUp.events.filter((e) => e.kind.startsWith("revive") || e.kind === "down").map((e) => e.kind) };
  result.checks.downThenRevived = aDown.own?.mode === 4 && aUp.own?.mode === 0 && aUp.own?.hp === 20 && aUp.events.some((e) => e.kind === "reviveEnd" && e.completed);

  // A loadout pick (Phase 3 M4): B takes Brava with the PARA-308, a magnified sight and an angled grip. A new
  // body arrives carrying it, at the cost of exactly one correction, and A's roster shows it.
  const beforePick = await net(b);
  await b.evaluate(() =>
    window.__lab.pickLoadout({
      operator: "brava",
      primary: { weapon: "para_308", sight: "magnified", barrel: null, grip: "angled", underbarrel: null },
      secondary: { weapon: "usp40", sight: null, barrel: "suppressor", grip: null, underbarrel: null },
      gadgets: ["claymore"],
    }),
  );
  await b.waitForFunction(() => window.__lab.net.ready && window.__lab.net.weapon?.id === "para_308", null, { timeout: 5000 }).catch(() => {});
  await sleep(1000);
  const afterPick = await net(b);
  result.pick = { weapon: afterPick.weapon, corrections: afterPick.corrections - beforePick.corrections };
  result.checks.loadoutPicked = afterPick.weapon?.id === "para_308" && afterPick.weapon.loaded === 31 && afterPick.corrections - beforePick.corrections === 1;
  result.checks.othersSeeLoadout = (await a.evaluate(() => window.__lab.net.roster?.find((e) => e.operatorId === "brava")?.loadout.primary.sight)) === "magnified";

  const stats = await (await fetch(`${BASE}/stats`)).json();
  result.stats = stats;
  result.checks.statsEndpoint = stats.rooms === 1 && stats.players === 2;
  // No contact anywhere in this test: every correction was the server's doing (joins, teleports, damage,
  // respawn, revive), none a misprediction (DECISIONS D-043).
  result.checks.noMispredictions = stats.totals.mismatchCorrections === 0;
  result.mispredictions = { a: (await net(a)).mispredictions, b: (await net(b)).mispredictions };

  // B leaves: A's roster and view update.
  await b.close();
  await a.waitForFunction(() => window.__lab.net.players.length === 1 && window.__lab.net.remotes.length === 0, null, { timeout: 5000 }).catch(() => {});
  const afterLeave = await net(a);
  result.checks.leaveUpdatesRoster = afterLeave.players.length === 1 && afterLeave.remotes.length === 0;

  // Server restart (Railway sends SIGTERM): the client is told why.
  server.kill("SIGTERM");
  await a.waitForFunction(() => window.__lab.net.disconnected !== null, null, { timeout: 5000 }).catch(() => {});
  const gone = await net(a);
  result.disconnected = gone.disconnected;
  result.checks.restartReachesClient = /restarting/i.test(gone.disconnected ?? "");
  await a.screenshot({ path: shot("online-restart.png") });

  result.errors = errors;
  // The page logs a failed WebSocket reconnect as an error only if it retried; none expected.
  result.checks.noPageErrors = errors.length === 0;
  ok = Object.values(result.checks).every(Boolean);
} catch (e) {
  result.error = String(e?.stack ?? e);
} finally {
  await browser?.close();
  server.kill();
  console.log(JSON.stringify(result, null, 2));
  console.log(ok ? "[e2e] online lab: PASS" : "[e2e] online lab: FAIL");
  console.log(`[e2e] screenshots in ${OUT}`);
  process.exit(ok ? 0 : 1);
}
