# Sledge — operator research
Verified against: Y11S3 (Operation Split Fire, incl. Y11S3.1 patch of 2026-09-22) — researched 2026-09-29
Confidence: high for loadout, ratings, Siege X shield knockback, Reaper MK2 addition, SMG-11 removal and the Y11S3.1 swing time (all official). Medium for the hammer charge count (25; Fandom + Liquipedia + guides, never stated as a number by Ubisoft). Low for how many charges each action consumes and for hole dimensions (sources conflict, or give no numbers).

> **Correction to PLAN.md §11.1 baseline:** secondaries are now **P226 Mk 25 or Reaper MK2**. The Reaper was added in Y10S3 (2025-09-02). Secondary gadgets are **Frag, Stun, or Impact EMP** (Impact EMP added in Y7S3). The SMG-11 removal in Y6S3 is confirmed by Ubisoft.
> **New since the plan was written:** Y11S3.1 (2026-09-22) cut the hammer swing time to **0.8 s (from 1 s)**.

---

## 1. Identity and base stats

| Field | Value | Source |
|---|---|---|
| Side | Attacker | Ubisoft operator page |
| Real name | Seamus Cowden | Ubisoft operator page |
| CTU | SAS | Ubisoft operator page |
| Squad | Redhammer | Ubisoft operator page |
| Specialties (official) | BREACH, ANTI-GADGET | Ubisoft operator page |
| Health rating | **2** | Ubisoft operator page (2 of 3 stars active) |
| Speed rating | **2** | Ubisoft operator page |
| Difficulty | 1 of 3 | Ubisoft operator page |
| Introduced | Launch roster (2015) | Liquipedia |

## 2. Loadout (current, from the official operator page)

### Primary weapons
| Weapon | Class | Recent changes |
|---|---|---|
| L85A2 | Assault Rifle | none Y10S2–Y11S3.1 |
| M590A1 | Shotgun (pump) | none Y10S2–Y11S3.1 |

### Secondary weapons
| Weapon | Class | Recent changes |
|---|---|---|
| P226 Mk 25 | Handgun | none |
| Reaper MK2 | Machine Pistol | **Added to Sledge in Y10S3** (same season: recoil buff — less first-shot kick, softer lateral recoil in early stages). **Y11S2.3:** recoil stages start later in the burst: bullets 0, 3, 10, 25 (was 0, 3, 7, 13) |
| ~~SMG-11~~ | — | **Removed Y6S3** (2021-09-07) to reduce his versatility |

Full weapon stats are in `research/weapons.csv`.

### Secondary gadgets
| Gadget | Count | Source |
|---|---|---|
| Frag Grenade | 2 | Ubisoft page (option); Fandom (count) |
| Stun Grenade | 2 | Ubisoft page; Fandom |
| Impact EMP Grenade | 2 | Ubisoft page; Fandom. Radius **2.0 m** since Y11S2.3 (was 1.8 m) |

## 3. Unique ability: Tactical Breaching Hammer "The Caber"

Official description: *"Sledge is capable of breaching non-reinforced surfaces thanks to his tactical breaching hammer: The Caber."*

