import { build } from 'esbuild';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)), output=process.argv[2];
if(!output)throw Error('Supply a NEW output receipt path.');
const sha=b=>createHash('sha256').update(b).digest('hex'),inputs={};
async function hold(p,expected){const b=await readFile(p),h=sha(b);if(expected&&h!==expected)throw Error('Changed input '+p);inputs[p]=h;return b;}
const model='/tmp/anandbagh-two-road-physical-candidate-model-v1.json';
await hold(model,'86d78905d0eff2a153f292a73145762755d1beb87b9b6beed4eea8a5008c9c99');
await hold('/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/model-be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7.json','be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7');
await hold('/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/tileSupplement-c1e34a47bd09936c31359885c1d5ebef4a59556301035d9408e29c5ec7e8a2d0.json','c1e34a47bd09936c31359885c1d5ebef4a59556301035d9408e29c5ec7e8a2d0');
await hold(resolve(root,'scripts/qa/anandbagh-physical-independent.ts'));
await hold(fileURLToPath(import.meta.url));
const temp=await mkdtemp(join(tmpdir(),'anandbagh-physical-independent-'));
try{
 const file=join(temp,'run.mjs'),built=await build({entryPoints:[resolve(root,'scripts/qa/anandbagh-physical-independent.ts')],outfile:file,bundle:true,platform:'node',format:'esm',target:'node22',metafile:true,define:{'import.meta.env.DEV':'false','import.meta.env.PROD':'true'},logLevel:'error'});
 for(const p of Object.keys(built.metafile.inputs).filter(p=>!p.includes('node_modules/')))await hold(resolve(root,p));
 const result=await(await import(pathToFileURL(file).href)).run(process.argv.includes('--quick'));
 for(const[p,h]of Object.entries(result.sourcePackHashes))await hold(p,h);
 for(const[p,h]of Object.entries(inputs))if(sha(await readFile(p))!==h)throw Error('Source changed during physical diagnostic '+p);
 const report={...result,beforeAfterUnchangedInputs:inputs,nodeVersion:process.version};
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({output,sha256:sha(await readFile(output)),summary:result.summary}));
 process.exitCode=result.summary.candidateFailedCases?1:0;
}finally{await rm(temp,{recursive:true,force:true});}
