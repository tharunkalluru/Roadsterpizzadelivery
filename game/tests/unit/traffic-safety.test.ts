import {describe,expect,it,vi} from 'vitest';
import {makeFixtureCore,makeFixtureWorld,fixtureMission} from './fixture';
import {Session} from '../../src/missions/session';
import {Autopilot} from '../../src/debug/autopilot';
import {WorldPhysics} from '../../src/world/collision';
import {TrafficSystem,type Actor,type Pedestrian} from '../../src/traffic/traffic';
import {SignalSystem} from '../../src/traffic/signals';
import {attachTransport,type TransportData,type TransportFeature} from '../../src/traffic/placements';
import {Player,NO_INPUT} from '../../src/player/player';
import {FlightLedger} from '../../src/player/flightLedger';
import {Rng} from '../../src/core/rng';
import {SIM_HZ,TRAFFIC} from '../../src/config/gameplay';
import {forwardOf,wrapAngle} from '../../src/world/roadIndex';
const distant={x:60,z:-500,y:0,speed:0,heading:0,airborne:false};
function actor(world:WorldPhysics,id:number,edge:string,along:number,kind:Actor['kind']='car'):Actor {
 const dims={car:[4.2,1.8,1.5,11.5],bus:[11.5,2.6,3.2,9.5],auto:[2.9,1.4,1.8,9],bike:[2,.8,1.5,12],bicycle:[1.85,.65,1.65,5.5],truck:[7.5,2.4,3,9]}[kind];
 const p=world.nav.pointOnDirected(edge,along),[fx,fz]=forwardOf(p.heading),lateral=-world.roads.roads.get(world.nav.edges.get(edge)!.roadId)!.widthM/4;
 const x=p.x-fz*lateral,z=p.z+fx*lateral;
 return{id,kind,edge,along,speed:5,lateral,laneLateral:lateral,vmax:dims[3],length:dims[0],width:dims[1],height:dims[2],state:'drive',stateTicks:0,waitTicks:0,braking:false,x,z,y:p.y,heading:p.heading,px:x,pz:z,py:p.y,pheading:p.heading};
}
const source={id:'osm',url:'https://www.openstreetmap.org',license:'ODbL-1.0',fetchedAt:'2026-10-18'};
const feature=(id:string,kind:TransportFeature['kind'],along:number,tags?:Record<string,string>):TransportFeature=>({id,kind,x:-8,z:-along,lat:17.4,lon:78.4,sourceId:'osm',sourceElementId:`node/${id}`,status:'source_mapped',tags});
const data=(features:TransportFeature[]):TransportData=>({version:1,worldId:'hyd-metro',worldVersion:'fixture',sources:[source],features});
const rng=()=>{const r=new Rng(3);r.next=()=>.999;return r;};
function assertBodyClear(world:WorldPhysics,a:Actor){
 const [fx,fz]=forwardOf(a.heading),n=Math.max(2,Math.ceil(a.length/a.width));
 for(let i=0;i<n;i++){const off=-a.length/2+a.width/2+i*(a.length-a.width)/(n-1);expect(world.contacts(a.x+fx*off,a.z+fz*off,a.y+.05,a.height-.1,a.width/2+.14)).toEqual([]);}
}

