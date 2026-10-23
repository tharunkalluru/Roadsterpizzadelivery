"""Offline readiness regressions; no credentials, network, or production pack writes."""
import gzip
import importlib.util
import io
from contextlib import redirect_stdout
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))
from mapillary_metadata import CITY, cells_for, parse_bbox, playable_bounds, prepare_metadata, prioritized_cells
from ocr_candidates import mapped_candidates, read_origin, to_ll, to_xz
from mapillary_access import load_token, dependency_status


class CandidateTests(unittest.TestCase):
    def fixture(self, root, origin=(17.43, 78.51)):
        packs = root / 'city' / 'packs'
        packs.mkdir(parents=True)
        (packs.parent / 'core.pack.wasm').write_bytes(gzip.compress(json.dumps(dict(origin=dict(lat=origin[0], lon=origin[1]), bounds=dict(minX=-33000, maxX=24000, minZ=-24000, maxZ=24000))).encode()))
        board = dict(id='business-1', text='Mapped Pharmacy', full='Mapped Pharmacy and Medical', a=[100, -200],
                     b=[120, -210], t=.25, building='b1', slot=dict(floor=0, index=0, of=1),
                     verification='mapped_name_exact_building_inferred_facade', sources=[dict(url='https://www.openstreetmap.org/way/1')])
        (packs / 'p0_0.pack.wasm').write_bytes(gzip.compress(json.dumps(dict(tiles={'0_0': dict(boards=[board])})).encode()))
        return packs, board

    def test_shipped_candidate_uses_manifest_origin_and_exporter_inverse(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); packs, board = self.fixture(root)
            candidate, = mapped_candidates(build=root / 'missing-build', packs=packs)
            kx = math.cos(math.radians(17.43)) * 6380050.094 * math.pi / 180
            kz = 6341141.900 * math.pi / 180
            self.assertAlmostEqual(candidate['lat'], 17.43 + 202.5 / kz)
            self.assertAlmostEqual(candidate['lon'], 78.51 + 105 / kx)
            self.assertEqual(candidate['uid'], board['id'])
            self.assertEqual(candidate['sources'], board['sources'])
            self.assertEqual(candidate['verification'], 'mapped_board_candidate_inferred_facade')
            self.assertEqual(candidate['existingVerification'], board['verification'])
            self.assertFalse((root / 'missing-build').exists())

    def test_projection_round_trip_on_edges_of_city(self):
        origin = (17.4063, 78.4966)
        for lat, lon in [(17.235, 78.245), (17.625, 78.665), origin]:
            got = to_ll(*to_xz(lat, lon, origin), origin)
            self.assertAlmostEqual(got[0], lat, places=12)
            self.assertAlmostEqual(got[1], lon, places=12)

    def test_playable_extent_is_not_clipped_to_the_legacy_mapillary_bbox(self):
        with tempfile.TemporaryDirectory() as tmp:
            packs, _ = self.fixture(Path(tmp))
            bounds = playable_bounds(packs)
            self.assertLess(bounds[1], CITY[1])
            self.assertGreater(bounds[3], CITY[3])
            cells = list(cells_for(bounds))
            self.assertLess(min(x for y, x in cells), CITY[1])
            self.assertGreater(max(x for y, x in cells), CITY[3])

    def test_original_placement_flags_are_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            original = dict(uid='legacy', status='placed', flags=['ambiguous'], name='Original name')
            (root / 'placements.json').write_text(json.dumps([original]))
            self.assertEqual(list(mapped_candidates(build=root, packs=root / 'absent')), [original])

    def test_missing_sources_are_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(RuntimeError, 'No placements.json'):
                list(mapped_candidates(build=tmp, packs=tmp))


