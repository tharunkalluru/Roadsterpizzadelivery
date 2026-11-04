"""Adversarial research-boundary tests; no producer I/O or runtime activation."""
import copy
import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    'negative_source_components', ROOT / 'scripts/qa/prepare-negative-source-components.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


def control(index, road='r'):
    return {'road': road, 'index': index,
            'requestedNegativeOnlyModeledBounds': [-3., 0.],
            'source': {'officialSourceFraction': index / 100.}}


def window(indices, road='r'):
    return {'road': road, 'controlIndices': indices,
            'controls': [control(k, road) for k in indices],
            'sourceFractionInterval': [min(indices) / 100., max(indices) / 100.],
            'sourceGeometryWKB_SHA256': 'held-source-hash',
            'inputRibbonSHA256': 'held-ribbon-hash'}


def boundary(index, road='r', genuine=None, policy=None, source=None):
    return {'road': road, 'index': index, 'genuineImmutableReasons': genuine or [],
            'separateExistingPolicyReasons': policy or [],
            'unresolvedSourceReasons': source or [],
            'reason': 'proposed-existing-modeled-boundary-after-finite-recovery-budget',
            'actualMatrixBound': [1.25, 1.25], 'point': [10., 20.]}


def proposal(components, groups):
    return {'components': [dict(node=node, finiteRecoveryWindows=[window(indices)],
                               genuineAndPolicyBoundaryControls=boundaries)
                           for node, indices, boundaries in components],
            'jointComponentGroups': [{'seedNodes': nodes} for nodes in groups],
            'method': {}, 'summary': {}}


class InactiveNegativeSourceComponentBoundaries(unittest.TestCase):
    def test_window_partition_never_fills_unselected_gaps(self):
        actual = M.split_window(window(list(range(29)) + [41, 42, 43, 44]))
        self.assertEqual([w['controlIndices'] for w in actual], [list(range(29)), [41, 42, 43, 44]])
        self.assertEqual([w['sourceFractionInterval'] for w in actual], [[0., .28], [.41, .44]])
        self.assertEqual([w['sourceGeometryWKB_SHA256'] for w in actual], ['held-source-hash'] * 2)
        self.assertTrue(all(not w['unselectedGapsFilled'] for w in actual))
        self.assertEqual([w['controlIndices'] for w in M.split_window(window([0, 3]))], [[0], [3]])

    def test_malformed_indices_or_control_mismatch_fail_closed(self):
        for indices in [[0, 0], [False, 1], [-1, 0], [0., 1], [0, '1']]:
            with self.subTest(indices=indices), self.assertRaises(ValueError):
                M.contiguous_runs(indices)
        w = window([0, 1]); w['controls'].pop()
        with self.assertRaises(ValueError): M.split_window(w)
        w = window([0, 1]); w['controls'][0]['source']['officialSourceFraction'] = float('nan')
        with self.assertRaises(ValueError): M.split_window(w)

    def test_frontier_selected_by_another_seed_is_removed_after_group_closure(self):
        d = proposal([('a', [0], [boundary(3)]), ('b', [3], [])], [['a', 'b']])
        old = M.control_domains(d); M.normalize_proposal(d)
        self.assertEqual(d['components'][0]['genuineAndPolicyBoundaryControls'], [])
        self.assertEqual(d['frontierNormalization']['selectedWithinMergedGroupRemovedCount'], 1)
        self.assertEqual(M.control_domains(d), old)

    def test_observation_from_another_group_is_not_removed(self):
        d = proposal([('a', [0], [boundary(3)]), ('b', [3], [])], [['a'], ['b']])
        M.normalize_proposal(d)
        c = d['components'][0]['genuineAndPolicyBoundaryControls'][0]
        self.assertEqual(c['boundaryClasses'], ['provisional-finite-budget-frontier'])
        self.assertFalse(c['fixedHeightConstraintInferredFromBudget'])
        self.assertTrue(c['requiresSeparateReviewBeforeUseAsFixedBoundary'])
        self.assertFalse(c['heightAuthorityGranted'])

    def test_duplicate_observations_merge_by_seed_road_index(self):
        first = boundary(2); first['directBlockingRows'] = [4]
        second = boundary(2); second['directBlockingRows'] = [7, 4]
        d = proposal([('a', [0], [first, second]), ('b', [0], [boundary(2)])], [['a', 'b']])
        M.normalize_proposal(d)
        rows = [c for p in d['components'] for c in p['genuineAndPolicyBoundaryControls']]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['observationCount'], 2)
        self.assertEqual(rows[0]['directBlockingRows'], [4, 7])
        self.assertEqual(d['frontierNormalization']['retainedProvisionalFrontierKeys'], 2)
        self.assertEqual(d['frontierNormalization']['retainedProvisionalPhysicalControls'], 1)

    def test_budget_hit_on_canonical_anchor_retains_exact_value_and_class(self):
        anchor = boundary(2, genuine=['actual-canonical-bound', 'actual-52-owner-minimum'])
        d = proposal([('a', [0], [anchor])], [['a']]); before = M.immutable_anchor_controls(d)
        M.normalize_proposal(d)
        self.assertEqual(M.immutable_anchor_controls(d), before)
        c = d['components'][0]['genuineAndPolicyBoundaryControls'][0]
        self.assertEqual(c['boundaryClasses'], ['immutable-modeled-clearance-anchor'])
        self.assertFalse(c['requiresSeparateReviewBeforeUseAsFixedBoundary'])
        self.assertEqual(c['actualMatrixBound'], [1.25, 1.25])

    def test_selected_immutable_policy_or_source_collision_is_an_error(self):
        cases = [boundary(3, genuine=['actual-canonical-bound']),
                 boundary(3, genuine=['active-source-relative-level']),
                 boundary(3, policy=['existing301-node-policy-control']),
                 boundary(3, source=['ambiguous-source-branch'])]
        for b in cases:
            with self.subTest(boundary=b), self.assertRaises(ValueError):
                M.normalize_proposal(proposal([('a', [0], [b]), ('b', [3], [])], [['a', 'b']]))

    def test_separate_policy_and_unresolved_source_labels_remain_separate(self):
        b = boundary(2, policy=['existing-Anand-comfort-policy-preserved'], source=['missing-source'])
        d = proposal([('a', [0], [b])], [['a']]); M.normalize_proposal(d)
        self.assertEqual(d['components'][0]['genuineAndPolicyBoundaryControls'][0]['boundaryClasses'],
                         ['separate-existing-policy', 'unresolved-source'])

    def test_incomplete_or_duplicate_group_membership_never_normalizes(self):
        for groups in [[['a']], [['a', 'b'], ['b']], [['a', 'missing']]]:
            with self.subTest(groups=groups), self.assertRaises(ValueError):
                M.normalize_proposal(proposal([('a', [0], []), ('b', [1], [])], groups))

    def test_per_seed_bounds_stay_separate_when_shared_control_bounds_differ(self):
        d = proposal([('a', [0], []), ('b', [0], [])], [['a', 'b']])
        d['components'][1]['finiteRecoveryWindows'][0]['controls'][0]['requestedNegativeOnlyModeledBounds'] = [-6.5, 0.]
        before = copy.deepcopy(M.control_domains(d)); M.normalize_proposal(d)
        self.assertEqual(M.control_domains(d), before)
        self.assertEqual(set(tuple(v) for v in M.control_domains(d).values()), {(-3., 0.), (-6.5, 0.)})


if __name__ == '__main__':
    unittest.main()
