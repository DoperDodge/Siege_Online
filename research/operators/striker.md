# Striker (Attack Recruit) — operator research
Verified against: Y11S3 (Operation Split Fire, incl. Y11S3.1 patch of 2026-09-22) — researched 2026-09-29
Confidence: high for side, ratings, loadout, gadget pool and the "no duplicates" rule (all from official Ubisoft pages). Medium for per-gadget counts (Fandom only, and one conflicts). Low for some jammer interactions after Mute's Y10S4 rework.

> **Correction to the brief and PLAN.md:** Striker is **not** a Siege X (Y10S2) rework. She came in **Y9S2 Operation New Blood (2024-06-11)** together with Sentry, replacing the old Recruit. Fandom's page title is "Striker (Recruit)". Siege X made no Striker-specific change. The next change after launch was the SR-25 in Y10S3.
> **Correction to PLAN.md §11.1 baseline:** the primaries are now **M4, M249 and SR-25**. The SR-25 was added in Y10S3 (2025-09-02).

---

## 1. Identity and base stats

| Field | Value | Source |
|---|---|---|
| Name (in-game) | Striker | Ubisoft operator page |
| Side | Attacker | Ubisoft operator page |
| Real name / DOB / birthplace | "Undefined" for all (a generic Recruit, not a named person) | Ubisoft operator page |
| CTU / organization | None on the official page. Fandom lists Rainbow / ROS, and the in-game op-select ORG reads "Reliable And Available" | Fandom (UNVERIFIED in-game text) |
| Squad | **None listed** on the official page. The bio says Ghosteyes or Redhammer would be "the most logical spots" | Ubisoft operator page (bio) |
| Specialty (official) | SUPPORT | Ubisoft operator page |
| Health rating | **2** (2 of 3 stars) | Ubisoft operator page (star markup `is-active` ×2) |
| Speed rating | **2** (2 of 3 stars) | Ubisoft operator page |
| Difficulty | 1 of 3 | Ubisoft operator page |
| Introduced | Y9S2 Operation New Blood, patch 9.2.0, 2024-06-11 | Fandom patch history; Ubisoft New Blood season page |
| Unlock | Available to all players (free) | Fandom |

For health and speed values per rating (HP, m/s), see `research/core_mechanics.md`.

## 2. Loadout (current, from the official operator page)

### Primary weapons
| Weapon | Class | Notes |
|---|---|---|
| M4 | Assault Rifle | Launch weapon (Y9S2) |
| M249 | Light Machine Gun | Launch weapon (Y9S2) |
| SR-25 | Marksman Rifle (DMR) | **Added Y10S3** (patch 10.3.0, 2025-09-02) |

### Secondary weapons
| Weapon | Class |
|---|---|
| 5.7 USG | Handgun |
| ITA12S | Shotgun |

Weapon stats (damage, RPM, magazine, etc.) are in `research/weapons.csv`. None of these five weapons had a balance change in Y10S2 through Y11S3.1: a grep of every official Designer's Notes and patch note for Y10S2–Y11S3.1 found nothing.

### Secondary gadgets: the "Gadget Kit" ability
The official page lists these seven attacker secondary gadgets, which is the complete attacker generic pool as of Y11S3:

| Gadget | Count when Striker takes it | Count source / status |
|---|---|---|
| Breach Charge | 3 | Fandom Striker page ("x3"); Fandom Breach Charge maxammo 3 |
| Claymore | 2 | Fandom Striker page; Fandom Claymore maxammo 2 (raised from 1 in Y7S1.2) |
| Frag Grenade | 2 | Fandom Striker page; Fandom M67 maxammo 2 |
| Hard Breach Charge | 2 | Fandom Striker page; Fandom HBC maxammo 2 |
| Smoke Grenade | 2 | Fandom Striker page; Fandom Smoke maxammo 2 |
| Stun Grenade | **3 (Striker page) vs 2 (generic Stun page) — UNVERIFIED** | Two Fandom pages disagree. The generic count is 2 |
| Impact EMP Grenade | 2 | Fandom Striker page; Fandom EMP page ("Only two ... can be carried") |

