// Actual production interchange structures versus train and roof-riding volumes.
// Offline component geometry, not a gameplay or surveyed-gradient claim.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from '../game/node_modules/esbuild/lib/main.js';
const root=fileURLToPath(new URL('../',import.meta.url)),temp=await mkdtemp(join(tmpdir(),'metro-interchanges-'));
let groups=0;const test=async(name,run)=>{await run();groups++;console.log(`PASS ${name}`);};
try{
 await build({stdin:{contents:"export*from'./game/src/world/metro-geometry';export*from'./game/src/world/metro-interchanges';export{buildTile}from'./game/src/world/city';export{MetroTrains}from'./game/src/game/metro';export*from'./game/src/game/moving-rail';export{initTemplates}from'./game/src/core/util';export{BoxGeometry,RingGeometry,MeshBasicMaterial,Vector3,Box3,Triangle}from'./game/node_modules/three/build/three.module.js';",resolveDir:root,loader:'ts'},outfile:join(temp,'test.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'error'});
 const{metroCorridors,metroPlatformAssemblies,metroDeckHeight,metroTrackDeckHeight,metroTrackDeckGrade,METRO_INTERCHANGES,buildTile,MetroTrains,MovingRailFrames,MovingRailInteraction,railRoofAt,initTemplates,BoxGeometry,RingGeometry,MeshBasicMaterial,Vector3,Box3,Triangle}=await import(pathToFileURL(join(temp,'test.mjs')));
 initTemplates({rbox:new BoxGeometry(1,1,1),ring:new RingGeometry(1,1.35,12)});
 const core=JSON.parse(gunzipSync(await readFile(join(root,'game/public/city/core.pack.wasm')))),corridors=metroCorridors(core.metro.lines),assemblies=metroPlatformAssemblies(core.metro.stations,corridors,core.metro.deckHeight),material=new MeshBasicMaterial(),metro=new MetroTrains(core.metro,{body:material,lights:material});
 const built=new Map(),tile=(i,j)=>{const key=`${i}_${j}`;if(!built.has(key))built.set(key,buildTile({i,j,roads:[],nodes:{},buildings:[],boards:[],furniture:[],areas:[]},{lowQ:false,metro:core.metro}));return built.get(key);};
 await test('six retained source anchors produce fifty-nine physical assemblies and no duplicate JBS service with exactly two exterior names per source site',()=>{
  assert.equal(assemblies.length,59);assert.equal(assemblies.filter(a=>a.secondary).length,3);assert.equal(new Set(assemblies.map(a=>a.stationId)).size,56);assert.ok(!assemblies.some(a=>a.stationId==='st_jbs'));
  for(const[id,anchors]of Object.entries(METRO_INTERCHANGES)){
   const parts=assemblies.filter(a=>a.stationId===id);assert.equal(parts.length,2);
   for(const a of parts){assert.equal(a.sourceId,anchors[a.lineId].sourceId);assert.deepEqual(a.source.p,anchors[a.lineId].p);const b=tile(Math.floor(a.source.p[0]/1000),Math.floor(a.source.p[1]/1000));assert.equal(b.signs.filter(s=>s.id.startsWith(`mst_interior_${a.key}_`)).length,2);}
   const b=tile(Math.floor(parts[0].source.p[0]/1000),Math.floor(parts[0].source.p[1]/1000));assert.equal(b.signs.filter(s=>s.id.startsWith(`mst_exterior_${id}_`)).length,2);
  }
 });
 await test('all twelve interchange service directions stop at actual platform floors and their train plus roof-riding envelopes clear rendered structures',()=>{
  const results=[];
  for(const a of assemblies.filter(a=>METRO_INTERCHANGES[a.stationId]))for(const dir of[1,-1]){
   const run=metro.runs.find(r=>r.corridor===a.corridor&&r.dir===dir),stop=run.stationStops.find(s=>s.id===a.stationId),train=metro.trains.find(t=>t.run===run);assert.ok(stop);
   const saved=metro.trains;metro.trains=[train];Object.assign(train,{s:stop.s,v:0,dwell:18,terminal:false,next:stop.s});metro.update(0,a.frame.cx,a.frame.cz);
   const dwell=metro.stationDwells[0];assert.ok(dwell);assert.equal(dwell.doors.length,9);
   for(const d of dwell.doors)assert.ok(Math.abs(d.y-a.deckHeight-1.2)<.002);
   let triangleConflicts=0;const samples=[];
   for(const body of metro.bodies){
    const box=new Box3(new Vector3(-body.halfWidth+.02,body.bottom-body.y+.02,-body.halfLength+.1),new Vector3(body.halfWidth-.02,body.roof-body.y+1.8,body.halfLength-.1));
    const convert=(x,y,z)=>{const dx=x-body.x,dz=z-body.z,along=dx*body.hx+dz*body.hz;return new Vector3(-dx*body.hz+dz*body.hx,y-body.y-along*(body.grade||0),along);};
    const i=Math.floor(body.x/1000),j=Math.floor(body.z/1000);
    for(let ti=i-1;ti<=i+1;ti++)for(let tj=j-1;tj<=j+1;tj++)for(const b of tile(ti,tj).buffers.filter(b=>!['glow','water'].includes(b.mat))){
     for(let k=0;k<b.pos.length;k+=9){
      const ax=b.pos[k],az=b.pos[k+2],bx=b.pos[k+3],bz=b.pos[k+5],cx=b.pos[k+6],cz=b.pos[k+8];
      if(Math.min(ax,bx,cx)>body.x+30||Math.max(ax,bx,cx)<body.x-30||Math.min(az,bz,cz)>body.z+30||Math.max(az,bz,cz)<body.z-30)continue;
      const tri=new Triangle(convert(ax,b.pos[k+1],az),convert(bx,b.pos[k+4],bz),convert(cx,b.pos[k+7],cz));
      if(box.intersectsTriangle(tri)){triangleConflicts++;if(samples.length<4)samples.push({tile:`${ti}_${tj}`,mat:b.mat,world:[...b.pos.slice(k,k+9)]});}
     }
    }
   }
   results.push({stationId:a.stationId,lineId:a.lineId,direction:dir,sourceId:a.sourceId,floor:a.deckHeight+1.2,triangleConflicts,samples});metro.trains=saved;
  }
  console.log('INTERCHANGE_RENDERED_CLEARANCE',JSON.stringify(results));assert.ok(results.every(r=>r.triangleConflicts===0),'rendered girder/canopy/column/name/bench geometry must clear trains and roof-riding cars');assert.equal(results.length,12);
 });
 await test('a roof rider follows both height and slope changes without losing the same moving coach',()=>{
  const frames=new MovingRailFrames(),contact=new MovingRailInteraction(),shape={id:'graded',x:0,y:20,z:0,hx:1,hz:0,halfWidth:1.5,halfLength:12,bottom:20.15,roof:23.775,grade:.03};
  const rider={pos:{x:5,y:23.775+.15+.55,z:0},yaw:-Math.PI/2,speed:0,vy:0,flying:false,descending:false,placementRevision:0};
  let bodies=frames.set([shape]);contact.beforePlayer(rider,bodies,false,.02);assert.equal(contact.afterPlayer(rider,.02).carried,true);
  bodies=frames.set([{...shape,x:1,y:20.05,roof:23.825,grade:.032}]);contact.beforePlayer(rider,bodies,false,.02);assert.ok(Math.abs(rider.pos.y-(railRoofAt(bodies[0],rider.pos.x,rider.pos.z)+.55))<1e-9);assert.equal(contact.afterPlayer(rider,.02).carried,true);
 });
 console.log(`${groups} metro interchange regression groups passed (offline production geometry).`);
}finally{await rm(temp,{recursive:true,force:true});}