describe('traffic movement safety',()=>{
 it('skips collision queries only for an exactly stationary queue, then sweeps as soon as it moves',()=>{
  const world=makeFixtureWorld(),traffic=new TrafficSystem(world,rng()),a=actor(world,1,'A1:f',400);a.state='queue';a.holdUntil=1000;a.speed=0;traffic.actors=[a];
  const query=vi.spyOn(world,'contacts');traffic.step(distant);expect(query).not.toHaveBeenCalled();expect(a.along).toBe(400);
  a.holdUntil=0;traffic.step(distant);expect(query).toHaveBeenCalled();expect(a.along).toBeGreaterThan(400);query.mockRestore();
 });
 it('sweeps the player through a moving-world vehicle instead of testing only the final position',()=>{
  const world=makeFixtureWorld(),traffic=new TrafficSystem(world,rng());traffic.actors=[actor(world,1,'A1:f',108)];
  const p=new Player(world,new FlightLedger(25),traffic);p.place(-3,-100,0,'A1');p.speed=1000;
  const events=p.step({...NO_INPUT,accel:true});
  expect(events.some(e=>e.type==='contact'&&e.kind==='vehicle')).toBe(true);expect(p.z).toBeGreaterThan(-108);expect(p.move).toBe('RECOVERING');
 });
 it('stops a full NPC body before a narrow static wall and eventually recycles an impossible route',()=>{
  const world=makeFixtureWorld();world.addStructures([{id:'wall',poly:[[-6,-430],[0,-430],[0,-430.3],[-6,-430.3]],bottom:0,top:3}]);
  const traffic=new TrafficSystem(world,rng()),a=actor(world,1,'A1:f',400);a.speed=10;traffic.actors=[a];
  for(let i=0;i<14*SIM_HZ;i++){traffic.step(distant);for(const q of traffic.actors)assertBodyClear(world,q);}
  expect(a.along).toBeLessThan(428);expect(traffic.actors).toHaveLength(0);expect(traffic.log).toContain('deadlock-recycle 1 car A1:f');
 });
 it('does not permanently protect a physically impossible turn as a legitimate junction wait',()=>{
  const core=makeFixtureCore();core.junctions=[{id:'junction',nodeId:'n1',incoming:['A1:f'],outgoing:['B:f'],movementStatus:'scenario_overlay',signalled:true}];
  const world=new WorldPhysics(core);world.addStructures([{id:'blocked-turn',poly:[[-6,-999],[12,-999],[12,-1006],[-6,-1006]],bottom:0,top:3}]);
  const traffic=new TrafficSystem(world,rng()),a=actor(world,1,'A1:f',994);a.nextEdge='B:f';traffic.actors=[a];
  for(let i=0;i<12*SIM_HZ;i++)traffic.step({...distant,z:-1000});
  expect(traffic.actors).toHaveLength(0);expect(traffic.log).toContain('deadlock-recycle 1 car A1:f');
 });
 it('keeps runtime actors legal, spaced and outside static geometry on a narrow residential street',()=>{
  const core=makeFixtureCore();core.roads=core.roads.filter(r=>r.id==='A1');core.directed=core.directed.filter(e=>e.roadId==='A1');for(const e of core.directed)e.next=[];core.roads[0].widthM=5.5;core.roads[0].highway='residential';
  const world=new WorldPhysics(core);world.addStructures([{id:'occupied-verge',poly:[[-2.7,-650],[-.3,-650],[-.3,-620],[-2.7,-620]],bottom:0,top:3}]);
  const traffic=new TrafficSystem(world,new Rng(42));traffic.reserved=[{x:-1.5,z:-550,r:12}];
  for(let i=0;i<20;i++)traffic.spawnAround(0,-500,0,30);
  expect(traffic.actors.length).toBeGreaterThan(5);
  for(const a of traffic.actors){expect(['bus','truck']).not.toContain(a.kind);expect(a.lateral+a.width/2).toBeLessThan(0);assertBodyClear(world,a);expect(Math.hypot(a.x+1.5,a.z+550)).toBeGreaterThan(20);expect(Math.hypot(a.x,a.z+500)).toBeGreaterThanOrEqual(TRAFFIC.minSpawnDistance-4);}
  for(let i=0;i<traffic.actors.length;i++)for(const b of traffic.actors.slice(i+1)){const a=traffic.actors[i];expect(Math.hypot(a.x-b.x,a.z-b.z)).toBeGreaterThan((a.length+b.length)/2+1);}
 });
 it('caps NPC speed using a sourced road limit, including new spawns',()=>{
  const core=makeFixtureCore();core.roads[0].sourceProperties={maxSpeedKph:20,widthBasis:'class_default',classificationBasis:'overture_class',sourceIds:['osm/fixture'],sourceRules:{}};
  const world=new WorldPhysics(core),traffic=new TrafficSystem(world,new Rng(42));traffic.prewarmAround({x:-3,z:-500,y:0,heading:0});
  expect(traffic.actors.filter(a=>a.edge.startsWith('A1:')).length).toBeGreaterThan(0);
  for(const a of traffic.actors.filter(a=>a.edge.startsWith('A1:'))){expect(a.speed).toBeLessThanOrEqual(20/3.6);expect(a.vmax).toBeLessThanOrEqual(20/3.6);}
  const a=actor(world,99,'A1:f',400);traffic.actors=[a];for(let i=0;i<10*SIM_HZ;i++)traffic.step(distant);expect(a.speed).toBeLessThanOrEqual(20/3.6+.01);
 });
 it('follows a continuous turn without a lane-offset teleport',()=>{
  const world=makeFixtureWorld(),traffic=new TrafficSystem(world,rng()),a=actor(world,1,'A1:f',980);a.nextEdge='B:f';traffic.actors=[a];
  let turned=false,maxStep=0,maxYaw=0;
  for(let i=0;i<14*SIM_HZ;i++){const{x,z,heading}=a;traffic.step({...distant,z:-1000});maxStep=Math.max(maxStep,Math.hypot(a.x-x,a.z-z));maxYaw=Math.max(maxYaw,Math.abs(wrapAngle(a.heading-heading)));if(a.edge==='B:f'&&a.along>20)turned=true;}
  expect(turned).toBe(true);expect(maxStep).toBeLessThan(.21);expect(maxYaw).toBeLessThan(.04);expect(traffic.log).toEqual([]);
 });
 it('sweeps an NPC turn against a stationary player even when longitudinal following misses the angle',()=>{
  const world=makeFixtureWorld(),traffic=new TrafficSystem(world,rng()),a=actor(world,1,'A1:f',991);a.nextEdge='B:f';traffic.actors=[a];
  const player={x:0,z:-1002,y:0,heading:Math.PI/2,speed:0,airborne:false};
  for(let i=0;i<8*SIM_HZ;i++)traffic.step(player);
  expect(a.edge).toBe('A1:f');expect(a.along).toBeLessThan(1000);expect(a.speed).toBe(0);
 });
});

