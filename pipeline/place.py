"""Step 1c: put every merged business on a real building front, facing the road it belongs to.

For each business: containing (or nearest) building -> the road it most likely fronts (address street name wins,
else nearest drivable ground-level road) -> the facade edge that faces that road -> position along that edge ->
floor (ground / upper) -> side of road and distance along the road.
Also scores coverage for every drivable road segment.

Runs tile by tile to stay inside memory. Outputs build/placements.json, build/coverage.json, build/place_report.json
"""
import json, math, os, re, sys, time
from collections import Counter, defaultdict
import duckdb
import numpy as np
import shapely
from shapely import wkb as swkb
from shapely.geometry import Point, LineString, Polygon

HERE = os.path.dirname(__file__)
RAW, BUILD = os.path.join(HERE, 'raw'), os.path.join(HERE, 'build')
CITY = (17.20, 78.20, 17.62, 78.70)
TILE = 0.05
MARGIN = 0.0012
DRIVABLE = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street',
            'service', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'unknown'}
ONLY = sys.argv[1] if len(sys.argv) > 1 else None   # 'hero' to run just the RTC X Roads zone quickly
HERO = (17.388, 78.478, 17.416, 78.508)

# ---------- board names ----------
LOCALITIES = ['rtc x roads', 'rtc cross roads', 'chikkadpally', 'narayanaguda', 'himayatnagar', 'himayat nagar', 'ashok nagar', 'musheerabad',
 'kachiguda', 'barkatpura', 'nallakunta', 'vidyanagar', 'amberpet', 'koti', 'abids', 'nampally', 'basheerbagh', 'lakdikapul', 'lakdi ka pul',
 'khairatabad', 'somajiguda', 'punjagutta', 'panjagutta', 'ameerpet', 'sr nagar', 's r nagar', 'begumpet', 'secunderabad', 'paradise', 'sainikpuri',
 'tarnaka', 'habsiguda', 'uppal', 'nagole', 'lb nagar', 'l b nagar', 'dilsukhnagar', 'malakpet', 'chaderghat', 'charminar', 'mehdipatnam',
 'tolichowki', 'banjara hills', 'jubilee hills', 'madhapur', 'hitech city', 'hitec city', 'gachibowli', 'kondapur', 'kukatpally', 'kphb',
 'miyapur', 'chandanagar', 'lingampally', 'manikonda', 'attapur', 'shamshabad', 'kompally', 'alwal', 'bowenpally', 'trimulgherry', 'ecil',
 'kapra', 'malkajgiri', 'moula ali', 'ramanthapur', 'boduppal', 'vanasthalipuram', 'hayathnagar', 'saroornagar', 'kothapet', 'chaitanyapuri',
 'masab tank', 'lb stadium', 'marredpally', 'west marredpally', 'yousufguda', 'erragadda', 'borabanda', 'moosapet', 'balanagar', 'jeedimetla',
 'nizampet', 'bachupally', 'kokapet', 'narsingi', 'raidurg', 'film nagar', 'sanath nagar', 'tank bund', 'domalguda', 'gandhi nagar', 'kavadiguda',
 'bholakpur', 'golnaka', 'shivam road', 'nallakunta', 'adikmet', 'osmania university', 'ou', 'begum bazar', 'sultan bazar', 'mozamjahi market']
LOC_RX = re.compile(r'\b(' + '|'.join(sorted({re.escape(l) for l in LOCALITIES}, key=len, reverse=True)) + r')\b', re.I)

def board_name(name):
    n = name.strip()
    n = re.split(r'\s[|•]\s|\s\|\s?|\s[-–—]\s(?=[A-Z0-9a-z ,.&()]+$)', n)[0] if re.search(r'\s[|•–—-]\s', n) else n
    n = re.sub(r'\s*\((?:[^)]*)\)\s*$', '', n)
    n = LOC_RX.sub('', n) if len(LOC_RX.sub('', n).strip()) >= 3 else n
    n = re.sub(r'[,\-–\s]+$', '', re.sub(r'\s{2,}', ' ', n)).strip(' ,-')
    if n.isupper() and len(n) > 3: pass
    return n[:48] if n else name[:48]

# ---------- inputs ----------
con = duckdb.connect()
B = json.load(open(os.path.join(BUILD, 'businesses.json')))
print('businesses', len(B), flush=True)

