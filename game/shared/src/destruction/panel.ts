// A destructible surface as a grid of cells in layers (Phase 4 M2; PLAN §8.2, research/destruction.md
// §2, §6–§9, data/destruction.json). Every change is an op in whole cells (a disc around a hit point in
// quarter cells, or a rectangle), so the server and every client apply the same ops and end with the same
// bytes. Nothing here knows where the panel is in the world: net/ and sim code map world points to cells.
import type { Construction } from "../data/schemas.js";
import { ByteReader, ByteWriter, fnv1a, ProtocolError } from "../net/bytes.js";
import { greedyRects, reachable, type CellRect } from "./grid.js";

/** Layers through a panel: the skin facing −n, the core (studs, joists, beams), the skin facing +n, steel. */
export const L_FRONT = 0;
export const L_CORE = 1;
export const L_BACK = 2;
export const L_STEEL = 3;
export const LAYER_COUNT = 4;

/** What a panel is built as, in cells (panelSpec in level code fills it from the level and the data). */
export interface PanelSpec {
  /** Stable id on the wire: the panel's place in the level. */
  index: number;
  /** The level solid's id. */
  id: string;
  constructionId: string;
  construction: Construction;
  /** The face's width (u) and height (v; a floor's depth), and the thickness through it, in metres. */
  widthM: number;
  heightM: number;
  thicknessM: number;
  cellM: number;
  /** Reinforcement sections across the width (a hatch has one). */
  sections: number;
  /** Steel covers this much of a wall's height from the bottom (data: reinforcement.steelHeightM). */
  steelHeightM: number;
  reinforced: boolean;
  /** The side a starting reinforcement went up from: 0 the −n face, 1 the +n face (a hatch's top). */
  reinforcedSide: number;
  /** A barricade frame with no barricade in it yet. */
  empty: boolean;
  /** Hit points of a breakable panel (hatch, barricade, glass); 0 for the rest. */
  hp: number;
  /** A reinforced hatch's pool (data: reinforcement.reinforcedHatchHp). */
  reinforcedHatchHp: number;
  /** A section whose steel was all destroyed can be reinforced again (data: reinforcement.canReReinforce). */
  canReReinforce: boolean;
  /** A barricade worn below this many hit points no longer stops bodies (data: barricade.passableBelowHp). */
  passableBelowHp: number;
}

/** Worn down to this counts as nothing left: hit points are fractions (3 − 20 × 0.15 leaves 1e-15, not 0). */
const HP_EPSILON = 1e-9;

/** A disc around a hit point given in quarter cells (`r4`: radius in quarter cells), or a rectangle of cells. */
export type CutShape = { kind: "disc"; u4: number; v4: number; r4: number } | { kind: "rect"; u0: number; v0: number; u1: number; v1: number };

export type PanelOp =
  /** Remove cells of one layer. Steel only goes to a `hard` cut (thermal or hard breach); metal never does. */
  | { kind: "cut"; layer: number; shape: CutShape; hard: boolean }
  /** Wear a breakable panel down (a reinforced hatch only takes `hard` damage, to its pool). */
  | { kind: "damage"; amount: number; hard: boolean }
  /** Steel over one section, put up from `side` (0: the −n face, 1: the +n face). */
  | { kind: "reinforce"; section: number; side: number }
  /** Put a barricade up in its frame, or pry it off. */
  | { kind: "barricade"; up: boolean };

export interface PanelChange {
  /** Cells that went (cut, or fell once nothing held them), per layer: debris, and history for rewound shots. */
  removed: number[][];
  /** Cells that appeared (steel, a new barricade), per layer. */
  added: number[][];
  /** The cells a body collides with changed (rebuild the panel's colliders). */
  movementChanged: boolean;
  /** A breakable panel broke (or a barricade was pried off) this op. */
  broke: boolean;
}

/** Movement uses cells of MOVE_CELLS × MOVE_CELLS fine cells, solid if any of them is: bullet holes never open one. */
export const MOVE_CELLS = 2;

