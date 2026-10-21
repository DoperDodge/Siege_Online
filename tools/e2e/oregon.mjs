// End-to-end check of the Oregon greybox (Phase 5 M1: 1F walkable offline and online; M2: the storey views).
// Offline (the page's own room in a Web Worker): you start outside the Main Entrance, knife its barricade down
// and walk into the Lobby, then the pause menu's Go to puts you in the Kitchen (its room, once the level has
// rooms). There the HUD line says where you are; H hides the storeys above, M shows the plan view (the wheel
// zooms it) and P switches the palette; with rooms, Go to lists every room under its storey and going to one
// shows its callout. From the Kitchen, a burst goes up through the Kids' Dorms' soft floor; on H4 in the Kids'
// Dorms, the knife opens the hatch and you drop into the Kitchen. Up the Armory Stairs from the basement to 1F and
// back down (M3); up the ladder from the 2F Tower onto the Cat Walk, then down it again from the top, facing the
// drop (F, then S), the HUD line naming the room each time. With shadows on, a lost and restored WebGL
// context draws the shadows again (they are drawn on request only, D-077), and hiding the storeys above redraws
// them. Online, two pages at 100 ms of simulated round trip: A breaks the Main Entrance barricade and B sees
// exactly the server's panels. Screenshots go to builds/e2e. Requires `npm run build` first. The checks follow
// the level: with or without rooms or floors, any storeys.
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
const Btn = { Interact: 4, Fire: 64, Melee: 1024 };
const CROUCH = 1; // Stance.Crouch: the knife reaches a hatch underfoot from a crouch (1.5 m reach, eye at 1.15 m)
const DOOR = "1F.o011.bar"; // the Main Entrance barricade (data/maps/oregon/level.json)
const DOOR_Z = 42.45; // its plane; the Lobby is north of it (smaller z)
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
  result.offline.knife = [];
  const broken = await knifeDown(off, DOOR, null, result.offline.knife);
  result.checks.knifedTheBarricadeDown = broken.broken === true;
  await input(off, { forward: 1 });
  await off.waitForFunction((z) => window.__lab.net.own.z < z - 2, DOOR_Z, { timeout: 20000, polling: 100 });
  await input(off, null);
  const inside = await own(off);
  result.inside = { x: inside.x, z: inside.z, grounded: inside.grounded };
  result.checks.walkedIntoTheLobby = inside.z < DOOR_Z - 2 && inside.grounded === true;
  await off.screenshot({ path: shot("oregon-lobby.png") });

  // Go to the Kitchen from the pause menu: its room once the level has rooms (Go to by storey and room), else
  // the hand-picked spot.
  let v = await view(off);
  const kitchenRoom = v.rooms.find((r) => r.storey === "1F" && /kitchen/i.test(r.callout)) ?? v.rooms.find((r) => r.storey === "1F") ?? null;
  const kitchen = kitchenRoom ? { x: kitchenRoom.anchor[0], z: kitchenRoom.anchor[2] } : { x: 26.34, z: 27.4 };
  await menu(off, true);
  await (kitchenRoom ? off.locator(`.pause [data-room="${kitchenRoom.id}"]`) : off.getByRole("button", { name: "1F Kitchen", exact: true })).click();
  await menu(off, false);
  await off.waitForFunction((k) => Math.abs(window.__lab.net.own.x - k.x) < 0.5 && Math.abs(window.__lab.net.own.z - k.z) < 0.5, kitchen, { timeout: 10000, polling: 100 });
  await sleep(800);
  result.checks.goToKitchen = true;
  await off.screenshot({ path: shot("oregon-kitchen.png") });

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
  await off.screenshot({ path: shot("oregon-plan.png") });
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
    // Oregon's 2F and Cat Walk are drawn in frames of their own: the line's second u must be theirs.
    result.checks.hudLineInTheRoomsOwnFrame = there.ok && (!identity(there.frame) || !Object.values(v.levelPlan.frames).some((f) => !identity(f)));
    await sleep(800);
    await off.screenshot({ path: shot("oregon-room.png") });
  }

  // ---- floors (M2): a shot up through a 2F soft floor from 1F, and a drop through a hatch
  const lvl = JSON.parse(readFileSync(fileURLToPath(new URL("../../data/maps/oregon/level.json", import.meta.url)), "utf8"));
  const roomRects = (id) => lvl.rooms?.find((r) => r.id === id)?.rects ?? [];
  const inRoom = (id, x, z, m = 0) => roomRects(id).some(([x0, z0, x1, z1]) => x >= x0 + m && x <= x1 - m && z >= z0 + m && z <= z1 - m);
  const tiles = lvl.solids.filter((s) => s.panel?.region === "SF-2F-01");
  const h4 = lvl.solids.find((s) => s.id === "H4");
  if (tiles.length && h4) {
    // Under the Kids' Dorms floor, from the Kitchen: a spot between joists (every 0.4 m from a tile's −x edge),
    // inside the Kitchen with room to stand.
    const spots = tiles.flatMap((t) => Array.from({ length: Math.floor(t.size[0] / 0.4) }, (_, i) => ({ id: t.id, x: t.center[0] - t.size[0] / 2 + 0.2 + 0.4 * i, z: t.center[2] })));
    const spot = spots.find((p) => inRoom("1F_KITCHEN", p.x, p.z, 0.6));
    await off.evaluate(([x, z]) => window.__lab.teleport(x, 0, z, 0), [spot.x, spot.z]);
    await sleep(600);
    await input(off, { pitch: 1.45, buttons: Btn.Fire });
    await off.waitForFunction((id) => window.__lab.panel(id).modified, spot.id, { timeout: 10000, polling: 50 });
    await input(off, null);
    await sleep(400);
    const hit = await panel(off, spot.id);
    result.offline.softFloorShot = { tile: spot.id, holes: hit.holes };
    result.checks.shotUpThroughSoftFloor = hit.holes[0] > 0 && hit.holes[2] > 0; // the bottom skin and the top: through
    await off.screenshot({ path: shot("oregon-soft-floor.png") });
    // H4: stand on it in the Kids' Dorms, knife it open from a crouch, and drop into the Kitchen.
    await off.evaluate(([x, y, z]) => window.__lab.teleport(x, y, z, 0), [h4.center[0], h4.center[1] + h4.size[1] / 2, h4.center[2]]);
    await sleep(600);
    result.offline.hatchKnife = [];
    await knifeDown(off, "H4", { pitch: -1.45, stance: CROUCH }, result.offline.hatchKnife, 16); // a hatch takes about 10
    await off.waitForFunction(() => window.__lab.net.own.y < 0.2, null, { timeout: 10000, polling: 100 });
    await input(off, null);
    await sleep(600);
    const landed = await own(off);
    result.offline.hatchDrop = { broken: (await panel(off, "H4")).broken, at: [landed.x, landed.y, landed.z] };
    result.checks.droppedThroughH4IntoTheKitchen = result.offline.hatchDrop.broken && Math.abs(landed.y) < 0.1 && inRoom("1F_KITCHEN", landed.x, landed.z);
  }
  // ---- stairs and the ladder (M3)
  const PawnMode = { Walk: 0, Ladder: 2 };
  const ahead = (deg) => [-Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180)];
  const rad = (deg) => (deg * Math.PI) / 180;
  const calloutOf = (id) => lvl.rooms?.find((r) => r.id === id)?.callout;
  const prompt = (page) => page.evaluate(() => (document.querySelector(".prompt.hidden") ? "" : (document.querySelector(".prompt")?.textContent ?? "")));
  /** Steer along the points (yaw toward the next, forward held) until the last is reached; then let go. */
  const walkAlong = async (page, pts, timeoutMs = 20000) => {
    const until = Date.now() + timeoutMs;
    let k = 0;
    while (k < pts.length && Date.now() < until) {
      const me = await own(page);
      const [dx, dz] = [pts[k][0] - me.x, pts[k][1] - me.z];
      if (Math.hypot(dx, dz) < 0.25) k++;
      else await input(page, { forward: 1, yaw: Math.atan2(-dx, -dz) });
      await sleep(40);
    }
    await input(page, null);
    await sleep(500);
    return k >= pts.length;
  };
  // The Armory Stairs' basement flight: before its first riser, along it, past its top (tools/mapgen's walk test).
  const flight = lvl.stairs?.find((f) => f.id === "S3:B>1F#0");
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
    result.checks.upTheArmoryStairsFromBTo1F =
      upOk && Math.abs(up.y - (flight.start[1] + flight.rise * flight.steps)) < 0.05 && upHud.ok && upHud.line.startsWith(`${calloutOf("1F_ARMORY_STAIRS")} · 1F · `);
    await off.screenshot({ path: shot("oregon-stairs-up.png") });
    const downOk = await walkAlong(off, [...way].reverse().slice(1));
    const down = await own(off);
    const downHud = await hudSaysWhereYouAre(off);
    result.offline.stairsDown = { at: [down.x, down.y, down.z], hud: downHud.line };
    result.checks.backDownTheArmoryStairsToB =
      downOk && Math.abs(down.y - flight.start[1]) < 0.05 && downHud.ok && downHud.line.startsWith(`${calloutOf("B_LAUNDRY_STAIRS")} · B · `);
  }
  // The ladder: from the 2F Tower, facing it, F and W up onto the Cat Walk; then, turned round to face the drop
  // at the top, F and S back down.
  const ladder = lvl.ladders?.find((l) => l.id === "L1");
  if (ladder) {
    const [fx, fz] = ahead(ladder.yawDeg);
    const top = ladder.base[1] + ladder.height;
    await off.evaluate(([x, y, z, yaw]) => window.__lab.teleport(x, y, z, yaw), [ladder.base[0] - fx * 0.35, ladder.base[1], ladder.base[2] - fz * 0.35, ladder.yawDeg]);
    await input(off, { yaw: rad(ladder.yawDeg) });
    await sleep(600);
    const atFoot = await prompt(off);
    await input(off, { yaw: rad(ladder.yawDeg), buttons: Btn.Interact });
    await off.waitForFunction((mode) => window.__lab.net.own.mode === mode, PawnMode.Ladder, { timeout: 5000, polling: 50 });
    await input(off, { yaw: rad(ladder.yawDeg), forward: 1 });
    await off.waitForFunction((mode) => window.__lab.net.own.mode !== mode, PawnMode.Ladder, { timeout: 10000, polling: 20 });
    await input(off, { yaw: rad(ladder.yawDeg) }); // let go of W as the climb ends: the dismount carries you on
    await off.waitForFunction((mode) => window.__lab.net.own.mode === mode, PawnMode.Walk, { timeout: 5000, polling: 50 });
    await sleep(500);
    const onTop = await own(off);
    const topHud = await hudSaysWhereYouAre(off);
    result.offline.ladderUp = { promptAtFoot: atFoot, at: [onTop.x, onTop.y, onTop.z], hud: topHud.line };
    result.checks.upTheLadderOntoTheCatWalk =
      /to climb/.test(atFoot) && Math.abs(onTop.y - top) < 0.05 && topHud.ok && topHud.line.startsWith(`${calloutOf("3F_CATWALK")} · 3F · `);
    await off.screenshot({ path: shot("oregon-ladder-top.png") });
    // Turn round: the drop in front, the prompt shows; F puts you on the rungs, S takes you down.
    const back = rad(ladder.yawDeg + 180);
    await input(off, { yaw: back });
    await sleep(500);
    const atTop = await prompt(off);
    await input(off, { yaw: back, buttons: Btn.Interact });
    await off.waitForFunction((mode) => window.__lab.net.own.mode === mode, PawnMode.Ladder, { timeout: 5000, polling: 50 });
    await input(off, { yaw: back, forward: -1 });
    await off.waitForFunction((k) => window.__lab.net.own.mode === k.walk && window.__lab.net.own.y < k.y, { walk: PawnMode.Walk, y: ladder.base[1] + 0.1 }, { timeout: 10000, polling: 50 });
    await input(off, null);
    await sleep(500);
    const below = await own(off);
    const belowHud = await hudSaysWhereYouAre(off);
    result.offline.ladderDown = { promptAtTop: atTop, at: [below.x, below.y, below.z], hud: belowHud.line, hp: [onTop.hp, below.hp] };
    result.checks.downTheLadderFromTheTop =
      /to climb/.test(atTop) && Math.abs(below.y - ladder.base[1]) < 0.05 && below.hp === onTop.hp && belowHud.ok && belowHud.line.startsWith(`${calloutOf("2F_TOWER")} · 2F · `);
  }
  await off.close();

  // ---- shadows on: a lost and restored WebGL context draws the shadow map again
  const gfx = await open(`${BASE}/labs/oregon.html?autotest=1&op=sledge`);
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
  await gfx.screenshot({ path: shot("oregon-context-restored.png") });
  // Hiding the storeys above yours draws the shadows again (what's hidden casts none), if there are any.
  const gv = await view(gfx);
  const drawsShown = await gfx.evaluate(() => window.__lab.shadowDraws);
  await gfx.keyboard.press("KeyH");
  if (gv.storeys.indexOf(gv.storey) < gv.storeys.length - 1) await gfx.waitForFunction((n) => window.__lab.shadowDraws > n, drawsShown, { timeout: 5000, polling: 100 });
  result.checks.hideAboveRedrawsTheShadows = (await view(gfx)).hideAbove === true;
  await gfx.keyboard.press("KeyH");
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
