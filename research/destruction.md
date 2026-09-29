# Destruction, Surfaces & Reinforcement (Rainbow Six Siege reference)
Verified against: Y11S3 (Operation Split Fire, including the Y11S3.1 patch of 2026-09-22). Researched 2026-09-29.
Confidence: **medium**. The *rules* (what can damage what, reinforcement pool/time, hard-breach behaviour, hatch HP pool, barricade melee count, Siege X ingredient behaviour) come from official Ubisoft notes plus the Fandom wiki. Most *geometry* (exact hole sizes, panel/hatch dimensions), per-weapon destruction tiers, wallbang damage reduction, hatch-melee counts, barricade deploy time and ingredient damage numbers are not published in any source I could reach. Those are marked UNVERIFIED and need in-game checks by Ulo.

Source keys like `[S3]` or `[U10]` point to the **Sources** list at the bottom. "Fandom" means rainbowsix.fandom.com, read through its API. Liquipedia was rate-limited and was **not** used.

---

## 0. Summary for implementers

- There are three breachability classes. Siege shows them as the Breach Charge indicator light: **green = breachable**, **yellow = semi-breachable** (metal supports: you can make holes but never pass through), **red = unbreakable** (hard). All breachable *floors* are yellow. Walls can be any of the three. Hatches and barricades are always green. [S1][S5]
- Soft walls are **two skins plus wooden studs**. Bullets and normal melee chip the skins but **do not destroy studs**, unless the weapon's destruction tier is "Full" (buckshot shotguns up close) or the tool is explosive, Sledge's hammer, a slug that is aimed well, or an Aruni/Skopós punch. If enough of a wall is removed, the loose pieces fall away ("micro-destruction"). [S1][S9][U14]
- Each weapon has an **official destruction tier** that the game shows in Detailed Weapon Stats (added in Y9S2): Low / Medium / High / Full, and whether it destroys studs. Example from Ubisoft: *XK23: "Destruction: Medium, does not destroy studs"*. Destruction is defined **per caliber** (Y9S4.2: "Slug's destruction reduced"). [S1][U26][U17][U30]
- **Reinforcement:** a shared team pool of **10** in standard Bomb (1v1 Arcade uses **6**). There is no per-defender quota. Each placement takes **4.5 s** of held interact and covers **one wall section** (walls have 2–3 sections) or one hatch. Hatches can only be reinforced **from the top side**. You *can* reinforce a damaged or fully blown soft wall. You *cannot* re-reinforce a destroyed reinforcement or a destroyed hatch. [S2][S28][U24][U18]
- Reinforced walls stop bullets, melee, soft explosives and Sledge. Only **thermal or hard-breach** tools open them (Thermite, Hard Breach Charge; also Hibana, Maverick and Ace, who are not on our roster). Since Y10S4, a reinforcement **detaches only when a full line is cut** through it. Reinforced **hatches** have a **1,000,000 HP pool** that different hard-breach devices can share. [U10][U23]
- Barricades: unlimited, defenders only, **3 melee hits** always break one, ~20 rifle, SMG or pistol bullets, a couple of close shotgun blasts. Door barricades leave a **drone gap** at the bottom. Since Y11S1, **shields cannot push through full-HP barricades**. Since Y10S2, **rappel breach** works on any barricade that is damaged enough by the end of the swing. [S3][U3][U14]
- **Siege X ingredients** (Y10S2+): **gas pipes** (shoot, then a flame jet for ~15 s, then an explosion and a short ground fire), **fire extinguishers** (shoot, then a smoke cloud and concussion close by), **metal detectors** (beep when walked through; EMP disables them temporarily; shooting, melee or explosives destroy them). **Oregon was modernized with ingredients in Y11S1.** [U1][U2][U13][O1][O2]
- Explosions run in Ubisoft's **RealBlast** engine. The *destruction* radius and *damage* radius are separate. Since Y5S1, blast damage passes through destructible objects with reduced damage ("shrapnel"). Whether Siege's destruction is server-authoritative is **not publicly documented** (UNVERIFIED). Build it server-authoritative as PLAN §8.6 says. [U25]

---

## 1. Surface classes (master table)

| Class (proposed id) | Siege examples | Bullets | Normal melee | Soft explosives (Breach Charge, Nitro Cell, Impact, Frag, Sledge) | Hard breach (Exothermic, Hard Breach Charge, …) | Passable after breach | Charge light | Src |
|---|---|---|---|---|---|---|---|---|
| `SOFT_WALL` | Drywall, plaster or wood interior/exterior walls with wooden studs | Penetrate and chip holes; studs survive unless the weapon is "Full" tier | Round hole per hit; studs survive | Full breach; opening is passable | Works (any destructible surface) | Yes | Green | [S1][S5] |
| `SOFT_WALL_NO_STUDS` | Some breachable surfaces "do not have any supports inside them" | Any gunfire can open a passable hole | Holes | Full breach | Works | Yes | Green | [S1] |
| `SEMI_WALL` | Walls with metal supports or an unremovable obstacle (e.g. Plane ladder wall). Being removed in map reworks. | Penetrate the skins only; **metal supports block penetration** | Holes | Bigger hole: line of sight and shooting only | UNVERIFIED | **Never** | Yellow | [S1] |
| `HARD_WALL` | Concrete, brick, load-bearing | Blocked | None | None | **None** (hard breach cannot open other indestructible surfaces) | No | Red | [S1] |
| `REINFORCED_WALL` | A reinforcement deployed on one section of a breachable wall | Blocked (bulletproof) | None | None (Sledge only uses up durability) | **Yes**: Thermite, Hard Breach Charge (plus Hibana, Maverick, Ace) | Yes, once cut open (§7) | (shows as unbreakable to Breach Charge) | [S1][S2][S9] |
| `SOFT_FLOOR` / `SOFT_CEILING` | Breachable floors on wooden/metal joists; the ceiling below is the same surface | Penetrate, but **metal joists block**; shoot parallel to the joists | Sledge can break it (both layers if close); normal melee on floors UNVERIFIED | Bigger hole: line of sight and shooting only | Works; Thermite makes a larger opening | **Never** (only hatches are drop-through) | Yellow | [S1][S9][U28] |
| `HARD_FLOOR` | Concrete slabs | Blocked | None | None | None | No | Red | [S1] |
| `HATCH` (unreinforced) | Wooden trapdoor in a floor | Breakable; needs a High/Full tier weapon to shoot it open in practice | Possible but slow (count UNVERIFIED) | Destroyed (Impact, Frag, Gonne-6, Sledge…) | Works | **Yes** (drop-through; Oryx can climb up) | Green | [S1][S7][S12][S23] |
| `HATCH_REINFORCED` | Hatch with a reinforcement (placed from above) | Blocked | None | None | **1,000,000 HP pool** (§8) | Yes, once destroyed | — | [U23][S26] |
| `BARRICADE` | Wooden plank barricade on a door or window | Planks break one at a time; ~20 AR/SMG/pistol shots | **3 hits always** | Destroyed | — | Yes (vault/crouch once enough is gone) | Green | [S3] |
| `ARMOR_PANEL` (context: Castle, not on roster) | Castle's UTP barricade | Mostly bulletproof | **10 hits** (since Y11S3.1) | Breach Charge, Sledge, Gonne-6 destroy it | — | — | — | [S19][U22] |
| `FRAME` | Door and window frames | Indestructible ("can't be penetrated") | — | — | — | — | — | [U21] |
| `WINDOW_GLASS` | Glass panes | UNVERIFIED (assumed to shatter) | UNVERIFIED | UNVERIFIED | — | — | — | — |
| `BULLETPROOF_GLASS` | Exists on some maps (Stadium removed it from objective sites) | Blocked | — | UNVERIFIED | — | — | — | [U35] |
| `PROP_WOOD` | Wooden tables, shelves… | Shoot-through | Holes | Can be completely destroyed | — | Yes (if destroyed) | Breach Charge cannot be placed on props | [S1] |
| `PROP_SOFT` | Sofas | Shoot-through | — | **Not destroyable** | — | No | — | [S1] |
| `PROP_METAL` / `PROP_CONCRETE` | Metal or concrete objects | **Blocked** (no penetration) | — | Some metal objects block explosion damage (metadata) | — | No | — | [S4][U25] |
| `INGREDIENT` | Gas pipe, fire extinguisher, metal detector | Trigger | UNVERIFIED (metal detector: melee destroys it) | Trigger/destroy | — | — | — | §13 |

