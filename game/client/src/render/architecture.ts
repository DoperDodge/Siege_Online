// Architecture details (Phase 10 M4, render/DESIGN.md §7), drawn only (nothing here collides): every door and window
// opening (found from its barricade and glass panels) gets a frame — casing boards round it on both faces of the wall,
// linings over the wall's cut ends inside it, a sill under a window, and a window's glazing bars — each hatch a border,
// and every lamp of the bake (probes/scene.ts roomLamps) a fixture on the ceiling. Frames take the trim of the room each
// face looks into (the level material's trim mode: aArt -1), bars and fixtures their own materials. All of it is a few
// instanced meshes per storey (in the storey's group, so it hides with it).
import * as THREE from "three";
import { type BuiltLevel, type PanelEntry } from "@redmond/shared";
import { storeyOf, type LabScene } from "./labScene.js";
import type { LevelArt } from "./levelArt.js";
import { LAMP_STRIDE } from "./probes/bake.js";

/** Casing: its width across, how far proud of the wall, and the gap it leaves inside the opening. */
const CASING_W = 0.085;
const CASING_D = 0.022;
/** Lining over the wall's cut end: its thickness. */
const LINING_T = 0.012;
/** A window's sill: how far it stands out of the wall and its thickness. */
const SILL_OUT = 0.06;
const SILL_T = 0.035;
/** Glazing bars: their width, depth. */
const BAR_W = 0.035;
const BAR_D = 0.03;
/** A hatch's border width. */
const HATCH_RIM = 0.06;
/** A lamp fixture: radius and thickness (a shallow disc on the ceiling). */
const FIXTURE_R = 0.17;
const FIXTURE_T = 0.06;
/** Wall thickness when no wall is found beside an opening (the layout's interior walls), and the most a wall can be. */
const DEFAULT_WALL_M = 0.2;
const MAX_WALL_M = 0.6;

export interface Piece {
  storey: number;
  center: THREE.Vector3;
  size: THREE.Vector3;
  quat: THREE.Quaternion;
  /** The level material's per-box style: -1 the room's trim, else a fixed style + 1. */
  art: number;
}

/** An opening's place: its frame (the panel's), whether it's a window, its wall's thickness. */
export interface Opening {
  id: string;
  center: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  n: THREE.Vector3;
  w: number;
  h: number;
  wall: number;
  window: boolean;
  glazed: boolean;
}

export class Architecture {
  /** The meshes made (each in its storey's group). */
  readonly meshes: THREE.Object3D[] = [];
  /** Boxes drawn (the stats overlay). */
  pieces = 0;
  /** The openings framed, and every piece placed (tests). */
  readonly framed: Opening[] = [];
  readonly placed: Piece[] = [];
  /** Fixtures placed. */
  fixtureCount = 0;
  private readonly fixtureGeo = new THREE.CylinderGeometry(FIXTURE_R, FIXTURE_R * 0.9, FIXTURE_T, 20);
  private readonly fixtureMat = new THREE.MeshStandardMaterial({ color: 0xf4efe4, emissive: 0xfff1d8, emissiveIntensity: 2.2, roughness: 0.5 });

  constructor(
    private readonly lab: LabScene,
    private readonly level: BuiltLevel,
    private readonly art: LevelArt,
    lamps: Float32Array | null,
  ) {
    const pieces: Piece[] = this.placed;
    for (const o of this.openings()) {
      this.framed.push(o);
      this.frame(o, pieces);
    }
    for (const e of level.panels.list) if (e.panel.spec.construction.kind === "hatch") this.hatch(e, pieces);
    this.build(pieces);
    if (lamps) this.fixtures(lamps);
  }

  private storey(y: number): number {
    return storeyOf(this.level.def.storeys, y);
  }

  /** The openings: each barricade's or glass panel's frame, one per opening (a window's glass and barricade together). */
  private openings(): Opening[] {
    const byId = new Map<string, Opening>();
    for (const e of this.level.panels.list) {
      const kind = e.panel.spec.construction.kind;
      if (kind !== "barricade" && kind !== "glass") continue;
      const id = e.panel.spec.id.replace(/\.(bar|glass)$/, "");
      const f = e.frame;
      const prev = byId.get(id);
      if (prev) {
        if (kind === "glass") prev.glazed = true;
        continue;
      }
      const center = new THREE.Vector3(...f.center);
      const u = new THREE.Vector3(...f.u);
      const v = new THREE.Vector3(...f.v);
      const n = new THREE.Vector3(...f.n);
      const floor = this.level.def.storeys.length ? this.level.def.storeys[this.storey(e.min[1] + 0.05)].floorY : 0;
      byId.set(id, { id, center, u, v, n, w: f.w, h: f.h, wall: this.wallAt(center, u, n, f.w), window: e.min[1] - floor > 0.3, glazed: kind === "glass" });
    }
    return [...byId.values()];
  }

