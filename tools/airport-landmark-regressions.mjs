import assert from 'node:assert/strict';
import {build} from '../game/node_modules/esbuild/lib/main.js';
import{mkdtempSync,rmSync,readFileSync}from'node:fs';import{tmpdir}from'node:os';import path from'node:path';import{gunzipSync}from'node:zlib';
const temp=mkdtempSync(path.join(tmpdir(),'roadster-airports-'));
try{
 const entry=path.join(temp,'checks.mjs');await build({stdin:{contents:"export * from './game/src/world/airfields.ts';export * from './game/src/world/airport-aircraft.ts';export * from './game/src/world/landmark-support.ts';export * from './game/src/world/landmark-support-capture.ts';export * from './game/src/world/landmarks.ts';export * from './game/src/world/durgam-bridge.ts';export * from './game/src/core/util.ts';",resolveDir:new URL('..',import.meta.url).pathname},outfile:entry,bundle:true,format:'esm',platform:'node'});
 const m=await import(entry),core=JSON.parse(gunzipSync(readFileSync(new URL('../game/public/city/core.pack.wasm',import.meta.url))));m.initTemplates();
 const airports=m.placeAirfields(core.origin),project=m.airfieldProjection(core.origin);
 assert.equal(airports.length,2);assert.deepEqual(airports.map(a=>a.runways.length),[2,1]);
 for(const a of airports){for(const r of a.runways){const[p,q]=r.ends,L=Math.hypot(q[0]-p[0],q[1]-p[1]);assert.ok(Math.abs(L-r.length)<12,`${a.id} ${r.id}: projected official endpoints must match published length (${L})`);assert.ok(q[0]>p[0]&&q[1]<p[1]);assert.ok(Math.abs((Math.atan2(q[0]-p[0],p[1]-q[1])*180/Math.PI)-88.9)<.3);assert.ok(m.airfieldClearAt([a],(p[0]+q[0])/2,(p[1]+q[1])/2));}
  const p=m.AIRPORT_LAYOUTS[a.id].terminal,t=project(p.lat,p.lon),route=m.airportDepartureRoute(a,t);assert.ok(route,`${a.id} source taxi graph must reach runway`);assert.ok(route.taxi>30&&route.runway>1800);assert.ok(route.pts.every(p=>p.every(Number.isFinite)));assert.ok(a.features.some(f=>f.kind==='terminal'));assert.ok(a.features.some(f=>f.kind==='apron'));
 }
 assert.deepEqual(airports[1].runways[0].thresholds,[479,738]);assert.deepEqual(airports[0].runways.map(r=>r.width),[60,45]);
 // Render every touched runway tile independently: support must reach both ends
 // even when the terminal owner's tile is not loaded.
 const names=['st','road','marks','lit','water','wall','park','roof','foot','kerb','glow','shop'];
 let totalVerts=0;const tileKeys=new Set();for(const a of airports)for(const r of a.runways){const[p,q]=r.ends,L=Math.hypot(q[0]-p[0],q[1]-p[1]);for(let s=0;s<=L;s+=150){const u=s/L;tileKeys.add(`${Math.floor((p[0]+(q[0]-p[0])*u)/1000)},${Math.floor((p[1]+(q[1]-p[1])*u)/1000)}`);}}
 const grids=new Map();for(const key of tileKeys){const[i,j]=key.split(',').map(Number),B=Object.fromEntries(names.map(n=>[n,new m.TiledBatch()])),grid=new Map();m.drawAirfieldTile(airports,i,j,B,grid);grids.set(key,grid);for(const[name,b]of Object.entries(B))for(const part of b.tiles.values()){assert.ok(part.pos.every(Number.isFinite));if(['road','marks'].includes(name))for(let n=1;n<part.nor.length;n+=3)assert.ok(part.nor[n]>.99,'All pavement/markings must face upwards');totalVerts+=part.pos.length/3;}}
 for(const a of airports)for(const r of a.runways){for(const u of [.01,.25,.5,.75,.99]){const[p,q]=r.ends,x=p[0]+(q[0]-p[0])*u,z=p[1]+(q[1]-p[1])*u,grid=grids.get(`${Math.floor(x/1000)},${Math.floor(z/1000)}`);assert.ok(Math.abs((m.landmarkHeightAt(grid,x,z,1)??Infinity)-.16)<1e-8,`${a.id} runway surface must stream locally`);}}
 assert.ok(totalVerts<250000,'Runways/taxiways must stay bounded');
 // Sloped faces interpolate actual height; undersides/vertical faces do not
 // create blanket roofs, including an actual arch's open passage below its crown.
 const B=Object.fromEntries(names.map(n=>[n,new m.TiledBatch()])),grid=new Map(),captured=m.captureLandmarkBatches(B,grid,'fixture');
 captured.st.box(10,7,15,8,4,10,'#fff');assert.equal(m.landmarkHeightAt(grid,10,15,20),9);assert.equal(m.landmarkHeightAt(grid,10,15,8),null);
 captured.st.add(m.TPL.archBig,0,0,0,20,21,2,'#fff');assert.equal(m.landmarkHeightAt(grid,0,0,15),null,'Do not fill the great arch passage');assert.ok(m.landmarkHeightAt(grid,0,0,25)>19);
 const slope=new Map();m.addLandmarkSurface(slope,{id:'sloped',a:[0,2,0],b:[0,6,10],c:[10,2,0]});assert.ok(Math.abs(m.landmarkHeightAt(slope,2,3,99)-3.2)<1e-9);assert.equal(m.landmarkHeightAt(slope,8,8,99),null);
 m.addLandmarkSurface(slope,{id:'underside',a:[0,20,0],b:[10,20,0],c:[0,20,10]});assert.ok(Math.abs(m.landmarkRoofUnder(slope,2,3)-3.2)<1e-9);
 // Actual Golconda emitted mound/rocks have a varying surface, not the old four
 // concentric flat terraces. Capture agrees with a triangle's own centroid.
 const lm=m.placeLandmarks(core.origin),fort=lm.find(p=>p.id==='golconda'),fgrid=new Map(),FB=Object.fromEntries(names.map(n=>[n,new m.TiledBatch()]));m.drawLandmark(fort,{B:m.captureLandmarkBatches(FB,fgrid,fort.id),solid(){},obstacle(){},road:()=>false,roadY:()=>null});
 const triangles=[...new Set([...fgrid.values()].flat())];assert.ok(triangles.length>100);for(const t of triangles.slice(0,100)){const x=(t.a[0]+t.b[0]+t.c[0])/3,z=(t.a[2]+t.b[2]+t.c[2])/3,y=(t.a[1]+t.b[1]+t.c[1])/3;assert.ok(Math.abs(m.landmarkTriangleHeight(t,x,z)-y)<1e-6);}
 assert.equal(m.DURGAM_BRIDGE.stayCount,52);assert.equal(m.DURGAM_BRIDGE.mainSpan,233.85);assert.equal(m.DURGAM_BRIDGE.width,25.8);
 const cg=new Map(),CB=Object.fromEntries(names.map(n=>[n,new m.TiledBatch()]));m.drawLandmark({...lm.find(p=>p.id==='charminar'),x:0,z:0,rot:0},{B:m.captureLandmarkBatches(CB,cg,'charminar'),solid(){},obstacle(){},road:()=>false,roadY:()=>null});for(const[x,z]of[[-1,-1],[1,-1],[-1,1],[1,1]])assert.ok(Math.abs(m.landmarkHeightAt(cg,x,z,40)-31.7)<1e-5,'Four wheel contacts must rest on visible Charminar terrace, not ground');
 let structuralStays=0,lightStays=0;const no=()=>{},K=new m.Kit(0,0,0,{B:{st:{box:no,tri:no,add:()=>structuralStays++},lit:{add:()=>lightStays++}},obstacle:no,solid:no,road:()=>false,roadY:()=>6.8});m.drawDurgamBridge(K);assert.equal(structuralStays,52);assert.equal(lightStays,52,'One illumination strip per structural stay, not duplicated pairs');
 const plane=new m.AirportAircraft(core.origin,{lowQ:true});assert.ok(plane.group.children.length>=6,'Both airports must have parked and moving aircraft');plane.update(1,-7000,19000);plane.dispose();
 const indexed=new Set(core.packs.flatMap(p=>p.tiles.map(([i,j])=>`${i},${j}`))),missing=[...tileKeys].filter(k=>!indexed.has(k));
 console.log(`Airport/landmark checks passed: official3runway endpoints/widths/displaced thresholds, mapped taxi routes, ${tileKeys.size}independent runway tiles (${missing.length}without source packs), ${totalVerts}render vertices, actual sloped/arch support, bounded aircraft and52stay bridge. Missing tile keys: ${missing.join(' ')||'none'}`);
}finally{rmSync(temp,{recursive:true,force:true});}