Notes
- The Breach Charge light (green/yellow/red) and the red "Unbreakable Surface" HUD text are the in-game way to tell classes apart. Reinforced surfaces count as unbreakable to normal charges. [S1][S5]
- Metal studs exist in some modern geometry. Y10S3.2 fixed "Metal studs are uncapped near hatches on the Dual Front map". [U8]

---

## 2. Wall construction, studs/beams, and what removes them

| Item | Rule | Src |
|---|---|---|
| Skins | Breachable walls have an outer and an inner skin. Sledge must be within about **1 m** to break both skins in one swing; otherwise only the near skin breaks. The same applies to floors. | [S9] |
| Double-layered walls | Slug shotguns "can destroy the wooden beams in double-layered walls if properly aimed". | [S24] |
| Studs (wooden supports) | Low/Medium/High tier bullets and normal melee **cannot** destroy studs. "Full" tier bullets destroy studs and walls instantly. | [S1][U17] |
| What removes studs | Explosives (Breach Charge, Impact, Nitro Cell, Frag, Exothermic), Sledge's hammer, buckshot at close range, well-aimed slugs, Aruni's punch and Skopós's v10 shell punch ("creates a bigger hole and destroys wood studs"), and Oryx's dash through the wall. | [S1][S9][S24][S13][U14][S18] |
| Collapse rule | If enough of a wall is broken, "both the wood and the beams will collapse". This may not happen on small walls or on walls that are partly reinforced. For hatches, shooting enough of the hatch breaks its beams, but "takes a lot of time". | [S1] |
| Micro-destruction | Any piece disconnected from the surrounding structure falls and disintegrates into small pieces that players can move through. Pieces still connected stay. Reinforcements are **not treated as connected to their sides**, so destroying the top and bottom of one destroys the middle. | [S1] |
| Material break patterns | Most surfaces break into roughly circular holes. Some (Presidential Plane) break into long planks. Old wood (Hereford) breaks in odd shapes. **Melee always makes a round hole.** Community: drywall breaks in small round chunks, slatted wood in large horizontal chunks. | [S1][O5] |
| Indestructible beams and columns | They can block explosive destruction on nearby soft walls. This was improved in Y5S1 ("Indestructible Object Interference"). Aruni's Surya Gate "sticks to the indestructible wooden beams of the wall". | [S27][S13] |
| Frames | Door and window frames cannot be penetrated. | [U21] |
| Internal "2 steel beams" in reinforcements | No source describes separate internal steel beams in a reinforcement. The documented structure is **anchors at the top and bottom** (pistons that "shoot through the wall and expand, locking it in place"), and the Y10S4 rule that a **full cut line** detaches it. UNVERIFIED: whether any bars stay visible or blocking after a partial cut. Hatches *do* have internal "beams": slug shots needed "depend on the number of hatch beams the slug goes through". | [S2][S14][U10][S24] |

---

## 3. Bullet penetration and weapon destruction

### 3.1 Destruction tiers (official concept, Fandom descriptions)
| Tier | Behaviour | Studs | Can shoot open an unreinforced hatch |
|---|---|---|---|
| Low | Dents; eventually breaks through; slowest | No | Impractical |
| Medium | Like Low but much faster | No | Impractical |
| High | Faster still | No | **Yes** ("Non-reinforced hatches can now be shot open") |
| Full | Instantly destroys studs and walls; all breachable surfaces can be broken | **Yes** | Yes |

Source: [S1]. The live game shows each weapon's tier under **Detailed Weapon Stats → Firepower → Destruction** (added in Y9S2 New Blood) [U26]. Official example: XK23, "Destruction: Medium, does not destroy studs" [U17]. Tiers are tuned **per caliber**: Y9S4.2 says "WEAPON CALIBERS – Slug's destruction reduced" [U30]. Ubisoft also groups calibers as small/medium/high (e.g. POF-9, AUG A2, Spear .308) for limb damage [U3]; that grouping probably matches destruction (UNVERIFIED).

### 3.2 Weapon-class defaults (use until Ulo reads the in-game values)
| Class | Wall/hatch behaviour found | Suggested tier | Status | Src |
|---|---|---|---|---|
| Buckshot shotguns (M590A1, M1014, M870, SIX12 SD, ITA12L/S, Super Shorty, SPAS…) | Large holes up close; destroy wooden beams at close range; open hatches in 1–2 blasts. Tip: hip-fire from ~4–5 m to cover more area. Super Shorty's tight spread may need an angle to open a hatch in one shot. | Full | Behaviour verified; the tier label per gun is UNVERIFIED | [S1][S4][S24] |
| Slug shotguns (BOSG.12.2, TCSG12) | Unreinforced hatch in ~1–3 shots (fewer at a flat angle); can cut studs in double-layered walls | High or Full | UNVERIFIED; reduced in Y9S4.2 | [S24][U30] |
| DMRs (CAMRS, Mk 14 EBR, SR-25) | "Increased destruction" in Y5S1; hatch or barricade in ~7–10 shots (Mk 14: 7 per hatch) | High | Label UNVERIFIED | [S27][S24] |
| LMGs (6P41, M249) | Community says LMGs damage walls more | Medium–High | UNVERIFIED | [O5] |
| Assault rifles | XK23 = Medium, no studs (official) | Medium (5.56) / higher for 7.62 (UNVERIFIED) | Partly verified | [U17] |
| SMGs | — | Low–Medium | UNVERIFIED | — |
| Handguns | Keratos .357 lets Bandit "create his own openings on exterior walls" (official). Community: revolvers and large pistols share the D-50 tier. | Low–Medium; revolvers/.50 High | UNVERIFIED | [U7][O5] |
| Machine pistols (C75, SMG-11, SMG-12, Reaper MK2) | Reaper MK2 does **not** open hatches (Oryx "needs a shotgun to open hatches"; T-5 + Reaper removes that ability) | Low–Medium | Partly verified | [U6] |
| GONNE-6 (Dokkaebi, special) | Explosive round: small hole in a soft wall (about the size of an X-KAIROS pellet hole); **destroys an unreinforced hatch in 1 shot**; destroys barricades and Castle panels instantly | Explosive | Fandom | [S23] |

