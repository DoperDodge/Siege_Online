// The stats overlay (Phase 5, tools/mapgen/DESIGN.md amendment 8): frame rate, frame time, the 1% low, the
// page's work a frame and what each frame draws, to read on real hardware against the pass bar (PLAN §18). F8
// shows and hides it; `?stats` in the link shows it from the start.

/**
 * What a page must reach on Ulo's PC. The browser draws no faster than the display refreshes (and a refresh
 * missed counts as a whole extra one), so the frame rate reads against the bar only on a display faster than
 * 120 Hz; on a slower one the work time shows how much room the page leaves.
 */
export const PASS_BAR =
  "target ≥ 120 FPS avg, ≥ 90 FPS 1% low at 1080p High\nFPS can't pass the display's refresh rate: read it at 144 Hz or more;\nat 120 Hz or less read the work instead (≤ 8.3 ms avg, ≤ 11.1 ms slowest 1%)";

/** The averages cover this long, and the 1% low this long. */
const AVERAGE_MS = 1000;
const LOW_MS = 10_000;
/** A gap this long between frames is a hidden tab (no frames are drawn), not a slow frame. */
const GAP_MS = 1000;

/** The mean of the slowest 1% of `ms` (at least one value); 0 with none. */
export function slowestOnePercentMs(ms: readonly number[]): number {
  if (!ms.length) return 0;
  const slowest = [...ms].sort((a, b) => b - a).slice(0, Math.max(1, Math.round(ms.length / 100)));
  return slowest.reduce((sum, x) => sum + x, 0) / slowest.length;
}

/** The 1% low: the frame rate of the mean of the slowest 1% of the frame times. 0 with no frames. */
export function onePercentLowFps(frameMs: readonly number[]): number {
  return frameMs.length ? 1000 / slowestOnePercentMs(frameMs) : 0;
}

export class StatsOverlay {
  private readonly el: HTMLElement;
  /** When the last frame started (-1: no frame yet). */
  private last = -1;
  /** The frames since the numbers were last written: how many, their summed and longest time, work, draws, triangles. */
  private sum = { start: 0, frames: 0, ms: 0, maxMs: 0, workMs: 0, calls: 0, triangles: 0 };
  /** The last LOW_MS of frame times and work times, and when each of those frames started. */
  private readonly times: number[] = [];
  private readonly works: number[] = [];
  private readonly starts: number[] = [];

  /** `about` gives the lines under the numbers (what the page draws, and how big), read each time they're written. */
  constructor(
    root: HTMLElement,
    shown: boolean,
    private readonly about: () => string[],
  ) {
    this.el = document.createElement("div");
    this.el.className = `hud stats${shown ? "" : " hidden"}`;
    this.el.textContent = "Measuring…";
    root.append(this.el);
  }

  toggle(): void {
    this.el.classList.toggle("hidden");
  }

  /**
   * Once a frame, at its end: when the frame started (its requestAnimationFrame time), how long the page worked
   * on it (ms: the frame's own code and the messages handled since the last frame, on the main thread; not the
   * graphics card, nor the browser laying out and painting the page), and its draw calls and triangles over
   * every render call in it. Frames are counted while the overlay is hidden too, so it has its numbers the
   * moment it shows.
   */
  frame(now: number, workMs: number, calls: number, triangles: number): void {
    const ms = this.last < 0 ? Infinity : now - this.last;
    this.last = now;
    if (!(ms >= 0 && ms <= GAP_MS)) {
      this.sum = { start: now, frames: 0, ms: 0, maxMs: 0, workMs: 0, calls: 0, triangles: 0 };
      return;
    }
    const s = this.sum;
    s.frames++;
    s.ms += ms;
    s.maxMs = Math.max(s.maxMs, ms);
    s.workMs += workMs;
    s.calls += calls;
    s.triangles += triangles;
    this.times.push(ms);
    this.works.push(workMs);
    this.starts.push(now);
    if (now - s.start < AVERAGE_MS) return;
    const keep = this.starts.findIndex((t) => t > now - LOW_MS);
    this.times.splice(0, keep);
    this.works.splice(0, keep);
    this.starts.splice(0, keep);
    const span = Math.round(this.times.reduce((a, b) => a + b, 0) / 1000);
    const tris = s.triangles / s.frames;
    this.el.textContent = [
      `${((s.frames * 1000) / s.ms).toFixed(0)} FPS · ${(s.ms / s.frames).toFixed(2)} ms a frame, ${s.maxMs.toFixed(1)} ms max (last 1 s)`,
      `1% low ${onePercentLowFps(this.times).toFixed(0)} FPS (last ${span} s)`,
      `work ${(s.workMs / s.frames).toFixed(2)} ms avg, ${slowestOnePercentMs(this.works).toFixed(1)} ms slowest 1% (the page's own, on the main thread)`,
      `${Math.round(s.calls / s.frames)} draw calls · ${tris >= 10_000 ? `${(tris / 1000).toFixed(0)}k` : Math.round(tris)} triangles a frame`,
      ...this.about(),
      PASS_BAR,
    ].join("\n");
    this.sum = { start: now, frames: 0, ms: 0, maxMs: 0, workMs: 0, calls: 0, triangles: 0 };
  }
}
