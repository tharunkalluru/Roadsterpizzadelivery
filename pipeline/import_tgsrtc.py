"""Extract representative published TGSRTC stop patterns, without altering city packs.

The feed has stop sequences but no shapes. Road paths between stops are inferred
by the game and are never described as surveyed routes or live bus positions.
"""
import argparse
import collections
import csv
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import os
import tempfile
import zipfile

SOURCE = 'https://data.opencity.in/dataset/88e2d145-7ec6-4666-88dd-6cf18b18312e/resource/1b0d18bb-b2fb-4a79-8ed0-1e071da5790c/download/telangana_opendata_gtfs_tgsrtc_08_february_2026.zip'


def extract(archive, core):
    z = zipfile.ZipFile(archive)
    def rows(name):
        return csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8-sig'))
    info = list(rows('feed_info.txt'))[0]
    stops = {r['stop_id']: r for r in rows('stops.txt')}
    routes = {r['route_id']: r for r in rows('routes.txt')}
    trips = {r['trip_id']: r for r in rows('trips.txt')}
    sequences = collections.defaultdict(list)
    for r in rows('stop_times.txt'):
        if r['trip_id'] in trips:
            sequences[r['trip_id']].append((int(r['stop_sequence']), r['stop_id']))
    patterns = collections.defaultdict(collections.Counter)
    representatives = {}
    mismatched = 0
    for tid, seq in sequences.items():
        t = trips[tid]
        # Several depot trips have another route's name in the feed. Never give
        # a 217C trip a 219 board just because it was grouped under that ID.
        if t['trip_short_name'].split('-')[0].strip().upper() != t['route_id'].upper():
            mismatched += 1
            continue
        key = (t['route_id'], t['direction_id'])
        seq = tuple(sid for _, sid in sorted(seq))
        patterns[key][seq] += 1
        representatives.setdefault((key, seq), tid)
    origin, bounds = core['origin'], core['bounds']
    kx = math.cos(math.radians(origin['lat'])) * 6380050.094 * math.pi / 180
    kz = 6341141.9 * math.pi / 180
    output = []
    used = {}
    rejected = collections.Counter()
    for key, variants in sorted(patterns.items()):
        # Keep the most frequent useful full pattern in each published direction,
        # rather than a depot short-working selected by an arbitrary first row.
        for seq, frequency in variants.most_common():
            ids = []
            for sid in seq:
                if sid not in stops:
                    continue
                s = stops[sid]
                try:
                    lat, lon = float(s['stop_lat']), float(s['stop_lon'])
                except (ValueError, TypeError):
                    continue
                x, zz = round((lon-origin['lon'])*kx, 1), round(-(lat-origin['lat'])*kz, 1)
                if not math.isfinite(x+zz):
                    continue
                # The entire published sequence is retained for destination names;
                # only services with a playable section will be simulated.
                used[sid] = [s['stop_name'], x, zz]
                if not ids or ids[-1] != sid:
                    ids.append(sid)
            inside = sum(bounds['minX'] <= used[s][1] <= bounds['maxX'] and bounds['minZ'] <= used[s][2] <= bounds['maxZ'] for s in ids)
            if inside < 2 or len(ids) < 3:
                rejected['outside_or_short'] += 1
                continue
            tid = representatives[(key, seq)]
            output.append({'id': key[0] + ':' + key[1], 'number': routes[key[0]]['route_long_name'], 'direction': key[1],
                           'from': used[ids[0]][0], 'to': used[ids[-1]][0], 'stops': ids,
                           'tripId': tid, 'tripName': trips[tid]['trip_short_name'], 'publishedTrips': frequency})
            break
    used_ids = {s for r in output for s in r['stops']}
    return {'schema': 1, 'origin': origin, 'feed': info, 'source': SOURCE,
            'sourcePage': 'https://www.tgsrtc.telangana.gov.in/open-data',
            'sourceSha256': hashlib.sha256(Path(archive).read_bytes()).hexdigest(),
            'attribution': 'Contains data provided by TGSRTC',
            'uncertainty': 'Published February 2026 static stop patterns, not live operation. No shapes were supplied. Road paths between ordered stops are inferred on mapped legal roads; temporary diversions are unverified.',
            'sourceRouteCount': len(routes), 'excludedMismatchedTrips': mismatched,
            'stops': {s: used[s] for s in sorted(used_ids)}, 'patterns': output,
            'rejected': dict(rejected)}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--feed', required=True, type=Path)
    p.add_argument('--core', type=Path, default=Path('game/public/city/core.pack.wasm'))
    p.add_argument('--output', type=Path, default=Path('game/public/transit/tgsrtc.pack.wasm'))
    args = p.parse_args()
    data = extract(args.feed, json.loads(gzip.decompress(args.core.read_bytes())))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    blob = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode(), compresslevel=9, mtime=0)
    with tempfile.NamedTemporaryFile(dir=args.output.parent, prefix='.' + args.output.name, delete=False) as temporary:
        temporary.write(blob)
        name = temporary.name
    os.replace(name, args.output)
    print(json.dumps({'patterns': len(data['patterns']), 'stops': len(data['stops']), 'sourceRoutes': data['sourceRouteCount'],
                      'mismatchedTripsExcluded': data['excludedMismatchedTrips'], 'bytes': len(blob), 'sha256': data['sourceSha256']}))


if __name__ == '__main__':
    main()
