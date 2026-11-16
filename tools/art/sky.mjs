// The art pass's sky (render/DESIGN.md §6.1): one CC0 HDRI from Poly Haven (data/presentation/textures.json `sky`)
// becomes
// - `sky.background.webp`: the sky above the horizon (and a little below) at 4096 px around, linear light divided by
//   `scale` and sRGB-encoded in 8 bits; the page multiplies it back and tone-maps it with the rest of the frame;
// - `sky.env.bin`: the whole sphere at 128 × 64, float32 RGBA little-endian, rows from straight up to straight down, the
//   sun's own pixels cut down to the bright sky round it (the sun is a light of its own on the page, so it isn't
//   counted twice): the light the environment map and the probe bake (§6.3) take from the sky;
// - the sun's direction and colour, measured from the HDRI's brightest pixels, the sky turned so the sun stands where
//   the greybox's sun did (gameplay shadows fall the same way); the horizon's colour for the haze.
// Both files are a column per direction around: u = atan(z, x) / 2π + 0.5 (three's equirect u), v down from the zenith.
// They're added to the texture manifest's `sky` entry (CC0, listed in ASSET_SOURCES.md like the texture sets).
//
//   npm run art:sky            (after npm --prefix tools/art install)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LIST = JSON.parse(readFileSync(join(ROOT, "data/presentation/textures.json"), "utf8"));
const OUT = join(ROOT, "game/client/public/art/textures");
const CACHE = join(ROOT, "builds/art-cache");
const ASSET = LIST.sky.asset;
/** The greybox's sun (labScene.ts SUN): the way the sky is turned so its sun stands at this bearing. */
const GREYBOX_SUN = [18, 30, 12];
/** Rows of the background below the horizon (degrees). */
const BELOW_DEG = 6;
const BG_WIDTH = 4096;
const ENV = [128, 64];

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
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

/** A Radiance .hdr (RGBE, flat or new-style RLE scanlines) as linear float RGB, rows from the top. */
function decodeHdr(buf) {
  let at = 0;
  const line = () => {
    const nl = buf.indexOf(0x0a, at);
    const s = buf.toString("latin1", at, nl);
    at = nl + 1;
    return s;
  };
  if (!line().startsWith("#?")) throw new Error("not a Radiance file");
  for (let l = line(); l !== ""; l = line()) if (l.startsWith("FORMAT") && !l.includes("32-bit_rle_rgbe")) throw new Error(`unsupported ${l}`);
  const m = /^-Y (\d+) \+X (\d+)$/.exec(line());
  if (!m) throw new Error("unsupported orientation");
  const [h, w] = [Number(m[1]), Number(m[2])];
  const rgbe = new Uint8Array(w * h * 4);
  const scan = new Uint8Array(w * 4);
  for (let y = 0; y < h; y++) {
    if (w >= 8 && w < 0x8000 && buf[at] === 2 && buf[at + 1] === 2 && ((buf[at + 2] << 8) | buf[at + 3]) === w) {
      at += 4;
      for (let c = 0; c < 4; c++) {
        for (let x = 0; x < w; ) {
          let n = buf[at++];
          if (n > 128) {
            n -= 128;
            const v = buf[at++];
            for (let k = 0; k < n; k++) scan[(x++) * 4 + c] = v;
          } else for (let k = 0; k < n; k++) scan[(x++) * 4 + c] = buf[at++];
        }
      }
      rgbe.set(scan, y * w * 4);
    } else {
      rgbe.set(buf.subarray(at, at + w * 4), y * w * 4);
      at += w * 4;
    }
  }
  const out = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const e = rgbe[i * 4 + 3];
    const f = e ? Math.pow(2, e - 136) : 0;
    out[i * 3] = rgbe[i * 4] * f;
    out[i * 3 + 1] = rgbe[i * 4 + 1] * f;
    out[i * 3 + 2] = rgbe[i * 4 + 2] * f;
  }
  return { w, h, rgb: out };
}

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** The direction (toward it) of pixel (u, v) in 0..1, v down from the zenith. */
function dirOf(u, v) {
  const phi = (u - 0.5) * 2 * Math.PI;
  const el = (0.5 - v) * Math.PI;
  return [Math.cos(el) * Math.cos(phi), Math.sin(el), Math.cos(el) * Math.sin(phi)];
}

