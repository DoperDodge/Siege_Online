// The crosshair (Phase 3 M5, M9): a dot, four ticks marking the spread cone the server draws pellets from
// (D-041), so they close in as you aim and open as you move; down the sights the crosshair gives way to
// what the sight shows (a red dot or a cross; plain iron sights show nothing) and, magnified, a scope ring.
import { DEG, lerp } from "@redmond/shared";

/** Vertical field of view (degrees) `t` of the way into a `zoom`× sight: the magnification divides the tangent of the half-angle. */
export function adsFov(fovVerticalDeg: number, zoom: number, t = 1): number {
  return (2 * Math.atan(Math.tan((fovVerticalDeg * DEG) / 2) / lerp(1, zoom, t))) / DEG;
}

/** Where on screen (px from the centre) a cone of half-angle `coneRad` reaches, seen with a vertical field of view `fovDeg` on a view `heightPx` tall. */
export function spreadGapPx(coneRad: number, fovDeg: number, heightPx: number): number {
  return (Math.tan(coneRad) / Math.tan((fovDeg * DEG) / 2)) * (heightPx / 2);
}

export type Reticle = "posts" | "dot" | "cross";

export class Crosshair {
  private readonly dot: HTMLElement;
  private readonly ticks: HTMLElement;
  private readonly reticle: HTMLElement;
  private readonly scope: HTMLElement;

  constructor(root: HTMLElement) {
    const $ = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    this.dot = $(".crosshair");
    this.ticks = $(".spread");
    this.reticle = $(".reticle");
    this.scope = $(".scope");
  }

  /**
   * `gapPx`: the spread ticks' distance from the centre (hidden under 2 px, or with `noTicks`: dead, on a
   * camera, in third person); `aimed`: down the sights, showing `reticle`; `zoomed`: through a magnified one.
   */
  update(o: { gapPx: number; noTicks: boolean; aimed: boolean; reticle: Reticle; zoomed: boolean }) {
    this.dot.classList.toggle("hidden", o.aimed);
    this.ticks.classList.toggle("hidden", o.aimed || o.noTicks || o.gapPx < 2);
    this.ticks.style.setProperty("--r", `${o.gapPx.toFixed(1)}px`);
    this.reticle.classList.toggle("hidden", !o.aimed || o.reticle === "posts");
    this.reticle.dataset.kind = o.reticle;
    this.scope.classList.toggle("hidden", !o.zoomed);
  }
}
