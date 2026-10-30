import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { initTemplates } from '../../src/core/util';
import { RailTrains } from '../../src/game/rail';
import { buildRailwayRun, railwayContinuations, railwayPoint, type RailwayTrack } from '../../src/game/railway-flow';
import { MovingRailInteraction } from '../../src/game/moving-rail';
import { Player, type Input } from '../../src/game/player';
import { railwayNetwork } from '../../src/world/railway-geometry';

initTemplates({rbox:new THREE.BoxGeometry(1,1,1)});
const idle:Input={throttle:0,brake:0,steer:0,flyPressed:false,boost:false};
function rider(){
  return Object.assign(Object.create(Player.prototype),{
    city:{group:new THREE.Group(),surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[]},
    pos:new THREE.Vector3(),yaw:0,speed:0,vy:0,steerVis:0,flying:false,descending:false,onRoad:false,lastSupport:0,lastKind:'rail',lastElevRoad:false,
    hitCooldown:0,bump:0,flyAlt:24,altT:0,kerbT:0,glide:null,jumpActive:false,jumpHeld:false,jumpCooldown:0,jumpBodyTop:2.4,jumpStartY:0,jumpElapsed:0,
    jumpForcedFall:false,jumpCooldownPendingLanding:false,jumpCollisionMeshes:[],jumpBoundsDirty:true,jumpBounds:{bottom:0,top:0},placementRevision:0,
    group:new THREE.Group(),glow:new THREE.Group(),light:new THREE.Group(),wheels:[],wheelRollers:[],animateThrusters(){},
  }) as Player;
}
function stage(run:ReturnType<typeof buildRailwayRun>,dir:1|-1,s:number,n=8){
  const rail=new RailTrains(new THREE.MeshBasicMaterial()),cars=Array.from({length:n},()=>new THREE.Mesh());
  const train={id:'rail:journey',run,dir,s,v:20,cars};rail.group.add(...cars);rail.trains.push(train);
  return{rail,train};
}

test('directed turnout routing follows exact source nodes while mutual spawn chains retain independent ownership',()=>{
  const tracks=new Map<string,RailwayTrack>([
    ['main-left',{pts:[[-1000,0],[0,0]]}],['main-right',{pts:[[0,0],[1000,0]]}],['branch',{pts:[[-800,-300],[0,0]]}],
  ]);
  const branch=buildRailwayRun(tracks,tracks.get('branch')!),main=buildRailwayRun(tracks,tracks.get('main-left')!);
  assert.deepEqual(branch.ways.map(w=>w.id),['branch']);assert.deepEqual(main.ways.map(w=>w.id),['main-left','main-right']);
  const next=railwayContinuations(branch,1,tracks);assert.equal(next[0].way,'main-right');assert.ok(next[0].dot>.93);
  assert.deepEqual(next[0].run.pts.slice(0,branch.pts.length),branch.pts,'the existing route is preserved exactly');
  assert.equal(next[0].run.len,branch.len+1000);
  for(const[description,track]of[
    ['unmapped gap',{pts:[[2,0],[1002,0]]}],['unjoined decimetre gap',{pts:[[.1,0],[1000.1,0]]}],['parallel track',{pts:[[0,5],[1000,5]]}],
    ['different grade',{pts:[[0,0],[1000,0]],elev:[3,3]}],['U-turn',{pts:[[0,0],[-1000,0]]}],['sharp side route',{pts:[[0,0],[0,1000]]}],
  ] as [string,RailwayTrack][]){assert.deepEqual(railwayContinuations(branch,1,new Map([['candidate',track]])),[],description);}
});

