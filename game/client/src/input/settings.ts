// Player settings (PLAN §7, §14): sensitivity, FOV, and separate toggle/hold modes for crouch, prone,
// lean and ADS. Stored per browser in localStorage; everything still works if storage is unavailable.

export type HoldMode = "hold" | "toggle";

export interface Keybinds {
  forward: string;
  back: string;
  left: string;
  right: string;
  sprint: string;
  crouch: string;
  prone: string;
  leanLeft: string;
  leanRight: string;
  vault: string;
  interact: string;
  slowWalk: string;
  ability: string;
  respawn: string;
  reload: string;
  /** Switch to the primary / the secondary weapon (the mouse wheel switches too). */
  primary: string;
  secondary: string;
  fireMode: string;
  /** The knife (Phase 3 M8). */
  melee: string;
}

export interface Settings {
  /** Degrees of rotation per mouse count (hip fire). */
  sensitivity: number;
  /**
   * Multiplier applied while aiming down sights, per sight magnification (Siege has one per zoom level;
   * our sights are 1×, 2.5× and 3.5×). Settings v2; v1 had one value for all.
   */
  adsSensitivityByZoom: Record<"1" | "2.5" | "3.5", number>;
  invertY: boolean;
  /** Vertical field of view in degrees (Siege-style). */
  fovVertical: number;
  crouchMode: HoldMode;
  proneMode: HoldMode;
  leanMode: HoldMode;
  adsMode: HoldMode;
  rawInput: boolean;
  keys: Keybinds;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 0.08,
  adsSensitivityByZoom: { "1": 0.6, "2.5": 0.6, "3.5": 0.6 },
  invertY: false,
  fovVertical: 70,
  crouchMode: "toggle",
  proneMode: "toggle",
  leanMode: "toggle",
  adsMode: "hold",
  rawInput: true,
  keys: {
    forward: "KeyW",
    back: "KeyS",
    left: "KeyA",
    right: "KeyD",
    sprint: "ShiftLeft",
    crouch: "KeyC",
    prone: "KeyX",
    leanLeft: "KeyQ",
    leanRight: "KeyE",
    vault: "Space",
    interact: "KeyF",
    slowWalk: "AltLeft",
    ability: "KeyZ",
    respawn: "KeyK",
    // Our choice of defaults (Siege's own PC keys are an open question, OPEN_QUESTIONS Phase 3).
    reload: "KeyR",
    primary: "Digit1",
    secondary: "Digit2",
    fireMode: "KeyB",
    melee: "KeyV",
  },
};

const STORAGE_KEY = "redmond.settings.v2";
const STORAGE_KEY_V1 = "redmond.settings.v1";

/** Settings saved by an older page: v1 had a single ADS sensitivity, now one per magnification. */
export function migrateSettings(saved: Record<string, unknown>): Partial<Settings> {
  const { adsSensitivityScale, ...rest } = saved as Partial<Settings> & { adsSensitivityScale?: number };
  const out: Partial<Settings> = { ...rest };
  if (typeof adsSensitivityScale === "number" && !rest.adsSensitivityByZoom) {
    out.adsSensitivityByZoom = { "1": adsSensitivityScale, "2.5": adsSensitivityScale, "3.5": adsSensitivityScale };
  }
  return out;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY_V1);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const saved = migrateSettings(JSON.parse(raw) as Record<string, unknown>);
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...saved,
      adsSensitivityByZoom: { ...DEFAULT_SETTINGS.adsSensitivityByZoom, ...(saved.adsSensitivityByZoom ?? {}) },
      keys: { ...DEFAULT_SETTINGS.keys, ...(saved.keys ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** The ADS multiplier for a sight's magnification (the nearest one set). */
export function adsSensitivity(s: Settings, zoom: number): number {
  const keys = Object.keys(s.adsSensitivityByZoom) as (keyof Settings["adsSensitivityByZoom"])[];
  const best = keys.reduce((a, b) => (Math.abs(Number(b) - zoom) < Math.abs(Number(a) - zoom) ? b : a));
  return s.adsSensitivityByZoom[best];
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked (private window etc.) — settings just won't persist */
  }
}

/** Horizontal FOV for a vertical FOV at a given aspect ratio (both in degrees). */
export function horizontalFov(verticalDeg: number, aspect: number): number {
  const v = (verticalDeg * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(v / 2) * aspect) * 180) / Math.PI;
}

/** Friendly name for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return (
    { ShiftLeft: "Shift", ShiftRight: "R-Shift", AltLeft: "Alt", ControlLeft: "Ctrl", Space: "Space", Tab: "Tab", CapsLock: "Caps" }[code] ?? code
  );
}
