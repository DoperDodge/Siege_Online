# Gadget Interactions: notes for `interactions.csv`
Verified against: Y11S3 (Operation Split Fire, incl. Y11S3.1 patch of 2026-09-22) — researched 2026-09-29
Confidence: medium. Rules that Ubisoft states directly (Mute's Y10S4 jam rule, DSEG, Jegeo's Y11S3 connection rule, Kludge vs Skopós, Claymore 155, Exothermic 220, hatch HP pool) are high confidence. Most per-pair "X destroys Y" rows rest on the current Fandom revision, read in September 2026 (162 of 343 rows). 76 rows are UNVERIFIED, and 27 of those are pure placeholders with no direct source.

This file documents `research/interactions.csv`. PLAN.md Phase 8 needs one scripted test per CSV row. The inputs were the operator files in `research/operators/`, plus `gadgets.md`, `intel.md`, `destruction.md` and `core_mechanics.md`. I fetched five sources directly to settle conflicts: the Fandom Mute, Hard Breach Charge and Observation Blocker pages, the official Y5S3, Y8S2 and Y10S4 Designer's Notes, the Y10S4.1 patch notes, and the Y9S2 New Blood season page.

---

## 1. How to read the CSV

| Column | Meaning |
|---|---|
| `source` | The actor: gadget, ability, weapon, player action or environment. |
| `target` | What it acts on. Each (`source`, `target`) pair appears **once**, so the pair can serve as a stable test name. |
| `result` | A short, testable outcome from the vocabulary in §1.1. If `verified=UNVERIFIED` **and** the notes start with `PLACEHOLDER`, the result is a best guess, not a Siege fact. |
| `notes` | Conditions, numbers and caveats. Numbers marked UNVERIFIED in the notes are placeholders even when the row itself is `yes`. |
| `source_url` | One or more URLs, separated by ` ; `, carried over from the research files. Official Ubisoft URLs come first where they exist. |
| `verified` | `yes` means a source states the behaviour and no higher-priority source contradicts it. `UNVERIFIED` covers four cases: inferred from a general rule, sources conflict, a low-priority source only, or a placeholder. |
| `season_verified` | The newest official patch or season that states the rule (e.g. `Y10S4`). The research agents checked each of these for later changes through Y11S3.1. The other values are: `Fandom 2026-09` (only the current Fandom revision states it, date of the underlying game change unknown), `undated (siege.gg)` / `undated (guide)` (low-priority source only), `Y10S4 (inferred)` / `inferred` (derived from an official general rule, not stated for this pair), and `none` (no source; placeholder). |

**Direction:** "source affects target". So `player.attacker → generic.claymore = no_trigger` means an attacker crossing the laser does not set it off. `mute.signal_disruptor → generic.breach_charge = jam_prevents_detonation` means the jammer stops the charge.

**Striker and Sentry:** their gadgets behave exactly like the `generic.*` rows. Only two rule rows exist for them: `striker.gadget_kit` and `sentry.gadget_kit`, each meaning "any two different gadgets from the pool". Dokkaebi's Y11S3 Breach Charge is covered by the `generic.breach_charge` rows. Brava's Claymore is covered by `generic.claymore`.

