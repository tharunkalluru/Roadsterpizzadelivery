import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { initTemplates } from '../../src/core/util';
import { RailTrains } from '../../src/game/rail';
import { buildRailwayRun, railwayPoint, type RailwayTrack } from '../../src/game/railway-flow';
import { buildRailwayStoryRoute, findRailwayStoryRoute, STORY_RAIL_STATIONS } from '../../src/game/railway-story-route';
import { railwayNetwork } from '../../src/world/railway-geometry';
import { MovingRailInteraction } from '../../src/game/moving-rail';
import { Player,type Input } from '../../src/game/player';

initTemplates({rbox:new THREE.BoxGeometry(1,1,1)});
const idle:Input={throttle:0,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false};
function rider(){return Object.assign(Object.create(Player.prototype),{
  city:{group:new THREE.Group(),surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[]},
  pos:new THREE.Vector3(),yaw:0,speed:0,vy:0,steerVis:0,flying:false,descending:false,onRoad:false,lastSupport:0,lastKind:'rail',lastElevRoad:false,
  hitCooldown:0,bump:0,flyAlt:24,altT:0,kerbT:0,glide:null,jumpActive:false,jumpHeld:false,jumpCooldown:0,jumpBodyTop:2.4,jumpStartY:0,jumpElapsed:0,
  jumpForcedFall:false,jumpCooldownPendingLanding:false,jumpCollisionMeshes:[],jumpBoundsDirty:true,jumpBounds:{bottom:0,top:0},placementRevision:0,
  group:new THREE.Group(),glow:new THREE.Group(),light:new THREE.Group(),wheels:[],wheelRollers:[],animateThrusters(){},
}) as Player;}

test('actual Ghatkesar to HITEC City story route consists only of exact canonical rail segments near both stations',()=>{
  const run=buildRailwayStoryRoute();assert.ok(run);assert.equal(buildRailwayStoryRoute(),run,'route preparation is cached outside the frame loop');
  assert.ok(run.len>31000&&run.len<45000,`plausible rail route length ${run.len}`);
  assert.ok(Math.hypot(run.pts[0][0]-STORY_RAIL_STATIONS.ghatkesar.x,run.pts[0][2]-STORY_RAIL_STATIONS.ghatkesar.z)<=120);
  assert.ok(Math.hypot(run.pts.at(-1)![0]-STORY_RAIL_STATIONS.hitecCity.x,run.pts.at(-1)![2]-STORY_RAIL_STATIONS.hitecCity.z)<=120);
  const edges=new Set<string>(),encode=(a:readonly number[],b:readonly number[])=>`${a.join(',')}|${b.join(',')}`;
  for(const profile of railwayNetwork().profiles)for(let i=1;i<profile.pts.length;i++){
    const a=[profile.pts[i-1][0],profile.elev[i-1]+.11,profile.pts[i-1][1]],b=[profile.pts[i][0],profile.elev[i]+.11,profile.pts[i][1]];
    edges.add(encode(a,b));edges.add(encode(b,a));
  }
  for(let i=1;i<run.pts.length;i++)assert.ok(edges.has(encode(run.pts[i-1],run.pts[i])),`segment ${i} is an actual connected source edge`);
  assert.ok(run.ways.every(w=>!railwayNetwork().byId.get(w.id)!.service),'passenger service never uses yard sidings');
});

test('story routing refuses nearby unjoined endpoints and grade-separated crossings rather than inventing a connector',()=>{
  for(const track of [
    {pts:[[500.1,0],[1000,0]]},
    {pts:[[500,0],[1000,0]],elev:[3,3]},
  ] as RailwayTrack[]){
    const rails=new Map<string,RailwayTrack>([['west',{pts:[[0,0],[500,0]]}],['east',track]]);
    assert.equal(findRailwayStoryRoute(rails,{x:0,z:0},{x:1000,z:0},10),null);
  }
  const linked=new Map<string,RailwayTrack>([['west',{pts:[[0,0],[500,0]]}],['east',{pts:[[500,0],[1000,0]]}]]);
  assert.equal(findRailwayStoryRoute(linked,{x:0,z:0},{x:1000,z:0},10)?.len,1000);
});

