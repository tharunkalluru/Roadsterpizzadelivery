"""Step 1b: merge Overture Places + Foursquare OS Places into one deduplicated business list for Hyderabad.

Output: build/businesses.parquet (+ build/conflate_report.json)
Every record keeps its source ids so it can be traced back and attributed.
"""
import json, math, os, re, time
from collections import defaultdict
import duckdb
from rapidfuzz import fuzz

HERE = os.path.dirname(__file__)
RAW, BUILD = os.path.join(HERE, 'raw'), os.path.join(HERE, 'build')
os.makedirs(BUILD, exist_ok=True)
t0 = time.time()
con = duckdb.connect()

ov = con.execute("""SELECT id, name, basic_category, category, cat_hierarchy, confidence, brand_name, brand_wikidata,
    addresses[1].freeform AS addr, operating_status, lat, lon FROM 'raw/overture_places.parquet' WHERE name IS NOT NULL""".replace("'raw/", f"'{RAW}/")).fetchall()
fs = con.execute(f"""SELECT fsq_place_id, name, fsq_category_labels, address, locality, date_refreshed, date_closed, lat, lon
    FROM '{RAW}/fsq_places.parquet' WHERE name IS NOT NULL""").fetchall()

# ---------- normalisation ----------
STOP = set('the of and pvt ltd private limited llp co company india hyderabad secunderabad telangana branch new old sri shri sree shree srī'.split())
SPELL = [(r'\bsudharshan\b', 'sudarshan'), (r'\bsapthagiri\b', 'saptagiri'), (r'\bthe?at(re|er)s?\b', 'theatre'),
         (r'\b(\d+)\s*mm\b', r'\1mm'), (r'\bmart\b', 'mart'), (r'\bhotel\b', 'hotel'), (r'\brestaur[a-z]*\b', 'restaurant')]
def norm(s):
    s = s.lower()
    s = re.sub(r'[‘’\'`]', '', s)
    s = re.sub(r'[^a-z0-9ఀ-౿]+', ' ', s)
    for a, b in SPELL: s = re.sub(a, b, s)
    toks = [t for t in s.split() if t not in STOP]
    return ' '.join(toks)

def group_of(text, name):
    t = (text or '').lower(); n = name.lower()
    if re.search(r'movie|cinema|theat|multiplex|\b\d+ ?mm\b', t + ' ' + n) and not re.search(r'private theat|ott|pod|party', n): return 'cinema'
    if re.search(r'\b(dr\.?|advocate|agent:|insurance agent|ca )\b', n) or re.search(r'^dr ', n): return 'person'
    if re.search(r'nilayam|residency|apartment|enclave|heights|towers|mansion|complex|plaza|arcade|villa|nivas|sadan', n) and re.search(r'historic|real_estate|residential|landmark|none|building', t + ' none'): return 'building_name'
    rules = [
        ('food', r'restaurant|eatery|cafe|café|bakery|sweet|dessert|food|juice|tea|biryani|dining|bar\b|pub|ice cream|fast_food|tiffin|dhaba|mandi|pizza|burger|chicken|bistro|canteen|snack'),
        ('pharmacy', r'pharmac|drug|chemist|medical store|medplus|apollo pharmacy'),
        ('health', r'hospital|clinic|dental|diagnost|lab\b|health|doctor|physio|eye|medical|nursing|ayurved|homeo'),
        ('finance', r'\bbank|atm|financ|insurance|credit|loan|exchange'),
        ('fashion', r'apparel|clothing|fashion|saree|sari|jewel|shoe|footwear|tailor|textile|boutique|garment|bridal|watch'),
        ('lodging', r'hotel|lodg|resort|hostel|guest house|inn\b|stay'),
        ('worship', r'place_of_worship|temple|mosque|masjid|church|gurudwara|dargah|religious'),
        ('auto', r'automotive|vehicle|car_|tyre|tire|motor|gas_station|fuel|petrol|bike|auto_|two wheeler|garage'),
        ('education', r'school|college|universit|coaching|tutor|institut|academy|learning|educat|preschool|training'),
        ('shop', r'shop|store|retail|mart|market|supermarket|electronic|mobile|hardware|furniture|book|stationer|optical|gift|toy|sport|paint|xerox|print|grocery|kirana|fancy'),
        ('service', r'salon|beauty|spa|gym|fitness|laundry|courier|travel|photo|studio|repair|service'),
        ('office', r'office|professional|b2b|real_estate|consult|government|corporate|agency|business|manufactur|media|design'),
        ('venue', r'park|event|hall|venue|function|banquet|club|stadium|ground'),
    ]
    for g, rx in rules:
        if re.search(rx, t): return g
    for g, rx in rules:
        if re.search(rx, n): return g
    return 'other'

