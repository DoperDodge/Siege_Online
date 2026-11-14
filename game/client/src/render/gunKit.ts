// The guns (Phase 3 M9; Phase 10 M7, render/DESIGN.md §10): each weapon built in code from its look
// (data/presentation/gun_kit.json `weapons`, else its class's): a base form — an AR, an AK, a bullpup, a chassis rifle,
// an SMG, a machine pistol, a pump, semi-auto, revolver or double shotgun, a pistol, a flare-style hand cannon, an LMG —
// drawn from side profiles extruded with bevelled edges, cross-sections run along the barrel, turned barrels and
// muzzles, rails with their teeth and iron sights; then the attachments the loadout carries, each its own part (a sight
// on the top rail, a muzzle device on the barrel, a grip under the handguard, a laser on its side). The same model
// serves the first-person viewmodel and the gun other players hold. It casts no shadow: guns move, and the shadow map
// is only redrawn when the level changes (labScene.ts, createRenderer). Parts are merged by material (a few draw calls a
// gun); the magazine stays its own (a reload moves it). Our own shapes, of each family's general form.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { loadPresentationData, type GunKit, type GunLookData } from "@redmond/shared";

/** What the model needs to know about a weapon: its id (its own look), class, and the attachments picked. */
export interface GunLook {
  id?: string;
  class: string;
  pick: { sight: string | null; barrel: string | null; grip: string | null; underbarrel: string | null };
}

export interface GunModel {
  readonly group: THREE.Group;
  /** Gun-frame point the eye looks through when aiming. */
  readonly sight: THREE.Vector3;
  /** Gun-frame point at the end of the barrel (or barrel attachment). */
  readonly muzzle: THREE.Vector3;
  /** The magazine (a reload moves it) and where it sits. */
  readonly mag: THREE.Object3D;
  readonly magHome: THREE.Vector3;
  /** Gun-frame point the laser leaves from, if fitted. */
  readonly laser: THREE.Vector3 | null;
  /** What the sight shows at full ADS. */
  readonly reticle: "posts" | "dot" | "cross";
  /** Triangles in the model (the budget: PLAN §12.2). */
  readonly triangles: number;
  dispose(): void;
}

type Mat = "metal" | "furniture" | "wood" | "attach" | "dark" | "glass" | "accent";
type P = [number, number];
const DEG = Math.PI / 180;
/** Picatinny: the rail's base height and width, its teeth's height and pitch. */
const RAIL_BASE = 0.006;
const RAIL_TOOTH = 0.0035;
const RAIL_PITCH = 0.01;

/**
 * Each finish's colours: the metal (and its sheen) and the furniture. "Black" is a dark grey: a gun's shape has to read
 * in the hands, in a dim room, by its lit faces (a true black is a silhouette).
 */
const FINISHES: Record<GunLookData["finish"], { metal: string; metalness: number; metalRough: number; furniture: string; furnRough: number }> = {
  black: { metal: "#4a4f56", metalness: 0.35, metalRough: 0.45, furniture: "#34373c", furnRough: 0.6 },
  tan: { metal: "#4a4f56", metalness: 0.35, metalRough: 0.45, furniture: "#b29a74", furnRough: 0.66 },
  grey: { metal: "#5f666e", metalness: 0.35, metalRough: 0.45, furniture: "#70767d", furnRough: 0.6 },
  olive: { metal: "#4a4f56", metalness: 0.35, metalRough: 0.45, furniture: "#5d654a", furnRough: 0.64 },
  wood: { metal: "#4a4f56", metalness: 0.45, metalRough: 0.4, furniture: "#7a4f2c", furnRough: 0.5 },
  silver: { metal: "#b8bcc1", metalness: 0.85, metalRough: 0.3, furniture: "#34373c", furnRough: 0.6 },
  two_tone: { metal: "#b0b4b9", metalness: 0.85, metalRough: 0.32, furniture: "#34373c", furnRough: 0.6 },
};

/** Collects a gun's parts by material, in the gun's frame: u forward (−z), v up (y), x right. */
class Builder {
  readonly parts = new Map<Mat, THREE.BufferGeometry[]>();
  readonly magParts = new Map<Mat, THREE.BufferGeometry[]>();
  /** Parts go to the magazine while this is set. */
  intoMag = false;

  private put(mat: Mat, g: THREE.BufferGeometry): void {
    const into = this.intoMag ? this.magParts : this.parts;
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    geo.deleteAttribute("uv");
    const list = into.get(mat);
    if (list) list.push(geo);
    else into.set(mat, [geo]);
  }

  /** A side profile (points in u, v) extruded `width` across x, centred on x, its edges bevelled. */
  side(mat: Mat, pts: readonly P[], width: number, x = 0, bevel = 0.0012, holes: readonly (readonly P[])[] = []): void {
    const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
    const depth = Math.max(0.0005, width - 2 * bevel);
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 1, curveSegments: 4 });
    g.rotateY(Math.PI / 2); // u → −z, the extrusion → x
    g.translate(x - depth / 2, 0, 0);
    this.put(mat, g);
  }

  /** A cross-section (points in x, y; holes are open along the barrel) run along the barrel from u0 to u1. */
  section(mat: Mat, pts: readonly P[], u0: number, u1: number, bevel = 0, holes: readonly (readonly P[])[] = []): void {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const len = Math.max(0.0005, u1 - u0 - 2 * bevel);
    const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, -u1 + bevel);
    this.put(mat, g);
  }

  /** A turned part along the barrel: radius r at u0, rFront at u1 (an open end if `open`). */
  tube(mat: Mat, r: number, u0: number, u1: number, v: number, x = 0, segs = 16, rFront = r, open = false): void {
    const g = new THREE.CylinderGeometry(rFront, r, Math.max(1e-4, u1 - u0), segs, 1, open);
    g.rotateX(-Math.PI / 2); // +y (its front) → −z
    g.translate(x, v, -(u0 + u1) / 2);
    this.put(mat, g);
  }

  /** A box: size [across x, up, along u], centred at (x, v, u). */
  block(mat: Mat, size: readonly [number, number, number], u: number, v: number, x = 0, rotX = 0): void {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    if (rotX) g.rotateX(rotX);
    g.translate(x, v, -u);
    this.put(mat, g);
  }

  /** A cylinder standing up (a grip, a knob): radius r, height h, centred at (x, v, u). */
  post(mat: Mat, r: number, h: number, u: number, v: number, x = 0, segs = 12, rTop = r): void {
    const g = new THREE.CylinderGeometry(rTop, r, h, segs);
    g.translate(x, v, -u);
    this.put(mat, g);
  }

  /** A cylinder across the gun (a pin, a knob on the side, a revolver's cylinder seen from the side is along u). */
  pin(mat: Mat, r: number, len: number, u: number, v: number, x = 0, segs = 10): void {
    const g = new THREE.CylinderGeometry(r, r, len, segs);
    g.rotateZ(Math.PI / 2);
    g.translate(x, v, -u);
    this.put(mat, g);
  }

  /** A Picatinny rail on top from u0 to u1, its base on v: the base and its teeth. Returns its top. */
  rail(u0: number, u1: number, v: number, width = 0.021, mat: Mat = "metal"): number {
    this.block(mat, [width, RAIL_BASE, u1 - u0], (u0 + u1) / 2, v + RAIL_BASE / 2);
    const n = Math.floor((u1 - u0 - 0.004) / RAIL_PITCH);
    for (let i = 0; i < n; i++) this.block(mat, [width, RAIL_TOOTH, RAIL_PITCH * 0.52], u0 + 0.004 + (i + 0.5) * RAIL_PITCH, v + RAIL_BASE + RAIL_TOOTH / 2);
    return v + RAIL_BASE + RAIL_TOOTH;
  }

  /** A rail on a side (x = ±face) from u0 to u1, centred on v. */
  sideRail(u0: number, u1: number, v: number, xFace: number, height = 0.016): void {
    const dir = Math.sign(xFace);
    this.block("metal", [RAIL_BASE, height, u1 - u0], (u0 + u1) / 2, v, xFace + (dir * RAIL_BASE) / 2);
    const n = Math.floor((u1 - u0 - 0.004) / RAIL_PITCH);
    for (let i = 0; i < n; i++) this.block("metal", [RAIL_TOOTH, height, RAIL_PITCH * 0.52], u0 + 0.004 + (i + 0.5) * RAIL_PITCH, v, xFace + dir * (RAIL_BASE + RAIL_TOOTH / 2));
  }
}

