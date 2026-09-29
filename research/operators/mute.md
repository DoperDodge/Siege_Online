# Mute
Verified against: Y11S3 (Operation Split Fire, incl. Y11S3.1 patch of 2026-09-22) — researched 2026-09-29
Confidence: medium-high on loadout, ratings, radius and the jam rule (all official). Medium on gadget-by-gadget interactions: the official rule is general, and the per-gadget list comes from Fandom plus inference from the rule. Jammer HP and deploy time are UNVERIFIED.

> **PLAN.md baseline is outdated in two ways.** (1) Since **Y10S4** Mute is **Health 2 / Speed 2** (was 3/1). (2) The Signal Disruptor **no longer disables "electronics" generally**. It now **jams wireless signals**: devices that must be activated or controlled remotely. Automated devices (e.g., Ace's SELMA and, per Fandom, Claymores) are **not** affected. Radius is **2.6 m** (Y11S2.3). The loadout in PLAN.md is correct.

## Identity
| Field | Value | Source |
|---|---|---|
| Side | Defender | Ubisoft operator page |
| CTU | SAS | Ubisoft operator page |
| Squad | Viperstrike | Ubisoft operator page |
| Specialties | Anti-Gadget, Crowd Control | Ubisoft operator page |
| Health rating | **2** (of 3) → **110 HP** (since Y10S4, was 3) | Ubisoft page (2 active stars); Y10S4 DN; HP mapping: Fandom "Armor and Speed" |
| Speed rating | **2** (of 3) (since Y10S4, was 1) | Ubisoft page; Y10S4 DN |
| Speed in m/s | UNVERIFIED here → use speed-2 value from `research/core_mechanics.md` | — |
| Difficulty | 1 (of 3) | Ubisoft operator page |
| Introduced | Launch operator ("Pathfinder") | Fandom |

## Loadout (official Ubisoft operator page, checked 2026-09-29)
| Slot | Options | Notes |
|---|---|---|
| Primary | **MP5K** (SMG), **M590A1** (shotgun) | — |
| Secondary | **P226 Mk 25** (handgun), **SMG-11** (machine pistol) | SMG-11 since Y3S4 |
| Secondary gadget (pick 1) | **Bulletproof Camera** (×1), **Nitro Cell** (×1) | Counts from Fandom |
| Unique ability | **GC90 "Moni" Signal Disruptor** | — |

No Mute weapon changes found in Y10S2–Y11S3.1 notes. Weapon stats go in `research/weapons.csv`.

## Unique ability: Signal Disruptor ("jammer")
| Property | Current value | Last changed | Source |
|---|---|---|---|
| Count | **4** per round | — | Fandom Mute; Liquipedia (search snippet); r6coaching 2026 guide |
| Placement | **Floors and flat horizontal surfaces only** (not walls). Official: "Device can be planted on floors" | — | Ubisoft operator page; Fandom |
| Deploy time | **3 s** (Fandom). Not in any official note, so treat as medium confidence | — | Fandom |
| Jam area | **Sphere, radius 2.6 m** (so it also reaches through the floor and ceiling above and below) | Y11S2.3 (was 2.475 m; spherical since Y6S3) | Y11S2.3 patch notes; Fandom Patch 6.3.0 |
| Warning radius | **4.875 m**. Attacker drones entering it get static as a warning | Y11S2.3 (was 4.75 m) | Y11S2.3 patch notes; Fandom |
| Visual feedback | Device lights up when active. AoE shown for **2.5 s** after deployment completes | Y6S3 | Fandom Patch 6.3.0 |
| Duration | Permanent until destroyed, disabled or picked up | — | Fandom / third-party guides |
| Pick up | Mute can retrieve and redeploy his jammers | — | Liquipedia snippet via search; third-party guides (medium) |
| Alliance | Jams **attacker** signals. Friendly devices unaffected. If **hacked by Brava** it flips and affects **defender** devices instead | — | Fandom Mute / Brava |
| HP / destruction | "Relatively fragile, destroyed by **any source of damage**" (bullets, explosives, melee). Twitch laser one-shots it. Exact HP UNVERIFIED (placeholder: 1 HP, i.e., one bullet) | — | Fandom Mute / Twitch |
| Reinforcement | Destroyed if placed too close to a wall that is then reinforced | — | Fandom |
| Electronic? | Yes. Detectable by IQ (non-roster). Disabled by EMP (Impact EMP / Thatcher). Hackable by Brava | — | Fandom |

### The current jam rule (Y10S4 rework, official)
- Y10S4 Designer's Notes: "Mute will be taken out of the DSEG effect. His effect will no longer be a permanent EMP around the jammers. Instead, it will affect **gadgets that have signals coming in or out of the radius**. For example: Thermite will still not be able to trigger an exothermic charge inside the radius of one of Mute's jammers, but one of Ace's SELMAs will not be affected because it is automated." Stat line: "Jams wireless signals (instead of disabling electronic gadgets)."
- Tenfold Pursuit season page: "now only jams wireless connections or devices that need to be activated remotely."
- Fandom (Fuze and Thermite pages): a remote device **cannot be activated if either the device or its operator is inside the radius**.
- **For implementation:** a remote action (detonate or control) linking operator O to device D is blocked if `dist(O, J) ≤ 2.6 m` **or** `dist(D, J) ≤ 2.6 m` for any active enemy-aligned jammer J. Automated or physical devices are unaffected.
- Optics are **not** affected. Y11S2.2 fixed a bug where the jammer disabled ACOG/Holo on the XK23. The "all optics" rule applies to EMP/DSEG, not to Mute.

## Interactions with the other 11 roster operators
| Attacker gadget | Jammed? | Details | Source / confidence |
|---|---|---|---|
| **Brava – Kludge Drone** | **Yes (drone)** | Kludge is stopped if it enters the radius (static, lost control). But Brava can **hack the jammer** from range (costs one Kludge hack charge). A hacked jammer stops jamming attackers and "affects Defender devices instead" (which defender devices, exactly, is UNVERIFIED). Y11S1.2 fixed jam static persisting on drones after the jammer was hacked | Fandom Brava/Thermite; Y11S1.2 patch notes |
| Brava – Claymore | **No** (post-Y10S4) | Automated laser trigger. Fandom's current counters list says jammers do not stop Claymores. Note: Y6S1 once made jammers jam Claymores, and the Y10S4 rework (automated devices unaffected) reversed that. Medium confidence | Fandom Mute (counters); Fandom Patch 6.1.0 (historic); Y10S4 DN |
| Brava / all – **drones** | **Yes** | Drone camera goes to static and control is lost inside 2.6 m. Static warning starts at 4.875 m. Attackers can still pick up their jammed drones. Works in prep phase too | Fandom; Y11S2.3; guide snippets |
| **Fuze – Cluster Charge** | **Yes, activation blocked** if Fuze **or** the charge is within radius (Fandom) | Remote-activated (electronic remote). **Caveat:** Y10S4.1 fixed a bug named "Mute's Signal Disruptor can deactivate Fuze's Cluster Charge". The intended nuance is unclear: maybe an already-triggered or drilling charge should not be cancelled. UNVERIFIED. Sub-grenades (4.2 m radius) destroy jammers they reach | Fandom Fuze; Y10S4.1 patch notes |
| Fuze – Breach Charge | **Yes** | Remote detonation | Fandom Breach Charge; Y10S4 rule |
| Fuze – **Hard Breach Charge** | **No** | Not remote: fuse starts when placed, detonates after 4 s. Designed with "no interaction with jammers". **A hard counter to anti-hard-breach Mute** | Fandom Hard Breach Charge |
| **Thermite – Exothermic Charge** | **Yes** | Cannot be activated if the charge **or** Thermite is in radius (official example). Workaround: breach an adjacent wall or floor that isn't jammed (charge blast ≈4 m, 220 HP damage since Y11S3.1) | Y10S4 DN; Fandom Thermite; Y11S3.1 |
| **Striker** – Breach Charge | **Yes** | Remote | as above |
| Striker – Hard Breach Charge | **No** | Fuse | Fandom |
| Striker – Claymore | **No** (post-Y10S4) | Automated | Fandom Mute |
| Striker – **Impact EMP** | n/a (counters Mute) | **Disables the jammer** (DSEG) for the EMP duration. 2 m radius (Y11S2.3). EMP grenades themselves are unaffected by jammers | Fandom EMP/Thatcher; Y11S2.3 |
| Striker – Frag / Smoke / Stun | No | Frag destroys the jammer | — |
| **Dokkaebi – Jegeo Payload** | **Yes, interrupts** | Y11S3: the upload needs a **continuous connection** between her tablet and the target's phone. "Defenders can actively interrupt the process using gadgets, such as Signal Disruptors". Fandom: defenders standing inside the jammer radius are protected. Whether Dokkaebi herself standing inside a jammer also blocks it is UNVERIFIED (the DSEG operator-or-device rule suggests yes) | Y11S3 DN/patch; Fandom Dokkaebi |
| Dokkaebi – Breach Charge (Y11S3) | **Yes** | Her EMP Impacts (which could disable jammers) were replaced by Breach Charges (which jammers block) | Y11S3 patch notes |
| Dokkaebi – camera hacking of dead defenders' phones | UNVERIFIED | No source on whether a jammer affects it | — |
| **Sledge** – hammer | No | Mechanical. The hammer or any melee can destroy a jammer (any damage) | Fandom |
| Sledge – **Impact EMP** | n/a (counters Mute) | Disables the jammer | Ubisoft Sledge page; Fandom EMP |
| Sledge – Frag / Stun | Frag destroys the jammer | — | — |

| Defender (friendly) | Interaction | Source |
|---|---|---|
| **Sentry** | None. Sentry's Nitro Cell, Bulletproof Camera etc. are unaffected by friendly jammers | Fandom Mute ("jam Attacker gadgets") |
| **Skopós** | Synergy: jammers protect her inactive shell from remote attacker explosives nearby. A Jegeo phone explosion removes her shell swap, and a jammer around her blocks the payload | Fandom Skopós; Fandom Dokkaebi |
| **Mira** | Synergy: jammer near a Black Mirror on a reinforced wall stops remote-breach attempts (not Hard Breach Charges) | Fandom Mira |
| **Lesion** | None. Gu is mechanical and friendly | Y8S3 DN |
| **Pulse** | None (friendly). If a jammer is **hacked by Brava**, its effect on Pulse's sensor or Nitro Cell is UNVERIFIED | — |

### Non-roster notes (context only)
Unaffected by the jammer: Ace SELMA (official example), Nomad Airjab and Jackal Eyenox (Fandom counters list). Affected (Fandom): Hibana X-KAIROS (official example), Twitch drone, Flores RCE-Ratero, Zero ARGUS cams, Finka Adrenal Surge, Ram BU-GI activation, Blitz flash shield, Nøkk HEL, Iana Gemini, Sens R.O.U., Lion scan/Grim/Deimos marks on defenders inside the radius. Counters: Thatcher E.G.S. and Twitch disable or destroy it, IQ sees it. The Fandom list predates Y10S4 for some entries, so treat it as UNVERIFIED unless the Y10S4 rule clearly applies.

## Change history (last 4 seasons + Siege X)
| Season / patch | Date | Change affecting Mute | Source |
|---|---|---|---|
| Y10S2 Daybreak (Siege X) | Jun 2025 | No Mute-specific change. Global: electricity neutral. Limb-damage cut (reverted Y10S4.1) | Y10S2 DN |
| Y10S3 High Stakes | Sep 2025 | No Mute change found | Y10S3 DN |
| Y10S4 Tenfold Pursuit | Dec 2025 | **Rework:** Health 2 (from 3), Speed 2 (from 1). Jammer "jams wireless signals (instead of disabling electronic gadgets)". Radius **2.475 m (from 2.225 m)**, reverting an old nerf. Removed from DSEG. **Y10S4.1:** bug fix "Signal Disruptor can deactivate Fuze's Cluster Charge" | Y10S4 DN; Tenfold Pursuit season page; Y10S4.1 notes |
| Y11S1 Silent Hunt | Mar 2026 | Y11S1.2 fixes: jam glitch persisting after Brava hack; jammer not affecting drones in some conditions | Y11S1.2 patch notes |
| Y11S2 System Override | Jun 2026 | Y11S2.2 fix: jammer wrongly disabled XK23 ACOG/Holo. **Y11S2.3 (2026-08-04): radius 2.6 m (from 2.475 m), warning 4.875 m (from 4.75 m)** | Y11S2.2 / Y11S2.3 patch notes |
| Y11S3 Split Fire | Sep 2026 | Dokkaebi's Jegeo Payload now needs a continuous connection that **Signal Disruptors can interrupt**. Dokkaebi loses Impact EMPs and gains Breach Charges. No direct Mute stat change | Y11S3 DN / patch notes |

## Implementation summary (JSON-ready)
```
signal_disruptor: { count: 4, placement: "floor_flat_only", deploy_s: 3.0 /*Fandom*/, shape: "sphere",
  radius_m: 2.6, warning_radius_m: 4.875, show_aoe_on_deploy_s: 2.5, retrievable: true,
  hp: 1 /*UNVERIFIED placeholder*/, electronic: true, emp_disables: true, brava_hackable: true,
  rule: "block remote activation/control if operator OR device within radius of enemy-aligned jammer",
  jams: ["drone","kludge","breach_charge","exothermic_charge","cluster_charge_activation","jegeo_payload_link"],
  ignores: ["hard_breach_charge","claymore","impact_emp","frag","stun","smoke","sledge_hammer","friendly_devices"] }
```

## Open questions
- Does a Mute jammer still stop Fuze's Cluster Charge in the current build? If Fuze triggers it outside and then the charge is inside, what happens? (Y10S4.1 fixed a "can deactivate" bug and the intent is unclear.)
- Do jammers stop Claymores in the current build? (Y6S1 said yes; the Y10S4 rework and Fandom's list say no.)
- If Dokkaebi (not the target) stands inside a jammer, can she still upload a Jegeo Payload?
- What exactly does a **Brava-hacked** jammer do to defenders: jam defender drones/cams/Skopós shells, block Nitro Cell detonation, affect Pulse's sensor?
- Jammer HP (does one pistol bullet always kill it?), exact deploy/arming time, and whether it is audible.
- Can Mute pick up a jammer mid-round and redeploy it (retrieval time)?
- Does the jammer block a remote hack on a Bulletproof Camera, or Dokkaebi's camera access for cams inside its radius?

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/mute — side, CTU, squad, specialties, ratings (2/2), loadout, floor placement, Mute-Castle tip
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes — Mute rework (wireless-signal rule, SELMA/Thermite examples, radius 2.475, Health 2/Speed 2); DSEG changes
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/tenfoldpursuit — DSEG overhaul wording; Mute "only jams wireless connections or remotely activated devices"
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3aYq6D0VHo1HJ5ZNfLtiNs — Y10S4.1 fix re Fuze Cluster Charge
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/ivbm7sXcU7iG89d7wQtlx/y11s12-patch-notes — Brava-hack glitch fix; drone-jam fix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3IoMKS8f3AHlOwBQXfiytt/y11s22-midseason-patch-notes — XK23 optics bug fix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2EIn06EmkAIG7su2fpITue — Y11S2.3: radius 2.6 m, warning 4.875 m; Impact EMP 2 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/PONCuRt8LaCr3O31NkBQb/y11s3-designers-notes — Jegeo continuous connection, "Signal Disruptors" interrupt; Dokkaebi EMP→Breach Charges
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.3.0 — Y11S3 patch text (mirrors official season notes)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes — Thermite Exothermic 220 dmg
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes — Siege X (no Mute change)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/4czc3hlHtXrd27crELGDcc/y10s3-designers-notes — Y10S3 (no Mute change)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/striker , .../sledge , .../fuze , .../dokkaebi , .../brava , .../thermite — roster gadget lists for the interaction tables
- https://rainbowsix.fandom.com/wiki/Mute — count 4, 3 s deploy, affected/unaffected list, counters (fragile, reinforcement, IQ/EMP/Brava), patch history (6.3.0 sphere & 2.5 s AoE display, 6.1.0 claymores)
- https://rainbowsix.fandom.com/wiki/Fuze_(Siege) — Cluster Charge blocked if Fuze or charge in radius; sub-grenade radius
- https://rainbowsix.fandom.com/wiki/Thermite_(Siege) — Exothermic blocked if charge or Thermite in radius; Brava converts jammers
- https://rainbowsix.fandom.com/wiki/Hard_Breach_Charge — fuse-based, no jammer interaction
- https://rainbowsix.fandom.com/wiki/Breach_Charge/Siege — jammable
- https://rainbowsix.fandom.com/wiki/Brava — Kludge vs jammers (hack flips; jammer stops Kludge)
- https://rainbowsix.fandom.com/wiki/Dokkaebi — jammer protects defenders from phone hacks
- https://rainbowsix.fandom.com/wiki/Skopós , https://rainbowsix.fandom.com/wiki/Mira — synergy notes
- https://rainbowsix.fandom.com/wiki/EMP_Grenade , https://rainbowsix.fandom.com/wiki/Twitch — EMP disables jammers; Twitch one-shot
- https://rainbowsix.fandom.com/wiki/Armor_and_Speed — Health → HP
- https://r6coaching.com/blog/r6-operator-mute.html — third-party 2026 guide confirming 4 jammers (low weight)