GROUND = {'food', 'cinema', 'pharmacy', 'fashion', 'shop', 'finance', 'auto', 'lodging', 'worship', 'service', 'venue'}
UPPER = {'health', 'education', 'office', 'person'}

recs = []
for (i, name, basic, cat, hier, conf, brand, bwd, addr, status, lat, lon) in ov:
    if status and status != 'open': continue
    text = ' '.join(filter(None, [basic, cat] + list(hier or [])))
    recs.append(dict(src='overture', sid=i, name=name.strip(), n=norm(name), group=group_of(text, name), cat=cat or basic,
                     conf=float(conf or 0), brand=brand, brand_wikidata=bwd, addr=addr, lat=lat, lon=lon))
for (i, name, labels, addr, loc, refreshed, closed, lat, lon) in fs:
    if closed: continue
    text = ' '.join(labels or [])
    fresh = 0.75 if refreshed and str(refreshed) >= '2024-01-01' else 0.5 if refreshed and str(refreshed) >= '2021-01-01' else 0.35
    recs.append(dict(src='foursquare', sid=i, name=name.strip(), n=norm(name), group=group_of(text, name),
                     cat=(labels or [None])[0], conf=fresh, refreshed=str(refreshed) if refreshed else None,
                     addr=', '.join(filter(None, [addr, loc])), lat=lat, lon=lon))
# OpenStreetMap shops and amenities with a name (Overpass extracts in raw/osm_shops): hand-mapped, so trusted
import glob as _glob
osm_seen = set(); n_osm = 0
OSM_KEYS = ('shop', 'amenity', 'craft', 'office', 'healthcare', 'tourism', 'leisure')
for f in sorted(_glob.glob(os.path.join(RAW, 'osm_shops', '*.json'))):
    try: els = json.load(open(f)).get('elements', [])
    except Exception: continue
    for e in els:
        k = f"{e['type'][0]}{e['id']}"
        if k in osm_seen: continue
        osm_seen.add(k)
        t = e.get('tags', {}); name = (t.get('name:en') or t.get('name') or '').strip()
        if not name or t.get('disused:shop') or t.get('opening_hours') == 'closed': continue
        lat = e.get('lat') or (e.get('center') or {}).get('lat'); lon = e.get('lon') or (e.get('center') or {}).get('lon')
        if lat is None or lon is None: continue
        text = ' '.join(f'{kk}_{t[kk]}' for kk in OSM_KEYS if kk in t).replace('_', ' ')
        recs.append(dict(src='osm', sid=k, name=name, n=norm(name), group=group_of(text, name), cat=next((t[kk] for kk in OSM_KEYS if kk in t), None),
                         conf=0.85, brand=t.get('brand'), brand_wikidata=t.get('brand:wikidata'),
                         addr=', '.join(filter(None, [t.get('addr:housenumber'), t.get('addr:street')])) or None, lat=lat, lon=lon))
        n_osm += 1
print('records', len(recs), 'overture', len(ov), 'foursquare', len(fs), 'osm', n_osm)

# ---------- spatial grid + union-find ----------
M_PER_DEG_LAT = 110574.0
def dist(a, b):
    dy = (a['lat'] - b['lat']) * M_PER_DEG_LAT
    dx = (a['lon'] - b['lon']) * 111320.0 * math.cos(math.radians(a['lat']))
    return math.hypot(dx, dy)