/** Where a base form leaves room for its attachments and what it has built in. */
interface Anchors {
  /** The top rail (an optic's base on it): its span and its top's height; or a slide's top (a pistol's mini dot). */
  top: { u0: number; u1: number; v: number; slide?: boolean };
  /** Where an optic sits along the top. */
  optic: number;
  /**
   * The iron sights: the sight line's height, where along the gun the rear and the front stand, and which of them the
   * base built itself — none (both are flip-ups on its rail, folded away under an optic), its front post (the rear
   * is a flip-up), or both (a pistol's, a bead).
   */
  irons: { line: number; rear: number; front: number; built: "none" | "front" | "both" };
  /** The barrel's end (where a muzzle device goes) and its radius. */
  muzzle: P;
  barrelR: number;
  /** Under the handguard (a grip), and on its right side (a laser): null where there's no room. */
  under: P | null;
  side: { u: number; v: number; x: number } | null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Shared parts

/** A pistol grip from under the receiver (its top at vTop, centred at u), raked back by `rake`. */
function grip(b: Builder, mat: Mat, u: number, vTop: number, rake = 18, len = 0.1, depth = 0.036, width = 0.03): void {
  const t = Math.tan(rake * DEG);
  const fb = u + depth / 2;
  const bb = u - depth / 2;
  b.side(
    mat,
    [
      [bb, vTop],
      [fb, vTop],
      [fb - t * len * 0.35 + 0.003, vTop - len * 0.35],
      [fb - t * len * 0.55, vTop - len * 0.55],
      [fb - t * len * 0.75 + 0.002, vTop - len * 0.75],
      [fb - t * len, vTop - len],
      [bb - t * len - 0.004, vTop - len + 0.006],
      [bb - t * len * 0.5 - 0.006, vTop - len * 0.5],
    ],
    width,
  );
}

/** A trigger guard (bottom and front bars) from the grip's front (uBack) to uFront, under vTop; and the trigger. */
function triggerGuard(b: Builder, uBack: number, uFront: number, vTop: number, mat: Mat = "metal"): void {
  const bottom = vTop - 0.036;
  b.block(mat, [0.01, 0.006, uFront - uBack], (uBack + uFront) / 2, bottom);
  b.block(mat, [0.01, vTop - bottom, 0.006], uFront - 0.003, (vTop + bottom) / 2);
  const tu = uBack + (uFront - uBack) * 0.42;
  b.side("metal", [[tu - 0.002, vTop], [tu + 0.004, vTop], [tu + 0.001, bottom + 0.012], [tu - 0.005, bottom + 0.014]], 0.006, 0, 0.0005);
}

/** A stock behind uBack (its top line at vTop), by kind; `drop` lowers its toe. */
function stock(b: Builder, kind: NonNullable<GunLookData["stock"]>, uBack: number, vTop: number, drop = 0.075, mat: Mat = "furniture"): void {
  if (kind === "none") {
    b.block("metal", [0.026, 0.03, 0.012], uBack - 0.006, vTop - 0.02);
    return;
  }
  if (kind === "collapsible") {
    // A buffer tube, the stock body sliding on it, a pad.
    b.tube("metal", 0.0155, uBack - 0.21, uBack, vTop - 0.024);
    b.side(mat, [[uBack - 0.135, vTop - 0.005], [uBack - 0.255, vTop + 0.004], [uBack - 0.262, vTop - drop - 0.01], [uBack - 0.235, vTop - drop - 0.02], [uBack - 0.18, vTop - 0.05], [uBack - 0.135, vTop - 0.045]], 0.042);
    b.block("dark", [0.04, drop + 0.02, 0.014], uBack - 0.268, vTop - drop / 2 - 0.004);
    return;
  }
  if (kind === "fixed" || kind === "wood") {
    const m: Mat = kind === "wood" ? "wood" : mat;
    b.side(m, [[uBack + 0.005, vTop], [uBack - 0.3, vTop + 0.006], [uBack - 0.32, vTop - drop - 0.03], [uBack - 0.29, vTop - drop - 0.04], [uBack - 0.05, vTop - 0.06], [uBack + 0.005, vTop - 0.045]], 0.04);
    b.block("dark", [0.038, drop + 0.04, 0.014], uBack - 0.325, vTop - drop / 2 - 0.016);
    return;
  }
  // Skeleton (or side-folding, thinner): an outline with an opening.
  const w = kind === "folding" ? 0.018 : 0.026;
  b.side(
    mat,
    [[uBack + 0.005, vTop], [uBack - 0.29, vTop + 0.004], [uBack - 0.3, vTop - drop - 0.025], [uBack - 0.255, vTop - drop - 0.03], [uBack + 0.005, vTop - 0.05]],
    w,
    0,
    0.0012,
    [[[uBack - 0.03, vTop - 0.012], [uBack - 0.265, vTop - 0.01], [uBack - 0.27, vTop - drop - 0.012], [uBack - 0.245, vTop - drop - 0.015], [uBack - 0.03, vTop - 0.04]]],
  );
  b.block("dark", [w + 0.004, drop + 0.03, 0.012], uBack - 0.302, vTop - drop / 2 - 0.012);
  if (kind === "folding") b.block("metal", [0.03, 0.03, 0.02], uBack - 0.005, vTop - 0.022);
}

/** A shotgun's stock behind uBack: the comb from the receiver's top (vTop) back to the heel, the butt, the toe and a
 * narrow wrist rising to under the receiver (vBottom) — the wrist is the grip. */
function classicStock(b: Builder, mat: Mat, uBack: number, vTop: number, vBottom: number): void {
  b.side(
    mat,
    [
      [uBack + 0.002, vTop - 0.006],
      [uBack - 0.08, vTop - 0.022],
      [uBack - 0.33, vTop - 0.036],
      [uBack - 0.335, vTop - 0.17],
      [uBack - 0.3, vTop - 0.172],
      [uBack - 0.1, vBottom - 0.035],
      [uBack - 0.01, vBottom - 0.012],
      [uBack + 0.05, vBottom - 0.004],
      [uBack + 0.05, vBottom],
      [uBack + 0.002, vBottom + 0.004],
    ],
    0.04,
  );
  b.block("dark", [0.038, 0.13, 0.014], uBack - 0.338, vTop - 0.1);
}

/** A magazine below vTop centred at u (into the magazine group): its shape by kind. */
function magazine(b: Builder, kind: NonNullable<GunLookData["mag"]>, u: number, vTop: number, mat: Mat = "furniture"): void {
  b.intoMag = true;
  const m: Mat = kind === "stanag" ? "metal" : mat;
  if (kind === "stanag") {
    b.side(m, [[u - 0.034, vTop], [u + 0.034, vTop], [u + 0.05, vTop - 0.175], [u - 0.014, vTop - 0.185]], 0.023);
    b.side("dark", [[u - 0.018, vTop - 0.178], [u + 0.055, vTop - 0.17], [u + 0.056, vTop - 0.188], [u - 0.017, vTop - 0.196]], 0.027);
  } else if (kind === "308") {
    b.side(m, [[u - 0.04, vTop], [u + 0.04, vTop], [u + 0.046, vTop - 0.13], [u - 0.032, vTop - 0.136]], 0.03);
    b.side("dark", [[u - 0.034, vTop - 0.13], [u + 0.05, vTop - 0.124], [u + 0.05, vTop - 0.14], [u - 0.034, vTop - 0.146]], 0.034);
  } else if (kind === "ak") {
    const arc: P[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      arc.push([u + 0.04 + t * 0.09 + t * t * 0.04, vTop - t * 0.2]);
    }
    const back: P[] = [];
    for (let i = 6; i >= 0; i--) {
      const t = i / 6;
      back.push([u - 0.035 + t * 0.07 + t * t * 0.045, vTop - t * 0.215]);
    }
    b.side(m, [...arc, ...back], 0.026);
    for (let i = 1; i <= 3; i++) b.block("dark", [0.0275, 0.004, 0.06], u + 0.01 + i * 0.03, vTop - i * 0.05, 0, -0.35 - i * 0.1);
  } else if (kind === "smg" || kind === "pistol") {
    const len = kind === "smg" ? 0.19 : 0.1;
    const w = kind === "smg" ? 0.022 : 0.024;
    b.side(m, [[u - 0.019, vTop], [u + 0.019, vTop], [u + 0.022, vTop - len], [u - 0.016, vTop - len]], w);
    b.side("dark", [[u - 0.019, vTop - len], [u + 0.025, vTop - len], [u + 0.025, vTop - len - 0.012], [u - 0.019, vTop - len - 0.012]], w + 0.004);
  } else if (kind === "curved") {
    b.side(m, [[u - 0.02, vTop], [u + 0.02, vTop], [u + 0.05, vTop - 0.14], [u + 0.012, vTop - 0.146]], 0.023);
  } else if (kind === "box") {
    // An LMG's ammunition box, hanging under the receiver.
    b.block(m, [0.07, 0.11, 0.12], u, vTop - 0.055);
    b.block("dark", [0.074, 0.012, 0.124], u, vTop - 0.1);
    b.block("metal", [0.075, 0.02, 0.03], u + 0.03, vTop - 0.02);
  } else {
    b.tube("metal", 0.011, u - 0.15, u + 0.15, vTop - 0.011);
  }
  b.intoMag = false;
}

/** A handguard round the barrel (axis at vb) from u0 to u1, by kind; the rail on its top too. Returns its half height. */
function handguard(b: Builder, kind: NonNullable<GunLookData["fore"]>, u0: number, u1: number, vb: number, scale = 1): number {
  const h = 0.023 * scale;
  if (kind === "rail") {
    b.section("metal", [[-h, vb - h], [h, vb - h], [h, vb + h], [-h, vb + h]], u0, u1, 0.0015);
    b.rail(u0 + 0.005, u1 - 0.005, vb + h);
    b.sideRail(u0 + 0.02, u1 - 0.01, vb, h);
    b.sideRail(u0 + 0.02, u1 - 0.01, vb, -h);
    // The bottom rail.
    b.block("metal", [0.021, RAIL_BASE, u1 - u0 - 0.03], (u0 + u1) / 2, vb - h - RAIL_BASE / 2);
    return h + RAIL_BASE;
  }
  if (kind === "mlok") {
    const r = 0.025 * scale;
    const oct: P[] = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      oct.push([Math.cos(a) * r, vb + Math.sin(a) * r]);
    }
    b.section("furniture", oct, u0, u1, 0.001);
    b.rail(u0 + 0.004, u1 - 0.004, vb + r * Math.cos(Math.PI / 8) - 0.001);
    // Its slots, down each side.
    for (let s = u0 + 0.03; s < u1 - 0.03; s += 0.045)
      for (const x of [-1, 1]) b.block("dark", [0.003, 0.008, 0.026], s, vb, x * r * 0.93);
    return r;
  }
  if (kind === "round") {
    const r = 0.024 * scale;
    b.tube("furniture", r, u0, u1, vb, 0, 18, r * 0.92);
    for (let s = u0 + 0.02; s < u1 - 0.015; s += 0.03) b.tube("dark", r + 0.0008, s, s + 0.006, vb, 0, 18);
    b.tube("metal", r + 0.004, u0, u0 + 0.012, vb, 0, 18);
    return r;
  }
  if (kind === "wood") {
    b.section("wood", [[-0.022, vb - 0.03], [0.022, vb - 0.03], [0.025, vb - 0.005], [0.018, vb + 0.012], [-0.018, vb + 0.012], [-0.025, vb - 0.005]], u0, u1, 0.002);
    return 0.03;
  }
  // A pump's forend, or a ribbed one.
  const m: Mat = kind === "pump" ? "furniture" : "furniture";
  b.section(m, [[-0.022, vb - 0.032], [0.022, vb - 0.032], [0.026, vb - 0.012], [0.02, vb + 0.004], [-0.02, vb + 0.004], [-0.026, vb - 0.012]], u0, u1, 0.002);
  if (kind === "ribbed") for (let s = u0 + 0.015; s < u1 - 0.01; s += 0.018) b.block("dark", [0.054, 0.004, 0.006], s, vb - 0.02);
  return 0.032;
}

