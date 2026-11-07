// The cameras drawn in a match (Phase 7, intel/DESIGN.md §3, §4): the level's default ones, a small box with a lens
// where each one is, facing its way (a broken one turns dark and hangs askew), and the round's Bulletproof Cameras.
// A camera someone watches shows a light by its lens (research/intel.md §3, Y6S4's colours: blue to its own team, red
// to the other). Greybox until the art pass.
import * as THREE from "three";
import { DEG, GFlag, type Gadget } from "@redmond/shared";

/** A watched camera's light: a small bright dot, blue for the viewer's own team's camera, red for the other's. */
const LIGHT_GEO = new THREE.SphereGeometry(0.012, 8, 6);
const LIGHTS = { ours: new THREE.MeshBasicMaterial({ color: 0x4da3ff }), theirs: new THREE.MeshBasicMaterial({ color: 0xff3b3b }) };

function light(x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(LIGHT_GEO, LIGHTS.ours);
  m.position.set(x, y, z);
  m.visible = false;
  return m;
}

export class CameraModels {
  private readonly items: { group: THREE.Group; box: THREE.Mesh; light: THREE.Mesh }[] = [];
  private readonly whole = new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.5 });
  private readonly dead = new THREE.MeshStandardMaterial({ color: 0x26292d, roughness: 0.9 });
  private readonly lens = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.2 });
  private shown = "";

  constructor(scene: THREE.Scene, cams: readonly { pos: readonly number[]; yawDeg: number; pitchDeg: number }[]) {
    const body = new THREE.BoxGeometry(0.16, 0.12, 0.2);
    const glass = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 12);
    for (const c of cams) {
      const group = new THREE.Group();
      const box = new THREE.Mesh(body, this.whole);
      const lens = new THREE.Mesh(glass, this.lens);
      lens.rotation.x = Math.PI / 2;
      lens.position.z = -0.11;
      const on = light(0.055, 0.04, -0.105);
      group.add(box, lens, on);
      group.position.set(c.pos[0], c.pos[1], c.pos[2]);
      group.rotation.set(c.pitchDeg * DEG, c.yawDeg * DEG, 0, "YXZ");
      scene.add(group);
      this.items.push({ group, box, light: on });
    }
  }

  /** `broken`, `watched`: a bit for each, in the level's order; `ours`: the viewer is on the cameras' team. */
  update(broken: number, watched = 0, ours = true) {
    const key = `${broken}:${watched}:${ours}`;
    if (key === this.shown) return;
    this.shown = key;
    this.items.forEach((it, i) => {
      const b = (broken & (1 << i)) !== 0;
      it.box.material = b ? this.dead : this.whole;
      it.group.rotation.z = b ? 0.5 : 0;
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
