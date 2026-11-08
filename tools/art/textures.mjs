// Fetch and pack the art pass's CC0 texture sets (render/DESIGN.md §2, data/presentation/textures.json).
//
//   npm --prefix tools/art install     (once: sharp and fflate)
//   npm run art:textures [-- id id …] [-- --force]
//
// For each set: the source's 1k maps (Poly Haven's API, or ambientCG's 1K-JPG zip), cached in builds/art-cache/, are
// packed into three square WebP maps at the list's resolution — `<id>.color.webp` (sRGB), `<id>.normal.webp`
// (OpenGL: green up) and `<id>.orm.webp` (R ambient occlusion, G roughness, B metalness, as glTF packs them) — in
// game/client/public/art/textures/, with manifest.json: each set's real size in metres (the source's), its mean colour
// (linear: the probe bake's albedo), its source and author, and the bytes written. The manifest's other entries (the
// sky: tools/art/sky.mjs) are kept. Downloads are checked against the md5 Poly Haven lists. The outputs are
// committed (plain git, not LFS: .gitattributes); the cache isn't.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LIST = JSON.parse(readFileSync(join(ROOT, "data/presentation/textures.json"), "utf8"));
const OUT = join(ROOT, "game/client/public/art/textures");
const CACHE = join(ROOT, "builds/art-cache");
const RES = LIST.resolution;
/** WebP quality per map: colour and ORM lossy; normals a little higher (block noise bends the light). */
const QUALITY = { color: 82, normal: 90, orm: 80 };

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = new Set(args.filter((a) => !a.startsWith("--")));
mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

const manifestPath = join(OUT, "manifest.json");
const old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { sets: [] };
const kept = new Map(old.sets.map((s) => [s.id, s]));

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

/** The file at `url`, from the cache or downloaded into it (checked against `md5` when given). */
async function file(url, name, md5) {
  const path = join(CACHE, name);
  if (existsSync(path) && statSync(path).size > 0) return readFileSync(path);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (md5 && createHash("md5").update(buf).digest("hex") !== md5) throw new Error(`${url}: md5 mismatch`);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, buf);
  return buf;
}

/** A Poly Haven texture's maps at 1k (its colour map by `variant` when it has several), its size in metres and its authors. */
async function polyhaven(asset, variant) {
  const [info, files] = await Promise.all([json(`https://api.polyhaven.com/info/${asset}`), json(`https://api.polyhaven.com/files/${asset}`)]);
  const get = async (key) => {
    const f = files[key]?.["1k"]?.jpg;
    return f ? file(f.url, `polyhaven/${asset}/${f.url.split("/").pop()}`, f.md5) : null;
  };
  const [color, normal, arm, rough, ao] = await Promise.all([get(variant ?? "Diffuse"), get("nor_gl"), get("arm"), get("Rough"), get("AO")]);
  if (!color || !normal) throw new Error(`${asset}: no 1k colour or normal map`);
  const [w, h] = info.dimensions ?? [2000, 2000];
  return {
    color,
    normal,
    arm,
    rough,
    ao,
    metal: null,
    sizeM: [w / 1000, h / 1000],
    author: Object.keys(info.authors ?? {}).join(", "),
    page: `https://polyhaven.com/a/${asset}`,
  };
}

/** An ambientCG material's maps from its 1K-JPG zip, its size in metres. */
async function ambientcg(asset) {
  const d = await json(`https://ambientcg.com/api/v2/full_json?id=${asset}&include=downloadData,dimensionsData`);
  const a = d.foundAssets?.[0];
  if (!a) throw new Error(`${asset}: not on ambientCG`);
  const zipDl = a.downloadFolders.default.downloadFiletypeCategories.zip.downloads.find((x) => x.attribute === "1K-JPG");
  const zip = unzipSync(new Uint8Array(await file(zipDl.downloadLink, `ambientcg/${asset}_1K-JPG.zip`)));
  const pick = (suffix) => {
    const name = Object.keys(zip).find((n) => n.endsWith(`_${suffix}.jpg`));
    return name ? Buffer.from(zip[name]) : null;
  };
  const color = pick("Color");
  const normal = pick("NormalGL");
  if (!color || !normal) throw new Error(`${asset}: no colour or GL normal map in the zip`);
  const cm = (v) => (typeof v === "number" && v > 0 ? v / 100 : 2);
  return {
    color,
    normal,
    arm: null,
    rough: pick("Roughness"),
    ao: pick("AmbientOcclusion"),
    metal: pick("Metalness"),
    sizeM: [cm(a.dimensionX), cm(a.dimensionY)],
    author: "ambientCG (Lennart Demes)",
    page: `https://ambientcg.com/view?id=${asset}`,
  };
}

