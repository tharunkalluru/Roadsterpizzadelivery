"""Slip roads and interchange ramps (Overture subclass 'link') become *_link roads with ramp widths, instead of
full-width copies of the road they serve (ORR exits were 13 m wide 'motorways'). Updates city_edges.pkl and every
pack copy. Run: python3 fix_links.py"""
import os, json, gzip, glob, pickle, duckdb
BUILD = os.path.join(os.path.dirname(__file__), 'build'); RAW = os.path.join(os.path.dirname(__file__), 'raw')
DIRS = ['/home/claude/p2ph/game/public/city/packs', os.path.join(BUILD, 'prev_pack_photo'), os.path.join(BUILD, 'prev_pack')]
links = {r[0][:12] for r in duckdb.sql(f"SELECT id FROM '{RAW}/overture_segments.parquet' WHERE subtype='road' AND subclass='link'").fetchall()}
W = {'motorway': (6.5, 9.0), 'trunk': (6.0, 8.5), 'primary': (6.0, 8.0), 'secondary': (5.5, 7.5), 'tertiary': (5.5, 7.0)}
def fix(e):
    base = e['cls'].replace('_link', '')
    if e['id'].split('_')[0] not in links or base not in W or e['cls'].endswith('_link'): return False
    e['cls'] = base + '_link'; e['w'] = W[base][0] if e['oneway'] else W[base][1]; e['lanes'] = 1 if e['oneway'] else 2
    return True
D = pickle.load(open(os.path.join(BUILD, 'city_edges.pkl'), 'rb'))
changed = {e['id']: (e['cls'], e['w']) for e in D['edges'] if fix(e)}
pickle.dump(D, open(os.path.join(BUILD, 'city_edges.pkl'), 'wb'))
print('link roads', len(changed), flush=True)
for dd in DIRS:
    n = 0
    for f in glob.glob(os.path.join(dd, '*.pack.wasm')):
        P = json.loads(gzip.decompress(open(f, 'rb').read())); hit = 0
        for t in P['tiles'].values():
            for r in t['roads']:
                if r['id'] in changed and r['cls'] != changed[r['id']][0]: r['cls'], r['w'] = changed[r['id']]; hit += 1
        if hit:
            tmp = f + '.tmp'; open(tmp, 'wb').write(gzip.compress(json.dumps(P, separators=(',', ':'), ensure_ascii=False).encode(), 6)); os.replace(tmp, f); n += 1
    print(dd, 'packs rewritten', n, flush=True)
