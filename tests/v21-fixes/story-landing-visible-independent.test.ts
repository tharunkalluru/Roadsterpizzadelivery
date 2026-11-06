import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createDeliveryModule} from '../../src/delivery/modules';
import {loadLevels} from '../../src/delivery/content/levels';
import {StoryLandingGate,storyLandingZone,storyLandingMarker} from '../../src/delivery/systems/story-landing';
import type {DeliveryPlayer} from '../../src/delivery/modules/types';
import type {MovingRailBody} from '../../src/game/moving-rail';

for(let index=0;index<14;index++)test(`level ${index+1}: safe blue marker, navigation point and physical stopped entry agree`,()=>{
  const level=loadLevels()[index],module=createDeliveryModule(level.module),scene=new THREE.Scene();
  const player:DeliveryPlayer={x:0,y:.55,z:30,yaw:0,speed:0,flying:false,descending:false,jumping:false,verticalSpeed:0};
  const body:MovingRailBody={id:index===9?'metro:blue:1:2':'rail:story:2',x:0,y:0,z:0,hx:0,hz:1,roof:4.2,bottom:.2,
    halfWidth:1.65,halfLength:10,previous:{x:0,y:0,z:0,hx:0,hz:1}};
  let interactive=false;
  module.setup({scene,destination:{x:0,y:0,z:0},player:()=>player,automaticStories:true,canInteract:()=>interactive,
    route:[{x:0,y:0,z:0},{x:0,y:0,z:600}],existingTrain:()=>body,trainBodies:()=>[body],metroService:()=>({bodies:[body],dwells:[]}),emit(){}},level.moduleParams);
  module.update(.05);
  if(index===1||index===9){Object.assign(player,{x:0,y:4.75,z:0,railSupportId:body.id});interactive=true;module.update(.05);}
  let frame=module.story;assert.ok(frame,`${level.id}: authored entry frame exists`);
  let landing=storyLandingZone(frame)!;
  Object.assign(player,landing.point);module.update(.05);frame=module.story!;landing=storyLandingZone(frame)!;
  Object.assign(player,landing.point);
  module.setStoryPresentation?.(false,landing);
  const ring=scene.getObjectByName('delivery-target-ring')!;assert.ok(ring?.visible,'uncaptured marker is visible');
  const world=ring.getWorldPosition(new THREE.Vector3()),nav=storyLandingMarker(landing);
  assert.ok(Math.hypot(world.x-nav.x,world.z-nav.z)<1e-8,'same XZ point drives map/blue ring');
  assert.ok(Math.abs(world.y-nav.y-.08)<1e-8,'ring is 8cm above its selected surface');
  const support=index===2?-1.28/3:landing.point.y-.55;
  if(index===2)player.y=support+.55;
  const gate=new StoryLandingGate();for(let i=0;i<7;i++)assert.equal(gate.update(.05,player,frame,support,true),false);
  assert.equal(gate.update(.05,player,frame,support,true),true,'stopped visible approach is capturable');
  const variants=[{...player,flying:true},{...player,jumping:true},{...player,speed:1},
    {...player,x:landing.point.x+landing.radius+1},{...player,y:player.y+4}];
  for(const variant of variants){const negative=new StoryLandingGate();for(let i=0;i<15;i++)assert.equal(negative.update(.05,variant,frame,support,true),false);}
  module.setStoryPresentation?.(true,landing);assert.equal(ring.visible,false,'story hides its approach marker');
  module.teardown();assert.equal(scene.children.length,0);
});

test('the basket has a separate approach bay and Salaar shares the exterior stop for landing and delivery',()=>{
  for(const index of [3,11]){
    const level=loadLevels()[index],module=createDeliveryModule(level.module),scene=new THREE.Scene();
    const player:DeliveryPlayer={x:0,y:.55,z:4,yaw:0,speed:0};
    module.setup({scene,destination:{x:0,y:0,z:0},player:()=>player,automaticStories:true,canInteract:()=>false,emit(){}},level.moduleParams);
    module.update(.05);const zone=storyLandingZone(module.story)!;
    const separation = Math.hypot(zone.point.x-module.target.x, zone.point.z-module.target.z);
    if(index===11)assert.equal(separation,0,'the car stays at its exterior stopping point');
    else assert.ok(separation>4);
    module.teardown();
  }
});

test('street-scene carton leaves the trunk once, when a real physical pass starts',()=>{
  const level=loadLevels()[12],module=createDeliveryModule(level.module),scene=new THREE.Scene();
  const player:DeliveryPlayer={x:0,y:.55,z:0,yaw:0,speed:0};let catches=0;
  module.setup({scene,destination:{x:0,y:0,z:0},player:()=>player,canInteract:()=>true,emit(){},sceneEvent(kind){if(kind==='catchStarted')catches++;}},level.moduleParams);
  Object.assign(player,{...module.target,y:.55});module.update(.05);assert.equal(module.status.canDrop,true);
  module.onDrop();module.onDrop();assert.equal(catches,1,'only a successful transfer starts the single cargo handoff');
  module.teardown();
});
