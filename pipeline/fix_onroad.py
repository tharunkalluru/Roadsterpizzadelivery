"""Drops small buildings that sit on a road's carriageway (bad footprints in the open data) from the city packs, with
any shop boards on them. Big site outlines that an internal road crosses are kept. Applies to the served packs and to
the backup copies other steps rebuild from. Run: python3 fix_onroad.py"""
import json, gzip, glob, os
from shapely.geometry import LineString, Polygon
from shapely.strtree import STRtree
BUILD = os.path.join(os.path.dirname(__file__), 'build')
DIRS = ['/home/claude/p2ph/game/public/city/packs', os.path.join(BUILD, 'prev_pack_photo'), os.path.join(BUILD, 'prev_pack')]
SKIP = ('footway', 'path', 'pedestrian', 'steps', 'cycleway', 'track', 'service')
drop = set()
for f in glob.glob(os.path.join(DIRS[0], '*.pack.wasm')):
    d = json.loads(gzip.decompress(open(f, 'rb').read()))
    for t in d['tiles'].values():
        roads = [r for r in t['roads'] if not (r['elev'] and max(r['elev']) > 1.2) and r['cls'] not in SKIP]
        if not roads: continue
        geoms = [LineString(r['pts']).buffer(max(0.5, r['w'] / 2 - 1.0)) for r in roads]
        tree = STRtree(geoms)
        for b in t['buildings']:
            if len(b['ring']) < 3: continue
            try: P = Polygon(b['ring']).buffer(0)
            except Exception: continue
            if P.area > 2000: continue
            if any(geoms[i].intersects(P) and geoms[i].intersection(P).area > 4 for i in tree.query(P)): drop.add(b['id'])
print('buildings to drop', len(drop), flush=True)
json.dump(sorted(drop), open(os.path.join(BUILD, 'onroad_dropped.json'), 'w'))
for dd in DIRS:
    n = 0
    for f in glob.glob(os.path.join(dd, '*.pack.wasm')):
        P = json.loads(gzip.decompress(open(f, 'rb').read())); hit = 0
        for t in P['tiles'].values():
            nb = len(t['buildings']); t['buildings'] = [b for b in t['buildings'] if b['id'] not in drop]
            bo = len(t['boards']); t['boards'] = [b for b in t['boards'] if b.get('building') not in drop]
            hit += nb - len(t['buildings']) + bo - len(t['boards'])
        if hit:
            tmp = f + '.tmp'; open(tmp, 'wb').write(gzip.compress(json.dumps(P, separators=(',', ':'), ensure_ascii=False).encode(), 6)); os.replace(tmp, f); n += 1
    print(dd, 'packs rewritten', n, flush=True)
