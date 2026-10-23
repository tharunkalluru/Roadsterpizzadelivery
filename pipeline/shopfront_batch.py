"""Reconcile source-backed shop names without guessing the order of shared frontages.

Workers: --evidence FILE --output FILE --shards N --shard-index I (read-only).
One coordinator: --apply REPORT [REPORT ...] (atomic, idempotent pack updates).
Only an exact OSM building outline with no ground-floor boards can gain a board
automatically. Its facade is still explicitly marked inferred, never Street View verified.
"""
import argparse
from collections import Counter, defaultdict
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
from ocr_state import BUILD, PACKS, shard_for, worker_lock

LAT0, LON0 = 17.4063, 78.4966
KX = math.cos(math.radians(LAT0)) * 6380050.094 * math.pi / 180
KZ = 6341141.900 * math.pi / 180


def norm(text):
    return re.sub(r'[^\w]+', ' ', text.casefold()).strip()


def xz(point):
    return [(point['lon'] - LON0) * KX, -(point['lat'] - LAT0) * KZ]


def point_segment(p, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / max(1e-9, dx * dx + dz * dz)))
    return math.dist(p, [a[0] + dx * t, a[1] + dz * t])


def outline_distance(a, b):
    def directed(left, right):
        return max(min(point_segment(p, q, right[(i + 1) % len(right)]) for i, q in enumerate(right)) for p in left)
    return max(directed(a, b), directed(b, a))


def board_point(board):
    return [board['a'][i] + (board['b'][i] - board['a'][i]) * board['t'] for i in range(2)]


def read_pack(path):
    return json.loads(gzip.decompress(path.read_bytes()))


def atomic_pack(path, data):
    blob = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode(), 6, mtime=0)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_bytes(blob)
    tmp.replace(path)
    return len(blob)


def group(tags):
    if tags.get('amenity') in ('restaurant', 'cafe', 'fast_food') or tags.get('shop') == 'bakery': return 'food'
    if tags.get('amenity') == 'pharmacy': return 'pharmacy'
    if tags.get('amenity') == 'bank': return 'finance'
    if tags.get('shop') in ('clothes', 'shoes', 'jewelry'): return 'fashion'
    return 'shop'


def reconcile(evidence, packs=PACKS, shard=0, shards=1):
    if evidence.get('schemaVersion') != 1 or evidence.get('source') != 'OpenStreetMap':
        raise ValueError('Expected schemaVersion 1 and original OpenStreetMap elements')
    if not evidence.get('retrievedAt') or not evidence.get('sourceUrl'):
        raise ValueError('Evidence needs retrievedAt and sourceUrl')
    if not 0 <= shard < shards:
        raise ValueError('Invalid shard assignment')
    loaded = {}
    results = []
    for e in sorted(evidence['elements'], key=lambda e: (e['type'], e['id'])):
        key = f"{e['type']}/{e['id']}"
        if shard_for(key, shards) != shard: continue
        tags = e.get('tags', {})
        name = (tags.get('name:en') or tags.get('name') or '').strip()
        if not name: continue
        location = e.get('center', e)
        if 'lat' not in location or 'lon' not in location:
            geometry = e.get('geometry') or []
            if not geometry: continue
            location = {k: sum(p[k] for p in geometry) / len(geometry) for k in ('lat', 'lon')}
        p = xz(location)
        source = dict(provider='OpenStreetMap', id=key, url=f'https://www.openstreetmap.org/{key}',
                      license='ODbL-1.0', retrievedAt=evidence['retrievedAt'], name=name,
                      point=[location['lat'], location['lon']], version=e.get('version'), timestamp=e.get('timestamp'))
        record = dict(source=source, status='needs_street_photo_review', reason='No unambiguous existing name or exact empty building outline')
        if tags.get('disused:shop') or tags.get('disused:amenity') or tags.get('opening_hours') == 'closed':
            record.update(status='excluded', reason='Source marks business disused/closed'); results.append(record); continue
        entries = []
        pi, pj = math.floor(p[0] / 3000), math.floor(p[1] / 3000)
        for i in range(pi - 1, pi + 2):
            for j in range(pj - 1, pj + 2):
                path = Path(packs) / f'p{i}_{j}.pack.wasm'
                if not path.exists(): continue
                if path.name not in loaded: loaded[path.name] = read_pack(path)
                for tile, data in loaded[path.name]['tiles'].items():
                    if abs((data['i'] + 0.5) * 1000 - p[0]) > 650 or abs((data['j'] + 0.5) * 1000 - p[1]) > 650: continue
                    entries.append((path.name, tile, data))
        matches = []
        source_id = f"b_{e['type'][0]}{e['id']}"
        for filename, tile, data in entries:
            for board in data['boards']:
                distance = math.dist(board_point(board), p)
                if (board['id'] == source_id and distance <= 80) or (norm(board.get('full', board['text'])) == norm(name) and distance <= 25):
                    matches.append((filename, tile, board, distance))
        # An exact existing source ID wins; duplicate nearby chain names remain review items.
        exact = [m for m in matches if m[2]['id'] == source_id]
        if len(exact) == 1: matches = exact
        if len(matches) == 1:
            filename, tile, board, distance = matches[0]
            record.update(status='existing_name_matched', reason='Same OSM ID or exact name within 25 m; facade/order remain unverified',
                          pack=filename, tile=tile, boardId=board['id'], name=board['text'], distanceM=round(distance, 2))
        elif matches:
            record['reason'] = 'Multiple nearby same-name boards; do not guess the branch or order'
        elif e['type'] == 'way' and tags.get('building') and len(e.get('geometry', [])) >= 4:
            ring = [xz(point) for point in e['geometry']]
            if math.dist(ring[0], ring[-1]) < 0.1: ring.pop()
            buildings = [(fn, tile, data, b) for fn, tile, data in entries for b in data['buildings']
                         if outline_distance(ring, b['ring']) <= 1.5]
            if len(buildings) == 1:
                filename, tile, data, building = buildings[0]
                if any(b['building'] == building['id'] and b.get('slot', {}).get('floor', 0) == 0 for b in data['boards']):
                    record['reason'] = 'Exact building has other ground-floor shops; street-photo order required'
                else:
                    segments = [(road, a, b) for road in data['roads'] if max(road.get('elev') or [0]) < 1.2
                                for a, b in zip(road['pts'], road['pts'][1:])]
                    edges = []
                    for i, a in enumerate(building['ring']):
                        b = building['ring'][(i + 1) % len(building['ring'])]
                        if math.dist(a, b) < 3: continue
                        midpoint = [(a[k] + b[k]) / 2 for k in range(2)]
                        for road, u, v in segments:
                            distance = point_segment(midpoint, u, v) - road['w'] / 2
                            if 0 <= distance <= 25: edges.append((distance, a, b, road))
                    if edges:
                        _, a, b, road = min(edges, key=lambda item: item[0])
                        board = dict(id=source_id, text=name, full=name, group=group(tags), tier='B', conf=0.6,
                                     a=a, b=b, t=0.5, slot=dict(floor=0, index=0, of=1), building=building['id'], road=road.get('name'),
                                     sources=[source], verification='mapped_name_exact_building_inferred_facade',
                                     placementMethod='OSM outline matches within 1.5 m; nearest road-facing edge; shop order not observed')
                        record.update(status='new_named_building', reason='Exact mapped building; sole ground-floor label, facade inferred',
                                      pack=filename, tile=tile, board=board)
        results.append(record)
    return dict(schemaVersion=1, evidenceSha256=hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest(),
                shardIndex=shard, shards=shards, summary=dict(Counter(r['status'] for r in results)), records=results)


