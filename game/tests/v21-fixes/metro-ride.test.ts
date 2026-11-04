import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MetroRide } from '../../src/delivery/modules/metro-ride';
import {METRO_DELIVERY_WALK_DISTANCE} from '../../src/delivery/metro-platform';
import type { DeliveryPlayer,DeliveryModuleContext } from '../../src/delivery/modules/types';
import type { MovingRailBody } from '../../src/game/moving-rail';
import type { MetroStationDwell } from '../../src/game/metro';
import levels from '../../src/delivery/content/levels.json';

const advance=(module:MetroRide,seconds:number)=>{for(let t=0;t<seconds-1e-8;t+=.05)module.update(.05);};
function fixture(){
  const scene=new THREE.Scene(),events:string[]=[],bodies:MovingRailBody[]=Array.from({length:3},(_,i)=>({id:`metro:blue:17:${i}`,x:0,y:18.95,z:(2-i)*22.1,hx:0,hz:1,halfWidth:1.5,halfLength:11.05,bottom:19.1,roof:22.725,previous:{x:0,y:18.95,z:(2-i)*22.1,hx:0,hz:1}}));
  const p:DeliveryPlayer={x:0,y:bodies[2].roof+.55,z:0,yaw:Math.PI,speed:0,flying:false,descending:false,jumping:false};
  let dwells:MetroStationDwell[]=[],present=true,unlocked=true;
  const dwell=(stationId:string):MetroStationDwell=>({trainId:'metro:blue:17',stationId,lineId:'blue',direction:1,platformSide:1,elapsed:1,remaining:17,
    doors:bodies.map(b=>({x:-1.5,y:19.2,z:b.z,hx:0,hz:1}))});
  const ctx:DeliveryModuleContext={scene,destination:{x:0,y:19.2,z:0},player:()=>p,canInteract:()=>unlocked,emit:e=>events.push(e),existingTrain:()=>present?bodies[2]:null,metroService:()=>({bodies:present?bodies:[],dwells})};
  const configuredLevel=levels.find(level=>level.module==='metroRide')!;
  const module=new MetroRide();module.setup(ctx,configuredLevel.moduleParams);
  return{scene,events,bodies,p,module,stop:(id:string)=>{dwells=[dwell(id)];},customStop:(stop:MetroStationDwell)=>{dwells=[stop];},dwell,depart:()=>{dwells=[];},removeTrain:()=>{present=false;dwells=[];},lock:()=>{unlocked=false;},unlock:()=>{unlocked=true;},
    board:(index=2)=>Object.assign(p,{x:bodies[index].x,y:bodies[index].roof+.55,z:bodies[index].z,flying:false,descending:false,jumping:false}),
    move:(distance:number,carry=true)=>{for(const b of bodies){b.previous={x:b.x,y:b.y,z:b.z,hx:b.hx,hz:b.hz};b.z+=distance;}if(carry)p.z+=distance;module.update(.05);}};
}
function arriveAtNextStation(f:ReturnType<typeof fixture>){f.stop('station-a');f.module.update(.05);f.depart();for(let i=0;i<65;i++)f.move(1.1);f.stop('station-b');f.module.update(.05);advance(f.module,3.5);}

test('metro delivery requires actual roof boarding, departure and travel to a different station door frame',()=>{
  const f=fixture();f.stop('station-a');advance(f.module,20);assert.equal(f.module.status.canDrop,false);assert.equal(f.scene.getObjectByName('vakeel-platform-group')!.visible,false,'waiting at the original station is not the next stop');
  f.depart();for(let i=0;i<65;i++)f.move(1.1);f.stop('station-a');f.module.update(.05);assert.equal(f.scene.getObjectByName('vakeel-platform-group')!.visible,false,'even a repeated dwell at the same station cannot satisfy the ride');
  f.depart();for(let i=0;i<65;i++)f.move(1.1);f.stop('station-b');f.module.update(.05);
  assert.equal(f.scene.getObjectByName('vakeel-platform-group')!.visible,true);assert.ok(Math.abs(f.module.target.x+3.65)<1e-8);assert.ok(Math.abs(f.module.target.z-(f.bodies[2].z-4.8))<1e-8,'parking stays beside the actual nearby rear-coach door, clear of the passenger row');
  const bay=f.scene.getObjectByName('delivery-target-ring')!;assert.equal(bay.scale.x,.43);assert.equal(bay.scale.y,.9);
  assert.equal(f.module.target.y,19.2);assert.equal(f.module.status.canDrop,false);assert.deepEqual(f.events,[]);f.module.teardown();
});

