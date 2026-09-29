# Mira (Black Mirror)
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29. The last Mira-specific gameplay change was Y6S2 (6.2.0, glass-shatter mechanic); Y10S4 changed an interaction (Ash rounds vs electrified Mirrors).
Confidence: medium-high for loadout, ratings, placement and visibility rules (Ubisoft page, Fandom, several consistent guides). Medium/low for exact numbers: deploy 5 s and ejection delay 4 s are Fandom/guide values not confirmed by Ubisoft. Window size and hard-breach-charge interactions are UNVERIFIED.

## 1. Identity and base stats

| Field | Value | Source / note |
|---|---|---|
| id | `mira` | — |
| side | Defender | Ubisoft page |
| CTU / squad | G.E.O. / **Viperstrike** | Ubisoft page |
| role tags | INTEL, SUPPORT | Ubisoft page |
| health rating | **3** → **125 HP** | Ubisoft page stars 3/3; HP mapping from Fandom Armor and Speed |
| speed rating | **1** | Ubisoft page stars 1/3. m/s: `research/core_mechanics.md` |
| difficulty | 3 / 3 | Ubisoft page |
| introduced | Y2S1 Operation Velvet Shell (Update 2.1.0, 2017-02-07) | Fandom patch history |

## 2. Loadout (official Ubisoft operator page, Y11S3)

| Slot | Options | Count | Source |
|---|---|---|---|
| Primary | **Vector .45 ACP** (SMG), **ITA12L** (shotgun) | — | Ubisoft page |
| Secondary | **USP40** (handgun), **ITA12S** (shotgun) | — | Ubisoft page |
| Secondary gadget | **Nitro Cell** | ×1 | Ubisoft page (item); count from Fandom |
| Secondary gadget | **Proximity Alarm** | ×2 | Ubisoft page (item); count from Fandom |
| Unique | **Black Mirror** | **×2** | Fandom (UNVERIFIED by Ubisoft) |

PLAN.md §11.2's baseline loadout is **correct** (it asked to verify Nitro Cell vs Proximity Alarm: both confirmed). Weapon stats:
`research/weapons.csv`. The Y10S3 removal of magnified sights from defenders' automatic weapons doesn't list Mira.

## 3. Black Mirror: complete rules

### 3.1 Deployment
| Parameter | Value | Source / verified |
|---|---|---|
| Count | 2 per round | Fandom; r6siegecenter; siege.gg |
| Deploy time | **5 s** (hold the ability key at melee range against the wall) | Fandom; r6siegecenter (UNVERIFIED by Ubisoft) |
| Stance | Standing (head height) or crouched (crouch height). **Not prone** | Fandom; r6siegecenter |
| Valid surfaces | **Reinforceable walls only**, reinforced or not. **Not** on hard (non-reinforceable) walls | r6siegecenter; Fandom ("any breachable or reinforced wall") |
| Reinforced wall | Only from the **side it was reinforced from** (the defender side) | Fandom; r6siegecenter |
| Straddling | Can be placed across the border between a reinforced and a non-reinforced section | Fandom |
| Reinforcing afterwards | A soft wall with a Mirror on it **can't be reinforced** afterwards | Fandom (UNVERIFIED in current build) |
| Floors / hatches / barricades / doors / windows | **Not valid.** The gadget is described only for walls | inferred from the "walls" wording in every source. Explicit confirmation UNVERIFIED |
| On deploy | Burns out and **ejects the wall/reinforcement section** it covers, then locks the frame in place. Does "a tiny amount of damage" on the opaque side when deployed | Fandom; Ubisoft device lore ("oxyacetylene can carve out a one-way mirror") |
| Pick-up | **Can't be removed** once deployed | Fandom |
| Placement nuance | A Mirror on a reinforced wall with an **unreinforced neighbour** lets defenders open holes beside it for throwing Nitro Cells. A reinforced wall under the Mirror stops attackers shooting Mira's legs | siege.gg; r6siegecenter |

### 3.2 Geometry
| Parameter | Value | Verified |
|---|---|---|
| Glass shape | Landscape rectangle in a metal frame. Looks roughly **3:1 (w:h)** in screenshots | observed on the Fandom images (scratch copies only, not in repo) |
| Glass size | **UNVERIFIED.** Placeholder: **1.0 m wide × 0.35 m tall** glass, frame about 1.2 × 0.55 m. Scale estimated by eye only | — |
| Canister | A red **oxygen canister** on the **bottom frame, defender (deploy) side**, lower-left in the reference screenshot | Fandom; r6siegecenter; screenshot |
| Anchors | **4 anchors** (2 top, 2 bottom) that can only be **seen from the inside** (defender side) | Fandom Mira & Maverick |

