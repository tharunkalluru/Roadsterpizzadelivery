"""City step 3: core.pack.wasm (loaded at start) and map.pack.wasm (loaded when the full map opens).

core: tile manifest, main-road network for GPS (motorway .. tertiary + links), metro (all three lines), neighbourhood
names, cinemas, food pickups and drop-off points with pre-snapped kerb stops.
map: every road simplified to ~3 m, big parks and lakes, for the city-scale map.
"""
import gzip, json, math, os, pickle, glob, time
from collections import defaultdict
import duckdb, numpy as np, shapely
from shapely.geometry import LineString

HERE = os.path.dirname(__file__)
RAW, BUILD = os.path.join(HERE, 'raw'), os.path.join(HERE, 'build')
REPO = os.environ.get('REPO', '/home/claude/repo/rpd/game')
OUT = os.environ.get('OUT', '/home/claude/p2ph/game/public/city')
NR, MR = 6380050.094, 6341141.900
D = pickle.load(open(os.path.join(BUILD, 'city_edges.pkl'), 'rb'))
LAT0, LON0 = D['origin']
KX = math.cos(math.radians(LAT0)) * NR * math.pi / 180
KZ = MR * math.pi / 180
def to_xz(lat, lon): return (round((lon - LON0) * KX, 1), round(-(lat - LAT0) * KZ, 1))
MAJOR = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
t0 = time.time()

# tile manifest from the packs
packs, tiles = [], []
for f in sorted(glob.glob(os.path.join(OUT, 'packs', '*.pack.wasm'))):
    d = json.loads(gzip.decompress(open(f, 'rb').read()))
    ts = [[t['i'], t['j']] for t in d['tiles'].values()]
    packs.append(dict(p=d['pack'], file='packs/' + os.path.basename(f), bytes=os.path.getsize(f), tiles=ts))
    tiles += ts
print('packs', len(packs), 'tiles', len(tiles), round(sum(p['bytes'] for p in packs) / 1e6, 1), 'MB', round(time.time() - t0), 's')

# main-road network
core_edges, core_nodes = [], {}
for e in D['edges']:
    if e['cls'] not in MAJOR: continue
    core_edges.append({k: e[k] for k in ('id', 'name', 'cls', 'w', 'lanes', 'oneway', 'from', 'to', 'pts', 'elev', 'maxspeed')})
    for end, i in (('from', 0), ('to', -1)):
        if e[end]: core_nodes[e[end]] = e['pts'][i]
print('core edges', len(core_edges))

# metro: all lines, stations, pillars
repo = json.load(open(f'{REPO}/public/world/hyd-metro/v2/core.json'))
R_LAT0, R_LON0 = 17.4146, 78.5484
R_KX = math.cos(math.radians(R_LAT0)) * NR * math.pi / 180
def repo_to_ll(x, z): return (R_LAT0 - z / KZ, R_LON0 + x / R_KX)
metro = dict(lines=[], stations=[], pillars=[], deckHeight=repo['metro'].get('deckHeightM', 11))
for ml in repo['metroLines']:
    for part in ml['geo']: metro['lines'].append(dict(id=ml['id'], color=ml['color'], name=ml.get('name'), pts=[list(to_xz(la, lo)) for la, lo in part]))
for st in repo['stations']:
    metro['stations'].append(dict(id=st['id'], name=st['name'], te=st.get('nameTe'), lines=st['lines'], p=list(to_xz(st['lat'], st['lon']))))
for p in repo['metro']['pillars']:
    la, lo = repo_to_ll(p['x'], p['z']); metro['pillars'].append(dict(p=list(to_xz(la, lo)), h=p['heading'], line=p['lineId']))
print('metro', len(metro['lines']), 'lines', len(metro['stations']), 'stations', len(metro['pillars']), 'pillars')

# neighbourhood names
places = []
for name, sub, lat, lon in duckdb.sql(f"SELECT name, subtype, lat, lon FROM '{RAW}/overture_divisions.parquet' WHERE name IS NOT NULL").fetchall():
    if name.startswith('Ward ') or name.startswith('Circle '): continue
    places.append(dict(name=name, kind=sub, p=list(to_xz(lat, lon))))
