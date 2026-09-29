# Brava (Attacker) — Kludge Drone
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29
Confidence: medium. Identity, loadout, and the list of what each hack does come from the official Ubisoft page, official patch notes, and Fandom. Ubisoft has never published the Kludge's numbers (hack time, range, charges, HP, speed, jump); where they appear below they come from low-priority sites or are UNVERIFIED.

> Key finding vs PLAN.md §11.1: the baseline loadout (PARA-308/CAMRS; USP40/Super Shorty; Claymore/Smoke) is still correct in Y11S3. The Kludge **cannot** hack Mira's Black Mirror, Pulse's Cardiac Sensor, Lesion's Gu mines (Gu mines have been mechanical since Y8S3), or Skopós' *active* shell. It **destroys** Skopós' inactive shell by overheating it (Skopós is warned). It **converts** Mute's jammers and the generic electronic gadgets (Bulletproof Camera, Proximity Alarm, Observation Blocker). It **destroys** Nitro Cells.

---

## 1. Identity

| Field | Value | Source / status |
|---|---|---|
| Side | Attacker | Official operator page |
| CTU (unit shown on page) | COT (Comando de Operações Táticas, Brazil) | Official operator page |
| Squad | Viperstrike | Official operator page |
| Specialties (official tags) | INTEL, ANTI-GADGET | Official operator page |
| Health rating | 1 of 3 ("Light") → 100 HP under the current HP system | Official page stars (1/3); HP mapping from Fandom "Armor and Speed" (see `research/core_mechanics.md`) |
| Speed rating | 3 of 3 | Official page stars (3/3) |
| Difficulty | 3 of 3 | Official page stars |
| Introduced | Y8S1 Operation Commanding Force (March 2023) | Official news / Fandom |
| Price (Y11S1+) | 10,000 Renown / 240 R6 Credits | Y11S1 patch notes (mp1st copy), Fandom 11.1.0 |

## 2. Loadout (official page, Y11S3)

| Slot | Options | Notes |
|---|---|---|
| Primary | **PARA-308** (Assault Rifle), **CAMRS** (Marksman Rifle) | Stats → `research/weapons.csv` |
| Secondary | **USP40** (Handgun), **Super Shorty** (Shotgun) | |
| Secondary gadget (choose 1) | **Smoke Grenade** ×2, **Claymore** ×2 | Counts from Fandom. Claymore damage raised to 155 HP (from 150) in Y11S3 (official Y11S3 notes). |
| Unique ability | **Kludge Drone** | |

Matches the PLAN.md baseline. No loadout changes found in Y10S2 through Y11S3.

## 3. Unique ability: Kludge Drone

Official description: "a sabotage tool capable of taking over opponents' devices. If the device can't be controlled, it's destroyed instead." In-game text (Fandom): "Deployable drone that either takes control of electronic devices or destroys them after a short delay."

### 3.1 Numbers and rules

| Property | Value | Status / source |
|---|---|---|
| Kludge drones per round | **2** | Fandom Brava ("begins each match with two Kludge drones"); siege.gg |
| Regular drones in addition | 2 (4 drones in total) | UNVERIFIED. Only siege.gg and dualshockers say this. Fandom and Ubisoft are silent. |
| Hack charges per Kludge | **3** | UNVERIFIED value. Charges do exist: the Y8S1.1 fix "Kludge Drone consumes a charge even when the device is picked up before a successful conversion", Fandom's note that Mozzie can re-hack "as long as there are charges left", and the Fandom Thermite page ("one of the three hacking charges"). The value 3 is from dualshockers only. |
| Charge refund | No charge is spent if the defender picks the device up before the conversion finishes | Official Y8S1.1 patch notes (bug fix) |
| Hack range | **10 m** | UNVERIFIED (dualshockers only). A range limit exists: Y8S1.1 fixed missing "out of range feedback on HUD when failing a hack due to distance". |
| Starting a hack | Needs the target **in view and within range** | Fandom (old revision), Strafe, official Commanding Force guide |
| During a hack | Line of sight is **not** needed. The drone only has to stay within range, so it can back off behind cover or through a drone hole. | Official Commanding Force guide; Fandom |
| Hack duration | "a few seconds"; progress bar on the HUD | UNVERIFIED exact value (siege.gg quoting creative director A. Karpazis). Placeholder suggestion: 3 s (one untraceable search snippet). |
| "Destroy" outcome | The device self-destructs "after a short delay" | Fandom / in-game text. Delay value UNVERIFIED. |
| Hacked-device tell | The device glows in the viewer's team colour (originally described as a blue glow). A hacked camera feed gets a green tint and Brava's badge overlay. | Fandom; official CF guide; Y8S1 fixes |
| Drone body | Four-wheeled drone with an "electronic laser". Bigger and noisier than a standard drone. | Fandom; official CF guide; siege.gg (Karpazis: "fragile", "makes a lot of noise") |
| Drone HP | Fragile; "can be shot with just one bullet" | siege.gg. Numeric HP UNVERIFIED (standard drones die to any single hit per Fandom Drone page). |
| Move speed | UNVERIFIED | — |
| Jump | UNVERIFIED (standard drones jump with a 3 s cooldown per Fandom Drone page; unknown whether the Kludge jumps) | — |
| Pick up / redeploy | UNVERIFIED | — |
| Scoring | Converting a device awards points | Y8S1 addendum fix |

