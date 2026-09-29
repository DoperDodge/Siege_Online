# Core Mechanics — movement, health, damage, DBNO, friendly fire, audio, ADS
Verified against: Y11S3 (Operation Split Fire, live since 2026-09-01; patch Y11S3.1) — researched 2026-09-29
Confidence: medium. The rules (what is allowed, what changed and when) are well sourced from Ubisoft patch notes, Designer's Notes and season pages. Most **numbers** Siege does not publish (m/s speeds, hitbox heights, lean angle, fall-damage curve, bleed-out time, footstep ranges) come from community measurements or are **UNVERIFIED**. Every UNVERIFIED item is listed under "Open questions" so Ulo can measure or confirm it in a Custom Game.

**Status tags used below**
- `OFFICIAL`: Ubisoft patch notes, Designer's Notes, season page, roadmap or operator page.
- `WIKI`: Fandom wiki (below official in source priority).
- `COMMUNITY`: Steam guides/threads or press articles.
- `UNVERIFIED`: no reliable source found. Any number next to it is a **PLACEHOLDER** that I made up for prototyping. It is **not** a Siege value.

Terminology: Siege's UI shows two 1–3 star stats per operator, **HEALTH** and **Speed**. Ubisoft's page code still uses the key `r6s.common.armor` for the HEALTH label, which is why guides still say "armor". "Armor" was converted to plain HP in Y6S3 Crystal Guard.

---

## 1. Health & Speed ratings

### 1.1 How the system works (current)
| Rule | Value | Status / source |
|---|---|---|
| Rating scales | HEALTH 1–3 and Speed 1–3, shown as stars on each operator page | OFFICIAL (operator pages) |
| Pairing | Every rating change in the last 4 seasons kept **HEALTH + Speed = 4**: 1H/3S, 2H/2S, 3H/1S. Examples: Skopós to 3S/1H (Y11S1), Jäger to 3S/1H (Y11S2.2), Zofia to 2H/2S (Y11S2), Echo to 2S (Y10S3), Ace to 1S/3H (Y10S4). Treat HEALTH and Speed as two separate data fields anyway. | OFFICIAL (patch notes); the pairing rule is my inference |
| Armor damage reduction | **None.** Since Y6S3 Crystal Guard, armor is just max HP. The old 0% / 10% / 20% resistances are gone. | OFFICIAL via press copy of CG patch notes (dexerto); WIKI |
| Things not changed by HEALTH rating | Fall damage, gadget damage (e.g., Twitch shock drone), bleed-out time | WIKI (Armor and Speed page). This predates CG and was not re-checked. |
| Experiment (not live) | Y10S4 "Testing Grounds" playlist (Jan 8–15 2026) let players pick their own Health/Speed values. It was an experiment and did not ship. | OFFICIAL (Tenfold Pursuit season page) |

### 1.2 Max HP per HEALTH rating
| HEALTH rating | Max HP | Status |
|---|---|---|
| 1 (light) | **100** | OFFICIAL (CG patch notes via dexerto); WIKI |
| 2 (medium) | **110** | same |
| 3 (heavy) | **125** | same (the Test Server once tried 140; not live) |

Modifiers you need to know about (other agents own the details):
- **Rook Armor Plate: +25 max HP for the round.** This was +20 until Y11S1.1 (OFFICIAL, Y11S1.1 notes; Fandom still says 20). A plate also guarantees DBNO instead of death, except on headshots. It works against grenades and claymores too (OFFICIAL, Rook page). A downed plate-wearer can self-revive ("Withstand", added Y8S3 — WIKI).
- **No passive HP regeneration** is documented anywhere. Healing only comes from gadgets (Doc Stim, Finka Adrenal Surge, Thunderbird Kóna at 3 HP/s since Y11S1.2). Overheal is capped (Doc: up to 140 total, decaying 1 HP/s — WIKI). Treat "no regen" as UNVERIFIED-lite and confirm with Ulo.

### 1.3 Ratings of our 12 operators (read from official pages 2026-09-29, for convenience; the operator files are authoritative)
| Operator | HEALTH | Speed | Note |
|---|---|---|---|
| Brava | 1 | 3 | |
| Fuze | 3 | 1 | Ballistic Shield option lowers speed further (see 2.3) |
| Thermite | 2 | 2 | |
| Striker (Recruit) | 2 | 2 | |
| Dokkaebi | 1 | 3 | |
| Sledge | 2 | 2 | Fandom lists him as Heavy. **Official page says 2/2**, so official wins. |
| Sentry (Recruit) | 2 | 2 | |
| Skopós | 1 | 3 | Changed Y11S1 (was 2/2) |
| Mira | 3 | 1 | |
| "Legion" → **Lesion** (provisional) | 2 | 2 | "Legion" does not exist in Siege; Lesion assumed |
| Pulse | 1 | 3 | |
| Mute | 2 | 2 | Fandom lists him as Heavy. **Official page says 2/2**, so official wins. |

---

## 2. Movement speeds

### 2.1 Base speeds per Speed rating (m/s)
Siege does not publish speeds. There are three community sources, and they disagree:

| Speed rating | Sprint — dataset A (Steam thread, 2019) | Sprint — dataset B (Steam guide, Mar 2024, post-Y9S1) | Sprint — Fandom (% of 3-speed) | Walk ("run", default movement) — A | Walk — B |
|---|---|---|---|---|---|
| 3 | 5.00 | 5.00 | ~5.0 (100%) | 3.33 | 3.10 |
| 2 | 4.50 | 4.75 | ~4.5 (90%) | 3.00 | 3.00 |
| 1 | 4.00 | 4.25 | ~3.75 (75%) | 2.67 | 2.85 |