### 3.3 Penetration rules
| Rule | Value | Status | Src |
|---|---|---|---|
| Which surfaces bullets pass | All soft walls, soft floors, barricades, hatches and most props. **Not** concrete, metal, reinforced, frames or bulletproof glass/gadgets. | Verified | [S4][O5][U21] |
| Floor joists | Metal floor supports block penetration | Verified | [S1] |
| Damage lost passing through a surface | Siege does reduce it ("bullets deal less damage when they hit enemies through structures"). **Magnitude UNVERIFIED.** Unsourced community figures: "~50%" (Steam user, 2018) and "30–50%" (siege.gg 2026, low-quality article). Placeholder: ×0.7 per surface, clearly a guess. | UNVERIFIED | [S25][O5][O3] |
| Max surfaces per bullet | UNVERIFIED. Placeholder: 2. | UNVERIFIED | — |
| Hole growth | Each bullet dents or chips; enough hits inside an area break out a chunk. Higher caliber opens holes faster. Y10S2 made bullet holes "cleaner" (visual/memory change only). | Verified (qualitative) | [S4][U1] |
| Body penetration (context) | None (most shotguns and machine pistols), Simple (through limbs only: ARs, SMGs, LMGs, pistols), Full (DMRs, snipers, BOSG, TCSG12; 2nd target takes 70%). Details belong in weapons.csv. | Fandom | [S4] |

---

## 4. Holes by tool (shape, size, passability)
Sizes are **approximate**. Nothing reachable publishes centimetre dimensions. Every number marked "placeholder" is my guess, only for scaffolding.