### 1.1 Result vocabulary
| Result | Meaning |
|---|---|
| `hack_convert` / `hack_destroy` | Kludge takes control of the device (allegiance flips), or the device self-destructs after a short delay. |
| `hack_disables_dart` | After conversion, the converted camera's EMP dart can't be fired. |
| `disable_while_in_radius` | Stops working while inside the jammer sphere (2.6 m); recovers when it leaves or the jammer is gone. |
| `jam_prevents_detonation` / `jam_prevents_upload` | The remote trigger is blocked while the device **or** its operator is inside an active enemy-aligned jam radius. |
| `interrupt_upload` | Cancels a Jegeo Payload upload that is in progress. The phone does not explode. |
| `dseg_disable` | Disabled State for Electronic Gadgets: temporary, re-applying refreshes the timer, and the device can't be triggered wirelessly while affected. |
| `dseg_operator` | DSEG applied to an operator: all optics disabled, no observation tools, no triggering of remote devices. |
| `destroy`, `destroy_after_hits:n`, `destroy_if_too_close`, `destroy_if_on_wall`, `destroy_weak_point_only` | Removed from the world, with the stated condition. |
| `damage:n`, `damage`, `damage:lethal…` | HP damage. A bare `damage` means the amount is unknown or follows a curve. |
| `sting:3+12/2s` | Gu: 3 hp on contact, then 12 hp every 2 s. |
| `blind:5s` | Stun blind + deafen. |
| `slow:…` | Movement penalty. |
| `blocks`, `blocks_vision`, `blocks_path`, `blocks_explosion_damage`, `passes_through`, `passes_under`, `laser_passes_gaps`, `one_way_vision` | Physical or visual blocking rules. |
| `breach`, `breach_small`, `breach_large`, `breach_full`, `breach_instant`, `breach_delayed:1.75s`, `breach_los_only`, `breach_melee_large`, `open`, `hole_round` | Surface destruction. `breach_los_only` means a see-through/shoot-through hole you cannot move through (soft floors). |
| `cannot_place`, `placeable`, `placeable_defender_side_only`, `placeable_after_prep`, `placeable_destroy`, `placeable_drill_through` | Placement rules. |
| `shatter`, `glass_opaque`, `eject` | Glass states (Black Mirror, Bulletproof Camera, Deployable Shield). |
| `knockdown`, `guard_break`, `absorb_66pct`, `force_unequip_to_remove` | Ballistic Shield reactions. |
| `disable_swap`, `disable_swap_for_round`, `block_obs_tools` | Skopós shell swapping. |
| `detects`, `alarm`, `view_feed:20s`, `deny_access_victim`, `signal_lost:10s` | Intel. |
| `trigger`, `trigger_sting`, `no_trigger`, `delayed_trigger`, `concuss` | Activation rules. |
| `no_effect`, `no_slow`, `no_block`, `blocked` | Explicit non-interactions, and one block on reinforcing. |
| `equip_two_distinct`, `hackable_like_phone`, `blocks_plant_and_drop`, `upload_then_explode:40`, `slow:50%;damage:5hp/s_moving` | One-off rules (see the row notes). |

---

## 2. ID vocabulary (60 IDs)

**Attacker uniques**
- `brava.kludge_drone`: hacking drone (2 per round).
- `fuze.cluster_charge`: the APM-6 charge and its sub-grenades.
- `fuze.ballistic_shield`: the primary-weapon shield option.
- `thermite.exothermic_charge`
- `striker.gadget_kit`: rule-only ID. Its target is `loadout.attacker_generic_pool`.
- `dokkaebi.jegeo_payload`: the Y11S2 remaster ability.
- `dokkaebi.tablet`: Dokkaebi's device during an upload.
- `dokkaebi.camera_hack`: hacking an eliminated defender's phone for 20 s of camera access.
- `sledge.breaching_hammer`

**Defender uniques**
- `sentry.gadget_kit`: rule-only ID. Its target is `loadout.defender_generic_pool`.
- `skopos.shell_active`
- `skopos.shell_idle`: the inactive shell, which is an observation tool.
- `skopos.idle_shell_shield`: the idle shell's barrier.
- `skopos.circuit_board`: dropped by a destroyed shell.
- `mira.black_mirror`
- `mira.black_mirror_canister`
- `lesion.gu_mine`: Lesion is the provisional stand-in for the plan's "Legion".
- `pulse.cardiac_sensor`
- `mute.signal_disruptor`
- `mute.signal_disruptor_converted`: a jammer after a Brava hack.

**Generic attacker gadgets** (the full Y11S3 pool per `gadgets.md`)
- `generic.breach_charge`
- `generic.hard_breach_charge`
- `generic.claymore`
- `generic.frag`
- `generic.stun`
- `generic.smoke`
- `generic.impact_emp`

**Generic defender gadgets**
- `generic.barbed_wire`
- `generic.deployable_shield`
- `generic.nitro_cell`
- `generic.impact_grenade`
- `generic.proximity_alarm`
- `generic.proximity_alarm_converted`: after a Brava hack.
- `generic.bulletproof_camera`
- `generic.bulletproof_camera_dart`: its EMP dart.
- `generic.observation_blocker`
- `generic.observation_blocker_converted`: after a Brava hack.

**Intel**
- `drone.standard`
- `camera.default`

**Surfaces** (classes match `destruction.md`)
- `surface.soft_wall`
- `surface.soft_floor`
- `surface.hatch`: unreinforced.
- `surface.reinforced_wall`
- `surface.reinforced_hatch`
- `surface.barricade`: door or window.
- `surface.hard_wall`

