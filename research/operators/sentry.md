# Sentry (Defender "Recruit")
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29
Confidence: high for loadout, ratings and the "two different gadgets" rule (official Ubisoft operator page + official New Blood announcement). Medium for the per-gadget counts: they come from Fandom and match the generic gadget counts, but Ubisoft never states them for Sentry.

> **Correction to the brief/PLAN.md:** Sentry is **not** a Siege X (Y10S2) rework. Sentry and Striker replaced the old
> "Recruit" in **Y9S2 Operation New Blood** (Update 9.2.0, 2024-06-11), a year before Siege X. Fandom's page title is
> "Sentry (Recruit)". Sources: official New Blood season page and Fandom (see Sources).
>
> **Correction to PLAN.md §11.2 baseline loadout:** the **TCSG12** slug shotgun was added as a third primary in
> **Y10S3** (Update 10.3.0, 2025-09-02). The plan lists only Commando 9 / M870.

## 1. Identity and base stats

| Field | Value | Source / note |
|---|---|---|
| id | `sentry` | — |
| side | Defender | Ubisoft operator page |
| squad / CTU | none shown on the Ubisoft page. Fandom lists Rainbow and ROS, but in-game the org shows as "Reliable And Available" | Ubisoft page (no Squad row); Fandom trivia |
| role tags (Ubisoft) | SUPPORT | Ubisoft page |
| health rating | **2** (of 3) → **110 HP** | Ubisoft page stars (2/3); HP mapping 1=100 / 2=110 / 3=125 from Fandom "Armor and Speed" |
| speed rating | **2** (of 3) | Ubisoft page stars (2/3). Movement speed in m/s: see `research/core_mechanics.md` |
| difficulty (Ubisoft) | 1 / 3 | Ubisoft page |
| unique ability | **Gadget Kit**: carries **two different** defender secondary gadgets, one of them in the unique-gadget slot | Ubisoft New Blood guide; Fandom |
| introduced | Y9S2 Operation New Blood, Update 9.2.0, 2024-06-11 | Fandom patch history |
| unlock | available to all players | Fandom infobox |
| one per team | yes. The old Recruit could be stacked; Sentry is limited to one player per team like any operator | siege.gg Sentry guide (UNVERIFIED by Ubisoft) |
| DBNO | standard operator DBNO rules | no special rule found. See `research/core_mechanics.md` |

## 2. Loadout (official Ubisoft operator page, Y11S3)

