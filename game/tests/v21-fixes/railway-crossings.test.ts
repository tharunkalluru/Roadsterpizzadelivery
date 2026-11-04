import { prepareRoadUnderpasses } from '../../src/world/road-underpasses';
import { RAILWAY_UNDERPASS_EVIDENCE } from '../../src/world/railway-evidence';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildRailwayCrossingSites, RailwayCrossings, RAILWAY_GATE_CLOSE_SECONDS, mergeRailwayCrossingSites } from '../../src/game/railway-crossings';
import { prepareRailProfiles, railwayNetwork, prepareRailwayTransport } from '../../src/world/railway-geometry';
import { prepareRoadGrades } from '../../src/world/road-grades';
import { buildRailwayRun } from '../../src/game/railway-flow';
import { RailTrains } from '../../src/game/rail';
import { RoadGraph } from '../../src/game/roadgraph';
import { Traffic } from '../../src/game/traffic';
import { RailwayCrossingGates } from '../../src/world/railway-crossing-gates';
import { collideWalls } from '../../src/game/physics';
import { Player } from '../../src/game/player';
import { initTemplates, rng } from '../../src/core/util';
import type { RoadEdge, CoreData } from '../../src/world/types';
import type { OsmFeature } from '../../src/world/extras';

const road = (id: string, pts: [number,number][], extra: Partial<RoadEdge> = {}): RoadEdge => ({ id, seg:id, from:id+'-a', to:id+'-b', pts, cls:'residential', w:8, lanes:2, oneway:null, elev:null, name:id, maxspeed:null, ...extra });
const rails = (height = 0) => prepareRailProfiles([-2.6,2.6].map((x,i) => ({id:'r'+i,k:'rail',l:[[x,-1500],[x,1500]],t:{railway:'rail'}} as OsmFeature))).map(r=>({...r,elev:r.pts.map(()=>height)}));
function fixture() {
  const e=road('crossing-road',[[-200,0],[200,0]]), profiles=rails(), sites=buildRailwayCrossingSites([e],profiles), controller=new RailwayCrossings(sites);
  const tracks=new Map(profiles.map(r=>[r.id,r])), run=buildRailwayRun(tracks,profiles[0]);
  return {e,profiles,sites,controller,tracks,run,train:{id:'train',run,s:1200,dir:1 as const,speed:20,length:220}};
}
const roadUsers = (traffic: Traffic) => traffic.cars.map(c=>({x:c.x,y:c.y,z:c.z,hx:c.hx,hz:c.hz,halfLength:c.size[2]/2,halfWidth:c.size[0]/2}));
const sizes = {car:[1.8,1.6,4.5],auto:[1.36,1.85,2.65],bike:[.75,1.9,2],bus:[2.5,3.3,11],truck:[2.5,3.1,8.4]};
function trafficFixture(roads: RoadEdge[], controller: RailwayCrossings) {
  const byGroup=Object.fromEntries(Object.entries(sizes).map(([group,size])=>[group,[{group,size,body:new THREE.BufferGeometry(),lights:new THREE.BufferGeometry(),decals:[]}]]));
  const traffic=Object.assign(Object.create(Traffic.prototype),{cars:[],max:0,graph:new RoadGraph(roads),city:undefined,scene:new THREE.Scene(),mats:{vBody:new THREE.MeshBasicMaterial(),vLight:new THREE.MeshBasicMaterial()},byGroup,r:rng(77),t:0,plans:0,passengerExchanges:[],stopsByEdge:new Map(),onHorn(){}}) as Traffic;
  traffic.setRailwayCrossings(controller);return traffic;
}
const farPlayer={x:250,y:.55,z:250,speed:0,hx:1,hz:0};
// Production driving and collision update, with only the render-only thrusters omitted.
function playerFixture(x: number, dir: 1 | -1) {
  const city:any={group:new THREE.Group(),waterGrid:new Map(),buildingGrid:new Map(),surfaceGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[],railwayWalls:[]};
  const player=Object.assign(Object.create(Player.prototype),{city,pos:new THREE.Vector3(x,.55,0),yaw:-dir*Math.PI/2,speed:12,vy:0,steerVis:0,flying:false,descending:false,onRoad:false,lastSupport:0,lastKind:'ground',lastElevRoad:false,hitCooldown:0,bump:0,flyAlt:24,altT:0,kerbT:0,glide:null,jumpActive:false,jumpHeld:false,jumpCooldown:0,jumpBodyTop:2.4,jumpCollisionMeshes:[],group:new THREE.Group(),glow:new THREE.Group(),light:new THREE.Group(),wheels:[],wheelRollers:[],animateThrusters(){}}) as Player;
  return {city,player,user:()=>{const f=player.forward;return {x:player.pos.x,y:player.pos.y-.55,z:player.pos.z,hx:f.x,hz:f.z,halfLength:2.4,halfWidth:1.1};}};
}