/**
 * A flip-up rear sight on a rail (its top at vTop) at u: a ghost ring on a stem, centred on the sight line and open
 * along the barrel (the eye looks through it at the front post).
 */
function rearAperture(b: Builder, u: number, vTop: number, line: number): void {
  b.block("attach", [0.022, 0.008, 0.03], u, vTop + 0.004);
  const R = 0.0105;
  const r = 0.0078;
  const ring = (rad: number): P[] => Array.from({ length: 12 }, (_, i) => [Math.cos((i / 12) * Math.PI * 2) * rad, line + Math.sin((i / 12) * Math.PI * 2) * rad] as P);
  b.section("attach", ring(R), u - 0.005, u - 0.002, 0, [ring(r)]);
  // Its stem, from the base up to the ring's foot.
  const foot = line - R + 0.001;
  if (foot > vTop + 0.008) b.block("attach", [0.008, foot - vTop - 0.008, 0.003], u - 0.0035, (vTop + 0.008 + foot) / 2);
}

/** A flip-up front sight on a rail at u: a post up to the sight line, between two wings. */
function frontFlip(b: Builder, u: number, vTop: number, line: number): void {
  b.block("attach", [0.022, 0.008, 0.026], u, vTop + 0.004);
  for (const x of [-0.008, 0.008]) b.side("attach", [[u - 0.006, vTop + 0.008], [u + 0.006, vTop + 0.008], [u + 0.003, line + 0.004], [u - 0.003, line + 0.004]], 0.004, x, 0.0004);
  b.block("attach", [0.0028, line - vTop - 0.008, 0.004], u, (vTop + 0.008 + line) / 2);
}

/** The barrel's crown and a front sight A-frame at u (axis vb, post tip at tipV). */
function frontPost(b: Builder, u: number, vb: number, tipV: number): void {
  b.side("metal", [[u - 0.012, vb], [u + 0.012, vb], [u + 0.005, tipV - 0.006], [u - 0.005, tipV - 0.006]], 0.016, 0, 0.001, [[[u - 0.006, vb + 0.012], [u + 0.006, vb + 0.012], [u + 0.003, tipV - 0.014], [u - 0.003, tipV - 0.014]]]);
  b.block("metal", [0.003, 0.012, 0.004], u, tipV - 0.006);
}

// ---------------------------------------------------------------------------------------------------------------------
// The base forms. Each builds round the hand on its grip (the origin) and says where its attachments go.

function ar(b: Builder, L: GunLookData): Anchors {
  const vb = 0.092;
  const top = 0.113;
  // The lower receiver, its magwell, the trigger guard, the pistol grip.
  b.side("metal", [[-0.055, 0.032], [0.155, 0.032], [0.16, 0.072], [-0.06, 0.072], [-0.07, 0.058]], 0.023);
  b.side("metal", [[0.072, -0.012], [0.152, -0.012], [0.158, 0.034], [0.068, 0.034]], 0.029);
  triggerGuard(b, 0.032, 0.075, 0.034);
  grip(b, "furniture", 0.012, 0.034);
  // The upper: flat top (a piston gun's taller, rounded), the ejection port, forward assist, charging handle.
  if (L.variant === "piston") {
    b.side("metal", [[-0.062, 0.072], [0.18, 0.072], [0.18, 0.108], [0.17, top], [-0.05, top], [-0.066, 0.1]], 0.032);
    b.pin("metal", 0.006, 0.016, 0.12, 0.1, 0.022);
  } else {
    b.side("metal", [[-0.06, 0.072], [0.18, 0.072], [0.18, top], [-0.05, top], [-0.066, 0.1]], 0.03);
    b.block("metal", [0.012, 0.012, 0.02], 0.0, 0.098, 0.019);
  }
  b.block("dark", [0.002, 0.014, 0.05], 0.075, 0.09, 0.0158);
  b.block("metal", [0.024, 0.008, 0.026], -0.056, 0.108);
  const railTop = b.rail(-0.05, 0.178, top);
  // The handguard and barrel.
  const fore = L.fore ?? "rail";
  const lh = Math.max(0.1, Math.min(L.barrel - 0.035, 0.36));
  const u0 = 0.181;
  const u1 = u0 + lh;
  const half = handguard(b, fore, u0, u1, vb);
  b.tube("metal", 0.0095, u0, u0 + L.barrel, vb);
  b.tube("metal", 0.013, u1 + 0.004, u1 + 0.03, vb); // the gas block
  const line = railTop + 0.024;
  if (fore === "round") frontPost(b, u1 + 0.03, vb, line);
  stock(b, L.stock ?? "collapsible", -0.06, top - 0.004);
  magazine(b, L.mag ?? "stanag", 0.112, -0.01);
  return {
    top: { u0: -0.05, u1: fore === "round" ? 0.178 : u1 - 0.005, v: railTop },
    optic: 0.06,
    irons: { line, rear: -0.03, front: fore === "round" ? u1 + 0.03 : u1 - 0.02, built: fore === "round" ? "front" : "none" },
    muzzle: [u0 + L.barrel, vb],
    barrelR: 0.0095,
    under: [u0 + lh * 0.45, vb - half],
    side: { u: u0 + lh * 0.72, v: vb, x: (fore === "rail" ? half : 0.025) + 0.002 },
  };
}

