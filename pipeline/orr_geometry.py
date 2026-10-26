"""Repair ORR lane counts and continuous model grades from cached OSM evidence.

No network calls. XY, IDs, connectivity, boards and buildings are preserved. Bridge
heights are an explicit game approximation, not surveyed elevations. Run --report
first, then --apply to serialize atomic pack updates and refresh manifest sizes.
"""
import argparse
import collections
import fcntl
import gzip
import heapq
import json
import math
import os
from pathlib import Path
import tempfile

from shapely.geometry import LineString, Point
from shapely.strtree import STRtree
from ocr_state import BUILD, worker_lock

ROOT = Path(__file__).resolve().parents[1]
CITY = ROOT / 'game/public/city'
MODEL_DECK = 6.8
APPROACH = 300.0
# These existing mapped connectors are ramps despite their older road class.
# The two Kokapet ways form the mapped Neopolis trumpet; no new road is invented.
RAMP_IDS = {'03b6c86e-c5f_0', '779c4ba6-e7f_0', 'de9b8119-6aa_0'}


def is_orr(e):
    return e['cls'] == 'motorway' and e.get('name') == 'Outer Ring Road'


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def distances(adj, seeds):
    out = dict(seeds)
    heap = [(d, k) for k, d in out.items()]
    heapq.heapify(heap)
    while heap:
        d, k = heapq.heappop(heap)
        if d != out[k]:
            continue
        for nxt, length in adj[k]:
            nd = d + length
            if nd < out.get(nxt, math.inf):
                out[nxt] = nd
                heapq.heappush(heap, (nd, nxt))
    return out


def prepare(core, evidence, supplements=()):
    roads = core['roads']
    inc = collections.defaultdict(list)
    for e in roads:
        for end in ('from', 'to'):
            if e.get(end):
                inc[e[end]].append(e)
    selected = {e['id']: e for e in roads if is_orr(e)}
    queue = list(selected.values())
    for e in queue:
        for end in ('from', 'to'):
            for nxt in inc[e.get(end)]:
                if nxt['id'] not in selected and (nxt['cls'] == 'motorway_link' or nxt['id'] in RAMP_IDS):
                    selected[nxt['id']] = nxt
                    queue.append(nxt)
    if len(selected) < 150:
        raise ValueError('Incomplete ORR network; refusing a partial import')
    added_vertices = 0
    for old in list(selected.values()):
        dense = [old['pts'][0]]
        for a, b in zip(old['pts'], old['pts'][1:]):
            count = max(1, math.ceil((math.dist(a, b) - .001) / 10))
            for k in range(1, count):
                dense.append([round(a[0] + (b[0] - a[0]) * k / count, 4), round(a[1] + (b[1] - a[1]) * k / count, 4)])
            dense.append(b)
        added_vertices += len(dense) - len(old['pts'])
        selected[old['id']] = dict(old, pts=dense)
    origin = core['origin']
    kx = math.cos(math.radians(origin['lat'])) * 6380050.094 * math.pi / 180
    kz = 6341141.900 * math.pi / 180
    bridge_rows = []
    for row in evidence['elements'] + [row for extra in supplements for row in extra['elements']]:
        tags = row.get('tags', {})
        if tags.get('bridge') not in ('yes', 'viaduct'):
            continue
        if tags.get('highway') == 'motorway' and tags.get('name') != 'Outer Ring Road':
            continue
        pts = [((p['lon'] - origin['lon']) * kx, -(p['lat'] - origin['lat']) * kz) for p in row.get('geometry', [])]
        if len(pts) < 2:
            continue
        line = LineString(pts)
        if line.length >= 18:  # do not build expressway decks over tiny drains
            bridge_rows.append((row, line))
    if not bridge_rows:
        raise ValueError('No source bridge geometry')
    bridge_rows = list({row['id']: (row, line) for row, line in bridge_rows}.values())
    tree = STRtree([line for _, line in bridge_rows])
    adj = collections.defaultdict(list)
    keys, points, tangents = {}, {}, {}
    for e in selected.values():
        ek = []
        for i, p in enumerate(e['pts']):
            nid = e.get('from') if i == 0 else e.get('to') if i == len(e['pts']) - 1 else None
            key = 'n:' + nid if nid else f"p:{e['id']}:{i}"
            ek.append(key)
            points[key] = p
            a, b = e['pts'][max(0, i - 1)], e['pts'][min(len(e['pts']) - 1, i + 1)]
            length = math.dist(a, b) or 1
            tangents[(e['id'], key)] = ((b[0] - a[0]) / length, (b[1] - a[1]) / length)
        keys[e['id']] = ek
        for a, b in zip(ek, ek[1:]):
            length = math.dist(points[a], points[b])
            adj[a].append((b, length))
            adj[b].append((a, length))
    seeds, matched = {}, set()
    for e in selected.values():
        cls = 'motorway' if is_orr(e) else 'motorway_link'
        for key in keys[e['id']]:
            p = Point(points[key])
            for idx in tree.query(p.buffer(2.5)):
                row, line = bridge_rows[idx]
                allowed = {cls, e['cls']} if e['id'] in RAMP_IDS else {cls}
                if row['tags'].get('highway') not in allowed or line.distance(p) > 2.5:
                    continue
                d = line.project(p)
                a, b = line.interpolate(max(0, d - 3)), line.interpolate(min(line.length, d + 3))
                length = a.distance(b) or 1
                hx, hz = tangents[(e['id'], key)]
                if abs((b.x - a.x) * hx + (b.y - a.y) * hz) / length < .94:
                    continue  # a crossing at another level is not a bridge match
                seeds[key] = 0.0
                matched.add(row['id'])
    bridge_dist = distances(adj, seeds)
    # Endpoints connecting to unchanged city streets must remain at their original
    # junction height. Their mapped grades are usually ground level.
    boundary = {}
    for e in selected.values():
        for end, key in [('from', keys[e['id']][0]), ('to', keys[e['id']][-1])]:
            others = [o for o in inc[e.get(end)] if o['id'] not in selected]
            if others:
                ys = [(o.get('elev') or [0])[0 if o.get('from') == e[end] else -1] for o in others]
                if max(ys) > .2:
                    raise ValueError(f'Unresolved elevated boundary {e[end]}; needs manual grade review')
                boundary[key] = 0.0
    boundary_dist = distances(adj, boundary)
    heights = {}
    for key in points:
        y = MODEL_DECK * (1 - smooth(bridge_dist.get(key, math.inf) / APPROACH))
        y = min(y, MODEL_DECK * smooth(boundary_dist.get(key, math.inf) / APPROACH))
        heights[key] = round(y, 3)
    source = evidence['sourceUrl']
    patches = {}
    for e in selected.values():
        elev = [heights[k] for k in keys[e['id']]]
        metadata = dict(controlled=is_orr(e), ramp=not is_orr(e), throughLanes=4 if is_orr(e) else e['lanes'],
                        sources=[source] + [s['sourceUrl'] for s in supplements], sourceDate=evidence['sourceDataTimestamp'],
                        uncertainty='Mapped alignment; bridge deck heights and approach grades are game approximations, not a survey')
        change = dict(pts=e['pts'], elev=elev if max(elev) > .001 else None, w=e['w'], lanes=e['lanes'], expressway=metadata)
        if is_orr(e):
            # 14m for four 3.5m through lanes; shoulder dimensions are a model
            # assumption. Auxiliary acceleration/deceleration tapers render at ramps.
            change.update(w=17.5, lanes=4)
            metadata.update(laneWidth=3.5, shoulders=[2.5, 1.0])
        patches[e['id']] = change
    max_grade = max(abs(heights[a] - heights[b]) / length for a in adj for b, length in adj[a] if length > .01)
    if max_grade > .041:
        raise ValueError(f'Grade limit exceeded: {max_grade:.4f}')
    return patches, dict(roads=len(selected), mainCarriagewayEdges=sum(is_orr(e) for e in selected.values()),
                         matchedBridgeWays=len(matched), sourceBridgeWays=len(bridge_rows),
                         unmatchedBridgeWays=[dict(id=row['id'], cls=row['tags'].get('highway'),
                                                   distanceToNetwork=round(min(line.distance(LineString(e['pts'])) for e in selected.values()), 2))
                                              for row, line in bridge_rows if row['id'] not in matched],
                         maxGrade=round(max_grade, 5), estimatedDeckHeight=MODEL_DECK, approachLength=APPROACH,
                         alignmentChanged=False, addedCollinearVertices=added_vertices)


