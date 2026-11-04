import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../../src/game/player';
import { supportAt } from '../../src/game/physics';
import { drawExtras, type OsmFeature } from '../../src/world/extras';
import { makeRailwayNetwork, railwayNetwork } from '../../src/world/railway-geometry';
import { UnderpassTerrainIndex } from '../../src/world/underpass-terrain';
import type { RoadEdge } from '../../src/world/types';
import type { Surface, Wall } from '../../src/world/city';

const idle={throttle:0,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false};
function player(city:any,x:number,z:number,dir:number):any {
 return Object.assign(Object.create(Player.prototype),{city,pos:new THREE.Vector3(x,.55,z),yaw:-dir*Math.PI/2,speed:0,vy:0,steerVis:0,flying:false,descending:false,onRoad:false,lastSupport:0,lastKind:'ground',lastElevRoad:false,hitCooldown:0,bump:0,flyAlt:24,altT:0,kerbT:0,glide:null,jumpActive:false,jumpHeld:false,jumpCooldown:0,jumpBodyTop:2.4,jumpStartY:0,jumpElapsed:0,jumpForcedFall:false,jumpCooldownPendingLanding:false,jumpCollisionMeshes:[],jumpBoundsDirty:true,jumpBounds:{bottom:0,top:0},placementRevision:0,group:new THREE.Group(),glow:new THREE.Group(),light:new THREE.Group(),wheels:[],wheelRollers:[],animateThrusters(){}});
}
function insert(grid:Map<string,any[]>,record:any,ax:number,az:number,bx:number,bz:number,pad=0,cell=30) {
 for(let x=Math.floor((Math.min(ax,bx)-pad)/cell);x<=Math.floor((Math.max(ax,bx)+pad)/cell);x++)for(let z=Math.floor((Math.min(az,bz)-pad)/cell);z<=Math.floor((Math.max(az,bz)+pad)/cell);z++){
  const key=`${x},${z}`,values=grid.get(key)||[];values.push(record);grid.set(key,values);
 }
}
function fixture(center:number,lowQ:boolean,bridge=true) {
 const road:RoadEdge={id:'verified-underpass',seg:'under',name:'Verified underpass',cls:'secondary',w:12,lanes:2,oneway:null,from:'a',to:'b',pts:[[center,100],[center,900]],elev:[-6.5,-6.5],maxspeed:40};
 const features:OsmFeature[]=[{id:'approach-west',k:'rail',t:{railway:'rail'},l:[[center-100,500],[center-20,500]]},
  {id:'span',k:'rail',t:{railway:'rail',...(bridge?{bridge:'yes'}:{})},l:[[center-20,500],[center,500],[center+20,500]]},
  {id:'approach-east',k:'rail',t:{railway:'rail'},l:[[center+20,500],[center+100,500]]}];
 const railway=makeRailwayNetwork(features),city:any={group:new THREE.Group(),surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[]},boxes:any[]=[];
 const addSurface=(s:Surface)=>insert(city.surfaceGrid,s,s.ax,s.az,s.bx,s.bz,s.hw),addWall=(w:Wall)=>insert(city.walls,w,w.ax,w.az,w.bx,w.bz);
 const s:Surface={e:road,i:0,ax:center,az:100,bx:center,bz:900,ya:-6.5,yb:-6.5,hw:6,kind:'road'};addSurface(s);
 const index=new UnderpassTerrainIndex([road]);
 for(const i of new Set([Math.floor((center-50)/1000),Math.floor((center+50)/1000)])){
  const terrain=index.build(i,0)!;terrain.walls.forEach(addWall);terrain.surfaces.forEach(addSurface);terrain.ground.dispose();terrain.wall.dispose();
  drawExtras(features,{B:{st:{box:(...a:any[])=>boxes.push(a)},foot:{box:(...a:any[])=>boxes.push(a)}},inTile:(x:number,z:number)=>Math.floor(x/1000)===i&&z>=0&&z<1000,railway,nearestRoad:()=>null,onRoad:()=>false,inBuilding:()=>false,structureClear:()=>true,
   sign:()=>{},obstacle:()=>{},wall:()=>{},solid:()=>{},lamp:()=>{},pad:(ax:number,az:number,bx:number,bz:number,y:number,hw:number)=>addSurface({e:null,i:0,ax,az,bx,bz,ya:y,yb:y,hw,kind:'pad'}),lowQ} as any);
 }
 return {city,boxes};
}

