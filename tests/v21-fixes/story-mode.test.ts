import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {StoryDirector,stepStoryPose} from '../../src/delivery/systems/story-director';
import {createDeliveryModule} from '../../src/delivery/modules';
import {loadLevels} from '../../src/delivery/content/levels';
import type {DeliveryPlayer,DeliveryModule} from '../../src/delivery/modules/types';
import type {MovingRailBody} from '../../src/game/moving-rail';
import type {MetroStationDwell} from '../../src/game/metro';

test('story capture has separate indefinite viewing, single Next and explicit reset; invalid paths cannot move the player',()=>{
  const d=new StoryDirector(),frame={entry:true,point:{x:2,y:.55,z:0}};
  assert.equal(d.tryStart(frame,false),false);assert.equal(d.tryStart({...frame,point:{x:NaN,y:0,z:0}},true),false);
  assert.equal(d.tryStart(frame,true),true);assert.equal(d.actionReady(.1,true),false);
  assert.equal(d.actionReady(.4,true),true);d.complete();
  for(let i=0;i<36000;i++)assert.equal(d.actionReady(.05,true),false);
  assert.equal(d.viewing,true);assert.equal(d.next(),true);assert.equal(d.next(),false);d.reset();assert.equal(d.captured,false);
  assert.equal(stepStoryPose({x:0,y:0,z:0,yaw:0},{...frame,point:{x:Infinity,y:0,z:0}},.05),null);
  const n=stepStoryPose({x:0,y:0,z:0,yaw:0},{...frame,point:{x:100,y:100,z:0}},1)!;
  assert.ok(n.x<=.4&&n.y<=.25,'a hitch cannot teleport the cinematic car');
});

function run(levelIndex:number,seconds=35){
  const level=loadLevels()[levelIndex],module=createDeliveryModule(level.module),scene=new THREE.Scene(),director=new StoryDirector();
  const p:DeliveryPlayer={x:0,y:.55,z:0,yaw:0,speed:0,flying:false,descending:false,jumping:false};let done=0;
  const train:MovingRailBody={id:'rail:story:2',x:0,y:0,z:0,hx:0,hz:1,roof:4.2,bottom:.2,halfLength:10,halfWidth:1.65,previous:{x:0,y:0,z:0,hx:0,hz:1}};
  module.setup({scene,destination:{x:0,y:0,z:0},automaticStories:true,storyActive:()=>director.captured,canInteract:()=>true,player:()=>p,
    route:[{x:0,y:0,z:0},{x:0,y:0,z:600}],trainBodies:()=>[train],existingTrain:()=>train,
    emit(type){if(type==='done'){done++;director.complete();}}},level.moduleParams);
  if(levelIndex===0)Object.assign(p,{x:0,z:-21,y:.55});
  else if(levelIndex===1)Object.assign(p,{x:0,z:-3,y:4.75});
  else if(level.moduleParams.realCampusId || level.moduleParams.theme === 'salaar')Object.assign(p,{x:module.target.x,z:module.target.z,y:.55,flying:false}); // the researched campus marker, not an arbitrary world-axis side
  else Object.assign(p,{x:module.target.x+10,z:module.target.z,y:8,flying:true});
  let started=false;
  const step=()=>{
    module.update(.05);if(director.tryStart(module.story,true))started=true;
    if(director.captured&&module.story){const n=stepStoryPose(p,module.story,.05)!;Object.assign(p,n,{flying:false,descending:false});}
    if(director.actionReady(.05,module.status.canDrop))module.onDrop();
  };
  for(let t=0;t<seconds;t+=.05)step();
  return {module,scene,p,director,step,get done(){return done;},get started(){return started;}};
}

for(const index of [0,1,2,3,4,5,6,7,8,10,11,12,13])test(`level ${index+1} uses its actual module geometry/gates and physical handoff before indefinite character viewing`,()=>{
  const f=run(index);
  assert.equal(f.started,true,'arrival must grant local story capture');
  assert.equal(f.done,1,`${loadLevels()[index].id}: ${JSON.stringify(f.module.status)}; pose ${JSON.stringify(f.p)}`);
  assert.equal(f.director.viewing,true);
  const before=f.scene.children.length;
  for(let i=0;i<200;i++)f.step();
  assert.equal(f.done,1);assert.equal(f.scene.children.length,before,'the physical scene remains until Next');
  if(index===2)assert.ok(f.p.y < -3,'Devara viewing remains submerged until Next, no early resurfacing');
  f.module.teardown();assert.equal(f.scene.children.length,0);
});

