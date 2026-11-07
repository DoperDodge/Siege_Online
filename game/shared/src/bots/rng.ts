// A bot's own random numbers (Phase 9, bots/DESIGN.md §1): seeded from the room's secret seed and the bot's member
// id, so a test with the same seed plays the same, and no two bots in a room draw alike.
import { hash4 } from "../weapons/spread.js";

export class BotRng {
  private s: number;

  constructor(seed: number, id: number) {
    this.s = hash4(seed >>> 0, id >>> 0, 0xb07, 1) || 1;
  }

  /** A draw in [0, 1) (mulberry32). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A whole number in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** One of `items` (undefined if none). */
  pick<T>(items: readonly T[]): T | undefined {
    return items.length ? items[this.int(items.length)] : undefined;
  }

  /** A draw in [a, b). */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** A standard normal draw (Box–Muller). */
  normal(): number {
    const u = Math.max(1e-12, this.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }
}
