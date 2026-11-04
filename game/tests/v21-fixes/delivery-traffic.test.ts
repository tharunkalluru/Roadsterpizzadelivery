import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Traffic } from '../../src/game/traffic';
import { RoadGraph } from '../../src/game/roadgraph';
import { rng } from '../../src/core/util';
import type { MovingRailBody } from '../../src/game/moving-rail';
import { trafficOverlap } from '../../src/game/traffic-path';
import { installLegacyCandidateActors } from './fixtures/legacy-candidate-actors';
import { createDeliveryModule,type DeliveryPlayer } from '../../src/delivery/modules';
import { truckRearTrafficReservation } from '../../src/delivery/modules/truck-interior';
import { StoryLandingGate } from '../../src/delivery/systems/story-landing';
installLegacyCandidateActors();

const sizes = { car: [1.8, 1.6, 4.5], auto: [1.36, 1.85, 2.65], bike: [.75, 1.9, 2], bus: [2.5, 3.3, 11], truck: [2.5, 3.1, 8.4] };
const farPlayer = { x: 350, y: .55, z: 200, speed: 0, hx: 1, hz: 0 };
function fixture(group: keyof typeof sizes = 'car') {
  const road: any = { id: 'delivery-road', seg: 'd', from: 'a', to: 'b', cls: 'primary', w: 12, lanes: 2, oneway: null, elev: null, pts: [[0, 0], [500, 0]], name: 'test', maxspeed: null };
  const byGroup = Object.fromEntries(Object.entries(sizes).map(([group, size]) => [group, [{ group, size, body: new THREE.BufferGeometry(), lights: new THREE.BufferGeometry(), decals: [] }]]));
  const traffic = Object.assign(Object.create(Traffic.prototype), { cars: [], max: 0, graph: new RoadGraph([road]), scene: new THREE.Scene(),
    mats: { vBody: new THREE.MeshBasicMaterial(), vLight: new THREE.MeshBasicMaterial() }, byGroup, r: rng(77), t: 0, plans: 0,
    passengerExchanges: [], stopsByEdge: new Map(), onHorn() {} }) as Traffic;
  const car = traffic.spawnAt(group, traffic.graph.edges[0], 1, 80, 3);
  car.speed = 12; car.want = 12; car.uturnAt = Infinity; car.laneChangeAt = Infinity;
  return { traffic, car };
}
function truck(x = 120, y = 0): MovingRailBody {
  return { id: 'delivery-log-truck', x, y, z: -3, hx: 1, hz: 0, halfWidth: 1.95, halfLength: 5.25,
    bottom: y + .2, roof: y + 2.8, previous: { x, y, z: -3, hx: 1, hz: 0 } };
}

test('every NPC class brakes before the delivery truck and resumes after it leaves', () => {
  for (const group of Object.keys(sizes) as (keyof typeof sizes)[]) {
    const { traffic, car } = fixture(group), body = truck();
    traffic.setKinematicVehicles([body], 1 / 60);
    for (let n = 0; n < 600; n++) traffic.update(1 / 60, 100, 0, farPlayer);
    assert.ok(car.x + car.size[2] / 2 < body.x - body.halfLength, `${group} must not penetrate truck`);
    assert.ok(car.speed < .2, `${group} settles behind stopped truck: speed ${car.speed}, x ${car.x}`);
    assert.equal(trafficOverlap(car, { ...body, y: body.bottom, size: [3.9, 2.6, 10.5] }), false);
    const stopped = car.x; traffic.setKinematicVehicles([], 1 / 60);
    for (let n = 0; n < 120; n++) traffic.update(1 / 60, 100, 0, farPlayer);
    assert.ok(car.x > stopped + 2, `${group} resumes after teardown`);
  }
});

test('an empty adapter preserves ordinary traffic motion exactly', () => {
  const a = fixture('bus'), b = fixture('bus');
  for (let n = 0; n < 180; n++) {
    a.traffic.update(1 / 60, 100, 0, farPlayer);
    b.traffic.setKinematicVehicles([], 1 / 60); b.traffic.update(1 / 60, 100, 0, farPlayer);
    assert.deepEqual([a.car.x, a.car.y, a.car.z, a.car.hx, a.car.hz, a.car.speed], [b.car.x, b.car.y, b.car.z, b.car.hx, b.car.hz, b.car.speed]);
  }
});

