// Movement Lab (PLAN §7, Phase 1): an offline test yard for every movement mechanic. The same shared
// simulation the server will run steps here at 64 Hz; rendering interpolates between ticks.
import * as THREE from "three";
import {
  Btn,
  DEG,
  DT,
  eyePose,
  lerp,
  loadGameData,
  PawnMode,
  Sim,
  Stance,
  wrapAngle,
  type InputCmd,
  type Pawn,
  type PawnState,
} from "@redmond/shared";
import { Controls, type UiAction } from "../input/controls.js";
import { horizontalFov, keyLabel, loadSettings, saveSettings, type HoldMode, type Settings } from "../input/settings.js";
import { isTouchDevice, mountTouchControls } from "../input/touch.js";
import { createLabScene, createRenderer, PawnView, updateLabels } from "../render/labScene.js";

// ------------------------------------------------------------------ setup

const params = new URLSearchParams(location.search);
const autotest = params.has("autotest");
const data = loadGameData();
const operatorId = data.operators.has(params.get("op") ?? "") ? params.get("op")! : "sledge";
const op = data.operators.get(operatorId)!;

const app = document.getElementById("app")!;
app.innerHTML = `
  <div id="view"></div>
  <div class="crosshair"></div>
  <div class="hud hud-tl">
    <div class="op-name"></div>
    <div class="hp"><div class="hp-fill"></div><span class="hp-text"></span></div>
  </div>
  <div class="hud hud-tr"><span class="fps"></span></div>
  <div class="hud hud-bottom">
    <div class="stances"><span data-s="0">STAND</span><span data-s="1">CROUCH</span><span data-s="2">PRONE</span></div>
    <div class="stance-bar"><div></div></div>
    <div class="readout"></div>
  </div>
  <div class="lean-ind lean-l">◀</div><div class="lean-ind lean-r">▶</div>
  <div class="flash"></div>
  <div class="prompt hidden"></div>
  <div class="shellcam hidden"><div class="shellcam-title"></div><div class="swap-bar"><div></div></div></div>
  <div class="center-msg hidden"></div>
  <button class="gear" title="Settings">⚙</button>
  <div class="panel pause hidden"></div>
  <div class="panel help hidden"></div>`;
const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;

const sim = await Sim.create("movement_lab", data);
const ctrl = sim.addPlayer("you", operatorId);
const possessed = () => sim.pawns.get(ctrl.possessedPawnId)!;

const view = $("#view");
const renderer = createRenderer(view);
const scene = createLabScene(sim.level);
let settings: Settings = loadSettings();
const camera = new THREE.PerspectiveCamera(settings.fovVertical, view.clientWidth / view.clientHeight, 0.05, 300);
camera.rotation.order = "YXZ";

const pawnViews = new Map<number, PawnView>();
for (const pawn of sim.pawns.values()) pawnViews.set(pawn.id, new PawnView(scene, 0x3b82f6));

let showHitboxes = false;
let thirdPerson = false;
const controls = new Controls(settings, onUi);
controls.yaw = possessed().state.yaw;
controls.attach(renderer.domElement);
const touch = isTouchDevice();
const touchLayer = touch ? mountTouchControls(app, controls) : null;

addEventListener("resize", () => {
  renderer.setSize(view.clientWidth, view.clientHeight);
  camera.aspect = view.clientWidth / view.clientHeight;
  camera.updateProjectionMatrix();
  renderPause();
});

// ------------------------------------------------------------------ UI actions

function onUi(a: UiAction) {
  if (a === "hitboxes") showHitboxes = !showHitboxes;
  else if (a === "thirdPerson") thirdPerson = !thirdPerson;
  else if (a === "help") $(".help").classList.toggle("hidden");
  else if (a === "settings") togglePause();
  else if (a === "respawn") respawn();
}

function respawn() {
  sim.respawn(ctrl.possessedPawnId);
  controls.setView(possessed().state.yaw, 0);
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
  sim.teleport(ctrl.possessedPawnId, x, y, z, yaw);
  controls.setView(yaw * DEG, 0);
  snapshotAll();
}