for(const dir of [1,-1] as const)test(`a growing track inventory extends the existing rake without a pose jump, then keeps every coach through the former endpoint dir${dir}`,()=>{
  const original=new Map<string,RailwayTrack>([['old',{pts:dir===1?[[-1000,0],[0,0]]:[[0,0],[1000,0]]}]]);
  const tracks=new Map(original);tracks.set('new',{pts:dir===1?[[0,0],[1000,0]]:[[-1000,0],[0,0]]});
  const run=buildRailwayRun(original,original.get('old')!),{rail,train}=stage(run,dir,dir===1?650:350);
  rail.update(0,0,0,original);const before=rail.bodies.map(b=>({id:b.id,x:b.x,y:b.y,z:b.z,hx:b.hx,hz:b.hz})),oldS=train.s;
  rail.update(0,0,0,tracks);
  assert.equal(train.run.len,2000);assert.equal(train.s,oldS+(dir<0?1000:0));assert.equal(train.dir,dir);
  for(let k=0;k<before.length;k++){
    assert.equal(rail.bodies[k].id,before[k].id);
    for(const key of ['x','y','z','hx','hz'] as const)assert.ok(Math.abs(rail.bodies[k][key]-before[k][key])<1e-8,'run extension does not teleport or rotate any coach');
  }
  const p=rider(),contacts=new MovingRailInteraction(),rear=rail.bodies.at(-1)!;p.pos.set(rear.x,rear.roof+.55,rear.z);
  const ids=rail.bodies.map(b=>b.id);let beyond=false;
  for(let frame=0;frame<1200;frame++){
    // Losing the tile inventory after extension cannot shorten an occupied run.
    const inventory=frame%3===0?tracks:frame%3===1?original:new Map<string,RailwayTrack>();
    rail.update(.1,p.pos.x,p.pos.z,inventory);p.city.movingRail=rail.bodies;
    contacts.beforePlayer(p,rail.bodies,false,.1);p.update(.1,idle,frame*.1);const contact=contacts.afterPlayer(p,.1);
    assert.equal(contact.carried,true);assert.equal(contact.hit,false);
    assert.deepEqual(rail.bodies.map(b=>b.id),ids);assert.ok(train.cars.every(c=>c.visible));
    assert.equal(train.run.len,2000);beyond ||= rail.bodies.every(b=>b.x*dir>0);
  }
  assert.equal(beyond,true,'the whole rake, including the ridden rear coach, passes the old source extent');
  assert.ok(train.v<.01,'the train eventually brakes at the real end of all available mapped track');
  assert.ok(rail.approaches[0].speed<.01,'crossings see actual stopped motion rather than nominal cruise');
});

for(const dir of [1,-1] as const)test(`genuine finite route stops the complete train before any coach leaves the visible/source track dir${dir}`,()=>{
  const tracks=new Map<string,RailwayTrack>([['terminal',{pts:[[0,0],[1200,0]]}]]),run=buildRailwayRun(tracks,tracks.get('terminal')!);
  const{rail,train}=stage(run,dir,dir===1?850:350,10);rail.update(0,600,0,tracks);
  const p=rider(),contacts=new MovingRailInteraction(),rear=rail.bodies.at(-1)!;p.pos.set(rear.x,rear.roof+.55,rear.z);
  for(let frame=0;frame<900;frame++){
    rail.update(.1,p.pos.x,p.pos.z,tracks);p.city.movingRail=rail.bodies;
    contacts.beforePlayer(p,rail.bodies,false,.1);p.update(.1,idle,frame*.1);assert.equal(contacts.afterPlayer(p,.1).carried,true);
    assert.equal(rail.bodies.length,10);assert.ok(train.cars.every(c=>c.visible));
    for(const coach of rail.bodies){const point=railwayPoint(run,dir===1?train.s-Number(coach.id.split(':').at(-1))*23.4-11.25:train.s+Number(coach.id.split(':').at(-1))*23.4+11.25);assert.ok(point.x>=0&&point.x<=1200);}
  }
  assert.ok(train.v<.01);assert.equal(rail.approaches[0].speed,0);
  const ids=rail.bodies.map(b=>b.id);rail.update(30,p.pos.x,p.pos.z,tracks);
  assert.deepEqual(rail.bodies.map(b=>b.id),ids,'waiting aboard a stopped train does not retire it');
  rail.update(.1,10000,10000,tracks);assert.equal(rail.bodies.length,0);assert.equal(rail.trains.length,0);assert.equal(rail.group.children.length,0,'only an entire distant rake is retired');
});

