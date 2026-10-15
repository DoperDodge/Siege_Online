// npm run mapgen:compare (DESIGN §9.1, amendment 11): a plan of the compiled level per storey, cut 1.2 m above
// the floor, with the storey's floor panels (soft floors, hatches) and its room callouts, drawn in that floor's
// own image frame (u), so it lies exactly over the r6calls raster and,
// through the registration below, over the official blueprint. The plans are our geometry only: they are
// committed to research/oregon/compare/ for Ulo to open. The comparison page that puts them over the
// downloaded images lives in builds/ (gitignored) and only links to the images; it never copies them.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { frames, type FrameId } from "./frames.js";
import { loadInputs } from "./compile.js";
import type { Floor } from "./research.js";

/** One r6calls floor image is 361.244 u square (research/oregon/layout_notes.md §1). */
const IMAGE_U = 361.244;
/** Blueprint pixel = a * u + b per floor (geometry extraction, rms about 0.1 u; DESIGN §3.2); 3F is weak, so it borrows 2F's. */
const BLUEPRINT: Record<Floor, { file: string; ax: number; bx: number; ay: number; by: number }> = {
  B: { file: "r6-maps-oregon-blueprint-1.jpg", ax: 2.0226, bx: 359.8, ay: 2.0226, by: 114.74 },
  "1F": { file: "r6-maps-oregon-blueprint-2.jpg", ax: 2.0237, bx: 359.33, ay: 2.0214, by: 114.96 },
  "2F": { file: "r6-maps-oregon-blueprint-3.jpg", ax: 2.0248, bx: 359.22, ay: 2.0255, by: 114.34 },
  "3F": { file: "r6-maps-oregon-blueprint-4.jpg", ax: 2.0248, bx: 359.22, ay: 2.0255, by: 114.34 },
};
const RASTER: Record<Floor, string> = { B: "0-pic.png", "1F": "1-pic.png", "2F": "2-pic.png", "3F": "3-pic.png" };
const COLOURS: Record<string, string> = {
  HARD_WALL: "#6b7178",
  REINFORCEABLE: "#2f7de1",
  BARRICADE: "#b5793a",
  WINDOW: "#4fc3e8",
  SOFT_FLOOR: "#d9a441",
  HATCH: "#3fa75a",
};

interface Solid {
  id: string;
  center: number[];
  size: number[];
  surface: string;
  bodiesOnly?: boolean;
  vaultable?: boolean;
  label?: string;
}

interface Room {
  id: string;
  callout: string;
  storey: string;
  anchor: number[];
}

const f2 = (x: number) => Math.round(x * 100) / 100;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The plan SVG of one storey (our geometry only), in the floor image's own u. */
export function planSvg(root: string, level: Record<string, unknown>, floor: Floor): string {
  const { layout } = loadInputs(root);
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
  for (const s of level.solids as Solid[]) {
    if ((s.surface !== "SOFT_FLOOR" && s.surface !== "HATCH") || Math.abs(s.center[1] + s.size[1] / 2 - storey.floorY) > 0.01) continue;
    const b = box(s);
    floors.push(`<rect class="floors" ${b.attrs} fill="${COLOURS[s.surface]}" fill-opacity="0.45" stroke="${COLOURS[s.surface]}" stroke-width="0.2"><title>${esc(s.id)}</title></rect>`);
    if (s.label) labels.push(`<text class="labels floors" x="${f2((b.x0 + b.x1) / 2)}" y="${f2((b.y0 + b.y1) / 2)}">${esc(s.label)}</text>`);
  }
  // Rails: a blocker for bodies only, drawn as a dashed outline.
  for (const s of level.solids as Solid[]) {
    if (!s.bodiesOnly || !s.vaultable || Math.abs(s.center[1] - s.size[1] / 2 - storey.floorY) > 0.01) continue;
    rects.push(`<rect class="walls" ${box(s).attrs} fill="none" stroke="${COLOURS.HARD_WALL}" stroke-width="0.3" stroke-dasharray="1 0.6"><title>${esc(s.id)} (rail)</title></rect>`);
  }
  // Rooms: each callout at its anchor.
  const rooms = ((level.rooms ?? []) as Room[]).filter((r) => r.storey === floor);
  const callouts = rooms.map((r) => {
    const [x, y] = native(r.anchor[0], r.anchor[2]);
    return `<text class="rooms" x="${f2(x)}" y="${f2(y)}"><title>${esc(r.id)}</title>${esc(r.callout)}</text>`;
  });
  for (const s of level.solids as Solid[]) {
    if (s.bodiesOnly || s.surface === "HARD_FLOOR") continue;
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
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" data-generator="tools/mapgen" viewBox="0 0 ${IMAGE_U} ${IMAGE_U}" width="1024" height="1024">`,
    `<!-- Oregon ${floor}, compiled level cut at ${f2(cut)} m, in the ${floor} image's own u. Generated by npm run mapgen:compare; our geometry only. -->`,
    `<style>text{font:3px sans-serif;fill:#102040;text-anchor:middle;dominant-baseline:middle}text.rooms{font:bold 4px sans-serif;fill:#7a1f5c}</style>`,
    ...floors,
    ...rects,
    ...labels,
    ...callouts,
    "</svg>",
    "",
  ].join("\n");
}

