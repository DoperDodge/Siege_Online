// Shaped models for the gadgets and the drone (Phase 10 M7, render/DESIGN.md §10): each gadget as what it is —
// grenades (a frag's ribbed body, a flashbang's perforated can, a smoke can), the impact grenades, Fuze's bomblets,
// Lesion's mine, the C4 brick with its phone, the proximity alarm, the claymore on its legs, the breach charge's
// frame, the hard breach charge, Thermite's charge with its canisters, Fuze's launcher box,
// the deployable shield, a coil of barbed wire, the observation blocker, Mute's jammer, Pulse's sensor, Dokkaebi's
// tablet, Mira's canister, Sledge's hammer — and the drone (hull, tyres, camera, antenna; Brava's bigger, with its
// spike). Each fits the box its data gives (sizeM: width, height, depth; the front toward −z), so what's drawn is where
// it's hit and placed; built once per kind and size, merged by material. Our own shapes, of each kind's general form.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type ShapeMat = "olive" | "dark" | "metal" | "black" | "tan" | "red" | "yellow" | "white" | "glass" | "rubber" | "blueGlow" | "greenGlow" | "redGlow" | "team";

/** Each shape material's look (the gadget models make one of each, shared). */
export const SHAPE_MATERIALS: Record<ShapeMat, { color: number; roughness: number; metalness: number; emissive?: number }> = {
  olive: { color: 0x4b5320, roughness: 0.62, metalness: 0.1 },
  dark: { color: 0x2a2d30, roughness: 0.55, metalness: 0.3 },
  metal: { color: 0x9aa0a6, roughness: 0.35, metalness: 0.8 },
  black: { color: 0x141517, roughness: 0.6, metalness: 0.1 },
  tan: { color: 0xa8916b, roughness: 0.75, metalness: 0 },
  red: { color: 0x8f1712, roughness: 0.45, metalness: 0.1 },
  yellow: { color: 0xc99a1e, roughness: 0.5, metalness: 0.1 },
  white: { color: 0xe4e4de, roughness: 0.6, metalness: 0 },
  glass: { color: 0x0b1620, roughness: 0.06, metalness: 0.5 },
  rubber: { color: 0x151515, roughness: 0.92, metalness: 0 },
  blueGlow: { color: 0x2f7dff, roughness: 0.4, metalness: 0, emissive: 0x2f7dff },
  greenGlow: { color: 0x37ff6a, roughness: 0.4, metalness: 0, emissive: 0x24c94f },
  redGlow: { color: 0xff3030, roughness: 0.4, metalness: 0, emissive: 0xff2020 },
  team: { color: 0xffffff, roughness: 0.55, metalness: 0.1 },
};

type V3 = readonly [number, number, number];

/** Collects a shape's parts by material, centred on its box. */
class Parts {
  readonly by = new Map<ShapeMat, THREE.BufferGeometry[]>();

  add(mat: ShapeMat, g: THREE.BufferGeometry, at: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): void {
    if (rot[0] || rot[1] || rot[2]) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], "YXZ")));
    g.translate(at[0], at[1], at[2]);
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    geo.deleteAttribute("uv");
    const list = this.by.get(mat);
    if (list) list.push(geo);
    else this.by.set(mat, [geo]);
  }

  box(mat: ShapeMat, size: V3, at: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): void {
    this.add(mat, new THREE.BoxGeometry(size[0], size[1], size[2]), at, rot);
  }

  /** A cylinder standing up (rot turns it). */
  cyl(mat: ShapeMat, r: number, h: number, at: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], segs = 16, rTop = r, open = false): void {
    this.add(mat, new THREE.CylinderGeometry(rTop, r, h, segs, 1, open), at, rot);
  }

  /** A turned part: a profile of (radius, height) points revolved about y. */
  lathe(mat: ShapeMat, pts: readonly [number, number][], at: V3 = [0, 0, 0], segs = 16, rot: V3 = [0, 0, 0]): void {
    this.add(mat, new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs), at, rot);
  }

  torus(mat: ShapeMat, r: number, tube: number, at: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): void {
    this.add(mat, new THREE.TorusGeometry(r, tube, 6, 16), at, rot);
  }

  /** Merged geometries, one per material. */
  done(): Map<ShapeMat, THREE.BufferGeometry> {
    const out = new Map<ShapeMat, THREE.BufferGeometry>();
    for (const [m, list] of this.by) {
      const g = mergeGeometries(list, false);
      for (const p of list) p.dispose();
      if (g) out.set(m, g);
    }
    return out;
  }
}

