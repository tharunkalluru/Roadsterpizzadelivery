import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UnderpassTerrainIndex, underpassAreaClipper, buildUnderpassTile } from '../../src/world/underpass-terrain';
import { supportAt, collideBuildings, collideWalls } from '../../src/game/physics';
import { staticSolidAt } from '../../src/game/spatial-safety';
import { Player } from '../../src/game/player';
import { World } from '../../src/world/world';
import type { RoadEdge } from '../../src/world/types';
import { currentRoadGradePatches, applyRoadGradePatches } from '../../src/world/road-grades';

const road=(id='underpass',x=100):RoadEdge=>({id,seg:id,name:'Verified underpass',cls:'secondary',w:12,lanes:2,oneway:null,from:'a',to:'b',pts:[[x,0],[x,100],[x,200],[x,300]],elev:[0,-6.5,-6.5,0],maxspeed:40});
function hits(g:THREE.BufferGeometry,x:number,z:number){const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld(true);const hit=new THREE.Raycaster(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length;mesh.material.dispose();return hit;}
function city(e=road()):any {
 const c:any={group:new THREE.Group(),surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[]};
 for(let i=1;i<e.pts.length;i++){const s={e,i:i-1,ax:e.pts[i-1][0],az:e.pts[i-1][1],bx:e.pts[i][0],bz:e.pts[i][1],ya:e.elev![i-1],yb:e.elev![i],hw:6,kind:'road'};for(let x=2;x<=4;x++)for(let z=-1;z<=11;z++){const k=`${x},${z}`,a=c.surfaceGrid.get(k)||[];a.push(s);c.surfaceGrid.set(k,a);}}
 return c;
}
const idle={throttle:0,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false};
function player(c:any):any{return Object.assign(Object.create(Player.prototype),{city:c,pos:new THREE.Vector3(100,.55,0),yaw:Math.PI,speed:0,vy:0,steerVis:0,flying:false,descending:false,onRoad:true,lastSupport:0,lastKind:'road',lastElevRoad:false,hitCooldown:0,bump:0,flyAlt:24,altT:0,kerbT:0,glide:null,jumpActive:false,jumpHeld:false,jumpCooldown:0,jumpBodyTop:2.4,jumpStartY:0,jumpElapsed:0,jumpForcedFall:false,jumpCooldownPendingLanding:false,jumpCollisionMeshes:[],jumpBoundsDirty:true,jumpBounds:{bottom:0,top:0},placementRevision:0,group:new THREE.Group(),glow:new THREE.Group(),light:new THREE.Group(),wheels:[],wheelRollers:[],animateThrusters(){}});}

test('underpass terrain cuts the actual road corridor and retains ordinary ground outside it',()=>{
 const empty=new UnderpassTerrainIndex([{...road(),elev:null}]);assert.equal(empty.build(0,0),null);
 const terrain=new UnderpassTerrainIndex([road()]).build(0,0)!;
 assert.equal(hits(terrain.ground,100,150),0,'flat earth must not fill the trough');
 assert.ok(hits(terrain.ground,115,150));assert.ok(hits(terrain.ground,500,500));
 assert.ok(terrain.walls.length>0);assert.ok(terrain.walls.every(w=>Math.abs(w.ax-100)>8&&Math.abs(w.bx-100)>8),'retaining walls stay outside both traffic lanes');
 assert.ok(Array.from(terrain.ground.attributes.position.array).every(Number.isFinite));terrain.ground.dispose();terrain.wall.dispose();
});
test('overlapping carriageways and tile boundaries share a real open cut without an internal wall',()=>{
 const a=road('a',995),b=road('b',1005),index=new UnderpassTerrainIndex([a,b]);
 const left=index.build(0,0)!,right=index.build(1,0)!;
 assert.equal(hits(left.ground,995,150),0);assert.equal(hits(right.ground,1005,150),0);
 for(const terrain of [left,right]){assert.ok(terrain.walls.every(w=>Math.abs((w.ax+w.bx)/2-1000)>10),'no retaining wall through the combined road');terrain.ground.dispose();terrain.wall.dispose();}
 assert.equal(index.build(-4,-4),null);
});
test('long source cuts keep retaining walls and pavement local in every intersected tile',()=>{
 const e={...road(),pts:[[100,-1000],[100,3000]] as [number,number][],elev:[-6,-6]},index=new UnderpassTerrainIndex([e]);
 for(const j of [0,1,2]){const t=index.build(0,j)!;assert.equal(t.walls.length,2);assert.ok(t.walls.every(w=>Math.min(w.az,w.bz)>=j*1000&&Math.max(w.az,w.bz)<=(j+1)*1000));assert.ok(t.surfaces.every(s=>Math.abs(s.bz-s.az)<=1003.6+.001));t.ground.dispose();t.wall.dispose();}
});
test('area-fill triangles are clipped by the same union as the flat-earth surface',()=>{
 const clip=underpassAreaClipper([road()]),polys=clip([[50,50],[150,50],[100,250]]),positions:number[]=[];
 for(const p of polys)for(let i=1;i<p.length-1;i++)for(const v of [p[0],p[i],p[i+1]])positions.push(v[0],.03,v[1]);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));assert.equal(hits(g,100,150),0);assert.ok(hits(g,70,75));g.dispose();
});
test('production support and Player drive down and out of a negative road at 30 and 60 Hz',()=>{
 for(const hz of [30,60]) {
  const c=city(),p=player(c);assert.equal(supportAt(c,100,150,-6.5).y,-6.5);
  let min=0,frames=0;
  while(p.pos.z<299&&frames<hz*30){p.update(1/hz,{...idle,throttle:1},frames/hz);min=Math.min(min,p.pos.y);const y=p.pos.z<100?-p.pos.z*.065:p.pos.z<=200?-6.5:-6.5+(p.pos.z-200)*.065;assert.ok(Math.abs(p.pos.y-y-.55)<.08);frames++;}
  assert.ok(p.pos.z>=299);assert.ok(min< -5.8);assert.equal(p.flying,false);assert.equal(p.lastKind,'road');assert.ok(p.pos.y>.35,'the car returns smoothly to local ground');
 }
});
test('ground buildings and poles have no phantom basement but underpass fixtures and walls remain solid',()=>{
 const c=city(),b={id:'above',h:15,ring:[[98,140],[102,140],[102,160],[98,160]]};c.buildingGrid.set('2,3',[b]);c.obstacles.set('2,3',[{x:100,z:150,r:1,top:8}]);
 const p={x:100,y:-5.95,z:150};assert.equal(collideBuildings(c,p,1,-6.35),0);assert.equal(staticSolidAt(c,p,.35,.35),false);
 assert.ok(collideBuildings(c,{x:100,z:150},1,-1.5,.5)>0,'a kickflip that actually reaches the foundation still collides');
 c.obstacles.set('2,3',[{x:100,z:150,r:1,top:1,bottom:-6.5}]);assert.equal(staticSolidAt(c,p,.35,.35),true);assert.ok(collideBuildings(c,{...p},1,-6.35)>0);
 const terrain=new UnderpassTerrainIndex([road()]).build(0,0)!;c.walls.set('3,5',terrain.walls);
 assert.ok(collideWalls(c,{x:100,z:150},{x:110,z:150},1,-6.5,-5).hit>0);terrain.ground.dispose();terrain.wall.dispose();
});
test('World publishes and unloads cut terrain and physical retaining walls with their tile',()=>{
 const material=new THREE.MeshBasicMaterial(),w:any=Object.assign(Object.create(World.prototype),city(),{tiles:new Map(),groundGeo:new THREE.PlaneGeometry(1000,1000),mats:{ground:material,st:material},byBuilding:new Map(),landmarkSurfaceGrid:new Map(),waterGrid:new Map(),activity:new Map(),rails:new Map(),lamps:[],signals:[],busStops:[],walkPaths:[],signs:{add(){},remove(){}},onTileAdded(){},onTileRemoved(){}});
 const prepared=buildUnderpassTile([road()],0,0)!;
 assert.deepEqual(prepared.buffers.map(b=>b.mat),['ground','st'],'retaining concrete must never use the building-window atlas');
 const b:any={key:'0_0',i:0,j:0,buffers:prepared.buffers,underpassGround:true,roads:[],buildingGrid:new Map(),surfaceGrid:new Map(),walls:new Map(),obstacles:new Map(),signs:[],lamps:[],signals:[],busStops:[],walkPaths:[],rails:[],activity:[]};
 for(const wall of prepared.walls)for(let x=2;x<=4;x++)for(let z=0;z<=10;z++){const k=`${x},${z}`,a=b.walls.get(k)||[];a.push(wall);b.walls.set(k,a);}
 for(const s of prepared.surfaces)for(let x=2;x<=4;x++)for(let z=0;z<=10;z++){const k=`${x},${z}`,a=b.surfaceGrid.get(k)||[];a.push(s);b.surfaceGrid.set(k,a);}
 w.add(b);const t=w.tiles.get('0_0'),ground=t.group.children[0];assert.notEqual(ground.geometry,w.groundGeo);assert.equal(hits(ground.geometry,100,150),0);assert.ok(w.walls.size>0);
 assert.ok(supportAt(w,108,150,-6.5).y<-6,'the depressed pavement has support rather than snapping the car back to0');
 let disposed=false;ground.geometry.addEventListener('dispose',()=>disposed=true);w.unload(t);assert.ok(disposed);assert.equal(w.walls.size,0);w.groundGeo.dispose();material.dispose();
});
test('a second World sends already-repaired negative and zero profiles to its worker',()=>{
 const e=road(),flat={...road('normalized'),elev:[0,0,0,0]},stale=[{...e,elev:null},{...flat,elev:[1.4,1.4,1.4,1.4]}];
 const original=globalThis.Worker;let sent:any;
 class FakeWorker {onmessage:any;onerror:any;onmessageerror:any;postMessage(value:any){sent=value;}terminate(){}}
 Object.assign(globalThis,{Worker:FakeWorker});
 try {
  for(let pass=0;pass<2;pass++) {
   const w:any=Object.assign(Object.create(World.prototype),{opts:{lowQ:true},core:{origin:{lat:17.4063,lon:78.4966},packs:[],metro:{lines:[],stations:[],pillars:[],deckHeight:12}},preparedGrades:currentRoadGradePatches([e,flat]),railwayPatches:[]});
   w.makeWorker();assert.equal(sent.type,'init');const rebuilt=applyRoadGradePatches(stale,sent.roadGrades);
   assert.deepEqual(rebuilt.map(e=>e.elev),[e.elev,flat.elev]);assert.deepEqual(rebuilt[0].pts,e.pts);
  }
  assert.equal(stale[0].elev,null);assert.equal(stale[1].elev![0],1.4);
 }finally{Object.assign(globalThis,{Worker:original});}
});