function ak(b: Builder, L: GunLookData): Anchors {
  const vb = 0.076;
  const top = 0.108;
  // The stamped receiver, its dust cover rounded at the back, the selector lever, the magwell lip.
  b.side("metal", [[-0.07, 0.034], [0.205, 0.034], [0.205, 0.096], [-0.06, 0.096], [-0.075, 0.08]], 0.031);
  b.side("metal", [[-0.055, 0.096], [0.2, 0.096], [0.2, top], [-0.04, top], [-0.058, 0.102]], 0.029);
  b.block("dark", [0.002, 0.03, 0.12], 0.05, 0.07, 0.016);
  b.side("metal", [[-0.02, 0.06], [0.1, 0.06], [0.1, 0.064], [-0.02, 0.066]], 0.002, 0.0168, 0.0004);
  triggerGuard(b, 0.03, 0.075, 0.034);
  grip(b, "furniture", 0.012, 0.034, 16);
  const railTop = b.rail(-0.03, 0.19, top);
  // The gas tube over the barrel, the handguard round both, the front sight block, the barrel.
  const lh = Math.max(0.12, Math.min(L.barrel - 0.06, 0.24));
  const u0 = 0.206;
  const u1 = u0 + lh;
  b.tube("metal", 0.011, u0, u1 + 0.02, vb + 0.024);
  const fore = L.fore ?? "rail";
  const half = handguard(b, fore === "rail" ? "rail" : "wood", u0, u1, vb + 0.008);
  b.tube("metal", 0.0098, u0, u0 + L.barrel, vb);
  const line = railTop + 0.022;
  frontPost(b, u1 + 0.03, vb, line);
  stock(b, L.stock ?? "collapsible", -0.07, top - 0.008, 0.07);
  magazine(b, L.mag ?? "ak", 0.12, 0.034);
  return {
    top: { u0: -0.03, u1: fore === "rail" ? u1 - 0.006 : 0.19, v: railTop },
    optic: 0.07,
    irons: { line, rear: -0.01, front: u1 + 0.03, built: "front" },
    muzzle: [u0 + L.barrel, vb],
    barrelR: 0.0098,
    under: [u0 + lh * 0.5, vb + 0.008 - half],
    side: { u: u0 + lh * 0.75, v: vb + 0.008, x: half + 0.002 },
  };
}

function bullpup(b: Builder, L: GunLookData): Anchors {
  const vb = 0.085;
  const top = 0.112;
  const pdw = L.variant === "pdw";
  const back = pdw ? -0.3 : -0.42;
  // The long body from the butt to past the grip, the cheek, the butt pad.
  b.side("furniture", [[back, 0.11], [0.2, 0.11], [0.2, 0.034], [0.06, 0.034], [-0.03, 0.03], [back + 0.06, 0.0], [back + 0.01, -0.02], [back, -0.015]], 0.046);
  b.block("dark", [0.046, 0.13, 0.014], back - 0.006, 0.045);
  b.block("dark", [0.002, 0.016, 0.06], -0.16, 0.085, 0.024);
  grip(b, "furniture", 0.012, 0.034, 12);
  triggerGuard(b, 0.032, 0.085, 0.034);
  // The receiver's top: a long rail (or, modern, a rounded spine with a rail on it).
  if (L.variant === "modern") b.side("metal", [[back + 0.04, 0.108], [0.2, 0.108], [0.2, top], [back + 0.06, top]], 0.03);
  const railTop = b.rail(back + 0.08, 0.19, top);
  const lh = Math.max(0.08, Math.min(L.barrel - 0.04, 0.18));
  const u0 = 0.2;
  const half = handguard(b, L.variant === "modern" ? "mlok" : "rail", u0, u0 + lh, vb, 0.95);
  b.tube("metal", 0.0095, u0, u0 + L.barrel, vb);
  // The magazine behind the grip.
  magazine(b, L.mag ?? "stanag", -0.12, 0.034);
  return {
    top: { u0: back + 0.08, u1: u0 + lh - 0.01, v: railTop },
    optic: -0.06,
    irons: { line: railTop + 0.024, rear: back + 0.12, front: u0 + lh - 0.02, built: "none" },
    muzzle: [u0 + L.barrel, vb],
    barrelR: 0.0095,
    under: [u0 + lh * 0.5, vb - half],
    side: { u: u0 + lh * 0.7, v: vb, x: half + 0.002 },
  };
}

function chassis(b: Builder, L: GunLookData): Anchors {
  const vb = 0.09;
  const top = 0.118;
  // The receiver inside an aluminium chassis: rails top, sides and bottom, a long forend.
  b.side("metal", [[-0.07, 0.03], [0.16, 0.03], [0.16, 0.112], [-0.07, 0.112]], 0.034);
  b.side("metal", [[0.07, -0.012], [0.155, -0.012], [0.16, 0.034], [0.066, 0.034]], 0.033);
  triggerGuard(b, 0.032, 0.075, 0.034);
  grip(b, "furniture", 0.012, 0.034);
  b.block("dark", [0.002, 0.016, 0.05], 0.08, 0.088, 0.0175);
  const lh = Math.max(0.15, Math.min(L.barrel - 0.03, 0.34));
  const u1 = 0.16 + lh;
  b.section("furniture", [[-0.026, vb - 0.03], [0.026, vb - 0.03], [0.028, vb + 0.026], [-0.028, vb + 0.026]], 0.16, u1, 0.002);
  for (let s = 0.2; s < u1 - 0.02; s += 0.05) for (const x of [-1, 1]) b.block("dark", [0.003, 0.012, 0.03], s, vb - 0.004, x * 0.0285);
  const railTop = b.rail(-0.07, u1 - 0.005, vb + 0.026);
  b.sideRail(0.2, u1 - 0.01, vb, 0.028);
  b.tube("metal", 0.0105, 0.16, 0.16 + L.barrel, vb);
  // A tube stock with a cheek riser.
  b.tube("metal", 0.016, -0.3, -0.07, top - 0.03);
  b.side("furniture", [[-0.16, top - 0.01], [-0.3, top - 0.004], [-0.31, top - 0.11], [-0.28, top - 0.12], [-0.2, top - 0.05], [-0.16, top - 0.045]], 0.044);
  b.block("dark", [0.044, 0.11, 0.014], -0.316, top - 0.06);
  magazine(b, L.mag ?? "308", 0.112, -0.01);
  return {
    top: { u0: -0.07, u1: u1 - 0.005, v: railTop },
    optic: 0.05,
    irons: { line: railTop + 0.024, rear: -0.04, front: u1 - 0.02, built: "none" },
    muzzle: [0.16 + L.barrel, vb],
    barrelR: 0.0105,
    under: [0.16 + lh * 0.5, vb - 0.03],
    side: { u: 0.16 + lh * 0.75, v: vb, x: 0.032 },
  };
}

function smg(b: Builder, L: GunLookData): Anchors {
  const v = L.variant ?? "ump";
  const vb = 0.08;
  let top = 0.104;
  let front = 0.2;
  if (v === "vector") {
    // The slanted body: the magwell ahead of the trigger, the front raked down.
    b.side("furniture", [[-0.09, 0.034], [0.07, 0.034], [0.15, -0.01], [0.215, -0.004], [0.225, 0.04], [0.225, top], [-0.09, top]], 0.04);
    b.block("dark", [0.002, 0.014, 0.05], 0.03, 0.08, 0.0205);
    front = 0.225;
    magazine(b, L.mag ?? "smg", 0.17, 0.0);
  } else if (v === "mp5k") {
    // A compact round-topped receiver, a vertical grip built on its front.
    top = 0.1;
    b.side("metal", [[-0.08, 0.04], [0.19, 0.04], [0.19, 0.088], [-0.08, 0.088]], 0.03);
    b.tube("metal", 0.016, -0.08, 0.19, 0.088);
    b.post("furniture", 0.016, 0.085, 0.165, 0.0);
    b.post("furniture", 0.019, 0.012, 0.165, -0.044);
    front = 0.19;
    magazine(b, L.mag ?? "curved", 0.1, 0.04);
  } else {
    // A boxy polymer receiver, a short rail on top.
    b.side("furniture", [[-0.1, 0.034], [0.215, 0.034], [0.215, top], [-0.095, top], [-0.105, 0.09]], 0.042);
    b.side("furniture", [[0.085, -0.012], [0.145, -0.012], [0.15, 0.034], [0.08, 0.034]], 0.032);
    b.block("dark", [0.002, 0.016, 0.05], 0.03, 0.08, 0.0215);
    front = 0.215;
    magazine(b, L.mag ?? "smg", 0.115, -0.01);
  }
  triggerGuard(b, 0.032, 0.075, 0.034, "furniture");
  grip(b, "furniture", 0.012, 0.034, v === "vector" ? 8 : 16);
  const railTop = b.rail(-0.07, front - 0.01, top, 0.021);
  b.tube("metal", 0.0095, front, front + Math.max(0.02, L.barrel), vb);
  b.tube("metal", 0.012, front, front + 0.012, vb);
  if (L.stock && L.stock !== "none") stock(b, L.stock, -0.095, top - 0.004, 0.065);
  else b.block("furniture", [0.03, 0.05, 0.014], -0.087, 0.07);
  return {
    top: { u0: -0.07, u1: front - 0.01, v: railTop },
    optic: 0.05,
    irons: { line: railTop + 0.024, rear: -0.05, front: front - 0.025, built: "none" },
    muzzle: [front + Math.max(0.02, L.barrel), vb],
    barrelR: 0.0095,
    under: v === "mp5k" ? null : [front - 0.04, 0.034],
    side: { u: front - 0.04, v: vb, x: 0.023 },
  };
}

