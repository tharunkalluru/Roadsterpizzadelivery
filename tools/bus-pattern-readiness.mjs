// Independent production bus execution against shipped source roads.
// Offline simulation, never a browser driver or agency-shape certification.
// Usage: node tools/bus-pattern-readiness.mjs [candidate.pack.wasm] [id,id,...]
// Omit IDs to replay the formerly609 failing alignments from the pinned baseline.
// BUS_FULL_PATTERN=1:0 replays a complete published pattern; origin is departure,
// and every subsequent stop requires an actual dwell before final service end.
// BUS_RESULTS_ONLY=1 emits full JSON details without intermediate progress.
// BUS_BASELINE_PACK or BUS_BASELINE_REF explicitly overrides the fixed original
// baseline; current HEAD and the current candidate must never redefine that set.
process.on('uncaughtException', error=>{console.error(JSON.stringify({fatal:error.message}));process.exitCode=2;});
import {build} from '../game/node_modules/esbuild/lib/main.js';
import {readFile} from 'node:fs/promises';import{gunzipSync}from'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const sourcePaths=['game/src/game/traffic.ts','game/src/game/bus-services.ts','game/src/game/bus-path.ts','game/src/game/traffic-path.ts','game/src/game/roadgraph.ts','game/src/world/signals.ts'];
const sourceControllerHashes=await Promise.all(sourcePaths.map(async file=>({file,sha256:createHash('sha256').update(await readFile(root+'/'+file)).digest('hex')})));
const wallStarted=performance.now(),runStartedAt=new Date().toISOString();
const packed=await build({stdin:{contents:"export {RoadGraph} from './game/src/game/roadgraph';export{BusServices}from'./game/src/game/bus-services';export{Traffic}from'./game/src/game/traffic';export{rng}from'./game/src/core/util';export{Scene,BufferGeometry,MeshBasicMaterial}from'./game/node_modules/three/build/three.module.js';",resolveDir:root},bundle:true,format:'esm',platform:'node',write:false});
const {RoadGraph,BusServices,Traffic,rng,Scene,BufferGeometry,MeshBasicMaterial}=await import('data:text/javascript;base64,'+Buffer.from(packed.outputFiles[0].text).toString('base64'));
const load=async p=>JSON.parse(gunzipSync(await readFile(p)));
const core=await load(root+'/game/public/city/core.pack.wasm');
const baselineRef=process.env.BUS_BASELINE_REF||'0377573697cdd287035aa99bc130959e88971977';
const baselinePath=process.env.BUS_BASELINE_PACK&&resolve(root,process.env.BUS_BASELINE_PACK);
const baselineBytes=baselinePath?await readFile(baselinePath):execFileSync('git',['show',baselineRef+':game/public/transit/tgsrtc.pack.wasm'],{cwd:root,maxBuffer:30000000});
const baselineSha256=createHash('sha256').update(baselineBytes).digest('hex');
if(!baselinePath&&!process.env.BUS_BASELINE_REF&&baselineSha256!=='634ec22e004131ce88d49429a0cf1aa652659baf8fce5fa7227fbdcbc49c1fac')throw Error('Pinned original transit baseline hash mismatch');
const old=JSON.parse(gunzipSync(baselineBytes));
const candidatePath=resolve(root,process.argv[2]||'game/public/transit/tgsrtc.pack.wasm');
const candidateBytes=await readFile(candidatePath),candidate=JSON.parse(gunzipSync(candidateBytes)),inputSha256=createHash('sha256').update(candidateBytes).digest('hex');
const roads=new Map(),keep=e=>{if(e.w>=6&&e.cls!=='service'&&!e.ctx&&!roads.has(e.id))roads.set(e.id,e);};core.roads.forEach(keep);
for(const p of core.packs){const d=await load(root+'/game/public/city/'+p.file);for(const t of Object.values(d.tiles))t.roads.forEach(keep);}
const graph=new RoadGraph([...roads.values()]),affected=[];
for(const[id,a]of Object.entries(old.alignments)){if(a.status!=='inferred_legal_road_path')continue;let reject=false;for(let i=1;i<a.steps.length;i++){const p=a.steps[i-1],q=a.steps[i],e=graph.byId.get(p.edge),f=graph.byId.get(q.edge);if(!e||!f)continue;const u=graph.pointAt(e,p.to,p.dir),v=graph.pointAt(f,q.from,q.dir);if(Math.acos(Math.max(-1,Math.min(1,u.hx*v.hx+u.hz*v.hz)))>Math.PI*.88){reject=true;break;}}if(reject)affected.push(id);}
const fullPattern=process.env.BUS_FULL_PATTERN&&candidate.patterns.find(p=>p.id===process.env.BUS_FULL_PATTERN);
if(process.env.BUS_FULL_PATTERN&&!fullPattern)throw Error('Unknown published pattern: '+process.env.BUS_FULL_PATTERN);
const ids=fullPattern?[fullPattern.alignmentIds[0]]:process.argv[3]?process.argv[3].split(','):affected,geo=new BufferGeometry(),mat=new MeshBasicMaterial(),proto={group:'bus',size:[2.5,3.3,11],body:geo,lights:geo,decals:[]},failures=[],unresolved=[],results=[];
let completed=0;
for(const id of ids){const a=candidate.alignments[id];if(a?.status!=='inferred_legal_road_path'){unresolved.push({id,reason:a?.reason||'missing'});continue;}
const original=fullPattern||candidate.patterns.find(p=>p.alignmentIds.includes(id)),index=original.alignmentIds.indexOf(id),pattern=fullPattern||{...original,stops:original.stops.slice(index,index+2),alignmentIds:[id]},feed={...candidate,patterns:[pattern]},services=new BusServices(graph,feed),first=a.steps[0],edge=graph.byId.get(first.edge),s=first.from;
const leg=fullPattern&&services.leg(pattern,0),stopPosition=leg&&services.target(leg),path=leg&&stopPosition&&services.plan(edge,first.dir,s,stopPosition,leg);
const run=fullPattern?(path?{pattern,target:1,path,step:0,stopPosition,ended:false}:null):services.bind(edge,first.dir,s,0);
if(!run){failures.push({id,status:'cannot_bind',route:original.number,first});continue;}
const tr=Object.assign(Object.create(Traffic.prototype),{cars:[],max:0,graph,city:undefined,scene:new Scene(),mats:{vBody:mat,vLight:mat},byGroup:{bus:[proto]},r:rng(77),t:0,plans:0,stopsByEdge:new Map(),onHorn(){},services}),c=tr.spawnAt('bus',edge,first.dir,s);c.busRun=run;
let dwelled=false,idle=0,seconds=0,servedDistance=null,status='deadline',lastX=c.x,lastZ=c.z;const served=[],deadline=fullPattern?3600:Math.min(2400,Math.max(240,a.lengthM/2+a.steps.length*4+120));
for(let n=0;n<deadline*30;n++){const oldDwell=c.dwell,targetIndex=run.target,position=run.stopPosition;tr.update(1/30,c.x,c.z,{x:c.x+290,y:.55,z:c.z+290,speed:0,hx:1,hz:0},[]);seconds=(n+1)/30;const moved=Math.hypot(c.x-lastX,c.z-lastZ);lastX=c.x;lastZ=c.z;idle=moved<.0001&&c.dwell<=0?idle+1/30:0;
if(c.dwell>0){dwelled=true;if(oldDwell<=0){const target=graph.pointAt(position.edge,position.s,position.dir,c.motion?.lane??c.lane);servedDistance=Math.hypot(c.x-target.x,c.z-target.z);served.push({index:targetIndex,id:pattern.stops[targetIndex],name:candidate.stops[pattern.stops[targetIndex]][0],seconds,distance:servedDistance,speed:c.speed,dwellSeconds:c.dwell});}}
if(dwelled&&run.ended){status=served.length===pattern.stops.length-1?'served_destination':'premature_end';break;}if(idle>100){status='stalled';break;}}
const row={id,status,route:original.number,from:candidate.stops[pattern.stops[0]][0],to:candidate.stops[pattern.stops.at(-1)][0],lengthM:a.lengthM,steps:a.steps.length,seconds,dwelled,ended:run.ended,servedDistance,servedStops:served,edge:c.edge.e.id,dir:c.dir,s:c.s,speed:c.speed,pathIndex:run.step,motion:c.motion?{kind:c.motion.kind,progress:c.motion.progress,length:c.motion.curve.length,start:c.motion.startS,end:c.motion.endS}:null};
if(process.env.BUS_PROBE_DEBUG&&status!=='served_destination'){globalThis.__busDebug=true;tr.prepareBusSpan(c);globalThis.__busDebug=false;}
if(status==='served_destination')completed++;else failures.push(row);results.push(row);tr.clear();
if(!process.env.BUS_RESULTS_ONLY&&(results.length%50===0||(status!=='served_destination'&&failures.length<=10)))console.log(JSON.stringify({progress:results.length,total:ids.length,completed,failed:failures.length,last:row}));
}
console.log(JSON.stringify({candidate:candidatePath,inputSha256,baseline:{ref:baselinePath?null:baselineRef,path:baselinePath||null,sha256:baselineSha256},sourceControllerHashes,runStartedAt,wallElapsedSeconds:(performance.now()-wallStarted)/1000,oldAffected:affected.length,selected:ids.length,completed,unresolved:unresolved.length,failures:failures.length,failureStatuses:failures.reduce((counts,row)=>(counts[row.status]=(counts[row.status]||0)+1,counts),{}),unresolvedItems:process.env.BUS_RESULTS_ONLY?unresolved:unresolved.slice(0,5),failedItems:process.env.BUS_RESULTS_ONLY?failures:failures.slice(0,5),maxServedDistance:Math.max(0,...results.map(r=>r.servedDistance||0)),fullPattern:fullPattern?{id:fullPattern.id,number:fullPattern.number,publishedStops:fullPattern.stops.map(id=>({id,name:candidate.stops[id][0]})),results}:undefined},null,2));
if(failures.length)process.exitCode=1;
