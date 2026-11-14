# Phase 10 design: the art pass

Status: adopted 2026-11-08. Scope: PLAN.md §12 and §17 Phase 10, "Architecture kit, props, lighting, weapons,
gadgets, operator models, 1P/3P anims"; done when "Oregon looks finished at 1080p High, ≥ 120 FPS on target PC".

Read with: PLAN.md §9.1 step 5 and §9.2 (lighting mood), §12 (asset strategy, budgets, animation list), §18
(performance), §1.1 (IP guardrails); tools/mapgen/DESIGN.md (how the level is built, the storey views, amendment 8 on
shadows); DECISIONS D-008 (Blender checked at the start of this phase), D-009 (LFS), D-059 (first person), D-069
(panel drawing), D-083 (greybox light), D-099/D-104 (Oregon's outside and props); the Phase 10 entries (D-170 on).

Rules this design keeps:
- **Looks only.** Nothing here changes how the game plays. Collision boxes, hitboxes, sight lines, bullet rules and
  the simulation stay exactly as they are; the data the simulation reads isn't touched (the art data sits outside
  the data hash, as gun_kit.json does). What's drawn matches what's there: a drawn table fills its box, no
  visual-only thing stands where a body would bump into it or take it for cover, and nothing hides a gap a bullet
  goes through.
- **Destruction keeps working.** Panels are still drawn from their cells and redrawn as they change; the materials
  and the light follow them (§5.4, §6.4).
- **IP (PLAN §1.1).** Every shipped asset is our own code or CC0 (listed in ASSET_SOURCES.md). The game's own
  renders are mood references only (research/oregon/refs/SOURCES.md), never textures.
- **Playable at every milestone**, and the browser tests keep passing: `?lowgfx` stays the cheap path they use.
- **Measured, not guessed.** GPU frame rate is read on Ulo's PC (F8); here we measure what doesn't need a GPU:
  the page's work a frame, draw calls, triangles and texture memory, against the budgets in §4.

## 1. Where we start

Everything is greybox: the level's ~1,000 static boxes drawn instanced per storey and surface class in flat
colours (labScene.ts), destructible panels as flat-shaded boxes over their cells (panelView.ts), one sun with a
shadow map redrawn only when the level changes, a hemisphere light per storey (D-083), bodies as hitbox capsules,
guns as boxes per weapon class (gun_kit.json), gadgets and drones as simple shapes, no sky but a colour.

The level data already holds what the art needs to know: storeys, 49 rooms (rects per storey), roofs (ramps),
stairs, the ladder, hatches, soft floors, openings (layout.json: DOOR, WINDOW, OPEN, DRONE_HOLE spans on every
wall), the 79 outside items and 29 cover props by id (exterior.json), cameras and ingredients.

## 2. Pipeline (D-170)

