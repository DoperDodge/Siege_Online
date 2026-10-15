// npm run mapgen:refs: fetch the two reference sources into research/oregon/refs/web/ (gitignored; the repo is
// public and these are Ubisoft's and r6calls' images, research/oregon/refs/SOURCES.md): the official blueprint
// zip, unpacked, and the r6calls map with its floor rasters written out as PNGs. Nothing here is committed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

export const BLUEPRINT_URL = "https://ubistatic-a.ubisoft.com/0106/gamesites/rainbow6/blueprints/r6-maps-oregon-blueprints.zip";
export const R6CALLS_URL = "https://r6calls.com/img/maps/oregon.svg";

/** The files in a zip (stored or deflated): a central-directory reader, enough for the blueprint zip. */
export function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file (no end of central directory)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip: bad central directory entry");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) out.set(name, Buffer.from(data));
    else if (method === 8) out.set(name, inflateRawSync(data));
    else throw new Error(`zip: ${name} uses compression method ${method}`);
  }
  return out;
}

async function download(url: string, dest: string): Promise<Buffer> {
  if (existsSync(dest)) {
    console.log(`have ${dest}`);
    return readFileSync(dest);
  }
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf;
}

export async function downloadRefs(root: string) {
  const web = join(root, "research", "oregon", "refs", "web");
  const bp = join(web, "blueprint");
  const rc = join(web, "r6calls");
  mkdirSync(bp, { recursive: true });
  mkdirSync(rc, { recursive: true });
  const zip = await download(BLUEPRINT_URL, join(bp, "r6-maps-oregon-blueprints.zip"));
  for (const [name, data] of unzip(zip)) {
    const base = name.split("/").pop()!;
    if (/\.jpe?g$/i.test(base)) writeFileSync(join(bp, base), data);
  }
  const svg = (await download(R6CALLS_URL, join(rc, "oregon.svg"))).toString("utf8");
  // Each floor's raster is an <image id="N-pic"> holding a base64 PNG (built from parts: tools/mapgen/hygiene.test.ts).
  const uri = ["data", ":image/png;base64,"].join("");
  let floors = 0;
  for (const m of svg.matchAll(/<image\b[^>]*>/g)) {
    const tag = m[0];
    const id = tag.match(/\bid="(\d)-pic"/)?.[1];
    const at = tag.indexOf(uri);
    if (id === undefined || at < 0) continue;
    const b64 = tag.slice(at + uri.length).match(/^[A-Za-z0-9+/=\s]+/)?.[0] ?? "";
    writeFileSync(join(rc, `${id}-pic.png`), Buffer.from(b64.replace(/\s/g, ""), "base64"));
    floors++;
  }
  console.log(`refs ready in research/oregon/refs/web/ (blueprint JPGs, r6calls SVG, ${floors} floor rasters); never commit them`);
}
