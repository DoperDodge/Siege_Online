// One-off generator (Phase 3, M1): seeds data/weapons/<id>.json from research/weapons.csv and writes
// game/shared/src/data/weaponFiles.ts. After the first run the JSON files are the source of truth; the
// data tests keep them in step with the CSV (DECISIONS D-039).
//
// Run: npx tsx tools/data/weapons-from-csv.ts [--force]   (refuses to overwrite existing files without --force)
//
// Rules (research/weapons_notes.md §1):
// - `UNVERIFIED:<v>` becomes the value v plus an `_unverified` path; plain `UNVERIFIED` becomes a labelled
//   placeholder (or null) plus a path.
// - Numbers that exist only as prose in the `notes` column (extended-barrel damage, community ammo-refill
//   points) are typed in below, in HAND, with the row they came from.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isUnverified, leadingNumber, leadingWord, listTokens, parseCsv, SIGHT_TOKENS, type CsvRow } from "./weaponsCsv.js";

const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const force = process.argv.includes("--force");

type Offer = string | { id: string; operators: string[] };

interface Hand {
  /** Extended barrel [base, minimum] from the row notes (community-measured unless noted). */
  eb?: [number, number];
  /** Community ammo-refill points [tactical, empty] from the row notes. */
  refill?: [number, number];
  /** Per-operator attachment access (weapons_notes.md §6): slot → attachment → operator ids. */
  restrict?: Partial<Record<"sights" | "barrels" | "grips", Record<string, string[]>>>;
  /** Extra `_unverified` paths beyond the CSV's own UNVERIFIED cells. */
  unverified?: string[];
  /** Extra text for `_doc`. */
  doc?: string;
  recoil?: { firstShotMult?: number; stageStarts?: number[] };
  /** Placeholder for a plain-UNVERIFIED tactical reload (seconds). */
  tacticalPh?: number;
  /** Placeholder sight list for a plain-UNVERIFIED sights cell. */
  sightsPh?: string[];
}

// Weapons whose burst modes are in question (weapons_notes.md Q8).
const BURST_Q = ["ak_12", "m4", "commando_9", "ump45", "mp5k", "t_5_smg", "vector_45_acp"];
// Community-measured falloff distances (weapons_notes.md §4.3: handgun and machine-pistol lines).
const COMMUNITY_FALLOFF_CLASSES = ["handgun", "machine_pistol"];

