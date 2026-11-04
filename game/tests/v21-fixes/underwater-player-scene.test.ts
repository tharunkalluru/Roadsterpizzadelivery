import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player,type Input } from '../../src/game/player';
import { MovingRailInteraction } from '../../src/game/moving-rail';
import { Underwater } from '../../src/delivery/modules/underwater';
import { waterGrid } from '../../src/world/water';

const idle:Input={throttle:0,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false};
function player(){
  return Object.assign(Object.create(Player.prototype),{
    city:{group:new THREE.Group(),surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[],waterGrid:waterGrid([{kind:'water',cls:'water',sub:'lake',name:'Lake',ring:[[-300,-300],[300,-300],[300,300],[-300,300]]}])},
    pos:new THREE.Vector3(0,.45,0),yaw:0,speed:0,vy:0,steerVis:0,flying:true,descending:false,onRoad:false,lastSupport:0,lastKind:'water',lastElevRoad:false,
    hitCooldown:0,bump:0,flyAlt:.45,altT:0,kerbT:0,glide:null,jumpActive:false,jumpHeld:false,jumpCooldown:0,jumpBodyTop:2.4,jumpStartY:0,jumpElapsed:0,
    jumpForcedFall:false,jumpCooldownPendingLanding:false,jumpCollisionMeshes:[],jumpBoundsDirty:true,jumpBounds:{bottom:0,top:0},placementRevision:0,
    group:new THREE.Group(),glow:new THREE.Group(),light:new THREE.Group(),wheels:[],wheelRollers:[],animateThrusters(){},
  }) as Player;
}

for(const hz of[30,60])test(`production Player dives, limits GO/brake, safely leaves/reenters the scene and returns to surface at${hz}Hz`,()=>{
  const p=player(),module=new Underwater(),contacts=new MovingRailInteraction(),events:string[]=[],dt=1/hz;let time=0,wasDiving=false;
  module.setup({scene:new THREE.Scene(),destination:{x:0,y:0,z:0},player:()=>({...p.pos,yaw:p.yaw,speed:p.speed,flying:p.flying,jumping:p.jumping,descending:p.descending}),canInteract:()=>true,emit:e=>events.push(e)},{scene:'devaraUnderwater',depth:6});
  const tick=(input:Input=idle)=>{
    module.update(dt);const movement=module.movement;
    p.deliveryMotion=movement.mode!=='normal'&&movement.center?{mode:movement.mode,x:movement.center.x,z:movement.center.z,radius:movement.radius??80,altitude:movement.mode==='underwater'?movement.center.y-(movement.depth??4):movement.altitude??movement.center.y+3}:undefined;
    if(wasDiving&&movement.mode!=='underwater'&&p.pos.y<.3){p.flying=true;p.descending=false;p.altT=0;}wasDiving=movement.mode==='underwater';
    p.city.movingRail=[...module.supports];contacts.beforePlayer(p,p.city.movingRail,false,dt);p.update(dt,input,time+=dt);contacts.afterPlayer(p,dt);
    assert.ok([p.pos.x,p.pos.y,p.pos.z,p.speed,p.vy].every(Number.isFinite));
  };
  tick();assert.equal(module.status.actionLabel,'DIVE');module.onDrop();for(let i=0;i<hz*9;i++)tick();
  assert.ok(Math.abs(p.pos.y+6)<.08);assert.equal(module.status.actionLabel,'PLACE PIZZA');assert.ok(Math.abs(p.pos.x)<.1&&Math.abs(p.pos.z)<.1,`settling must not eject the stationary diving car: ${JSON.stringify(p.pos)}`);
  for(let i=0;i<hz*2;i++){tick({...idle,throttle:1});assert.ok(p.speed<=8,'the pre-movement underwater clamp bounds flight acceleration');}
  for(let i=0;i<hz;i++)tick({...idle,brake:1,allowReverse:false});assert.ok(Math.abs(p.speed)<.001,'braking can stop without unwanted reverse');
  let guard=0;while(Math.abs(p.pos.z)<=63&&guard++<hz*15)tick({...idle,throttle:1});assert.ok(guard<hz*15);const deepest=p.pos.y;
  for(let i=0;i<hz;i++)tick({...idle,brake:1,allowReverse:false});assert.ok(p.pos.y>deepest,'leaving the assistance radius safely resumes flight toward the surface');assert.ok(!events.includes('done'));
  guard=0;while(p.pos.z<-4&&guard++<hz*35)tick({...idle,brake:1,allowReverse:true});assert.ok(guard<hz*35,'ordinary reverse control returns to the marker');
  for(let i=0;i<hz*9;i++)tick({...idle,brake:1,allowReverse:false});assert.ok(Math.abs(p.pos.y+6)<.08,'reentering the real lake radius restores the dive without failure');
  assert.ok(Math.abs(p.pos.z)<8);assert.equal(module.status.canDrop,true,JSON.stringify({pos:p.pos,speed:p.speed,events,status:module.status,target:module.target}));module.onDrop();
  for(let i=0;i<hz*12&&!events.includes('done');i++)tick();assert.equal(events.filter(e=>e==='done').length,1);assert.ok(p.pos.y>=-.35,'completion waits for actual safe surfacing');module.teardown();
});