test('genuine coplanar source intersections form one gate pair across both tracks; overpasses, tunnels and grazing parallels do not',()=>{
  const f=fixture();assert.equal(f.sites.length,1);assert.equal(f.sites[0].railIds.length,2);assert.equal(f.sites[0].gates.length,2);
  assert.ok(f.sites[0].gates[0].x< -10&&f.sites[0].gates[1].x>10);
  assert.equal(buildRailwayCrossingSites([{...f.e,elev:[6.2,6.2]}],f.profiles).length,0);
  assert.equal(buildRailwayCrossingSites([f.e],rails(6.2)).length,0);
  assert.equal(buildRailwayCrossingSites([{...f.e,name:'Unverified Road Underpass'}],f.profiles).length,1,'a name alone cannot suppress priority at a physical level crossing');
  assert.equal(buildRailwayCrossingSites([road('parallel',[[0,-500],[0,500]])],f.profiles).length,0);
  assert.equal(buildRailwayCrossingSites([road('controlled',[[-200,0],[200,0]],{cls:'motorway'})],f.profiles).length,0);
  const tunnel=prepareRailProfiles([{id:'tunnel',k:'rail',l:[[0,-100],[0,100]],t:{railway:'rail',tunnel:'yes'}}]);assert.equal(tunnel.length,0);
});

test('gates warn early, close before arrival and remain down through the whole tail plus safe clearance time',()=>{
  const {controller,train}=fixture();const horns: any[]=[];controller.onHorn=e=>horns.push(e);
  let firstClosedAt=Infinity, noseAt=Infinity, reopenedAt=Infinity;
  for(let tick=0;tick<500;tick++){
    const time=tick*.1;controller.update(.1,[train]);train.s+=controller.trainAdvance(train.run,train.s,train.dir,train.speed*.1);
    if(controller.states[0].closure===1)firstClosedAt=Math.min(firstClosedAt,time);
    if(train.s>=1500)noseAt=Math.min(noseAt,time);
    if(time>noseAt&&controller.states[0].closure===0)reopenedAt=Math.min(reopenedAt,time);
  }
  assert.ok(firstClosedAt<=RAILWAY_GATE_CLOSE_SECONDS+.1);assert.ok(noseAt-firstClosedAt>8,'ample fully-closed warning before train arrival');
  assert.ok(reopenedAt>noseAt+train.length/train.speed+4,'gate cannot open before tail, hold and raise animation');
  assert.equal(horns.length,1);assert.ok(horns[0].z<0,'horn follows the approaching locomotive');
});

test('a second approaching train keeps the gate closed after the first tail clears',()=>{
  const {controller,train}=fixture();for(let i=0;i<50;i++)controller.update(.1,[train]);assert.equal(controller.states[0].closure,1);
  const other={...train,id:'second',s:1780,dir:-1 as const};train.s=1900;
  for(let i=0;i<50;i++)controller.update(.1,[train,other]);assert.equal(controller.states[0].closure,1);assert.equal(controller.states[0].warning,true);
});

test('admitted road users keep their exit open and force the approaching train to yield until clear',()=>{
  initTemplates();const {controller,tracks,run}=fixture(), rail=new RailTrains(new THREE.MeshBasicMaterial());rail.setCrossings(controller);
  const cars=Array.from({length:9},()=>new THREE.Mesh());rail.trains.push({id:'yielding',run,s:1200,dir:1,v:20,cars});
  const user={x:0,y:.55,z:0,hx:1,hz:0,halfLength:2.4,halfWidth:1.05};
  for(let i=0;i<250;i++){controller.update(.1,rail.approaches,[user]);rail.update(.1,0,0,new Map());}
  assert.ok(rail.trains[0].s<1490,'locomotive waits outside the road envelope');assert.equal(controller.states[0].closure,0);
  assert.equal(controller.roadStop('crossing-road',1,200,2.4),undefined,'an admitted vehicle can leave');
  for(let i=0;i<200;i++){controller.update(.1,rail.approaches,[]);rail.update(.1,0,0,new Map());}
  assert.ok(rail.trains[0].s>1700,'train resumes only after closure and occupancy clearance');
  rail.mat.dispose();void tracks;
});

