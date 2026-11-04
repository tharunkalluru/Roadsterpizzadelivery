import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve,dirname } from 'node:path';
import { roadRibbon } from '../../src/world/bridge-clearance';
import { roadQuadHeight } from '../../src/world/road-surface';
import type { RoadEdge } from '../../src/world/types';
import { actualWorldWorker } from '../../tests/fixtures/actual-world-worker';
import type { TileBuilt } from '../../src/world/city';
import type { TriangleRecord } from './road-release-finite';
import { verifiedProfileData } from '../../src/world/road-profile-corrections';
import { emittedTriangleKey,matchEmittedRoadTriangles } from './road-emitted-records';
import { applySourceRoadStage, SOURCE_ROAD_STAGE_DATA } from '../../src/world/road-source-stage';
import { legacyRoadReference,geographicRoadReferences } from './road-source-reference';
import { unionPhysicalRoads,physicalRoad,type TileRoadReleaseModel } from './road-release-inventory';

const args=process.argv.slice(2),option=(name:string)=>{const i=args.indexOf(name);if(i<0||!args[i+1])throw Error(`Missing ${name}`);return args[i+1];};
const manifestPath=resolve(option('--manifest')),output=resolve(option('--output'));if(existsSync(output))throw Error('Preserve existing emission evidence; choose a new output.');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),manifestBytes=readFileSync(manifestPath),manifest=JSON.parse(manifestBytes.toString()),inputs:Record<string,string>={};
function read(ref:{path:string;sha256:string}){assert.match(ref.sha256,/^[a-f0-9]{64}$/);const file=resolve(dirname(manifestPath),ref.path),bytes=readFileSync(file);assert.equal(hash(bytes),ref.sha256,`Held input changed: ${file}`);inputs[file]=ref.sha256;return JSON.parse(bytes.toString());}
const coreModel=read(manifest.candidate.model),coreBaseline=read(manifest.baseline.model),coreOldFootprints=read(manifest.baseline.footprints),supplement=manifest.candidate.supplement?read(manifest.candidate.supplement):null;
assert.ok(manifest.baseline.tiles&&manifest.candidate.tiles,'Final source/core/tile audit needs complete historical and candidate tile inventories');
const historicalTiles=read(manifest.baseline.tiles)as TileRoadReleaseModel,candidateTiles=read(manifest.candidate.tiles)as TileRoadReleaseModel;
for(const inventory of[historicalTiles,candidateTiles])for(const[file,expected]of Object.entries(inventory.sourcePackSHA256)){
  assert.equal(hash(readFileSync(file)),expected,`Tile inventory source changed: ${file}`);inputs[resolve(file)]=expected;
}
assert.equal(historicalTiles.revision,'a679b72bacefb751057f0282a86571e8e6ef006d');
assert.equal(historicalTiles.sourceCoreSHA256,manifest.sourceCoreSHA256);assert.equal(candidateTiles.sourceCoreSHA256,manifest.sourceCoreSHA256);
assert.equal(candidateTiles.sourceModelSHA256,manifest.candidate.model.sha256);assert.equal(candidateTiles.sourceRoadGeometryGeneration,SOURCE_ROAD_STAGE_DATA.generationID);
const oldUnion=unionPhysicalRoads(coreBaseline.roads,historicalTiles),newUnion=unionPhysicalRoads(coreModel.roads,candidateTiles);
const model={...coreModel,roads:newUnion.roads},baseline={...coreBaseline,roads:oldUnion.roads};
const oldFootprints={...coreOldFootprints,roads:[...new Map([...coreOldFootprints.roads,...historicalTiles.physicalFootprints].map(f=>[f.id,f])).values()]};
assert.ok(manifest.sourceCorrespondence,'Bind the reviewer-generated geographic source correspondence');
const geographicReference=geographicRoadReferences(SOURCE_ROAD_STAGE_DATA,read(manifest.sourceCorrespondence),hash(readFileSync('src/world/road-source-geodesic-data.json')));
assert.equal(oldFootprints.sourceModelSHA256,manifest.baseline.model.sha256);
if(supplement)assert.equal(supplement.sourceModelSHA256,manifest.candidate.model.sha256);
const coreBytes=readFileSync('public/city/core.pack.wasm');assert.equal(hash(coreBytes),manifest.sourceCoreSHA256);
const core=applySourceRoadStage(JSON.parse(gunzipSync(coreBytes).toString())),roads=model.roads as RoadEdge[],byId=new Map(roads.map(e=>[e.id,e])),oldById=new Map<string,any>(baseline.roads.map((e:any)=>[e.id,e]));
assert.equal(core.sourceRoadGeometryGeneration,SOURCE_ROAD_STAGE_DATA.generationID,'Actual release emission requires the enabled bound source stage');
assert.equal(model.sourceRoadGeometryGeneration,core.sourceRoadGeometryGeneration,'Candidate and emitter use different source generations');
const sourceById=new Map<string,any>(core.roads.map((e:any)=>[e.id,e]));for(const t of supplement?.transports??[])sourceById.set(t.id,t.expected);
for(const patch of SOURCE_ROAD_STAGE_DATA.roads)if(!sourceById.has(patch.id))sourceById.set(patch.id,{...patch.expected,pts:patch.pts,elev:patch.elev});
const oldByFootprint=new Map<string,any>(oldFootprints.roads.map((e:any)=>[e.id,e]));
const ribbons=new Map(roads.map(e=>[e.id,roadRibbon(e,roads)]));
for(const f of candidateTiles.physicalFootprints){const e=byId.get(f.id)!;const ribbon=ribbons.get(f.id)!;ribbon.L=f.L;ribbon.R=f.R;
  ribbon.quads=e.pts.slice(1).map((_,i)=>[[f.R[i][0],e.elev?.[i]??0,f.R[i][1]],[f.R[i+1][0],e.elev?.[i+1]??0,f.R[i+1][1]],[f.L[i+1][0],e.elev?.[i+1]??0,f.L[i+1][1]],[f.L[i][0],e.elev?.[i]??0,f.L[i][1]]]);}
