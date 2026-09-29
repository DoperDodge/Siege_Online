# Web tech-stack spike (PLAN.md §3)

A throwaway project that proves the **browser stack** before Phase 1 (DECISIONS D-020). It is **not**
game code. One Node process serves the built client and runs a 64 Hz authoritative server over WebSockets;
the browser renders with Three.js and predicts its own movement with the **same** TypeScript + Rapier code
the server runs, then reconciles against server snapshots.

| Piece | Choice |
|---|---|
| Language | TypeScript (client + server share `src/shared/`) |
| Rendering | Three.js (WebGL2) |
| Physics / collision | Rapier 3D, **deterministic** build (`@dimforge/rapier3d-deterministic-compat`) |
| Networking | WebSockets (`ws` on the server), binary messages |
| Build | Vite (client), esbuild (server) |
| Hosting target | Railway: one service, `npm run build` then `npm start`, listens on `$PORT` |

## Run it locally
Needs Node 22+.
```
npm install
npm run build
npm start            # then open http://localhost:8080  (WASD + drag mouse; add ?auto=1 for a scripted walk)
```
Open a second browser tab to see another player.

## Automated test (what the cloud session ran)
```
npm run typecheck
npm run build
npm test             # headless Chromium + 9 WebSocket bots → prints [spike] RESULT: PASS
```
The test checks WebGL rendering, streaming, seeing 9 other players, movement, **bit-exact client
prediction** (browser and Node produce identical positions), server tick p99 < 5 ms with 10 players, and
tick-interval stability. Results are recorded in `DECISIONS.md` (D-020).
