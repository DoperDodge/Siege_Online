// End-to-end check of the Movement Lab in a real (headless) browser. Requires `npm run build` first.
// Starts the production server, opens the lab with ?autotest=1 (a scripted run through every mechanic),
// asserts the results, and saves screenshots to builds/e2e/ (gitignored) for a human look.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const PORT = 18500 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = new URL("../../builds/e2e/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ["game/server/dist/main.js"], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "ignore", "inherit"],
});
const result = { checks: {} };
let ok = false;

try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) break;
    } catch {}
    await sleep(100);
  }
  const landing = await fetch(`${BASE}/`);
  result.checks.landingPageServed = landing.ok && (await landing.text()).includes("Movement Lab");

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${BASE}/labs/movement_lab.html?autotest=1&op=sledge`);
  await page.waitForFunction(() => window.__lab?.report?.ready, null, { timeout: 30000 });
  await page.screenshot({ path: `${OUT}lab-start.png` });
  // The scripted run takes ~15 s of simulated time; software rendering may run it slower.
  await page.waitForFunction(() => window.__lab.report.done, null, { timeout: 120000, polling: 250 });
  const report = await page.evaluate(() => ({ ...window.__lab.report, frames: window.__lab.frames }));
  await page.screenshot({ path: `${OUT}lab-tower-lean.png` });
  await page.evaluate(() => (window.__lab.view = { thirdPerson: true, hitboxes: true }));
  await sleep(400);
  await page.screenshot({ path: `${OUT}lab-third-person-hitboxes.png` });

  // Keyboard wiring: F1 opens help.
  await page.keyboard.press("F1");
  await sleep(100);
  result.checks.helpOpensWithF1 = await page.evaluate(() => !document.querySelector(".help").classList.contains("hidden"));
  await page.screenshot({ path: `${OUT}lab-help.png` });

  // Skopós: two shells, and the swap key changes the possessed shell.
  await page.goto(`${BASE}/labs/movement_lab.html?op=skopos`);
  await page.waitForFunction(() => window.__lab?.report?.ready, null, { timeout: 30000 });
  await sleep(500);
  const before = await page.locator(".op-name").textContent();
  await page.keyboard.press("KeyZ");
  await sleep(200);
  const after = await page.locator(".op-name").textContent();
  result.checks.skoposShellSwap = before.includes("shell 1/2") && after.includes("shell 2/2");
  await browser.close();

  result.report = report;
  result.errors = errors;
  const c = result.checks;
  c.noPageErrors = errors.length === 0;
  c.webglRenders = report.webgl.length > 0 && report.frames > 60;
  c.walkSpeedFromData = Math.abs(report.walkSpeed - 3.0) < 0.1;
  c.sprintSpeedFromData = Math.abs(report.sprintSpeed - 4.75) < 0.1;
  c.vaulted = report.vaulted && report.windowCrossed;
  c.allStances = [0, 1, 2].every((s) => report.stancesSeen.includes(s));
  c.leaned = report.maxLean > 0.99;
  c.ladderToTowerTop = report.laddered && report.towerTop;
  ok = Object.values(c).every(Boolean);
} catch (e) {
  result.error = String(e?.stack ?? e);
} finally {
  server.kill();
  console.log(JSON.stringify(result, null, 2));
  console.log(ok ? "[e2e] movement lab: PASS" : "[e2e] movement lab: FAIL");
  console.log(`[e2e] screenshots in ${OUT}`);
  process.exit(ok ? 0 : 1);
}
