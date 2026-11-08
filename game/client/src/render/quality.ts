// Graphics presets (Phase 10, render/DESIGN.md §3, D-171): what each quality level draws. "greybox" is the look
// before the art pass (surface-class colours, no textures), kept for testing: the browser tests run with it (their
// software rendering would crawl through the art), and Settings offers it as the fastest.

export type Quality = "greybox" | "low" | "medium" | "high";
export const QUALITIES: readonly Quality[] = ["high", "medium", "low", "greybox"];
export const QUALITY_NAMES: Record<Quality, string> = { high: "High", medium: "Medium", low: "Low", greybox: "Greybox (fastest, testing)" };

export interface QualityPreset {
  /** The texture sets' size in pixels; 0 draws no textures (the greybox colours). */
  textures: number;
  /** The sun's shadow map's size; 0 draws no shadows. */
  shadowMap: number;
  /** Indirect light from the probes (render/DESIGN.md §6.3); without, each storey's even fill. */
  probes: boolean;
  /** Screen-space ambient occlusion (§6.5). */
  ao: boolean;
  /** Multisampled antialiasing, and the most device pixels per CSS pixel drawn (both take effect at the next load). */
  antialias: boolean;
  maxPixelRatio: number;
  /** Decorative items and foliage (§8, §9.2): none, the cheaper half, or all. */
  dressing: "none" | "some" | "all";
}

export const PRESETS: Record<Quality, QualityPreset> = {
  greybox: { textures: 0, shadowMap: 4096, probes: false, ao: false, antialias: true, maxPixelRatio: 2, dressing: "none" },
  low: { textures: 512, shadowMap: 0, probes: false, ao: false, antialias: false, maxPixelRatio: 1, dressing: "none" },
  medium: { textures: 1024, shadowMap: 2048, probes: true, ao: false, antialias: true, maxPixelRatio: 1.5, dressing: "some" },
  high: { textures: 1024, shadowMap: 4096, probes: true, ao: true, antialias: true, maxPixelRatio: 2, dressing: "all" },
};

/** What the Graphics setting holds: a quality, or "auto" (decided by the device: initialQuality). */
export type QualitySetting = Quality | "auto";

/**
 * The quality a page starts at. A link can force one (`?gfx=high`, `?gfx=greybox`; `?lowgfx` is the greybox without
 * shadows or antialiasing, as before the art pass). A browser driven by automation (the browser tests) gets the
 * greybox unless its link asks for more. Otherwise the setting, and for "auto": Low on a phone or tablet (a coarse
 * pointer and no fine one), High elsewhere.
 */
export function initialQuality(params: URLSearchParams, setting: QualitySetting, env: { automated: boolean; touchOnly: boolean }): Quality {
  const asked = params.get("gfx");
  if (asked && (QUALITIES as readonly string[]).includes(asked)) return asked as Quality;
  if (params.has("lowgfx") || env.automated) return "greybox";
  if (setting !== "auto") return setting;
  return env.touchOnly ? "low" : "high";
}

/** The preset a page draws with: `?lowgfx` also drops the greybox's shadows and antialiasing (slow devices, the tests). */
export function presetFor(quality: Quality, params: URLSearchParams): QualityPreset {
  const p = PRESETS[quality];
  return params.has("lowgfx") ? { ...p, shadowMap: 0, antialias: false, maxPixelRatio: 1 } : p;
}