# locality centroids from the data itself (median position of businesses naming the locality)
loc_pts = defaultdict(list)
for b in B:
    for m in LOC_RX.findall(b['name']): loc_pts[m.lower().replace('  ', ' ')].append((b['lat'], b['lon']))
loc_c = {k: (float(np.median([p[0] for p in v])), float(np.median([p[1] for p in v]))) for k, v in loc_pts.items() if len(v) >= 5}

def mdist(lat1, lon1, lat2, lon2):
    return math.hypot((lat1 - lat2) * 110574, (lon1 - lon2) * 111320 * math.cos(math.radians(lat1)))

def parse_levels(level_rules, road_flags):
    elevated = False
    for r in (level_rules or []):
        if (r.get('value') or 0) > 0 and not r.get('between'): elevated = True
    for f in (road_flags or []):
        if 'is_bridge' in (f.get('values') or []) and not f.get('between'): elevated = True
        if 'is_tunnel' in (f.get('values') or []) and not f.get('between'): elevated = True
    return elevated

placements, coverage = [], []
stats = Counter()

def tiles():
    if ONLY == 'hero':
        yield HERO; return
    y = CITY[0]
    while y < CITY[2] - 1e-9:
        x = CITY[1]
        while x < CITY[3] - 1e-9:
            yield (y, x, min(y + TILE, CITY[2]), min(x + TILE, CITY[3])); x += TILE
        y += TILE