@unittest.skipUnless(importlib.util.find_spec('rapidfuzz'), 'Matching requires the OCR virtual environment')
class MatchingProvenanceTests(unittest.TestCase):
    def test_locality_fragment_cannot_match_aakash_but_actual_brand_can(self):
        from ocr_match import core_business_name, distinctive_match
        core = core_business_name('Aakash Institute, Himayathnagar', 'Aakash Institute, Himayathnagar (Hyderabad)')
        self.assertEqual(core['tokens'], ['AAKASH'])
        self.assertIsNone(distinctive_match('NATHNAGAN', core))
        self.assertIsNone(distinctive_match('HIMAYATHNAGAR', core))
        self.assertEqual(distinctive_match('Aakash', core)['businessToken'], 'AAKASH')

    def test_locality_rule_generalizes_to_delimited_or_mapped_road_suffix(self):
        from ocr_match import core_business_name, distinctive_match
        core = core_business_name('Career Point - Himayatnagar', 'Career Point - Himayatnagar')
        self.assertIsNone(distinctive_match('HIMAYATNAGAR', core))
        self.assertIsNotNone(distinctive_match('CAREER POINT', core))
        mapped = core_business_name('Ravi Bakery Himayatnagar', road_name='Himayatnagar Road')
        self.assertIsNone(distinctive_match('HIMAYATNAGAR', mapped))
        self.assertIsNotNone(distinctive_match('RAVI BAKERY', mapped))

    def test_generic_descriptors_or_short_substrings_are_not_brand_evidence(self):
        from ocr_match import core_business_name, distinctive_match
        core = core_business_name('Fitness King Unisex')
        self.assertIsNone(distinctive_match('UNISEX', core))
        self.assertIsNone(distinctive_match('FITNESS', core))
        self.assertIsNone(distinctive_match('KINGDOM', core))
        self.assertIsNotNone(distinctive_match('KING', core))

    def test_dance_studio_descriptors_do_not_identify_the_operator(self):
        from ocr_match import core_business_name, distinctive_match
        core = core_business_name("Chandu's Wow Dance Studio")
        # The first two readings came from separate photos of this frontage;
        # matching STUDIO alone must not count as independent identity evidence.
        for reading in ['ANCE STUDIO', 'NESS STUDIO', 'DANCE STUDIO', 'FITNESS STUDIO']:
            with self.subTest(reading=reading):
                self.assertIsNone(distinctive_match(reading, core))
        program_name = core_business_name("Chandu's Wow Dance & Zumba Fitness Studio")
        self.assertIsNone(distinctive_match('ZUMBA', program_name))

    def test_dance_studio_distinctive_operator_and_short_brand_still_match(self):
        from ocr_match import core_business_name, distinctive_match
        core = core_business_name("Chandu's Wow Dance & Zumba Fitness Studio")
        self.assertEqual(distinctive_match("CHANDU'S FITNESS", core)['businessToken'], 'CHANDU')
        self.assertEqual(distinctive_match('WOW DANCE & ZUMBA', core)['businessToken'], 'WOW')
        full_sign = distinctive_match("CHANDU'S WOW DANCE & ZUMBA FITNESS STUDIO", core)
        self.assertIn(full_sign['businessToken'], {'CHANDU', 'WOW'})

    def test_full_token_ocr_error_is_a_review_candidate(self):
        from ocr_match import core_business_name, distinctive_match
        self.assertEqual(distinctive_match('SZUKI', core_business_name('Maanya Suzuki'))['businessToken'], 'SUZUKI')
        self.assertEqual(distinctive_match('ONANDU O', core_business_name('Nandu Juice Centre'))['businessToken'], 'NANDU')

    def test_ias_course_label_cannot_identify_a_different_institute(self):
        from ocr_match import core_business_name, distinctive_match
        core = core_business_name('ANALOG IAS')
        # Photo 285967769835428 shows a clipped REER IAS sign, not ANALOG.
        self.assertIsNone(distinctive_match('REER IAS', core))
        self.assertEqual(distinctive_match('ANALOG IAS', core)['businessToken'], 'ANALOG')

    def test_service_descriptor_cannot_identify_an_unrelated_business(self):
        from ocr_match import core_business_name, distinctive_match
        core = core_business_name('Home Cleaning Services')
        # Photo 518601855834410 shows e-Filing Services, not a cleaning identity.
        for reading in ['e-Filing Service', 'e-Filing Services']:
            with self.subTest(reading=reading):
                self.assertIsNone(distinctive_match(reading, core))
        branded = core_business_name('Sparkle Home Cleaning Services')
        self.assertEqual(distinctive_match('SPARKLE HOME CLEANING SERVICES', branded)['businessToken'], 'SPARKLE')

    def test_consultancy_descriptor_cannot_identify_iaec(self):
        from ocr_match import core_business_name, distinctive_match
        core = core_business_name('IAEC Consultants Private Limited', 'IAEC Consultants Private Limited (Head Office )')
        # Photo 908926379957946 shows an automobile Fincorp business, not IAEC.
        for reading in ['Certified Automabile Consultants)', 'CONSULTANTS', 'CONSULTANT', 'CONSULTANCY']:
            with self.subTest(reading=reading):
                self.assertIsNone(distinctive_match(reading, core))
        for reading in ['IAEC', 'IAEC Consultants Private Limited']:
            with self.subTest(reading=reading):
                self.assertEqual(distinctive_match(reading, core)['businessToken'], 'IAEC')

    def test_estate_or_state_alone_cannot_identify_state_bank_of_india(self):
        from ocr_match import core_business_name, distinctive_match
        core = core_business_name('State Bank of India', 'State Bank of India - Parishrama Bhavan')
        # Photo 491136119004032 shows GUPTA ESTATE beside Jagdamba Jewellers.
        for reading in ['ESTATE', 'GUPTA ESTATE', 'STATE', 'STATE BANK', 'STATE BANK OF HYDERABAD',
                        'ESTATE BANK OF INDIA', 'STATE BANK OF INDIANA', 'XSBI', 'SBIS']:
            with self.subTest(reading=reading):
                self.assertIsNone(distinctive_match(reading, core))

    def test_exact_sbi_and_full_bank_identity_are_retained(self):
        from ocr_match import core_business_name, distinctive_match
        for board, full in [('State Bank of India', 'State Bank of India - Parishrama Bhavan'),
                            ('SBI', 'State Bank of India - Parishrama Bhavan')]:
            core = core_business_name(board, full)
            for reading in ['SBI', 'SBI ATM', 'State Bank of India', 'STATE  BANK OF INDIA Parishrama Bhavan']:
                with self.subTest(board=board, reading=reading):
                    match = distinctive_match(reading, core)
                    self.assertIsNotNone(match)
                    self.assertEqual(match['similarity'], 100)
        # Do not infer an acronym or override contradictory mapped identity.
        unrelated = core_business_name('SBI', 'Some Business Institute')
        self.assertIsNone(distinctive_match('State Bank of India', unrelated))

    def test_short_sbi_reading_survives_pipeline_filter_without_estate_match(self):
        import ocr_match
        with tempfile.TemporaryDirectory() as tmp:
            board = dict(uid='bank', status='placed', flags=[], name='State Bank of India - Parishrama Bhavan',
                         board='State Bank of India', facade_ll=[[17.40648, 78.49655], [17.40648, 78.49665]],
                         facade=dict(t=.5))
            record = dict(image='fixture', captured_at=1700000000000, lat=17.4063, lon=78.4966,
                          compass=0, w=100, h=100, texts=[dict(text=text, conf=.99,
                          box=[[40, 30], [60, 30], [60, 40], [40, 40]]) for text in ['ESTATE', 'SBI']])
            with patch.object(ocr_match, 'BUILD', tmp), patch.object(ocr_match, 'load_records', return_value={'fixture': record}), \
                 patch.object(ocr_match, 'mapped_candidates', return_value=[board]), redirect_stdout(io.StringIO()):
                ocr_match.main()
            match = json.loads((Path(tmp) / 'ocr_matches.json').read_text())['bank']
            self.assertEqual(match['matchedText'], 'SBI')
            self.assertEqual(match['seen'], 1)
            self.assertEqual(match['verification'], 'automated_photo_match_candidate')
            self.assertEqual(match['sources'][0]['url'], 'https://www.mapillary.com/app/?pKey=fixture')

    def test_fallback_match_remains_candidate_with_original_photo_source(self):
        import ocr_match
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            packs, _ = CandidateTests().fixture(root, origin=(17.4063, 78.4966))
            pack = packs / 'p0_0.pack.wasm'
            data = json.loads(gzip.decompress(pack.read_bytes()))
            board = data['tiles']['0_0']['boards'][0]
            board.update(text='Bawarchi Restaurant', full='Bawarchi Restaurant', a=[-5, -20], b=[5, -20], t=.5)
            pack.write_bytes(gzip.compress(json.dumps(data).encode()))
            record = dict(image='123', captured_at=1700000000000, sequence='source-run', lat=17.4063, lon=78.4966,
                          compass=0, w=100, h=100, texts=[dict(text='Bawarchi Restaurant', conf=.99,
                          box=[[40, 30], [60, 30], [60, 40], [40, 40]])])
            with patch.object(ocr_match, 'BUILD', tmp), patch.object(ocr_match, 'load_records', return_value={'123': record}), \
                 patch.object(ocr_match, 'mapped_candidates', side_effect=lambda build: mapped_candidates(build, packs)), redirect_stdout(io.StringIO()):
                ocr_match.main()
            match = json.loads((root / 'ocr_matches.json').read_text())['business-1']
            self.assertEqual(match['matchedText'], 'Bawarchi Restaurant')
            self.assertGreater(match['matchScore'], 0)
            reading, = match['matchedReadings']
            self.assertEqual(reading['rawText'], 'Bawarchi Restaurant')
            self.assertEqual(reading['businessToken'], 'BAWARCHI')
            self.assertEqual(reading['textSimilarity'], 100)
            self.assertEqual(match['verification'], 'automated_photo_match_candidate')
            self.assertEqual(match['placement_verification'], 'mapped_board_candidate_inferred_facade')
            self.assertEqual(match['sources'][0]['url'], 'https://www.mapillary.com/app/?pKey=123')
            self.assertEqual(match['sources'][0]['capturedAt'], record['captured_at'])
            report = json.loads((root / 'ocr_report.json').read_text())
            self.assertEqual(report['boards_with_automated_photo_matches'], 1)
            self.assertNotIn('boards_confirmed', report)
            self.assertFalse((root / 'placements.json').exists())