const [info, files] = await Promise.all([json(`https://api.polyhaven.com/info/${ASSET}`), json(`https://api.polyhaven.com/files/${ASSET}`)]);
const get = async (res) => {
  const f = files.hdri[res].hdr;
  return decodeHdr(await file(f.url, `polyhaven/${ASSET}/${f.url.split("/").pop()}`, f.md5));
};
const big = await get("4k");
const small = await get("1k");

// The sun: the centroid of the 1k map's pixels over half the brightest's luminance, near it.
let best = 0;
for (let i = 1; i < small.w * small.h; i++) if (lum(...small.rgb.subarray(i * 3, i * 3 + 3)) > lum(...small.rgb.subarray(best * 3, best * 3 + 3))) best = i;
const peak = lum(...small.rgb.subarray(best * 3, best * 3 + 3));
let [su, sv, sw, sr, sg, sb] = [0, 0, 0, 0, 0, 0];
const [bx, by] = [best % small.w, Math.floor(best / small.w)];
for (let y = Math.max(0, by - 20); y < Math.min(small.h, by + 20); y++)
  for (let x = bx - 20; x < bx + 20; x++) {
    const xx = (x + small.w) % small.w;
    const i = y * small.w + xx;
    const l = lum(...small.rgb.subarray(i * 3, i * 3 + 3));
    if (l < peak * 0.5) continue;
    su += (x + 0.5) * l;
    sv += (y + 0.5) * l;
    sw += l;
    sr += small.rgb[i * 3];
    sg += small.rgb[i * 3 + 1];
    sb += small.rgb[i * 3 + 2];
  }
const sunU = su / sw / small.w;
const sunV = sv / sw / small.h;
// Turn the sky so the sun's bearing is the greybox sun's.
const want = Math.atan2(GREYBOX_SUN[2], GREYBOX_SUN[0]) / (2 * Math.PI) + 0.5;
const shift = want - sunU; // added to every u
const sunDir = dirOf(sunU + shift, sunV);
const sunMax = Math.max(sr, sg, sb);
const sunColor = [sr / sunMax, sg / sunMax, sb / sunMax];

/** The map turned by `shift` (whole columns), as a function from (x, y) to RGB. */
const turned = (img) => {
  const off = Math.round(shift * img.w);
  return (x, y) => {
    const xx = (((x - off) % img.w) + img.w) % img.w;
    const i = (y * img.w + xx) * 3;
    return [img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]];
  };
};

// The sky's brightness without the sun: the 99.5th percentile of the 1k map's upper half, the sun's window left out.
const skyL = [];
for (let y = 0; y < small.h / 2; y++)
  for (let x = 0; x < small.w; x++) {
    if (Math.abs(y - by) < 24 && Math.min(Math.abs(x - bx), small.w - Math.abs(x - bx)) < 24) continue;
    const i = (y * small.w + x) * 3;
    skyL.push(lum(small.rgb[i], small.rgb[i + 1], small.rgb[i + 2]));
  }
skyL.sort((a, b) => a - b);
const skyHigh = skyL[Math.floor(skyL.length * 0.995)];

