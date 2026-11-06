import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TruckInterior } from '../../src/delivery/modules/truck-interior';
import type { DeliveryModuleContext, DeliveryPlayer } from '../../src/delivery/modules/types';
import type { SceneCharacter } from '../../src/delivery/modules/character';

const advance=(module:TruckInterior,seconds:number)=>{for(let t=0;t<seconds-1e-8;t+=.05)module.update(.05);};
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function deferred(){let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
class ReaderProbe extends TruckInterior {
  protected override character(style:string,x:number,y:number,z:number,_seated=false,parent=this.root):SceneCharacter{
    const group=new THREE.Group(),leftArm=new THREE.Group(),rightArm=new THREE.Group();group.name=style==='pushpa'?'graphics-reader-probe':'graphics-anonymous-probe';
    group.position.set(x,y,z);group.add(leftArm,rightArm);parent.add(group);return{group,leftArm,rightArm,catchPose(){}};
  }
}
function fixture(prepare?:()=>Promise<void>,moving=false){
  const scene=new THREE.Scene(),p:DeliveryPlayer={x:.55,y:.55,z:-25,yaw:Math.PI,speed:0},events:string[]=[],reveals:string[]=[],module=new ReaderProbe();
  const ctx:DeliveryModuleContext={scene,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:300}],player:()=>p,canInteract:()=>true,
    ...(moving?{}:{vehicleSpeedLimit:()=>0}),emit:type=>events.push(type),sceneEvent:type=>reveals.push(type),...(prepare?{prepareCharacterGraphics:prepare}:{})};
  module.setup(ctx,{speed:6});
  const enter=()=>{advance(module,2);p.y=2.1;p.z=-8.5;module.update(.05);p.z=-7.5;module.update(.05);p.z=2;advance(module,.7);};
  return{scene,p,events,reveals,module,ctx,enter,reader:()=>scene.getObjectByName('graphics-reader-probe')!};
}

test('fully built lamp/reader scene prepares before revealing its actor or allowing a real handoff',async()=>{
  const job=deferred();let calls=0;const f=fixture(async()=>{calls++;assert.ok(f.scene.getObjectByName('delivery-truck-reading-light'));assert.ok(f.reader());await job.promise;});
  f.enter();await flush();assert.equal(calls,1);assert.equal(f.reader().visible,false);assert.equal(f.module.status.canDrop,false);
  assert.match(f.module.status.instruction,/One moment/);assert.equal(f.module.cameraFocus,undefined);assert.deepEqual(f.reveals,[]);
  f.module.onDrop();assert.deepEqual(f.events,[],'loading is not a failed gameplay delivery');
  job.resolve();await flush();assert.equal(f.reader().visible,true);assert.deepEqual(f.reveals,['interiorEntered']);
  f.module.update(.05);assert.equal(f.module.status.canDrop,true);
  assert.equal(f.module.cameraFocus,undefined,'a headless graphics probe must not invent a face camera; exact-source framing is covered by truck-reader-camera');
  f.module.onDrop();advance(f.module,1.3);
  assert.deepEqual(f.events,['done']);assert.equal(calls,1);f.module.teardown();
});

test('failed cabin preparation remains hidden and retries after five active seconds without freezing its physical truck',async()=>{
  const first=deferred(),second=deferred();let calls=0;const f=fixture(()=>++calls===1?first.promise:second.promise);
  f.enter();await flush();first.reject(new Error('shader fixture'));await flush();
  assert.equal(f.reader().visible,false);assert.equal(f.module.status.canDrop,false);advance(f.module,4.8);await flush();assert.equal(calls,1);
  advance(f.module,.3);await flush();assert.equal(calls,2);assert.equal(f.reader().visible,false);assert.deepEqual(f.events,[]);
  second.resolve();await flush();f.module.update(.05);assert.equal(f.reader().visible,true);assert.equal(f.module.status.canDrop,true);
  f.module.teardown();
  const stalled=deferred(),pending=fixture(()=>stalled.promise,true),ordinary=fixture(undefined,true);
  advance(pending.module,3);advance(ordinary.module,3);await flush();
  const floor=(module:TruckInterior)=>module.supports.find(body=>body.id==='delivery-interior-floor')!;
  assert.equal(floor(pending.module).z,floor(ordinary.module).z);assert.ok(floor(pending.module).z>8,'preparation never stops physical route motion');
  pending.module.teardown();ordinary.module.teardown();stalled.resolve();await flush();
});

test('teardown and reused-scene epochs ignore stale successful or rejected graphics completions',async()=>{
  for(const rejects of [false,true]){
    const old=deferred(),current=deferred();let oldCalls=0,currentCalls=0;const f=fixture(()=>{oldCalls++;return old.promise;});f.enter();await flush();
    f.module.teardown();f.module.setup({...f.ctx,prepareCharacterGraphics:()=>{currentCalls++;return current.promise;}},{speed:6});f.p.z=-25;f.p.y=.55;f.enter();await flush();
    const before=f.reveals.length;if(rejects)old.reject(new Error('obsolete shader fixture'));else old.resolve();await flush();
    assert.equal(f.reader().visible,false);assert.equal(f.module.status.canDrop,false);assert.equal(f.reveals.length,before);assert.equal(oldCalls,1);assert.equal(currentCalls,1);
    current.resolve();await flush();f.module.update(.05);assert.equal(f.reader().visible,true);assert.equal(f.module.status.canDrop,true);f.module.teardown();
  }
});

test('a teardown before queued preparation never invokes an obsolete graphics callback and no-callback mechanics stay immediate',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;});f.module.teardown();await flush();assert.equal(calls,0);assert.equal(f.scene.children.length,0);
  const ordinary=fixture();ordinary.enter();assert.equal(ordinary.reader().visible,true);assert.equal(ordinary.module.status.canDrop,true);ordinary.module.teardown();
});
