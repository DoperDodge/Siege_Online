// Fuze's Ballistic Shield as drawn (Phase 8 M11; the game's model as its renders show it, D-157): a green plate, all
// but flat, its top corners cut, a dark rim round its edge, a viewport of bulletproof glass across its upper part at
// eye height in a dark frame that stands out of the plate, bolts across the middle where the handle is mounted, and its
// inside dark. It's laid out on the plate (metres across, metres down from its top, metres out of its face) and placed
// each frame from the same frame as its hitboxes (player/hitboxes.ts shieldFrame), so it bends with its carrier's lean
// and slides down as he aims. One mesh for everyone, your own first-person view included (you see the world through
// the window, the plate's dark inside round it).
import * as THREE from "three";
import { shieldFrame, type GameData, type PawnState, type ShieldPlace, type ShieldPlate } from "@redmond/shared";

/** A point laid out on the plate: across (metres from its middle), down (metres from its top), out of its face. */
type PlatePoint = [x: number, down: number, out: number];

/** The rim round the plate's edge, the viewport's frame (how wide, how far out of the face), the bolts (metres). */
const RIM_M = 0.022;
const FRAME_M = 0.03;
const FRAME_OUT_M = 0.035;
const BOLT_M = 0.026;

/** A convex outline (anticlockwise, x right and y up) moved in by `r` all round. */
function inset(poly: readonly THREE.Vector2[], r: number): THREE.Vector2[] {
  const n = poly.length;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const d = new THREE.Vector2().subVectors(q, p).normalize();
    // Inward of an anticlockwise outline is to the left of each edge.
    const inward = new THREE.Vector2(-d.y, d.x);
    return { p: p.clone().addScaledVector(inward, r), d };
  });
  return lines.map((a, i) => {
    const b = lines[(i + n - 1) % n];
    // Where the previous edge's moved line meets this one's.
    const cross = b.d.x * a.d.y - b.d.y * a.d.x;
    const t = ((a.p.x - b.p.x) * a.d.y - (a.p.y - b.p.y) * a.d.x) / cross;
    return b.p.clone().addScaledVector(b.d, t);
  });
}

export class ShieldModel {
  readonly mesh: THREE.Mesh;
  private readonly points: PlatePoint[] = [];
  private readonly positions: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly face: THREE.MeshStandardMaterial;
  private readonly inside: THREE.MeshStandardMaterial;
  private readonly trim: THREE.MeshStandardMaterial;
  private readonly glass: THREE.MeshStandardMaterial;
  private place: ShieldPlace | null = null;

  constructor(private readonly k: ShieldPlate) {
    const hw = k.widthM / 2;
    const c = Math.min(k.chamferM, hw * 0.5);
    const H = k.heightM;
    // Its outline (anticlockwise, y up from its bottom… its top at 0), and the window across it at eye height.
    const outline = [new THREE.Vector2(-hw, -H), new THREE.Vector2(hw, -H), new THREE.Vector2(hw, -c), new THREE.Vector2(hw - c, 0), new THREE.Vector2(-hw + c, 0), new THREE.Vector2(-hw, -c)];
    const ww = Math.min(k.window.widthM, k.widthM - 2 * (RIM_M + FRAME_M)) / 2;
    const wt = k.aboveEyeM - k.window.heightM / 2;
    const wb = k.aboveEyeM + k.window.heightM / 2;
    const win = [new THREE.Vector2(-ww, -wb), new THREE.Vector2(ww, -wb), new THREE.Vector2(ww, -wt), new THREE.Vector2(-ww, -wt)];

    const faceOut: number[] = [];
    const faceIn: number[] = [];
    const trim: number[] = [];
    const glass: number[] = [];
    const add = (v: THREE.Vector2, out: number) => this.points.push([v.x, -v.y, out]) - 1;
    const quad = (into: number[], a: number, b: number, cc: number, d: number) => into.push(a, b, cc, a, cc, d);

    // The face: the outline less the window, once facing out (its front) and once facing in (its dark inside), on vertices
    // of their own so each side keeps its own shading.
    const tris = THREE.ShapeUtils.triangulateShape(outline, [win]);
    const all = [...outline, ...win];
    const outs = all.map((v) => add(v, 0));
    const ins = all.map((v) => add(v, 0));
    for (const [a, b0, c0] of tris) {
      // Anticlockwise across the plate (x right, y up) faces its carrier (the plate's local z is backward): that's its
      // inside; its face winds the other way.
      const ccw = (all[b0].x - all[a].x) * (all[c0].y - all[a].y) - (all[b0].y - all[a].y) * (all[c0].x - all[a].x) > 0;
      const [b, cc] = ccw ? [b0, c0] : [c0, b0];
      faceIn.push(ins[a], ins[b], ins[cc]);
      faceOut.push(outs[a], outs[cc], outs[b]);
    }
    // The rim: a band just proud of the face all round its edge.
    const inner = inset(outline, RIM_M);
    for (let i = 0; i < outline.length; i++) {
      const j = (i + 1) % outline.length;
      quad(trim, add(outline[i], 0.004), add(outline[j], 0.004), add(inner[j], 0.004), add(inner[i], 0.004));
    }
    // The window's frame: standing out of the face, its face and its outer and inner sides.
    const rim = [new THREE.Vector2(-ww - FRAME_M, -wb - FRAME_M), new THREE.Vector2(ww + FRAME_M, -wb - FRAME_M), new THREE.Vector2(ww + FRAME_M, -wt + FRAME_M), new THREE.Vector2(-ww - FRAME_M, -wt + FRAME_M)];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad(trim, add(rim[i], FRAME_OUT_M), add(rim[j], FRAME_OUT_M), add(win[j], FRAME_OUT_M), add(win[i], FRAME_OUT_M));
      quad(trim, add(rim[i], 0), add(rim[j], 0), add(rim[j], FRAME_OUT_M), add(rim[i], FRAME_OUT_M));
      quad(trim, add(win[i], 0), add(win[j], 0), add(win[j], FRAME_OUT_M), add(win[i], FRAME_OUT_M));
    }
    // Bolts across the middle, where the handle is mounted behind.
    for (const x of [-0.17, -0.06, 0.06, 0.17].map((f) => f * (k.widthM / 0.58))) {
      const y = -H * 0.52;
      const b = BOLT_M / 2;
      quad(trim, add(new THREE.Vector2(x - b, y - b), 0.006), add(new THREE.Vector2(x + b, y - b), 0.006), add(new THREE.Vector2(x + b, y + b), 0.006), add(new THREE.Vector2(x - b, y + b), 0.006));
    }
    // The glass, set back in its frame.
    quad(glass, add(win[0], FRAME_OUT_M / 2), add(win[1], FRAME_OUT_M / 2), add(win[2], FRAME_OUT_M / 2), add(win[3], FRAME_OUT_M / 2));

