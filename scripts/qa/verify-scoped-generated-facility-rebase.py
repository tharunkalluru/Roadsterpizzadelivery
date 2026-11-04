#!/usr/bin/env python3
"""Prove unchanged inputs for the existing two-road comfort policy, offline only.

This creates no profiles or height authority and changes no solver/consumer guard.
The parent policy and classification bytes are pinned; only their original two
full road records, literal ribbons and referenced canonical rails are rebased.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path

PARENT_POLICY_SHA256 = 'ae74b4f9e2ba131fd4290af445e3969489849dfa59dfcfb487571061514aaf2c'
PARENT_CLASSIFICATION_SHA256 = '43c22f6f8fbb084e0f5a735bfb427ec1621f1deadcabdc3276221f9a03a3718f'
SCOPED_ROADS = {'28b00d08-4ff_1': 68, '01ceee91-29b_0': 70}
LOCAL_LIMITS = {'28b00d08-4ff_1': .0149969, '01ceee91-29b_0': .0137167}
DEFAULT_POLICY = 'docs/qa/evidence/reported-roads/anandbagh-generated-approach-policy-9413.json'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON key: ' + key)
        result[key] = value
    return result


def finite_json(value):
    if isinstance(value, float):
        require(math.isfinite(value), 'Nonfinite JSON number')
    elif isinstance(value, dict):
        for child in value.values():
            finite_json(child)
    elif isinstance(value, list):
        for child in value:
            finite_json(child)


def exact(first, second):
    """JSON number equality, retaining signed zero and excluding bool/number aliases."""
    if type(first) in (int, float) and type(second) in (int, float):
        return first == second and (first != 0 or math.copysign(1, first) == math.copysign(1, second))
    if type(first) is not type(second):
        return False
    if isinstance(first, dict):
        return first.keys() == second.keys() and all(exact(first[k], second[k]) for k in first)
    if isinstance(first, list):
        return len(first) == len(second) and all(exact(a, b) for a, b in zip(first, second))
    return first == second


def inventory(rows, label, key='id'):
    require(isinstance(rows, list), label + ': expected an array')
    out = {}
    for row in rows:
        require(isinstance(row, dict) and isinstance(row.get(key), str), label + ': invalid record')
        ident = row[key]
        require(ident not in out, label + ': duplicate road ' + ident)
        out[ident] = row
    return out


def record_sha(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode())


def build_proof(paths):
    held = {key: Path(path).read_bytes() for key, path in paths.items()}
    digests = {key: sha(raw) for key, raw in held.items()}
    require(digests['policy'] == PARENT_POLICY_SHA256, 'Stale parent policy SHA')
    require(digests['classification'] == PARENT_CLASSIFICATION_SHA256, 'Stale parent classification SHA')
    documents = {}
    for key, raw in held.items():
        documents[key] = json.loads(raw, object_pairs_hook=no_duplicate_keys)
        finite_json(documents[key])
    policy, classification = documents['policy'], documents['classification']
    require(policy['version'] == 1 and policy['releaseApproved'] is False, 'Parent policy scope changed')
    require(classification['version'] == 1 and classification['pass'] is True and classification['releaseApproved'] is False, 'Classification scope changed')
    require(policy['sourceClassificationSHA256'] == digests['classification'], 'Policy/classification binding changed')
    require(policy['sourceModelSHA256'] == digests['old_model'], 'Old model does not match parent policy')
    require(policy['sourceFootprintsSHA256'] == digests['old_footprints'], 'Old footprints do not match parent policy')
    old_bindings = set(classification['beforeAfterUnchangedInputs'].values())
    require({digests['old_model'], digests['old_footprints']} <= old_bindings, 'Classification old input binding changed')
    require(exact(policy['globalGradeChangePerMetre'], .00625) and exact(policy['maximumPermittedLocalGradeChangePerMetre'], .015), 'Original comfort ceilings changed')
    policies = inventory(policy['roads'], 'Policy')
    classified = inventory(classification['records'], 'Classification', 'road')
    require(set(policies) == set(classified) == set(SCOPED_ROADS), 'Missing or additional scoped road')
    old_model, new_model = documents['old_model'], documents['new_model']
    old_fp, new_fp = documents['old_footprints'], documents['new_footprints']
    require(old_fp['sourceModelSHA256'] == digests['old_model'], 'Old footprint/model binding changed')
    require(new_fp['sourceModelSHA256'] == digests['new_model'], 'New footprint/model binding changed')
    require(exact(old_model['sourceRoadGeometryGeneration'], new_model['sourceRoadGeometryGeneration']), 'Source geometry generation changed')
    old_roads, new_roads = inventory(old_model['roads'], 'Old model'), inventory(new_model['roads'], 'New model')
    old_ribbons, new_ribbons = inventory(old_fp['roads'], 'Old footprints'), inventory(new_fp['roads'], 'New footprints')
    require(set(old_roads) == set(new_roads) == set(old_ribbons) == set(new_ribbons), 'Missing or additional model/footprint road')
    require(set(SCOPED_ROADS) <= set(old_roads), 'Scoped road missing from model')
    old_rails, new_rails = inventory(old_model['profiles'], 'Old rails'), inventory(new_model['profiles'], 'New rails')
    records, referenced_rails = [], set()
    for ident, count in SCOPED_ROADS.items():
        rule, classified_road = policies[ident], classified[ident]
        old, new = old_roads[ident], new_roads[ident]
        require(exact(old, new), 'Full road record changed: ' + ident)
        require(old.get('elevationSource') not in ['surveyed', 'explicit'] and not old.get('expressway'), 'Protected/surveyed road: ' + ident)
        require(exact(old_ribbons[ident], new_ribbons[ident]), 'Literal footprint changed: ' + ident)
        require(len(old['pts']) == len(old['elev']) == rule['inputControlCount'] == count, 'Control count changed: ' + ident)
        require(exact(old['elev'], rule['inputHeights']), 'Policy input heights changed: ' + ident)
        require(classified_road['rawSourceProfile'] is None and classified_road['currentProfileIsSurveyed'] is False, 'Generated classification changed: ' + ident)
        require(exact(rule['existingHeightEnvelope'], [-6.5, 0]) and exact([min(old['elev']), max(old['elev'])], rule['existingHeightEnvelope']), 'Existing height envelope changed: ' + ident)
        require(exact(rule['maximumGradeChangePerMetre'], LOCAL_LIMITS[ident]), 'Local comfort limit changed: ' + ident)
        require(rule['sourceClassificationSHA256'] == digests['classification'], 'Road classification digest changed: ' + ident)
        controls = classified_road['controls']
        require(len(controls) == count and exact([c['index'] for c in controls], list(range(count))), 'Missing, additional or reordered classification control: ' + ident)
        for index, control in enumerate(controls):
            require(exact(control['point'], old['pts'][index]) and exact(control['inputHeight'], old['elev'][index]), 'Classification point/height changed: ' + ident)
            require(type(control['immutableFacilityControl']) is bool, 'Invalid immutable-control flag: ' + ident)
        protected = [c['index'] for c in controls if c['immutableFacilityControl']]
        generated = [index for index in range(count) if index not in protected]
        require(len(protected) == 10 and exact(protected, rule['protectedControlIndices']) and exact(generated, rule['generatedControlIndices']), 'Protected/generated inventory changed: ' + ident)
        require(0 in protected and count - 1 in protected, 'Endpoint protection changed: ' + ident)
        rail_controls = [c for c in controls if c['canonicalFiniteRailIDs']]
        require(len(rail_controls) == 8 and all(c['immutableFacilityControl'] for c in rail_controls), 'Canonical rail control inventory changed: ' + ident)
        for control in rail_controls:
            referenced_rails.update(control['canonicalFiniteRailIDs'])
        for side in ['L', 'R']:
            require(len(old_ribbons[ident][side]) == count, 'Ribbon control count changed: ' + ident)
        records.append({'id': ident, 'inputControlCount': count,
                        'fullRoadRecordSHA256': record_sha(old), 'literalFootprintRecordSHA256': record_sha(old_ribbons[ident]),
                        'fullRoadRecordUnchanged': True, 'literalFootprintUnchanged': True,
                        'classificationPointsAndHeightsUnchanged': True,
                        'protectedControlIndices': protected, 'generatedControlIndices': generated,
                        'protectedTargets': [{'index': k, 'point': old['pts'][k], 'inputHeight': old['elev'][k], 'classification': controls[k]['classification'], 'canonicalFiniteRailIDs': controls[k]['canonicalFiniteRailIDs']} for k in protected],
                        'preservedParentRoadPolicy': copy.deepcopy(rule)})
    for ident in sorted(referenced_rails):
        require(ident in old_rails and ident in new_rails and exact(old_rails[ident], new_rails[ident]), 'Referenced canonical railway changed: ' + ident)
    require(all(Path(paths[key]).read_bytes() == raw for key, raw in held.items()), 'Input changed during verification')
    return {'version': 1, 'kind': 'scoped-generated-facility-policy-rebase-proof',
            'releaseApproved': False, 'heightAuthorityGranted': False, 'fullModelApproved': False,
            'scope': 'Unchanged scoped input proof for the original two local comfort policies only. No fitted profiles, new height/facility authority, runtime activation or full-model approval. Solver and consumer global model guards remain unchanged.',
            'inputs': {key: {'path': str(Path(paths[key]).resolve()), 'sha256': digest} for key, digest in digests.items()},
            'roadIDs': list(SCOPED_ROADS), 'records': records,
            'referencedCanonicalRails': [{'id': ident, 'recordSHA256': record_sha(old_rails[ident])} for ident in sorted(referenced_rails)],
            'preservedGlobalGradeChangePerMetre': policy['globalGradeChangePerMetre'],
            'preservedMaximumPermittedLocalGradeChangePerMetre': policy['maximumPermittedLocalGradeChangePerMetre'],
            'originalClassificationDecisionsRemainUnchanged': True,
            'requiresExplicitFutureConsumption': True, 'solverOrConsumerGuardChanged': False}


def verify_proof(proof_path, expected_model_sha=None, expected_footprints_sha=None):
    """Replay the full unchanged-input proof; an attestation alone is insufficient."""
    source_bytes = Path(__file__).read_bytes()
    proof_path = Path(proof_path)
    raw = proof_path.read_bytes()
    proof = json.loads(raw, object_pairs_hook=no_duplicate_keys)
    finite_json(proof)
    require(proof.get('generatorSHA256') == sha(source_bytes), 'Scoped verifier changed; regenerate proof')
    inputs = proof.get('inputs', {})
    names = {'old_model', 'old_footprints', 'new_model', 'new_footprints', 'policy', 'classification'}
    require(set(inputs) == names, 'Scoped proof input inventory changed')
    paths = {key: Path(value['path']) for key, value in inputs.items()}
    expected = build_proof(paths)
    expected['generatorSHA256'] = sha(source_bytes)
    require(exact(proof, expected), 'Scoped proof does not match fresh input verification')
    if expected_model_sha is not None:
        require(proof['inputs']['new_model']['sha256'] == expected_model_sha, 'Scoped proof/new model mismatch')
    if expected_footprints_sha is not None:
        require(proof['inputs']['new_footprints']['sha256'] == expected_footprints_sha, 'Scoped proof/new footprints mismatch')
    require(proof_path.read_bytes() == raw and Path(__file__).read_bytes() == source_bytes, 'Scoped verifier/proof changed during verification')
    return {'proofSHA256': sha(raw), 'sourceModelSHA256': inputs['new_model']['sha256'],
            'sourceFootprintsSHA256': inputs['new_footprints']['sha256'],
            'sourcePolicySHA256': inputs['policy']['sha256'],
            'sourceClassificationSHA256': inputs['classification']['sha256'],
            'roads': proof['roadIDs'], 'releaseApproved': False, 'heightAuthorityGranted': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--policy', type=Path)
    parser.add_argument('--classification', type=Path)
    parser.add_argument('--verify-proof', type=Path)
    parser.add_argument('--expected-model-sha256')
    parser.add_argument('--expected-footprints-sha256')
    for name in ['old-model', 'old-footprints', 'new-model', 'new-footprints', 'output']:
        parser.add_argument('--' + name, type=Path)
    args = parser.parse_args()
    if args.verify_proof:
        require(not any(getattr(args, key) for key in ['old_model', 'old_footprints', 'new_model', 'new_footprints', 'output', 'policy', 'classification']), 'Verification does not accept input overrides')
        print(json.dumps(verify_proof(args.verify_proof, args.expected_model_sha256, args.expected_footprints_sha256)))
        return
    require(all(getattr(args, key) for key in ['old_model', 'old_footprints', 'new_model', 'new_footprints', 'output']), 'Proof generation requires old/new model and footprints plus output')
    require(not args.expected_model_sha256 and not args.expected_footprints_sha256, 'Expected digests belong to verification only')
    require(not args.output.exists(), 'Output already exists')
    policy_path = args.policy or args.repo / DEFAULT_POLICY
    # Pin the parent before reading a classification path supplied by its content.
    policy_bytes = policy_path.read_bytes()
    require(sha(policy_bytes) == PARENT_POLICY_SHA256, 'Stale parent policy SHA')
    classification_path = args.classification or args.repo / json.loads(policy_bytes)['sourceClassification']
    paths = {key: getattr(args, key) for key in ['old_model', 'old_footprints', 'new_model', 'new_footprints']}
    paths.update(policy=policy_path, classification=classification_path)
    source_bytes = Path(__file__).read_bytes()
    proof = build_proof(paths)
    proof['generatorSHA256'] = sha(source_bytes)
    require(Path(__file__).read_bytes() == source_bytes, 'Verifier changed during verification')
    with args.output.open('x') as output:
        json.dump(proof, output, indent=2, allow_nan=False)
        output.write('\n')
    print(json.dumps({'output': str(args.output), 'sha256': sha(args.output.read_bytes()), 'roads': len(proof['records']), 'controls': sum(r['inputControlCount'] for r in proof['records']), 'releaseApproved': False, 'heightAuthorityGranted': False}))


if __name__ == '__main__':
    main()