**Gadget Kit rules**
| Rule | Value | Source |
|---|---|---|
| Number of picks | **Exactly 2** secondary gadgets. They replace the usual "1 secondary gadget + unique ability" | Ubisoft news (New Blood): "each can choose two secondary gadgets"; Ubisoft op page: "access to all secondary gadgets for Attack Operators" |
| Duplicates allowed? | **No.** Two different gadgets are required, so no double Breach Charge and no 6 stuns | Ubisoft news (New Blood): "For every secondary gadget an Attacker could choose, Striker gets to choose two, provided they aren't the same item." |
| Pool | Any attacker secondary gadget: Breach Charge, Claymore, Frag, Hard Breach Charge, Smoke, Stun, Impact EMP | Ubisoft op page |
| Slot mapping | One gadget uses the normal secondary-gadget slot. The other uses the unique-gadget/ability slot and key | Fandom ("with one of them occupying the unique gadget slot") |
| Unique gadget | **None.** Her whole ability is the two-gadget kit | Ubisoft op page; Fandom |
| Ability name | "Gadget Kit" is a Fandom/community label. The official page gives no name | Fandom — naming UNVERIFIED |
| Number of legal combinations | C(7,2) = **21** unordered pairs | derived |

Implementation note: build Striker as `ability = null`, `gadget_slots = 2`, `gadget_pool = ATTACKER_GENERIC`, `constraint = distinct`. Each gadget keeps its own generic behavior and count, which live in `research/gadgets.md`.

## 3. Generic gadget behaviors that matter for Striker (summary; full detail in research/gadgets.md)

| Gadget | Key behavior | Source |
|---|---|---|
| Breach Charge | Remote-detonated. Breaks soft walls, floors, barricades, hatches (not reinforced). A charge placed on an electrified surface is destroyed. **Mute's Signal Disruptor blocks detonation** (remote signal) | Fandom Breach Charge; Y10S4 DN (Mute jams "signals coming in or out") |
| Hard Breach Charge | Opens reinforced walls and hatches. About 2 s to place. **Fuse-triggered, not remote**: detonates about 4 s after the placement animation. Small hole (crouch/vault). Deals 5 dmg to anyone standing on or near it, within about 0.5 m | Fandom HBC (UNVERIFIED timings) |
| Claymore | 3 laser tripwires, 2 m long (center, ±30°). About 1 s arm delay. 0.5 s detonation delay. **Damage raised to 155 HP (from 150) in Y11S3** | Fandom Claymore; Y11S3 Designer's Notes |
| Frag Grenade | Cookable frag, count 2 | Fandom M67 |
| Stun Grenade | 3 s fuse, not cookable. Up to 5 s blind/deaf. Max reach 15 m when facing it, full blind ≤11 m, 3 m when facing away | Fandom Stun (UNVERIFIED current) |
| Smoke Grenade | Count 2 | Fandom |
| Impact EMP Grenade | Detonates on impact. **Radius 2.0 m (from 1.8 m) since Y11S2.3.** Disables enemy electronics (Fandom says 9 s — UNVERIFIED). Since Y10S4 the DSEG effect disables all sights/scopes, re-applying refreshes the timer, and affected players can't trigger remote devices | Y11S2.3 patch notes; Y10S4 DN; Fandom EMP |

## 4. Interactions with the other 11 roster operators

"Lesion" stands in provisionally for the owner's "Legion" (see the brief).

