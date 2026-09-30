// Game server entry point. Phase 1: serves the built browser client and a health check, which is all a
// Railway service needs (PLAN §3). Phase 2 adds the WebSocket match rooms on the same port.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path, { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveStaticPath } from "./paths.js";

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

function send(res: ServerResponse, status: number, body: string) {
  if (!res.headersSent) res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  let pathname: string;
  try {
    // A malformed URL or percent-encoding (e.g. "/%") is the client's fault: answer 400, never crash.
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    return send(res, 400, "bad request");
  }
  if (pathname === "/health") return send(res, 200, "ok");

  const target = resolveStaticPath(pathname, CLIENT_DIR, path);
  if ("status" in target) return send(res, target.status, target.status === 400 ? "bad request" : "forbidden");

  let body: Buffer;
  try {
    body = await readFile(target.file);
  } catch {
    return send(res, 404, "not found");
  }
  const hashed = target.rel.startsWith("assets/"); // Vite fingerprints these, so they can be cached forever
  res.writeHead(200, {
    "content-type": MIME[extname(target.rel)] ?? "application/octet-stream",
    "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
  });
  res.end(body);
}

const server = createServer((req, res) => {
  handle(req, res).catch((e: unknown) => {
    console.error("[redmond] request failed:", e);
    send(res, 500, "internal error");
  });
});

server.listen(PORT, () => console.log(`[redmond] serving ${CLIENT_DIR} on :${PORT}`));
