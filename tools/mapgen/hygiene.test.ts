// The repo is public: no third-party image may ever be committed (PLAN §1.1, DECISIONS D-079). Oregon's
// extraction reads r6calls and Ubisoft images, so this test fails on any tracked image file; on archives,
// documents, models and videos, which can carry images (by name and by their bytes); on PNG, JPEG or WEBP bytes
// anywhere in a file and other image formats by their header; on image data URIs; and on base64 image data,
// JSON-escaped or URL-safe, wherever it starts in a long base64 run. It reads what git has staged (the index),
// not the working tree, so a file staged and then deleted on disk is still checked; a large file kept in Git LFS
// is checked by its stored content. The only images allowed are our own plan SVGs in research/oregon/compare/
// (drawn by tools/mapgen from our geometry, never embedding or linking a picture), and Ulo's screenshots in
// research/oregon/refs/ulo/ once Ulo has made the repo private and removed its .gitignore lines.
// Run it before committing with: npx vitest run tools/mapgen/hygiene.test.ts
// (.githooks/pre-commit does that; enable with `git config core.hooksPath .githooks`).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const IMAGE_EXT = /\.(png|jpe?g|jfif|gif|webp|bmp|tiff?|ico|svgz?|avif|heic|heif|psd|exr|hdr|tga|dds|ktx2?|jxl)$/i;
/** Archives, documents, models and videos: each can carry pictures; none is tracked until Ulo decides (D-079). */
const CARRIER_EXT = /\.(zip|z\d\d|7z|rar|tar|tgz|tbz2?|txz|gz|bz2|xz|zst|lz4|cab|iso|dmg|pdf|docx?|pptx?|xlsx?|odt|epub|glb|gltf|fbx|blend|usdz?|3ds|dae|ai|eps|mp4|m4v|mov|webm|mkv|avi)$/i;
/** Our own drawings: plain SVG written by tools/mapgen/plans.ts with this attribute. */
const PLAN_SVG = /^research\/oregon\/compare\/[\w.-]+\.svg$/;
const PLAN_MARK = 'data-generator="tools/mapgen"';
const ULO_DIR = "research/oregon/refs/ulo/";
const LFS_POINTER = "version https://git-lfs.github.com/spec/v1";

// Built from parts so this file doesn't trip its own check.
const DATA_URI = new RegExp(["data", ":image\\\\?/"].join(""), "i");
const WEBP = ["WEBP", "VP8"].join("");
/** Base64 of a PNG, JPEG (FF D8 FF and a real marker), GIF or RIFF (WEBP) head. */
const BASE64_HEAD = new RegExp([["iVBOR", "w0KGgo"], ["/9", "j/[2-7wx/]"], ["R0lG", "OD[dl]h"], ["UklG", "R"]].map((p) => p.join("")).join("|"));
/** A base64 run long enough to hold a picture (a sha512 checksum in package-lock.json is 88 characters). */
const BASE64_RUN = /[A-Za-z0-9+/_-]{100,}/g;
const bytes = (...b: number[]) => Buffer.from(b);
const PNG_MAGIC = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
/** Archives, compressors and containers by their first bytes. */
const CONTAINERS: [Buffer, string][] = [
  [bytes(0x50, 0x4b, 0x03, 0x04), "a zip archive"],
  [bytes(0x50, 0x4b, 0x07, 0x08), "a split zip archive"],
  [bytes(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c), "a 7z archive"],
  [Buffer.from("Rar!", "latin1"), "a rar archive"],
  [bytes(0x1f, 0x8b), "a gzip archive"],
  [bytes(0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00), "an xz archive"],
  [bytes(0x28, 0xb5, 0x2f, 0xfd), "a zstd archive"],
  [bytes(0x04, 0x22, 0x4d, 0x18), "an lz4 archive"],
  [Buffer.from("MSCF\0\0\0\0", "latin1"), "a cab archive"],
  [Buffer.from("%PDF", "latin1"), "a PDF"],
  [Buffer.from("glTF", "latin1"), "a binary glTF model"],
];

/** A JPEG start: FF D8, any FF fill bytes, then a real marker (APPn, DQT, SOFn, DHT, COM). */
function jpegAt(b: Buffer): number {
  for (let i = b.indexOf(0xff); i >= 0 && i + 3 < b.length; i = b.indexOf(0xff, i + 1)) {
    if (b[i + 1] !== 0xd8 || b[i + 2] !== 0xff) continue;
    let j = i + 2;
    while (j < b.length && b[j] === 0xff) j++;
    const m = b[j];
    if ((m >= 0xe0 && m <= 0xef) || m === 0xdb || m === 0xc0 || m === 0xc2 || m === 0xc4 || m === 0xfe) return i;
  }
  return -1;
}

