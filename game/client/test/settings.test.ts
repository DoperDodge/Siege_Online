// Settings v2 (Phase 3 M9, DECISIONS D-055): ADS sensitivity per sight magnification, migrated from v1's
// single value, and used by the controls while aiming.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEG } from "@redmond/shared";
import { Controls } from "../src/input/controls.js";
import { adsSensitivity, DEFAULT_SETTINGS, loadSettings, migrateSettings, saveSettings, type Settings } from "../src/input/settings.js";

/** A page's localStorage, in memory. */
function storage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), map: m };
}

afterEach(() => vi.unstubAllGlobals());

describe("settings v1 → v2", () => {
  it("v1's single ADS multiplier becomes the multiplier at every magnification; everything else is kept", () => {
    const v1 = { sensitivity: 0.12, adsSensitivityScale: 0.8, invertY: true, keys: { melee: "KeyQ" } };
    const out = migrateSettings(v1);
    expect(out.adsSensitivityByZoom).toEqual({ "1": 0.8, "2.5": 0.8, "3.5": 0.8 });
    expect(out).toMatchObject({ sensitivity: 0.12, invertY: true, keys: { melee: "KeyQ" } });
    expect("adsSensitivityScale" in out).toBe(false);
  });

  it("a page saved by v1 loads as v2, defaults filling what it didn't have; saving writes v2", () => {
    const ls = storage({ "redmond.settings.v1": JSON.stringify({ sensitivity: 0.2, adsSensitivityScale: 0.5, keys: { reload: "KeyT" } }) });
    vi.stubGlobal("localStorage", ls);
    const s = loadSettings();
    expect(s.sensitivity).toBe(0.2);
    expect(s.adsSensitivityByZoom).toEqual({ "1": 0.5, "2.5": 0.5, "3.5": 0.5 });
    expect(s.keys.reload).toBe("KeyT");
    expect(s.keys.melee).toBe(DEFAULT_SETTINGS.keys.melee);
    s.adsSensitivityByZoom["3.5"] = 0.3;
    saveSettings(s);
    const saved = JSON.parse(ls.map.get("redmond.settings.v2")!) as Settings;
    expect(saved.adsSensitivityByZoom["3.5"]).toBe(0.3);
    // v2 wins over the old key from now on.
    expect(loadSettings().adsSensitivityByZoom).toEqual({ "1": 0.5, "2.5": 0.5, "3.5": 0.3 });
  });

  it("v2 saved without one magnification gets its default", () => {
    vi.stubGlobal("localStorage", storage({ "redmond.settings.v2": JSON.stringify({ adsSensitivityByZoom: { "1": 0.9 } }) }));
    expect(loadSettings().adsSensitivityByZoom).toEqual({ ...DEFAULT_SETTINGS.adsSensitivityByZoom, "1": 0.9 });
  });

  it("no storage at all (private mode): the defaults", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("ADS sensitivity per magnification", () => {
  const s: Settings = { ...DEFAULT_SETTINGS, adsSensitivityByZoom: { "1": 0.9, "2.5": 0.5, "3.5": 0.25 } };

  it("each sight uses its own multiplier", () => {
    expect([1, 2.5, 3.5].map((z) => adsSensitivity(s, z))).toEqual([0.9, 0.5, 0.25]);
  });

  it("the mouse turns the view by sensitivity × the multiplier for the sight in hand, only while aiming", () => {
    for (const zoom of [1, 2.5, 3.5]) {
      const c = new Controls({ ...s, adsMode: "hold", keys: { ...s.keys } }, () => {});
      c.weaponState = () => ({ slot: 0, equipping: false, zoom });
      c.setView(0, 0);
      c.look(10, 0);
      expect(c.yaw).toBeCloseTo(-10 * s.sensitivity * DEG, 9); // hip fire: no multiplier
      c.press("ads");
      c.look(10, 0);
      expect(c.yaw).toBeCloseTo(-10 * s.sensitivity * DEG * (1 + adsSensitivity(s, zoom)), 9);
    }
  });
});
