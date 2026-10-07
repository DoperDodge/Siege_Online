// Movement Lab (PLAN §7, Phase 1): a test yard for every movement mechanic. Offline, the shared
// simulation steps here at 64 Hz. Online (Phase 2, `?online` or `?room=CODE`), the server runs it and
// this page predicts your own movement and interpolates everyone else's (PLAN §5).
import * as THREE from "three";
import {
  applyDamage,
  Btn,
  DEG,
  DT,
  encodeLabTool,
  BARRELS,
  defaultLoadoutPick,
  encodePickLoadout,
  eyePose,
  GRIPS,
  isDowned,
  isGun,
  isPickable,
  offerId,
  resolveLoadout,
  QUERY_BULLET,
  SIGHTS,
  UNDERBARRELS,
  lerp,
  loadedOf,
  loadGameData,
  PawnMode,
  proneWeight,
  reserveOf,
  Sim,
  spawnAmmo,
  spreadCone,
  Stance,
  TICK_HZ,
  wrapAngle,
  type InputCmd,
  type Pawn,
  type PawnState,
  type PlayerController,
  type GunData,
  type LoadoutPick,
  type Offer,
  type ResolvedWeapon,
  type GameEvent,
  type ShotResult,
  type SimEvent,
  type WeaponPick,
  WeaponAct,
} from "@redmond/shared";
import { Controls, type Action, type UiAction } from "../input/controls.js";
import { horizontalFov, keyLabel, loadSettings, saveSettings, type HoldMode, type Settings } from "../input/settings.js";
import { isTouchDevice, mountTouchControls } from "../input/touch.js";
import { OnlineConnection } from "../net/online.js";
import { createLabScene, createRenderer, PawnView, updateLabels, warmShaders } from "../render/labScene.js";
import { FxBus } from "../render/fxBus.js";
import { Viewmodel } from "../render/viewmodel.js";
import { AmmoHud } from "../ui/ammo.js";
import { adsFov, Crosshair, spreadGapPx } from "../ui/crosshair.js";
import { damageArcDeg, DamageIndicator } from "../ui/damage.js";
import { DownedHud } from "../ui/downed.js";
import { HitMarkers } from "../ui/hitMarkers.js";
import { deathLine, feedLine, KillFeed } from "../ui/killFeed.js";

// ------------------------------------------------------------------ setup

const params = new URLSearchParams(location.search);
const autotest = params.has("autotest");
const online = params.has("online") || params.has("room");
const data = loadGameData();
let operatorId = data.operators.has(params.get("op") ?? "") ? params.get("op")! : "sledge";
let op = data.operators.get(operatorId)!;

const app = document.getElementById("app")!;
app.innerHTML = `
  <div id="view"></div>
  <div class="crosshair"></div>
  <div class="spread hidden"><i></i><i></i><i></i><i></i></div>
  <div class="hitmarker"><i></i><i></i><i></i><i></i></div>
  <div class="reticle hidden"></div>
  <div class="scope hidden"></div>
  <div class="hit-text"></div>
  <div class="hurt"></div>
  <div class="hurt-dir"></div>
  <div class="hud hud-tl">
    <div class="op-name"></div>
    <div class="hp"><div class="hp-fill"></div><span class="hp-text"></span></div>
  </div>
  <div class="hud hud-tr"><span class="fps"></span><div class="net"></div><div class="killfeed"></div></div>
  <div class="hud hud-br"><div class="weapon-name"></div><div class="ammo"><span class="ammo-loaded"></span><span class="ammo-reserve"></span></div><div class="weapon-state"></div></div>
  <div class="hud hud-bottom">
    <div class="stances"><span data-s="0">STAND</span><span data-s="1">CROUCH</span><span data-s="2">PRONE</span></div>
    <div class="stance-bar"><div></div></div>
    <div class="readout"></div>
  </div>
  <div class="lean-ind lean-l">◀</div><div class="lean-ind lean-r">▶</div>
  <div class="flash"></div>
  <div class="prompt hidden"></div>
  <div class="shellcam hidden"><div class="shellcam-title"></div><div class="swap-bar"><div></div></div></div>
  <div class="down-ui hidden"><div class="down-title"></div><div class="down-bar"><div></div></div></div>
  <div class="revive-ui hidden"><div class="revive-title"></div><div class="revive-bar"><div></div></div></div>
  <div class="center-msg hidden"></div>
  <button class="gear" title="Settings">⚙</button>
  <div class="panel pause hidden"></div>
  <div class="panel help hidden"></div>
  <div class="panel lobby hidden"></div>`;
const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
const crosshair = new Crosshair(app);
const ammoHud = new AmmoHud(app);
const downedHud = new DownedHud(app);
const hitMarkers = new HitMarkers(app);
const damageHud = new DamageIndicator(app);
const killFeed = new KillFeed(app);

// Online state, declared before the lobby runs (its callbacks write some of it).
/** Simulated network conditions (pause menu, or `?lag=100&jitter=20&loss=1`; PLAN §16.9). */
const conditions = {
  rttMs: Math.max(0, Math.min(400, Number(params.get("lag")) || 0)),
  jitterMs: Math.max(0, Math.min(100, Number(params.get("jitter")) || 0)),
  lossPct: Math.max(0, Math.min(10, Number(params.get("loss")) || 0)),
};
/** Why the connection ended, once it has. */
let disconnected: string | null = null;
let rosterChanged = false;
let lastShot: (ShotResult & { targetName: string | null }) | null = null;
let showShot: (shot: ShotResult) => void = () => {};
/** Online tests can script the input (window.__lab.input). */
let scripted: Partial<InputCmd> | null = null;
/** Render tick of the frame on screen (remote players are drawn at it), and of the one last clicked on. */
let shownRenderTick = 0;
let clickViewTick: number | null = null;
/** How your current body died, for the respawn message (null while alive, or for a fall). */
let deathText: string | null = null;
/** Recoil the viewed body's view took this tick (added to the mouse view so the next input includes it). */
const tickKick = { yaw: 0, pitch: 0 };
let flashUntil = 0;

// Online: the lobby connects (create or join a room) and the session builds the simulation from the
// server's Welcome; our controller arrives with the roster. Offline: a local simulation and player.
const net = online ? await lobby() : null;
const sim = net ? net.session.sim! : await Sim.create("movement_lab", data);
let ctrl: PlayerController = net ? await firstBody(net) : sim.addPlayer("you", operatorId, 0, undefined, pickFromUrl(operatorId));
const possessed = () => sim.pawns.get(ctrl.possessedPawnId)!;
if (net) {
  // The server starts everyone as the default operator; ask for the loadout in the link, if different.
  const wanted = pickFromUrl(operatorId);
  const mine = net.session.roster.find((e) => e.controllerId === ctrl.id);
  if (!mine || JSON.stringify(mine.loadout) !== JSON.stringify(wanted)) net.send(encodePickLoadout(wanted));
  operatorId = ctrl.operatorId;
  op = data.operators.get(operatorId)!;
}

const view = $("#view");
const renderer = createRenderer(view);
const scene = createLabScene(sim.level);
let settings: Settings = loadSettings();
const camera = new THREE.PerspectiveCamera(settings.fovVertical, view.clientWidth / view.clientHeight, 0.05, 300);
camera.rotation.order = "YXZ";
/** The gun in your hands (drawn over the world) and the world's effects: flashes, tracers, bullet marks. */
const viewmodel = new Viewmodel(data);
viewmodel.setAspect(camera.aspect);
const fx = new FxBus(scene, sim);
const laserDots = new Map<number, THREE.Sprite>();
const laserMat = new THREE.SpriteMaterial({ color: 0xff2a2a, depthTest: true, transparent: true, opacity: 0.95 });
// Every shader the effects use is readied now, not in the middle of the first shot (warmShaders).
{
  const probe = new THREE.Sprite(laserMat);
  scene.add(probe);
  warmShaders(renderer, scene, camera);
  scene.remove(probe);
  viewmodel.warm(renderer);
}
/** Each body's view as drawn this frame (lasers point along it). */
const drawnView = new Map<number, [number, number]>();

const pawnViews = new Map<number, PawnView>();

let showHitboxes = false;
let thirdPerson = false;
const controls = new Controls(settings, onUi);
controls.setView(possessed().state.yaw, 0);
controls.attach(renderer.domElement);
controls.isBlocked = () => !$(".pause").classList.contains("hidden") || !$(".help").classList.contains("hidden");
controls.stanceLocked = () => {
  const p = sim.pawns.get(ctrl.possessedPawnId);
  return ctrl.shellCam || ctrl.swapPhase !== 0 || (p !== undefined && isDowned(p.state)); // down: the body decides
};
controls.weaponState = () => {
  const p = sim.pawns.get(ctrl.possessedPawnId);
  return p && (!net || net.session.ready) ? { slot: p.state.slot, equipping: p.state.wAct === WeaponAct.Equip, zoom: p.loadout?.weapons[p.state.slot].ads.zoom ?? 1 } : null;
};

