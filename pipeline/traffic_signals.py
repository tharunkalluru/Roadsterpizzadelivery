"""Import source-mapped city traffic signals without rewriting any street pack.

Only the authoritative optional core trafficSignals/source fields are replaced.
Legacy furniture remains in the original packs as evidence; the runtime uses this
source list instead of legacy/generated lights. Timings are game simulation, not
an assertion of live Hyderabad controller plans. No network or credentials.
"""
import argparse
import collections
import copy
import gzip
import hashlib
import json
import math
from pathlib import Path
from ocr_state import BUILD, worker_lock
from orr_geometry import atomic_pack

ROOT = Path(__file__).resolve().parents[1]
CITY = ROOT / 'game/public/city'
DEFAULT_EVIDENCE = ROOT / 'pipeline/evidence/citywide-traffic-signals-2026-10-26.json'
DENIED = {'private', 'no', 'customers', 'permit'}


def projection(origin):
    return (math.cos(math.radians(origin['lat'])) * 6380050.094 * math.pi / 180,
            6341141.9 * math.pi / 180)


def project(lat, lon, origin):
    kx, kz = projection(origin)
    return [round((lon - origin['lon']) * kx, 3), round(-(lat - origin['lat']) * kz, 3)]


def incoming_directions(node_id, way, origin):
    """Original source order supplies the two incoming tangents, not cardinal axes."""
    ids, geom = way.get('nodes', []), way.get('geometry', [])
    if len(ids) != len(geom) or node_id not in ids:
        return None
    i = ids.index(node_id)
    if len(ids) < 2 or any(not isinstance(p, dict) or not all(math.isfinite(p.get(k, math.nan)) for k in ('lat', 'lon')) for p in geom):
        return None
    pts = [project(p['lat'], p['lon'], origin) for p in geom]
    def heading(a, b):
        x, z = b[0] - a[0], b[1] - a[1]
        length = math.hypot(x, z)
        return [round(x / length, 8), round(z / length, 8)] if length > .01 else None
    forward = heading(pts[i - 1], pts[i]) if i else heading(pts[i], pts[i + 1])
    backward = heading(pts[i + 1], pts[i]) if i + 1 < len(ids) else heading(pts[i], pts[i - 1])
    if forward is None or backward is None:
        return None
    return {'wayId': f'way/{way["id"]}', 'forwardHeading': forward, 'backwardHeading': backward,
            'nodeRole': 'start' if i == 0 else 'end' if i == len(ids) - 1 else 'interior',
            'tags': copy.deepcopy(way.get('tags', {}))}


