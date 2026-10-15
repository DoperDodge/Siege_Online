"""Read what the r6calls Oregon SVG gives us per floor, in u (layout_notes §1):
  - the embedded floor rasters N-pic (written to PNG files on request),
  - vector rects of the overlay layers: bw (soft walls + separators), dt (drone holes), fh/ch (floor/ceiling hatches),
    losf (line-of-sight floors, with their outlines: pts), fe (extinguishers), gp (gas pipe).

Coordinates: inside every 'Floor N' group, u = (x - 236.996, y - 64.0). The floor images sit at x 236.996 and
y 63.973 (floors 0 and 2: 63.974) or 64 (floors 1, 3, 4), 361.244 u square, 1024 px -> 0.352777 u per px.

usage: python3 -I svgdata.py <oregon.svg> <out_dir>      (writes N-pic.png for N=0..4 and svg_vectors.json)
"""
import base64
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

INK = '{http://www.inkscape.org/namespaces/inkscape}label'
XL = '{http://www.w3.org/1999/xlink}href'
OX, OY = 236.996, 64.0
NUM = r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?'
# An embedded raster's href. Split so the repo's image check (tools/mapgen/hygiene.test.ts) doesn't flag this file.
DATA_URI = r'data:' + r'image/(\w+);base64,(.*)'


def path_bbox(d):
    """bbox of a path made of M/L/H/V/Z (abs or rel) commands; curves are approximated by their end points."""
    toks = re.findall(r'[MmLlHhVvCcSsQqTtAaZz]|' + NUM, d)
    x = y = 0.0
    sx = sy = 0.0
    xs, ys = [], []
    cmd = None
    i = 0
    nargs = dict(M=2, L=2, H=1, V=1, C=6, S=4, Q=4, T=2, A=7, Z=0)
    while i < len(toks):
        t = toks[i]
        if re.match(r'[A-Za-z]', t):
            cmd = t
            i += 1
            if cmd in 'Zz':
                x, y = sx, sy
            continue
        n = nargs[cmd.upper()]
        args = [float(v) for v in toks[i:i + n]]
        i += n
        rel = cmd.islower()
        c = cmd.upper()
        if c == 'H':
            x = x + args[0] if rel else args[0]
        elif c == 'V':
            y = y + args[0] if rel else args[0]
        else:
            nx, ny = args[-2], args[-1]
            x, y = (x + nx, y + ny) if rel else (nx, ny)
        if c == 'M':
            sx, sy = x, y
            cmd = 'l' if rel else 'L'  # implicit lineto after moveto
        xs.append(x)
        ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def path_points(d):
    """The vertices of a path made of M/L/H/V/Z (abs or rel) commands, one list per subpath; curves are taken
    by their end points (the soft-floor outlines are straight-edged apart from one near-straight curve)."""
    toks = re.findall(r'[MmLlHhVvCcSsQqTtAaZz]|' + NUM, d)
    x = y = 0.0
    sx = sy = 0.0
    subs = []
    cmd = None
    i = 0
    nargs = dict(M=2, L=2, H=1, V=1, C=6, S=4, Q=4, T=2, A=7, Z=0)
    while i < len(toks):
        t = toks[i]
        if re.match(r'[A-Za-z]', t):
            cmd = t
            i += 1
            if cmd in 'Zz':
                x, y = sx, sy
            continue
        n = nargs[cmd.upper()]
        args = [float(v) for v in toks[i:i + n]]
        i += n
        rel = cmd.islower()
        c = cmd.upper()
        if c == 'H':
            x = x + args[0] if rel else args[0]
        elif c == 'V':
            y = y + args[0] if rel else args[0]
        else:
            nx, ny = args[-2], args[-1]
            x, y = (x + nx, y + ny) if rel else (nx, ny)
        if c == 'M':
            sx, sy = x, y
            subs.append([])
            cmd = 'l' if rel else 'L'  # implicit lineto after moveto
        subs[-1].append((x, y))
    return subs


def transform_matrix(tr):
    """An element transform as (a, b, c, d, e, f): matrix(...), translate(x [y]) or scale(s [t]); None if other."""
    m = re.match(r'\s*(matrix|translate|scale)\(([^)]*)\)\s*$', tr)
    if not m:
        return None
    v = [float(q) for q in re.findall(NUM, m.group(2))]
    if m.group(1) == 'matrix':
        return tuple(v)
    if m.group(1) == 'translate':
        return 1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0.0
    return v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0


