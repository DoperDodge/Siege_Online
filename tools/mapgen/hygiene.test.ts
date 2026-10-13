// The repo is public: no third-party image may ever be committed (PLAN §1.1, DECISIONS D-079). Oregon's
// extraction reads r6calls and Ubisoft images, so this test fails on any tracked image file, and on any
// tracked file that embeds image bytes or an image data URI. The only images allowed are our own plan SVGs
// in research/oregon/compare/ (drawn by tools/mapgen from our geometry, never embedding a picture), and
// Ulo's screenshots in research/oregon/refs/ulo/ once Ulo has made the repo private and removed its
// .gitignore lines. Run it before committing with: npx vitest run tools/mapgen/hygiene.test.ts
// (.githooks/pre-commit does that; enable with `git config core.hooksPath .githooks`).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?|ico|svgz?|avif|heic|heif|psd|exr|hdr|tga|dds|ktx2?|jxl)$/i;
/** Our own drawings: plain SVG written by tools/mapgen/plans.ts with this attribute. */
const PLAN_SVG = /^research\/oregon\/compare\/[\w.-]+\.svg$/;
const PLAN_MARK = 'data-generator="tools/mapgen"';
const ULO_DIR = "research/oregon/refs/ulo/";

// Built from parts so this file doesn't trip its own check.
const DATA_URI = ["data", ":image/"].join("");
const BASE64_HEADS = [["iVBOR", "w0KGgo"], ["/9j/", "4AAQ"], ["/9j/", "4QA"], ["/9j/", "2wBD"], ["R0lG", "ODlh"], ["R0lG", "ODdh"], ["UklG", "R"]].map((p) => p.join(""));
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const GIF_MAGIC = Buffer.from("GIF8", "latin1");

function tracked(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
}

/** Ulo's screenshot folder counts as allowed only once .gitignore stops ignoring it (the repo went private). */
function uloFolderOpen(): boolean {
  const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
  return !ignore.split(/\r?\n/).some((l) => l.trim() === "research/oregon/refs/ulo/*");
}

/** What is wrong with one tracked file, or null. */
export function imageProblem(path: string, bytes: Buffer, uloOpen: boolean): string | null {
  if (uloOpen && path.startsWith(ULO_DIR)) return null;
  if (IMAGE_EXT.test(path)) {
    if (!PLAN_SVG.test(path)) return "is an image file";
    const text = bytes.toString("utf8");
    if (!text.includes(PLAN_MARK)) return `is an SVG without ${PLAN_MARK}`;
    if (/<image\b|href\s*=|<foreignObject\b/i.test(text)) return "is a plan SVG that embeds or links a picture";
  }
  if (bytes.subarray(0, 8).equals(PNG_MAGIC) || bytes.indexOf(PNG_MAGIC) >= 0) return "contains PNG bytes";
  if (bytes.subarray(0, 3).equals(JPEG_MAGIC)) return "is a JPEG";
  if (bytes.subarray(0, 4).equals(GIF_MAGIC)) return "is a GIF";
  const text = bytes.toString("latin1");
  if (text.includes(DATA_URI)) return "contains an image data URI";
  const head = BASE64_HEADS.find((h) => text.includes(h));
  if (head) return `contains base64 image data (${head}…)`;
  return null;
}

describe("repo hygiene", () => {
  it("tracks no third-party image, image bytes or image data URI", () => {
    const uloOpen = uloFolderOpen();
    const problems: string[] = [];
    for (const path of tracked()) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(join(ROOT, path));
      } catch {
        continue; // deleted in the working tree
      }
      const p = imageProblem(path, bytes, uloOpen);
      if (p) problems.push(`${path} ${p}`);
    }
    expect(problems).toEqual([]);
  });

  it("recognises images in every disguise", () => {
    const png = Buffer.concat([PNG_MAGIC, Buffer.alloc(16)]);
    expect(imageProblem("a/b.png", Buffer.from("x"), false)).toBe("is an image file");
    expect(imageProblem("notes.md", png, false)).toBe("contains PNG bytes");
    expect(imageProblem("x.bin", Buffer.from([0xff, 0xd8, 0xff, 0xe0]), false)).toBe("is a JPEG");
    expect(imageProblem("page.html", Buffer.from(`<img src="${DATA_URI}png;base64,AAAA">`), false)).toBe("contains an image data URI");
    expect(imageProblem("blob.json", Buffer.from(`{"b":"${BASE64_HEADS[0]}AAAA"}`), false)).toMatch(/base64 image data/);
    expect(imageProblem("research/oregon/compare/1F.svg", Buffer.from(`<svg ${PLAN_MARK}><rect/></svg>`), false)).toBeNull();
    expect(imageProblem("research/oregon/compare/1F.svg", Buffer.from(`<svg ${PLAN_MARK}><image href="x.jpg"/></svg>`), false)).toMatch(/embeds/);
    expect(imageProblem("research/oregon/compare/1F.svg", Buffer.from("<svg><rect/></svg>"), false)).toMatch(/without/);
    expect(imageProblem("research/oregon/refs/ulo/kitchen.png", png, false)).toBe("is an image file");
    expect(imageProblem("research/oregon/refs/ulo/kitchen.png", png, true)).toBeNull();
    expect(imageProblem("game/shared/src/sim.ts", Buffer.from("export const x = 1;"), false)).toBeNull();
  });
});
