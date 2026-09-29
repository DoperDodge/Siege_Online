# Round Flow, Timers, Win Conditions and Playlist Rules (Bomb)
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29
Confidence: medium. The core Bomb numbers (prep 45 s, action 180 s, plant 7 s, defuser fuse 45 s, disable 7 s) have official sources. Playlist rules (Pick & Ban, Unranked, Quick Match timers, Arcade settings, abandon rules) come from official season or patch notes. Some items have no official source for the current season: the Ranked operator-pick timer, site/spawn selection timers, Quick Match round count, and several Arcade details. Those come from Fandom or siege.gg, or they are UNVERIFIED.

Conventions: all times are in **seconds** unless marked otherwise. "Official" means an ubisoft.com page, a Ubisoft Steam announcement, or a Ubisoft-hosted esports rulebook. The season a value was last confirmed is given in brackets where it is older than Y11S3, for example `[Y8S3]`.

---

## 0. Playlists that exist as of 2026-09-29

| Playlist | Live now? | Mode | Notes |
|---|---|---|---|
| **Ranked** (Ranked 3.0 since Y11S2) | yes | Bomb only | Map ban and per-round operator Pick & Ban. Unlocks at CL50 and needs the paid version [Y10S2]. |
| **Unranked** | yes | Bomb | "An exact copy of Ranked in terms of rounds, timers, Pick & Ban, and general settings" (official, Y10S2). There is **no map ban**; players use map filters instead. Unlocks at CL20. |
| **Standard** | **no, removed** | — | Standard replaced Unranked in Y8S3. It was removed in Y10S2, when Unranked came back. Standard had no bans and a 1-round overtime `[Y8S3]`. Do not model it as a current playlist. |
| **Quick Match** | yes | Bomb / Hostage / Secure Area (per Fandom) | Casual rules: sites are pre-set and revealed, and bombsites come with pre-setups. Unlocks at CL3 [Y10S2]. |
| **1v1 Arcade** | **no** (limited time) | Bomb | Ran 2026-04-16 → ~04-30 (v1, Y11S1). Ran again from 2026-07-14/16 for two weeks (v2, Y11S2.2). **Oregon was in the map pool both times.** |
| **3v3 Arcade** | **no** (limited time, ended 2026-09-21) | Bomb | Ran 2026-09-08 → 09-21 (Y11S3). **Oregon was in the map pool.** |
| **Custom Game** | yes | Bomb / Hostage / Secure Area | Every setting can be changed. Includes a Pro League preset and 1v1 presets (added in Y9S3). |
| Siege Cup | periodic | Bomb | Ranked rules, for full 5-stacks in a bracket (Fandom). |
| Legend Division | opens mid-Y11S3 | Ranked-type | Solo-queue only, for top-ranked players. Its match rules were not published: UNVERIFIED (assume Ranked). |

---

## 1. Per-round phase order (Bomb)

This is the order in Ranked and Unranked. The other playlists skip steps as noted.

| # | Phase | Who does what | Playlist differences |
|---|---|---|---|
| 0 | Map ban (once per match, before round 1) | Each team votes to ban 1 map out of 5 | **Ranked only.** Unranked, QM, Arcade: none. Custom: toggle. |
| 1 | Operator **ban phase** | Both teams vote at the same time: attackers ban 1 defender, defenders ban 1 attacker | Ranked/Unranked: every regulation round, none in OT. QM: none. 1v1 v1: one ban per round. 1v1 v2 / 3v3: none (attrition instead). Custom: toggle. |
| 2 | **Site selection** (defenders) and **spawn selection** (attackers), on the Planning Phase tactical map | Defenders vote for a site. Each attacker picks their own spawn. | QM: the game picks the site at random, and attackers see it at round start. 1v1 v2: site revealed at round start. |
| 3 | **Operator + loadout pick** ("Planning Phase") | Everyone | If a player is AFK, the game auto-picks an operator from their personal stats [Y6S4]. |
| 4 | **Preparation phase** | Defenders reinforce, barricade and place gadgets inside the building (red walls stop them going outside). Attackers exist only as drones. Attackers may **repick operator, loadout and spawn** [Y7S1] and may change the defuser carrier. | — |
| 5 | **Action phase** | Attackers spawn physically at their chosen spawn. The runout rules for defenders now apply. | QM: attackers are invulnerable for 10 s [Y8S3]. |
| 6 | **Post-plant** (only if the defuser is planted) | The round timer is replaced by the defuser fuse countdown | — |
| 7 | **Round end** | Result banner, then end-of-round replay | — |
| 8 | Role swap / overtime intermission, when due | — | Custom: "Role Swap Timeout" setting. |

Sources for the order: the 2018 Pick & Ban dev blog ("After the Ban Phase, the Attackers will select their spawn, and Defenders will select their bombsite. Both teams will select their Operators after the spawn and site selections have been made"), Y10S2.2 patch notes ("Tactical map spawn locations during the Planning Phase"), and Y7S1 Demon Veil (attacker repick). **UNVERIFIED:** whether Siege X still shows site/spawn selection and operator pick as separate screens with separate timers, or as one combined Planning Phase screen.

---

## 2. Timers (seconds)