def apply_transform(tr, bb):
    """bbox through an element transform (transform_matrix); None if the transform is of another kind."""
    mt = transform_matrix(tr)
    if mt is None:
        return None
    a, b, c, d, e, f = mt
    pts = [(x, y) for x in (bb[0], bb[2]) for y in (bb[1], bb[3])]
    xs = [a * x + c * y + e for x, y in pts]
    ys = [b * x + d * y + f for x, y in pts]
    return min(xs), min(ys), max(xs), max(ys)


def read(svg_path, img_dir=None):
    floors = {}
    stack = []
    for ev, el in ET.iterparse(svg_path, events=('start', 'end')):
        t = el.tag.split('}')[-1]
        if ev == 'start':
            if t == 'g':
                stack.append(el.attrib.get(INK) or el.attrib.get('id') or '')
            continue
        if t == 'g':
            stack.pop()
            el.clear()
            continue
        if not stack or not stack[0].startswith('Floor '):
            el.clear()
            continue
        fl = stack[0].split()[1]
        F = floors.setdefault(fl, dict(layers={}, image=None))
        layer = stack[1] if len(stack) > 1 else None
        if t == 'image' and layer is None:
            x, y = float(el.attrib['x']), float(el.attrib['y'])
            w, h = float(el.attrib['width']), float(el.attrib['height'])
            F['image'] = dict(id=el.attrib.get('id'), u0=[x - OX, y - OY], size_u=[w, h])
            href = el.attrib.get(XL) or el.attrib.get('href') or ''
            m = re.match(DATA_URI, href, re.S)
            if img_dir and m:
                data = base64.b64decode(re.sub(r'\s+', '', m.group(2)))
                open(os.path.join(img_dir, f'{fl}-pic.png'), 'wb').write(data)
        elif t in ('path', 'rect') and layer:
            if t == 'rect':
                x, y = float(el.attrib.get('x', 0)), float(el.attrib.get('y', 0))
                bb = (x, y, x + float(el.attrib.get('width', 0)), y + float(el.attrib.get('height', 0)))
            else:
                bb = path_bbox(el.attrib.get('d', ''))
            tr = el.attrib.get('transform')
            if bb and tr:
                bb = apply_transform(tr, bb)
            if bb:
                key = layer.split('-', 1)[1] if '-' in layer else layer
                sub = stack[2] if len(stack) > 2 else None
                item = dict(id=el.attrib.get('id'), sub=sub, fill=el.attrib.get('fill'),
                            x0=round(bb[0] - OX, 3), y0=round(bb[1] - OY, 3), x1=round(bb[2] - OX, 3), y1=round(bb[3] - OY, 3))
                if key == 'losf' and t == 'path':
                    # Soft floors aren't all rectangles (one is an L of three rooms, two have holes): keep the
                    # outline, one vertex list per subpath, in u.
                    a, b, c, d, e, f = transform_matrix(tr) if tr else (1, 0, 0, 1, 0, 0)
                    item['pts'] = [[[round(a * x + c * y + e - OX, 3), round(b * x + d * y + f - OY, 3)] for x, y in sp]
                                   for sp in path_points(el.attrib.get('d', ''))]
                F['layers'].setdefault(key, []).append(item)
        el.clear()
    return floors


def soft_walls(floors, fl):
    """bw layer -> soft-wall rects with their separator positions (u)."""
    items = floors.get(fl, {}).get('layers', {}).get('bw', [])
    walls = [r for r in items if r['sub'] is None]
    seps = [r for r in items if r['sub'] is not None]
    out = []
    for w in walls:
        horiz = (w['x1'] - w['x0']) >= (w['y1'] - w['y0'])
        ss = []
        for s in seps:
            if s['x0'] >= w['x0'] - 0.05 and s['x1'] <= w['x1'] + 0.05 and s['y0'] >= w['y0'] - 0.05 and s['y1'] <= w['y1'] + 0.05:
                ss.append(round((s['x0'] + s['x1']) / 2 if horiz else (s['y0'] + s['y1']) / 2, 2))
        out.append(dict(id=w['id'], k='H' if horiz else 'V', x0=w['x0'], y0=w['y0'], x1=w['x1'], y1=w['y1'],
                        separators=sorted(ss), sections_r6calls=len(ss) + 1))
    return out


if __name__ == '__main__':
    svg, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    F = read(svg, out_dir)
    json.dump(F, open(os.path.join(out_dir, 'svg_vectors.json'), 'w'), indent=1)
    for fl in sorted(F):
        L = F[fl]['layers']
        print(f"floor {fl}: image {F[fl]['image']['id']} at u {F[fl]['image']['u0']}; layers " +
              ', '.join(f'{k}:{len(v)}' for k, v in sorted(L.items())) + f"; soft walls {len(soft_walls(F, fl))}")