describe('sourced stop and crossing lifecycle',()=>{
 it('keeps walking pedestrians on the raised footpath and turns them before solid roadside furniture',()=>{
  const world=makeFixtureWorld();world.addStructures([{id:'vendor',poly:[[-8,-451],[-6.8,-451],[-6.8,-450],[-8,-450]],bottom:0,top:2}]);
  const traffic=new TrafficSystem(world,rng()),p:Pedestrian={id:1,edge:'A1',along:440,side:-1,dir:1,speed:1.2,state:'walk',stateTicks:0,crossT:0,x:-7.4,z:-440,y:.16,heading:0,px:-7.4,pz:-440,pheading:0};traffic.peds=[p];
  let turned=false;for(let i=0;i<20*SIM_HZ;i++){traffic.step(distant);if(p.dir===-1)turned=true;expect(world.contacts(p.x,p.z,p.y+.05,1.7,.3)).toEqual([]);expect(p.y).toBeCloseTo(.16);}
  expect(turned).toBe(true);expect(p.along).toBeLessThan(450);
 });
 it.each([['bus','bus_stop',8],['auto','auto_stand',15]] as const)('makes a %s stop only at its mapped kerb, dwell, then merge', (kind,stopKind,seconds)=>{
  const world=new WorldPhysics(attachTransport(makeFixtureCore(),data([feature('stop',stopKind,500)]))),traffic=new TrafficSystem(world,rng()),a=actor(world,1,'A1:f',460,kind);traffic.actors=[a];
  let dwell=0,resumed=false;for(let i=0;i<50*SIM_HZ;i++){traffic.step(distant);if(a.stopDwellUntil!==undefined)dwell++;if(dwell&&a.along>515)resumed=true;}
  expect(dwell).toBeGreaterThanOrEqual((seconds-.1)*SIM_HZ);expect(resumed).toBe(true);expect(traffic.log).toEqual([]);
  const opposite=actor(world,2,'A1:b',460,kind);traffic.actors=[opposite];for(let i=0;i<10*SIM_HZ;i++)traffic.step(distant);expect(opposite.lastStop).toBeUndefined();
 });
 it('does not invent station boarding stops when the sourced transport inventory has no matched stop',()=>{
  const core=makeFixtureCore();core.stations=[{id:'station',name:'Test',sourceName:'Test',nameTe:null,lines:['blue'],lat:0,lon:0,x:0,z:-500,osmIds:[],isDeliveryEntrance:false,inCorridor:true,status:{geometry:'scenario_overlay'}}];
  const world=new WorldPhysics(attachTransport(core,data([]))),traffic=new TrafficSystem(world,rng()),a=actor(world,1,'A1:f',460,'bus');traffic.actors=[a];
  for(let i=0;i<12*SIM_HZ;i++)traffic.step(distant);expect(a.lastStop).toBeUndefined();expect(a.along).toBeGreaterThan(520);
 });
 it('waits for a full protected walking interval and holds vehicles at the mapped crossing',()=>{
  const core=makeFixtureCore();core.junctions=[{id:'signal',nodeId:'n1',incoming:['A1:f'],outgoing:['B:f','A2:f'],movementStatus:'scenario_overlay',signalled:true}];
  const world=new WorldPhysics(attachTransport(core,data([feature('crossing','crossing',960,{crossing:'traffic_signals'})]))),traffic=new TrafficSystem(world,rng());
  const p:Pedestrian={id:2,edge:'A1',along:960,side:-1,dir:1,speed:1.2,state:'wait',stateTicks:100,crossT:0,crossingId:'crossing',x:-7.4,z:-960,y:0,heading:0,px:-7.4,pz:-960,pheading:0};traffic.peds=[p];
  const a=actor(world,1,'A1:f',950);a.speed=0;traffic.actors=[a];
  (traffic as unknown as {tickCount:number}).tickCount=SignalSystem.CYCLE-30;
  for(let i=0;i<29;i++)traffic.step({...distant,z:-960});expect(p.state).toBe('wait');
  for(let i=0;i<6*SIM_HZ;i++)traffic.step({...distant,z:-960});expect(p.state).toBe('cross');
  expect(traffic.signals.colorFor('A1:f',traffic.tick)).toBe('red');expect(a.along+a.length/2).toBeLessThan(960);
  for(let i=0;i<14*SIM_HZ;i++)traffic.step({...distant,z:-960});expect(p.side).toBe(1);expect(p.state).toBe('walk');
 });
 it('does not begin an uncontrolled crossing in front of a nearby moving actor',()=>{
  const world=new WorldPhysics(attachTransport(makeFixtureCore(),data([feature('crossing','crossing',510)]))),traffic=new TrafficSystem(world,rng());
  const p:Pedestrian={id:2,edge:'A1',along:510,side:-1,dir:1,speed:1.2,state:'wait',stateTicks:100,crossT:0,crossingId:'crossing',x:-7.4,z:-510,y:0,heading:0,px:-7.4,pz:-510,pheading:0};traffic.peds=[p];const a=actor(world,1,'A1:f',490);a.speed=8;traffic.actors=[a];
  traffic.step(distant);expect(p.state).toBe('wait');
  for(let i=0;i<5*SIM_HZ;i++)traffic.step(distant);expect(p.state).toBe('cross');expect(a.along+a.length/2).toBeLessThan(510);
 });
 it('keeps a shared junction cycle synchronized even when only one graph node is close to the crossing',()=>{
  const core=makeFixtureCore();core.nodes.find(n=>n.id==='n3')!.x=40;
  core.junctions=['n1','n3'].map(nodeId=>({id:nodeId,nodeId,incoming:[],outgoing:[],movementStatus:'scenario_overlay' as const,signalled:true}));
  const world=new WorldPhysics(attachTransport(core,data([feature('crossing','crossing',960,{crossing:'traffic_signals'})]))),signals=new SignalSystem(world);
  expect(signals.nodes).toHaveLength(2);expect(signals.nodes.every(n=>n.pedestrian)).toBe(true);
  for(let t=0;t<3*(SignalSystem.CYCLE+SignalSystem.WALK+SignalSystem.WALK_CLEAR);t+=13){
   for(const n of signals.nodes)for(const a of n.approaches)expect(signals.colorFor(a.edge,t)).toBe(SignalSystem.phaseColor(a.phase,t+n.offset,true));
  }
 });
});

