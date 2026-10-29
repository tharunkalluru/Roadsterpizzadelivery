import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { railwayRoadClearance, roadHeightAt } from '../../src/world/railway-road-clearance';
import { makeRailwayNetwork, prepareRailwayTransport } from '../../src/world/railway-geometry';
import { buildRailwayCrossingSites } from '../../src/game/railway-crossings';
import { prepareRoadGrades } from '../../src/world/road-grades';
import { prepareRoadUnderpasses } from '../../src/world/road-underpasses';
import { RAILWAY_UNDERPASS_EVIDENCE } from '../../src/world/railway-evidence';
import { buildTile } from '../../src/world/city';
import { World } from '../../src/world/world';
import { supportAt, collideWalls } from '../../src/game/physics';
import { initTemplates } from '../../src/core/util';
import type { RoadEdge } from '../../src/world/types';
import type { OsmFeature } from '../../src/world/extras';
const road = (pts: [number,number][], extra: Partial<RoadEdge> = {}):RoadEdge => ({ id:'crossing-road',seg:'same-street',name:'Street',cls:'primary',w:12,lanes:4,oneway:null,from:null,to:null,pts,elev:null,maxspeed:40,...extra });
const railway = (x=500, y=0) => { const network=makeRailwayNetwork([-2.6,2.6].map((d,i)=>({id:'track-'+i,k:'rail',l:[[x+d,100],[x+d,900]],t:{railway:'rail'}} as OsmFeature))); if(y)for(const p of network.profiles)p.elev.fill(y);return network; };

test('both track strands open the full median, curb and sidewalk width while adjacent street furniture stays intact',()=>{
  const e=road([[100,500],[900,500]]), n=railway(), clear=railwayRoadClearance([e],n.profiles);
  assert.equal(clear.gaps.length,1);
  for(const x of [493.8,497.4,500,502.6,506.2])for(const z of [493,500,507])assert.equal(clear.blocked(x,z,e),true,`protected crossing ${x},${z}`);
  assert.equal(clear.blocked(470,500,e),false);assert.equal(clear.blocked(530,500,e),false);
  assert.equal(clear.spanBlocked(490,500,510,500,e,.5),true,'finite barrier cannot bridge the empty opening');
  const pieces=[road([[490,500],[500,500]],{id:'a'}),road([[500,500],[510,500]],{id:'b'})];
  const fromPieces=railwayRoadClearance(pieces,n.profiles);
  for(const x of [493.8,500,506.2])assert.equal(fromPieces.blocked(x,500,pieces[0]),true,'source edge split must not leave a central island');
});

test('oblique crossings clear outer curbs, but parallel roads and vertically separate decks/underpasses keep their medians',()=>{
  const n=railway(), e=road([[200,200],[800,800]],{w:20}), c=railwayRoadClearance([e],n.profiles);
  const normal=[-Math.SQRT1_2,Math.SQRT1_2];
  for(const lateral of [-12,0,12]){const z=500+normal[1]*lateral;assert.equal(c.blocked(500,z,e,.4),true);}
  assert.equal(c.blocked(200,200,e),false);
  const parallel=road([[480,100],[480,900]]);assert.equal(railwayRoadClearance([parallel],n.profiles).gaps.length,0);
  for(const y of [-6,8]){const separate=road([[100,500],[900,500]],{elev:[y,y]});assert.equal(railwayRoadClearance([separate],n.profiles).gaps.length,0);}
  assert.equal(railwayRoadClearance([road([[100,500],[900,500]])],railway(500,8).profiles).gaps.length,0);
});

function tile(e:RoadEdge,lowQ=false,network=railway()){
  return buildTile({i:0,j:0,roads:[e],nodes:{},buildings:[],boards:[],furniture:[],areas:[],osm:[]},{lowQ,railway:network});
}

