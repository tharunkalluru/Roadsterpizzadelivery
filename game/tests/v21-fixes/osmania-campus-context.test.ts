import test from 'node:test';
import assert from 'node:assert/strict';
import {inOsmaniaCampus,osmaniaAcademicBuilding} from '../../src/world/osmania-campus-context';
import {OSMANIA_UNIVERSITY_PLAN as plan} from '../../src/world/osmania-university';
import {packedDriveWorld} from '../fixtures/release-packed-drive-world';

test('published full campus boundary and named-source bindings retain exact native geometry ownership',()=>{
 assert.equal(plan.sourceCoverage.buildings,297);assert.equal(plan.sourceCoverage.roadsAndPaths,452);
 assert.equal(plan.nativeSourceCoverage.buildingIDs,1429);assert.equal(plan.nativeSourceCoverage.academicBindings,15);
 assert.equal(inOsmaniaCampus(3188.103,-1366.926),true);assert.equal(inOsmaniaCampus(-1472,2664),false);
 for(const b of plan.academicBuildings){assert.equal(osmaniaAcademicBuilding(b.buildingId)?.name,b.name);assert.match(b.source,/openstreetmap.org\/(node|way)\//);assert.ok(b.ring.length>=3);}
 assert.equal(osmaniaAcademicBuilding('unrelated-house'),undefined);
});
test('actual campus tiles emit no synthetic storefront signs and retain grounded named academic blocks',()=>{
 let synthetic=0,academic=0,tiles=0;
 packedDriveWorld({x:3100,z:-1000},true,{onBuiltTile(tile){tiles++;
  for(const s of tile.signs){if(inOsmaniaCampus(s.c[0],s.c[2])&&s.id.startsWith('f_'))synthetic++;if(s.id.startsWith('ou_academic_'))academic++;}
 }});
 assert.ok(tiles>=4);assert.equal(synthetic,0);assert.ok(academic>=3,'verified library/faculty/hostel source labels must survive in their own tile');
});
test('official OU library frontage replaces the invented domed model while preserving its concave native plan',async()=>{
 const {placeLandmarks,drawLandmark,inClear}=await import('../../src/world/landmarks');const {initTemplates,TiledBatch}=await import('../../src/core/util');initTemplates();
 const l=placeLandmarks({lat:17.4063,lon:78.4966}).find(l=>l.id==='ou_library')!;const B=Object.fromEntries(['st','wall','roof'].map(k=>[k,new TiledBatch()])),labels:string[]=[];
 drawLandmark(l,{B,solid(){},obstacle(){},road:()=>false,roadY:()=>null,sign:(_id,text)=>labels.push(text)});
 assert.ok(labels.some(s=>s.includes('AMBEDKAR LIBRARY')));assert.ok(labels.some(s=>s.includes('OSMANIA UNIVERSITY')));
 let top=0;for(const batch of Object.values(B))for(const tile of batch.tiles.values())for(let i=1;i<tile.pos.length;i+=3)top=Math.max(top,tile.pos[i]);
 assert.ok(top<9,'flat source-height frontage cannot acquire generic dome/tower geometry');
 assert.equal(inClear(l,l.x!+200,l.z!+200),false,'library must not erase adjacent campus grounds');
});
