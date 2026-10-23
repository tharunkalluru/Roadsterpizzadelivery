"""City step 2: export the whole ORR area as streamable map tiles for the game.

Tiles are 1 km squares in the game's local frame (origin RTC X Roads, x east, z south); 3x3 tiles are packed into one
gzip file (served as *.pack.wasm because the test host only serves standard web types). Each tile carries its roads
(plus 'context' roads just across its border so kerbs and trimming know about crossings), buildings with heights,
shop boards placed on their facades, street furniture, parks and water.
core.json (also packed) carries what the game needs everywhere: main-road network for GPS, metro, neighbourhood
names, cinemas, food pickups and drop-off points with pre-snapped kerb stops. map.pack.wasm has every road for the map.

Resumable: finished packs are skipped. Run: python3 export_city.py [workers]
"""
import gzip, json, math, os, pickle, random, re, sys, time, glob
from collections import defaultdict
import duckdb, numpy as np, shapely
from shapely.geometry import LineString, Polygon, Point, box
from shapely.strtree import STRtree
from shapely.ops import unary_union
from pickup_policy import pickup_eligible

HERE = os.path.dirname(__file__)
RAW, BUILD = os.path.join(HERE, 'raw'), os.path.join(HERE, 'build')
REPO = os.environ.get('REPO', '/home/claude/repo/rpd/game')
OUT = os.environ.get('OUT', '/home/claude/p2ph/game/public/city')
POIS = os.path.join(BUILD, 'city_pois'); os.makedirs(POIS, exist_ok=True)
os.makedirs(os.path.join(OUT, 'packs'), exist_ok=True)
T, PK = 1000.0, 3                                   # tile size (m), tiles per pack side
NR, MR = 6380050.094, 6341141.900
D = pickle.load(open(os.path.join(BUILD, 'city_edges.pkl'), 'rb'))
LAT0, LON0 = D['origin']
KX = math.cos(math.radians(LAT0)) * NR * math.pi / 180
KZ = MR * math.pi / 180
def to_xz(lat, lon): return (round((lon - LON0) * KX, 1), round(-(lat - LAT0) * KZ, 1))
def to_ll(x, z): return (LAT0 - z / KZ, LON0 + x / KX)
CITY = (17.20, 78.20, 17.62, 78.70)
MAJOR = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
STREET = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'unclassified', 'residential'}
t0 = time.time()
def log(*a): print(*a, round(time.time() - t0), 's', flush=True)

