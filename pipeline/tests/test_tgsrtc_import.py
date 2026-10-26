"""Stop-order and identity integrity, independent of the downloaded archive."""
import csv
import io
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from import_tgsrtc import extract


class TgsrtcTests(unittest.TestCase):
    def feed(self, path, trips, stop_times, stops=None):
        tables = {
            'feed_info.txt': [{'feed_version': '20260201'}],
            'routes.txt': [{'route_id': '8A', 'route_long_name': '8A'}],
            'trips.txt': trips,
            'stop_times.txt': stop_times,
            'stops.txt': stops or [
                {'stop_id': 'a', 'stop_name': 'A', 'stop_lat': '17.40', 'stop_lon': '78.49'},
                {'stop_id': 'b', 'stop_name': 'B', 'stop_lat': '17.41', 'stop_lon': '78.49'},
                {'stop_id': 'c', 'stop_name': 'C', 'stop_lat': '17.42', 'stop_lon': '78.49'},
            ],
        }
        with zipfile.ZipFile(path, 'w') as z:
            for name, rows in tables.items():
                text = io.StringIO()
                writer = csv.DictWriter(text, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
                z.writestr(name, text.getvalue())
        return {'origin': {'lat': 17.4063, 'lon': 78.4966}, 'bounds': {'minX': -33000, 'maxX': 24000, 'minZ': -24000, 'maxZ': 24000}}

    def test_sequence_numbers_override_csv_row_order_and_retain_agency_attribution(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'feed.zip'
            core = self.feed(p, [{'trip_id': 't', 'route_id': '8A', 'direction_id': '1', 'trip_short_name': '8A-SILVER-A-C'}],
                             [{'trip_id': 't', 'stop_sequence': i, 'stop_id': sid} for i, sid in [(3, 'c'), (1, 'a'), (2, 'b')]])
            data = extract(p, core)
            self.assertEqual(data['patterns'][0]['stops'], ['a', 'b', 'c'])
            self.assertEqual(data['patterns'][0]['direction'], '1')
            self.assertEqual(data['patterns'][0]['from'], 'A')
            self.assertEqual(data['patterns'][0]['to'], 'C')
            self.assertEqual(data['attribution'], 'Contains data provided by TGSRTC')
            self.assertEqual(len(data['sourceSha256']), 64)
            self.assertIn('No shapes', data['uncertainty'])

    def test_depot_trip_with_another_route_number_is_excluded(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'feed.zip'
            trips = [{'trip_id': t, 'route_id': '8A', 'direction_id': '0', 'trip_short_name': name} for t, name in [('ok', '8A-A-C'), ('wrong', '5K-A-C')]]
            rows = [{'trip_id': t, 'stop_sequence': i+1, 'stop_id': sid} for t in ['ok', 'wrong'] for i, sid in enumerate(['a', 'b', 'c'])]
            core = self.feed(p, trips, rows)
            data = extract(p, core)
            self.assertEqual(data['excludedMismatchedTrips'], 1)
            self.assertEqual(data['patterns'][0]['tripId'], 'ok')
            self.assertEqual(data['patterns'][0]['publishedTrips'], 1)

    def test_most_frequent_full_sequence_wins_over_a_short_working(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'feed.zip'
            trips = [{'trip_id': t, 'route_id': '8A', 'direction_id': '0', 'trip_short_name': '8A-A-C'} for t in ['full1', 'full2', 'depot']]
            rows = [{'trip_id': t, 'stop_sequence': i+1, 'stop_id': sid} for t, seq in [('depot', ['a', 'b']), ('full1', ['a', 'b', 'c']), ('full2', ['a', 'b', 'c'])] for i, sid in enumerate(seq)]
            data = extract(p, self.feed(p, trips, rows))
            self.assertEqual(data['patterns'][0]['stops'], ['a', 'b', 'c'])
            self.assertEqual(data['patterns'][0]['publishedTrips'], 2)


if __name__ == '__main__':
    unittest.main()