const MODE_KEY: Partial<Record<Action, "crouchMode" | "proneMode" | "leanMode" | "adsMode">> = {
  crouch: "crouchMode",
  prone: "proneMode",
  leanLeft: "leanMode",
  leanRight: "leanMode",
  ads: "adsMode",
};
// Touch-only devices never lock the pointer, so they skip click-to-play and the Resume button. A
// touchscreen laptop keeps the mouse flow and gets touch controls the first time it is actually touched;
// after that the pointer last used decides (the touch layer passes mouse clicks on to pointer lock).
const touchOnly = isTouchDevice();
let usingTouch = touchOnly;
let touchLayer: HTMLElement | null = null;
const mountTouch = () => {
  touchLayer ??= mountTouchControls(app, controls, (a) => (MODE_KEY[a] ? settings[MODE_KEY[a]!] : undefined), renderer.domElement);
  app.classList.add("touch"); // the weapon panel moves clear of the touch buttons
};
if (touchOnly) mountTouch();
const notePointer = (e: PointerEvent) => {
  usingTouch = touchOnly || e.pointerType === "touch";
  if (usingTouch) mountTouch();
};
addEventListener("pointerdown", notePointer, { capture: true });
addEventListener("pointermove", notePointer, { capture: true });

addEventListener("resize", () => {
  renderer.setSize(view.clientWidth, view.clientHeight);
  camera.aspect = view.clientWidth / view.clientHeight;
  camera.updateProjectionMatrix();
  viewmodel.setAspect(camera.aspect);
  renderPause();
});

// ------------------------------------------------------------------ UI actions

function onUi(a: UiAction) {
  if (a === "hitboxes") showHitboxes = !showHitboxes;
  else if (a === "thirdPerson") thirdPerson = !thirdPerson;
  else if (a === "help") $(".help").classList.toggle("hidden");
  else if (a === "settings") togglePause();
  else if (a === "respawn") respawn();
  else if (a === "fire") noteClick();
}

function respawn() {
  if (net) return net.send(encodeLabTool({ kind: "respawn" })); // the server sends the new body
  sim.respawn(ctrl.possessedPawnId);
  controls.setView(possessed().state.yaw, 0);
  controls.resetStance();
  snapshotAll();
}

const GOTO: [string, number, number, number, number][] = [
  ["Spawn", 0, 0, 12, 0],
  ["Vault course", -6, 0, 10, 0],
  ["Window + doorway", 6, 0, 3, 0],
  ["Stairs + 3 m drop", 14, 0, 10, 0],
  ["Ladder tower", -16, 0, -4.5, 0],
  ["Crouch / prone tunnels", 20, 0, -4, 0],
  ["Ramps", -20, 0, 18, 0],
  ["Lean corner", 1, 0, -13, 0],
];

function goTo(i: number) {
  const [, x, y, z, yaw] = GOTO[i];
  if (net) net.send(encodeLabTool({ kind: "teleport", x, y, z, yawDeg: yaw }));
  else sim.teleport(ctrl.possessedPawnId, x, y, z, yaw);
  controls.setView(yaw * DEG, 0);
  controls.resetStance();
  snapshotAll();
}

// ------------------------------------------------------------------ loadout (Phase 3 M4, DECISIONS D-042)

const SLOTS = ["primary", "secondary"] as const;
const ATTACHMENT_NAMES: Record<string, string> = {
  iron: "Iron sight",
  nonmag: "Red dot / holo (1x)",
  magnified: "Magnified (2.5x)",
  telescopic: "Telescopic (3.5x)",
  muzzle_brake: "Muzzle brake",
  compensator: "Compensator",
  flash_hider: "Flash hider",
  suppressor: "Suppressor",
  extended_barrel: "Extended barrel",
  vertical: "Vertical grip",
  angled: "Angled grip",
  horizontal: "Horizontal grip",
  laser: "Laser",
};

/** A weapon pick in the link: `para_308.magnified.extended_barrel.angled.laser` (trailing parts optional). */
function weaponParam(w: WeaponPick): string {
  return [w.weapon, w.sight ?? "", w.barrel ?? "", w.grip ?? "", w.underbarrel ?? ""].join(".").replace(/\.+$/, "");
}
function parseWeaponParam(v: string | null): WeaponPick | null {
  if (!v) return null;
  const [weapon, sight, barrel, grip, under] = v.split(".");
  const one = <T extends string>(list: readonly T[], x: string | undefined): T | null => ((list as readonly string[]).includes(x ?? "") ? (x as T) : null);
  return { weapon, sight: one(SIGHTS, sight), barrel: one(BARRELS, barrel), grip: one(GRIPS, grip), underbarrel: one(UNDERBARRELS, under) };
}
/** The loadout in the link for this operator (anything invalid becomes their default). */
function pickFromUrl(opId: string): LoadoutPick {
  const d = defaultLoadoutPick(data, opId);
  const pick = { ...d, primary: parseWeaponParam(params.get("primary")) ?? d.primary, secondary: parseWeaponParam(params.get("secondary")) ?? d.secondary };
  return resolveLoadout(data, pick).loadout.pick;
}
/** What the body we're in carries. */
const currentPick = (): LoadoutPick => sim.pawns.get(ctrl.possessedPawnId)?.loadout?.pick ?? defaultLoadoutPick(data, operatorId);

function loadoutSection(): string {
  const pick = currentPick();
  const lo = possessed().loadout;
  return `<section class="loadout"><h3>Loadout</h3>${SLOTS.map((slot, i) => weaponRow(slot, pick, lo?.weapons[i] ?? null)).join("")}
    <p class="note">Changing anything gives you a new body${net ? " (the server spawns it)" : ""}. <span class="unv">?</span> marks a value that is still a placeholder (research/OPEN_QUESTIONS.md).</p></section>`;
}

function weaponRow(slot: (typeof SLOTS)[number], pick: LoadoutPick, resolved: ResolvedWeapon | null): string {
  const wp = pick[slot];
  const w = data.weapons.get(wp.weapon);
  const allowed = <T extends string>(offers: Offer<T>[]) => offers.filter((o) => typeof o === "string" || o.operators.includes(op.id)).map(offerId);
  const select = (part: string, options: [string, string, boolean?][], current: string) =>
    `<select data-slot="${slot}" data-part="${part}">${options.map(([v, label, off]) => `<option value="${v}" ${v === current ? "selected" : ""} ${off ? "disabled" : ""}>${label}</option>`).join("")}</select>`;
  const ids = op.loadout[slot === "primary" ? "primaries" : "secondaries"];
  const weapons: [string, string, boolean][] = ids.map((id) => [id, isPickable(data, id) ? data.weapons.get(id)!.name : `${data.weapons.get(id)!.name} (Phase 8)`, !isPickable(data, id)]);
  let atts = "";
  if (w && isGun(w)) {
    const named = (v: string): [string, string] => [v, ATTACHMENT_NAMES[v] ?? v];
    const sights = allowed(w.attachments.sights).map(named);
    const barrels = allowed(w.attachments.barrels).map(named);
    const grips = allowed(w.attachments.grips).map(named);
    const unders = allowed(w.attachments.underbarrel).map(named);
    atts = [
      sights.length > 1 ? select("sight", sights, wp.sight ?? "iron") : "",
      barrels.length ? select("barrel", [["", "No barrel"], ...barrels], wp.barrel ?? "") : "",
      grips.length > 1 ? select("grip", grips, wp.grip ?? "horizontal") : "",
      unders.length ? select("underbarrel", [["", "No laser"], ...unders], wp.underbarrel ?? "") : "",
    ].join("");
  }
  return `<div class="loadout-row"><label>${slot === "primary" ? "Primary" : "Secondary"} ${select("weapon", weapons, wp.weapon)}</label>
    <div class="atts">${atts}</div>
    ${resolved && w && isGun(w) ? `<p class="note stats">${weaponStats(resolved, w)}</p>` : ""}</div>`;
}