| Timer | Ranked | Unranked | Quick Match | 1v1 Arcade (v2, Jul 2026) | 3v3 Arcade (Sep 2026) | Custom (setting name → Pro League value) |
|---|---|---|---|---|---|---|
| Map ban vote | UNVERIFIED | n/a | n/a | n/a | n/a | map ban toggle; value UNVERIFIED |
| Operator ban vote | **15** (Fandom, post-Daybreak) | 15 (same as Ranked) | n/a | n/a (v1: one ban per round, timer UNVERIFIED) | n/a | `Ban Timer` → **20** (official rulebook) |
| Site selection (defenders) | UNVERIFIED | UNVERIFIED | n/a (random) | n/a (revealed) | UNVERIFIED | UNVERIFIED |
| Attacker spawn selection | UNVERIFIED (spawn can be changed through the whole prep phase) | same | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Operator pick | UNVERIFIED. Best guess **30**: the Y8S3 notes cut Quick Match "to 20s (from 30)", which implies 30 in the other playlists `[Y8S3]` | same as Ranked | **20**, or **15** if the round had no role swap `[Y8S3]`; not changed since in any note found | UNVERIFIED | UNVERIFIED | `Pick Phase timer` → **15** |
| Preparation phase | **45** | **45** | **45** (raised from 35 in Y10S2) | **15** (v1 was 30) | **30** | `Preparation` → **45** |
| Action phase | **180** | **180** | **180** (raised from 165 in Y10S2) | UNVERIFIED (assume 180) | UNVERIFIED (assume 180) | `Action` → **180** |
| Plant (attacker activates the defuser) | **7**, plus ~0.5 animation start (Fandom) | 7 | **7** (raised from 5 in Y6S1) | UNVERIFIED (Bomb ruleset, so 7) | UNVERIFIED (7) | `Plant Duration` → **7** |
| Defuser countdown (fuse; attackers win when it ends) | **45** | 45 | 45 (Fandom lists no QM difference; not separately confirmed) | UNVERIFIED (45) | UNVERIFIED (45) | `Fuse Time` → **45** |
| Disable (defender stops the defuser) | **7**, plus ~0.5 animation (Fandom) | 7 | **7** [Y6S1] | UNVERIFIED (7) | UNVERIFIED (7) | `Defuse Duration` → **7** |
| Runout detection grace (defender outside) | **1** [Y5S4] | 1 | 1. Red walls also stay up for the first **10 s** of action `[Y8S3]` | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Attacker spawn protection | none (map design only) | none | **10 s** invulnerability, lost early on entering the building `[Y8S3]` | UNVERIFIED | UNVERIFIED | none known |
| Round-end banner + replay | UNVERIFIED: about 5 s banner + about 7 s replay in 2020 | same | UNVERIFIED | UNVERIFIED | UNVERIFIED | `Death Duration` → 2, `Death Replay` → Off (per-player death cam) |
| Role-swap break | UNVERIFIED (about 9 s intermission in 2020) | same | UNVERIFIED | UNVERIFIED | UNVERIFIED | `Role Swap Timeout` On → **120** (pro setting, added 2026) |
| Tactical timeout | UNVERIFIED which playlists ("New Mid-Match Tactical Timeouts", Y10S3) | ? | ? | ? | ? | `Tactical Timeout Requests Available per Team` → 1, `Timeout Duration` → **45** |

Notes
- The plant can **finish after the action timer reaches 0** if it started before 0. The disable must **finish before the fuse ends** (Fandom Bomb). The 2020 match-length guide also counts a 7 s "overtime plant".
- In the Custom column, the setting names and Pro League values come from the official 2026 BLAST R6 Global Rulebook. They show the Custom Game options that exist and the competitive defaults.

---

## 3. Match structure: rounds, overtime, match point, side swap

| Rule | Ranked | Unranked | Quick Match | 1v1 Arcade | 3v3 Arcade | Custom (Pro League preset) |
|---|---|---|---|---|---|---|
| Regulation rounds | **6** (first to **4**) | same as Ranked | **4** (first to **3**) (Fandom `[Y6S1]`; UNVERIFIED for Y11) | **6** (first to **4**, max 7) | **6** (first to **4**) | `Number of rounds` → 12 (first to 7) |
| Role swap | after round 3 (**at round 4**) | same | after round 2 (**at round 3**) (Fandom; the "AA-DD" swap from Y4S4) | UNVERIFIED. The Custom 1v1 "Short Match" preset swaps **every round** [Y9S3] | **before round 4** (siege.gg) | `Attack/Defense Role Swap` → 6 |
| Overtime trigger | 3–3 | same | 2–2 | 3–3 | 3–3 | 6–6 |
| Overtime length | up to **3** rounds; first to **5** (so win by 2, or lead after 3 OT rounds). Max match = **9 rounds** | same (Fandom Unranked; Y10S2 "exact copy") | **1** round (sudden death), max 5 rounds | **1** round (max 7) | **1** round (max 7, official) | `Overtime Rounds` → 3 (or Infinite); `Overtime score difference` → 2 |
| Sides in overtime | swap **after every OT round** (Fandom). Round 7 sides: UNVERIFIED | same | OT side UNVERIFIED | UNVERIFIED | UNVERIFIED | `Overtime role Change` → 1; the pro team without map side-choice picks the OT side |
| Draws | never. Rounds cannot draw [Y4S2] | same | same | same | same | same |
| "Match point" | Display only: a banner and scoreboard marker when a team is one win from victory. No rule changes found | same | same | same | same | same |

