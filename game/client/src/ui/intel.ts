// Intel on the HUD (Phase 7 M4, intel/DESIGN.md §6): your team's pings where they were aimed (yellow, orange for a
// danger ping), with whose and how far, seen through walls and held at the screen's edge when off it; enemies a scan
// spotted (red, over them while it lasts); the comm wheel while the ping key is held; the scan's gauge while Fire is
// held on a drone or a camera.
import * as THREE from "three";
import { DT, type GameEvent } from "@redmond/shared";
import { escapeHtml } from "./dom.js";

type Ping = Extract<GameEvent, { kind: "ping" }>;
type Spotted = Extract<GameEvent, { kind: "spotted" }>;

/** A mark on the screen: a ping at a point, or a spotted enemy followed while it lasts. */
interface Mark {
  el: HTMLElement;
  label: HTMLElement;
  /** Whose it is: the pinger's controller (each has data/intel.json `ping.perPlayer` up at a time), or the scanner's. */
  ctrl: number;
  /** A spotted mark's enemy (null: a ping). */
  pawnId: number | null;
  at: THREE.Vector3;
  name: string;
  until: number;
  shown: string;
}

/** What's off screen is held this far in from its edges (px). */
export const EDGE_PX = 28;
/** A spotted mark floats this far over the enemy's feet (metres). */
const OVER_HEAD_M = 2.1;
/** The comm wheel's radius (px). */
const WHEEL_PX = 110;

/**
 * Where a mark for the point `at` goes on a `w` × `h` px screen seen through `camera` (its matrices up to date): over
 * the point, or, when it's off the screen or behind, at the edge the way to turn to it (`off`).
 */
export function markOnScreen(at: THREE.Vector3, camera: THREE.Camera, w: number, h: number, v = new THREE.Vector3()): { x: number; y: number; off: boolean } {
  v.copy(at).applyMatrix4(camera.matrixWorldInverse);
  const behind = v.z > -0.05;
  v.applyMatrix4(camera.projectionMatrix);
  // Behind the camera the projection comes out mirrored: turned back, it points the way to turn.
  let x = ((behind ? -v.x : v.x) * w) / 2;
  let y = ((behind ? v.y : -v.y) * h) / 2;
  const [hw, hh] = [w / 2 - EDGE_PX, h / 2 - EDGE_PX];
  const off = behind || Math.abs(x) > hw || Math.abs(y) > hh;
  if (off) {
    if (Math.abs(x) < 1e-3 && Math.abs(y) < 1e-3) y = 1; // right behind: at the bottom
    const k = Math.min(hw / Math.max(Math.abs(x), 1e-6), hh / Math.max(Math.abs(y), 1e-6));
    x *= k;
    y *= k;
  }
  return { x: w / 2 + x, y: h / 2 + y, off };
}

export class IntelHud {
  private readonly layer: HTMLElement;
  private readonly wheel: HTMLElement;
  private readonly gauge: HTMLElement;
  private readonly marks: Mark[] = [];
  /** The callout the wheel shows picked (null: none; undefined: the wheel is closed). */
  private wheelShown: number | null | undefined = undefined;
  private gaugeShown = "";
  private readonly v = new THREE.Vector3();

  constructor(
    root: HTMLElement,
    callouts: readonly string[],
    private readonly perPlayer: number,
  ) {
    const items = callouts
      .map((c, i) => {
        const a = (i / callouts.length) * 2 * Math.PI; // 0 up, clockwise
        const [x, y] = [Math.sin(a) * WHEEL_PX, -Math.cos(a) * WHEEL_PX];
        return `<div style="transform: translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px))">${escapeHtml(c)}</div>`;
      })
      .join("");
    root.insertAdjacentHTML("beforeend", `<div class="intel-marks"></div><div class="comm-wheel hidden">${items}</div><div class="scan-gauge hidden"><div></div></div>`);
    this.layer = root.querySelector<HTMLElement>(".intel-marks")!;
    this.wheel = root.querySelector<HTMLElement>(".comm-wheel")!;
    this.gauge = root.querySelector<HTMLElement>(".scan-gauge")!;
  }

