"""Combine the per-floor outputs into out/walls_oregon.json (walls + openings per floor, frames, cross-floor
transforms, accuracy summary) and draw img/stack_1F_2F.png: 1F walls with 2F walls on top, raw (as the rasters
place them, layout_notes §1 claims one origin) and mapped into the 1F frame with the fitted transform.
Pure vector drawing, no third-party imagery.

usage: python3 -I combine.py   (after run.py and the xfloor fits: out/xfloor_<lo>_<up>.json)
"""
import json
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')


def main():
    summ = json.load(open(os.path.join(OUT, 'summary.json')))
    xf = {}
    for lo, up in (('B', '1F'), ('1F', '2F'), ('2F', '3F')):
        p = os.path.join(OUT, f'xfloor_{lo}_{up}.json')
        if os.path.exists(p):
            xf[f'{lo}->{up}'] = json.load(open(p))
    f12 = xf['1F->2F']['fit']
    floors = {}
    for F in ('B', '1F', '2F', '3F'):
        p = os.path.join(OUT, f'walls_{F}.json')
        if not os.path.exists(p):
            continue
        d = json.load(open(p))
        floors[F] = dict(walls=d['walls'], openings=d['openings'],
                         blueprint_registration=summ[F]['blueprint']['fit'],
                         raster=dict(u_per_px=361.244 / 1024, image_origin_u=[0.0, {'B': -0.027, '2F': -0.026}.get(F, 0.0)]))
    out = dict(
        _doc=('Oregon wall geometry prototype (Phase 5). Derived coordinates only (no images). Frame: u of research/oregon/'
              'layout_notes §1 in EACH floor raster\'s own placement; see cross_floor before stacking floors. '
              'walls[].rect = [x0, y0, x1, y1] u; k = H (runs along x) or V (along y); c = centre line; t = drawn thickness; '
              'surface HARD/SOFT (SOFT spans from the r6calls bw vector layer); confidence high/medium/low (blueprint + research checks). '
              'openings[].type DOOR / EXT_OPENING / OPEN (gap) / DRONE_HOLE (r6calls dt layer).'),
        floors=floors,
        cross_floor=dict(
            finding=('The per-floor rasters do not share one frame: they are perspective renders (the official blueprints have the '
                     'same per-floor scale). Walls that stack 1F->2F fit u_2F = a*u_1F + b with a = %.4f (x) / %.4f (y), rms %.2f/%.2f u '
                     'over %d/%d wall pairs; an isotropic 1.0247 about (-1, 107.7) u fits almost as well. Map 2F into the 1F frame '
                     'before stacking.' % (f12['x']['a'], f12['y']['a'], f12['x']['rms_u'], f12['y']['rms_u'],
                                           f12['x']['inlier_pairs'], f12['y']['inlier_pairs'])),
            to_1F={
                '1F': 'identity (reference)',
                '2F': 'x1 = (x2 - %.2f) / %.4f ; y1 = (y2 - (%.2f)) / %.4f   [confidence: medium-high]' % (
                    f12['x']['b'], f12['x']['a'], f12['y']['b'], f12['y']['a']),
                'B': ('UNVERIFIED: stairwell walls (Tower, Laundry/Armory stairs) stack best with u_1F = s*(u_B - p) + p, s = 1.020-1.028, '
                      'p = (-1, 107.7), i.e. the same perspective step as 1F->2F; r6calls\' copied hatch rects favour identity. Needs Ulo.'),
                '3F': ('UNVERIFIED: only the tower walls overlap; assuming the catwalk walls stand on the 2F tower walls, '
                       'u_3F = 1.0755*x_2F - 9.04 / 1.079*y_2F - 7.32 (not the 1.025 perspective step). Needs Ulo.'),
            },
            fits=xf),
        accuracy=summ)
    json.dump(out, open(os.path.join(OUT, 'walls_oregon.json'), 'w'), indent=1)

    # ---- stack picture (vector only)
    ppu = 4
    x0u, y0u, x1u, y1u = -5, 30, 350, 295
    Wd, Ht = int((x1u - x0u) * ppu), int((y1u - y0u) * ppu)
    panels = []
    for title, mapped in (('raw: 1F (blue) and 2F (orange) as the rasters place them', False),
                          ('2F mapped into the 1F frame (fitted transform)', True)):
        im = Image.new('RGB', (Wd, Ht + 24), (18, 18, 22))
        d = ImageDraw.Draw(im, 'RGBA')
        d.text((6, 4), title, fill=(230, 230, 230))

        def P(x, y):
            return ((x - x0u) * ppu, (y - y0u) * ppu + 24)
        for w in floors['1F']['walls']:
            a, b, c, e = w['rect']
            d.rectangle([P(a, b), P(c, e)], fill=(60, 150, 255, 150))
        for w in floors['2F']['walls']:
            a, b, c, e = w['rect']
            if mapped:
                a, c = (a - f12['x']['b']) / f12['x']['a'], (c - f12['x']['b']) / f12['x']['a']
                b, e = (b - f12['y']['b']) / f12['y']['a'], (e - f12['y']['b']) / f12['y']['a']
            d.rectangle([P(a, b), P(c, e)], fill=(255, 150, 40, 120))
        panels.append(im)
    big = Image.new('RGB', (Wd * 2 + 10, Ht + 24), (0, 0, 0))
    big.paste(panels[0], (0, 0))
    big.paste(panels[1], (Wd + 10, 0))
    big.save(os.path.join(HERE, 'img', 'stack_1F_2F.png'))
    print('wrote out/walls_oregon.json and img/stack_1F_2F.png;', {F: (len(v['walls']), len(v['openings'])) for F, v in floors.items()})


if __name__ == '__main__':
    main()
