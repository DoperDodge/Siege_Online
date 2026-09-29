# Thermite (Attacker) — Brimstone BC-3 Exothermic Charge
Verified against: Y11S3 (Operation Split Fire) — researched 2026-09-29
Confidence: medium-high for loadout, charge count, damage, the Mute interaction, and change history (official notes). Medium for plant and heat-up timings and blast radii (Fandom only). Low for breach-hole dimensions (not published anywhere; UNVERIFIED).

> Key findings vs PLAN.md §11.1:
> - The loadout now includes the **ITA12S** secondary shotgun (added Y10S4) alongside the 5.7 USG and M45 MEUSOC. Gadgets are **Smoke Grenade or Stun Grenade** (confirmed).
> - He carries **3** Exothermic Charges (up from 2 in Y10S4). Charge damage is **220 HP** (up from 200 in Y11S3.1).
> - **Mute's jammers do counter him:** he can't trigger a charge if the charge (or Thermite himself) is inside a jammer's radius. Ubisoft restated this explicitly in Y10S4.

---

## 1. Identity

| Field | Value | Source / status |
|---|---|---|
| Side | Attacker | Official operator page |
| CTU (unit shown on page) | SWAT (FBI SWAT) | Official operator page |
| Squad | Redhammer | Official operator page |
| Specialties (official tags) | BREACH, SUPPORT | Official operator page |
| Health rating | 2 of 3 ("Medium") → 110 HP | Official stars 2/3; HP mapping from Fandom "Armor and Speed" (see `research/core_mechanics.md`) |
| Speed rating | 2 of 3 | Official stars 2/3 |
| Difficulty | 1 of 3 | Official stars |
| Real name | Jordan Trace | Official page |

## 2. Loadout (official page, Y11S3)

| Slot | Options | Notes |
|---|---|---|
| Primary | **556xi** (Assault Rifle), **M1014** (Shotgun) | M1014 damage 30 (from 28) in Y11S3.1. Stats → `research/weapons.csv`. |
| Secondary | **5.7 USG** (Handgun), **M45 MEUSOC** (Handgun), **ITA12S** (Shotgun) | ITA12S added in **Y10S4** |
| Secondary gadget (choose 1) | **Smoke Grenade** ×2, **Stun Grenade** ×2 | Counts from Fandom. Generic stats → `research/gadgets.md`. |
| Unique ability | **Exothermic Charge** ×3 | 3 since Y10S4 (was 2) |

## 3. Unique ability: Exothermic Charge

Official in-game description (Fandom): "Sets an exothermic charge that destroys reinforced walls." The official tip says it has "a bigger destruction range than a regular breach charge. Hatches, Floors & Corners can also be breached to open bigger line of sight."

### 3.1 Numbers and rules

| Property | Value | Status / source |
|---|---|---|
| Charges per round | **3** | Official Y10S4 DN / Tenfold Pursuit page ("Increased the amount of charges to 3 (from 2)") |
| Plant (deploy) animation | **~3 s**, longer than a Breach Charge. With the "Advanced" gadget-deployment control setting it can be cancelled partway. | Fandom. Medium confidence. |
| Trigger | **Remote**: Thermite presses a detonator (so Mute and DSEG apply) | Fandom; official Y10S4 DN ("can't trigger an exothermic charge inside the radius of one of Mute's jammers") |
| Heat-up after trigger | **~3 s** "burn" before the blast ("breach through any Reinforced Wall within three seconds of activation"). Visible sparks **on both sides** and a loud sizzle warn the defenders. | Fandom. Medium confidence. |
| Valid surfaces | "Any destructible surface, including reinforced ones": soft walls, reinforced walls, soft floors/ceilings, hatches (normal or reinforced). **Not** hard (concrete) walls/floors. Also usable on the **opaque (attacker) side of a Black Mirror** wall. | Fandom Thermite / Mira / Destruction pages; official tip |
| Barricades / windows | UNVERIFIED (not documented) | — |
| Reinforced hatch | **One charge opens a reinforced hatch.** Hatches have a 1,000,000-point pool and one Exothermic deals 1,000,000 (for comparison: X-Kairos 250k, SELMA 500k, Hard Breach 1M). Damage from different tools adds up. | Official Y5S3 Designer's Notes (mechanic still current as far as found) |
| Destruction radius | **~4 m**. It can also take out **adjacent** walls, hatches or floor. Placed on the floor next to a reinforced wall it destroys the bottom of that wall. Placed on a wall next to a reinforced hatch it destroys the hatch too. | Fandom (radius and tricks). Official tip ("bigger destruction range"). |
| Breach opening size (wall) | "Large area", bigger than a Breach Charge. **Exact dimensions UNVERIFIED.** Placeholder: roughly one full reinforcement panel. | Fandom/official qualitative only |
| Breach opening size (hatch) | The whole hatch | Y5S3 DN (1M = full hatch) |
| Damage (max) | **220 HP** since Y11S3.1 (was 200) | Official Y11S3.1 patch notes |
| Damage fall-off, far (defender) side | Lethal close to the wall; fall-off to zero at **~3–4 m** | Fandom. UNVERIFIED curve. |
| Damage, near (Thermite) side | Lethal only at point blank; much smaller radius | Fandom. UNVERIFIED radius. |
| Destroys | All destructible surfaces and gadgets in the radius. Examples: Deployable Shields (instantly), Mira's Black Mirror (if the reinforced wall it sits on is breached, or its anchors are hit), Mute jammers in the blast (only if the charge could trigger), Barbed Wire, Gu mines, BP cams | Fandom Deployable Shield / Mira / Barbed Wire / Lesion pages |
| Charge durability | "Destroyable by any source of damage" once placed (e.g. defenders shooting through a hole, explosives, electricity) | Fandom |
| Team / friendly fire | Damages anyone in the blast, Thermite included | Fandom |

