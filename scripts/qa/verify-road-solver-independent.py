"""Small independent controls for the build-time road solver.

Loads exact function ASTs, never the full city constraint build. Synthetic
roads do not establish city geometry, vehicle or release acceptance.
"""
import argparse
import ast
import collections
import contextlib
import hashlib
import io
import itertools
import json
import math
import time
from pathlib import Path
import unittest

import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
parser.add_argument('--report', type=Path)
args = parser.parse_args()
source_path = args.repo / 'scripts/solve-road-profiles.py'
source_bytes = source_path.read_bytes()
source = source_bytes.decode()
tree = ast.parse(source)
fixtures_path = args.repo / 'tests/fixtures/solver-finite-source-components-independent.json'
fixtures_bytes = fixtures_path.read_bytes()
fixtures = json.loads(fixtures_bytes)['fixtures']
cell_fixtures_path = args.repo / 'tests/fixtures/solver-within-cell-fragments-independent.json'
cell_fixtures_bytes = cell_fixtures_path.read_bytes()
cell_fixtures = json.loads(cell_fixtures_bytes)['cells']


def namespace():
    env = dict(np=np, math=math, itertools=itertools, collections=collections, json=json, time=time,
               linprog=linprog, coo_matrix=coo_matrix)
    for node in tree.body:
        if isinstance(node, ast.FunctionDef):
            exec(compile(ast.Module(body=[node], type_ignores=[]), str(source_path), 'exec'), env)
    return env


def geometry(name):
    fixture = fixtures[name]
    env = namespace()
    env.update(roads={r['id']: r for r in fixture['roads']},
               qs={r['id']: r['quads'] for r in fixture['footprints']},
               fragmentPolygons={}, cellPolygons=collections.defaultdict(list),
               cellContactCache={}, cellConnectivityCache={}, ambiguousOverlapCells=set(), overlapMemo={}, sourceContinuationCache={},
               args=argparse.Namespace(minimum_polygon_area=1e-6))
    env['arcs'] = {i: env['arc'](e) for i, e in env['roads'].items()}
    env['level'] = lambda *_: 0
    grid = {}
    for ident, quads in env['qs'].items():
        local = {}
        for j, quad in enumerate(quads):
            for x in range(math.floor(min(p[0] for p in quad) / 40), math.floor(max(p[0] for p in quad) / 40) + 1):
                for z in range(math.floor(min(p[1] for p in quad) / 40), math.floor(max(p[1] for p in quad) / 40) + 1):
                    local.setdefault((x, z), []).append(j)
        grid[ident] = local
    env['qgrid'] = grid
    return env


A, B, C = '23427c8c-e37_0', 'bdf0bad3-182_0', 'constant-context'


def matrix_case(a_base=(0., 0.), a_bounds=None, b_base=(0., 0.), b_bounds=None, a_points=None, footprint_run=None):
    env = namespace()
    a_points = a_points or [[0., 0.], [10., 0.]]
    make = lambda ident, points, heights: dict(id=ident, pts=points, elev=list(heights),
                                             **{'from': ident + '-from', 'to': ident + '-to'})
    roads = {A: make(A, a_points, a_base), B: make(B, [[100., 0.], [110., 0.]], b_base),
             C: make(C, [[0., 0.], [10., 0.]], [3., 3.])}
    offsets = {A: 0, B: len(a_base)}
    footprints = {}
    for ident in [A, B]:
        points = roads[ident]['pts']
        if ident == A and footprint_run is not None:
            xs = np.linspace(0, footprint_run, len(points))
        else:
            xs = [p[0] for p in points]
        footprints[ident] = {'id': ident, 'L': [[float(x), 1.] for x in xs], 'R': [[float(x), -1.] for x in xs]}
    a_bounds = a_bounds or [(0., 10.)] * len(a_base)
    b_bounds = b_bounds or [(h, h) for h in b_base]
    env.update(varIds=[A, B], roads=roads, O=offsets, N=len(a_base) + len(b_base),
               base=np.array([*a_base, *b_base]), bounds=[*a_bounds, *b_bounds],
               arcs={i: env['arc'](r) for i, r in roads.items()}, footprints=footprints,
               stage={'geometryEdits': [A, B]}, variableNodeRows=[], protected=set(),
               underpassIds=set(), tileIds=set(), sourceDistanceAtControls={},
               args=argparse.Namespace(physical_max_grade=.0995, grade_change_per_metre=.00625, same_layer_tolerance=.008, time_limit=5.))
    return env


