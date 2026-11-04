"""Exercise the real read-only producer with a literal source/map fixture."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
FIXTURE=json.loads((ROOT/'tests/fixtures/source-sainikpuri-railway-bridges.json').read_text())

class SourceRailCrossings(unittest.TestCase):
    def run_producer(self, fixture):
        with tempfile.TemporaryDirectory() as directory:
            args=[sys.executable,str(ROOT/'scripts/qa/audit-source-railway-bridge-crossings.py')]
            for key in ['model','source-data','source-reference','current-rail-source']:
                path=Path(directory)/(key+'.json');path.write_text(json.dumps(fixture[key]));args+=['--'+key,str(path)]
            out=Path(directory)/'report.json';args+=['--output',str(out)]
            result=subprocess.run(args,capture_output=True,text=True)
            return result, json.loads(out.read_text()) if out.exists() else None

    def test_actual_two_beams_and_two_carriageways_match_original_geography(self):
        result,out=self.run_producer(FIXTURE)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(len(out['crossings']),4)
        self.assertFalse(out['releaseApproved'])
        for row in out['crossings']:
            self.assertEqual(row['classification'],'research-confirmed-road-below-source-rail-bridge-needs-model-review')
            self.assertLess(row['nearestOriginalCrossingDifferenceM'],.2)
        self.assertTrue(all(r['sourceGeometryMatches'] for r in out['railways']))

    def test_missing_used_road_remains_unknown_instead_of_ground_authority(self):
        fixture=copy.deepcopy(FIXTURE);ref=fixture['source-reference'];ref['rows']=ref['rows'][1:];ref['requestedPrefixes']=[r['id'][:12]for r in ref['rows']]
        result,out=self.run_producer(fixture)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(len(out['missingRoadSourcePrefixes']),1)
        self.assertEqual(out['summary']['unresolved-road-source-metadata'],2)

    def test_incomplete_field_is_rejected(self):
        fixture=copy.deepcopy(FIXTURE);del fixture['source-reference']['rows'][0]['road_flags']
        result,out=self.run_producer(fixture)
        self.assertNotEqual(result.returncode,0);self.assertIsNone(out)

    def test_a_road_bridge_does_not_receive_underpass_authority(self):
        fixture=copy.deepcopy(FIXTURE)
        for row in fixture['source-reference']['rows']:row['level_rules']=[{'value':1}];row['road_flags']=[{'values':['is_bridge']}]
        result,out=self.run_producer(fixture)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(out['summary'],{'unresolved-annotated-road-relative-order':4})

    def test_changed_rail_geometry_or_unknown_order_remains_unresolved(self):
        for changed_geometry in [False,True]:
            fixture=copy.deepcopy(FIXTURE)
            if changed_geometry:
                for rail in fixture['model']['profiles']:rail['pts']=[[x,z+2]for x,z in rail['pts']]
            else:
                for way in fixture['current-rail-source']['ways']:way['tags'].pop('layer')
            result,out=self.run_producer(fixture)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertTrue(out['crossings'])
            self.assertTrue(all(r['classification'].startswith('unresolved-') for r in out['crossings']))

    def test_existing_below_and_above_roads_keep_their_own_review_scope(self):
        for height,status in [(-6.5,'retained-existing-below-rail-facility'),(6.8,'retained-existing-raised-road')]:
            fixture=copy.deepcopy(FIXTURE)
            for road in fixture['model']['roads']:road['elev']=[height]*len(road['pts'])
            result,out=self.run_producer(fixture)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(out['summary'],{status:4})

if __name__=='__main__':unittest.main()
