"""Q1: what vector geometry does the r6calls Oregon SVG hold per floor?

Streams the 28.8 MB SVG (xml.etree iterparse, elements cleared as they close) and prints, for every
layer group under each top-level group (Background, Floor 0..4): element counts by tag, the number of
path commands, the bounding box of the layer's geometry in u (floor-local frame, layout_notes §1), and
the fill/stroke colours used. Embedded <image> elements are reported with their size only.

usage: python3 -I svg_inventory.py <oregon.svg> [out.json]
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

INK = '{http://www.inkscape.org/namespaces/inkscape}label'
NUM = re.compile(r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')


def label(el):
    return el.attrib.get(INK) or el.attrib.get('id') or ''


def tag(el):
    return el.tag.split('}')[-1]


def style_colours(el):
    st = el.attrib.get('style', '')
    out = []
    for key in ('fill', 'stroke'):
        v = el.attrib.get(key)
        m = re.search(key + r'\s*:\s*([^;]+)', st)
        if m:
            v = m.group(1).strip()
        if v and v != 'none':
            out.append(f'{key}={v}')
    return out


def path_points(d):
    """Very rough absolute-point estimate for the bbox: only used when the path is all absolute M/L/H/V/C.
    Returns (ncommands, relative?)"""
    cmds = re.findall(r'[MmLlHhVvCcSsQqTtAaZz]', d)
    return len(cmds), any(c.islower() and c not in 'z' for c in cmds)


def main():
    path = sys.argv[1]
    out_json = sys.argv[2] if len(sys.argv) > 2 else None
    stack = []  # labels of open <g>
    layers = defaultdict(lambda: dict(tags=Counter(), path_cmds=0, rel_paths=0, colours=Counter(),
                                      rect_bbox=None, images=[], texts=[], transforms=Counter()))
    for ev, el in ET.iterparse(path, events=('start', 'end')):
        t = tag(el)
        if ev == 'start':
            if t == 'g':
                stack.append(label(el))
            continue
        # end event
        if t == 'g':
            stack.pop()
            el.clear()
            continue
        if not stack:
            continue
        top = stack[0]
        sub = stack[1] if len(stack) > 1 else '(direct)'
        key = f'{top} > {sub}'
        L = layers[key]
        L['tags'][t] += 1
        for c in style_colours(el):
            L['colours'][c] += 1
        if el.attrib.get('transform'):
            L['transforms'][el.attrib['transform'][:24]] += 1
        if t == 'path':
            n, rel = path_points(el.attrib.get('d', ''))
            L['path_cmds'] += n
            L['rel_paths'] += int(rel)
        elif t == 'rect':
            try:
                x, y = float(el.attrib.get('x', 0)), float(el.attrib.get('y', 0))
                w, h = float(el.attrib.get('width', 0)), float(el.attrib.get('height', 0))
                b = L['rect_bbox']
                L['rect_bbox'] = [min(x, b[0]), min(y, b[1]), max(x + w, b[2]), max(y + h, b[3])] if b else [x, y, x + w, y + h]
            except ValueError:
                pass
        elif t == 'image':
            L['images'].append(dict(id=el.attrib.get('id'), w=el.attrib.get('width'), h=el.attrib.get('height')))
        elif t == 'text' or t == 'tspan':
            txt = ''.join(el.itertext()).strip()
            if txt and len(L['texts']) < 6:
                L['texts'].append(txt[:30])
        el.clear()
    rows = []
    for key in sorted(layers):
        L = layers[key]
        tags = dict(L['tags'])
        rows.append(dict(layer=key, tags=tags, path_cmds=L['path_cmds'], rel_paths=L['rel_paths'],
                         colours=dict(L['colours'].most_common(4)), rect_bbox_svg=L['rect_bbox'],
                         images=L['images'][:3], n_images=len(L['images']), texts=L['texts']))
        print(f"{key:34s} {json.dumps(tags):60s} cmds={L['path_cmds']:6d} imgs={len(L['images']):2d} colours={dict(L['colours'].most_common(3))}")
    if out_json:
        json.dump(rows, open(out_json, 'w'), indent=1)


if __name__ == '__main__':
    main()