test('a truck on another vertical layer does not stop ground traffic', () => {
  const a = fixture(), b = fixture(); b.traffic.setKinematicVehicles([truck(120, 12)], 1 / 60);
  for (let n = 0; n < 150; n++) {
    a.traffic.update(1 / 60, 100, 0, farPlayer); b.traffic.update(1 / 60, 100, 0, farPlayer);
  }
  assert.equal(a.car.x, b.car.x); assert.equal(a.car.speed, b.car.speed);
});

test('delivery truck follows actual NPC speed and cannot enter an occupied NPC body', () => {
  const { traffic, car } = fixture(); car.x = 120; car.speed = 0;
  const body = truck(110);
  assert.ok(traffic.kinematicSpeedLimit(body, 8) < 2);
  assert.equal(traffic.kinematicPoseClear(truck(120)), false);
  assert.equal(traffic.kinematicPoseClear(truck(100)), true);
  car.y = 12; assert.equal(traffic.kinematicSpeedLimit(body, 8), 8);
  assert.equal(traffic.kinematicPoseClear(truck(120)), true);
});

test('adapter snapshots reusable bodies and ignores invalid scene geometry', () => {
  const { traffic } = fixture(); const body = truck(); body.previous.x = 119;
  traffic.setKinematicVehicles([body, { ...body, x: NaN }], .1);
  const list = (traffic as any).kinematicVehicles;
  assert.equal(list.length, 1); assert.equal(list[0].speed, 10);
  const snapshot = list[0]; body.x = 130; assert.equal(snapshot.x, 120);
  traffic.setKinematicVehicles([body], .1); assert.equal(list[0], snapshot); assert.equal(snapshot.x, 130);
  traffic.setKinematicVehicles([], 0); assert.equal(list.length, 0);
});

function actualTruck(traffic:Traffic,player:DeliveryPlayer){
  const module=createDeliveryModule('matchAndLand');module.setup({scene:traffic.scene,player:()=>player,
    destination:{x:120,y:0,z:-3},route:[{x:120,y:0,z:-3},{x:1000,y:0,z:-3}],
    automaticStories:true,canInteract:()=>true,emit(){},
    vehicleSpeedLimit:body=>traffic.kinematicSpeedLimit(body,6),vehiclePoseClear:body=>traffic.kinematicPoseClear(body),
  },{scene:'truckInterior',vehicle:'truck',speed:6});
  return module;
}
for(const group of ['bus','bike','car']as const)test(`actual ${group} keeps the complete stationary truck landing/ramp bay clear without losing its identity`,()=>{
  const {traffic,car}=fixture(group),player:DeliveryPlayer={x:103,y:24,z:-3,yaw:-Math.PI/2,speed:0,flying:true};
  const module=actualTruck(traffic,player),id=car.g.uuid,dt=1/60;let lastX=car.x;
  const tick=()=>{module.update(dt);traffic.setKinematicVehicles(module.trafficBodies??[],dt,module.trafficReservations??[]);traffic.update(dt,100,0,farPlayer);
    assert.equal(traffic.cars[0],car);assert.equal(car.g.uuid,id);assert.ok(car.x>=lastX-1e-9&&car.x-lastX<.3,'normal clock/path remains continuous');lastX=car.x;};
  const initial=module.trafficBodies![0].x;for(let i=0;i<120;i++)tick();
  assert.ok(module.trafficBodies![0].x>initial+7,'overhead flight does not park the truck');
  Object.assign(player,module.story!.point,{flying:false,y:.55});for(let i=0;i<480;i++)tick();
  const body=module.trafficBodies![0],reservation=module.trafficReservations![0],frame=module.story!;
  assert.ok(Math.abs(body.x-body.previous.x)<1e-8,'ground approach parks the real truck');
  assert.ok(!trafficOverlap(car,{...reservation,y:reservation.bottom,size:[reservation.halfWidth*2,reservation.roof-reservation.bottom,reservation.halfLength*2]},.3),'bus tail and nose stay outside the actual arrival/ramp space');
  assert.equal(traffic.hitTest(frame.point.x,.55,frame.point.z,1.3),null);
  const landing={point:{...frame.point},radius:3.15},gate=new StoryLandingGate();
  for(let i=0;i<40;i++)assert.equal(gate.update(dt,{...frame.point,y:24,yaw:player.yaw,speed:0,flying:true}, {...frame,landing},0,true,0,false),false,'reservation is not an automatic flight trigger');
  let settled=false;for(let i=0;i<40;i++)settled=gate.update(dt,{...frame.point,y:.55,yaw:player.yaw,speed:0,flying:false,verticalSpeed:0},{...frame,landing},0,true,0,false);
  assert.equal(settled,true,'the now-clear real ground permits a stationary manual arrival');
  assert.ok(!module.supports.some(b=>b.id===reservation.id),'reservation never becomes an invisible player collider');
  const stopped=car.x;module.teardown();traffic.setKinematicVehicles([],0,[]);for(let i=0;i<180;i++)traffic.update(dt,100,0,farPlayer);
  assert.ok(car.x>stopped+5);assert.equal(car.g.uuid,id);
});

