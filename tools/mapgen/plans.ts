// The plans `npm run mapgen` draws (DESIGN §9.1, amendment 11): a plan of the compiled level per storey, cut 1.2 m
// above the floor, with the storey's floor panels (soft floors, hatches), its stairs and ladders and its room
// callouts, drawn in that floor's own frame (u), framed to what it draws. Our geometry only, written to
// builds/mapgen/plans/<map>/ (gitignored) with a page that shows them a storey at a time, a layer at a time.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { frames, type FrameId } from "./frames.js";
import { loadInputs } from "./compile.js";
import type { Floor } from "./schema.js";
import { stepBoxes, type Flight } from "./stairs.js";

/** Room round what a plan draws (u). */
const MARGIN_U = 6;
const COLOURS: Record<string, string> = {
  HARD_WALL: "#6b7178",
  REINFORCEABLE: "#2f7de1",
  BARRICADE: "#b5793a",
  WINDOW: "#4fc3e8",
  SOFT_FLOOR: "#d9a441",
  HATCH: "#3fa75a",
  STAIRS: "#d1495b",
};

interface Solid {
  id: string;
  center: number[];
  size: number[];
  surface: string;
  bodiesOnly?: boolean;
  drawOnly?: boolean;
  vaultable?: boolean;
  label?: string;
}

interface Ladder {
  id: string;
  base: number[];
  height: number;
  yawDeg: number;
  width: number;
}

interface Room {
  id: string;
  callout: string;
  storey: string;
  anchor: number[];
}

