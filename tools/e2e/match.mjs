// End-to-end check of a match (Phase 6, match/DESIGN.md §13): a 1v1 and a 2v3 played in browsers from start to finish,
// with short Custom timers. 1v1: the host creates a Custom match on the Play page, which lists it; the other player
// joins by its code. In the lobby the joiner lands on the other team, the host sets the rules (one field through its
// input, and Blue to attack first through its select), both ready up and the host starts. Each team bans one of the
// other side's operators; on the planning screen the banned one is greyed out, each player picks an operator (the
// defender one, then 160 ms later another, over a slow link: the second stays), the defender votes for the Dining site
// and the attacker picks the B Street spawn and takes the defuser. In prep the defender is at that site and the
// attacker drives their first drone from the spawn (the defender's page has it), and the defender goes round the
// cameras; in action the attacker is at B Street carrying the defuser, pings (their page marks it, the defender's has
// nothing) and throws their second drone (6); the defenders win on time, the banner says so, the sides swap for round 2
// (where the new defender places a Bulletproof Camera and watches it), and after it the summary has both rounds; the
// host takes everyone back to the lobby. 2v3: five players (three on Blue, two on Orange; some never pick and get an
// operator anyway, one per team each); in action an attacker goes from their drone to a teammate's (the feed list), and
// a defender shoots a teammate down the sights (friendly fire on, reverse friendly fire off), who then looks through a
// living teammate's eyes, and the scoreboard counts the death; the match ends with the summary. Also: a loadout set on
// the Play page is kept, and a sight fitted on the planning screen is carried into action.
// Requires `npm run build` first. Screenshots go to builds/e2e.
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
const lvl = JSON.parse(readFileSync(fileURLToPath(new URL("../../data/maps/oregon/level.json", import.meta.url)), "utf8"));
/** Phases (match/match.ts). */
const P = { Lobby: 0, Ban: 1, Planning: 2, Prep: 3, Action: 4, PostPlant: 5, RoundEnd: 6, MatchEnd: 7 };
const SITE = "SITE_DINING";
const SPAWN = "B_STREET";

