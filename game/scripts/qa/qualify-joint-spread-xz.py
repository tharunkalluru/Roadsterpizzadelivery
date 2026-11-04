#!/usr/bin/env python3
"""Read-only XZ topology/width diagnostic on literal emitted Float32 triangles.

Dependencies are isolated outside the checkout. Never changes a source/model,
flattens a 3D point, constructs substitute pavement, or approves 3D driving.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shapely
from shapely.geometry import Point, Polygon, LineString, box, mapping
from shapely.ops import unary_union, nearest_points


def components(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'Polygon':
        return [geometry]
    return [g for g in geometry.geoms if g.geom_type == 'Polygon']


def common_component(geometry, ports):
    for i, component in enumerate(components(geometry)):
        if all(component.covers(Point(p)) for p in ports):
            return i
    return None


def common_gates(geometry, gates):
    for i, component in enumerate(components(geometry)):
        if all(not gate.is_empty and component.intersects(gate) for gate in gates):
            return i, [list(component.intersection(gate).representative_point().coords[0]) for gate in gates]
    return None, []


def qualify(query, physical_width=2.2):
    center = query['center']
    limit = box(center[0] - 30, center[1] - 30, center[0] + 30, center[1] + 30)
    polygons = []
    by_road = {}
    for record in query['triangles']:
        # Projection only. Original points, including distinct actual Y, remain
        # in the bound input artifact and are never rewritten to y=0.
        polygon = Polygon([(p[0], p[2]) for p in record['points']]).intersection(limit)
        if polygon.is_empty or polygon.area <= 1e-10:
            continue
        polygons.append(polygon)
        by_road.setdefault(record['road'], []).append(polygon)
    union = unary_union(polygons)
    ports = [arm['port'] for arm in query['arms']]
    road_unions = {key: unary_union(value) for key, value in by_road.items()}
    # Source centrelines can be offset at a miter. A real driver can choose a
    # lateral position across the arm, so test an exact finite cross-section
    # clipped to that arm's own emitted asphalt, not one mandatory center point.
    gates = []
    for arm in query['arms']:
        p = arm['port']
        if 'portHeading' in arm:
            hx, hz = arm['portHeading']
            half = arm['portWidth'] / 2
            gate = LineString([(p[0] + hz * half, p[1] - hx * half), (p[0] - hz * half, p[1] + hx * half)])
            gate = gate.intersection(road_unions.get(arm['id'], Polygon()))
        else:
            gate = Point(p)
        gates.append(gate)
    literal_component, chosen_literal = common_gates(union, gates)
    # A1mm conservative extra radius dominates GEOS's128-quarter-segment arc
    # approximation error (<.021mm here); no pavement margin is expanded.
    radius = physical_width / 2 + .001
    eroded = union.buffer(-radius, quad_segs=128)
    width_component, chosen_width = common_gates(eroded, gates)
    memberships = []
    for arm in query['arms']:
        p = Point(arm['port'])
        memberships.append({'road': arm['id'], 'end': arm['end'], 'port': arm['port'],
                            'literalComponents': [i for i, g in enumerate(components(union)) if g.covers(p)],
                            'widthComponents': [i for i, g in enumerate(components(eroded)) if g.covers(p)],
                            'distanceOutsideLiteral': p.distance(union) if not union.is_empty else None,
                            'distanceOutsideWidth': p.distance(eroded) if not eroded.is_empty else None})
    roads = list(road_unions)
    pair_distances = [{'roads': [a, b], 'literalXZDistance': road_unions[a].distance(road_unions[b])}
                      for i, a in enumerate(roads) for b in roads[i + 1:]]
    endpoint_y = [arm['declaredEndpointY'] for arm in query['arms']]
    actual_y = [p[1] - triangle['paintLift'] for triangle in query['triangles'] for p in triangle['points']]
    unresolved = list(query.get('unresolved', []))
    if unresolved:
        classification = 'unresolved-missing-bound-emitted-geometry'
    elif literal_component is None:
        classification = 'actual-emitted-XZ-disconnected'
    elif width_component is None:
        classification = 'actual-emitted-XZ-connected-but-width-unresolved'
    else:
        classification = 'actual-emitted-XZ-Roadster-width-connected'
    if classification != 'actual-emitted-XZ-Roadster-width-connected' and max(endpoint_y) - min(endpoint_y) > .25:
        unresolved.append('Current endpoint levels exceed the actual cap grouping threshold; final co-elevation/cap emission may change XZ connectivity. No source repair is inferred.')
    bottlenecks = []
    pieces = components(eroded)
    if width_component is None:
        for i, a in enumerate(pieces):
            for j, b in enumerate(pieces[i + 1:], i + 1):
                p, q = nearest_points(a, b)
                bottlenecks.append({'widthRegionComponents': [i, j], 'erodedRegionGap': p.distance(q),
                                    'boundaryPoints': [list(p.coords[0]), list(q.coords[0])],
                                    'midpoint': [(p.x + q.x) / 2, (p.y + q.y) / 2]})
    maximum_width = None
    if width_component is None and literal_component is not None:
        lo, hi = 0.0, radius
        for _ in range(18):
            mid = (lo + hi) / 2
            if common_gates(union.buffer(-mid, quad_segs=128), gates)[0] is None:
                hi = mid
            else:
                lo = mid
        maximum_width = {'passingDiskWidthLowerBound': lo * 2, 'failingDiskWidthUpperBound': hi * 2,
                         'scope': 'Approximated disk-width bottleneck over literal XZ union; not oriented full-car or3D clearance.'}
    return {'node': query['node'], 'geographic': query['geographic'], 'fullConnectorAliases': query['fullConnectorAliases'],
            'arms': query['arms'], 'ownerCopies': query.get('ownerCopies', []), 'classification': classification, 'unresolved': unresolved,
            'literalTriangles': len(query['triangles']), 'triangularPatchRecordsIncludingCaps': sum(t['triangularPatch'] for t in query['triangles']),
            'literalArea': union.area, 'literalComponents': len(components(union)), 'commonLiteralComponent': literal_component,
            'physicalRoadsterWidth': physical_width, 'conservativeErosionRadius': radius,
            'widthComponents': len(components(eroded)), 'commonWidthComponent': width_component,
            'chosenLiteralGatePoints': chosen_literal, 'chosenWidthGatePoints': chosen_width,
            'widthBottleneckIntervals': maximum_width, 'widthBottleneckWitnesses': sorted(bottlenecks, key=lambda b: b['erodedRegionGap'])[:12],
            'portMemberships': memberships, 'literalRoadPairDistances': pair_distances,
            'declaredEndpointYRange': [min(endpoint_y), max(endpoint_y)],
            'actualSupportVertexYRange': [min(actual_y), max(actual_y)] if actual_y else None,
            'unionXZ': mapping(union), 'widthCenterRegionXZ': mapping(eroded),
            'sourceRepairAuthorized': False, 'threeDAccepted': False,
            'limits': 'Width-only connected-center-region proof; full4.8m oriented body/turn radius, medians, barriers, height continuity, support and headroom remain open.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    source = Path(args.input)
    raw = source.read_bytes()
    artifact = json.loads(raw)
    failures = []
    for path, expected in {**artifact['inputs'], **artifact['sourceHashes']}.items():
        if hashlib.sha256(Path(path).read_bytes()).hexdigest() != expected:
            failures.append(path)
    if failures:
        raise RuntimeError('Bound input changed: ' + repr(failures))
    results = [qualify(query, artifact['physicalRoadsterWidth']) for query in artifact['queries']]
    counts = {}
    for result in results:
        key = result['classification']
        counts[key] = counts.get(key, 0) + 1
    report = {'schemaVersion': 1, 'scope': artifact['scope'] + ' Exact polygon union and conservative Roadster-width erosion only. Does not approve full-body/3D passage.',
              'input': {'path': str(source.resolve()), 'sha256': hashlib.sha256(raw).hexdigest()},
              'qualifierSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'shapelyVersion': shapely.__version__, 'geosVersion': shapely.geos_version_string,
              'sourceRoadGeometryGeneration': artifact['sourceRoadGeometryGeneration'], 'modelSHA256': artifact['modelSHA256'],
              'jointInputSHA256': artifact['jointInputSHA256'], 'summary': {'selected': len(results), 'classifications': counts},
              'results': results, 'releaseApproved': False}
    out = Path(args.output)
    with out.open('x') as handle:
        json.dump(report, handle, indent=2)
        handle.write('\n')
    print(json.dumps({'output': str(out), 'sha256': hashlib.sha256(out.read_bytes()).hexdigest(), 'summary': report['summary'],
                      'actionable': [{'node': r['node'], 'classification': r['classification'], 'unresolved': r['unresolved']} for r in results if r['commonWidthComponent'] is None]}))


if __name__ == '__main__':
    main()
