#!/bin/sh
# Oregon wall extraction (Phase 5): rerun everything and repack data/maps/oregon/extracted.json.
# Dev-only, never run in CI. Needs python3 with numpy and Pillow, and the downloads in
# research/oregon/refs/web/ (gitignored; see README.md for the URLs). Every image this writes (floor rasters,
# overlays) goes to img/ next to this script, which is gitignored: those images contain r6calls or Ubisoft
# imagery and must never be committed. out/ (gitignored) holds the intermediate JSON and logs.
# Overrides: SVG (r6calls oregon.svg), BP (folder with r6-maps-oregon-blueprint-{1..5}.jpg), ZIP (the
# blueprint zip, hashed for provenance), REPO (checkout whose research/oregon/*.md the checks read).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
REFS="$ROOT/research/oregon/refs/web"
SVG=${SVG:-$REFS/r6calls/oregon.svg}
BP=${BP:-$REFS/blueprint}
ZIP=${ZIP:-$REFS/blueprint/r6-maps-oregon-blueprints.zip}
REPO=${REPO:-$ROOT}
cd "$HERE"
mkdir -p out img/r6c
python3 -I svg_inventory.py "$SVG" out/svg_inventory.json > out/svg_inventory.txt      # what vectors exist
python3 -I svgdata.py "$SVG" img/r6c > out/svgdata.txt && mv img/r6c/svg_vectors.json out/   # floor PNGs + overlay vectors
python3 -I run.py --floors 0,1,2,3 --repo "$REPO" --svg "$SVG" --bp-dir "$BP" > out/run_log.txt   # extract + check + overlays
for p in "B 1F" "1F 2F" "2F 3F"; do
  set -- $p
  python3 -I xfloor.py "out/walls_$1.json" "out/walls_$2.json" > "out/xfloor_$1_$2.json"     # cross-floor frames
done
python3 -I combine.py                                                                   # walls_oregon.json + stack picture
python3 -I corrections.py                                                               # research §6 openings vs extracted
for f in 0:B 1:1F 2:2F; do
  python3 -I bpglyph.py "${f%%:*}" "out/walls_${f##*:}.json" "out/eval_${f##*:}.json" "$BP" "out/bpglyph_${f%%:*}.json" > "out/bpglyph_${f##*:}.txt"
done
python3 -I points.py "$SVG" cam,fe,gp,ld,dt,bmb,hst,sec,ip,fh,ch > out/points.json         # icon centres
python3 -I pack.py out out/points.json "$SVG" "$ZIP" "$ROOT/data/maps/oregon/extracted.json"
tail -n 1 out/run_log.txt
