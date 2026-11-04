import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TruckInterior } from '../../src/delivery/modules/truck-interior';
import { Underwater } from '../../src/delivery/modules/underwater';
import type { DeliveryModuleContext, DeliveryPlayer } from '../../src/delivery/modules/types';
import type { CharacterStyle, SceneCharacter } from '../../src/delivery/modules/character';
import { railRoofAt, MovingRailInteraction } from '../../src/game/moving-rail';

const advance=(module:{update(dt:number):void},seconds:number)=>{for(let t=0;t<seconds-1e-8;t+=.05)module.update(.05);};

test('only an occupied physical cargo interior suppresses its world target ring and road ribbon request',()=>{
  const scene=new THREE.Scene(),p:DeliveryPlayer={x:0,y:.55,z:-25,yaw:Math.PI,speed:0},module=new TruckInterior();
  module.setup({scene,player:()=>p,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:300}],emit(){}},{speed:0});
  assert.equal(module.hideWorldGuidance,false);module.update(.05);assert.equal(scene.getObjectByName('delivery-target-ring')!.visible,true);
  const floor=module.supports.find(body=>body.id==='delivery-interior-floor')!,roof=module.supports.find(body=>body.id==='delivery-interior-roof')!;
  Object.assign(p,{x:floor.x,y:floor.roof+.55,z:floor.z});module.update(.05);
  assert.equal(module.hideWorldGuidance,true);assert.equal(scene.getObjectByName('delivery-target-ring')!.visible,false);
  for(const position of [{x:floor.x,y:roof.roof+.55,z:floor.z},{x:floor.x,y:.55,z:floor.z},{x:floor.x+4,y:floor.roof+.55,z:floor.z},{x:floor.x,y:floor.roof+.55,z:floor.z-20}]){
    Object.assign(p,position);module.update(.05);assert.equal(module.hideWorldGuidance,false,'roof, underbody, side and approach retain ordinary world guidance');assert.equal(scene.getObjectByName('delivery-target-ring')!.visible,true);
  }
  module.teardown();assert.equal(module.hideWorldGuidance,false);
});

test('closed corrugated container has a solid ceiling matching its rendered slab on a rotated, graded road',()=>{
  const scene=new THREE.Scene(),p:DeliveryPlayer={x:40,y:7.55,z:-35,yaw:Math.PI,speed:0};
  const module=new TruckInterior();
  module.setup({scene,player:()=>p,destination:{x:40,y:7,z:-10},route:[{x:40,y:7,z:-10},{x:140,y:9,z:90}],canInteract:()=>true,emit(){}},{speed:6});
  module.update(0);const rear=module.arrival;p.x=rear.x-rear.hx*20;p.z=rear.z-rear.hz*20;
  advance(module,2);
  const roof=module.supports.find(b=>b.id==='delivery-interior-roof')!,floor=module.supports.find(b=>b.id==='delivery-interior-floor')!;
  assert.ok(roof&&roof.bottom>floor.roof+3.5,'the complete Roadster has usable clearance under the roof');
  const rendered=scene.getObjectByName('delivery-container-closed-roof') as THREE.Mesh;
  rendered.updateWorldMatrix(true,false);
  const roofTop=rendered.localToWorld(new THREE.Vector3(0,.11,0));
  assert.ok(Math.abs(roofTop.y-railRoofAt(roof,roofTop.x,roofTop.z)!)<.002,'physics follows the actual rotated/sloped top surface');
  const geometry=rendered.geometry;geometry.computeBoundingBox();
  assert.ok(geometry.boundingBox!.max.z-geometry.boundingBox!.min.z>=16,'ceiling covers the full cargo bay');
  assert.ok((scene.getObjectByName('delivery-container-corrugated-sides') as THREE.InstancedMesh).count>70);
  assert.ok((scene.getObjectByName('delivery-container-corrugated-roof') as THREE.InstancedMesh).count>25);
  assert.ok(module.supports.some(b=>b.id==='delivery-interior-ramp'),'rear approach unlock still opens a driveable ramp');
  module.teardown();
});

