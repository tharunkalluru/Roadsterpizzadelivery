"""Exercise literal preservation and fail-closed historical union provenance."""
import copy
import importlib.util
from pathlib import Path
import unittest


FILE = Path(__file__).resolve().parents[1] / 'scripts/merge-historical-road-coverage.py'
SPEC = importlib.util.spec_from_file_location('historical_coverage_union', FILE)
HELPER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HELPER)


class HistoricalCoverageUnion(unittest.TestCase):
    def fixture(self):
        roads = [{'id': ident, 'pts': [[0., 0.], [10., 0.]], 'elev': [0., 0.], 'w': 6.}
                 for ident in ['selected', 'core', 'incidental']]
        footprints = [{'id': r['id'], 'L': [[0., 3.], [10., 3.]], 'R': [[0., -3.], [10., -3.]]}
                      for r in roads]
        triangles = [{'road': r['id'], 'points': [[0., .1, -3.], [10., .1, -3.], [10., .1, 3.]],
                      'arc': [0., 10.], 'centre': r['pts'], 'tile': 'owner', 'cap': False,
                      'actualSurface': {'paintLift': .1, 'structuralQuad': [[0., 0., 0.]] * 4}}
                     for r in roads]
        hashes = HELPER.literal_javascript_hashes([value for r, f in zip(roads, footprints)
                                                  for value in [HELPER.physical(r), f]])
        copies = [{'id': r['id'], 'tile': 'owner', 'pack': 'packs/owner.pack.wasm', 'context': False,
                   'physicalSHA256': hashes[n * 2], 'footprintSHA256': hashes[n * 2 + 1],
                   'emittedSHA256': 'e' * 64, 'emittedTriangles': 1} for n, r in enumerate(roads)]
        base = {'revision': HELPER.REVISION, 'sourceCoreSHA256': 'c' * 64,
                'sourceFiles': {'src/world/city.ts': 'city'}, 'observer': {'sha256': 'observer'},
                'sourcePackSHA256': {'public/city/packs/owner.pack.wasm': 'owner'},
                'scannedSourceSHA256': {'public/city/packs/owner.pack.wasm': 'owner'},
                'roads': roads, 'physicalFootprints': footprints, 'triangles': triangles, 'copies': copies,
                'rawRequestedCopies': [], 'derivations': [], 'unmatched': [], 'outsideRegionUnmatched': [],
                'inputDisagreements': [], 'footprintVariants': [], 'includedCoreRoadIDs': ['core'],
                'inputs': {'export': 'parent'}, 'generatorSHA256': 'parent-generator',
                'metadataExport': {'literal': True}, 'coverageRegion': {'parent': True}, 'summary': {},
                'releaseApproved': False}
        joint = {'requestedRoadIDs': ['selected'], 'contextRoads': [], 'sourceCoreSHA256': 'c' * 64,
                 'sourceModelSHA256': 'm' * 64,
                 'inputs': {'physicalCoreCoverage': {'sha256': 'coverage'},
                            'physicalCoreFootprints': {'sha256': 'footprints'}}}
        coverage = {'version': 1, 'researchOnly': True, 'releaseApproved': False,
                    'sourceModelSHA256': 'm' * 64, 'sourceSelectedRoadIDs': ['selected'],
                    'sourceFootprints': {'sha256': 'footprints'}, 'roads': {'core': {}}}
        return base, copy.deepcopy(base), joint, coverage

    def merge(self, values):
        return HELPER.merge_coverage(*values, 'coverage', {'held-input': 'sha'}, 'union-generator')

    def alternate(self, export, ident, *, representative):
        footprint = copy.deepcopy(next(f for f in export['physicalFootprints'] if f['id'] == ident))
        footprint['R'][0][1] -= 1.
        road = next(r for r in export['roads'] if r['id'] == ident)
        physical_sha, footprint_sha = HELPER.literal_javascript_hashes([HELPER.physical(road), footprint])
        origin = {'id': ident, 'tile': 'context', 'pack': 'packs/context.pack.wasm', 'context': True}
        export['copies'].append({**origin, 'physicalSHA256': physical_sha,
                                 'footprintSHA256': footprint_sha, 'emittedSHA256': 'f' * 64,
                                 'emittedTriangles': 1})
        export['sourcePackSHA256']['public/city/packs/context.pack.wasm'] = 'context'
        export['scannedSourceSHA256']['public/city/packs/context.pack.wasm'] = 'context'
        if representative:
            index = next(n for n, f in enumerate(export['physicalFootprints']) if f['id'] == ident)
            export['physicalFootprints'][index] = footprint
        else:
            export['footprintVariants'].append({**origin, 'footprint': footprint})
        return footprint

    def test_incidental_alternate_preserves_parent_and_all_literal_binding_records(self):
        values = self.fixture()
        base, extra, _, _ = values
        self.alternate(base, 'incidental', representative=False)
        alternate = self.alternate(extra, 'incidental', representative=True)
        changed_binding = copy.deepcopy(extra['triangles'][0])
        changed_binding['actualSurfaceBindings'] = [changed_binding['actualSurface'],
                                                   {**changed_binding['actualSurface'], 'paintLift': .2}]
        extra['triangles'].append(changed_binding)
        before = copy.deepcopy(values)
        out = self.merge(values)
        self.assertEqual(values, before)
        self.assertEqual(out['triangles'][:len(base['triangles'])], base['triangles'])
        self.assertIn(changed_binding, out['triangles'])
        self.assertEqual(len(out['triangles']), 4)
        self.assertEqual(out['physicalFootprints'], base['physicalFootprints'])
        self.assertEqual(out['footprintVariants'][:len(base['footprintVariants'])], base['footprintVariants'])
        self.assertEqual(len(out['footprintVariants']), 1)  # Same literal alternate was already retained.
        self.assertEqual(out['footprintVariants'][0]['footprint'], alternate)
        self.assertFalse(out['releaseApproved'])
        self.assertFalse(out['historicalCoverageUnion']['footprintReview']['solverReferenceApproved'])

    def test_protected_representative_changes_reject_for_selected_context_and_core(self):
        for role in ['selected', 'context', 'core']:
            with self.subTest(role=role):
                values = self.fixture()
                ident = 'core' if role == 'core' else 'selected'
                if role == 'context':
                    values[2]['requestedRoadIDs'] = []
                    values[2]['contextRoads'] = [{'id': ident}]
                    values[3]['sourceSelectedRoadIDs'] = []
                self.alternate(values[1], ident, representative=True)
                with self.assertRaisesRegex(AssertionError, 'Protected historical footprint representative'):
                    self.merge(values)

    def test_new_incidental_representative_becomes_an_explicit_origin_bound_variant(self):
        values = self.fixture()
        alternate = self.alternate(values[1], 'incidental', representative=True)
        out = self.merge(values)
        self.assertEqual(out['physicalFootprints'], values[0]['physicalFootprints'])
        self.assertEqual(out['footprintVariants'], [{'id': 'incidental', 'tile': 'context',
                         'pack': 'packs/context.pack.wasm', 'context': True, 'footprint': alternate}])
        receipt = out['historicalCoverageUnion']
        self.assertEqual(receipt['alternateRepresentativeRoadIDs'], ['incidental'])
        self.assertTrue(receipt['allInputVariantOriginsVerified'])

    def test_missing_required_or_core_literal_emissions_rejects_inventory(self):
        for ident in ['selected', 'core']:
            with self.subTest(ident=ident):
                values = self.fixture()
                for export in values[:2]:
                    export['triangles'] = [t for t in export['triangles'] if t['road'] != ident]
                with self.assertRaisesRegex(AssertionError, 'no literal emitted triangles'):
                    self.merge(values)

    def test_retained_core_variants_are_blockers_without_any_acceptance(self):
        values = self.fixture()
        self.alternate(values[0], 'core', representative=False)
        self.alternate(values[1], 'core', representative=False)
        out = self.merge(values)
        review = out['historicalCoverageUnion']['footprintReview']
        self.assertEqual(out['footprintVariants'], values[0]['footprintVariants'])
        self.assertEqual(review['protectedVariantRoadIDs'], ['core'])
        self.assertEqual(review['status'], 'blocked')
        self.assertTrue(review['blockingReviewRequired'])
        self.assertTrue(review['blockers'][0]['includedCore'])
        self.assertFalse(review['solverReferenceApproved'])
        self.assertFalse(out['releaseApproved'])

    def test_missing_or_changed_original_copy_provenance_rejects_alternate(self):
        for mutation in ['copy', 'footprint-sha', 'physical-sha', 'emissions', 'pack']:
            with self.subTest(mutation=mutation):
                values = self.fixture()
                extra = values[1]
                self.alternate(extra, 'incidental', representative=True)
                origin = extra['copies'][-1]
                if mutation == 'copy':
                    extra['copies'].pop()
                elif mutation == 'footprint-sha':
                    origin['footprintSHA256'] = '0' * 64
                elif mutation == 'physical-sha':
                    origin['physicalSHA256'] = '0' * 64
                elif mutation == 'emissions':
                    origin['emittedTriangles'] = 0
                else:
                    del extra['sourcePackSHA256']['public/city/packs/context.pack.wasm']
                with self.assertRaises(AssertionError):
                    self.merge(values)

    def test_tampered_existing_variant_origin_rejects_instead_of_becoming_a_blocker(self):
        values = self.fixture()
        self.alternate(values[1], 'core', representative=False)
        values[1]['footprintVariants'][0]['tile'] = 'invented'
        with self.assertRaisesRegex(AssertionError, 'no exact original copy'):
            self.merge(values)

    def test_incomplete_or_unbound_core_coverage_rejects(self):
        for mutation in ['sha', 'model', 'selector', 'footprints']:
            with self.subTest(mutation=mutation):
                values = self.fixture()
                if mutation == 'sha':
                    values[2]['inputs']['physicalCoreCoverage']['sha256'] = 'wrong'
                elif mutation == 'model':
                    values[3]['sourceModelSHA256'] = 'wrong'
                elif mutation == 'selector':
                    values[3]['roads'] = {}
                else:
                    values[3]['sourceFootprints']['sha256'] = 'wrong'
                with self.assertRaises(AssertionError):
                    self.merge(values)

    def test_original_javascript_hash_spelling_is_used_for_floats(self):
        self.assertEqual(HELPER.literal_javascript_hashes([{'value': 0.}, {'value': 0}])[0],
                         HELPER.literal_javascript_hashes([{'value': 0}])[0])


if __name__ == '__main__':
    unittest.main()
