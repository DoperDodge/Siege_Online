// The panel model (Phase 4 M2, destruction/panel.ts): holes in whole cells, what falls once nothing holds
// it, steel's anchors, breakable panels, the movement mask, and a state that round-trips exactly.
import { describe, expect, it } from "vitest";
import { ByteReader, ByteWriter, greedyRects, L_BACK, L_CORE, L_FRONT, L_STEEL, loadGameData, MOVE_CELLS, Panel, type PanelOp, type PanelSpec } from "../src/index.js";

const data = loadGameData();
const d = data.destruction;

function panel(constructionId: string, widthM: number, heightM: number, thicknessM: number, extra: Partial<PanelSpec> = {}): Panel {
  const construction = d.constructions[constructionId];
  const hp = construction.kind === "hatch" ? construction.hp : construction.kind === "barricade" ? d.barricade.hp : construction.kind === "glass" ? 1 : 0;
  return new Panel({
    index: 0,
    id: "p",
    constructionId,
    construction,
    widthM,
    heightM,
    thicknessM,
    cellM: d.cellM,
    sections: 2,
    steelHeightM: d.reinforcement.steelHeightM,
    reinforced: false,
    empty: false,
    hp,
    reinforcedHatchHp: d.reinforcement.reinforcedHatchHp,
    ...extra,
  });
}
const count = (l: Uint8Array | null) => (l ? l.reduce((n, x) => n + x, 0) : 0);
/** A disc around the centre of cell (u, v), `diameterM` across. */
const disc = (layer: number, u: number, v: number, diameterM: number): PanelOp => ({ kind: "cut", layer, shape: { kind: "disc", u4: 4 * u + 2, v4: 4 * v + 2, r4: Math.round((4 * diameterM) / 2 / d.cellM) }, hard: false });
const rect = (layer: number, u0: number, v0: number, u1: number, v1: number, hard = false): PanelOp => ({ kind: "cut", layer, shape: { kind: "rect", u0, v0, u1, v1 }, hard });
/** Is the face open at (u, v) for a body: no layer has material in that movement cell? */
const covered = (p: Panel, uM: number, vM: number) => p.movementRects().some((r) => uM >= r.u0 && uM < r.u1 && vM >= r.v0 && vM < r.v1);

