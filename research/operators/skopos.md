# Skopós (V10 Pantheon Shells "Talos" and "Colossus")
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29. The last Skopós gameplay change was Y11S1 (Silent Hunt).
Confidence: medium-high. Core rules come from official sources: the Ubisoft operator page, the Ubisoft Twin Shells operator guide, Y9S3 patch addendum, and Y11S1 Designer's Notes. The operator's own designer (Trichotome blog) explains the design. Several numbers are UNVERIFIED: shield HP, EMP/Kludge timings, and swap range limit.

> **Conflict to be aware of.** The Ubisoft operator page says she "will lose connection to both shells if **one** is
> destroyed". The more detailed **Ubisoft Twin Shells operator guide** says "if the **active** shell is eliminated, so is
> Skopós … **Destroying the inactive shell does not eliminate Skopós**". The Y9S3 addendum also fixed a bug where
> "Destroying Skopós' V10 Pantheon shells in idle mode counts as an elimination". **Chosen: inactive-shell destruction
> does NOT eliminate her** (matches PLAN.md, siege.gg, Fandom and the designer blog).

## 1. Identity and base stats

| Field | Value | Source / note |
|---|---|---|
| id | `skopos` (display "Skopós") | Ubisoft URL `/operators/skopos` |
| side | Defender | Ubisoft page |
| squad | Wolfguard (no CTU row on the Ubisoft page) | Ubisoft page |
| role tags | INTEL, SUPPORT | Ubisoft page |
| health rating | **1** → **100 HP per shell** (was 2 / 110 HP until Y11S1) | Ubisoft page stars 1/3; Y11S1 DN "Health: 1 (from 2)"; HP mapping: Fandom Armor and Speed |
| speed rating | **3** (was 2 until Y11S1) | Ubisoft page stars 3/3; Y11S1 DN |
| difficulty (Ubisoft) | 2 / 3 | Ubisoft page |
| introduced | Y9S3 Operation Twin Shells (2024-09-10) | Ubisoft Twin Shells page/guide |
| Fandom infobox | still says Medium/Normal (2/2), which is **outdated** | Fandom |

## 2. Loadout (official Ubisoft operator page, Y11S3). Unchanged since launch

| Slot | Options | Notes |
|---|---|---|
| Primary | **PCX-33** (assault rifle, 7.62×51 / .308, unique to Skopós) | Fandom: 36 dmg, 745 RPM, 31+1 mag, 1x sights only. Authoritative stats: `research/weapons.csv` |
| Secondary | **P229** (handgun) | only option |
| Secondary gadget | **Impact Grenade ×2** *or* **Proximity Alarm ×2** | **One pool shared by both shells**: using one on either shell uses it up for both (Ubisoft guide; designer blog) |
| Unique | **V10 Pantheon Shells** (Talos + Colossus) | — |
| Melee | Since Y11S1: "Creates a bigger hole and destroys wood studs (same behavior as Aruni)" | Y11S1 DN |

## 3. V10 Pantheon Shells: complete rules

### 3.1 Core model
| Topic | Rule | Source / verified |
|---|---|---|
| Bodies | Two identical humanoid shells, **Talos** and **Colossus**. Same loadout and same health/speed. No per-shell differences | Ubisoft guide; designer blog 9/11 |
| Control | Skopós controls **one at a time**. The **active** shell plays exactly like an operator: movement, shooting, secondary gadgets, observation tools | Ubisoft guide |
| Inactive shell stance | **Crouches** and deploys a **bulletproof barrier shield** in front of itself. Acts as an **observation tool (camera) for the defense** | Ubisoft guide; Ubisoft op page ("Observation Tool protected by a reinforced shield") |
| Legal status | Active shell = **operator**. Inactive shell = **gadget**, except it takes damage directly like a body | designer blog (interaction rule 2/07); Fandom |
| Separate per shell | **HP, primary/secondary ammo reserve, and shield state** are separate and never carry between shells | Fandom; gamerant; Ubisoft guide (ammo implied) |
| Shared | **Secondary gadget reserve** (2 Impacts or 2 Prox Alarms total) | Ubisoft guide; designer blog 11/11 |
| Organic effects | Mechanical: **can't be healed** (Doc/Thunderbird), **can't take Rook armor**, **immune to toxic gas** (Smoke canisters, Fenrir Dread Mines) | Ubisoft guide |
| DBNO | **No DBNO.** At 0 HP the active shell is destroyed and Skopós is eliminated | Fandom (UNVERIFIED by Ubisoft; consistent with the guide) |
| Voice / audio | Kure talks over the **team radio** (e.g. "Switching to Talos", "Colossus activated"). Shells make **mechanical sounds** instead of pain screams | designer blog 6/13; Fandom quotes |