test('production tile geometry and collision walls share an unobstructed railway gap in both quality modes',()=>{
  initTemplates();const e=road([[100,500],[900,500]]);
  for(const lowQ of [false,true]){
    const built=tile(e,lowQ), walls=[...new Set([...built.walls.values()].flat())].filter(w=>w.kind==='median'||w.kind==='kerb');
    assert.ok(walls.some(w=>Math.max(w.ax,w.bx)<470),'ordinary exterior divider retained');
    for(const w of walls)for(let u=0;u<=1;u+=.1){const x=w.ax+(w.bx-w.ax)*u,z=w.az+(w.bz-w.az)*u;
      assert.ok(!(x>=493.7&&x<=506.3&&Math.abs(z-500)<10),'no invisible collider may cross either track');
    }
    const kerbs=built.buffers.filter(b=>b.mat==='kerb');assert.ok(kerbs.length);
    for(const b of kerbs)for(let i=0;i<b.pos.length;i+=3){const x=b.pos[i],z=b.pos[i+2];assert.ok(!(x>=493.7&&x<=506.3&&Math.abs(z-500)<10),'painted geometry must have the same gap');}
    for(const lamp of built.lampFixtures||[])assert.ok(!(lamp.pole[0]>=493.7&&lamp.pole[0]<=506.3&&Math.abs(lamp.pole[2]-500)<12),'no lamp pole inside the crossing');
  }
});

test('a long source-owned road keeps rail openings beyond the tile local railway preview extent',()=>{
  initTemplates();const e=road([[100,500],[1900,500]]),n=railway(1450),built=tile(e,true,n);
  const walls=[...new Set([...built.walls.values()].flat())].filter(w=>w.kind==='median');
  assert.ok(walls.some(w=>Math.min(w.ax,w.bx)>1500),'the long source-owned divider is actually drawn outside its owner tile');
  assert.ok(walls.every(w=>Math.max(w.ax,w.bx)<1443.7||Math.min(w.ax,w.bx)>1456.3),'far crossing keeps its opening even when its rails render in another tile');
});

test('depressed approach curbs, sidewalks, collider tops and lamp bases follow signed road heights',()=>{
  initTemplates(); const e=road([[100,500],[400,500],[600,500],[900,500]],{elev:[0,-5,-5,0]});const built=tile(e);
  const kerbs=built.buffers.filter(b=>b.mat==='kerb'),inside:number[]=[];
  for(const b of kerbs)for(let i=0;i<b.pos.length;i+=3)if(b.pos[i]>430&&b.pos[i]<570)inside.push(b.pos[i+1]);
  assert.ok(inside.length);assert.ok(Math.max(...inside)<-4.5,'curbs do not float at street datum over the underpass');
  const walls=[...new Set([...built.walls.values()].flat())].filter(w=>Math.min(w.ax,w.bx)>430&&Math.max(w.ax,w.bx)<570);
  assert.ok(walls.length);assert.ok(walls.every(w=>Math.max(w.y1a,w.y1b)<=-4),'collision tops follow the same negative grade');
  const foot=built.buffers.filter(b=>b.mat==='foot');assert.ok(foot.some(b=>Array.from(b.pos).some((y,i)=>i%3===1&&y< -4.5)));
  const lamps=(built.lampFixtures||[]).filter(l=>l.pole[0]>250&&l.pole[0]<750);assert.ok(lamps.length);for(const lamp of lamps)assert.ok(Math.abs(lamp.pole[1]-roadHeightAt(e,lamp.pole[0],lamp.pole[2]))<1e-5);
});

test('all shipped genuine core crossings remove the divider at every mapped strand without shifting any source road',()=>{
  const core=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()), transport=prepareRailwayTransport(prepareRoadUnderpasses(prepareRoadGrades(core.roads)).roads,{underpasses:RAILWAY_UNDERPASS_EVIDENCE}), roads:RoadEdge[]=transport.roads;
  const snapshot=JSON.stringify(roads);
  const sites=buildRailwayCrossingSites(roads,transport.railway.profiles), gap=railwayRoadClearance(roads,transport.railway.profiles);assert.ok(sites.length>10);
  const byId=new Map(roads.map(e=>[e.id,e]));let checked=0;
  for(const site of sites){const e=byId.get(site.roadId)!;assert.ok(gap.blocked(site.x,site.z,e,0));checked++;}
  assert.equal(checked,sites.length);assert.equal(JSON.stringify(roads),snapshot);
});