| Slot | Options | Class | Notes |
|---|---|---|---|
| Primary | **Commando 9** | Assault rifle | since Y9S2 |
| Primary | **M870** | Shotgun (pump) | since Y9S2 |
| Primary | **TCSG12** | Shotgun (slug) | **added Y10S3** "to enhance his capability in long-range engagements" (Y10S3 Designer's Notes) |
| Secondary | **C75 Auto** | Machine pistol | since Y9S2 |
| Secondary | **Super Shorty** | Shotgun | since Y9S2 |
| Gadget Kit pool | Barbed Wire, Bulletproof Camera, Deployable Shield, Observation Blocker, Impact Grenade, Nitro Cell, Proximity Alarm | Defender generic gadgets | **all 7** current defender secondary gadgets are on the Ubisoft page |

Weapon stats (damage, RPM, magazine, attachments) are in `research/weapons.csv`. Y10S3 removed magnified sights from
defenders' automatic weapons. The Y10S3 list of affected operators does **not** include Sentry. Slug shotguns such as the TCSG12
keep access to magnified sights (Y10S3 Designer's Notes).

## 3. Unique ability: Gadget Kit

### 3.1 Rules
| Rule | Value | Source |
|---|---|---|
| Number of gadget types carried | **2** | Ubisoft New Blood guide ("each can choose two secondary gadgets") |
| Duplicates allowed? | **No.** The two must be different items ("provided they aren't the same item") | Ubisoft New Blood guide. The season page adds "within limits" |
| Pool | every defender secondary gadget: the 7 listed above | Ubisoft operator page + New Blood season page ("any defensive secondary gadget from the arsenal") |
| Slot mapping | one gadget uses the normal secondary-gadget slot, the other uses the unique-ability slot and key | Fandom ("with one of them occupying his unique gadget slot") |
| Behaviour of each gadget | identical to the generic gadget: same damage, radius, HP, deploy time. No Sentry-specific modifiers found | no source mentions any Sentry-specific modifier. Generic stats: `research/gadgets.md` |

### 3.2 Count per gadget when Sentry takes it
All counts match the generic counts on each gadget's Fandom page (`maxammo`).

| Gadget | Count on Sentry | Source | Verified |
|---|---|---|---|
| Barbed Wire | 2 | Fandom Sentry loadout table; Fandom Barbed Wire `maxammo=2` | Fandom only |
| Bulletproof Camera | 1 | Fandom Sentry; BP Camera `maxammo=1` | Fandom only |
| Deployable Shield | 1 | Fandom Sentry; Deployable Shield `maxammo=1` | Fandom only |
| Observation Blocker | 3 | Fandom Sentry; Observation Blocker `maxammo=3` | Fandom only |
| Impact Grenade | 2 | Fandom Sentry; Impact Grenade `maxammo=2` | Fandom only |
| Nitro Cell (C4) | 1 | Fandom Sentry; C4 (Siege) `maxammo=1` | Fandom only |
| Proximity Alarm | 2 | Fandom Sentry; Proximity Alarm `maxammo=2` | Fandom only |

Ubisoft does not publish per-gadget counts for Sentry. Treat these as `verified: fandom`. They are UNVERIFIED against an
in-game screenshot (see Open questions).

### 3.3 Implementation notes (data-driven)
- `operators/sentry.json`: `ability: {type: "gadget_kit", picks: 2, unique: true, pool: "defender_secondary"}`.
  The loadout UI must forbid picking the same gadget twice.
- Counts come from the generic gadget definitions, e.g. `gadgets/*.json` `default_count`, and are not overridden per operator.
- 21 possible combinations: C(7,2).

## 4. Interactions with the other 11 roster operators

Every Sentry interaction is a **generic-gadget** interaction, so these rows also apply to anyone else carrying those gadgets.
Only rows relevant to Sentry's kit are listed.

| Other operator (side) | Their gadget → Sentry's gadget | Result | Source / verified |
|---|---|---|---|
| **Brava** (atk) | Kludge Drone → Bulletproof Camera | **Converted** to attackers: they get the feed and the camera shows Brava's badge and a blue glow | Fandom Brava (current list) |
| Brava | Kludge → Proximity Alarm | **Converted.** It alarms for the attackers instead | Fandom Brava |
| Brava | Kludge → Observation Blocker | **Converted** | Fandom Brava |
| Brava | Kludge → Nitro Cell (C4 emplacement) | **Destroyed** after the hack completes | Fandom Brava ("C4 emplacements") |
| Brava | Kludge → Barbed Wire / Deployable Shield / Impact Grenade | No interaction (not electronic, not in the hack list) | Fandom Brava list (by omission) |
| **Fuze** (atk) | Cluster Charge → Deployable Shield | Fuze can **mount a Cluster Charge on a Deployable Shield** (since Y8S3). A successful drill **shatters the shield's glass** | Official Y8S3 Designer's Notes; Fandom Fuze |
| Fuze | Cluster sub-grenades → any Sentry gadget | Explosive damage destroys Barbed Wire, BP Camera (explosives kill it), Proximity Alarm, Observation Blocker, Deployable Shield. Each sub-grenade has a 4.2 m radius (Fandom) | Fandom Fuze, BP Camera, Deployable Shield pages |
| **Thermite** (atk) | Exothermic Charge / his Stun & Smoke grenades | No special interaction. Sentry's gadgets in the blast volume take explosive damage (UNVERIFIED exact radius) | — |
| **Striker** (atk) | Impact EMP Grenade → BP Camera, Proximity Alarm, Nitro Cell | **Disabled** temporarily (DSEG). Impact EMP radius **2.0 m** since Y11S2.3 (was 1.8 m). Duration: see `research/gadgets.md` | Y11S2.3 patch notes; Fandom EMP page |
| Striker | Impact EMP → Observation Blocker | Fandom says EMP **destroys** Observation Blockers | Fandom Observation Blocker (UNVERIFIED vs Y10S4 DSEG rework) |
| Striker | Frag / Breach Charge / Hard Breach Charge / Claymore (155 dmg since Y11S3) | Explosives destroy Sentry's gadgets and hurt Sentry | Y11S3 DN (Claymore 155) |
| Striker | Stun / Smoke | No gadget interaction | — |
| **Dokkaebi** (atk) | Jegeo Payload → Sentry's phone | 7 s buzz window. If not reset, the phone explodes for **40 HP**, leaves fire for 5 s, and Sentry **loses phone access**, so he can't open observation tools (his own BP Camera and its EMP dart) for the rest of the round. Needs a continuous tablet–phone connection (Y11S3). Per-target cooldown 14 s | Y11S2 DN, Y11S2.2 DN, Y11S3 DN; Fandom Dokkaebi |
| Dokkaebi | Dead-defender phone hack → Bulletproof Camera | Attackers can view Sentry's BP Camera (20 s per hack, infinite range) but **can't fire its EMP dart** | Y11S2 DN; Fandom BP Camera |
| Dokkaebi | Breach Charges (added Y11S3) | Explosive: destroys gadgets | Y11S3 DN |
| **Sledge** (atk) | Breaching Hammer → Barbed Wire, Deployable Shield, BP Camera | **Destroyed.** The hammer counts as explosive damage against bulletproof gadgets | Fandom Sledge |
| Sledge | Frag / Impact EMP (if in his current loadout) | Same as Striker rows | Fandom Sledge (gadget list: see `sledge.md`) |
| **Mute** (def) | Signal Disruptor | Friendly: no effect on Sentry's gadgets. Jams attacker drones and Brava's Kludge, which protects Sentry's electronics indirectly. A **Brava-hacked** jammer affects defender devices instead (Fandom) | Fandom Mute; Y10S4 DN |
| **Pulse** (def) | Heartbeat Sensor | No interaction. Synergy: Pulse's reads plus Sentry's Nitro Cell | Fandom Pulse (synergy) |
| **Lesion** (def, provisional for "Legion") | Gu Mines | No interaction. Synergy with Proximity Alarm and Barbed Wire | — |
| **Mira** (def) | Black Mirror | Synergy. Sentry can throw a Nitro Cell through a hole next to a Mirror, and a Deployable Shield can block a doorway so drones can't reach the Mirror's canister | r6siegecenter Mira guide |
| **Skopós** (def) | Pantheon Shells | No interaction. Friendly-fire from Sentry's explosives against shells is UNVERIFIED | — |

Generic rules that also apply:
- **Electricity is team-neutral since Y10S2 (Siege X).** Defender gadgets are no longer immune to their own team's electrified walls, so a Sentry BP Camera or Proximity Alarm thrown onto a friendly Bandit/Kaid-electrified reinforcement is destroyed (Y10S2 DN).
- **DSEG (Y10S4).** A character under DSEG (EMP, E.G.S., or a BP Camera dart) can't trigger remote devices. Sentry can't detonate his Nitro Cell while EMP'd. BP-Camera darts apply DSEG to attackers (Y10S4 DN).

## 5. Change history

| Season | Change affecting Sentry | Source |
|---|---|---|
| Y9S2 New Blood (2024-06-11) | Added (replaced Recruit). Commando 9 / M870; C75 Auto / Super Shorty; Gadget Kit (2 different defender gadgets). Same season: Barbed Wire deals 5 HP/s to anyone moving through it | New Blood season page; Ubisoft news guide |
| Y10S2 Daybreak / Siege X (2025-06) | No Sentry-specific change. Global: electricity team-neutral and no longer damages operators (slows instead); defender gadgets vulnerable to own electricity; limb damage reductions (e.g. SMG/AR limb multipliers) | Y10S2 Designer's Notes |
| Y10S3 High Stakes (2025-09-02) | **TCSG12 added** as primary. Deployable Shield glass glare reduced (Sentry is on the affected list) | Y10S3 Designer's Notes; High Stakes season page |
| Y10S4 Tenfold Pursuit (2025-12) | No Sentry-specific change. Global: DSEG consolidation (BP Camera EMP is DSEG; all optics affected; EMP'd players can't trigger remote devices); Mute jammers now only jam wireless signals | Y10S4 Designer's Notes |
| Y11S1 Silent Hunt (2026-03-03) | Generic: **Observation Blocker deploy time 1 s (was 2.5 s)** | Silent Hunt season page |
| Y11S2 System Override (2026-06-02) | Generic (Y11S2.1): **BP Camera EMP dart explosion range 0.75 m (was 0.55 m)**. Dokkaebi Jegeo remaster changes his interaction (§4) | Y11S2.1 patch notes; Y11S2 DN |
| Y11S3 Split Fire (2026-09-01) | No Sentry-specific change. Attacker Claymore now 155 damage | Y11S3 DN |

## Open questions
- **Per-gadget counts on Sentry.** Do they match the generic counts (Barbed Wire 2, BP Cam 1, Deployable Shield 1, Obs Blocker 3, Impact 2, Nitro 1, Prox 2)? Ulo: screenshot Sentry's loadout screen with each gadget selected, or check the in-game HUD counters. (Fandom-only now.)
- **Slot/key binding.** Which of the two picked gadgets goes on the ability key and which on the secondary-gadget key? Is it the order they were picked? Ulo: check in a Custom game.
- **One Sentry per team?** siege.gg says yes (UNVERIFIED by Ubisoft). Ulo: confirm in the operator-select screen.
- **EMP vs Observation Blocker.** Does an Impact EMP destroy it (Fandom) or only disable it (post-Y10S4 DSEG)?
- Does a Brava-hacked Mute jammer affect Sentry's Nitro Cell detonation (post-Y10S4 "wireless signals" rework)?
- Can Sentry's explosives (Nitro, Impact) damage a friendly Skopós shell? Is that governed by normal friendly-fire / reverse-FF rules?

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/sentry: loadout (Commando 9, M870, TCSG12; C75 Auto, Super Shorty; 7 gadgets), health 2 / speed 2 / difficulty 1 stars, SUPPORT role
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/newblood: Y9S2 introduction, "any defensive secondary gadget … within limits", Barbed Wire 5 HP/s
- https://news.ubisoft.com/en-us/article/7GuRzEQEr7vbP8K6Y6RLl2/rainbow-six-siege-operation-new-blood-operator-remaster-and-balancing-guide: "two different secondary gadgets", "provided they aren't the same item"
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/4czc3hlHtXrd27crELGDcc/y10s3-designers-notes: TCSG12 added; magnified-sight removal list; Deployable Shield glare change
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes: electricity neutral; defender gadgets vulnerable
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes: DSEG consolidation; Mute jams wireless signals only
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/silenthunt: Observation Blocker deploy 1 s
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/7tAny5W9p4yrHmIiH51noI/y11s21-patch-notes: BP Camera EMP dart range 0.75 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2EIn06EmkAIG7su2fpITue: Y11S2.3 patch notes: Impact EMP radius 2 m, Mute range 2.6 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2MNhboDBmsQKkWb5p8zqsg/y11s2-designers-notes: Jegeo Payload numbers, camera hack 20 s
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/77rztlEyeqhZVqROCW0ZV7/designers-notes-y11s22-midseason-update: Jegeo per-target cooldown 14 s
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/PONCuRt8LaCr3O31NkBQb/y11s3-designers-notes: Jegeo continuous connection; Dokkaebi Breach Charges; Claymore 155
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/highstakes: TCSG12 added (season page)
- https://rainbowsix.fandom.com/wiki/Sentry_(Recruit): per-gadget counts, slot mapping, patch history (9.2.0, 10.3.0), org trivia
- https://rainbowsix.fandom.com/wiki/Armor_and_Speed: health rating → HP (100/110/125)
- https://rainbowsix.fandom.com/wiki/Brava: Kludge convert/destroy lists
- https://rainbowsix.fandom.com/wiki/Fuze_(Siege): Cluster Charge on Deployable Shields; 4.2 m sub-grenade radius
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2Btj0mP7e7gVKIODGSLuiX/y8s3-designers-notes: Cluster Charge allowed on Deployable Shields; glass shatters on a successful drill
- https://rainbowsix.fandom.com/wiki/Sledge_(Siege): hammer destroys Barbed Wire, Deployable Shields, BP Cameras
- https://rainbowsix.fandom.com/wiki/Dokkaebi: Jegeo effects on phone loss
- https://rainbowsix.fandom.com/wiki/Mute: jammer effects, Brava-hacked jammer
- https://rainbowsix.fandom.com/wiki/Bulletproof_Camera, https://rainbowsix.fandom.com/wiki/Observation_Blocker, https://rainbowsix.fandom.com/wiki/Proximity_Alarm, https://rainbowsix.fandom.com/wiki/Impact_Grenade, https://rainbowsix.fandom.com/wiki/Deployable_Shield, https://rainbowsix.fandom.com/wiki/Barbed_Wire, https://rainbowsix.fandom.com/wiki/EMP_Grenade: generic counts and interactions
- https://siege.gg/news/rainbow-six-siege-operator-guide-sentry: one Sentry per team; 2-speed/2-health
- https://r6siegecenter.com/guides/operators/defenders/mira/: Sentry/Mira synergy (Deployable Shield vs drones)