### 3.2 Global hack result list (Fandom Brava page, Y11S3 revision)

**Destroyed after a short delay:** C4 / Nitro Cell, Bandit Shock Wire, Fenrir F-NATT (deactivated state), Kaid Electroclaw, Smoke Remote Gas Grenade.
**Converted (allegiance switched):** Surveillance (default) Cameras, Bulletproof Cameras, Proximity Alarms, Observation Blockers, Alibi Prisma, Aruni Surya Gate, Echo Yokai, Ela Grzmot, Fenrir F-NATT (active; also steals its activation code), Jäger ADS, Kapkan EDD, Maestro Evil Eye, Melusi Banshee, Mozzie Pest, **Mute Signal Disruptor**, Thorn Razorbloom, Wamai MAG-NET, Valkyrie Black Eye, **Thunderbird Kóna Station** (since Y10S2; it was destroyed/overheated before).
Brava can also hack attacker devices that Mozzie has stolen, which returns them to the attackers.

## 4. What the Kludge does to each roster defender's gadgets

| Owner | Gadget | Hackable? | Result of hack | Status / source |
|---|---|---|---|---|
| **Mute** | Signal Disruptor ("Moni" GC90) | **Yes** | **Converted.** It now disrupts *defender* gadgets instead of attacker ones. A Kludge that enters an enemy jammer's radius is jammed (static), so it must start the hack from outside the **2.6 m** radius (Y11S2.3; it was 2.475 m in Y10S4–Y11S2.2) while it still has line of sight. | Fandom Brava + Mute; official CF guide; still hackable in Y11 (Y11S1.2 fix: "Glitch visual effect persists on any drone camera after Mute's Signal Disruptor is hacked by Brava's Kludge Drone") |
| Mute | Bulletproof Camera | Yes | Converted (attackers get the feed) | Fandom |
| Mute | Nitro Cell | Yes | **Destroyed** after a short delay ("C4 emplacements") | Fandom |
| **Pulse** | HB-5 Cardiac Sensor | **No** | Held in the hand, not a placed device, and on no hack list | Inferred from absence. UNVERIFIED explicit statement. |
| Pulse | Nitro Cell | Yes | Destroyed | Fandom |
| Pulse | Deployable Shield | No | Not electronic; on no list | Fandom (absence) |
| Pulse | Observation Blocker | Yes | Converted | Fandom |
| **Mira** | Black Mirror | **No** | Not electronic | dualshockers ("cannot hack ... Mira's Black Mirrors"); absent from the Fandom list |
| Mira | Proximity Alarm | Yes | Converted | Fandom |
| Mira | Nitro Cell | Yes | Destroyed | Fandom |
| **Skopós** | V10 Pantheon **Inactive (idle) Shell** | **Yes** | **Overheats and destroys** the idle shell. Skopós gets a warning and can stop it by switching control into that shell. Destroying the idle shell does not eliminate Skopós. Overheat window: **~8 s** after the hack starts (UNVERIFIED; siege.gg). | Official Twin Shells guide ("Brava is able to use her Kludge Drone to overheat the inactive shell and destroy it, though Skopós does receive a warning"); Fandom Skopós; siege.gg Skopós guide (8 s) |
| Skopós | **Active** Shell | **No** | Immune: "not vulnerable to EMPs, hacks, or Brava's drone sabotage" | Official Twin Shells guide |
| Skopós | Proximity Alarm | Yes | Converted | Fandom |
| Skopós | Impact Grenade | N/A | Thrown explosive, never a placed device | — |
| **Lesion** (provisional for "Legion") | Gu Mine | **No (since Y8S3)** | Gu mines became *mechanical*: no EMP, no IQ detection, no Brava hack. Guides from Y8S1–Y8S2 that say otherwise are outdated. | Fandom Lesion; official Y8S3 Designer's Notes ("Gadget type is now Mechanical") |
| Lesion | Observation Blocker | Yes | Converted | Fandom |
| Lesion | Bulletproof Camera | Yes | Converted | Fandom |
| **Sentry** (any 2 generic) | Bulletproof Camera | Yes | Converted | Fandom |
| Sentry | Proximity Alarm | Yes | Converted | Fandom |
| Sentry | Observation Blocker | Yes | Converted | Fandom |
| Sentry | Nitro Cell | Yes | Destroyed | Fandom |
| Sentry | Deployable Shield | No | Not electronic | Fandom (absence) |
| Sentry | Barbed Wire | No | Not electronic | Fandom (absence) |
| Sentry | Impact Grenade | N/A | Thrown | — |
| Map | Default surveillance cameras (Oregon default cams) | Yes | Converted: attackers can use the feed | Fandom; official CF guide ("giving the Attackers access to default camera") |