test('every NPC class brakes with its whole nose before the gate, then resumes after the train',()=>{
  initTemplates();
  for(const dir of [1,-1] as const) for(const group of Object.keys(sizes) as (keyof typeof sizes)[]){
    const {controller,e,train}=fixture(),traffic=trafficFixture([e],controller),edge=traffic.graph.edges[0],c=traffic.spawnAt(group,edge,dir,90,2.2)!;
    c.speed=12;c.want=12;c.uturnAt=Infinity;c.laneChangeAt=Infinity;
    for(let tick=0;tick<900;tick++){controller.update(1/60,[train],roadUsers(traffic));traffic.update(1/60,0,0,farPlayer);}
    const gate=controller.states[0].site.gates[dir>0?0:1];assert.ok(c.x*dir+c.size[2]/2<gate.x*dir-.25,group+' nose must not cross the lowered gate');assert.ok(c.speed<.1,`${group}: speed ${c.speed}, position ${c.x}, gate ${gate.x}`);
    train.s=2200;
    for(let tick=0;tick<900;tick++){controller.update(1/60,[train],roadUsers(traffic));traffic.update(1/60,0,0,farPlayer);}
    assert.ok(c.x*dir>25,group+' must resume after the full tail clears');
  }
});

test('a car already between the gates clears the tracks while new arrivals wait',()=>{
  initTemplates();const {controller,e,train}=fixture(),traffic=trafficFixture([e],controller),edge=traffic.graph.edges[0];
  const admitted=traffic.spawnAt('car',edge,1,200,2.2)!,waiting=traffic.spawnAt('car',edge,1,120,2.2)!;
  admitted.uturnAt=waiting.uturnAt=Infinity;admitted.laneChangeAt=waiting.laneChangeAt=Infinity;
  for(let tick=0;tick<400;tick++){controller.update(1/60,[train],roadUsers(traffic));traffic.update(1/60,0,0,farPlayer);}
  assert.ok(admitted.x>25,'admitted car exits instead of stopping on rails');assert.ok(waiting.x+waiting.size[2]/2<controller.states[0].site.gates[0].x);
});

test('planned turn lookahead brakes before a crossing on the next road and cannot tunnel through its gate',()=>{
  initTemplates();const incoming=road('in',[[-150,0],[0,0]],{to:'joint'}),outgoing=road('out',[[0,0],[0,180]],{from:'joint'});
  const profiles=prepareRailProfiles([{id:'rail',k:'rail',l:[[-500,20],[500,20]],t:{railway:'rail'}}]),sites=buildRailwayCrossingSites([incoming,outgoing],profiles),controller=new RailwayCrossings(sites);
  const tracks=new Map(profiles.map(p=>[p.id,p])),run=buildRailwayRun(tracks,profiles[0]),train={id:'near-turn',run,s:300,dir:1 as const,speed:20,length:220};
  const traffic=trafficFixture([incoming,outgoing],controller),c=traffic.spawnAt('bus',traffic.graph.byId.get('in')!,1,65,2.8)!;c.speed=10;c.uturnAt=Infinity;c.laneChangeAt=Infinity;
  for(let tick=0;tick<1200;tick++){controller.update(1/60,[train],roadUsers(traffic));traffic.update(1/60,0,0,farPlayer);}
  assert.ok(c.z+c.size[2]/2<12,'long bus waits before outgoing gate despite current edge and curved route ownership');assert.ok(c.speed<.1);
  train.s=1000;
  for(let tick=0;tick<1200;tick++){controller.update(1/60,[train],roadUsers(traffic));traffic.update(1/60,0,0,farPlayer);}
  assert.ok(c.edge.e.id==='out'&&c.s>40,'bus completes the actual turn after reopening');
});

