// End-to-end check of the Gadget Lab (Phase 8 M1 to M4, game/shared/src/gadgets/DESIGN.md §11). Offline (the page's
// own room in a Web Worker): Sledge takes a frag out with 3 and throws it (it flies, comes to rest, and is gone at its
// fuse), then swings his hammer (Z) at a soft wall close by (both faces broken, a charge spent). Fuze takes a Breach
// Charge out, holds Fire at a soft wall until it's on it (the detonator is then in hand) and sets it off: the wall has
// a hole. Mute throws his Nitro Cell at the feet of the attacker dummy in the open, steps well away and sets it off:
// the dummy is down, by the Nitro Cell. Sledge's stun thrown in front of him whites out his screen; Thermite's smoke
// grenade leaves its cloud in the table. Online, two pages at 100 ms of simulated round trip: what A throws, B has in
// its table too, A's prediction needed no corrections, and both see its blast. (The level's ingredients are in the
// table from the start: the checks look at the gadgets thrown.) Requires `npm run build` first.
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
const ACTIVE = 64;
/** The level's ingredients (Phase 8 M3), in every table from the start. */
const INGREDIENTS = ["fire_extinguisher", "gas_pipe", "metal_detector"];

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
  /** What's in the hands and the gadgets in the table (the level's ingredients left out). */
  const state = (page) =>
    page.evaluate((ing) => ({ hand: window.__lab.net.hand, g1: window.__lab.net.gadgets, table: window.__lab.net.table.filter((g) => !ing.includes(g.kind)) }), INGREDIENTS);
  /** Until the page's table has no gadget but the level's ingredients. */
  const noGadgets = (page) => page.waitForFunction((ing) => window.__lab.net.table.every((g) => ing.includes(g.kind)), INGREDIENTS, { timeout: 60000, polling: 100 });
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
  await noGadgets(off);
  await input(off, null);
  result.checks.fragThrownLandsAndGoesOff =
    /FRAG GRENADE ×2/.test(result.hud ?? "") && result.thrown.g1 === 1 && (result.thrown.table[0].flags & FLYING) === FLYING && result.landed.pos[1] < 0.2;

  // ---- offline (M4): Sledge's hammer, Z then left mouse, at the soft wall with studs from 0.9 m: both faces broken
  await off.evaluate(() => window.__lab.teleport(-12, 0, -5.0, 0));
  await sleep(600);
  await off.keyboard.press("KeyZ");
  await until(off, () => window.__lab.net.hand === 3);
  await sleep(600);
  result.hammerBefore = await off.evaluate(() => ({ charges: window.__lab.net.gadgets2, holes: window.__lab.panel("soft_studs").holes }));
  await input(off, { buttons: Btn.Fire, pitch: -0.1 });
  await until(off, (n) => window.__lab.net.gadgets2 < n, result.hammerBefore.charges);
  await input(off, { pitch: -0.1 });
  await until(off, () => window.__lab.panel("soft_studs").holes[2] > 0, null, 5000);
  result.hammer = await off.evaluate(() => ({ charges: window.__lab.net.gadgets2, holes: window.__lab.panel("soft_studs").holes }));
  await off.screenshot({ path: shot("gadget-hammer.png") });
  await input(off, null);
  await off.keyboard.press("Digit1");
  result.checks.hammerBreaksBothFaces = result.hammerBefore.charges === 25 && result.hammer.charges === 24 && result.hammer.holes[0] > 0 && result.hammer.holes[2] > 0;

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
  await noGadgets(off);
  await input(off, null);
  await sleep(120);
  await off.screenshot({ path: shot("gadget-breach-blast.png") });
  await until(off, () => window.__lab.panel("soft_plain").holes[0] > 0, null, 5000);
  result.breachHoles = (await off.evaluate(() => window.__lab.panel("soft_plain"))).holes;
  result.checks.breachChargePlacedThenDetonated =
    /PLACING THE BREACH CHARGE… \d/.test(result.placingBar ?? "") && result.placed.hand === Hand.Detonator && result.placed.table.length === 1 && Math.abs(result.placed.table[0].pos[2] + 5.9) < 0.1;
  result.checks.breachChargeCutsTheWall = result.breachHoles[0] > 0 && result.breachHoles[2] > 0;

  await off.close();

  // ---- offline: Mute's Nitro Cell at the feet of the attacker dummy in the open (−3, 0, 12), set off from afar
  const nit = await open(`${BASE}/labs/gadget_lab.html?autotest=1&lowgfx&op=mute&gadgets=nitro_cell`, { width: 960, height: 540 });
  await nit.evaluate(() => window.__lab.teleport(-3, 0, 15, 0));
  await sleep(600);
  await nit.keyboard.press("Digit3");
  await until(nit, () => window.__lab.net.hand === 1);
  await sleep(1000);
  await input(nit, { buttons: Btn.Fire, pitch: -0.7 });
  await until(nit, () => window.__lab.net.table.some((g) => g.kind === "nitro_cell" && !(g.flags & 1)));
  await input(nit, { pitch: -0.7 });
  result.nitro = (await state(nit)).table[0];
  // Out of its 6 m before setting it off (its owner is hurt by it too).
  await nit.evaluate(() => window.__lab.teleport(-3, 0, 22, 0));
  await sleep(800);
  await input(nit, { buttons: Btn.Fire });
  await until(nit, () => window.__lab.net.events.some((e) => e.kind === "blast"));
  await input(nit, null);
  await sleep(400);
  const downed = await nit.evaluate(() => {
    const dummy = window.__lab.net.remotes.find((r) => r.state && Math.hypot(r.state.x + 3, r.state.z - 12) < 0.6);
    const fell = window.__lab.net.events.find((e) => (e.kind === "down" || e.kind === "kill") && e.victimPawn === dummy?.id);
    const own = window.__lab.net.own;
    return { mode: dummy?.state.mode ?? null, weapon: fell?.weapon ?? null, unhurt: own.hp === own.maxHp };
  });
  result.nitroBlast = downed;
  await nit.screenshot({ path: shot("gadget-nitro-downed.png") });
  result.checks.nitroCellDownsTheDummy = Math.hypot(result.nitro.pos[0] + 3, result.nitro.pos[2] - 12) < 2 && [3, 4].includes(downed.mode) && downed.weapon === "nitro_cell" && downed.unhurt;
  await nit.close();

  // ---- offline (M3): Sledge's stun at his feet, facing it: his screen goes white
  const stun = await open(`${BASE}/labs/gadget_lab.html?autotest=1&lowgfx&op=sledge&gadgets=stun`, { width: 960, height: 540 });
  await stun.evaluate(() => window.__lab.teleport(0, 0, 18, 0));
  await sleep(600);
  await stun.keyboard.press("Digit3");
  await until(stun, () => window.__lab.net.hand === 1);
  await sleep(1000);
  await input(stun, { buttons: Btn.Fire, pitch: -0.9 });
  await until(stun, () => window.__lab.net.events.some((e) => e.kind === "stunned"));
  await input(stun, { pitch: -0.9 });
  await sleep(200);
  result.stun = await stun.evaluate(() => ({ event: window.__lab.net.events.find((e) => e.kind === "stunned"), white: Number(document.querySelector(".stun-white").style.opacity) }));
  await stun.screenshot({ path: shot("gadget-stun.png") });
  result.checks.stunWhitesOutTheScreen = result.stun.event.blind > 0.9 && result.stun.white > 0.5;
  await stun.close();

  // ---- offline (M3): Thermite's smoke grenade: its cloud stays in the table for its time
  const smoke = await open(`${BASE}/labs/gadget_lab.html?autotest=1&lowgfx&op=thermite&gadgets=smoke`, { width: 960, height: 540 });
  await smoke.evaluate(() => window.__lab.teleport(0, 0, 18, 0));
  await sleep(600);
  await smoke.keyboard.press("Digit3");
  await until(smoke, () => window.__lab.net.hand === 1);
  await sleep(1000);
  await input(smoke, { buttons: Btn.Fire, pitch: -0.3 });
  await until(smoke, (a) => window.__lab.net.table.some((g) => g.kind === "smoke" && g.flags & a), ACTIVE);
  await input(smoke, null);
  await sleep(500);
  await smoke.screenshot({ path: shot("gadget-smoke.png") });
  result.smoke = (await state(smoke)).table;
  result.checks.smokeLeavesItsCloud = result.smoke.length === 1 && (result.smoke[0].flags & ACTIVE) === ACTIVE;
  await smoke.close();

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
  // Its fuse runs out: both pages hear the blast, and the frag leaves the tables.
  const blast = (ing) => window.__lab.net.events.some((e) => e.kind === "blast") && window.__lab.net.table.every((g) => ing.includes(g.kind));
  await until(a, blast, INGREDIENTS, 10000);
  await until(b, blast, INGREDIENTS, 10000);
  result.checks.onlineBlastSeenByBoth = true;

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
