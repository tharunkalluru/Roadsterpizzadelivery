import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve,sep } from 'node:path';
import { World } from '../../src/world/world';
import { prepareRoadGrades, rebaseRoadStops } from '../../src/world/road-grades';
import { warmPreparedRoadProfiles } from '../../src/world/road-profile-cache';
import { applySourceRoadStage } from '../../src/world/road-source-stage';
import type { CoreData } from '../../src/world/types';
import type { TileBuilt } from '../../src/world/city';

function replaceGlobal(name:string,value:any){
  const old=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  return()=>{if(old)Object.defineProperty(globalThis,name,old);else delete(globalThis as any)[name];};
}
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
let workerHandler:((event:any)=>Promise<void>)|undefined;
const observedWorkerPacks:Record<string,string>={};
let workerQueue:Promise<unknown>=Promise.resolve();

/** Executes the actual World constructor and actual tileworker module. Only
 * Worker message transport and pack HTTP are adapted for a CPU-only Node test.
 * No road preparation, render geometry, colliders or simulation is replaced. */
export async function actualWorldWorker(options:{lowQ?:boolean;allowInactive?:boolean;verifiedCache?:boolean;reuseCore?:CoreData}={}) {
  const coreBytes=readFileSync('public/city/core.pack.wasm'),core=options.reuseCore??applySourceRoadStage(JSON.parse(gunzipSync(coreBytes).toString()) as CoreData);
  assert.ok(!options.reuseCore||!options.verifiedCache,'A conditioned-core reuse test must not warm a raw-core cache onto it');
  const sourcePackHashes:Record<string,string>={};
  const fileFetch=async(input:any)=>{
    const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.origin,'https://road-release-fixture.invalid');assert.ok(url.pathname.startsWith('/city/'));
    const file=resolve('public',url.pathname.slice(1));assert.ok(file.startsWith(resolve('public/city')+sep),'Local test fetch must stay inside the source city');
    const bytes=readFileSync(file),sha=hash(bytes);if(observedWorkerPacks[file])assert.equal(sha,observedWorkerPacks[file],'A reused worker cache must not conceal changed source data');observedWorkerPacks[file]=sha;sourcePackHashes[file]=sha;return new Response(bytes,{status:200,headers:{'content-type':'application/wasm'}});
  };
  const roadCache=options.verifiedCache?await warmPreparedRoadProfiles('https://road-release-fixture.invalid/city/',core.roads,{fetcher:fileFetch as typeof fetch,sourceRoadGeometryGeneration:core.sourceRoadGeometryGeneration}):{used:false,reason:'explicit-derived-path'};
  if(options.verifiedCache)assert.equal(roadCache.used,true,'Final cached-mode checks require the verified generated cache, never silent fallback');
  let startupStopRebase:{rebased:number;ambiguous:number;moved:number}|null=null;
  if(!options.reuseCore){
    const originalRoads=core.roads;core.roads=prepareRoadGrades(originalRoads);
    const rebased=rebaseRoadStops(core,originalRoads,core.roads);
    startupStopRebase={rebased:rebased.rebased,ambiguous:rebased.ambiguous,moved:rebased.moved};
  }
  const startup={freshRaw:!options.reuseCore,sourceRoadGeometryGeneration:core.sourceRoadGeometryGeneration,stopRebase:startupStopRebase,
    stopSHA256:hash(Buffer.from(JSON.stringify({food:core.food.map(p=>p.stop),theatres:core.theatres.map(p=>p.stop),drops:core.drops})))};
  let initialization:any;
  class CaptureWorker {
    onmessage:any;onerror:any;onmessageerror:any;
    postMessage(message:any){assert.equal(message.type,'init');initialization=structuredClone(message);}
    terminate(){}
  }
  const restoreWorker=replaceGlobal('Worker',CaptureWorker),restoreEvents=replaceGlobal('addEventListener',()=>{});
  let world:World;
  try{world=new World(core,{}, {lowQ:options.lowQ??true,base:'https://road-release-fixture.invalid/city/'});}
  finally{restoreEvents();restoreWorker();}
  let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;const timer=(world as any).workerTimer;if(timer!==null&&timer!==undefined)clearTimeout(timer);(world as any).workerTimer=null;world.worker?.terminate();world.signs.dispose();world.groundGeo.dispose();};
  try{assert.ok(initialization,'Capture the actual World worker initialization');if(!options.allowInactive)assert.equal(world.modeledRoadReport.active,true,'Final acceptance requires activated verified road geometry');}
  catch(error){dispose();throw error;}
  const messages:any[]=[],messageTransfers:any[]=[],surface:any={onmessage:null,postMessage:(message:any,transfer:ArrayBuffer[]=[])=>{messages.push(structuredClone(message,{transfer}));messageTransfers.push({type:message.type,transferCount:transfer.length,detachedBuffers:transfer.filter(b=>b.byteLength===0).length});}};
  async function inWorker<T>(fn:()=>Promise<T>){
    const work=workerQueue.then(async()=>{const restoreSelf=replaceGlobal('self',surface),restoreFetch=replaceGlobal('fetch',fileFetch);try{return await fn();}finally{restoreFetch();restoreSelf();}});
    workerQueue=work.then(()=>{},()=>{});return work;
  }
  await inWorker(async()=>{if(!workerHandler){await import('../../src/world/tileworker');workerHandler=surface.onmessage;}else surface.onmessage=workerHandler;assert.equal(typeof surface.onmessage,'function');await surface.onmessage({data:initialization});});
  let sequence=0;
  const build=async(key:string):Promise<TileBuilt>=>{
    const[i,j]=key.split('_').map(Number),url=world.packOf.get(`${i}_${j}`);assert.ok(url,`Real World has no source pack for ${key}`);
    const requestId=++sequence;
    const m=await inWorker(async()=>{messages.length=0;await surface.onmessage({data:initialization});await surface.onmessage({data:{type:'build',url,key,requestId}});assert.equal(messages.length,1,'Actual worker must emit one completion');return messages[0];});
    assert.equal(m.requestId,requestId);if(m.type==='error')throw Error(`Actual worker failed ${key}: ${m.error}`);assert.equal(m.type,'built');
    return m.built as TileBuilt;
  };
  const restart=async()=>{
    world.worker?.terminate();const restore=replaceGlobal('Worker',CaptureWorker);
    try{world.worker=world.makeWorker();}finally{restore();}
    const next=structuredClone(initialization);
    await inWorker(async()=>surface.onmessage({data:next}));return next;
  };
  const verifySources=()=>{assert.equal(hash(readFileSync('public/city/core.pack.wasm')),hash(coreBytes));for(const[file,expected]of Object.entries(observedWorkerPacks))assert.equal(hash(readFileSync(file)),expected,`Worker source pack changed: ${file}`);};
  return{world,core,initialization,roadCache,startup,build,restart,sourcePackHashes,messageTransfers,sourceCoreSHA256:hash(coreBytes),verifySources,dispose,
    scope:'Actual World and tileworker code with Node-only message/file adapters; not browser concurrency, GPU or phone performance'};
}