class AccessTests(unittest.TestCase):
    def test_environment_overrides_keychain_without_invoking_it(self):
        with patch.dict(os.environ, {'MAPILLARY_TOKEN': ' fixture '}), patch('mapillary_access.subprocess.run') as run:
            self.assertEqual(load_token(), 'fixture')
            run.assert_not_called()
        with patch.dict(os.environ, {'MAPILLARY_TOKEN': ''}), patch('mapillary_access.subprocess.run') as run:
            self.assertIsNone(load_token())
            run.assert_not_called()

    def test_keychain_is_scoped_captured_and_missing_is_graceful(self):
        env = {k: v for k, v in os.environ.items() if k != 'MAPILLARY_TOKEN'}
        with patch.dict(os.environ, env, clear=True), patch('mapillary_access.sys.platform', 'darwin'), patch('mapillary_access.subprocess.run') as run:
            run.return_value = subprocess.CompletedProcess([], 0, 'fixture\n', '')
            self.assertEqual(load_token(), 'fixture')
            self.assertEqual(run.call_args.args[0], ['/usr/bin/security', 'find-generic-password', '-a', 'thisistharun', '-s', 'codex-roadster-mapillary', '-w'])
            self.assertTrue(run.call_args.kwargs['capture_output'])
            run.return_value = subprocess.CompletedProcess([], 44, '', 'not found')
            self.assertIsNone(load_token())

    def test_missing_dependencies_are_named_without_importing_ocr(self):
        with patch('mapillary_access.importlib.util.find_spec', return_value=None):
            status = dependency_status()
            self.assertEqual(status['status'], 'missing_dependencies')
            self.assertIn('rapidocr-onnxruntime', status['missingPackages'])


