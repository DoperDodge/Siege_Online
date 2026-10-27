"""Cross-check extracted walls against the official Ubisoft blueprint of the same floor (1600x900 JPG, ~2 px per u).

1. Registration px = A*u + B per axis, fitted per floor from the data: for every long wall (>= 8 u, not SOFT) the
   perpendicular offset at which the blueprint shows its drawn wall (white, or the red/yellow legend strips) is
   searched +-5 u around the prediction; a robust line fit (two rounds of 2.5-sigma clipping) over those
   positions gives A, B. Start values: the 2F registration px_x = 1.9976 u + 366.95, px_y = 2.0132 u + 117.52.
2. Per wall: coverage of the blueprint's wall pixels along the wall's centre line at the best offset (+-4 u), and
   that offset after registration. status ok (|offset| <= 1.5 u, coverage >= 0.6), offset (coverage >= 0.6,
   |offset| <= 4 u), weak (0.35-0.6), missing (< 0.35), n/a (SOFT walls: exact vector data; walls < 3 u).

Run on its own (`python3 -I tools/mapgen/extract/bpcheck.py`, DESIGN §9.1) it checks what we build instead: the wall
files (data/maps/oregon/walls_<floor>.json, each floor's own u), every stretch of hard wall between the spans and
every door, window and passage, and prints the agreement per floor (builds/mapgen/bpcheck.json has the detail).
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

BP_FILE = {'0': 1, '1': 2, '2': 3, '3': 4, '4': 5}
START = dict(ax=1.9976, bx=366.95, ay=2.0132, by=117.52)


def wall_pixels(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mn = a.min(axis=2)
    mx = a.max(axis=2)
    white = (mn >= 190) & (mx - mn <= 40)
    red = (r >= 150) & (g <= 90) & (b <= 90)
    yellow = (r >= 180) & (g >= 130) & (b <= 100)
    return white | red | yellow, white


def _sample(M, xs, ys):
    H, W = M.shape
    xi = np.clip(np.round(xs).astype(int), 0, W - 1)
    yi = np.clip(np.round(ys).astype(int), 0, H - 1)
    return M[yi, xi]


def _profile(M, w, T, offs):
    """coverage of M along w's centre line for each perpendicular offset (u)."""
    x0, y0, x1, y1 = w['rect']
    if w['k'] == 'H':
        al = np.arange(x0 + 0.5, x1 - 0.5, 0.25)
        c = (y0 + y1) / 2
        res = [float(_sample(M, T['ax'] * al + T['bx'], np.full_like(al, T['ay'] * (c + d) + T['by'])).mean()) for d in offs]
    else:
        al = np.arange(y0 + 0.5, y1 - 0.5, 0.25)
        c = (x0 + x1) / 2
        res = [float(_sample(M, np.full_like(al, T['ax'] * (c + d) + T['bx']), T['ay'] * al + T['by']).mean()) for d in offs]
    return np.array(res)


def _best(prof, offs):
    j = int(prof.argmax())
    pk = prof[j]
    sel = prof >= 0.85 * pk
    lo = hi = j
    while lo > 0 and sel[lo - 1]:
        lo -= 1
    while hi < len(sel) - 1 and sel[hi + 1]:
        hi += 1
    return float((offs[lo] + offs[hi]) / 2), float(pk)