### 3.3 Visibility (two-sided shader)
| State | Defender (deploy) side | Attacker (opaque) side | Bulletproof? | Source |
|---|---|---|---|---|
| Intact | **Clear view.** Slight glass/teal-frame treatment, no heavy tint (screenshot) | **Opaque black**: no vision, looks like black glass | yes, both ways | Fandom; Ubisoft blurb "one-way mirror" |
| Shattered (melee hit from **either** side, since Y6S2) | **Opaque**: shattered pattern blocks vision | Opaque | **still bulletproof**, stays in the wall, can still be ejected via the canister | Fandom; siege.gg ("won't destroy the window") |
| Ejected (canister destroyed) | Open **murder hole**; the **frame remains** | Open hole | no: open line of fire both ways | Fandom; Ubisoft blurb |
| Destroyed by thermal breach | Gone, **no frame left** | Gone | — | Fandom |

Flashes: stun grenades (and Blitz/Ying, not on roster) **still blind defenders through an intact Mirror** (Fandom).

### 3.4 Durability ("HP")
| Damage source | Effect on the Mirror | Source / verified |
|---|---|---|
| Bullets (either side) | No effect. The glass is bulletproof (effectively infinite HP) | Fandom; r6siegecenter |
| Explosives hitting the glass | No effect on the glass ("bullet- and blast-resistant"). Explosives **do** destroy the canister if they reach the defender side | Ubisoft device lore via Fandom; r6siegecenter |
| Melee (1 hit, either side) | Shatters it: opaque both ways (§3.3) | Fandom |
| Destruction of the **surrounding soft wall** | Removes the Mirror with it (Ash rounds, Zofia, frags, breach charges, etc.) | Fandom; siege.gg; r6siegecenter |
| Thermal breach on the anchors | Instantly and completely destroyed | Fandom |

Numeric glass HP isn't documented. Model it as `bulletproof=true`, `explosion_proof=true`, `shatter_on_melee=true`,
and destroyed only via **anchors (thermal)** or **host-wall destruction**.

### 3.5 Canister and ejection
| Parameter | Value | Source / verified |
|---|---|---|
| Location | Bottom frame, **defender side only** | Fandom; r6siegecenter |
| What destroys it | Gunfire, melee, explosives, Twitch shock-drone darts, Zero ARGUS lasers, Wamai MAG-NETs, Goyo Volcán | Fandom |
| Who can pop it | **Either team.** Attackers need line of sight to the defender side: a hole above or below, a drone, or an explosive landing on that side | r6siegecenter ("can be opened by either team"); Fandom |
| Delay after canister destroyed | **4 s**, then the glass ejects | Fandom (UNVERIFIED by Ubisoft) |
| Audio / VFX | A small puff of smoke and a soft noise, audible on **both sides** | Fandom |
| After ejection | Frame stays. The opening is a normal shoot-through hole for both teams | Fandom |
| Attacker-side canister? | **None.** There is only one canister, on the deploy side | Fandom; r6siegecenter |

## 4. Interactions with the other 11 roster operators

