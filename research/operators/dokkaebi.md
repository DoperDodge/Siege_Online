# Dokkaebi — operator research (post-remaster, "Jegeo Payload")
Verified against: Y11S3 (Operation Split Fire, incl. Y11S3.1 patch of 2026-09-22) — researched 2026-09-29
Confidence: high for loadout, ratings and the Jegeo Payload numbers Ubisoft published (charges, refill, duration, damage, fire time, cooldown, Y11S3 connection rules). Medium/low for mechanics Ubisoft never quantified (reset time, fire damage/radius, what exactly counts as "identified", what exactly breaks the "connection").

> **Outdated-guide warning:** Anything describing the **Logic Bomb** (call all defenders; 2 charges; unlimited camera access after hacking one dead defender's phone at close range) is obsolete since **Y11S2 System Override (2026-06-02)**. Liquipedia's Dokkaebi page is still pre-remaster (Logic Bomb, Stun Grenades, no XK23). Fandom's page is post-remaster but still shows Impact EMP instead of Breach Charge (not updated for Y11S3).
> **Correction to PLAN.md §11.1:** her weapons are **BOSG.12.2 / Mk 14 EBR / XK23** (primaries) and **C75 Auto / Gonne-6 / SMG-12** (secondaries). Gadgets are **Smoke Grenade / Breach Charge** only.

---

## 1. Identity and base stats

| Field | Value | Source |
|---|---|---|
| Side | Attacker | Ubisoft operator page |
| Real name | Grace Nam | Ubisoft operator page |
| CTU | 707th SMB (South Korea) | Ubisoft operator page |
| Squad | Viperstrike | Ubisoft operator page |
| Specialties (official) | INTEL, Front Line | Ubisoft operator page |
| Health rating | **1** | Ubisoft operator page (1 of 3 stars active) |
| Speed rating | **3** | Ubisoft operator page (3 of 3 stars) |
| Difficulty | 2 of 3 | Ubisoft operator page |
| Rating history | 3 speed / 1 health since patch 7.4.0 (2022-12-06). It was 2/2 before that | Fandom patch history |
| Introduced / remastered | Y2S4 White Noise (2017) / **Y11S2 System Override (2026-06-02)** | Fandom; Ubisoft System Override page |

## 2. Loadout (current, from the official operator page)

### Primary weapons
| Weapon | Class | Recent changes |
|---|---|---|
| BOSG.12.2 | Shotgun (slug) | none Y10S2–Y11S3.1 |
| Mk 14 EBR | Marksman Rifle | **Y11S3: damage 56 (from 60)**; first-shot multiplier on M&K 3.5 (from 1.8); **Muzzle Brake removed** |
| XK23 | Assault Rifle (bullpup) | **New in Y11S2** (also given to Rauora and Sens). Official launch stats: full auto, **49 dmg, 675 RPM, 35-round mag × 5 mags = 175 total, reload 3.5 s**, "Medium" destruction (doesn't destroy studs). Extended Barrel raises damage to 54. Attachments: iron/sight/magnified; vertical/angled/horizontal grip; muzzle brake/compensator/flash hider/suppressor/extended barrel; laser |

### Secondary weapons
| Weapon | Class | Recent changes |
|---|---|---|
| C75 Auto | Machine Pistol | none |
| Gonne-6 | Hand Cannon | none |
| SMG-12 | Machine Pistol | **Y11S3: damage 16 (from 28), mag 22 (from 32), max ammo 111 (from 129)**. Both totals are 5 mags + 1 chambered (22×5+1 = 111; 32×4+1 = 129). Also used by Vigil and Warden |

Full weapon stats are in `research/weapons.csv`.

### Secondary gadgets
| Gadget | Count | Notes / source |
|---|---|---|
| Smoke Grenade | 2 (Fandom) | Official page lists it |
| Breach Charge | 3 (generic count per Fandom — **UNVERIFIED for Dokkaebi**) | **Added Y11S3**, replacing Impact EMP. Reason: an EMP on a target could interrupt her own payload connection |
| ~~Impact EMP Grenade~~ | — | **Removed Y11S3** |
| ~~Stun Grenade~~ | — | **Removed Y11S2** |

## 3. Unique ability: Jegeo Payload (제거 = "elimination")

In-game description (per Fandom): *"Malware uploaded to Enemy devices that disables their access to Observation Tools. Affected devices then explode."*

### 3.1 Numbers
| Parameter | Value | Source / status |
|---|---|---|
| Starting charges | **1** | Y11S2 DN |
| Max charges | **5** | Y11S2 DN |
| Charge refill time | **25 s** (per charge) | Y11S2 DN |
| Targeting | Only a **valid target**: "identified operators". Ubisoft: "uses a targeting system just like Deimos uses for his DeathMark tracker". Deimos's tracker needs the enemy "spotted by either himself or a teammate" | Y11S2 DN; Ubisoft news (System Override); Y11S2 DN (Deimos) |
| Targets per activation | **1 defender** | Ubisoft news (System Override) |
| Payload duration (time the target has to react before the phone explodes) | **7 s** (official "Duration: 7 seconds"). Community reports: "7 to 8 s" (Gamingtrend preview, allthings.how); "6 s" (siege.gg, Test Server) | Y11S2 DN (chosen) |
| Cooldown | **14 s per target** since Y11S2.2 (2026-07-14). It was a 7 s *global* cooldown in Y11S2.1, and none at launch. Fandom reads it as: after a target dismisses the call, Dokkaebi can't call that defender again for 14 s | Y11S2.2 DN + patch notes; Fandom |
| Explosion damage | **40 HP explosive damage** to the phone's carrier | Y11S2 DN; Ubisoft op page |
| Fire zone | Spawns an **area of fire for 5 s** where the target stood. Official: "can damage other nearby Operators". Fire DPS **UNVERIFIED**. Fire radius **UNVERIFIED** | Y11S2 DN; Ubisoft op page |
| Phone loss | If the phone explodes, the target **can't use observation tools** (cams, etc.) "until they are eliminated or until the next round" | Ubisoft news (System Override); Y11S2 DN |
| Phone-dependent gadgets | Lost for the round if the phone explodes. Official examples: Mozzie (Pests), Maestro (Evil Eye), Echo (Yokai), Fenrir (can't interact with his mines), **Skopós (can't switch shells)** | Ubisoft news (System Override) |
| Defender counter: reset | The target can reset/dismiss the call. Ubisoft: calls are "faster to dismiss" than the Logic Bomb's. Exact reset time **UNVERIFIED** (allthings.how says about 1.5 s; the old Logic Bomb reset was a 5 s animation per Fandom) | Ubisoft news; allthings.how |
| Audio | "Phone buzz sound updated for clarity and urgency". The ringtone "sounds more urgent and increasingly angry". The explosion is loud and gives away location | Y11S2 DN; Ubisoft news |
| Activation UI | Uses her tablet: open it, cycle through identified defenders, send the payload to one | Ubisoft news (Deimos-like); Gamingtrend preview (UNVERIFIED UI details) |

### 3.2 Y11S3 "continuous connection" rules (live now)
| Rule | Detail | Source |
|---|---|---|
| Constant connection | "Requires constant connection between Dokkaebi and the target to progress." | Y11S3 DN |
| Interruption | "Interrupting the connection automatically cancels the payload upload." A cancelled upload does not explode the phone | Y11S3 DN; Ubisoft Split Fire page |
| Tablet state | "The tablet is always active during the upload." It stays **detectable by electronics detectors** (e.g., Solis's SPEC-IO; IQ per community). Ubisoft news: "Tablet must remain active throughout Jegeo Payload upload" | Y11S3 DN; Ubisoft news (Split Fire); mp1st |
| What interrupts it (official) | **Mute's Signal Disruptors** ("now interruptable by Mute Jammers"); **eliminating Dokkaebi**; an **EMP effect on the target's phone** (the stated reason her own Impact EMPs were removed). The Community Checkpoint also names **Tubarão** (Zoto Canister) | Y11S3 DN; Ubisoft news (Split Fire); Community Checkpoint recap |
| Before Y11S3 (Y11S2 behavior, outdated) | Standing inside a jammer before the payload was sent made a defender immune, but once sent, jammers could **not** stop the timer; only a manual reset did | Gamingtrend preview; allthings.how |
| Does the upload window equal the 7 s "Duration"? | Probably, but Ubisoft doesn't say — **UNVERIFIED** | — |
| Must Dokkaebi hold the tablet out (unable to shoot) for the whole upload? | Implied by "tablet always active", not stated outright — **UNVERIFIED** | — |

Suggested state machine for implementation (this is an inference; verify the parts marked UNVERIFIED):
`IDLE → (target identified ∧ charge ≥1 ∧ target not on per-target cooldown ∧ target not jammed) → UPLOADING (tablet active; 7 s) → [target resets → CANCEL; target within Mute radius / Zoto / EMP'd → CANCEL; Dokkaebi dies → CANCEL] → DETONATE (40 dmg, 5 s fire, target.phone_destroyed = true)`. Per-target cooldown 14 s begins after the attempt (exact trigger UNVERIFIED).

### 3.3 Camera hacking (dead defenders' phones) — she still has this
| Parameter | Value | Source |
|---|---|---|
| What | Hack the phone of an **eliminated** defender to get access to defender cameras for the attacking team | Ubisoft news (System Override); Fandom |
| Range | **Infinite, no direct line of sight needed.** She no longer has to walk up to the dropped phone | Y11S2 DN; Ubisoft System Override page |
| Duration | **20 s** of access per hack (no longer permanent for the round) | Y11S2 DN |
| Hacks per round | **UNVERIFIED.** Siege.gg (Test Server) says "she can hack them twice a round" / "She has a second hack" | siege.gg |
| Which feeds | Pre-remaster Fandom list: default cams, Bulletproof Cameras (view only, no EMP burst), Valkyrie Black Eyes, Echo Yokai, Maestro Evil Eye, Mozzie-hacked drones. Whether the same list applies post-remaster is **UNVERIFIED** | Fandom (Original tab), Fandom BPC |
| Skopós | When a Skopós shell is destroyed, it drops a **circuit board** that works like a dropped phone | Fandom Skopós |
| Counter | Defenders can destroy dropped phones (any damage). Pre-remaster, phones were visible to Dokkaebi through walls | Fandom |

### 3.4 Other phone/camera interactions
- The old Logic Bomb effects (global buzz, blocking dead defenders' cams, "Mute makes you immune when it activates") **no longer exist**.
- When a phone explodes, the owner loses observation-tool access for the round (or until eliminated). So Jegeo is now also a camera-denial tool, one defender at a time.

## 4. Interactions with the other 11 roster operators

"Lesion" stands in provisionally for "Legion".

### 4.1 Defenders
| Defender | Interaction | Source / confidence |
|---|---|---|
| **Mute** (Signal Disruptor, radius **2.6 m** since Y11S2.3) | (a) A defender inside the radius can't have the payload landed on them. (b) **Since Y11S3 a jammer interrupts an upload in progress**, cancelling it. (c) Mute jams her **Breach Charges** (remote signal; also if Dokkaebi herself is in range) and her **drones** | Y11S3 DN; Ubisoft Split Fire news; Fandom Mute; Y10S4 DN |
| Mute | Y11S2.2 bug fix: Mute's jammer no longer disables the ACOG/Holo on the XK23 | Y11S2.2 patch notes |
| Mute | Can be targeted like any defender. If his phone explodes he loses cams; the jammers themselves are unaffected (they aren't phone-controlled) | inferred from Ubisoft affected-gadget list |
| **Pulse** | Target → loses cams. **Cardiac Sensor unaffected** (not phone-based; not in Ubisoft's list). Pulse can track Dokkaebi's heartbeat within **10.5 m** (Y11S2) while she uploads | Ubisoft news list (inferred); Y11S2 DN |
| **Mira** | Target → loses cams. Black Mirror unaffected. No direct gadget interaction | inferred |
| **Lesion** | Target → loses cams. Gu mines are mechanical (since Y8S3) and not phone-controlled → unaffected. Gu needles hit Dokkaebi like anyone else | Fandom Lesion; inferred |
| **Skopós** | Target → her phone explodes → **she can't switch between shells for the rest of the round** (official). Also: destroyed shells drop hackable circuit boards. Where the phone/explosion sits (active shell?) and whether the 40 dmg hits the shell: **UNVERIFIED** | Ubisoft news (System Override); Fandom Skopós |
| **Sentry** | Target → loses cams. Sentry's **Bulletproof Camera EMP burst** (fireable by any living defender) puts DSEG on Dokkaebi: sights disabled, can't trigger remote devices (her Breach Charges). Whether BPC EMP on Dokkaebi breaks a Jegeo upload is **UNVERIFIED**. Sentry's Observation Blocker blocks her drones' view, and likely the hacked camera view through it (inferred). Proximity Alarm detects her like any attacker | Fandom BPC; Y10S4 DN |

### 4.2 Attackers (teammates)
| Attacker | Interaction | Source / confidence |
|---|---|---|
| **Striker / Sledge** (Impact EMP) | An Impact EMP that hits the **target defender's phone** can **interrupt Dokkaebi's upload**. Ubisoft removed EMPs from her kit for exactly this reason, so teammates' EMPs very likely do the same — **UNVERIFIED for teammates** | Y11S3 DN (inference) |
| Striker / Sledge (Impact EMP) | Positive use: EMP a Mute jammer protecting a target (disables it temporarily), then send the payload | Fandom EMP list (EMP disables Signal Disruptors) |
| **Brava** | Kludge Drone hacks defender electronics. No direct interaction with Jegeo. Both feed attacker intel | — |
| **Thermite / Fuze** | No direct interaction. The fire from an exploded phone could affect attackers pushing in — **UNVERIFIED** whether it damages attackers (Siege X makes fire team-neutral: the Daybreak page says "Like fire, it no longer differentiates which team you're on") | Ubisoft Daybreak page (context) |

### 4.3 Off-roster counters, for context only
Solis SPEC-IO and IQ detect the active tablet. Tubarão's Zoto Canister interrupts the connection. Vigil's ERC-7 (lore: helps avoid identification) — current mechanical interaction UNVERIFIED.

## 5. Change history

| Season / patch | Date | Change | Source |
|---|---|---|---|
| **Siege X — Y10S2 Daybreak** | 2025-06-10 | No Dokkaebi change. **Y10S2.2** (notes 2025-07-02): fixed Clash's CCE Shield blocking the Logic Bomb | Y10S2 DN; Y10S2.2 patch notes |
| **Y10S3 High Stakes** | 2025-09-02 | No balance change (added as a playable operator in Enlisted / Field Training AI playlists) | High Stakes page |
| **Y10S4 Tenfold Pursuit** | 2025-12-02 | Indirect: Mute rework (jammers "jam wireless signals"). Fix: Dokkaebi could get stuck in Observation Tool after hacking a phone | Y10S4 DN; Y10S4 addendum |
| **Y11S1 Silent Hunt** | 2026-03-03 | No change. Y11S1.2 fix: missing Logic Bomb SFX | Y11S1.2 patch notes |
| **Y11S2 System Override (remaster)** | 2026-06-02 | Logic Bomb → **Jegeo Payload** (1 start / 5 max / 25 s refill / 7 s duration / identified targets only / 40 HP explosion / 5 s fire / phone lost). Camera hack: infinite range, no LOS, 20 s. **XK23 added. Stun Grenades removed** (gadgets became Smoke / Impact EMP) | Y11S2 DN; System Override page |
| Y11S2.1 | notes 2026-06-23 | Jegeo **7 s global cooldown** added. Fix: tablet missing when accessing the network while prone | Y11S2.1 patch notes |
| Y11S2.2 (mid-season) | 2026-07-14 | Cooldown **per-target, 14 s** (from 7 s global). Fix: Mute jammer disabling XK23 ACOG/Holo | Y11S2.2 DN + patch notes |
| Y11S2.3 | 2026-08-04 | Indirect: Impact EMP radius 2.0 m (still in her kit then); Mute range 2.6 m | Y11S2.3 patch notes |
| **Y11S3 Split Fire** | 2026-09-01 | **Continuous connection** required; interruption cancels; tablet always active/detectable; jammers interrupt. **Impact EMP → Breach Charge.** Mk 14 EBR 56 dmg, first-shot M&K 3.5, no Muzzle Brake. **SMG-12 16 dmg / 22 mag / 111 max** | Y11S3 DN; Split Fire page |
| Y11S3.1 | 2026-09-22 | No Dokkaebi change | Y11S3.1 patch notes |

## 6. JSON-ready summary
```json
{
  "id": "dokkaebi",
  "side": "attacker",
  "health_rating": 1,
  "speed_rating": 3,
  "primaries": ["bosg_12_2", "mk14_ebr", "xk23"],
  "secondaries": ["c75_auto", "gonne6", "smg12"],
  "gadgets": {"smoke": 2, "breach_charge": "3 UNVERIFIED"},
  "ability": {
    "id": "jegeo_payload",
    "charges_start": 1, "charges_max": 5, "refill_s": 25,
    "targeting": "identified_defender_single",
    "duration_s": 7,
    "per_target_cooldown_s": 14,
    "explosion_damage": 40,
    "fire_duration_s": 5, "fire_dps": "UNVERIFIED", "fire_radius_m": "UNVERIFIED",
    "on_detonate": ["target_loses_observation_tools_for_round", "target_loses_phone_gadgets"],
    "requires_continuous_connection": true,
    "interrupted_by": ["mute_signal_disruptor", "tubarao_zoto", "emp_on_target", "dokkaebi_eliminated", "target_reset"],
    "tablet_detectable_during_upload": true,
    "target_reset_time_s": "UNVERIFIED"
  },
  "camera_hack": {"source": "eliminated_defender_phone", "range": "infinite", "needs_los": false,
                  "duration_s": 20, "uses_per_round": "UNVERIFIED"}
}
```

## Open questions
- **What exactly makes a defender "identified"?** Pinged or spotted once this round (like Deimos)? Seen on a drone? Does it wear off? A Custom Game with Dokkaebi would settle it.
- **Reset time:** how long does a defender take to dismiss the call? Can they move or shoot while doing it?
- **Upload timing:** is the 7 s "Duration" the same as the Y11S3 upload window? Does Dokkaebi have to keep the tablet in hand (no shooting) for the whole upload?
- **What counts as breaking the "continuous connection"** besides jammers, Zoto and death? Is there a range limit, or a line-of-sight or floor limit? Does it break when the target enters a jammer radius, or only when a jammer is already covering them?
- Does a **teammate's** Impact EMP (Striker/Sledge) on the target cancel Dokkaebi's upload? Does Sentry's Bulletproof Camera EMP burst on Dokkaebi cancel it?
- Fire zone: damage per second, radius, and whether it hurts attackers (Siege X fire is team-neutral).
- Does the 40 HP explosion ignore armor/health rating, and can it down (DBNO) or kill directly?
- Per-target cooldown: does it start on dismiss, on detonation, or on any attempt?
- Camera hack: how many hacks per round (siege.gg says 2)? Does each dropped phone allow one hack? Which feeds are included (Bulletproof Cameras, the Skopós inactive shell)?
- Skopós: where does the phone explode (active shell?) and does the 40 dmg hit the shell?
- Breach Charge count for Dokkaebi (assumed generic 3).

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/dokkaebi — ratings (H1/S3), CTU 707th SMB, squad Viperstrike, specialties, current loadout (BOSG.12.2, Mk 14 EBR, XK23; C75 Auto, Gonne-6, SMG-12; Smoke, Breach Charge), ability summary (40 HP, fire)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2MNhboDBmsQKkWb5p8zqsg/y11s2-designers-notes — Jegeo Payload numbers (1/5/25 s/7 s/40 HP/5 s fire), camera hack (infinite range, 20 s), XK23 added + stats, Stuns removed, Deimos "spotted" rule
- https://news.ubisoft.com/en-us/article/75JAC7c5Ka6wnsxMyq2Ylz/rainbow-six-siege-operation-system-override-dokkaebi-remaster-calypso-casino-map-and-ranked-30 — Deimos-like targeting, one defender per call, phone loss until eliminated/next round, affected phone-gadget operators incl. Skopós, remote camera hack
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/systemoverride — "gain access from a distance", loadout at Y11S2
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/7tAny5W9p4yrHmIiH51noI/y11s21-patch-notes — 7 s cooldown; prone tablet fix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/77rztlEyeqhZVqROCW0ZV7/designers-notes-y11s22-midseason-update — per-target 14 s cooldown and rationale
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3IoMKS8f3AHlOwBQXfiytt/y11s22-midseason-patch-notes — per-target cooldown; XK23 sight/jammer fix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2EIn06EmkAIG7su2fpITue/y11s23-patch-notes — Impact EMP 2.0 m; Mute 2.6 m
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/5NNUGjCRVGSuxpQxMHh5rM/rainbow-six-siege-community-checkpoint-recap-ranked-30-dokkaebi-updates-more — Mute and Tubarão to interrupt the signal in S3
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/PONCuRt8LaCr3O31NkBQb/y11s3-designers-notes — continuous connection, interruption cancels, tablet detectable (SPEC-IO), EMP→Breach rationale, Mk 14 EBR and SMG-12 changes
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/splitfire — Y11S3 Dokkaebi changes; Mk 14 first-shot multiplier numbers; SMG-12 numbers
- https://news.ubisoft.com/en-us/article/4qqpGJZSWrrS3Ko2hYvviK/rainbow-six-siege-operation-split-fire-new-operator-noor-3v3-arcade-mode-wasteland-circuit-event-and-more — "now interruptable by Mute Jammers", "Tablet must remain active throughout ... upload"
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes — no Dokkaebi change (checked)
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/3owjfmZ0uv2zFYU99TpkSw/y10s22-patch-notes — Clash CCE vs Logic Bomb fix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/7Ev8Ec9hPvcCC8Qn7zlotD/y10s4-patch-notes-addendum — Observation Tool stuck fix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes — Mute rework, DSEG consolidation
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/ivbm7sXcU7iG89d7wQtlx/y11s12-patch-notes — Logic Bomb SFX fix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/daybreak — Siege X: fire/electricity team-neutral
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/mute , /pulse , /mira , /lesion , /skopos , /sentry — defender loadouts (for interactions)
- https://rainbowsix.fandom.com/wiki/Dokkaebi — remaster description, 14 s per-target reading, phone-gadget list, pre-remaster Logic Bomb/camera-hack details, patch history (7.4.0 ratings)
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.3.0 , .../Patch_11.2.1 , .../Patch_11.2.2 , .../Patch_11.2.3 — patch cross-check; SMG-12 users (Dokkaebi, Vigil, Warden)
- https://rainbowsix.fandom.com/wiki/Mute — jammer protection vs Jegeo; remote devices jammed
- https://rainbowsix.fandom.com/wiki/Skopós — circuit board drop; EMP/shell interactions
- https://rainbowsix.fandom.com/wiki/Bulletproof_Camera — BPC EMP burst; attackers view BPCs via Dokkaebi hack
- https://rainbowsix.fandom.com/wiki/Lesion — Gu mines mechanical
- https://liquipedia.net/rainbowsix/Dokkaebi — checked; **outdated** (pre-remaster), not used for values
- https://gamingtrend.com/previews/dokkaebi-is-calling-and-you-better-answer/ — 7–8 s window; Y11S2 jammer only protects pre-send
- https://allthings.how/dokkaebis-jegeo-payload-and-xk23-explained-year-11-season-2/ — ~1.5 s reset claim (UNVERIFIED); pre-Y11S3 jammer behavior
- https://siege.gg/news/operation-system-override-dokkaebis-remaster-is-it-a-nerf-or-a-buff — Test Server claims (6 s window, 2 hacks/round) — UNVERIFIED
- https://siege.gg/news/rainbow-six-siege-to-nerf-dokkaebi-for-the-second-time-in-three-months-in-operation-split-fire — Y11S3 summary (jammer/Zoto counterplay)
- https://mp1st.com/title-updates-and-patches/rainbow-six-siege-split-fire-update-released-september-1-patch-3-46-1-000-151 — Y11S3 summary (IQ/Mute/Solis counterplay)
- https://www.hotspawn.com/rainbow-six/news/rainbow-six-siege-y11s3-release-date — Y11S3 summary cross-check