  /** The thickness of the wall beside an opening (a box just past either side of it), along n. */
  private wallAt(center: THREE.Vector3, u: THREE.Vector3, n: THREE.Vector3, w: number): number {
    const m = new THREE.Matrix4();
    const inv = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (const side of [1, -1]) {
      const at = center.clone().addScaledVector(u, side * (w / 2 + 0.08));
      for (const r of this.level.renderables) {
        if (!r.visible || (r.surface !== "HARD_WALL" && r.surface !== "REINFORCEABLE" && r.surface !== "SOFT_WALL")) continue;
        if (Math.abs(r.center[0] - at.x) > r.size[0] + r.size[2] || Math.abs(r.center[2] - at.z) > r.size[0] + r.size[2]) continue;
        m.compose(new THREE.Vector3(...r.center), new THREE.Quaternion(...r.quat), new THREE.Vector3(1, 1, 1));
        inv.copy(m).invert();
        p.copy(at).applyMatrix4(inv);
        if (Math.abs(p.x) > r.size[0] / 2 || Math.abs(p.y) > r.size[1] / 2 || Math.abs(p.z) > r.size[2] / 2) continue;
        // Its extent along n: the box's half sizes on its axes, projected.
        const q = new THREE.Quaternion(...r.quat);
        const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
        const ay = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        const az = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        const t = Math.abs(ax.dot(n)) * r.size[0] + Math.abs(ay.dot(n)) * r.size[1] + Math.abs(az.dot(n)) * r.size[2];
        // A box this deep across the opening isn't its wall (a slab, a pillar, a stair beside it): keep looking.
        if (t <= MAX_WALL_M) return t;
      }
    }
    return DEFAULT_WALL_M;
  }

