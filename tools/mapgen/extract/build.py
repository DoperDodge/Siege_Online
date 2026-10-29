"""Turn wallgeo.extract() lines into wall boxes and openings in u, then tag soft walls (bw layer) and drone holes.

Rules (px unless noted; image frame; H walls run along x, V walls along y):
  - JUNCTION runs, and SOLID runs <= 14 px that sit inside a crossing wall's band (corner fragments), take the
    band of their longer SOLID neighbour on the same line and merge into it: walls run through their junctions
  - GLYPH runs < 4 px between two solid runs are noise (merged); other GLYPH runs are openings:
    EXT_OPENING when a flanking wall is >= 10 px (3.5 u) thick (exterior drawing weight), else DOOR
  - GAP runs between two solid runs whose bands agree within 1.5 px and 3-22 u long are OPEN passages;
    other gaps are simply where walls end
  - wall ends are extended to the far face of a perpendicular wall when it lies within 3 px (closes corner notches)
  - soft walls: a wall box overlapped by a bw rect (same axis, bands overlapping >= 50 % of the thinner) is split at
    the bw span; the part inside becomes SOFT (bw rect coordinates are used for that part: exact vector data)
"""
import numpy as np

from wallgeo import S, PIC_OY

EXT_T = 10  # px: bands at least this thick are drawn with the exterior / structural weight


def _rect(k, a0, a1, b0, b1):
    return (a0, b0, a1, b1) if k == 'H' else (b0, a0, b1, a1)


