import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Traffic} from '../../src/game/traffic';
import {RoadGraph} from '../../src/game/roadgraph';
import {initTemplates} from '../../src/core/util';
function fixture(group:'auto'|'bus'|'bike'|'car'|'truck'='auto'){
 const gradient={addColorStop(){}};
 const context=new Proxy({measureText:(s:string)=>({width:s.length*12}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o:any,k)=>k in o?o[k]:()=>{}});
 (globalThis as any).document={createElement:()=>({width:256,height:128,getContext:()=>context})};
 initTemplates({rbox:new THREE.BoxGeometry(1,1,1),ring:new THREE.RingGeometry(1,1.2,8)});
 const graph=new RoadGraph([{id:'long',seg:'long',name:'Scene route',cls:'primary',w:40,lanes:8,oneway:null,from:'a',to:'b',pts:[[0,0],[0,-1000]],elev:null,maxspeed:null}]);
 const traffic=new Traffic(graph,new THREE.Scene(),{vBody:new THREE.MeshBasicMaterial(),vLight:new THREE.MeshBasicMaterial()},1),car=traffic.spawnAt(group,graph.edges[0],1,100,12);
 return {traffic,car,graph};
}
test('a story lease preserves only its live carrier through distance and budget retirement, release restores ordinary retirement',()=>{
 const {traffic,car,graph}=fixture(),other=traffic.spawnAt('auto',graph.edges[0],1,140,12);traffic.leaseStoryVehicle(car.g.uuid);
 const z=car.z;traffic.update(1/60,1000,1000,{x:1000,y:.55,z:1000,speed:0});
 assert.equal(traffic.cars.includes(car),true);assert.equal(traffic.cars.includes(other),false);assert.ok(car.z<z,'leased carrier still follows actual road simulation');assert.equal(traffic.storyVehicleLeaseStatus(car.g.uuid),'active');
 traffic.leaseStoryVehicle(null);traffic.update(1/60,1000,1000,{x:1000,y:.55,z:1000,speed:0});assert.equal(traffic.cars.includes(car),false);
});
for (const group of ['auto', 'bike', 'car'] as const) test(`a fast impact launches a ${group} and it lands on a mapped road with the same identity`,()=>{
 const {traffic,car,graph}=fixture(group),origin=graph.edges[0],identity=car.g.uuid,e=origin.e;
 traffic.graph=new RoadGraph([e,{...e,id:'parallel',from:'pa',to:'pb',pts:[[30,0],[30,-1000]]}]);
 const targetEdge=traffic.graph.byId.get('parallel')!;Object.assign(car,{edge:origin,s:100,...traffic.graph.pointAt(origin,100,1,12)});
 traffic.leaseStoryVehicle(identity);
 assert.equal(traffic.kickVehicle(car,60/3.6,1,0),false);
 assert.equal(traffic.kickVehicle(car,18,1,0),true);assert.equal(car.arcadeFlight!==undefined,true);
 (traffic as any).advanceArcadeVehicle(car,.5);assert.ok(car.y>2,'the auto, rather than the Roadster, visibly rises above the roadway');
 (traffic as any).advanceArcadeVehicle(car,1.6);
 assert.equal(car.g.uuid,identity);assert.equal(car.arcadeFlight,undefined);assert.equal(car.edge.e.id,'parallel');
 assert.equal(car.g.parent,traffic.scene);assert.equal(traffic.storyVehicleLeaseStatus(identity),'active');assert.ok(Math.abs(car.y-traffic.graph.pointAt(targetEdge,car.s,car.dir,car.lane).y)<.01);
});
for (const group of ['bus', 'truck'] as const) test(`a ${group} stays grounded and collidable at maximum road speed`, () => {
 const {traffic, car} = fixture(group);
 const speed = car.speed;
 assert.equal(traffic.kickVehicle(car, 120 / 3.6, 1, 0), false);
 assert.equal(car.arcadeFlight, undefined);
 assert.equal(car.speed, speed);
 assert.equal(traffic.hitTest(car.x, car.y + .55, car.z, 1.1), car);
});
test('leasing a near carrier does not change its road clock, acceleration or trajectory',()=>{
 const a=fixture(),b=fixture();a.traffic.leaseStoryVehicle(a.car.g.uuid);
 for(let i=0;i<90;i++)for(const f of [a,b])f.traffic.update(1/60,0,-100,{x:0,y:.55,z:-100,speed:0});
 for(const key of ['x','y','z','hx','hz','speed','s']as const)assert.equal(a.car[key],b.car[key],key);
});
test('streaming cannot unload a marked service on the permanent core road graph',()=>{
 const {traffic,car,graph}=fixture();traffic.leaseStoryVehicle(car.g.uuid);const gone=graph.removeRoads([car.edge.e.id]);traffic.dropEdges(gone);
 assert.equal(gone.size,0);assert.equal(traffic.cars.includes(car),true);assert.equal(traffic.storyVehicleLeaseStatus(car.g.uuid),'active');assert.equal(car.g.parent,traffic.scene);
 graph.permanent.delete(car.edge.e.id);assert.equal(traffic.canHostStoryVehicle(car),false,'tile-only roads cannot supply a marked delivery carrier');
 traffic.clear();assert.equal(traffic.storyVehicleLeaseStatus(car.g.uuid),'none');
});
test('selection rejects an inner-lane bus, a road end and an ended service; a wide real left lane with forward runway is eligible',()=>{
 const {traffic,car}=fixture('bus');assert.equal(traffic.canHostStoryVehicle(car),true);car.lane=2;assert.equal(traffic.canHostStoryVehicle(car),false);car.lane=12;car.s=980;assert.equal(traffic.canHostStoryVehicle(car),false);car.s=100;car.busRun={ended:true}as any;assert.equal(traffic.canHostStoryVehicle(car),false);
});

