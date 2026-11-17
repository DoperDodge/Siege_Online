// An operator's body (Phase 10 M8, render/DESIGN.md §11), built in code: smooth parts, each rigid on one bone of the
// skeleton bodyRig.ts solves from the hitboxes (so what's drawn is where it's hit), dressed by the operator's look
// (data/presentation/operator_looks.json): the uniform, a vest with its pouches, headgear, what covers the face, pads,
// gloves and boots, and the item on the back that marks them. Joints are balls the limbs' ends sit in, so a bent elbow
// or knee has no gap and doesn't collapse. A body is one mesh and one draw (its colours and how shiny each part is are
// per vertex); the item on its back is a second, so it can go when it's in the hands or used up. Our own shapes.
//
// Frames (bodyRig.ts): a trunk bone's is x right, y up the spine, z back (its front is −z); a limb bone's is y along the
// limb away from the body and, hanging, x right and z forward (its front is +z); a foot's is the trunk's (toes to −z).
import * as THREE from "three";
import { loadPresentationData, type OperatorLook } from "@redmond/shared";
import { BONE, BONES, BodyRig, LEN } from "./bodyRig.js";
import { ringY, ringZ, Shaper, type V3 } from "./loft.js";

// ---------------------------------------------------------------------------------------------------------------------
// The body's parts. Sizes in metres, for a body 1.8 m tall standing (the hitboxes' own joints: bodyRig.ts).

const DARK = "#191b1d";
const RUBBER = "#141516";
const LENS = "#26323a";
const STEEL = "#7d8389";

/** The trunk: hips and belt, the belly between, the ribs and shoulders, the neck. */
function trunk(s: Shaper, L: OperatorLook): void {
  s.on(BONE.pelvis).paint(L.trousers);
  s.loft([ringY(-0.14, 0.11, 0.09), ringY(-0.09, 0.172, 0.114), ringY(-0.02, 0.18, 0.12), ringY(0.05, 0.168, 0.113), ringY(0.1, 0.156, 0.106)], 14, true);
  // The belt, a buckle, and what hangs on it: pouches on the left, a dump pouch behind.
  s.paint(L.gear, 0.7);
  s.loft([ringY(0.03, 0.17, 0.115, { n: 2.4 }), ringY(0.036, 0.181, 0.124, { n: 2.4 }), ringY(0.078, 0.178, 0.122, { n: 2.4 }), ringY(0.084, 0.165, 0.112, { n: 2.4 })], 14);
  s.box([0, 0.057, -0.124], [0.05, 0.036, 0.012], 4);
  s.box([-0.182, 0.0, -0.03], [0.03, 0.1, 0.06]);
  s.box([-0.176, 0.0, 0.04], [0.03, 0.1, 0.06]);
  s.box([-0.07, -0.005, 0.126], [0.13, 0.12, 0.04], 4, 0.008);

  s.on(BONE.spine).paint(L.uniform);
  s.loft([ringY(0.05, 0.158, 0.107), ringY(0.16, 0.154, 0.104), ringY(0.3, 0.166, 0.112), ringY(0.42, 0.176, 0.119)], 14);

  s.on(BONE.chest).paint(L.uniform);
  s.loft(
    [ringY(-0.34, 0.156, 0.106), ringY(-0.24, 0.168, 0.114), ringY(-0.12, 0.186, 0.124), ringY(-0.03, 0.192, 0.122), ringY(0.022, 0.176, 0.11), ringY(0.052, 0.118, 0.088), ringY(0.072, 0.066, 0.066)],
    14,
  );

  const hooded = L.head === "hood";
  s.on(BONE.neck).paint(L.head === "visor" ? L.gear : hooded ? L.headColor : L.skin);
  s.loft([ringY(-0.035, 0.064, 0.064), ringY(0.05, 0.056, 0.058), ringY(LEN.neck + 0.03, 0.054, 0.058)], 10);
}