// Background: linear / scale, sRGB-encoded (dithered), above the horizon and BELOW_DEG under it.
const scale = skyHigh * 1.25;
const bgH = Math.round((BG_WIDTH / 2) * (90 + BELOW_DEG) / 180);
const bg = Buffer.alloc(BG_WIDTH * bgH * 3);
const srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
{
  const at = turned(big);
  const sx = big.w / BG_WIDTH;
  for (let y = 0; y < bgH; y++)
    for (let x = 0; x < BG_WIDTH; x++) {
      // A box filter over the source pixels this one covers (4k to 4k: one).
      const c = at(Math.floor(x * sx), Math.floor(y * sx));
      for (let k = 0; k < 3; k++) {
        const v = srgb(Math.min(1, c[k] / scale)) * 255 + (Math.random() - 0.5);
        bg[(y * BG_WIDTH + x) * 3 + k] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
}
const bgFile = "sky.background.webp";
const bgOut = await sharp(bg, { raw: { width: BG_WIDTH, height: bgH, channels: 3 } }).webp({ quality: 86, effort: 6 }).toBuffer();
writeFileSync(join(OUT, bgFile), bgOut);

// The sun's irradiance (linear rgb, at normal incidence): what cutting it down to the sky's high values takes out of the
// 1k map, each pixel weighted by its solid angle.
const sunIrr = [0, 0, 0];
{
  const cap = skyHigh * 2;
  for (let y = 0; y < small.h; y++) {
    const dOmega = ((2 * Math.PI) / small.w) * (Math.PI / small.h) * Math.cos((0.5 - (y + 0.5) / small.h) * Math.PI);
    for (let x = 0; x < small.w; x++) {
      const i = (y * small.w + x) * 3;
      const l = lum(small.rgb[i], small.rgb[i + 1], small.rgb[i + 2]);
      if (l <= cap) continue;
      const cut = 1 - cap / l;
      for (let k = 0; k < 3; k++) sunIrr[k] += small.rgb[i + k] * cut * dOmega;
    }
  }
}

// Environment: 128 × 64 box-filtered from the 1k map, the sun cut down to the sky's high values.
const env = new Float32Array(ENV[0] * ENV[1] * 4);
{
  const at = turned(small);
  const bxs = small.w / ENV[0];
  const bys = small.h / ENV[1];
  const cap = skyHigh * 2;
  for (let y = 0; y < ENV[1]; y++)
    for (let x = 0; x < ENV[0]; x++) {
      const acc = [0, 0, 0];
      for (let j = 0; j < bys; j++)
        for (let i = 0; i < bxs; i++) {
          const c = at(x * bxs + i, y * bys + j);
          const l = lum(...c);
          const k = l > cap ? cap / l : 1;
          acc[0] += c[0] * k;
          acc[1] += c[1] * k;
          acc[2] += c[2] * k;
        }
      const o = (y * ENV[0] + x) * 4;
      env[o] = acc[0] / (bxs * bys);
      env[o + 1] = acc[1] / (bxs * bys);
      env[o + 2] = acc[2] / (bxs * bys);
      env[o + 3] = 1;
    }
}
const envFile = "sky.env.bin";
writeFileSync(join(OUT, envFile), Buffer.from(env.buffer));

// The horizon's colour: the background's mean a degree to three over the horizon (linear).
const hz = [0, 0, 0];
{
  const at = turned(small);
  let n = 0;
  for (let y = Math.round(small.h * (90 - 3) / 180); y < Math.round(small.h * (90 - 1) / 180); y++)
    for (let x = 0; x < small.w; x++) {
      const c = at(x, y);
      hz[0] += c[0];
      hz[1] += c[1];
      hz[2] += c[2];
      n++;
    }
  for (let k = 0; k < 3; k++) hz[k] /= n;
}

const manifestPath = join(OUT, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
manifest.sky = {
  id: "sky",
  source: "polyhaven",
  asset: ASSET,
  page: `https://polyhaven.com/a/${ASSET}`,
  author: Object.keys(info.authors ?? {}).join(", "),
  license: "CC0 1.0",
  files: { background: bgFile, env: envFile },
  background: { width: BG_WIDTH, height: bgH, belowDeg: BELOW_DEG, scale: round(scale, 5) },
  env: { width: ENV[0], height: ENV[1] },
  sun: { dir: sunDir.map((v) => round(v)), color: sunColor.map((v) => round(v)), irradiance: sunIrr.map((v) => round(v, 3)) },
  horizon: hz.map((v) => round(v, 5)),
  bytes: bgOut.length + env.byteLength,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`sun irradiance ${sunIrr.map((v) => v.toFixed(2)).join(", ")}, sky high ${skyHigh.toFixed(3)}, horizon ${hz.map((v) => v.toFixed(3)).join(", ")}`);
console.log(`sky ${ASSET}: sun ${sunDir.map((v) => v.toFixed(3)).join(", ")} (elevation ${((Math.asin(sunDir[1]) * 180) / Math.PI).toFixed(1)}°), background ${(bgOut.length / 1024).toFixed(0)} KB, env ${(env.byteLength / 1024).toFixed(0)} KB`);