**Players and actions**
- `player.attacker`
- `player.attacker_dbno`
- `player.defender`
- `player.melee`: a normal knife hit from either side.
- `weapon.bullet`: any gunfire.
- `action.reinforce`: a defender deploying a reinforcement.
- `environment.outdoors`
- `objective.defuser`
- `defender.dropped_phone`

**Siege X ingredients** (Oregon has had ingredients since Y11S1, per `destruction.md`)
- `ingredient.gas_pipe`
- `ingredient.fire_extinguisher`
- `ingredient.metal_detector`

**Out of scope on purpose:** operators outside our roster and their gadgets. That covers Bandit/Kaid electricity, Mozzie, Thatcher, IQ, Solis, Twitch, Jäger/Wamai projectile catchers, Castle panels, Noor and so on. They appear only as context in the operator files. Obvious non-interactions, such as smoke vs a reinforced wall, are also left out.

---

## 3. Rows by source

Total: **343 rows**. 267 are `yes`; 76 are `UNVERIFIED`.

| source | rows | UNVERIFIED |
|---|---|---|
| `weapon.bullet` | 27 | 2 |
| `mute.signal_disruptor` | 21 | 5 |
| `fuze.cluster_charge` | 21 | 2 |
| `sledge.breaching_hammer` | 21 | 10 |
| `thermite.exothermic_charge` | 20 | 3 |
| `generic.frag` | 20 | 3 |
| `generic.breach_charge` | 18 | 1 |
| `generic.impact_emp` | 17 | 4 |
| `brava.kludge_drone` | 15 | 2 |
| `generic.impact_grenade` | 13 | 1 |
| `player.melee` | 13 | 0 |
| `generic.claymore` | 12 | 1 |
| `generic.nitro_cell` | 11 | 3 |
| `dokkaebi.jegeo_payload` | 10 | 6 |
| `generic.bulletproof_camera_dart` | 10 | 4 |
| `mute.signal_disruptor_converted` | 9 | 5 |
| `generic.hard_breach_charge` | 8 | 2 |
| `generic.stun` | 8 | 2 |
| `lesion.gu_mine` | 7 | 3 |
| `mira.black_mirror` | 7 | 2 |
| `generic.smoke` | 6 | 3 |
| `generic.observation_blocker` | 5 | 1 |
| `pulse.cardiac_sensor` | 5 | 1 |
| `action.reinforce` | 5 | 1 |
| `dokkaebi.camera_hack` | 4 | 2 |
| `generic.proximity_alarm` | 3 | 1 |
| `generic.barbed_wire` | 3 | 0 |
| `generic.deployable_shield` | 3 | 1 |
| `fuze.ballistic_shield` | 2 | 1 |
| `skopos.shell_active` | 2 | 1 |
| `drone.standard` | 2 | 0 |
| `environment.outdoors` | 2 | 0 |
| `ingredient.gas_pipe` | 2 | 1 |
| `striker.gadget_kit` | 1 | 0 |
| `sentry.gadget_kit` | 1 | 0 |
| `player.attacker` | 1 | 0 |
| `generic.bulletproof_camera` | 1 | 0 |
| `generic.observation_blocker_converted` | 1 | 1 |
| `generic.proximity_alarm_converted` | 1 | 1 |
| `skopos.shell_idle` | 1 | 0 |
| `mira.black_mirror_canister` | 1 | 0 |
| `camera.default` | 1 | 0 |
| `ingredient.fire_extinguisher` | 1 | 0 |
| `ingredient.metal_detector` | 1 | 0 |

---

## 4. Rules the rows are built on (implement these once, then test per row)