function mpistol(b: Builder, L: GunLookData): Anchors {
  const evo = L.variant === "evo";
  const vb = 0.068;
  const top = 0.088;
  const front = evo ? 0.17 : 0.14;
  // A box receiver over the grip; the magazine goes up the grip.
  b.side("metal", [[-0.065, 0.034], [front, 0.034], [front, top], [-0.06, top], [-0.07, 0.07]], 0.036);
  b.block("dark", [0.002, 0.012, 0.04], 0.03, 0.066, 0.0185);
  b.block("metal", [0.016, 0.01, 0.016], -0.03, top + 0.004);
  triggerGuard(b, 0.035, 0.08, 0.034);
  grip(b, "furniture", 0.0, 0.034, evo ? 14 : 4, 0.095, 0.034, 0.032);
  const railTop = evo ? b.rail(-0.05, front - 0.01, top) : top + 0.004;
  if (evo) b.post("furniture", 0.012, 0.05, front - 0.035, 0.012);
  b.tube("metal", 0.009, front, front + Math.max(0.02, L.barrel), vb);
  b.tube("metal", 0.0115, front + Math.max(0.02, L.barrel) - 0.015, front + Math.max(0.02, L.barrel), vb);
  // The magazine: its base out of the grip's bottom.
  b.intoMag = true;
  const t = Math.tan((evo ? 14 : 4) * DEG);
  const mu = -t * 0.095;
  b.side("metal", [[mu - 0.016, -0.06], [mu + 0.016, -0.06], [mu + 0.014 - t * 0.07, -0.13], [mu - 0.018 - t * 0.07, -0.13]], 0.024);
  b.side("dark", [[mu - 0.022 - t * 0.07, -0.13], [mu + 0.018 - t * 0.07, -0.13], [mu + 0.018 - t * 0.07, -0.14], [mu - 0.022 - t * 0.07, -0.14]], 0.028);
  b.intoMag = false;
  // A rail's flip-ups, or (no rail) its own: a notch at the back and a post at the front, their tops on the line.
  const line = evo ? railTop + 0.024 : top + 0.014;
  if (!evo) {
    for (const x of [-0.006, 0.006]) b.block("metal", [0.004, 0.014, 0.008], -0.05, top + 0.007, x);
    b.block("metal", [0.003, 0.014, 0.005], front - 0.008, top + 0.007);
  }
  return {
    top: { u0: -0.05, u1: front - 0.01, v: railTop },
    optic: 0.04,
    irons: { line, rear: evo ? -0.03 : -0.05, front: evo ? front - 0.025 : front - 0.008, built: evo ? "none" : "both" },
    muzzle: [front + Math.max(0.02, L.barrel), vb],
    barrelR: 0.009,
    under: evo ? null : [front - 0.04, 0.034],
    side: { u: front - 0.04, v: vb - 0.012, x: 0.02 },
  };
}

function pump(b: Builder, L: GunLookData): Anchors {
  const vb = 0.082;
  const top = 0.1;
  const classic = L.stock === "fixed" || L.stock === "wood";
  // The receiver, its loading port, the tube magazine under the barrel and the forend on it.
  b.side("metal", [[-0.06, 0.034], [0.175, 0.034], [0.175, top], [-0.05, top], [-0.065, 0.085]], 0.034);
  b.block("dark", [0.002, 0.02, 0.06], 0.08, 0.075, 0.0175);
  b.block("dark", [0.022, 0.003, 0.07], 0.08, 0.0335);
  triggerGuard(b, 0.032, 0.075, 0.034);
  if (!classic) grip(b, "furniture", 0.012, 0.034, 18);
  const railTop = b.rail(-0.04, 0.165, top);
  const u0 = 0.176;
  b.tube("metal", 0.0118, u0, u0 + L.barrel, vb);
  b.tube("metal", 0.0115, u0, u0 + L.barrel * 0.82, vb - 0.026);
  b.block("metal", [0.012, 0.028, 0.014], u0 + L.barrel * 0.82 - 0.012, vb - 0.013);
  const fu0 = u0 + 0.03;
  const fu1 = fu0 + Math.min(0.17, L.barrel * 0.55);
  const fore = L.fore ?? "pump";
  handguard(b, fore, fu0, fu1, vb - 0.012);
  if (L.stock === "none" && L.barrel < 0.2) b.post("furniture", 0.014, 0.07, (fu0 + fu1) / 2, vb - 0.075);
  // The bead on the muzzle.
  b.post("accent", 0.003, 0.006, u0 + L.barrel - 0.01, vb + 0.014, 0, 8);
  if (classic) classicStock(b, L.stock === "wood" ? "wood" : "furniture", -0.06, top, 0.034);
  else if (L.stock && L.stock !== "none") stock(b, L.stock, -0.06, top - 0.004);
  else b.block("metal", [0.03, 0.04, 0.012], -0.066, 0.07);
  magazine(b, "tube", u0 + 0.14, vb - 0.015);
  return {
    top: { u0: -0.04, u1: 0.165, v: railTop },
    optic: 0.06,
    irons: { line: railTop + 0.024, rear: -0.02, front: 0.148, built: "none" },
    muzzle: [u0 + L.barrel, vb],
    barrelR: 0.0118,
    under: [(fu0 + fu1) / 2, vb - 0.044],
    side: { u: fu1 + 0.03, v: vb, x: 0.016 },
  };
}

function semiShotgun(b: Builder, L: GunLookData): Anchors {
  const box = L.variant === "box";
  const vb = 0.084;
  const top = 0.106;
  b.side("metal", [[-0.065, 0.034], [0.19, 0.034], [0.19, top], [-0.055, top], [-0.07, 0.085]], 0.036);
  b.block("dark", [0.002, 0.022, 0.07], 0.08, 0.078, 0.0185);
  b.block("metal", [0.02, 0.008, 0.012], 0.09, 0.085, 0.024);
  triggerGuard(b, 0.032, 0.075, 0.034);
  grip(b, "furniture", 0.012, 0.034, 16);
  const u0 = 0.19;
  const lh = Math.min(0.24, L.barrel * 0.55);
  const railTop = b.rail(-0.05, box ? u0 + lh - 0.01 : 0.18, top);
  b.tube("metal", 0.0118, u0, u0 + L.barrel, vb);
  if (box) {
    handguard(b, "mlok", u0, u0 + lh, vb, 1.05);
    magazine(b, "308", 0.11, 0.0, "furniture");
  } else {
    b.tube("metal", 0.0115, u0, u0 + L.barrel * 0.8, vb - 0.027);
    handguard(b, "round", u0, u0 + lh, vb - 0.012, 1.25);
    magazine(b, "tube", u0 + 0.12, vb - 0.016);
  }
  stock(b, L.stock ?? "collapsible", -0.065, top - 0.004);
  b.post("accent", 0.003, 0.006, u0 + L.barrel - 0.01, vb + 0.014, 0, 8);
  return {
    top: { u0: -0.05, u1: box ? u0 + lh - 0.01 : 0.18, v: railTop },
    optic: 0.06,
    irons: { line: railTop + 0.024, rear: -0.03, front: box ? u0 + lh - 0.025 : 0.163, built: "none" },
    muzzle: [u0 + L.barrel, vb],
    barrelR: 0.0118,
    under: [u0 + lh * 0.5, vb - 0.04],
    side: { u: u0 + lh * 0.8, v: vb, x: 0.031 },
  };
}

