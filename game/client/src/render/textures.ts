// The art pass's texture sets (Phase 10, render/DESIGN.md §2) as three texture arrays — colour (sRGB), normal and ORM
// (ambient occlusion, roughness, metalness) — a layer per set, in the manifest's order, so one material can draw any
// set (levelMaterial.ts picks the layer per pixel). The sets are WebP files under /art/textures/ (tools/art/textures.mjs
// writes them), decoded and scaled in a worker.
import * as THREE from "three";

export interface TextureSetInfo {
  id: string;
  /** The texture's real size, metres (its width and height on a surface at scale 1). */
  sizeM: [number, number];
  files: { color: string; normal: string; orm: string };
  bytes: number;
}

export interface TextureManifest {
  resolution: number;
  sets: TextureSetInfo[];
}

export interface TextureSets {
  color: THREE.DataArrayTexture;
  normal: THREE.DataArrayTexture;
  orm: THREE.DataArrayTexture;
  /** Each set's layer, by id. */
  layer: ReadonlyMap<string, number>;
  /** Each set's real size in metres, by id. */
  sizeM: ReadonlyMap<string, readonly [number, number]>;
  /** The layers' size in pixels. */
  size: number;
  /** GPU memory the three arrays take, mipmaps included (bytes). */
  gpuBytes: number;
}

const BASE = "/art/textures/";

export async function loadManifest(base = BASE): Promise<TextureManifest> {
  const r = await fetch(`${base}manifest.json`);
  if (!r.ok) throw new Error(`texture manifest: HTTP ${r.status}`);
  return (await r.json()) as TextureManifest;
}

let worker: Worker | null = null;
let jobs = 0;

/** One map of every set, decoded at `size` and stacked (a worker job). */
function decode(urls: string[], size: number): Promise<Uint8Array> {
  worker ??= new Worker(new URL("./textures.worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  const id = ++jobs;
  return new Promise((resolve, reject) => {
    const on = (e: MessageEvent<{ id: number; data?: Uint8Array; error?: string }>) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", on);
      if (e.data.data) resolve(e.data.data);
      else reject(new Error(e.data.error ?? "texture decode failed"));
    };
    w.addEventListener("message", on);
    w.postMessage({ id, urls, size });
  });
}

function arrayTexture(data: Uint8Array, size: number, layers: number, srgb: boolean): THREE.DataArrayTexture {
  const t = new THREE.DataArrayTexture(data, size, size, layers);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Every set in the manifest at `size` pixels (the preset's: 1024, or 512 on Low). */
export async function loadTextureSets(size: number, base = BASE): Promise<TextureSets> {
  const manifest = await loadManifest(base);
  const urls = (map: keyof TextureSetInfo["files"]) => manifest.sets.map((s) => `${base}${s.files[map]}`);
  // One map at a time: each array is the biggest buffer in flight.
  const color = await decode(urls("color"), size);
  const normal = await decode(urls("normal"), size);
  const orm = await decode(urls("orm"), size);
  const n = manifest.sets.length;
  return {
    color: arrayTexture(color, size, n, true),
    normal: arrayTexture(normal, size, n, false),
    orm: arrayTexture(orm, size, n, false),
    layer: new Map(manifest.sets.map((s, i) => [s.id, i])),
    sizeM: new Map(manifest.sets.map((s) => [s.id, s.sizeM])),
    size,
    gpuBytes: Math.round((3 * n * size * size * 4 * 4) / 3),
  };
}
