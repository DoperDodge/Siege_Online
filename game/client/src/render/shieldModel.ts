// Fuze's Ballistic Shield as drawn (Phase 8 M11; the game's model, D-157; redrawn from Ulo's reference renders, D-169):
// a green plate with a narrower top part, its corners rounded, round a viewport of bulletproof glass at eye height in a
// dark frame that stands out of the plate, stepping out at rounded shoulders to the wider body below, which is flat across
// its middle and curves back round his sides; a dark rim round its edge, two bolts low down, and its inside dark. It's laid
// out on the plate (metres across, metres down from its top, metres out of its face) and placed each frame from the same
// frame as its hitboxes (player/hitboxes.ts shieldFrame), so it tilts with its carrier's lean and swings aside as he aims.
// One mesh for everyone, your own first-person view included (you see the world through the window, the plate's dark
// inside round it).
import * as THREE from "three";
import { shieldFrame, type GameData, type PawnState, type ShieldPlace, type ShieldPlate } from "@redmond/shared";

/** A point laid out on the plate: across (metres from its middle), down (metres from its top), out of its face. */
type PlatePoint = [x: number, down: number, out: number];

/** The rim round the plate's edge, the viewport's frame (how wide, how far out of the face), the bolts (metres). */
const RIM_M = 0.02;
const FRAME_M = 0.022;
const FRAME_OUT_M = 0.03;
const BOLT_M = 0.032;
/** Segments in each rounded corner, and the most a column of the face spans across (its curve shows in columns). */
const ARC_SEGS = 5;
const COLUMN_M = 0.035;

/** An outline (anticlockwise, x right and y up) moved in by `r` all round (its corners where the moved edges meet). */
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
    // Where the previous edge's moved line meets this one's (two edges in line: just moved in).
    const cross = b.d.x * a.d.y - b.d.y * a.d.x;
    if (Math.abs(cross) < 1e-9) return a.p.clone();
    const t = ((a.p.x - b.p.x) * a.d.y - (a.p.y - b.p.y) * a.d.x) / cross;
    return b.p.clone().addScaledVector(b.d, t);
  });
}

/**
 * The plate's shape (x across, y up from its top at 0): its body `w` half-wide from the shoulders `S` down to `H`, its top
 * part `tw` half-wide above them, every outer corner rounded `R`.
 */
class PlateShape {
  constructor(
    readonly w: number,
    readonly tw: number,
    readonly S: number,
    readonly H: number,
    readonly R: number,
  ) {}

  /** A rounded corner's offset in from its edge at `t` metres into its rounding (0 at its start … R at the corner). */
  private round(t: number): number {
    const R = this.R;
    const a = Math.min(R, Math.max(0, t));
    return R - Math.sqrt(Math.max(0, R * R - a * a));
  }

  /** The top of the plate (y, ≤ 0) at x, in its top part (`upper`) or its body's shoulders. */
  top(x: number, upper: boolean): number {
    const ax = Math.abs(x);
    return upper ? -this.round(ax - (this.tw - this.R)) : -this.S - this.round(ax - (this.w - this.R));
  }

  /** The bottom of the plate (y) at x. */
  bottom(x: number): number {
    return -this.H + this.round(Math.abs(x) - (this.w - this.R));
  }