export class Panel {
  readonly spec: PanelSpec;
  /** Cells across (u) and up (v). */
  readonly w: number;
  readonly h: number;
  /** Cell size along u and v (the face is an exact whole number of cells). */
  readonly cellU: number;
  readonly cellV: number;
  /** 1 = material there, per layer; null where the panel has no such layer. */
  readonly layers: (Uint8Array | null)[];
  readonly coreMetal: boolean;
  /** Rows at the bottom of a door barricade left open (the drone gap). */
  readonly gapRows: number;
  /** Rows of steel from the bottom. */
  readonly steelRows: number;
  hp: number;
  steelHp = 0;
  broken = false;
  empty: boolean;
  /** Sections with steel now, and sections ever reinforced (a destroyed reinforcement can't come back, see reinforcedBefore). */
  reinforced = 0;
  everReinforced = 0;
  /** Per section: 1 if its steel went up from the +n side (research/destruction.md §6.1: a reinforcement has a side). */
  steelSides = 0;
  /** Changed since it was built: joining players are sent its state. */
  modified = false;
  /** Counts changes (renderers redraw a panel whose version moved); not part of the state. */
  version = 0;
  private moveMask: Uint8Array = new Uint8Array(0);
  private readonly flood: Uint8Array;
  private readonly stack: Int32Array;

  constructor(spec: PanelSpec) {
    this.spec = spec;
    const c = spec.construction;
    this.w = Math.max(1, Math.round(spec.widthM / spec.cellM));
    this.h = Math.max(1, Math.round(spec.heightM / spec.cellM));
    this.cellU = spec.widthM / this.w;
    this.cellV = spec.heightM / this.h;
    const n = this.w * this.h;
    const layered = c.kind === "wall" || c.kind === "floor" || c.kind === "hatch";
    const core = layered && c.core.kind !== "none" ? c.core : null;
    this.coreMetal = core?.material === "metal";
    this.layers = [new Uint8Array(n), core ? new Uint8Array(n) : null, layered ? new Uint8Array(n) : null, layered && c.reinforceable ? new Uint8Array(n) : null];
    this.gapRows = c.kind === "barricade" ? Math.min(this.h - 1, Math.round(c.bottomGapM / this.cellV)) : 0;
    this.steelRows = c.kind === "hatch" ? this.h : Math.min(this.h, Math.max(1, Math.round(spec.steelHeightM / this.cellV)));
    this.hp = spec.hp;
    this.empty = c.kind === "barricade" && spec.empty;
    this.flood = new Uint8Array(n);
    this.stack = new Int32Array(n);
    this.layers[L_FRONT]!.fill(1);
    this.layers[L_BACK]?.fill(1);
    if (c.kind === "barricade") this.fillPlanks(this.empty ? 0 : 1);
    if (core) {
      // Beams every spacingM across the width (none on the edges, which are the frame), widthM wide.
      const coreLayer = this.layers[L_CORE]!;
      for (let x = core.spacingM; x < spec.widthM - core.widthM / 2; x += core.spacingM) {
        const u0 = Math.max(0, Math.round((x - core.widthM / 2) / this.cellU));
        const u1 = Math.min(this.w, Math.max(u0 + 1, Math.round((x + core.widthM / 2) / this.cellU)));
        for (let v = 0; v < this.h; v++) coreLayer.fill(1, v * this.w + u0, v * this.w + u1);
      }
    }
    if (spec.reinforced) for (let s = 0; s < this.sectionCount; s++) this.apply({ kind: "reinforce", section: s, side: spec.reinforcedSide });
    this.modified = false;
    this.version = 0;
    this.moveMask = this.computeMoveMask();
  }

  get kind(): Construction["kind"] {
    return this.spec.construction.kind;
  }

  /** Reinforcement sections across the width: a hatch takes one reinforcement. */
  get sectionCount(): number {
    return this.kind === "hatch" ? 1 : this.spec.sections;
  }

  /** The u-range of reinforcement section `s`, in cells. */
  sectionRange(s: number): [number, number] {
    const n = this.sectionCount;
    return [Math.floor((s * this.w) / n), Math.floor(((s + 1) * this.w) / n)];
  }

  /** The section column `u` is in. */
  sectionOf(u: number): number {
    for (let s = 0; s < this.sectionCount - 1; s++) if (u < this.sectionRange(s)[1]) return s;
    return this.sectionCount - 1;
  }

