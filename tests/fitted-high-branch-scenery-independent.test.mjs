// Actual seven-copy scenery constructor with adapted protocol inputs only.
// These tests do not accept a final fit or the current whole-city preparation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {validateFittedHighBranchScenery} from '../scripts/qa/validate-fitted-high-branch-scenery-v2.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
const manifestPath='/tmp/roadster-current385-declared-high-branch-scenery-first7-v1/manifest.json',sourcePath='/tmp/roadster-two-bridge385-runtime-source-copy-candidate-v1.json';
async function fixture(){
 const sceneryManifest=JSON.parse(await readFile(manifestPath)),sourceBytes=await readFile(sourcePath),source=JSON.parse(sourceBytes),held=new Map();
 const b=sceneryManifest.binding,preparation={currentInputHashes:{model:b.numericalSourceModelSHA256,source:source.binding.sourceDataSHA256,scopedPositiveSourceAuthority:b.sourceBoundAuthoritySHA256},inputs:{sourceCopyManifest:{path:sourcePath,sha256:sha(sourceBytes)}}};
 const geometryManifest={binding:{modelInputSHA256:b.numericalSourceModelSHA256,physicalSourceGeneration:b.physicalSourceGeneration,sourceInputVariantPreparationGeneration:b.sourceInputVariantPreparationGeneration}};
 const readBound=async(path,pin)=>{path=resolve(path);const raw=await readFile(path),h=sha(raw);if(pin!==undefined)assert.equal(h,pin,'Actual bound fixture bytes changed');if(held.has(path))assert.equal(h,held.get(path),'Held source changed');held.set(path,h);return raw;};
 return{root,preparation,geometryManifest,sceneryManifest,readBound,held};
}
test('production scenery constructor uses the actual six-field contract and preserves every fitted Y/lane/node field',async()=>{
 const f=await fixture();f.sceneryManifest.runtimeBundle={path:'/does-not-exist/caller-factory.mjs',sha256:'0'.repeat(64)};
 const stage=await validateFittedHighBranchScenery(f);assert.equal(stage.requiresSeparateAcceptedFit,true);assert.equal(stage.noNumericalHeightOrPavementAuthority,true);assert.equal(stage.data.rows.length,7);
 const batches=new Map();for(const copy of stage.data.copies){const key=JSON.stringify(copy.location);if(!batches.has(key))batches.set(key,[]);batches.get(key).push(copy);}
 let count=0;for(const copies of batches.values()){
  const roads=copies.map(c=>({...structuredClone(c.expectedBefore),elev:c.expectedBefore.pts.map(()=>.25)})),zone={roads,nodes:{fixture:[0,-0]}},before=structuredClone(zone),out=stage.applyZone(zone,copies[0].location);
  assert.deepEqual(zone,before);assert.equal(out.zone.nodes,zone.nodes);assert.equal(out.releaseApproved,false);
  for(let k=0;k<roads.length;k++){const row=stage.data.rows.find(r=>r.road===roads[k].id);assert.equal(out.zone.roads[k].elev,roads[k].elev);assert.deepEqual(out.zone.roads[k],{...roads[k],sceneryWidth:row.fullPreparedAfter.sceneryWidth});count++;}
 }
 assert.equal(count,7);assert.ok([...f.held.keys()].some(p=>p.endsWith('/declared-high-branch-road-scenery.ts')));assert.ok(!f.held.has('/does-not-exist/caller-factory.mjs'));
});
test('wrong/obsolete binding keys, source generations, source contract or bound authority cannot be reheadered',async()=>{
 const edits=[f=>f.sceneryManifest.binding.sourceDataSHA256='0'.repeat(64),f=>delete f.sceneryManifest.binding.dataSHA256,
  f=>f.geometryManifest.binding.modelInputSHA256='0'.repeat(64),f=>f.preparation.currentInputHashes.source='0'.repeat(64),
  f=>f.sceneryManifest.binding.physicalSourceGeneration='0'.repeat(64),f=>f.sceneryManifest.binding.sourceInputVariantPreparationGeneration='0'.repeat(64),
  f=>f.sceneryManifest.binding.sourceCopyContractSHA256='0'.repeat(64),f=>delete f.preparation.currentInputHashes.scopedPositiveSourceAuthority,
  f=>{f.sceneryManifest.sourceBoundAuthority={path:manifestPath,sha256:f.sceneryManifest.binding.sourceBoundAuthoritySHA256};}];
 for(const edit of edits){const f=await fixture();edit(f);await assert.rejects(validateFittedHighBranchScenery(f));}
});
test('actual stage rejects altered full copy metadata, geometry, boolean lanes and source locations without mutating input',async()=>{
 const f=await fixture(),stage=await validateFittedHighBranchScenery(f),first=stage.data.copies[0],copies=stage.data.copies.filter(c=>JSON.stringify(c.location)===JSON.stringify(first.location));
 for(const edit of[z=>z.roads[0].w+=.1,z=>z.roads[0].lanes=false,z=>z.roads[0].pts[0][0]+=.001,z=>z.roads[0].name='foreign',z=>z.roads.pop()]){
  const z={roads:copies.map(c=>structuredClone(c.expectedBefore))};edit(z);const before=structuredClone(z);assert.throws(()=>stage.applyZone(z,first.location));assert.deepEqual(z,before);
 }
 assert.throws(()=>stage.applyZone({roads:copies.map(c=>structuredClone(c.expectedBefore))},{kind:'core'}));
});
test('explicit root keeps actual source compilation valid from another working directory',async()=>{
 const f=await fixture(),cwd=process.cwd(),dir=await mkdtemp(join(tmpdir(),'scenery-other-cwd-'));
 try{process.chdir(dir);const stage=await validateFittedHighBranchScenery(f);assert.equal(stage.data.rows.length,7);}
 finally{process.chdir(cwd);await rm(dir,{recursive:true,force:true});}
});