/** The numbers the simulation uses for this weapon, with a "?" on placeholders. */
function weaponStats(r: ResolvedWeapon, w: GunData): string {
  const unv = (path: string) =>
    w._unverified.some((u) => path === u || path.startsWith(u + ".")) ? `<span class="unv" title="Placeholder: not verified yet (research/OPEN_QUESTIONS.md)">?</span>` : "";
  const sec = (ticks: number) => `${(ticks / TICK_HZ).toFixed(2)} s`;
  const reload =
    r.reload.kind === "magazine"
      ? `reload ${sec(r.reload.tacticalTicks)}${unv("reload.tacticalS")} / ${sec(r.reload.emptyTicks)}${unv("reload.emptyS")}`
      : r.reload.kind === "per_shell"
        ? `${sec(r.reload.perShellTicks)}${unv("reload.perShellS")} a shell`
        : "";
  return [
    r.damage ? `${r.damage.base}${unv(r.pick.barrel === "extended_barrel" ? "damage.extendedBarrel" : "damage.base")} dmg${r.fire.pellets > 1 ? ` × ${r.fire.pellets} pellets` : ""}` : "",
    `${r.fire.rpm}${unv("fire.rpm")} rpm`,
    `${r.ammo.magazine}${r.ammo.plusOne ? "+1" : ""} / ${r.ammo.maxAmmo}${unv("ammo.maxAmmo")}`,
    `ADS ${sec(r.ads.ticks)}`,
    reload,
    r.moveSpeedMult < 0.999 ? `${Math.round((1 - r.moveSpeedMult) * 100)} % slower` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A new body with this loadout: offline the page reloads with it in the link; online the server spawns it. */
function applyLoadout(pick: LoadoutPick) {
  const url = new URL(location.href);
  url.searchParams.set("op", pick.operator);
  for (const slot of SLOTS) url.searchParams.set(slot, weaponParam(pick[slot]));
  if (!net) {
    location.href = url.toString();
    return;
  }
  history.replaceState(null, "", url); // a reload keeps the pick
  net.send(encodePickLoadout(pick)); // the new body arrives with the roster
}

/** Another operator, with their default loadout. */
function pickOperator(id: string) {
  applyLoadout(defaultLoadoutPick(data, id));
}

/** Leave the pause menu from a button: mouse clicks lock the pointer again, taps just close it. */
function resume(e: Event) {
  if (touchOnly || (e as PointerEvent).pointerType === "touch") togglePause(false);
  else controls.lockPointer(renderer.domElement);
}

function togglePause(force?: boolean) {
  const pause = $(".pause");
  const show = force ?? pause.classList.contains("hidden");
  pause.classList.toggle("hidden", !show);
  if (show) {
    renderPause();
    controls.releaseAll(); // keys held when the menu opened would otherwise stay "down"
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && !autotest) togglePause(true); // a lost lock means the mouse was in use
  else if (document.pointerLockElement) togglePause(false);
});
$(".gear").addEventListener("click", () => togglePause());

function renderPause() {
  const pause = $(".pause");
  const hfov = horizontalFov(settings.fovVertical, camera.aspect).toFixed(0);
  const modeSel = (key: "crouchMode" | "proneMode" | "leanMode" | "adsMode", label: string) => `
    <label>${label}<select data-k="${key}">
      <option value="toggle" ${settings[key] === "toggle" ? "selected" : ""}>Toggle</option>
      <option value="hold" ${settings[key] === "hold" ? "selected" : ""}>Hold</option></select></label>`;
  const swap = op.ability.params; // timings required for 2-pawn operators (schema)
  const opts = (side: string) =>
    [...data.operators.values()]
      .filter((o) => o.side === side)
      .map((o) => `<option value="${o.id}" ${o.id === operatorId ? "selected" : ""}>${o.name} — ${o.healthRating} health / ${o.speedRating} speed</option>`)
      .join("");
  const room = net
    ? `<section><h3>Room ${net.session.roomCode} · ${net.session.roster.length} player${net.session.roster.length === 1 ? "" : "s"}</h3>
      <div class="goto"><button class="invite">Copy invite link</button><button class="leave">Leave room</button></div>
      <label>Simulated extra latency <select data-net="rttMs">${[0, 50, 100, 150, 200].map((ms) => `<option value="${ms}" ${ms === conditions.rttMs ? "selected" : ""}>${ms ? `+${ms} ms round trip` : "Off"}</option>`).join("")}</select></label>
      <label>Simulated jitter <select data-net="jitterMs">${[0, 10, 20, 40].map((ms) => `<option value="${ms}" ${ms === conditions.jitterMs ? "selected" : ""}>${ms ? `up to ${ms} ms each way` : "Off"}</option>`).join("")}</select></label>
      <label>Simulated loss <select data-net="lossPct">${[0, 0.5, 1, 2, 5].map((p) => `<option value="${p}" ${p === conditions.lossPct ? "selected" : ""}>${p ? `${p} % (a 200 ms stall each)` : "Off"}</option>`).join("")}</select></label>
      <p class="note">Shots do real damage now: the server rewinds everyone else to what you saw (lag compensation), and the white line shows where your first pellet went and what it hit first. Headshots kill; friendly fire is on.</p></section>`
    : "";
  pause.innerHTML = `
    <h2>Movement Lab${net ? " · Online" : ""}</h2>
    ${touchOnly ? "" : `<button class="primary resume">Resume (click)</button>`}
    ${room}
    <section><h3>Operator</h3>
      <select class="op-select"><optgroup label="Attackers">${opts("attacker")}</optgroup><optgroup label="Defenders">${opts("defender")}</optgroup></select>
      ${op.pawns > 1 ? `<p class="note">${op.name} has two shells: press <kbd>${keyLabel(settings.keys.ability)}</kbd> to look through the other shell's camera, then <kbd>${keyLabel(settings.keys.interact)}</kbd> to transfer (${swap.transferSeconds} s + ${swap.activationSeconds} s).</p>` : ""}
      ${net ? `<label>Team <select class="team-select"><option value="0" ${ctrl.team === 0 ? "selected" : ""}>Attackers</option><option value="1" ${ctrl.team === 1 ? "selected" : ""}>Defenders</option></select></label>` : ""}
    </section>
    ${loadoutSection()}
    <section><h3>Go to</h3><div class="goto">${GOTO.map((g, i) => `<button data-goto="${i}">${g[0]}</button>`).join("")}</div></section>
    <section><h3>Lab tools</h3><div class="goto"><button class="refill">Refill ammo</button><button class="hurt-me">Take 30 damage</button><button class="down-me">Down me</button></div>
      <p class="note">Down but not out: you crawl and bleed out in 60 s (30 s while crawling); a teammate holds ${keyLabel(settings.keys.interact)} for 4 s to revive you with 20 HP. A second down kills.</p></section>
    <section><h3>Controls</h3>
      <label>Sensitivity <input type="range" min="0.01" max="0.4" step="0.005" value="${settings.sensitivity}" data-num="sensitivity"><output>${settings.sensitivity.toFixed(3)}</output></label>
      ${(["1", "2.5", "3.5"] as const)
        .map(
          (z) =>
            `<label>ADS sensitivity × at ${z}× <input type="range" min="0.2" max="1.5" step="0.05" value="${settings.adsSensitivityByZoom[z]}" data-zoom="${z}"><output>${settings.adsSensitivityByZoom[z].toFixed(2)}</output></label>`,
        )
        .join("")}
      <label>Vertical FOV <input type="range" min="60" max="90" step="1" value="${settings.fovVertical}" data-num="fovVertical"><output>${settings.fovVertical}° (${hfov}° horizontal)</output></label>
      <label><input type="checkbox" data-bool="invertY" ${settings.invertY ? "checked" : ""}> Invert Y</label>
      <label><input type="checkbox" data-bool="rawInput" ${settings.rawInput ? "checked" : ""}> Raw mouse input</label>
      ${modeSel("crouchMode", "Crouch")} ${modeSel("proneMode", "Prone")} ${modeSel("leanMode", "Lean")} ${modeSel("adsMode", "Aim (ADS)")}
    </section>
    <p class="note">Press <kbd>F1</kbd> for the key list and what to try.</p>`;
  pause.querySelector(".resume")?.addEventListener("click", resume);
  pause.querySelector(".refill")!.addEventListener("click", labRefill);
  pause.querySelector(".hurt-me")!.addEventListener("click", () => labHurt(30));
  pause.querySelector(".down-me")!.addEventListener("click", () => labHurt(possessed().state.hp || 1));
  pause.querySelector<HTMLSelectElement>(".op-select")!.addEventListener("change", (e) => pickOperator((e.target as HTMLSelectElement).value));
  pause.querySelector<HTMLSelectElement>(".team-select")?.addEventListener("change", (e) => net?.send(encodeLabTool({ kind: "team", team: Number((e.target as HTMLSelectElement).value) })));
  pause.querySelectorAll<HTMLSelectElement>(".loadout select").forEach((el) =>
    el.addEventListener("change", () => {
      const pick: LoadoutPick = structuredClone(currentPick());
      const slot = el.dataset.slot as (typeof SLOTS)[number];
      const part = el.dataset.part as keyof WeaponPick;
      if (part === "weapon") pick[slot] = { weapon: el.value, sight: null, barrel: null, grip: null, underbarrel: null };
      else (pick[slot] as unknown as Record<string, string | null>)[part] = el.value || null;
      applyLoadout(pick);
    }),
  );
  pause.querySelector(".invite")?.addEventListener("click", (e) => {
    void navigator.clipboard?.writeText(inviteLink()).then(() => ((e.target as HTMLElement).textContent = "Copied!"));
  });
  pause.querySelector(".leave")?.addEventListener("click", () => {
    net?.close();
    location.href = "/";
  });
  pause.querySelectorAll<HTMLSelectElement>("[data-net]").forEach((sel) =>
    sel.addEventListener("change", () => (conditions[sel.dataset.net as keyof typeof conditions] = Number(sel.value))),
  );
  pause.querySelectorAll<HTMLButtonElement>("[data-goto]").forEach((b) =>
    b.addEventListener("click", (e) => {
      goTo(Number(b.dataset.goto));
      resume(e);
    }),
  );
  pause.querySelectorAll<HTMLInputElement>("[data-num]").forEach((inp) =>
    inp.addEventListener("input", () => {
      (settings as unknown as Record<string, number>)[inp.dataset.num!] = Number(inp.value);
      applySettings();
      inp.nextElementSibling!.textContent =
        inp.dataset.num === "fovVertical" ? `${settings.fovVertical}° (${horizontalFov(settings.fovVertical, camera.aspect).toFixed(0)}° horizontal)` : Number(inp.value).toFixed(inp.dataset.num === "sensitivity" ? 3 : 2);
    }),
  );
  pause.querySelectorAll<HTMLInputElement>("[data-zoom]").forEach((inp) =>
    inp.addEventListener("input", () => {
      settings.adsSensitivityByZoom[inp.dataset.zoom as "1" | "2.5" | "3.5"] = Number(inp.value);
      applySettings();
      inp.nextElementSibling!.textContent = Number(inp.value).toFixed(2);
    }),
  );
  pause.querySelectorAll<HTMLInputElement>("[data-bool]").forEach((inp) =>
    inp.addEventListener("change", () => {
      (settings as unknown as Record<string, boolean>)[inp.dataset.bool!] = inp.checked;
      applySettings();
    }),
  );
  pause.querySelectorAll<HTMLSelectElement>("select[data-k]").forEach((sel) =>
    sel.addEventListener("change", () => {
      settings[sel.dataset.k as "crouchMode"] = sel.value as HoldMode;
      applySettings();
    }),
  );
}

function applySettings() {
  saveSettings(settings);
  controls.setSettings(settings);
  camera.fov = settings.fovVertical;
  camera.updateProjectionMatrix();
}

function renderHelp() {
  const k = settings.keys;
  const row = (keys: string, what: string) => `<tr><td>${keys}</td><td>${what}</td></tr>`;
  $(".help").innerHTML = `
    <h2>Controls</h2>
    <table>
      ${row(`<kbd>${keyLabel(k.forward)}</kbd><kbd>${keyLabel(k.left)}</kbd><kbd>${keyLabel(k.back)}</kbd><kbd>${keyLabel(k.right)}</kbd>`, "Move")}
      ${row(`<kbd>${keyLabel(k.sprint)}</kbd>`, "Sprint (forward only; stands you up)")}
      ${row(`<kbd>${keyLabel(k.crouch)}</kbd> / <kbd>${keyLabel(k.prone)}</kbd>`, "Crouch / prone (toggle or hold — see settings)")}
      ${row(`<kbd>${keyLabel(k.leanLeft)}</kbd> / <kbd>${keyLabel(k.leanRight)}</kbd>`, "Lean left / right")}
      ${row(`<kbd>${keyLabel(k.vault)}</kbd>`, "Vault / mantle: face a low obstacle and press it — standing still works; a prompt shows when you can. Holding it while running also works.")}
      ${row(`<kbd>${keyLabel(k.interact)}</kbd>`, "Use: grab / let go of a ladder; Skopós: transfer to the shell you're viewing")}
      ${row(`<kbd>${keyLabel(k.slowWalk)}</kbd>`, "Slow walk")}
      ${row("Right mouse", "Aim down sights (slower walk)")}
      ${row(`<kbd>${keyLabel(k.ability)}</kbd>`, "Ability — Skopós: view your other shell's camera (press again to go back)")}
      ${row(`<kbd>${keyLabel(k.respawn)}</kbd>`, "Respawn")}
      ${row("Left mouse", net ? "Fire (hold for automatic weapons). Online, each shot shows what the server's lag compensation hit." : "Fire (hold for automatic weapons)")}
      ${row(`<kbd>${keyLabel(k.reload)}</kbd>`, "Reload")}
      ${row(`<kbd>${keyLabel(k.primary)}</kbd> / <kbd>${keyLabel(k.secondary)}</kbd> / wheel`, "Primary / secondary weapon")}
      ${row(`<kbd>${keyLabel(k.fireMode)}</kbd>`, "Fire mode (auto / burst / single, where the weapon has them)")}
      ${row(`<kbd>${keyLabel(k.melee)}</kbd>`, "Knife: kills anyone in reach in front of you, standing or down (0.6 s a swing)")}
      ${row(`Hold <kbd>${keyLabel(k.interact)}</kbd>`, "Revive a downed teammate (4 s, facing them)")}
      ${row("<kbd>F3</kbd> / <kbd>F4</kbd>", "Hitboxes / third-person view")}
      ${row("<kbd>Esc</kbd>", "Pause: settings, operator, go-to menu")}
    </table>
    <h2>Try this</h2>
    <ul>
      <li>Vault course: 0.5, 0.9 and 1.1 m vault-overs, a 1.3 m climb, and a 1.6 m block you can't vault.</li>
      <li>Vault through the open window; walk through the doorway.</li>
      <li>Crouch tunnel (1.45 m) and prone tunnel (0.75 m): you can't stand up inside.</li>
      <li>Lean at the corner and against walls — your head stops at the wall.</li>
      <li>Stairs to a 3 m platform (safe drop) and a 6.5 m ladder tower (lethal drop).</li>
      <li>Ramps: 15° and 40° walkable, 55° too steep. Press F4 while leaning to see your body bend.</li>
    </ul>
    <p class="note">All speeds, heights and timings are placeholders from research until measured in-game (data/movement.json).</p>`;
}
renderHelp();

// ------------------------------------------------------------------ simulation loop

let prevStates = new Map<number, PawnState>();
function snapshotAll() {
  prevStates = new Map([...sim.pawns.values()].map((p) => [p.id, { ...p.state }]));
}
snapshotAll();

let seq = 0;
let acc = 0;
let viewedId = sim.viewedPawnId(ctrl.id);
let possessedId = ctrl.possessedPawnId;
let prompt: ReturnType<Sim["prompt"]> = null;
let last = performance.now();

function tick() {
  snapshotAll();
  tickKick.yaw = tickKick.pitch = 0;
  if (net) {
    const sampled = controls.sample(++seq);
    // Test scripts add buttons to what the controls sample (a click still fires while a script holds ADS).
    const input = scripted ? { ...sampled, ...scripted, buttons: sampled.buttons | (scripted.buttons ?? 0) } : sampled;
    // Predicts locally and sends the input; a shot claims the frame that was on screen when you clicked.
    net.session.tick(input, clickViewTick ?? undefined);
    clickViewTick = null;
  } else {
    const input = autotest ? autoInput(++seq) : controls.sample(++seq);
    sim.step(new Map([[ctrl.id, input]]));
    onWeaponEvents(sim.events);
  }
  const p = possessed();
  // The view follows the body you're looking through (Skopós' other shell while on its camera).
  const nowViewed = sim.viewedPawnId(ctrl.id);
  const v = sim.pawns.get(nowViewed);
  if (!p || !v) return; // online, between bodies (the server's new one hasn't arrived yet)
  if (nowViewed !== viewedId) {
    viewedId = nowViewed;
    controls.setView(v.state.yaw, v.state.pitch);
  } else {
    controls.syncView(v.state.yaw, v.state.pitch, tickKick);
  }
  prompt = sim.prompt(ctrl.id);
  // Keep toggles and view limits in step with what the simulation decided this tick.
  const mv = data.movement;
  controls.afterTick(
    { sprinting: p.state.sprinting, onLadder: p.state.mode === PawnMode.Ladder },
    { forcesStand: mv.sprint.forcesStand, sprintCancelsLean: mv.lean.sprintCancelsLean },
  );
  // Toggles belong to the body you control. On the other shell's camera the simulation ignores stance
  // input, so hold them at what the hand-over tick must send: your body's own stance when you go back,
  // standing when the new shell wakes up (D-025).
  if (ctrl.shellCam || ctrl.swapPhase) controls.resetStance(ctrl.swapPhase ? Stance.Stand : p.state.stance);
  else if (p.id !== possessedId || isDowned(p.state)) controls.resetStance(p.state.stance); // down: the body decides
  possessedId = p.id;
  const proneView = v.state.mode === PawnMode.Walk && proneWeight(v.state) > 0;
  controls.limits = proneView
    ? { pitchMin: mv.stance.pronePitchMinDeg * DEG, pitchMax: mv.stance.pronePitchMaxDeg * DEG, maxYawStep: mv.stance.proneTurnRateDeg * DEG * DT }
    : { pitchMin: mv.look.pitchMinDeg * DEG, pitchMax: mv.look.pitchMaxDeg * DEG, maxYawStep: null };
  if (p.state.lastFallDamage > 0) flash(`-${p.state.lastFallDamage} HP (fall)`, "bad");
  observe(p);
  if (net) notePredicted();
}

function interpolated(p: Pawn, alpha: number): PawnState {
  const a = prevStates.get(p.id) ?? p.state;
  const b = p.state;
  const sameStance = a.stance === b.stance && a.stanceFrom === b.stanceFrom;
  const o = smoothing.get(p.id);
  return {
    ...b,
    x: lerp(a.x, b.x, alpha) + (o?.[0] ?? 0),
    y: lerp(a.y, b.y, alpha) + (o?.[1] ?? 0),
    z: lerp(a.z, b.z, alpha) + (o?.[2] ?? 0),
    lean: lerp(a.lean, b.lean, alpha),
    stanceT: sameStance ? lerp(a.stanceT, b.stanceT, alpha) : b.stanceT,
    yaw: a.yaw + wrapAngle(b.yaw - a.yaw) * alpha,
    adsQ: a.slot === b.slot ? lerp(a.adsQ, b.adsQ, alpha) : b.adsQ,
  };
}

let frames = 0;
let fpsFrames = 0;
let fpsAt = performance.now();
function frame(now: number) {
  const elapsed = Math.min(0.25, (now - last) / 1000);
  acc += elapsed;
  last = now;
  if (net && !followServer(elapsed)) {
    // Between bodies (joining, respawning, a new operator): wait for the server's exact state.
    acc = 0;
    renderer.render(scene, camera);
    $(".center-msg").textContent = disconnected ?? "Waiting for the server…";
    $(".center-msg").classList.remove("hidden");
    requestAnimationFrame(frame);
    return;
  }
  // Online, the tick period stretches or shrinks a few percent so our inputs reach the server just
  // before it needs them (clock sync, PLAN §5).
  const period = net ? DT * net.session.tickScale() : DT;
  while (acc >= period) {
    acc -= period;
    tick();
  }
  controls.applyLimits();
  const alpha = acc / period;

  const me = possessed();
  const viewed = sim.pawns.get(viewedId) ?? me;
  const renderTick = net ? net.session.frame() : 0;
  shownRenderTick = renderTick;
  syncPawnViews();
  for (const pawn of sim.pawns.values()) {
    const v = pawnViews.get(pawn.id)!;
    // Other players are drawn a little in the past, between two server snapshots; our own bodies are
    // drawn from our prediction.
    const rs = pawn.proxy ? net!.session.remoteAt(pawn.id, renderTick) : interpolated(pawn, alpha);
    v.body.visible = rs !== null;
    v.wire.visible = rs !== null && showHitboxes;
    if (!rs) continue;
    const w = pawn.loadout?.weapons[rs.slot];
    v.setWeapon(w ? { class: w.class, pick: w.pick } : null);
    v.update(sim.data, rs);
    drawnView.set(pawn.id, [rs.yaw, rs.pitch]);
    const eyes = pawn.id === viewed.id;
    // Your own body only casts its shadow in first person; your gun is the viewmodel.
    v.setFirstPerson(eyes && !thirdPerson);
    v.wire.visible = showHitboxes && (!eyes || thirdPerson);
  }
  updateShots(now);
  fx.update(now, shownRenderTick, ctrl.pawnIds, ownMuzzle, remoteMuzzle);
  updateCombatHud(now);
  updateLasers();

  const rs = interpolated(viewed, alpha);
  const fov = aim(viewed, rs);
  const eye = eyePose(data.movement, data.hitboxes, { ...rs, yaw: controls.yaw });
  if (thirdPerson) {
    const back = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(controls.pitch, controls.yaw, 0, "YXZ"));
    camera.position.set(eye.pos[0] + back.x * 3 + Math.cos(controls.yaw) * 0.5, eye.pos[1] + back.y * 3 + 0.4, eye.pos[2] + back.z * 3 - Math.sin(controls.yaw) * 0.5);
    camera.rotation.set(controls.pitch, controls.yaw, 0);
  } else {
    camera.position.set(eye.pos[0], eye.pos[1], eye.pos[2]);
    camera.rotation.set(controls.pitch, controls.yaw, eye.roll);
  }
  updateLabels(camera);
  renderer.render(scene, camera);
  const inHand = viewed.id === possessed()?.id && !thirdPerson && !ctrl.shellCam && ctrl.swapPhase === 0 ? (viewed.loadout?.weapons[rs.slot] ?? null) : null;
  viewmodel.update(now, elapsed, inHand, rs, viewed.loadout?.swapTicks ?? 1);
  viewmodel.render(renderer);
  const held = viewed.loadout?.weapons[rs.slot];
  const aimed = inHand !== null && viewmodel.aim > 0.9;
  crosshair.update({
    gapPx: held ? spreadGapPx(spreadCone(held, rs), fov, view.clientHeight) : 0,
    noTicks: rs.mode === PawnMode.Dead || ctrl.shellCam || ctrl.swapPhase !== 0 || thirdPerson,
    aimed,
    reticle: viewmodel.reticle,
    zoomed: aimed && inHand!.ads.zoom > 1,
  });
  frames++;
  fpsFrames++;
  if (now - fpsAt > 500) {
    $(".fps").textContent = `${Math.round((fpsFrames * 1000) / (now - fpsAt))} fps · tick ${sim.tick}`;
    if (net) updateNetStats(now - fpsAt);
    fpsFrames = 0;
    fpsAt = now;
  }
  updateHud(me);
  requestAnimationFrame(frame);
}

/** Aiming, drawn from the body you look through: a magnified sight narrows the field of view as ADS comes in. Returns the field of view. */
function aim(p: Pawn, rs: PawnState): number {
  const w = p.loadout?.weapons[rs.slot];
  const fov = w ? adsFov(settings.fovVertical, w.ads.zoom, rs.adsQ / 65535) : settings.fovVertical;
  if (Math.abs(camera.fov - fov) > 1e-4) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  return fov;
}

// ------------------------------------------------------------------ HUD

const STANCE_NAMES = ["STAND", "CROUCH", "PRONE"];
const MODE_NAMES = ["", "VAULT", "LADDER", "DEAD"];
function updateHud(p: Pawn) {
  const s = p.state;
  $(".op-name").textContent = `${op.name} · ${op.side} · ${op.healthRating} health / ${op.speedRating} speed${op.pawns > 1 ? ` · shell ${ctrl.pawnIds.indexOf(p.id) + 1}/2` : ""}`;
  downedHud.update(s, data.combat, keyLabel(settings.keys.interact), nameOfPawn);
  app.querySelectorAll<HTMLElement>(".stances span").forEach((el) => el.classList.toggle("on", Number(el.dataset.s) === s.stance));
  $(".stance-bar div").style.width = `${s.stanceT * 100}%`;
  const speed = Math.hypot(s.vx, s.vz);
  $(".readout").textContent = [
    `${speed.toFixed(2)} m/s`,
    s.sprinting ? "SPRINT" : controls.adsActive ? "ADS" : "",
    MODE_NAMES[s.mode],
    s.stanceT < 1 ? `${STANCE_NAMES[s.stanceFrom]} → ${STANCE_NAMES[s.stance]}` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
  $(".lean-l").style.opacity = String(Math.max(0, -s.lean));
  $(".lean-r").style.opacity = String(Math.max(0, s.lean));
  const msg = $(".center-msg");
  const dead = s.mode === PawnMode.Dead;
  if (!dead) deathText = null;
  const needClick = !usingTouch && !autotest && !document.pointerLockElement && $(".pause").classList.contains("hidden");
  const waiting = net !== null && !net.session.ready;
  msg.classList.toggle("hidden", !dead && !needClick && !waiting && !disconnected);
  msg.textContent = disconnected
    ? disconnected
    : waiting
      ? "Waiting for the server…"
      : dead
        ? `${deathText ?? "You died from the fall"} — press ${keyLabel(settings.keys.respawn)} to respawn`
        : "Click to play · F1 for controls";
  if (touchLayer) touchLayer.querySelector(".touch-btn")!.classList.toggle("on", controls.sprintIsLatched);

  const k = settings.keys;
  const promptText =
    prompt === "mantle"
      ? `${keyLabel(k.vault)} to mantle`
      : prompt === "ladder"
        ? `${keyLabel(k.interact)} to climb`
        : prompt === "transfer"
          ? `${keyLabel(k.interact)} to transfer`
          : prompt === "revive"
            ? `Hold ${keyLabel(k.interact)} to revive`
            : "";
  $(".prompt").textContent = promptText;
  $(".prompt").classList.toggle("hidden", !promptText || dead);
  const onCam = ctrl.shellCam || ctrl.swapPhase !== 0;
  $(".shellcam").classList.toggle("hidden", !onCam);
  if (onCam) {
    const params = op.ability.params;
    const dur = ctrl.swapPhase === 1 ? params.transferSeconds : params.activationSeconds;
    $(".shellcam-title").textContent =
      ctrl.swapPhase === 1 ? "TRANSFERRING…" : ctrl.swapPhase === 2 ? "ACTIVATING SHELL…" : `SHELL CAMERA · ${keyLabel(k.ability)} to go back`;
    $(".swap-bar").classList.toggle("hidden", ctrl.swapPhase === 0);
    $(".swap-bar div").style.width = `${Math.min(100, (100 * ctrl.swapT) / dur)}%`;
  }
  $(".flash").classList.toggle("show", performance.now() < flashUntil);

  ammoHud.update(p.loadout?.weapons[s.slot], s, dead || onCam, keyLabel(k.fireMode));
}

function flash(text: string, kind: "bad" | "info") {
  const el = $(".flash");
  el.textContent = text;
  el.dataset.kind = kind;
  flashUntil = performance.now() + 1600;
}

// ------------------------------------------------------------------ automated test hook (?autotest=1)

interface LabReport {
  ready: boolean;
  done: boolean;
  frames: number;
  webgl: string;
  walkSpeed: number;
  sprintSpeed: number;
  vaulted: boolean;
  windowCrossed: boolean;
  stancesSeen: number[];
  maxLean: number;
  towerTop: boolean;
  laddered: boolean;
  mantlePromptStandingStill: boolean;
  mantledWithoutMoving: boolean;
}
const gl = renderer.getContext();
const dbg = gl.getExtension("WEBGL_debug_renderer_info");
const report: LabReport = {
  ready: true,
  done: !autotest || online,
  frames: 0,
  webgl: String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
  walkSpeed: 0,
  sprintSpeed: 0,
  vaulted: false,
  windowCrossed: false,
  stancesSeen: [],
  maxLean: 0,
  towerTop: false,
  laddered: false,
  mantlePromptStandingStill: false,
  mantledWithoutMoving: false,
};
Object.defineProperty(window, "__lab", {
  value: {
    report,
    get frames() {
      return frames;
    },
    /** Online state for the two-browser test (tools/e2e/online-lab.mjs). */
    get net() {
      if (!net) return null;
      const s = net.session;
      return {
        room: s.roomCode,
        ready: s.ready,
        you: s.you,
        players: s.roster.map((e) => e.name),
        roster: s.roster,
        corrections: s.stats.corrections,
        resyncs: s.stats.resyncs,
        rttMs: s.rttMs,
        remotes: s.remoteIds().map((id) => ({ id, state: s.remoteAt(id) })),
        own: possessed() ? { ...possessed().state } : null,
        weapon: possessed()?.loadout
          ? { id: possessed().loadout!.weapons[possessed().state.slot].id, slot: possessed().state.slot, loaded: loadedOf(possessed().state), reserve: reserveOf(possessed().state) }
          : null,
        pawnId: ctrl.possessedPawnId,
        frames,
        lastShot,
        events: [...recentEvents],
        mispredictions: s.mispredictions,
        hp: possessed()?.state.hp ?? 0,
        dead: possessed()?.state.mode === PawnMode.Dead,
        disconnected,
      };
    },
    goTo,
    pickOperator,
    pickLoadout: (pick: LoadoutPick) => applyLoadout(pick),
    teleport: (x: number, y: number, z: number, yawDeg: number) => {
      if (net) net.send(encodeLabTool({ kind: "teleport", x, y, z, yawDeg }));
      else sim.teleport(ctrl.possessedPawnId, x, y, z, yawDeg);
      controls.setView(yawDeg * DEG, 0);
    },
    fire: () => fire(),
    /** Lab tool: hurt your own body (the whole of its health downs it). */
    hurt: (amount: number) => labHurt(amount),
    /** Online tests: replace parts of the sampled input (e.g. { forward: 1 }); null hands back control. */
    set input(v: Partial<InputCmd> | null) {
      scripted = v;
    },
    set view(v: { hitboxes?: boolean; thirdPerson?: boolean }) {
      if (v.hitboxes !== undefined) showHitboxes = v.hitboxes;
      if (v.thirdPerson !== undefined) thirdPerson = v.thirdPerson;
    },
  },
});

type Phase = { ticks: number; input: Partial<InputCmd> & { yawDeg?: number }; setup?: () => void; after?: (p: Pawn) => void };
const PHASES: Phase[] = [
  { ticks: 30, input: {} },
  { ticks: 64, input: { forward: 1 }, after: (p) => (report.walkSpeed = Math.hypot(p.state.vx, p.state.vz)) },
  { ticks: 64, input: { forward: 1, buttons: Btn.Sprint }, after: (p) => (report.sprintSpeed = Math.hypot(p.state.vx, p.state.vz)) },
  {
    ticks: 10,
    input: {},
    setup: () => sim.teleport(ctrl.possessedPawnId, -6, 0, 3),
    after: () => (report.mantlePromptStandingStill = sim.prompt(ctrl.id) === "mantle"),
  },
  { ticks: 64, input: { buttons: Btn.Vault }, after: (p) => (report.mantledWithoutMoving = p.state.z < 1.8) },
  {
    ticks: 64,
    input: { forward: 1, buttons: Btn.Vault },
    setup: () => sim.teleport(ctrl.possessedPawnId, 5, 0, 0.9),
    after: (p) => (report.windowCrossed = p.state.z < -0.4),
  },
  { ticks: 32, input: { stance: Stance.Crouch }, setup: () => sim.teleport(ctrl.possessedPawnId, 0, 0, 12) }, // open ground: prone needs body room
  { ticks: 80, input: { stance: Stance.Prone } },
  { ticks: 80, input: { stance: Stance.Stand } },
  { ticks: 32, input: { lean: 1 } },
  { ticks: 32, input: { lean: -1 } },
  { ticks: 1, input: { buttons: Btn.Interact }, setup: () => sim.teleport(ctrl.possessedPawnId, -16, 0, -5.8) },
  { ticks: 320, input: { forward: 1 }, after: (p) => (report.towerTop = p.state.y > 6.4 && p.state.mode === PawnMode.Walk) },
  { ticks: 20, input: { lean: 1, yawDeg: 160 } },
];
let phase = 0;
let phaseTick = 0;
function autoInput(n: number): InputCmd {
  while (phase < PHASES.length && phaseTick >= PHASES[phase].ticks) {
    PHASES[phase].after?.(possessed());
    phase++;
    phaseTick = 0;
  }
  if (phase >= PHASES.length) {
    report.done = true;
    const s = possessed().state;
    controls.setView(s.yaw, 0);
    return { seq: n, forward: 0, strafe: 0, yaw: s.yaw, pitch: 0, buttons: 0, stance: s.stance, lean: 1 };
  }
  const ph = PHASES[phase];
  if (phaseTick === 0) ph.setup?.();
  phaseTick++;
  const { yawDeg, ...rest } = ph.input;
  const yaw = yawDeg !== undefined ? yawDeg * DEG : 0;
  controls.setView(yaw, 0);
  return { seq: n, forward: 0, strafe: 0, yaw, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...rest };
}

function observe(p: Pawn) {
  const s = p.state;
  report.frames = frames;
  if (s.mode === PawnMode.Vault) report.vaulted = true;
  if (s.mode === PawnMode.Ladder) report.laddered = true;
  if (!report.stancesSeen.includes(s.stance)) report.stancesSeen.push(s.stance);
  report.maxLean = Math.max(report.maxLean, Math.abs(s.lean));
}

// ------------------------------------------------------------------ online (Phase 2)

/** Name, then create a room or join one by code. Resolves once the room's level is loaded. */
function lobby(): Promise<OnlineConnection> {
  const panel = $(".lobby");
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <h2>Movement Lab · Online</h2>
    <p class="note">Create a room and send the invite link to a friend, or join theirs with its code. Everyone in a room sees and bumps into each other; all the lab tools still work.</p>
    <label>Your name <input class="name" maxlength="24" placeholder="Player" autocomplete="nickname"></label>
    <button class="primary create">Create a room</button>
    <h3>Join a room</h3>
    <div class="join-row"><input class="code" maxlength="5" placeholder="CODE" autocapitalize="characters" spellcheck="false"><button class="join">Join</button></div>
    <p class="error"></p>
    <p class="note"><a href="/labs/movement_lab.html">Offline lab</a> · <a href="/">Home</a></p>`;
  const nameInput = panel.querySelector<HTMLInputElement>(".name")!;
  const codeInput = panel.querySelector<HTMLInputElement>(".code")!;
  const error = panel.querySelector<HTMLElement>(".error")!;
  try {
    nameInput.value = localStorage.getItem("redmond.name") ?? "";
  } catch {
    // storage blocked: no remembered name
  }
  const linkCode = (params.get("room") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  codeInput.value = linkCode;

  return new Promise((resolve) => {
    let busy = false;
    const go = (room: string | null) => {
      if (busy) return;
      busy = true;
      const name = nameInput.value.trim() || "Player";
      try {
        localStorage.setItem("redmond.name", name);
      } catch {
        // not remembered; fine
      }
      error.textContent = "Connecting…";
      let joined = false;
      const conn = new OnlineConnection({
        name,
        room,
        conditions: () => conditions,
        session: {
          onWelcome: () => {
            // The level loads after Welcome; the connection may have failed meanwhile (a server restart,
            // a dropped network). Then this room is gone and the lobby stays up with the reason.
            if (conn.closed) return;
            joined = true;
            void conn.session.loaded().then(() => {
              if (conn.closed) {
                joined = false;
                busy = false;
                error.textContent ||= "Lost connection to the server.";
                return;
              }
              panel.classList.add("hidden");
              const url = new URL(location.href);
              url.searchParams.delete("online");
              url.searchParams.set("room", conn.session.roomCode);
              history.replaceState(null, "", url); // a reload rejoins, and the link is the invite
              resolve(conn);
            });
          },
          onError: (_code, message) => {
            if (joined) return flash(message, "bad");
            error.textContent = message;
            busy = false;
            conn.close();
          },
          onRoster: () => (rosterChanged = true),
          onShot: (shot) => showShot(shot),
          onEvents: (tick, events) => onGameEvents(tick, events),
          trackMispredictions: autotest, // the e2e scripts report what a misprediction got wrong
          onLocalEvents: (events) => onWeaponEvents(events),
        },
        onClose: (reason) => {
          if (joined) disconnected = reason;
          else if (busy) {
            error.textContent = reason;
            busy = false;
          }
        },
      });
    };
    panel.querySelector<HTMLButtonElement>(".create")!.onclick = () => go(null);
    const join = () => {
      const code = codeInput.value.trim().toUpperCase();
      if (code) go(code);
      else error.textContent = "Enter the room code first.";
    };
    panel.querySelector<HTMLButtonElement>(".join")!.onclick = join;
    codeInput.onkeydown = (e) => {
      if (e.key === "Enter") join();
    };
    if (autotest) go(linkCode || null); // tests skip the form
    else (linkCode ? codeInput : nameInput).focus();
  });
}

/** Our first body comes with the roster; we predict from the server's exact state once that arrives. */
async function firstBody(c: OnlineConnection): Promise<PlayerController> {
  while (!c.session.ready) {
    if (disconnected) {
      $(".center-msg").textContent = disconnected;
      $(".center-msg").classList.remove("hidden");
      throw new Error(disconnected);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  return c.session.ctrl!;
}

function inviteLink(): string {
  return `${location.origin}${location.pathname}?room=${net!.session.roomCode}`;
}

/** Own bodies' positions after our latest tick: a jump away from these means a server correction. */
const predicted = new Map<number, [number, number, number]>();
function notePredicted() {
  predicted.clear();
  for (const id of ctrl.pawnIds) {
    const p = sim.pawns.get(id);
    if (p) predicted.set(id, [p.state.x, p.state.y, p.state.z]);
  }
}

/** Visual-only offsets that hide small correction snaps by fading them out (the simulation snaps at once). */
const smoothing = new Map<number, [number, number, number]>();
let seenCorrections = 0;
/** Further than this is a teleport or respawn: jump straight there. */
const SNAP_DISTANCE = 2;
const SMOOTH_SECONDS = 0.1;

/**
 * Once per frame online: take on a new body when the server has sent one, and turn any correction
 * since the last frame into a fading visual offset. False while we have no body to predict.
 */
/** No snapshot for this long (they come 32 times a second) means the connection is dead even if TCP hasn't noticed. */
const SILENT_MS = 5000;

function followServer(elapsed: number): boolean {
  const s = net!.session;
  if (!disconnected && s.lastSnapshotAt && performance.now() - s.lastSnapshotAt > SILENT_MS) {
    disconnected = "Lost connection to the server.";
    net!.close();
  }
  if (disconnected || !s.ready || !s.ctrl || !sim.pawns.has(s.ctrl.possessedPawnId)) return false;
  if (rosterChanged) {
    rosterChanged = false;
    // Other players' views are rebuilt with their (new) name tags.
    for (const [id, v] of pawnViews)
      if (sim.pawns.get(id)?.proxy !== false) {
        v.dispose();
        pawnViews.delete(id);
      }
    if (!$(".pause").classList.contains("hidden")) renderPause();
  }
  if (s.ctrl !== ctrl) {
    // A new body (respawn, operator pick).
    ctrl = s.ctrl;
    operatorId = ctrl.operatorId;
    op = data.operators.get(operatorId)!;
    const p = possessed();
    controls.setView(p.state.yaw, 0);
    controls.resetStance(p.state.stance);
    viewedId = sim.viewedPawnId(ctrl.id);
    possessedId = ctrl.possessedPawnId;
    smoothing.clear();
    snapshotAll();
    notePredicted();
    seenCorrections = s.stats.corrections;
    if (!$(".pause").classList.contains("hidden")) renderPause();
  }
  if (s.stats.corrections !== seenCorrections) {
    seenCorrections = s.stats.corrections;
    for (const id of ctrl.pawnIds) {
      const p = sim.pawns.get(id);
      const before = predicted.get(id);
      if (!p || !before) continue;
      const d: [number, number, number] = [before[0] - p.state.x, before[1] - p.state.y, before[2] - p.state.z];
      if (Math.hypot(...d) > SNAP_DISTANCE) {
        smoothing.delete(id);
        prevStates.set(id, { ...p.state });
        continue;
      }
      const o = smoothing.get(id) ?? [0, 0, 0];
      smoothing.set(id, [o[0] + d[0], o[1] + d[1], o[2] + d[2]]);
      // Shift the previous tick too, so the blend between ticks doesn't jump either.
      const prev = prevStates.get(id);
      if (prev) prevStates.set(id, { ...prev, x: prev.x - d[0], y: prev.y - d[1], z: prev.z - d[2] });
    }
    notePredicted();
  }
  const k = Math.exp(-elapsed / SMOOTH_SECONDS);
  for (const [id, o] of smoothing) {
    o[0] *= k;
    o[1] *= k;
    o[2] *= k;
    if (Math.hypot(...o) < 1e-3) smoothing.delete(id);
  }
  return true;
}

function nameOfPawn(id: number): string {
  return net?.session.roster.find((e) => e.pawnIds.includes(id))?.name ?? "";
}

/** One view per body in the simulation: blue for ours, orange with a name tag for everyone else. */
function syncPawnViews() {
  for (const [id, v] of pawnViews)
    if (!sim.pawns.has(id)) {
      v.dispose();
      pawnViews.delete(id);
    }
  for (const pawn of sim.pawns.values())
    if (!pawnViews.has(pawn.id)) pawnViews.set(pawn.id, pawn.proxy ? new PawnView(scene, 0xf97316, nameOfPawn(pawn.id) || undefined) : new PawnView(scene, 0x3b82f6));
}

/** Remember which frame was on screen at a click: the next input claims it (lag compensation rewinds to it). */
function noteClick() {
  if (net?.session.ready) clickViewTick = shownRenderTick;
}

/** One click (the e2e scripts' trigger): Fire goes out for at least one tick. */
function fire() {
  noteClick();
  controls.press("fire");
  controls.release("fire");
}

/** What our own (predicted) weapon just did: a placeholder muzzle flash now; Phase 3's client milestone adds the rest. */
function onWeaponEvents(events: readonly SimEvent[]) {
  fx.own(events, ctrl.pawnIds, ownMuzzle, performance.now(), (slot) => possessed()?.loadout?.weapons[slot].suppressed ?? false);
  for (const e of events) {
    if (e.kind === "shot" && e.pawnId === ctrl.possessedPawnId) viewmodel.shot(performance.now(), possessed().loadout?.weapons[e.slot].suppressed ?? false);
    else if (e.kind === "dry" && e.pawnId === ctrl.possessedPawnId) flash("Empty", "info");
    else if (e.kind === "kick" && e.pawnId === sim.viewedPawnId(ctrl.id)) {
      tickKick.yaw += e.dYaw;
      tickKick.pitch += e.dPitch;
    }
  }
}

const shotMarks: { line: THREE.Line; ghost: PawnView | null; until: number }[] = [];
showShot = (shot: ShotResult) => {
  const end = shot.hit?.distance ?? shot.wallDistance ?? 60;
  const [ox, oy, oz] = shot.origin;
  const [dx, dy, dz] = shot.dir;
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ox, oy - 0.05, oz), new THREE.Vector3(ox + dx * end, oy + dy * end, oz + dz * end)]),
    new THREE.LineBasicMaterial({ color: shot.hit ? 0xff3b3b : 0xffffff, depthTest: false, transparent: true }),
  );
  line.renderOrder = 11;
  scene.add(line);
  let ghost: PawnView | null = null;
  let targetName: string | null = null;
  if (shot.hit) {
    // Where the server judged the target to be (rewound to what we saw): a green wireframe.
    const was = net!.session.remoteAt(shot.hit.pawnId, shot.rewoundTick);
    if (was) {
      ghost = new PawnView(scene, 0x22c55e, undefined, 0x22c55e);
      ghost.update(sim.data, was);
      ghost.body.visible = false;
    }
    targetName = nameOfPawn(shot.hit.pawnId) || "player";
    const rewoundMs = ((shot.serverTick - shot.rewoundTick) * 1000) / TICK_HZ;
    flash(`Hit ${targetName} · ${shot.hit.part} · ${shot.hit.distance.toFixed(1)} m · server rewound ${rewoundMs.toFixed(0)} ms`, "info");
  } else flash(shot.wallDistance !== null ? `Miss · wall at ${shot.wallDistance.toFixed(1)} m` : "Miss", "info");
  shotMarks.push({ line, ghost, until: performance.now() + 2500 });
  lastShot = { ...shot, targetName };
};

