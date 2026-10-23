"""Bounded, resumable Mapillary metadata collection; no OCR or pack writes."""
import json
import math
import os
from pathlib import Path
import urllib.parse
import urllib.request
from ocr_state import BUILD, PACKS, read_jsonl, worker_lock
from mapillary_access import load_token, dependency_status
from ocr_candidates import read_origin, to_ll

CITY = (17.235, 78.245, 17.625, 78.665)  # south, west, north, east
FIELDS = 'id,captured_at,compass_angle,computed_compass_angle,geometry,computed_geometry,camera_parameters,camera_type,sequence,thumb_1024_url,thumb_2048_url,width,height,is_pano'


def validate_bbox(bounds):
    if len(bounds) != 4 or not all(math.isfinite(n) for n in bounds):
        raise ValueError('bbox must contain four finite values: south,west,north,east')
    s, w, n, e = bounds
    if not (-90 <= s < n <= 90 and -180 <= w < e <= 180):
        raise ValueError('bbox must satisfy south < north and west < east')
    return tuple(bounds)


def parse_bbox(value):
    return validate_bbox(tuple(float(x) for x in value.split(',')))


def playable_bounds(packs=PACKS):
    """Use the shipped core extent, which reaches beyond the legacy ORR bbox."""
    import gzip
    path = Path(packs).parent / 'core.pack.wasm'
    if not path.exists():
        return CITY
    core = json.loads(gzip.decompress(path.read_bytes()))
    origin = (float(core['origin']['lat']), float(core['origin']['lon']))
    extent = core['bounds']
    south, west = to_ll(extent['minX'], extent['maxZ'], origin)
    north, east = to_ll(extent['maxX'], extent['minZ'], origin)
    return south, west, north, east


def cells_for(bounds):
    """Stable grid, extended to include all requested playable-map edges."""
    s, w, n, e = validate_bbox(bounds)
    row_start = math.floor((s - CITY[0]) / .01 + 1e-8)
    row_end = math.ceil((n - CITY[0]) / .01 - 1e-8)
    col_start = math.floor((w - CITY[1]) / .01 + 1e-8)
    col_end = math.ceil((e - CITY[1]) / .01 - 1e-8)
    for row in range(row_start, row_end):
        y = round(CITY[0] + row * .01, 3)
        for col in range(col_start, col_end):
            yield y, round(CITY[1] + col * .01, 3)


def prioritized_cells(cells, origin):
    """Center-out order uses the same origin for every bbox and keeps cache keys."""
    cos_lat = math.cos(math.radians(origin[0]))
    return sorted(cells, key=lambda c: (((c[0] + .005 - origin[0]) ** 2 +
                                         ((c[1] + .005 - origin[1]) * cos_lat) ** 2), c))

def cell_key(cell):
    return f'{cell[0]},{cell[1]}'


def in_bounds(image, bounds):
    geometry = image.get('computed_geometry') or image.get('geometry') or {}
    coords = geometry.get('coordinates', [])
    return len(coords) >= 2 and bounds[0] <= coords[1] <= bounds[2] and bounds[1] <= coords[0] <= bounds[3]


def request_page(bbox, token, after=None):
    query = dict(access_token=token, fields=FIELDS, bbox=','.join(map(str, bbox)), limit=2000)
    if after:
        query['after'] = after
    # Do not log this URL, the raw exception, or any returned pagination URL.
    with urllib.request.urlopen('https://graph.mapillary.com/images?' + urllib.parse.urlencode(query), timeout=30) as response:
        return json.load(response)


def next_cursor(page):
    paging = page.get('paging') or {}
    if not paging.get('next'):
        return None
    cursor = (paging.get('cursors') or {}).get('after')
    if not cursor:
        cursor = urllib.parse.parse_qs(urllib.parse.urlsplit(paging['next']).query).get('after', [None])[0]
    if not cursor:
        raise ValueError('Pagination is present but no resumable cursor was returned')
    return cursor