Ranked round-by-round schedule. `X` is the team that attacks first.

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 (OT) | 8 (OT) | 9 (OT) |
|---|---|---|---|---|---|---|---|---|---|
| X side | ATK | ATK | ATK | DEF | DEF | DEF | UNVERIFIED | swaps | swaps |
| Ban phase? | yes | yes | yes | yes (bans reset first) | yes | yes | no (regulation bans re-applied) | no | no |
| Active bans per side | 1 | 2 | 3 | 1 | 2 | 3 | 3 | 3 | 3 |

---

## 4. Win conditions (Bomb, every playlist)

| # | Condition | Winner | Scoreboard icon (Fandom) |
|---|---|---|---|
| 1 | All attackers eliminated **before** the defuser is planted | Defenders | crosshair |
| 2 | Action timer expires with no plant started | Defenders | hourglass |
| 3 | Timer expires while a plant is **in progress**, and it completes | the plant counts; play continues | — |
| 4 | Timer expires while planting and the planter lets go, is downed or is killed before completion | Defenders (timeout) | hourglass |
| 5 | Defuser planted and not disabled before the fuse ends | Attackers | diamond + check |
| 6 | All defenders eliminated, at any time (before or after the plant) | Attackers | crosshair (or diamond if planted) |
| 7 | Defuser planted, then a defender completes the disable within the fuse time | Defenders | diamond + check |
| 8 | Defuser planted on a **hatch** and the hatch is destroyed | Defenders (defuser deactivated). The pro rulebook allows this as an "approved unintended mechanic". | — |
| 9 | Last attacker and last defender die at the same moment | planted → **Attackers**; not planted → **Defenders** [Y4S2 official] | — |

**All attackers die after the plant:** the round does **not** end. Defenders cannot win by elimination once the defuser is planted, so they must disable it before the 45 s fuse runs out. Otherwise the attackers win (Fandom Bomb).

**All remaining players DBNO:** UNVERIFIED whether a team whose remaining players are all DBNO counts as eliminated at once. core_mechanics.md covers DBNO.

---

## 5. Defuser rules

| Rule | Value / behaviour | Source |
|---|---|---|
| Defusers per attacking team | 1 | Fandom Bomb |
| Carrier selection | Any attacker can take it during the planning/prep screens and can hand it back until lock. If nobody takes it, it is auto-given to the operator with the highest defuser priority. | Fandom Bomb; QM got carrier selection in Y6S1 |
| Idle carrier | A player idle for the whole prep phase drops the defuser when action starts | Ember Rise [Y4S3] |
| Drop | Manual drop at any time. It also drops when the carrier is killed **or DBNO**. | Fandom Bomb |
| Pickup | Manual, no animation. The prompt appears within about **1 m**; the player does not need to look at it. | North Star [Y6S2]; Fandom (1 m) |
| Plant location | Anywhere inside the site room, including on furniture. There is a "no-drop zone" at the site edges. | Fandom; Neon Dawn [Y5S4] |
| Durability | Indestructible and electronic (Solis/IQ can detect it) | Fandom Bomb |
| Site reveal | Finding one bomb of the pair reveals both. Since Y7S3 the tactical map lists the possible defender objectives, and a discovered site appears on it. | Fandom; Brutal Swarm [Y7S3] |

---

## 6. Pick & Ban (Siege X system, since Y10S2)

**Playlists:** Ranked and Unranked (official Y10S2). Custom has a toggle; the Pro League variant is below. **Not** in Quick Match or in 3v3/1v1-v2 Arcade, which use attrition. 1v1 v1 had "one ban every round".

| Rule | Value |
|---|---|
| Cadence | One ban phase **before every regulation round**. Both teams ban at the same time. |
| Who bans what | The attacking team bans **1 defender**. The defending team bans **1 attacker**. |
| Voting | Each player votes for one opposing operator. Votes can be changed until the timer ends but cannot be withdrawn. The team ban is the **majority** vote. Ties are broken **at random**. Abstentions are ignored; if everyone abstains, **no ban**. (Fandom) |
| Timer | **15 s** (Fandom). The Pro League custom preset uses 20 s. |
| Stacking | Bans accumulate: 1, 2, then 3 per side over rounds 1–3. Maximum **3 attackers + 3 defenders** banned (6 total) per half. |
| Reset | At the role swap (round 4), **all bans are cleared** and the ban stack builds again over rounds 4–6. A team's bans never affect that same team later. |
| Already banned | An operator that is already banned cannot be voted again. |
| Overtime | No ban phase. Each team's regulation bans are re-applied for the side it is on, so 3 attackers + 3 defenders are banned in every OT round. |
| Unbannable operators | Newly released operators are usually unbannable for about **2 weeks** (Brava Y8S1, Fenrir Y8S2, Deimos Y9S1). UNVERIFIED for Noor in Y11S3. |
| Operator uniqueness | Each operator can be picked by only one player per team (siege.gg Ranked page). Cross-team duplicates are impossible because the attacker and defender pools are separate. |

**Map ban (Ranked only):** 5 maps are shown: 2 from the competitive (pro) pool, 1 showcased, 2 seasonal (official, Y11S1.2 and Y11S2). Each team votes to ban 1 map ("NO BAN" is allowed; ties random). The match map is then picked at random from the maps left. The timer is UNVERIFIED. Unranked has no map ban and uses map filters instead.

**Pro League / esports variant (Custom "Ban Phase: Pro League", 2026 rulebook):** the order runs before rounds 1, 4, 7 and 10:
- Before round 1: 2 simultaneous bans per team (4 total).
- Before round 4: +1 per team (6 total).
- Before round 7: bans reset at the side swap, then 2 each.
- Before round 10: +1 each.
- In OT, each team's 3 bans for the given side are re-applied automatically.
- Timer 20 s each. If both teams lock early, the timer shortens.

