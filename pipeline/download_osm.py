"""Download OpenStreetMap layers for Hyderabad from the Overpass API (ODbL).

City extent (ORR): named businesses, the full road network with levels/bridges/lanes, signals/crossings/bus stops, metro.
Hero zone (RTC X Roads core): every building and detail feature with full tags.
"""
import json, os, sys, time, urllib.request, urllib.parse

OUT = os.path.join(os.path.dirname(__file__), 'raw')
CITY = (17.20, 78.20, 17.62, 78.70)          # south, west, north, east
HERO = (17.388, 78.478, 17.416, 78.508)      # RTC X Roads / Chikkadpally / Narayanaguda / Himayatnagar / Ashok Nagar
ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

def bb(b): return f'({b[0]},{b[1]},{b[2]},{b[3]})'

QUERIES = {
    'osm_pois.json': f"""[out:json][timeout:180];
      ( nwr["name"]["shop"]{bb(CITY)}; nwr["name"]["amenity"]{bb(CITY)}; nwr["name"]["office"]{bb(CITY)};
        nwr["name"]["craft"]{bb(CITY)}; nwr["name"]["healthcare"]{bb(CITY)}; nwr["name"]["tourism"]{bb(CITY)};
        nwr["name"]["leisure"]{bb(CITY)}; nwr["name"]["historic"]{bb(CITY)}; );
      out center tags;""",
    'osm_roads.json': f"""[out:json][timeout:180];
      ( way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|pedestrian|road)$"]{bb(CITY)}; );
      out tags geom;""",
    'osm_street_points.json': f"""[out:json][timeout:180];
      ( node["highway"~"^(traffic_signals|crossing|bus_stop|stop|give_way|street_lamp|speed_camera)$"]{bb(CITY)};
        node["traffic_calming"]{bb(CITY)}; node["public_transport"="platform"]{bb(CITY)}; node["amenity"="taxi"]{bb(CITY)}; );
      out tags;""",
    'osm_rail.json': f"""[out:json][timeout:180];
      ( way["railway"~"^(subway|rail|light_rail|monorail|construction)$"]{bb(CITY)};
        nwr["railway"~"^(station|halt)$"]{bb(CITY)}; nwr["public_transport"="station"]{bb(CITY)}; );
      out tags geom;""",
    'osm_hero_detail.json': f"""[out:json][timeout:180];
      ( way["building"]{bb(HERO)}; relation["building"]{bb(HERO)}; way["building:part"]{bb(HERO)};
        way["landuse"]{bb(HERO)}; way["leisure"]{bb(HERO)}; way["natural"]{bb(HERO)}; way["water"]{bb(HERO)};
        way["amenity"]{bb(HERO)}; way["man_made"]{bb(HERO)}; way["barrier"]{bb(HERO)}; way["area:highway"]{bb(HERO)};
        way["footway"]{bb(HERO)}; way["highway"="footway"]{bb(HERO)}; node["natural"="tree"]{bb(HERO)};
        way["bridge"]{bb(HERO)}; way["railway"]{bb(HERO)}; );
      out tags geom;""",
}

def fetch(q):
    data = urllib.parse.urlencode({'data': q}).encode()
    last = None
    for ep in ENDPOINTS:
        for attempt in range(3):
            try:
                req = urllib.request.Request(ep, data=data, headers={'User-Agent': 'pizza-to-picture-hall-data/0.1 (game data build)'})
                with urllib.request.urlopen(req, timeout=300) as r:
                    return r.read()
            except Exception as e:  # rate limited or busy: back off politely, then try the next mirror
                last = e; print('  retry', ep, attempt, str(e)[:120]); time.sleep(20 * (attempt + 1))
    raise last

def tiles(b, step=0.07):
    s, w, n, e = b
    y = s
    while y < n - 1e-9:
        x = w
        while x < e - 1e-9:
            yield (round(y, 4), round(x, 4), round(min(y + step, n), 4), round(min(x + step, e), 4))
            x += step
        y += step

only = sys.argv[1:]
tile_dir = os.path.join(OUT, 'osm_tiles'); os.makedirs(tile_dir, exist_ok=True)
for name, q in QUERIES.items():
    if only and name not in only: continue
    path = os.path.join(OUT, name)
    if os.path.exists(path): print('exists', name, flush=True); continue
    t = time.time()
    cityq = bb(CITY) in q
    parts = list(tiles(CITY)) if cityq else [None]
    seen, elements = set(), []
    for i, tb in enumerate(parts):
        tq = q.replace(bb(CITY), bb(tb)) if tb else q
        tp = os.path.join(tile_dir, f"{name}.{i}.json")
        if os.path.exists(tp): raw = open(tp, 'rb').read()
        else:
            raw = fetch(tq); open(tp, 'wb').write(raw); time.sleep(4)
        for el in json.loads(raw).get('elements', []):
            k = (el['type'], el['id'])
            if k in seen: continue
            seen.add(k); elements.append(el)
        print(' ', name, 'tile', i + 1, '/', len(parts), len(elements), flush=True)
    json.dump({'elements': elements, 'source': 'OpenStreetMap contributors, ODbL 1.0', 'fetched': time.strftime('%Y-%m-%d')}, open(path, 'w'))
    print(name, len(elements), 'elements', round(time.time() - t), 's', flush=True)