1. **Mute jam rule (official, Y10S4; radius 2.6 m since Y11S2.3):** a jammer affects only gadgets "that have signals coming in or out of the radius". A remote action between operator O and device D is blocked if O **or** D is within 2.6 m of an active enemy-aligned jammer. The operator-or-device part comes from Fandom and matches the DSEG wording. Automated and mechanical devices are unaffected. Optics are never affected. Drones and the Kludge lose control inside the radius; the warning ring is 4.875 m.
2. **DSEG (official, Y10S4):** caused by the Impact EMP (2 m, 9 s placeholder) and the Bulletproof Camera dart (0.75 m, duration UNVERIFIED). An affected device can't be triggered wirelessly. An affected operator can't trigger remote devices, loses all optics, and can't use observation tools. Re-applying refreshes the timer. The Skopós active shell is the exception: it is not disabled, but it loses observation tools.
3. **Explosions destroy these defender gadgets:** Deployable Shield (instantly), Barbed Wire, Gu, jammer, Bulletproof Camera, Nitro Cell, Proximity Alarm, Observation Blocker, and the Skopós idle-shell barrier. The **Black Mirror glass is explosion-proof**; it is removed only when its soft host wall is destroyed, by a thermal breach, or through its canister. The destruction radius and the damage radius are separate values (RealBlast); see `destruction.md` §5.
4. **Non-electronic items:** Barbed Wire, Deployable Shield, Impact Grenade, Black Mirror and Gu (mechanical since Y8S3). EMP, the Kludge and jammers do nothing to them.
5. **Friendly devices:** a jammer never affects its own team's devices. After a Brava hack its allegiance flips, and what it then does to defenders is almost entirely UNVERIFIED.

---

## 5. Conflicts found and how each was resolved