const f2 = (x: number) => Math.round(x * 100) / 100;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The plan SVG of one storey (our geometry only), in the floor's own u. */
export function planSvg(root: string, level: Record<string, unknown>, floor: Floor, mapId = "millrace"): string {
  const { layout, exterior } = loadInputs(root, mapId);
  const fr = frames(layout);
  const k = layout.units.mPerU;
  const storey = layout.storeys.find((s) => s.id === floor)!;
  const cut = storey.floorY + 1.2;
  const native = (x: number, z: number) => fr.toNative(floor as FrameId, x / k, z / k);
  const rects: string[] = [];
  const labels: string[] = [];
  const box = (s: Solid) => {
    const [x0, y0] = native(s.center[0] - s.size[0] / 2, s.center[2] - s.size[2] / 2);
    const [x1, y1] = native(s.center[0] + s.size[0] / 2, s.center[2] + s.size[2] / 2);
    return { x0, y0, x1, y1, attrs: `x="${f2(x0)}" y="${f2(y0)}" width="${f2(x1 - x0)}" height="${f2(y1 - y0)}"` };
  };
  // The floor under this storey: soft-floor tiles and hatches (hard slab is everything else).
  const floors: string[] = [];
  const lift = Math.max(0, ...layout.floorShifts.map((x) => x.raiseM ?? 0));
  for (const s of level.solids as Solid[]) {
    const top = s.center[1] + s.size[1] / 2;
    // The storey's floor panels, a shifted room's too (layout.floorShifts: up to 0.3 m lower, or raised).
    if ((s.surface !== "SOFT_FLOOR" && s.surface !== "HATCH") || top > storey.floorY + lift + 0.01 || top < storey.floorY - 0.31) continue;
    const b = box(s);
    floors.push(`<rect class="floors" ${b.attrs} fill="${COLOURS[s.surface]}" fill-opacity="0.45" stroke="${COLOURS[s.surface]}" stroke-width="0.2"><title>${esc(s.id)}</title></rect>`);
    if (s.label) labels.push(`<text class="labels floors" x="${f2((b.x0 + b.x1) / 2)}" y="${f2((b.y0 + b.y1) / 2)}">${esc(s.label)}</text>`);
  }
  // Rails: a blocker for bodies only, drawn as a dashed outline.
  for (const s of level.solids as Solid[]) {
    if (!s.bodiesOnly || !s.vaultable || Math.abs(s.center[1] - s.size[1] / 2 - storey.floorY) > 0.01) continue;
    rects.push(`<rect class="walls" ${box(s).attrs} fill="none" stroke="${COLOURS.HARD_WALL}" stroke-width="0.3" stroke-dasharray="1 0.6"><title>${esc(s.id)} (rail)</title></rect>`);
  }
  // Stairs: each flight that starts on this storey, its treads darker the higher they are and an arrow up it; the
  // landings; a ladder on the storey it climbs from and the one it reaches (the dividers are walls, cut above).
  const C = COLOURS.STAIRS;
  const next = Math.min(...layout.storeys.map((s) => s.floorY).filter((y) => y > storey.floorY));
  const onStorey = (y: number) => y > storey.floorY - 0.01 && y < next - 0.01;
  const stairs: string[] = [];
  for (const f of (level.stairs ?? []) as Flight[]) {
    if (!onStorey(f.start[1])) continue;
    for (const [i, step] of stepBoxes(f).entries()) {
      const [x0, y0] = native(step.rect[0], step.rect[1]);
      const [x1, y1] = native(step.rect[2], step.rect[3]);
      const fill = f2(0.1 + (0.4 * (i + 1)) / f.steps);
      stairs.push(`<rect class="stairs" x="${f2(x0)}" y="${f2(y0)}" width="${f2(x1 - x0)}" height="${f2(y1 - y0)}" fill="${C}" fill-opacity="${fill}" stroke="${C}" stroke-width="0.1"><title>${esc(f.id)} step ${i + 1}</title></rect>`);
    }
    const [fx, fz] = [-Math.sin((f.yawDeg * Math.PI) / 180), -Math.cos((f.yawDeg * Math.PI) / 180)];
    const [ax, ay] = native(f.start[0] + fx * f.run * 0.5, f.start[2] + fz * f.run * 0.5);
    const [bx, by] = native(f.start[0] + fx * f.run * (f.steps - 0.5), f.start[2] + fz * f.run * (f.steps - 0.5));
    const len = Math.hypot(bx - ax, by - ay);
    const [dx, dy] = [(bx - ax) / len, (by - ay) / len];
    const [hx, hy] = [bx - dx * 1.5, by - dy * 1.5];
    stairs.push(
      `<path class="stairs" d="M${f2(ax)} ${f2(ay)}L${f2(hx)} ${f2(hy)}" stroke="${C}" stroke-width="0.4" fill="none"/>` +
        `<path class="stairs" d="M${f2(bx)} ${f2(by)}L${f2(hx - dy * 0.8)} ${f2(hy + dx * 0.8)}L${f2(hx + dy * 0.8)} ${f2(hy - dx * 0.8)}Z" fill="${C}"><title>${esc(f.id)}: up</title></path>`,
    );
    // The run's name along its first flight, between the arrow and the edge, upright.
    const run = /^(.*):(.*)#0$/.exec(f.id);
    const side = f.width / k / 4;
    const [tx, ty] = [(ax + bx) / 2 - dy * side, (ay + by) / 2 + dx * side];
    const turn = (((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 180) - 90;
    if (run) labels.push(`<text class="labels stairs" x="${f2(tx)}" y="${f2(ty)}" transform="rotate(${f2(turn)} ${f2(tx)} ${f2(ty)})">${esc(`${run[1]} ${run[2]}`)}</text>`);
  }
  for (const s of level.solids as Solid[]) {
    if (!s.id.endsWith(".landing") || !onStorey(s.center[1] + s.size[1] / 2)) continue;
    stairs.push(`<rect class="stairs" ${box(s).attrs} fill="${C}" fill-opacity="0.5" stroke="${C}" stroke-width="0.1"><title>${esc(s.id)}</title></rect>`);
  }
  for (const l of (level.ladders ?? []) as Ladder[]) {
    const up = onStorey(l.base[1]);
    if (!up && !onStorey(l.base[1] + l.height)) continue;
    // The rungs stand 6 cm off the wall face, across the climber's facing (game/shared/src/level/builder.ts).
    const [fx, fz] = [-Math.sin((l.yawDeg * Math.PI) / 180), -Math.cos((l.yawDeg * Math.PI) / 180)];
    const [cx, cz] = [l.base[0] - fx * 0.06, l.base[2] - fz * 0.06];
    const [hw, hd] = [Math.abs(fz) * (l.width / 2) + Math.abs(fx) * 0.06, Math.abs(fx) * (l.width / 2) + Math.abs(fz) * 0.06];
    const [x0, y0] = native(cx - hw, cz - hd);
    const [x1, y1] = native(cx + hw, cz + hd);
    const [lx, ly] = native(l.base[0] - fx * 0.8, l.base[2] - fz * 0.8);
    stairs.push(`<rect class="stairs" x="${f2(x0)}" y="${f2(y0)}" width="${f2(x1 - x0)}" height="${f2(y1 - y0)}" fill="${C}" stroke="${C}" stroke-width="0.3"><title>${esc(l.id)}: ladder ${up ? "up" : "down from the top"}</title></rect>`);
    labels.push(`<text class="labels stairs" x="${f2(lx)}" y="${f2(ly)}">${esc(`${l.id} ladder ${up ? "up" : "down"}`)}</text>`);
  }
  // Rooms: each callout at its anchor.
  const rooms = ((level.rooms ?? []) as Room[]).filter((r) => r.storey === floor);
  const callouts = rooms.map((r) => {
    const [x, y] = native(r.anchor[0], r.anchor[2]);
    return `<text class="rooms" x="${f2(x)}" y="${f2(y)}"><title>${esc(r.id)}</title>${esc(r.callout)}</text>`;
  });
  // A storey's own boxes: a roof's steps (roofs.ts) can reach a storey's cut, and the outside stands at the
  // ground's, but neither is a storey's walls.
  const others = new Set([...layout.roofs.map((r) => r.id), ...[...exterior.items, ...exterior.props].map((i) => i.id)]);
  for (const s of level.solids as Solid[]) {
    if (s.bodiesOnly || s.drawOnly || s.surface === "HARD_FLOOR" || others.has(s.id.split(/[.#]/)[0]) || others.has(s.id.replace(/\.bar$/, ""))) continue; // a rail's bar isn't a wall
    if (s.center[1] - s.size[1] / 2 > cut || s.center[1] + s.size[1] / 2 < cut) continue;
    const [x0, y0] = native(s.center[0] - s.size[0] / 2, s.center[2] - s.size[2] / 2);
    const [x1, y1] = native(s.center[0] + s.size[0] / 2, s.center[2] + s.size[2] / 2);
    const layer = s.surface === "HARD_WALL" ? "walls" : s.surface === "REINFORCEABLE" ? "panels" : "openings";
    rects.push(`<rect class="${layer}" x="${f2(x0)}" y="${f2(y0)}" width="${f2(x1 - x0)}" height="${f2(y1 - y0)}" fill="${COLOURS[s.surface] ?? "#999"}"><title>${esc(s.id)}</title></rect>`);
    if (s.surface === "REINFORCEABLE" || s.label) {
      const vertical = y1 - y0 > x1 - x0;
      const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
      labels.push(`<text class="labels" x="${f2(cx)}" y="${f2(cy)}"${vertical ? ` transform="rotate(90 ${f2(cx)} ${f2(cy)})"` : ""}>${esc(s.label ?? s.id)}</text>`);
    }
  }
  // Framed to what it draws: every box's corners, every label's spot.
  const xs: number[] = [];
  const ys: number[] = [];
  for (const m of [...floors, ...stairs, ...rects].join("\n").matchAll(/x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    xs.push(+m[1], +m[1] + +m[3]);
    ys.push(+m[2], +m[2] + +m[4]);
  }
  for (const m of [...labels, ...callouts].join("\n").matchAll(/x="(-?[\d.]+)" y="(-?[\d.]+)"/g)) {
    xs.push(+m[1]);
    ys.push(+m[2]);
  }
  const [x0, y0] = xs.length ? [Math.min(...xs) - MARGIN_U, Math.min(...ys) - MARGIN_U] : [0, 0];
  const [w, h] = xs.length ? [Math.max(...xs) + MARGIN_U - x0, Math.max(...ys) + MARGIN_U - y0] : [100, 100];
  const px = Math.round((1024 * w) / Math.max(w, h));
  const py = Math.round((1024 * h) / Math.max(w, h));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" data-generator="tools/mapgen" viewBox="${f2(x0)} ${f2(y0)} ${f2(w)} ${f2(h)}" width="${px}" height="${py}">`,
    `<!-- ${esc(layout.name)} ${floor}, compiled level cut at ${f2(cut)} m, in the ${floor} frame's own u. Generated by npm run mapgen; our geometry only. -->`,
    `<style>text{font:3px sans-serif;fill:#102040;text-anchor:middle;dominant-baseline:middle}text.rooms{font:bold 4px sans-serif;fill:#7a1f5c}text.stairs{fill:#7a1424;paint-order:stroke;stroke:#fff;stroke-width:0.6px}</style>`,
    ...floors,
    ...stairs,
    ...rects,
    ...labels,
    ...callouts,
    "</svg>",
    "",
  ].join("\n");
}

/** The plans' page: each storey's plan, its layers shown or hidden by a box each. */
function plansPage(name: string, floors: { floor: Floor; svg: string }[]): string {
  const sections = floors.map(({ floor, svg }) => `<section><h2>${floor}</h2><div class="plan">${svg.replace(/ width="\d+" height="\d+"/, ' width="100%"')}</div></section>`);
  return `<!doctype html><meta charset="utf-8"><title>${esc(name)} plans</title>
<style>body{font:14px sans-serif;margin:16px;background:#f4f2ee;color:#102040}.plan{max-width:1100px;background:#fff}label{margin-right:14px}</style>
<p>${esc(name)}, compiled and cut 1.2 m above each storey's floor (npm run mapgen). Blue: soft walls; brown: barricades; cyan: glass;
grey: hard walls (dashed: rails); yellow: soft floor; green: hatches; red: stairs (darker as they climb, the arrow points up) and
ladders; purple: room callouts.</p>
<p>${["walls", "panels", "openings", "floors", "stairs", "rooms", "labels"].map((l) => `<label><input type="checkbox" data-layer="${l}" checked> ${l}</label>`).join("")}</p>
${sections.join("\n")}
<script>
for (const c of document.querySelectorAll("[data-layer]")) c.onchange = () => {
  for (const e of document.querySelectorAll("." + c.dataset.layer)) e.style.display = c.checked ? "inline" : "none";
};
</script>
`;
}

/** Every storey's plan, and the page showing them, to builds/mapgen/plans/<map>/. */
export function writePlans(root: string, level: Record<string, unknown>, mapId = "millrace") {
  const { layout } = loadInputs(root, mapId);
  const dir = join(root, "builds", "mapgen", "plans", mapId);
  mkdirSync(dir, { recursive: true });
  const out: { floor: Floor; svg: string }[] = [];
  for (const floor of layout.emit) {
    const svg = planSvg(root, level, floor, mapId);
    out.push({ floor, svg });
    writeFileSync(join(dir, `${floor}.svg`), svg);
  }
  const page = join(dir, "index.html");
  writeFileSync(page, plansPage(layout.name, out));
  console.log(`plans: builds/mapgen/plans/${mapId}/{${layout.emit.join(",")}}.svg; page: ${page}`);
}
