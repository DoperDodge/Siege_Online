// Turns keyboard, mouse and touch into per-tick InputCmds. Toggle vs hold is resolved here, so the
// simulation only ever sees the desired stance/lean (PLAN §7). Camera orientation uses the latest mouse
// position every frame; the simulation samples it once per tick.
import { Btn, clamp, DEG, quantizeInput, Stance, wrapAngle, type InputCmd } from "@redmond/shared";
import type { Keybinds, Settings } from "./settings.js";

export type Action = keyof Keybinds | "ads" | "hitboxes" | "thirdPerson" | "help" | "settings";

/** One-shot actions the lab handles itself (not sent to the simulation). */
export type UiAction = "respawn" | "hitboxes" | "thirdPerson" | "help" | "settings";

const UI_KEYS: Record<string, UiAction> = { F1: "help", F3: "hitboxes", F4: "thirdPerson", Escape: "settings" };

/** View limits the simulation will enforce next tick, applied every frame so the camera never jitters. */
export interface ViewLimits {
  pitchMin: number;
  pitchMax: number;
  /** Max yaw change from the last sampled yaw (prone turn rate), or null for free turning. */
  maxYawStep: number | null;
}

export class Controls {
  yaw = 0;
  pitch = 0;
  limits: ViewLimits = { pitchMin: -89 * DEG, pitchMax: 89 * DEG, maxYawStep: null };
  /** When this returns true (a menu is open), game keys are ignored. */
  isBlocked: () => boolean = () => false;
  /** Touch joystick, -1..1 each. */
  touchMove = { x: 0, y: 0 };
  private held = new Set<Action>();
  private stanceIntent: Stance = Stance.Stand;
  private leanIntent: -1 | 0 | 1 = 0;
  private adsToggled = false;
  private sprintLatched = false;
  private interactPulse = false;
  private abilityPulse = false;
  private lastLeanHold: -1 | 0 | 1 = 0;
  private sampledYaw = 0;
  private sampledPitch = 0;

  private settings: Settings;

  constructor(
    settings: Settings,
    private readonly onUi: (a: UiAction) => void,
  ) {
    // Keep a private copy: the lab edits its settings object in place, and mode-change detection in
    // setSettings needs the previous values.
    this.settings = { ...settings, keys: { ...settings.keys } };
  }

  setSettings(s: Settings) {
    // Switching a mode mid-toggle would otherwise leave you stuck crouched/prone/leaning/aiming.
    if (s.crouchMode !== this.settings.crouchMode || s.proneMode !== this.settings.proneMode) this.stanceIntent = Stance.Stand;
    if (s.leanMode !== this.settings.leanMode) this.leanIntent = 0;
    if (s.adsMode !== this.settings.adsMode) this.adsToggled = false;
    this.settings = { ...s, keys: { ...s.keys } };
  }

  /** Forget toggled stance/lean/ADS (respawn, teleport, or when the simulation forces a stance). */
  resetStance(stance: Stance = Stance.Stand) {
    this.stanceIntent = stance;
    this.leanIntent = 0;
    this.adsToggled = false;
  }

  get adsActive(): boolean {
    return this.settings.adsMode === "toggle" ? this.adsToggled : this.held.has("ads");
  }