| # | Conflict | Sources involved | Resolution |
|---|---|---|---|
| 1 | **Does Mute's jammer stop the Hard Breach Charge after Y10S4?** `mute.md` says no, quoting Fandom HBC "no interaction with jammers". I fetched that page: the quote is trivia about the **scrapped MK1 prototype**. The page's current Usage text says Mute's jammers *can* disable HBCs. The current Fandom Mute page also lists HBCs under "remotely-triggered devices". But the HBC is a timed fuse with no remote trigger (official Y5S3 DN; Fandom HBC itself), and the official Y10S4 rule is "signals coming in or out". `gadgets.md`, `fuze.md`, `striker.md`, `thermite.md` and `destruction.md` all left it UNVERIFIED. | Official Y10S4 DN, Y5S3 DN vs Fandom Mute + Fandom HBC | The official rule wins: **`no_effect`, UNVERIFIED**. Implement it as a config flag (`mute_jams_hbc`, default false). `mute.md`'s citation is wrong and should be corrected by its owner. |
| 2 | **Does Mute stop Claymores?** `striker.md` says Fandom says yes (the Y6S1 change). `mute.md` and `gadgets.md` say Fandom's current page says no. I fetched the current Fandom Mute page: under Counters it says "Signal Disruptors will not stop … Claymores". This matches the official Y10S4 "automated devices" example (SELMA). | Fandom Mute (current), Y10S4 DN vs `striker.md`'s reading of Fandom patch history | **`no_effect`, yes.** `striker.md` was reading the historic Y6S1 patch entry. |
| 3 | **Mute vs Fuze's Cluster Charge after the Y10S4.1 fix.** The official Y10S4.1 patch notes read "FIXED - Mute's Signal Disruptor can deactivate Fuze's Cluster Charge" (checked directly). Read literally, jammers no longer stop the charge. That contradicts the official Y6S3 DN, the Y10S4 rule (the Cluster is remote-triggered, and DSEG explicitly names "Cluster charges"), and current Fandom Mute/Fuze ("sub-grenades will not deploy"). | Y10S4.1 PN vs Y6S3/Y10S4 DN, Fandom | **`jam_prevents_detonation`, UNVERIFIED.** The trigger is blocked while the charge or Fuze is in the radius. A charge that has already triggered or is drilling is never cancelled or permanently deactivated. This is our reading of the bug fix. Ulo should test it. |
| 4 | **What a Brava-hacked jammer does.** Fandom only says it "disrupts Defender gadgets instead". `brava.md`, `mute.md`, `pulse.md` and `sentry.md` all leave the specifics open. A Y8S1.1 fix hints that it affected Bulletproof Cameras before Y10S4. | Fandom Brava/Mute, Y8S1.1 PN | Rows under `mute.signal_disruptor_converted`. It stops jamming attacker devices (`yes`). Its effect on defender devices is mostly placeholders: it blocks Nitro detonation, disables cams in radius, and blocks Skopós swap, all UNVERIFIED. Pulse's sensor and Gu are unaffected (Gu = yes, because it is mechanical). |
| 5 | **Barbed-wire damage.** `gadgets.md` calls Fandom's 5 hp/s "UNVERIFIED and doubtful". `sentry.md` cites the official New Blood page. I fetched the official Y9S2 New Blood season page: "BARBED WIRE – Deals 5hp damage every second while moving through it." No later reversal was found (Siege X changed only *electrified* wire). | Official Y9S2 vs `gadgets.md` | **Official: slow 50%, no sprint, 5 hp/s while moving, `yes`.** Whether it also damages defenders is UNVERIFIED. `gadgets.md` should be updated. |
| 6 | **Impact EMP vs Observation Blocker: destroy or disable?** Fandom OB (fetched): "can also be destroyed with the EMP Grenade". `sentry.md` follows Fandom. `gadgets.md` says the EMP disables it. The official Y8S2 DN (fetched) lists its vulnerabilities as "Bullets, laser, melee, explosives" (no EMP) and its type as Electronic. The Y10S4 DSEG model disables electronics; it does not destroy them. | Fandom OB vs Y8S2 DN + Y10S4 DN | **`dseg_disable`, UNVERIFIED.** |
| 7 | **Thermite vs Black Mirror.** The official Thermite tip lists Black Mirrors among gadgets that "deny" Exothermic charges. Fandom, siege.gg and r6siegecenter say a thermal breach on the Mirror's host wall destroys it completely. | Official op-page tip vs Fandom + guides | **`destroy`, UNVERIFIED.** Likely reading: the charge can't go directly on the glass, but breaching that wall section removes the Mirror. |
| 8 | **Does destroying Skopós' idle shell eliminate her?** The Ubisoft operator page says she loses "both shells if one is destroyed". The official Twin Shells guide and a Y9S3 bug fix say the idle shell's destruction is not an elimination. | Ubisoft op page vs official guide + Y9S3 addendum (as resolved in `skopos.md`) | Chosen as in `skopos.md`: **idle destroyed = no elimination, no more swaps** (`weapon.bullet → skopos.shell_idle`). |
| 9 | **Shield bash damage.** Official Y9S1: 65 hp + pushback. Current Fandom: no damage. `core_mechanics.md`: bash only downs (older Fandom). | DN Y9S1 vs Fandom | **Official 65 hp, UNVERIFIED** (`fuze.ballistic_shield → player.defender`). |
| 10 | **Claymore trigger delay.** `striker.md` says "0.5 s detonation delay" (Fandom). The official Y9S3 DN removed the activation-to-explosion delay. | Y9S3 DN vs Fandom | **Instant** (official). |
| 11 | **Frag cooking.** `striker.md` says "Cookable frag" (Fandom). The official Y8S4 DN says frags cannot be cooked (4 s fuse, 2 s after the first bounce). | Y8S4 DN vs Fandom | **Not cookable** (official). |
| 12 | **Jammer radius.** `destruction.md` §6.1 says 2.475 m. The official Y11S2.3 patch notes say 2.6 m. | PN Y11S2.3 vs `destruction.md` | **2.6 m** everywhere in the CSV. |
| 13 | **EMP vs Gu mines.** Fandom's EMP page still lists Gu. The official Y8S3 DN made Gu mechanical. | Y8S3 DN vs Fandom EMP | **`no_effect`, yes.** |
| 14 | **Dokkaebi's gadgets.** Fandom still shows the Impact EMP; the official Y11S3 DN and operator page say Smoke + Breach Charge. | Official vs Fandom | Official. Dokkaebi has no EMP rows. Her Breach Charge = `generic.breach_charge`. |
| 15 | **Kludge vs Black Mirror.** `brava.md` says no hack (dualshockers + absence from the Fandom lists). `mira.md` calls it UNVERIFIED in game. | Low-priority explicit + Fandom absence | **`no_effect`, yes.** Nothing contradicts it and the Mirror is not electronic. |
| 16 | **Impact EMP vs Pulse's sensor.** `gadgets.md` counts it as EMP-affected (Fandom EMP list). `pulse.md` says it freezes. `striker.md` and `sledge.md` note that the 5 s value is for Thatcher's EMP. | Fandom only | **`dseg_disable`, UNVERIFIED.** Pulse must be inside 2 m; duration unknown. |
| 17 | **Striker's stun count** (3 on Fandom's Striker page vs 2 on the generic page). This does not affect any interaction row. It is noted in the `striker.gadget_kit` row only. | Fandom vs Fandom | Left to `gadgets.md`. |

---

## Open questions
All of these can be checked in a Custom Game (friendly fire on where needed). Each links to the UNVERIFIED rows it would settle. They are in rough priority order.

