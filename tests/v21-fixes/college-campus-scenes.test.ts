import test from 'node:test';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { packedDriveWorld } from '../fixtures/release-packed-drive-world';
import { findGroundScenePlacement } from '../../src/delivery/scene-placement';
import { loadLevels } from '../../src/delivery/content/levels';
import { COLLEGE_CAMPUSES } from '../../src/world/college-campus-data';
import { placeLandmarks, drawLandmark, inClear } from '../../src/world/landmarks';
import { TiledBatch, initTemplates } from '../../src/core/util';

for(const [levelId,campusId] of [['hasini-college-gate','nizam_college'],['arjun-classroom','osmania_medical']] as const){
 test(`${campusId}: actual packed campus keeps its researched delivery anchor, not a vacant-lot substitute`,()=>{
  const level=loadLevels().find(l=>l.id===levelId)!;const p=COLLEGE_CAMPUSES[campusId].delivery;
  assert.equal(level.destination.x,p.x);assert.equal(level.destination.z,p.z);
  const {city,graph}=packedDriveWorld(p),fit=findGroundScenePlacement(city,graph,level);
  assert.ok(fit,`no clear car apron at the real ${campusId} entrance`);
  assert.equal(fit.destination.x,p.x);assert.equal(fit.destination.z,p.z);assert.equal(fit.moduleParams.realCampusId,campusId);
  const blocked={...city,obstacles:new Map([[`${Math.floor(p.x/50)},${Math.floor(p.z/50)}`,[{x:p.x,z:p.z,r:5,top:3}]]])};
  assert.equal(findGroundScenePlacement(blocked,graph,level),null,'an occupied real entrance waits; it must not move to another street');
 });
}
test('both college models use the mapped footprint, with open OMC courtyards and batched photo-specific facades',()=>{
 initTemplates();const marks=placeLandmarks({lat:17.4063,lon:78.4966});
 for(const id of ['nizam_college','osmania_medical']){
  const l=marks.find(l=>l.id===id)!;assert.ok(l);
  const B=Object.fromEntries(['st','roof','road','win','glow'].map(k=>[k,new TiledBatch()]));const labels:string[]=[];
  drawLandmark(l,{B,obstacle(){},solid(){},road:()=>false,roadY:()=>null,sign:(_id,text)=>labels.push(text)});
  assert.ok(labels.some(s=>s.includes(id==='nizam_college'?'NIZAM COLLEGE':'OSMANIA MEDICAL COLLEGE')));
  const pts=COLLEGE_CAMPUSES[id as keyof typeof COLLEGE_CAMPUSES].ring;
  const triangle=THREE.ShapeUtils.triangulateShape(pts.map(p=>new THREE.Vector2(...p as [number,number])),[])[0];
  const u=triangle.reduce((n,i)=>n+pts[i][0],0)/3,v=triangle.reduce((n,i)=>n+pts[i][1],0)/3,r=l.rot*Math.PI/180;
  assert.equal(inClear(l,l.x!+u*Math.cos(r)+v*Math.sin(r),l.z!+u*Math.sin(r)-v*Math.cos(r)),true);
  assert.equal(inClear(l,l.x!+300,l.z!),false,'do not erase surrounding real buildings');
  for(const court of COLLEGE_CAMPUSES[id as keyof typeof COLLEGE_CAMPUSES].holes){
   const u=court.reduce((n,p)=>n+p[0],0)/court.length,v=court.reduce((n,p)=>n+p[1],0)/court.length;
   const point=new THREE.Vector2(l.x!+u*Math.cos(r)+v*Math.sin(r),l.z!+u*Math.sin(r)-v*Math.cos(r));
   for(const batch of B.roof.tiles.values())for(let i=0;i<batch.pos.length;i+=9){
    const a=new THREE.Vector2(batch.pos[i],batch.pos[i+2]),b=new THREE.Vector2(batch.pos[i+3],batch.pos[i+5]),c=new THREE.Vector2(batch.pos[i+6],batch.pos[i+8]);
    assert.equal(THREE.Triangle.containsPoint(new THREE.Vector3(point.x,0,point.y),new THREE.Vector3(a.x,0,a.y),new THREE.Vector3(b.x,0,b.y),new THREE.Vector3(c.x,0,c.y)),false,'mapped courtyard must remain open to the sky');
   }
  }
 }
});
