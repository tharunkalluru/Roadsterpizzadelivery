"""Actual frozen-corpus invariants for provisional recovered masses."""
import hashlib,json,unittest
from pathlib import Path
from shapely.geometry import Polygon,LineString
from shapely.ops import unary_union
from shapely.strtree import STRtree
from build import fallback_height

BASE=Path(__file__).resolve().parents[2]/'public/world/hyd-metro/v2'
class ActualGeometryTests(unittest.TestCase):
 def test_every_safe_component_stays_in_source_and_clears_same_level_road(self):
  manifest=json.loads((BASE/'manifest.json').read_text());data=json.loads((BASE/'source-accuracy.json').read_text());core=json.loads((BASE/manifest['core']['file']).read_text());repairs={k:v['geometry'] for k,v in data['buildings'].items() if 'geometry' in v}
  masks=[];heights=[]
  for r in core['roads']:
   if r.get('tunnel'):continue
   for i,(a,b) in enumerate(zip(r['points'],r['points'][1:])):
    if a==b:continue
    masks.append(LineString([a,b]).buffer(r['widthM']/2+.35,quad_segs=32));heights.append((min(r['pointElevM'][i:i+2]),max(r['pointElevM'][i:i+2])))
  tree=STRtree(masks);count=0
  for ref in manifest['chunks']:
   raw=(BASE/ref['file']).read_bytes();self.assertEqual(hashlib.sha256(raw).hexdigest(),ref['sha256'])
   for b in json.loads(raw)['buildings']:
    repair=repairs.get(b['id'])
    if not repair:continue
    original=Polygon(b['footprint'],b.get('holes'));facts=data['buildings'][b['id']];source=facts.get('source',{});height=source.get('heightM') or (source.get('numFloors',0)*3.2+.6 if source.get('numFloors') else facts.get('satellite',{}).get('heightM',fallback_height(source.get('class') or source.get('subtype') or b['kind'])))
    relevant=[int(i) for i in tree.query(original) if heights[int(i)][0]<=height+1 and heights[int(i)][1]>=-.25];mask=unary_union([masks[i] for i in relevant])
    self.assertEqual(repair['geometryStatus'],'provisional');self.assertTrue(repair['sourceIds'])
    parts=[]
    for part in repair['parts']:
     shape=Polygon(part['footprint'],part.get('holes'));self.assertTrue(shape.is_valid,b['id']);self.assertGreaterEqual(shape.area,3,b['id']);self.assertLess(shape.difference(original.buffer(.0002)).area,.001,b['id']);self.assertLess(shape.intersection(mask).area,.001,b['id']);parts.append(shape);count+=1
    self.assertEqual(bool(parts),repair['status']!='unresolved',b['id'])
    self.assertLess(abs(unary_union(parts).area-sum(p.area for p in parts)),.001,b['id'])
  self.assertEqual(count,data['summary']['geometry']['safeComponents'])
if __name__=='__main__':unittest.main()
