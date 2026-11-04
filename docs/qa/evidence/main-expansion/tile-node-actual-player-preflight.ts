import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {initTemplates} from '../../../../src/core/util';
import {buildTile,type TileZone} from '../../../../src/world/city';
import type {RoadEdge,XZ} from '../../../../src/world/types';
import {applyTileRoadNodeTransports,applyModeledRoadNodePositions} from '../../../../src/world/road-node-transport';
import {railwayNetwork} from '../../../../src/world/railway-geometry';
import {placeLandmarks} from '../../../../src/world/landmarks';
import {placeAirfields} from '../../../../src/world/airfields';
import {DESTINATION_IDENTITIES} from '../../../../src/world/destination-data';
import {collideWalls,collideBuildings,supportAt} from '../../../../src/game/physics';
import {actualPlayer} from '../../../../tests/fixtures/actual-player';
import {EmittedPlayerGeometry,actualPlayerContactProbe} from '../../../../tests/fixtures/emitted-player-contact';

const args=process.argv.slice(2),option=(k:string,v:string)=>{const i=args.indexOf(k);return i<0?v:args[i+1];};
const modelFile=option('--model','/tmp/reported-road-conservative-coherent-lowered-conditioned.json'),supplementFile=option('--supplement','/tmp/reported-road-tile-only-transports-lowered.json');
const output=option('--output','docs/qa/evidence/main-expansion/tile-node-actual-player-preflight.json');
const rawCounterpart=args.includes('--raw-counterpart'),failureCasesOnly=args.includes('--failure-cases-only');
const sha=(bytes:any)=>createHash('sha256').update(bytes).digest('hex');
const modelBytes=readFileSync(modelFile),supplementBytes=readFileSync(supplementFile),model=JSON.parse(modelBytes.toString()),supplement=JSON.parse(supplementBytes.toString());
assert.equal(sha(modelBytes),option('--model-sha','fdef4f7d7c687757d0b1166f91da438f996616bfaedfa33b2c8bcd582611bb9b'),'held conditioned core input');
assert.equal(sha(supplementBytes),option('--supplement-sha','4fe76dfeee5fa9e860ffa838c8eeac6377bd870d5d4275fc78371c64eee767e6'),'held source-bound tile supplement');
assert.equal(supplement.sourceModelSHA256,sha(modelBytes));
assert.equal(supplement.sourceCoreSHA256,sha(readFileSync('public/city/core.pack.wasm')),'source core pack binding');
const unpack=(file:string)=>JSON.parse(gunzipSync(readFileSync(file)).toString()),core=unpack('public/city/core.pack.wasm'),roads=(rawCounterpart?core.roads:model.roads)as RoadEdge[],coreById=new Map(roads.map(e=>[e.id,e]));
const field=model.endpointDisplacements,transports=supplement.transports;
assert.equal(transports.length,9);assert.equal(supplement.endpointLevelChecks.length,9);
for(const e of supplement.endpointLevelChecks)assert.ok(e.y===0&&e.coreLevels.every((y:number)=>y===0));
for(const[file,hash]of Object.entries(supplement.sourcePackSHA256))assert.equal(sha(readFileSync(file)),hash);
const levels=new Map(supplement.endpointLevelChecks.map((e:any)=>[e.road,e]));
const boundsById=new Map(transports.map((t:any)=>{const n=field[(levels.get(t.id)as any).node].after;return[t.id,{minX:n[0]-65,maxX:n[0]+65,minZ:n[1]-65,maxZ:n[1]+65}];}));
const oracles=new Map(transports.map((t:any)=>[t.id,new EmittedPlayerGeometry(boundsById.get(t.id)as any)]));
const city:any={surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[],landmarkSurfaceGrid:new Map(),waterGrid:new Map()};
const packs=new Map<string,any>(),tileKeys=new Set<string>(transports.flatMap((t:any)=>t.copies.map((c:any)=>c.tile)));
const tileReports:any[]=[],ownerRoads=new Map<string,RoadEdge>(),landmarks=placeLandmarks(core.origin,core.packs.flatMap((p:any)=>p.tiles)),airfields=placeAirfields(core.origin);
initTemplates();
for(const key of tileKeys){
  const[i,j]=key.split('_').map(Number),descriptor=core.packs.find((p:any)=>p.tiles.some((t:number[])=>t[0]===i&&t[1]===j));assert.ok(descriptor);
  if(!packs.has(descriptor.file))packs.set(descriptor.file,unpack(`public/city/${descriptor.file}`));
  const source:TileZone=packs.get(descriptor.file).tiles[key],before=sha(JSON.stringify(source));
  const transported=rawCounterpart?{roads:source.roads,applied:[],mismatched:[]}:applyTileRoadNodeTransports(source.roads,transports),nodes=rawCounterpart?{nodes:source.nodes,applied:[],mismatched:[]}:applyModeledRoadNodePositions(source.nodes,field);
  assert.deepEqual(transported.mismatched,[]);assert.deepEqual(nodes.mismatched,[]);
  const localRoads=transported.roads.map(e=>{const prepared=coreById.get(e.id);return prepared?{...e,...prepared,...((e as any).ctx?{ctx:(e as any).ctx}:{})}:e;});
  for(const e of localRoads)if(!(e as any).ctx&&transports.some((t:any)=>t.id===e.id))ownerRoads.set(e.id,e);
  const furniture=core.trafficSignals===undefined?source.furniture.filter((f:any)=>f.kind!=='traffic_signals'||!f.synth):[...source.furniture.filter((f:any)=>f.kind!=='traffic_signals'),...core.trafficSignals.filter((f:any)=>f.p[0]>=i*1000-80&&f.p[0]<(i+1)*1000+80&&f.p[1]>=j*1000-80&&f.p[1]<(j+1)*1000+80)];
  const built=buildTile({...source,roads:localRoads,nodes:nodes.nodes,furniture},{lowQ:true,metro:core.metro,landmarks,airfields,construction:model.construction,railway:railwayNetwork(),destinations:DESTINATION_IDENTITIES.filter(d=>d.tile[0]===i&&d.tile[1]===j)});
  for(const[tId,oracle]of oracles){const b=boundsById.get(tId)as any;if(b.maxX>=i*1000&&b.minX<=(i+1)*1000&&b.maxZ>=j*1000&&b.minZ<=(j+1)*1000)(oracle as EmittedPlayerGeometry).collect(built);}
  for(const k of['surfaceGrid','buildingGrid','walls','obstacles','landmarkSurfaceGrid','waterGrid']as const)for(const[cell,list]of built[k]||[])city[k].set(cell,[...(city[k].get(cell)||[]),...list]);
  assert.equal(sha(JSON.stringify(source)),before,'shared public helpers and tile build preserve source data');
  tileReports.push({tile:key,pack:descriptor.file,transported:transported.applied,modeledNodes:nodes.applied,nodePositions:Object.fromEntries(Object.keys(field).filter(n=>nodes.nodes[n]).map(n=>[n,nodes.nodes[n]])),sourceUnchanged:true,geometry:built.counts});
  built.buffers.length=0;
}
assert.equal(ownerRoads.size,9);
type Point=[number,number,number];
function path(points:Point[]){const cum=[0];for(let i=1;i<points.length;i++)cum.push(cum[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][2]-points[i-1][2]));const total=cum.at(-1)!;
  const at=(s:number)=>{let i=1;while(i<cum.length-1&&cum[i]<s)i++;const a=points[i-1],b=points[i],u=Math.max(0,Math.min(1,(s-cum[i-1])/(cum[i]-cum[i-1]||1)));return{x:a[0]+(b[0]-a[0])*u,y:a[1]+(b[1]-a[1])*u,z:a[2]+(b[2]-a[2])*u};};return{points,cum,total,at};}
