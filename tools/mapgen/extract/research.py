"""Parse the Oregon research tables (u coordinates) that the wall extraction is checked against.
  surfaces.md  §2  soft walls (32)            -> soft_walls()
               §3  composition rows by wall    -> rows()
  layout_notes §4  room bounding boxes (±2 u)  -> rooms()
               §6  openings                    -> openings()
"""
import re

RNG = r'(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)'
FLOOR_OF = {'B': '0', '1F': '1', '2F': '2', '3F': '3'}
TYPES = r'(HARD|SOFT\(\d\)|DOOR|EXT_OPENING|OPEN|DRONE_HOLE)'


def _table_rows(lines, start_pat, stop_pat):
    on = False
    for l in lines:
        if re.match(start_pat, l):
            on = True
            continue
        if on and re.match(stop_pat, l):
            on = False
        if on and l.startswith('|') and not l.startswith('|---'):
            yield [c.strip() for c in l.strip().strip('|').split('|')]


def _rng(s):
    m = re.search(RNG, s)
    return (float(m.group(1)), float(m.group(2))) if m else None


def soft_walls(root):
    L = open(f'{root}/research/oregon/surfaces.md').read().split('\n')
    out = []
    for c in _table_rows(L, r'### 2\.[1-3]', r'### 2\.4|## 3'):
        if not c[0].startswith('SW-'):
            continue
        x, y = _rng(c[3]), _rng(c[4])
        sec = re.sub(r'[^0-9]', '', c[7]) or '1'
        out.append(dict(id=c[0], floor=FLOOR_OF[c[0].split('-')[1]], x=x, y=y, k='V' if c[5].startswith('N') else 'H',
                        sections=int(sec), a=c[1], b=c[2]))
    return out


def rooms(root):
    L = open(f'{root}/research/oregon/layout_notes.md').read().split('\n')
    out = []
    for c in _table_rows(L, r'### 4\.[1-4]', r'### 4\.[5-6]|## 5'):
        if c[0] == 'room_id':
            continue
        x, y = _rng(c[1]), _rng(c[2])
        if x and y:
            out.append(dict(id=c[0], floor=FLOOR_OF.get(c[0].split('_')[0]), x=x, y=y, note=c[4] if len(c) > 4 else ''))
    return out


def _line(spec):
    """'x 62–65, y 181–229' -> ('V', (62, 65), (181, 229)); 'y 204–207, x 140–209' -> ('H', ...)."""
    spec = spec.replace('≈', ' ')
    mx = re.search(r'\bx\s+' + RNG, spec)
    my = re.search(r'\by\s+' + RNG, spec)
    if '·' in spec or not (mx and my):
        return None
    xr = (float(mx.group(1)), float(mx.group(2)))
    yr = (float(my.group(1)), float(my.group(2)))
    # the coordinate written first is the wall line (narrow range), the second is the span
    if mx.start() < my.start():
        return ('V', xr, yr)
    return ('H', yr, xr)


def _spans(comp, span):
    toks = [t.strip() for t in comp.replace('**', '').split('·')]
    items = []
    for t in toks:
        m = re.match(TYPES, t)
        if not m:
            return None
        typ = m.group(1)
        if '+ DRONE_HOLE' in t or '+ HARD' in t:
            typ = 'HARD' if typ == 'HARD' else typ
        body = re.sub(r'\s\([^)]*\)', '', t[len(m.group(0)):])
        r = _rng(body)
        items.append(dict(type=typ.split('(')[0], sections=int(typ[5]) if typ.startswith('SOFT') else None,
                          a=r, full='full' in body, ends='ends' in body, text=t))
    s0, s1 = span
    if len(items) == 1 and items[0]['a'] is None:
        items[0]['a'] = (s0, s1)
        return [(items[0]['type'], s0, s1)]
    out = []
    for i, it in enumerate(items):
        if it['a'] is not None:
            out.append((it['type'], it['a'][0], it['a'][1]))
            continue
        if it['full']:
            out.append((it['type'], s0, s1))
            continue
        if it['ends']:
            others = [q for q in items if q['a'] is not None]
            if others:
                out.append((it['type'], s0, min(q['a'][0] for q in others)))
                out.append((it['type'], max(q['a'][1] for q in others), s1))
            continue
        prev = next((items[j]['a'][1] for j in range(i - 1, -1, -1) if items[j]['a'] is not None), None)
        nxt = next((items[j]['a'][0] for j in range(i + 1, len(items)) if items[j]['a'] is not None), None)
        a0 = prev if prev is not None else s0
        a1 = nxt if nxt is not None else s1
        if i > 0 and items[i - 1]['a'] is None and prev is None:
            return None  # two implicit spans in a row: ambiguous
        out.append((it['type'], a0, a1))
    return sorted(out, key=lambda q: q[1])


def rows(root):
    L = open(f'{root}/research/oregon/surfaces.md').read().split('\n')
    out = []
    for sec, fl in (('3.1', '0'), ('3.2', '1'), ('3.3', '2')):
        for c in _table_rows(L, rf'### {re.escape(sec)}', r'### 3\.|## 4'):
            if c[0] == 'Room A' or len(c) < 4:
                continue
            ln = _line(c[2])
            sp = _spans(c[3], ln[2]) if ln else None
            out.append(dict(floor=fl, a=c[0], b=c[1], spec=c[2], comp=c[3], line=ln, spans=sp))
    return out


def openings(root):
    L = open(f'{root}/research/oregon/layout_notes.md').read().split('\n')
    out = []
    for sec, fl in (('6.1', '0'), ('6.2', '1'), ('6.3', '2'), ('6.4', '3')):
        for c in _table_rows(L, rf'### {re.escape(sec)}', r'### 6\.|## 7'):
            if c[0] == 'Room A' or len(c) < 4:
                continue
            t = c[2]
            kind = 'DOOR' if t.startswith('DOOR') else 'EXT_OPENING' if 'EXT_OPENING' in t else 'OPEN' if t.startswith('OPEN') \
                else 'SOFT' if t.startswith('SOFT') else 'OTHER'
            w = c[3].replace('≈', ' ')
            mx = re.search(r'\bx\s+' + RNG, w)
            my = re.search(r'\by\s+' + RNG, w)
            out.append(dict(floor=fl, a=c[0], b=c[1], type=kind, where=c[3],
                            x=(float(mx.group(1)), float(mx.group(2))) if mx else None,
                            y=(float(my.group(1)), float(my.group(2))) if my else None))
    return out


if __name__ == '__main__':
    import sys
    root = sys.argv[1]
    sw, rm, rw, op = soft_walls(root), rooms(root), rows(root), openings(root)
    print('soft walls', len(sw), 'rooms', len(rm), 'rows', len(rw), 'rows with spans', sum(1 for r in rw if r['spans']), 'openings', len(op))
    for r in rw:
        if r['floor'] == sys.argv[2] if len(sys.argv) > 2 else True:
            print(r['floor'], r['a'], '|', r['b'], '|', r['line'], '|', r['spans'] if r['spans'] else 'UNPARSED: ' + r['comp'][:60])
