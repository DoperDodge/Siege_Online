// The cameras drawn in a match (Phase 7, intel/DESIGN.md §3, §4): the level's default ones and the round's Bulletproof
// Cameras. A default camera (Phase 10 M6, render/DESIGN.md §9.2) is a bullet camera — its housing under a sun hood, the
// lens ring and glass — on a bracket to the wall behind it, a pole to the ceiling over it, or a post down to the ground
// (the level, raycast, says which); all of it within the 24 cm cube it's shot in, but the bracket. A broken one turns
// dark and hangs askew on its bracket. A camera someone watches shows a light by its lens (research/intel.md §3, Y6S4's
// colours: blue to its own team, red to the other).
import * as THREE from "three";
import { DEG, GFlag, type Gadget, type Vec3 } from "@redmond/shared";

/** A watched camera's light: a small bright dot, blue for the viewer's own team's camera, red for the other's. */
const LIGHT_GEO = new THREE.SphereGeometry(0.012, 8, 6);
const LIGHTS = { ours: new THREE.MeshBasicMaterial({ color: 0x4da3ff }), theirs: new THREE.MeshBasicMaterial({ color: 0xff3b3b }) };

function light(x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(LIGHT_GEO, LIGHTS.ours);
  m.position.set(x, y, z);
  m.visible = false;
  return m;
}

/** How far the level is from a point along a direction (null past `max`): where a camera's bracket goes. */
export type Reach = (origin: Vec3, dir: Vec3, max: number) => number | null;

/** How far a camera looks for a wall behind it or a ceiling over it to hang from. */
const MOUNT_LOOK_M = 1.2;
/** The bracket's joint, over the housing's back (in the camera's frame, its lens toward −z). */
const JOINT: Vec3 = [0, 0.095, 0.045];

export class CameraModels {
  private readonly items: { head: THREE.Group; shell: THREE.Mesh[]; light: THREE.Mesh }[] = [];
  private readonly whole = new THREE.MeshStandardMaterial({ color: 0xdfe3e7, roughness: 0.45, metalness: 0.1 });
  private readonly dead = new THREE.MeshStandardMaterial({ color: 0x26292d, roughness: 0.9 });
  private readonly black = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.5, metalness: 0.2 });
  private readonly lens = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.12, metalness: 0.6 });
  private readonly bracket = new THREE.MeshStandardMaterial({ color: 0xbfc5cb, roughness: 0.55, metalness: 0.4 });
  private shown = "";

  constructor(scene: THREE.Scene, cams: readonly { pos: readonly number[]; yawDeg: number; pitchDeg: number }[], reach?: Reach) {
    const along = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2);
    const housing = along(new THREE.CylinderGeometry(0.046, 0.05, 0.19, 18));
    const hood = new THREE.BoxGeometry(0.118, 0.008, 0.225);
    const cap = along(new THREE.CylinderGeometry(0.047, 0.047, 0.014, 18));
    const ring = along(new THREE.CylinderGeometry(0.041, 0.041, 0.022, 18));
    const glass = along(new THREE.CylinderGeometry(0.031, 0.031, 0.024, 18));
    const neck = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8);
    const joint = new THREE.SphereGeometry(0.021, 10, 8);
    for (const c of cams) {
      const group = new THREE.Group();
      group.position.set(c.pos[0], c.pos[1], c.pos[2]);
      group.rotation.set(0, c.yawDeg * DEG, 0);
      // The head: pitched and (when broken) askew about the camera's eye.
      const head = new THREE.Group();
      head.rotation.set(c.pitchDeg * DEG, 0, 0, "YXZ");
      const body = new THREE.Mesh(housing, this.whole);
      const top = new THREE.Mesh(hood, this.whole);
      top.position.set(0, 0.058, -0.012);
      const back = new THREE.Mesh(cap, this.black);
      back.position.z = 0.1;
      const front = new THREE.Mesh(ring, this.black);
      front.position.z = -0.1;
      const eye = new THREE.Mesh(glass, this.lens);
      eye.position.z = -0.103;
      const stem = new THREE.Mesh(neck, this.bracket);
      stem.position.set(JOINT[0], JOINT[1] - 0.03, JOINT[2]);
      const on = light(0.034, 0.03, -0.108);
      head.add(body, top, back, front, eye, stem, on);
      const ball = new THREE.Mesh(joint, this.bracket);
      ball.position.set(...JOINT);
      group.add(head, ball, ...this.mount(c, reach));
      scene.add(group);
      this.items.push({ head, shell: [body, top], light: on });
    }
  }

  /**
   * A camera's bracket, in its frame (turned by its yaw only): an arm back to the wall behind it with a plate on the
   * wall, else a pole up to the ceiling over it with a round plate, else a post down to the ground.
   */
  private mount(c: { pos: readonly number[]; yawDeg: number }, reach?: Reach): THREE.Mesh[] {
    if (!reach) return [];
    const yaw = c.yawDeg * DEG;
    const p: Vec3 = [c.pos[0], c.pos[1] + JOINT[1], c.pos[2]];
    const behind = reach(p, [Math.sin(yaw), 0, Math.cos(yaw)], MOUNT_LOOK_M);
    const above = reach(p, [0, 1, 0], MOUNT_LOOK_M);
    if (behind !== null && (above === null || behind <= above)) {
      const len = Math.max(0.01, behind - JOINT[2] - 0.012);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, len), this.bracket);
      arm.position.set(0, JOINT[1], JOINT[2] + len / 2);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.012), this.bracket);
      plate.position.set(0, JOINT[1], behind - 0.006);
      return [arm, plate];
    }
    if (above !== null) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, Math.max(0.01, above - 0.012), 8), this.bracket);
      pole.position.set(0, JOINT[1] + above / 2, JOINT[2]);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 16), this.bracket);
      plate.position.set(0, JOINT[1] + above - 0.006, JOINT[2]);
      return [pole, plate];
    }
    const down = reach(p, [0, -1, 0], 8) ?? 3;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, down, 10), this.bracket);
    post.position.set(0, JOINT[1] - down / 2, JOINT[2] + 0.03);
    return [post];
  }

  /** `broken`, `watched`: a bit for each, in the level's order; `ours`: the viewer is on the cameras' team. */
  update(broken: number, watched = 0, ours = true) {
    const key = `${broken}:${watched}:${ours}`;
    if (key === this.shown) return;
    this.shown = key;
    this.items.forEach((it, i) => {
      const b = (broken & (1 << i)) !== 0;
      for (const m of it.shell) m.material = b ? this.dead : this.whole;
      it.head.rotation.z = b ? 0.5 : 0;
      it.light.visible = !b && (watched & (1 << i)) !== 0;
      it.light.material = ours ? LIGHTS.ours : LIGHTS.theirs;
    });
  }
}