t0 = time.time()
for ti, (s, w, n, e) in enumerate(tiles()):
    lat0, lon0 = (s + n) / 2, (w + e) / 2
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574.0
    def P(lon, lat): return ((lon - lon0) * kx, (lat - lat0) * ky)
    def proj(geom): return shapely.transform(geom, lambda c: np.column_stack([(c[:, 0] - lon0) * kx, (c[:, 1] - lat0) * ky]))
    biz = [b for b in B if s <= b['lat'] < n and w <= b['lon'] < e]
    if not biz: continue
    bl = con.execute(f"""SELECT id, wkb, height, num_floors, name FROM '{RAW}/overture_buildings.parquet'
        WHERE cx BETWEEN {w - MARGIN} AND {e + MARGIN} AND cy BETWEEN {s - MARGIN} AND {n + MARGIN} AND NOT coalesce(is_underground, false)""").fetchall()
    rd = con.execute(f"""SELECT id, name, class, level_rules, road_flags, wkb FROM '{RAW}/overture_segments.parquet'
        WHERE subtype = 'road'""" ).fetchall() if False else None
    rd = con.execute(f"""SELECT id, name, class, level_rules, road_flags, wkb FROM '{RAW}/overture_segments.parquet'
        WHERE subtype = 'road' AND ST_Intersects(ST_GeomFromWKB(wkb), ST_MakeEnvelope({w - MARGIN}, {s - MARGIN}, {e + MARGIN}, {n + MARGIN}))""").fetchall() if ti == -1 else None
    if rd is None:
        con.execute("INSTALL spatial; LOAD spatial;")
        rd = con.execute(f"""SELECT id, name, class, level_rules, road_flags, wkb FROM '{RAW}/overture_segments.parquet'
            WHERE subtype = 'road' AND ST_Intersects(ST_GeomFromWKB(wkb), ST_MakeEnvelope({w - MARGIN}, {s - MARGIN}, {e + MARGIN}, {n + MARGIN}))""").fetchall()
    bpolys = proj(shapely.from_wkb([r[1] for r in bl])) if bl else np.array([])
    bpolys = np.array([g if g.geom_type == 'Polygon' else max(g.geoms, key=lambda q: q.area) if hasattr(g, 'geoms') else g for g in bpolys])
    roads = [r for r in rd if r[2] in DRIVABLE]
    rgeom = proj(shapely.from_wkb([r[5] for r in roads])) if roads else np.array([])
    relev = [parse_levels(r[3], r[4]) for r in roads]
    ground_idx = np.array([i for i, el in enumerate(relev) if not el], dtype=int)
    btree = shapely.STRtree(bpolys) if len(bpolys) else None
    rtree = shapely.STRtree(rgeom[ground_idx]) if len(ground_idx) else None
    rname = [(r[1] or '').lower() for r in roads]

    pts = shapely.points([P(b['lon'], b['lat']) for b in biz])
    inside = btree.query(pts, predicate='within') if btree is not None else np.empty((2, 0), int)
    cont = {}
    for pi, bi in zip(*inside):
        if pi not in cont or bpolys[bi].area < bpolys[cont[pi]].area: cont[pi] = bi   # smallest containing footprint
    near_b = btree.query_nearest(pts, max_distance=30, return_distance=True) if btree is not None else (np.empty((2, 0), int), [])
    nearest = {}
    for (pi, bi), d in zip(near_b[0].T, near_b[1]):
        if pi not in nearest or d < nearest[pi][1]: nearest[pi] = (bi, d)

    facade_load = defaultdict(list)
    for pi, b in enumerate(biz):
        stats['seen'] += 1
        rec = dict(uid=b['uid'], name=b['name'], board=board_name(b['name']), group=b['group'], tier=b['tier'], floor=b['floor'],
                   lat=b['lat'], lon=b['lon'], sources=b['sources'], confidence=b['confidence'])
        # locality sanity check: a name that says "Begumpet" but sits 3+ km from Begumpet is probably a mis-placed listing
        flags = []
        for m in LOC_RX.findall(b['name']):
            c = loc_c.get(m.lower())
            if c and mdist(b['lat'], b['lon'], *c) > 3000: flags.append('locality_mismatch:' + m.lower())
        if b['group'] in ('person',): flags.append('person_listing')
        if pi in cont: bi, how, bd = cont[pi], 'inside', 0.0
        elif pi in nearest: bi, how, bd = nearest[pi][0], 'nearest', nearest[pi][1]
        else:
            rec.update(status='no_building', flags=flags); placements.append(rec); stats['no_building'] += 1; continue
        poly = bpolys[bi]
        if rtree is None:
            rec.update(status='no_road', flags=flags); placements.append(rec); stats['no_road'] += 1; continue
        # roads near the building
        cand = rtree.query(poly.buffer(45))
        if len(cand) == 0:
            rec.update(status='no_road', flags=flags, building=bl[bi][0]); placements.append(rec); stats['no_road'] += 1; continue
        cand = ground_idx[cand]
        addr = (b.get('addr') or '').lower()
        def score(ri):
            d = rgeom[ri].distance(poly)
            nm = rname[ri]
            bonus = -25 if nm and len(nm) > 3 and (nm in addr or nm.split(' road')[0] in addr) else 0
            cls = roads[ri][2]
            cls_bonus = {'trunk': -6, 'primary': -6, 'secondary': -4, 'tertiary': -2}.get(cls, 0) if b['floor'] != 'upper' else 0
            return d + bonus + cls_bonus
        ri = min(cand, key=score)
        road = rgeom[ri]
        # facade edge facing that road
        ext = shapely.simplify(poly, 0.4).exterior
        cs = np.asarray(ext.coords)
        area_sign = 1 if Polygon(cs).exterior.is_ccw else -1
        best = None
        for k in range(len(cs) - 1):
            a, c = cs[k], cs[k + 1]
            L = float(np.hypot(*(c - a)))
            if L < 2.0: continue
            mid = (a + c) / 2
            nrm = np.array([(c - a)[1], -(c - a)[0]]) / L * area_sign      # outward normal for a CCW ring
            q = road.interpolate(road.project(Point(mid)))
            to_road = np.array([q.x, q.y]) - mid
            dist = float(np.hypot(*to_road)) + 1e-6
            facing = float(np.dot(nrm, to_road / dist))
            if facing < 0.25: continue
            sc = dist - 6 * facing - min(L, 20) * 0.15
            if best is None or sc < best[0]: best = (sc, k, a, c, L, dist, nrm)
        if best is None:
            rec.update(status='no_facade', flags=flags, building=bl[bi][0]); placements.append(rec); stats['no_facade'] += 1; continue
        _, k, a, c, L, dist_to_road, nrm = best
        p = np.array(P(b['lon'], b['lat']))
        tpar = float(np.clip(np.dot(p - a, c - a) / (L * L), 0.08, 0.92))
        fpt = a + (c - a) * tpar
        # side of road and chainage
        along = road.project(Point(fpt))
        q0 = road.interpolate(max(0, along - 1)); q1 = road.interpolate(min(road.length, along + 1))
        dvec = np.array([q1.x - q0.x, q1.y - q0.y])
        side = 'left' if (dvec[0] * (fpt[1] - q0.y) - dvec[1] * (fpt[0] - q0.x)) > 0 else 'right'
        h = bl[bi][2]; nf = bl[bi][3]
        conf = {'A': 0.8, 'B': 0.6, 'C': 0.4}[b['tier']] + (0.1 if how == 'inside' else -0.05 * min(bd / 10, 2)) - (0.1 if dist_to_road > 30 else 0)
        if flags: conf -= 0.35
        rec.update(status='placed', how=how, building=bl[bi][0], building_height=h, building_floors=nf,
                   road=roads[ri][0], road_name=roads[ri][1], road_class=roads[ri][2], side=side, chainage_m=round(along, 1),
                   facade=dict(a=[round(float(v), 2) for v in a], b=[round(float(v), 2) for v in c], len=round(L, 1), t=round(tpar, 3)),
                   facade_ll=[[round(a[1] / ky + lat0, 7), round(a[0] / kx + lon0, 7)], [round(c[1] / ky + lat0, 7), round(c[0] / kx + lon0, 7)]],
                   dist_to_road=round(dist_to_road, 1), flags=flags, place_conf=round(max(0.05, min(conf, 0.98)), 2), tile=ti)
        facade_load[(bi, k)].append(rec)
        placements.append(rec); stats['placed'] += 1

    # slot boards along each facade: ground-floor shops share the frontage, others stack upwards
    for (bi, k), rs in facade_load.items():
        good = [r for r in rs if not r['flags']]
        ground = sorted([r for r in good if r['floor'] != 'upper'], key=lambda r: r['facade']['t'])
        upper = sorted([r for r in good if r['floor'] == 'upper'], key=lambda r: -r['place_conf'])
        L = rs[0]['facade']['len']
        slots = max(1, int(L // 3.2))
        for j, r in enumerate(ground[:slots]):
            r['slot'] = dict(floor=0, index=j, of=min(len(ground), slots))
        for r in ground[slots:]: r['slot'] = dict(floor=1 + (len(upper) > 0), index=0, of=1, overflow=True)
        nf = rs[0].get('building_floors') or max(1, round((rs[0].get('building_height') or 9) / 3.2))
        for j, r in enumerate(upper): r['slot'] = dict(floor=1 + j // max(1, slots), index=j % max(1, slots), of=min(len(upper), slots))

    # coverage per drivable road segment in this tile
    placed_by_road = defaultdict(list)
    for r in placements:
        if r.get('tile') == ti and r.get('status') == 'placed' and not r['flags']: placed_by_road[r['road']].append(r)
    for i, r in enumerate(roads):
        g = rgeom[i]
        mid = g.interpolate(0.5, normalized=True)
        if not (s <= mid.y / ky + lat0 < n and w <= mid.x / kx + lon0 < e): continue
        L = g.length
        if L < 5: continue
        fr = btree.query(g.buffer(22)) if btree is not None else []
        front = len(fr)
        boards = placed_by_road.get(r[0], [])
        strong = sum(1 for q in boards if q['place_conf'] >= 0.6)
        dens = strong / max(L, 1) * 100
        if front == 0: status = 'open'                 # no buildings along it: parks, flyovers, open land
        elif dens >= 2.0 or (strong >= 3 and dens >= 1.0): status = 'green'
        elif boards: status = 'amber'
        else: status = 'red'
        coverage.append(dict(road=r[0], name=r[1], cls=r[2], elevated=relev[i], length_m=round(L, 1), buildings_along=front,
                             boards=len(boards), strong=strong, per100m=round(dens, 2), status=status,
                             coords=[[round(c[1] / ky + lat0, 6), round(c[0] / kx + lon0, 6)] for c in np.asarray(shapely.simplify(g, 2).coords)]))
    print(f'tile {ti} biz {len(biz)} bldg {len(bl)} roads {len(roads)} placed {stats["placed"]} {round(time.time() - t0)}s', flush=True)

suffix = '_hero' if ONLY == 'hero' else ''
json.dump(placements, open(os.path.join(BUILD, f'placements{suffix}.json'), 'w'), ensure_ascii=False)
json.dump(coverage, open(os.path.join(BUILD, f'coverage{suffix}.json'), 'w'), ensure_ascii=False)
cs = Counter(c['status'] for c in coverage)
lens = defaultdict(float)
for c in coverage: lens[c['status']] += c['length_m']
rep = dict(stats=stats, flagged=sum(1 for p in placements if p.get('flags')),
           road_segments=cs, road_km={k: round(v / 1000, 1) for k, v in lens.items()}, seconds=round(time.time() - t0))
json.dump(rep, open(os.path.join(BUILD, f'place_report{suffix}.json'), 'w'), indent=1)
print(json.dumps(rep, indent=1))
