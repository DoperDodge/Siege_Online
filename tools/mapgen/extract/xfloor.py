"""Do the per-floor r6calls rasters share one frame? Fit u_up = a*u_lo + b per axis between two floors from their
extracted walls (walls that stack vertically: exterior and structural walls), RANSAC over candidate pairs.

  candidates: same axis, both >= 8 u long, centre lines within 15 u, spans overlapping (after the current map)
  model:      x_up = ax*x_lo + bx from V walls; y_up = ay*y_lo + by from H walls; 0.95 < a < 1.12
  inliers:    |a*c_lo + b - c_up| <= 0.6 u, weighted by overlap length; final weighted least squares on inliers
Also reports how much of the upper floor's long-wall length stacks on a lower wall (+-0.6 u) under the identity
map versus under the fitted map.

usage: python3 -I xfloor.py out/walls_1F.json out/walls_2F.json
"""
import json
import random
import sys

import numpy as np

random.seed(7)


def load(p, minlen=8.0):
    W = json.load(open(p))['walls']
    out = []
    for w in W:
        x0, y0, x1, y1 = w['rect']
        if w['len'] < minlen:
            continue
        if w['k'] == 'H':
            out.append(('H', (y0 + y1) / 2, x0, x1))
        else:
            out.append(('V', (x0 + x1) / 2, y0, y1))
    return out


def fit(lo, up, iters=6000, tol=0.6):
    T = {'x': (1.0, 0.0), 'y': (1.0, 0.0)}
    info = {}
    for _ in range(2):
        for k, ax_line, ax_span in (('V', 'x', 'y'), ('H', 'y', 'x')):
            a_s, b_s = T[ax_span]
            pairs = []
            for (ku, cu, u0, u1) in up:
                if ku != k:
                    continue
                for (kl, cl, l0, l1) in lo:
                    if kl != k or abs(cu - cl) > 15:
                        continue
                    m0, m1 = a_s * l0 + b_s, a_s * l1 + b_s
                    ov = min(u1, m1) - max(u0, m0)
                    if ov < 3:
                        continue
                    pairs.append((cl, cu, ov))
            best = (0.0, (1.0, 0.0))
            for _i in range(iters):
                p, q = random.sample(pairs, 2)
                if abs(p[0] - q[0]) < 40:
                    continue
                a = (q[1] - p[1]) / (q[0] - p[0])
                if not (0.95 < a < 1.12):
                    continue
                b = p[1] - a * p[0]
                w = sum(t[2] for t in pairs if abs(a * t[0] + b - t[1]) <= tol)
                if w > best[0]:
                    best = (w, (a, b))
            a, b = best[1]
            inl = [t for t in pairs if abs(a * t[0] + b - t[1]) <= tol]
            X = np.array([t[0] for t in inl])
            Y = np.array([t[1] for t in inl])
            Wt = np.array([t[2] for t in inl])
            A = np.vstack([X, np.ones_like(X)]).T * np.sqrt(Wt)[:, None]
            a, b = np.linalg.lstsq(A, Y * np.sqrt(Wt), rcond=None)[0]
            r = Y - (a * X + b)
            T[ax_line] = (float(a), float(b))
            info[ax_line] = dict(a=round(float(a), 4), b=round(float(b), 2), inlier_pairs=len(inl),
                                 rms_u=round(float(np.sqrt(np.average(r ** 2, weights=Wt))), 2),
                                 fitted_over=(round(float(X.min()), 1), round(float(X.max()), 1)),
                                 fixed_point=round(float(b / (1 - a)), 1) if abs(1 - a) > 1e-4 else None)
    return T, info


def stacked(lo, up, T, tol=0.6):
    tot = hit = 0.0
    for (ku, cu, u0, u1) in up:
        tot += u1 - u0
        ax_line, ax_span = ('x', 'y') if ku == 'V' else ('y', 'x')
        a, b = T[ax_line]
        a_s, b_s = T[ax_span]
        best = 0.0
        for (kl, cl, l0, l1) in lo:
            if kl != ku or abs(a * cl + b - cu) > tol:
                continue
            ov = min(u1, a_s * l1 + b_s) - max(u0, a_s * l0 + b_s)
            best = max(best, ov)
        hit += max(0.0, min(best, u1 - u0))
    return hit / tot if tot else 0.0


if __name__ == '__main__':
    lo, up = load(sys.argv[1]), load(sys.argv[2])
    ident = {'x': (1.0, 0.0), 'y': (1.0, 0.0)}
    T, info = fit(lo, up)
    res = dict(lower=sys.argv[1].split('/')[-1], upper=sys.argv[2].split('/')[-1], fit=info,
               stacked_share_identity=round(stacked(lo, up, ident), 3), stacked_share_fitted=round(stacked(lo, up, T), 3))
    print(json.dumps(res, indent=1))