const HALF_PI = Math.PI / 2;

/** A grenade's fuse on top (at y), its spoon down its side and the pin's ring. */
function fuse(p: Parts, y: number, r: number): void {
  p.cyl("metal", 0.008, 0.014, [0, y + 0.007, 0], [0, 0, 0], 10);
  p.box("metal", [0.012, 0.055, 0.003], [0, y - 0.018, -r - 0.003], [0.08, 0, 0]);
  p.torus("metal", 0.009, 0.0015, [0.013, y + 0.01, 0], [0, HALF_PI, 0]);
}

/** The shape for a gadget by its id and data size, merged by material; null for one drawn otherwise. */
export function gadgetShape(id: string, size: V3): Map<ShapeMat, THREE.BufferGeometry> | null {
  const [w, h, d] = size;
  const p = new Parts();
  switch (id) {
    case "frag": {
      const r = Math.min(w, d) / 2 - 0.002;
      const by = -h / 2;
      p.lathe("olive", [[0.001, by], [r * 0.6, by + 0.002], [r * 0.95, by + h * 0.2], [r, by + h * 0.42], [r * 0.92, by + h * 0.62], [r * 0.6, by + h * 0.74], [0.001, by + h * 0.76]]);
      for (let i = 1; i < 4; i++) p.torus("dark", r * (i === 2 ? 1.005 : 0.97), 0.0018, [0, by + h * (0.12 + i * 0.13), 0], [HALF_PI, 0, 0]);
      fuse(p, by + h * 0.76, r * 0.6);
      break;
    }
    case "stun":
    case "smoke":
    case "impact_grenade": {
      const r = Math.min(w, d) / 2 - 0.004;
      const body = h * 0.78;
      const by = -h / 2 + body / 2;
      p.cyl(id === "smoke" ? "olive" : "dark", r, body, [0, by, 0], [0, 0, 0], 18);
      p.cyl("metal", r * 1.03, 0.006, [0, -h / 2 + 0.003, 0], [0, 0, 0], 18);
      if (id === "stun") for (const y of [-0.25, 0, 0.25]) for (let i = 0; i < 8; i++) p.box("black", [0.006, 0.01, 0.003], [Math.cos((i / 8) * Math.PI * 2) * r, by + y * body, Math.sin((i / 8) * Math.PI * 2) * r], [0, -(i / 8) * Math.PI * 2 + HALF_PI, 0]);
      if (id === "smoke") p.cyl("white", r * 1.01, body * 0.18, [0, by + body * 0.18, 0], [0, 0, 0], 18);
      if (id === "impact_grenade") {
        p.cyl("yellow", r * 1.01, body * 0.12, [0, by + body * 0.25, 0], [0, 0, 0], 18);
        p.cyl("metal", r * 0.45, h - body, [0, h / 2 - (h - body) / 2, 0], [0, 0, 0], 12, r * 0.3);
      } else fuse(p, -h / 2 + body, r);
      break;
    }
    case "impact_emp": {
      const r = Math.min(w, d) / 2 - 0.004;
      p.cyl("dark", r, h * 0.62, [0, -h * 0.19, 0], [0, 0, 0], 18);
      for (const y of [-0.3, -0.1]) p.cyl("blueGlow", r * 1.02, 0.006, [0, y * h, 0], [0, 0, 0], 18);
      p.lathe("dark", [[r, h * 0.12], [r * 0.9, h * 0.28], [r * 0.5, h * 0.42], [0.001, h * 0.48]]);
      break;
    }
    case "cluster_grenade": {
      const r = Math.min(w, h, d) / 2 - 0.002;
      p.lathe("dark", [[0.001, -r], [r * 0.7, -r * 0.7], [r, 0], [r * 0.7, r * 0.7], [0.001, r]]);
      p.cyl("yellow", r * 1.01, 0.006, [0, 0, 0], [0, 0, 0], 16);
      break;
    }
    case "gu_mine": {
      const r = Math.min(w, d) / 2 - 0.005;
      p.lathe("olive", [[r, -h / 2], [r * 0.95, -h / 2 + h * 0.3], [r * 0.6, -h / 2 + h * 0.62], [0.001, -h / 2 + h * 0.7]], [0, 0, 0], 18);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        p.box("dark", [0.006, 0.006, r * 0.5], [Math.cos(a) * r * 0.8, -h / 2 + 0.003, Math.sin(a) * r * 0.8], [0, -a + HALF_PI, 0]);
      }
      p.cyl("metal", 0.0012, h * 0.3, [0, h / 2 - h * 0.15, 0], [0, 0, 0], 6);
      p.cyl("greenGlow", 0.005, 0.004, [0, -h / 2 + h * 0.71, 0], [0, 0, 0], 10);
      break;
    }
    case "nitro_cell": {
      p.box("tan", [w * 0.9, h * 0.62, d * 0.9], [0, -h * 0.17, 0]);
      for (const x of [-0.25, 0.25]) p.box("black", [0.004, h * 0.64, d * 0.92], [x * w, -h * 0.17, 0]);
      p.box("black", [w * 0.55, h * 0.14, d * 0.85], [0, h * 0.24, 0]);
      p.box("greenGlow", [w * 0.4, 0.002, d * 0.5], [0, h * 0.31 + 0.001, 0]);
      break;
    }
    case "proximity_alarm": {
      const r = Math.min(w, h) / 2 - 0.002;
      p.cyl("dark", r, d * 0.7, [0, 0, d * 0.1], [HALF_PI, 0, 0], 16);
      p.lathe("redGlow", [[r * 0.45, 0], [r * 0.35, d * 0.15], [0.001, d * 0.2]], [0, 0, -d * 0.25], 12, [-HALF_PI, 0, 0]);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        p.cyl("metal", 0.002, d * 0.26, [Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, d * 0.36], [HALF_PI, 0, 0], 6, 0.0005);
      }
      break;
    }
    case "claymore": {
      // A curved box on two pairs of folding legs, its sight on top.
      const bh = h * 0.62;
      const by = h / 2 - bh / 2;
      const seg = w / 3;
      for (const [i, yaw] of [[-1, -0.22], [0, 0], [1, 0.22]] as const) p.box("olive", [seg * 1.04, bh, d * 0.55], [i * seg * 0.98, by, Math.abs(i) * d * 0.12], [0, yaw, 0]);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) p.box("metal", [0.003, h - bh + 0.01, 0.003], [sx * w * 0.33, -h / 2 + (h - bh) / 2, sz * d * 0.25], [sz * 0.35, 0, sx * 0.15]);
      p.box("dark", [0.02, 0.012, 0.012], [0, h / 2 - 0.004, 0]);
      break;
    }
    case "breach_charge": {
      // A frame of charge strips round the wall it's on, a detonator at its foot.
      const s = 0.065;
      const t = d * 0.7;
      p.box("tan", [w, s, t], [0, h / 2 - s / 2, 0]);
      p.box("tan", [w, s, t], [0, -h / 2 + s / 2, 0]);
      p.box("tan", [s, h - 2 * s, t], [w / 2 - s / 2, 0, 0]);
      p.box("tan", [s, h - 2 * s, t], [-w / 2 + s / 2, 0, 0]);
      for (const y of [-0.25, 0, 0.25]) p.box("black", [w * 1.004, 0.012, t * 1.04], [0, y * h, 0]);
      p.box("black", [0.12, 0.09, d], [0, -h / 2 + s + 0.05, 0]);
      break;
    }
    case "hard_breach_charge": {
      p.box("dark", [w, h, d * 0.3], [0, 0, d * 0.35]);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) p.cyl("olive", w * 0.16, d * 0.6, [sx * w * 0.24, sy * h * 0.24, -d * 0.1], [HALF_PI, 0, 0], 16);
      p.box("black", [w * 0.22, h * 0.22, d * 0.7], [0, 0, -d * 0.05]);
      p.box("metal", [w * 0.4, 0.02, 0.02], [0, h / 2 - 0.03, -d * 0.3]);
      break;
    }
    case "exothermic_charge": {
      // A frame, a row of canisters across it, the control box in the middle.
      const s = 0.05;
      const t = d * 0.5;
      p.box("dark", [w, s, t], [0, h / 2 - s / 2, d * 0.2]);
      p.box("dark", [w, s, t], [0, -h / 2 + s / 2, d * 0.2]);
      p.box("dark", [s, h, t], [w / 2 - s / 2, 0, d * 0.2]);
      p.box("dark", [s, h, t], [-w / 2 + s / 2, 0, d * 0.2]);
      const n = 6;
      for (let i = 0; i < n; i++) p.cyl("metal", 0.035, h - 2 * s, [-w / 2 + s + (i + 0.5) * ((w - 2 * s) / n), 0, -d * 0.05], [0, 0, 0], 12);
      p.box("black", [0.2, 0.16, d * 0.8], [0, 0, -d * 0.1]);
      p.box("redGlow", [0.04, 0.02, 0.004], [0, 0.03, -d * 0.5]);
      break;
    }
    case "cluster_charge": {
      // Fuze's launcher on its wall: the mounting plate against it (+z; its tubes fire through), the box, and on the
      // room's side a carry handle and the arming panel with its light.
      p.box("dark", [w, h, d * 0.15], [0, 0, d * 0.425]);
      p.box("olive", [w * 0.86, h * 0.86, d * 0.75], [0, 0, d * 0.0]);
      for (const sx of [-1, 1]) p.box("dark", [w * 0.06, h * 0.9, d * 0.6], [sx * w * 0.42, 0, d * 0.05]);
      p.box("black", [w * 0.4, h * 0.2, d * 0.1], [0, -h * 0.18, -d * 0.42]);
      p.box("redGlow", [0.02, 0.012, 0.004], [w * 0.12, -h * 0.18, -d * 0.472]);
      for (const sx of [-1, 1]) p.box("metal", [0.012, 0.012, d * 0.12], [sx * w * 0.16, h * 0.2, -d * 0.43]);
      p.box("metal", [w * 0.32 + 0.012, 0.014, 0.014], [0, h * 0.2, -d * 0.49]);
      break;
    }
    case "deployable_shield": {
      // Three armour panels in a shallow curve (its front, −z, toward the attackers), a viewing slit, feet under it.
      const pw = w / 3;
      const T = 0.03;
      const yaw = 0.22;
      const z0 = -d / 2 + T / 2 + 0.004;
      p.box("dark", [pw, h * 0.94, T], [0, h * 0.03, z0]);
      for (const sx of [-1, 1]) p.box("dark", [pw, h * 0.94, T], [sx * (pw / 2 + (pw / 2) * Math.cos(yaw)), h * 0.03, z0 + (pw / 2) * Math.sin(yaw)], [0, -sx * yaw, 0]);
      p.box("glass", [pw * 0.7, 0.035, T * 1.1], [0, h * 0.3, z0]);
      p.box("black", [pw * 0.78, 0.055, T * 1.04], [0, h * 0.3, z0]);
      for (const sx of [-1, 1]) p.box("metal", [0.05, 0.03, d * 0.9], [sx * w * 0.3, -h / 2 + 0.015, 0]);
      p.box("black", [w * 0.5, 0.025, 0.03], [0, h * 0.1, z0 + T / 2 + 0.015]);
      break;
    }
    case "barbed_wire": {
      // A coil of wire along its length (flattened to its footprint), barbs on it, stakes holding it.
      const ry = h / 2 - 0.02;
      const rz = d / 2 - 0.02;
      const turns = Math.round(w / 0.11);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= turns * 12; i++) {
        const t = i / (turns * 12);
        const a = t * turns * Math.PI * 2;
        pts.push(new THREE.Vector3(-w / 2 + 0.01 + t * (w - 0.02), Math.sin(a) * ry, Math.cos(a) * rz));
      }
      p.add("metal", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 12, 0.0035, 4, false));
      for (let i = 0; i < turns * 3; i++) {
        const t = (i + 0.5) / (turns * 3);
        const a = t * turns * Math.PI * 2;
        p.box("metal", [0.003, 0.03, 0.003], [-w / 2 + 0.01 + t * (w - 0.02), Math.sin(a) * ry, Math.cos(a) * rz], [a, 0, 0.6]);
      }
      // Its stakes.
      for (const x of [-w / 2 + 0.05, 0, w / 2 - 0.05]) p.box("dark", [0.02, h, 0.02], [x, 0, 0]);
      break;
    }
    case "observation_blocker": {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        p.box("metal", [0.006, h * 0.45, 0.006], [Math.cos(a) * w * 0.3, -h / 2 + h * 0.2, Math.sin(a) * d * 0.3], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]);
      }
      p.cyl("dark", w * 0.32, h * 0.45, [0, h * 0.12, 0], [0, 0, 0], 16);
      p.lathe("glass", [[w * 0.32, 0], [w * 0.25, h * 0.08], [0.001, h * 0.12]], [0, h * 0.345, 0], 16);
      p.cyl("blueGlow", w * 0.33, 0.006, [0, h * 0.25, 0], [0, 0, 0], 16);
      break;
    }
    case "signal_disruptor": {
      p.box("dark", [w * 0.96, h * 0.5, d * 0.96], [0, -h * 0.25, 0]);
      p.lathe("black", [[w * 0.25, 0], [w * 0.2, h * 0.15], [0.001, h * 0.2]], [0, 0, 0], 16);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) p.cyl("black", 0.005, h * 0.5, [x * w * 0.36, h * 0.25, z * d * 0.36], [0, 0, 0], 6);
      p.box("greenGlow", [0.04, 0.008, 0.004], [0, -h * 0.2, -d * 0.481]);
      break;
    }
    case "cardiac_sensor":
    case "jegeo_payload": {
      // Held up to the face: its screen on the side toward the holder (+z).
      p.box("dark", [w, h, d * 0.8], [0, 0, -d * 0.1]);
      p.box("black", [w * 0.86, h * 0.72, d * 0.25], [0, h * 0.06, d * 0.35]);
      if (id === "cardiac_sensor") {
        p.cyl("metal", 0.012, h * 0.3, [w * 0.3, h / 2 - h * 0.15, -d * 0.2], [0, 0, 0], 8);
        p.box("black", [w * 0.6, h * 0.2, d], [0, -h / 2 + h * 0.1, 0]);
      }
      break;
    }
    case "mirror_canister": {
      p.cyl("dark", w / 2 - 0.004, h * 0.8, [0, -h * 0.1, 0], [0, 0, 0], 16);
      p.cyl("metal", w / 2 - 0.002, h * 0.2, [0, h * 0.4, 0], [0, 0, 0], 16);
      break;
    }
    case "breaching_hammer": {
      // A long handle, its grip wrapped, the head across its top.
      p.cyl("tan", 0.016, h * 0.85, [0, -h * 0.07, 0], [0, 0, 0], 10);
      p.cyl("rubber", 0.019, h * 0.22, [0, -h / 2 + h * 0.12, 0], [0, 0, 0], 10);
      p.box("metal", [w * 0.55, h * 0.1, d], [0, h / 2 - h * 0.05, 0]);
      p.box("dark", [w * 0.62, h * 0.025, d * 1.02], [0, h / 2 - h * 0.05, 0]);
      break;
    }
    default:
      return null;
  }
  return p.done();
}

