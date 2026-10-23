"""Step 1d (part 1, fast): read shop boards from Mapillary street photos (CC-BY-SA 4.0) with RapidOCR (PaddleOCR on ONNX).

~0.6 s per photo on two CPU cores instead of ~55 s with EasyOCR, and at least as accurate on Latin boards.
ZONE=hero  reads the RTC X Roads selection of mapillary_ocr.py (build/mly_images.json).
ZONE=spots photo clusters around the busiest shop spots of every 500 m cell (two photo runs must see a board).
ZONE=city  lists photos across the whole map inside the ORR, keeps recent ones on shop streets (spread evenly over
           500 m cells, round-robin so a partial run still covers the city) and reads them.
Appends to build/ocr_rapid.jsonl (hero) or build/ocr_rapid_city.jsonl (city) (same record format as ocr_raw_v2.jsonl, plus engine); resumable.
Images are processed in memory and discarded; only text + geometry + the image id (for attribution) are kept.
Needs MAPILLARY_TOKEN in the environment.
"""
import argparse, json, math, os, sys, time, urllib.request, urllib.parse, threading, queue
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from ocr_state import BUILD as BUILD_PATH, heading, output_path, placement_density, read_jsonl, record_paths, shard_for, worker_lock
from mapillary_metadata import prepare_metadata, parse_bbox
from mapillary_access import load_token, dependency_status

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = str(BUILD_PATH)
TOKEN = load_token()
ZONE = os.environ.get('ZONE', 'hero')
CITY = (17.235, 78.245, 17.625, 78.665)          # lat0, lon0, lat1, lon1: the ORR and a little beyond
MAX_CITY = int(os.environ.get('MAX_IMAGES', '6000'))
PER_CELL = int(os.environ.get('PER_CELL', '18'))
OUT = os.path.join(BUILD, 'ocr_rapid.jsonl' if ZONE == 'hero' else 'ocr_rapid_city.jsonl')     # city and spots share a file
FIELDS = 'id,captured_at,compass_angle,computed_compass_angle,geometry,computed_geometry,camera_parameters,camera_type,sequence,thumb_1024_url,thumb_2048_url,width,height,is_pano'

def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r: return r.read()
        except Exception:
            if k == tries - 1: raise
            time.sleep(3 * (k + 1))

def geo(im): return (im.get('computed_geometry') or im['geometry'])['coordinates']

def list_city(bounds=None, max_cells=4, max_pages=2):
    result = prepare_metadata(bounds, max_cells=max_cells, max_pages=max_pages, build=BUILD, token=TOKEN)
    print('metadata', json.dumps(result['metadata']), flush=True)
    return result['images']

def pick_city(imgs):
    """recent photos on shop streets, at most PER_CELL per 500 m cell, interleaved across cells"""
    dens = placement_density()
    imgs.sort(key=lambda i: -i['captured_at'])
    last = defaultdict(list); kept = []
    for im in imgs:
        g = geo(im); seq = im.get('sequence')
        if any(math.hypot((g[0] - q[0]) * 106000, (g[1] - q[1]) * 110574) < 25 for q in last[seq]): continue
        last[seq].append(g)
        k = (round(g[1] / 0.00036), round(g[0] / 0.00038))
        d = sum(dens.get((k[0] + a, k[1] + b), 0) for a in (-1, 0, 1) for b in (-1, 0, 1))
        # Keep coverage on streets with no mapped names; those are the places
        # where photographs can reveal missing businesses. Density ranks only.
        d = max(1, d)
        year = 1970 + im['captured_at'] / 1000 / 31557600
        kept.append((d * (1.6 if year >= 2022 else 1.0), im))
    cells = defaultdict(list)
    for s, im in kept:
        g = geo(im); cells[(int(g[1] / 0.0045), int(g[0] / 0.0047))].append((s, im))
    for c in cells.values(): c.sort(key=lambda t: -t[0]); del c[PER_CELL:]
    order = []; rnd = 0
    while len(order) < MAX_CITY:
        added = False
        for c in cells.values():
            if rnd < len(c): order.append(c[rnd][1]); added = True
        if not added: break
        rnd += 1
    return order[:MAX_CITY]