test('missing ambient bus gets one real NPC on the verified wide left lane, with a clear right-side approach and no duplicate spawn',()=>{
 const {traffic,car}=fixture('auto');traffic.clear();const bus=traffic.ensureStoryVehicle('bus',0,0)!;assert.ok(bus);assert.equal(bus.group,'bus');assert.equal(bus.g.parent,traffic.scene);assert.equal(traffic.canHostStoryVehicle(bus),true);assert.ok(Math.hypot(bus.x,bus.z)>=60&&Math.hypot(bus.x,bus.z)<=220);assert.equal(traffic.storyVehicleLeaseStatus(bus.g.uuid),'active');
 assert.equal(traffic.ensureStoryVehicle('bus',0,0),bus);assert.equal(traffic.cars.length,1);assert.notEqual(bus,car);
});
test('fallback never puts an RTC bus onto a narrow road with no legal passing lane',()=>{
 const {traffic,graph}=fixture();traffic.clear();graph.edges[0].e.w=9.4;assert.equal(traffic.ensureStoryVehicle('bus',0,0),null);assert.equal(traffic.cars.length,0);assert.equal(traffic.getStoryVehicleCorridor(),null);
});
test('fallback rejects existing traffic across its spawn footprint instead of moving that traffic away',()=>{
 const {traffic,car}=fixture();const before={x:car.x,z:car.z,s:car.s};const bus=traffic.ensureStoryVehicle('bus',0,0);assert.deepEqual({x:car.x,z:car.z,s:car.s},before);if(bus)assert.ok(Math.hypot(bus.x-car.x,bus.z-car.z)>5);
});
test('entry revalidates current physical right-side corridor instead of trusting an old eligible graph route',()=>{
 const {traffic,car,graph}=fixture();const surface={kind:'road',ax:0,az:0,bx:0,bz:-1000,ya:0,yb:0,hw:20,e:graph.edges[0].e},grid=new Map<string,any[]>();
 for(let x=-1;x<=1;x++)for(let z=-34;z<=0;z++)grid.set(`${x},${z}`,[surface]);
 const city:any={surfaceGrid:grid,buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),waterGrid:new Map(),landmarkSurfaceGrid:new Map()};(traffic as any).city=city;
 assert.equal(traffic.canEnterStoryVehicle(car),true);const side=car.size[0]/2+2.1,x=car.x-car.hz*side,z=car.z-60;city.obstacles.set(`${Math.floor(x/50)},${Math.floor(z/50)}`,[{x,z,r:1.2,top:2}]);
 traffic.t+=.7;assert.equal(traffic.canHostStoryVehicle(car),true,'graph runway alone still appears suitable');assert.equal(traffic.canEnterStoryVehicle(car),false,'real blocker along the upcoming Roadster lane prevents capture');
 city.obstacles.clear();traffic.t+=.7;car.s=900;const pose=graph.pointAt(car.edge,car.s,car.dir,car.lane);Object.assign(car,pose);assert.equal(traffic.canEnterStoryVehicle(car),false,'long approach cannot capture after its once-long runway expires');
});
test('nearby narrow streets cannot hide a valid wide scene corridor from the bounded fallback search',()=>{
 const {traffic,graph}=fixture();traffic.clear();const original=graph.edges[0].e;
 traffic.graph=new RoadGraph([...Array.from({length:18},(_,i)=>({...original,id:`narrow-${i}`,from:`n${i}a`,to:`n${i}b`,w:9.4,pts:[[i*3,0],[i*3,-1000]]as[number,number][]})),{...original,id:'wide',from:'wa',to:'wb',pts:[[140,0],[140,-1000]]}]);
 const bus=traffic.ensureStoryVehicle('bus',0,0);assert.ok(bus,'eligible width is filtered before the twelve-edge cap');assert.equal(bus.edge.e.id,'wide');
});
test('a real continuous arterial split into short source records remains a usable cinematic corridor',()=>{
 const {traffic,graph}=fixture();traffic.clear();const e=graph.edges[0].e;
 traffic.graph=new RoadGraph(Array.from({length:60},(_,i)=>({...e,id:`split-${i}`,from:`p${i}`,to:`p${i+1}`,pts:[[0,-i*18],[0,-(i+1)*18]]as[number,number][]})));
 const car=traffic.spawnAt('auto',traffic.graph.edges[0],1,8,12);assert.equal(traffic.canHostStoryVehicle(car),true,'source record end is not a physical dead end');assert.equal(traffic.canEnterStoryVehicle(car),true);
});
test('reading the same live lease every frame preserves the bounded physical-entry cache',()=>{
 const {traffic,car}=fixture();traffic.leaseStoryVehicle(car.g.uuid);assert.equal(traffic.canEnterStoryVehicle(car),true);const check=(traffic as any).storyEntryCheck;
 for(let i=0;i<20;i++){traffic.leaseStoryVehicle(car.g.uuid);traffic.canEnterStoryVehicle(car);assert.equal((traffic as any).storyEntryCheck,check,'same carrier cannot trigger a full city geometry probe every frame');}
 traffic.t+=.7;traffic.canEnterStoryVehicle(car);assert.notEqual((traffic as any).storyEntryCheck,check,'normal validation interval still expires');
});
test('fast flight directly onto a stable offered rendezvous spawns one actual bus ahead on that same real corridor',()=>{
 const {traffic}=fixture();traffic.clear();assert.equal(traffic.ensureStoryVehicle('bus',700,0),null);const hint={...traffic.getStoryVehicleCorridor()!};assert.ok(Number.isFinite(hint.x));
 traffic.t+=3;assert.equal(traffic.ensureStoryVehicle('bus',650,0),null);assert.deepEqual(traffic.getStoryVehicleCorridor(),hint,'verified rendezvous stays fixed while approaching');
 traffic.t+=3;const bus=traffic.ensureStoryVehicle('bus',hint.x,hint.z);assert.ok(bus,'teleport/fast flight cannot skip the spawn window');assert.equal(bus.g.parent,traffic.scene);assert.equal(bus.edge.e.id,'long');assert.equal(traffic.cars.length,1);const distance=Math.hypot(bus.x-hint.x,bus.z-hint.z);assert.ok(distance>=60&&distance<=160);assert.equal(traffic.storyVehicleLeaseStatus(bus.g.uuid),'active');
});
test('an occupied rendezvous spawn probes a nearby clear position on the same corridor without moving other traffic',()=>{
 const {traffic}=fixture();traffic.clear();traffic.ensureStoryVehicle('bus',700,0);const hint={...traffic.getStoryVehicleCorridor()!},candidate=(traffic as any).pendingStoryVehicle.candidate;
 const other=traffic.spawnAt('car',candidate.edge,candidate.dir,candidate.s,candidate.lane),before={x:other.x,z:other.z,s:other.s};traffic.t+=3;const bus=traffic.ensureStoryVehicle('bus',hint.x,hint.z);assert.ok(bus);assert.equal(bus.edge,candidate.edge);assert.ok(Math.hypot(bus.x-hint.x,bus.z-hint.z)>=60);assert.deepEqual({x:other.x,z:other.z,s:other.s},before,'traffic was never displaced to stage the scene');assert.equal(traffic.cars.filter(c=>c.group==='bus').length,1);
});

