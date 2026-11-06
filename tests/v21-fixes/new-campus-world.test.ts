import * as THREE from 'three';
import { loadLevels } from '../../src/delivery/content/levels';
import { DeliveryRuntime } from '../../src/delivery/runtime';
import type { DeliveryPoint, DeliveryModuleContext } from '../../src/delivery/modules/types';
import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryStoryPoseClear} from '../../src/delivery/runtime';
import {packedDriveWorld} from '../fixtures/release-packed-drive-world';
import {collideBuildings,supportAt} from '../../src/game/physics';
import {placeLandmarks,drawLandmark,inClear} from '../../src/world/landmarks';
import {initTemplates,TiledBatch} from '../../src/core/util';
import {OSMANIA_UNIVERSITY_PLAN as OU} from '../../src/world/osmania-university';
import {PRASADS_SOURCE_PLAN as PR} from '../../src/world/prasads-source-model';
for(const [id,p]of [['ouarts',{x:3188.103,z:-1366.926}],['prasads',PR.destination],['q_tonique_filmnagar',{x:-9133.034,z:-1706.318}]]as const)test(`${id}: actual packed entrance permits the parked Roadster outside the source building`,()=>{
 const {city}=packedDriveWorld(p);
 const yaw=id==='ouarts'?.43633231299858233:id==='prasads'?PR.sceneYaw:-.33154362;
 assert.equal(deliveryStoryPoseClear(city,{...p,y:.55,yaw}),true,'the whole rotated Roadster body must fit at the authored arrival pose');
 for(const dx of [-1.4,0,1.4])for(const dz of [-2.6,0,2.6]){
  assert.ok(Math.abs(supportAt(city,p.x+dx,p.z+dz,.12).y)<.3);
  assert.equal(collideBuildings(city,{x:p.x+dx,z:p.z+dz},.25,.15,2.7),0);
 }
});
test('source Arts College and Prasads keep finite named facades without erasing adjacent campus blocks',()=>{
 initTemplates();const models=placeLandmarks({lat:17.4063,lon:78.4966});
 for(const [id,plan]of [['ouarts',OU],['prasads',PR]]as const){
  const l=models.find(l=>l.id===id)!;assert.ok(l);const B=Object.fromEntries(['st','roof','road','win','glow'].map(k=>[k,new TiledBatch()])),labels:string[]=[];
  drawLandmark(l,{B,solid(){},obstacle(){},road:()=>false,roadY:()=>null,sign:(_id,text)=>labels.push(text)});
  assert.ok(labels.some(s=>s.includes(id==='ouarts'?'OSMANIA UNIVERSITY':'PRASADS')));
  assert.ok([...B.st.tiles.values()].every(b=>b.pos.every(Number.isFinite)));
  assert.equal(inClear(l,l.x!+300,l.z!+300),false);
  assert.equal(plan.outer.length,id==='ouarts'?16:12);
 }
});

test('actual runtime prepares named ground aprons under nearby portico roofs without lifting the whole scene',()=>{
 for(const level of loadLevels().slice(14,17)){
  const {city,graph}=packedDriveWorld(level.destination);let destination:DeliveryPoint|undefined;
  const runtime:any=Object.assign(Object.create(DeliveryRuntime.prototype),{
   game:{city,graph,traffic:{},engine:{scene:new THREE.Scene()}},controller:{activeLevel:level,canDrop:false},
   characterPreparation:{ready:()=>true},moduleFactory:()=>({setup(ctx:DeliveryModuleContext){destination=ctx.destination;}}),
  });
  runtime.prepareModule();assert.ok(destination,`${level.id}: ground apron must prepare`);
  assert.equal(destination.y,0,`${level.id}: a canopy or academic roof must not raise the scene`);
  assert.equal(destination.x,level.destination.x);assert.equal(destination.z,level.destination.z);
 }
});
