# ASSET_SOURCES.md

Every third-party asset that ships in the game (models, textures, audio, fonts, animations) must be
listed here with its license. Allowed: CC0, or CC-BY with the credit below. Nothing ripped, extracted,
or decompiled from Rainbow Six Siege, and no Ubisoft artwork (PLAN.md §1.1).

Procedurally generated assets (Blender scripts in `tools/blender/`, synthesized audio) don't need an
entry, but their generator script should be named in the asset's folder README. Texture sets are fetched and packed
by `tools/art/textures.mjs` from the list in `data/presentation/textures.json` (Phase 10, D-170): each set's colour,
normal and ORM maps are resized WebP copies of the CC0 source's maps.

| Asset / path | Source URL | Author | License | Credit line (if CC-BY) | Added (date, phase) |
|---|---|---|---|---|---|
| `game/client/public/art/textures/plaster.*` (polyhaven `painted_plaster_wall`) | https://polyhaven.com/a/painted_plaster_wall | Amal Kumar | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/beadboard.*` (polyhaven `white_planks_clean`) | https://polyhaven.com/a/white_planks_clean | Rob Tuytel | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/planks_raw.*` (polyhaven `raw_plank_wall`) | https://polyhaven.com/a/raw_plank_wall | Dimitrios Savva | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/concrete_wall.*` (polyhaven `concrete_wall_007`) | https://polyhaven.com/a/concrete_wall_007 | Dario Barresi, Rico Cilliers, Charlotte Baglioni | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/tiles_white.*` (polyhaven `long_white_tiles`) | https://polyhaven.com/a/long_white_tiles | Jenelle van Heerden, Sergej Majboroda | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/brick.*` (polyhaven `red_brick`) | https://polyhaven.com/a/red_brick | Rob Tuytel | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/floor_wood.*` (polyhaven `wood_floor_worn`) | https://polyhaven.com/a/wood_floor_worn | Dimitrios Savva | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/floor_wood_dark.*` (polyhaven `old_wood_floor`) | https://polyhaven.com/a/old_wood_floor | Guillaume Monsergent | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/floor_checker.*` (polyhaven `floor_tiles_06`) | https://polyhaven.com/a/floor_tiles_06 | Rob Tuytel | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/floor_concrete.*` (polyhaven `concrete_floor_worn_001`) | https://polyhaven.com/a/concrete_floor_worn_001 | Dimitrios Savva, Rico Cilliers | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/carpet.*` (polyhaven `dirty_carpet`) | https://polyhaven.com/a/dirty_carpet | Rohit Seervi | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/linoleum.*` (polyhaven `linoleum_brown`) | https://polyhaven.com/a/linoleum_brown | Rob Tuytel | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/siding.*` (ambientcg `WoodSiding013`) | https://ambientcg.com/view?id=WoodSiding013 | ambientCG (Lennart Demes) | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/barn_boards.*` (ambientcg `PaintedWood003`) | https://ambientcg.com/view?id=PaintedWood003 | ambientCG (Lennart Demes) | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/shingles.*` (ambientcg `RoofingTiles003`) | https://ambientcg.com/view?id=RoofingTiles003 | ambientCG (Lennart Demes) | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/corrugated.*` (ambientcg `CorrugatedSteel005`) | https://ambientcg.com/view?id=CorrugatedSteel005 | ambientCG (Lennart Demes) | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/corrugated_rust.*` (polyhaven `rusty_corrugated_iron`) | https://polyhaven.com/a/rusty_corrugated_iron | Charlotte Baglioni | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/ground_grass.*` (ambientcg `Grass004`) | https://ambientcg.com/view?id=Grass004 | ambientCG (Lennart Demes) | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/ground_dirt.*` (polyhaven `brown_mud_dry`) | https://polyhaven.com/a/brown_mud_dry | Rob Tuytel | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/ground_gravel.*` (polyhaven `gravel_floor`) | https://polyhaven.com/a/gravel_floor | Jenelle van Heerden, Matterfield | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/asphalt.*` (polyhaven `asphalt_02`) | https://polyhaven.com/a/asphalt_02 | Rob Tuytel | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/barricade.*` (polyhaven `weathered_brown_planks`) | https://polyhaven.com/a/weathered_brown_planks | Dimitrios Savva, Rico Cilliers | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/studs.*` (polyhaven `rough_wood`) | https://polyhaven.com/a/rough_wood | Rob Tuytel | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/steel.*` (polyhaven `metal_plate_02`) | https://polyhaven.com/a/metal_plate_02 | Rob Tuytel | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/plaid.*` (polyhaven `curly_teddy_checkered`) | https://polyhaven.com/a/curly_teddy_checkered | colormass, Rico Cilliers | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/check.*` (polyhaven `fabric_pattern_07`) | https://polyhaven.com/a/fabric_pattern_07 | Rob Tuytel | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/fabric.*` (polyhaven `poly_wool_herringbone`) | https://polyhaven.com/a/poly_wool_herringbone | colormass, Rico Cilliers | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/wood_fine.*` (polyhaven `oak_veneer_01`) | https://polyhaven.com/a/oak_veneer_01 | Jenelle van Heerden | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |
| `game/client/public/art/textures/sky.*` (polyhaven HDRI `kloofendal_38d_partly_cloudy_puresky`: the sky backdrop and its light, by `tools/art/sky.mjs`) | https://polyhaven.com/a/kloofendal_38d_partly_cloudy_puresky | Greg Zaal, Jarod Guest | CC0 1.0 | — (CC0: no credit needed) | 2026-11-08, Phase 10 |

## Research references (NOT shipped, NOT assets)
Reference images and callout maps used to study Oregon are listed in
`research/oregon/refs/SOURCES.md`. They are personal reference only, are not committed to this
(public) repo, and must never be used as in-game textures.