const HAND: Record<string, Hand> = {
  para_308: { eb: [52, 42], refill: [1.52, 2.5], doc: "Extended barrel 52 / min 42 and ammo-refill 1.52 / 2.50 s are community-measured (row notes)." },
  camrs: {
    refill: [1.36, 2.58],
    restrict: { grips: { vertical: ["brava"], angled: ["brava"], horizontal: ["brava"] } },
    unverified: ["attachments.grips"],
    doc: "Grips only on Brava's copy (weapons_notes.md §6; Q6 asks whether that still holds). Ammo-refill 1.36 / 2.58 s community-measured.",
  },
  ak_12: { refill: [1.49, 2.47], doc: "Ammo-refill 1.49 / 2.47 s community-measured." },
  "6p41": { refill: [4.29, 7.33], doc: "Open-bolt belt LMG: 100+0, the extra round is in reserve (weapons_notes.md §4.6). Fandom gives one 8.5 s reload; ammo-refill 4.29 / 7.33 s community-measured." },
  "556xi": { refill: [1.3, 2.74], doc: "Ammo-refill 1.30 / 2.74 s community-measured." },
  m1014: { doc: "Tube-fed: reload_tactical_s is per shell and reload_empty_s is empty-to-full (weapons_notes.md §1). Damage 30 since Y11S3.1." },
  m4: { eb: [49, 39], refill: [1.31, 2.7], doc: "Extended barrel 49 / min 39 and ammo-refill 1.31 / 2.70 s community-measured." },
  m249: { refill: [4.67, 6.6], unverified: ["attachments.barrels"], doc: "Open-bolt belt LMG (100+0). Whether it has a Muzzle Brake is weapons_notes.md Q6. Ammo-refill 4.67 / 6.60 s community-measured." },
  sr_25: { doc: "Added to Striker in Y10S3. No community ammo-refill point." },
  bosg_12_2: { refill: [0.45, 1.79], unverified: ["damage.head", "damage.penetration"], doc: "Break-action, reloads both barrels. Slug headshot rule is weapons_notes.md Q13; slug penetration full (CSV) vs simple (core_mechanics.md §9.3). Ammo-refill 0.45 / 1.79 s community-measured." },
  mk_14_ebr: {
    restrict: { sights: { telescopic: ["dokkaebi"] }, barrels: { muzzle_brake: ["dokkaebi"] } },
    unverified: ["attachments.sights", "attachments.barrels", "recoil.firstShotMult"],
    recoil: { firstShotMult: 3.5 },
    doc: "Y11S3: damage 56, M&K first-shot multiplier 3.5 (official; how it maps onto our recoil model is open). Telescopic sight and Muzzle Brake are Dokkaebi-only (weapons_notes.md §6, Q6).",
  },
  xk23: { eb: [54, 43], refill: [0.91, 2.74], doc: "Y11S2 official: 49 dmg, 675 rpm, 35 × 5 = 175, extended barrel 54. Extended-barrel minimum 43 and ammo-refill 0.91 / 2.74 s community-measured." },
  l85a2: { refill: [1.43, 2.65], doc: "Ammo-refill 1.43 / 2.65 s community-measured." },
  m590a1: { doc: "Tube-fed (per-shell reload). Buckshot falloff 48 / 36 / 21 (Y8S3, based on this gun)." },
  commando_9: { eb: [40, 32], doc: "No magnified sight on defender automatics since Y10S3. Extended barrel 40 / min 32 community-measured." },
  m870: { doc: "Tube-fed (per-shell reload). Pellet damage 42 vs Fandom 60 is weapons_notes.md Q1." },
  tcsg12: { unverified: ["damage.head", "damage.penetration"], doc: "Damage 75 since Y9S4.2. Slug headshot rule is weapons_notes.md Q13; slug penetration full (CSV) vs simple (core_mechanics.md §9.3)." },
  pcx_33: { eb: [40, 32], refill: [1.03, 2.56], doc: "Skopós: each shell keeps its own ammo (weapons_notes.md §4.6). Extended barrel 40 / min 32 and ammo-refill 1.03 / 2.56 s community-measured." },
  vector_45_acp: { eb: [25, 20], refill: [0.99, 2.31], doc: "Extended barrel 25 / min 20 and ammo-refill 0.99 / 2.31 s community-measured." },
  ita12l: { doc: "Tube-fed (per-shell reload). Pellet damage 40 is a placeholder (weapons_notes.md Q1)." },
  six12_sd: { refill: [1.25, 2.02], doc: "Double-action revolver: whole-cylinder reload, integral suppressor, no barrel slot (weapons_notes.md §4.4, §4.7). Ammo-refill 1.25 / 2.02 s community-measured." },
  t_5_smg: { eb: [31, 25], refill: [0.99, 2.33], doc: "Extended barrel 31 / min 25 and ammo-refill 0.99 / 2.33 s community-measured." },
  ump45: { eb: [47, 37], refill: [1.26, 2.38], doc: "Damage 42 since Y10S4.2. Extended barrel 47 / min 37 and ammo-refill 1.26 / 2.38 s community-measured." },
  mp5k: { eb: [33, 26], refill: [1.02, 2.3], doc: "No grip slot (the Y9S1 notes' own example). Extended barrel 33 / min 26 and ammo-refill 1.02 / 2.30 s community-measured." },
  usp40: { doc: "Handgun falloff community-measured (weapons_notes.md §4.3)." },
  super_shorty: { doc: "Tube-fed secondary shotgun (per-shell reload); mainly for utility holes." },
  pmm: { doc: "Damage 61 (community) vs 63 (Fandom) is weapons_notes.md Q2." },
  gsh_18: { doc: "Laser since Y7S3." },
  "5_7_usg": { restrict: { barrels: { muzzle_brake: ["thermite", "pulse"] } }, doc: "Muzzle Brake: Thermite and Pulse; Striker's copy is weapons_notes.md Q6, so Striker is left out until verified." },
  m45_meusoc: {},
  ita12s: { doc: "Tube-fed secondary shotgun (per-shell reload). Pellet damage and ammo are weapons_notes.md Q1/Q3." },
  c75_auto: { doc: "Iron sights only. Machine-pistol falloff community-measured." },
  gonne_6: { doc: "Explosive projectile (Phase 4/8). Explosion damage and radius are weapons_notes.md Q12; not pickable until then (DECISIONS D-054)." },
  smg_12: { doc: "Y11S3 official: damage 16, magazine 22, max ammo 111. Integral suppressor, no barrel slot." },
  p226_mk_25: {},
  reaper_mk2: {
    refill: [1.12, 2.69],
    tacticalPh: 2.0,
    sightsPh: ["iron"],
    recoil: { stageStarts: [0, 3, 10, 25] },
    doc: "Recoil stages start at bullets 0/3/10/25 (official Y11S2.3). Tactical reload has no clean value (Fandom's 0.34 s is a typo): 2.0 s is a placeholder from the other machine pistols' tactical/empty ratio. Sight list is a placeholder (official 'comes with a sight', Fandom lists none). Ammo-refill 1.12 / 2.69 s community-measured.",
  },
  p229: { doc: "Skopós: each shell keeps its own ammo; whether 97 is per shell is open." },
  q_929: {},
  smg_11: { eb: [35, 28], doc: "Extended barrel 35 / min 28 community-measured." },
};

