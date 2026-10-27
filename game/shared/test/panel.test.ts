// The panel model (Phase 4 M2, destruction/panel.ts): holes in whole cells, what falls once nothing holds
// it, steel's anchors, breakable panels, the movement mask, and a state that round-trips exactly.
import { describe, expect, it } from "vitest";
import { ByteReader, ByteWriter, greedyRects, L_BACK, L_CORE, L_FRONT, L_STEEL, loadGameData, MOVE_CELLS, Panel, reachable, type PanelChange, type PanelOp, type PanelSpec } from "../src/index.js";

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
    reinforcedSide: 0,
    empty: false,
    hp,
    reinforcedHatchHp: d.reinforcement.reinforcedHatchHp,
    canReReinforce: d.reinforcement.canReReinforce,
    passableBelowHp: d.barricade.passableBelowHp,
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
    const added = p.apply({ kind: "reinforce", section: 0, side: 0 }).added[L_STEEL];
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
    expect(p.apply({ kind: "reinforce", section: 0, side: 0 }).added[L_STEEL]).toEqual([]);
    expect(p.apply({ kind: "reinforce", section: 1, side: 0 }).added[L_STEEL].length).toBe(30 * rows);
    // Unless the data said it could (reinforcement.canReReinforce: false in Siege): then only while steel is left.
    const q = panel("reinforceable_wall", 3, 3, 0.2, { sections: 2, canReReinforce: true });
    q.apply({ kind: "reinforce", section: 0, side: 0 });
    expect(q.apply({ kind: "reinforce", section: 0, side: 1 }).added[L_STEEL]).toEqual([]);
    q.apply(rect(L_STEEL, 0, 0, 30, rows, true));
    expect(q.apply({ kind: "reinforce", section: 0, side: 1 }).added[L_STEEL].length).toBe(30 * rows);
  });

  it("a section with no column of its own (a panel fewer cells across than it has sections) takes no steel", () => {
    const p = panel("reinforceable_wall", 0.05, 2.5, 0.2, { sections: 2 });
    expect(p.sectionRange(0)).toEqual([0, 0]);
    expect(p.apply({ kind: "reinforce", section: 0, side: 0 }).added[L_STEEL]).toEqual([]);
    expect([p.reinforced, p.everReinforced]).toEqual([0, 0]);
    expect(p.apply({ kind: "reinforce", section: 1, side: 0 }).added[L_STEEL].length).toBeGreaterThan(0);
    expect(p.reinforced).toBe(2);
  });

  it("a damaged wall can be reinforced: the steel closes the hole to bodies", () => {
    const p = panel("reinforceable_wall", 2, 2.5, 0.2, { sections: 1 });
    for (const layer of [L_FRONT, L_CORE, L_BACK]) p.apply(rect(layer, 10, 0, 30, 36));
    expect(covered(p, 1, 0.5)).toBe(false);
    expect(p.apply({ kind: "reinforce", section: 0, side: 0 }).movementChanged).toBe(true);
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
    expect(p.apply({ kind: "reinforce", section: 0, side: 0 }).added[L_STEEL]).toEqual([]);
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

  it("each tier's bullets break a barricade in the hits its numbers say (20 for a rifle's: 3 hp at 0.15)", () => {
    for (const [tier, rule] of Object.entries(d.bullets.tiers)) {
      if (!rule?.barricadeDamage) continue;
      const p = panel("barricade_door", 1, 2.1, 0.05);
      let hits = 0;
      while (!p.broken && hits < 1000) p.apply({ kind: "damage", amount: rule.barricadeDamage, hard: false }), hits++;
      expect(hits, tier).toBe(Math.ceil(d.barricade.hp / rule.barricadeDamage - 1e-9));
    }
    expect(Math.ceil(d.barricade.hp / d.bullets.tiers.medium!.barricadeDamage - 1e-9)).toBe(20);
  });

  it("a barricade worn below barricade.passableBelowHp lets bodies through (the data's 0: only once broken)", () => {
    const p = panel("barricade_door", 1, 2.1, 0.05, { passableBelowHp: 2 });
    p.apply({ kind: "damage", amount: 1, hard: false });
    expect([p.hp, covered(p, 0.5, 1)]).toEqual([2, true]);
    p.apply({ kind: "damage", amount: 0.5, hard: false });
    expect([p.broken, covered(p, 0.5, 1)]).toEqual([false, false]);
    expect(d.barricade.passableBelowHp).toBe(0);
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

describe("sections and sides", () => {
  it("an intact wall is one movement box the exact size of the panel", () => {
    expect(panel("soft_wall", 2.3, 2.45, 0.2).movementRects()).toEqual([{ u0: 0, v0: 0, u1: 2.3, v1: 2.45 }]);
  });

  it("columns map to the sections sectionRange gives, and steel remembers the side it went up from", () => {
    const p = panel("reinforceable_wall", 2.05, 2.5, 0.2, { sections: 3 });
    for (let u = 0; u < p.w; u++) {
      const s = p.sectionOf(u);
      const [u0, u1] = p.sectionRange(s);
      expect(u >= u0 && u < u1, `column ${u}`).toBe(true);
    }
    p.apply({ kind: "reinforce", section: 2, side: 1 });
    p.apply({ kind: "reinforce", section: 0, side: 0 });
    expect(p.steelSides).toBe(0b100);
    const w = new ByteWriter(4096);
    p.encodeState(w);
    const q = panel("reinforceable_wall", 2.05, 2.5, 0.2, { sections: 3 });
    q.decodeState(new ByteReader(w.finish()));
    expect([q.steelSides, q.reinforced, q.hash()]).toEqual([0b100, 0b101, p.hash()]);
    const hatch = panel("hatch", 1, 1, 0.1, { reinforced: true, reinforcedSide: 1 });
    expect([hatch.steelSides, hatch.reinforced, hatch.version]).toEqual([1, 1, 0]);
  });
});

describe("state", () => {
  it("round-trips exactly, and two panels given the same ops hash the same", () => {
    const ops: PanelOp[] = [];
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) >>> 0) % n);
    for (let i = 0; i < 80; i++) {
      const layer = [L_FRONT, L_CORE, L_BACK, L_STEEL][rnd(4)];
      if (i === 10) ops.push({ kind: "reinforce", section: 1, side: 0 });
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

describe("settling after a cut", () => {
  /**
   * How the panel settled before M6 (Phase 4): a flood over every cell of each layer from what holds it, and
   * the whole move mask after every op. It now searches only from the cells an op took; the two must agree.
   * Returns how many cells fell.
   */
  function floodSettle(p: Panel, change: PanelChange): number {
    const { w, h } = p;
    const [flood, stack] = [new Uint8Array(w * h), new Int32Array(w * h)];
    let fell = 0;
    const drop = (l: Uint8Array, layer: number, keep: Uint8Array) => {
      for (let i = 0; i < l.length; i++) if (l[i] && !keep[i]) (l[i] = 0), change.removed[layer].push(i), fell++;
    };
    const core = p.layers[L_CORE];
    if (core && !p.coreMetal) drop(core, L_CORE, reachable(core, w, h, (_u, v) => v === 0 || v === h - 1, flood, stack));
    const sidesOnly = p.kind === "barricade";
    for (const layer of [L_FRONT, L_BACK]) {
      const l = p.layers[layer];
      if (!l) continue;
      const held = (u: number, v: number) => u === 0 || u === w - 1 || (!sidesOnly && (v === 0 || v === h - 1)) || (!!core && core[v * w + u] === 1);
      drop(l, layer, reachable(l, w, h, held, flood, stack));
    }
    const steel = p.layers[L_STEEL];
    if (steel && p.reinforced) {
      for (let s = 0; s < p.sectionCount; s++) {
        if (!(p.reinforced & (1 << s))) continue;
        const [u0, u1] = p.sectionRange(s);
        const sw = u1 - u0;
        const sub = new Uint8Array(sw * p.steelRows);
        for (let v = 0; v < p.steelRows; v++) for (let u = u0; u < u1; u++) sub[v * sw + u - u0] = steel[v * w + u];
        const keep = reachable(sub, sw, p.steelRows, (_u, v) => v === 0 || v === p.steelRows - 1, new Uint8Array(sub.length), new Int32Array(sub.length));
        let left = 0;
        for (let v = 0; v < p.steelRows; v++)
          for (let u = u0; u < u1; u++) {
            const i = v * w + u;
            if (steel[i] && !keep[v * sw + u - u0]) (steel[i] = 0), change.removed[L_STEEL].push(i), fell++;
            else if (steel[i]) left++;
          }
        if (left === 0) p.reinforced &= ~(1 << s);
      }
    }
    return fell;
  }

  /** mulberry32: a seeded stream in [0, 1). */
  const stream = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** Bullet holes of every tier and the knife's, lines and rings that cut pieces free, breaches, steel, damage, barricades. */
  function* randomOps(p: Panel, rnd: () => number, count: number): Generator<PanelOp> {
    const int = (n: number) => Math.floor(rnd() * n);
    const pick = <T>(xs: readonly T[]) => xs[int(xs.length)]!;
    const layers = [L_FRONT, L_CORE, L_BACK, L_STEEL].filter((l) => p.layers[l]);
    const r4 = (diameterM: number) => Math.round((4 * diameterM) / 2 / d.cellM);
    const radii = [...Object.values(d.bullets.tiers).map((t) => r4(t!.holeDiameterM)), r4(d.melee.holeDiameterM)];
    const cut = (layer: number, u0: number, v0: number, u1: number, v1: number, hard: boolean): PanelOp => ({ kind: "cut", layer, shape: { kind: "rect", u0, v0, u1, v1 }, hard });
    for (let k = 0; k < count; k++) {
      const layer = pick(layers);
      const hard = rnd() < 0.4;
      const r = rnd();
      if (r < 0.4) yield { kind: "cut", layer, shape: { kind: "disc", u4: int(4 * p.w), v4: int(4 * p.h), r4: pick(radii) }, hard };
      else if (r < 0.55) {
        // A line across or up the panel, whole or in part.
        const across = rnd() < 0.5;
        const [n, m] = across ? [p.w, p.h] : [p.h, p.w];
        const a0 = rnd() < 0.5 ? 0 : int(n);
        const a1 = rnd() < 0.5 ? n : a0 + 1 + int(n - a0);
        const b = int(m);
        yield across ? cut(layer, a0, b, a1, b + 1, hard) : cut(layer, b, a0, b + 1, a1, hard);
      } else if (r < 0.7) {
        // A ring, its edges 1 cell wide (some past the panel's edge): its inside falls unless a beam or the frame holds it.
        const [u0, v0] = [int(p.w + 4) - 2, int(p.h + 4) - 2];
        const [u1, v1] = [u0 + 3 + int(10), v0 + 3 + int(10)];
        for (const [a, b, c, e] of [[u0, v0, u1, v0 + 1], [u0, v1 - 1, u1, v1], [u0, v0, u0 + 1, v1], [u1 - 1, v0, u1, v1]]) yield cut(layer, a!, b!, c!, e!, hard);
      } else if (r < 0.8) {
        const [u0, v0] = [int(p.w) - 4, int(p.h) - 4];
        yield cut(layer, u0, v0, u0 + 1 + int(30), v0 + 1 + int(40), hard);
      } else if (r < 0.85) {
        // A breach: every layer, steel too if hard.
        const [u0, v0] = [int(p.w) - 10, int(p.h) - 10];
        for (const l of layers) yield cut(l, u0, v0, u0 + 20, v0 + 36, hard);
      } else if (r < 0.9) yield { kind: "reinforce", section: int(p.sectionCount + 1), side: int(2) };
      else if (r < 0.95) yield { kind: "damage", amount: pick([0.15, 1, 3, 40]), hard };
      else yield { kind: "barricade", up: rnd() < 0.7 };
    }
  }

  it("drops what a flood over the whole panel drops and moves the same cells, op by op, for every construction", () => {
    const cases: [string, number, number, number, Partial<PanelSpec>, PanelOp[]?][] = [
      ["soft_wall", 3.45, 2.95, 0.2, {}],
      ["reinforceable_wall", 3, 3, 0.2, { sections: 3 }],
      ["reinforceable_wall", 2.05, 2.5, 0.2, { sections: 2, reinforced: true, reinforcedSide: 1 }],
      // One cell across, two sections: section 0 has no column (the data refuses it; the panel must still agree).
      // First its steel, then a cut that settles the skin: the flood clears a section left without steel.
      ["reinforceable_wall", 0.05, 2.5, 0.2, { sections: 2 }, [
        { kind: "reinforce", section: 0, side: 0 },
        { kind: "cut", layer: L_FRONT, shape: { kind: "disc", u4: 2, v4: 100, r4: 2 }, hard: false },
      ]],
      ["soft_wall_no_studs", 2, 2.5, 0.15, {}],
      ["semi_wall", 2, 2.5, 0.2, {}],
      ["soft_floor", 4, 3.35, 0.25, {}],
      ["hatch", 1, 1, 0.1, {}],
      ["hatch", 1, 1, 0.1, { reinforced: true }],
      ["barricade_door", 1, 2.1, 0.05, {}],
      ["barricade_window", 1.2, 1.2, 0.05, { empty: true }],
      ["glass", 1, 1, 0.02, {}],
    ];
    const fellPer: Record<string, { fell: number; cells: number }> = {};
    cases.forEach(([id, wM, hM, tM, extra, script = []], n) => {
      let a = panel(id, wM, hM, tM, extra);
      const ref = panel(id, wM, hM, tM, extra);
      let fell = 0;
      const internals = ref as unknown as { computeMoveMask(): Uint8Array };
      Object.assign(ref as unknown as Record<string, unknown>, {
        settle: (change: PanelChange) => void (fell += floodSettle(ref, change)),
        moveMaskAfter: () => internals.computeMoveMask(),
      });
      const rnd = stream(1000 + n);
      let k = 0;
      for (const op of [...script, ...randomOps(a, rnd, 300)]) {
        if (k === 100) {
          // A joining player's copy carries on from the state it was sent.
          const out = new ByteWriter(8192);
          a.encodeState(out);
          a = panel(id, wM, hM, tM, extra);
          a.decodeState(new ByteReader(out.finish()));
        }
        // Past the stamps' limit: the marks start again.
        if (k === 200) (a as unknown as { stamp: number }).stamp = 0x3fffffff - 1;
        const [got, want] = [a.apply(op), ref.apply(op)];
        expect(got, `${id} #${n}, op ${k}: ${JSON.stringify(op)}`).toEqual(want);
        expect(a.hash(), `${id} #${n}, op ${k}`).toBe(ref.hash());
        expect(a.movementRects(), `${id} #${n}, op ${k}`).toEqual(ref.movementRects());
        k++;
      }
      fellPer[`${id} #${n}`] = { fell, cells: ref.w * ref.h };
    });
    // The ops cut pieces free on every wall and floor (each ring's inside, beams cut twice, steel cut through).
    for (const [key, { fell, cells }] of Object.entries(fellPer)) if (!/hatch|barricade|glass/.test(key)) expect(fell, key).toBeGreaterThan(cells >= 1000 ? 50 : 0);
    expect(Object.values(fellPer).reduce((s, x) => s + x.fell, 0)).toBeGreaterThan(2000);
  });
});