test('the marked RTC service retains its lane and identity instead of following a published stop span onto a narrow turn',()=>{
 const {traffic,car}=fixture('bus'),id=car.g.uuid,lane=car.lane;
 car.busRun={ended:false}as any;car.stopS=120;car.planAfter=100;car.dwell=4;
 traffic.leaseStoryVehicle(id);
 assert.equal(car.busRun,undefined);assert.equal(car.motion,undefined);assert.equal(car.stopS,undefined);assert.equal(car.dwell,0);assert.equal(car.lane,lane);assert.equal(car.g.uuid,id);
 traffic.update(1/30,0,-100,{x:0,y:.55,z:-100,speed:0});assert.ok(car.speed>0);assert.equal(traffic.storyVehicleLeaseStatus(id),'active');
});

test('bus acquisition waits for a clear moving approach instead of marking an existing stopped junction queue',()=>{
 const {traffic,car,graph}=fixture('bus');const obstacle=traffic.spawnAt('auto',graph.edges[0],1,125,12);obstacle.speed=0;
 assert.equal(traffic.canHostStoryVehicle(car),false);obstacle.speed=8;assert.equal(traffic.canHostStoryVehicle(car),true);
});

test('a leased bus waits on its wide road before the legal passing corridor ends and remains approachable',()=>{
 const {traffic,car,graph}=fixture('bus');traffic.leaseStoryVehicle(car.g.uuid);car.s=940;Object.assign(car,graph.pointAt(car.edge,car.s,car.dir,car.lane));traffic.update(1/30,0,-100,{x:0,y:.55,z:-100,speed:0});
 assert.equal(car.stopS,graph.edges[0].len-35);assert.equal(car.motion,undefined);
 car.s=car.stopS!;Object.assign(car,graph.pointAt(car.edge,car.s,car.dir,car.lane));car.speed=0;
 assert.equal(traffic.canEnterStoryVehicle(car),true,'the same waiting bus still accepts a grounded approach');assert.equal(traffic.storyVehicleLeaseStatus(car.g.uuid),'active');
});

