# Generic Secondary Gadgets (attacker + defender pools)
Verified against: Y11S3 (Operation Split Fire, incl. Y11S3.1 patch of 2026-09-22) — researched 2026-09-29
Confidence: medium. Pools, who-carries-what, and every value changed in Y5S2–Y11S3 come from official Ubisoft pages, patch notes and Designer's Notes (high). Many base values that Ubisoft has never published (frag/nitro damage curves, smoke/stun timings, barbed-wire damage, most gadget HP) exist only on the Fandom wiki, and several of those pages are stale. Those values are marked UNVERIFIED.

Source tags such as `[DN-Y11S3]` are defined in **Sources** at the bottom. `F:` means a Fandom page, which ranks below official sources.

---

## 0. Key findings (read first)

1. **The pools have 7 gadgets per side, and nothing new has been added since Siege X.** The official Striker and Sentry pages (Y11S3) list exactly these:
   - **Attack (7):** Breach Charge, Claymore, Frag Grenade, Hard Breach Charge, Smoke Grenade, Stun Grenade, Impact EMP Grenade. `[OP-STRIKER]`
   - **Defense (7):** Barbed Wire, Bulletproof Camera, Deployable Shield, Observation Blocker, Impact Grenade, Nitro Cell, Proximity Alarm. `[OP-SENTRY]`
   - The Y11 operators use only existing gadgets. Solid Snake (Y11S1) has Frag, Stun, Impact EMP, Smoke and Breach Charge `[SEASON-SILENTHUNT]`. Noor (Y11S3) has Deployable Shield and Barbed Wire `[SEASON-SPLITFIRE]`. The cross-side gadgets in Dual Front ended when that mode was removed in Y11S2 `[SEASON-SILENTHUNT]`.
2. **Claymore damage is 155 hp, up from 150, in Y11S3.** This is confirmed by the official Y11S3 Designer's Notes `[DN-Y11S3]`. The Fandom Claymore page still shows old pre-health-system numbers (142/120/105).
3. **The Impact EMP radius is 2 m, up from 1.8 m, since Y11S2.3** `[PN-Y11S23]`. The disable duration is 9 s (set in Y7S3) `[DN-Y7S3]`.
4. **The Bulletproof Camera EMP dart has a 0.75 m explosion range, up from 0.55 m, since Y11S2.1** `[PN-Y11S21]`.
5. **Observation Blocker deploy time is 1 s, down from 2.5 s, since Y11S1.** It is intentionally not throwable `[DN-Y11S1]`.
6. **Y10S4 rewrote how gadgets are disabled (the "DSEG" system):**
   - **DSEG** is the disabled state caused by EMP Grenades, Thatcher's E.G.S. Disruptor and Bulletproof Cameras. A device inside the field cannot be triggered by a wireless signal. An operator inside the field cannot trigger their own remote devices. All optics are affected, and re-applying the effect refreshes the timer.
   - **Mute's Signal Disruptor** now *only jams wireless signals*, meaning remotely triggered devices. Automated devices are not affected `[DN-Y10S4]`.
   - Radius: 2.475 m at Y10S4, then 2.6 m in Y11S2.3 `[PN-Y11S23]`.
7. **Siege X (Y10S2) changed electricity:**
   - Electricity is neutral: it destroys *any* electronic device that touches it, from either team.
   - It no longer damages operators; it slows them instead `[DN-Y10S2]`.
   - Rappel breaching no longer requires a Breach Charge `[DN-Y10S2]`.
8. **Dokkaebi (Y11S3) now carries Smoke Grenade and Breach Charge.** Her Impact EMP was removed `[DN-Y11S3]` `[OP-DOKKAEBI]`. The Fandom Dokkaebi page is stale and still lists Impact EMP.
9. **Sledge also carries the Impact EMP Grenade** alongside Frag and Stun `[OP-SLEDGE]`. **Pulse** carries Nitro Cell, Deployable Shield and Observation Blocker `[OP-PULSE]`.

---

## 1. Which of our 12 operators carry each gadget by default

Sources: the official operator pages (all fetched 2026-09-29). Official pages list gadget names but not counts, so counts come from Fandom operator pages unless noted.

### 1.1 Attackers
| Gadget | Brava | Fuze | Thermite | Striker | Dokkaebi | Sledge |
|---|---|---|---|---|---|---|
| Breach Charge | — | YES (x3) | — | YES (x3) | YES (Y11S3; count UNVERIFIED, assume 3) | — |
| Hard Breach Charge | — | YES (x2) | — | YES (x2) | — | — |
| Claymore | YES (x2) | — | — | YES (x2) | — | — |
| Frag Grenade | — | — | — | YES (x2) | — | YES (x2) |
| Stun Grenade | — | — | YES (x2) | YES (x3 per Fandom, UNVERIFIED) | — | YES (x2) |
| Smoke Grenade | YES (x2) | YES (x2) | YES (x2) | YES (x2) | YES (x2) | — |
| Impact EMP Grenade | — | — | — | YES (x2) | — (removed Y11S3) | YES (x2) |

### 1.2 Defenders
("Lesion" is our provisional pick for the "Legion" in the plan. See the research brief.)

| Gadget | Sentry | Skopós | Mira | Lesion | Pulse | Mute |
|---|---|---|---|---|---|---|
| Barbed Wire | YES (x2) | — | — | — | — | — |
| Deployable Shield | YES (x1) | — | — | — | YES (x1) | — |
| Nitro Cell | YES (x1) | — | YES (x1) | — | YES (x1) | YES (x1) |
| Impact Grenade | YES (x2) | YES (x2) | — | — | — | — |
| Proximity Alarm | YES (x2) | YES (x2) | YES (x2) | — | — | — |
| Bulletproof Camera | YES (x1) | — | — | YES (x1) | — | YES (x1) |
| Observation Blocker | YES (x3) | — | — | YES (x3) | YES (x3) | — |

### 1.3 Gadget Kit rules (Striker and Sentry)
- Striker "is the Attacker Operator with access to all secondary gadgets for Attack Operators" `[OP-STRIKER]`. Sentry has the defender equivalent `[OP-SENTRY]`.
- They pick **2 types**. One type fills the unique-ability slot `[F:Striker]` `[F:Sentry]`. Fandom's wording ("any 2 types") implies the two must be different.
- **Counts in the kit** (Fandom recruit pages):
  - Striker: Frag x2, Hard Breach x2, Smoke x2, **Stun x3**, Breach x3, Impact EMP x2, Claymore x2.
  - Sentry: Impact x2, Deployable Shield x1, Barbed Wire x2, Bulletproof Camera x1, Nitro Cell x1, Proximity Alarm x2, Observation Blocker x3.
  - All of these match the normal counts **except Striker's Stun x3**. The Fandom stun page and the Thermite/Sledge pages say x2. This is UNVERIFIED.

