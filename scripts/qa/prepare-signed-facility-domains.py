#!/usr/bin/env python3
"""Inventory candidate signed recovery domains without granting height authority.

This is a standalone, offline INPUT-review producer. It emits no solved Y values,
does not edit a solver/runtime input, and cannot be consumed as an active policy.
Rail-adjacent controls use the bound solver's exact distance functions. A fresh
assembled-matrix parity check and explicit consumer are mandatory before use.
"""
import argparse
import ast
import collections
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct


def sha(value):
    return hashlib.sha256(value).hexdigest()


def canonical_sha(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode())


def arc(points):
    out = [0.]
    for a, b in zip(points, points[1:]):
        out.append(out[-1] + math.dist(a, b))
    return out


def active(rules, fraction):
    return [r for r in rules or [] if not r.get('between') or r['between'][0] - 1e-6 <= fraction <= r['between'][1] + 1e-6]


def rules_over_interval(rules, low, high):
    return [r for r in rules or [] if not r.get('between') or r['between'][0] - 1e-6 <= high and r['between'][1] + 1e-6 >= low]


def source_exclusions(levels, flags):
    out = []
    if any(r['value'] != 0 for r in levels):
        out.append('active-source-relative-level')
    if any(v != 'is_link' for r in flags for v in r['values']):
        out.append('active-source-structure-or-unclassified-flag')
    return out


def source_line(row, origin):
    from geographiclib.geodesic import Geodesic
    raw = bytes.fromhex(row['geometryWKB'])
    endian = '<' if raw[0] == 1 else '>'
    assert struct.unpack_from(endian + 'I', raw, 1)[0] == 2, 'Only exact source LineStrings supported'
    n = struct.unpack_from(endian + 'I', raw, 5)[0]
    assert n >= 2 and len(raw) == 9 + 16 * n
    ll = [struct.unpack_from(endian + 'dd', raw, 9 + 16 * k) for k in range(n)]
    kx = origin['NR'] * math.cos(math.radians(origin['lat'])) * math.pi / 180
    kz = origin['MR'] * math.pi / 180
    points = [[(lon - origin['lon']) * kx, -(lat - origin['lat']) * kz] for lon, lat in ll]
    metres = [0.]
    for a, b in zip(ll, ll[1:]):
        metres.append(metres[-1] + Geodesic.WGS84.Inverse(a[1], a[0], b[1], b[0])['s12'])
    assert metres[-1] > 0
    return points, metres


def project_fraction(point, points, metres):
    candidates = []
    for k, (a, b) in enumerate(zip(points, points[1:])):
        d = [b[j] - a[j] for j in [0, 1]]
        den = sum(v * v for v in d)
        if den <= 1e-16:
            continue
        t = max(0., min(1., sum((point[j] - a[j]) * d[j] for j in [0, 1]) / den))
        residual = math.dist(point, [a[j] + t * d[j] for j in [0, 1]])
        fraction = (metres[k] + t * (metres[k + 1] - metres[k])) / metres[-1]
        candidates.append((residual, fraction))
    assert candidates
    residual, fraction = min(candidates)
    ambiguous = any(abs(fraction - f) * metres[-1] > .15 and r <= residual + .15 for r, f in candidates)
    return {'officialSourceFraction': fraction, 'sourceProjectionResidualM': residual,
            'ambiguousSourceBranch': ambiguous}


def load_rail_functions(source):
    import numpy as np
    names = {'cross', 'bary', 'point_segment_distance', 'railway_quad_distance'}
    functions = [node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef) and node.name in names]
    assert {node.name for node in functions} == names
    env = {'np': np, 'math': math}
    exec(compile(ast.Module(body=functions, type_ignores=[]), '<bound solver rail functions>', 'exec'), env)
    return env['railway_quad_distance']


def boxes_overlap(a, b):
    return a[0] <= b[1] and b[0] <= a[1] and a[2] <= b[3] and b[2] <= a[3]


def bbox(points, pad):
    return [min(p[0] for p in points) - pad, max(p[0] for p in points) + pad,
            min(p[1] for p in points) - pad, max(p[1] for p in points) + pad]


