"""Run the real assessment on the two incident owners omitted by graph v1.

Owner controls and endpoint datums are literal values from the read-only
roadster-source-proved-facility-detailed-incidence-9413-v1.json receipt,
SHA256 8be1104f50b98d25732d5e94aae27f2058ab0b0f85ffa7466856d93cb3caecf3.
Remote core controls only provide the minimal input shape for this regression.
"""
import copy
import gzip
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
ASSESS = ROOT / 'scripts/assess-tile-grade-closure.py'
EXPORT = ROOT / 'scripts/export-joint-road-tile-input.mjs'
NODE_A, NODE_B = 'b222e7cb-6f3', '85b07e28-3b5'
HEIGHT_A, HEIGHT_B = -3.107638450268462, -3.9074475034862783
OWNERS = [
    {'id': '5551adbf-6c8_0', 'cls': 'residential', 'w': 6, 'lanes': 1,
     'oneway': None, 'from': NODE_A, 'to': 'e885812c-db5', 'elev': None,
     'pts': [[-1207.9, -3053.4], [-1204.7, -3077.8], [-1196.9, -3122.9],
             [-1195.7, -3125.4], [-1193.8, -3126.8], [-1189.6, -3128.2]]},
    {'id': '840ed0d2-e13_0', 'cls': 'unknown', 'w': 5.5, 'lanes': 1,
     'oneway': None, 'from': NODE_A, 'to': NODE_B, 'elev': None,
     'pts': [[-1207.9, -3053.4], [-1210.9, -3041.7]]},
]
CORE = [
    {'id': '882b33a6-0ab_1', 'cls': 'tertiary', 'w': 6, 'from': 'remote-a',
     'to': NODE_A, 'pts': [[-1307.9, -3053.4], [-1207.9, -3053.4]],
     'elev': [HEIGHT_A, HEIGHT_A]},
    {'id': '397fbbcf-eba_0', 'cls': 'tertiary', 'w': 6, 'from': 'remote-b',
     'to': NODE_B, 'pts': [[-1310.9, -3041.7], [-1210.9, -3041.7]],
     'elev': [HEIGHT_B, HEIGHT_B]},
]


