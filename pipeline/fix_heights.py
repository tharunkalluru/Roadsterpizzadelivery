"""Storey counts for buildings whose height the open data doesn't give, judged by how built-up the surroundings are.

export_city.py guessed missing heights from footprint size alone (a 100 m2 house became three storeys anywhere). In the
city core that holds; out towards the villages most such houses are one or two storeys, big footprints are sheds and
works, and three-storey blocks are rare. Only guessed heights change; heights from data, floor counts or the repo stay.
Run: python3 fix_heights.py [--stats] (writes all pack copies; ids changed listed in build/heights_changed.json)
"""
import os, sys, json, gzip, glob, random, math
from collections import defaultdict
import duckdb
BUILD = os.path.join(os.path.dirname(__file__), 'build'); RAW = os.path.join(os.path.dirname(__file__), 'raw')
REPO = os.environ.get('REPO', '/home/claude/repo/rpd/game')
DIRS = ['/home/claude/p2ph/game/public/city/packs', os.path.join(BUILD, 'prev_pack_photo'), os.path.join(BUILD, 'prev_pack')]
repo_heights = set()
for f in glob.glob(f'{REPO}/public/world/hyd-metro/v2/chunks/*.json'):
    for b in json.load(open(f))['buildings']:
        if b.get('osmId') and b.get('heightM'): repo_heights.add(b['osmId'].replace('way/', 'w').replace('relation/', 'r'))
est = set()
for bid, h, nf, sources in duckdb.sql(f"SELECT id, height, num_floors, sources FROM '{RAW}/overture_buildings.parquet'").fetchall():
    if h or nf: continue
    osm = next((s['record_id'].split('@')[0] for s in sources or [] if s.get('dataset') == 'OpenStreetMap' and s.get('record_id')), None)
    if osm and osm in repo_heights: continue
    est.add(bid[:12])
print('guessed heights in source', len(est), flush=True)

def area(r): return abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2
def cent(r): return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)
cell = defaultdict(float); blds = {}
for f in glob.glob(os.path.join(DIRS[0], '*.pack.wasm')):
    d = json.loads(gzip.decompress(open(f, 'rb').read()))
    for t in d['tiles'].values():
        for b in t['buildings']:
            a = area(b['ring']); cx, cz = cent(b['ring'])
            cell[(math.floor(cx / 50), math.floor(cz / 50))] += a
            blds[b['id']] = (cx, cz, a, b['h'])
def cover(cx, cz):
    i, j = math.floor(cx / 50), math.floor(cz / 50)
    return sum(cell.get((i + di, j + dj), 0) for di in range(-2, 3) for dj in range(-2, 3)) / 62500
def storeys(rnd, weights):
    x = rnd.random() * sum(weights); k = 0
    while x > weights[k]: x -= weights[k]; k += 1
    return k + 1
new_h = {}
stats = defaultdict(int)
for bid, (cx, cz, a, h) in blds.items():
    c = cover(cx, cz); band = 'core' if c >= 0.2 else 'suburb' if c >= 0.09 else 'village'
    stats[band] += 1
    if bid not in est or band == 'core': continue
    rnd = random.Random(bid)
    if a > 700: n = 1; hh = round(rnd.uniform(6.0, 9.0), 1)                 # sheds, works, godowns, function halls
    else:
        w = [70, 26, 4, 0] if band == 'village' else [32, 45, 18, 5]
        if a < 40: w = [90, 10, 0, 0]
        n = storeys(rnd, w); hh = round(n * 3.25 + rnd.uniform(0.2, 0.7), 1)
    if abs(hh - h) > 0.4: new_h[bid] = hh; stats[band + '_changed'] += 1
print(dict(stats), flush=True)
if '--stats' in sys.argv: sys.exit()
json.dump(sorted(new_h), open(os.path.join(BUILD, 'heights_changed.json'), 'w'))
for dd in DIRS:
    n = 0
    for f in glob.glob(os.path.join(dd, '*.pack.wasm')):
        P = json.loads(gzip.decompress(open(f, 'rb').read())); hit = 0
        for t in P['tiles'].values():
            for b in t['buildings']:
                if b['id'] in new_h and b['h'] != new_h[b['id']]: b['h'] = new_h[b['id']]; hit += 1
        if hit:
            tmp = f + '.tmp'; open(tmp, 'wb').write(gzip.compress(json.dumps(P, separators=(',', ':'), ensure_ascii=False).encode(), 6)); os.replace(tmp, f); n += 1
    print(dd, 'packs rewritten', n, flush=True)
