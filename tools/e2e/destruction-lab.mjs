// End-to-end check of the Destruction Lab (PLAN §17 Phase 4 "done when": wallbangs, punch holes and
// reinforcing are all synced across clients). Offline (the page's own room in a Web Worker): the reinforce
// prompt and gauge, steel going up on your side, an explosive's cut, and Reset walls from the pause menu.
// Online, two pages at 100 ms of simulated round trip: A reinforces a section and knifes a hole in a wall;
// B ends with exactly the server's panels (steel included). Requires `npm run build` first.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = 20500 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = fileURLToPath(new URL("../../builds/e2e/", import.meta.url));
const SERVER = fileURLToPath(new URL("../../game/server/dist/main.js", import.meta.url));
const shot = (name) => join(OUT, name);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAG = 100;
const Btn = { Interact: 4, Melee: 1024 };

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
  const open = async (url, size = { width: 640, height: 360 }) => {
    const ctx = await browser.newContext({ viewport: size });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(url);
    await page.waitForFunction(() => window.__lab?.net?.ready, null, { timeout: 30000 });
    return page;
  };
  const panel = (page, id) => page.evaluate((id) => window.__lab.panel(id), id);
  const panels = (page) => page.evaluate(() => window.__lab.panels);
  const input = (page, v) => page.evaluate((v) => (window.__lab.input = v), v);
  /** Hold Interact until `done` holds on the page (the hold runs in simulated time, slower here than real time). */
  const holdUntil = async (page, done, arg) => {
    await input(page, { buttons: Btn.Interact });
    await page.waitForFunction(done, arg, { timeout: 60000, polling: 200 });
    await input(page, null);
  };

  // ---- offline: the page's own room
  const off = await open(`${BASE}/labs/destruction_lab.html?autotest=1&lowgfx&op=mute`, { width: 960, height: 540 });
  await off.evaluate(() => window.__lab.teleport(2.2, 0, -5.0, 0)); // 0.9 m from the 2-section wall, its right half
  await sleep(800);
  result.prompt = await off.locator(".prompt").textContent();
  await input(off, { buttons: Btn.Interact });
  await off.waitForFunction(() => /REINFORCING/.test(document.querySelector(".revive-title")?.textContent ?? ""), null, { timeout: 10000 });
  result.gauge = await off.locator(".revive-title").textContent();
  await off.waitForFunction(() => window.__lab.panel("reinforce_2").reinforced !== 0, null, { timeout: 60000, polling: 200 });
  await input(off, null);
  const steel = await panel(off, "reinforce_2");
  result.offline = { steel };
  result.checks.reinforcePromptAndGauge = /Hold F to reinforce \(10 left\)/.test(result.prompt) && /REINFORCING… \d/.test(result.gauge);
  result.checks.steelOnYourSide = steel.reinforced === 2 && steel.steelSides === 2; // section 1, from the +z side
  await off.screenshot({ path: shot("destruction-reinforced.png") });

  // An explosive: G sets off the selected one (the Breach Charge) on the soft wall in front.
  await off.evaluate(() => window.__lab.teleport(-12, 0, -4.6, 0));
  await sleep(600);
  await off.keyboard.press("KeyG");
  await off.waitForFunction(() => window.__lab.panel("soft_studs").modified, null, { timeout: 10000, polling: 200 });
  const blown = await panel(off, "soft_studs");
  result.offline.breach = blown;
  result.checks.breachChargeCuts = blown.holes[0] > 500 && blown.holes[2] > 500;
  await off.evaluate(() => window.__lab.teleport(-12, 0, -2, 0));
  await sleep(800);
  await off.screenshot({ path: shot("destruction-breach.png") });

  // Reset walls, from the pause menu.
  await off.keyboard.press("Escape");
  await off.locator("button", { hasText: "Reset walls" }).click();
  await off.keyboard.press("Escape");
  await off.waitForFunction(() => window.__lab.panels.changed.length === 0, null, { timeout: 10000, polling: 200 });
  result.checks.resetWalls = (await panel(off, "reinforce_2")).reinforced === 0 && (await panel(off, "reinforced")).reinforced === 3;
  await off.close();

  // ---- online: what one player does, the other sees
  const a = await open(`${BASE}/labs/destruction_lab.html?online&autotest=1&lowgfx&op=mute&lag=${LAG}`);
  const room = (await a.evaluate(() => window.__lab.net)).room;
  const b = await open(`${BASE}/labs/destruction_lab.html?room=${room}&autotest=1&lowgfx&op=sledge&lag=${LAG}`);
  await a.waitForFunction(() => window.__lab.net.players.length === 2, null, { timeout: 10000 });
  // A reinforces the 3-section wall's left section from the −z side.
  await a.evaluate(() => window.__lab.teleport(4.4, 0, -7.0, 180));
  await sleep(1000);
  await holdUntil(a, () => window.__lab.panel("reinforce_3").reinforced !== 0);
  // A knifes the wall without studs (a punched hole).
  await a.evaluate(() => window.__lab.teleport(-8, 0, -5.2, 0));
  await sleep(1000);
  await input(a, { buttons: Btn.Melee });
  await sleep(200);
  await input(a, null);
  await a.waitForFunction(() => window.__lab.panel("soft_plain").modified, null, { timeout: 10000, polling: 200 });
  await sleep(600);
  const [pa, pb] = [await panels(a), await panels(b)];
  const [ra, rb] = [await panel(a, "reinforce_3"), await panel(b, "reinforce_3")];
  const [ka, kb] = [await panel(a, "soft_plain"), await panel(b, "soft_plain")];
  result.online = { a: pa, b: pb, steelA: ra, steelB: rb, knifeA: ka, knifeB: kb };
  result.checks.reinforcingSynced = ra.reinforced === 1 && ra.steelSides === 0 && rb.reinforced === 1 && rb.steelSides === 0;
  result.checks.punchedHoleSynced = ka.holes[0] > 10 && ka.holes[2] > 10 && JSON.stringify(ka.holes) === JSON.stringify(kb.holes);
  result.checks.everythingAgrees = pa.hash === pb.hash && pa.mismatches === 0 && pb.mismatches === 0;
  await b.evaluate(() => window.__lab.teleport(-8, 0, -3.5, 0));
  await sleep(1200);
  await b.screenshot({ path: shot("destruction-online-knifed.png") });

  result.checks.noPageErrors = errors.length === 0;
  result.errors = errors;
  ok = Object.values(result.checks).every(Boolean);
} catch (e) {
  result.error = String(e?.stack ?? e);
} finally {
  await browser?.close();
  server.kill();
  console.log(JSON.stringify(result, null, 2));
  console.log(`[e2e] destruction lab: ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}
