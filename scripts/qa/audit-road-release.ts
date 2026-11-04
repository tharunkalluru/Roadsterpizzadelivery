import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { FiniteIndex, auditFinite, type TriangleRecord, type ApronFragment } from './road-release-finite';
import { applySourceRoadStage, SOURCE_ROAD_STAGE_DATA } from '../../src/world/road-source-stage';
import { geographicRoadReferences } from './road-source-reference';
import { unionPhysicalRoads,type TileRoadReleaseModel } from './road-release-inventory';

interface BoundFile { path:string; sha256:string }
interface Manifest {
  version:1; sourceCoreSHA256:string;
  baseline:{model:BoundFile;footprints:BoundFile;provenance:BoundFile;tiles:BoundFile};
  candidate:{model:BoundFile;emitted:BoundFile;emittedReceipt:BoundFile;tiles:BoundFile};
  sourceCorrespondence:BoundFile;
  aprons?:BoundFile;
  references?:Record<string,BoundFile>;
}
const args=process.argv.slice(2),option=(name:string)=>{const i=args.indexOf(name);if(i<0||!args[i+1])throw Error(`Missing ${name}`);return args[i+1];};
const manifestPath=resolve(option('--manifest')),output=resolve(option('--output'));
if(existsSync(output))throw Error('Preserve existing audit evidence; choose a new output filename.');
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex'),manifestBytes=readFileSync(manifestPath),manifest=JSON.parse(manifestBytes.toString()) as Manifest;
assert.equal(manifest.version,1);
assert.match(manifest.sourceCoreSHA256,/^[a-f0-9]{64}$/);
const inputs:Record<string,string>={};
function read<T=any>(ref:BoundFile):T {
  assert.match(ref.sha256,/^[a-f0-9]{64}$/);const path=resolve(dirname(manifestPath),ref.path),bytes=readFileSync(path);
  assert.equal(sha(bytes),ref.sha256,`Frozen artifact changed: ${path}`);inputs[path]=ref.sha256;return JSON.parse(bytes.toString());
}
const baselineCore=read(manifest.baseline.model),coreFootprints=read(manifest.baseline.footprints),provenance=read(manifest.baseline.provenance);
assert.ok(manifest.baseline.tiles&&manifest.candidate.tiles,'Actual historical and candidate tile inventories are required');
const historicalTiles=read(manifest.baseline.tiles)as TileRoadReleaseModel,candidateTiles=read(manifest.candidate.tiles)as TileRoadReleaseModel;
for(const inventory of[historicalTiles,candidateTiles])for(const[file,expected]of Object.entries(inventory.sourcePackSHA256)){
  assert.equal(sha(readFileSync(file)),expected,`Tile inventory source changed: ${file}`);inputs[resolve(file)]=expected;
}
const historicalProof=historicalTiles as TileRoadReleaseModel&{sourceFiles:Record<string,string>;inputs:Record<string,string>;generatorSHA256:string;observer:{path:string;sha256:string}};
assert.ok(Object.keys(historicalProof.sourceFiles??{}).length>5,'Historical tile build must bind its imported old source modules');
for(const[file,expected]of Object.entries(historicalProof.sourceFiles)){
  assert.ok(file.startsWith('src/')&&!file.includes('..'));assert.equal(sha(execFileSync('git',['show',`${historicalTiles.revision}:${file}`],{maxBuffer:64*1024*1024})),expected,`Historical tile implementation changed: ${file}`);
}
for(const[file,expected]of Object.entries(historicalProof.inputs)){assert.equal(sha(readFileSync(file)),expected,`Historical tile input changed: ${file}`);inputs[file]=expected;}
assert.equal(historicalProof.generatorSHA256,sha(readFileSync('scripts/export-historical-tile-road-model.mjs')));
assert.equal(historicalProof.observer.sha256,sha(readFileSync(historicalProof.observer.path)));
assert.equal(historicalTiles.revision,'a679b72bacefb751057f0282a86571e8e6ef006d');
assert.equal(historicalTiles.sourceCoreSHA256,manifest.sourceCoreSHA256);assert.equal(candidateTiles.sourceCoreSHA256,manifest.sourceCoreSHA256);
const historicalUnion=unionPhysicalRoads(baselineCore.roads,historicalTiles);
const baseline={...baselineCore,roads:historicalUnion.roads},footprints={...coreFootprints,roads:[...new Map([...coreFootprints.roads,...historicalTiles.physicalFootprints].map(f=>[f.id,f])).values()]};
assert.equal(footprints.sourceModelSHA256,manifest.baseline.model.sha256,'Historical L/R must bind this exact historical World, not a grades-only or hybrid export.');
assert.equal(provenance.outputSHA256,manifest.baseline.model.sha256);assert.equal(provenance.footprintSHA256,manifest.baseline.footprints.sha256);
assert.equal(provenance.stage,'world');assert.equal(provenance.sourceCoreSHA256,manifest.sourceCoreSHA256);
assert.equal(provenance.revision,'a679b72bacefb751057f0282a86571e8e6ef006d','The frozen asphalt-film table is specific to the reviewed a679 reference.');
assert.ok(Object.keys(provenance.sourceFiles??{}).length>5,'Historical exporter must bind all imported historical source modules.');
const candidateCore=read(manifest.candidate.model),emitted=read(manifest.candidate.emitted),candidateUnion=unionPhysicalRoads(candidateCore.roads,candidateTiles);
const candidate={...candidateCore,roads:candidateUnion.roads};
assert.equal(candidateTiles.sourceModelSHA256,manifest.candidate.model.sha256);assert.equal(candidateTiles.sourceRoadGeometryGeneration,candidate.sourceRoadGeometryGeneration);
assert.equal(emitted.tileInventory?.historicalSHA256,manifest.baseline.tiles.sha256);assert.equal(emitted.tileInventory?.candidateSHA256,manifest.candidate.tiles.sha256);
const geographicReference=geographicRoadReferences(SOURCE_ROAD_STAGE_DATA,read(manifest.sourceCorrespondence),sha(readFileSync('src/world/road-source-geodesic-data.json')));
const receipt=read(manifest.candidate.emittedReceipt);
assert.equal(receipt.outputSHA256,manifest.candidate.emitted.sha256);assert.equal(receipt.entry,'export-road-release-emitted.ts');assert.equal(receipt.exitCode,0);assert.equal(receipt.implementationStable,true);
for(const[file,expected]of Object.entries(receipt.sourceInputs??{})){const path=resolve(file);assert.equal(sha(readFileSync(path)),expected,`Emitter implementation no longer matches held evidence: ${path}`);inputs[path]=expected as string;}
assert.equal(emitted.schemaVersion,1);assert.equal(emitted.representation,'actual-city-float32-asphalt');
assert.equal(emitted.consumerParityVerified,true);assert.equal(emitted.modeledRoadReport?.active,true,'The actual World overlay must be active');
assert.equal(emitted.sourceModelSHA256,manifest.candidate.model.sha256);assert.equal(emitted.sourceCoreSHA256,manifest.sourceCoreSHA256);
assert.equal(emitted.canonicalArcReference,'immutable-pre-geodetic-edge-distance','Candidate source distances must use the same immutable reference as historical triangles.');
assert.equal(candidate.sourceRoadGeometryGeneration,SOURCE_ROAD_STAGE_DATA.generationID);
assert.equal(emitted.sourceRoadGeometryGeneration,candidate.sourceRoadGeometryGeneration);
assert.equal(emitted.geographicSourceReferenceSHA256,manifest.sourceCorrespondence.sha256);
assert.deepEqual(emitted.sourceReferenceUnresolved,[],'Unbound source correspondence remains a release blocker');
assert.deepEqual(geographicReference.unresolved,[]);
assert.ok(Array.isArray(emitted.triangles)&&emitted.triangles.length,'Actual emitted triangle export is required.');
assert.ok(emitted.triangles.every((t:TriangleRecord)=>t.points.flat().every(v=>Number.isFinite(v)&&Object.is(v,Math.fround(v)))),'Candidate coordinates must retain their actual Float32 representation');
assert.ok(emitted.coverage?.allChangedRoads&&emitted.coverage?.allNearbyCrossings&&emitted.coverage?.nodeCaps,'Emitter coverage must include changed roads, adjacent crossings and real node caps.');
const oldById=new Map<string,any>(baseline.roads.map((e:any)=>[e.id,e])),newById=new Map<string,any>(candidate.roads.map((e:any)=>[e.id,e]));
// Historical L/R identity remains frozen. Actual a679 tile Float32 triangles,
// including their actual asphalt films and node caps, provide physical heights.
const historical:TriangleRecord[]=[],frozenById=new Map<string,any>();
for(const f of footprints.roads){
  const e=oldById.get(f.id);assert.ok(e,`Historical footprint has no road: ${f.id}`);assert.equal(f.L.length,e.pts.length);assert.equal(f.R.length,e.pts.length);frozenById.set(f.id,f);
}
assert.ok(historicalTiles.triangles?.length,'Literal historical a679 tile triangles/caps are required; reconstructed quads are not a substitute');
for(const triangle of historicalTiles.triangles!){
  assert.ok(oldById.has(triangle.road),`Historical triangle has an unknown source road ${triangle.road}`);
  assert.ok(triangle.points.flat().every(v=>Number.isFinite(v)&&Object.is(v,Math.fround(v))),'Historical coordinates must be literal emitted Float32 values');
  historical.push({...triangle,sourceReference:geographicReference.historical(triangle.road,triangle.arc)});
}
assert.equal(frozenById.size,oldById.size,'Historical footprint inventory must be complete.');
const changed=new Set<string>(emitted.changedRoads);
assert.ok(changed.size,'Explicit physically changed-road inventory is required.');
for(const id of changed)assert.ok(oldById.has(id)||newById.has(id),`Unknown changed road ${id}`);
const oldCoreIDs=new Set<string>(baselineCore.roads.map((e:RoadEdge)=>e.id)),newCoreIDs=new Set<string>(candidateCore.roads.map((e:RoadEdge)=>e.id));
for(const id of changed)if(oldCoreIDs.has(id)||newCoreIDs.has(id))assert.ok(historicalTiles.includedCoreRoadIDs?.includes(id),`Literal historical core selection is incomplete: ${id}`);
for(const id of emitted.tileInventory.expectedChangedRoadIDs){assert.ok(historicalTiles.requestedRoadIDs.includes(id),`Historical tile selection is incomplete: ${id}`);assert.ok(candidateTiles.requestedRoadIDs.includes(id),`Candidate tile selection is incomplete: ${id}`);}
assert.ok(Array.isArray(emitted.physicalFootprints),'Complete actual candidate physical boundaries are required to detect helper-only width changes.');
const candidateFootprints=new Map<string,any>(emitted.physicalFootprints.map((f:any)=>[f.id,f]));
assert.equal(candidateFootprints.size,newById.size,'Candidate footprint inventory must cover the full prepared model.');
for(const[id,e]of newById){
  const f=candidateFootprints.get(id),old=frozenById.get(id),oe=oldById.get(id);assert.ok(f,`No candidate physical footprint: ${id}`);
  assert.equal(f.L.length,e.pts.length);assert.equal(f.R.length,e.pts.length);
  if(!old||JSON.stringify(old.L)!==JSON.stringify(f.L)||JSON.stringify(old.R)!==JSON.stringify(f.R)||JSON.stringify(oe.elev)!==JSON.stringify(e.elev))assert.ok(changed.has(id),`Physical road change omitted from audit: ${id}`);
}
for(const id of oldById.keys())if(!newById.has(id))assert.ok(changed.has(id),`Removed physical road omitted from audit: ${id}`);
const emittedIds=new Set<string>(emitted.triangles.map((t:TriangleRecord)=>t.road));
for(const id of changed)if(newById.has(id))assert.ok(emittedIds.has(id)||emitted.coverage.nonAsphaltRoads?.includes(id),`Changed road absent from actual emitted geometry: ${id}`);
const fragments:ApronFragment[]=manifest.aprons?read(manifest.aprons).fragments:[];
const coreBytes=readFileSync('public/city/core.pack.wasm');assert.equal(sha(coreBytes),manifest.sourceCoreSHA256);
const core=applySourceRoadStage(JSON.parse(gunzipSync(coreBytes).toString())),sourceById=new Map<string,any>(core.roads.map((e:any)=>[e.id,e]));
assert.equal(core.sourceRoadGeometryGeneration,candidate.sourceRoadGeometryGeneration);
for(const f of fragments){
  assert.equal(f.proof.sourceCoreSHA256,manifest.sourceCoreSHA256,'Apron evidence core mismatch');
  assert.ok(f.proof.sourcePath.includes(f.roads[0])&&f.proof.sourcePath.includes(f.roads[1]),'An apron proof must include both actual source roads');
  assert.ok(manifest.references?.[f.proof.evidence],'Apron evidence must be a separately hash-bound reviewed artifact');read(manifest.references![f.proof.evidence]);
  let declaredNodeSeen=false;
  for(let i=1;i<f.proof.sourcePath.length;i++){
    const a=sourceById.get(f.proof.sourcePath[i-1]),b=sourceById.get(f.proof.sourcePath[i]);assert.ok(a&&b,'Apron proof references a missing source road');
    const node=[a.from,a.to].find(n=>n&&(b.from===n||b.to===n));assert.ok(node,'Apron proof must follow a continuous actual source-node chain');
    const p=a.from===node?a.pts[0]:a.pts.at(-1),q=b.from===node?b.pts[0]:b.pts.at(-1);assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])<=.15,'Source apron chain endpoints are not physically coincident');
    if(node===f.node)declaredNodeSeen=true;
  }
  assert.ok(declaredNodeSeen,'Declared apron node is absent from its actual source chain');
}
const report=auditFinite(new FiniteIndex(historical),new FiniteIndex(emitted.triangles),changed,fragments);
const changedInputs=Object.entries(inputs).filter(([path,hash])=>sha(readFileSync(path))!==hash).map(([path])=>path);
assert.equal(sha(readFileSync(manifestPath)),sha(manifestBytes),'Audit manifest changed during run.');
const result={schemaVersion:1,scope:'Independent finite structural comparison; actual candidate Float32 asphalt including caps, frozen historical widths; no native/device acceptance',manifestSHA256:sha(manifestBytes),inputs,changedInputs,
  baselineIdentity:manifest.baseline,candidateIdentity:manifest.candidate,triangleCounts:{historical:historical.length,candidate:emitted.triangles.length},...report,
  acceptance:{finiteRegressionGatePassed:report.failures.length===0&&changedInputs.length===0,coverageClassificationComplete:false,fullVehicleAndObstacleGatesComplete:false,releaseApproved:false}};
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,failures:report.failures.length,coverageChanges:report.coverageChanges.length,newCoverage:report.newCoverage.length,changedInputs,releaseApproved:false}));
process.exitCode=report.failures.length||changedInputs.length?1:0;
