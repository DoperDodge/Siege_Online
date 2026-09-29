# Fuze (Attacker) — APM-6 "Matryoshka" Cluster Charge
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29
Confidence: medium-high for loadout, surfaces, counters, and change history (official patch notes and Designer's Notes). Medium-low for exact sub-grenade damage and the plant (deploy) time (Fandom only). Ballistic Shield rules come from the official Y9S1 rework notes plus later seasons; Fandom disagrees on some numbers (both are recorded).

> Key findings vs PLAN.md §11.1:
> - Fuze's secondary gadgets are **Breach Charge ×3, Hard Breach Charge ×2, Smoke Grenade ×2**.
> - The **Ballistic Shield is still a primary option** in Y11S3. It has not been able to hip-fire since Y9S1, it can't ADS through a vault (Y10S2), throwing from behind it exposes him slightly (Y10S3), and it can't barge through full-HP barricades (Y11S1).
> - Cluster Charges work on **soft walls, floors, hatches, barricades, reinforced walls/hatches (Y6S3+), Mira's Black Mirror (Y6S3+), Castle panels, Deployable Shields and Osa shields (Y8S3+)**.
> - Mute stops a charge from *triggering* if the charge or Fuze is inside the jammer radius.

---

## 1. Identity

| Field | Value | Source / status |
|---|---|---|
| Side | Attacker | Official operator page |
| CTU (unit shown on page) | SPETSNAZ | Official operator page |
| Squad | Redhammer | Official operator page |
| Specialties (official tags) | ANTI-GADGET | Official operator page |
| Health rating | 3 of 3 ("Heavy") → 125 HP | Official stars 3/3; HP mapping from Fandom "Armor and Speed" (see `research/core_mechanics.md`) |
| Speed rating | 1 of 3 | Official stars 1/3 |
| Difficulty | 1 of 3 | Official stars |
| Real name | Shuhrat Kessikbayev | Fandom (the in-game bio was removed; siege.gg) |

## 2. Loadout (official page, Y11S3)

| Slot | Options | Notes |
|---|---|---|
| Primary | **AK-12** (Assault Rifle), **6P41** (LMG), **Ballistic Shield** | Weapon stats → `research/weapons.csv`. The shield mechanics are in §4. |
| Secondary | **PMM** (Handgun), **GSh-18** (Handgun) | The shield can only be used with one of these handguns (hip-fire is disabled). |
| Secondary gadget (choose 1) | **Breach Charge** ×3, **Hard Breach Charge** ×2, **Smoke Grenade** ×2 | Official page lists all three. Counts from Fandom and siege.gg. Generic stats → `research/gadgets.md`. |
| Unique ability | **Cluster Charge** ×4 | Count: Fandom; official Y5S2.3 patch (increased to 4 from 3) |

## 3. Unique ability: Cluster Charge

Official: "Fuze's APM-6 cluster charge propels a group of explosive cluster grenades through any soft breach surface." Reinforced surfaces have also been allowed since Y6S3 (official DN).

### 3.1 Numbers and rules

| Property | Value | Status / source |
|---|---|---|
| Charges per round | **4** (20 sub-grenades total) | Fandom; official Y5S2.3 (3 → 4) |
| Sub-grenades per charge | **5** | Fandom. UNVERIFIED by any official source. |
| Plant (deploy) animation | **~2 s** | Fandom ("takes two seconds to deploy"). Medium confidence. |
| Charges active at once | 1. Planting a second charge detonates the first. | Fandom |
| Trigger | Remote detonator (counts as a wireless/remote device for Mute and DSEG) | Fandom; official Y10S4 DN |
| Soft surfaces (drywall, wood, floors, barricades) | Sub-grenades pass through **instantly** once triggered | Fandom Patch 6.3.0 page ("instantly pass through soft surfaces") |
| Reinforced walls/hatches and Castle Armor Panels | Extra **breaching time 1.75 s** after the trigger (Y11S2.3; was 2 s from Y7S3; 3 s at Y6S3) | Official Y11S2.3 patch notes; Y7S3 and Y6S3 DNs |
| Mira Black Mirror | Can be planted on it. It drills "longer" (exact value UNVERIFIED; probably the same 1.75 s reinforced timer). A successful drill **shatters** bulletproof glass. | Official Y6S3 DN (allowed, slower); Y8S3 DN (bulletproof glass shatters on a successful drill) |
| Deployable Shield, Osa Talon-8 | Can be planted since Y8S3. A successful drill **shatters** the shield's glass. | Official Y8S3 DN |
| Hard (concrete) walls/floors | **No** | Official tip wording ("soft breach surface" + reinforced). Fandom. |
| Electrified surfaces (Bandit, Kaid, and since Y10S4 electrified Castle panels) | The charge is **destroyed** when planted | Fandom; official Y10S4 DN (Castle panels) |
| Release pattern | Grenades released in a **line/fan, one after another**. The official tip says "fan like pattern, **starting from left to right**", Fandom says "from right to left". They detonate in release order. | Conflict: we chose the **official** (left → right, presumably from Fuze's side). Plant orientation changes the spread (official tip). |
| Sub-grenade blast | Radius **4.2 m**. Lethal to 1-health operators within **2 m** and to all operators within **1.2 m**. | Fandom. Per-grenade damage value UNVERIFIED. |
| Hole left behind | The charge falls off after activation and leaves "a sizeable hole" that both teams can see through. On Castle panels it leaves a hole. | Fandom; siege.gg. Hole dimensions UNVERIFIED. |
| Destroys | Everything in the blast: gadgets from both teams (friendly-fire on gadgets too), deployable shields, Mute jammers, BP cams, Gu mines, Nitro Cells (by damage), Barbed Wire (explosions destroy it) | Official tips ("can destroy all gadgets placed in a defensive stronghold"); Fandom Deployable Shield / Barbed Wire / Mute pages |
| Shooting the charge (defender side) | It can't be shot until it has breached the surface. The **extension tube** can be destroyed by any damage, but "no matter how quick you act, the gadget will always release at least one sub-grenade". On reinforced walls defenders can shoot it during the breaching delay. | Official Y6S3 DN; siege.gg |
| Fuze downed / killed | Downed: can't trigger. Killed mid-plant: the plant fails and the charge is removed. | Fandom |
| Noise | Loud drill; clear audio cue to defenders | Fandom; official tip ("few seconds to get away") |

### 3.2 What counters the Cluster Charge

| Counter | Effect | Source |
|---|---|---|
| **Mute Signal Disruptor** (roster) | If **the charge or Fuze** is inside the jammer radius (**2.6 m** since Y11S2.3; 2.475 m from Y10S4), the charge **won't trigger** ("sub-grenades will not deploy"). If the jammer is placed **after** triggering, it has no effect. Y10S4.1 fixed a bug where the disruptor *could* deactivate a Cluster Charge. Our reading: an already-triggered charge (or one outside the rules) must not be cancelled. | Fandom Mute/Fuze; official Y6S3 DN; official Y10S4 DN/season page ("both the Operator and the device need to be outside of the field"); official Y10S4.1 notes (the fix's meaning is inferred, UNVERIFIED) |
| DSEG sources (Bulletproof Camera EMP dart — Sentry/Mute/Lesion) | A character under DSEG "can no longer trigger their remote devices (... Cluster charges ...)", and an affected device can't be triggered remotely | Official Y10S4 DN. The exact duration from a BP cam dart is UNVERIFIED (see `research/gadgets.md`). |
| Gunfire / explosives on the charge | Destroyed (see §3.1 for the shooting window) | Fandom; Y6S3 DN |
| Destroying the surface it is on | Destroys the charge | Fandom |
| Nitro Cell (Mute, Pulse, Mira, Sentry) | The "main counter" to Fuze: C4 through the soft wall he is working on | siege.gg |
| Electricity (out of roster: Bandit, Kaid) | Destroys the charge on plant | Fandom; official Y10S4 DN |
| Jäger ADS / Wamai MAG-NET (out of roster) | Each intercepts **one** sub-grenade | Fandom; siege.gg |
| Maestro Evil Eye laser (out of roster) | Can destroy the charge | Fandom |

## 4. Ballistic Shield (Fuze's primary option)

Fuze uses the standard Ballistic Shield. Blitz, Montagne, Blackbeard and Clash have special variants. Current rules come from the **Y9S1 shield rework** (official DN) plus later changes.

| Mechanic | Current value / rule | Source / status |
|---|---|---|
| Coverage | Head and torso from the front. Legs are exposed while standing (crouching reduces this). Shoulders, sides and back are exposed while it is held. Bulletproof glass viewport at eye level that **cracks** under fire and reduces visibility. | Fandom Ballistic Shield |
| Shield durability | Indestructible to bullets (no shield HP). Only the viewport cracks. | Fandom. No official shield HP found. |
| Stowed | Carried on the back when unequipped: protects the back, not the head | Fandom |
| Weapon use | **No hip-fire** (removed in Y9S1). Pressing **aim** tilts the shield and fires the handgun, exposing the head. It can't shoot until the weapon points forward. **ADS time 0.5 s walking / 0.55 s sprinting.** | Official Y9S1 DN |
| Fire button without ADS | **Free look**: look around while the shield keeps facing forward. Releasing turns the body toward the last look direction (Fandom). Free-look gadget throws are possible. | Official Y9S1 DN; Fandom |
| Reload | Done behind the shield; auto-reloads when empty | Official Y9S1 DN |
| Sprint | Allowed with the shield kept in front | Official Y9S1 DN |
| Movement penalty | **−10 % of base speed** while carrying a shield (equipped or not). Action-time penalties on reload/aim. | Fandom. Official value UNVERIFIED. |
| Melee (shield bash) | Pushback + **65 HP** damage, per the official Y9S1 DN (was an instant DBNO before). Fandom currently says the bash "deals no damage" and only pushes/knocks down the target, plus +5 dmg if they are pushed through a breakable wall. | **Conflict.** Chose **official 65 HP + pushback**. Ulo should verify. |
| Barricades | Y9S1 allowed pushing through a barricade in one move. **Y11S1: shields can no longer break through full-HP barricades.** A damaged barricade can still be pushed. (Fandom: 3 normal melee hits destroy a barricade.) | Official Y9S1 DN, Y11S1 DN |
| Vaulting | Since Y10S2, aiming (ADS) is cancelled during any vault (objects, windows, barricades) | Official Y10S2 DN |
| Throwing / gadgets | Throwables can be thrown from behind the shield. **Since Y10S3 a throw animation briefly exposes him** (smaller gap than the pre-Y9S1 shields). Placed gadgets (Cluster, Breach, Hard Breach) **temporarily unequip** the shield during the plant; it re-equips automatically afterwards. Remote triggers can be used behind the shield. | Official Y10S3 DN; Fandom |
| Prone / rappel | Going prone unequips the shield. The shield can't be used on rappel. | Fandom |
| Hostage | The shield stays equipped while escorting | Official Y9S1 DN |
| Suppression | Enough bullet impacts suppress the user: no sprint, reduced visibility. **Official Y9S1: triggers at 10 hits, max intensity at 40 hits, 7 s fall-off.** Fandom: 5 hits, max 20, ~7.5 s; heavier calibres suppress faster. | **Conflict.** Chose **official** (Y9S1). It may have been re-tuned later (UNVERIFIED). |
| Guard break | The shield is knocked aside, leaving the user briefly unable to act. Triggers: explosive damage **≥ 30 HP** (Y9S1.3, was 50); concussion (always 100 %); melee (100 % against regular shields); electricity and fire (small, continuous; fire = 40 % intensity per Y9S1). Chains of hits stack. | Official Y9S1 DN and Y9S1.3 notes; Fandom |
| Explosives vs shield | A shield absorbs **66 %** of Nitro Cell / Impact Grenade damage when the blast is directly in front. A Nitro thrown **behind** him bypasses the shield. | Fandom C4 / Impact Grenade pages |
| Knockdowns | Oryx dash, Nomad Airjab, an enemy shield bash, and (since Y10S2) **Sledge's hammer** knock the user down and unequip the shield. It must be re-equipped manually. | Fandom; official Y10S2 DN (Sledge). Within our roster only defenders can be enemies of Fuze, so this matters only for mirrored or custom setups. |
| Shield camera | No special shield camera documented. First-person view is through the viewport; hold the fire button for free look. The Y9S1 notes mention a third-person throw animation. | UNVERIFIED whether any special camera exists |

### 4.1 Y11S3 anti-shield context: Noor (new defender, not in our roster)
| Item | Detail | Source |
|---|---|---|
| Gadget | Horus Lance Launcher: **5 projectiles** that pierce shields and destructible surfaces, then emit flames. They work through floors and ceilings and from adjacent rooms. Can target Castle panels and Azami Kiba barriers. | Official Split Fire page / Noor operator page |
| Vs Ballistic Shield | The lance burrows through and **flames come out on the holder's side** (damage over time until death if not removed). The holder must **remove it, which exposes him** (no flame damage during removal). There is a short delay before the flames start. If the shield is on his back he must equip it first. Direct hit = 50 dmg. Launcher holds 2. | Fandom Noor (UNVERIFIED numbers) |
| Y11S3.1 fixes | Shield users now take lance damage even when pressing the lance against a wall. They can't swap to a secondary gadget or throw while affected. They stop moving when hit. The back-shield instant-removal exploit was fixed. | Official Y11S3.1 patch notes |
| General shield changes in Y11S3 | **None found** besides Noor's arrival (no base shield stat changes in the Y11S3 DN or Y11S3.1) | Official Y11S3 DN, Y11S3.1 notes |

## 5. Interactions with roster defenders

| Defender gadget | Fuze → it | It → Fuze | Source / status |
|---|---|---|---|
| **Mute** Signal Disruptor | Sub-grenades destroy jammers in their blast. The charge must be planted more than 2.6 m from any jammer (Y11S2.3). | Stops the charge triggering if the charge **or Fuze** is inside the radius. Jams Breach Charges (remote). Post-Y10S4 behaviour vs the Hard Breach Charge (fuse, not remote) is UNVERIFIED; Fandom still lists HBC as jammed. | §3.2 sources; Fandom Hard Breach Charge |
| Mute Bulletproof Camera | Destroyed by explosives | EMP dart (0.75 m) puts DSEG on Fuze or the charge → can't trigger | Fandom BP cam; official Y10S4 DN, Y11S2.1 |
| Mute / Pulse / Mira / Sentry Nitro Cell | Can be destroyed by explosion (a single bullet destroys one) | Main counter through soft walls. Bypasses his shield if thrown behind him; 66 % absorbed in front. | Fandom C4; siege.gg |
| **Pulse** Cardiac Sensor | — | Detects Fuze's heartbeat through walls/floors within **10.5 m** (Y11S2) while he plants → Nitro. Not an electronic target for Fuze. | mp1st copy of Y11S2 notes |
| Pulse / Sentry Deployable Shield | The charge can be **planted on it** (Y8S3; glass shatters on a successful drill). Any explosion destroys it instantly. | Blocks bullets only | Official Y8S3 DN; Fandom Deployable Shield |
| Pulse / Lesion / Sentry Observation Blocker | Destroyed by explosives | Hides the site from drones (can't see what to cluster) | Fandom Observation Blocker |
| **Mira** Black Mirror | The charge **can be planted on the mirror** (Y6S3); it drills slower; the glass shatters. Sub-grenades clear the room behind. | Mirror viewers can see Fuze plant; the mirror is bulletproof from both sides. | Official Y6S3 / Y8S3 DNs |
| Mira / Skopós / Sentry Proximity Alarm | Destroyed by explosives (UNVERIFIED explicitly) | Alerts defenders when Fuze is within 3 m | Fandom Proximity Alarm |
| **Skopós** V10 Shells | Sub-grenades damage shells like operators. Explosives destroy the idle shell's deployable-style shield. Planting on the idle shell's shield: UNVERIFIED. | Shells shoot Fuze like any operator. Since Y11S1 shells are 1-health / 3-speed. | Fandom Skopós; official Y11S1 DN |
| **Lesion** Gu Mine | Destroyed by explosives, so a cluster clears Gu fields | A Gu needle does 5 initial + 12 per 2 s (Y8S3 values), stops sprinting and blocks the defuser plant until removed. Removal exposes him. Whether he can remove it with the shield equipped is UNVERIFIED. | Official Y8S3 DN; Fandom Lesion |
| **Sentry** Barbed Wire | Destroyed by explosions | Slows | Fandom Barbed Wire |
| Sentry / Skopós Impact Grenade | — | Blows holes and kills. Against a shield: 66 % absorbed if in front; ≥ 30 HP causes guard break. | Fandom Impact Grenade; Y9S1.3 notes |

## 6. Interactions with roster attackers (allies)

| Ally | Interaction |
|---|---|
| Brava | Converting a Mute jammer (Kludge) removes the trigger block. Kludge charges are finite, so plan who clears what. |
| Thermite | Fuze can clear defender utility behind a reinforced wall before or after Thermite's breach. Both are blocked by the same jammer rule (charge or operator inside 2.6 m → no trigger). Cluster explosions can destroy friendly gadgets in the blast. |
| Sledge / Striker | Impact EMP Grenades (Sledge's loadout; Striker's pool) apply DSEG to jammers and BP cams so Fuze can trigger (DSEG rules per Y10S4). Sledge's hammer and Fuze both remove soft floors and hatches: vertical play. |
| Dokkaebi | No direct interaction |

## 7. Change history (Y10S2 Siege X → Y11S3)

| Season / patch | Change affecting Fuze | Source |
|---|---|---|
| Pre-history | Y5S2.3: charges 3 → 4. Y6S3: reinforced surfaces and Black Mirror allowed; 3 s extra drill on reinforcement; extension tube vulnerable; always releases ≥ 1 grenade. Y7S3: drill time 3 → 2 s, Smoke added. Y8S3: allowed on Deployable/Talon shields. Y9S1: shield rework (no hip-fire, 65 HP bash, suppression). Y9S1.3: guard-break threshold 30 HP. | Official DNs (Y6S3, Y7S3, Y8S3, Y9S1); Fandom patch pages |
| **Y10S2 Daybreak (Siege X)** | **Shields: ADS is cancelled when vaulting.** Sledge's hammer now knocks back shield users. Electricity became neutral (still destroys electronics such as the Cluster Charge). | Official Y10S2 DN |
| Y10S3 High Stakes | **Shields: a projectile-throw animation was added** (brief exposure) | Official Y10S3 DN |
| **Y10S4 Tenfold Pursuit** | Mute rework: jams wireless/remote devices, radius 2.475 m. **DSEG: an operator under DSEG can't trigger Cluster Charges**, and both Fuze and the device must be outside any field. Kaid can electrify Castle Armor Panels (Fuze can't plant on them while electrified). **Y10S4.1: "FIXED – Mute's Signal Disruptor can deactivate Fuze's Cluster Charge."** | Official Y10S4 DN; Tenfold Pursuit page; Y10S4.1 notes |
| **Y11S1 Silent Hunt** | **Shields can no longer break through full-HP barricades.** | Official Y11S1 DN |
| **Y11S2 System Override** | **Y11S2.3: breaching time on reinforced surfaces and Armor Panels 1.75 s (was 2 s).** In the same patch: Mute jammer radius 2.6 m (from 2.475 m); Impact EMP radius 2 m (from 1.8 m). | Official Y11S2.3 notes |
| **Y11S3 Split Fire** | No direct Fuze change. **Noor** (anti-shield defender) added. Y11S3.1 bug fixes to lance-vs-shield interactions. | Official Split Fire page, Y11S3 DN, Y11S3.1 notes |

**Outdated-guide flags:** a guide is out of date if it says any of the following. "Can't go on reinforced walls" (pre-Y6S3). Drill time 3 s (pre-Y7S3). Shield hip-fire or a one-hit-DBNO bash (pre-Y9S1). Shields barge through barricades (pre-Y11S1). Reinforced drill time of 2 s (pre-Y11S2.3).

## Open questions
- **Sub-grenade damage** per grenade (HP at centre and fall-off). Fandom only gives lethal radii (2 m for light, 1.2 m for all, 4.2 m max).
- **Sub-grenades per charge = 5?** Ulo can count them in a custom game.
- **Plant time** (~2 s?) and how much extra drill time applies on **Mira's Black Mirror** (the same 1.75 s as reinforced?).
- Release direction: **left → right or right → left** from Fuze's point of view? (Official tip vs Fandom.)
- **Shield bash damage:** 65 HP (official Y9S1) or 0 (current Fandom)? And the current **suppression thresholds** (10/40 hits vs 5/20).
- **Shield speed penalty** (−10 %?).
- After Y10S4, does Mute's jammer still stop a **Hard Breach Charge** (it is fuse-based, not remote)? What exactly did the **Y10S4.1 fix** ("disruptor can deactivate Cluster Charge") change?
- Can Fuze plant a charge on **Skopós' idle-shell shield**? Can he pull a Gu needle with the shield equipped?
- Hole size left by a Cluster Charge on soft and reinforced surfaces.

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/fuze — side, CTU, squad, stars, loadout, ability text, gameplay tips (fan pattern left → right, clears all gadgets)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2zsUnVBdSsc10rirkPl1K5/y6s3-preseason-designers-notes — reinforced + Black Mirror, Mute rule, shooting window, ≥ 1 grenade
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/2vKaDckg5VPV1ViA4p8KM/y7s3-preseason-designers-notes — drill 2 s, Smoke added
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2Btj0mP7e7gVKIODGSLuiX/y8s3-designers-notes — Deployable/Talon shields, glass shatters; Gu mine stats
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3jBlCdtRBQx2sCjmY2umNu/y9s1-designers-notes — Ballistic Shield rework values
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/6ZsfBMeGT0Anuu0IHjDQ0P/y9s13-patch-notes — guard-break explosion threshold 30 HP
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes — vault cancels ADS; Sledge knocks back shields; neutral electricity
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/4czc3hlHtXrd27crELGDcc/y10s3-designers-notes — shield throw animation
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes — Mute rework, DSEG blocks Cluster triggering, Kaid-electrified Castle panels
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/tenfoldpursuit — DSEG summary (operator and device must both be outside the field)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3aYq6D0VHo1HJ5ZNfLtiNs/y10s41-patch-notes — Mute/Cluster fix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5fWCjoCU8toUJiBdMSj0UA/y11s1-designers-notes — no full-HP barricade break-through
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2EIn06EmkAIG7su2fpITue — Y11S2.3: reinforced/Armor Panel breaching 1.75 s
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/7tAny5W9p4yrHmIiH51noI/y11s21-patch-notes — BP camera EMP dart 0.75 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/PONCuRt8LaCr3O31NkBQb/y11s3-designers-notes — Y11S3 (no Fuze/shield base change)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/splitfire — Noor / Horus Lance description
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/noor — Noor loadout/ability
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes — Horus Lance vs shield fixes
- https://mp1st.com/title-updates-and-patches/rainbow-six-siege-system-override-update-june-2-via-patch-3-38-1-000-143 — Pulse range 10.5 m (copy of official notes)
- https://rainbowsix.fandom.com/wiki/Fuze_(Siege) — charges ×4, 5 grenades, 2 s plant, radii, counters, one-charge-at-a-time
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_6.3.0 and https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_5.2.3 — soft-surface instant pass; 3 → 4 charges
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.1.0 — shield barricade change summary
- https://rainbowsix.fandom.com/wiki/Ballistic_Shield — shield mechanics (coverage, free look, guard break, suppression, speed penalty, bash)
- https://rainbowsix.fandom.com/wiki/Noor — Horus Lance vs shields details
- https://rainbowsix.fandom.com/wiki/Mute — Cluster sub-grenades won't deploy in the jammer field
- https://rainbowsix.fandom.com/wiki/C4 , https://rainbowsix.fandom.com/wiki/Impact_Grenade , https://rainbowsix.fandom.com/wiki/Deployable_Shield , https://rainbowsix.fandom.com/wiki/Barbed_Wire , https://rainbowsix.fandom.com/wiki/Observation_Blocker , https://rainbowsix.fandom.com/wiki/Skopós , https://rainbowsix.fandom.com/wiki/Lesion , https://rainbowsix.fandom.com/wiki/Hard_Breach_Charge — interaction details
- https://siege.gg/news/rainbow-six-siege-fuze-operator-guide — gadget counts (BC ×3, HBC ×2, Smoke ×2), Nitro as main counter, ADS/MAG-NET intercept one grenade