def fit(W, M, T, rounds=3):
    offs = np.arange(-5, 5.01, 0.25)
    info = {}
    for _ in range(rounds):
        for axis, k in (('x', 'V'), ('y', 'H')):
            U, P = [], []
            for w in W:
                if w['k'] != k or w['surface'] == 'SOFT' or w['len'] < 8:
                    continue
                prof = _profile(M, w, T, offs)
                d, pk = _best(prof, offs)
                if pk < 0.6:
                    continue
                x0, y0, x1, y1 = w['rect']
                c = (x0 + x1) / 2 if k == 'V' else (y0 + y1) / 2
                A, B = T['a' + axis], T['b' + axis]
                U.append(c)
                P.append(A * (c + d) + B)
            U, P = np.array(U), np.array(P)
            if len(U) < 8:
                # too few walls on this axis for a free fit: borrow the other axis' scale, fit the offset only
                other = 'y' if axis == 'x' else 'x'
                A = T['a' + other]
                B = float(np.median(P - A * U)) if len(U) else T['b' + axis]
                res = P - (A * U + B)
                T['a' + axis], T['b' + axis] = float(A), B
                info[axis] = dict(A=round(float(A), 4), B=round(B, 2), walls=int(len(U)), rejected=0,
                                  rms_px=round(float(np.sqrt(np.mean(res ** 2))), 2) if len(U) else None, scale_from=other)
                continue
            keep = np.ones(len(U), bool)
            for _r in range(2):
                A, B = np.polyfit(U[keep], P[keep], 1)
                res = P - (A * U + B)
                sd = max(res[keep].std(), 0.5)
                keep = np.abs(res) <= 2.5 * sd
            A, B = np.polyfit(U[keep], P[keep], 1)
            res = P - (A * U + B)
            T['a' + axis], T['b' + axis] = float(A), float(B)
            info[axis] = dict(A=round(float(A), 4), B=round(float(B), 2), walls=int(keep.sum()), rejected=int((~keep).sum()),
                              rms_px=round(float(np.sqrt(np.mean(res[keep] ** 2))), 2))
    return T, info


def check(W, fl, bp_dir):
    path = os.path.join(bp_dir, f'r6-maps-oregon-blueprint-{BP_FILE[fl]}.jpg')
    if not os.path.exists(path):
        return {}, None
    M, _white = wall_pixels(path)
    T, info = fit(W, M, dict(START))
    offs = np.arange(-4, 4.01, 0.25)
    out = {}
    for w in W:
        if w['surface'] == 'SOFT' or w['len'] < 3:
            out[w['id']] = dict(status='n/a', offset=None, coverage=None)
            continue
        prof = _profile(M, w, T, offs)
        d, pk = _best(prof, offs)
        if pk >= 0.6 and abs(d) <= 1.5:
            st = 'ok'
        elif pk >= 0.6:
            st = 'offset'
        elif pk >= 0.35:
            st = 'weak'
        else:
            st = 'missing'
        out[w['id']] = dict(status=st, offset=round(d, 2), coverage=round(pk, 2))
    fitinfo = dict(px_x=f"{T['ax']:.4f}*u_x + {T['bx']:.2f}", px_y=f"{T['ay']:.4f}*u_y + {T['by']:.2f}", detail=info)
    return out, fitinfo


def _centre_cov(M, o, T, offs=(-0.5, 0.0, 0.5)):
    w = dict(o)
    return min(_profile(M, w, T, np.array(offs)))


