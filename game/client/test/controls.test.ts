// Controls without a browser: toggle/hold resolution around forced stance changes (second review).
import { describe, expect, it } from "vitest";
import { Btn, DEG, Stance } from "@redmond/shared";
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

describe("Controls.syncView (recoil, D-041)", () => {
  for (const prone of [false, true]) {
    it(`${prone ? "prone" : "standing"}: a kick carried into the view stays in the next input, mouse movement too`, () => {
      const c = make({});
      c.limits = prone ? { pitchMin: -0.3, pitchMax: 0.3, maxYawStep: 0.004 } : { pitchMin: -1.5, pitchMax: 1.5, maxYawStep: null };
      c.setView(1, 0);
      const first = c.sample(1);
      // The sim kicked the view up 0.01 and right 0.002 this tick (yaw falls turning right).
      c.syncView(first.yaw - 0.002, first.pitch + 0.01, { yaw: -0.002, pitch: 0.01 });
      const m = 2 * DEFAULT_SETTINGS.sensitivity * DEG; // two counts of mouse, right and up
      c.look(2, -2);
      const next = c.sample(2);
      expect(next.yaw).toBeCloseTo(first.yaw - 0.002 - m, 3);
      expect(next.pitch).toBeCloseTo(first.pitch + 0.01 + m, 3);
      // With nothing more from the sim, the view stays put (no drift back toward the old aim).
      c.syncView(next.yaw, next.pitch);
      expect(c.sample(3).yaw).toBeCloseTo(next.yaw, 4);
    });
  }
});

describe("Interact (DECISIONS D-049)", () => {
  it("is sent while held (a revive takes 4 s), and a tap shorter than a tick still goes out once", () => {
    const c = make({});
    c.press("interact");
    for (let i = 1; i <= 5; i++) expect(c.sample(i).buttons & Btn.Interact).toBe(Btn.Interact);
    c.release("interact");
    expect(c.sample(6).buttons & Btn.Interact).toBe(0);
    c.press("interact");
    c.release("interact"); // between two ticks
    expect(c.sample(7).buttons & Btn.Interact).toBe(Btn.Interact);
    expect(c.sample(8).buttons & Btn.Interact).toBe(0);
  });
});