### 3.2 What counters the Exothermic Charge

| Counter | Effect | In roster? | Source |
|---|---|---|---|
| **Mute Signal Disruptor** | The charge **can't be triggered** if **the charge or Thermite** is inside the jammer radius (**2.6 m** since Y11S2.3; 2.475 m in Y10S4–Y11S2.2; 2.225 m before). Nothing happens until the jammer is gone. | Yes | Official Y10S4 DN (explicit Thermite example); Tenfold Pursuit page; Fandom Mute/Reinforcement |
| Bulletproof Camera EMP dart (Sentry, Mute, Lesion) | DSEG on Thermite or the charge → "can no longer trigger their remote devices (... Exothermic charges ...)". Dart radius 0.75 m. | Yes | Official Y10S4 DN; Y11S2.1 (radius). Duration UNVERIFIED. |
| **Mira Black Mirror** | **Conflicting sources.** The official gameplay tip lists "Mira's Black Mirrors" among gadgets that "deny" Exothermic charges. Fandom says thermal breaching gadgets **can** be used on the opaque side and **destroy** the mirror when used on its reinforced wall. The likely reconciliation (UNVERIFIED): the charge can't be placed over the mirror glass itself, which leaves less usable wall, but breaching the rest of the wall destroys the mirror. | Yes | Official Thermite page tip; Fandom Mira |
| Pulse (Cardiac Sensor + Nitro Cell) | Finds Thermite's heartbeat while he plants the charge (10.5 m, through walls). He can then Nitro him through an adjacent soft wall, floor or ceiling, or hold an angle outside the blast. | Yes | mp1st copy of Y11S2 notes (range); siege.gg Fuze guide (Nitro counter logic) |
| Gunfire / explosives on the charge | Destroys it (defenders need a line of sight, e.g. murder holes, or explosives) | Yes (all) | Fandom |
| Killing / downing Thermite before he triggers | Remote charges need a live, non-downed operator. By analogy with Fuze (Fandom), UNVERIFIED for Thermite. | Yes | — |
| Bandit Shock Wire / Kaid Electroclaw | Electrified reinforcement destroys the charge on contact. Since Y10S2.2 this also applies if the charge was planted **before** the electricity was switched on. | **No** (note only) | Fandom; siege.gg Y10S2.2 notes |
| Mozzie (Pest-captured Kludge) | Can hack and **destroy** an Exothermic Charge | **No** (note only) | Fandom Brava/Mozzie |

**Ways past a jammed or electrified wall:** detonate on an **adjacent perpendicular wall or the floor** outside the jammer radius; the 4 m blast still destroys the jammed wall (Fandom). Other options: EMP the jammer (Impact EMP from Sledge or Striker); convert it with Brava; destroy it with Fuze's cluster from an unjammed surface; shoot it through a hole or from a vertical angle.

## 4. Interactions with roster defenders

