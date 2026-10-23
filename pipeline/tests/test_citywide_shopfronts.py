import json
from pathlib import Path
import sys
import tempfile
import unittest
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from citywide_shopfronts import (atomic_json, load_state, make_plan, overpass_query,
                                run_batch, run_lock, summarize)
from shopfront_batch import KX, KZ, LAT0, LON0, apply_reports, atomic_pack, read_pack


class Clock:
    def __init__(self):
        self.now = 1700000000
        self.sleeps = []

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


def core_fixture(tiles=((0, 0),)):
    return dict(origin=dict(lat=LAT0, lon=LON0), tile=1000,
                bounds=dict(minX=-1000, maxX=3000, minZ=-1000, maxZ=3000),
                packs=[dict(file='packs/p0_0.pack.wasm', bytes=1, tiles=list(tiles))])


def evidence_for(cell, elements=()):
    return dict(schemaVersion=1, source='OpenStreetMap', sourceUrl='https://overpass-api.de/api/interpreter',
                retrievedAt='2026-10-23T00:00:00Z', cellId=cell['id'], bounds=cell['bbox'], elements=list(elements))


class CitywideTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.core = self.root / 'city' / 'core.pack.wasm'
        self.packs = self.core.parent / 'packs'
        self.packs.mkdir(parents=True)
        self.state = self.root / 'progress'
        self.clock = Clock()
        atomic_pack(self.core, core_fixture())

    def tearDown(self):
        self.temp.cleanup()

    def run_worker(self, **kwargs):
        return run_batch(self.core, self.state, clock=self.clock, sleeper=self.clock.sleep, **kwargs)

    def test_plan_covers_only_shipped_tiles_and_uses_origin_projection(self):
        source = core_fixture(((2, 2), (0, 0), (-1, 0), (0, 0), (10, 10)))
        plan = make_plan(source)
        self.assertEqual({c['id'] for c in plan['cells']}, {'tile_2_2', 'tile_0_0', 'tile_-1_0'})
        origin_cell = next(c for c in plan['cells'] if c['id'] == 'tile_0_0')
        self.assertEqual(origin_cell['bbox'], [LAT0 - 1000 / KZ, LON0, LAT0, LON0 + 1000 / KX])
        source['packs'][0]['tiles'].reverse()
        source['packs'][0]['bytes'] = 12345
        self.assertEqual(make_plan(source)['signature'], plan['signature'])

    def test_projection_mismatch_refuses_to_import(self):
        source = core_fixture()
        source['origin']['lat'] += .1
        with self.assertRaisesRegex(ValueError, 'origin differs'):
            make_plan(source)

    def test_status_and_dry_run_do_not_create_progress_or_fetch(self):
        def forbidden(*args):
            self.fail('Dry run must never request network data')
        result = self.run_worker(dry_run=True, fetcher=forbidden)
        self.assertEqual(result['totalPlayableCells'], 1)
        self.assertEqual(result['processedCells'], 0)
        self.assertFalse(self.state.exists())
        plan = make_plan(read_pack(self.core))
        self.assertEqual(summarize(plan, load_state(self.state, plan), self.clock())['remainingCells'], 1)
        self.assertFalse(self.state.exists())

    def test_query_preserves_source_geometry_and_english_name_only_businesses(self):
        query = overpass_query([17.4, 78.4, 17.41, 78.41])
        self.assertIn('out meta geom;', query)
        self.assertIn('nwr["name:en"]["shop"]', query)
        self.assertIn('nwr["name"]["office"]', query)
        self.assertIn('17.40000000,78.40000000,17.41000000,78.41000000', query)

    def test_bounded_queue_resumes_without_refetching_successful_cells(self):
        atomic_pack(self.core, core_fixture(((0, 0), (1, 0), (2, 0))))
        calls = []
        def fetch(cell, endpoint, now):
            calls.append((cell['id'], now))
            return evidence_for(cell)
        first = self.run_worker(max_cells=2, fetcher=fetch)
        self.assertEqual(first['processedCells'], 2)
        self.assertEqual(first['remainingCells'], 1)
        self.assertGreaterEqual(calls[1][1] - calls[0][1], 15)
        second = self.run_worker(max_cells=2, fetcher=fetch)
        self.assertEqual(second['processedCells'], 3)
        self.assertEqual(second['streetVerifiedCells'], 0)
        self.assertEqual(len({c[0] for c in calls}), 3)
        third = self.run_worker(fetcher=fetch)
        self.assertEqual(third['attemptedCells'], 0)
        self.assertEqual(len(calls), 3)

    def test_point_only_business_is_saved_for_review_never_placed(self):
        evidence = dict(type='node', id=9, lat=LAT0 - 5 / KZ, lon=LON0 + 5 / KX,
                        version=2, timestamp='2026-10-01T00:00:00Z', tags=dict(name='Real source pharmacy', amenity='pharmacy'))
        result = self.run_worker(fetcher=lambda c, e, n: evidence_for(c, [evidence]))
        self.assertEqual(result['sourceRecordOutcomesAcrossCells'], {'needs_street_photo_review': 1})
        self.assertEqual(list(self.packs.iterdir()), [])
        report = json.loads((self.state / 'reports/tile_0_0.json').read_text())
        self.assertEqual(report['records'][0]['source']['url'], 'https://www.openstreetmap.org/node/9')
        self.assertEqual(result['fetchedCells'], 1)
        self.assertEqual(result['streetVerifiedCells'], 0)

    def test_exact_empty_building_import_retains_inferred_facade_and_provenance(self):
        ring = [[10, 10], [20, 10], [20, 20], [10, 20]]
        geometry = [dict(lat=LAT0 - z / KZ, lon=LON0 + x / KX) for x, z in ring + [ring[0]]]
        atomic_pack(self.packs / 'p0_0.pack.wasm', dict(tiles={'0_0': dict(i=0, j=0, boards=[],
                    buildings=[dict(id='building', ring=ring)],
                    roads=[dict(pts=[[0, 0], [30, 0]], w=8, elev=[0, 0], name='Test road')])}))
        record = dict(type='way', id=3, geometry=geometry, tags=dict(name='Mapped cafe', amenity='cafe', building='yes'))
        result = self.run_worker(fetcher=lambda c, e, n: evidence_for(c, [record]))
        self.assertEqual(result['recordedApplyResults']['new_names'], 1)
        board = read_pack(self.packs / 'p0_0.pack.wasm')['tiles']['0_0']['boards'][0]
        self.assertEqual(board['verification'], 'mapped_name_exact_building_inferred_facade')
        self.assertEqual(board['sources'][0]['id'], 'way/3')
        self.assertEqual(read_pack(self.core)['packs'][0]['bytes'], (self.packs / 'p0_0.pack.wasm').stat().st_size)

    def test_failed_request_persists_backoff_and_never_marks_cell_complete(self):
        calls = []
        def fail(cell, endpoint, now):
            calls.append(now)
            raise HTTPError(endpoint, 429, 'rate limited', {'Retry-After': '120'}, None)
        first = self.run_worker(fetcher=fail)
        self.assertEqual(first['processedCells'], 0)
        self.assertEqual(first['retryCells'], 1)
        self.assertEqual(first['fetchedCells'], 0)
        self.run_worker(fetcher=fail)
        self.assertEqual(len(calls), 1)
        self.assertEqual(self.clock.sleeps, [])
        state = json.loads((self.state / 'status.json').read_text())
        self.assertEqual(state['cells']['tile_0_0']['retryAt'], self.clock() + 120)
        self.clock.now += 120
        done = self.run_worker(fetcher=lambda c, e, n: evidence_for(c))
        self.assertEqual(done['processedCells'], 1)
        self.assertEqual(done['retryCells'], 0)

    def test_interrupted_apply_reuses_cached_evidence_and_report(self):
        fetches, applies = [], []
        def fetch(cell, endpoint, now):
            fetches.append(cell['id'])
            return evidence_for(cell)
        def apply(reports, packs):
            applies.append(reports)
            if len(applies) == 1:
                raise OSError('simulated interrupted pack write')
            return apply_reports(reports, packs)
        first = self.run_worker(fetcher=fetch, applier=apply)
        self.assertEqual(first['fetchedCells'], 1)
        self.assertEqual(first['processedCells'], 0)
        self.clock.now += 60
        second = self.run_worker(fetcher=fetch, applier=apply)
        self.assertEqual(second['processedCells'], 1)
        self.assertEqual(len(fetches), 1)
        self.assertEqual(applies[0], applies[1])

    def test_stale_report_is_rejected_without_applying(self):
        plan = make_plan(read_pack(self.core))
        cell = plan['cells'][0]
        atomic_json(self.state / 'evidence/tile_0_0.json', evidence_for(cell))
        atomic_json(self.state / 'reports/tile_0_0.json', dict(evidenceSha256='wrong', summary={}, records=[]))
        def forbidden(*args, **kwargs):
            self.fail('Corrupt/stale report must never be applied')
        result = self.run_worker(fetcher=forbidden, applier=forbidden)
        self.assertEqual(result['retryCells'], 1)
        self.assertEqual(result['processedCells'], 0)

    def test_crash_after_fetch_resumes_that_cell_before_new_work(self):
        atomic_pack(self.core, core_fixture(((0, 0), (1, 0))))
        plan = make_plan(read_pack(self.core))
        cell = plan['cells'][0]
        atomic_json(self.state / 'evidence' / f"{cell['id']}.json", evidence_for(cell))
        state = load_state(self.state, plan)
        state['cursor'] = 1
        state['cells'][cell['id']] = dict(status='fetched', fetchedAt='2026-10-23T00:00:00Z')
        atomic_json(self.state / 'status.json', state)
        result = self.run_worker(max_cells=1, fetcher=lambda *a: self.fail('Already fetched cell should resume first'))
        self.assertEqual(result['processedCells'], 1)
        saved = json.loads((self.state / 'status.json').read_text())
        self.assertEqual(saved['cells'][cell['id']]['status'], 'processed')

    def test_lock_prevents_overlapping_runs(self):
        with run_lock(self.state):
            with self.assertRaisesRegex(RuntimeError, 'Another citywide'):
                self.run_worker(fetcher=lambda *a: self.fail('Must not fetch under another lock'))

    def test_changed_playable_map_requires_separate_audit_state(self):
        self.run_worker(fetcher=lambda c, e, n: evidence_for(c))
        atomic_pack(self.core, core_fixture(((0, 0), (1, 0))))
        with self.assertRaisesRegex(ValueError, 'layout changed'):
            self.run_worker(dry_run=True)


if __name__ == '__main__':
    unittest.main()
