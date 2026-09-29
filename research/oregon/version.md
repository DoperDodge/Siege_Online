# Oregon — which version to build
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29
Confidence: medium. The release history is confirmed by official Ubisoft sources. The claim that the March 2026 modernization did not change the layout is inferred from two independent maps that match each other, not from an official statement.

## Recommendation (TL;DR)
**Build the Y5S1 (Operation Void Edge, March 2020) reworked layout**, and add the **Y11S1 (Operation Silent Hunt, March 2026) "modernized" layer** on top of it: destructible ingredients and the visual/lighting mood.
- Geometry source of truth: the official Ubisoft blueprints, which are still the download on the live Oregon page. The files inside the zip are dated 2020-02-18.
- Cross-check: r6calls.com's Oregon vector map (revision 5, file last modified 2026-07-25). It already contains the Siege X ingredient layers (gas pipe, fire extinguisher), which exist on Oregon only since Y11S1. Its rooms, soft walls and hatches match the 2020 blueprints one-for-one (checked on B, 1F and 2F). So the modernization shows no layout change in the best current community map.
- `layout_notes.md` and `surfaces.md` describe this layout.

## Timeline
| Date | Event | Source |
|---|---|---|
| 2015-12-01 | Oregon released with the base game ("Original" version, with a 4th site "1F Rear Stage / 2F Watch Tower") | Liquipedia `Oregon` (releasedate) |
| 2020-03-10 | **Rework released in Y5S1 Operation Void Edge.** Bomb sites became Kids'/Dorms, Kitchen/Dining, Meeting/Kitchen, Laundry/Supply | Liquipedia `Oregon` (reworkdate); Fandom `Oregon` |
| 2020-02-18 | Timestamps of the 5 official blueprint JPGs inside Ubisoft's current download zip (still served in 2026; zip Last-Modified 2026-07-08) | official zip (see SOURCES) |
| 2024-07-17 | Oregon removed from the **Pro League / competitive** map pool, replaced by Lair (Stage 2 2024). It had been in the pool from Jun 2020. | siege.gg "Lair to replace Oregon…" |
| 2025-06 (Y10S2) | Siege X launch. The first modernized maps (Bank, Border, Chalet, Clubhouse, Kafe) got destructible ingredients. Oregon was **not** in that batch. | siege.gg search-result summary (secondary). Oregon's own inclusion is confirmed only in Y11S1. |
| 2026-02-17 / 2026-03-03 | Y11S1 Silent Hunt test server / worldwide release. **"This season adds modernized touches to Coastline, Villa, and Oregon, bringing updated graphics and lighting to these maps alongside new destructible ingredients and an overall health pass."** Modernized Oregon also added to Landmark Drill and Clear House. | Ubisoft Silent Hunt season page; Fandom Operation Silent Hunt + Patch 11.1.0 |
| 2026-03 | The official Oregon map page now reads **"Map reworked: March 2026"**. It refers to the modernization; the layout rework is from 2020. | Ubisoft Oregon map page |
| Y11S1 mid-season | **Ranked:** "Midway through the season, Coastline, Villa, Oregon, and Emerald Plains will be replaced by Skyscraper, Theme Park, Stadium Bravo, and Favela." Oregon leaves the Ranked rotation. | Ubisoft Silent Hunt page; Fandom Patch 11.1.0 |
| Y11S1.1 | Fix: "Solid Snake's Soliton Radar MK III can detect the 2nd floor of Oregon map from **EXT Dorms Roof**". This confirms an official location name. | Fandom Patch 11.1.1 |
| Y11S1.3 | Fix: "In the exterior construction area of Oregon, players can go on the generator for an advantageous line of sight." This was a prop/collision fix, not a layout change. | Fandom Patch 11.1.3 |
| Y11S2 (System Override) | The Ranked pool is now split into Pro League / Seasonal / Showcased groups. At season start "Calypso Casino is in and Villa, Skyscraper, Theme Park, and Kanal are out". **Oregon is not named.** | Ubisoft System Override page |
| Y11S3 (Split Fire, 2026-09-01) | The season page (modernized: Stadium Alpha/Bravo, House; Villa layout rework) and the Y11S3.1 patch notes say **nothing about Oregon**. | Ubisoft Split Fire page; Y11S3.1 patch notes |

