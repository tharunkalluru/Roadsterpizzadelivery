"""Step 2a: export one playable zone (default: RTC X Roads hero zone) from the pipeline data into the game's zone.json.

Local frame: metres on a tangent plane at ORIGIN. x = east, z = south (three.js convention, z = -north).
Includes: road network split at connectors (with flyover elevation profiles), buildings with heights, placed shop boards,
street furniture (signals, bus stops, lamps, crossings), metro line + pillars + stations, parks/water, gameplay POIs.
"""
import gzip, json, math, os, sys, random
from collections import defaultdict
import duckdb, numpy as np, shapely
from shapely.geometry import LineString, Polygon, Point

HERE = os.path.dirname(__file__)
RAW, BUILD = os.path.join(HERE, 'raw'), os.path.join(HERE, 'build')
REPO = os.environ.get('REPO', '/home/claude/repo/rpd/game')
ZONE = dict(id='rtc', name='RTC X Roads', bbox=(17.388, 78.478, 17.416, 78.508), origin=(17.4063, 78.4966))
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/p2ph/game/public/zones/rtc/zone.json'
os.makedirs(os.path.dirname(OUT), exist_ok=True)
S, W, N, E = ZONE['bbox']
LAT0, LON0 = ZONE['origin']
NR, MR = 6380050.094, 6341141.900          # same radii as the Roadster repo so its data lines up exactly
KX = math.cos(math.radians(LAT0)) * NR * math.pi / 180
KZ = MR * math.pi / 180
def to_xz(lat, lon): return (round((lon - LON0) * KX, 2), round(-(lat - LAT0) * KZ, 2))
def arr_xz(coords): return [list(to_xz(c[1], c[0])) for c in coords]
rnd = random.Random(1021)
con = duckdb.connect(); con.execute("INSTALL spatial; LOAD spatial;")
ENV = f"ST_MakeEnvelope({W}, {S}, {E}, {N})"

# ---------------- repo extras (flyover profiles, heights, metro) ----------------
repo_core = json.load(open(f'{REPO}/public/world/hyd-metro/v2/core.json'))
R_LAT0, R_LON0 = 17.4146, 78.5484
R_KX = math.cos(math.radians(R_LAT0)) * NR * math.pi / 180
def repo_to_ll(x, z): return (R_LAT0 - z / KZ, R_LON0 + x / R_KX)
repo_roads_by_way = defaultdict(list)
for r in repo_core['roads']: repo_roads_by_way[r['wayId']].append(r)
repo_heights = {}
import glob
for f in glob.glob(f'{REPO}/public/world/hyd-metro/v2/chunks/*.json'):
    for b in json.load(open(f))['buildings']:
        if b.get('osmId') and b.get('heightM'): repo_heights[b['osmId'].replace('way/', 'w').replace('relation/', 'r')] = b['heightM']
print('repo heights', len(repo_heights))

# ---------------- roads ----------------
DEFAULT_W = dict(motorway=18, trunk=15, primary=13, secondary=10.5, tertiary=8.5, unclassified=6.5, residential=6, living_street=5,
                 service=4.5, motorway_link=7, trunk_link=7, primary_link=7, secondary_link=6.5, tertiary_link=6, unknown=5.5, pedestrian=5)
LANES = dict(motorway=3, trunk=3, primary=2, secondary=2, tertiary=1, unclassified=1, residential=1, living_street=1, service=1)
segs = con.execute(f"""SELECT id, name, class, connectors, level_rules, road_flags, width_rules, speed_limits, sources, wkb, access_restrictions
    FROM '{RAW}/overture_segments.parquet' WHERE subtype='road' AND class IN ({','.join("'" + c + "'" for c in DEFAULT_W)})
    AND ST_Intersects(ST_GeomFromWKB(wkb), {ENV})""").fetchall()
conn_ll = {r[0]: (r[1], r[2]) for r in con.execute(f"SELECT id, lat, lon FROM '{RAW}/overture_connectors.parquet' WHERE lat BETWEEN {S - 0.003} AND {N + 0.003} AND lon BETWEEN {W - 0.003} AND {E + 0.003}").fetchall()}

