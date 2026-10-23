"""Step 1e: real shop names from street photos for buildings the open data has no shop for.

Every board text read in a Mapillary photo (CC-BY-SA 4.0) is a ray from the camera along its viewing direction. The ray
is followed to the first building front it hits (within 45 m, facing the camera). When two or more different photos
read the same name on the same building, that name becomes an unreviewed board candidate.
Names already placed from Overture/Foursquare are left alone, and street furniture text (traffic signs, plates, phone
numbers, road names) is ignored.

python3 ocr_boards.py           -> build/ocr_photo_boards.json + report
python3 ocr_boards.py --apply   -> also writes the boards into the city packs (originals copied to build/prev_pack_photo/)
"""
import gzip, hashlib, json, math, os, re, shutil, sys
from collections import defaultdict
from rapidfuzz import fuzz
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ocr_match import load_records, norm, informative, image_sources, BUILD
from ocr_state import PACKS as PACKS_PATH
from ocr_candidates import mapped_candidates, read_origin, to_xz as project_to_xz

PACKS = str(PACKS_PATH)
ORIGIN = read_origin(PACKS_PATH)
def to_xz(lat, lon): return project_to_xz(lat, lon, ORIGIN)

NOT_SHOP = re.compile(r'\b(TRAFFIC|POLICE|STOP|SPEED|LIMIT|KMPH|GHMC|METRO|STATION|EXIT|ENTRY|PARKING|ONE ?WAY|U ?TURN|DIVERSION|'
                      r'ROAD|STREET|LANE|COLONY|NAGAR|CROSS|JUNCTION|FLYOVER|SIGNAL|DANGER|CAUTION|SLOW|SCHOOL ZONE|NO ENTRY|'
                      r'WWW|COM|CALL|PH|MOB|CELL|TS ?\d|AP ?\d|TOLET|TO LET|FOR RENT|FOR SALE|VOTE|ELECTION|JOIN|DELIVERY|DOOR|FREE|OFFER|SALE|NOW|OPEN|OPENING|'
                      r'COMING SOON|WELCOME|THANK|THANKS|DISCOUNT|BUY|GET|UPTO|FLAT|NEW ARRIVALS?)\b')
GROUPS = [('food', r'HOTEL|RESTAURANT|BIRYANI|BAKERY|BAKERS|CAFE|SWEET|TIFFIN|KITCHEN|DHABA|PIZZA|BURGER|CHICKEN|MANDI|TEA|CHAI|JUICE|ICE ?CREAM|FOOD|MESS|IRANI|GRILL|KABAB|BAR\b'),
          ('pharmacy', r'MEDICAL|PHARMA|CHEMIST|DRUG'),
          ('health', r'CLINIC|HOSPITAL|DENTAL|DIAGNOS|LAB\b|SCAN|EYE|CARE\b|HEALTH|PHYSIO'),
          ('fashion', r'TEXTILE|SAREE|SAREES|FASHION|JEWEL|GOLD|SILVER|READYMADE|TAILOR|BOUTIQUE|GARMENT|FOOTWEAR|SHOES|CLOTH|SILK|BANGLE'),
          ('finance', r'BANK|FINANCE|ATM|INSURANCE|CHIT'),
          ('education', r'SCHOOL|COLLEGE|ACADEMY|INSTITUTE|COACHING|TUITION|CLASSES|TRAINING'),
          ('lodging', r'LODGE|RESIDENCY|INN\b|GUEST'),
          ('auto', r'MOTORS|AUTO|TYRE|TYRES|SERVICE CENTRE|SPARES|GARAGE'),
          ('service', r'SALON|PARLOUR|STUDIO|TRAVELS|LAUNDRY|DRY CLEAN|SPA\b|GYM|FITNESS|XEROX|COURIER|REAL ESTATE')]

def group_of(t):
    for g, rx in GROUPS:
        if re.search(rx, t): return g
    return 'shop'

def clean(t):
    t = re.sub(r'\s+', ' ', t).strip(" .,:;-_'\"*|()[]")
    return t

import wordninja
_COST = wordninja.DEFAULT_LANGUAGE_MODEL._wordcost
_RANKED = sorted(_COST, key=_COST.get)
COMMON = set(_RANKED[:30000]); KNOWN_WORDS = set(_RANKED[:60000])

# words Hyderabad businesses actually use in their names (Overture + Foursquare), e.g. DHABA, BAWARCHI, SAGAR, PATEL
_V = defaultdict(int)
for _p in mapped_candidates(build=BUILD, packs=PACKS_PATH):
    for _w in set(norm(_p.get('name') or '').split()): _V[_w.lower()] += 1
