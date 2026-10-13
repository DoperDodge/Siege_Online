"""Read the official blueprint's opening glyph at every extracted opening: number of dark bars across the wall
band, bar tone, and ticks along it. (r6calls redraws every opening as one bar + tick; the official 2020 blueprint
keeps several styles.)  usage: python3 -I bpglyph.py <floor 0|1|2|3> <walls_<F>.json> <eval_<F>.json> <blueprint dir> <out.json>"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpcheck import BP_FILE  # noqa: E402


def parse_fit(s):
    a, b = s.split('*u_')[0], s.split('+ ')[1]
    return float(a), float(b)


def main():
    fl, wpath, epath, bp_dir, out_path = sys.argv[1:6]
    O = json.load(open(wpath))['openings']
    fit = json.load(open(epath))['summary']['blueprint']['fit']
    ax, bx = parse_fit(fit['px_x'])
    ay, by = parse_fit(fit['px_y'])
    img = np.asarray(Image.open(os.path.join(bp_dir, f'r6-maps-oregon-blueprint-{BP_FILE[fl]}.jpg')).convert('RGB')).astype(int)
    mn = img.min(axis=2)
    H, W = mn.shape

    def samp(xu, yu):
        x = np.clip(np.round(ax * xu + bx).astype(int), 0, W - 1)
        y = np.clip(np.round(ay * yu + by).astype(int), 0, H - 1)
        return mn[y, x], img[y, x]

    out = []
    for o in O:
        if o['type'] == 'DRONE_HOLE':
            continue
        x0, y0, x1, y1 = o['rect']
        k = o['k']
        if k == 'H':
            a0, a1, c = x0, x1, (y0 + y1) / 2
        else:
            a0, a1, c = y0, y1, (x0 + x1) / 2
        L = a1 - a0
        # cross profiles over the central 60 % of the span, -4..+4 u across in 0.25 u steps
        acr = np.arange(-4, 4.01, 0.25)
        alg = np.linspace(a0 + 0.2 * L, a1 - 0.2 * L, 9)
        prof = []
        for d in acr:
            if k == 'H':
                v, _ = samp(alg, np.full_like(alg, c + d))
            else:
                v, _ = samp(np.full_like(alg, c + d), alg)
            prof.append(np.median(v))
        prof = np.array(prof)
        # band = the white (>= 200) shoulders' extent around the centre; bars = dark runs (< 110) inside
        dark = prof < 110
        mid = len(acr) // 2
        lo = mid
        while lo > 0 and prof[lo - 1] < 200:
            lo -= 1
        hi = mid
        while hi < len(prof) - 1 and prof[hi + 1] < 200:
            hi += 1
        inner = dark[lo:hi + 1]
        bars = int(np.sum(np.diff(np.concatenate([[0], inner.astype(int), [0]])) == 1))
        tone = int(np.min(prof[lo:hi + 1])) if hi >= lo else 255
        # ticks: white (>= 200) runs along the centre line inside the opening
        alg2 = np.arange(a0 + 0.5, a1 - 0.5, 0.25)
        if k == 'H':
            v, _ = samp(alg2, np.full_like(alg2, c))
        else:
            v, _ = samp(np.full_like(alg2, c), alg2)
        wt = v >= 200
        ticks = int(np.sum(np.diff(np.concatenate([[0], wt.astype(int), [0]])) == 1))
        solid = bool(np.mean(v >= 200) > 0.75)
        style = 'solid wall in bp' if solid else ('double bar' if bars >= 2 else 'single bar' if bars == 1 else f'light bar (min {tone})')
        out.append(dict(id=o['id'], type=o['type'], rect=[round(v, 1) for v in o['rect']], w=o['w'], bp_bars=bars, bp_tone=tone,
                        bp_ticks=ticks, bp_style=style))
    for r in out:
        print(f"{r['id']:7s} {r['type']:11s} {str(r['rect']):34s} w {r['w']:5.1f}  bp: {r['bp_style']:22s} ticks {r['bp_ticks']}")
    json.dump(out, open(out_path, 'w'), indent=1)


if __name__ == '__main__':
    main()
