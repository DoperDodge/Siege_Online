// Fuze's Ballistic Shield as drawn (Phase 8 M11, reworked after Ulo's test): a curved plate with a viewport window of
// bulletproof glass at eye height, from the same frame as its hitboxes (player/hitboxes.ts shieldFrame), so it bends
// with its carrier's lean and slides down as he aims. One mesh for everyone, your own first-person view included (you
// see the world through the window). Its vertices are world points rewritten each frame (52 of them).
import * as THREE from "three";
import { shieldFrame, type GameData, type PawnState, type ShieldPlace, type ShieldPlate } from "@redmond/shared";

/** Columns across: left of the window, the window, right of it. */
const SIDE_COLS = 4;
const MID_COLS = 4;

export class ShieldModel {
  readonly mesh: THREE.Mesh;
  private readonly us: number[];
  private readonly positions: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly plate: THREE.MeshStandardMaterial;
  private readonly glass: THREE.MeshStandardMaterial;

  constructor(private readonly k: ShieldPlate) {
    const wu = Math.min(0.9, k.window.widthM / k.widthM);
    const us: number[] = [];
    for (let i = 0; i <= SIDE_COLS; i++) us.push(-1 + ((1 - wu) * i) / SIDE_COLS);
    for (let i = 1; i <= MID_COLS; i++) us.push(-wu + (2 * wu * i) / MID_COLS);
    for (let i = 1; i <= SIDE_COLS; i++) us.push(wu + ((1 - wu) * i) / SIDE_COLS);
    this.us = us;
    // Rows (metres under the top): the top, the window's top and bottom, the plate's bottom.
    const rows = 4;
    this.positions = new Float32Array(us.length * rows * 3);
    const plate: number[] = [];
    const glass: number[] = [];
    const vi = (c: number, r: number) => r * us.length + c;
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < us.length - 1; c++) {
        const quad = [vi(c, r), vi(c + 1, r), vi(c + 1, r + 1), vi(c, r), vi(c + 1, r + 1), vi(c, r + 1)];
        const inWindow = r === 1 && c >= SIDE_COLS && c < SIDE_COLS + MID_COLS;
        (inWindow ? glass : plate).push(...quad);
      }
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setIndex([...plate, ...glass]);
    this.geometry.addGroup(0, plate.length, 0);
    this.geometry.addGroup(plate.length, glass.length, 1);
    this.plate = new THREE.MeshStandardMaterial({ color: 0x2f3a48, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide });
    this.glass = new THREE.MeshStandardMaterial({ color: 0xa8d4f0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geometry, [this.plate, this.glass]);
    this.mesh.frustumCulled = false; // its vertices are world points, rewritten every frame
    // No shadow: the shadow map is only redrawn when the level changes, so a moving plate's would be left behind (as
    // bodies cast none: the review, M12).
    this.mesh.castShadow = false;
  }

  /** Put it where a body's state has it (`place`), or hide it (none, or prone). */
  update(data: GameData, s: PawnState, place: ShieldPlace | null) {
    const f = place ? shieldFrame(data.movement, data.hitboxes, s, this.k, place) : null;
    this.mesh.visible = f !== null;
    if (!f) return;
    // A rigid plate, from its top down its own height; the window's rows at eye height when it's up (on the back, a
    // window's worth of plate too: the glass faces outward, unseen).
    const win = this.k.window.heightM / 2;
    const rows = place === "front" ? [0, this.k.aboveEyeM - win, this.k.aboveEyeM + win, f.tall] : [0, f.tall * 0.3, f.tall * 0.3 + 0.001, f.tall];
    let o = 0;
    for (const d of rows)
      for (const u of this.us) {
        const p = f.at(u, f.y1 - d);
        this.positions[o++] = p[0];
        this.positions[o++] = p[1];
        this.positions[o++] = p[2];
      }
    const pos = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  dispose() {
    this.geometry.dispose();
    this.plate.dispose();
    this.glass.dispose();
  }
}
