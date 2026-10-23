"""City step 1: the whole road network inside the ORR as game edges (split at connectors), with deck heights.

Heights: Roadster repo profiles where they exist (metro corridors: Punjagutta, Paradise, Tarnaka ... flyovers);
elsewhere Overture/OSM level rules (level 1 = 6.8 m deck, level 2 = 13.6 m). Short level-1 pieces that only cross a
drain are kept at grade; a deck that meets only at-grade roads ramps down inside its own length.
Output: build/city_edges.pkl  (list of dicts in the game's local frame, origin RTC X Roads)
"""
import math, os, pickle, sys, time
from collections import defaultdict
import duckdb, numpy as np, shapely
import shapely.ops as sops
from shapely.geometry import LineString, Point

HERE = os.path.dirname(__file__)
RAW, BUILD = os.path.join(HERE, 'raw'), os.path.join(HERE, 'build')
REPO = os.environ.get('REPO', '/home/claude/repo/rpd/game')
LAT0, LON0 = 17.4063, 78.4966                     # game origin (RTC X Roads)
NR, MR = 6380050.094, 6341141.900
KX = math.cos(math.radians(LAT0)) * NR * math.pi / 180
KZ = MR * math.pi / 180
def to_xz(lat, lon): return (round((lon - LON0) * KX, 1), round(-(lat - LAT0) * KZ, 1))
DEFAULT_W = dict(motorway=18, trunk=15, primary=13, secondary=10.5, tertiary=8.5, unclassified=6.5, residential=6, living_street=5,
                 service=4.5, motorway_link=7, trunk_link=7, primary_link=7, secondary_link=6.5, tertiary_link=6, unknown=5.5, pedestrian=5)
LANES = dict(motorway=3, trunk=3, primary=2, secondary=2, tertiary=1)
DECK = 6.8

t0 = time.time()
con = duckdb.connect(); con.execute("INSTALL spatial; LOAD spatial;")
# Roadster repo flyover profiles, keyed by OSM way
import json
repo_core = json.load(open(f'{REPO}/public/world/hyd-metro/v2/core.json'))
R_LAT0, R_LON0 = 17.4146, 78.5484
R_KX = math.cos(math.radians(R_LAT0)) * NR * math.pi / 180
def repo_to_ll(x, z): return (R_LAT0 - z / KZ, R_LON0 + x / R_KX)
repo_prof = {}
for r in repo_core['roads']:
    if r.get('pointElevM') and max(r['pointElevM']) > 0.5 and r.get('wayId'):
        pts = [repo_to_ll(*p)[::-1] for p in r['points']]
        cum = [0.0]
        for i in range(1, len(pts)): cum.append(cum[-1] + math.dist(pts[i - 1], pts[i]))
        repo_prof.setdefault(r['wayId'], []).append((LineString(pts), cum, r['pointElevM']))
print('repo profiles', len(repo_prof), flush=True)

conn = {r[0]: (r[1], r[2]) for r in con.execute(f"SELECT id, lat, lon FROM '{RAW}/overture_connectors.parquet'").fetchall()}
print('connectors', len(conn), round(time.time() - t0), 's', flush=True)
segs = con.execute(f"""SELECT id, name, class, connectors, level_rules, width_rules, speed_limits, sources, wkb, access_restrictions
    FROM '{RAW}/overture_segments.parquet' WHERE subtype='road' AND class IN ({','.join("'" + c + "'" for c in DEFAULT_W)})""").fetchall()
print('segments', len(segs), round(time.time() - t0), 's', flush=True)

def oneway(access):
    for a in access or []:
        if a.get('access_type') == 'denied' and (a.get('when') or {}).get('heading') in ('backward', 'forward') and not (a.get('when') or {}).get('mode'):
            return a['when']['heading']
    return None
def nid(c): return c[:12] if c else None