  /**
   * Section `s` can't take steel: it has some now, or had some once (unless the data lets a destroyed
   * reinforcement come back: reinforcement.canReReinforce).
   */
  reinforcedBefore(s: number): boolean {
    return ((this.spec.canReReinforce ? this.reinforced : this.everReinforced) & (1 << s)) !== 0;
  }

  /** Section `s` has a hole in either skin (whether it can still take steel is reinforcement.canReinforceDamaged). */
  sectionDamaged(s: number): boolean {
    const [u0, u1] = this.sectionRange(s);
    for (const l of [this.layers[L_FRONT], this.layers[L_BACK]]) {
      if (!l) continue;
      for (let v = 0; v < this.h; v++) for (let u = u0, i = v * this.w + u0; u < u1; u++, i++) if (!l[i]) return true;
    }
    return false;
  }

  /** Is there material at cell (u, v) of `layer`? */
  solid(layer: number, u: number, v: number): boolean {
    const l = this.layers[layer];
    return !!l && u >= 0 && v >= 0 && u < this.w && v < this.h && l[v * this.w + u] === 1;
  }

  apply(op: PanelOp): PanelChange {
    const change: PanelChange = { removed: [[], [], [], []], added: [[], [], [], []], movementChanged: false, broke: false };
    const c = this.spec.construction;
    if (op.kind === "cut") {
      const l = this.layers[op.layer];
      if (!l || (op.layer === L_STEEL && !op.hard) || (op.layer === L_CORE && this.coreMetal)) return change;
      this.cutCells(l, op.shape, change.removed[op.layer]);
      if (change.removed[op.layer].length) this.settle(change);
    } else if (op.kind === "damage") {
      if (this.broken || this.empty || !(c.kind === "hatch" || c.kind === "barricade" || c.kind === "glass")) return change;
      if (this.reinforced) {
        if (!op.hard) return change;
        this.steelHp -= op.amount;
        if (this.steelHp <= HP_EPSILON) this.breakAll(change);
      } else {
        this.hp -= op.amount;
        if (this.hp <= HP_EPSILON || c.kind === "glass") this.breakAll(change);
      }
    } else if (op.kind === "reinforce") {
      const steel = this.layers[L_STEEL];
      const bit = 1 << op.section;
      if (!steel || op.section < 0 || op.section >= this.sectionCount || this.reinforcedBefore(op.section) || this.broken) return change;
      const [u0, u1] = this.sectionRange(op.section);
      for (let v = 0; v < this.steelRows; v++)
        for (let u = u0; u < u1; u++) {
          const i = v * this.w + u;
          if (!steel[i]) (steel[i] = 1), change.added[L_STEEL].push(i);
        }
      this.reinforced |= bit;
      this.everReinforced |= bit;
      this.steelSides = op.side ? this.steelSides | bit : this.steelSides & ~bit;
      if (this.kind === "hatch") this.steelHp = this.spec.reinforcedHatchHp;
    } else if (op.kind === "barricade") {
      // Up in an empty frame or over a broken one; off only while one stands there.
      if (c.kind !== "barricade" || op.up === (!this.empty && !this.broken)) return change;
      const l = this.layers[L_FRONT]!;
      const before = l.slice();
      this.empty = !op.up;
      this.broken = false;
      this.hp = op.up ? this.spec.hp : 0;
      this.fillPlanks(op.up ? 1 : 0);
      for (let i = 0; i < l.length; i++) if (l[i] !== before[i]) (l[i] ? change.added : change.removed)[L_FRONT].push(i);
      change.broke = !op.up;
    }
    const changed = change.broke || change.removed.some((r) => r.length) || change.added.some((a) => a.length) || op.kind === "damage";
    if (changed) {
      this.modified = true;
      this.version++;
    }
    const move = this.computeMoveMask();
    for (let i = 0; i < move.length; i++)
      if (move[i] !== this.moveMask[i]) {
        change.movementChanged = true;
        break;
      }
    this.moveMask = move;
    return change;
  }

