# Lesion (provisional pick for the plan's "Legion")
Verified against: Y11S3 (Operation Split Fire, incl. Y11S3.1 patch of 2026-09-22) — researched 2026-09-29
Confidence: medium-high. Loadout, ratings and every Gu number below come from official Ubisoft pages/Designer's Notes/patch notes, traced change by change up to Y11S2.2. Some details (removal time, throw time, mine HP, trigger notification) are documented nowhere I could reach and are marked UNVERIFIED.

> **Name flag:** No Siege operator is called "Legion". Lesion is the most likely intended pick. See `legion_name_check.md`. Confirm with Ulo before implementing.

> **Outdated-guide warning:** Many guides (and the Fandom infobox) still describe **cloaked** Gu mines, **9** mines, a 30 s or 20 s refill, a **Super Shorty**, or **Impact Grenades**. All of that is outdated (see the change history).

## Identity
| Field | Value | Source |
|---|---|---|
| Side | Defender | Ubisoft operator page |
| CTU | S.D.U (Hong Kong) | Ubisoft operator page |
| Squad | Ghosteyes | Ubisoft operator page |
| Specialties | Anti-Entry, Trapper | Ubisoft operator page |
| Health rating | **2** (of 3) → **110 HP** | Ubisoft page (2 active stars); HP mapping: Fandom "Armor and Speed" (Light 100 / Medium 110 / Heavy 125 HP since Y6S3 Crystal Guard) |
| Speed rating | **2** (of 3) | Ubisoft operator page |
| Speed in m/s | UNVERIFIED here → take the value for speed 2 from `research/core_mechanics.md` | — |
| Difficulty | 1 (of 3) | Ubisoft operator page |
| Introduced | Y2S2 Operation Blood Orchid (2017) | Fandom |
| Unlock price | 10,000 Renown / 240 R6 Credits | Fandom (not re-checked in-game) |

## Loadout (official Ubisoft operator page, checked 2026-09-29)
| Slot | Options | Notes |
|---|---|---|
| Primary | **SIX12 SD** (shotgun), **T-5 SMG** (submachine gun) | — |
| Secondary | **Q-929** (handgun) | Only one secondary. The Super Shorty was **removed in Y10S3** |
| Secondary gadget (pick 1) | **Observation Blocker** (×3), **Bulletproof Camera** (×1) | Counts from Fandom. The Impact Grenades were removed and the Observation Blocker added in Y9S1.3 |
| Unique ability | **Gu** mines ("GU") | — |

Weapon stats belong in `research/weapons.csv`. I found no Lesion weapon stat changes in Y10S2–Y11S3.1 patch notes. Y10S3 removed Magnified Sights from defenders' automatic weapons. Whether this changed the T-5's optics is UNVERIFIED.