### 4.1 Defenders
| Defender (gadget) | Striker tool | Result | Confidence / source |
|---|---|---|---|
| **Mute** (Signal Disruptor, radius **2.6 m** since Y11S2.3) | Breach Charge | Won't detonate if the charge **or Striker** is inside the jammer radius. Since Y10S4, Mute "jams wireless signals" rather than disabling electronics | High — Y10S4 DN, Fandom Mute |
| Mute | Hard Breach Charge | Fandom's Mute page says it's jammed. But the HBC is fuse-triggered, not remote, so under the Y10S4 "signals only" rule it may **not** be jammed. **UNVERIFIED** | Conflict: Fandom Mute vs Fandom HBC + Y10S4 DN |
| Mute | Claymore | Fandom says jammers jam Claymores (added Y6S1). Y10S4 made automated gadgets (e.g., Ace's SELMA) immune, so the current status is **UNVERIFIED** | Fandom Mute; Y10S4 DN |
| Mute | Impact EMP | Disables Signal Disruptors (duration UNVERIFIED, Fandom 9 s) | Fandom EMP affected-gadget list |
| Mute | Frag / Breach / Claymore blast | Destroys the jammer (jammers die to any damage) | Fandom Mute ("destroyed by any source of damage") |
| Mute | Drones (Striker's drones) | Drones inside the radius show static and stop working | Fandom Mute |
| **Pulse** (Cardiac Sensor, scan distance **10.5 m** since Y11S2) | — | Pulse sees Striker's heartbeat through walls and floors like anyone else's | Y11S2 DN |
| Pulse | Impact EMP | Fandom: Thatcher's EMP disables the heartbeat sensor for 5 s if Pulse is in range. Impact EMP is assumed to do the same — **UNVERIFIED** | Fandom Pulse |
| **Mira** (Black Mirror) | Breach Charge / Frag on a **soft** wall | Destroying the wall around the mirror removes it | Fandom Mira |
| Mira | Hard Breach Charge on a **reinforced** wall holding a Black Mirror | Fandom confirms that Thermite, Hibana, Ace and Maverick destroy it. The HBC is not listed — **UNVERIFIED** | Fandom Mira |
| Mira | Melee (Striker's knife/punch) | One melee strike on either side shatters the glass and blocks sight lines | Fandom Mira |
| Mira | Shooting the canister | The canister is only on the defender side. Once destroyed, the glass ejects after 4 s | Fandom Mira |
| **Lesion** (Gu mines) | Impact EMP | **No effect.** Gu mines have been mechanical since Y8S3. Fandom's EMP page still lists them, but that is outdated | Fandom Lesion |
| Lesion | Frag / Breach Charge / Claymore | Gu mines can be destroyed by explosives and gunfire | Fandom Lesion |
| **Skopós** (V10 Pantheon Shells) | Impact EMP | Hitting **either** shell stops Skopós switching shells. It glitches the HUD and blocks observation tools. It does not "disable" the active shell | Fandom Skopós |
| Skopós | Explosives (Frag, Breach Charge) | The inactive shell's bulletproof shield can be destroyed by explosives | Fandom Skopós |
| Skopós | Claymore | A Claymore can be placed against the inactive shell. It detonates when Skopós re-activates that shell | Fandom Skopós |
| **Sentry** (any 2 defender gadgets) | Impact EMP | Disables Nitro Cell, Proximity Alarm, Bulletproof Camera (duration UNVERIFIED) | Fandom EMP list |
| Sentry | Frag / Breach Charge / Claymore | Destroy Deployable Shield and Barbed Wire (explosives). Bulletproof Camera is also vulnerable to explosives | Fandom Deployable Shield, Barbed Wire, BPC |
| Sentry | Bulletproof Camera EMP burst → Striker | Any living defender can fire the BPC burst. It applies DSEG to Striker: sights off, and **she can't trigger remote devices such as her Breach Charges** while affected | Fandom BPC; Y10S4 DN (DSEG consolidation) |
| Sentry | Nitro Cell / Impact Grenade | Counters Striker's breaching: destroys planted charges and kills | Generic — see gadgets.md |
| Sentry | Observation Blocker | Blocks Striker's drones' view | Fandom Observation Blocker |

### 4.2 Attackers (same team: synergies, no hostile interactions)
| Attacker | Interaction with Striker's kit | Source / confidence |
|---|---|---|
| **Thermite** | Striker's Impact EMP clears Mute jammers (and electrified reinforcement from off-roster ops) before Thermite's Exothermic Charge. Mute jams the Exothermic Charge (remote). Striker's HBC ×2 can act as a second hard breach | Y10S4 DN (Mute still blocks Exothermic); Fandom Striker "Strategies" |
| **Fuze** | Fuze's Cluster Charge is jammed by Mute. Striker's Impact EMP or Frag clears jammers first | Fandom Mute |
| **Dokkaebi** | **Caution:** Y11S3 DN says EMP effects "could interrupt the [Jegeo Payload] connection by disabling the target's phone". So Striker's Impact EMP landing on a defender Dokkaebi is uploading to would likely **cancel Dokkaebi's upload**. Inferred from Dokkaebi's own Y11S3 change — **UNVERIFIED** for teammate EMPs | Y11S3 Designer's Notes |
| **Sledge** | Overlapping kit (Frag, Stun, Impact EMP). Striker's Breach Charges plus Sledge's hammer give lots of soft destruction | — |
| **Brava** | No direct interaction. Both can remove defender electronics (Brava by hacking with the Kludge drone, Striker with Impact EMP) | — |
| All attackers | Stun Grenades blind teammates too. Frag, Claymore and Breach Charge friendly-fire rules: see `research/core_mechanics.md` (Siege X reverse-FF) | Fandom Stun |

## 5. Change history

| Season / patch | Date | Change affecting Striker | Source |
|---|---|---|---|
| Y9S2 New Blood (9.2.0) | 2024-06-11 | Striker added (Recruit remaster): M4/M249, 5.7 USG/ITA12S, any two different attacker gadgets | Ubisoft New Blood page + news; Fandom |
| **Siege X — Y10S2 Daybreak** | 2025-06-10 | **No Striker-specific change.** System changes that matter to her: electricity is now neutral (destroys any device touching it; slows rather than damages operators); Rappel Breach no longer needs a Breach Charge; destructible ingredients added | Ubisoft Daybreak page; Y10S2 DN |
| **Y10S3 High Stakes** (10.3.0) | 2025-09-02 | **SR-25 added** as a primary ("a weapon more suited for long-range engagements") | Y10S3 DN; High Stakes season page; Fandom |
| **Y10S4 Tenfold Pursuit** | 2025-12-02 | Indirect changes. DSEG consolidated: EMP now affects all sights, re-applying refreshes it, and a DSEG'd player can't trigger remote devices. Mute reworked: jammers now "jam wireless signals" instead of disabling electronics, range 2.475 m | Y10S4 DN |
| **Y11S1 Silent Hunt** | 2026-03-03 | No Striker change | Y11S1 DN; Fandom 11.1.x patch pages |
| **Y11S2 System Override** | 2026-06-02 | No Striker change. **Y11S2.3 (2026-08-04):** Impact EMP radius 2.0 m (from 1.8 m); Mute disruption range 2.6 m (from 2.475 m) | Y11S2.3 patch notes |
| **Y11S3 Split Fire** | 2026-09-01 | Indirect: **Claymore damage 155 HP (from 150)**. No change in Y11S3.1 | Y11S3 DN; Y11S3.1 patch notes |

## 6. JSON-ready summary
```json
{
  "id": "striker",
  "side": "attacker",
  "health_rating": 2,
  "speed_rating": 2,
  "primaries": ["m4", "m249", "sr25"],
  "secondaries": ["57usg", "ita12s"],
  "ability": null,
  "gadget_kit": {
    "picks": 2,
    "distinct": true,
    "pool": ["breach_charge", "claymore", "frag", "hard_breach_charge", "smoke", "stun", "impact_emp"],
    "counts": {"breach_charge": 3, "claymore": 2, "frag": 2, "hard_breach_charge": 2, "smoke": 2,
               "stun": "UNVERIFIED (3 per Fandom Striker page, 2 per generic)", "impact_emp": 2}
  }
}
```

## Open questions
- **Stun count for Striker:** is it 3 or 2? Ulo: open the loadout screen with Stun selected and read the count.
- Do Striker's per-gadget counts match what other operators get (Breach Charge 3, Claymore 2, Frag 2, HBC 2, Smoke 2, Impact EMP 2)? Needs an in-game loadout check.
- Which key triggers the second gadget: the normal gadget key or the ability key? Does the game fix which pick goes in which slot, or can the player choose?
- **Does Mute's Signal Disruptor still stop a Hard Breach Charge** after the Y10S4 rework, given the HBC is fuse-triggered? A Custom Game test with a jammer next to a planted HBC would settle it.
- **Does Mute's jammer still stop Claymores** after Y10S4?
- Impact EMP disable duration in Y11S3: Fandom says 9 s. Needs in-game timing.
- Can a Hard Breach Charge destroy Mira's Black Mirror on a reinforced wall?
- Does a teammate's Impact EMP on a defender cancel Dokkaebi's Jegeo upload? This is inferred from the Y11S3 Designer's Notes and needs testing.
- Is the name "Gadget Kit" used anywhere in-game? The official site doesn't name the ability.

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/striker — side, star ratings (health 2, speed 2, difficulty 1), specialty, primaries (M4, M249, SR-25), secondaries, full gadget list, bio
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/newblood — New Blood introduction, "any of the wide range of attacking secondary gadgets"
- https://news.ubisoft.com/en-us/article/7GuRzEQEr7vbP8K6Y6RLl2/rainbow-six-siege-operation-new-blood-operator-remaster-and-balancing-guide — "two secondary gadgets", "provided they aren't the same item"
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/4czc3hlHtXrd27crELGDcc/y10s3-designers-notes — SR-25 added to Striker (Y10S3)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/highstakes — SR-25 for Striker, TCSG12 for Sentry
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/daybreak — Siege X systemic changes (electricity neutral, destructible ingredients)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes — Rappel Breach rule change
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes — DSEG consolidation, Mute rework (jams signals, 2.475 m)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5fWCjoCU8toUJiBdMSj0UA/y11s1-designers-notes — no Striker change (checked)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2EIn06EmkAIG7su2fpITue/y11s23-patch-notes — Impact EMP 2.0 m, Mute 2.6 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/PONCuRt8LaCr3O31NkBQb/y11s3-designers-notes — Claymore 155 HP; EMP can interrupt the Jegeo connection
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes — no Striker change (checked)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/sentry — Sentry's defender gadget pool (for interactions)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/mute , /pulse , /mira , /lesion , /skopos — defender loadouts (for interactions)
- https://rainbowsix.fandom.com/wiki/Striker_(Recruit) — per-gadget counts, slot mapping, patch history
- https://rainbowsix.fandom.com/wiki/Mute — jammer interaction list (Breach, HBC, Claymore, drones)
- https://rainbowsix.fandom.com/wiki/Hard_Breach_Charge — HBC fuse/placement behavior, count 2
- https://rainbowsix.fandom.com/wiki/Breach_Charge/Siege — count 3, electrified-surface behavior
- https://rainbowsix.fandom.com/wiki/Claymore — lasers, arm delay, count 2
- https://rainbowsix.fandom.com/wiki/Stun_Grenade/Siege — generic count 2, stun ranges
- https://rainbowsix.fandom.com/wiki/EMP_Grenade — Impact EMP basics and affected-gadget list (partly outdated)
- https://rainbowsix.fandom.com/wiki/Skopós — EMP blocks shell swap; inactive-shell shield vulnerable to explosives; Claymore trick
- https://rainbowsix.fandom.com/wiki/Lesion — Gu mines mechanical since Y8S3
- https://rainbowsix.fandom.com/wiki/Mira_(Siege) — Black Mirror counters
- https://rainbowsix.fandom.com/wiki/Pulse_(Siege) — EMP vs Cardiac Sensor
- https://rainbowsix.fandom.com/wiki/Bulletproof_Camera — BPC EMP burst, Sledge/explosive vulnerability
- https://rainbowsix.fandom.com/wiki/Deployable_Shield , https://rainbowsix.fandom.com/wiki/Barbed_Wire — destruction rules