def prepare_expressions(env, heads=(), couplings=()):
    env['heads'], env['couplings'] = list(heads), list(couplings)
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ['head_expressions', 'coupling_expressions'] for t in node.targets):
            exec(compile(ast.Module(body=[node], type_ignores=[]), str(source_path), 'exec'), env)
        if isinstance(node, ast.For) and isinstance(node.iter, ast.Name) and node.iter.id in ['heads', 'couplings']:
            exec(compile(ast.Module(body=[node], type_ignores=[]), str(source_path), 'exec'), env)


def solve(env):
    with contextlib.redirect_stdout(io.StringIO()):
        return env['solve'](.1)


def post_rail_node_target(env):
    """Execute the exact fail-closed override block, without the city build."""
    candidates = [node for node in tree.body if isinstance(node, ast.For)
                  and isinstance(node.iter, ast.Name) and node.iter.id == 'varIds'
                  and 'Estimated node policy would undo a canonical/protected freeze:' in ast.unparse(node)]
    assert len(candidates) == 1
    exec(compile(ast.Module(body=candidates, type_ignores=[]), str(source_path), 'exec'), env)


def historical_case(pieces, target, legacy_reference):
    env = namespace()
    roads = {ident: dict(id=ident, pts=[[start, 0.], [end, 0.]], elev=[height, height],
                        **{'from': str(start), 'to': str(end)})
             for ident, start, end, height in pieces}
    prefix = target.rsplit('_', 1)[0]
    family = sorted(roads, key=lambda ident: int(ident.rsplit('_', 1)[1]))
    offsets, total = {}, 0.
    raw_arcs = {ident: env['arc'](road) for ident, road in roads.items()}
    source_id = 'review-full-source-uuid'
    geographic = {ident: {'id': ident, 'sourceSegmentID': source_id,
                         'legacyArc': [0., end - start], 'legacyOfficialMetres': [start, end],
                         'correctedArc': [0., 10.],
                         'correctedOfficialMetres': [start + (legacy_reference if ident == target else 0.),
                                                     start + (legacy_reference if ident == target else 0.) + 10.]}
                  for ident, start, end, height in pieces}
    for ident in family:
        offsets[ident] = total
        total += raw_arcs[ident][-1]
    env.update(srcS=lambda ident, distance: distance,
               sourceRepairs={target: {'correctedArc': [0., 10.], 'sourceArc': [legacy_reference, legacy_reference + 10.]}},
               allOld=roads, allSourceLegacy=roads, legacyRawArcs=raw_arcs,
               legacyFamilyPieces={prefix: family}, legacyFamilyOffsets=offsets,
               historicalPreparedArcs={}, historicalReferenceUnresolved={})
    env.update(geographicRecords=geographic, geographicFamilies={source_id: list(geographic.values())})
    return env


