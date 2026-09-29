# SUMMARY.md — Phase 0 research digest

**Verified against: Y11S3 "Operation Split Fire" (released 2026-09-01), including the Y11S3.1 patch (2026-09-22). Researched 2026-09-29.**
Sources, in priority order (PLAN §0.3): official Ubisoft operator/map pages, patch notes, and Designer's Notes → Fandom (via its API) → siege.gg / r6calls / patch-note sites. Liquipedia rate-limited this environment, so it's under-cited. Every number in `research/` has a source URL or an `UNVERIFIED` tag. Open items: [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) (259; the top 10 come first).

## Confidence at a glance
- **High:** operator loadouts and ratings, round timers, reinforcement rules, Oregon rooms, soft walls, hatches, and bomb sites.
- **Medium:** gadget numbers, destruction rules, weapon stats (25 of 40 rows verified), interaction matrix (267 of 343 rows verified).
- **Low (needs you in-game):** exact movement speeds, stance heights, hole sizes, drone and camera numbers, camera facings, and the site setups for bots (mostly inferred, tagged `DER`).

## The plan's baseline was out of date — main corrections
- **"Legion" doesn't exist** in Siege (checked through the Y11S4 roadmap). **Lesion** was researched in its place → you need to confirm.
- **Thermite:** 3 Exothermic Charges (was 2), 220 dmg, and the ITA12S was added. **Fuze:** keeps the Ballistic Shield, but it has no hip-fire; his gadgets are Breach, Hard Breach, or Smoke; the Cluster Charge works on reinforced walls, Mira's Black Mirror, and deployable shields.
- **Dokkaebi (remastered Y11S2):** Jegeo Payload (1 charge, max 5, +1 per 25 s, 7 s, 14 s per-target cooldown). Since Y11S3 the upload needs a continuous link and Mute interrupts it. Her gadgets are Smoke plus Breach (no EMP). She can still hack dead defenders' phones.
- **Mute:** health 2 / speed 2. Since Y10S4 the jammer only blocks *remote* activation/control (2.6 m radius), so it no longer jams automated devices.
- **Pulse:** 10.5 m sensor range, Reaper MK2 added. **Lesion:** Gu mines visible since Y8S3 (max 8, +1 per 25 s); the Super Shorty was removed. **Skopós:** 3-speed / 1-health (100 HP per shell). **Sledge:** hammer swing 0.8 s; knocks shields down.
- **Striker / Sentry** come from Y9S2 New Blood (not Siege X). They pick **two different** gadgets from a pool of **7** per side (Striker also has the SR-25, Sentry the TCSG12).
- **Rules:** limb multiplier 0.75; ADS-walk speed and hip-fire spread are the same for everyone; friendly fire is off during prep; melee is a knife. **Unranked** has Pick & Ban in Siege (now adopted); Siege's order is ban → site/spawn → pick.

## Core numbers (Bomb)
| Item | Value |
|---|---|
| HP by health rating | 100 / 110 / 125 (no armor damage reduction since Y6S3) |
| Prep / action / plant / defuser fuse / disable | 45 s / 180 s / 7 s / 45 s / 7 s |
| Ranked & Unranked | 6 rounds, first to 4, swap after round 3; overtime at 3–3, up to 3 rounds (first to 5) |
| Quick Match | 4 rounds, first to 3, swap after round 2, 1 sudden-death OT round; random site revealed; pre-setups |
| Reinforcements | Shared pool of **10**, 4.5 s each, one per wall section; hatches from above only; only hard-breach/thermal tools open them (since Y10S4, a full line must be cut) |
| Drones | 2 per attacker; defenders keep using cameras when dead; attackers keep their own surviving drones |

## Oregon (what we'll build — see DECISIONS D-013)
- **Layout:** the **Y5S1 (2020) rework**, plus the **Y11S1 (March 2026) modernization** layer: **7 fire extinguishers + 2 gas pipes** (no metal detectors), new lighting. No layout change was found. Oregon left Ranked mid-Y11S1 but is still live in other playlists.
- **Sites (confirmed):** B Laundry / B Supply · 1F Kitchen / 1F Dining Hall · 1F Meeting Hall / 1F Kitchen · 2F Kids' Dorms / 2F Dorms Main Hall.
- **Surfaces:** 32 soft (reinforceable) walls = 54 reinforcement sections; the Garage south wall is the only soft exterior wall. 6 hatches. Soft floors only on 2F and the 3F catwalk; the 1F floor is hard except 3 hatches.
- **Access:** 3 attacker spawns (Junkyard, Street, Construction Site), 5 staircases, a ladder up to the Big Tower's 3F Cat Walk, and 8 default cameras (single source; facings unknown).

## Our 12 operators — current loadouts (official pages, 2026-09-29)
| Operator | Primaries | Secondaries | Gadgets |
|---|---|---|---|
| Brava | PARA-308, CAMRS | USP40, Super Shorty | Smoke, Claymore |
| Fuze | AK-12, 6P41, Ballistic Shield | PMM, GSh-18 | Breach, Hard Breach, Smoke |
| Thermite | 556xi, M1014 | 5.7 USG, M45 MEUSOC, ITA12S | Smoke, Stun |
| Striker | M4, M249, SR-25 | 5.7 USG, ITA12S | any 2 different of 7 |
| Dokkaebi | BOSG.12.2, Mk 14 EBR, XK23 | C75 Auto, GONNE-6, SMG-12 | Smoke, Breach |
| Sledge | L85A2, M590A1 | P226 Mk 25, Reaper MK2 | Frag, Stun, Impact EMP |
| Sentry | Commando 9, M870, TCSG12 | C75 Auto, Super Shorty | any 2 different of 7 |
| Skopós | PCX-33 | P229 | Impact Grenade, Proximity Alarm |
| Mira | Vector .45 ACP, ITA12L | USP40, ITA12S | Proximity Alarm, Nitro Cell |
| Lesion (for "Legion") | SIX12 SD, T-5 SMG | Q-929 | Observation Blocker, Bulletproof Camera |
| Pulse | UMP45, M1014 | 5.7 USG, M45 MEUSOC, Reaper MK2 | Nitro Cell, Deployable Shield, Observation Blocker |
| Mute | MP5K, M590A1 | P226 Mk 25, SMG-11 | Bulletproof Camera, Nitro Cell |

## File map
`core_mechanics.md` movement, health, DBNO, damage · `destruction.md` surfaces, penetration, reinforcement, ingredients · `round_flow.md` timers, playlists, Pick & Ban · `intel.md` drones, cameras, pings · `gadgets.md` all 14 generic gadgets · `weapons.csv` + `weapons_notes.md` 40 weapons · `operators/*.md` 12 operators (+ `legion_name_check.md`) · `interactions.csv` + `interactions_notes.md` 343 gadget interactions · `oregon/` version, layout, surfaces, map features, common setups, screenshot checklist, reference list.

## Open decisions before Phase 1
1. **Browser vs desktop stack** (DECISIONS D-019). You want browser play; confirm the switch to a web stack.
2. **"Legion" = Lesion?** (D-011)  3. **1v1 reinforcement pool: 2 (plan formula) or 6 (Siege)?** (D-015)
