"""Pulls the OpenStreetMap features the game needs beyond roads and buildings out of the Telangana extract
(raw/osm_pbf/telangana-latest.osm.pbf, openstreetmap.fr, ODbL): skywalks and foot bridges, subways and underpasses,
rail lines, railway / metro / bus stations, platforms, metro entrances, bus stops, petrol bunks, toll booths,
landmarks (historic, worship, tourism, malls, stadiums, hospitals, universities, anything with a Wikidata id),
parks, lakes and rivers. Output: build/osm_city.json (lat/lon geometry plus the useful tags).
Run: python3 osm_extract.py
"""
import json, os, re
import osmium

HERE = os.path.dirname(os.path.abspath(__file__))
PBF = os.path.join(HERE, 'raw', 'osm_pbf', 'telangana-latest.osm.pbf')
OUT = os.path.join(HERE, 'build', 'osm_city.json')
S, W, N, E = 17.20, 78.20, 17.63, 78.71
KEEP_TAGS = ('name', 'name:en', 'name:te', 'name:hi', 'name:ur', 'brand', 'operator', 'ref', 'wikidata', 'wikipedia', 'layer', 'bridge', 'tunnel',
             'covered', 'level', 'highway', 'railway', 'public_transport', 'amenity', 'tourism', 'historic', 'leisure', 'natural', 'water', 'waterway',
             'shop', 'building', 'man_made', 'religion', 'denomination', 'station', 'subway', 'lanes', 'width', 'height', 'building:levels',
             'barrier', 'network', 'service', 'usage', 'electrified', 'gauge', 'landuse', 'heritage', 'start_date', 'architect', 'roof:shape',
             'bus', 'train', 'light_rail', 'oneway', 'foot', 'area', 'exit_to', 'destination', 'colour', 'building:colour', 'roof:colour')

def inside(lat, lon): return S <= lat <= N and W <= lon <= E

def kind_of(t):
    h = t.get('highway'); r = t.get('railway'); a = t.get('amenity'); pt = t.get('public_transport')
    if h in ('footway', 'path', 'steps', 'pedestrian', 'cycleway', 'corridor') and (t.get('bridge') not in (None, 'no') or t.get('tunnel') not in (None, 'no') or t.get('covered') == 'yes' or (t.get('layer') or '0') not in ('0', '')):
        return 'footbridge' if t.get('tunnel') in (None, 'no') else 'subway'
    if h and t.get('tunnel') not in (None, 'no'): return 'underpass'
    if r in ('rail', 'subway', 'light_rail', 'narrow_gauge', 'monorail'): return 'rail'
    if r in ('station', 'halt') or (pt == 'station' and (t.get('train') == 'yes' or t.get('subway') == 'yes' or t.get('light_rail') == 'yes' or r)) or t.get('building') == 'train_station':
        return 'station'
    if r == 'platform' or (pt == 'platform' and (t.get('train') == 'yes' or r)): return 'platform'
    if r == 'subway_entrance' or t.get('entrance') == 'subway': return 'entrance'
    if a == 'bus_station' or (pt == 'station' and t.get('bus') == 'yes'): return 'bus_station'
    if h == 'bus_stop' or (pt == 'platform' and t.get('bus') == 'yes'): return 'bus_stop'
    if a == 'fuel': return 'fuel'
    if t.get('barrier') == 'toll_booth': return 'toll'
    if h == 'motorway_junction': return 'exit'
    if t.get('man_made') == 'bridge': return 'bridge_area'
    if t.get('natural') == 'water' or t.get('water') or t.get('landuse') in ('reservoir', 'basin'): return 'water'
    if t.get('waterway') in ('river', 'canal', 'riverbank', 'stream', 'drain') and t.get('name'): return 'waterway'
    if t.get('leisure') in ('park', 'garden', 'stadium', 'water_park', 'golf_course', 'nature_reserve') and t.get('name'): return 'park'
    if t.get('historic') or t.get('tourism') in ('attraction', 'museum', 'viewpoint', 'theme_park', 'zoo', 'gallery') or t.get('heritage'):
        return 'landmark'
    if a == 'place_of_worship' and t.get('name'): return 'worship'
    if t.get('shop') == 'mall' or a in ('hospital', 'university', 'college', 'townhall', 'courthouse', 'library', 'theatre', 'cinema', 'arts_centre') and t.get('name'):
        return 'institution'
    if t.get('wikidata') and (t.get('building') or t.get('amenity') or t.get('leisure') or t.get('man_made')): return 'landmark'
    return None

class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__(); self.out = []; self.n = 0
    def tags(self, o): return {k: v for k, v in ((t.k, t.v) for t in o.tags) if k in KEEP_TAGS}
    def node(self, n):
        if not n.tags or not n.location.valid() or not inside(n.location.lat, n.location.lon): return
        t = {x.k: x.v for x in n.tags}; k = kind_of(t)
        if not k or k in ('rail', 'footbridge', 'subway', 'underpass', 'water', 'waterway', 'park', 'bridge_area', 'platform'): return
        self.out.append(dict(id=f'n{n.id}', kind=k, tags=self.tags(n), pt=[round(n.location.lat, 7), round(n.location.lon, 7)]))
    def way(self, w):
        if not w.tags: return
        t = {x.k: x.v for x in w.tags}; k = kind_of(t)
        if not k: return
        try: pts = [[round(nd.location.lat, 7), round(nd.location.lon, 7)] for nd in w.nodes]
        except osmium.InvalidLocationError: return
        if not pts or not any(inside(a, b) for a, b in pts): return
        closed = w.is_closed() and len(pts) > 3
        line_kinds = ('rail', 'footbridge', 'subway', 'underpass', 'waterway')
        if k in line_kinds or not closed:
            self.out.append(dict(id=f'w{w.id}', kind=k, tags=self.tags(w), line=pts))
        # closed ways that are areas are taken from the area callback instead
    def area(self, a):
        t = {x.k: x.v for x in a.tags}; k = kind_of(t)
        if not k or k in ('rail', 'footbridge', 'subway', 'underpass', 'bus_stop', 'entrance', 'toll'): return
        if k == 'waterway' and t.get('waterway') not in ('riverbank',): return
        rings = []
        for outer in a.outer_rings():
            try: ring = [[round(n.lat, 7), round(n.lon, 7)] for n in outer]
            except osmium.InvalidLocationError: continue
            holes = []
            for inner in a.inner_rings(outer):
                try: holes.append([[round(n.lat, 7), round(n.lon, 7)] for n in inner])
                except osmium.InvalidLocationError: pass
            rings.append(dict(outer=ring, holes=holes))
        if not rings or not any(inside(p[0], p[1]) for r in rings for p in r['outer']): return
        src = f"{'w' if a.from_way() else 'r'}{a.orig_id()}"
        self.out.append(dict(id=src, kind=k, tags=self.tags(a), rings=rings))

h = H()
h.apply_file(PBF, locations=True, idx='flex_mem')
from collections import Counter
print(Counter(o['kind'] for o in h.out))
json.dump(h.out, open(OUT, 'w'), ensure_ascii=False)
print('wrote', OUT, len(h.out))
