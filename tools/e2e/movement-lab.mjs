// End-to-end check of the Movement Lab in a real (headless) browser. Requires `npm run build` first.
// Starts the production server, opens the lab with ?autotest=1 (a scripted run through every mechanic),
// asserts the results, and saves screenshots to builds/e2e/ (gitignored) for a human look.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = 18500 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
// fileURLToPath (not URL.pathname) so this works on Windows and in paths with spaces.
const OUT = fileURLToPath(new URL("../../builds/e2e/", import.meta.url));
const SERVER = fileURLToPath(new URL("../../game/server/dist/main.js", import.meta.url));
const shot = (name) => join(OUT, name);
mkdirSync(OUT, { recursive: true });

/** Raw GET with the path sent exactly as given (fetch would normalize "/../" and reject "%"). */
const rawGet = (path) =>
  new Promise((resolve) => {
    const req = request({ host: "127.0.0.1", port: PORT, path, method: "GET" }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", () => resolve(0));
    req.end();
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [SERVER], {
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

  // Server robustness: malformed and path-traversal requests get 4xx and the server stays up. %5c is a
  // backslash, a path separator on Windows.
  const bad = {
    pct: await rawGet("/%"),
    nul: await rawGet("/%00"),
    dotdot: await rawGet("/../../etc/passwd"),
    enc: await rawGet("/..%2f..%2fetc%2fpasswd"),
    backslash: await rawGet("/..%5c..%5cpackage.json"),
    backslashAssets: await rawGet("/assets/..%5c..%5cREADME.md"),
  };
  result.serverBadRequests = bad;
  result.checks.serverRejectsBadRequests = Object.values(bad).every((c) => c >= 400 && c < 500);
  result.checks.serverSurvivesBadRequests = (await fetch(`${BASE}/health`)).ok;

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
  await page.screenshot({ path: shot("lab-start.png") });
  // The scripted run takes ~15 s of simulated time; software rendering may run it slower.
  await page.waitForFunction(() => window.__lab.report.done, null, { timeout: 120000, polling: 250 });
  const report = await page.evaluate(() => ({ ...window.__lab.report, frames: window.__lab.frames }));
  // Frame rate as drawn here (software rendering, 1280×720): a CPU number, not a GPU one (PLAN §18).
  result.fps = Number(/(\d+) fps/.exec((await page.locator(".fps").textContent()) ?? "")?.[1] ?? NaN);
  await page.screenshot({ path: shot("lab-tower-lean.png") });
  await page.evaluate(() => (window.__lab.view = { thirdPerson: true, hitboxes: true }));
  await sleep(400);
  await page.screenshot({ path: shot("lab-third-person-hitboxes.png") });

  // Keyboard wiring: F1 opens help.
  await page.keyboard.press("F1");
  await sleep(100);
  result.checks.helpOpensWithF1 = await page.evaluate(() => !document.querySelector(".help").classList.contains("hidden"));
  await page.screenshot({ path: shot("lab-help.png") });

  // Skopós: F alone does nothing; Z opens the other shell's camera; F there transfers (1.3 s + 1.3 s).
  await page.goto(`${BASE}/labs/movement_lab.html?op=skopos`);
  await page.waitForFunction(() => window.__lab?.report?.ready, null, { timeout: 30000 });
  await sleep(500);
  const hud = () => page.locator(".op-name").textContent();
  const start = await hud();
  await page.keyboard.press("KeyF");
  await sleep(300);
  const afterF = await hud();
  await page.keyboard.press("KeyZ");
  await page.waitForFunction(() => !document.querySelector(".shellcam").classList.contains("hidden"), null, { timeout: 5000 });
  const camPrompt = await page.locator(".prompt").textContent();
  await page.screenshot({ path: shot("skopos-shell-camera.png") });
  await page.keyboard.press("KeyF");
  await page.waitForFunction(() => document.querySelector(".op-name").textContent.includes("shell 2/2"), null, { timeout: 20000 });
  const camClosed = await page.evaluate(() => document.querySelector(".shellcam").classList.contains("hidden"));
  result.checks.skoposSwapViaCamera =
    start.includes("shell 1/2") && afterF.includes("shell 1/2") && camPrompt.includes("F to transfer") && camClosed;

  // Real keyboard input (not the autotest script): C toggles crouch; sprint stands you up and clears the
  // toggle, so you are still standing after letting go (the simulation alone would crouch you again).
  await page.goto(`${BASE}/labs/movement_lab.html?op=sledge`);
  await page.waitForFunction(() => window.__lab?.report?.ready, null, { timeout: 30000 });
  await sleep(300);
  const onStance = () => page.evaluate(() => document.querySelector(".stances span.on")?.textContent);
  const waitStance = (name) =>
    page.waitForFunction((n) => document.querySelector(".stances span.on")?.textContent === n, name, { timeout: 5000 }).catch(() => {});
  await page.keyboard.press("KeyC");
  await waitStance("CROUCH");
  const crouched = await onStance();
  await page.keyboard.down("KeyW");
  await page.keyboard.down("ShiftLeft");
  await sleep(1200);
  const readout = await page.locator(".readout").textContent();
  const standingAfterSprint = await onStance();
  await page.keyboard.up("ShiftLeft");
  await page.keyboard.up("KeyW");
  await sleep(1000);
  const standingAfterRelease = await onStance();
  const sprintReadoutSpeed = parseFloat(readout); // "4.75 m/s  ·  SPRINT"
  result.keyboard = { crouched, readout, standingAfterSprint, standingAfterRelease };
  result.checks.keyboardCrouchToggle = crouched === "CROUCH";
  result.checks.keyboardSprintStandsUp = standingAfterSprint === "STAND" && readout.includes("SPRINT");
  result.checks.keyboardSprintSpeed = Math.abs(sprintReadoutSpeed - 4.75) < 0.1;
  result.checks.keyboardToggleClearedBySprint = standingAfterRelease === "STAND";

  // Hold mode (from saved settings): C crouches only while held.
  await page.evaluate(() => localStorage.setItem("redmond.settings.v1", JSON.stringify({ crouchMode: "hold" })));
  await page.reload();
  await page.waitForFunction(() => window.__lab?.report?.ready, null, { timeout: 30000 });
  await sleep(300);
  await page.keyboard.down("KeyC");
  await waitStance("CROUCH");
  const holdCrouched = await onStance();
  await page.keyboard.up("KeyC");
  await waitStance("STAND");
  const holdReleased = await onStance();
  result.keyboard.hold = { holdCrouched, holdReleased };
  result.checks.keyboardHoldCrouch = holdCrouched === "CROUCH" && holdReleased === "STAND";
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
  c.mantlePromptStandingStill = report.mantlePromptStandingStill;
  c.mantleWithoutMoving = report.mantledWithoutMoving;
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
