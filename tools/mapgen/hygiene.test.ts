// The repo is public: no third-party image may ever be committed (PLAN §1.1, DECISIONS D-079). Oregon's
// extraction reads r6calls and Ubisoft images, so this test fails on any tracked image file, on archives and
// containers that can carry images, and on any tracked file holding image bytes, an image data URI or base64
// image data. It reads what git has staged (the index), not the working tree, so a file staged and then
// deleted on disk is still checked. The only images allowed are our own plan SVGs in research/oregon/compare/
// (drawn by tools/mapgen from our geometry, never embedding a picture), and Ulo's screenshots in
// research/oregon/refs/ulo/ once Ulo has made the repo private and removed its .gitignore lines.
// Run it before committing with: npx vitest run tools/mapgen/hygiene.test.ts
// (.githooks/pre-commit does that; enable with `git config core.hooksPath .githooks`).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const IMAGE_EXT = /\.(png|jpe?g|jfif|gif|webp|bmp|tiff?|ico|svgz?|avif|heic|heif|psd|exr|hdr|tga|dds|ktx2?|jxl)$/i;
/** Our own drawings: plain SVG written by tools/mapgen/plans.ts with this attribute. */
const PLAN_SVG = /^research\/oregon\/compare\/[\w.-]+\.svg$/;
const PLAN_MARK = 'data-generator="tools/mapgen"';
const ULO_DIR = "research/oregon/refs/ulo/";

// Built from parts so this file doesn't trip its own check.
const DATA_URI = ["data", ":image/"].join("");
const WEBP = ["WEBP", "VP8"].join("");
/** Base64 of a PNG, JPEG (FF D8 FF and a real marker), GIF or RIFF (WEBP) head, anywhere in a file. */
const BASE64_HEAD = new RegExp([["iVBOR", "w0KGgo"], ["/9", "j/[2-7wx/]"], ["R0lG", "OD[dl]h"], ["UklG", "R"]].map((p) => p.join("")).join("|"));
const bytes = (...b: number[]) => Buffer.from(b);
const PNG_MAGIC = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
/** Containers that can carry pictures inside them: zip (and docx, jar…), 7z, rar, gzip, PDF, binary glTF. */
const CONTAINERS: [Buffer, string][] = [
  [bytes(0x50, 0x4b, 0x03, 0x04), "a zip archive"],
  [bytes(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c), "a 7z archive"],
  [Buffer.from("Rar!", "latin1"), "a rar archive"],
  [bytes(0x1f, 0x8b), "a gzip archive"],
  [Buffer.from("%PDF", "latin1"), "a PDF"],
  [Buffer.from("glTF", "latin1"), "a binary glTF model"],
];

/** A JPEG start: FF D8 FF and a real marker (APPn, DQT, SOFn, DHT, COM). */
function jpegAt(b: Buffer): number {
  for (let i = b.indexOf(0xff); i >= 0 && i + 3 < b.length; i = b.indexOf(0xff, i + 1)) {
    if (b[i + 1] !== 0xd8 || b[i + 2] !== 0xff) continue;
    const m = b[i + 3];
    if ((m >= 0xe0 && m <= 0xef) || m === 0xdb || m === 0xc0 || m === 0xc2 || m === 0xc4 || m === 0xfe) return i;
  }
  return -1;
}

/** What is wrong with one tracked file, or null. */
export function imageProblem(path: string, b: Buffer, uloOpen: boolean): string | null {
  if (uloOpen && path.startsWith(ULO_DIR)) return null;
  if (IMAGE_EXT.test(path)) {
    if (!PLAN_SVG.test(path)) return "is an image file";
    const text = b.toString("utf8");
    if (!text.includes(PLAN_MARK)) return `is an SVG without ${PLAN_MARK}`;
    if (/<image\b|href\s*=|<foreignObject\b/i.test(text)) return "is a plan SVG that embeds or links a picture";
  }
  for (const [magic, what] of CONTAINERS) if (b.subarray(0, magic.length).equals(magic)) return `is ${what}, which can carry images`;
  if (b.indexOf(PNG_MAGIC) >= 0) return "contains PNG bytes";
  if (jpegAt(b) >= 0) return "contains JPEG bytes";
  const head = b.subarray(0, 16).toString("latin1");
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "is a GIF";
  if (b.indexOf(WEBP) >= 0) return "contains WEBP bytes";
  if (head.startsWith("II*\0") || head.startsWith("MM\0*")) return "is a TIFF";
  if (head.slice(4, 8) === "ftyp" && /^(avif|avis|heic|heix|mif1|msf1)$/.test(head.slice(8, 12))) return "is an AVIF or HEIC image";
  if (head.startsWith("\xff\x0a") || head.startsWith("\0\0\0\x0cJXL ")) return "is a JPEG XL image";
  if (b.length >= 14 && head.startsWith("BM") && b.readUInt32LE(2) === b.length && b.readUInt32LE(6) === 0) return "is a BMP";
  if (b.length >= 6 && b.readUInt32LE(0) === 0x00010000 && b.readUInt16LE(4) > 0 && b.readUInt16LE(4) < 256 && !path.endsWith(".json")) return "is an ICO";
  const text = b.toString("latin1");
  if (text.includes(DATA_URI)) return "contains an image data URI";
  const b64 = BASE64_HEAD.exec(text);
  if (b64) return `contains base64 image data (${b64[0]}…)`;
  return null;
}