def prepare_metadata(bounds=None, max_cells=4, max_pages=2, build=BUILD, token=None, fetch=request_page):
    """At most max_cells * 4 * max_pages requests, serialized and checkpointed.

    Completed legacy cell caches are reused. Partial cells store only a pagination
    cursor, never the next-page URL (which may contain the access token). Failed
    cells remain pending and all returned errors are limited to exception class.
    """
    bounds = validate_bbox(bounds if bounds is not None else playable_bounds())
    if max_cells < 1 or max_pages < 1:
        raise ValueError('max_cells and max_pages must be positive')
    build = Path(build)
    build.mkdir(parents=True, exist_ok=True)
    token = load_token() if token is None else token
    cache_path = build / 'mly_images_city.jsonl'
    progress_path = build / 'mly_metadata_progress.jsonl'
    with worker_lock(cache_path):
        done = {r['cell']: r for r in read_jsonl(cache_path, repair_tail=True)}
        partial = {r['cell']: r for r in read_jsonl(progress_path, repair_tail=True)}
        try:
            origin = read_origin(PACKS)
        except FileNotFoundError:
            origin = ((CITY[0] + CITY[2]) / 2, (CITY[1] + CITY[3]) / 2)
        cells = prioritized_cells(cells_for(bounds), origin)
        todo = [c for c in cells if cell_key(c) not in done]
        errors, requests, visited = [], 0, 0
        for cell in todo[:max_cells] if token else []:
            visited += 1
            key = cell_key(cell)
            record = partial.get(key, dict(cell=key, imgs=[], boxes={}))
            images = {str(im['id']): im for im in record['imgs']}
            for i, (dy, dx) in enumerate((dy, dx) for dy in (0, .005) for dx in (0, .005)):
                box = record['boxes'].setdefault(str(i), dict(complete=False, after=None))
                if box['complete']:
                    continue
                bbox = (round(cell[1] + dx, 6), round(cell[0] + dy, 6), round(cell[1] + dx + .005, 6), round(cell[0] + dy + .005, 6))
                for _ in range(max_pages):
                    try:
                        requests += 1
                        page = fetch(bbox, token, box['after'])
                        if 'error' in page or not isinstance(page.get('data'), list):
                            raise ValueError('Mapillary did not return an image data page')
                        after = next_cursor(page)
                        if after is not None and after == box['after']:
                            raise ValueError('Mapillary returned a repeated pagination cursor')
                        for im in page['data']:
                            if im.get('is_pano') or not (im.get('thumb_2048_url') or im.get('thumb_1024_url')):
                                continue
                            if im.get('captured_at', 0) < 1546300800000:
                                continue
                            images[str(im['id'])] = im
                        box.update(after=after, complete=after is None)
                        record['imgs'] = list(images.values())
                        with progress_path.open('a') as out:
                            out.write(json.dumps(record) + '\n')
                        partial[key] = record
                        if box['complete']:
                            break
                    except Exception as error:
                        errors.append(dict(cell=key, box=i, error=type(error).__name__))
                        break
            if len(record['boxes']) == 4 and all(b['complete'] for b in record['boxes'].values()):
                completed = dict(cell=key, imgs=list(images.values()))
                with cache_path.open('a') as out:
                    out.write(json.dumps(completed) + '\n')
                done[key] = completed
        images = {}
        for cell in cells:
            record = done.get(cell_key(cell), partial.get(cell_key(cell), {}))
            for im in record.get('imgs', []):
                if in_bounds(im, bounds):
                    images[str(im['id'])] = im
        remaining = sum(cell_key(c) not in done for c in cells)
        status = 'complete' if not remaining else 'missing_token' if not token else 'partial_errors' if errors else 'partial'
        report = dict(status=status, cellOrder='center_out', tokenConfigured=bool(token), bbox=list(bounds), totalCells=len(cells),
                      visitedCells=visited, completedCells=len(cells) - remaining, remainingCells=remaining,
                      requests=requests, maxRequests=max_cells * 4 * max_pages, cachedImages=len(images), errors=errors, ocrReadiness=dependency_status())
        (build / 'mly_prepare_status.json').write_text(json.dumps(report, indent=2) + '\n')
        return dict(images=list(images.values()), metadata=report)
