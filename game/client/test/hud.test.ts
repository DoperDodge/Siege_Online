// The HUD's maths and wording (Phase 3 M9): the zoomed field of view, where the spread ticks sit, which
// way the damage arc points, and what the hit marker, ammo readout and kill feed say; the stats overlay's
// 1% low (Phase 5); where a ping's mark goes on the screen (Phase 7).
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Cause, DEG, defaultLoadoutPick, initialPawnState, loadGameData, resolveLoadout, WeaponAct, type GameEvent } from "@redmond/shared";
import { ammoLow, fireModeText } from "../src/ui/ammo.js";
import { adsFov, spreadGapPx } from "../src/ui/crosshair.js";
import { damageArcDeg } from "../src/ui/damage.js";
import { reviveSecondsLeft } from "../src/ui/downed.js";
import { hitText } from "../src/ui/hitMarkers.js";
import { EDGE_PX, markOnScreen } from "../src/ui/intel.js";
import { deathLine, feedLine, type FeedNames } from "../src/ui/killFeed.js";
import { onePercentLowFps, slowestOnePercentMs } from "../src/ui/stats.js";

const data = loadGameData();

describe("ADS field of view", () => {
  it("a 1× sight keeps the field of view; 2.5× and 3.5× divide the tangent of its half-angle", () => {
    expect(adsFov(70, 1)).toBeCloseTo(70, 9);
    for (const zoom of [2.5, 3.5]) {
      const fov = adsFov(70, zoom);
      expect(Math.tan((fov * DEG) / 2)).toBeCloseTo(Math.tan(35 * DEG) / zoom, 12);
    }
    expect(adsFov(70, 2.5)).toBeCloseTo(31.29, 2);
    expect(adsFov(70, 3.5)).toBeCloseTo(22.63, 2);
  });

  it("zooms in as ADS comes in: none at hip, all of it once aimed, in between on the way", () => {
    expect(adsFov(70, 3.5, 0)).toBeCloseTo(70, 9);
    expect(adsFov(70, 3.5, 1)).toBeCloseTo(adsFov(70, 3.5), 9);
    const half = adsFov(70, 3.5, 0.5);
    expect(half).toBeLessThan(70);
    expect(half).toBeGreaterThan(adsFov(70, 3.5));
    expect(Math.tan((half * DEG) / 2)).toBeCloseTo(Math.tan(35 * DEG) / 2.25, 12);
  });
});

describe("spread ticks", () => {
  it("sit where the cone's edge lands on screen", () => {
    expect(spreadGapPx(0, 70, 1000)).toBe(0);
    // A cone as wide as half the field of view reaches the top of the screen.
    expect(spreadGapPx(35 * DEG, 70, 1000)).toBeCloseTo(500, 9);
    // 2° of spread at 70° on a 1080 px view.
    expect(spreadGapPx(2 * DEG, 70, 1080)).toBeCloseTo((Math.tan(2 * DEG) / Math.tan(35 * DEG)) * 540, 9);
    // The same cone looks wider through a zoomed sight.
    expect(spreadGapPx(1 * DEG, adsFov(70, 2.5), 1000)).toBeGreaterThan(spreadGapPx(1 * DEG, 70, 1000) * 2.4);
  });
});

describe("damage arc", () => {
  const at = { x: 0, z: 0 };
  it("points at the attacker: ahead 0°, right 90°, left −90°, behind 180°", () => {
    // Yaw 0 faces −Z; +X is to the right.
    expect(damageArcDeg(at, 0, [0, 1.6, -5])).toBeCloseTo(0, 9);
    expect(damageArcDeg(at, 0, [5, 1.6, 0])).toBeCloseTo(90, 9);
    expect(damageArcDeg(at, 0, [-5, 1.6, 0])).toBeCloseTo(-90, 9);
    expect(Math.abs(damageArcDeg(at, 0, [0, 1.6, 5]))).toBeCloseTo(180, 9);
    expect(damageArcDeg(at, 0, [3, 0, -3])).toBeCloseTo(45, 9);
  });

  it("turns with your view: an attacker straight ahead is on your right after you turn 90° left", () => {
    expect(damageArcDeg(at, 90 * DEG, [0, 1.6, -5])).toBeCloseTo(90, 9);
    expect(damageArcDeg({ x: 10, z: 10 }, -90 * DEG, [10, 0, 5])).toBeCloseTo(-90, 9);
    // Always within ±180° (no full turns from wrapped yaws).
    for (let yaw = -10; yaw < 10; yaw += 0.7) expect(Math.abs(damageArcDeg(at, yaw, [1, 0, 2]))).toBeLessThanOrEqual(180 + 1e-9);
  });
});