### 4.1 What "converted" means for the generic gadgets

| Converted gadget | Behaviour after conversion | Status |
|---|---|---|
| Default camera / Bulletproof Camera | Attackers can view the feed (green tint, Brava badge). It is marked by the team-colour glow. | Fandom, official. **Whether attackers can fire the BP camera's EMP dart is UNVERIFIED.** When Dokkaebi hacks the CCTV, attackers do *not* get the EMP (Fandom BP Camera page), so the safe assumption is that Brava's attackers don't either. |
| Proximity Alarm | "Switches allegiance". It presumably now triggers on defenders and alerts attackers. | Exact behaviour UNVERIFIED |
| Observation Blocker | "Switches allegiance". It presumably now blocks *defender* observation tools (cams) instead of attacker drones. | Exact behaviour UNVERIFIED |
| Mute Signal Disruptor | Disrupts defender devices (e.g. a Y8S1.1 fix mentions glitch VFX on Bulletproof Cameras after a converted disruptor was destroyed). Since the Y10S4 rework, jammers only jam **wireless or remote-activated** devices. Radius 2.6 m since Y11S2.3. | Converted behaviour per Fandom. How the Y10S4 rules apply to a converted jammer is UNVERIFIED. |

## 5. Interactions with roster attackers (allies)

The Kludge never hacks friendly (attacker) gadgets while Brava controls it.