function togglePause(force?: boolean) {
  const pause = $(".pause");
  const show = force ?? pause.classList.contains("hidden");
  pause.classList.toggle("hidden", !show);
  if (show) {
    renderPause();
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && !touch && !autotest) togglePause(true);
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
  const opts = (side: string) =>
    [...data.operators.values()]
      .filter((o) => o.side === side)
      .map((o) => `<option value="${o.id}" ${o.id === operatorId ? "selected" : ""}>${o.name} — ${o.healthRating} health / ${o.speedRating} speed</option>`)
      .join("");
  pause.innerHTML = `
    <h2>Movement Lab</h2>
    ${touch ? "" : `<button class="primary resume">Resume (click)</button>`}
    <section><h3>Operator</h3>
      <select class="op-select"><optgroup label="Attackers">${opts("attacker")}</optgroup><optgroup label="Defenders">${opts("defender")}</optgroup></select>
      ${op.pawns > 1 ? `<p class="note">${op.name} has two shells: press <kbd>${keyLabel(settings.keys.ability)}</kbd> to look through the other shell's camera, then <kbd>${keyLabel(settings.keys.interact)}</kbd> to transfer (1.3 s + 1.3 s).</p>` : ""}
    </section>
    <section><h3>Go to</h3><div class="goto">${GOTO.map((g, i) => `<button data-goto="${i}">${g[0]}</button>`).join("")}</div></section>
    <section><h3>Controls</h3>
      <label>Sensitivity <input type="range" min="0.01" max="0.4" step="0.005" value="${settings.sensitivity}" data-num="sensitivity"><output>${settings.sensitivity.toFixed(3)}</output></label>
      <label>ADS sensitivity × <input type="range" min="0.2" max="1.5" step="0.05" value="${settings.adsSensitivityScale}" data-num="adsSensitivityScale"><output>${settings.adsSensitivityScale.toFixed(2)}</output></label>
      <label>Vertical FOV <input type="range" min="60" max="90" step="1" value="${settings.fovVertical}" data-num="fovVertical"><output>${settings.fovVertical}° (${hfov}° horizontal)</output></label>
      <label><input type="checkbox" data-bool="invertY" ${settings.invertY ? "checked" : ""}> Invert Y</label>
      <label><input type="checkbox" data-bool="rawInput" ${settings.rawInput ? "checked" : ""}> Raw mouse input</label>
      ${modeSel("crouchMode", "Crouch")} ${modeSel("proneMode", "Prone")} ${modeSel("leanMode", "Lean")} ${modeSel("adsMode", "Aim (ADS)")}
    </section>
    <p class="note">Press <kbd>F1</kbd> for the key list and what to try.</p>`;
  pause.querySelector(".resume")?.addEventListener("click", () => controls.lockPointer(renderer.domElement));
  pause.querySelector<HTMLSelectElement>(".op-select")!.addEventListener("change", (e) => {
    const url = new URL(location.href);
    url.searchParams.set("op", (e.target as HTMLSelectElement).value);
    location.href = url.toString();
  });
  pause.querySelectorAll<HTMLButtonElement>("[data-goto]").forEach((b) =>
    b.addEventListener("click", () => {
      goTo(Number(b.dataset.goto));
      if (!touch) controls.lockPointer(renderer.domElement);
      else togglePause(false);
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
let prompt: ReturnType<Sim["prompt"]> = null;
let last = performance.now();
let flashUntil = 0;

function tick() {
  snapshotAll();
  const input = autotest ? autoInput(++seq) : controls.sample(++seq);
  sim.step(new Map([[ctrl.id, input]]));
  const p = possessed();
  // The view follows the body you're looking through (Skopós' other shell while on its camera).
  const nowViewed = sim.viewedPawnId(ctrl.id);
  const v = sim.pawns.get(nowViewed)!;
  if (nowViewed !== viewedId) {
    viewedId = nowViewed;
    controls.setView(v.state.yaw, v.state.pitch);
  } else {
    controls.syncView(v.state.yaw, v.state.pitch);
  }
  prompt = sim.prompt(ctrl.id);
  if (p.state.lastFallDamage > 0) flash(`-${p.state.lastFallDamage} HP (fall)`, "bad");
  observe(p);
}

function interpolated(p: Pawn, alpha: number): PawnState {
  const a = prevStates.get(p.id) ?? p.state;
  const b = p.state;
  const sameStance = a.stance === b.stance && a.stanceFrom === b.stanceFrom;
  return {
    ...b,
    x: lerp(a.x, b.x, alpha),
    y: lerp(a.y, b.y, alpha),
    z: lerp(a.z, b.z, alpha),
    lean: lerp(a.lean, b.lean, alpha),
    stanceT: sameStance ? lerp(a.stanceT, b.stanceT, alpha) : b.stanceT,
    yaw: a.yaw + wrapAngle(b.yaw - a.yaw) * alpha,
  };
}

let frames = 0;
let fpsFrames = 0;
let fpsAt = performance.now();
function frame(now: number) {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= DT) {
    acc -= DT;
    tick();
  }
  const alpha = acc / DT;

  const me = possessed();
  const viewed = sim.pawns.get(viewedId) ?? me;
  for (const pawn of sim.pawns.values()) {
    const v = pawnViews.get(pawn.id)!;
    const rs = interpolated(pawn, alpha);
    v.update(data, rs);
    const eyes = pawn.id === viewed.id;
    v.body.visible = !eyes || thirdPerson;
    v.wire.visible = showHitboxes && (!eyes || thirdPerson);
  }

  const rs = interpolated(viewed, alpha);
  const eye = eyePose(data.movement, { ...rs, yaw: controls.yaw });
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
  frames++;
  fpsFrames++;
  if (now - fpsAt > 500) {
    $(".fps").textContent = `${Math.round((fpsFrames * 1000) / (now - fpsAt))} fps · tick ${sim.tick}`;
    fpsFrames = 0;
    fpsAt = now;
  }
  updateHud(me);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ HUD

const STANCE_NAMES = ["STAND", "CROUCH", "PRONE"];
const MODE_NAMES = ["", "VAULT", "LADDER", "DEAD"];
function updateHud(p: Pawn) {
  const s = p.state;
  $(".op-name").textContent = `${op.name} · ${op.side} · ${op.healthRating} health / ${op.speedRating} speed${op.pawns > 1 ? ` · shell ${ctrl.pawnIds.indexOf(p.id) + 1}/2` : ""}`;
  $(".hp-fill").style.width = `${(100 * s.hp) / s.maxHp}%`;
  $(".hp-text").textContent = `${s.hp} / ${s.maxHp}`;
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
  const needClick = !touch && !autotest && !document.pointerLockElement && $(".pause").classList.contains("hidden");
  msg.classList.toggle("hidden", !dead && !needClick);
  msg.textContent = dead ? `You died from the fall — press ${keyLabel(settings.keys.respawn)} to respawn` : "Click to play · F1 for controls";
  if (touchLayer) touchLayer.querySelector(".touch-btn")!.classList.toggle("on", controls.sprintIsLatched);

  const k = settings.keys;
  const promptText =
    prompt === "mantle" ? `${keyLabel(k.vault)} to mantle` : prompt === "ladder" ? `${keyLabel(k.interact)} to climb` : prompt === "transfer" ? `${keyLabel(k.interact)} to transfer` : "";
  $(".prompt").textContent = promptText;
  $(".prompt").classList.toggle("hidden", !promptText || dead);
  const onCam = ctrl.shellCam || ctrl.swapPhase !== 0;
  $(".shellcam").classList.toggle("hidden", !onCam);
  if (onCam) {
    const params = op.ability.params;
    const dur = ctrl.swapPhase === 1 ? (params.transferSeconds ?? 1.3) : (params.activationSeconds ?? 1.3);
    $(".shellcam-title").textContent =
      ctrl.swapPhase === 1 ? "TRANSFERRING…" : ctrl.swapPhase === 2 ? "ACTIVATING SHELL…" : `SHELL CAMERA · ${keyLabel(k.ability)} to go back`;
    $(".swap-bar").classList.toggle("hidden", ctrl.swapPhase === 0);
    $(".swap-bar div").style.width = `${Math.min(100, (100 * ctrl.swapT) / dur)}%`;
  }
  $(".flash").classList.toggle("show", performance.now() < flashUntil);
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
  done: !autotest,
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
    return { seq: n, forward: 0, strafe: 0, yaw: s.yaw, pitch: 0, buttons: 0, stance: s.stance, lean: 1 };
  }
  const ph = PHASES[phase];
  if (phaseTick === 0) ph.setup?.();
  phaseTick++;
  const { yawDeg, ...rest } = ph.input;
  const yaw = yawDeg !== undefined ? yawDeg * DEG : 0;
  controls.yaw = yaw;
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

requestAnimationFrame(frame);
