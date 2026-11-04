"""Run the actual offline decision without importing its full-city CLI."""
import ast
import json
from types import SimpleNamespace
from pathlib import Path
import unittest
import copy
import math

source = Path(__file__).resolve().parents[1] / 'scripts/solve-road-profiles.py'
tree = ast.parse(source.read_text())
functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ['independent_headroom_order', 'source_ground_carriageway_proof', 'merged_arc_ranges', 'merge_retained_road_source', 'level', 'complete_core_context_sets', 'reconciled_node_bounds']]
scope = {}
exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), scope)
order = scope['independent_headroom_order']
merge = scope['merged_arc_ranges']
merge_source = scope['merge_retained_road_source']

class HeadroomOrder(unittest.TestCase):
    def test_actual_parallel_ground_route_fragments_do_not_become_tiny_overpasses(self):
        fixture=json.loads((source.parents[1]/'tests/fixtures/source-ground-carriageways-9413.json').read_text())
        records={r['id'][:12]:r for r in json.loads((source.parents[1]/fixture['sourceReference']).read_text())['rows']}
        prove=scope['source_ground_carriageway_proof']
        for case in fixture['cases']:
            first,second=case['roads'];i,j=case['actualFiniteConstraint']['segments']
            da=[first['pts'][i+1][k]-first['pts'][i][k] for k in [0,1]]
            db=[second['pts'][j+1][k]-second['pts'][j][k] for k in [0,1]]
            dot=abs(sum(a*b for a,b in zip(da,db)))/(math.hypot(*da)*math.hypot(*db))
            aa,bb=[records[r['id'][:12]]for r in [first,second]]
            result=prove(first,second,aa,bb,dot)
            self.assertEqual(result['sourceRoads'],[aa['id'],bb['id']])
            self.assertTrue(result['sharedOSMRoutes'])
            for changed in [dict(bb,road_flags=[{'values':['is_bridge']}]),dict(bb,level_rules=[{'value':1}]),dict(bb,sources=[]),dict(bb,id='unbound')]:
                self.assertIsNone(prove(first,second,aa,changed,dot))
            self.assertIsNone(prove(first,second,aa,None,dot))
            self.assertIsNone(prove(first,second,aa,bb,.9))
            self.assertIsNone(prove(dict(first,elevationSource='surveyed'),second,aa,bb,dot))
            missing=copy.deepcopy(bb);del missing['road_flags']
            self.assertIsNone(prove(first,second,aa,missing,dot))

    def test_canonical_rail_node_anchors_other_arms_without_becoming_free(self):
        reconcile = scope['reconciled_node_bounds']
        self.assertEqual(reconcile((6.8, 6.8), (0., 6.8), True), (6.8, 6.8))
        self.assertEqual(reconcile((0., 0.), (0., 6.8), False), (0., 6.8))
        for prior, requested in [((6.8, 6.8), (0., 5.)), ((0., 6.8), (0., 6.8))]:
            with self.assertRaises(AssertionError):
                reconcile(prior, requested, True)

    def test_complete_context_prepares_every_generated_candidate_without_height_authority(self):
        roads = [{'id': 'eligible', 'elev': [0., 6.8]}, {'id': 'flat', 'elev': None},
                 {'id': 'mapped', 'elev': [0., 6.8]}, {'id': 'negative', 'elev': [-6.5, 0.]},
                 {'id': 'underpass', 'elev': [0., 2.]}, {'id': 'express', 'elev': [0., 13.], 'expressway': True},
                 {'id': 'survey', 'elev': [0., 3.], 'elevationSource': 'surveyed'}]
        coverage = {'version': 1, 'sourceModelSHA256': 'model', 'sourceFootprints': {'sha256': 'fp'},
                    'roads': ['eligible', 'flat'], 'completePotentiallyGrowableCoreIDs': ['eligible']}
        args = (roads, {'mapped'}, {'underpass'}, {'flat'}, 'model', 'fp', 'bound-joint')
        context, fixed, growable = scope['complete_core_context_sets'](coverage, *args)
        self.assertEqual(context, {'eligible', 'flat'})
        self.assertEqual(fixed, {'eligible'})
        self.assertEqual(growable, {'eligible'})
        for broken in [dict(coverage, completePotentiallyGrowableCoreIDs=[]),
                       dict(coverage, completePotentiallyGrowableCoreIDs=['eligible', 'eligible']),
                       dict(coverage, roads=['flat']), dict(coverage, sourceModelSHA256='stale')]:
            with self.assertRaises(AssertionError):
                scope['complete_core_context_sets'](broken, *args)

    def test_mapped_bridge_over_zero_placeholder_receives_real_clearance(self):
        for covered in [False, True]:
            for gap in [0., .009, -.009]:
                self.assertEqual(order(covered, gap, 1, 0), (1, 5.85, 'new-envelope-headroom'))
                self.assertEqual(order(covered, -gap, 0, 1), (-1, 5.85, 'new-envelope-headroom'))

    def test_ground_over_known_underpass_and_multilevel_crossing(self):
        self.assertEqual(order(True, 0., 0, -1), (1, 5.85, 'new-envelope-headroom'))
        self.assertEqual(order(True, 0., -1, 0), (-1, 5.85, 'new-envelope-headroom'))
        self.assertEqual(order(False, 0., 2, 1), (1, 5.85, 'new-envelope-headroom'))

    def test_real_old_clearance_and_order_are_retained(self):
        for gap in [4.179468328356743, 5.195500, 6.8]:
            self.assertEqual(order(True, gap, 0, 0), (1, min(gap, 5.85), 'old-accepted-headroom'))
            self.assertEqual(order(True, -gap, 0, 0), (-1, min(gap, 5.85), 'old-accepted-headroom'))

    def test_flat_source_level_agreement_does_not_invent_a_bridge(self):
        for covered in [False, True]:
            for level in [-1, 0, 1]:
                self.assertIsNone(order(covered, 0., level, level))

    def test_repeated_interval_authority_does_not_restart_the_solver(self):
        policy = json.loads((source.parents[1] / 'docs/qa/evidence/reported-roads/source-connected-positive-facilities-9413.json').read_text())
        for road in policy['roads']:
            original = road['modelArcWindows']
            canonical = merge(original)
            self.assertEqual(merge(canonical + original), canonical, road['id'])
            self.assertEqual(merge(original + original + original), canonical, road['id'])
            self.assertEqual(original, road['modelArcWindows'])

    def test_interval_union_preserves_real_gaps_and_does_not_mutate_inputs(self):
        original = [[9., 10.], [1., 3.], [2., 4.], [1., 3.], [4., 5.]]
        held = [list(span) for span in original]
        self.assertEqual(merge(original), [[1., 5.], [9., 10.]])
        self.assertEqual(original, held)

    def test_source_completion_keeps_original_full_rows_and_adds_missing_levels(self):
        first = {'id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'geometryWKB': '01', 'connectors': [], 'level_rules': [], 'road_flags': None, 'retainedExtra': 'keep'}
        second = {'id': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'geometryWKB': '02', 'connectors': [], 'level_rules': [{'value': 2}], 'road_flags': None}
        original = {first['id'][:12]: first}; layers = {first['id'][:12]: []}
        ref = {'release': '2026-10-21.0', 'complete': True, 'missingPrefixes': [], 'requestedPrefixes': [first['id'][:12], second['id'][:12]], 'rows': [{k: v for k, v in first.items() if k != 'retainedExtra'}, second]}
        self.assertEqual(merge_source(original, layers, ref), [second['id'][:12]])
        self.assertIs(original[first['id'][:12]], first)
        self.assertEqual(layers[second['id'][:12]], [{'value': 2}])
        self.assertEqual(merge_source(original, layers, ref), [])

    def test_corrupt_or_incomplete_source_completion_is_atomic(self):
        row = {'id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'geometryWKB': '01', 'connectors': [], 'level_rules': [], 'road_flags': None}
        base = {'release': '2026-10-21.0', 'complete': True, 'missingPrefixes': [], 'requestedPrefixes': [row['id'][:12]], 'rows': [row]}
        variants = [dict(base, complete=False), dict(base, missingPrefixes=['missing']), dict(base, rows=[]), dict(base, rows=[dict(row, geometryWKB='changed')]), dict(base, rows=[row, row])]
        for ref in variants:
            original = {row['id'][:12]: dict(row)}; layers = {row['id'][:12]: []}
            held = json.dumps([original, layers], sort_keys=True)
            with self.assertRaises(AssertionError):
                merge_source(original, layers, ref)
            self.assertEqual(json.dumps([original, layers], sort_keys=True), held)

    def test_level_lookup_keeps_unknown_metadata_distinct_from_a_known_visual_level(self):
        scope.update(args=SimpleNamespace(additional_source_reference=True), sourceMetadataMissing=set(),
                     layers={'known': [], 'tunnel': [{'value': -1}], 'upper': [{'value': 2}], 'scoped': [{'value': 1, 'between': [.25, .5]}]},
                     sourceOffsets={}, sourceTotals={'scoped': 100.}, srcS=lambda ident, distance: distance,
                     officialFractionAtControls={}, exactSourceFractions={})
        for prefix in ['known', 'unknown']:
            self.assertEqual(scope['level'](prefix+'_0', 50.), 0)
        self.assertEqual(scope['sourceMetadataMissing'], {'unknown'})
        self.assertEqual(scope['level']('tunnel_0', 50.), -1)
        self.assertEqual(scope['level']('upper_0', 50.), 2)
        for distance, expected in [(0., 0), (25., 1), (40., 1), (50., 1), (75., 0)]:
            self.assertEqual(scope['level']('scoped_0', distance), expected)

    def test_attached_apron_cannot_waive_a_source_ordered_overpass(self):
        node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'in_ground')
        ground, flyover = 'ground_0', 'flyover_0'
        env = {'arcs': {ground: [0., 100.], flyover: [0., 100.]},
               'roads': {ground: {}, flyover: {}},
               'components': [{'ramp': flyover, 'reverse': False, 'segmentPairs': [(ground, flyover, 0, 0)],
                               'run': 100., 'groundRun': 100., 'members': [{'id': ground, 'reverse': False, 'start': 0.}]}]}
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), 'exec'), env)
        env['level'] = lambda road, distance: 2 if road == flyover else 0
        self.assertFalse(env['in_ground'](ground, 0, .7, flyover, 0, .7))
        env['level'] = lambda road, distance: 0
        self.assertTrue(env['in_ground'](ground, 0, .7, flyover, 0, .7))

if __name__ == '__main__':
    unittest.main()