1. **Mute vs Hard Breach Charge.** Put a Mute jammer about 1 m from a reinforced wall. As Striker or Fuze, plant a Hard Breach Charge on that wall. Does it still blow after 4 s? (Conflict 1.)
2. **Mute vs Fuze Cluster Charge.** (a) Fuze stands inside a jammer and triggers a charge planted outside. (b) The charge is inside a jammer and Fuze is outside. (c) Mute drops a jammer next to a charge that is already drilling a reinforced wall. Which cases stop it? (Conflict 3.)
3. **Brava-hacked Mute jammer.** Within 2.6 m of a converted jammer: can a defender still detonate a Nitro Cell? Do defender cameras (default and Bulletproof) go to static? Can Skopós swap into a shell inside it? Does Pulse's sensor still work?
4. **Other Brava conversions.** After a Kludge converts a Proximity Alarm, does it beep for defenders walking by? Does a converted Observation Blocker hide attackers from defender cameras? Can attackers fire a converted Bulletproof Camera's EMP dart?
5. **Impact EMP on an Observation Blocker.** Destroyed, or switched off for a few seconds? (Conflict 6.)
6. **Impact EMP on Pulse.** If Pulse is within 2 m while scanning, does the sensor freeze, and for how long?
7. **Dokkaebi counters.** Does a teammate's Impact EMP (Sledge/Striker) on the defender Dokkaebi is calling cancel the upload? Does a Bulletproof Camera dart on Dokkaebi cancel it? If Dokkaebi herself stands inside a Mute jammer, can she start or continue an upload? Does a jammer stop attackers viewing a hacked camera that sits inside its radius?
8. **Jegeo and Nitro Cells.** After a defender's phone explodes, can he still detonate his Nitro Cell? (Fandom calls the Nitro detonator a phone.)
9. **Jegeo fire.** Does the 5 s fire hurt attackers and Skopós shells? Does the 40 hp explosion hit Skopós' active shell?
10. **Thermite vs Black Mirror.** Can the Exothermic Charge go directly over the Mirror glass from the attacker side? What happens to a Mirror when its reinforced wall is breached? Does a Hard Breach Charge on that wall destroy the Mirror? (Conflict 7.)
11. **Sledge's hammer vs gadgets.** With one swing: Proximity Alarm, Observation Blocker, Nitro Cell, Mute jammer, Gu mine (is he stung?), Mirror glass (shatter?), Skopós idle-shell barrier, a gas pipe. Is it still a one-hit kill on a defender and on Skopós' active shell?
12. **Hard Breach Charge details.** Can gunfire destroy a planted HBC? Does one HBC still fully open a reinforced hatch? Does a Bulletproof Camera dart on a planted HBC do anything?
13. **Claymore.** Does the blast damage nearby attackers (Brava/Striker)? Does it destroy a barricade or make a hole in a soft wall? Does it destroy Gu mines?
14. **Drones vs traps.** Does a drone or the Kludge set off a Proximity Alarm or a Gu mine by driving over or near it? Can a Deployable Shield stop a drone (jumping over it)?
15. **Barbed wire.** Does it also deal the 5 hp/s to defenders moving through it?
16. **Stun and smoke values.** Is a stun still about a 5 s blind (15 m facing, 3 m facing away)? Is the smoke cloud about 5 m across for about 10 s? Is Skopós' active shell stunned? Does the idle-shell camera see through smoke?
17. **Skopós.** Can Fuze plant a Cluster Charge on the idle shell's barrier? Can Dokkaebi's camera hack view the idle-shell camera? Does the shell punch break a barricade or hatch in one hit, like Aruni's?
18. **Damage numbers.** Frag at point blank on a 100-hp operator. Nitro Cell maximum (about 171?). One Cluster sub-grenade. The far-side Breach Charge. Kill-feed or health checks in Custom Game.
19. **Pulse.** Do downed (DBNO) attackers still show as heartbeats?
20. **Gu and the defuser.** Can a needled attacker plant or drop the defuser?
21. **Mira placement.** Can a soft wall that already has a Mirror still be reinforced? Confirm that a Mirror can't go on barricades, floors or hatches.
22. **Impact EMP on friendly drones.** Does an attacker's EMP affect their own team's drones?
23. **Defender explosives vs a planted Breach Charge.** Does a Nitro Cell or Impact Grenade blast (without breaking the wall) destroy the charge?
24. **Thermite on barricades.** Can the Exothermic Charge be placed on a door or window barricade?
25. **Ingredients on Oregon.** Does gas-pipe fire destroy drones or gadgets it touches? Where are Oregon's gas pipes and extinguishers? Are there any metal detectors on Oregon? (Cross-check with `research/oregon/`.)
26. **Jammer vs a Kludge hack in progress.** Can a Kludge outside a jammer hack a device that sits **inside** the jammer's radius?

