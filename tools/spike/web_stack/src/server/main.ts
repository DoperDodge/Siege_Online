// Authoritative game server: one HTTP port serves the built client, /ws carries the game,
// /health and /stats support tests. This is the shape a Railway service runs ($PORT).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { buildWorld, initPhysics, spawnPlayer, stepPlayer, DT, TICK_HZ, type Collider, type InputCmd, type PlayerState } from "../shared/sim.js";
import { decodeInput, encodeSnapshot, encodeWelcome, MSG_INPUT } from "../shared/protocol.js";

const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = fileURLToPath(new URL("../dist/", import.meta.url));
const MAX_INPUTS_PER_TICK = 8; // lets a client catch up after a hitch without unbounded speed-hacks

interface Client {
  id: number;
  ws: WebSocket;
  collider: Collider;
  state: PlayerState;
  queue: InputCmd[];
  lastSeq: number;
}

const R = await initPhysics();
const { world, controller } = buildWorld(R);
const clients = new Map<number, Client>();
let nextId = 1;
let tick = 0;

// ---- tick timing stats (server budget in PLAN §18: ≤ 5 ms per tick at 10 players) ----
const tickMs: number[] = [];
const intervalMs: number[] = [];
let lastTickStart = 0;
const pct = (a: number[], p: number) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

function simulateTick() {
  const t0 = performance.now();
  if (lastTickStart) intervalMs.push(t0 - lastTickStart);
  lastTickStart = t0;
  tick++;

  for (const c of clients.values()) {
    for (let i = 0; i < MAX_INPUTS_PER_TICK && c.queue.length; i++) {
      const input = c.queue.shift()!;
      if (input.seq <= c.lastSeq) continue; // duplicate / out of order
      c.state = stepPlayer(controller, c.collider, c.state, input);
      c.lastSeq = input.seq;
    }
  }
  const players = [...clients.values()].map((c) => ({ id: c.id, ...c.state }));
  for (const c of clients.values()) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(encodeSnapshot({ tick, ackSeq: c.lastSeq, players }));
  }
  tickMs.push(performance.now() - t0);
  if (tickMs.length > 20000) tickMs.splice(0, 10000), intervalMs.splice(0, 10000);
}

// Fixed-rate loop with drift correction (setTimeout alone drifts).
const periodMs = 1000 * DT;
let nextAt = performance.now();
function loop() {
  const now = performance.now();
  while (now >= nextAt) {
    simulateTick();
    nextAt += periodMs;
  }
  setTimeout(loop, Math.max(0, nextAt - performance.now() - 1));
}
loop();

// ---- HTTP: static client + health/stats ----
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") return void res.end("ok");
  if (url.pathname === "/stats") {
    if (url.searchParams.has("reset")) (tickMs.length = 0), (intervalMs.length = 0);
    res.setHeader("content-type", "application/json");
    return void res.end(
      JSON.stringify({
        tick,
        clients: clients.size,
        tickMs: { avg: tickMs.reduce((a, b) => a + b, 0) / (tickMs.length || 1), p99: pct(tickMs, 99), max: Math.max(0, ...tickMs) },
        intervalMs: { target: periodMs, p50: pct(intervalMs, 50), p99: pct(intervalMs, 99), max: Math.max(0, ...intervalMs) },
      }),
    );
  }
  const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^([/\\])+/, "");
  if (rel.startsWith("..")) return void res.writeHead(403).end();
  try {
    const body = await readFile(join(STATIC_DIR, rel));
    res.writeHead(200, { "content-type": MIME[extname(rel)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

const wss = new WebSocketServer({ noServer: true });
http.on("upgrade", (req, socket, head) => {
  if (new URL(req.url ?? "/", "http://x").pathname !== "/ws") return void socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => onConnect(ws));
});

function onConnect(ws: WebSocket) {
  const id = nextId++;
  const spawnX = ((id % 5) - 2) * 1.5;
  const spawnZ = 6; // open ground; a capsule spawned inside geometry gets stuck (spawns must be validated)
  const { collider, state } = spawnPlayer(R, world, spawnX, spawnZ);
  const client: Client = { id, ws, collider, state, queue: [], lastSeq: 0 };
  clients.set(id, client);
  ws.binaryType = "arraybuffer";
  ws.send(encodeWelcome(id, spawnX, spawnZ, TICK_HZ));
  ws.on("message", (data: ArrayBuffer) => {
    const v = new DataView(data);
    if (v.byteLength >= 11 && v.getUint8(0) === MSG_INPUT) client.queue.push(decodeInput(v));
  });
  ws.on("close", () => {
    world.removeCollider(collider, false);
    clients.delete(id);
  });
}

http.listen(PORT, () => console.log(`[spike-server] listening on :${PORT} (tick ${TICK_HZ} Hz)`));
