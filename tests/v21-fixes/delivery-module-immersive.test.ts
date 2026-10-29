import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDeliveryModule,type DeliveryPlayer,type DeliveryModuleContext } from '../../src/delivery/modules';
import { railRoofAt,MovingRailInteraction } from '../../src/game/moving-rail';
import { supportAt } from '../../src/game/physics';
import type { MovingRailBody } from '../../src/game/moving-rail';

const advance=(module:ReturnType<typeof createDeliveryModule>,seconds:number)=>{for(let t=0;t<seconds-1e-8;t+=.05)module.update(.05);};
function setup(name='matchAndLand',params:Record<string,unknown>={scene:'truckInterior',vehicle:'truck',speed:6}){
  const scene=new THREE.Scene(),p:DeliveryPlayer={x:0,y:.55,z:-25,yaw:Math.PI,speed:0,flying:false};
  const events:string[]=[],sceneEvents:string[]=[];let unlocked=false;
  const ctx:DeliveryModuleContext={scene,player:()=>p,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:60}],canInteract:()=>unlocked,
    emit:type=>events.push(type),sceneEvent:kind=>sceneEvents.push(kind)};
  const module=createDeliveryModule(name);module.setup(ctx,params);
  return{scene,p,events,sceneEvents,ctx,module,unlock:()=>{unlocked=true;}};
}
test('truck drives a finite mapped route, opens its folded tailgate only after the call, and exposes separate NPC envelope',()=>{
  const f=setup();advance(f.module,2);assert.ok(f.module.trafficBodies![0].z>3);
  assert.ok(f.module.supports.some(b=>b.id==='delivery-interior-door:0'));assert.ok(!f.module.supports.some(b=>b.id==='delivery-interior-ramp'));
  assert.equal(f.module.arrival!.side,'rear');
  const rear=f.module.arrival!,bed=f.module.supports.find(b=>b.id==='delivery-interior-floor')!;
  assert.ok(Math.abs(rear.z-(bed.z-bed.halfLength))<.001,'call boundary is the actual rear door, not the more distant approach marker');
  assert.ok(f.module.target.z<rear.z-10,'navigation stays at the safe approach point behind the ramp');
  f.unlock();advance(f.module,2);const ramp=f.module.supports.find(b=>b.id==='delivery-interior-ramp')!,floor=f.module.supports.find(b=>b.id==='delivery-interior-floor')!;
  assert.ok(ramp);assert.ok(!f.module.supports.some(b=>b.id.startsWith('delivery-interior-door:')));
  assert.ok(Math.abs(railRoofAt(ramp,ramp.x,ramp.z-ramp.halfLength)!-.12)<.001);
  assert.ok(Math.abs(railRoofAt(ramp,ramp.x,ramp.z+ramp.halfLength)!-floor.roof)<.001);
  assert.ok(f.module.trafficBodies![0].roof>floor.roof+4,'NPC volume includes cab and walls, not only the driveable floor');
  advance(f.module,30);const end=f.module.trafficBodies![0].z;advance(f.module,5);assert.equal(f.module.trafficBodies![0].z,end);f.module.teardown();
});
test('truck interior cannot be delivered from above or through a side; actual rear entry reveals once and handoff visibly completes',()=>{
  const f=setup();f.unlock();advance(f.module,30);const floor=f.module.supports.find(b=>b.id==='delivery-interior-floor')!;
  assert.equal(f.scene.getObjectByName('delivery-character-unknown')!.visible,true);assert.equal(f.scene.getObjectByName('delivery-character-pushpa')!.visible,false);
  Object.assign(f.p,{x:floor.x+.55,y:floor.roof+3,z:floor.z+2,flying:true});advance(f.module,.7);f.module.onDrop();assert.equal(f.events.at(-1),'failed');assert.deepEqual(f.sceneEvents,[]);
  Object.assign(f.p,{y:floor.roof+.55,flying:false});advance(f.module,.7);assert.equal(f.module.status.canDrop,false,'dropping vertically into the box is not rear entry');
  f.p.z=floor.z-9;f.module.update(.05);f.p.z=floor.z-7;f.module.update(.05);assert.deepEqual(f.sceneEvents,['interiorEntered']);
  assert.equal(f.scene.getObjectByName('delivery-character-unknown')!.visible,false);assert.equal(f.scene.getObjectByName('delivery-character-pushpa')!.visible,true);
  f.p.z=floor.z+2;advance(f.module,.7);assert.equal(f.module.status.canDrop,true);f.module.onDrop();assert.equal(f.events.filter(e=>e==='done').length,0);
  advance(f.module,.75);assert.equal(f.events.filter(e=>e==='done').length,0,'completion waits for the character catch settle');advance(f.module,.5);
  assert.equal(f.events.filter(e=>e==='done').length,1);assert.deepEqual(f.sceneEvents,['interiorEntered','catchStarted']);f.module.teardown();
});
test('truck clear aisle is physically open while visible logs and walls reject the complete car envelope',()=>{
  const f=setup();f.unlock();advance(f.module,30);const floor=f.module.supports.find(b=>b.id==='delivery-interior-floor')!;
  const collide=(x:number)=>{
    const interaction=new MovingRailInteraction(),p={pos:{x,y:floor.roof+.55,z:floor.z-7},yaw:Math.PI,speed:3,vy:0,flying:false,descending:false,jumping:false};
    interaction.beforePlayer(p,f.module.supports,false,.05);p.pos.z=floor.z+1;return interaction.afterPlayer(p,.05);
  };
  assert.equal(collide(.55).hit,false,'a complete Roadster fits the central aisle');assert.equal(collide(-2).hit,true,'logs remain physical');assert.equal(collide(2.8).hit,true,'sidewall is physical');f.module.teardown();
});
test('production support selection carries grounded wheels from the ramp tip up to the truck floor',()=>{
  const f=setup();f.unlock();advance(f.module,30);
  const ramp=f.module.supports.find(b=>b.id==='delivery-interior-ramp')!,floor=f.module.supports.find(b=>b.id==='delivery-interior-floor')!;
  const city={surfaceGrid:new Map(),buildingGrid:new Map(),waterGrid:new Map(),landmarkSurfaceGrid:new Map(),movingRail:f.module.supports} as any;
  let z=ramp.z-ramp.halfLength-.8,feet=0;const x=.55;
  for(let i=0;i<30;i++){
    const previous={x,z,feet};z+=.4;
    const selected=supportAt(city,x,z,feet,false,previous);
    if(z>=ramp.z-ramp.halfLength&&z<=floor.z+1){assert.equal(selected.kind,'rail','ramp continuity must beat the underlying ground');assert.ok(selected.y>=feet-.001);}
    feet=selected.y;
  }
  assert.ok(Math.abs(feet-floor.roof)<.001);f.module.teardown();
});
test('surface scene never requests diving, waits for call and emergence, and catches the thrown pizza before completion',()=>{
  const f=setup('underwater',{scene:'surfaceEmergence',throwRange:12});Object.assign(f.p,{x:0,y:.3,z:7});advance(f.module,3);
  assert.equal(f.module.movement.mode,'approach');assert.equal(f.module.status.canDrop,false);assert.deepEqual(f.sceneEvents,[]);
  const character=f.scene.getObjectByName('delivery-character-simhadri')!;assert.equal(character.visible,false);
  f.unlock();advance(f.module,.5);assert.equal(f.module.status.canDrop,false);assert.equal(character.visible,true);assert.ok(character.position.y<-.65);
  advance(f.module,1.5);assert.equal(f.module.status.canDrop,true);assert.deepEqual(f.sceneEvents,['characterEmerged']);
  f.p.y=-3;f.module.update(.05);assert.equal(f.module.status.canDrop,false,'surface handoff cannot be performed deep underwater');f.p.y=.3;f.module.update(.05);f.module.onDrop();
  assert.deepEqual(f.sceneEvents,['characterEmerged','catchStarted']);advance(f.module,.9);assert.ok(!f.events.includes('done'));advance(f.module,.6);assert.equal(f.events.filter(e=>e==='done').length,1);f.module.teardown();
});
test('new immersive scenes release merged costume, tailgate and water-scene resources exactly once',()=>{
  for(const [name,params]of [['matchAndLand',{scene:'truckInterior',vehicle:'truck'}],['underwater',{scene:'surfaceEmergence'}]] as const){
    const f=setup(name,params);const resources=new Set<THREE.BufferGeometry|THREE.Material>();let disposed=0;
    f.scene.traverse(n=>{if(n instanceof THREE.Mesh){resources.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])resources.add(m);}});
    for(const r of resources)r.addEventListener('dispose',()=>disposed++);f.module.teardown();f.module.teardown();assert.equal(disposed,resources.size);assert.equal(f.scene.children.length,0);
  }
});
test('opt-in rooftop, stadium and IMAX handoffs reach physical hands before completing and ignore repeat taps',()=>{
  for(const [name,params]of [
    ['matchAndLand',{vehicle:'stationary',speed:0}],
    ['beatDrop',{period:2,windowStart:0,windowEnd:.9}],
    ['threadGap',{hazards:false}],
  ] as const){
    const f=setup(name,{...params,immersiveHandoff:true});f.unlock();
    if(name==='threadGap'){
      Object.assign(f.p,{x:0,y:3,z:20,flying:true});f.module.update(.05);f.p.z=13;f.module.update(.05);f.p.z=-7;
    }else Object.assign(f.p,f.module.target,{y:f.module.target.y+3});
    advance(f.module,.6);assert.equal(f.module.status.canDrop,true);f.module.onDrop();f.module.onDrop();
    const box=f.scene.getObjectByName('delivery-handoff-pizza') as THREE.Mesh;assert.equal(box.visible,true);assert.ok(!f.events.includes('done'));assert.equal(f.module.status.canDrop,false);
    advance(f.module,.6);assert.ok(!f.events.includes('done'));assert.equal(f.module.status.instruction,'Caught it!');
    let raised=false;f.scene.traverse(n=>{if(n.name.endsWith('-left-arm')&&n.rotation.x< -1.2)raised=true;});assert.ok(raised);
    advance(f.module,.2);assert.equal(f.events.filter(e=>e==='done').length,1);f.module.onDrop();assert.equal(f.events.filter(e=>e==='done').length,1);f.module.teardown();
  }
});
test('each chain take waits for its director catch and teardown cancels an in-flight pizza',()=>{
  const f=setup('chainDrop',{immersiveHandoff:true});f.unlock();
  const first={...f.module.target};Object.assign(f.p,first,{y:first.y+3});f.module.update(.05);f.module.onDrop();f.module.onDrop();
  advance(f.module,.5);assert.deepEqual(f.module.target,first);assert.equal(f.module.status.canDrop,false);
  advance(f.module,.3);assert.notDeepEqual(f.module.target,first);assert.equal(f.module.status.progress,'2 / 4');
  Object.assign(f.p,f.module.target,{y:f.module.target.y+3});f.module.update(.05);f.module.onDrop();
  f.module.teardown();advance(f.module,2);assert.ok(!f.events.includes('done'));assert.equal(f.scene.children.length,0);
});
test('train catch follows its actual moving coach every frame and is cancelled if that coach disappears',()=>{
  const f=setup('matchAndLand',{vehicle:'train',immersiveHandoff:true,holdSeconds:.2,matchTolerance:4});f.unlock();
  const body:MovingRailBody={id:'real-train',x:0,y:0,z:0,hx:0,hz:1,halfWidth:1.6,halfLength:10,bottom:.2,roof:4.2,previous:{x:0,y:0,z:0,hx:0,hz:1}};
  let present=true;f.ctx.existingTrain=()=>present?body:null;
  Object.assign(f.p,{x:0,y:4.75,z:0,speed:0,flying:false});
  const move=()=>{body.previous.z=body.z;body.z+=.5;f.module.update(.05);f.p.z+=.5;};
  for(let i=0;i<15;i++)move();assert.equal(f.module.status.canDrop,true);f.module.onDrop();
  const start=body.z;for(let i=0;i<12;i++)move();assert.ok(body.z>start+5);assert.ok(!f.events.includes('done'));
  const box=f.scene.getObjectByName('delivery-handoff-pizza') as THREE.Mesh,receiver=f.scene.getObjectByName('delivery-character-trainHero')!;
  const world=new THREE.Vector3();box.getWorldPosition(world);assert.ok(Math.abs(world.z-body.z)<1,'pizza catch follows the current moving train position');
  receiver.getWorldPosition(world);assert.ok(Math.abs(world.z-body.z)<.001);
  for(let i=0;i<4;i++)move();assert.equal(f.events.filter(e=>e==='done').length,1);f.module.teardown();
  // A second fresh attempt loses its source coach before the catch settles.
  const g=setup('matchAndLand',{vehicle:'train',immersiveHandoff:true,holdSeconds:.1});g.unlock();
  body.previous.z=body.z;g.ctx.existingTrain=()=>present?body:null;Object.assign(g.p,{x:0,y:4.75,z:body.z,speed:0,flying:false});advance(g.module,.3);g.module.onDrop();
  assert.ok(g.scene.getObjectByName('delivery-handoff-pizza')?.visible);present=false;g.module.update(.05);advance(g.module,1);
  assert.ok(!g.events.includes('done'));assert.equal(g.scene.getObjectByName('delivery-handoff-pizza')!.visible,false);g.module.teardown();
});
test('Eega variant retains its insect geometry and timing while the pizza visibly reaches its receiver',()=>{
  const f=setup('beatDrop',{theme:'eega',period:3,windowStart:.67,windowEnd:.9,radius:7,immersiveHandoff:true});f.unlock();
  Object.assign(f.p,{x:0,y:3,z:0});advance(f.module,2.4);assert.equal(f.module.status.canDrop,true);
  const insect=f.scene.getObjectByName('delivery-character-eega')!;let parts=0;insect.traverse(n=>{if(n instanceof THREE.Mesh)parts++;});assert.equal(parts,3,'same body and two wing meshes');
  f.module.onDrop();assert.ok(!f.events.includes('done'));advance(f.module,.6);
  const pizza=f.scene.getObjectByName('delivery-handoff-pizza')!,anchor=f.scene.getObjectByName('delivery-eega-catch-point')!;
  const p=new THREE.Vector3(),a=new THREE.Vector3();pizza.getWorldPosition(p);anchor.getWorldPosition(a);assert.ok(p.distanceTo(a)<.001);
  assert.ok(insect.children.some(n=>n instanceof THREE.Group&&Math.abs(n.rotation.z)>.5),'wings react to receiving the pizza');
  assert.ok(!f.events.includes('done'));advance(f.module,.2);assert.equal(f.events.filter(e=>e==='done').length,1);f.module.teardown();
});