/** The vest: plates front and back with a band round the ribs and straps over the shoulders, or a light chest rig. */
function vest(s: Shaper, L: OperatorLook): void {
  s.on(BONE.chest);
  const heavy = L.vestKind === "heavy";
  const strapsOver = (x: number, front: number, back: number, color: string) => {
    s.paint(color, 0.8);
    s.strap(
      [
        [x, front, -0.128],
        [x, -0.015, -0.126],
        [x, 0.034, -0.085],
        [x, 0.05, -0.02],
        [x, 0.044, 0.05],
        [x, 0.0, 0.118],
        [x, back, 0.125],
      ],
      [0.052, 0, 0],
      0.012,
    );
  };
  if (L.vestKind === "light") {
    // A chest rig: a panel low on the chest with a row of pouches, on a harness.
    strapsOver(-0.09, -0.2, -0.24, L.gear);
    strapsOver(0.09, -0.2, -0.24, L.gear);
    s.paint(L.vest, 0.8);
    s.loft([ringY(-0.3, 0.164, 0.112, { n: 2.5 }), ringY(-0.295, 0.175, 0.123, { n: 2.5 }), ringY(-0.19, 0.184, 0.129, { n: 2.5 }), ringY(-0.185, 0.172, 0.119, { n: 2.5 })], 14);
    s.paint(L.gear, 0.75);
    for (const x of [-0.105, -0.035, 0.035, 0.105]) s.box([x, -0.245, -0.143], [0.062, 0.11, 0.032]);
    s.box([-0.182, -0.24, -0.01], [0.03, 0.1, 0.07]);
    return;
  }
  const w = heavy ? 0.31 : 0.285;
  const top = heavy ? 0.0 : -0.022;
  s.paint(L.vest, 0.8);
  // The band round the ribs, then the plates on it.
  s.loft([ringY(-0.335, 0.162, 0.11, { n: 2.6 }), ringY(-0.328, 0.178, 0.126, { n: 2.6 }), ringY(-0.165, 0.194, 0.133, { n: 2.6 }), ringY(-0.158, 0.184, 0.124, { n: 2.6 })], 14);
  s.box([0, (top - 0.325) / 2, -0.133], [w, top + 0.325, heavy ? 0.056 : 0.046], 5, 0.01);
  s.box([0, (top - 0.33) / 2, 0.13], [w, top + 0.33, heavy ? 0.05 : 0.04], 5, 0.01);
  strapsOver(-0.092, -0.03, -0.03, L.vest);
  strapsOver(0.092, -0.03, -0.03, L.vest);
  if (heavy) {
    // A collar round the neck and a flap over the groin.
    s.loft([ringY(0.025, 0.118, 0.105), ringY(0.06, 0.1, 0.098), ringY(0.11, 0.09, 0.092), ringY(0.113, 0.078, 0.08)], 12);
    s.on(BONE.pelvis);
    s.box([0, -0.03, -0.122], [0.2, 0.19, 0.03], 4, 0.008);
    s.on(BONE.chest);
  }
  // Magazine pouches low on the front (the magazines' ends showing), a flat pouch over them, a radio at the left.
  const z = heavy ? -0.178 : -0.17;
  s.paint(L.gear, 0.75);
  for (const x of [-0.09, 0, 0.09]) s.box([x, -0.245, z], [0.074, 0.12, 0.034]);
  s.box([0, -0.1, z + 0.006], [0.16, 0.08, 0.02], 5, 0.005);
  s.box([-0.168, -0.2, -0.085], [0.04, 0.13, 0.062]);
  s.bar([-0.168, -0.14, -0.1], [-0.168, 0.02, -0.1], 0.004, 0.003, 6);
  s.paint(DARK, 0.6);
  for (const x of [-0.09, 0, 0.09]) s.box([x, -0.178, z], [0.05, 0.02, 0.02], 4, 0.003);
}

/** A leg: the thigh in its hip, the knee, the shin into its boot, a pad on the knee; the right one a holster. */
function leg(s: Shaper, L: OperatorLook, side: -1 | 1): void {
  const left = side < 0;
  const robot = L.head === "visor";
  s.on(left ? BONE.thighL : BONE.thighR);
  s.paint(robot ? L.gear : L.trousers);
  s.ball([0, 0, 0], 0.104, 12, 6);
  s.paint(L.trousers);
  s.loft([ringY(0.0, 0.1, 0.108), ringY(0.12, 0.097, 0.104), ringY(0.28, 0.084, 0.09), ringY(0.4, 0.073, 0.077), ringY(LEN.thigh, 0.071, 0.075)], 12);
  s.paint(robot ? L.gear : L.trousers);
  s.ball([0, LEN.thigh, 0], 0.073, 10, 5);
  s.paint(L.gear, 0.7);
  if (!left) {
    // A holster on its straps, a pistol's grip in it.
    s.loft([ringY(0.07, 0.099, 0.106), ringY(0.073, 0.104, 0.111), ringY(0.097, 0.102, 0.109), ringY(0.1, 0.096, 0.103)], 12);
    s.loft([ringY(0.18, 0.093, 0.099), ringY(0.183, 0.098, 0.104), ringY(0.205, 0.096, 0.102), ringY(0.208, 0.09, 0.096)], 12);
    s.box([0.108, 0.15, 0.0], [0.036, 0.17, 0.085]);
    s.paint(DARK, 0.5);
    s.box([0.11, 0.045, -0.018], [0.028, 0.07, 0.04], 4);
  } else if (L.vestKind !== "light") {
    s.box([-0.102, 0.15, 0.0], [0.04, 0.13, 0.1]);
  }

  s.on(left ? BONE.shinL : BONE.shinR).paint(L.trousers);
  s.loft([ringY(0.0, 0.071, 0.075), ringY(0.09, 0.07, 0.078, { z: -0.006 }), ringY(0.22, 0.06, 0.066, { z: -0.003 }), ringY(0.315, 0.054, 0.058)], 12);
  s.paint(L.boots, 0.6);
  s.loft([ringY(0.29, 0.06, 0.064), ringY(0.36, 0.058, 0.062), ringY(LEN.shin + 0.02, 0.054, 0.062)], 12, true);
  if (L.pads) {
    s.paint(L.gear, 0.55);
    s.box([0, 0.012, 0.066], [0.118, 0.16, 0.04], 3, 0.012);
  }

  // The boot: heel to toe along z, its sole under it.
  s.on(left ? BONE.footL : BONE.footR).paint(L.boots, 0.6);
  s.loft(
    [
      ringZ(0.088, 0.04, 0.042, { y: -0.034, n: 3 }),
      ringZ(0.055, 0.053, 0.06, { y: -0.018, n: 3 }),
      ringZ(-0.02, 0.057, 0.052, { y: -0.026, n: 3 }),
      ringZ(-0.1, 0.058, 0.04, { y: -0.038, n: 3 }),
      ringZ(-0.175, 0.055, 0.031, { y: -0.047, n: 3 }),
      ringZ(-0.212, 0.04, 0.022, { y: -0.055, n: 3 }),
    ],
    12,
    true,
    true,
  );
  s.paint(RUBBER, 0.9);
  s.box([0, -0.072, -0.062], [0.12, 0.016, 0.306], 3, 0.004);
}

