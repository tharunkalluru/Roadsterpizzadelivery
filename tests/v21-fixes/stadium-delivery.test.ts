import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Batch,initTemplates,type TiledBatch } from '../../src/core/util';
import { Kit } from '../../src/world/landmarks';
import { drawUppalStadium } from '../../src/world/destination-hero-models';
import { captureLandmarkBatches } from '../../src/world/landmark-support-capture';
import { addLandmarkSurface,type LandmarkSurfaceGrid } from '../../src/world/landmark-support';
import { stadiumExclusions } from '../../src/world/stadium-roads';
import { resolveUppalStadiumDelivery } from '../../src/delivery/stadium-delivery';
import { BeatDrop } from '../../src/delivery/modules/beat-drop';
import { loadLevels } from '../../src/delivery/content/levels';
import type { DeliveryPlayer } from '../../src/delivery/modules/types';
import { uppalStadiumFloodlights } from '../../src/world/stadium-lighting';
import { applySceneLamp,SCENE_STADIUM_LIGHT } from '../../src/game/scene-lamp-pool';

initTemplates({rbox:new THREE.BoxGeometry(1,1,1)});
const advance=(module:BeatDrop,seconds:number)=>{for(let t=0;t<seconds-1e-8;t+=.05)module.update(.05);};
function actualStadium(){
  const core=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()),center=stadiumExclusions(core.origin)[0],grid:LandmarkSurfaceGrid=new Map();
  const batches=Object.fromEntries(['st','park','roof'].map(key=>[key,new Batch()])) as unknown as Record<string,TiledBatch>;
  drawUppalStadium(new Kit(center.x,center.z,0,{B:captureLandmarkBatches(batches,grid,'uppal_stadium'),solid(){}} as any));
  return{grid,center,batches};
}

test('Nani binds to the actual rendered Uppal turf rather than its old7m anchor or upper bowl canopy',()=>{
  const {grid}=actualStadium(),level=loadLevels().find(l=>l.id==='between-overs')!,original={...level.destination,y:level.destination.y??0},count=grid.size;
  assert.equal(original.y,7,'fixture exercises the former raised pavilion marker');const resolved=resolveUppalStadiumDelivery(grid,original);assert.ok(resolved);
  assert.ok(Math.abs(resolved.destination.y-.035)<1e-5,'exact existing turf triangle height is used');assert.equal(resolved.destination.x,original.x);assert.equal(resolved.destination.z,original.z);
  assert.equal(resolved.moduleParams.useExistingStadium,true);assert.equal(grid.size,count,'placement never modifies the owning world geometry');
  const triangles=[...new Set([...grid.values()].flat())],raised=new Map<string,typeof triangles>();
  for(const t of triangles.filter(t=>Math.min(t.a[1],t.b[1],t.c[1])>2))addLandmarkSurface(raised,t);
  assert.equal(resolveUppalStadiumDelivery(raised,original),null,'a loaded canopy alone cannot impersonate the field');
});

test('unloaded, unrelated and too-small surfaces defer preparation instead of fabricating a field',()=>{
  const destination={x:0,y:7,z:0};assert.equal(resolveUppalStadiumDelivery(undefined,destination),null);assert.equal(resolveUppalStadiumDelivery(new Map(),destination),null);
  const unrelated:LandmarkSurfaceGrid=new Map();addLandmarkSurface(unrelated,{id:'other_stadium',a:[-50,.035,-50],b:[-50,.035,50],c:[50,.035,50]});assert.equal(resolveUppalStadiumDelivery(unrelated,destination),null);
  const narrow:LandmarkSurfaceGrid=new Map();addLandmarkSurface(narrow,{id:'uppal_stadium',a:[-1,.035,-1],b:[-1,.035,1],c:[1,.035,1]});assert.equal(resolveUppalStadiumDelivery(narrow,destination),null,'a full car footprint, not one sampled point, must fit');
});

test('existing-stadium delivery creates no replacement pitch or stadium supports and requires a grounded repeatable timing window',()=>{
  const {grid}=actualStadium(),level=loadLevels().find(l=>l.id==='between-overs')!,resolved=resolveUppalStadiumDelivery(grid,{...level.destination,y:level.destination.y??0})!;
  const scene=new THREE.Scene(),events:string[]=[],p:DeliveryPlayer={...resolved.destination,y:resolved.destination.y+.55,yaw:0,speed:0,flying:false},module=new BeatDrop();
  module.setup({scene,destination:resolved.destination,player:()=>p,canInteract:()=>true,emit:e=>events.push(e)},{...level.moduleParams,...resolved.moduleParams});
  assert.equal(module.supports.length,0,'the existing turf remains the sole physical field');let meshCount=0;scene.traverse(node=>{if(node instanceof THREE.Mesh)meshCount++;});assert.equal(meshCount,1,'only target ring is added before handoff; no duplicate wicket, stands, floodlights or pitch slab');
  assert.equal(module.movement.mode,'normal');advance(module,2);assert.equal(module.status.canDrop,true);
  advance(module,3);assert.equal(module.status.canDrop,false);advance(module,2);assert.equal(module.status.canDrop,true,'missing one over break does not fail or permanently lock the delivery');
  p.flying=true;module.update(.05);assert.equal(module.status.canDrop,false);module.onDrop();assert.ok(!events.includes('done'));
  p.flying=false;p.jumping=true;module.update(.05);assert.equal(module.status.canDrop,false);p.jumping=false;p.speed=8;module.update(.05);assert.equal(module.status.canDrop,false);
  p.speed=0;module.update(.05);assert.equal(module.status.canDrop,true);module.onDrop();module.onDrop();advance(module,.8);assert.equal(events.filter(e=>e==='done').length,1);module.teardown();assert.equal(scene.children.length,0);
});

