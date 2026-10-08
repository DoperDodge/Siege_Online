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

describe("weapon buttons (DECISIONS D-055)", () => {
  it("Fire is held; a click shorter than a tick still fires once", () => {
    const c = make({});
    c.press("fire");
    for (let i = 1; i <= 3; i++) expect(c.sample(i).buttons & Btn.Fire).toBe(Btn.Fire);
    c.release("fire");
    expect(c.sample(4).buttons & Btn.Fire).toBe(0);
    c.press("fire");
    c.release("fire"); // between two ticks
    expect(c.sample(5).buttons & Btn.Fire).toBe(Btn.Fire);
    expect(c.sample(6).buttons & Btn.Fire).toBe(0);
  });

  it("reload, fire mode and the knife go out for exactly one tick, however long the key is held", () => {
    for (const [action, btn] of [
      ["reload", Btn.Reload],
      ["fireMode", Btn.FireMode],
      ["melee", Btn.Melee],
    ] as const) {
      const c = make({});
      c.press(action);
      expect(c.sample(1).buttons & btn).toBe(btn);
      expect(c.sample(2).buttons & btn).toBe(0); // still held: no repeat
      c.release(action);
      c.press(action);
      c.release(action);
      expect(c.sample(3).buttons & btn).toBe(btn); // a tap between ticks
      expect(c.sample(4).buttons & btn).toBe(0);
    }
  });

  it("a weapon key sends one swap while the other weapon is wanted, never while a swap is under way", () => {
    const c = make({});
    let state = { slot: 0, equipping: false };
    c.weaponState = () => state;
    c.press("primary"); // already in hand
    expect(c.sample(1).buttons & Btn.Swap).toBe(0);
    c.press("secondary");
    expect(c.sample(2).buttons & Btn.Swap).toBe(Btn.Swap);
    state = { slot: 0, equipping: true }; // the swap has started
    expect(c.sample(3).buttons & Btn.Swap).toBe(0);
    state = { slot: 1, equipping: true };
    expect(c.sample(4).buttons & Btn.Swap).toBe(0); // arrived: nothing more to send
    state = { slot: 1, equipping: false };
    c.press("swap"); // the wheel: the other one
    expect(c.sample(5).buttons & Btn.Swap).toBe(Btn.Swap);
  });

  it("a weapon key pressed with no weapon to switch (down, dead, between bodies) is dropped, not sent after the revive", () => {
    const c = make({});
    let state: { slot: number; equipping: boolean } | null = null; // down
    c.weaponState = () => state;
    c.press("secondary");
    const sent = [1, 2, 3, 4].map((n) => c.sample(n).buttons & Btn.Swap);
    expect(sent).toEqual([0, 0, 0, 0]);
    state = { slot: 0, equipping: false }; // revived, primary in hand
    expect([5, 6, 7].map((n) => c.sample(n).buttons & Btn.Swap)).toEqual([0, 0, 0]);
  });
});
