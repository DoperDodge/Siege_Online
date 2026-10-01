// Game server entry point: serves the built browser client, a health check and server stats over HTTP,
// and the match rooms over a WebSocket at /ws, all on one port (PLAN §3, §5).
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path, { extname } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { TICK_HZ } from "@redmond/shared";
import { WebSocketServer } from "ws";
import { Close, Connection, IpGate, RoomManager } from "./lobby.js";
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
  if (pathname === "/stats") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify(stats(), null, 1));
  }

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

// ---------------------------------------------------------------- match rooms

const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS ?? 500);
// Behind Railway's edge proxy every socket comes from the proxy; the client's own address is in the
// header the proxy sets (X-Real-IP, set in .railway/railway.ts). Locally, the socket address is the client.
const CLIENT_IP_HEADER = process.env.CLIENT_IP_HEADER?.toLowerCase();
const nowMs = () => performance.now();
const rooms = new RoomManager(nowMs);
const gate = new IpGate(nowMs);
const connections = new Set<Connection>();
let shuttingDown = false;

function clientIp(req: IncomingMessage): string {
  const header = CLIENT_IP_HEADER ? req.headers[CLIENT_IP_HEADER] : undefined;
  const value = Array.isArray(header) ? header[0] : header;
  return (value?.split(",")[0].trim() || req.socket.remoteAddress || "unknown").slice(0, 64);
}

// Inputs are 24 bytes; nothing a client sends legitimately comes close to 4 KB. Compression would cost
// CPU on every snapshot for little gain on already-compact binary.
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });

server.on("upgrade", (req, socket, head) => {
  // Node hands the raw socket over without an error listener: a client resetting the connection while we
  // answer would otherwise crash the whole server.
  socket.on("error", () => {});
  let pathname = "";
  try {
    pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    // answered below
  }
  const ip = clientIp(req);
  const refuse = pathname !== "/ws" ? "404 Not Found" : shuttingDown || connections.size >= MAX_CONNECTIONS ? "503 Service Unavailable" : !gate.open(ip) ? "429 Too Many Requests" : null;
  if (refuse) {
    socket.end(`HTTP/1.1 ${refuse}\r\nconnection: close\r\n\r\n`);
    return;
  }
  let released = false;
  const release = () => {
    if (!released) gate.close(ip);
    released = true;
  };
  socket.once("close", release); // the handshake can fail before a WebSocket exists
  wss.handleUpgrade(req, socket, head, (ws) => {
    let alive = true;
    const conn = new Connection(
      {
        send: (b) => {
          if (ws.readyState === ws.OPEN) ws.send(b);
        },
        close: (code, reason) => ws.close(code, reason),
        buffered: () => ws.bufferedAmount,
      },
      rooms,
      nowMs,
      ip,
      gate,
    );
    connections.add(conn);
    ws.on("message", (data, isBinary) => {
      if (!isBinary) return ws.close(Close.Protocol, "binary only");
      const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      conn.onMessage(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    });
    ws.on("pong", () => (alive = true));
    ws.on("error", (e) => console.warn("[redmond] socket error:", e.message));
    ws.on("close", () => {
      conn.onClose();
      connections.delete(conn);
      clearInterval(heartbeat);
    });
    // A peer that vanished without closing (laptop lid, lost Wi-Fi) is noticed within 30 s.
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 15_000);
  });
});

// One fixed 64 Hz clock for every room. Timers fire late by a millisecond or so; the loop catches up
// by stepping again rather than drifting, and gives up on a long stall (GC, a starved CPU) instead of
// fast-forwarding through it.
const TICK_MS = 1000 / TICK_HZ;
const MAX_CATCH_UP = 4;
const tickTimes: number[] = [];
let lateResets = 0;
let nextTick = nowMs();

function loop() {
  if (shuttingDown) return;
  for (let n = 0; n < MAX_CATCH_UP && nowMs() >= nextTick; n++) {
    const t0 = nowMs();
    rooms.step();
    tickTimes.push(nowMs() - t0);
    if (tickTimes.length > 640) tickTimes.shift();
    nextTick += TICK_MS;
  }
  if (nowMs() - nextTick > 250) {
    nextTick = nowMs();
    lateResets++;
  }
  setTimeout(loop, Math.max(0, nextTick - nowMs()));
}

setInterval(() => {
  for (const c of connections) c.sweep();
  gate.sweep();
}, 1000).unref();

function stats() {
  const sorted = [...tickTimes].sort((a, b) => a - b);
  const ms = (v: number | undefined) => Math.round((v ?? 0) * 1000) / 1000;
  return {
    uptimeS: Math.round(process.uptime()),
    connections: connections.size,
    rooms: rooms.count,
    players: rooms.players,
    tickMs: { mean: ms(sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length)), p99: ms(sorted[Math.floor(sorted.length * 0.99)]), max: ms(sorted.at(-1)) },
    lateResets,
    totals: rooms.stats(),
    memoryMb: Math.round(process.memoryUsage().rss / 1e6),
  };
}

// Railway stops a deployment with SIGTERM: tell every client the server is restarting (close code 1012),
// then exit.
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[redmond] ${signal}: closing ${connections.size} connection(s)`);
  for (const c of connections) c.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(PORT, () => {
  console.log(`[redmond] serving ${CLIENT_DIR} on :${PORT} (WebSocket at /ws)`);
  nextTick = nowMs();
  loop();
});
