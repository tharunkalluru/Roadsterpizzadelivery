import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]/'scripts/qa/rebase-unchanged-tile-pavement-baseline.py'
SPEC = importlib.util.spec_from_file_location('tile_baseline_rebase', SOURCE)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class TileBaselineRebase(unittest.TestCase):
    def fixture(self):
        rows = [{'id': f'{i:012d}_0', 'expected': {'from': f'a{i}', 'to': f'b{i}'},
                 'historicalFootprint': {'L': [[0., 0.]], 'R': [[0., 1.]]},
                 'physicalWidth': 8.4, 'preserveCoarseControls': True} for i in range(21)]
        baseline = {'version': 1, 'kind': 'literal-historical-tile-pavement-baseline',
                    'sourceCoreSHA256': 'core', 'sourceRoadGeometryGeneration': 'old-generation',
                    'sourceDataSHA256': 'old-source', 'sourcePackSHA256': {'pack': 'hash'},
                    'roads': rows, 'historicalReference': {'artifactSHA256': 'literal-reference'}}
        old = {'generationID': 'old-generation', 'sourceCorePackSHA256': 'core',
               'origin': [78., 17.], 'heightPolicy': 'no changes',
               'sourcePackSHA256': {'pack': 'hash'},
               'roads': [{'id': 'retained_0', 'pts': [[0., -0.], [1., 1.]]}],
               'sources': [{'id': 'retained-family', 'geometryLonLat': [[78., 17.]]}],
               'nodes': {'retained-node': {'point': [1., 2.]}}}
        new = copy.deepcopy(old)
        new['generationID'] = 'new-generation'
        new['roads'].append({'id': 'unrelated_0', 'pts': [[2., 3.]]})
        new['sources'].append({'id': 'unrelated-source-family'})
        new['nodes']['unrelated-node'] = {'point': [4., 5.]}
        bindings = {'baseline': {'sha256': 'baseline'}, 'old_source': {'sha256': 'old-source'},
                    'new_source': {'sha256': 'new-source'}}
        return baseline, old, new, bindings

    def test_only_frame_and_proof_are_added_all_literal_content_remains_exact(self):
        baseline, old, new, bindings = self.fixture()
        original = copy.deepcopy((baseline, old, new))
        output, proof = M.prepare(baseline, old, new, bindings)
        self.assertEqual((baseline, old, new), original)
        self.assertEqual(output['roads'], baseline['roads'])
        self.assertEqual(output['historicalReference'], baseline['historicalReference'])
        self.assertEqual(output['sourceDataSHA256'], 'new-source')
        self.assertTrue(proof['actualJointExportStillRequired'])
        self.assertFalse(proof['runtimeActivated'])

    def test_parent_field_or_signed_zero_change_is_rejected(self):
        for target in ['road', 'source', 'node', 'origin', 'height-policy', 'pack']:
            b, o, n, h = self.fixture()
            if target == 'road': n['roads'][0]['pts'][0][1] = 0.
            if target == 'source': n['sources'][0]['geometryLonLat'][0][0] += .001
            if target == 'node': n['nodes']['retained-node']['point'][0] += .01
            if target == 'origin': n['origin'][0] += .001
            if target == 'height-policy': n['heightPolicy'] = 'new policy'
            if target == 'pack': n['sourcePackSHA256']['pack'] = 'different'
            with self.subTest(target=target), self.assertRaises(ValueError):
                M.prepare(b, o, n, h)

    def test_new_owner_family_or_endpoint_cannot_affect_the_literal_scope(self):
        for target in ['road', 'source', 'node']:
            b, o, n, h = self.fixture()
            if target == 'road': n['roads'][-1]['id'] = b['roads'][0]['id']
            if target == 'source': n['sources'][-1]['id'] = b['roads'][0]['id'].split('_')[0]+'-full'
            if target == 'node': n['nodes']['a0'] = {'point': [4., 5.]}
            with self.subTest(target=target), self.assertRaises(ValueError):
                M.prepare(b, o, n, h)

    def test_source_scope_omission_duplicate_and_stale_binding_are_rejected(self):
        for target in ['omission', 'duplicate', 'frame', 'count', 'core']:
            b, o, n, h = self.fixture()
            if target == 'omission': n['roads'].pop(0)
            if target == 'duplicate': n['sources'].append(copy.deepcopy(n['sources'][0]))
            if target == 'frame': b['sourceRoadGeometryGeneration'] = 'other'
            if target == 'count': b['roads'].pop()
            if target == 'core': n['sourceCorePackSHA256'] = 'other'
            with self.subTest(target=target), self.assertRaises(ValueError):
                M.prepare(b, o, n, h)

    def test_actual_output_preserves_javascript_literal_record_and_footprint_bytes(self):
        baseline, old, new, bindings = self.fixture()
        for row in baseline['roads']:
            row['historicalFootprint'] = {'id': row['id'], **row['historicalFootprint']}
        output, _ = M.prepare(baseline, old, new, bindings)
        with tempfile.TemporaryDirectory() as folder:
            parent, result = Path(folder)/'parent.json', Path(folder)/'result.json'
            parent.write_text(json.dumps(baseline))
            M.write_bound_output(result, output)
            # Exercise the actual downstream JSON.stringify/hash convention,
            # rather than Python dict equality (which ignores insertion order).
            script = """const fs=require('node:fs'),assert=require('node:assert/strict'),
              crypto=require('node:crypto');const [a,b]=process.argv.slice(1).map(p=>JSON.parse(fs.readFileSync(p)));
              const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
              assert.equal(a.roads.length,21);for(let i=0;i<21;i++){
                assert.equal(JSON.stringify(a.roads[i].expected),JSON.stringify(b.roads[i].expected));
                assert.equal(sha(a.roads[i].historicalFootprint),sha(b.roads[i].historicalFootprint));}
              console.log('21 expected strings and literal footprint hashes remain exact');"""
            run = subprocess.run(['node','-e',script,str(parent),str(result)],text=True,capture_output=True)
            self.assertEqual(run.returncode,0,run.stderr)
            self.assertIn('21 expected strings',run.stdout)


if __name__ == '__main__':
    unittest.main()
