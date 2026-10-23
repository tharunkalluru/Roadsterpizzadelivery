"""Adds the OpenStreetMap extras (build/osm_city.json from osm_extract.py) to every tile of the city packs as
`osm`: a list of features in game coordinates (x east, z south, metres from RTC X Roads). Lines and areas go to every
tile they touch; the game draws each piece once. Re-runnable: the field is replaced each time.
Writes the served packs and the backup copies. Run: python3 add_osm.py
"""
import os, json, gzip, glob, math
BUILD = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build')
DIRS = ['/home/claude/p2ph/game/public/city/packs', os.path.join(BUILD, 'prev_pack_photo'), os.path.join(BUILD, 'prev_pack')]
LAT0, LON0, NR, MR = 17.4063, 78.4966, 6380050.094, 6341141.900
KX = math.cos(math.radians(LAT0)) * NR * math.pi / 180; KZ = MR * math.pi / 180
def xz(p): return [round((p[1] - LON0) * KX, 1), round(-(p[0] - LAT0) * KZ, 1)]
KINDS = {'exit', 'footbridge', 'subway', 'underpass', 'rail', 'station', 'platform', 'entrance', 'bus_station', 'bus_stop', 'fuel', 'toll',
         'water', 'waterway', 'park', 'landmark', 'worship', 'institution', 'bridge_area'}
TAGS = ('name', 'name:en', 'name:te', 'name:hi', 'brand', 'operator', 'ref', 'layer', 'bridge', 'tunnel', 'covered', 'railway', 'highway',
        'public_transport', 'station', 'subway', 'amenity', 'tourism', 'historic', 'leisure', 'natural', 'water', 'waterway', 'religion',
        'building', 'shop', 'wikidata', 'height', 'building:levels', 'usage', 'service', 'network', 'man_made', 'landuse', 'exit_to', 'destination')
feats = json.load(open(os.path.join(BUILD, 'osm_city.json')))
by_tile = {}
# petrol bunks from the business listings too (Overture / Foursquare / OSM shops), unless OSM already has one within 60 m
osm_fuel = [f['pt'] if 'pt' in f else f['rings'][0]['outer'][0] for f in feats if f['kind'] == 'fuel']
grid = {}
for la, lo in osm_fuel: grid.setdefault((round(la / 0.0006), round(lo / 0.0006)), []).append((la, lo))
n_biz = 0
for b in json.load(open(os.path.join(BUILD, 'businesses.json'))):
    cat = str(b.get('category') or '')
    if not ('gas_station' in cat or cat == 'fuel' or 'Fuel Station' in cat or (b.get('name') or '').lower().endswith(('petrol pump', 'petrol bunk', 'filling station'))): continue
    la, lo = b['lat'], b['lon']; k = (round(la / 0.0006), round(lo / 0.0006))
    if any(math.hypot((la - a) * 110574, (lo - c) * 106000) < 60 for i in (-1, 0, 1) for j in (-1, 0, 1) for a, c in grid.get((k[0] + i, k[1] + j), [])): continue
    grid.setdefault(k, []).append((la, lo))
    feats.append(dict(id=b['uid'], kind='fuel', tags={'name': b['name'], **({'brand': b['brand']} if b.get('brand') else {})}, pt=[la, lo])); n_biz += 1
print('petrol bunks from listings', n_biz, 'from OSM', len(osm_fuel), flush=True)
for f in feats:
    if f['kind'] not in KINDS: continue
    g = {'id': f['id'], 'k': f['kind'], 't': {k: v for k, v in f['tags'].items() if k in TAGS}}
    if 'pt' in f: g['p'] = xz(f['pt']); pts = [g['p']]
    elif 'line' in f: g['l'] = [xz(p) for p in f['line']]; pts = g['l']
    else:
        g['r'] = [[xz(p) for p in r['outer']] for r in f['rings']]
        g['h'] = [[xz(p) for p in h] for r in f['rings'] for h in r['holes']][:20]
        pts = [p for r in g['r'] for p in r]
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    if (max(xs) - min(xs)) * (max(zs) - min(zs)) > 4e8: continue            # district-sized polygons are not features
    for i in range(math.floor((min(xs) - 60) / 1000), math.floor((max(xs) + 60) / 1000) + 1):
        for j in range(math.floor((min(zs) - 60) / 1000), math.floor((max(zs) + 60) / 1000) + 1):
            by_tile.setdefault(f'{i}_{j}', []).append(g)
print('features', len(feats), 'tiles with extras', len(by_tile), flush=True)
for dd in DIRS:
    n = 0
    for f in glob.glob(os.path.join(dd, '*.pack.wasm')):
        P = json.loads(gzip.decompress(open(f, 'rb').read()))
        for k, t in P['tiles'].items(): t['osm'] = by_tile.get(k, [])
        tmp = f + '.tmp'; open(tmp, 'wb').write(gzip.compress(json.dumps(P, separators=(',', ':'), ensure_ascii=False).encode(), 6)); os.replace(tmp, f); n += 1
    print(dd, 'packs rewritten', n, flush=True)
