// End-to-end check of the Oregon greybox (Phase 5 M1: 1F walkable offline and online). Offline (the page's own
// room in a Web Worker): you start outside the Main Entrance, knife its barricade down and walk into the Lobby,
// then the pause menu's Go to puts you in the Kitchen. With shadows on, a lost and restored WebGL context
// draws the shadows again (they are drawn on request only, D-077). Online, two pages at 100 ms of simulated
// round trip: A breaks the Main Entrance barricade and B sees exactly the server's panels. Screenshots go to
// builds/e2e. Requires `npm run build` first.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = 20800 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = fileURLToPath(new URL("../../builds/e2e/", import.meta.url));
const SERVER = fileURLToPath(new URL("../../game/server/dist/main.js", import.meta.url));
const shot = (name) => join(OUT, name);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAG = 100;
const Btn = { Melee: 1024 };
const DOOR = "1F.o011.bar"; // the Main Entrance barricade (data/maps/oregon/level.json)
const DOOR_Z = 42.45; // its plane; the Lobby is north of it (smaller z)

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
    await page.waitForFunction(() => window.__lab?.net?.ready, null, { timeout: 60000 });
    return page;
  };
  const panel = (page, id) => page.evaluate((id) => window.__lab.panel(id), id);
  const input = (page, v) => page.evaluate((v) => (window.__lab.input = v), v);
  const own = (page) => page.evaluate(() => window.__lab.net.own);
  /** Knife until the barricade in front is broken (a few blows; each press is one swing). */
  const knifeDown = async (page, id) => {
    for (let i = 0; i < 12 && !(await panel(page, id)).broken; i++) {
      await input(page, { buttons: Btn.Melee });
      await sleep(150);
      await input(page, null);
      await sleep(900);
    }
    return panel(page, id);
  };

  // ---- offline: walk in through the Main Entrance
  const off = await open(`${BASE}/labs/oregon.html?autotest=1&lowgfx&op=sledge`, { width: 960, height: 540 });
  const start = await own(off);
  result.start = { x: start.x, z: start.z };
  result.checks.startsOutsideTheMainEntrance = Math.abs(start.x - 37.95) < 0.3 && start.z > DOOR_Z + 1;
  const intact = await panel(off, DOOR);
  result.checks.mainEntranceBarricaded = intact !== null && !intact.empty && !intact.broken;
  await off.evaluate(() => window.__lab.teleport(37.95, 0, 43.2, 0)); // facing the barricade, an arm's length away
  await sleep(800);
  await off.screenshot({ path: shot("oregon-entrance.png") });
  const broken = await knifeDown(off, DOOR);
  result.checks.knifedTheBarricadeDown = broken.broken === true;
  await input(off, { forward: 1 });
  await off.waitForFunction((z) => window.__lab.net.own.z < z - 2, DOOR_Z, { timeout: 20000, polling: 100 });
  await input(off, null);
  const inside = await own(off);
  result.inside = { x: inside.x, z: inside.z, grounded: inside.grounded };
  result.checks.walkedIntoTheLobby = inside.z < DOOR_Z - 2 && inside.grounded === true;
  await off.screenshot({ path: shot("oregon-lobby.png") });

  // Go to the Kitchen from the pause menu.
  await off.keyboard.press("Escape");
  await off.getByRole("button", { name: "1F Kitchen", exact: true }).click();
  await off.keyboard.press("Escape");
  await off.waitForFunction(() => Math.abs(window.__lab.net.own.x - 26.34) < 0.5 && Math.abs(window.__lab.net.own.z - 27.4) < 0.5, null, { timeout: 10000, polling: 100 });
  await sleep(800);
  result.checks.goToKitchen = true;
  await off.screenshot({ path: shot("oregon-kitchen.png") });
  await off.close();

  // ---- shadows on: a lost and restored WebGL context draws the shadow map again
  const gfx = await open(`${BASE}/labs/oregon.html?autotest=1&op=sledge`);
  await sleep(500);
  const drawsBefore = await gfx.evaluate(() => window.__lab.shadowDraws);
  await gfx.evaluate(async () => {
    const canvas = document.querySelector("#view canvas");
    const lose = canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
    const once = (type) => new Promise((r) => canvas.addEventListener(type, r, { once: true }));
    const lost = once("webglcontextlost");
    lose.loseContext();
    await lost;
    const restored = once("webglcontextrestored");
    lose.restoreContext();
    await restored;
  });
  let drawsAfter = drawsBefore;
  for (let i = 0; i < 50 && drawsAfter <= drawsBefore; i++) {
    await sleep(100);
    drawsAfter = await gfx.evaluate(() => window.__lab.shadowDraws);
  }
  result.shadowDraws = { before: drawsBefore, after: drawsAfter };
  result.checks.shadowsDrawnAgainAfterContextRestore = drawsBefore >= 1 && drawsAfter > drawsBefore;
  await gfx.screenshot({ path: shot("oregon-context-restored.png") });
  await gfx.close();

  // ---- online: what one player breaks, the other sees
  const a = await open(`${BASE}/labs/oregon.html?online&autotest=1&lowgfx&op=sledge&lag=${LAG}`);
  const room = (await a.evaluate(() => window.__lab.net)).room;
  const b = await open(`${BASE}/labs/oregon.html?room=${room}&autotest=1&lowgfx&op=mute&lag=${LAG}`);
  await a.waitForFunction(() => window.__lab.net.players.length === 2, null, { timeout: 10000 });
  await a.evaluate(() => window.__lab.teleport(37.95, 0, 43.2, 0));
  await b.evaluate(() => window.__lab.teleport(39.5, 0, 46, 30));
  await sleep(1200);
  const brokenA = await knifeDown(a, DOOR);
  await b.waitForFunction((id) => window.__lab.panel(id).broken, DOOR, { timeout: 10000, polling: 200 });
  await sleep(600);
  const [pa, pb] = [await a.evaluate(() => window.__lab.panels), await b.evaluate(() => window.__lab.panels)];
  result.online = { a: pa, b: pb };
  result.checks.barricadeBrokenForBoth = brokenA.broken === true && (await panel(b, DOOR)).broken === true;
  result.checks.everythingAgrees = pa.hash === pb.hash && pa.mismatches === 0 && pb.mismatches === 0;
  await b.screenshot({ path: shot("oregon-online.png") });

  result.checks.noPageErrors = errors.length === 0;
  result.errors = errors;
  ok = Object.values(result.checks).every(Boolean);
} catch (e) {
  result.error = String(e?.stack ?? e);
} finally {
  await browser?.close();
  server.kill();
  console.log(JSON.stringify(result, null, 2));
  console.log(`[e2e] oregon: ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}