test('closed player barriers and visible arms share the exact source gate footprint',()=>{
  initTemplates();const {controller,train}=fixture();for(let i=0;i<50;i++)controller.update(.1,[train]);
  const visuals=new RailwayCrossingGates(controller);visuals.update(0,0);assert.equal(controller.barriers.length,2);
  const walls=new Map<string,any[]>();for(const wall of controller.barriers)for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++){const key=`${x},${z}`,list=walls.get(key)||[];list.push(wall);walls.set(key,list);}
  const point={x:0,z:0};const hit=collideWalls({walls} as any,{x:-25,z:0},point,1.05,0,1.2);assert.ok(hit.hit>0);assert.ok(point.x< -10);
  const flying={x:0,z:0};assert.equal(collideWalls({walls} as any,{x:-25,z:0},flying,1.05,3,4.2).hit,0);
  visuals.group.updateMatrixWorld(true);const arms=visuals.group.children[0].children.filter(c=>c instanceof THREE.Group) as THREE.Group[];
  for(let i=0;i<2;i++){const end=new THREE.Vector3(controller.states[0].site.width+1.3,0,0);arms[i].children[0].localToWorld(end);const gate=controller.states[0].site.gates[i];assert.ok(Math.abs(end.x-gate.x)<.001);assert.ok(Math.abs(end.z)<controller.states[0].site.width/2+1);}
  visuals.dispose();
});

test('new train placement never begins with a rake covering an open crossing',()=>{
  const {controller,run}=fixture();const shifted=controller.safeSpawn(run,1550,1,220);assert.ok(shifted<1485);
  const reverse=controller.safeSpawn(run,1450,-1,220);assert.ok(reverse>1515);
});

test('the production player stops its entire nose at a lowered gate without falsely reopening it for the train',()=>{
  initTemplates();
  for(const dir of [1,-1] as const)for(const hz of [30,60]){
    const {controller,run,train}=fixture();for(let i=0;i<50;i++)controller.update(.1,[train]);
    const gate=controller.states[0].site.gates[dir>0?0:1],{city,player,user}=playerFixture(gate.x-dir*5,dir);
    const rail=new RailTrains(new THREE.MeshBasicMaterial());rail.setCrossings(controller);
    rail.trains.push({id:'player-waiting',run,s:1200,dir:1,v:20,cars:Array.from({length:9},()=>new THREE.Mesh())});
    for(let i=0;i<hz*20;i++){
      controller.update(1/hz,rail.approaches,[user()]);city.railwayWalls=controller.barriers;
      assert.equal(controller.states[0].occupied,false,'waiting body must stay outside the protected track space');
      assert.equal(controller.states[0].closure,1,'touching a lowered gate cannot lift it under a passing train');
      rail.update(1/hz,0,0,new Map());player.update(1/hz,{throttle:1,brake:0,steer:0,flyPressed:false,boost:false},i/hz);
    }
    const f=player.forward,nose=Math.abs(f.x)*2.4+Math.abs(f.z)*1.1;
    assert.ok(player.pos.x*dir+nose<=gate.x*dir+1e-6,'oriented player nose remains before the arm in both directions');
    assert.ok(rail.trains[0].s>1590,'train passes the waiting player rather than yielding to a false occupation');
    rail.mat.dispose();
  }
});

test('a production player already admitted between gates can exit while the train yields',()=>{
  initTemplates();const {controller,run}=fixture(),{city,player,user}=playerFixture(0,1);
  const rail=new RailTrains(new THREE.MeshBasicMaterial());rail.setCrossings(controller);
  rail.trains.push({id:'player-admitted',run,s:1480,dir:1,v:20,cars:Array.from({length:9},()=>new THREE.Mesh())});
  for(let i=0;i<600;i++){
    controller.update(1/60,rail.approaches,[user()]);city.railwayWalls=controller.barriers;
    rail.update(1/60,0,0,new Map());
    if(controller.states[0].occupied)assert.ok(rail.trains[0].s<1490,'train cannot enter occupied road space');
    player.update(1/60,{throttle:1,brake:0,steer:0,flyPressed:false,boost:false},i/60);
  }
  assert.ok(player.pos.x>controller.states[0].site.gates[1].x+2.4,'admitted player clears the exit');
  assert.ok(rail.trains[0].s>1530,'train resumes after the player leaves and the gate closes');rail.mat.dispose();
});