## What the modernization changed (Y11S1)
| Change | Status | Notes |
|---|---|---|
| Updated graphics, lighting (and per the Y11S2 wording for other maps: shadows, 4K textures) | **Confirmed** (official) | Art direction only. Use the modernized look as the mood reference for the art pass. |
| New destructible ingredients (gas pipes, fire extinguishers; metal detectors are another Siege X ingredient type) | **Confirmed** that ingredients were added (official). r6calls shows Oregon gas pipes and fire extinguishers (no metal detectors). | Positions belong to the other research agent (`ingredients`). r6calls marks: B ×2 extinguishers; 1F ×3 extinguishers + 1 gas pipe (exterior SE corner by Garage/Lobby); 2F ×2 extinguishers + 1 gas pipe (Attic). |
| "Overall health pass" | **Wording confirmed; content unknown** | Probably bug/collision/exploit fixes (e.g. the Y11S1.3 generator fix). No patch note lists wall, hatch, door or room changes for Oregon. |
| Layout changes (walls, hatches, doors, rooms) | **None found**. Status: UNVERIFIED but likely none. | Evidence: (1) no official note mentions any; (2) r6calls rev 5 (updated after ingredients were added) matches the 2020 official blueprints for every soft wall, hatch and room outline; (3) Ubisoft still serves the 2020 blueprints as the Oregon download. |

## Is Oregon still live?
- **Yes, the map is live.** The official page (fetched 2026-09-29) lists playlists "Ranked, Quick Match, Unranked, Team Deathmatch". This static page may not track the Ranked rotation.
- **Ranked:** officially rotated out mid-Y11S1. Its Y11S2/Y11S3 Ranked status is **UNVERIFIED**. A search-engine summary claimed "Oregon and Kanal were removed from ranked for Y11S3", but no primary source was found. Low-quality sites (ggchest) contradict each other.
- **Pro League:** out since Stage 2 2024 (siege.gg).
- **Impact on our build: none.** PLAN §1 asks for the current live layout, and the layout is the same everywhere it is played.

## Why not the pre-2020 "Original" Oregon?
It is gone from the game. Its site list (e.g. "1F Rear Stage / 2F Watch Tower") and r6maps.com's Oregon data describe that old layout. **Do not use r6maps.com for Oregon** (see SOURCES).

## Open questions
- (Ulo) Since Silent Hunt (March 2026), have you noticed **any** layout difference on Oregon: a wall that became hard or soft, a new or removed window, door or hatch, a changed room? We assume none.
- (Ulo) Is Oregon in **Ranked** right now (Y11S3)? It doesn't affect the build, but it corrects version notes and SUMMARY.
- (Ulo) Are there **metal detectors** on modernized Oregon, or only gas pipes and fire extinguishers? This is for the ingredients agent.
- The exact content of the "overall health pass" is unknown. If Ubisoft published a Designer's Note or video on the Oregon modernization, it should be checked. None was found; the shared WebSearch budget ran out before a targeted search.

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/maps/oregon — "Map reworked: March 2026", playlists, blueprint zip link
- https://ubistatic-a.ubisoft.com/0106/gamesites/rainbow6/blueprints/r6-maps-oregon-blueprints.zip — official blueprints (JPGs dated 2020-02-18, zip Last-Modified 2026-07-08)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/silenthunt — Y11S1 modernized Oregon quote; Ranked rotation (Oregon out mid-season)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/systemoverride — Y11S2 Ranked pool groups; Oregon not mentioned
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/splitfire — Y11S3; no Oregon changes
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes — Y11S3.1; no Oregon mentions
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5fzYRZKVVHqqRkkv3m4MyF/ranked-30-update — Ranked 3.0 map-ban pools (2026-05-17)
- https://rainbowsix.fandom.com/wiki/Tom_Clancy%27s_Rainbow_Six_Siege:_Operation_Silent_Hunt — Silent Hunt dates (TS 2026-02-17, release 2026-03-03), "Oregon (Modernized)"
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.1.0 — same notes as the official page
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.1.1 — "EXT Dorms Roof" fix
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.1.3 — construction-area generator LOS fix
- https://liquipedia.net/rainbowsix/Oregon — release/rework dates, spawns, site lists (Void Edge vs Release)
- https://rainbowsix.fandom.com/wiki/Oregon — overview, 6 hatches, site lists
- https://siege.gg/news/lair-to-replace-oregon-in-siege-competitive-map-pool — Pro League removal (2024-07-17)
- https://mp1st.com/title-updates-and-patches/rainbow-six-siege-y11s1-silent-hunt-solid-snake-patch-3-28-1-000-133 — mirror of the Y11S1 notes
- https://r6calls.com/img/maps/oregon.svg and https://r6calls.com/data/dataMap.json — rev 5 map with ingredient layers, used to check that the layout did not change
- https://ggchest.com/blog/rainbow-six-siege/rainbow-six-siege-maps-full-list-ranked-pool-2026 — rejected (contradicts official Ranked notes)
