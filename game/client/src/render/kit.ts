// A small geometry kit for the art pass's models (Phase 10, render/DESIGN.md §8–§10): parts — boxes, cylinders, wedges —
// each with the level material's per-vertex style (aArt: a fixed style + 1 from LevelArt.fixedStyle, or -1 for the
// room's trim), placed in a model's own frame and merged, already in the world, into one geometry the level's material
// draws (box mapping by position and normal needs no UVs). A model's parts are drawn only: its box in the level is what
// collides.
import * as THREE from "three";

export type V3 = readonly [number, number, number];

export class Kit {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly art: number[] = [];
  /** The model's frame in the world (where its parts go). */
  private readonly frame = new THREE.Matrix4();
  private readonly normalFrame = new THREE.Matrix3();
  private readonly p = new THREE.Vector3();
  private readonly n = new THREE.Vector3();

  /** Parts placed from now on are in this frame (a model's centre and yaw in the world). */
  place(center: V3, yawRad = 0, pitchRad = 0): this {
    this.frame.compose(new THREE.Vector3(...center), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchRad, yawRad, 0, "YXZ")), new THREE.Vector3(1, 1, 1));
    this.normalFrame.getNormalMatrix(this.frame);
    return this;
  }

  private readonly e1 = new THREE.Vector3();
  private readonly e2 = new THREE.Vector3();

  /** A triangle facing `out` (a direction away from the part's inside), in the model's frame. */
  private tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, out: THREE.Vector3, style: number): void {
    const n = this.n.copy(this.e1.copy(b).sub(a)).cross(this.e2.copy(c).sub(a));
    if (n.lengthSq() < 1e-18) return;
    if (n.dot(out) < 0) {
      const t = b;
      b = c;
      c = t;
      n.negate();
    }
    n.normalize().applyMatrix3(this.normalFrame).normalize();
    for (const v of [a, b, c]) {
      this.p.copy(v).applyMatrix4(this.frame);
      this.pos.push(this.p.x, this.p.y, this.p.z);
      this.nor.push(n.x, n.y, n.z);
      this.art.push(style);
    }
  }

  private quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, out: THREE.Vector3, style: number): void {
    this.tri(a, b, c, out, style);
    this.tri(a, c, d, out, style);
  }

  /** A box: centre and size in the model's frame, turned `yaw` about its own vertical. */
  box(c: V3, s: V3, style: number, yaw = 0): this {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const o = new THREE.Vector3(...c);
    const corner = (i: number) => new THREE.Vector3(((i & 1) - 0.5) * s[0], (((i >> 1) & 1) - 0.5) * s[1], (((i >> 2) & 1) - 0.5) * s[2]).applyQuaternion(q).add(o);
    const k = [0, 1, 2, 3, 4, 5, 6, 7].map(corner);
    const dir = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(q);
    this.quad(k[1], k[3], k[7], k[5], dir(1, 0, 0), style);
    this.quad(k[0], k[4], k[6], k[2], dir(-1, 0, 0), style);
    this.quad(k[2], k[6], k[7], k[3], dir(0, 1, 0), style);
    this.quad(k[0], k[1], k[5], k[4], dir(0, -1, 0), style);
    this.quad(k[4], k[5], k[7], k[6], dir(0, 0, 1), style);
    this.quad(k[0], k[2], k[3], k[1], dir(0, 0, -1), style);
    return this;
  }

  /**
   * A cylinder (or a cone's frustum: radius r at its start, r2 at its end) along `axis`: its centre, radius, length,
   * `segs` flat sides; capped unless told not to.
   */
  cylinder(c: V3, r: number, len: number, axis: "x" | "y" | "z", style: number, segs = 16, capped = true, r2 = r): this {
    const o = new THREE.Vector3(...c);
    const ax = axis === "x" ? new THREE.Vector3(1, 0, 0) : axis === "y" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const at = (i: number, end: number, rad: number) => {
      const a = (i / segs) * Math.PI * 2;
      const u = Math.cos(a) * rad;
      const v = Math.sin(a) * rad;
      const h = (end - 0.5) * len;
      const local = axis === "y" ? [u, h, v] : axis === "x" ? [h, u, v] : [u, v, h];
      return new THREE.Vector3(o.x + local[0], o.y + local[1], o.z + local[2]);
    };
    const top = o.clone().addScaledVector(ax, len / 2);
    const bottom = o.clone().addScaledVector(ax, -len / 2);
    for (let i = 0; i < segs; i++) {
      const a0 = at(i, 0, r);
      const a1 = at(i + 1, 0, r);
      const b0 = at(i, 1, r2);
      const b1 = at(i + 1, 1, r2);
      // Outward: from the axis toward the side's middle.
      const mid = a0.clone().add(a1).add(b0).add(b1).multiplyScalar(0.25);
      const out = mid.sub(o).sub(ax.clone().multiplyScalar(mid.clone().dot(ax)));
      this.quad(a0, a1, b1, b0, out, style);
      if (capped) {
        if (r2 > 1e-6) this.tri(top, b0, b1, ax, style);
        if (r > 1e-6) this.tri(bottom, a0, a1, ax.clone().negate(), style);
      }
    }
    return this;
  }

  /** A sloped roof over a footprint w × d (x, z) at height y: a ridge along x, rising `rise` to it; eaves overhang `over`. */
  gable(c: V3, w: number, d: number, rise: number, thick: number, style: number, over = 0.25): this {
    const hw = w / 2 + over;
    const hd = d / 2 + over;
    const y = c[1];
    const V = (x: number, yy: number, z: number) => new THREE.Vector3(c[0] + x, yy, c[2] + z);
    for (const side of [1, -1]) {
      const up = new THREE.Vector3(0, hd, side * rise).normalize();
      const e0 = V(-hw, y, side * hd);
      const e1 = V(hw, y, side * hd);
      const r0 = V(-hw, y + rise, 0);
      const r1 = V(hw, y + rise, 0);
      this.quad(e0, e1, r1, r0, up, style);
      const e0b = V(-hw, y - thick, side * hd);
      const e1b = V(hw, y - thick, side * hd);
      const r0b = V(-hw, y + rise - thick, 0);
      const r1b = V(hw, y + rise - thick, 0);
      this.quad(e0b, e1b, r1b, r0b, up.clone().negate(), style);
      this.quad(e0b, e1b, e1, e0, new THREE.Vector3(0, 0, side), style);
      // The gable edges (the slab's ends).
      this.quad(V(hw, y - thick, side * hd), V(hw, y, side * hd), V(hw, y + rise, 0), V(hw, y + rise - thick, 0), new THREE.Vector3(1, 0, 0), style);
      this.quad(V(-hw, y - thick, side * hd), V(-hw, y, side * hd), V(-hw, y + rise, 0), V(-hw, y + rise - thick, 0), new THREE.Vector3(-1, 0, 0), style);
    }
    return this;
  }

  /** A triangle facing up-ish (terrain): its corners in the model's frame. */
  facet(a: V3, b: V3, c: V3, style: number): this {
    this.tri(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(...c), new THREE.Vector3(0, 1, 0), style);
    return this;
  }

  /** A gable end's triangle (filling under a gable roof) at x = ±w/2. */
  gableEnds(c: V3, w: number, d: number, rise: number, style: number): this {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(c[0] + x, c[1] + y, c[2] + z);
    this.tri(V(w / 2, 0, -d / 2), V(w / 2, rise, 0), V(w / 2, 0, d / 2), new THREE.Vector3(1, 0, 0), style);
    this.tri(V(-w / 2, 0, d / 2), V(-w / 2, rise, 0), V(-w / 2, 0, -d / 2), new THREE.Vector3(-1, 0, 0), style);
    return this;
  }

  get triangles(): number {
    return this.pos.length / 9;
  }

  /** Everything placed, as one geometry (positions and normals in the world, the style per vertex). */
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("aArt", new THREE.Float32BufferAttribute(this.art, 1));
    g.computeBoundingSphere();
    return g;
  }
}