test('actual Player drives both directions across railway underpass edges at30/60Hz in both qualities and across a tile seam',()=>{
 for(const lowQ of [true,false])for(const hz of [30,60])for(const dir of [-1,1])for(const center of [500,1000]){
  const {city}=fixture(center,lowQ),p=player(city,center-dir*60,500,dir);let frames=0,minFeet=Infinity,maxFeet=-Infinity;
  while(dir*(p.pos.x-center)<50&&frames<hz*20){p.update(1/hz,{...idle,throttle:1},frames/hz);if(Math.abs(p.pos.x-center)<15){minFeet=Math.min(minFeet,p.pos.y-.55);maxFeet=Math.max(maxFeet,p.pos.y-.55);}frames++;}
  assert.ok(dir*(p.pos.x-center)>=50,`rail span blocked: lowQ=${lowQ},hz=${hz},dir=${dir},center=${center},x=${p.pos.x}`);
  assert.ok(minFeet>.14&&maxFeet<.23,'tyres follow the visible trackbed rather than falling into the road cut');
  assert.equal(p.flying,false);assert.equal(p.descending,false);assert.equal(p.jumping,false);
  const below=supportAt(city,center,500,-6.5);assert.equal(below.y,-6.5,'railway deck must not pull an underpass car upward');
 }
});

test('ordinary source track over a verified road cut also retains the rendered ballast support',()=>{
 for(const dir of [-1,1]){
  const {city}=fixture(500,true,false),p=player(city,500-dir*60,500,dir);let frames=0;
  while(dir*(p.pos.x-500)<50&&frames<1200){p.update(1/60,{...idle,throttle:1},frames/60);frames++;}
  assert.ok(dir*(p.pos.x-500)>=50,'a missing source bridge tag must not make an existing trackbed impassable');
  assert.ok(Math.abs(p.pos.y-.73)<.01);
 }
});

test('every shipped source railway bridge boundary has the same physical trackbed contact as its visible approaches',t=>{
 const railway=railwayNetwork(),city:any={surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[]};
 drawExtras(railway.profiles.map(r=>r.source),{B:{st:{box:()=>{}},foot:{box:()=>{}}},inTile:()=>true,railway,nearestRoad:()=>null,onRoad:()=>false,inBuilding:()=>false,structureClear:()=>true,
  sign:()=>{},obstacle:()=>{},wall:()=>{},solid:()=>{},lamp:()=>{},pad:(ax:number,az:number,bx:number,bz:number,y:number,hw:number)=>{const s={e:null,i:0,ax,az,bx,bz,ya:y,yb:y,hw,kind:'pad'};insert(city.surfaceGrid,s,ax,az,bx,bz,hw);},lowQ:true} as any);
 let bridges=0,points=0;
 for(const r of railway.profiles.filter(r=>r.bridge)){
  bridges++;
  for(const i of [0,r.pts.length-1]){
   const p=r.pts[i],support=supportAt(city,p[0],p[1],r.elev[i]+.18);
   assert.ok(Math.abs(support.y-r.elev[i]-.18)<1e-8,`${r.id} endpoint ${i} lost trackbed support`);points++;
  }
 }
 assert.ok(bridges>100&&points===bridges*2,'exercise both ends of the complete retained bridge set');
 t.diagnostic(JSON.stringify({sourceBridges:bridges,bridgeEndpoints:points}));
});