test('the first overlapping bumper frame uses relative inward speed, including oncoming traffic',()=>{
 const {traffic,car}=fixture('bike');
 for(const [playerSpeed,npcSpeed,oncoming,kicked] of [[70,68,false,false],[70,0,false,true],[35,35,true,true],[40,65,false,false]] as const){
   const heading=oncoming?-1:1;
   car.speed=npcSpeed/3.6;car.arcadeFlight=undefined;car.shove=undefined;
   const distance=car.size[2]/2+2.4-.001;
   const pos={x:car.x-car.hx*heading*distance,y:car.y+.55,z:car.z-car.hz*heading*distance};
   const result=traffic.resolvePlayerContact(pos,playerSpeed/3.6,car.hx*heading,car.hz*heading);
   assert.equal(result.impact?.kicked,kicked);
   assert.ok(Math.abs(result.impact!.closing*3.6-Math.max(0,playerSpeed-heading*npcSpeed))<1e-6);
 }
});
test('slow touches transfer momentum by weight, move the same NPC down its road, and then decay',()=>{
 let previous=Infinity;
 for(const group of ['bike','auto','car','truck','bus'] as const){
   const {traffic,car}=fixture(group);car.speed=0;
   const distance=car.size[2]/2+2.39;
   const pos={x:car.x-car.hx*distance,y:car.y+.55,z:car.z-car.hz*distance};
   const result=traffic.resolvePlayerContact(pos,2,car.hx,car.hz);
   assert.equal(result.impact?.kicked,false);
   assert.ok(result.speed < previous);previous=result.speed;
   const start=car.s;
   for(let i=0;i<120 && car.shove;i++) (traffic as any).rollShove(car,1/60,pos,[]);
   assert.ok(car.s>start);assert.equal(car.shove,undefined);
 }
});
test('a side touch shifts the lane and a clear overhead pass never pushes',()=>{
 const {traffic,car}=fixture('auto');car.speed=0;
 const hx=car.hz,hz=-car.hx,dist=2.39+car.size[0]/2;
 const pos={x:car.x-hx*dist,y:car.y+.55,z:car.z-hz*dist};
 assert.equal(traffic.resolvePlayerContact(pos,5,hx,hz,{bottom:4,top:5}).impact,undefined);
 const before=car.lane;
 traffic.resolvePlayerContact(pos,5,hx,hz);
 (traffic as any).rollShove(car,1/60,pos,[]);
 assert.ok(car.lane>before);assert.equal(car.arcadeFlight,undefined);
});

