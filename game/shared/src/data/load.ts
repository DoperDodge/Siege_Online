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
import {
  hitboxSchema,
  levelSchema,
  movementSchema,
  operatorSchema,
  type HitboxData,
  type LevelDef,
  type MovementData,
  type OperatorData,
} from "./schemas.js";

export interface GameData {
  movement: MovementData;
  hitboxes: HitboxData;
  operators: Map<string, OperatorData>;
  levels: Map<string, LevelDef>;
}

/** Raw JSON as imported, exposed for data-integrity tests. */
export const rawData = {
  movement: movementJson as Record<string, unknown>,
  hitboxes: hitboxJson as Record<string, unknown>,
  operators: [brava, fuze, thermite, striker, dokkaebi, sledge, sentry, skopos, mira, lesion, pulse, mute] as Record<string, unknown>[],
  levels: [movementLabJson] as Record<string, unknown>[],
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
  cached = {
    movement: parse("data/movement.json", movementSchema, rawData.movement),
    hitboxes: parse("data/hitboxes.json", hitboxSchema, rawData.hitboxes),
    operators,
    levels,
  };
  return cached;
}