function revolverShotgun(b: Builder, L: GunLookData): Anchors {
  const vb = 0.086;
  const top = 0.13;
  // The frame round a six-shot cylinder, a top strap with its rail, an integral shroud on the barrel.
  b.side("metal", [[-0.06, 0.034], [0.21, 0.034], [0.21, 0.06], [0.03, 0.05], [0.03, top - 0.01], [0.21, top - 0.01], [0.21, top], [-0.05, top], [-0.065, 0.09]], 0.04);
  b.tube("metal", 0.042, 0.04, 0.2, vb - 0.006, 0, 18);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.tube("dark", 0.0035, 0.039, 0.201, vb - 0.006 + Math.sin(a) * 0.04, Math.cos(a) * 0.04, 6);
  }
  triggerGuard(b, 0.032, 0.075, 0.034);
  grip(b, "furniture", 0.012, 0.034, 18);
  const railTop = b.rail(-0.04, 0.2, top);
  b.tube("metal", 0.0125, 0.21, 0.21 + L.barrel, vb);
  b.tube("furniture", 0.024, 0.22, 0.21 + L.barrel - 0.02, vb, 0, 18);
  for (let s = 0.24; s < 0.21 + L.barrel - 0.04; s += 0.03) b.tube("dark", 0.0245, s, s + 0.005, vb, 0, 18);
  stock(b, L.stock ?? "fixed", -0.06, top - 0.004, 0.08);
  magazine(b, "tube", 0.12, vb + 0.03);
  return {
    top: { u0: -0.04, u1: 0.2, v: railTop },
    optic: 0.08,
    irons: { line: railTop + 0.024, rear: -0.02, front: 0.183, built: "none" },
    muzzle: [0.21 + L.barrel, vb],
    barrelR: 0.0125,
    under: [0.21 + L.barrel * 0.4, vb - 0.024],
    side: { u: 0.21 + L.barrel * 0.6, v: vb, x: 0.026 },
  };
}

function double(b: Builder, L: GunLookData): Anchors {
  const vb = 0.078;
  // The action, two barrels one over the other with a rib on top, the wooden forend and stock.
  b.side("metal", [[-0.04, 0.034], [0.1, 0.034], [0.1, 0.112], [-0.03, 0.112], [-0.045, 0.09]], 0.038);
  triggerGuard(b, 0.012, 0.07, 0.034);
  const u0 = 0.1;
  b.tube("metal", 0.0125, u0, u0 + L.barrel, vb);
  b.tube("metal", 0.0125, u0, u0 + L.barrel, vb + 0.026);
  b.block("metal", [0.008, 0.006, L.barrel], u0 + L.barrel / 2, vb + 0.042);
  b.section("wood", [[-0.019, vb - 0.022], [0.019, vb - 0.022], [0.021, vb + 0.004], [-0.021, vb + 0.004]], u0 + 0.01, u0 + 0.22, 0.002);
  classicStock(b, "wood", -0.042, 0.112, 0.034);
  // Just a bead on the rib's end: the eye runs along the rib to it.
  b.post("accent", 0.003, 0.006, u0 + L.barrel - 0.01, vb + 0.048, 0, 8);
  magazine(b, "tube", 0.05, 0.06);
  return {
    top: { u0: 0.0, u1: 0.09, v: 0.112 },
    optic: 0.05,
    irons: { line: vb + 0.051, rear: 0.08, front: u0 + L.barrel - 0.01, built: "both" },
    muzzle: [u0 + L.barrel, vb],
    barrelR: 0.0125,
    under: [u0 + 0.12, vb - 0.022],
    side: { u: u0 + 0.16, v: vb, x: 0.022 },
  };
}

function pistol(b: Builder, L: GunLookData): Anchors {
  const v = L.variant ?? "sig";
  const len = v === "57" ? 0.2 : v === "pmm" ? 0.16 : 0.185;
  const sh = v === "57" ? 0.04 : v === "flat" ? 0.034 : 0.032;
  const rake = v === "1911" ? 18 : v === "flat" || v === "57" ? 20 : 16;
  const s0 = 0.034;
  const s1 = s0 + sh;
  const back = -0.042;
  const front = back + len;
  // The slide: its front rounded or squared, serrations at the back, the ejection port.
  const nose = v === "usp" || v === "pmm" || v === "sig" ? 0.006 : 0.002;
  b.side("metal", [[back, s0], [front, s0], [front, s1 - nose], [front - nose, s1], [back + 0.004, s1], [back, s1 - 0.004]], v === "57" ? 0.03 : 0.026);
  for (let i = 0; i < 7; i++) for (const x of [-1, 1]) b.block("dark", [0.0012, sh * 0.7, 0.0025], back + 0.01 + i * 0.006, s0 + sh * 0.5, x * (v === "57" ? 0.0152 : 0.0132));
  b.block("dark", [0.002, sh * 0.5, 0.045], back + len * 0.55, s0 + sh * 0.6, 0.0132);
  // The frame: the dust cover with its rail, the grip raked back, the trigger guard (squared or round).
  b.side("furniture", [[back + 0.004, 0.034], [front - 0.012, 0.034], [front - 0.012, 0.016], [0.075, 0.012], [0.035, 0.026], [back + 0.01, 0.026]], 0.024);
  b.block("furniture", [0.02, 0.006, 0.05], front - 0.04, 0.013);
  triggerGuard(b, 0.028, 0.072, 0.03, "furniture");
  grip(b, "furniture", 0.0, 0.03, rake, v === "pmm" ? 0.085 : 0.1, 0.038, v === "57" ? 0.032 : 0.029);
  if (v === "1911" || v === "pmm") b.side("metal", [[back - 0.008, s0 + 0.004], [back + 0.002, s0 + 0.004], [back + 0.002, s0 + 0.018], [back - 0.01, s0 + 0.02]], 0.008);
  if (v === "1911") b.side("furniture", [[back - 0.018, 0.034], [back + 0.006, 0.034], [back + 0.004, 0.02], [back - 0.014, 0.026]], 0.022);
  // Its sights: a notch at the back, a post at the front.
  for (const x of [-0.006, 0.006]) b.block("dark", [0.004, 0.006, 0.008], back + 0.012, s1 + 0.003, x);
  b.block("dark", [0.003, 0.006, 0.005], front - 0.01, s1 + 0.003);
  // A barrel just out of the slide.
  b.tube("metal", 0.0075, front - 0.005, front + Math.max(0.004, L.barrel), s0 + sh * 0.45);
  // The magazine up the grip (its base plate out of the bottom; a long one sticks out, an extended mag).
  b.intoMag = true;
  const t = Math.tan(rake * DEG);
  const gl = v === "pmm" ? 0.085 : 0.1;
  const extra = v === "c75" ? 0.06 : 0;
  const base = 0.03 - gl;
  const mu = -t * gl;
  b.side("metal", [[mu - 0.017, base + 0.02], [mu + 0.017, base + 0.02], [mu + 0.017 - t * (0.012 + extra), base - 0.006 - extra], [mu - 0.019 - t * (0.012 + extra), base - 0.006 - extra]], 0.024);
  b.side("dark", [[mu - 0.021 - t * (0.012 + extra), base - 0.006 - extra], [mu + 0.019 - t * (0.012 + extra), base - 0.006 - extra], [mu + 0.019 - t * (0.02 + extra), base - 0.014 - extra], [mu - 0.021 - t * (0.02 + extra), base - 0.014 - extra]], 0.028);
  b.intoMag = false;
  return {
    top: { u0: back + 0.02, u1: back + 0.07, v: s1, slide: true },
    optic: back + 0.045,
    irons: { line: s1 + 0.006, rear: back + 0.012, front: front - 0.01, built: "both" },
    muzzle: [front + Math.max(0.004, L.barrel), s0 + sh * 0.45],
    barrelR: 0.0075,
    under: null,
    side: { u: front - 0.04, v: 0.004, x: 0 },
  };
}

function flare(b: Builder, L: GunLookData): Anchors {
  const vb = 0.07;
  // A fat break-open barrel on a hinge, the frame and hammer, a big trigger guard, the grip.
  b.side("furniture", [[-0.05, 0.03], [0.06, 0.03], [0.06, 0.05], [0.02, 0.08], [-0.035, 0.085], [-0.055, 0.06]], 0.032);
  b.tube("metal", 0.024, 0.04, 0.06 + L.barrel + 0.08, vb, 0, 18);
  b.tube("dark", 0.019, 0.06 + L.barrel + 0.075, 0.06 + L.barrel + 0.081, vb, 0, 18);
  b.pin("metal", 0.007, 0.036, 0.05, vb - 0.022);
  b.side("metal", [[-0.05, 0.075], [-0.035, 0.08], [-0.042, 0.1], [-0.056, 0.098]], 0.008);
  triggerGuard(b, 0.025, 0.085, 0.03, "furniture");
  grip(b, "furniture", 0.0, 0.03, 14, 0.105, 0.04, 0.032);
  magazine(b, "tube", 0.0, 0.06);
  // A blade at the muzzle, a notch over the breech: their tops on the line.
  const line = vb + 0.032;
  b.block("metal", [0.004, 0.009, 0.006], 0.06 + L.barrel + 0.07, line - 0.0045);
  for (const x of [-0.006, 0.006]) b.block("metal", [0.004, 0.009, 0.006], 0.05, line - 0.0045, x);
  return {
    top: { u0: 0.06, u1: 0.06 + L.barrel, v: vb + 0.024, slide: true },
    optic: 0.08,
    irons: { line, rear: 0.05, front: 0.06 + L.barrel + 0.07, built: "both" },
    muzzle: [0.06 + L.barrel + 0.08, vb],
    barrelR: 0.024,
    under: null,
    side: { u: 0.06 + L.barrel * 0.5, v: vb - 0.024, x: 0 },
  };
}

