// Execute the actual CLI preflight. These tests stop at its later raw-core
// mismatch; they do not claim that the synthetic fixtures export a joint model.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const cli=join(root,'scripts/export-joint-road-tile-input.mjs');

async function scenario({explicit=true, wrongSource=false, count=21}={}) {
  const folder=await mkdtemp(join(tmpdir(),'roadster-joint-baseline-test-'));
  const source={generationID:'new-test-frame',sourceCorePackSHA256:'deliberate-later-core-mismatch'};
  const text=JSON.stringify(source);
  const sourceSha=createHash('sha256').update(text).digest('hex');
  const baseline={version:1,sourceRoadGeometryGeneration:source.generationID,
    sourceDataSHA256:wrongSource?'wrong':sourceSha,sourceCoreSHA256:source.sourceCorePackSHA256,
    roads:Array.from({length:count},(_,i)=>({id:`literal-${i}`}))};
  const inputs={model:{},source,selection:{explicitCoreEndpointOwners:[]},supplement:{},baseline};
  for(const [key,value]of Object.entries(inputs))await writeFile(join(folder,key+'.json'),JSON.stringify(value));
  const modelPath=join(folder,'model.json');
  const modelSha=createHash('sha256').update(await readFile(modelPath)).digest('hex');
  await writeFile(join(folder,'selection.json'),JSON.stringify({inputs:{modelSHA256:modelSha},explicitCoreEndpointOwners:[]}));
  const args=[cli,'--model',modelPath,'--source-geometry',join(folder,'source.json'),
    '--tile-transports',join(folder,'supplement.json'),'--selection',join(folder,'selection.json'),
    '--output',join(folder,'output.json')];
  if(explicit)args.push('--physical-baseline',join(folder,'baseline.json'));
  try{
    const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});
    assert.notEqual(result.status,0);
    await assert.rejects(readFile(join(folder,'output.json')),/ENOENT/);
    return result.stderr;
  }finally{await rm(folder,{recursive:true,force:true});}
}

test('explicit new source-bound baseline passes its preflight to later core guard',async()=>{
  const stderr=await scenario();
  assert.match(stderr,/Mixed source generation\/core\/model\/supplement/);
  assert.doesNotMatch(stderr,/Stale literal tile pavement baseline/);
});
test('explicit baseline from another source file fails before raw core loading',async()=>{
  assert.match(await scenario({wrongSource:true}),/Stale literal tile pavement baseline/);
});
test('default baseline retains its original frame guard',async()=>{
  assert.match(await scenario({explicit:false}),/Stale literal tile pavement baseline/);
});
test('explicit input retains the complete 21-road scope guard',async()=>{
  assert.match(await scenario({count:20}),/Incomplete literal tile pavement inventory/);
});
