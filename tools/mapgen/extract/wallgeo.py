"""Wall geometry from the r6calls floor rasters (N-pic.png, 1024 px for 361.244 u).

r6calls draws every wall as a pure-white (255,255,255) band over the floor render; interior bands are
~7-8 px (2.5-2.7 u) thick, exterior/structural ones ~12 px (4.2 u). A door is drawn INSIDE the band as one
dark bar (+ a white tick across the band), an exterior opening as two dark bars (layout_notes §6/§8); an open
passage is a gap in the band. Everything on Oregon is axis-aligned.

Pipeline (all pure numpy):
  1. mask      white = min(R,G,B) >= 250 and alpha >= 128; drop specks < 12 px
  2. split     each white pixel goes to H or V by comparing its horizontal and vertical run lengths
  3. close     per column (H) / row (V), merge runs separated by <= 3 px when the merged run stays <= 14 px
               thick: this fills the dark glyph bars so a door does not cut its wall line in two
  4. chains    link the per-column runs of the closed H mask into chains of constant thickness (+-2 px);
               same for V on the transposed mask. A chain is an axis-aligned rectangle.
  5. lines     chains on the same axis whose centre lines agree within 1.6 px and thicknesses within 3 px
               form one wall line (they may be separated by gaps)
  6. profile   along each line, every pixel column is SOLID (white fraction across the band >= 0.7),
               GLYPH (inside a chain or a short gap, white fraction < 0.7) or GAP (no band, no white)
  7. segments  SOLID runs -> wall boxes; GLYPH runs -> openings with 1 or 2 dark bars (DOOR / EXT_OPENING);
               GAP runs between two solid parts of the same line -> OPEN
Coordinates come out in u (layout_notes §1); pixel (i, j) covers u [i*S, (i+1)*S) x [j*S+oy, (j+1)*S+oy).
"""
import numpy as np
from PIL import Image

S = 361.244 / 1024.0  # u per px
PIC_OY = {'0': -0.027, '1': 0.0, '2': -0.026, '3': 0.0, '4': 0.0}  # image y offset per floor (SVG)


def load_rgba(path):
    return np.asarray(Image.open(path).convert('RGBA'))


# ---------------------------------------------------------------- connected components (4-conn, run based)
def label(m):
    H, W = m.shape
    parent = []

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    runs = []
    prev = []
    for y in range(H):
        row = m[y]
        cur = []
        if row.any():
            d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
            ss = np.flatnonzero(d == 1)
            ee = np.flatnonzero(d == -1)
            j = 0
            for s, e in zip(ss, ee):
                rid = len(parent)
                parent.append(rid)
                while j < len(prev) and prev[j][1] <= s:
                    j += 1
                k = j
                while k < len(prev) and prev[k][0] < e:
                    ra, rb = find(rid), find(prev[k][2])
                    if ra != rb:
                        parent[max(ra, rb)] = min(ra, rb)
                    k += 1
                cur.append((s, e, rid))
                runs.append((y, s, e, rid))
        prev = cur
    lab = np.zeros((H, W), np.int32)
    roots = {}
    for y, s, e, rid in runs:
        r = find(rid)
        if r not in roots:
            roots[r] = len(roots) + 1
        lab[y, s:e] = roots[r]
    return lab, len(roots)


def wall_mask(rgba, thr=250, min_area=12):
    mn = rgba[..., :3].min(axis=2)
    m = (mn >= thr) & (rgba[..., 3] >= 128)
    lab, n = label(m)
    sizes = np.bincount(lab.ravel(), minlength=n + 1)
    keep = sizes >= min_area
    keep[0] = False
    return keep[lab]


def runs_1d(row):
    d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
    return np.flatnonzero(d == 1), np.flatnonzero(d == -1)


def runlen(m, axis):
    """per-pixel length of the run of True it belongs to, along axis (1 = horizontal)."""
    a = m if axis == 1 else m.T
    out = np.zeros(a.shape, np.int32)
    for i in range(a.shape[0]):
        if not a[i].any():
            continue
        s, e = runs_1d(a[i])
        for s0, e0 in zip(s, e):
            out[i, s0:e0] = e0 - s0
    return out if axis == 1 else out.T


def close_across(m, gap=3, tmax=14):
    """For an H mask: per column, merge vertical runs separated by <= gap px if the merged run is <= tmax px."""
    out = m.copy()
    H, W = m.shape
    for x in range(W):
        col = m[:, x]
        if not col.any():
            continue
        s, e = runs_1d(col)
        cs, ce = s[0], e[0]
        for s0, e0 in zip(s[1:], e[1:]):
            if s0 - ce <= gap and e0 - cs <= tmax:
                out[ce:s0, x] = True
                ce = e0
            else:
                cs, ce = s0, e0
    return out


