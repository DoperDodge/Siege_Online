// End-to-end check of Millrace's map page (labs/millrace.html; the map compiled by tools/mapgen, R2). Offline (the
// page's own room in a Web Worker): you start at the lab spawn on the dock apron north of the mill, knife the barricade
// of the Spinning Room's north door down and walk in, then the pause menu's Go to puts you in the Dispatch Office.
// There the HUD line says where you are; H hides the storeys above, M shows the plan view (the wheel zooms it) and P
// switches the palette; Go to lists every room under its storey and going to one shows its callout. From the Spinning
// Room, a burst goes up through the Card Room's soft floor; on H2 in Payroll, the knife opens the hatch and you drop
// into the Dispatch Office. Up the Boiler Stairs from the Boiler Room to the Engine Room and back down, the HUD line
// naming the room each time. At the foot of the mill's north wall, facing it, holding Space hooks you on a rope: W
// climbs, crouch turns you upside down and standing back, S brings you down onto the ground; from the office wing's
// roof edge you hook on upside down, turn right side up, come down to the Drafting Room's east window, and Space swings
// into its barricade (bounced back, kicked) and again through it into the room. Go to each attacker spawn puts you
// outside on the ground; the free camera puts you on the boiler house's roof, and keeps its keys from your body (F with
// the camera in a wall; 2 and F in front of a barricaded door). Go to each bomb site puts you at its first defender
// spawn, in one of its rooms, facing as the spawn does; the markers are drawn and O shows the zones and hides them.
// With shadows on, a lost and restored WebGL context draws the shadows again (they are drawn on request only, D-077),
// and hiding the storeys above redraws them. Online, two pages at 100 ms of simulated round trip: A breaks the
// Spinning Room door's barricade and B sees exactly the server's panels. Screenshots go to builds/e2e. Requires
// `npm run build` first. (Climbing a ladder is the Movement Lab's browser test; Millrace has none.)
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
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
const Btn = { Vault: 2, Interact: 4, Fire: 64, Melee: 1024 };
const CROUCH = 1; // Stance.Crouch: the knife reaches a hatch underfoot from a crouch (1.5 m reach, eye at 1.15 m)
const LEVEL_FILE = new URL("../../data/maps/millrace/level.json", import.meta.url);
const DOOR = "1F.o006.bar"; // the Spinning Room's north door, from the dock apron (data/maps/millrace/level.json)
const DOOR_X = 35;
const DOOR_Z = 0; // its plane; the Spinning Room is south of it (larger z)
/** The neutral palette's grey and the greybox's hard walls (render/storeyView.ts, labScene.ts). */
const NEUTRAL = "#c6cacf";
const HARD_WALL = "#8a8f96";
/** The HUD line: room, storey, world u, the storey's own u (ui/where.ts). */
const WHERE = /^(.+) · (\S+) · world u (-?\d+\.\d), (-?\d+\.\d) · (\S+) u (-?\d+\.\d), (-?\d+\.\d)$/;

/** The first room on `storey` whose rectangles hold (x, z): what the HUD should name (null: outside every room). */
const roomAt = (rooms, storey, x, z) =>
  rooms.find((r) => r.storey === storey && r.rects.some(([x0, z0, x1, z1]) => x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1))) ?? null;

