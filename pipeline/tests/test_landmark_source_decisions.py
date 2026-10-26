import hashlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landmark_source_decisions import ROOT, select_source


class ConservativeSourceTests(unittest.TestCase):
    def node(self, ident=1, **tags):
        return dict(type='node',id=ident,lat=17.4,lon=78.4,tags={'name':'Example Campus',**tags})

    def test_no_nearest_or_same_name_fallback(self):
        e,error=select_source([self.node(2,amenity='university')],'n1','Example Campus','campus')
        self.assertIsNone(e)
        self.assertIn('fallback-forbidden',error)

    def test_distant_same_name_branch_is_refused(self):
        e,error=select_source([self.node(1,amenity='university')],'n1','Example Campus','campus',anchor=(17.43,78.4),radius=150)
        self.assertIsNone(e)
        self.assertIn('distant-branch-refused',error)

    def test_transport_stop_cannot_be_park_or_civic_building(self):
        for tags,expected in [({'railway':'station'},'park'),({'highway':'bus_stop'},'building'),({'building':'train_station'},'park')]:
            e,error=select_source([self.node(**tags)],'n1','Example Campus',expected)
            self.assertIsNone(e)
            self.assertIn('wrong-feature-class',error)

    def test_campus_named_pond_is_refused(self):
        e,error=select_source([self.node(natural='water',water='pond')],'n1','Example Campus','campus')
        self.assertIsNone(e)
        self.assertIn('not-pond',error)

    def test_footprint_only_from_named_building_identity(self):
        other=dict(type='way',id=7,tags={'name':'Nearby unnamed purpose','building':'yes'},geometry=[{'lat':17.4,'lon':78.4}]*4)
        e,error=select_source([self.node(),other],'n1','Example Campus','building')
        self.assertIsNone(e)
        self.assertIn('no-building-footprint',error)
        e,error=select_source([self.node(),other],'w7','Example Campus','building')
        self.assertIsNone(e)
        self.assertIn('name-no-longer-matches',error)

    def test_saved_source_decisions_cover_every_id_and_exact_snapshot(self):
        ledger=json.loads((ROOT/'pipeline/evidence/landmark-source-decisions-2026-10-26.json').read_text())
        snapshot=ROOT/ledger['sourceSnapshot']
        self.assertEqual(hashlib.sha256(snapshot.read_bytes()).hexdigest(),ledger['sourceSha256'])
        self.assertEqual(len(ledger['entries']),191)
        self.assertEqual(len({r['id'] for r in ledger['entries']}),191)
        self.assertEqual(ledger['summary']['reviewedSourceIdentities']+ledger['summary']['noSafeSourceBinding'],191)
        self.assertEqual(sum('applicationChange' in r for r in ledger['entries']),7)
        charkaman=next(r for r in ledger['entries'] if r['id']=='charkaman')
        self.assertEqual(charkaman['decision'],'context-anchor-only')
        self.assertFalse(charkaman['sourceRefs'])
        self.assertEqual({r['id'] for r in charkaman['contextSourceRefs']},{'n4313322315','w576023427'})
        for row in ledger['entries']:
            if row['decision']=='no-safe-source-binding':
                self.assertFalse(row['sourceRefs'])
                self.assertTrue(row['refusals'])
            for ref in row['sourceRefs']:
                self.assertGreater(ref['version'],0)
                self.assertTrue(ref['timestamp'])


if __name__=='__main__': unittest.main()
