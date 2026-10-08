// What the Range Lab adds to a lab page (Phase 3 M10, DECISIONS D-052): a last-shot panel (the damage the
// server dealt next to what the weapon data says for that range and body part), floating damage numbers, the
// F2 agreement overlay (every pellet as the server drew it, the target where the server had it rewound, and
// where you saw it), and a Reset dummies tool.
import * as THREE from "three";
import { bulletDamage, encodeLabTool, poseHitboxes, TICK_HZ, zoneOf, type BodyPart, type GameEvent, type Hitbox, type ResolvedWeapon, type ShotResult } from "@redmond/shared";
import { CapsuleParts } from "../render/labScene.js";
import { escapeHtml } from "../ui/dom.js";
import type { LabApi } from "./common/lab.js";

type HitConfirm = Extract<GameEvent, { kind: "hitConfirm" }>;

const OVERLAY_MS = 6000;
const NUMBER_MS = 1000;

/** What the weapon data says one bullet does at `distM` to `part` (or that it kills). */
export function expectedDamage(lab: Pick<LabApi, "data">, w: ResolvedWeapon, distM: number, part: BodyPart): string {
  if (!w.damage) return "";
  const r = bulletDamage(lab.data.combat, w.damage, distM, zoneOf(part));
  if (r.kill) return "a kill (headshot)";
  return w.fire.pellets > 1 ? `${r.amount} a pellet` : String(r.amount);
}

