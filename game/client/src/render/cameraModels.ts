// The cameras drawn in a match (Phase 7, intel/DESIGN.md §3, §4): the level's default ones, a small box with a lens
// where each one is, facing its way (a broken one turns dark and hangs askew), and the round's Bulletproof Cameras.
// Greybox until the art pass.
import * as THREE from "three";
import { DEG, type BpCam } from "@redmond/shared";

export class CameraModels {
  private readonly items: { group: THREE.Group; box: THREE.Mesh }[] = [];
  private readonly whole = new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.5 });
  private readonly dead = new THREE.MeshStandardMaterial({ color: 0x26292d, roughness: 0.9 });
  private readonly lens = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.2 });
  private broken = -1;

  constructor(scene: THREE.Scene, cams: readonly { pos: readonly number[]; yawDeg: number; pitchDeg: number }[]) {
    const body = new THREE.BoxGeometry(0.16, 0.12, 0.2);
    const glass = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 12);
    for (const c of cams) {
      const group = new THREE.Group();
      const box = new THREE.Mesh(body, this.whole);
      const lens = new THREE.Mesh(glass, this.lens);
      lens.rotation.x = Math.PI / 2;
      lens.position.z = -0.11;
      group.add(box, lens);
      group.position.set(c.pos[0], c.pos[1], c.pos[2]);
      group.rotation.set(c.pitchDeg * DEG, c.yawDeg * DEG, 0, "YXZ");
      scene.add(group);
      this.items.push({ group, box });
    }
  }

  /** `broken`: a bit for each broken camera, in the level's order. */
  update(broken: number) {
    if (broken === this.broken) return;
    this.broken = broken;
    this.items.forEach((it, i) => {
      const b = (broken & (1 << i)) !== 0;
      it.box.material = b ? this.dead : this.whole;
      it.group.rotation.z = b ? 0.5 : 0;
    });
  }
}

/**
 * The round's Bulletproof Cameras (Phase 7 M5, intel/DESIGN.md §4): a dark box with a plate round its lens, on its
 * wall or the floor, facing its way; a broken one turns grey and hangs askew. Greybox until the art pass.
 */
export class BpCameraModels {
  /** Each camera's group, and its box and plate (they turn grey when it breaks). */
  private readonly items: { group: THREE.Group; shell: THREE.Mesh[] }[] = [];
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

  update(cams: readonly BpCam[]) {
    const key = cams.map((c) => `${c.pos.join(",")},${c.yaw},${c.broken}`).join("|");
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
      group.add(box, plate, lens);
      this.scene.add(group);
      this.items.push({ group, shell: [box, plate] });
    }
    cams.forEach((c, i) => {
      const it = this.items[i];
      it.group.position.set(c.pos[0], c.pos[1], c.pos[2]);
      it.group.rotation.set(0, c.yaw, c.broken ? 0.5 : 0, "YXZ");
      for (const m of it.shell) m.material = c.broken ? this.dead : this.whole;
    });
  }
}
