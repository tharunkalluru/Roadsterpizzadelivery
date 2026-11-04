#!/usr/bin/env python3
"""Prepare an OWN local numeric experiment, never a production height policy.

Only the exact reviewed v34 context and the pinned inactive candidates/audits
are accepted by the CLI. No candidate annotation or embedded solver source is
executed. The original solver, source hashes, geometry, constraints and node
equalities remain intact; only enumerated interior parameter bounds change.
"""
import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
import pickle
import struct


PINS = {
    'context': '0e48c25e734365244b6933029bbc2514d4b9469cadc53043b3d94d59c8f6de91',
    'positive_candidate': '1a08c6837bc8f86d465290c1a5763f1e008982b30e3e585d7d87295815de34e6',
    'positive_audit': '30cd691c62a116f14cd9b4d49f5208ff395a5015b31ca2691e8da3412b62dc13',
    'signed_candidate': '20b1019d593627378de4c5e9b0d61bb1b99fd41a612550fba30bcf873b116a6b',
    'signed_audit': '8eeb7c71be122c8e72017d0f1bbba4d5d51364d927d14324e2f0600f5e9dabae',
}
TUPLE = {
    'model': '939084750f6d0c3a8acf92acff8feb378fde06c11c96b98128d711394c23945f',
    'footprints': 'be92dcc01938888de2f947965e006d4c20162e9f462b793ad4d6c4eac99acd33',
    'joint_tile_input': '3b9e495d8e0ec4ec2d33d2fdb9fb2f7bab11e0b9f756c548c0b83568d4aab823',
    'additional_source_reference': '9a27414d4b9ebee7486ea91f71313697261e450562f859688bab4d057b9e81c8',
    'generated_node_datum_policy': '46305e30f8785f798a7b05ef049049fe72ae1a833a7dae3ab6b859e94ad5c884',
}
SOLVER_SHA = '46219d8cb566ff117895507fd4e43219bc5a498a7e225cb2617a59392a0fad6e'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical_sha(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode())


def frozen_sha(value):
    return sha(pickle.dumps(value, protocol=5))


def same_bounds(a, b):
    """Compare floating bounds bit for bit, including signed zero."""
    def encode(value):
        return b'N' if value is None else b'D' + struct.pack('!d', value)
    return len(a) == len(b) and all(encode(x) == encode(y) for x, y in zip(a, b))


def finite_pair(value, label):
    require(isinstance(value, (list, tuple)) and len(value) == 2, label + ': expected two bounds')
    require(all(type(x) in (float, int) and math.isfinite(x) for x in value), label + ': nonfinite bounds')
    require(value[0] <= value[1], label + ': reversed bounds')
    return tuple(value)


class Bindings:
    def __init__(self):
        self.records = {}

    def read(self, path, expected):
        path = Path(path).resolve()
        data = path.read_bytes()
        require(sha(data) == expected, 'Binding changed: ' + str(path))
        if str(path) in self.records:
            require(self.records[str(path)] == expected, 'Conflicting binding: ' + str(path))
        self.records[str(path)] = expected
        return data

    def recheck(self):
        for path, expected in self.records.items():
            require(sha(Path(path).read_bytes()) == expected, 'Input drift during preparation: ' + path)