  /** A teammate's ping (or yours), named `name`: it replaces their oldest when they have their number out. */
  ping(e: Ping, name: string, now: number) {
    const theirs = this.marks.filter((m) => m.pawnId === null && m.ctrl === e.ctrl);
    if (theirs.length >= this.perPlayer) this.drop(theirs[0]);
    this.add(e.danger ? "danger" : "ping", e.ctrl, null, new THREE.Vector3(...e.pos), name, now + e.ticks * DT * 1000);
  }

  /** An enemy spotted by a scan: marked over them until it runs out (a new scan of them starts it again). */
  spotted(e: Spotted, now: number) {
    const old = this.marks.find((m) => m.pawnId === e.pawnId);
    if (old) old.until = now + e.ticks * DT * 1000;
    else this.add("spotted", e.by, e.pawnId, new THREE.Vector3(), "", now + e.ticks * DT * 1000);
  }

  /**
   * Every frame, once the camera is placed: each mark where its point is on the screen (`w` × `h` px), or at the
   * edge toward it; `posOf` is where a spotted enemy is drawn (null: not known, the mark waits).
   */
  update(now: number, camera: THREE.PerspectiveCamera, w: number, h: number, posOf: (pawnId: number) => [number, number, number] | null) {
    camera.updateMatrixWorld();
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      if (now >= m.until) {
        this.drop(m);
        continue;
      }
      if (m.pawnId !== null) {
        const p = posOf(m.pawnId);
        m.el.classList.toggle("hidden", p === null);
        if (!p) continue;
        m.at.set(p[0], p[1] + OVER_HEAD_M, p[2]);
      }
      const { x, y, off } = markOnScreen(m.at, camera, w, h, this.v);
      m.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      m.el.classList.toggle("off", off);
      const text = `${m.name ? `${m.name} · ` : ""}${Math.round(camera.position.distanceTo(m.at))} m`;
      if (text !== m.shown) m.label.textContent = m.shown = text;
    }
  }

  /** The comm wheel: undefined hides it; otherwise the callout picked (null: none yet). */
  showWheel(pick: number | null | undefined) {
    if (pick === this.wheelShown) return;
    this.wheelShown = pick;
    this.wheel.classList.toggle("hidden", pick === undefined);
    this.wheel.querySelectorAll("div").forEach((el, i) => el.classList.toggle("on", i === pick));
  }

  /** The scan's gauge while Fire is held on a drone or a camera: 0..1 (1: scanned), or null to hide it. */
  showScan(progress: number | null) {
    const key = progress === null ? "" : progress.toFixed(2);
    if (key === this.gaugeShown) return;
    this.gaugeShown = key;
    this.gauge.classList.toggle("hidden", progress === null);
    this.gauge.classList.toggle("full", progress !== null && progress >= 1);
    this.gauge.querySelector<HTMLElement>("div")!.style.width = `${Math.min(1, progress ?? 0) * 100}%`;
  }

  /** How many marks are up (browser tests). */
  get count(): { pings: number; spotted: number } {
    return { pings: this.marks.filter((m) => m.pawnId === null).length, spotted: this.marks.filter((m) => m.pawnId !== null).length };
  }

  private add(kind: "ping" | "danger" | "spotted", ctrl: number, pawnId: number | null, at: THREE.Vector3, name: string, until: number) {
    const el = document.createElement("div");
    el.className = `intel-mark ${kind}`;
    el.innerHTML = "<i></i><span></span>";
    this.layer.append(el);
    this.marks.push({ el, label: el.querySelector("span")!, ctrl, pawnId, at, name, until, shown: "" });
  }

  private drop(m: Mark) {
    m.el.remove();
    this.marks.splice(this.marks.indexOf(m), 1);
  }
}
