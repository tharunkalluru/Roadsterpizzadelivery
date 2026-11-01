import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ModuleBase } from '../../src/delivery/modules/base';
import { TruckInterior } from '../../src/delivery/modules/truck-interior';
import { WalkingHandoff } from '../../src/delivery/modules/street-scenes';
import { serializeCharacterRigContract } from '../../src/delivery/art/released-gltf';
import type { SceneCharacter } from '../../src/delivery/modules/character';
import type { DeliveryModuleContext } from '../../src/delivery/modules/types';

const actor=(space:'palm-contact'|'box-center'):SceneCharacter=>{
 const group=new THREE.Group(),leftArm=new THREE.Group(),rightArm=new THREE.Group(),catchPoint=new THREE.Object3D();
 catchPoint.name='ActualPalmAnchor';catchPoint.position.y=space==='box-center'?1.035:1;group.add(leftArm,rightArm,catchPoint);
 return {group,leftArm,rightArm,catchPoint,catchPointSpace:space,catchPose(){}};
};
class Probe extends ModuleBase{
 private receiver!:SceneCharacter;
 protected build(){this.receiver=this.character('extra',0,0,0);}
 update(dt:number){if(this.tick(dt))this.advanceHandoff(dt);}
 onDrop(){this.beginHandoff(this.receiver,()=>this.done());}
}
const step=(module:{update(dt:number):void},seconds:number)=>{for(let t=0;t<seconds-1e-8;t+=.05)module.update(.05);};
test('generic handoff places the same physical box underside on palms for either explicit anchor convention',()=>{
 for(const space of ['palm-contact','box-center'] as const){
  const scene=new THREE.Scene(),module=new Probe(),receiver=actor(space);
  module.setup({scene,destination:{x:0,y:0,z:0},player:()=>({x:0,y:.55,z:3,yaw:0,speed:0}),emit(){},characterFactory:()=>receiver},{immersiveHandoff:true});
  module.onDrop();step(module,.65);const pizza=scene.getObjectByName('delivery-handoff-pizza')!;
  assert.ok(Math.abs(pizza.position.y-.035-1)<1e-8,`${space} must not double-add half the pizza thickness`);module.teardown();
 }
});
test('moving container handoff respects the same authored centre/contact convention in its vehicle coordinates',()=>{
 for(const space of ['palm-contact','box-center'] as const){
  const scene=new THREE.Scene(),module=new TruckInterior(),player={x:.55,y:.55,z:-25,yaw:Math.PI,speed:0};let receiver:SceneCharacter|undefined;
  const ctx:DeliveryModuleContext={scene,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:300}],player:()=>player,vehicleSpeedLimit:()=>0,emit(){},characterFactory:style=>{
   const result=actor(space);if(style==='pushpa')receiver=result;return result;
  }};
  module.setup(ctx,{speed:6});step(module,2);player.y=2.1;player.z=-8.5;module.update(.05);player.z=-7.5;module.update(.05);player.z=2;step(module,.7);
  assert.equal(module.status.canDrop,true);module.onDrop();step(module,.75);scene.updateMatrixWorld(true);
  const pizza=scene.getObjectByName('delivery-truck-handoff-pizza')!,actual=new THREE.Vector3(),anchor=new THREE.Vector3();pizza.getWorldPosition(actual);receiver!.catchPoint!.getWorldPosition(anchor);
  assert.ok(Math.abs(actual.y-anchor.y-(space==='box-center'?0:.035))<1e-8);module.teardown();
 }
});
test('a walking street handoff also rests the carton underside on the moving palm rather than intersecting it',()=>{
 for(const space of ['palm-contact','box-center'] as const){
  const scene=new THREE.Scene(),module=new WalkingHandoff(),receiver=actor(space),player={x:0,y:.55,z:0,yaw:0,speed:.7,flying:false};
  module.setup({scene,destination:{x:0,y:0,z:0},player:()=>player,emit(){},characterFactory:()=>receiver},{walkSpeed:.7});
  step(module,8);Object.assign(player,{x:module.target.x+3,z:module.target.z});module.update(.05);assert.equal(module.status.canDrop,true);
  module.onDrop();step(module,.8);scene.updateMatrixWorld(true);
  const actual=new THREE.Vector3(),anchor=new THREE.Vector3();scene.getObjectByName('delivery-scene-pizza')!.getWorldPosition(actual);receiver.catchPoint!.getWorldPosition(anchor);
  assert.ok(Math.abs(actual.y-anchor.y-(space==='box-center'?0:.035))<1e-8);module.teardown();
 }
});
test('the coordinate convention is fingerprinted with the reviewed contract rather than inferred from the character name',()=>{
 const base={id:'fixture',sceneName:'Root',requireSkin:true,nodes:{leftArm:'L',rightArm:'R',catchPoint:'Catch'},pose:{mode:'authored-static' as const},height:{min:1,max:2},materialTreatment:'as-authored' as const};
 assert.notEqual(serializeCharacterRigContract({...base,catchPointSpace:'palm-contact'}),serializeCharacterRigContract({...base,catchPointSpace:'box-center'}));
 assert.ok(!serializeCharacterRigContract(base).includes('catchPointSpace'),'older palm-contact contracts preserve their exact serialization');
});
