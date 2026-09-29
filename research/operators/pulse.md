# Pulse
Verified against: Y11S3 (Operation Split Fire, incl. Y11S3.1 patch of 2026-09-22) — researched 2026-09-29
Confidence: medium. Loadout, ratings, the 10.5 m range and the weapon changes are official. The sensor's field-of-view shape, team-sharing/ping behaviour and DBNO detection are documented only by old wiki text or third-party guides, and are marked UNVERIFIED.

> **PLAN.md baseline is incomplete:** Pulse now also has the **Reaper MK2** secondary (added Y10S3). His gadget options are **Nitro Cell, Deployable Shield, Observation Blocker**. Sensor range is **10.5 m** (was 9 m until Y11S2). Most guides and the Fandom page still say 9 m.

## Identity
| Field | Value | Source |
|---|---|---|
| Side | Defender | Ubisoft operator page |
| CTU | SWAT (FBI SWAT) | Ubisoft operator page |
| Squad | Nighthaven | Ubisoft operator page |
| Specialties | Intel, Support | Ubisoft operator page |
| Health rating | **1** (of 3) → **100 HP** | Ubisoft page (1 active star); HP mapping: Fandom "Armor and Speed" |
| Speed rating | **3** (of 3) | Ubisoft operator page |
| Speed in m/s | UNVERIFIED here → use speed-3 value from `research/core_mechanics.md` | — |
| Difficulty | 3 (of 3) | Ubisoft operator page |
| Introduced | Launch operator (2015, "Pathfinder") | Fandom |

## Loadout (official Ubisoft operator page, checked 2026-09-29)
| Slot | Options | Notes |
|---|---|---|
| Primary | **UMP45** (SMG), **M1014** (shotgun) | UMP45 damage 42 (from 38) in Y10S4.2. M1014 damage 30 (from 28) in Y11S3.1 |
| Secondary | **5.7 USG** (handgun), **M45 MEUSOC** (handgun), **Reaper MK2** (machine pistol) | Reaper MK2 added Y10S3. Recoil refinements in Y10S3 and Y11S2.3 |
| Secondary gadget (pick 1) | **Nitro Cell** (×1), **Deployable Shield** (×1), **Observation Blocker** (×3) | Counts from Fandom |
| Unique ability | **HB-5 Cardiac Sensor** (heartbeat sensor) | — |

Full weapon stats go in `research/weapons.csv`.

## Unique ability: HB-5 Cardiac Sensor
| Property | Current value | Source / confidence |
|---|---|---|
| Type | Hand-held electronic device. Pulse equips it like a gadget and **cannot shoot or use other gadgets while it is up** | Official tips ("you cannot shoot back instantly"); r6siegecenter; Fandom |
| Detection range | **10.5 m** (since Y11S2, was 9 m). Official wording: "Increase Scan distance 10.5m (was 9)", aimed at "horizontal intel gathering" | Y11S2 Designer's Notes; System Override season page |
| Through surfaces | Yes: **through walls and floors/ceilings** ("track attackers through surfaces"). Obstacles do not reduce range | Ubisoft operator page; Fandom |
| What it detects | **Attacker heartbeats only**. Friendly heartbeats are not shown (lore: "silenced"). Does not detect drones or gadgets | Fandom (Pulse, Heartbeat Sensor) |
| DBNO attackers | UNVERIFIED whether downed attackers still show | — |
| Display | Scan line sweeps left→right. Each detected heart shows as a **red dot with a white circle**. The dot grows as the target gets closer. One beep per detection, louder when closer (only Pulse hears the beeps) | Fandom (pre-Siege X text; behaviour not reported changed) |
| Detection volume shape | UNVERIFIED: a forward fan/cone vs a full sphere; vertical reach vs horizontal (Y11S2 note mentions "horizontal" intel) | — |
| Noise to enemies | Enemies can faintly hear Pulse **equipping/holstering** the sensor, not the beeps | Fandom |
| Battery / cooldown | **None documented.** Third-party guide: "no maximum duration nor a limit of uses". The official tip title "Your scanner runs on batteries" is flavour text, with no mechanic stated | r6siegecenter; Ubisoft tips. Mark UNVERIFIED |
| Equip / holster time | UNVERIFIED | — |
| Team sharing | **Not automatic.** Only Pulse sees the sensor. He shares by **pinging** or voice. Whether pinging while scanning places a dedicated heartbeat marker for the team (and for how long) is UNVERIFIED | r6siegecenter ("feed your teammates", yellow pings); Steam threads (inconclusive) |
| Finka boost | Old wiki: boosted attackers detected up to 14 m (with the old 9 m base). Non-roster; current value UNVERIFIED | Fandom |
| Siege X changes | **None to the sensor in Y10S2.** Range buff came in Y11S2. Y11S3 test-server bug "Cardiac Sensor does not display detected enemies" was fixed before launch | Y10S2 DN; Y11S2 DN; Y11S3 addendum |

