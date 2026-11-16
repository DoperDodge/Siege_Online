// Your own arms in first person (Phase 10 M9, render/DESIGN.md §12): two gloved hands and the sleeves behind them,
// built in code (loft.ts) and dressed as the operator is (their sleeves, skin and gloves). A hand is a rigid shape in
// one of a few poses (closed round a grip, cupped under a handguard, holding something or its edge, flat, a fist) placed by a
// frame the viewmodel gives it (on the gun's grip, under its handguard, on a magazine, round a knife or a gadget);
// the forearm runs from the wrist back out of the picture toward where the shoulder would be, and the upper arm on
// from the elbow. All in the viewmodel's camera space; nothing here plays.
//
// A hand's frame: its origin the wrist, y along the fingers, z out of the back of the hand (the palm faces −z), x
// across the palm (a right hand's thumb on the −x side; a left hand is its mirror, its thumb on +x).
import * as THREE from "three";
import type { OperatorLook } from "@redmond/shared";
import { ringY, Shaper, type V3 } from "./loft.js";

export type HandPose = "grip" | "fore" | "hold" | "edge" | "flat" | "fist";
export type Side = "left" | "right";

/** Where what a hand is closed round passes it, in the hand's frame (the middle of the palm, a grip's depth off it). */
export const PALM = { x: 0, y: 0.052, z: -0.03 } as const;
/** The palm's own surface there (for something lying on it). */
export const PALM_SURFACE_Z = -0.019;

/** The forearm (elbow to wrist) and the upper arm as modelled (m). */
const FOREARM_M = 0.28;
const UPPER_M = 0.3;
const DEG = Math.PI / 180;

/** Each finger's knuckle (x across the palm, y from the wrist), its three bones' lengths and its thickness. */
const FINGERS: { x: number; y: number; len: [number, number, number]; r: number }[] = [
  { x: -0.031, y: 0.1, len: [0.036, 0.023, 0.02], r: 0.0105 },
  { x: -0.0105, y: 0.103, len: [0.04, 0.026, 0.021], r: 0.0108 },
  { x: 0.0105, y: 0.1, len: [0.037, 0.024, 0.02], r: 0.0105 },
  { x: 0.03, y: 0.093, len: [0.029, 0.019, 0.018], r: 0.0096 },
];

/** A pose: each finger's three joints' bends (degrees, toward the palm), and the thumb's three bones' directions. */
interface PoseShape {
  curl: [number, number, number][];
  thumb: [V3, V3, V3];
}

const wrap: [number, number, number] = [62, 78, 52];
const POSES: Record<HandPose, PoseShape> = {
  // Closed round a grip that runs across the palm: the index finger laid straight along the frame over the trigger,
  // the thumb round the back of it and forward along its far side.
  grip: { curl: [[10, 12, 8], wrap, wrap, [66, 80, 54]], thumb: [[-0.25, 0.35, -0.9], [0.1, 0.85, -0.5], [0.15, 0.97, -0.15]] },
  // Cupped under a handguard, the fingers round its far side, the thumb forward along its near side (nothing of the
  // hand over the rail: it would stand in the sights).
  fore: { curl: [[40, 66, 52], [40, 66, 52], [42, 68, 52], [44, 70, 54]], thumb: [[-0.6, 0.15, -0.78], [-0.9, 0.2, -0.35], [-0.97, 0.2, -0.1]] },
  // Holding something a few centimetres thick between the fingers and the thumb (a magazine, a grenade, a tablet's edge).
  hold: { curl: [[30, 40, 25], [32, 42, 26], [34, 44, 27], [36, 46, 28]], thumb: [[-0.45, 0.45, -0.77], [0, 0.6, -0.8], [0.2, 0.8, -0.55]] },
  // Holding a flat thing by its edge (a tablet, a sensor): fingers behind it, the thumb up along its face's edge.
  edge: { curl: [[28, 36, 22], [30, 38, 24], [32, 40, 25], [34, 42, 26]], thumb: [[-0.75, 0.6, -0.2], [-0.35, 0.92, -0.1], [-0.15, 0.98, -0.05]] },
  flat: { curl: [[6, 8, 6], [5, 8, 6], [6, 9, 6], [8, 10, 7]], thumb: [[-0.8, 0.55, -0.2], [-0.6, 0.78, -0.15], [-0.5, 0.85, -0.1]] },
  fist: { curl: [[80, 95, 70], [82, 96, 70], [84, 96, 70], [86, 96, 70]], thumb: [[-0.3, 0.5, -0.8], [0.5, 0.5, -0.7], [0.8, 0.2, -0.55]] },
};