VOCAB = {w for w, c in _V.items() if c >= 3}
COMMON5K = set(_RANKED[:5000])

def name_like(t):
    if re.search(r'^[A-Za-z]{1,2}&|&\s*$', t.strip()): return False
    # every word is a real word or business-name word (or a short acronym), and one of them is distinctive
    toks = [w for w in re.split(r'[^A-Za-z]+', t) if w]
    if not toks: return False
    ok = lambda w: (w.isupper() and 2 <= len(w) <= 4) or w.lower() in VOCAB or (w.lower() in KNOWN_WORDS and len(w) > 2)
    if not all(ok(w) for w in toks): return False
    return any(w.lower() in VOCAB and w.lower() not in COMMON5K for w in toks if len(w) > 2)

def respace(t):
    # RapidOCR drops spaces ("PETERENGLAND"): split a run-together token when every piece is a real word
    out = []
    for tok in t.split(' '):
        low = tok.lower()
        if len(low) >= 7 and low.isalpha() and low not in KNOWN_WORDS and low not in VOCAB:
            parts = wordninja.split(low)
            if len(parts) > 1 and all(len(p) >= 3 and (p in KNOWN_WORDS or p in VOCAB) for p in parts):
                out.extend(p.upper() if tok.isupper() else p.capitalize() for p in parts); continue
        out.append(tok)
    return ' '.join(out)

def good_text(t, conf):
    n = norm(t)
    if conf < 0.75 or len(n) > 30 or len(n) < 4: return False
    if sum(c.isalpha() for c in n) < 5 or sum(c.isdigit() for c in n) > 3: return False
    if NOT_SHOP.search(n): return False
    info = informative(t)
    if not info or len(''.join(info)) < 4: return False
    if re.search(r'^[A-Za-z]{1,2}&|&\s*$', t.strip()): return False   # a cut-off tagline ("ER&IMPLANTS", "ROTIS&")
    toks = [w for w in n.split() if len(w) > 1]
    if len(toks) == 1 and toks[0].lower() in COMMON: return False      # one plain word ("OPENING", "GLOBAL") is not a name
    return True