## Unique ability: Gu mines (current values)
| Property | Current value | Last changed | Source |
|---|---|---|---|
| Gadget class | **Mechanical** (not electronic): unaffected by EMPs, not detectable by IQ, not hackable by Brava | Y8S3 | Y8S3 Designer's Notes |
| Max resources | **8** mines | Y9S4.2 (was 9) | Y9S4.2 Designer's Notes |
| Starting count | **1** at round start (prep phase) | — | Fandom. Consistent with the Y9S4.2 DN arithmetic ("up to 5 entry points within the first minute of Action Phase" with a 25 s refill = 1 + ⌊(45 s prep + 60 s)/25⌋; my inference) |
| Refill timer | **+1 mine every 25 s** (the timer runs during prep phase too; see starting-count note) | Y11S2.2 (was 30 s) | Y11S2.2 patch notes (official) |
| Deployment | **Thrown**. Deploys on flat surfaces (floor, desk, cabinet, windowsill). Can snag on stairs or obstructed shelves. Throw arc similar to Impact Grenade: it drops almost straight down after hitting a wall or ceiling | — | Fandom |
| Retrievable | Yes, Lesion can pick up deployed mines | — | Fandom |
| Visibility | **Always visible to everyone.** Cloaking was removed entirely in Y8S3. Lesion's own **HUD icons for his mines were removed** in Y8S3 (no see-through-wall icons) | Y8S3 | Y8S3 Designer's Notes |
| AoE feedback | "Added Area of Effect feedback" (Y8S3). Exact visual is UNVERIFIED | Y8S3 | Y8S3 DN |
| Trigger | Physical contact by an **attacker**. Effective radius **1 m**. One mine can affect several operators inside its area | — | Fandom |
| Melee on a mine | Detonates it (the attacker is still stung) | — | Fandom |
| Initial (impact) damage | **3 HP** | Y9S1.3 (was 5) | Y9S1.3 DN |
| Poison tick damage | **12 HP per tick** | Y8S3 (was 8) | Y8S3 DN |
| Poison tick interval | **2 s** ("poison timer") | Y8S3 (was 2.5 s) | Y8S3 DN |
| Poison duration | **Indefinite**: ticks until the needle is removed or the victim goes DBNO | — | Fandom |
| Second mine while poisoned | Resets the poison timer and deals the new mine's initial damage **plus one instant poison tick**. Does **not** stack needles or increase tick damage. Still only one needle to pull | Y8S3 | Y8S3 DN; Fandom |
| DBNO | DBNO players still trigger mines but take **no** Gu effect. Poison stops when downed | Y5S1 | Y5S1 DN; Fandom |
| Movement penalty | **Cannot sprint while poisoned** (walk, crouch, prone and gadget use still allowed). The Y7S2.2 bug fix confirms no-sprint is intended while needled. Extra % slowdown: UNVERIFIED | — | Fandom; Fandom Patch 7.2.2 |
| Screen effect | Queasy peripheral visual distortion while needled | — | Fandom |
| Removal | Prompt to pull the needle, **standing stances only**. Lowers the weapon. Shield operators must un-equip the shield during removal (Y5S1.1 bug-fix note) | — | Fandom; Fandom Patch 5.1.1 |
| Removal duration | **UNVERIFIED** ("a couple of seconds"). Placeholder: 2.0 s, clearly labeled | — | Fandom (qualitative only) |
| Defuser | A poisoned defuser carrier **cannot plant or drop the defuser** until the needle is removed | — | Fandom (older text; UNVERIFIED for Siege X) |
| Healing | Doc's stim should **not** remove the needle (Y6S2.1 fixed a bug where it did) | — | Fandom Patch 6.2.1 |
| Mine HP / what destroys it | Destroyed by **gunfire and explosives**. Exact HP UNVERIFIED (placeholder: 1 HP). Also destroyed when too close to a wall being reinforced | — | Fandom |
| Trigger notification to Lesion/team | UNVERIFIED. Since Y8S3 there is no HUD icon. Whether a "mine triggered" alert still exists is unknown | — | — |
| Throw / deploy time | UNVERIFIED | — | — |

### Worked damage example (for sanity-checking code)
Light (100 HP) attacker, first poison tick assumed at t = 2 s: 3 (impact) + 12 × n. DBNO/death after the 9th tick ≈ t = 18 s if never removed. Whether the first tick lands at t = 0 or t = 2 s is UNVERIFIED.

