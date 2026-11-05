import assert from'node:assert/strict';import{test,after}from'node:test';
import{mkdtemp,readFile,writeFile,rm}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
import{packageRoadJSON}from'../scripts/package-road-json.mjs';
const root=await mkdtemp(join(tmpdir(),'road-json-package-test-'));after(()=>rm(root,{recursive:true,force:true}));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('release JSON packager requires independent input bytes and preserves previous packages',async()=>{
 const bytes=Buffer.from(' \n{"original":-0,"array":['+Array(100).fill('{"long":"'+Array(100).fill('pizza').join('')+'"}').join(',')+']}\n'),path=join(root,'source.json');await writeFile(path,bytes);
 await assert.rejects(packageRoadJSON({source:{path,sha256:'0'.repeat(64)}},join(root,'wrong')),/input changed/);
 await assert.rejects(packageRoadJSON({core:{path,sha256:sha(bytes)}},join(root,'core')),/independent/);
 const output=join(root,'exact'),receipt=await packageRoadJSON({source:{path,sha256:sha(bytes)}},output);
 assert.equal(receipt.allOriginalBytesReconstructedAndCompared,true);assert.equal(receipt.sourceOrPhysicalAcceptanceGranted,false);assert.equal(receipt.runtimeActivated,false);
 assert.equal(receipt.files.source.decodedSHA256,sha(bytes));assert.ok(receipt.summary.storedBytes<bytes.length);
 assert.equal(sha(await readFile(join(output,receipt.files.source.path))),receipt.files.source.storedSHA256);
 const before=await readFile(join(output,'transport.json'));await assert.rejects(packageRoadJSON({source:{path,sha256:sha(bytes)}},output),/EEXIST/);
 assert.deepEqual(await readFile(join(output,'transport.json')),before);assert.deepEqual(await readFile(path),bytes);
});