**Chosen provisional default: dataset B** (it is the most recent and post-dates the Y9S1 movement/ADS rework). It is still COMMUNITY/UNVERIFIED. All three sources agree that 3-speed sprint is about 5.0 m/s. Siege has changed speeds before (for example Solar Raid's ADS-speed normalization), so ask Ulo to re-measure (see Open questions).

| Movement mode | Value | Status |
|---|---|---|
| Crouch-walk speed | PLACEHOLDER ≈ 0.55 × walk speed for that rating | UNVERIFIED |
| Prone crawl speed | PLACEHOLDER ≈ 0.7 m/s for all ratings | UNVERIFIED. Siege has a defined prone speed: Y11S1.1 fixed "Operator's prone movement speed is faster than in previous seasons" (OFFICIAL). |
| **ADS walk speed** | **The same for every operator** (Solar Raid Y7S4: "all Operators now move at the same speed while aiming down sights… reduced… to match the 3 Health Operators"). PLACEHOLDER ≈ 1.9 m/s. | Rule OFFICIAL; number UNVERIFIED |
| Slow walk | A separate "slow walk" key exists on PC (default Alt in a 2021 community controls list). Speed UNVERIFIED. Controllers get analog speed from the stick. | COMMUNITY |
| Jump | **No free jump.** Space is contextual **Vault** (drones jump, operators do not). | COMMUNITY (Steam controls guide) |
| Hip-fire movement speed | Same as walk | inferred |

### 2.2 Equipment speed modifiers (multiplicative)
| Modifier | Effect | Status |
|---|---|---|
| Horizontal Grip | **+5 % movement speed** | OFFICIAL (Y9S1 Deadly Omen) |
| LMG class | **−10 % movement speed** | OFFICIAL (Y9S1) |
| Semi-auto handguns +5 % | Claimed by the 2024 Steam guide | UNVERIFIED (no official source found) |
| Ballistic Shield (Fuze, Montagne) | Fandom: −10 % (to ~3.375–3.75 m/s), even when the shield is holstered. The Steam guide says 3.75 m/s running. Shields can sprint with the shield equipped since Y9S1 (OFFICIAL). | WIKI/COMMUNITY, UNVERIFIED |
| Being shot while holding a shield | Slowed, and vision is altered ("suppressive fire") | OFFICIAL (Y9S1) |
| Electricity | Temporary **slow** (no damage) since Y10S2. You only get it by interacting: walking on or vaulting electrified objects. | OFFICIAL |
| Gridlock Trax | 10 s limp (Y11S2) | OFFICIAL (context) |

### 2.3 Momentum and drops (Siege X)
- "Momentum is maintained when you step off short ledges." (OFFICIAL, Y10S2)
- **Long drops force you out of ADS.** Shield operators cannot ADS while vaulting or dropping from higher levels. (OFFICIAL, Y10S2)

---

## 3. Stances

| Item | Value | Status |
|---|---|---|
| Stances | Stand, Crouch, Prone | OFFICIAL/common knowledge |
| Toggle vs hold | The options offer both hold and toggle for crouch, prone, lean and ADS. Y11S1 added "Interactive Remapping and new Press & Hold options". Y11S3 redesigned the whole Options menu. | Roadmap OFFICIAL; the exact per-action list is from keymap.io (low reliability) → confirm with Ulo |
| Standing: eye height / top of head | PLACEHOLDER 1.65 m / 1.80 m | UNVERIFIED |
| Crouch: eye height / top of head | PLACEHOLDER 1.15 m / 1.30 m | UNVERIFIED |
| Prone: eye height / top of body | PLACEHOLDER 0.35 m / 0.45 m | UNVERIFIED |
| Transition times | PLACEHOLDER: stand↔crouch 0.25 s; crouch→prone 0.8 s; prone→stand 1.0 s | UNVERIFIED. Official guidance: getting up from prone is slow and "you can't really do much" during it. Since Y4S1 you cannot skip crouch/lean transitions by spamming (anti "crouch and lean spam" fix). |
| Hip-fire spread per stance | **Identical in all stances** (Y7S4: "Operators now keep the same hip-fire spread in all stances") | OFFICIAL |
| Prone turn rate / aim arc limits | UNVERIFIED (PLAN §7 asks for this; no source found) | UNVERIFIED |
| Prone uses | Pixel angles, seeing under door barricades and through drone holes; it is loud and slow to exit | OFFICIAL (Ubisoft "Rank Up: Mastering Movement" transcript) |
| Crouch through a damaged barricade | Intended to be possible without fully destroying it (a Y10S4.1 bug fix restored this) | OFFICIAL |
| Hitbox | The server hitbox must follow stance **and** lean. Leaning "changes your player model and your position" (official Rank Up guide). | OFFICIAL (qualitative) |

---

## 4. Lean / tilt

| Rule | Value | Status |
|---|---|---|
| Directions | Left / right (PC default Q/E) | OFFICIAL/common |
| Stances | Siege was designed for "free lean… in **any stance** at any moment". Ubisoft designers describe leaning from prone and from crouch. | OFFICIAL (Behind The Wall: Cover and Lean, 2015 pre-release). Prone-lean in the current build: UNVERIFIED-lite, ask Ulo |
| Lean while ADS | Yes | OFFICIAL |
| Lean without ADS ("hip lean") | Always possible on PC. On controller, "Standard" lean needs ADS (stick press while aiming); "Alternate" lean mode allows hip lean. | COMMUNITY (1v9.gg, keymap.io) |
| Lean while moving | Yes, e.g. leaning into a strafe | OFFICIAL (Behind The Wall) |
| Lean while sprinting | UNVERIFIED. I expect sprint to cancel or block lean; not confirmed. | UNVERIFIED |
| Lean while rappelling | Yes, including upside-down (inverted) | OFFICIAL (Behind The Wall) |
| Toggle vs hold | Both available ("Toggle Lean" option). On toggle, dropping ADS does not always drop the lean. | COMMUNITY (keymap.io) |
| Lean vs gadget swap | Swapping to a gadget normally cancels ADS and lean. Y11S3 exempted Kali's V-Lance ("does not cancel the ADS or lean state"), which implies the general rule. | OFFICIAL (inferred general rule) |
| Lean angle / camera offset | PLACEHOLDER: roll 15°, lateral head offset 0.30 m, transition 0.15 s | UNVERIFIED |
| Third-person visibility | Visible to others: upper-body bend and shifted hitbox | OFFICIAL (qualitative) |

---

## 5. Vault / climb

| Rule | Value | Status |
|---|---|---|
| Input | Vault key (PC Space). **Since Y10S2 the input is buffered:** hold vault and run into a vaultable object to vault without waiting for the prompt. | OFFICIAL |
| What is vaultable | Low obstacles (vault **over**), higher ledges and furniture (vault **onto**), open windows, destroyed window/door openings, deployable shields, **damaged barricades** | OFFICIAL/WIKI |
| Barricades | You cannot vault through an intact barricade. You can "vault or rappel through them if a large enough piece of the barricade is destroyed, destroying it in the process". 3 melee hits always destroy a barricade; **2 melee hits make a window barricade vaultable**. | WIKI (Barricade, Grappling Hook pages) |
| How vaultability is decided | Contextual prompt on authored geometry. Many patch notes add or remove "vault prompts" on specific props, so vaultability is effectively tagged per object. **Recommendation: tag vaultable volumes in map data.** | OFFICIAL (inferred from patch notes) |
| Height limits | PLACEHOLDER: vault-over ≤ 1.1 m; climb-onto ≤ 1.35 m | UNVERIFIED |
| Vault duration | PLACEHOLDER 0.6–0.9 s depending on height | UNVERIFIED |
| Shields | ADS is cancelled during a vault (Y10S2). Shield operators **cannot dash through undamaged barricades** (Y11S1). | OFFICIAL |
| Electrified surfaces | Vaulting an electrified object slows you | OFFICIAL (Y10S2) |
| Landing | Consistent landing spot after vaulting a door barricade (Y10S2.0 fix) | OFFICIAL |

---

## 6. Rappel (attackers only; the "Grappling Hook")

### 6.1 Base rules
| Rule | Value | Status |
|---|---|---|
| Who | Attackers. Defenders have no rappel. | WIKI |
| Start | **Hold** interact at an exterior vertical surface; the hook goes to the highest ledge above you. A **vertical foothold is needed to start** but not to keep moving. Also starts from roof ledges/railings (you begin **upside-down**), from windows that lead outside, and from ledges looking into the building. Y11S3 added a circular hold gauge to "Enter rappel". | WIKI + OFFICIAL (Y11S3) |
| Enter/exit speed | Made faster, with new animations, in Y9S1 | OFFICIAL |
| Hold time to start | PLACEHOLDER 0.5 s | UNVERIFIED |
| Movement | Vertical and horizontal along the wall, limited by ledge width and blocked by pillars. You can pass another attacker's rope but bodies cannot pass through each other. | WIKI |
| Stance toggle | Switch between right-side-up and **inverted** (upside-down) | WIKI |
| Allowed while rappelling | Aim, shoot, reload, lean (also inverted), throw grenades, use unique and secondary gadgets and observation tools (drones) | OFFICIAL (Behind The Wall) + WIKI |
| Not allowed | Shields are auto-unequipped; they come back when you exit if you had one out (Osa is special: she can deploy her shield right-side-up only). No **Claymore**. | WIKI |
| Exit | Step off at ground level, "rapid descend" to the ground, climb onto a ledge or roof, or swing into an open window or floor opening (takes "a few seconds") | WIKI |
| Death while rappelling | Lethal damage while rappelling **kills outright** (no DBNO) | WIKI (DBNO page) |
| Blackbeard | Cannot ADS while rappelling into windows, and cannot break undamaged barricades while rappelling (Y10S3) | OFFICIAL (context) |
| Speeds (climb, descend, strafe, horizontal sprint) | PLACEHOLDER: climb 1.5 m/s, descend 2.5 m/s, strafe 1.2 m/s, horizontal sprint 2.5 m/s | UNVERIFIED |

### 6.2 Siege X "Advanced Rappel" (Y10S2, June 2025) — still live
- New motion capture. You can **sprint horizontally** on the wall and **climb faster** (OFFICIAL showcase/season page: "sprint along walls and hop around corners").
- **Around corners:** you can move between **different wall faces of the same building** if the grapple points are at the **same height**. A height difference (building shape, protruding sills, metal barriers) means you must return to the ground or roof and start a new rappel (WIKI). There is a "corner turn prompt" (OFFICIAL, Y11S2.1 bug fix).
- **Rappel Breach** (Y10S2): a Breach Charge is **no longer required**. You swing into the barricade. If it is "sufficiently damaged by the end of the interaction" you go through. Otherwise you **bounce back and damage the barricade with your feet**. You can pre-damage it with a Sledgehammer, shotgun, explosives or a breach charge. (OFFICIAL, Y10S2 Designer's Notes)
- **Glass:** UNVERIFIED how window glass is handled on entry. It presumably shatters on swing-in; Siege windows are usually glass + barricade (see `destruction.md`).
- **Inverted limits:** you can shoot, lean and throw while inverted. Whether you can enter a window or breach while inverted is UNVERIFIED.

---

## 7. Ladders
| Rule | Value | Status |
|---|---|---|
| Existence | Climbable ladders exist on some maps (e.g., Presidential Plane, "exterior ladder" references). Patch notes mention climbing up and **sliding down** ladders. | WIKI (patch-note bug fixes) |
| Oregon | The Fandom Oregon page says the large tower has "ladder stairs that lead to the highest point on the map". It is unclear whether that is a climbable ladder or steep stairs. **The Oregon agent and Ulo must confirm.** | WIKI, UNVERIFIED |
| Can be downed while climbing | Yes (bug-fix context) | WIKI |
| Shooting on a ladder | UNVERIFIED (assume weapon is holstered) | UNVERIFIED |
| Iana hologram | Cannot climb ladders | WIKI (context) |
| Climb / slide speeds | PLACEHOLDER: climb 1.5 m/s, slide 4 m/s | UNVERIFIED |

---

## 8. Fall damage
| Rule | Value | Status |
|---|---|---|
| Exists | Yes. It is lethal from great heights (Finka can Adrenal-Surge "before falling to her death"; Nomad fall damage was fixed in Y5S3.2). Not reduced by HEALTH rating. | WIKI/COMMUNITY |
| Height → damage curve | PLACEHOLDER: no damage < 3 m; linear from 3 m to death at ~6 m | UNVERIFIED. A Dec 2015 Steam thread claims "you instantly die on a 4m fall", which is old and unreliable. |
| DBNO from falling | A Y10S2 bug fix says "Player enters DBNO after falling to the ground" was a bug. Interpretation: lethal falls kill outright (no DBNO). | OFFICIAL text; interpretation UNVERIFIED |

---

## 9. Damage zones, headshots and limbs

### 9.1 Current multipliers (bullets)
| Zone | Multiplier | Status / history |
|---|---|---|
| Head **and neck** | **Instant kill** for bullets (neck has counted as head since Y1S4, Nov 2016). Old table value: ×50. Rook plates do **not** protect the head. | OFFICIAL (Red Crow notes via WIKI); PC Gamer table |
| Torso | ×1.0 | OFFICIAL/WIKI |
| **Limbs = arms + hands + legs** | **×0.75, all weapon classes** (current) | Y4S4 Shifting Tides made arms/hands limbs (0.75, or 0.65 on 3-armor back then). Y10S2 (Siege X) cut limb damage to 50–70 % by class/caliber. **Y10S4.1 (Dec 2025) reverted to pre-Siege X values**, which the Y10S2 notes give as "75%". |

Source conflict: Fandom's Armor and Speed page says arms count as Body. That was true only between Y1S4 and Y4S4. The Y10S2 Designer's Notes talk about "shots to the arms or legs" as limbs. **Chosen: arms are limbs (0.75).**

Siege X limb values (Y10S2–Y10S4.0 only, **not live**; kept for history): handguns small/medium 50 %, high 60 %; revolvers 60 %; machine pistols 50 %; SMG 50/60/65 % (small/medium/high caliber); AR 50/60/65 %; LMG, DMR, sniper and slug shotgun 70 %.

### 9.2 Headshot exceptions
| Case | Rule | Status |
|---|---|---|
| Buckshot shotguns (pellets) | **No instant-kill headshot.** Pellet head multiplier was cut to ×1.0 (from ×1.5) in Y1S4. | OFFICIAL (Red Crow notes via WIKI); last confirmed 2016, current state UNVERIFIED-lite |
| Slug shotguns (BOSG.12.2, TCSG12, ACS12…) | Headshots enabled (treated like bullets) | WIKI |
| Caveira's Luison | Always DBNO, even on a headshot (context) | WIKI |
| Headshots on DBNO / Rook-plated targets | Still lethal | OFFICIAL (Rook page) |

### 9.3 Limb penetration (since Y4S4 Shifting Tides)
- A bullet passing through a limb into the torso or head counts **only the highest-value zone** it hits. Damage does not stack.
- **Lower-back rule:** if a bullet crosses two of {chest, neck, head}, only the first is counted. So torso shots never "travel up" into headshots.
- Per class: **Full** penetration (DMRs, snipers, and per Fandom the DP27) continues through bodies; **each extra body takes 70 %**. **Simple** (ARs, LMGs, SMGs, pistols, revolvers, slug shotguns) passes through limbs of one target. **None** (buckshot shotguns, machine pistols). The Glaive-12 is a slug with limb penetration since the Y10S3.1 fix.
- Status: OFFICIAL design via PC Gamer (2019) and WIKI. Per-weapon class belongs in `weapons.csv`.

---

## 10. DBNO (Down But Not Out)

### 10.1 Entering DBNO vs dying outright
| Situation | Result | Status |
|---|---|---|
| HP reaches 0 from body/limb bullets, first time this round | **DBNO** | WIKI |
| Headshot (incl. neck) | **Dead** (even with a Rook plate) | OFFICIAL/WIKI |
| Lethal **explosive** damage (frag, C4, claymore, breach charge…) | **Dead**, unless wearing a Rook plate | OFFICIAL (Rook page: plates make "even grenades or claymores" leave you DBNO) |
| Lethal damage **while rappelling** | **Dead** | WIKI |
| Already downed once this round | **Dead** ("each Operator can only be downed once in a round") | WIKI |
| Melee (knife) on a standing enemy | Usually **dead**: melee "overrides" DBNO. Exceptions: **shield bash** only downs (since Y4S2.3), and Caveira's Silent Step punch only downs. | WIKI |
| Overkill threshold | PLACEHOLDER rule: if the lethal hit exceeds remaining HP by **more than 20** → dead. This is a pre-Crystal Guard community rule ("120 total" on 100 HP) assumed to carry over. | UNVERIFIED |
| Last living team member goes down | **Dies instantly, round over.** Exceptions: they can self-revive (Doc/Finka/Rook plate); an attacker on Bomb with the defuser planted; inside the objective on Secure Area. | WIKI |
| Fire / gas (Noor's flames, gas pipes) at 0 HP | UNVERIFIED (Rook's page says plates do not protect against fire, gas or poison) | UNVERIFIED |

### 10.2 Downed state
| Parameter | Value | Status |
|---|---|---|
| DBNO HP pool | **20 HP.** "After being downed, the Operator can only take 20 more Hit Points of damage before dying." | WIKI |
| Bleed model (current) | **Y10S4 rework:** "Players now start in slow bleeding, and will only speed up if the player is moving." The old "hold interact to halve bleed rate" button is gone. | OFFICIAL (Tenfold Pursuit) |
| Bleed-out time | PLACEHOLDER: 60 s when still (slow bleed), 30 s equivalent when crawling (fast bleed). Fandom's Rook page says a plate "doubles the Bleedout timer, for a maximum of 120 seconds", which implies a 60 s base maximum. | UNVERIFIED |
| Bleed rate differs by HEALTH rating? | No, the same for all | WIKI |
| Brief invulnerability on going down | Exists (Y1S4 fix: "Invulnerable state after an Operator is DBNO is too long"). Duration UNVERIFIED; PLACEHOLDER 0.3 s. | WIKI (patch) / UNVERIFIED |
| Crawl speed | PLACEHOLDER 0.5 m/s. **Leaves a blood trail.** | UNVERIFIED (speed); WIKI (trail) |
| Allowed actions | Crawl, **manual ping**, look around. Vision is darkened/blurred. No weapons, gadgets or cameras. Exceptions: Doc self-stim; Finka Adrenal Surge self-revive; Ela's mines. | WIKI |
| Revive by teammate | Interact on the downed ally. **4.0 s**; the bleed timer **pauses** during the revive. The reviver needs to be adjacent (range UNVERIFIED). | WIKI (Doc page: "2.75 s vs. 4.00 s") |
| HP after a normal revive | **20 HP** (PvP; since Y4S1) | WIKI + COMMUNITY |
| Doc Stim revive (context) | 2.75 s at range; full heal. Doc can self-revive while holding the Stim. | WIKI |
| Finka revive (context) | 2.75 s at any range; 30 HP once the boost wears off; can self-revive | WIKI |
| Rook plate (context) | Guarantees DBNO (not on headshots); self-revive "Withstand" (TS report: to 20 HP); +25 max HP | OFFICIAL/WIKI |
| Who can revive | Teammates only (plus the gadget exceptions above). Not possible while Caveira is interrogating the target. | WIKI |
| Finishing | Deal the remaining ≤20 DBNO HP with any damage, melee (always lethal on a downed target), a headshot, or Caveira's interrogation. The player who downed gets the **kill credit** when the target dies; the finisher gets an assist (since CG). | WIKI/COMMUNITY (CG) |
| Lesion interaction | DBNO players still **trigger** Gu mines but get **no effect** (old patch, Fandom "Patch 5.1.0"). The operator agent should re-verify. | WIKI |

---

## 11. Friendly fire (FF) and Reverse Friendly Fire (RFF)

| Context | Behavior | Status |
|---|---|---|
| Action Phase, PvP Bomb playlists (Ranked, Unranked, Quick Match) | **Team damage ON**, governed by RFF | OFFICIAL (implied by the Y11S3 change below; RFF blogs) |
| **Preparation Phase** | **Team damage OFF** since Y7S4 Solar Raid | OFFICIAL |
| Custom Game | "Friendly Fire" toggle, plus a separate "**Friendly Fire in Prep Phase**" setting | OFFICIAL (Solar Raid) + WIKI |
| **New in Y11S3** | "Players below **clearance level 10** will deal **reduced damage** to their teammates." Exact % UNVERIFIED. | OFFICIAL (Split Fire) |
| RFF trigger | Accumulated friendly damage, or a teamkill the victim confirms as intentional. If the victim does nothing, a warning is issued by default. | OFFICIAL (Y4S1 dev blog) + WIKI |
| Under RFF | You no longer hurt teammates. Bullet damage aimed at teammates is **reflected onto you**. Gadget damage is reflected onto the gadget (Twitch/Mozzie drones, Maestro cam). Explosions are handled per case in the 2019 blog. | OFFICIAL (Y4S1 dev blog; old, gadget details may be outdated) |
| RFF penalty | After a warning, if you keep doing it, RFF is enabled for your **next 30 matches** (Reputation penalty). The grace period ended ~Y7S3. | COMMUNITY (PCGamesN quoting Ubisoft) |
| Siege X (Y10S2) | **No Siege X-specific FF/RFF change found** in the Y10S2 notes, season page or roadmap. The brief's premise could not be confirmed. | OFFICIAL (absence) |
| Deathmatch / 3v3 Arcade / bot playlists | UNVERIFIED | UNVERIFIED |

Recommendation for REDMOND: data-driven flags `ff_action_phase`, `ff_prep_phase`, `ff_scale`, `rff_enabled`, `rff_threshold_hp` (placeholder 100 friendly HP) for each playlist preset.

---

## 12. Melee

| Rule | Value | Status |
|---|---|---|
| Weapon | Combat **knife** (a punch for Caveira in Silent Step; shield operators bash). PLAN §7 calls it a "punch"; Siege's default is a knife. | WIKI |
| Vs standing enemy | Lethal: overrides DBNO. Exact HP value UNVERIFIED (treat as ≥ 125 + 20). | WIKI |
| Vs downed enemy | Lethal | WIKI |
| Shield bash | Downs only (no kill) since Y4S2.3. Staggers or "guard breaks" shield users. Sledge's hammer knocks shield users down (Y10S2). | WIKI/OFFICIAL |
| Barricades | 3 hits destroy; 2 hits make a window barricade vaultable. Castle panel needs 10 hits (Y11S3.1). | WIKI/OFFICIAL |
| Soft walls | Each hit makes a **round** hole ("melee attacks always create a round hole"). Size belongs in `destruction.md`. | WIKI |
| Gadgets | Destroys most gadgets (barbed wire, etc.) | OFFICIAL (Rank Up transcript) |
| Cooldown / reach | PLACEHOLDER: 0.6 s recovery, 1.5 m reach | UNVERIFIED |
| Rappel swing-in | Can kill a defender standing behind the window (logged as melee). Wiki trivia, possibly a bug. | WIKI |

---

## 13. Noise, footsteps and audio

| Rule | Value | Status |
|---|---|---|
| Everything makes sound | "Everything in Siege makes sound… punching a barricade, using a gadget, reloading… even walking". Different actions have different loudness. | OFFICIAL (Rank Up transcript) |
| Stances | "Footsteps, whether **crouched or running**, can be heard." **Prone can be loud.** | OFFICIAL (Rank Up transcripts) |
| Relative loudness | PLACEHOLDER ranking: sprint > walk > crouch-walk ≈ slow walk > prone crawl (going prone is itself noisy) | UNVERIFIED (PLAN's "crouch quieter" is plausible but not quantified by Ubisoft) |
| Audible ranges | PLACEHOLDER audible radius (open space, same floor): sprint 25 m, walk 15 m, crouch 8 m, slow walk 6 m, prone crawl 6 m. Floors and walls attenuate. | UNVERIFIED |
| Propagation | Sound travels further in large spaces (e.g., a courtyard) than small ones (a bathroom). It is affected by hatches and by holes in walls, floors and ceilings. | OFFICIAL (Rank Up transcript) |
| **Siege X audio overhaul (Y10S2)** | "Complete rework of audio **propagation and reverberation**" so players can pinpoint "where and how far something could be". No numeric parameters published. | OFFICIAL |
| Surface/material footsteps | Assumed; no official numbers | UNVERIFIED |
| Related audio intel | Metal detectors (Siege X ingredient) make a loud noise when passed through. Barricade destruction makes a distinct noise. | OFFICIAL/WIKI |
| Operator stealth kits (context) | Caveira Silent Step, Nøkk HEL, etc. modify footsteps | WIKI |

---

## 14. ADS, sprint-to-fire, hip fire, recoil, reload

| Topic | Rule | Status |
|---|---|---|
| ADS time | Per weapon (see `weapons.csv`), with **two values**: from idle/walk, and from **sprint** (longer). Example from 2016: Blackbeard ADS 0.7 s, ADS-from-sprint 0.8 s. **Y9S1** raised ADS times for all weapons and raised sprint→ADS proportionally. ADS "transition accuracy" follows **one of 3 curves** between hip and full ADS. | OFFICIAL |
| ADS modifiers | Laser under-barrel: **+10 % ADS speed** (Y9S1). The Angled grip lost its ADS bonus in Y9S1. | OFFICIAL |
| ADS exit | There is a separate "time to cancel ADS" (Blackbeard 0.9 s since Y10S3) | OFFICIAL (context) |
| ADS cancelled by | Long drops (Siege X), vaults for shields, gadget swaps (inferred from the V-Lance exemption) | OFFICIAL |
| ADS movement speed | Same for all operators (see §2) | OFFICIAL |
| **Sprint-to-fire** | You cannot fire while sprinting. Firing or ADS from a sprint first plays the sprint-exit. Going prone to skip the sprint animation and "shoot immediately" was a bug fixed in Y11S2.1. Generic delay PLACEHOLDER 0.25 s for hip fire; ADS-from-sprint per weapon. | Rules OFFICIAL; number UNVERIFIED |
| Hip-fire spread | Same in all stances (Y7S4). Cleaned up in Y9S1 so "all weapon classes follow the same rules". Per-weapon value exists (e.g., CSRX 300 hip spread 0.4 from 0.3455, units unknown). Growth from movement or firing is UNVERIFIED. | OFFICIAL / UNVERIFIED |
| Crosshair | Dynamic hip-fire crosshair assumed; options UNVERIFIED | UNVERIFIED |
| Recoil model | Per weapon, **separate PC vs console tuning** (since Y8S3) and M&K vs controller values. Built from a "First Shot Multiplier", "Camera Up Speed", vertical and horizontal components, and **stages keyed to bullet index** (e.g., Reaper MK2 stages at bullets 0, 3, 10, 25). Grips and barrels modify it (Vertical grip +20 % recoil control). | OFFICIAL |
| Reload | Tactical vs empty reloads (per weapon). **Since Y8S1 "immersive reload":** once the magazine is out, interrupting leaves you **without a magazine**. **Closed-bolt** weapons keep **one chambered round** you can fire at any point during the reload. Angled grip: **+20 % reload speed** (Y9S1). Sprinting interrupts reloads. | OFFICIAL (sprint-interrupt: WIKI patch context) |
| Ammo reserve | Tracked in **rounds**, not magazines (patch notes give "max ammo: 111 bullets") | OFFICIAL |
| Weapon swap time | PLACEHOLDER 0.6 s primary↔secondary | UNVERIFIED |
| Damage falloff | Per class/weapon (weapons agent). Y9S1 "damage falloff normalization"; bullet travel distance normalized. | OFFICIAL |
| Shields (Fuze option) | No hip fire. Can sprint with the shield (Y9S1). Free look. Slightly exposed when throwing (Y10S3). Can't ADS while vaulting or dropping (Y10S2). Can't dash through undamaged barricades (Y11S1). | OFFICIAL |

---

## 15. Other systems a faithful recreation needs
| System | Rule | Status |
|---|---|---|
| First-person shadows | Your own shadow is rendered and can give away your position (Siege X) | OFFICIAL |
| Enemy outline system | Siege X added outlines on enemies in line of sight, emphasizing noise over visibility. Whether it is still live in Y11S3 is UNVERIFIED (a Y10S4.1 fix mentions "enemy outlines"). | OFFICIAL / UNVERIFIED current |
| Threat & hit indicators | 3D directional threat indicator plus a distinct hit indicator (Y10S3) | OFFICIAL |
| Free look | Look without turning the body. Shield operators have it (Y9S1); Clash since Y10S2. General availability UNVERIFIED. | OFFICIAL |
| Hold interactions with gauges | Enter rappel, drop defuser, release hostage and pick up gadgets show a circular hold gauge (Y11S3) | OFFICIAL |
| Trajectory preview | Optional throwable trajectory preview (Y9S1) | OFFICIAL |
| Mini-map | In Quick Match and training playlists (Y11S3); can be hidden | OFFICIAL |
| Defender detection outside | See `round_flow.md` | — |

---

## 16. Proposed data defaults (for `data/core_mechanics.json`; every UNVERIFIED value is a placeholder)
```
health_by_rating:        {1: 100, 2: 110, 3: 125}                  # OFFICIAL
rook_plate_bonus_hp:     25                                         # OFFICIAL (Y11S1.1)
sprint_mps_by_speed:     {1: 4.25, 2: 4.75, 3: 5.00}                # COMMUNITY 2024, UNVERIFIED
walk_mps_by_speed:       {1: 2.85, 2: 3.00, 3: 3.10}                # COMMUNITY 2024, UNVERIFIED
crouch_walk_factor:      0.55                                       # PLACEHOLDER
prone_mps:               0.70                                       # PLACEHOLDER
ads_walk_mps_all:        1.90                                       # rule OFFICIAL, value PLACEHOLDER
mods: {horizontal_grip: 1.05, lmg: 0.90, shield: 0.90}              # grip/LMG OFFICIAL; shield WIKI
zone_mult: {head: "kill", neck: "kill", torso: 1.0, arm: 0.75, hand: 0.75, leg: 0.75}  # OFFICIAL/WIKI
buckshot_head_mult:      1.0                                        # OFFICIAL 2016
multi_body_penetration:  0.70                                       # OFFICIAL 2019
dbno_hp:                 20                                         # WIKI
dbno_overkill_rule:      "lethal hit > remaining_hp + 20 => death"  # UNVERIFIED
dbno_bleed_still_s:      60   ;  dbno_bleed_moving_s: 30            # PLACEHOLDER
revive_time_s:           4.0  ;  revived_hp: 20                     # WIKI
downs_per_round:         1                                          # WIKI
ff: {prep_phase: false, action_phase: true, low_cl_scale: "UNVERIFIED"}  # OFFICIAL
lean: {roll_deg: 15, offset_m: 0.30, time_s: 0.15, stances: [stand, crouch, prone]}  # PLACEHOLDER / prone UNVERIFIED
stance_eye_m: {stand: 1.65, crouch: 1.15, prone: 0.35}              # PLACEHOLDER
```

---

## Open questions
Most of these can be answered in a Custom Game (Local), usually in minutes, with a stopwatch or a 60 fps recording and known map distances.

1. **Speeds**: time a 1-, 2- and 3-speed operator over the same measured distance for sprint, normal walk, slow walk (Alt), crouch-walk, prone crawl and ADS-walk. Which community dataset (2019 vs 2024) is right? Does holding a pistol still add speed? *(UNVERIFIED)*
2. **Stance heights and transition times**: in third person (spectate a teammate), how tall are stand, crouch and prone relative to a door frame (~2.0–2.1 m)? How long do crouch→prone and prone→stand take? *(UNVERIFIED)*
3. **Prone**: can you lean while prone in the current build? Is there a turn-speed or aim-arc limit while prone? *(UNVERIFIED)*
4. **Lean**: does pressing sprint cancel a lean (or vice versa)? Roughly how far does your head move? Which settings exist today: Toggle Lean, Toggle Crouch, Toggle Prone, Toggle ADS? *(UNVERIFIED)*
5. **Vault**: what is the highest object you can vault onto (e.g., a kitchen counter vs a fridge)? How long does a vault take? *(UNVERIFIED)*
6. **Rappel**: how long must you hold to start a rappel? Can you enter a window or rappel-breach while **inverted**? Does window glass break on swing-in automatically? Rough climb, descend and horizontal-sprint speeds? *(UNVERIFIED)*
7. **Ladders**: is Oregon's Big Tower access a real climbable ladder or steep "ladder stairs"? Can you shoot or ADS on a ladder? *(UNVERIFIED)*
8. **Fall damage**: from which heights do you take damage or die (e.g., dropping from Oregon's roof or a 2F window)? Does a lethal fall ever DBNO? *(UNVERIFIED)*
9. **DBNO**: how long do you last when downed and still, and when crawling (post-Y10S4 rework)? Crawl speed? Does the overkill rule (more than 20 past remaining HP = death) still apply? Do fire/gas deaths DBNO? *(UNVERIFIED)*
10. **Friendly fire**: how much reduced is team damage for players under Clearance Level 10? Is FF on in Team Deathmatch, 3v3 Arcade and bot playlists? *(UNVERIFIED)*
11. **Melee**: recovery time between knife swings, and is a knife hit always a kill on a full-HP heavy operator? *(UNVERIFIED)*
12. **Audio**: rough distance at which you hear a sprinting / walking / crouching enemy on the same floor and through a floor. Is crouch-walk actually quieter than walk in Siege X? *(UNVERIFIED)*
13. **Sprint-to-fire and weapon swap**: rough delay from sprint to first hip-fire shot, and primary↔secondary swap time. Is there a hip-fire crosshair option? *(UNVERIFIED)*
14. **Enemy outlines** (Siege X Y10S2 feature): still visible in Y11S3? *(UNVERIFIED)*
15. **Buckshot headshots**: still not an automatic kill in Y11S3 (last official statement 2016)? *(UNVERIFIED-lite)*
16. **Passive regen**: confirm there is none. *(UNVERIFIED-lite)*

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes — Siege X limb multipliers by class, rappel breach rework, shield vault ADS cancel, electricity slow
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/daybreak — Advanced Rappel, audio overhaul, momentum/drops/vault buffering, first-person shadows, outline system
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/ixjnXu9g80eFVW3X7cNFF/y10s20-patch-notes-addendum — vault landing fix, "DBNO after falling" bug fix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/roadmap — Year 10/11 feature list (Advanced Rappel, audio, Momentum, Options/Press & Hold overhaul Y11S1, Downed Operator Update Y10S4, Testing Grounds Speed & Armor)
- https://news.ubisoft.com/en-us/article/55e9bGaVCdO52trbclOhpf/rainbow-six-siege-x-showcase-everything-you-need-to-know — rappel sprint/corners, audio propagation/reverb rework
- https://news.ubisoft.com/en-us/article/t63XgnGFUidxcAZQiPqoe/rainbow-six-siege-x-and-operation-daybreak-year-10-roadmap-reveal-details — shields no ADS when vaulting/dropping, limb change announced
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/highstakes — Echo 2-speed, Blackbeard rappel/ADS-cancel 0.9 s, shield exposure on throw, 3D threat indicators
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/tenfoldpursuit — DBNO slow-bleed rework, Testing Grounds Health/Speed experiment, Ace 1S/3H, input layouts
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/3aYq6D0VHo1HJ5ZNfLtiNs/y10s41-patch-notes — limb damage reverted to pre-Siege X; crouch-through-barricade and arm-hit fixes
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/silenthunt — Skopós 3S/1H, shields can't dash undamaged barricades
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5fWCjoCU8toUJiBdMSj0UA/y11s1-designers-notes — Skopós rating change confirmation
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/systemoverride — Zofia 2/2, Gridlock limp, ping QoL
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/splitfire — FF reduced for players under CL10, Options menu redesign, hold gauges (enter rappel), V-Lance ADS/lean exemption, CSRX hip spread
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes — latest patch (Castle panel 10 melee hits, Sledge swing 0.8 s)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/6HzsdnbOYovXelORy4mB7z/y11s3-patch-notes-addendum — checked for mechanics changes (none core)
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/seasons/solarraid — FF off in Prep Phase + custom setting; uniform ADS speed; same hip-fire spread in all stances
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/deadlyomen — ADS time increase, 3 ADS accuracy curves, grips (+5 % speed, +20 % reload), laser +10 % ADS, LMG −10 % speed, shields sprint/free look, faster rappel enter/exit
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/commandingforce — immersive reload rules (no-mag interruption, closed-bolt chambered round)
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/5QCcoKCEsC2R47HYn98qrf/dev-blog-reverse-friendly-fire-update — RFF activation and gadget behavior (Y4S1)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/4MERFPCTtVYWfVgtrZX6iu/behind-the-wall-series-cover-and-lean — free lean in any stance/while ADS, lean prone, act while rappelling/inverted (2015 design article)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1N1qEcXvlvPG8z6EIa2MXx/r6-shieldguard-antitoxicity-y10s1-update — Reputation impacts context (team-kill stats)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/<brava|fuze|thermite|striker|dokkaebi|sledge|sentry|skopos|mira|lesion|pulse|mute|rook|doc> — official HEALTH/Speed stars; Rook plate rules (DBNO guarantee, explosives)
- https://rainbowsix.fandom.com/wiki/Armor_and_Speed — rating terminology, 100/110/125, fall damage not armor-affected, speed %, shield speeds (partly outdated: arms=body, Sledge/Mute heavy, Rook +20)
- https://rainbowsix.fandom.com/wiki/DBNO — DBNO rules, 20 DBNO HP, 20 HP revive, once per round, last-player rule, exceptions
- https://rainbowsix.fandom.com/wiki/Grappling_Hook — rappel rules and Y10S2 Advanced Rappel corner rules
- https://rainbowsix.fandom.com/wiki/Reverse_Friendly_Fire — RFF overview
- https://rainbowsix.fandom.com/wiki/Doc_(Siege) — revive 4.00 s vs Stim 2.75 s, overheal cap
- https://rainbowsix.fandom.com/wiki/Rook_(Siege) — plate bleed-out doubling (max 120 s), self-revive
- https://rainbowsix.fandom.com/wiki/Finka — Adrenal Surge revive 2.75 s, 30 HP, self-revive
- https://rainbowsix.fandom.com/wiki/Barricade — 3 melee to destroy, 2 to make vaultable, vault/rappel through damaged barricades
- https://rainbowsix.fandom.com/wiki/Destruction — melee makes round holes
- https://rainbowsix.fandom.com/wiki/Caveira — knife melee; Silent Step melee only downs
- https://rainbowsix.fandom.com/wiki/Oregon — "ladder stairs" in the large tower
- https://rainbowsix.fandom.com/wiki/Iana — hologram can't climb ladders
- https://rainbowsix.fandom.com/wiki/BOSG.12.2 , https://rainbowsix.fandom.com/wiki/TCSG12 , https://rainbowsix.fandom.com/wiki/Glaive-12 , https://rainbowsix.fandom.com/wiki/DP27 — slug headshots, limb penetration notes
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_5.0 — Red Crow: arms 1.0×, neck = head, shotgun head multiplier 1.5→1.0
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_5.2 — ADS vs ADS-from-sprint example, sprint interrupts reload
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_4.1.0 — crouch/lean spam fix
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_4.2.3 — shield melee only downs; RFF/DBNO interplay
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_4.3.0 , https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_3.2 , https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_3.4.0 — ladder climb/slide bug fixes (ladders exist)
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_5.1.0 — DBNO immune to Gu mine effect
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.1.1 — Rook plate +25 HP; prone-speed fix
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.1.2 — Kóna 3 HP/s
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.2.1 — prone-cancels-sprint-to-shoot fix; corner-turn prompt
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.2.2 — Jäger 3S/1H; recoil stage wording
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.2.3 — recoil stages by bullet index
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.3.0 — Y11S3 balance list (CSRX first-shot multiplier, hip spread)
- https://rainbowsix.fandom.com/wiki/Rank_Up_Intermediate_Series:_Mastering_Movement — official Ubisoft Gameplan transcript: sound propagation, lean/crouch/prone/melee usage
- https://rainbowsix.fandom.com/wiki/Rank_Up_Beginner_Series:_Intro_to_Pacing — footsteps crouched or running are audible
- https://www.pcgamer.com/ubisoft-is-making-major-changes-to-how-damage-is-dealt-in-rainbow-six-siege/ — Shifting Tides limb penetration, arm multipliers, 70 % multi-body, lower-back rule
- https://siege.gg/news/y10s41-patch-notes-limb-damage-to-be-reverted-to-how-it-was-before-siege-x-and-more — limb revert coverage (arms and legs)
- https://siege.gg/news/operation-solar-raid-reveals-new-anti-cheat-feature-more-on-reputation-system-and-friendly-fire — Prep Phase FF removal coverage
- https://siege.gg/news/rook-armor-gives-team-ability-to-self-revive-in-test-server — Rook plate self-revive to 20 HP (TS report)
- https://www.pcgamesn.com/rainbow-six-siege/reverse-friendly-fire-reputation-penalty-grace-period — RFF penalty for 30 matches after warning
- https://www.dexerto.com/rainbow-six/r6-operation-crystal-guard-y6s3-patch-notes-1633586/ — armor→HP conversion 100/110/125
- https://steamcommunity.com/sharedfiles/filedetails/?id=3200464877 — speed dataset B (2024)
- https://steamcommunity.com/app/359550/discussions/0/3158630999990844526/ — speed dataset A (2019)
- https://steamcommunity.com/sharedfiles/filedetails/?id=2559580676 — default controls (slow walk key, Space = vault, no operator jump)
- https://steamcommunity.com/app/359550/discussions/0/494632506571178776/ — "4 m fall" claim (2015, unreliable)
- https://steamcommunity.com/app/359550/discussions/0/3247562523086929280/ — revive HP 50→20 change (Y4S1)
- https://steamcommunity.com/app/359550/discussions/0/1486613649680661947/ — pre-CG DBNO overkill rule (100 HP + 20 buffer)
- https://www.player.one/rainbow-six-siege-y5s32-shadow-legacy-patch-notes-nomad-fall-damage-fix-137035 — fall damage exists (Nomad fix)
- https://1v9.gg/blog/rainbow-six-siege-r6-how-to-hip-lean — hip lean on PC vs controller
- https://keymap.io/controls/rainbow-six-siege/ — hold/toggle option list, default binds (low reliability; used only where flagged)