  /** An opening's frame: casings on both faces, linings inside, a window's sill and glazing bars. */
  private frame(o: Opening, out: Piece[]): void {
    // A right-handed basis (a panel's n can be either way round): the boards are the same either side of the wall.
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(o.u, o.v, o.u.clone().cross(o.v)));
    const storey = this.storey(o.center.y - o.h / 2 + 0.05);
    const add = (cu: number, cv: number, cn: number, su: number, sv: number, sn: number, art = -1) =>
      out.push({
        storey,
        center: o.center.clone().addScaledVector(o.u, cu).addScaledVector(o.v, cv).addScaledVector(o.n, cn),
        size: new THREE.Vector3(su, sv, sn),
        quat,
        art,
      });
    const { w, h, wall } = o;
    const half = wall / 2;
    for (const side of [1, -1]) {
      const cn = side * (half + CASING_D / 2);
      // Jambs from the floor (a door) or the sill (a window) to over the head, and the head across.
      const bottom = o.window ? -h / 2 - SILL_T : -h / 2;
      const top = h / 2 + CASING_W;
      add(-(w / 2 + CASING_W / 2), (bottom + top) / 2, cn, CASING_W, top - bottom, CASING_D);
      add(w / 2 + CASING_W / 2, (bottom + top) / 2, cn, CASING_W, top - bottom, CASING_D);
      add(0, h / 2 + CASING_W / 2, cn, w + 2 * CASING_W, CASING_W, CASING_D);
      if (o.window) {
        // The sill: a board under the window, out of the wall; an apron under it.
        add(0, -h / 2 - SILL_T / 2, side * (half + SILL_OUT / 2), w + 2 * CASING_W + 0.06, SILL_T, SILL_OUT + 0.02);
        add(0, -h / 2 - SILL_T - CASING_W / 2, cn, w + 2 * CASING_W, CASING_W, CASING_D);
      }
    }
    // Linings over the cut ends of the wall, inside the opening: the sides, the head, and a window's bottom.
    add(-(w / 2 - LINING_T / 2), 0, 0, LINING_T, h, wall + 0.004);
    add(w / 2 - LINING_T / 2, 0, 0, LINING_T, h, wall + 0.004);
    add(0, h / 2 - LINING_T / 2, 0, w, LINING_T, wall + 0.004);
    if (o.window) add(0, -h / 2 + LINING_T / 2, 0, w, LINING_T, wall + 0.004);
    if (o.glazed) {
      // Glazing bars: one across the middle, one up the middle (four panes), on the glass's plane.
      const paint = this.art.fixedStyle("paint_white");
      add(0, 0, 0, w, BAR_W, BAR_D, paint);
      add(0, 0, 0, BAR_W, h, BAR_D, paint);
    }
  }

  /** A hatch's border on the floor round it. */
  private hatch(e: PanelEntry, out: Piece[]): void {
    const f = e.frame;
    const top = e.max[1];
    const c = new THREE.Vector3(...f.center);
    const u = new THREE.Vector3(...f.u);
    const v = new THREE.Vector3(...f.v);
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, new THREE.Vector3(0, 1, 0), u.clone().cross(new THREE.Vector3(0, 1, 0))));
    const storey = this.storey(top + 0.05);
    const wood = this.art.fixedStyle("floor_wood_dark");
    const y = top + 0.006;
    const add = (du: number, dv: number, su: number, sv: number) => {
      const at = c.clone().addScaledVector(u, du).addScaledVector(v, dv);
      at.y = y;
      out.push({ storey, center: at, size: new THREE.Vector3(su, 0.012, sv), quat, art: wood });
    };
    add(0, f.h / 2 + HATCH_RIM / 2, f.w + 2 * HATCH_RIM, HATCH_RIM);
    add(0, -f.h / 2 - HATCH_RIM / 2, f.w + 2 * HATCH_RIM, HATCH_RIM);
    add(f.w / 2 + HATCH_RIM / 2, 0, HATCH_RIM, f.h);
    add(-f.w / 2 - HATCH_RIM / 2, 0, HATCH_RIM, f.h);
  }

  /** The pieces as one instanced mesh per storey, drawn with the level's material. */
  private build(pieces: Piece[]): void {
    const byStorey = new Map<number, Piece[]>();
    for (const p of pieces) (byStorey.get(p.storey) ?? byStorey.set(p.storey, []).get(p.storey)!).push(p);
    const m = new THREE.Matrix4();
    for (const [storey, list] of byStorey) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      geo.setAttribute("aArt", new THREE.InstancedBufferAttribute(Float32Array.from(list, (p) => p.art), 1));
      const mesh = new THREE.InstancedMesh(geo, this.art.staticMaterial(), list.length);
      list.forEach((p, i) => mesh.setMatrixAt(i, m.compose(p.center, p.quat, p.size)));
      mesh.computeBoundingSphere();
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = "architecture";
      this.lab.storeys[storey].add(mesh);
      this.meshes.push(mesh);
      this.pieces += list.length;
    }
  }

  /** A fixture on the ceiling over each lamp. */
  private fixtures(lamps: Float32Array): void {
    const byStorey = new Map<number, THREE.Vector3[]>();
    for (let i = 0; i < lamps.length; i += LAMP_STRIDE) {
      const storey = this.storey(lamps[i + 1] - 2);
      const st = this.level.def.storeys[storey];
      const at = new THREE.Vector3(lamps[i], (st?.ceilingY ?? lamps[i + 1]) - FIXTURE_T / 2, lamps[i + 2]);
      (byStorey.get(storey) ?? byStorey.set(storey, []).get(storey)!).push(at);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (const [storey, list] of byStorey) {
      const mesh = new THREE.InstancedMesh(this.fixtureGeo, this.fixtureMat, list.length);
      list.forEach((p, i) => mesh.setMatrixAt(i, m.compose(p, q, one)));
      mesh.computeBoundingSphere();
      mesh.name = "lamps";
      this.lab.storeys[storey].add(mesh);
      this.meshes.push(mesh);
      this.fixtureCount += list.length;
    }
  }

  /** Show or hide it all (the greybox palette hides the art's details). */
  setVisible(on: boolean): void {
    for (const m of this.meshes) m.visible = on;
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.removeFromParent();
      const inst = m as THREE.InstancedMesh;
      if (inst.geometry !== this.fixtureGeo) inst.geometry.dispose();
    }
    this.fixtureGeo.dispose();
    this.fixtureMat.dispose();
  }
}
