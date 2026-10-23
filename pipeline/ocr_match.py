"""Step 1d (part 2): match Mapillary OCR readings to placed boards.

For every text read in a photo we know the camera position and heading, so each reading is a ray.
A reading confirms a board when its text fuzzy-matches a placed business name that lies along that ray (<=70 m).
Strong readings that match nothing, seen from two or more cameras whose rays cross at a building front, become new
'photo-only' boards. Output: build/ocr_matches.json, build/ocr_new_boards.json, build/ocr_report.json
"""
import json, math, os, re
from collections import defaultdict
from rapidfuzz import fuzz
from ocr_state import BUILD as BUILD_PATH, record_paths, read_jsonl

HERE = os.path.dirname(__file__); BUILD = str(BUILD_PATH)
GENERIC = set('''OPEN SALE SHOP STORE STORES HOTEL RESTAURANT RESTAURANTS COLLECTION COLLECTIONS PVT LTD ROAD HYDERABAD TELANGANA PHONE
CELL WWW COM FASHION FASHIONS MEN WOMEN KIDS NEW SRI SREE SHREE THE AND FOR CENTRE CENTER MOBILE MOBILES MART BAZAR BAZAAR TRADERS
ENTERPRISES AGENCIES ELECTRICALS MEDICAL MEDICALS CLINIC HOSPITAL BANK ATM NO PARKING STOP BUS EXIT ENTRY WAY IN OUT ONLY
FREE OFFER BEST QUALITY BRANDED SHOWROOM TEXTILES SAREES TAILORS BAKERY SWEETS CAFE TEA COFFEE JUICE CHICKEN BIRYANI MUTTON VEG NONVEG
DIAL CALL CONTACT MOB TEL INDIA PRIVATE LIMITED ROADS CROSS X RTC GOVT GOVERNMENT POLICE TRAFFIC SCHOOL COLLEGE ACADEMY
CINEMA THEATRE THEATER INSTITUTE COACHING CLASSES'''.split())
M_LAT = 110574.0

def norm(s): return re.sub(r'[^A-Z0-9 ]+', ' ', s.upper()).strip()
def informative(t):
    toks = [w for w in norm(t).split() if len(w) > 1]
    return [w for w in toks if w not in GENERIC and not w.isdigit()]

def load_records():
    # readings from every engine/run, merged per photo (a text read by both engines counts once, best confidence kept)
    recs = {}
    for path in record_paths(BUILD):
        for r in read_jsonl(path):
            r['image'] = str(r['image']); cur = recs.get(r['image'])
            if not cur: recs[r['image']] = r; continue
            for key in ('sequence', 'source_url', 'license'):
                if not cur.get(key) and r.get(key): cur[key] = r[key]
            have = {norm(t['text']): t for t in cur['texts']}
            for t in r['texts']:
                k = norm(t['text'])
                if k not in have or t['conf'] > have[k]['conf']: have[k] = t
            cur['texts'] = list(have.values())
    return recs