function updateShots(now: number) {
  for (let i = shotMarks.length - 1; i >= 0; i--) {
    const m = shotMarks[i];
    if (now < m.until) continue;
    scene.remove(m.line);
    m.line.geometry.dispose();
    (m.line.material as THREE.Material).dispose();
    m.ghost?.dispose();
    shotMarks.splice(i, 1);
  }
}

// ------------------------------------------------------------------ what the server judged (Phase 3 M6)

const weaponName = (id: string) => data.weapons.get(id)?.name ?? id;
const nameOfCtrl = (id: number) => net?.session.roster.find((e) => e.controllerId === id)?.name ?? "someone";
/** Recent server events for the e2e scripts. */
const recentEvents: GameEvent[] = [];
const feedNames = { ctrl: nameOfCtrl, pawn: nameOfPawn, weapon: weaponName };

function onGameEvents(tick: number, events: GameEvent[]) {
  const me = net!.session.you;
  fx.server(tick, events);
  for (const e of events) {
    recentEvents.push(e);
    if (recentEvents.length > 50) recentEvents.shift();
    const now = performance.now();
    if (e.kind === "hitConfirm") hitMarkers.confirm(now, e);
    else if (e.kind === "damageTaken") {
      // Which way it came from, relative to where you're looking.
      const at = sim.pawns.get(e.pawnId)?.state ?? possessed().state;
      damageHud.hurt(now, e.from ? damageArcDeg(at, controls.yaw, e.from) : null);
    } else {
      const line = feedLine(e, feedNames, { ctrl: me, pawns: ctrl.pawnIds });
      if (line) killFeed.push(line, now);
      if (e.kind === "kill" && e.victimCtrl === me) deathText = deathLine(e, feedNames);
    }
  }
}