/** An arm: the shoulder, the sleeve to the elbow, the forearm to its glove; pads on the elbows, a mark on the shoulder. */
function arm(s: Shaper, L: OperatorLook, side: -1 | 1): void {
  const left = side < 0;
  const short = L.sleeves === "short";
  const robot = L.head === "visor";
  s.on(left ? BONE.upperArmL : BONE.upperArmR).paint(robot ? L.gear : L.uniform);
  s.ball([0, 0, 0], 0.07, 10, 6);
  s.paint(L.uniform);
  if (short) {
    s.loft([ringY(0.0, 0.064, 0.066), ringY(0.1, 0.061, 0.063), ringY(0.155, 0.059, 0.061)], 10, false, true);
    s.paint(L.skin, 0.7);
    s.loft([ringY(0.14, 0.052, 0.054), ringY(0.22, 0.049, 0.051), ringY(LEN.upperArm, 0.046, 0.047)], 10);
    s.ball([0, LEN.upperArm, 0], 0.047, 8, 5);
  } else {
    s.loft([ringY(0.0, 0.064, 0.066), ringY(0.1, 0.06, 0.062), ringY(0.21, 0.053, 0.055), ringY(LEN.upperArm, 0.049, 0.05)], 10);
    s.paint(robot ? L.gear : L.uniform);
    s.ball([0, LEN.upperArm, 0], 0.05, 8, 5);
  }
  // The operator's mark: a patch in their colour on the outside of each shoulder.
  s.paint(L.accent, 0.7);
  s.box([side * 0.062, 0.09, 0.0], [0.012, 0.066, 0.06], 4, 0.003);
  if (L.vestKind === "heavy") {
    s.paint(L.vest, 0.8);
    s.box([side * 0.058, 0.05, 0.0], [0.045, 0.17, 0.125], 3, 0.012);
  }

  s.on(left ? BONE.foreArmL : BONE.foreArmR).paint(short ? L.skin : L.uniform, short ? 0.7 : 0.85);
  s.loft([ringY(0.0, 0.049, 0.05), ringY(0.07, 0.05, 0.051), ringY(0.19, 0.042, 0.043), ringY(0.25, 0.036, 0.037)], 10);
  if (L.pads) {
    s.paint(L.gear, 0.55);
    s.box([0, 0.012, -0.045], [0.08, 0.11, 0.034], 3, 0.01);
  }
  // The glove: a cuff and the hand closed round what it holds (its middle is the bone's end).
  s.paint(L.gloves, 0.7);
  s.loft([ringY(0.228, 0.04, 0.041), ringY(0.233, 0.043, 0.044), ringY(0.268, 0.041, 0.042), ringY(0.272, 0.034, 0.035)], 10);
  s.loft(
    [ringY(0.262, 0.033, 0.031), ringY(0.292, 0.042, 0.041), ringY(LEN.foreArm, 0.045, 0.045), ringY(0.368, 0.041, 0.042), ringY(0.392, 0.026, 0.028)],
    10,
    false,
    true,
  );
}

