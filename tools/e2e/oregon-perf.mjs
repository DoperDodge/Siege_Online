// Oregon performance capture (Phase 5 M6, tools/mapgen/DESIGN.md amendment 8 and §9.3), from the page's own
// numbers for every frame (window.__lab.perf): its work on the main thread as the stats overlay counts it, the
// draw calls and triangles, and the destructible panels' redraw. Two runs on the offline page:
// - a fly-through: the free camera at every room of every storey looking four ways, then over the building from
//   each side;
// - a destruction storm: a Breach Charge on each soft wall from one side, and an Impact Grenade up into each
//   soft floor area from the room below; every panel it reaches redraws.
// It prints p50 / p95 / max and writes builds/e2e/oregon-perf.json. The browser here draws in software
// (swiftshader), so its frame rate means nothing; the page's work and its draws do. The bounds are loose (a
// regression ten times over, not a budget): the frame rate is read on Ulo's PC (PLAN §18, the F8 overlay).
// Requires `npm run build` first.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = 21100 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = fileURLToPath(new URL("../../builds/e2e/", import.meta.url));
const SERVER = fileURLToPath(new URL("../../game/server/dist/main.js", import.meta.url));
const LEVEL = JSON.parse(readFileSync(fileURLToPath(new URL("../../data/maps/oregon/level.json", import.meta.url)), "utf8"));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Loose bounds for CI (ms and draws): the page's work a frame, a panel redraw, and the draws a frame. */
const BOUND = { workP95Ms: 120, panelMaxMs: 60, callsMax: 2500 };
const EYE_M = 1.6;

