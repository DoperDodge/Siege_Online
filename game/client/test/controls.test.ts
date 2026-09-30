// Controls without a browser: toggle/hold resolution around forced stance changes (second review).
import { describe, expect, it } from "vitest";
import { Stance } from "@redmond/shared";
import { Controls } from "../src/input/controls.js";
import { DEFAULT_SETTINGS, type Settings } from "../src/input/settings.js";

const make = (over: Partial<Settings>) => new Controls({ ...DEFAULT_SETTINGS, ...over, keys: { ...DEFAULT_SETTINGS.keys } }, () => {});

describe("Controls.resetStance", () => {
  it("with hold binds, a stance the body is in doesn't stick once the key is let go", () => {
    for (const [action, stance] of [["crouch", Stance.Crouch], ["prone", Stance.Prone]] as const) {
      const c = make({ crouchMode: "hold", proneMode: "hold" });
      c.press(action);
      expect(c.sample(1).stance).toBe(stance);
      c.resetStance(stance); // e.g. back from Skopós' shell camera, or a swap hand-over, while held
      c.release(action);
      expect(c.sample(2).stance).toBe(Stance.Stand);
    }
  });

  it("with toggle binds, the body's stance is remembered", () => {
    const c = make({ crouchMode: "toggle", proneMode: "hold" });
    c.resetStance(Stance.Crouch);
    expect(c.sample(1).stance).toBe(Stance.Crouch);
    c.resetStance(Stance.Prone); // prone is on hold here: rest at standing
    expect(c.sample(2).stance).toBe(Stance.Stand);
  });
});