test('container ceiling stops upward passage while the aisle stays open for a grounded car',()=>{
  const scene=new THREE.Scene(),p:DeliveryPlayer={x:.55,y:.55,z:-25,yaw:Math.PI,speed:0};
  const module=new TruckInterior();
  module.setup({scene,player:()=>p,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:100}],canInteract:()=>true,emit(){}},{});
  advance(module,30);
  const floor=module.supports.find(b=>b.id==='delivery-interior-floor')!,roof=module.supports.find(b=>b.id==='delivery-interior-roof')!;
  const car={pos:{x:.55,y:floor.roof+.55,z:floor.z},yaw:Math.PI,speed:0,vy:0,flying:false,descending:false,jumping:false};
  const contact=new MovingRailInteraction();
  contact.beforePlayer(car,module.supports,false,.05);car.pos.z+=.3;assert.equal(contact.afterPlayer(car,.05).hit,false);
  assert.ok(roof.bottom>car.pos.y+1.2,'the roof cannot falsely collide with ordinary driving');
  // A car attempting to pass vertically through the ceiling meets the same
  // actual slab that a landing car can stand on, rather than an invisible lid.
  car.pos.y=roof.bottom-.5;car.flying=true;car.vy=2;
  contact.beforePlayer(car,module.supports,false,.05);car.pos.y+=.3;
  assert.equal(contact.afterPlayer(car,.05).hit,true);
  module.teardown();
});

/** Art remains absent until the independent likeness gate approves it. This
 * fixture tests interaction and the invariant pose without publishing a stand-in. */
class GatedDevara extends Underwater {
  protected character(_style:CharacterStyle,x:number,y:number,z:number,_seated=false,parent=this.root):SceneCharacter{
    const group=new THREE.Group(),leftArm=new THREE.Group(),rightArm=new THREE.Group();
    group.position.set(x,y,z);group.visible=false;group.userData.appearanceReview='pending';group.add(leftArm,rightArm);parent.add(group);
    return{group,leftArm,rightArm,catchPose(){throw Error('The neck grip must never change into a catch pose.');}};
  }
}
function devaraFixture(){
  const scene=new THREE.Scene(),p:DeliveryPlayer={x:100,y:.45,z:200,yaw:0,speed:0,flying:false},events:string[]=[],sceneEvents:string[]=[];
  let unlocked=true;
  const ctx:DeliveryModuleContext={scene,player:()=>p,destination:{x:100,y:0,z:200},canInteract:()=>unlocked,emit:e=>events.push(e),sceneEvent:e=>sceneEvents.push(e)};
  const module=new GatedDevara();module.setup(ctx,{scene:'devaraUnderwater',depth:6});
  return{scene,p,events,sceneEvents,module,lock:()=>{unlocked=false;},unlock:()=>{unlocked=true;}};
}

test('underwater tableau stays ahead of each arrival heading instead of overlapping the Roadster',()=>{
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const f=devaraFixture();f.p.yaw=yaw;f.module.update(.05);f.module.onDrop();
    f.scene.updateMatrixWorld(true);const skeleton=f.scene.getObjectByName('delivery-devara-intact-skeleton')!;
    const at=new THREE.Vector3();skeleton.getWorldPosition(at);
    const dx=at.x-f.p.x,dz=at.z-f.p.z,fx=-Math.sin(yaw),fz=-Math.cos(yaw);
    assert.ok(dx*fx+dz*fz>5,'the complete car and skeleton footprints stay separate');
    assert.ok(Math.abs(dx*fz-dz*fx)<.05,'tableau remains aligned with the arrival view');
    assert.ok(Math.abs(Math.hypot(f.module.target.x-f.p.x,f.module.target.z-f.p.z)-6)<.001);
    f.module.teardown();
  }
});

test('Devara requires explicit surface DIVE and actual descent; neither arrival nor a repeated tap delivers',()=>{
  const f=devaraFixture();advance(f.module,4);
  assert.equal(f.module.status.actionLabel,'DIVE');assert.equal(f.module.status.canDrop,true);assert.equal(f.module.movement.mode,'approach');assert.deepEqual(f.events,[]);
  f.lock();f.module.update(.05);f.module.onDrop();assert.equal(f.module.movement.mode,'approach');
  f.unlock();f.module.update(.05);f.module.onDrop();assert.equal(f.module.movement.mode,'underwater');assert.equal(f.module.movement.depth,6);
  f.module.onDrop();advance(f.module,15);assert.ok(!f.events.includes('done'),'elapsed time cannot fake a completed descent');
  assert.equal(f.module.status.canDrop,false);assert.equal(f.module.status.actionLabel,'DIVING');
  f.p.y=-3;advance(f.module,2);assert.equal(f.module.status.canDrop,false);
  f.p.y=-6;f.module.update(.05);assert.equal(f.module.status.canDrop,true);assert.equal(f.module.status.actionLabel,'PLACE PIZZA');
  assert.deepEqual(f.sceneEvents,['characterEmerged']);assert.equal(f.scene.getObjectByName('delivery-character-devara')!.visible,false,'pending artwork remains hidden throughout descent');
  f.module.teardown();
});

