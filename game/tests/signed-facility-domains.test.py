"""Check authority boundaries in the inactive signed-domain producer."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('signed_domains', ROOT / 'scripts/qa/prepare-signed-facility-domains.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class SignedFacilityDomainBoundaries(unittest.TestCase):
    def fixture(self, heights):
        road = {'id': 'test_0', 'pts': [[float(k), 0.] for k in range(len(heights))], 'elev': heights}
        source = [{'sourceProjectionResidualM': .02, 'ambiguousSourceBranch': False,
                   'activeLevelRules': [], 'activeRoadFlags': []} for _ in heights]
        return road, {'elev': None}, source

    def test_rail_control_and_real_floor_stay_exact_inside_recovery(self):
        road, raw, source = self.fixture([0., -1., -3., -6.5, -6.5, -3., -1., 0.])
        fixed, domains = M.classify_controls(road, raw, {2: [{'rail': 'actual'}]}, source, True)
        self.assertIn('canonical-literal-rail-corridor', fixed[2])
        self.assertIn('actual-facility-floor', fixed[3])
        self.assertIn('actual-facility-floor', fixed[4])
        released = {k for d in domains for k in d['controlIndices']}
        self.assertEqual(released, {1, 5, 6})
        self.assertTrue(all(k not in released for k in [0, 2, 3, 4, 7]))

    def test_mixed_sign_road_never_gets_a_whole_mixed_envelope(self):
        road, raw, source = self.fixture([-4., -3., -2., -1., 0., 1., 6.8])
        fixed, domains = M.classify_controls(road, raw, {}, source, False)
        self.assertEqual({k for d in domains for k in d['controlIndices']}, {1, 2, 3})
        self.assertTrue(all(d['candidateHeightBounds'][1] <= 0 for d in domains))
        self.assertTrue(all(k in fixed for k in [0, 4, 5, 6]))
        raw['elev'] = [0., 0., 0., 1., 6.8, 6.8, 0.]
        fixed, domains = M.classify_controls(road, raw, {}, source, False)
        self.assertFalse(domains, 'Original packed positive facility must retain separate authority')

    def test_approach_minimum_is_not_misclassified_as_a_facility_floor(self):
        road, raw, source = self.fixture([-3., -4., -3., -2.])
        fixed, domains = M.classify_controls(road, raw, {}, source, False)
        self.assertNotIn(1, fixed)
        self.assertEqual(domains[0]['candidateHeightBounds'], [-4., -2.])
        self.assertEqual(domains[0]['fixedAnchorIndices'], [0, 3])

    def test_source_structure_is_local_and_ambiguous_projection_fails_closed(self):
        road, raw, source = self.fixture([0., -1., -2., -3., -2., -1., 0.])
        source[2]['activeRoadFlags'] = [{'values': ['is_bridge']}]
        source[4]['ambiguousSourceBranch'] = True
        source[5]['sourceProjectionResidualM'] = .100001
        fixed, domains = M.classify_controls(road, raw, {}, source, False)
        self.assertIn('active-source-structure-or-unclassified-flag', fixed[2])
        self.assertIn('ambiguous-source-branch', fixed[4])
        self.assertIn('source-projection-residual-over-10cm', fixed[5])
        self.assertEqual({k for d in domains for k in d['controlIndices']}, {1, 3})
        self.assertEqual(M.active([{'between': [0., .5], 'value': 1}], .8), [])

    def test_short_source_structure_between_coarse_controls_is_retained(self):
        road, raw, source = self.fixture([0., -1., -2., -3., 0.])
        # Neither control lies inside this short original-source bridge rule;
        # their interpolation interval still touches it and stays protected.
        rule = {'between': [.45, .55], 'values': ['is_bridge']}
        self.assertEqual(M.active([rule], .4), [])
        self.assertEqual(M.active([rule], .6), [])
        spanning = M.rules_over_interval([rule], .4, .6)
        source[1]['incidentSegmentRoadFlags'] = spanning
        source[2]['incidentSegmentRoadFlags'] = spanning
        fixed, domains = M.classify_controls(road, raw, {}, source, False)
        self.assertIn('active-source-structure-or-unclassified-flag', fixed[1])
        self.assertIn('active-source-structure-or-unclassified-flag', fixed[2])
        self.assertEqual({k for d in domains for k in d['controlIndices']}, {3})

    def test_exact_solver_rail_functions_reject_diagonal_aabb_false_contact(self):
        distance = M.load_rail_functions((ROOT / 'scripts/solve-road-profiles.py').read_bytes())
        # The track's enormous AABB contains this road, but the finite diagonal
        # is hundreds of metres away. It must not become a frozen control.
        road = {'pts': [[0., 50.], [2., 50.]]}
        fp = {'L': [[0., 49.], [2., 49.]], 'R': [[0., 51.], [2., 51.]]}
        diagonal = {'id': 'diag', 'pts': [[-100., -100.], [100., 100.]], 'elev': [0., 0.], 'bridge': False}
        self.assertEqual(M.rail_contacts(road, fp, [diagonal], distance), {})
        crossing = {'id': 'crossing', 'pts': [[1., 40.], [1., 60.]], 'elev': [0., 0.], 'bridge': False}
        self.assertEqual(set(M.rail_contacts(road, fp, [crossing], distance)), {0, 1})

    def test_full_source_projection_exposes_distinct_branch_ambiguity(self):
        evidence = M.project_fraction([.5, 0.], [[0., 0.], [1., 0.], [1., .1], [0., .1]], [0., 1., 1.1, 2.1])
        self.assertTrue(evidence['ambiguousSourceBranch'])
        self.assertLessEqual(evidence['sourceProjectionResidualM'], .1)


if __name__ == '__main__':
    unittest.main()
