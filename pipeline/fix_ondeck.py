"""Drops buildings that stand in the way of a flyover or ramp: a footprint overlapping a deck's carriageway where the
building is taller than the deck there (the car would drive into it). Small footprints only; applies to the served
packs and the backup copies. Run: python3 fix_ondeck.py"""
import json, gzip, glob, os
from shapely.geometry import LineString, Polygon
from shapely.strtree import STRtree
BUILD = os.path.join(os.path.dirname(__file__), 'build')
DIRS = ['/home/claude/p2ph/game/public/city/packs', os.path.join(BUILD, 'prev_pack_photo'), os.path.join(BUILD, 'prev_pack')]
drop = set()
for f in glob.glob(os.path.join(DIRS[0], '*.pack.wasm')):
    d = json.loads(gzip.decompress(open(f, 'rb').read()))
    for t in d['tiles'].values():
        segs = []
        for r in t['roads']:
            if not r['elev'] or max(r['elev']) < 0.3: continue
            for i in range(len(r['pts']) - 1):
                lo = min(r['elev'][i], r['elev'][i + 1])
                segs.append((LineString([r['pts'][i], r['pts'][i + 1]]).buffer(r['w'] / 2 - 0.3, cap_style=2), lo))
        if not segs: continue
        tree = STRtree([s[0] for s in segs])
        for b in t['buildings']:
            if len(b['ring']) < 3: continue
            try: P = Polygon(b['ring']).buffer(0)
            except Exception: continue
            if P.area > 2000: continue
            for i in tree.query(P):
                g, lo = segs[i]
                if b['h'] > lo - 1.0 and g.intersects(P) and g.intersection(P).area > 3: drop.add(b['id']); break
print('buildings in the way of flyovers', len(drop), flush=True)
json.dump(sorted(drop), open(os.path.join(BUILD, 'ondeck_dropped.json'), 'w'))
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