## Sources
Research inputs (this repo): `research/operators/{brava,fuze,thermite,striker,dokkaebi,sledge,sentry,skopos,mira,lesion,pulse,mute}.md`, `research/operators/legion_name_check.md`, `research/gadgets.md`, `research/intel.md`, `research/destruction.md`, `research/core_mechanics.md`.

Fetched directly by this task (2026-09-29, generic user agent, scratch copies only):
- https://rainbowsix.fandom.com/wiki/Mute — current list: HBC listed as jammed, Claymores "will not stop", Jegeo immunity inside the radius (conflicts 1 and 2)
- https://rainbowsix.fandom.com/wiki/Hard_Breach_Charge — current usage text (jammable) vs MK1 trivia "no interaction with jammers" (conflict 1)
- https://rainbowsix.fandom.com/wiki/Observation_Blocker — "destroyed with the EMP Grenade" (conflict 6)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2LqpNY95OdSdWBB8SBEmbg/y5s3-preseason-designers-notes — HBC introduction; no Mute statement; hatch 1M pool
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/42o6BhsFgmPla9wmiJ5GnJ/y8s2-designers-notes — Observation Blocker type/HP/vulnerabilities (no EMP); blocks the Kludge
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes — Mute "signals coming in or out", "Jams wireless signals"; DSEG names Cluster/Exothermic/breach charges
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3aYq6D0VHo1HJ5ZNfLtiNs/y10s41-patch-notes — "FIXED - Mute's Signal Disruptor can deactivate Fuze's Cluster Charge" (conflict 3)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/newblood — "BARBED WIRE – Deals 5hp damage every second while moving through it" (conflict 5)

Official Ubisoft, carried over from the research files (see each CSV row):
- Operator pages: https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/ + `brava`, `fuze`, `thermite`, `striker`, `dokkaebi`, `sledge`, `sentry`, `mira`, `pulse` — loadouts, tips (Sledge gadget destruction, Thermite "deny" tip, Fuze fan pattern)
- https://news.ubisoft.com/en-us/article/2SY2EgP1gLzVdXkz6uZSYu/rainbow-six-siege-operation-commanding-force-operator-and-gadget-guide — Kludge hack flow, default cams, fragility
- https://news.ubisoft.com/en-us/article/6md8NyzcybEjZ2bMROA5fP/rainbow-six-siege-operation-twin-shells-operator-and-gadget-guide — shells vs Kludge/EMP/explosives
- https://news.ubisoft.com/en-us/article/7GuRzEQEr7vbP8K6Y6RLl2/rainbow-six-siege-operation-new-blood-operator-remaster-and-balancing-guide — Gadget Kit "two different" rule
- https://news.ubisoft.com/en-us/article/75JAC7c5Ka6wnsxMyq2Ylz/rainbow-six-siege-operation-system-override-dokkaebi-remaster-calypso-casino-map-and-ranked-30 — Jegeo effects, phone-dependent gadget list
- https://news.ubisoft.com/en-us/article/4qqpGJZSWrrS3Ko2hYvviK/rainbow-six-siege-operation-split-fire-new-operator-noor-3v3-arcade-mode-wasteland-circuit-event-and-more — Jegeo interruptible by jammers
- https://news.ubisoft.com/en-us/article/55e9bGaVCdO52trbclOhpf/rainbow-six-siege-x-showcase-everything-you-need-to-know — ingredients
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/1QkezaGoRkDWqcQ6duGvtk/dev-blog-explosions-shrapnel-in-y5s1 — deployable shields block explosion damage
- Season pages: https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/daybreak , .../seasons/tenfoldpursuit , https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/seasons/highcalibre
- Designer's Notes: Y5S1 (…/3LopsZumVn97iC5NoSGu8j/…), Y5S2 (…/5uO2YSAhA1TzWclMco3A13/…), Y6S3 (…/2zsUnVBdSsc10rirkPl1K5/…), Y6S4 (…/6b2rj9Kf1onAvpLRqvNB1r/…), Y7S3 (…/2vKaDckg5VPV1ViA4p8KM/…), Y8S3 (…/2Btj0mP7e7gVKIODGSLuiX/…), Y8S4 (…/1BZt0t9asNHvdTBHU9OUGZ/…), Y9S1 (…/3jBlCdtRBQx2sCjmY2umNu/…), Y9S1.3 (…/2D4HsYOBEEg0wEW5dim34o/…), Y9S3 (…/1P21T5Rllq7X72E0zSGpEG/…), Y10S2 (…/8dJbwMqIt5Y8lZgwJRjWZ/…), Y11S1 (…/5fWCjoCU8toUJiBdMSj0UA/…), Y11S2 (…/2MNhboDBmsQKkWb5p8zqsg/…), Y11S2.2 (…/77rztlEyeqhZVqROCW0ZV7/…), Y11S3 (…/PONCuRt8LaCr3O31NkBQb/…) — full URLs are in the CSV
- Patch notes: Y8S1.1 (…/y68BmuBkDaaIkoOPZEk4c), Y9S1.3 (…/6ZsfBMeGT0Anuu0IHjDQ0P/…), Y9S3 addendum (…/5ETMcAwe6xWaSvEBBMM3Jo/…), Y10S2.0 addendum (…/ixjnXu9g80eFVW3X7cNFF/…), Y10S2.2 (…/3owjfmZ0uv2zFYU99TpkSw/…), Y10S4.2 (…/3HSeMj81P0CL3m0N8FS5tK/…), Y11S1.2 (…/ivbm7sXcU7iG89d7wQtlx/…), Y11S2.1 (…/7tAny5W9p4yrHmIiH51noI/…), Y11S2.2 (…/3IoMKS8f3AHlOwBQXfiytt/…), Y11S2.3 (…/2EIn06EmkAIG7su2fpITue/…), Y11S3.1 (…/3WMly2DNZqv1GpUK9GNGm5/…) — full URLs are in the CSV

