import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const exporter=resolve(root,'scripts/export-road-world-model.mjs');
const sourcePath=resolve(root,'src/world/road-source-geodesic-data.json');
const bytes=await readFile(sourcePath),data=JSON.parse(bytes),sha=b=>createHash('sha256').update(b).digest('hex');
const temporary=await mkdtemp(join(tmpdir(),'road-world-input-source-tests-'));
let count=0;
function run(args,cwd=root){return spawnSync(process.execPath,[exporter,...args],{cwd,encoding:'utf8',maxBuffer:1024*1024});}
async function fixture(patch={},source=sourcePath){
  const id=String(++count),input=join(temporary,'input-'+id+'.json'),output=join(temporary,'output-'+id+'.json');
  const model={roads:[],sourceRoadGeometryGeneration:data.generationID,sourceGeometryReference:{sha256:sha(bytes),generationID:data.generationID},retainedUnknownLegacyField:{declared:'unchanged'},...patch};
  await writeFile(input,JSON.stringify(model));return {input,output,model,args:['--input-model',input,'--input-source-geometry',source,'--stage','grades','--output',output]};
}
function rejected(result,message){assert.notEqual(result.status,0,result.stdout);assert.match(result.stderr,message);}

test('explicit source geometry requires its model and excludes all generic source modes',()=>{
  const common=['--stage','grades','--output',join(temporary,'invalid.json')];
  rejected(run(['--input-source-geometry',sourcePath,...common]),/requires --input-model/);
  rejected(run(['--input-model','unused','--input-source-geometry',sourcePath,'--source-geometry',sourcePath,...common]),/cannot be mixed/);
  rejected(run(['--input-model','unused','--input-source-geometry',sourcePath,'--rehydrate-corrections','unused',...common]),/at most one source input|cannot be mixed/);
  rejected(run(['--input-model','unused','--input-source-geometry',sourcePath,'--source-view-output','unused',...common]),/requires explicit --source-geometry/);
  rejected(run(['--input-model','unused','--source-geometry',sourcePath,...common]),/cannot be mixed/);
});

test('wrong pre-stage generation is rejected before any export',async()=>{
  const f=await fixture({sourceRoadGeometryGeneration:'0'.repeat(64)});rejected(run(f.args),/binding is stale or has a different generation/);
});

test('stale source-byte hash is rejected even with a matching generation',async()=>{
  const f=await fixture({sourceGeometryReference:{sha256:'0'.repeat(64),generationID:data.generationID}});rejected(run(f.args),/binding is stale or has a different generation/);
});

test('stale reference generation is rejected independently of the model generation',async()=>{
  const f=await fixture({sourceGeometryReference:{sha256:sha(bytes),generationID:'f'.repeat(64)}});rejected(run(f.args),/binding is stale or has a different generation/);
});

test('a hash-matched dataset cannot bypass the actual raw-core binding',async()=>{
  const altered={...data,sourceCorePackSHA256:'0'.repeat(64)},badBytes=JSON.stringify(altered),bad=join(temporary,'wrong-raw-core-source.json');await writeFile(bad,badBytes);
  const f=await fixture({sourceGeometryReference:{sha256:sha(badBytes),generationID:data.generationID}},bad);rejected(run(f.args),/does not bind this raw core pack/);
});

test('omitting the source reference never defaults to the active source data',async()=>{
  const f=await fixture({sourceGeometryReference:undefined});rejected(run(f.args),/binding is stale or has a different generation/);
});

test('correct explicit binding preserves model fields and records offline provenance',async()=>{
  const f=await fixture();const result=run(f.args);assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(await readFile(f.output,'utf8')),f.model);
  const provenance=JSON.parse(await readFile(f.output+'.provenance.json','utf8'));
  assert.equal(provenance.offlineInputSourceGeometry.sha256,sha(bytes));assert.equal(provenance.offlineInputSourceGeometry.generationID,data.generationID);
  assert.equal(provenance.offlineInputSourceGeometry.rawCoreBindingVerified,true);assert.equal(provenance.offlineInputSourceGeometry.runtimeSourceActivated,false);
  rejected(run(f.args),/Preserve research evidence/);
  assert.equal(sha(await readFile(sourcePath)),sha(bytes));
});

test('explicit binding from another working directory retains the full source inventory',async()=>{
  const f=await fixture(),result=run(f.args,temporary);assert.equal(result.status,0,result.stderr);
  const provenance=JSON.parse(await readFile(f.output+'.provenance.json','utf8'));
  assert.equal(typeof provenance.sourceFiles['src/world/road-source-geodesic.ts'],'string');
  assert.equal(typeof provenance.sourceFiles['src/world/road-grades.ts'],'string');
  assert.equal(provenance.sourceFiles[exporter],sha(await readFile(exporter)));
  assert.deepEqual(JSON.parse(await readFile(f.output,'utf8')),f.model);
});

console.log('Retained source-input test fixtures: '+temporary);