test('rear-coach boarding does not count the distance from that coach to the head as actual travel',()=>{
  const f=fixture();f.module.update(.05);for(let i=0;i<20;i++)f.move(1.1);f.stop('next');f.module.update(.05);advance(f.module,4);
  assert.equal(f.scene.getObjectByName('vakeel-platform-group')!.visible,false,'22m travelled plus a44m coach offset is still only22m travelled');assert.equal(f.module.status.canDrop,false);assert.deepEqual(f.events,[]);f.module.teardown();
});

test('flying directly to a platform cannot bypass the train ride or arrival gate',()=>{
  const f=fixture();Object.assign(f.p,{x:-7.3,y:19.75,z:0,flying:true});f.stop('destination');advance(f.module,10);f.module.onDrop();
  assert.ok(!f.events.includes('done'));assert.equal(f.module.status.canDrop,false);assert.equal(f.scene.getObjectByName('vakeel-platform-group')!.visible,false);
  Object.assign(f.p,{flying:false});advance(f.module,10);assert.equal(f.module.status.canDrop,false);
  f.board();f.lock();advance(f.module,5);f.module.onDrop();assert.ok(!f.events.includes('done'),'a roof landing itself never bypasses the host arrival lock');f.module.teardown();
});

test('falling before the next station clears ride progress and requires a fresh complete ride',()=>{
  const f=fixture();f.stop('station-a');f.module.update(.05);f.depart();for(let i=0;i<35;i++)f.move(1.1);
  f.p.y=19.75;f.p.x=8;f.module.update(.05);assert.match(f.module.status.instruction,/Reboard/);
  for(let i=0;i<70;i++)f.move(1.1,false);f.stop('station-b');advance(f.module,4);assert.equal(f.scene.getObjectByName('vakeel-platform-group')!.visible,false);
  f.board();f.module.update(.05);advance(f.module,4);assert.equal(f.module.status.canDrop,false,'reboarding at the destination does not recover the lost ride');
  f.depart();for(let i=0;i<65;i++)f.move(1.1);f.stop('station-c');f.module.update(.05);advance(f.module,3.5);assert.equal(f.module.status.actionLabel,'HAND OVER');f.module.teardown();
});

test('four gated actors exit in sequence, remain at the platform after train departure and complete only one grounded handoff',()=>{
  const f=fixture();arriveAtNextStation(f);const group=f.scene.getObjectByName('vakeel-platform-group')!;
  assert.equal(group.children.length,4);assert.ok(group.children.every(actor=>actor.userData.characterRelease==='withheld'),'unapproved faces remain absent');
  const finalPositions=group.children.map(actor=>actor.position.clone());f.removeTrain();advance(f.module,25);group.children.forEach((actor,i)=>assert.ok(actor.position.equals(finalPositions[i]),'platform group stays behind after the train leaves'));
  Object.assign(f.p,f.module.target,{y:f.module.target.y+.55,flying:true,speed:0});f.module.update(.05);assert.equal(f.module.status.canDrop,false,'handoff requires landing rather than hovering above the platform');
  f.p.flying=false;f.module.update(.05);assert.equal(f.module.status.canDrop,true);f.module.onDrop();f.module.onDrop();assert.ok(!f.events.includes('done'),'the physical pass must settle before completion');
  advance(f.module,.8);assert.equal(f.events.filter(e=>e==='done').length,1);f.module.onDrop();advance(f.module,5);assert.equal(f.events.filter(e=>e==='done').length,1);f.module.teardown();assert.equal(f.scene.children.length,0);
});

