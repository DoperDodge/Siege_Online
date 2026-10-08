// End-to-end check of destruction online (PLAN §17 Phase 4 "done when": wallbangs, punch holes and
// reinforcing are all synced across clients): the production server and headless browsers with 100 ms of
// simulated round trip. A shoots the dummy behind the Range Lab's soft wall through it (a wallbang: the hit
// lands), sprays the wall and knifes a hole in it; B, watching, ends with exactly the server's panels, and
// so does C, who joins afterwards. Requires `npm run build` first.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = 20100 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = fileURLToPath(new URL("../../builds/e2e/", import.meta.url));
const SERVER = fileURLToPath(new URL("../../game/server/dist/main.js", import.meta.url));
const shot = (name) => join(OUT, name);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAG = 100;
const Btn = { Ads: 8, Fire: 64, Melee: 1024 };

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
  const panels = (page) => page.evaluate(() => window.__lab.panels);
  const input = (page, v) => page.evaluate((v) => (window.__lab.input = v), v);

  const a = await open(`${BASE}/labs/range_lab.html?online&autotest=1&lowgfx&lag=${LAG}`);
  const room = (await net(a)).room;
  const b = await open(`${BASE}/labs/range_lab.html?room=${room}&autotest=1&lowgfx&lag=${LAG}`);
  await a.waitForFunction(() => window.__lab.net.players.length === 2, null, { timeout: 10000 });
  const fresh = await panels(a);
  result.checks.startIntact = fresh.changed.length === 0 && (await panels(b)).hash === fresh.hash;

  // A wallbang: from 2.5 m in front of the soft wall, aim at the torso of the dummy behind it, as drawn, and fire.
  const roster = (await net(a)).roster;
  const behind = roster.find((e) => e.kind === 1 && e.name === "Behind the wall").pawnIds[0];
  await a.evaluate(() => window.__lab.teleport(-8, 0, 15, 0));
  await input(a, { buttons: Btn.Ads });
  await sleep(1500);
  const hitsOn = async (page, id) => (await net(page)).events.filter((e) => e.kind === "hitConfirm" && e.victimPawn === id).length;
  const wallbang = [];
  for (let i = 0; i < 3 && (await hitsOn(a, behind)) === 0; i++) {
    await a.evaluate((id) => {
      const aim = window.__lab.aimAt(id, "torso");
      window.__lab.input = { yaw: aim.yaw, pitch: aim.pitch, buttons: 8 };
      window.__lab.fire();
    }, behind);
    await sleep(800);
    wallbang.push(await hitsOn(a, behind));
  }
  result.wallbang = { attempts: wallbang, damage: (await net(a)).events.find((e) => e.kind === "hitConfirm" && e.victimPawn === behind)?.damage ?? null };
  result.checks.wallbangHits = (await hitsOn(a, behind)) > 0;

  // A sprays the wall left to right, then walks up and knifes it.
  for (let i = 0; i < 24; i++) {
    await input(a, { yaw: -0.25 + i * 0.02, pitch: -0.1, buttons: Btn.Ads | Btn.Fire });
    await sleep(60);
  }
  await input(a, null);
  await a.evaluate(() => window.__lab.refill());
  await a.evaluate(() => window.__lab.teleport(-7.2, 0, 13.6, 0));
  await sleep(800);
  await input(a, { buttons: Btn.Melee });
  await sleep(150);
  await input(a, null);
  await sleep(1200);

  // Everyone agrees with the server (B watched it happen; every page checks its panels against the hash the
  // server sends with each tick's ops, and would ask again if they differed).
  await b.waitForFunction((h) => window.__lab.panels.hash === h, (await panels(a)).hash, { timeout: 5000 }).catch(() => {});
  const [pa, pb] = [await panels(a), await panels(b)];
  result.panels = { a: pa, b: pb };
  result.checks.wallHoled = pa.changed.includes("wallbang_wall") && pa.ops > 10;
  result.checks.watcherAgrees = pb.hash === pa.hash && pb.ops === pa.ops && pa.mismatches === 0 && pb.mismatches === 0;

  // C joins now: it gets the walls as they are, in one message, and agrees too.
  const c = await open(`${BASE}/labs/range_lab.html?room=${room}&autotest=1&lowgfx&lag=${LAG}`);
  await sleep(500);
  const pc = await panels(c);
  result.panels.c = pc;
  result.checks.lateJoinerAgrees = pc.hash === pa.hash && pc.states >= 1 && pc.mismatches === 0;

  // A look at the holes from B's side.
  await b.evaluate(() => window.__lab.teleport(-8, 0, 15.5, 0));
  await sleep(1200);
  await b.screenshot({ path: shot("online-walls-holes.png") });
  result.checks.noPageErrors = errors.length === 0;
  result.errors = errors;
  ok = Object.values(result.checks).every(Boolean);
} catch (e) {
  result.error = String(e?.stack ?? e);
} finally {
  await browser?.close();
  server.kill();
  console.log(JSON.stringify(result, null, 2));
  console.log(`[e2e] online walls: ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}
