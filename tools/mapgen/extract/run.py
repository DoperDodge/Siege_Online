"""Wall-geometry prototype: r6calls floor raster -> wall boxes + openings in u, checked against the research and
the official blueprint.

usage: python3 -I run.py --floors 0,1,2,3 [--repo <checkout>] [--svg .../oregon.svg] [--bp-dir ...]
(defaults: this checkout, research/oregon/refs/web/r6calls/oregon.svg, research/oregon/refs/web/blueprint/)
writes  out/walls_<F>.json      walls (rect [x0,y0,x1,y1] u, thickness, surface HARD/SOFT, source, confidence)
        out/eval_<F>.json       accuracy numbers (soft walls, composition rows, room boxes, blueprint, extras)
        img/overlay_<F>.png     full floor, img/overlay_<F>_main.png main building (scratch only)
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
REFS = os.path.join(ROOT, 'research', 'oregon', 'refs', 'web')
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import build  # noqa: E402
import bpcheck  # noqa: E402
import evaluate  # noqa: E402
import overlay  # noqa: E402
import research  # noqa: E402
import svgdata  # noqa: E402
from wallgeo import PIC_OY, extract, load_rgba  # noqa: E402
from wallgeo import S as SU  # noqa: E402

NAME = {'0': 'B', '1': '1F', '2': '2F', '3': '3F', '4': 'RF'}


def confidence(w, bp, why):
    """high: clean raster band confirmed by the blueprint (or exact bw vector) and long enough;
    medium: raster only, or blueprint disagrees by 1.5-3 u; low: short (< 2 u) or blueprint shows nothing."""
    if w['surface'] == 'SOFT' or w.get('split_from'):
        return 'high'  # exact bw vector span, or the hard remainder of the same clean raster band
    b = bp.get(w['id'])
    if w['len'] < 2.0:
        return 'low'
    if b is None:
        return 'medium'
    if b['status'] == 'ok':
        return 'high'
    if b['status'] == 'offset':
        return 'medium'
    return 'low' if why is None else 'medium'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--floors', default='2,1')
    ap.add_argument('--repo', default=ROOT)
    ap.add_argument('--svg', default=os.path.join(REFS, 'r6calls', 'oregon.svg'))
    ap.add_argument('--img', default=os.path.join(HERE, 'img', 'r6c'))
    ap.add_argument('--bp-dir', default=os.path.join(REFS, 'blueprint'))
    ap.add_argument('--out', default=os.path.join(HERE, 'out'))
    ap.add_argument('--no-overlay', action='store_true')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    os.makedirs(a.img, exist_ok=True)
    t0 = time.time()
    if not all(os.path.exists(os.path.join(a.img, f'{f}-pic.png')) for f in a.floors.split(',')):
        V = svgdata.read(a.svg, a.img)
    else:
        V = svgdata.read(a.svg, None)
    soft_md = research.soft_walls(a.repo)
    rows = research.rows(a.repo)
    rooms = research.rooms(a.repo)
    ops_md = research.openings(a.repo)
    summary = {}
    for fl in a.floors.split(','):
        png = os.path.join(a.img, f'{fl}-pic.png')
        res, white = extract(load_rgba(png))
        bw = svgdata.soft_walls(V, fl)
        dt = V.get(fl, {}).get('layers', {}).get('dt', [])
        dt = [d for d in dt if d['x1'] - d['x0'] < 12 and d['y1'] - d['y0'] < 12]
        W, O = build.build(res, fl, soft=bw, dt=dt)
        # blueprint cross-check
        rgba = load_rgba(png)
        bp_res, bp_fit, bp_ops, bp_only, bp_solid_at = bpcheck.check_all(W, O, fl, a.bp_dir, alpha=rgba[..., 3], S=SU, oy=PIC_OY[fl])
        why = evaluate.explained(W, rows, soft_md, rooms, fl)
        # soft parts: name them with the surfaces.md id and its section count (Ulo's counts override r6calls')
        for w in W:
            if w['surface'] != 'SOFT':
                continue
            bx0, by0, bx1, by1 = w['rect_bw']
            for sm in soft_md:
                if sm['floor'] == fl and abs(sm['x'][0] - bx0) <= 0.3 and abs(sm['x'][1] - bx1) <= 0.3 \
                        and abs(sm['y'][0] - by0) <= 0.3 and abs(sm['y'][1] - by1) <= 0.3:
                    w['soft_wall'] = sm['id']
                    w['sections'] = sm['sections']
        for w in W:
            w['confidence'] = confidence(w, bp_res, why[w['id']])
            b = bp_res.get(w['id'])
            if b:
                w['bp'] = dict(status=b['status'], offset=b['offset'], coverage=b['coverage'])
            w['research'] = why[w['id']]
        # final pixel accounting: white raster pixels inside the final boxes (walls + openings) and box area that is white
        cov = np.zeros_like(white)
        for o in list(W) + [o for o in O if o['type'] != 'DRONE_HOLE']:
            x0, y0, x1, y1 = o['rect']
            oy = PIC_OY[fl]
            cov[int(round((y0 - oy) / SU)):int(round((y1 - oy) / SU)), int(round(x0 / SU)):int(round(x1 / SU))] = True
        recall = float((white & cov).sum() / max(1, white.sum()))
        wall_only = np.zeros_like(white)
        for o in W:
            x0, y0, x1, y1 = o['rect']
            wall_only[int(round((y0 - PIC_OY[fl]) / SU)):int(round((y1 - PIC_OY[fl]) / SU)), int(round(x0 / SU)):int(round(x1 / SU))] = True
        precision = float((white & wall_only).sum() / max(1, wall_only.sum()))
        ev_soft = evaluate.eval_soft(W, soft_md, fl)
        ev_rows = evaluate.eval_rows(W, O, rows, fl)
        ev_rooms = evaluate.eval_rooms(W, rooms, fl)
        ev_ops = evaluate.eval_openings(O, ops_md, fl)
        # adjudicate every disagreeing sample with the blueprint: is the blueprint's wall solid at that point?
        adj = dict(doc_wrong=0, raster_wrong=0, unclear=0)
        for e in ev_rows:
            r = next(r for r in rows if r['floor'] == fl and r['a'] == e['a'] and r['b'] == e['b'] and r['spec'] == e['spec'])
            k, (c0, c1), _ = r['line']
            c = (c0 + c1) / 2
            e['bad_adjudicated'] = []
            for (pos, ex, got) in e['bad']:
                x, y = (pos, c) if k == 'H' else (c, pos)
                if bp_solid_at is None:
                    v = 'unclear'
                else:
                    solid = bp_solid_at(x, y, k)
                    exp_solid = ex in ('HARD', 'SOFT', 'DRONE_HOLE')
                    got_solid = got == 'SOLID'
                    v = 'doc_wrong' if solid == got_solid else 'raster_wrong' if solid == exp_solid else 'unclear'
                adj[v] += 1
                e['bad_adjudicated'].append((pos, ex, got, v))
        # ---- numbers
        tot_len = sum(w['len'] for w in W)
        n_soft = sum(1 for s in soft_md if s['floor'] == fl)
        soft_found = sum(1 for e in ev_soft if e['found'] and e['coverage'] >= 0.95)
        dcs = [abs(e['d_centre']) for e in ev_soft if e['d_centre'] is not None]
        dts = [abs(e['d_thickness']) for e in ev_soft if e['d_thickness'] is not None]
        rs = [e for e in ev_rows if e['n']]
        sol = (sum(e['solid'][0] for e in rs), sum(e['solid'][1] for e in rs))
        opn = (sum(e['open'][0] for e in rs), sum(e['open'][1] for e in rs))
        typ = (sum(e['open_type'][0] for e in rs), sum(e['open_type'][1] for e in rs))
        missing_rows = [f"{e['a']} | {e['b']} ({e['spec']})" for e in rs if e['solid'][1] and e['solid'][0] < 0.5 * e['solid'][1]]
        ops = [o for e in rs for o in e['openings']]
        ops_found = [o for o in ops if o['got']]
        ends = [abs(v) for o in ops_found for v in (o['d0'], o['d1']) if v is not None]
        edges = [e for e in ev_rooms]
        ed = [e['d'] for e in edges if e['d'] is not None]
        extra = [w for w in W if why[w['id']] is None]
        bpst = {}
        for w in W:
            st = bp_res.get(w['id'], {}).get('status', 'n/a')
            bpst[st] = bpst.get(st, 0) + w['len']
        conf = {}
        for w in W:
            conf[w['confidence']] = conf.get(w['confidence'], 0) + 1
        S = dict(
            floor=NAME[fl], walls=len(W), wall_length_u=round(tot_len, 1), openings=len(O),
            openings_by_type={t: sum(1 for o in O if o['type'] == t) for t in sorted({o['type'] for o in O})},
            white_px=res['white_px'], white_px_in_boxes=round(recall, 4), wall_box_area_white=round(precision, 4),
            soft=dict(documented=n_soft, recovered_full=soft_found, tagged_from_bw=sum(1 for e in ev_soft if e['tagged_soft']),
                      centre_err_u=dict(mean=round(float(np.mean(dcs)), 2) if dcs else None, max=round(float(np.max(dcs)), 2) if dcs else None),
                      thickness_err_u=dict(mean=round(float(np.mean(dts)), 2) if dts else None, max=round(float(np.max(dts)), 2) if dts else None)),
            rows=dict(scored_rows=len(rs), solid_agree=f'{sol[0]}/{sol[1]} ({100 * sol[0] / max(1, sol[1]):.1f}%)',
                      opening_agree=f'{opn[0]}/{opn[1]} ({100 * opn[0] / max(1, opn[1]):.1f}%)',
                      opening_type_agree=f'{typ[0]}/{typ[1]} ({100 * typ[0] / max(1, typ[1]):.1f}%)',
                      documented_openings=len(ops), openings_found=len(ops_found),
                      opening_end_err_u=dict(median=round(float(np.median(ends)), 2) if ends else None,
                                             p90=round(float(np.percentile(ends, 90)), 2) if ends else None,
                                             within_1u=f"{sum(1 for e in ends if e <= 1)}/{len(ends)}",
                                             within_2u=f"{sum(1 for e in ends if e <= 2)}/{len(ends)}"),
                      rows_missing_wall=missing_rows, disagreeing_samples_by_blueprint=adj),
            openings_s6=dict(documented=len(ev_ops), found=sum(1 for e in ev_ops if e['got']),
                             type_match=sum(1 for e in ev_ops if e['got'] and (e['got_type'] == e['type'])),
                             ends_within_1u=f"{sum(1 for e in ev_ops if e['got'] for v in (e['d0'], e['d1']) if abs(v) <= 1)}/{2 * sum(1 for e in ev_ops if e['got'])}",
                             ends_within_2u=f"{sum(1 for e in ev_ops if e['got'] for v in (e['d0'], e['d1']) if abs(v) <= 2)}/{2 * sum(1 for e in ev_ops if e['got'])}",
                             not_found=[f"{e['a']} | {e['b']} {e['type']} {e['doc']}" for e in ev_ops if not e['got']],
                             matched_by_nearest=sum(1 for e in ev_ops if e['got'] and e['match'] == 'nearest'),
                             off_over_2u=[f"{e['a']} | {e['b']} {e['type']} doc line {e['doc'][1]}-{e['doc'][2]} span {e['doc'][3]}-{e['doc'][4]} -> raster line {e['got_line']} span {e['got_span']} ({e['got_type']})" for e in ev_ops if e['got'] and (max(abs(e['d0']), abs(e['d1'])) > 2 or abs(e['d_line']) > 2)]),
            room_edges=dict(edges=len(edges), with_wall_within_8u=len(ed), within_1u=sum(1 for d in ed if d <= 1),
                            within_2u=sum(1 for d in ed if d <= 2), within_3u=sum(1 for d in ed if d <= 3),
                            over_3u=[f"{e['room']} {e['side']} edge {e['edge']} -> {e['d']}" for e in edges if e['d'] is None or e['d'] > 3]),
            extra=dict(count=len(extra), length_u=round(sum(w['len'] for w in extra), 1),
                       longest=[f"{w['id']} {w['k']} rect {w['rect']} len {w['len']}" for w in sorted(extra, key=lambda w: -w['len'])[:12]]),
            blueprint=dict(fit=bp_fit, wall_length_by_status={k: round(v, 1) for k, v in bpst.items()},
                           openings_where_bp_draws_solid=[f"{o['id']} {o['type']} {o['rect']} white {o['bp_centre_white']}" for o in bp_ops if o['bp_centre_white'] >= 0.75],
                           openings_checked=len(bp_ops),
                           bp_only_wall_candidates=[f"rect {e['rect']} len {e['len']} t {e['t']}" for e in bp_only[:15]], bp_only_count=len(bp_only)),
            confidence=conf,
        )
        summary[NAME[fl]] = S
        json.dump(dict(_doc='Wall boxes and openings extracted from the r6calls floor raster (frame u, layout_notes §1). '
                            'rect = [x0, y0, x1, y1] u, k = H (runs along x) / V (along y), t = drawn thickness u. '
                            'surface SOFT parts take their span from the r6calls bw vector layer. Derived coordinates only.',
                       floor=NAME[fl], walls=W, openings=O),
                  open(os.path.join(a.out, f'walls_{NAME[fl]}.json'), 'w'), indent=1)
        json.dump(dict(summary=S, soft=ev_soft, rows=ev_rows, rooms=ev_rooms, openings_s6=ev_ops, blueprint=bp_res, blueprint_openings=bp_ops, blueprint_only=bp_only),
                  open(os.path.join(a.out, f'eval_{NAME[fl]}.json'), 'w'), indent=1)
        if not a.no_overlay:
            bad = []
            for e in ev_rows:
                for r in rows:
                    if r['floor'] == fl and r['a'] == e['a'] and r['b'] == e['b'] and r['spec'] == e['spec']:
                        k, (c0, c1), _ = r['line']
                        for (pos, ex, got) in e['bad']:
                            bad.append((pos, (c0 + c1) / 2) if k == 'H' else ((c0 + c1) / 2, pos))
            flags = {wid: ('bp-miss' if b['status'] == 'missing' else None) for wid, b in bp_res.items()}
            rm = [r for r in rooms if r['floor'] == fl]
            overlay.draw(png, W, O, os.path.join(HERE, 'img', f'overlay_{NAME[fl]}.png'), ppu=5.0, soft_md=soft_md,
                         rooms=rm, bad=bad, bp_flags=flags, fl=fl)
            overlay.draw(png, W, O, os.path.join(HERE, 'img', f'overlay_{NAME[fl]}_main.png'), crop_u=(130, 40, 345, 290),
                         ppu=7.0, soft_md=soft_md, rooms=rm, bad=bad, bp_flags=flags, fl=fl)
    json.dump(summary, open(os.path.join(a.out, 'summary.json'), 'w'), indent=1)
    print(json.dumps(summary, indent=1))
    print('time %.1fs' % (time.time() - t0))


if __name__ == '__main__':
    main()
