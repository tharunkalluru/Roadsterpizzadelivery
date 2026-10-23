"""Finds each landmark target on the map: position from OpenStreetMap (an area outline if there is one), else the
business listings, else the fallback; then the building footprint there (OSM outline or the Overture building in the
city packs) as an oriented box (width, depth, front bearing) plus height. Output: build/landmarks_resolved.json"""
import json, math, gzip, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from landmark_targets import TARGETS
BUILD = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build')
LAT0, LON0 = 17.4063, 78.4966
KX = math.cos(math.radians(LAT0)) * 6380050.094 * math.pi / 180; KZ = 6341141.9 * math.pi / 180
def xz(la, lo): return ((lo - LON0) * KX, -(la - LAT0) * KZ)
def ll(x, z): return (LAT0 - z / KZ, LON0 + x / KX)
O = json.load(open(os.path.join(BUILD, 'osm_city.json')))
B = json.load(open(os.path.join(BUILD, 'businesses.json')))
def cent(pts): return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
def area(r): return abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2
def obox(ring):
    """minimum-area oriented box of a ring in x/z metres: (w along front edge, d, bearing of the front normal in deg)"""
    best = None
    for i in range(len(ring)):
        p, q = ring[i], ring[(i + 1) % len(ring)]; L = math.hypot(q[0] - p[0], q[1] - p[1])
        if L < 0.5: continue
        ux, uz = (q[0] - p[0]) / L, (q[1] - p[1]) / L
        us = [x * ux + z * uz for x, z in ring]; vs = [-x * uz + z * ux for x, z in ring]
        a = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or a < best[0]: best = (a, max(us) - min(us), max(vs) - min(vs), ux, uz)
    if not best: return None
    _, w, d, ux, uz = best
    # front normal: perpendicular to the long side; bearing clockwise from north (north = -z)
    nx, nz = (-uz, ux) if w >= d else (ux, uz)
    bearing = (math.degrees(math.atan2(nx, -nz)) + 360) % 360
    return dict(w=round(max(w, d), 1), d=round(min(w, d), 1), rot=round(bearing, 1))
pack_cache = {}
def buildings_near(x, z, R):
    i, j = math.floor(x / 1000), math.floor(z / 1000); out = []
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            ti, tj = i + di, j + dj; pk = f'p{math.floor(ti / 3)}_{math.floor(tj / 3)}'
            if pk not in pack_cache:
                f = f'/home/claude/p2ph/game/public/city/packs/{pk}.pack.wasm'
                pack_cache[pk] = json.loads(gzip.decompress(open(f, 'rb').read())) if os.path.exists(f) else {'tiles': {}}
            t = pack_cache[pk]['tiles'].get(f'{ti}_{tj}')
            if not t: continue
            for b in t['buildings']:
                c = cent(b['ring'])
                if math.hypot(c[0] - x, c[1] - z) < R: out.append(b)
    return out
def inring(x, z, r):
    ins = False
    for i in range(len(r)):
        a, b = r[i], r[i - 1]
        if (a[1] > z) != (b[1] > z) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]: ins = not ins
    return ins
res = []
for key, name, rx, typ, fb in TARGETS:
    R = re.compile(rx, re.I); fx, fz = xz(*fb); cands = []
    for o in O:
        n = ' '.join(filter(None, [o['tags'].get('name'), o['tags'].get('name:en')]))
        if not n or not R.search(n): continue
        pts = o.get('line') or ([p for r in o['rings'] for p in r['outer']] if 'rings' in o else [o['pt']])
        la, lo = cent(pts); x, z = xz(la, lo); d = math.hypot(x - fx, z - fz)
        if d < 6000: cands.append((d - (300 if 'rings' in o else 0), 'osm', o, x, z))
    for b in B:
        if not R.search(b['name']): continue
        x, z = xz(b['lat'], b['lon']); d = math.hypot(x - fx, z - fz)
        if d < 4000: cands.append((d + 150, 'biz', b, x, z))
    cands.sort(key=lambda c: c[0])
    src, x, z, ring = 'fallback', fx, fz, None
    if cands:
        _, src, o, x, z = cands[0]
        if src == 'osm' and 'rings' in o:
            ring = [xz(p[0], p[1]) for p in max(o['rings'], key=lambda r: len(r['outer']))['outer']]
    h = None
    # the building at the spot (largest footprint containing it, or the nearest big one) for shape and height
    blds = buildings_near(x, z, 160)
    inside = [b for b in blds if inring(x, z, b['ring'])]
    pick = max(inside, key=lambda b: area(b['ring'])) if inside else None
    if not pick:
        near = sorted(blds, key=lambda b: math.hypot(cent(b['ring'])[0] - x, cent(b['ring'])[1] - z))
        pick = next((b for b in near[:6] if area(b['ring']) > 150 and math.hypot(cent(b['ring'])[0] - x, cent(b['ring'])[1] - z) < 45), None)
    site = ring
    if pick:
        h = pick['h']
        if not ring or area(pick['ring']) > 0.25 * area(ring): bring = pick['ring']
        else: bring = None
    else: bring = None
    box = obox(bring) if bring else None
    sbox = obox(ring) if ring else None
    if bring: x, z = cent(bring)
    la, lo = ll(x, z)
    res.append(dict(key=key, name=name, type=typ, src=src, lat=round(la, 6), lon=round(lo, 6), h=h, building=box, site=sbox,
                    site_area=round(area(ring)) if ring else None, osm=(cands[0][2].get('id') if cands and src == 'osm' else None),
                    found=(cands[0][2]['tags'].get('name') if cands and src == 'osm' else cands[0][2]['name'] if cands else None),
                    dist=round(cands[0][0]) if cands else None))
json.dump(res, open(os.path.join(BUILD, 'landmarks_resolved.json'), 'w'), indent=0, ensure_ascii=False)
for r in res: print(r['key'], r['src'], r['found'], r['dist'], r['building'], r['site'], r['h'])
