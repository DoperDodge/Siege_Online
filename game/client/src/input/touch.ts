// On-screen controls for touch devices (iPad etc.). A development convenience so the lab can be tried
// without a keyboard — the game itself targets keyboard + mouse (DECISIONS D-021).
import type { Action, Controls } from "./controls.js";
import type { HoldMode } from "./settings.js";

interface TouchButton {
  label: string;
  action?: Action;
  /**
   * "tap" = press+release; "hold" = held while touched; "latch" = sprint latch; "mode" = follows the
   * player's toggle/hold setting for that action (hold mode: held while touched, toggle mode: tap).
   */
  kind: "tap" | "hold" | "latch" | "mode";
}

const BUTTONS: TouchButton[] = [
  { label: "Sprint", kind: "latch" },
  { label: "Vault", action: "vault", kind: "hold" },
  { label: "Crouch", action: "crouch", kind: "mode" },
  { label: "Prone", action: "prone", kind: "mode" },
  { label: "Lean L", action: "leanLeft", kind: "mode" },
  { label: "Lean R", action: "leanRight", kind: "mode" },
  { label: "Use", action: "interact", kind: "tap" },
  { label: "ADS", action: "ads", kind: "mode" },
  { label: "Cam", action: "ability", kind: "tap" },
  { label: "Fire", action: "fire", kind: "hold" },
  { label: "Reload", action: "reload", kind: "tap" },
  { label: "Swap", action: "swap", kind: "tap" },
];

/**
 * Touch is the main input (phone/tablet without a mouse or trackpad). Touchscreen laptops have a fine
 * pointer too, so they keep mouse controls; the lab also mounts touch controls on the first real touch.
 */
export function isTouchDevice(): boolean {
  return matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
}

/** Hold/toggle setting for an action, or undefined when the action has no such setting. */
export type ModeOf = (action: Action) => HoldMode | undefined;

/** `canvas` is the game view: a mouse click on the look area locks the pointer to it instead. */
export function mountTouchControls(root: HTMLElement, controls: Controls, modeOf: ModeOf, canvas: HTMLCanvasElement): HTMLElement {
  const layer = document.createElement("div");
  layer.className = "touch-layer";
  layer.innerHTML = `
    <div class="touch-look"></div>
    <div class="touch-stick"><div class="touch-knob"></div></div>
    <div class="touch-buttons"></div>`;
  // Below the settings button and panels so menus stay tappable.
  root.insertBefore(layer, root.querySelector(".gear"));

  // Left: virtual thumbstick.
  const stick = layer.querySelector<HTMLElement>(".touch-stick")!;
  const knob = layer.querySelector<HTMLElement>(".touch-knob")!;
  let stickId: number | null = null;
  const stickMove = (e: PointerEvent) => {
    const r = stick.getBoundingClientRect();
    const max = r.width / 2;
    let dx = e.clientX - (r.left + max);
    let dy = e.clientY - (r.top + max);
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    controls.touchMove.x = dx / max;
    controls.touchMove.y = -dy / max;
  };
  stick.addEventListener("pointerdown", (e) => {
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    stickMove(e);
  });
  stick.addEventListener("pointermove", (e) => e.pointerId === stickId && stickMove(e));
  const stickEnd = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    knob.style.transform = "";
    controls.touchMove.x = controls.touchMove.y = 0;
  };
  stick.addEventListener("pointerup", stickEnd);
  stick.addEventListener("pointercancel", stickEnd);

  // Right: drag to look. It covers the game view, so on a touchscreen laptop a mouse click here must
  // still lock the pointer like a click on the canvas.
  const look = layer.querySelector<HTMLElement>(".touch-look")!;
  const lastPos = new Map<number, { x: number; y: number }>();
  look.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return controls.lockPointer(canvas);
    look.setPointerCapture(e.pointerId);
    lastPos.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  look.addEventListener("pointermove", (e) => {
    const p = lastPos.get(e.pointerId);
    if (!p) return;
    controls.look(e.clientX - p.x, e.clientY - p.y, 2.2);
    lastPos.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const lookEnd = (e: PointerEvent) => lastPos.delete(e.pointerId);
  look.addEventListener("pointerup", lookEnd);
  look.addEventListener("pointercancel", lookEnd);
  look.addEventListener("contextmenu", (e) => e.preventDefault()); // right-click, like on the canvas

  // Buttons.
  const pad = layer.querySelector<HTMLElement>(".touch-buttons")!;
  for (const b of BUTTONS) {
    const el = document.createElement("button");
    el.className = "touch-btn";
    el.textContent = b.label;
    let heldAction: Action | null = null;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.classList.add("down");
      if (b.kind === "latch") {
        controls.toggleSprintLatch();
        el.classList.toggle("on", controls.sprintIsLatched);
      } else if (b.action) {
        const hold = b.kind === "hold" || (b.kind === "mode" && modeOf(b.action) === "hold");
        controls.press(b.action);
        if (hold) heldAction = b.action;
        else controls.release(b.action);
      }
    });
    const up = () => {
      el.classList.remove("down");
      if (heldAction) controls.release(heldAction);
      heldAction = null;
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
    pad.appendChild(el);
  }
  return layer;
}
