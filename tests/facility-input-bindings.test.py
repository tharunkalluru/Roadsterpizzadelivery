"""Exercise fail-closed profile scope and context-only range inheritance."""
import copy
import importlib.util
from pathlib import Path
import unittest

FILE = Path(__file__).resolve().parents[1] / 'scripts/qa/prepare-road-facility-input-bindings.py'
SPEC = importlib.util.spec_from_file_location('facility_input_bindings', FILE)
HELPER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HELPER)


class FacilityInputBindings(unittest.TestCase):
    def fixture(self):
        ident, node = '1ef14a96-339_1', '48b1c891-59d'
        profile = {'id': ident, 'from': 'remote', 'to': node, 'w': 6., 'lanes': 1,
                   'pts': [[0., 0.], [10., 0.]], 'elev': [0., .21769017653861827]}
        footprint = {'id': ident, 'L': [[0., 3.], [10., 3.]], 'R': [[0., -3.], [10., -3.]]}
        promotion = {'necessaryDomain': {'nodes': [{'node': node, 'allArmSourceProofPresent': False,
                     'arms': [{'id': ident, 'end': -1, 'role': 'core', 'inputY': profile['elev'][-1]}]}]}}
        return promotion, {ident: profile}, {ident: footprint}

    def test_full_scoped_profile_and_incomplete_marker_are_preserved(self):
        promotion, roads, fp = self.fixture()
        nodes, profiles = HELPER.scoped_core_comparisons(promotion, roads, copy.deepcopy(roads), fp, copy.deepcopy(fp))
        self.assertFalse(nodes[0]['priorAllArmSourceProofPresent'])
        self.assertEqual(len(profiles), 1)
        self.assertEqual(profiles[0]['parentProfileSHA256'], profiles[0]['currentProfileSHA256'])

    def test_changed_interior_remote_control_width_or_footprint_rejects_rebind(self):
        for change in ['height', 'point', 'width', 'footprint']:
            promotion, roads, fp = self.fixture()
            current, current_fp = copy.deepcopy(roads), copy.deepcopy(fp)
            ident = next(iter(roads))
            if change == 'height':
                current[ident]['elev'][0] += .001
            elif change == 'point':
                current[ident]['pts'][0][0] += .001
            elif change == 'width':
                current[ident]['w'] += .001
            else:
                current_fp[ident]['L'][0][0] += .001
            with self.assertRaises(AssertionError):
                HELPER.scoped_core_comparisons(promotion, roads, current, fp, current_fp)

    def test_new_incident_core_arm_rejects_incomplete_scope(self):
        promotion, roads, fp = self.fixture()
        current = {**copy.deepcopy(roads), 'extra': {**copy.deepcopy(next(iter(roads.values()))), 'id': 'extra'}}
        with self.assertRaisesRegex(AssertionError, 'incidence'):
            HELPER.scoped_core_comparisons(promotion, roads, current, fp, fp)

    def test_height_change_can_retain_only_unchanged_planar_obstacle_ranges(self):
        _, roads, fp = self.fixture()
        ident = next(iter(roads))
        prior = {'roads': {ident: {'ranges': [[1., 4.]], 'reason': 'Physical context only'}}}
        current = copy.deepcopy(roads)
        current[ident]['elev'] = [-6.5, 0.]
        rows, comparisons = HELPER.preserve_context_ranges(prior, roads, current, fp, fp)
        self.assertEqual(rows, prior['roads'])
        self.assertTrue(comparisons[0]['heightProfileChangedWithoutPlanarAuthority'])
        self.assertEqual(current[ident]['elev'], [-6.5, 0.])

    def test_changed_planar_lineage_or_range_bounds_rejects_inheritance(self):
        _, roads, fp = self.fixture()
        ident = next(iter(roads))
        for mutate in ['point', 'range']:
            current = copy.deepcopy(roads)
            prior = {'roads': {ident: {'ranges': [[1., 4.]]}}}
            if mutate == 'point':
                current[ident]['pts'][0][0] += .01
            else:
                prior['roads'][ident]['ranges'][0][1] = 20.
            with self.assertRaises(AssertionError):
                HELPER.preserve_context_ranges(prior, roads, current, fp, fp)


if __name__ == '__main__':
    unittest.main()
