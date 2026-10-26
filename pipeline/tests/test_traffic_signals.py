import copy
import gzip
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from traffic_signals import ROOT, prepare, apply, load, incoming_directions
from orr_geometry import atomic_pack


class TrafficSignalImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = load(ROOT / 'game/public/city/core.pack.wasm')
        cls.evidence = json.loads((ROOT / 'pipeline/evidence/citywide-traffic-signals-2026-10-26.json').read_text())

    def test_real_snapshot_has_public_source_identity_and_excludes_private_crossing(self):
        before = copy.deepcopy(self.core)
        signals, metadata, report = prepare(self.core, self.evidence)
        self.assertEqual(len(signals), 268)
        self.assertEqual(report['withIncidentWays'], 267)
        self.assertEqual(report['mappedDirectionRecords'], 576)
        self.assertEqual(report['directionTaggedNodes'], 17)
        self.assertEqual(report['excluded'][0]['id'], 11052428863)
        self.assertEqual(before, self.core, 'preparing signal metadata must not alter source roads or business data')
        self.assertTrue(all(s['id'] and s['sourceVersion'] and s['sourceTimestamp'] and s['sourceURL'].startswith('https://www.openstreetmap.org/node/') for s in signals))
        self.assertEqual(len({s['id'] for s in signals}), len(signals))
        self.assertIn('simulated', metadata['uncertainty'])

    def test_source_way_order_captures_both_incoming_bend_tangents_and_endpoint_roles(self):
        origin = {'lat': 17.4, 'lon': 78.5}
        way = {'id': 123, 'nodes': [1, 2, 3], 'tags': {'highway': 'primary', 'oneway': 'yes'},
               'geometry': [{'lat': 17.4, 'lon': 78.499}, {'lat': 17.4, 'lon': 78.5}, {'lat': 17.399, 'lon': 78.5}]}
        middle = incoming_directions(2, way, origin)
        self.assertEqual(middle['forwardHeading'], [1, 0])
        self.assertEqual(middle['backwardHeading'], [0, -1])
        self.assertEqual(middle['nodeRole'], 'interior')
        self.assertEqual(middle['tags']['oneway'], 'yes')
        self.assertEqual(incoming_directions(1, way, origin)['nodeRole'], 'start')
        self.assertEqual(incoming_directions(3, way, origin)['nodeRole'], 'end')
        self.assertIsNone(incoming_directions(9, way, origin))

    def test_partial_bounds_missing_metadata_duplicates_and_empty_evidence_refuse_apply(self):
        for mutation in ['bounds', 'timestamp', 'duplicate', 'empty']:
            e = copy.deepcopy(self.evidence)
            if mutation == 'bounds': e['bounds'][0] += .01
            elif mutation == 'timestamp': e.pop('sourceDataTimestamp')
            elif mutation == 'duplicate': e['elements'].append(copy.deepcopy(next(n for n in e['elements'] if n['type'] == 'node')))
            else: e['elements'] = []
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): prepare(self.core, e)

    def test_atomic_idempotent_core_only_patch_preserves_all_businesses_roads_and_street_bytes(self):
        signals, metadata, _ = prepare(self.core, self.evidence)
        source = copy.deepcopy(self.core)
        source.pop('trafficSignals', None); source.pop('trafficSignalSource', None)
        with tempfile.TemporaryDirectory() as directory:
            city = Path(directory)
            atomic_pack(city / 'core.pack.wasm', source)
            original_pack = b'preserve unrelated street pack and shopfront evidence\x00\xff'
            (city / 'street.pack.wasm').write_bytes(original_pack)
            result = apply(city, source, signals, metadata)
            self.assertTrue(result['coreChanged']); self.assertEqual(result['streetPacksRewritten'], 0)
            after = load(city / 'core.pack.wasm')
            without_signals = {k: v for k, v in after.items() if k not in ('trafficSignals', 'trafficSignalSource')}
            self.assertEqual(without_signals, source)
            self.assertEqual((city / 'street.pack.wasm').read_bytes(), original_pack)
            once = (city / 'core.pack.wasm').read_bytes()
            again = apply(city, after, signals, metadata)
            self.assertFalse(again['coreChanged'])
            self.assertEqual((city / 'core.pack.wasm').read_bytes(), once)
            self.assertEqual((city / 'street.pack.wasm').read_bytes(), original_pack)

    def test_unexpected_large_source_population_drop_is_not_silently_applied(self):
        signals, metadata, _ = prepare(self.core, self.evidence)
        core = dict(self.core, trafficSignals=signals)
        e = copy.deepcopy(self.evidence)
        keep = {int(s['id'][5:]) for s in signals[:100]}
        e['elements'] = [n for n in e['elements'] if n['type'] != 'node' or n['id'] in keep]
        with self.assertRaises(ValueError): prepare(core, e)


if __name__ == '__main__': unittest.main()