test('automatic gate and bucket approaches never pull the car through their property from behind',()=>{
  for(const [name,params] of [['gateDelivery',{theme:'haunted'}],['ropeBucket',{}]] as const){
    const scene=new THREE.Scene(),module=createDeliveryModule(name),p:DeliveryPlayer={x:0,y:.55,z:-7,yaw:0,speed:0,flying:false};
    module.setup({scene,destination:{x:0,y:0,z:0},player:()=>p,emit(){},automaticStories:true},params);module.update(.05);
    assert.equal(module.story?.entry,false,`${name}: a nearby rear-wall approach is not the front marker`);
    p.x=3;p.z=4;module.update(.05);assert.equal(module.story?.entry,true,`${name}: the open front approach remains automatic`);module.teardown();
  }
});

test('train proximity and flight do not grant story capture; a genuine landing on any marked coach does',()=>{
  const level=loadLevels()[1],module=createDeliveryModule(level.module),scene=new THREE.Scene();
  const p:DeliveryPlayer={x:0,y:7,z:-23,yaw:0,speed:0,flying:true};
  const body=(id:number,z:number):MovingRailBody=>({id:`rail:story:${id}`,x:0,y:0,z,hx:0,hz:1,roof:4.2,bottom:.2,halfLength:10,halfWidth:1.65,previous:{x:0,y:0,z,hx:0,hz:1}});
  const customer=body(2,0),rear=body(3,-23);
  module.setup({scene,destination:{x:0,y:0,z:0},player:()=>p,emit(){},automaticStories:true,existingTrain:()=>customer,trainBodies:()=>[customer,rear]},level.moduleParams);
  module.update(.05);assert.equal(module.story?.entry,false);assert.equal(module.storyArrivalReady,false);
  p.y=4.75;module.update(.05);assert.equal(module.story?.entry,false,'flying near the roof is not a landing');assert.equal(module.storyArrivalReady,false);
  p.flying=false;module.update(.05);assert.equal(module.story?.entry,true,'rear coach is a valid manual landing');assert.equal(module.storyArrivalReady,true);
  p.jumping=true;assert.equal(module.story?.entry,false);assert.equal(module.storyArrivalReady,false);module.teardown();
});

test('metro story waits for a manual marked-rake landing and actual next stop, clears the coach side before descending, and retains all four passengers',()=>{
  const scene=new THREE.Scene(),module=createDeliveryModule('metroRide'),director=new StoryDirector();let done=0;
  const body:MovingRailBody={id:'metro:blue:17:2',x:0,y:18.95,z:0,hx:0,hz:1,roof:22.725,bottom:19.1,halfWidth:1.5,halfLength:11.05,previous:{x:0,y:18.95,z:0,hx:0,hz:1}};
  const p:DeliveryPlayer={x:0,y:body.roof+.55,z:0,yaw:Math.PI,speed:0,flying:true};let dwells:MetroStationDwell[]=[];
  const stop=(id:string)=>{dwells=[{trainId:'metro:blue:17',stationId:id,lineId:'blue',direction:1,platformSide:1,elapsed:1,remaining:17,doors:[{x:-1.5,y:19.2,z:body.z,hx:0,hz:1}]}];};
  module.setup({scene,destination:{x:0,y:19.2,z:0},player:()=>p,canInteract:()=>true,automaticStories:true,
    existingTrain:()=>body,metroService:()=>({bodies:[body],dwells}),emit(type){if(type==='done'){done++;director.complete();}}},loadLevels()[9].moduleParams);
  stop('first');module.update(.05);assert.equal(module.story,undefined);assert.equal(director.captured,false);
  p.flying=false;module.update(.05);assert.equal(director.tryStart(module.story,true),true);dwells=[];
  for(let i=0;i<65;i++){body.previous.z=body.z;body.z+=1.1;p.z+=1.1;module.update(.05);}
  assert.equal(done,0);stop('next');
  for(let i=0;i<450;i++){
    module.update(.05);const frame=module.story!;const n=stepStoryPose(p,frame,.05)!;
    if(n.y<body.roof-.1)assert.ok(n.x<-(body.halfWidth+1.15),'whole car has cleared the coach before descending');
    Object.assign(p,n);if(director.actionReady(.05,module.status.canDrop))module.onDrop();
  }
  assert.equal(done,1);assert.equal(director.viewing,true);assert.equal(scene.getObjectByName('vakeel-platform-group')?.children.length,4);
  module.teardown();
});
