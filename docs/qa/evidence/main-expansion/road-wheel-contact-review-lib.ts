import * as THREE from 'three';
import { Batch } from '../../../../src/core/util';
import type { RoadEdge } from '../../../../src/world/types';
import type { RoadQuad } from '../../../../src/world/road-surface';
import { roadWheelContact } from '../../../../src/game/road-wheel-contact';
import { rotatedWheelContact } from '../../../../src/game/landmark-contact';
import { actualPlayer } from '../../../../tests/fixtures/actual-player';
import { packedDriveWorld } from '../../../../tests/fixtures/packed-drive-world';
import { EmittedPlayerGeometry, actualPlayerContactProbe } from '../../../../tests/fixtures/emitted-player-contact';

export { actualPlayer, packedDriveWorld };
const base=3;
function synthetic(rectangles:{x0:number;x1:number;z0:number;z1:number;offset?:number}[],grade=0,bank=0){
  const city:any={surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[],landmarkSurfaceGrid:new Map(),waterGrid:new Map()};
  const surfaces:any[]=[],batch=new Batch(),height=(x:number,z:number,offset=0)=>base+grade*z+bank*x+offset;
  for(const [index,r]of rectangles.entries()){
    const q:RoadQuad=[[r.x0,height(r.x0,r.z0,r.offset),r.z0],[r.x0,height(r.x0,r.z1,r.offset),r.z1],[r.x1,height(r.x1,r.z1,r.offset),r.z1],[r.x1,height(r.x1,r.z0,r.offset),r.z0]];
    const e:RoadEdge={id:`review-road-${index}`,seg:'review',name:null,cls:'primary',w:r.x1-r.x0,lanes:2,oneway:null,from:null,to:null,pts:[[(r.x0+r.x1)/2,r.z0],[(r.x0+r.x1)/2,r.z1]],elev:[height((r.x0+r.x1)/2,r.z0,r.offset),height((r.x0+r.x1)/2,r.z1,r.offset)],maxspeed:null};
    surfaces.push({e,i:0,ax:e.pts[0][0],az:r.z0,bx:e.pts[1][0],bz:r.z1,ya:e.elev![0],yb:e.elev![1],hw:(r.x1-r.x0)/2,kind:'road',roadQuad:q,paintLift:.07});
    batch.quad(...q.map(p=>[p[0],p[1]+.07,p[2]])as RoadQuad,'#fff');
  }
  for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)city.surfaceGrid.set(`${x},${z}`,surfaces);
  const oracle=new EmittedPlayerGeometry({minX:-20,maxX:20,minZ:-20,maxZ:20});
  oracle.collect({key:'synthetic',surfaceGrid:city.surfaceGrid,buffers:[{mat:'road',pos:new Float32Array(batch.pos)}]}as any);
  return{city,oracle,height};
}
const rectangle={x0:-20,x1:20,z0:-20,z1:20};
export function negativeChecks(){
  const qz=rotatedWheelContact(-.945,-.55,-1.4,0,.08,0).z,seam=qz-.0005;
  const cases=[
    {name:'ordinary-flat',fixture:synthetic([rectangle]),pitch:0,expected:true},
    {name:'ordinary-10percent-grade',fixture:synthetic([rectangle],.1),pitch:0,expected:true},
    {name:'missing-front-left-finite-road',fixture:synthetic([{...rectangle,x0:-.8},{...rectangle,x1:-.8,z0:-.5}]),pitch:0,expected:false},
    {name:'other-lower-road-layer',fixture:synthetic([{...rectangle,x1:.5},{...rectangle,x0:.5,offset:-1}]),pitch:0,expected:false},
    {name:'other-upper-road-layer',fixture:synthetic([{...rectangle,x1:.5},{...rectangle,x0:.5,offset:2}]),pitch:0,expected:false},
    {name:'real-20cm-step-exceeds-travel',fixture:synthetic([{...rectangle,x1:.5},{...rectangle,x0:.5,offset:.2}]),pitch:0,expected:false},
    {name:'14percent-grade-exceeds-travel-at-flat-pose',fixture:synthetic([rectangle],.14),pitch:0,expected:false},
    {name:'finite-seam-requery',fixture:synthetic([{...rectangle,z1:seam},{...rectangle,z0:seam}],-.065),pitch:.08,expected:true},
  ];
  return cases.map(c=>{
    const out=[0,0,0,0],grid=c.fixture.city.surfaceGrid,original=grid.get.bind(grid);let gets=0;
    grid.get=(key:string)=>{gets++;return original(key);};
    const accepted=roadWheelContact(c.fixture.city,0,base+.55,0,0,c.pitch,0,base,out);
    grid.get=original;
    return{name:c.name,accepted,expected:c.expected,pass:accepted===c.expected,travel:out,supportQueries:gets/9};
  });
}
export function rampPlacement(){
  const f=synthetic([rectangle],.065),a=actualPlayer(f.city),p=a.player,probe=actualPlayerContactProbe(p,f.oracle);
  try{
    p.place(0,0,0,base);const placed=probe.measure(0),placedPose=pose(p);
    p.update(1/60,{throttle:0,brake:0,steer:0,flyPressed:false,boost:false},1/60);const updated=probe.measure(1),updatedPose=pose(p);
    return{placed,placedPose,afterFirstUpdate:updated,updatedPose,contact:probe.result()};
  }finally{a.dispose();}
}
export function makeSynthetic(){return synthetic([rectangle],.065);}
export function pose(p:any){
  p.group.updateMatrixWorld(true);
  return{position:p.pos.toArray(),speed:p.speed,yaw:p.yaw,vy:p.vy,rootMatrix:p.group.matrixWorld.toArray(),onRoad:p.onRoad,lastSupport:p.lastSupport,
    flying:p.flying,descending:p.descending,jumping:p.jumping,glide:p.glide,placementRevision:p.placementRevision};
}