test('metro exit choreography starts at real door coordinates and delays each passenger without manufacturing visible stand-ins',()=>{
  const f=fixture();f.stop('a');f.module.update(.05);f.depart();for(let i=0;i<65;i++)f.move(1.1);f.stop('b');f.module.update(.05);
  const group=f.scene.getObjectByName('vakeel-platform-group')!;advance(f.module,.5);const first=group.children[0],last=group.children[3];
  assert.ok(first.position.x<last.position.x,'the lead passenger starts moving before the fourth');const world=new THREE.Vector3();first.getWorldPosition(world);assert.ok(Math.abs(world.y-19.2)<1e-8);
  const meshes:THREE.Object3D[]=[];group.traverse(node=>{if(node instanceof THREE.Mesh)meshes.push(node);});assert.equal(meshes.length,0);
  f.module.teardown();f.module.teardown();assert.equal(f.scene.children.length,0);
});

test('a station more than850m from boarding retains its nearby handoff scene and marker',()=>{
  const f=fixture();f.stop('a');f.module.update(.05);f.depart();for(let i=0;i<1000;i++)f.move(1.1);f.stop('b');f.module.update(.05);advance(f.module,3.5);
  const group=f.scene.getObjectByName('vakeel-platform-group')!;assert.equal(group.visible,true);assert.equal(group.parent!.visible,true,'live target visibility is independent of the old boarding coordinates');
  assert.equal(f.scene.getObjectByName('delivery-target-ring')!.visible,true);assert.ok(f.module.target.z>1000);f.module.teardown();
});

test('completed platform passengers persist near their live station without revived navigation, ride events or delivery marker',()=>{
  const f=fixture();f.stop('a');f.module.update(.05);f.depart();for(let i=0;i<1000;i++)f.move(1.1);
  f.stop('b');f.module.update(.05);advance(f.module,3.5);
  Object.assign(f.p,f.module.target,{y:f.module.target.y+.55,speed:0});f.module.update(.05);f.module.onDrop();advance(f.module,.8);
  assert.deepEqual(f.events,['done']);assert.equal(f.module.sceneryPending,true);assert.equal(f.scene.getObjectByName('delivery-target-ring')!.visible,false);
  const target={...f.module.target},group=f.scene.getObjectByName('vakeel-platform-group')!,positions=group.children.map(actor=>actor.position.clone());
  f.removeTrain();advance(f.module,3);assert.deepEqual(f.module.target,target);assert.equal(group.parent!.visible,true);
  group.children.forEach((actor,i)=>assert.ok(actor.position.equals(positions[i])));
  f.module.onDrop();advance(f.module,1);assert.deepEqual(f.events,['done']);assert.equal(f.module.status.canDrop,false);
  f.p.z=target.z+849;f.p.x=target.x;f.module.update(.05);assert.equal(f.module.sceneryPending,true,'distance follows the arrived station, not the old boarding origin');
  f.p.z=target.z+851;f.module.update(.05);assert.equal(f.module.sceneryPending,false);assert.equal(group.parent!.visible,false);
  f.module.teardown();assert.equal(f.module.sceneryPending,false);assert.equal(f.scene.children.length,0);
});

test('the retained metro receiver releases the real catch state after its handoff and keeps all four passengers in place',()=>{
  const f=fixture(),actor=(f.module as any).actors[0];let catchWeight=0;
  actor.catchPose=(weight:number)=>{catchWeight=weight;};
  arriveAtNextStation(f);Object.assign(f.p,f.module.target,{y:f.module.target.y+.55,speed:0});f.module.update(.05);
  assert.equal(f.module.status.canDrop,true);assert.equal(f.module.intentionalStop,true);
  f.module.onDrop();advance(f.module,.8);assert.deepEqual(f.events,['done']);assert.ok(catchWeight>0&&catchWeight<=1);
  const group=f.scene.getObjectByName('vakeel-platform-group')!,positions=group.children.map(child=>child.position.clone());
  const atCompletion=catchWeight;advance(f.module,.25);assert.ok(catchWeight>0&&catchWeight<atCompletion,'the receiving pose relaxes instead of snapping or staying held');
  advance(f.module,.5);assert.equal(catchWeight,0);advance(f.module,5);assert.equal(catchWeight,0);
  group.children.forEach((child,index)=>assert.ok(child.position.equals(positions[index])));assert.deepEqual(f.events,['done']);
  assert.equal(f.module.intentionalStop,true);f.p.speed=1;assert.equal(f.module.intentionalStop,false);f.p.speed=0;f.p.flying=true;assert.equal(f.module.intentionalStop,false);
  f.p.flying=false;f.p.y=0;assert.equal(f.module.intentionalStop,false,'the street below the platform is not a valid delivery stop');
  f.module.teardown();assert.equal(f.module.intentionalStop,false);assert.equal(f.scene.children.length,0);
});