## Interactions with the other 11 roster operators
| Other operator / gadget | Interaction with Lesion / Gu | Source / confidence |
|---|---|---|
| **Brava** (Kludge Drone) | **Cannot hack Gu mines** (mechanical since Y8S3). Kludge **can** hack Lesion's secondary gadgets: **Bulletproof Camera** and **Observation Blocker** switch allegiance to attackers. Whether a Kludge drone can trigger or be damaged by a Gu: UNVERIFIED (drones are not operators, so probably no trigger) | Y8S3 DN; Fandom Brava |
| Brava (Claymore, Smoke) | Claymore: defenders trigger it; no Gu interaction. The claymore blast destroys gadgets in radius: UNVERIFIED for Gu | Fandom |
| **Fuze** (Cluster Charge) | Sub-grenades (4.2 m explosion radius each) **destroy Gu mines** caught in the blasts. Fuze's gadgets: Breach Charge, Hard Breach Charge, Smoke. Explosions destroy mines | Fandom Fuze; Fandom Lesion ("susceptible to explosives") |
| Fuze (Ballistic Shield) | A shield Fuze who steps on a Gu is poisoned. He can't sprint and must lower the shield to pull the needle. Ubisoft counts Gu as its shield-slowing tool (Y9S1.3 DN) | Y9S1.3 DN; Fandom Patch 5.1.1 |
| **Thermite** (Exothermic Charge) | Explosion (≈4 m radius) destroys nearby Gu mines. Gu mines on the defender side of the wall are at risk | Fandom Thermite (radius); Fandom Lesion |
| **Striker** (any 2 attacker gadgets) | Frag / Breach Charge / Hard Breach Charge / Claymore explosions destroy Gu mines. **Impact EMP has no effect** on Gu (mechanical). Stun and Smoke: no gadget interaction | Y8S3 DN; Ubisoft Striker page |
| **Dokkaebi** (Jegeo Payload) | Can target Lesion's phone like any identified defender (40 HP explosion + 5 s fire if ignored). Gu use does **not** depend on the phone, so Lesion keeps his mines. Losing the phone does cost him camera access, including his own Bulletproof Camera. Her Y11S3 Breach Charges destroy mines like any explosive | Y11S2 DN; Fandom Dokkaebi |
| **Sledge** (Breaching Hammer, Frag, Stun, Impact EMP) | Frag destroys mines. **Impact EMP has no effect** on Gu. Hammer vs a mine on the floor it breaks: UNVERIFIED | Ubisoft Sledge page; Y8S3 DN |
| **Sentry** | Friendly. No interaction. Sentry can also bring Observation Blockers or a Bulletproof Camera | Ubisoft Sentry page |
| **Skopós** | Friendly. Shells do not trigger Gu (mines only affect attackers). No interaction | Inference (Gu = attacker-only) |
| **Mira** | Friendly. No interaction (synergy: poisoned attackers can't sprint past Black Mirror sightlines) | — |
| **Pulse** | Friendly. Synergy: poisoned attackers can't sprint, so they are easier to track with Pulse's Cardiac Sensor and to Nitro Cell | Fandom (no-sprint) |
| **Mute** | Friendly. **No interaction**: jammers act on attacker wireless signals, and Gu is mechanical and friendly. A **Brava-hacked** jammer also cannot affect Gu (mechanical) | Y10S4 DN; Y8S3 DN |

### Relevant generic / non-roster notes
- **EMP of any kind** (Impact EMP, Thatcher E.G.S.): no effect on Gu since Y8S3. Older wiki text saying "EMP uncloaks Gu" is obsolete.
- Non-roster counters listed by Fandom: Twitch Shock Drone, Zero ARGUS lasers, Flores RCE-Ratero and Kali LV Lance can destroy Gu mines. IQ can no longer see them.

## Change history (last 4 seasons + Siege X)
| Season / patch | Date | Change affecting Lesion | Source |
|---|---|---|---|
| Y10S2 Daybreak (Siege X launch) | Jun 2025 | **No Lesion-specific change found.** Global: limb damage reduced (reverted in Y10S4.1). Electricity made neutral (slows, no damage) | Y10S2 DN |
| Y10S3 High Stakes | Sep 2025 | **Super Shorty removed** from secondaries. Magnified Sights removed from defenders' automatic weapons (T-5 effect UNVERIFIED) | Y10S3 DN |
| Y10S4 Tenfold Pursuit | Dec 2025 | No Lesion change found. (Y10S4.1: limb-damage reduction reverted) | Y10S4 DN; Fandom Patch 10.4.1 |
| Y11S1 Silent Hunt | Mar 2026 | **Observation Blocker deploy time 1 s (from 2.5 s)** (Lesion listed as affected) | Y11S1 DN |
| Y11S2 System Override | Jun 2026 | **Y11S2.2 (2026-07-14): Gu refill 25 s (from 30 s)** | Y11S2.2 patch notes |
| Y11S3 Split Fire | Sep 2026 | No Lesion change found in Y11S3 DN, the Y11S3 TS addendum or Y11S3.1 | Y11S3 DN; addendum; Y11S3.1 |

Earlier history (explains outdated guides):
| Patch | Change | Source |
|---|---|---|
| Y9S4.2 (Jan 2025) | Max mines 8 (from 9). Refill 30 s (from 25) | Y9S4.2 DN |
| Y9S1.3 (2024) | Initial damage 3 (from 5). Refill 25 s (from 20). Impact Grenades removed, Observation Blocker added | Y9S1.3 DN |
| Y8S3 Heavy Mettle (2023) | Mechanical. Initial dmg 5 (from 0). Poison 12 (from 8). Tick 2 s (from 2.5). **Cloaking removed**. HUD icon removed. Max 9 (from 8). Refill 20 s (from 30). Second-mine instant tick. AoE feedback. Super Shorty added | Y8S3 DN |
| Y5S1 Void Edge (2020) | Initial tick removed. 6 dmg/tick. DBNO immune. Icons only in LOS within 8 m | Y5S1 DN |

## Implementation summary (JSON-ready)
```
gu: { max: 8, start: 1, refill_s: 25, class: "mechanical", visible_to_attackers: true,
      trigger_radius_m: 1.0, impact_dmg: 3, tick_dmg: 12, tick_interval_s: 2.0,
      duration: "until_removed_or_dbno", blocks_sprint: true, blocks_defuser_plant_drop: true,
      restack: "reset_timer + impact + instant_tick", dbno_immune: true,
      remove_time_s: 2.0 /*UNVERIFIED placeholder*/, hp: 1 /*UNVERIFIED placeholder*/,
      emp_immune: true, brava_hackable: false, retrievable: true }
```

## Open questions
- **Is "Legion" = Lesion?** Ulo, please confirm (see `legion_name_check.md`).
- How long does pulling a Gu needle take (seconds, from pressing the prompt until the weapon is back up)? Could Ulo time it in a Custom game?
- Does the first 12 HP poison tick land immediately on the sting or 2 s later?
- Do Gu mines have HP beyond "one bullet"? Does one pistol bullet always destroy one?
- Since Y8S3, does Lesion (or the team) get any notification or kill-feed-style alert when a mine is triggered? Does the victim's scream count as the only intel?
- Besides no sprinting, does a poisoned attacker walk slower than normal?
- Can a drone (incl. Brava's Kludge) trigger or destroy a Gu by driving over it?
- Does the 8-mine cap count deployed plus in-hand mines, or only in-hand? Does picking one up refund it?
- Does Sledge's hammer destroy a mine lying on the floor or hatch he smashes?
- Did the Y10S3 Magnified-Sight removal change the T-5 SMG's optic list?
- Gu throw/deploy animation time (seconds).

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/lesion — side, CTU, squad, specialties, star ratings (HTML `is-active` count), current loadout
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2Btj0mP7e7gVKIODGSLuiX/y8s3-designers-notes — Y8S3 Gu rework (mechanical, cloak removed, damage, timer, max 9, refill 20)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2D4HsYOBEEg0wEW5dim34o/y9s13-designers-notes — initial damage 3, refill 25, Obs Blocker replaces Impact Grenades
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/7bfYr7UJrJwiEp7zpQa0dd/y9s42-designers-notes — max 8, refill 30
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3LopsZumVn97iC5NoSGu8j/y5s1-preseason-designers-notes — DBNO immunity, 8 m LOS icons (historic)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes — Siege X Y10S2 (no Lesion change, global systems)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/4czc3hlHtXrd27crELGDcc/y10s3-designers-notes — Super Shorty removed; magnified sights removed on defenders
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes — Y10S4 (no Lesion change; Mute/DSEG rework context)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5fWCjoCU8toUJiBdMSj0UA/y11s1-designers-notes — Observation Blocker 1 s deploy
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3IoMKS8f3AHlOwBQXfiytt/y11s22-midseason-patch-notes — Gu refill 25 s (from 30)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2MNhboDBmsQKkWb5p8zqsg/y11s2-designers-notes — Jegeo Payload numbers (40 HP, 5 s fire)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/PONCuRt8LaCr3O31NkBQb/y11s3-designers-notes — Y11S3 (no Lesion change)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/6HzsdnbOYovXelORy4mB7z/y11s3-patch-notes-addendum — Y11S3 TS fixes (none for Lesion)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes — Y11S3.1 (none for Lesion)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/striker , .../sledge , .../fuze , .../brava , .../dokkaebi , .../sentry — other roster operators' gadget lists used for the interaction table
- https://rainbowsix.fandom.com/wiki/Lesion — mechanics text (radius 1 m, no sprint, removal stance, defuser rule, start with 1, retrievable, counters). Its infobox/patch list is partly outdated (9 mines, cloak)
- https://rainbowsix.fandom.com/wiki/Armor_and_Speed — Health rating → HP (100/110/125)
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_5.1.1 — shield operators un-equip shield to remove needle
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_6.2.1 — Doc stim must not remove Gu
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_7.2.2 — no-sprint while needled (bug-fix context)
- https://rainbowsix.fandom.com/wiki/Brava — Kludge hack list (Bulletproof Camera / Observation Blocker switch allegiance)
- https://rainbowsix.fandom.com/wiki/Fuze_(Siege) — Cluster sub-grenade radius 4.2 m
- https://rainbowsix.fandom.com/wiki/Thermite_(Siege) — Exothermic blast radius ~4 m
- https://rainbowsix.fandom.com/wiki/Dokkaebi — Jegeo Payload behaviour (remaster tab)
- https://siege.gg/news/lesions-gu-mines-buffed-gets-super-shorty — secondary confirmation of Y8S3 values
