# Weapons — notes for `weapons.csv`
Verified against: Y11S3 (Operation Split Fire), live patch Y11S3.1 (2026-09-22) — researched 2026-09-29
Confidence: medium. Damage, fire rate and magazine are confirmed by two or more sources for most guns, and every Y11S3 / Y11S3.1 change comes from official Ubisoft notes. Shotgun pellet damage, several ammo pools, reload splits, and the per-weapon destruction tier each rest on one source, or the sources disagree.

---

## 1. How to read `weapons.csv`

- **One row per weapon** (39 guns + the Ballistic Shield = 40 rows). Where operators get different versions of a weapon, the differences are attachment access only, not stats. Those are written into the row (for example "Dokkaebi-only") and listed in §6.
- **Lists inside a cell** use `;`. Cells that contain commas are quoted (standard CSV).
- **`UNVERIFIED:<value>`** means the value is a best-guess placeholder, not a confirmed fact. Plain `UNVERIFIED` means there is no usable value yet. Every one of these appears under Open questions.
- **`verified` column:** `yes` means no core stat in the row is flagged. Core stats are damage, rpm, magazine, max ammo and reloads. `penetration_class` and `destruction_class` are **not** counted, because almost no source gives a destruction tier per weapon (see §4.8).
- **Units:** damage in HP per bullet (**per pellet** for buckshot shotguns), fire rate in rounds/min, times in seconds, distances in metres.
- **`damage`:** base torso damage at close range. For buckshot this is per pellet, and each shot fires `pellets` = 8.
- **`damage_suppressed`:** equal to `damage`, because Y7S3 removed the suppressor damage penalty (see §4.4). Fandom still lists lower "Suppressed" numbers for handguns; I treat those as stale.
- **`magazine` + `chambered_plus_one`:** a closed-bolt gun spawns with magazine + 1 in the chamber (for example 30+1). Open-bolt belt LMGs and tube- or cylinder-fed shotguns have no +1 (see §4.5).
- **`max_ammo`:** Ubisoft's "Total Ammunition" definition, meaning **every round the operator carries**: loaded magazine + chambered round + reserve. It is confirmed by the XK23 official stats: 35-round magazine × 5 magazines = 175 total, and the community sheet shows 35+1 plus 139 in reserve. Most values are the community sheet's `capacity + extra_ammo`. Fandom's ammo numbers are mostly from before Y6S3 and out of date (see §4.6).
- **`reload_tactical_s` / `reload_empty_s`:** the in-game reload time (Ubisoft's definition: animation from the button press back to idle), taken from the Fandom infoboxes. For **tube-fed shotguns** there is no Fandom value, so the columns hold community measurements instead: `reload_tactical_s` = time to insert one shell, and `reload_empty_s` = time to reload from empty to full. The community sheet also measures an "ammo-refill point", the moment the ammo counter updates. That is always shorter, and it is quoted in the notes column for reference.
- **`ads_time_s`:** the official per-class ADS time from Y9S1, measured standing still or walking (see §4.1). The community sheet measures exactly the same numbers.
- **`dropoff_start_m` / `dropoff_end_m` / `min_damage`:** damage is linear from start to end and flat at `min_damage` beyond the end. For buckshot the curve has two stages (see §4.3); the columns hold 5 m and 13 m. `min_damage` is the community-measured value at 40 m, or at 13 m+ for buckshot.
- **`fire_rate_rpm`:** for automatic weapons this is the official or in-game rate, and the community measurement agrees within ±1–4 rpm. For semi-auto, pump, break-action and double-action weapons there is no official number, so the column holds the **community-measured maximum cycle rate**. Fandom's approximations (for example "~550" for handguns) are given in the notes.
- **`penetration_class`:** Fandom's *limb penetration* class. `none` = the bullet stops at the first body part hit. `simple` = it passes through a limb into the torso or head. `full` = it passes through whole operators and damages the one behind for 30% less.
- **`destruction_class`:** Siege's "caliber-based destruction" tier (low / medium / high / full; see §4.8). Only the XK23 has an official value. The others are either inferred and marked `UNVERIFIED:`, or plain `UNVERIFIED`.
- **Sight tokens:** `iron` = iron sight, the "No sight" category. `1x_nonmag` = Red Dot A/B/C, Holographic A/B/C/D and Reflex A/B/C. `magnified_2.5x` = Magnified A/B/C. `telescopic_3.5x` = Telescopic A/B. See §4.2.
- **"Community" / "community-measured"** refers to the hanslhansl weapon-statistics repository (last commit 1a1bb6c, "update for y11s3.1", 2026-09-28). The author measures by hand in the in-game Shooting Range at 120 fps. It is the lowest-priority source, but it is the most current dataset that covers all 39 guns.

---

## 2. Current loadouts of our 12 operators (official Ubisoft operator pages, fetched 2026-09-29)

"(new)" marks an item that is **not** in PLAN.md §11's baseline.

| Operator | Primaries | Secondaries | Gadgets (as listed on the official page) |
|---|---|---|---|
| **Brava** (A) | PARA-308 (AR), CAMRS (DMR) | USP40 (HG), Super Shorty (SG) | Smoke Grenade, Claymore |
| **Fuze** (A) | AK-12 (AR), 6P41 (LMG), **Ballistic Shield** | PMM (HG), GSh-18 (HG) | Breach Charge, Hard Breach Charge, Smoke Grenade |
| **Thermite** (A) | 556xi (AR), M1014 (SG) | 5.7 USG (HG), M45 MEUSOC (HG), **ITA12S (SG) (new, Y10S4)** | Smoke Grenade, Stun Grenade |
| **Striker** (A) | M4 (AR), M249 (LMG), **SR-25 (DMR) (new, Y10S3)** | 5.7 USG (HG), ITA12S (SG) | Gadget Kit pool: Breach Charge, Claymore, Frag, Hard Breach Charge, Smoke, Stun, Impact EMP |
| **Dokkaebi** (A) | BOSG.12.2 (slug SG), Mk 14 EBR (DMR), **XK23 (AR) (new, Y11S2)** | **C75 Auto (MP), GONNE-6 (hand cannon), SMG-12 (MP)** | Smoke Grenade, Breach Charge (Y11S3 replaced Impact EMP) |
| **Sledge** (A) | L85A2 (AR), M590A1 (SG) | P226 Mk 25 (HG), **Reaper MK2 (MP) (new, Y10S3)** | Frag, Stun, Impact EMP Grenade |
| **Sentry** (D) | Commando 9 (AR), M870 (SG), **TCSG12 (slug SG) (new, Y10S3)** | C75 Auto (MP), Super Shorty (SG) | Gadget Kit pool: Barbed Wire, Bulletproof Camera, Deployable Shield, Observation Blocker, Impact Grenade, Nitro Cell, Proximity Alarm |
| **Skopós** (D) | PCX-33 (AR) | P229 (HG) | Impact Grenade, Proximity Alarm |
| **Mira** (D) | Vector .45 ACP (SMG), ITA12L (SG) | USP40 (HG), ITA12S (SG) | Proximity Alarm, Nitro Cell |
| **Lesion** (D; stand-in for "Legion") | SIX12 SD (SG), T-5 SMG (SMG) | **Q-929 (HG) only** (the Super Shorty was removed in Y10S3) | Observation Blocker, Bulletproof Camera |
| **Pulse** (D) | UMP45 (SMG), M1014 (SG) | 5.7 USG (HG), M45 MEUSOC (HG), **Reaper MK2 (MP) (new, Y10S3)** | Nitro Cell, Deployable Shield, Observation Blocker |
| **Mute** (D) | MP5K (SMG), M590A1 (SG) | P226 Mk 25 (HG), SMG-11 (MP) | Bulletproof Camera, Nitro Cell |

- The official pages give no weapon-class label for the XK23, the Reaper MK2 or the Ballistic Shield. Their classes come from the Y11S2 notes (XK23 = Assault Rifle), Fandom (Reaper MK2 = Machine Pistol) and the community sheet (MP).
- The community sheet's `operators.json` lists exactly the same weapons for all 12 operators.
- **Weapons that several of our operators share** (one row each in the CSV): M590A1 (Sledge, Mute), M1014 (Thermite, Pulse), 5.7 USG (Thermite, Striker, Pulse), M45 MEUSOC (Thermite, Pulse), ITA12S (Thermite, Striker, Mira), C75 Auto (Dokkaebi, Sentry), Super Shorty (Brava, Sentry), USP40 (Brava, Mira), P226 Mk 25 (Sledge, Mute), Reaper MK2 (Sledge, Pulse).

---

## 3. Weapon changes from the last ~4 seasons (and older system changes still in force)

| Season / patch | Change | Source |
|---|---|---|
| **Y11S3.1** (2026-09-22) | M1014 damage 30 (was 28). Other changes (Sledge hammer swing 0.8 s, Thermite charge 220 HP) are not weapon stats. | official Y11S3.1 patch notes |
| **Y11S3** (2026-09-01) | **SMG-12**: damage 16 (was 28), magazine 22 (was 32), max ammo 111 (was 129). **Mk 14 EBR**: damage 56 (was 60), first-shot recoil increased (M&K first-shot multiplier 3.5, was 1.8); **Muzzle Brake removed for Aruni** (the notes list this under Aruni only). Dokkaebi: Impact EMP replaced by Breach Charges. Claymore 155. | official Y11S3 Designer's Notes; Split Fire season page |
| Y11S2.3 (2026-08-04) | **Reaper MK2**: recoil stages now start at bullets 0/3/10/25 (were 0/3/7/13). Fuze Cluster Charge breach on reinforced surfaces 1.75 s. | Fandom Patch 11.2.3 (copy of the official notes) |
| Y11S2.2 | Fixed: Mute's Signal Disruptor disabled ACOG/Holo sights on the XK23. | Fandom Patch 11.2.2 |
| Y11S2.1 | Fixed: infinite loading screen when the XK23 is used with a horizontal grip. | Fandom Patch 11.2.1 |
| **Y11S2** (2026-06-02) | **XK23 added** (Dokkaebi, Sens, Rauora): full auto, 49 dmg, 675 rpm, destruction Medium (does not destroy studs), 35-round magazine × 5 = 175 total, reload 3.5 s, extended barrel gives 54 dmg. Dokkaebi lost Stun Grenades. | official Y11S2 Designer's Notes |
| **Y11S1** (2026-03-03) | Shield operators (including Fuze) **can no longer dash through undamaged barricades**. | official Silent Hunt page; Fandom Patch 11.1.0 |
| Y10S4.2 (2026-01-20) | **UMP45**: damage 42 (was 38), improved lateral recoil. | Fandom Patch 10.4.2 |
| Y10S4.1 (2025-12-11) | **Limb damage reduction reverted** to pre-Siege X values (75%). | Fandom Patch 10.4.1 |
| **Y10S4** (2025-12) | Thermite gains the **ITA12S**. Pistol ADS animation reworked (gun held further from the camera). DSEG (EMP, Thatcher, bulletproof-camera dart) now disables **all** sights, not only 1x. | official Y10S4 Designer's Notes |
| **Y10S3** (2025-09-02) | **Reaper MK2** added to Sledge, Pulse, Oryx, Ying and Rook, plus recoil buff (smaller first kick, softer early lateral). Sentry gains the **TCSG12**; Striker gains the **SR-25**; Lesion **loses the Super Shorty**. **Defender automatic weapons lose Magnified sights** (defender slugs and DMRs keep them). Shield operators are exposed while throwing projectiles. | official Y10S3 Designer's Notes; High Stakes page |
| **Y10S2** Siege X (2025-06) | Limb damage cut to 50–70% by class (reverted Y10S4.1). **Shield ADS is cancelled while vaulting.** **Sledge's hammer knocks back shield operators.** | official Y10S2 Designer's Notes; Daybreak page |
| Y9S4 Collision Point (2024-12-03) | Shield suppressive fire: 5 hits to trigger (was 10), 20 to max (was 40). Shield melee damage 0 (was 65). | official Collision Point page |
| Y9S4.2 | **Slug shotguns**: falloff 15→25 m (was 25→35), floor 60% (was 70%), destruction range reduced. TCSG12 damage 75 (was 63). | official Y9S4.2 Designer's Notes |
| **Y9S1** Deadly Omen (2024-03) | **ADS times per class**; iron / non-magnifying / magnified / telescopic sight system; laser, grip and horizontal-grip bonuses reworked; LMG −10% movement; falloff normalized per class; shield rework (no hip fire, and more). | official Y9S1 Designer's Notes |
| Y8S3 Heavy Mettle (2023) | **Buckshot rework**: 100% damage 0–5 m, 75% at 6–10 m, 45% at 13 m+; pellet headshot ×1.5. | official Y8S3 Designer's Notes |
| Y7S3 Brutal Swarm (2022) | **Suppressor damage penalty removed.** Laser on all weapons (including GSh-18 and C75). Extended barrel, compensator, muzzle brake and grips added to many weapons (see §6). | official Y7S3 pre-season Designer's Notes |
| Y6S3 Crystal Guard (2021) | Ammo pools normalized per class; **+1 round** rule; linear per-class falloff; armor converted to HP (100/110/125); Sledge loses the SMG-11. | official Y6S3 pre-season Designer's Notes |

---

## 4. General weapon rules

### 4.1 Classes and ADS (aim-down-sight) time. Official, Y9S1; nothing later changed the times
| Class | ADS (idle/walk) | ADS transition curve | Our weapons |
|---|---|---|---|
| Handgun | 0.24 s | Fast | USP40, PMM, GSh-18, 5.7 USG, M45 MEUSOC, P226 Mk 25, P229, Q-929 |
| Hand cannon | 0.24 s | (not stated) | GONNE-6 |
| Shotgun (buckshot) | 0.34 s | Fast | M590A1, M1014, M870, ITA12L, ITA12S, Super Shorty, SIX12 SD |
| Machine pistol | 0.38 s | Slow | C75 Auto, SMG-12, SMG-11, Reaper MK2 |
| Submachine gun | 0.46 s | Slow | Vector .45 ACP, T-5 SMG, UMP45, MP5K |
| Assault rifle | 0.52 s | Slow | PARA-308, AK-12, 556xi, M4, XK23, L85A2, Commando 9, PCX-33 |
| Marksman rifle (DMR) | 0.52 s | Medium | CAMRS, SR-25, Mk 14 EBR |
| Slug shotgun | 0.52 s | Slow | BOSG.12.2, TCSG12 |
| LMG | 0.56 s | Slow | 6P41, M249 |

- ADS from a sprint is slower "in the same proportion"; the notes give no exact figure.
- Transition curves: **Fast** gains most of its accuracy early in the transition, **Medium** gains it linearly, and **Slow** gains most of it at the end.
- ADS speed bonuses are +10% for iron sights, +5% for non-magnifying sights and +10% for a laser. The community sheet computes "ADS with laser" as `ads / 1.1`.
- With the Ballistic Shield, pistol ADS takes **0.50 s walking / 0.55 s sprinting** (Y9S1).
- LMGs carry a **−10% movement speed** penalty (Y9S1).
- Fandom's `{{ADS}}` template (AR 400 ms, SMG 300 ms, and so on) holds the **pre-Y9S1** values. Do not use it.

### 4.2 Sights. Official Y9S1 system; distribution updated in Y10S3
| Category | Options | Magnification | Bonus |
|---|---|---|---|
| No sight (iron) | weapon's own iron sight | 1.0x | +10% ADS speed |
| Non-magnifying | Red Dot A/B/C, Holographic A/B/C/D, Reflex A/B/C | 1.0x | +5% ADS speed |
| Magnified | Magnified A/B/C | ~2.5x | none |
| Telescopic | Telescopic A/B | ~3.5x | none |

- **Distribution rules:**
  - **Attack:** Magnified on every AR, SMG, LMG, DMR and slug shotgun. Telescopic on attacker DMRs only.
  - **Defense:** Magnified on slugs, DMRs and a short named list. Since **Y10S3, defender automatic weapons have no Magnified sights**, so the Commando 9, PCX-33, Vector, T-5, UMP45 and MP5K are 1x only, while the TCSG12 keeps Magnified.
  - Buckshot shotguns take 1x sights only. Handguns and the C75 Auto use iron sights only.
- The Reaper MK2 "comes with a sight" according to the official Y10S3 page. Fandom lists no optic for it, so its sight is **UNVERIFIED**.
- The Magnified and Telescopic numbers are approximate ("~2.5x", "~3.5x") in the official notes. The community sheet lists 2.5x and 3.5x.
- Kali's CSRX 300 uses 3.5x / 8x scopes (Y11S3). She is not in our roster; this is noted only to show that other magnifications exist.
- Y11S1's Dual Front mode added a 2.5x sight to more weapons. That applied to Dual Front only, which was removed in Y11S2.
- DSEG effects (Impact EMP, bulletproof-camera EMP dart, Thatcher) have **disabled every sight type** since Y10S4.

### 4.3 Damage falloff model
Damage stays at full value up to the start distance, drops **linearly** to the minimum at the end distance, and stays flat beyond it.

| Class | Full damage until | Minimum reached at | Minimum (% of base) | Source |
|---|---|---|---|---|
| Assault rifle | 25 m | 35 m | 60% | official Y6S3 table; community matches |
| SMG | 18 m | 28 m | 60% | official Y6S3; community matches (Fandom template says 20 m — outdated) |
| Machine pistol | ~18 m | 28 m | ~60% | community-measured only (Fandom template 20→28) |
| LMG | 30 m | 40 m | 65% | official Y6S3; community matches |
| DMR | 30 m | 40 m | 70% | official Y6S3; community matches |
| Slug shotgun | 15 m | 25 m | 60% | official Y9S4.2 |
| Handgun | ~11–12 m | ~14 m | ~60% | community-measured (Fandom template 12→15 m); **official value UNVERIFIED** |
| Buckshot shotgun | 5 m (100%) | then 75% from 6–10 m, sloping down to **45% at 13 m+** | 45% | official Y8S3 (does not apply to the BOSG, TCSG12 or ACS12) |

- **Extended barrel** (community-measured): damage = floor(base × 1.12). Examples: PARA 47→52, M4 44→49, XK23 49→54 (54 is also the official figure), UMP45 42→47. The floor rises to **~80%** of the extended-barrel damage, for example PARA 42 and XK23 43. The falloff start and end distances stay the same. Fandom's Extended Barrel page says "falloff reduced by 15–20%", and the community `attachment_overview.json` says "+10% damage". The measured per-weapon values fit ×1.12 with flooring.
- **Headshots:**
  - Bullets from non-shotgun weapons kill in one headshot.
  - A buckshot pellet does 1.5× its range-modified damage to the head (official Y8S3).
  - Whether **slug** headshots are one-shot kills is not stated (UNVERIFIED).
- **Limbs** (details are in `core_mechanics.md`):
  - 75% of damage, restored in Y10S4.1 after Siege X's 50–70% experiment.
  - Community note: the CSRX 300 does 60% to limbs.
- **HP pools** since Y6S3: 1-armor = 100 HP, 2-armor = 110 HP, 3-armor = 125 HP (these ratings are now called Health). Rook's plates added +20 in Y6S3 and were raised to +25 in Y11S1.1. The community sheet says +30; this belongs to `core_mechanics.md`.

### 4.4 Barrels (muzzle attachments)
| Attachment | Effect | Sources and disagreements |
|---|---|---|
| **Suppressor** | Quieter shots (Fandom: audible only within ~30 m), no muzzle flash, no bullet tracer, and missed shots do not trigger the threat indicator. **No damage penalty since Y7S3.** Y6S3 had normalized a 15% penalty; Y7S3 removed it for all weapons ("make the suppressor an impactful decision because of the lack of recoil mitigation"). No recoil reduction. | official Y6S3 and Y7S3 notes; Fandom Suppressor page. Fandom handgun infoboxes still show "Suppressed" damage 10–20% lower; I treat those as stale (**open question**). |
| **Muzzle brake** | Reduces **first-shot** recoil and speeds up the crosshair re-centering. Best on semi-auto weapons. | Fandom: −45% first shot and −45% re-center time. Community: −50% first shot. |
| **Compensator** | Reduces **horizontal** recoil. | Fandom: −35%, citing the Commanding Force page. Community: −40%. |
| **Flash hider** | Reduces **vertical** recoil throughout a spray; the go-to choice for automatics. | Fandom: ≈ −13% first-shot vertical and ≈ −15% overall vertical. Community: −20% vertical. |
| **Extended barrel** | More base damage and a higher floor (see §4.3). No recoil help. Only on some weapons: PARA-308, M4, XK23, Commando 9, PCX-33, Vector, T-5, UMP45, MP5K, SMG-11. | official Y7S3 and Y11S2; community measurements |

Integral suppressors: the SIX12 SD and the SMG-12, which therefore have no barrel slot (Fandom).

### 4.5 Grips and under-barrel. Official Y9S1
- **Vertical grip:** +20% control of vertical recoil (was +25% before Y9S1).
- **Angled grip:** +20% reload speed (Y9S1; it used to speed up ADS). Example from Fandom: SMG-12 reloads 2.0/3.0 s without it and 1.5/2.4 s with it, roughly a factor of 0.8 on the time.
  - Fandom's Angled Grip page still describes the old "32% ADS" bonus, which is stale.
- **Horizontal grip:** the renamed "no grip" option. +5% movement speed, which lets a primary move at handgun speed; it never exceeds the operator's cap.
- Only weapons with a grip slot get any of these bonuses. The MP5K has none (the official example).
- **Laser** (under-barrel): +10% ADS speed. Y9S1 removed its old hip-fire bonus. Enemies can see the red dot, and the laser glints when you face the shooter (Fandom).
  - Since Y7S3 the laser is available on essentially every weapon; in our set, everything except the GONNE-6.
  - Fandom's Laser page still claims "25% tighter hip-fire and pellet spread", which is stale.

### 4.6 Capacity: the +1 chambered round, open-bolt weapons, ammo pools
- **Y6S3 rule** (official): "each weapon will also get one extra bullet, similar to what you previously saw with open bolt guns. Unlike open bolts, closed bolt guns will get this extra bullet in their initial magazine."
  - **Closed-bolt** magazine-fed guns spawn with magazine + 1 (30+1). A **tactical reload** (reloading with rounds left) keeps the +1 in the chamber. An empty reload gives only the magazine.
  - **Open-bolt** weapons in our set are the belt-fed LMGs **6P41** and **M249**. They show 100+0, and their extra round sits in reserve (201 = 2 belts + 1).
  - Fandom notes that the T-5 and SMG-11 are open-bolt in real life, yet the game gives them +1.
- **Tube-fed shotguns** (M590A1, M1014, M870, ITA12L, ITA12S, Super Shorty) load one shell at a time, so the "+1" wording does not apply. Fandom writes "6+1", while the community sheet writes the same total as "7+0". The **SIX12 SD** swaps its whole 6-round cylinder.
- **Break-action BOSG.12.2:** 2 rounds, reloads both.
- **Total ammo ranges from Y6S3** (loaded magazine + chambered round + reserve; the rows are consistent with these):

| Class | Total ammo range |
|---|---|
| Assault rifle | 175–200 |
| SMG (primary) | 170–200 |
| LMG | 240–300 (the 301 includes the +1) |
| DMR | 100–140 |
| Shotgun (primary) | 49–60 |
| Secondary SMG / MP | 112–140 |
| Pistol | 70–115 |
| Slug shotgun | 60–120 |

- Secondary shotguns kept their old ammo counts in Y6S3, apart from the +1.
- Fandom's older ammo numbers fall outside these ranges (for example L85A2 31+210 = 241 and T-5 241), so they predate Y6S3.
- **Skopós:** each V10 Pantheon shell has its **own ammo reserve** (Fandom Skopós page).

### 4.7 Shotgun types
- **Buckshot**, 8 pellets per shot:
  - **Pump:** M590A1, M870, ITA12L, ITA12S, Super Shorty.
  - **Semi-auto, tube-fed:** M1014.
  - **Double-action revolver:** SIX12 SD, with a 6-round cylinder and an integral suppressor.
  - Two-stage falloff (§4.3); per-pellet headshot ×1.5.
  - Aiming down sight gives a tighter spread; moving widens it (official Y8S3).
  - Up close, buckshot can break the wooden studs/beams in soft walls and open hatches and barricades (Fandom Destruction page), which makes it the main soft-destruction tool. Tight hip-fire spread, as on the Super Shorty, may need a precise angle to open a hatch in one shot.
  - Limb penetration: none.
- **Slug**, 1 projectile:
  - **BOSG.12.2** (break-action double barrel, 125 dmg) and **TCSG12** (semi-auto magazine-fed, 75 dmg).
  - Their own class since Y9S1, with ADS 0.52 s.
  - Falloff 15→25 m with a 60% floor (Y9S4.2). Their "destruction range" was reduced in Y9S4.2.
  - Limb penetration: full.
  - They keep Magnified sights even on defense.

### 4.8 Penetration and destruction by weapon
- **Limb penetration** classes (Fandom Bullet Penetration page, written during Shifting Tides):
  - `none`: all buckshot shotguns, SMG-11, C75 Auto, SMG-12.
  - `simple`: ARs, SMGs, LMGs, pistols.
  - `full`: DMRs and slug shotguns; the round passes through a whole operator and hits the next one for −30%.
  - The XK23, PCX-33 and Reaper MK2 are not on the page (UNVERIFIED).
- **Destruction tiers** ("caliber-based destruction", Fandom Destruction page):
  - **Low:** bullets dent surfaces and eventually break them, slowly; they never break studs.
  - **Medium:** like Low but much faster; no studs.
  - **High:** faster still; can shoot open non-reinforced hatches; no studs.
  - **Full:** instantly destroys studs and walls; every breachable surface can be broken.
- **Tiers known per weapon:**
  - **XK23 = Medium** (official Y11S2).
  - **SMG-12**: Fandom's infobox says "penetration=Low", which probably refers to this tier.
  - **DMRs** are strongly implied to be High: Y5S1 "increased destruction for DMRs … barricades, hatches"; Fandom says the Mk 14 opens a hatch in 7 shots and the CAMRS in under 10.
  - **Slugs**: Fandom lists "High destruction".
  - **Buckshot** behaves like Full at close range.
  - Everything else is **UNVERIFIED** — a direct question for Ulo (does the Siege X loadout screen show a destruction stat?).
- Hard and reinforced walls stop all bullets. Metal supports in floors block penetration (Fandom). Details belong in `destruction.md`.

### 4.9 Recoil model (what official notes describe)
- Official changes are written as:
  - first-shot kick ("First Shot Multiplier" on M&K; Mk 14 raised to 3.5 in Y11S3);
  - vertical recoil;
  - horizontal (lateral) recoil;
  - "recoil stages" by bullet index (Reaper MK2 stages at bullets 0/3/10/25);
  - "long burst" start bullet.
- Recoil is tuned separately for M&K and controller.
- Y7S3 increased recoil on all ARs, SMGs, LMGs and MPs.
- Y9S1 eased recoil on the 6P41 and M249, offset by the LMG movement penalty.
- Each row's `notes` column gives a qualitative summary. Fandom has recoil-pattern images for several guns (for example `L85 Recoil.png`, `SMG12 Recoil.png`); they were not downloaded.

---

## 5. Ballistic Shield (Fuze)
Fuze carries the standard Ballistic Shield as his primary and uses it with his secondary, the PMM or GSh-18. Other shield users (Montagne, Blitz, Blackbeard, Clash) have variants that are not in our roster.

| Rule | Value | Source |
|---|---|---|
| Coverage | Head and torso from the front, with an eye-level bulletproof glass panel that cracks under fire and reduces visibility. Legs exposed while standing (crouch to cover more); shoulders, sides and back open. Stowed on the back, it covers the back but not the head. | Fandom |
| Movement | Walk, crouch-walk and sprint with the shield raised; it stays in front while sprinting (Y9S1). Going prone unequips it. It cannot be used while rappelling. | official Y9S1; Fandom |
| Speed penalty | −10% of base speed while carrying the shield, equipped or not. | Fandom (**UNVERIFIED** as current) |
| Firing | **No hip fire** (removed Y9S1); holding fire does a "free look" instead. Press ADS to raise the pistol: the shield tilts and the head is exposed. The weapon fires only once the ADS animation is finished. | official Y9S1; Fandom |
| Pistol ADS time | 0.50 s walking / 0.55 s sprinting | official Y9S1 |
| Vaulting | Vaulting cancels ADS (Y10S2); ADS resumes if the button is still held. | official Y10S2; Fandom |
| Reload | Done behind the shield; automatic when the magazine empties. | official Y9S1 |
| Free look | Hold the fire button to look around while the shield faces forward; gadgets can be thrown in the look direction. | official Y9S1 |
| Throwing / gadgets | Grenades are thrown from behind the shield, with a slight exposure animation since Y10S3. Cluster Charges and breach charges can be triggered behind the shield. **Placing** a Cluster or Breach Charge temporarily unequips it. | official Y10S3; Fandom |
| Melee (bash) | **0 damage** (was 65, changed in Y9S4). Knockback / guard break on the target; range similar to a knife melee; cancelled if the other player's melee lands first. A target pushed into a breakable wall or hatch breaks it and takes +5 (Fandom). | official Collision Point page; Fandom |
| Barricades | Y9S1 allowed pushing through a barricade in one go. **Since Y11S1 shield operators cannot dash through *undamaged* barricades.** The normal 3 melee hits still work. | official Y9S1 and Silent Hunt page |
| Suppressive fire | Bullet hits on the shield suppress the carrier: **5 hits to trigger, 20 for maximum intensity, ~7 s falloff**. While suppressed: no sprint, blurred screen edges and tinnitus. Higher-caliber hits (shotguns, DMRs) suppress more. | official Y9S1 (falloff) and Y9S4 (5/20); Fandom |
| Guard break | The shield is knocked aside (up to ~90° left for ~1 s at 100%). Causes and intensity: explosives ≥30 dmg, scaling to 100% at full blast; concussion effects always 100%; melee always 100% and it escalates with consecutive hits; electricity and fire give a small continuous break. Touching fire gives 40%. | Fandom; official Y9S1 (fire 40%) |
| Knockdowns | Sledge's hammer (since Y10S2), Oryx's dash, Nomad's Airjab and an enemy shield bash knock the carrier down and unequip the shield. | official Y10S2; Fandom |
| Explosives | Damage still passes through, reduced by how much of the blast the shield covers. The GONNE-6 does not knock back shields. | Fandom |
| Y11S3 counter | Noor's Horus Lance (a new defender) sticks to shields and burns, forcing the carrier to expose themselves to remove it. Noor is not in our roster. | official Split Fire page |
| Hostage | The shield stays equipped while escorting. | official Y9S1 |

---

## 6. Differences between operators (same weapon, different operator)
- **Mk 14 EBR:**
  - Y11S3 removed the Muzzle Brake from **Aruni's** copy only; the official notes list it under Aruni.
  - Fandom's attachment template gives the Muzzle Brake and the Telescopic sights to **Dokkaebi only**, so Dokkaebi keeps both.
  - Some news sites wrote "Muzzle Brake removed from the Mk 14 EBR" without the Aruni qualifier. The official notes are more specific, so I followed them.
- **CAMRS:** grips (vertical/angled/horizontal) exist on **Brava's** copy only. Buck's has the Skeleton Key instead.
- **5.7 USG:** Fandom says the Muzzle Brake is "FBI SWAT/Nøkk/Fenrir only". That gives it to Thermite and Pulse; **Striker's** copy is UNVERIFIED. Zero's copy has a fixed suppressor, which does not affect us.
- **Commando 9:** Sentry uses a standard reload animation, while Mozzie has a unique "mag catch" animation. The stats are the same.
- **SMG-12:** Warden's reload animations differ. Not relevant to us.
- **Siege X Striker / Sentry:** the old Recruit had preset attachments (Fandom's M870 page). Whether the new Striker and Sentry get the full attachment lists is UNVERIFIED; the CSV assumes the standard lists.
- **Skopós's PCX-33 and P229:** separate ammo per shell.
- No stat differences between operators (damage, rpm, magazine) were found for any shared weapon.

---

## Open questions
Most of these can be answered from the in-game loadout screen, the HUD ammo counter at round start, or the Shooting Range.

1. **Shotgun pellet damage** in the loadout screen's damage stat: M870 (community 42 vs Fandom 60), ITA12L (community ~40 vs Fandom 50), ITA12S (community 29 vs Fandom 70) and SIX12 SD (community 46 vs Fandom 35). I believe the Fandom numbers predate the Y8S3 rework, but Ulo could read the true values in about 30 seconds.
2. **PMM damage:** 61 (community) or 63 (Fandom)?
3. **Max ammo at spawn** (reserve counter + magazine) for:
   - TCSG12 (community 121 vs Fandom 61);
   - SR-25 (141 vs 101);
   - Mk 14 EBR (121 vs 101);
   - 5.7 USG (121 vs 81);
   - ITA12S (36 vs 26);
   - Reaper MK2 (130 vs "133");
   - PCX-33 (155; is it per shell?);
   - SMG-12 (the official Y11S3 notes say 111, the community test-server data implies 101).
4. **Reload times** with no clean value: XK23 (official "3.5 s" without saying tactical or empty; Fandom 3.35), Reaper MK2 tactical (Fandom's 0.34 s is a typo), and the tactical-vs-empty split for the 6P41 (8.5 s), M249 (7.6 s) and PCX-33 (3.3 s). Does the Siege X loadout screen show reload speed? If so, please list them.
5. **Destruction tier:** does the Siege X loadout screen show a "Destruction" stat (Low/Medium/High/Full)? If yes, please record it for our 39 guns. Only the XK23 (Medium) is officially confirmed.
6. **Attachments by operator:**
   - Does Dokkaebi's Mk 14 EBR still have the Muzzle Brake and Telescopic sights after Y11S3?
   - Does Striker's 5.7 USG have the Muzzle Brake?
   - Does Brava's CAMRS still take grips?
   - Which sight(s) can the Reaper MK2 take?
   - Does the M249 have a Muzzle Brake? (Y7S3 added one; Fandom's current table doesn't list it.)
7. **Suppressor damage:** equip a suppressor on a pistol (for example Brava's USP40). Does the damage stat drop? The CSV assumes no penalty (Y7S3); Fandom shows about −15%.
8. **Fire modes:** do the AK-12, M4, Commando 9, UMP45, MP5K and T-5 still offer 3-round burst, and does the Vector offer 2-round burst?
9. **Limb penetration** for the XK23, PCX-33 and Reaper MK2 (not on the Fandom list). The CSV guesses simple / simple / none.
10. **Handgun falloff:** where exactly does it start and end (community ~12→14 m, Fandom 12→15 m)? Shooting Range distances would settle it.
11. **Ballistic Shield movement penalty** (Fandom says −10%) and whether the Y9S1 rule "10 bullets / 40 bullets" still has only the Y9S4 5/20 changes on top. The CSV uses 5/20.
12. **GONNE-6** current explosion damage and radius (Fandom only; its armor-class wording predates Y6S3).
13. **Slug headshots:** are they one-shot kills (like rifles) or ×1.5 (like buckshot pellets)?

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/brava (also /fuze, /thermite, /striker, /dokkaebi, /sledge, /sentry, /skopos, /mira, /lesion, /pulse, /mute) — current loadouts, class labels, gadgets (fetched 2026-09-29).
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/PONCuRt8LaCr3O31NkBQb/y11s3-designers-notes — SMG-12, Mk 14 EBR, Aruni's Mk 14 Muzzle Brake removal, Dokkaebi gadget swap, Claymore.
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/splitfire — Y11S3 patch notes (Mk 14 first-shot multiplier 3.5, SMG-12 numbers, Noor vs shields).
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes — M1014 damage 30 (Y11S3.1).
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/6HzsdnbOYovXelORy4mB7z/y11s3-patch-notes-addendum — checked; bug fixes only.
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/2MNhboDBmsQKkWb5p8zqsg/y11s2-designers-notes — XK23 official stats (damage, rpm, destruction Medium, magazine and total ammo, reload, attachments).
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/systemoverride — Y11S2 season page (XK23 distribution).
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/silenthunt — Y11S1 shield barricade rule.
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes — Thermite ITA12S, pistol ADS animation, DSEG affects all sights.
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/4czc3hlHtXrd27crELGDcc/y10s3-designers-notes — Reaper MK2 additions and recoil, TCSG12 to Sentry, SR-25 to Striker, Lesion loses Super Shorty, defender Magnified removal, shield throw exposure.
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/highstakes — Y10S3 season page ("Reaper MK2 … comes with a sight").
- https://www.ubisoft.com/en-au/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes — Siege X limb multipliers, shield ADS-on-vault, Sledge vs shields.
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/daybreak — Y10S2 season page (Sledge hammer vs shields, bullet-hole cleanup).
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/prepphase — Reaper MK2 introduced (Rauora).
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/collisionpoint — Y9S4 shield suppression 5/20 and melee 0 dmg.
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/7bfYr7UJrJwiEp7zpQa0dd/y9s42-designers-notes — slug falloff 15→25 m, 60%, TCSG12 75 dmg.
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/3jBlCdtRBQx2sCjmY2umNu/y9s1-designers-notes — ADS times per class, sight categories and bonuses, grips, laser, LMG movement, shield rework.
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/2Btj0mP7e7gVKIODGSLuiX/y8s3-designers-notes — buckshot falloff 100/75/45%, pellet headshot ×1.5, spread rules.
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2vKaDckg5VPV1ViA4p8KM/y7s3-preseason-designers-notes — suppressor damage penalty removed, attachment distribution (laser, grips, barrels).
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/2zsUnVBdSsc10rirkPl1K5/y6s3-preseason-designers-notes — ammo ranges per class, +1 round rule, falloff table (AR/SMG/LMG/DMR), HP values, Sledge loses SMG-11.
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.3.0 , /Patch_11.2.1 , /Patch_11.2.2 , /Patch_11.2.3 , /Patch_11.1.0 , /Patch_11.1.1 , /Patch_11.1.2 , /Patch_11.1.3 , /Patch_10.4.1 , /Patch_10.4.2 , /Patch_5.1.0 — patch history (Reaper recoil stages, UMP45 42, limb-damage revert, XK23 bug fixes, DMR destruction increase in Y5S1).
- https://rainbowsix.fandom.com/wiki/PARA-308 (also CAMRS, AK-12, 6P41, Ballistic_Shield, 556xi, M1014, M4, M249, SR-25, BOSG.12.2, Mk_14_EBR, XK23, L85A2, M590A1, Commando_9, M870, TCSG12, PCX-33, Vector_.45_ACP, ITA12L, SIX12, T-5_SMG, UMP45, MP5K, USP40, Super_Shorty, PMM, GSh-18, 5.7_USG, M45_MEUSOC, ITA12S, C75_Auto, GONNE-6, SMG-12, P226_Mk_25, Glock [Reaper MK2], P229, Q-929, SMG-11) — infobox stats, reload times, attachment tables, recoil descriptions, per-operator attachment notes. Fetched via the MediaWiki API (wikitext).
- https://rainbowsix.fandom.com/wiki/Template:WeaponDamage , https://rainbowsix.fandom.com/wiki/Template:ADS , https://rainbowsix.fandom.com/wiki/Template:WeaponAttachments — how Fandom computes falloff and ADS (outdated where noted), and what its attachment flags mean.
- https://rainbowsix.fandom.com/wiki/Bullet_Penetration — limb penetration classes per weapon.
- https://rainbowsix.fandom.com/wiki/Destruction — destruction tiers (Low/Medium/High/Full), surface types, shotgun beam-breaking.
- https://rainbowsix.fandom.com/wiki/Suppressor , /Extended_Barrel , /Muzzle_Brake , /Compensator , /Flash_Hider , /Angled_Grip , /Vertical_Grip , /Laser_Sight , /Telescopic_Scope — attachment effect figures (some stale; noted inline).
- https://rainbowsix.fandom.com/wiki/Skop%C3%B3s — separate ammo reserve per shell. https://rainbowsix.fandom.com/wiki/Fuze_(Siege) — shield notes.
- https://github.com/hanslhansl/rainbow-six-siege-weapon-statistics (commit 1a1bb6c, 2026-09-28, "update for y11s3.1"; `weapons/*.json`, `operators.json`, `attachment_overview.json`, README) — community hand-measured damage-by-distance at 5–40 m, measured rpm, capacity + reserve ammo, ammo-refill reload times, ADS times, extended-barrel curves. Lowest priority; cited per row.
- https://r6.arenyze.com/weapons — checked; no usable per-weapon data (it does not include the XK23).
- Liquipedia (https://liquipedia.net/rainbowsix/) — tried once; returned HTTP 429 (rate-limited) and was not used.
