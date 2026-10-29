"""Accuracy of extracted walls against the research tables (all in u).

  soft   : each surfaces.md §2 soft wall -> is there a raster wall on it? centre/thickness offset, coverage
  rows   : each surfaces.md §3 composition row with coordinates -> sample the wall line every 0.25 u and compare
           expected (HARD/SOFT = solid, DOOR/EXT_OPENING/OPEN = opening) with what was extracted; positions within
           1 u of a documented span boundary are not scored; opening ends are compared one to one
  rooms  : each layout_notes §4 room-box edge -> distance to the nearest parallel wall band
  extra  : extracted walls that no §3 row, §2 soft wall or §4 room edge accounts for
"""
import numpy as np

BTOL = 1.0   # u: band tolerance when matching a documented wall line to extracted bands
EDGE = 1.0   # u: positions this close to a documented span boundary are not scored


def _band(o):
    x0, y0, x1, y1 = o['rect']
    return (y0, y1, x0, x1) if o['k'] == 'H' else (x0, x1, y0, y1)  # (b0, b1, a0, a1)


def _cover(objs, k, c0, c1, a):
    """objects of axis k whose band overlaps [c0, c1] (tolerance BTOL) and whose span contains a."""
    hits = []
    for o in objs:
        if o['k'] != k:
            continue
        b0, b1, a0, a1 = _band(o)
        if b1 < c0 - BTOL or b0 > c1 + BTOL:
            continue
        if a0 - 1e-6 <= a <= a1 + 1e-6:
            hits.append(o)
    return hits


def _perp_at(walls, k, c0, c1, a):
    """a perpendicular wall crossing the line at position a (a junction counts as solid)."""
    other = 'V' if k == 'H' else 'H'
    for o in walls:
        if o['k'] != other:
            continue
        b0, b1, a0, a1 = _band(o)   # for the perpendicular wall: band is along our axis a
        if b0 - 0.2 <= a <= b1 + 0.2 and a0 - 0.5 <= (c0 + c1) / 2 <= a1 + 0.5:
            return True
    return False


def eval_soft(W, soft_md, fl):
    out = []
    for s in soft_md:
        if s['floor'] != fl:
            continue
        k = s['k']
        c0, c1 = (s['y'] if k == 'H' else s['x'])
        a0, a1 = (s['x'] if k == 'H' else s['y'])
        cand = []
        for w in W:
            if w['k'] != k:
                continue
            b0, b1, wa0, wa1 = _band(w)
            ov_b = min(b1, c1) - max(b0, c0)
            ov_a = min(wa1, a1) - max(wa0, a0)
            if ov_b > 0.5 * min(b1 - b0, c1 - c0) and ov_a > 0:
                cand.append((w, ov_a))
        cov = np.zeros(int(round((a1 - a0) / 0.1)) + 1, bool)
        for w, _ in cand:
            b0, b1, wa0, wa1 = _band(w)
            i0 = int(np.clip(np.ceil((wa0 - a0) / 0.1), 0, len(cov)))
            i1 = int(np.clip(np.floor((wa1 - a0) / 0.1) + 1, 0, len(cov)))
            cov[i0:i1] = True
        if cand:
            w = max(cand, key=lambda t: t[1])[0]
            b0, b1, _, _ = _band(w)
            dc = round((b0 + b1) / 2 - (c0 + c1) / 2, 2)
            dt = round((b1 - b0) - (c1 - c0), 2)
            tagged = sum(1 for w2, _ in cand if w2.get('surface') == 'SOFT')
        else:
            dc = dt = None
            tagged = 0
        out.append(dict(id=s['id'], found=bool(cand), coverage=round(float(cov.mean()), 3), d_centre=dc, d_thickness=dt,
                        tagged_soft=tagged > 0, sections_doc=s['sections']))
    return out


