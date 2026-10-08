import { describe, expect, it } from "vitest";
import {
  defaultLoadoutPick,
  isGun,
  isPickable,
  loadGameData,
  loadoutPickProblem,
  offerId,
  resolveLoadout,
  resolveWeapon,
  type LoadoutPick,
  type WeaponPick,
} from "../src/index.js";

const data = loadGameData();
const wp = (weapon: string, o: Partial<WeaponPick> = {}): WeaponPick => ({ weapon, sight: null, barrel: null, grip: null, underbarrel: null, ...o });
const pick = (operator: string, primary: WeaponPick, secondary?: WeaponPick, gadgets?: string[]): LoadoutPick => {
  const d = defaultLoadoutPick(data, operator);
  return { operator, primary, secondary: secondary ?? d.secondary, gadgets: gadgets ?? d.gadgets };
};
const problem = (p: LoadoutPick) => loadoutPickProblem(data, p);

describe("loadout picks (DECISIONS D-042)", () => {
  it("every operator has a valid default that resolves", () => {
    for (const op of data.operators.values()) {
      const p = defaultLoadoutPick(data, op.id);
      expect(problem(p), op.id).toBeNull();
      const { loadout } = resolveLoadout(data, p);
      expect(loadout.weapons.map((w) => w.id)).toEqual([p.primary.weapon, p.secondary.weapon]);
    }
    // The shield and the GONNE-6 are skipped until Phase 8 (D-054).
    expect(defaultLoadoutPick(data, "fuze").primary.weapon).toBe("ak_12");
    expect(isPickable(data, "ballistic_shield") || isPickable(data, "gonne_6")).toBe(false);
    expect(problem(pick("dokkaebi", wp("mk_14_ebr"), wp("gonne_6")))).toMatch(/can't be picked yet/);
  });

  it("fills an empty sight with iron and an empty grip slot with the horizontal grip", () => {
    const { loadout } = resolveLoadout(data, pick("brava", wp("para_308")));
    expect(loadout.pick.primary).toMatchObject({ sight: "iron", grip: "horizontal" });
    expect(loadout.weapons[0].moveSpeedMult).toBe(1); // full speed: the horizontal grip
    // No grip slot: stays empty.
    expect(resolveLoadout(data, pick("mute", wp("mp5k"))).loadout.pick.primary.grip).toBeNull();
  });

  it("enforces what each weapon and operator can fit (weapons_notes.md §4, §6)", () => {
    expect(problem(pick("brava", wp("camrs", { grip: "vertical" })))).toBeNull();
    expect(problem(pick("dokkaebi", wp("mk_14_ebr", { sight: "telescopic", barrel: "muzzle_brake" })))).toBeNull();
    // The 5.7 USG's muzzle brake: Thermite and Pulse, not Striker (Q6).
    expect(problem(pick("thermite", wp("556xi"), wp("5_7_usg", { barrel: "muzzle_brake" })))).toBeNull();
    expect(problem(pick("striker", wp("m4"), wp("5_7_usg", { barrel: "muzzle_brake" })))).toMatch(/no muzzle_brake/);
    expect(problem(pick("mute", wp("mp5k", { grip: "vertical" })))).toMatch(/grip/);
    expect(problem(pick("lesion", wp("six12_sd", { barrel: "suppressor" })))).toMatch(/no suppressor/);
    expect(problem(pick("dokkaebi", wp("mk_14_ebr"), wp("smg_12", { barrel: "suppressor" })))).toMatch(/no suppressor/);
    // Defender automatics have no magnified sight since Y10S3 (weapons_notes.md §4.2).
    expect(problem(pick("sentry", wp("commando_9", { sight: "magnified" })))).toMatch(/no magnified/);
    expect(problem(pick("mira", wp("vector_45_acp", { sight: "magnified" })))).toMatch(/no magnified/);
    expect(problem(pick("sledge", wp("l85a2", { sight: "magnified", barrel: "compensator", grip: "angled", underbarrel: "laser" })))).toBeNull();
    // Weapons belong to their operators, and primaries stay primaries.
    expect(problem(pick("sledge", wp("para_308")))).toMatch(/can't carry para_308/);
    expect(problem(pick("brava", wp("usp40")))).toMatch(/as a primary/);
  });

  it("checks gadgets: one from the list, or a kit's distinct picks", () => {
    expect(defaultLoadoutPick(data, "striker").gadgets).toHaveLength(2);
    expect(problem(pick("brava", wp("para_308"), undefined, ["claymore"]))).toBeNull();
    expect(problem(pick("brava", wp("para_308"), undefined, ["claymore", "smoke"]))).toMatch(/picks one/);
    const kit = data.operators.get("striker")!.loadout.gadgetKit!.pool;
    expect(problem(pick("striker", wp("m4"), undefined, [kit[0], kit[0]]))).toMatch(/must differ/);
    expect(problem(pick("striker", wp("m4"), undefined, [kit[0], kit[3]]))).toBeNull();
  });

  it("replaces an invalid pick with the default and says why", () => {
    const bad = pick("sledge", wp("para_308"));
    const { loadout, problem: why } = resolveLoadout(data, bad);
    expect(why).toMatch(/para_308/);
    expect(loadout.pick).toEqual(defaultLoadoutPick(data, "sledge"));
  });
});

describe("resolved weapon numbers", () => {
  const brava = (o: Partial<WeaponPick> = {}) => resolveLoadout(data, pick("brava", wp("para_308", o))).loadout.weapons[0];

  it("converts times to ticks with the attachment bonuses", () => {
    // ADS 0.52 s ÷ (1 + 0.10 iron + 0.10 laser) = 0.433 s = 27.7 → 28 ticks.
    expect(brava({ underbarrel: "laser" }).ads.ticks).toBe(28);
    expect(brava({ sight: "magnified" }).ads.ticks).toBe(33); // 0.52 s, no bonus
    expect(brava({ sight: "magnified" }).ads.fromSprintTicks).toBe(37); // × 1.1
    // Angled grip: reload × 0.8. Tactical 2.6 s → 2.08 s = 133 ticks.
    expect(brava({ grip: "angled" }).reload).toMatchObject({ kind: "magazine", tacticalTicks: 133, emptyTicks: 169 });
    expect(brava().reload).toMatchObject({ tacticalTicks: 166, emptyTicks: 211, refillTacticalTicks: 97, refillEmptyTicks: 160 });
    expect(resolveLoadout(data, pick("brava", wp("para_308"))).loadout.swapTicks).toBe(38);
    // Tube shotgun: 0.6 s a shell, and the empty overhead 5.5 − 7 × 0.6 = 1.3 s.
    expect(resolveWeapon(data, wp("m590a1")).reload).toEqual({ kind: "per_shell", perShellTicks: 38, emptyExtraTicks: 83 });
  });

  it("estimates missing refill points from the class (or all weapons)", () => {
    // SR-25 has no measured refill point; the only other marksman rifle with one is the CAMRS (1.36 / 2.6).
    const sr25 = resolveWeapon(data, wp("sr_25", { sight: "iron", grip: "horizontal" }));
    expect(sr25.reload).toMatchObject({ refillTacticalTicks: Math.round(2.9 * (1.36 / 2.6) * 64) });
    // Handguns have none at all: the median over every weapon.
    const usp = resolveWeapon(data, wp("usp40", { sight: "iron" }));
    expect(usp.reload.kind).toBe("magazine");
    if (usp.reload.kind === "magazine") {
      expect(usp.reload.refillTacticalTicks).toBeLessThan(usp.reload.tacticalTicks);
      expect(usp.reload.magOutTacticalTicks).toBeLessThan(usp.reload.refillTacticalTicks);
    }
  });

  it("applies the extended barrel's damage", () => {
    expect(brava({ barrel: "extended_barrel" }).damage).toMatchObject({ base: 52, falloff: [[25, 52], [35, 42]] });
    expect(brava().damage!.base).toBe(47);
    const xk = resolveLoadout(data, pick("dokkaebi", wp("xk23", { barrel: "extended_barrel" }))).loadout.weapons[0];
    expect(xk.damage).toMatchObject({ base: 54, falloff: [[25, 54], [35, 43]] });
  });

  it("applies movement multipliers: LMG −10 %, horizontal grip +5 % up to full speed (core_mechanics.md §2.2)", () => {
    const speed = (op: string, slot: 0 | 1, p: WeaponPick) =>
      resolveLoadout(data, slot === 0 ? pick(op, p) : pick(op, defaultLoadoutPick(data, op).primary, p)).loadout.weapons[slot].moveSpeedMult;
    expect(speed("fuze", 0, wp("6p41", { grip: "horizontal" }))).toBeCloseTo(0.9, 6);
    expect(speed("fuze", 0, wp("6p41", { grip: "vertical" }))).toBeCloseTo(0.9 / 1.05, 6);
    expect(speed("brava", 0, wp("para_308", { grip: "vertical" }))).toBeCloseTo(1 / 1.05, 6);
    expect(speed("brava", 1, wp("usp40"))).toBe(1); // a handgun is full speed
    expect(speed("mute", 0, wp("mp5k"))).toBeCloseTo(1 / 1.05, 6); // no grip slot, so no grip bonus
  });

  it("applies recoil attachments and the official recoil facts", () => {
    expect(brava({ barrel: "compensator" }).recoil.sideMult).toBeCloseTo(0.65, 6);
    expect(brava({ grip: "vertical", barrel: "flash_hider" }).recoil.upMult).toBeCloseTo(0.85 * 0.8, 6);
    expect(brava({ barrel: "flash_hider" }).recoil.firstShotUpMult).toBeCloseTo(0.87, 6);
    const mk14 = (barrel: WeaponPick["barrel"]) => resolveLoadout(data, pick("dokkaebi", wp("mk_14_ebr", { barrel }))).loadout.weapons[0].recoil;
    expect(mk14(null).firstShotMult).toBeCloseTo(3.5, 6);
    expect(mk14("muzzle_brake").firstShotMult).toBeCloseTo(3.5 * 0.55, 5);
    expect(mk14("muzzle_brake").recenter.delayTicks).toBeLessThan(mk14(null).recenter.delayTicks);
    const reaper = resolveLoadout(data, pick("sledge", wp("l85a2"), wp("reaper_mk2"))).loadout.weapons[1];
    expect(reaper.recoil.stages.map((s) => s.fromShot)).toEqual([0, 3, 10, 25]);
  });

  it("marks suppressed weapons, including the integral suppressors", () => {
    expect(brava({ barrel: "suppressor" }).suppressed).toBe(true);
    expect(brava().suppressed).toBe(false);
    expect(resolveWeapon(data, wp("six12_sd", { sight: "iron" })).suppressed).toBe(true);
  });

  it("resolves every pickable weapon with every attachment its carriers can fit", () => {
    for (const op of data.operators.values()) {
      for (const slot of ["primaries", "secondaries"] as const) {
        for (const id of op.loadout[slot]) {
          if (!isPickable(data, id)) continue;
          const w = data.weapons.get(id)!;
          if (!isGun(w)) continue;
          const allowed = <T extends string>(offers: (T | { id: T; operators: string[] })[]) =>
            offers.filter((o) => typeof o === "string" || o.operators.includes(op.id)).map(offerId);
          for (const sight of allowed(w.attachments.sights))
            for (const barrel of [null, ...allowed(w.attachments.barrels)])
              for (const grip of [null, ...allowed(w.attachments.grips)])
                for (const underbarrel of [null, ...allowed(w.attachments.underbarrel)]) {
                  const p = wp(id, { sight, barrel, grip, underbarrel });
                  const full = slot === "primaries" ? pick(op.id, p) : pick(op.id, defaultLoadoutPick(data, op.id).primary, p);
                  expect(problem(full), `${op.id} ${JSON.stringify(p)}`).toBeNull();
                  const r = resolveLoadout(data, full).loadout.weapons[slot === "primaries" ? 0 : 1];
                  expect(r.fire.rpm, id).toBeGreaterThan(0);
                  expect(r.ads.ticks, id).toBeGreaterThanOrEqual(1);
                }
        }
      }
    }
  });
});