  /** The outline, anticlockwise from the bottom's middle, its rounded corners in segments. */
  outline(): THREE.Vector2[] {
    const { w, tw, S, H, R } = this;
    const out: THREE.Vector2[] = [];
    const arc = (cx: number, cy: number, a0: number, a1: number) => {
      for (let i = 0; i <= ARC_SEGS; i++) {
        const a = a0 + ((a1 - a0) * i) / ARC_SEGS;
        out.push(new THREE.Vector2(cx + Math.cos(a) * R, cy + Math.sin(a) * R));
      }
    };
    const q = Math.PI / 2;
    out.push(new THREE.Vector2(0, -H));
    arc(w - R, -H + R, -q, 0); // bottom right
    arc(w - R, -S - R, 0, q); // right shoulder
    out.push(new THREE.Vector2(tw, -S)); // into the top part
    arc(tw - R, -R, 0, q); // top right
    arc(-tw + R, -R, q, 2 * q); // top left
    out.push(new THREE.Vector2(-tw, -S));
    arc(-w + R, -S - R, q, 2 * q); // left shoulder
    arc(-w + R, -H + R, 2 * q, 3 * q); // bottom left
    // (Points that fall together where an arc ends on a straight edge: one of each.)
    return out.filter((p, i) => i === 0 || p.distanceTo(out[i - 1]) > 1e-6);
  }
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
    const w = k.widthM / 2;
    const tw = Math.min(w, k.topWidthM / 2);
    const H = k.heightM;
    const S = Math.min(k.shoulderM, H * 0.6);
    const R = Math.min(k.cornerM, tw * 0.4, (H - S) * 0.4);
    const shape = new PlateShape(w, tw, S, H, R);
    // The window across the top part at eye height (its top `aboveEyeM` over the eyes).
    const ww = Math.min(k.window.widthM / 2, tw - RIM_M - FRAME_M);
    const wt = -(k.aboveEyeM - k.window.heightM / 2);
    const wb = -(k.aboveEyeM + k.window.heightM / 2);

    const faceOut: number[] = [];
    const faceIn: number[] = [];
    const trim: number[] = [];
    const glass: number[] = [];
    const add = (x: number, y: number, out: number) => this.points.push([x, -y, out]) - 1;
    const quad = (into: number[], a: number, b: number, c: number, d: number) => into.push(a, b, c, a, c, d);
    // A patch of the face from (x0, y0..y1 at x0) to (x1, y..y at x1), on vertices of its own for each side so each keeps
    // its own shading: anticlockwise across the plate (x right, y up) faces its carrier (the plate's local z is backward):
    // that's its inside; its face winds the other way.
    const patch = (x0: number, b0: number, t0: number, x1: number, b1: number, t1: number) => {
      if (t0 - b0 < 1e-5 && t1 - b1 < 1e-5) return;
      const o = [add(x0, b0, 0), add(x1, b1, 0), add(x1, t1, 0), add(x0, t0, 0)];
      const i = [add(x0, b0, 0), add(x1, b1, 0), add(x1, t1, 0), add(x0, t0, 0)];
      faceIn.push(i[0], i[1], i[2], i[0], i[2], i[3]);
      faceOut.push(o[0], o[2], o[1], o[0], o[3], o[2]);
    };

    // The face in columns (its curve round his sides shows column by column), cut where its shape changes: the rounded
    // corners' starts and the samples through them, the top part's sides, the window's sides.
    const cuts = new Set<number>([0, w, tw, ww]);
    for (let i = 0; i <= ARC_SEGS; i++) {
      cuts.add(w - R + (R * i) / ARC_SEGS);
      cuts.add(tw - R + (R * i) / ARC_SEGS);
    }
    const half = [...cuts].filter((x) => x >= 0 && x <= w).sort((a, b) => a - b);
    const xs: number[] = [];
    for (let i = 0; i < half.length; i++) {
      xs.push(half[i]);
      const next = half[i + 1];
      if (next === undefined) break;
      const steps = Math.ceil((next - half[i]) / COLUMN_M);
      for (let s = 1; s < steps; s++) xs.push(half[i] + ((next - half[i]) * s) / steps);
    }
    const all = [...xs.filter((x) => x > 0).map((x) => -x).reverse(), ...xs];
    for (let i = 0; i + 1 < all.length; i++) {
      const [x0, x1] = [all[i], all[i + 1]];
      const mid = (x0 + x1) / 2;
      const upper = Math.abs(mid) < tw;
      const [t0, t1] = [shape.top(x0, upper), shape.top(x1, upper)];
      const [b0, b1] = [shape.bottom(x0), shape.bottom(x1)];
      if (Math.abs(mid) < ww) {
        // Round the window: below it, and above it.
        patch(x0, b0, wb, x1, b1, wb);
        patch(x0, wt, t0, x1, wt, t1);
      } else patch(x0, b0, t0, x1, b1, t1);
    }