/** One channel of `img` as RES×RES raw bytes (grey), or a constant. */
async function channel(img, fill) {
  if (!img) return Buffer.alloc(RES * RES, fill);
  return sharp(img).resize(RES, RES, { fit: "fill" }).greyscale().raw().toBuffer();
}

async function orm(src) {
  if (src.arm) return sharp(src.arm).resize(RES, RES, { fit: "fill" }).removeAlpha();
  const [ao, rough, metal] = await Promise.all([channel(src.ao, 255), channel(src.rough, 200), channel(src.metal, 0)]);
  const rgb = Buffer.alloc(RES * RES * 3);
  for (let i = 0; i < RES * RES; i++) {
    rgb[i * 3] = ao[i];
    rgb[i * 3 + 1] = rough[i];
    rgb[i * 3 + 2] = metal[i];
  }
  return sharp(rgb, { raw: { width: RES, height: RES, channels: 3 } });
}

/** A colour map's mean colour, linear (sRGB decoded per pixel). */
async function meanColor(img) {
  const { data, info } = await sharp(img).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const sum = [0, 0, 0];
  for (let i = 0; i < info.width * info.height; i++) for (let k = 0; k < 3; k++) sum[k] += lin(data[i * 3 + k] / 255);
  return sum.map((v) => Math.round((v / (info.width * info.height)) * 10000) / 10000);
}

let total = 0;
for (const set of LIST.sets) {
  const files = { color: `${set.id}.color.webp`, normal: `${set.id}.normal.webp`, orm: `${set.id}.orm.webp` };
  const prev = kept.get(set.id);
  const fresh = Object.values(files).every((f) => existsSync(join(OUT, f))) && prev?.asset === set.asset && prev?.variant === set.variant;
  // Ids named: just those. Otherwise every set not already written from its listed asset (all with --force).
  if (!(only.size ? only.has(set.id) : force || !fresh)) {
    if (prev) {
      total += prev.bytes;
      prev.mean ??= await meanColor(readFileSync(join(OUT, files.color)));
    }
    continue;
  }
  const src = set.source === "polyhaven" ? await polyhaven(set.asset, set.variant) : await ambientcg(set.asset);
  const write = async (img, name, q) => {
    const out = await img.webp({ quality: q, effort: 6 }).toBuffer();
    writeFileSync(join(OUT, name), out);
    return out.length;
  };
  const bytes =
    (await write(sharp(src.color).resize(RES, RES, { fit: "fill" }).removeAlpha(), files.color, QUALITY.color)) +
    (await write(sharp(src.normal).resize(RES, RES, { fit: "fill" }).removeAlpha(), files.normal, QUALITY.normal)) +
    (await write(await orm(src), files.orm, QUALITY.orm));
  total += bytes;
  kept.set(set.id, {
    id: set.id,
    sizeM: src.sizeM.map((v) => Math.round(v * 1000) / 1000),
    source: set.source,
    asset: set.asset,
    ...(set.variant ? { variant: set.variant } : {}),
    page: src.page,
    author: src.author,
    license: "CC0 1.0",
    files,
    bytes,
    mean: await meanColor(readFileSync(join(OUT, files.color))),
  });
  console.log(`${set.id.padEnd(16)} ${set.source}/${set.asset} ${src.sizeM.map((v) => v.toFixed(2)).join(" × ")} m  ${(bytes / 1024).toFixed(0)} KB`);
}

const sets = LIST.sets.map((s) => kept.get(s.id)).filter(Boolean);
const doc = "Written by tools/art/textures.mjs and tools/art/sky.mjs from data/presentation/textures.json: do not edit.";
writeFileSync(manifestPath, `${JSON.stringify({ ...old, _doc: doc, resolution: RES, sets }, null, 2)}\n`);
console.log(`${sets.length} sets, ${(total / 1048576).toFixed(1)} MB`);
