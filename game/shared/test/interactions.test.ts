// Every row of research/interactions.csv (Phase 8's "done when", gadgets/DESIGN.md §10): its registered test, in the
// CSV's order, grouped by source; a todo for each row not built yet. A test with no row, or a pair twice in the CSV,
// fails.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../../../tools/data/weaponsCsv.js";
import "./interactions/built.js";
import "./interactions/m2.js";
import { registered, rowKey } from "./interactions/registry.js";

const csv = parseCsv(readFileSync(new URL("../../../research/interactions.csv", import.meta.url), "utf8"));
const rows = csv.map((r) => ({ source: r.source, target: r.target, result: r.result, verified: r.verified }));

describe("research/interactions.csv", () => {
  it("names each (source, target) pair once, and every test is one of its rows", () => {
    const keys = rows.map((r) => rowKey(r.source, r.target));
    expect(new Set(keys).size).toBe(keys.length);
    expect([...registered().keys()].filter((k) => !keys.includes(k))).toEqual([]);
    expect(rows.length).toBe(343);
  });
});

for (const source of [...new Set(rows.map((r) => r.source))]) {
  describe(source, () => {
    for (const r of rows.filter((x) => x.source === source)) {
      const name = `${r.source} > ${r.target}: ${r.result}${r.verified === "UNVERIFIED" ? " (UNVERIFIED: our placeholder)" : ""}`;
      const test = registered().get(rowKey(r.source, r.target));
      if (test) it(name, test, 60_000);
      else it.todo(name);
    }
  });
}
