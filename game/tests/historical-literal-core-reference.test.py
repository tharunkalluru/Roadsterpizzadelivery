"""Exercise the solver's actual historical loader and sampler without its CLI."""
import ast
import collections
import copy
import math
from pathlib import Path
import unittest


SOURCE = Path(__file__).resolve().parents[1] / 'scripts/solve-road-profiles.py'
TREE = ast.parse(SOURCE.read_text())
FUNCTION_NAMES = {'historical_literal_reference_scope', 'historical_surface_key',
                  'historical_surface_bindings', 'bary', 'coeff', 'at'}
FUNCTIONS = [n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name in FUNCTION_NAMES]
assert {n.name for n in FUNCTIONS} == FUNCTION_NAMES
# Execute the actual production scope assignment, triangle ingestion and spatial
# indexing. Rebuilding those loops here would miss a correctly defined helper
# that the CLI never calls.
LOAD_BLOCK = next(n for n in TREE.body if isinstance(n, ast.If) and any(
    isinstance(s, ast.Assign) and any(isinstance(t, ast.Name) and
    t.id == 'historicalLiteralReferenceIds' for t in s.targets) for s in n.body))
LOAD_START = next(i for i, s in enumerate(LOAD_BLOCK.body) if isinstance(s, ast.Assign) and any(
    isinstance(t, ast.Name) and t.id == 'historicalLiteralReferenceIds' for t in s.targets))
LOAD_NODES = LOAD_BLOCK.body[LOAD_START:]