| Defender gadget | Thermite → it | It → Thermite |
|---|---|---|
| **Mute** Signal Disruptor | The blast destroys jammers in radius, but only if the charge could trigger | Blocks triggering (charge or Thermite inside 2.6 m) |
| Mute / Sentry / Lesion Bulletproof Camera | Destroyed by explosives in the blast radius | EMP dart → DSEG → can't trigger. It can also watch his plant. |
| **Pulse** Cardiac Sensor | — | Detects him planting (10.5 m through walls) |
| Mute / Pulse / Mira / Sentry Nitro Cell | Destroyed if in the blast | Kills him through adjacent soft surfaces, or when thrown out once the wall is open |
| Pulse / Sentry Deployable Shield | Destroyed instantly by the blast | Cover after the breach |
| **Mira** Black Mirror | Destroyed when its reinforced wall is breached (or its anchors are hit) | Lets defenders watch the plant. Possibly limits where he can place the charge (see §3.2 conflict). |
| **Skopós** V10 Shells | The blast damages shells. It destroys the idle shell's shield (explosives). | Idle shell = camera + bulletproof cover. The active shell shoots like an operator. |
| **Lesion** Gu Mine | Destroyed if inside the far-side blast | Gu at his plant spot: 5 initial + 12 per 2 s, no sprinting, needle removal exposes him (Y8S3 values) |
| Sentry Barbed Wire | Destroyed by explosions | Slows the push through the new hole |
| Sentry / Mira / Skopós Proximity Alarm | Destroyed if in the blast (UNVERIFIED explicitly) | Alerts defenders to the plant (3 m radius) |
| Sentry / Skopós Impact Grenade | — | Kills/damages; can blow open soft surfaces for angles on him |
| **Sentry** reinforcements (all defenders) | His job: breaches them. The Y10S4 "cut a full line" detach rule mainly affects Maverick/Hibana, not the Exothermic. | — |

## 5. Interactions with roster attackers (allies)

| Ally | Interaction |
|---|---|
| **Brava** | Kludge converts Mute's jammer (and destroys Bandit/Kaid devices, which are out of roster), clearing the wall. Fandom: this "costs one of the three hacking charges". |
| **Fuze** | The cluster charge clears defender utility behind the wall (it can also go on reinforced walls, 1.75 s drill). The same jammer rule blocks it if planted within 2.6 m of a jammer. |
| **Sledge** | Impact EMP Grenade (in his loadout) DSEG-disables jammers and BP cams. His hammer opens soft floors/hatches for vertical angles on jammers. |
| **Striker** | Can take Impact EMP. Hard Breach Charge ×2 is a backup hard breach (2 s plant, 4 s fuse, not remote-triggered). Whether Mute still stops the HBC after Y10S4 is UNVERIFIED. |
| **Dokkaebi** | No direct interaction |

## 6. Change history (Y10S2 Siege X → Y11S3)

| Season / patch | Change affecting Thermite | Source |
|---|---|---|
| Pre-history | Y5S3: reinforced hatch 1M HP pool (1 Exothermic = whole hatch). Y6S1.3: Claymore replaced by Smoke. (Gadgets have been Smoke/Stun since then.) | Official Y5S3 DN; Fandom patch list |
| **Y10S2 Daybreak (Siege X)** | Electricity became neutral (it still destroys charges; players are slowed, not damaged). **Y10S2.2: fixed Exothermic and Hard Breach Charges not being destroyed by electricity when planted before the electricity was active.** | Official Y10S2 DN; siege.gg Y10S2.2 notes |
| Y10S3 High Stakes | No Thermite change found | Official Y10S3 DN; Y10S3.1–3.3 notes |
| **Y10S4 Tenfold Pursuit** | **Charges 3 (from 2). ITA12S added.** Mute rework (wireless/remote only, radius 2.475 m): Thermite "will still not be able to trigger" inside it. DSEG: an affected character can't trigger Exothermic charges. Reinforcements only detach once a full line is cut. | Official Y10S4 DN; Tenfold Pursuit page |
| Y11S1 Silent Hunt | Y11S1.2 bug fix only (pistol-cocking animation while idle with the ITA12S) | Official Y11S1.2 notes |
| Y11S2 System Override | No Thermite change found. Indirect: Pulse scan range 10.5 m. **Y11S2.3: Mute jammer radius 2.6 m (from 2.475 m); Impact EMP radius 2 m (from 1.8 m).** | mp1st copy of official Y11S2 notes; official Y11S2.3 notes |
| **Y11S3 Split Fire** | **Y11S3.1: Exothermic Charge damage 220 HP (from 200). M1014 damage 30 (from 28).** | Official Y11S3.1 patch notes |

