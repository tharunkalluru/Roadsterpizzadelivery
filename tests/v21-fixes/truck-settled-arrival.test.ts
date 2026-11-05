import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TruckInterior } from '../../src/delivery/modules/truck-interior';
import { StoryLandingGate } from '../../src/delivery/systems/story-landing';
import type { DeliveryPlayer } from '../../src/delivery/modules/types';

test('automatic delivery truck brakes for a real rear approach and holds its blue marker for a stationary arrival',()=>{
  const module=new TruckInterior(),scene=new THREE.Scene();
  const p:DeliveryPlayer={x:200,y:.55,z:0,yaw:0,speed:0,verticalSpeed:0};
  module.setup({scene,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:2000}],
    player:()=>p,automaticStories:true,storyActive:()=>false,canInteract:()=>false,emit(){}},{speed:8});
  for(let i=0;i<100;i++)module.update(.05);
  const movingZ=module.target.z;module.update(.05);assert.ok(module.target.z>movingZ,'truck is ordinary moving traffic before approach');
  Object.assign(p,{x:module.target.x,z:module.target.z,y:.55,speed:6,flying:true});
  for(let i=0;i<10;i++){p.z=module.target.z;module.update(.05);}
  const flyingZ=module.target.z;module.update(.05);assert.ok(module.target.z>flyingZ,'overflight cannot request the delivery stop');
  Object.assign(p,{x:module.target.x,z:module.target.z,y:.55,speed:6,flying:false});
  for(let i=0;i<90;i++){module.update(.05);p.z=module.target.z;}
  p.speed=0;const stoppedZ=module.target.z,gate=new StoryLandingGate();let captured=false;
  for(let i=0;i<20;i++){module.update(.05);captured=gate.update(.05,p,module.story,0,true)||captured;}
  assert.equal(module.target.z,stoppedZ,'braked rear marker remains available for the continuous settled hold');
  assert.equal(captured,true);assert.equal(module.supports.some(b=>b.id==='delivery-interior-ramp'),false,'settling alone never opens the locked door');
  module.teardown();
});
