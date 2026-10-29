"""Overlay PNG for checking extracted walls by eye (scratch only: it contains the r6calls raster, never commit it)."""
from PIL import Image, ImageDraw

from wallgeo import S

COL = dict(HARD=(0, 220, 255), SOFT=(255, 210, 0), DOOR=(40, 230, 60), EXT_OPENING=(255, 40, 255), OPEN=(255, 140, 0),
           DRONE_HOLE=(170, 90, 255))


def draw(rgba_path, walls, opens, out_path, crop_u=None, ppu=6.0, soft_md=None, rooms=None, bad=None, bp_flags=None,
         fl='2'):
    base = Image.open(rgba_path).convert('RGBA')
    bg = Image.new('RGBA', base.size, (30, 30, 34, 255))
    bg.alpha_composite(base)
    im = bg.convert('RGB')
    # dim
    im = Image.blend(im, Image.new('RGB', im.size, (0, 0, 0)), 0.45)
    x0u, y0u, x1u, y1u = crop_u or (0, 0, 361.244, 361.244)
    box = (int(x0u / S), int(y0u / S), int(x1u / S), int(y1u / S))
    im = im.crop(box)
    scale = ppu * S  # output px per raster px
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.NEAREST)
    d = ImageDraw.Draw(im, 'RGBA')

    def P(x, y):
        return ((x - x0u) * ppu, (y - y0u) * ppu)

    if rooms:
        for rm in rooms:
            (rx0, rx1), (ry0, ry1) = rm['x'], rm['y']
            d.rectangle([P(rx0, ry0), P(rx1, ry1)], outline=(200, 200, 200, 110), width=1)
            d.text(P(rx0 + 1, ry0 + 1), rm['id'].split('_', 1)[1][:14], fill=(230, 230, 230, 200))
    for w in walls:
        x0, y0, x1, y1 = w['rect']
        c = COL[w['surface']]
        a = 150 if w['surface'] == 'SOFT' else 95
        flag = bp_flags.get(w['id']) if bp_flags else None
        outline = (255, 60, 60, 255) if flag == 'bp-miss' else c + (255,)
        d.rectangle([P(x0, y0), P(x1, y1)], fill=c + (a,), outline=outline, width=2 if flag == 'bp-miss' else 1)
    for o in opens:
        x0, y0, x1, y1 = o['rect']
        c = COL.get(o['type'], (255, 255, 255))
        d.rectangle([P(x0, y0), P(x1, y1)], fill=c + (170,), outline=c + (255,), width=1)
    if soft_md:
        for s in soft_md:
            if s['floor'] != fl:
                continue
            (sx0, sx1), (sy0, sy1) = s['x'], s['y']
            d.rectangle([P(sx0, sy0), P(sx1, sy1)], outline=(255, 0, 0, 255), width=1)
            d.text(P(sx0, sy1 + 0.5), s['id'][3:], fill=(255, 90, 90, 255))
    if bad:
        for (x, y) in bad:
            px, py = P(x, y)
            d.line([(px - 3, py - 3), (px + 3, py + 3)], fill=(255, 0, 0, 255), width=2)
            d.line([(px - 3, py + 3), (px + 3, py - 3)], fill=(255, 0, 0, 255), width=2)
    # legend
    lx, ly = 8, 8
    for name, c in COL.items():
        d.rectangle([lx, ly, lx + 14, ly + 10], fill=c + (220,))
        d.text((lx + 18, ly - 1), name, fill=(255, 255, 255, 255))
        ly += 14
    d.rectangle([lx, ly, lx + 14, ly + 10], outline=(255, 0, 0, 255))
    d.text((lx + 18, ly - 1), 'surfaces.md soft wall', fill=(255, 255, 255, 255))
    ly += 14
    d.line([(lx, ly), (lx + 10, ly + 10)], fill=(255, 0, 0, 255), width=2)
    d.text((lx + 18, ly - 1), 'composition-row mismatch', fill=(255, 255, 255, 255))
    im.save(out_path)
    return im.size