def oneway(access):
    for a in access or []:
        if a.get('access_type') == 'denied' and (a.get('when') or {}).get('heading') in ('backward', 'forward'):
            return (a['when']['heading'])
    return None

edges, nodes = [], {}
for sid, name, cls, connectors, levels, flags, widths, speeds, sources, wkb, access in segs:
    g = shapely.from_wkb(wkb)
    coords = np.asarray(g.coords)
    line = LineString(coords)
    width = DEFAULT_W[cls]
    for wr in widths or []:
        if wr.get('value') and not wr.get('between'): width = max(3.5, min(float(wr['value']), 30))
    # elevation profile along the segment (fractions)
    deck = []
    for lr in levels or []:
        if (lr.get('value') or 0) > 0:
            deck.append(tuple(lr.get('between') or (0.0, 1.0)))
    for fr in flags or []:
        if 'is_bridge' in (fr.get('values') or []) and not deck and fr.get('between'): pass
    way = None
    for s in sources or []:
        if s.get('dataset') == 'OpenStreetMap' and s.get('record_id', '').startswith('w'):
            way = int(s['record_id'][1:].split('@')[0])
    repo_prof = None
    if way and way in repo_roads_by_way:
        rr = repo_roads_by_way[way][0]
        if max(rr['pointElevM'] or [0]) > 0.5:
            rl = LineString([repo_to_ll(*p)[::-1] for p in rr['points']])
            repo_prof = (rl, rr['pointElevM'])
    def elev_at(frac):
        if repo_prof:
            rl, pe = repo_prof
            p = line.interpolate(frac, normalized=True)
            d = rl.project(p, normalized=True)
            # interpolate repo point elevations by distance along their polyline
            cum = [0]
            pts = list(rl.coords)
            for i in range(1, len(pts)): cum.append(cum[-1] + math.dist(pts[i - 1], pts[i]))
            tgt = d * cum[-1]
            for i in range(1, len(cum)):
                if cum[i] >= tgt:
                    u = (tgt - cum[i - 1]) / max(cum[i] - cum[i - 1], 1e-9)
                    return pe[i - 1] + (pe[i] - pe[i - 1]) * u
            return pe[-1]
        if not deck: return 0.0
        L_m = line.length * 111000
        ramp = min(0.35, 45 / max(L_m, 1))
        best = 0.0
        for a, b in deck:
            if a <= frac <= b:
                up = 1.0 if a <= 0.001 else min(1.0, (frac - a) / ramp)
                dn = 1.0 if b >= 0.999 else min(1.0, (b - frac) / ramp)
                best = max(best, 6.8 * min(up, dn))
        return best
    # split at connectors
    cs = sorted([(c['at'], c['connector_id']) for c in connectors or [] if c.get('at') is not None])
    if not cs or cs[0][0] > 1e-6: cs = [(0.0, None)] + cs
    if cs[-1][0] < 1 - 1e-6: cs = cs + [(1.0, None)]
    ow = oneway(access)
    if ow and not any((wr.get('value') and not wr.get('between')) for wr in (widths or [])):
        width = round(max(5.5, width * 0.72), 1)          # one carriageway of a divided road
    for (a0, c0), (a1, c1) in zip(cs[:-1], cs[1:]):
        if a1 - a0 < 1e-6: continue
        piece = shapely.ops.substring(line, a0, a1, normalized=True) if hasattr(shapely, 'ops') else None
        import shapely.ops as sops
        piece = sops.substring(line, a0, a1, normalized=True)
        pc = list(piece.coords)
        if len(pc) < 2: continue
        # densify so elevation and curves read well
        dense = []
        for i in range(len(pc) - 1):
            p, q = pc[i], pc[i + 1]
            dm = math.dist((p[0] * KX, p[1] * KZ), (q[0] * KX, q[1] * KZ))
            k = max(1, int(dm // 12))
            for j in range(k): dense.append((p[0] + (q[0] - p[0]) * j / k, p[1] + (q[1] - p[1]) * j / k))
        dense.append(pc[-1])
        fr = [a0 + (a1 - a0) * line.project(Point(p), normalized=True) / 1 for p in dense]
        fr = [line.project(Point(p), normalized=True) for p in dense]
        elev = [round(elev_at(f), 2) for f in fr]
        pts = [list(to_xz(p[1], p[0])) for p in dense]
        mid = dense[len(dense) // 2]
        if not (S - 0.002 <= mid[1] <= N + 0.002 and W - 0.002 <= mid[0] <= E + 0.002): continue
        for cid in (c0, c1):
            if cid and cid not in nodes and cid in conn_ll: nodes[cid] = list(to_xz(*conn_ll[cid]))
        maxspeed = None
        for sp in speeds or []:
            if sp.get('max_speed'): maxspeed = sp['max_speed'].get('value')
        edges.append(dict(id=f'{sid[:10]}_{len(edges)}', seg=sid, name=name, cls=cls, w=round(width, 1), lanes=LANES.get(cls, 1),
                          oneway=ow, from_=c0, to=c1, pts=pts, elev=elev if max(elev) > 0.3 else None, maxspeed=maxspeed))
for e in edges: e['from'] = e.pop('from_')
print('edges', len(edges), 'nodes', len(nodes), 'elevated', sum(1 for e in edges if e['elev']))

# ---------------- buildings ----------------
bl = con.execute(f"""SELECT id, name, class, subtype, height, num_floors, facade_color, roof_color, sources, wkb
    FROM '{RAW}/overture_buildings.parquet' WHERE cx BETWEEN {W} AND {E} AND cy BETWEEN {S} AND {N} AND NOT coalesce(is_underground, false)""").fetchall()
buildings = []
hsrc = defaultdict(int)
for bid, name, cls, sub, h, nf, fcol, rcol, sources, wkb in bl:
    g = shapely.from_wkb(wkb)
    polys = list(g.geoms) if hasattr(g, 'geoms') else [g]
    for poly in polys:
        if poly.geom_type != 'Polygon' or poly.area * KX * KZ < 6: continue
        poly = shapely.simplify(poly, 0.0000025)
        ring = arr_xz(list(poly.exterior.coords)[:-1])
        area = Polygon(ring).area
        osm = next((s['record_id'].split('@')[0] for s in sources or [] if s.get('dataset') == 'OpenStreetMap' and s.get('record_id')), None)
        if h: height, how = float(h), 'source'
        elif nf: height, how = nf * 3.2 + 0.6, 'floors'
        elif osm and osm in repo_heights: height, how = float(repo_heights[osm]), 'satellite'
        else:
            # disclosed estimate from footprint size (Hyderabad infill is mostly G+2 to G+5)
            base = 7.0 if area < 60 else 10.0 if area < 180 else 13.5 if area < 600 else 17.0
            height, how = round(base + rnd.uniform(-1.5, 3.5), 1), 'estimate'
        hsrc[how] += 1
        buildings.append(dict(id=bid[:12], name=name, cls=cls or sub, h=round(min(max(height, 3.2), 120), 1), hs=how, ring=ring,
                              fc=fcol, rc=rcol))
print('buildings', len(buildings), dict(hsrc))

# ---------------- trim building footprints out of road corridors ----------------
from shapely.strtree import STRtree
from shapely.ops import unary_union
MAJOR = {'trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link'}
corr = []
for e in edges:
    if e['elev'] and max(e['elev']) > 1.2: continue
    pad = 2.2 if e['cls'] in MAJOR else 0.5
    corr.append(LineString(e['pts']).buffer(e['w'] / 2 + pad, cap_style=2, join_style=2))
ctree = STRtree(corr)
kept, dropped, trimmed = [], 0, 0
trim_map = {}
for b in buildings:
    poly = Polygon(b['ring'])
    if not poly.is_valid: poly = poly.buffer(0)
    if poly.is_empty: continue
    hits = ctree.query(poly, predicate='intersects')
    if len(hits):
        rem = poly.difference(unary_union([corr[i] for i in hits]))
        if rem.is_empty: dropped += 1; continue
        if rem.geom_type != 'Polygon': rem = max(rem.geoms, key=lambda g: g.area)
        if rem.area < 0.35 * poly.area or rem.area < 12: dropped += 1; trim_map[b['id']] = None; continue
        if rem.area < poly.area * 0.995:
            rem = shapely.simplify(rem, 0.25)
            b['ring'] = [[round(x, 2), round(z, 2)] for x, z in list(rem.exterior.coords)[:-1]]
            trimmed += 1; trim_map[b['id']] = rem
    kept.append(b)
print('buildings trimmed', trimmed, 'dropped (mostly inside a road)', dropped)
buildings = kept
bpoly = {b['id']: Polygon(b['ring']) for b in buildings}

def resnap(bid, a, bb):
    # move a facade segment onto the trimmed footprint: nearest edge with a similar direction
    poly = bpoly.get(bid)
    if poly is None: return None
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
    return [round(best[1][0], 2), round(best[1][1], 2)], [round(best[2][0], 2), round(best[2][1], 2)]

# ---------------- boards ----------------
pl = json.load(open(os.path.join(BUILD, 'placements_hero.json')))
ocr_path = os.path.join(BUILD, 'ocr_matches.json')
ocr = json.load(open(ocr_path)) if os.path.exists(ocr_path) else {}
boards = []
for p in pl:
    if p.get('status') != 'placed' or p.get('flags') or 'slot' not in p: continue
    if p['place_conf'] < 0.35: continue
    a, b = p['facade_ll']
    ax, az = to_xz(*a); bx, bz = to_xz(*b)
    bid = p.get('building', '')[:12]
    if bid not in bpoly: continue
    if bid in trim_map:
        rs = resnap(bid, (ax, az), (bx, bz))
        if rs is None: continue
        (ax, az), (bx, bz) = rs
    o = ocr.get(p['uid'])
    boards.append(dict(id=p['uid'], text=(o or {}).get('text') or p['board'], full=p['name'], group=p['group'], tier=p['tier'],
                       conf=p['place_conf'], a=[ax, az], b=[bx, bz], t=p['facade']['t'], slot=p['slot'], building=p.get('building', '')[:12],
                       road=p.get('road_name'), seen=(o or {}).get('seen'), seen_year=(o or {}).get('year')))
print('boards', len(boards))

# ---------------- street furniture ----------------
inf = con.execute(f"""SELECT subtype, class, name, ST_AsText(ST_GeomFromWKB(wkb)) FROM '{RAW}/overture_infrastructure.parquet'
    WHERE ST_Intersects(ST_GeomFromWKB(wkb), {ENV})""").fetchall()
furniture = []
for sub, cls, name, wkt in inf:
    g = shapely.from_wkt(wkt)
    if g.geom_type == 'Point': furniture.append(dict(kind=cls, name=name, p=list(to_xz(g.y, g.x))))
    elif cls in ('bridge', 'viaduct'): pass
print('furniture', len(furniture))

# ---------------- land use / water ----------------
areas = []
for tbl, kind in (('overture_land_use', 'landuse'), ('overture_water', 'water')):
    for sub, cls, name, wkb in con.execute(f"SELECT subtype, class, name, wkb FROM '{RAW}/{tbl}.parquet' WHERE ST_Intersects(ST_GeomFromWKB(wkb), {ENV})").fetchall():
        g = shapely.from_wkb(wkb).intersection(shapely.box(W, S, E, N))
        for q in (g.geoms if hasattr(g, 'geoms') else [g]):
            if q.geom_type == 'Polygon' and q.area * KX * KZ > 40:
                areas.append(dict(kind=kind, sub=sub, cls=cls, name=name, ring=arr_xz(list(shapely.simplify(q, 0.000004).exterior.coords)[:-1])))
print('areas', len(areas))

# ---------------- metro ----------------
metro = dict(lines=[], stations=[], pillars=[])
for ml in repo_core['metroLines']:
    for part in ml['geo']:
        pts = [list(to_xz(lat, lon)) for lat, lon in part]
        inside = [p for p in pts if -2600 < p[0] < 1600 and -1300 < p[1] < 2200]
        if len(inside) > 3: metro['lines'].append(dict(id=ml['id'], color=ml['color'], pts=pts))
for st in repo_core['stations']:
    x, z = to_xz(st['lat'], st['lon'])
    if W - 0.004 <= st['lon'] <= E + 0.004 and S - 0.004 <= st['lat'] <= N + 0.004:
        metro['stations'].append(dict(id=st['id'], name=st['name'], te=st.get('nameTe'), lines=st['lines'], p=[x, z]))
for pi in repo_core['metro']['pillars']:
    lat, lon = repo_to_ll(pi['x'], pi['z'])
    if W - 0.002 <= lon <= E + 0.002 and S - 0.002 <= lat <= N + 0.002:
        x, z = to_xz(lat, lon); metro['pillars'].append(dict(p=[x, z], h=pi['heading'], line=pi['lineId']))
metro['deckHeight'] = repo_core['metro'].get('deckHeightM', 11)
print('metro', {k: len(v) for k, v in metro.items() if isinstance(v, list)})

# ---------------- gameplay POIs ----------------
by_id = {b['id']: b for b in boards}
theatres = [dict(id=b['id'], name=b['full'], board=b['text'], a=b['a'], b=b['b'], t=b['t'], conf=b['conf']) for b in boards if b['group'] == 'cinema' and b['conf'] >= 0.45]
food = [dict(id=b['id'], name=b['full'], board=b['text'], a=b['a'], b=b['b'], t=b['t'], conf=b['conf'],
             pizza=('pizza' in b['full'].lower())) for b in boards if b['group'] == 'food' and b['slot'].get('floor', 0) == 0 and b['conf'] >= 0.5]
print('theatres', len(theatres), 'food pickups', len(food), 'pizza', sum(1 for f in food if f['pizza']))

# neighbourhood names (Overture divisions) for drop-off labels and the HUD area line
places = []
dv = os.path.join(HERE if 'HERE' in dir() else os.path.dirname(__file__), 'raw', 'overture_divisions.parquet')
if os.path.exists(dv):
    for name, sub, lat, lon in duckdb.sql(f"SELECT name, subtype, lat, lon FROM '{dv}' WHERE name IS NOT NULL AND lat BETWEEN {S - 0.004} AND {N + 0.004} AND lon BETWEEN {W - 0.004} AND {E + 0.004}").fetchall():
        x, z = to_xz(lat, lon); places.append(dict(name=name, kind=sub, p=[x, z]))
print('places', len(places))

zone = dict(id=ZONE['id'], name=ZONE['name'], origin=dict(lat=LAT0, lon=LON0), bbox=ZONE['bbox'],
            projection='x=(lon-lon0)*cos(lat0)*N*pi/180, z=-(lat-lat0)*M*pi/180, N=6380050.094, M=6341141.9',
            attribution=['Map data © OpenStreetMap contributors (ODbL 1.0) via Overture Maps', 'Overture Maps Places (CDLA-Permissive-2.0)',
                         'Foursquare OS Places (Apache-2.0)', 'Google Open Buildings / Microsoft ML Buildings via Overture (CC BY 4.0 / ODbL)',
                         'Roadster repository world data (heights, metro, flyover profiles)', 'Mapillary contributors (CC-BY-SA 4.0) for board checks'],
            roads=edges, nodes=nodes, buildings=buildings, boards=boards, furniture=furniture, areas=areas, metro=metro,
            theatres=theatres, food=food, places=places)
json.dump(zone, open(OUT, 'w'), separators=(',', ':'), ensure_ascii=False)
print('wrote', OUT, round(os.path.getsize(OUT) / 1e6, 1), 'MB')