    this.positions = new Float32Array(this.points.length * 3);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setIndex([...faceOut, ...faceIn, ...trim, ...glass]);
    let at = 0;
    for (const [n, m] of [[faceOut.length, 0], [faceIn.length, 1], [trim.length, 2], [glass.length, 3]] as const) {
      this.geometry.addGroup(at, n, m);
      at += n;
    }
    // Flat shaded: its vertices move every frame, and the faces' own slopes are all the light needs.
    this.face = new THREE.MeshStandardMaterial({ color: 0x5b8f4c, roughness: 0.62, metalness: 0.2, flatShading: true });
    this.inside = new THREE.MeshStandardMaterial({ color: 0x3d4349, roughness: 0.8, metalness: 0.1, flatShading: true });
    this.trim = new THREE.MeshStandardMaterial({ color: 0x33383d, roughness: 0.45, metalness: 0.6, flatShading: true, side: THREE.DoubleSide });
    this.glass = new THREE.MeshStandardMaterial({ color: 0xa8d4f0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geometry, [this.face, this.inside, this.trim, this.glass]);
    this.mesh.frustumCulled = false; // its vertices are world points, rewritten every frame
    // No shadow: the shadow map is only redrawn when the level changes, so a moving plate's would be left behind (as
    // bodies cast none: the review, M12).
    this.mesh.castShadow = false;
  }

  /** Put it where a body's state has it (`place`), or hide it (none, or prone). */
  update(data: GameData, s: PawnState, place: ShieldPlace | null) {
    const f = place ? shieldFrame(data.movement, data.hitboxes, s, this.k, place) : null;
    this.mesh.visible = f !== null;
    if (!f || !place) return;
    if (place !== this.place) {
      // In front its face looks forward, the way its outward triangles wind; on the back the other way round.
      this.place = place;
      this.mesh.material = place === "front" ? [this.face, this.inside, this.trim, this.glass] : [this.inside, this.face, this.trim, this.glass];
    }
    // Laid out for the plate held up (`heightM` tall, `widthM` across): on the back, squeezed to the plate there.
    const across = 1 / (this.k.widthM / 2);
    const down = f.tall / this.k.heightM;
    let o = 0;
    for (const [x, d, out] of this.points) {
      const p = f.at(x * across, f.y1 - d * down, out);
      this.positions[o++] = p[0];
      this.positions[o++] = p[1];
      this.positions[o++] = p[2];
    }
    (this.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.face.dispose();
    this.inside.dispose();
    this.trim.dispose();
    this.glass.dispose();
  }
}