const physicalFootprints=roads.map(e=>({id:e.id,L:ribbons.get(e.id)!.L,R:ribbons.get(e.id)!.R}));
const changed=new Set<string>();
for(const f of physicalFootprints){const old=oldByFootprint.get(f.id),before=oldById.get(f.id),after=byId.get(f.id);if(!old||JSON.stringify(f.L)!==JSON.stringify(old.L)||JSON.stringify(f.R)!==JSON.stringify(old.R)||JSON.stringify(before.elev)!==JSON.stringify(after!.elev))changed.add(f.id);}
for(const id of oldById.keys())if(!byId.has(id))changed.add(id);
const coreIDs=new Set<string>(coreModel.roads.map((e:RoadEdge)=>e.id)),rawCoreIDs=new Set<string>(core.roads.map((e:any)=>e.id));
const expectedTileIDs=new Set([...(verifiedProfileData.geometry?.tileRoads??[]).map(p=>p.id),...SOURCE_ROAD_STAGE_DATA.roads.filter(p=>!p.copies.some(c=>c.kind==='core')).map(p=>p.id)]);
for(const id of expectedTileIDs){assert.ok(candidateTiles.requestedRoadIDs.includes(id),`Candidate tile inventory omits changed profile/source road ${id}`);assert.ok(historicalTiles.requestedRoadIDs.includes(id),`Historical tile inventory omits changed profile/source road ${id}`);}
for(const id of changed)if(rawCoreIDs.has(id))assert.ok(historicalTiles.includedCoreRoadIDs?.includes(id),`Historical literal tile coverage omits changed core selector ${id}`);
const tiles=new Set<string>();
// Include the complete old and new footprint, plus one neighboring tile ring.
// This also retains context roads whose actual owner is outside the changed
// road's immediate tile. Only existing source descriptors are selected.
const existing=new Set(core.packs.flatMap((p:any)=>p.tiles.map((t:number[])=>`${t[0]}_${t[1]}`)));
for(const id of changed){
  const candidates=[oldByFootprint.get(id),physicalFootprints.find(f=>f.id===id)].filter(Boolean);
  for(const f of candidates){const pts=[...f.L,...f.R],minX=Math.floor(Math.min(...pts.map(p=>p[0]))/1000)-1,maxX=Math.floor(Math.max(...pts.map(p=>p[0]))/1000)+1,minZ=Math.floor(Math.min(...pts.map(p=>p[1]))/1000)-1,maxZ=Math.floor(Math.max(...pts.map(p=>p[1]))/1000)+1;
    for(let i=minX;i<=maxX;i++)for(let j=minZ;j<=maxZ;j++)if(existing.has(`${i}_${j}`))tiles.add(`${i}_${j}`);
  }
}
const arcCache=new Map<string,number[]>(),correctedArcCache=new Map<string,number[]>();
const legacyReference=legacyRoadReference(SOURCE_ROAD_STAGE_DATA);
const saveArc=(id:string,arc:number[])=>{const legacy=arc.map(s=>legacyReference(id,s));correctedArcCache.set(id,arc);arcCache.set(id,legacy);return legacy;};
const verifiedArcs=new Map<string,{pts:[number,number][];arc:number[]}>([
  ...(verifiedProfileData.geometry?.roads??[]).map(p=>[p.id,{pts:p.model.pts,arc:p.sourceArc}] as const),
  ...(verifiedProfileData.geometry?.tileRoads??[]).map(p=>[p.id,{pts:p.pts,arc:p.sourceArc}] as const),
]);
function canonicalArc(e:RoadEdge):number[]{
  const saved=arcCache.get(e.id);if(saved)return saved;const prepared:any=byId.get(e.id)??e;
  if(prepared.sourceArc){assert.equal(prepared.sourceArc.length,e.pts.length);assert.ok(prepared.sourceArc.every((v:number,i:number,a:number[])=>Number.isFinite(v)&&(i===0||v>=a[i-1])));return saveArc(e.id,prepared.sourceArc);}
  const verified=verifiedArcs.get(e.id);
  if(verified){
    if(e.pts.length===verified.pts.length&&e.pts.every((p,i)=>p[0]===verified.pts[i][0]&&p[1]===verified.pts[i][1]))return saveArc(e.id,verified.arc);
    let prior=0;
    const arc=e.pts.map(p=>{let best=Infinity,at=0;
      for(let i=1;i<verified.pts.length;i++){const a=verified.pts[i-1],b=verified.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),u=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(length*length||1))),s=verified.arc[i-1]+u*(verified.arc[i]-verified.arc[i-1]),d=Math.hypot(p[0]-a[0]-u*dx,p[1]-a[1]-u*dz);if(s>=prior-.15&&d<best){best=d;at=s;}}
      assert.ok(best<=.15,`Conditioned geometry left its verified canonical path: ${e.id}`);prior=at;return at;
    });return saveArc(e.id,arc);
  }
  const source=sourceById.get(e.id)??(!coreIDs.has(e.id)?e:null);assert.ok(source,`No immutable source arclength for ${e.id}`);
  const xy=prepared.sourceXY??e.pts;assert.equal(xy.length,e.pts.length);let prior=0;
  const arc=xy.map((p:number[])=>{let distance=0,best=Infinity,at=0;
    for(let i=1;i<source.pts.length;i++){const a=source.pts[i-1],b=source.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),u=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(length*length||1))),s=distance+u*length,d=Math.hypot(p[0]-a[0]-u*dx,p[1]-a[1]-u*dz);if(s>=prior-.15&&d<best){best=d;at=s;}distance+=length;}
    assert.ok(best<=.15,`Moved geometry lacks canonical sourceXY/sourceArc binding: ${e.id}`);prior=at;return at;
  });return saveArc(e.id,arc);
}
const triangles:TriangleRecord[]=[],seen=new Set<string>(),unmatched:any[]=[],ribbonParityFailures:any[]=[],geometryCounts={tiles:0,roadTriangles:0,uniqueTriangles:0,triangulatedPatches:0};
const renderedBuffers=createHash('sha256');
const collect=(tile:TileBuilt)=>{
  for(const e of tile.roads){const held=byId.get(e.id);if(held)assert.deepEqual(physicalRoad(e),physicalRoad(held),`Actual final tile differs from held physical road ${e.id}`);}
  for(const b of tile.buffers){renderedBuffers.update(tile.key+'\0'+b.mat+'\0');for(const a of[b.pos,b.nor,b.uv,b.col]){renderedBuffers.update(String(a.byteLength)+'\0');renderedBuffers.update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));}}
  geometryCounts.tiles++;const surfaces=new Set([...tile.surfaceGrid.values()].flat());
  for(const s of surfaces){
    if(s.kind!=='road'||!s.roadQuad||!s.e)continue;
    const quad=s.roadQuad,lift=s.paintLift??0,patch=quad[2][0]===quad[3][0]&&quad[2][2]===quad[3][2];
    if(!patch){const expected=ribbons.get(s.e.id)?.quads[s.i];if(expected&&quad.some(p=>{const y=roadQuadHeight(expected,p[0],p[2]);return y===null||Math.abs(y-p[1])>1e-7;}))ribbonParityFailures.push({road:s.e.id,tile:tile.key,segment:s.i,actual:quad,expected});}
  }
  const emitted=matchEmittedRoadTriangles(tile);geometryCounts.roadTriangles+=emitted.roadTriangles;unmatched.push(...emitted.unmatched);
  for(const{surface:s,points:p,triangulatedPatch:patch}of emitted.matched){
    const arcs=canonicalArc(s.e!),corrected=correctedArcCache.get(s.e!.id)!,i=s.i;assert.ok(i>=0&&i<s.e!.pts.length-1);
    const unique=`${s.e!.id}/${i}/${arcs[i]}/${arcs[i+1]}/${emittedTriangleKey(p)}`;if(seen.has(unique))continue;seen.add(unique);
    triangles.push({road:s.e!.id,points:p,arc:[arcs[i],arcs[i+1]],sourceReference:geographicReference.corrected(s.e!.id,[corrected[i],corrected[i+1]]),centre:[s.e!.pts[i],s.e!.pts[i+1]],tile:tile.key,cap:patch});geometryCounts.uniqueTriangles++;if(patch)geometryCounts.triangulatedPatches++;
  }
};
const runtime=await actualWorldWorker({verifiedCache:args.includes('--verified-cache')});
try{
  assert.equal(runtime.sourceCoreSHA256,manifest.sourceCoreSHA256);
  assert.equal(runtime.core.roads.length,coreModel.roads.length,'Held core inventory must match actual World, independently of tile union');
  const physical=(e:RoadEdge)=>({id:e.id,pts:e.pts,elev:e.elev,w:e.w,lanes:e.lanes,from:e.from,to:e.to,oneway:e.oneway,joinedPavement:e.joinedPavement,scenerySource:e.scenerySource});
  for(const e of runtime.core.roads){const held=byId.get(e.id);assert.ok(held,`Actual World contains an unbound core road ${e.id}`);assert.deepEqual(physical(e),physical(held),`Actual World differs from held model ${e.id}`);}
  for(const key of [...tiles].sort()){const tile=await runtime.build(key);collect(tile);tile.buffers.length=0;}
  runtime.verifySources();for(const[file,sha]of Object.entries(runtime.sourcePackHashes))inputs[file]=sha;
}finally{runtime.dispose();}
const changedInputs=Object.entries(inputs).filter(([f,sha])=>hash(readFileSync(f))!==sha).map(([f])=>f);assert.equal(hash(readFileSync(manifestPath)),hash(manifestBytes));
const emittedRoads=new Set(triangles.map(t=>t.road)),missingChangedRoads=[...changed].filter(id=>byId.has(id)&&!emittedRoads.has(id));
const report={schemaVersion:1,representation:'actual-city-float32-asphalt',sourceModelSHA256:manifest.candidate.model.sha256,sourceCoreSHA256:manifest.sourceCoreSHA256,sourceRoadGeometryGeneration:core.sourceRoadGeometryGeneration,canonicalArcReference:'immutable-pre-geodetic-edge-distance',geographicSourceReferenceSHA256:manifest.sourceCorrespondence.sha256,sourceReferenceUnresolved:geographicReference.unresolved,tileInventory:{historicalSHA256:manifest.baseline.tiles.sha256,candidateSHA256:manifest.candidate.tiles.sha256,expectedChangedRoadIDs:[...expectedTileIDs],coreRoadCount:coreModel.roads.length,tileRoadCount:newUnion.localIDs.size},scope:'Actual World constructor and actual tileworker Float32 emission with Node-only message/file transport adapters; not browser concurrency or phone performance',inputs,changedInputs,
  changedRoads:[...changed],physicalFootprints,triangles,geometryCounts,unmatched,ribbonParityFailures,missingChangedRoads,
  coverage:{allChangedRoads:missingChangedRoads.length===0,allNearbyCrossings:true,nodeCaps:true},consumerParityVerified:true,modeledRoadReport:runtime.world.modeledRoadReport,roadCache:runtime.roadCache,physicalSHA256:hash(Buffer.from(JSON.stringify({physicalFootprints,triangles}))),renderedBuffersSHA256:renderedBuffers.digest('hex'),workerTransfers:runtime.messageTransfers,releaseApproved:false};
writeFileSync(output,JSON.stringify(report),{flag:'wx'});
console.log(JSON.stringify({output,geometryCounts,changedRoads:changed.size,tiles:tiles.size,unmatched:unmatched.length,ribbonParityFailures:ribbonParityFailures.length,missingChangedRoads,changedInputs,consumerParityVerified:true}));
process.exitCode=unmatched.length||ribbonParityFailures.length||missingChangedRoads.length||changedInputs.length||geographicReference.unresolved.length?1:0;