/** The head and what's on it. */
function head(s: Shaper, L: OperatorLook): void {
  s.on(BONE.head);
  const robot = L.head === "visor";
  if (robot) {
    // Skopós: a smooth shell with a band of glass across the eyes.
    s.paint(L.headColor, 0.35);
    s.loft(
      [
        ringY(-0.118, 0.04, 0.046, { z: -0.03 }),
        ringY(-0.08, 0.07, 0.082, { z: -0.012 }),
        ringY(-0.02, 0.084, 0.1),
        ringY(0.05, 0.086, 0.104, { z: 0.004 }),
        ringY(0.098, 0.062, 0.078, { z: 0.008 }),
        ringY(0.122, 0.014, 0.018, { z: 0.01 }),
      ],
      14,
      true,
      true,
    );
    s.paint(L.accent, 0.2);
    s.loft([ringY(-0.008, 0.086, 0.094, { z: -0.012, n: 2.6 }), ringY(0.0, 0.09, 0.098, { z: -0.012, n: 2.6 }), ringY(0.03, 0.09, 0.098, { z: -0.012, n: 2.6 }), ringY(0.038, 0.086, 0.094, { z: -0.012, n: 2.6 })], 14);
    s.paint(L.gear, 0.5);
    s.box([-0.086, -0.01, 0.01], [0.012, 0.06, 0.05], 3);
    s.box([0.086, -0.01, 0.01], [0.012, 0.06, 0.05], 3);
    return;
  }
  // The head: chin to crown, the nose, the ears, the eyes and brow a dark line.
  s.paint(L.skin, 0.7);
  s.loft(
    [
      ringY(-0.118, 0.03, 0.034, { z: -0.05 }),
      ringY(-0.1, 0.052, 0.058, { z: -0.034 }),
      ringY(-0.065, 0.066, 0.078, { z: -0.016 }),
      ringY(-0.025, 0.074, 0.09, { z: -0.006 }),
      ringY(0.02, 0.077, 0.096),
      ringY(0.065, 0.072, 0.092, { z: 0.004 }),
      ringY(0.098, 0.052, 0.068, { z: 0.008 }),
      ringY(0.114, 0.02, 0.028, { z: 0.01 }),
    ],
    14,
    true,
    true,
  );
  s.box([0, -0.02, -0.098], [0.026, 0.05, 0.03], 3, 0.006, 8);
  s.ball([-0.077, -0.008, 0.012], [0.012, 0.03, 0.018], 8, 4);
  s.ball([0.077, -0.008, 0.012], [0.012, 0.03, 0.018], 8, 4);
  s.paint("#1c1714", 0.5);
  s.box([-0.031, 0.013, -0.088], [0.028, 0.012, 0.012], 3, 0.003, 8);
  s.box([0.031, 0.013, -0.088], [0.028, 0.012, 0.012], 3, 0.003, 8);

  if (L.head === "hood") {
    // A hood over the whole head and down the neck (the data gives it a mask or goggles for the face).
    s.paint(L.headColor, 0.9);
    s.loft(
      [
        ringY(-0.135, 0.066, 0.068, { z: 0.004 }),
        ringY(-0.1, 0.064, 0.07, { z: -0.022 }),
        ringY(-0.065, 0.073, 0.085, { z: -0.014 }),
        ringY(-0.025, 0.08, 0.096, { z: -0.005 }),
        ringY(0.02, 0.083, 0.102),
        ringY(0.065, 0.078, 0.098, { z: 0.004 }),
        ringY(0.1, 0.058, 0.074, { z: 0.008 }),
        ringY(0.121, 0.022, 0.03, { z: 0.01 }),
      ],
      14,
      false,
      true,
    );
  } else {
    // Hair: a cap of it from the hairline over the top and down the back.
    s.paint(L.hair, 0.8);
    s.loft(
      [
        ringY(0.008, 0.0805, 0.089, { z: -0.007, tilt: 0.68 }),
        ringY(0.04, 0.0815, 0.098, { z: 0.003, tilt: 0.4 }),
        ringY(0.075, 0.075, 0.095, { z: 0.006, tilt: 0.15 }),
        ringY(0.104, 0.055, 0.071, { z: 0.009 }),
        ringY(0.12, 0.02, 0.028, { z: 0.01 }),
      ],
      14,
      false,
      true,
    );
  }
  if (L.head === "helmet") {
    s.paint(L.headColor, 0.5);
    s.loft(
      [
        ringY(0.008, 0.094, 0.112, { z: 0.012, tilt: 0.26 }),
        ringY(0.014, 0.099, 0.117, { z: 0.012, tilt: 0.26 }),
        ringY(0.058, 0.097, 0.115, { z: 0.011, tilt: 0.12 }),
        ringY(0.098, 0.08, 0.096, { z: 0.01, tilt: 0.04 }),
        ringY(0.124, 0.05, 0.062, { z: 0.01 }),
        ringY(0.134, 0.012, 0.016, { z: 0.01 }),
      ],
      14,
      false,
      true,
    );
    // Rails on its sides and a mount on its front.
    s.paint(DARK, 0.5);
    s.box([-0.098, 0.03, 0.012], [0.012, 0.022, 0.09], 4, 0.003);
    s.box([0.098, 0.03, 0.012], [0.012, 0.022, 0.09], 4, 0.003);
    s.box([0, 0.082, -0.1], [0.036, 0.032, 0.014], 4, 0.003);
  } else if (L.head === "cap") {
    s.paint(L.headColor, 0.85);
    s.loft(
      [ringY(0.034, 0.082, 0.1, { z: 0.012, tilt: 0.12 }), ringY(0.04, 0.085, 0.103, { z: 0.012, tilt: 0.12 }), ringY(0.078, 0.081, 0.099, { z: 0.012 }), ringY(0.11, 0.058, 0.072, { z: 0.012 }), ringY(0.124, 0.014, 0.018, { z: 0.012 })],
      14,
      false,
      true,
    );
    // Its bill, tipped down a little.
    s.with(new THREE.Matrix4().makeTranslation(0, 0.05, -0.085).multiply(new THREE.Matrix4().makeRotationX(0.2)), () => s.box([0, 0, -0.036], [0.142, 0.009, 0.072], 3, 0.003));
  } else if (L.head === "beanie") {
    s.paint(L.headColor, 0.95);
    s.loft(
      [
        ringY(0.016, 0.084, 0.102, { z: 0.012, tilt: 0.2 }),
        ringY(0.022, 0.089, 0.107, { z: 0.012, tilt: 0.2 }),
        ringY(0.046, 0.089, 0.107, { z: 0.012, tilt: 0.14 }),
        ringY(0.052, 0.084, 0.102, { z: 0.012, tilt: 0.12 }),
        ringY(0.09, 0.07, 0.086, { z: 0.012 }),
        ringY(0.118, 0.042, 0.052, { z: 0.012 }),
        ringY(0.13, 0.012, 0.016, { z: 0.012 }),
      ],
      14,
      false,
      true,
    );
  } else if (L.head === "hardhat") {
    // A work hard hat: a brim all round, deeper at the front, a dome and a ridge along its top.
    s.paint(L.headColor, 0.45);
    s.loft(
      [
        ringY(0.026, 0.128, 0.152, { z: 0.0, tilt: 0.18 }),
        ringY(0.033, 0.125, 0.148, { z: 0.0, tilt: 0.18 }),
        ringY(0.04, 0.099, 0.117, { z: 0.01, tilt: 0.14 }),
        ringY(0.092, 0.094, 0.111, { z: 0.01, tilt: 0.06 }),
        ringY(0.124, 0.062, 0.076, { z: 0.01 }),
        ringY(0.138, 0.014, 0.018, { z: 0.01 }),
      ],
      14,
      false,
      true,
    );
    s.box([0, 0.13, 0.008], [0.022, 0.014, 0.168], 3, 0.005);
  } else if (L.head === "brim") {
    // A wide-brimmed hat: a flat brim, a low crown, a band in the accent colour.
    s.paint(L.headColor, 0.9);
    s.loft(
      [
        ringY(0.05, 0.15, 0.162, { z: 0.01, tilt: 0.05 }),
        ringY(0.057, 0.148, 0.16, { z: 0.01, tilt: 0.05 }),
        ringY(0.06, 0.09, 0.106, { z: 0.01, tilt: 0.04 }),
        ringY(0.124, 0.084, 0.1, { z: 0.01 }),
        ringY(0.134, 0.05, 0.06, { z: 0.01 }),
        ringY(0.138, 0.01, 0.012, { z: 0.01 }),
      ],
      14,
      false,
      true,
    );
    s.paint(L.accent, 0.7);
    s.loft([ringY(0.062, 0.093, 0.109, { z: 0.01, tilt: 0.04 }), ringY(0.082, 0.092, 0.108, { z: 0.01, tilt: 0.03 })], 14, false, false);
  }

  // Over the face.
  if (L.face === "goggles") {
    s.paint(DARK, 0.7);
    s.loft([ringY(-0.004, 0.0805, 0.099, { z: 0.004 }), ringY(0.0, 0.083, 0.1015, { z: 0.004 }), ringY(0.026, 0.083, 0.1015, { z: 0.004 }), ringY(0.03, 0.0805, 0.099, { z: 0.004 })], 14);
    s.box([0, 0.013, -0.095], [0.138, 0.05, 0.026], 4, 0.006);
    s.paint(LENS, 0.15);
    s.box([-0.034, 0.013, -0.108], [0.054, 0.034, 0.006], 3, 0.002);
    s.box([0.034, 0.013, -0.108], [0.054, 0.034, 0.006], 3, 0.002);
  } else if (L.face === "glasses") {
    s.paint(DARK, 0.4);
    s.box([0, 0.02, -0.097], [0.13, 0.006, 0.006], 4, 0.002, 8);
    s.box([-0.078, 0.018, -0.05], [0.004, 0.006, 0.1], 4, 0.002, 8);
    s.box([0.078, 0.018, -0.05], [0.004, 0.006, 0.1], 4, 0.002, 8);
    s.paint(LENS, 0.15);
    s.box([-0.032, 0.01, -0.098], [0.05, 0.03, 0.005], 3, 0.002);
    s.box([0.032, 0.01, -0.098], [0.05, 0.03, 0.005], 3, 0.002);
  } else if (L.face === "gasmask") {
    // A mask over the whole face: its snout, a filter at its left, two round lenses.
    s.paint(RUBBER, 0.6);
    s.loft([ringZ(-0.06, 0.07, 0.092, { y: -0.03 }), ringZ(-0.092, 0.066, 0.086, { y: -0.032 }), ringZ(-0.112, 0.046, 0.05, { y: -0.052 }), ringZ(-0.132, 0.03, 0.032, { y: -0.06 })], 12, false, true);
    s.paint(L.gear, 0.5);
    s.bar([-0.026, -0.07, -0.098], [-0.05, -0.08, -0.12], 0.027, 0.027, 10);
    s.paint(LENS, 0.12);
    s.bar([-0.034, 0.012, -0.09], [-0.036, 0.014, -0.103], 0.026, 0.024, 10);
    s.bar([0.034, 0.012, -0.09], [0.036, 0.014, -0.103], 0.026, 0.024, 10);
  } else if (L.face === "shield") {
    // A helmet's face shield: a pane down over the face, its sides turned back.
    s.paint("#2a3238", 0.18);
    s.box([0, -0.025, -0.118], [0.105, 0.15, 0.006], 4, 0.002);
    for (const side of [-1, 1])
      s.with(new THREE.Matrix4().makeTranslation(side * 0.052, -0.025, -0.118).multiply(new THREE.Matrix4().makeRotationY(-side * 0.9)), () => s.box([side * 0.034, 0, 0], [0.068, 0.15, 0.006], 4, 0.002));
    s.paint(DARK, 0.5);
    s.box([0, 0.055, -0.108], [0.16, 0.016, 0.02], 4, 0.004);
  }

  // A headset: cups over the ears, a band over the top unless a helmet carries them, a microphone.
  if (L.ears) {
    s.paint(DARK, 0.55);
    s.box([-0.088, -0.006, 0.012], [0.032, 0.066, 0.05], 3, 0.008);
    s.box([0.088, -0.006, 0.012], [0.032, 0.066, 0.05], 3, 0.008);
    if (L.head !== "helmet") {
      const top = L.head === "bare" ? 0.126 : 0.131;
      s.strap(
        [
          [-0.09, 0.02, 0.012],
          [-0.086, 0.07, 0.012],
          [-0.058, 0.112, 0.012],
          [0, top, 0.012],
          [0.058, 0.112, 0.012],
          [0.086, 0.07, 0.012],
          [0.09, 0.02, 0.012],
        ],
        [0, 0, 0.022],
        0.007,
      );
    }
    s.bar([-0.09, -0.03, -0.005], [-0.05, -0.062, -0.092], 0.004, 0.004, 6);
    s.ball([-0.048, -0.063, -0.094], 0.009, 6, 4);
  }
}

