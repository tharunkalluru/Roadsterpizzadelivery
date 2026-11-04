"""Flyover clean-up on the finished edge set (city_edges.pkl), then the same elevations written into the city packs.

A deck can't meet an at-grade road at full height. Where a deck end shares a node with a ground road, the deck
ramps down to that node at a believable gradient, unless two main-road decks pass straight through the node (then the
ground road simply ends under the bridge). Repeats until stable, because flattening one piece can expose the next.
Run: python3 fix_decks.py [--packs]   (original pkl kept as build/city_edges_predeck.pkl)
"""
import os, sys, math, pickle, shutil, gzip, json, glob
from collections import defaultdict
BUILD = os.path.join(os.path.dirname(__file__), 'build')
PACKS = '/home/claude/p2ph/game/public/city/packs'
SLOPE = 0.08
MAJOR = {'motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link'}

src = os.path.join(BUILD, 'city_edges.pkl'); bak = os.path.join(BUILD, 'city_edges_predeck.pkl')
if not os.path.exists(bak): shutil.copy(src, bak)
D = pickle.load(open(bak, 'rb')); edges = D['edges']
def is_deck(e): return e['elev'] is not None and max(e['elev']) > 1.2
def end_y(e, end): return 0.0 if e['elev'] is None else e['elev'][0 if end == 'from' else -1]
inc = defaultdict(list)
for e in edges:
    for end in ('from', 'to'):
        if e[end]: inc[e[end]].append((e, end))
changed = set(); rounds = 0
while True:
    rounds += 1; n_fix = 0
    for nid, a in inc.items():
        high = [(e, end) for e, end in a if end_y(e, end) > 1.5]
        low = [(e, end) for e, end in a if end_y(e, end) <= 1.5]
        if not high or not low: continue
        if sum(1 for e, _ in high if e['cls'] in MAJOR) >= 2: continue     # main deck passes over; the ground road ends beneath it
        for e, end in high:
            pts = e['pts']; cum = [0.0]
            for i in range(1, len(pts)): cum.append(cum[-1] + math.dist(pts[i - 1], pts[i]))
            L = cum[-1]
            for i, d in enumerate(cum):
                dd = d if end == 'from' else L - d
                e['elev'][i] = round(min(e['elev'][i], SLOPE * dd), 2)
            if max(e['elev']) < 0.3: e['elev'] = None
            changed.add(e['id']); n_fix += 1
    print('round', rounds, 'deck ends landed', n_fix, flush=True)
    if not n_fix or rounds > 12: break
print('edges changed', len(changed), 'decks now', sum(1 for e in edges if is_deck(e)))
pickle.dump(D, open(src, 'wb'))
if '--packs' in sys.argv:
    by = {e['id']: e['elev'] for e in edges if e['id'] in changed}
    for d in (PACKS, os.path.join(BUILD, 'prev_pack_photo'), os.path.join(BUILD, 'prev_pack')):
        n_files = 0
        for f in glob.glob(os.path.join(d, '*.pack.wasm')):
            P = json.loads(gzip.decompress(open(f, 'rb').read()))
            hit = 0
            for t in P['tiles'].values():
                for r in t['roads']:
                    if r['id'] in by: r['elev'] = by[r['id']]; hit += 1
            if hit:
                tmp = f + '.tmp'; open(tmp, 'wb').write(gzip.compress(json.dumps(P, separators=(',', ':'), ensure_ascii=False).encode(), 6)); os.replace(tmp, f); n_files += 1
        print(d, 'packs rewritten', n_files, flush=True)