### 3.2 Swapping
| Parameter | Value | Source / verified |
|---|---|---|
| Input | Press the gadget key. This opens the idle shell's **camera view** (observation mode is part of the swap), then confirm to transfer | designer blog 5/12; Ubisoft guide ("by accessing the observation controls of her inactive shell … she can switch") |
| Transfer (active → idle) time | **1.3 s** (was 1.5 s before Y11S1) | Y11S1 DN / season page ("Active Shell idling time") |
| Activation (idle → active) time | **1.3 s** (was 1.5 s before Y11S1) | Y11S1 DN |
| Sequencing | Sequential, "one after the other" (both animations can't run at once) → **~2.6 s total** | designer blog 7/12. The total is **inferred** (UNVERIFIED) |
| Cooldown between swaps | **0.5 s** (was 3 s before Y11S1) | Y11S1 DN |
| Swap requirement | The **current active shell must have room to deploy its barrier shield**. An on-screen alert shows when the position is obstructed. The collision box is smaller than a normal Deployable Shield's (no vault space needed behind it) | Ubisoft guide; designer blog 9–10/12 |
| Range limit between shells | **None documented.** UNVERIFIED; best guess: no limit | — |
| Blocked when | the idle shell is EMP'd/disabled; the active shell is EMP'd (loses observation-tool access); her phone is destroyed by Dokkaebi's Jegeo (see §4); the idle shell is destroyed (nothing to swap to) | Ubisoft guide; Fandom Skopós & Dokkaebi |
| Swap count limit | none | gamerant (pre-Y11S1 it had the 3 s cooldown) |
| Tracking on swap | Pings/trackers on the active shell (Deimos, Grim, Jackal) **stay on the old shell** and don't transfer | Fandom; siege.gg |

### 3.3 Inactive (idle) shell
| Topic | Rule | Source / verified |
|---|---|---|
| Camera | Observation tool **for the defense** (teammates can use it). Skopós' HUD doesn't show its location, gadget reserve or glass state | Ubisoft guide; Fandom |
| Pinging / marking from the idle cam | UNVERIFIED (presumably like other observation tools) | — |
| Shield | Deployable-shield-style barrier. **Bulletproof, not explosion-proof.** Explosives (frag, Ash rounds, Flores drone, etc.) destroy it and expose the "not-at-all bulletproof" shell behind | Ubisoft guide |
| Shield glass | Head-height **glass viewing window** that can be **shattered** "if you have the right line of sight" | Ubisoft guide; Fandom |
| Shield HP | **UNVERIFIED.** Bulletproof against gunfire, destroyed by explosives. Explosive threshold unknown. Placeholder: treat like a generic Deployable Shield (`research/gadgets.md`) | — |
| Oryx dash | Can't dash through Skopós' shield (unlike Deployable Shields) | designer blog 6/07 |
| Idle shell HP | same as the operator HP (100 since Y11S1). Takes body and explosive damage normally. **Headshots on the idle shell depend on calibre**: e.g. a D-50 headshot destroys it, a 5.7 USG headshot doesn't | Fandom (UNVERIFIED exact thresholds) |
| Destroyed idle shell | Skopós is **not** eliminated. She keeps playing the active shell but **can no longer swap** ("significant blow to her defensive capabilities"). Not counted as a kill (Y9S3 fix) | Ubisoft guide; Y9S3 addendum |
| Destroyed active shell | Skopós is **eliminated** (no DBNO). What happens to the idle shell afterwards (does the camera stay usable?) is UNVERIFIED | Ubisoft guide |
| Claymore trap | A Claymore placed against the idle shell **doesn't trigger until Skopós activates that shell** | Fandom |
| Nomad Airjab | Same: triggers when she swaps into the shell | siege.gg; strafe |
| Detection | IQ detects the idle shell at all times (gadget). Pinging the shield reveals Skopós | Fandom; Y9S3 addendum fix |
| Reinforce/barricade blocking | Fixed in Y9S4 and again in Y10S2.2: the idle shell shouldn't block teammates from reinforcing or barricading beside it | Y9S4 addendum; siege.gg Y10S2.2 notes |

### 3.4 Prep-phase deployment
| Topic | Rule | Source / verified |
|---|---|---|
| Round-start spawn | The **second (idle) shell spawns at a dedicated Skopós spawn point in the chosen objective site**, shield deployed. The designers "had to add a new spawn point to every site on every map just for Skopós". Oregon example from the bug list: "1F Meeting Hall (Hostage)" | designer blog 2/12; Y9S4 addendum |
| Active shell spawn | Normal defender spawn (UNVERIFIED) | — |
| Moving the idle shell | Only by swapping into it and walking it. Swapping in prep is presumably allowed (UNVERIFIED) | — |
| Oregon Bomb idle-shell spawn points | **UNVERIFIED.** One per bomb site. Ulo would need to screenshot them | — |

## 4. Interactions with the other 11 roster operators

| Other operator (side) | Interaction with Skopós | Result | Source / verified |
|---|---|---|---|
| **Brava** (atk) | Kludge Drone → **idle shell** | Kludge **overheats and destroys** the idle shell. Skopós gets a **warning** and can cancel it by **swapping into that shell** before it's destroyed | Ubisoft Twin Shells guide; designer blog 5/07 |
| Brava | Kludge → overheat duration | **~8 s** before destruction | siege.gg (test-server era) → UNVERIFIED |
| Brava | Kludge → **active shell** | **No effect** (immune to hacks) | Ubisoft guide |
| Brava | Kludge → her Proximity Alarms | Converted to attackers | Fandom Brava |
| **Fuze** (atk) | Cluster Charge sub-grenades | Explosive: **destroy the idle shell's shield** and damage/destroy shells (4.2 m radius per sub-grenade). Whether a cluster charge can be **mounted on** Skopós' shield like on Deployable Shields is UNVERIFIED | Ubisoft guide (explosives break shield); Fandom Fuze |
| **Thermite** (atk) | Exothermic Charge | No special interaction. A shell next to the breached wall takes blast damage (UNVERIFIED). His Stun Grenades affect the **active** shell normally (shells aren't flash-immune, only gas-immune) | Ubisoft guide lists only gas immunity |
| **Striker** (atk) | Impact EMP → **idle shell** | **Temporarily disabled**: Skopós can't swap to it. Impact EMP radius 2.0 m since Y11S2.3. Duration UNVERIFIED (see `research/gadgets.md`) | Ubisoft guide; Y11S2.3 patch notes |
| Striker | Impact EMP → **active shell** | Not disabled (anti-EMP device on the collar). Per Fandom the HUD glitches and she **can't open observation tools**, so she can't swap for the EMP duration | Ubisoft guide; designer blog 4/13; Fandom |
| Striker | Frag / Breach / Hard Breach | Explosives destroy the idle shell's shield and damage shells | Ubisoft guide |
| Striker | Claymore (155 dmg since Y11S3) | Placed against the idle shell, it only fires when she activates it | Fandom; Y11S3 DN |
| Striker | Stun Grenade | Affects the active shell like an operator (UNVERIFIED) | — |
| **Dokkaebi** (atk) | **Jegeo Payload** (Y11S2 remaster) on Skopós | Targets an **identified** operator. 7 s buzz window. If not reset, the phone explodes for **40 HP** plus a 5 s fire area. **If the phone is destroyed, Skopós loses the ability to switch shells** for the rest of the round. Upload needs a **continuous connection** and is cancelled if interrupted (Y11S3). Per-target cooldown 14 s | Y11S2 DN; Y11S2.2 DN; Y11S3 DN; Fandom Dokkaebi |
| Dokkaebi | Jegeo during the buzz | Whether an active buzz blocks swapping (as the old Logic Bomb did) is **UNVERIFIED** | gamerant/strafe describe the pre-remaster Logic Bomb |
| Dokkaebi | Pre-remaster (Y9S3–Y11S1) | The Logic Bomb could "temporarily disable the inactive shell". **Outdated**, kept for history | Ubisoft Twin Shells guide |
| Dokkaebi | Eliminated Skopós | Drops a **circuit board** instead of a phone, hackable like a phone (camera access 20 s per hack) | Fandom Skopós; Y11S2 DN |
| Dokkaebi | Breach Charges (Y11S3) | Explosive: break the shield / damage shells | Y11S3 DN |
| **Sledge** (atk) | Breaching Hammer | The hammer **one-hit kills operators** (Fandom Sledge), presumably the active shell too. It counts as explosive damage vs bulletproof gadgets, so it likely **breaks the idle shell's shield**. Both **UNVERIFIED** | Fandom Sledge |
| Sledge | Frag / Impact EMP | Same as the Striker rows | — |
| **Mute** (def) | Signal Disruptor | Friendly: **no effect** on the shells (UNVERIFIED but consistent with "jams attacker devices"). **Protects** Skopós: a Kludge Drone entering the radius is jammed; defenders inside the radius are immune to Jegeo. Radius **2.6 m** since Y11S2.3 | Fandom Mute; Y11S2.3 patch notes |
| **Pulse** (def) | — | No interaction | — |
| **Lesion** (def, provisional) | — | No interaction | — |
| **Mira** (def) | Black Mirror | Shells can use Mirrors like any defender. No special interaction | — |
| **Sentry** (def) | Generic gadgets | No interaction. Friendly-fire from Sentry's Nitro/Impact on shells is UNVERIFIED | — |

Other notable interactions (not on our roster, useful for the generic gadget matrix): IQ detects the idle shell at all times,
and the active shell only while it uses observation tools. Thatcher's EMP works like the Impact EMP rows above. Deimos, Grim and
Jackal tracking stays on the old shell after a swap. Doc and Thunderbird heals don't work. Smoke and Fenrir gas does nothing.
Oryx can't dash through the shield. Nøkk has a special interaction ("hilarious", designer blog) whose details are UNVERIFIED.

## 5. Implementation notes (PLAN.md §11.2)
- Model it as **one player controller owning two pawns** (`Shell[2]`), each with its own `hp`, `ammo[]` and `shield_state`
  (`intact`/`glass_shattered`/`destroyed`), plus a shared `secondary_gadget_count`.
- The idle pawn switches to a **gadget entity** (`observation_tool=true`, `emp_disableable=true`, `kludge_hackable=true`,
  `ied_detectable=true`). The active pawn is an **operator entity** (`emp_immune=true`, `hack_immune=true`,
  `healable=false`, `gas_immune=true`, `can_dbno=false`).
- Swap state machine: `ACTIVE → (request) → CAMERA_PREVIEW → TRANSFER(1.3 s) → ACTIVATE(1.3 s) → ACTIVE(other)`,
  then `cooldown 0.5 s`. Validate that the current pawn has space for the shield before starting.
- Win/loss: eliminate the player only when the **active** pawn dies. An idle pawn death sets `can_swap=false`.

## 6. Change history

| Season | Change | Source |
|---|---|---|
| Y9S3 Twin Shells (2024-09-10) | Added. 2-speed / 2-health; transfer 1.5 s, activation 1.5 s, swap cooldown 3 s (old values from Y11S1 DN). Launch bug fixes include "idle-shell destruction counted as an elimination" | Twin Shells guide; Y9S3 addendum |
| Y9S4 Collision Point | Bug fixes: idle-shell spawn positions (including Oregon 1F Meeting Hall, Hostage), players clipping through the shield, idle shell blocking reinforce/barricade | Y9S4 addendum |
| Y10S2 Daybreak / Siege X (2025-06) | No Skopós change. Y10S2.2 fix: idle shell no longer blocks reinforcing from inside. Global Siege X changes (limb damage, electricity) apply | siege.gg Y10S2.2 notes; Y10S2 DN |
| Y10S3 High Stakes (2025-09) | Price only: 20,000 Renown / 480 Credits | High Stakes season page |
| Y10S4 Tenfold Pursuit (2025-12) | No direct change. DSEG rework (EMP'd characters can't trigger remote devices; all optics affected) | Y10S4 DN |
| **Y11S1 Silent Hunt (2026-03-03)** | **Speed 3 (from 2), Health 1 (from 2); transfer 1.3 s (from 1.5); activation 1.3 s (from 1.5); swap cooldown 0.5 s (from 3); Aruni-style melee (bigger hole, destroys wood studs)** | Y11S1 DN; Silent Hunt season page |
| Y11S2 System Override (2026-06-02) | No direct change. Dokkaebi's Jegeo remaster changes how she counters Skopós (§4) | Y11S2 DN |
| Y11S3 Split Fire (2026-09-01) | Price only: 15,000 Renown / 360 Credits. Dokkaebi Jegeo continuous-connection rule | Split Fire season page; Y11S3 DN |

## Open questions
- **Shield HP / explosive threshold** for the idle shell's barrier, and the HP of its glass window. Ulo: in a Custom game with a teammate, count how many Impact Grenade/frag hits break the shield.
- **Is there a maximum distance between the shells for swapping?** Ulo: park one shell in spawn-side Big Tower and try swapping from the far end of the map.
- **Total swap time:** is it 1.3 + 1.3 = 2.6 s, or do the steps overlap? Ulo could time it in a recording.
- **Where does the idle shell spawn on each Oregon bomb site** (Kitchen/Dining, Meeting/Kitchen, Kids' Dorms/Dorms Main, Laundry/Supply)? Screenshots at round start.
- **EMP disable duration** on the idle shell, and whether an EMP'd *active* shell really can't swap (Fandom claim).
- **Brava Kludge overheat time** (siege.gg test-server claim: 8 s).
- **Dokkaebi remaster:** does an active Jegeo buzz block swapping? Does the explosion/fire hit the active shell, and does fire hurt shells?
- **Sledge hammer vs shells:** one-hit kill on the active shell? Breaks the idle shield?
- After the **active** shell dies, does the idle shell's camera stay usable by teammates?
- Can teammates **ping** attackers from the idle-shell camera?

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/skopos: loadout, Wolfguard, INTEL/SUPPORT, health 1 / speed 3 / difficulty 2 stars, ability blurb ("lose connection to both shells if one is destroyed")
- https://news.ubisoft.com/en-us/article/6md8NyzcybEjZ2bMROA5fP/rainbow-six-siege-operation-twin-shells-operator-and-gadget-guide: authoritative mechanics (active/inactive, shield bulletproof not explosion-proof, glass window, swap-space rule, EMP/Dokkaebi/Brava/IQ, heal/Rook/gas rules, shared gadgets, idle death ≠ elimination)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/twinshells: Y9S3 launch info
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5ETMcAwe6xWaSvEBBMM3Jo/y9s3-patch-notes-addendum: idle-shell kill-credit fix, pinging-shield reveal fix, active-shell EMP VFX fix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/6MQfBtcDbLYv6CbQxZg3pF/y9s4-patch-notes-addendum: idle-shell site spawn fixes (Oregon 1F Meeting Hall), reinforce/barricade blocking fixes
- https://siege.gg/news/siege-x-y10s2-2-patch-notes: Y10S2.2 idle-shell reinforcement fix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5fWCjoCU8toUJiBdMSj0UA/y11s1-designers-notes: Y11S1 stats and timers, Aruni melee
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/silenthunt: Y11S1 patch text
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2MNhboDBmsQKkWb5p8zqsg/y11s2-designers-notes: Jegeo Payload numbers
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/77rztlEyeqhZVqROCW0ZV7/designers-notes-y11s22-midseason-update: Jegeo per-target cooldown 14 s
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/PONCuRt8LaCr3O31NkBQb/y11s3-designers-notes: Jegeo continuous connection; Claymore 155
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2EIn06EmkAIG7su2fpITue: Y11S2.3: Impact EMP 2 m, Mute 2.6 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes: DSEG rework
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/highstakes and https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/splitfire: price changes
- https://www.trichotome-design.com/blog/2024/9/15/skops-behind-the-scenes: Skopós designer's notes (swap sequencing, camera-in-swap, spawn points per site, shield collision, EMP collar device, Oryx rule, audio design, shared gadgets rationale)
- https://rainbowsix.fandom.com/wiki/Skop%C3%B3s: detailed interactions (DBNO, headshot calibre rule, HUD, Claymore trap, IQ, circuit board, tracking transfer)
- https://rainbowsix.fandom.com/wiki/Dokkaebi: remaster: Skopós loses switching if her phone explodes
- https://rainbowsix.fandom.com/wiki/Mute, https://rainbowsix.fandom.com/wiki/Brava, https://rainbowsix.fandom.com/wiki/Fuze_(Siege), https://rainbowsix.fandom.com/wiki/Sledge_(Siege): cross-operator rules
- https://rainbowsix.fandom.com/wiki/PCX-33: PCX-33 baseline stats (weapons.csv is authoritative)
- https://rainbowsix.fandom.com/wiki/Armor_and_Speed: HP per health rating
- https://siege.gg/news/rainbow-six-siege-operator-guide-skopos: Brava 8 s overheat (test server), Nomad/Deimos notes
- https://gamerant.com/rainbow-six-siege-skopos-operator-guide/ and https://www.strafe.com/news/read/skopos-operator-guide-tips-and-strategies-for-rainbow-six-sieges-latest-defender/: separate pools, Airjab trap, pre-remaster Dokkaebi behaviour
- https://alviran.net/blog/r6-skopos-buff-guide-2026/: cross-check of the Y11S1 numbers
