#!/usr/bin/env python3
"""Prepare bounded reconciliation of explicitly inventoried generated datums.

This is offline modeling authority, not surveyed elevation or release approval.
Every arm must retain the same full physical source connector. Canonical rail,
negative facilities, surveyed data, explicit policies and expressways stay out.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
for name in ['model', 'joint', 'diagnosis', 'packed-incidence', 'source-reference', 'mapped-levels', 'apron-policy', 'output']:
    p.add_argument('--' + name, type=Path, required=True)
p.add_argument('--consistent-node-diagnostic', type=Path,
               help='Fresh full-WKB source and complete packed-incidence review; only its sixExactNodes may supplement inconsistent nodes')
a = p.parse_args()
held = {}
def read(path):
    raw = path.read_bytes()
    held[str(path)] = hashlib.sha256(raw).hexdigest()
    return json.loads(raw)
model, joint, diagnosis, incidence, source, mapped, apron = map(read, [a.model, a.joint, a.diagnosis, a.packed_incidence, a.source_reference, a.mapped_levels, a.apron_policy])
assert joint['sourceModelSHA256'] == held[str(a.model)], 'Joint/model mismatch'
assert diagnosis['sourceModelSHA256'] == held[str(a.model)], 'Diagnosis/model mismatch'
assert diagnosis['sourceJointSHA256'] == held[str(a.joint)], 'Diagnosis/joint mismatch'
assert diagnosis['sourceReferenceSHA256'] == held[str(a.source_reference)], 'Diagnosis/source reference mismatch'
assert incidence['sourceDiagnosisSHA256'] == held[str(a.diagnosis)]
assert incidence['sourceCoreSHA256'] == joint['sourceCoreSHA256']
assert incidence['sourceJointSHA256'] == held[str(a.joint)], 'Packed incidence/joint mismatch'
assert set(incidence['nodes']) == {r['node'] for r in diagnosis['nodes']}
assert not incidence['ownerVariants'] and not incidence['missingFromCurrentJoint']
assert source['complete'] and not source['missingPrefixes']
reviewed = {}
if a.consistent_node_diagnostic:
    diagnostic = read(a.consistent_node_diagnostic)
    assert diagnostic['schema'] == 'consistent-generated-source-node-field-diagnostic-v1'
    assert diagnostic['releaseApproved'] is False and diagnostic['heightAuthorityGranted'] is False
    for path, digest in diagnostic['inputs'].items():
        assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, 'Consistent-node diagnostic input changed: ' + path
    for path in [a.model, a.joint, a.source_reference, a.mapped_levels, a.apron_policy]:
        assert diagnostic['inputs'][str(path)] == held[str(path)], 'Consistent-node diagnostic source tuple mismatch'
    assert diagnostic['packSHA256'] == incidence['packSHA256']
    reviewed = {r['node']: r for r in diagnostic['sixExactNodes']}
    assert len(reviewed) == len(diagnostic['sixExactNodes']) == 6
    assert set(reviewed) <= set(incidence['nodes']), 'Reviewed node missing from fresh incidence'
# Keep the actual owner files bound, rather than trusting an old audit receipt.
repo = Path(__file__).resolve().parents[2]
for relative, digest in incidence.get('packSHA256', {}).items():
    path = repo / relative
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, 'Packed owner changed: ' + relative
    held[str(path)] = digest
roads = {r['id']: r for r in model['roads']}
roads.update({r['id']: r for r in joint['contextRoads'] + joint['tileRoads']})
raw = {key: r['row'] for key, r in joint['sourceEvidence'].items()}
for r in source['rows']:
    prefix = r['id'][:12]
    if prefix in raw:
        for key in ['id', 'connectors', 'level_rules', 'road_flags']:
            if key in raw[prefix]:
                assert raw[prefix][key] == r[key]
    raw[prefix] = r
protected = {r['id'] for r in mapped['roads']}
negative = set(model['underpassChanges']) | set(model['report']['underpassRoadIds'])
other_nodes = {r['node'] for r in apron['estimatedNodeLowering']}
other_nodes |= {n for r in apron.get('generatedNodeComponents', []) for n in r['nodes']}
tile_ids = set(joint['requestedRoadIDs'])
fixed_ids = {r['id'] for r in joint['contextRoads']}
groups, excluded = [], []
for entry in diagnosis['nodes']:
    node = entry['node']
    assert node in incidence['nodes']
    arms = [r for r in roads.values() if node in [r['from'], r['to']]]
    assert {r['id'] for r in arms} == {r['road'] for r in entry['arms']}, 'Available incidence changed'
    heights = [(r['elev'] or [0.] * len(r['pts']))[0 if r['from'] == node else -1] for r in arms]
    assert entry['heightRange'] == [min(heights), max(heights)], 'Diagnosed endpoint heights changed'
    assert {r['road']: r['height'] for r in entry['arms']} == {r['id']: y for r, y in zip(arms, heights)}, 'Diagnosed arm heights changed'
    owners = {key for key, r in incidence['tileOwners'].items() if node in [r['physical']['from'], r['physical']['to']]}
    assert owners == {r['id'] for r in arms if r['id'] not in {e['id'] for e in model['roads']}}, 'Packed owner incidence is incomplete'
    if min(heights) < -.001 or any(r['id'] in negative or min(r['elev'] or [0.]) < -.001 for r in arms):
        excluded.append({'node': node, 'reason': 'Existing negative facility remains under its separate verified authority'})
        continue
    if node in other_nodes:
        excluded.append({'node': node, 'reason': 'Existing explicit node datum policy remains authoritative'})
        continue
    consistent = len(set(heights)) == 1
    if consistent and node not in reviewed:
        excluded.append({'node': node, 'reason': 'Consistent generated endpoint has no explicit full-source review in the selected six-node inventory'})
        continue
    review = reviewed.get(node) if consistent else None
    if review:
        assert review['endpointHeightsExactlyConsistent'] and review['allArmsHaveOneSameFullConnector']
        assert review['allArmIncidenceCompleteAgainstAll304Packs'] and not review['missingPackedOwnersFromJoint'] and not review['jointDetailedArmsWithoutPackedOwner']
        assert not review['oldPolicyCoversNode'] and not review['oldPolicyExplicitlyExcludesNode'] and not review['explicitApronPolicyCoversNode']
        assert review['heightRange'] == entry['heightRange']
        assert {r['id'] for r in review['arms']} == {r['id'] for r in arms}
        assert set(review['actualPackedOwners']) == owners
    source_exclusions = []
    full = set()
    evidence = []
    ceiling = max(y for r in arms for y in (r['elev'] or [0.]))
    for r in arms:
        assert r['id'] not in protected | negative
        assert not r.get('expressway') and r.get('elevationSource') not in ['surveyed', 'explicit']
        yy = r['elev'] or [0.] * len(r['pts'])
        assert min(yy) >= -.001
        row = raw[r['id'].split('_')[0]]
        connectors = [c for c in row['connectors'] if c['connector_id'].startswith(node)]
        assert len(connectors) == 1
        full.add(connectors[0]['connector_id'])
        end = 'from' if r['from'] == node else 'to'
        index = 0 if end == 'from' else len(yy) - 1
        evidence.append({'id': r['id'], 'end': end, 'point': r['pts'][index], 'inputHeight': yy[index],
                         'inputHeights': yy, 'sourceSegmentID': row['id'], 'fullConnector': connectors[0]['connector_id'],
                         'selectedDetailedOwner': r['id'] in tile_ids, 'fixedSourceContext': r['id'] in fixed_ids})
        if review:
            arm_review = next(item for item in review['arms'] if item['id'] == r['id'])
            assert arm_review['end'] == end and arm_review['height'] == yy[index] and arm_review['point'] == r['pts'][index]
            assert arm_review['heightEnvelope'] == [min(yy), max(yy)] and arm_review['heightCount'] == len(yy)
            assert arm_review['sourceSegmentID'] == row['id'] and arm_review['fullConnectorID'] == connectors[0]['connector_id']
            assert arm_review['sourceGeometryWKB_SHA256'] == hashlib.sha256(bytes.fromhex(row['geometryWKB'])).hexdigest()
            assert arm_review['sourceLevelRules'] == row['level_rules'] and arm_review['sourceRoadFlags'] == row['road_flags']
            assert arm_review['connectorOfficialFraction'] == connectors[0]['at']
            assert arm_review['sourceProjectionResidualM'] <= .1, 'Source endpoint projection is not sufficiently local'
            def active(rules, fraction):
                return [rule for rule in rules or [] if not rule.get('between') or rule['between'][0] - 1e-12 <= fraction <= rule['between'][1] + 1e-12]
            for fraction, level_key, flag_key in [
                (connectors[0]['at'], 'activeLevelRulesAtConnectorFraction', 'activeRoadFlagsAtConnectorFraction'),
                (arm_review['actualEndpointFullWKBProjectedFraction'], 'activeLevelRulesAtActualEndpointFraction', 'activeRoadFlagsAtActualEndpointFraction')]:
                levels, flags = active(row['level_rules'], fraction), active(row['road_flags'], fraction)
                assert levels == arm_review[level_key] and flags == arm_review[flag_key]
                if any(rule['value'] != 0 for rule in levels):
                    source_exclusions.append({'road': r['id'], 'reason': 'Active nonzero source level retains its separate source order', 'rules': levels})
                if any(value != 'is_link' for rule in flags for value in rule['values']):
                    source_exclusions.append({'road': r['id'], 'reason': 'Active source structure or unclassified road flag retains its existing authority', 'rules': flags})
            # Canonical/rail-adjacent controls cannot inherit this ground-route review.
            rail = arm_review['railInfluence']
            if not rail['available'] or rail['allRoadRailContactCount'] or rail['canonicalRoadControlsFromOldV30']:
                source_exclusions.append({'road': r['id'], 'reason': 'Rail-influenced arm requires separate canonical-control review'})
    if source_exclusions:
        excluded.append({'node': node, 'reason': 'Consistent-node source review does not authorize redistribution', 'sourceEvidence': source_exclusions})
        continue
    assert len(full) == 1 and ceiling > 0
    recovery = math.ceil(max(80., 1.5 * ceiling / .075, math.sqrt(6 * ceiling / .00625)))
    fixed_heights = {r['inputHeight'] for r in evidence if r['fixedSourceContext']}
    assert len(fixed_heights) <= 1, 'Existing fixed source arms disagree; no redistribution authority'
    node_bounds = [next(iter(fixed_heights))] * 2 if fixed_heights else [0., ceiling]
    groups.append({'node': node, 'fullConnector': next(iter(full)), 'arms': evidence,
                   'nodeHeightBounds': node_bounds, 'existingLocalHeightEnvelope': [0., ceiling], 'recoveryMeters': recovery,
                   'inventoryClass': 'reviewed-consistent-generated-node' if consistent else 'inconsistent-generated-node',
                   'reason': 'Reconcile a real shared connector inside the existing unsurveyed local height envelope; graded recovery only, no surveyed ground datum or new bridge/underpass declaration'})
assert len(groups) + len(excluded) == len(diagnosis['nodes'])
out = {'version': 1, 'scope': 'Root bounded generated-node modeling policy, requiring separate actual mesh/car/native acceptance',
       'releaseApproved': False, 'sourceModelSHA256': held[str(a.model)], 'sourceJointInputSHA256': held[str(a.joint)],
       'sourceReferenceSHA256': held[str(a.source_reference)], 'inputs': held,
       'generatorSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
       'nodes': groups, 'excluded': excluded,
       'canonicalRailControlsRemainExact': True, 'sourceXYWidthsAndLaneCapacityRemainExact': True}
assert all(hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest for path, digest in held.items())
with a.output.open('x') as f:
    json.dump(out, f, separators=(',', ':'), allow_nan=False)
    f.write('\n')
print(json.dumps({'output': str(a.output), 'sha256': hashlib.sha256(a.output.read_bytes()).hexdigest(), 'nodes': len(groups), 'excludedNodes': len(excluded)}))
