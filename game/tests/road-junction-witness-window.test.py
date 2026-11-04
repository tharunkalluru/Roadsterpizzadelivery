"""Exercise the actual post-classification window loop on mixed real proof kinds."""
import ast
import copy
from pathlib import Path
from types import SimpleNamespace
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'scripts/solve-road-profiles.py'
TREE = ast.parse(SOURCE.read_text())
LOOP = next(node for node in TREE.body if isinstance(node, ast.For)
            and ast.unparse(node.target) == 'witness'
            and ast.unparse(node.iter) == "problem.get('junctionWitnesses', [])")


class JunctionWitnessWindows(unittest.TestCase):
    def run_loop(self, witnesses):
        problem = {'junctionWitnesses': witnesses, 'O': {'short-source-connector': 0},
                   'arcs': {'short-source-connector': [0., 8.]}}
        held = copy.deepcopy(problem)
        env = {'problem': problem, 'windows': {'unrelated': [((0., 2.), 'old-node')]},
               'args': SimpleNamespace(apron_window=30.)}
        exec(compile(ast.Module(body=[LOOP], type_ignores=[]), str(SOURCE), 'exec'), env)
        self.assertEqual(problem, held, 'A witness must never be rewritten to fit one consumer')
        return env['windows']

    def test_finite_polygon_and_ground_route_proofs_do_not_invent_connector_paths(self):
        witnesses = [
            {'proof': {'id': 'source-proved-lakdikapul-atgrade-crosslink',
                       'connector': 'full-source-connector', 'roads': ['a', 'b'],
                       'radius': 12., 'requiredLocalSourceLevel': 0}},
            {'proof': {'category': 'same-source-ground-route-finite-carriageways',
                       'sourceRoads': ['full-source-a', 'full-source-b'],
                       'sharedOSMRoutes': ['r3249370@248'], 'localTangentDot': .99,
                       'sourceStructureAnnotationsAbsentOnBothCompleteRows': True}},
        ]
        self.assertEqual(self.run_loop(witnesses), {'unrelated': [((0., 2.), 'old-node')]})

    def test_mixed_inventory_preserves_only_the_actual_short_source_path_windows(self):
        path = {'proof': {'category': 'localized-short-source-node-junction',
                          'nodes': ['first-full-node', 'second-full-node'],
                          'path': ['short-source-connector'], 'sourcePathMeters': 8.}}
        polygon = {'proof': {'id': 'explicit-finite-polygon', 'roads': ['a', 'b']}}
        result = self.run_loop([polygon, path, {'proof': {'path': []}}])
        self.assertEqual(result['short-source-connector'],
                         [((0., 8.), 'first-full-node'), ((0., 8.), 'second-full-node')])
        self.assertEqual(result['unrelated'], [((0., 2.), 'old-node')])

    def test_malformed_real_path_does_not_gain_a_default_node_or_height_authority(self):
        with self.assertRaises(KeyError):
            self.run_loop([{'proof': {'path': ['short-source-connector']}}])
        with self.assertRaises(TypeError):
            self.run_loop([{'proof': {'path': None}}])


if __name__ == '__main__':
    unittest.main()
