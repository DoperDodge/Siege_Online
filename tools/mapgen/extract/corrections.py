"""Write out/opening_corrections.csv: every layout_notes §6 opening with coordinates next to the extracted one
(doc line/span vs raster line/span, type), flagging documented spans more than 2 u off. usage: python3 -I corrections.py"""
import csv
import json
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
rows = []
for F in ('B', '1F', '2F', '3F'):
    p = os.path.join(OUT, f'eval_{F}.json')
    if not os.path.exists(p):
        continue
    for o in json.load(open(p))['openings_s6']:
        doc = [F, o['a'], o['b'], o['type'], o['doc'][0], f"{o['doc'][1]}-{o['doc'][2]}", f"{o['doc'][3]}-{o['doc'][4]}"]
        if not o.get('got'):
            rows.append(doc + ['', '', '', 'no extracted opening (no wall line there)'])
            continue
        off = max(abs(o['d0']), abs(o['d1']), abs(o['d_line']))
        rows.append(doc + [f"{o['got_line'][0]}-{o['got_line'][1]}", f"{o['got_span'][0]}-{o['got_span'][1]}", o['got_type'],
                           'ok (<= 2 u)' if off <= 2 else f'doc off by up to {off:.1f} u: use the raster'])
with open(os.path.join(OUT, 'opening_corrections.csv'), 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['floor', 'room_a', 'room_b', 'doc_type', 'axis', 'doc_line_u', 'doc_span_u', 'raster_line_u', 'raster_span_u',
                'raster_type', 'verdict'])
    w.writerows(rows)
print(len(rows), 'openings;', sum(1 for r in rows if r[-1].startswith('doc off')), 'documented more than 2 u off')