/**
 * The drone (Phase 7; Brava's Kludge, bigger, with a spike), within its size: a rounded hull between two knobbly
 * tyres, the camera at its front with a light, an antenna back over it, a skid; a team stripe. Returns the hull's parts
 * and each wheel's (the wheels turn as it drives).
 */
export function droneShape(size: V3, kludge = false): { hull: Map<ShapeMat, THREE.BufferGeometry>; wheel: Map<ShapeMat, THREE.BufferGeometry> } {
  const [w, h, l] = size;
  const hull = new Parts();
  const tyreW = w * 0.18;
  const inner = w - 2 * tyreW - 0.006;
  // The hull: a side profile, rounded at the ends, extruded across.
  // (The hull stops short of the front: the camera's housing and lens end at the box's face.)
  const hl = l / 2 - 0.016;
  const top = h * 0.3;
  const bottom = -h * 0.33;
  const shape = new THREE.Shape();
  shape.moveTo(-hl + 0.02, bottom);
  shape.lineTo(hl - 0.02, bottom);
  shape.quadraticCurveTo(hl, bottom, hl, bottom + 0.02);
  shape.lineTo(hl, top - 0.02);
  shape.quadraticCurveTo(hl, top, hl - 0.025, top);
  shape.lineTo(-hl + 0.03, top);
  shape.quadraticCurveTo(-hl, top, -hl, top - 0.03);
  shape.lineTo(-hl, bottom + 0.02);
  shape.quadraticCurveTo(-hl, bottom, -hl + 0.02, bottom);
  const g = new THREE.ExtrudeGeometry(shape, { depth: inner - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 4 });
  g.rotateY(-HALF_PI); // the profile's x (forward along the hull) → z, extruded across x
  g.translate((inner - 0.004) / 2, 0, 0);
  hull.add("dark", g);
  hull.box("team", [inner * 1.01, 0.012, hl * 1.2], [0, top - 0.004, 0.01]);
  // The camera at the front: its housing, lens, light.
  hull.cyl("black", h * 0.2, 0.026, [0, h * 0.02, -l / 2 + 0.017], [HALF_PI, 0, 0], 16);
  hull.cyl("glass", h * 0.14, 0.004, [0, h * 0.02, -l / 2 + 0.002], [HALF_PI, 0, 0], 16);
  hull.box("redGlow", [0.006, 0.006, 0.003], [h * 0.25, h * 0.12, -hl - 0.002]);
  // The antenna, swept back, its tip; the skid under the back.
  hull.cyl("black", 0.002, h * 0.9, [0, top + h * 0.38, hl * 0.6], [-0.5, 0, 0], 6);
  hull.cyl("black", 0.005, 0.006, [0, top + h * 0.78, hl * 0.6 + h * 0.22], [-0.5, 0, 0], 8);
  hull.box("metal", [inner * 0.4, 0.008, 0.04], [0, bottom - 0.004, hl * 0.8], [0.3, 0, 0]);
  // The axle through.
  hull.cyl("metal", 0.008, w - 0.01, [0, 0, 0], [0, 0, HALF_PI], 10);
  if (kludge) {
    // Brava's: a spike on a mount over the hull, an orange band.
    hull.cyl("metal", 0.012, h * 0.5, [0, top + h * 0.2, -hl * 0.4], [-0.9, 0, 0], 8, 0.002);
    hull.box("yellow", [inner * 1.01, 0.01, 0.02], [0, top * 0.4, -hl * 0.6]);
  }
  // A wheel (centred on its axle, turning about x): the tyre with its lugs, the hub and spokes.
  const wheel = new Parts();
  const r = h / 2;
  wheel.cyl("rubber", r * 0.92, tyreW, [0, 0, 0], [0, 0, HALF_PI], 20);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    wheel.box("rubber", [tyreW * 0.95, r * 0.12, r * 0.18], [0, Math.sin(a) * r * 0.94, Math.cos(a) * r * 0.94], [a, 0, 0]);
  }
  wheel.cyl("metal", r * 0.5, tyreW * 1.04, [0, 0, 0], [0, 0, HALF_PI], 14);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    wheel.box("dark", [tyreW * 1.06, r * 0.08, r * 0.7], [0, Math.sin(a) * r * 0.25, Math.cos(a) * r * 0.25], [a, 0, 0]);
  }
  wheel.cyl("team", r * 0.18, tyreW * 1.1, [0, 0, 0], [0, 0, HALF_PI], 10);
  return { hull: hull.done(), wheel: wheel.done() };
}