### 3.1 Numbers and rules
| Parameter | Value | Source / status |
|---|---|---|
| Uses per round | **25 charges**, shown as a bar above the gadget icon. Ubisoft only says "you don't have endless swings" | Fandom Sledge + Breaching Hammer; Liquipedia ("Charges 25"); Steam/r6siegecenter guides. Number not officially stated |
| Charge cost per action | **CONFLICT — UNVERIFIED.** Fandom Sledge page: every breach or hit costs 1 (walls, barricades, floors, props). Fandom Breaching Hammer page: **wall = 2**, barricade / floor / anything else = 1, **killing a player = 2** | Fandom (two pages disagree) |
| Swing time | **0.8 s** since Y11S3.1 (was 1.0 s) | Y11S3.1 patch notes (official) |
| Unequip delay after a swing | about 0.5 s during which he's exposed | Fandom (UNVERIFIED) |
| Effective reach | About **1 m** from the surface to break **both** faces of a wall or floor. Further away, only the near face breaks and a second swing is needed | Fandom (UNVERIFIED value) |
| Hole from 1 swing | Always big enough to get through (crouch/vault). Shape is **rectangular** | Ubisoft Gameplay Tip "SMALL BREACHES"; Fandom (shape); r6siegecenter ("big enough to vault or crouch walk") |
| Hole from 2 swings | Two combined swings make a hole shield teammates can **walk through standing** | Ubisoft Gameplay Tip |
| Exact hole dimensions (m) | **UNVERIFIED** | — |
| Noise | Quiet compared with explosive breaching ("quick and relatively silent destruction") | Ubisoft bio; Fandom |
| Usable while rappelling | **Yes**, including inverted rappel (opening a window/door upside down avoids a defender waiting behind it) | Ubisoft Gameplay Tip "RAPPEL AND BREACH" |
| Rappel Breach (Siege X) | Since Y10S2 you don't need a Breach Charge on the window: hammering the barricade then swinging in works | Y10S2 DN ("Using ... a Sledgehammer for a silent entry") |
| "Hot potato" trick | Throw a live grenade on a breakable floor, then hammer it: the grenade drops through to the defender below | Ubisoft Gameplay Tip |

### 3.2 What the hammer breaks
| Target | Result | Source / status |
|---|---|---|
| Soft (destructible) walls | Breaks a passable rectangular hole | Ubisoft; Fandom |
| Soft floors / ceilings (from above) | Breaks through (must be close) | Ubisoft tip; Fandom |
| Non-reinforced hatches | Breaks them open. Swings needed **UNVERIFIED** (likely 1) | Ubisoft ("non-reinforced surfaces"); Steam guide |
| Door / window barricades | Destroyed instantly | Liquipedia; Fandom |
| **Reinforced walls / reinforced hatches** | **No effect**, but the swing still spends a charge | Ubisoft ("non-reinforced"); Fandom |
| Indestructible surfaces | No effect, still spends a charge | Fandom |
| Wooden studs/beams left after breaching | **UNVERIFIED** | — |
| Siege X destructible ingredients (gas pipes, fire extinguishers, metal detectors) | **UNVERIFIED.** Fandom only says "Environmental props count as one hit" | Fandom |
| Defender gadgets | Official: "Many defender gadgets can be destroyed with your hammer." It acts like explosive damage, so it breaks bulletproof gadgets: Barbed Wire (1 swing), Deployable Shield, Bulletproof Camera (instantly), Castle Armor Panel, Azami Kiba Barrier, Maestro Evil Eye | Ubisoft tip; Fandom Sledge / Barbed Wire / BPC / Deployable Shield |
| Enemy players | Fandom: can kill in one hit. **UNVERIFIED** in the current season | Fandom |
| **Ballistic Shield users** (Siege X) | **One swing knocks the shield away and knocks the operator down.** Fandom says the hit does **no damage** but leaves them exposed | Y10S2 DN ("Hitting a Ballistic Shield will knock back the operator"); Daybreak page; Fandom |

Liquipedia lists the Caber as countering these operators: Castle, Maestro, Clash, Azami, Skopós.

## 4. Interactions with the other 11 roster operators

"Lesion" stands in provisionally for "Legion".

