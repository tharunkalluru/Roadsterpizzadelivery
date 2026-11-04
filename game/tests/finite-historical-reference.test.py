import copy
from fractions import Fraction
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'scripts/qa/finite-historical-reference.py'
SPEC = importlib.util.spec_from_file_location('finite_historical_reference', SOURCE)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class FiniteHistoricalReference(unittest.TestCase):
    def fixture(self):
        def triangle(points):
            return {'road': 'road', 'tile': 'owner', 'arc': [0., 4.],
                    'centre': [[0., 0.], [4., 0.]], 'cap': False,
                    'points': points, 'actualSurface': {'paintLift': .125}}
        triangles = [triangle([[0., 1.125, 0.], [4., 1.125, 0.], [0., 1.125, 4.]]),
                     triangle([[0., 1.625, 0.], [4., 1.625, 0.], [0., 1.625, 4.]]),
                     triangle([[2., 5.125, 0.], [3., 5.125, 0.], [2., 5.125, 2.]])]
        records = [{'actualFace': f'{i}:0', 'actualPoints': t['points'],
                    'tile': t['tile'], 'arc': t['arc'], 'centre': t['centre'],
                    'cap': t['cap'], 'binding': t['actualSurface'],
                    'paintLift': t['actualSurface']['paintLift']}
                   for i, t in enumerate(triangles)]
        polygon = [['0', '0'], ['2', '0'], ['2', '2'], ['0', '2']]
        geometry = {'exactOuterIntersectionPolygon': polygon,
                    'cells': [{'exactPolygon': polygon,
                               'affineFacesCoveringEntireCell': ['0:0', '1:0']}],
                    'boundaryOnlyLiteralFaceContacts': [{'actualFace': '2:0',
                        'exactContactGeometry': [['2', '0'], ['2', '2']]}],
                    'allRelevantLiteralAffineFaceBindings': records,
                    'exhaustiveOwnerFaceCensus': {'sourceHistoricalSHA256': 'historical',
                        'owner': 'road', 'allHistoricalTrianglesCount': 3}}
        candidate = {'road': 'road', 'node': '12345678-123',
                     'fullConnectorID': '12345678-1234-1234-1234-123456789abc',
                     'finiteSourceCensusGate': 'passes-within-existing-finite-source-interval',
                     'finiteCapStripFragments': [{'exactFiniteReferenceGeometry': geometry}]}
        proof = {'activePolicy': False, 'heightAuthorityGranted': False, 'releaseApproved': False,
                 'supportingFaceSourceFailures': [], 'inputs': {key: {'sha256': value} for key, value in
                  [('historical', 'historical'), ('geometry', 'geometry'), ('source', 'source')]},
                 'candidates': [candidate]}
        return {'triangles': triangles}, proof

    def index(self, historical=None, proof=None):
        old, new = self.fixture()
        return M.FiniteHistoricalReferenceIndex(historical or old, [('proof', proof or new)],
                   historical_sha256='historical', source_geometry_sha256='geometry',
                   source_reference_sha256='source')

    def test_all_affine_values_retained_without_current_height_or_crossing_authority(self):
        result = self.index().reference('road', [1., 1.])
        self.assertEqual([v['exactStructuralHeight'] for v in result['affineValues']], ['1', '3/2'])
        self.assertFalse(result['currentHeightAuthority'])
        self.assertFalse(result['independentCrossingWaiver'])
        self.assertNotIn('minimum', result)
        self.assertNotIn('maximum', result)

    def test_boundary_only_face_applies_only_on_its_exact_line(self):
        index = self.index()
        self.assertEqual(len(index.reference('road', [2., 1.])['affineValues']), 3)
        self.assertEqual(len(index.reference('road', [2.-1e-14, 1.])['affineValues']), 2)
        self.assertIsNone(index.reference('road', [2.+1e-14, 1.]))
        self.assertIsNone(index.reference('road', [3., 0.]))

    def test_missing_actual_boundary_or_interior_face_fails_closed_at_query(self):
        historical, proof = self.fixture()
        geometry = proof['candidates'][0]['finiteCapStripFragments'][0]['exactFiniteReferenceGeometry']
        geometry['boundaryOnlyLiteralFaceContacts'] = []
        geometry['allRelevantLiteralAffineFaceBindings'].pop()
        index = self.index(historical, proof)
        self.assertIsNone(index.reference('road', [2., 1.]))
        self.assertIsNotNone(index.reference('road', [1., 1.]))
        geometry['cells'][0]['affineFacesCoveringEntireCell'].remove('1:0')
        geometry['allRelevantLiteralAffineFaceBindings'].pop()
        self.assertIsNone(self.index(historical, proof).reference('road', [1., 1.]))

    def test_foreign_historical_source_or_new_corrected_frame_is_rejected(self):
        for key in ['historical', 'geometry', 'source']:
            historical, proof = self.fixture()
            proof['inputs'][key]['sha256'] = 'different'
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.index(historical, proof)

    def test_literal_metadata_binding_mutation_is_rejected(self):
        for key, value in [('actualPoints', [[0., 0., 0.]]*3), ('paintLift', .25),
                           ('arc', [1., 4.]), ('tile', 'other')]:
            historical, proof = self.fixture()
            record = proof['candidates'][0]['finiteCapStripFragments'][0][
                'exactFiniteReferenceGeometry']['allRelevantLiteralAffineFaceBindings'][0]
            record[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.index(historical, proof)

    def test_duplicate_actual_surface_bindings_are_never_collapsed(self):
        historical, proof = self.fixture()
        triangle = historical['triangles'][0]
        triangle['actualSurfaceBindings'] = [triangle['actualSurface'], {'paintLift': .25}]
        # Initially the newly introduced literal binding has no finite proof.
        self.assertIsNone(self.index(historical, proof).reference('road', [1., 1.]))
        geometry = proof['candidates'][0]['finiteCapStripFragments'][0]['exactFiniteReferenceGeometry']
        record = copy.deepcopy(geometry['allRelevantLiteralAffineFaceBindings'][0])
        record.update(actualFace='0:1', binding={'paintLift': .25}, paintLift=.25)
        geometry['allRelevantLiteralAffineFaceBindings'].append(record)
        geometry['cells'][0]['affineFacesCoveringEntireCell'].append('0:1')
        values = self.index(historical, proof).reference('road', [1., 1.])['affineValues']
        self.assertEqual([v['exactStructuralHeight'] for v in values], ['1', '7/8', '3/2'])

    def test_exact_rational_points_and_cell_vertices_work_without_rounding(self):
        index = self.index()
        for p in [[0., 0.], [2., 2.], [Fraction(1, 3), Fraction(2, 7)]]:
            self.assertIsNotNone(index.reference('road', p))
        self.assertIsNone(index.reference('road', [-Fraction(1, 10**40), 0.]))
        self.assertIsNone(index.reference('different-road', [1., 1.]))

    def test_concave_domain_and_coerced_or_nonfinite_query_are_rejected(self):
        with self.assertRaises(ValueError):
            M.convex_polygon([['0', '0'], ['2', '0'], ['1', '1/2'], ['2', '2'], ['0', '2']])
        for p in [[True, 0.], [float('nan'), 0.], ['1', '0'], [1., 2., 3.]]:
            with self.subTest(p=p), self.assertRaises(ValueError):
                self.index().reference('road', p)

    def test_file_hash_pin_checked_before_json_decode(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)/'proof.json'
            p.write_text('{"correct":true}')
            digest = hashlib.sha256(p.read_bytes()).hexdigest()
            self.assertTrue(M.read_bound_json(p, digest)['correct'])
            p.write_text('not the bound data')
            with self.assertRaisesRegex(ValueError, 'hash'):
                M.read_bound_json(p, digest)

    def test_file_loader_verifies_both_actual_source_files(self):
        historical, proof = self.fixture()
        with tempfile.TemporaryDirectory() as tmp:
            paths = {key: Path(tmp)/f'{key}.json' for key in
                     ['historical', 'geometry', 'source', 'proof']}
            raw = {'historical': json.dumps(historical).encode(),
                   'geometry': b'{"geometry":"original"}',
                   'source': b'{"source":"original"}'}
            hashes = {key: hashlib.sha256(value).hexdigest()
                      for key, value in raw.items()}
            for key, value in raw.items():
                paths[key].write_bytes(value)
                proof['inputs'][key]['sha256'] = hashes[key]
            proof['candidates'][0]['finiteCapStripFragments'][0][
                'exactFiniteReferenceGeometry']['exhaustiveOwnerFaceCensus'][
                'sourceHistoricalSHA256'] = hashes['historical']
            paths['proof'].write_text(json.dumps(proof))
            proof_hash = hashlib.sha256(paths['proof'].read_bytes()).hexdigest()
            def load():
                return M.FiniteHistoricalReferenceIndex.from_files(
                    paths['historical'], hashes['historical'],
                    [(paths['proof'], proof_hash)],
                    source_geometry_path=paths['geometry'],
                    source_reference_path=paths['source'],
                    source_geometry_sha256=hashes['geometry'],
                    source_reference_sha256=hashes['source'])
            self.assertEqual(len(load().reference('road', [1., 1.])['affineValues']), 2)
            for key in ['geometry', 'source']:
                with self.subTest(source_file=key):
                    paths[key].write_bytes(raw[key]+b' ')
                    with self.assertRaisesRegex(ValueError, 'hash'):
                        load()
                    paths[key].write_bytes(raw[key])
            self.assertIsNotNone(load().reference('road', [1., 1.]))

    def test_file_loader_requires_actual_source_paths(self):
        with self.assertRaises(TypeError):
            M.FiniteHistoricalReferenceIndex.from_files(
                'unused', 'unused', [], source_geometry_sha256='geometry',
                source_reference_sha256='source')


if __name__ == '__main__':
    unittest.main()
