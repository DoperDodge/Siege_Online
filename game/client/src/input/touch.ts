// On-screen controls for touch devices (iPad etc.). A development convenience so the lab can be tried
// without a keyboard — the game itself targets keyboard + mouse (DECISIONS D-021).
import type { Action, Controls } from "./controls.js";

interface TouchButton {
  label: string;
  action?: Action;
  /** "tap" = press+release, "hold" = held while touched, "latch" = sprint latch. */
  kind: "tap" | "hold" | "latch";
}

const BUTTONS: TouchButton[] = [
  { label: "Sprint", kind: "latch" },
  { label: "Vault", action: "vault", kind: "hold" },
  { label: "Crouch", action: "crouch", kind: "tap" },
  { label: "Prone", action: "prone", kind: "tap" },
  { label: "Lean L", action: "leanLeft", kind: "tap" },
  { label: "Lean R", action: "leanRight", kind: "tap" },
  { label: "Use", action: "interact", kind: "tap" },
  { label: "ADS", action: "ads", kind: "tap" },
  { label: "Cam", action: "ability", kind: "tap" },
];

export function isTouchDevice(): boolean {
  return matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1;
}

export function mountTouchControls(root: HTMLElement, controls: Controls): HTMLElement {
  const layer = document.createElement("div");
  layer.className = "touch-layer";
  layer.innerHTML = `
    <div class="touch-look"></div>
    <div class="touch-stick"><div class="touch-knob"></div></div>
    <div class="touch-buttons"></div>`;
  root.appendChild(layer);

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

  // Right: drag to look.
  const look = layer.querySelector<HTMLElement>(".touch-look")!;
  const lastPos = new Map<number, { x: number; y: number }>();
  look.addEventListener("pointerdown", (e) => {
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

  // Buttons.
  const pad = layer.querySelector<HTMLElement>(".touch-buttons")!;
  for (const b of BUTTONS) {
    const el = document.createElement("button");
    el.className = "touch-btn";
    el.textContent = b.label;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.classList.add("down");
      if (b.kind === "latch") {
        controls.toggleSprintLatch();
        el.classList.toggle("on", controls.sprintIsLatched);
      } else if (b.action) {
        controls.press(b.action);
        if (b.kind === "tap") controls.release(b.action);
      }
    });
    const up = () => {
      el.classList.remove("down");
      if (b.kind === "hold" && b.action) controls.release(b.action);
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
    pad.appendChild(el);
  }
  return layer;
}
