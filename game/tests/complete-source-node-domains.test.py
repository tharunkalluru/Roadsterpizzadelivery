"""Adversarial boundaries for inactive all-arm node-domain research evidence."""
import copy
import importlib.util
import math
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    'complete_source_node_domains', ROOT / 'scripts/qa/prepare-complete-source-node-domains.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class CompleteSourceNodeDomainBoundaries(unittest.TestCase):
    def row(self):
        return {'id': '12345678-1234-4234-8234-123456789abc', 'connectors': [
            {'connector_id': 'abcdef12-1234-4234-8234-123456789abc', 'at': .25}]}

    def ribbon(self, xs):
        points = [[float(x), 0.] for x in xs]
        return points, {'L': [[float(x), -2.] for x in xs],
                        'R': [[float(x), 2.] for x in xs]}

    def request(self, points, footprint, source, start=0, low=-6.5,
                controls=None, segments=None, grade=.075, triangle=.0995, curvature=.00625):
        return M.graded_zero_request(points, footprint, source, start, low,
                                     controls or {}, segments or {}, grade, triangle, curvature)

    def test_all_arm_envelopes_are_intersected_and_empty_intersections_block(self):
        self.assertEqual(M.intersect_envelopes([[-6., -1.], [-4., 0.]]), [-4., -1.])
        self.assertIsNone(M.intersect_envelopes([[-6., -5.], [-4., 0.]]))
        self.assertEqual(M.intersect_envelopes([[-6., 0.], [0., 0.]]), [0., 0.])
        self.assertIsNone(M.intersect_envelopes([]))

    def test_nonfinite_or_reversed_input_envelopes_never_become_domains(self):
        for envelopes in [[[-math.inf, math.inf]], [[math.nan, 1.]],
                          [[0., math.nan]], [[2., 1.], [0., 3.]]]:
            with self.subTest(envelopes=envelopes):
                self.assertIsNone(M.intersect_envelopes(envelopes))

    def test_connector_requires_one_actual_normalized_full_uuid(self):
        row = self.row()
        expected = row['connectors'][0]
        self.assertEqual(M.connector(row, 'abcdef12-123'), expected)
        self.assertIsNone(M.connector(row, 'abcdef12-124'))
        duplicate = copy.deepcopy(row)
        duplicate['connectors'].append(copy.deepcopy(expected))
        self.assertIsNone(M.connector(duplicate, 'abcdef12-123'))
        alias_collision = copy.deepcopy(row)
        alias_collision['connectors'].append({
            'connector_id': 'abcdef12-1235-4234-8234-123456789abc', 'at': .75})
        self.assertIsNone(M.connector(alias_collision, 'abcdef12-123'))

    def test_malformed_uuid_and_invalid_fraction_fail_closed(self):
        cases = []
        for ident in ['not-a-uuid', '12345678-1234', None]:
            row = self.row(); row['id'] = ident; cases.append(row)
        for ident in ['abcdef12-123', 'abcdef12-1234-not-a-uuid']:
            row = self.row(); row['connectors'][0]['connector_id'] = ident; cases.append(row)
        for fraction in [math.nan, math.inf, -.01, 1.01]:
            row = self.row(); row['connectors'][0]['at'] = fraction; cases.append(row)
        for row in cases:
            with self.subTest(row=row):
                self.assertIsNone(M.connector(row, 'abcdef12-123'))

    def test_every_control_on_a_real_floor_plateau_stays_protected(self):
        heights = [0., -2., -6.5, -6.5, -6.5 + 5e-10, -3., 0.]
        floors = M.floor_indices(heights)
        self.assertEqual(floors, {2, 3, 4})
        window, reasons = M.local_run(heights, 0, -1,
                                     {k: ['actual-52-owner-minimum-control'] for k in floors}, {})
        self.assertFalse(reasons)
        self.assertEqual(window['controlIndices'], [0, 1])
        self.assertEqual(window['fixedAnchorIndex'], 2)
        self.assertFalse(floors & set(window['controlIndices']))

    def test_short_structure_between_controls_cannot_be_crossed(self):
        heights = [-3., -2., -1., 0.]
        window, reasons = M.local_run(heights, 0, -1, {},
                                     {1: ['active-source-relative-level']})
        self.assertFalse(reasons)
        self.assertEqual(window['controlIndices'], [0])
        self.assertEqual(window['fixedAnchorIndex'], 1)
        self.assertIn('before-protected-source-segment', window['fixedAnchorReasons'])
        blocked, reasons = M.local_run(heights, 0, -1, {},
                                      {0: ['active-source-structure-or-unclassified-flag']})
        self.assertIsNone(blocked)
        self.assertIn('before-protected-source-segment', reasons)

    def test_canonical_anchor_is_not_released_or_replaced_by_base_height(self):
        heights = [3., 2., 1., 0.]
        actual_bounds = [(3., 3.), (2., 2.), (1.25, 1.25), (0., 0.)]
        held_heights, held_bounds = copy.deepcopy(heights), copy.deepcopy(actual_bounds)
        window, reasons = M.local_run(heights, 0, 1,
                                     {2: ['actual-canonical-matrix-control']}, {})
        self.assertFalse(reasons)
        self.assertEqual(window['fixedAnchorIndex'], 2)
        self.assertNotIn(2, window['controlIndices'])
        self.assertEqual(actual_bounds[window['fixedAnchorIndex']], (1.25, 1.25))
        self.assertEqual(heights, held_heights)
        self.assertEqual(actual_bounds, held_bounds)

    def test_both_directions_stop_before_opposite_sign_or_at_zero(self):
        window, reasons = M.local_run([-4., -3., -2., 1., 2.], 0, -1, {}, {})
        self.assertFalse(reasons)
        self.assertEqual(window['allWindowIndices'], [0, 1, 2])
        self.assertIn('before-opposite-sign-control', window['fixedAnchorReasons'])
        reverse, reasons = M.local_run([2., 1., -2., -3., -4.], 4, -1, {}, {})
        self.assertFalse(reasons)
        self.assertEqual(reverse['allWindowIndices'], [4, 3, 2])
        zero, _ = M.local_run([-4., -2., 0., 3.], 0, -1, {}, {})
        self.assertEqual(zero['fixedAnchorIndex'], 2)
        self.assertNotIn(3, zero['allWindowIndices'])

    def test_local_run_rejects_wrong_sign_endpoint_and_invalid_finite_inputs(self):
        for heights, start, sign in [([1., 0., -1.], 0, -1),
                                     ([-1., 0., 1.], 2, -1)]:
            with self.subTest(heights=heights, start=start, sign=sign):
                window, reasons = M.local_run(heights, start, sign, {}, {})
                self.assertIsNone(window)
                self.assertIn('opposite-sign-node-endpoint', reasons)
        for heights, start, sign in [([0., 0., 0.], 1, -1),
                                     ([0., math.nan, 0.], 0, -1),
                                     ([0., 0.], 0, 0)]:
            with self.subTest(heights=heights, start=start, sign=sign):
                window, reasons = M.local_run(heights, start, sign, {}, {})
                self.assertIsNone(window)
                self.assertIn('invalid-finite-local-run-input', reasons)

    def test_opposite_windows_block_mutable_to_anchor_collisions_in_both_directions(self):
        left = {'controlIndices': [0, 1], 'fixedAnchorIndex': 2,
                'allWindowIndices': [0, 1, 2], 'fixedAnchorActualBound': [0., 0.]}
        right = {'controlIndices': [3, 2], 'fixedAnchorIndex': 1,
                 'allWindowIndices': [3, 2, 1], 'fixedAnchorActualBound': [0., 0.]}
        self.assertFalse(set(left['controlIndices']) & set(right['controlIndices']))
        self.assertEqual(M.window_collision(left, right), [1, 2])
        self.assertEqual(M.window_collision(right, left), [1, 2])

    def test_only_an_identical_exact_fixed_anchor_may_be_shared(self):
        left = {'controlIndices': [0, 1], 'fixedAnchorIndex': 2,
                'allWindowIndices': [0, 1, 2], 'fixedAnchorActualBound': [0., 0.]}
        right = {'controlIndices': [4, 3], 'fixedAnchorIndex': 2,
                 'allWindowIndices': [4, 3, 2], 'fixedAnchorActualBound': [0., 0.]}
        self.assertEqual(M.window_collision(left, right), [])
        conflicting = copy.deepcopy(right)
        conflicting['fixedAnchorActualBound'] = [1., 1.]
        self.assertEqual(M.window_collision(left, conflicting), [2])
        unfixed = copy.deepcopy(right)
        unfixed['fixedAnchorActualBound'] = [0., 1.]
        self.assertEqual(M.window_collision(left, unfixed), [2])
        missing = copy.deepcopy(right)
        del missing['fixedAnchorActualBound']
        self.assertEqual(M.window_collision(left, missing), [2])

    def test_zero_request_has_a_finite_zero_anchor_and_retains_original_envelope(self):
        points, footprint = self.ribbon([0., 20., 40., 60.])
        extension = self.request(points, footprint, [0., 20., 40., 60.],
                                 controls={2: ['actual-canonical-matrix-control']})
        self.assertIsNotNone(extension)
        self.assertEqual(extension['allWindowIndices'], [0, 1, 2])
        self.assertEqual(extension['controlIndices'], [0, 1])
        self.assertEqual(extension['fixedAnchorIndex'], 2)
        self.assertEqual(extension['fixedAnchorHeight'], 0.)
        self.assertEqual(extension['affineControls'][-1]['nodeHeightCoefficient'], 0.)
        self.assertEqual(extension['affineControls'][0]['nodeHeightCoefficient'], 1.)
        self.assertEqual(extension['originalArmEnvelope'], [0., 0.])
        self.assertFalse(extension['newNegativePermissionGranted'])
        self.assertTrue(extension['parameterOnly'])
        self.assertGreater(extension['requiredSourceRecoveryMetresForFullComponentDepth'],
                           extension['actualSourceRecoveryMetres'])
        self.assertGreaterEqual(extension['requestedHeightBounds'][0], -3. - 1e-12)
        self.assertEqual(extension['requestedHeightBounds'][1], 0.)

    def test_zero_request_blocks_source_barrier_nonmonotone_or_degenerate_recovery(self):
        points, footprint = self.ribbon([0., 10., 20., 30.])
        self.assertIsNone(self.request(points, footprint, [0., 10., 20., 30.],
                                       segments={0: ['protected-source-interval']}))
        self.assertIsNone(self.request(points, footprint, [0., 10., 20., 30.],
                                       controls={0: ['fixed-context']}))
        self.assertIsNone(self.request(points, footprint, [0., 10., 5., 30.]))
        self.assertIsNone(self.request(points, footprint, [0., 0., 0., 0.]))

    def test_zero_request_rejects_nonfinite_or_wrong_sign_parameter_ranges(self):
        points, footprint = self.ribbon([0., 10., 20.])
        for low in [math.nan, -math.inf, 0., 1.]:
            with self.subTest(low=low):
                self.assertIsNone(self.request(points, footprint, [0., 10., 20.], low=low))
        for limit in [0., -1., math.nan, math.inf]:
            with self.subTest(limit=limit):
                self.assertIsNone(self.request(points, footprint, [0., 10., 20.], grade=limit))
        self.assertIsNone(self.request(points, footprint, [0., math.nan, 20.]))

    def test_zero_request_rejects_nonfinite_or_malformed_literal_geometry(self):
        points, footprint = self.ribbon([0., 10., 20.])
        for value in [math.nan, math.inf, -math.inf]:
            with self.subTest(value=value):
                broken_points = copy.deepcopy(points)
                broken_points[1][0] = value
                self.assertIsNone(self.request(broken_points, footprint, [0., 10., 20.]))
                for side in ['L', 'R']:
                    broken_ribbon = copy.deepcopy(footprint)
                    broken_ribbon[side][1][1] = value
                    self.assertIsNone(self.request(points, broken_ribbon, [0., 10., 20.]))
        missing_side = copy.deepcopy(footprint)
        del missing_side['L']
        self.assertIsNone(self.request(points, missing_side, [0., 10., 20.]))
        short_side = copy.deepcopy(footprint)
        short_side['R'].pop()
        self.assertIsNone(self.request(points, short_side, [0., 10., 20.]))

    def test_affine_range_obeys_actual_literal_triangle_grade_in_both_directions(self):
        points = [[.5, 0.], [9., 1.]]
        footprint = {'L': [[0., -2.], [10., -1.]], 'R': [[1., 2.], [8., 3.]]}
        # Solve each literal triangle's plane independently, rather than using
        # the producer's perpendicular-distance calculation.
        def plane_grade(points, heights):
            a, b, c = points
            dx1, dz1 = b[0]-a[0], b[1]-a[1]
            dx2, dz2 = c[0]-a[0], c[1]-a[1]
            dy1, dy2 = heights[1]-heights[0], heights[2]-heights[0]
            determinant = dx1*dz2-dx2*dz1
            gx = (dy1*dz2-dy2*dz1)/determinant
            gz = (dx1*dy2-dx2*dy1)/determinant
            return math.hypot(gx, gz)
        unit_grade = max(
            plane_grade([footprint['R'][0], footprint['R'][1], footprint['L'][1]], [1., 0., 0.]),
            plane_grade([footprint['L'][1], footprint['R'][0], footprint['L'][0]], [0., 1., 1.]))
        expected_cap = .0995/unit_grade
        for start in [0, 1]:
            with self.subTest(start=start):
                result = self.request(points, footprint, [0., 10.], start=start,
                                      low=-10., grade=100., curvature=100.)
                self.assertIsNotNone(result)
                cap = -result['requestedHeightBounds'][0]
                self.assertAlmostEqual(cap, expected_cap, places=10)
                self.assertLessEqual(cap*unit_grade, .0995 + 1e-12)

    def test_curvature_cap_limits_emitted_affine_array_in_model_metres(self):
        points, footprint = self.ribbon([0., 10., 20., 30.])
        result = self.request(points, footprint, [0., 10., 20., 30.], low=-20.,
                              grade=100., triangle=100., curvature=.0001)
        self.assertIsNotNone(result)
        low = result['requestedHeightBounds'][0]
        heights = [row['nodeHeightCoefficient']*low for row in result['affineControls']]
        for index in range(1, len(heights)-1):
            left_grade = (heights[index]-heights[index-1])/10.
            right_grade = (heights[index+1]-heights[index])/10.
            self.assertLessEqual(abs(right_grade-left_grade)/10., .0001 + 1e-12)

    def test_curvature_at_fixed_zero_anchor_includes_unchanged_outside_segment(self):
        points, footprint = self.ribbon([0., 10., 20., 30., 40.])
        result = self.request(points, footprint, [0., 10., 20., 30., 40.], low=-20.,
                              controls={2: ['fixed-zero-anchor']},
                              grade=100., triangle=100., curvature=.0001)
        self.assertIsNotNone(result)
        self.assertEqual(result['fixedAnchorIndex'], 2)
        low = result['requestedHeightBounds'][0]
        heights = [row['nodeHeightCoefficient']*low for row in result['affineControls']] + [0.]
        left_grade = (heights[-2]-heights[-3])/10.
        right_grade = (heights[-1]-heights[-2])/10.
        self.assertLessEqual(abs(right_grade-left_grade)/10., .0001 + 1e-12)
        self.assertLessEqual(abs(low), .02 + 1e-12)


if __name__ == '__main__':
    unittest.main()