describe("a soft wall", () => {
  it("is two skins and a stud every 40 cm, on a grid of whole 5 cm cells", () => {
    const p = panel("soft_wall", 2, 2.5, 0.2);
    expect([p.w, p.h, p.cellU, p.cellV]).toEqual([40, 50, 0.05, 0.05]);
    expect(count(p.layers[L_FRONT])).toBe(2000);
    expect(count(p.layers[L_BACK])).toBe(2000);
    // Studs at 0.4, 0.8, 1.2 and 1.6 m, one cell wide, floor to ceiling.
    const studColumns = [...Array(40).keys()].filter((u) => p.solid(L_CORE, u, 25));
    expect(studColumns).toEqual([8, 16, 24, 32]);
    expect(count(p.layers[L_CORE])).toBe(4 * 50);
    expect(p.layers[L_STEEL]).toBeNull();
    expect(p.movementRects()).toEqual([{ u0: 0, v0: 0, u1: 2, v1: 2.5 }]);
  });

  it("a bullet takes its cell; a bigger one takes the cells within its radius; the knife a 25 cm disc, studs untouched", () => {
    const p = panel("soft_wall", 2, 2.5, 0.2);
    const medium = p.apply(disc(L_FRONT, 4, 10, d.bullets.tiers.medium!.holeDiameterM));
    expect(medium.removed[L_FRONT]).toEqual([10 * 40 + 4]);
    // A Low tier hole near a cell's corner still takes the cell it hit.
    const low = p.apply({ kind: "cut", layer: L_FRONT, shape: { kind: "disc", u4: 4 * 20 + 3, v4: 4 * 10 + 3, r4: Math.round((4 * d.bullets.tiers.low!.holeDiameterM) / 2 / d.cellM) }, hard: false });
    expect(low.removed[L_FRONT]).toEqual([10 * 40 + 20]);
    expect(p.apply(disc(L_FRONT, 4, 10, 0.05)).removed[L_FRONT]).toEqual([]); // already gone
    const knife = p.apply(disc(L_BACK, 12, 25, d.melee.holeDiameterM));
    expect(knife.removed[L_BACK].length).toBeGreaterThanOrEqual(20);
    expect(knife.removed[L_BACK].length).toBeLessThanOrEqual(25);
    expect(count(p.layers[L_CORE])).toBe(200);
  });

  it("a breach-sized cut through skins and studs opens a hole a body walks through; the frame and the rest stand", () => {
    const p = panel("soft_wall", 2, 2.5, 0.2);
    // 1.0 × 1.8 m from the floor, centred.
    let opened = false;
    for (const layer of [L_FRONT, L_CORE, L_BACK]) opened = p.apply(rect(layer, 10, 0, 30, 36)).movementChanged || opened;
    expect(opened).toBe(true);
    expect(covered(p, 1, 0.5)).toBe(false);
    expect(covered(p, 1, 1.75)).toBe(false);
    expect(covered(p, 0.2, 0.5)).toBe(true);
    expect(covered(p, 1, 2.2)).toBe(true); // above the hole the wall still stands
    // Skins only (a bullet-tier rule): the studs still block a body.
    const q = panel("soft_wall", 2, 2.5, 0.2);
    for (const layer of [L_FRONT, L_BACK]) q.apply(rect(layer, 10, 0, 30, 36));
    expect(covered(q, 0.8 + 0.025, 0.5)).toBe(true);
  });

  it("whatever nothing holds falls: a skin piece cut free of the frame and the studs, a stud cut at both ends", () => {
    const p = panel("soft_wall", 2, 2.5, 0.2);
    // A ring around cells u 2..5, v 10..13 (left of the first stud): the inside falls with it.
    const ring: PanelOp[] = [rect(L_FRONT, 1, 9, 7, 10), rect(L_FRONT, 1, 14, 7, 15), rect(L_FRONT, 1, 9, 2, 15), rect(L_FRONT, 6, 9, 7, 15)];
    const removed = ring.flatMap((op) => p.apply(op).removed[L_FRONT]);
    for (let v = 10; v < 14; v++) for (let u = 2; u < 6; u++) expect(p.solid(L_FRONT, u, v)).toBe(false);
    expect(removed.length).toBe(6 * 6);
    // The first stud (column 8), cut near the top and near the bottom: its middle falls.
    p.apply({ ...rect(L_CORE, 8, 3, 9, 4) });
    expect(p.solid(L_CORE, 8, 20)).toBe(true); // still hanging from the top
    const fell = p.apply(rect(L_CORE, 8, 45, 9, 46));
    expect(fell.removed[L_CORE].length).toBe(1 + (45 - 4));
    expect(p.solid(L_CORE, 8, 20)).toBe(false);
    expect(p.solid(L_CORE, 8, 1)).toBe(true);
  });
});

