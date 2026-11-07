// The interaction tests' registry (Phase 8, gadgets/DESIGN.md §10): one test per row of research/interactions.csv, by
// its (source, target) pair. Each file under this folder registers the rows it covers; interactions.test.ts runs them
// in the CSV's order, with a todo for each row not built yet.
export type RowTest = () => Promise<void> | void;

const rows = new Map<string, RowTest>();

export const rowKey = (source: string, target: string) => `${source} > ${target}`;

/** Register the test of a CSV row (each pair once). */
export function row(source: string, target: string, test: RowTest): void {
  const key = rowKey(source, target);
  if (rows.has(key)) throw new Error(`two tests for ${key}`);
  rows.set(key, test);
}

export function registered(): ReadonlyMap<string, RowTest> {
  return rows;
}