describe('conflicting junction movements',()=>{
 it('lets the lead vehicle clear a short connector before its own reserved followers enter',()=>{
  const core=makeFixtureCore(),a2=core.roads.find(r=>r.id==='A2')!;a2.points=[[0,-1000],[0,-1009]];a2.pointElevM=[0,0];a2.lengthM=9;core.nodes.find(n=>n.id==='n2')!.z=-1009;
  for(const e of core.directed.filter(e=>e.roadId==='A2'))e.lengthM=9;
  core.junctions=['n1','n2'].map(nodeId=>({id:nodeId,nodeId,incoming:[],outgoing:[],movementStatus:'scenario_overlay' as const,signalled:false}));
  const world=new WorldPhysics(core),traffic=new TrafficSystem(world,rng()),lead=actor(world,1,'A2:f',1),follow=actor(world,2,'A1:f',990);lead.nextEdge='D:b';follow.nextEdge='A2:f';traffic.actors=[lead,follow];
  const snapshot=traffic.snapshot();snapshot.junctionReservations=[{actor:2,node:'n1',entry:'A1:f',exit:'A2:f',heading:0,turn:0,until:480}];traffic.restore(snapshot);traffic.step({...distant,z:-1000});
  expect(traffic.actors[0].waitingForJunction).toBe(false);expect(traffic.actors[0].along).toBeGreaterThan(1);
 });
 it('releases a held bus reservation instead of renewing it throughout a source-stop dwell',()=>{
  const core=makeFixtureCore();core.junctions=[{id:'j',nodeId:'n1',incoming:[],outgoing:[],movementStatus:'scenario_overlay',signalled:false}];const world=new WorldPhysics(core),traffic=new TrafficSystem(world,rng()),bus=actor(world,1,'A1:f',993,'bus');bus.state='curb';bus.stopAlong=995;bus.stopDwellUntil=900;bus.speed=0;bus.nextEdge='B:f';traffic.actors=[bus];
  for(let i=0;i<500;i++)traffic.step({...distant,z:-1000});expect(bus.stopDwellUntil).toBe(900);expect(traffic.snapshot().junctionReservations).toEqual([]);
 });
 it('abandons an unreachable source-stop approach after a bounded wait while retaining real queue safety',()=>{
  const world=makeFixtureWorld(),traffic=new TrafficSystem(world,rng()),bus=actor(world,1,'A1:f',400,'bus'),lead=actor(world,2,'A1:f',412);
  Object.assign(bus,{state:'curb',speed:0,stopAlong:430});Object.assign(lead,{state:'queue',speed:0,holdUntil:10000});traffic.actors=[bus,lead];
  for(let i=0;i<31*SIM_HZ;i++)traffic.step(distant);
  expect(bus.state).not.toBe('curb');expect(bus.stopAlong).toBeUndefined();expect(bus.stopDwellUntil).toBeUndefined();expect(bus.along).toBeLessThan(405);expect(traffic.actors).toHaveLength(2);
 });
 it('resets reference-driver progress after a real reroute, but still recovers if that route remains stuck',()=>{
  const s=new Session(makeFixtureWorld(),fixtureMission({pickupId:'d_side'}),{trafficEnabled:false}),ap=new Autopilot(s);s.start();ap.input();
  const state=ap as unknown as {bestRemaining:number;progressTick:number};state.bestRemaining=10;state.progressTick=0;s.tick=1201;s.route=['A1:f','A2:f','D:b','D:f','A2:b','B:f'];
  ap.input();expect(s.phase).toBe('PLAYING');s.tick+=1201;s.route=[...s.route];ap.input();expect(s.phase).toBe('RECOVERING');
 });
 it('does not stop for a footpath pedestrian outside its swept body, while yielding to one inside it',()=>{
  const s=new Session(makeFixtureWorld(),fixtureMission({pickupId:'d_main'}),{trafficEnabled:false}),ap=new Autopilot(s);s.start();s.player.place(-3,-100,0,'A1');s.reroute();
  const p:Pedestrian={id:99,edge:'A1',along:105,side:1,dir:1,speed:1,state:'walk',stateTicks:0,crossT:0,x:-1.4,z:-105,y:0,heading:0,px:-1.4,pz:-105,pheading:0};s.traffic.peds=[p];
  expect(ap.input().accel).toBe(true);p.x=-1.8;expect(ap.input().accel).toBe(false);expect(ap.why).toBe('ped 99');
 });
 it('lets the reference driver wait through a real protected walk interval without treating it as a recovery',()=>{
  const core=makeFixtureCore();core.junctions=[{id:'signal',nodeId:'n1',incoming:['A1:f'],outgoing:['A2:f','B:f'],movementStatus:'scenario_overlay',signalled:true}];
  const world=new WorldPhysics(attachTransport(core,data([feature('crossing','crossing',960,{crossing:'traffic_signals'})]))),s=new Session(world,fixtureMission({pickupId:'d_side'}),{spawn:{x:-3,z:-985,heading:0,roadId:'A1'}}),ap=new Autopilot(s);
  s.start();const a=actor(world,1,'A1:f',994);a.speed=0;s.traffic.actors=[a];
  s.tick=SignalSystem.CYCLE+SIM_HZ;(s.traffic as unknown as {tickCount:number}).tickCount=s.tick;
  for(let i=0;i<21*SIM_HZ;i++){s.step(ap.input());expect(s.phase).toBe('PLAYING');}
  expect(s.recoveries).toBe(0);expect(s.traffic.signals.colorFor('A1:f',s.traffic.tick)).toBe('red');
 });
 it('reserves a clear movement and preserves that priority through a checkpoint',()=>{
  const core=makeFixtureCore();core.junctions=[{id:'junction',nodeId:'n1',incoming:['A1:f','B:b'],outgoing:['A2:f','B:f'],movementStatus:'scenario_overlay',signalled:false}];
  const world=new WorldPhysics(core),traffic=new TrafficSystem(world,rng()),a=actor(world,1,'A1:f',990),b=actor(world,2,'B:b',390);a.nextEdge='A2:f';b.nextEdge='A1:b';traffic.actors=[a,b];traffic.step({...distant,z:-1000});
  const snap=traffic.snapshot();expect(snap.junctionReservations).toHaveLength(1);expect(snap.junctionReservations[0].actor).toBe(1);expect(b.waitingForJunction).toBe(true);
  const restored=new TrafficSystem(world,rng());restored.restore(snap);
  for(let i=0;i<8*SIM_HZ;i++){traffic.step({...distant,z:-1000});restored.step({...distant,z:-1000});}
  expect(restored.snapshot()).toEqual(traffic.snapshot());expect(a.edge).toBe('A2:f');expect(b.edge).toBe('A1:b');expect(traffic.log).toEqual([]);
 });
});
