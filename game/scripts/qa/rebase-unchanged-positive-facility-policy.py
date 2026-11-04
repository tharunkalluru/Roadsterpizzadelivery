#!/usr/bin/env python3
"""Rebind one unchanged local policy after unrelated railway research.

This does not create a new height envelope. Every referenced full road, ribbon,
source record, packed copy and complete incident arm must remain unchanged.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path

HELPER = Path(__file__).with_name('verify-scoped-generated-facility-rebase.py')
SPEC = importlib.util.spec_from_file_location('positive_rebase_exact', HELPER)
EXACT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXACT)
PARENT_POLICY_SHA256 = 'bc3d5b112499eb4716a9a16a48f0123105273ed2ceabea7b1f0cba1d9995e042'
GEOMETRIC_SOURCE_FIELDS = {'id', 'name', 'class', 'width_rules', 'level_rules', 'road_flags',
                           'access_restrictions', 'connectors', 'sources', 'geometryWKB', 'bbox'}


def require(value, message):
    if not value:
        raise ValueError(message)


def inventory(rows):
    out = {r['id']: r for r in rows}
    require(len(out) == len(rows), 'Duplicate road inventory')
    return out


def prepare(documents, bindings):
    policy = documents['policy']
    require(bindings['policy']['sha256'] == PARENT_POLICY_SHA256, 'Parent policy changed')
    require(policy['version'] == 1 and policy['releaseApproved'] is False, 'Parent policy scope changed')
    require(policy['sourceModelSHA256'] == bindings['old_model']['sha256'], 'Parent model binding changed')
    require(policy['sourceJointInputSHA256'] == bindings['old_joint']['sha256'], 'Parent joint binding changed')
    require(policy['sourceDataSHA256'] == bindings['source']['sha256'], 'Parent source binding changed')
    old, new = documents['old_model'], documents['new_model']
    oj, nj = documents['old_joint'], documents['new_joint']
    of, nf = documents['old_footprints'], documents['new_footprints']
    for key, model, joint, footprints in [('old_model', old, oj, of), ('new_model', new, nj, nf)]:
        require(joint['sourceModelSHA256'] == joint['sourceConditionedInputSHA256'] == footprints['sourceModelSHA256'] == bindings[key]['sha256'], 'Mixed model/joint/ribbon binding')
        require(joint['sourceDataSHA256'] == bindings['source']['sha256'], 'Mixed source geometry')
        require(joint['sourceRoadGeometryGeneration'] == model['sourceRoadGeometryGeneration'] == policy['sourceGeneration'], 'Source generation changed')
    require(EXACT.exact(old['profiles'], new['profiles']), 'Canonical rail inventory changed')
    require(EXACT.exact(oj['sourcePackSHA256'], nj['sourcePackSHA256']), 'Packed source inventory changed')
    original = inventory(old['roads'] + oj['tileRoads'] + oj['contextRoads'])
    current = inventory(new['roads'] + nj['tileRoads'] + nj['contextRoads'])
    old_fp = inventory(of['roads'] + oj['footprints'] + oj['contextFootprints'])
    new_fp = inventory(nf['roads'] + nj['footprints'] + nj['contextFootprints'])
    ids, nodes = set(), set()

    def walk(value):
        if isinstance(value, str):
            if value in original:
                ids.add(value)
        elif isinstance(value, list):
            for child in value:
                walk(child)
        elif isinstance(value, dict):
            if isinstance(value.get('node'), str):
                nodes.add(value['node'])
            for child in value.values():
                walk(child)

    walk(policy)
    require(len(ids) == 18 and len(nodes) == 9 and len(policy['roads']) == 16, 'Original policy scope changed')
    old_arms = {ident for ident, r in original.items() if r['from'] in nodes or r['to'] in nodes}
    new_arms = {ident for ident, r in current.items() if r['from'] in nodes or r['to'] in nodes}
    require(old_arms == new_arms, 'Complete incident arm inventory changed')
    ids |= old_arms
    records = []
    for ident in sorted(ids):
        require(ident in current and EXACT.exact(original[ident], current[ident]), 'Full local road changed: ' + ident)
        require(EXACT.exact(old_fp[ident], new_fp[ident]), 'Literal local ribbon changed: ' + ident)
        prefix = ident.split('_')[0]
        before_source, after_source = oj['sourceEvidence'][prefix], nj['sourceEvidence'][prefix]
        before_row, after_row = before_source['row'], after_source['row']
        require(GEOMETRIC_SOURCE_FIELDS <= before_row.keys() and GEOMETRIC_SOURCE_FIELDS <= after_row.keys(), 'Required local source field omitted: ' + ident)
        require(all(EXACT.exact(before_row[k], after_row[k]) for k in before_row.keys() & after_row.keys()), 'Retained local source content changed: ' + ident)
        prior_binding = {key: before_source.get(key) for key in ['path', 'sha256']}
        parent_recorded = prior_binding in after_source.get('priorBindings', []) or prior_binding == {key: after_source.get(key) for key in ['path', 'sha256']}
        for field in ['copies', 'contextCopies']:
            require(EXACT.exact(oj[field].get(ident), nj[field].get(ident)), 'Packed local copies changed: ' + ident)
        records.append({'id': ident, 'fullRoadRecordSHA256': EXACT.record_sha(original[ident]),
                        'literalFootprintRecordSHA256': EXACT.record_sha(old_fp[ident]),
                        'fullRoadRibbonSourceContentAndCopiesUnchanged': True,
                        'retainedParentSourceBinding': {key: before_source.get(key) for key in ['path', 'sha256']},
                        'currentSourceBinding': {key: after_source.get(key) for key in ['path', 'sha256']},
                        'originalRetainedSourceRow': copy.deepcopy(before_row),
                        'originalFieldsAbsentFromCurrentProjection': sorted(before_row.keys() - after_row.keys()),
                        'currentAdditionalFields': sorted(after_row.keys() - before_row.keys()),
                        'parentBindingRecordedInNewJoint': parent_recorded,
                        'parentBindingRetainedAndReplayedByThisProof': True,
                        'omittedProjectionFieldsAreNotReinterpretedAsNull': True})
    proof = {'version': 1, 'kind': 'unchanged-positive-facility-policy-rebase', 'inputs': bindings,
             'nodes': sorted(nodes), 'completeIncidentArms': sorted(old_arms), 'records': records,
             'canonicalRailsExactlyEqual': True, 'allPolicyDecisionsPreserved': True,
             'heightEnvelopeChanged': False, 'releaseApproved': False,
             'scope': 'Only a binding change for the original local policy after unrelated research. No new source, height, crossing, geometry or release approval.'}
    result = copy.deepcopy(policy)
    result.update(sourceModelSHA256=bindings['new_model']['sha256'], sourceJointInputSHA256=bindings['new_joint']['sha256'],
                  scopedUnchangedInputRebase=proof, researchOnly=True, releaseApproved=False)
    return result, proof


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    names = ['policy', 'old-model', 'old-footprints', 'old-joint', 'new-model', 'new-footprints', 'new-joint', 'source']
    for name in names + ['output', 'proof']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    require(args.output.resolve() != args.proof.resolve() and not args.output.exists() and not args.proof.exists(), 'Preserve existing outputs')
    held = {name.replace('-', '_'): getattr(args, name.replace('-', '_')).read_bytes() for name in names}
    bindings = {key: {'path': str(getattr(args, key).resolve()), 'sha256': EXACT.sha(raw)} for key, raw in held.items()}
    documents = {key: json.loads(raw, object_pairs_hook=EXACT.no_duplicate_keys) for key, raw in held.items()}
    for document in documents.values():
        EXACT.finite_json(document)
    result, proof = prepare(documents, bindings)
    source_files = {}
    for key in ['old_joint', 'new_joint']:
        for row in proof['records']:
            source = documents[key]['sourceEvidence'][row['id'].split('_')[0]]
            path = Path(source['path'])
            if path not in source_files:
                raw = path.read_bytes()
                bundle = json.loads(raw, object_pairs_hook=EXACT.no_duplicate_keys)
                source_files[path] = (raw, inventory(bundle['rows']))
            raw, records = source_files[path]
            require(EXACT.sha(raw) == source['sha256'], 'Retained source file changed: ' + str(path))
            actual = records[source['row']['id']]
            require(all(k in actual and EXACT.exact(actual[k], v) for k, v in source['row'].items()), 'Retained source row disagrees: ' + source['row']['id'])
            if key == 'new_joint':
                # The current evidence can intentionally project fewer fields.
                # Any parent field present in the actual current bundle must
                # still agree; projection cannot conceal a contradictory value.
                for field, value in row['originalRetainedSourceRow'].items():
                    if field in actual:
                        require(EXACT.exact(actual[field], value), 'Current source row contradicts retained parent field: ' + source['row']['id'] + '/' + field)
    for relative, digest in documents['new_joint']['sourcePackSHA256'].items():
        require(EXACT.sha((args.repo / relative).read_bytes()) == digest, 'Packed source changed: ' + relative)
    for key, raw in held.items():
        require(getattr(args, key).read_bytes() == raw, 'Input changed during proof: ' + key)
    for path, (raw, _) in source_files.items():
        require(path.read_bytes() == raw, 'Retained source changed during proof: ' + str(path))
    proof['generatorSHA256'] = EXACT.sha(Path(__file__).read_bytes())
    proof['exactVerifierSHA256'] = EXACT.sha(HELPER.read_bytes())
    for path, data in [(args.output, result), (args.proof, proof)]:
        with path.open('x') as target:
            json.dump(data, target, indent=2, allow_nan=False)
            target.write('\n')
    print(json.dumps({'output': str(args.output), 'sha256': EXACT.sha(args.output.read_bytes()),
                      'proof': str(args.proof), 'proofSHA256': EXACT.sha(args.proof.read_bytes()),
                      'roads': len(proof['records']), 'nodes': len(proof['nodes']), 'releaseApproved': False}))


if __name__ == '__main__':
    main()