**Roster implication for REDMOND:** our roster has only 6 operators per side. Siege's cadence (up to 3 banned per side) would leave 3 operators for up to 5 players. Siege's operator-ban rules cannot be copied directly. PLAN §6.2's cap (default 1 ban per side, never fewer operators than players) is necessary.

---

## 7. Spawn and site selection

| Rule | Ranked / Unranked | Quick Match | 1v1 Arcade | 3v3 Arcade | Custom |
|---|---|---|---|---|---|
| Defender site | Defenders **vote** for the bomb site pair (Fandom Ranked/Unranked) | **Random**, set by the game (Fandom QM). Defenders know it before picking operators [Y4S1]. **Revealed to attackers at round start** [Y8S3]. | v2: site **revealed at round start** (official). v1: UNVERIFIED | UNVERIFIED (siege.gg lists only prep, rounds, swap and attrition as changes) | configurable (objective rotation settings) |
| Site repeat restriction | UNVERIFIED. siege.gg: "Defenders can't defend a site that has already been won." The mechanism is "Objective Rotation" (type Rounds Played or Rounds Won, plus a parameter); the Ranked values are UNVERIFIED. | UNVERIFIED | UNVERIFIED | UNVERIFIED | Pro: `Objective rotation parameter` 2, `Objective type for rotation` = Rounds played |
| Attacker spawn | **Individual** choice of spawn point, in all playlists since Y6S3 | individual | individual (1 player) | individual | individual (the team-vote option was removed in Y6S3) |
| Drone spawn in prep | On the same side of the building as the attacker's **first** chosen spawn [Y5S1] | same | same | same | same |
| Change spawn / operator during prep | yes: attacker repick of operator, loadout and spawn [Y7S1; Y5S1] | yes | UNVERIFIED | UNVERIFIED | yes |
| Defender spawn | At the chosen objective (Fandom Planning Phase describes deploying after selection). The exact spawn points per site are map data; see research/oregon/. | same | same | same | same |

"Objective rotation" is defined in the 2018 Pick & Ban dev blog as follows. *Rounds Played*: "if a team wins an objective, they must play X number of rounds on other objectives to be able to play it again". *Rounds Won*: "must win X number of rounds on other objectives" before replaying it.

---

## 8. Prep restrictions, runouts, spawn-peek, spawn-kill protection

| Rule | Value / behaviour | Source |
|---|---|---|
| Defenders in prep | Cannot leave the building. Invisible "red walls" block both players and thrown gadgets. | Fandom patch 1.3; patch fixes for gadgets thrown outside during prep; r6siegecenter |
| Attackers in prep | Only drones are in play. Operators spawn when action starts. | Fandom Drone / Planning Phase |
| Friendly fire in prep | **Off** in matchmaking. Custom has a toggle (`Friendly fire in Prep Phase`). | Solar Raid [Y7S4]; rulebook |
| **Runout detection** (action phase) | A defender outdoors for **1 s** becomes **Detected**. A debuff icon on the HUD replaced the old countdown text. Was 2 s before Y5S4. | Official Neon Dawn [Y5S4] |
| What detection reveals | The defender's **live position is shown to all attackers until they go back inside or die** (third-party guide). There is an "Enemy Detected Outside" message, and runout markers stick to the screen edge [Y7S4]. | r6siegecenter; Fandom patch 5.2; Solar Raid |
| What counts as "outside" | Authored zones per map; many patches fix individual doorframes and ledges. Defender **devices** placed outside are also flagged ("Devices are detected outside…" bug fixes). UNVERIFIED: exactly what a detected device shows. | Y8S2.3 / Y8S3.2 patch notes |
| Defender cameras and drones outdoors | Valkyrie Black Eye, Maestro Evil Eye and Bulletproof Camera **lose signal after 10 s** outdoors. Echo and Mozzie drones get 10 s outside. | High Calibre [Y6S4]; Demon Veil [Y7S1] |
| Window ledges | Players can no longer stand on window ledges (to cut spawn-peeking). Vaulting and hot-breaching through windows still work. | Y9S4 patch notes addendum |
| Defender spawn-peek | Allowed from action start by shooting out of the building; there is no timer. It is limited by map design (spawn cover and sightline fixes across many patches). | many map patch notes |
| Attacker spawn-peek (shooting in from outside) | No restriction found in any source | — |
| Attacker spawn-kill protection | **Ranked/Unranked: none, except map design.** **Quick Match: "Attacker Safeguard"** gives 10 s invulnerability at action start; it ends early if the attacker enters the building. Red walls are also extended **10 s** into action for defenders. Still active after Y10S2: UNVERIFIED (no removal notice found). | Y8S3 designer notes; Heavy Mettle |
| Esports rule (not a mechanic) | Killing an opponent in the first **2 s** of the action phase is "spawnkilling" and is penalised | 2026 BLAST rulebook |

---

## 9. Drones and cameras (brief — see intel.md)