describe("reinforcement", () => {
  it("covers one section up to the steel height; bullets and soft cuts do nothing to it; a destroyed one can't come back", () => {
    const p = panel("reinforceable_wall", 3, 3, 0.2, { sections: 2 });
    const added = p.apply({ kind: "reinforce", section: 0 }).added[L_STEEL];
    const rows = Math.round(d.reinforcement.steelHeightM / d.cellM);
    expect(added.length).toBe(30 * rows);
    expect([p.solid(L_STEEL, 29, 0), p.solid(L_STEEL, 30, 0), p.solid(L_STEEL, 0, rows - 1), p.solid(L_STEEL, 0, rows)]).toEqual([true, false, true, false]);
    expect(p.apply(rect(L_STEEL, 0, 0, 30, rows)).removed[L_STEEL]).toEqual([]); // not a hard cut
    // One full line through it: both halves still hang from an anchor.
    p.apply(rect(L_STEEL, 0, 20, 30, 21, true));
    expect(p.solid(L_STEEL, 10, 10)).toBe(true);
    expect(p.solid(L_STEEL, 10, 30)).toBe(true);
    // A second full line, at the top: the part between the lines falls; the part on the floor stays.
    const fell = p.apply(rect(L_STEEL, 0, rows - 1, 30, rows, true)).removed[L_STEEL];
    expect(fell.length).toBe(30 + 30 * (rows - 1 - 21));
    expect(p.solid(L_STEEL, 10, 30)).toBe(false);
    expect(p.solid(L_STEEL, 10, 10)).toBe(true);
    // Cut the rest away: section 0 is no longer reinforced, and can't be again.
    p.apply(rect(L_STEEL, 0, 0, 30, 20, true));
    expect(p.reinforced & 1).toBe(0);
    expect(p.apply({ kind: "reinforce", section: 0 }).added[L_STEEL]).toEqual([]);
    expect(p.apply({ kind: "reinforce", section: 1 }).added[L_STEEL].length).toBe(30 * rows);
  });

  it("a damaged wall can be reinforced: the steel closes the hole to bodies", () => {
    const p = panel("reinforceable_wall", 2, 2.5, 0.2, { sections: 1 });
    for (const layer of [L_FRONT, L_CORE, L_BACK]) p.apply(rect(layer, 10, 0, 30, 36));
    expect(covered(p, 1, 0.5)).toBe(false);
    expect(p.apply({ kind: "reinforce", section: 0 }).movementChanged).toBe(true);
    expect(covered(p, 1, 0.5)).toBe(true);
  });
});

describe("breakable panels", () => {
  it("a hatch breaks when worn down and opens for bodies; a broken one can't be reinforced", () => {
    const p = panel("hatch", 1, 1, 0.1);
    expect(covered(p, 0.5, 0.5)).toBe(true);
    p.apply({ kind: "damage", amount: 60, hard: false });
    expect(p.broken).toBe(false);
    const broke = p.apply({ kind: "damage", amount: 40, hard: false });
    expect([broke.broke, broke.movementChanged, p.broken]).toEqual([true, true, true]);
    expect(p.movementRects()).toEqual([]);
    expect(p.apply({ kind: "reinforce", section: 0 }).added[L_STEEL]).toEqual([]);
  });

  it("a reinforced hatch takes only hard damage, to its 1,000,000 pool", () => {
    const p = panel("hatch", 1, 1, 0.1, { reinforced: true });
    expect([p.reinforced, p.steelHp]).toEqual([1, 1_000_000]);
    p.apply({ kind: "damage", amount: 5000, hard: false });
    expect([p.broken, p.hp, p.steelHp]).toEqual([false, d.constructions.hatch.kind === "hatch" ? d.constructions.hatch.hp : 0, 1_000_000]);
    expect(p.apply({ kind: "damage", amount: 1_000_000, hard: true }).broke).toBe(true);
  });

  it("a barricade breaks after three knife hits; one goes up again in the frame; prying one off leaves it open", () => {
    const p = panel("barricade_door", 1, 2.1, 0.05);
    expect(p.gapRows).toBe(3);
    expect(covered(p, 0.5, 0.05)).toBe(false); // the drone gap
    expect(covered(p, 0.5, 1)).toBe(true);
    for (let i = 0; i < 2; i++) p.apply({ kind: "damage", amount: d.melee.barricadeDamage, hard: false });
    expect(p.broken).toBe(false);
    expect(p.apply({ kind: "damage", amount: d.melee.barricadeDamage, hard: false }).broke).toBe(true);
    expect(covered(p, 0.5, 1)).toBe(false);
    const up = p.apply({ kind: "barricade", up: true });
    expect([p.broken, p.empty, p.hp, up.added[L_FRONT].length > 0, covered(p, 0.5, 1)]).toEqual([false, false, d.barricade.hp, true, true]);
    expect(p.apply({ kind: "barricade", up: true }).added[L_FRONT]).toEqual([]); // already up
    expect(p.apply({ kind: "barricade", up: false }).broke).toBe(true);
    expect([p.empty, covered(p, 0.5, 1)]).toEqual([true, false]);
    // An empty frame from the start.
    expect(covered(panel("barricade_window", 1, 1, 0.05, { empty: true }), 0.5, 0.5)).toBe(false);
  });

  it("glass breaks at the first hit", () => {
    const p = panel("glass", 1, 1, 0.02);
    expect(p.apply({ kind: "damage", amount: 0.01, hard: false }).broke).toBe(true);
  });
});

