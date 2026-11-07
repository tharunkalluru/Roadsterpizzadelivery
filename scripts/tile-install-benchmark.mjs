// Real shipped tile CPU installation diagnostic. No renderer or phone FPS claims.
import {build} from 'esbuild';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd(),baseline=resolve(process.argv[2]||'../perf-baseline');
const temporary=await mkdtemp(join(tmpdir(),'roadster-tile-install-'));
const output=resolve('docs/performance/frame-spikes-v36');
try {
 const bundle=join(temporary,'probe.mjs');
 await build({stdin:{contents:`export * as THREE from 'three'; export {World} from './src/world/world';export {initTemplates as initBaselineTemplates} from ${JSON.stringify(join(baseline,'src/core/util.ts'))};export {World as BaselineWorld} from ${JSON.stringify(join(baseline,'src/world/world.ts'))};export {SignSystem} from './src/world/signs';export {buildTile} from './src/world/city';export {initTemplates} from './src/core/util';export {placeLandmarks} from './src/world/landmarks';`,loader:'ts',resolveDir:root},outfile:bundle,bundle:true,platform:'node',format:'esm',logLevel:'error'});
 const {THREE,World,BaselineWorld,SignSystem,buildTile,initTemplates,initBaselineTemplates,placeLandmarks}=await import(pathToFileURL(bundle).href);
 const unpack=async file=>JSON.parse(gunzipSync(await readFile('public/city/'+file)).toString());
 const core=await unpack('core.pack.wasm');initTemplates();initBaselineTemplates();
 const landmarks=placeLandmarks(core.origin,core.packs.flatMap(p=>p.tiles));
 const material=new THREE.MeshBasicMaterial();const mats=Object.fromEntries(['ground','park','water','road','marks','foot','kerb','st','wall','shop','stationWindow','roof','lit','glow'].map(k=>[k,material]));
 const world=WorldClass=>Object.assign(Object.create(WorldClass.prototype),{group:new THREE.Group(),tiles:new Map(),groundGeo:new THREE.PlaneGeometry(1000,1000),mats,buildingGrid:new Map(),surfaceGrid:new Map(),walls:new Map(),obstacles:new Map(),byBuilding:new Map(),landmarkSurfaceGrid:new Map(),waterGrid:new Map(),activity:new Map(),rails:new Map(),lamps:[],signals:[],busStops:[],walkPaths:[],signs:new SignSystem(),onTileAdded(){},onTileRemoved(){},signalSeconds:0});
 const snapshot=w=>({maps:['buildingGrid','surfaceGrid','walls','obstacles','landmarkSurfaceGrid','waterGrid','byBuilding','activity','rails'].map(k=>[k,[...w[k]]]),signs:w.signs.signs,lamps:w.lamps,signals:w.signals,busStops:w.busStops,walkPaths:w.walkPaths,parked:w.parkedVehicles.map(({sync,...body})=>body)});
 const geometry=w=>{const meshes=[];w.group.traverse(m=>{if(m.isMesh){const attrs=Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,v])=>[k,createHash('sha256').update(Buffer.from(v.array.buffer,v.array.byteOffset,v.array.byteLength)).digest('hex')]));meshes.push({attrs,cast:m.castShadow,receive:m.receiveShadow,order:m.renderOrder,matrix:m.instanceMatrix?.array&&Array.from(m.instanceMatrix.array)});}});return meshes;};
 const rows=[];
 for(const lowQ of [true,false])for(const key of ['0_0','-1_0','0_-1']){
  const [i,j]=key.split('_').map(Number),pack=core.packs.find(p=>p.tiles.some(t=>t[0]===i&&t[1]===j));
  const zone=(await unpack(pack.file)).tiles[key],tile=buildTile(zone,{lowQ,landmarks,metro:core.metro});
  const oldTile={...tile};
  const workerStart=performance.now();
  const candidateTile={...tile,buffers:tile.buffers.map(buffer=>{const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(buffer.pos,3));geo.computeBoundingSphere();return {...buffer,sphere:{center:geo.boundingSphere.center.toArray(),radius:geo.boundingSphere.radius}};})};
  const workerBoundsMs=performance.now()-workerStart;
  for(let run=0;run<7;run++){
   const old=world(BaselineWorld),next=world(World);let beforeMs,publishMs,prepareMs;const sliceMs=[];
   const oldRun=()=>{const start=performance.now();old.add(oldTile);beforeMs=performance.now()-start;};
   const nextRun=()=>{const job=next.prepareTile(candidateTile);let result;const start=performance.now();do{const begin=performance.now();do{result=job.next();}while(!result.done&&performance.now()-begin<1);sliceMs.push(performance.now()-begin);}while(!result.done);prepareMs=performance.now()-start;const begin=performance.now();next.publishTile(result.value);publishMs=performance.now()-begin;};
   if(run%2){nextRun();oldRun();}else{oldRun();nextRun();}
   assert.deepEqual(snapshot(next),snapshot(old));assert.deepEqual(geometry(next),geometry(old));
   rows.push({key,lowQ,run,vertices:tile.counts.verts,buffers:tile.buffers.length,parked:tile.parkedVehicles.length,beforeMs,prepareMs,publishMs,sliceMs,workerBoundsMs,exactGeometryAndGameplay:true});
   old.unload(old.tiles.get(key));next.unload(next.tiles.get(key));old.groundGeo.dispose();next.groundGeo.dispose();
  }
 }
 const stats=values=>{const a=[...values].sort((a,b)=>a-b);return {count:a.length,p50:a[Math.floor((a.length-1)*.5)],p95:a[Math.floor((a.length-1)*.95)],p99:a[Math.floor((a.length-1)*.99)],max:a.at(-1)};};
 const report={kind:'realShippedTileCpuMicroprobe',baseline,generatedAt:new Date().toISOString(),before:stats(rows.map(r=>r.beforeMs)),prepareSlices:stats(rows.flatMap(r=>r.sliceMs)),publish:stats(rows.map(r=>r.publishMs)),rows,limitations:['Node host CPU microprobe with Three.js geometry and actual world grids. Renderer/GPU upload, onTileAdded gameplay subscribers and physical phones excluded.','Approximately 1 ms cooperative slice budget can overrun due to a primitive allocation, GC or OS scheduling. All raw observations retained.','Background worker bounding work reported separately; geometry bytes and gameplay records compared exactly per tile. Atomic publication remains synchronous.']};
 await mkdir(output,{recursive:true});await writeFile(join(output,'tile-install.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({before:report.before,prepareSlices:report.prepareSlices,publish:report.publish,comparisons:rows.length},null,2));
}finally{await rm(temporary,{recursive:true,force:true});}