| Item | Value | Source |
|---|---|---|
| Drones per attacker | **2** standard drones. The first is auto-deployed at prep start from the chosen spawn side; the second is thrown later. Some operators differ (e.g. Twitch drives a standard drone in prep since Y6S3); see the operator files. | Fandom Drone; Crystal Guard |
| Drone jump | Has a jump. Cooldown **~3 s** (Fandom; UNVERIFIED for Y11S3). Jump-trajectory preview and "sticky" landings were added in Y9S4. There is a speed-boost resource [Y9S3]. | Fandom Drone; Collision Point; Twin Shells |
| Durability | Destroyed by any damage except fall damage | Fandom Drone |
| After death | The owner can still use their own drones | Fandom Drone |
| Default cameras on Oregon | count and positions: **see research/oregon/** (UNVERIFIED here) | — |

---

## 10. Team-wide resources per playlist (brief — see destruction.md)

| Resource | Ranked / Unranked | Quick Match | 1v1 Arcade | 3v3 Arcade | Custom |
|---|---|---|---|---|---|
| Reinforcement pool (shared by defenders) | **10** [Y5S3; still the Fandom value] | 10 (UNVERIFIED), plus **pre-setups**: 2 designed sets per bombsite with pre-placed reinforcements and rotation holes [Y8S3], "reduced amount" in Y10S2 | **6** in v2 (**10** in v1), official | UNVERIFIED | UNVERIFIED (not in the rulebook settings list) |
| Defuser | 1 | 1 | 1 | 1 | 1 (`Defuser Carrier Selection` On/Off) |
| Drones | 2 per attacker | 2 | UNVERIFIED | UNVERIFIED | 2 |
| Operator bans | up to 3 per side per half | none | v1: 1 per round; v2: none | none | configurable |
| Gadget / drone scaling for small teams | — | — | **No scaling published** apart from the reinforcement pool (6) | **No scaling published** (UNVERIFIED) | — |

---

## 11. Team size, matchmaking, abandons, reconnects

| Rule | Value | Source |
|---|---|---|
| Team size | 5v5 in Ranked, Unranked and Quick Match. 1v1 and 3v3 in the Arcade modes. | — |
| Ranked 3.0 [Y11S2] | Hidden MMR removed ("your skill is your rank"). Matchmaking uses rank, squad size, time and location. Squadmates must be within **3 ranks** of each other (2 for Diamond/Champion). **5 placement matches** each season. Champion I–V divisions. | Official System Override |
| Legend Division [Y11S3] | Solo-queue only. Needs current Champion rank, Platinum last season, good reputation, and ShieldGuard security requirements on PC. | Official Split Fire |
| Leaving Ranked | Counts as a **loss** (Fandom). Abandon penalties are shared between Ranked and Unranked [Y4S3]. Other playlists stay locked while the abandoned match is still running [Y4S3]. | Fandom; Ember Rise |
| Penalty size (current) | Since Y11S2, based on **time spent away from the match** rather than a fixed penalty. Queue penalties scale with negative "units" in the Reputation Center's Abandon action. Older values (30 min first offence, escalating, 7-day escalation cooldown [Y6S2]) are **outdated/UNVERIFIED**. | System Override; North Star; Fandom |
| Reconnect | Disconnected players can rejoin the ongoing match (Fandom). Y11S3.1 fixed squads being unable to reconnect. The rejoin window is UNVERIFIED. | Fandom Ranked; Y11S3.1 notes |
| Surrender [Y11S3] | A team may start a surrender vote if it is **down in rounds** or a teammate has been **disconnected for at least 6 minutes** ("updated to match the new abandon timing"). The vote threshold is UNVERIFIED. | Official Split Fire |
| Match cancellation (Ranked) | Available when team sizes are unbalanced at match start. The vote opens during prep and a majority cancels [Y5S2]. A vote held at the end of round 1 cancels before round 2 [Y8S1]. A detected cheater being banned cancels automatically [Y9S4]. Since Y11S1, if a team causes the cancellation, its disconnected players get abandon + queue penalties, and the abandoner **and their squad** take a match loss. | Steel Wave; Commanding Force; Collision Point; Silent Hunt |
| Quick Match | Players can leave and **join in progress** (Fandom QM, older). Abandon penalties in QM: UNVERIFIED. | Fandom QM |
| 3v3 Arcade | **No quitting penalties** (siege.gg) | siege.gg |
| Unranked | No vote-to-cancel on abandons (Fandom Unranked, older) | Fandom |

---

## 12. Arcade specifics

### 1v1 Arcade

| Setting | v1 (Y11S1, 2026-04-16 → ~04-30) | v2 (Y11S2.2, from 2026-07-14/16, two weeks) |
|---|---|---|
| Team size | 1v1, online matchmaking | 1v1. Matchmaking now uses the **Ranked skill table**; new players get an initial estimate. |
| Mode | Bomb, "same ruleset as Bomb mode" | Bomb |
| Maps | House, Clubhouse, **Oregon** (siege.gg) | Clubhouse, **Oregon**, Coastline, Consulate, Outback (House removed; 5 maps) |
| Rounds | max 7, first to 4 (siege.gg) | not changed in the notes. Assume max 7, first to 4. |
| Role swap | UNVERIFIED | UNVERIFIED |
| Prep | 30 s | **15 s** |
| Action / plant / fuse / disable | UNVERIFIED (Bomb ruleset → 180 / 7 / 45 / 7) | UNVERIFIED |
| Site | UNVERIFIED | **revealed at round start** |
| Operators | All except shield operators Montagne, Blackbeard, Blitz, Clash (siege.gg) | "Every Operator can be played, except Montagne, Blackbeard, Blitz, and Clash" (official) |
| Bans | one operator ban each round | none. **Attrition**: "winning players can no longer select the Operator they used in the previous round" |
| Reinforcements | pool of **10** | pool of **6** |
| Drones / gadgets | no scaling published: UNVERIFIED | same |

### 3v3 Arcade (Y11S3, 2026-09-08 → 09-21)

| Setting | Value | Source |
|---|---|---|
| Team size | 3v3 (squad up with 2 friends) | official |
| Mode | Bomb | official |
| Maps | Villa, Clubhouse, Chalet, Kafe Dostoyevsky, **Oregon**, Border | siege.gg |
| Rounds | "7 rounds max (first team to win 4 out of 6 …, with 1 overtime round if needed)" | official |
| Role swap | before round 4 | siege.gg |
| Prep | **30 s** | official |
| Action / plant / fuse / disable | UNVERIFIED (assume 180 / 7 / 45 / 7) | — |
| Operators | "All Attackers and Defenders are available." No bans. | official |
| Attrition | **Official:** "teams cannot play an Operator again after winning a round with them." **siege.gg (conflicting):** "Once it has been played, that operator is blocked for the next two rounds." → **Chosen: official wording.** | official; siege.gg |
| Reinforcements / drones / gadgets | UNVERIFIED (no scaling published) | — |
| Penalties | none for quitting | siege.gg |
| Known bug | "If players pick the same Operators in 3v3 Arcade, the game crashes when a match finishes." This suggests duplicate picks were possible in some form. UNVERIFIED what it means. | Y11S3 patch addendum |

### Custom 1v1 presets (permanent, since Y9S3)
- **Short Match:** 6 rounds, first to 4; 1 OT round; **role swap every round**; any map; Bomb.
- **Long Match:** 14 rounds, first to 8; 3 OT rounds; role swap every round; any map; Bomb.

---

## 13. Custom Game settings (official names, from the 2026 esports rulebook)

| Group | Setting | Pro League value |
|---|---|---|
| Match | HUD Settings | Pro League |
| Match | Game Mode | Bomb |
| Match | Ban Phase | Pro League |
| Match | Ban Timer | 20 |
| Match | Number of rounds | 12 |
| Match | Attack/Defense Role Swap | 6 |
| Match | Overtime Rounds | 3 (or Infinite) |
| Match | Overtime score difference | 2 |
| Match | Overtime role Change | 1 |
| Match | Objective rotation parameter | 2 |
| Match | Objective type for rotation | Rounds played |
| Match | Pick Phase timer | 15 |
| Match | Operator HP | 100 |
| Match | Friendly fire damage | 100 |
| Match | Friendly fire in Prep Phase | Off |
| Match | Reverse Friendly Fire | Off |
| Match | Injured | 20 |
| Match | Sprint | On |
| Match | Lean | On |
| Match | Death Duration | 2 |
| Match | Death Replay | Off |
| Match | Tactical Timeout Requests Available per Team | 1 |
| Match | Allow Requests From | Everyone |
| Match | Timeout Duration | 45 |
| Match | Role Swap Timeout | On |
| Match | Role Swap Timeout Duration | 120 |
| Game mode | Plant Duration | 7 |
| Game mode | Defuse Duration | 7 |
| Game mode | Fuse Time | 45 |
| Game mode | Defuser Carrier Selection | On |
| Game mode | Preparation | 45 |
| Game mode | Action | 180 |

Other known Custom options:
- Map ban toggle (Fandom).
- Input Device, to allow mouse and keyboard [Y11S2.2].
- Online vs local server.

The meaning of "Injured 20" is UNVERIFIED; probably DBNO HP, so see core_mechanics.md.

---

## 14. Suggested seed values for `data/modes/*.json` (verified flags inline)

```json
{
  "ranked":   {"rounds_regulation": 6, "win_at": 4, "swap_after_round": 3, "ot_trigger": [3,3], "ot_max_rounds": 3, "ot_win_at": 5, "ot_swap_every_round": true,
               "ban_timer_s": 15, "bans_per_team_per_round": 1, "ban_stack_max_per_side": 3, "bans_reset_on_swap": true, "ot_reapply_bans": true,
               "map_ban": true, "site_select": "defender_vote", "attacker_spawn": "individual",
               "op_pick_s": "UNVERIFIED(30?)", "prep_s": 45, "action_s": 180, "plant_s": 7, "fuse_s": 45, "disable_s": 7,
               "runout_grace_s": 1, "attacker_safeguard_s": 0, "reinforcement_pool": 10, "drones_per_attacker": 2},
  "unranked": {"_same_as": "ranked", "map_ban": false},
  "quick_match": {"rounds_regulation": 4, "win_at": 3, "swap_after_round": 2, "ot_trigger": [2,2], "ot_max_rounds": 1,
               "bans": false, "site_select": "random_revealed_to_attackers", "op_pick_s": 20, "op_pick_no_swap_s": 15,
               "prep_s": 45, "action_s": 180, "plant_s": 7, "fuse_s": 45, "disable_s": 7,
               "attacker_safeguard_s": 10, "red_wall_extension_s": 10, "pre_setups": true, "_verified_note": "round count Fandom-only; safeguard status post-Y10S2 UNVERIFIED"},
  "arcade_1v1": {"team_size": 1, "rounds_regulation": 6, "win_at": 4, "ot_max_rounds": 1, "bans": false, "attrition": "winner_cannot_reuse_last_operator",
               "prep_s": 15, "site_select": "revealed", "reinforcement_pool": 6, "excluded_operators": ["shield operators"], "action_s": "UNVERIFIED(180)"},
  "arcade_3v3": {"team_size": 3, "rounds_regulation": 6, "win_at": 4, "swap_after_round": 3, "ot_max_rounds": 1, "bans": false,
               "attrition": "team_cannot_reuse_operator_after_winning_round_with_it", "prep_s": 30, "action_s": "UNVERIFIED(180)", "reinforcement_pool": "UNVERIFIED"}
}
```

---

## 15. Findings that contradict or refine PLAN.md

1. **Unranked has Pick & Ban in Siege.** Since Y10S2, Unranked is "an exact copy of Ranked" including Pick & Ban and defender site voting; only the map ban is missing. PLAN §6.2 sets Unranked Pick & Ban to *off*. That is fine as a design choice, but it is not Siege-accurate.
2. **Siege's ban cadence is per round and stacking.** It is 1 ban per team per round, up to 3 per side per half, reset at the swap, and reused in OT. PLAN's "1 operator per side" default is necessary for a 6-operator roster, but it differs from Siege.
3. **Phase order.** Siege runs ban → site/spawn selection → operator pick. Attackers can repick operator, loadout and spawn during prep. PLAN §6.3 lists operator select before spawn/site.
4. **"Standard" no longer exists** (removed in Y10S2). Quick Match is a separate casual ruleset with 4 rounds (first to 3), random revealed sites, pre-setups and a 10 s attacker safeguard. PLAN has no Quick Match preset.
5. **1v1 matches PLAN's fallback.** Siege's 1v1 is first to 4 (max 7) with a 15 s prep. However, Ubisoft gave 1v1 a **reinforcement pool of 6** (10 in v1). PLAN's formula `round(10 × defenders / 5)`, minimum 2, gives **2** for one defender. Consider 6 as the 1v1 default.
6. PLAN's "Ranked: defenders pick site" is correct: it is a team **vote**, with ties broken at random (UNVERIFIED for site votes; confirmed for ban votes).

---

## Open questions
- **Operator pick timer in Ranked/Unranked (Y11S3):** is it still 30 s? And are site selection (defenders) and spawn selection (attackers) separate timed screens? If so, how long is each? Ulo could time one Ranked/Unranked round start.
- **Map ban vote timer** in Ranked: how many seconds?
- **Overtime sides in Ranked:** in round 7, does the team that attacked first attack or defend? (Rule: after 3–3, whether sides swap going into round 7.)
- **Site repeat rule in Ranked:** after defenders win on a site, is that site locked? For how many rounds, and is it counted by rounds played or rounds won?
- **Quick Match (Y11S3):** is it still 4 rounds, first to 3, with 1 OT round, and a swap after round 2? Is the operator pick still 20 s (15 s without a swap)? Is Attacker Safeguard (10 s invulnerability) still active? How many pre-placed reinforcements per site, and what is the pool on top?
- **3v3 and 1v1 Arcade:** action phase length, role-swap pattern (1v1), reinforcement pool (3v3), whether the site was revealed (3v3), and whether drones or gadgets were scaled. (Ulo may remember from playing.)
- **3v3 attrition wording:** official says "cannot play an Operator again after winning a round with them"; siege.gg says "blocked for the next two rounds". Which matched the game?
- **DBNO at round end:** if every remaining player on a team is DBNO, does the round end immediately?
- **Runout reveal:** does a detected defender show as a continuously updating marker (third-party claim), or as periodic pings? What do defender **gadgets** placed outside reveal?
- **Round-end, replay and role-swap intermission durations** in current matchmaking.
- **Surrender vote:** how many votes are needed, and when is it available?
- **Abandon:** the current penalty durations and the reconnect grace window (the "6 minutes" in the surrender rules may be the abandon threshold).
- **Noor:** unbannable for the first 2 weeks of Y11S3?
- **Default camera count on Oregon:** answered by the Oregon/intel research, not here.

## Sources
Official (Ubisoft):
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/seasons/splitfire — 3v3 Arcade rules (rounds, prep 30 s, attrition, no bans), surrender and abandon timing, QM minimap, Legend Division
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/6HzsdnbOYovXelORy4mB7z/y11s3-patch-notes-addendum — 3v3 duplicate-operator crash fix
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes — squad reconnect fix (Y11S3.1)
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/3IoMKS8f3AHlOwBQXfiytt/y11s22-midseason-patch-notes — 1v1 Arcade v2 settings (attrition, shield exclusions, prep 15 s, site revealed, reinforcements 10→6, map pool)
- https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1838407329257158 — "Mid-Season Update" (official Steam post): 1v1 v2 attrition wording, Ranked skill-table matchmaking, 5-map pool
- https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1836506165562804 — Community Checkpoint #3: Ranked 3.0 and 1v1 return details
- https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1830163047257663 — Community Checkpoint #2: Ranked 3.0 map-ban structure (2 competitive / 1 showcased / 2 seasonal)
- https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1842846814455551 — 3v3 Arcade dates (Sep 8–21)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/systemoverride — Ranked 3.0, abandon penalties based on time away, map ban pools
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/silenthunt — 1v1 Arcade intro ("same ruleset as Bomb"), Ranked match-cancellation penalties
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/daybreak — new Pick & Ban system, Unranked return ("exact copy of Ranked"), QM action 180 s / prep 45 s, fewer pre-setups, CL unlocks
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/highstakes — mid-match tactical timeouts, Custom role-swap breaks
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/tenfoldpursuit — Ranked matchmaking parameters
- https://www.ubisoft.com/en-au/game/rainbow-six/siege/news-updates/2Btj0mP7e7gVKIODGSLuiX/y8s3-designers-notes — QM op pick 20/15 s (from 30), QM prep/action at the time, pre-setups, Attacker Safeguard, red-wall extension, Standard rules
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/heavymettle — Attacker Safeguard description, Standard playlist
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/neondawn — runout detection 2 s → 1 s, debuff icon; defuser no-drop zone
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/crimsonheist — QM round 3 min, QM plant/defuse 7 s (from 5), carrier selection, QM map pool
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/crystalguard — individual attacker spawn in all playlists
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/demonveil — attacker repick during prep; Echo/Mozzie drones 10 s outside
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/voidedge — drone spawn side, abandon escalation
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/shadowlegacy — reinforcement pool of 10, original map ban
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/steelwave — Ranked match cancellation
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/commandingforce — cancellation vote timing, 2-week unbannable new operator
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/dreadfactor — Fenrir unbannable for 2 weeks
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/deadlyomen — Deimos unbannable for 2 weeks
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/collisionpoint — drone jump trajectory and sticky landings; auto-cancel on cheater ban
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/twinshells — Custom 1v1 presets; drone speed boost
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/solarraid — FF off in prep, runout markers
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/highcalibre — outdoor camera signal loss 10 s; operator autopick when AFK
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/northstar — manual defuser pickup; abandon cooldown 7 days
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/emberrise — Unranked origin; abandon sharing and lockout; idle defuser drop
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/phantomsight — no draws; simultaneous-death rule; 3-round rotations in Ranked
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/brutalswarm — map ban shows 5 maps; tactical map objective list
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/burnthorizon — Casual: defenders know sites before operator pick; individual spawns
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/shiftingtides — QM AA-DD role swap
- https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1784506359218198 — Y9S4 addendum: window-ledge blocker against spawn-peeks
- https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/2394104918720190090 — 2018 Pick & Ban dev blog: ban → site/spawn → pick order; objective rotation definitions
- https://staticctf.ubisoft.com/p0f8o8d25gmk/4vLmovz8mJb3XUEdtHZBJA/1227a0d321ed95d3564499afb713c9d5/Global_Rulebook_BLASTR6_Season_2026_Kickoff_Update_v2.pdf — official Custom Game setting names and Pro League values (plant 7, defuse 7, fuse 45, prep 45, action 180, pick 15, ban 20, OT settings), pro ban flow, 2 s spawnkill rule, hatch-defuser mechanic

Fandom wiki (MediaWiki API):
- https://rainbowsix.fandom.com/wiki/Pick_and_Ban — Siege X ban voting, 15 s timer, stacking/reset/OT flow
- https://rainbowsix.fandom.com/wiki/Map_Ban — map ban voting mechanics
- https://rainbowsix.fandom.com/wiki/Bomb_(Siege) — plant/disable 7 s (+0.5 s), fuse 45 s, win conditions, defuser rules
- https://rainbowsix.fandom.com/wiki/Ranked — first to 4, OT first to 5, swap at round 4 and every OT round, defender site vote, leaving counts as a loss, reconnect
- https://rainbowsix.fandom.com/wiki/Unranked — same rules as Ranked, defender site vote, swap rules
- https://rainbowsix.fandom.com/wiki/Quick_Match — 4 rounds + 1 OT, swap at round 3, random sites, join in progress
- https://rainbowsix.fandom.com/wiki/Drone — 2 drones, first auto-deployed in prep, ~3 s jump cooldown
- https://rainbowsix.fandom.com/wiki/Reinforcement — shared pool of 10
- https://rainbowsix.fandom.com/wiki/Arcade, https://rainbowsix.fandom.com/wiki/1v1_Arcade, https://rainbowsix.fandom.com/wiki/3v3_Arcade — Arcade dates and playlist status
- https://rainbowsix.fandom.com/wiki/Planning_Phase — prep phase description
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.3.0, .../Patch_11.2.2, .../Patch_11.1.0 — mirrors of the official notes
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_1.3 — red wall during prep
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_5.2.1 — runout timer consistency (2 s at the time)

Third-party:
- https://siege.gg/news/rainbow-six-siege-3v3-arcade-game-mode-everything-you-need-to-know — 3v3 map pool, swap before round 4, no quit penalties, conflicting attrition wording
- https://siege.gg/news/rainbow-six-siege-gets-new-1v1-playlist — 1v1 v1 maps, prep 30 s, ban each round, max 7 rounds / first to 4
- https://siege.gg/news/best-operators-to-play-1v1-matches-in-rainbow-six-siege — shield operators locked in 1v1 v1
- https://siege.gg/news/ranked — no operator overlap within a team; "defenders can't defend a site that has already been won"
- https://siege.gg/news/ubisoft-to-change-operator-ban-phase-in-rainbow-six-siege-x — per-round ban explanation
- https://r6siegecenter.com/guides/defense/spawn-peeks-runouts/ — runout: live position revealed to all attackers until back inside or dead; no runouts in prep
- https://steamcommunity.com/sharedfiles/filedetails/?id=1993065393 — 2020 match-timing breakdown (marked outdated), used only for round-end/intermission estimates
- Liquipedia — not used (rate-limited; access blocked from this environment)
