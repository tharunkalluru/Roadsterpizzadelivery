import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { initTemplates } from '../../src/core/util';
import { RailTrains } from '../../src/game/rail';
import { buildRailwayRun, projectRailwayRun, railwayPoint, railwaySweepsConflict, type RailwayRun, type RailwayTrack } from '../../src/game/railway-flow';
import { buildRailwayStoryRoute } from '../../src/game/railway-story-route';
import { railwayNetwork } from '../../src/world/railway-geometry';
import { RailConflictReservations } from '../../src/game/rail-conflict-reservations';
import { createRailWindowJob } from '../../src/game/rail-conflict-windows';

initTemplates({rbox:new THREE.BoxGeometry(1,1,1)});
const cars=(n:number)=>Array.from({length:n},()=>new THREE.Mesh());
function line(id:string,z=0,y=0){const track:RailwayTrack={pts:[[0,z],[2000,z]],elev:[y,y]};return buildRailwayRun(new Map([[id,track]]),track);}

/** Native stalled readout: rail0 9502m remaining/35ways, rail1 34237m
 * remaining/49ways, adopted13-coach formation travelling in reverse. Start
 * both500m upstream, rather than asking a new lease to untangle a committed
 * state. The old one-substep interlock strands both after only~497m.
 */
for(const redCount of[8,13])test(`actual Khaitalpur narrow curve clears both ${redCount}/13-coach rakes without overlap`,()=>{
 const network=railwayNetwork(),tracks=new Map(network.profiles.filter(r=>!r.service).map(r=>[r.id,r]));
 const rail=new RailTrains(new THREE.MeshBasicMaterial()),story=buildRailwayStoryRoute()!;
 const ordinary:RailwayRun=(rail as any).runsFor(tracks).find((r:RailwayRun)=>r.ways.length===35&&projectRailwayRun(r,-11225.44,-6350.93).d<2);
 assert.ok(ordinary);assert.equal(story.ways.length,49);
 const red={id:'rail:0',run:ordinary,s:ordinary.len-9502-500,dir:1 as const,v:16,cars:cars(redCount)};
 const white={id:'rail:1',run:story,s:34237+500,dir:-1 as const,formationDir:1 as const,v:16,cars:cars(13),story:{active:true,dwell:0},
  coachRoofs:[3.9,...Array(12).fill(4.175)],coachHalfLengths:[10.05,...Array(12).fill(11.25)]};
 rail.trains.push(red,white);rail.group.add(...red.cars,...white.cars);
 const initial=[red.s,white.s];let held=0,resumed=false;
 for(let i=0;i<3000;i++){
  const before=[red.s,white.s];rail.update(.05,-11225.44,-6350.93,new Map());
  const a=rail.bodies.filter(b=>b.id.startsWith('rail:0:')),b=rail.bodies.filter(b=>b.id.startsWith('rail:1:'));
  assert.equal(a.length,redCount);assert.equal(b.length,13);assert.ok(rail.trains.every(t=>t.cars.every(c=>c.visible)));
  assert.equal(railwaySweepsConflict(a,a,b,b),false,`physical coach envelopes frame${i}`);
  assert.ok(red.s-before[0]>=0&&red.s-before[0]<=.801,'no teleport or speed jump');
  assert.ok(before[1]-white.s>=0&&before[1]-white.s<=.801,'reverse preserves formation');
  if(red.v<.01)held++;else if(held)resumed=true;
 }
 assert.ok(red.s-initial[0]>1800,'loser resumes after the whole other rake clears');
 assert.ok(initial[1]-white.s>2300,'owner traverses the complete narrow cluster');
 assert.ok(held>20&&held<1800&&resumed,'bounded upstream wait, then actual progress');
 assert.equal(white.formationDir,1);assert.equal(white.dir,-1);
 assert.equal((rail as any).conflictReservations.diagnostics.bothCommitted,0,'lease acquired before both whole rakes commit');
});