test('production park and water overlays retain real holes over a depressed road instead of hiding the asphalt',()=>{
  initTemplates(); const e=road([[100,500],[900,500]],{elev:[-5,-5]});
  for(const kind of ['park','water'] as const){
    const area:any={id:'cover',kind:kind==='water'?'water':'landuse',sub:kind,cls:kind,name:null,ring:[[350,450],[650,450],[650,550],[350,550]]};
    const built=buildTile({i:0,j:0,roads:[e],nodes:{},buildings:[],boards:[],furniture:[],areas:[area],osm:[]},{lowQ:true,railway:railway()});
    const buffers=built.buffers.filter(b=>b.mat===kind);assert.ok(buffers.length);assert.ok(buffers.every(b=>Array.from(b.nor).every((v,i)=>i%3!==1||v>.99)),'clipping preserves upward-facing ground triangles');
    const hits=(x:number,z:number)=>buffers.reduce((n,b)=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(b.pos,3));const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld();const count=new THREE.Raycaster(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length;geometry.dispose();material.dispose();return n+count;},0);
    assert.equal(hits(500,500),0,`${kind} must not fill the road trench`);assert.ok(hits(500,530),`${kind} remains visible beside the road`);
  }
});

test('negative junction direction signs and signal poles start at their actual depressed pavement',()=>{
  initTemplates();const e=road([[100,500],[900,500]],{id:'main',name:'Main Road',from:'a',to:'b',elev:[-5,-5]}),others=[
    road([[900,500],[900,800]],{id:'side',name:'Side Road',from:'b',to:'c',elev:[-5,-5]}),
    road([[900,500],[1100,500]],{id:'cross',name:'Cross Road',from:'b',to:'d',elev:[-5,-5]})];
  const signalRoad=road([[100,300],[800,300]],{id:'signal-road',name:'Signal Road',elev:[-1,-1],from:null,to:null});
  const built=buildTile({i:0,j:0,roads:[e,...others,signalRoad],nodes:{},buildings:[],boards:[],furniture:[{id:'osm:signal',kind:'traffic_signals',p:[400,300]} as any],areas:[],osm:[]},{lowQ:true,railway:railway()});
  const signs=built.signs.filter(s=>s.id.startsWith('dir_main_'));assert.ok(signs.length);assert.ok(signs.every(s=>s.c[1]<2&&s.c[1]>-2));
  const obstacles=[...new Set([...built.obstacles.values()].flat())],posts=obstacles.filter(p=>Math.abs(p.x-868)<.1);
  assert.ok(posts.length);assert.ok(posts.every(p=>p.bottom===-5),'direction-board bottoms cannot stay at the street above');
  assert.ok(built.signals.length&&built.signals.every(s=>s.approaches.every(a=>a.pole[1]===-1)));
  for(const site of built.signals)for(const a of site.approaches){const mast=obstacles.find(p=>Math.hypot(p.x-a.pole[0],p.z-a.pole[2])<.1);assert.ok(mast);assert.equal(mast.bottom,-1);}
});


test('a shelter on depressed pavement keeps its roof, passengers, support and post bottoms with that road',()=>{
  initTemplates();const e=road([[100,500],[900,500]],{elev:[-5,-5]});
  const built=buildTile({i:0,j:0,roads:[e],nodes:{},buildings:[],boards:[],furniture:[{kind:'bus_stop',p:[300,500]} as any],areas:[],osm:[{id:'mapped-stop',k:'bus_stop',p:[300,500],t:{name:'Underpass Stop'}}]},{lowQ:true,railway:railway()});
  assert.equal(built.busStops.length,1);
  const pads=[...new Set([...built.surfaceGrid.values()].flat())].filter(s=>s.kind==='pad');assert.ok(pads.some(s=>Math.abs(s.ya+2.29)<1e-8&&s.ya===s.yb),'roof support descends with the shelter');
  const posts=[...new Set([...built.obstacles.values()].flat())].filter(p=>p.x>295&&p.x<305&&p.z<500);assert.equal(posts.length,4);assert.ok(posts.every(p=>p.bottom===-5&&p.top===-2.4));
  const label=built.signs.find(s=>s.id.startsWith('bs_'));assert.ok(label&&Math.abs(label.c[1]+1.95)<1e-8);
  let vertices=0;for(const b of built.buffers.filter(b=>b.mat==='st'))for(let i=0;i<b.pos.length;i+=3)if(b.pos[i]>295&&b.pos[i]<305&&b.pos[i+2]>488&&b.pos[i+2]<497){vertices++;assert.ok(b.pos[i+1]<-.5,'shelter, waiting people and local kerbs do not float above the trench');}
  assert.ok(vertices>100);
});


