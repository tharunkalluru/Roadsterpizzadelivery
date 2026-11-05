import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import mapped from '../../src/world/bridge-level-data.json';
import cuts from '../../src/world/road-source-geodesic-data.json';
import { mappedRoadLevelControls, mappedRoadLevels } from '../../src/world/road-crossing-levels';
import type { RoadEdge } from '../../src/world/types';

const core=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
test('legacy source-level bindings keep their coordinate-guarded indices on all eight surveyed source records', () => {
  for(const row of mapped.roads){const e=core.roads.find((e:RoadEdge)=>e.id===row.id),controls=mappedRoadLevelControls(e);
    const expected=row.points.filter(([i,x,z])=>e.pts[i]&&Math.hypot(e.pts[i][0]-x,e.pts[i][1]-z)<=.15).map(p=>[p[0],p[3]]);
    assert.deepEqual([...controls],expected);}
});
test('corrected source cuts bind both floor and relative-order controls by proved full-source fractions',t=>{
  const rows=[];
  for(const[id,lo,hi]of[['31e75bc6-6a2_1',.343675736,.798489286],['ba4a6d02-2fa_3',.165791931,.549705841]]as const){
    const patch=cuts.roads.find(p=>p.id===id)!,raw=core.roads.find((e:RoadEdge)=>e.id===id),e={...raw,pts:patch.pts,elev:patch.elev}as RoadEdge;
    const expected=patch.sourceFractions.flatMap((f,i)=>f>=lo-1e-12&&f<=hi+1e-12?[[i,6.8]]:[]),controls=mappedRoadLevelControls(e);
    assert.deepEqual([...controls],expected);assert.ok(controls.size>mapped.roads.find(p=>p.id===id)!.points.length,'Preserve floors at added official interior controls');
    const result=mappedRoadLevels([e]);for(const[i,floor]of controls)assert.ok(result.roads[0].elev![i]>=floor);
    const stale={...e,pts:e.pts.map(p=>[p[0]+100,p[1]]as[number,number])};assert.equal(mappedRoadLevelControls(stale).size,0,'A same-ID shifted road cannot inherit old index facts');
    rows.push({id,oldPoints:raw.pts.length,correctedPoints:e.pts.length,oldMapped:mapped.roads.find(p=>p.id===id)!.points.length,newMapped:controls.size});
  }
  t.diagnostic(JSON.stringify(rows));
});