def rail_contacts(road, footprint, rails, distance):
    """Match production broad phase and <=4.2 m literal-quad radius exactly."""
    assert len(footprint['L']) == len(footprint['R']) == len(road['pts'])
    near = [r for r in rails if boxes_overlap(bbox(road['pts'], 12), bbox(r['pts'], 12))]
    contacts = collections.defaultdict(list)
    for j in range(len(road['pts']) - 1):
        q = [footprint['L'][j], footprint['R'][j], footprint['R'][j + 1], footprint['L'][j + 1]]
        box = bbox(q, 4.2)
        for rail in near:
            yy = rail['elev'] or [0.] * len(rail['pts'])
            for k, (a, b) in enumerate(zip(rail['pts'], rail['pts'][1:])):
                if not boxes_overlap(box, bbox([a, b], 0)):
                    continue
                gap = distance(a, b, q)
                if gap <= 4.2:
                    hit = {'rail': rail['id'], 'railSegment': k, 'roadSegment': j,
                           'distanceToLiteralRoadQuad': gap, 'railHeights': [yy[k], yy[k + 1]],
                           'railBridge': bool(rail['bridge'])}
                    for index in [j, j + 1]:
                        contacts[index].append(hit)
    return dict(contacts)


def classify_controls(road, raw, contacts, sources, floor_owner, mapped=False):
    """Candidate runs are negative only; fixed anchors bound each local envelope."""
    yy = road['elev'] or [0.] * len(road['pts'])
    fixed = {}
    whole = []
    if mapped:
        whole.append('mapped-road-protected')
    if raw.get('elev') is not None:
        whole.append('original-packed-elevation-present')
    if road.get('elevationSource') in ['surveyed', 'explicit'] or road.get('expressway'):
        whole.append('explicit-surveyed-or-expressway-profile')
    for k, height in enumerate(yy):
        reasons = list(whole)
        if k in [0, len(yy) - 1]:
            reasons.append('endpoint-requires-separate-complete-incidence-policy')
        if k in contacts:
            reasons.append('canonical-literal-rail-corridor')
        if floor_owner and abs(height - min(yy)) < 1e-9:
            reasons.append('actual-facility-floor')
        if height >= -.001:
            reasons.append('outside-negative-recovery')
        if any(h > .001 for h in yy[max(0, k - 1):min(len(yy), k + 2)]):
            reasons.append('positive-or-sign-transition-neighbourhood')
        source = sources[k]
        if source['sourceProjectionResidualM'] > .1:
            reasons.append('source-projection-residual-over-10cm')
        if source['ambiguousSourceBranch']:
            reasons.append('ambiguous-source-branch')
        reasons += source_exclusions(source['activeLevelRules'], source['activeRoadFlags'])
        reasons += source_exclusions(source.get('incidentSegmentLevelRules', []), source.get('incidentSegmentRoadFlags', []))
        if reasons:
            fixed[k] = sorted(set(reasons))
    domains = []
    k = 0
    while k < len(yy):
        if k in fixed:
            k += 1
            continue
        first = k
        while k + 1 < len(yy) and k + 1 not in fixed:
            k += 1
        last = k
        anchors = [first - 1, last + 1]
        assert all(index in fixed for index in anchors)
        envelope = yy[first - 1:last + 2]
        # No positive height can enter a negative recovery parameter domain.
        low, high = min(envelope), min(0., max(envelope))
        domains.append({'controlIndices': list(range(first, last + 1)), 'fixedAnchorIndices': anchors,
                        'candidateHeightBounds': [low, high],
                        'existingLocalInputHeights': yy[first - 1:last + 2]})
        k += 1
    return fixed, domains


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    for name in ['model', 'footprints', 'joint', 'source-reference', 'source-geometry',
                 'crossing-audit', 'incidence', 'proposal', 'output']:
        p.add_argument('--' + name, type=Path, required=True)
    p.add_argument('--proposal-crossing-audit', type=Path,
                   help='Exact receipt bound by the proposal, if the inspection receipt has a newer generator hash')
    a = p.parse_args()
    assert not a.output.exists(), 'Preserve existing evidence; use a new output'
    held = {}
    def read(name, path, binary=False):
        path = path.resolve()
        data = path.read_bytes()
        held[name] = {'path': str(path), 'sha256': sha(data)}
        return data if binary else json.loads(data)
    model, fp, joint, reference, geo, crossing, incidence, proposal = [read(name, getattr(a, name.replace('-', '_')))
        for name in ['model', 'footprints', 'joint', 'source-reference', 'source-geometry', 'crossing-audit', 'incidence', 'proposal']]
    solver_bytes = read('solver', a.repo / 'scripts/solve-road-profiles.py', True)
    read('generator', Path(__file__), True)
    core = json.loads(gzip.decompress(read('raw-core', a.repo / 'public/city/core.pack.wasm', True)))
    mapped = read('mapped-levels', a.repo / 'src/world/bridge-level-data.json')
    assert fp['sourceModelSHA256'] == joint['sourceModelSHA256'] == joint['sourceConditionedInputSHA256'] == held['model']['sha256']
    assert joint['sourceCoreSHA256'] == geo['sourceCorePackSHA256'] == held['raw-core']['sha256']
    assert joint['sourceDataSHA256'] == held['source-geometry']['sha256']
    assert model['sourceRoadGeometryGeneration'] == joint['sourceRoadGeometryGeneration'] == geo['generationID']
    assert reference['complete'] and not reference['missingPrefixes']
    assert sorted(r['id'][:12] for r in reference['rows']) == sorted(reference['requestedPrefixes'])
    assert all(len(r['id']) == 36 and all(k in r for k in ['geometryWKB', 'connectors', 'level_rules', 'road_flags']) for r in reference['rows'])
    assert model['researchUnderpassEvidence']['proposal']['sha256'] == held['proposal']['sha256']
    bound_audit = model['researchUnderpassEvidence']['proposalSourceCrossingAuditSHA256']
    assert bound_audit == proposal['sourceCrossingAuditSHA256']
    crossing_rebind = None
    if bound_audit != held['crossing-audit']['sha256']:
        assert a.proposal_crossing_audit, 'Supply the exact proposal-bound crossing receipt; no silent rebind'
        original_crossing = read('proposal-crossing-audit', a.proposal_crossing_audit)
        assert held['proposal-crossing-audit']['sha256'] == bound_audit
        assert {k: v for k, v in crossing.items() if k != 'generatorSHA256'} == {k: v for k, v in original_crossing.items() if k != 'generatorSHA256'}, 'Crossing receipt differs beyond generator hash'
        crossing_rebind = {'proposalBoundReceipt': held['proposal-crossing-audit'], 'inspectionReceipt': held['crossing-audit'],
                           'allFieldsExceptGeneratorHashExactlyEqual': True, 'newHeightAuthorityGranted': False}
    assert len(proposal['proposedEntries']) == 70
    # Source pair evidence remains a review input, never blanket underpass authority.
    proved_pairs = {(r['road'], r['rail']) for r in crossing['crossings']
                    if r['classification'] == 'research-confirmed-road-below-source-rail-bridge-needs-model-review'}
    assert all((road, rail) in proved_pairs for e in proposal['proposedEntries'] for road in e['roads'] for rail in e['rails'])
    assert incidence['inputs']['proposal']['sha256'] == held['proposal']['sha256']
    rows = {r['id'][:12]: r for r in reference['rows']}
    assert len(rows) == len(reference['rows'])
    current = {r['id']: r for r in model['roads']}
    raw_core = {r['id']: r for r in core['roads']}
    core_ids = set(current)
    current.update({r['id']: r for r in joint['tileRoads'] + joint['contextRoads']})
    assert len(current) == len(model['roads']) + len(joint['tileRoads']) + len(joint['contextRoads'])
    footprints = {r['id']: r for r in fp['roads'] + joint['footprints'] + joint['contextFootprints']}
    negatives = {r['id'] for r in model['roads'] if min(r['elev'] or [0.]) < -.001}
    rail_floor = set(model['report']['underpassRoadIds'])
    road_floor = set(model['underpassChanges'])
    floor_owners = rail_floor | road_floor
    assert len(negatives) == 250 and len(rail_floor) == 48 and len(road_floor) == 4 and floor_owners <= negatives
    nodes = {current[ident][end] for ident in negatives for end in ['from', 'to'] if current[ident][end]}
    # Read every literal detailed owner at every negative endpoint, including owners
    # outside the selected 675. Missing selection blocks node candidates explicitly.
    packed_owners = {}; variants = []
    fields = ['id', 'pts', 'elev', 'from', 'to', 'w', 'lanes', 'oneway']
    for pack in core['packs']:
        relative = 'public/city/' + pack['file']
        data = read('pack:' + relative, a.repo / relative, True)
        assert sha(data) == joint['sourcePackSHA256'][relative]
        for tile in json.loads(gzip.decompress(data))['tiles'].values():
            for road in tile['roads']:
                if road['id'] in core_ids or road.get('ctx') or not nodes & {road['from'], road['to']}:
                    continue
                physical = {key: road.get(key) for key in fields}
                if road['id'] in packed_owners and physical != packed_owners[road['id']]:
                    variants.append(road['id'])
                packed_owners[road['id']] = physical
    distance = load_rail_functions(solver_bytes)
    source_cache = {}; source_controls = {}; contact_cache = {}
    def evidence(ident):
        road = current[ident]
        if ident not in source_controls:
            row = rows.get(ident[:12])
            if row is None:
                return None
            if row['id'] not in source_cache:
                source_cache[row['id']] = source_line(row, geo['origin'])
            pp, ss = source_cache[row['id']]
            source_controls[ident] = []
            for point in road['pts']:
                item = project_fraction(point, pp, ss)
                fraction = item['officialSourceFraction']
                item['activeLevelRules'] = active(row['level_rules'], fraction)
                item['activeRoadFlags'] = active(row['road_flags'], fraction)
                source_controls[ident].append(item)
            for k, item in enumerate(source_controls[ident]):
                fractions = [r['officialSourceFraction'] for r in source_controls[ident][max(0, k - 1):k + 2]]
                low, high = min(fractions), max(fractions)
                item['incidentSegmentSourceFractionInterval'] = [low, high]
                item['incidentSegmentLevelRules'] = rules_over_interval(row['level_rules'], low, high)
                item['incidentSegmentRoadFlags'] = rules_over_interval(row['road_flags'], low, high)
        if ident not in contact_cache:
            contact_cache[ident] = rail_contacts(road, footprints[ident], model['profiles'], distance)
        return source_controls[ident]
    controls = []; candidate_count = 0
    mapped_ids = {r['id'] for r in mapped['roads']}
    for ident in sorted(negatives):
        road = current[ident]; source = evidence(ident); assert source is not None
        contacts = contact_cache[ident]
        fixed, domains = classify_controls(road, raw_core[ident], contacts, source, ident in floor_owners, ident in mapped_ids)
        candidate_count += sum(len(d['controlIndices']) for d in domains)
        controls.append({'id': ident, 'inputRoadSHA256': canonical_sha(road), 'inputFootprintSHA256': canonical_sha(footprints[ident]),
                         'sourceSegmentID': rows[ident[:12]]['id'], 'sourceGeometryWKB_SHA256': sha(bytes.fromhex(rows[ident[:12]]['geometryWKB'])),
                         'inputHeights': road['elev'], 'modelArc': arc(road['pts']), 'sourceControls': source,
                         'railFloorOwner': ident in rail_floor, 'roadFloorOwner': ident in road_floor,
                         'fixedControls': [{'index': k, 'height': road['elev'][k], 'reasons': fixed[k], 'railContacts': contacts.get(k, [])} for k in sorted(fixed)],
                         'candidateRecoveryDomains': domains})
    node_rows = []
    selected_detail = {r['id'] for r in joint['tileRoads']}
    contexts = {r['id'] for r in joint['contextRoads']}
    for node in sorted(nodes):
        arms = [r for r in current.values() if node in [r['from'], r['to']]]
        owners = {ident for ident, road in packed_owners.items() if node in [road['from'], road['to']]}
        missing = sorted(owners - current.keys())
        reasons = ['missing-selected-detailed-owner'] if missing else []
        if owners & set(variants): reasons.append('variant-packed-owner')
        full = set(); entries = []; low = 0.; high = 0.
        for road in arms:
            ident = road['id']; end = 'from' if road['from'] == node else 'to'; k = 0 if end == 'from' else len(road['pts']) - 1
            yy = road['elev'] or [0.] * len(road['pts']); source = evidence(ident); row = rows.get(ident[:12])
            arm_reasons = []
            raw = raw_core.get(ident, packed_owners.get(ident))
            if raw is None or raw.get('elev') is not None: arm_reasons.append('original-packed-elevation-present-or-missing')
            if ident in floor_owners or ident in mapped_ids: arm_reasons.append('separate-protected-facility-owner')
            if road.get('elevationSource') in ['surveyed', 'explicit'] or road.get('expressway'): arm_reasons.append('explicit-surveyed-or-expressway-profile')
            if max(yy) > .001: arm_reasons.append('mixed-or-positive-profile-requires-separate-finite-review')
            connector = [c for c in row['connectors'] if c['connector_id'].startswith(node)] if row else []
            if source is None or len(connector) != 1: arm_reasons.append('incomplete-full-source-connector-proof')
            else:
                full.add(connector[0]['connector_id']); item = source[k]
                if item['sourceProjectionResidualM'] > .1 or item['ambiguousSourceBranch']: arm_reasons.append('source-endpoint-projection-unresolved')
                if abs(item['officialSourceFraction'] - connector[0]['at']) * source_cache[row['id']][1][-1] > .15:
                    arm_reasons.append('endpoint-is-not-at-the-full-source-connector')
                arm_reasons += source_exclusions(item['activeLevelRules'], item['activeRoadFlags'])
                arm_reasons += source_exclusions(active(row['level_rules'], connector[0]['at']), active(row['road_flags'], connector[0]['at']))
                if k in contact_cache[ident]: arm_reasons.append('canonical-literal-rail-corridor')
            if ident in contexts: arm_reasons.append('fixed-detailed-context')
            low = min(low, min(yy))
            entries.append({'id': ident, 'end': end, 'inputHeight': yy[k], 'inputRoadSHA256': canonical_sha(road),
                            'selectedDetailedOwner': ident in selected_detail, 'fixedSourceContext': ident in contexts,
                            'sourceSegmentID': row['id'] if row else None,
                            'sourceGeometryWKB_SHA256': sha(bytes.fromhex(row['geometryWKB'])) if row else None,
                            'fullConnector': connector[0] if len(connector) == 1 else None,
                            'sourceEndpoint': source[k] if source else None, 'blockingReasons': sorted(set(arm_reasons))})
            reasons += arm_reasons
        if len(full) != 1: reasons.append('arms-do-not-prove-one-full-source-connector')
        node_rows.append({'node': node, 'arms': entries, 'actualPackedDetailedOwners': sorted(owners),
                          'missingFromCurrentJoint': missing, 'fullConnectorAliases': sorted(full),
                          'candidateHeightBounds': [low, high] if not reasons else None,
                          'blockingReasons': sorted(set(reasons)), 'allArmIncidenceCompleteAgainstAllPacks': not missing and not owners & set(variants)})
    output = {'version': 1, 'schema': 'signed-facility-parameter-domain-candidate-v1',
              'scope': __doc__, 'releaseApproved': False, 'heightAuthorityGranted': False, 'activePolicy': False,
              'requiresFreshCanonicalParity': True, 'requiresExplicitReviewedConsumer': True,
              'inputs': held, 'sourceRoadGeometryGeneration': geo['generationID'],
              'crossingReceiptInspectionRebind': crossing_rebind,
              'canonicalRailProfilesSHA256': canonical_sha(model['profiles']),
              'canonicalRailDistanceRule': {'radiusMetres': 4.2, 'source': 'Exact four functions extracted from bound solver; production 12 m road/rail broad phase retained', 'freshMatrixInventoryParityProved': False},
              'hardRequirements': {'all52FacilityOwnersRetainSeparateAuthority': True, 'allFacilityFloorControlsExact': True,
                                   'canonicalRailControlsExact': True, 'sourceXYWidthsLanesExact': True,
                                   'sourceOrderedIndependentHeadroomMetres': 5.85, 'globalGradeChangePerMetre': .00625,
                                   'detailedGradeLimit': .065, 'physicalGradeLimit': .1, 'existingAnandPoliciesUnchanged': True,
                                   'allArmedNodeEqualitiesHard': True, 'candidateBoundsAreNotSolvedHeights': True},
              'roads': controls, 'nodes': node_rows,
              'summary': {'negativeRoads': len(negatives), 'negativeControls': sum(len(current[i]['pts']) for i in negatives),
                          'railFloorOwners': len(rail_floor), 'roadFloorOwners': len(road_floor),
                          'canonicalContactControls': sum(len(contact_cache[i]) for i in negatives),
                          'candidateInteriorControls': candidate_count,
                          'negativeEndpointNodes': len(nodes), 'candidateNodes': sum(not n['blockingReasons'] for n in node_rows),
                          'blockedNodeReasons': dict(collections.Counter(r for n in node_rows for r in n['blockingReasons'])),
                          'missingDetailedOwners': len({ident for n in node_rows for ident in n['missingFromCurrentJoint']}),
                          'packedOwnerVariants': sorted(set(variants))}}
    for record in held.values():
        assert sha(Path(record['path']).read_bytes()) == record['sha256'], 'Input changed while producing candidate'
    with a.output.open('x') as f:
        json.dump(output, f, separators=(',', ':'), allow_nan=False); f.write('\n')
    print(json.dumps({'output': str(a.output), 'sha256': sha(a.output.read_bytes()), 'summary': output['summary'],
                      'releaseApproved': False, 'heightAuthorityGranted': False}))


if __name__ == '__main__':
    main()