for(const redCount of[8,13])test(`native HITEC startup adopts13 coaches, reverses at the terminal and clears the ordinary${redCount}-coach train`,()=>{
 const tracks=new Map(railwayNetwork().profiles.filter(r=>!r.service).map(r=>[r.id,r]));
 const rail=new RailTrains(new THREE.MeshBasicMaterial()),story=buildRailwayStoryRoute()!,runs:RailwayRun[]=(rail as any).runsFor(tracks);
 const ordinary=runs.find(r=>r.ways.length===35&&projectRailwayRun(r,-11225.44,-6350.93).d<2)!;
 const adopted=runs.find(r=>r.ways.length===53&&projectRailwayRun(r,-11225.44,-6350.93).d<4)!;
 const initialHead=railwayPoint(story,story.len-446-11.25);
 const red={id:'rail:0',run:ordinary,s:ordinary.len-11006,dir:1 as const,v:20,cars:cars(redCount)};
 const sourceWhite={id:'rail:1',run:adopted,s:projectRailwayRun(adopted,initialHead.x,initialHead.z).s-11.25,dir:-1 as const,v:16,cars:cars(13)};
 rail.trains.push(red,sourceWhite);rail.group.add(...red.cars,...sourceWhite.cars);rail.update(0,initialHead.x,initialHead.z,new Map());
 const old=rail.bodies.filter(b=>b.id.startsWith('rail:1:')).map(b=>[b.id,b.x,b.y,b.z,b.hx,b.hz,b.roof,b.halfLength]);
 assert.equal(rail.ensureStoryShuttle(story,initialHead),'rail:1');
 rail.bodies.filter(b=>b.id.startsWith('rail:1:')).forEach((b,k)=>{
  assert.equal(b.id,old[k][0]);for(const [j,value]of[b.x,b.y,b.z,b.hx,b.hz,b.roof,b.halfLength].entries())
   assert.ok(Math.abs(value-Number(old[k][j+1]))<1e-7,'adoption preserves every actual rider roof/pose');
 });
 const white=rail.trains[1],startRed=red.s;assert.equal(white.formationDir,1);assert.equal(white.dir,1);
 let reversed=false,held=0,minSpeed=20;
 for(let i=0;i<4000;i++){
  const rider=rail.storyCoach('rail:1')!;rail.update(.05,rider.x,rider.z,new Map());
  const a=rail.bodies.filter(b=>b.id.startsWith('rail:0:')),b=rail.bodies.filter(b=>b.id.startsWith('rail:1:'));
  assert.equal(a.length,redCount);assert.equal(b.length,13);assert.ok(rail.trains.every(t=>t.cars.every(c=>c.visible)));
  assert.equal(railwaySweepsConflict(a,a,b,b),false,`startup coach envelopes frame${i}`);
  reversed ||= white.dir===-1;minSpeed=Math.min(minSpeed,red.v);if(red.v<.01)held++;
 }
 assert.ok(reversed);assert.equal(white.dir,-1);assert.equal(white.formationDir,1);
 assert.ok(red.s-startRed>2500,'ordinary rake clears the former native stop');
 assert.ok(white.s<33300,'whole adopted reverse rake clears the complete turnout cluster');
 assert.ok(minSpeed<20&&held<2000);assert.equal((rail as any).conflictReservations.diagnostics.bothCommitted,0);
});

for(const [name,z,y]of[['clear parallel',4,0],['grade separated',0,6.2]] as const)test(`${name} routes keep both trains moving without a false reservation`,()=>{
 const rail=new RailTrains(new THREE.MeshBasicMaterial());
 const a={id:'rail:a',run:line('a'),s:600,dir:1 as const,v:20,cars:cars(8)};
 const b={id:'rail:b',run:line('b',z,y),s:1400,dir:-1 as const,v:20,cars:cars(13)};
 rail.trains.push(a,b);for(let i=0;i<1000;i++){rail.update(0,1000,0,new Map());if((rail as any).conflictReservations.debug().every((p:any)=>p.ready))break;}
 for(let i=0;i<100;i++)rail.update(.05,1000,0,new Map());
 assert.ok(Math.abs(a.s-700)<1e-7);assert.ok(Math.abs(b.s-1300)<1e-7);
 assert.ok((rail as any).conflictReservations.debug().every((p:any)=>p.windows.length===0));
});

test('a live reservation survives a route prepend without changing the winning train or stop distance',()=>{
 const aTrack:RailwayTrack={pts:[[-500,0],[500,0]]},bTrack:RailwayTrack={pts:[[0,-500],[0,500]]};
 const a={id:'a',run:buildRailwayRun(new Map([['a',aTrack]]),aTrack),s:400,dir:1 as const,v:16,cars:cars(8)};
 const b={id:'b',run:buildRailwayRun(new Map([['b',bTrack]]),bTrack),s:300,dir:1 as const,v:16,cars:cars(8)};
 const reservations=new RailConflictReservations();for(let i=0;i<1000;i++){reservations.update(0,[a,b]);if(reservations.debug().every(p=>p.ready))break;}
 const stop=reservations.stopDistance(b);assert.ok(Number.isFinite(stop));assert.equal(reservations.stopDistance(a),Infinity);
 const before:RailwayTrack={pts:[[-1000,0],[-500,0]]};a.run=buildRailwayRun(new Map([['before',before],['a',aTrack]]),aTrack);a.s+=500;
 for(let i=0;i<1000;i++){reservations.update(.01,[a,b]);if(reservations.debug().every(p=>p.ready))break;}
 assert.equal(reservations.stopDistance(a),Infinity);assert.ok(Math.abs(reservations.stopDistance(b)-stop)<1e-7,'same owner despite new run object/scalar origin');
});