test('an unavailable real platform is checked once per dwell and waits for a different actual station',()=>{
  const f=fixture();f.stop('a');f.module.update(.05);f.depart();for(let i=0;i<65;i++)f.move(1.1);
  let geometryReads=0;const bad=f.dwell('b');
  Object.defineProperty(bad,'platform',{get(){geometryReads++;return{deckHeight:18,frame:{cx:0,cz:0},corridor:{center:{pts:[],cum:[],len:0}}};}});
  f.customStop(bad);f.module.update(.05);const reads=geometryReads;assert.ok(reads>0);
  advance(f.module,8);assert.equal(geometryReads,reads,'immutable failed parking geometry is not rechecked every frame');
  assert.equal(f.scene.getObjectByName('vakeel-platform-group')!.visible,false);assert.equal(f.module.status.canDrop,false);
  f.depart();for(let i=0;i<65;i++)f.move(1.1);f.stop('c');f.module.update(.05);advance(f.module,3.5);
  assert.equal(f.scene.getObjectByName('vakeel-platform-group')!.visible,true);assert.equal(f.module.status.actionLabel,'HAND OVER');assert.deepEqual(f.events,[]);f.module.teardown();
});

test('pending camera geometry waits for streaming and retries the same actual station instead of rejecting its dwell',()=>{
  const f=fixture();(f.module as any).ctx.cameraPathClear=()=>undefined;
  arriveAtNextStation(f);
  assert.equal(f.scene.getObjectByName('vakeel-platform-group')!.visible,false);
  assert.equal((f.module as any).phase,'riding');assert.equal((f.module as any).unavailableStation,'');
  (f.module as any).ctx.cameraPathClear=()=>true;
  for(let frame=0;frame<30&&(f.module as any).phase!=='exiting';frame++)f.module.update(.05);
  assert.equal((f.module as any).phase,'exiting');assert.equal((f.module as any).exitTime,0,'the passenger clock starts only after the prepared scene is committed');
  advance(f.module,3.5);
  assert.equal((f.module as any).phase,'handoff');
  assert.equal(f.scene.getObjectByName('vakeel-platform-group')!.visible,true);
  assert.equal((f.module as any).unavailableStation,'');f.module.teardown();
});

test('bounded platform preparation keeps the marked roof, cancels on departure or player movement, and releases on teardown',()=>{
  const f=fixture();let calls=0;
  (f.module as any).ctx.automaticStories=true;
  (f.module as any).ctx.storyPoseClear=()=>{calls++;return true;};
  (f.module as any).ctx.cameraPathClear=()=>{calls++;return true;};
  f.stop('a');f.module.update(.05);f.depart();for(let i=0;i<65;i++)f.move(1.1);
  f.stop('b');f.module.update(.05);
  assert.equal((f.module as any).phase,'riding');assert.ok((f.module as any).exitPreparation);assert.ok(calls<=4);
  assert.equal(f.scene.getObjectByName('vakeel-platform-group')!.visible,false,'partially checked scene is never shown');
  const roof=f.module.story!;assert.equal(roof.entry,true);assert.equal(roof.point.y,f.bodies[2].roof+.55,'automatic story remains on its marked real roof while cold geometry prepares');
  f.depart();const before=calls;f.module.update(.05);assert.equal((f.module as any).exitPreparation,undefined);assert.equal(calls,before,'a departed train cannot continue an old platform plan');
  f.stop('b');f.module.update(.05);assert.ok((f.module as any).exitPreparation);
  f.p.x+=.5;const moved=calls;f.module.update(.05);assert.equal((f.module as any).exitPreparation,undefined);assert.equal(calls,moved,'a changed manual pose invalidates the prepared approach');
  f.module.update(.05);assert.equal((f.module as any).phase,'riding','moving within a still-valid roof retains the existing ride gate');
  f.module.teardown();const released=calls;advance(f.module,2);assert.equal(calls,released);assert.equal((f.module as any).exitPreparation,undefined);assert.deepEqual(f.events,[]);
});

