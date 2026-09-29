# Intel Systems — Drones, Cameras, Pings, Spectating, Audio
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29
Confidence: medium — the *rules and behaviours* are well sourced (official Ubisoft season pages/Designer's Notes through Y11S3.1, plus Fandom), but Ubisoft does not publish most *numbers* for this layer (drone speed, jump height, hitbox, FOV, ping durations, camera rotation limits). Those are marked UNVERIFIED with clearly labelled placeholders.

Scope: PLAN.md §2.1 (`research/intel.md` row) and §10. Cross-references (owned by other research files, only summarised here):
- Timers (prep 45 s, action phase, etc.) → `research/round_flow.md`
- Gadget stat blocks (Bulletproof Camera, Observation Blocker, Proximity Alarm…) → `research/gadgets.md`
- Operator abilities (Mute jammer, Pulse, Mira, Skopós, Dokkaebi, Brava, Sentry…) → `research/operators/*.md`
- Footstep volumes / movement noise → `research/core_mechanics.md`
- Oregon's actual default-camera positions → `research/oregon/`

Legend: **Verified** = has a source below. **UNVERIFIED** = no reachable source; placeholder values are labelled `PLACEHOLDER` and must not be treated as Siege facts.

---

## 1. Attacker drones (standard "reconnaissance" drone)

### 1.1 Core values
| key | value | unit | verified | source / note |
|---|---|---|---|---|
| drones_per_attacker | 2 | count | yes | Fandom Drone (`maxammo = 2`); Ubisoft Gameplan transcript ("Each Operator has 2 drones"); siege.gg drone guide (Feb 2026). No change found in Y10S2–Y11S3 notes. |
| drones_deployed_simultaneously | 2 (both may be out at once) | count | yes | Fandom Drone patch history (Update 2.3.0, 2017). |
| exceptions | Twitch: standard drone in prep, Shock Drones in action; Flores: 2 standard + RCE-Ratero; Brava: see her file | — | yes | Crystal Guard (Y6S3) official notes; siege.gg drone guide. Not in our roster except Brava → `operators/brava.md`. |
| health | destroyed by **one hit from any damage source except fall damage** (bullets, melee, explosives, lasers, fire, electricity) | — | yes (Fandom) | Fandom Drone. Implement as `hp = 1`, `immune_to = [fall]`. |
| jump | yes, spring jump | — | yes | Fandom Drone. |
| jump_cooldown | 3 | s | yes (Fandom only) | Fandom Drone ("three second cooldown in-between jumps"). Not in official notes; Ulo should confirm feel. |
| jump_height | **UNVERIFIED** — PLACEHOLDER 1.0 | m | UNVERIFIED | Should clear a window sill / table; tune by feel. |
| jump_trajectory_preview | toggleable arc preview when stationary (all drones except Echo's & Flores's) | — | yes | Collision Point (Y9S4) official notes. |
| jump_landing | "sticky" landings (no slide); jump allowed a few frames after rolling off a ledge (coyote time) | — | yes | Collision Point (Y9S4) official notes. |
| move_speed | **UNVERIFIED** — PLACEHOLDER 4.0 | m/s | UNVERIFIED | Not published anywhere reachable. |
| strafe | drone strafes (mecanum-style wheels); full speed in all directions incl. diagonals (controller parity fix) | — | yes | Solar Raid (Y7S4) official notes; Fandom trivia (mecanum wheels). |
| speed_boost | a **speed boost resource** (short-duration speed increase) on standard drones | — | yes (exists) | Twin Shells (Y9S3) official notes. Boost multiplier/duration/recharge **UNVERIFIED** (PLACEHOLDER ×1.5 for 2 s, 10 s recharge). |
| hitbox | small; fits under door barricades and through drone vents | — | behaviour yes, size UNVERIFIED | PLACEHOLDER box 0.22 W × 0.12 H × 0.18 L m. Must be smaller than the map's drone-vent openings. |
| battery / time limit | **none documented** for attacker drones (Extraction's drone has a battery; Siege's does not per all sources read) | — | UNVERIFIED (absence) | Only *defender* drones (Echo, Mozzie-hacked) lose signal after 10 s outdoors (Y6S4 DN; Demon Veil Y7S1). |
| outdoors | attacker drones work outdoors without limit | — | yes (implied) | Only defender observation tools have the 10 s outdoor limit (Y6S4 official). |
| noise | audible motor while moving; louder on jump and landing; destruction has its own SFX | — | yes | Fandom Drone; Y10S2.3 fix "Sound effects don't play when a drone is destroyed"; Y9S4 addendum fix on landing SFX. |
| light (LED) | lights up when in use (see §3.3 for colour rules) | — | yes | Fandom Drone; Phantom Sight (Y4S2) official notes. |

### 1.2 Deployment and lifecycle
| rule | detail | verified | source |
|---|---|---|---|
| Prep phase start | Each attacker is placed directly into their **first** drone at the start of prep; it spawns outside the building on the same side as the attacker's first selected spawn point (not random since Y5S1). | yes | Fandom Drone; Void Edge (Y5S1) official notes. |
| Prep phase duration | 45 s in Ranked/Unranked/Quick Match; 30 s in 3v3 Arcade; reduced in 1v1 Arcade | yes | Daybreak (QM 35→45 s); Split Fire (3v3); Y11S2 mid-season (1v1). Exact values → `round_flow.md`. |
| Attackers during prep | Cannot enter the building; only drones. Defenders may shoot drones during prep. | yes | Fandom Planning Phase; Gameplan "Intel 101" ("never worth it to lose your drone in the prep phase"). |
| End of prep | Player returns to their operator at spawn; parked drones stay where they are. Option **"Drone after Prep"** keeps the player in the drone view when prep ends. | yes | Fandom Drone; Void Edge (Y5S1) official notes. |
| Action phase deploy | Operator **throws** the drone (can reach higher places than a floor placement). Can deploy anywhere the operator is, including while rappelling? → deploy-on-rappel UNVERIFIED; **pick-up while rappelling is allowed** (Y9S2). | yes / partly | Fandom Drone; New Blood (Y9S2) official notes. |
| Pick up | A surviving drone can be picked up and redeployed "at any time". Fandom says only by **the owning attacker**. | yes (Fandom + Gameplan) | Fandom Drone; Gameplan "Intro to Drones". Non-owner pick-up: UNVERIFIED (assume not allowed). |
| Switching | Observation-tool UI lists every available feed as icons; any attacker can **view** teammates' drones (e.g. during prep while preserving their own). | yes | Dev Blog – Observation Tool changes (2018). |
| Control ownership | Only the owner **drives** their drone. Feed colour shows control level: full colour = full control, desaturated = partial control, black & white = no control (someone else has priority). | yes | New Blood (Y9S2) official notes; Fandom CCTV trivia. Exact meaning of "partial" (look-around but no driving?) UNVERIFIED. |
| Owner dies | Drones stay in the world. The **dead owner can keep driving their own drones** (support mode). Teammates can still view them. | yes (Fandom); officially trialled as "Gameplay After Death" in Y6S2 TS | Fandom Drone ("only by the Operator that owns it"); North Star (Y6S2) TS note; Y10S2.1 bug-fix text references piloting a drone after death. |
| Drone counter | Defenders get an on-screen count of **regular** drones destroyed by defenders or captured by Mozzie (special drones, attacker-destroyed and disabled drones don't count). Toggle in HUD options. | yes | Y6S4 Designer's Notes; High Calibre notes. |

### 1.3 Traversal: where a drone can go
| path | allowed | verified | source |
|---|---|---|---|
| Open doorways / windows (unbarricaded) | yes | yes | Fandom Drone |
| **Under door barricades** (gap at the bottom) | yes | yes | Fandom Drone ("under barricaded … doorways") |
| **Drone vents** (small map openings, "drone holes") | yes; map-specific network (Casino has an "expanded drone vent network") | yes | Fandom Drone; System Override (Y11S2) notes. Some vents are blocked by props (luggage, extinguishers) that can be destroyed (Y9S4 addendum fixes). |
| Holes created in destroyed soft walls/floors/barricades | yes if the opening is large enough for the hitbox | behaviour yes, min size UNVERIFIED | Fandom Drone; Gameplan. PLACEHOLDER: require opening ≥ hitbox + 2 cm. |
| Through bullet holes (sight only) | Since Y6S2, line of sight through bullet holes in **soft surfaces** is blocked (thin glass/barricades excepted) — applies to drones' view too | yes (Y6S2); current status → `destruction.md` | North Star (Y6S2) official notes. |
| Guidance overlay | Optional HUD markers for stairs, **drone vents** and hatches exist (training/guidance settings) | yes | New Blood (Y9S2); Y10S1 addendum ("drone vent option"). |

### 1.4 What kills / disables / steals a drone (generic + our roster)
| source | effect on drone | verified | source |
|---|---|---|---|
| Any bullet / melee / explosion | destroyed (1 hit) | yes | Fandom Drone |
| Fall damage | no effect | yes | Fandom Drone |
| Electricity (Bandit/Kaid, electrified wire/walls) | destroys electronic gadgets of **both** teams (neutral since Siege X) | yes | Daybreak (Y10S2) notes & Designer's Notes |
| Mute Signal Disruptor | drone stops working inside radius; feed shows **static**; static warning at the edge. Radius **2.6 m** (Y11S2.3, was 2.475 m), spherical since Y6S3 | yes | Fandom Mute; Y11S2.3 patch notes; Crystal Guard notes → `operators/mute.md` |
| Bulletproof Camera EMP / Thatcher E.G.S. / EMP grenade | Disabled State for Electronic Gadgets (DSEG), temporary | yes | Y6S4 DN; Y10S4 DN |
| Mozzie Pest | hijacked for defenders (blue light); range 1.75 m (Y11S2) | yes | Fandom Mozzie; System Override notes (context only) |
| Maestro laser, Aruni gate, Wamai etc. | destroy/zap | yes | Fandom Maestro; Neon Dawn (context only) |
| Observation Blocker | drone cannot see through the barrier (not damaged) | yes | Dread Factor (Y8S2) notes; Fandom |

### 1.5 Drone view UI
| element | behaviour | verified | source |
|---|---|---|---|
| Feed tint | full colour / desaturated / B&W = full / partial / no control | yes | New Blood (Y9S2) |
| FOV | **UNVERIFIED** — PLACEHOLDER 90° horizontal | UNVERIFIED | — |
| Zoom | **UNVERIFIED** (no source says standard drones zoom) — PLACEHOLDER: none | UNVERIFIED | — |
| Look/pitch | camera can look around while driving; limited rotation when only viewing | partly | Fandom Drone ("monochrome with limited rotation" when not in control) — pre-Y9S2 wording |
| Scan | hold scan input ~1 s → spot enemies under the crosshair (see §2.2) | yes | Fandom Drone/CCTV |
| Yellow/contextual ping | from centre of view (see §2.1) | yes | Shadow Legacy (Y5S3) |
| Jammer | static overlay as warning when entering a Signal Disruptor radius; full static/disabled inside | yes | Fandom Mute |
| Vigil (cloaked) nearby | white interference around feed borders within 12 m; drone LED turns white; Vigil invisible | yes (Fandom, pre-Siege X) | Fandom Drone; Phantom Sight notes (white LED) |
| Nøkk (HEL active) | invisible to drones/cameras | yes | Phantom Sight (Y4S2); Twin Shells (context) |
| Mozzie Pest proximity | warning icon pulses faster the closer the drone is to a Pest | yes | Crimson Heist (Y6S1) |
| Night-vision / thermal | none on standard drones (Bulletproof Camera has heat vision; see §4) | UNVERIFIED (absence) | — |
| Audio while on a drone | UNVERIFIED whether you hear from the drone's position; confirmed for cameras (§3.4) | UNVERIFIED | Gameplan transcript (cameras) |

---

## 2. Marking, pinging, spotting

### 2.1 Ping types (Ping 2.0 + Siege X)
| ping | input (PC default) | who sees | enemy notified? | behaviour | verified | source |
|---|---|---|---|---|---|---|
| Yellow / contextual ("smart") ping | Z (tap) | own team only; visible **map-wide through walls**; shown on compass with height indicator | **no** (silent) | Numbered per player (number assigned at match start). If it hits an object of interest (gadget, camera, drone, defuser…) the icon changes to that item; friendly gadgets = blue marker, enemy = red marker. Pinging an **enemy operator's unique gadget reveals (identifies) that operator** to your whole team. | yes | Shadow Legacy (Y5S3) official; Fandom Ping 2.0/Drone/CCTV; Gameplan "Non-Verbal Communication"; High Calibre (compass) |
| Red ping (spot) on an enemy | X (per Gameplan video; current default after the Y11S3 input overhaul UNVERIFIED) | own team; red marker at the enemy's feet, map-wide through walls; **last known position only (does not follow)** | **yes** ("spotted" alert) | Manual spot of an enemy operator in view. | yes | Gameplan "Non-Verbal Communication"; siege.gg yellow-ping article |
| Danger ping | double-tap yellow ping (optional setting, Y11S2) or comm-wheel "Danger" | own team | UNVERIFIED (assume no) | Location warning marker. | yes (exists) | System Override (Y11S2) "Ping improvements"; hardcoregamer (wheel option) |
| Comm-wheel pings | hold wheel input (see §2.3) | own team | no | Preset messages placed in the world. | yes | Daybreak; Siege X showcase |

Other ping rules:
- Pings can be placed while alive **or eliminated**, in person or from any drone/camera. (Shadow Legacy official.)
- The ping reticle can be hidden in options; on controller the default ping input was swapped with fire-mode swap. (Shadow Legacy.)
- Markers (pings, objectives, run-outs) stick to the screen edge when off-screen (Solar Raid Y7S4); compass shows pings + height difference (High Calibre Y6S4).
- Ping colour and objective-marker colour are customisable; ping double-tap speed configurable; comm-wheel prompts and smart pings can be converted to text; ping-to-text shows the ping location (Y11S2, Y11S3 accessibility list).
- A pinged enemy killed by a teammate grants the pinger an **assist** (implied by Y10S2.1 fix "Players don't receive Assist score points when an enemy they pinged is killed by an ally").
- **Durations — UNVERIFIED.** Only historical data: the pre-2020 ping lasted 8 s with a 5 s cooldown and one ping at a time (Fandom Ping trivia — outdated). Community forum claims (2020 test server) of ~2–2.5 s for spammed yellow pings are not reliable. PLACEHOLDERS: yellow ping 5 s, red spot 5 s, danger ping 5 s, max 1 active yellow ping per player (new one replaces old). Ask Ulo.
- Cooldown / anti-spam — UNVERIFIED (a Y10S4.2 fix mentions AI "contextual pings with no cooldown", implying players have one). PLACEHOLDER 0.5 s.

### 2.2 Scanning (observation-tool spotting)
| key | value | verified | source |
|---|---|---|---|
| Tools that can scan | drones, default cameras, Bulletproof Cameras, operator cameras (Valkyrie, Maestro, …) — "same spotting mechanic" | yes | Fandom Drone, CCTV, Bulletproof Camera |
| Input | hold scan button | yes | Fandom |
| Hold time | ~1 s ("around one full second") | yes (Fandom) | Fandom Drone/CCTV |
| Active vs passive | works both when driving/controlling and when passively viewing a feed | yes | Fandom |
| Target condition | enemy must be visible and inside the view's crosshair area | yes (Fandom wording) | Fandom. Exact cone/radius UNVERIFIED — PLACEHOLDER: within 10° of centre, unobstructed. |
| Result | red ping at the enemy's feet for all teammates, visible through walls; target gets a red "SPOTTED" HUD alert (Fandom text: "SPOTTED BY SCAN" — current exact wording UNVERIFIED) | yes | Fandom; Gameplan "Intro to Drones" ("You've been spotted") |
| Identification | if the enemy was unidentified ("?" icon in the top HUD), scanning identifies them | yes | Fandom Drone/CCTV |
| Blocked by | Observation Blocker screen; Nøkk HEL; Vigil cloak (for drones); smoke (except Bulletproof Camera / Evil Eye); DSEG (tool access blocked) | yes | see §5 sources |

### 2.3 Siege X Communication Wheel (Y10S2, June 2025)
| key | value | verified | source |
|---|---|---|---|
| What it is | Non-verbal preset pings/messages placed in the environment for teammates ("Chat Wheel" in one Ubisoft post) | yes | Daybreak season page; Siege X showcase; ShieldGuard Y10S2 update |
| Known options | **Breach**, **Area Clear**, **Help**, **Danger**, a **thank-you** message | partly (secondary sources) | hardcoregamer.com Siege X tips; siege.gg (showcase screenshot description) |
| Full option list / count / layout | **UNVERIFIED** — PLACEHOLDER 8 slots: Danger, Breach Here, Area Clear, Need Help, Rotating, Defend/Hold Here, Thanks, Acknowledge | UNVERIFIED | Ask Ulo for a screenshot. |
| Input | Hold-to-open radial (PC default reported as holding the ping key Z; D-pad Right on console). Since Y11S1 players report yellow ping stuck on Z while the wheel is separately rebindable. Y11S3 added Press/Hold/Toggle options for inputs. | partly | keymap.io snippet (search result); Steam discussion (Mar 2026); Y11S3 accessibility article |
| Visibility | own team only; can be converted to text | yes | Accessibility spotlight (Sept 2026) |

### 2.4 Detection / "revealed" state & HUD (generic)
| element | behaviour | verified | source |
|---|---|---|---|
| Enemy roster bar | Top-of-HUD enemy operator icons show "?" until identified (scan/spot, pinging their gadget, kill, operator abilities). +10 score to all when a new enemy is identified. | yes (Fandom) | Fandom Drone (scanning + trivia) |
| Spotted / revealed | Red marker on last known position, visible through walls to the spotting team; target is alerted. Operator abilities (Pulse, Jackal, Lion, Dokkaebi calls, etc.) produce their own reveal pings — see operator files. | yes | Fandom; Gameplan |
| "Spotted" is a shared state | e.g. Deimos requires a target "spotted by either himself or a teammate" | yes | Y11S2 Designer's Notes |
| Enemy outline (Siege X) | **New Outline System**: enemies in your line of sight are outlined so they can't hide in shadows (design emphasis shifts to *noise* over visibility). Supersedes the Y6S3 optional "opponent rim light". No reversal found in notes through Y11S3.1. | yes | Daybreak (Y10S2) season page; Crystal Guard (Y6S3) |
| First-person shadows (Siege X) | Your own shadow is rendered and can give away your position around corners. | yes | Daybreak; Siege X showcase |
| Teammate outlines | teammates' outlines are visible to you through walls | yes | Gameplan "Non-Verbal Communication" |
| Death markers | Eliminated operators leave a **transparent operator icon** in place of the body for the rest of the round (Y6S2); teammates' deaths show a skull icon | yes | North Star (Y6S2) notes; Gameplan |
| Minimap | Exists in Dual Front, bot/training playlists (Y10S4) and **Quick Match (Y11S3)**; hideable in guidance settings. Not in Ranked/Unranked (implied). Shows walls, stairs, windows, destructible walls, hatches per floor. | yes | Y10S4 season notes; Split Fire (Y11S3); Y10S2 addendum (Dual Front minimap) |
| Objective discovery | Ranked/Unranked: attackers must locate the objective (drones detect it on sight; IQ can reveal it). **Quick Match: objective auto-revealed for attackers** (Y8S3). 1v1 Arcade: bomb sites auto-revealed (Y11S2 mid-season). Discovered site markers stay on HUD after defuser drop (Y7S4). | yes | Heavy Mettle / Y8S3 DN; Y11S2 mid-season; Void Edge (IQ); Solar Raid; Y5S3 fix "objective scan detection by drone" |
| Out-of-bounds detection | Defenders detected outdoors are revealed → rules in `round_flow.md` | — | Y10S4.2 fix references "Operators are detected outdoors" |

---

## 3. Default cameras (map CCTV)

### 3.1 Values
| key | value | unit | verified | source |
|---|---|---|---|---|
| count per map | varies by map; interior + exterior cams on most maps (Tower and Presidential Plane have no exterior cams) | count | yes (rule) | Fandom CCTV |
| legacy counts (for scale only) | 5–8 per map in r6maps.com data; **Oregon (legacy, pre-rework/modernization): 7 = Armory Corridor 2F, Lobby 1F, Dining Hall Corridor 1F, Rear Stage 1F + exterior Junkyard, Parking, Construction Site** | count | **outdated — do not use for the build** | r6maps.com `main.min.js` (release 2.4.1). Current Oregon cams → `research/oregon/`. |
| health | destroyed "instantly by gunfire" — treat as 1 HP, any damage type | HP | yes (Fandom) | Fandom CCTV |
| bulletproof | no | — | yes | Fandom CCTV |
| rotation | rotate "only in a fixed radius"; narrower range, slower turn rate and narrower FOV than Valkyrie's Black Eye (which reaches ~180° H and V) | — | yes (qualitative) | Fandom CCTV; Fandom Valkyrie |
| yaw / pitch limits | **UNVERIFIED** — PLACEHOLDER yaw ±60° from the authored centre, pitch −60°…+10° (ceiling mount); author per camera in map data | deg | UNVERIFIED | — |
| rotation speed | **UNVERIFIED** — PLACEHOLDER 60°/s | deg/s | UNVERIFIED | — |
| FOV | **UNVERIFIED** — PLACEHOLDER 70° horizontal | deg | UNVERIFIED | — |
| zoom | **UNVERIFIED** (not documented for default cams) — PLACEHOLDER: none | — | UNVERIFIED | Ask Ulo. |
| scan / ping | yes (same as drones, §2) | — | yes | Fandom CCTV |
| friendly fire | defenders shooting their own cams lose 10 score (team gadget) except when hacked by Dokkaebi | pts | yes (Fandom, may be old) | Fandom CCTV |

### 3.2 How cameras are destroyed / denied
| by | effect | verified | source |
|---|---|---|---|
| Any bullet (attackers pre-shoot cams from outside at round start) | destroyed | yes | Fandom CCTV; Gameplan "Intel 101" (defenders read attack direction from which cams are shot first) |
| Melee / explosives | destroyed (any damage) | UNVERIFIED specifics (follows "any damage") | — |
| Twitch Shock Drone laser | destroyed (needs LOS) | yes | Fandom CCTV |
| Thatcher EMP / E.G.S. Disruptor | temporarily disabled (DSEG) | yes | Fandom CCTV; Tenfold Pursuit (Y10S4) |
| Brava Kludge Drone | hacks the cam: defenders lose it, attackers gain the feed | yes | Fandom CCTV → `operators/brava.md` |
| Dokkaebi (Y11S2 remaster) | hacks the phones of **eliminated** defenders → attackers access defender camera feeds for **20 s** per hack, **infinite range, no LOS needed**; cams show attacker colour while used by attackers | yes | Y11S2 Designer's Notes; Fandom Dokkaebi → `operators/dokkaebi.md` |
| Pinging a camera | yes — contextual yellow ping shows a camera icon so teammates can find/shoot it ("ping-shooting") | yes | Fandom Ping 2.0 ("cameras" among contextual icons) |
| Shooting a cam through a soft wall after pinging it | physically possible if penetration allows — UNVERIFIED as a Siege-specific rule | UNVERIFIED | → `destruction.md` for penetration |

### 3.3 Indicator light ("is someone on this cam?")
| era | rule | verified | source |
|---|---|---|---|
| Y4S2 → | Observation-tool LEDs light up **when the tool is in use**: defender-controlled = **blue**, attacker-controlled = **yellow**, under Vigil/Nøkk effect = **white**. Applies to regular cams, Valkyrie cams, drones, Maestro turrets, Twitch drones, Mozzie drones, Bulletproof Cameras. Enemies can see it → it is the "cam is live" tell. | yes | Phantom Sight (Y4S2) official notes; Fandom CCTV/Drone |
| Y6S4 → | Team colours became viewer-relative: **Your Team = blue, Opponents = red** by default (customisable blue/red/orange; later more options). The Y11S3 accessibility interview says team-colour customisation drives gadget colours and "colored LEDs indicate electronic interactions". | yes (UI); LED application inferred | Y6S4 Designer's Notes; Accessibility Spotlight (Sept 2026) |
| **Current best model** | LED lights while a player is viewing the camera; colour = viewer-relative team colour (default: your team's cams glow blue, enemy-controlled glow red). Whether passive viewing (feed open but another player has priority) also lights it → UNVERIFIED. | partly | Ask Ulo. |
| "Glint" | No glint mechanic documented for default cams; the LED is the indicator. (Maestro's Evil Eye laser glow through walls was treated as a bug, Y10S4.) | yes (absence) | Y10S4 addendum |

### 3.4 Other camera rules
- **Audio:** while on a camera you hear the sound at the camera, **not** around your body ("You will only hear the sound from the camera you're on") — find a safe spot before going on cams. (Ubisoft Gameplan "Intro to Drones and Using Cameras".)
- Defenders can check cams **during prep** (e.g. to see where drones enter). (Gameplan "Intel 101".)
- DSEG blocks the affected operator's access to **all** observation tools (both teams since Y6S4). (High Calibre.)
- A defender whose phone was destroyed by Dokkaebi's Jegeo Payload loses observation-tool access until eliminated or next round. (Fandom Dokkaebi.)
- **Siege X changes to default cams:** none found in official notes Y10S2 → Y11S3.1. Map modernizations may move cams (map-specific → `research/oregon/`).

---

## 4. Bulletproof Camera (generic defender gadget — brief; stats → `gadgets.md`)
| key | value | verified | source |
|---|---|---|---|
| count | 1 | yes | Fandom Bulletproof Camera |
| placement | deployed (not thrown) on floors and walls | yes | 2018 Dev Blog; Fandom |
| bulletproof | front plate is bulletproof; weak points on the sides; vulnerable to explosives; Sledge hammer / Maverick torch destroy it instantly | yes | Fandom; 2018 Dev Blog |
| melee | shatters the glass → feed blind, **scan/ping and EMP disabled**, audio still works (since Update 6.2.0, June 2021) | yes | Fandom; Y6S4 DN (no EMP when shattered) |
| vision | heat-vision style: operators highlighted white, environment desaturated green, **sees through smoke** | yes | Fandom |
| rotation | yes, rotatable since Y6S4 (limits UNVERIFIED) | yes | High Calibre (Y6S4) |
| EMP | "EMP burst" / **EMP Dart**: fires at attacker electronic gadgets (drones, claymores, Airjabs…) → DSEG. Any defender on the cam can fire it (first player in the camera; no ownership). Attackers who hack it cannot fire. Explosion range **0.75 m** (Y11S2.1, was 0.55 m). Cooldown / disable duration: UNVERIFIED here (→ `gadgets.md`). | yes (except timings) | Y6S4 DN; High Calibre; Y11S2.1 patch notes |
| EMP after death | Fandom: any defender "provided they are alive" may fire; Y6S2 TS "gameplay after death" said BP cams usable after death. Conflict — UNVERIFIED. Default for build: dead players can **view/rotate** but **not fire** (mirrors Maestro rule: dead Maestro can rotate Evil Eyes but not shoot, Y6S4 DN). | UNVERIFIED | Fandom; North Star; Y6S4 DN |
| outdoors | loses signal after 10 s when placed outdoors; must be picked up and redeployed | yes | High Calibre (Y6S4) |
| counters | Thatcher EMP (disable), Twitch/Zero lasers on weak point, IQ detects it; Nøkk (HEL) invisible to it; Iana/Alibi holograms not highlighted | yes (Fandom; Thatcher timings may be outdated after his Y10S4 rework) | Fandom |
| roster note | Sentry (Recruit) can take it (PLAN §11.3); Mute/Lesion loadouts → operator files | — | — |

---

## 5. Observation denial and other observation tools
| tool | what it does / reveals | verified | source |
|---|---|---|---|
| **Observation Blocker** (defender secondary, x3) | Deployed device projects a **digital screen that blocks line of sight of opponent observation tools** (drones, cameras) — nothing behind it can be seen or spotted until it is destroyed or the drone moves past it. The screen is **only visible through observation tools**; operators can't see it and aren't affected. Destroyable by gunfire, explosives, EMP; detectable by IQ. Deploy time **1 s** (was 2.5 s, Y11S1). Placed, not throwable (by design, Y11S1 DN). | yes | Dread Factor (Y8S2) notes; Fandom Observation Blocker; Silent Hunt notes; Y11S1 DN |
| Mute Signal Disruptor | jams drones (static), 2.6 m sphere | yes | see §1.4 |
| DSEG (EMP grenade, Thatcher E.G.S. Disruptor, BP cam EMP) | disables electronic gadgets for a time; affected operators cannot use observation tools or trigger remote devices; affects all sights (Y10S4) | yes | Y6S4 notes; Y10S4 DN |
| Mozzie Pest | steals drones | yes | context only |
| Vigil ERC-7 / Nøkk HEL | invisible to observation tools; LEDs turn white | yes | Phantom Sight; Fandom |
| Dokkaebi | camera hacking (see §3.2) | yes | Y11S2 DN |
| **Valkyrie** Black Eye (context) | 3 throwable sticky cams; ~180° H/V rotation, faster rotation and wider FOV than default cams; view accessible mid-air, feed starts on attach; lose signal after 10 s outdoors | yes | Fandom Valkyrie; Y6S4 DN |
| **Maestro** Evil Eye (context) | 3 bulletproof turret-cams; see through smoke; laser 5 dmg/shot at 4 shots/s, only Maestro fires; battery 8 s (Y10S4.2); rotate 180° on walls / 360° on floors; teammates can rotate when Maestro isn't on it; dead Maestro can rotate but not fire | yes | Fandom Maestro; Y10S4.2 patch notes; Y6S4 DN |
| Roster tools (see operator files) | Pulse Cardiac Sensor 10.5 m (Y11S2); Skopós V10 shell doubles as an observation tool; Mira Black Mirror (one-way window, not an observation tool); Dokkaebi, Brava (hacks) | yes | System Override notes; Twin Shells notes |

---

## 6. Spectating, support mode, replays
| topic | rule | verified | source |
|---|---|---|---|
| Support mode (dead) — defenders | Access **all team cameras** (default cams, Bulletproof Cams, operator cams — view/rotate), ping and scan from them, spectate living teammates. | yes | Fandom Ping 2.0 (ping after death); siege.gg ("Even if you are dead, you can check the team's cameras"); Gameplan |
| Support mode — attackers | **Drive their own surviving drones**, view teammates' drones, ping/scan from them, spectate teammates. | yes | Fandom Drone; North Star TS note |
| Support mode — operator gadgets | Y6S2 TS "gameplay after death": Zero's ARGUS, Mozzie's stolen drones, Echo's Yokai, Maestro's Evil Eyes usable by their owners after death. Maestro: rotate yes, shoot no (Y6S4 DN). | yes (TS + DN) | North Star; Y6S4 DN |
| Support mode HUD | player portraits show teammates' ability/gadget status (Y7S1) | yes | Demon Veil (Y7S1) notes |
| DBNO players using obs tools | **UNVERIFIED** — PLACEHOLDER: not allowed while DBNO | UNVERIFIED | Ask Ulo |
| Killcam / death replay | Exists (enabled in Ranked since 2017 to deter cheating); skippable. Since Y6S2 the first-person death animation is skippable and the slow-motion + opponent close-up were removed from the death replay. Exact POV/length: UNVERIFIED (PLACEHOLDER: ~5 s replay from the killer's perspective). | yes (exists) | PC Gamer (2017); North Star (Y6S2) notes; Fandom patch pages (killcam fixes) |
| End-of-round replay | Historically an EOR replay (round-deciding kill) exists; current status UNVERIFIED | UNVERIFIED | Fandom Patch 4.2.0 fix mentions "EOR replay"; Crimson Heist (red pings in Replay/EOR) |
| Match Replay | Records recent matches locally: 12 (PC now **30** since Y11S2). First-person any player, top-down/tactical and **free camera**; fast-forward/rewind; report cheaters from replay (Y7S3); HUD customisable (Y11S1). Consoles since Demon Veil (Y7S1). | yes | Fandom Match Replay; System Override; Dread Factor; Brutal Swarm; Silent Hunt |
| Custom-game spectators | Spectator Camera (11th+ player) only in Custom games; up to **4 spectators** (Y8S4); first/third person, tactical cut-away view, free cam (Y8S3) | yes | Fandom Spectator Camera; Deep Freeze; Heavy Mettle |

---

## 7. Audio intel

### 7.1 Propagation model (original design — still the conceptual basis)
From the Siege audio director (Gamasutra/Game Developer deep dive, 2017):
- **Propagation nodes** placed through the map; the engine finds the lowest-cost path from source to listener (cost = path length + accumulated angles + penalties from the destruction state of nodes), then **repositions the sound to come from the path direction** (simulated diffraction = "Obstruction").
- Nodes inside intact walls are closed (infinite penalty); **creating a hole opens nearby nodes** so sound passes through it. Barricades and reinforcements *close* paths again, with per-material penalties (wood vs metal barricade differ).
- **Occlusion** (through-wall absorption) is layered on top: pre-rendered muffled versions for e.g. footsteps on the ceiling; real-time filtering mainly for guns. Occluded and obstructed versions can play together.
- Reverb via impulse-response processing; gun reverb baked and positioned.
- Navigation sounds encode operator **weight, armour and speed**; gadget deployments (breach charges, barricades, devices) have deliberate audible cues.
- **First-person movement sounds are mixed loud** on purpose: tells you you're making noise and that you must slow down to hear others.
- Confirmed in current notes: defenders shoot open **exterior soft walls before reinforcing to improve sound propagation** into the site (Y10S3.3 Designer rationale for Bandit).

### 7.2 Siege X audio overhaul (Y10S2, June 2025)
| item | detail | verified | source |
|---|---|---|---|
| Scope | Complete rework of **propagation and reverberation** so players can pinpoint **where, how far, and in what type of room** an enemy is | yes | Daybreak page; Siege X showcase; Ubisoft "Audio Overhaul" video description |
| Vertical audio | "subtle changes" to vertical audio; a player below may sound closest to the stairs/hole that is the strongest path between floors | yes (Ubisoft short); detail from secondary source | Ubisoft YouTube short "Vertical Audio in Siege X" (May 2025); search-result summary |
| Post-launch | Y10S2.1 audio tweaks after "underwater" complaints; Dynamic Range option (turning it off is the common fix) | yes | siege.gg "How to fix audio" |
| Options | separate volume sliders, dynamic range, tinnitus SFX choice, voice-over presets | yes | Daybreak; Accessibility Spotlight |
| Design intent | outline system makes visibility fair so **noise** becomes the key stealth variable | yes | Daybreak (outline system text) |
| Operator banter | Conversation System voice lines (Y10S2 →) | yes | High Stakes, Silent Hunt notes |

### 7.3 Sounds that give away position/intent (build checklist)
| sound | notes | verified | source |
|---|---|---|---|
| Footsteps (per stance, speed, armour) | details → `core_mechanics.md` | yes | Gamasutra deep dive; Vector Glare (Y7S2) "Updated the Crouch Walk sound mix" |
| Drone motor, jump, landing, destruction | | yes | Fandom Drone; Y9S4/Y10S2.3 fixes |
| Reinforcing, barricade placement/breaking, wall/floor destruction | | yes | Gamasutra ("gadget deployment … cues"); Y11S2 addendum destruction SFX fix |
| Gadget deploy / activation (jammer, cams, breach charges, etc.) | | yes | Gamasutra |
| Rappel (incl. deploying gadgets while rappelling) | has occluded (through-wall) variants | yes | Shadow Legacy (Y5S3) addendum fix: "Missing occluded SFX when deploying while … rappelling" (Fandom Patch 5.3.0) |
| Reloads, lean rustle, weapon handling | | partly | Y10S4.2 melee handling SFX fix |
| Siege X metal detectors | loud noise when passed through; can be EMP-disabled or destroyed | yes | Daybreak; showcase → `destruction.md` |
| Dokkaebi phone buzz | louder/"urgent" in Y11S2 | yes | Y11S2 DN |
| Proximity Alarm | alarm when enemy within 3 m | yes (gadget file) | → `gadgets.md` |
| Listening while on cams | hear camera location, not your body (§3.4) | yes | Gameplan |

---

## 8. Change log affecting intel (last ~4 seasons + key older changes still in force)
| season | change | source |
|---|---|---|
| Y4S2 Phantom Sight | LED colour rules for observation tools | official |
| Y5S1 Void Edge | drone spawn side = first chosen spawn; "Drone after Prep" option | official |
| Y5S3 Shadow Legacy | Ping 2.0 (numbered, contextual, from obs tools, after death; gadget ping reveals operator) | official |
| Y6S2 North Star | death replay trimmed; transparent operator icons on death; bullet-hole LOS blocked in soft surfaces | official |
| Y6S3 Crystal Guard | opponent rim light (later superseded) | official |
| Y6S4 High Calibre | BP cam rotation + EMP; cams lose signal outdoors after 10 s; drone counter; team colours blue/red; DSEG blocks obs tools for both sides; compass shows pings | official |
| Y7S4 Solar Raid | full-speed diagonal drone strafe on controller; markers stick to screen edge | official |
| Y8S2 Dread Factor | Observation Blocker added | official |
| Y8S3 Heavy Mettle | Quick Match auto-reveals objective; free cam in spectator | official |
| Y9S2 New Blood | feed saturation = control level; drone pick-up on rappel; guidance markers (drone vents) | official |
| Y9S3 Twin Shells | drone speed boost resource | official |
| Y9S4 Collision Point | drone jump trajectory preview; sticky landings; ledge coyote time | official |
| **Y10S2 Daybreak (Siege X)** | Communication Wheel; audio overhaul; new outline system; first-person shadows; electricity neutral (destroys any electronics incl. drones) | official |
| Y10S3 High Stakes | Match Replay controls modernised; 3D threat indicators | official |
| Y10S4 Tenfold Pursuit | minimap in bot/training playlists; DSEG consolidation (affects all sights, remote triggers) | official |
| Y11S1 Silent Hunt | Observation Blocker deploy 2.5 → 1 s; replay HUD customisation | official |
| Y11S2 System Override | ping QoL (double-tap danger ping, ping-to-text incl. smart pings); Match Replay 30 files (PC); Dokkaebi camera hacking 20 s/infinite range; Mozzie 1.75 m; Pulse 10.5 m; BP cam EMP Dart 0.75 m (Y11S2.1); Mute 2.6 m (Y11S2.3) | official |
| Y11S3 Split Fire | minimap in Quick Match; input remap overhaul (Press/Hold/Toggle); Dokkaebi upload needs constant connection | official |

---

## 9. Suggested data defaults (for `data/intel.json`; UNVERIFIED values flagged)
```json
{
  "drone": { "per_attacker": 2, "hp": 1, "fall_damage_immune": true,
             "jump_cooldown_s": 3.0,
             "jump_height_m": 1.0,            "_jump_height": "UNVERIFIED placeholder",
             "move_speed_mps": 4.0,           "_move_speed": "UNVERIFIED placeholder",
             "boost": { "mult": 1.5, "duration_s": 2.0, "recharge_s": 10.0, "_": "UNVERIFIED placeholder" },
             "hitbox_m": [0.22, 0.12, 0.18],  "_hitbox": "UNVERIFIED placeholder",
             "fov_deg": 90,                   "_fov": "UNVERIFIED placeholder",
             "owner_only_drive": true, "owner_only_pickup": true, "drive_after_death": true,
             "battery_s": null },
  "scan": { "hold_s": 1.0, "cone_deg": 10, "_cone": "UNVERIFIED placeholder" },
  "ping": { "yellow_duration_s": 5, "red_duration_s": 5, "danger_duration_s": 5,
            "cooldown_s": 0.5, "_": "durations/cooldown UNVERIFIED placeholders",
            "team_only": true, "through_walls": true, "yellow_alerts_target": false,
            "red_alerts_target": true, "usable_when_dead": true },
  "default_camera": { "hp": 1, "yaw_half_range_deg": 60, "pitch_min_deg": -60, "pitch_max_deg": 10,
                      "turn_speed_dps": 60, "fov_deg": 70, "zoom": false,
                      "_": "rotation/FOV/zoom UNVERIFIED placeholders",
                      "led_on_when_viewed": true },
  "defender_obs_tool_outdoor_signal_s": 10
}
```

---

## Open questions
- **Drone speed, jump height, boost numbers, hitbox size, FOV** (all UNVERIFIED). Ulo: in a Custom game, time a drone across a known-length hallway (normal and boosted), check whether it can jump onto a ~1 m window sill, and note the boost bar duration/recharge.
- **Drone zoom / default-camera zoom:** can you zoom (ADS button) on a standard drone or a default camera? If yes, what magnification?
- **Default camera rotation limits:** roughly how far left/right and up/down does a default cam turn from its resting direction? Is it a fixed cone per camera?
- **Camera/drone LED colour today:** when a defender is on a default cam, what colour does the attacker see (red = opponent colour, or blue)? Does it light only for the player actively controlling, or for anyone with the feed open?
- **Ping durations:** how long does a yellow ping, a red (spotted) marker, and a danger ping stay up? Is there a per-player ping limit/cooldown?
- **Communication Wheel:** screenshot of the wheel (all options, their order, default key) — only Breach / Area Clear / Help / Danger / Thanks are confirmed by secondary sources.
- **"SPOTTED" alert text:** exact wording on the spotted player's HUD in Siege X.
- **Scan cone:** how close to the crosshair must an enemy be for a drone/cam scan to spot them?
- **Dead players:** can a dead defender fire the Bulletproof Camera EMP? Can a dead attacker pick up their drone (no — body is dead) / can teammates pick up a dead player's drone? Can DBNO players open cams/drones?
- **Audio from drones:** when on a drone, do you hear from the drone's position (like cameras)?
- **Killcam / EOR replay:** still present in Ranked in Y11S3? Whose perspective, how long?
- **Oregon default cameras (current modernized layout):** count and positions → Ulo's screenshots (see `research/oregon/SCREENSHOT_CHECKLIST.md`). Legacy r6maps data (7 cams) is pre-rework and must not be used.

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/daybreak — Siege X: comm wheel, audio overhaul, outline system, first-person shadows, electricity neutral, QM prep 45 s, AI droning
- https://news.ubisoft.com/en-us/article/55e9bGaVCdO52trbclOhpf/rainbow-six-siege-x-showcase-everything-you-need-to-know — official Siege X feature list (audio propagation/reverb rework, comm wheel "place different pings in the environment")
- https://news.ubisoft.com/en-us/article/r2MFilRathMnz0nZ3zosN/rainbow-six-siege-x-accessibility-spotlight — Y11S3 (2026-09-16): team colours & LEDs, ping colour, comm-wheel/smart-ping to text, ping double-tap speed, Press/Hold/Toggle inputs
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/splitfire — Y11S3: minimap in Quick Match, 3v3 prep 30 s, Dokkaebi upload change
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/systemoverride — Y11S2: ping improvements, Match Replay 30 files, Mozzie/Pulse ranges, Casino drone vents
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/silenthunt — Y11S1: Observation Blocker 1 s deploy, replay changes
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5fWCjoCU8toUJiBdMSj0UA/y11s1-designers-notes — Observation Blocker design intent
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/highstakes — Y10S3: Match Replay controls, threat indicators, conversation system
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/tenfoldpursuit — Y10S4: minimap in training playlists (via cached season text)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes — DSEG consolidation (sources: EMP grenade, E.G.S., BP cam)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3HSeMj81P0CL3m0N8FS5tK/y10s42-patch-notes — Maestro battery 8 s; AI contextual ping cooldown fix (also mirrored at https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_10.4.2)
- https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1832700592798348 — Y11S2 Designer's Notes (Dokkaebi camera hacking: infinite range, 20 s; Deimos "spotted" requirement)
- https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1836506165548781 — Y11S2.1 patch notes (Bulletproof Camera EMP Dart range 0.75 m)
- https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1839676055897412 — Y11S2.3 patch notes (Mute disruptor 2.6 m)
- https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1838407329257158 — Y11S2 mid-season (1v1 Arcade: bomb sites auto-revealed, reduced prep)
- https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1813041031367349 — Y10S3.3 (exterior soft walls opened to improve sound propagation)
- https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1815580768235237 — Y10S3 roadmap (training minimap)
- https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1808061939347506 — ShieldGuard Y10S2 ("Chat Wheel")
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/6d9GuIXMWRbgoPQZYdUVip/y10s21-patch-notes — pinged-enemy assist fix; piloting drone after death (Dual Front)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/15u8e17UKbO1RDm0lXhfXx/y10s23-patch-notes — drone destruction SFX fix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/ixjnXu9g80eFVW3X7cNFF/y10s20-patch-notes-addendum — support-mode drone deploy fix; Dual Front minimap
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes — electricity neutral rationale
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/seasons/highcalibre — Y6S4: BP cam rotation/EMP, outdoor signal loss, drone counter, team colours, DSEG obs-tool rule, compass pings
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/6b2rj9Kf1onAvpLRqvNB1r/y6s4-preseason-designers-notes — BP cam EMP ownership, drone counter rules, Maestro after-death rule, Valkyrie outdoor rule
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/seasons/crystalguard — Y6S3: opponent rim light, Twitch prep drone, Mute sphere
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/seasons/northstar — Y6S2: death replay trim, operator death icons, gameplay-after-death TS, bullet-hole LOS
- https://www.ubisoft.com/en-au/game/rainbow-six/siege/news-updates/6KlY4IEhecnajBCIzPc89l/dev-blog-observation-tool-changes-and-bulletproof-camera — observation-tool UI (view teammates' drones), BP cam basics
- https://news.ubisoft.com/en-us/article/2r5hr884VuucgwjWXk0Nty/rainbow-six-siege-operation-shadow-legacy-operator-map-and-gameplay-update-guide — Ping 2.0 description
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/shadowlegacy — Ping 2.0 rules (after death, gadget ping reveals operator, numbered pings)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/phantomsight — observation-tool LED colours; Nøkk invisibility; killcam fixes
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/voidedge — drone spawn side, Drone after Prep, IQ reveals objective
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/newblood — feed saturation = control, drone pick-up on rappel, guidance markers
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/twinshells — drone speed boost resource
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/collisionpoint — drone jump trajectory, sticky landings
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/solarraid — drone strafe speed, off-screen markers
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/dreadfactor — Observation Blocker introduction; free cam in Match Replay
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/heavymettle — Quick Match objective auto-reveal; spectator free camera
- https://www.ubisoft.com/en-au/game/rainbow-six/siege/news-updates/2Btj0mP7e7gVKIODGSLuiX/y8s3-designers-notes — objective automatically revealed for attackers (QM)
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/deepfreeze — 4 spectators in custom games
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/demonveil — Y7S1: support-mode HUD; defender drones 10 s outside
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/vectorglare — Y7S2: crouch-walk sound mix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/brutalswarm — Y7S3: report cheaters from Match Replay
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_5.3.0 — Y5S3: occluded rappel/deploy SFX fix; Ping 2.0 notes
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/crimsonheist — Mozzie pest proximity pulse; red pings in replay/EOR
- https://rainbowsix.fandom.com/wiki/Drone — drone count, jump cooldown 3 s, one-hit destruction, pick-up, throw, after-death use, scanning, LED, noise, Vigil interference
- https://rainbowsix.fandom.com/wiki/CCTV — default camera behaviour, scanning, destruction, Dokkaebi hack, -10 pts, saturation trivia
- https://rainbowsix.fandom.com/wiki/Bulletproof_Camera — BP cam details (weak points, shatter, heat vision, EMP rules, interactions)
- https://rainbowsix.fandom.com/wiki/Observation_Blocker — count 3, behaviour, Y11S1 change
- https://rainbowsix.fandom.com/wiki/Ping_2.0 — ping rules; historical 8 s / 5 s cooldown ping
- https://rainbowsix.fandom.com/wiki/Match_Replay — replay feature
- https://rainbowsix.fandom.com/wiki/Spectator_Camera — custom-game spectator
- https://rainbowsix.fandom.com/wiki/Planning_Phase — prep-phase drone flow
- https://rainbowsix.fandom.com/wiki/Mute — jammer effect on drones (static)
- https://rainbowsix.fandom.com/wiki/Valkyrie — Black Eye vs default cam rotation/FOV comparison
- https://rainbowsix.fandom.com/wiki/Maestro — Evil Eye rotation, laser, smoke
- https://rainbowsix.fandom.com/wiki/Dokkaebi — remaster: phone destruction blocks obs tools, camera hack
- https://rainbowsix.fandom.com/wiki/Rank_Up_Beginner_Series:_Intro_To_Drones_and_Using_Cameras — Ubisoft Gameplan transcript: camera audio rule, 2 drones, pick-up
- https://rainbowsix.fandom.com/wiki/Rank_Up_Newcomer_Series:_Non-Verbal_Communication — Ubisoft Gameplan transcript: yellow vs red ping keys/behaviour, teammate outlines, skull icon
- https://rainbowsix.fandom.com/wiki/Rank_Up_Advanced_Series:_Intel_101 — Ubisoft Gameplan transcript: prep droning, cams in prep
- https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_2.3 — killcam existence (fixes)
- https://www.pcgamer.com/rainbow-six-siege-patch-adds-kill-cam-to-ranked-tweaks-spawns-and-more/ — killcam enabled in Ranked
- https://www.gamedeveloper.com/design/game-design-deep-dive-dynamic-audio-in-destructible-levels-in-i-rainbow-six-siege-i- — propagation nodes, obstruction/occlusion, navigation sound design
- https://www.youtube.com/shorts/ocfavhAEm0A — Ubisoft "Vertical Audio in Siege X" (Adam Tiller), May 2025
- https://www.youtube.com/watch?v=exzjwaQMji8 — "R6 Siege X: Audio Overhaul" trailer description (room-type/location cues)
- https://siege.gg/news/siege-x-how-to-fix-audio — Y10S2.1 audio tweaks, dynamic range
- https://siege.gg/news/how-to-drone-in-rainbow-six-siege — 2 drones, prep 45 s, yellow vs red ping, dead players check cams
- https://siege.gg/news/what-is-the-yellow-ping-in-rainbow-six-siege — yellow ping silent/instant; gadget ping reveals operator
- https://siege.gg/news/rainbow-six-siege-x-introduces-a-new-communication-wheel — comm wheel options (breach, thanks, danger)
- https://hardcoregamer.com/tips-and-tricks-for-rainbow-six-siege-x/ — comm wheel options Breach / Area Clear / Help / Danger
- https://steamcommunity.com/app/359550/discussions/0/796713273232795204/ — player report: yellow ping fixed to Z, wheel rebindable (Y11S1)
- https://steamcommunity.com/app/359550/discussions/0/4098792306740275909/ — community (2020 TS) yellow-ping duration claims (not relied upon)
- https://r6maps.com/js/release.2.4.1/main.min.js — legacy per-map default camera counts (outdated)
- https://news.ubisoft.com/en-us/article/1bWDKjR3rOmpf736SMY400/rainbow-six-siege-wasteland-circuit-race-drones-today — Y11S3 drone-racing event (event-only drone rules, not core gameplay)