function comparePage(floors: { floor: Floor; svg: string }[]): string {
  const S = 2.6; // css px per u
  const W = IMAGE_U * S;
  const sections = floors.map(({ floor, svg }) => {
    const bp = BLUEPRINT[floor];
    // Blueprint pixel (0, 0) sits at u = (-b / a); the 1600 x 900 image spans 1600 / a by 900 / a u.
    const style = `left:${f2((-bp.bx / bp.ax) * S)}px;top:${f2((-bp.by / bp.ay) * S)}px;width:${f2((1600 / bp.ax) * S)}px;height:${f2((900 / bp.ay) * S)}px`;
    return `<section><h2>${floor}</h2><div class="stack" style="width:${f2(W)}px;height:${f2(W)}px">
<img class="bg r6c" src="../../../research/oregon/refs/web/r6calls/${RASTER[floor]}" style="left:0;top:0;width:100%;height:100%" alt="">
<img class="bg bp" src="../../../research/oregon/refs/web/blueprint/${bp.file}" style="${style}" alt="">
<div class="plan">${svg.replace(/width="1024" height="1024"/, 'width="100%" height="100%"')}</div></div></section>`;
  });
  return `<!doctype html><meta charset="utf-8"><title>Oregon plans vs references</title>
<style>body{font:14px sans-serif;margin:16px;background:#1d2126;color:#eee}.stack{position:relative;overflow:hidden;background:#000}
.bg{position:absolute;max-width:none}.plan{position:absolute;inset:0}label{margin-right:14px}</style>
<p>Our compiled plan (coloured) over the r6calls raster or Ubisoft's blueprint. The images are local downloads
(npm run mapgen:refs) and are never committed. Blue: soft walls; brown: barricades; cyan: glass; grey: hard walls (dashed: rails);
yellow: soft floor; green: hatches; purple: room callouts.</p>
<p><label>Background <select id="bg"><option value="r6c">r6calls raster</option><option value="bp">official blueprint</option><option value="none">none</option></select></label>
<label>Plan opacity <input id="op" type="range" min="0" max="1" step="0.05" value="0.6"></label>
${["walls", "panels", "openings", "floors", "rooms", "labels"].map((l) => `<label><input type="checkbox" data-layer="${l}" checked> ${l}</label>`).join("")}</p>
${sections.join("\n")}
<script>
const bg = document.getElementById("bg"), op = document.getElementById("op");
const apply = () => {
  for (const i of document.querySelectorAll(".bg")) i.style.display = i.classList.contains(bg.value) ? "" : "none";
  for (const p of document.querySelectorAll(".plan")) p.style.opacity = op.value;
};
bg.onchange = op.oninput = apply;
for (const c of document.querySelectorAll("[data-layer]")) c.onchange = () => {
  for (const e of document.querySelectorAll("." + c.dataset.layer)) e.style.display = c.checked ? "" : "none";
};
apply();
</script>
`;
}

export function writePlans(root: string, level: Record<string, unknown>) {
  const { layout } = loadInputs(root);
  const out: { floor: Floor; svg: string }[] = [];
  for (const floor of layout.emit) {
    const svg = planSvg(root, level, floor);
    out.push({ floor, svg });
    for (const dir of [join(root, "research", "oregon", "compare"), join(root, "builds", "mapgen", "plans")]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${floor}.svg`), svg);
    }
  }
  const page = join(root, "builds", "mapgen", "compare", "index.html");
  mkdirSync(join(root, "builds", "mapgen", "compare"), { recursive: true });
  writeFileSync(page, comparePage(out));
  console.log(`plans: research/oregon/compare/{${layout.emit.join(",")}}.svg; overlay page (local images): ${page}`);
}