def check_all(W, O, fl, bp_dir, alpha=None, S=None, oy=0.0):
    """walls (check), openings (does the blueprint draw a solid wall where r6calls has an opening?) and
    blueprint-only wall pixels inside the r6calls floor footprint that no extracted box explains."""
    path = os.path.join(bp_dir, f'r6-maps-oregon-blueprint-{BP_FILE[fl]}.jpg')
    if not os.path.exists(path):
        return {}, None, [], [], None
    M, white = wall_pixels(path)
    T, info = fit(W, M, dict(START))
    offs = np.arange(-4, 4.01, 0.25)
    out = {}
    for w in W:
        if w['surface'] == 'SOFT' or w['len'] < 3:
            out[w['id']] = dict(status='n/a', offset=None, coverage=None)
            continue
        prof = _profile(M, w, T, offs)
        d, pk = _best(prof, offs)
        st = 'ok' if (pk >= 0.6 and abs(d) <= 1.5) else 'offset' if pk >= 0.6 else 'weak' if pk >= 0.35 else 'missing'
        out[w['id']] = dict(status=st, offset=round(d, 2), coverage=round(pk, 2))
    ops = []
    for o in O:
        if o['type'] == 'DRONE_HOLE' or o['k'] not in ('H', 'V'):
            continue
        x0, y0, x1, y1 = o['rect']
        # shrink 0.75 u at both ends so the jambs do not count
        q = dict(o)
        q['rect'] = [x0 + 0.75, y0, x1 - 0.75, y1] if o['k'] == 'H' else [x0, y0 + 0.75, x1, y1 - 0.75]
        cov = _centre_cov(white, q, T)
        ops.append(dict(id=o['id'], type=o['type'], rect=o['rect'], bp_centre_white=round(cov, 2),
                        verdict='bp draws solid wall (CONFLICT)' if cov >= 0.75 else 'bp agrees (opening/glyph)'))
    # blueprint-only wall pixels: sample the blueprint on a 0.5 u grid
    extra = []
    if alpha is not None and S is not None:
        g = 0.5
        us = np.arange(0, 361.244, g)
        UX, UY = np.meshgrid(us, us)
        bpw = _sample(white, T['ax'] * UX + T['bx'], T['ay'] * UY + T['by']).astype(bool)
        # footprint: r6calls opaque pixels
        ai = np.clip((UY - oy) / S, 0, alpha.shape[0] - 1).astype(int)
        aj = np.clip(UX / S, 0, alpha.shape[1] - 1).astype(int)
        foot = alpha[ai, aj] >= 128
        expl = np.zeros_like(bpw)
        for o in list(W) + [o for o in O if o['k'] in ('H', 'V')]:
            x0, y0, x1, y1 = o['rect']
            i0, i1 = int(max(0, (y0 - 1.5) / g)), int(min(len(us), (y1 + 1.5) / g + 1))
            j0, j1 = int(max(0, (x0 - 1.5) / g)), int(min(len(us), (x1 + 1.5) / g + 1))
            expl[i0:i1, j0:j1] = True
        resid = bpw & foot & ~expl
        from wallgeo import label
        lab, n = label(resid)
        for i in range(1, n + 1):
            ys, xs = np.nonzero(lab == i)
            if len(ys) < 6:
                continue
            bx0, bx1, by0, by1 = us[xs.min()], us[xs.max()] + g, us[ys.min()], us[ys.max()] + g
            L = max(bx1 - bx0, by1 - by0)
            T_ = min(bx1 - bx0, by1 - by0)
            fill = len(ys) / (((xs.max() - xs.min() + 1) * (ys.max() - ys.min() + 1)))
            if L >= 4 and T_ <= 6 and fill >= 0.5:
                extra.append(dict(rect=[round(float(bx0), 1), round(float(by0), 1), round(float(bx1), 1), round(float(by1), 1)], len=round(float(L), 1),
                                  t=round(float(T_), 1), fill=round(float(fill), 2)))
    fitinfo = dict(px_x=f"{T['ax']:.4f}*u_x + {T['bx']:.2f}", px_y=f"{T['ay']:.4f}*u_y + {T['by']:.2f}", detail=info)

    def solid_at(x, y, k):
        """True when the blueprint draws a solid (white, no glyph) wall through point (x, y) u on an axis-k line:
        all of the 3 x 3 samples (+-0.5 u along and across) are white. A wall within +-1 u across also counts."""
        best = 0.0
        for dc in (-1.0, -0.5, 0.0, 0.5, 1.0):
            vals = []
            for da in (-0.5, 0.0, 0.5):
                for dd in (-0.25, 0.25):
                    px, py = (x + da, y + dc + dd) if k == 'H' else (x + dc + dd, y + da)
                    vals.append(_sample(white, np.array([T['ax'] * px + T['bx']]), np.array([T['ay'] * py + T['by']]))[0])
            best = max(best, float(np.mean(vals)))
        return best >= 0.99

    return out, fitinfo, ops, sorted(extra, key=lambda e: -e['len']), solid_at


FLOOR_INDEX = {'B': '0', '1F': '1', '2F': '2', '3F': '3'}
#: Thickness classes in u (the drawn bands: about 7 px interior, 11-13 px exterior on the 2 px/u raster).
WEIGHT_U = {'int': 3.0, 'ext': 5.0}