export function rangeFeatures(lab: LabApi): void {
  lab.addLabTool("Reset dummies", () => lab.net?.send(encodeLabTool({ kind: "resetDummies" })));
  const nameOf = (pawnId: number) => lab.net?.session.roster.find((e) => e.pawnIds.includes(pawnId))?.name ?? "someone";
  const ms = (ticks: number) => Math.round((ticks * 1000) / TICK_HZ);

  // ---- the last shot
  const panel = document.createElement("div");
  panel.className = "hud shot-panel hidden";
  lab.app.append(panel);
  let last: { shot: ShotResult; weapon: ResolvedWeapon | null; hits: HitConfirm[] } | null = null;
  const drawPanel = () => {
    if (!last) return;
    const { shot, weapon, hits } = last;
    const lines = [`<b>Last shot</b>${weapon ? ` · ${escapeHtml(weapon.name)}` : ""}`];
    if (shot.hit) {
      const part = shot.hit.part as BodyPart;
      lines.push(`${escapeHtml(nameOf(shot.hit.pawnId))} · ${zoneOf(part)} · ${shot.hit.distance.toFixed(1)} m`);
      const dealt = hits.reduce((n, h) => n + h.damage, 0);
      // A kill or a down takes only what the body had left.
      const ended = hits.some((h) => h.killed) ? " · kill" : hits.some((h) => h.downed) ? " · down" : "";
      const what = `${dealt}${ended && hits.some((h) => h.hpAfter === 0) ? " (all it had left)" : ""}${ended}`;
      if (weapon) lines.push(`Dealt ${hits.length ? what : "…"} — the data says ${expectedDamage(lab, weapon, shot.hit.distance, part)} at this range`);
    } else lines.push(shot.wallDistance !== null ? `Miss · the level at ${shot.wallDistance.toFixed(1)} m` : "Miss");
    if (shot.dirs.length > 1) lines.push(`${shot.dirs.length} pellets${hits.length ? `, ${hits.reduce((n, h) => n + h.pellets, 0)} hit` : ""}`);
    const capped = shot.rewoundTick > shot.viewTick + 1e-6;
    lines.push(`Server rewound ${ms(shot.serverTick - shot.rewoundTick)} ms${capped ? ` (the cap; you were drawing ${ms(shot.serverTick - shot.viewTick)} ms back)` : ""}`);
    panel.innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
    panel.classList.remove("hidden");
  };

  // ---- floating damage numbers
  const numbers = document.createElement("div");
  numbers.className = "dmg-numbers";
  lab.app.append(numbers);
  const floating: { el: HTMLElement; at: THREE.Vector3; born: number }[] = [];
  const addNumber = (e: HitConfirm, now: number) => {
    const s = lab.net?.session.remoteAt(e.victimPawn);
    if (!s) return;
    const el = document.createElement("div");
    el.textContent = e.killed ? (e.headshot ? "HEADSHOT" : "KILL") : e.downed ? `${e.damage} · DOWN` : String(e.damage);
    el.className = e.killed ? "kill" : e.headshot ? "head" : "";
    numbers.append(el);
    floating.push({ el, at: new THREE.Vector3(s.x, s.y + 2, s.z), born: now });
  };

  // ---- F2: what the server judged, against what you saw
  let overlayOn = false;
  let overlay: { group: THREE.Group; until: number } | null = null;
  const serverMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, wireframe: true, depthTest: false, transparent: true, opacity: 0.85 });
  const seenMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, wireframe: true, depthTest: false, transparent: true, opacity: 0.85 });
  const clearOverlay = () => {
    if (!overlay) return;
    lab.scene.remove(overlay.group);
    overlay.group.traverse((o) => {
      if (o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    overlay = null;
  };
  const drawBoxes = (group: THREE.Group, boxes: readonly Hitbox[], mat: THREE.Material) => {
    for (const b of boxes) new CapsuleParts(group, mat, false).place(b, 1);
  };
  const drawOverlay = (shot: ShotResult, now: number) => {
    clearOverlay();
    const group = new THREE.Group();
    const points: THREE.Vector3[] = [];
    const colors: number[] = [];
    const o = new THREE.Vector3(...shot.origin);
    shot.dirs.forEach((d, i) => {
      points.push(o.clone(), o.clone().addScaledVector(new THREE.Vector3(...d), shot.ends[i]));
      const c = new THREE.Color(i === 0 ? (shot.hit ? 0xff3b3b : 0xffffff) : 0xffd27a);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    });
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    lines.renderOrder = 12;
    group.add(lines);
    if (shot.target) {
      drawBoxes(group, shot.target.boxes, serverMat);
      // Where you saw them: the same interpolation, at the time your shot claimed.
      const claimed = lab.claimedViewTick(shot.seq);
      const seen = claimed !== null ? lab.net?.session.remoteAt(shot.target.pawnId, claimed) : null;
      if (seen) drawBoxes(group, poseHitboxes(lab.data.movement, lab.data.hitboxes, seen), seenMat);
    }
    lab.scene.add(group);
    overlay = { group, until: now + OVERLAY_MS };
  };
  lab.onKey("F2", () => {
    overlayOn = !overlayOn;
    if (!overlayOn) clearOverlay();
    lab.flash(overlayOn ? "Shot overlay on: pellets as the server drew them; green where it had the target, blue where you saw it" : "Shot overlay off", "info");
  });
  lab.addHelp("<kbd>F2</kbd>", "Shot overlay: every pellet as the server drew it, the target where the server had it (green) and where you saw it (blue)");

  lab.onShot((shot) => {
    last = { shot, weapon: lab.weapon(), hits: [] };
    drawPanel();
    if (overlayOn) drawOverlay(shot, performance.now());
  });
  lab.onEvents((_tick, events) => {
    const now = performance.now();
    for (const e of events) {
      if (e.kind !== "hitConfirm") continue;
      addNumber(e, now);
      if (last && (last.shot.seq & 0xffff) === e.seq) {
        last.hits.push(e);
        drawPanel();
      }
    }
  });
  const v = new THREE.Vector3();
  lab.onFrame((now) => {
    if (overlay && now > overlay.until) clearOverlay();
    const w = lab.app.clientWidth;
    const h = lab.app.clientHeight;
    for (let i = floating.length - 1; i >= 0; i--) {
      const f = floating[i];
      const t = (now - f.born) / NUMBER_MS;
      if (t >= 1) {
        f.el.remove();
        floating.splice(i, 1);
        continue;
      }
      v.copy(f.at).setY(f.at.y + t * 0.6).project(lab.camera);
      const visible = v.z < 1;
      f.el.style.display = visible ? "" : "none";
      if (!visible) continue;
      f.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
      f.el.style.opacity = String(1 - t * t);
    }
  });
}