/** Hit marker, damage indicator and kill feed fade on their own timers. */
function updateCombatHud(now: number) {
  hitMarkers.update(now);
  damageHud.update(now);
  killFeed.update(now);
}

/** Where our own shots' tracers start: just below and right of the eye. */
function ownMuzzle(): THREE.Vector3 {
  return camera.position.clone().add(new THREE.Vector3(0.12, -0.12, -0.2).applyQuaternion(camera.quaternion));
}

/**
 * Lasers are visible to everyone (weapons_notes.md §4.5): a red dot where each fitted laser points, on the
 * level (placeholder: not on bodies yet).
 */
function updateLasers() {
  const seen = new Set<number>();
  for (const [id, v] of pawnViews) {
    const from = v.laserOrigin();
    const view = drawnView.get(id);
    if (!from || !view) continue;
    const own = id === viewedId && !thirdPerson;
    const [yaw, pitch] = own ? [controls.yaw, controls.pitch] : view;
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const hit = sim.world.castRay(new sim.R.Ray(from, dir), 60, true, undefined, QUERY_BULLET);
    if (!hit) continue;
    let dot = laserDots.get(id);
    if (!dot) {
      dot = new THREE.Sprite(laserMat);
      dot.scale.setScalar(0.035);
      scene.add(dot);
      laserDots.set(id, dot);
    }
    dot.position.copy(from).addScaledVector(dir, hit.timeOfImpact - 0.01);
    dot.visible = true;
    seen.add(id);
  }
  for (const [id, dot] of laserDots) if (!seen.has(id)) dot.visible = false;
}