/**
 * The round's Bulletproof Cameras (Phase 7 M5, intel/DESIGN.md §4): a dark box with a plate round its lens, on its
 * wall or the floor, facing its way; a broken one turns grey and hangs askew. Greybox until the art pass.
 */
export class BpCameraModels {
  /** Each camera's group, its box and plate (they turn grey when it breaks), and its light. */
  private readonly items: { group: THREE.Group; shell: THREE.Mesh[]; light: THREE.Mesh }[] = [];
  private readonly body: THREE.BoxGeometry;
  private readonly plate: THREE.BoxGeometry;
  private readonly glass = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12);
  private readonly whole = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.4, metalness: 0.3 });
  private readonly dead = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.9 });
  private readonly lens = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.2 });
  private shown = "";

  constructor(
    private readonly scene: THREE.Scene,
    private readonly size: readonly [number, number, number],
  ) {
    const [w, h, d] = size;
    this.body = new THREE.BoxGeometry(w, h, d);
    this.plate = new THREE.BoxGeometry(w * 1.1, h * 1.1, 0.012);
  }

  /** `watched`: a bit for each camera someone watches, in the round's order; `ours`: the viewer is a defender. */
  update(cams: readonly Gadget[], watched = 0, ours = true) {
    const key = `${cams.map((c) => `${c.pos.join(",")},${c.yaw},${c.flags}`).join("|")}:${watched}:${ours}`;
    if (key === this.shown) return;
    this.shown = key;
    while (this.items.length > cams.length) this.scene.remove(this.items.pop()!.group);
    while (this.items.length < cams.length) {
      const group = new THREE.Group();
      const box = new THREE.Mesh(this.body, this.whole);
      const plate = new THREE.Mesh(this.plate, this.whole);
      plate.position.z = -this.size[2] / 2 - 0.006; // its front: −z, the way a yaw of 0 faces
      const lens = new THREE.Mesh(this.glass, this.lens);
      lens.rotation.x = Math.PI / 2;
      lens.position.z = -this.size[2] / 2 - 0.02;
      const on = light(this.size[0] / 2 - 0.02, this.size[1] / 2 - 0.02, -this.size[2] / 2 - 0.013);
      group.add(box, plate, lens, on);
      this.scene.add(group);
      this.items.push({ group, shell: [box, plate], light: on });
    }
    cams.forEach((c, i) => {
      const it = this.items[i];
      const broken = (c.flags & GFlag.Broken) !== 0;
      it.group.position.set(c.pos[0], c.pos[1], c.pos[2]);
      it.group.rotation.set(0, c.yaw, broken ? 0.5 : 0, "YXZ");
      for (const m of it.shell) m.material = broken ? this.dead : this.whole;
      it.light.visible = !broken && (watched & (1 << i)) !== 0;
      it.light.material = ours ? LIGHTS.ours : LIGHTS.theirs;
    });
  }
}