Fandom (lower priority; human URLs):
- https://rainbowsix.fandom.com/wiki/ + `Brava`, `Fuze_(Siege)`, `Thermite_(Siege)`, `Sledge_(Siege)`, `Breaching_Hammer`, `Striker_(Recruit)`, `Sentry_(Recruit)`, `Mira_(Siege)`, `Skop%C3%B3s`, `Lesion`, `Pulse_(Siege)`, `Heartbeat_Sensor`, `Dokkaebi` — operator interaction details
- `Breach_Charge/Siege`, `Claymore`, `M67/Siege`, `Stun_Grenade/Siege`, `Smoke_Grenade`, `EMP_Grenade`, `Barbed_Wire`, `Deployable_Shield`, `C4`, `Impact_Grenade`, `Proximity_Alarm`, `Bulletproof_Camera`, `Drone`, `CCTV`, `Ballistic_Shield` — generic gadget behaviour
- `Destruction`, `Reinforcement`, `Barricade` — surface rules
- Patch pages 3.2.2, 4.1.0, 5.1.0, 5.1.1, 10.4.2 — barbed-wire slow, Breach Charge damage, Gu vs DBNO, Gu vs shields, EMP vs metal detectors

Other (lowest priority):
- https://siege.gg/news/ + `rainbow-six-siege-operator-guide-skopos` (Kludge 8 s overheat), `rainbow-six-siege-new-operator-brava`, `proximity-alarm`, `bulletproof-camera`, `barbed-wire`, `deployable-shield`, `impact-grenade`, `stun-grenade`, `3296-rainbow-six-siege-operator-guide-mira`, `siege-x-y10s2-2-patch-notes`, `destructible-ingredients-to-change-the-game-in-siege-x`
- https://r6siegecenter.com/guides/operators/defenders/mira/ — Mirror placement, canister, drone-blocking tip
- https://www.dualshockers.com/rainbow-six-siege-best-brava-loadout-gadget-strategies/ — Kludge can't hack Black Mirrors
- https://www.trichotome-design.com/blog/2024/9/15/skops-behind-the-scenes — Skopós EMP collar
- https://liquipedia.net/rainbowsix/Sledge — hammer counters Skopós (page otherwise outdated)