def eval_rows(W, O, rows, fl, step=0.25):
    res = []
    for r in rows:
        if r['floor'] != fl or not r['line'] or not r['spans']:
            continue
        k, (c0, c1), (s0, s1) = r['line']
        samples = []
        for a in np.arange(s0 + step / 2, s1, step):
            exp = None
            for typ, a0, a1 in r['spans']:
                if a0 <= a < a1:
                    exp = typ
            if exp is None:
                continue
            if any(abs(a - b) < EDGE for _, a0, a1 in r['spans'] for b in (a0, a1)):
                continue
            if any(abs(a - b) < EDGE for b in (s0, s1)):
                continue
            ow = _cover(W, k, c0, c1, a)
            oo = _cover(O, k, c0, c1, a)
            if oo:
                got = oo[0]['type']
            elif ow or _perp_at(W, k, c0, c1, a):
                got = 'SOLID'
            else:
                got = 'NONE'
            samples.append((a, exp, got))
        n_solid = sum(1 for _, e, _ in samples if e in ('HARD', 'SOFT', 'DRONE_HOLE'))
        ok_solid = sum(1 for _, e, g in samples if e in ('HARD', 'SOFT', 'DRONE_HOLE') and g == 'SOLID')
        n_open = sum(1 for _, e, _ in samples if e in ('DOOR', 'EXT_OPENING', 'OPEN'))
        # passable: no solid wall where the research has an opening (an OPEN passage with no wall line at all counts)
        ok_open = sum(1 for _, e, g in samples if e in ('DOOR', 'EXT_OPENING', 'OPEN') and g != 'SOLID'
                      and (g != 'NONE' or e == 'OPEN'))
        ok_type = sum(1 for _, e, g in samples if e in ('DOOR', 'EXT_OPENING', 'OPEN') and (g == e or (e == 'OPEN' and g == 'NONE')))
        # one-to-one opening comparison
        ops = []
        for typ, a0, a1 in r['spans']:
            if typ not in ('DOOR', 'EXT_OPENING', 'OPEN'):
                continue
            best, bov = None, 0
            for o in O:
                if o['k'] != k:
                    continue
                b0, b1, oa0, oa1 = _band(o)
                if b1 < c0 - BTOL or b0 > c1 + BTOL:
                    continue
                ov = min(oa1, a1) - max(oa0, a0)
                if ov > bov:
                    best, bov = o, ov
            if best is None and typ == 'OPEN' and not any(_cover(W, k, c0, c1, a) for a in np.arange(a0 + 0.5, a1 - 0.5, 0.5)):
                ops.append(dict(doc=(typ, a0, a1), got=('NO_WALL', a0, a1), d0=None, d1=None))
            elif best is not None:
                b0, b1, oa0, oa1 = _band(best)
                ops.append(dict(doc=(typ, a0, a1), got=(best['type'], round(oa0, 1), round(oa1, 1)),
                                d0=round(oa0 - a0, 1), d1=round(oa1 - a1, 1)))
            else:
                ops.append(dict(doc=(typ, a0, a1), got=None))
        res.append(dict(a=r['a'], b=r['b'], spec=r['spec'], n=len(samples), solid=(ok_solid, n_solid), open=(ok_open, n_open),
                        open_type=(ok_type, n_open), openings=ops,
                        bad=[(round(a, 2), e, g) for a, e, g in samples
                             if not ((e in ('HARD', 'SOFT', 'DRONE_HOLE') and g == 'SOLID') or
                                     (e in ('DOOR', 'EXT_OPENING', 'OPEN') and g != 'SOLID' and (g != 'NONE' or e == 'OPEN')))]))
    return res


def eval_rooms(W, rooms, fl, search=8.0):
    out = []
    for rm in rooms:
        if rm['floor'] != fl:
            continue
        (x0, x1), (y0, y1) = rm['x'], rm['y']
        for side, k, c, a0, a1 in (('N', 'H', y0, x0, x1), ('S', 'H', y1, x0, x1), ('W', 'V', x0, y0, y1), ('E', 'V', x1, y0, y1)):
            best = None
            for w in W:
                if w['k'] != k:
                    continue
                b0, b1, wa0, wa1 = _band(w)
                ov = min(wa1, a1) - max(wa0, a0)
                if ov < 0.3 * (a1 - a0) and ov < 6:
                    continue
                d = 0.0 if b0 <= c <= b1 else min(abs(c - b0), abs(c - b1))
                if d <= search and (best is None or d < best[0]):
                    best = (round(d, 2), w['id'], round(b0, 1), round(b1, 1))
            out.append(dict(room=rm['id'], side=side, edge=c, d=best[0] if best else None, wall=best[1] if best else None,
                            band=best[2:] if best else None))
    return out