const offers = (slot: "sights" | "barrels" | "grips", ids: string[], hand: Hand): Offer[] =>
  ids.map((id) => {
    const ops = hand.restrict?.[slot]?.[id];
    return ops ? { id, operators: ops } : id;
  });

function gun(r: CsvRow): Record<string, unknown> {
  const id = r.weapon_id;
  const hand = HAND[id] ?? {};
  const unv = new Set<string>(hand.unverified ?? []);
  const mark = (cell: string, path: string) => isUnverified(cell) && unv.add(path);
  const num = (cell: string, path: string) => {
    mark(cell, path);
    const v = leadingNumber(cell);
    if (v === null) throw new Error(`${id}: no number in "${cell}" (${path})`);
    return v;
  };
  const cls = r.class;
  const pellets = num(r.pellets, "fire.pellets");
  const buckshot = pellets > 1;
  const explosive = /explosive/.test(r.fire_modes);

  const modes = [...new Set(listTokens(r.fire_modes).map((m) => (m === "auto" || m === "burst2" || m === "burst3" ? m : "semi")))];
  if (BURST_Q.includes(id)) unv.add("fire.modes");
  const fire: Record<string, unknown> = { kind: explosive ? "explosive_projectile" : "hitscan" };
  if (!explosive) fire.rpm = num(r.fire_rate_rpm, "fire.rpm");
  fire.modes = modes;
  fire.pellets = pellets;

  let damage: Record<string, unknown> | null = null;
  if (explosive) {
    mark(r.damage, "damage");
  } else {
    const base = num(r.damage, "damage.base");
    mark(r.damage_suppressed, "damage.base");
    const start = num(r.dropoff_start_m, "damage.falloff");
    const end = num(r.dropoff_end_m, "damage.falloff");
    const min = num(r.min_damage, "damage.falloff");
    // Buckshot: 100 % to 5 m, 75 % from 6–10 m, 45 % from 13 m (Y8S3, weapons_notes.md §4.3). The
    // straight lines between 5–6 m and 10–13 m and the floor rounding are placeholders.
    const plateau = Math.floor(base * 0.75);
    const falloff = buckshot ? [[start, base], [6, plateau], [10, plateau], [end, min]] : [[start, base], [end, min]];
    if (buckshot || COMMUNITY_FALLOFF_CLASSES.includes(cls)) unv.add("damage.falloff");
    damage = { base, falloff };
    mark(r.penetration_class, "damage.penetration");
    damage.penetration = leadingWord(r.penetration_class);
    damage.head = buckshot ? "pellet" : "kill";
    if (hand.eb) {
      damage.extendedBarrel = { base: hand.eb[0], falloff: [[start, hand.eb[0]], [end, hand.eb[1]]] };
      unv.add("damage.extendedBarrel");
    }
  }

  const plusOne = leadingWord(r.chambered_plus_one) === "yes";
  const ammo = { magazine: num(r.magazine, "ammo.magazine"), plusOne, maxAmmo: num(r.max_ammo, "ammo.maxAmmo") };

  let reload: Record<string, unknown>;
  if (explosive) reload = { kind: "none" };
  else if (/per shell/.test(r.reload_tactical_s)) {
    reload = { kind: "per_shell", perShellS: num(r.reload_tactical_s, "reload.perShellS"), emptyFullS: num(r.reload_empty_s, "reload.emptyFullS") };
  } else {
    const tac = leadingNumber(r.reload_tactical_s) ?? hand.tacticalPh;
    if (tac === undefined) throw new Error(`${id}: no tactical reload`);
    mark(r.reload_tactical_s, "reload.tacticalS");
    reload = { kind: "magazine", tacticalS: tac, emptyS: num(r.reload_empty_s, "reload.emptyS") };
    if (hand.refill) {
      reload.refillTacticalS = hand.refill[0];
      reload.refillEmptyS = hand.refill[1];
      unv.add("reload.refillTacticalS").add("reload.refillEmptyS");
    }
  }

  const destructionWord = leadingWord(r.destruction_class);
  const destruction = destructionWord === "" ? null : destructionWord.startsWith("full-at-close") ? "full_close_range" : destructionWord;
  mark(r.destruction_class, "destruction");

  mark(r.sights, "attachments.sights");
  const sightIds = hand.sightsPh ?? listTokens(r.sights).map((t) => SIGHT_TOKENS[t] ?? t);
  const integral = /integral suppressor/.test(r.barrels);
  mark(r.barrels, "attachments.barrels");
  const barrels = integral ? [] : listTokens(r.barrels);
  const grips = listTokens(r.grips);
  const underbarrel = listTokens(r.underbarrel);

  const recoil: Record<string, unknown> = { template: cls, ...hand.recoil };

  const operators = r.operators.split(";").join(", ");
  const out: Record<string, unknown> = {
    _doc: `${r.name} (${operators}). research/weapons.csv row ${id}; class rules research/weapons_notes.md §4.${hand.doc ? " " + hand.doc : ""}`,
    _season: r.season_verified,
    _unverified: [...unv].sort(),
    id,
    name: r.name,
    class: cls,
    fire,
    damage,
    ammo,
    reload,
    adsS: num(r.ads_time_s, "adsS"),
    destruction,
  };
  if (integral) out.integralSuppressor = true;
  out.attachments = { sights: offers("sights", sightIds, hand), barrels: offers("barrels", barrels, hand), grips: offers("grips", grips, hand), underbarrel };
  out.recoil = recoil;
  return out;
}