CELL = 0.0008  # ~90 m
grid = defaultdict(list)
for k, r in enumerate(recs): grid[(int(r['lat'] / CELL), int(r['lon'] / CELL))].append(k)
parent = list(range(len(recs)))
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]; x = parent[x]
    return x
def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb: parent[rb] = ra

pairs = 0
for (gy, gx), ks in grid.items():
    near = [j for dy in (-1, 0, 1) for dx in (-1, 0, 1) for j in grid.get((gy + dy, gx + dx), [])]
    for a in ks:
        ra = recs[a]
        if not ra['n']: continue
        for b in near:
            if b <= a: continue
            rb = recs[b]
            if not rb['n']: continue
            d = dist(ra, rb)
            if d > 120: continue
            s = fuzz.token_set_ratio(ra['n'], rb['n'])
            if s < 82: continue
            same_group = ra['group'] == rb['group'] or 'other' in (ra['group'], rb['group'])
            short = min(len(ra['n']), len(rb['n'])) < 5
            if (s >= 95 and d <= 120 and same_group) or (s >= 88 and d <= 60 and same_group and not short) or (s >= 82 and d <= 25 and same_group and not short):
                union(a, b); pairs += 1

clusters = defaultdict(list)
for k in range(len(recs)): clusters[find(k)].append(k)

out = []
for root, ks in clusters.items():
    rs = [recs[k] for k in ks]
    srcs = sorted({r['src'] for r in rs})
    ovs = [r for r in rs if r['src'] == 'overture']
    best = max(rs, key=lambda r: (r['conf'] + (0.1 if r['src'] == 'overture' else 0), len(r['name']) < 60, -len(r['name'])))
    # position: prefer the most confident overture point, else foursquare; average when close
    pos = max(ovs, key=lambda r: r['conf']) if ovs else best
    lat = sum(r['lat'] for r in rs) / len(rs) if max(dist(pos, r) for r in rs) < 15 else pos['lat']
    lon = sum(r['lon'] for r in rs) / len(rs) if max(dist(pos, r) for r in rs) < 15 else pos['lon']
    groups = [r['group'] for r in rs if r['group'] != 'other']
    group = max(set(groups), key=groups.count) if groups else 'other'
    maxconf = max(r['conf'] for r in rs)
    tier = 'A' if len(srcs) > 1 else ('B' if maxconf >= 0.7 else 'C')
    out.append(dict(
        uid='b_' + (ovs[0]['sid'][:16] if ovs else next((r['sid'][:16] for r in rs if r['src'] == 'foursquare'), rs[0]['sid'][:16])),
        name=best['name'], alt_names=sorted({r['name'] for r in rs if r['name'] != best['name']})[:6],
        group=group, category=best['cat'], lat=lat, lon=lon, sources=srcs,
        source_ids=[f"{r['src']}:{r['sid']}" for r in rs], confidence=round(maxconf, 3), tier=tier,
        floor='ground' if group in GROUND else 'upper' if group in UPPER else 'either',
        brand=next((r.get('brand') for r in rs if r.get('brand')), None),
        addr=next((r['addr'] for r in rs if r.get('addr')), None),
    ))

con.execute("CREATE TABLE b AS SELECT * FROM read_json_auto(?)", [None]) if False else None
path = os.path.join(BUILD, 'businesses.json')
json.dump(out, open(path, 'w'), ensure_ascii=False)
con.execute(f"COPY (SELECT * FROM read_json_auto('{path}')) TO '{os.path.join(BUILD, 'businesses.parquet')}' (FORMAT parquet)")
from collections import Counter
rep = dict(input_records=len(recs), merged_businesses=len(out), matched_pairs=pairs,
           by_tier=Counter(o['tier'] for o in out), by_group=Counter(o['group'] for o in out).most_common(),
           both_sources=sum(1 for o in out if len(o['sources']) > 1), seconds=round(time.time() - t0, 1))
json.dump(rep, open(os.path.join(BUILD, 'conflate_report.json'), 'w'), indent=1)
print(json.dumps(rep, indent=1))