function lmg(b: Builder, L: GunLookData): Anchors {
  const pkp = L.variant === "pkp";
  const vb = 0.09;
  const top = 0.128;
  // The receiver and its feed cover (a rail on it), the heavy barrel (a jacket on a PKP's), the carry handle, a
  // bipod folded under the front.
  b.side("metal", [[-0.07, 0.034], [0.22, 0.034], [0.22, 0.108], [-0.06, 0.108], [-0.075, 0.09]], 0.046);
  b.side("metal", [[-0.05, 0.108], [0.16, 0.108], [0.16, top], [-0.04, top]], 0.05);
  b.block("dark", [0.002, 0.02, 0.07], 0.08, 0.08, 0.0235);
  triggerGuard(b, 0.032, 0.08, 0.034);
  grip(b, "furniture", 0.012, 0.034, 16);
  const railTop = b.rail(-0.04, 0.155, top);
  const u0 = 0.221;
  if (pkp) {
    b.tube("metal", 0.0205, u0, u0 + L.barrel * 0.8, vb, 0, 18);
    for (let s = u0 + 0.02; s < u0 + L.barrel * 0.78; s += 0.02) b.tube("dark", 0.021, s, s + 0.004, vb, 0, 18);
    b.tube("metal", 0.012, u0, u0 + L.barrel, vb);
  } else {
    b.section("furniture", [[-0.028, vb - 0.034], [0.028, vb - 0.034], [0.03, vb + 0.006], [-0.03, vb + 0.006]], u0, u0 + 0.15, 0.002);
    b.tube("metal", 0.013, u0, u0 + L.barrel, vb);
    b.section("metal", [[-0.016, vb + 0.012], [0.016, vb + 0.012], [0.018, vb + 0.03], [-0.018, vb + 0.03]], u0 + 0.15, u0 + L.barrel * 0.7, 0.001);
  }
  // The carry handle over the barrel, the bipod folded.
  const hu = u0 + L.barrel * 0.3;
  // (Folded over to the left, clear of the sight line.)
  b.side("furniture", [[hu - 0.05, vb + 0.022], [hu + 0.05, vb + 0.022], [hu + 0.03, vb + 0.058], [hu - 0.03, vb + 0.058]], 0.014, -0.018, 0.0015, [[[hu - 0.032, vb + 0.028], [hu + 0.032, vb + 0.028], [hu + 0.02, vb + 0.047], [hu - 0.02, vb + 0.047]]]);
  for (const x of [-0.012, 0.012]) b.tube("metal", 0.0055, u0 + L.barrel * 0.55, u0 + L.barrel * 0.95, vb - 0.03, x, 8);
  // Its own front sight, tall over the barrel's end; the rear folds up on the feed cover's rail.
  const line = railTop + 0.024;
  frontPost(b, u0 + L.barrel - 0.03, vb, line);
  stock(b, pkp ? "skeleton" : L.stock ?? "fixed", -0.07, top - 0.01, 0.07);
  magazine(b, L.mag ?? "box", 0.11, 0.034);
  return {
    top: { u0: -0.04, u1: 0.155, v: railTop },
    optic: 0.06,
    irons: { line, rear: -0.02, front: u0 + L.barrel - 0.03, built: "front" },
    muzzle: [u0 + L.barrel, vb],
    barrelR: pkp ? 0.012 : 0.013,
    under: pkp ? [u0 + 0.06, vb - 0.022] : [u0 + 0.08, vb - 0.034],
    side: { u: u0 + 0.1, v: vb - 0.01, x: pkp ? 0.023 : 0.032 },
  };
}

const BASES: Record<GunLookData["base"], (b: Builder, L: GunLookData) => Anchors> = {
  ar,
  ak,
  bullpup,
  chassis,
  smg,
  mpistol,
  pump,
  semi_shotgun: semiShotgun,
  revolver_shotgun: revolverShotgun,
  double,
  pistol,
  flare,
  lmg,
};

// ---------------------------------------------------------------------------------------------------------------------
// Attachments

/**
 * A sight on the top rail (or a pistol's slide) at its optic place; returns the sight line's height. A red dot's or
 * a holographic sight's window is open along the barrel (the eye looks through it; its reticle is drawn on screen); a
 * scope is closed (at full magnification the scope view replaces the gun).
 */
function optic(b: Builder, kind: string, a: Anchors): number | null {
  const u = a.optic;
  const v = a.top.v;
  if (kind === "nonmag") {
    if (a.top.slide) {
      // A mini red dot on the slide: a low body, and a hood round its window.
      b.block("attach", [0.026, 0.01, 0.04], u, v + 0.005);
      b.section("attach", [[-0.013, v + 0.01], [0.013, v + 0.01], [0.013, v + 0.028], [0.009, v + 0.032], [-0.009, v + 0.032], [-0.013, v + 0.028]], u + 0.006, u + 0.02, 0.0006, [[[-0.01, v + 0.013], [0.01, v + 0.013], [0.01, v + 0.027], [-0.01, v + 0.027]]]);
      return v + 0.02;
    }
    // A holographic sight: a base clamped on the rail, the hood round its window at the front, the battery
    // compartment low at the back (under the sight line), a knob on its side.
    b.block("attach", [0.03, 0.01, 0.075], u, v + 0.005);
    b.section("attach", [[-0.017, v + 0.01], [0.017, v + 0.01], [0.017, v + 0.048], [0.012, v + 0.053], [-0.012, v + 0.053], [-0.017, v + 0.048]], u - 0.004, u + 0.034, 0.001, [[[-0.0135, v + 0.016], [0.0135, v + 0.016], [0.0135, v + 0.047], [-0.0135, v + 0.047]]]);
    b.block("attach", [0.03, 0.012, 0.03], u - 0.021, v + 0.016);
    b.pin("attach", 0.006, 0.01, u - 0.02, v + 0.016, 0.02);
    return v + 0.0315;
  }
  if (kind === "magnified") {
    // A compact prism scope: its body on a mount, a bell at the front, the eyepiece, the fibre on top.
    b.block("attach", [0.024, 0.012, 0.07], u, v + 0.006);
    b.tube("attach", 0.019, u - 0.065, u + 0.05, v + 0.036, 0, 18, 0.021);
    b.tube("attach", 0.026, u + 0.05, u + 0.085, v + 0.036, 0, 18);
    b.tube("glass", 0.021, u + 0.084, u + 0.086, v + 0.036, 0, 18);
    b.tube("attach", 0.02, u - 0.08, u - 0.064, v + 0.036, 0, 18);
    b.tube("glass", 0.016, u - 0.0815, u - 0.0795, v + 0.036, 0, 18);
    b.block("accent", [0.006, 0.005, 0.06], u, v + 0.058);
    return v + 0.036;
  }
  if (kind === "telescopic") {
    // A long scope on two rings: the main tube, turrets, the objective bell and the eyepiece.
    for (const du of [-0.04, 0.05]) {
      b.block("attach", [0.024, 0.012, 0.018], u + du, v + 0.006);
      b.tube("attach", 0.018, u + du - 0.009, u + du + 0.009, v + 0.042, 0, 16);
    }
    b.tube("attach", 0.0155, u - 0.1, u + 0.13, v + 0.042, 0, 18);
    b.tube("attach", 0.016, u + 0.13, u + 0.17, v + 0.042, 0, 18, 0.026);
    b.tube("attach", 0.026, u + 0.17, u + 0.2, v + 0.042, 0, 18);
    b.tube("glass", 0.022, u + 0.199, u + 0.201, v + 0.042, 0, 18);
    b.tube("attach", 0.016, u - 0.13, u - 0.1, v + 0.042, 0, 18, 0.019);
    b.tube("glass", 0.0165, u - 0.1315, u - 0.1295, v + 0.042, 0, 18);
    b.post("attach", 0.011, 0.024, u + 0.005, v + 0.066);
    b.pin("attach", 0.011, 0.024, u + 0.005, v + 0.042, 0.026);
    return v + 0.042;
  }
  return null;
}

