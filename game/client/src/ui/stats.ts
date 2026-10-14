// The stats overlay (Phase 5, tools/mapgen/DESIGN.md amendment 8): frame rate, frame time, the 1% low, the
// main thread's work a frame and what each frame draws, to read on real hardware against the pass bar
// (PLAN §18). F8 shows and hides it; `?stats` in the link shows it from the start.

/**
 * What a page must reach on Ulo's PC. The browser draws no faster than the display refreshes, so the frame
 * rate only reads against it on a 120 Hz or faster display; on a slower one the work time shows the headroom.
 */
export const PASS_BAR = "target ≥ 120 FPS avg, ≥ 90 FPS 1% low at 1080p High\nFPS can't pass the display's refresh rate: use a ≥ 120 Hz display";

/** The averages cover this long, and the 1% low this long. */
const AVERAGE_MS = 1000;
const LOW_MS = 10_000;
/** A gap this long between frames is a hidden tab (no frames are drawn), not a slow frame. */
const GAP_MS = 1000;

/**
 * The 1% low: the frame rate of the mean of the slowest 1% of the frame times (rounded, at least one
 * frame). 0 with no frames.
 */
export function onePercentLowFps(frameMs: readonly number[]): number {
  if (!frameMs.length) return 0;
  const slowest = [...frameMs].sort((a, b) => b - a).slice(0, Math.max(1, Math.round(frameMs.length / 100)));
  return 1000 / (slowest.reduce((sum, ms) => sum + ms, 0) / slowest.length);
}

/** The p-th percentile (0–100) of `xs`, nearest rank: the smallest value at least p% of them are at or under. 0 with none. */
export function percentile(xs: readonly number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
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
   * Once a frame, after its last draw: when the frame started (its requestAnimationFrame time), how long the
   * page worked on it (main thread, ms: the time between frames includes waiting for the display), and its
   * draw calls and triangles over every render call in it. Frames are counted while the overlay is hidden
   * too, so it has its numbers the moment it shows.
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
      `work ${(s.workMs / s.frames).toFixed(2)} ms avg, ${percentile(this.works, 99).toFixed(1)} ms p99 (main thread; 120 FPS = 8.3 ms)`,
      `${Math.round(s.calls / s.frames)} draw calls · ${tris >= 10_000 ? `${(tris / 1000).toFixed(0)}k` : Math.round(tris)} triangles a frame`,
      ...this.about(),
      PASS_BAR,
    ].join("\n");
    this.sum = { start: now, frames: 0, ms: 0, maxMs: 0, workMs: 0, calls: 0, triangles: 0 };
  }
}