const server = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "inherit"] });
const result = { checks: {}, offline: {} };
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
  const view = (page) => page.evaluate(() => window.__lab.view);
  const hudLine = (page) => page.evaluate(() => document.querySelector(".hud.where")?.textContent ?? "");
  /**
   * The HUD line names the room you're in ("outside" between rooms, "—" before the level has any) and your
   * storey, and gives where you are in world u and in the storey's own u (its frame, world = a·native + b).
   */
  const hudSaysWhereYouAre = async (page) => {
    // The line is redrawn every 100 ms of the page's time, so it trails a body that only just stopped: read again
    // (up to 3 s) until it agrees. A wrong line never does.
    for (const until = Date.now() + 3000; ; await sleep(100)) {
      const r = await hudCheck(page);
      if (r.ok || Date.now() > until) return r;
    }
  };
  const hudCheck = async (page) => {
    const v = await view(page);
    const me = await own(page);
    const line = await hudLine(page);
    const m = WHERE.exec(line);
    const frame = v.levelPlan.frames[v.storey];
    const [wx, wz] = [me.x / v.levelPlan.mPerU, me.z / v.levelPlan.mPerU];
    const here = roomAt(v.rooms, v.storey, me.x, me.z);
    const ok =
      m !== null &&
      m[1] === (here ? here.callout : v.rooms.length ? "outside" : "—") &&
      m[2] === v.storey &&
      m[5] === v.storey &&
      Math.abs(Number(m[3]) - wx) < 0.2 &&
      Math.abs(Number(m[4]) - wz) < 0.2 &&
      Math.abs(Number(m[6]) - (wx - frame.bx) / frame.ax) < 0.2 &&
      Math.abs(Number(m[7]) - (wz - frame.by) / frame.ay) < 0.2;
    return { ok, line, frame };
  };
  /** A frame that moves nothing (1F's own, and B's as drawn): a check in it can't tell the two frames apart. */
  const identity = (f) => f.ax === 1 && f.bx === 0 && f.ay === 1 && f.by === 0;
  /** Open or close the pause menu (Escape toggles it; the pointer is let go first, or Escape would only do that). */
  const menu = async (page, open) => {
    await page.evaluate(() => document.exitPointerLock());
    const isOpen = () => page.evaluate(() => !document.querySelector(".pause").classList.contains("hidden"));
    if ((await isOpen()) !== open) await page.keyboard.press("Escape");
    await page.waitForFunction((open) => !document.querySelector(".pause").classList.contains("hidden") === open, open, { timeout: 5000 });
  };
  /**
   * One knife swing: hold the key until the swing starts (the page samples it once per frame, and a slow frame
   * can outlast a short press), let go, and wait for the swing to end. `held` is the rest of the input meanwhile.
   */
  const swing = async (page, held = null) => {
    await input(page, { ...held, buttons: Btn.Melee });
    const started = await page.waitForFunction(() => window.__lab.net.own.meleeTicks > 0, null, { timeout: 5000, polling: 20 }).then(() => true, () => false);
    await input(page, held);
    await page.waitForFunction(() => window.__lab.net.own.meleeTicks === 0, null, { timeout: 5000, polling: 50 }).catch(() => {});
    await sleep(100);
    return started;
  };
  /** Knife until the panel in front is broken (a few blows; each press is one swing); each swing's outcome in `log`. */
  const knifeDown = async (page, id, held = null, log = [], tries = 12) => {
    for (let i = 0; i < tries && !(await panel(page, id)).broken; i++) {
      const started = await swing(page, held);
      const p = await panel(page, id);
      const me = await own(page);
      log.push({ started, holes: p.holes, broken: p.broken, at: [me.x, me.y, me.z].map((v) => Math.round(v * 100) / 100), pitch: me.pitch });
    }
    return panel(page, id);
  };
  /**
   * Knife a hatch underfoot open from a crouch (each blow that lands takes 10 of its 100 hp). A blow cuts a hole through
   * both skins, so another at the same spot goes through it and meets nothing (the room below is out of reach): step
   * about the hatch, a blow or two at each spot, onto fresh wood, until it breaks. Each blow's outcome in `log`.
   */
  const knifeHatch = async (page, h, log, tries = 24) => {
    const top = h.center[1] + h.size[1] / 2;
    const spots = [];
    for (const dz of [-0.25, 0, 0.25]) for (const dx of [-0.375, -0.125, 0.125, 0.375]) spots.push([h.center[0] + dx, h.center[2] + dz]);
    for (let blows = 0, k = 0; blows < tries && !(await panel(page, h.id)).broken; k++) {
      const [x, z] = spots[k % spots.length];
      await page.evaluate(([x, y, z]) => window.__lab.teleport(x, y, z, 0), [x, top, z]);
      await sleep(400);
      for (let j = 0; j < 2 && blows < tries; j++) {
        blows++; // counted before a miss breaks out: misses use up the tries too
        const before = (await panel(page, h.id)).hp;
        const started = await swing(page, { pitch: -1.45, stance: CROUCH });
        const p = await panel(page, h.id);
        const me = await own(page);
        log.push({ started, hp: p.hp, holes: p.holes, broken: p.broken, at: [me.x, me.y, me.z].map((v) => Math.round(v * 100) / 100) });
        if (p.broken || p.hp === before) break;
      }
    }
    return panel(page, h.id);
  };

  // ---- offline: walk in through the Spinning Room's north door
  const lvl = JSON.parse(readFileSync(fileURLToPath(LEVEL_FILE), "utf8"));
  const labSpawn = lvl.spawns.find((sp) => sp.id === "lab");
  const off = await open(`${BASE}/labs/millrace.html?autotest=1&lowgfx&op=cleave`, { width: 960, height: 540 });
  const start = await own(off);
  result.start = { x: start.x, z: start.z };
  result.checks.startsAtTheLabSpawnOutsideTheMill = Math.abs(start.x - labSpawn.pos[0]) < 0.3 && Math.abs(start.z - labSpawn.pos[2]) < 0.3 && start.z < DOOR_Z - 1;
  const intact = await panel(off, DOOR);
  result.checks.spinningRoomDoorBarricaded = intact !== null && !intact.empty && !intact.broken;
  await off.evaluate(([x, z]) => window.__lab.teleport(x, 0, z, 180), [DOOR_X, DOOR_Z - 0.75]); // facing the barricade, an arm's length away
  await sleep(800);
  await off.screenshot({ path: shot("millrace-entrance.png") });
  result.offline.knife = [];
  const broken = await knifeDown(off, DOOR, null, result.offline.knife);
  result.checks.knifedTheBarricadeDown = broken.broken === true;
  await input(off, { forward: 1 });
  await off.waitForFunction((z) => window.__lab.net.own.z > z + 2, DOOR_Z, { timeout: 20000, polling: 100 });
  await input(off, null);
  const inside = await own(off);
  const roomRects = (id) => lvl.rooms?.find((r) => r.id === id)?.rects ?? [];
  const inRoom = (id, x, z, m = 0) => roomRects(id).some(([x0, z0, x1, z1]) => x >= x0 + m && x <= x1 - m && z >= z0 + m && z <= z1 - m);
  result.inside = { x: inside.x, z: inside.z, grounded: inside.grounded };
  result.checks.walkedIntoTheSpinningRoom = inside.z > DOOR_Z + 2 && inside.grounded === true && inRoom("1F_SPINNING", inside.x, inside.z);
  await off.screenshot({ path: shot("millrace-spinning-room.png") });

  // Go to the Dispatch Office from the pause menu (Go to by storey and room).
  let v = await view(off);
  const dispatchRoom = v.rooms.find((r) => r.id === "1F_DISPATCH");
  const dispatch = { x: dispatchRoom.anchor[0], z: dispatchRoom.anchor[2] };
  await menu(off, true);
  await off.locator(`.pause [data-room="${dispatchRoom.id}"]`).click();
  await menu(off, false);
  await off.waitForFunction((k) => Math.abs(window.__lab.net.own.x - k.x) < 0.5 && Math.abs(window.__lab.net.own.z - k.z) < 0.5, dispatch, { timeout: 10000, polling: 100 });
  await sleep(800);
  result.checks.goToTheDispatchOffice = true;
  await off.screenshot({ path: shot("millrace-dispatch.png") });

  // ---- the storey views (tools/mapgen/DESIGN.md E9 part 1)
  v = await view(off);
  /** The storeys up to yours: what hide-above and the plan view keep. */
  const kept = v.storeys.slice(0, v.storeys.indexOf(v.storey) + 1);
  const panelsKept = kept.reduce((n, id) => n + (v.panels.byStorey[id] ?? 0), 0);
  const panelsAll = Object.values(v.panels.byStorey).reduce((a, b) => a + b, 0);
  result.view = { storey: v.storey, storeys: v.storeys, rooms: v.rooms.length, panels: v.panels.byStorey };
  // The HUD line, against where you are.
  await off.waitForFunction((re) => new RegExp(re).test(document.querySelector(".hud.where")?.textContent ?? ""), WHERE.source, { timeout: 5000, polling: 100 });
  const hud = await hudSaysWhereYouAre(off);
  result.hud = hud.line;
  result.checks.hudLineSaysWhereYouAre = hud.ok;
  // H hides the storeys above yours, panels and all; again shows them.
  await off.keyboard.press("KeyH");
  v = await view(off);
  result.checks.hideAboveHidesTheStoreysAbove = v.hideAbove === true && JSON.stringify(v.shown) === JSON.stringify(kept) && v.panels.shown === panelsKept;
  await off.keyboard.press("KeyH");
  v = await view(off);
  result.checks.hideAboveOffShowsEveryStorey = v.hideAbove === false && v.shown.length === v.storeys.length && v.panels.shown === panelsAll;
  // M: the plan view of your storey (the storeys over it hidden while it lasts); the wheel zooms it in.
  await off.keyboard.press("KeyM");
  v = await view(off);
  result.checks.planViewOfYourStorey = v.plan === true && v.hideAbove === false && JSON.stringify(v.shown) === JSON.stringify(kept) && v.panels.shown === panelsKept;
  await sleep(1800); // the switch's message has faded
  await off.screenshot({ path: shot("millrace-plan.png") });
  await off.mouse.move(480, 270);
  await off.mouse.wheel(0, -300);
  await off.waitForFunction((half) => window.__lab.view.planHalfM < half, v.planHalfM, { timeout: 5000, polling: 100 });
  result.checks.planViewZooms = true;
  await off.keyboard.press("KeyM");
  v = await view(off);
  result.checks.planViewLeft = v.plan === false && v.hideAbove === false && v.shown.length === v.storeys.length && v.panels.shown === panelsAll;
  // P: one light grey for everything static, then the surface classes again.
  await off.keyboard.press("KeyP");
  v = await view(off);
  const statics = Object.entries(v.colors).filter(([key]) => key !== "floor");
  result.checks.neutralPalette = v.palette === "neutral" && statics.length > 0 && statics.every(([, c]) => c === NEUTRAL);
  await off.keyboard.press("KeyP");
  v = await view(off);
  result.checks.greyboxPalette = v.palette === "greybox" && v.colors.HARD_WALL === HARD_WALL;
  // Once the level has rooms: Go to has every room under its storey's heading, and going to one (on another
  // storey, one drawn in a frame of its own if there is one) puts you there with its callout on the HUD, and
  // the HUD's own u in that frame.
  if (v.rooms.length) {
    await menu(off, true);
    const entries = await off.evaluate(() => [...document.querySelectorAll(".pause [data-room]")].map((b) => [b.dataset.room, b.closest("[data-storey]")?.dataset.storey ?? null, b.textContent]));
    result.goToRooms = entries.length;
    result.checks.goToEveryRoomByStorey = v.rooms.every((r) => entries.some(([id, storey, name]) => id === r.id && storey === r.storey && name === r.callout));
    const elsewhere = v.rooms.filter((r) => r.storey !== v.storey);
    const target = elsewhere.find((r) => !identity(v.levelPlan.frames[r.storey])) ?? elsewhere[0] ?? v.rooms[0];
    result.goToRoom = target.id;
    await off.locator(`.pause [data-room="${target.id}"]`).click();
    await menu(off, false);
    await off.waitForFunction((s) => window.__lab.view.storey === s, target.storey, { timeout: 10000, polling: 100 });
    await off.waitForFunction((t) => (document.querySelector(".hud.where")?.textContent ?? "").startsWith(t), `${target.callout} · ${target.storey} · `, { timeout: 5000, polling: 100 });
    result.checks.goToRoomShowsItsCallout = true;
    const there = await hudSaysWhereYouAre(off);
    result.hudThere = there.line;
    // A storey drawn in a frame of its own: the line's second u must be its (Millrace's are all drawn in one).
    result.checks.hudLineInTheRoomsOwnFrame = there.ok && (!identity(there.frame) || !Object.values(v.levelPlan.frames).some((f) => !identity(f)));
    await sleep(800);
    await off.screenshot({ path: shot("millrace-room.png") });
  }

  // ---- floors: a shot up through a 2F soft floor from 1F, and a drop through a hatch
  const tiles = lvl.solids.filter((sd) => sd.panel?.region === "SF-2F-02"); // the Card Room's, over the Spinning Room
  const h2 = lvl.solids.find((sd) => sd.id === "H2"); // Payroll's, over the Dispatch Office
  if (!tiles.length || !h2) throw new Error("millrace.mjs: the level has no SF-2F-02 tiles or no H2 (renamed? update the test)");
  {
    // Under the Card Room's floor, from the Spinning Room: a spot between joists (every 0.4 m from a tile's −x edge),
    // inside the Spinning Room with room to stand.
    const spots = tiles.flatMap((t) => Array.from({ length: Math.floor(t.size[0] / 0.4) }, (_, i) => ({ id: t.id, x: t.center[0] - t.size[0] / 2 + 0.2 + 0.4 * i, z: t.center[2] })));
    const spot = spots.find((p) => inRoom("1F_SPINNING", p.x, p.z, 0.6));
    await off.evaluate(([x, z]) => window.__lab.teleport(x, 0, z, 0), [spot.x, spot.z]);
    await sleep(600);
    await input(off, { pitch: 1.45, buttons: Btn.Fire });
    await off.waitForFunction((id) => window.__lab.panel(id).modified, spot.id, { timeout: 10000, polling: 50 });
    await input(off, null);
    await sleep(400);
    const hit = await panel(off, spot.id);
    result.offline.softFloorShot = { tile: spot.id, holes: hit.holes };
    result.checks.shotUpThroughSoftFloor = hit.holes[0] > 0 && hit.holes[2] > 0; // the bottom skin and the top: through
    await off.screenshot({ path: shot("millrace-soft-floor.png") });
    // H2: stand on it in Payroll, knife it open from a crouch (ten blows that land), and drop into the Dispatch Office.
    result.offline.hatchKnife = [];
    await knifeHatch(off, h2, result.offline.hatchKnife);
    await off.waitForFunction(() => window.__lab.net.own.y < 0.2, null, { timeout: 10000, polling: 100 });
    await input(off, null);
    await sleep(600);
    const landed = await own(off);
    result.offline.hatchDrop = { broken: (await panel(off, "H2")).broken, at: [landed.x, landed.y, landed.z] };
    result.checks.droppedThroughH2IntoTheDispatchOffice = result.offline.hatchDrop.broken && Math.abs(landed.y) < 0.1 && inRoom("1F_DISPATCH", landed.x, landed.z);
  }
  // ---- stairs
  const PawnMode = { Walk: 0, Rappel: 5 };
  const ahead = (deg) => [-Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180)];
  const rad = (deg) => (deg * Math.PI) / 180;
  const calloutOf = (id) => lvl.rooms?.find((r) => r.id === id)?.callout;
  const prompt = (page) => page.evaluate(() => (document.querySelector(".prompt.hidden") ? "" : (document.querySelector(".prompt")?.textContent ?? "")));
  /**
   * Walk through the points: the page steers toward each in turn (window.__lab.walk, tick by tick) and lets go after
   * the last; then wait for the body to stand still on the ground. A flight takes about 2 s of game time. Budgets
   * are game time (the page's ticks), not the clock's: a slow software-rendered page runs the game in slow motion
   * (seen twice: the clock ran out mid-flight), so only a generous clock limit backs them up.
   */
  const gameTick = (page) => page.evaluate(() => window.__lab.tick);
  /** Wait, in game time (a slow page runs fewer ticks a second), for the body to stand still on the ground: 2 s of it at most. */
  const settle = async (page, until = Date.now() + 60000) => {
    const from = await gameTick(page);
    for (let t = 0; (t = (await gameTick(page)) - from) < 2 * 64 && Date.now() < until; await sleep(50)) {
      const me = await own(page);
      if (t > 16 && me.grounded && Math.hypot(me.vx, me.vz) < 0.01) break;
    }
  };
  const walkAlong = async (page, pts, gameSeconds = 20, wallMs = 300000) => {
    const until = Date.now() + wallMs;
    await page.evaluate((p) => window.__lab.walk(p), pts);
    let w = await page.evaluate(() => window.__lab.walking);
    while (!w.done && w.ticks < gameSeconds * 64 && Date.now() < until) {
      await sleep(50);
      w = await page.evaluate(() => window.__lab.walking);
    }
    await page.evaluate(() => window.__lab.walk(null));
    await settle(page, until);
    return w.done;
  };
  // The Boiler Stairs, one flight from the Boiler Room up into the Engine Room: before its first riser, along it, past
  // its top (tools/mapgen's walk test).
  const flight = lvl.stairs?.find((f) => f.id === "ST_FIRING:B>1F#0");
  // Each place below is looked up by id: a check whose place is missing fails rather than going unrun.
  result.checks.upTheBoilerStairsFromBTo1F = result.checks.backDownTheBoilerStairsToB = false;
  if (flight) {
    const [fx, fz] = ahead(flight.yawDeg);
    const len = flight.run * flight.steps;
    const along = (d) => [flight.start[0] + fx * d, flight.start[2] + fz * d];
    const way = [along(-0.6), along(0.2), along(len + 0.25), along(len + 0.3)];
    await off.evaluate(([x, y, z, yaw]) => window.__lab.teleport(x, y, z, yaw), [way[0][0], flight.start[1], way[0][1], flight.yawDeg]);
    await sleep(600);
    const upOk = await walkAlong(off, way.slice(1));
    const up = await own(off);
    const upHud = await hudSaysWhereYouAre(off);
    result.offline.stairsUp = { at: [up.x, up.y, up.z], hud: upHud.line };
    result.checks.upTheBoilerStairsFromBTo1F =
      upOk && Math.abs(up.y - (flight.start[1] + flight.rise * flight.steps)) < 0.05 && upHud.ok && upHud.line.startsWith(`${calloutOf("1F_ENGINE_ROOM")} · 1F · `);
    await off.screenshot({ path: shot("millrace-stairs-up.png") });
    const downOk = await walkAlong(off, [...way].reverse().slice(1));
    const down = await own(off);
    const downHud = await hudSaysWhereYouAre(off);
    result.offline.stairsDown = { at: [down.x, down.y, down.z], hud: downHud.line };
    result.checks.backDownTheBoilerStairsToB =
      downOk && Math.abs(down.y - flight.start[1]) < 0.05 && downHud.ok && downHud.line.startsWith(`${calloutOf("B_BOILER_ROOM")} · B · `);
  }
  // ---- rappel: the mill's north wall is one rope from the ground to the eaves (its 1F and 2F faces); at x 26, between
  // the Warping Room's and the Spinning Room's windows.
  const north = lvl.zones?.find((z) => z.id === "rappel:1F:N01");
  result.checks.rappelUpTheMillAndDown = false;
  if (north) {
    const hp0 = (await own(off)).hp;
    const wallZ = north.boxes[0].center[2] + north.boxes[0].size[2] / 2;
    const facing = 180; // south, at the wall
    await off.evaluate(([x, z, yaw]) => window.__lab.teleport(x, 0, z, yaw), [26, wallZ - 0.6, facing]);
    await input(off, { yaw: rad(facing) });
    await sleep(600);
    const atFoot = await prompt(off);
    // Hold Space (the vault key) to hook on; the body moves onto the rope.
    await input(off, { yaw: rad(facing), buttons: Btn.Vault });
    const hooked = await off.waitForFunction((mode) => window.__lab.net.own.mode === mode && window.__lab.net.own.moveDur === 0, PawnMode.Rappel, { timeout: 20000, polling: 50 }).then(() => true, () => false);
    await input(off, { yaw: rad(facing), forward: 1 });
    const climbed = await off.waitForFunction(() => window.__lab.net.own.y > 3, null, { timeout: 15000, polling: 50 }).then(() => true, () => false);
    await input(off, { yaw: rad(facing) });
    const readout = () => off.evaluate(() => document.querySelector(".readout")?.textContent ?? "");
    await sleep(300);
    const onRope = await readout();
    await off.screenshot({ path: shot("millrace-rappel.png") });
    // The crouch key turns the body upside down (over half a second, not a snap), and back.
    await input(off, { yaw: rad(facing), stance: CROUCH });
    const turned =
      (await off.waitForFunction(() => window.__lab.net.own.ropeTurn === 1, null, { timeout: 10000, polling: 50 }).then(() => true, () => false)) &&
      (await off.waitForFunction(() => /UPSIDE DOWN/.test(document.querySelector(".readout")?.textContent ?? ""), null, { timeout: 5000, polling: 50 }).then(() => true, () => false));
    await off.screenshot({ path: shot("millrace-rappel-upside-down.png") });
    await input(off, { yaw: rad(facing) });
    const upright = await off.waitForFunction(() => window.__lab.net.own.ropeTurn === 0 && !/UPSIDE DOWN/.test(document.querySelector(".readout")?.textContent ?? ""), null, { timeout: 10000, polling: 50 }).then(() => true, () => false);
    await input(off, { yaw: rad(facing), forward: -1 });
    const landed = await off.waitForFunction((walk) => window.__lab.net.own.mode === walk && window.__lab.net.own.y < 0.1, PawnMode.Walk, { timeout: 15000, polling: 50 }).then(() => true, () => false);
    await input(off, null);
    // The tick the rope lets go on isn't grounded yet (the next walking step finds the floor): wait for the page to get
    // there however slowly it steps, up to 10 s (a fixed 300 ms sleep read the let-go tick on CI). A body that never
    // stands still fails the check.
    await off.waitForFunction(() => window.__lab.net.own.grounded, null, { timeout: 10000, polling: 50 }).catch(() => {});
    const down = await own(off);
    result.offline.rappel = { promptAtFoot: atFoot, onRope, steps: { hooked, climbed, turned, upright, landed }, at: [down.x, down.y, down.z], hp: [hp0, down.hp] };
    result.checks.rappelUpTheMillAndDown = /to rappel/.test(atFoot) && hooked && climbed && /RAPPEL/.test(onRope) && turned && upright && landed && down.grounded && down.hp === hp0;
  }
  // A rappel breach: from the office wing's flat roof, at its east edge, facing out over it, hold Space to go over it
  // onto the rope upside down, facing the wall; right side up (the crouch key), down to the Drafting Room's east window
  // (2F.o009), and swing in: the fresh barricade bounces you off, kicked, and the glass breaks; the second swing goes
  // through it into the Drafting Room.
  const win = lvl.solids.find((sd) => sd.id === "2F.o009.bar");
  result.checks.rappelBreachIntoTheDraftingRoom = false;
  if (win) {
    const out = rad(-90); // east, out over the edge
    const held = { yaw: rad(90), stance: CROUCH }; // facing the wall (west), right side up
    const hp0 = (await own(off)).hp;
    await off.evaluate(([x, z]) => window.__lab.teleport(x, 6.3, z, -90), [win.center[0] - 0.2, win.center[2]]);
    await input(off, { yaw: out });
    await sleep(600);
    const atEdge = await prompt(off);
    // Hold Space: over the edge and down onto the rope, turning upside down on the way.
    await input(off, { yaw: out, buttons: Btn.Vault });
    const hooked = await off
      .waitForFunction((mode) => window.__lab.net.own.mode === mode && window.__lab.net.own.moveDur === 0 && window.__lab.net.own.ropeTurn === 1, PawnMode.Rappel, { timeout: 20000, polling: 50 })
      .then(() => true, () => false);
    await input(off, held);
    const upright = await off.waitForFunction(() => window.__lab.net.own.ropeTurn === 0, null, { timeout: 10000, polling: 50 }).then(() => true, () => false);
    // Down slowly to the window (the sill 0.3–1.1 m over the feet: feet 3.0–3.8 m): at full speed a slow page can
    // overshoot it.
    await input(off, { ...held, forward: -0.3 });
    const lowered = await off.waitForFunction(() => window.__lab.net.own.y < 3.75, null, { timeout: 20000, polling: 20 }).then(() => true, () => false);
    await input(off, held);
    await sleep(400);
    const atWindow = await prompt(off);
    const fresh = await panel(off, "2F.o009.bar");
    /** One swing: press Space until it starts, let go, and wait for it to end (out and back, and a bounce off). */
    const swingIn = async () => {
      await input(off, { ...held, buttons: Btn.Vault });
      const started = await off.waitForFunction((mode) => window.__lab.net.own.mode === mode && window.__lab.net.own.rappelTicks > 0, PawnMode.Rappel, { timeout: 5000, polling: 20 }).then(() => true, () => false);
      await input(off, held);
      await off.waitForFunction(() => window.__lab.net.own.rappelTicks === 0, null, { timeout: 20000, polling: 50 }).catch(() => {});
      return started;
    };
    const first = await swingIn();
    const kicked = await off.waitForFunction((hp) => window.__lab.panel("2F.o009.bar").hp < hp && window.__lab.panel("2F.o009.glass").broken, fresh.hp, { timeout: 5000, polling: 50 }).then(() => true, () => false);
    const bounced = (await own(off)).mode === PawnMode.Rappel;
    const worn = await panel(off, "2F.o009.bar");
    const second = await swingIn();
    const inside = await off.waitForFunction((k) => window.__lab.net.own.mode === k.walk && window.__lab.net.own.grounded && window.__lab.net.own.x < k.x, { walk: PawnMode.Walk, x: win.center[0] - 0.3 }, { timeout: 10000, polling: 50 }).then(() => true, () => false);
    await input(off, null);
    await settle(off);
    const me = await own(off);
    const hud = await hudSaysWhereYouAre(off);
    const after = await panel(off, "2F.o009.bar");
    await off.screenshot({ path: shot("millrace-rappel-breach.png") });
    result.offline.rappelBreach = {
      promptAtEdge: atEdge,
      promptAtWindow: atWindow,
      steps: { hooked, upright, lowered, first, kicked, bounced, second, inside },
      barricadeHp: [fresh.hp, worn.hp, after.hp],
      at: [me.x, me.y, me.z],
      hud: hud.line,
      hp: [hp0, me.hp],
    };
    result.checks.rappelBreachIntoTheDraftingRoom =
      /to rappel/.test(atEdge) && hooked && upright && lowered && /to breach/.test(atWindow) && first && kicked && bounced && second && inside && after.broken && Math.abs(me.y - 3.2) < 0.05 && me.hp === hp0 && hud.ok && hud.line.startsWith(`${calloutOf("2F_DRAFTING")} · 2F · `);
  }

  // ---- the outside: Go to each attacker spawn group puts you on the ground outside the building, facing it; the free
  // camera flies up over the roofs, and F puts you on the boiler house's roof under it.
  const spawnSpots = lvl.spawns.filter((sp, i, all) => sp.side === "attack" && all.findIndex((o) => o.group === sp.group) === i);
  await menu(off, true);
  const gotoEntries = await off.evaluate(() => [...document.querySelectorAll(".pause [data-goto]")].map((b) => [b.dataset.goto, b.textContent]));
  await menu(off, false);
  result.offline.spawns = [];
  for (const sp of spawnSpots) {
    const entry = gotoEntries.find(([, text]) => text === `Attacker spawn ${sp.group.replace(/_/g, " ").replace(/(?<=\w)(\w*)/g, (w) => w.toLowerCase())}`);
    if (!entry) {
      result.offline.spawns.push({ group: sp.group, entry: false });
      continue;
    }
    await menu(off, true);
    await off.locator(`.pause [data-goto="${entry[0]}"]`).click();
    await menu(off, false);
    await sleep(1200);
    const at = await own(off);
    const off0 = Math.hypot(at.x - sp.pos[0], at.z - sp.pos[2]);
    const inside = lvl.rooms.some((r) => r.rects.some(([x0, z0, x1, z1]) => at.x >= x0 && at.x <= x1 && at.z >= z0 && at.z <= z1));
    result.offline.spawns.push({ group: sp.group, at: [at.x, at.y, at.z], offM: off0, grounded: at.grounded, inside });
    await off.screenshot({ path: shot(`millrace-spawn-${sp.group.toLowerCase()}.png`) });
  }
  result.checks.attackerSpawnsStandOutside =
    result.offline.spawns.length === 3 && result.offline.spawns.every((x) => x.at && x.offM < 0.1 && x.grounded && Math.abs(x.at[1]) < 0.05 && !x.inside);
  const boilerRoof = [15, 10, 32]; // over the boiler house's flat roof (3.2 m up)
  await off.evaluate((p) => window.__lab.fly([p[0], p[1], p[2], 0, -60]), boilerRoof);
  await sleep(800);
  const flying = await view(off);
  await off.screenshot({ path: shot("millrace-free-camera.png") });
  await off.keyboard.press("KeyF");
  await sleep(1200);
  const dropped = await own(off);
  result.offline.freeCamera = { camera: flying.freeCam, body: [dropped.x, dropped.y, dropped.z], after: (await view(off)).freeCam };
  result.checks.freeCameraPutsYouOnTheBoilerHouseRoof =
    Array.isArray(flying.freeCam) && Math.abs(flying.freeCam[1] - 10) < 0.01 && (await view(off)).freeCam === null &&
    Math.abs(dropped.x - boilerRoof[0]) < 0.1 && Math.abs(dropped.z - boilerRoof[2]) < 0.1 && Math.abs(dropped.y - 3.2) < 0.05 && dropped.grounded;
  await off.screenshot({ path: shot("millrace-boiler-roof.png") });

  // The free camera keeps its keys (D-098): with the camera in a wall, F leaves the camera there and the body where it
  // was; in front of the Stair Hall's barricaded north door, facing it, 2 and then F put the body down there, still
  // holding its primary weapon and not prying the barricade off (neither key reaches the body).
  const roofed = await own(off);
  const wall = lvl.solids.find((s) => s.id === "1F.N#5"); // the mill's north wall between the Spinning Room and the Stair Hall
  await off.evaluate((c) => window.__lab.fly([c[0], 1.65, c[2], 0, 0]), wall.center);
  await sleep(300);
  await off.keyboard.press("KeyF");
  await sleep(600);
  const inWall = { camera: (await view(off)).freeCam, body: await own(off) };
  await off.keyboard.press("KeyN");
  await sleep(300);
  const back = { camera: (await view(off)).freeCam, body: await own(off) };
  const door = lvl.solids.find((s) => s.id === "1F.o007.bar"); // the Stair Hall's north door
  const doorSpot = [door.center[0], door.center[2] - 0.75];
  await off.evaluate((p) => window.__lab.fly(p), [doorSpot[0], 1.65, doorSpot[1], 180, 0]);
  await sleep(300);
  await off.keyboard.press("Digit2");
  await off.keyboard.press("KeyF");
  await sleep(1500);
  const foot = await own(off);
  const doorAfter = await panel(off, door.id);
  const moved = (b) => Math.hypot(b.x - roofed.x, b.y - roofed.y, b.z - roofed.z);
  result.offline.freeCameraKeys = {
    wall: { camera: inWall.camera, bodyMoved: moved(inWall.body), back: back.camera, bodyMovedBack: moved(back.body) },
    door: { at: [foot.x, foot.y, foot.z], mode: foot.mode, slot: foot.slot, deployKind: foot.deployKind, barricade: { broken: doorAfter.broken, hp: doorAfter.hp } },
  };
  result.checks.freeCameraKeepsItsKeys =
    Array.isArray(inWall.camera) && moved(inWall.body) < 0.05 && back.camera === null && moved(back.body) < 0.05 &&
    foot.mode === PawnMode.Walk && foot.slot === 0 && !foot.deployKind && Math.abs(foot.y) < 0.05 && Math.hypot(foot.x - doorSpot[0], foot.z - doorSpot[1]) < 0.1 &&
    !doorAfter.broken && !doorAfter.empty;

  // ---- sites, markers and zones: Go to has every bomb site under its own heading; each puts you at the
  // site's first defender spawn, on its storey, in one of its rooms (the HUD names it), facing as the spawn does.
  // Every marker is drawn (bombs, cameras, ingredients, spawns), and O shows the zones and hides them again.
  if (lvl.sites?.length) {
    await menu(off, true);
    const siteEntries = await off.evaluate(() => [...document.querySelectorAll(".pause .goto-sites [data-site]")].map((b) => [b.dataset.goto, b.dataset.site, b.textContent]));
    await menu(off, false);
    result.offline.sites = [];
    for (const site of lvl.sites) {
      const entry = siteEntries.find(([, id]) => id === site.id);
      const spawn = lvl.spawns.find((sp) => sp.side === "defense" && sp.group === site.id);
      if (!entry || !spawn) {
        result.offline.sites.push({ site: site.id, entry: Boolean(entry), spawn: Boolean(spawn) });
        continue;
      }
      const storey = lvl.storeys.find((st) => Math.abs(st.floorY - spawn.pos[1]) < 0.01).id;
      await menu(off, true);
      await off.locator(`.pause [data-goto="${entry[0]}"]`).click();
      await menu(off, false);
      // The HUD line is rewritten on a frame (a few a second here): wait for it to name one of the site's rooms.
      const lines = site.rooms.map((id) => `${calloutOf(id)} · ${storey} · `);
      const named = await off
        .waitForFunction((ls) => ls.some((l) => (document.querySelector(".hud.where")?.textContent ?? "").startsWith(l)), lines, { timeout: 15000, polling: 100 })
        .then(() => true, () => false);
      await sleep(300);
      const at = await own(off);
      const hud = await hudSaysWhereYouAre(off);
      const turn = at.yaw - rad(spawn.yawDeg);
      const ok =
        entry[2] === site.name && Math.hypot(at.x - spawn.pos[0], at.z - spawn.pos[2]) < 0.1 && Math.abs(at.y - spawn.pos[1]) < 0.05 &&
        Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) < 0.01 && named && hud.ok && lines.some((l) => hud.line.startsWith(l));
      result.offline.sites.push({ site: site.id, name: entry[2], at: [at.x, at.y, at.z], hud: hud.line, ok });
      await off.screenshot({ path: shot(`millrace-site-${site.id.toLowerCase()}.png`) });
    }
    result.checks.goToEverySiteAtItsDefenders = siteEntries.length === lvl.sites.length && result.offline.sites.every((x) => x.ok);
    // The instances in the scene's storeys, kind by kind: a case a bomb, a box and a cone a camera, a disc and a
    // dart a spawn, a box a zone.
    const mv = await view(off);
    const drawn = mv.markers?.instances ?? {};
    const boxesOf = (kind) => lvl.zones.filter((z) => z.kind === kind).reduce((n, z) => n + z.boxes.length, 0);
    const spawnsOf = (side) => lvl.spawns.filter((sp) => (sp.side ?? "lab") === side).length;
    const ingredientsOf = (kind) => lvl.ingredients.filter((g) => g.kind === kind).length;
    const zoneBoxes = boxesOf("rappel") + boxesOf("spawn_peek") + boxesOf("out_of_bounds");
    result.offline.markers = mv.markers;
    // (A kind with nothing to draw has no entry: Millrace has no run-outs.)
    const n = (kind) => drawn[kind] ?? 0;
    result.checks.everyMarkerDrawn =
      n("bomb") === lvl.sites.reduce((k, x) => k + x.bombs.length, 0) && n("camera") === lvl.cameras.length && n("cameraCone") === lvl.cameras.length &&
      n("extinguisher") === ingredientsOf("fire_extinguisher") && n("gasPipe") === ingredientsOf("gas_pipe") &&
      ["attack", "defense", "lab"].every((side) => n(side) === 2 * spawnsOf(side)) &&
      n("rappel") === boxesOf("rappel") && n("spawnPeek") === boxesOf("spawn_peek") && n("runOut") === boxesOf("out_of_bounds");
    await off.keyboard.press("KeyO");
    const on = await view(off);
    await sleep(1800); // the switch's message has faded
    await off.screenshot({ path: shot("millrace-zones.png") });
    await off.keyboard.press("KeyO");
    const offAgain = await view(off);
    result.offline.zonesShown = [mv.markers?.zonesShown, on.markers?.zonesShown, offAgain.markers?.zonesShown];
    result.checks.zonesViewShowsAndHides =
      zoneBoxes > 0 && mv.zones === false && mv.markers.zonesShown === 0 && on.zones === true && on.markers.zonesShown === zoneBoxes && offAgain.zones === false && offAgain.markers.zonesShown === 0;
  }
  await off.close();

  // ---- shadows on: a lost and restored WebGL context draws the shadow map again
  const gfx = await open(`${BASE}/labs/millrace.html?autotest=1&op=cleave`);
  await sleep(500);
  const drawsBefore = await gfx.evaluate(() => window.__lab.shadowDraws);
  // Chrome allows a restore only once the lost event has been handled (three prevents its default), so the
  // restore runs in a later task than the loss.
  await gfx.evaluate(() => {
    const canvas = document.querySelector("#view canvas");
    window.__ctx = { events: [], lose: canvas.getContext("webgl2").getExtension("WEBGL_lose_context") };
    for (const type of ["webglcontextlost", "webglcontextrestored"]) canvas.addEventListener(type, () => window.__ctx.events.push(type));
    window.__ctx.lose.loseContext();
  });
  await gfx.waitForFunction(() => window.__ctx.events.length === 1, null, { timeout: 10000, polling: 100 });
  await gfx.evaluate(() => window.__ctx.lose.restoreContext());
  await gfx.waitForFunction(() => window.__ctx.events.length === 2, null, { timeout: 10000, polling: 100 });
  let drawsAfter = drawsBefore;
  for (let i = 0; i < 50 && drawsAfter <= drawsBefore; i++) {
    await sleep(100);
    drawsAfter = await gfx.evaluate(() => window.__lab.shadowDraws);
  }
  result.shadowDraws = { before: drawsBefore, after: drawsAfter };
  result.checks.shadowsDrawnAgainAfterContextRestore = drawsBefore >= 1 && drawsAfter > drawsBefore;
  await gfx.screenshot({ path: shot("millrace-context-restored.png") });
  // Hiding the storeys above yours draws the shadows again (what's hidden casts none), if there are any.
  const gv = await view(gfx);
  const drawsShown = await gfx.evaluate(() => window.__lab.shadowDraws);
  await gfx.keyboard.press("KeyH");
  if (gv.storeys.indexOf(gv.storey) < gv.storeys.length - 1) await gfx.waitForFunction((n) => window.__lab.shadowDraws > n, drawsShown, { timeout: 5000, polling: 100 });
  result.checks.hideAboveRedrawsTheShadows = (await view(gfx)).hideAbove === true;
  await gfx.keyboard.press("KeyH");
  await gfx.close();

  // ---- online: what one player breaks, the other sees
  const a = await open(`${BASE}/labs/millrace.html?online&autotest=1&lowgfx&op=cleave&lag=${LAG}`);
  const room = (await a.evaluate(() => window.__lab.net)).room;
  const b = await open(`${BASE}/labs/millrace.html?room=${room}&autotest=1&lowgfx&op=lull&lag=${LAG}`);
  await a.waitForFunction(() => window.__lab.net.players.length === 2, null, { timeout: 10000 });
  await a.evaluate(([x, z]) => window.__lab.teleport(x, 0, z, 180), [DOOR_X, DOOR_Z - 0.75]);
  await b.evaluate(([x, z]) => window.__lab.teleport(x, 0, z, 150), [DOOR_X + 1.5, DOOR_Z - 3.5]);
  await sleep(1200);
  const brokenA = await knifeDown(a, DOOR);
  await b.waitForFunction((id) => window.__lab.panel(id).broken, DOOR, { timeout: 10000, polling: 200 });
  await sleep(600);
  const [pa, pb] = [await a.evaluate(() => window.__lab.panels), await b.evaluate(() => window.__lab.panels)];
  result.online = { a: pa, b: pb };
  result.checks.barricadeBrokenForBoth = brokenA.broken === true && (await panel(b, DOOR)).broken === true;
  result.checks.everythingAgrees = pa.hash === pb.hash && pa.mismatches === 0 && pb.mismatches === 0;
  await b.screenshot({ path: shot("millrace-online.png") });

  result.checks.noPageErrors = errors.length === 0;
  result.errors = errors;
  ok = Object.values(result.checks).every(Boolean);
} catch (e) {
  result.error = String(e?.stack ?? e);
} finally {
  await browser?.close();
  server.kill();
  console.log(JSON.stringify(result, null, 2));
  console.log(`[e2e] millrace: ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}
