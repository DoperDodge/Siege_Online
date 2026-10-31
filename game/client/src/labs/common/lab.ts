// A lab page (PLAN §7 and §17; the Movement Lab since Phase 1, the Range Lab from Phase 3 M10): a level to
// try things in, with the HUD, pause menu, loadouts and lab tools. Offline, the shared simulation steps
// here at 64 Hz. Online (Phase 2, `?online` or `?room=CODE`), the server runs it and this page predicts your
// own movement and interpolates everyone else's (PLAN §5). Each page passes its level and what's special
// about it (startLab's options). A map (a level with storeys) also gets the storey views, a HUD line with
// the room and plan position, and Go to by storey and room (tools/mapgen/DESIGN.md E9).
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
  encodeCallout,
  droneEye,
  eyePose,
  GRIPS,
  isDowned,
  resolveLoadout,
  QUERY_STATIC,
  raycastLevel,
  SIGHTS,
  UNDERBARRELS,
  lerp,
  loadedOf,
  loadGameData,
  PawnKind,
  PawnMode,
  poseHitboxes,
  proneWeight,
  reserveOf,
  ropeOf,
  ropeYawRange,
  stanceKeyOf,
  Sim,
  sideTeam,
  spawnAmmo,
  spreadCone,
  Stance,
  TICK_HZ,
  ticks,
  wrapAngle,
  zoneBoxes,
  type IndexedOp,
  type InputCmd,
  type Pawn,
  type PanelChange,
  type PawnState,
  type PlayerController,
  upsideDown,
  type LoadoutPick,
  type ResolvedWeapon,
  type GameData,
  type GameEvent,
  type ShotResult,
  type SimEvent,
  type WeaponPick,
  WeaponAct,
  GadgetServer,
  GadgetAct,
  GFlag,
  kindId,
  handSlot,
  isDetonator,
  placeSpotFor,
  slotGadget,
  type GadgetData,
} from "@redmond/shared";
import { Controls, type Action, type UiAction } from "../../input/controls.js";
import { horizontalFov, keyLabel, loadSettings, saveSettings, type HoldMode, type Settings } from "../../input/settings.js";
import { isTouchDevice, mountTouchControls, preventPageZoom } from "../../input/touch.js";
import { LocalSocket } from "../../net/local.js";
import { OnlineConnection } from "../../net/online.js";
import { createLabScene, createRenderer, PawnView, updateLabels, warmShaders } from "../../render/labScene.js";
import { BpCameraModels, CameraModels } from "../../render/cameraModels.js";
import { GadgetModels } from "../../render/gadgetModels.js";
import { PanelView } from "../../render/panelView.js";
import { StoreyView, type Palette } from "../../render/storeyView.js";
import { MapMarkers } from "../../render/mapMarkers.js";
import { FxBus } from "../../render/fxBus.js";
import { Viewmodel } from "../../render/viewmodel.js";
import { AmmoHud } from "../../ui/ammo.js";
import { adsFov, Crosshair, spreadGapPx } from "../../ui/crosshair.js";
import { damageArcDeg, DamageIndicator } from "../../ui/damage.js";
import { escapeHtml } from "../../ui/dom.js";
import { DownedHud } from "../../ui/downed.js";
import { HitMarkers } from "../../ui/hitMarkers.js";
import { IntelHud } from "../../ui/intel.js";
import { deathLine, feedLine, KillFeed } from "../../ui/killFeed.js";
import { StatsOverlay } from "../../ui/stats.js";
import { goToMenu, WhereHud } from "../../ui/where.js";
import { changedGadget, changedPick, gadgetRow, saveLoadout, savedLoadout, SLOTS, weaponRow, type Slot } from "../../ui/loadout.js";

/** What scripts and page additions can reach in a running lab. */
export interface LabHandle {
  readonly sim: Sim;
  /** Your controller (it changes when you get a new body online). */
  readonly ctrl: PlayerController;
}

/** One step of the offline `?autotest` run: scripted input for some ticks, with a setup and a check. */
export interface AutotestPhase {
  ticks: number;
  input: Partial<InputCmd> & { yawDeg?: number };
  setup?(lab: LabHandle): void;
  after?(p: Pawn, lab: LabHandle): void;
}

/** The offline `?autotest` run (tools/e2e): phases of scripted input, then `report.done`. */
export interface AutotestScript {
  phases: AutotestPhase[];
  /** Called every tick with your body, to record what happened. */
  observe?(p: Pawn, frames: number): void;
  /** What the run found: window.__lab.report (the lab adds ready, done, frames and webgl). */
  report: Record<string, unknown>;
}

export interface LabOptions {
  /** The level, offline and for rooms this page creates. */
  levelId: string;
  /** Name in the pause menu and the lobby. */
  title: string;
  /** This page's path (the lobby's link back to it offline). */
  page: string;
  /**
   * The pause menu's "Go to" spots: name, x, y, z, yaw in degrees. On a level with rooms the menu lists every
   * room by storey (ui/where.ts goToMenu) and files these under the storey at their height, after its rooms.
   */
  goTo: [string, number, number, number, number][];
  /** The help panel's "Try this" list (HTML), and a note under it. */
  help: { tryThis: string[]; note: string };
  autotest?: AutotestScript;
  /**
   * Offline: the simulation steps in this page ("sim", the Movement Lab), or the page gets a room of its own
   * in a Web Worker ("local", the Range Lab: hits, downs and dummies are the server's side, DECISIONS D-052).
   */
  offline?: "sim" | "local";
  /**
   * A match (Phase 6, match/DESIGN.md §11): always online, a room joined from the link (`?room=CODE`) or created
   * with `?format=<mode id>`. You often have no body (the lobby and planning screens, an attacker in prep, after
   * dying): the camera is then the page's (LabApi.spectate). No lab tools, Go to, free camera or storey views.
   */
  match?: boolean;
  /** What this page adds (the Range Lab's shot overlay, damage numbers and last-shot panel). */
  extend?(lab: LabApi): void;
}

/** Where a match page's camera looks while you have no living body (LabApi.spectate). */
export type SpectateView =
  /** Through another body's eyes (a teammate, after you die). */
  | { kind: "pawn"; pawnId: number }
  /** From a fixed spot (feet there, eye above); the mouse looks around (an attacker's spawn in prep). */
  | { kind: "spot"; pos: [number, number, number]; yawDeg: number }
  /** Over the whole map, turning slowly (the lobby and the planning screen). */
  | { kind: "overview" };

/** What a page's additions can reach in the running lab (LabOptions.extend). */
export interface LabApi extends LabHandle {
  readonly data: GameData;
  /** The HUD's root element. */
  readonly app: HTMLElement;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** The room connection (the server's, or the page's own offline room); null with the bare simulation. */
  readonly net: OnlineConnection | null;
  /** The weapon in your hands. */
  weapon(): ResolvedWeapon | null;
  /** The weapon in your hands when an input of yours was sent (the one its shot fired), by its 16-bit seq. */
  weaponAt(seq16: number): ResolvedWeapon | null;
  /** The render tick an input of yours claimed to be looking at (lag compensation), by its 16-bit seq. */
  claimedViewTick(seq16: number): number | null;
  /** The server's readout of each of your shots (lab rooms). */
  onShot(fn: (shot: ShotResult) => void): void;
  /** Each tick's server events. */
  onEvents(fn: (tick: number, events: GameEvent[]) => void): void;
  /** Every frame, with everything posed and before drawing; `renderTick` is the moment others are drawn at. */
  onFrame(fn: (now: number, renderTick: number) => void): void;
  /** A key the lab itself leaves free (e.g. F2). */
  onKey(code: string, fn: () => void): void;
  /** A button under Lab tools in the pause menu, and a row in the help panel. */
  addLabTool(label: string, run: () => void): void;
  /** Match pages: a button in the pause menu's room section while `label()` gives one (null: not now). */
  addMatchTool(label: () => string | null, run: () => void): void;
  addHelp(keys: string, what: string): void;
  /** A short message in the middle of the screen. */
  flash(text: string, kind: "bad" | "info"): void;
  /** Your body if you have one and it is alive (match pages show their screens when you don't). */
  body(): Pawn | null;
  /** Match pages: where the camera looks while you have no living body (null: over the map). */
  spectate(fn: () => SpectateView | null): void;
  /** Let go of the mouse without opening the pause menu (a match screen that needs the pointer). */
  releasePointer(): void;
}

/** A match page's stand-in controller while you have no body: it controls no pawns, so nothing of yours is ever found. */
const NO_BODY: PlayerController = { id: 0, name: "", operatorId: "sledge", pawnIds: [], possessedPawnId: 0, drone: 0, prevLean: 0, cam: 0, camYaw: 0, camPitch: 0, shellCam: false, swapPhase: 0, swapT: 0, swapCooldown: 0, prevButtons: 0, team: 0 };

