// Independent read-only probes of actual shipped bridge, toll and airport data.
// Run: node tools/validation-transport-readiness-2026-10-26.mjs
import {build} from '../game/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=new URL('..',import.meta.url).pathname;
const temp=await mkdtemp(join(tmpdir(),'transport-real-'));
try {
 await build({stdin:{contents:"export {buildTile} from './game/src/world/city';export {tollLaneLayout} from './game/src/world/extras';export {placeLandmarks,Kit} from './game/src/world/landmarks';export {initTemplates} from './game/src/core/util';export {landmarkHeightAt} from './game/src/world/landmark-support';export {supportAt} from './game/src/game/physics';export * from './game/src/world/airport-aircraft';export * from './game/src/world/airfields';export {roadGradePatches,applyRoadGradePatches} from './game/src/world/road-grades';",resolveDir:root},outfile:join(temp,'entry.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'error'});
 const m=await import(join(temp,'entry.mjs')); m.initTemplates();
 const load=async p=>JSON.parse(gunzipSync(await readFile(p)));
 const core=await load(join(root,'game/public/city/core.pack.wasm'));
 const lm=m.placeLandmarks(core.origin,core.packs.flatMap(p=>p.tiles)),bridge=lm.find(p=>p.id==='cablebridge');
 console.log('bridge',JSON.stringify(bridge));
 const key=`${Math.floor(bridge.x/1000)},${Math.floor(bridge.z/1000)}`;
 const source=core.packs.find(p=>p.tiles.some(([i,j])=>`${i},${j}`===key));
 const pack=await load(join(root,'game/public/city',source.file)); const tile=pack.tiles[key.replace(',','_')];
 console.log('tile',key,'roads',tile.roads.length);
 const built=m.buildTile(tile,{lowQ:true,landmarks:lm});
 const near=(x,z)=>[...new Set([...built.surfaceGrid.values()].flat())].filter(s=>{const dx=s.bx-s.ax,dz=s.bz-s.az,tt=Math.max(0,Math.min(1,((x-s.ax)*dx+(z-s.az)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-s.ax-dx*tt,z-s.az-dz*tt)<s.hw;});
 const K=new m.Kit(bridge.x,bridge.z,bridge.rot,{}), rows=[];
 for(let v=-220;v<=220;v+=2){
   const [x,z]=K.P(4,v),roads=near(x,z).filter(s=>s.kind==='road');
   const ys=roads.map(s=>{const dx=s.bx-s.ax,dz=s.bz-s.az,t=Math.max(0,Math.min(1,((x-s.ax)*dx+(z-s.az)*dz)/(dx*dx+dz*dz||1)));return s.ya+(s.yb-s.ya)*t;});
   const deck=m.landmarkHeightAt(built.landmarkSurfaceGrid,x,z,100);
   rows.push({v,x,z,road:ys.length?Math.max(...ys):null,deck});
 }
 let maxGap=0,maxJump=0,topSample=null,jumpSample=null;
 for(let i=0;i<rows.length;i++){const r=rows[i];if(r.road!==null&&r.deck!==null&&Math.abs(r.road-r.deck)>maxGap){maxGap=Math.abs(r.road-r.deck);topSample=r;}if(i&&rows[i].deck!==null&&rows[i-1].deck!==null&&Math.abs(rows[i].deck-rows[i-1].deck)>maxJump){maxJump=Math.abs(rows[i].deck-rows[i-1].deck);jumpSample=[rows[i-1],rows[i]];}}
 assert.ok(rows.some(r=>r.road!==null&&r.deck!==null),'real bridge samples must include road and deck');
 assert.ok(maxGap<=.051,'bridge deck must retain the intended road offset');
 assert.ok(maxJump<=.1,'shipped bridge deck must remain continuous');
 console.log(JSON.stringify({bridgeTile:key,rows:rows.length,maxDeckRoadGapM:maxGap,topSample,maxDeckJumpPer2m:maxJump,jumpSample,roadSampleCount:rows.filter(r=>r.road!==null).length,deckSampleCount:rows.filter(r=>r.deck!==null).length},null,2));
 const tolls=new Map();
 for(const pp of core.packs){const data=await load(join(root,'game/public/city',pp.file));for(const tile of Object.values(data.tiles))for(const f of tile.osm||[])if(f.k==='toll')tolls.set(f.id,f);}
 const layouts=[],missingTolls=[];
 for(const f of tolls.values()) {let best=null;const[x,z]=f.p||[NaN,NaN];for(const e of core.roads){if(/footway|path|steps|cycleway|pedestrian|track/.test(e.cls))continue;for(let i=1;i<e.pts.length;i++){const[a,b]=[e.pts[i-1],e.pts[i]],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);if(d<=25&&(!best||d<best.d))best={e,d,cx:a[0]+dx*t,cz:a[1]+dz*t,hx:dx/(Math.hypot(dx,dz)||1),hz:dz/(Math.hypot(dx,dz)||1),w:e.w,y:(e.elev?.[i-1]||0)+((e.elev?.[i]||0)-(e.elev?.[i-1]||0))*t};}}if(best){const layout=m.tollLaneLayout(best);layouts.push({id:f.id,road:best.e.id,cls:best.e.cls,elev:best.y,...layout,visualGapM:layout.laneWidth-1.2,collisionGapM:layout.laneWidth-1.5});}}
 const borderPairs=[];for(let i=0;i<layouts.length;i++)for(let j=i+1;j<layouts.length;j++){const a=layouts[i],b=layouts[j],p=tolls.get(a.id).p,q=tolls.get(b.id).p;if(a.road===b.road&&Math.hypot(p[0]-q[0],p[1]-q[1])<70&&(Math.floor(p[0]/1000)!==Math.floor(q[0]/1000)||Math.floor(p[1]/1000)!==Math.floor(q[1]/1000)))borderPairs.push({a:a.id,b:b.id,road:a.road,p,q});}
 assert.ok(layouts.length>0&&layouts.every(v=>v.visualGapM>=2.4-1e-6&&v.collisionGapM>=2.1-1e-6),'resolved toll lanes must leave vehicle clearance');
 assert.equal(borderPairs.length,0,'same-road nearby toll sources must not hide each other across a tile boundary');
 console.log('TOLL_LAYOUTS',JSON.stringify({sourceTolls:tolls.size,resolved:layouts.length,minVisualGapM:Math.min(...layouts.map(v=>v.visualGapM)),minCollisionGapM:Math.min(...layouts.map(v=>v.collisionGapM)),unmatched:[...tolls.values()].filter(f=>!layouts.some(l=>l.id===f.id)),narrow:layouts.filter(v=>v.collisionGapM<2.1),borderPairs},null,2));
 const inRing=(p,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
 for(const a of m.placeAirfields(core.origin)){
   const layout=m.AIRPORT_LAYOUTS[a.id],terminal=m.airfieldProjection(core.origin)(layout.terminal.lat,layout.terminal.lon),route=m.airportDepartureRoute(a,terminal),intrusions=[];
   const scale=a.id==='vohy'?.55:1;
   for(let dist=0;dist<=route.taxi;dist+=1){let i=1;while(i<route.pts.length-1&&route.cum[i]<dist)i++;const p=route.pts[i-1],q=route.pts[i],t=Math.max(0,Math.min(1,(dist-route.cum[i-1])/(route.cum[i]-route.cum[i-1]||1))),x=p[0]+(q[0]-p[0])*t,z=p[1]+(q[1]-p[1])*t,dx=q[0]-p[0],dz=q[1]-p[1],L=Math.hypot(dx,dz)||1,hx=dx/L,hz=dz/L;
     for(const f of a.features.filter(f=>f.kind==='terminal'||f.kind==='hangar'))for(const side of [-1,1])for(const fore of [-1,1]){const v=[x+side*17*scale*hz+fore*16*scale*hx,z-side*17*scale*hx+fore*16*scale*hz];if(inRing(v,f.pts))intrusions.push({dist,building:f.id,corner:v});}
   }
   assert.equal(intrusions.length,0,'departure aircraft corners must clear mapped terminal/hangar polygons');
   console.log('MOVING_ENVELOPE',JSON.stringify({id:a.id,taxiM:route.taxi,runwayM:route.runway,rectCornerBuildingHits:intrusions.length,firstHits:intrusions.slice(0,3)}));
 }
}finally{await rm(temp,{recursive:true,force:true});}
