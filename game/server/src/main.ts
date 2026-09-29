// Game server entry point. Phase 1: serves the built browser client and a health check, which is all a
// Railway service needs (PLAN §3). Phase 2 adds the WebSocket match rooms on the same port.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 8080);
const CLIENT_DIR = process.env.CLIENT_DIR ?? fileURLToPath(new URL("../../client/dist/", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".glb": "model/gltf-binary",
  ".ktx2": "image/ktx2",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  if (rel.startsWith("..")) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(join(CLIENT_DIR, rel));
    const hashed = rel.startsWith("assets/"); // Vite fingerprints these, so they can be cached forever
    res
      .writeHead(200, {
        "content-type": MIME[extname(rel)] ?? "application/octet-stream",
        "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
      })
      .end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
});

server.listen(PORT, () => console.log(`[redmond] serving ${CLIENT_DIR} on :${PORT}`));