test('the background tile result transfers cut terrain and physical support; World only installs it',()=>{
  initTemplates();const e=road([[100,500],[900,500]],{elev:[-5,-5]});const built=tile(e,true);
  assert.equal(built.underpassGround,true);const ground=built.buffers.find(b=>b.mat==='ground');assert.ok(ground&&ground.pos.length>0);assert.ok(built.buffers.some(b=>b.mat==='st'),'retaining walls use plain street concrete');
  const transfer=built.buffers.flatMap(b=>[b.pos.buffer,b.nor.buffer,b.uv.buffer,b.col.buffer]);assert.equal(new Set(transfer).size,transfer.length,'no repeated transfer handle');
  const wire=structuredClone(built,{transfer});assert.equal(ground.pos.byteLength,0,'terrain uses the same ownership transfer as normal worker buffers');
  const material=new THREE.MeshBasicMaterial(),mats=Object.fromEntries([...new Set(wire.buffers.map(b=>b.mat)), 'ground'].map(k=>[k,material]));
  const world:any=Object.assign(Object.create(World.prototype),{group:new THREE.Group(),tiles:new Map(),groundGeo:new THREE.PlaneGeometry(1000,1000),mats,
    buildingGrid:new Map(),surfaceGrid:new Map(),walls:new Map(),obstacles:new Map(),byBuilding:new Map(),landmarkSurfaceGrid:new Map(),waterGrid:new Map(),activity:new Map(),rails:new Map(),lamps:[],signals:[],busStops:[],walkPaths:[],signs:{add(){},remove(){}},onTileAdded(){},onTileRemoved(){},
    underpassTerrain:{build(){throw new Error('cut tessellation must not execute inside World.add');}}});
  world.add(wire);const loaded=world.tiles.get('0_0');assert.ok(loaded);assert.equal(loaded.group.children.length,wire.buffers.length,'no default solid plane is added over the prepared hole');
  const mesh=loaded.group.children.find((m:any)=>m.geometry.attributes.position.array===wire.buffers.find(b=>b.mat==='ground')!.pos);assert.ok(mesh);mesh.updateMatrixWorld(true);
  assert.equal(new THREE.Raycaster(new THREE.Vector3(500,20,500),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length,0,'prepared hole stays open after scene installation');
  assert.ok(supportAt(world,500,508,-5).y< -4.8,'worker-produced pavement and side support were merged');assert.ok(world.walls.size>0);
  world.unload(loaded);assert.equal(world.surfaceGrid.size,0);assert.equal(world.walls.size,0);world.groundGeo.dispose();material.dispose();
  const ordinary=tile({...e,elev:null},true);assert.equal(ordinary.underpassGround,undefined);assert.equal(ordinary.buffers.some(b=>b.mat==='ground'),false,'ordinary tiles retain the shared original plane');
});


test('road divider collision starts at visible pavement instead of extending a phantom basement into an underpass',()=>{
  initTemplates();
  for(const base of [0,-5]){
    const e=road([[100,500],[900,500]],{elev:base?[base,base]:null}),built=tile(e,true);
    const divider=[...new Set([...built.walls.values()].flat())].find(w=>w.kind==='median'&&Math.min(w.ax,w.bx)>150&&Math.max(w.ax,w.bx)<400);assert.ok(divider);
    assert.equal(divider.y0a,base);assert.equal(divider.y0b,base);assert.ok(divider.y1a>base+.3&&divider.y1b>base+.3,'existing above-pavement solid height is preserved');
    const mid={x:(divider.ax+divider.bx)/2,z:(divider.az+divider.bz)/2},dx=divider.bx-divider.ax,dz=divider.bz-divider.az,len=Math.hypot(dx,dz),prev={x:mid.x-dz/len*2,z:mid.z+dx/len*2};
    const city:any={walls:built.walls,railwayWalls:[]};
    assert.equal(collideWalls(city,prev,{...mid},1.05,base-.95,base-.05).hit,0,'a car wholly below this road cannot hit its invisible lower divider');
    assert.ok(collideWalls(city,prev,{...mid},1.05,base+.05,base+1.1).hit>0,'ordinary road-level car collision remains solid');
    const kerb=built.buffers.find(b=>b.mat==='kerb');assert.ok(kerb);const bottom=Array.from(kerb.pos).filter((_,i)=>i%3===1);assert.equal(Math.min(...bottom),base,'physical bottom equals the rendered striped kerb base');
  }
});
