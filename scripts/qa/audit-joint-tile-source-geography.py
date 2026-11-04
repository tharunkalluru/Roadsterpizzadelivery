"""Read-only official WGS84 endpoint audit for a bound joint tile input.

Full connector UUID agreement is topology evidence, not coordinate accuracy.
Reports source-normalized PRE-inferred and current inferred endpoints separately;
never changes the source generation, a road, a node, or a runtime manifest.
"""
import argparse
import collections
import gzip
import hashlib
import json
import math
import struct
from pathlib import Path
import geographiclib
from geographiclib.geodesic import Geodesic


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--joint-input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise RuntimeError('Refusing to overwrite prior evidence')
    if geographiclib.__version__ != '2.1':
        raise RuntimeError('Use the retained geographiclib==2.1 installation')
    held = {}

    def read(path, expected=None):
        path = Path(path)
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if expected and digest != expected:
            raise RuntimeError('Stale input ' + str(path))
        held[str(path.resolve())] = digest
        return raw

    joint = json.loads(read(args.joint_input))
    source = json.loads(read(joint['inputs']['sourceGeometry']['path'], joint['sourceDataSHA256']))
    model = json.loads(read(joint['inputs']['model']['path'], joint['sourceModelSHA256']))
    core = json.loads(gzip.decompress(read(joint['inputs']['rawCore']['path'], joint['sourceCoreSHA256'])))
    assert source['generationID'] == joint['sourceRoadGeometryGeneration'] == model['sourceRoadGeometryGeneration']
    origin = source['origin']
    kx = math.cos(math.radians(origin['lat'])) * origin['NR'] * math.pi / 180
    kz = origin['MR'] * math.pi / 180

    def project(lon, lat):
        return [(lon - origin['lon']) * kx, -(lat - origin['lat']) * kz]

    sources = joint['sourceEvidence']
    geo = {}
    for prefix, record in sources.items():
        row = record['row']
        if 'geometryWKB' not in row:
            continue
        raw = bytes.fromhex(row['geometryWKB'])
        endian = '<' if raw[0] == 1 else '>'
        kind, count = struct.unpack_from(endian + 'II', raw, 1)
        if kind != 2:
            raise RuntimeError('Non-LineString source ' + row['id'])
        points = [struct.unpack_from(endian + 'dd', raw, 9 + 16 * i) for i in range(count)]
        if len(raw) != 9 + 16 * count:
            raise RuntimeError('Unexpected source dimensions ' + row['id'])
        arc = [0.]
        azimuth = []
        for a, b in zip(points, points[1:]):
            inverse = Geodesic.WGS84.Inverse(a[1], a[0], b[1], b[0])
            arc.append(arc[-1] + inverse['s12'])
            azimuth.append(inverse['azi1'])
        geo[prefix] = (row, points, arc, azimuth)

    def official(prefix, node):
        if prefix not in geo:
            return None, 'missing-geographic-source'
        row, points, arc, azimuth = geo[prefix]
        controls = [c for c in row['connectors'] if c['connector_id'][:12] == node]
        if len(controls) != 1:
            return None, 'missing-or-ambiguous-full-connector'
        control = controls[0]
        distance = control['at'] * arc[-1]
        if not 0. <= control['at'] <= 1.:
            return None, 'nonphysical-source-fraction'
        i = 0
        while i < len(arc) - 2 and arc[i + 1] < distance:
            i += 1
        if distance <= 1e-10:
            lon, lat = points[0]
        elif distance >= arc[-1] - 1e-10:
            lon, lat = points[-1]
        else:
            point = Geodesic.WGS84.Direct(points[i][1], points[i][0], azimuth[i], distance - arc[i])
            lon, lat = point['lon2'], point['lat2']
        return {'connectorID': control['connector_id'], 'sourceSegmentID': row['id'],
                'officialFraction': control['at'], 'officialMetres': distance,
                'officialLonLat': [lon, lat], 'officialXZ': project(lon, lat)}, None

    current = {r['id']: r for r in [*joint['tileRoads'], *joint['boundaryRoads']]}
    core_ids = {a['id'] for node in joint['coreAnchorNodes'] for a in node['coreArms']}
    for road in model['roads']:
        if road['id'] in core_ids:
            current[road['id']] = road
    original = {r['id']: r for r in core['roads'] if r['id'] in core_ids}
    repairs = {r['id']: r for r in source['roads']}
    normalized = {ident: {**road, **({'pts': repairs[ident]['pts'], 'elev': repairs[ident]['elev']} if ident in repairs else {})}
                  for ident, road in original.items()}
    for group in [joint['copies'], joint['boundaryCopies']]:
        for ident, copies in group.items():
            owners = [copy for copy in copies if not copy['context']]
            signatures = {json.dumps(copy['sourceInput'], sort_keys=True) for copy in owners}
            if not owners or len(signatures) != 1:
                raise RuntimeError('Source owner missing/variant ' + ident)
            normalized[ident] = owners[0]['sourceInput']
    rows, unresolved = [], []
    nodes = collections.defaultdict(list)
    for ident, road in sorted(current.items()):
        old = normalized.get(ident)
        if not old:
            raise RuntimeError('Missing normalized original ' + ident)
        if road['from'] != old['from'] or road['to'] != old['to']:
            raise RuntimeError('Endpoint topology changed ' + ident)
        for end, index in [('from', 0), ('to', -1)]:
            node = road[end]
            if node is None:
                unresolved.append({'road': ident, 'end': end, 'reason': 'no-source-node'})
                continue
            proof, failure = official(ident.split('_')[0], node)
            if failure:
                unresolved.append({'road': ident, 'end': end, 'node': node, 'reason': failure})
                continue
            before, after = old['pts'][index], road['pts'][index]
            record = {'road': ident, 'end': end, 'node': node, **proof,
                      'sourceNormalizedXZ': before, 'currentInferredXZ': after,
                      'sourceNormalizedDeltaM': math.dist(before, proof['officialXZ']),
                      'currentInferredDeltaM': math.dist(after, proof['officialXZ']),
                      'explicitInferredMovementM': math.dist(before, after),
                      'sourceGeodeticPatchApplied': ident in repairs,
                      'sourceEntry': sources[ident.split('_')[0]]['path']}
            rows.append(record)
            nodes[node].append(record)
    node_rows = []
    for node, records in sorted(nodes.items()):
        def spread(key):
            return max((math.dist(a[key], b[key]) for i, a in enumerate(records) for b in records[i + 1:]), default=0.)
        node_rows.append({'node': node, 'fullConnectorIDs': sorted({r['connectorID'] for r in records}),
                          'arms': len(records), 'officialSpreadM': spread('officialXZ'),
                          'sourceNormalizedSpreadM': spread('sourceNormalizedXZ'),
                          'currentInferredSpreadM': spread('currentInferredXZ'),
                          'maximumSourceNormalizedDeltaM': max(r['sourceNormalizedDeltaM'] for r in records),
                          'maximumCurrentInferredDeltaM': max(r['currentInferredDeltaM'] for r in records)})
    summary = {'roads': len(current), 'sourcePrefixes': len({r.split('_')[0] for r in current}),
               'endpointRows': len(rows), 'unresolvedEndpoints': len(unresolved), 'nodes': len(node_rows),
               'preInferredEndpointsAbove75mm': sum(r['sourceNormalizedDeltaM'] > .075 for r in rows),
               'preInferredEndpointsAbove1m': sum(r['sourceNormalizedDeltaM'] > 1. for r in rows),
               'maximumPreInferredEndpointDeltaM': max(r['sourceNormalizedDeltaM'] for r in rows),
               'maximumCurrentInferredEndpointDeltaM': max(r['currentInferredDeltaM'] for r in rows),
               'currentNodesAbove1cmArmSpread': sum(r['currentInferredSpreadM'] > .01 for r in node_rows),
               'maximumCurrentNodeArmSpreadM': max(r['currentInferredSpreadM'] for r in node_rows),
               'officialNodesAbove75mmSourceDisagreement': sum(r['officialSpreadM'] > .075 for r in node_rows)}
    for path, digest in held.items():
        if hashlib.sha256(Path(path).read_bytes()).hexdigest() != digest:
            raise RuntimeError('Input changed during audit ' + path)
    output = {'version': 1, 'scope': __doc__, 'sourceRoadGeometryGeneration': source['generationID'],
              'geographiclib': geographiclib.__version__, 'inputs': held,
              'policy': {'noGeometryChanges': True, 'officialFractionsUseWGS84Metres': True,
                         'retainsCurrentInferredDisplacementsSeparately': True, 'roundingScreenM': .075,
                         'uuidTopologyDoesNotProveGeography': True, 'noImplicitSourceRepair': True},
              'summary': summary, 'rows': rows, 'nodes': node_rows, 'unresolved': unresolved}
    with args.output.open('x') as handle:
        json.dump(output, handle, separators=(',', ':'))
        handle.write('\n')
    print(json.dumps({'output': str(args.output), 'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest(), **summary}))


if __name__ == '__main__':
    main()
