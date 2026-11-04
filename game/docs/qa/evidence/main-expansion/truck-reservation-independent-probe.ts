import * as THREE from 'three';
import {writeFileSync} from 'node:fs';
import {Traffic} from '../../../../src/game/traffic';
import {RoadGraph} from '../../../../src/game/roadgraph';
import {initTemplates} from '../../../../src/core/util';
import {truckRearTrafficReservation} from '../../../../src/delivery/modules/truck-interior';
import {createDeliveryModule,type DeliveryPlayer} from '../../../../src/delivery/modules';
import {trafficOverlap} from '../../../../src/game/traffic-path';

const gradient={addColorStop(){}};
const context=new Proxy({measureText:(s:string)=>({width:s.length*12}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},
  {get:(o:any,k)=>k in o?o[k]:()=>{}});
(globalThis as any).document={createElement:()=>({width:256,height:128,getContext:()=>context})};
initTemplates({rbox:new THREE.BoxGeometry(1,1,1)});
const material=new THREE.MeshBasicMaterial(),far={x:10000,y:.55,z:10000,speed:0,hx:1,hz:0};
function fixture(y=0,dir:1|-1=1,lane=3){
  const road:any={id:'independent-arterial',from:'a',to:'b',cls:'primary',w:16,lanes:4,oneway:null,
    pts:[[0,0],[500,0]],elev:[y,y]};
  const graph=new RoadGraph([road]),scene=new THREE.Scene();
  const traffic=new Traffic(graph,scene,{vBody:material,vLight:material},0);
  const car=traffic.spawnAt('bus',graph.edges[0],dir,dir===1?80:400,lane);
  car.speed=10;car.want=10;car.uturnAt=Infinity;car.laneChangeAt=Infinity;
  return{traffic,car,scene};
}
const truck={id:'delivery-log-truck',x:140,y:0,z:-3,hx:1,hz:0,halfWidth:3.12,halfLength:10,bottom:.2,roof:5.87,
  previous:{x:140,y:0,z:-3,hx:1,hz:0}};
const bay=truckRearTrafficReservation(truck);
const output:any={capturedAt:new Date().toISOString(),source:'actual Traffic constructor/prototypes; no mocked movement or spawner',
  ordinary:[],vertical:[],finiteRoute:[]};
for(const[y,dir,lane]of [[0,1,3],[3.3,1,3],[4.5,1,3],[6.1,1,3],[0,-1,4]]as const){
  const a=fixture(y,dir,lane),b=fixture(y,dir,lane);b.traffic.setKinematicVehicles([],1/60,[bay]);
  const prior=[a.car.g.uuid,b.car.g.uuid];let maxStep=0,discontinuities=0;
  for(let n=0;n<360;n++){
    const before={x:b.car.x,z:b.car.z};a.traffic.update(1/60,100,0,far);b.traffic.update(1/60,100,0,far);
    const step=Math.hypot(b.car.x-before.x,b.car.z-before.z);maxStep=Math.max(maxStep,step);if(step>.25)discontinuities++;
  }
  const item={y,dir,lane,baseline:[a.car.x,a.car.y,a.car.z,a.car.speed],reserved:[b.car.x,b.car.y,b.car.z,b.car.speed],
    identical:[a.car.x,a.car.y,a.car.z,a.car.speed].every((v,i)=>Object.is(v,[b.car.x,b.car.y,b.car.z,b.car.speed][i])),
    maxStep,discontinuities,retained:prior[1]===b.car.g.uuid&&b.traffic.cars.includes(b.car)};
  (y?output.vertical:output.ordinary).push(item);
  a.traffic.clear();b.traffic.clear();
}
for(const length of [8,30]){
  const f=fixture(),car=f.car,at=f.traffic.graph.pointAt(car.edge,103,1,3);Object.assign(car,at,{s:103,speed:0});
  const player:DeliveryPlayer={x:102,y:.55,z:5,yaw:-Math.PI/2,speed:0,flying:false,verticalSpeed:0};
  const module=createDeliveryModule('matchAndLand');
  module.setup({scene:f.scene,destination:{x:120,y:0,z:-3},route:[{x:120,y:0,z:-3},{x:120+length,y:0,z:-3}],player:()=>player,
    automaticStories:true,canInteract:()=>false,storyActive:()=>false,
    vehicleSpeedLimit:body=>f.traffic.kinematicSpeedLimit(body,6),vehiclePoseClear:body=>f.traffic.kinematicPoseClear(body),emit(){}},
  {scene:'truckInterior',vehicle:'truck',speed:6});
  let maxNPCStep=0,realBodyCollision=false;
  for(let n=0;n<1200;n++){
    const prior=car.x;module.update(1/60);f.traffic.setKinematicVehicles(module.trafficBodies??[],1/60,module.trafficReservations??[]);
    f.traffic.update(1/60,100,0,far);maxNPCStep=Math.max(maxNPCStep,car.x-prior);
    const body=module.trafficBodies![0];realBodyCollision ||= trafficOverlap(car,{...body,y:body.bottom,size:[body.halfWidth*2,body.roof-body.bottom,body.halfLength*2]},0);
  }
  const reservation=module.trafficReservations![0],body=module.trafficBodies![0];
  output.finiteRoute.push({length,truckX:body.x,truckSpeed:Math.abs(body.x-body.previous.x)*60,npcX:car.x,npcSpeed:car.speed,
    bayOccupied:trafficOverlap(car,{...reservation,y:reservation.bottom,size:[reservation.halfWidth*2,reservation.roof-reservation.bottom,reservation.halfLength*2]},.25),
    maxNPCStep,realBodyCollision,playerSolidsContainReservation:module.supports.some(s=>s.id===reservation.id)});
  module.teardown();f.traffic.clear();
}
writeFileSync(process.argv[2]??'/tmp/truck-reservation-independent-probe.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
