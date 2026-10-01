import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { leadingNumber, parseCsv } from "../../../tools/data/weaponsCsv.js";
import { bulletDamage, falloffAt, isGun, loadGameData, penetrationChain, resolveWeapon, type BodyEntry, type WeaponPick } from "../src/index.js";

const data = loadGameData();
const combat = data.combat;
const csv = parseCsv(readFileSync(new URL("../../../research/weapons.csv", import.meta.url), "utf8"));
const wp = (weapon: string, o: Partial<WeaponPick> = {}): WeaponPick => ({ weapon, sight: "iron", barrel: null, grip: null, underbarrel: null, ...o });
const dmg = (id: string, o: Partial<WeaponPick> = {}) => resolveWeapon(data, wp(id, o)).damage!;

describe("damage against distance (weapons_notes.md §4.3)", () => {
  it("matches the research table for every gun at 0 m, the falloff start, midpoint and end, and 60 m", () => {
    for (const r of csv) {
      const w = data.weapons.get(r.weapon_id)!;
      if (!isGun(w) || !w.damage) continue;
      const [base, start, end, min] = [r.damage, r.dropoff_start_m, r.dropoff_end_m, r.min_damage].map((c) => leadingNumber(c)!);
      const f = w.damage.falloff;
      expect(falloffAt(f, 0), r.weapon_id).toBe(base);
      expect(falloffAt(f, start), r.weapon_id).toBe(base);
      expect(falloffAt(f, end), r.weapon_id).toBe(min);
      expect(falloffAt(f, 60), r.weapon_id).toBe(min);
      if (w.fire.pellets === 1) expect(falloffAt(f, (start + end) / 2), r.weapon_id).toBeCloseTo((base + min) / 2, 9);
    }
  });

  it("PARA-308: 47 up close, 28 past 35 m, 35 on a limb", () => {
    const para = dmg("para_308");
    expect(bulletDamage(combat, para, 10, "torso")).toEqual({ kill: false, amount: 47, headshot: false });
    expect(bulletDamage(combat, para, 40, "torso")).toEqual({ kill: false, amount: 28, headshot: false });
    expect(bulletDamage(combat, para, 10, "arm")).toEqual({ kill: false, amount: 35, headshot: false }); // 47 × 0.75 = 35.25
    expect(bulletDamage(combat, para, 10, "leg")).toEqual({ kill: false, amount: 35, headshot: false });
    expect(bulletDamage(combat, para, 30, "torso")).toEqual({ kill: false, amount: 37, headshot: false }); // 37.5, floored
  });

  it("bullet and slug headshots kill, neck included (core_mechanics.md §9.1, §9.2)", () => {
    expect(bulletDamage(combat, dmg("para_308"), 40, "head")).toEqual({ kill: true, headshot: true });
    expect(bulletDamage(combat, dmg("usp40"), 5, "neck")).toEqual({ kill: true, headshot: true });
    expect(bulletDamage(combat, dmg("bosg_12_2"), 20, "head")).toEqual({ kill: true, headshot: true });
  });

  it("buckshot: 48 / 36 / 21 per pellet, ×1.5 to the head (Y8S3)", () => {
    const m590 = dmg("m590a1");
    expect(bulletDamage(combat, m590, 3, "torso")).toMatchObject({ amount: 48 });
    expect(bulletDamage(combat, m590, 8, "torso")).toMatchObject({ amount: 36 });
    expect(bulletDamage(combat, m590, 20, "torso")).toMatchObject({ amount: 21 });
    expect(bulletDamage(combat, m590, 3, "head")).toEqual({ kill: false, amount: 72, headshot: true });
    expect(bulletDamage(combat, m590, 3, "arm")).toMatchObject({ amount: 36 });
  });

  it("Skopós's idle shell takes a multiple on a headshot instead of dying (skopos.md §3.3)", () => {
    // "A 5.7 USG headshot doesn't destroy it": 42 × 2 = 84 < 100 HP.
    expect(bulletDamage(combat, dmg("5_7_usg"), 5, "head", { idleShell: true })).toEqual({ kill: false, amount: 84, headshot: true });
  });

  it("scales for penetration and friendly fire, and never rounds a hit to nothing", () => {
    expect(bulletDamage(combat, dmg("camrs"), 10, "torso", { mult: 0.7 })).toMatchObject({ amount: 48 }); // 69 × 0.7 = 48.3
    expect(bulletDamage(combat, dmg("para_308"), 10, "torso", { scale: 0.5 })).toMatchObject({ amount: 23 });
    expect(bulletDamage(combat, dmg("smg_12"), 60, "arm", { mult: 0.01 })).toMatchObject({ amount: 1 });
  });
});

describe("limb penetration (core_mechanics.md §9.3)", () => {
  const body = (id: number, ...parts: [string, number][]): BodyEntry => ({ id, parts: parts.map(([part, t]) => ({ part: part as BodyEntry["parts"][number]["part"], t })) });

  it("none: only the first part of the first body", () => {
    expect(penetrationChain(combat, "none", [body(1, ["arm_l", 5], ["torso", 5.2]), body(2, ["torso", 8])])).toEqual([{ id: 1, zone: "arm", t: 5, mult: 1 }]);
  });

  it("simple: through a limb into the core part behind it, first core part only, one body", () => {
    expect(penetrationChain(combat, "simple", [body(1, ["arm_r", 5], ["torso", 5.2], ["head", 5.4]), body(2, ["torso", 8])])).toEqual([{ id: 1, zone: "torso", t: 5.2, mult: 1 }]);
    expect(penetrationChain(combat, "simple", [body(1, ["arm_r", 5], ["head", 5.2])])).toEqual([{ id: 1, zone: "head", t: 5.2, mult: 1 }]);
    // Lower-back rule: a torso shot doesn't travel up into the head.
    expect(penetrationChain(combat, "simple", [body(1, ["torso", 5], ["neck", 5.3], ["head", 5.5])])[0].zone).toBe("torso");
    expect(penetrationChain(combat, "simple", [body(1, ["leg_l", 5])])).toEqual([{ id: 1, zone: "leg", t: 5, mult: 1 }]);
  });

  it("full: through whole bodies, 70 % for each one after the first", () => {
    const hits = penetrationChain(combat, "full", [body(1, ["torso", 5]), body(2, ["arm_l", 7], ["pelvis", 7.1]), body(3, ["head", 9])]);
    expect(hits.map((h) => [h.id, h.zone])).toEqual([[1, "torso"], [2, "pelvis"], [3, "head"]]);
    expect(hits.map((h) => h.mult)).toEqual([1, 0.7, 0.7 * 0.7]);
  });
});
