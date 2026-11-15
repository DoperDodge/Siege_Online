// A dead body falls (Phase 10 M8, render/DESIGN.md §11): its joints become points that fall under gravity, held at
// their lengths (the limbs' bones, the trunk braced stiff, the neck a little loose), landing on the floor under where
// it died. It starts from the pose it died in, moving as it was, and lies still after a few seconds. Drawn only: the
// simulation keeps a dead body where it died, and the dead block nothing and stop no bullets (D-058).
import * as THREE from "three";
import { BodyRig, LEN } from "./bodyRig.js";

const JOINTS = ["head", "neck", "chest", "pelvis", "shoulderL", "shoulderR", "elbowL", "elbowR", "handL", "handR", "hipL", "hipR", "kneeL", "kneeR", "ankleL", "ankleR"] as const;
type Joint = (typeof JOINTS)[number];
const AT = Object.fromEntries(JOINTS.map((n, i) => [n, i])) as Record<Joint, number>;

/** How far over the floor each joint's middle rests (its part's thickness). */
const RADIUS: Record<Joint, number> = {
  head: 0.105,
  neck: 0.07,
  chest: 0.12,
  pelvis: 0.11,
  shoulderL: 0.075,
  shoulderR: 0.075,
  elbowL: 0.05,
  elbowR: 0.05,
  handL: 0.045,
  handR: 0.045,
  hipL: 0.1,
  hipR: 0.1,
  kneeL: 0.07,
  kneeR: 0.07,
  ankleL: 0.075,
  ankleR: 0.075,
};

/** The trunk as it stands (the hitboxes' proportions), which a fallen body's goes back to: metres from the pelvis. */
const TRUNK: Partial<Record<Joint, [number, number, number]>> = {
  pelvis: [0, 0, 0],
  chest: [0, 0.468, 0],
  neck: [0, 0.508, 0],
  head: [0, 0.714, -0.02],
  shoulderL: [-0.2, 0.468, 0],
  shoulderR: [0.2, 0.468, 0],
  hipL: [-0.11, 0, 0],
  hipR: [0.11, 0, 0],
};

interface Stick {
  a: number;
  b: number;
  len: number;
  /** How much of its error a pass takes out: 1 a bone … less a soft tie. */
  k: number;
  /** Only keeps its ends apart (a limb doesn't fold flat on itself). */
  min?: boolean;
}

const trunkLen = (a: Joint, b: Joint) => Math.hypot(TRUNK[a]![0] - TRUNK[b]![0], TRUNK[a]![1] - TRUNK[b]![1], TRUNK[a]![2] - TRUNK[b]![2]);
const STICKS: Stick[] = [];
const tie = (a: Joint, b: Joint, len = trunkLen(a, b), k = 1, min = false) => STICKS.push({ a: AT[a], b: AT[b], len, k, min });
// The trunk, braced: the pelvis, the hips, the chest and the shoulders move as one piece.
for (const [a, b] of [
  ["pelvis", "chest"],
  ["pelvis", "hipL"],
  ["pelvis", "hipR"],
  ["hipL", "hipR"],
  ["chest", "shoulderL"],
  ["chest", "shoulderR"],
  ["shoulderL", "shoulderR"],
  ["shoulderL", "hipL"],
  ["shoulderR", "hipR"],
  ["shoulderL", "hipR"],
  ["shoulderR", "hipL"],
  ["shoulderL", "pelvis"],
  ["shoulderR", "pelvis"],
  ["hipL", "chest"],
  ["hipR", "chest"],
  ["chest", "neck"],
  ["neck", "shoulderL"],
  ["neck", "shoulderR"],
  ["neck", "pelvis"],
] as [Joint, Joint][])
  tie(a, b);
// The head on its neck, loosely held over the shoulders.
tie("neck", "head");
tie("head", "shoulderL", undefined, 0.25);
tie("head", "shoulderR", undefined, 0.25);
tie("head", "chest", undefined, 0.25);
// The limbs, and how near their ends may fold.
for (const side of ["L", "R"] as const) {
  tie(`shoulder${side}`, `elbow${side}`, LEN.upperArm);
  tie(`elbow${side}`, `hand${side}`, LEN.foreArm);
  tie(`hip${side}`, `knee${side}`, LEN.thigh);
  tie(`knee${side}`, `ankle${side}`, LEN.shin);
  tie(`shoulder${side}`, `hand${side}`, 0.22, 1, true);
  tie(`hip${side}`, `ankle${side}`, 0.4, 1, true);
}
// Knees and ankles stay a little apart, the hands off the chest's middle.
tie("kneeL", "kneeR", 0.14, 1, true);
tie("ankleL", "ankleR", 0.14, 1, true);
tie("handL", "chest", 0.16, 1, true);
tie("handR", "chest", 0.16, 1, true);