### What disables it
- **EMP (Impact EMP Grenade; Thatcher E.G.S. is non-roster):** freezes the sensor. Scan lines still move but no new heartbeats are reported, and existing blips stay frozen for the disabled time. Since the Y10S4 DSEG overhaul, operators inside an EMP/DSEG field cannot activate devices. Impact EMP radius is **2 m** (Y11S2.3). Disable duration is in `research/gadgets.md` (UNVERIFIED here). Sources: Fandom Heartbeat Sensor/Thatcher; Tenfold Pursuit season page; Y11S2.3 notes.
- **IQ (non-roster):** detects the sensor while it is in use (IQ range 22 m since Y11S2.1).
- **Twitch (non-roster):** a Shock Drone zap can temporarily disable it (Fandom).

## Interactions with the other 11 roster operators
| Other operator / gadget | Interaction with Pulse | Source / confidence |
|---|---|---|
| **Brava** (Kludge Drone) | The Cardiac Sensor is hand-held, so there is nothing to hack. Kludge **destroys** Pulse's **Nitro Cell** ("C4 emplacements") and **flips** his **Observation Blockers** to the attackers. Deployable Shield is not electronic (no hack). Pulse detects Brava's heartbeat, not the drone | Fandom Brava |
| **Fuze** | Pulse detects Fuze behind walls or floors (the classic Nitro-Cell-from-below counter to a shield or a planter). Cluster sub-grenades can kill Pulse (4.2 m radius each) and destroy his deployed gadgets | Ubisoft Pulse tips ("kill a shield… from below"); Fandom Fuze |
| **Thermite** | Detects Thermite while he plants or heats his Exothermic Charge (≈3 s deploy + ≈3 s heat-up) through the wall. No gadget interaction | Fandom Thermite |
| **Striker** | If Striker takes **Impact EMP**, it disables the sensor when Pulse is inside the 2 m blast. Frag/Breach Charge/Claymore can kill him or destroy his shield/cell. Pulse detects Striker normally | Ubisoft Striker page; Fandom EMP |
| **Dokkaebi** | **Jegeo Payload:** Pulse's sensor does **not** depend on his phone, so a phone explosion (40 HP + 5 s fire) only costs him camera access. Pulse can detect Dokkaebi's heartbeat while she uploads (she must keep a continuous connection in Y11S3). She lost Impact EMPs in Y11S3, so she can no longer EMP the sensor | Y11S2 DN; Y11S3 DN/patch |
| **Sledge** | **Impact EMP** (Sledge's gadget option) disables the sensor. Frag can kill him. Pulse detects Sledge normally | Ubisoft Sledge page; Fandom Sledge/EMP |
| **Sentry** | Friendly. No interaction | — |
| **Skopós** | Friendly. Shells are defenders, so they are not shown. No interaction | Fandom (attacker hearts only) |
| **Mira** | Friendly synergy only | — |
| **Lesion** | Friendly synergy: poisoned attackers can't sprint, so they are easier to track and Nitro. No mechanical interaction | Lesion research |
| **Mute** | Friendly. Mute's jammers target **attacker** signals, so no effect on the sensor. A **Brava-hacked** jammer "affects Defender devices". Whether that jams Pulse's hand-held sensor or blocks his Nitro Cell detonation is UNVERIFIED | Fandom Mute / Brava; Y10S4 DN |

### Generic gadget notes
- **Nitro Cell:** remote-detonated. Kludge destroys it. EMP/DSEG and electricity rules per `research/gadgets.md`.
- **Deployable Shield:** Y10S3 reduced glass glare. Melee shatters its glass (since Y8S3). Brava cannot hack it.
- **Observation Blocker:** 1 s deploy (from 2.5 s) since Y11S1. Kludge can flip it.

## Change history (last 4 seasons + Siege X)
| Season / patch | Date | Change affecting Pulse | Source |
|---|---|---|---|
| Y10S2 Daybreak (Siege X) | Jun 2025 | No Pulse-specific change. Global: limb damage reduced (reverted Y10S4.1). Electricity neutral | Y10S2 DN |
| Y10S3 High Stakes | Sep 2025 | **Reaper MK2 added** (secondary). Reaper recoil buff. Deployable Shield glass glare reduced. Magnified Sights removed from defenders' automatic weapons (UMP45 optic effect UNVERIFIED) | Y10S3 DN; High Stakes season page |
| Y10S4 Tenfold Pursuit | Dec 2025 | Y10S4.2 (2026-01-20): **UMP45 damage 42 (from 38)**, improved lateral recoil. DSEG overhaul (EMP rules) | Y10S4.2 patch notes; Tenfold Pursuit page |
| Y11S1 Silent Hunt | Mar 2026 | **Observation Blocker deploy 1 s (from 2.5 s)** | Y11S1 DN |
| Y11S2 System Override | Jun 2026 | **Cardiac Sensor scan distance 10.5 m (from 9 m).** Y11S2.3: Reaper MK2 recoil refinement (stages at bullets 0, 3, 10, 25) | Y11S2 DN; System Override page; Y11S2.3 notes |
| Y11S3 Split Fire | Sep 2026 | TS fix: sensor not displaying enemies (fixed before release). **Y11S3.1 (2026-09-22): M1014 damage 30 (from 28)** | Y11S3 addendum; Y11S3.1 notes |

## Implementation summary (JSON-ready)
```
cardiac_sensor: { range_m: 10.5, through_surfaces: true, detects: "enemy_operators_heartbeat",
                  shows_friendlies: false, blocks_weapon_use_while_active: true,
                  battery: null /*none documented*/, emp_freezes: true,
                  fov_shape: "UNVERIFIED (placeholder: forward 180deg fan, full vertical)",
                  team_share: "manual ping only (UNVERIFIED details)", dbno_visible: "UNVERIFIED" }
```

## Open questions
- Does the sensor scan a forward fan (how many degrees?) or a full sphere around Pulse? Does it reach the full 10.5 m straight up and down through floors?
- When Pulse pings while looking at a heartbeat, what do teammates see (a red enemy marker? a special heartbeat icon?), and how long does it last?
- Do DBNO attackers still show a heartbeat?
- Is there any battery, overheat or cooldown on the sensor in the current build?
- How long do equipping and holstering the sensor take?
- Can a Brava-hacked Mute jammer disable Pulse's sensor or stop his Nitro Cell from detonating?
- Did the UMP45 lose its magnified optic in Y10S3?

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/pulse — side, CTU, squad, specialties, ratings, current loadout (incl. Reaper MK2), gameplay tips (IQ/EMP counters, Nitro from below)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2MNhboDBmsQKkWb5p8zqsg/y11s2-designers-notes — scan distance 10.5 m (from 9); Jegeo Payload values
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/systemoverride — confirms 10.5 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/4czc3hlHtXrd27crELGDcc/y10s3-designers-notes — Reaper MK2 added; deployable shield glare; magnified sights
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/highstakes — Reaper MK2 added (season page)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3HSeMj81P0CL3m0N8FS5tK/y10s42-patch-notes — UMP45 42 dmg
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/tenfoldpursuit — DSEG overhaul (operators in field can't activate devices)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5fWCjoCU8toUJiBdMSj0UA/y11s1-designers-notes — Observation Blocker deploy 1 s (Pulse affected)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2EIn06EmkAIG7su2fpITue — Y11S2.3: Impact EMP radius 2 m; Reaper MK2 recoil
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/7tAny5W9p4yrHmIiH51noI/y11s21-patch-notes — IQ detector 22 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/6HzsdnbOYovXelORy4mB7z/y11s3-patch-notes-addendum — sensor display bug fixed
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes — M1014 30 dmg (Pulse affected)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes — no Siege X change to Pulse
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/PONCuRt8LaCr3O31NkBQb/y11s3-designers-notes — Dokkaebi continuous-connection change, EMP removed from her kit
- https://rainbowsix.fandom.com/wiki/Pulse_(Siege) — display behaviour, through walls/floors, counters, gadget counts (range value outdated: 9 m)
- https://rainbowsix.fandom.com/wiki/Heartbeat_Sensor — EMP freeze behaviour, Twitch counter
- https://rainbowsix.fandom.com/wiki/Armor_and_Speed — Health → HP mapping
- https://rainbowsix.fandom.com/wiki/Brava — Kludge destroys C4 / flips Observation Blockers
- https://rainbowsix.fandom.com/wiki/Thermite_(Siege) , https://rainbowsix.fandom.com/wiki/Fuze_(Siege) — timings/radii used in the interaction table
- https://r6siegecenter.com/guides/operators/defenders/pulse/ — no battery/limit, manual sharing (third-party, undated)