def main():
    P = json.load(open(os.path.join(BUILD, 'placements.json')))          # citywide (the RTC hero set is a subset)
    boards = []
    for p in P:
        if p.get('status') != 'placed' or p.get('flags'): continue
        (a, b) = p['facade_ll']; t = p['facade']['t']
        boards.append(dict(uid=p['uid'], name=p['name'], board=p['board'], lat=a[0] + (b[0] - a[0]) * t, lon=a[1] + (b[1] - a[1]) * t,
                           n=norm(p['board']), info=set(informative(p['board']))))
    grid = defaultdict(list)
    for b in boards: grid[(int(b['lat'] / 0.0007), int(b['lon'] / 0.0007))].append(b)
    matches = defaultdict(lambda: dict(seen=0, images=[], texts=defaultdict(float), year=0))
    rays = []  # unmatched strong readings
    n_img = n_txt = n_hit = 0
    recs = load_records()
    for r in recs.values():
        n_img += 1
        if r.get('compass') is None: continue
        kx = 111320 * math.cos(math.radians(r['lat']))
        w = r['w']; cam = r.get('camera') or []
        f = cam[0] * max(r['w'], r['h']) if cam and cam[0] and cam[0] > 0.2 else 0.8 * w
        year = int(1970 + r['captured_at'] / 1000 / 31557600)
        gy, gx = int(r['lat'] / 0.0007), int(r['lon'] / 0.0007)
        near = [b for dy in (-1, 0, 1) for dx in (-1, 0, 1) for b in grid.get((gy + dy, gx + dx), [])]
        for tx in r['texts']:
            if tx['conf'] < 0.35: continue
            text = tx['text'].strip(); info = informative(text)
            if not info or sum(c.isalpha() for c in text) < 4: continue
            n_txt += 1
            cx = sum(p[0] for p in tx['box']) / 4
            bearing = (r['compass'] + math.degrees(math.atan((cx - w / 2) / f))) % 360
            best, bs = None, 0
            for b in near:
                dy = (b['lat'] - r['lat']) * M_LAT; dx = (b['lon'] - r['lon']) * kx
                d = math.hypot(dx, dy)
                if d > 70 or d < 2: continue
                ang = math.degrees(math.atan2(dx, dy)) % 360
                off = abs((ang - bearing + 180) % 360 - 180)
                if off > 14: continue
                s1 = fuzz.partial_ratio(' '.join(info), b['n']) if len(' '.join(info)) >= 4 else 0
                s2 = max((fuzz.ratio(wd, bw) for wd in info for bw in b['info']), default=0)
                s = max(s1, s2 if len(max(info, key=len)) >= 5 else 0)
                if s < 82: continue
                score = s / 100 * tx['conf'] * (1 - off / 30) * (1 - d / 140)
                if score > bs: bs, best = score, b
            if best:
                n_hit += 1
                m = matches[best['uid']]; m['seen'] += 1; m['images'].append(r['image']); m['year'] = max(m['year'], year)
                m['texts'][norm(text)] += tx['conf']
            elif tx['conf'] >= 0.6 and len(' '.join(info)) >= 5:
                rays.append(dict(text=norm(text), info=' '.join(info), lat=r['lat'], lon=r['lon'], bearing=bearing, conf=tx['conf'], image=r['image'], year=year))
    by_uid = {b['uid']: b for b in boards}
    out = {}
    for uid, m in matches.items():
        b = by_uid[uid]
        best_text = max(m['texts'].items(), key=lambda kv: kv[1])[0]
        # adopt the photographed spelling only when it is clearly the same name
        use = best_text if fuzz.ratio(best_text, b['n']) >= 88 and 3 <= len(best_text) <= 40 else None
        out[uid] = dict(seen=m['seen'], year=m['year'], images=m['images'][:5], text=use)
    # photo-only boards: two rays from different cameras that cross within 60 m with the same text
    newb = []
    by_text = defaultdict(list)
    for r in rays: by_text[r['info']].append(r)
    for info, rs in by_text.items():
        if len(rs) < 2: continue
        pts = []
        for i in range(len(rs)):
            for j in range(i + 1, len(rs)):
                a, b = rs[i], rs[j]
                if a['image'] == b['image']: continue
                kx = 111320 * math.cos(math.radians(a['lat']))
                ax, ay = 0, 0; bx, by = (b['lon'] - a['lon']) * kx, (b['lat'] - a['lat']) * M_LAT
                da = (math.sin(math.radians(a['bearing'])), math.cos(math.radians(a['bearing'])))
                db = (math.sin(math.radians(b['bearing'])), math.cos(math.radians(b['bearing'])))
                den = da[0] * db[1] - da[1] * db[0]
                if abs(den) < 0.15: continue
                ta = ((bx - ax) * db[1] - (by - ay) * db[0]) / den
                tb = ((bx - ax) * da[1] - (by - ay) * da[0]) / den
                if not (3 < ta < 60 and 3 < tb < 60): continue
                pts.append((a['lat'] + da[1] * ta / M_LAT, a['lon'] + da[0] * ta / kx))
        if pts:
            lat = sum(p[0] for p in pts) / len(pts); lon = sum(p[1] for p in pts) / len(pts)
            text = max(rs, key=lambda r: r['conf'])['text']
            newb.append(dict(text=text, lat=lat, lon=lon, sightings=len(rs), year=max(r['year'] for r in rs), images=[r['image'] for r in rs][:5]))
    json.dump(out, open(os.path.join(BUILD, 'ocr_matches.json'), 'w'), indent=0)
    json.dump(newb, open(os.path.join(BUILD, 'ocr_new_boards.json'), 'w'), indent=0)
    rep = dict(images=n_img, readings=n_txt, matched_readings=n_hit, boards_confirmed=len(out), spelling_updates=sum(1 for v in out.values() if v['text']),
               photo_only_boards=len(newb), placed_boards_in_zone=len(boards))
    json.dump(rep, open(os.path.join(BUILD, 'ocr_report.json'), 'w'), indent=1)
    print(json.dumps(rep, indent=1))
    for uid, v in sorted(out.items(), key=lambda kv: -kv[1]['seen'])[:25]:
        b = by_uid[uid]; print(v['seen'], v['year'], b['board'], '->', v['text'])
    for nb in newb[:20]: print('NEW', nb['text'], nb['sightings'], nb['year'])

if __name__ == '__main__':
    main()
