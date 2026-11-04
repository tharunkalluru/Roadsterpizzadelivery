import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('qualifier', Path(__file__).with_name('qualify-joint-spread-xz.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def triangle(road, points, y=0):
    return {'road': road, 'segment': 0, 'points': [[x, y, z] for x, z in points], 'paintLift': 0, 'triangularPatch': False}


def rectangle(road, x0, z0, x1, z1, y=0):
    return [triangle(road, [(x0, z0), (x1, z0), (x1, z1)], y), triangle(road, [(x0, z0), (x1, z1), (x0, z1)], y)]


def query(records):
    return {'node': 'synthetic-negative', 'center': [0, 0], 'geographic': {}, 'fullConnectorAliases': [],
            'arms': [{'id': 'left', 'end': 'to', 'port': [-6, 0], 'declaredEndpointY': 0}, {'id': 'right', 'end': 'from', 'port': [6, 0], 'declaredEndpointY': 0}],
            'triangles': records, 'unresolved': []}


class FiniteXZControls(unittest.TestCase):
    def test_gap_is_not_filled_by_analytic_endpoint_capsules(self):
        q = query(rectangle('left', -10, -2, -.2, 2) + rectangle('right', .2, -2, 10, 2))
        result = module.qualify(q)
        self.assertEqual(result['classification'], 'actual-emitted-XZ-disconnected')
        self.assertGreater(result['literalRoadPairDistances'][0]['literalXZDistance'], .39)

    def test_only_a_literal_emitted_bridge_can_close_the_gap(self):
        q = query(rectangle('left', -10, -2, -.2, 2) + rectangle('right', .2, -2, 10, 2) + rectangle('left', -.2, -2, .2, 2))
        self.assertEqual(module.qualify(q)['classification'], 'actual-emitted-XZ-Roadster-width-connected')

    def test_point_connectivity_cannot_pass_a_sub_car_width_neck(self):
        q = query(rectangle('left', -10, -2, -1, 2) + rectangle('right', 1, -2, 10, 2) + rectangle('left', -1, -.3, 1, .3))
        result = module.qualify(q)
        self.assertIsNotNone(result['commonLiteralComponent'])
        self.assertEqual(result['classification'], 'actual-emitted-XZ-connected-but-width-unresolved')

    def test_projection_never_approves_3d_or_rewrites_distinct_heights(self):
        q = query(rectangle('left', -10, -2, 1, 2, 0) + rectangle('right', -1, -2, 10, 2, 6.8))
        before = repr(q)
        result = module.qualify(q)
        self.assertFalse(result['threeDAccepted'])
        self.assertEqual(result['actualSupportVertexYRange'], [0, 6.8])
        self.assertEqual(repr(q), before)

    def test_valid_lateral_entry_is_allowed_without_widening_finite_asphalt(self):
        q = query(rectangle('left', -10, -2, 1, 2) + rectangle('right', -1, -2, 10, 2))
        q['arms'][0]['port'] = [-6, 1.8]
        for arm in q['arms']:
            arm['portHeading'] = [1, 0]
            arm['portWidth'] = 4
        result = module.qualify(q)
        self.assertEqual(result['classification'], 'actual-emitted-XZ-Roadster-width-connected')
        self.assertGreater(result['portMemberships'][0]['distanceOutsideWidth'], .8)
        self.assertLess(abs(result['chosenWidthGatePoints'][0][1]), .9)


if __name__ == '__main__':
    unittest.main()