| Ally | Interaction |
|---|---|
| Thermite | Brava converting a Mute jammer (or destroying Bandit/Kaid electricity, which isn't in our roster) frees a reinforced wall for the Exothermic Charge. Fandom Thermite page: "Brava can ... convert Signal Disruptors. But this costs one of the three hacking charges." |
| Fuze | Same idea: a converted jammer no longer stops the Cluster Charge from triggering (inferred). |
| Striker / Sledge | Their Impact EMP Grenades (Sledge's loadout; Striker's pool) can disable jammers instead. That is an alternative to spending a Kludge charge. |
| Dokkaebi | Both give attackers defender camera feeds. No direct gadget interaction was found. |
| (Out of roster) Mozzie | If a Pest captures a Kludge, the defenders can use it to **destroy** Breach Charges (Fuze, Dokkaebi, Striker), Thermite's Exothermic Charges, Flores' Ratero and Ace's SELMA, and to **convert** Claymores (Brava, Striker), drones (including the other Kludge), Nomad Airjabs and Zero Argus cameras. Brava can retake the drone. |

## 6. What counters Brava / the Kludge

| Counter | Effect | Source |
|---|---|---|
| **Mute Signal Disruptor** (roster) | The Kludge "stops working" (static feed) inside the **2.6 m** radius (Y11S2.3). The static warning starts at 4.875 m. Counter-play: hack the jammer from outside its radius first, or use the second Kludge to hack the jammer and free the first. | Fandom Mute/Brava; Strafe; official CF guide; radius from official Y10S4 DN |
| **Observation Blocker** (Sentry, Pulse, Lesion) | Blocks the Kludge's vision (it counts as an observation tool). The blocker itself can be hacked if seen from outside its screen. | Official Y8S2 Designer's Notes ("blocks vision from any Observation Tool, such as drones ... or Brava's Kludge Drone") |
| **Bulletproof Camera EMP dart** (Sentry, Mute, Lesion) | Disables attacker electronics (dart radius 0.75 m since Y11S2.1). Presumably disables the Kludge too. | Effect on the Kludge UNVERIFIED; radius from official Y11S2.1 notes |
| Gunfire / any damage | The Kludge is large and fragile (one bullet) | siege.gg, official CF guide |
| Visual/audio tells | Hacked devices glow in team colour; the drone is loud | Official CF guide; siege.gg |
| Pulse (roster) | Can locate Brava herself while she stands still piloting the drone (heartbeat range 10.5 m since Y11S2) | Official Y11S2 notes (range) |
| Out of roster | Solis SPEC-IO reveals the Kludge and Brava's position while she pilots it; Mozzie Pests capture it (capture range 1.75 m since Y11S2); Vigil is invisible to it; Bandit/Kaid electricity destroys it on contact | Official CF guide; Fandom Solis/Vigil/Bandit; Y11S2 notes |

## 7. Change history (Y10S2 Siege X → Y11S3)

| Season / patch | Change affecting Brava | Source |
|---|---|---|
| Pre-history (for spotting old guides) | Y8S1 launch: the Kludge only *overloaded* Aruni gates (temporary). Y8S1.1: many conversion fixes. **Y8S3: Lesion Gu mines became mechanical and unhackable.** | Official Y8S1 addendum, Y8S1.1 notes, Y8S3 DN |
| **Y10S2 Daybreak (Siege X)** | **Kóna Station: the hack now converts it** (heals attackers) instead of overheating/destroying it. Electricity became neutral (hurts/destroys both teams' electronics) and no longer damages players, only slows them. | Official Y10S2 Designer's Notes |
| Y10S3 High Stakes | No Brava change found | Official Y10S3 DN, Y10S3.1–3.3 notes |
| **Y10S4 Tenfold Pursuit** | No direct change. Indirect: **Mute's Signal Disruptor reworked**: it only jams wireless or remote-activated devices, and its radius went up to 2.475 m (from 2.225 m). **The DSEG system was consolidated**: a device inside a disabling field can't be triggered remotely, and an operator inside the field can't trigger devices. | Official Y10S4 DN; Tenfold Pursuit season page |
| **Y11S1 Silent Hunt** | Price cut to 10,000 Renown / 240 credits. Observation Blocker deploy time 1 s (from 2.5 s). Y11S1.2 fixed the glitch VFX on drone cameras after a Mute disruptor is hacked by the Kludge. | Official Y11S1 DN, Y11S1.2 notes |
| Y11S2 System Override | No direct change. Indirect: Mozzie Pest range 1.75 m (from 1.5 m); Pulse scan 10.5 m (from 9 m); BP camera EMP dart radius 0.75 m (from 0.55 m, Y11S2.1); **Y11S2.3: Mute Signal Disruptor radius 2.6 m (from 2.475 m), warning radius 4.875 m (from 4.75 m); Impact EMP radius 2 m (from 1.8 m)** | mp1st Y11S2 notes copy; official Y11S2.1 and Y11S2.3 notes |
| **Y11S3 Split Fire** | No direct change. Claymore (her gadget) damage 155 (from 150). Brava added to the Field Training playlist. | Official Y11S3 DN / Split Fire season page |

**Outdated-guide flags:** a guide is out of date if it says any of the following. Brava can hack Lesion's Gu (outdated since Y8S3). The Kludge overheats Kóna Stations (outdated since Y10S2). Mute jammers act as a permanent EMP bubble (outdated since Y10S4). Electricity damages players (outdated since Y10S2).

## Open questions
- **Kludge hack time** (seconds from starting the hack to conversion/destruction), and the **self-destruct delay** for destroyed devices. Ulo could time both in a custom game on a Bulletproof Camera and a Nitro Cell.
- **Hacks per Kludge (3?)** and **hack range (10 m?)**. Ulo can check the HUD counter and test how far away a hack still starts.
- Does Brava have **2 regular drones on top of her 2 Kludges**, or are the Kludges her only drones? (Check the drone count at the start of the prep phase.)
- Kludge **HP, move speed, and whether it can jump** (and the cooldown if it can).
- Can a converted **Bulletproof Camera's EMP dart** be fired by attackers?
- Exact behaviour of a converted **Proximity Alarm** (does it beep for defenders and show attackers a marker?) and a converted **Observation Blocker** (does it hide attackers from defender cams?).
- How long is the **overheat window** on Skopós' idle shell (siege.gg says 8 s)?
- After the Y10S4 Mute rework, what exactly does a **converted** Mute jammer disable on the defender side?
- Does a Bulletproof Camera EMP dart disable a Kludge (and for how long)?

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/brava — side, squad, CTU, stars, loadout, ability description
- https://news.ubisoft.com/en-us/article/2SY2EgP1gLzVdXkz6uZSYu/rainbow-six-siege-operation-commanding-force-operator-and-gadget-guide — hack flow (range only needed after start), size, Mute/Solis/Mozzie counters
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1KnEHmLAYUzeGMnKUVzwNT — official Brava reveal (1 health / 3 speed, convert-or-destroy)
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/1xLJqGTce4nquXpg4cZYDC/y8s1-commanding-force-patch-notes-addendum — Aruni temp change, launch fixes
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/y68BmuBkDaaIkoOPZEk4c — Y8S1.1 fixes (charges, out-of-range feedback)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/42o6BhsFgmPla9wmiJ5GnJ/y8s2-designers-notes — Observation Blocker blocks the Kludge
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2Btj0mP7e7gVKIODGSLuiX/y8s3-designers-notes — Gu mine became mechanical
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes — Kóna conversion, neutral electricity
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/4czc3hlHtXrd27crELGDcc/y10s3-designers-notes — checked, no Brava change
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes — Mute rework (2.475 m, wireless-only), DSEG rules
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/tenfoldpursuit — Y10S4 DSEG/Mute summary
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5fWCjoCU8toUJiBdMSj0UA/y11s1-designers-notes — Observation Blocker 1 s deploy
- https://mp1st.com/title-updates-and-patches/rainbow-six-siege-y11s1-silent-hunt-solid-snake-patch-3-28-1-000-133 — Y11S1 price change (copy of official notes)
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/ivbm7sXcU7iG89d7wQtlx/y11s12-patch-notes — Kludge/Mute disruptor fix
- https://mp1st.com/title-updates-and-patches/rainbow-six-siege-system-override-update-june-2-via-patch-3-38-1-000-143 — Y11S2 Mozzie/Pulse/Solis changes (copy of official notes)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/7tAny5W9p4yrHmIiH51noI/y11s21-patch-notes — BP camera EMP dart 0.75 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2EIn06EmkAIG7su2fpITue — Y11S2.3: Mute radius 2.6 m / warning 4.875 m; Impact EMP 2 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/PONCuRt8LaCr3O31NkBQb/y11s3-designers-notes — Y11S3 (Claymore 155, no Brava change)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/splitfire — Field Training addition
- https://rainbowsix.fandom.com/wiki/Brava — hack result lists, 2 Kludges, counters, Mozzie interplay (also old revisions via API)
- https://rainbowsix.fandom.com/wiki/Mute — jammer effects on the Kludge, converted jammer behaviour
- https://news.ubisoft.com/en-us/article/6md8NyzcybEjZ2bMROA5fP/rainbow-six-siege-operation-twin-shells-operator-and-gadget-guide — official: the active shell is immune to hacks and Brava's sabotage; the Kludge overheats and destroys the inactive shell (with a warning)
- https://siege.gg/news/rainbow-six-siege-operator-guide-skopos — 8 s overheat window (low-priority source)
- https://rainbowsix.fandom.com/wiki/Skopós — Kludge overheats/destroys the inactive shell
- https://rainbowsix.fandom.com/wiki/Lesion — Gu mechanical since Y8S3
- https://rainbowsix.fandom.com/wiki/Thermite_(Siege) — "three hacking charges" remark, Brava/Thermite synergy
- https://rainbowsix.fandom.com/wiki/Bulletproof_Camera — Dokkaebi-hacked cams give no EMP access
- https://rainbowsix.fandom.com/wiki/Bandit , https://rainbowsix.fandom.com/wiki/Solis , https://rainbowsix.fandom.com/wiki/Vigil_(Siege) , https://rainbowsix.fandom.com/wiki/Mozzie , https://rainbowsix.fandom.com/wiki/Drone — out-of-roster counters; drone jump cooldown
- https://siege.gg/news/rainbow-six-siege-new-operator-brava — 2 Kludge + 2 standard drones, one-bullet fragility
- https://siege.gg/news/here-is-why-sieges-new-operator-brava-is-going-to-be-a-game-changer-with-her-hacking-drone — "a few seconds" hack, Karpazis quotes
- https://www.dualshockers.com/rainbow-six-siege-best-brava-loadout-gadget-strategies/ — 3 hacks per drone, 10 m range, Black Mirror not hackable (low-priority source)
- https://www.strafe.com/news/read/the-defenders-worst-nightmare-brava-in-rainbow-six-siege/ — second-Kludge save play, Mozzie list