def build(res, fl, soft=None, dt=None):
    oy = PIC_OY[fl]
    lines = res['lines']
    # perpendicular band index: for H lines we need V chains as rects in image px, and vice versa
    chains_img = {'H': [], 'V': []}
    for L in lines:
        for (a0, a1, b0, b1) in L['chains']:
            chains_img[L['k']].append(_rect(L['k'], a0, a1, b0, b1))

    def perp_cover(k, a0, a1, b0, b1):
        """fraction of the run span [a0,a1) lying inside a perpendicular chain that also crosses band [b0,b1)."""
        cov = np.zeros(a1 - a0, bool)
        other = 'V' if k == 'H' else 'H'
        for (x0, y0, x1, y1) in chains_img[other]:
            # in this line's frame the perpendicular chain spans 'a' over its band and 'b' over its length
            pa0, pa1, pb0, pb1 = (x0, x1, y0, y1) if k == 'H' else (y0, y1, x0, x1)
            if min(pb1, b1) - max(pb0, b0) <= 0:
                continue
            lo, hi = max(pa0, a0), min(pa1, a1)
            if hi > lo:
                cov[lo - a0:hi - a0] = True
        return cov.mean() if len(cov) else 0.0

    walls, opens = [], []
    for li, L in enumerate(lines):
        k = L['k']
        P = [dict(r) for r in L['runs']]
        for r in P:
            if r['kind'] == 'SOLID' and r['a1'] - r['a0'] <= 14 and perp_cover(k, r['a0'], r['a1'], r['b0'], r['b1']) >= 0.7:
                r['kind'] = 'JUNCTION'
        # short glyphs between solids -> solid
        for i, r in enumerate(P):
            if r['kind'] == 'GLYPH' and r['a1'] - r['a0'] < 4 and 0 < i < len(P) - 1 \
                    and P[i - 1]['kind'] in ('SOLID', 'JUNCTION') and P[i + 1]['kind'] in ('SOLID', 'JUNCTION'):
                r['kind'] = 'JUNCTION'
        # junctions adopt the band of their longer solid neighbour
        for i, r in enumerate(P):
            if r['kind'] != 'JUNCTION':
                continue
            nb = [P[j] for j in (i - 1, i + 1) if 0 <= j < len(P) and P[j]['kind'] == 'SOLID']
            if nb:
                best = max(nb, key=lambda q: q['a1'] - q['a0'])
                r['b0'], r['b1'] = best['b0'], best['b1']
                r['kind'] = 'SOLIDJ'
        # merge consecutive solid pieces with the same band
        pieces = []
        for r in P:
            if r['kind'] in ('SOLID', 'SOLIDJ'):
                if pieces and pieces[-1]['kind'] == 'W' and pieces[-1]['a1'] == r['a0'] \
                        and abs(pieces[-1]['b0'] - r['b0']) <= 1 and abs(pieces[-1]['b1'] - r['b1']) <= 1:
                    q = pieces[-1]
                    if r['kind'] == 'SOLID' and (r['a1'] - r['a0']) > q['solid_len']:
                        q['b0'], q['b1'] = r['b0'], r['b1']
                    q['a1'] = r['a1']
                    q['solid_len'] += (r['a1'] - r['a0']) if r['kind'] == 'SOLID' else 0
                else:
                    pieces.append(dict(kind='W', a0=r['a0'], a1=r['a1'], b0=r['b0'], b1=r['b1'],
                                       solid_len=(r['a1'] - r['a0']) if r['kind'] == 'SOLID' else 0))
            else:
                pieces.append(dict(r))
        for i, r in enumerate(pieces):
            if r['kind'] == 'W':
                if r['solid_len'] == 0 and r['a1'] - r['a0'] <= 14:
                    continue  # a bare junction with no wall of this line: belongs to the crossing wall
                if r['b1'] - r['b0'] <= 3:
                    continue  # <= 3 px thick: a classification sliver along another wall's edge, not a wall
                walls.append(dict(k=k, line=li, a0=r['a0'], a1=r['a1'], b0=r['b0'], b1=r['b1']))
                continue
            left = pieces[i - 1] if i > 0 and pieces[i - 1]['kind'] == 'W' else None
            right = pieces[i + 1] if i + 1 < len(pieces) and pieces[i + 1]['kind'] == 'W' else None
            if r['kind'] in ('GLYPH', 'JUNCTION'):
                if left is None and right is None:
                    continue
                if r['a1'] - r['a0'] < 4:
                    continue
                tt = max((q['b1'] - q['b0']) for q in (left, right) if q is not None)
                opens.append(dict(k=k, line=li, a0=r['a0'], a1=r['a1'], b0=r['b0'], b1=r['b1'], src='glyph',
                                  type='EXT_OPENING' if tt >= EXT_T else 'DOOR', bars=r.get('bars'), white=r.get('white')))
            elif r['kind'] == 'GAP':
                if left is None or right is None:
                    continue
                L_ = (r['a1'] - r['a0']) * S
                if not (3.0 <= L_ <= 22.0):
                    continue
                if abs(left['b0'] - right['b0']) > 1.5 or abs(left['b1'] - right['b1']) > 1.5:
                    continue
                opens.append(dict(k=k, line=li, a0=r['a0'], a1=r['a1'], b0=left['b0'], b1=left['b1'], src='gap', type='OPEN'))
    # ---- end snapping: a wall end that lies in (or within 3 px of) the band of a perpendicular wall whose span
    # reaches this wall's band (T junction) or ends within 3 px of it (L corner) is extended to that wall's far
    # face, so corners are closed (the two boxes overlap in the corner square)
    for w in walls:
        for end in ('a0', 'a1'):
            pos = w[end]
            best = None
            for p in walls:
                if p is w or p['k'] == w['k']:
                    continue
                # p's band runs along w's axis a; p's span runs across it
                if p['a0'] > w['b1'] + 3 or p['a1'] < w['b0'] - 3:
                    continue
                if not (p['b0'] - 3 <= pos <= p['b1'] + 3):
                    continue
                cand = p['b0'] if end == 'a0' else p['b1']
                if best is None or abs(cand - pos) < abs(best - pos):
                    best = cand
            if best is not None:
                if end == 'a0' and best < w['a0']:
                    w['a0'] = best
                elif end == 'a1' and best > w['a1']:
                    w['a1'] = best
    # ---- to u
    def to_u(o):
        x0, y0, x1, y1 = _rect(o['k'], o['a0'], o['a1'], o['b0'], o['b1'])
        return [round(x0 * S, 2), round(y0 * S + oy, 2), round(x1 * S, 2), round(y1 * S + oy, 2)]
    W = []
    for i, w in enumerate(walls):
        r = to_u(w)
        c = (r[1] + r[3]) / 2 if w['k'] == 'H' else (r[0] + r[2]) / 2
        W.append(dict(id=f'{fl}-w{i:03d}', k=w['k'], rect=r, c=round(c, 2), t=round((w['b1'] - w['b0']) * S, 2),
                      len=round((w['a1'] - w['a0']) * S, 2), weight='ext' if (w['b1'] - w['b0']) >= EXT_T else 'int',
                      surface='HARD', src='r6calls-raster'))
    O = []
    for i, o in enumerate(opens):
        r = to_u(o)
        O.append(dict(id=f'{fl}-o{i:03d}', k=o['k'], rect=r, w=round((o['a1'] - o['a0']) * S, 2), type=o['type'],
                      src=o['src'], glyph_bars=o.get('bars')))
    W = drop_covered(W)
    if soft:
        W = split_soft(W, soft, fl)
    if dt:
        for d in dt:
            O.append(dict(id=f"{fl}-dt-{d['id']}", k='?', rect=[d['x0'], d['y0'], d['x1'], d['y1']], w=None,
                          type='DRONE_HOLE', src='r6calls-dt'))
    return W, O