def validate_documents(context, positive, positive_audit, signed, signed_audit):
    require(context['version'] == 1 and context['releaseApproved'] is False, 'Expected inactive parent context')
    require('kind' not in context, 'Parent must be the original producer context')
    require(sha(context['solverSource']) == context['solverSHA256'], 'Held solver source digest mismatch')
    require(positive['schema'] == 'positive-finite-join-parameter-domain-candidate-v1', 'Unknown positive candidate schema')
    require(positive['researchOnly'] is True and positive['releaseApproved'] is False
            and positive['activeProductionConsumer'] is False, 'Positive candidate is not inactive')
    require(positive_audit['schema'] == 'positive-finite-domain-current-bound-audit-v1', 'Unknown positive audit schema')
    require(positive_audit['readOnly'] is True and positive_audit['releaseApproved'] is False, 'Expected read-only positive audit')
    require(signed['version'] == 1 and signed['schema'] == 'signed-facility-parameter-domain-candidate-v1', 'Unknown signed candidate schema')
    require(signed['releaseApproved'] is False and signed['heightAuthorityGranted'] is False
            and signed['activePolicy'] is False, 'Signed candidate is not inactive')
    # This exact pinned independent audit intentionally has no schema field.
    require(signed_audit['releaseApproved'] is False
            and signed_audit['canonicalParity']['exactCandidateMaskAndValuesEqualActual'] is True
            and not signed_audit['canonicalParity']['actualBoundsNotExactInputY']
            and not signed_audit['floors']['actualBoundsNotExactInputY']
            and not signed_audit['inputBindings']['postAuditBindingMismatches'], 'Signed parity audit failed')
    require(positive_audit['solverSHA256'] == context['solverSHA256'] == signed_audit['context']['solverSHA256'], 'Audit solver mismatch')
    require(positive_audit['summary']['candidateCanonicalMaskAndValuesExactlyEqual'] is True
            and positive_audit['summary']['candidateCeilingsStillExact'] is True
            and not positive_audit['canonicalErrors'] and not positive_audit['ceilingErrors']
            and not positive_audit['absentVariableRoads'], 'Positive audit failed')
    for ck, pk, sk in [('model', 'newModel', 'model'), ('footprints', 'newFootprints', 'footprints'),
                       ('joint_tile_input', 'newJoint', 'joint'),
                       ('additional_source_reference', 'newReference', 'source-reference')]:
        require(context['inputs'][ck] == positive['inputs'][pk]['sha256']
                == signed['inputs'][sk]['sha256'], 'Candidate source tuple mismatch: ' + ck)
    require(context['inputs']['generated_node_datum_policy'] == positive['inputs']['newNodePolicy']['sha256'], 'Node policy tuple mismatch')
    require(context['solverSHA256'] == positive['inputs']['solver']['sha256']
            == signed['inputs']['solver']['sha256'], 'Candidate solver tuple mismatch')


def positive_proposals(context, positive, audit):
    s = context['state']; roads = s['roads']; offsets = s['O']; bounds = s['bounds']
    canonical = s['canonicalRailControls']; proposals = {}; no_rise = set(context['noRiseRoads'])
    for case_index, case in enumerate(positive['results']):
        require(case['finiteJoinSamples'] > 0 and case['sharedSourceEndpointEqualityExact'] is True
                and case['endpointBoundsChanged'] is False and case['canonicalBoundsChanged'] is False,
                'Positive case changed an immutable guard')
        require(case['maximumGrade'] == .075 and case['maximumTriangleGrade'] == s['args'].physical_max_grade
                and case['gradeChangePerMetre'] == s['args'].grade_change_per_metre
                and case['sameSurfaceTolerance'] == s['args'].same_layer_tolerance, 'Positive constraint coefficients changed')
        pair = case['roads']
        require(set(case['domains']) == set(pair), 'Positive domain is not exactly the proved pair')
        values = [max(roads[r]['elev'] or [0.]) for r in pair]
        values += [bounds[offsets[r]+k][0] for r in pair for k in range(len(roads[r]['pts']))
                   if offsets[r]+k in canonical]
        require(max(values) == case['existingHeightCeiling'], 'Positive ceiling exceeds or differs from existing profile/canonical maximum')
        for road, interval in case['domains'].items():
            require(road in offsets, 'Positive road absent from actual variables')
            e = roads[road]; yy = e['elev'] or [0.] * len(e['pts']); aa = s['arcs'][road]
            start, end = finite_pair(interval, 'Positive model-arc domain')
            require(0 <= start <= end <= aa[-1], 'Positive arc interval outside road')
            require(min(yy) >= 0 and road not in s['underpassIds']
                    and e.get('elevationSource') not in ['surveyed', 'explicit'], 'Positive candidate touches negative or surveyed authority')
            for k, distance in enumerate(aa):
                col = offsets[road] + k
                if not start <= distance <= end or k in [0, len(yy)-1] or col in canonical:
                    continue
                ceiling = min(case['existingHeightCeiling'], yy[k]) if road in no_rise else case['existingHeightCeiling']
                target = (0., ceiling)
                if col in proposals:
                    target = (0., max(target[1], proposals[col]['target'][1]))
                cases = proposals.get(col, {}).get('cases', []) + [case_index]
                proposals[col] = {'road': road, 'control': k, 'modelArc': distance,
                                  'inputHeight': yy[k], 'target': target, 'cases': cases}
    gaps = {col: row for col, row in proposals.items()
            if not (bounds[col][0] <= row['target'][0] + 1e-10 and bounds[col][1] >= row['target'][1] - 1e-10)}
    reported = {}
    for row in audit['additionalBoundsNeeded']:
        road = row['road']; k = row['control']
        require(road in offsets and type(k) is int and 0 <= k < len(roads[road]['pts']), 'Invalid positive audited control')
        col = offsets[road] + k
        require(col not in reported and col in gaps, 'Positive audit invents, duplicates or leaves its source domain')
        expected = gaps[col]
        require(same_bounds(row['target'], expected['target']) and same_bounds(row['actualBounds'], bounds[col])
                and row['modelArc'] == expected['modelArc'] and row['inputHeight'] == expected['inputHeight'], 'Positive audit bound/height/arc mismatch')
        require(row['protectedRoad'] == (road in s['protected'])
                and row['expressway'] == bool(roads[road].get('expressway')), 'Positive audit protection mismatch')
        reported[col] = expected
    require(reported.keys() == gaps.keys(), 'Positive audit omits source-domain gap controls')
    return reported


