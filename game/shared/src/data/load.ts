// Loads and validates every data file the simulation needs. JSON is bundled at build time (Vite for the
// browser, esbuild for the server), so client and server always run the same numbers.
import movementJson from "../../../../data/movement.json";
import hitboxJson from "../../../../data/hitboxes.json";
import movementLabJson from "../../../../data/maps/movement_lab/layout.json";
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
import labRulesJson from "../../../../data/rules/lab.json";
import { weaponFiles } from "./weaponFiles.js";
import { fnv1a, utf8Encode } from "../net/bytes.js";
import {
  combatSchema,
  gunplaySchema,
  hitboxSchema,
  isGun,
  levelSchema,
  movementSchema,
  offerId,
  operatorSchema,
  roomRulesSchema,
  weaponSchema,
  type CombatData,
  type GunplayData,
  type HitboxData,
  type LevelDef,
  type MovementData,
  type OperatorData,
  type RoomRules,
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
  roomRules: Map<string, RoomRules>;
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
  levels: [movementLabJson] as Record<string, unknown>[],
  weapons: weaponFiles,
  gunplay: gunplayJson as Record<string, unknown>,
  combat: combatJson as Record<string, unknown>,
  roomRules: [labRulesJson] as Record<string, unknown>[],
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
  const roomRules = new Map<string, RoomRules>();
  for (const raw of rawData.roomRules) {
    const r = parse(`data/rules/${String(raw.id)}.json`, roomRulesSchema, raw);
    roomRules.set(r.id, r);
  }
  const data: GameData = {
    movement: parse("data/movement.json", movementSchema, rawData.movement),
    hitboxes: parse("data/hitboxes.json", hitboxSchema, rawData.hitboxes),
    operators,
    levels,
    weapons,
    gunplay: parse("data/gunplay.json", gunplaySchema, rawData.gunplay),
    combat: parse("data/combat.json", combatSchema, rawData.combat),
    roomRules,
    dataHash: fnv1a(utf8Encode(JSON.stringify(rawData))),
  };
  const problems = crossFileProblems(data);
  if (problems.length) throw new Error(`Invalid data:\n${problems.join("\n")}`);
  cached = data;
  return cached;
}

/** Checks that span files: loadouts name real weapons, restrictions name real carriers, templates exist. */
export function crossFileProblems(data: Pick<GameData, "operators" | "weapons" | "gunplay">): string[] {
  const out: string[] = [];
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