def pick_spots(imgs):
    """clusters of photos around the busiest shop spots: up to SPOT_N photos within 40 m of each spot, drawn from as many
    different photo runs as possible, so a board is seen independently twice. Spots: the densest ~36 m cells of named
    shops, SPOTS_PER_CELL per 500 m cell, interleaved across the city."""
    dens = placement_density()
    per = int(os.environ.get('SPOTS_PER_CELL', '3')); spot_n = int(os.environ.get('SPOT_N', '14'))
    cells = defaultdict(list)
    for k, d in dens.items():
        if d >= int(os.environ.get('DENS_MIN', '6')): cells[(int(k[0] * 0.00036 / 0.0045), int(k[1] * 0.00038 / 0.0047))].append((d, k))
    spots = []
    for c in cells.values():
        c.sort(reverse=True); taken = []
        for d, k in c:
            if len(taken) >= per: break
            if any(abs(k[0] - t[0]) + abs(k[1] - t[1]) < 4 for t in taken): continue      # spots at least ~150 m apart
            taken.append(k)
        spots.append([(k[0] * 0.00036, k[1] * 0.00038) for k in taken])
    grid = defaultdict(list)
    for im in imgs:
        g = geo(im); grid[(int(g[1] / 0.0004), int(g[0] / 0.0004))].append(im)
    def around(lat, lon):
        out = []
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for im in grid.get((int(lat / 0.0004) + i, int(lon / 0.0004) + j), ()):
                    g = geo(im)
                    if math.hypot((g[0] - lon) * 106000, (g[1] - lat) * 110574) < 40: out.append(im)
        by_seq = defaultdict(list)
        for im in sorted(out, key=lambda i: -i['captured_at']):
            l = by_seq[im.get('sequence')]
            g = geo(im)
            if any(math.hypot((g[0] - q[0]) * 106000, (g[1] - q[1]) * 110574) < 6 for q in (geo(x) for x in l)): continue
            l.append(im)
        pick = []; r = 0
        seqs = sorted(by_seq.values(), key=lambda l: -l[0]['captured_at'])
        while len(pick) < spot_n and any(r < len(l) for l in seqs):
            for l in seqs:
                if r < len(l) and len(pick) < spot_n: pick.append(l[r])
            r += 1
        return pick if len({i.get('sequence') for i in pick}) >= 2 else []
    order, seen = [], set(); rnd = 0
    while len(order) < MAX_CITY:
        added = False
        for sp in spots:
            if rnd < len(sp):
                added = True
                for im in around(*sp[rnd]):
                    if im['id'] not in seen: seen.add(im['id']); order.append(im)
        if not added: break
        rnd += 1
    return order[:MAX_CITY]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', help='Shared selected-image JSON manifest; prepare it once before starting workers')
    parser.add_argument('--prepare', action='store_true', help='Refresh a bounded metadata batch and its manifest; do not run OCR')
    parser.add_argument('--bbox', type=parse_bbox, help='Restrict selected images: south,west,north,east')
    parser.add_argument('--max-cells', type=int, default=4, help='Maximum new/partial metadata cells per run (default: 4)')
    parser.add_argument('--max-pages', type=int, default=2, help='Maximum pages per cell sub-box per run (default: 2)')
    parser.add_argument('--shards', type=int, default=1)
    parser.add_argument('--shard-index', type=int, default=0)
    parser.add_argument('--max-new', type=int, default=0, help='Bound this run; 0 processes all pending images')
    args = parser.parse_args()
    if args.max_cells < 1 or args.max_pages < 1:
        parser.error('max-cells and max-pages must be positive')
    if args.shards < 1 or not 0 <= args.shard_index < args.shards or args.max_new < 0:
        parser.error('Use shards >= 1, 0 <= shard-index < shards, max-new >= 0')
    if args.shards > 1 and (not args.manifest or not os.path.exists(args.manifest)):
        parser.error('Parallel workers require a prepared --manifest; list metadata once before sharding')
    os.makedirs(BUILD, exist_ok=True)
    if args.manifest and os.path.exists(args.manifest) and not args.prepare:
        sel = json.load(open(args.manifest))['images']
    else:
        sel = select_images(bounds=args.bbox, max_cells=args.max_cells, max_pages=args.max_pages)
    if args.prepare:
        if not args.manifest:
            parser.error('--prepare needs --manifest')
        from pathlib import Path
        manifest = Path(args.manifest)
        manifest.parent.mkdir(parents=True, exist_ok=True)
        status_path = Path(BUILD) / 'mly_prepare_status.json'
        metadata = json.loads(status_path.read_text()) if status_path.exists() else {}
        temporary = manifest.with_suffix(manifest.suffix + '.tmp')
        temporary.write_text(json.dumps(dict(zone=ZONE, images=sel, metadata=metadata)))
        temporary.replace(manifest)
        print('prepared', len(sel), 'images', flush=True)
        return
    out = output_path(ZONE, args.shard_index, args.shards)
    with worker_lock(out):
        read_jsonl(out, repair_tail=True)
        done = {str(r['image']) for path in record_paths() for r in read_jsonl(path)}
        todo = [im for im in sel if str(im['id']) not in done and shard_for(im['id'], args.shards) == args.shard_index]
        if args.max_new:
            todo = todo[:args.max_new]
        print('zone', ZONE, 'selected', len(sel), 'pending in shard', len(todo), flush=True)
        if not todo:
            return
        readiness = dependency_status()
        if readiness['status'] != 'ready':
            print('ocr_readiness', json.dumps(readiness), flush=True)
            parser.error('OCR dependencies missing: ' + ', '.join(readiness['missingPackages']))
        process(todo, out)

