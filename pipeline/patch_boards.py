"""Re-lays the named shop boards in the existing city packs from build/placements.json (after conflate.py + place.py),
without re-exporting the packs: same filter and facade re-snap as export_city.py, onto the buildings already in each
pack. Writes the served packs and the pre-photo backups (build/prev_pack_photo); run ocr_boards.py --apply afterwards
to put the street-photo boards back on top. Run: python3 patch_boards.py
"""
import gzip, json, math, os
from collections import defaultdict
from shapely.geometry import Polygon, Point, LineString
from ocr_state import BUILD as BUILD_PATH, PACKS as PACKS_PATH
HERE = os.path.dirname(os.path.abspath(__file__)); BUILD = str(BUILD_PATH)
PACKS = str(PACKS_PATH); BAK = os.path.join(BUILD, 'prev_pack_photo')
LAT0, LON0, NR, MR = 17.4063, 78.4966, 6380050.094, 6341141.900
KX = math.cos(math.radians(LAT0)) * NR * math.pi / 180; KZ = MR * math.pi / 180
def to_xz(lat, lon): return (round((lon - LON0) * KX, 1), round(-(lat - LAT0) * KZ, 1))
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
pl_by_bld = defaultdict(list)
for p in json.load(open(os.path.join(BUILD, 'placements.json'))):
    if p.get('status') != 'placed' or p.get('flags') or 'slot' not in p or p['place_conf'] < 0.35: continue
    pl_by_bld[p['building'][:12]].append(dict(uid=p['uid'], name=p['name'], board=p['board'], group=p['group'], tier=p['tier'], conf=p['place_conf'],
                                              fll=p['facade_ll'], t=p['facade']['t'], slot=p['slot'], road=p.get('road_name')))
ocr = json.load(open(os.path.join(BUILD, 'ocr_matches.json'))) if os.path.exists(os.path.join(BUILD, 'ocr_matches.json')) else {}
print('placed boards', sum(len(v) for v in pl_by_bld.values()), flush=True)
tot_old = tot_new = 0
for fn in sorted(os.listdir(PACKS)):
    if not fn.endswith('.pack.wasm'): continue
    bak = os.path.join(BAK, fn); src = bak if os.path.exists(bak) else os.path.join(PACKS, fn)
    d = json.loads(gzip.decompress(open(src, 'rb').read()))
    for t in d['tiles'].values():
        tot_old += len(t['boards']); boards = []
        for b in t['buildings']:
            pls = pl_by_bld.get(b['id'])
            if not pls or len(b['ring']) < 3: continue
            poly = Polygon(b['ring'])
            if not poly.is_valid: poly = poly.buffer(0)
            if poly.is_empty or poly.geom_type != 'Polygon': continue
            for p in pls:
                (la, lo), (lb, lob) = p['fll']
                rs = resnap(poly, to_xz(la, lo), to_xz(lb, lob))
                if rs is None: continue
                o = ocr.get(p['uid']) or {}
                boards.append(dict(id=p['uid'], text=p['board'], full=p['name'], group=p['group'], tier=p['tier'], conf=p['conf'],
                                   a=rs[0], b=rs[1], t=p['t'], slot=p['slot'], building=b['id'], road=p['road'], seen=o.get('seen'), seen_year=o.get('year')))
        t['boards'] = boards; tot_new += len(boards)
    blob = gzip.compress(json.dumps(d, separators=(',', ':'), ensure_ascii=False).encode(), 6)
    for out in ([os.path.join(PACKS, fn)] + ([bak] if os.path.exists(bak) else [])):
        tmp = out + '.tmp'; open(tmp, 'wb').write(blob); os.replace(tmp, out)
print('boards before', tot_old, 'after', tot_new, flush=True)
