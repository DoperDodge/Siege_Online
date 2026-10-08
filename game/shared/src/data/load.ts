// Loads and validates every data file the simulation needs. JSON is bundled at build time (Vite for the
// browser, esbuild for the server), so client and server always run the same numbers.
import movementJson from "../../../../data/movement.json";
import hitboxJson from "../../../../data/hitboxes.json";
import movementLabJson from "../../../../data/maps/movement_lab/layout.json";
import rangeLabJson from "../../../../data/maps/range_lab/layout.json";
import brava from "../../../../data/operators/brava.json";
import fuze from "../../../../data/operators/fuze.json";
import thermite from "../../../../data/operators/thermite.json";
import striker from "../../../../data/operators/striker.json";
import dokkaebi from "../../../../data/operators/dokkaebi.json";
import sledge from "../../../../data/operators/sledge.json";
import sentry from "../../../../data/operators/sentry.json";
import skopos from "../../../../data/operators/skopos.json";
import mira from "../../../../data/operators/mira.json";
import lesion from "../../../../data/operators/lesion.json";
import pulse from "../../../../data/operators/pulse.json";
import mute from "../../../../data/operators/mute.json";
import gunplayJson from "../../../../data/gunplay.json";
import combatJson from "../../../../data/combat.json";
import labModeJson from "../../../../data/modes/lab.json";
import destructionJson from "../../../../data/destruction.json";
import { weaponFiles } from "./weaponFiles.js";
import { fnv1a, utf8Encode } from "../net/bytes.js";
import {
  combatSchema,
  destructionSchema,
  gunplaySchema,
  hitboxSchema,
  isGun,
  levelSchema,
  movementSchema,
  offerId,
  operatorSchema,
  modeSchema,
  weaponSchema,
  type CombatData,
  type Construction,
  type DestructionData,
  type GunplayData,
  type HitboxData,
  type LevelDef,
  type MovementData,
  type OperatorData,
  type ModeData,
  type Surface,
  type WeaponData,
} from "./schemas.js";

export interface GameData {
  movement: MovementData;
  hitboxes: HitboxData;
  operators: Map<string, OperatorData>;
  levels: Map<string, LevelDef>;
  weapons: Map<string, WeaponData>;
  gunplay: GunplayData;
  combat: CombatData;
  /** Mode presets (data/modes/); Phase 3 has only "lab". */
  modes: Map<string, ModeData>;
  /** Panels, holes, reinforcement, barricades and hatches (Phase 4). */
  destruction: DestructionData;
  /**
   * fnv1a of every simulation data file as bundled. The client sends it in Hello; a server built from other
   * data refuses the connection, so a stale tab never predicts with old numbers (DECISIONS D-042).
   */
  dataHash: number;
}

/** Raw JSON as imported, exposed for data-integrity tests. */
export const rawData = {
  movement: movementJson as Record<string, unknown>,
  hitboxes: hitboxJson as Record<string, unknown>,
  operators: [brava, fuze, thermite, striker, dokkaebi, sledge, sentry, skopos, mira, lesion, pulse, mute] as Record<string, unknown>[],
  levels: [movementLabJson, rangeLabJson] as Record<string, unknown>[],
  weapons: weaponFiles,
  gunplay: gunplayJson as Record<string, unknown>,
  combat: combatJson as Record<string, unknown>,
  modes: [labModeJson] as Record<string, unknown>[],
  destruction: destructionJson as Record<string, unknown>,
};

let cached: GameData | null = null;