/** What's on the back (its own mesh, in the chest's frame: it goes when it's in the hands, or used up). */
function backItem(s: Shaper, L: OperatorLook): void {
  s.on(BONE.chest);
  const z = L.vestKind === "light" ? 0.122 : 0.15;
  switch (L.back) {
    case "none":
      return;
    case "pack":
      s.paint(L.gear, 0.85);
      s.box([0, -0.15, z + 0.0425], [0.24, 0.32, 0.085], 4, 0.02);
      s.box([0, -0.07, z + 0.092], [0.17, 0.12, 0.022], 4, 0.008);
      s.paint(L.accent, 0.7);
      s.box([0, -0.25, z + 0.087], [0.1, 0.03, 0.006], 4, 0.002);
      return;
    case "radio":
      s.paint(L.gear, 0.7);
      s.box([-0.06, -0.12, z + 0.03], [0.12, 0.21, 0.06], 4, 0.01);
      s.paint(DARK, 0.5);
      s.bar([-0.1, -0.02, z + 0.03], [-0.1, 0.27, z + 0.04], 0.005, 0.002, 6);
      s.paint(L.accent, 0.5);
      s.box([-0.06, -0.06, z + 0.062], [0.07, 0.03, 0.006], 4, 0.002);
      return;
    case "hammer": {
      // A sledgehammer slung across the back, its head over the right shoulder.
      const a: V3 = [-0.14, -0.4, z + 0.03];
      const b: V3 = [0.13, 0.14, z + 0.045];
      const on = (t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      s.paint(DARK, 0.6);
      s.bar(a, b, 0.016, 0.016, 8);
      s.paint(L.accent, 0.6);
      s.bar(on(0.04), on(0.32), 0.019, 0.019, 8);
      // The head: across the handle's end.
      const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], 0).normalize();
      const turn = new THREE.Matrix4().makeTranslation(b[0], b[1], b[2]).multiply(new THREE.Matrix4().makeRotationZ(Math.atan2(dir.y, dir.x) - Math.PI / 2));
      s.paint(STEEL, 0.35);
      s.with(turn, () => {
        s.box([0, 0.02, 0], [0.17, 0.07, 0.07], 5, 0.008);
      });
      return;
    }
    case "roll":
      // A rolled charge across the back on two straps.
      s.paint(L.gear, 0.8);
      s.bar([-0.125, -0.2, z + 0.05], [0.125, -0.2, z + 0.05], 0.052, 0.052, 12);
      s.paint(L.accent, 0.6);
      s.bar([-0.095, -0.2, z + 0.05], [-0.06, -0.2, z + 0.05], 0.055, 0.055, 12);
      s.bar([0.06, -0.2, z + 0.05], [0.095, -0.2, z + 0.05], 0.055, 0.055, 12);
      return;
    case "jammer":
      // A flat set with four stub aerials.
      s.paint(L.gear, 0.6);
      s.box([0, -0.15, z + 0.035], [0.22, 0.2, 0.07], 4, 0.012);
      s.paint(L.accent, 0.5);
      s.box([0, -0.15, z + 0.072], [0.12, 0.05, 0.006], 4, 0.002);
      s.paint(DARK, 0.5);
      for (const x of [-0.08, -0.027, 0.027, 0.08]) s.bar([x, -0.05, z + 0.035], [x, 0.03, z + 0.035], 0.008, 0.006, 6);
      return;
    case "drone":
      // A wide drone strapped flat, its wheels at its sides.
      s.paint(L.gear, 0.6);
      s.box([0, -0.16, z + 0.04], [0.2, 0.24, 0.08], 4, 0.014);
      s.paint(RUBBER, 0.9);
      s.bar([-0.145, -0.16, z + 0.04], [-0.105, -0.16, z + 0.04], 0.062, 0.062, 12);
      s.bar([0.105, -0.16, z + 0.04], [0.145, -0.16, z + 0.04], 0.062, 0.062, 12);
      s.paint(L.accent, 0.4);
      s.box([0, -0.1, z + 0.082], [0.09, 0.03, 0.006], 4, 0.002);
      return;
    case "battery":
      // Ohm's (R3): a squat battery pack, copper terminals on top, a cable from it over the left shoulder.
      s.paint(L.gear, 0.6);
      s.box([0, -0.17, z + 0.045], [0.22, 0.24, 0.09], 4, 0.014);
      s.paint(L.accent, 0.35);
      s.box([0, -0.17, z + 0.0915], [0.16, 0.035, 0.006], 4, 0.002);
      for (const x of [-0.06, 0.06]) s.bar([x, -0.05, z + 0.045], [x, -0.03, z + 0.045], 0.014, 0.012, 8);
      s.paint(DARK, 0.6);
      s.bar([-0.06, -0.03, z + 0.045], [-0.1, 0.06, z + 0.02], 0.007, 0.007, 6);
      s.bar([-0.1, 0.06, z + 0.02], [-0.11, 0.1, -0.02], 0.007, 0.007, 6);
      return;
    case "medbag":
      // Tonic's (R3): a sling bag across the back, its strap over the right shoulder, a teal plus of ours on its flap.
      s.paint(L.gear, 0.8);
      s.box([0.02, -0.2, z + 0.045], [0.24, 0.16, 0.09], 4, 0.025);
      s.bar([0.12, -0.12, z + 0.03], [0.05, 0.12, z + 0.02], 0.012, 0.012, 6);
      s.paint(L.accent, 0.5);
      s.box([0.02, -0.2, z + 0.0915], [0.075, 0.02, 0.006], 4, 0.002);
      s.box([0.02, -0.2, z + 0.0915], [0.02, 0.075, 0.006], 4, 0.002);
      return;
    case "reel":
      // Shunt's (R3): a cable reel on its side across the back, its flanges dark, its cable the accent, on a strap.
      s.paint(DARK, 0.6);
      for (const x of [-0.1, 0.085]) s.bar([x, -0.19, z + 0.07], [x + 0.015, -0.19, z + 0.07], 0.072, 0.072, 14);
      s.paint(L.accent, 0.55);
      s.bar([-0.085, -0.19, z + 0.07], [0.085, -0.19, z + 0.07], 0.058, 0.058, 14);
      s.paint(L.gear, 0.8);
      s.bar([-0.12, -0.13, z + 0.02], [0.1, 0.1, z + 0.015], 0.012, 0.012, 6);
      return;
    case "traps":
      // Latch's (R3): a canvas satchel low on the back, two spare latches' steel jaws clipped to its flap in the accent.
      s.paint(L.gear, 0.85);
      s.box([0, -0.22, z + 0.045], [0.22, 0.14, 0.09], 4, 0.02);
      s.bar([-0.1, -0.15, z + 0.04], [0.12, 0.13, z + 0.02], 0.01, 0.01, 6);
      s.paint(L.accent, 0.45);
      for (const x of [-0.055, 0.055]) {
        s.box([x, -0.2, z + 0.0915], [0.06, 0.04, 0.008], 4, 0.003);
        s.box([x, -0.18, z + 0.0915], [0.064, 0.006, 0.01], 2, 0.001);
      }
      return;
    case "tube":
      // A canister upright at the right, a hose over the shoulder.
      s.paint(L.gear, 0.5);
      s.bar([0.07, -0.3, z + 0.038], [0.07, 0.0, z + 0.038], 0.042, 0.042, 12);
      s.paint(L.accent, 0.5);
      s.bar([0.07, -0.08, z + 0.038], [0.07, -0.04, z + 0.038], 0.045, 0.045, 12);
      s.paint(DARK, 0.6);
      s.bar([0.07, 0.0, z + 0.038], [0.07, 0.04, z + 0.038], 0.02, 0.014, 8);
      return;
  }
}

