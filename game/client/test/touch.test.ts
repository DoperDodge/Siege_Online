// The lab pages keep their own scale on phones and tablets (walk #1: tapping fast zoomed the page in, and
// there was no way back out): pinches and double taps don't reach the browser's zoom; single taps do their job.
import { describe, expect, it } from "vitest";
import { preventPageZoom } from "../src/input/touch.js";

describe("preventPageZoom", () => {
  it("cancels Safari's pinch gestures, two-finger moves and a second tap within 350 ms, and nothing else", () => {
    const page = new EventTarget();
    let clock = 1000;
    preventPageZoom(page, () => clock);
    const fire = (type: string, extra: object = {}) => {
      const e = Object.assign(new Event(type, { cancelable: true }), extra);
      page.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(fire("gesturestart")).toBe(true);
    expect(fire("gesturechange")).toBe(true);
    expect(fire("dblclick")).toBe(true);
    expect(fire("touchmove", { touches: { length: 2 } })).toBe(true);
    expect(fire("touchmove", { touches: { length: 1 } })).toBe(false); // the thumbstick and looking around
    expect(fire("touchend")).toBe(false); // a first tap goes through
    clock += 200;
    expect(fire("touchend")).toBe(true); // a quick second one would zoom
    clock += 200;
    expect(fire("touchend")).toBe(true); // rapid tapping: each one counts from the last
    clock += 400;
    expect(fire("touchend")).toBe(false);
  });
});
