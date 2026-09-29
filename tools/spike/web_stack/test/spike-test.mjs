// End-to-end spike test. Requires `npm run build` first.
// 1. Starts the production server (node dist-server/main.js).
// 2. Connects 9 scripted bot clients over WebSocket (10 players total, like a 5v5).
// 3. Opens the real client in headless Chromium with ?auto=1 and lets it play for ~5 s.
// 4. Asserts rendering, networking, bit-exact prediction, and server tick budget.
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import WebSocket from "ws";

const PORT = 18080 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ["dist-server/main.js"], { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
const results = { checks: {} };
let exitCode = 1;

try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) break;
    } catch {}
    await sleep(100);
  }

  // Bot clients: send one scripted input per tick at 64 Hz (same wire format as the browser).
  const bots = [];
  for (let b = 0; b < 9; b++) {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    let seq = 0;
    ws.on("open", () => {
      const timer = setInterval(() => {
        const v = new DataView(new ArrayBuffer(11));
        v.setUint8(0, 1);
        v.setUint32(1, ++seq, true);
        v.setInt8(5, Math.round(127 * Math.sin(seq / 40 + b)));
        v.setInt8(6, Math.round(127 * Math.cos(seq / 40 + b)));
        v.setFloat32(7, b * 0.5, true);
        ws.send(v.buffer);
      }, 1000 / 64);
      ws.on("close", () => clearInterval(timer));
    });
    bots.push(ws);
  }

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && pageErrors.push(m.text()));
  await page.goto(`${BASE}/?auto=1`);
  await page.waitForFunction(() => window.__spike?.connected, null, { timeout: 15000 });
  await sleep(5000);
  const report = await page.evaluate(() => window.__spike);
  const stats = await (await fetch(`${BASE}/stats`)).json(); // while all 10 players are connected
  await page.screenshot({ path: "test/spike-screenshot.png" });
  await browser.close();
  bots.forEach((ws) => ws.close());

  results.client = report;
  results.server = stats;
  results.pageErrors = pageErrors;
  const c = results.checks;
  c.noPageErrors = pageErrors.length === 0;
  c.webglRenders = report.webglRenderer.length > 0 && report.frames >= 100;
  c.connectedAndStreaming = report.connected && report.snapshots >= 200 && report.inputsSent >= 200;
  c.seesOtherPlayers = report.remotePlayersSeen >= 9;
  c.playerMoved = report.distanceMoved > 2;
  c.predictionBitExact = report.maxPredictionError <= 1e-5 && report.reconciliations === 0;
  c.serverTickUnder5ms = stats.clients === 10 && stats.tickMs.p99 < 5;
  c.tickIntervalStable = stats.intervalMs.p99 < 2 * stats.intervalMs.target;
  exitCode = Object.values(c).every(Boolean) ? 0 : 1;
} catch (e) {
  results.error = String(e?.stack ?? e);
} finally {
  server.kill();
  console.log(JSON.stringify(results, null, 2));
  console.log(exitCode === 0 ? "[spike] RESULT: PASS" : "[spike] RESULT: FAIL");
  process.exit(exitCode);
}