| Other operator (side) | Their tool → Mira | Result | Source / verified |
|---|---|---|---|
| **Brava** (atk) | Kludge Drone → Black Mirror | **No interaction.** The Mirror isn't in the Kludge hack/destroy lists | Fandom Brava (by omission). UNVERIFIED in-game |
| Brava | Kludge → Mira's Proximity Alarm / Nitro Cell | Prox Alarm **converted**; Nitro Cell **destroyed** | Fandom Brava |
| **Fuze** (atk) | Cluster Charge **planted on the Black Mirror** | **Officially allowed since Y6S3** ("Can be deployed on reinforced surfaces and Mira's Black Mirror"). It "take[s] longer to drill through … Mira's Black Mirror" (exact time UNVERIFIED; reinforced surfaces are 1.75 s since Y11S2.3). A successful drill **shatters the bulletproof glass** ("as with any other bulletproof glass", Y8S3 DN), then sub-grenades land on the defender side | Official Y6S3 pre-season DN; Y8S3 DN; Y11S2.3 patch notes |
| Fuze | Sub-grenades on the defender side | Explosives destroy the **canister**, so they can **eject** the Mirror (inferred from Fandom's "explosives destroy the canister"). A cluster on a soft host wall destroys the wall and removes the Mirror | Fandom Mira |
| **Thermite** (atk) | Exothermic Charge on the Mirror's (reinforced) wall | **Destroys the Mirror completely** (thermal breach through anchors/wall). The charge can be placed on the **opaque side** of the wall carrying a Mirror | Fandom Mira; siege.gg; r6siegecenter |
| Thermite | vs Mute / electricity | Mute jammer: Thermite **can't trigger** a charge inside the radius (Y10S4 DN). Bandit/Kaid electricity destroys placed charges (Fandom) | Y10S4 DN; Fandom Thermite |
| **Striker** (atk) | **Hard Breach Charge** | Any hard breacher can destroy a Mirror on a reinforced wall (guides). Whether the Hard Breach Charge's hole must cover the anchors: UNVERIFIED | siege.gg; r6siegecenter |
| Striker | Stun Grenade | **Blinds defenders through an intact Mirror** | Fandom Mira |
| Striker | Frag / Breach Charge / Claymore | Frag or Breach Charge on a **soft-wall** Mirror's host wall removes the Mirror. A frag landing on the defender side can pop the canister | siege.gg; Fandom |
| Striker | Impact EMP | **No effect** on the Mirror (not electronic). One Steam guide claims EMP "disables mirrors": **unsupported, treat as false**. EMP does disable Mira's Prox Alarm and Nitro Cell | Fandom EMP list (Mirror absent) |
| **Dokkaebi** (atk) | Jegeo Payload → Mira's phone | Standard: 7 s buzz; 40 HP explosion + 5 s fire if ignored; lose phone (no cams). Doesn't affect Mirrors | Y11S2 DN; Y11S3 DN |
| Dokkaebi | Breach Charges (Y11S3) | Destroy a soft-wall Mirror's host wall → Mirror removed | Y11S3 DN; siege.gg |
| **Sledge** (atk) | Hammer on a **soft** wall holding a Mirror | Destroying the host wall removes the Mirror (inferred from the host-wall rule; UNVERIFIED for the hammer specifically) | Fandom Sledge/Mira |
| Sledge | Hammer on a **reinforced** wall | No effect (the hammer can't break reinforcements) | Fandom Sledge |
| Sledge | Hammer / melee on the glass | Melee shatters the glass (opaque). Whether the hammer counts as melee (shatter) or explosive here: UNVERIFIED | Fandom |
| **Mute** (def) | Signal Disruptor | **Protects** reinforced Mirrors: blocks Thermite's remote detonation (and, per Fandom, breach/hard-breach charges) within **2.6 m** (Y11S2.3). Also jams drones that would pop the canister | Y10S4 DN; Fandom Mute; r6siegecenter |
| **Pulse** (def) | — | No interaction. Synergy: Mirror + heartbeat intel + Nitro | — |
| **Lesion** (def, provisional) | — | No interaction | — |
| **Sentry** (def) | Nitro Cell, Deployable Shield, etc. | Synergy only: Nitro through a hole next to the Mirror; Deployable Shield blocking the drone path to the canister | r6siegecenter |
| **Skopós** (def) | Shells | Shells can look through and shoot from Mirrors like any defender. No special interaction | — |

Non-roster context (generic matrix): Hibana's pellets (one pellet opens it completely), Ace's SELMA (if touching) and Maverick's torch (on the 4 anchors) all destroy Mirrors. Ash rounds, Zofia and Buck break soft-wall Mirrors or open ceiling/floor lines to the canister. Twitch drones and Zero ARGUS pop the canister. **Since Y10S4, Ash's Breaching Rounds are destroyed by electrified Mirrors**: a Mirror on a Bandit/Kaid-electrified reinforcement is electrified (Y10S4 DN).

## 5. Implementation notes (PLAN.md §11.2)
- `BlackMirror` entity: `owner_side`, `host_panel_id`, `height_mode` (`stand`/`crouch`), `state`
  (`intact`/`shattered`/`ejecting`/`ejected`/`destroyed`), `eject_timer=4.0`, `anchors[4]`.
- Two-sided material: deploy side = transparent glass. Other side = opaque black. `shattered` = opaque both sides
  (crack texture). Glass stays a bulletproof collider until `ejected`/`destroyed`.
- Canister = small hittable collider on the deploy side, bottom frame. Any damage → `ejecting` (4 s) → `ejected`.
- Validation: host must be a `REINFORCEABLE` wall panel. If it's reinforced, the player must be on the reinforcement's side.
  No prone. Deploying consumes the panel section and makes the host non-reinforceable.

## 6. Change history

| Season | Change | Source |
|---|---|---|
| Y2S1 (2017) → Y5S2 (2020) | Introduced; Deployable Shield → Barbed Wire (Y4S3); Barbed Wire → **Proximity Alarm** (Y5S2) | Fandom |
| Y6S2 (2021-06-14) | **Shatter mechanic**: melee from either side makes the glass opaque | Fandom |
| Y10S2 Daybreak / Siege X (2025-06) | No Mira change. Global: electricity team-neutral; limb-damage reductions | Y10S2 DN |
| Y10S3 High Stakes (2025-09) | No Mira change | Y10S3 DN (Mira not listed) |
| Y10S4 Tenfold Pursuit (2025-12) | **Ash's Breaching Rounds are now destroyed by electrified Black Mirrors.** Global: DSEG rework; Mute jams only wireless/remote triggers (still stops Thermite); Thermite +1 Exothermic Charge; reinforcement only detaches when a **full line is cut** | Y10S4 DN; Tenfold Pursuit season page |
| Y11S1 Silent Hunt (2026-03) | No Mira change | Y11S1 DN |
| Y11S2 System Override (2026-06) | No Mira change. Y11S2.3: Fuze reinforced-surface breach 1.75 s; Mute radius 2.6 m | Y11S2.3 patch notes |
| Y11S3 Split Fire (2026-09-01) | No Mira change | Y11S3 DN |

## Open questions
- **Window size.** Ulo: screenshot a Mirror next to a doorway (known ~2.2 m tall) or a standing operator, from both sides, to set glass/frame dimensions.
- **Deploy time (5 s?) and ejection delay (4 s?).** Ulo: time both in a Custom game (Fandom-only now).
- **Hard Breach Charge vs Mirror** (Striker/Fuze): does one charge destroy a Mirror on a reinforced wall, or only if it covers an anchor?
- **Sledge's hammer on the glass:** shatter only, or destroy? Hammer on a soft wall holding a Mirror: is the Mirror removed?
- **Can a soft wall holding a Mirror still be reinforced?** (Fandom says no.)
- How long does a Fuze Cluster Charge take to drill a Black Mirror (the Y6S3 DN only says "longer"), and does the Mirror survive as shattered glass or get destroyed?
- Exact defender-side tint (any colour grading, or fully clear)? A screenshot through an intact Mirror would settle it.
- Official confirmation that Mira has **2** Mirrors, 1 Nitro Cell and 2 Proximity Alarms (loadout-screen screenshot).

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/mira: loadout, G.E.O./Viperstrike, INTEL/SUPPORT, health 3 / speed 1 / difficulty 3 stars, ability blurb
- https://rainbowsix.fandom.com/wiki/Mira_(Siege): count 2, deploy 5 s, stance, placement rules, canister (location, destroyers, 4 s delay, audio), anchors, shatter, counters, patch history
- https://r6siegecenter.com/guides/operators/defenders/mira/: reinforceable-walls-only rule, reinforced-side rule, 5 s deploy, either team can pop canister, Hibana/Thermite/Maverick counters, Mute/Bandit/Kaid synergy
- https://siege.gg/news/3296-rainbow-six-siege-operator-guide-mira: hard breachers destroy windows; any explosion destroys a window on a non-reinforced wall; melee shatter doesn't destroy
- https://www.strafe.com/news/read/through-the-black-mirror-mira-in-rainbow-six-siege-explained/: cross-check of deploy/visibility/canister rules
- https://steamcommunity.com/sharedfiles/filedetails/?id=3575657180: claim "Thatcher EMPs can disable mirrors", judged unsupported
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes: Ash vs electrified Black Mirrors; Mute/Thermite; reinforcement full-line rule
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/tenfoldpursuit: Ash/electrified Mirrors (season notes), Thermite +1 charge
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes: Siege X global changes
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/4czc3hlHtXrd27crELGDcc/y10s3-designers-notes: magnified-sight removal list (Mira not affected)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2EIn06EmkAIG7su2fpITue: Y11S2.3: Fuze 1.75 s on reinforced, Mute 2.6 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2MNhboDBmsQKkWb5p8zqsg/y11s2-designers-notes and https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/PONCuRt8LaCr3O31NkBQb/y11s3-designers-notes: Dokkaebi Jegeo / Breach Charges
- https://rainbowsix.fandom.com/wiki/Brava, https://rainbowsix.fandom.com/wiki/Fuze_(Siege), https://rainbowsix.fandom.com/wiki/Thermite_(Siege), https://rainbowsix.fandom.com/wiki/Sledge_(Siege), https://rainbowsix.fandom.com/wiki/Mute, https://rainbowsix.fandom.com/wiki/EMP_Grenade: cross-operator interaction rules
- https://rainbowsix.fandom.com/wiki/Hibana_(Siege), https://rainbowsix.fandom.com/wiki/Ace, https://rainbowsix.fandom.com/wiki/Maverick: non-roster thermal-breach interactions (via the destruction agent's cache)
- https://rainbowsix.fandom.com/wiki/Armor_and_Speed: HP per health rating
- https://static.wikia.nocookie.net/rainbowsix/images/d/d5/Black-mirror-spread-out-the-view.jpg and https://static.wikia.nocookie.net/rainbowsix/images/0/06/1342047352_preview_RainbowSix_2018-03-05_20-58-00-48.jpg: visual reference for both sides (viewed in scratch only; not copied to repo)
