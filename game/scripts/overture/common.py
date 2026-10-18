"""Shared helpers for the Overture fetch / preprocessing scripts."""
import json, math, os
from pathlib import Path

HERE = Path(__file__).resolve().parent
GAME = HERE.parent.parent
REPO = GAME.parent
RELEASE = '2026-09-23.1'
RAW_DIR = GAME / 'data' / 'raw' / 'overture' / RELEASE
INTERIM_DIR = GAME / 'data' / 'interim' / 'overture' / RELEASE
METRO_JSON = REPO / 'hyderabad-game-handoff' / 'resources' / 'osm' / 'metro-network-full.json'
LINES = [('red', 8297698), ('blue', 13986696), ('green', 8297697)]
BUFFER_M = 600.0
LAT0 = 17.4146
KLAT = 111_320.0
KLON = 111_320.0 * math.cos(math.radians(LAT0))


def to_m(lon, lat):
    return (lon * KLON, lat * KLAT)


def line_alignments():
    """{line: [[(lon,lat),...], ...]} from the bundled OSM metro dump (route master -> routes -> ways)."""
    d = json.load(open(METRO_JSON))
    el = {(e['type'], e['id']): e for e in d['elements']}
    out = {}
    for lid, mid in LINES:
        master = el[('relation', mid)]
        ways = set()
        for m in master['members']:
            if m['type'] != 'relation':
                continue
            for mm in el[('relation', m['ref'])]['members']:
                if mm['type'] == 'way' and ('way', mm['ref']) in el:
                    ways.add(mm['ref'])
        polys = []
        for w in sorted(ways):
            pts = [(el[('node', n)]['lon'], el[('node', n)]['lat']) for n in el[('way', w)]['nodes'] if ('node', n) in el]
            if len(pts) >= 2:
                polys.append(pts)
        out[lid] = polys
    return out


PRIMARY_ROUTE = {'red': 8297636, 'blue': 8297688, 'green': 10692235}
TERMINUS_RADIUS_M = 2000.0


def line_termini():
    """{line: [(lon,lat) first stop, (lon,lat) last stop]} of the primary route relation (OSM kit)."""
    d = json.load(open(METRO_JSON))
    el = {(e['type'], e['id']): e for e in d['elements']}
    out = {}
    for lid, rid in PRIMARY_ROUTE.items():
        stops = [m['ref'] for m in el[('relation', rid)]['members'] if m['type'] == 'node' and m.get('role') in ('stop', 'stop_entry_only', 'stop_exit_only') and ('node', m['ref']) in el]
        a, b = el[('node', stops[0])], el[('node', stops[-1])]
        out[lid] = [(a['lon'], a['lat']), (b['lon'], b['lat'])]
    return out


def s3_fs():
    import pyarrow.fs as pafs
    return pafs.S3FileSystem(anonymous=True, region='us-west-2', proxy_options=os.environ.get('HTTPS_PROXY'), endpoint_override='https://s3.us-west-2.amazonaws.com')


def corridor_polygon(polys, buffer_m=BUFFER_M, termini=None):
    """Shapely polygon (lon/lat degrees, but built in metres) for the alignment buffered by buffer_m."""
    from shapely.geometry import LineString
    from shapely.ops import unary_union
    from shapely import affinity
    from shapely.geometry import Point
    lines = [LineString([to_m(*p) for p in pl]) for pl in polys]
    parts = [l.buffer(buffer_m, quad_segs=8) for l in lines]
    # terminus patches: a disc around each end station so that the end-of-line road network can close its loops
    for t in (termini or []):
        parts.append(Point(*to_m(*t)).buffer(TERMINUS_RADIUS_M, quad_segs=16))
    return unary_union(parts)
