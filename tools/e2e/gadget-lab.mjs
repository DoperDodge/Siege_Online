// End-to-end check of the Gadget Lab (Phase 8 M1, game/shared/src/gadgets/DESIGN.md §11). Offline (the page's own
// room in a Web Worker): Sledge takes a frag out with 3 and throws it (it flies, comes to rest, and is gone at its
// fuse); Fuze takes a Breach Charge out, holds Fire at a soft wall until it's on it (the detonator is then in hand)
// and sets it off. Online, two pages at 100 ms of simulated round trip: what A throws, B has in its table too, and
// A's prediction needed no corrections. Requires `npm run build` first.
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
const Btn = { Fire: 64 };
/** What the hands hold (PawnState.hand). */
const Hand = { Weapon: 0, Gadget: 1, Detonator: 2 };
const FLYING = 1;

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
    await page.waitForFunction(() => window.__lab?.net?.ready && window.__lab.net.own, null, { timeout: 30000 });
    return page;
  };
  const input = (page, v) => page.evaluate((v) => (window.__lab.input = v), v);
  const state = (page) => page.evaluate(() => ({ hand: window.__lab.net.hand, g1: window.__lab.net.gadgets, table: window.__lab.net.table }));
  const until = (page, fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 });

  // ---- offline: Sledge's frag
  const off = await open(`${BASE}/labs/gadget_lab.html?autotest=1&lowgfx&op=sledge&gadgets=frag`, { width: 960, height: 540 });
  await off.evaluate(() => window.__lab.teleport(0, 0, 8, 0));
  await sleep(600);
  await off.keyboard.press("Digit3");
  await until(off, () => window.__lab.net.hand === 1);
  await sleep(1000); // its equip time
  result.hud = await off.locator(".gadget-line").textContent();
  await input(off, { buttons: Btn.Fire, pitch: -0.15 });
  await until(off, () => window.__lab.net.table.some((g) => g.kind === "frag"));
  await input(off, { pitch: -0.15 });
  result.thrown = await state(off);
  await off.screenshot({ path: shot("gadget-frag-flying.png") });
  await until(off, () => window.__lab.net.table.some((g) => g.kind === "frag" && !(g.flags & 1)));
  result.landed = (await state(off)).table[0];
  await off.screenshot({ path: shot("gadget-frag-resting.png") });
  await until(off, () => window.__lab.net.table.length === 0);
  await input(off, null);
  result.checks.fragThrownLandsAndGoesOff =
    /FRAG GRENADE ×2/.test(result.hud ?? "") && result.thrown.g1 === 1 && (result.thrown.table[0].flags & FLYING) === FLYING && result.landed.pos[1] < 0.2;

  // ---- offline: Fuze's Breach Charge on the plain soft wall, then its detonator
  await off.evaluate(() => window.__lab.pickLoadout({ ...window.__lab.net.loadout, operator: "fuze", gadgets: ["breach_charge"] }));
  await off.waitForURL(/op=fuze/, { timeout: 30000 });
  await off.waitForFunction(() => window.__lab?.net?.ready && window.__lab.net.own && window.__lab.net.loadout?.operator === "fuze", null, { timeout: 30000 });
  await off.evaluate(() => window.__lab.teleport(-8, 0, -4.5, 0));
  await sleep(600);
  await off.keyboard.press("Digit3");
  await until(off, () => window.__lab.net.hand === 1);
  await sleep(1000);
  await input(off, { buttons: Btn.Fire, pitch: 0 });
  await until(off, () => /PLACING THE BREACH CHARGE/.test(document.querySelector(".revive-title")?.textContent ?? ""));
  result.placingBar = await off.locator(".revive-title").textContent();
  await until(off, () => window.__lab.net.table.some((g) => g.kind === "breach_charge"));
  await input(off, { pitch: 0 });
  await sleep(300);
  result.placed = await state(off);
  await off.evaluate(() => window.__lab.teleport(-8, 0, -2.5, 0));
  await sleep(800);
  await off.screenshot({ path: shot("gadget-breach-charge.png") });
  await input(off, { buttons: Btn.Fire });
  await until(off, () => window.__lab.net.table.length === 0);
  await input(off, null);
  result.checks.breachChargePlacedThenDetonated =
    /PLACING THE BREACH CHARGE… \d/.test(result.placingBar ?? "") && result.placed.hand === Hand.Detonator && result.placed.table.length === 1 && Math.abs(result.placed.table[0].pos[2] + 5.9) < 0.1;
  await off.close();

  // ---- online: what A throws, B has too; A predicted it all
  const a = await open(`${BASE}/labs/gadget_lab.html?online&autotest=1&lowgfx&op=sledge&gadgets=frag&lag=${LAG}`);
  const room = await a.evaluate(() => window.__lab.net.room);
  const b = await open(`${BASE}/labs/gadget_lab.html?room=${room}&autotest=1&lowgfx&op=mute&lag=${LAG}`);
  await sleep(1500);
  await a.evaluate(() => window.__lab.teleport(0, 0, 8, 0));
  await sleep(800);
  const corrections = await a.evaluate(() => window.__lab.net.corrections);
  await a.keyboard.press("Digit3");
  await until(a, () => window.__lab.net.hand === 1);
  await sleep(1000);
  await input(a, { buttons: Btn.Fire, pitch: -0.15 });
  await until(a, () => window.__lab.net.table.some((g) => g.kind === "frag"));
  await input(a, { pitch: -0.15 });
  await until(b, () => window.__lab.net.table.some((g) => g.kind === "frag"));
  await until(b, () => window.__lab.net.table.some((g) => g.kind === "frag" && !(g.flags & 1)));
  const [ta, tb] = [await state(a), await state(b)];
  result.online = { a: ta.table, b: tb.table, corrections: (await a.evaluate(() => window.__lab.net.corrections)) - corrections };
  await b.screenshot({ path: shot("gadget-online-b.png") });
  result.checks.onlineBothTablesAgree = JSON.stringify(ta.table) === JSON.stringify(tb.table) && ta.table.length === 1;
  result.checks.thrownWithoutCorrections = result.online.corrections === 0;
  await input(a, null);

  result.errors = errors;
  ok = Object.values(result.checks).every(Boolean) && errors.length === 0;
} catch (e) {
  result.error = String(e?.stack ?? e);
} finally {
  await browser?.close();
  server.kill();
  console.log(JSON.stringify(result, null, 2));
  process.exit(ok ? 0 : 1);
}
