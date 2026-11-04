import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Traffic} from '../../src/game/traffic';
import {RoadGraph} from '../../src/game/roadgraph';
import {initTemplates} from '../../src/core/util';
import {truckRearTrafficReservation,TRUCK_REAR_APPROACH_CLEARANCE} from '../../src/delivery/modules/truck-interior';
import {roadster} from '../../src/world/vehicles';
import {createDeliveryModule} from '../../src/delivery/modules';
import {trafficOverlap} from '../../src/game/traffic-path';

const gradient={addColorStop(){}},context=new Proxy({measureText:(s:string)=>({width:s.length*12}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},
  {get:(o:any,k)=>k in o?o[k]:()=>{}});
(globalThis as any).document={createElement:()=>({width:256,height:128,getContext:()=>context})};
initTemplates({rbox:new THREE.BoxGeometry(1,1,1)});
const material=new THREE.MeshBasicMaterial(),farPlayer={x:10000,y:.55,z:10000,speed:0,hx:1,hz:0};
function fixture(y=0,dir:1|-1=1,lane=3){
  const road:any={id:'review-road',from:'a',to:'b',cls:'primary',w:16,lanes:4,oneway:null,pts:[[0,0],[500,0]],elev:[y,y]};
  const graph=new RoadGraph([road]),scene=new THREE.Scene();
  const traffic=new Traffic(graph,scene,{vBody:material,vLight:material},0);
  const bus=traffic.spawnAt('bus',graph.edges[0],dir,dir===1?80:400,lane);
  bus.speed=10;bus.want=10;bus.uturnAt=Infinity;bus.laneChangeAt=Infinity;
  return{traffic,bus,scene};
}
const truck={id:'delivery-log-truck',x:140,y:0,z:-3,hx:1,hz:0,halfWidth:3.12,halfLength:10,bottom:.2,roof:5.87,
  previous:{x:140,y:0,z:-3,hx:1,hz:0}};
const snapshot=(f:ReturnType<typeof fixture>)=>[f.bus.x,f.bus.y,f.bus.z,f.bus.hx,f.bus.hz,f.bus.speed];

test('NPC bay clearance covers the actual ordinary Roadster on the real truck bed without using container height',()=>{
  const model=roadster(new Proxy({},{get:()=>material}),{logo:material,plate:material}),bounds=new THREE.Box3();
  model.group.updateWorldMatrix(true,true);model.group.traverseVisible(node=>{
    if(!(node instanceof THREE.Mesh))return;node.geometry.computeBoundingBox();
    bounds.union(node.geometry.boundingBox!.clone().applyMatrix4(node.matrixWorld));
  });
  const height=bounds.max.y-bounds.min.y;
  assert.ok(height<1.335&&1.55+height+.2<TRUCK_REAR_APPROACH_CLEARANCE);
  assert.ok(TRUCK_REAR_APPROACH_CLEARANCE<=3.1);
  const bay=truckRearTrafficReservation(truck);assert.equal(bay.roof-bay.bottom,TRUCK_REAR_APPROACH_CLEARANCE);
  assert.equal(truck.roof,5.87,'real physical container keeps its actual roof');
});

test('independent full-production eleven-metre bus keeps its entire nose outside the reserved parked-car footprint',()=>{
  const f=fixture(),bay=truckRearTrafficReservation(truck),id=f.bus.g.uuid,bodyGeometry=(f.bus.g.children[0]as THREE.Mesh).geometry;
  assert.ok(f.bus.size[2]>=11,'uses the real production bus, not a short fixture');
  f.traffic.setKinematicVehicles([truck],1/60,[bay]);let maxStep=0;
  for(let n=0;n<900;n++){
    const before=f.bus.x;f.traffic.update(1/60,100,0,farPlayer);maxStep=Math.max(maxStep,f.bus.x-before);
    assert.ok(f.bus.x>=before-1e-9,'no backwards correction or teleport');
    assert.equal(f.bus.g.uuid,id);assert.equal(f.bus.g.parent,f.scene);
  }
  assert.ok(f.bus.x+f.bus.size[2]/2<bay.x-bay.halfLength-.25);
  assert.equal(trafficOverlap(f.bus,{...bay,y:bay.bottom,size:[bay.halfWidth*2,bay.roof-bay.bottom,bay.halfLength*2]},.25),false);
  assert.ok(maxStep<=10/60+1e-8);assert.equal((f.bus.g.children[0]as THREE.Mesh).geometry,bodyGeometry);
  const stopped=f.bus.x;f.traffic.setKinematicVehicles([],0,[]);
  for(let n=0;n<180;n++)f.traffic.update(1/60,100,0,farPlayer);
  assert.ok(f.bus.x>stopped+5,'clear/retry resumes the same bus');assert.equal(f.bus.g.uuid,id);f.traffic.clear();
});

test('independent raised-road and opposing-carriageway buses retain exact ordinary clocks and motion',()=>{
  // The virtual rear bay is not a six-metre-high container. A real separate
  // road above its ramp/parked-car clearance must not inherit its queue.
  for(const[y,dir,lane]of [[3.3,1,3],[4.5,1,3],[6.1,1,3],[0,-1,4]]as const){
    const ordinary=fixture(y,dir,lane),reserved=fixture(y,dir,lane);
    reserved.traffic.setKinematicVehicles([],1/60,[truckRearTrafficReservation(truck)]);
    for(let n=0;n<360;n++){ordinary.traffic.update(1/60,100,0,farPlayer);reserved.traffic.update(1/60,100,0,farPlayer);}
    assert.deepEqual(snapshot(reserved),snapshot(ordinary),`independent road y=${y},direction=${dir}`);
    assert.equal(reserved.traffic.t,ordinary.traffic.t);ordinary.traffic.clear();reserved.traffic.clear();
  }
});

test('reservation is never a player solid or hit-test/push-out surface, and teardown releases the planning record',()=>{
  const f=fixture();f.traffic.clear();const module=createDeliveryModule('matchAndLand');
  module.setup({scene:f.scene,destination:{x:140,y:0,z:-3},route:[{x:140,y:0,z:-3},{x:500,y:0,z:-3}],
    player:()=>({x:100,y:24,z:-3,yaw:0,speed:0,flying:true}),automaticStories:true,canInteract:()=>false,emit(){}},
    {scene:'truckInterior',speed:8});
  const reservation=module.trafficReservations![0],point={x:reservation.x,y:.55,z:reservation.z},before={...point};
  f.traffic.setKinematicVehicles(module.trafficBodies??[],1/60,module.trafficReservations??[]);
  assert.equal(module.supports.some(s=>s.id===reservation.id),false);
  assert.equal(f.traffic.hitTest(point.x,point.y,point.z,1.3),null);
  assert.equal(f.traffic.pushOut(point,1.05,2.4),null);assert.deepEqual(point,before);
  module.teardown();f.traffic.setKinematicVehicles([],0,[]);
  assert.equal((f.traffic as any).kinematicVehicles.length,0);
  assert.equal(f.scene.getObjectByName('delivery-truck-interior'),undefined);
});