def signed_proposals(context, signed, audit):
    s = context['state']; roads = s['roads']; offsets = s['O']; bounds = s['bounds']; canonical = s['canonicalRailControls']
    core_ids = {x['id'] for x in s['stage']['roads']}
    actual_negatives = {r for r in offsets if min(roads[r]['elev'] or [0.]) < -.001 and r in core_ids}
    rows = {row['id']: row for row in signed['roads']}
    require(len(rows) == len(signed['roads']) and rows.keys() == actual_negatives, 'Signed negative universe mismatch')
    proposals = {}; floors = set(); fixed = set(); anchors = set(); skipped = []; existing_variable_fixed = []
    existing_variable_anchors = {}
    expected_deltas = {(row['road'], row['control']): row for row in audit['candidateInteriors']['deltas']}
    seen_deltas = set()
    for road, row in rows.items():
        e = roads[road]; yy = e['elev']; offset = offsets[road]
        require(row['inputHeights'] == yy and canonical_sha(e) == row['inputRoadSHA256']
                and canonical_sha(s['footprints'][road]) == row['inputFootprintSHA256'], 'Signed road/ribbon/input-height drift')
        require(bool(row['railFloorOwner'] or row['roadFloorOwner']) == (road in s['underpassIds']), 'Facility owner inventory mismatch')
        actual_floors = {k for k,h in enumerate(yy) if road in s['underpassIds'] and abs(h-min(yy)) < 1e-9}
        floors.update(offset+k for k in actual_floors)
        classified = {v['index']: v for v in row['fixedControls']}
        require(len(classified) == len(row['fixedControls']), 'Duplicate signed fixed control')
        candidate = [k for domain in row['candidateRecoveryDomains'] for k in domain['controlIndices']]
        require(sorted(list(classified) + candidate) == list(range(len(yy))), 'Signed fixed/candidate partition mismatch')
        require({k for k,v in classified.items() if 'actual-facility-floor' in v['reasons']} == actual_floors, 'Signed floor mask mismatch')
        require({k for k,v in classified.items() if 'canonical-literal-rail-corridor' in v['reasons']}
                == {k for k in range(len(yy)) if offset+k in canonical}, 'Signed canonical mask mismatch')
        for k, item in classified.items():
            require(type(k) is int and item['height'] == yy[k], 'Signed fixed value mismatch')
            col = offset+k
            if same_bounds(bounds[col], (yy[k], yy[k])):
                fixed.add(col)
            else:
                require(road in s['generatedFacilityPolicies'], 'Variable fixed annotation lacks an existing Anand policy')
                existing_variable_fixed.append({'road': road, 'control': k, 'bounds': bounds[col]})
        for domain in row['candidateRecoveryDomains']:
            indices = domain['controlIndices']; domain_anchors = domain['fixedAnchorIndices']
            require(indices and indices == list(range(indices[0], indices[-1]+1)), 'Non-contiguous signed recovery domain')
            require(domain_anchors == [indices[0]-1, indices[-1]+1]
                    and all(k in classified for k in domain_anchors), 'Invalid signed recovery anchors')
            envelope = yy[domain_anchors[0]:domain_anchors[1]+1]
            require(domain['existingLocalInputHeights'] == envelope, 'Signed local input profile changed')
            target = finite_pair(domain['candidateHeightBounds'], 'Signed target')
            require(same_bounds(target, (min(envelope), min(0., max(envelope)))), 'Signed target outside local input envelope')
            contained = all(bounds[offset+k][0] <= target[0] and bounds[offset+k][1] >= target[1] for k in indices)
            for k in indices:
                col = offset+k; key = (road,k)
                require(type(k) is int and 0 < k < len(yy)-1 and col not in canonical and k not in actual_floors,
                        'Signed candidate touches endpoint/canonical/floor')
                require(yy[k] < -.001 and target[1] <= 0 and target[0] <= yy[k] <= target[1], 'Signed candidate is zero/positive or leaves negative envelope')
                require(key in expected_deltas and key not in seen_deltas, 'Signed candidate outside bound audit')
                checked = expected_deltas[key]; seen_deltas.add(key)
                require(same_bounds(checked['from'], bounds[col]) and same_bounds(checked['to'], target)
                        and checked['inputHeight'] == yy[k], 'Signed audited bounds mismatch')
                if contained:
                    skipped.append({'road': road, 'control': k, 'retainedBounds': bounds[col], 'candidateTarget': target})
                else:
                    require(col not in proposals, 'Duplicate signed domain control')
                    proposals[col] = {'road': road, 'control': k, 'inputHeight': yy[k], 'target': target,
                                      'anchors': domain_anchors}
            if not contained:
                require(all(same_bounds(bounds[offset+k], (yy[k], yy[k])) for k in domain_anchors), 'New signed freedom requires actually fixed anchors')
                anchors.update(offset+k for k in domain_anchors)
            else:
                for k in domain_anchors:
                    if not same_bounds(bounds[offset+k], (yy[k], yy[k])):
                        existing_variable_anchors[(road,k)] = {'road': road, 'control': k, 'retainedBounds': bounds[offset+k]}
    require(seen_deltas == expected_deltas.keys(), 'Signed candidate omits audited domain controls')
    return proposals, floors, fixed, anchors, skipped, existing_variable_fixed, list(existing_variable_anchors.values())


