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

describe("the lab's free camera (DESIGN E10)", () => {
  it("while it flies, keys only count as held: the use key puts the body down, and nothing pressed reaches the body", () => {
    let flying = true;
    let uses = 0;
    const ui: string[] = [];
    const c = new Controls({ ...DEFAULT_SETTINGS, crouchMode: "toggle", keys: { ...DEFAULT_SETTINGS.keys } }, (a) => ui.push(a));
    c.weaponState = () => ({ slot: 0, equipping: false });
    c.flying = () => flying;
    c.onFlyUse = () => {
      uses++;
      flying = false; // the lab leaves the free camera
    };
    const keys = ["secondary", "crouch", "vault", "fire", "melee", "reload", "ads"] as const;
    for (const a of keys) c.press(a);
    expect(c.isHeld("crouch") && c.isHeld("vault")).toBe(true); // the camera flies down and up with these
    for (const a of keys) c.release(a);
    c.press("respawn"); // still the page's
    c.press("interact"); // the camera's: it puts the body down
    expect(uses).toBe(1);
    expect(ui).toEqual(["respawn"]);
    for (let i = 1; i <= 3; i++) {
      const s = c.sample(i);
      expect(s.buttons).toBe(0); // no use, swap, vault, shot, knife or reload left over for the body
      expect(s.stance).toBe(Stance.Stand); // the crouch toggle didn't flip
    }
  });
});

describe("Mouse look and the pointer lock", () => {
  it("turns the view only while the pointer is locked, and only for moves made after it was", () => {
    const c = make({});
    const count = DEFAULT_SETTINGS.sensitivity * DEG;
    c.setView(1, 0);
    c.mouseMove(50, 0, 10); // not locked: the mouse is on the menus
    expect(c.sample(1).yaw).toBeCloseTo(1, 3);
    c.pointerLock(true, 100);
    // The move onto the Go to button (made at 99, before its click locked the pointer) arrives after the lock:
    // Chrome hands moves over at the next frame. It mustn't turn away from the view Go to set.
    c.mouseMove(50, 0, 99);
    expect(c.sample(2).yaw).toBeCloseTo(1, 3);
    c.mouseMove(10, 0, 101);
    expect(c.sample(3).yaw).toBeCloseTo(1 - 10 * count, 3);
    c.pointerLock(false, 200);
    c.mouseMove(10, 0, 201);
    expect(c.sample(4).yaw).toBeCloseTo(1 - 10 * count, 3);
  });
});

describe("the ping key and the comm wheel (Phase 7, intel/DESIGN.md §6)", () => {
  /** Controls with a comm wheel of `n` callouts; `picked` collects what it sends. */
  const wheel = (n = 8) => {
    const c = make({});
    const picked: number[] = [];
    c.wheelSize = () => n;
    c.onCallout = (id) => picked.push(id);
    return { c, picked };
  };

  it("a tap pings for one tick when it's let go; a press held under a quarter second too", () => {
    const { c, picked } = wheel();
    c.press("ping");
    expect(c.sample(1).buttons & Btn.Ping).toBe(0); // not while it's down: it may become the wheel
    c.release("ping");
    expect(c.sample(2).buttons & Btn.Ping).toBe(Btn.Ping);
    expect(c.sample(3).buttons & Btn.Ping).toBe(0);
    c.press("ping");
    for (let i = 0; i < 14; i++) c.sample(4 + i);
    c.release("ping");
    expect(c.sample(20).buttons & Btn.Ping).toBe(Btn.Ping);
    expect(picked).toEqual([]);
  });

  it("held a quarter second it opens the wheel: the mouse points at a callout instead of turning the view, and letting go sends it", () => {
    const { c, picked } = wheel();
    c.pointerLock(true, 0);
    c.setView(1, 0);
    c.press("ping");
    for (let i = 1; i <= 16; i++) c.sample(i);
    expect(c.wheelPick).toBeNull(); // open, nothing picked yet
    c.mouseMove(200, 0, 1); // right: the third of eight (0 is up, clockwise)
    expect(c.wheelPick).toBe(2);
    c.mouseMove(-320, 120, 2); // to left of the middle and down: down-left, the sixth
    expect(c.wheelPick).toBe(5);
    expect(c.sample(17).yaw).toBeCloseTo(1, 5);
    c.release("ping");
    expect([c.wheelPick, picked]).toEqual([undefined, [5]]);
    expect(c.sample(18).buttons & Btn.Ping).toBe(0);
    // Let go in the middle: nothing sent.
    c.press("ping");
    for (let i = 0; i < 16; i++) c.sample(19 + i);
    c.release("ping");
    expect(picked).toEqual([5]);
    expect(c.sample(40).buttons & Btn.Ping).toBe(0);
  });

  it("with no wheel (no room to send to) a long press still pings; a key let go with the page sends nothing", () => {
    const { c } = wheel(0);
    c.press("ping");
    for (let i = 1; i <= 32; i++) c.sample(i);
    expect(c.wheelPick).toBeUndefined();
    c.release("ping");
    expect(c.sample(33).buttons & Btn.Ping).toBe(Btn.Ping);
    const w = wheel();
    w.c.press("ping");
    for (let i = 1; i <= 16; i++) w.c.sample(i);
    w.c.releaseAll();
    w.c.release("ping");
    expect([w.c.wheelPick, w.picked, w.c.sample(17).buttons & Btn.Ping]).toEqual([undefined, [], 0]);
  });
});
