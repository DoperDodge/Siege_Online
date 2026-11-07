// The bots' navigation grid drawn over the level (Phase 9 M2, bots/DESIGN.md §3): F6 on the Oregon page. The page builds
// the same grid the room's bots use from its own copy of the world (about a second, once), kept up as walls and gadgets
// change, and draws it round the camera: a dot per place a body can stand (green: standing; yellow: crouched only;
// blue: on a ramp), and a line per link (orange: a vault; purple: a ladder; red: a drop; brown: a barricade to break).
import * as THREE from "three";
import { LinkKind, NavFlag, NavWorld, NODE_SPAN } from "@redmond/shared";
import type { LabApi } from "./common/lab.js";

/** How far round the camera it draws (m), and how often it redraws (ms) or after moving this far (m). */
const RADIUS = 14;
const REDRAW_MS = 500;
const REDRAW_MOVE = 2;

const LINK_COLOURS: Record<number, number> = { [LinkKind.Vault]: 0xff9a3c, [LinkKind.Ladder]: 0xb36bff, [LinkKind.Drop]: 0xff4d4d, [LinkKind.Barricade]: 0x9c6a3a };

export function navOverlay(lab: LabApi): void {
  let nav: NavWorld | null = null;
  let on = false;
  let drawnAt = { t: -Infinity, x: 0, z: 0, version: -1 };
  const dots = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.09, vertexColors: true, depthTest: true }));
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
  dots.visible = lines.visible = false;
  dots.frustumCulled = lines.frustumCulled = false;
  lab.scene.add(dots, lines);

  lab.onKey("F6", () => {
    on = !on;
    if (on && !nav) {
      lab.flash("Building the bots' grid…", "info");
      // After the message is drawn: the build takes about a second.
      setTimeout(() => {
        nav = new NavWorld(lab.sim);
        drawnAt.t = -Infinity;
      }, 50);
    }
    dots.visible = lines.visible = on;
    lab.flash(on ? "Bots' grid on (F6)" : "Bots' grid off", "info");
  });
  lab.addHelp("<kbd>F6</kbd>", "The bots' navigation grid round you: where a body stands (green; yellow crouched; blue a ramp) and its vaults, ladders, drops and barricades");

  lab.onFrame((now) => {
    if (!on || !nav) return;
    nav.step(4);
    const cam = lab.camera.position;
    const moved = Math.hypot(cam.x - drawnAt.x, cam.z - drawnAt.z);
    if (now - drawnAt.t < REDRAW_MS && moved < REDRAW_MOVE && nav.grid.version === drawnAt.version) return;
    drawnAt = { t: now, x: cam.x, z: cam.z, version: nav.grid.version };
    const g = nav.grid;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (const k of g.chunksIn(cam.x - RADIUS, cam.z - RADIUS, cam.x + RADIUS, cam.z + RADIUS)) {
      const ch = g.chunks[k];
      for (let n = 0; n < ch.y.length; n++) {
        const [x, y, z] = g.nodePos(k * NODE_SPAN + n);
        if (Math.hypot(x - cam.x, z - cam.z) > RADIUS || Math.abs(y - cam.y) > 6) continue;
        pos.push(x, y + 0.03, z);
        const f = ch.flags[n];
        c.setHex(f & NavFlag.Ramp ? 0x4da6ff : f & NavFlag.Stand ? 0x3ccf6e : 0xf2d03b);
        col.push(c.r, c.g, c.b);
      }
    }
    dots.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    dots.geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const lp: number[] = [];
    const lc: number[] = [];
    for (const l of g.links) {
      if (!l) continue;
      const a = g.nodePos(l.from);
      if (Math.hypot(a[0] - cam.x, a[2] - cam.z) > RADIUS) continue;
      lp.push(a[0], a[1] + 0.1, a[2], l.tx, l.ty + 0.1, l.tz);
      c.setHex(LINK_COLOURS[l.kind] ?? 0xffffff);
      lc.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    lines.geometry.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
    lines.geometry.setAttribute("color", new THREE.Float32BufferAttribute(lc, 3));
  });
}