def split_soft(W, soft, fl):
    out = []
    used = {s['id']: 0.0 for s in soft}
    for w in W:
        x0, y0, x1, y1 = w['rect']
        cuts = []
        for s in soft:
            if s['k'] != w['k']:
                continue
            if w['k'] == 'H':
                bov = min(y1, s['y1']) - max(y0, s['y0'])
                th = min(y1 - y0, s['y1'] - s['y0'])
                lo, hi = max(x0, s['x0']), min(x1, s['x1'])
            else:
                bov = min(x1, s['x1']) - max(x0, s['x0'])
                th = min(x1 - x0, s['x1'] - s['x0'])
                lo, hi = max(y0, s['y0']), min(y1, s['y1'])
            if bov >= 0.5 * th and hi - lo > 0.5:
                cuts.append((lo, hi, s))
        if not cuts:
            out.append(w)
            continue
        cuts.sort(key=lambda c: c[0])
        a0, a1 = (x0, x1) if w['k'] == 'H' else (y0, y1)
        cur = a0
        parts = []
        for lo, hi, s in cuts:
            if lo - cur > 0.3:
                parts.append((cur, lo, None))
            parts.append((lo, hi, s))
            cur = hi
        if a1 - cur > 0.3:
            parts.append((cur, a1, None))
        for j, (p0, p1, s) in enumerate(parts):
            q = dict(w)
            q['id'] = f"{w['id']}{'abcdefgh'[j]}"
            if w['k'] == 'H':
                q['rect'] = [round(p0, 2), y0, round(p1, 2), y1]
            else:
                q['rect'] = [x0, round(p0, 2), x1, round(p1, 2)]
            q['len'] = round(p1 - p0, 2)
            q['split_from'] = w['id']
            if s is not None:
                q['surface'] = 'SOFT'
                q['soft_id'] = s['id']
                q['sections_r6calls'] = s['sections_r6calls']
                q['src'] = 'r6calls-raster+bw'
                # band from the vector rect (exact), span = overlap of raster wall and bw rect
                if w['k'] == 'H':
                    q['rect_bw'] = [s['x0'], s['y0'], s['x1'], s['y1']]
                else:
                    q['rect_bw'] = [s['x0'], s['y0'], s['x1'], s['y1']]
                used[s['id']] += p1 - p0
            out.append(q)
    return out


def drop_covered(W, frac=0.9, step=0.1):
    """Remove wall boxes that other boxes already cover (>= 90 % of their area, sampled every 0.1 u): corner
    fragments left behind once the walls they belong to were extended through the corner."""
    keep = []
    order = sorted(range(len(W)), key=lambda i: (W[i]['rect'][2] - W[i]['rect'][0]) * (W[i]['rect'][3] - W[i]['rect'][1]))
    dropped = set()
    for i in order:
        x0, y0, x1, y1 = W[i]['rect']
        xs = np.arange(x0 + step / 2, x1, step)
        ys = np.arange(y0 + step / 2, y1, step)
        if len(xs) == 0 or len(ys) == 0:
            dropped.add(i)
            continue
        X, Y = np.meshgrid(xs, ys)
        cov = np.zeros(X.shape, bool)
        for j, o in enumerate(W):
            if j == i or j in dropped:
                continue
            a0, b0, a1, b1 = o['rect']
            if a1 <= x0 or a0 >= x1 or b1 <= y0 or b0 >= y1:
                continue
            cov |= (X >= a0) & (X <= a1) & (Y >= b0) & (Y <= b1)
        if cov.mean() >= frac:
            dropped.add(i)
    for i, w in enumerate(W):
        if i not in dropped:
            keep.append(w)
    return keep