describe("floors", () => {
  it("metal joists survive anything, and a floor never opens for bodies", () => {
    const p = panel("soft_floor", 3, 3, 0.25);
    const joists = count(p.layers[L_CORE]);
    expect(joists).toBeGreaterThan(0);
    for (const layer of [L_FRONT, L_CORE, L_BACK]) expect(p.apply(rect(layer, 0, 0, 60, 60)).movementChanged).toBe(false);
    expect(count(p.layers[L_CORE])).toBe(joists);
    expect(count(p.layers[L_FRONT])).toBe(0);
    expect(p.movementRects()).toEqual([{ u0: 0, v0: 0, u1: 3, v1: 3 }]);
  });
});

describe("state", () => {
  it("round-trips exactly, and two panels given the same ops hash the same", () => {
    const ops: PanelOp[] = [];
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) >>> 0) % n);
    for (let i = 0; i < 80; i++) {
      const layer = [L_FRONT, L_CORE, L_BACK, L_STEEL][rnd(4)];
      if (i === 10) ops.push({ kind: "reinforce", section: 1 });
      ops.push(rnd(3) ? { kind: "cut", layer, shape: { kind: "disc", u4: rnd(160), v4: rnd(200), r4: rnd(12) }, hard: rnd(2) === 0 } : rect(layer, rnd(40), rnd(50), rnd(40) + 1, rnd(50) + 1, rnd(2) === 0));
    }
    const a = panel("reinforceable_wall", 2, 2.5, 0.2);
    const b = panel("reinforceable_wall", 2, 2.5, 0.2);
    const hashes = new Set<number>([a.hash()]);
    for (const op of ops) {
      a.apply(op);
      b.apply(op);
      hashes.add(a.hash());
    }
    expect(a.hash()).toBe(b.hash());
    expect(hashes.size).toBeGreaterThan(20);
    const w = new ByteWriter(4096);
    a.encodeState(w);
    const bytes = w.finish();
    expect(bytes.length).toBeLessThan(2000);
    const c = panel("reinforceable_wall", 2, 2.5, 0.2);
    c.decodeState(new ByteReader(bytes));
    expect(c.hash()).toBe(a.hash());
    expect([...c.layers.map((l) => (l ? [...l] : null))]).toEqual([...a.layers.map((l) => (l ? [...l] : null))]);
    expect(c.movementRects()).toEqual(a.movementRects());
  });

  it("greedy rectangles cover exactly the set cells, without overlap", () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) % 100) / 100;
    for (let t = 0; t < 20; t++) {
      const [w, h] = [5 + (t % 7) * 3, 4 + (t % 5) * 4];
      const mask = Uint8Array.from({ length: w * h }, () => (rnd() < 0.6 ? 1 : 0));
      const hit = new Uint8Array(w * h);
      for (const r of greedyRects(mask, w, h)) for (let v = r.v0; v < r.v1; v++) for (let u = r.u0; u < r.u1; u++) hit[v * w + u]++;
      expect([...hit]).toEqual([...mask]);
    }
    expect(MOVE_CELLS).toBe(2);
  });
});
