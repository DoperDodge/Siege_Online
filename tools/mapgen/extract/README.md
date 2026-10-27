# Oregon wall extraction (dev-only)

Reads the r6calls Oregon map file and the official Ubisoft blueprints, and writes the numbers the
Oregon layout is built from: `data/maps/oregon/extracted.json` (wall boxes, door and window openings,
soft-wall spans, drone holes, hatches, icon points, cross-floor fits and accuracy figures, all in u).
The authoring files `data/maps/oregon/walls_<floor>.json` were seeded from it once
(`npm run mapgen:import`); the mapgen drift test compares them with it.

**Never commit an image.** The downloads and every picture these scripts write (floor rasters,
overlays, the stacking picture) contain r6calls or Ubisoft imagery. They live in gitignored folders
only: `research/oregon/refs/web/` (downloads) and `img/`, `out/` here (outputs). The repo test
`tools/mapgen/hygiene.test.ts` fails on any tracked image.

## Run it

Needs Python 3 with numpy and Pillow (not part of `npm ci`; nothing in CI runs this).

1. Download the inputs into `research/oregon/refs/web/` (gitignored):
   - `r6calls/oregon.svg` from https://r6calls.com/img/maps/oregon.svg (about 29 MB);
   - `blueprint/r6-maps-oregon-blueprints.zip` from
     https://ubistatic-a.ubisoft.com/0106/gamesites/rainbow6/blueprints/r6-maps-oregon-blueprints.zip,
     unzipped next to it (`r6-maps-oregon-blueprint-1.jpg` … `-5.jpg`).

   `npm run mapgen:refs` does both.
2. `sh tools/mapgen/extract/rerun.sh` (about 10 s). It prints the per-floor accuracy line and rewrites
   `data/maps/oregon/extracted.json`. With the same downloads the output is byte-identical; the file
   records the downloads' SHA-256.

## What each script does

| Script | Role |
|---|---|
| `svg_inventory.py` | Lists the SVG's groups and vector layers (what exists besides the rasters) |
| `svgdata.py` | Writes each floor's embedded 1024 px raster to `img/r6c/` and reads the overlay vectors (soft walls `bw`, drone holes `dt`, hatches `fh`/`ch`, soft floors `losf`, icons) |
| `wallgeo.py` | Finds the white wall bands in a raster and turns them into boxes (run-length vectorisation) |
| `build.py` | Splits bands at the door and window glyphs, attaches soft-wall spans and drone holes |
| `bpcheck.py`, `bpglyph.py` | Registers each blueprint floor to the raster and checks every wall and opening against it. Run on its own, `bpcheck.py` checks what we build instead (next section) |
| `evaluate.py`, `research.py`, `corrections.py` | Compare with the research tables (`research/oregon/*.md`) |
| `run.py` | Runs the above per floor; writes `out/walls_<F>.json`, `out/eval_<F>.json` and overlay pictures in `img/` |
| `xfloor.py`, `combine.py` | Fit the per-floor frames (2F is about 2.4% larger than 1F) and combine the floors |
| `points.py` | Icon centres (cameras, extinguishers, gas pipes, ladders, bombs, spawns, hatches) |
| `pack.py` | Packs the numbers into `data/maps/oregon/extracted.json` |

## Our walls against the blueprint

`python3 -I tools/mapgen/extract/bpcheck.py` (after `npm run mapgen:refs`) reads the wall files we build from,
`data/maps/oregon/walls_<floor>.json`, registers each floor's blueprint to them, and prints per floor how much of
the hard wall's length the blueprint draws within 1.5 u, which stretches it doesn't, and any door, window or
passage where it draws solid wall; `builds/mapgen/bpcheck.json` has the detail. For the eye, `npm run
mapgen:compare` writes `builds/mapgen/compare/index.html`: each floor's plan over the r6calls raster or the
blueprint, with an opacity slider and the layers (the research's room boxes too) to switch.

The design and its accuracy figures: `tools/mapgen/DESIGN.md` §6.