def prepare(core, evidence):
    if evidence.get('source') != 'OpenStreetMap' or not evidence.get('retrievedAt') or not evidence.get('sourceDataTimestamp'):
        raise ValueError('Missing original OSM source/retrieval metadata')
    if not str(evidence.get('sourceUrl', '')).startswith('https://') or not evidence.get('query'):
        raise ValueError('Missing verified-source URL or query')
    south, west, north, east = evidence['bounds']
    if not (-90 < south < north < 90 and -180 < west < east < 180):
        raise ValueError('Invalid evidence bounds')
    if 'bounds' in core:
        kx, kz = projection(core['origin']); b = core['bounds']; origin = core['origin']
        wanted = [origin['lat'] - b['maxZ'] / kz, origin['lon'] + b['minX'] / kx,
                  origin['lat'] - b['minZ'] / kz, origin['lon'] + b['maxX'] / kx]
        if south > wanted[0] + 1e-6 or west > wanted[1] + 1e-6 or north < wanted[2] - 1e-6 or east < wanted[3] - 1e-6:
            raise ValueError('Refusing a partial-bounds replacement of the city signal source')
    ways = collections.defaultdict(list)
    for way in evidence.get('elements', []):
        if way.get('type') == 'way' and way.get('tags', {}).get('highway'):
            for node in set(way.get('nodes', [])):
                ways[node].append(way)
    signals, excluded, seen = [], [], set()
    for n in evidence.get('elements', []):
        if n.get('type') != 'node':
            continue
        tags = n.get('tags', {}); is_signal = tags.get('highway') == 'traffic_signals' or tags.get('crossing') == 'traffic_signals'
        if not is_signal:
            continue
        if not isinstance(n.get('id'), int) or n['id'] <= 0 or n['id'] in seen:
            raise ValueError('Duplicate/invalid original node identity')
        seen.add(n['id'])
        if not n.get('timestamp') or not isinstance(n.get('version'), int):
            raise ValueError('Missing original node version/timestamp')
        lat, lon = n.get('lat', math.nan), n.get('lon', math.nan)
        if not all(math.isfinite(v) for v in (lat, lon)) or not (south - 1e-6 <= lat <= north + 1e-6 and west - 1e-6 <= lon <= east + 1e-6):
            raise ValueError('Invalid/out-of-query signal coordinate')
        if tags.get('access') in DENIED:
            excluded.append({'id': n['id'], 'reason': 'Not a public-access mapped signal', 'tags': tags})
            continue
        incident = sorted(ways[n['id']], key=lambda w: w['id'])
        directions = [d for w in incident if (d := incoming_directions(n['id'], w, core['origin'])) is not None]
        signals.append({'kind': 'traffic_signals', 'id': f'osm:n{n["id"]}', 'name': tags.get('name:en') or tags.get('name'),
                        'p': project(lat, lon, core['origin']), 'source': 'OpenStreetMap',
                        'sourceURL': f'https://www.openstreetmap.org/node/{n["id"]}',
                        'retrievedAt': evidence['retrievedAt'], 'sourceTimestamp': n['timestamp'],
                        'sourceVersion': n['version'], 'tags': copy.deepcopy(tags),
                        'sourceWayIds': [f'way/{w["id"]}' for w in incident], 'mappedDirections': directions})
    if not signals:
        raise ValueError('Refusing empty source replacement')
    signals.sort(key=lambda s: s['id'])
    # A truncated Overpass response can still be valid JSON; do not silently
    # discard a previously larger authoritative source list.
    previous = len(core.get('trafficSignals', []))
    if previous and len(signals) < previous * .8:
        raise ValueError('Source population dropped by over20%; explicit source review required')
    metadata = {'schemaVersion': 1, 'source': 'OpenStreetMap', 'sourceURL': evidence['sourceUrl'],
                'retrievedAt': evidence['retrievedAt'], 'sourceDataTimestamp': evidence['sourceDataTimestamp'],
                'bounds': evidence['bounds'], 'license': evidence.get('license', 'OpenStreetMap contributors, ODbL 1.0'),
                'querySha256': hashlib.sha256(evidence['query'].encode()).hexdigest(),
                'sourceSignalNodes': len(seen), 'retainedPublicSignalNodes': len(signals), 'excluded': excluded,
                'uncertainty': 'Mapped signal nodes, not an exhaustive current city inventory or surveyed pole/stop-line placement. Controller phases and timings are simulated; original source way directions/levels remain available.'}
    report = {'sourceSignalNodes': len(seen), 'retainedPublicSignalNodes': len(signals), 'excluded': excluded,
              'withIncidentWays': sum(bool(s['sourceWayIds']) for s in signals),
              'mappedDirectionRecords': sum(len(s['mappedDirections']) for s in signals),
              'directionTaggedNodes': sum('traffic_signals:direction' in s['tags'] for s in signals),
              'metadataOnlyCorePatch': True, 'streetPacksRewritten': 0, 'source': metadata}
    return signals, metadata, report


def apply(city, core, signals, metadata):
    if core.get('trafficSignals') == signals and core.get('trafficSignalSource') == metadata:
        return {'coreChanged': False, 'streetPacksRewritten': 0}
    # Do not mutate the caller's original manifest/data during preparation.
    result = dict(core); result['trafficSignals'] = signals; result['trafficSignalSource'] = metadata
    atomic_pack(city / 'core.pack.wasm', result)
    return {'coreChanged': True, 'streetPacksRewritten': 0}


def load(path):
    return json.loads(gzip.decompress(path.read_bytes()))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--city', type=Path, default=CITY); p.add_argument('--evidence', type=Path, default=DEFAULT_EVIDENCE)
    p.add_argument('--report', type=Path, default=ROOT / 'pipeline/evidence/citywide-signals-import-2026-10-26.json')
    p.add_argument('--apply', action='store_true'); args = p.parse_args()
    with worker_lock(BUILD / 'shopfront-apply'), worker_lock(BUILD / 'traffic-signals'):
        core = load(args.city / 'core.pack.wasm'); evidence = json.loads(args.evidence.read_text())
        signals, metadata, report = prepare(core, evidence)
        if args.apply:
            report.update(apply(args.city, core, signals, metadata))
        report['applied'] = args.apply
        args.report.parent.mkdir(parents=True, exist_ok=True); args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
        print(json.dumps({k: v for k, v in report.items() if k != 'source'}, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