- **Blender (D-008 checked):** Blender 5.2 runs headless here as the `bpy` Python module. The shipped game doesn't
  use it in this phase: the map's look is rebuilt from the level data whenever mapgen changes it (PLAN §9.1's
  layout-as-data), walls are drawn from cells at runtime, and CI and Railway can't run Blender (its outputs would be
  binaries in git). Everything is generated in **TypeScript at load** from the level and the art data, with the
  game's own geometry code (panel frames, hitbox poses). Blender stays available for a later step that needs it
  (§11's option B).
- **Textures:** CC0 photo-scanned PBR sets from **Poly Haven** (ambientCG as a second source), fetched by
  `tools/art/textures.ts` from a pinned list (`data/presentation/textures.json`: our id, the source asset and URL,
  its md5), resized and packed by it, and written to `game/client/public/art/textures/`: a colour map (sRGB), a
  normal map, and one map packing AO, roughness and metalness (glTF's ORM order). The outputs are committed
  **in plain git, not LFS** (.gitattributes amended; D-009): the build needs them in CI checkouts and on Railway,
  which don't fetch LFS objects reliably, and LFS bandwidth is metered. Budget: **≤ 40 MB** shipped assets in all.
  The format is WebP (D-170: no KTX2 encoder could be built here); KTX2, PLAN §3's choice for GPU memory, can replace
  it later without touching the materials.
- **Data:** `data/presentation/materials.json` (the material library: texture set, tint, roughness and scale per
  material) and `data/maps/oregon/art.json` (the map's dressing: room styles, which material each part of the
  outside wears, model kinds for the outside items and props, lamps, decorative items). Both are presentation data
  outside the data hash, validated by schemas, checked by tests (§13).
- **Where things load:** the page loads textures after the level is drawn (the greybox look shows until they
  arrive, a second or two); nothing blocks joining a match on them.

## 3. Graphics presets (D-171)

Settings → Graphics: **Low / Medium / High** (default High on desktop, Low on phones; `?lowgfx` forces Low).

| | Low | Medium | High |
|---|---|---|---|
| Textures | half size (512 px) | 1024 px | 1024 px (2048 for hero surfaces) |
| Sun shadows | off | 2048 map | 4096 map |
| Indirect light (§6.3) | storey fill (as now) | probes | probes |
| Ambient occlusion (§6.5) | off | off | on |
| Dressing (§9.2), foliage (§8) | cover props only | most | all |
| Antialiasing, pixel ratio | off, 1 | on, ≤ 1.5 | on, ≤ 2 |

## 4. Budgets (High, Oregon, the worst view)

Draw calls ≤ 1,500 a frame (shadow passes included); triangles ≤ 3 M; textures ≤ 600 MB of GPU memory; the page's
work ≤ 4 ms a frame (p95) on Ulo's CPU, ≤ 8 ms here; a panel's redraw ≤ 1 ms (PLAN §8.2). Characters ≤ 40k
triangles at LOD0 with 3 LODs, first-person weapons ≤ 25k (PLAN §12.2). The stats overlay (F8) shows draws,
triangles, geometry and texture memory; oregon-perf.mjs checks them.

## 5. Surface materials (M2)

### 5.1 World-aligned mapping
Level boxes carry no UVs (instanced unit boxes, panel boxes built from cells). Every level material samples its
textures **by world position on the face's plane** (box mapping: the face's normal picks the plane), so a texture
keeps its size on any box and runs on across neighbouring boxes and a wall's cells. Normal maps use the face's own
axes as the tangent frame. Texel density about 512 px per metre (PLAN §12.2), scale per material.

### 5.2 Room styles
Which material a face wears depends on the **room it faces**. A **room map** per storey (a small texture, 10 cm a
texel, from the rooms' rects; 0 = outside) is sampled just off the face along its normal, and gives a room style
from art.json: wall paint (a tint on a plaster or drywall set), wainscot or none, floor set (planks, tiles,
concrete, carpet, linoleum), ceiling set, trim colour. A wall's two faces get their two rooms' styles; a face
toward the outside gets the outside style of that part of the building (the main house's weathered beige lap
siding with white trim, the Big Tower's red boards: zones painted round named rooms), and off the rooms each storey
can have an outside style of its own (concrete below ground). One material per surface
class still draws everything (texture arrays hold the sets), so the draw calls stay as they are.

### 5.3 Trims in the shader
By height above the storey's floor (and below its ceiling), a wall face gets a **baseboard** (12 cm), an optional
**wainscot** to 1 m with a chair rail, and a **crown** strip, each with a bevel in the normal and a little
darkening; painted per room style. Real geometry is kept for what stands proud enough to cast a shadow (frames,
sills: §7).

### 5.4 Destructible panels
Panels wear the same materials as the walls around them: their skins take the room styles of the side they face
(the room map), the core shows wooden studs and insulation (a wall) or joists (a floor), a hole's edges show the
drywall's thickness, barricades are weathered planks, reinforcement is a dark ribbed steel plate, glass is glass.
Boxes get normals (no more flat shading through derivatives) only where the texture needs them; the redraw stays
within §4's budget (a test measures it).

### 5.5 Debug views
P cycles **art → greybox → neutral** (the surface-class colours stay for testing; the browser tests read them).

## 6. Lighting (M3)

### 6.1 Sky and sun
A sky dome (an analytic daytime sky, slightly hazy, Oregon's late-afternoon mood from the reference art) and
distance haze. The sun keeps today's static shadow map (redrawn when the level changes). The sky also lights the
scene: an environment map from the same sky for reflections and the outdoor fill.

### 6.2 Exposure
A single exposure tuned for the yard; inside, the probes (§6.3) and lamps make rooms readable. AgX or ACES tone
mapping, decided by screenshots.

### 6.3 Indirect light: room-aware irradiance probes
A grid of probes (about 0.75 m inside the building, 3 m outside) holds the light arriving from every direction
(L1 spherical harmonics, three 3D textures). It is **baked in Web Workers** after the level loads, by tracing rays
against the level's boxes (a BVH over boxes): the sky where a ray escapes, the sun where its hit point sees the sun,
lamps (§6.6), and a bounce off what it hits (two passes). Every lit material reads it instead of the hemisphere
light: per pixel, the 8 probes around it, **weighted by the room** (a probe counts only if it is in the same room as
the face, by the room maps; outside counts as a room) and by facing (a probe behind the face doesn't count). Walls
are thinner than the probe spacing, so without the room weight an inside wall next to the bright yard would glow;
with it, light comes in only through the openings the rays found. Probes inside solids are dropped.

### 6.4 Destruction and the light
When a panel changes, the probes within a few metres of it are baked again in the workers (a hole lets light into
a room within a fraction of a second); the sun's shadow map is redrawn as today.

### 6.5 Ambient occlusion
Screen-space AO on High (the darkening where things meet, which the probes are too coarse for), applied to the
world before the first-person view is drawn over it.

### 6.6 Lamps
Ceiling lamps per room (art.json): an emissive fixture, and a light in the bake. No realtime point lights (three
lights every pixel with every light): the bake carries them. The basement is darker (PLAN §9.2): fewer, dimmer
lamps and no sky.

## 7. Architecture (M4)

- **Openings:** mapgen emits each opening into level.json (`openings`: id, kind, centre, width, height, sill,
  wall direction and thickness). Doors and open passages get frames (casing on both faces, a threshold); windows
  get frames, a sill, glass panes with mullions (where the panel is glass) or just the frame (barricaded).
- **Roofs:** shingles (asphalt on the house, green metal on the Big Tower, corrugated metal on the sheds) on the
  ramps; fascia, eaves and soffits along the ramps' low edges; gutters; chimneys and vents.
- **Stairs:** treads and risers with nosing, stringers; railings with balusters and a handrail along the rail
  boxes; the ladder as rails and rungs; hatches framed.
- **Outside walls:** as §5.2; corner boards and trim at the building's edges; the Big Tower's cupola and
  weathervane (above anything a body can reach; drawn only).

## 8. The outside (M5)

Ground materials by area (grass, dirt, gravel, the street's asphalt) blended on the ground plane; trees (pines and
broadleaf, instanced, from a procedural kit), bushes and grass tufts (Medium and High), out of the playable area or
where they don't block a line of sight a bullet passes (trees stand outside the bounds' walkable part or on spots
already blocked); the outside items as models fitted to their boxes: the school bus wreck, cars, vans, the truck,
trailers, sheds and the booth, silos and tanks, the greenhouse, the container, the excavator, the generator,
lumber, tyres, cinder blocks, fences (wooden planks, chain-link, cinder-block walls), the garden beds; power poles
and lines, the windmill and the pylon beyond the bounds; hills and a tree line all round.

## 9. Inside (M6)

### 9.1 Cover props
The 29 props as furniture models fitted exactly to their boxes (tables, benches, counters with cabinets, the
island, the bookcase, washers, chest freezers, beds, bunk beds, the wardrobe, the sofa, the pool table).

### 9.2 Dressing
Decorative items per room (art.json): hung on hard walls (pictures, shelves, posters, clocks), on furniture
(plates, books, lamps), flat on floors (rugs), and small floor clutter against hard walls (boxes, bins, chairs
tucked under tables). A validator (a test) checks that each sits inside its room, against a hard wall or on a
prop, clear of every opening's approach (as D-104's door rule), not on a soft wall, soft floor or hatch, and under
the height a player could take it for cover unless it is on a prop. Ingredients (extinguishers, gas pipes) and the
default cameras get models.

**As built (D-176):** furniture.ts fits a model to each prop, closed to the floor (no opening a drone could drive
into) and, for a metal one, with no gap at all; each faces away from the nearer wall. dressing.ts places each room
style's kit (`dressing` in art.json: wall items by kind, rugs, clutter) on runs of hard wall found along the edges of
the room's rectangles (solid at 1.25, 1.6 and 2 m) and on hard floor; clutter is at most 0.32 m tall, 0.9 m from its
run's ends, with its wall solid to the floor behind it (drone holes stay clear). Things on furniture come with the
furniture (drawn on High). No chairs: a chair beside a table would be cover that isn't, and the tables are closed.
test/furniture.test.ts and test/dressing.test.ts hold the rules.

## 10. Weapons, gadgets, drones (M7)

A **parametric gun kit** in code: per weapon class, side profiles extruded with bevels (receiver, handguard,
stock, grip, magazine), turned barrels and muzzles, rails, iron sights; each attachment its own part, so loadouts
keep working (gun_kit.json gains shape parameters per weapon). The same meshes serve the first-person view and,
simplified, the third. Gadgets and the drone get shaped models (gadgetModels.ts, cameraModels.ts, shieldModel.ts
keep their sizes and anchors).

**As built (D-177):** gunKit.ts has 13 base forms; each of the 40 weapons names one with its parameters in
gun_kit.json. A gun is 0.5–2.6k triangles, so the third person uses the same model (no simplified copy needed).
Irons and optics stand on the sight line the viewmodel aims along (tested with rays). gadgetShapes.ts shapes the 22
gadget kinds, the drones, what's carried in the hands (big placed gadgets packed) and the knife; each gadget keeps to
its hit box (tested).

## 11. Operators (M8)

Bodies stay driven by the hitbox pose (poseHitboxes): what's drawn is where the hitboxes are. A body is a
**skeleton solved from the eight capsules** (two-bone IK for elbows and knees, feet planted with a walk cycle on
top when moving), skinned with a body mesh and dressed per operator (helmet or cap, vest and pouches, colours and
the item that marks each one). The spike at the start of M8 picks the body mesh: **A**, built in code from smooth
parts; **B**, a CC0 base mesh (MakeHuman's CC0 output) rigged in Blender and shipped as a glb. Animations
(PLAN §12.3) are procedural from the state: locomotion, stances and lean (already in the pose), vault, ladder,
rappel, DBNO crawl, revive, plant/defuse, throw, place, melee, the shield set, and a ragdoll on death (drawn only).

## 12. First person (M9)

Gloved arms in code, posed by the viewmodel: per-weapon idle, ADS, fire, reload (tactical and empty), sprint,
equip and melee, gadget use per operator, all keyframed in code from the weapon's own timings (data/weapons).

## 13. Performance and tests

- **Unit tests:** materials and art data validate; every room has a style; the room map gives each face of a wall
  its room; the probe bake (a closed room is dark, a hole lets light in, a probe behind a face doesn't count);
  every opening gets a frame that fits it; props and outside models fit their boxes; the dressing validator;
  presets toggle what §3 says; a panel's redraw stays within budget.
- **Browser:** oregon-perf.mjs gains the art's numbers (draws, triangles, texture memory) at High and Low; a new
  `oregon-art.mjs` takes fixed screenshots (each site, the yard from each spawn, a breach) at High for review and
  checks the page logs no error; everything else keeps `?lowgfx`. CI's 30 min limit is close: the slowest tests
  may move to a second job.
- **Ulo's PC:** F8 at 1080p High: the frame rate in the worst views, for the done-when.

## 14. Milestones

| M | What |
|---|---|
| M1 | Pipeline and presets: Blender check, textures tool and the first sets, art data and schemas, Graphics settings (Low/Medium/High), budgets in the stats overlay |
| M2 | Surface materials: world-aligned PBR, room maps and styles, shader trims, panels textured, outside walls; art/greybox/neutral views |
| M3 | Lighting: sky and haze, environment light, probe bake in workers with room-aware sampling, rebakes on destruction, lamps, AO, tone mapping |
| M4 | Architecture: openings from mapgen with frames, windows and glass; roofs, eaves, chimneys; stairs, railings, the ladder, hatches; the Big Tower's top |
| M5 | The outside: ground, trees and foliage, vehicles and outside items fitted to their boxes, fences, poles, backdrop |
| M6 | Inside: cover props as furniture, dressing per room with its validator, ingredients and cameras |
| M7 | Weapons, gadgets and the drone |
| M8 | Operators: bodies, gear per operator, third-person animation, ragdoll |
| M9 | First person: arms and per-weapon animation, gadget use |
| M10 | Performance pass, LODs, the checks, the review, docs, report, merge |
