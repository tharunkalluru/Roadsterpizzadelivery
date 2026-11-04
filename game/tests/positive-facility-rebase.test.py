import copy
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('positive_rebase', ROOT / 'scripts/qa/rebase-unchanged-positive-facility-policy.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class PositiveFacilityRebase(unittest.TestCase):
    def data(self):
        roads = [{'id': 'r' + str(i), 'from': 'n' + str(i % 9), 'to': 'n' + str((i + 1) % 9),
                  'pts': [[i, 0], [i + 1, 0]], 'elev': [0., 0.], 'w': 6.1} for i in range(18)]
        fp = [{'id': r['id'], 'L': [[0, -3.05], [1, -3.05]], 'R': [[0, 3.05], [1, 3.05]]} for r in roads]
        joint = {'sourceModelSHA256': 'old', 'sourceConditionedInputSHA256': 'old', 'sourceDataSHA256': 'source',
                 'sourceRoadGeometryGeneration': 'generation', 'sourcePackSHA256': {'pack': 'digest'},
                 'tileRoads': [], 'contextRoads': [], 'footprints': [], 'contextFootprints': [],
                 'copies': {}, 'contextCopies': {}, 'sourceEvidence': {r['id']: {'row': {
                     **{key: None for key in M.GEOMETRIC_SOURCE_FIELDS}, 'id': r['id']}} for r in roads}}
        model = {'sourceRoadGeometryGeneration': 'generation', 'roads': roads, 'profiles': [{'id': 'rail', 'elev': [0, 0]}]}
        policy = {'version': 1, 'releaseApproved': False, 'sourceModelSHA256': 'old', 'sourceJointInputSHA256': 'old_joint',
                  'sourceDataSHA256': 'source', 'sourceGeneration': 'generation', 'roads': [{'id': r['id']} for r in roads[:16]],
                  'nodes': [{'node': 'n' + str(i)} for i in range(9)], 'positiveBridge': {'road': 'r16', 'canonicalCompanion': 'r17'}}
        data = {'policy': policy, 'old_model': model, 'new_model': copy.deepcopy(model),
                'old_joint': joint, 'new_joint': copy.deepcopy(joint),
                'old_footprints': {'sourceModelSHA256': 'old', 'roads': fp},
                'new_footprints': {'sourceModelSHA256': 'new', 'roads': copy.deepcopy(fp)}}
        data['new_joint'].update(sourceModelSHA256='new', sourceConditionedInputSHA256='new')
        bindings = {key: {'sha256': value, 'path': key} for key, value in
                    [('policy', 'pinned'), ('old_model', 'old'), ('new_model', 'new'), ('old_joint', 'old_joint'),
                     ('new_joint', 'new_joint'), ('source', 'source')]}
        return data, bindings

    def run_case(self, mutate=None):
        d, b = self.data()
        if mutate:
            mutate(d, b)
        with patch.object(M, 'PARENT_POLICY_SHA256', 'pinned'):
            return M.prepare(d, b)

    def test_only_input_binding_changes_and_no_envelope_or_release_is_granted(self):
        result, proof = self.run_case()
        d, _ = self.data()
        self.assertEqual(result['roads'], d['policy']['roads'])
        self.assertEqual(result['nodes'], d['policy']['nodes'])
        self.assertEqual(result['sourceModelSHA256'], 'new')
        self.assertEqual(result['sourceJointInputSHA256'], 'new_joint')
        self.assertFalse(proof['heightEnvelopeChanged'])
        self.assertFalse(result['releaseApproved'])
        self.assertEqual(len(proof['records']), 18)

    def test_changed_full_profile_and_signed_zero_are_rejected(self):
        for key, value in [('w', 9), ('elev', [-0., 0.]), ('extra', None)]:
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'Full local road'):
                self.run_case(lambda d, b, k=key, v=value: d['new_model']['roads'][0].update({k: v}))

    def test_missing_additional_and_changed_incident_arms_are_rejected(self):
        for mutate in [lambda d, b: d['new_model']['roads'].pop(),
                       lambda d, b: d['new_model']['roads'].append(dict(copy.deepcopy(d['new_model']['roads'][0]), id='extra')),
                       lambda d, b: d['new_model']['roads'][0].update(to='different')]:
            with self.assertRaises(ValueError):
                self.run_case(mutate)

    def test_ribbons_rails_sources_and_owner_copies_remain_exact(self):
        mutations = [lambda d, b: d['new_footprints']['roads'][0]['R'][0].__setitem__(0, .01),
                     lambda d, b: d['new_model']['profiles'][0]['elev'].__setitem__(0, .01),
                     lambda d, b: d['new_joint']['sourceEvidence']['r0']['row'].update(level_rules=[1]),
                     lambda d, b: d['new_joint']['copies'].update(r0=[{'different': True}]),
                     lambda d, b: d['new_joint']['sourcePackSHA256'].update(pack='changed')]
        for mutate in mutations:
            with self.assertRaises(ValueError):
                self.run_case(mutate)

    def test_stale_parent_and_mixed_fresh_bindings_are_rejected(self):
        mutations = [lambda d, b: b['policy'].update(sha256='unpinned'),
                     lambda d, b: d['policy'].update(sourceModelSHA256='wrong'),
                     lambda d, b: d['new_joint'].update(sourceDataSHA256='wrong'),
                     lambda d, b: d['new_footprints'].update(sourceModelSHA256='wrong'),
                     lambda d, b: d['new_model'].update(sourceRoadGeometryGeneration='wrong')]
        for mutate in mutations:
            with self.assertRaises(ValueError):
                self.run_case(mutate)

    def test_source_completion_retains_original_content_and_provenance(self):
        def complete(d, b):
            d['old_joint']['sourceEvidence']['r0'].update(path='old-source', sha256='old-digest', priorBindings=[])
            d['new_joint']['sourceEvidence']['r0'].update(path='new-source', sha256='new-digest',
                priorBindings=[{'path': 'old-source', 'sha256': 'old-digest'}])
        result, proof = self.run_case(complete)
        self.assertEqual(proof['records'][0]['retainedParentSourceBinding']['sha256'], 'old-digest')
        def omit(d, b):
            complete(d, b)
            d['new_joint']['sourceEvidence']['r0']['priorBindings'] = []
        _, proof = self.run_case(omit)
        self.assertFalse(proof['records'][0]['parentBindingRecordedInNewJoint'])
        self.assertTrue(proof['records'][0]['parentBindingRetainedAndReplayedByThisProof'])
        self.assertEqual(proof['records'][0]['retainedParentSourceBinding'], {'path': 'old-source', 'sha256': 'old-digest'})
        def project(d, b):
            complete(d, b)
            d['old_joint']['sourceEvidence']['r0']['row']['version'] = 3
        _, proof = self.run_case(project)
        self.assertEqual(proof['records'][0]['originalFieldsAbsentFromCurrentProjection'], ['version'])
        self.assertEqual(proof['records'][0]['originalRetainedSourceRow']['version'], 3)
        def lose_level(d, b):
            complete(d, b)
            del d['new_joint']['sourceEvidence']['r0']['row']['level_rules']
        with self.assertRaisesRegex(ValueError, 'Required local source field omitted'):
            self.run_case(lose_level)

    def test_cli_checks_actual_source_fields_hidden_by_the_current_projection(self):
        # Exercise main's file replay with real digests. A compact sourceEvidence
        # projection must not hide contradictory fields present in its bundle.
        for conflicting_current_field in [False, True]:
            with self.subTest(conflicting_current_field=conflicting_current_field), tempfile.TemporaryDirectory() as folder:
                folder = Path(folder)
                data, _ = self.data()

                def encoded(value):
                    return (json.dumps(value, separators=(',', ':'), allow_nan=False) + '\n').encode()

                def write(name, value):
                    path = folder / (name + '.json')
                    raw = encoded(value)
                    path.write_bytes(raw)
                    return path, hashlib.sha256(raw).hexdigest()

                source_path, source_sha = write('source', {'generationID': 'generation'})
                pack_path, pack_sha = write('pack', {'roads': []})
                old_rows = [copy.deepcopy(e['row']) for e in data['old_joint']['sourceEvidence'].values()]
                old_rows[0]['rail_flags'] = None
                new_rows = [copy.deepcopy(e['row']) for e in data['new_joint']['sourceEvidence'].values()]
                if conflicting_current_field:
                    new_rows[0]['rail_flags'] = [{'between': [0, 1], 'value': 'bridge'}]
                old_source_path, old_source_sha = write('old-source-bundle', {'rows': old_rows})
                new_source_path, new_source_sha = write('new-source-bundle', {'rows': new_rows})
                data['new_model']['researchOnly'] = True
                paths = {'source': source_path}
                model_sha = {}
                for key in ['old_model', 'new_model']:
                    paths[key], model_sha[key] = write(key, data[key])
                for prefix, bundle_path, bundle_sha in [('old', old_source_path, old_source_sha), ('new', new_source_path, new_source_sha)]:
                    joint = data[prefix + '_joint']
                    joint.update(sourceModelSHA256=model_sha[prefix + '_model'],
                                 sourceConditionedInputSHA256=model_sha[prefix + '_model'],
                                 sourceDataSHA256=source_sha, sourcePackSHA256={pack_path.name: pack_sha})
                    for ident, entry in joint['sourceEvidence'].items():
                        entry.update(path=str(bundle_path), sha256=bundle_sha)
                        if prefix == 'old' and ident == 'r0':
                            entry['row']['rail_flags'] = None
                    paths[prefix + '_joint'], joint_sha = write(prefix + '_joint', joint)
                    footprints = data[prefix + '_footprints']
                    footprints['sourceModelSHA256'] = model_sha[prefix + '_model']
                    paths[prefix + '_footprints'], _ = write(prefix + '_footprints', footprints)
                    if prefix == 'old':
                        data['policy'].update(sourceModelSHA256=model_sha['old_model'],
                                              sourceJointInputSHA256=joint_sha, sourceDataSHA256=source_sha)
                paths['policy'], policy_sha = write('policy', data['policy'])
                output, proof_path = folder / 'output.json', folder / 'proof.json'
                argv = [str(M.__file__), '--repo', str(folder), '--output', str(output), '--proof', str(proof_path)]
                for key, path in paths.items():
                    argv += ['--' + key.replace('_', '-'), str(path)]
                with patch.object(M, 'PARENT_POLICY_SHA256', policy_sha), patch.object(sys, 'argv', argv), contextlib.redirect_stdout(io.StringIO()):
                    if conflicting_current_field:
                        with self.assertRaisesRegex(ValueError, 'Current source row contradicts retained parent field: r0/rail_flags'):
                            M.main()
                        self.assertFalse(output.exists())
                        self.assertFalse(proof_path.exists())
                    else:
                        M.main()
                        proof = json.loads(proof_path.read_text())
                        record = next(row for row in proof['records'] if row['id'] == 'r0')
                        self.assertIsNone(record['originalRetainedSourceRow']['rail_flags'])
                        self.assertIn('rail_flags', record['originalFieldsAbsentFromCurrentProjection'])
                        self.assertTrue(record['omittedProjectionFieldsAreNotReinterpretedAsNull'])
                        self.assertFalse(json.loads(output.read_text())['releaseApproved'])


if __name__ == '__main__':
    unittest.main()