/** Image bytes in `b`: PNG, JPEG or WEBP anywhere, other formats by their header. */
function imageBytes(b: Buffer): string | null {
  if (b.indexOf(PNG_MAGIC) >= 0) return "PNG";
  if (jpegAt(b) >= 0) return "JPEG";
  if (b.indexOf(WEBP) >= 0) return "WEBP";
  const head = b.subarray(0, 16).toString("latin1");
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "GIF";
  if (head.startsWith("II*\0") || head.startsWith("MM\0*")) return "TIFF";
  if (head.slice(4, 8) === "ftyp" && /^(avif|avis|heic|heix|mif1|msf1)$/.test(head.slice(8, 12))) return "AVIF or HEIC";
  if (head.startsWith("\xff\x0a") || head.startsWith("\0\0\0\x0cJXL ")) return "JPEG XL";
  if (b.length >= 14 && head.startsWith("BM") && b.readUInt32LE(2) === b.length && b.readUInt32LE(6) === 0) return "BMP";
  return null;
}

/** What is wrong with one tracked file, or null. */
export function imageProblem(path: string, b: Buffer, uloOpen: boolean): string | null {
  if (uloOpen && path.startsWith(ULO_DIR)) return null;
  if (IMAGE_EXT.test(path)) {
    if (!PLAN_SVG.test(path)) return "is an image file";
    const text = b.toString("utf8");
    if (!text.includes(PLAN_MARK)) return `is an SVG without ${PLAN_MARK}`;
    if (/<image\b|href\s*=|<foreignObject\b|@import|url\(\s*(?!['"]?#)/i.test(text)) return "is a plan SVG that embeds or links a picture";
  }
  if (CARRIER_EXT.test(path)) return "is an archive, document, model or video, which can carry images";
  for (const [magic, what] of CONTAINERS) if (b.subarray(0, magic.length).equals(magic)) return `is ${what}, which can carry images`;
  if (/^BZh[1-9]1AY&SY/.test(b.toString("latin1", 0, 10))) return "is a bzip2 archive, which can carry images";
  if (b.length > 262 && b.toString("latin1", 257, 262) === "ustar") return "is a tar archive, which can carry images";
  const raw = imageBytes(b);
  if (raw) return raw === "GIF" || raw === "TIFF" || raw === "BMP" || raw === "JPEG XL" || raw === "AVIF or HEIC" ? `is a ${raw} image` : `contains ${raw} bytes`;
  if (b.length >= 6 && b.readUInt32LE(0) === 0x00010000 && b.readUInt16LE(4) > 0 && b.readUInt16LE(4) < 256 && !path.endsWith(".json")) return "is an ICO";
  // JSON escapes "/" as "\/"; URL-safe base64 writes "-" and "_" for "+" and "/".
  const text = b.toString("latin1").replaceAll("\\/", "/");
  if (DATA_URI.test(text)) return "contains an image data URI";
  const b64 = BASE64_HEAD.exec(text) ?? BASE64_HEAD.exec(text.replaceAll("-", "+").replaceAll("_", "/"));
  if (b64) return `contains base64 image data (${b64[0]}…)`;
  // A picture can sit anywhere in a long base64 run (a model's embedded buffer): decode it from each of the
  // four places it could start.
  for (const m of text.matchAll(BASE64_RUN)) {
    for (let o = 0; o < 4; o++) {
      const found = imageBytes(Buffer.from(m[0].slice(o), "base64"));
      if (found) return `contains base64 image data (${found} in a ${m[0].length}-character run)`;
    }
  }
  return null;
}

/** The content git stores for a blob: the blob itself, or for a Git LFS pointer the object it points to (null if missing). */
function contentOf(blob: Buffer, lfsDir: string): Buffer | null {
  if (!blob.subarray(0, LFS_POINTER.length).equals(Buffer.from(LFS_POINTER))) return blob;
  const oid = /^oid sha256:([0-9a-f]{64})$/m.exec(blob.toString("latin1"))?.[1];
  const file = oid && join(lfsDir, oid.slice(0, 2), oid.slice(2, 4), oid);
  return file && existsSync(file) ? readFileSync(file) : null;
}

/** Every tracked path with its staged content (git's index), read in one batch; null where it can't be read. */
function stagedFiles(): { path: string; bytes: Buffer | null; why?: string }[] {
  const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  const common = git(["rev-parse", "--git-common-dir"]);
  const lfsDir = join(isAbsolute(common) ? common : join(ROOT, common), "lfs", "objects");
  const entries = git(["ls-files", "-s", "-z"])
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      const [mode, sha] = line.slice(0, tab).split(" ");
      return { path: line.slice(tab + 1), sha, mode };
    });
  const files: { path: string; bytes: Buffer | null; why?: string }[] = [];
  const blobs = entries.filter((e) => e.mode !== "160000");
  // A submodule is another repository: nothing in it can be checked from here.
  for (const e of entries) if (e.mode === "160000") files.push({ path: e.path, bytes: null, why: "is a submodule, whose files this check can't see" });
  const out = execFileSync("git", ["cat-file", "--batch"], { cwd: ROOT, input: blobs.map((e) => e.sha).join("\n") + "\n", maxBuffer: 1 << 30 });
  let at = 0;
  for (const e of blobs) {
    const nl = out.indexOf(0x0a, at);
    const header = out.toString("latin1", at, nl).split(" ");
    if (header[1] !== "blob") {
      files.push({ path: e.path, bytes: null, why: "can't be read from the index" });
      at = nl + 1;
      continue;
    }
    const size = Number(header[2]);
    const blob = out.subarray(nl + 1, nl + 1 + size);
    const content = contentOf(blob, lfsDir);
    files.push(content ? { path: e.path, bytes: content } : { path: e.path, bytes: null, why: "is a Git LFS pointer whose content isn't here to check (git lfs pull)" });
    at = nl + 1 + size + 1;
  }
  return files;
}

/** Ulo's screenshot folder counts as allowed only once the staged .gitignore stops ignoring it (the repo went private). */
function uloFolderOpen(gitignore: string): boolean {
  return !gitignore.split(/\r?\n/).some((l) => l.trim() === "research/oregon/refs/ulo/*");
}

describe("repo hygiene", () => {
  it("tracks no third-party image, image bytes, image data URI or image-carrying archive", () => {
    const files = stagedFiles();
    expect(files.length).toBeGreaterThan(100);
    const gitignore = files.find((f) => f.path === ".gitignore")?.bytes;
    const uloOpen = gitignore ? uloFolderOpen(gitignore.toString("utf8")) : false;
    const problems: string[] = [];
    for (const f of files) {
      if (!f.bytes) {
        problems.push(`${f.path} ${f.why}`);
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
    const tar = Buffer.alloc(600);
    tar.write("refs/kitchen.dat", 0, "latin1");
    tar.write("ustar", 257, "latin1");
    /** Base64 of `b` with `pad` bytes in front of it (the picture sits that far into a model's buffer). */
    const inBuffer = (b: Buffer, pad: number) => Buffer.concat([Buffer.alloc(pad), b, Buffer.alloc(120)]).toString("base64");
    const cases: [string, Buffer, RegExp | null][] = [
      ["a/b.png", Buffer.from("x"), /image file/],
      ["notes.md", png, /PNG/],
      ["x.bin", jpeg(0xe0), /JPEG/],
      ["model.bin", Buffer.concat([Buffer.from("xxxxxxxxxxxxxxxx"), jpeg(0xee)]), /JPEG/], // an Adobe JPEG after other bytes
      ["blob.dat", jpeg(0xdb), /JPEG/],
      ["filled.dat", Buffer.concat([bytes(0xff, 0xd8, 0xff, 0xff, 0xe0), Buffer.alloc(16)]), /JPEG/], // a fill byte after SOI
      ["refs.zip", Buffer.from("x"), /archive, document, model or video/],
      ["refs.dat", Buffer.concat([bytes(0x50, 0x4b, 0x03, 0x04), Buffer.alloc(30)]), /zip/],
      ["refs.dat", Buffer.concat([bytes(0x50, 0x4b, 0x07, 0x08), Buffer.alloc(30)]), /split zip/],
      ["refs.bin", Buffer.concat([bytes(0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00), Buffer.alloc(30)]), /xz/],
      ["refs.dat", tar, /tar archive/],
      ["refs.tar.bz2", Buffer.from("BZh91AY&SY"), /archive, document, model or video/],
      ["refs.dat", Buffer.from("BZh91AY&SY\0\0"), /bzip2/],
      ["doc.dat", Buffer.from("%PDF-1.7\n"), /PDF/],
      ["scene.dat", Buffer.from("glTF\x02\0\0\0"), /glTF/],
      ["crate.glb", Buffer.from("version https://git-lfs.github.com/spec/v1\n"), /model/],
      ["tex.bin", Buffer.from(`RIFF\x10\0\0\0${WEBP} `), /WEBP/],
      ["pic.dat", (() => { const b = Buffer.alloc(20); b.write("BM", 0, "latin1"); b.writeUInt32LE(20, 2); return b; })(), /BMP/],
      ["scan.dat", Buffer.from("II*\0\x08\0\0\0"), /TIFF/],
      ["photo.dat", Buffer.from("\0\0\0\x1cftypavif\0\0\0\0"), /AVIF/],
      ["page.html", Buffer.from(`<img src="${"data"}:image/png;base64,AAAA">`), /data URI/],
      ["page.json", Buffer.from(`{"src": "${"data"}:image\\/jpeg;base64,AAAA"}`), /data URI/], // JSON-escaped
      ["blob.json", Buffer.from(`{"b":"${"iVBOR" + "w0KGgoAAAA"}"}`), /base64/],
      ["jfif.json", Buffer.from(`{"b":"${"/9" + "j/4AAQSkZJRgABAQ"}"}`), /base64/],
      ["escaped.json", Buffer.from(`{"b":"${"\\/9" + "j\\/4AAQSkZJRgABAQ"}"}`), /base64/], // JSON-escaped slashes
      ["urlsafe.txt", Buffer.from(`b=${"_9" + "j_4AAQSkZJRgABAQ"}`), /base64/], // URL-safe alphabet
      ["adobe.json", Buffer.from(`{"b":"${"/9" + "j/7gAOQWRvYmUA"}"}`), /base64/], // an Adobe APP14 JPEG
      ["anim.json", Buffer.from(`{"b":"${"R0lG" + "ODlhAQABAIAAAP"}"}`), /base64/],
      ["scene.gltf", Buffer.from("{}"), /model/],
      ...[1, 2, 4].map((pad): [string, Buffer, RegExp] => [`buffer${pad}.json`, Buffer.from(`{"uri": "x;base64,${inBuffer(jpeg(0xe0), pad)}"}`), /base64 image data \(JPEG/]),
      ["research/oregon/compare/1F.svg", Buffer.from(`<svg ${PLAN_MARK}><rect/></svg>`), null],
      ["research/oregon/compare/1F.svg", Buffer.from(`<svg ${PLAN_MARK}><rect fill="url(#hatch)"/></svg>`), null],
      ["research/oregon/compare/1F.svg", Buffer.from(`<svg ${PLAN_MARK}><image href="x.jpg"/></svg>`), /embeds/],
      ["research/oregon/compare/1F.svg", Buffer.from(`<svg ${PLAN_MARK}><rect style="fill: url(https://example.com/b.jpg)"/></svg>`), /embeds/],
      ["research/oregon/compare/1F.svg", Buffer.from("<svg><rect/></svg>"), /without/],
      ["research/oregon/refs/ulo/kitchen.png", png, /image file/],
      ["game/shared/src/sim.ts", Buffer.from("export const x = 1; // BM text and %PDF in prose are fine, and a path like /9" + "j/ too"), null],
      ["package-lock.json", Buffer.from(`{"integrity": "sha512-${"A".repeat(86)}=="}`), null], // a checksum is short of a picture
      ["data/maps/oregon/level.json", Buffer.from('{"id": "oregon", "solids": []}'), null],
    ];
    for (const [path, b, want] of cases) {
      const got = imageProblem(path, b, false);
      if (want) expect(got, path).toMatch(want);
      else expect(got, path).toBeNull();
    }
    expect(imageProblem("research/oregon/refs/ulo/kitchen.png", png, true)).toBeNull();
  });

  it("reads Ulo's folder rule from the staged .gitignore, and Git LFS pointers by their stored content", () => {
    expect(uloFolderOpen("node_modules/\nresearch/oregon/refs/ulo/*\n!research/oregon/refs/ulo/README.md\n")).toBe(false);
    expect(uloFolderOpen("node_modules/\n")).toBe(true);
    const pointer = Buffer.from(`${LFS_POINTER}\noid sha256:${"ab".repeat(32)}\nsize 1256\n`);
    expect(contentOf(pointer, "/nonexistent")).toBeNull();
    expect(contentOf(Buffer.from("plain text"), "/nonexistent")?.toString()).toBe("plain text");
  });
});