/** A muzzle device on the barrel's end; returns where the muzzle is now (u). */
function muzzleDevice(b: Builder, kind: string | null, a: Anchors, kit: GunKit): number {
  const [u, v] = a.muzzle;
  const r = a.barrelR;
  if (!kind) {
    b.tube("metal", r * 1.15, u - 0.006, u, v);
    return u;
  }
  const len = kit.barrels[kind as keyof GunKit["barrels"]]?.length ?? 0.05;
  const R = Math.max(r * 1.2, kit.barrels[kind as keyof GunKit["barrels"]]?.radius ?? r * 1.5);
  if (kind === "suppressor") {
    b.tube("attach", R, u, u + len, v, 0, 20);
    b.tube("attach", R * 0.82, u - 0.01, u, v, 0, 20);
    b.tube("dark", R * 0.3, u + len, u + len + 0.002, v, 0, 12);
    for (let s = u + 0.02; s < u + len - 0.015; s += 0.03) b.tube("dark", R + 0.0006, s, s + 0.003, v, 0, 20);
  } else if (kind === "flash_hider") {
    b.tube("attach", R, u, u + len, v, 0, 14);
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.block("dark", [0.003, 0.003, len * 0.6], u + len * 0.65, v + Math.sin(ang) * R * 0.98, Math.cos(ang) * R * 0.98);
    }
  } else if (kind === "compensator") {
    b.section("attach", [[-R, v - R * 0.8], [R, v - R * 0.8], [R, v + R * 0.8], [-R, v + R * 0.8]], u, u + len, 0.001);
    for (let i = 0; i < 3; i++) b.block("dark", [R * 1.2, 0.002, 0.006], u + 0.01 + i * 0.012, v + R * 0.8);
  } else if (kind === "muzzle_brake") {
    b.tube("attach", R, u, u + len, v, 0, 16);
    for (let i = 0; i < 3; i++) for (const x of [-1, 1]) b.block("dark", [0.004, R * 0.9, 0.008], u + 0.01 + i * 0.014, v, x * R * 0.92);
  } else if (kind === "extended_barrel") {
    b.tube("metal", r, u, u + len, v);
    b.tube("attach", r * 1.3, u + len - 0.014, u + len, v);
  } else b.tube("attach", R, u, u + len, v);
  return u + len;
}

/** A grip under the handguard. */
function foregrip(b: Builder, kind: string, at: P): void {
  const [u, v] = at;
  if (kind === "vertical") {
    b.block("attach", [0.022, 0.012, 0.04], u, v - 0.006);
    b.post("attach", 0.014, 0.07, u, v - 0.047, 0, 14, 0.015);
    b.post("attach", 0.016, 0.01, u, v - 0.085, 0, 14);
  } else if (kind === "angled") {
    b.side("attach", [[u - 0.04, v], [u + 0.035, v], [u + 0.035, v - 0.01], [u - 0.015, v - 0.04], [u - 0.04, v - 0.012]], 0.024);
  } else {
    b.side("attach", [[u - 0.03, v], [u + 0.03, v], [u + 0.032, v - 0.014], [u + 0.02, v - 0.02], [u - 0.03, v - 0.01]], 0.02);
  }
}

// ---------------------------------------------------------------------------------------------------------------------

/** A weapon's look: its own (by id), else its class's. */
export function lookOf(look: GunLook, kit: GunKit = loadPresentationData().gunKit): GunLookData {
  return (look.id ? kit.weapons[look.id] : undefined) ?? kit.byClass[look.class as keyof GunKit["byClass"]] ?? kit.byClass.assault_rifle;
}

export function buildGun(look: GunLook, kit: GunKit = loadPresentationData().gunKit): GunModel {
  const L = lookOf(look, kit);
  const b = new Builder();
  const a = BASES[L.base](b, L);
  // The sight: an optic on the rail (folding the flip-ups away), else the irons.
  const pick = look.pick;
  const sightKind = pick.sight && pick.sight !== "iron" ? pick.sight : null;
  const opticV = sightKind ? optic(b, sightKind, a) : null;
  let sightV: number;
  let sightU: number;
  let reticle: GunModel["reticle"] = "posts";
  if (opticV !== null && sightKind) {
    sightV = opticV;
    sightU = a.optic;
    const s = kit.sights[sightKind as keyof GunKit["sights"]];
    reticle = s && "reticle" in s ? s.reticle : "dot";
  } else {
    // The irons: flip-ups on the rail for what the base didn't build itself.
    if (a.irons.built !== "both") rearAperture(b, a.irons.rear, a.top.v, a.irons.line);
    if (a.irons.built === "none") frontFlip(b, a.irons.front, a.top.v, a.irons.line);
    sightV = a.irons.line;
    sightU = a.irons.rear;
  }
  const muzzleU = muzzleDevice(b, pick.barrel, a, kit);
  if (pick.grip && a.under) foregrip(b, pick.grip, a.under);
  let laser: THREE.Vector3 | null = null;
  if (pick.underbarrel === "laser" && a.side) {
    const s = a.side;
    // On the right side rail, or (a pistol's) under the dust cover.
    if (s.x > 0) {
      b.block("attach", [0.02, 0.022, 0.048], s.u, s.v, s.x + 0.01);
      b.tube("glass", 0.006, s.u + 0.024, s.u + 0.026, s.v, s.x + 0.01, 10);
      laser = new THREE.Vector3(s.x + 0.01, s.v, -(s.u + 0.026));
    } else {
      b.block("attach", [0.022, 0.022, 0.044], s.u, s.v - 0.012);
      b.tube("glass", 0.006, s.u + 0.022, s.u + 0.024, s.v - 0.012, 0, 10);
      laser = new THREE.Vector3(0, s.v - 0.012, -(s.u + 0.024));
    }
  }

  // The parts merged by material (made as they're needed, by the finish); the magazine its own group.
  const f = FINISHES[L.finish];
  const looks: Record<Mat, THREE.MeshStandardMaterialParameters> = {
    metal: { color: f.metal, metalness: f.metalness, roughness: f.metalRough },
    furniture: { color: f.furniture, metalness: 0.05, roughness: f.furnRough },
    wood: { color: "#7a4f2c", metalness: 0, roughness: 0.48 },
    attach: { color: kit.colors.attachment, metalness: 0.3, roughness: 0.5 },
    dark: { color: "#17191c", metalness: 0.1, roughness: 0.75 },
    glass: { color: "#0d2230", metalness: 0.4, roughness: 0.06, emissive: "#03080c" },
    accent: { color: "#c9c3a8", metalness: 0.8, roughness: 0.3 },
  };
  const mats = new Map<Mat, THREE.Material>();
  const all: THREE.Material[] = [];
  const matOf = (m: Mat) => {
    let x = mats.get(m);
    if (!x) {
      x = new THREE.MeshStandardMaterial(looks[m]);
      mats.set(m, x);
      all.push(x);
    }
    return x;
  };
  const geoms: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  const scale = L.scale ?? 1;
  let triangles = 0;
  const meshes = (parts: Map<Mat, THREE.BufferGeometry[]>, into: THREE.Object3D) => {
    for (const [m, list] of parts) {
      const g = mergeGeometries(list, false);
      for (const p of list) p.dispose();
      if (!g) continue;
      g.scale(scale, scale, scale);
      geoms.push(g);
      triangles += g.getAttribute("position").count / 3;
      into.add(new THREE.Mesh(g, matOf(m)));
    }
  };
  meshes(b.parts, group);
  const mag = new THREE.Group();
  mag.name = "magazine";
  meshes(b.magParts, mag);
  group.add(mag);
  if (laser) {
    // Its emitter, lit.
    const lit = new THREE.MeshBasicMaterial({ color: kit.colors.laser });
    all.push(lit);
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.004), lit);
    dot.position.copy(laser).multiplyScalar(scale);
    geoms.push(dot.geometry);
    group.add(dot);
  }
  return {
    group,
    sight: new THREE.Vector3(0, sightV, -sightU).multiplyScalar(scale),
    muzzle: new THREE.Vector3(0, a.muzzle[1], -muzzleU).multiplyScalar(scale),
    mag,
    magHome: mag.position.clone(),
    laser: laser ? laser.multiplyScalar(scale) : null,
    reticle,
    triangles,
    dispose() {
      group.removeFromParent();
      for (const g of geoms) g.dispose();
      for (const m of all) m.dispose();
    },
  };
}

/** A key that changes whenever the model would (a different weapon or attachments). */
export const gunKey = (look: GunLook) => `${look.id ?? ""}|${look.class}|${look.pick.sight}|${look.pick.barrel}|${look.pick.grip}|${look.pick.underbarrel}`;
