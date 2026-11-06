import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DeliveryRuntime} from '../../src/delivery/runtime';
import {StoryDirector} from '../../src/delivery/systems/story-director';
import type {ModuleStoryFrame} from '../../src/delivery/modules/types';

function fixture(){
 const frame:ModuleStoryFrame={entry:true,allowMovingEntry:true,point:{x:10,y:.55,z:20},yaw:.2,speed:12,maxSpeed:4};
 const player={pos:new THREE.Vector3(10,.55,20),group:new THREE.Group(),yaw:.2,speed:12,vy:0,
  flying:false,descending:false,bump:0,steerVis:0,lastSupport:0,onRoad:true,wheelRollers:[new THREE.Group()],wheels:[]};
 const runtime=Object.create(DeliveryRuntime.prototype) as DeliveryRuntime;
 Object.assign(runtime,{game:{player},director:new StoryDirector(),module:{get story(){return frame;}}});
 runtime.director.phase='playing';return {runtime,frame,player};
}
test('variable traffic frames keep the Roadster on its authored moving-carrier pose in the same rendered frame',()=>{
 const {runtime,frame,player}=fixture();
 for(let i=0;i<160;i++){
  const dt=[1/120,1/60,1/24,.05][i%4];
  runtime.afterPlayer(dt);
  // This is the one normal traffic tick, after afterPlayer and before camera.
  frame.yaw!+=.08*dt;frame.point.x-=Math.sin(frame.yaw!)*12*dt;frame.point.z-=Math.cos(frame.yaw!)*12*dt;
  frame.point.y=.55+.2*Math.sin(i*.03);
  runtime.afterTraffic(dt);
  assert.ok(player.pos.distanceTo(new THREE.Vector3(frame.point.x,frame.point.y,frame.point.z))<1e-10);
  assert.ok(Math.abs(player.yaw-frame.yaw!)<1e-10);
  assert.ok(player.group.position.distanceTo(player.pos)<1e-10);
  assert.equal(player.lastSupport,player.pos.y-.55);
  const once=player.pos.clone(),wheel=player.wheelRollers[0].rotation.x;
  runtime.afterTraffic(dt);assert.deepEqual(player.pos,once,'a duplicate callback cannot apply carry twice');
  assert.equal(player.wheelRollers[0].rotation.x,wheel);
 }
});
test('carrier turn preserves an approach offset instead of snapping or trailing one traffic frame behind',()=>{
 const {runtime,frame,player}=fixture();player.pos.add(new THREE.Vector3(2,.2,-3));
 runtime.afterPlayer(1/60);const offset=player.pos.clone().sub(new THREE.Vector3(frame.point.x,frame.point.y,frame.point.z));
 const oldYaw=player.yaw;frame.point={x:20,y:1.55,z:30};frame.yaw!+=Math.PI/2;
 runtime.afterTraffic(1/60);
 assert.ok(player.pos.distanceTo(new THREE.Vector3(20+offset.z,1.55+offset.y,30-offset.x))<1e-10);
 assert.ok(Math.abs(player.yaw-oldYaw-Math.PI/2)<1e-10);
});
test('normal driving, original stationary stories, transition and invalid frames do not receive moving-story carry',()=>{
 for(const mode of ['driving','stationary','transition','invalid','zero'] as const){
  const {runtime,frame,player}=fixture();
  if(mode==='driving')runtime.director.phase='driving';
  if(mode==='stationary')frame.allowMovingEntry=false;
  runtime.afterPlayer(1/60);const prior=player.pos.clone();
  frame.point.x+=10;
  if(mode==='transition')runtime.director.phase='transition';
  if(mode==='invalid')frame.point.z=NaN;
  runtime.afterTraffic(mode==='zero'?0:1/60);
  assert.deepEqual(player.pos,prior,mode);
 }
});