| Tool (our roster users) | Shape | Size | Passable | Removes studs | Notes | Src |
|---|---|---|---|---|---|---|
| Bullet, Low/Medium tier | Small round dent/hole | Placeholder Ø 2–4 cm per hit; grows by chunks | Only after heavy fire on stud-free or large walls | No | Tier sets speed | [S1] |
| Bullet, High tier (DMR) | Larger chunks | UNVERIFIED | Hatches yes (~7–10 shots) | No | | [S1][S24] |
| Buckshot (Full) | Spread of large holes | One close blast clears roughly a torso-sized patch (placeholder 40–60 cm) | Yes after a few blasts | **Yes** (close range) | Hip-fire at 4–5 m for coverage | [S1] |
| Slug | Tight hole, cuts beams | UNVERIFIED | Hatch 1–3 shots | Yes if aimed | | [S24] |
| Normal melee | **Always round** | Placeholder Ø 20–30 cm | No (studs stay) | **No** | 1 hit = 1 hole. Punching holes before reinforcing improves sound travel (official tactic). | [S1][U7][S2] |
| Skopós v10 shell punch (= Aruni's) | Round, bigger | About the size of an X-KAIROS pellet hole (placeholder Ø 45–60 cm) | Builds up | **Yes** | Aruni's punch destroys hatches and barricades **in one hit**. That Skopós's shell does the same is implied by "same destruction", UNVERIFIED. | [U13][U14][S13] |
| Sledge, Breaching Hammer (Sledge) | **Rectangular** | 1 swing = passable hole. 2 swings = tall enough for a shield to walk in standing. | Yes | Yes | 25 swings/round; swing time **0.8 s** (Y11S3.1). Must be within ~1 m for both skins. Props, floors and reinforced walls each use a swing (reinforced does nothing). Works while rappelling. | [U27][S9][U22] |
| Impact Grenade (Skopós, Sentry) | Radial | At the right height, a hole you can walk or run through; too low or high = crouch/vault only | Yes | Yes | Also destroys unreinforced hatches and makes line of sight through soft floors. 40 dmg max, 0 beyond 2 m, 20 m throw. | [S7] |
| Nitro Cell / C4 (Mira, Mute, Pulse, Sentry) | Radial | UNVERIFIED (placeholder similar to Impact or larger) | UNVERIFIED | Yes | 171 dmg ≤2 m, 0 at 6 m; hurts through breakable surfaces; sticks to surfaces | [S6] |
| Breach Charge (Dokkaebi, Fuze, Striker) | Charge footprint | "Creates an opening which players can move through". Placeholder ~1.0 m W × 1.8 m H. | Yes (walls); line of sight only on floors | Yes | Lethal on the far side; 50 dmg on the placer side; 0 beyond 1 m; tinnitus within 3 m | [S1][S5] |
| Frag Grenade (Sledge, Striker) | Radial | Breaks soft surfaces; "effectively breaches hatches"; walls unreliable (bounce + fuse) | Hatch yes | Yes | | [S12] |
| Claymore (Brava, Striker) | Oblong blast (front 180°, plus 1 m behind) | UNVERIFIED effect on walls | UNVERIFIED | UNVERIFIED | 155 dmg (Y11S3) | [S11][U25][U20] |
| Exothermic Charge (Thermite) | Large cut | "Significantly larger" than a Breach Charge; destruction radius ~**4 m** that can also take out nearby walls, hatches, or the bottom of an adjacent reinforced wall. Placeholder opening ~1.5 m W × 2.0 m H. | Yes (walk through) | Yes | 3 charges (Y10S4); ~3 s to place; ~3 s heat-up with sparks both sides; **220 dmg** (Y11S3.1); remote-triggered | [S10][U28][U10][U22] |
| Hard Breach Charge (Fuze, Striker) | **Square** (designed so the hole is square) | Small: "too small to run through", crouch or vault if placed low. Placeholder ~0.8 × 0.8 m. | Crouch/vault | Yes | Works on soft and reinforced surfaces. Fandom: 2 s to place, auto fuse 4 s (Y5S3 launch values were 3 s and 6 s). Damage only within ~0.5 m. On hatches: 1M dmg only if ≥3 of its conical charges sit on the hatch. | [S8][U23][U24] |
| Cluster Charge (Fuze) | Drill hole | "Sizeable hole" line of sight after activation | No | — | Drills soft **and reinforced** surfaces (since Y6S3); reinforced/Armor Panel drill time **1.75 s** (Y11S2.3) | [S21][U32][U19] |
| Horus Lance (Noor, context) | Lance through the surface | — | No | — | Pierces soft or reinforced walls, hatches and soft floors, then jets flame on both sides; on frames only one side | [U21] |
| Hibana / Maverick / Ace (context, not roster) | Pellet grid / torch line / SELMA | SELMA: vault or crouch hole | — | — | Useful only for balance context | [S14][S15][S16] |

---

## 5. Explosion model (RealBlast): official description
From the Ubisoft dev blog "Explosions & Shrapnel in Y5S1" [U25] and Patch 5.1.0 [S27]:
1. Each explosive has its own **shape and radius**: frag radial, claymore oblong.
2. A physics query collects the entities in the shape. **Raycasts** go from the origin to each entity's *query points*: the capsule's nearest point plus 4 points on the bounding volume for operators; walls use other rules.
3. Objects with "block explosion damage" metadata stop the ray: **metal barricades, Castle panels, deployable shields**. Before Y5S1, destructible walls also capped the damage radius.
4. Damage comes from a per-explosive **distance curve**.
5. **Destruction range (RealBlast) and damage range are separate** and can differ in shape and size.
6. **Shrapnel (Y5S1+):** destructible objects no longer cap damage range. Damage is **reduced by the number of destructible objects** each ray passes. Shrapnel leaves visible holes that show the blast direction. Reduction factor per object: UNVERIFIED.
7. Y5S1 also fixed explosions in corners where hard and soft walls meet, and indestructible beams blocking destruction of soft walls nearby.

Implication for REDMOND: keep **two radii per explosive** (`destructionRadius`, `damageRadius` + curve) and a per-surface `blocksExplosionDamage` flag.

---

## 6. Reinforcement rules

| Key | Value | Status / Src |
|---|---|---|
| Who | Defenders only | [S2][S30] |
| When | Prep **and** action phase. It can be used to "quickly react to unexpected breaches". | [S2] |
| Team pool (standard 5v5 Bomb, Ranked/Unranked) | **10** shared ("the defending team will now draw from a pool of ten") | [U24][S29][S30] |
| Per-defender quota | **None** since Y5S3 (before that: 2 each, Recruit 1). "A speedy player could… reinforce more than two hatches." | [U24][O4] |
| 1v1 Arcade | **6** (Y11S2.2; was 10) | [U18][S31] |
| 3v3 Arcade (Y11S3) | UNVERIFIED | — |
| Scaling for 2v2/3v3/uneven custom teams | Not documented. PLAN §6.2 must decide (suggested: 10 for 4–5 defenders, 6 for 1–3; UNVERIFIED). | — |
| Deploy time | **4.5 s** held interact (from 5.5 s in Y5S4). Same for hatches. | [S28][S2] |
| Cancel | Releasing the key cancels and keeps the reinforcement | [S2] |
| Interrupt | Being shot does **not** interrupt. Dying before completion means it is not placed. | [S2] |
| Protection while deploying | The panel's bulletproof cover protects the defender once the panels are up. A Breach Charge set off before the anchors lock destroys the wall and likely kills the defender. | [S2] |
| Coverage | Walls are split into **2–3 equal sections**; one reinforcement covers exactly one section (no free placement). Some small walls need only one. Width = section width. | [S2] |
| Height | Fixed. Taller walls keep a **small unreinforced strip at the top** that grenades and Nitro Cells can be thrown over (e.g. Impact Grenades used to kill hard-breach gadgets). | [S2][S7] |
| Bottom | The deploy "bar" lands on the floor and **crushes gadgets under it**. No bottom gap is documented for reinforced walls. The drone/feet gap belongs to door barricades, Castle panels and Surya gates. | [S2][S3][S19][S13] |
| Gadgets/props on the wall | Deployment destroys "all gadgets and map props placed on the wall" | [S2] |
| Damaged soft wall | **Can** be reinforced, even if completely blown out (it "repairs" the opening) | [S2] |
| Destroyed reinforcement | **Cannot** be re-reinforced | [S2] |
| Destroyed hatch | **Cannot** be reinforced | [S2] |
| Mira's Black Mirror placed first | That soft wall can no longer be reinforced | [S20] |
| Gap between two reinforcements | Should seal. Y10S1 fixed "peek through a gap between reinforced walls if the soft part is destroyed"; Y3S3 fixed a Mira mirror gap. | [U29][S26] |
| What blocks reinforcing | Only the rules above are documented. Patch history treats other blocking as **bugs**: Skopós's Idle Shell blocking reinforcement (fixed Y10S2.2), map columns clipping (fixed Y10S3.2), reinforcing from far away (fixed Y3S3). Whether a *player* standing in the way blocks it: UNVERIFIED. | [U5][U8][S26] |
| Sound | Pre-punched holes in a soft wall keep sound passing through after reinforcing ("common tactic", official Y10S3.3) | [U7][S2] |
| XP (context) | 10 XP per wall | [S2] |
| Future | "Testing Grounds: Half Reinforcement" is scheduled for Y11S4 (not live). Recheck next season. | [U35] |

### 6.1 Things that can be placed on or used against reinforcements (context for our roster)
| Item | Interaction | Src |
|---|---|---|
| Mira's Black Mirror | Works on soft **or** reinforced walls, even across a reinforced/soft border. On reinforced walls only on the side the reinforcement was deployed from. Ejects that wall section. 5 s to deploy. Thermal breachers used on the reinforced wall destroy the mirror. Ubisoft's Thermite tips list Black Mirrors as a counter (exact rule UNVERIFIED). | [S20][U28] |
| Thermite Exothermic Charge | Opens reinforced walls and hatches. Remote-triggered, so it **cannot fire inside a Mute jammer's radius (2.475 m)** or while Thermite is under DSEG (EMP, E.G.S. Disruptor, **Bulletproof Camera** pulse). Destroyed by any damage, including electricity. | [S10][U10] |
| Hard Breach Charge | Placeable on reinforced surfaces; fuse-based (not remote). Mute interaction after the Y10S4 jammer rework is UNVERIFIED. | [S8][U10] |
| Fuze Cluster Charge | Drills reinforced walls and Armor Panels (1.75 s); electrified surfaces destroy it | [U19][S21] |
| Noor Horus Lance | Sticks through reinforced walls and hatches and flames both sides | [U21] |
| Bandit/Kaid electricity (not roster) | Since Y10S2 electricity is **neutral**: it destroys any electronic device touching the surface (either team) and slows operators who deploy on or vault it instead of damaging them. Kaid can electrify Castle panels (Y10S4). | [U1][U3][U10] |

---

## 7. How reinforced walls break

| Rule | Detail | Src |
|---|---|---|
| Only thermal/hard-breach tools | Exothermic, Hard Breach Charge, X-KAIROS, Breaching Torch, SELMA. Soft explosives, bullets, melee and Sledge do nothing. | [S1][S2][S9] |
| No HP for walls | Walls break **geometrically** (cut regions). There is no HP pool for walls; hatches do have one (§8). | [U10][U23] |
| Detach rule (Y10S4+) | "You need to **cut a full line** in order to cause the reinforcement to detach from the wall" | [U10] |
| Anchors | Anchors sit at the top and bottom. Cutting a line through the top **and** the bottom removes the middle. Reinforcements are not connected to their sides. | [S1][S14] |
| Adjacency | An Exothermic Charge (≈4 m destruction radius) on an adjacent perpendicular wall, or on the floor next to the wall, can destroy (part of) the reinforcement. This bypasses electrified or jammed walls. A charge on a wall next to a reinforced hatch can destroy the hatch too. | [S10] |
| Partial cuts | Small cuts make lines of sight and murder holes (Maverick-style) without detaching. Model the reinforcement as a steel cell grid with anchor rows. | [S14] |

---

## 8. Hatches

| Key | Value | Src |
|---|---|---|
| What | Floor/ceiling trapdoors; always breachable. Once destroyed, a drop-through opening. Oryx can climb up through an open hatch (5 s). | [S1][S18] |
| Size | UNVERIFIED. Placeholder 1.0 × 1.0 m opening. | — |
| Reinforce | From the **top side only**; 4.5 s; uses one pool reinforcement | [S2] |
| Unreinforced: breaking | Shotguns (1–2 blasts; Super Shorty needs an angle); slugs 1–3; DMRs ~7–10 shots; High tier guns can shoot it open; Impact Grenade 1; Frag effective; Gonne-6 1 shot; Breach Charge yes; Sledge yes (swing count UNVERIFIED, assume 1); Aruni punch 1 (Skopós shell likely 1, UNVERIFIED); Low/Medium guns "a lot of time"; normal melee UNVERIFIED. The slug count depends on how many hatch beams the slug crosses. | [S1][S7][S12][S23][S24][S13][U6] |
| Reinforced: HP pool | **1,000,000**. Damage by device: Exothermic Charge **1M**; Hard Breach Charge **1M** (only if ≥3 conical charges are on the hatch); SELMA 500k; X-KAIROS pellet 250k; Breaching Torch "~87k" per impact (Ubisoft's figure; 116 impacts per hatch implies ~8.7k, so probably a typo). Devices from different players add up. | [U23][S29] |
| Partial destruction | Reinforced hatches can be partly destroyed (Grim Sky, Y3S3); the reinforced hatch no longer "extrudes" from the floor | [S26] |
| Can't re-reinforce | A destroyed hatch cannot be reinforced | [S2] |

---

## 9. Barricades (doors and windows)

| Key | Value | Src |
|---|---|---|
| Who / count | Defenders; **unlimited** | [S3] |
| Pre-placed | All **exterior-facing** doors and windows start barricaded | [S3] |
| Deploy time | UNVERIFIED. Placeholder 2.0 s. While deploying the defender is immune to melee from the front but not to bullets or explosives. | [S3] |
| Remove (defender) | Hold interact: crowbar pries it off. The yellow fabric stays on the frame. | [S3] |
| Melee | **3 hits guaranteed** anywhere inside the fabric; fewer if already damaged. 2 hits on the boards **below a window** give a vaultable gap (useful for ambushes). | [S3] |
| Bullets | Each plank breaks on its own; the whole thing collapses once enough is gone. ~**20** AR/SMG/pistol shots. Close shotgun: a couple of shots. DMRs: <10. | [S3][O4][S24] |
| Explosives | Breach Charge, Nitro Cell, Frag, Impact and Gonne-6 destroy it. A gadget placed on a barricade that is destroyed is destroyed with it. | [S3][S1][S23] |
| Sledge | Breaks it (1 swing) | [S9] |
| Buck's Skeleton Key (context) | 3 shells for a barricade; 2–4 for a soft wall | [S17] |
| Bottom gap | Door barricades leave a gap at the bottom that **drones pass through** (and feet can be seen or shot). Window barricades hang below the sill. | [S3] |
| Vault / crouch | Vault or rappel through once enough is destroyed. Since Y10S4.1 you can crouch through a damaged barricade without destroying all of it. | [S3][U11] |
| Shields | Since Y11S1, shield operators **cannot break through full-HP barricades** by pushing. Since Y10S2 they cannot ADS while vaulting through windows or barricades. | [U14][U3] |
| Rappel breach (Y10S2+) | No Breach Charge or pre-damage needed. The attacker goes through **if the barricade is damaged enough by the end of the interaction**; otherwise they bounce back and damage it with their feet. Hammer, shotgun or explosive during the swing all work. Exception: Blackbeard cannot break undamaged barricades on rappel (Y10S3). Pre-Siege X threshold: about 2 melee hits' worth of damage. | [U3][U6][S22] |
| Noise | A distinct crumble sound when destroyed (intel) | [S3] |
| Oregon note | Y10S1 fixed a gap on the barricaded door next to **B Freezer Stairs** on Oregon | [U29] |

---

## 10. Windows / glass
- Siege X rappel changes ("breaking windows") belong to `core_mechanics.md`.
- I found no source for glass behaviour (bullets/melee shatter it? blocks drones?). **UNVERIFIED.** Placeholder: glass breaks from any bullet, melee, explosive or rappel entry, stops nothing once broken, and does not block line of sight.
- Bulletproof glass exists on some maps. Stadium Alpha/Bravo had it removed from objective sites [U35]. Whether Oregon has any: UNVERIFIED (probably none).

---

## 11. Floors, ceilings and vertical play

| Rule | Detail | Src |
|---|---|---|
| Floor class | All breachable floors are semi-breachable. Metal joists block movement **and** bullets. Explosives make bigger line-of-sight holes, **never a drop-through**. Hatches are the only vertical passages. | [S1] |
| Shooting through | Bullets pass the floor skin between joists; shoot parallel to the joists. Defenders shoot up through soft ceilings; attackers shoot down. | [S1] |
| Opening floors | Sledge (must be close to break both layers), shotguns, Buck, Impact Grenades ("create lines of sight on destructible floors"), Breach Charges, Frags, Thermite ("Hatches, floors & corners can also be breached to open bigger line of sight"). Fuze clusters drill floors. | [S9][S7][U28][S21] |
| Grenade drop trick | Throw a grenade on the floor and hammer that spot right away so the live grenade falls to the defender below (official Sledge tip) | [U27] |
| Nitro under floors | Nitro Cells stick under floors and above doorways. Damage reaches through breakable surfaces. | [S6] |
| Holding the room above | Controlling the room above a site with a soft ceiling is a core attacker goal | [O8] |
| Oregon | Which Oregon floors/ceilings are soft or hard belongs to `research/oregon/`. Not duplicated here. | — |

---

## 12. Props and metal objects

| Rule | Src |
|---|---|
| Props cannot hold Breach Charges but follow the breachable/semi/unbreakable logic. Wooden tables can be fully destroyed by explosions. Sofas can be shot through but not destroyed. | [S1] |
| Metal and concrete objects stop bullets | [S4] |
| Some objects carry "blocks explosion damage" metadata (metal barricades, Castle panels, deployable shields) | [U25] |
| Each prop hit uses one of Sledge's swings | [S9] |
| Reinforcing destroys props mounted on that wall | [S2] |
| Hibana pellets don't activate on props (context) | [S15] |
| Drone-vent blockers (luggage, and fire extinguishers used as blockers on some maps) are meant to be indestructible and non-see-through (Y9S4 fixes) | [U31] |

---

## 13. Siege X "destructible ingredients"

Introduced in Y10S2 (Siege X launch, 2025-06-10) on modernized maps only. Rollout: Bank, Clubhouse, Border, Chalet, Kafe (Y10S2); Nighthaven Labs, Consulate, Lair (Y10S3); Skyscraper, Theme Park (Y10S4); **Coastline, Villa, Oregon (Y11S1)**; Emerald Plains, Kanal, Outback (Y11S2); Stadium Alpha, Stadium Bravo, House (Y11S3). [U1][U6][U9][U13][U16][U20]
No ingredient types beyond these three appear in any Y10S2–Y11S3 notes. AI operators react to ingredients but do not use them. [U1]

### 13.1 Gas pipe (red)
| Key | Value | Status / Src |
|---|---|---|
| Trigger | Shot or damaged ("when damaged"). Explosives very likely trigger it too (UNVERIFIED). | [U2][U1] |
| Phase 1: jet | A **horizontal jet of flame** that damages players and blocks movement ("progress-inhibiting") | [U2][O1] |
| Phase 1 timing | siege.gg: full strength **10 s**, then shrinks over **5 s** (15 s total); article 1 also says 15 s | [O1][O2] (UNVERIFIED by Ubisoft) |
| Phase 2: explosion | The pipe "becomes destabilized and explodes, damaging any Operator in range" | [U1] |
| Phase 3: ground fire | "Area-denying flames", like a Goyo canister; **2 s** (siege.gg article 2) vs **3 s** (article 1). Using 2 s; conflict noted. | [U2][O1][O2] |
| Damage (jet DPS, explosion, ground fire) | UNVERIFIED | — |
| Radii (jet length, explosion, fire area) | UNVERIFIED | — |
| Ending it early | siege.gg: attackers can wait, "use half of a magazine to completely destroy the pipe", or run through taking damage. Exact rule UNVERIFIED. | [O1] |
| Neutral fire | Fire is team-neutral and destroys any device that touches it (official for fire in general) | [U1] |

### 13.2 Fire extinguisher
| Key | Value | Status / Src |
|---|---|---|
| Trigger | Shot (official). Explosives and Oryx's dash also set it off (Y10S2.0 fixed "Remah Dash will destroy the fire extinguishers **without** activating the smoke and concussion"). | [U1][U4] |
| Effect | Bursts into a **thick, lingering smoke cloud** and **concusses operators close by** | [U2][U1] |
| Smoke duration | **5 s** (siege.gg). Ubisoft only says "lingering". | [O2] (UNVERIFIED) |
| Concussion | "A few seconds" (siege.gg). Radius and duration UNVERIFIED. | [O1] |
| Sound | Explosion SFX bug fixed in Y11S1.3 | [U15] |

### 13.3 Metal detector
| Key | Value | Status / Src |
|---|---|---|
| Behaviour | "Make a loud noise when passed through" (beeping that reveals position). Presumably anyone walking through triggers it (UNVERIFIED). | [U1][O1] |
| Disable (temporary) | EMP: Impact EMP Grenade, Thatcher's E.G.S. Disruptor. Sparks show while disabled. Duration UNVERIFIED. | [U2][O1][U12] |
| Destroy (permanent) | Shooting, melee or explosives | [O1][O2] |
| Maps | Bank, Border (siege.gg), Kanal 1F Reception (Y10S4.2). **Oregon: none expected (UNVERIFIED).** | [O1][U12] |
| Roster relevance | Sledge and Striker carry Impact EMPs. Dokkaebi lost hers in Y11S3. | [U20] |

---

## 14. Debris, rubble and hole vocabulary

| Term | Meaning / rule | Src |
|---|---|---|
| Debris | Disconnected pieces fall and **disintegrate into small pieces players can move through**. No persistent rubble collision is documented. Treat debris as cosmetic (matches PLAN §8.2). | [S1] |
| Rotation ("rotate") | A defender-made passable hole between rooms or sites (shotguns, Impacts, Breach/Nitro, Sledge, Oryx). Walls *between* sites are usually left soft for rotations. | [S30] |
| Murder hole | A small hole to shoot or throw through (e.g. to throw a Nitro Cell; Mira's mirror ejects into one) | [S6][S20] |
| Line of sight hole | A hole for sightlines/cameras, not for movement | [S30] |
| Vault/crouch hole | An opening low and big enough to vault or crouch through (HBC, SELMA, damaged barricades) | [S8][S16] |
| Drone vent / drone hole | Map-authored small openings for drones (markers exist in training). Door barricades and Castle/Surya gates leave a drone gap at the bottom. | [U26][S3][S19][S13] |
| Sound holes | Pre-punched holes in walls before reinforcing, to hear through | [U7] |
| Pre-setups | Quick Match sets of "pre-deployed reinforcements… as well as pre-placed rotations and holes" per bomb site (Y8S3); reduced in Y10S2 | [U33][U1] |

---

## 15. Networking / engine context
- Siege's destruction engine is **RealBlast**, "a procedurally generated destruction system". Explosions are "calculated in a matter of milliseconds" through physics queries and raycasts. [U25]
- GDC talk: "The Art of Destruction in Rainbow Six: Siege" (Julien L'Heureux), linked from the Ubisoft dev blog [O6]. The page was reachable only by title; **I could not watch it**.
- **Is Siege's destruction server-authoritative or event-replicated? UNVERIFIED.** No reachable source says. PLAN §8.6's deterministic, server-authoritative event model (`{panelId, op, shape, params, seq}`) remains the right choice for REDMOND. It does not depend on copying Siege's internals.

---

## 16. Destruction-relevant change log (last ~5 seasons, plus foundational changes)

| Season / patch (date) | Change | Src |
|---|---|---|
| Y3S3 Grim Sky (2018) | Reinforced hatch partial destruction; hatch rework | [S26] |
| Y5S1 Void Edge (2020-03) | DMR destruction up; shrapnel explosion model; corner and beam fixes | [S27][U25] |
| Y5S3 Shadow Legacy (2020) | Pool of 10; Hard Breach Charge added; reinforced hatch 1M HP pool that devices share | [U23][U24][S29] |
| Y5S4 Neon Dawn (2020-12) | Reinforce time 4.5 s (from 5.5) | [S28] |
| Y6S3 (2021) | Fuze clusters work on reinforced surfaces | [U32] |
| Y9S2 New Blood (2024) | Detailed Weapon Stats show destruction tier; option to pre-destroy soft walls in training | [U26] |
| Y9S4.2 (2025-01) | Slug destruction reduced | [U30] |
| Y10S1 addendum (2025-03) | Gap between reinforcements fixed; Oregon B Freezer Stairs barricade gap fixed | [U29] |
| **Y10S2 Siege X (2025-06-10)** | Ingredients; revamped destructible materials on modernized maps; cleaner bullet holes; electricity neutral (no damage, slows, destroys all devices); rappel breach needs no charge; Sledge's hammer knocks down shields; shields can't ADS while vaulting barricades | [U1][U2][U3] |
| Y10S2.0 addendum / .2 | Oryx dash now triggers extinguishers; SELMA can no longer bypass electricity; Skopós shell no longer blocks reinforcing | [U4][U5] |
| Y10S3 High Stakes (2025-09) | Ingredients on Nighthaven Labs, Consulate, Lair; Blackbeard can't rappel-break undamaged barricades | [U6] |
| Y10S3.3 | Official statement: pre-damaging exterior walls improves sound (Keratos for Bandit) | [U7] |
| Y10S4 Tenfold Pursuit (2025-12) | **Reinforcement detaches only after a full cut line**; Thermite 3 charges; Hibana breach 4 s; Maverick 2 canisters; Ace lost Breach Charges; Mute jams signals (2.475 m); DSEG blocks remote triggering; Kaid can electrify Castle panels | [U10] |
| Y10S4.1 / .2 | Crouch-through damaged barricade fixed; EMP now disables Kanal's metal detectors | [U11][U12] |
| **Y11S1 Silent Hunt (2026-03)** | **Oregon, Villa, Coastline modernized with ingredients**; Skopós shell melee = Aruni's (bigger hole, destroys studs); shields can't break full-HP barricades; 1v1 Arcade (Bomb rules) | [U13][U14] |
| Y11S2 System Override (2026-06) | Ingredients on Emerald Plains, Kanal, Outback; XK23 official "Medium, no studs" | [U16][U17] |
| Y11S2.2 (2026-07-14) | 1v1 Arcade reinforcement pool 6 | [U18] |
| Y11S2.3 (2026-08-04) | Fuze drilling on reinforced/Armor Panel 1.75 s | [U19] |
| Y11S3 Split Fire (2026-09-01) | Stadium A/B and House modernized; Villa targeted update (walls/hatches/site); Noor's lance pierces surfaces; Claymore 155; Dokkaebi gets Breach Charges | [U20][U21] |
| Y11S3.1 (2026-09-22) | Exothermic 220 dmg; Sledge swing 0.8 s; Castle panel 10 melee | [U22] |
| Y11S4 (scheduled) | Testing Grounds: **Half Reinforcement** (not live) | [U35] |

---

## 17. Suggested `surfaces.json` / `destruction.json` starting values
Verified values are marked ✔. Everything else is a **placeholder** until Ulo confirms.

```
reinforcement: { poolStandard: 10 ✔, pool1v1: 6 ✔, perDefenderCap: none ✔, deploySeconds: 4.5 ✔,
                 sectionsPerWall: 2-3 (map data) ✔, topGap: per-wall (map data), bottomGap: 0 (placeholder),
                 canReinforceDamagedSoftWall: true ✔, canReReinforce: false ✔, hatchFromTopOnly: true ✔,
                 detachRule: "full cut line" ✔, anchors: [top, bottom] ✔ }
reinforcedHatch: { hp: 1000000 ✔, dmg: { exothermic: 1000000 ✔, hardBreach: 1000000 (needs ≥3 cones on hatch) ✔ } }
barricade: { meleeToBreak: 3 ✔, bulletsToBreak(AR/SMG/pistol): ~20 ✔(approx), deploySeconds: 2.0 (placeholder),
             doorBottomDroneGap: true ✔, shieldPushThroughFullHP: false ✔ }
melee: { holeShape: round ✔, holeDiameter: 0.25 m (placeholder), destroysStuds: false ✔ }
sledge: { swings: 25 ✔, swingSeconds: 0.8 ✔, holeShape: rect ✔, bothSkinsReach: ~1.0 m ✔,
          holeW×H: 0.9×1.3 m (placeholder; "passable in 1 swing" ✔) }
weaponDestructionTier: shotgunBuck=Full, slug=High(placeholder), DMR=High, LMG=Medium/High(placeholder),
                       AR=Medium ✔(XK23 example), SMG=Low/Medium, pistol=Low (revolver/.50 High) (placeholders)
wallbangDamageMultiplier: 0.7 per surface (placeholder), maxSurfaces: 2 (placeholder)
```

---

## Open questions
Each of these can be checked in a Custom Game or the Shooting Range.
- **Weapon destruction tiers**: for each of our weapons, open Loadout → weapon → Detailed Weapon Stats → Firepower → **Destruction** and note "Low/Medium/High/Full, destroys studs yes/no". Weapons: 556xi, M1014, 5.7 USG, M45 MEUSOC, ITA12S (Thermite); L85A2, M590A1, P226 Mk 25, Reaper MK2 (Sledge); AK-12, 6P41, PMM, GSh-18 (Fuze); PARA-308, CAMRS, USP40, Super Shorty (Brava); BOSG.12.2, Mk 14 EBR, XK23, C75 Auto, SMG-12, GONNE-6 (Dokkaebi); M4, M249, SR-25 (Striker); Vector .45, ITA12L (Mira); MP5K, SMG-11 (Mute); UMP45 (Pulse); SIX12 SD, T-5, Q-929 (Lesion); PCX-33, P229 (Skopós); Commando 9, M870, TCSG12 (Sentry).
- **Wallbang damage**: shoot a teammate or target through one soft wall, then two, with an AR. What fraction of the damage lands? Can a bullet pass two walls?
- **Hatch**: how many normal melee hits (standing on it) open an unreinforced hatch? Does one Sledge swing open it? Rough hatch opening size (e.g. in operator widths)?
- **Barricade** deploy time in seconds (stopwatch from pressing to done). Does glass break before the barricade and does it block anything?
- **Hole sizes**: in the Shooting Range or a Custom Game, roughly how big (in operator widths/heights) is the hole from a Breach Charge, Impact Grenade, Nitro Cell, Exothermic Charge, Hard Breach Charge and one Sledge swing? A screenshot of each is ideal.
- Does a reinforced wall have **any** gap at the bottom (can you shoot feet under one)? Do any bars stay after a partial Thermite cut?
- Can you reinforce while a teammate or enemy gadget is in the way? Can a defender reinforce a hatch while an attacker stands on it?
- **Gas pipe**: damage per second of the jet, damage of the final explosion, jet length, and whether shooting it more ends the flame early. **Fire extinguisher**: concussion radius and duration, smoke duration (5 s?). Do explosives or melee trigger both?
- **Oregon ingredients**: where are Oregon's gas pipes and extinguishers after the Y11S1 modernization? (Cross-reference with the oregon research files.) Any metal detectors on Oregon?
- Reinforcement pool for **3v3 Arcade** and any **Custom Game** reinforcement-count setting (helps PLAN §6.2 scaling).
- Does the Y10S4 Mute rework still stop a **Hard Breach Charge** (fuse, not remote)?
- Does Skopós's shell punch open a hatch or barricade in one hit like Aruni's?
- Is Siege's destruction server-authoritative (worth watching the GDC talk [O6] if the implementer wants engine context)?

## Sources
Fandom wiki (read through its MediaWiki API):
- [S1] https://rainbowsix.fandom.com/wiki/Destruction: breachable/semi/unbreakable classes, charge light colours, studs, micro-destruction, destruction tiers, barricade 3 hits, props
- [S2] https://rainbowsix.fandom.com/wiki/Reinforcement: pool, 4.5 s, sections, top gap, bar crushes gadgets, damaged/destroyed rules, hatch from top, sound tactic, protection
- [S3] https://rainbowsix.fandom.com/wiki/Barricade: unlimited, pre-placed, 3 melee, ~20 bullets, drone gap, crowbar removal, trivia
- [S4] https://rainbowsix.fandom.com/wiki/Bullet_Penetration: what is penetrable, caliber and hole size, limb penetration classes
- [S5] https://rainbowsix.fandom.com/wiki/Breach_Charge/Siege: breach behaviour, indicator lights, damage zones, rappel entry
- [S6] https://rainbowsix.fandom.com/wiki/C4/Siege: Nitro Cell (Siege tab) damage and placement
- [S7] https://rainbowsix.fandom.com/wiki/Impact_Grenade: walk-through hole, hatches, floors, over-reinforcement trick
- [S8] https://rainbowsix.fandom.com/wiki/Hard_Breach_Charge: 2 s/4 s, small square hole, crouch/vault, users
- [S9] https://rainbowsix.fandom.com/wiki/Sledge_(Siege): rectangular hole, 25 charges, 1 m reach, props, reinforced
- [S10] https://rainbowsix.fandom.com/wiki/Thermite_(Siege): 3 charges, ~3 s deploy and heat-up, 4 m radius, adjacency tricks
- [S11] https://rainbowsix.fandom.com/wiki/Claymore/Siege: blast arc and damage (context)
- [S12] https://rainbowsix.fandom.com/wiki/Frag_Grenade/Siege: breaches hatches, unreliable on walls
- [S13] https://rainbowsix.fandom.com/wiki/Aruni: punch hole size, destroys studs, 1-hit hatch/barricade; Surya gate on beams; bottom gap
- [S14] https://rainbowsix.fandom.com/wiki/Maverick: anchors, cut top+bottom rule, hatch health pool
- [S15] https://rainbowsix.fandom.com/wiki/Hibana_(Siege): pellets, 4 s breach, props (context)
- [S16] https://rainbowsix.fandom.com/wiki/Ace: SELMA vault/crouch hole, 2 per hatch (context)
- [S17] https://rainbowsix.fandom.com/wiki/Buck: Skeleton Key 3 shells barricade, 2–4 soft wall
- [S18] https://rainbowsix.fandom.com/wiki/Oryx: dash through soft walls and barricades, hatch climb 5 s
- [S19] https://rainbowsix.fandom.com/wiki/Castle: Armor Panel melee and drone gap
- [S20] https://rainbowsix.fandom.com/wiki/Mira_(Siege): Black Mirror placement and reinforcement interaction
- [S21] https://rainbowsix.fandom.com/wiki/Fuze_(Siege): Cluster Charge behaviour
- [S22] https://rainbowsix.fandom.com/wiki/Grappling_Hook: pre-Siege X rappel-into-barricade threshold (2 melee)
- [S23] https://rainbowsix.fandom.com/wiki/GONNE-6: small wall hole, 1-shot hatch, barricades
- [S24] https://rainbowsix.fandom.com/wiki/BOSG.12.2 , https://rainbowsix.fandom.com/wiki/TCSG12 , https://rainbowsix.fandom.com/wiki/Mk_14_EBR , https://rainbowsix.fandom.com/wiki/SR-25 , https://rainbowsix.fandom.com/wiki/L1A1 (CAMRS): slug and DMR hatch/barricade shot counts, double-layer beams
- [S25] https://rainbowsix.fandom.com/wiki/Tom_Clancy%27s_Rainbow_Six_Siege_X: engine "Anvil-Next/Realblast", damage reduced through structures
- [S26] https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_3.3.0: reinforced hatch partial destruction, related fixes
- [S27] https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_5.1.0: DMR destruction, shrapnel, corner and beam fixes
- [S28] https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_5.4.0: reinforce 4.5 s (from 5.5)
- [S29] https://rainbowsix.fandom.com/wiki/Tom_Clancy%27s_Rainbow_Six_Siege:_Operation_Shadow_Legacy: pool of 10, combined hard breach on hatches
- [S30] https://rainbowsix.fandom.com/wiki/Rank_Up_Newcomer_Series:_Reinforcement_and_Destruction: official Ubisoft Gameplan transcript on soft/hard destruction, rotates, pool of 10
- [S31] https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.2.2: 1v1 Arcade settings (pool 6)

Ubisoft (official):
- [U1] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/daybreak: Y10S2 ingredients, electricity neutral, cleaner bullet holes, AI and ingredients, Quick Match pre-setups
- [U2] https://news.ubisoft.com/en-us/article/55e9bGaVCdO52trbclOhpf/rainbow-six-siege-x-showcase-everything-you-need-to-know: ingredient descriptions, revamped destructible materials
- [U3] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes: rappel breach rule, electricity, Sledge vs shields, shield vault ADS, caliber groups
- [U4] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/ixjnXu9g80eFVW3X7cNFF/y10s20-patch-notes-addendum: Oryx/extinguisher and SELMA/electricity fixes
- [U5] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3owjfmZ0uv2zFYU99TpkSw/y10s22-patch-notes: Skopós shell blocking reinforcement fix
- [U6] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/highstakes: Y10S3 ingredient maps, Blackbeard barricades, Oryx needs a shotgun for hatches
- [U7] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/4RsdLNZbYZ3wIrcgaDpkuF/y10s33-patch-notes: pre-damaging exterior walls for sound, Keratos
- [U8] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/37BPFK3ZKisFFeRzq7mpPc/y10s32-patch-notes: reinforcement clipping and metal stud fixes
- [U9] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/tenfoldpursuit: Y10S4 ingredient maps
- [U10] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes: full-line detach rule, hard breacher changes, Mute 2.475 m, DSEG, Kaid on panels
- [U11] https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/3aYq6D0VHo1HJ5ZNfLtiNs/y10s41-patch-notes: crouch-through barricade fix
- [U12] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3HSeMj81P0CL3m0N8FS5tK/y10s42-patch-notes: EMP vs metal detectors (Kanal)
- [U13] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/silenthunt: Oregon/Villa/Coastline modernized with ingredients; Skopós; shields vs barricades
- [U14] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5fWCjoCU8toUJiBdMSj0UA/y11s1-designers-notes: Skopós melee "bigger hole and destroys wood studs"; shields can't break full-HP barricades
- [U15] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/4QxsAbVufpV8j2TCybpb5Z/y11s13-patch-notes: extinguisher SFX fix
- [U16] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/systemoverride: Y11S2 ingredient maps
- [U17] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2MNhboDBmsQKkWb5p8zqsg/y11s2-designers-notes: XK23 "Destruction: Medium, does not destroy studs"
- [U18] https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/3IoMKS8f3AHlOwBQXfiytt/y11s22-midseason-patch-notes: 1v1 Arcade pool 10→6
- [U19] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2EIn06EmkAIG7su2fpITue/y11s23-patch-notes: Fuze 1.75 s on reinforced surfaces
- [U20] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/splitfire: Y11S3 modernized maps, Villa update, Noor, Claymore 155, Dokkaebi Breach Charges
- [U21] https://news.ubisoft.com/en-us/article/4qqpGJZSWrrS3Ko2hYvviK/rainbow-six-siege-operation-split-fire-new-operator-noor-3v3-arcade-mode-wasteland-circuit-event-and-more: Horus Lance through soft/reinforced surfaces; frames can't be penetrated
- [U22] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes: Exothermic 220 dmg, Sledge 0.8 s, Armor Panel 10 melee
- [U23] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2LqpNY95OdSdWBB8SBEmbg/y5s3-preseason-designers-notes: hatch 1M HP pool and per-device damage; HBC launch values; HBC hole crouch/vault
- [U24] https://news.ubisoft.com/en-us/article/2r5hr884VuucgwjWXk0Nty/rainbow-six-siege-operation-shadow-legacy-operator-map-and-gameplay-update-guide: pool of 10 (was 2 each), HBC vault hole
- [U25] https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/1QkezaGoRkDWqcQ6duGvtk/dev-blog-explosions-shrapnel-in-y5s1: RealBlast explosion pipeline, blockers, destruction vs damage range, shrapnel
- [U26] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/newblood: Detailed Weapon Stats with Destruction; pre-destroyed soft walls option; drone vent markers
- [U27] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/sledge: 1 swing passable, 2 swings for shields, grenade+hammer floor trick, rappel use
- [U28] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/thermite: counters; larger destruction range; hatches/floors/corners
- [U29] https://store.steampowered.com/news/app/359550/view/1792751526171791: Y10S1 Patch Notes Addendum (official, Steam mirror): reinforcement gap fix, Oregon B Freezer Stairs barricade gap fix
- [U30] https://store.steampowered.com/news/app/359550/view/1789039014494961: Y9S4.2 Patch Notes (Steam mirror): "Slug's destruction reduced" under Weapon Calibers
- [U31] https://store.steampowered.com/news/app/359550/view/1784506359218198: Y9S4 Patch Notes Addendum (Steam mirror): drone-vent blocker, barricade and hatch fixes
- [U32] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2zsUnVBdSsc10rirkPl1K5/y6s3-preseason-designers-notes: Fuze clusters on reinforced surfaces
- [U33] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2Btj0mP7e7gVKIODGSLuiX/y8s3-designers-notes: Quick Match pre-setups (pre-deployed reinforcements, rotations, holes); Fuze on Deployable/Talon shields
- [U35] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/roadmap: Half Reinforcement testing (Y11S4), targeted map updates, Stadium bulletproof glass removal

Other (lower priority):
- [O1] https://siege.gg/news/destructible-ingredients-to-change-the-game-in-siege-x: gas pipe 15 s + 3 s, extinguisher concussion, metal detector EMP/destroy, map list
- [O2] https://siege.gg/news/rainbow-six-siege-x-allow-players-to-use-fire-extinguishers-gas-pipes-and-more: gas pipe 10 s + 5 s + 2 s; extinguisher smoke 5 s
- [O3] https://siege.gg/news/the-wallbang-meta-mastering-common-pre-fire-spots-in-the-2026-map-pool: "30–50%" wallbang loss (unsourced; low reliability)
- [O4] https://www.esportstales.com/rainbow-six-siege/reinforcement-and-barricade-placements-strategy-guide: 2018 guide (old 2-per-defender rule, barricade 3 melee / ~20 bullets)
- [O5] https://steamcommunity.com/app/359550/discussions/0/1483235412198952016/ , https://steamcommunity.com/app/359550/discussions/0/1489987634005439074/ , https://steamcommunity.com/app/359550/discussions/0/2951503378095265659/: community claims (50% wall loss, all guns penetrate soft walls, LMG and revolver destruction, break patterns). Low reliability.
- [O6] https://www.youtube.com/watch?v=SjkQxowsL0I: GDC "The Art of Destruction in Rainbow Six: Siege" (title confirmed through YouTube oEmbed; linked from [U25]; not watched)
- [O7] https://www.youtube.com/watch?v=ELrtKTGiI84: Ubisoft "R6 Siege X: Environmental Destruction" (title only; not watched)
- [O8] https://r6siegecenter.com/guides/operators/attackers/sledge/: 25 swings; controlling the room above the site