describe("what the HUD says", () => {
  const hit = (over: Partial<Extract<GameEvent, { kind: "hitConfirm" }>>) =>
    ({ kind: "hitConfirm", seq: 1, victimPawn: 2, zone: "torso", headshot: false, downed: false, killed: false, friendly: false, damage: 47, pellets: 1, hpAfter: null, ...over }) as const;

  it("hit marker: damage and zone, pellets, DOWN, KILL, HEADSHOT, teammates, lab health", () => {
    expect(hitText(hit({}))).toBe("47 · torso");
    expect(hitText(hit({ pellets: 6, damage: 90, zone: "leg" }))).toBe("90 (6 pellets) · leg");
    expect(hitText(hit({ downed: true }))).toBe("DOWN");
    expect(hitText(hit({ killed: true }))).toBe("KILL");
    expect(hitText(hit({ killed: true, headshot: true, zone: "head" }))).toBe("HEADSHOT");
    expect(hitText(hit({ friendly: true, hpAfter: 63 }))).toBe("47 · torso · teammate · 63 HP left");
  });

  it("ammo: fire mode with its key only when there's a choice; low at a fifth of the magazine", () => {
    const { loadout } = resolveLoadout(data, defaultLoadoutPick(data, "sledge"));
    const [rifle, pistol] = loadout.weapons;
    const s = { ...initialPawnState(0, 0, 0, 0, 100, loadout), wAct: WeaponAct.Ready };
    expect([rifle.id, rifle.fire.modes, pistol.fire.modes]).toEqual(["l85a2", ["auto", "semi"], ["semi"]]);
    expect(fireModeText(rifle, s, "B")).toBe("AUTO (B)");
    expect(fireModeText(pistol, { ...s, slot: 1 }, "B")).toBe("SEMI");
    expect(ammoLow(rifle, Math.floor(rifle.ammo.magazine / 5))).toBe(true);
    expect(ammoLow(rifle, Math.floor(rifle.ammo.magazine / 5) + 1)).toBe(false);
    expect(ammoLow(rifle, 0)).toBe(true);
  });

  it("revive: seconds left counts down from the data's revive time", () => {
    expect(reviveSecondsLeft(data.combat, 0)).toBeCloseTo(data.combat.revive.seconds, 1);
    expect(reviveSecondsLeft(data.combat, 64)).toBeCloseTo(data.combat.revive.seconds - 1, 1);
    expect(reviveSecondsLeft(data.combat, 100000)).toBe(0);
  });

  const names: FeedNames = { ctrl: (id) => ["", "Ulo", "Bot"][id] ?? "?", pawn: (id) => ({ 10: "Ulo", 20: "Bot" })[id] ?? "", weapon: (id) => id.toUpperCase() };
  const me = { ctrl: 1, pawns: [10] };

  it("kill feed: eliminations, team kills, finishers, headshots, the knife, falls, bleeding out, downs and revives", () => {
    const kill = (over: Partial<Extract<GameEvent, { kind: "kill" }>>) =>
      ({ kind: "kill", victimPawn: 20, victimCtrl: 2, killerCtrl: 1, assistCtrl: 0, weapon: "l85a2", cause: Cause.Bullet, headshot: false, friendly: false, ...over }) as const;
    expect(feedLine(kill({}), names, me)).toEqual({ text: "Ulo [L85A2] eliminated Bot", mine: true });
    expect(feedLine(kill({ headshot: true }), names, me)!.text).toBe("Ulo [L85A2, headshot] eliminated Bot");
    expect(feedLine(kill({ weapon: "knife", cause: Cause.Melee }), names, me)!.text).toBe("Ulo [knife] eliminated Bot");
    expect(feedLine(kill({ friendly: true }), names, me)!.text).toBe("Ulo [L85A2] team-killed Bot");
    expect(feedLine(kill({ killerCtrl: 2, victimCtrl: 1, assistCtrl: 2 }), names, { ctrl: 3, pawns: [] })).toEqual({ text: "Bot [L85A2] eliminated Ulo (finished by Bot)", mine: false });
    expect(feedLine(kill({ killerCtrl: 0, weapon: "", cause: Cause.Fall }), names, me)!.text).toBe("Bot died (fall)");
    expect(feedLine(kill({ cause: Cause.Bleed }), names, me)!.text).toBe("Ulo [L85A2] eliminated Bot (bled out)");
    expect(feedLine({ kind: "down", victimPawn: 20, victimCtrl: 2, downerCtrl: 1, weapon: "l85a2", cause: Cause.Bullet, friendly: false }, names, me)!.text).toBe("Ulo [L85A2] downed Bot");
    expect(feedLine({ kind: "reviveEnd", reviverPawn: 20, targetPawn: 10, completed: true }, names, me)).toEqual({ text: "Bot revived Ulo", mine: true });
    expect(feedLine({ kind: "reviveEnd", reviverPawn: 20, targetPawn: 10, completed: false }, names, me)).toBeNull();
    expect(feedLine({ kind: "reviveStart", reviverPawn: 20, targetPawn: 10 }, names, me)).toBeNull();
    expect(feedLine({ kind: "shellDestroyed", pawnId: 21, ownerCtrl: 2, killerCtrl: 1, weapon: "l85a2", headshot: false }, names, me)!.text).toBe("Ulo [L85A2] destroyed Bot's idle shell");
  });

  it("death screen: who killed you and with what; bleeding out; a fall says so itself", () => {
    const base = { kind: "kill", victimPawn: 10, victimCtrl: 1, killerCtrl: 2, assistCtrl: 0, weapon: "mp5", cause: Cause.Bullet, headshot: true, friendly: false } as const;
    expect(deathLine(base, names)).toBe("Killed by Bot [MP5, headshot]");
    expect(deathLine({ ...base, cause: Cause.Bleed }, names)).toBe("You bled out (downed by Bot)");
    expect(deathLine({ ...base, killerCtrl: 0, cause: Cause.Fall }, names)).toBeNull();
    expect(deathLine({ ...base, killerCtrl: 0, weapon: "", headshot: false, cause: Cause.Lab }, names)).toBe("You died");
    // A level ingredient's (nobody's; Phase 8 M3) is named.
    expect(deathLine({ ...base, killerCtrl: 0, weapon: "gas_pipe", headshot: false, cause: Cause.Gadget }, names)).toBe("You died [GAS_PIPE]");
  });
});