/** A model built from shape parts: its meshes, with materials of its own. */
export interface ShapeModel {
  readonly group: THREE.Group;
  dispose(): void;
}

/** Meshes for a shape's parts, each material made here (the "team" parts in `teamColor`); dispose frees them all. */
export function shapeModel(parts: Map<ShapeMat, THREE.BufferGeometry>, teamColor = 0xffffff): ShapeModel {
  const group = new THREE.Group();
  const mats: THREE.Material[] = [];
  for (const [m, g] of parts) {
    const p = SHAPE_MATERIALS[m];
    const mat = new THREE.MeshStandardMaterial({ color: m === "team" ? teamColor : p.color, roughness: p.roughness, metalness: p.metalness, emissive: p.emissive ?? 0x000000 });
    mats.push(mat);
    group.add(new THREE.Mesh(g, mat));
  }
  return {
    group,
    dispose() {
      group.removeFromParent();
      for (const g of parts.values()) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

/** A big placed gadget as it's carried: rolled, folded or coiled (null for one carried as it is). */
function packed(id: string): Map<ShapeMat, THREE.BufferGeometry> | null {
  const p = new Parts();
  switch (id) {
    case "breach_charge": {
      // The charge rolled up, two straps round it, its detonator tucked on top.
      p.cyl("tan", 0.075, 0.26, [0, 0, 0], [0, 0, HALF_PI], 16);
      for (const x of [-0.07, 0.07]) p.cyl("black", 0.077, 0.02, [x, 0, 0], [0, 0, HALF_PI], 16);
      p.box("black", [0.09, 0.03, 0.06], [0, 0.085, 0]);
      break;
    }
    case "exothermic_charge": {
      // Folded in three: a dark block, its canisters showing along one side, the control box.
      p.box("dark", [0.3, 0.22, 0.08], [0, 0, 0.02]);
      for (let i = 0; i < 4; i++) p.cyl("metal", 0.03, 0.2, [-0.105 + i * 0.07, 0, -0.035], [0, 0, 0], 12);
      p.box("black", [0.12, 0.08, 0.04], [0, 0, -0.08]);
      break;
    }
    case "deployable_shield": {
      // Its three panels folded flat on each other, the leg along the back.
      for (let i = 0; i < 3; i++) p.box("dark", [0.3, 0.32, 0.022], [0, 0, -0.026 + i * 0.026]);
      p.box("black", [0.2, 0.03, 0.03], [0, 0.09, -0.04]);
      p.box("metal", [0.03, 0.3, 0.02], [0, 0, 0.05]);
      break;
    }
    case "barbed_wire": {
      // A flat coil, tied.
      for (let i = 0; i < 4; i++) p.torus("metal", 0.1 + i * 0.012, 0.004, [0, -0.012 + i * 0.008, 0], [HALF_PI, 0, 0]);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        p.box("metal", [0.003, 0.026, 0.003], [Math.cos(a) * 0.118, 0.002, Math.sin(a) * 0.118], [a, 0, 0.7]);
      }
      p.box("dark", [0.02, 0.05, 0.03], [0.118, 0, 0]);
      break;
    }
    default:
      return null;
  }
  return p.done();
}

/** A detonator: a handset with a guarded button, a stub antenna and a light. */
function detonator(): Map<ShapeMat, THREE.BufferGeometry> {
  const p = new Parts();
  p.box("dark", [0.046, 0.085, 0.026], [0, 0, 0]);
  p.box("black", [0.03, 0.03, 0.006], [0, -0.018, -0.016]);
  p.cyl("red", 0.009, 0.008, [0, 0.022, -0.016], [HALF_PI, 0, 0], 12);
  p.cyl("black", 0.003, 0.03, [0.014, 0.057, 0.004], [0, 0, 0], 6);
  p.box("redGlow", [0.005, 0.005, 0.002], [-0.014, 0.034, -0.0135]);
  return p.done();
}

/**
 * What's in the hands for a gadget (or "detonator"): its shape — packed if it's a big placed one, a plain dark box
 * if it has none — scaled down to at most `cap` on its longest side. Returns the parts and its size as held.
 */
export function heldShape(id: string, size: V3, cap: number): { parts: Map<ShapeMat, THREE.BufferGeometry>; size: [number, number, number] } {
  let parts = id === "detonator" ? detonator() : (packed(id) ?? gadgetShape(id, size));
  if (!parts) {
    const p = new Parts();
    p.box("dark", size);
    parts = p.done();
  }
  const box = new THREE.Box3();
  for (const g of parts.values()) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  const s = box.getSize(new THREE.Vector3());
  const k = Math.min(1, cap / Math.max(s.x, s.y, s.z));
  if (k < 1) for (const g of parts.values()) g.scale(k, k, k);
  return { parts, size: [s.x * k, s.y * k, s.z * k] };
}

/** The knife (a melee swing): its blade along −z with a clipped point and a fuller, the guard, the wrapped handle. */
export function knifeShape(): Map<ShapeMat, THREE.BufferGeometry> {
  const p = new Parts();
  const blade = new THREE.Shape();
  blade.moveTo(0, -0.014);
  blade.lineTo(0.125, -0.014);
  blade.lineTo(0.165, 0.004);
  blade.lineTo(0.13, 0.014);
  blade.lineTo(0, 0.014);
  const g = new THREE.ExtrudeGeometry(blade, { depth: 0.0016, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.004, bevelSegments: 1 });
  g.translate(0, 0, -0.0008);
  g.rotateY(HALF_PI); // the profile's x → −z (forward), its thickness across x
  p.add("metal", g, [0, 0, -0.012]);
  p.box("dark", [0.0045, 0.004, 0.09], [0, 0.004, -0.07]);
  p.box("black", [0.012, 0.05, 0.012], [0, 0, -0.006]);
  p.box("rubber", [0.02, 0.028, 0.105], [0, -0.001, 0.052]);
  for (let i = 0; i < 4; i++) p.box("black", [0.021, 0.029, 0.006], [0, -0.001, 0.02 + i * 0.022]);
  p.box("black", [0.022, 0.032, 0.012], [0, -0.002, 0.108]);
  return p.done();
}
