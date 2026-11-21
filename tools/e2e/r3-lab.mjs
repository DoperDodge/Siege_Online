// End-to-end check of the eight Project Redmond R3 operators in the Gadget Lab (game/shared/src/gadgets/R3_OPERATORS.md),
// offline (the page's own room in a Web Worker), each through the page's own keys and HUD. Shunt puts an Arc Pack down
// short of the reinforced wall and it goes against the wall's foot; on the same page Ohm's round at that wall turns
// the pack off, and Dowser's coil up at it reads it. Rivet lays a salvo on the plain soft wall with his driver and sets
// it off from across the room: the wall has a hole. Latch's latch goes on the empty door's jamb at shin height. Bailiff
// clicks her prod on and off with Fire, sets her shield down and switches its shock on with Z. Tonic, hurt, patches
// himself from his monitor: he heals. Hull braces his plate (no shot fired braced) and folds it again (his pistol
// fires from the hip). Requires `npm run build` first.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = 21100 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = fileURLToPath(new URL("../../builds/e2e/", import.meta.url));
const SERVER = fileURLToPath(new URL("../../game/server/dist/main.js", import.meta.url));
const shot = (name) => join(OUT, name);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const Btn = { Fire: 64 };
/** What the hands hold (PawnState.hand). */
const Hand = { Weapon: 0, Ability: 3, AbilityDetonator: 4 };
const OFF = 32;
const ACTIVE = 64;

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
  const open = async (op) => {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const page = await ctx.newPage();
    if (process.env.THROTTLE) await (await ctx.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.THROTTLE) });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`${BASE}/labs/gadget_lab.html?autotest=1&lowgfx&op=${op}`);
    await page.waitForFunction(() => window.__lab?.net?.ready && window.__lab.net.own, null, { timeout: 30000 });
    return page;
  };
  const input = (page, v) => page.evaluate((v) => (window.__lab.input = v), v);
  const until = (page, fn, arg, ms = 30000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 });
  const own = (page) => page.evaluate(() => window.__lab.net.own);
  const table = (page, kind) => page.evaluate((kind) => window.__lab.net.table.filter((g) => g.kind === kind || (kind.endsWith("*") && g.kind.startsWith(kind.slice(0, -1)))), kind);
  const text = (page, sel) => page.evaluate((sel) => document.querySelector(sel)?.textContent ?? "", sel);
  /** Stand at (x, z) facing yawDeg, and settle. */
  const stand = async (page, x, z, yawDeg) => {
    await page.evaluate(([x, z, y]) => window.__lab.teleport(x, 0, z, y), [x, z, yawDeg]);
    await sleep(600);
  };
  /** Fire pressed for a moment (a click) looking `look`. */
  const click = async (page, look = {}) => {
    await input(page, { ...look, buttons: Btn.Fire });
    await sleep(200);
    await input(page, { ...look });
    await sleep(100);
  };
  /** The ability key (Z) pressed once; then until the hands hold `hand` and its equip time's over. */
  const abilityOut = async (page, hand = Hand.Ability) => {
    await page.keyboard.press("KeyZ");
    await until(page, (h) => window.__lab.net.hand === h, hand);
    await sleep(1000);
  };
  /** The view from (x, 1.6, z) to a point. */
  const aim = (from, at) => {
    const v = [at[0] - from[0], at[1] - 1.6, at[2] - from[1]];
    return { yaw: Math.atan2(-v[0], -v[2]), pitch: Math.atan2(v[1], Math.hypot(v[0], v[2])) };
  };

  // ---- Shunt's pack, put down short of the reinforced wall (x 10..13, its face z −5.9): it goes against its foot
  const sh = await open("shunt");
  await stand(sh, 11, -4.4, 0);
  await abilityOut(sh);
  const down = aim([11, -4.4], [11, 0, -5.4]);
  await input(sh, { ...down, buttons: Btn.Fire });
  await until(sh, () => window.__lab.net.table.some((g) => g.kind === "arc_pack"));
  await input(sh, { ...down });
  await sleep(400);
  const [pack] = await table(sh, "arc_pack");
  result.pack = pack;
  await sh.screenshot({ path: shot("r3-shunt-pack.png") });
  // (Aimed half a metre short of the wall's face, it's against it: within a few centimetres of z −5.9.)
  result.checks.shuntPackGoesAgainstTheWallsFoot = !!pack && Math.abs(pack.pos[2] + 5.9) < 0.12 && pack.pos[1] < 0.2;

  // ---- the same page as Ohm (an attacker): his round at the wall over the pack turns it off
  await input(sh, null);
  await sh.evaluate(() => window.__lab.pickOperator("ohm"));
  await until(sh, () => window.__lab.net.loadout?.operator === "ohm");
  await sleep(800);
  result.afterPick = { table: (await table(sh, "arc_pack")).length, team: (await own(sh))?.team };
  await stand(sh, 11, -2.5, 0);
  await abilityOut(sh);
  const atWall = aim([11, -2.5], [11, 0.8, -5.9]);
  const roundsBefore = (await sh.evaluate(() => window.__lab.net.gadgets2));
  await click(sh, atWall);
  await until(sh, () => window.__lab.net.events.some((e) => e.kind === "gshot"), null, 10000).catch(() => {});
  await sleep(500);
  const [packAfter] = await table(sh, "arc_pack");
  result.ohm = { rounds: [roundsBefore, await sh.evaluate(() => window.__lab.net.gadgets2)], pack: packAfter ?? null, shot: await sh.evaluate(() => window.__lab.net.events.find((e) => e.kind === "gshot") ?? null) };
  await sh.screenshot({ path: shot("r3-ohm-round.png") });
  result.checks.ohmsRoundTurnsThePackOff = !!packAfter && (packAfter.flags & OFF) === OFF && result.ohm.rounds[1] === result.ohm.rounds[0] - 1;

  // ---- and as Dowser: his coil up facing the wall reads the pack
  await input(sh, null);
  await sh.evaluate(() => window.__lab.pickOperator("dowser"));
  await until(sh, () => window.__lab.net.loadout?.operator === "dowser");
  await sleep(800);
  await stand(sh, 11, -1, 0);
  await abilityOut(sh);
  await until(sh, () => / [1-9]\d* READ/.test(document.querySelector(".gadget-line")?.textContent ?? ""), null, 10000).catch(() => {});
  result.coilLine = await text(sh, ".gadget-line");
  await sh.screenshot({ path: shot("r3-dowser-coil.png") });
  result.checks.dowsersCoilReadsThePack = /DIVINING COIL.* 1 READ/.test(result.coilLine);
  await sh.close();

  // ---- Rivet: a salvo on the plain soft wall (x −8, face z −5.9) from 3 m off, set off from across the room
  const rv = await open("rivet");
  await stand(rv, -8, -3, 0);
  await abilityOut(rv);
  await click(rv, aim([-8, -3], [-8, 1.0, -5.9]));
  await until(rv, () => window.__lab.net.table.some((g) => g.kind.startsWith("stud_")), null, 10000).catch(() => {});
  const [salvo] = await table(rv, "stud_*");
  result.salvo = salvo ?? null;
  await rv.screenshot({ path: shot("r3-rivet-salvo.png") });
  await stand(rv, -8, 4, 0);
  await rv.keyboard.press("KeyZ");
  await until(rv, (h) => window.__lab.net.hand === h, Hand.AbilityDetonator, 10000).catch(() => {});
  await sleep(800);
  await click(rv, { pitch: 0 });
  await until(rv, () => !window.__lab.net.table.some((g) => g.kind.startsWith("stud_")), null, 10000).catch(() => {});
  await sleep(600);
  result.rivetHoles = await rv.evaluate(() => window.__lab.panel("soft_plain")?.holes ?? null);
  await rv.screenshot({ path: shot("r3-rivet-hole.png") });
  result.checks.rivetsSalvoCutsTheWall = !!salvo && Math.abs(salvo.pos[2] + 5.9) < 0.2 && (await table(rv, "stud_*")).length === 0 && (result.rivetHoles?.[0] ?? 0) > 0;
  await rv.close();

  // ---- Latch: aimed at the floor in the empty door (x −6, z 6), his latch goes on a jamb at shin height
  const la = await open("latch");
  await stand(la, -6, 4.6, 180);
  await abilityOut(la);
  const door = aim([-6, 4.6], [-6.25, 0, 5.95]);
  await input(la, { ...door, buttons: Btn.Fire });
  await until(la, () => window.__lab.net.table.some((g) => g.kind === "snare_latch"), null, 10000).catch(() => {});
  await input(la, { ...door });
  await sleep(300);
  const [latch] = await table(la, "snare_latch");
  result.latch = latch ?? null;
  await la.screenshot({ path: shot("r3-latch-door.png") });
  result.checks.latchGoesOnTheDoorsJamb = !!latch && Math.abs(Math.abs(latch.pos[0] + 6) - 0.5) < 0.12 && Math.abs(latch.pos[2] - 6) < 0.2 && latch.pos[1] > 0.1 && latch.pos[1] < 0.6;
  await la.close();

  // ---- Bailiff: a click of Fire switches her prod on, another off; Z and Fire held set the shield down; Z then
  // switches its shock on
  const ba = await open("bailiff");
  await stand(ba, 0, 14, 0);
  await until(ba, () => window.__lab.net.own.shieldAt === 1);
  await click(ba);
  await until(ba, () => window.__lab.net.own.prodOn, null, 5000).catch(() => {});
  const prodOn = { on: (await own(ba)).prodOn, line: await text(ba, ".weapon-state") };
  await ba.screenshot({ path: shot("r3-bailiff-prod.png") });
  await click(ba);
  await until(ba, () => !window.__lab.net.own.prodOn, null, 5000).catch(() => {});
  const prodOff = (await own(ba)).prodOn;
  await abilityOut(ba);
  await input(ba, { pitch: -0.9, buttons: Btn.Fire }); // the floor a metre or so ahead
  await until(ba, () => window.__lab.net.table.some((g) => g.kind === "bailiff_post"), null, 10000).catch(() => {});
  await input(ba, { pitch: -0.9 });
  await sleep(800);
  await ba.keyboard.press("KeyZ");
  await until(ba, (a) => window.__lab.net.table.some((g) => g.kind === "bailiff_post" && g.flags & a), ACTIVE, 5000).catch(() => {});
  const [post] = await table(ba, "bailiff_post");
  result.bailiff = { prodOn, prodOff, post: post ?? null, line: await text(ba, ".weapon-state") };
  await ba.screenshot({ path: shot("r3-bailiff-set-down.png") });
  result.checks.bailiffsProdAndSetDown = prodOn.on === true && /PROD ON/.test(prodOn.line) && prodOff === false && !!post && (post.flags & ACTIVE) === ACTIVE && /SET DOWN/.test(result.bailiff.line);
  await ba.close();

  // ---- Tonic, hurt: his monitor (Z) and Fire patch him (Auto: himself): he heals, a patch spent
  const to = await open("tonic");
  await stand(to, 0, 14, 0);
  await to.evaluate(() => window.__lab.hurt(50));
  await until(to, () => window.__lab.net.own.hp < window.__lab.net.own.maxHp);
  const hurt = (await own(to)).hp;
  await abilityOut(to);
  const patches = await to.evaluate(() => window.__lab.net.gadgets2);
  await click(to);
  await sleep(3000);
  const healed = await own(to);
  result.tonic = { hurt, now: healed.hp, patches: [patches, await to.evaluate(() => window.__lab.net.gadgets2)] };
  await to.screenshot({ path: shot("r3-tonic-patch.png") });
  result.checks.tonicPatchesHimself = healed.hp > hurt && result.tonic.patches[1] === patches - 1;
  await to.close();

  // ---- Hull: Z braces his plate (the line says so; Fire does nothing), Z again folds it (his pistol fires from the hip)
  const hu = await open("hull");
  await stand(hu, 0, 14, 0);
  await until(hu, () => window.__lab.net.own.shieldAt === 1);
  const folded = await text(hu, ".weapon-state");
  await hu.keyboard.press("KeyZ");
  await until(hu, () => window.__lab.net.own.braceQ === 65535, null, 5000).catch(() => {});
  const braced = { q: (await own(hu)).braceQ, line: await text(hu, ".weapon-state") };
  const loaded0 = await hu.evaluate(() => window.__lab.net.weapon?.loaded ?? null);
  await click(hu);
  await sleep(300);
  const loaded1 = await hu.evaluate(() => window.__lab.net.weapon?.loaded ?? null);
  await hu.screenshot({ path: shot("r3-hull-braced.png") });
  await hu.keyboard.press("KeyZ");
  await until(hu, () => window.__lab.net.own.braceQ === 0, null, 5000).catch(() => {});
  await sleep(300);
  await click(hu);
  await sleep(300);
  const loaded2 = await hu.evaluate(() => window.__lab.net.weapon?.loaded ?? null);
  result.hull = { folded, braced, loaded: [loaded0, loaded1, loaded2] };
  await hu.screenshot({ path: shot("r3-hull-folded.png") });
  result.checks.hullBracesAndFolds = /PLATE UP/.test(folded) && braced.q === 65535 && /PLATE BRACED/.test(braced.line) && loaded1 === loaded0 && loaded2 === loaded0 - 1;
  await hu.close();

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