function away(e:RoadEdge,node:string,metres:number){let pts=e.pts.map((p,i)=>[p[0],e.elev?.[i]??0,p[1]]as Point);if(e.to===node)pts.reverse();const p=path(pts),limit=Math.min(metres,p.total-1),last=p.at(limit);return[...pts.filter((_,i)=>p.cum[i]<limit),[last.x,last.y,last.z]as Point];}
const signed=(x:number)=>((x+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI,idle={allowReverse:false,throttle:0,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false};
function nearestPavement(oracle:EmittedPlayerGeometry,point:number[],feet:number){
  const triangles=new Set<any>();for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const t of oracle.road.get(`${Math.floor(point[0]/4)+i},${Math.floor(point[2]/4)+j}`)||[])triangles.add(t);
  let best:any=null;
  for(const t of triangles)for(const[a,b]of[[0,3],[3,6],[6,0]]){const p=t.p,dx=p[b]-p[a],dz=p[b+2]-p[a+2],u=Math.max(0,Math.min(1,((point[0]-p[a])*dx+(point[2]-p[a+2])*dz)/(dx*dx+dz*dz||1))),x=p[a]+dx*u,z=p[a+2]+dz*u,y=p[a+1]+(p[b+1]-p[a+1])*u,dist=Math.hypot(point[0]-x,point[2]-z);
    if(t.lift===null||Math.abs(y-t.lift-feet)>1.6)continue;if(!best||dist<best.distance)best={distance:dist,point:[x,y,z],roadId:t.roadId,tile:t.tile,triangle:p};}
  return best;
}
const capEvidence=transports.map((t:any)=>{const node=(levels.get(t.id)as any).node,pos=field[node][rawCounterpart?'before':'after'],oracle=oracles.get(t.id)as EmittedPlayerGeometry,seen=new Set<any>(),samples:any[]=[];
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const s of city.surfaceGrid.get(`${Math.floor(pos[0]/30)+i},${Math.floor(pos[1]/30)+j}`)||[]){const q=s.roadQuad;if(!q||seen.has(s)||q[2][0]!==q[3][0]||q[2][2]!==q[3][2]||Math.hypot(q[0][0]-pos[0],q[0][2]-pos[1])>5)continue;seen.add(s);
    const x=(q[0][0]+q[1][0]+q[2][0])/3,z=(q[0][2]+q[1][2]+q[2][2])/3,y=(q[0][1]+q[1][1]+q[2][1])/3,rendered=oracle.frame(x,z).nearestSupport(x,z,y);samples.push({point:[x,y,z],emittedSupport:rendered?.y??null,error:rendered?Math.abs(rendered.y-y):null});}
  return{id:t.id,node,nodePosition:pos,capTriangles:seen.size,samples};});