/** Parses and validates all data. Throws a readable error naming the bad file/field. */
export function loadGameData(): GameData {
  if (cached) return cached;
  const parse = <T>(what: string, schema: { parse(v: unknown): T }, value: unknown): T => {
    try {
      return schema.parse(value);
    } catch (e) {
      throw new Error(`Invalid data in ${what}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const operators = new Map<string, OperatorData>();
  for (const raw of rawData.operators) {
    const op = parse(`data/operators/${String(raw.id)}.json`, operatorSchema, raw);
    operators.set(op.id, op);
  }
  const levels = new Map<string, LevelDef>();
  for (const raw of rawData.levels) {
    const lvl = parse(`data/maps/${String(raw.id)}/layout.json`, levelSchema, raw);
    levels.set(lvl.id, lvl);
  }
  const weapons = new Map<string, WeaponData>();
  for (const raw of rawData.weapons) {
    const w = parse(`data/weapons/${String(raw.id)}.json`, weaponSchema, raw);
    if (weapons.has(w.id)) throw new Error(`Invalid data: two weapon files have the id "${w.id}"`);
    weapons.set(w.id, w);
  }
  const modes = new Map<string, ModeData>();
  for (const raw of rawData.modes) {
    const m = parse(`data/modes/${String(raw.id)}.json`, modeSchema, raw);
    modes.set(m.id, m);
  }
  const data: GameData = {
    movement: parse("data/movement.json", movementSchema, rawData.movement),
    hitboxes: parse("data/hitboxes.json", hitboxSchema, rawData.hitboxes),
    operators,
    levels,
    weapons,
    gunplay: parse("data/gunplay.json", gunplaySchema, rawData.gunplay),
    combat: parse("data/combat.json", combatSchema, rawData.combat),
    modes,
    destruction: parse("data/destruction.json", destructionSchema, rawData.destruction),
    dataHash: fnv1a(utf8Encode(JSON.stringify(rawData))),
  };
  const problems = crossFileProblems(data);
  if (problems.length) throw new Error(`Invalid data:\n${problems.join("\n")}`);
  cached = data;
  return cached;
}

/** Checks that span files: loadouts name real weapons, restrictions name real carriers, templates exist. */
export function crossFileProblems(data: Pick<GameData, "operators" | "weapons" | "gunplay"> & Partial<Pick<GameData, "levels" | "destruction">>): string[] {
  const out: string[] = [];
  if (data.destruction) out.push(...destructionProblems(data.destruction, data.weapons, data.levels));
  for (const lvl of data.levels?.values() ?? []) {
    for (const d of lvl.dummies) if (!data.operators.has(d.operator)) out.push(`data/maps/${lvl.id}/layout.json: dummy "${d.id}" is operator "${d.operator}", who has no data/operators file`);
    const ids = lvl.dummies.map((d) => d.id);
    if (new Set(ids).size !== ids.length) out.push(`data/maps/${lvl.id}/layout.json: two dummies share an id`);
  }
  const carriers = new Map<string, Set<string>>();
  for (const op of data.operators.values()) {
    for (const [slot, ids] of [["primaries", op.loadout.primaries], ["secondaries", op.loadout.secondaries]] as const) {
      for (const id of ids) {
        const w = data.weapons.get(id);
        if (!w) {
          out.push(`data/operators/${op.id}.json: loadout.${slot} names "${id}", which has no data/weapons file`);
          continue;
        }
        if (w.class === "shield" && slot !== "primaries") out.push(`data/operators/${op.id}.json: the shield "${id}" can only be a primary`);
        if (!carriers.has(id)) carriers.set(id, new Set());
        carriers.get(id)!.add(op.id);
      }
    }
  }
  for (const w of data.weapons.values()) {
    if (!isGun(w)) continue;
    const file = `data/weapons/${w.id}.json`;
    for (const [slot, offers] of Object.entries(w.attachments)) {
      for (const o of offers) {
        if (typeof o === "string") continue;
        for (const opId of o.operators) {
          if (!carriers.get(w.id)?.has(opId)) out.push(`${file}: attachments.${slot} "${offerId(o)}" names "${opId}", who doesn't carry this weapon`);
        }
      }
    }
    const template = data.gunplay.recoilTemplates[w.recoil.template];
    if (!template) out.push(`${file}: recoil.template "${w.recoil.template}" isn't in data/gunplay.json recoilTemplates`);
    else if (w.recoil.stageStarts && w.recoil.stageStarts.length !== template.stages.length) {
      out.push(`${file}: recoil.stageStarts has ${w.recoil.stageStarts.length} entries; template "${w.recoil.template}" has ${template.stages.length} stages`);
    }
  }
  return out;
}

