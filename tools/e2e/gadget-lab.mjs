// End-to-end check of the Gadget Lab (Phase 8 M1 to M10, game/shared/src/gadgets/DESIGN.md §11). Offline (the page's
// own room in a Web Worker): Sledge takes a frag out with 3 and throws it (it flies, comes to rest, and is gone at its
// fuse), then swings his hammer (Z) at a soft wall close by (both faces broken, a charge spent). Fuze takes a Breach
// Charge out, holds Fire at a soft wall until it's on it (the detonator is then in hand) and sets it off: the wall has
// a hole. Then his Cluster Charge (Z) on the reinforced wall: it drills, its grenades come out on the far side, the
// steel has a hole; and Thermite's Exothermic Charge there: it burns, then a large hole goes through the steel. Mute
// puts a Signal Disruptor down (Z); Pulse's sensor (Z) shows the attacker dummy's heartbeat; Mira's Black Mirror (Z)
// cuts its window into the reinforceable wall; Brava throws a Kludge drone (Z) and drives it; Dokkaebi pings the defender
// dummy in the open (spotting it) and calls it with her tablet (Z): 7 s later its phone goes off; Lesion throws a Gu
// mine (Z) at the attacker dummy's feet and it goes off; Skopós's idle shell stands behind its barrier. Mute throws his Nitro Cell at the feet of the attacker dummy in the open, steps well away and sets it off:
// the dummy is down, by the Nitro Cell. Sledge's stun thrown in front of him whites out his screen; Thermite's smoke
// grenade leaves its cloud in the table. Online, two pages at 100 ms of simulated round trip: what A throws, B has in
// its table too, A's prediction needed no corrections, and both see its blast; then A as Fuze: B sees his shield up
// and on his back, and his bash knocks B down onto its back and up again (D-156). (The level's ingredients are in the
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
const Btn = { Fire: 64, Ads: 8, Ping: 1 << 11 };
/** What the hands hold (PawnState.hand). */
const Hand = { Weapon: 0, Gadget: 1, Detonator: 2 };
const FLYING = 1;
const ACTIVE = 64;
/** The level's ingredients (Phase 8 M3), in every table from the start, and dead defender dummies' phones (M9). */
const INGREDIENTS = ["fire_extinguisher", "gas_pipe", "metal_detector", "dropped_phone"];

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
    // A slow runner by hand (THROTTLE=8: the page's CPU 8 times slower), to reproduce what CI's sees.
    if (process.env.THROTTLE) await (await ctx.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.THROTTLE) });
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

  // ---- offline (M5): Fuze's Cluster Charge (Z) on the reinforced wall, then its detonator: it drills the steel for
  // 1.75 s, then its grenades come out on the far side one after another (and go off), and it falls, its hole left
  await off.evaluate(() => window.__lab.teleport(11.5, 0, -4.6, 0));
  await sleep(600);
  const steelBefore = (await off.evaluate(() => window.__lab.panel("reinforced"))).holes[3];
  await off.keyboard.press("KeyZ");
  await until(off, () => window.__lab.net.hand === 3);
  await sleep(1000);
  await input(off, { buttons: Btn.Fire, pitch: 0 });
  await until(off, () => window.__lab.net.table.some((g) => g.kind === "cluster_charge"));
  await input(off, { pitch: 0 });
  await sleep(300);
  result.cluster = await state(off);
  await off.evaluate(() => window.__lab.teleport(11.5, 0, -1.0, 0));
  await sleep(600);
  await input(off, { buttons: Btn.Fire });
  await until(off, (a) => window.__lab.net.table.some((g) => g.kind === "cluster_charge" && g.flags & a), ACTIVE);
  await input(off, null);
  const drillFrom = Date.now();
  await until(off, () => window.__lab.net.table.some((g) => g.kind === "cluster_grenade"));
  result.clusterDrillMs = Date.now() - drillFrom;
  await off.screenshot({ path: shot("gadget-cluster-grenades.png") });
  await until(off, () => !window.__lab.net.table.some((g) => g.kind === "cluster_charge" || g.kind === "cluster_grenade"));
  result.clusterHoles = (await off.evaluate(() => window.__lab.panel("reinforced"))).holes;
  result.checks.clusterDrillsSteelThenReleases = result.cluster.hand === 4 && result.clusterDrillMs > 1200 && result.clusterHoles[3] > steelBefore;

  // ---- offline (M11): Fuze's Ballistic Shield: up in front, the HUD says so; Fire alone doesn't fire his pistol, aimed
  // (once the aim is done) it does; his gadget out puts the shield on his back
  await off.evaluate(() =>
    window.__lab.pickLoadout({ ...window.__lab.net.loadout, operator: "fuze", primary: { weapon: "ballistic_shield", sight: null, barrel: null, grip: null, underbarrel: null }, gadgets: ["breach_charge"] }),
  );
  await off.waitForFunction(() => window.__lab?.net?.ready && window.__lab.net.own && window.__lab.net.loadout?.primary.weapon === "ballistic_shield", null, { timeout: 30000 });
  await off.evaluate(() => window.__lab.teleport(0, 0, 8, 0));
  await sleep(800);
  const shieldNow = () => ({ at: window.__lab.net.own.shieldAt, note: document.querySelector(".weapon-state")?.textContent ?? "", loaded: window.__lab.net.weapon.loaded });
  result.shield = { up: await off.evaluate(shieldNow) };
  // Held for the page's own ticks, not the wall clock's: a slow runner's page draws a few frames a second, and a press
  // shorter than a frame is never seen at all (CI run 42412334019; THROTTLE=8 by hand). Fire alone, 40 ticks: no shot.
  const t0 = await off.evaluate(() => window.__lab.tick);
  await input(off, { buttons: Btn.Fire });
  await until(off, (t) => window.__lab.tick >= t, t0 + 40);
  await input(off, null);
  result.shield.hip = (await off.evaluate(shieldNow)).loaded;
  // Aimed: once the aim is done (the plate swung aside), Fire held until the pistol fires.
  await input(off, { buttons: Btn.Ads });
  await until(off, () => window.__lab.net.own.adsQ >= 65535, null, 15000).catch(() => {});
  await off.screenshot({ path: shot("gadget-shield-aimed.png") });
  await input(off, { buttons: Btn.Ads | Btn.Fire });
  await until(off, (n) => window.__lab.net.weapon.loaded < n, result.shield.hip, 10000).catch(() => {});
  await input(off, null);
  result.shield.aimed = (await off.evaluate(shieldNow)).loaded;
  await off.keyboard.press("Digit3");
  await until(off, () => window.__lab.net.hand === 1);
  await sleep(300);
  result.shield.back = await off.evaluate(shieldNow);
  await off.keyboard.press("Digit1");
  result.checks.shieldUpAimedFireOnlyOnTheBackForAGadget =
    result.shield.up.at === 1 && /SHIELD UP/.test(result.shield.up.note) && result.shield.hip === result.shield.up.loaded && result.shield.aimed === result.shield.hip - 1 && result.shield.back.at === 2;

  // ---- offline (M5): Thermite's Exothermic Charge on the reinforced wall (looking below Fuze's hole; it stands on
  // the floor): it burns 3 s once set off, then a large hole goes through the steel
  await off.evaluate(() => window.__lab.pickLoadout({ ...window.__lab.net.loadout, operator: "thermite", gadgets: ["smoke"] }));
  await off.waitForURL(/op=thermite/, { timeout: 30000 });
  await off.waitForFunction(() => window.__lab?.net?.ready && window.__lab.net.own && window.__lab.net.loadout?.operator === "thermite", null, { timeout: 30000 });
  await off.evaluate(() => window.__lab.teleport(11.5, 0, -4.6, 0));
  await sleep(600);
  const exoBefore = (await off.evaluate(() => window.__lab.panel("reinforced"))).holes[3];
  await off.keyboard.press("KeyZ");
  await until(off, () => window.__lab.net.hand === 3);
  await sleep(1000);
  await input(off, { buttons: Btn.Fire, pitch: -0.3 });
  await until(off, () => window.__lab.net.table.some((g) => g.kind === "exothermic_charge"));
  await input(off, { pitch: -0.3 });
  await sleep(300);
  result.exo = await state(off);
  await off.evaluate(() => window.__lab.teleport(11.5, 0, -1.0, 0));
  await sleep(600);
  await input(off, { buttons: Btn.Fire });
  await until(off, (a) => window.__lab.net.table.some((g) => g.kind === "exothermic_charge" && g.flags & a), ACTIVE);
  await input(off, null);
  const burnFrom = Date.now();
  await sleep(1200);
  await off.screenshot({ path: shot("gadget-exothermic-burning.png") });
  await until(off, () => !window.__lab.net.table.some((g) => g.kind === "exothermic_charge"));
  result.exoBurnMs = Date.now() - burnFrom;
  await sleep(300);
  await off.screenshot({ path: shot("gadget-exothermic-breach.png") });
  result.exoHoles = (await off.evaluate(() => window.__lab.panel("reinforced"))).holes;
  // Its 1.5 × 2.0 m through 5 cm cells: some 1,200 of them out of the steel.
  result.checks.exothermicBurnsThenBreachesSteel = result.exo.hand === 4 && result.exoBurnMs > 2200 && result.exoHoles[3] - exoBefore > 1000;

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

  // ---- offline (M6): Mute's Signal Disruptor (Z) at his feet: held 3 s, it stands on the floor (its reach shown)
  await nit.keyboard.press("KeyZ");
  await until(nit, () => window.__lab.net.hand === 3);
  await sleep(1000);
  await input(nit, { buttons: Btn.Fire, pitch: -1.2 });
  await until(nit, () => window.__lab.net.table.some((g) => g.kind === "signal_disruptor"));
  await input(nit, { pitch: -0.4 });
  await sleep(300);
  await nit.screenshot({ path: shot("gadget-jammer.png") });
  result.jammer = (await state(nit)).table.find((g) => g.kind === "signal_disruptor") ?? null;
  result.checks.jammerStandsOnTheFloor = result.jammer !== null && result.jammer.pos[1] < 0.2 && (result.jammer.flags & 2) === 2;
  await nit.close();

  // ---- offline (M6): Pulse's Cardiac Sensor (Z) facing the attacker dummy 3.5 m away: one heartbeat on it
  const pul = await open(`${BASE}/labs/gadget_lab.html?autotest=1&lowgfx&op=pulse`, { width: 960, height: 540 });
  await pul.evaluate(() => window.__lab.teleport(-3, 0, 15.5, 0));
  await sleep(600);
  await pul.keyboard.press("KeyZ");
  await until(pul, () => window.__lab.net.hand === 3);
  await until(pul, () => document.querySelectorAll(".sensor:not(.hidden) .sensor-blips i").length > 0, null, 10000);
  result.sensor = await pul.evaluate(() => ({ blips: document.querySelectorAll(".sensor-blips i").length, title: document.querySelector(".sensor-title")?.textContent ?? "" }));
  await pul.screenshot({ path: shot("gadget-sensor.png") });
  result.checks.sensorShowsTheAttackerDummy = result.sensor.blips === 1 && /1 heartbeat\b/.test(result.sensor.title);
  await pul.close();

  // ---- offline (M7): Mira's Black Mirror (Z) in the reinforceable wall: 5 s held, its window cut and its canister on
  // her side; clear from her side, black from the other (screenshots)
  const mir = await open(`${BASE}/labs/gadget_lab.html?autotest=1&lowgfx&op=mira`, { width: 960, height: 540 });
  await mir.evaluate(() => window.__lab.teleport(1.6, 0, -5.0, 0));
  await sleep(600);
  await mir.keyboard.press("KeyZ");
  await until(mir, () => window.__lab.net.hand === 3);
  await sleep(1000);
  await input(mir, { buttons: Btn.Fire, pitch: 0 });
  await until(mir, () => window.__lab.net.table.some((g) => g.kind === "black_mirror"));
  await input(mir, { pitch: 0 });
  await sleep(500);
  result.mirror = await mir.evaluate(() => ({ table: window.__lab.net.table.map((g) => g.kind), holes: window.__lab.panel("reinforce_2").holes }));
  await mir.keyboard.press("KeyZ");
  await mir.evaluate(() => window.__lab.teleport(1.6, 0, -3.8, 0));
  await sleep(800);
  await mir.screenshot({ path: shot("gadget-mirror-clear.png") });
  await mir.evaluate(() => window.__lab.teleport(1.6, 0, -8.2, 180));
  await sleep(800);
  await mir.screenshot({ path: shot("gadget-mirror-black.png") });
  await input(mir, null);
  result.checks.mirrorCutsItsWindow = result.mirror.table.includes("black_mirror") && result.mirror.table.includes("mirror_canister") && result.mirror.holes[0] > 0 && result.mirror.holes[2] > 0;
  await mir.close();

  // ---- offline (M8): Brava's Kludge drone: Z throws one out and she drives it (its HUD: hacks left)
  const bra = await open(`${BASE}/labs/gadget_lab.html?autotest=1&lowgfx&op=brava`, { width: 960, height: 540 });
  await bra.evaluate(() => window.__lab.teleport(0, 0, 16, 0));
  await sleep(600);
  result.kludgeBefore = await bra.locator(".gadget-line").textContent();
  await bra.keyboard.press("KeyZ");
  await until(bra, () => /KLUDGE/.test(document.querySelector(".dronecam-title")?.textContent ?? ""), null, 10000);
  await input(bra, { forward: 1 });
  await sleep(800);
  await input(bra, null);
  result.kludge = await bra.evaluate(() => ({ title: document.querySelector(".dronecam-title")?.textContent ?? "", line: document.querySelector(".gadget-line")?.textContent ?? "" }));
  await bra.screenshot({ path: shot("gadget-kludge.png") });
  result.checks.kludgeThrownAndDriven = /KLUDGE DRONE ×2/.test(result.kludgeBefore ?? "") && /KLUDGE · 3 hacks · /.test(result.kludge.title);
  await bra.close();

  // ---- offline (M9): Dokkaebi 5 m in front of the defender dummy in the open: a ping (T) on it spots it; her tablet (Z)
  // and left mouse call it (the upload's bar shows); 7 s later its phone goes off (the payload's blast)
  const dok = await open(`${BASE}/labs/gadget_lab.html?autotest=1&lowgfx&op=dokkaebi`, { width: 960, height: 540 });
  await dok.evaluate(() => window.__lab.teleport(3, 0, 7, 0));
  await sleep(600);
  await input(dok, { yaw: 0, pitch: -0.12 });
  await sleep(300);
  await input(dok, { yaw: 0, pitch: -0.12, buttons: Btn.Ping });
  await until(dok, () => window.__lab.net.events.some((e) => e.kind === "spotted"), null, 10000);
  await input(dok, { yaw: 0, pitch: -0.12 });
  await dok.keyboard.press("KeyZ");
  await until(dok, () => window.__lab.net.hand === 3);
  await sleep(1000);
  // (Pressed again if a slow page lets a press go by: CI run 41260952777 missed the only one.)
  const calling = () => dok.evaluate(() => window.__lab.net.events.some((e) => e.kind === "jegeo" && e.stage === 0));
  for (let k = 0; k < 4 && !(await calling()); k++) {
    await input(dok, { yaw: 0, pitch: -0.12, buttons: Btn.Fire });
    await sleep(400);
    await input(dok, { yaw: 0, pitch: -0.12 });
    await sleep(1500);
  }
  await until(dok, () => window.__lab.net.events.some((e) => e.kind === "jegeo" && e.stage === 0), null, 10000);
  await sleep(2000);
  result.jegeoBar = await dok.evaluate(() => ({ hidden: document.querySelector(".jegeo-bar")?.classList.contains("hidden") ?? true, title: document.querySelector(".jegeo-title")?.textContent ?? "" }));
  await dok.screenshot({ path: shot("gadget-jegeo-upload.png") });
  await until(dok, () => window.__lab.net.events.some((e) => e.kind === "jegeo" && e.stage === 1), null, 15000);
  await sleep(300);
  result.jegeoEvents = await dok.evaluate(() => window.__lab.net.events.filter((e) => e.kind === "jegeo" || e.kind === "spotted" || e.kind === "blast").map((e) => (e.kind === "jegeo" ? `jegeo${e.stage}` : e.kind)));
  await input(dok, null);
  result.checks.jegeoCallsASpottedDummy =
    !result.jegeoBar.hidden && /Uploading/.test(result.jegeoBar.title) && ["spotted", "jegeo0", "jegeo1", "blast"].every((k) => result.jegeoEvents.includes(k));
  await dok.close();

  // ---- offline (M10): Lesion throws a Gu mine (Z) at the attacker dummy's feet: it lands, and the dummy sets it off
  const les = await open(`${BASE}/labs/gadget_lab.html?autotest=1&lowgfx&op=lesion`, { width: 960, height: 540 });
  await les.evaluate(() => window.__lab.teleport(-3, 0, 13.6, 0));
  await sleep(600);
  await les.keyboard.press("KeyZ");
  await until(les, () => window.__lab.net.hand === 3);
  await sleep(1000);
  await input(les, { buttons: Btn.Fire, yaw: 0, pitch: -1.0 });
  // (Waits long enough for a slow page's game time: THROTTLE=8 took over 10 s. The mine is read in the same look that
  // finds it: a slow page can have it go off before a second look.)
  result.guThrown = await until(les, () => window.__lab.net.table.find((g) => g.kind === "gu_mine") ?? null, null, 30000).then((h) => h.jsonValue());
  await input(les, { yaw: 0, pitch: -1.0 });
  await until(les, () => !window.__lab.net.table.some((g) => g.kind === "gu_mine"), null, 30000);
  result.guLeft = await les.evaluate(() => window.__lab.net.gadgets2);
  await input(les, null);
  result.checks.guMineStingsTheAttackerDummy = result.guThrown !== null && result.guLeft === 0;
  await les.close();

  // ---- offline (M10): Skopós's idle shell crouches behind its barrier (a solid entry in the table; screenshot)
  const sko = await open(`${BASE}/labs/gadget_lab.html?autotest=1&lowgfx&op=skopos`, { width: 960, height: 540 });
  await until(sko, () => window.__lab.net.table.some((g) => g.kind === "shell_shield"), null, 10000);
  result.shellBarrier = (await sko.evaluate(() => window.__lab.net.table.filter((g) => g.kind === "shell_shield"))).length;
  await sko.screenshot({ path: shot("gadget-shell-barrier.png") });
  result.checks.idleShellBehindItsBarrier = result.shellBarrier === 1;
  // Her ability key onto that shell's view, then the real mouse (the pointer locked): the view turns, as on a camera,
  // and the shell (and its barrier) stays as it stands (D-169; Ulo found the view stuck, the page pulling it back to the
  // shell's facing every tick).
  await until(sko, () => window.__lab.net.otherYaw !== null, null, 10000);
  await sko.mouse.click(480, 270);
  await sleep(300);
  await sko.keyboard.down("KeyZ");
  await sleep(150);
  await sko.keyboard.up("KeyZ");
  await until(sko, () => window.__lab.net.shellCam, null, 10000);
  await sleep(500);
  const look0 = await sko.evaluate(() => ({ cam: window.__lab.net.camYaw, shell: window.__lab.net.otherYaw }));
  for (let i = 1; i <= 20; i++) {
    await sko.mouse.move(480 + i * 15, 270);
    await sleep(30);
  }
  await sleep(500);
  const look1 = await sko.evaluate(() => ({ cam: window.__lab.net.camYaw, shell: window.__lab.net.otherYaw, locked: document.pointerLockElement !== null }));
  result.shellView = { look0, look1 };
  result.checks.shellViewLooksRoundTheShellStays = look1.locked && Math.abs(look1.cam - look0.cam) > 0.2 && Math.abs(look1.shell - look0.shell) < 1e-4;
  await sko.close();

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
  // The server's own count of mispredictions (a correction that isn't its doing: joins, teleports, a slow page's late
  // inputs it had to idle through are; DECISIONS D-043), as the online lab test counts them.
  const serverStats = async () => (await (await fetch(`${BASE}/stats`)).json()).totals;
  const statsBefore = await serverStats();
  await a.keyboard.press("Digit3");
  await until(a, () => window.__lab.net.hand === 1);
  await sleep(1000);
  await input(a, { buttons: Btn.Fire, pitch: -0.15 });
  await until(a, () => window.__lab.net.table.some((g) => g.kind === "frag"));
  await input(a, { pitch: -0.15 });
  await until(b, () => window.__lab.net.table.some((g) => g.kind === "frag"));
  // Landed on both pages (each its own time: a slow one may not have it down yet when the other has).
  await until(b, () => window.__lab.net.table.some((g) => g.kind === "frag" && !(g.flags & 1)));
  await until(a, () => window.__lab.net.table.some((g) => g.kind === "frag" && !(g.flags & 1)));
  const [ta, tb] = [await state(a), await state(b)];
  const statsAfter = await serverStats();
  result.online = {
    a: ta.table,
    b: tb.table,
    corrections: (await a.evaluate(() => window.__lab.net.corrections)) - corrections,
    mispredicted: statsAfter.mismatchCorrections - statsBefore.mismatchCorrections,
    forced: statsAfter.forcedCorrections - statsBefore.forcedCorrections,
  };
  await b.screenshot({ path: shot("gadget-online-b.png") });
  result.checks.onlineBothTablesAgree = JSON.stringify(ta.table) === JSON.stringify(tb.table) && ta.table.length === 1;
  // A predicted the throw (CI run 42412334019 had 3 corrections, all forced by its slow page's late inputs).
  result.checks.thrownWithoutMispredictions = result.online.mispredicted === 0;
  await input(a, null);
  // Its fuse runs out: both pages hear the blast, and the frag leaves the tables.
  const blast = (ing) => window.__lab.net.events.some((e) => e.kind === "blast") && window.__lab.net.table.every((g) => ing.includes(g.kind));
  await until(a, blast, INGREDIENTS, 10000);
  await until(b, blast, INGREDIENTS, 10000);
  result.checks.onlineBlastSeenByBoth = true;

  // ---- online (M11): Fuze's Ballistic Shield as the other page sees him: up in front, then on his back with a gadget
  // out (the place travels in the remote record)
  // (Fuze first, so the pick keeps his own secondary: Sledge's isn't one of his.)
  await a.evaluate(() => window.__lab.pickOperator("fuze"));
  await a.waitForFunction(() => window.__lab?.net?.ready && window.__lab.net.own && window.__lab.net.loadout?.operator === "fuze", null, { timeout: 30000 });
  await a.evaluate(() =>
    window.__lab.pickLoadout({ ...window.__lab.net.loadout, primary: { weapon: "ballistic_shield", sight: null, barrel: null, grip: null, underbarrel: null }, gadgets: ["breach_charge"] }),
  );
  await a.waitForFunction(() => window.__lab?.net?.ready && window.__lab.net.own && window.__lab.net.loadout?.primary.weapon === "ballistic_shield", null, { timeout: 30000 });
  const fuzeId = await a.evaluate(() => window.__lab.net.pawnId);
  // Fuze at z 8 facing +z, the other page 4 m in front of him looking back at him.
  await a.evaluate(() => window.__lab.teleport(0, 0, 8, 180));
  await b.evaluate(() => window.__lab.teleport(0, 0, 12, 0));
  await input(b, { yaw: 0, pitch: -0.05 });
  const seenAt = (arg) => window.__lab.net.remotes.some((r) => r.id === arg[0] && r.state?.shieldAt === arg[1]);
  await until(b, seenAt, [fuzeId, 1], 15000);
  await sleep(600);
  await b.screenshot({ path: shot("gadget-online-shield.png") });
  await a.keyboard.press("Digit3");
  await until(b, seenAt, [fuzeId, 2], 15000);
  await input(b, null);
  result.checks.onlineShieldSeenByTheOther = true;

  // ---- online (D-156): his bash knocks the other page's body down: over onto its back (the page's own state), then up
  // again, its keys ignored meanwhile. The gadget away first: the shield up again.
  await a.keyboard.press("Digit3");
  await until(b, seenAt, [fuzeId, 1], 15000);
  await b.evaluate(() => window.__lab.teleport(0, 0, 9.1, 90));
  await input(a, { yaw: Math.PI, pitch: 0 });
  await sleep(800);
  const MELEE = 1 << 10;
  const bashed = await (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      // (A slow page can let a short press go by between its ticks: pressed again until it lands.)
      await input(a, { yaw: Math.PI, pitch: 0, buttons: MELEE });
      await sleep(200);
      await input(a, { yaw: Math.PI, pitch: 0 });
      const hit = await b.waitForFunction(() => window.__lab.net.own?.mode === 7, null, { timeout: 6000, polling: 25 }).then(() => true, () => false);
      if (hit) return true;
    }
    return false;
  })();
  // Down: its player holds forward (it mustn't walk off while it lies there).
  await input(b, { forward: 1, yaw: Math.PI / 2, pitch: 0 });
  const flat = bashed && (await b.waitForFunction(() => window.__lab.net.own?.mode === 7 && window.__lab.net.own.knockLie > 0.95, null, { timeout: 30000, polling: 25 }).then(() => true, () => false));
  // Where it lies, and where it still lies 20 of the page's ticks later (it's down 0.6 s), holding forward all the while:
  // read while it's still down (after it's up, a slow page has walked it on before anything here can read it), and the
  // screenshot only after (one takes a second or two on CI: run 42414523946 found it up by then).
  const lying = flat ? await b.evaluate(() => ({ at: [window.__lab.net.own.x, window.__lab.net.own.z], tick: window.__lab.tick })) : null;
  const stillAt = lying
    ? await b
        .waitForFunction((t) => window.__lab.tick >= t && (window.__lab.net.own?.mode === 7 ? [window.__lab.net.own.x, window.__lab.net.own.z] : "up"), lying.tick + 20, { timeout: 30000, polling: 25 })
        .then((h) => h.jsonValue(), () => null)
    : null;
  await b.screenshot({ path: shot("gadget-knocked-down.png") });
  const up = flat && (await b.waitForFunction(() => window.__lab.net.own?.mode === 0, null, { timeout: 30000, polling: 25 }).then(() => true, () => false));
  await input(b, null);
  const lyingAt = lying?.at ?? null;
  result.knockdown = { bashed, flat, up, lyingAt, stillAt };
  // (Holding forward from when it went down: it didn't walk off while it lay there.)
  result.checks.bashKnocksTheOtherDown = bashed && flat && up && Array.isArray(stillAt) && Math.hypot(stillAt[0] - lyingAt[0], stillAt[1] - lyingAt[1]) < 0.05;

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
