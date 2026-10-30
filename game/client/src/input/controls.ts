// Turns keyboard, mouse and touch into per-tick InputCmds. Toggle vs hold is resolved here, so the
// simulation only ever sees the desired stance/lean (PLAN §7). Camera orientation uses the latest mouse
// position every frame; the simulation samples it once per tick.
import { Btn, clamp, DEG, quantizeInput, Stance, wrapAngle, type InputCmd } from "@redmond/shared";
import { adsSensitivity, type Keybinds, type Settings } from "./settings.js";

export type Action = keyof Keybinds | "ads" | "fire" | "swap" | "hitboxes" | "thirdPerson" | "help" | "settings";

/** One-shot actions the lab handles itself (not sent to the simulation). */
export type UiAction = "respawn" | "hitboxes" | "thirdPerson" | "help" | "settings" | "fire" | "stats";

/** F2 is left to the pages (the Range Lab's overlay); F5–F7 and F9–F12 are browser shortcuts. */
const UI_KEYS: Record<string, UiAction> = { F1: "help", F3: "hitboxes", F4: "thirdPerson", F8: "stats", Escape: "settings" };

/** The ping key held this many ticks opens the comm wheel (a shorter press pings on its release). */
const WHEEL_TICKS = 16;
/** The comm wheel: the mouse's travel (counts) that picks a callout, and how far it is kept from the middle. */
const WHEEL_DEAD = 30;
const WHEEL_REACH = 120;

/**
 * Keys that, on a drone or a camera (Phase 7), would flip a toggle or ask for a weapon the body standing idle would
 * then take back: they don't (a lean switches the feed instead).
 */
const FEED_IGNORES = new Set<Action>(["crouch", "prone", "leanLeft", "leanRight", "ads", "primary", "secondary", "swap"]);

/** Keys that change the body's pose; ignored while stanceLocked() (see there). */
const STANCE_ACTIONS = new Set<Action>(["crouch", "prone", "leanLeft", "leanRight", "ads"]);

/** View limits the simulation will enforce next tick, applied every frame so the camera never jitters. */
export interface ViewLimits {
  pitchMin: number;
  pitchMax: number;
  /** Max yaw change per tick from the body's yaw (prone turn rate), or null for free turning. */
  maxYawStep: number | null;
  /** The yaws the view may take (on a rope: either side of facing the wall), or none. */
  yawRange?: { center: number; half: number } | null;
}

/** `yaw` kept within `range` (the nearer edge when outside it). */
function inRange(yaw: number, range: { center: number; half: number } | null | undefined): number {
  if (!range) return yaw;
  const d = wrapAngle(yaw - range.center);
  return Math.abs(d) <= range.half ? yaw : wrapAngle(range.center + Math.sign(d) * range.half);
}

