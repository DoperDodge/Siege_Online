// Reads research/weapons.csv. Used once by weapons-from-csv.ts to seed data/weapons/, and by the data
// tests to keep those files in step with the research table. Pure: no Node APIs.

/** One CSV row, keyed by the header names. */
export type CsvRow = Record<string, string>;

/** Parses standard CSV: quoted cells may hold commas, doubled quotes and newlines. */
export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v !== "")) rows.push(row);
  const [header, ...body] = rows;
  return body.map((cells) => {
    if (cells.length !== header.length) throw new Error(`weapons.csv: row "${cells[0]}" has ${cells.length} cells, the header has ${header.length}`);
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

/** True when the research marks the cell as a placeholder or as having no usable value. */
export const isUnverified = (cell: string) => cell.includes("UNVERIFIED");

/** The cell without its `UNVERIFIED:` prefix. */
export const stripUnverified = (cell: string) => cell.replace(/^UNVERIFIED:?/, "").trim();

/** The number the cell starts with ("0.6 (per shell)" → 0.6, "UNVERIFIED:155 (per shell)" → 155), or null. */
export function leadingNumber(cell: string): number | null {
  const m = /^-?\d+(\.\d+)?/.exec(stripUnverified(cell));
  return m ? Number(m[0]) : null;
}

/** The first word of the cell ("UNVERIFIED:simple (AR class…)" → "simple"), lower-cased. */
export const leadingWord = (cell: string) => (/^[A-Za-z0-9_./-]+/.exec(stripUnverified(cell))?.[0] ?? "").toLowerCase();

/** A `;`-separated list cell, each entry reduced to its first token ("muzzle_brake (Dokkaebi-only)" → "muzzle_brake"). */
export const listTokens = (cell: string) =>
  stripUnverified(cell)
    .split(";")
    .map((s) => leadingWord(s))
    .filter((s) => s !== "" && s !== "none" && s !== "n/a");

/** Research sight tokens → the names used in data/ (weapons_notes.md §1, §4.2). */
export const SIGHT_TOKENS: Record<string, string> = { iron: "iron", "1x_nonmag": "nonmag", "magnified_2.5x": "magnified", "telescopic_3.5x": "telescopic" };