test('Vande Bharat dwells then reverses twice without turning, reindexing, losing a coach or a production Player rider',()=>{
  const tracks=new Map<string,RailwayTrack>([['story',{pts:[[0,0],[1000,0]]}]]),run=buildRailwayRun(tracks,tracks.get('story')!);
  const rail=new RailTrains(new THREE.MeshBasicMaterial()),id=rail.ensureStoryShuttle(run,{x:870,z:0});assert.ok(id);
  assert.equal(rail.ensureStoryShuttle(run,{x:0,z:0}),id,'repeated host updates keep the same train');
  const train=rail.trains[0],p=rider(),contact=new MovingRailInteraction();let previousDir=train.dir,reversals=0,dwellFrames=0;
  const coach=rail.storyCoach(id)!;p.pos.set(coach.x,coach.roof+.55,coach.z);p.yaw=-Math.PI/2;
  const ids=rail.bodies.map(b=>b.id);assert.equal(ids.length,8);assert.ok(train.cars[0].name.includes('Vande Bharat'));assert.ok(train.cars.at(-1)!.name.includes('Vande Bharat'));
  for(let i=0;i<4000&&reversals<2;i++){
    const before=rail.bodies.map(b=>({x:b.x,z:b.z,hx:b.hx,hz:b.hz}));
    rail.update(.05,p.pos.x,p.pos.z,tracks);p.city.movingRail=rail.bodies;
    contact.beforePlayer(p,rail.bodies,false,.05);p.update(.05,idle,i*.05);const result=contact.afterPlayer(p,.05);
    assert.equal(result.carried,true,`roof contact remains continuous at frame ${i}`);assert.equal(result.hit,false);
    assert.deepEqual(rail.bodies.map(b=>b.id),ids);assert.ok(train.cars.every(c=>c.visible));
    if(train.v===0)dwellFrames++;
    if(train.dir!==previousDir){
      reversals++;previousDir=train.dir;
      rail.bodies.forEach((b,k)=>{assert.ok(Math.hypot(b.x-before[k].x,b.z-before[k].z)<1e-8,'reverse changes velocity, never formation position');assert.equal(b.hx,before[k].hx);assert.equal(b.hz,before[k].hz);});
    }
    assert.ok(Math.abs(p.pos.y-(rail.storyCoach(id)!.roof+.55))<.01);
    const leading=rail.approaches[0];if(train.dir<0)assert.ok(leading.s<train.s-180,'road crossings see the correct rear cab as the new leading end');
  }
  assert.equal(reversals,2);assert.ok(dwellFrames>=98,'both terminal dwells last at least 2.5s');
});

test('active shuttle stays pinned without extending past terminals; clearing only retires the whole distant rake',()=>{
  const tracks=new Map<string,RailwayTrack>([['story',{pts:[[0,0],[1000,0]]}],['beyond',{pts:[[1000,0],[2000,0]]}]]),run=buildRailwayRun(new Map([['story',tracks.get('story')!]]),tracks.get('story')!);
  const rail=new RailTrains(new THREE.MeshBasicMaterial()),id=rail.ensureStoryShuttle(run,{x:500,z:0});assert.ok(id);
  for(let i=0;i<50;i++)rail.update(.1,10000,10000,tracks);
  assert.equal(rail.trains[0].run,run);assert.equal(rail.bodies.length,8,'a story target never vanishes when the player is far away');
  assert.equal(rail.trains.length,1,'random spawning never claims the reserved route');
  rail.clearStoryShuttle();const at=rail.storyCoach(id)!;rail.update(.1,at.x,at.z,tracks);assert.equal(rail.bodies.length,8,'clearing does not erase an onscreen or ridden train');
  rail.update(.1,10000,10000,tracks);assert.equal(rail.bodies.length,0);assert.equal(rail.group.children.length,0);
});