  /**
   * Where a body collides with the panel: rectangles in metres on the face, [u0, u1) × [v0, v1) from the
   * panel's −u, −v corner. A floor with joists, an intact hatch or barricade, or glass is its whole face.
   * The far edges are the panel's exact size, so an intact panel collides exactly like the box it was.
   */
  movementRects(): { u0: number; v0: number; u1: number; v1: number }[] {
    const cw = Math.ceil(this.w / MOVE_CELLS);
    const ch = Math.ceil(this.h / MOVE_CELLS);
    const at = (cells: number, n: number, size: number, metres: number) => (cells >= n ? metres : cells * size);
    return greedyRects(this.moveMask, cw, ch).map((r: CellRect) => ({
      u0: at(r.u0 * MOVE_CELLS, this.w, this.cellU, this.spec.widthM),
      v0: at(r.v0 * MOVE_CELLS, this.h, this.cellV, this.spec.heightM),
      u1: at(r.u1 * MOVE_CELLS, this.w, this.cellU, this.spec.widthM),
      v1: at(r.v1 * MOVE_CELLS, this.h, this.cellV, this.spec.heightM),
    }));
  }

  /** fnv1a of everything that can change: two machines with the same ops agree on it. */
  hash(): number {
    const w = new ByteWriter(64 + this.w * this.h * LAYER_COUNT);
    this.encodeState(w);
    return fnv1a(w.finish());
  }

  /** Everything that can change, run-length coded (joining players, resyncs). */
  encodeState(out: ByteWriter): void {
    out.u8((this.broken ? 1 : 0) | (this.empty ? 2 : 0));
    out.u8(this.reinforced).u8(this.everReinforced).u8(this.steelSides);
    out.f64(this.hp).f64(this.steelHp);
    for (const l of this.layers) {
      if (!l) continue;
      // Runs of equal cells, starting with a run of 1s (possibly empty).
      let value = 1;
      let i = 0;
      const runs: number[] = [];
      while (i < l.length) {
        let j = i;
        while (j < l.length && l[j] === value) j++;
        runs.push(j - i);
        i = j;
        value ^= 1;
      }
      out.varu(runs.length);
      for (const r of runs) out.varu(r);
    }
  }

  /** The inverse of encodeState. Throws ProtocolError on runs that don't fit the panel. */
  decodeState(r: ByteReader): void {
    const flags = r.u8();
    this.broken = (flags & 1) !== 0;
    this.empty = (flags & 2) !== 0;
    this.reinforced = r.u8();
    this.everReinforced = r.u8();
    this.steelSides = r.u8();
    this.hp = r.f64();
    this.steelHp = r.f64();
    for (const l of this.layers) {
      if (!l) continue;
      const count = r.varu();
      if (count > l.length + 1) throw new ProtocolError("panel state: too many runs");
      let i = 0;
      let value = 1;
      for (let k = 0; k < count; k++) {
        const run = r.varu();
        if (i + run > l.length) throw new ProtocolError("panel state: runs overflow the panel");
        l.fill(value, i, i + run);
        i += run;
        value ^= 1;
      }
      if (i !== l.length) throw new ProtocolError("panel state: runs don't cover the panel");
    }
    this.modified = true;
    this.version++;
    this.moveMask = this.computeMoveMask();
  }

  // ---------------------------------------------------------------- internals

  private fillPlanks(value: number) {
    const l = this.layers[L_FRONT]!;
    l.fill(0);
    if (value) l.fill(1, this.gapRows * this.w);
  }

  private cutCells(l: Uint8Array, shape: CutShape, removed: number[]) {
    if (shape.kind === "rect") {
      const u0 = Math.max(0, shape.u0);
      const v0 = Math.max(0, shape.v0);
      const u1 = Math.min(this.w, shape.u1);
      const v1 = Math.min(this.h, shape.v1);
      for (let v = v0; v < v1; v++)
        for (let u = u0; u < u1; u++) {
          const i = v * this.w + u;
          if (l[i]) (l[i] = 0), removed.push(i);
        }
      return;
    }
    // The cell the point is in always goes; so does every cell whose centre is within r4 quarter cells.
    const hu = shape.u4 >> 2;
    const hv = shape.v4 >> 2;
    const reach = (shape.r4 >> 2) + 1;
    const r2 = shape.r4 * shape.r4;
    for (let v = Math.max(0, hv - reach); v <= Math.min(this.h - 1, hv + reach); v++)
      for (let u = Math.max(0, hu - reach); u <= Math.min(this.w - 1, hu + reach); u++) {
        const du = 4 * u + 2 - shape.u4;
        const dv = 4 * v + 2 - shape.v4;
        if (du * du + dv * dv > r2 && !(u === hu && v === hv)) continue;
        const i = v * this.w + u;
        if (l[i]) (l[i] = 0), removed.push(i);
      }
  }

