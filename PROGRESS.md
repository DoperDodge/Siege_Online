# PROGRESS.md

Status per phase (PLAN.md §17). Newest phase on top. Each phase lists what's done, how to test it,
known issues, and what's next.

---

## Phase 0 — Research · ✅ research complete, ⏳ waiting on your review (2026-09-29)

**Done when (PLAN §17):** `research/` complete, SUMMARY.md, OPEN_QUESTIONS.md, screenshot checklist
sent → you skim it and answer the open questions you can.

### What's done
- **All research files from PLAN §2.1/§2.2**, verified against **Y11S3 incl. Y11S3.1**:
  - `research/core_mechanics.md`, `destruction.md`, `round_flow.md`, `intel.md`, `gadgets.md`
  - `research/operators/*.md` — all 12 (Lesion stands in for "Legion"; see `legion_name_check.md`)
  - `research/weapons.csv` (40 rows) + `weapons_notes.md`
  - `research/interactions.csv` (343 rows) + `interactions_notes.md`
  - `research/oregon/`: `version.md`, `layout_notes.md`, `surfaces.md`, `map_features.md`,
    `common_setups.md`, `SCREENSHOT_CHECKLIST.md`, `refs/SOURCES.md`
  - `research/SUMMARY.md` (one-page digest) and `research/OPEN_QUESTIONS.md` (259 questions, top 10 first)
- **§3 tech-stack spike** for the plan's original stack (Godot 4.7.2 .NET): passed. See DECISIONS D-003–D-006
  and `tools/spike/godot_stack/`. ⚠️ This may be superseded if you confirm the browser switch (D-019).
- **Your decisions applied:** Pick & Ban in Unranked (D-014), a Quick Match format (D-017), no 3v3 Arcade.
  PLAN.md §1, §4, and §6.2 updated.
- Repo scaffolding: README, DECISIONS.md, ASSET_SOURCES.md, Git LFS, `.gitignore`.

### How to review it (≈ 20–30 min)
1. Read **`research/SUMMARY.md`** (one page).
2. Answer the **top 10 in `research/OPEN_QUESTIONS.md`** — especially #1 (browser vs desktop) and #2 (Legion = Lesion?).
   Reply in chat, or write `> Ulo: …` under a question.
3. When you have time: the **30-minute minimum screenshot set** in `research/oregon/SCREENSHOT_CHECKLIST.md`
   (Custom Game → Local, timer off). Drop files in `research/oregon/refs/ulo/`. The repo is **public**, so
   consider making it private first.
4. Optional: skim `research/oregon/surfaces.md` (the soft/hard wall list) and correct anything you know is wrong.

### Known issues
- **Weakest data:** movement speeds, stance heights, hole sizes, drone and camera numbers, and default-camera facings.
  Ubisoft doesn't publish these, so they're `UNVERIFIED` placeholders until you measure them in-game.
- `oregon/common_setups.md` (what the bots will use) is mostly inferred (tagged `DER`) — no reachable post-2020 setup guide.
- Several agents' web requests to Liquipedia/Reddit briefly carried your GitHub handle (and once your email) in a
  User-Agent header before this was caught and forbidden. Nothing personal is in the repo.

### Next: Phase 1 — Skeleton + movement
Blocked on: your review of SUMMARY.md, and **decision D-019 (browser vs desktop)**, which picks the Phase 1
tech stack. If it's browser, the first step is rewriting PLAN §3/§5/§18 and re-running the tech spike on the
web stack. Then: project skeleton, player/pawn separation (Skopós-ready), stand/crouch/prone, lean, sprint,
vault, ladders, and a `movement_lab` test scene.