const spread = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q) => (s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0);
  const r = (x) => Math.round(x * 1000) / 1000;
  return { n: s.length, p50: r(at(0.5)), p95: r(at(0.95)), max: r(s.length ? s[s.length - 1] : 0) };
};

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
  // Small: the software renderer draws every pixel on the CPU, and the page's work and draws don't depend on the size.
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/labs/oregon.html?autotest=1&lowgfx&op=sledge`);
  await page.waitForFunction(() => window.__lab?.net?.ready, null, { timeout: 60000 });
  result.webgl = await page.evaluate(() => window.__lab.report.webgl);
  /** Wait until the page has drawn `n` more frames. */
  const frames = async (n) => {
    const from = await page.evaluate(() => window.__lab.frames);
    await page.waitForFunction((target) => window.__lab.frames >= target, from + n, { timeout: 30000, polling: 20 });
  };
  const started = Date.now();

  // ---- The fly-through.
  const view = await page.evaluate(() => window.__lab.view);
  const poses = [];
  for (const room of view.rooms) for (const yaw of [0, 90, 180, 270]) poses.push([room.anchor[0], room.anchor[1] + EYE_M, room.anchor[2], yaw, -5]);
  // Over the building from each side, 30 m out and 20 m up, looking down at it: everything in view at once.
  const [xs, zs] = [view.rooms.map((r) => r.anchor[0]), view.rooms.map((r) => r.anchor[2])];
  const [mx, mz] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  for (const [dx, dz, yaw] of [[0, 30, 0], [30, 0, 90], [0, -30, 180], [-30, 0, 270]]) poses.push([mx + dx, 20, mz + dz, yaw, -30]);
  await page.evaluate(() => window.__lab.perf.start());
  for (const pose of poses) {
    await page.evaluate((p) => window.__lab.fly(p), pose);
    await frames(2);
  }
  const fly = await page.evaluate(() => window.__lab.perf.stop());
  await page.evaluate(() => window.__lab.fly(null));
  result.flyThrough = { poses: poses.length, frames: fly.length, workMs: spread(fly.map((f) => f.workMs)), calls: spread(fly.map((f) => f.calls)), triangles: spread(fly.map((f) => f.triangles)) };
  await page.screenshot({ path: join(OUT, "oregon-perf-fly.png") });

  // ---- The storm: a breach charge on every soft wall, an impact grenade up into every soft floor area.
  const panelOf = (id) => page.evaluate((id) => window.__lab.panel(id), id);
  const holes = (p) => (p ? p.holes.reduce((a, h) => a + (h ?? 0), 0) : 0);
  const storeys = LEVEL.storeys;
  const floorUnder = (y) => [...storeys].reverse().find((s) => s.floorY <= y + 0.01)?.floorY ?? 0;
  const targets = [];
  for (const s of LEVEL.solids.filter((x) => x.surface === "REINFORCEABLE")) {
    // 1 m out from the face on the +n side, at its storey's floor, facing it.
    const alongX = s.size[0] >= s.size[2];
    const y = floorUnder(s.center[1] - s.size[1] / 2);
    const at = alongX ? [s.center[0], y, s.center[2] + s.size[2] / 2 + 1] : [s.center[0] + s.size[0] / 2 + 1, y, s.center[2]];
    targets.push({ id: s.id, at, yawDeg: alongX ? 0 : 90, pitch: 0, tool: 0 });
  }
  const regions = new Set();
  for (const s of LEVEL.solids.filter((x) => x.surface === "SOFT_FLOOR")) {
    // One tile of each soft floor area (its tiles share a region), from the storey below, looking straight up.
    const region = s.panel?.region ?? s.id;
    if (regions.has(region)) continue;
    regions.add(region);
    const below = floorUnder(s.center[1] - s.size[1] / 2 - 0.5);
    targets.push({ id: s.id, at: [s.center[0], below, s.center[2]], yawDeg: 0, pitch: 89, tool: 1 });
  }
  let tool = 0;
  await page.evaluate(() => window.__lab.perf.start());
  const storm = [];
  for (const t of targets) {
    while (tool !== t.tool) {
      await page.keyboard.press("KeyT");
      tool = (tool + 1) % 6;
    }
    await page.evaluate((t) => window.__lab.teleport(t.at[0], t.at[1], t.at[2], t.yawDeg), t);
    await page.evaluate((pitch) => (window.__lab.input = { pitch: (pitch * Math.PI) / 180 }), t.pitch);
    await frames(3);
    const before = holes(await panelOf(t.id));
    await page.keyboard.press("KeyG");
    const hit = await page.waitForFunction(({ id, before }) => {
      const p = window.__lab.panel(id);
      return p && p.holes.reduce((a, h) => a + (h ?? 0), 0) > before;
    }, { id: t.id, before }, { timeout: 5000, polling: 50 }).then(() => true, () => false);
    await frames(2);
    storm.push({ id: t.id, hit });
  }
  await page.evaluate(() => (window.__lab.input = null));
  const blown = await page.evaluate(() => window.__lab.perf.stop());
  const redraws = blown.filter((f) => f.panelMs > 0.05);
  result.storm = {
    targets: targets.length,
    hit: storm.filter((s) => s.hit).length,
    missed: storm.filter((s) => !s.hit).map((s) => s.id),
    frames: blown.length,
    workMs: spread(blown.map((f) => f.workMs)),
    calls: spread(blown.map((f) => f.calls)),
    redrawFrames: redraws.length,
    panelMs: spread(redraws.map((f) => f.panelMs)),
  };
  await page.screenshot({ path: join(OUT, "oregon-perf-storm.png") });
  result.seconds = Math.round((Date.now() - started) / 1000);

  result.checks.flewThroughEveryRoom = fly.length >= poses.length * 2;
  result.checks.flyThroughWork = result.flyThrough.workMs.p95 < BOUND.workP95Ms;
  result.checks.flyThroughDraws = result.flyThrough.calls.max < BOUND.callsMax;
  // Most targets take their explosive (a spot can fall in furniture, or the far side of a wall can be a stairwell).
  result.checks.stormHitMostPanels = result.storm.hit >= targets.length * 0.8;
  result.checks.stormRedrew = result.storm.redrawFrames > 0;
  result.checks.stormWork = result.storm.workMs.p95 < BOUND.workP95Ms;
  result.checks.panelRedraw = result.storm.panelMs.max < BOUND.panelMaxMs;
  result.checks.noConsoleErrors = errors.length === 0;
  ok = Object.values(result.checks).every(Boolean);
} catch (e) {
  result.error = String(e?.stack ?? e);
} finally {
  await browser?.close();
  server.kill();
}
result.errors = errors;
result.bounds = BOUND;
writeFileSync(join(OUT, "oregon-perf.json"), JSON.stringify(result, null, 1) + "\n");
const line = (name, s) => (s ? `${name}: p50 ${s.p50} / p95 ${s.p95} / max ${s.max}` : `${name}: -`);
console.log(`oregon-perf (${result.webgl ?? "no WebGL"}), ${result.seconds ?? "?"} s`);
if (result.flyThrough) console.log(`  fly-through, ${result.flyThrough.poses} poses, ${result.flyThrough.frames} frames: ${line("work ms", result.flyThrough.workMs)}; ${line("draws", result.flyThrough.calls)}; ${line("triangles", result.flyThrough.triangles)}`);
if (result.storm) console.log(`  storm, ${result.storm.hit} of ${result.storm.targets} panels, ${result.storm.frames} frames: ${line("work ms", result.storm.workMs)}; ${line("panel redraw ms", result.storm.panelMs)} over ${result.storm.redrawFrames} frames`);
console.log(JSON.stringify({ ok, checks: result.checks, missed: result.storm?.missed, error: result.error, errors }, null, 1));
process.exit(ok ? 0 : 1);