def build_experiment(context, positive, positive_audit, signed, signed_audit):
    validate_documents(context, positive, positive_audit, signed, signed_audit)
    s = context['state']; bounds = s['bounds']; canonical = s['canonicalRailControls']
    positive_rows = positive_proposals(context, positive, positive_audit)
    negative_rows, floors, fixed, anchors, skipped, variable_fixed, variable_anchors = signed_proposals(context, signed, signed_audit)
    require(not positive_rows.keys() & negative_rows.keys(), 'Positive and signed domains overlap')
    for col in canonical | floors:
        require(same_bounds(bounds[col], (bounds[col][0], bounds[col][0])), 'Canonical/floor is not fixed')
    for col in floors:
        require(same_bounds(bounds[col], (float(s['base'][col]), float(s['base'][col]))), 'Floor changed from input Y')
    invariant_hashes = {key: frozen_sha(value) for key,value in s.items() if key != 'bounds'}
    new_bounds = list(bounds); deltas = []; no_rise = set(context['noRiseRoads'])
    immutable = canonical | floors | fixed | anchors
    for family, proposals in [('positive', positive_rows), ('negative', negative_rows)]:
        for col,row in proposals.items():
            road = row['road']; k = row['control']; e = s['roads'][road]
            require(col not in immutable and 0 < k < len(e['pts'])-1, 'Attempted immutable/end-point bound change')
            old = finite_pair(bounds[col], 'Existing bounds'); target = finite_pair(row['target'], 'Candidate target')
            new = (min(old[0], target[0]), max(old[1], target[1]))
            require(new[0] <= old[0] <= old[1] <= new[1], 'Experiment narrowed existing authority')
            require(family != 'negative' or new[1] <= 0, 'Negative domain admitted positive height')
            require(family != 'positive' or target[0] == 0, 'Positive domain admitted negative height')
            require(road not in no_rise or new[1] <= (e['elev'] or [0.]*len(e['pts']))[k], 'No-rise cap would be lost')
            require(not same_bounds(old,new), 'Audited gap is not an actual expansion')
            new_bounds[col] = new
            overrides = []
            if road in s['protected']: overrides.append('protected-owner')
            if e.get('expressway'): overrides.append('expressway')
            deltas.append({**row, 'family': family, 'column': col, 'from': bounds[col], 'to': new,
                           'hypotheticalOverrides': overrides,
                           'authority': 'HYPOTHETICAL numeric parameter domain only; separate production policy review required'})
    for col in immutable:
        require(same_bounds(bounds[col], new_bounds[col]), 'Immutable bounds changed')
    endpoint_columns = {s['O'][road]+k for road in s['varIds'] for k in [0,len(s['roads'][road]['pts'])-1]}
    require(all(same_bounds(bounds[col],new_bounds[col]) for col in endpoint_columns), 'Endpoint bounds changed')
    for road in s['generatedFacilityPolicies']:
        require(all(same_bounds(bounds[s['O'][road]+k],new_bounds[s['O'][road]+k])
                    for k in range(len(s['roads'][road]['pts']))), 'Existing Anand policy road bounds changed')
    output = {**context, 'kind': 'experimental-domain-context', 'heightAuthorityGranted': False,
              'researchOnly': True, 'activeProductionConsumer': False,
              'state': {**s, 'bounds': new_bounds}}
    require(all(frozen_sha(output['state'][key]) == digest for key,digest in invariant_hashes.items()), 'Geometry/expressions/solver settings changed')
    summary = {'positiveGapControls': len(positive_rows), 'signedCandidateControls': len(negative_rows)+len(skipped),
               'signedNewControls': len(negative_rows), 'signedContainedControlsKeptExact': len(skipped),
               'changedControls': len(deltas), 'canonicalControlsKeptBitExact': len(canonical),
               'facilityFloorControlsKeptBitExact': len(floors), 'newSignedFixedAnchorsKeptBitExact': len(anchors),
               'endpointColumnsKeptBitExact': len(endpoint_columns),
               'preexistingVariableSignedFixedAnnotationsKeptExact': len(variable_fixed),
               'preexistingVariableSignedAnchorsKeptExact': len(variable_anchors),
               'hypotheticalProtectedOwnerDeltas': sum('protected-owner' in d['hypotheticalOverrides'] for d in deltas),
               'hypotheticalExpresswayDeltas': sum('expressway' in d['hypotheticalOverrides'] for d in deltas)}
    report = {'schema': 'road-domain-experiment-preparation-v1', 'releaseApproved': False,
              'heightAuthorityGranted': False, 'activeProductionConsumer': False,
              'scope': __doc__, 'summary': summary, 'deltas': deltas,
              'retainedContainedSignedDomains': skipped,
              'retainedExistingVariableSignedFixedAnnotations': variable_fixed,
              'retainedExistingVariableSignedAnchors': variable_anchors,
              'unchangedStateFieldSHA256': invariant_hashes,
              'parentBoundsSHA256': frozen_sha(bounds), 'experimentalBoundsSHA256': frozen_sha(new_bounds),
              'assumptions': [
                  'Protected-owner and expressway overrides are hypothetical parameter domains, requiring separate production policy review.',
                  'Positive targets use only exact source-candidate windows and existing profile/canonical ceilings; union retains current bounds and no-rise caps.',
                  'The two existing Anand policies retain every current bound. The 45 contained candidate controls and their six already-variable anchor annotations are skipped, not frozen.',
                  'Every newly expanded signed domain has actually fixed anchors; all canonical controls, facility floors, endpoints and node couplings remain unchanged.',
                  'The original solver source, source input hashes, XY/ribbons, headroom, coupling, grade and curvature functions are retained without modification.',
                  'No solved Y, geometry validity, feasibility, height authority or release approval is produced.']}
    return output, report