print('places', len(places))

pois = dict(food=[], theatres=[], drops=[])
for f in glob.glob(os.path.join(BUILD, 'city_pois', '*.json')):
    d = json.load(open(f))
    for k in pois: pois[k] += d[k]
print({k: len(v) for k, v in pois.items()}, 'pizza', sum(1 for f in pois['food'] if f['pizza']))

xs = [p['p'][0] for p in packs]; zs = [p['p'][1] for p in packs]
core = dict(origin=dict(lat=LAT0, lon=LON0), tile=1000, pack=3, packs=packs,
            bounds=dict(minX=min(xs) * 3000, maxX=(max(xs) + 1) * 3000, minZ=min(zs) * 3000, maxZ=(max(zs) + 1) * 3000),
            roads=core_edges, nodes=core_nodes, metro=metro, places=places, theatres=pois['theatres'], food=pois['food'], drops=pois['drops'],
            attribution=['Map data © OpenStreetMap contributors (ODbL 1.0) via Overture Maps', 'Overture Maps Places (CDLA-Permissive-2.0)',
                         'Foursquare OS Places (Apache-2.0)', 'Google Open Buildings / Microsoft ML Buildings via Overture (CC BY 4.0 / ODbL)',
                         'Roadster repository world data (heights, metro, flyover profiles)', 'Mapillary contributors (CC-BY-SA 4.0): shop names read from street photos and board checks'])
blob = gzip.compress(json.dumps(core, separators=(',', ':'), ensure_ascii=False).encode(), 7)
open(os.path.join(OUT, 'core.pack.wasm'), 'wb').write(blob)
print('core', round(len(blob) / 1e6, 2), 'MB gz', round(time.time() - t0), 's')

# map: every road, simplified, grouped by style; big parks and lakes
groups = defaultdict(list)
def style(e):
    if e['elev'] and max(e['elev']) > 1.2: return 'elev'
    if e['cls'] in ('motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link'): return 'major'
    if e['cls'] in ('tertiary', 'tertiary_link'): return 'ter'
    return 'minor'
for e in D['edges']:
    g = shapely.simplify(LineString(e['pts']), 3.0)
    flat = []
    for x, z in g.coords: flat += [int(round(x)), int(round(z))]
    groups[style(e)].append(flat)
areas = []
con = duckdb.connect(); con.execute("INSTALL spatial; LOAD spatial;")
for tbl, kind in (('overture_land_use', 'park'), ('overture_water', 'water')):
    for sub, cls, wkb in con.execute(f"SELECT subtype, class, wkb FROM '{RAW}/{tbl}.parquet'").fetchall():
        if kind == 'park' and not any(k in f'{sub} {cls}' for k in ('park', 'grass', 'garden', 'recreation', 'forest', 'meadow', 'stadium', 'golf')): continue
        gm = shapely.from_wkb(wkb)
        gm = shapely.transform(gm, lambda c: np.column_stack([(c[:, 0] - LON0) * KX, -(c[:, 1] - LAT0) * KZ]))
        for q in (gm.geoms if hasattr(gm, 'geoms') else [gm]):
            if q.geom_type != 'Polygon' or q.area < 3000: continue
            r = shapely.simplify(q, 8).exterior.coords
            flat = []
            for x, z in r: flat += [int(round(x)), int(round(z))]
            areas.append(dict(k=kind, r=flat))
mp = dict(roads=groups, areas=areas, metro=[[int(round(v)) for p in l['pts'] for v in p] for l in metro['lines']])
blob = gzip.compress(json.dumps(mp, separators=(',', ':')).encode(), 7)
open(os.path.join(OUT, 'map.pack.wasm'), 'wb').write(blob)
print('map', round(len(blob) / 1e6, 2), 'MB gz', {k: len(v) for k, v in groups.items()}, 'areas', len(areas), round(time.time() - t0), 's')