class HistoricalLiteralCoreReference(unittest.TestCase):
    def triangle(self, road, height=3., film=.12):
        return {'road': road, 'tile': 'literal-owner', 'cap': False,
                'points': [[0., height + film, 0.], [10., height + film, 0.],
                           [0., height + film, 10.]],
                'arc': [0., 10.], 'centre': [[0., 0.], [10., 0.]],
                'actualSurface': {'paintLift': film}}

    def fixture(self):
        ids = ['core', 'another-core', 'detailed', 'context', 'fixed', 'incidental']
        return {'includedCoreRoadIDs': ['core', 'another-core'],
                'roads': [{'id': ident, 'pts': [[0., 0.], [10., 0.]], 'elev': [9., 9.]}
                          for ident in ids],
                'physicalFootprints': [{'id': ident} for ident in ids],
                'triangles': [self.triangle(ident) for ident in ids]}

    def load(self, historical=None):
        historical = self.fixture() if historical is None else historical
        old = {r['id']: r for r in historical['roads']}
        scope = {'math': math, 'historicalTile': historical,
                 'tileIds': {'detailed'}, 'jointContextIds': {'context'}, 'fixedTileIds': {'fixed'},
                 'historicalActualTriangles': collections.defaultdict(list), 'historicalActualGrid': {},
                 'historicalReferenceUnresolved': {}, 'historicalOwnSeamBindings': {},
                 'historicalOwnSeamEnvelopes': {}, 'historicalMultiBindingReferences': {},
                 'oldRoads': old, 'oldGrid': {ident: {(0, 0): [0]} for ident in old},
                 'oqs': {ident: [[[-1., -1.], [11., -1.], [11., 11.], [-1., 11.]]]
                         for ident in old}, 'initialInputSHA': {'historical_cap_seam_proof': 'held-proof'}}
        exec(compile(ast.Module(body=FUNCTIONS + LOAD_NODES, type_ignores=[]), str(SOURCE), 'exec'), scope)
        return scope

    def proof(self, scope, triangle, *, node='source-node', film=None, branch=None):
        scope['historicalOwnSeamBindings'][scope['historical_surface_key'](triangle)] = [
            {'node': node, 'paintLift': triangle['actualSurface']['paintLift'] if film is None else film,
             'branches': [branch or {'arc': triangle['arc'], 'centre': triangle['centre']}]}]

    def test_every_declared_core_is_loaded_and_literal_heights_override_old_quads(self):
        historical = self.fixture()
        historical['triangles'][1] = self.triangle('another-core', -6.5, .1)
        held = copy.deepcopy(historical)
        scope = self.load(historical)
        self.assertEqual(set(scope['historicalActualGrid']),
                         {'core', 'another-core', 'detailed', 'context', 'fixed'})
        self.assertAlmostEqual(scope['at']('core', (2., 2.))['minimum'], 3.)
        self.assertAlmostEqual(scope['at']('another-core', (2., 2.))['minimum'], -6.5)
        # Incidental export content grants no new literal reference scope.
        self.assertEqual(scope['at']('incidental', (2., 2.))[0], 9.)
        self.assertEqual(historical, held)

    def test_all_emitted_triangles_and_duplicate_literal_films_are_retained(self):
        historical = self.fixture()
        triangle = historical['triangles'][0]
        triangle['actualSurfaceBindings'] = [triangle['actualSurface'], {'paintLift': .125}]
        second = self.triangle('core', 2.998, .12)
        second['cap'] = True
        historical['triangles'].append(second)
        scope = self.load(historical)
        reference = scope['at']('core', (2., 2.))
        self.assertEqual(len(scope['historicalActualTriangles']['core']), 2)
        self.assertEqual(len(reference['structuralValues']), 3)
        self.assertAlmostEqual(reference['minimum'], 2.995)
        self.assertAlmostEqual(reference['maximum'], 3.)
        self.assertEqual(scope['historicalMultiBindingReferences'][('core', 0)]['actualSurfaceBindings'],
                         triangle['actualSurfaceBindings'])

    def test_unbound_ambiguous_positive_and_negative_surfaces_never_use_old_fallback(self):
        for height in [3., -6.5]:
            with self.subTest(height=height):
                historical = self.fixture()
                historical['triangles'][0] = self.triangle('core', height, .1)
                historical['triangles'].append(self.triangle('core', height + .168, .1))
                scope = self.load(historical)
                self.assertIsNone(scope['at']('core', (2., 2.)))
                unresolved = scope['historicalReferenceUnresolved'][('core', 2., 2.)]
                self.assertEqual(len(unresolved['historicalActualHeights']), 2)
                self.assertFalse(scope['historicalOwnSeamEnvelopes'])

    def test_only_exact_common_source_seam_bindings_allow_a_support_envelope(self):
        historical = self.fixture()
        first = historical['triangles'][0]
        second = self.triangle('core', 3.168)
        second['cap'] = True
        historical['triangles'].append(second)
        for mismatch in [None, 'film', 'branch', 'node']:
            with self.subTest(mismatch=mismatch):
                scope = self.load(copy.deepcopy(historical))
                self.proof(scope, first)
                self.proof(scope, second,
                           film=.13 if mismatch == 'film' else None,
                           branch={'arc': [1., 11.], 'centre': second['centre']} if mismatch == 'branch' else None,
                           node='other-node' if mismatch == 'node' else 'source-node')
                reference = scope['at']('core', (2., 2.))
                if mismatch is None:
                    self.assertAlmostEqual(reference['minimum'], 3.)
                    self.assertAlmostEqual(reference['maximum'], 3.168)
                    self.assertEqual(reference['sourceNodes'], ['source-node'])
                    self.assertEqual(scope['historicalOwnSeamEnvelopes'][('core', 2., 2.)]
                                     ['sourceProofSHA256'], 'held-proof')
                else:
                    self.assertIsNone(reference)
                    self.assertTrue(scope['historicalReferenceUnresolved'])

    def test_outside_literal_coverage_never_fabricates_support_from_old_quad(self):
        scope = self.load()
        self.assertIsNone(scope['at']('core', (9., 9.)))
        self.assertEqual(scope['at']('incidental', (9., 9.))[0], 9.)

    def test_missing_core_inventory_or_emissions_and_duplicate_selectors_reject(self):
        for field in ['roads', 'physicalFootprints', 'triangles', 'includedCoreRoadIDs']:
            with self.subTest(field=field):
                historical = self.fixture()
                if field == 'includedCoreRoadIDs':
                    historical[field].append('core')
                else:
                    key = 'road' if field == 'triangles' else 'id'
                    historical[field] = [r for r in historical[field] if r[key] != 'another-core']
                with self.assertRaisesRegex(AssertionError, 'historical literal core|Historical literal core'):
                    self.load(historical)

    def test_existing_fixed_scope_does_not_require_new_literal_inventory(self):
        historical = self.fixture()
        historical['triangles'] = [t for t in historical['triangles'] if t['road'] != 'fixed']
        scope = self.load(historical)
        self.assertIn('fixed', scope['historicalLiteralReferenceIds'])
        self.assertNotIn('fixed', scope['historicalActualGrid'])
        self.assertEqual(scope['at']('fixed', (2., 2.))[0], 9.)

    def test_reference_without_a_core_selector_preserves_existing_literal_scope(self):
        historical = self.fixture()
        del historical['includedCoreRoadIDs']
        scope = self.load(historical)
        self.assertEqual(set(scope['historicalActualGrid']), {'detailed', 'context', 'fixed'})
        self.assertEqual(scope['at']('core', (2., 2.))[0], 9.)
        self.assertAlmostEqual(scope['at']('detailed', (2., 2.))['minimum'], 3.)


if __name__ == '__main__':
    unittest.main()