# ---------------------------------------------------------------- chains of constant thickness
def chains(m, min_len=3, dt=2):
    """m: H-oriented mask (walls run along x). Returns chains: dict(a0, a1, b0, b1, n) in px, where a runs along
    the wall and [b0, b1) across it (median top/bottom)."""
    H, W = m.shape
    active = []
    done = []
    for x in range(W):
        col = m[:, x]
        runs = list(zip(*runs_1d(col))) if col.any() else []
        nxt = []
        taken = set()
        for (s, e) in runs:
            best, bov = None, 0
            for ci, c in enumerate(active):
                if ci in taken:
                    continue
                ls, le = c['last']
                ov = min(e, le) - max(s, ls)
                if ov <= 0:
                    continue
                if abs((e - s) - c['tmed']) > dt or abs((s + e) / 2 - c['cmed']) > 1.6:
                    continue
                if ov > bov:
                    best, bov = ci, ov
            if best is None:
                c = dict(a0=x, tops=[s], bots=[e], last=(s, e), tmed=e - s, cmed=(s + e) / 2)
            else:
                taken.add(best)
                c = active[best]
                c['tops'].append(s)
                c['bots'].append(e)
                c['last'] = (s, e)
                if len(c['tops']) % 4 == 0 or len(c['tops']) < 4:
                    c['tmed'] = float(np.median(np.array(c['bots']) - np.array(c['tops'])))
                    c['cmed'] = float(np.median((np.array(c['bots']) + np.array(c['tops'])) / 2))
            nxt.append(c)
        ids = {id(c) for c in nxt}
        for c in active:
            if id(c) not in ids:
                c['a1'] = x
                done.append(c)
        active = nxt
    for c in active:
        c['a1'] = W
        done.append(c)
    out = []
    for c in done:
        n = c['a1'] - c['a0']
        if n < min_len:
            continue
        b0 = int(np.median(c['tops']))
        b1 = int(np.median(c['bots']))
        out.append(dict(a0=c['a0'], a1=c['a1'], b0=b0, b1=b1, n=n))
    return out


# ---------------------------------------------------------------- lines, profiles, segments
def group_lines(chs, min_ov=0.6, max_gap=62):
    """chains (one orientation) -> lines. Two chains share a line when their bands (across the wall) overlap by
    >= min_ov of the thinner one and they do not overlap along the wall: a door glyph is a thinner chain inside
    its wall's band, and walls of different thickness on one line are often flush on one face rather than
    centred. A line is split where consecutive chains are more than max_gap px (~22 u) apart."""
    chs = sorted(chs, key=lambda c: (-(c['a1'] - c['a0']), c['a0']))  # long chains seed the lines
    groups = []
    for c in chs:
        t = c['b1'] - c['b0']
        hit = None
        for G in groups:
            if any(min(c['a1'], d['a1']) - max(c['a0'], d['a0']) > 0 for d in G):
                continue
            for d in G:
                ov = min(c['b1'], d['b1']) - max(c['b0'], d['b0'])
                if ov >= min_ov * min(t, d['b1'] - d['b0']):
                    hit = G
                    break
            if hit is not None:
                break
        if hit is None:
            groups.append([c])
        else:
            hit.append(c)
    lines = []
    for G in groups:
        cs = sorted(G, key=lambda d: d['a0'])
        cur = [cs[0]]
        for d in cs[1:]:
            if d['a0'] - max(e['a1'] for e in cur) > max_gap:
                lines.append(cur)
                cur = [d]
            else:
                cur.append(d)
        lines.append(cur)
    out = []
    for cs in lines:
        w = np.array([d['n'] for d in cs], float)
        c = float(np.average([(d['b0'] + d['b1']) / 2 for d in cs], weights=w))
        t = float(np.average([d['b1'] - d['b0'] for d in cs], weights=w))
        out.append(dict(c=c, t=t, chains=cs))
    return out


def dark_bars(col):
    """number of non-white runs strictly inside a cross-section (bool array, True = white)."""
    if not col.any():
        return 0
    idx = np.flatnonzero(col)
    inner = ~col[idx[0]:idx[-1] + 1]
    if not inner.any():
        return 0
    s, e = runs_1d(inner)
    return len(s)


KINDS = {0: 'SOLID', 1: 'GLYPH', 2: 'GAP', 3: 'JUNCTION'}