test('the finale marker sits beside the real wicket with a clear car footprint and a retained natural receiver',()=>{
  const {grid,center}=actualStadium(),level=loadLevels().find(l=>l.id==='between-overs')!;
  assert.ok(Math.hypot(level.destination.x-center.x,level.destination.z-center.z)<12,'handoff belongs beside the central wicket rather than the north outfield');
  const resolved=resolveUppalStadiumDelivery(grid,{...level.destination,y:level.destination.y??0})!,scene=new THREE.Scene(),group=new THREE.Group();
  const leftArm=new THREE.Group(),rightArm=new THREE.Group(),catchPoint=new THREE.Object3D(),poses:number[]=[],motions:string[]=[];group.add(leftArm,rightArm,catchPoint);
  const p:DeliveryPlayer={...resolved.destination,y:resolved.destination.y+.55,yaw:0,speed:0,flying:false},module=new BeatDrop();
  module.setup({scene,destination:resolved.destination,player:()=>p,emit(){},characterFactory:()=>({group,leftArm,rightArm,catchPoint,catchPose:amount=>poses.push(amount),animate:(_dt,motion)=>motions.push(motion)})},{...level.moduleParams,...resolved.moduleParams});
  assert.ok(Math.abs(group.position.x)>3,'the named character must not intersect the landing car');
  advance(module,2);module.onDrop();advance(module,.9);assert.ok(poses.includes(1));assert.equal(module.sceneryPending,true);
  advance(module,1);assert.equal(poses.at(-1),0);assert.ok(motions.every(motion=>motion==='idle'));assert.equal(scene.getObjectByName('delivery-target-ring')!.visible,false);
  p.x+=900;assert.equal(module.sceneryPending,false);module.teardown();assert.equal(scene.children.length,0);
});

test('the stadium borrows one existing light at a real tower lens and leaves moving and airborne camera control alone',()=>{
  const {grid,center,batches}=actualStadium(),level=loadLevels().find(l=>l.id==='between-overs')!;
  const resolved=resolveUppalStadiumDelivery(grid,{...level.destination,y:level.destination.y??0})!;
  const source=resolved.moduleParams.stadiumLight!;assert.ok(source);
  assert.ok(uppalStadiumFloodlights(center).some(p=>Math.hypot(p.x-source.x,p.y-source.y,p.z-source.z)<1e-5),'source is an existing tower lens, not the displaced delivery pin or a new pitch lamp');
  const st=batches.st as unknown as Batch,color=new THREE.Color('#fff8cd');let actualLens=false;
  for(let i=0;i<st.pos.length;i+=108){
    if(Math.abs(st.col[i]-color.r)>1e-8||Math.abs(st.col[i+1]-color.g)>1e-8||Math.abs(st.col[i+2]-color.b)>1e-8)continue;
    const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
    for(let v=i;v<i+108;v+=3)for(let axis=0;axis<3;axis++){low[axis]=Math.min(low[axis],st.pos[v+axis]);high[axis]=Math.max(high[axis],st.pos[v+axis]);}
    if(Math.hypot((low[0]+high[0])/2-source.x,(low[1]+high[1])/2-source.y,(low[2]+high[2])/2-source.z)<1e-5)actualLens=true;
  }
  assert.equal(actualLens,true,'selected light must occupy a bright lens in independently captured actual world geometry');
  const scene=new THREE.Scene(),group=new THREE.Group(),leftArm=new THREE.Group(),rightArm=new THREE.Group(),catchPoint=new THREE.Object3D();group.add(leftArm,rightArm,catchPoint);
  group.userData.releasedCharacter={characterId:'nani-jersey'};
  const p:DeliveryPlayer={...resolved.destination,y:resolved.destination.y+.55,yaw:0,speed:0},module=new BeatDrop();
  assert.doesNotThrow(()=>[module.cameraFocus,module.headlightGain,module.hideWorldGuidance,module.intentionalStop,module.sceneLamp],'optional scene requests are safe before setup');
  module.setup({scene,destination:resolved.destination,player:()=>p,emit(){},characterFactory:()=>({group,leftArm,rightArm,catchPoint,catchPose(){}})},{...level.moduleParams,...resolved.moduleParams});
  assert.equal(scene.getObjectsByProperty('isPointLight',true).length,0,'module never constructs lights');
  const light=new THREE.PointLight();assert.equal(applySceneLamp(light,module.sceneLamp!,null,0,0),true);assert.equal(light.intensity,SCENE_STADIUM_LIGHT.intensity);assert.equal(light.position.y,36.675);
  assert.ok(module.cameraFocus);assert.equal(module.cameraFocus!.context,'stationary-handoff');assert.equal(module.headlightGain,.02);assert.equal(module.hideWorldGuidance,true,'world-space route ribbon must not fill the close handoff view');
  advance(module,4);assert.equal(module.intentionalStop,true,'waiting for the next over break is an intentional stop even outside its timing window');
  p.speed=1;assert.equal(module.cameraFocus,undefined);assert.equal(module.hideWorldGuidance,false,'normal driving keeps road and marker guidance');p.speed=0;p.flying=true;assert.equal(module.cameraFocus,undefined);assert.equal(module.headlightGain,undefined);assert.equal(module.hideWorldGuidance,false);assert.ok(module.sceneLamp,'tower remains lit during a nearby landing');
  p.flying=false;p.x+=110;assert.equal(module.sceneLamp,undefined);assert.equal(module.cameraFocus,undefined);
  assert.equal(applySceneLamp(light,module.sceneLamp??null,new THREE.Vector3(2,8,4),6,0),false);assert.equal(light.intensity,22);assert.equal(light.distance,26);
  module.teardown();assert.equal(module.sceneLamp,undefined);assert.equal(scene.children.length,0);
});
