# Project REDMOND

A private, non-commercial fan project: a multiplayer tactical-breach shooter modeled on
Rainbow Six Siege, played on a full recreation of **Oregon**. Built in Godot 4 (.NET/C#).

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

**Phase 0 — research.** There's no game to run yet. The plan requires the research in
`research/` to exist and be reviewed before any gameplay code is written.

## Repository layout

```
PLAN.md  PROGRESS.md  DECISIONS.md  ASSET_SOURCES.md  README.md
research/        Phase 0 output (reference only, never shipped)
data/            operators, weapons, gadgets, surfaces, modes, maps   (from Phase 1)
game/            Godot project root                                   (from Phase 1)
tools/           blender/ (procedural assets), mapgen/, netsim/       (from Phase 1+)
builds/          gitignored build output
```

## Developer setup (Windows 11) — needed from Phase 1

> ⚠️ This section and the next assume the plan's original **desktop** stack. You've asked for browser play
> (DECISIONS.md D-019); if you confirm, these sections are rewritten for the web stack (open a URL, server on Railway).

Verified in the §3 tech spike (see `DECISIONS.md`):

1. **Godot 4.7.2 — .NET edition** (the "Godot Engine - .NET" download, not the standard one):
   https://godotengine.org/download/windows/
2. **.NET 10 SDK**: https://dotnet.microsoft.com/download/dotnet/10.0
3. **Git LFS**: `git lfs install` once (binary assets such as `.glb`, `.png`, `.wav` are LFS-tracked).
4. Export templates for Windows/server builds: Godot → *Editor → Manage Export Templates → Download*.

## Playing with friends over the internet (from Phase 2)

The game uses ENet over **UDP**. Pick one:

1. **Tailscale or ZeroTier (easiest).** Everyone installs it and joins your network; friends join
   your Tailscale IP. No router changes.
2. **Port-forward UDP** on the host's router to the host PC (port will be listed here once chosen).
3. **Rent a small VPS** and run the headless dedicated server build there. Note: many PaaS hosts
   only proxy TCP/HTTP, so ENet/UDP won't work on them — use a real VM.

## Manual asset steps (from Phase 10)

Mixamo characters/animations must be downloaded by hand (an AI can't log in to Mixamo). Exact file
names and settings will be listed here when the art pass starts.