def explained(W, rows, soft_md, rooms, fl, tol=1.5, room_tol=3.0):
    """per extracted wall: which research item accounts for it (row / soft / room edge) or None."""
    out = {}
    for w in W:
        b0, b1, a0, a1 = _band(w)
        why = None
        for r in rows:
            if r['floor'] != fl or not r['line']:
                continue
            k, (c0, c1), (s0, s1) = r['line']
            if k == w['k'] and b1 >= c0 - tol and b0 <= c1 + tol and min(a1, s1) - max(a0, s0) > 0.5 * min(a1 - a0, s1 - s0):
                why = 'row'
                break
        if why is None:
            for s in soft_md:
                if s['floor'] != fl or s['k'] != w['k']:
                    continue
                c0, c1 = s['y'] if s['k'] == 'H' else s['x']
                sa0, sa1 = s['x'] if s['k'] == 'H' else s['y']
                if b1 >= c0 - tol and b0 <= c1 + tol and min(a1, sa1) - max(a0, sa0) > 0:
                    why = 'soft'
                    break
        if why is None:
            for rm in rooms:
                if rm['floor'] != fl:
                    continue
                (x0, x1), (y0, y1) = rm['x'], rm['y']
                edges = ((y0, x0, x1), (y1, x0, x1)) if w['k'] == 'H' else ((x0, y0, y1), (x1, y0, y1))
                for c, e0, e1 in edges:
                    d = 0.0 if b0 <= c <= b1 else min(abs(c - b0), abs(c - b1))
                    if d <= room_tol and min(a1, e1) - max(a0, e0) > 0.5 * (a1 - a0):
                        why = 'room-edge'
                        break
                if why:
                    break
        out[w['id']] = why
    return out


def eval_openings(O, ops_md, fl, tol=2.0):
    """layout_notes §6 DOOR / EXT_OPENING / OPEN rows with an x and a y range: the narrow range is the wall line,
    the wide one the span. Match the extracted opening on that line with the largest overlap."""
    out = []
    for d in ops_md:
        if d['floor'] != fl or d['type'] not in ('DOOR', 'EXT_OPENING', 'OPEN') or not d['x'] or not d['y']:
            continue
        (x0, x1), (y0, y1) = d['x'], d['y']
        if (x1 - x0) <= (y1 - y0):
            k, c0, c1, a0, a1 = 'V', x0, x1, y0, y1
        else:
            k, c0, c1, a0, a1 = 'H', y0, y1, x0, x1
        best, bov = None, 0.0
        for o in O:
            if o['k'] != k:
                continue
            b0, b1, oa0, oa1 = _band(o)
            if b1 < c0 - tol or b0 > c1 + tol:
                continue
            ov = min(oa1, a1) - max(oa0, a0)
            if ov > bov:
                best, bov = o, ov
        how = 'overlap'
        if best is None:
            # second pass: nearest opening on the same axis within 12 u (documented coordinates can be off)
            bd = None
            for o in O:
                if o['k'] != k:
                    continue
                b0, b1, oa0, oa1 = _band(o)
                dl = 0.0 if (b0 <= c1 and b1 >= c0) else min(abs(b0 - c1), abs(b1 - c0))
                ds = max(0.0, max(oa0, a0) - min(oa1, a1))
                dd = dl + ds
                if dd <= 12 and (bd is None or dd < bd):
                    best, bd = o, dd
            how = 'nearest'
        if best is None:
            out.append(dict(a=d['a'], b=d['b'], type=d['type'], doc=(k, c0, c1, a0, a1), got=None))
            continue
        b0, b1, oa0, oa1 = _band(best)
        out.append(dict(a=d['a'], b=d['b'], type=d['type'], doc=(k, c0, c1, a0, a1), got=best['id'], got_type=best['type'], match=how,
                        got_line=(round(b0, 1), round(b1, 1)), got_span=(round(oa0, 1), round(oa1, 1)), d0=round(oa0 - a0, 1), d1=round(oa1 - a1, 1),
                        d_line=round((b0 + b1) / 2 - (c0 + c1) / 2, 1)))
    return out