for(const group of ['bus','bike','car']as const)test(`pre-existing ${group} inside a newly visible rear reservation clears naturally while the truck establishes headway`,()=>{
  const {traffic,car}=fixture(group),at=traffic.graph.pointAt(car.edge,103,1,3);Object.assign(car,at,{s:103,speed:3});
  const player:DeliveryPlayer={x:104,y:.55,z:5,yaw:-Math.PI/2,speed:0,flying:false},module=actualTruck(traffic,player),id=car.g.uuid,dt=1/60;
  const start=module.trafficBodies![0].x;let moved=0,cleared=false;
  for(let i=0;i<600;i++){
    module.update(dt);traffic.setKinematicVehicles(module.trafficBodies??[],dt,module.trafficReservations??[]);const prior=car.x;traffic.update(dt,100,0,farPlayer);moved+=car.x-prior;
    const bay=module.trafficReservations![0];cleared ||=!trafficOverlap(car,{...bay,y:bay.bottom,size:[bay.halfWidth*2,bay.roof-bay.bottom,bay.halfLength*2]},.3);
    assert.equal(traffic.cars[0],car);assert.equal(car.g.uuid,id);assert.ok(car.x>=prior&&car.x-prior<.2,'no pop, backwards jump or despawn');
    assert.ok(!trafficOverlap(car,{...module.trafficBodies![0],y:module.trafficBodies![0].bottom,size:[6.24,5.7,20]},0),'real truck body stays physical');
  }
  assert.ok(module.trafficBodies![0].x>start+8,'truck does not deadlock by parking over the occupied bay');assert.equal(cleared,true);
  assert.ok(moved>.1,'existing NPC brakes through its real path instead of freezing on an invisible reservation wall');module.teardown();
});

test('ordinary NPC spawning rejects the reserved rear bay separately from the real truck body',()=>{
  const {traffic}=fixture();traffic.cars.length=0;
  const random:any=()=>.4;random.pick=(items:any[])=>items[0];random.range=(lo:number,hi:number)=>(lo+hi)/2;traffic.r=random;
  const body=truck(220),reservation=truckRearTrafficReservation(body);traffic.setKinematicVehicles([body],.1,[reservation]);
  traffic.spawn(100,0);assert.equal(traffic.cars.length,0,'x=200 is behind the physical truck but inside its reserved approach');
  traffic.setKinematicVehicles([body],.1,[]);traffic.spawn(100,0);assert.equal(traffic.cars.length,1,'negative control: ordinary physical-truck-only spawn would crowd that bay');
});

test('rear reservations on an adjacent carriageway or another vertical level leave ordinary motion exact',()=>{
  for(const mode of ['adjacent','above']as const){
    const a=fixture(),b=fixture(),reservation=truckRearTrafficReservation(truck());
    if(mode==='adjacent')reservation.z+=10;else{reservation.y+=12;reservation.bottom+=12;reservation.roof+=12;}
    b.traffic.setKinematicVehicles([],1/60,[reservation]);
    for(let i=0;i<180;i++){a.traffic.update(1/60,100,0,farPlayer);b.traffic.update(1/60,100,0,farPlayer);}
    assert.deepEqual([b.car.x,b.car.y,b.car.z,b.car.speed],[a.car.x,a.car.y,a.car.z,a.car.speed],mode);
  }
});
