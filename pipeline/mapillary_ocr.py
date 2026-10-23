"""Step 1d (part 1): read shop boards from Mapillary street photos (CC-BY-SA 4.0) in the hero zone.

Lists images, keeps a spread of the most recent ones along each sequence, downloads the 1024px thumbnails,
runs English + Telugu OCR and appends results to build/ocr_raw.jsonl (resumable).
Needs MAPILLARY_TOKEN in the environment. Images are processed and discarded; only text + geometry is kept,
with the image id so every reading stays attributable to its Mapillary photo.
"""
import json, math, os, sys, time, urllib.request, urllib.parse
from collections import defaultdict

HERE = os.path.dirname(__file__)
BUILD = os.path.join(HERE, 'build'); os.makedirs(BUILD, exist_ok=True)
TOKEN = os.environ['MAPILLARY_TOKEN']
HERO = (17.388, 78.478, 17.416, 78.508)
MAX_IMAGES = int(os.environ.get('MAX_IMAGES', '1200'))
FIELDS = 'id,captured_at,compass_angle,computed_compass_angle,geometry,computed_geometry,camera_parameters,camera_type,sequence,thumb_1024_url,thumb_2048_url,width,height,is_pano'

def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r: return r.read()
        except Exception as e:
            if k == tries - 1: raise
            time.sleep(3 * (k + 1))

def list_images():
    path = os.path.join(BUILD, 'mly_images.json')
    if os.path.exists(path): return json.load(open(path))
    out, step = {}, 0.004
    y = HERO[0]
    while y < HERO[2]:
        x = HERO[1]
        while x < HERO[3]:
            bbox = f'{x},{y},{min(x + step, HERO[3])},{min(y + step, HERO[2])}'
            url = f'https://graph.mapillary.com/images?access_token={urllib.parse.quote(TOKEN)}&fields={FIELDS}&bbox={bbox}&limit=2000'
            for im in json.loads(get(url)).get('data', []): out[im['id']] = im
            x += step
        y += step
    imgs = list(out.values())
    json.dump(imgs, open(path, 'w'))
    return imgs

def board_density():
    # placed boards per ~40 m cell, so photos on shop streets are read first
    from collections import Counter
    P = json.load(open(os.path.join(BUILD, 'placements_hero.json')))
    c = Counter()
    for p in P:
        if p.get('status') == 'placed' and not p.get('flags'): c[(round(p['lat'] / 0.00036), round(p['lon'] / 0.00038))] += 1
    return c

def pick(imgs):
    # newest first; one image per ~9 m per sequence; skip 360 panoramas (their thumbnails distort boards)
    imgs = [i for i in imgs if not i.get('is_pano') and i.get('thumb_1024_url')]
    imgs.sort(key=lambda i: -i['captured_at'])
    kept, last = [], defaultdict(list)
    for im in imgs:
        g = (im.get('computed_geometry') or im['geometry'])['coordinates']
        seq = im.get('sequence')
        close = any(math.hypot((g[0] - q[0]) * 106000, (g[1] - q[1]) * 110574) < 9 for q in last[seq])
        if close: continue
        last[seq].append(g); kept.append(im)
    # cap, but spread across years: always keep everything from 2022+, then fill with older
    dens = board_density()
    def score(im):
        g = (im.get('computed_geometry') or im['geometry'])['coordinates']
        k = (round(g[1] / 0.00036), round(g[0] / 0.00038))
        d = sum(dens.get((k[0] + a, k[1] + b), 0) for a in (-1, 0, 1) for b in (-1, 0, 1))
        year = 1970 + im['captured_at'] / 1000 / 31557600
        return d * (1.6 if year >= 2022 else 1.0 if year >= 2019 else 0.55)
    kept.sort(key=score, reverse=True)
    return [i for i in kept if score(i) > 3][:MAX_IMAGES]

def main():
    imgs = list_images()
    sel = pick(imgs)
    print('listed', len(imgs), 'selected', len(sel), flush=True)
    done = set()
    outp = os.path.join(BUILD, 'ocr_raw_v2.jsonl')
    if os.path.exists(outp):
        for line in open(outp): done.add(json.loads(line)['image'])
    import easyocr, numpy as np, cv2
    reader = easyocr.Reader(['en'], gpu=False, verbose=False)   # Latin boards are enough to match names; faster and cleaner
    t0 = time.time(); n = 0
    with open(outp, 'a') as f:
        for im in sel:
            if im['id'] in done: continue
            try:
                raw = get(im.get('thumb_2048_url') or im['thumb_1024_url'])
                full = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
                if full is None: continue
                # shop boards sit in the middle band of a street photo: read only that band at full resolution
                H0 = full.shape[0]; y0, y1 = int(H0 * 0.18), int(H0 * 0.66)
                arr = full[y0:y1]
                res = reader.readtext(arr, paragraph=False, min_size=14, text_threshold=0.6, low_text=0.35, mag_ratio=1.0)
                res = [([[p[0], p[1] + y0] for p in b], t, c) for b, t, c in res]
            except Exception as e:
                print('skip', im['id'], str(e)[:80], flush=True); continue
            h, w = full.shape[:2]
            texts = [dict(text=t, conf=round(float(c), 3), box=[[int(p[0]), int(p[1])] for p in b]) for b, t, c in res if c >= 0.25 and len(t.strip()) >= 2]
            g = (im.get('computed_geometry') or im['geometry'])['coordinates']
            rec = dict(image=im['id'], captured_at=im['captured_at'], lon=g[0], lat=g[1],
                       compass=im.get('computed_compass_angle') or im.get('compass_angle'),
                       camera=im.get('camera_parameters'), camera_type=im.get('camera_type'), w=w, h=h, texts=texts)
            f.write(json.dumps(rec, ensure_ascii=False) + '\n'); f.flush()
            n += 1
            if n % 25 == 0: print(f'{n} images, {round((time.time() - t0) / n, 2)} s/img', flush=True)
    print('done', n, flush=True)

if __name__ == '__main__':
    main()