---

## 2. Systems that apply to many gadgets

| System | Current rule (Y11S3) | Source |
|---|---|---|
| **DSEG (disable state)** | Caused by EMP Grenades (Impact EMP), Thatcher's E.G.S. Disruptor and Bulletproof Camera EMP darts. A device inside the field cannot be triggered wirelessly. An operator inside the field cannot trigger their remote devices (Breach Charges, Exothermic charges, cluster charges, etc.). All sights, scopes and optics are affected (before Y10S4, only 1x sights were). Re-applying refreshes the timer. The operator and the device must both be outside the field for the device to work. | `[DN-Y10S4]` `[SEASON-TENFOLD]` |
| **Mute's Signal Disruptor** | Jams wireless signals only, not every electronic. Example: Thermite cannot trigger an Exothermic Charge in range, but Ace's SELMA (automated) keeps working. Radius 2.6 m, warning ring 4.875 m (Y11S2.3). Fandom says a device is blocked if *either the device or the user* is inside the radius. | `[DN-Y10S4]` `[PN-Y11S23]` `[F:Mute]` |
| **Electricity** (Bandit, Kaid) | Since Y10S2 it is neutral. It destroys electronic gadgets from either team that touch it, deals no damage to operators, and applies a slow instead. You get electrified only by interacting (deploying on or vaulting an electrified surface, or walking on electrified wire), not by standing near it. Since Y10S4, Castle panels can be electrified by Kaid, and electrified surfaces also destroy Ash's rounds. | `[DN-Y10S2]` `[DN-Y10S4]` |
| **Projectile catchers** | Jäger's ADS and Wamai's Mag-NET catch thrown grenades (frag, stun, smoke, EMP). Aruni's Surya Gate destroys thrown objects that touch its lasers. None of these are on our 12-operator roster, but Striker/Sentry games may face them. | `[F:M67]` `[F:Stun]` `[F:Smoke]` |
| **Direct-hit damage** | A throwable that hits an operator directly deals 5 hp. The frag page says this no longer applies to frags. | `[F:Stun]` `[F:Smoke]` `[F:C4]` `[F:EMP]` |
| **Health context** | HP replaced armor in Y6S3 (Crystal Guard): Light 100, Medium 110, Heavy 125. Rook armor adds +25 since Y11S1.1 (was +20). Explosive damage is now a flat hp value. | `[F:Armor]` `[PN-Y11S11 via F:11.1.1]` |
| **Ballistic shields** | Absorb 66% of frag, impact and nitro damage if the blast is in front. Since Y9S1.3, any explosion over 30 hp triggers a guard break. | `[F:M67]` `[F:Impact]` `[PN-Y9S13]` |
| **Outdoor cameras** | A Bulletproof Camera placed outdoors loses signal after 10 s (Y6S4). | `[DN-Y6S4]` |
| **Breach light colors** | Green = breachable. Yellow = semi-breachable: metal supports, you get a see-through hole you cannot pass; Fandom says all breachable floors are this type. Red = unbreakable. | `[F:Breach]` `[F:Destruction]` |

---

## 3. Attacker gadgets

### 3.1 Breach Charge
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `breach_charge` | — | — |
| Side | Attack | yes | `[OP-STRIKER]` |
| Count | 3 (same in Striker kit) | partial (Fandom only) | `[F:Breach]` `[F:Fuze]` `[F:Striker]` |
| Placement | Placed by hand, not thrown, on breakable surfaces: soft walls, floors/hatches, door and window barricades. Cannot go on reinforced surfaces or on props. The indicator light shows green/yellow/red (see §2). | yes (Fandom) | `[F:Breach]` `[F:Destruction]` |
| Deploy time | Faster since Y4S1; exact seconds UNVERIFIED | UNVERIFIED | `[F:4.1.0]` |
| Activation | Remote detonation after placement | yes | `[F:Breach]` `[DN-Y10S4]` |
| Damage, far (defender) side | Lethal close to the charge; the damaging area was widened and the lethal area shrunk in Y4S1. Exact hp and radius UNVERIFIED. | UNVERIFIED | `[F:4.1.0]` `[F:Breach]` |
| Damage, placer side | 50 hp (was 150 before Y4S1). Fandom: no damage beyond 1 m. | yes (patch) / partial (radius) | `[F:4.1.0]` `[F:Breach]` |
| Other player effect | Tinnitus and temporary hearing loss within 3 m | partial (Fandom) | `[F:Breach]` |
| Surface effect | Soft wall: fully breached, walk-through opening. Barricade: destroyed. Semi-breachable floor: hole to see and shoot through but not pass. Unreinforced hatch: opened. Castle Armor Panel: destroyed. Reinforced surfaces: no effect. Hole dimensions UNVERIFIED. | partial | `[F:Breach]` `[F:Destruction]` |
| HP / destroyed by | Disappears if shot. Destroyed if placed on or touching an electrified surface. Destroyed if the surface it is on is destroyed. Exact HP UNVERIFIED (placeholder 1). | partial | `[F:Breach]` `[F:Destruction]` `[DN-Y10S2]` |
| Counters | Mute (remote device: jammed if the charge *or* the user is in range). Electricity destroys it. A placer under DSEG (Bulletproof Camera dart) cannot detonate. Defender explosives through the wall. | yes | `[DN-Y10S4]` `[F:Mute]` `[DN-Y10S2]` |
| Rappel | Since Y10S2, not required for a rappel breach-in: any means that weakens the barricade works | yes | `[DN-Y10S2]` |
| Recent changes | Y11S3: added to Dokkaebi. No stat changes in Y10–Y11. | yes | `[DN-Y11S3]` |

### 3.2 Hard Breach Charge
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `hard_breach_charge` | — | — |
| Side | Attack | yes | `[OP-STRIKER]` |
| Count | 2 (was 1 until Y6S3.3); same in Striker kit | yes | `[F:6.3.3]` `[F:Striker]` |
| Placement | Placed by hand on "breakable and reinforced surfaces": soft or reinforced walls, hatches, barricades | yes | in-game description via `[F:HBC]` |
| Deploy time | 2 s | yes (Y7S3 DN states "2 seconds to deploy") | `[DN-Y7S3]` `[F:HBC]` |
| Activation | Automatic timed fuse, not remote. It starts when placement finishes (the operator pulls the fuse tab). | yes | `[DN-Y5S3]` `[F:HBC]` |
| Fuse | 4 s (Y7S3; was 5, and 6 at launch in Y5S3) | yes | `[DN-Y7S3]` `[DN-Y5S3]` |
| Damage | 5 hp to anyone standing on or right next to it; blast radius about 0.5 m | partial (Fandom) | `[F:HBC]` |
| Surface effect | Reinforced wall: a hole too small to run through; you must crouch through or vault. The in-game text calls it "medium". Reinforced hatch: one Hard Breach Charge counts as 1,000,000 of the hatch's 1M HP pool (a full breach) only if 3 or more of its conical charges sit on the hatch (Y5S3 rule; still current? UNVERIFIED). Since Y10S4, a reinforcement only detaches if a full line is cut. | partial | `[DN-Y5S3]` `[DN-Y10S4]` |
| Telegraphing | Loud; the conical charges pop one by one on both sides, showing detonation progress | yes (Fandom plus dev notes) | `[F:HBC]` |
| Counters | Electricity: "Bandit tricking" works on it `[DN-Y5S3]`. Destroyed by explosives (the "impact trick"). Mute: Fandom's Mute page lists Hard Breach Charges as jammed, but under the Y10S4 wireless-only rule an automatic fuse arguably should not be jammed. Whether Mute jams it is UNVERIFIED. Can bullets destroy it? UNVERIFIED. | partial | `[F:Mute]` `[DN-Y10S4]` |
| Recent changes | None in Y10–Y11 | yes | — |