export async function startLab(o: LabOptions): Promise<void> {
  // ------------------------------------------------------------------ setup

  const params = new URLSearchParams(location.search);
  const autotest = params.has("autotest");
  const online = o.match === true || params.has("online") || params.has("room");
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
    <div class="hud hud-br"><div class="weapon-name"></div><div class="ammo"><span class="ammo-loaded"></span><span class="ammo-reserve"></span></div><div class="weapon-state"></div><div class="gadget-line"></div></div>
    <div class="hud hud-bottom">
      <div class="stances"><span data-s="0">STAND</span><span data-s="1">CROUCH</span><span data-s="2">PRONE</span></div>
      <div class="stance-bar"><div></div></div>
      <div class="readout"></div>
    </div>
    <div class="lean-ind lean-l">◀</div><div class="lean-ind lean-r">▶</div>
    <div class="flash"></div>
    <div class="stun-white"></div><div class="emp-static hidden"></div>
    <div class="prompt hidden"></div>
    <div class="shellcam hidden"><div class="shellcam-title"></div><div class="swap-bar"><div></div></div></div>
    <div class="dronecam hidden"><div class="dronecam-title"></div><div class="feeds"></div></div>
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
  /** Pings, spotted enemies, the comm wheel and the scan's gauge (Phase 7 M4). */
  const intelHud = new IntelHud(app, data.intel.callouts, data.intel.ping.perPlayer);

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
  /** The server's events, once the page is running (a room joined mid-fight replays some while the level loads). */
  let gameEvents: (tick: number, events: GameEvent[]) => void = () => {};
  /** Panel ops the session just applied (debris), once the page is running. */
  let panelEvents: (ops: readonly IndexedOp[], changes: readonly PanelChange[]) => void = () => {};
  /** Online tests can script the input (window.__lab.input). */
  let scripted: Partial<InputCmd> | null = null;
  /**
   * Browser tests' walks (window.__lab.walk): the page steers the body through the points itself, tick by tick,
   * so a walk doesn't depend on how often a slow test can poll; `ticks` counts the ticks it has taken.
   */
  let walkPath: { pts: [number, number][]; k: number; ticks: number; done: boolean } | null = null;
  /** Render tick of the frame on screen (remote players are drawn at it), and of the one last clicked on. */
  let shownRenderTick = 0;
  let clickViewTick: number | null = null;
  /**
   * How a body of yours died, for the respawn message: kept with that body and life, because the kill can
   * arrive a tick before the correction that lays the body down. No text: a fall (which says so itself).
   */
  let death: { pawnId: number; life: number; text: string | null } | null = null;
  /** What each recent input claimed to be looking at (lag compensation) and the weapon in hand then, by its 16-bit seq. */
  const claims = new Map<number, { viewTick: number; weapon: ResolvedWeapon | null }>();
  /** Page additions' hooks (LabOptions.extend). */
  const hooks = {
    shot: [] as ((shot: ShotResult) => void)[],
    events: [] as ((tick: number, events: GameEvent[]) => void)[],
    frame: [] as ((now: number, renderTick: number) => void)[],
    keys: new Map<string, () => void>(),
    tools: [] as { label: string; run: () => void }[],
    matchTools: [] as { label: () => string | null; run: () => void }[],
    help: [] as [string, string][],
  };
  /** A match page's camera while you have no living body (LabApi.spectate). */
  let spectateFn: (() => SpectateView | null) | null = null;
  /** Recoil the viewed body's view took this tick (added to the mouse view so the next input includes it). */
  const tickKick = { yaw: 0, pitch: 0 };
  let flashUntil = 0;
  /** A stun's flash and a fire extinguisher's concussion on us (Phase 8 M3): how white, until when (ms, performance.now()). */
  let stunned: { blind: number; start: number; end: number } | null = null;
  let concussed: { start: number; end: number } | null = null;
  /** Whether our body was EMP'd last frame (the warning shows as it starts). */
  let wasJammed = false;

  // Online: the lobby connects (create or join a room) and the session builds the simulation from the
  // server's Welcome; our controller arrives with the roster. Offline: a local simulation and player.
  const local = !online && o.offline === "local";
  const net = online ? await (o.match ? matchRoom() : lobby()) : local ? await localRoom() : null;
  const sim = net ? net.session.sim! : await Sim.create(o.levelId, data);
  let ctrl: PlayerController = net ? await firstBody(net) : sim.addPlayer("you", operatorId, 0, undefined, pickFromUrl(operatorId));
  /** Your body (Skopós: the shell you control). Only a match page can be without one (NO_BODY), and it checks first. */
  const possessed = () => sim.pawns.get(ctrl.possessedPawnId)!;
  const heldWeapon = (): ResolvedWeapon | null => {
    const p = sim.pawns.get(ctrl.possessedPawnId);
    return p?.loadout?.weapons[p.state.slot] ?? null;
  };
  if (net && !o.match) {
    // The server starts everyone as the default operator; ask for the loadout in the link, if different.
    const wanted = pickFromUrl(operatorId);
    const mine = net.session.roster.find((e) => e.controllerId === ctrl.id);
    if (!mine || JSON.stringify(mine.loadout) !== JSON.stringify(wanted)) net.send(encodePickLoadout(wanted));
    operatorId = ctrl.operatorId;
    op = data.operators.get(operatorId)!;
  }

  const view = $("#view");
  const renderer = createRenderer(view, params.has("lowgfx"));
  const labScene = createLabScene(sim.level);
  const scene = labScene.scene;
  /** Destructible panels, drawn from their cells and redrawn as they change. */
  const panelView = new PanelView(scene, sim.level.panels);
  /**
   * A map's storey views (tools/mapgen/DESIGN.md E9): the storey you're on and its light, the storeys above it
   * hidden (H), the plan view (M), the palette (P). None in a lab without storeys.
   */
  const storeyView = sim.level.def.storeys.length ? new StoreyView(labScene, panelView, sim.level, sim.pawns.get(ctrl.possessedPawnId)?.state.y ?? 0) : null;
  storeyView?.setViewport(view.clientWidth, view.clientHeight);
  /** A map's markers (E9 part 2): bombs, cameras, ingredients and spawns, and the zones view (O). */
  const markers = storeyView ? new MapMarkers(labScene, o.match ? { ...sim.level.def, cameras: [], ingredients: [], spawns: [], zones: [] } : sim.level.def) : null;
  /** On a map with a plan, the HUD line: the room, the storey and where you are in the plan's units (amendment 17); a match's, the room only. */
  const whereHud = sim.level.def.plan ? new WhereHud(app, sim.level.def, o.match) : null;
  if (o.match) {
    // A match shows the bombs, not the lab's labels (wall ids, room callouts), spawn discs or camera cones.
    for (const g of [...labScene.labelGroups, ...labScene.calloutGroups]) g.clear();
    app.classList.add("match");
  }
  // The level is all there: its shadows are drawn at the next render, and again only when it changes.
  renderer.shadowMap.needsUpdate = true;
  // The stats overlay counts every draw of a frame (the world, the viewmodel, a shadow pass), so the counts
  // are reset once a frame rather than at each render call.
  renderer.info.autoReset = false;
  const stats = new StatsOverlay(app, params.has("stats"), () => [
    `static: ${labScene.staticBoxes} boxes in ${labScene.staticMeshes} meshes · panels: ${panelView.meshCount} meshes`,
    `${renderer.domElement.width} × ${renderer.domElement.height} px${renderer.shadowMap.enabled ? "" : " · no shadows (?lowgfx)"}`,
  ]);
  let settings: Settings = loadSettings();
  const camera = new THREE.PerspectiveCamera(settings.fovVertical, view.clientWidth / view.clientHeight, 0.05, 300);
  camera.rotation.order = "YXZ";
  /** The gun in your hands (drawn over the world) and the world's effects: flashes, tracers, bullet marks. */
  const viewmodel = new Viewmodel(data);
  viewmodel.setAspect(camera.aspect);
  const fx = new FxBus(scene, sim, undefined, storeyView ? (y, normalY) => storeyView.markGroup(y, normalY) : undefined);
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
  /** A match's default cameras (Phase 7), drawn whole or broken, and the round's Bulletproof Cameras. */
  const cameraModels = o.match ? new CameraModels(scene, sim.level.def.cameras) : null;
  const bpCameraModels = new BpCameraModels(scene, data.gadgets.get("bulletproof_camera")!.sizeM);
  /** The gadget table (Phase 8): every gadget placed, thrown or dropped; offline, our own server side keeps it. */
  const gadgetModels = new GadgetModels(scene, sim);
  const offlineGadgets = net ? null : new GadgetServer(sim);
  /** Where the placed gadget in hand would go (Phase 8): its outline, green. */
  const outline = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x4ade80, wireframe: true, transparent: true, opacity: 0.8, depthTest: false }));
  outline.visible = false;
  outline.renderOrder = 10;
  scene.add(outline);

  let showHitboxes = false;
  let thirdPerson = false;
  const controls = new Controls(settings, onUi);
  controls.setView(sim.pawns.get(ctrl.possessedPawnId)?.state.yaw ?? 0, 0);
  controls.attach(renderer.domElement);
  controls.isBlocked = () => !$(".pause").classList.contains("hidden") || !$(".help").classList.contains("hidden");
  controls.onDrone = () => ctrl.cam !== 0 || sim.pawns.get(sim.viewedPawnId(ctrl.id))?.kind === PawnKind.Drone;
  // The comm wheel (Phase 7) needs a room to send its callouts to.
  controls.wheelSize = () => (net ? data.intel.callouts.length : 0);
  controls.onCallout = (id) => net?.send(encodeCallout(id));
  controls.stanceLocked = () => {
    const p = sim.pawns.get(ctrl.possessedPawnId);
    return ctrl.shellCam || ctrl.swapPhase !== 0 || (p !== undefined && isDowned(p.state)); // down: the body decides
  };
  controls.weaponState = () => {
    const p = sim.pawns.get(ctrl.possessedPawnId);
    // Down or dead there's no weapon to switch (a request then would fire on its own after a revive).
    const armed = p !== undefined && !isDowned(p.state) && p.state.mode !== PawnMode.Dead;
    return armed && (!net || net.session.ready) ? { slot: p.state.slot, equipping: p.state.wAct === WeaponAct.Equip, zoom: p.loadout?.weapons[p.state.slot].ads.zoom ?? 1, gadget: handSlot(p.state.hand) } : null;
  };

  // ------------------------------------------------------------------ free camera (a lab tool, DESIGN E10)

  /**
   * The free camera: the view flies on its own and through anything, while your body stands where you left it
   * (it gets no input). N goes back to your body; the use key puts your body on the floor under the camera.
   */
  let freeCam: THREE.Vector3 | null = null;
  /** Metres a second, and how many times faster with sprint held. */
  const FLY_MPS = 8;
  const FLY_FAST = 4;

  function setFreeCam(on: boolean, putBody = false) {
    const p = sim.pawns.get(ctrl.possessedPawnId);
    if (on === (freeCam !== null) || !p) return;
    if (on) {
      freeCam = camera.position.clone();
      flash(`Free camera: N goes back to your body, ${keyLabel(settings.keys.interact)} puts it here`, "info");
    } else {
      const at = freeCam!;
      if (putBody) {
        // On the floor under the camera, lifted up to a step until a standing body fits (a slope); over
        // nothing, an eye's height below the camera. In a wall, or with no room to stand, the camera stays.
        const hit = sim.world.castRay(new sim.R.Ray({ x: at.x, y: at.y, z: at.z }, { x: 0, y: -1, z: 0 }), 200, true, undefined, QUERY_STATIC);
        const floor = hit ? at.y - hit.timeOfImpact : at.y - data.movement.stance.stand.eye;
        const lifts = hit?.timeOfImpact === 0 ? [] : [0, 0.1, 0.2, data.movement.step.maxStepHeight];
        const y = lifts.map((d) => floor + d).find((y) => sim.standsFree(at.x, y, at.z));
        if (y === undefined) {
          flash("No room to stand under the camera", "bad");
          return;
        }
        freeCam = null;
        const yawDeg = controls.yaw / DEG;
        if (net) net.send(encodeLabTool({ kind: "teleport", x: at.x, y, z: at.z, yawDeg }));
        else sim.teleport(ctrl.possessedPawnId, at.x, y, at.z, yawDeg);
        controls.setView(controls.yaw, controls.pitch);
        snapshotAll();
      } else {
        freeCam = null;
        // Back to the view you left: Skopós' other shell, if you were looking through it.
        const v = sim.pawns.get(sim.viewedPawnId(ctrl.id)) ?? p;
        controls.setView(v.state.yaw, v.state.pitch);
      }
      controls.resetStance(putBody ? Stance.Stand : stanceKeyOf(p.state));
    }
    if (!$(".pause").classList.contains("hidden")) renderPause();
  }

  /** Fly: the movement keys (or the touch stick) along the view, the vault key up and crouch down. */
  function flyFreeCam(dt: number) {
    if (!freeCam || controls.isBlocked()) return;
    const h = (a: Action) => (controls.isHeld(a) ? 1 : 0);
    const [forward, right, up] = [h("forward") - h("back") + controls.touchMove.y, h("right") - h("left") + controls.touchMove.x, h("vault") - h("crouch")];
    if (!forward && !right && !up) return;
    const look = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(controls.pitch, controls.yaw, 0, "YXZ"));
    const side = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, controls.yaw, 0, "YXZ"));
    const move = look.multiplyScalar(forward).add(side.multiplyScalar(right));
    move.y += up;
    // Full speed on a key; the touch stick's tilt sets a fraction of it.
    const speed = Math.min(1, move.length()) * FLY_MPS * (controls.isHeld("sprint") || controls.sprintIsLatched ? FLY_FAST : 1);
    freeCam.add(move.normalize().multiplyScalar(speed * dt));
  }

  /**
   * In the free camera your body gets no input: it stands as it was, and the view it gives (Skopós' other
   * shell's, on its camera) looks where it looked.
   */
  function still(input: InputCmd): InputCmd {
    const p = sim.pawns.get(ctrl.possessedPawnId);
    if (!freeCam || !p) return input;
    const v = sim.pawns.get(sim.viewedPawnId(ctrl.id)) ?? p;
    return { ...input, forward: 0, strafe: 0, buttons: 0, yaw: v.state.yaw, pitch: v.state.pitch, stance: stanceKeyOf(p.state), lean: 0 };
  }

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
  preventPageZoom();
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
    storeyView?.setViewport(view.clientWidth, view.clientHeight);
    renderPause();
  });

  // ------------------------------------------------------------------ storey views (a map)

  /** The camera the world is drawn from: yours, or the plan view's. */
  const shownCamera = (): THREE.Camera => (storeyView?.plan ? storeyView.camera : camera);

  /** Switch the storey views (keys, the pause menu, tests); the pause menu, if open, shows the new state. */
  function setStoreyView(v: { hideAbove?: boolean; plan?: boolean; palette?: Palette; zones?: boolean }) {
    if (!storeyView) return;
    if (v.hideAbove !== undefined) storeyView.setHideAbove(v.hideAbove);
    if (v.zones !== undefined) markers?.setZones(v.zones);
    if (v.plan !== undefined) {
      storeyView.setPlan(v.plan);
      app.classList.toggle("plan-view", v.plan); // no crosshair or sights over the plan
    }
    if (v.palette !== undefined) storeyView.setPalette(v.palette);
    if (!$(".pause").classList.contains("hidden")) renderPause();
  }

  /** The storey views' switches by name (their keys, and the pause menu's View buttons). */
  const viewToggles: Record<string, () => void> = {};
  if (storeyView && !o.match) {
    const sv = storeyView;
    Object.assign(viewToggles, {
      hideAbove: () => {
        setStoreyView({ hideAbove: !sv.hideAbove });
        flash(sv.hideAbove ? "Storeys above yours hidden" : "Every storey shown", "info");
      },
      plan: () => {
        setStoreyView({ plan: !sv.plan });
        if (sv.plan) flash("Plan view: the wheel zooms, M goes back", "info");
      },
      palette: () => {
        setStoreyView({ palette: sv.palette === "greybox" ? "neutral" : "greybox" });
        flash(sv.palette === "greybox" ? "Palette: surface classes" : "Palette: neutral", "info");
      },
      zones: () => {
        setStoreyView({ zones: !markers?.zones });
        flash(markers?.zones ? "Zones: rappel faces orange, spawn peeks green, run-outs red" : "Zones hidden", "info");
      },
    });
    hooks.keys.set("KeyH", viewToggles.hideAbove);
    hooks.keys.set("KeyM", viewToggles.plan);
    hooks.keys.set("KeyP", viewToggles.palette);
    hooks.keys.set("KeyO", viewToggles.zones);
    hooks.help.push(
      ["<kbd>H</kbd>", "Hide the storeys above yours (it follows you up and down)"],
      ["<kbd>M</kbd>", "Plan view: your storey from above, north up, centred on you, with the room names; the wheel zooms. You keep moving and turning as usual (W walks the way the arrow points); M again goes back"],
      ["<kbd>P</kbd>", "Palette: the surface classes (soft yellow, hard grey, reinforceable blue, hatch green) or one light grey"],
      ["<kbd>O</kbd>", "Zones: the rappel faces (orange, just outside the walls), the spawn peeks (green, inside the doors and windows that look at a spawn) and the run-outs (red)"],
    );
    // In the plan view the wheel zooms instead of switching weapons.
    controls.wheelTaken = () => sv.plan;
    renderer.domElement.addEventListener(
      "wheel",
      (e) => {
        if (!sv.plan || controls.isBlocked() || e.deltaY === 0) return;
        sv.zoom(e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 33 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? e.deltaY * view.clientHeight : e.deltaY);
      },
      { passive: true },
    );
  }

  if (!o.match) {
    hooks.keys.set("KeyN", () => setFreeCam(freeCam === null));
    // While flying, keys only fly the camera; the use key (or the touch Use button) puts your body here.
    controls.flying = () => freeCam !== null;
    controls.onFlyUse = () => setFreeCam(false, true);
  }

  // ------------------------------------------------------------------ UI actions

  function onUi(a: UiAction) {
    if (o.match && (a === "hitboxes" || a === "thirdPerson" || a === "respawn")) return; // lab tools
    if (a === "hitboxes") showHitboxes = !showHitboxes;
    else if (a === "thirdPerson") thirdPerson = !thirdPerson;
    else if (a === "help") $(".help").classList.toggle("hidden");
    else if (a === "settings") togglePause();
    else if (a === "respawn") respawn();
    else if (a === "fire") noteClick();
    else if (a === "stats") stats.toggle();
  }

  function respawn() {
    if (net) return net.send(encodeLabTool({ kind: "respawn" })); // the server sends the new body
    sim.respawn(ctrl.possessedPawnId);
    controls.setView(possessed().state.yaw, 0);
    controls.resetStance();
    snapshotAll();
  }

  /** The pause menu's Go to: a map's bomb sites and rooms by storey, and the page's own spots (ui/where.ts goToMenu). */
  const GOTO = goToMenu(sim.level.def, o.goTo);
  /** Every entry, in the menu's order (a button's `data-goto` indexes this). */
  const SPOTS = GOTO.flatMap((g) => g.spots);

  function goTo(i: number) {
    const {
      pos: [x, y, z],
      yawDeg: yaw,
    } = SPOTS[i];
    if (net) net.send(encodeLabTool({ kind: "teleport", x, y, z, yawDeg: yaw }));
    else sim.teleport(ctrl.possessedPawnId, x, y, z, yaw);
    controls.setView(yaw * DEG, 0);
    controls.resetStance();
    snapshotAll();
  }

  // ------------------------------------------------------------------ loadout (Phase 3 M4, DECISIONS D-042)

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
  /** The loadout in the link for this operator, else the one you keep for them (ui/loadout.ts; anything invalid becomes their default). */
  function pickFromUrl(opId: string): LoadoutPick {
    const d = savedLoadout(data, opId);
    const gadgets = params.get("gadgets")?.split(",").filter(Boolean);
    const pick = { ...d, primary: parseWeaponParam(params.get("primary")) ?? d.primary, secondary: parseWeaponParam(params.get("secondary")) ?? d.secondary, gadgets: gadgets ?? d.gadgets };
    return resolveLoadout(data, pick).loadout.pick;
  }
  /** Your body if you have one and it is alive (only a match page can be without one). */
  function livingBody(): Pawn | null {
    const p = sim.pawns.get(ctrl.possessedPawnId);
    return p && p.state.mode !== PawnMode.Dead ? p : null;
  }
  /** What the body we're in carries. */
  const currentPick = (): LoadoutPick => sim.pawns.get(ctrl.possessedPawnId)?.loadout?.pick ?? defaultLoadoutPick(data, operatorId);

  function loadoutSection(): string {
    const pick = currentPick();
    const lo = sim.pawns.get(ctrl.possessedPawnId)?.loadout;
    return `<section class="loadout"><h3>Loadout</h3>${SLOTS.map((slot, i) => weaponRow(data, op, slot, pick, lo?.weapons[i] ?? null)).join("")}${gadgetRow(data, op, pick)}
      <p class="note">Changing anything gives you a new body${net ? " (the server spawns it)" : ""}. <span class="unv">?</span> marks a value that is still a placeholder (research/OPEN_QUESTIONS.md).</p></section>`;
  }

  /** A new body with this loadout: offline the page reloads with it in the link; online the server spawns it. */
  function applyLoadout(pick: LoadoutPick) {
    const url = new URL(location.href);
    url.searchParams.set("op", pick.operator);
    for (const slot of SLOTS) url.searchParams.set(slot, weaponParam(pick[slot]));
    url.searchParams.set("gadgets", pick.gadgets.join(","));
    if (!net) {
      location.href = url.toString();
      return;
    }
    history.replaceState(null, "", url); // a reload keeps the pick
    net.send(encodePickLoadout(pick)); // the new body arrives with the roster
  }

  /** Another operator, with the loadout you keep for them (else their default). */
  function pickOperator(id: string) {
    applyLoadout(savedLoadout(data, id));
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

  /** The pointer was let go on purpose (LabApi.releasePointer): no pause menu for it. */
  let releasing = false;
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement) togglePause(false);
    // A lost lock means the mouse was in use, unless a page let it go itself, or a match page has no body to play
    // (its own screens are up).
    else if (!autotest && !releasing && !(o.match && !livingBody())) togglePause(true);
    releasing = false;
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
    const conditionSelects = `
        <label>Simulated extra latency <select data-net="rttMs">${[0, 50, 100, 150, 200].map((ms) => `<option value="${ms}" ${ms === conditions.rttMs ? "selected" : ""}>${ms ? `+${ms} ms round trip` : "Off"}</option>`).join("")}</select></label>
        <label>Simulated jitter <select data-net="jitterMs">${[0, 10, 20, 40].map((ms) => `<option value="${ms}" ${ms === conditions.jitterMs ? "selected" : ""}>${ms ? `up to ${ms} ms each way` : "Off"}</option>`).join("")}</select></label>
        <label>Simulated loss <select data-net="lossPct">${[0, 0.5, 1, 2, 5].map((p) => `<option value="${p}" ${p === conditions.lossPct ? "selected" : ""}>${p ? `${p} % (a 200 ms stall each)` : "Off"}</option>`).join("")}</select></label>`;
    const room = o.match
      ? `<section><h3>Room ${net!.session.roomCode}</h3>
        <div class="goto"><button class="invite">Copy invite link</button>${hooks.matchTools
          .map((t, i) => [t.label(), i] as const)
          .filter(([label]) => label !== null)
          .map(([label, i]) => `<button data-match-tool="${i}">${label}</button>`)
          .join("")}<button class="leave">Leave the match</button></div>${conditionSelects}</section>`
      : local
      ? `<section><h3>Offline room</h3>${conditionSelects}
        <p class="note">This page runs a room of its own (no server): hits, downs and the dummies work exactly as online, and the latency settings above try lag compensation alone. <a href="${o.page}?online">Play online</a> to bring friends.</p></section>`
      : net
        ? `<section><h3>Room ${net.session.roomCode} · ${net.session.roster.filter((e) => e.kind === 0).length} player${net.session.roster.filter((e) => e.kind === 0).length === 1 ? "" : "s"}</h3>
        <div class="goto"><button class="invite">Copy invite link</button><button class="leave">Leave room</button></div>${conditionSelects}
        <p class="note">Shots do real damage now: the server rewinds everyone else to what you saw (lag compensation), and the white line shows where your first pellet went and what it hit first. Headshots kill; friendly fire is on.</p></section>`
        : "";
    /** The lab's own sections: operator and team, loadout, Go to, the storey views and the lab tools. */
    const labSections = () => `
      <section><h3>Operator</h3>
        <select class="op-select"><optgroup label="Attackers">${opts("attacker")}</optgroup><optgroup label="Defenders">${opts("defender")}</optgroup></select>
        ${op.pawns > 1 ? `<p class="note">${op.name} has two shells: press <kbd>${keyLabel(settings.keys.ability)}</kbd> to look through the other shell's camera, then <kbd>${keyLabel(settings.keys.interact)}</kbd> to transfer (${swap.transferSeconds} s + ${swap.activationSeconds} s).</p>` : ""}
        ${net ? `<label>Team <select class="team-select"><option value="0" ${ctrl.team === 0 ? "selected" : ""}>Attackers</option><option value="1" ${ctrl.team === 1 ? "selected" : ""}>Defenders</option></select></label>` : ""}
      </section>
      ${loadoutSection()}
      <section><h3>Go to</h3>${goToHtml()}</section>
      ${
        storeyView
          ? `<section><h3>View</h3><div class="goto">
        <button data-view="hideAbove">${storeyView.hideAbove ? "Show the storeys above (H)" : "Hide the storeys above (H)"}</button>
        <button data-view="plan">${storeyView.plan ? "Leave the plan view (M)" : "Plan view (M)"}</button>
        <button data-view="palette">${storeyView.palette === "greybox" ? "Neutral palette (P)" : "Surface colours (P)"}</button>
        <button data-view="zones">${markers?.zones ? "Hide the zones (O)" : "Show the zones (O)"}</button></div></section>`
          : ""
      }
      <section><h3>Lab tools</h3><div class="goto"><button class="free-cam">${freeCam ? "Back to your body (N)" : "Free camera (N)"}</button><button class="refill">Refill ammo</button><button class="hurt-me">Take 30 damage</button><button class="down-me">Down me</button>${hooks.tools.map((t, i) => `<button data-tool="${i}">${t.label}</button>`).join("")}</div>
        <p class="note">Down but not out: you crawl and bleed out in 60 s (30 s while crawling); a teammate holds ${keyLabel(settings.keys.interact)} for 4 s to revive you with 20 HP. A second down kills.</p></section>`;
    pause.innerHTML = `
      <h2>${o.title}${net && !local ? " · Online" : ""}</h2>
      ${touchOnly ? "" : `<button class="primary resume">Resume (click)</button>`}
      ${room}
      ${o.match ? "" : labSections()}
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
    pause.querySelector(".refill")?.addEventListener("click", labRefill);
    pause.querySelector(".free-cam")?.addEventListener("click", (e) => {
      setFreeCam(freeCam === null);
      resume(e);
    });
    pause.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => b.addEventListener("click", () => hooks.tools[Number(b.dataset.tool)].run()));
    pause.querySelectorAll<HTMLButtonElement>("[data-match-tool]").forEach((b) =>
      b.addEventListener("click", () => {
        hooks.matchTools[Number(b.dataset.matchTool)].run();
        togglePause(false); // a match screen comes next: the mouse stays free
      }),
    );
    pause.querySelector(".hurt-me")?.addEventListener("click", () => labHurt(30));
    pause.querySelector(".down-me")?.addEventListener("click", () => labHurt(possessed().state.hp || 1));
    pause.querySelector<HTMLSelectElement>(".op-select")?.addEventListener("change", (e) => pickOperator((e.target as HTMLSelectElement).value));
    pause.querySelector<HTMLSelectElement>(".team-select")?.addEventListener("change", (e) => net?.send(encodeLabTool({ kind: "team", team: Number((e.target as HTMLSelectElement).value) })));
    pause.querySelectorAll<HTMLSelectElement>(".loadout select").forEach((el) =>
      el.addEventListener("change", () => {
        const pick = el.dataset.gadget !== undefined ? changedGadget(data, currentPick(), Number(el.dataset.gadget), el.value) : changedPick(currentPick(), el.dataset.slot as Slot, el.dataset.part as keyof WeaponPick, el.value);
        saveLoadout(pick); // the loadout you keep for this operator, in matches too
        applyLoadout(pick);
      }),
    );
    pause.querySelector(".invite")?.addEventListener("click", (e) => {
      void navigator.clipboard?.writeText(inviteLink()).then(() => ((e.target as HTMLElement).textContent = "Copied!"));
    });
    pause.querySelector(".leave")?.addEventListener("click", () => {
      net?.close();
      location.href = o.match ? "/play.html" : "/";
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
    pause.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((b) =>
      b.addEventListener("click", (e) => {
        viewToggles[b.dataset.view!]();
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

  /** Go to's buttons: one list, or on a map the bomb sites, then a heading per storey over its rooms and spots. */
  function goToHtml(): string {
    let i = 0;
    return GOTO.map((g) => {
      const buttons = g.spots
        .map((s) => `<button data-goto="${i++}"${s.room ? ` data-room="${escapeHtml(s.room)}"` : ""}${s.site ? ` data-site="${escapeHtml(s.site)}"` : ""}>${escapeHtml(s.name)}</button>`)
        .join("");
      if (g.sites) return `<div class="goto-sites"><h4>Bomb sites</h4><div class="goto">${buttons}</div></div>`;
      return g.storey === null ? `<div class="goto">${buttons}</div>` : `<div class="goto-storey" data-storey="${escapeHtml(g.storey)}"><h4>${escapeHtml(g.storey)}</h4><div class="goto">${buttons}</div></div>`;
    }).join("");
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
        ${row(`<kbd>${keyLabel(k.gadget)}</kbd> / <kbd>${keyLabel(k.ability)}</kbd>`, `Gadgets: take your gadget out (${keyLabel(k.ability)}: Striker's and Sentry's second one) and put it away. Left mouse throws it (right mouse lobs it) or, held, places it where the green outline shows; with a charge out, left mouse sets it off (${keyLabel(k.gadget)} again takes out the next one). Hold <kbd>${keyLabel(k.interact)}</kbd> on one of yours to take it back. Skopós: ${keyLabel(k.ability)} views your other shell's camera (press again to go back)`)}
        ${o.match ? "" : row(`<kbd>${keyLabel(k.respawn)}</kbd>`, "Respawn")}
        ${row("Left mouse", net ? "Fire (hold for automatic weapons). Online, each shot shows what the server's lag compensation hit." : "Fire (hold for automatic weapons)")}
        ${row(`<kbd>${keyLabel(k.reload)}</kbd>`, "Reload")}
        ${row(`<kbd>${keyLabel(k.primary)}</kbd> / <kbd>${keyLabel(k.secondary)}</kbd> / wheel`, "Primary / secondary weapon")}
        ${row(`<kbd>${keyLabel(k.fireMode)}</kbd>`, "Fire mode (auto / burst / single, where the weapon has them)")}
        ${row(`<kbd>${keyLabel(k.melee)}</kbd>`, "Knife: kills anyone in reach in front of you, standing or down (0.6 s a swing)")}
        ${row(`Hold <kbd>${keyLabel(k.interact)}</kbd>`, "Revive a downed teammate (4 s, facing them)")}
        ${net ? row(`<kbd>${keyLabel(k.ping)}</kbd>`, `Ping where you look (from a drone or a camera too): your team sees it through walls for ${data.intel.ping.seconds} s; two quick taps make it a danger ping. Hold it for the comm wheel: point the mouse at a callout and let go`) : ""}
        ${hooks.help.map(([keys, what]) => row(keys, what)).join("")}
        ${o.match ? "" : row("<kbd>N</kbd>", `Free camera: fly through anything (${keyLabel(k.forward)}${keyLabel(k.left)}${keyLabel(k.back)}${keyLabel(k.right)} along the view, ${keyLabel(k.vault)} up, ${keyLabel(k.crouch)} down, ${keyLabel(k.sprint)} faster) while your body stays where it is; <kbd>N</kbd> goes back to it, <kbd>${keyLabel(k.interact)}</kbd> puts it on the floor under the camera (where a body fits). Keys you press while flying never reach your body`)}
        ${o.match ? "" : row("<kbd>F3</kbd> / <kbd>F4</kbd>", "Hitboxes / third-person view")}
        ${row("<kbd>F8</kbd>", "Stats: frame rate, frame time, 1% low, work time, draw calls (<code>?stats</code> in the link shows them from the start)")}
        ${row("<kbd>Esc</kbd>", o.match ? "Pause: settings, the invite link, leave the match" : "Pause: settings, operator, go-to menu")}
      </table>
      <h2>Try this</h2>
      <ul>
        ${o.help.tryThis.map((t) => `<li>${t}</li>`).join("\n        ")}
      </ul>
      <p class="note">${o.help.note}</p>`;
  }
  // The page's own additions (the Range Lab's overlay and panels), then the help panel that lists their keys.
  o.extend?.({
    sim,
    get ctrl() {
      return ctrl;
    },
    data,
    app,
    scene,
    camera,
    net,
    weapon: heldWeapon,
    weaponAt: (seq16) => claims.get(seq16)?.weapon ?? null,
    claimedViewTick: (seq16) => claims.get(seq16)?.viewTick ?? null,
    onShot: (fn) => hooks.shot.push(fn),
    onEvents: (fn) => hooks.events.push(fn),
    onFrame: (fn) => hooks.frame.push(fn),
    onKey: (code, fn) => hooks.keys.set(code, fn),
    addLabTool: (label, run) => hooks.tools.push({ label, run }),
    addMatchTool: (label, run) => hooks.matchTools.push({ label, run }),
    addHelp: (keys, what) => hooks.help.push([keys, what]),
    flash,
    body: livingBody,
    spectate: (fn) => (spectateFn = fn),
    releasePointer: () => {
      if (!document.pointerLockElement) return;
      releasing = true;
      document.exitPointerLock();
    },
  });
  addEventListener("keydown", (e) => {
    const fn = hooks.keys.get(e.code);
    if (!fn || e.repeat || !$(".pause").classList.contains("hidden")) return;
    e.preventDefault();
    fn();
  });
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
  /** The default camera watched (Phase 7): ctrl.cam as of the last tick. */
  let camId = 0;
  /** Ticks Fire has been held on a drone or a camera (Phase 7: a scan when it reaches data/intel.json `scan.holdS`). */
  let scanTicks = 0;
  let possessedId = ctrl.possessedPawnId;
  let prompt: ReturnType<Sim["prompt"]> = null;
  let last = performance.now();

  /** A test's walk: forward toward the next point not yet within 0.25 m, and stop after the last. */
  function steerWalk() {
    const p = sim.pawns.get(ctrl.possessedPawnId);
    if (!walkPath || walkPath.done || !p) return;
    const w = walkPath;
    while (w.k < w.pts.length && Math.hypot(w.pts[w.k][0] - p.state.x, w.pts[w.k][1] - p.state.z) < 0.25) w.k++;
    w.ticks++;
    if (w.k >= w.pts.length) {
      w.done = true;
      scripted = null;
      return;
    }
    const [dx, dz] = [w.pts[w.k][0] - p.state.x, w.pts[w.k][1] - p.state.z];
    scripted = { forward: 1, yaw: Math.atan2(-dx, -dz) };
  }

  function tick() {
    snapshotAll();
    tickKick.yaw = tickKick.pitch = 0;
    steerWalk();
    if (net) {
      const sampled = controls.sample(++seq);
      // Test scripts add buttons to what the controls sample (a click still fires while a script holds ADS).
      const input = still(scripted ? { ...sampled, ...scripted, buttons: sampled.buttons | (scripted.buttons ?? 0) } : sampled);
      // Predicts locally and sends the input; a shot claims the frame that was on screen when you clicked.
      const sent = net.session.tick(input, clickViewTick ?? undefined);
      if (sent) claims.set(sent.seq & 0xffff, { viewTick: net.session.lastViewTick, weapon: heldWeapon() });
      if (claims.size > 512) claims.delete(claims.keys().next().value!);
      clickViewTick = null;
      scanTicks = input.buttons & Btn.Fire && controls.onDrone() ? scanTicks + 1 : 0;
    } else {
      const input = still(script ? autoInput(++seq) : controls.sample(++seq));
      sim.step(new Map([[ctrl.id, input]]));
      onWeaponEvents(sim.events);
      // Offline the page is the server for gadgets too (Phase 8): the step's gadget events into the table.
      for (const e of sim.events) offlineGadgets?.onEvent(e);
      offlineGadgets?.step();
    }
    const p = possessed();
    // The view follows the body you're looking through (Skopós' other shell while on its camera).
    const nowViewed = sim.viewedPawnId(ctrl.id);
    const v = sim.pawns.get(nowViewed);
    if (!p || !v) return; // online, between bodies (the server's new one hasn't arrived yet)
    if (ctrl.cam !== camId) {
      // Onto a default camera, or off it (Phase 7): the view starts where the camera (or the body) looks.
      camId = ctrl.cam;
      viewedId = nowViewed;
      if (!freeCam) controls.setView(camId ? ctrl.camYaw : v.state.yaw, camId ? ctrl.camPitch : v.state.pitch);
    } else if (camId) {
      // On a camera the mouse leads; the camera follows at its own turn rate (what's drawn).
    } else if (nowViewed !== viewedId) {
      viewedId = nowViewed;
      if (!freeCam) controls.setView(v.state.yaw, v.state.pitch);
    } else if (!freeCam && !(v.kind === PawnKind.Drone && !ctrl.pawnIds.includes(v.id))) {
      // (On a teammate's drone the view is yours alone: the drone's own facing is its driver's.)
      controls.syncView(v.state.yaw, v.state.pitch, tickKick);
    }
    prompt = sim.prompt(ctrl.id);
    // Keep toggles and view limits in step with what the simulation decided this tick.
    const mv = data.movement;
    controls.afterTick(
      { sprinting: p.state.sprinting, onLadder: p.state.mode === PawnMode.Ladder, onRope: p.state.mode === PawnMode.Rappel, stance: p.state.stance },
      { forcesStand: mv.sprint.forcesStand, sprintCancelsLean: mv.lean.sprintCancelsLean },
    );
    // Toggles belong to the body you control. On the other shell's camera the simulation ignores stance
    // input, so hold them at what the hand-over tick must send: your body's own stance when you go back,
    // standing when the new shell wakes up (D-025).
    if (ctrl.shellCam || ctrl.swapPhase) controls.resetStance(ctrl.swapPhase ? Stance.Stand : stanceKeyOf(p.state));
    else if (p.id !== possessedId || isDowned(p.state)) controls.resetStance(p.state.stance); // down: the body decides
    possessedId = p.id;
    const proneView = v.state.mode === PawnMode.Walk && proneWeight(v.state) > 0;
    controls.limits = proneView
      ? { pitchMin: mv.stance.pronePitchMinDeg * DEG, pitchMax: mv.stance.pronePitchMaxDeg * DEG, maxYawStep: mv.stance.proneTurnRateDeg * DEG * DT }
      : { pitchMin: mv.look.pitchMinDeg * DEG, pitchMax: mv.look.pitchMaxDeg * DEG, maxYawStep: null };
    // A drone's camera tilts within its own limits (data/intel.json); jammed, your own doesn't turn at all.
    if (v.kind === PawnKind.Drone) controls.limits = { pitchMin: data.intel.drone.pitchMinDeg * DEG, pitchMax: data.intel.drone.pitchMaxDeg * DEG, maxYawStep: null };
    if (v.kind === PawnKind.Drone && v.state.jammed > 0 && ctrl.pawnIds.includes(v.id))
      controls.limits = { pitchMin: v.state.pitch, pitchMax: v.state.pitch, maxYawStep: null, yawRange: { center: v.state.yaw, half: 0 } };
    // On a rope the view turns only so far from the wall, and moving onto it, the move turns it.
    controls.limits.yawRange = ropeYawRange(sim.level, data, v.state);
    // A camera (Phase 7): so far either side of its facing (a Bulletproof Camera on the floor: all the way round), its
    // own tilt.
    if (ctrl.cam) {
      const l = sim.camLimits(ctrl.cam - 1);
      controls.limits = { pitchMin: l.pitchMin, pitchMax: l.pitchMax, maxYawStep: null, yawRange: l.half < Math.PI ? { center: l.face, half: l.half } : null };
    }
    if (freeCam) controls.limits = { pitchMin: -89 * DEG, pitchMax: 89 * DEG, maxYawStep: null };
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
  /** A performance capture's frames while one runs (tools/e2e/oregon-perf.mjs): each one's work, draws and panel redraw. */
  let perfLog: { workMs: number; calls: number; triangles: number; panelMs: number }[] | null = null;
  let fpsFrames = 0;
  let fpsAt = performance.now();
  /** Shadow-map redraws so far (they happen on request only: createRenderer). */
  let shadowDraws = 0;
  /** Render the world, counting a shadow-map redraw if one was asked for. */
  function drawWorld() {
    if (renderer.shadowMap.enabled && renderer.shadowMap.needsUpdate && !renderer.getContext().isContextLost()) shadowDraws++;
    renderer.render(scene, shownCamera());
  }
  function frame(now: number) {
    const workFrom = performance.now();
    renderer.info.reset();
    // The frame's timestamp can predate the code that ran just before it (a page busy for seconds
    // starting up gets a first frame stamped from before): never step time backwards.
    const elapsed = Math.max(0, Math.min(0.25, (now - last) / 1000));
    acc += elapsed;
    last = now;
    const live = !net || followServer(elapsed);
    /** A match page with no living body to look through: the page's camera (spectating). */
    const spec = o.match ? spectating(live) : null;
    app.classList.toggle("spectating", spec !== null);
    if (!live && !spec) {
      // Between bodies (joining, respawning, a new operator): wait for the server's exact state.
      acc = 0;
      if (o.match && disconnected && !app.classList.contains("disconnected")) matchFail(disconnected);
      drawWorld();
      stats.frame(now, performance.now() - workFrom + (net?.takeHandleMs() ?? 0), renderer.info.render.calls, renderer.info.render.triangles);
      $(".center-msg").textContent = disconnected ?? "Waiting for the server…";
      $(".center-msg").classList.remove("hidden");
      requestAnimationFrame(frame);
      return;
    }
    // Online, the tick period stretches or shrinks a few percent so our inputs reach the server just
    // before it needs them (clock sync, PLAN §5).
    const period = net ? DT * net.session.tickScale() : DT;
    if (live)
      while (acc >= period) {
        acc -= period;
        tick();
      }
    else acc = 0;
    controls.applyLimits();
    const alpha = acc / period;

    const me = live ? possessed() : undefined;
    const viewed = me ? (sim.pawns.get(viewedId) ?? me) : undefined;
    const renderTick = net ? net.session.frame() : 0;
    shownRenderTick = renderTick;
    /** Looking from outside your body: third person, or a map's plan view. */
    const outside = thirdPerson || storeyView?.plan === true || freeCam !== null;
    // On a default camera everyone is drawn, your body too (it stands where you left it).
    // (A Bulletproof Camera of a round just over is still yours until the next tick hands you on: not this frame.)
    const onCamera = !spec && ctrl.cam !== 0 && ctrl.cam <= sim.camCount();
    drawBodies(alpha, renderTick, spec ? (spec.kind === "pawn" ? spec.pawnId : -1) : onCamera ? -1 : viewed!.id, spec ? spec.kind !== "pawn" : outside || onCamera);
    // A watched camera's light: blue to defenders, red to attackers.
    const watched = net?.session.match?.camsWatched ?? 0;
    const levelCams = sim.level.def.cameras.length;
    cameraModels?.update(sim.matchRules.camsBroken, watched, ctrl.team === sideTeam("defender"));
    bpCameraModels.update(sim.bpCams(), watched >>> levelCams, ctrl.team === sideTeam("defender"));
    const serverNow = net ? net.session.serverTick() : sim.tick + alpha;
    // What we look through (Phase 8 M3): smoke isn't drawn in a Bulletproof Camera's thermal view; the other side's
    // observation blocker shows on our drones and cameras.
    gadgetModels.view = { thermal: onCamera && sim.bpCamAt(ctrl.cam - 1) !== null, team: ctrl.team, tool: onCamera || sim.pawns.get(sim.viewedPawnId(ctrl.id))?.kind === PawnKind.Drone };
    gadgetModels.update(net ? renderTick : sim.tick + alpha, serverNow, ctrl.id);
    poseOutline();
    // A Bulletproof Camera's thermal view: the world tinted, bodies glowing white.
    const thermal = onCamera && sim.bpCamAt(ctrl.cam - 1) !== null;
    app.classList.toggle("thermal", thermal);
    for (const v of pawnViews.values()) v.heat(thermal);
    updateShots(now);
    fx.update(now, shownRenderTick, ctrl.pawnIds, ownMuzzle, remoteMuzzle);
    updateCombatHud(now);
    updateStunHud(now);
    updateLasers();

    let rs: PawnState | null = null;
    if (spec) {
      const [vx, vy, vz] = placeSpectator(spec, renderTick, elapsed);
      if (storeyView?.follow(vx, vy, vz, camera.rotation.y, elapsed)) renderer.shadowMap.needsUpdate = true;
      if (storeyView) viewmodel.setLight(storeyView.light());
      whereHud?.update(now, storeyView?.storey ?? 0, vx, vz);
      controls.upsideDown = false;
      if (Math.abs(camera.fov - settings.fovVertical) > 1e-4) {
        camera.fov = settings.fovVertical;
        camera.updateProjectionMatrix();
      }
    } else {
      // A teammate's drone (Phase 7) is drawn where others are: between the snapshots around the render tick.
      rs = viewed!.proxy && net ? (net.session.remoteAt(viewed!.id, renderTick) ?? viewed!.state) : interpolated(viewed!, alpha);
      flyFreeCam(elapsed);
      // A map follows the body you look through (or the free camera, or the camera you watch): its storey (and that
      // storey's light), the plan view over it.
      const lens = onCamera ? sim.camLens(ctrl.cam - 1, ctrl.camYaw) : null;
      const [vx, vy, vz] = freeCam ? [freeCam.x, freeCam.y - data.movement.stance.stand.eye, freeCam.z] : lens ? [lens[0], lens[1] - 0.05, lens[2]] : [rs.x, rs.y, rs.z];
      if (storeyView?.follow(vx, vy, vz, controls.yaw, elapsed)) renderer.shadowMap.needsUpdate = true;
      if (storeyView) viewmodel.setLight(storeyView.light());
      whereHud?.update(now, storeyView?.storey ?? 0, vx, vz);
      // A drone's camera: low at its front, its own field of view (Phase 7).
      const droneView = viewed!.kind === PawnKind.Drone;
      if (droneView) {
        if (Math.abs(camera.fov - data.intel.drone.fovDeg) > 1e-4) {
          camera.fov = data.intel.drone.fovDeg;
          camera.updateProjectionMatrix();
        }
      } else aim(viewed!, rs);
      const eye = droneView ? { pos: droneEye(data.intel.drone, rs).pos, roll: 0 } : eyePose(data.movement, data.hitboxes, { ...rs, yaw: controls.yaw });
      if (onCamera) {
        // A camera: from just in front of its lens, where the camera looks (it follows the mouse at its rate).
        eye.pos = lens!;
        const fov = sim.camLimits(ctrl.cam - 1).fovDeg;
        if (Math.abs(camera.fov - fov) > 1e-4) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
      }
      // Only the first-person view turns over with the body (the third-person and plan views stay upright).
      controls.upsideDown = !freeCam && !thirdPerson && !storeyView?.plan && upsideDown(rs);
      if (freeCam) {
        camera.position.copy(freeCam);
        camera.rotation.set(controls.pitch, controls.yaw, 0);
      } else if (thirdPerson) {
        const back = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(controls.pitch, controls.yaw, 0, "YXZ"));
        camera.position.set(eye.pos[0] + back.x * 3 + Math.cos(controls.yaw) * 0.5, eye.pos[1] + back.y * 3 + 0.4, eye.pos[2] + back.z * 3 - Math.sin(controls.yaw) * 0.5);
        camera.rotation.set(controls.pitch, controls.yaw, 0);
      } else if (onCamera) {
        camera.position.set(eye.pos[0], eye.pos[1], eye.pos[2]);
        camera.rotation.set(ctrl.camPitch, ctrl.camYaw, 0, "YXZ");
      } else {
        camera.position.set(eye.pos[0], eye.pos[1], eye.pos[2]);
        camera.rotation.set(controls.pitch, controls.yaw, eye.roll);
      }
    }
    updateLabels(labScene.labels, shownCamera());
    // A panel that changed changes the level's shadows too.
    const panelFrom = performance.now();
    if (panelView.update()) renderer.shadowMap.needsUpdate = true;
    const panelMs = performance.now() - panelFrom;
    for (const fn of hooks.frame) fn(now, renderTick);
    intelHud.update(now, shownCamera(), app.clientWidth, app.clientHeight, (id) => {
      const st = net?.session.remoteAt(id, renderTick);
      return st && st.mode !== PawnMode.Dead ? [st.x, st.y, st.z] : null;
    });
    intelHud.showWheel(controls.wheelPick);
    intelHud.showScan(scanTicks && !spec ? Math.min(1, scanTicks / ticks(data.intel.scan.holdS)) : null);
    drawWorld();
    if (rs && viewed && me) {
      const inHand = viewed.id === me.id && !outside && !onCamera && !ctrl.shellCam && ctrl.swapPhase === 0 ? (viewed.loadout?.weapons[rs.slot] ?? null) : null;
      viewmodel.update(now, elapsed, inHand, rs, viewed.loadout?.swapTicks ?? 1, inHand ? heldGadget(viewed, rs) : null);
      viewmodel.render(renderer);
      const held = viewed.loadout?.weapons[rs.slot];
      const aimed = inHand !== null && viewmodel.aim > 0.9;
      crosshair.update({
        gapPx: held ? spreadGapPx(spreadCone(held, rs), camera.fov, view.clientHeight) : 0,
        noTicks: rs.mode === PawnMode.Dead || ctrl.shellCam || ctrl.swapPhase !== 0 || thirdPerson || freeCam !== null,
        aimed,
        reticle: viewmodel.reticle,
        zoomed: aimed && inHand!.ads.zoom > 1,
      });
    }
    frames++;
    fpsFrames++;
    if (now - fpsAt > 500) {
      $(".fps").textContent = `${Math.round((fpsFrames * 1000) / (now - fpsAt))} fps · tick ${sim.tick}`;
      if (net) updateNetStats(now - fpsAt);
      fpsFrames = 0;
      fpsAt = now;
    }
    if (me && !spec) updateHud(me);
    else spectatorHud();
    const workMs = performance.now() - workFrom + (net?.takeHandleMs() ?? 0);
    stats.frame(now, workMs, renderer.info.render.calls, renderer.info.render.triangles);
    perfLog?.push({ workMs, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, panelMs });
    requestAnimationFrame(frame);
  }

  /**
   * Pose and show every body: other players a little in the past, between two server snapshots; our own from our
   * prediction. The body whose eyes the camera is at (`eyesId`) isn't drawn in first person (`outside` false).
   */
  function drawBodies(alpha: number, renderTick: number, eyesId: number, outside: boolean) {
    syncPawnViews();
    for (const pawn of sim.pawns.values()) {
      const v = pawnViews.get(pawn.id)!;
      const rs = pawn.proxy ? net!.session.remoteAt(pawn.id, renderTick) : interpolated(pawn, alpha);
      // On a map, a body on a storey hidden over yours is hidden with it.
      const drawn = rs !== null && (storeyView?.draws(rs.y) ?? true);
      v.body.visible = drawn;
      v.wire.visible = drawn && showHitboxes;
      if (!rs) continue;
      const w = pawn.loadout?.weapons[rs.slot];
      v.setWeapon(w ? { class: w.class, pick: w.pick } : null);
      // A gadget in its hands instead (Phase 8): drawn as its greybox; a detonator small and dark.
      const held = heldGadget(pawn, rs);
      v.setHeld(held ? (held.detonator ? [0.05, 0.09, 0.03] : held.data.sizeM) : null);
      v.update(sim.data, rs.mode === PawnMode.Dead ? corpse(rs) : rs);
      // On a rope: drawn from the body's middle (its harness) up to where the rope is fixed (a swing takes the body
      // out from under it).
      const m = sim.data.movement;
      const rope =
        rs.mode === PawnMode.Rappel
          ? ropeOf(sim.level.rappel, rs.x, rs.y, rs.z, m.stance.collisionRadius + m.rappel.wallGap, m.stance.stand.height, m.rappel.swingOutM, pawn.proxy ? -1 : rs.rappel)
          : null;
      v.setRope(rs.x, rs.y + m.stance.stand.height / 2, rs.z, rope);
      drawnView.set(pawn.id, [rs.yaw, rs.pitch]);
      const eyes = pawn.id === eyesId;
      // In first person your own body isn't drawn; your gun is the viewmodel.
      v.setFirstPerson(eyes && !outside);
      v.wire.visible = drawn && showHitboxes && (!eyes || outside);
    }
  }

  // ------------------------------------------------------------------ without a body (match pages)

  /** How long a match page shows your own dead body before the camera moves on (to a teammate). */
  const DEAD_VIEW_MS = 3000;
  let deadSince: number | null = null;

  /** The spectator view for this frame, or null while you have a living body (or a fresh death) to look through. */
  function spectating(live: boolean): SpectateView | null {
    if (disconnected || !net?.session.match) return null;
    // Driving a drone or watching a camera (dead or not): its view.
    if (live && ((ctrl.drone && sim.pawns.get(ctrl.drone)?.state.mode === PawnMode.Walk) || ctrl.cam)) return null;
    const p = live ? possessed() : undefined;
    if (p && p.state.mode !== PawnMode.Dead) {
      deadSince = null;
      return null;
    }
    if (p) {
      deadSince ??= performance.now();
      if (performance.now() - deadSince < DEAD_VIEW_MS) return null;
    }
    return spectateFn?.() ?? { kind: "overview" };
  }

  /** The overview's centre (the building's middle: its zones, else the level's bounds) and how far out it circles. */
  const overview = (() => {
    const boxes = zoneBoxes(sim.level.def, "building");
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const b of boxes)
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], b.c[i] - b.h[i]);
        hi[i] = Math.max(hi[i], b.c[i] + b.h[i]);
      }
    const bb = boxes.length ? { min: lo, max: hi } : sim.level.def.bounds;
    if (!bb) return { c: [0, 0, 0], r: 20 };
    return { c: [0, 1, 2].map((i) => (bb.min[i] + bb.max[i]) / 2), r: Math.max(15, Math.hypot(bb.max[0] - bb.min[0], bb.max[2] - bb.min[2]) * 0.7) };
  })();
  /** Radians a second the overview turns. */
  const OVERVIEW_TURN = 0.05;
  let overviewAngle = 0.6;
  /** The fixed spot last looked from (a new one turns the view to its yaw once; then the mouse looks around). */
  let spotKey = "";

  /** Put the camera where a spectator view says; returns the feet position the storey views and the HUD line follow. */
  function placeSpectator(v: SpectateView, renderTick: number, elapsed: number): [number, number, number] {
    const eyeH = data.movement.stance.stand.eye;
    if (v.kind === "pawn") {
      const st = net?.session.remoteAt(v.pawnId, renderTick) ?? sim.pawns.get(v.pawnId)?.state;
      if (st) {
        const eye = eyePose(data.movement, data.hitboxes, st);
        camera.position.set(eye.pos[0], eye.pos[1], eye.pos[2]);
        camera.rotation.set(st.pitch, st.yaw, eye.roll);
        return [st.x, st.y, st.z];
      }
    } else if (v.kind === "spot") {
      const key = `${v.pos.join()},${v.yawDeg}`;
      if (key !== spotKey) {
        spotKey = key;
        controls.setView(v.yawDeg * DEG, 0);
      }
      camera.position.set(v.pos[0], v.pos[1] + eyeH, v.pos[2]);
      camera.rotation.set(controls.pitch, controls.yaw, 0);
      return [v.pos[0], v.pos[1], v.pos[2]];
    }
    // Over the map, circling its middle.
    overviewAngle += elapsed * OVERVIEW_TURN;
    const [cx, cy, cz] = overview.c;
    camera.position.set(cx + Math.sin(overviewAngle) * overview.r, cy + overview.r * 0.6, cz + Math.cos(overviewAngle) * overview.r);
    camera.lookAt(cx, cy, cz);
    return [camera.position.x, camera.position.y - eyeH, camera.position.z];
  }

  /** The HUD while spectating: nobody's prompt, and the centre message only for a lost connection. */
  function spectatorHud() {
    $(".prompt").classList.add("hidden");
    $(".center-msg").classList.toggle("hidden", !disconnected);
    if (disconnected) $(".center-msg").textContent = disconnected;
    $(".flash").classList.toggle("show", performance.now() < flashUntil);
  }

  /**
   * A dead body is drawn lying on whatever is under it: it may have died in mid-air, on a ladder or
   * mid-vault (DECISIONS D-058). Drawing only: the simulation keeps it where it died, and the dead block
   * nothing and stop no bullets.
   */
  function corpse(s: PawnState): PawnState {
    const hit = sim.world.castRay(new sim.R.Ray({ x: s.x, y: s.y + 0.5, z: s.z }, { x: 0, y: -1, z: 0 }), 100, true, undefined, QUERY_STATIC);
    const y = hit ? s.y + 0.5 - hit.timeOfImpact : s.y;
    return { ...s, y, stance: Stance.Prone, stanceFrom: Stance.Prone, stanceT: 1, lean: 0, tiltF: 0, tiltB: 0, tiltSide: 0, tuck: 0 };
  }

  /** Aiming, drawn from the body you look through: a magnified sight narrows the field of view as ADS comes in. Returns the field of view. */
  function aim(p: Pawn, rs: PawnState): number {
    const w = p.loadout?.weapons[rs.slot];
    // An EMP on the body (DSEG, Phase 8 M3): its optics are static, no magnification.
    const fov = w ? adsFov(settings.fovVertical, rs.jammed > 0 ? 1 : w.ads.zoom, rs.adsQ / 65535) : settings.fovVertical;
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    return fov;
  }

  // ------------------------------------------------------------------ HUD

  const STANCE_NAMES = ["STAND", "CROUCH", "PRONE"];
  const MODE_NAMES = ["", "VAULT", "LADDER", "DEAD", "", "RAPPEL", ""];
  function updateHud(p: Pawn) {
    const s = p.state;
    $(".op-name").textContent = `${op.name} · ${op.side} · ${op.healthRating} health / ${op.speedRating} speed${op.pawns > 1 ? ` · shell ${ctrl.pawnIds.indexOf(p.id) + 1}/2` : ""}`;
    const inHand = slotGadget(data, p.loadout, (handSlot(s.hand) || 1) as 1 | 2);
    const back = s.gTarget ? sim.gadgets.get(s.gTarget) : undefined;
    const backData = back ? data.gadgets.get(kindId(back.kind) ?? "") : undefined;
    downedHud.update(s, data.combat, keyLabel(settings.keys.interact), nameOfPawn, data.destruction, data.movement, sim.objective, {
      name: inHand?.name ?? "",
      placeTicks: inHand?.use.kind === "place" ? ticks(inHand.use.placeS) : 1,
      takeBack: backData?.name ?? "gadget",
      takeBackTicks: ticks(data.gadgetRules.pickUpS),
    });
    app.querySelectorAll<HTMLElement>(".stances span").forEach((el) => el.classList.toggle("on", Number(el.dataset.s) === s.stance));
    $(".stance-bar div").style.width = `${s.stanceT * 100}%`;
    // On a rope the body is moved by position, not velocity: its speed from the last tick's move.
    const before = prevStates.get(p.id);
    const speed = s.mode === PawnMode.Rappel && before ? Math.hypot(s.x - before.x, s.y - before.y, s.z - before.z) / DT : Math.hypot(s.vx, s.vz);
    $(".readout").textContent = [
      `${speed.toFixed(2)} m/s`,
      s.sprinting ? "SPRINT" : controls.adsActive ? "ADS" : "",
      upsideDown(s) ? "RAPPEL · UPSIDE DOWN" : MODE_NAMES[s.mode],
      s.stanceT < 1 ? `${STANCE_NAMES[s.stanceFrom]} → ${STANCE_NAMES[s.stance]}` : "",
    ]
      .filter(Boolean)
      .join("  ·  ");
    $(".lean-l").style.opacity = String(Math.max(0, -s.lean));
    $(".lean-r").style.opacity = String(Math.max(0, s.lean));
    const msg = $(".center-msg");
    const dead = s.mode === PawnMode.Dead;
    // On a drone or a camera (Phase 7), the feed's own overlay: not the body's death message and readouts.
    const onFeed = ctrl.cam !== 0 || ctrl.drone !== 0 || sim.pawns.get(ctrl.possessedPawnId)?.kind === PawnKind.Drone;
    app.classList.toggle("on-feed", onFeed);
    const deathText = dead && death?.pawnId === p.id && death.life === p.life ? death.text : null;
    const needClick = !usingTouch && !autotest && !document.pointerLockElement && $(".pause").classList.contains("hidden");
    const waiting = net !== null && !net.session.ready;
    msg.classList.toggle("hidden", !(dead && !onFeed) && !needClick && !waiting && !disconnected);
    msg.textContent = disconnected
      ? disconnected
      : waiting
        ? "Waiting for the server…"
        : dead
          ? o.match
            ? (deathText ?? "You died")
            : `${deathText ?? "You died from the fall"} — press ${keyLabel(settings.keys.respawn)} to respawn`
          : "Click to play · F1 for controls";
    if (touchLayer) touchLayer.querySelector(".touch-btn")!.classList.toggle("on", controls.sprintIsLatched);

    const k = settings.keys;
    const promptText =
      prompt === "mantle"
        ? `${keyLabel(k.vault)} to mantle`
        : prompt === "rappel"
          ? `Hold ${keyLabel(k.vault)} to rappel`
          : prompt === "rappelVault"
            ? `${keyLabel(k.vault)} to vault · hold to rappel`
            : prompt === "rappelIn"
              ? `${keyLabel(k.vault)} to swing in`
              : prompt === "rappelBreach"
                ? `${keyLabel(k.vault)} to breach`
        : prompt === "ladder"
          ? `${keyLabel(k.interact)} to climb`
          : prompt === "transfer"
            ? `${keyLabel(k.interact)} to transfer`
            : prompt === "revive"
              ? `Hold ${keyLabel(k.interact)} to revive`
              : prompt === "reinforce"
                ? `Hold ${keyLabel(k.interact)} to reinforce (${sim.deployRules.pools[possessed()?.team ?? 1]} left)`
                : prompt === "barricade"
                  ? `Hold ${keyLabel(k.interact)} to barricade`
                  : prompt === "unbarricade"
                    ? `Hold ${keyLabel(k.interact)} to remove the barricade`
                    : prompt === "plant"
                      ? `Hold ${keyLabel(k.interact)} to plant the defuser`
                      : prompt === "disable"
                        ? `Hold ${keyLabel(k.interact)} to disable the defuser`
                        : prompt === "pickUp"
                          ? `${keyLabel(k.interact)} to pick up the defuser`
                          : prompt === "pickUpDrone"
                            ? `${keyLabel(k.interact)} to pick up your drone`
                          : "";
    $(".prompt").textContent = promptText;
    $(".prompt").classList.toggle("hidden", !promptText || dead);
    const onCam = ctrl.shellCam || ctrl.swapPhase !== 0;
    $(".shellcam").classList.toggle("hidden", !onCam);
    // On a drone (Phase 7): which one, its jump and boost, the keys.
    const drone = sim.pawns.get(sim.viewedPawnId(ctrl.id));
    const onDrone = drone?.kind === PawnKind.Drone;
    $(".dronecam").classList.toggle("hidden", !onDrone && ctrl.cam === 0);
    $(".dronecam").classList.toggle("jammed", onDrone && drone.state.jammed > 0);
    if (onDrone || ctrl.cam) {
      const html = feedRow();
      const row = $(".dronecam .feeds");
      if (row.dataset.html !== html) row.innerHTML = row.dataset.html = html;
    }
    if (ctrl.cam) {
      // Which camera (a Bulletproof Camera: its dart, and outdoors how long its signal lasts), how many are broken.
      const cams = sim.level.def.cameras;
      const bp = sim.bpCamAt(ctrl.cam - 1);
      const cam = bp ? null : cams[ctrl.cam - 1];
      const broken = cams.filter((_, i) => sim.matchRules.camsBroken & (1 << i)).length + sim.bpCams().filter((c) => c.flags & GFlag.Broken).length;
      const room = cam?.room ? (sim.level.def.rooms.find((r) => r.id === cam.room)?.callout ?? "") : "";
      // The dart's and the signal's times are the server's ticks (the simulation here counts its own).
      const now = net ? net.session.serverTick() : sim.tick;
      const left = (t: number) => `${(Math.max(0, t - now) * DT).toFixed(1)} s`;
      $(".dronecam-title").textContent = [
        `${bp ? "BULLETPROOF CAM" : "CAM"} ${ctrl.cam}/${sim.camCount()}${room ? ` · ${room}` : ""}${broken ? ` · ${broken} broken` : ""}`,
        bp && !dead ? `${keyLabel(k.gadget)} EMP dart ${now >= bp.readyAt ? "ready" : left(bp.readyAt)}` : "",
        bp?.signalEnd && !(bp.flags & GFlag.Lost) ? `signal lost in ${left(bp.signalEnd)}` : "",
        `${keyLabel(k.leanLeft)} / ${keyLabel(k.leanRight)} switch · ${keyLabel(k.observe)} back`,
      ]
        .filter(Boolean)
        .join("  ·  ");
    } else if (onDrone && !ctrl.pawnIds.includes(drone.id)) {
      // A teammate's drone (Phase 7, intel/DESIGN.md §5): watched, not driven.
      $(".dronecam-title").textContent = [
        `${(ownerName(drone.id) || "A TEAMMATE").toUpperCase()}'S DRONE · watching`,
        drone.state.jammed ? "JAMMED" : "",
        `${keyLabel(k.leanLeft)} / ${keyLabel(k.leanRight)} switch · ${keyLabel(k.observe)} back`,
      ]
        .filter(Boolean)
        .join("  ·  ");
    } else if (onDrone) {
      const drones = sim.dronesOf(ctrl);
      const held = drones.filter((d) => d.state.mode === PawnMode.Held).length;
      const ds = drone.state;
      const secs = (t: number) => `${(t * DT).toFixed(1)} s`;
      // In prep you are your drone (no body to go back to): only the teammates' drones to switch to.
      const prep = drone.id === ctrl.possessedPawnId;
      const others = prep ? sim.feedDrones(ctrl).filter((p) => !ctrl.pawnIds.includes(p.id)).length : sim.feedDrones(ctrl).length - 1;
      const keys = [others > 0 ? `${keyLabel(k.leanLeft)} / ${keyLabel(k.leanRight)} switch` : "", prep ? "" : `${keyLabel(k.observe)} back`].filter(Boolean).join(" · ");
      $(".dronecam-title").textContent = [
        `DRONE ${drones.indexOf(drone) + 1}/${drones.length}${held ? ` · ${held} held` : ""}`,
        ds.mode === PawnMode.Dead ? "DESTROYED" : "",
        ds.jammed ? `JAMMED ${secs(ds.jammed)}` : "",
        `${keyLabel(k.vault)} jump ${ds.jumpCd ? secs(ds.jumpCd) : "ready"}`,
        `${keyLabel(k.sprint)} boost ${ds.boostTicks ? "ON" : ds.boostCd ? secs(ds.boostCd) : "ready"}`,
        keys,
      ]
        .filter(Boolean)
        .join("  ·  ");
    }
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
    // The gadgets in the two slots (Phase 8): how many are left, on which key; a detonator's devices waiting.
    const slotText = (slot: 1 | 2, key: string) => {
      const g = slotGadget(data, p.loadout, slot);
      if (!g) return "";
      const left = slot === 1 ? s.g1 : s.g2;
      const out = slot === 1 ? s.w1 : s.w2;
      return `${g.name.toUpperCase()} ×${left}${out ? ` · ${out} out (detonator)` : ""} · ${keyLabel(key)}`;
    };
    const gadgetText = dead ? "" : [slotText(1, k.gadget), slotText(2, k.ability)].filter(Boolean).join("   ");
    if ($(".gadget-line").textContent !== gadgetText) $(".gadget-line").textContent = gadgetText;
  }

  function flash(text: string, kind: "bad" | "info") {
    const el = $(".flash");
    el.textContent = text;
    el.dataset.kind = kind;
    flashUntil = performance.now() + 1600;
  }

  // ------------------------------------------------------------------ automated test hook (?autotest=1)

  const gl = renderer.getContext();
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const script = autotest && !online ? (o.autotest ?? null) : null;
  // One object: the script's own fields and these (the script keeps writing to it).
  const report = Object.assign(o.autotest?.report ?? {}, {
    ready: true,
    done: script === null,
    frames: 0,
    webgl: String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
  });
  const handle: LabHandle = {
    sim,
    get ctrl() {
      return ctrl;
    },
  };
  Object.defineProperty(window, "__lab", {
    value: {
      report,
      get frames() {
        return frames;
      },
      /** Ticks this page has played (one per input; replays don't count): browser tests measure game time with it. */
      get tick() {
        return seq;
      },
      /** A test's walk through points [x, z] (steered by the page each tick, see walkPath; null stops it); `walking` reports on it. */
      walk(pts: [number, number][] | null) {
        walkPath = pts && { pts: pts.map(([x, z]) => [x, z]), k: 0, ticks: 0, done: false };
        if (!pts) scripted = null;
      },
      get walking() {
        return walkPath && { k: walkPath.k, ticks: walkPath.ticks, done: walkPath.done };
      },
      /** Shadow-map redraws so far (tools/e2e/oregon.mjs checks a lost and restored context asks for one). */
      get shadowDraws() {
        return shadowDraws;
      },
      /**
       * A performance capture (tools/e2e/oregon-perf.mjs): `start` records every frame drawn from now on (the
       * page's work in ms as the stats overlay counts it, draw calls, triangles, the panels' redraw in ms);
       * `stop` ends it and returns them.
       */
      perf: {
        start: () => void (perfLog = []),
        stop: () => {
          const log = perfLog ?? [];
          perfLog = null;
          return log;
        },
      },
      /** Online state for the two-browser test (tools/e2e/online-lab.mjs). */
      get net() {
        if (!net) return null;
        const s = net.session;
        return {
          room: s.roomCode,
          ready: s.ready,
          you: s.you,
          players: s.roster.filter((e) => e.kind === 0).map((e) => e.name),
          roster: s.roster,
          corrections: s.stats.corrections,
          resyncs: s.stats.resyncs,
          rttMs: s.rttMs,
          remotes: s.remoteIds().map((id) => ({ id, state: s.remoteAt(id) })),
          own: possessed() ? { ...possessed().state } : null,
          weapon: possessed()?.loadout
            ? { id: possessed().loadout!.weapons[possessed().state.slot].id, slot: possessed().state.slot, loaded: loadedOf(possessed().state), reserve: reserveOf(possessed().state) }
            : null,
          /** What your body carries (operator, weapons and attachments). */
          loadout: possessed()?.loadout?.pick ?? null,
          pawnId: ctrl.possessedPawnId,
          /** The drone driven (Phase 7; 0: none), and the kind of pawn the camera looks through (1: a drone). */
          drone: ctrl.drone,
          /** The default camera watched (Phase 7): its number in the level's list, 0: none. */
          cam: ctrl.cam,
          viewedKind: sim.pawns.get(sim.viewedPawnId(ctrl.id))?.kind ?? null,
          /** Pings and spotted enemies marked on the screen (Phase 7). */
          intel: intelHud.count,
          /** The gadgets left in each slot, what's in the hands (Phase 8), and the table's entries. */
          gadgets: possessed()?.state.g1 ?? 0,
          gadgets2: possessed()?.state.g2 ?? 0,
          hand: possessed()?.state.hand ?? 0,
          table: sim.gadgets.list.map((g) => ({ id: g.id, kind: kindId(g.kind), flags: g.flags, pos: [...g.pos], owner: g.owner })),
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
      /**
       * The free camera (E10): on at a pose (metres, yaw and pitch in degrees), or off (null; `putBody` puts your
       * body on the floor under the camera).
       */
      fly: (at: [number, number, number, number, number] | null, putBody = false) => {
        if (!at) return setFreeCam(false, putBody);
        setFreeCam(true);
        freeCam?.set(at[0], at[1], at[2]);
        controls.yaw = at[3] * DEG;
        controls.pitch = at[4] * DEG;
      },
      fire: () => fire(),
      /** Lab tool: hurt your own body (the whole of its health downs it). */
      hurt: (amount: number) => labHurt(amount),
      /** Lab tool: refill your ammo. */
      refill: () => labRefill(),
      /** Lab tool (rooms): hurt a body by id, yours or a Range Lab dummy. */
      damage: (pawnId: number, amount: number) => net?.send(encodeLabTool({ kind: "damage", pawnId, amount, kill: false })),
      /** The view (yaw, pitch) from your eye now to a body part of another body as the frame on screen draws it. */
      aimAt: (pawnId: number, part: string) => {
        const st = net?.session.remoteAt(pawnId, shownRenderTick);
        const box = st && poseHitboxes(data.movement, data.hitboxes, st).find((h) => h.part === part);
        if (!box) return null;
        const eye = eyePose(data.movement, data.hitboxes, possessed().state).pos;
        const d = [0, 1, 2].map((i) => (box.a[i] + box.b[i]) / 2 - eye[i]);
        return { yaw: Math.atan2(-d[0], -d[2]), pitch: Math.atan2(d[1], Math.hypot(d[0], d[2])) };
      },
      /** The render tick of the frame on screen (other players are drawn at it; a click now claims it). */
      get renderTick() {
        return shownRenderTick;
      },
      /** One panel as this page has it, by level id (browser tests). */
      panel: (id: string) => {
        const p = sim.level.panels.byId.get(id)?.panel;
        if (!p) return null;
        return { hp: p.hp, reinforced: p.reinforced, steelSides: p.steelSides, broken: p.broken, empty: p.empty, modified: p.modified, holes: p.layers.map((l) => (l ? l.reduce((n, c) => n + (c ? 0 : 1), 0) : null)) };
      },
      /** The destructible panels as this page has them (browser tests compare players' panels). */
      get panels() {
        const p = sim.level.panels;
        const st = net?.session.stats;
        return {
          hash: p.hash(),
          changed: p.list.filter((e) => e.panel.modified).map((e) => e.panel.spec.id),
          ops: st?.panelOps ?? 0,
          states: st?.panelStates ?? 0,
          mismatches: st?.panelMismatches ?? 0,
        };
      },
      /** The render tick an input of yours claimed (lag compensation), by its 16-bit seq. */
      claimed: (seq16: number) => claims.get(seq16)?.viewTick ?? null,
      /** Another body's hitboxes as this page draws it at render tick `tick`. */
      boxesAt: (pawnId: number, tick: number) => {
        const st = net?.session.remoteAt(pawnId, tick);
        return st ? poseHitboxes(data.movement, data.hitboxes, st) : null;
      },
      /** The camera's vertical field of view now (degrees; narrower down a magnified sight). */
      get fov() {
        return camera.fov;
      },
      /** The body you look through (Skopós' other shell, on its camera) and the one you control. */
      get bodies() {
        const st = (id: number) => {
          const p = sim.pawns.get(id);
          return p ? { ...p.state } : null;
        };
        return { viewed: st(sim.viewedPawnId(ctrl.id)), possessed: st(ctrl.possessedPawnId) };
      },
      /** Online tests: replace parts of the sampled input (e.g. { forward: 1 }); null hands back control. */
      set input(v: Partial<InputCmd> | null) {
        scripted = v;
      },
      /**
       * What the page shows: hitboxes, third person and, on a map, the storey views (the storey you're on by
       * id, hide-above, the plan view and its zoom, the palette, the storeys and panels drawn, the static
       * materials' colours) and the HUD line; with the level's storeys, rooms and plan units (`levelPlan`: metres
       * per u and each storey's frame) (tools/e2e/oregon.mjs).
       */
      get view(): Record<string, unknown> {
        const def = sim.level.def;
        return {
          hitboxes: showHitboxes,
          thirdPerson,
          freeCam: freeCam ? [freeCam.x, freeCam.y, freeCam.z] : null,
          storeys: def.storeys.map((s) => s.id),
          rooms: def.rooms.map((r) => ({ id: r.id, callout: r.callout, storey: r.storey, rects: r.rects, anchor: r.anchor })),
          levelPlan: def.plan ?? null,
          hud: whereHud?.text ?? null,
          ...(storeyView && {
            storey: def.storeys[storeyView.storey].id,
            hideAbove: storeyView.hideAbove,
            plan: storeyView.plan,
            planHalfM: storeyView.planHalfM,
            palette: storeyView.palette,
            shown: storeyView.shown(),
            panels: storeyView.panelCounts(),
            colors: Object.fromEntries([...labScene.materials].map(([k, m]) => [k, `#${m.color.getHexString()}`])),
            zones: markers?.zones ?? false,
            markers: markers?.drawn() ?? null,
          }),
        };
      },
      set view(v: { hitboxes?: boolean; thirdPerson?: boolean; hideAbove?: boolean; plan?: boolean; palette?: Palette; zones?: boolean }) {
        if (v.hitboxes !== undefined) showHitboxes = v.hitboxes;
        if (v.thirdPerson !== undefined) thirdPerson = v.thirdPerson;
        setStoreyView(v);
      },
    },
  });

  let phase = 0;
  let phaseTick = 0;
  function autoInput(n: number): InputCmd {
    const phases = script?.phases ?? [];
    while (phase < phases.length && phaseTick >= phases[phase].ticks) {
      phases[phase].after?.(possessed(), handle);
      phase++;
      phaseTick = 0;
    }
    if (phase >= phases.length) {
      // Done: stand still where you are, keeping the last phase's lean (for the screenshot).
      report.done = true;
      const s = possessed().state;
      controls.setView(s.yaw, 0);
      return { seq: n, forward: 0, strafe: 0, yaw: s.yaw, pitch: 0, buttons: 0, stance: s.stance, lean: phases.at(-1)?.input.lean ?? 0 };
    }
    const ph = phases[phase];
    if (phaseTick === 0) ph.setup?.(handle);
    phaseTick++;
    const { yawDeg, ...rest } = ph.input;
    const yaw = yawDeg !== undefined ? yawDeg * DEG : 0;
    controls.setView(yaw, 0);
    return { seq: n, forward: 0, strafe: 0, yaw, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...rest };
  }

  function observe(p: Pawn) {
    report.frames = frames;
    script?.observe?.(p, frames);
  }

  // ------------------------------------------------------------------ online (Phase 2)

  /** Name, then create a room or join one by code. Resolves once the room's level is loaded. */
  function lobby(): Promise<OnlineConnection> {
    const panel = $(".lobby");
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <h2>${o.title} · Online</h2>
      <p class="note">Create a room and send the invite link to a friend, or join theirs with its code. Everyone in a room sees and bumps into each other; all the lab tools still work.</p>
      <label>Your name <input class="name" maxlength="24" placeholder="Player" autocomplete="nickname"></label>
      <button class="primary create">Create a room</button>
      <h3>Join a room</h3>
      <div class="join-row"><input class="code" maxlength="5" placeholder="CODE" autocapitalize="characters" spellcheck="false"><button class="join">Join</button></div>
      <p class="error"></p>
      <p class="note"><a href="${o.page}">Offline lab</a> · <a href="/">Home</a></p>`;
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
          levelId: o.levelId,
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
                  error.textContent ||= disconnected ?? "Lost connection to the server.";
                  disconnected = null; // the lobby stays up: a room joined next starts connected
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
            onEvents: (tick, events) => gameEvents(tick, events),
            onPanels: (_tick, ops, changes) => panelEvents(ops, changes),
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

  /** A match page that can't go on (a room that can't be joined, a lost connection): why, and the way back to Play. */
  function matchFail(why: string) {
    const panel = $(".lobby");
    app.classList.add("disconnected");
    panel.classList.remove("hidden");
    panel.innerHTML = `<h2>${escapeHtml(o.title)}</h2><p class="error">${escapeHtml(why)}</p><p class="note"><a href="/play.html">Back to Play</a></p>`;
  }

  /**
   * A match page's room: the one in the link (`?room=CODE`), or a new one in the link's format (`?format=`, the Play
   * page's Create), under the name the Play page remembered. Resolves once the room's level is loaded; a room that
   * can't be joined leaves a message and a way back to the Play page.
   */
  function matchRoom(): Promise<OnlineConnection> {
    const code = (params.get("room") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    const format = params.get("format");
    const fail = matchFail;
    if (!code && !format) {
      location.replace("/play.html");
      return new Promise(() => {});
    }
    let name = params.get("name") ?? "";
    try {
      name ||= localStorage.getItem("redmond.name") ?? "";
    } catch {
      // storage blocked: the default name
    }
    $(".center-msg").textContent = "Connecting…";
    $(".center-msg").classList.remove("hidden");
    return new Promise((resolve) => {
      let joined = false;
      const conn: OnlineConnection = new OnlineConnection({
        name: name.trim().slice(0, 24) || "Player",
        room: code || null,
        format: format ?? undefined,
        levelId: o.levelId,
        conditions: () => conditions,
        session: {
          onWelcome: () => {
            if (conn.closed) return;
            joined = true;
            void conn.session.loaded().then(() => {
              if (conn.closed) return fail(disconnected ?? "Lost connection to the server.");
              const url = new URL(location.href);
              url.searchParams.delete("format");
              url.searchParams.delete("name");
              url.searchParams.set("room", conn.session.roomCode);
              history.replaceState(null, "", url); // a reload rejoins, and the link is the invite
              resolve(conn);
            });
          },
          onError: (_code, message) => {
            if (joined) return flash(message, "bad");
            conn.close();
            fail(message);
          },
          onRoster: () => (rosterChanged = true),
          onShot: (shot) => showShot(shot),
          onEvents: (tick, events) => gameEvents(tick, events),
          onPanels: (_tick, ops, changes) => panelEvents(ops, changes),
          trackMispredictions: autotest,
          onLocalEvents: (events) => onWeaponEvents(events),
        },
        onClose: (reason) => {
          if (joined) disconnected = reason;
          else fail(reason);
        },
      });
    });
  }

  /**
   * Our first body comes with the roster; we predict from the server's exact state once that arrives. A match page
   * starts with the match's state instead, often with no body at all (NO_BODY until the server spawns one).
   */
  async function firstBody(c: OnlineConnection): Promise<PlayerController> {
    while (o.match ? !c.session.match : !c.session.ready) {
      if (disconnected) {
        $(".center-msg").textContent = disconnected;
        $(".center-msg").classList.remove("hidden");
        throw new Error(disconnected);
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    return c.session.ctrl ?? NO_BODY;
  }

  /** Offline with a room of its own (the Range Lab): a Web Worker runs it, and we talk to it like the server. */
  function localRoom(): Promise<OnlineConnection> {
    return new Promise((resolve) => {
      let joined = false;
      const conn: OnlineConnection = new OnlineConnection({
        name: "You",
        room: null,
        levelId: o.levelId,
        conditions: () => conditions,
        socket: () => new LocalSocket(),
        session: {
          onWelcome: () => {
            joined = true;
            void conn.session.loaded().then(() => resolve(conn));
          },
          onError: (_code, message) => flash(message, "bad"),
          onRoster: () => (rosterChanged = true),
          onShot: (shot) => showShot(shot),
          onEvents: (tick, events) => gameEvents(tick, events),
          onPanels: (_tick, ops, changes) => panelEvents(ops, changes),
          trackMispredictions: autotest,
          onLocalEvents: (events) => onWeaponEvents(events),
        },
        onClose: (reason) => {
          disconnected = reason;
          if (!joined) {
            $(".center-msg").textContent = reason;
            $(".center-msg").classList.remove("hidden");
          }
        },
      });
    });
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
  /** When followServer last ran: a page that was busy itself (loading the level, a stalled tab) hasn't read what arrived yet. */
  let followedAt = 0;

  function followServer(elapsed: number): boolean {
    const s = net!.session;
    const now = performance.now();
    const awake = now - followedAt < 1000;
    followedAt = now;
    if (!disconnected && awake && s.lastSnapshotAt && now - s.lastSnapshotAt > SILENT_MS) {
      disconnected = "Lost connection to the server.";
      net!.close();
    }
    // Other players' views are rebuilt with their (new) name tags, with a body of our own or not (a match page).
    const newRoster = rosterChanged;
    if (newRoster) {
      rosterChanged = false;
      for (const [id, v] of pawnViews)
        if (sim.pawns.get(id)?.proxy !== false) {
          v.dispose();
          pawnViews.delete(id);
          drawnView.delete(id);
        }
    }
    if (disconnected || !s.ready || !s.ctrl || !sim.pawns.has(s.ctrl.possessedPawnId)) {
      if (newRoster && !$(".pause").classList.contains("hidden")) renderPause();
      return false;
    }
    // A new body first (respawn, operator or loadout pick): what is drawn next (the pause menu) reads it.
    const newBody = s.ctrl !== ctrl;
    if (newBody) {
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
    }
    if ((newBody || newRoster) && !$(".pause").classList.contains("hidden")) renderPause();
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

  /** Whose drone (or body) a pawn is, from the roster. */
  function ownerName(id: number): string {
    return net?.session.roster.find((e) => e.pawnIds.includes(id) || e.drones.includes(id))?.name ?? "";
  }

  /**
   * The feed row over a drone's or a camera's view (Phase 7, intel/DESIGN.md §5): every camera, or every drone in the
   * list (your own, then your teammates'), the one watched lit, a broken one struck out, a teammate's greyed.
   */
  function feedRow(): string {
    if (ctrl.cam) {
      return Array.from({ length: sim.camCount() }, (_, i) => {
        const cls = [i === ctrl.cam - 1 ? "on" : "", sim.camWorks(i) ? "" : "broken"].filter(Boolean).join(" ");
        return `<span class="${cls}">${sim.bpCamAt(i) ? "BP" : i + 1}</span>`;
      }).join("");
    }
    const viewed = sim.viewedPawnId(ctrl.id);
    const own = sim.dronesOf(ctrl);
    const self = sim.pawns.get(ctrl.possessedPawnId);
    const list = self?.kind === PawnKind.Drone ? [self, ...sim.feedDrones(ctrl).filter((p) => !ctrl.pawnIds.includes(p.id))] : sim.feedDrones(ctrl);
    return list
      .map((p) => {
        const mine = ctrl.pawnIds.includes(p.id);
        const cls = [p.id === viewed ? "on" : "", mine ? "" : "view"].filter(Boolean).join(" ");
        return `<span class="${cls}">${mine ? `D${own.indexOf(p) + 1}` : escapeHtml((ownerName(p.id) || "?").slice(0, 3).toUpperCase())}</span>`;
      })
      .join("");
  }

  /** One view per body in the simulation: blue for ours, orange with a name tag for everyone else. */
  function syncPawnViews() {
    for (const [id, v] of pawnViews)
      if (!sim.pawns.has(id)) {
        v.dispose();
        pawnViews.delete(id);
        drawnView.delete(id);
      }
    for (const pawn of sim.pawns.values())
      if (!pawnViews.has(pawn.id)) {
        const size = data.intel.drone.sizeM;
        pawnViews.set(pawn.id, pawn.proxy ? new PawnView(scene, 0xf97316, nameOfPawn(pawn.id) || undefined, undefined, pawn.kind, size) : new PawnView(scene, 0x3b82f6, undefined, undefined, pawn.kind, size));
      }
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
  /** The placed gadget in hand's outline where Fire held would put it (only while it can be placed there). */
  function poseOutline() {
    const p = possessed();
    const spot = p && p.state.gAct !== GadgetAct.Equip && !ctrl.cam && !ctrl.drone ? placeSpotFor(sim, p) : null;
    outline.visible = spot !== null;
    if (!spot || !p) return;
    const g = slotGadget(data, p.loadout, handSlot(p.state.hand) as 1 | 2)!;
    const [w, h, d] = g.sizeM;
    outline.scale.set(w, spot.flat ? d : h, spot.flat ? h : d);
    outline.position.set(...spot.pos);
    outline.rotation.set(0, spot.yaw, 0);
  }

  /** The gadget in a body's hands as the viewmodel draws it, or null (the weapon). */
  function heldGadget(p: Pawn, s: PawnState): { data: GadgetData; detonator: boolean } | null {
    const slot = handSlot(s.hand);
    const g = slot === 0 ? null : slotGadget(data, p.loadout, slot);
    return g ? { data: g, detonator: isDetonator(s.hand) } : null;
  }

  function onWeaponEvents(events: readonly SimEvent[]) {
    gadgetModels.onLocalEvents(events, net ? net.session.serverTick() : sim.tick);
    fx.own(events, ctrl.pawnIds, ownMuzzle, performance.now(), (slot) => possessed()?.loadout?.weapons[slot].suppressed ?? false);
    for (const e of events) {
      if (e.kind === "shot" && e.pawnId === ctrl.possessedPawnId) viewmodel.shot(performance.now(), possessed().loadout?.weapons[e.slot].suppressed ?? false);
      else if (e.kind === "dry" && e.pawnId === ctrl.possessedPawnId) flash("Empty", "info");
      else if (e.kind === "death" && e.cause === "bleed" && !net && ctrl.pawnIds.includes(e.pawnId)) {
        // Offline nobody sends a kill to word it (online the server's does).
        death = { pawnId: e.pawnId, life: sim.pawns.get(e.pawnId)?.life ?? 0, text: "You bled out" };
      } else if (e.kind === "kick" && e.pawnId === sim.viewedPawnId(ctrl.id)) {
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
    for (const fn of hooks.shot) fn(shot);
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

  // A weapon's name, or a gadget's (Phase 8: a blast's kill names it), or a level ingredient's ("gas_pipe": Gas pipe).
  const weaponName = (id: string) => data.weapons.get(id)?.name ?? data.gadgets.get(id)?.name ?? id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  const nameOfCtrl = (id: number) => net?.session.roster.find((e) => e.controllerId === id)?.name ?? "someone";
  /** Recent server events for the e2e scripts. */
  const recentEvents: GameEvent[] = [];
  const feedNames = { ctrl: nameOfCtrl, pawn: nameOfPawn, weapon: weaponName };

  function onGameEvents(tick: number, events: GameEvent[]) {
    const me = net!.session.you;
    fx.server(tick, events);
    for (const fn of hooks.events) fn(tick, events);
    for (const e of events) {
      recentEvents.push(e);
      if (recentEvents.length > 50) recentEvents.shift();
      const now = performance.now();
      if (e.kind === "hitConfirm") hitMarkers.confirm(now, e);
      else if (e.kind === "damageTaken") {
        // Which way it came from, relative to where you're looking.
        const at = sim.pawns.get(e.pawnId)?.state ?? possessed()?.state;
        if (at) damageHud.hurt(now, e.from ? damageArcDeg(at, controls.yaw, e.from) : null);
      } else {
        const line = feedLine(e, feedNames, { ctrl: me, pawns: ctrl.pawnIds });
        if (line) killFeed.push(line, now);
        if (e.kind === "kill" && e.victimCtrl === me) death = { pawnId: e.victimPawn, life: sim.pawns.get(e.victimPawn)?.life ?? 0, text: deathLine(e, feedNames) };
        // Intel (Phase 7): pings, scans and callouts from your team (and word that you were spotted).
        if (e.kind === "ping") {
          // An enemy gadget pinged (Phase 8 M3) is named with it.
          const what = e.gadget >= 0 ? ` · ${data.gadgets.get(kindId(e.gadget) ?? "")?.name ?? kindId(e.gadget)}` : "";
          intelHud.ping(e, `${e.ctrl === me ? "you" : nameOfCtrl(e.ctrl)}${what}`, now);
        } else if (e.kind === "stunned") {
          if (e.blind > 0) stunned = { blind: e.blind, start: now, end: now + e.seconds * 1000 };
          if (e.concuss) concussed = { start: now, end: now + e.seconds * 1000 };
        } else if (e.kind === "alarm") {
          if (e.on && ctrl.pawnIds.includes(e.pawnId)) flash(kindId(sim.gadgets.get(e.gadget)?.kind ?? -1) === "metal_detector" ? "Metal detector: you set it off" : "Proximity alarm: you set it off", "bad");
        }
        else if (e.kind === "spotted") {
          if (ctrl.pawnIds.includes(e.pawnId)) flash("You've been spotted", "bad");
          else intelHud.spotted(e, now);
        } else if (e.kind === "callout") killFeed.push({ text: `${e.name}: ${data.intel.callouts[e.id] ?? "?"}`, mine: false, callout: true }, now);
      }
    }
  }

  /**
   * A stun's flash (Phase 8 M3): white over everything, held for the first half of it and fading over the rest; a
   * concussion: a blur that fades. An EMP on our body (DSEG): static over the sights while aiming, and a warning as it
   * starts.
   */
  function updateStunHud(now: number) {
    let white = 0;
    if (stunned && now < stunned.end) {
      const mid = (stunned.start + stunned.end) / 2;
      white = stunned.blind * (now < mid ? 1 : (stunned.end - now) / (stunned.end - mid));
    } else stunned = null;
    // (Written only when they change: a style set every frame costs a style recalculation every frame.)
    const opacity = white.toFixed(2);
    const whiteEl = $(".stun-white");
    if (whiteEl.style.opacity !== opacity) whiteEl.style.opacity = opacity;
    const blur = concussed && now < concussed.end ? (4 * (concussed.end - now)) / (concussed.end - concussed.start) : 0;
    if (!blur) concussed = null;
    const filter = blur > 0 ? `blur(${blur.toFixed(1)}px)` : "";
    const canvas = view.querySelector("canvas")!;
    if (canvas.style.filter !== filter) canvas.style.filter = filter;
    const body = livingBody();
    const jammed = body !== null && body.state.jammed > 0;
    if (jammed && !wasJammed) flash("EMP: your sights, cameras, drones and detonator are off for a while", "bad");
    wasJammed = jammed;
    $(".emp-static").classList.toggle("hidden", !(jammed && body!.state.adsQ > 32768));
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
      const hit = raycastLevel(sim, [from.x, from.y, from.z], [dir.x, dir.y, dir.z], 60);
      if (!hit) continue;
      let dot = laserDots.get(id);
      if (!dot) {
        dot = new THREE.Sprite(laserMat);
        dot.scale.setScalar(0.035);
        scene.add(dot);
        laserDots.set(id, dot);
      }
      dot.position.copy(from).addScaledVector(dir, hit.t - 0.01);
      dot.visible = true;
      seen.add(id);
    }
    for (const [id, dot] of laserDots) {
      if (seen.has(id)) continue;
      if (pawnViews.has(id)) dot.visible = false;
      else {
        scene.remove(dot); // that body is gone (a respawn, a new loadout)
        laserDots.delete(id);
      }
    }
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
      if (r.outcome === "killed") death = { pawnId: p.id, life: p.life, text: "You died" };
    }
  }

  let bytesSeen = { in: 0, out: 0 };
  function updateNetStats(ms: number) {
    const s = net!.session;
    const kbps = (bytes: number) => ((bytes * 8) / ms).toFixed(0); // bits per ms = kbit/s
    $(".net").textContent = [
      `room ${s.roomCode} · ${s.roster.filter((e) => e.kind === 0).length} here`,
      `ping ${Math.round(s.rttMs)} ms${conditions.rttMs || conditions.jitterMs || conditions.lossPct ? ` (simulated +${conditions.rttMs} ms${conditions.jitterMs ? `, ±${conditions.jitterMs}` : ""}${conditions.lossPct ? `, ${conditions.lossPct} % loss` : ""})` : ""}`,
      `others drawn ${Math.round(s.interpDelayMs)} ms (${((s.interpDelayMs / 1000) * TICK_HZ).toFixed(1)} ticks) behind`,
      `corrections ${s.stats.corrections}`,
      `↓${kbps(s.stats.bytesIn - bytesSeen.in)} ↑${kbps(s.stats.bytesOut - bytesSeen.out)} kbps`,
    ].join(" · ");
    bytesSeen = { in: s.stats.bytesIn, out: s.stats.bytesOut };
  }

  gameEvents = onGameEvents;
  panelEvents = (ops, changes) => fx.panels(ops, changes, performance.now());
  requestAnimationFrame(frame);
}