class SolverControls(unittest.TestCase):
    def test_shared_origin_re_crossing_is_not_one_component(self):
        env = geometry('disconnected')
        samples = env['overlap']('review-a_0', 'review-b_0')
        self.assertEqual({(i, j) for i, u, j, v, p in samples}, {(0, 0), (1, 1)})
        self.assertEqual(set(env['source_node_components']('review-a_0', 'review-b_0', samples)), {(0, 0)})

    def test_literal_contiguous_component_is_retained(self):
        env = geometry('connected')
        samples = env['overlap']('review-a_0', 'review-b_0')
        cells = {(i, j) for i, u, j, v, p in samples}
        self.assertEqual(set(env['source_node_components']('review-a_0', 'review-b_0', samples)), cells)
        self.assertEqual(len(cells), 4)

    def test_same_source_cut_cannot_seed_remote_re_crossing(self):
        env = geometry('continuation')
        samples = env['overlap']('review-a_1', 'review-b_0')
        self.assertTrue(samples)
        self.assertEqual(env['source_continuation_components']('review-a_1', 'review-b_0', samples), {})

    def test_shared_node_seed_must_contain_actual_node_point(self):
        env = geometry('connected')
        samples = env['overlap']('review-a_0', 'review-b_0')
        env['roads']['review-a_0']['pts'][0] = [-10., -10.]
        self.assertEqual(env['source_node_components']('review-a_0', 'review-b_0', samples), {})

    def test_remote_polygon_contact_is_not_same_source_cut_contact(self):
        env = geometry('continuation')
        one, two = ('a', 'b', 0, 0), ('c', 'd', 0, 0)
        remote = [[0., -1.], [1., -1.], [1., 1.], [0., 1.]]
        env['cellPolygons'][one] = [remote]
        env['cellPolygons'][two] = [remote]
        self.assertTrue(env['cells_contact'](one, two))
        self.assertFalse(env['cells_meet_at_source_cut'](one, two, 'review-a_0', 'cut'))
        local = [[9., -1.], [11., -1.], [11., 1.], [9., 1.]]
        env['cellPolygons'][one] = [local]
        env['cellPolygons'][two] = [local]
        self.assertTrue(env['cells_meet_at_source_cut'](one, two, 'review-a_0', 'cut'))

    def test_actual_disconnected_fragment_cells_are_fail_closed(self):
        for fixture in cell_fixtures:
            with self.subTest(cell=fixture['cell']):
                env = geometry('connected')
                key = tuple(fixture['cell'])
                env['cellPolygons'][key] = fixture['polygons']
                self.assertFalse(env['cell_is_connected'](key))
                self.assertIn(key, env['ambiguousOverlapCells'])
                self.assertFalse(env['cells_contact'](key, key))

    def test_shared_node_cannot_waive_disconnected_member_of_same_cell(self):
        env = geometry('connected')
        samples = env['overlap']('review-a_0', 'review-b_0')
        key = ('review-a_0', 'review-b_0', 0, 0)
        env['cellPolygons'][key].append([[50., 50.], [51., 50.], [51., 51.], [50., 51.]])
        self.assertNotIn((0, 0), env['source_node_components']('review-a_0', 'review-b_0', samples))

    def test_post_rail_target_cannot_override_any_protected_authority(self):
        for kind in ['canonical', 'protected', 'underpass', 'expressway', 'negative']:
            with self.subTest(kind=kind):
                env = matrix_case(a_base=(1., 1.))
                env.update(nodeTargets={A + '-from': {'target': .9}}, canonicalRailControls=set())
                if kind == 'canonical': env['canonicalRailControls'].add(0)
                if kind == 'protected': env['protected'].add(A)
                if kind == 'underpass': env['underpassIds'].add(A)
                if kind == 'expressway': env['roads'][A]['expressway'] = True
                if kind == 'negative': env['roads'][A]['elev'][1] = -.01
                with self.assertRaisesRegex(ValueError, 'canonical/protected freeze'):
                    post_rail_node_target(env)

    def test_permitted_node_target_only_changes_its_own_endpoint(self):
        env = matrix_case(a_base=(1., 1.))
        env.update(nodeTargets={A + '-from': {'target': .9}}, canonicalRailControls=set())
        before = list(env['bounds'])
        post_rail_node_target(env)
        self.assertEqual(env['bounds'][0], (.9, .9))
        self.assertEqual(env['bounds'][1:], before[1:])

    def test_historical_sibling_reference_cannot_cross_a_missing_piece(self):
        target = 'review-source_2'
        env = historical_case([('review-source_0', 0., 10., 11.), (target, 30., 40., 33.)], target, -5.)
        self.assertIsNone(env['oldAtArc'](target, 0.))

    def test_historical_sibling_reference_cannot_cross_a_geometric_gap(self):
        target = 'review-source_1'
        env = historical_case([('review-source_0', 0., 10., 11.), (target, 30., 40., 33.)], target, -5.)
        self.assertIsNone(env['oldAtArc'](target, 0.))

    def test_historical_sibling_reference_retains_matching_chain(self):
        target = 'review-source_1'
        env = historical_case([('review-source_0', 0., 10., 11.), (target, 10., 20., 33.)], target, -5.)
        self.assertEqual(env['oldAtArc'](target, 0.), 11.)

    def test_historical_sibling_reference_rejects_different_node_authority(self):
        target = 'review-source_1'
        env = historical_case([('review-source_0', 0., 10., 11.), (target, 10., 20., 33.)], target, -5.)
        env['allSourceLegacy'][target]['from'] = 'different-node'
        self.assertIsNone(env['oldAtArc'](target, 0.))

    def test_explicitly_unresolved_real_geographic_record_cannot_use_synthetic_fallback(self):
        target = 'review-source_0'
        env = historical_case([(target, 0., 10., 33.)], target, 0.)
        env['sourceGeometry'] = {'generationID': 'real-source-generation'}
        env['geographicReference'] = {'unresolved': [{'id': target, 'reason': 'Ambiguous geographic branch'}]}
        env['geographicRecords'].pop(target)
        self.assertIsNone(env['oldAtArc'](target, 5.))

    def test_new_envelope_order_uses_source_layer_not_fallback_height(self):
        # Exercise the extracted production decision. It was previously an
        # inline assignment; its move into a function must not turn this into
        # a check for one particular spelling of the implementation.
        decide = namespace()['independent_headroom_order']
        for old_gap, first_level, second_level, expected in [(-3., 1, 0, 1), (3., 0, 1, -1)]:
            with self.subTest(gap=old_gap):
                self.assertEqual(decide(False, old_gap, first_level, second_level),
                                 (expected, 5.85, 'new-envelope-headroom'))
        self.assertEqual(decide(True, 0., 1, 0), (1, 5.85, 'new-envelope-headroom'))
        self.assertEqual(decide(True, -4.2, 1, 0), (-1, 4.2, 'old-accepted-headroom'))

    def test_existing_eligible_road_range_growth_restarts_closure(self):
        branches = [node for node in tree.body if isinstance(node, ast.If)
                    and 'next_windows' in ast.unparse(node.test)
                    and 'componentWindows' in ast.unparse(node.test)]
        self.assertEqual(len(branches), 1)
        before = {'road-a': {'ranges': [[0., 10.]], 'reason': 'proved patch'}}
        grown = {'road-a': {'ranges': [[0., 10.], [98., 102.]], 'reason': 'proved patch'}}
        env = namespace()
        env.update(componentWindows={'roads': before}, next_windows=grown)
        condition = compile(ast.Expression(branches[0].test), str(source_path), 'eval')
        self.assertTrue(eval(condition, env))
        env['next_windows'] = before
        self.assertFalse(eval(condition, env))

    def test_free_upper_road_stays_above_constant_lower(self):
        env = matrix_case()
        env['roads'][C]['elev'] = [0., 0.]
        prepare_expressions(env, heads=[(A, 0, .5, C, 0, .5, 2., [5., 0.])])
        result = solve(env)
        self.assertTrue(result['success'])
        road = next(r for r in result['roadData'] if r['id'] == A)
        self.assertGreaterEqual(sum(road['elev']) / 2, 2. - 1e-8)
        self.assertAlmostEqual(sum(road['elev']), 4., places=7)

    def test_constant_upper_forces_free_lower_downward(self):
        env = matrix_case(a_base=(5., 5.))
        prepare_expressions(env, heads=[(C, 0, .5, A, 0, .5, 2., [5., 0.])])
        result = solve(env)
        self.assertTrue(result['success'])
        road = next(r for r in result['roadData'] if r['id'] == A)
        self.assertLessEqual(sum(road['elev']) / 2, 1. + 1e-8)

    def test_signed_coupling_offsets_preserve_constant_part(self):
        for offset in [2., -2.]:
            with self.subTest(offset=offset):
                env = matrix_case()
                prepare_expressions(env, couplings=[(A, 0, .5, C, 0, .5, [5., 0.], offset, .008)])
                result = solve(env)
                self.assertTrue(result['success'])
                road = next(r for r in result['roadData'] if r['id'] == A)
                self.assertLessEqual(abs(sum(road['elev']) / 2 - 3. - offset), .00800001)

    def test_true_triangle_slope_is_not_only_centreline_grade(self):
        env = matrix_case(a_base=(0., 1.), a_bounds=[(0., 0.), (0., 1.)], footprint_run=5.)
        prepare_expressions(env)
        result = solve(env)
        self.assertTrue(result['success'])
        road = next(r for r in result['roadData'] if r['id'] == A)
        self.assertAlmostEqual(road['elev'][1], .4975, places=8)

    def test_fixed_invalid_changed_triangle_is_rejected(self):
        env = matrix_case(a_base=(0., 1.), a_bounds=[(0., 0.), (1., 1.)], footprint_run=5.)
        prepare_expressions(env)
        result = solve(env)
        self.assertFalse(result['success'])
        self.assertTrue(any(r['constraint']['category'] == 'actual-triangle-grade' for r in result['directConflicts']))

    def test_spatial_grade_change_has_correct_distance_scaling(self):
        env = matrix_case(a_base=(0., 1., 0.), a_bounds=[(0., 0.), (0., 1.), (0., 0.)],
                          a_points=[[0., 0.], [5., 0.], [10., 0.]])
        prepare_expressions(env)
        result = solve(env)
        self.assertTrue(result['success'])
        road = next(r for r in result['roadData'] if r['id'] == A)
        self.assertAlmostEqual(road['elev'][1], .078125, places=8)

    def test_l1_objective_preserves_feasible_input(self):
        env = matrix_case(a_base=(1., 1.))
        prepare_expressions(env)
        result = solve(env)
        self.assertTrue(result['success'])
        road = next(r for r in result['roadData'] if r['id'] == A)
        self.assertEqual(road['elev'], [1., 1.])


suite = unittest.defaultTestLoader.loadTestsFromTestCase(SolverControls)
stream = io.StringIO()
result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
unchanged = source_path.read_bytes() == source_bytes and fixtures_path.read_bytes() == fixtures_bytes and cell_fixtures_path.read_bytes() == cell_fixtures_bytes
report = {'scope': 'Independent exact-function synthetic solver controls; not city or vehicle acceptance.',
          'solverSHA256': hashlib.sha256(source_bytes).hexdigest(),
          'fixtureSHA256': hashlib.sha256(fixtures_bytes).hexdigest(),
          'cellFixtureSHA256': hashlib.sha256(cell_fixtures_bytes).hexdigest(),
          'tests': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors),
          'sourceUnchanged': unchanged, 'detail': stream.getvalue()}
if args.report:
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with args.report.open('x') as output:
        json.dump(report, output, indent=2)
        output.write('\n')
print(json.dumps({k: v for k, v in report.items() if k != 'detail'}))
if not result.wasSuccessful():
    print(stream.getvalue())
raise SystemExit(0 if result.wasSuccessful() and unchanged else 1)
