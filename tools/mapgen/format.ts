// JSON for files people read in diffs: objects at the top open up, one record per line in lists of records,
// and a record holding a list of records (a wall line and its spans) opens that list one per line.

/** Compact JSON with a space after colons and commas: {"id": "a", "at": [1, 2]}. */
export function compact(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(compact).join(", ")}]`;
  return `{${Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .map(([k, x]) => `${JSON.stringify(k)}: ${compact(x)}`)
    .join(", ")}}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isRecordList = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.length > 0 && v.every(isRecord);

function record(v: Record<string, unknown>, indent: string): string {
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  const nested = entries.filter(([, x]) => isRecordList(x));
  if (nested.length === 0) return compact(v);
  const flat = entries.filter(([, x]) => !isRecordList(x)).map(([k, x]) => `${JSON.stringify(k)}: ${compact(x)}`);
  const lists = nested.map(([k, x]) => `${JSON.stringify(k)}: ${list(x as Record<string, unknown>[], indent)}`);
  return `{${[...flat, ...lists].join(", ")}}`;
}

function list(items: Record<string, unknown>[], indent: string): string {
  const inner = indent + " ";
  return `[\n${items.map((i) => inner + record(i, inner)).join(",\n")}\n${indent}]`;
}

/** The whole file: top-level keys one per line. */
export function readableJson(v: Record<string, unknown>): string {
  const lines = Object.entries(v)
    .filter(([, x]) => x !== undefined)
    .map(([k, x]) => ` ${JSON.stringify(k)}: ${isRecordList(x) ? list(x, " ") : isRecord(x) && Object.keys(x).length > 0 ? nestedObject(x, " ") : compact(x)}`);
  return `{\n${lines.join(",\n")}\n}\n`;
}

function nestedObject(v: Record<string, unknown>, indent: string): string {
  const inner = indent + " ";
  const lines = Object.entries(v)
    .filter(([, x]) => x !== undefined)
    .map(([k, x]) => `${inner}${JSON.stringify(k)}: ${isRecordList(x) ? list(x, inner) : compact(x)}`);
  return `{\n${lines.join(",\n")}\n${indent}}`;
}

/** Round to a number of decimals, keeping -0 out of the files. */
export const round = (x: number, decimals: number) => {
  const p = 10 ** decimals;
  const r = Math.round(x * p) / p;
  return r === 0 ? 0 : r;
};
