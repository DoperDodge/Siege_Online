// data/destruction.json (Phase 4, research/destruction.md): what every weapon's bullets do to panels, the
// values the research verified, and the cross-file checks that catch a panel or rule that can't work.
import { describe, expect, it } from "vitest";
import { crossFileProblems, isGun, loadGameData, rawData, resolveWeapon, type DestructionData, type GunData, type LevelDef } from "../src/index.js";

const data = loadGameData();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const unverified = (raw: Record<string, unknown>) => (raw._unverified as string[] | undefined) ?? [];
const problemsWith = (destruction: DestructionData, levels = data.levels) => crossFileProblems({ ...data, destruction, levels }).join("\n");

describe("destruction data", () => {
  it("every gun's bullets have rules: its own tier, else its class's; the XK23's medium is official", () => {
    for (const w of data.weapons.values()) {
      if (!isGun(w)) continue;
      const d = resolveWeapon(data, { weapon: w.id, sight: null, barrel: null, grip: null, underbarrel: null }).destruction;
      expect(d.tier, w.id).toBe(w.destruction ?? data.destruction.bullets.classTiers[w.class]);
      expect(d.holeDiameterM, w.id).toBeGreaterThan(0);
    }
    const xk23 = data.weapons.get("xk23") as GunData;
    expect(xk23.destruction).toBe("medium");
    expect(unverified(rawData.weapons.find((w) => w.id === "xk23")!)).not.toContain("destruction");
    // A slug cuts studs and opens a hatch in a few shots (research/destruction.md §3.2, §8); buckshot only up close.
    const slug = resolveWeapon(data, { weapon: "bosg_12_2", sight: null, barrel: null, grip: null, underbarrel: null }).destruction;
    expect([slug.tier, slug.studs, Math.ceil(100 / slug.hatchDamage)]).toEqual(["high", true, 3]);
    const buck = resolveWeapon(data, { weapon: "m590a1", sight: null, barrel: null, grip: null, underbarrel: null }).destruction;
    expect([buck.studs, buck.studsWithinM]).toEqual([true, 5]);
  });

  it("keeps the values the research verified, unmarked", () => {
    const d = data.destruction;
    expect(d.reinforcement.deploySeconds).toBe(4.5);
    expect(d.reinforcement.reinforcedHatchHp).toBe(1_000_000);
    expect([d.reinforcement.hatchFromTopOnly, d.reinforcement.canReinforceDamaged, d.reinforcement.canReReinforce]).toEqual([true, true, false]);
    expect(Math.ceil(d.barricade.hp / d.melee.barricadeDamage)).toBe(3); // three hits always break a barricade
    expect(d.melee.studs).toBe(false);
    expect(d.explosives.exothermic_charge.reinforcedHatchDamage).toBe(1_000_000);
    expect(data.modes.get("lab")!.reinforcements).toBe(10);
    const marked = unverified(rawData.destruction);
    for (const path of ["reinforcement.deploySeconds", "reinforcement.reinforcedHatchHp", "barricade.hp", "melee.barricadeDamage", "melee.studs"]) expect(marked).not.toContain(path);
    // A barricade takes about 20 rifle, SMG or pistol bullets; a DMR fewer than 10 (research/destruction.md §9).
    expect(Math.ceil(d.barricade.hp / d.bullets.tiers.medium!.barricadeDamage)).toBe(20);
    expect(Math.ceil(d.barricade.hp / d.bullets.tiers.high!.barricadeDamage)).toBeLessThan(10);
  });

  it("the cross-file checks catch a construction of the wrong kind, a gun with no rules and an impossible panel", () => {
    const wrongKind = clone(data.destruction);
    wrongKind.surfaces.HATCH = "soft_wall";
    expect(problemsWith(wrongKind)).toMatch(/surfaces\.HATCH is built as a wall/);
    const noSmg = clone(data.destruction);
    delete noSmg.bullets.classTiers.smg;
    expect(problemsWith(noSmg)).toMatch(/no tier for "smg"/);
    const lvl = clone(data.levels.get("movement_lab")!) as LevelDef;
    lvl.solids.push({ id: "thin", center: [0, 1, 0], size: [2, 2, 0.03], yawDeg: 0, surface: "SOFT_WALL", vaultable: false });
    lvl.solids.push({ id: "hardpanel", center: [0, 1, 3], size: [2, 2, 0.2], yawDeg: 0, surface: "HARD_WALL", vaultable: false, panel: { sections: 2 } });
    const problems = problemsWith(data.destruction, new Map([[lvl.id, lvl]]));
    expect(problems).toMatch(/solid "thin" is 0\.03 m thick/);
    expect(problems).toMatch(/solid "hardpanel" has panel options but a HARD_WALL isn't destructible/);
  });
});