/** A remote player's gun position as drawn now (eye height, a little forward). */
function remoteMuzzle(pawnId: number): THREE.Vector3 | null {
  const st = net?.session.remoteAt(pawnId, shownRenderTick);
  if (!st) return null;
  const eye = eyePose(data.movement, data.hitboxes, st).pos;
  return new THREE.Vector3(eye[0] - Math.sin(st.yaw) * 0.4, eye[1] - 0.1, eye[2] - Math.cos(st.yaw) * 0.4);
}

/** Lab tools: refill your weapons, or hurt yourself to try damage and death alone. */
function labRefill() {
  if (net) return net.send(encodeLabTool({ kind: "refill" }));
  for (const id of ctrl.pawnIds) {
    const p = sim.pawns.get(id);
    if (!p?.loadout) continue;
    const [a, b] = p.loadout.weapons.map(spawnAmmo);
    Object.assign(p.state, { loaded0: a.loaded, reserve0: a.reserve, loaded1: b.loaded, reserve1: b.reserve });
  }
}
function labHurt(amount: number) {
  const p = possessed();
  if (net) return net.send(encodeLabTool({ kind: "damage", pawnId: p.id, amount, kill: false }));
  const r = applyDamage(sim, p, { amount, kill: false });
  if (r.outcome !== "ignored") {
    damageHud.hurt(performance.now(), null);
    if (r.outcome === "killed") deathText = "You died";
  }
}

let bytesSeen = { in: 0, out: 0 };
function updateNetStats(ms: number) {
  const s = net!.session;
  const kbps = (bytes: number) => ((bytes * 8) / ms).toFixed(0); // bits per ms = kbit/s
  $(".net").textContent = [
    `room ${s.roomCode} · ${s.roster.length} here`,
    `ping ${Math.round(s.rttMs)} ms${conditions.rttMs || conditions.jitterMs || conditions.lossPct ? ` (simulated +${conditions.rttMs} ms${conditions.jitterMs ? `, ±${conditions.jitterMs}` : ""}${conditions.lossPct ? `, ${conditions.lossPct} % loss` : ""})` : ""}`,
    `others drawn ${Math.round(s.interpDelayMs)} ms (${((s.interpDelayMs / 1000) * TICK_HZ).toFixed(1)} ticks) behind`,
    `corrections ${s.stats.corrections}`,
    `↓${kbps(s.stats.bytesIn - bytesSeen.in)} ↑${kbps(s.stats.bytesOut - bytesSeen.out)} kbps`,
  ].join(" · ");
  bytesSeen = { in: s.stats.bytesIn, out: s.stats.bytesOut };
}

requestAnimationFrame(frame);