test('Devara close view is scene-local, rotated with the tableau and available only when submerged and stopped',()=>{
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const f=devaraFixture();f.p.yaw=yaw;f.module.update(.05);assert.equal(f.module.cameraFocus,undefined);assert.equal(f.module.hideWorldGuidance,false);
  f.module.onDrop();assert.equal(f.module.cameraFocus,undefined);assert.equal(f.module.hideWorldGuidance,true);
  f.p.y=-6;f.module.update(.05);const view=f.module.cameraFocus!;assert.ok(view);
  const target=new THREE.Vector3(view.target.x,view.target.y,view.target.z),camera=new THREE.Vector3(view.position.x,view.position.y,view.position.z);
  assert.ok(camera.distanceTo(target)>3&&camera.distanceTo(target)<4);assert.ok(Math.abs(view.target.y+5.5)<1e-8);
  const forward={x:-Math.sin(yaw),z:-Math.cos(yaw)};assert.ok((view.position.x-f.p.x)*forward.x+(view.position.z-f.p.z)*forward.z>2,'close view stays ahead of the car, never behind it');
  f.p.speed=2;assert.equal(f.module.cameraFocus,undefined);f.module.teardown();
 }
});
test('underwater arrival borrows a physical worklight, hides the target ring and keeps the close camera beside the car',()=>{
 const f=devaraFixture();f.module.update(.05);assert.equal(f.module.sceneLamp,undefined);
 assert.equal(f.module.headlightGain,1);
 f.module.onDrop();f.p.y=-6;f.module.update(.05);
 assert.equal(f.module.sceneLamp!.kind,'underwater');assert.ok(f.scene.getObjectByName('delivery-dive-worklight-lens'));
 assert.equal(f.module.headlightGain,.02,'close underwater headlights cannot wash out the tableau');
 assert.equal(f.scene.getObjectByName('delivery-target-ring')!.visible,false);
 assert.equal(f.scene.getObjectsByProperty('isLight',true).length,0,'the module owns no extra renderer lights');
 const view=f.module.cameraFocus!;assert.ok(Math.abs(view.position.x-f.p.x)>1.8,'camera stands outside the Roadster footprint');
 f.module.teardown();assert.equal(f.module.sceneLamp,undefined);assert.equal(f.module.headlightGain,1);
});

test('Devara placement preserves the neck grip and waits for safe return to the surface before done',()=>{
  const f=devaraFixture();f.module.update(.05);f.module.onDrop();f.p.y=-6;f.module.update(.05);
  const actor=f.scene.getObjectByName('delivery-character-devara')!,arms=actor.children.map(n=>n.rotation.clone());
  f.module.onDrop();f.module.onDrop();advance(f.module,1);
  assert.equal(f.scene.getObjectByName('delivery-devara-placed-pizza')!.visible,true);assert.equal(f.module.movement.mode,'approach');assert.equal(f.module.movement.altitude,.45);
  assert.ok(!f.events.includes('done'),'underwater placement must not release the player without a safe surface transition');
  actor.children.forEach((n,i)=>assert.ok(n.rotation.equals(arms[i])));
  f.p.y=-2;advance(f.module,3);assert.ok(!f.events.includes('done'));
  f.p.y=.1;f.module.update(.05);advance(f.module,2);assert.deepEqual(f.events,['done']);
  const skeleton=f.scene.getObjectByName('delivery-devara-intact-skeleton') as THREE.Mesh;
  assert.deepEqual(skeleton.userData.anatomy,['skull','jaw','spine','ribcage','pelvis','arms','legs']);assert.equal(skeleton.children.length,0,'skeleton is one merged draw');
  f.module.teardown();
});

test('Devara assets dispose once and a reused instance starts back on the surface',()=>{
  const f=devaraFixture(),resources=new Set<THREE.BufferGeometry|THREE.Material>();let disposals=0;
  f.scene.traverse(n=>{if(n instanceof THREE.Mesh){resources.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])resources.add(m);}});
  resources.forEach(r=>r.addEventListener('dispose',()=>disposals++));f.module.teardown();f.module.teardown();
  assert.equal(disposals,resources.size);assert.equal(f.scene.children.length,0);assert.equal(f.module.supports.length,0);assert.equal(f.module.movement.mode,'normal');
  f.module.setup({scene:f.scene,player:()=>f.p,destination:{x:100,y:0,z:200},emit(){}},{scene:'devaraUnderwater'});f.module.update(.05);
  assert.equal(f.module.movement.mode,'approach');assert.equal(f.module.status.actionLabel,'DIVE');f.module.teardown();
});
