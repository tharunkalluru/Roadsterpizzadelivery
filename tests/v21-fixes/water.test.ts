import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {waterGrid,waterHeightAt,WATER_LEVEL,WATER_DRAFT,buoyantHeight} from '../../src/world/water';
import {supportAt} from '../../src/game/physics';import {Player} from '../../src/game/player';
import type {Area} from '../../src/world/types';
import {World} from '../../src/world/world';
const lake:Area={kind:'water',sub:'lake',cls:'water',name:'Test lake',ring:[[-100,-100],[100,-100],[100,100],[-100,100]]};
const city=():any=>({group:new THREE.Group(),waterGrid:waterGrid([lake]),buildingGrid:new Map(),surfaceGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[]});
const idle={throttle:0,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false};
function player(c=city()):any{return Object.assign(Object.create(Player.prototype),{city:c,pos:new THREE.Vector3(0,.55,0),yaw:0,speed:0,vy:0,steerVis:0,flying:false,descending:false,onRoad:false,lastSupport:0,lastKind:'ground',lastElevRoad:false,hitCooldown:0,bump:0,flyAlt:24,altT:0,kerbT:0,glide:null,jumpActive:false,jumpHeld:false,jumpCooldown:0,jumpBodyTop:2.4,jumpStartY:0,jumpElapsed:0,jumpForcedFall:false,jumpCooldownPendingLanding:false,jumpCollisionMeshes:[],jumpBoundsDirty:true,jumpBounds:{bottom:0,top:0},placementRevision:0,group:new THREE.Group(),glow:new THREE.Group(),light:new THREE.Group(),wheels:[],wheelRollers:[],animateThrusters(){}});}
test('mapped water containment uses exact polygon boundaries and bounded tile cells',()=>{
 const grid=waterGrid([lake]);assert.equal(waterHeightAt(grid,0,0),WATER_LEVEL);assert.equal(waterHeightAt(grid,101,0),null);
 assert.equal(waterHeightAt(waterGrid([{...lake,kind:'landuse'}]),0,0),null);
 const large={...lake,ring:[[-4000,-4000],[4000,-4000],[4000,4000],[-4000,4000]] as [number,number][]};
 assert.ok(waterGrid([large],{i:0,j:0}).size<=121,'a huge lake does not index its entire city footprint in every tile');
});
test('water buoyancy yields to actual road decks and train roofs above the lake',()=>{
 const c=city();assert.equal(supportAt(c,0,0,0).kind,'water');assert.equal(supportAt(c,0,0,0).y,WATER_LEVEL-WATER_DRAFT);
 c.surfaceGrid.set('0,0',[{e:null,ax:-20,az:0,bx:20,bz:0,ya:7,yb:7,hw:5,kind:'deck'}]);
 assert.equal(supportAt(c,0,0,7).kind,'deck');assert.equal(supportAt(c,0,0,0).kind,'water','overhead bridge never pulls a floating car up');
 c.surfaceGrid.clear();c.movingRail=[{id:'coach',x:0,y:0,z:0,hx:1,hz:0,halfWidth:1.6,halfLength:11,roof:4.2,bottom:.2,previous:{x:0,y:0,z:0,hx:1,hz:0}}];
 assert.equal(supportAt(c,0,0,4.2).kind,'rail');assert.equal(supportAt(c,0,0,0).kind,'water','a floating car never snaps through the train');
 assert.equal(supportAt(c,0,0,0,true).kind,'ground','water is not a navigation road');
});
test('the production car settles to one-third submersion and stays usable with bounded wakes',()=>{
 for(const hz of [30,60,120]){
  const p=player();let t=0;
  for(let i=0;i<hz*3;i++){t+=1/hz;p.update(1/hz,idle,t);}
  assert.ok(Math.abs(p.pos.y-(WATER_LEVEL-WATER_DRAFT+.55))<1e-7);assert.equal(p.lastKind,'water');assert.equal(p.waterWake.children.length,2);
  const base=p.pos.y-.55,roof=base+1.28;assert.ok(Math.abs((WATER_LEVEL-base)/(roof-base)-1/3)<1e-6);
  for(let i=0;i<hz;i++){t+=1/hz;p.update(1/hz,{...idle,throttle:1,steer:.4},t);}
  assert.ok(p.speed>5&&p.pos.length()>2);assert.ok(Math.abs(p.yaw)>.1);assert.equal(p.waterWake.children.length,2);
 }
});
test('water entry is smooth; flight, jump and normal ground retain their support rules',()=>{
 assert.ok(buoyantHeight(.55,.14,1/60)>.45);const p=player();for(let i=0;i<120;i++)p.update(1/60,idle,i/60);
 p.update(1/60,{...idle,flyPressed:true},2);assert.equal(p.flying,true);assert.equal(p.waterWake.visible,false);
 const ground=city();ground.waterGrid.clear();const g=player(ground);g.update(1/60,idle,0);assert.equal(g.pos.y,.55);assert.equal(g.waterWake,undefined);
});
test('real World tile publication and unload preserve shared water coverage without stale cells',()=>{
 const material=new THREE.MeshBasicMaterial(),w:any=Object.assign(Object.create(World.prototype),city(),{
  tiles:new Map(),groundGeo:new THREE.PlaneGeometry(1000,1000),mats:{ground:material},byBuilding:new Map(),landmarkSurfaceGrid:new Map(),activity:new Map(),rails:new Map(),lamps:[],signals:[],busStops:[],walkPaths:[],signs:{add(){},remove(){}},onTileAdded(){},onTileRemoved(){},
 });w.waterGrid=new Map();
 const tile=(key:string)=>({key,i:0,j:0,buffers:[],roads:[],buildingGrid:new Map(),surfaceGrid:new Map(),walls:new Map(),obstacles:new Map(),waterGrid:waterGrid([lake]),signs:[],lamps:[],signals:[],busStops:[],walkPaths:[],rails:[],activity:[]});
 w.add(tile('a'));w.add(tile('b'));assert.equal(waterHeightAt(w.waterGrid,0,0),WATER_LEVEL);
 w.unload(w.tiles.get('a'));assert.equal(waterHeightAt(w.waterGrid,0,0),WATER_LEVEL,'unloading one owner retains another loaded tile');
 w.unload(w.tiles.get('b'));assert.equal(waterHeightAt(w.waterGrid,0,0),null);assert.equal(w.waterGrid.size,0);w.groundGeo.dispose();material.dispose();
});
