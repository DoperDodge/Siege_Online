// Turns keyboard, mouse and touch into per-tick InputCmds. Toggle vs hold is resolved here, so the
// simulation only ever sees the desired stance/lean (PLAN §7). Camera orientation uses the latest mouse
// position every frame; the simulation samples it once per tick.
import { Btn, clamp, DEG, quantizeInput, Stance, wrapAngle, type InputCmd } from "@redmond/shared";
import type { Keybinds, Settings } from "./settings.js";

export type Action = keyof Keybinds | "ads" | "hitboxes" | "thirdPerson" | "help" | "settings";

/** One-shot actions the lab handles itself (not sent to the simulation). */
export type UiAction = "respawn" | "hitboxes" | "thirdPerson" | "help" | "settings";

const UI_KEYS: Record<string, UiAction> = { F1: "help", F3: "hitboxes", F4: "thirdPerson", Escape: "settings" };

export class Controls {
  yaw = 0;
  pitch = 0;
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

  constructor(
    private settings: Settings,
    private readonly onUi: (a: UiAction) => void,
  ) {}

  setSettings(s: Settings) {
    this.settings = s;
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
    addEventListener("keydown", (e) => {
      const ui = UI_KEYS[e.code];
      if (ui) {
        e.preventDefault();
        if (!e.repeat) this.onUi(ui);
        return;
      }
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
    const opts = this.settings.rawInput ? ({ unadjustedMovement: true } as const) : undefined;
    // Raw input where the browser supports it (PLAN §7), plain pointer lock otherwise.
    Promise.resolve(canvas.requestPointerLock(opts as PointerLockOptions)).catch(() => canvas.requestPointerLock());
  }

  /** Mouse or touch look, in counts/pixels. */
  look(dx: number, dy: number, scale = 1) {
    const sens = this.settings.sensitivity * (this.adsActive ? this.settings.adsSensitivityScale : 1) * scale * DEG;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens * (this.settings.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -89 * DEG, 89 * DEG);
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
        // Sprinting stands you up and clears a crouch/prone toggle, like Siege.
        this.stanceIntent = Stance.Stand;
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

  /** Stance the player is asking for (for the HUD). */
  get desiredStance(): Stance {
    return this.stanceIntent;
  }
}