test('yielding a story train at an interlock does not trigger its terminal reversal',()=>{
 const aTrack:RailwayTrack={pts:[[-500,0],[500,0]]},bTrack:RailwayTrack={pts:[[0,-500],[0,500]]};
 const rail=new RailTrains(new THREE.MeshBasicMaterial());
 const a={id:'a',run:buildRailwayRun(new Map([['a',aTrack]]),aTrack),s:490,dir:1 as const,v:16,cars:cars(13)};
 const b={id:'b',run:buildRailwayRun(new Map([['b',bTrack]]),bTrack),s:400,dir:1 as const,v:16,cars:cars(8),story:{active:true,dwell:0}};
 rail.trains.push(a,b);let held=false,resumed=false;
 for(let i=0;i<600;i++){rail.update(.05,0,0,new Map());if(b.v<.01)held=true;else if(held)resumed=true;assert.equal(b.dir,1);}
 assert.ok(held&&resumed,'story train brakes and resumes through the genuine crossing');assert.equal(b.story.dwell,0);
});

test('cached coach envelopes include a shipped curved conflict whose source centrelines remain over3.5m apart',()=>{
 const rail=new RailTrains(new THREE.MeshBasicMaterial()),tracks=new Map(railwayNetwork().profiles.filter(r=>!r.service).map(r=>[r.id,r]));
 const story=buildRailwayStoryRoute()!,ordinary:RailwayRun=(rail as any).runsFor(tracks).find((r:RailwayRun)=>r.ways.length===35&&projectRailwayRun(r,-11225.44,-6350.93).d<2);
 const p=railwayPoint(ordinary,31194),q=railwayPoint(story,29886);
 assert.ok(projectRailwayRun(story,p.x,p.z).d>3.5);assert.ok(projectRailwayRun(ordinary,q.x,q.z).d>3.5);
 const coach=(id:string,run:RailwayRun,s:number)=>({id,run,s:s+11.25,dir:1 as const,v:0,cars:cars(1),story:{active:true,dwell:0}});
 const a=(rail as any).shapes(coach('a',ordinary,31194),31205.25),b=(rail as any).shapes(coach('b',story,29886),29897.25);
 assert.equal(railwaySweepsConflict(a,a,b,b),true,'full coach corners conflict despite clear source centres');
 const job=createRailWindowJob(ordinary,story);job.step();assert.equal(job.ready,false,'cold pair preparation yields instead of forecasting a whole route in one frame');
 while(!job.ready)job.step();
 assert.ok(job.windows.some(w=>w.a[0]<=31194&&w.a[1]>=31194&&w.b[0]<=29886&&w.b[1]>=29886));
});

test('prepared windows include the full sloped coach height rather than only its centre roof',()=>{
 const aTrack:RailwayTrack={pts:[[0,0],[2000,0]],elev:[0,160]},bTrack:RailwayTrack={pts:[[0,0],[2000,0]],elev:[5,165]};
 const aRun=buildRailwayRun(new Map([['a',aTrack]]),aTrack),bRun=buildRailwayRun(new Map([['b',bTrack]]),bTrack);
 const rail=new RailTrains(new THREE.MeshBasicMaterial());
 const coach=(id:string,run:RailwayRun)=>({id,run,s:1011.25,dir:1 as const,v:0,cars:cars(1),story:{active:true,dwell:0}});
 const a=(rail as any).shapes(coach('a',aRun),1011.25),b=(rail as any).shapes(coach('b',bRun),1011.25);
 assert.equal(railwaySweepsConflict(a,a,b,b),true,'grade makes the full coach envelopes overlap despite5m centre-level separation');
 const job=createRailWindowJob(aRun,bRun);while(!job.ready)job.step();
 assert.ok(job.windows.some(w=>w.a[0]<=1000&&w.a[1]>=1000&&w.b[0]<=1000&&w.b[1]>=1000));
});
