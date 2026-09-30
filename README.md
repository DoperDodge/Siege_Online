# Project REDMOND

A private, non-commercial fan project: a multiplayer tactical-breach shooter modeled on
Rainbow Six Siege, played on a full recreation of **Oregon**. It runs **in the web browser**
(TypeScript + Three.js), with the game server hosted on **Railway**.

- **The plan:** [`PLAN.md`](PLAN.md) — the source of truth for scope and phases.
- **Where we are and how to test it:** [`PROGRESS.md`](PROGRESS.md)
- **Why things are the way they are:** [`DECISIONS.md`](DECISIONS.md)
- **Research (Phase 0):** start with [`research/SUMMARY.md`](research/SUMMARY.md), then
  [`research/OPEN_QUESTIONS.md`](research/OPEN_QUESTIONS.md).

> **Legal/IP guardrails (PLAN.md §1.1):** no ripped, extracted, or decompiled Siege assets and no
> Ubisoft artwork in the build. All shipped art/audio is original, procedural, or properly licensed
> (logged in [`ASSET_SOURCES.md`](ASSET_SOURCES.md)). No public distribution unless Ulo decides so
> later — in which case operators, names, and the map must be replaced with originals.

## Current status

**Phase 1 — movement: built.** The Movement Lab is playable in the browser (see "Run it" below and
`PROGRESS.md` for what to test). Phase 2 (online play) is next.

## Repository layout

```
PLAN.md  PROGRESS.md  DECISIONS.md  ASSET_SOURCES.md  README.md
research/        Phase 0 output (reference only, never shipped)
data/            operators, weapons, gadgets, surfaces, modes, maps     (from Phase 1)
game/            shared/ (sim used by browser AND server), server/, client/   (from Phase 1)
tools/           blender/, mapgen/, netsim/, spike/web_stack/
builds/          gitignored build output
```

## Developer setup (Windows 11)

1. **Node.js 22.12+ (22 or 24 LTS)**: https://nodejs.org (the installer adds `node` and `npm`).
2. **Git LFS**: `git lfs install` once (binary assets such as `.glb`, `.png`, `.wav` are LFS-tracked).
3. A current **Chrome or Edge**.

### Run it
```
npm install
npm run build
npm start
```
Open http://localhost:8080 and pick **Movement Lab**. For development, `npm run dev` gives hot reload at
http://localhost:5173. Checks: `npm run typecheck`, `npm test` (unit), and `npm run test:e2e` (headless
browser; run `npm run e2e:setup` once to download Chromium, and `npm run build` first). `npm run check` runs
all of them. The older multiplayer tech spike lives in `tools/spike/web_stack/`.

## Playing with friends

Once the game is deployed (Phase 2), everyone just opens the game's **Railway URL** in a browser,
one person creates a lobby, and the others join with the **room code**. No installs, no port
forwarding, no VPN. For offline practice and solo Bot Training, the server runs inside your browser tab.

## Manual asset steps (from Phase 10)

Mixamo characters/animations must be downloaded by hand (an AI can't log in to Mixamo). Exact file
names and settings will be listed here when the art pass starts.
