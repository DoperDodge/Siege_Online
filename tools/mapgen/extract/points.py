"""Transform-aware centres and bounding boxes (in u) of r6calls point layers: cam, fe, gp, ld, dt, bmb, hst, sec, ip, fh,
ch, losf, bw. Writes JSON to stdout.

usage: python3 -I points.py <oregon.svg> <layer,layer,...>   (rerun.sh: cam,fe,gp,ld,dt,bmb,hst,sec,ip,fh,ch)
"""
import sys, re, json, math
import xml.etree.ElementTree as ET
path = sys.argv[1]
OX, OY = 617.588, 259.121  # root -> u
NUM = r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?'
def mat_mul(a, b):
    return (a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5])
I = (1,0,0,1,0,0)
def parse_tr(s):
    m = I
    if not s: return m
    for name, args in re.findall(r'(\w+)\s*\(([^)]*)\)', s):
        v = [float(x) for x in re.findall(NUM, args)]
        if name == 'translate': t = (1,0,0,1,v[0], v[1] if len(v)>1 else 0)
        elif name == 'scale': t = (v[0],0,0,v[1] if len(v)>1 else v[0],0,0)
        elif name == 'matrix': t = tuple(v)
        elif name == 'rotate':
            a = math.radians(v[0]); c, s_ = math.cos(a), math.sin(a)
            t = (c, s_, -s_, c, 0, 0)
            if len(v) == 3:
                t = mat_mul(mat_mul((1,0,0,1,v[1],v[2]), t), (1,0,0,1,-v[1],-v[2]))
        else: raise ValueError(name)
        m = mat_mul(m, t)
    return m
def app(m, p): return (m[0]*p[0]+m[2]*p[1]+m[4], m[1]*p[0]+m[3]*p[1]+m[5])
def path_pts(d):
    toks = re.findall(r'[A-Za-z]|' + NUM, d)
    x = y = sx = sy = 0.0; pts = []; cmd = None; i = 0
    nargs = dict(M=2,L=2,H=1,V=1,C=6,S=4,Q=4,T=2,A=7,Z=0)
    while i < len(toks):
        t = toks[i]
        if re.match(r'[A-Za-z]', t):
            cmd = t; i += 1
            if cmd in 'Zz': x, y = sx, sy
            continue
        U = cmd.upper(); rel = cmd.islower(); n = nargs[U]
        a = [float(v) for v in toks[i:i+n]]; i += n
        if U == 'H': x = a[0] + (x if rel else 0)
        elif U == 'V': y = a[0] + (y if rel else 0)
        elif U == 'A':
            x = a[5] + (x if rel else 0); y = a[6] + (y if rel else 0)
        else:
            bx, by = (x, y) if rel else (0, 0)
            for k in range(0, n, 2):
                pts.append((a[k]+bx, a[k+1]+by))
            x, y = a[n-2]+bx, a[n-1]+by
        pts.append((x, y))
        if U == 'M':
            sx, sy = x, y; cmd = 'l' if rel else 'L'
    return pts
def elem_pts(e):
    t = e.tag.split('}')[-1]
    if t in ('rect', 'image'):
        x = float(e.attrib.get('x', 0)); y = float(e.attrib.get('y', 0)); w = float(e.attrib.get('width', 0)); h = float(e.attrib.get('height', 0))
        return [(x,y),(x+w,y),(x,y+h),(x+w,y+h)]
    if t == 'path': return path_pts(e.attrib.get('d', ''))
    if t == 'circle':
        cx, cy, r = (float(e.attrib.get(k, 0)) for k in ('cx','cy','r')); return [(cx-r,cy-r),(cx+r,cy+r)]
    if t == 'text':
        x = e.attrib.get('x'); y = e.attrib.get('y')
        if x is None:
            ts = [c for c in e.iter() if c.tag.split('}')[-1]=='tspan' and c.attrib.get('x')]
            if ts: x, y = ts[0].attrib['x'], ts[0].attrib['y']
        if x is None: return []
        return [(float(re.findall(NUM, x)[0]), float(re.findall(NUM, y)[0]))]
    return []
root = ET.parse(path).getroot()
want = sys.argv[2].split(',')
out = []
def walk(e, m, chain):
    m2 = mat_mul(m, parse_tr(e.attrib.get('transform')))
    eid = e.attrib.get('id') or ''
    lab = e.attrib.get('{http://www.inkscape.org/namespaces/inkscape}label') or eid
    t = e.tag.split('}')[-1]
    ch = chain + [lab]
    layer = next((c for c in ch if re.match(r'^(\d|bg)-\w+$', c or '')), None)
    if t in ('rect','image','path','circle','text') and layer and layer.split('-')[1] in want:
        pts = [app(m2, p) for p in elem_pts(e)]
        if pts:
            xs = [p[0]-OX for p in pts]; ys = [p[1]-OY for p in pts]
            txt = ''.join(e.itertext()).strip() if t == 'text' else ''
            out.append(dict(layer=layer, chain='>'.join(c for c in ch[2:] if c), tag=t, id=eid, txt=txt, x0=round(min(xs),2), x1=round(max(xs),2), y0=round(min(ys),2), y1=round(max(ys),2), cx=round((min(xs)+max(xs))/2,2), cy=round((min(ys)+max(ys))/2,2)))
        if t != 'text': return
    for c in e:
        walk(c, m2, ch)
walk(root, I, [])
json.dump(out, sys.stdout, indent=0)