    // The rim: a band just proud of the face all round its edge.
    const outline = shape.outline();
    const inner = inset(outline, RIM_M);
    for (let i = 0; i < outline.length; i++) {
      const j = (i + 1) % outline.length;
      quad(trim, add(outline[i].x, outline[i].y, 0.004), add(outline[j].x, outline[j].y, 0.004), add(inner[j].x, inner[j].y, 0.004), add(inner[i].x, inner[i].y, 0.004));
    }
    // The window's frame: standing out of the face, its face and its outer and inner sides.
    const win = [new THREE.Vector2(-ww, wb), new THREE.Vector2(ww, wb), new THREE.Vector2(ww, wt), new THREE.Vector2(-ww, wt)];
    const rim = [new THREE.Vector2(-ww - FRAME_M, wb - FRAME_M), new THREE.Vector2(ww + FRAME_M, wb - FRAME_M), new THREE.Vector2(ww + FRAME_M, wt + FRAME_M), new THREE.Vector2(-ww - FRAME_M, wt + FRAME_M)];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad(trim, add(rim[i].x, rim[i].y, FRAME_OUT_M), add(rim[j].x, rim[j].y, FRAME_OUT_M), add(win[j].x, win[j].y, FRAME_OUT_M), add(win[i].x, win[i].y, FRAME_OUT_M));
      quad(trim, add(rim[i].x, rim[i].y, 0), add(rim[j].x, rim[j].y, 0), add(rim[j].x, rim[j].y, FRAME_OUT_M), add(rim[i].x, rim[i].y, FRAME_OUT_M));
      quad(trim, add(win[i].x, win[i].y, 0), add(win[j].x, win[j].y, 0), add(win[j].x, win[j].y, FRAME_OUT_M), add(win[i].x, win[i].y, FRAME_OUT_M));
    }
    // Two bolts low on its body, either side of its middle (round heads: octagons).
    for (const bx of [-0.21 * k.widthM, 0.21 * k.widthM]) {
      const by = -H * 0.79;
      const c = add(bx, by, 0.01);
      const ring = Array.from({ length: 8 }, (_, i) => add(bx + Math.cos((i * Math.PI) / 4) * (BOLT_M / 2), by + Math.sin((i * Math.PI) / 4) * (BOLT_M / 2), 0.006));
      for (let i = 0; i < 8; i++) trim.push(c, ring[i], ring[(i + 1) % 8]);
    }
    // The glass, set back in its frame.
    quad(glass, add(win[0].x, win[0].y, FRAME_OUT_M / 2), add(win[1].x, win[1].y, FRAME_OUT_M / 2), add(win[2].x, win[2].y, FRAME_OUT_M / 2), add(win[3].x, win[3].y, FRAME_OUT_M / 2));

    this.positions = new Float32Array(this.points.length * 3);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setIndex([...faceOut, ...faceIn, ...trim, ...glass]);
    let at = 0;
    for (const [n, m] of [[faceOut.length, 0], [faceIn.length, 1], [trim.length, 2], [glass.length, 3]] as const) {
      this.geometry.addGroup(at, n, m);
      at += n;
    }
    // Flat shaded: its vertices move every frame, and the faces' own slopes are all the light needs (its curve round the
    // sides reads in the columns' shading).
    this.face = new THREE.MeshStandardMaterial({ color: 0x55893f, roughness: 0.66, metalness: 0.18, flatShading: true });
    this.inside = new THREE.MeshStandardMaterial({ color: 0x3d4349, roughness: 0.8, metalness: 0.1, flatShading: true });
    this.trim = new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.42, metalness: 0.65, flatShading: true, side: THREE.DoubleSide });
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
