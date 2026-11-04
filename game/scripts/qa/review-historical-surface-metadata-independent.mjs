import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),[candidatePath,expectedSHA,output]=process.argv.slice(2),inputs={},sha=b=>createHash('sha256').update(b).digest('hex');
if(!candidatePath||!expectedSHA||!output)throw Error('Provide NEW_ARTIFACT EXPECTED_SHA NEW_REPORT');
async function held(path,expected){const bytes=await readFile(path),hash=sha(bytes);if(expected&&hash!==expected)throw Error('Input SHA mismatch '+path);inputs[path]=hash;return JSON.parse(bytes);}
inputs[fileURLToPath(import.meta.url)]=sha(await readFile(fileURLToPath(import.meta.url)));
const oldPath='/tmp/road-historical-joint-487-tile-806-context-505-core-9413-v3.json',oldSHA='d746a980fcb73574f5759f779e487b68f7dac54794edaabd33f35ef6562ebd90';
const parent=await held(oldPath,oldSHA),fresh=await held(resolve(candidatePath),expectedSHA),meta=fresh.metadataExport;
assert.equal(fresh.sourceHistoricalTileModelSHA256,oldSHA);assert.equal(meta.sourceHistoricalTileModelSHA256,oldSHA);assert.equal(meta.schemaVersion,1);assert.equal(meta.releaseApproved,false);
const legacy=t=>{const{actualSurface,actualSurfaceBindings,...record}=t;return record;};
const newKeys=new Set(['metadataExport','sourceHistoricalTileModelSHA256']);
assert.deepEqual(Object.keys(fresh).filter(k=>!newKeys.has(k)),Object.keys(parent),'Legacy top-level key/order changed');
let fields=0;
for(const key of Object.keys(parent)){if(key==='triangles')continue;assert.equal(JSON.stringify(fresh[key]),JSON.stringify(parent[key]),'Legacy field changed '+key);fields++;}
assert.equal(fresh.triangles.length,parent.triangles.length);
const physical=new Map(fresh.roads.map(e=>[e.id,e])),derived=new Map(fresh.derivations.map(d=>[d.actualRoadID,d.sourceRoadID]));
const key=ps=>ps.map(p=>p.map(Math.fround).join(',')).sort().join('|');
function validate(t,s){
  assert.ok(s&&Number.isFinite(s.paintLift),'Missing/nonfinite literal paintLift');
  assert.ok(Array.isArray(s.structuralQuad)&&s.structuralQuad.length===4&&s.structuralQuad.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)),'Invalid structural quad');
  assert.equal(s.road,t.road);assert.equal(s.sourceRoad,derived.get(t.road)??t.road);assert.deepEqual(s.sourceArc,t.arc);assert.deepEqual(s.centre,t.centre);
  const e=physical.get(t.road);assert.ok(e&&Number.isInteger(s.segment)&&s.segment>=0&&s.segment<e.pts.length-1);assert.deepEqual(s.centre,[e.pts[s.segment],e.pts[s.segment+1]]);
  const q=s.structuralQuad.map(p=>[Math.fround(p[0]),Math.fround(p[1]+s.paintLift),Math.fround(p[2])]),actual=key(t.points);
  assert.ok(key([q[0],q[1],q[2]])===actual||key([q[0],q[2],q[3]])===actual,'Literal structural quad+lift does not emit the actual Float32 triangle');
}
const metadataHash=createHash('sha256');metadataHash.update('[');let bindings=0,ambiguous=0,capCount=0,metadataOnlyValues=new Set();const preservedMultipleBindings=[];
const byWitnessToken=new Map();
const reference=await held(resolve(root,'docs/qa/evidence/reported-roads/historical-cap-datum-independent-9413-20261103-v2.json'),'582052cbea5477c9bf2e889cd74b6f38614997b30753d2cc9609313ee7915d9e');
const needed=new Set(reference.results.flatMap(w=>w.sourceBoundRows.map(s=>s.road+'/'+s.triangleKey)));
for(let i=0;i<fresh.triangles.length;i++){
  const t=fresh.triangles[i];assert.equal(JSON.stringify(legacy(t)),JSON.stringify(parent.triangles[i]),'Legacy triangle/index changed '+i);
  validate(t,t.actualSurface);const all=t.actualSurfaceBindings??[t.actualSurface];if(t.actualSurfaceBindings){assert.ok(t.actualSurfaceBindings.length>1);assert.equal(JSON.stringify(t.actualSurfaceBindings[0]),JSON.stringify(t.actualSurface));ambiguous++;
    const first=all[0],flatY=first.structuralQuad[0][1];
    const sameExactFlatDatum=all.every(s=>Object.is(s.paintLift,first.paintLift)&&s.road===first.road&&s.sourceRoad===first.sourceRoad&&s.segment===first.segment&&JSON.stringify(s.sourceArc)===JSON.stringify(first.sourceArc)&&JSON.stringify(s.centre)===JSON.stringify(first.centre)&&s.structuralQuad.every(p=>Object.is(p[1],flatY)));
    let maxVertexSerializationResidualM=0;for(const s of all)for(const p of s.structuralQuad)maxVertexSerializationResidualM=Math.max(maxVertexSerializationResidualM,Math.min(...t.points.map(q=>Math.hypot(p[0]-q[0],p[2]-q[2]))));
    assert.ok(sameExactFlatDatum,'Multiple structural datums remain unresolved; no scalar first-wins authority');
    assert.ok(maxVertexSerializationResidualM<=.001,'Source/Float32 mismatch exceeds Root1mm serialization bound');
    preservedMultipleBindings.push({index:i,road:t.road,legacyArc:t.arc,paintLift:first.paintLift,structuralY:flatY,bindings:all.length,sameExactFlatDatum,maxVertexSerializationResidualM,normalizedFloat32Y:t.points[0][1]-first.paintLift,sourceFootprintsRemainExplicit:true,sourceFootprintAcceptance:false,classification:'Identical emitted triangle and exact constant structural plane/source branch; distinct literal source XZ footprints retained'});
  }
  for(const s of all){validate(t,s);bindings++;metadataOnlyValues.add(s.paintLift);}if(t.cap)capCount++;
  if(i)metadataHash.update(',');metadataHash.update(JSON.stringify({actualSurface:t.actualSurface,actualSurfaceBindings:t.actualSurfaceBindings}));
  const token=t.road+'/'+key(t.points);if(needed.has(token))(byWitnessToken.get(token)||byWitnessToken.set(token,[]).get(token)).push(...all);
}
metadataHash.update(']');assert.equal(metadataHash.digest('hex'),meta.metadataSHA256);
assert.equal(meta.actualSurfaceRecords,fresh.triangles.length);assert.equal(meta.ambiguousTriangleIndices.length,ambiguous);
assert.equal(meta.distinctSurfaceBindings,bindings-fresh.triangles.length,'Unreported distinct source bindings');
let replayBindings=0;
for(const w of reference.results)for(const old of w.sourceBoundRows){const all=byWitnessToken.get(old.road+'/'+old.triangleKey)||[];assert.ok(all.some(s=>s.paintLift===old.paintLift&&s.segment===old.segment&&JSON.stringify(s.structuralQuad)===JSON.stringify(old.structuralQuad)),'Independent actual oldCity source binding differs');replayBindings++;}
for(const[path,expected]of Object.entries(meta.inputs)){const bytes=await readFile(path);assert.equal(sha(bytes),expected,'New metadata input changed '+path);inputs[path]=expected;}
assert.equal(sha(await readFile(resolve(root,'scripts/export-historical-tile-road-model.mjs'))),meta.generatorSHA256);
assert.deepEqual(meta.sourceFiles,parent.sourceFiles);
for(const[path,expected]of Object.entries(meta.sourceFiles)){const bytes=execFileSync('git',['show',fresh.revision+':'+path],{cwd:root,maxBuffer:64*1024*1024});assert.equal(sha(bytes),expected,'Not literal historical imported source '+path);}
assert.deepEqual(meta.observer,parent.observer);const observer=resolve(root,meta.observer.path);inputs[observer]=sha(await readFile(observer));assert.equal(inputs[observer],meta.observer.sha256);
for(const[path,expected]of Object.entries(fresh.scannedSourceSHA256)){const absolute=resolve(root,path),bytes=await readFile(absolute);assert.equal(sha(bytes),expected,'Source pack differs '+path);inputs[absolute]=expected;}
const sample=fresh.triangles.find(t=>t.cap),negativeControls=[];
for(const[name,mutate]of[
  ['missing literal lift',s=>delete s.paintLift],['wrong class lift',s=>s.paintLift+=.017],
  ['moved structural datum',s=>s.structuralQuad=s.structuralQuad.map(p=>[p[0],p[1]+.02,p[2]])],
  ['wrong raw source branch',s=>s.sourceArc=s.sourceArc.map(v=>v+1)],['lookalike source ID',s=>s.sourceRoad+='-lookalike']]){
  const s=structuredClone(sample.actualSurface);mutate(s);assert.throws(()=>validate(sample,s));negativeControls.push(name);
}
for(const[path,expected]of Object.entries(inputs))assert.equal(sha(await readFile(path)),expected,'Input changed during independent review '+path);
const report={version:1,scope:'Independent complete additive old-surface metadata review, not a final geometry, sampler-envelope or release approval',pass:true,releaseApproved:false,parent:{path:oldPath,sha256:oldSHA},candidate:{path:resolve(candidatePath),sha256:expectedSHA},
  summary:{legacyFieldsExact:fields,triangleCount:fresh.triangles.length,actualSurfaceBindings:bindings,preservedMultipleBindingRecords:ambiguous,unsupportedStructuralDatumAmbiguities:0,triangulatedPatches:capCount,literalPaintLifts:[...metadataOnlyValues].sort((a,b)=>a-b),independentOldCityWitnesses:reference.results.length,independentOldSurfaceBindingComparisons:replayBindings,sourceImportedModules:Object.keys(meta.sourceFiles).length,scannedSourceFiles:Object.keys(fresh.scannedSourceSHA256).length,beforeAfterUnchangedFiles:Object.keys(inputs).length},
  preservedMultipleBindings,negativeControls,beforeAfterUnchangedInputs:inputs,
  stillOpen:['58 wrong-film ambiguities may now be sampled from literal metadata;43 genuine same-node support seams require separately authorized exact finite policy/repair.', '903 independent historical headroom rows have not been validated by the targeted101 witness reference.', '1713 historical outsideROI unknowns and18 outsideROI stadium derivation traces remain outside metadata approval.', 'No feasible final core/tileY, body/tyres, independent crossing headroom, same-road folds, known30/cache/reuse/native release acceptance.']};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,sha256:sha(await readFile(output)),summary:report.summary,negativeControls:negativeControls.length}));
