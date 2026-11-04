"""Exercise the actual policy producer's fixed-source and provenance guards."""
import hashlib
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

GENERATOR = Path(__file__).resolve().parents[1] / 'scripts/qa/prepare-generated-node-datums.py'

class GeneratedNodeDatumPolicy(unittest.TestCase):
    def run_fixture(self, mutation=None, consistent=False):
        node = '11111111-111'
        full = '11111111-1111-4111-8111-111111111111'
        full_ids = [char * 8 + '-' + char * 4 + '-4111-8111-111111111111' for char in 'abc']
        ids = [ident[:12] + '_0' for ident in full_ids]
        roads = [dict(id=ids[0], pts=[[0., 0.], [1., 0.]], elev=[0., 6.8], **{'from': 'other-a', 'to': node}),
                 dict(id=ids[1], pts=[[1., 0.], [2., 0.]], elev=[6.8, 0.], **{'from': node, 'to': 'other-b'}),
                 dict(id=ids[2], pts=[[1., 0.], [1., 1.]], elev=None, **{'from': node, 'to': 'other-c'})]
        rows = [dict(id=ident, connectors=[{'connector_id': full}],
                     level_rules=None, road_flags=None) for ident in full_ids]
        diagnosis = {'nodes': [{'node': node, 'heightRange': [0., 6.8], 'arms': [{'road': ident, 'height': y} for ident, y in zip(ids, [6.8, 6.8, 0.])]}]}
        model = {'roads': roads[:2], 'underpassChanges': {}, 'report': {'underpassRoadIds': []}}
        joint = {'sourceCoreSHA256': 'core', 'contextRoads': roads[2:], 'tileRoads': [], 'requestedRoadIDs': [],
                 'sourceEvidence': {row['id'][:12]: {'row': row} for row in rows}}
        incidence = {'sourceCoreSHA256': 'core', 'nodes': [node], 'tileOwners': {ids[2]: {'physical': roads[2]}},
                     'ownerVariants': [], 'missingFromCurrentJoint': []}
        source = {'complete': True, 'missingPrefixes': [], 'rows': rows}
        mapped, apron = {'roads': []}, {'estimatedNodeLowering': []}
        data = dict(model=model, joint=joint, diagnosis=diagnosis, packed_incidence=incidence,
                    source_reference=source, mapped_levels=mapped, apron_policy=apron)
        if consistent:
            # Six independently named source connectors, including a source span
            # away from the endpoint: remote bridge metadata must stay local.
            model['roads'] = []
            joint['contextRoads'] = []
            incidence['tileOwners'] = {}
            diagnosis['nodes'] = []
            incidence['nodes'] = []
            rows.clear()
            reviews = []
            for n in range(6):
                current_node = f'{n + 1:08x}-111'
                current_full = current_node + '1-4111-8111-111111111111'
                arms, entries = [], []
                for arm in range(3):
                    road = copy.deepcopy(roads[arm])
                    road['id'] = f'{10 * n + arm + 1:08x}-aaa_0'
                    road['from'], road['to'] = current_node, f'other-{n}-{arm}'
                    road['elev'] = [1., 2.]
                    model['roads'].append(road)
                    row = {'id': road['id'].split('_')[0] + 'a-4111-8111-111111111111',
                           'connectors': [{'connector_id': current_full, 'at': 1.}],
                           'level_rules': [{'value': 1, 'between': [0., .5]}],
                           'road_flags': [{'values': ['is_bridge'], 'between': [0., .5]}],
                           'geometryWKB': '0102'}
                    local_flags = [{'values': ['is_link'], 'between': None}] if arm == 1 else []
                    row['road_flags'] += local_flags
                    rows.append(row)
                    entries.append({'road': road['id'], 'height': 1.})
                    arms.append({'id': road['id'], 'end': 'from', 'height': 1., 'point': road['pts'][0],
                                 'heightEnvelope': [1., 2.], 'heightCount': 2, 'sourceSegmentID': row['id'],
                                 'fullConnectorID': current_full, 'sourceGeometryWKB_SHA256': hashlib.sha256(bytes.fromhex(row['geometryWKB'])).hexdigest(),
                                 'sourceLevelRules': row['level_rules'], 'sourceRoadFlags': row['road_flags'],
                                 'connectorOfficialFraction': 1., 'actualEndpointFullWKBProjectedFraction': .999,
                                 'sourceProjectionResidualM': .02, 'activeLevelRulesAtConnectorFraction': [],
                                 'activeRoadFlagsAtConnectorFraction': local_flags, 'activeLevelRulesAtActualEndpointFraction': [],
                                 'activeRoadFlagsAtActualEndpointFraction': local_flags,
                                 'railInfluence': {'available': True, 'allRoadRailContactCount': 0, 'canonicalRoadControlsFromOldV30': []}})
                diagnosis['nodes'].append({'node': current_node, 'heightRange': [1., 1.], 'arms': entries})
                incidence['nodes'].append(current_node)
                reviews.append({'node': current_node, 'arms': arms, 'endpointHeightsExactlyConsistent': True,
                                'allArmsHaveOneSameFullConnector': True, 'allArmIncidenceCompleteAgainstAll304Packs': True,
                                'missingPackedOwnersFromJoint': [], 'jointDetailedArmsWithoutPackedOwner': [],
                                'oldPolicyCoversNode': False, 'oldPolicyExplicitlyExcludesNode': False,
                                'explicitApronPolicyCoversNode': False, 'heightRange': [1., 1.], 'actualPackedOwners': {}})
            joint['sourceEvidence'] = {row['id'][:12]: {'row': row} for row in rows}
            incidence['packSHA256'] = {}
            data['consistent_node_diagnostic'] = {'schema': 'consistent-generated-source-node-field-diagnostic-v1',
                                                'releaseApproved': False, 'heightAuthorityGranted': False,
                                                'packSHA256': {}, 'sixExactNodes': reviews}
        if mutation:
            mutation(data)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for key, value in data.items():
                if key == 'joint':
                    value['sourceModelSHA256'] = hashlib.sha256((root / 'model.json').read_bytes()).hexdigest()
                if key == 'diagnosis':
                    for field, filename in [('sourceModelSHA256', 'model'), ('sourceJointSHA256', 'joint')]:
                        value[field] = hashlib.sha256((root / (filename + '.json')).read_bytes()).hexdigest()
                    value['sourceReferenceSHA256'] = hashlib.sha256(json.dumps(source).encode()).hexdigest()
                if key == 'packed_incidence':
                    value['sourceDiagnosisSHA256'] = hashlib.sha256((root / 'diagnosis.json').read_bytes()).hexdigest()
                    value['sourceJointSHA256'] = hashlib.sha256((root / 'joint.json').read_bytes()).hexdigest()
                if key == 'consistent_node_diagnostic':
                    value['inputs'] = {str(root / (name + '.json')): hashlib.sha256((root / (name + '.json')).read_bytes()).hexdigest()
                                       for name in ['model', 'joint', 'source_reference', 'mapped_levels', 'apron_policy']}
                (root / (key + '.json')).write_text(json.dumps(value))
            command = [sys.executable, str(GENERATOR)]
            for key in data:
                command += ['--' + key.replace('_', '-'), str(root / (key + '.json'))]
            output = root / 'policy.json'
            result = subprocess.run(command + ['--output', str(output)], text=True, capture_output=True)
            self.last_stderr = result.stderr
            return result.returncode, json.loads(output.read_bytes()) if output.exists() else None

    def test_fixed_surrounding_street_remains_an_exact_anchor(self):
        status, policy = self.run_fixture()
        self.assertEqual(status, 0, self.last_stderr)
        self.assertEqual(policy['nodes'][0]['nodeHeightBounds'], [0., 0.])
        self.assertEqual(policy['nodes'][0]['existingLocalHeightEnvelope'], [0., 6.8])
        self.assertEqual(policy['nodes'][0]['recoveryMeters'], 136)
        self.assertFalse(policy['releaseApproved'])

    def test_surveyed_profile_and_incomplete_incidence_cannot_be_released(self):
        for mutate in [lambda d: d['model']['roads'][0].update(elevationSource='surveyed'),
                       lambda d: d['packed_incidence'].update(missingFromCurrentJoint=['missing']),
                       lambda d: d['source_reference'].update(complete=False),
                       lambda d: d['mapped_levels']['roads'].append({'id': 'aaaaaaaa-aaa_0'})]:
            status, policy = self.run_fixture(mutate)
            self.assertNotEqual(status, 0)
            self.assertIsNone(policy)

    def test_existing_explicit_datum_is_retained(self):
        status, policy = self.run_fixture(lambda d: d['apron_policy']['estimatedNodeLowering'].append({'node': '11111111-111'}))
        self.assertEqual(status, 0)
        self.assertEqual(policy['nodes'], [])
        self.assertEqual(len(policy['excluded']), 1)

    def test_consistent_source_nodes_need_explicit_local_source_review(self):
        status, policy = self.run_fixture(consistent=True)
        self.assertEqual(status, 0, self.last_stderr)
        self.assertEqual(len(policy['nodes']), 6)
        self.assertTrue(all(n['inventoryClass'] == 'reviewed-consistent-generated-node' for n in policy['nodes']))
        self.assertTrue(all(n['nodeHeightBounds'] == [0., 2.] for n in policy['nodes']))
        self.assertFalse(policy['releaseApproved'])

    def test_active_local_source_level_is_excluded_without_grounding_it(self):
        def local_level(data):
            row = data['source_reference']['rows'][0]
            row['level_rules'] = [{'value': 1, 'between': [.9, 1.]}]
            arm = data['consistent_node_diagnostic']['sixExactNodes'][0]['arms'][0]
            arm['sourceLevelRules'] = row['level_rules']
            for key in ['activeLevelRulesAtConnectorFraction', 'activeLevelRulesAtActualEndpointFraction']:
                arm[key] = row['level_rules']
        status, policy = self.run_fixture(local_level, consistent=True)
        self.assertEqual(status, 0, self.last_stderr)
        self.assertEqual(len(policy['nodes']), 5)
        self.assertIn('nonzero source level', policy['excluded'][0]['sourceEvidence'][0]['reason'])

    def test_consistent_nodes_without_selected_review_remain_fixed(self):
        status, policy = self.run_fixture(lambda d: d.pop('consistent_node_diagnostic'), consistent=True)
        self.assertEqual(status, 0, self.last_stderr)
        self.assertEqual(policy['nodes'], [])
        self.assertEqual(len(policy['excluded']), 6)

    def test_source_structure_or_rail_review_does_not_gain_consistent_authority(self):
        def local_structure(data):
            row = data['source_reference']['rows'][0]
            row['road_flags'] = [{'values': ['is_bridge'], 'between': [.9, 1.]}]
            arm = data['consistent_node_diagnostic']['sixExactNodes'][0]['arms'][0]
            arm['sourceRoadFlags'] = row['road_flags']
            for key in ['activeRoadFlagsAtConnectorFraction', 'activeRoadFlagsAtActualEndpointFraction']:
                arm[key] = row['road_flags']
        for mutation in [local_structure, lambda d: d['consistent_node_diagnostic']['sixExactNodes'][0]['arms'][0]['railInfluence'].update(allRoadRailContactCount=1)]:
            status, policy = self.run_fixture(mutation, consistent=True)
            self.assertEqual(status, 0, self.last_stderr)
            self.assertEqual(len(policy['nodes']), 5)
            self.assertEqual(len(policy['excluded']), 1)

    def test_stale_endpoint_diagnosis_and_incomplete_consistent_review_fail_closed(self):
        for mutation in [lambda d: d['diagnosis']['nodes'][0].update(heightRange=[0., 2.]),
                         lambda d: d['consistent_node_diagnostic']['sixExactNodes'][0].update(allArmIncidenceCompleteAgainstAll304Packs=False),
                         lambda d: d['consistent_node_diagnostic']['sixExactNodes'][0]['arms'][0].update(activeLevelRulesAtActualEndpointFraction=[{'value': 0}])]:
            status, policy = self.run_fixture(mutation, consistent=True)
            self.assertNotEqual(status, 0)
            self.assertIsNone(policy)

    def test_negative_interior_retains_facility_authority(self):
        status, policy = self.run_fixture(lambda d: d['model']['roads'][0]['elev'].__setitem__(1, -1.), consistent=True)
        self.assertEqual(status, 0, self.last_stderr)
        self.assertEqual(len(policy['nodes']), 5)
        self.assertIn('negative facility', policy['excluded'][0]['reason'])

if __name__ == '__main__':
    unittest.main()
