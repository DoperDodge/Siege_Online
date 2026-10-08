// End-to-end check of the Range Lab offline (PLAN §17 Phase 3; DECISIONS D-052): the page runs a room of its
// own in a Web Worker, so every shot here is judged exactly as on the server. One headless browser.
// Checks: a headshot kills; torso, falloff at 40 m and leg damage equal the weapon data (the last-shot panel
// compares them); down a dummy, then finish it; reload gives 30 + 1 after a tactical reload, 30 after an empty
// one; fire mode AUTO → SEMI; weapon swap; the 2.5× sight's field of view; a headshot while leaning.
// Screenshots go to builds/e2e/ (gitignored). Requires `npm run build` first.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = 19300 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = fileURLToPath(new URL("../../builds/e2e/", import.meta.url));
const SERVER = fileURLToPath(new URL("../../game/server/dist/main.js", import.meta.url));
const shot = (name) => join(OUT, name);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "inherit"] });
const result = { checks: {} };
let ok = false;
let browser;

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
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/labs/range_lab.html?autotest=1`);
  await page.waitForFunction(() => window.__lab?.net?.ready, null, { timeout: 30000 });
  await sleep(1000);
  const net = () => page.evaluate(() => window.__lab.net);
  const first = await net();
  result.room = first.room;
  result.checks.offlineRoom = first.room === "LOCAL" && first.players.length === 1;
  result.checks.dummiesInRoster = first.roster.filter((e) => e.kind === 1).length === 18;
  const dummy = (name) => first.roster.find((e) => e.kind === 1 && e.name === name).pawnIds[0];
  const input = (v) => page.evaluate((v) => (window.__lab.input = v), v);
  const panelNumbers = (text) => {
    const m = /Dealt (\d+)[^—]*— the data says (\d+|a kill)/.exec(text ?? "");
    return m ? { dealt: Number(m[1]), data: m[2] === "a kill" ? "kill" : Number(m[2]) } : null;
  };

  /** Stand at (x, z) facing yawDeg, aim down sights at `part` of `pawnId` as drawn (leaning if asked), click once. */
  async function shootAt({ x, z, yawDeg = 0, pawnId, part, lean = 0 }) {
    await page.evaluate(([x, z, yawDeg]) => window.__lab.teleport(x, 0, z, yawDeg), [x, z, yawDeg]);
    await input({ lean, buttons: 8 /* Ads */ });
    await sleep(1300);
    const aim = await page.evaluate(([id, part]) => window.__lab.aimAt(id, part), [pawnId, part]);
    if (!aim) return { shot: null, hits: [], panel: "" };
    await input({ yaw: aim.yaw, pitch: aim.pitch, lean, buttons: 8 });
    await sleep(300);
    const before = (await net()).lastShot?.seq ?? -1;
    await page.evaluate(() => window.__lab.fire());
    await page.waitForFunction((b) => (window.__lab.net.lastShot?.seq ?? -1) !== b, before, { timeout: 5000 }).catch(() => {});
    await sleep(500);
    const n = await net();
    const seq = n.lastShot?.seq;
    return { shot: n.lastShot, hits: n.events.filter((e) => e.kind === "hitConfirm" && e.seq === seq), panel: await page.locator(".shot-panel").textContent() };
  }

  // A headshot kills (the 5 m dummy).
  const head = await shootAt({ x: -1.5, z: 20, pawnId: dummy("Lane 5 m"), part: "head" });
  await page.screenshot({ path: shot("range-headshot.png") });
  result.headshot = { hit: head.shot?.hit, hits: head.hits };
  result.checks.headshotKills = head.hits[0]?.headshot === true && head.hits[0]?.killed === true;

  // Torso damage equals the weapon data at that range (10 m), and falls off by 40 m.
  const torso10 = await shootAt({ x: 1.5, z: 20, pawnId: dummy("Lane 10 m"), part: "torso" });
  const t10 = panelNumbers(torso10.panel);
  const torso40 = await shootAt({ x: -3, z: 20, yawDeg: -2, pawnId: dummy("Lane 40 m"), part: "torso" });
  const t40 = panelNumbers(torso40.panel);
  await page.screenshot({ path: shot("range-40m.png") });
  result.torso = { at10: t10, at40: t40, zone10: torso10.hits[0]?.zone, zone40: torso40.hits[0]?.zone, dist40: torso40.shot?.hit?.distance };
  result.checks.torsoDamageIsData = torso10.hits[0]?.zone === "torso" && t10 !== null && t10.dealt === t10.data;
  result.checks.falloffAt40IsData = torso40.hits[0]?.zone === "torso" && t40 !== null && t40.dealt === t40.data && t40.dealt < t10.dealt;

  // An arm or a leg takes less than the torso (the data's zone multiplier), at the same 15 m.
  const leg = await shootAt({ x: -4, z: 20, yawDeg: -9, pawnId: dummy("Lane 15 m"), part: "leg_l" });
  const legN = panelNumbers(leg.panel);
  const torso15 = await shootAt({ x: -4, z: 20, yawDeg: -9, pawnId: dummy("Lane 15 m"), part: "torso" });
  const t15 = panelNumbers(torso15.panel);
  result.limb = { leg: legN, zone: leg.hits[0]?.zone, torso15: t15 };
  result.checks.limbLessThanTorso = leg.hits[0]?.zone === "leg" && legN !== null && legN.dealt === legN.data && t15 !== null && legN.dealt < t15.dealt;

  // Down a dummy (the lab damage tool leaves it 40 HP, so a torso shot downs rather than kills), then finish it.
  const standing = dummy("Standing");
  await page.evaluate(([id]) => window.__lab.damage(id, 70), [standing]);
  await sleep(300);
  const downShot = await shootAt({ x: -22, z: 15, pawnId: standing, part: "torso" });
  await sleep(1200); // it lies down; a downed body can't be hurt for the first moment
  await page.screenshot({ path: shot("range-downed.png") });
  const finishShot = await shootAt({ x: -22, z: 15, pawnId: standing, part: "torso" });
  const killed = (await net()).events.some((e) => e.kind === "kill" && e.victimPawn === standing);
  result.dbno = { down: downShot.hits[0], finish: finishShot.hits[0], killed };
  result.checks.downThenFinish = downShot.hits[0]?.downed === true && finishShot.hits[0]?.killed === true && killed;

  // Reload: three shots, R (tactical): 30 + 1 in the chamber; empty the magazine, R: 30.
  await page.evaluate(() => window.__lab.refill());
  await input({ buttons: 8 });
  await sleep(500);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__lab.fire());
    await sleep(250);
  }
  const afterThree = (await net()).weapon.loaded;
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => window.__lab.net.weapon.loaded === 31, null, { timeout: 6000 }).catch(() => {});
  const tactical = await page.locator(".ammo-loaded").textContent();
  await input({ buttons: 8 | 64 /* Ads | Fire, held */ });
  await page.waitForFunction(() => window.__lab.net.weapon.loaded === 0, null, { timeout: 8000 }).catch(() => {});
  await input({ buttons: 8 });
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => window.__lab.net.weapon.loaded === 30, null, { timeout: 6000 }).catch(() => {});
  const empty = await page.locator(".ammo-loaded").textContent();
  result.reload = { afterThree, tactical, empty };
  result.checks.reloadPlusOne = afterThree === 28 && tactical === "31" && empty === "30";

  // Fire mode: AUTO → SEMI (B); weapon swap (2, then 1).
  const modeBefore = await page.locator(".weapon-state").textContent();
  await page.keyboard.press("KeyB");
  await sleep(300);
  const modeAfter = await page.locator(".weapon-state").textContent();
  result.checks.fireModeAutoToSemi = /^AUTO/.test(modeBefore ?? "") && /^SEMI/.test(modeAfter ?? "");
  await page.keyboard.press("Digit2");
  await page.waitForFunction(() => window.__lab.net.weapon.id !== "l85a2", null, { timeout: 4000 }).catch(() => {});
  const swapped = (await net()).weapon.id;
  await page.keyboard.press("Digit1");
  await page.waitForFunction(() => window.__lab.net.weapon.id === "l85a2", null, { timeout: 4000 }).catch(() => {});
  result.weapons = { modeBefore, modeAfter, swapped, back: (await net()).weapon.id };
  result.checks.swapBothWays = swapped === "p226_mk_25" && result.weapons.back === "l85a2";

  // A headshot while leaning right: the shot leaves from the leaned eye.
  const leanHead = await shootAt({ x: -1.8, z: 20, pawnId: dummy("Lane 5 m"), part: "head", lean: 1 });
  result.lean = { hit: leanHead.shot?.hit, origin: leanHead.shot?.origin };
  result.checks.leanHeadshot = leanHead.hits[0]?.headshot === true && Math.abs((leanHead.shot?.origin?.[0] ?? -1.8) + 1.8) > 0.1;

  // A 2.5× sight: the view narrows to tan(35°) / 2.5 once aimed (vertical FOV 70° by default). It's picked
  // with the pause menu open, as a player does: the page keeps drawing when the new body arrives.
  await page.evaluate(() => document.querySelector(".gear").click()); // the settings button: opens or closes the pause menu
  await page.evaluate(() =>
    window.__lab.pickLoadout({
      operator: "sledge",
      primary: { weapon: "l85a2", sight: "magnified", barrel: null, grip: null, underbarrel: null },
      secondary: { weapon: "p226_mk_25", sight: null, barrel: null, grip: null, underbarrel: null },
      gadgets: ["frag"],
    }),
  );
  await page.waitForFunction(() => window.__lab.net.ready && window.__lab.net.roster.some((e) => e.kind === 0 && e.loadout.primary.sight === "magnified"), null, { timeout: 5000 }).catch(() => {});
  const framesAt = await page.evaluate(() => window.__lab.frames);
  await sleep(1000);
  const menu = await page.evaluate(() => ({ frames: window.__lab.frames, open: !document.querySelector(".pause").classList.contains("hidden"), body: window.__lab.net.weapon?.id }));
  result.pauseMenuPick = { framesBefore: framesAt, ...menu };
  result.checks.pickWithMenuOpenKeepsDrawing = menu.open && menu.frames > framesAt && menu.body === "l85a2";
  await page.evaluate(() => document.querySelector(".gear").click()); // the settings button: opens or closes the pause menu
  await input({ buttons: 8 });
  await sleep(1500);
  const fov = await page.evaluate(() => window.__lab.fov);
  await page.screenshot({ path: shot("range-scope.png") });
  const want = (2 * Math.atan(Math.tan((35 * Math.PI) / 180) / 2.5) * 180) / Math.PI;
  result.scope = { fov, want };
  result.checks.fovAt25x = Math.abs(fov - want) < 0.3;
  await input(null);

  result.fps = Number(/(\d+) fps/.exec((await page.locator(".fps").textContent()) ?? "")?.[1] ?? NaN);
  result.errors = errors;
  result.checks.noPageErrors = errors.length === 0;
  ok = Object.values(result.checks).every(Boolean);
} catch (e) {
  result.error = String(e?.stack ?? e);
} finally {
  await browser?.close();
  server.kill();
  console.log(JSON.stringify(result, null, 2));
  console.log(ok ? "[e2e] range lab: PASS" : "[e2e] range lab: FAIL");
  console.log(`[e2e] screenshots in ${OUT}`);
  process.exit(ok ? 0 : 1);
}