/** A right hand in a pose (a left one: mirrored by the caller). */
function handParts(s: Shaper, look: OperatorLook, pose: HandPose): void {
  const shape = POSES[pose];
  s.paint(look.gloves, 0.72);
  // The palm, wrist to knuckles, and the heel of the thumb.
  s.loft([ringY(-0.012, 0.029, 0.02, { n: 2.6 }), ringY(0.025, 0.042, 0.021, { n: 3 }), ringY(0.072, 0.046, 0.019, { n: 3 }), ringY(0.102, 0.044, 0.0135, { n: 3 })], 14, true, true);
  s.ball([-0.03, 0.032, -0.008], [0.02, 0.03, 0.017], 10, 5);
  // A stiffened panel over the knuckles and a strap across the wrist, darker.
  s.paint(look.gear, 0.5);
  s.box([0, 0.092, 0.0165], [0.082, 0.026, 0.01], 4, 0.004);
  s.box([0, 0.012, 0.0195], [0.05, 0.02, 0.006], 4, 0.002);
  s.paint(look.gloves, 0.72);
  FINGERS.forEach((f, i) => {
    let at = new THREE.Vector3(f.x, f.y, 0);
    let bend = 0;
    s.ball([at.x, at.y, at.z], f.r * 1.08, 8, 4);
    for (let k = 0; k < 3; k++) {
      bend += shape.curl[i][k] * DEG;
      const next = at.clone().add(new THREE.Vector3(0, Math.cos(bend), -Math.sin(bend)).multiplyScalar(f.len[k]));
      const r0 = f.r * (1 - 0.07 * k);
      const r1 = f.r * (1 - 0.07 * (k + 1));
      s.bar([at.x, at.y, at.z], [next.x, next.y, next.z], r0, r1, 8, false);
      s.ball([next.x, next.y, next.z], r1 * 1.02, 8, 4);
      at = next;
    }
  });
  let at = new THREE.Vector3(-0.036, 0.026, -0.006);
  const lens = [0.042, 0.034, 0.028];
  s.ball([at.x, at.y, at.z], 0.0135, 8, 4);
  shape.thumb.forEach((d, k) => {
    const next = at.clone().add(new THREE.Vector3(d[0], d[1], d[2]).normalize().multiplyScalar(lens[k]));
    s.bar([at.x, at.y, at.z], [next.x, next.y, next.z], 0.0128 - 0.001 * k, 0.0122 - 0.001 * k, 8, false);
    s.ball([next.x, next.y, next.z], 0.0124 - 0.001 * k, 8, 4);
    at = next;
  });
}

/** The forearm, elbow (the origin) to wrist along y: the sleeve (or the bare arm), a glove's cuff, the wrist. */
function forearmParts(s: Shaper, look: OperatorLook): void {
  const bare = look.sleeves === "short";
  s.paint(bare ? look.skin : look.uniform, bare ? 0.7 : 0.88);
  s.ball([0, 0, 0], 0.054, 12, 6);
  s.loft([ringY(0, 0.053, 0.054), ringY(0.08, 0.05, 0.051), ringY(0.2, 0.039, 0.04), ringY(0.25, 0.034, 0.035)], 14);
  s.paint(look.gloves, 0.72);
  s.loft([ringY(0.214, 0.039, 0.04), ringY(0.22, 0.042, 0.043), ringY(0.262, 0.039, 0.04), ringY(0.268, 0.033, 0.034)], 14);
  s.ball([0, FOREARM_M, 0], 0.032, 10, 5);
}