const server = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "inherit"] });
const result = { checks: {}, oneVsOne: {}, twoVsThree: {} };
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
  /** A page in its own browser (its own storage, so its own remembered name), small to keep five of them quick. */
  const open = async (url, size = { width: 560, height: 315 }) => {
    const ctx = await browser.newContext({ viewport: size });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(url);
    return page;
  };
  const inMatch = (page) => page.waitForFunction(() => window.__match?.view && window.__lab?.net?.room, null, { timeout: 90000 });
  const view = (page) => page.evaluate(() => window.__match.view);
  const phase = (page, ph, timeout = 60000) => page.waitForFunction((ph) => window.__match.view.phase === ph, ph, { timeout, polling: 100 });
  const me = (v) => v.players.find((p) => p.id === v.you);
  const own = (page) => page.evaluate(() => window.__lab.net.own);
  const near = (a, b, m) => a !== null && Math.hypot(a.x - b[0], a.z - b[2]) <= m && Math.abs(a.y - b[1]) < 0.5;
  /** The Play page: your name, then the format and Create, or a code and Join; resolves on the match page. */
  const viaPlay = async (name, how) => {
    const page = await open(`${BASE}/play.html`);
    await page.fill(".name", name);
    if (how.format) await page.selectOption(".format", how.format);
    else await page.fill(".code", how.room);
    await Promise.all([page.waitForURL(/\/labs\/match\.html/, { timeout: 30000 }), page.click(how.format ? ".create" : ".join")]);
    await inMatch(page);
    return page;
  };
  /**
   * Host: short Custom rules (two rounds, a swap after each, no overtime, the shortest prep and action the rules allow:
   * match/settings.ts) with `extra`, and the damage rules in `damage`, sent as one change.
   */
  const setRules = (page, extra, damage = {}) =>
    page.evaluate(
      ([extra, damage]) => {
        const r = window.__match.rules;
        const match = { ...structuredClone(r.match), rounds: 2, swapEvery: 1, overtime: null, seconds: { ...r.match.seconds, pick: 12, prep: 12, action: 30, roundEnd: 3 }, ...extra };
        window.__match.lobby({ kind: "change", change: { kind: "rules", rules: { match, ...damage } } });
      },
      [extra, damage],
    );

  // ---------------------------------------------------------------- 1v1

  const a = await viaPlay("Ana", { format: "custom" });
  const room = await a.evaluate(() => window.__lab.net.room);
  const v0 = await view(a);
  result.checks.playCreatesAMatch = /[?&]room=/.test(a.url()) && v0.phase === P.Lobby && v0.host === v0.you && v0.format === "custom";
  // A third browser on the Play page sees the room in the list.
  const lister = await open(`${BASE}/play.html`);
  result.checks.roomListShowsTheMatch = await lister
    .waitForFunction((code) => [...document.querySelectorAll(".rooms td.code")].some((td) => td.textContent === code), room, { timeout: 15000 })
    .then(() => true, () => false);
  await lister.screenshot({ path: shot("match-play-list.png") });
  // Loadouts on the Play page: another sight on Thermite's primary is kept (this browser's storage) across a reload.
  const sightSel = '.loadout [data-slot="primary"][data-part="sight"]';
  await lister.selectOption(".lo-op", "thermite");
  const sights = await lister.$$eval(`${sightSel} option`, (os) => os.map((o) => o.value));
  const wantSight = sights.find((v) => v !== "iron") ?? null;
  if (wantSight) await lister.selectOption(sightSel, wantSight);
  await lister.reload();
  await lister.waitForSelector(sightSel);
  result.oneVsOne.playLoadout = { sights, wantSight, kept: [await lister.$eval(".lo-op", (sel) => sel.value), await lister.$eval(sightSel, (sel) => sel.value)] };
  result.checks.loadoutKeptOnThePlayPage = wantSight !== null && result.oneVsOne.playLoadout.kept[0] === "thermite" && result.oneVsOne.playLoadout.kept[1] === wantSight;
  await lister.screenshot({ path: shot("match-play-loadouts.png"), fullPage: true });
  await lister.context().close();
  const b = await viaPlay("Bo", { room });
  await a.waitForFunction(() => window.__match.view.players.length === 2, null, { timeout: 10000 });
  let v = await view(a);
  result.oneVsOne.lobby = v.players.map((p) => [p.name, p.team]);
  result.checks.joinerOnTheOtherTeam = v.players.find((p) => p.name === "Ana")?.team === 0 && v.players.find((p) => p.name === "Bo")?.team === 1;
  // The host's rules: one ban per side (a ban phase in round 1), the rest short; then the rounds through their input.
  await setRules(a, { bans: { maxPerSide: 1, voteSeconds: 5 }, rounds: 4 });
  await a.waitForFunction(() => window.__match.rules?.match.rounds === 4, null, { timeout: 10000 });
  await a.fill('[data-act=rule][data-key="rounds"]', "2");
  await a.dispatchEvent('[data-act=rule][data-key="rounds"]', "change");
  result.checks.hostSetsTheRules = await a
    .waitForFunction(() => window.__match.rules?.match.rounds === 2 && /2 rounds, first to 2/.test(document.querySelector(".match-screen")?.textContent ?? ""), null, { timeout: 10000 })
    .then(() => true, () => false);
  // A choice through its select (Custom's settings, M5): Blue attacks first.
  await a.selectOption('[data-act=choice][data-key="firstAttack"]', "blue");
  result.checks.hostPicksWhoAttacksFirst = await a.waitForFunction(() => window.__match.rules?.match.firstAttack === "blue", null, { timeout: 10000 }).then(() => true, () => false);
  for (const p of [a, b]) await p.click(".match-screen [data-act=ready]");
  await a.waitForFunction(() => window.__match.view.players.every((p) => p.ready), null, { timeout: 10000 });
  await a.screenshot({ path: shot("match-lobby.png") });
  await a.click(".match-screen [data-act=start]");
  result.checks.banPhaseFirst = await phase(a, P.Ban, 10000).then(() => true, () => false);
  for (const p of [a, b]) await p.click(".match-screen [data-act=ban]:not([disabled])");
  await a.screenshot({ path: shot("match-ban.png") });
  await phase(a, P.Planning, 20000);
  v = await view(a);
  result.oneVsOne.bans = v.bans;
  result.checks.eachTeamBansOne = v.bans[0].length === 1 && v.bans[1].length === 1;
  result.checks.blueAttacksFirst = v.round === 1 && v.attackers === 0;
  // Who attacks round 1 was drawn: the pages by side.
  const sideOf = async (page) => me(await view(page)).side;
  const [att1, def1] = (await sideOf(a)) === 0 ? [a, b] : [b, a];
  // The screen is drawn on the page's next frame: wait for the operator's button.
  result.checks.bannedOperatorGreyedOut = await def1
    .waitForFunction((ban) => document.querySelector(`.match-screen [data-act=op][data-op="${ban}"]`)?.hasAttribute("disabled") ?? false, v.bans[1][0], { timeout: 10000 })
    .then(() => true, () => false);
  await att1.click(".match-screen [data-act=op]:not([disabled])");
  // Changing your mind over a slow link (the page's simulated +200 ms round trip): the defender picks one operator and
  // 160 ms later another. The server's answer to the first click goes out before the second reaches it (match updates
  // go out at most 125 ms apart) and comes back after the second click: it mustn't take that one back.
  const defOps = await def1.$$eval(".match-screen [data-act=op]:not([disabled])", (bs) => bs.map((b) => b.dataset.op));
  const setLag = (page, ms) =>
    page.evaluate((ms) => {
      const gear = document.querySelector(".gear");
      gear.click(); // the pause menu, drawn as it opens, has the simulated network's settings
      const sel = document.querySelector('.pause select[data-net="rttMs"]');
      sel.value = String(ms);
      sel.dispatchEvent(new Event("change"));
      gear.click();
    }, ms);
  await setLag(def1, 200);
  await def1.evaluate(([first, second]) => {
    const button = (op) => document.querySelector(`.match-screen [data-act=op][data-op="${op}"]`);
    button(first).click();
    setTimeout(() => button(second).click(), 160);
  }, [defOps[1], defOps[0]]);
  await sleep(1700);
  const held = [];
  for (let i = 0; i < 5; i++, await sleep(150)) held.push(me(await view(def1)).operator);
  await setLag(def1, 0);
  result.oneVsOne.operatorSwitch = { clicked: [defOps[1], defOps[0]], held };
  result.checks.operatorSwitchKept = held.every((op) => op === defOps[0]);
  // The attacker fits another sight on the planning screen: the body carries it into action.
  const planSight = '.match-screen .loadout [data-slot="primary"][data-part="sight"]';
  const fitted = await att1
    .waitForSelector(planSight, { timeout: 10000 })
    .then(async () => {
      const current = await att1.$eval(planSight, (sel) => sel.value);
      const other = (await att1.$$eval(`${planSight} option`, (os) => os.map((o) => o.value))).find((v) => v !== current) ?? null;
      if (other) await att1.selectOption(planSight, other);
      return other;
    })
    .catch(() => null);
  await def1.click(`.match-screen [data-act=site][data-site="${SITE}"]`);
  await att1.click(`.match-screen [data-act=spawn][data-group="${SPAWN}"]`);
  await att1.click('.match-screen [data-act=defuser][data-take="1"]');
  await att1.screenshot({ path: shot("match-planning-attacker.png") });
  await def1.screenshot({ path: shot("match-planning-defender.png") });
  await att1.waitForFunction(() => window.__match.view.carrier === window.__match.view.you, null, { timeout: 10000 }).catch(() => {});
  v = await view(att1);
  const attMe = me(v);
  const defV = await view(def1);
  result.oneVsOne.planning = { attacker: [attMe.operator, attMe.spawn, v.carrier === attMe.id], defender: [me(defV).operator, me(defV).siteVote] };
  result.checks.planningChoicesTaken = attMe.operator !== null && attMe.spawn === SPAWN && v.carrier === attMe.id && me(defV).operator !== null && me(defV).siteVote === SITE;

  // Prep: the defender at the voted site's spawn; the attacker drives their first drone, out at their spawn (Phase 7),
  // with the planning screen up while the mouse is free.
  await phase(a, P.Prep, 30000);
  await def1.waitForFunction(() => window.__lab.net.own !== null && !window.__match.spectating, null, { timeout: 20000 });
  // Each page sees the phase change on its own next frame: wait on the attacker's own page for its drone.
  await att1.waitForFunction(() => window.__match.view.phase === 3 && window.__lab.net?.viewedKind === 1 && window.__lab.net.own !== null, null, { timeout: 10000 }).catch(() => {});
  const siteSpawns = lvl.spawns.filter((s) => s.group === SITE);
  const defAt = await own(def1);
  const droneAt = await own(att1);
  result.oneVsOne.prep = { defenderAt: defAt && [defAt.x, defAt.y, defAt.z], attackerDrone: droneAt && [droneAt.x, droneAt.y, droneAt.z], screen: await att1.evaluate(() => window.__match.screen) };
  result.checks.defenderAtTheSite = siteSpawns.some((s) => near(defAt, s.pos, 1));
  result.checks.redWallsInPrep = (await view(def1)).redWalls === true; // before the 12 s of prep are over
  const spawnSpot = lvl.spawns.find((s) => s.group === SPAWN);
  result.checks.attackerDronesFromTheSpawn =
    droneAt !== null && (await att1.evaluate(() => window.__lab.net.viewedKind)) === 1 && Math.hypot(droneAt.x - spawnSpot.pos[0], droneAt.z - spawnSpot.pos[2]) < 0.5 && result.oneVsOne.prep.screen === "planning";
  // On a touch screen there's no mouse to lock (Ulo's test): the screen's own button puts it away, Plan brings it back.
  await att1.click(".match-screen [data-act=closePlan]");
  const putAway = await att1.waitForFunction(() => window.__match.screen === "", null, { timeout: 5000 }).then(() => true, () => false);
  await att1.click(".plan-btn");
  const brought = await att1.waitForFunction(() => window.__match.screen === "planning", null, { timeout: 5000 }).then(() => true, () => false);
  result.oneVsOne.prep.planningScreen = { putAway, brought };
  result.checks.planningScreenPutAwayInPrep = putAway && brought;
  // Driving it online: W moves it more than a metre (the page's game time, not the wall clock's: a slow runner's page
  // plays fewer ticks a second), and the defender's page has it.
  const droneId = await att1.evaluate(() => window.__lab.net.pawnId);
  await att1.evaluate((yaw) => (window.__lab.input = { yaw, forward: 1 }), (spawnSpot.yawDeg * Math.PI) / 180);
  result.checks.attackerDrivesTheDrone =
    droneAt !== null &&
    (await att1
      .waitForFunction(([x, z]) => window.__lab.net.viewedKind === 1 && Math.hypot(window.__lab.net.own.x - x, window.__lab.net.own.z - z) > 1, [droneAt.x, droneAt.z], { timeout: 10000, polling: 50 })
      .then(() => true, () => false));
  await att1.evaluate(() => (window.__lab.input = null));
  const droveTo = await own(att1);
  result.oneVsOne.prep.droneDroveTo = droveTo && [droveTo.x, droveTo.y, droveTo.z];
  result.checks.defenderSeesTheDrone = await def1
    .waitForFunction((id) => window.__lab.net.remotes.some((r) => r.id === id && r.state !== null), droneId, { timeout: 5000 })
    .then(() => true, () => false);
  // The defender watches the cameras (Phase 7): 5 opens the first, Q goes round to the last, 5 closes them. Each key is
  // held until the page shows what it did (its game ticks run in its frames, slow on a busy runner), then let go for
  // two of its ticks so the next press is a new one.
  const OBSERVE = 1 << 14;
  const holdUntil = async (page, input, done, arg) => {
    await page.evaluate((i) => (window.__lab.input = i), input);
    const ok = await page.waitForFunction(done, arg, { timeout: 10000, polling: 50 }).then(() => true, () => false);
    const t0 = await page.evaluate(() => {
      window.__lab.input = null;
      return window.__lab.tick;
    });
    await page.waitForFunction((t) => window.__lab.tick >= t + 2, t0, { timeout: 10000, polling: 50 }).catch(() => {});
    return ok;
  };
  const opened = await holdUntil(def1, { buttons: OBSERVE }, () => window.__lab.net.cam === 1);
  const wentRound = await holdUntil(def1, { lean: -1 }, (n) => window.__lab.net.cam === n, lvl.cameras.length);
  await def1.screenshot({ path: shot("match-prep-defender-camera.png") });
  const closed = await holdUntil(def1, { buttons: OBSERVE }, () => window.__lab.net.cam === 0);
  result.oneVsOne.prep.cameras = { opened, wentRound, closed };
  result.checks.defenderWatchesTheCameras = opened && wentRound && closed;
  await att1.screenshot({ path: shot("match-prep-attacker.png") });
  await def1.screenshot({ path: shot("match-prep-defender.png") });

  // Action: the attacker at B Street, carrying the defuser, told so on the HUD.
  await phase(a, P.Action, 30000);
  // Their body (in prep they were their drone, which has no loadout: a wait on any pawn of theirs reads it on a page
  // the body hasn't reached yet).
  await att1.waitForFunction(() => window.__lab.net.own !== null && window.__lab.net.loadout !== null && !window.__match.spectating, null, { timeout: 20000 });
  const attAt = await own(att1);
  result.oneVsOne.action = { attackerAt: attAt && [attAt.x, attAt.y, attAt.z] };
  result.checks.attackerAtTheirSpawn = lvl.spawns.filter((s) => s.group === SPAWN).some((s) => near(attAt, s.pos, 1));
  const carried = await att1.evaluate(() => window.__lab.net.loadout);
  result.oneVsOne.action.loadout = { fitted, carried };
  result.checks.attachmentCarriedIntoAction = fitted !== null && carried?.primary.sight === fitted;
  result.checks.carrierToldOnTheHud = await att1
    .waitForFunction(() => /You carry the defuser/.test(document.querySelector(".match-info")?.textContent ?? ""), null, { timeout: 10000 })
    .then(() => true, () => false);
  result.checks.redWallsDownInAction = await def1.waitForFunction(() => window.__match.view.redWalls === false, null, { timeout: 10000 }).then(() => true, () => false);
  await att1.screenshot({ path: shot("match-action-attacker.png") });
  await b.keyboard.down("Tab");
  result.checks.scoreboardOnTab = await b.waitForFunction(() => !document.querySelector(".scoreboard").classList.contains("hidden"), null, { timeout: 5000 }).then(() => true, () => false);
  await b.screenshot({ path: shot("match-scoreboard.png") });
  await b.keyboard.up("Tab");
  // A ping (Phase 7): the attacker pings the ground ahead; their page marks it, and the defender's (the other team) has
  // no ping by the time it has played half a second more.
  const pinged = await holdUntil(att1, { buttons: 1 << 11, pitch: -0.3 }, () => window.__lab.net.intel.pings > 0);
  await att1.screenshot({ path: shot("match-ping.png") });
  const defTick = await def1.evaluate(() => window.__lab.tick);
  await def1.waitForFunction((t) => window.__lab.tick >= t + 32, defTick, { timeout: 10000, polling: 50 }).catch(() => {});
  const defPings = await def1.evaluate(() => window.__lab.net.events.filter((e) => e.kind === "ping").length);
  result.oneVsOne.action.ping = { pinged, defenderPings: defPings };
  result.checks.pingForTheTeamOnly = pinged && defPings === 0;
  // The attacker throws their second drone (6, its own key since Ulo's test) and drives it; 5 takes them back.
  const thrown = await holdUntil(att1, { buttons: 1 << 15 }, () => window.__lab.net.drone !== 0 && window.__lab.net.viewedKind === 1);
  const backFromIt = thrown && (await holdUntil(att1, { buttons: OBSERVE }, () => window.__lab.net.drone === 0));
  result.oneVsOne.action.throw = { thrown, backFromIt };
  result.checks.attackerThrowsADrone = thrown && backFromIt;

  // The defenders win on time; the banner says so.
  await phase(a, P.RoundEnd, 60000);
  const banner = await a.waitForFunction(() => document.querySelector(".match-banner:not(.hidden)")?.textContent ?? false, null, { timeout: 10000 }).then((h) => h.jsonValue(), () => "");
  v = await view(a);
  const r1 = v.history[0];
  result.oneVsOne.round1 = { record: r1, banner };
  result.checks.defendersWinOnTime = r1 !== undefined && r1.reason === 1 && r1.winner !== r1.attackers && /WINS ROUND 1/.test(banner) && /Time ran out/.test(banner);
  await a.screenshot({ path: shot("match-round-end.png") });

  // Round 2: the sides swap. The new defender takes a Bulletproof Camera (Mute, or Sentry if Mute is banned: theirs is
  // in the default kit), places it on the floor in front of them in action, and watches it after the level's cameras
  // (Phase 7 M5).
  await a.waitForFunction(() => window.__match.view.round === 2 && window.__match.view.phase === 2, null, { timeout: 30000 });
  v = await view(a);
  result.checks.sidesSwap = v.attackers !== r1.attackers;
  const def2 = att1;
  const bpOp = await def2
    .waitForFunction(() => ["mute", "sentry"].find((op) => document.querySelector(`.match-screen [data-act=op][data-op="${op}"]:not([disabled])`)) ?? false, null, { timeout: 10000 })
    .then((h) => h.jsonValue(), () => null);
  if (bpOp) await def2.click(`.match-screen [data-act=op][data-op="${bpOp}"]`);
  await phase(a, P.Action, 60000);
  await def2.waitForFunction(() => window.__lab.net.own !== null && !window.__match.spectating && window.__lab.net.gadgets > 0, null, { timeout: 20000 }).catch(() => {});
  // Phase 8's hands: its slot's key takes it out (Mute: the gadget key; Sentry: the ability key, its kit's second), then Fire
  // held places it.
  const slotKey = bpOp === "sentry" ? 1 << 5 : 1 << 12;
  const tookOut = await holdUntil(def2, { buttons: slotKey, pitch: -1.05 }, () => window.__lab.net.hand !== 0);
  await sleep(800); // its equip time
  const placedBp = tookOut && (await holdUntil(def2, { buttons: 1 << 6, pitch: -1.05 }, () => window.__lab.net.table.filter((g) => g.kind === "bulletproof_camera").length === 1));
  const watchedBp =
    placedBp &&
    (await holdUntil(def2, { buttons: OBSERVE }, () => window.__lab.net.cam === 1)) &&
    (await holdUntil(def2, { lean: -1 }, (n) => window.__lab.net.cam === n, lvl.cameras.length + 1));
  await def2.screenshot({ path: shot("match-bulletproof-camera.png") });
  result.oneVsOne.round2 = { operator: bpOp, placed: placedBp, watched: watchedBp };
  result.checks.bulletproofCameraPlacedAndWatched = bpOp !== null && placedBp && watchedBp;
  await phase(a, P.MatchEnd, 120000);
  await a.waitForFunction(() => window.__match.screen === "summary", null, { timeout: 10000 });
  v = await view(a);
  const summary = await a.evaluate(() => document.querySelector(".match-screen").textContent);
  result.oneVsOne.end = { score: v.score, winner: v.winner, history: v.history.map((h) => [h.round, h.attackers, h.winner, h.reason]) };
  result.checks.summaryAfterTwoRounds = v.history.length === 2 && v.winner === null && /Draw 1–1/.test(summary) && (summary.match(/Time ran out/g) ?? []).length === 2;
  await a.screenshot({ path: shot("match-summary.png") });
  await a.click(".match-screen [data-act=backToLobby]");
  result.checks.backToTheLobby = await b.waitForFunction(() => window.__match.view.phase === 0 && window.__match.screen === "lobby", null, { timeout: 10000 }).then(() => true, () => false);
  v = await view(b);
  result.checks.sameTeamsInTheLobby = v.players.find((p) => p.name === "Ana")?.team === 0 && v.players.find((p) => p.name === "Bo")?.team === 1;
  for (const p of [a, b]) await p.context().close();

  // ---------------------------------------------------------------- 2v3

  const names = ["Cy", "Di", "Ed", "Fa", "Gu"];
  const host = await viaPlay(names[0], { format: "custom" });
  const room2 = await host.evaluate(() => window.__lab.net.room);
  const pages = [host];
  for (const n of names.slice(1)) {
    const p = await open(`${BASE}/labs/match.html?room=${room2}&name=${n}`);
    await inMatch(p);
    pages.push(p);
  }
  await host.waitForFunction(() => window.__match.view.players.length === 5, null, { timeout: 20000 });
  v = await view(host);
  result.twoVsThree.lobby = v.players.map((p) => [p.name, p.team]);
  result.checks.unevenTeams = v.players.filter((p) => p.team === 0).length === 3 && v.players.filter((p) => p.team === 1).length === 2;
  // No bans; friendly fire stays on in action, reverse friendly fire off (a teammate's shot kills).
  await setRules(host, { bans: null }, { reverseFriendlyFire: { enabled: false, thresholdHp: 100 } });
  await host.waitForFunction(() => window.__match.rules?.match.bans === null && window.__match.rules.reverseFriendlyFire.enabled === false, null, { timeout: 10000 });
  for (const p of pages) await p.evaluate(() => window.__match.lobby({ kind: "ready", ready: true }));
  await host.waitForFunction(() => window.__match.view.players.every((p) => p.ready), null, { timeout: 10000 });
  await host.click(".match-screen [data-act=start]");
  await phase(host, P.Planning, 15000);
  // Some pick, the rest get one when the timer runs out; defenders vote for the Dining site.
  const sides = await Promise.all(pages.map(async (p) => me(await view(p)).side));
  const defenders = pages.filter((_, i) => sides[i] === 1);
  await pages[0].click(".match-screen [data-act=op]:not([disabled])");
  await pages[1].click(".match-screen [data-act=op]:not([disabled])");
  for (const d of defenders) await d.click(`.match-screen [data-act=site][data-site="${SITE}"]`);
  await phase(host, P.Action, 60000);
  // Everyone's operator is shown to both teams once action starts (in prep only teammates').
  v = await view(host);
  const byTeam = [0, 1].map((t) => v.players.filter((p) => p.team === t).map((p) => p.operator));
  result.twoVsThree.operators = byTeam;
  result.checks.everyoneHasAnOperator = byTeam.flat().every((o) => o !== null) && byTeam.every((ops) => new Set(ops).size === ops.length);
  // The feed list (Phase 7 M6): an attacker goes to their first drone (5; it's been out since prep), then a new lean
  // goes on to a teammate's, which they watch.
  const watcher = pages.find((_, i) => sides[i] === 0);
  await watcher.waitForFunction(() => window.__lab.net.own !== null && window.__lab.net.loadout !== null && !window.__match.spectating, null, { timeout: 20000 }).catch(() => {});
  const mateDrones = await watcher.evaluate(() => {
    const n = window.__lab.net;
    const mine = n.roster.find((e) => e.controllerId === n.you);
    return n.roster.filter((e) => e.team === mine.team && e !== mine).flatMap((e) => e.drones);
  });
  const onOwn = await holdUntil(watcher, { buttons: OBSERVE }, () => window.__lab.net.viewedKind === 1);
  const onMates = onOwn && (await holdUntil(watcher, { lean: 1 }, (ids) => ids.includes(window.__lab.net.drone), mateDrones));
  await watcher.screenshot({ path: shot("match-teammate-drone.png") });
  await holdUntil(watcher, { buttons: OBSERVE }, () => window.__lab.net.drone === 0);
  result.twoVsThree.feedList = { mateDrones, onOwn, onMates };
  result.checks.attackerWatchesATeammatesDrone = onMates;
  // A defender shoots a teammate in the head: the two first defender spawns at the Dining site share the room. Down the
  // sights, once they are fully up: a bullet then goes where the view points (from the hip, more than half the shots at
  // 3.6 m miss, and on a slow runner the tries ran out before one landed).
  const [shooter, victim] = defenders;
  await victim.waitForFunction(() => window.__lab.net.own !== null, null, { timeout: 20000 });
  await shooter.waitForFunction(() => window.__lab.net.own !== null, null, { timeout: 20000 });
  const victimPawn = await victim.evaluate(() => window.__lab.net.pawnId);
  let killed = false;
  for (let tries = 0; tries < 8 && !killed; tries++) {
    const aim = await shooter.evaluate((id) => window.__lab.aimAt(id, "head"), victimPawn);
    if (aim) {
      await shooter.evaluate((a) => (window.__lab.input = { yaw: a.yaw, pitch: a.pitch, buttons: 8 /* Btn.Ads */ }), aim);
      await shooter.waitForFunction(() => window.__lab.net.own?.adsQ === 65535, null, { timeout: 10000 }).catch(() => {});
      await shooter.evaluate(() => window.__lab.fire());
    }
    killed = await victim.waitForFunction(() => window.__lab.net.dead, null, { timeout: 3000 }).then(() => true, () => false);
  }
  await shooter.evaluate(() => (window.__lab.input = null));
  result.twoVsThree.teamKill = { victimPawn, killed };
  result.checks.teammateShotDead = killed;
  // Dead, the victim looks through a living teammate's eyes; the scoreboard counts the death (no kill for a teamkill).
  const mates = await Promise.all(defenders.filter((d) => d !== victim).map((d) => d.evaluate(() => window.__lab.net.pawnId)));
  result.twoVsThree.teamKill.mates = mates;
  result.checks.deadLookThroughATeammate = await victim
    .waitForFunction((ids) => window.__match.camera?.kind === "pawn" && ids.includes(window.__match.camera.pawnId), mates, { timeout: 10000 })
    .then(() => true, () => false);
  await victim.screenshot({ path: shot("match-spectating.png") });
  v = await view(host);
  const victimName = me(await view(victim)).name;
  const shooterName = me(await view(shooter)).name;
  result.twoVsThree.stats = v.players.map((p) => [p.name, p.kills, p.deaths, p.alive]);
  result.checks.teamkillCounted = v.players.find((p) => p.name === victimName)?.deaths === 1 && v.players.find((p) => p.name === shooterName)?.kills === 0;
  await phase(host, P.MatchEnd, 150000);
  v = await view(host);
  result.twoVsThree.end = { score: v.score, winner: v.winner, history: v.history.map((h) => [h.round, h.attackers, h.winner, h.reason]) };
  result.checks.twoVsThreeToTheEnd = v.history.length === 2 && v.history[0].attackers !== v.history[1].attackers;
  await host.waitForFunction(() => window.__match.screen === "summary", null, { timeout: 10000 });
  await host.screenshot({ path: shot("match-2v3-summary.png") });

  result.errors = errors;
  result.checks.noPageErrors = errors.length === 0;
  ok = Object.values(result.checks).every(Boolean);
} catch (e) {
  result.errors = [...errors, String(e?.stack ?? e)];
} finally {
  console.log(JSON.stringify(result, null, 2));
  console.log(`[e2e] match: ${ok ? "PASS" : "FAIL"}`);
  await browser?.close();
  server.kill();
  process.exit(ok ? 0 : 1);
}
