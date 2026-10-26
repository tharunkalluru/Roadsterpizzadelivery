import copy
import gzip
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from durgam_geometry import prepare,apply,load,ROOT
from orr_geometry import atomic_pack

class DurgamGeometryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core=load(ROOT/'game/public/city/core.pack.wasm')
        cls.evidence=json.loads((ROOT/'pipeline/evidence/durgam-roads-2026-10-26.json').read_text())

    def test_primary_sources_match_five_existing_carriageway_edges(self):
        before=copy.deepcopy(self.core['roads']);patches,report=prepare(self.core,self.evidence)
        self.assertEqual(len(patches),5);self.assertEqual(report['sourceWays'],6)
        self.assertTrue(all(m['sampleCoverageWithin5m']>=.95 and m['p95Distance']<.1 for m in report['matches']))
        self.assertTrue(all(p['lanes']==3 and p['w']==9.6 for p in patches.values()))
        self.assertEqual(before,self.core['roads'],'preparation must not mutate road data or XY')

    def test_all_copies_preserve_xy_and_unrelated_data_and_are_idempotent(self):
        patches,_=prepare(self.core,self.evidence);roads=[copy.deepcopy(e)for e in self.core['roads']if e['id']in patches]
        unrelated={'id':'unrelated','name':'Retained road','pts':[[10,20],[30,40]],'lanes':2,'w':7.6}
        for e in roads:e.update(lanes=2,w=7.6);e.pop('laneEvidence',None)
        zone={'roads':roads+[dict(e,ctx=1,name=None)for e in roads]+[unrelated],'boards':[{'text':'EXISTING SHOP','source':'retained'}],'buildings':[{'id':'existing'}]}
        before=copy.deepcopy(zone)
        with tempfile.TemporaryDirectory()as directory:
            city=Path(directory);atomic_pack(city/'pack.wasm',{'tiles':{'0_0':zone}})
            core={'packs':[{'file':'pack.wasm','bytes':0}],'roads':copy.deepcopy(roads)+[unrelated]};atomic_pack(city/'core.pack.wasm',core)
            report=apply(city,core,patches);self.assertEqual(report['roadCopiesUpdated'],10)
            after=load(city/'pack.wasm')['tiles']['0_0'];self.assertEqual(after['boards'],before['boards']);self.assertEqual(after['buildings'],before['buildings'])
            for old,new in zip(before['roads'],after['roads']):
                self.assertEqual(old['pts'],new['pts']);self.assertEqual(old.get('ctx'),new.get('ctx'))
                if old['id']in patches:self.assertEqual(new['lanes'],3);self.assertEqual(new['w'],9.6)
                else:self.assertEqual(new,old)
            self.assertEqual(core['packs'][0]['bytes'],(city/'pack.wasm').stat().st_size)
            first={p.name:p.read_bytes()for p in city.iterdir()};again=apply(city,core,patches)
            self.assertEqual(again['roadCopiesUpdated'],0);self.assertEqual(first,{p.name:p.read_bytes()for p in city.iterdir()})

    def test_incomplete_evidence_refuses_to_apply(self):
        bad=copy.deepcopy(self.evidence)
        for e in bad['elements']:e['tags'].pop('lanes',None)
        with self.assertRaises(ValueError):prepare(self.core,bad)

if __name__=='__main__':unittest.main()