describe("stats overlay", () => {
  it("1% low: the frame rate of the mean of the slowest 1% of frame times, in any order", () => {
    // A thousand frames at 144 FPS, ten of them 20 ms hitches: the slowest 1% are the hitches.
    const frames = [...Array.from({ length: 990 }, () => 1000 / 144), ...Array.from({ length: 10 }, () => 20)];
    expect(onePercentLowFps(frames)).toBeCloseTo(50, 9);
    expect(onePercentLowFps([...frames].reverse())).toBeCloseTo(50, 9);
    // Two of 1,000 frames slow: the slowest ten are those two and eight ordinary ones.
    const two = [...Array.from({ length: 998 }, () => 8), 30, 50];
    expect(onePercentLowFps(two)).toBeCloseTo(1000 / ((30 + 50 + 8 * 8) / 10), 9);
    // A steady frame rate is its own 1% low.
    expect(onePercentLowFps(Array.from({ length: 500 }, () => 1000 / 120))).toBeCloseTo(120, 9);
  });

  it("1% low: under a hundred frames it is the slowest frame; no frames, no number", () => {
    expect(onePercentLowFps([10, 12, 40, 11])).toBeCloseTo(25, 9);
    expect(onePercentLowFps([16])).toBeCloseTo(62.5, 9);
    expect(onePercentLowFps([])).toBe(0);
  });

  it("work: the mean of the slowest 1%, the same statistic as the 1% low", () => {
    // A thousand frames of 3 ms work, ten of them 12 ms: the slowest 1% are those ten.
    const ms = [...Array.from({ length: 990 }, () => 3), ...Array.from({ length: 10 }, () => 12)];
    expect(slowestOnePercentMs(ms)).toBeCloseTo(12, 9);
    expect(slowestOnePercentMs([...ms].reverse())).toBeCloseTo(12, 9);
    expect(onePercentLowFps(ms)).toBeCloseTo(1000 / slowestOnePercentMs(ms), 9);
    // Under a hundred frames it is the slowest one; none, none.
    expect(slowestOnePercentMs([3, 9, 4])).toBe(9);
    expect(slowestOnePercentMs([])).toBe(0);
  });
});

describe("a ping's mark on the screen (Phase 7)", () => {
  // A camera at the origin looking down −z, 70° high, on an 800 × 600 screen.
  const camera = new THREE.PerspectiveCamera(70, 800 / 600, 0.05, 300);
  camera.updateMatrixWorld();
  const at = (x: number, y: number, z: number) => markOnScreen(new THREE.Vector3(x, y, z), camera, 800, 600);

  it("is over the point when it's in view", () => {
    expect(at(0, 0, -5)).toEqual({ x: 400, y: 300, off: false });
    const up = at(0, 1, -5);
    expect([up.x, up.off]).toEqual([400, false]);
    expect(up.y).toBeLessThan(300);
  });

  it("off the screen or behind, it's at the edge the way to turn", () => {
    expect(at(50, 0, -5)).toMatchObject({ x: 800 - EDGE_PX, off: true }); // far right
    expect(at(50, 0, -5).y).toBeCloseTo(300, 6);
    expect(at(-1, 0, 5)).toMatchObject({ x: EDGE_PX, off: true }); // behind, to the left: the left edge
    expect(at(0, 0, 5)).toEqual({ x: 400, y: 600 - EDGE_PX, off: true }); // right behind: the bottom
    const below = at(0, -50, -1);
    expect([below.y, below.off]).toEqual([600 - EDGE_PX, true]);
  });
});