/** A body's geometry: the body itself (skinned, each vertex on one bone) and what's on its back (the chest's frame). */
export interface BodyGeometry {
  body: THREE.BufferGeometry;
  back: THREE.BufferGeometry | null;
  triangles: number;
}

export function buildBody(look: OperatorLook): BodyGeometry {
  const s = new Shaper();
  trunk(s, look);
  vest(s, look);
  leg(s, look, -1);
  leg(s, look, 1);
  arm(s, look, -1);
  arm(s, look, 1);
  head(s, look);
  const b = new Shaper();
  backItem(b, look);
  return { body: s.geometry(true), back: b.triangles ? b.geometry(false) : null, triangles: s.triangles + b.triangles };
}

/** An operator's look (data/presentation/operator_looks.json), or the default's. */
export function operatorLook(operatorId: string | undefined): OperatorLook {
  const looks = loadPresentationData().operatorLooks.looks;
  return (operatorId ? looks[operatorId] : undefined) ?? looks.default;
}

/**
 * The body's one material: colours and roughness from the vertices (cloth, rubber, a lens). Its skinning is the
 * body's own: a vertex rides one bone whole, and the bones are in the world, so one bone's matrix places it (three's
 * blends four, a bone's matrix read for each: four times the work a vertex for nothing here).
 */