def main(apply=False):
    records_by_id = load_records()
    recs = [r for r in records_by_id.values() if r.get('compass') is not None and r['texts']]
    cams = {}
    for r in recs: cams[r['image']] = to_xz(r['lat'], r['lon'])
    near_cells = set()
    for x, z in cams.values():
        cx, cz = int(math.floor(x / 50)), int(math.floor(z / 50))
        for i in (-1, 0, 1):
            for j in (-1, 0, 1): near_cells.add((cx + i, cz + j))
    # buildings (and their existing boards) around the cameras
    edges = defaultdict(list); bld = {}; known = defaultdict(list); where = {}
    for fn in sorted(os.listdir(PACKS)):
        if not fn.endswith('.pack.wasm'): continue
        # Current packs may include later source-backed work by another naming worker.
        d = json.loads(gzip.decompress(open(os.path.join(PACKS, fn), 'rb').read()))
        for key, t in d['tiles'].items():
            for bd in t['boards']: known[bd['building']].append(norm(bd['text']))
            for b in t['buildings']:
                ring = b['ring']
                if not any((int(math.floor(p[0] / 50)), int(math.floor(p[1] / 50))) in near_cells for p in ring): continue
                bld[b['id']] = b; where[b['id']] = (fn, key)
                cx = sum(p[0] for p in ring) / len(ring); cz = sum(p[1] for p in ring) / len(ring)
                for i in range(len(ring)):
                    a, c = ring[i], ring[(i + 1) % len(ring)]
                    L = math.hypot(c[0] - a[0], c[1] - a[1])
                    if L < 2.5: continue
                    nx, nz = (c[1] - a[1]) / L, -(c[0] - a[0]) / L
                    mx, mz = (a[0] + c[0]) / 2, (a[1] + c[1]) / 2
                    if nx * (mx - cx) + nz * (mz - cz) < 0: nx, nz = -nx, -nz
                    e = (a[0], a[1], c[0], c[1], nx, nz, b['id'], i)
                    n = max(1, int(L / 10))
                    for k in range(n + 1):
                        edges[(int(math.floor((a[0] + (c[0] - a[0]) * k / n) / 25)), int(math.floor((a[1] + (c[1] - a[1]) * k / n) / 25)))].append(e)
    core = json.loads(gzip.decompress(open(os.path.join(PACKS, '..', 'core.pack.wasm'), 'rb').read()))
    places = {norm(p['name']) for p in core['places']}
    cen = {bid: (sum(p[0] for p in b['ring']) / len(b['ring']), sum(p[1] for p in b['ring']) / len(b['ring'])) for bid, b in bld.items()}
    kgrid = defaultdict(list)
    for bid, c in cen.items():
        for k in known.get(bid, []): kgrid[(int(c[0] // 50), int(c[1] // 50))].append((c, k))
    seq = {r['image']: r['sequence'] for r in recs if r.get('sequence')}
    for path in ('mly_images.json',):
        fp = os.path.join(BUILD, path)
        if os.path.exists(fp):
            for im in json.load(open(fp)): seq[im['id']] = im.get('sequence')
    fp = os.path.join(BUILD, 'mly_images_city.jsonl')
    if os.path.exists(fp):
        for line in open(fp):
            for im in json.loads(line)['imgs']: seq[im['id']] = im.get('sequence')
    squash = lambda t: t.replace(' ', '')
    def known_near(bid, n):
        c = cen[bid]
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for (q, k) in kgrid.get((int(c[0] // 50) + i, int(c[1] // 50) + j), ()):
                    if math.hypot(q[0] - c[0], q[1] - c[1]) < 60 and fuzz.partial_ratio(squash(n), squash(k)) >= 80: return True
        return False
    print('photos', len(recs), 'buildings near cameras', len(bld), flush=True)

    def cast(x, z, dx, dz):
        best = None
        seen = set()
        for s in range(0, 50, 5):
            c = (int(math.floor((x + dx * s) / 25)), int(math.floor((z + dz * s) / 25)))
            for e in edges.get(c, ()):
                if id(e) in seen: continue
                seen.add(id(e))
                ax, az, bx, bz, nx, nz, bid, i = e
                if nx * dx + nz * dz > -0.25: continue                     # the front must face the camera
                ex, ez = bx - ax, bz - az
                den = dx * ez - dz * ex
                if abs(den) < 1e-6: continue
                t = ((ax - x) * ez - (az - z) * ex) / den                  # distance along the ray
                u = ((ax - x) * dz - (az - z) * dx) / den                  # position along the edge
                if 2 < t < 45 and 0 <= u <= 1 and (best is None or t < best[0]): best = (t, bid, i, u)
        return best

    hits = defaultdict(list)
    n_read = n_good = n_hit = 0
    for r in recs:
        x, z = cams[r['image']]
        w = r['w']; cam = r.get('camera') or []
        f = cam[0] * max(r['w'], r['h']) if cam and cam[0] and cam[0] > 0.2 else 0.8 * w
        year = int(1970 + r['captured_at'] / 1000 / 31557600)
        for tx in r['texts']:
            n_read += 1
            text = clean(tx['text'])
            if not good_text(text, tx['conf']): continue
            n_good += 1
            cxp = sum(p[0] for p in tx['box']) / 4
            b = math.radians((r['compass'] + math.degrees(math.atan((cxp - w / 2) / f))) % 360)
            h = cast(x, z, math.sin(b), -math.cos(b))
            if not h: continue
            n_hit += 1
            hits[h[1]].append(dict(text=text, n=norm(text), conf=tx['conf'], image=r['image'], year=year, edge=h[2], u=h[3], cam=(x, z)))
    out = []
    for bid, hs in hits.items():
        clusters = []
        for hh in sorted(hs, key=lambda q: -q['conf']):
            for c in clusters:
                if fuzz.ratio(hh['n'], c[0]['n']) >= 82: c.append(hh); break
            else: clusters.append([hh])
        for c in clusters:
            imgs = {q['image'] for q in c}
            if len(imgs) < 2: continue
            spread = max(math.hypot(a['cam'][0] - b2['cam'][0], a['cam'][1] - b2['cam'][1]) for a in c for b2 in c)
            if spread < 2: continue                                     # same spot twice is not a second sighting
            runs = {seq.get(q['image']) for q in c if seq.get(q['image']) is not None}
            mconf = sum(q['conf'] for q in c) / len(c)
            # independent evidence: two separate photo runs, or three photos read confidently
            if not (len(runs) >= 2 or (len(imgs) >= 3 and mconf >= 0.85)): continue
            if known_near(bid, c[0]['n']): continue                 # already a named shop here or next door
            if any(fuzz.ratio(c[0]['n'], pl) >= 88 for pl in places): continue      # a locality name painted on a board
            votes = defaultdict(float)
            for q in c: votes[q['text']] += q['conf']
            text = respace(max(votes.items(), key=lambda kv: kv[1])[0])
            if not name_like(text): continue
            ec = defaultdict(int)
            for q in c: ec[q['edge']] += 1
            edge = max(ec.items(), key=lambda kv: kv[1])[0]
            us = sorted(q['u'] for q in c if q['edge'] == edge)
            out.append(dict(building=bid, edge=edge, u=us[len(us) // 2], text=text, group=group_of(norm(text)), seen=len(imgs),
                            year=max(q['year'] for q in c), images=sorted(imgs)[:5]))
    # a shop's main board is the most-photographed text; taglines under it are not separate shops
    byb = defaultdict(list)
    for o in out: byb[o['building']].append(o)
    out = [o for l in byb.values() for o in sorted(l, key=lambda o: -o['seen'])[:2]]
    # several names on one front share it in slots, left to right
    by_edge = defaultdict(list)
    for o in out: by_edge[(o['building'], o['edge'])].append(o)
    boards = []
    for (bid, ei), l in by_edge.items():
        l.sort(key=lambda o: o['u'])
        ring = bld[bid]['ring']; a, c = ring[ei], ring[(ei + 1) % len(ring)]
        fn, key = where[bid]
        for k, o in enumerate(l[:4]):
            uid = 'm_' + hashlib.sha1(f"{bid}|{o['text']}".encode()).hexdigest()[:12]
            boards.append(dict(pack=fn, tile=key, board=dict(id=uid, text=o['text'], full=o['text'], group=o['group'], tier='P', conf=0.6,
                               a=[round(a[0], 1), round(a[1], 1)], b=[round(c[0], 1), round(c[1], 1)], t=round(o['u'], 3),
                               slot=dict(floor=0, index=k, of=min(4, len(l))), building=bid, road=None, seen=o['seen'], seen_year=o['year'], photos=o['images'], source='mapillary_ocr',
                               verification='automated_photo_match_candidate',
                               placement_verification='ray_cast_facade_candidate_unreviewed',
                               sources=image_sources(o['images'], records_by_id))))
    json.dump(boards, open(os.path.join(BUILD, 'ocr_photo_boards.json'), 'w'), indent=0)
    rep = dict(photos=len(recs), readings=n_read, shop_like=n_good, hit_a_front=n_hit, new_boards=len(boards), buildings=len({b['board']['building'] for b in boards}),
               packs=len({b['pack'] for b in boards}))
    json.dump(rep, open(os.path.join(BUILD, 'ocr_photo_report.json'), 'w'), indent=1)
    print(json.dumps(rep), flush=True)
    for b in sorted(boards, key=lambda b: -b['board']['seen'])[:40]: print(b['board']['seen'], b['board']['seen_year'], b['board']['group'], b['board']['text'])
    if apply:
        os.makedirs(os.path.join(BUILD, 'prev_pack_photo'), exist_ok=True)
        byp = defaultdict(list)
        for b in boards: byp[b['pack']].append(b)
        for fn, l in byp.items():
            src = os.path.join(PACKS, fn); bak = os.path.join(BUILD, 'prev_pack_photo', fn)
            if not os.path.exists(bak): shutil.copy2(src, bak)
            d = json.loads(gzip.decompress(open(src, 'rb').read()))
            added = 0
            for b in l:
                bd = dict(b['board'])
                bd['source'] = 'mapillary_ocr'
                bd['verification'] = 'automated_photo_candidate'
                tb = d['tiles'][b['tile']]['boards']
                if any(x['id'] == bd['id'] for x in tb): continue
                # share the shop front with the named shops already on it, left to right; a full front gets nothing more
                same = lambda x: x['building'] == bd['building'] and (x.get('slot') or {}).get('floor', 0) == 0 and (
                    (math.dist(x['a'], bd['a']) < 1.5 and math.dist(x['b'], bd['b']) < 1.5) or (math.dist(x['a'], bd['b']) < 1.5 and math.dist(x['b'], bd['a']) < 1.5))
                on = [x for x in tb if same(x)]
                if len(on) >= 3: continue
                pos = lambda x: ((x['slot']['index'] + 0.5) / x['slot']['of'] if x['slot'].get('of', 1) > 1 else x['t']) if math.dist(x['a'], bd['a']) < 1.5 else \
                    1 - ((x['slot']['index'] + 0.5) / x['slot']['of'] if x['slot'].get('of', 1) > 1 else x['t'])
                group = sorted(on + [bd], key=lambda x: bd['t'] if x is bd else pos(x))
                for k, x in enumerate(group): x['slot'] = dict(x['slot'], index=k, of=len(group))
                tb.append(bd); added += 1
            print(fn, 'photo boards', added, 'of', len(l), flush=True)
            open(src, 'wb').write(gzip.compress(json.dumps(d, separators=(',', ':')).encode(), 9))
        print('packs updated', len(byp), flush=True)

if __name__ == '__main__':
    main('--apply' in sys.argv)
