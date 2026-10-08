import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isUnverified, leadingNumber, leadingWord, listTokens, parseCsv, SIGHT_TOKENS } from "../../../tools/data/weaponsCsv.js";
import {
  combatSchema,
  crossFileProblems,
  fnv1a,
  gunplaySchema,
  isGun,
  loadGameData,
  missingUnverifiedPaths,
  offerId,
  rawData,
  utf8Encode,
  weaponSchema,
  type GunData,
  type OperatorData,
  type WeaponData,
} from "../src/index.js";

const csv = parseCsv(readFileSync(new URL("../../../research/weapons.csv", import.meta.url), "utf8"));
const weaponDir = new URL("../../../data/weapons/", import.meta.url);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("data files", () => {
  const data = loadGameData();

  it("all data files validate", () => {
    expect(data.operators.size).toBe(12);
    expect(data.levels.has("movement_lab")).toBe(true);
    expect(data.weapons.size).toBe(40);
    expect(data.modes.has("lab")).toBe(true);
    expect(crossFileProblems(data)).toEqual([]);
  });

  it("every _unverified marker points at a real field", () => {
    const files: [string, Record<string, unknown>][] = [
      ["movement", rawData.movement],
      ["hitboxes", rawData.hitboxes],
      ["gunplay", rawData.gunplay],
      ["combat", rawData.combat],
      ...rawData.operators.map((o): [string, Record<string, unknown>] => [`operators/${String(o.id)}`, o]),
      ...rawData.weapons.map((w): [string, Record<string, unknown>] => [`weapons/${String(w.id)}`, w]),
      ...rawData.modes.map((r): [string, Record<string, unknown>] => [`modes/${String(r.id)}`, r]),
    ];
    for (const [name, raw] of files) {
      expect(missingUnverifiedPaths(raw, (raw._unverified as string[] | undefined) ?? []), name).toEqual([]);
    }
  });

  it("weapon files: one per file name, all imported, all carried by an operator", () => {
    const onDisk = readdirSync(weaponDir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
    expect(rawData.weapons.map((w) => String(w.id)).sort()).toEqual(onDisk);
    for (const id of onDisk) {
      expect(JSON.parse(readFileSync(new URL(`${id}.json`, weaponDir), "utf8")).id, `${id}.json`).toBe(id);
    }
    const carried = new Set([...data.operators.values()].flatMap((op) => [...op.loadout.primaries, ...op.loadout.secondaries]));
    expect([...carried].sort()).toEqual(onDisk);
  });

  it("dataHash is the hash of the bundled data", () => {
    expect(data.dataHash).toBe(fnv1a(utf8Encode(JSON.stringify(rawData))));
    expect(Number.isInteger(data.dataHash) && data.dataHash >= 0 && data.dataHash < 2 ** 32).toBe(true);
  });

  it("operator ratings match the official pages (research/core_mechanics.md §1.3)", () => {
    const expected: Record<string, [number, number]> = {
      brava: [1, 3],
      fuze: [3, 1],
      thermite: [2, 2],
      striker: [2, 2],
      dokkaebi: [1, 3],
      sledge: [2, 2],
      sentry: [2, 2],
      skopos: [1, 3],
      mira: [3, 1],
      lesion: [2, 2],
      pulse: [1, 3],
      mute: [2, 2],
    };
    for (const [id, [health, speed]] of Object.entries(expected)) {
      const op = data.operators.get(id)!;
      expect([op.healthRating, op.speedRating], id).toEqual([health, speed]);
    }
  });


  it("gadget-kit operators pick two distinct gadgets from a 7-gadget pool; Skopós has two pawns", () => {
    for (const id of ["striker", "sentry"]) {
      const kit = data.operators.get(id)!.loadout.gadgetKit!;
      expect(kit).toMatchObject({ picks: 2, distinct: true });
      expect(kit.pool).toHaveLength(7);
    }
    expect(data.operators.get("skopos")!.pawns).toBe(2);
  });
});

describe("weapon data agrees with research/weapons.csv (DECISIONS D-039)", () => {
  const data = loadGameData();
  const guns = csv.filter((r) => r.class !== "shield");

  // A path counts as marked when it, or a parent of it, is in _unverified.
  const marked = (w: WeaponData, path: string) => w._unverified.some((u) => path === u || path.startsWith(u + "."));

  it("has one file per CSV row", () => {
    expect(csv.map((r) => r.weapon_id).sort()).toEqual([...data.weapons.keys()].sort());
    for (const r of csv) expect(data.weapons.get(r.weapon_id)!.name, r.weapon_id).toBe(r.name);
  });

  it("matches every numeric cell, and marks every UNVERIFIED cell", () => {
    for (const r of guns) {
      const w = data.weapons.get(r.weapon_id) as GunData;
      expect(w.class, r.weapon_id).toBe(r.class);
      const check = (column: string, path: string, actual: unknown) => {
        const cell = r[column];
        if (isUnverified(cell)) expect(marked(w, path), `${r.weapon_id}: ${column} is UNVERIFIED, so ${path} must be in _unverified`).toBe(true);
        const n = leadingNumber(cell);
        if (n !== null) expect(actual, `${r.weapon_id}: ${column}`).toBe(n);
      };
      const d = w.damage;
      if (d) {
        check("damage", "damage.base", d.base);
        check("damage_suppressed", "damage.base", d.base);
        check("dropoff_start_m", "damage.falloff", d.falloff[0][0]);
        check("dropoff_end_m", "damage.falloff", d.falloff.at(-1)![0]);
        check("min_damage", "damage.falloff", d.falloff.at(-1)![1]);
        check("penetration_class", "damage.penetration", d.penetration);
        expect(d.penetration, r.weapon_id).toBe(leadingWord(r.penetration_class));
      } else {
        expect(isUnverified(r.damage) && marked(w, "damage"), `${r.weapon_id}: no damage block`).toBe(true);
      }
      check("fire_rate_rpm", "fire.rpm", w.fire.rpm);
      check("pellets", "fire.pellets", w.fire.pellets);
      check("magazine", "ammo.magazine", w.ammo.magazine);
      check("max_ammo", "ammo.maxAmmo", w.ammo.maxAmmo);
      check("ads_time_s", "adsS", w.adsS);
      expect(w.ammo.plusOne, `${r.weapon_id}: chambered_plus_one`).toBe(leadingWord(r.chambered_plus_one) === "yes");
      if (w.reload.kind === "per_shell") {
        check("reload_tactical_s", "reload.perShellS", w.reload.perShellS);
        check("reload_empty_s", "reload.emptyFullS", w.reload.emptyFullS);
      } else if (w.reload.kind === "magazine") {
        check("reload_tactical_s", "reload.tacticalS", w.reload.tacticalS);
        check("reload_empty_s", "reload.emptyS", w.reload.emptyS);
      } else {
        expect(leadingNumber(r.reload_tactical_s), r.weapon_id).toBeNull();
      }
      check("destruction_class", "destruction", null);
      const modes = [...new Set(listTokens(r.fire_modes).map((m) => (["auto", "burst2", "burst3"].includes(m) ? m : "semi")))];
      expect(w.fire.modes, `${r.weapon_id}: fire_modes`).toEqual(modes);

      const ids = (slot: keyof GunData["attachments"]) => w.attachments[slot].map(offerId);
      check("sights", "attachments.sights", null);
      if (!isUnverified(r.sights) || leadingWord(r.sights) !== "") expect(ids("sights"), `${r.weapon_id}: sights`).toEqual(listTokens(r.sights).map((t) => SIGHT_TOKENS[t]));
      check("barrels", "attachments.barrels", null);
      expect(ids("barrels"), `${r.weapon_id}: barrels`).toEqual(w.integralSuppressor ? [] : listTokens(r.barrels));
      expect(w.integralSuppressor, r.weapon_id).toBe(/integral suppressor/.test(r.barrels));
      expect(ids("grips"), `${r.weapon_id}: grips`).toEqual(listTokens(r.grips));
      expect(ids("underbarrel"), `${r.weapon_id}: underbarrel`).toEqual(listTokens(r.underbarrel));
    }
  });

  it("follows the class rules (weapons_notes.md §4.1, §4.3, §4.6)", () => {
    const primaries = new Set([...data.operators.values()].flatMap((op) => op.loadout.primaries));
    // Post-Y6S3 official changes outside the Y6S3 ammo ranges.
    const ammoExceptions: Record<string, string> = { smg_12: "Y11S3 cut it to 111 (official)" };
    for (const w of data.weapons.values()) {
      if (!isGun(w)) continue;
      const cls = data.gunplay.classes[w.class];
      expect(w.adsS, `${w.id}: ADS time is the class time`).toBe(cls.adsS);
      if (w.damage && cls.falloff) {
        expect(w.damage.falloff.map((p) => p[0]), `${w.id}: falloff distances`).toEqual(cls.falloff.map((p) => p[0]));
        w.damage.falloff.forEach(([, dmg], i) => {
          expect(Math.abs(dmg - w.damage!.base * cls.falloff![i][1]), `${w.id}: falloff point ${i} within 1 of the class fraction`).toBeLessThanOrEqual(1);
        });
      }
      const range = cls.maxAmmo;
      const skip = !range || marked(w, "ammo.maxAmmo") || (cls.maxAmmoPrimaryOnly && !primaries.has(w.id)) || w.id in ammoExceptions;
      if (!skip) {
        expect(w.ammo.maxAmmo, `${w.id}: total ammo in the class range`).toBeGreaterThanOrEqual(range[0]);
        expect(w.ammo.maxAmmo, `${w.id}: total ammo in the class range (+1)`).toBeLessThanOrEqual(range[1] + 1);
      }
    }
    expect(data.gunplay.classes.lmg.moveSpeedMult).toBe(0.9);
    expect(data.gunplay.attachments.horizontal.moveSpeedMult).toBe(1.05);
  });

  it("encodes the per-operator attachment access and the special cases", () => {
    const w = (id: string) => data.weapons.get(id) as GunData;
    expect(w("mk_14_ebr").attachments.sights).toContainEqual({ id: "telescopic", operators: ["dokkaebi"] });
    expect(w("mk_14_ebr").recoil.firstShotMult).toBe(3.5);
    expect(w("reaper_mk2").recoil.stageStarts).toEqual([0, 3, 10, 25]);
    expect(w("5_7_usg").attachments.barrels).toContainEqual({ id: "muzzle_brake", operators: ["thermite", "pulse"] });
    expect(w("six12_sd").integralSuppressor && w("smg_12").integralSuppressor).toBe(true);
    expect(w("mp5k").attachments.grips).toEqual([]);
    expect(w("m590a1").damage!.falloff).toEqual([[5, 48], [6, 36], [10, 36], [13, 21]]);
    expect(w("para_308").damage!.extendedBarrel).toEqual({ base: 52, falloff: [[25, 52], [35, 42]] });
    expect(w("xk23").damage!.extendedBarrel!.base).toBe(54);
    expect(w("gonne_6").fire.kind).toBe("explosive_projectile");
    expect(data.weapons.get("ballistic_shield")!.class).toBe("shield");
    // Defender automatic weapons lost magnified sights in Y10S3 (weapons_notes.md §4.2).
    for (const id of ["commando_9", "pcx_33", "vector_45_acp", "t_5_smg", "ump45", "mp5k"]) expect(w(id).attachments.sights.map(offerId), id).not.toContain("magnified");
    expect(data.operators.get("skopos")!.combat).toEqual({ canDbno: false, meleeHole: "large" });
    expect(data.operators.get("sledge")!.combat).toEqual({ canDbno: true, meleeHole: "standard" });
  });
});

describe("weapon schema and cross-file checks reject bad data", () => {
  const data = loadGameData();
  const raw = (id: string) => clone(rawData.weapons.find((w) => w.id === id)!) as Record<string, any>;
  const rejects = (v: unknown) => expect(weaponSchema.safeParse(v).success).toBe(false);

  it("accepts the real files", () => {
    for (const w of rawData.weapons) expect(weaponSchema.safeParse(w).success, String(w.id)).toBe(true);
    expect(gunplaySchema.safeParse(rawData.gunplay).success).toBe(true);
    expect(combatSchema.safeParse(rawData.combat).success).toBe(true);
  });

  it("rejects impossible weapons", () => {
    let w = raw("para_308");
    w.fire.rpm = 3841; // more than one shot per 64 Hz tick
    rejects(w);
    w = raw("para_308");
    w.damage.falloff = [[25, 47], [35, 50]]; // damage rising with distance
    rejects(w);
    w = raw("para_308");
    w.damage.falloff = [[25, 40], [35, 28]]; // first point isn't the base damage
    rejects(w);
    w = raw("para_308");
    delete w.damage.extendedBarrel; // the barrel is offered but has no numbers
    rejects(w);
    w = raw("ak_12");
    w.damage.extendedBarrel = { base: 44, falloff: [[25, 44], [35, 30]] }; // numbers for a barrel it can't take
    rejects(w);
    w = raw("six12_sd");
    w.attachments.barrels = ["suppressor"]; // integral suppressor: no barrel slot
    rejects(w);
    w = raw("para_308");
    w.attachments.grips = ["vertical"]; // every grip slot offers the horizontal grip
    rejects(w);
    w = raw("m590a1");
    w.ammo.plusOne = true; // tube-fed
    rejects(w);
    w = raw("para_308");
    w.ammo.maxAmmo = 20; // less than a magazine
    rejects(w);
    w = raw("para_308");
    w.ammo.magazine = 256; // loaded rounds travel as a u8
    rejects(w);
    w = raw("para_308");
    w.typo = 1; // unknown fields are mistakes
    rejects(w);
    w = raw("para_308");
    w.damage.head = "pellet"; // single-projectile weapons don't use the pellet rule
    rejects(w);
  });

  it("finds loadouts and restrictions that don't line up", () => {
    const ops = new Map<string, OperatorData>([...data.operators].map(([k, v]) => [k, clone(v)]));
    const weapons = new Map(data.weapons);
    ops.get("brava")!.loadout.primaries.push("nope");
    ops.get("fuze")!.loadout.secondaries.push("ballistic_shield");
    const mk14 = clone(weapons.get("mk_14_ebr")) as GunData;
    mk14.attachments.barrels = [{ id: "muzzle_brake", operators: ["sledge"] }];
    weapons.set("mk_14_ebr", mk14);
    const reaper = clone(weapons.get("reaper_mk2")) as GunData;
    reaper.recoil.stageStarts = [0, 3];
    weapons.set("reaper_mk2", reaper);
    const problems = crossFileProblems({ operators: ops, weapons, gunplay: data.gunplay });
    expect(problems.join("\n")).toMatch(/brava\.json: loadout\.primaries names "nope"/);
    expect(problems.join("\n")).toMatch(/fuze\.json: the shield "ballistic_shield" can only be a primary/);
    expect(problems.join("\n")).toMatch(/mk_14_ebr\.json: attachments\.barrels "muzzle_brake" names "sledge"/);
    expect(problems.join("\n")).toMatch(/reaper_mk2\.json: recoil\.stageStarts has 2 entries/);
  });
});
