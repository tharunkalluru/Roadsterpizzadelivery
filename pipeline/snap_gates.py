"""Moves the entrance-gate landmarks (campuses, parks, film city...) from the middle of their grounds to the main road
beside them: the nearest trunk/primary/secondary/tertiary road to the site's centre, the gate set 12 m in from the
road and facing it. Known gate positions (mapped entrance nodes) win. Rewrites game/src/world/landmarks_data.ts."""
import json, math, os, pickle
HERE = os.path.dirname(os.path.abspath(__file__))
TS = os.path.join(HERE, '..', 'game', 'src', 'world', 'landmarks_data.ts')
LAT0, LON0 = 17.4063, 78.4966
KX = math.cos(math.radians(LAT0)) * 6380050.094 * math.pi / 180; KZ = 6341141.9 * math.pi / 180
def xz(la, lo): return ((lo - LON0) * KX, -(la - LAT0) * KZ)
def ll(x, z): return (LAT0 - z / KZ, LON0 + x / KX)
GATES = ['uoh', 'iiit', 'isb', 'jntu', 'iict', 'nalsar', 'ccmb', 'ntr_gardens', 'lumbini', 'indira_park', 'kbr', 'zoo',
         'botanical', 'public_gardens', 'ramoji', 'wonderla', 'biodiversity', 'shilparamam', 'jalavihar']
KNOWN = {'jntu': (17.4959769, 78.3947049), 'ramoji': (17.3116529, 78.6824795), 'kbr': (17.4233402, 78.448391)}
MAJOR = {'trunk', 'primary', 'secondary', 'tertiary'}
E = [e for e in pickle.load(open(os.path.join(HERE, 'build', 'city_edges.pkl'), 'rb'))['edges'] if e['cls'] in MAJOR and not e.get('elev')]
s = open(TS).read(); i = s.index('= [') + 2; j = s.rindex(']') + 1; D = json.loads(s[i:j])
def nearest(x, z, R):
    best = None
    for e in E:
        p = e['pts']
        for a, b in zip(p, p[1:]):
            if min(a[0], b[0]) > x + R or max(a[0], b[0]) < x - R or min(a[1], b[1]) > z + R or max(a[1], b[1]) < z - R: continue
            dx, dz = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dz * dz or 1
            t = max(0, min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); cx, cz = a[0] + dx * t, a[1] + dz * t
            d = math.hypot(x - cx, z - cz)
            if d < R and (not best or d < best[0]): best = (d, cx, cz, e)
    return best
for d in D:
    if d['key'] not in GATES: continue
    x, z = xz(*KNOWN[d['key']]) if d['key'] in KNOWN else xz(d['lat'], d['lon'])
    n = nearest(x, z, 2500)
    if not n: print(d['key'], 'no road'); continue
    dist, cx, cz, e = n
    ux, uz = (x - cx) / (dist or 1), (z - cz) / (dist or 1)        # from the road into the grounds
    if dist < 1: ux, uz = 0, 1
    off = e['w'] / 2 + 12
    gx, gz = cx + ux * off, cz + uz * off
    rot = (math.degrees(math.atan2(-ux, uz)) + 360) % 360           # front (+v) faces back toward the road
    la, lo = ll(gx, gz)
    print(f"{d['key']:15s} moved {math.hypot(gx - x, gz - z):6.0f} m to {e.get('name') or e['cls']}")
    d.update(lat=round(la, 6), lon=round(lo, 6), rot=round(rot, 1), w=None, d=None)
# features that line a named road: statues along Tank Bund, lamps along Necklace Road (set on the lake side of the road)
import re
ROADSIDE = {'tank_bund': r'^(?!.*lower).*tank ?bund', 'necklace_road': r'necklace'}
for d in D:
    if d['key'] not in ROADSIDE: continue
    x, z = xz(d['lat'], d['lon']); R = re.compile(ROADSIDE[d['key']], re.I); best = None
    for e in pickle.load(open(os.path.join(HERE, 'build', 'city_edges.pkl'), 'rb'))['edges']:
        if not e.get('name') or not R.search(e['name']) or e.get('elev'): continue
        for a, b in zip(e['pts'], e['pts'][1:]):
            mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2; L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < 20: continue
            dd = math.hypot(mx - x, mz - z) - L        # prefer long straight pieces near the site
            if not best or dd < best[0]: best = (dd, mx, mz, (b[0] - a[0]) / L, (b[1] - a[1]) / L, e)
    if not best: print(d['key'], 'road not found'); continue
    _, mx, mz, hx, hz, e = best
    nx, nz = -hz, hx
    if (x - mx) * nx + (z - mz) * nz < 0: nx, nz = -nx, -nz          # toward the lake
    gx, gz = mx + nx * (e['w'] / 2 + 3.5), mz + nz * (e['w'] / 2 + 3.5)
    rot = (math.degrees(math.atan2(hz, hx)) + 360) % 360
    if math.sin(math.radians(rot)) * nx - math.cos(math.radians(rot)) * nz > 0: rot = (rot + 180) % 360   # front (+v) to the road
    la, lo = ll(gx, gz); print(f"{d['key']:15s} on {e['name']} ({math.hypot(gx - x, gz - z):.0f} m)")
    d.update(lat=round(la, 6), lon=round(lo, 6), rot=round(rot, 1), w=None, d=None)
open(TS, 'w').write(s[:i] + json.dumps(D, ensure_ascii=False, separators=(',', ': ')) + s[j:])
