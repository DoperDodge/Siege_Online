// Floor frames (DESIGN §3.2): each floor image is its own perspective render, so a point drawn on the 2F image
// sits about 2.4% further from the fixed point than the same spot on 1F. Every plan coordinate is mapped
// into the world frame (= 1F) with its floor's affine before anything is stacked; then metres = mPerU * u.
import type { Affine, Layout } from "./schema.js";

export type FrameId = keyof Layout["frames"];

export interface Frames {
  /** Native u (the frame's own image) to world u. */
  toWorld(frame: FrameId, x: number, y: number): [number, number];
  /** World u to the frame's native u (for plans drawn over a floor image, and the HUD). */
  toNative(frame: FrameId, x: number, y: number): [number, number];
  /** The affine in use for a frame (main or alt). */
  affine(frame: FrameId): Affine;
}

export function frames(layout: Layout): Frames {
  const pick = (f: FrameId): Affine => {
    const fr = layout.frames[f];
    if (fr.use === "alt") {
      if (!fr.alt) throw new Error(`layout.json: frames.${f} uses "alt" but has none`);
      return fr.alt;
    }
    return fr;
  };
  return {
    affine: pick,
    toWorld(f, x, y) {
      const a = pick(f);
      return [a.ax * x + a.bx, a.ay * y + a.by];
    },
    toNative(f, x, y) {
      const a = pick(f);
      return [(x - a.bx) / a.ax, (y - a.by) / a.ay];
    },
  };
}