class EndpointOwnerSelection(unittest.TestCase):
    def assess(self, mutate=None, prepared=None, pending=None):
        owners, core_roads = copy.deepcopy(OWNERS), copy.deepcopy(CORE)
        if mutate:
            mutate(owners, core_roads)
        with tempfile.TemporaryDirectory() as folder:
            repo = Path(folder)
            city = repo / 'public/city'
            city.mkdir(parents=True)
            core_bytes = gzip.compress(json.dumps({'roads': core_roads, 'packs': [
                {'file': 'fixture.pack.wasm'}]}).encode(), mtime=0)
            (city / 'core.pack.wasm').write_bytes(core_bytes)
            (city / 'fixture.pack.wasm').write_bytes(gzip.compress(
                json.dumps({'tiles': {'0_0': {'roads': owners}}}).encode(), mtime=0))
            data = {
                'model': {'sourceRoadGeometryGeneration': 'literal-endpoint-test', 'roads': core_roads},
                'source-geometry': {'generationID': 'literal-endpoint-test', 'roads': [], 'nodes': {},
                                    'sourceCorePackSHA256': hashlib.sha256(core_bytes).hexdigest()},
                'classification': {'rows': []},
            }
            for name, value in data.items():
                (repo / (name + '.json')).write_text(json.dumps(value))
            command = [sys.executable, str(ASSESS), '--repo', str(repo)]
            for name in data:
                command += ['--' + name, str(repo / (name + '.json'))]
            if prepared is not None:
                path = repo / 'supplement.json'
                path.write_text(json.dumps({'sourceModelSHA256': hashlib.sha256(
                    (repo / 'model.json').read_bytes()).hexdigest(), 'tileRoads': prepared}))
                command += ['--tile-transports', str(path)]
            if pending is not None:
                path = repo / 'pending.json'
                path.write_text(json.dumps(pending))
                command += ['--pending-node-targets', str(path)]
            output = repo / 'assessment.json'
            result = subprocess.run(command + ['--output', str(output)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            return json.loads(output.read_text())

    def test_infeasible_literal_owners_survive_empty_changed_preview(self):
        report = self.assess()
        low = next(r for r in report['results'] if r['summary']['grade'] == .065)
        length = math.dist(*OWNERS[1]['pts'])
        self.assertGreater(abs(HEIGHT_A - HEIGHT_B) / length, .065)
        self.assertGreater(low['summary']['conflictingCoreAnchors'], 0)
        self.assertEqual(low['changedRoads'], [])
        self.assertEqual({r['id'] for r in report['explicitCoreEndpointOwners']},
                         {r['id'] for r in OWNERS})
        self.assertEqual(report['explicitCoreEndpointOwners'][1]['endpoints'][1]['ownerHeight'], 0.)
        self.assertEqual(report['explicitCoreEndpointOwners'][1]['endpoints'][1]
                         ['coreEndpoints'][0]['height'], HEIGHT_B)
        policy = report['method']['explicitCoreEndpointOwnerSelection']
        self.assertTrue(policy['inputSelectionOnly'])
        self.assertFalse(policy['heightOrFeasibilityApproval'])
        self.assertFalse(policy['coordinatesSnapped'])

    def test_owner_with_missing_far_graph_endpoint_is_still_retained(self):
        report = self.assess(lambda owners, _: owners[0].update(to=None))
        self.assertEqual(report['graph']['roads'], 1)
        self.assertEqual(len(report['explicitCoreEndpointOwners']), 2)

    def test_exact_node_identity_does_not_follow_nearby_coordinates(self):
        report = self.assess(lambda owners, _: owners[0].update({'from': 'different-node-same-point'}))
        self.assertEqual([r['id'] for r in report['explicitCoreEndpointOwners']], ['840ed0d2-e13_0'])

    def test_distinct_retained_endpoint_coordinates_are_not_snapped(self):
        def shift(owners, _):
            owners[0]['pts'][0][0] += 1.
        record = self.assess(shift)['explicitCoreEndpointOwners'][0]['endpoints'][0]
        self.assertEqual(record['ownerPoint'], [-1206.9, -3053.4])
        self.assertEqual(record['coreEndpoints'][0]['point'], [-1207.9, -3053.4])

    def test_strict_eight_mm_threshold_and_prepared_baseline(self):
        for gap, count in [(.008, 0), (.008001, 2)]:
            def set_heights(owners, core_roads):
                for road in core_roads:
                    road['elev'] = [0., 0.]
                for road in owners:
                    road['elev'] = [gap] * len(road['pts'])
            self.assertEqual(len(self.assess(set_heights)['explicitCoreEndpointOwners']), count)
        prepared = [{**copy.deepcopy(OWNERS[1]), 'elev': [HEIGHT_A, HEIGHT_B]}]
        self.assertEqual([r['id'] for r in self.assess(prepared=prepared)
                          ['explicitCoreEndpointOwners']], ['5551adbf-6c8_0'])

    def test_pending_targets_never_replace_actual_core_selection_evidence(self):
        report = self.assess(pending={NODE_A: 0., NODE_B: 0.})
        self.assertEqual(len(report['explicitCoreEndpointOwners']), 2)
        self.assertEqual(report['explicitCoreEndpointOwners'][0]['endpoints'][0]
                         ['coreEndpoints'][0]['height'], HEIGHT_A)

    def test_context_and_non_drivable_copies_are_not_selected_as_owners(self):
        def add_copies(owners, _):
            owners += [{**copy.deepcopy(owners[0]), 'id': 'context-only', 'ctx': 1},
                       {**copy.deepcopy(owners[0]), 'id': 'foot-only', 'cls': 'footway'}]
        self.assertEqual(len(self.assess(add_copies)['explicitCoreEndpointOwners']), 2)

    def test_joint_exporter_rejects_stale_model_or_missing_endpoint_inventory(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for digest, message in [('stale', 'Selection model mismatch'),
                                    (hashlib.sha256(b'{}').hexdigest(),
                                     'Invalid or missing explicit core-endpoint owner selection')]:
                command = ['node', str(EXPORT)]
                for key, value in {'model': {}, 'source-geometry': {}, 'tile-transports': {},
                                   'selection': {'inputs': {'modelSHA256': digest}}}.items():
                    path = root / (key + '.json')
                    path.write_text(json.dumps(value))
                    command += ['--' + key, str(path)]
                output = root / 'must-not-exist.json'
                result = subprocess.run(command + ['--output', str(output)], capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(message, result.stderr)
                self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
