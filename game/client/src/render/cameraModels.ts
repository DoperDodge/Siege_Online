// The level's default cameras drawn in a match (Phase 7, intel/DESIGN.md §3): a small box with a lens where each one
// is, facing its way; a broken one turns dark and hangs askew. Greybox until the art pass.
import * as THREE from "three";
import { DEG } from "@redmond/shared";

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