/** The kind of construction each destructible surface needs (a hatch surface can't be built as a wall). */
const SURFACE_KINDS: Partial<Record<Surface, readonly Construction["kind"][]>> = {
  SOFT_WALL: ["wall"],
  REINFORCEABLE: ["wall"],
  REINFORCED_WALL: ["wall"],
  SOFT_FLOOR: ["floor"],
  HATCH: ["hatch"],
  BARRICADE: ["barricade"],
  WINDOW: ["glass"],
};

/**
 * data/destruction.json against the rest: surfaces and level panels name real constructions of the right
 * kind, every gun class has bullet rules, overrides name real weapons, and every panel is thick and big
 * enough for its construction's layers and at least one cell each way.
 */
function destructionProblems(d: DestructionData, weapons: Map<string, WeaponData>, levels: Map<string, LevelDef> | undefined): string[] {
  const out: string[] = [];
  const file = "data/destruction.json";
  const kindOk = (surface: Surface, id: string) => SURFACE_KINDS[surface]?.includes(d.constructions[id]?.kind as Construction["kind"]) ?? false;
  for (const [surface, id] of Object.entries(d.surfaces) as [Surface, string][]) {
    if (!d.constructions[id]) out.push(`${file}: surfaces.${surface} names "${id}", which isn't in constructions`);
    else if (!kindOk(surface, id)) out.push(`${file}: surfaces.${surface} is built as a ${d.constructions[id].kind}`);
  }
  for (const surface of Object.keys(SURFACE_KINDS) as Surface[]) if (!d.surfaces[surface]) out.push(`${file}: surfaces.${surface} is missing`);
  const classes = new Set<string>();
  for (const w of weapons.values()) {
    if (!isGun(w)) continue;
    classes.add(w.class);
    const tier = w.destruction ?? d.bullets.classTiers[w.class];
    if (!tier) out.push(`${file}: bullets.classTiers has no tier for "${w.class}", and data/weapons/${w.id}.json names none`);
    else if (!d.bullets.tiers[tier]) out.push(`${file}: bullets.tiers has no "${tier}" (used by ${w.id})`);
  }
  for (const [cls, tier] of Object.entries(d.bullets.classTiers)) if (!d.bullets.tiers[tier]) out.push(`${file}: bullets.classTiers.${cls} is "${tier}", which isn't in bullets.tiers`);
  for (const cls of Object.keys(d.bullets.classAdjust)) if (!classes.has(cls)) out.push(`${file}: bullets.classAdjust names "${cls}", which no gun has`);
  for (const lvl of levels?.values() ?? []) {
    for (const s of lvl.solids) {
      const at = `data/maps/${lvl.id}/layout.json: solid "${s.id}"`;
      const id = s.panel?.construction ?? d.surfaces[s.surface];
      if (!id) {
        if (s.panel) out.push(`${at} has panel options but a ${s.surface} isn't destructible`);
        continue;
      }
      const c = d.constructions[id];
      if (!c) {
        out.push(`${at}: panel.construction "${id}" isn't in ${file}`);
        continue;
      }
      if (!kindOk(s.surface, id)) out.push(`${at}: a ${s.surface} can't be built as a ${c.kind}`);
      // Walls, barricades and glass stand: their thickness is the thinner horizontal side. Floors and
      // hatches lie flat: their thickness is the height.
      const flat = c.kind === "floor" || c.kind === "hatch";
      const [w, h, t] = flat ? [s.size[0], s.size[2], s.size[1]] : [Math.max(s.size[0], s.size[2]), s.size[1], Math.min(s.size[0], s.size[2])];
      if (w < d.cellM || h < d.cellM) out.push(`${at} is smaller than one ${d.cellM} m cell`);
      if ("skinM" in c && t <= 2 * c.skinM) out.push(`${at} is ${t} m thick, no thicker than its two ${c.skinM} m skins`);
      if (s.panel?.reinforced && !("reinforceable" in c && c.reinforceable)) out.push(`${at} starts reinforced but "${id}" can't be reinforced`);
      if (s.panel?.empty !== undefined && c.kind !== "barricade") out.push(`${at}: only a barricade can start empty`);
    }
  }
  return out;
}