class SelectionTests(unittest.TestCase):
    def module(self):
        with patch.dict(os.environ, {'MAPILLARY_TOKEN': ''}):
            import mapillary_ocr_fast
            return mapillary_ocr_fast

    def test_unmapped_streets_can_supply_missing_shop_names(self):
        module = self.module()
        image = dict(id='unnamed-road-photo', captured_at=1700000000000, sequence='s', geometry=dict(coordinates=[78.49, 17.40]))
        with patch.object(module, 'placement_density', return_value={}):
            self.assertEqual(module.pick_city([image]), [image])

    def test_completed_images_are_removed_before_selection_caps(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'ocr_rapid_city.shard-000-of-002.jsonl').write_text('{"image":"old"}\n')
            with patch.object(module, 'BUILD', tmp):
                self.assertEqual(module.pending_images([dict(id='old'), dict(id='new')]), [dict(id='new')])


class MetadataTests(unittest.TestCase):
    bounds = (17.235, 78.245, 17.245, 78.255)

    def photo(self, image_id, bbox):
        return dict(id=str(image_id), captured_at=1700000000000, thumb_1024_url='https://example.invalid/photo',
                    geometry=dict(coordinates=[(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]))

    def test_bbox_validation_and_stable_grid(self):
        self.assertEqual(len(list(cells_for(CITY))), 1638)
        self.assertEqual(list(cells_for(self.bounds)), [(17.235, 78.245)])
        for value in ['17,78,16,79', '17,78,18,77', 'nan,78,18,79', '17,78,18']:
            with self.assertRaises(ValueError): parse_bbox(value)

    def test_center_out_order_is_stable_when_bbox_changes(self):
        origin = (17.4063, 78.4966)
        cells = list(cells_for(CITY))
        ordered = prioritized_cells(cells, origin)
        self.assertLess(abs(ordered[0][0] + .005 - origin[0]), .01)
        self.assertLess(abs(ordered[0][1] + .005 - origin[1]), .01)
        subset = set(cells_for((17.398, 78.488, 17.412, 78.502)))
        self.assertEqual([c for c in ordered if c in subset], prioritized_cells(subset, origin))

    def test_city_preparation_is_bounded_and_resumes_next_cells(self):
        with tempfile.TemporaryDirectory() as tmp:
            calls = []
            def fetch(bbox, token, after):
                calls.append(bbox)
                return dict(data=[self.photo(len(calls), bbox)])
            first = prepare_metadata(max_cells=2, max_pages=1, build=tmp, token='fixture', fetch=fetch)
            self.assertEqual(len(calls), 8)
            self.assertEqual(first['metadata']['completedCells'], 2)
            first_boxes = set(calls)
            second = prepare_metadata(max_cells=2, max_pages=1, build=tmp, token='fixture', fetch=fetch)
            self.assertEqual(second['metadata']['completedCells'], 4)
            self.assertTrue(first_boxes.isdisjoint(set(calls[8:])))

    def test_paginated_partial_cell_resumes_without_persisting_secret_url(self):
        with tempfile.TemporaryDirectory() as tmp:
            calls = []
            def fetch(bbox, token, after):
                calls.append(after)
                result = dict(data=[self.photo(f'{bbox[0]}:{bbox[1]}:{after}', bbox)])
                if after is None:
                    result['paging'] = dict(next='https://graph.mapillary.com/images?after=second&access_token=SECRET', cursors=dict(after='second'))
                return result
            first = prepare_metadata(self.bounds, max_cells=1, max_pages=1, build=tmp, token='SECRET', fetch=fetch)
            self.assertEqual(first['metadata']['status'], 'partial')
            self.assertEqual(len(first['images']), 4)
            second = prepare_metadata(self.bounds, max_cells=1, max_pages=1, build=tmp, token='SECRET', fetch=fetch)
            self.assertEqual(second['metadata']['status'], 'complete')
            self.assertEqual(len(second['images']), 8)
            self.assertEqual(calls, [None] * 4 + ['second'] * 4)
            for path in Path(tmp).glob('*.json*'):
                self.assertNotIn('SECRET', path.read_text())

    def test_no_token_makes_no_requests_but_reuses_cached_images(self):
        with tempfile.TemporaryDirectory() as tmp:
            image = self.photo('cached', (78.245, 17.235, 78.25, 17.24))
            (Path(tmp) / 'mly_images_city.jsonl').write_text(json.dumps(dict(cell='17.235,78.245', imgs=[image])) + '\n')
            def no_network(*args): self.fail('No token must never make a network request')
            result = prepare_metadata(max_cells=1, build=tmp, token='', fetch=no_network)
            self.assertEqual(result['metadata']['status'], 'missing_token')
            self.assertFalse(result['metadata']['tokenConfigured'])
            self.assertEqual(result['images'], [image])

    def test_failures_remain_pending_and_do_not_reveal_exception_urls(self):
        with tempfile.TemporaryDirectory() as tmp:
            def fail(*args): raise RuntimeError('https://example.invalid?access_token=SECRET')
            result = prepare_metadata(self.bounds, max_cells=1, max_pages=1, build=tmp, token='SECRET', fetch=fail)
            self.assertEqual(result['metadata']['status'], 'partial_errors')
            self.assertEqual(result['metadata']['completedCells'], 0)
            self.assertEqual(result['metadata']['requests'], 4)
            self.assertNotIn('SECRET', json.dumps(result))
            self.assertFalse((Path(tmp) / 'mly_images_city.jsonl').exists())

    def test_prepare_cli_reports_missing_token_without_ocr_dependencies(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = dict(os.environ, PIPELINE_BUILD=tmp, ZONE='city')
            env['MAPILLARY_TOKEN'] = ''  # Explicitly bypass any configured local Keychain credential.
            manifest = Path(tmp) / 'nested' / 'manifest.json'
            result = subprocess.run([sys.executable, str(PIPELINE / 'mapillary_ocr_fast.py'), '--prepare', '--manifest', str(manifest), '--max-cells', '1'],
                                    env=env, capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
            data = json.loads(manifest.read_text())
            self.assertEqual(data['metadata']['status'], 'missing_token')
            self.assertEqual(data['images'], [])


if __name__ == '__main__': unittest.main()