def line_profile(L, white, perp):
    """Classify every px along the line (H-oriented frame: a = column, b = row).
    white: original white mask; perp: rectangles of the perpendicular chains.
    Each column is read across the band of the chain covering it (gaps: the thicker neighbouring band).
      SOLID     covered by a chain and >= 70 % white across the band
      JUNCTION  not SOLID, and >= 50 % of the band belongs to a perpendicular wall's chain (a crossing)
      GLYPH     covered (dark glyph bars inside the band) or >= 15 % white in a gap
      GAP       nothing drawn: the floor shows through
    Returns runs dict(kind, a0, a1, b0, b1, white[, bars])."""
    cs = L['chains']
    a_lo = min(c['a0'] for c in cs)
    a_hi = max(c['a1'] for c in cs)
    n = a_hi - a_lo
    B0 = np.zeros(n, int)
    B1 = np.zeros(n, int)
    cov = np.zeros(n, bool)
    for c in cs:
        B0[c['a0'] - a_lo:c['a1'] - a_lo] = c['b0']
        B1[c['a0'] - a_lo:c['a1'] - a_lo] = c['b1']
        cov[c['a0'] - a_lo:c['a1'] - a_lo] = True
    for i in range(len(cs) - 1):
        p, q = cs[i], cs[i + 1]
        if q['a0'] > p['a1']:
            pick = p if (p['b1'] - p['b0']) >= (q['b1'] - q['b0']) else q
            B0[p['a1'] - a_lo:q['a0'] - a_lo] = pick['b0']
            B1[p['a1'] - a_lo:q['a0'] - a_lo] = pick['b1']
    f = np.zeros(n)
    pf = np.zeros(n)
    for i in range(n):
        if B1[i] > B0[i]:
            f[i] = white[B0[i]:B1[i], a_lo + i].mean()
            pf[i] = perp[B0[i]:B1[i], a_lo + i].mean()
    kind = np.full(n, 2)                       # GAP
    kind[cov | (f >= 0.15)] = 1                # GLYPH
    kind[(~cov) & (f >= 0.7)] = 3              # JUNCTION: fully white but owned by a crossing wall
    kind[(kind != 0) & (pf >= 0.5)] = 3        # JUNCTION: a perpendicular chain covers the band
    kind[cov & (f >= 0.7)] = 0                 # SOLID
    # runs of constant (kind, band); 1-px flickers are absorbed, equal neighbours with bands within 1 px merged
    out = []
    i = 0
    while i < n:
        j = i
        while j < n and kind[j] == kind[i] and B0[j] == B0[i] and B1[j] == B1[i]:
            j += 1
        out.append([int(kind[i]), i, j, int(B0[i]), int(B1[i])])
        i = j
    changed = True
    while changed and len(out) > 1:
        changed = False
        for k, r in enumerate(out):
            if r[2] - r[1] <= 1:
                if k > 0:
                    out[k - 1][2] = r[2]
                else:
                    out[k + 1][1] = r[1]
                out.pop(k)
                changed = True
                break
        m = [out[0]]
        for r in out[1:]:
            q = m[-1]
            if r[0] == q[0] and abs(r[3] - q[3]) <= 1 and abs(r[4] - q[4]) <= 1:
                if r[2] - r[1] > q[2] - q[1]:
                    q[3], q[4] = r[3], r[4]
                q[2] = r[2]
            else:
                m.append(r)
        if len(m) != len(out):
            changed = True
        out = m
    res = []
    for kd, i0, i1, b0, b1 in out:
        r = dict(kind=KINDS[kd], a0=a_lo + i0, a1=a_lo + i1, b0=b0, b1=b1, white=round(float(f[i0:i1].mean()), 2))
        if kd == 1:
            bars = [dark_bars(white[B0[q]:B1[q], a_lo + q]) for q in range(i0, i1)]
            r['bars'] = int(np.median(bars)) if bars else 0
        res.append(r)
    return res


def extract(rgba, min_chain=4):
    """rgba -> (dict(lines, ticks, white_px, white_covered, cov_not_white), white mask). Lines are in px in their
    own frame: k 'H' (a = x column, b = y row) or 'V' (a = y row, b = x column)."""
    white = wall_mask(rgba)
    h = runlen(white, 1)
    v = runlen(white, 0)
    Hm = white & (h >= v)
    Vm = white & (v > h)
    Hc = close_across(Hm)
    Vc = close_across(Vm.T).T
    chH = chains(Hc)
    chV = chains(Vc.T)
    rectH = np.zeros_like(white)
    rectV = np.zeros_like(white)
    for c in chH:
        if c['n'] >= min_chain:
            rectH[c['b0']:c['b1'], c['a0']:c['a1']] = True
    for c in chV:
        if c['n'] >= min_chain:
            rectV[c['a0']:c['a1'], c['b0']:c['b1']] = True
    out = dict(lines=[], ticks=[], white_px=int(white.sum()))
    for k, chs, wh, perp in (('H', chH, white, rectV), ('V', chV, white.T, rectH.T)):
        long_ = [c for c in chs if c['n'] >= min_chain]
        for c in chs:
            if c['n'] < min_chain:
                out['ticks'].append(dict(k=k, a0=c['a0'], a1=c['a1'], b0=c['b0'], b1=c['b1']))
        for L in group_lines(long_):
            runs = line_profile(L, wh, perp)
            out['lines'].append(dict(k=k, c=L['c'], t=L['t'], runs=runs,
                                     chains=[(c['a0'], c['a1'], c['b0'], c['b1']) for c in L['chains']]))
    cov = np.zeros_like(white)
    for L in out['lines']:
        for r in L['runs']:
            if r['kind'] in ('GAP', 'JUNCTION'):
                continue
            if L['k'] == 'H':
                cov[r['b0']:r['b1'], r['a0']:r['a1']] = True
            else:
                cov[r['a0']:r['a1'], r['b0']:r['b1']] = True
    out['white_covered'] = round(float((white & cov).sum() / max(1, white.sum())), 4)
    out['cov_not_white'] = round(float((cov & ~white).sum() / max(1, cov.sum())), 4)
    return out, white