test('platform framing stays inside the guard, requires visible actors and a deliberate parked stop, and releases for normal driving or flight',()=>{
  const f=fixture();arriveAtNextStation(f);Object.assign(f.p,f.module.target,{y:f.module.target.y+.55,speed:0});f.module.update(.05);
  assert.equal(f.module.cameraFocus,undefined,'withheld faces cannot trigger an empty character close-up');
  // Geometry-only fixture: this label exercises the camera gate, not visual approval.
  const group=f.scene.getObjectByName('vakeel-platform-group')!;group.children.forEach(actor=>actor.userData.characterRelease='released-test-fixture');
  const focus=f.module.cameraFocus!;assert.ok(focus);assert.equal(focus.context,'stationary-handoff');
  const {door,outward}=f.module as any,dx=focus.position.x-door.x-outward.x*METRO_DELIVERY_WALK_DISTANCE,dz=focus.position.z-door.z-outward.z*METRO_DELIVERY_WALK_DISTANCE;
  assert.ok(Math.abs(dx*outward.x+dz*outward.z-1.4)<1e-8,'camera remains on the platform side of the outer guard with the host collision margin');
  assert.ok(Math.hypot(focus.position.x-focus.target.x,focus.position.z-focus.target.z)>3.5,'a four-person group needs enough camera distance to avoid cropping a customer');
  assert.ok(Math.hypot(focus.position.x-f.p.x,focus.position.z-f.p.z)>5,'the close-up must remain clear of the parked Roadster cabin');
  assert.equal(f.module.headlightGain,.02);assert.equal(f.module.hideWorldGuidance,true);
  f.p.speed=1;assert.equal(f.module.cameraFocus,undefined);assert.equal(f.module.headlightGain,undefined);assert.equal(f.module.hideWorldGuidance,false);
  f.p.speed=0;f.p.flying=true;assert.equal(f.module.cameraFocus,undefined);f.p.flying=false;f.p.y-=6;assert.equal(f.module.cameraFocus,undefined);
  f.p.y=f.module.target.y+.55;f.module.onDrop();advance(f.module,2);assert.ok(f.module.cameraFocus,'nearby completed passengers retain their stationary framing');
  f.module.teardown();assert.equal(f.module.cameraFocus,undefined);assert.equal(f.module.sceneLamp,undefined);
});

test('the real door exit is framed from a stationary roof ride, starts at that door, and releases when the player moves or flies',()=>{
 const f=fixture();f.stop('a');f.module.update(.05);f.depart();for(let i=0;i<65;i++)f.move(1.1);
 const group=f.scene.getObjectByName('vakeel-platform-group')!;group.children.forEach(actor=>actor.userData.characterRelease='released-test-fixture');
 f.stop('b');f.module.update(.05);assert.equal((f.module as any).phase,'exiting');
 const focus=f.module.cameraFocus!;assert.ok(focus);assert.equal(f.module.hideWorldGuidance,true);assert.equal(f.module.headlightGain,.02);
 const {door,outward}=f.module as any;assert.ok(Math.abs(focus.target.x-(door.x+outward.x*.1))<1e-8);assert.ok(Math.abs(focus.target.z-(door.z+outward.z*.1))<1e-8);
 f.p.speed=1;assert.equal(f.module.cameraFocus,undefined);assert.equal(f.module.headlightGain,undefined);f.p.speed=0;f.p.flying=true;assert.equal(f.module.cameraFocus,undefined);assert.equal(f.module.headlightGain,undefined);f.p.flying=false;
 advance(f.module,3.5);assert.equal(f.module.cameraFocus,undefined,'the platform approach returns to normal roof driving after the brief real exit');
 f.module.teardown();
});