export function bodyMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.name = "body";
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <skinbase_vertex>", "#ifdef USE_SKINNING\n\tmat4 boneMatX = getBoneMatrix( skinIndex.x );\n#endif")
      .replace("#include <skinnormal_vertex>", "#ifdef USE_SKINNING\n\tobjectNormal = ( boneMatX * vec4( objectNormal, 0.0 ) ).xyz;\n#endif")
      .replace("#include <skinning_vertex>", "#ifdef USE_SKINNING\n\ttransformed = ( boneMatX * vec4( transformed, 1.0 ) ).xyz;\n#endif");
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float aRough;\nvarying float vBodyRough;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvBodyRough = aRough;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vBodyRough;")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor *= vBodyRough;");
  };
  m.customProgramCacheKey = () => "body";
  return m;
}

/** How far round its pelvis a body reaches in any pose (what's culled by: an arm out, a gun's in its own mesh). */
const REACH_M = 1.45;

/**
 * A body in the scene: its skinned mesh on the rig's bones and the item on its back. Each frame: `rig.frame` and
 * `rig.solve` (the caller's pose), then `sync`.
 */
export class BodyModel {
  readonly group = new THREE.Group();
  readonly rig = new BodyRig();
  readonly material = bodyMaterial();
  readonly triangles: number;
  private readonly mesh: THREE.SkinnedMesh;
  private readonly back: THREE.Mesh | null;
  private readonly bones: THREE.Bone[];
  private readonly geometries: THREE.BufferGeometry[];
  private backShown = true;