def our_walls(part, m_per_u):
    """A wall file as check_all reads it: each line's hard stretches between its spans (a drone hole's slot and an
    opening built as wall all the same stay in them) and its SOFT spans as walls; its doors, windows and passages as
    openings. Rails are left out: the blueprint doesn't draw them as walls."""
    W, O = [], []
    for line in part['walls']:
        if line.get('kind', 'wall') == 'rail':
            continue
        t = WEIGHT_U[line['weight']] if isinstance(line['weight'], str) else line['weight'] / m_per_u
        k, at = line['axis'], line['at']

        def rect(a0, a1):
            return [a0, at - t / 2, a1, at + t / 2] if k == 'H' else [at - t / 2, a0, at + t / 2, a1]

        def hard(a0, a1):
            if a1 - a0 > 0.05:
                W.append(dict(id=f"{line['id']}@{a0:.1f}", line=line['id'], k=k, rect=rect(a0, a1), surface='HARD', len=a1 - a0))

        cur = line['span'][0]
        for s in sorted(line['spans'], key=lambda s: s['at'][0]):
            if s['kind'] == 'DRONE_HOLE' or s.get('hard'):
                continue
            hard(cur, s['at'][0])
            a0, a1 = s['at']
            if s['kind'] == 'SOFT':
                W.append(dict(id=s['id'], line=line['id'], k=k, rect=rect(a0, a1), surface='SOFT', len=a1 - a0))
            else:
                O.append(dict(id=s['id'], k=k, rect=rect(a0, a1), type={'DOOR': 'DOOR', 'WINDOW': 'EXT_OPENING', 'OPEN': 'OPEN'}[s['kind']]))
            cur = max(cur, a1)
        hard(cur, line['span'][1])
    return W, O


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description='Our wall files against the official blueprints, per floor (DESIGN 9.1).')
    ap.add_argument('--repo', default=os.path.abspath(os.path.join(here, '..', '..', '..')))
    ap.add_argument('--bp-dir', default=None, help='folder with r6-maps-oregon-blueprint-{1..5}.jpg (default: research/oregon/refs/web/blueprint)')
    ap.add_argument('--out', default=None, help='JSON detail (default: builds/mapgen/bpcheck.json)')
    a = ap.parse_args()
    bp_dir = a.bp_dir or os.path.join(a.repo, 'research', 'oregon', 'refs', 'web', 'blueprint')
    out_path = a.out or os.path.join(a.repo, 'builds', 'mapgen', 'bpcheck.json')
    m_per_u = json.load(open(os.path.join(a.repo, 'data', 'maps', 'oregon', 'layout.json')))['units']['mPerU']
    report = {}
    for floor, fl in FLOOR_INDEX.items():
        part = json.load(open(os.path.join(a.repo, 'data', 'maps', 'oregon', f'walls_{floor}.json')))
        W, O = our_walls(part, m_per_u)
        walls, fit_info, ops, _extra, _solid = check_all(W, O, fl, bp_dir)
        if fit_info is None:
            print(f'{floor}: no blueprint image in {bp_dir} (npm run mapgen:refs downloads them)')
            continue
        hard = [w for w in W if w['surface'] == 'HARD' and walls[w['id']]['status'] != 'n/a']
        by = {}
        for w in hard:
            st = walls[w['id']]['status']
            by.setdefault(st, [0, 0.0])
            by[st][0] += 1
            by[st][1] += w['len']
        total = sum(w['len'] for w in hard) or 1.0
        conflicts = [o for o in ops if o['verdict'].endswith('(CONFLICT)')]
        report[floor] = dict(
            registration=fit_info,
            hard=dict(stretches=len(hard), lengthU=round(total, 1), byStatus={k: dict(count=v[0], lengthU=round(v[1], 1), share=round(v[1] / total, 3)) for k, v in sorted(by.items())}),
            notOk=[dict(id=w['id'], line=w['line'], lenU=round(w['len'], 1), **walls[w['id']]) for w in hard if walls[w['id']]['status'] != 'ok'],
            openings=dict(count=len(ops), conflicts=[dict(id=o['id'], type=o['type'], blueprintWhite=o['bp_centre_white']) for o in conflicts]),
        )
        r = report[floor]
        ok = r['hard']['byStatus'].get('ok', dict(share=0.0))['share']
        rest = ', '.join(f"{k} {v['count']} ({v['lengthU']} u)" for k, v in r['hard']['byStatus'].items() if k != 'ok') or 'none other'
        print(f"{floor}: {r['hard']['stretches']} stretches of hard wall ({r['hard']['lengthU']} u): {ok:.0%} of their length agrees with the blueprint (within 1.5 u); {rest}. "
              f"{len(ops)} openings, {len(conflicts)} where the blueprint draws solid wall{': ' + ', '.join(o['id'] for o in conflicts) if conflicts else ''}.")
        for w in r['notOk']:
            print(f"   {w['status']:8} {w['id']:22} {w['lenU']:6.1f} u  offset {w['offset']} u, coverage {w['coverage']}")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(report, f, indent=1)
        f.write('\n')
    print(f'wrote {out_path}')


if __name__ == '__main__':
    main()