function drive(id:string,arm:string,node:string,points:Point[],hz:number,reverse:boolean){
  if(reverse)points=[...points].reverse();const route=path(points),start=route.at(1),ahead=route.at(2),actual=actualPlayer(city),p=actual.player,probe=actualPlayerContactProbe(p,oracles.get(id)as EmittedPlayerGeometry);
  let progress=1,frames=0,time=0,offRoad=0,solidFrames=0,maxError=0,stagnant=0,priorProgress=1;const wallWitnesses:any[]=[];
  try{
    p.place(start.x,start.z,Math.atan2(-(ahead.x-start.x),-(ahead.z-start.z)),start.y);probe.measure(0);
    while(progress<route.total-1&&frames<hz*35&&stagnant<hz*5){
      let error=Infinity,near=progress;for(let d=Math.max(0,progress-2);d<=Math.min(route.total,progress+8);d+=.1){const q=route.at(d),gap=Math.hypot(q.x-p.pos.x,q.z-p.pos.z);if(gap<error){error=gap;near=d;}}
      progress=Math.max(progress,near);maxError=Math.max(maxError,error);if(progress-priorProgress<.005)stagnant++;else stagnant=0;priorProgress=progress;
      const q=route.at(Math.min(route.total,progress+4.5)),yaw=Math.atan2(-(q.x-p.pos.x),-(q.z-p.pos.z)),nodePoint=field[node][rawCounterpart?'before':'after'];
      const limit=Math.hypot(p.pos.x-nodePoint[0],p.pos.z-nodePoint[1])<8?2.4:4;
      time+=1/hz;p.update(1/hz,{...idle,throttle:p.speed<limit?1:0,brake:p.speed>limit+.5?1:0,steer:Math.max(-1,Math.min(1,-signed(yaw-p.yaw)*3))},time);frames++;
      if(!p.onRoad)offRoad++;
      let solid=false;for(const along of[-1.25,0,1.25]){const point={x:p.pos.x+p.forward.x*along,z:p.pos.z+p.forward.z*along},bottom=p.pos.y-.4;
        if(collideWalls(city,point,{...point},1.15,bottom,p.pos.y+.8).hit>.02||collideBuildings(city,{...point},1.15,bottom,p.pos.y+.8)>.02)solid=true;}
      if(solid){solidFrames++;if(wallWitnesses.length<3)wallWitnesses.push({frame:frames,position:p.pos.toArray(),yaw:p.yaw,progress});}
      probe.measure(frames);
    }
    const contact=probe.result(),complete=progress>=route.total-1;
    const failures=[...(!complete?['ordinary drive did not cross connection']:[]),...(offRoad?['centre left finite road support']:[]),...(solidFrames?['real wall/building overlaps full body circles']:[]),...(contact.slabFrames?['actual visible body enters emitted road slab']:[]),...(contact.wheelFramesOutside1cm?['wheel contact exceeds1cm']:[]),...(contact.missingWheelFrames?['missing finite wheel pavement']:[]),...(contact.minTyreSupport!==null&&contact.minTyreSupport<-.01?['actual tyre penetrates support beyond1cm']:[]),...(p.airborne||p.glide||p.placementRevision!==1?['unexpected assistance']:[])];
    const missingWheelEvidence=contact.wheelWitnesses.flatMap((w:any)=>w.wheels.filter((q:any)=>q.support===null).map((q:any)=>({frame:w.frame,wheel:q.index,point:q.point,reachableGround:supportAt(city,q.point[0],q.point[2],w.playerMatrixWorld[13]-.55),nearestEmittedPavement:nearestPavement(oracles.get(id)as EmittedPlayerGeometry,q.point,w.playerMatrixWorld[13]-.55)})));
    return{id,arm,node,hz,reverse,metres:route.total,progress,complete,seconds:frames/hz,frames,offRoad,solidFrames,maxError,finalPosition:p.pos.toArray(),pathPoints:points,controller:{lookAhead:4.5,steerGain:3,cruiseSpeed:4,nearNodeSpeed:2.4,nearNodeRadius:8,sideApproach:20,coreDeparture:18},wallWitnesses,contact,missingWheelEvidence,failures};
  }finally{actual.dispose();}
}
console.log(JSON.stringify({stage:'built-prototype-tiles',tiles:tileReports.map(t=>t.tile),ownerRoads:ownerRoads.size}));
const results:any[]=[];
for(const t of transports){
  const node=(levels.get(t.id)as any).node,side=ownerRoads.get(t.id)!;
  for(const arm of roads.filter(e=>e.from===node||e.to===node)){
    const incoming=away(side,node,20).reverse(),outgoing=away(arm,node,18);assert.ok(Math.hypot(incoming.at(-1)![0]-outgoing[0][0],incoming.at(-1)![2]-outgoing[0][2])<1e-7,'actual tile/core endpoints coincide');
    const points=[...incoming,...outgoing.slice(1)];
    for(const hz of[30,60])for(const reverse of[false,true]){if(failureCasesOnly&&!(reverse&&(t.id==='6882abe6-c07_0'&&arm.id==='17390715-e3a_0'||t.id==='1bc95a46-c59_0'&&arm.id==='34a11925-bf1_0'&&hz===60)))continue;const r=drive(t.id,arm.id,node,points,hz,reverse);results.push(r);console.log(JSON.stringify({id:t.id,arm:arm.id,hz,reverse,complete:r.complete,progress:r.progress,failures:r.failures}));}
  }
}
const sourceHashes:Record<string,string>=process.env.ROAD_TILE_NODE_SOURCE_HASHES?JSON.parse(process.env.ROAD_TILE_NODE_SOURCE_HASHES):{};
const changedDuringRun=[...Object.keys(sourceHashes).filter(f=>sha(readFileSync(f))!==sourceHashes[f]),...(sha(readFileSync(modelFile))!==sha(modelBytes)?[modelFile]:[]),...(sha(readFileSync(supplementFile))!==sha(supplementBytes)?[supplementFile]:[])];
const report={measuredAt:new Date().toISOString(),scope:'Prototype side-street preflight only; held conditioned core and source-bound tile transport via public helpers, full actual colliders, normal Player updates; not final World or release acceptance',
  input:{model:modelFile,modelSHA256:sha(modelBytes),supplement:supplementFile,supplementSHA256:sha(supplementBytes)},options:{rawCounterpart,failureCasesOnly},sourceHashes,changedDuringRun,
  tiles:tileReports,capEvidence,geometry:Object.fromEntries([...oracles].map(([id,o])=>[id,(o as EmittedPlayerGeometry).counts])),results,cases:results.length,failedCases:results.filter(r=>r.failures.length).length,completedCases:results.filter(r=>r.complete).length};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,cases:report.cases,completed:report.completedCases,failed:report.failedCases,changedDuringRun}));
process.exitCode=report.failedCases||changedDuringRun.length?1:0;