export class Controls {
  yaw = 0;
  pitch = 0;
  limits: ViewLimits = { pitchMin: -89 * DEG, pitchMax: 89 * DEG, maxYawStep: null };
  /** When this returns true (a menu is open), game keys are ignored. */
  isBlocked: () => boolean = () => false;
  /**
   * When this returns true (Skopós is on her other shell's camera or mid-swap), stance, lean and aim keys
   * are ignored: the simulation doesn't use them there, and they would silently apply to the body you
   * return to.
   */
  stanceLocked: () => boolean = () => false;
  /**
   * The predicted weapon state (slot in hand, and whether a swap is still bringing it up), so 1 / 2 / the
   * wheel turn into a single swap press only when the slot would change (C16 in the Phase 3 plan).
   */
  weaponState: () => { slot: number; equipping: boolean; zoom?: number } | null = () => null;
  /** When this returns true (a map's plan view zooms with it), the mouse wheel doesn't switch weapons. */
  wheelTaken: () => boolean = () => false;
  /**
   * When this returns true (the lab's free camera is flying), a key only counts as held (the camera flies
   * with isHeld) and does nothing for the body: no toggle, pulse or weapon request is left to reach it
   * afterwards. The use key calls onFlyUse instead.
   */
  flying: () => boolean = () => false;
  onFlyUse: () => void = () => {};
  /** Touch joystick, -1..1 each. */
  touchMove = { x: 0, y: 0 };
  private held = new Set<Action>();
  private stanceIntent: Stance = Stance.Stand;
  private leanIntent: -1 | 0 | 1 = 0;
  private adsToggled = false;
  private sprintLatched = false;
  private interactPulse = false;
  private abilityPulse = false;
  private vaultPulse = false;
  /** A click shorter than a tick still fires: Fire is sent for at least one tick (D-055). */
  private firePulse = false;
  private reloadPulse = false;
  private fireModePulse = false;
  private meleePulse = false;
  private dropPulse = false;
  private observePulse = false;
  /** The gadget key is held to place a camera (Phase 7); a tap shorter than a tick still goes out once (its dart). */
  private gadgetPulse = false;
  /**
   * On a drone or a camera (Phase 7) the lean keys are held, whatever the lean setting: a new press goes to the previous
   * / next feed.
   */
  onDrone: () => boolean = () => false;
  /** A lean pressed on a feed, sent for the next tick even if let go before it (−1 / 1; 0: none). */
  private leanPulse: -1 | 0 | 1 = 0;
  /**
   * The ping key (Phase 7, intel/DESIGN.md §6): a tap pings where you look (sent for one tick when it's let go); held
   * for WHEEL_TICKS it opens the comm wheel instead, where the mouse points at a callout and letting go sends it.
   */
  private pingDown = false;
  private pingTicks = 0;
  private pingPulse = false;
  /** The comm wheel while it's open: the mouse's travel since it opened (counts), which picks the callout. */
  private wheel: { x: number; y: number } | null = null;
  /** How many callouts the comm wheel holds (0: none here, and a held ping key pings when let go). */
  wheelSize: () => number = () => 0;
  /** A callout picked off the comm wheel (its number in data/intel.json `callouts`). */
  onCallout: (id: number) => void = () => {};
  /** The weapon slot asked for with 1 / 2 / the wheel, until the simulation is holding it. */
  private wantSlot: 0 | 1 | null = null;
  private sentSwap = false;
  private wasOnLadder = false;
  private wasOnRope = false;
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
    // Only a toggle remembers a stance: with hold binds, the resting intent is always standing.
    const toggled = (stance === Stance.Crouch && this.settings.crouchMode === "toggle") || (stance === Stance.Prone && this.settings.proneMode === "toggle");
    this.stanceIntent = toggled ? stance : Stance.Stand;
    this.leanIntent = 0;
    this.adsToggled = false;
  }

  /** Whether an action's key is down (the lab's free camera flies with the movement keys). */
  isHeld(action: Action): boolean {
    return this.held.has(action);
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
      else if (e.button === 0) {
        this.press("fire");
        this.onUi("fire"); // the lab notes which frame was on screen (lag compensation rewinds to it)
      }
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 2) this.release("ads");
      else if (e.button === 0) this.release("fire");
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (document.pointerLockElement !== canvas || this.isBlocked() || this.wheelTaken() || e.deltaY === 0) return;
        this.press("swap");
        this.release("swap");
      },
      { passive: true },
    );
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("pointerlockchange", (e) => this.pointerLock(document.pointerLockElement === canvas, e.timeStamp));
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === canvas) this.mouseMove(e.movementX, e.movementY, e.timeStamp);
    });
  }

  /** When the pointer was last locked (the change event's time, ms), or null while it isn't. */
  private lockedAt: number | null = null;

  /** The pointer was locked to the game view or let go; `at` is the change event's time. */
  pointerLock(locked: boolean, at: number) {
    this.lockedAt = locked ? at : null;
  }

  /**
   * The mouse moved (counts) at event time `at`. It turns the view only once the pointer is locked, and only
   * if it moved after the lock: Chrome hands a move over at the next frame, so the move onto a Go to or Resume
   * button, whose click locks the pointer, could otherwise arrive locked and turn away from the view just set.
   */
  mouseMove(dx: number, dy: number, at: number) {
    if (this.lockedAt !== null && at >= this.lockedAt) this.look(dx, dy);
  }

  lockPointer(canvas: HTMLCanvasElement) {
    const raw = this.settings.rawInput;
    // Raw input where the browser supports it (PLAN §7); fall back to plain pointer lock only when raw
    // input itself is unsupported. Other failures (e.g. no user gesture) are ignored.
    Promise.resolve(canvas.requestPointerLock(raw ? ({ unadjustedMovement: true } as PointerLockOptions) : undefined))
      .catch((e: unknown) => (raw && (e as { name?: string })?.name === "NotSupportedError" ? canvas.requestPointerLock() : undefined))
      .catch(() => {});
  }

  /**
   * Mouse or touch look, in counts/pixels. The prone turn rate is not applied here: each of the frame's
   * ticks turns toward this yaw by one step (sample), then applyLimits drops what they couldn't reach, so
   * the turn rate doesn't depend on the frame rate.
   */
  look(dx: number, dy: number, scale = 1) {
    if (this.wheel) {
      // The comm wheel is open: the mouse points at a callout instead of turning the view.
      const w = this.wheel;
      w.x += dx;
      w.y += dy;
      const l = Math.hypot(w.x, w.y);
      if (l > WHEEL_REACH) {
        w.x *= WHEEL_REACH / l;
        w.y *= WHEEL_REACH / l;
      }
      return;
    }
    // Upside down on a rope the view is turned over: a move turns it the way it goes on the screen.
    const sens = this.settings.sensitivity * (this.adsActive ? adsSensitivity(this.settings, this.weaponState()?.zoom ?? 1) : 1) * scale * DEG * (this.upsideDown ? -1 : 1);
    this.yaw = inRange(wrapAngle(this.yaw - dx * sens), this.limits.yawRange);
    this.pitch = clamp(this.pitch - dy * sens * (this.settings.invertY ? -1 : 1), this.limits.pitchMin, this.limits.pitchMax);
  }

  /** The body looked through hangs upside down on a rope (the lab sets it every frame). */
  upsideDown = false;

  /**
   * Clamp the view to what the simulation will accept next tick (pitch arc, prone turn rate, a rope's yaw
   * range). Call once per frame, after that frame's ticks and before rendering.
   */
  applyLimits() {
    const l = this.limits;
    this.pitch = clamp(this.pitch, l.pitchMin, l.pitchMax);
    if (l.maxYawStep !== null) {
      const d = wrapAngle(this.yaw - this.sampledYaw);
      if (Math.abs(d) > l.maxYawStep) this.yaw = this.sampledYaw + Math.sign(d) * l.maxYawStep;
    }
    this.yaw = inRange(wrapAngle(this.yaw), l.yawRange);
  }

  press(action: Action) {
    if (this.flying() && action !== "respawn") {
      if (action === "interact") this.onFlyUse();
      else this.held.add(action);
      return;
    }
    if (STANCE_ACTIONS.has(action) && this.stanceLocked()) return;
    const s = this.settings;
    this.held.add(action);
    if (this.onDrone() && FEED_IGNORES.has(action)) {
      // On a drone or a camera (Phase 7) the body's toggles and weapons stay as they were (it stands idle), and a lean
      // goes to the previous / next feed: for one tick at least, so a tap between ticks (or a touch button's) counts.
      if (action === "leanLeft" || action === "leanRight") this.leanPulse = this.lastLeanHold = action === "leanLeft" ? -1 : 1;
      return;
    }
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
      case "vault":
        // Also sent for one tick after a tap shorter than a frame ("Space to mantle" while standing still).
        this.vaultPulse = true;
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
      case "fire":
        this.firePulse = true;
        break;
      case "reload":
        this.reloadPulse = true;
        break;
      case "fireMode":
        this.fireModePulse = true;
        break;
      case "melee":
        this.meleePulse = true;
        break;
      case "drop":
        this.dropPulse = true;
        break;
      case "observe":
        this.observePulse = true;
        break;
      case "gadget":
        this.gadgetPulse = true;
        break;
      case "ping":
        this.pingDown = true;
        this.pingTicks = 0;
        break;
      case "primary":
        this.wantSlot = 0;
        break;
      case "secondary":
        this.wantSlot = 1;
        break;
      case "swap": {
        // The other weapon (mouse wheel, touch button).
        const ws = this.weaponState();
        if (ws) this.wantSlot = ws.slot === 0 ? 1 : 0;
        break;
      }
    }
  }

  release(action: Action) {
    this.held.delete(action);
    if (action === "ping" && this.pingDown) {
      this.pingDown = false;
      if (this.wheel) {
        const pick = this.wheelPick;
        this.wheel = null;
        if (pick !== null && pick !== undefined) this.onCallout(pick);
      } else this.pingPulse = true;
    }
  }

  releaseAll() {
    this.held.clear();
    this.touchMove.x = this.touchMove.y = 0;
    // A ping key let go with the page (a menu, another window): nothing is sent.
    this.pingDown = false;
    this.wheel = null;
  }

  /** The comm wheel: undefined while it's closed; the callout the mouse points at, or null in its middle. */
  get wheelPick(): number | null | undefined {
    if (!this.wheel) return undefined;
    const n = this.wheelSize();
    if (n === 0 || Math.hypot(this.wheel.x, this.wheel.y) < WHEEL_DEAD) return null;
    const a = Math.atan2(this.wheel.x, -this.wheel.y); // 0 up, clockwise
    return ((Math.round(a / ((2 * Math.PI) / n)) % n) + n) % n;
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
    if (this.held.has("vault") || this.vaultPulse) buttons |= Btn.Vault;
    // Interact is held (reviving takes 4 s, DECISIONS D-049); a tap shorter than a tick still goes out once.
    if (this.held.has("interact") || this.interactPulse) buttons |= Btn.Interact;
    if (this.adsActive) buttons |= Btn.Ads;
    if (this.held.has("slowWalk")) buttons |= Btn.SlowWalk;
    if (this.abilityPulse) buttons |= Btn.Ability;
    if (this.held.has("fire") || this.firePulse) buttons |= Btn.Fire;
    if (this.reloadPulse) buttons |= Btn.Reload;
    if (this.fireModePulse) buttons |= Btn.FireMode;
    if (this.meleePulse) buttons |= Btn.Melee;
    if (this.dropPulse) buttons |= Btn.Drop;
    if (this.observePulse) buttons |= Btn.Observe;
    if (this.held.has("gadget") || this.gadgetPulse) buttons |= Btn.Gadget;
    if (this.pingDown && !this.wheel && ++this.pingTicks >= WHEEL_TICKS && this.wheelSize() > 0) this.wheel = { x: 0, y: 0 };
    if (this.pingPulse) buttons |= Btn.Ping;
    // Weapon slot: one swap press, sent only while the slot differs and no swap is already under way
    // (a press then would be ignored); released for a tick in between so the next press is a new one.
    const ws = this.weaponState();
    // No weapon to switch (down, dead, between bodies): a request made now is dropped, not kept for later.
    if (!ws || ws.slot === this.wantSlot) this.wantSlot = null;
    if (this.wantSlot !== null && ws && !ws.equipping && !this.sentSwap) {
      buttons |= Btn.Swap;
      this.sentSwap = true;
    } else this.sentSwap = false;
    this.vaultPulse = false;
    this.interactPulse = false;
    this.abilityPulse = false;
    this.firePulse = false;
    this.reloadPulse = false;
    this.fireModePulse = false;
    this.meleePulse = false;
    this.dropPulse = false;
    this.observePulse = false;
    this.gadgetPulse = false;
    this.pingPulse = false;

    const s = this.settings;
    let stance = this.stanceIntent;
    if (s.proneMode === "hold" && this.held.has("prone")) stance = Stance.Prone;
    else if (s.crouchMode === "hold" && this.held.has("crouch")) stance = Stance.Crouch;

    let lean: -1 | 0 | 1 = this.leanIntent;
    if (s.leanMode === "hold" || this.onDrone()) {
      const l = this.held.has("leanLeft");
      const r = this.held.has("leanRight");
      lean = l && r ? this.lastLeanHold : l ? -1 : r ? 1 : 0;
    }
    if (this.onDrone() && lean === 0) lean = this.leanPulse;
    this.leanPulse = 0;
    // Prone: turn toward the view by at most one step from where the body is (re-anchored in syncView).
    const step = this.limits.maxYawStep;
    const yaw = step === null ? this.yaw : wrapAngle(this.sampledYaw + clamp(wrapAngle(this.yaw - this.sampledYaw), -step, step));
    const cmd = quantizeInput({ seq, forward, strafe, yaw, pitch: this.pitch, buttons, stance, lean });
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
   * After a tick, apply any clamp the simulation made to the view we sent (pitch limits, a dead body's
   * frozen view). Mouse movement since the sample is kept. A prone turn is not corrected here: the next
   * step is measured from the body's real yaw, so a turn refused at a wall can't run further ahead.
   */
  syncView(simYaw: number, simPitch: number, kick: { yaw: number; pitch: number } = { yaw: 0, pitch: 0 }) {
    // Recoil turned the body's view this tick: carry it into ours exactly (also while prone, where the
    // clamp check below is skipped), so the next input already includes it (DECISIONS D-041).
    if (kick.yaw !== 0 || kick.pitch !== 0) {
      this.yaw = wrapAngle(this.yaw + kick.yaw);
      this.pitch += kick.pitch;
      this.sampledYaw = wrapAngle(this.sampledYaw + kick.yaw);
      this.sampledPitch += kick.pitch;
    }
    const dyaw = wrapAngle(simYaw - this.sampledYaw);
    if (this.limits.maxYawStep === null && Math.abs(dyaw) > 1e-4) this.yaw = wrapAngle(this.yaw + dyaw);
    const dpitch = simPitch - this.sampledPitch;
    if (Math.abs(dpitch) > 1e-4) this.pitch += dpitch;
    this.sampledYaw = simYaw;
    this.sampledPitch = simPitch;
  }

  /**
   * Keep toggles in line with what the simulation did this tick: sprinting stands you up and cancels a
   * lean (when data says so), and grabbing a ladder stands you up. On the ladder the crouch toggle is left
   * alone, so it starts and stops a slide down; on a rope it turns you over, so off the rope it's the body's
   * stance again (on your feet, or crouched climbing in under a low lintel).
   */
  afterTick(state: { sprinting: boolean; onLadder: boolean; onRope: boolean; stance: Stance }, rules: { forcesStand: boolean; sprintCancelsLean: boolean }) {
    if (state.sprinting && rules.forcesStand) this.stanceIntent = Stance.Stand;
    if (state.sprinting && rules.sprintCancelsLean) this.leanIntent = 0;
    if (state.onLadder && !this.wasOnLadder) this.resetStance();
    if (!state.onRope && this.wasOnRope) this.resetStance(state.stance);
    this.wasOnLadder = state.onLadder;
    this.wasOnRope = state.onRope;
  }

  /** Stance the player is asking for (for the HUD). */
  get desiredStance(): Stance {
    return this.stanceIntent;
  }
}