test('an onward mapped route reserved in the opposite direction remains a safe intact stop',()=>{
  const tracks=new Map<string,RailwayTrack>([['incoming',{pts:[[-1000,0],[0,0]]}],['outgoing',{pts:[[0,0],[1000,0]]}]]);
  const run=buildRailwayRun(new Map([['incoming',tracks.get('incoming')!]]),tracks.get('incoming')!),{rail,train}=stage(run,1,650);
  const outbound=buildRailwayRun(new Map([['outgoing',tracks.get('outgoing')!]]),tracks.get('outgoing')!);
  assert.equal((rail as any).flow.reserve(outbound,-1),true);
  for(let i=0;i<800;i++){rail.update(.1,-200,0,tracks);assert.equal(rail.bodies.length,8);assert.ok(train.cars.every(c=>c.visible));}
  assert.equal(train.run,run);assert.ok(train.v<.01);assert.ok(train.s<run.len);
});

for(const dir of [1,-1] as const)test(`a stopped occupied train resumes smoothly when a short exact continuation becomes available dir${dir}`,()=>{
  const initial=new Map<string,RailwayTrack>([['old',{pts:[[0,0],[1200,0]]}]]),run=buildRailwayRun(initial,initial.get('old')!);
  const{rail,train}=stage(run,dir,dir===1?850:350);
  for(let n=0;n<700;n++)rail.update(.1,600,0,initial);
  assert.equal(train.v,0);const stopped=train.s,poses=rail.bodies.map(b=>({x:b.x,z:b.z}));
  const extended=new Map(initial);extended.set('new',{pts:dir===1?[[1200,0],[1300,0]]:[[-100,0],[0,0]]});
  rail.update(0,600,0,extended);const shifted=train.s;
  assert.equal(shifted,stopped+(dir<0?100:0));
  for(let k=0;k<8;k++)assert.ok(Math.hypot(rail.bodies[k].x-poses[k].x,rail.bodies[k].z-poses[k].z)<1e-8);
  rail.update(.1,600,0,extended);assert.ok(train.v>0&&train.v<=.121,'resume uses bounded acceleration rather than a cruise-speed jump');
  for(let n=0;n<400;n++){rail.update(.1,600,0,extended);assert.equal(rail.bodies.length,8);assert.ok(train.cars.every(c=>c.visible));}
  assert.ok((train.s-shifted)*dir>90,'the train must travel along the newly available100m of real track');assert.equal(train.v,0);
});

test('actual Hyderabad station turnout endpoints continue on their exact mapped forward ways without changing coach identities',()=>{
  const tracks=new Map(railwayNetwork().profiles.filter(r=>!r.service).map(r=>[r.id,r]));
  for(const[incoming,outgoing]of[['w1316254560','w826105532'],['w817723528','w826105531'],['w826136279','w817584040']]){
    const run=buildRailwayRun(tracks,tracks.get(incoming)!);assert.equal(run.ways.at(-1)!.id,incoming);
    const choices=railwayContinuations(run,1,tracks);assert.equal(choices[0]?.way,outgoing);assert.ok(choices[0].dot>.99);
    const{rail,train}=stage(run,1,run.len-250),oldLength=run.len;
    const poses=train.cars.map((_,k)=>rail.at(run,train.s-k*23.4-11.25));
    rail.update(0,poses[0].x,poses[0].z,tracks);
    assert.ok(train.run.len>oldLength);assert.equal(train.s,oldLength-250);
    for(let k=0;k<8;k++){assert.ok(Math.hypot(rail.bodies[k].x-poses[k].x,rail.bodies[k].z-poses[k].z)<1e-7);assert.equal(rail.bodies[k].id,`rail:journey:${k}`);}
    const p=rider(),contacts=new MovingRailInteraction(),rear=rail.bodies.at(-1)!;p.pos.set(rear.x,rear.roof+.55,rear.z);
    for(let frame=0;frame<600;frame++){
      rail.update(.1,p.pos.x,p.pos.z,tracks);p.city.movingRail=rail.bodies;
      contacts.beforePlayer(p,rail.bodies,false,.1);p.update(.1,idle,frame*.1);const contact=contacts.afterPlayer(p,.1);
      assert.equal(contact.carried,true,`${incoming} roof contact lost at frame${frame}`);assert.equal(rail.bodies.filter(b=>b.id.startsWith(train.id+':')).length,8);assert.ok(train.cars.every(c=>c.visible));
    }
    assert.ok(train.s>oldLength+150,'the last coach must travel beyond the original artificial turnout end');
  }
});