function shield(r: CsvRow): Record<string, unknown> {
  return {
    _doc: "Ballistic Shield (Fuze). research/weapons.csv row ballistic_shield; rules research/weapons_notes.md §5. Used with the secondary; not pickable until Phase 8 (DECISIONS D-054). Bash damage 0 (Y9S4) supersedes fuze.md's 65 (Y9S1).",
    _season: r.season_verified,
    _unverified: ["shield.moveSpeedMult", "shield.suppression.falloffS", "shield.bashDamage"],
    id: r.weapon_id,
    name: r.name,
    class: "shield",
    shield: {
      pistolAdsS: { walk: 0.5, sprint: 0.55 },
      hipFire: false,
      moveSpeedMult: 0.9,
      suppression: { hitsToTrigger: 5, hitsToMax: 20, falloffS: 7 },
      bashDamage: 0,
    },
  };
}

/** One-line JSON with a space after commas and colons, like the hand-written data files. */
function inline(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  return `{ ${Object.entries(value as Record<string, unknown>).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(", ")} }`;
}

/** JSON with short arrays and nested objects on one line. */
function format(value: unknown, indent = ""): string {
  const one = inline(value);
  if (value === null || typeof value !== "object" || (indent.length >= 4 && one.length <= 90) || (Array.isArray(value) && one.length <= 100 && !one.includes("{"))) return one;
  const inner = indent + "  ";
  if (Array.isArray(value)) return `[\n${value.map((v) => inner + format(v, inner)).join(",\n")}\n${indent}]`;
  const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${format(v, inner)}`);
  return `{\n${entries.join(",\n")}\n${indent}}`;
}

const rows = parseCsv(readFileSync(root("research/weapons.csv"), "utf8"));
mkdirSync(root("data/weapons"), { recursive: true });
for (const r of rows) {
  const path = root(`data/weapons/${r.weapon_id}.json`);
  if (existsSync(path) && !force) throw new Error(`${path} exists; the JSON is now the source of truth (pass --force to regenerate)`);
  writeFileSync(path, format(r.class === "shield" ? shield(r) : gun(r)) + "\n");
}
const ids = rows.map((r) => r.weapon_id);
const ident = (id: string) => "w_" + id.replace(/[^a-z0-9_]/g, "_");
writeFileSync(
  root("game/shared/src/data/weaponFiles.ts"),
  [
    "// Every data/weapons/*.json file, imported explicitly (import.meta.glob is Vite-only; the server bundles with",
    "// esbuild). Generated by tools/data/weapons-from-csv.ts; a data test checks it lists every file in the folder.",
    ...ids.map((id) => `import ${ident(id)} from "../../../../data/weapons/${id}.json";`),
    "",
    `export const weaponFiles: Record<string, unknown>[] = [${ids.map(ident).join(", ")}];`,
    "",
  ].join("\n"),
);
console.log(`wrote ${rows.length} weapon files and weaponFiles.ts`);