### 3.3 Claymore
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `claymore` | — | — |
| Side | Attack | yes | `[OP-STRIKER]` |
| Count | 2 (since Y7S1.2, was 1); same in Striker kit | yes | `[F:7.1.2]` `[F:Striker]` |
| Damage | **155 hp** (Y11S3, was 150). The date of the earlier change to 150 was not found. | yes | `[DN-Y11S3]` |
| Damage falloff | Full damage up to 2 m, falling to 0 at 6 m. Damages a 180° arc in front plus anyone within 1 m behind it; nothing beyond 1 m behind. | partial (Fandom; may predate Y6S3) | `[F:Claymore]` |
| Placement | Placed on the ground facing the aim direction. Commonly placed at windows and doors (see the Y9S3 notes). Lasers pass through drone holes, barricade gaps and wall holes; objects can block them. | partial | `[F:Claymore]` `[DN-Y9S3]` |
| Tripwire | 3 lasers, each 2 m long: one straight ahead and two at ±30°. Arms 1 s after placement with a soft beep. | partial (Fandom) | `[F:Claymore]` |
| Activation | An **enemy** (defender) crossing a laser triggers it. Detonation is **instant**: the 0.2 s activation-to-explosion delay was removed in Y9S3. (Fandom's "0.5 s delay" is outdated.) | yes | `[DN-Y9S3]` |
| HP / destroyed by | Destroyable by gunfire before it triggers (Y9S3 notes). Exact HP UNVERIFIED (placeholder 1). Explosions. It makes a soft "puff" when destroyed, which alerts the owner. | partial | `[DN-Y9S3]` `[F:Claymore]` |
| Counters | Shooting it. Bulletproof Camera EMP darts disable it (Y6S4). Mute does **not** stop it (Fandom Mute page, post-Y10S4; consistent with the "automated devices" rule). EMPs from the defender side only come from Bulletproof Cameras. | partial | `[DN-Y6S4]` `[F:Mute]` `[DN-Y10S4]` |
| Surface effect | Not documented. Can it break barricades or soft walls? UNVERIFIED. | UNVERIFIED | — |
| Notes | A Claymore placed against Skopós' idle shell does not trigger until she activates that shell (Fandom) | partial | `[F:Skopos]` |

### 3.4 Frag Grenade
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `frag_grenade` | — | — |
| Side | Attack | yes | `[OP-STRIKER]` |
| Count | 2; same in Striker kit | partial (Fandom) | `[F:M67]` `[F:Striker]` |
| Throw | Regular throw curve (Y3S4); bounces | yes | `[F:3.4.0]` |
| Fuse | **Cannot be cooked** (since Y8S4). Initial fuse 4 s; if more than 2 s remain at the first bounce, it drops to 2 s. The Fandom "3.5 s after pin" note is outdated. | yes | `[DN-Y8S4]` |
| Damage | Current flat hp value UNVERIFIED. Fandom lists 142/120/105 by armor class, which dates from the armor era before Y6S3 and is stale. Placeholder: 150 (assumes it still equals the Claymore's pre-Y11S3 value, since Fandom says they matched "as of Operation Health"). | UNVERIFIED | `[F:M67]` `[F:Claymore]` |
| Radius | Y7S3 reduced the non-lethal damage and destruction radius to 3.6 m; the lethal radius "remains nearly the same" (value not given). | yes (3.6 m) / UNVERIFIED (lethal) | `[DN-Y7S3]` |
| Surface effect | Breaches soft surfaces. Opens hatches reliably. Hard to make a walk-through wall hole because it bounces and is fuse-based. Destroys barricades near it. | partial (Fandom) | `[F:M67]` `[F:4.1.0]` |
| Gadget effect | Destroys bulletproof gadgets such as Deployable Shield and Barbed Wire | partial | `[F:M67]` |
| Player UI | Threat indicator: red means lethal, white means non-lethal | partial | `[F:M67]` |
| Friendly fire | Damages everyone, allies included | partial | `[F:M67]` |
| Counters | Projectile catchers (§2). Shields absorb 66%. | partial | `[F:M67]` |

### 3.5 Stun Grenade
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `stun_grenade` | — | — |
| Side | Attack | yes | `[OP-STRIKER]` |
| Count | 2 (Thermite and Sledge per Fandom); Striker kit x3 per Fandom (conflict) | UNVERIFIED (x3) | `[F:Stun]` `[F:Thermite]` `[F:Sledge]` `[F:Striker]` |
| Fuse | Detonates 2 s after the first bounce (siege.gg 2026; matches the Y8S4 DN saying frags "adopted the fuse system from the Stun Grenade"). Initial fuse: Fandom says 3 s, UNVERIFIED. Cannot be cooked. | partial | `[SGG-STUN]` `[DN-Y8S4]` `[F:Stun]` |
| Effect | Blinds and deafens for 5 s; the target can still move | partial (Fandom) | `[F:Stun]` |
| Range, facing | Effect up to 15 m; full blindness up to 11 m | partial (Fandom; last range change listed is Y1) | `[F:Stun]` |
| Range, facing away | Visual effect only within 3 m | partial | `[F:Stun]` |
| Tinnitus | Within 8 m, regardless of facing. Since Y10S2 a player option can change the tinnitus sound (cosmetic). | partial / yes | `[F:Stun]` `[SEASON-DAYBREAK]` |
| Observation tools | Cameras and drones are unaffected. A player watching cameras is unaffected unless they leave cams before the effect ends. | partial | `[F:Stun]` |
| Seen through a Deployable Shield's window slits | Still flashes the viewer | partial | `[F:DeployShield]` |
| Damage | 5 hp on a direct hit only | partial | `[F:Stun]` |
| Surface effect | None documented | — | — |
| Counters | Projectile catchers. Warden's glasses. Finka's surge. | partial | `[F:Stun]` |

### 3.6 Smoke Grenade
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `smoke_grenade` | — | — |
| Side | Attack only | yes | `[OP-STRIKER]` `[OP-SENTRY]` |
| Count | 2; same in Striker kit | partial (Fandom) | `[F:Smoke]` `[F:Striker]` |
| Fuse | Releases smoke 3 s after the throw, or 2 s after first hitting a surface | partial (Fandom) | `[F:Smoke]` |
| Cloud | Sphere 5 m in **diameter**, lasts 10 s | partial (Fandom; last rework listed is Y2S3) | `[F:Smoke]` |
| Effect | Blocks all vision through it and obscures players inside it. Blocks pings: pinging the cloud places a ping on the cloud. Bullets pass through. | partial | `[F:Smoke]` |
| Seen through by | Bulletproof Camera (thermal), Glaz's scope, Warden's glasses (while standing still), Maestro's Evil Eye | partial | `[F:Smoke]` `[F:BPCam]` |
| Damage | 5 hp on a direct hit only | partial | `[F:Smoke]` |
| Counters | Projectile catchers (§2). A Mag-NET pulls it to the Mag-NET, where it releases, destroying the Mag-NET. | partial | `[F:Smoke]` |

### 3.7 Impact EMP Grenade (official names: "Impact EMP Grenade" / "EMP Impact Grenade")
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `impact_emp_grenade` | — | — |
| Side | Attack | yes | `[OP-STRIKER]` |
| Count | 2; same in Striker kit | partial (Fandom) | `[F:EMP]` `[F:Striker]` |
| Activation | Detonates on impact; does not roll | partial (Fandom) | `[F:EMP]` |
| Radius | **2 m** (Y11S2.3, was 1.8 m since Y7S3) | yes | `[PN-Y11S23]` `[DN-Y7S3]` |
| Disable duration | 9 s (Y7S3). No later change found, but the Y10S4 DSEG overhaul may have altered it: UNVERIFIED. | partial | `[DN-Y7S3]` `[SGG-EMP]` |
| Effect | Applies DSEG to enemy electronics in the radius (§2) and disables electricity sources, which enables hard breaching. Since Y10S4, it instantly deactivates Aruni's Surya Gate: the season page says it "remains off until reactivated", while the DN says it goes to Overload after the disable ends. Shuts off Clash's taser (Y10S2 DN). Siege X metal-detector ingredients can be EMP-deactivated (Y10S4.2 bug fix). | yes | `[DN-Y10S4]` `[SEASON-TENFOLD]` `[DN-Y10S2]` `[F:10.4.2]` |
| Defender gadgets affected (from our pools) | Nitro Cell, Proximity Alarm, Bulletproof Camera, Observation Blocker (electronic, 1 hp). Not affected: Barbed Wire, Deployable Shield, Impact Grenade (not electronic). | partial (Fandom Thatcher list plus Y8S2 "Type: Electronic") | `[F:EMP]` `[DN-Y8S2]` |
| Our roster gadgets affected | From Fandom's EMP list: Mute's Signal Disruptor, Pulse's Heartbeat Sensor, Lesion's Gu mines. From Fandom's Skopós page: EMP blocks her observation tools, so she cannot swap shells. Other interactions are left to `interactions.csv`. | partial | `[F:EMP]` `[F:Skopos]` |
| Mute interaction | Not blocked by Mute's jammers | partial (Fandom) | `[F:EMP]` |
| Counters | Projectile catchers | partial | `[F:EMP]` |
| Recent changes | Y11S3: removed from Dokkaebi. Y11S2.3: radius 1.8 to 2 m. | yes | `[DN-Y11S3]` `[PN-Y11S23]` |

---

## 4. Defender gadgets

### 4.1 Barbed Wire
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `barbed_wire` | — | — |
| Side | Defense | yes | `[OP-SENTRY]` |
| Count | 2; same in Sentry kit | partial | `[F:Barbed]` `[F:Sentry]` |
| Placement | Placed on the floor near the defender's feet toward the crosshair (closer when looking down). Flattens against walls and obstacles instead of passing through. Overlapping wires do not stack. | partial | `[F:Barbed]` |
| Area | 1.25 m radius from center (covers a standard doorway) | partial | `[F:Barbed]` |
| Effect on attackers | Speed −50% (Y3S2.2 value) and no sprinting. The view shakes slightly without affecting aim. Drones slowed "minimally". | yes (50%) / partial | `[F:3.2.2]` `[F:Barbed]` |
| Damage | Fandom says 5 hp/s while in the wire. UNVERIFIED and doubtful: the in-game description ("Razor wire that slows down attackers") mentions no damage. | UNVERIFIED | `[F:Barbed]` |
| Effect on defenders | No slow | partial | `[F:Barbed]` |
| Noise | Rustles for **anyone** moving through it, on either team | partial | `[F:Barbed]` |
| HP / destroyed by | Immune to bullets. **2 melee hits** from either side. Any explosion. One hit of Sledge's hammer. Maverick's torch. | partial | `[F:Barbed]` `[SGG-BARBED]` |
| Electrified (Bandit/Kaid) | Since Y10S2, applies a slow instead of damage and destroys electronic devices from either team that pass through it | yes | `[DN-Y10S2]` |
| Recent changes | None in Y10–Y11 (Noor got it in Y11S3) | yes | `[SEASON-SPLITFIRE]` |

### 4.2 Deployable Shield
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `deployable_shield` | — | — |
| Side | Defense | yes | `[OP-SENTRY]` |
| Count | 1; same in Sentry kit | partial | `[F:DeployShield]` `[F:Sentry]` |
| Placement | Placed on the floor as waist-high cover. Snaps to nearby walls and doorways and fully blocks a standard-width doorway. Two cannot go side by side in a double doorway unless placed at the same time. | partial | `[F:DeployShield]` |
| Traversal | Attackers must vault it or destroy it. Standing on top destroys it instantly (anti-exploit rule). | partial | `[F:DeployShield]` |
| Bullets | Bulletproof, including its glass slits | yes | `[F:DeployShield]` `[SGG-SHIELD]` |
| Glass | Small see-through bulletproof slits, usable from both sides. A melee hit makes the glass opaque, and it can then no longer be picked up. Since Y8S4, "drilling projectiles" (Ash's round, Kali's lance) shatter it. Glare reduced in Y10S3. | partial / yes | `[F:DeployShield]` `[DN-Y8S4]` `[DN-Y10S3]` |
| Destroyed by | Any explosion, instantly (frag, breach charge, claymore, nitro, impact, etc.). Sledge's hammer. Maverick's torch. Nomad's Airjab. Oryx's dash (Y9S1.3). | partial / yes | `[F:DeployShield]` `[PN-Y9S13]` |
| Electrified | Can be electrified. Since Y10S4, an electrified shield also destroys Ash's Breaching Rounds. | yes | `[DN-Y10S4]` |
| Held (undeployed) | Blocks a small area: waist to shoulders standing, knees to shoulders crouched | partial | `[F:DeployShield]` |
| Deploy time, HP | UNVERIFIED | UNVERIFIED | — |
| Recent changes | Y10S3: glass glare reduced. Y11S1.2: added to Smoke. Y11S2.2: added to Wamai. Y11S3: Noor. | yes | `[DN-Y10S3]` `[DN-Y11S12]` `[DN-Y11S22]` |

### 4.3 Nitro Cell (C4)
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `nitro_cell` | — | — |
| Side | Defense | yes | `[OP-SENTRY]` |
| Count | 1; same in Sentry kit | partial | `[F:C4]` `[F:Sentry]` |
| Throw | "Heavy throw" profile with shorter range than other throwables (Y3S4). **Sticks** to any surface it hits: floors, walls, ceilings, above doorways. | yes / partial | `[F:3.4.0]` `[F:C4]` |
| Activation | Remote detonation with a phone detonator | partial | `[F:C4]` |
| Damage | Maximum 171 hp within 2 m, falling fast to 0 at 6 m. Also damages through breakable surfaces. UNVERIFIED for Y11S3: this Fandom value may predate the Y6S3 health system. | UNVERIFIED | `[F:C4]` |
| Surface effect | Explosive destruction of soft surfaces. Hole size UNVERIFIED. | UNVERIFIED | — |
| Noise / visibility | A velcro "rip" when it is pulled out. Once placed, it beeps quietly and shows a red light. The beep is much quieter when heard through a breakable surface. | partial | `[F:C4]` |
| HP / destroyed by | One bullet from any weapon, which leaves a harmless puff. Any explosion in range. Brava's Kludge destroys it on hack. Twitch's drone shot. | partial | `[F:C4]` `[F:Brava]` |
| Counters | EMP disables but does not destroy it (DSEG). IQ detects it. | partial | `[F:C4]` |
| Recent changes | Y11S2.2: Wamai gets it (replacing Impacts). Y10S3: Rook gets it. No stat changes found in Y10–Y11. | yes | `[DN-Y11S22]` `[DN-Y10S3]` |

### 4.4 Impact Grenade
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `impact_grenade` | — | — |
| Side | Defense | yes | `[OP-SENTRY]` |
| Count | 2; same in Sentry kit | partial | `[F:Impact]` `[F:Sentry]` |
| Activation | Explodes on impact, or in mid-air after traveling 20 m | partial | `[F:Impact]` `[SGG-IMPACT]` |
| Damage | **40 hp** max (Y9S1.3, was 60) | yes | `[PN-Y9S13]` |
| Radius | **2 m** (Y9S1.3, was 3 m). Fandom: no damage beyond 2 m. | yes | `[PN-Y9S13]` |
| Surface effect | Soft wall at the right height: walk-through hole. Too low or too high: crouch or vault hole only. Unreinforced hatch: opened with one grenade. Soft floors: line-of-sight holes. Used for "impact tricks": destroying hard-breach gadgets through gaps above reinforcements. | partial | `[F:Impact]` `[SGG-IMPACT]` |
| Counters | Aruni's gate (not attacker-side). Shields absorb 66%. Attackers cannot shoot it down. | partial | `[F:Impact]` |
| Recent changes | Y11S2.2: removed from Wamai. Y10S3.3: added to Solis. | yes | `[DN-Y11S22]` `[DN-Y10S33]` |

### 4.5 Proximity Alarm
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `proximity_alarm` | — | — |
| Side | Defense | yes | `[OP-SENTRY]` |
| Count | 2; same in Sentry kit | partial | `[F:Prox]` `[F:Sentry]` |
| Throw | Thrown sticky gadget (Y5S2). Shows its radius and must have room to fill it to activate, with a short delay. | yes / partial | `[DN-Y5S2]` `[F:Prox]` |
| Activation | Proximity: triggered by any attacker entering its radius | yes | `[DN-Y5S2]` |
| Radius | 3 m | partial (Fandom and siege.gg) | `[F:Prox]` `[SGG-PROX]` |
| Effect | A loud beeping alarm, heard by both teams at long range and through surfaces. A HUD icon appears for the attacker who triggered it. It does not ping the attacker's position. | partial | `[F:Prox]` `[SGG-PROX]` |
| Placement quirk | Can be placed outside the building after the Prep Phase | partial | `[F:Prox]` |
| HP / destroyed by | One bullet. Twitch's drone. Explosions. | partial | `[SGG-PROX]` |
| Counters | EMP disables it. Brava's Kludge flips its allegiance so defenders trigger it. IQ. | partial | `[F:Brava]` `[F:EMP]` |
| Electronic | Yes | partial | `[F:EMP]` |

### 4.6 Bulletproof Camera
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `bulletproof_camera` | — | — |
| Side | Defense | yes | `[OP-SENTRY]` |
| Count | 1; same in Sentry kit | partial | `[F:BPCam]` `[F:Sentry]` |
| Placement | Thrown; attaches to walls, floors and other surfaces; feed starts on attach (Y6S4). Outdoors it loses signal after 10 s. | yes | `[DN-Y6S4]` `[F:BPCam]` |
| View | Joins the shared defender camera feed. Rotatable since Y6S4. Thermal view: operators show white, it ignores smoke, and the world is green-tinted. Can ping and scan. | yes / partial | `[DN-Y6S4]` `[F:BPCam]` |
| EMP dart | Fires an EMP burst that applies DSEG to attacker electronics (drones, claymores, airjabs, etc.). **Explosion range 0.75 m** (Y11S2.1, was 0.55). Any defender viewing the camera can fire it; there is no ownership. Can fire again after recharging. Recharge time and disable duration are UNVERIFIED. Cannot fire once the glass is shattered, and Attackers who hack it cannot fire it. | yes / UNVERIFIED | `[DN-Y6S4]` `[PN-Y11S21]` `[DN-Y10S4]` `[F:6.4.0]` |
| Bullets | The front plate is bulletproof; it cracks and the view becomes obscured. The side weak point dies to one bullet. | partial | `[F:BPCam]` `[SGG-BPCAM]` |
| Melee | Shatters the glass (Y6S2 mechanic): no vision, no ping or scan, no EMP; audio still works | yes / partial | `[DN-Y6S4]` `[F:BPCam]` |
| Destroyed by | Explosions. Sledge's hammer. Maverick's torch. Side-point shots, including Twitch or Zero lasers. | partial | `[F:BPCam]` |
| Counters | EMP disables it. Twitch's dart disables it for 15 s. Brava's Kludge flips it to attackers. IQ detects it. | partial | `[F:BPCam]` `[F:Brava]` |

### 4.7 Observation Blocker
| Field | Value | Verified | Source |
|---|---|---|---|
| id | `observation_blocker` | — | — |
| Side | Defense | yes | `[OP-SENTRY]` |
| Count | **3** per operator; same in Sentry kit | yes | `[DN-Y8S2]` `[F:Sentry]` |
| Placement | **Placed, not thrown** (the Y11S1 DN explains why). The arms adapt to the available space, and the projection does not pass through walls. | yes | `[DN-Y11S1]` `[DN-Y8S2]` |
| Deploy time | **1 s** (Y11S1, was 2.5 s) | yes | `[DN-Y11S1]` |
| Barrier | Up to 5 m wide and 2.2 m tall | yes | `[DN-Y8S2]` |
| Effect | Blocks the vision of **observation tools only**: drones, cameras, Iana's Gemini, Brava's Kludge. Operators cannot see the barrier and are unaffected. Drones pass through it with no penalty. | yes | `[DN-Y8S2]` `[F:OB]` |
| HP | 1 hp. Type: electronic. Vulnerable to bullets, lasers, melee and explosives. | yes | `[DN-Y8S2]` |
| Counters | EMP. Brava's Kludge flips it. IQ detects it. | partial | `[F:OB]` `[F:Brava]` |
| Recent changes | Y11S1: 1 s deploy. Y10S3: removed from Rook. | yes | `[DN-Y11S1]` `[DN-Y10S3]` |

---

## 5. Gadget change log (last 4+ seasons, plus older changes that still define values)

| Patch | Date | Change | Source |
|---|---|---|---|
| Y11S3.1 | 2026-09-22 | No generic secondary gadget changes | `[PN-Y11S31]` |
| Y11S3 | 2026-09-01 | Claymore damage 150 → **155**. Dokkaebi: Impact EMP removed, Breach Charge added. | `[DN-Y11S3]` |
| Y11S2.3 | 2026-08-04 | Impact EMP radius 1.8 → **2 m**. Mute disruptor 2.475 → 2.6 m (warning 4.75 → 4.875 m). | `[PN-Y11S23]` |
| Y11S2.2 | 2026-07-14 | Wamai: +Deployable Shield; Impact Grenades replaced by Nitro Cell | `[DN-Y11S22]` |
| Y11S2.1 | 2026-06-23 | Bulletproof Camera EMP dart explosion range 0.55 → **0.75 m** | `[PN-Y11S21]` |
| Y11S2.0 | 2026-06-02 | No generic gadget changes on the season page (the full Y11S2 DN was not found) | `[SEASON-SYSTEMOVERRIDE]` |
| Y11S1.2 | 2026-04-14 | Jackal +Frag. Smoke +Deployable Shield. | `[DN-Y11S12]` |
| Y11S1 | 2026-03-03 | Observation Blocker deploy 2.5 → **1 s** | `[DN-Y11S1]` |
| Y10S4 | 2025-12 | DSEG overhaul (all optics, refresh, no remote triggering while in field). Mute jams wireless signals only. Surya Gate vs EMP change. Castle panels electrifiable. Electrified surfaces destroy Ash's rounds. Reinforcement detaches only when a full line is cut. | `[DN-Y10S4]` |
| Y10S3.3 | 2025 | Solis: +Impact Grenade, −Bulletproof Camera | `[DN-Y10S33]` |
| Y10S3 | 2025-09-02 | Deployable Shield glass glare reduced. Rook: −Observation Blocker, +Nitro Cell. | `[DN-Y10S3]` |
| Y10S2 (Siege X) | 2025-06-10 | Electricity neutral (destroys any team's electronics, no operator damage, slows). Rappel breach no longer needs a Breach Charge. Clash lost her Deployable Shield. | `[DN-Y10S2]` |
| Y10S1 | 2025-03 | No balancing changes | `[DN-Y10S1]` |
| Y9S4.2 | 2025 | Kapkan: Nitro Cell → Barbed Wire. Buck: Hard Breach → Claymore. | `[DN-Y9S42]` |
| Y9S3 | 2024 | Claymore: 0.2 s activation-to-explosion delay removed | `[DN-Y9S3]` |
| Y9S1.3 | 2024 | Impact Grenade 60 → **40 hp**, radius 3 → **2 m**. Oryx's dash destroys Deployable Shields. Shield guard break at 30 hp. | `[PN-Y9S13]` |
| Y8S4 | 2023-12 | Frag: no cooking; fuse 5 → 4 s; drops to 2 s after first bounce | `[DN-Y8S4]` |
| Y8S2 | 2023 | Observation Blocker introduced: 3 per op, 5 m × 2.2 m, 1 hp, electronic | `[DN-Y8S2]` |
| Y7S3 | 2022-09 | Impact EMP introduced (1.8 m, 9 s). Frag non-lethal radius 3.6 m. Hard Breach fuse 5 → 4 s (deploy 2 s). | `[DN-Y7S3]` |
| Y7S1.2 | 2022-04-19 | Claymore count 1 → 2 | `[F:7.1.2]` |
| Y6S4 | 2021-11 | Bulletproof Camera: rotation plus EMP burst. Outdoor cameras lose signal after 10 s. | `[DN-Y6S4]` |
| Y6S3.3 | 2021 | Hard Breach Charge count 1 → 2 | `[F:6.3.3]` |
| Y5S3 | 2020-09 | Hard Breach Charge introduced (then 3 s deploy, 6 s fuse, crouch/vault hole). Reinforced hatch 1M HP pool. | `[DN-Y5S3]` |
| Y5S2 | 2020-06 | Proximity Alarm introduced | `[DN-Y5S2]` |
| Y4S1 | 2019-03 | Breach Charge: faster deploy; placer-side damage 150 → 50; wider damage area and smaller lethal area on the far side | `[F:4.1.0]` |
| Y3S4 | 2018-12 | New throw curve for throwables; Nitro Cell uses the "heavy throw" profile | `[F:3.4.0]` |
| Y3S2.2 | 2018-07 | Barbed Wire slow 45% → 50% | `[F:3.2.2]` |

---

## 6. Suggested data table (for `data/gadgets.json`; UNVERIFIED rows carry labeled placeholders)

| id | side | count | kit_count | trigger | fuse_s | dmg_max_hp | dmg_full_radius_m | dmg_zero_radius_m | effect_radius_m | effect_duration_s | electronic | bulletproof | verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| breach_charge | atk | 3 | 3 | remote | — | far side PLACEHOLDER 150 (UNVERIFIED); placer side 50 | PLACEHOLDER 0.5 (UNVERIFIED) | 1.0 (Fandom) | tinnitus 3 | — | yes (jammable) | no | partial |
| hard_breach_charge | atk | 2 | 2 | timed after 2 s deploy | 4 | 5 | 0.5 | 0.5 | — | — | UNVERIFIED | UNVERIFIED | partial |
| claymore | atk | 2 | 2 | laser, 3 beams × 2 m, ±30° | arm 1, detonate 0 | 155 | 2 (UNVERIFIED) | 6 (UNVERIFIED) | — | — | yes (BP cam EMP) | no | yes (dmg) |
| frag_grenade | atk | 2 | 2 | timed | 4, or 2 after first bounce | PLACEHOLDER 150 (UNVERIFIED) | UNVERIFIED | 3.6 (non-lethal edge) | — | — | no | no | partial |
| stun_grenade | atk | 2 | 3 (UNVERIFIED) | timed | PLACEHOLDER 3, or 2 after first bounce | 5 (direct hit) | — | — | 15 facing / 11 full / 3 away / 8 tinnitus | 5 | no | no | partial |
| smoke_grenade | atk | 2 | 2 | timed | 3, or 2 after surface hit | 5 (direct hit) | — | — | 2.5 (5 m diameter) | 10 | no | no | partial |
| impact_emp_grenade | atk | 2 | 2 | impact | 0 | 5 (direct hit) | — | — | 2.0 | 9 | — | no | yes (radius) |
| barbed_wire | def | 2 | 2 | area | — | PLACEHOLDER 0 (Fandom says 5/s; UNVERIFIED) | — | — | 1.25 | while inside (−50% speed, no sprint) | no | yes | partial |
| deployable_shield | def | 1 | 1 | placed | — | — | — | — | — | — | no | yes (explosion kills) | partial |
| nitro_cell | def | 1 | 1 | remote | — | 171 (UNVERIFIED) | 2 | 6 | — | — | yes | no | partial |
| impact_grenade | def | 2 | 2 | impact or 20 m | 0 | 40 | UNVERIFIED | 2 | — | — | no | no | yes |
| proximity_alarm | def | 2 | 2 | proximity | — | — | — | — | 3 | while inside | yes | no | partial |
| bulletproof_camera | def | 1 | 1 | manual EMP dart | recharge UNVERIFIED | — | — | — | EMP 0.75 | UNVERIFIED | yes | front only | partial |
| observation_blocker | def | 3 | 3 | always on; 1 s deploy | — | — | — | — | barrier 5 w × 2.2 h | permanent | yes (1 hp) | no | yes |

---

## Open questions
Each item below is UNVERIFIED and phrased so Ulo can answer it in game, for example in a Custom Game with the Shooting Range or friendly fire on.
- **Frag Grenade damage (Y11S3):** How much hp does a frag do at point-blank range to a Light (100 hp) operator? Does a clean frag still one-shot a Heavy (125 hp)? A kill-feed or damage-number test in Custom Game would settle it. The Fandom value 142 is from the pre-Y6S3 armor era.
- **Nitro Cell damage:** Is the maximum still about 171 within 2 m, falling to 0 at 6 m? Does it one-shot Heavy plus Rook armor (150 hp)?
- **Breach Charge:** What is the count now (3?), and how many does Dokkaebi get since Y11S3? How much damage does it do on the far side (is it lethal at contact, and at what radius)? What is the deploy time? Can one bullet destroy it, or only explosives and electricity?
- **Hard Breach Charge:** Since the Y10S4 change to Mute ("wireless only"), does a Mute jammer still stop it? Can gunfire destroy it? Does one Hard Breach Charge still fully open a reinforced hatch?
- **Stun Grenade:** Does Striker really get 3 stuns while Thermite and Sledge get 2? What is the fuse if it never bounces, and is the blind still about 5 s?
- **Smoke Grenade:** Is the cloud still about 5 m across, and does it last about 10 s?
- **Claymore:** Is it still full damage to 2 m, falling to 0 at 6 m? Is it 1-shot by bullets? Does it arm after 1 s? Does it damage barricades? Does a Mute jammer affect it now (Fandom says no)?
- **Barbed Wire:** Does plain (non-electrified) barbed wire deal any damage? Is it still 2 melee hits to break?
- **Impact EMP:** Did the Y10S4 DSEG overhaul change its 9 s disable time?
- **Bulletproof Camera EMP dart:** What is the recharge time between darts, and how long does the target stay disabled?
- **Deployable Shield:** What are the deploy time and size? Can melee destroy it, or only turn the glass opaque?
- **Y11S2.0 Designer's Notes** were not found online. Confirm there were no generic gadget stat changes at the Y11S2 launch.
- **Hole sizes:** No official hole dimensions exist for any gadget. Ulo's screenshots of a breach-charge hole, an impact-grenade hole and a hard-breach hole next to an operator, for scale, would help.

## Sources
Official Ubisoft (highest priority):
- [OP-STRIKER] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/striker — attacker gadget pool (7)
- [OP-SENTRY] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/sentry — defender gadget pool (7)
- [OP-BRAVA] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/brava — Smoke, Claymore
- [OP-FUZE] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/fuze — Breach, Hard Breach, Smoke
- [OP-THERMITE] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/thermite — Smoke, Stun
- [OP-DOKKAEBI] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/dokkaebi — Smoke, Breach
- [OP-SLEDGE] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/sledge — Frag, Stun, Impact EMP
- [OP-SKOPOS] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/skopos — Impact, Proximity Alarm
- [OP-MIRA] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/mira — Proximity Alarm, Nitro Cell
- [OP-LESION] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/lesion — Observation Blocker, Bulletproof Camera
- [OP-PULSE] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/pulse — Nitro Cell, Deployable Shield, Observation Blocker
- [OP-MUTE] https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/mute — Bulletproof Camera, Nitro Cell
- [DN-Y11S3] https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/PONCuRt8LaCr3O31NkBQb/y11s3-designers-notes — Claymore 155, Dokkaebi gadget swap
- [PN-Y11S31] https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes — no gadget changes
- [PN-Y11S3-ADD] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/6HzsdnbOYovXelORy4mB7z/y11s3-patch-notes-addendum — no gadget changes
- [SEASON-SPLITFIRE] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/splitfire — Noor's gadgets, Dokkaebi loadout
- [PN-Y11S23] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2EIn06EmkAIG7su2fpITue/y11s23-patch-notes — Impact EMP 2 m, Mute 2.6 m
- [DN-Y11S22] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/77rztlEyeqhZVqROCW0ZV7/designers-notes-y11s22-midseason-update — Wamai loadout
- [PN-Y11S21] https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/7tAny5W9p4yrHmIiH51noI/y11s21-patch-notes — Bulletproof Camera EMP dart 0.75 m
- [SEASON-SYSTEMOVERRIDE] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/systemoverride — Y11S2 balancing (no generic gadget changes)
- [DN-Y11S12] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/4PenO2OgIyZV1AJSMKGllX/y11s12-designers-notes — Jackal frag, Smoke shield
- [DN-Y11S1] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5fWCjoCU8toUJiBdMSj0UA/y11s1-designers-notes — Observation Blocker 1 s, not throwable
- [SEASON-SILENTHUNT] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/silenthunt — Solid Snake gadgets, Observation Blocker, Dual Front
- [DN-Y10S4] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes — DSEG, Mute wireless-only, reinforcement rule
- [SEASON-TENFOLD] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/tenfoldpursuit — DSEG summary, Surya/EMP, electrified shields
- [DN-Y10S33] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/4Op8C264buFE1uaO6OjoRk/y10s33-designers-notes — Solis loadout
- [DN-Y10S3] https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/4czc3hlHtXrd27crELGDcc/y10s3-designers-notes — Deployable Shield glare, Rook loadout
- [DN-Y10S2] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes — electricity neutral, rappel breach, Clash/Sledge EMP
- [SEASON-DAYBREAK] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/daybreak — Siege X systems, tinnitus option, ingredients
- [DN-Y10S1] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/11OmVXw4ysjxBGg3lY6HtB/y10s1-designers-notes — no balancing in Y10S1
- [DN-Y9S42] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/7bfYr7UJrJwiEp7zpQa0dd/y9s42-designers-notes — loadout swaps
- [DN-Y9S3] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1P21T5Rllq7X72E0zSGpEG/y9s3-designers-notes — Claymore delay removed
- [PN-Y9S13] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/6ZsfBMeGT0Anuu0IHjDQ0P/y9s13-patch-notes — Impact Grenade 40 hp / 2 m
- [DN-Y8S4] https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/1BZt0t9asNHvdTBHU9OUGZ/y8s4-designers-notes — Frag fuse system
- [DN-Y8S2] https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/42o6BhsFgmPla9wmiJ5GnJ/y8s2-designers-notes — Observation Blocker base stats
- [DN-Y7S3] https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/2vKaDckg5VPV1ViA4p8KM/y7s3-preseason-designers-notes — Impact EMP 1.8 m / 9 s, frag 3.6 m, Hard Breach 2 s + 4 s
- [DN-Y6S4] https://www.ubisoft.com/en-au/game/rainbow-six/siege/news-updates/6b2rj9Kf1onAvpLRqvNB1r/y6s4-preseason-designers-notes — Bulletproof Camera rework, outdoor 10 s
- [DN-Y5S3] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2LqpNY95OdSdWBB8SBEmbg/y5s3-preseason-designers-notes — Hard Breach intro, hatch HP pool, Bandit trick
- [DN-Y5S2] https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5uO2YSAhA1TzWclMco3A13/y5s2-preseason-designers-notes — Proximity Alarm intro

Fandom wiki (via MediaWiki API; lower priority, used for unpublished base values):
- [F:Striker] https://rainbowsix.fandom.com/wiki/Striker_(Recruit) — kit counts
- [F:Sentry] https://rainbowsix.fandom.com/wiki/Sentry_(Recruit) — kit counts
- [F:Breach] https://rainbowsix.fandom.com/wiki/Breach_Charge/Siege — Breach Charge behavior
- [F:HBC] https://rainbowsix.fandom.com/wiki/Hard_Breach_Charge — Hard Breach behavior, damage
- [F:M67] https://rainbowsix.fandom.com/wiki/M67/Siege — Frag (stale damage)
- [F:Stun] https://rainbowsix.fandom.com/wiki/Stun_Grenade/Siege — stun ranges and duration
- [F:Smoke] https://rainbowsix.fandom.com/wiki/Smoke_Grenade — smoke cloud
- [F:EMP] https://rainbowsix.fandom.com/wiki/EMP_Grenade — Impact EMP, affected gadget list
- [F:Claymore] https://rainbowsix.fandom.com/wiki/Claymore — lasers, falloff (stale damage)
- [F:Impact] https://rainbowsix.fandom.com/wiki/Impact_Grenade — Impact Grenade behavior
- [F:DeployShield] https://rainbowsix.fandom.com/wiki/Deployable_Shield — shield behavior
- [F:Barbed] https://rainbowsix.fandom.com/wiki/Barbed_Wire — wire behavior
- [F:BPCam] https://rainbowsix.fandom.com/wiki/Bulletproof_Camera — camera behavior
- [F:C4] https://rainbowsix.fandom.com/wiki/C4 — Nitro Cell
- [F:Prox] https://rainbowsix.fandom.com/wiki/Proximity_Alarm — Proximity Alarm
- [F:OB] https://rainbowsix.fandom.com/wiki/Observation_Blocker — Observation Blocker
- [F:Destruction] https://rainbowsix.fandom.com/wiki/Destruction — surface classes and indicator lights
- [F:Armor] https://rainbowsix.fandom.com/wiki/Armor_and_Speed — 100/110/125 HP since Y6S3
- [F:Mute] https://rainbowsix.fandom.com/wiki/Mute — jammer interaction list (post-Y10S4)
- [F:Brava] https://rainbowsix.fandom.com/wiki/Brava — Kludge hack/destroy list
- [F:Skopos] https://rainbowsix.fandom.com/wiki/Skopós — Claymore and EMP interactions with shells
- [F:Fuze] https://rainbowsix.fandom.com/wiki/Fuze_(Siege), [F:Thermite] https://rainbowsix.fandom.com/wiki/Thermite_(Siege), [F:Sledge] https://rainbowsix.fandom.com/wiki/Sledge_(Siege) — gadget counts
- [F:3.2.2] https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_3.2.2 — barbed wire 50%
- [F:3.4.0] https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_3.4.0 — throw curves, heavy throw
- [F:4.1.0] https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_4.1.0 — Breach Charge rework
- [F:6.3.3] https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_6.3.3 — Hard Breach count 2
- [F:6.4.0] https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_6.4.0 — Bulletproof Camera EMP not usable by attackers
- [F:7.1.2] https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_7.1.2 — Claymore count 2
- [F:10.4.2] https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_10.4.2 — EMP vs metal detector fix
- [PN-Y11S11 via F:11.1.1] https://rainbowsix.fandom.com/wiki/Rainbow_Six_Siege_patches/Patch_11.1.1 (official: https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1e0rA6EwYGMNvMTSM9hmTA/y11s11-patch-notes) — Rook armor +25

Other:
- [SGG-STUN] https://siege.gg/news/stun-grenade — stun detonates 2 s after first bounce
- [SGG-EMP] https://siege.gg/news/impact-emp-grenade — Impact EMP 9 s (article partly stale)
- [SGG-BARBED] https://siege.gg/news/barbed-wire — 2 melee hits
- [SGG-SHIELD] https://siege.gg/news/deployable-shield — bulletproof
- [SGG-IMPACT] https://siege.gg/news/impact-grenade — 20 m travel, hatch in one (its "60 HP" is stale)
- [SGG-PROX] https://siege.gg/news/proximity-alarm — 3 m, one bullet, Brava interaction
- [SGG-BPCAM] https://siege.gg/news/bulletproof-camera — side weak point, one bullet