/** The upper arm, shoulder (the origin) to elbow along y: its sleeve. */
function upperParts(s: Shaper, look: OperatorLook): void {
  s.paint(look.uniform, 0.88);
  s.loft([ringY(0, 0.066, 0.068), ringY(0.12, 0.062, 0.064), ringY(UPPER_M, 0.054, 0.055)], 14);
}

/** A geometry mirrored across x (a right hand's into a left's): positions and normals flipped, triangles turned over. */
function mirrored(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone();
  for (const name of ["position", "normal"]) {
    const a = m.getAttribute(name);
    for (let i = 0; i < a.count; i++) a.setX(i, -a.getX(i));
  }
  const index = m.getIndex()!;
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
  return m;
}

/** The material the arms share with nothing else: colours and roughness from the vertices (as a body's). */
function armMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.name = "fp-arms";
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float aRough;\nvarying float vArmRough;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvArmRough = aRough;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vArmRough;")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor *= vArmRough;");
  };
  m.customProgramCacheKey = () => "fp-arms";
  return m;
}

/**
 * A hand's frame from what it holds: `axis` is the way the hand's x runs (along a grip, a handguard, a handle),
 * `fingers` the way its fingers point (made square to the axis), and `at` where the hand's point `palm` goes.
 */
export function handFrame(out: THREE.Matrix4, at: THREE.Vector3, axis: THREE.Vector3, fingers: THREE.Vector3, palm: { x: number; y: number; z: number } = PALM): THREE.Matrix4 {
  const x = axis.clone().normalize();
  const y = fingers.clone().addScaledVector(x, -fingers.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  out.makeBasis(x, y, z);
  return out.setPosition(at.clone().addScaledVector(x, -palm.x).addScaledVector(y, -palm.y).addScaledVector(z, -palm.z));
}

interface Arm {
  side: Side;
  hands: Record<HandPose, THREE.Mesh>;
  fore: THREE.Mesh;
  upper: THREE.Mesh;
  /** Where the hand is (its frame in camera space), or null: the arm isn't drawn. */
  frame: THREE.Matrix4 | null;
  pose: HandPose;
}

const A = new THREE.Vector3();
const B = new THREE.Vector3();
const X = new THREE.Vector3();
const Y = new THREE.Vector3();
const Z = new THREE.Vector3();

/** A bone's matrix: at `from`, its y toward `to`, stretched to reach it from `len`. */
function span(out: THREE.Matrix4, from: THREE.Vector3, to: THREE.Vector3, len: number): void {
  Y.subVectors(to, from);
  const d = Math.max(1e-5, Y.length());
  Y.divideScalar(d);
  X.set(1, 0, 0).addScaledVector(Y, -Y.x);
  if (X.lengthSq() < 1e-6) X.set(0, 0, 1).addScaledVector(Y, -Y.z);
  X.normalize();
  Z.crossVectors(X, Y);
  out.makeBasis(X, Y, Z).scale(A.set(1, d / len, 1)).setPosition(from);
}

export class FpArms {
  readonly group = new THREE.Group();
  private readonly material = armMaterial();
  private arms: Arm[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private lookKey = "";
  /** The triangles of what's built (both arms, every pose). */
  triangles = 0;

  constructor(look: OperatorLook) {
    this.group.name = "fp-arms";
    this.setLook(look);
  }

  /** Dress the arms as an operator (their sleeves, skin and gloves): rebuilt when it changes. */
  setLook(look: OperatorLook): void {
    const key = [look.uniform, look.skin, look.gloves, look.gear, look.sleeves].join("|");
    if (key === this.lookKey) return;
    this.lookKey = key;
    const was = this.arms;
    this.clear();
    const part = (build: (s: Shaper) => void): THREE.BufferGeometry => {
      const s = new Shaper();
      build(s);
      this.triangles += s.triangles;
      const g = s.geometry(false);
      this.geometries.push(g);
      return g;
    };
    const mesh = (g: THREE.BufferGeometry, name: string): THREE.Mesh => {
      const m = new THREE.Mesh(g, this.material);
      m.name = name;
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      m.visible = false;
      this.group.add(m);
      return m;
    };
    const fore = part((s) => forearmParts(s, look));
    const upper = part((s) => upperParts(s, look));
    const right = Object.fromEntries((Object.keys(POSES) as HandPose[]).map((p) => [p, part((s) => handParts(s, look, p))])) as Record<HandPose, THREE.BufferGeometry>;
    for (const side of ["left", "right"] as const) {
      const hands = Object.fromEntries(
        (Object.keys(POSES) as HandPose[]).map((p) => {
          const g = side === "right" ? right[p] : mirrored(right[p]);
          if (side === "left") this.geometries.push(g);
          return [p, mesh(g, `hand-${side}-${p}`)];
        }),
      ) as Record<HandPose, THREE.Mesh>;
      const before = was.find((a) => a.side === side);
      this.arms.push({ side, hands, fore: mesh(fore, `forearm-${side}`), upper: mesh(upper, `upper-arm-${side}`), frame: before?.frame ?? null, pose: before?.pose ?? "flat" });
    }
  }

  /** Where a hand is (its frame in camera space) and how it's closed; null: that arm isn't drawn. */
  setHand(side: Side, frame: THREE.Matrix4 | null, pose: HandPose = "flat"): void {
    const arm = this.arms.find((a) => a.side === side)!;
    arm.frame = frame ? (arm.frame ?? new THREE.Matrix4()).copy(frame) : null;
    arm.pose = pose;
  }

  /** A hand's frame as last set (tests, and what follows a hand: a magazine in it). */
  hand(side: Side): THREE.Matrix4 | null {
    return this.arms.find((a) => a.side === side)!.frame;
  }

  /** Place the meshes: each hand at its frame; its forearm from the wrist back and down out of the picture; the upper arm on to the shoulder. */
  update(): void {
    for (const arm of this.arms) {
      const on = arm.frame !== null;
      for (const [pose, m] of Object.entries(arm.hands)) m.visible = on && pose === arm.pose;
      arm.fore.visible = arm.upper.visible = on;
      if (!arm.frame) continue;
      const dir = arm.side === "left" ? -1 : 1;
      arm.hands[arm.pose].matrix.copy(arm.frame);
      const wrist = A.setFromMatrixPosition(arm.frame).clone();
      // The shoulder is behind, below and to its side of the eye; the elbow a forearm's length from the wrist toward a
      // point under it (so the arm comes up into the picture from its lower corner, never across the view).
      const shoulder = new THREE.Vector3(dir * 0.21, -0.27, 0.18);
      const toward = B.copy(shoulder).add(new THREE.Vector3(dir * 0.1, -0.22, -0.12)).sub(wrist);
      if (toward.lengthSq() < 1e-6) toward.set(dir * 0.3, -0.6, 0.7);
      const elbow = wrist.clone().addScaledVector(toward.normalize(), FOREARM_M);
      span(arm.fore.matrix, elbow, wrist, FOREARM_M);
      span(arm.upper.matrix, shoulder, elbow, UPPER_M);
      arm.fore.matrixWorldNeedsUpdate = arm.upper.matrixWorldNeedsUpdate = arm.hands[arm.pose].matrixWorldNeedsUpdate = true;
    }
  }

  private clear(): void {
    for (const arm of this.arms) for (const m of [...Object.values(arm.hands), arm.fore, arm.upper]) this.group.remove(m);
    for (const g of this.geometries) g.dispose();
    this.arms = [];
    this.geometries = [];
    this.triangles = 0;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
    this.material.dispose();
  }
}
