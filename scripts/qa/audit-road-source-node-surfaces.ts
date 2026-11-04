import assert from 'node:assert/strict';
import{readFileSync,writeFileSync,existsSync}from'node:fs';
import{createHash}from'node:crypto';
import{gunzipSync}from'node:zlib';
import{resolve,dirname}from'node:path';
import{actualWorldWorker}from'../../tests/fixtures/actual-world-worker';
import{applySourceRoadStage,SOURCE_ROAD_STAGE_MANIFEST,SOURCE_ROAD_STAGE_DATA}from'../../src/world/road-source-stage';
import{rebaseRoadStops}from'../../src/world/road-grades';
import{matchEmittedRoadTriangles}from'./road-emitted-records';
import{triangleHeight,overlap,polygonArea,type TriangleRecord}from'./road-release-finite';
import{physicalRoad}from'./road-release-inventory';
import type{RoadEdge,CoreData}from'../../src/world/types';

const option=(name:string)=>{const i=process.argv.indexOf(name);assert.ok(i>=0&&process.argv[i+1],`Missing ${name}`);return process.argv[i+1];};
const manifestPath=resolve(option('--manifest')),assessmentPath=resolve(option('--assessment')),output=resolve(option('--output'));
assert.ok(!existsSync(output),'Preserve diagnostic evidence; use a new output');
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),inputs:Record<string,string>={};
const manifestBytes=readFileSync(manifestPath),manifest=JSON.parse(manifestBytes.toString());inputs[manifestPath]=sha(manifestBytes);
function read(ref:{path:string;sha256:string}){const file=resolve(dirname(manifestPath),ref.path),bytes=readFileSync(file);assert.equal(sha(bytes),ref.sha256);inputs[file]=ref.sha256;return JSON.parse(bytes.toString());}
const pre=read(manifest.preconditioning),ordinary=read(manifest.model),generic=read(manifest.generic),supplement=read(manifest.tileSupplement),sourceData=read(manifest.sourceData);
assert.equal(sourceData.generationID,SOURCE_ROAD_STAGE_DATA.generationID);assert.equal(manifest.sourceData.sha256,sha(readFileSync('src/world/road-source-geodesic-data.json')));
const assessmentBytes=readFileSync(assessmentPath);assert.equal(sha(assessmentBytes),option('--assessment-sha'));inputs[assessmentPath]=sha(assessmentBytes);
const assessment=JSON.parse(assessmentBytes.toString()),mathematical=assessment.results.find((r:any)=>r.summary.grade===.065);assert.ok(mathematical);
const finiteOverlap=process.argv.includes('--finite-overlap'),onlyAt=process.argv.indexOf('--only-nodes');
let onlyNodes:Set<string>|undefined;if(onlyAt>=0){const file=resolve(process.argv[onlyAt+1]),bytes=readFileSync(file);inputs[file]=sha(bytes);const ids=JSON.parse(bytes.toString());assert.ok(Array.isArray(ids)&&ids.every(id=>typeof id==='string'));onlyNodes=new Set(ids);}
const coreBytes=readFileSync('public/city/core.pack.wasm');assert.equal(sha(coreBytes),manifest.sourceCoreSHA256);
const core=applySourceRoadStage(JSON.parse(gunzipSync(coreBytes).toString())as CoreData,{...SOURCE_ROAD_STAGE_MANIFEST,enabled:true});
rebaseRoadStops(core,core.roads,generic.roads);rebaseRoadStops(core,generic.roads,pre.roads,new Map(pre.roads.filter((e:any)=>e.sourceArc).map((e:any)=>[e.id,e.sourceArc])));
core.roads=pre.roads;core.nodes={...core.nodes};
for(const[id,node]of Object.entries(pre.endpointDisplacements)as[string,any][]){assert.ok(Math.hypot(core.nodes[id][0]-node.before[0],core.nodes[id][1]-node.before[1])<1e-7);core.nodes[id]=[...node.after];}
const queries=new Map<string,any>();
for(const node of mathematical.sourceCorrectedNodes)queries.set(node.node,{node:node.node,sourceCorrected:true,point:node.correctedSourceXY,mathematical:node,negativeSeams:[],samples:new Map<string,any[]>()});
for(const seam of mathematical.rows.filter((r:any)=>r.category==='protected-real-underpass')){
  const query=queries.get(seam.node)??{node:seam.node,sourceCorrected:false,point:core.nodes[seam.node],mathematical:null,negativeSeams:[],samples:new Map<string,any[]>()};query.negativeSeams.push(seam);queries.set(seam.node,query);
}
if(onlyNodes)for(const id of queries.keys())if(!onlyNodes.has(id))queries.delete(id);
for(const query of queries.values())query.literalTriangles=new Map<string,any>();
const transported=new Set(supplement.transports.map((p:any)=>p.id)),runtime=await actualWorldWorker({reuseCore:core,allowInactive:true});
const parityFailures:any[]=[],unmatched:any[]=[],terrain:any[]=[],tileSummary:any[]=[];
let failure:string|undefined;
try{
  const held=new Map<string,RoadEdge>(ordinary.roads.map((e:RoadEdge)=>[e.id,e]));assert.equal(runtime.core.roads.length,held.size);
  for(const road of runtime.core.roads){const expected=held.get(road.id);if(!expected||JSON.stringify(physicalRoad(road))!==JSON.stringify(physicalRoad(expected)))parityFailures.push({id:road.id});}
  assert.deepEqual(parityFailures,[],'Diagnostic World must exactly reproduce the held ordinary core before inspecting any surface');
  const incident=new Map<string,RoadEdge[]>();for(const road of runtime.core.roads)for(const node of[road.from,road.to])if(node)(incident.get(node)??incident.set(node,[]).get(node)!).push(road);
  const tileQueries=new Map<string,any[]>();
  for(const query of queries.values()){
    query.expectedRoadIDs=[...new Set([...(incident.get(query.node)??[]).map(e=>e.id),...(query.mathematical?.tileLevels??[]).map((e:any)=>e.id),...query.negativeSeams.map((e:any)=>e.id)])];
    if(pre.endpointDisplacements[query.node]||query.expectedRoadIDs.some((id:string)=>transported.has(id))){query.unresolvedReason='Prototype inferred tile/node transports are deliberately inactive; XY cannot establish a Y defect';continue;}
    assert.ok(query.point?.length===2,`No bound source point ${query.node}`);
    for(const dx of[-15,15])for(const dz of[-15,15]){const key=`${Math.floor((query.point[0]+dx)/1000)}_${Math.floor((query.point[1]+dz)/1000)}`;if(runtime.world.packOf.has(key)){const list=tileQueries.get(key)??[];if(!list.includes(query))list.push(query);tileQueries.set(key,list);}}
  }
  for(const[key,localQueries]of tileQueries){
    const tile=await runtime.build(key),emitted=matchEmittedRoadTriangles(tile);unmatched.push(...emitted.unmatched);let samples=0;
    for(const{surface,points}of emitted.matched){const road=surface.e!;
      for(const query of localQueries){if(!query.expectedRoadIDs.includes(road.id))continue;
        if(finiteOverlap){const xs=points.map(p=>p[0]),zs=points.map(p=>p[2]);if(Math.max(...xs)>=query.point[0]-8&&Math.min(...xs)<=query.point[0]+8&&Math.max(...zs)>=query.point[1]-8&&Math.min(...zs)<=query.point[1]+8){
          const token=road.id+'/'+surface.i+'/'+points.map(p=>p.join(',')).sort().join('|');query.literalTriangles.set(token,{road:road.id,points,paintLift:surface.paintLift??0,tile:key,segment:surface.i});}}
        const start=road.from===query.node,end=road.to===query.node;if(!start&&!end)continue;
        const at=start?0:road.pts.length-1,next=start?1:road.pts.length-2,p=road.pts[at],q=road.pts[next];
        if(Math.hypot(p[0]-query.point[0],p[1]-query.point[1])>.003){query.unresolvedReason='Actual tile endpoint XY does not bind the inspected source node';continue;}
        if(surface.i!==(start?0:road.pts.length-2))continue;
        const length=Math.hypot(q[0]-p[0],q[1]-p[1]),step=Math.min(.02,length/4),x=p[0]+(q[0]-p[0])*step/length,z=p[1]+(q[1]-p[1])*step/length;
        const triangle={points}as TriangleRecord,inside=triangleHeight(triangle,x,z);if(inside===null)continue;
        const[a,b,c]=points,dx=b[0]-a[0],dz=b[2]-a[2],ex=c[0]-a[0],ez=c[2]-a[2],det=dx*ez-dz*ex;if(Math.abs(det)<1e-10)continue;
        const u=((p[0]-a[0])*ez-(p[1]-a[2])*ex)/det,v=(dx*(p[1]-a[2])-dz*(p[0]-a[0]))/det,asphalt=a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]),support=asphalt-(surface.paintLift??0);
        const record={road:road.id,tile:key,segment:surface.i,endpoint:p,probe:[x,z],probeDistance:step,actualAsphaltAtEndpointPlane:asphalt,actualSupportAtEndpointPlane:support,paintLift:surface.paintLift??0,metadataEndpointY:road.elev?.[at]??0,points};
        const entries=query.samples.get(road.id)??[];if(!entries.some((e:any)=>Math.abs(e.actualSupportAtEndpointPlane-support)<1e-6))entries.push(record);query.samples.set(road.id,entries);samples++;
      }
    }
    for(const surface of new Set([...tile.surfaceGrid.values()].flat()))if(surface.kind!=='road')for(const query of localQueries){if(Math.hypot(surface.ax-query.point[0],surface.az-query.point[1])<15)terrain.push({node:query.node,tile:key,kind:surface.kind,road:surface.e?.id??null,ya:surface.ya,yb:surface.yb,ax:surface.ax,az:surface.az,bx:surface.bx,bz:surface.bz});}
    tileSummary.push({tile:key,queryNodes:localQueries.map(q=>q.node),roadTriangles:emitted.roadTriangles,samples});tile.buffers.length=0;
  }
  runtime.verifySources();for(const[file,hash]of Object.entries(runtime.sourcePackHashes))inputs[file]=hash;
}catch(error){failure=String((error as Error).stack??error);}finally{runtime.dispose();}
const results=[...queries.values()].map(query=>{
  const records=[...query.samples.entries()].map(([road,values]:[string,any[]])=>({road,values})),missing=query.expectedRoadIDs?.filter((id:string)=>!query.samples.has(id))??[];
  const heights=records.flatMap(r=>r.values.map(v=>v.actualSupportAtEndpointPlane)),gap=heights.length?Math.max(...heights)-Math.min(...heights):null;
  const ambiguous=records.filter(r=>Math.max(...r.values.map(v=>v.actualSupportAtEndpointPlane))-Math.min(...r.values.map(v=>v.actualSupportAtEndpointPlane))>.01).map(r=>r.road);
  const finiteOverlaps:any[]=[],literal=[...query.literalTriangles.values()];
  for(let i=0;i<literal.length;i++)for(let j=i+1;j<literal.length;j++){
    const a=literal[i],b=literal[j];if(a.road===b.road)continue;const polygon=overlap(a as TriangleRecord,b as TriangleRecord);if(polygon.length<3||polygonArea(polygon)<.025)continue;
    const point:[number,number]=[polygon.reduce((s,p)=>s+p[0],0)/polygon.length,polygon.reduce((s,p)=>s+p[1],0)/polygon.length];if(Math.hypot(point[0]-query.point[0],point[1]-query.point[1])>8)continue;
    const ay=triangleHeight(a as TriangleRecord,...point),by=triangleHeight(b as TriangleRecord,...point);if(ay===null||by===null)continue;
    const supportA=ay-a.paintLift,supportB=by-b.paintLift,gap=Math.abs(supportA-supportB);if(gap<=.01)continue;
    if(finiteOverlaps.length<30)finiteOverlaps.push({roads:[a.road,b.road],point,polygon,area:polygonArea(polygon),support:[supportA,supportB],supportGap:gap,asphalt:[ay,by],triangles:[a,b]});
  }
  return{...query,literalTriangles:undefined,samples:records,finiteOverlaps,missingRoads:missing,ambiguousRoads:ambiguous,actualSupportGap:gap,classification:query.unresolvedReason||missing.length||ambiguous.length?'unresolved':gap!==null&&gap>.01?'actual-emitted-support-seam':'mathematical-endpoint-gap-not-present-in-emitted-support'};
});
const changedInputs=Object.entries(inputs).filter(([file,hash])=>sha(readFileSync(file))!==hash).map(([file])=>file);
const report={schemaVersion:1,scope:'DIAGNOSTIC prototype actual World/worker ordinary surfaces only. Source stage explicitly normalized in Node; inferred tile/node overlay and final LP remain inactive. Optional finite overlap preserves actual distinct XY and the strict point-binding classification. No terrain/underpass change, full-car traversal, final acceptance or publication is implied.',finiteOverlap,manifestSHA256:sha(manifestBytes),ordinaryModelSHA256:manifest.model.sha256,sourceRoadGeometryGeneration:core.sourceRoadGeometryGeneration,sourceFlagActuallyEnabled:SOURCE_ROAD_STAGE_MANIFEST.enabled,explicitDiagnosticSourceOverride:true,modeledRoadReport:runtime.world.modeledRoadReport,parityFailures,failure,inputs,changedInputs,tileSummary,unmatched,terrain,results,
  summary:{queries:results.length,sourceCorrectedNodes:results.filter(r=>r.sourceCorrected).length,negativeSeams:results.reduce((s,r)=>s+r.negativeSeams.length,0),actualEmittedSeams:results.filter(r=>r.classification==='actual-emitted-support-seam').length,mathematicalOnly:results.filter(r=>r.classification==='mathematical-endpoint-gap-not-present-in-emitted-support').length,unresolved:results.filter(r=>r.classification==='unresolved').length,queriesWithActualFiniteOverlapGap:results.filter(r=>r.finiteOverlaps.length>0).length},releaseApproved:false};
writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report.summary,parityFailures:parityFailures.length,unmatched:unmatched.length,failure,changedInputs,releaseApproved:false}));
assert.ok(!failure&&parityFailures.length===0&&unmatched.length===0&&changedInputs.length===0,'Diagnostic implementation/source/ordinary parity is not valid');
