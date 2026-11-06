import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MetroTrains } from '../../src/game/metro';
import { MetroRide } from '../../src/delivery/modules/metro-ride';
import type { DeliveryPlayer } from '../../src/delivery/modules/types';

function fixture(){
  const metro=new MetroTrains({lines:[{id:'blue',pts:[[0,0],[6000,0]]}],stations:[{id:'first',name:'First',p:[400,0],lines:['blue']},{id:'middle',name:'Middle',p:[2400,0],lines:['blue']},{id:'last',name:'Last',p:[5000,0],lines:['blue']}],deckHeight:11},{body:new THREE.MeshBasicMaterial(),lights:new THREE.MeshBasicMaterial()});
  // Browser-created destination textures are irrelevant to the service physics.
  (metro as any).displays={assign(){},setDoors(){},update(){}};
  metro.mesh=()=>{const group=new THREE.Group();for(let i=0;i<3;i++)group.add(new THREE.Group());metro.group.add(group);return group;};
  for(const t of metro.trains){t.terminal=true;t.dwell=10;t.v=0;}
  const active=metro.trains.find(t=>t.run.dir===1)!;active.terminal=false;active.s=1500;active.next=2400;active.v=4;
  return{metro,active};
}

test('story boarding rejects watched terminal trains and keeps an eligible preferred coach stable',()=>{
  const {metro,active}=fixture(),terminal=metro.trains.find(t=>t!==active&&t.run.dir===1)!;terminal.s=terminal.run.max;terminal.dwell=0;
  const before={s:terminal.s,run:terminal.run,terminal:terminal.terminal,cars:metro.group.children.length,trains:metro.trains.length};
  const target=metro.storyBoardingBody(`${terminal.id}:1`,6000,0);assert.ok(target);assert.ok(target.id.startsWith(active.id+':'));assert.notEqual(target.id,`${terminal.id}:1`);
  assert.equal(metro.storyBoardingBody(target.id,0,0)!.id,target.id,'moving the camera cannot randomly switch an eligible preferred train');
  assert.deepEqual({s:terminal.s,run:terminal.run,terminal:terminal.terminal,cars:metro.group.children.length,trains:metro.trains.length},before,'navigation never turns, erases or spawns a train');
});

test('virtual navigation uses the exact existing global pose and becomes the same live collision body when approached',()=>{
  const {metro,active}=fixture();const preferred=`${active.id}:2`,before=active.s,virtual=metro.storyBoardingBody(preferred,50000,0);assert.ok(virtual);assert.equal(metro.bodies.length,0);assert.equal(metro.group.children.length,0);
  assert.equal(active.s,before,'observing a train does not advance its clock');
  metro.update(0,virtual.x,virtual.z);const live=metro.bodies.find(b=>b.id===preferred)!;
  for(const key of['id','x','y','z','hx','hz','roof','bottom','halfWidth','halfLength','grade'] as const)assert.equal(live[key],virtual[key],`${key}: navigation and actual train use the same coach pose`);
  assert.equal(metro.storyBoardingBody(preferred,0,0),live,'nearby navigation reuses the actual live body');
});

test('a preferred train that reaches its last served station becomes ineligible before boarding',()=>{
  const {metro,active}=fixture(),preferred=metro.storyBoardingBody(`${active.id}:1`,0,0)!;
  const last=Math.max(...active.run.stationStops.map(s=>s.s));active.s=last-20;
  assert.equal(metro.storyBoardingBody(preferred.id,preferred.x,preferred.z),null,'20m before the final station cannot satisfy the required60m ride');
  active.s=last;active.terminal=true;assert.equal(metro.storyBoardingBody(preferred.id,preferred.x,preferred.z),null);
  const another=metro.trains.find(t=>t!==active&&t.run.dir===-1)!;another.terminal=false;another.s=3500;
  assert.ok(metro.storyBoardingBody(preferred.id,preferred.x,preferred.z)!.id.startsWith(another.id+':'),'a genuinely departing opposite service can be selected without moving the terminal train');
});

test('no-service preparation remains explicit and virtual navigation cannot impersonate a physically boarded train',()=>{
  const {metro,active}=fixture();const scene=new THREE.Scene(),events:string[]=[],target=metro.storyBoardingBody(`${active.id}:1`,0,0)!;
  const p:DeliveryPlayer={x:target.x,y:target.roof+.55,z:target.z,yaw:0,speed:0,flying:false};
  const module=new MetroRide();module.setup({scene,destination:{x:10000,y:11,z:0},player:()=>p,canInteract:()=>true,emit:e=>events.push(e),
    existingTrain:()=>metro.storyBoardingBody(target.id,p.x,p.z),metroService:()=>({bodies:[],dwells:[]})},{});
  for(let i=0;i<100;i++)module.update(.05);module.onDrop();assert.ok(!events.includes('done'));assert.equal(module.status.canDrop,false,'a virtual target is navigation only, never roof support');
  active.terminal=true;for(let i=0;i<100;i++)module.update(.05);assert.match(module.status.instruction,/Waiting for a departing metro service/);assert.ok(!events.includes('done'));module.teardown();
  assert.equal(scene.children.length,0);
});