const STEP_S = 1 / 60;
const GRAVITY = -9.81;
/** How much of its speed a point keeps a step (the air, its joints' stiffness), and along the floor while on it. */
const DRAG = 0.992;
const FLOOR_GRIP = 0.55;
const PASSES = 8;
/** Seconds until it lies still. */
const SETTLE_S = 5;

export class Ragdoll {
  private readonly p = new Float64Array(JOINTS.length * 3);
  private readonly prev = new Float64Array(JOINTS.length * 3);
  private age = 0;
  private owed = 0;

  /**
   * From a body's joints as it died, moving at `vel` (m/s), its upper body pushed by `push` (m/s: what tips it over);
   * `floorY` is the floor under it.
   */
  constructor(joints: BodyRig["joints"], vel: THREE.Vector3, push: THREE.Vector3, private readonly floorY: number) {
    JOINTS.forEach((name, i) => {
      const j = joints[name];
      const high = name === "head" || name === "neck" || name === "chest" || name.startsWith("shoulder") ? 1 : name === "pelvis" || name.startsWith("hip") ? 0.3 : 0;
      this.p.set([j.x, j.y, j.z], i * 3);
      this.prev.set([j.x - (vel.x + push.x * high) * STEP_S, j.y - (vel.y + push.y * high) * STEP_S, j.z - (vel.z + push.z * high) * STEP_S], i * 3);
    });
  }

  /** Still (it stopped stepping). */
  get asleep(): boolean {
    return this.age >= SETTLE_S;
  }

  /** Advance by dt seconds (in fixed steps). */
  step(dt: number): void {
    if (this.asleep) return;
    this.owed += Math.min(dt, 0.1);
    while (this.owed >= STEP_S && !this.asleep) {
      this.owed -= STEP_S;
      this.age += STEP_S;
      this.tick();
    }
  }

  private tick(): void {
    const { p, prev } = this;
    const n = JOINTS.length;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const floor = this.floorY + RADIUS[JOINTS[i]];
      const down = p[o + 1] <= floor + 1e-3;
      const grip = down ? FLOOR_GRIP : DRAG;
      const vx = (p[o] - prev[o]) * grip;
      const vy = (p[o + 1] - prev[o + 1]) * DRAG + GRAVITY * STEP_S * STEP_S;
      const vz = (p[o + 2] - prev[o + 2]) * grip;
      prev[o] = p[o];
      prev[o + 1] = p[o + 1];
      prev[o + 2] = p[o + 2];
      p[o] += vx;
      p[o + 1] += vy;
      p[o + 2] += vz;
    }
    for (let pass = 0; pass < PASSES; pass++) {
      for (const s of STICKS) {
        const a = s.a * 3;
        const b = s.b * 3;
        const dx = p[b] - p[a];
        const dy = p[b + 1] - p[a + 1];
        const dz = p[b + 2] - p[a + 2];
        const d = Math.hypot(dx, dy, dz);
        if (d < 1e-9 || (s.min && d >= s.len)) continue;
        const f = ((d - s.len) / d) * 0.5 * s.k;
        p[a] += dx * f;
        p[a + 1] += dy * f;
        p[a + 2] += dz * f;
        p[b] -= dx * f;
        p[b + 1] -= dy * f;
        p[b + 2] -= dz * f;
      }
      for (let i = 0; i < n; i++) {
        const floor = this.floorY + RADIUS[JOINTS[i]];
        if (p[i * 3 + 1] < floor) p[i * 3 + 1] = floor;
      }
    }
  }

  /** The joints into the rig, and its bones from them. */
  write(rig: BodyRig): void {
    const j = rig.joints;
    JOINTS.forEach((name, i) => j[name].set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]));
    rig.axes();
    // The head faces as the chest does, its top away from the neck.
    const up = new THREE.Vector3().subVectors(j.head, j.neck).normalize();
    const look = rig.forward.clone().addScaledVector(up, -rig.forward.dot(up));
    if (look.lengthSq() < 1e-6) look.copy(rig.up).negate();
    rig.bones({ look: look.normalize(), lookUp: up, flatFeet: false });
  }

  /** Where a joint is (tests). */
  at(name: Joint, out = new THREE.Vector3()): THREE.Vector3 {
    const o = AT[name] * 3;
    return out.set(this.p[o], this.p[o + 1], this.p[o + 2]);
  }
}
