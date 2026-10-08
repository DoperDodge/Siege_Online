// Every weapon, ADS, reload, revive and melee duration runs in whole 64 Hz ticks (DECISIONS D-040), so client
// and server count exactly the same. Rounding is symmetric: at most 7.8 ms off the data.
import { TICK_HZ } from "../core/constants.js";

/** A duration in seconds as ticks, at least one. */
export const ticks = (seconds: number) => Math.max(1, Math.round(seconds * TICK_HZ));

/** A duration that may legitimately be zero (a delay, an overhead) as ticks. */
export const ticksOrZero = (seconds: number) => Math.max(0, Math.round(seconds * TICK_HZ));