**Outdated-guide flags:** a guide is out of date if it says any of the following. Thermite has 2 charges or no ITA12S (pre-Y10S4). Mute's jammer is a permanent EMP zone (pre-Y10S4; the effect on Thermite is unchanged). Electricity damages players (pre-Y10S2). Exothermic does 200 damage (pre-Y11S3.1).

## Open questions
- **Breach hole size** on a reinforced wall panel and on a soft wall (width × height in metres). Does one charge clear a whole reinforcement panel? Ulo can screenshot a breach in a custom game next to a known-size door.
- **Plant time (~3 s?) and heat-up time (~3 s?)** exact values.
- **Damage fall-off**: the far-side radius (3–4 m?) and the near-side lethal radius.
- Can the charge be placed on **door/window barricades**?
- The **Mira conflict**: can a charge be placed on or over the Black Mirror glass? What happens to a mirror on the breached panel?
- Does a Bulletproof Camera EMP dart stop a planted Exothermic from triggering, and for how long?
- After Y10S4, does Mute's jammer still stop a **Hard Breach Charge** (Striker/Fuze backup)?

## Sources
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators/thermite — side, CTU, squad, stars, loadout (incl. ITA12S), gameplay tips (counters: Bandit, Mute, Mira; bigger destruction range)
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/1XzWbYPWo59u7NgZVDjaIm/y10s4-designers-notes — 3 charges, ITA12S, Mute rework and explicit Thermite example, DSEG, reinforcement full-line rule
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/tenfoldpursuit — Y10S4 summary (+1 charge, ITA12S, DSEG)
- https://mp1st.com/news/rainbow-six-siege-y10s4-tenfold-pursuit-update-patch-3-16-1-000-121 — copy of the Y10S4 patch notes
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/3WMly2DNZqv1GpUK9GNGm5/y11s31-patch-notes — Exothermic damage 220, M1014 damage 30
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/8dJbwMqIt5Y8lZgwJRjWZ/y10s2-designers-notes — neutral electricity
- https://siege.gg/news/siege-x-y10s2-2-patch-notes — Y10S2.2 electricity fix for Exothermic/HBC
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/4czc3hlHtXrd27crELGDcc/y10s3-designers-notes — checked, no Thermite change
- https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/ivbm7sXcU7iG89d7wQtlx/y11s12-patch-notes — ITA12S animation fix
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2EIn06EmkAIG7su2fpITue — Y11S2.3: Mute radius 2.6 m; Impact EMP 2 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/7tAny5W9p4yrHmIiH51noI/y11s21-patch-notes — BP cam EMP dart radius
- https://mp1st.com/title-updates-and-patches/rainbow-six-siege-system-override-update-june-2-via-patch-3-38-1-000-143 — Pulse 10.5 m
- https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/2LqpNY95OdSdWBB8SBEmbg/y5s3-preseason-designers-notes — reinforced hatch 1M HP pool, per-device damage
- https://rainbowsix.fandom.com/wiki/Thermite_(Siege) — 3 s plant, 3 s heat-up, 4 m radius, fall-off, adjacent-wall tricks, counters, patch list
- https://rainbowsix.fandom.com/wiki/Mute — Exothermic unresponsive in the jammer field
- https://rainbowsix.fandom.com/wiki/Mira_(Siege) — thermal breachers usable on the opaque side; destroy the mirror
- https://rainbowsix.fandom.com/wiki/Deployable_Shield — destroyed by the Exothermic
- https://rainbowsix.fandom.com/wiki/Reinforcement and https://rainbowsix.fandom.com/wiki/Destruction — which tools breach reinforcement
- https://rainbowsix.fandom.com/wiki/Hard_Breach_Charge — HBC 2 s plant / 4 s fuse (Striker/Fuze backup)
- https://rainbowsix.fandom.com/wiki/Bandit , https://rainbowsix.fandom.com/wiki/Brava , https://rainbowsix.fandom.com/wiki/Mozzie , https://rainbowsix.fandom.com/wiki/Lesion , https://rainbowsix.fandom.com/wiki/Skopós , https://rainbowsix.fandom.com/wiki/Barbed_Wire — interaction details