  /** Start listening to keyboard and mouse on the page. */
  attach(canvas: HTMLCanvasElement) {
    const byCode = () => {
      const map = new Map<string, Action>();
      for (const [action, code] of Object.entries(this.settings.keys)) map.set(code, action as Action);
      return map;
    };
    const inMenu = (e: KeyboardEvent) => this.isBlocked() || (e.target instanceof Element && e.target.closest(".panel") !== null);
    addEventListener("keydown", (e) => {
      const ui = UI_KEYS[e.code];
      if (ui) {
        e.preventDefault();
        if (!e.repeat) this.onUi(ui);
        return;
      }
      if (inMenu(e)) return; // let menus keep their keys (arrow keys in selects, etc.)
      const action = byCode().get(e.code);
      if (!action) return;
      e.preventDefault();
      if (!e.repeat) this.press(action);
    });
    addEventListener("keyup", (e) => {
      const action = byCode().get(e.code);
      if (action) this.release(action);
    });
    addEventListener("blur", () => this.releaseAll());
    canvas.addEventListener("mousedown", (e) => {
      if (document.pointerLockElement !== canvas) {
        this.lockPointer(canvas);
        return;
      }
      if (e.button === 2) this.press("ads");
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 2) this.release("ads");
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === canvas) this.look(e.movementX, e.movementY);
    });
  }

  lockPointer(canvas: HTMLCanvasElement) {
    const raw = this.settings.rawInput;
    // Raw input where the browser supports it (PLAN §7); fall back to plain pointer lock only when raw
    // input itself is unsupported. Other failures (e.g. no user gesture) are ignored.
    Promise.resolve(canvas.requestPointerLock(raw ? ({ unadjustedMovement: true } as PointerLockOptions) : undefined))
      .catch((e: unknown) => (raw && (e as { name?: string })?.name === "NotSupportedError" ? canvas.requestPointerLock() : undefined))
      .catch(() => {});
  }

  /** Mouse or touch look, in counts/pixels. */
  look(dx: number, dy: number, scale = 1) {
    const sens = this.settings.sensitivity * (this.adsActive ? this.settings.adsSensitivityScale : 1) * scale * DEG;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens * (this.settings.invertY ? -1 : 1);
    this.applyLimits();
  }

  /** Clamp the view to what the simulation will accept next tick (pitch arc, prone turn rate). */
  applyLimits() {
    const l = this.limits;
    this.pitch = clamp(this.pitch, l.pitchMin, l.pitchMax);
    if (l.maxYawStep !== null) {
      const d = wrapAngle(this.yaw - this.sampledYaw);
      if (Math.abs(d) > l.maxYawStep) this.yaw = this.sampledYaw + Math.sign(d) * l.maxYawStep;
    }
    this.yaw = wrapAngle(this.yaw);
  }

  press(action: Action) {
    const s = this.settings;
    this.held.add(action);
    switch (action) {
      case "crouch":
        if (s.crouchMode === "toggle") this.stanceIntent = this.stanceIntent === Stance.Crouch ? Stance.Stand : Stance.Crouch;
        break;
      case "prone":
        if (s.proneMode === "toggle") this.stanceIntent = this.stanceIntent === Stance.Prone ? Stance.Stand : Stance.Prone;
        break;
      case "leanLeft":
        if (s.leanMode === "toggle") this.leanIntent = this.leanIntent === -1 ? 0 : -1;
        this.lastLeanHold = -1;
        break;
      case "leanRight":
        if (s.leanMode === "toggle") this.leanIntent = this.leanIntent === 1 ? 0 : 1;
        this.lastLeanHold = 1;
        break;
      case "ads":
        if (s.adsMode === "toggle") this.adsToggled = !this.adsToggled;
        break;
      case "sprint":
        // Pressing sprint drops a toggled aim; standing up and un-leaning follow the simulation's
        // sprint rules (see afterTick), so data stays the only authority.
        this.adsToggled = false;
        break;
      case "interact":
        this.interactPulse = true;
        break;
      case "ability":
        // Sent for exactly one tick so a quick tap (keyboard or touch) is never missed.
        this.abilityPulse = true;
        break;
      case "respawn":
        this.onUi(action);
        break;
    }
  }

  release(action: Action) {
    this.held.delete(action);
  }

  releaseAll() {
    this.held.clear();
    this.touchMove.x = this.touchMove.y = 0;
  }

  /** Touch has no comfortable "hold Shift": the sprint button latches until you stop moving forward. */
  toggleSprintLatch() {
    this.sprintLatched = !this.sprintLatched;
    if (this.sprintLatched) this.press("sprint"), this.release("sprint");
  }

  get sprintIsLatched() {
    return this.sprintLatched;
  }

  /** Build this tick's input. */
  sample(seq: number): InputCmd {
    const h = (a: Action) => (this.held.has(a) ? 1 : 0);
    const forward = clamp(h("forward") - h("back") + this.touchMove.y, -1, 1);
    const strafe = clamp(h("right") - h("left") + this.touchMove.x, -1, 1);
    if (this.sprintLatched && forward <= 0.2) this.sprintLatched = false;

    let buttons = 0;
    if (this.held.has("sprint") || this.sprintLatched) buttons |= Btn.Sprint;
    if (this.held.has("vault")) buttons |= Btn.Vault;
    if (this.interactPulse) buttons |= Btn.Interact;
    if (this.adsActive) buttons |= Btn.Ads;
    if (this.held.has("slowWalk")) buttons |= Btn.SlowWalk;
    if (this.abilityPulse) buttons |= Btn.Ability;
    this.interactPulse = false;
    this.abilityPulse = false;

    const s = this.settings;
    let stance = this.stanceIntent;
    if (s.proneMode === "hold" && this.held.has("prone")) stance = Stance.Prone;
    else if (s.crouchMode === "hold" && this.held.has("crouch")) stance = Stance.Crouch;

    let lean: -1 | 0 | 1 = this.leanIntent;
    if (s.leanMode === "hold") {
      const l = this.held.has("leanLeft");
      const r = this.held.has("leanRight");
      lean = l && r ? this.lastLeanHold : l ? -1 : r ? 1 : 0;
    }
    const cmd = quantizeInput({ seq, forward, strafe, yaw: this.yaw, pitch: this.pitch, buttons, stance, lean });
    this.sampledYaw = cmd.yaw;
    this.sampledPitch = cmd.pitch;
    return cmd;
  }

  /** Jump the view to a different body (Skopós camera / swap) without carrying over a stale clamp. */
  setView(yaw: number, pitch: number) {
    this.yaw = this.sampledYaw = yaw;
    this.pitch = this.sampledPitch = pitch;
  }

  /**
   * After a tick, apply any clamp the simulation made to the view we sent (prone turn limits, pitch
   * limits). Mouse movement since the sample is kept.
   */
  syncView(simYaw: number, simPitch: number) {
    const dyaw = wrapAngle(simYaw - this.sampledYaw);
    if (Math.abs(dyaw) > 1e-4) this.yaw = wrapAngle(this.yaw + dyaw);
    const dpitch = simPitch - this.sampledPitch;
    if (Math.abs(dpitch) > 1e-4) this.pitch += dpitch;
  }

  /**
   * Keep toggles in line with what the simulation did this tick: sprinting stands you up and cancels a
   * lean (when data says so), and grabbing a ladder stands you up.
   */
  afterTick(state: { sprinting: boolean; onLadder: boolean }, rules: { forcesStand: boolean; sprintCancelsLean: boolean }) {
    if (state.sprinting && rules.forcesStand) this.stanceIntent = Stance.Stand;
    if (state.sprinting && rules.sprintCancelsLean) this.leanIntent = 0;
    if (state.onLadder) this.stanceIntent = Stance.Stand;
  }

  /** Stance the player is asking for (for the HUD). */
  get desiredStance(): Stance {
    return this.stanceIntent;
  }
}