test('oriented gate clearance does not enlarge the existing collision radius for static walls',()=>{
  const footprint={hx:1,hz:0,halfLength:2.4,halfWidth:1.1},wall={ax:0,az:-5,bx:0,bz:5,y0a:0,y0b:0,y1a:2,y1b:2,kind:'rail'};
  const staticWalls=new Map([['-1,0',[wall]]]),ordinary={x:-.2,z:0};
  collideWalls({walls:staticWalls,railwayWalls:[]} as any,{x:-5,z:0},ordinary,1.05,0,1.2,footprint);assert.equal(ordinary.x,-1.05);
  const gated={x:-.2,z:0};collideWalls({walls:new Map(),railwayWalls:[wall]} as any,{x:-5,z:0},gated,1.05,0,1.2,footprint);assert.ok(Math.abs(gated.x+2.45)<1e-9);
});

test('the real Hyderabad road and railway records produce finite grade-checked crossing sites without rewriting XY',()=>{
  const core=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()) as CoreData;
  const plan=prepareRailwayTransport(prepareRoadUnderpasses(prepareRoadGrades(core.roads)).roads,{underpasses:RAILWAY_UNDERPASS_EVIDENCE}),roads=plan.roads,profiles=plan.railway.profiles,raw=buildRailwayCrossingSites(roads,profiles),sites=mergeRailwayCrossingSites(raw);
  assert.ok(raw.length>30,'retain actual level crossings after source/researched underpasses descend below rail datum');
  assert.ok(sites.length<raw.length,'split source roads operate one physical pair rather than duplicate arms');
  for(const id of RAILWAY_UNDERPASS_EVIDENCE)assert.ok(!raw.some(s=>s.roadId===id),`a researched road-under-rail site cannot have level-crossing gates ${id}`);
  assert.ok(sites.length>0&&sites.length<1000);for(const site of sites){assert.ok(site.railIds.length);assert.ok(site.gates.every(g=>[g.x,g.y,g.z,g.s].every(Number.isFinite)));assert.ok(site.halfSpan>=8);assert.ok(roads.some(r=>r.id===site.roadId));}
});

test('gate visuals build only two nearby sites per frame and retain unchanged meshes across streamed-site updates',()=>{
  initTemplates();const base=fixture().sites[0];
  const shifted=(id:string,x:number)=>({...base,id,x:base.x+x,gates:base.gates.map(g=>({...g,x:g.x+x}))});
  const sites=[...Array.from({length:8},(_,i)=>shifted('near:'+i,i*60)),...Array.from({length:200},(_,i)=>shifted('far:'+i,20000+i*50))];
  const controller=new RailwayCrossings(sites),visuals=new RailwayCrossingGates(controller);
  visuals.update(0,0);assert.equal(visuals.group.children.length,2);const first=visuals.group.children[0];
  controller.setSites(sites.slice());visuals.update(0,0);assert.equal(visuals.group.children[0],first,'stream updates retain the same local geometry');assert.equal(visuals.group.children.length,4);
  visuals.update(25000,0);assert.ok(visuals.group.children.length<=2,'distant old gates release their geometry rather than accumulating city-wide');visuals.dispose();
});

test('source road splits at each strand share one physical gate pair and keep both approach stop positions',()=>{
  const pieces=[road('source_0',[[-120,0],[-2.6,0]],{seg:'source'}),road('source_1',[[-2.6,0],[2.6,0]],{seg:'source'}),road('source_2',[[2.6,0],[120,0]],{seg:'source'})];
  const profiles=rails(),raw=buildRailwayCrossingSites(pieces,profiles),controller=new RailwayCrossings(raw);
  assert.equal(raw.length,3);assert.equal(controller.states.length,1);assert.equal(controller.states[0].site.roadStops?.length,3);
  const tracks=new Map(profiles.map(r=>[r.id,r])),run=buildRailwayRun(tracks,profiles[0]),train={id:'split-road',run,s:1200,dir:1 as const,speed:20,length:200};
  controller.update(.1,[train]);assert.ok(controller.roadStop('source_0',1,0,2.4)!>80);assert.ok(controller.roadStop('source_2',-1,0,2.4)!>80);
  assert.equal(controller.roadStop('source_1',1,2.6,2.4),undefined,'middle record is admitted road space, not another stop gate');
});

test('partly raised player barriers follow arm elevation while the train still waits for full closure',()=>{
  const {controller,train}=fixture();controller.update(2,[train]);assert.equal(controller.states[0].closure,.5);
  const wall=controller.barriers[0];assert.ok(wall.y1b>7&&Math.abs(wall.y1a-1.15)<.001,'rising beam has the same sloped endpoints as the visible arm');
  assert.equal(controller.trainAdvance(train.run,1490,1,2),0,'a train cannot use a half-closed gate');
});