  /**
   * Pieces nothing holds fall (research/destruction.md §2, micro-destruction): wooden beams hang from the
   * top and bottom rows; a skin from the frame around it (a barricade's planks from its sides) and from the
   * beams behind it; steel from its own top and bottom rows, one section at a time (a reinforcement isn't
   * held by its neighbours).
   */
  private settle(change: PanelChange) {
    const { w, h } = this;
    const drop = (l: Uint8Array, layer: number, keep: Uint8Array) => {
      for (let i = 0; i < l.length; i++) if (l[i] && !keep[i]) (l[i] = 0), change.removed[layer].push(i);
    };
    const core = this.layers[L_CORE];
    if (core && !this.coreMetal) drop(core, L_CORE, reachable(core, w, h, (_u, v) => v === 0 || v === h - 1, this.flood, this.stack));
    const sidesOnly = this.kind === "barricade";
    for (const layer of [L_FRONT, L_BACK]) {
      const l = this.layers[layer];
      if (!l) continue;
      const held = (u: number, v: number) => u === 0 || u === w - 1 || (!sidesOnly && (v === 0 || v === h - 1)) || (!!core && core[v * w + u] === 1);
      drop(l, layer, reachable(l, w, h, held, this.flood, this.stack));
    }
    const steel = this.layers[L_STEEL];
    if (steel && this.reinforced) {
      for (let s = 0; s < this.sectionCount; s++) {
        if (!(this.reinforced & (1 << s))) continue;
        const [u0, u1] = this.sectionRange(s);
        const sw = u1 - u0;
        const sub = new Uint8Array(sw * this.steelRows);
        for (let v = 0; v < this.steelRows; v++) for (let u = u0; u < u1; u++) sub[v * sw + u - u0] = steel[v * w + u];
        const keep = reachable(sub, sw, this.steelRows, (_u, v) => v === 0 || v === this.steelRows - 1, new Uint8Array(sub.length), new Int32Array(sub.length));
        let left = 0;
        for (let v = 0; v < this.steelRows; v++)
          for (let u = u0; u < u1; u++) {
            const i = v * w + u;
            if (steel[i] && !keep[v * sw + u - u0]) (steel[i] = 0), change.removed[L_STEEL].push(i);
            else if (steel[i]) left++;
          }
        if (left === 0) this.reinforced &= ~(1 << s);
      }
    }
  }

  private breakAll(change: PanelChange) {
    this.broken = true;
    this.reinforced = 0;
    this.layers.forEach((l, layer) => {
      if (!l) return;
      for (let i = 0; i < l.length; i++) if (l[i]) (l[i] = 0), change.removed[layer].push(i);
    });
    change.broke = true;
  }

  /** Coarse cells a body collides with (1). */
  private computeMoveMask(): Uint8Array {
    const cw = Math.ceil(this.w / MOVE_CELLS);
    const ch = Math.ceil(this.h / MOVE_CELLS);
    const m = new Uint8Array(cw * ch);
    const p = this.spec.construction.passable;
    if (p === "never" && !this.broken) return m.fill(1);
    if (p === "whenBroken") {
      if (this.broken || this.empty || (this.kind === "barricade" && this.hp < this.spec.passableBelowHp)) return m;
      // The whole face, less a door barricade's gap at the bottom.
      for (let cv = 0; cv < ch; cv++) if ((cv + 1) * MOVE_CELLS > this.gapRows) m.fill(1, cv * cw, cv * cw + cw);
      return m;
    }
    for (let cv = 0; cv < ch; cv++)
      for (let cu = 0; cu < cw; cu++) {
        let solid = 0;
        for (let v = cv * MOVE_CELLS; v < Math.min(this.h, (cv + 1) * MOVE_CELLS) && !solid; v++)
          for (let u = cu * MOVE_CELLS; u < Math.min(this.w, (cu + 1) * MOVE_CELLS) && !solid; u++)
            for (const l of this.layers) if (l && l[v * this.w + u]) solid = 1;
        m[cv * cw + cu] = solid;
      }
    return m;
  }
}