test('booking a safely aligned occupied route adopts the existing rake without moving, reindexing or raising its rider roofs',()=>{
  const tracks=new Map<string,RailwayTrack>([['story',{pts:[[0,0],[1000,0]]}]]),run=buildRailwayRun(tracks,tracks.get('story')!);
  const rail=new RailTrains(new THREE.MeshBasicMaterial()),cars=Array.from({length:8},()=>new THREE.Mesh());rail.group.add(...cars);
  rail.trains.push({id:'rail:visible',run,s:600,dir:1,v:15,cars});rail.update(0,500,0,tracks);
  const before=rail.bodies.map(b=>[b.id,b.x,b.y,b.z,b.hx,b.hz,b.roof,b.halfLength]);assert.equal(rail.ensureStoryShuttle(run,{x:500,z:0}),'rail:visible');
  assert.deepEqual(rail.bodies.map(b=>[b.id,b.x,b.y,b.z,b.hx,b.hz,b.roof,b.halfLength]),before);assert.equal(rail.trains[0].id,'rail:visible');assert.equal(rail.group.children.length,8);
  assert.ok(rail.trains[0].story?.active);assert.ok(cars.every(c=>c.name.startsWith('Vande Bharat')));
});

test('adoption extends a stopped partial corridor in either orientation without a coach pose jump',()=>{
  for(const direction of[1,-1] as const){
    const oldTracks=new Map<string,RailwayTrack>([['inside',{pts:[[0,0],[1000,0]]}]]),old=buildRailwayRun(oldTracks,oldTracks.get('inside')!);
    const all=new Map(oldTracks);all.set('before',{pts:[[-1000,0],[0,0]]});all.set('after',{pts:[[1000,0],[2000,0]]});const full=buildRailwayRun(all,all.get('inside')!);
    const rail=new RailTrains(new THREE.MeshBasicMaterial()),cars=Array.from({length:8},()=>new THREE.Mesh());rail.group.add(...cars);
    rail.trains.push({id:'rail:stopped',run:old,s:direction===1?994:6,dir:direction,v:0,cars});rail.update(0,500,0,oldTracks);
    const poses=rail.bodies.map(b=>({x:b.x,z:b.z,hx:b.hx,hz:b.hz,roof:b.roof}));assert.equal(rail.ensureStoryShuttle(full,{x:500,z:0}),'rail:stopped');
    rail.bodies.forEach((b,k)=>{for(const axis of['x','z','hx','hz','roof'] as const)assert.ok(Math.abs(b[axis]-poses[k][axis])<1e-8,`${axis}: adoption preserves the old coach pose`);});
    const before=rail.trains[0].s;for(let n=0;n<200;n++)rail.update(.1,500,0,new Map());assert.ok((rail.trains[0].s-before)*direction>100,'the formerly artificial endpoint no longer traps the delivery target');
  }
});

test('a production Player remains carried along the entire actual Ghatkesar–HITEC corridor through its first terminal reversal',()=>{
  const run=buildRailwayStoryRoute()!,rail=new RailTrains(new THREE.MeshBasicMaterial()),id=rail.ensureStoryShuttle(run,STORY_RAIL_STATIONS.ghatkesar);assert.ok(id);
  const p=rider(),contacts=new MovingRailInteraction(),initial=rail.storyCoach(id)!;p.pos.set(initial.x,initial.roof+.55,initial.z);
  p.yaw=Math.atan2(-initial.hx,-initial.hz);let frames=0;
  for(;frames<30000&&rail.trains[0].dir===1;frames++){
    rail.update(.1,p.pos.x,p.pos.z,new Map());p.city.movingRail=rail.bodies;contacts.beforePlayer(p,rail.bodies,false,.1);p.update(.1,idle,frames*.1);
    const result=contacts.afterPlayer(p,.1);assert.equal(result.carried,true,`actual route roof support frame${frames}`);assert.equal(result.hit,false);
    assert.equal(rail.bodies.length,8);assert.ok(rail.trains[0].cars.every(c=>c.visible));
  }
  assert.equal(rail.trains[0].dir,-1,'the complete real route reaches HITEC and reverses after dwelling');assert.ok(frames>18000,'this is sustained whole-route simulation, not a terminal-only fixture');
  const head=railwayPoint(run,rail.trains[0].s);assert.ok(Math.hypot(head.x-STORY_RAIL_STATIONS.hitecCity.x,head.z-STORY_RAIL_STATIONS.hitecCity.z)<150);
});