def atomic_pack(path, value):
    blob = gzip.compress(json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode(), compresslevel=7, mtime=0)
    fd, temp = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as out:
            out.write(blob)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--supplement', type=Path, action='append', default=[])
    parser.add_argument('--city', type=Path, default=CITY)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    lock_path = ROOT / 'pipeline/build/orr-geometry.lock'
    lock_path.parent.mkdir(exist_ok=True)
    with worker_lock(BUILD / 'shopfront-apply'), lock_path.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        core_path = args.city / 'core.pack.wasm'
        core = json.loads(gzip.decompress(core_path.read_bytes()))
        evidence = json.loads(args.evidence.read_text())
        patches, report = prepare(core, evidence, [json.loads(p.read_text()) for p in args.supplement])
        report.update(applied=args.apply, evidence=str(args.evidence.resolve().relative_to(ROOT)), sourceDataTimestamp=evidence['sourceDataTimestamp'])
        if args.apply:
            copies = 0
            for pack in core['packs']:
                path = args.city / pack['file']
                data = json.loads(gzip.decompress(path.read_bytes()))
                changed = False
                for tile in data['tiles'].values():
                    for road in tile['roads']:
                        patch = patches.get(road['id'])
                        if patch and any(road.get(k) != v for k, v in patch.items()):
                            road.update(patch)
                            copies += 1
                            changed = True
                if changed:
                    atomic_pack(path, data)
                pack['bytes'] = path.stat().st_size
            for road in core['roads']:
                if road['id'] in patches:
                    road.update(patches[road['id']])
            atomic_pack(core_path, core)
            report['roadCopiesUpdated'] = copies
        args.report.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
