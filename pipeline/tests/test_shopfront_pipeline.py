import gzip
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ocr_state import heading, read_jsonl, shard_for, worker_lock
from shopfront_batch import KX, KZ, LAT0, LON0, apply_reports, atomic_pack, outline_distance, reconcile


class ResumeTests(unittest.TestCase):
    def test_stable_shards_are_disjoint_and_complete(self):
        ids = [str(i) for i in range(103)]
        parts = [{i for i in ids if shard_for(i, 4) == n} for n in range(4)]
        self.assertEqual(set.union(*parts), set(ids))
        self.assertEqual(sum(map(len, parts)), len(ids))

    def test_north_heading_is_not_replaced(self):
        self.assertEqual(heading({'computed_compass_angle': 0, 'compass_angle': 30}), 0)
        self.assertEqual(heading({'computed_compass_angle': None, 'compass_angle': 30}), 30)

    def test_interrupted_tail_repaired_without_losing_complete_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'worker.jsonl'
            p.write_bytes(b'{"image":"1"}\n{"imag')
            self.assertEqual(read_jsonl(p, repair_tail=True), [{'image': '1'}])
            self.assertEqual(p.read_bytes(), b'{"image":"1"}\n')

    def test_valid_unterminated_record_can_be_resumed(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'worker.jsonl'; p.write_text('{"image":"1"}')
            read_jsonl(p, repair_tail=True)
            with p.open('a') as f: f.write('{"image":"2"}\n')
            self.assertEqual(len(read_jsonl(p)), 2)

    def test_interior_corruption_fails_loudly(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'worker.jsonl'; p.write_text('BROKEN\n{"image":"1"}\n')
            with self.assertRaises(ValueError): read_jsonl(p, repair_tail=True)

    def test_two_workers_cannot_write_same_shard(self):
        with tempfile.TemporaryDirectory() as tmp:
            with worker_lock(Path(tmp) / 'one'):
                with self.assertRaises(RuntimeError):
                    with worker_lock(Path(tmp) / 'one'): pass


class EvidenceTests(unittest.TestCase):
    def mapped_building_fixture(self, packs, occupied=False):
        ring = [[10, 10], [20, 10], [20, 20], [10, 20]]
        geometry = [dict(lat=LAT0 - z / KZ, lon=LON0 + x / KX) for x, z in ring + [ring[0]]]
        board = dict(id='other', text='Existing shop', full='Existing shop', a=ring[0], b=ring[1], t=0.5, building='building', slot=dict(floor=0))
        atomic_pack(packs / 'p0_0.pack.wasm', dict(tiles={'0_0': dict(i=0, j=0, boards=[board] if occupied else [],
                    buildings=[dict(id='building', ring=ring)], roads=[dict(pts=[[0, 0], [30, 0]], w=8, elev=[0, 0], name='Test road')])}))
        return dict(schemaVersion=1, source='OpenStreetMap', retrievedAt='2026-10-23', sourceUrl='https://www.openstreetmap.org',
                    elements=[dict(type='way', id=3, center=dict(lat=LAT0 - 15 / KZ, lon=LON0 + 15 / KX), geometry=geometry,
                                   tags=dict(name='Mapped cafe', amenity='cafe', building='yes'))])

    def test_exact_empty_outline_can_gain_a_named_but_inferred_facade(self):
        with tempfile.TemporaryDirectory() as tmp:
            packs = Path(tmp); evidence = self.mapped_building_fixture(packs)
            report = reconcile(evidence, packs=packs)
            self.assertEqual(report['summary'], {'new_named_building': 1})
            board = report['records'][0]['board']
            self.assertEqual(board['verification'], 'mapped_name_exact_building_inferred_facade')
            self.assertEqual(board['sources'][0]['url'], 'https://www.openstreetmap.org/way/3')
            self.assertEqual(board['slot'], dict(floor=0, index=0, of=1))

    def test_exact_outline_with_existing_shops_requires_order_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            packs = Path(tmp); evidence = self.mapped_building_fixture(packs, occupied=True)
            report = reconcile(evidence, packs=packs)
            self.assertEqual(report['summary'], {'needs_street_photo_review': 1})
            self.assertIn('other ground-floor shops', report['records'][0]['reason'])

    def test_changed_outline_does_not_get_named_automatically(self):
        with tempfile.TemporaryDirectory() as tmp:
            packs = Path(tmp); evidence = self.mapped_building_fixture(packs)
            for p in evidence['elements'][0]['geometry']: p['lon'] += 4 / KX
            self.assertEqual(reconcile(evidence, packs=packs)['summary'], {'needs_street_photo_review': 1})

    def test_sharded_reconciliation_covers_the_same_source_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            packs = Path(tmp); evidence = self.mapped_building_fixture(packs)
            evidence['elements'] += [dict(type='node', id=i, lat=LAT0, lon=LON0, tags=dict(name=f'Source {i}', shop='yes')) for i in range(10)]
            whole = reconcile(evidence, packs=packs)
            records = [r for n in range(3) for r in reconcile(evidence, packs=packs, shards=3, shard=n)['records']]
            self.assertEqual(sorted(r['source']['id'] for r in records), sorted(r['source']['id'] for r in whole['records']))

    def test_outline_matching_is_direction_independent(self):
        ring = [[0, 0], [10, 0], [10, 10], [0, 10]]
        self.assertEqual(outline_distance(ring, list(reversed(ring))), 0)
        self.assertGreater(outline_distance(ring, [[x + 3, z] for x, z in ring]), 1.5)

    def test_point_alone_never_creates_a_new_frontage(self):
        with tempfile.TemporaryDirectory() as tmp:
            e = dict(schemaVersion=1, source='OpenStreetMap', retrievedAt='2026-10-23', sourceUrl='https://www.openstreetmap.org',
                     elements=[dict(type='node', id=1, lat=17.4063, lon=78.4966, tags=dict(name='Example shop', shop='yes'))])
            report = reconcile(e, packs=Path(tmp))
            self.assertEqual(report['summary'], {'needs_street_photo_review': 1})

    def test_apply_preserves_other_shops_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            packs = Path(tmp); pack = packs / 'p0_0.pack.wasm'
            original = dict(id='existing', text='Existing shop', full='Existing shop', building='b', slot=dict(floor=1))
            atomic_pack(pack, dict(tiles={'0_0': dict(boards=[original], buildings=[dict(id='b')])}))
            source = dict(provider='OpenStreetMap', id='way/3', name='Mapped name')
            board = dict(id='b_w3', text='Mapped name', building='b', slot=dict(floor=0), sources=[source])
            report = dict(records=[dict(status='new_named_building', pack=pack.name, tile='0_0', board=board)])
            self.assertEqual(apply_reports([report], packs)['new_names'], 1)
            before = pack.read_bytes(); self.assertEqual(apply_reports([report], packs), {})
            self.assertEqual(before, pack.read_bytes())
            boards = json.loads(gzip.decompress(before))['tiles']['0_0']['boards']
            self.assertEqual(boards[0], original); self.assertEqual(boards[1]['sources'], [source])

    def test_apply_rechecks_frontage_after_another_worker_changes_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            packs = Path(tmp); pack = packs / 'p0_0.pack.wasm'
            atomic_pack(pack, dict(tiles={'0_0': dict(boards=[dict(id='new-other', building='b', slot=dict(floor=0))], buildings=[dict(id='b')])}))
            report = dict(records=[dict(status='new_named_building', pack=pack.name, tile='0_0', board=dict(id='b_w3', building='b'))])
            self.assertEqual(apply_reports([report], packs), {'skipped_changed_frontage': 1})


if __name__ == '__main__': unittest.main()
