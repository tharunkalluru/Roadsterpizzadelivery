"""Model-grade constraints and safe pack replacement, independent of raw ETL."""
import gzip
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from orr_geometry import APPROACH, MODEL_DECK, atomic_pack, distances, smooth


class OrrGeometryTests(unittest.TestCase):
    def test_bridge_approach_is_flat_at_both_ends_and_under_four_percent(self):
        values = [MODEL_DECK * (1 - smooth(i / APPROACH)) for i in range(int(APPROACH) + 1)]
        self.assertEqual(values[0], MODEL_DECK)
        self.assertEqual(values[-1], 0)
        self.assertLess(abs(values[1] - values[0]), .001)
        self.assertLess(abs(values[-1] - values[-2]), .001)
        self.assertLess(max(abs(b - a) for a, b in zip(values, values[1:])), .04)

    def test_grade_distance_follows_connected_roads_not_a_nearby_crossing(self):
        adj = {'bridge': [('ramp', 40)], 'ramp': [('bridge', 40), ('street', 60)], 'street': [('ramp', 60)], 'underpass': []}
        d = distances(adj, {'bridge': 0})
        self.assertEqual(d['street'], 100)
        self.assertNotIn('underpass', d)

    def test_multiple_bridges_choose_nearest_network_approach(self):
        adj = {'a': [('b', 30)], 'b': [('a', 30), ('c', 10)], 'c': [('b', 10)]}
        self.assertEqual(distances(adj, {'a': 0, 'c': 0})['b'], 10)

    def test_atomic_pack_preserves_utf8_evidence_and_is_byte_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'test.pack.wasm'
            value = {'roads': [{'id': 'original', 'pts': [[0, 0], [1, 2]]}],
                     'boards': [{'text': 'ఒరిజినల్ పేరు', 'sources': ['https://example.test/original']}], 'unrelated': {'keep': True}}
            atomic_pack(path, value)
            first = path.read_bytes()
            self.assertEqual(json.loads(gzip.decompress(first)), value)
            atomic_pack(path, value)
            self.assertEqual(path.read_bytes(), first)
            self.assertEqual(list(Path(tmp).iterdir()), [path])


if __name__ == '__main__':
    unittest.main()