def write_outputs(context_path, report_path, context, report):
    context_path = Path(context_path); report_path = Path(report_path)
    require(context_path.resolve() != report_path.resolve(), 'Outputs must be different')
    require(not context_path.exists() and not report_path.exists(), 'Preserve existing evidence; use new outputs')
    # Exclusive opens protect against concurrent overwrite after the precheck.
    with context_path.open('xb') as output:
        pickle.dump(context, output, protocol=5)
    report['outputContext'] = {'path': str(context_path.resolve()), 'sha256': sha(context_path.read_bytes()),
                               'bytes': context_path.stat().st_size}
    with report_path.open('x') as output:
        json.dump(report, output, separators=(',', ':'), allow_nan=False); output.write('\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in PINS:
        parser.add_argument('--' + name.replace('_','-'), type=Path, required=True)
    parser.add_argument('--output-context', type=Path, required=True)
    parser.add_argument('--output-report', type=Path, required=True)
    args = parser.parse_args()
    require(not args.output_context.exists() and not args.output_report.exists(), 'Preserve existing evidence; use new outputs')
    generator = Path(__file__).read_bytes()
    bindings = Bindings()
    raw = {key: bindings.read(getattr(args,key), digest) for key,digest in PINS.items()}
    # Only the exact OWN producer bytes above may reach pickle.loads.
    context = pickle.loads(raw['context'])
    documents = {key: json.loads(value) for key,value in raw.items() if key != 'context'}
    require(context['solverSHA256'] == SOLVER_SHA and all(context['inputs'][k] == v for k,v in TUPLE.items()), 'Wrong held source tuple')
    for key,digest in context['inputs'].items():
        bindings.read(getattr(context['state']['args'],key), digest)
    for name in ['positive_candidate', 'signed_candidate']:
        for record in documents[name]['inputs'].values():
            bindings.read(record['path'], record['sha256'])
    for path,digest in documents['positive_audit']['inputs'].items():
        bindings.read(path,digest)
    signed_audit = documents['signed_audit']
    require(signed_audit['context']['sha256'] == PINS['context']
            and signed_audit['candidate']['sha256'] == PINS['signed_candidate'], 'Signed audit binds a different context/candidate')
    audited_positive_paths = {str(Path(path).resolve()): digest
                              for path,digest in documents['positive_audit']['inputs'].items()}
    for key in ['context','positive_candidate']:
        require(audited_positive_paths.get(str(getattr(args,key).resolve())) == PINS[key], 'Positive audit binds a different context/candidate path')
    output, report = build_experiment(context, documents['positive_candidate'], documents['positive_audit'],
                                      documents['signed_candidate'], documents['signed_audit'])
    require(report['summary']['positiveGapControls'] == 6934
            and report['summary']['signedCandidateControls'] == 1854
            and report['summary']['signedNewControls'] == 1809
            and report['summary']['signedContainedControlsKeptExact'] == 45
            and report['summary']['canonicalControlsKeptBitExact'] == 1553
            and report['summary']['facilityFloorControlsKeptBitExact'] == 509
            and report['summary']['preexistingVariableSignedFixedAnnotationsKeptExact'] == 73
            and report['summary']['preexistingVariableSignedAnchorsKeptExact'] == 6, 'Reviewed inventory changed')
    bindings.recheck()
    provenance = {'parentContextSHA256': PINS['context'],
                  'parentContextScope': context['scope'],
                  'inputs': {key: {'path': str(getattr(args,key).resolve()), 'sha256': digest} for key,digest in PINS.items()},
                  'verifiedBindings': bindings.records, 'generatorSHA256': sha(generator),
                  'schema': report['schema'], 'releaseApproved': False, 'heightAuthorityGranted': False,
                  'summary': report['summary'], 'deltas': report['deltas'], 'assumptions': report['assumptions']}
    output['experimentalDomainPreparation'] = provenance
    output['scope'] = 'OWN experimental numeric context only. Original source provenance is retained below; hypothetical interior parameter bounds do not constitute production authority or a solved profile.'
    report['provenance'] = provenance
    require(Path(__file__).read_bytes() == generator, 'Generator changed while preparing')
    write_outputs(args.output_context, args.output_report, output, report)
    print(json.dumps({'report': str(args.output_report), 'reportSHA256': sha(args.output_report.read_bytes()),
                      'context': report['outputContext'], 'summary': report['summary'], 'releaseApproved': False}))


if __name__ == '__main__':
    main()