  constructor(readonly look: OperatorLook) {
    const g = buildBody(look);
    this.triangles = g.triangles;
    this.geometries = g.back ? [g.body, g.back] : [g.body];
    this.bones = BONES.map((name) => {
      const b = new THREE.Bone();
      b.name = name;
      b.matrixAutoUpdate = false;
      b.matrixWorldAutoUpdate = false;
      return b;
    });
    // Bound as it is: a vertex is in its bone's own frame, so a bone's matrix in the world places it.
    this.mesh = new THREE.SkinnedMesh(g.body, this.material);
    this.mesh.bind(new THREE.Skeleton(this.bones, this.bones.map(() => new THREE.Matrix4())), new THREE.Matrix4());
    this.mesh.name = "body";
    this.mesh.receiveShadow = true;
    // Culled by a sphere round the pelvis (its own bounds are the parts in their bones' frames, all at the origin).
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), REACH_M);
    this.group.add(this.mesh);
    this.back = g.back ? new THREE.Mesh(g.back, this.material) : null;
    if (this.back) {
      this.back.name = "body-back";
      this.back.matrixAutoUpdate = false;
      this.back.receiveShadow = true;
      this.group.add(this.back);
    }
  }

  /** What's on its back shown or not (in its hands, or none left). */
  showBack(on: boolean): void {
    this.backShown = on;
    if (this.back) this.back.visible = on;
  }

  /** The bones (and the back's item) to where the rig has them. */
  sync(): void {
    const m = this.rig.matrices;
    for (let i = 0; i < this.bones.length; i++) this.bones[i].matrixWorld.copy(m[i]);
    this.mesh.boundingSphere!.center.copy(this.rig.joints.pelvis);
    if (this.back && this.backShown) {
      this.back.matrix.copy(m[BONE.chest]);
      this.back.matrixWorldNeedsUpdate = true;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geometries) g.dispose();
    this.mesh.skeleton.dispose();
    this.material.dispose();
  }
}
