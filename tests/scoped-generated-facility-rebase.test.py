"""Exercise the offline verifier with literal scoped geometry and corruptions."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / 'scripts/qa/verify-scoped-generated-facility-rebase.py'
SPEC = importlib.util.spec_from_file_location('scoped_facility_rebase', HELPER)
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)
POLICY_BYTES = (ROOT / VERIFIER.DEFAULT_POLICY).read_bytes()
POLICY = json.loads(POLICY_BYTES)
CLASSIFICATION_BYTES = (ROOT / POLICY['sourceClassification']).read_bytes()
CLASSIFICATION = json.loads(CLASSIFICATION_BYTES)
FIXTURE = json.loads((ROOT / 'tests/fixtures/anandbagh-scoped-policy-rebase.json').read_text())


def encoded(value):
    return (json.dumps(value, separators=(',', ':'), allow_nan=False) + '\n').encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


class ScopedGeneratedFacilityRebase(unittest.TestCase):
    def documents(self):
        model = {key: copy.deepcopy(FIXTURE[key]) for key in ['sourceRoadGeometryGeneration', 'roads', 'profiles']}
        old_model_sha = digest(encoded(model))
        footprints = {'sourceModelSHA256': old_model_sha, 'roads': copy.deepcopy(FIXTURE['footprints'])}
        old_fp_sha = digest(encoded(footprints))
        classification = copy.deepcopy(CLASSIFICATION)
        classification['beforeAfterUnchangedInputs'] = {'fixture-old-model': old_model_sha, 'fixture-old-footprints': old_fp_sha}
        class_sha = digest(encoded(classification))
        policy = copy.deepcopy(POLICY)
        policy.update(sourceModelSHA256=old_model_sha, sourceFootprintsSHA256=old_fp_sha,
                      sourceClassificationSHA256=class_sha)
        for road in policy['roads']:
            road['sourceClassificationSHA256'] = class_sha
        new_model = dict(copy.deepcopy(model), researchOnly=True)
        new_fp = dict(copy.deepcopy(footprints), sourceModelSHA256=digest(encoded(new_model)))
        return dict(policy=policy, classification=classification, old_model=model,
                    old_footprints=footprints, new_model=new_model, new_footprints=new_fp)

    def run_case(self, mutate=None, repin_parent=False, raw_mutation=None):
        data = self.documents()
        expected_policy = digest(encoded(data['policy']))
        expected_classification = digest(encoded(data['classification']))
        if mutate:
            mutate(data)
        # Keep this binding current so geometry corruption reaches the semantic
        # guard instead of being rejected only by the outer footprint hash.
        data['new_footprints']['sourceModelSHA256'] = digest(encoded(data['new_model']))
        if repin_parent:
            expected_classification = digest(encoded(data['classification']))
            data['policy']['sourceClassificationSHA256'] = expected_classification
            for road in data['policy']['roads']:
                road['sourceClassificationSHA256'] = expected_classification
            expected_policy = digest(encoded(data['policy']))
        with tempfile.TemporaryDirectory() as folder:
            paths = {key: Path(folder) / (key + '.json') for key in data}
            for key, value in data.items():
                paths[key].write_bytes(encoded(value))
            if raw_mutation:
                raw_mutation(paths)
            # Compact fixture files have their own parent digests. Production
            # CLI has no digest override and always uses the pinned real parents.
            with patch.object(VERIFIER, 'PARENT_POLICY_SHA256', expected_policy), \
                    patch.object(VERIFIER, 'PARENT_CLASSIFICATION_SHA256', expected_classification):
                return VERIFIER.build_proof(paths)

    def test_real_parent_bytes_are_pinned(self):
        self.assertEqual(digest(POLICY_BYTES), VERIFIER.PARENT_POLICY_SHA256)
        self.assertEqual(digest(CLASSIFICATION_BYTES), VERIFIER.PARENT_CLASSIFICATION_SHA256)

    def test_literal_two_road_rebase_preserves_limits_and_grants_no_authority(self):
        proof = self.run_case()
        self.assertEqual(sum(r['inputControlCount'] for r in proof['records']), 138)
        self.assertEqual({r['id'] for r in proof['records']}, set(VERIFIER.SCOPED_ROADS))
        self.assertTrue(all(len(r['protectedControlIndices']) == 10 for r in proof['records']))
        for road in proof['records']:
            original = next(r for r in POLICY['roads'] if r['id'] == road['id'])
            preserved = road['preservedParentRoadPolicy']
            self.assertEqual(preserved['maximumGradeChangePerMetre'], original['maximumGradeChangePerMetre'])
            self.assertEqual(preserved['curvatureIntervals'], original['curvatureIntervals'])
            self.assertEqual(preserved['existingHeightEnvelope'], [-6.5, 0])
        self.assertFalse(proof['releaseApproved'])
        self.assertFalse(proof['heightAuthorityGranted'])
        self.assertFalse(proof['fullModelApproved'])
        self.assertFalse(proof['solverOrConsumerGuardChanged'])

    def test_changed_full_road_or_literal_ribbon_is_rejected(self):
        mutations = [
            lambda d: d['new_model']['roads'][0]['pts'][1].__setitem__(0, 123.),
            lambda d: d['new_model']['roads'][0]['elev'].__setitem__(1, -3.),
            lambda d: d['new_model']['roads'][0].update(w=99),
            lambda d: d['new_model']['roads'][0].update(lanes=99),
            lambda d: d['new_model']['roads'][0].update(elevationSource='surveyed'),
            lambda d: d['new_model']['roads'][0].update(extraMetadata=None),
            lambda d: d['new_footprints']['roads'][0]['L'][1].__setitem__(0, 123.),
            lambda d: d['new_model']['profiles'][0]['pts'][0].__setitem__(0, 123.),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate), self.assertRaises(ValueError):
                self.run_case(mutate)

    def test_missing_additional_and_duplicate_roads_are_rejected(self):
        mutations = [
            lambda d: d['new_model']['roads'].pop(),
            lambda d: d['new_footprints']['roads'].pop(),
            lambda d: d['new_model']['roads'].append(dict(copy.deepcopy(d['new_model']['roads'][0]), id='extra')),
            lambda d: d['new_model']['roads'].append(copy.deepcopy(d['new_model']['roads'][0])),
            lambda d: d['new_footprints']['roads'].append(copy.deepcopy(d['new_footprints']['roads'][0])),
            lambda d: d['policy']['roads'].append(copy.deepcopy(d['policy']['roads'][0])),
            lambda d: d['classification']['records'].append(copy.deepcopy(d['classification']['records'][0])),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate), self.assertRaises(ValueError):
                self.run_case(mutate, repin_parent=True)

    def test_classification_and_protected_control_inventory_are_checked(self):
        mutations = [
            lambda d: d['classification']['records'][0]['controls'][1]['point'].__setitem__(0, 123.),
            lambda d: d['classification']['records'][0]['controls'][1].update(inputHeight=123.),
            lambda d: d['classification']['records'][0]['controls'][1].update(index=0),
            lambda d: d['classification']['records'][0]['controls'][0].update(immutableFacilityControl=False),
            lambda d: d['policy']['roads'][0]['protectedControlIndices'].pop(),
            lambda d: d['policy']['roads'][0].update(maximumGradeChangePerMetre=.015),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate), self.assertRaises(ValueError):
                self.run_case(mutate, repin_parent=True)

    def test_stale_parent_hashes_and_old_bindings_are_rejected(self):
        for key in ['policy', 'classification']:
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'Stale parent'):
                self.run_case(raw_mutation=lambda paths, k=key: paths[k].write_bytes(paths[k].read_bytes() + b'\n'))
        with self.assertRaisesRegex(ValueError, 'Old model'):
            self.run_case(lambda d: d['old_model']['roads'][0].update(w=99))

    def test_boolean_alias_signed_zero_and_nonfinite_numbers_are_rejected(self):
        def change_zero(data, value):
            values = data['new_model']['roads'][0]['elev']
            values[next(i for i, y in enumerate(values) if y == 0)] = value
        for value in [False, -0.0]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.run_case(lambda d, v=value: change_zero(d, v))
        with self.assertRaisesRegex(ValueError, 'Nonfinite'):
            self.run_case(raw_mutation=lambda paths: paths['new_model'].write_bytes(paths['new_model'].read_bytes().replace(b'"researchOnly":true', b'"researchOnly":1e309')))

    def test_existing_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'proof.json'
            output.write_text('keep exactly')
            command = [sys.executable, str(HELPER), '--output', str(output)]
            for key in ['old-model', 'old-footprints', 'new-model', 'new-footprints']:
                command += ['--' + key, str(Path(folder) / 'unused.json')]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Output already exists', result.stderr)
            self.assertEqual(output.read_text(), 'keep exactly')

    def test_explicit_consumer_replays_inputs_instead_of_trusting_proof_claims(self):
        data = self.documents()
        with tempfile.TemporaryDirectory() as folder:
            paths = {key: Path(folder) / (key + '.json') for key in data}
            for key, value in data.items():
                paths[key].write_bytes(encoded(value))
            with patch.object(VERIFIER, 'PARENT_POLICY_SHA256', digest(encoded(data['policy']))), \
                    patch.object(VERIFIER, 'PARENT_CLASSIFICATION_SHA256', digest(encoded(data['classification']))):
                proof = VERIFIER.build_proof(paths)
                proof['generatorSHA256'] = digest(HELPER.read_bytes())
                target = Path(folder) / 'proof.json'
                target.write_bytes(encoded(proof))
                summary = VERIFIER.verify_proof(target, proof['inputs']['new_model']['sha256'], proof['inputs']['new_footprints']['sha256'])
                self.assertEqual(summary['proofSHA256'], digest(target.read_bytes()))
                self.assertFalse(summary['heightAuthorityGranted'])
                with self.assertRaisesRegex(ValueError, 'new model mismatch'):
                    VERIFIER.verify_proof(target, '0' * 64)
                with self.assertRaisesRegex(ValueError, 'new footprints mismatch'):
                    VERIFIER.verify_proof(target, expected_footprints_sha='0' * 64)
                for field in ['releaseApproved', 'fullModelApproved', 'heightAuthorityGranted']:
                    changed = copy.deepcopy(proof)
                    changed[field] = True
                    target.write_bytes(encoded(changed))
                    with self.assertRaisesRegex(ValueError, 'fresh input verification'):
                        VERIFIER.verify_proof(target)
                target.write_bytes(encoded(proof))
                paths['new_model'].write_bytes(paths['new_model'].read_bytes() + b'\n')
                with self.assertRaises(ValueError):
                    VERIFIER.verify_proof(target)


if __name__ == '__main__':
    unittest.main()