# ---------------- global indexes ----------------
edges = D['edges']; nodes = D['nodes']
for e in edges:
    p = e['pts']; m = p[len(p) // 2]
    e['_mid'] = (m[0], m[1])
    xs = [q[0] for q in p]; zs = [q[1] for q in p]
    e['_bb'] = (min(xs), min(zs), max(xs), max(zs))
    e['_deck'] = bool(e['elev']) and max(e['elev']) > 1.2
egeom = [LineString(e['pts']) for e in edges]
etree = STRtree(egeom)
log('edges indexed', len(edges))

repo_heights = {}
for f in glob.glob(f'{REPO}/public/world/hyd-metro/v2/chunks/*.json'):
    for b in json.load(open(f))['buildings']:
        if b.get('osmId') and b.get('heightM'): repo_heights[b['osmId'].replace('way/', 'w').replace('relation/', 'r')] = b['heightM']
log('repo heights', len(repo_heights))

pl_by_bld = defaultdict(list)
for p in json.load(open(os.path.join(BUILD, 'placements.json'))):
    if p.get('status') != 'placed' or p.get('flags') or 'slot' not in p or p['place_conf'] < 0.35: continue
    pl_by_bld[p['building'][:12]].append(dict(uid=p['uid'], name=p['name'], board=p['board'], group=p['group'], tier=p['tier'], conf=p['place_conf'],
                                              fll=p['facade_ll'], t=p['facade']['t'], slot=p['slot'], road=p.get('road_name'),
                                              category=p.get('category'), source_ids=p.get('source_ids', []), sources=p.get('sources', [])))
ocr = json.load(open(os.path.join(BUILD, 'ocr_matches.json'))) if os.path.exists(os.path.join(BUILD, 'ocr_matches.json')) else {}
log('placed boards', sum(len(v) for v in pl_by_bld.values()), 'ocr', len(ocr))

con0 = duckdb.connect(); con0.execute("INSTALL spatial; LOAD spatial;")
infra = []
for sub, cls, name, wkt in con0.execute(f"SELECT subtype, class, name, ST_AsText(ST_GeomFromWKB(wkb)) FROM '{RAW}/overture_infrastructure.parquet'").fetchall():
    if not wkt.startswith('POINT'): continue
    g = shapely.from_wkt(wkt)
    if cls in ('traffic_signals', 'bus_stop', 'bus_station', 'street_lamp', 'water_tower', 'artwork', 'bench', 'atm', 'crossing'):
        x, z = to_xz(g.y, g.x); infra.append(dict(kind=cls, name=name, p=[x, z]))
# synthesize signals at busy junctions that OSM hasn't tagged (2+ named main roads meeting, 3+ arms)
sig = [f['p'] for f in infra if f['kind'] == 'traffic_signals']
sig_tree = STRtree([Point(p) for p in sig]) if sig else None
inc = defaultdict(list)
for e in edges:
    if e['_deck']: continue
    for end in ('from', 'to'):
        if e[end]: inc[e[end]].append(e)
synth = 0
for n, es in inc.items():
    big = [e for e in es if e['cls'] in ('trunk', 'primary', 'secondary')]
    names = {e['name'] for e in big if e['name']}
    if len(es) < 3 or not ((len(big) >= 4 and len(names) >= 2) or (len(big) >= 3 and len(names) >= 3)): continue
    p = nodes[n]
    if sig_tree is not None and len(sig_tree.query(Point(p).buffer(220))): continue
    infra.append(dict(kind='traffic_signals', name=None, p=[p[0] + 4, p[1] + 4], synth=1)); sig.append(p); synth += 1
    sig_tree = STRtree([Point(q) for q in sig])
log('furniture', len(infra), 'synthesized signals', synth)
itree = STRtree([Point(f['p']) for f in infra])

areas_all = []
for tbl, kind in (('overture_land_use', 'landuse'), ('overture_water', 'water')):
    for sub, cls, name, wkb in con0.execute(f"SELECT subtype, class, name, wkb FROM '{RAW}/{tbl}.parquet'").fetchall():
        g = shapely.from_wkb(wkb)
        g = shapely.transform(g, lambda c: np.column_stack([(c[:, 0] - LON0) * KX, -(c[:, 1] - LAT0) * KZ]))
        if not g.is_valid: g = g.buffer(0)
        areas_all.append((kind, sub, cls, name, g))
atree = STRtree([a[4] for a in areas_all])
log('areas', len(areas_all))

# ---------------- per pack ----------------
def tile_of(x, z): return (math.floor(x / T), math.floor(z / T))
xmin, zmin = to_xz(CITY[2], CITY[1]); xmax, zmax = to_xz(CITY[0], CITY[3])
I0, I1 = math.floor(xmin / T), math.floor(xmax / T)
J0, J1 = math.floor(zmin / T), math.floor(zmax / T)
PACKS = [(pi, pj) for pi in range(math.floor(I0 / PK), math.floor(I1 / PK) + 1) for pj in range(math.floor(J0 / PK), math.floor(J1 / PK) + 1)]

def slim_edge(e, ctx=False):
    d = dict(id=e['id'], cls=e['cls'], w=e['w'], oneway=e['oneway'], pts=e['pts'], elev=e['elev'], **{'from': e['from'], 'to': e['to']})
    if ctx: d['ctx'] = 1
    else: d.update(name=e['name'], lanes=e['lanes'], maxspeed=e['maxspeed'])
    return d

def do_pack(pk):
    pi, pj = pk
    out = os.path.join(OUT, 'packs', f'p{pi}_{pj}.pack.wasm')
    if os.path.exists(out) and os.path.exists(os.path.join(POIS, f'p{pi}_{pj}.json')): return None
    con = duckdb.connect()
    rnd = random.Random(pi * 1000 + pj)
    x0, z0 = pi * PK * T, pj * PK * T
    x1, z1 = x0 + PK * T, z0 + PK * T
    # buildings for the pack (by centroid)
    (la_n, lo_w), (la_s, lo_e) = to_ll(x0, z0), to_ll(x1, z1)
    bl = con.execute(f"""SELECT id, class, subtype, height, num_floors, facade_color, roof_color, sources, wkb
        FROM '{RAW}/overture_buildings.parquet' WHERE cx BETWEEN {lo_w} AND {lo_e} AND cy BETWEEN {la_s} AND {la_n} AND NOT coalesce(is_underground, false)""").fetchall()
    tiles = {}
    pois = dict(food=[], theatres=[], drops=[])
    pk_box = box(x0 - 60, z0 - 60, x1 + 60, z1 + 60)
    pe = [edges[i] for i in etree.query(pk_box)]
    bt = defaultdict(list)
    for bid, cls, sub, h, nf, fcol, rcol, sources, wkb in bl:
        g = shapely.from_wkb(wkb)
        g = shapely.transform(g, lambda c: np.column_stack([(c[:, 0] - LON0) * KX, -(c[:, 1] - LAT0) * KZ]))
        for poly in (g.geoms if hasattr(g, 'geoms') else [g]):
            if poly.geom_type != 'Polygon' or poly.area < 6: continue
            c = poly.centroid
            ti = tile_of(c.x, c.y)
            osm = next((s['record_id'].split('@')[0] for s in sources or [] if s.get('dataset') == 'OpenStreetMap' and s.get('record_id')), None)
            area = poly.area
            if h: height = float(h)
            elif nf: height = nf * 3.2 + 0.6
            elif osm and osm in repo_heights: height = float(repo_heights[osm])
            else:
                base = 6.5 if area < 60 else 9.5 if area < 180 else 13.0 if area < 600 else 16.0
                height = round(base + rnd.uniform(-1.5, 3.5), 1)
            bt[ti].append(dict(id=bid[:12], cls=cls or sub, h=round(min(max(height, 3.2), 150), 1), poly=shapely.simplify(poly, 0.3), fc=fcol, rc=rcol))
    for ii in range(PK):
        for jj in range(PK):
            ti = (pi * PK + ii, pj * PK + jj)
            tx0, tz0 = ti[0] * T, ti[1] * T
            tb = box(tx0, tz0, tx0 + T, tz0 + T)
            own = [e for e in pe if tx0 <= e['_mid'][0] < tx0 + T and tz0 <= e['_mid'][1] < tz0 + T]
            ctx = [e for e in pe if e not in own and not (e['_bb'][2] < tx0 - 45 or e['_bb'][0] > tx0 + T + 45 or e['_bb'][3] < tz0 - 45 or e['_bb'][1] > tz0 + T + 45)]
            blds = bt.get(ti, [])
            if not own and not blds: continue
            # trim buildings out of road corridors
            corr = []
            for e in own + ctx:
                if e['_deck']: continue
                corr.append(LineString(e['pts']).buffer(e['w'] / 2 + (2.2 if e['cls'] in MAJOR else 0.5), cap_style=2, join_style=2))
            ctree = STRtree(corr) if corr else None
            kept, trimmed = [], set()
            for b in blds:
                poly = b['poly']
                if not poly.is_valid: poly = poly.buffer(0)
                if poly.is_empty or poly.geom_type != 'Polygon': continue
                if ctree is not None:
                    hits = ctree.query(poly, predicate='intersects')
                    if len(hits):
                        rem = poly.difference(unary_union([corr[i] for i in hits]))
                        if rem.is_empty: continue
                        if rem.geom_type != 'Polygon': rem = max(rem.geoms, key=lambda q: q.area)
                        if rem.area < 0.35 * poly.area or rem.area < 12: continue
                        if rem.area < poly.area * 0.995: poly = shapely.simplify(rem, 0.25); trimmed.add(b['id'])
                b['poly'] = poly; kept.append(b)
            bpoly = {b['id']: b['poly'] for b in kept}
            # boards on facades (re-snapped where a footprint was trimmed)
            boards = []
            for b in kept:
                for p in pl_by_bld.get(b['id'], []):
                    (la, lo), (lb, lob) = p['fll']
                    ax, az = to_xz(la, lo); bx, bz = to_xz(lb, lob)
                    if b['id'] in trimmed or True:
                        rs = resnap(bpoly[b['id']], (ax, az), (bx, bz))
                        if rs is None: continue
                        (ax, az), (bx, bz) = rs
                    o = ocr.get(p['uid']) or {}
                    boards.append(dict(id=p['uid'], text=p['board'], full=p['name'], group=p['group'], tier=p['tier'], conf=p['conf'],
                                       a=[ax, az], b=[bx, bz], t=p['t'], slot=p['slot'], building=b['id'], road=p['road'],
                                       seen=o.get('seen'), seen_year=o.get('year'), category=p['category'],
                                       source_ids=p['source_ids'], sources=p['sources']))
            buildings = []
            for b in kept:
                ring = [[round(x, 1), round(z, 1)] for x, z in list(b['poly'].exterior.coords)[:-1]]
                if len(ring) < 3: continue
                d = dict(id=b['id'], h=b['h'], ring=ring)
                if b['cls']: d['cls'] = b['cls']
                if b['fc']: d['fc'] = b['fc']
                if b['rc']: d['rc'] = b['rc']
                buildings.append(d)
            furn = [dict(infra[i]) for i in itree.query(tb) if tx0 <= infra[i]['p'][0] < tx0 + T and tz0 <= infra[i]['p'][1] < tz0 + T]
            areas = []
            for i in atree.query(tb):
                kind, sub, cls, name, g = areas_all[i]
                q = g.intersection(tb)
                for pq in (q.geoms if hasattr(q, 'geoms') else [q]):
                    if pq.geom_type == 'Polygon' and pq.area > 40:
                        areas.append(dict(kind=kind, sub=sub, cls=cls, name=name, ring=[[round(x, 1), round(z, 1)] for x, z in list(shapely.simplify(pq, 0.5).exterior.coords)[:-1]]))
            rn = {}
            for e in own + ctx:
                for end, k in (('from', 0), ('to', -1)):
                    if e[end] and e[end] not in rn: rn[e[end]] = e['pts'][k]
            tiles[f'{ti[0]}_{ti[1]}'] = dict(i=ti[0], j=ti[1], roads=[slim_edge(e) for e in own] + [slim_edge(e, True) for e in ctx], nodes=rn,
                                             buildings=buildings, boards=boards, furniture=furn, areas=areas)
            # gameplay points with pre-snapped kerb stops
            street = [e for e in own + ctx if e['cls'] in STREET and not e['_deck'] and not (e['cls'] in ('service', 'living_street') and e['w'] < 5)]
            sg = [LineString(e['pts']) for e in street]
            stree = STRtree(sg) if sg else None
            def stop_near(x, z, toward=None, maxd=60):
                if stree is None: return None
                pt = Point(x, z)
                i = stree.nearest(pt)
                if i is None: return None
                if sg[i].distance(pt) > maxd: return None
                e = street[i]; q = sg[i].interpolate(sg[i].project(pt))
                px, pz = q.x, q.y
                if toward:
                    vx, vz = toward[0] - px, toward[1] - pz; L = math.hypot(vx, vz) or 1
                    off = min(e['w'] / 2 - 1.2, L)
                    if off > 0: px += vx / L * off; pz += vz / L * off
                return [round(px, 1), round(pz, 1), 0, e['name'] or '']
            for bd in boards:
                ax, az = bd['a']; bx, bz = bd['b']; fx, fz = ax + (bx - ax) * bd['t'], az + (bz - az) * bd['t']
                if pickup_eligible(bd):
                    st = stop_near(fx, fz, (fx, fz))
                    if st: pois['food'].append(dict(id=bd['id'], name=bd['full'], board=bd['text'], stop=st, pizza=('pizza' in bd['full'].lower()), tile=[ti[0], ti[1]],
                                                   category=bd['category'], source_ids=bd['source_ids'], sources=bd['sources'], pickupEligible=True))
                if bd['group'] == 'cinema' and bd['conf'] >= 0.45:
                    st = stop_near(fx, fz, (fx, fz))
                    if st: pois['theatres'].append(dict(id=bd['id'], name=bd['full'], board=bd['text'], a=bd['a'], b=bd['b'], t=bd['t'], stop=st, tile=[ti[0], ti[1]]))
            with_boards = {bd['building'] for bd in boards}
            cand = [b for b in buildings if b['id'] not in with_boards and 7 <= b['h'] <= 30]
            rnd.shuffle(cand)
            for b in cand[:max(3, min(40, len(cand) // 12))]:
                c = Polygon(b['ring']).centroid
                st = stop_near(c.x, c.y, (c.x, c.y), 45)
                if st: pois['drops'].append(st)
    blob = json.dumps(dict(pack=[pi, pj], tiles=tiles), separators=(',', ':'), ensure_ascii=False).encode()
    tmp = out + '.tmp'
    with open(tmp, 'wb') as f: f.write(gzip.compress(blob, 6))
    os.replace(tmp, out)
    json.dump(pois, open(os.path.join(POIS, f'p{pi}_{pj}.json'), 'w'), ensure_ascii=False)
    return (pk, len(tiles), sum(len(t['buildings']) for t in tiles.values()), sum(len(t['boards']) for t in tiles.values()), round(os.path.getsize(out) / 1e6, 2))

def resnap(poly, a, bb):
    ang0 = math.atan2(bb[1] - a[1], bb[0] - a[0]); mid = Point((a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2)
    cs = list(poly.exterior.coords); best = None
    for i in range(len(cs) - 1):
        p, q = cs[i], cs[i + 1]; L = math.dist(p, q)
        if L < 1.5: continue
        ang = math.atan2(q[1] - p[1], q[0] - p[0]); da = abs((ang - ang0 + math.pi / 2) % math.pi - math.pi / 2)
        if da > 0.5: continue
        d = LineString([p, q]).distance(mid)
        if best is None or d < best[0]: best = (d, p, q)
    if best is None or best[0] > 14: return None
    return [round(best[1][0], 1), round(best[1][1], 1)], [round(best[2][0], 1), round(best[2][1], 1)]

if __name__ == '__main__':
    import multiprocessing as mp
    W = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    only = os.environ.get('ONLY')                 # e.g. "0_0" to export a single pack
    todo = [p for p in PACKS if not only or f'{p[0]}_{p[1]}' == only]
    # nearest-first from RTC X Roads so the playable middle is ready early
    todo.sort(key=lambda p: abs(p[0] * PK + 1.5) + abs(p[1] * PK + 1.5))
    log('packs', len(todo))
    ctxm = mp.get_context('fork')
    with ctxm.Pool(W) as pool:
        for r in pool.imap_unordered(do_pack, todo):
            if r: log('pack', *r)
    log('all packs done')
