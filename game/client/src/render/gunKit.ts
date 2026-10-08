// Placeholder guns built from boxes and cylinders (Phase 3 M9): one look per weapon class, with the sight,
// barrel attachment, grip and laser the loadout carries (data/presentation/gun_kit.json). The same model
// serves the first-person viewmodel and the gun other players hold.
import * as THREE from "three";
import { loadPresentationData, type GunKit } from "@redmond/shared";

/** What the model needs to know about a weapon: its class and the attachments picked. */
export interface GunLook {
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
  dispose(): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);

export function buildGun(look: GunLook, kit: GunKit = loadPresentationData().gunKit): GunModel {
  const shape = kit.classes[look.class as keyof GunKit["classes"]] ?? kit.classes.assault_rifle;
  const geoms: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const material = (color: string, emissive = false) => {
    const m = emissive ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35 });
    mats.push(m);
    return m;
  };
  const body = material(shape.color);
  const fitted = material(kit.colors.attachment);
  const group = new THREE.Group();
  const box = (s: readonly [number, number, number], m: THREE.Material, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(s[0], s[1], s[2]);
    geoms.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  /** A cylinder lying along the barrel axis, centred at (x, y, z). */
  const tube = (r: number, len: number, m: THREE.Material, x: number, y: number, z: number) => {
    const g = new THREE.CylinderGeometry(r, r, len, 12);
    geoms.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.quaternion.setFromUnitVectors(UP, FORWARD);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  const [rw, rh, rl] = shape.receiver;
  const ry = 0.035 + rh / 2; // the receiver sits just above the hand on the grip
  const rz = shape.receiverZ;
  const front = rz - rl / 2;
  const top = ry + rh / 2;
  box(shape.receiver, body, 0, ry, rz);
  box([rw * 0.7, 0.085, 0.034], body, 0, 0, 0.0).rotation.x = -0.25; // pistol grip, in the hand
  // Barrel, then whatever is screwed on the end of it.
  const by = ry + rh * 0.18;
  tube(shape.barrel.radius, shape.barrel.length, body, 0, by, front - shape.barrel.length / 2);
  let muzzleZ = front - shape.barrel.length;
  const b = look.pick.barrel ? kit.barrels[look.pick.barrel as keyof GunKit["barrels"]] : undefined;
  if (b) {
    tube(b.radius, b.length, fitted, 0, by, muzzleZ - b.length / 2);
    muzzleZ -= b.length;
  }
  if (shape.stock) box(shape.stock, body, 0, ry - rh * 0.12, rz + rl / 2 + shape.stock[2] / 2);
  const mag = box(shape.mag, body, 0, ry - rh / 2 - shape.mag[1] / 2, shape.magZ);
  mag.rotation.x = shape.magTilt;
  // The sight on top; its line is where the eye goes when aiming.
  const sightKey = (look.pick.sight ?? "iron") as keyof GunKit["sights"];
  const sight = kit.sights[sightKey] ?? kit.sights.iron;
  let sightY: number;
  let reticle: GunModel["reticle"] = "posts";
  // Every sight is open along its line (the eye looks through it at the target).
  if (sight.kind === "posts") {
    // A rear notch (two posts with a gap) and a front post whose tip is the aim point.
    const h = sight.height;
    sightY = top + h * 0.85;
    for (const side of [-1, 1]) box([0.005, h, 0.008], fitted, side * 0.0085, top + h / 2, rz + rl * 0.38);
    box([0.004, h * 0.85, 0.006], fitted, 0, top + (h * 0.85) / 2, front + 0.02);
  } else if (sight.kind === "box") {
    // A red dot / holo: a frame around a window (the reticle is drawn on screen).
    const [w, h, l] = sight.size;
    const bar = Math.min(w, h) * 0.15;
    sightY = top + h * 0.55;
    box([w, bar, l], fitted, 0, top + bar / 2, rz); // base
    box([w, bar, l], fitted, 0, top + h - bar / 2, rz); // hood
    for (const side of [-1, 1]) box([bar, h, l], fitted, side * (w / 2 - bar / 2), top + h / 2, rz);
    reticle = sight.reticle;
  } else {
    // A scope: an open tube (at full magnification the scope view replaces the gun).
    const g = new THREE.CylinderGeometry(sight.radius, sight.radius, sight.length, 16, 1, true);
    geoms.push(g);
    const glassless = new THREE.MeshStandardMaterial({ color: kit.colors.attachment, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide });
    mats.push(glassless);
    const mesh = new THREE.Mesh(g, glassless);
    mesh.quaternion.setFromUnitVectors(UP, FORWARD);
    sightY = top + sight.radius + 0.012;
    mesh.position.set(0, sightY, rz);
    group.add(mesh);
    reticle = sight.reticle;
  }
  const grip = look.pick.grip ? kit.grips[look.pick.grip as keyof GunKit["grips"]] : undefined;
  if (grip) box(grip, fitted, 0, ry - rh / 2 - grip[1] / 2, front + 0.05);
  let laser: THREE.Vector3 | null = null;
  if (look.pick.underbarrel === "laser") {
    const l = kit.underbarrel.laser;
    const lx = rw / 2 + l[0] / 2;
    box(l, fitted, lx, by, front + 0.04);
    box([0.008, 0.008, 0.004], material(kit.colors.laser, true), lx, by, front + 0.04 - l[2] / 2);
    laser = new THREE.Vector3(lx, by, front + 0.04 - l[2] / 2);
  }
  return {
    group,
    sight: new THREE.Vector3(0, sightY, rz),
    muzzle: new THREE.Vector3(0, by, muzzleZ),
    mag,
    magHome: mag.position.clone(),
    laser,
    reticle,
    dispose() {
      group.removeFromParent();
      for (const g of geoms) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

/** A key that changes whenever the model would (a different weapon or attachments). */
export const gunKey = (look: GunLook) => `${look.class}|${look.pick.sight}|${look.pick.barrel}|${look.pick.grip}|${look.pick.underbarrel}`;
