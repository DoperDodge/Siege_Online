# OPEN_QUESTIONS.md — things research could not verify

Verified against: Y11S3 (Operation Split Fire) — compiled 2026-09-29
Total: **259 questions from 25 files** (collected from each file's "Open questions" section; the file link shows where the context is). Placeholders invented while building each phase are listed after the Oregon files.

**How to answer:** reply in chat, or edit this file and write your answer under the question (e.g.
`> Ulo: 6 reinforcements`). Most of these take seconds in a **Custom Game → Local**, with the timer off.
Anything you answer replaces an `UNVERIFIED` placeholder in the data. Items 1–3 are answered; nothing
else here blocks Phase 1.

## Answer these first

| # | Question | Why it matters | Where |
|---|---|---|---|
| 1 | ✅ **Answered: browser** (D-019/D-020). ~~**Browser or desktop?** Switch the stack to a browser game (TypeScript + Three.js + a Node server on Railway, WebSockets), or keep the plan's Windows desktop build (Godot C#, ENet/UDP)? ~~ | Decides the whole tech stack before Phase 1. | DECISIONS.md D-019 |
| 2 | ✅ **Answered: yes, Lesion** (D-011). ~~**"Legion" = Lesion?** No Siege operator is named Legion. Lesion (Gu mines) was researched in its place.~~ | Needs a yes, or the real name, before Phase 8. | [operators/legion_name_check.md](operators/legion_name_check.md) |
| 3 | ✅ **Answered: 6, like Siege** (D-015). ~~**1v1 reinforcements:** keep the plan's scaling (1 defender → **2** reinforcements), or use Siege's own 1v1 Arcade value (**6**)?~~ | The plan formula makes 1v1 defense much harder than Siege's. | DECISIONS.md D-015 |
| 4 | **Repo visibility:** the GitHub repo is **public**. Make it private before you add screenshots? | Your screenshots are Ubisoft game imagery. | [oregon/SCREENSHOT_CHECKLIST.md](oregon/SCREENSHOT_CHECKLIST.md) |
| 5 | **Oregon layout:** since the March 2026 modernization, have you noticed any wall, door, window, or hatch that changed? | We build the 2020 layout plus the 2026 gas pipes and extinguishers, assuming no layout change. | [oregon/version.md](oregon/version.md) |
| 6 | **Soft vs hard walls and reinforcement counts** per site, plus default camera facings. The 30-minute minimum screenshot set answers most of these at once. | This is what makes the map feel like Oregon; it's also what the bots' setups rely on. | [oregon/SCREENSHOT_CHECKLIST.md](oregon/SCREENSHOT_CHECKLIST.md), [oregon/surfaces.md](oregon/surfaces.md) |
| 7 | **Movement speeds:** two community datasets disagree for 1/2-speed sprint (4.0/4.5 vs 4.25/4.75 m/s). Crouch, prone and ADS-walk speeds are unknown. | Movement feel is Phase 1's "done when". | [core_mechanics.md](core_mechanics.md) Q1 |
| 8 | **Weapon destruction tiers** (Low/Medium/High/Full) for each roster gun. They're shown in-game under *Detailed Weapon Stats*. | Drives wallbang and hole-making per gun (Phases 3–4). | [destruction.md](destruction.md), [weapons_notes.md](weapons_notes.md) |
| 9 | **Skopós:** when the **idle** shell is destroyed, is she eliminated? Her operator page says losing a shell cuts both; the official Twin Shells guide says no. | Core rule for her two-pawn design. | [operators/skopos.md](operators/skopos.md) |
| 10 | **Mute's jammer** vs **Hard Breach Charge** and vs **Fuze's Cluster Charge**, after the Y10S4 jammer change. | Biggest disputed rows in the interaction matrix. | [interactions_notes.md](interactions_notes.md) |

## All open questions, by file


### [oregon/version.md](oregon/version.md) — 4

- (Ulo) Since Silent Hunt (March 2026), have you noticed **any** layout difference on Oregon: a wall that became hard or soft, a new or removed window, door or hatch, a changed room? We assume none.
- (Ulo) Is Oregon in **Ranked** right now (Y11S3)? It doesn't affect the build, but it corrects version notes and SUMMARY.
- (Ulo) Are there **metal detectors** on modernized Oregon, or only gas pipes and fire extinguishers? This is for the ingredients agent.
- The exact content of the "overall health pass" is unknown. If Ubisoft published a Designer's Note or video on the Oregon modernization, it should be checked. None was found; the shared WebSearch budget ran out before a targeted search.

### [oregon/layout_notes.md](oregon/layout_notes.md) — 10

(For Ulo — a Custom Game walk-through answers most of these.)
1. **Scale:** stand at a doorway and estimate its width, or tell us how many reinforcements the Kitchen↔Meeting soft wall takes (we expect 2). This calibrates the 0.15 m/u estimate.
2. **Storey heights:** roughly how tall are B, 1F, 2F? Is Meeting Hall a tall single-storey room (pitched ceiling), with the Attic only along its east side?
3. **Exterior openings — door or window?**
   - 1F: Small Tower west, Small Tower south, Shower Corridor south, Security Corridor SW-south, Kitchen Corridor west, Tower north, Tower east, Garage north/south/east, Classroom west.
   - 2F: Kids' north, Dorms→Dining Roof, Office north, Small Tower south, Game Room south, Master→Balcony, Attic west, Armory Corridor north, Armory east, 2F Tower north ×2 / south ×2.
   - 3F: Catwalk north and south.
4. Is the **Garage south wall** a destructible garage door (2 reinforcements)?
5. Where does the **exterior staircase east of the 1F Tower** lead: down to the Bunker side, or up?
6. Does **Freezer Stairs (B) come up into White Stairs (1F)**, and do both White Stairs and Armory Stairs continue to 2F?
7. Is the **3F Cat Walk** a ring around an open drop to 2F, or is its middle solid?
8. Does **2F Middle ↔ Game Room** have a door (barricadable), or is it an open archway?
9. Where do the **basement drone tunnels** lead? One enters from the south exterior near White/Freezer Stairs; one runs along Supply's SE strip.
10. Any **callout names** that differ from the table? What do you and your squad call these rooms, and what does the in-game HUD show?

### [oregon/surfaces.md](oregon/surfaces.md) — 9

1. **Default HARD rule:** is every wall not in §2 really indestructible? Please spot-check in a Custom Game:
   - (a) Kitchen north exterior wall;
   - (b) Dining north exterior wall;
   - (c) Meeting Hall east exterior wall (and does it have windows?);
   - (d) the Kitchen–Security wall between the two soft sections (x 164–184);
   - (e) Boiler–Corridor walls in the basement.
2. **Section counts:** how many reinforcements do these take:
   - Kitchen↔Meeting (expected 2);
   - Kitchen↔Dining (expected 1);
   - Laundry↔Freezer (expected 2);
   - Kids'↔Dorms (expected 2);
   - Garage south wall (expected 2)?
3. **Garage south:** is it a roll-up/garage-door-style destructible panel, or a normal soft wall?
4. **1F floor over the basement:** confirm it is indestructible (no vertical into Laundry/Supply except via the 3 hatches). One low-quality guide claims soft floors above Laundry.
5. **Soft floors:** is the **Trophy** floor (south half) destructible? The **2F White Stairs landing**? Only Ubisoft's 2020 blueprint marks them.
6. **Roofs:** confirm no roof section is breakable. Also: are the two Small Tower roof skylights breakable/enterable?
7. **Exterior openings:** for each EXT_OPENING in `layout_notes.md` §6 — door or window, and can defenders barricade it?
8. **3F catwalk:** is the middle an open drop to 2F, and can the catwalk floor be shot or blown through?
9. Are any **doorways NOT barricadable**? For example, the Split doors, the Stage door, or 2F Middle↔Game Room (we tagged that one OPEN).

### [oregon/map_features.md](oregon/map_features.md) — 12

- **Q1 (cameras):** r6calls shows **8** default cameras: EXT Junkyard/Bus, EXT Parking/Street, EXT Construction, B Freezer, 1F Rear Stage, 1F Lobby, 1F Shower Corridor, 2F Armory Corridor. Is that right? For each, which wall is it on and which way does it face (a screenshot of its view)?
- **Q2 (ingredients):** r6calls shows **7 fire extinguishers** (B Basement Hall, B Freezer, 1F Security Corridor, 1F Kitchen Corridor, 1F Lobby hall, 2F Trophy, 2F Low Attic) and **2 gas pipes** (1F by Main Stairs / Garage SW corner, 2F Attic). Is that all? Which wall and height is each on? Any metal detectors?
- **Q3 (Laundry hatch):** Does the 1F Lobby hatch (next to Classroom) drop into Laundry Storage, Laundry Room, or the Laundry Stairs?
- **Q4 (stairs):** Are Main Stairs (1F↔2F) and Laundry Stairs (B↔1F) one stairwell or two separate flights? Where exactly does each flight start and end?
- **Q5 (Small Tower):** r6calls labels "Small Stairs" in Small Tower. Confirm the staircase between 1F and 2F. Is there an office on both floors ("1F Small Tower Office" appears in a patch note)?
- **Q6 (Big Tower ladder):** Confirm the ladder spot (north edge of the open well in Big Tower 2F's east room). Is the tower top ("Cat Walk") indoors, i.e. no out-of-bounds reveal?
- **Q7 (Bunker):** Confirm the outside stairs down into Blue Bunker, and where they start outside.
- **Q8 (spawn names):** Are the in-game spawn names exactly "Junkyard", "Street", "Construction Site"? Are there only 3?
- **Q9 (rappel):** Any exterior walls or roofs where the game refuses rappel? Can you stand on the Dining Hall flat roof?
- **Q10 (entries):** Which windows do attackers actually use most on each site in your games (e.g., Big Window, Attic window, Armory, Meeting Hall east)?
- **Q11 (spawn-peek):** Which windows or doors are known spawn-peek spots on Oregon today?
- **Q12 (vaults):** Any notable vaultable props (Kitchen counters, Meeting Hall stage, basement shelving)?

### [oregon/common_setups.md](oregon/common_setups.md) — 10

(Ulo: answer in any format. "yes/no + a screenshot" is ideal. File names are in `SCREENSHOT_CHECKLIST.md`.)
- **SQ1:** For each site, which walls and hatches does your team usually reinforce? Is my priority list in each YAML close? The main doubts are B (Laundry–Freezer wall + Supply–Bunker wall + the Lobby and Meeting hatches?) and 2F (Kids'–Attic wall + Game Room–Walk-In?).
- **SQ2:** Are all the yellow "breakable" walls listed here actually **reinforceable**? Are the **exterior** walls of Oregon hard? The blueprint only marks the Garage south exterior wall as breakable.
- **SQ3:** Where exactly is each **bomb object** (7 rooms; Kitchen is shared by two sites)? The r6calls markers suggest: Laundry SW part, Supply centre, Dining north-centre, Kitchen centre-east, Meeting NW part, Kids' east part, Dorm Main Hall SW part. Screenshot each bomb from 2 angles. Also, what are the in-game A/B letters?
- **SQ4:** Standard Mira window spots on live Oregon (which wall, facing where) for Laundry/Supply and Kids'/Dorms.
- **SQ5:** Which spawn and entry do attackers usually take for each site? E.g., is basement usually "Freezer + Bunker"? Is 2F usually "Attic + west window"?
- **SQ6:** Common post-plant spots and default plant spots per bomb.
- **SQ7:** Does anyone reinforce the Meeting Hall floor hatch (H1) or the Kids' hatch (H4) on the 1F sites?
- **SQ8:** Is the Kids' north opening (~(744,440)) a window attackers use (from the Meeting Hall roof)?
- **SQ9:** Are there standard rotation holes (e.g., Laundry ↔ Supply Closet, Kids' ↔ Dorm) that everyone opens?
- **SQ10:** Where do the Siege X gas pipes and extinguishers change setups (e.g., a gas pipe next to a site door that defenders shoot in prep)?

### Placeholders added while building Phase 1 (not in the original research)

These were invented to make movement work; each lives in `data/movement.json` or `data/hitboxes.json` and is
marked `_unverified`. The Movement Lab is the easiest place to compare them against Siege.

1. **Acceleration:** how long does it take to reach full speed from standing, and to stop? (Placeholders:
   ground accel 30 m/s², decel 40 m/s², so ~0.1 s; almost no air control.)
2. **Stance timings not in research:** stand→prone (0.9 s placeholder) and prone→crouch (0.9 s).
3. **Ladder:** climb speed (1.5 m/s), slide-down speed (4 m/s), how close to the top you can still grab it,
   and how long stepping off the top takes (0.5 s).
4. **Slopes and steps:** the steepest ramp you can walk up (46° placeholder) and the tallest step you walk up
   without vaulting (0.35 m).
5. **Body proportions** for hitboxes (hip/chest/shoulder heights; the lying-down pose: how far the head and
   gun reach in front of you and the legs behind). Screenshots of a teammate standing, crouched and prone,
   side-on, would settle these.
6. **Vault arc:** how high you rise when vaulting a 0.9 m obstacle, and how long a vault/mantle takes
   (0.5 s + 0.3 s per meter of height placeholder).
7. **Prone view limits:** how far can you look down and up while prone (−20° / +35° placeholders), and how
   fast can you turn (90°/s placeholder)? Do those limits already apply while going prone or getting up?
8. **Prone lean:** how far does your head move when leaning while prone, and how much does the camera tilt?
   (Placeholders: 60 % of the standing lean distance and 60 % of its 15° roll.)
9. **Prone on uneven ground:** can you crawl off a ledge (e.g., off a table or a 1 m drop) while prone, or do
   you have to stand? Can you crawl up onto a curb or a single step head-first? (We currently stop you at
   both.) Does your body visibly bend over the top of a staircase?
10. **Ladders:** can you grab a ladder while crouched or prone, or do you stand up first? (We make you stand
   first.)

### Placeholders added while building Phase 2 (not in the original research)

1. **Standing on players:** can you stand on another player's head or back in Siege (e.g. on a crouched
   teammate)? We currently slide you off at 1.5 m/s.
2. **Player collision:** do players block each other completely, or can you push through (teammates or
   enemies)? Do downed or dead bodies block? (We: everyone alive blocks; dead bodies don't.)

### Placeholders added while building Phase 3 (not in the original research)

These make gunplay work. Each value is in `data/gunplay.json`, `data/combat.json`, `data/modes/lab.json` or a
`data/weapons/<id>.json` file and is listed in that file's `_unverified`. The weapon questions above
(weapons_notes.md 1–13), core_mechanics.md Q8, Q9, Q11, Q13 and Q15, and Phase 2 question 2 (do downed bodies block?) are not repeated here. Most can be checked
in the Shooting Range or a Custom Game with a stopwatch or a 60 fps recording.

**Weapons and handling**
1. **ADS:** which sight is the class ADS time (e.g. 0.52 s for rifles) measured with? Do the sight and laser
   bonuses add (time ÷ 1.2) or multiply (÷ 1.21)? How long does leaving ADS take (0.25 s placeholder)? How much
   slower is ADS straight out of a sprint (×1.1 placeholder, from the shield pistol's 0.50 vs 0.55 s;
   Blackbeard's 2016 figures, 0.7 vs 0.8 s, give ×1.14)? Can you
   ADS during a reload? What drop height cancels ADS (1 m placeholder)?
2. **ADS accuracy curves:** we use fast = 1−(1−t)², medium = t, slow = t² (placeholders); the GONNE-6's curve
   isn't stated at all.
3. **Grips:** we read the angled grip's "+20 % reload speed" as time × 0.8 (Fandom's SMG-12 example: 3.0 → 2.4 s
   empty, but 2.0 → 1.5 s tactical) and the vertical grip's "+20 % vertical control" as vertical recoil × 0.8.
   Are those right?
4. **Barrels:** Fandom vs community figures: muzzle brake −45/−50 % first shot, compensator −35/−40 %
   horizontal, flash hider −15/−20 % vertical. We use Fandom's.
5. **Reload details:** when does the magazine come out (we use halfway to the ammo-counter refill)? Are a
   pulled magazine's rounds returned to reserve? Does firing the chambered round cancel the reload? Can you
   fire between the counter refill and the end of the animation? Does pressing reload while sprinting stop
   the sprint? (Weapons without a community refill point use the class's typical ratio.)
6. **Empty trigger:** does pulling the trigger on an empty gun start a reload, and what feedback is there?
7. **Fire cadence:** are early semi-auto clicks dropped or buffered? Do bursts fire at the auto rate, stop
   when you let go, and have a delay between them? Does switching fire mode take time?
8. **Tube shotguns:** in an empty reload, does the extra time (M590A1: 5.5 s − 7 × 0.6 s = 1.3 s) come first?
   Can you interrupt to fire after the first shell?
9. **Damage curve:** is damage between falloff points rounded down? What shape does buckshot damage take
   between 5–6 m and 10–13 m (we use straight lines)?
10. **Movement penalties:** do the LMG's −10 % and the horizontal grip's +5 % apply to sprinting and ADS
   walking too, and with the secondary out? We assume the measured speeds are full speed (a handgun, or a
   primary with the horizontal grip, which "lets a primary move at handgun speed"), so a primary with another
   grip is 5 % slower and an LMG 10 % slower. Are handguns really 5 % faster than a primary without the grip?
11. **Ladders and vaults:** can you fire, reload or ADS on a ladder or during a vault? (We block all three.)
12. **Spread:** hip-fire spread per class; is ADS pinpoint for bullets; does spread grow while firing, or while
   moving for guns other than shotguns (Y8S3 says moving widens buckshot spread; how much)? Is the buckshot
   pattern fixed or random?
13. **Recoil:** every magnitude (first-shot kick, per-shot climb and side jitter, Camera Up Speed, recenter,
   how long until a spray resets), and hip vs ADS recoil. What is the Mk 14's official "first-shot multiplier
   3.5" relative to?
14. **Shot origin:** do bullets leave the camera or the muzzle?
15. **Weapon swap:** one 0.6 s action (placeholder; core_mechanics.md Q13) or separate holster and draw?

**Damage**
16. **Buckshot headshots:** ×1.5 per pellet (Y8S3 notes) or ×1.0 (2016 notes, core_mechanics.md Q15)? Does the
   neck count as head for pellets?
17. **Slug limb penetration:** full (weapons.csv, destruction.md) or simple (core_mechanics.md §9.3)?
18. **Pelvis:** does it count as torso (×1.0, our placeholder) or leg (×0.75)?
19. **Penetration:** does the 70 % for each extra body stack per body? Does a simple-penetration bullet that
   grazes a limb continue on to a second player?
20. **Shotgun blasts:** is a blast's damage applied pellet by pellet (so going down and overkill are judged
   per pellet) or added up per blast and target? (We add it up per blast and target, each pellet rounded down.)
21. **Skopós:** the idle-shell headshot rule (×2.0 placeholder, fitted to "a 5.7 USG headshot doesn't destroy
   it"), and whether her shells really can't be downed (Fandom only).
22. **Reverse friendly fire:** how much team damage turns it on (100 HP placeholder)? Do headshots reflect?
   Can reflected damage down or kill you?

**DBNO, revive and melee**
23. **Bleeding out:** is the 20 HP downed pool drained by both bleeding and damage? What counts as "moving" for
   the fast bleed (0.05 m/s placeholder)?
24. **Going down:** how long is the collapse? Does a downed player have the prone hitbox? What happens if you
   go down in a tight spot, mid-vault or on a ladder?
25. **Invulnerability after going down** (0.3 s placeholder): does it also block headshots and melee?
26. **Revive:** how close and how directly facing must you be (1.0 m, 60° placeholders)? Are the reviver and
   the downed player locked in place? Does damage to the reviver cancel it? What stance does the revived
   player get up in?
27. **Melee:** when does the hit land (0.2 s placeholder), how wide is it (20°)? How far does it reach (1.5 m
   across the floor, 1.8 m up or down placeholders)? Allowed while prone, from a sprint, or while aiming? Does it
   slow you? Does it hurt teammates (ours does, like friendly fire)?

**HUD and controls (used from Phase 3's client milestone)**
28. Crosshair options, and does the crosshair widen while moving or firing?
29. Does a 1x sight zoom at all? How do the ~2.5x and ~3.5x sights relate to field of view?
30. Siege's per-magnification ADS sensitivity settings and their defaults.
31. Hit-marker variants (headshot, kill, down). How long does the threat indicator stay up, and how close must
   a missed shot pass to trigger it?
32. Does the kill feed show downs? How long do entries stay? What does the downed bleed bar and the revive
   gauge look like?
33. Siege's default PC keys for reload, weapon swap, fire mode and melee. Which weapons show tracers?

**Added in the Phase 3 review**
34. **Extended barrel:** the ten weapons that take one use community-measured damage (base × 1.12, rounded
   down) with the falloff floor raised to ~80 % of it (weapons_notes.md §4.3). Fandom says "falloff reduced
   by 15–20 %" and the community attachment list "+10 % damage". Which is right today, and does the floor
   rise?

### Placeholders added while building Phase 4 (not in the original research)

Each value is in `data/destruction.json` and listed in its `_unverified`. The destruction.md questions
below (destruction tiers, wallbang damage, hatch melee and size, barricade deploy time, hole sizes, the gap
under a reinforcement, what blocks reinforcing) are not repeated here.

1. **Wall build:** how thick are a soft wall's skins (we use 2 cm each), and how far apart and how wide are its
   wooden studs (40 cm apart, 5 cm wide)? A wall with no studs, a wall with metal supports, and a floor's
   metal joists (also 40 cm apart): the same spacing? How many beams does a hatch have (we use one every 33 cm)?
2. **Bullet holes by tier:** roughly how big is one bullet's hole in a soft wall for a Low, Medium and High
   tier gun and one buckshot pellet (we use 4, 5, 8 and 12 cm across; a slug 10 cm)? Up to what range does
   buckshot destroy studs (5 m)?
3. **Shots to open:** how many shots of an assault rifle, an SMG or a pistol open an unreinforced hatch ("a lot
   of time": we use 50, 100 and 100)? How many to break a barricade with a DMR (we use 9)?
4. **The knife on a wall:** how big is a normal melee hole (25 cm across), and does one hit go through both
   skins? How many hits open a hatch (we use 10)?
5. **Frag Grenade** hole in a soft wall (we use 80 cm across; the other explosives are in the hole-size question
   below).
6. **Reinforcing:** how close and how squarely must you face the wall (1.5 m, within 60°)? Can you move while
   reinforcing? How tall is a reinforcement (2.6 m; taller walls keep a strip above it)?
7. **Barricades:** how long does prying one off take (1 s)? How damaged must one be before you can crouch
   through it (we let you through only once it breaks)? How tall is a door barricade's bottom gap (15 cm), and
   how tall is a plank (12 cm)?

### [core_mechanics.md](core_mechanics.md) — 16

Most of these can be answered in a Custom Game (Local), usually in minutes, with a stopwatch or a 60 fps recording and known map distances.

1. **Speeds**: time a 1-, 2- and 3-speed operator over the same measured distance for sprint, normal walk, slow walk (Alt), crouch-walk, prone crawl and ADS-walk. Which community dataset (2019 vs 2024) is right? Does holding a pistol still add speed? *(UNVERIFIED)*
2. **Stance heights and transition times**: in third person (spectate a teammate), how tall are stand, crouch and prone relative to a door frame (~2.0–2.1 m)? How long do crouch→prone and prone→stand take? *(UNVERIFIED)*
3. **Prone**: can you lean while prone in the current build? Is there a turn-speed or aim-arc limit while prone? *(UNVERIFIED)*
4. **Lean**: does pressing sprint cancel a lean (or vice versa)? Roughly how far does your head move? Which settings exist today: Toggle Lean, Toggle Crouch, Toggle Prone, Toggle ADS? *(UNVERIFIED)*
5. **Vault**: what is the highest object you can vault onto (e.g., a kitchen counter vs a fridge)? How long does a vault take? *(UNVERIFIED)*
6. **Rappel**: how long must you hold to start a rappel? Can you enter a window or rappel-breach while **inverted**? Does window glass break on swing-in automatically? Rough climb, descend and horizontal-sprint speeds? *(UNVERIFIED)*
7. **Ladders**: is Oregon's Big Tower access a real climbable ladder or steep "ladder stairs"? Can you shoot or ADS on a ladder? *(UNVERIFIED)*
8. **Fall damage**: from which heights do you take damage or die (e.g., dropping from Oregon's roof or a 2F window)? Does a lethal fall ever DBNO? *(UNVERIFIED)*
9. **DBNO**: how long do you last when downed and still, and when crawling (post-Y10S4 rework)? Crawl speed? Does the overkill rule (more than 20 past remaining HP = death) still apply? (With it, a rifle doing 47 a shot kills a 110 HP player outright on the third body shot instead of downing them.) Do fire/gas deaths DBNO? *(UNVERIFIED)*
10. **Friendly fire**: how much reduced is team damage for players under Clearance Level 10? Is FF on in Team Deathmatch, 3v3 Arcade and bot playlists? *(UNVERIFIED)*
11. **Melee**: recovery time between knife swings, and is a knife hit always a kill on a full-HP heavy operator? *(UNVERIFIED)*
12. **Audio**: rough distance at which you hear a sprinting / walking / crouching enemy on the same floor and through a floor. Is crouch-walk actually quieter than walk in Siege X? *(UNVERIFIED)*
13. **Sprint-to-fire and weapon swap**: rough delay from sprint to first hip-fire shot, and primary↔secondary swap time. Is there a hip-fire crosshair option? *(UNVERIFIED)*
14. **Enemy outlines** (Siege X Y10S2 feature): still visible in Y11S3? *(UNVERIFIED)*
15. **Buckshot headshots**: still not an automatic kill in Y11S3 (last official statement 2016)? *(UNVERIFIED-lite)*
16. **Passive regen**: confirm there is none. *(UNVERIFIED-lite)*

### [destruction.md](destruction.md) — 13

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

### [round_flow.md](round_flow.md) — 14

- **Operator pick timer in Ranked/Unranked (Y11S3):** is it still 30 s? And are site selection (defenders) and spawn selection (attackers) separate timed screens? If so, how long is each? Ulo could time one Ranked/Unranked round start.
- **Map ban vote timer** in Ranked: how many seconds?
- **Overtime sides in Ranked:** in round 7, does the team that attacked first attack or defend? (Rule: after 3–3, whether sides swap going into round 7.)
- **Site repeat rule in Ranked:** after defenders win on a site, is that site locked? For how many rounds, and is it counted by rounds played or rounds won?
- **Quick Match (Y11S3):** is it still 4 rounds, first to 3, with 1 OT round, and a swap after round 2? Is the operator pick still 20 s (15 s without a swap)? Is Attacker Safeguard (10 s invulnerability) still active? How many pre-placed reinforcements per site, and what is the pool on top?
- **3v3 and 1v1 Arcade:** action phase length, role-swap pattern (1v1), reinforcement pool (3v3), whether the site was revealed (3v3), and whether drones or gadgets were scaled. (Ulo may remember from playing.)
- **3v3 attrition wording:** official says "cannot play an Operator again after winning a round with them"; siege.gg says "blocked for the next two rounds". Which matched the game?
- **DBNO at round end:** if every remaining player on a team is DBNO, does the round end immediately?
- **Runout reveal:** does a detected defender show as a continuously updating marker (third-party claim), or as periodic pings? What do defender **gadgets** placed outside reveal?
- **Round-end, replay and role-swap intermission durations** in current matchmaking.
- **Surrender vote:** how many votes are needed, and when is it available?
- **Abandon:** the current penalty durations and the reconnect grace window (the "6 minutes" in the surrender rules may be the abandon threshold).
- **Noor:** unbannable for the first 2 weeks of Y11S3?
- **Default camera count on Oregon:** answered by the Oregon/intel research, not here.

### [intel.md](intel.md) — 12

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

### [gadgets.md](gadgets.md) — 13

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

### [weapons_notes.md](weapons_notes.md) — 13

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

### [interactions_notes.md](interactions_notes.md) — 26

All of these can be checked in a Custom Game (friendly fire on where needed). Each links to the UNVERIFIED rows it would settle. They are in rough priority order.

1. **Mute vs Hard Breach Charge.** Put a Mute jammer about 1 m from a reinforced wall. As Striker or Fuze, plant a Hard Breach Charge on that wall. Does it still blow after 4 s? (Conflict 1.)
2. **Mute vs Fuze Cluster Charge.** (a) Fuze stands inside a jammer and triggers a charge planted outside. (b) The charge is inside a jammer and Fuze is outside. (c) Mute drops a jammer next to a charge that is already drilling a reinforced wall. Which cases stop it? (Conflict 3.)
3. **Brava-hacked Mute jammer.** Within 2.6 m of a converted jammer: can a defender still detonate a Nitro Cell? Do defender cameras (default and Bulletproof) go to static? Can Skopós swap into a shell inside it? Does Pulse's sensor still work?
4. **Other Brava conversions.** After a Kludge converts a Proximity Alarm, does it beep for defenders walking by? Does a converted Observation Blocker hide attackers from defender cameras? Can attackers fire a converted Bulletproof Camera's EMP dart?
5. **Impact EMP on an Observation Blocker.** Destroyed, or switched off for a few seconds? (Conflict 6.)
6. **Impact EMP on Pulse.** If Pulse is within 2 m while scanning, does the sensor freeze, and for how long?
7. **Dokkaebi counters.** Does a teammate's Impact EMP (Sledge/Striker) on the defender Dokkaebi is calling cancel the upload? Does a Bulletproof Camera dart on Dokkaebi cancel it? If Dokkaebi herself stands inside a Mute jammer, can she start or continue an upload? Does a jammer stop attackers viewing a hacked camera that sits inside its radius?
8. **Jegeo and Nitro Cells.** After a defender's phone explodes, can he still detonate his Nitro Cell? (Fandom calls the Nitro detonator a phone.)
9. **Jegeo fire.** Does the 5 s fire hurt attackers and Skopós shells? Does the 40 hp explosion hit Skopós' active shell?
10. **Thermite vs Black Mirror.** Can the Exothermic Charge go directly over the Mirror glass from the attacker side? What happens to a Mirror when its reinforced wall is breached? Does a Hard Breach Charge on that wall destroy the Mirror? (Conflict 7.)
11. **Sledge's hammer vs gadgets.** With one swing: Proximity Alarm, Observation Blocker, Nitro Cell, Mute jammer, Gu mine (is he stung?), Mirror glass (shatter?), Skopós idle-shell barrier, a gas pipe. Is it still a one-hit kill on a defender and on Skopós' active shell?
12. **Hard Breach Charge details.** Can gunfire destroy a planted HBC? Does one HBC still fully open a reinforced hatch? Does a Bulletproof Camera dart on a planted HBC do anything?
13. **Claymore.** Does the blast damage nearby attackers (Brava/Striker)? Does it destroy a barricade or make a hole in a soft wall? Does it destroy Gu mines?
14. **Drones vs traps.** Does a drone or the Kludge set off a Proximity Alarm or a Gu mine by driving over or near it? Can a Deployable Shield stop a drone (jumping over it)?
15. **Barbed wire.** Does it also deal the 5 hp/s to defenders moving through it?
16. **Stun and smoke values.** Is a stun still about a 5 s blind (15 m facing, 3 m facing away)? Is the smoke cloud about 5 m across for about 10 s? Is Skopós' active shell stunned? Does the idle-shell camera see through smoke?
17. **Skopós.** Can Fuze plant a Cluster Charge on the idle shell's barrier? Can Dokkaebi's camera hack view the idle-shell camera? Does the shell punch break a barricade or hatch in one hit, like Aruni's?
18. **Damage numbers.** Frag at point blank on a 100-hp operator. Nitro Cell maximum (about 171?). One Cluster sub-grenade. The far-side Breach Charge. Kill-feed or health checks in Custom Game.
19. **Pulse.** Do downed (DBNO) attackers still show as heartbeats?
20. **Gu and the defuser.** Can a needled attacker plant or drop the defuser?
21. **Mira placement.** Can a soft wall that already has a Mirror still be reinforced? Confirm that a Mirror can't go on barricades, floors or hatches.
22. **Impact EMP on friendly drones.** Does an attacker's EMP affect their own team's drones?
23. **Defender explosives vs a planted Breach Charge.** Does a Nitro Cell or Impact Grenade blast (without breaking the wall) destroy the charge?
24. **Thermite on barricades.** Can the Exothermic Charge be placed on a door or window barricade?
25. **Ingredients on Oregon.** Does gas-pipe fire destroy drones or gadgets it touches? Where are Oregon's gas pipes and extinguishers? Are there any metal detectors on Oregon? (Cross-check with `research/oregon/`.)
26. **Jammer vs a Kludge hack in progress.** Can a Kludge outside a jammer hack a device that sits **inside** the jammer's radius?

### [operators/legion_name_check.md](operators/legion_name_check.md) — 2

- **Ulo:** did you mean **Lesion** (defender, Gu poison mines, SIX12 SD / T-5 SMG)? If not, which defender? (Deimos is an attacker; the Keres Legion is a faction/bot enemy, not an operator.)
- Has any Y11S4 or Year 12 leak mentioned an operator called "Legion"? (Not checked; search budget exhausted and Reddit blocked from this environment.)

### [operators/brava.md](operators/brava.md) — 9

- **Kludge hack time** (seconds from starting the hack to conversion/destruction), and the **self-destruct delay** for destroyed devices. Ulo could time both in a custom game on a Bulletproof Camera and a Nitro Cell.
- **Hacks per Kludge (3?)** and **hack range (10 m?)**. Ulo can check the HUD counter and test how far away a hack still starts.
- Does Brava have **2 regular drones on top of her 2 Kludges**, or are the Kludges her only drones? (Check the drone count at the start of the prep phase.)
- Kludge **HP, move speed, and whether it can jump** (and the cooldown if it can).
- Can a converted **Bulletproof Camera's EMP dart** be fired by attackers?
- Exact behaviour of a converted **Proximity Alarm** (does it beep for defenders and show attackers a marker?) and a converted **Observation Blocker** (does it hide attackers from defender cams?).
- How long is the **overheat window** on Skopós' idle shell (siege.gg says 8 s)?
- After the Y10S4 Mute rework, what exactly does a **converted** Mute jammer disable on the defender side?
- Does a Bulletproof Camera EMP dart disable a Kludge (and for how long)?

### [operators/fuze.md](operators/fuze.md) — 9

- **Sub-grenade damage** per grenade (HP at centre and fall-off). Fandom only gives lethal radii (2 m for light, 1.2 m for all, 4.2 m max).
- **Sub-grenades per charge = 5?** Ulo can count them in a custom game.
- **Plant time** (~2 s?) and how much extra drill time applies on **Mira's Black Mirror** (the same 1.75 s as reinforced?).
- Release direction: **left → right or right → left** from Fuze's point of view? (Official tip vs Fandom.)
- **Shield bash damage:** 65 HP (official Y9S1) or 0 (current Fandom)? And the current **suppression thresholds** (10/40 hits vs 5/20).
- **Shield speed penalty** (−10 %?).
- After Y10S4, does Mute's jammer still stop a **Hard Breach Charge** (it is fuse-based, not remote)? What exactly did the **Y10S4.1 fix** ("disruptor can deactivate Cluster Charge") change?
- Can Fuze plant a charge on **Skopós' idle-shell shield**? Can he pull a Gu needle with the shield equipped?
- Hole size left by a Cluster Charge on soft and reinforced surfaces.

### [operators/thermite.md](operators/thermite.md) — 7

- **Breach hole size** on a reinforced wall panel and on a soft wall (width × height in metres). Does one charge clear a whole reinforcement panel? Ulo can screenshot a breach in a custom game next to a known-size door.
- **Plant time (~3 s?) and heat-up time (~3 s?)** exact values.
- **Damage fall-off**: the far-side radius (3–4 m?) and the near-side lethal radius.
- Can the charge be placed on **door/window barricades**?
- The **Mira conflict**: can a charge be placed on or over the Black Mirror glass? What happens to a mirror on the breached panel?
- Does a Bulletproof Camera EMP dart stop a planted Exothermic from triggering, and for how long?
- After Y10S4, does Mute's jammer still stop a **Hard Breach Charge** (Striker/Fuze backup)?

### [operators/striker.md](operators/striker.md) — 9

- **Stun count for Striker:** is it 3 or 2? Ulo: open the loadout screen with Stun selected and read the count.
- Do Striker's per-gadget counts match what other operators get (Breach Charge 3, Claymore 2, Frag 2, HBC 2, Smoke 2, Impact EMP 2)? Needs an in-game loadout check.
- Which key triggers the second gadget: the normal gadget key or the ability key? Does the game fix which pick goes in which slot, or can the player choose?
- **Does Mute's Signal Disruptor still stop a Hard Breach Charge** after the Y10S4 rework, given the HBC is fuse-triggered? A Custom Game test with a jammer next to a planted HBC would settle it.
- **Does Mute's jammer still stop Claymores** after Y10S4?
- Impact EMP disable duration in Y11S3: Fandom says 9 s. Needs in-game timing.
- Can a Hard Breach Charge destroy Mira's Black Mirror on a reinforced wall?
- Does a teammate's Impact EMP on a defender cancel Dokkaebi's Jegeo upload? This is inferred from the Y11S3 Designer's Notes and needs testing.
- Is the name "Gadget Kit" used anywhere in-game? The official site doesn't name the ability.

### [operators/dokkaebi.md](operators/dokkaebi.md) — 11

- **What exactly makes a defender "identified"?** Pinged or spotted once this round (like Deimos)? Seen on a drone? Does it wear off? A Custom Game with Dokkaebi would settle it.
- **Reset time:** how long does a defender take to dismiss the call? Can they move or shoot while doing it?
- **Upload timing:** is the 7 s "Duration" the same as the Y11S3 upload window? Does Dokkaebi have to keep the tablet in hand (no shooting) for the whole upload?
- **What counts as breaking the "continuous connection"** besides jammers, Zoto and death? Is there a range limit, or a line-of-sight or floor limit? Does it break when the target enters a jammer radius, or only when a jammer is already covering them?
- Does a **teammate's** Impact EMP (Striker/Sledge) on the target cancel Dokkaebi's upload? Does Sentry's Bulletproof Camera EMP burst on Dokkaebi cancel it?
- Fire zone: damage per second, radius, and whether it hurts attackers (Siege X fire is team-neutral).
- Does the 40 HP explosion ignore armor/health rating, and can it down (DBNO) or kill directly?
- Per-target cooldown: does it start on dismiss, on detonation, or on any attempt?
- Camera hack: how many hacks per round (siege.gg says 2)? Does each dropped phone allow one hack? Which feeds are included (Bulletproof Cameras, the Skopós inactive shell)?
- Skopós: where does the phone explode (active shell?) and does the 40 dmg hit the shell?
- Breach Charge count for Dokkaebi (assumed generic 3).

### [operators/sledge.md](operators/sledge.md) — 11

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

### [operators/sentry.md](operators/sentry.md) — 6

- **Per-gadget counts on Sentry.** Do they match the generic counts (Barbed Wire 2, BP Cam 1, Deployable Shield 1, Obs Blocker 3, Impact 2, Nitro 1, Prox 2)? Ulo: screenshot Sentry's loadout screen with each gadget selected, or check the in-game HUD counters. (Fandom-only now.)
- **Slot/key binding.** Which of the two picked gadgets goes on the ability key and which on the secondary-gadget key? Is it the order they were picked? Ulo: check in a Custom game.
- **One Sentry per team?** siege.gg says yes (UNVERIFIED by Ubisoft). Ulo: confirm in the operator-select screen.
- **EMP vs Observation Blocker.** Does an Impact EMP destroy it (Fandom) or only disable it (post-Y10S4 DSEG)?
- Does a Brava-hacked Mute jammer affect Sentry's Nitro Cell detonation (post-Y10S4 "wireless signals" rework)?
- Can Sentry's explosives (Nitro, Impact) damage a friendly Skopós shell? Is that governed by normal friendly-fire / reverse-FF rules?

### [operators/skopos.md](operators/skopos.md) — 10

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

### [operators/mira.md](operators/mira.md) — 8

- **Window size.** Ulo: screenshot a Mirror next to a doorway (known ~2.2 m tall) or a standing operator, from both sides, to set glass/frame dimensions.
- **Deploy time (5 s?) and ejection delay (4 s?).** Ulo: time both in a Custom game (Fandom-only now).
- **Hard Breach Charge vs Mirror** (Striker/Fuze): does one charge destroy a Mirror on a reinforced wall, or only if it covers an anchor?
- **Sledge's hammer on the glass:** shatter only, or destroy? Hammer on a soft wall holding a Mirror: is the Mirror removed?
- **Can a soft wall holding a Mirror still be reinforced?** (Fandom says no.)
- How long does a Fuze Cluster Charge take to drill a Black Mirror (the Y6S3 DN only says "longer"), and does the Mirror survive as shattered glass or get destroyed?
- Exact defender-side tint (any colour grading, or fully clear)? A screenshot through an intact Mirror would settle it.
- Official confirmation that Mira has **2** Mirrors, 1 Nitro Cell and 2 Proximity Alarms (loadout-screen screenshot).

### [operators/lesion.md](operators/lesion.md) — 11

- **Is "Legion" = Lesion?** Ulo, please confirm (see `legion_name_check.md`).
- How long does pulling a Gu needle take (seconds, from pressing the prompt until the weapon is back up)? Could Ulo time it in a Custom game?
- Does the first 12 HP poison tick land immediately on the sting or 2 s later?
- Do Gu mines have HP beyond "one bullet"? Does one pistol bullet always destroy one?
- Since Y8S3, does Lesion (or the team) get any notification or kill-feed-style alert when a mine is triggered? Does the victim's scream count as the only intel?
- Besides no sprinting, does a poisoned attacker walk slower than normal?
- Can a drone (incl. Brava's Kludge) trigger or destroy a Gu by driving over it?
- Does the 8-mine cap count deployed plus in-hand mines, or only in-hand? Does picking one up refund it?
- Does Sledge's hammer destroy a mine lying on the floor or hatch he smashes?
- Did the Y10S3 Magnified-Sight removal change the T-5 SMG's optic list?
- Gu throw/deploy animation time (seconds).

### [operators/pulse.md](operators/pulse.md) — 7

- Does the sensor scan a forward fan (how many degrees?) or a full sphere around Pulse? Does it reach the full 10.5 m straight up and down through floors?
- When Pulse pings while looking at a heartbeat, what do teammates see (a red enemy marker? a special heartbeat icon?), and how long does it last?
- Do DBNO attackers still show a heartbeat?
- Is there any battery, overheat or cooldown on the sensor in the current build?
- How long do equipping and holstering the sensor take?
- Can a Brava-hacked Mute jammer disable Pulse's sensor or stop his Nitro Cell from detonating?
- Did the UMP45 lose its magnified optic in Y10S3?

### [operators/mute.md](operators/mute.md) — 7

- Does a Mute jammer still stop Fuze's Cluster Charge in the current build? If Fuze triggers it outside and then the charge is inside, what happens? (Y10S4.1 fixed a "can deactivate" bug and the intent is unclear.)
- Do jammers stop Claymores in the current build? (Y6S1 said yes; the Y10S4 rework and Fandom's list say no.)
- If Dokkaebi (not the target) stands inside a jammer, can she still upload a Jegeo Payload?
- What exactly does a **Brava-hacked** jammer do to defenders: jam defender drones/cams/Skopós shells, block Nitro Cell detonation, affect Pulse's sensor?
- Jammer HP (does one pistol bullet always kill it?), exact deploy/arming time, and whether it is audible.
- Can Mute pick up a jammer mid-round and redeploy it (retrieval time)?
- Does the jammer block a remote hack on a Bulletproof Camera, or Dokkaebi's camera access for cams inside its radius?