def apply_reports(reports, packs=PACKS):
    packs = Path(packs)
    updates = defaultdict(list)
    for report in reports:
        for r in report['records']:
            if r['status'] in ('existing_name_matched', 'new_named_building'): updates[r['pack']].append(r)
    counts = Counter()
    with worker_lock(BUILD / 'shopfront-apply'):
        for filename, records in sorted(updates.items()):
            if Path(filename).name != filename or not filename.endswith('.pack.wasm'): raise ValueError('Invalid pack filename')
            path = packs / filename
            data = read_pack(path)
            changed = False
            for r in records:
                tile = data['tiles'][r['tile']]
                if r['status'] == 'new_named_building':
                    board = r['board']
                    existing = next((b for b in tile['boards'] if b['id'] == board['id']), None)
                    if existing: continue
                    if not any(b['id'] == board['building'] for b in tile['buildings']): raise ValueError('Building no longer present')
                    if any(b['building'] == board['building'] and b.get('slot', {}).get('floor', 0) == 0 for b in tile['boards']):
                        counts['skipped_changed_frontage'] += 1; continue
                    tile['boards'].append(board); counts['new_names'] += 1; changed = True
                else:
                    board = next((b for b in tile['boards'] if b['id'] == r['boardId']), None)
                    if not board: raise ValueError('Matched board no longer present')
                    sources = board.setdefault('sources', [])
                    if any(s['provider'] == r['source']['provider'] and s['id'] == r['source']['id'] for s in sources): continue
                    sources.append(r['source']); counts['source_links_added'] += 1; changed = True
            if changed:
                atomic_pack(path, data); counts['packs_changed'] += 1
        # Keep download-size metadata correct, including after an interrupted apply.
        core_path = packs.parent / 'core.pack.wasm'
        if core_path.exists():
            core = read_pack(core_path); changed = False
            for p in core['packs']:
                if Path(p['file']).name in updates:
                    size = (packs.parent / p['file']).stat().st_size
                    if p['bytes'] != size: p['bytes'] = size; changed = True
            if changed: atomic_pack(core_path, core)
    return dict(counts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--shards', type=int, default=1)
    parser.add_argument('--shard-index', type=int, default=0)
    parser.add_argument('--apply', nargs='+', type=Path)
    args = parser.parse_args()
    if args.apply:
        print(json.dumps(apply_reports([json.loads(p.read_text()) for p in args.apply]), indent=2)); return
    if not args.evidence or not args.output: parser.error('--evidence and --output are required')
    report = reconcile(json.loads(args.evidence.read_text()), shard=args.shard_index, shards=args.shards)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report['summary'], indent=2))


if __name__ == '__main__': main()