def pending_images(images):
    """Do not let the selection cap repeatedly select already processed photos."""
    done = {str(r['image']) for path in record_paths(BUILD) for r in read_jsonl(path)}
    return [im for im in images if str(im['id']) not in done]


def select_images(bounds=None, max_cells=4, max_pages=2):
    if ZONE == 'hero':
        sys.path.insert(0, HERE)
        import mapillary_ocr as old
        imgs = list_city(bounds or old.HERO, max_cells, max_pages)
        # Retain support for the original hero cache, including offline runs.
        hero_path = os.path.join(BUILD, 'mly_images.json')
        if not imgs and os.path.exists(hero_path):
            from mapillary_metadata import in_bounds
            imgs = [im for im in json.load(open(hero_path)) if in_bounds(im, bounds or old.HERO)]
        imgs = pending_images(imgs)
        return old.pick(imgs) if imgs else []
    imgs = pending_images(list_city(bounds, max_cells, max_pages))
    if not imgs:
        return []
    return pick_spots(imgs) if ZONE == 'spots' else pick_city(imgs)

def process(todo, out):
    import numpy as np, cv2
    from rapidocr_onnxruntime import RapidOCR
    eng = RapidOCR()
    q = queue.Queue(maxsize=12)
    def fetch(im):
        try: return im, get(im.get('thumb_2048_url') or im['thumb_1024_url'])
        except Exception as e: return im, None
    def producer():
        with ThreadPoolExecutor(4) as ex:
            for item in ex.map(fetch, todo): q.put(item)
        q.put(None)
    threading.Thread(target=producer, daemon=True).start()
    t0 = time.time(); n = 0
    with open(out, 'a') as f:
        while True:
            item = q.get()
            if item is None: break
            im, raw = item
            if raw is None: print('skip', im['id'], flush=True); continue
            try:
                full = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
                if full is None: continue
                H0 = full.shape[0]; y0, y1 = int(H0 * 0.18), int(H0 * 0.66)     # shop boards sit in the middle band
                res, _ = eng(full[y0:y1])
            except Exception as e:
                print('skip', im['id'], str(e)[:80], flush=True); continue
            h, w = full.shape[:2]
            texts = [dict(text=t, conf=round(float(c), 3), box=[[int(p[0]), int(p[1]) + y0] for p in b]) for b, t, c in (res or []) if float(c) >= 0.25 and len(t.strip()) >= 2]
            g = geo(im)
            rec = dict(image=str(im['id']), captured_at=im['captured_at'], lon=g[0], lat=g[1], compass=heading(im),
                       camera=im.get('camera_parameters'), camera_type=im.get('camera_type'), w=w, h=h, texts=texts, engine='rapidocr',
                       sequence=im.get('sequence'), source_url=f"https://www.mapillary.com/app/?pKey={im['id']}", license='CC-BY-SA-4.0')
            f.write(json.dumps(rec, ensure_ascii=False) + '\n'); f.flush()
            n += 1
            if n % 100 == 0: print(f'{n}/{len(todo)} images, {round((time.time() - t0) / n, 2)} s/img', flush=True)
    print('done', n, flush=True)

if __name__ == '__main__':
    main()
