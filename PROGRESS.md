# PROGRESS.md

Status per phase (PLAN.md §17). Newest phase on top. Each phase lists what's done, how to test it,
known issues, and what's next.

---

## Phase 0 — Research · ✅ complete, ⏳ waiting for your SUMMARY skim (2026-09-29)

**Done when (PLAN §17):** `research/` complete, SUMMARY.md, OPEN_QUESTIONS.md, screenshot checklist
sent → you skim it and answer the open questions you can.

### What's done
- **All research files from PLAN §2.1/§2.2**, verified against **Y11S3 incl. Y11S3.1**:
  - `research/core_mechanics.md`, `destruction.md`, `round_flow.md`, `intel.md`, `gadgets.md`
  - `research/operators/*.md` — all 12 (Lesion confirmed as "Legion")
  - `research/weapons.csv` (40 rows) + `weapons_notes.md`
  - `research/interactions.csv` (343 rows) + `interactions_notes.md`
  - `research/oregon/`: `version.md`, `layout_notes.md`, `surfaces.md`, `map_features.md`,
    `common_setups.md`, `SCREENSHOT_CHECKLIST.md`, `refs/SOURCES.md`
  - `research/SUMMARY.md` (one-page digest) and `research/OPEN_QUESTIONS.md` (259 questions; top 3 answered)
- **Stack switched to the browser** (your call): TypeScript + Three.js + Rapier + a Node WebSocket server on
  Railway. PLAN.md §3/§4/§5/§18 rewritten. The desktop Godot spike was retired.
- **§3 tech spike for the web stack: passed** (`tools/spike/web_stack/`, DECISIONS D-020). Browser prediction
  matches the server bit-for-bit, and the server tick is 0.54 ms p99 with 10 players (budget 5 ms).
- **Your decisions applied:** browser + Railway (D-019), Lesion (D-011), reinforcements `max(6, …)` (D-015),
  Pick & Ban in Unranked (D-014), Quick Match format, no 3v3 (D-017).

### How to test / review
1. **Run the spike** (2 minutes, needs Node 22+):
   ```
   cd tools/spike/web_stack
   npm install
   npm run build
   npm start
   ```
   Open http://localhost:8080 in Chrome/Edge (WASD + drag mouse). Open a second tab to see a second player.
   The HUD's "max prediction error" should stay at 0.
2. Skim **`research/SUMMARY.md`** (one page).
3. When you have time: the rest of `research/OPEN_QUESTIONS.md` (reply in chat, or write `> Ulo: …`
   under a question) and the **30-minute minimum screenshot set** in `research/oregon/SCREENSHOT_CHECKLIST.md`.
   The repo is **public**; consider making it private before adding screenshots.

### Known issues
- **Weakest data:** movement speeds, stance heights, hole sizes, drone and camera numbers, and camera facings.
  Ubisoft doesn't publish these, so they're `UNVERIFIED` placeholders until you measure them in-game.
- `oregon/common_setups.md` (what the bots will use) is mostly inferred (tagged `DER`).
- Nothing is deployed to Railway yet. That's Phase 2, and I'll confirm with you before creating anything in
  your Railway account.
- Several agents' web requests briefly carried your GitHub handle (and once your email) in a User-Agent header.
  This was caught and forbidden; nothing personal is in the repo.

### Next: Phase 1 — Skeleton + movement
TypeScript workspace (`game/shared`, `game/server`, `game/client`), data loaders for `data/*.json`,
player/pawn separation (Skopós-ready), stand/crouch/prone, lean (toggle/hold), sprint, vault, ladders,
and a `movement_lab` test page. **Done when:** it feels like Siege movement to you, offline in the browser.
