// The level's panels in the physics world (Phase 4 M3): each panel's movement boxes (rebuilt whenever an
// op changes what a body collides with) and rays through every panel's cells, for bullets and sight.
// Server and clients apply the same ops in the same order, so their boxes match and prediction holds.
import type { Vec3 } from "../core/math.js";
import type { SolidInfo } from "../level/builder.js";
import { ByteWriter, fnv1a } from "../net/bytes.js";
import { PANEL_GROUPS, refreshBroadPhase, type Collider, type Rapier, type World } from "../physics/rapier.js";
import { Panel, type PanelChange, type PanelOp, type PanelSpec } from "./panel.js";
import { panelCrossings, type LayerCrossing, type PanelFrame } from "./world.js";

export interface PanelEntry {
  /** Replaced by a fresh one when a client is told to start this panel over (PanelSet.reset). */
  panel: Panel;
  readonly frame: PanelFrame;
  readonly info: SolidInfo;
  colliders: Collider[];
  /** The box's world bounds (a quick reject for rays). */
  readonly min: Vec3;
  readonly max: Vec3;
  /** The panel's hash as of a version (hashing a whole panel on every op would be slow). */
  hashed: { panel: Panel; version: number; value: number } | null;
}

/** An op for one panel (by its index in the level). */
export interface IndexedOp {
  panel: number;
  op: PanelOp;
}

export interface PanelHit {
  entry: PanelEntry;
  crossing: LayerCrossing;
}

export class PanelSet {
  /** In level order: a panel's place here is its index on the wire. */
  readonly list: PanelEntry[] = [];
  readonly byId = new Map<string, PanelEntry>();

  constructor(
    private readonly R: Rapier,
    private readonly world: World,
    /** The level's collider → solid map: panel boxes are in it too (vaulting reads it). */
    private readonly solids: Map<number, SolidInfo>,
  ) {}

  /** Add a panel and its movement boxes (the caller refreshes the broad phase once the level is built). */
  add(spec: PanelSpec, frame: PanelFrame, info: SolidInfo): PanelEntry {
    if (spec.index !== this.list.length) throw new Error(`panel "${spec.id}" has index ${spec.index}, expected ${this.list.length}`);
    const ext = [0, 1, 2].map((k) => (Math.abs(frame.u[k]) * frame.w + Math.abs(frame.v[k]) * frame.h + Math.abs(frame.n[k]) * frame.t) / 2);
    const entry: PanelEntry = {
      panel: new Panel(spec),
      frame,
      info,
      colliders: [],
      min: [0, 1, 2].map((k) => frame.center[k] - ext[k]) as Vec3,
      max: [0, 1, 2].map((k) => frame.center[k] + ext[k]) as Vec3,
      hashed: null,
    };
    this.list.push(entry);
    this.byId.set(spec.id, entry);
    this.buildColliders(entry);
    return entry;
  }

  /** Apply an op to panel `index`; its boxes follow at once if what bodies collide with changed. */
  apply(index: number, op: PanelOp): PanelChange {
    const e = this.list[index];
    const change = e.panel.apply(op);
    if (change.movementChanged) this.rebuild(e);
    return change;
  }

  /** Panel `index` as the level built it, boxes and all (a client told to start it over). */
  reset(index: number): PanelEntry {
    const e = this.list[index];
    e.panel = new Panel(e.panel.spec);
    this.rebuild(e);
    return e;
  }

  /** After a panel's cells were replaced wholesale (a joining player's state): rebuild its boxes. */
  rebuild(e: PanelEntry): void {
    for (const c of e.colliders) {
      this.solids.delete(c.handle);
      this.world.removeCollider(c, false);
    }
    e.colliders = [];
    this.buildColliders(e);
    refreshBroadPhase(this.world);
  }

  /** Every layer crossing of every panel along the ray within maxT, nearest first. */
  crossings(origin: Vec3, dir: Vec3, maxT: number): PanelHit[] {
    const out: PanelHit[] = [];
    for (const entry of this.list) {
      if (!rayHitsBox(origin, dir, maxT, entry.min, entry.max)) continue;
      for (const crossing of panelCrossings(entry.panel, entry.frame, origin, dir, maxT)) out.push({ entry, crossing });
    }
    return out.sort((a, b) => a.crossing.t - b.crossing.t || a.entry.panel.spec.index - b.entry.panel.spec.index);
  }

  /** The nearest cell with material along the ray within maxT (measured to where the ray enters it), or null. */
  firstSolid(origin: Vec3, dir: Vec3, maxT: number): PanelHit | null {
    let best: PanelHit | null = null;
    for (const entry of this.list) {
      if (!rayHitsBox(origin, dir, best ? best.crossing.face : maxT, entry.min, entry.max)) continue;
      for (const crossing of panelCrossings(entry.panel, entry.frame, origin, dir, maxT)) {
        if (!crossing.solid) continue;
        if (!best || crossing.face < best.crossing.face) best = { entry, crossing };
        break;
      }
    }
    return best;
  }

  /** fnv1a over every changed panel's state: two machines that applied the same ops agree on it. */
  hash(): number {
    const w = new ByteWriter(16 + 8 * this.list.length);
    for (const e of this.list) {
      if (!e.panel.modified) continue;
      if (!e.hashed || e.hashed.panel !== e.panel || e.hashed.version !== e.panel.version) e.hashed = { panel: e.panel, version: e.panel.version, value: e.panel.hash() };
      w.varu(e.panel.spec.index).u32(e.hashed.value);
    }
    return fnv1a(w.finish());
  }

  private buildColliders(e: PanelEntry) {
    const { frame, panel } = e;
    const q = frame.quat;
    for (const r of panel.movementRects()) {
      // Rectangle centre on the face, from the panel's centre; the box spans the whole thickness.
      const cu = (r.u0 + r.u1) / 2 - frame.w / 2;
      const cv = (r.v0 + r.v1) / 2 - frame.h / 2;
      const he = [0, 0, 0];
      he[frame.axes[0]] = (r.u1 - r.u0) / 2;
      he[frame.axes[1]] = (r.v1 - r.v0) / 2;
      he[frame.axes[2]] = frame.t / 2;
      const at = [0, 1, 2].map((k) => frame.center[k] + frame.u[k] * cu + frame.v[k] * cv);
      const desc = this.R.ColliderDesc.cuboid(he[0], he[1], he[2])
        .setTranslation(at[0], at[1], at[2])
        .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] })
        .setCollisionGroups(PANEL_GROUPS);
      const c = this.world.createCollider(desc);
      this.solids.set(c.handle, e.info);
      e.colliders.push(c);
    }
  }
}

/** Does the ray reach the box [min, max] within maxT? */
function rayHitsBox(o: Vec3, d: Vec3, maxT: number, min: Vec3, max: Vec3): boolean {
  let t0 = 0;
  let t1 = maxT;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < min[k] || o[k] > max[k]) return false;
      continue;
    }
    let a = (min[k] - o[k]) / d[k];
    let b = (max[k] - o[k]) / d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}