### 4.1 Defenders
| Defender (gadget) | Sledge tool | Result | Source / confidence |
|---|---|---|---|
| **Mute** (Signal Disruptor, 2.6 m) | Hammer | Jammers don't affect the hammer (it's mechanical; since Y10S4 jammers only block wireless signals). A hammer hit or a Frag destroys a jammer (they die to any damage) | Y10S4 DN; Fandom Mute (inferred for the hammer) |
| Mute | Impact EMP | Disables Signal Disruptors (duration **UNVERIFIED**, Fandom 9 s) | Fandom EMP list |
| Mute | Drones | Sledge's drones go to static inside the jammer radius | Fandom Mute |
| **Pulse** (Cardiac Sensor, 10.5 m) | — | Pulse tracks Sledge through floors. Dangerous when Sledge hammers a floor: Pulse can answer from below (Pulse can carry a Nitro Cell) | Fandom Sledge "Counter"; Y11S2 DN; Ubisoft Pulse page |
| Pulse | Impact EMP | Fandom: EMP disables the Heartbeat Sensor for 5 s if Pulse is in range (stated for Thatcher's EMP; Impact EMP **UNVERIFIED**) | Fandom Pulse |
| **Mira** (Black Mirror) | Hammer on a **soft** wall holding a mirror | Destroying the surrounding wall removes the mirror (Fandom general rule). Hammer specifically — **UNVERIFIED** | Fandom Mira |
| Mira | Hammer on a **reinforced** wall holding a mirror | Can't breach reinforcement. A melee strike shatters the mirror's glass (view blocked). Whether a hammer strike counts as that melee strike is **UNVERIFIED** | Fandom Mira |
| **Lesion** (Gu mines) | Hammer | **UNVERIFIED.** Fandom: trying to melee a Gu mine sets it off anyway | Fandom Lesion |
| Lesion | Frag | Destroys Gu mines (explosives) | Fandom Lesion |
| Lesion | Impact EMP | No effect: Gu mines have been mechanical since Y8S3 | Fandom Lesion |
| **Skopós** (V10 Pantheon Shells) | Hammer | Liquipedia lists Skopós as countered by the Caber. Likely it breaks the inactive shell's bulletproof shield, which is vulnerable to explosives. Exact effect and shell damage **UNVERIFIED** | Liquipedia; Fandom Skopós |
| Skopós | Impact EMP | EMP on either shell stops her switching shells | Fandom Skopós |
| Skopós | Frag | Explosives can destroy the inactive shell's shield | Fandom Skopós |
| **Sentry** (any 2 defender gadgets) | Hammer | Barbed Wire: 1 swing. Deployable Shield: destroyed. Bulletproof Camera: destroyed instantly. Proximity Alarm / Observation Blocker / Nitro Cell: **UNVERIFIED** (probably destroyed) | Fandom Barbed Wire, Deployable Shield, BPC |
| Sentry | Impact EMP | Disables Nitro Cell, Proximity Alarm, Bulletproof Camera (duration UNVERIFIED) | Fandom EMP list |
| Sentry | Nitro Cell / Impact Grenade vs Sledge | The standard counter: explosives thrown at Sledge while he's hammering a floor or wall | siege.gg Sledge guide |
| Sentry | Bulletproof Camera EMP burst → Sledge | DSEG disables his sights (all sights since Y10S4). The hammer itself is presumably unaffected (mechanical) — UNVERIFIED | Fandom BPC; Y10S4 DN |

### 4.2 Attackers (teammates)
| Attacker | Interaction | Source / confidence |
|---|---|---|
| **Thermite** | Classic pairing: Thermite opens reinforced walls, Sledge opens the soft walls, floors and hatches around them. Sledge's Impact EMP can disable a Mute jammer before Thermite detonates (Mute still jams the Exothermic Charge) | Fandom Sledge synergies; Y10S4 DN |
| **Fuze** | Sledge opens soft floors/walls to set up Cluster Charge angles; Impact EMP clears jammers for Fuze. **Hammer vs a friendly Ballistic Shield (Fuze's shield option): UNVERIFIED** — Fandom only mentions enemy shields | Fandom Sledge |
| **Striker** | Overlapping gadgets (Frag / Stun / Impact EMP). Striker's Breach Charges plus Sledge's hammer give a lot of soft destruction | — |
| **Dokkaebi** | **Caution:** Sledge's Impact EMP on a defender Dokkaebi is uploading to can probably **cancel her Jegeo upload** (Y11S3 DN says EMP on the target's phone breaks the connection) — UNVERIFIED for teammates | Y11S3 DN |
| **Brava** | No direct interaction | — |

## 5. Change history

| Season / patch | Date | Change | Source |
|---|---|---|---|
| (older) Y6S3 Crystal Guard | 2021-09-07 | **SMG-11 removed** ("By removing his SMG, this will bring his overall versatility down") | Y6S3 pre-season DN (official); Fandom |
| (older) Y7S3 Brutal Swarm | 2022-09-06 | **Impact EMP Grenade added** as a third gadget option | Fandom |
| **Siege X — Y10S2 Daybreak** | 2025-06-10 | **Hammer vs Ballistic Shields: one swing knocks the shield aside and the operator to the ground.** System changes: Rappel Breach no longer needs a Breach Charge (hammer works); electricity now neutral (slows, doesn't damage; destroys devices); destructible ingredients added | Y10S2 DN; Daybreak page |
| **Y10S3 High Stakes** | 2025-09-02 | **Reaper MK2 added** as a secondary, plus a Reaper recoil buff | Y10S3 DN; High Stakes page |
| **Y10S4 Tenfold Pursuit** | 2025-12-02 | Indirect: DSEG consolidated, so his Impact EMP now disables all sights and can be re-applied to refresh. Mute reworked to jam signals only | Y10S4 DN |
| **Y11S1 Silent Hunt** | 2026-03-03 | No Sledge change | Y11S1 DN; Fandom 11.1.x pages |
| **Y11S2 System Override** | 2026-06-02 | No direct change. **Y11S2.3 (2026-08-04):** Impact EMP radius 2.0 m (from 1.8); Reaper MK2 recoil stages later (0, 3, 10, 25) | Y11S2.3 patch notes |
| **Y11S3 Split Fire** | 2026-09-01 | No direct change | Y11S3 DN |
| **Y11S3.1** | 2026-09-22 | **Hammer swing time 0.8 s (from 1 s)** — "improve Sledge's responsiveness" | Y11S3.1 patch notes |

Notes: Fandom's Sledge patch list stops at 7.3.0, so it misses the Y10S2, Y10S3 and Y11S3.1 entries. Liquipedia's Sledge page is outdated (no Reaper MK2).

## 6. JSON-ready summary
```json
{
  "id": "sledge",
  "side": "attacker",
  "health_rating": 2,
  "speed_rating": 2,
  "primaries": ["l85a2", "m590a1"],
  "secondaries": ["p226_mk25", "reaper_mk2"],
  "gadgets": {"frag": 2, "stun": 2, "impact_emp": 2},
  "ability": {
    "id": "breaching_hammer",
    "charges": 25,
    "charge_cost": "UNVERIFIED (1 per hit, or wall=2 / kill=2 per a second Fandom page)",
    "swing_time_s": 0.8,
    "reach_both_faces_m": "~1.0 UNVERIFIED",
    "breaks": ["soft_wall", "soft_floor", "hatch_unreinforced", "barricade", "barbed_wire", "deployable_shield", "bulletproof_camera"],
    "no_effect": ["reinforced_wall", "reinforced_hatch", "indestructible"],
    "hole_one_swing": "crouch/vault passable (dims UNVERIFIED)",
    "hole_two_swings": "standing passable (dims UNVERIFIED)",
    "vs_ballistic_shield": "knockback + knockdown, 0 damage",
    "usable_on_rappel": true
  }
}
```

## Open questions
- **Charge cost:** does breaking a wall cost 1 or 2 of the 25 charges? Does hitting a player cost 2? Is 25 still the number? Ulo can read the charge bar in a Custom Game.
- **Hole size:** how wide and tall is the hole (in m) from 1 swing and from 2 swings? A screenshot next to a known-size door would do.
- Does the hammer break the wooden studs/frames, or leave them?
- How many swings does a non-reinforced hatch take?
- Is the hammer still a one-hit kill on defenders? How much damage does it do?
- Hammer vs Siege X destructible ingredients (gas pipes, extinguishers, metal detectors): what happens?
- Hammer vs Lesion's Gu mines, Proximity Alarms, Observation Blockers, Nitro Cells, Mute jammers: does it destroy them in one hit?
- Hammer vs Skopós: does it break the inactive shell's shield, damage the shell, or both?
- Hammer vs Mira's Black Mirror: on a soft wall, does it take out the mirror? On a reinforced wall, does it shatter the glass like a melee strike?
- Can Sledge knock down a **friendly** shield (e.g., Fuze's Ballistic Shield) in normal modes?
- Impact EMP disable duration (Fandom: 9 s) and whether it disables Pulse's Cardiac Sensor.

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/sledge — ratings (H2/S2), CTU SAS, squad Redhammer, specialties, loadout (L85A2, M590A1; P226 Mk 25, Reaper MK2; Frag, Stun, Impact EMP), hammer description, Gameplay Tips (gadget destruction, limited swings, rappel/inverted, 1-swing vs 2-swing holes, hot potato)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes — swing time 0.8 s (from 1 s)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes — hammer knocks back Ballistic Shield users; Clash/Impact EMP note; Rappel Breach change
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/daybreak — Siege X summary ("one swing ... knock them to the ground"); electricity neutral; destructible ingredients
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/4czc3hlHtXrd27crELGDcc/y10s3-designers-notes — Reaper MK2 added to Sledge; Reaper recoil buff
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/highstakes — Reaper MK2 added to Sledge, Oryx, Pulse, Ying, Rook
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes — DSEG consolidation; Mute rework
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5fWCjoCU8toUJiBdMSj0UA/y11s1-designers-notes — checked, no Sledge change
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2EIn06EmkAIG7su2fpITue/y11s23-patch-notes — Impact EMP 2.0 m; Reaper MK2 recoil stages; Mute 2.6 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/PONCuRt8LaCr3O31NkBQb/y11s3-designers-notes — checked, no Sledge change; EMP vs Jegeo connection
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2zsUnVBdSsc10rirkPl1K5/y6s3-preseason-designers-notes — SMG-11 removal (official)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/sentry , /mute , /pulse , /mira , /lesion , /skopos — defender loadouts (for interactions)
- https://rainbowsix.fandom.com/wiki/Sledge_(Siege) — 25 charges, reach ~1 m, unequip delay, gadget destruction list, shield knockdown with no damage, patch history (SMG-11, Impact EMP)
- https://rainbowsix.fandom.com/wiki/Breaching_Hammer — conflicting charge-cost rule (wall = 2, kill = 2)
- https://liquipedia.net/rainbowsix/Sledge — Charges 25; counters list (Castle, Maestro, Clash, Azami, Skopós); page otherwise outdated
- https://rainbowsix.fandom.com/wiki/Barbed_Wire — hammer destroys wire in 1 strike
- https://rainbowsix.fandom.com/wiki/Bulletproof_Camera — hammer destroys BPC instantly; BPC EMP burst
- https://rainbowsix.fandom.com/wiki/Deployable_Shield — hammer destroys deployable shields
- https://rainbowsix.fandom.com/wiki/Mute , https://rainbowsix.fandom.com/wiki/Pulse_(Siege) , https://rainbowsix.fandom.com/wiki/Mira_(Siege) , https://rainbowsix.fandom.com/wiki/Lesion , https://rainbowsix.fandom.com/wiki/Skopós — defender-side interaction details
- https://rainbowsix.fandom.com/wiki/EMP_Grenade — Impact EMP basics and affected-gadget list
- https://siege.gg/news/rainbow-six-siege-operator-guide-sledge — counters (explosives while hammering floors), gadget destruction
- https://r6siegecenter.com/guides/operators/attackers/sledge/ — "one swing ... big enough to vault or crouch walk", 25 swings
- https://steamcommunity.com/sharedfiles/filedetails/?id=3575627225 — 25 uses; hatches breakable
