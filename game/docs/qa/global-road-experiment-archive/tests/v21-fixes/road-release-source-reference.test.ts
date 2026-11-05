import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_ROAD_STAGE_DATA } from '../../src/world/road-source-stage';
import { legacyRoadReference } from '../../scripts/qa/road-source-reference';
import { geographicRoadReferences,type GeographicSourceReference } from '../../scripts/qa/road-source-reference';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dataSHA=createHash('sha256').update(readFileSync('src/world/road-source-geodesic-data.json')).digest('hex');
const geographic=JSON.parse(readFileSync('docs/qa/evidence/reported-roads/geodetic-historical-reference-9413-20261103.json','utf8'))as GeographicSourceReference;

test('corrected-source coordinates map to immutable historical edge coordinates without clamping repaired cuts',()=>{
  const reference=legacyRoadReference(SOURCE_ROAD_STAGE_DATA);
  let extendedBefore=0,extendedAfter=0;
  for(const road of SOURCE_ROAD_STAGE_DATA.roads){
    const oldLength=road.expected.pts.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-road.expected.pts[i][0],p[1]-road.expected.pts[i][1]),0);
    for(let i=0;i<road.correctedArc.length;i++){
      const expected=road.sourceArc[i],actual=reference(road.id,road.correctedArc[i]);
      assert.ok(Math.abs(actual-expected)<1e-9,`${road.id}:${i}`);
      if(expected<0){extendedBefore++;assert.ok(actual<0);}
      if(expected>oldLength+1e-7){extendedAfter++;assert.ok(actual>oldLength);}
      if(i){const at=(road.correctedArc[i-1]+road.correctedArc[i])/2;
        assert.ok(Math.abs(reference(road.id,at)-(road.sourceArc[i-1]+expected)/2)<1e-9,`${road.id}:interior${i}`);}
    }
  }
  assert.ok(extendedBefore>0,'Real resegmented starts retain their negative former-edge coordinates');
  assert.ok(extendedAfter>0,'Real resegmented ends may extend beyond the former same-ID piece');
});

test('source-reference mapping rejects invalid or out-of-domain new coordinates rather than hiding a stage error',()=>{
  const reference=legacyRoadReference(SOURCE_ROAD_STAGE_DATA),road=SOURCE_ROAD_STAGE_DATA.roads[0];
  assert.equal(reference('unmodified-road',42.5),42.5);
  for(const invalid of[NaN,Infinity,-Infinity])assert.throws(()=>reference(road.id,invalid),/Invalid corrected/);
  assert.throws(()=>reference(road.id,-.01),/outside/);
  assert.throws(()=>reference(road.id,road.correctedArc.at(-1)!+.01),/outside/);
});

test('geographic sibling references use actual old cuts and the exact full Overture source UUID',()=>{
  const reference=geographicRoadReferences(SOURCE_ROAD_STAGE_DATA,geographic,dataSHA);
  assert.deepEqual(reference.unresolved,[]);
  const left=SOURCE_ROAD_STAGE_DATA.roads.find(p=>p.id==='370065ed-0cb_0')!,right=SOURCE_ROAD_STAGE_DATA.roads.find(p=>p.id==='370065ed-0cb_1')!;
  const a=reference.corrected(left.id,[left.correctedArc.at(-1)!,left.correctedArc.at(-1)!])!,b=reference.corrected(right.id,[0,0])!;
  assert.equal(a.id,left.sourceSegmentID);assert.equal(b.id,left.sourceSegmentID);assert.equal(a.id.length,36);
  assert.ok(Math.abs(a.arc[0]-b.arc[0])<1e-7,'Both corrected sibling pieces agree on one official source position');
  const old=reference.historical(right.id,[0,0])!;
  assert.ok(Math.abs(old.arc[0]-b.arc[0])>13,'The old raw-degree cut is NOT the declared/corrected cut');
  const bad=structuredClone(geographic),record=bad.roads.find(p=>p.id===right.id)!;
  const source=SOURCE_ROAD_STAGE_DATA.sources.find(s=>s.id===right.sourceSegmentID)!;
  record.legacyOfficialMetres[0]=right.legacyPointFractions[0]*source.geodeticLengthM;
  assert.throws(()=>geographicRoadReferences(SOURCE_ROAD_STAGE_DATA,bad,dataSHA),/declared\/inherited/);
  const lookalike=structuredClone(geographic);lookalike.roads[0].sourceSegmentID=lookalike.roads[0].sourceSegmentID.slice(0,12)+'-0000-0000-0000-000000000000';
  assert.throws(()=>geographicRoadReferences(SOURCE_ROAD_STAGE_DATA,lookalike,dataSHA),/Unbound geographic/);
});

test('missing and ambiguous source bindings stay explicitly unresolved instead of becoming a road-family waiver',()=>{
  const partial=structuredClone(geographic),missing=partial.roads.shift()!;partial.unresolved.push({id:missing.id,reason:'Ambiguous distinct geographic loop branches'});
  const reference=geographicRoadReferences(SOURCE_ROAD_STAGE_DATA,partial,dataSHA);
  assert.equal(reference.corrected(missing.id,[0,0]),undefined);assert.equal(reference.historical(missing.id,[0,0]),undefined);
  assert.deepEqual(reference.unresolved,partial.unresolved);
  assert.throws(()=>geographicRoadReferences(SOURCE_ROAD_STAGE_DATA,geographic,'0'.repeat(64)),/Unbound geographic/);
  const wrong=structuredClone(geographic);wrong.policy.legacyPointFractionsUsed=true;
  assert.throws(()=>geographicRoadReferences(SOURCE_ROAD_STAGE_DATA,wrong,dataSHA),/Unbound geographic/);
});