test('unoccupied street vehicles use the bumper threshold, settle, and leave the old parking spot clear',()=>{
 for(const [kind,speed,launch] of [['bike',2,false],['bike',28,true],['bus',28,false]] as const){
   const {traffic,car,graph}=fixture(kind); traffic.clear();
   const pose=graph.pointAt(graph.edges[0],100,1,3);
   const body={...pose,id:'bay-1',kind,size:car.size,pitch:0,loaded:true,sync(){}};
   const road={kind:'road',ax:0,az:0,bx:0,bz:-1000,ya:0,yb:0,hw:20,e:graph.edges[0].e};
   const surfaceGrid=new Map(); for(let i=-1;i<=1;i++)for(let j=-34;j<=0;j++)surfaceGrid.set(i+','+j,[road]);
   const city={surfaceGrid,walls:new Map(),obstacles:new Map(),buildingGrid:new Map(),parkedVehiclesNear:()=>[body]};
   (traffic as any).city=city;
   const gap=car.size[2]/2+2.39;
   const bumper={x:body.x,y:.55,z:body.z+gap};
   const result=traffic.resolvePlayerContact(bumper,speed,0,-1);
   assert.equal(result.impact?.kicked,launch);
   assert.equal(traffic.cars.length,0,'unoccupied vehicle never becomes an NPC with a driver');
   let peak=0;
   for(let i=0;i<185;i++){(traffic as any).advanceParked(1/60);peak=Math.max(peak,body.y);}
   assert.equal(peak>2,launch);
   assert.equal(body.y,0);
   assert.ok(body.z<pose.z-.01);
   assert.equal((traffic as any).parkedMotion.size,0);
   if(launch)assert.equal(traffic.resolvePlayerContact(bumper,0,0,-1).impact,undefined);
 }
});
