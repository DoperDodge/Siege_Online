// Browser client: Three.js rendering + client-side prediction and server reconciliation using the
// same shared simulation as the server. WASD to move, mouse drag to turn. ?auto=1 drives a scripted walk.
import * as THREE from "three";
import { autoInput, buildWorld, initPhysics, quantizeInput, spawnPlayer, stepPlayer, DT, type InputCmd, type PlayerState } from "../shared/sim.js";
import { decodeSnapshot, decodeWelcome, encodeInput, MSG_SNAPSHOT, MSG_WELCOME } from "../shared/protocol.js";

interface SpikeReport {
  connected: boolean;
  playerId: number;
  snapshots: number;
  inputsSent: number;
  reconciliations: number;
  maxPredictionError: number;
  frames: number;
  webglRenderer: string;
  remotePlayersSeen: number;
  distanceMoved: number;
}
const report: SpikeReport = {
  connected: false,
  playerId: 0,
  snapshots: 0,
  inputsSent: 0,
  reconciliations: 0,
  maxPredictionError: 0,
  frames: 0,
  webglRenderer: "",
  remotePlayersSeen: 0,
  distanceMoved: 0,
};
(window as unknown as { __spike: SpikeReport }).__spike = report;

const auto = new URLSearchParams(location.search).has("auto");
const hud = document.getElementById("hud")!;

// ---- rendering ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
const dbg = gl.getExtension("WEBGL_debug_renderer_info");
report.webglRenderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fa6b8);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 200);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(5, 10, 3);
scene.add(sun);
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, rotX = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
  m.position.set(x, y, z);
  m.rotation.x = rotX;
  scene.add(m);
};
// Mirrors buildWorld() in shared/sim.ts (the real game generates both from layout data).
box(40, 1, 40, 0, -0.5, 0, 0x5b6b4a);
box(2, 1, 2, 4, 0.5, 0, 0x9a7b4f);
box(2, 0.3, 2, -4, 0.15, 2, 0xb0a070);
box(4, 0.2, 3, 0, 0.5, -5, 0x777777, (15 * Math.PI) / 180);
box(0.2, 3, 12, -8, 1.5, 0, 0xc9c1a8);
const playerMesh = (color: number) => {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2, 4, 12), new THREE.MeshStandardMaterial({ color }));
  scene.add(m);
  return m;
};
const me = playerMesh(0x3b82f6);
const remotes = new Map<number, THREE.Mesh>();
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---- input ----
const keys = new Set<string>();
addEventListener("keydown", (e) => keys.add(e.code));
addEventListener("keyup", (e) => keys.delete(e.code));
let yaw = 0;
addEventListener("mousemove", (e) => {
  if (e.buttons) yaw -= e.movementX * 0.005;
});
function readInput(seq: number): InputCmd {
  if (auto) return autoInput(seq);
  const mx = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const mz = (keys.has("KeyS") ? 1 : 0) - (keys.has("KeyW") ? 1 : 0);
  return quantizeInput(seq, mx, mz, yaw);
}

// ---- simulation + netcode ----
const R = await initPhysics();
const { world, controller } = buildWorld(R);
let local: ReturnType<typeof spawnPlayer> | null = null;
const spawn = { x: 0, z: 0 };
let seq = 0;
const pending: { input: InputCmd; state: PlayerState }[] = []; // unacknowledged inputs + predicted results

const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
ws.binaryType = "arraybuffer";
ws.onmessage = (ev) => {
  const v = new DataView(ev.data as ArrayBuffer);
  const type = v.getUint8(0);
  if (type === MSG_WELCOME) {
    const w = decodeWelcome(v);
    report.connected = true;
    report.playerId = w.playerId;
    local = spawnPlayer(R, world, w.spawnX, w.spawnZ);
    spawn.x = w.spawnX;
    spawn.z = w.spawnZ;
  } else if (type === MSG_SNAPSHOT && local) {
    const snap = decodeSnapshot(v);
    report.snapshots++;
    for (const p of snap.players) {
      if (p.id === report.playerId) {
        reconcile(snap.ackSeq, p);
        continue;
      }
      let mesh = remotes.get(p.id);
      if (!mesh) {
        mesh = playerMesh(0xef4444);
        remotes.set(p.id, mesh);
        report.remotePlayersSeen = remotes.size;
      }
      mesh.position.set(p.x, p.y, p.z); // real game interpolates ~100 ms behind (PLAN §5)
    }
  }
};

function reconcile(ackSeq: number, server: PlayerState) {
  if (!local) return;
  while (pending.length && pending[0].input.seq < ackSeq) pending.shift();
  const acked = pending.length && pending[0].input.seq === ackSeq ? pending.shift()! : null;
  if (!acked) return;
  const err = Math.hypot(acked.state.x - server.x, acked.state.y - server.y, acked.state.z - server.z);
  report.maxPredictionError = Math.max(report.maxPredictionError, err);
  if (err > 1e-5) {
    // Mispredicted: snap to the server's state and replay everything the server hasn't seen yet.
    report.reconciliations++;
    let s: PlayerState = { ...server };
    for (const p of pending) {
      s = stepPlayer(controller, local.collider, s, p.input);
      p.state = s;
    }
    local.state = s;
  }
}

let acc = 0;
let last = performance.now();
function frame(now: number) {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (local && ws.readyState === WebSocket.OPEN && acc >= DT) {
    acc -= DT;
    const input = readInput(++seq);
    local.state = stepPlayer(controller, local.collider, local.state, input);
    pending.push({ input, state: local.state });
    ws.send(encodeInput(input));
    report.inputsSent++;
  }
  if (local) {
    const s = local.state;
    report.distanceMoved = Math.max(report.distanceMoved, Math.hypot(s.x - spawn.x, s.z - spawn.z));
    me.position.set(s.x, s.y, s.z);
    camera.position.set(s.x - 4 * Math.sin(yaw), s.y + 3, s.z + 6);
    camera.lookAt(s.x, s.y, s.z);
  }
  renderer.render(scene, camera);
  report.frames++;
  hud.textContent =
    `REDMOND web spike ${report.connected ? `— player ${report.playerId}` : "— connecting…"}\n` +
    `inputs ${report.inputsSent}  snapshots ${report.snapshots}  remote players ${remotes.size}\n` +
    `max prediction error ${report.maxPredictionError.toExponential(2)} m  reconciliations ${report.reconciliations}\n` +
    `GPU: ${report.webglRenderer}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