edges = []
for n_seg, (sid, name, cls, connectors, levels, widths, speeds, sources, wkb, access) in enumerate(segs):
    line = shapely.from_wkb(wkb)
    if line.geom_type != 'LineString' or line.length == 0: continue
    width = DEFAULT_W[cls]
    explicit_w = False
    for wr in widths or []:
        if wr.get('value') and not wr.get('between'): width = max(3.5, min(float(wr['value']), 30)); explicit_w = True
    deck = []
    for lr in levels or []:
        v = lr.get('value') or 0
        if v > 0: deck.append((tuple(lr.get('between') or (0.0, 1.0)), min(v, 2)))
    way = None
    for s in sources or []:
        if s.get('dataset') == 'OpenStreetMap' and (s.get('record_id') or '').startswith('w'):
            way = int(s['record_id'][1:].split('@')[0])
    prof = repo_prof.get(way, [None])[0] if way else None
    ow = oneway(access)
    if ow and not explicit_w: width = round(max(5.5, width * 0.72), 1)
    maxspeed = None
    for sp in speeds or []:
        if sp.get('max_speed'): maxspeed = sp['max_speed'].get('value')
    L_m = line.length * 111000
    def elev_at(frac):
        if prof:
            rl, cum, pe = prof
            d = rl.project(line.interpolate(frac, normalized=True), normalized=True) * cum[-1]
            for i in range(1, len(cum)):
                if cum[i] >= d:
                    u = (d - cum[i - 1]) / max(cum[i] - cum[i - 1], 1e-12)
                    return pe[i - 1] + (pe[i] - pe[i - 1]) * u
            return pe[-1]
        best = 0.0
        ramp = min(0.35, 45 / max(L_m, 1))
        for (a, b), lv in deck:
            if a <= frac <= b:
                up = 1.0 if a <= 0.001 else min(1.0, (frac - a) / ramp)
                dn = 1.0 if b >= 0.999 else min(1.0, (b - frac) / ramp)
                best = max(best, DECK * lv * min(up, dn))
        return best
    elevated = bool(prof) or bool(deck)
    cs = sorted([(c['at'], c['connector_id']) for c in connectors or [] if c.get('at') is not None])
    if not cs or cs[0][0] > 1e-6: cs = [(0.0, None)] + cs
    if cs[-1][0] < 1 - 1e-6: cs = cs + [(1.0, None)]
    k = 0
    for (a0, c0), (a1, c1) in zip(cs[:-1], cs[1:]):
        if a1 - a0 < 1e-6: continue
        piece = sops.substring(line, a0, a1, normalized=True)
        pc = list(piece.coords)
        if len(pc) < 2: continue
        if elevated:     # densify decks so ramps and profiles read well
            dense = []
            for i in range(len(pc) - 1):
                p, q = pc[i], pc[i + 1]
                dm = math.dist((p[0] * KX, p[1] * KZ), (q[0] * KX, q[1] * KZ))
                kk = max(1, int(dm // 12))
                for j in range(kk): dense.append((p[0] + (q[0] - p[0]) * j / kk, p[1] + (q[1] - p[1]) * j / kk))
            dense.append(pc[-1]); pc = dense
            elev = [round(elev_at(line.project(Point(p), normalized=True)), 2) for p in pc]
            if max(elev) < 0.3: elev = None
        else: elev = None
        pts = [list(to_xz(p[1], p[0])) for p in pc]
        # drop repeated points after rounding
        keep = [0] + [i for i in range(1, len(pts)) if pts[i] != pts[i - 1]]
        pts = [pts[i] for i in keep]
        if elev: elev = [elev[i] for i in keep]
        if len(pts) < 2: continue
        edges.append(dict(id=f'{sid[:12]}_{k}', name=name, cls=cls, w=round(width, 1), lanes=LANES.get(cls, 1), oneway=ow,
                          **{'from': nid(c0), 'to': nid(c1)}, pts=pts, elev=elev, maxspeed=maxspeed, repo=bool(prof)))
        k += 1
    if n_seg % 50000 == 0: print(n_seg, len(edges), round(time.time() - t0), 's', flush=True)
print('edges', len(edges), round(time.time() - t0), 's', flush=True)

# ---- deck clean-up: culverts at grade; decks that meet only at-grade roads ramp down inside their own length ----
inc = defaultdict(list)
for e in edges:
    for end in ('from', 'to'):
        if e[end]: inc[e[end]].append(e)
def is_deck(e): return e['elev'] is not None and max(e['elev']) > 1.2
def elen(e): return sum(math.dist(e['pts'][i], e['pts'][i + 1]) for i in range(len(e['pts']) - 1))
culverts = ramps = 0
for e in edges:
    if not is_deck(e) or e['repo']: continue
    ends = {end: [o for o in inc.get(e[end], []) if o is not e and is_deck(o)] for end in ('from', 'to')}
    L = elen(e)
    if L < 45 and not ends['from'] and not ends['to']:
        e['elev'] = None; culverts += 1; continue
    cum = [0.0]
    for i in range(1, len(e['pts'])): cum.append(cum[-1] + math.dist(e['pts'][i - 1], e['pts'][i]))
    R = min(90.0, 0.45 * L)
    for end in ('from', 'to'):
        if ends[end] or not e[end]: continue
        ramps += 1
        for i, d in enumerate(cum):
            dd = d if end == 'from' else L - d
            if dd < R: e['elev'][i] = round(min(e['elev'][i], e['elev'][i] * dd / R), 2)
for e in edges:
    if e['elev'] is not None and max(e['elev']) < 0.3: e['elev'] = None
nodes = {}
for e in edges:
    for end, i in (('from', 0), ('to', -1)):
        if e[end] and e[end] not in nodes: nodes[e[end]] = e['pts'][i]
print('decks', sum(1 for e in edges if is_deck(e)), 'culverts at grade', culverts, 'ramped ends', ramps, 'nodes', len(nodes), flush=True)
pickle.dump(dict(edges=edges, nodes=nodes, origin=(LAT0, LON0)), open(os.path.join(BUILD, 'city_edges.pkl'), 'wb'))
print('done', round(time.time() - t0), 's')