/** Every tracked path with its staged content (git's index), read in one batch. */
function stagedFiles(): { path: string; bytes: Buffer | null }[] {
  const entries = execFileSync("git", ["ls-files", "-s", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split("\t");
      const [mode, sha] = meta.split(" ");
      return { path, sha, gitlink: mode === "160000" };
    })
    .filter((e) => !e.gitlink);
  const out = execFileSync("git", ["cat-file", "--batch"], { cwd: ROOT, input: entries.map((e) => e.sha).join("\n") + "\n", maxBuffer: 1 << 30 });
  const files: { path: string; bytes: Buffer | null }[] = [];
  let at = 0;
  for (const e of entries) {
    const nl = out.indexOf(0x0a, at);
    const header = out.toString("latin1", at, nl).split(" ");
    if (header[1] !== "blob") {
      files.push({ path: e.path, bytes: null });
      at = nl + 1;
      continue;
    }
    const size = Number(header[2]);
    files.push({ path: e.path, bytes: out.subarray(nl + 1, nl + 1 + size) });
    at = nl + 1 + size + 1;
  }
  return files;
}

/** Ulo's screenshot folder counts as allowed only once .gitignore stops ignoring it (the repo went private). */
function uloFolderOpen(): boolean {
  const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
  return !ignore.split(/\r?\n/).some((l) => l.trim() === "research/oregon/refs/ulo/*");
}

describe("repo hygiene", () => {
  it("tracks no third-party image, image bytes, image data URI or image-carrying archive", () => {
    const uloOpen = uloFolderOpen();
    const problems: string[] = [];
    const files = stagedFiles();
    expect(files.length).toBeGreaterThan(100);
    for (const f of files) {
      if (!f.bytes) {
        problems.push(`${f.path} can't be read from the index`);
        continue;
      }
      const p = imageProblem(f.path, f.bytes, uloOpen);
      if (p) problems.push(`${f.path} ${p}`);
    }
    expect(problems).toEqual([]);
  });

  it("recognises images in every disguise", () => {
    const png = Buffer.concat([PNG_MAGIC, Buffer.alloc(16)]);
    const jpeg = (marker: number) => Buffer.concat([bytes(0xff, 0xd8, 0xff, marker), Buffer.alloc(16)]);
    const cases: [string, Buffer, RegExp | null][] = [
      ["a/b.png", Buffer.from("x"), /image file/],
      ["notes.md", png, /PNG/],
      ["x.bin", jpeg(0xe0), /JPEG/],
      ["model.bin", Buffer.concat([Buffer.from("xxxxxxxxxxxxxxxx"), jpeg(0xee)]), /JPEG/], // an Adobe JPEG after other bytes
      ["blob.dat", jpeg(0xdb), /JPEG/],
      ["refs.zip", Buffer.concat([bytes(0x50, 0x4b, 0x03, 0x04), Buffer.alloc(30)]), /zip/],
      ["doc.dat", Buffer.from("%PDF-1.7\n"), /PDF/],
      ["scene.dat", Buffer.from("glTF\x02\0\0\0"), /glTF/],
      ["tex.bin", Buffer.from(`RIFF\x10\0\0\0${WEBP} `), /WEBP/],
      ["pic.dat", (() => { const b = Buffer.alloc(20); b.write("BM", 0, "latin1"); b.writeUInt32LE(20, 2); return b; })(), /BMP/],
      ["scan.dat", Buffer.from("II*\0\x08\0\0\0"), /TIFF/],
      ["photo.dat", Buffer.from("\0\0\0\x1cftypavif\0\0\0\0"), /AVIF/],
      ["page.html", Buffer.from(`<img src="${DATA_URI}png;base64,AAAA">`), /data URI/],
      ["blob.json", Buffer.from(`{"b":"${"iVBOR" + "w0KGgoAAAA"}"}`), /base64/],
      ["jfif.json", Buffer.from(`{"b":"${"/9" + "j/4AAQSkZJRgABAQ"}"}`), /base64/],
      ["adobe.json", Buffer.from(`{"b":"${"/9" + "j/7gAOQWRvYmUA"}"}`), /base64/], // an Adobe APP14 JPEG
      ["anim.json", Buffer.from(`{"b":"${"R0lG" + "ODlhAQABAIAAAP"}"}`), /base64/],
      ["notes.md", Buffer.from("a path like /9" + "j/ in prose is fine"), null],
      ["research/oregon/compare/1F.svg", Buffer.from(`<svg ${PLAN_MARK}><rect/></svg>`), null],
      ["research/oregon/compare/1F.svg", Buffer.from(`<svg ${PLAN_MARK}><image href="x.jpg"/></svg>`), /embeds/],
      ["research/oregon/compare/1F.svg", Buffer.from("<svg><rect/></svg>"), /without/],
      ["research/oregon/refs/ulo/kitchen.png", png, /image file/],
      ["game/shared/src/sim.ts", Buffer.from("export const x = 1; // BM text and %PDF in prose are fine"), null],
      ["data/maps/oregon/level.json", Buffer.from('{"id": "oregon", "solids": []}'), null],
    ];
    for (const [path, b, want] of cases) {
      const got = imageProblem(path, b, false);
      if (want) expect(got, path).toMatch(want);
      else expect(got, path).toBeNull();
    }
    expect(imageProblem("research/oregon/refs/ulo/kitchen.png", png, true)).toBeNull();
  });
});
