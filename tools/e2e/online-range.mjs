// End-to-end check of the Range Lab online (PLAN §17 Phase 3 "done when": hit registration feels right at
// 100 ms): the production server and two headless browsers with 100 ms of simulated round trip each.
// Checks: B joins while A is firing (events replayed after B's level loads); a headshot on a still dummy
// kills; on the strafing dummy, a click claims the frame on screen, the server never rewinds past the claim,
// and where it rewound the target is exactly where the shooter's page draws it at that tick (and within the
// cap, a head as drawn is a head hit); the damage arc points at the attacker; A downs B, both kill feeds say
// so, B sees the down screen, and A revives B; no mispredictions anywhere. Requires `npm run build` first.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = 19700 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = fileURLToPath(new URL("../../builds/e2e/", import.meta.url));
const SERVER = fileURLToPath(new URL("../../game/server/dist/main.js", import.meta.url));
const shot = (name) => join(OUT, name);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAG = 100;
const Btn = { Interact: 4, Ads: 8, Fire: 64 };
const TICK_HZ = 64;
const MAX_REWIND_TICKS = 16; // 250 ms (DECISIONS D-045)

const server = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "inherit"] });
const result = { checks: {} };
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
  const open = async (url) => {
    const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(url);
    await page.waitForFunction(() => window.__lab?.net?.ready, null, { timeout: 30000 });
    return page;
  };
  const net = (page) => page.evaluate(() => window.__lab.net);
  const input = (page, v) => page.evaluate((v) => (window.__lab.input = v), v);
  // Aim at a body's head on the frame on screen and click, in one go (the click claims that frame); then
  // wait for the server's readout and, the moment it arrives, look up how this page draws the target at the
  // tick the server rewound to and at the tick the click claimed (the page keeps one second of history).
  const shootAt = async (page, id) => {
    const before = (await net(page)).lastShot?.seq ?? -1;
    const { clickTick, aim } = await page.evaluate((id) => {
      const clickTick = window.__lab.renderTick;
      const aim = window.__lab.aimAt(id, "head");
      window.__lab.input = { yaw: aim.yaw, pitch: aim.pitch, buttons: 8 };
      window.__lab.fire();
      return { clickTick, aim };
    }, id);
    const r = await page.waitForFunction(
      ([before, id]) => {
        const lab = window.__lab;
        const s = lab.net.lastShot;
        if (!s || s.seq === before) return null;
        const claimed = lab.claimed(s.seq);
        return { shot: s, claimed, atRewound: lab.boxesAt(id, s.rewoundTick), atClaim: claimed === null ? null : lab.boxesAt(id, claimed) };
      },
      [before, id],
      { timeout: 5000, polling: "raf" },
    );
    return { ...(await r.jsonValue()), clickTick, aim };
  };
  // How far (radians) the bullet left from where the view pointed: 0 unless it was spread.
  const offAim = ({ shot, aim }) => {
    const v = [-Math.sin(aim.yaw) * Math.cos(aim.pitch), Math.sin(aim.pitch), -Math.cos(aim.yaw) * Math.cos(aim.pitch)];
    return Math.acos(Math.min(1, v.reduce((n, x, k) => n + x * shot.dir[k], 0)));
  };
  const center = (box) => [0, 1, 2].map((k) => (box.a[k] + box.b[k]) / 2);
  const gapCm = (p, q) => (p && q ? +(Math.hypot(...center(p).map((v, k) => v - center(q)[k])) * 100).toFixed(2) : null);

  // A creates a Range Lab room online; B joins it with the code while A sprays at the floor (events arrive
  // while B's level loads and are replayed after it: the join must still finish).
  const a = await open(`${BASE}/labs/range_lab.html?online&autotest=1&lowgfx&lag=${LAG}`);
  const room = (await net(a)).room;
  const aShotBefore = (await net(a)).lastShot?.seq ?? -1;
  await input(a, { pitch: -1.2, buttons: Btn.Ads | Btn.Fire });
  let joining = true;
  const keepFiring = (async () => {
    while (joining) {
      const alive = await a.evaluate(() => window.__lab.refill()).then(() => true, () => false);
      if (!alive) break;
      await sleep(1000);
    }
  })();
  const b = await open(`${BASE}/labs/range_lab.html?room=${room}&autotest=1&lowgfx&lag=${LAG}`);
  joining = false;
  await keepFiring;
  await input(a, null);
  await a.evaluate(() => window.__lab.refill());
  result.checks.joinedMidFight = ((await net(a)).lastShot?.seq ?? -1) !== aShotBefore && (await net(b)).ready;
  await a.waitForFunction(() => window.__lab.net.players.length === 2, null, { timeout: 10000 });
  const roster = (await net(b)).roster;
  result.room = room;
  result.checks.rangeRoomOnline = /^[A-HJ-NP-Z2-9]{5}$/.test(room) && roster.filter((e) => e.kind === 1).length === 18;
  const strafer = roster.find((e) => e.kind === 1 && e.name === "Strafing").pawnIds[0];

  // B shoots at a still dummy's head 10 m down the range: a headshot kills, online at 100 ms as offline.
  // (A page that stalls for more than 250 ms has its body stepped without input on the server, sights down
  // (D-030), so its next shot leaves with hip-fire spread; the shot's direction shows it, and it is retried.)
  const lane = roster.find((e) => e.kind === 1 && e.name === "Lane 10 m").pawnIds[0];
  await b.evaluate(() => window.__lab.teleport(1.5, 0, 20, 0));
  await input(b, { buttons: Btn.Ads });
  await sleep(1500);
  const attempts = [];
  for (let i = 0; i < 3; i++) {
    const r = await shootAt(b, lane);
    attempts.push({ hit: r.shot.hit, offAimDeg: +((offAim(r) * 180) / Math.PI).toFixed(3) });
    if (offAim(r) < 1e-3) break;
    await sleep(1000);
  }
  const last = attempts.at(-1);
  result.still = { attempts, killed: (await net(b)).events.some((e) => e.kind === "kill" && e.victimPawn === lane) };
  result.checks.headshotKillsOnline = last.offAimDeg < 0.06 && last.hit?.pawnId === lane && last.hit?.part === "head" && result.still.killed;

  // Then at the strafing dummy's head as drawn, three times (it comes back 3 s after each kill).
  await b.evaluate(() => window.__lab.teleport(10, 0, 15, 0)); // 10 m in front of the strafe track
  await sleep(1500);
  const shots = [];
  for (let i = 0; i < 3; i++) {
    // Fire when the target is near the middle of its track (it never stops there: it turns at the ends).
    await b.waitForFunction((id) => {
      const s = window.__lab.net.remotes.find((r) => r.id === id)?.state;
      return s && s.mode === 0 && Math.abs(s.x - 10) < 1.5;
    }, strafer, { timeout: 8000, polling: "raf" });
    const r = await shootAt(b, strafer);
    const s = r.shot;
    const serverHead = s.target?.boxes.find((h) => h.part === "head");
    shots.push({
      hit: s.hit,
      // How far back B was drawing, and how far the server went back (capped at 250 ms).
      drawnBackMs: Math.round(((s.serverTick - r.claimed) * 1000) / TICK_HZ),
      rewoundMs: Math.round(((s.serverTick - s.rewoundTick) * 1000) / TICK_HZ),
      capped: s.rewoundTick > r.claimed + 1e-6,
      // The click claimed the frame on screen (to 1/256 tick, as the input carries it).
      claimError: Math.abs(r.claimed - r.clickTick),
      // The server never rewinds further back than the claim (it may bound an implausible one, never extend it).
      viewTickOk: s.viewTick >= r.claimed - 1e-6 && s.serverTick - s.rewoundTick <= MAX_REWIND_TICKS + 1e-6,
      // Where the server had the target's head at the tick it rewound to, against where B draws that tick.
      gapAtRewindCm: gapCm(serverHead, r.atRewound?.find((h) => h.part === "head")),
      // ... and against where B drew it when it clicked (the same tick unless the rewind was capped).
      gapAtClaimCm: gapCm(serverHead, r.atClaim?.find((h) => h.part === "head")),
    });
    if (i === 0) await b.screenshot({ path: shot("online-range-strafer.png") });
    await sleep(3500);
  }
  result.strafer = shots;
  result.checks.clickClaimsShownFrame = shots.every((s) => s.claimError <= 1 / 256 + 1e-6);
  result.checks.rewindNeverPastClaim = shots.every((s) => s.viewTickOk);
  // The same snapshots, the same blend: the server's rewound target is exactly where the client draws it.
  result.checks.rewoundTargetAsDrawn = shots.every((s) => s.gapAtRewindCm !== null && s.gapAtRewindCm < 0.5);
  // A shot within the cap is judged against the very frame B clicked on: a head as drawn is a head hit.
  // (These headless pages draw 5 to 15 frames a second, so their clicks usually claim frames past the cap;
  // the netsim's --hitreg run checks uncapped moving-target headshots at a full frame rate.)
  const uncapped = shots.filter((s) => !s.capped);
  result.uncappedShots = uncapped.length;
  if (uncapped.length) result.checks.uncappedHeadsAsDrawn = uncapped.every((s) => s.hit?.pawnId === strafer && s.hit?.part === "head" && s.gapAtClaimCm < 0.5);
  else result.notExercised = ["uncappedHeadsAsDrawn: every strafer shot claimed a frame past the 250 ms cap at this frame rate (netsim --hitreg covers it)"];
  await input(b, null);

  // The damage arc: A (at the firing line) shoots B in the torso from B's left; B's arc points left.
  await b.evaluate(() => window.__lab.teleport(4, 0, 14, 90)); // facing −X: A, to the +Z side, is on B's left
  await a.evaluate(() => window.__lab.teleport(4, 0, 22, 180));
  await sleep(1500);
  const bPawn = (await net(b)).pawnId;
  const aimB = await a.evaluate((id) => window.__lab.aimAt(id, "torso"), bPawn);
  await input(a, { yaw: aimB.yaw, pitch: aimB.pitch, buttons: Btn.Ads });
  await sleep(1200);
  await a.evaluate(() => window.__lab.fire());
  await b.waitForFunction(() => window.__lab.net.events.some((e) => e.kind === "damageTaken"), null, { timeout: 5000 }).catch(() => {});
  await sleep(200);
  const arc = await b.evaluate(() => {
    const el = document.querySelector(".hurt-dir");
    return { on: el.classList.contains("on"), deg: parseFloat(getComputedStyle(el).getPropertyValue("--a")) };
  });
  const bState = (await net(b)).own;
  const aState = (await net(a)).own;
  const toward = Math.atan2(-(aState.x - bState.x), -(aState.z - bState.z));
  const wrap = (r) => Math.atan2(Math.sin(r), Math.cos(r));
  const expectDeg = (-wrap(toward - bState.yaw) * 180) / Math.PI;
  result.arc = { ...arc, expectDeg: +expectDeg.toFixed(1) };
  result.checks.damageArcBearing = arc.on && Math.abs(wrap(((arc.deg - expectDeg) * Math.PI) / 180)) < (10 * Math.PI) / 180;
  await b.screenshot({ path: shot("online-range-hurt.png") });

  // A downs B: B takes enough first (lab tool) that A's torso shot leaves it down, not dead.
  await b.evaluate(() => window.__lab.hurt(window.__lab.net.hp - 30));
  await sleep(1200);
  await a.evaluate(() => window.__lab.fire());
  await b.waitForFunction(() => window.__lab.net.own?.mode === 4, null, { timeout: 5000 }).catch(() => {});
  await sleep(600);
  const downUi = await b.evaluate(() => !document.querySelector(".down-ui").classList.contains("hidden"));
  const feeds = { a: await a.locator(".killfeed").textContent(), b: await b.locator(".killfeed").textContent() };
  await b.screenshot({ path: shot("online-range-downed.png") });
  result.down = { mode: (await net(b)).own?.mode, downUi, feeds };
  result.checks.downedOverlayOnB = (await net(b)).own?.mode === 4 && downUi;
  result.checks.killFeedOnBoth = /downed/.test(feeds.a ?? "") && /downed/.test(feeds.b ?? "");

  // A (B's teammate) kneels beside B, facing it, and holds Interact: B is up with 20 HP after 4 s.
  await input(a, null);
  await sleep(1500); // B lies down
  const bNow = (await net(b)).own;
  await a.evaluate(([x, z]) => window.__lab.teleport(x + 0.8, 0, z, 90), [bNow.x, bNow.z]);
  await sleep(300);
  await input(a, { buttons: Btn.Interact });
  await b.waitForFunction(() => window.__lab.net.own?.mode === 0, null, { timeout: 9000 }).catch(() => {});
  await input(a, null);
  const up = (await net(b)).own;
  result.revive = { mode: up?.mode, hp: up?.hp };
  result.checks.reviveByA = up?.mode === 0 && up?.hp === 20;

  // Every correction in this test was the server's doing (joins, teleports, damage, the down and the
  // revive), none a misprediction (D-043).
  const stats = await (await fetch(`${BASE}/stats`)).json();
  result.stats = stats.totals;
  result.checks.noMispredictions = stats.totals.mismatchCorrections === 0;
  const hud = { a: await a.locator(".hud-tr").textContent(), b: await b.locator(".hud-tr").textContent() };
  const fps = (t) => Number(/(\d+) fps/.exec(t ?? "")?.[1] ?? NaN);
  result.fps = { a: fps(hud.a), b: fps(hud.b) };
  result.errors = errors;
  result.checks.noPageErrors = errors.length === 0;
  ok = Object.values(result.checks).every(Boolean);
} catch (e) {
  result.error = String(e?.stack ?? e);
  result.errors = errors;
} finally {
  await browser?.close();
  server.kill();
  console.log(JSON.stringify(result, null, 2));
  console.log(ok ? "[e2e] online range: PASS" : "[e2e] online range: FAIL");
  console.log(`[e2e] screenshots in ${OUT}`);
  process.exit(ok ? 0 : 1);
}
