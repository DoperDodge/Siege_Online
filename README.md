# Project REDMOND

A private, non-commercial multiplayer tactical-breach shooter of our own: two teams of five, one attacking a building
and one holding it, with destructible walls and floors, drones and cameras, and twenty operators with gadgets of their
own. It began as a fan study of Rainbow Six Siege's mechanics; Project Redmond made it its own: original operators,
our own map (**Millrace**, a closed textile mill by a river), our own designs. It runs **in the web browser** (TypeScript +
Three.js), with the game server hosted on **Railway**.

- **The plan:** [`PLAN.md`](PLAN.md) — the source of truth for scope and phases.
- **Where we are and how to test it:** [`PROGRESS.md`](PROGRESS.md)
- **Why things are the way they are:** [`DECISIONS.md`](DECISIONS.md)
- **Research (Phase 0):** start with [`research/SUMMARY.md`](research/SUMMARY.md), then
  [`research/OPEN_QUESTIONS.md`](research/OPEN_QUESTIONS.md).

> **Legal/IP guardrails (PLAN.md §1.1):** no ripped, extracted, or decompiled assets of any other game and no third-party
> artwork in the build. All shipped art/audio is original, procedural, or properly licensed (logged in
> [`ASSET_SOURCES.md`](ASSET_SOURCES.md)). The operators, their names and gadgets, and the map are our own (Project
> Redmond, DECISIONS D-183 on). No public distribution unless Ulo decides so later.

## Current status

**Project Redmond — making the game its own: R1–R3 done, R4 (cleanup) in review.** The twelve original operators have
new names, looks and gadget designs (R1); the old map is gone and every match, drill and Bot Training round plays on
Millrace, our own (R2); eight new operators of our own join them (R3: Ohm, Tonic, Shunt, Latch, Bailiff, Rivet,
Dowser, Hull). The labs are still there for each part of the game, with a Rappel Lab added. `PROGRESS.md` says what to
test; Phase 11 (audio) comes after.

## Repository layout

```
PLAN.md  PROGRESS.md  DECISIONS.md  ASSET_SOURCES.md  README.md
research/        Phase 0 output (reference only, never shipped)
data/            operators, weapons, gadgets, surfaces, modes, maps     (from Phase 1)
game/            shared/ (sim used by browser AND server), server/, client/   (from Phase 1)
tools/           blender/, mapgen/, netsim/, soak/, bench/, e2e/, spike/web_stack/
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
Open http://localhost:8080 and pick **Play a match** (or a lab). For development, `npm run dev` gives hot reload at
http://localhost:5173. Checks: `npm run typecheck`, `npm test` (unit), and `npm run test:e2e` (headless
browser; run `npm run e2e:setup` once to download Chromium, and `npm run build` first). `npm run check` runs
all of them. The older multiplayer tech spike lives in `tools/spike/web_stack/`.

## Playing with friends

Once the game is deployed (Phase 2), everyone just opens the game's **Railway URL** in a browser,
one person creates a lobby, and the others join with the **room code**. No installs, no port
forwarding, no VPN. For offline practice and solo Bot Training, the server runs inside your browser tab.

## Art assets (Phase 10)

None to download by hand: the models and their animation are built in code (D-179: no Mixamo characters). The only
art files are CC0 photo textures and a CC0 sky, already committed under `game/client/public/art/` and listed in
[`ASSET_SOURCES.md`](ASSET_SOURCES.md). To fetch and pack them again: `npm --prefix tools/art install` once, then
`npm run art:textures` and `npm run art:sky`.
