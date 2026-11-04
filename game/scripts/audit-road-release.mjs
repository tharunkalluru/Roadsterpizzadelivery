import { build,version as esbuildVersion } from 'esbuild';
import { mkdtemp,rm,readFile,writeFile,readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
const root=process.cwd(),temp=await mkdtemp(join(tmpdir(),'road-release-audit-'));
try {
  const requestedAt=process.argv.indexOf('--output');
  if(requestedAt>=0&&process.argv[requestedAt+1]){const at=resolve(root,process.argv[requestedAt+1]);if(existsSync(at)||existsSync(at+'.execution.json'))throw Error('Preserve existing audit output/receipt; choose a new filename.');}
  const entry=process.argv.includes('--source-nodes')?'audit-road-source-node-surfaces.ts':process.argv.includes('--known30')?'audit-road-release-known30.ts':process.argv.includes('--emit')?'export-road-release-emitted.ts':'audit-road-release.ts';
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),snapshot=new Map();
  const collect=async dir=>{for(const item of await readdir(dir,{withFileTypes:true})){const file=join(dir,item.name);if(item.isSymbolicLink())throw Error(`Linked audit implementation: ${file}`);if(item.isDirectory())await collect(file);else if(item.isFile())snapshot.set(file,hash(await readFile(file)));}};
  for(const dir of['src','scripts/qa','tests/fixtures'])await collect(dir);
  for(const file of['package.json','package-lock.json','scripts/audit-road-release.mjs'])snapshot.set(file,hash(await readFile(file)));
  const bundle=join(temp,'audit.mjs'),built=await build({entryPoints:[resolve(root,'scripts/qa',entry)],outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node22',metafile:true,define:{'import.meta.env.DEV':'false','import.meta.env.PROD':'true'},logLevel:'error'});
  const files=[...new Set([...Object.keys(built.metafile.inputs).filter(p=>!p.includes('node_modules/')),'package.json','package-lock.json','scripts/audit-road-release.mjs'])];
  const before=new Map();
  for(const file of files){const expected=snapshot.get(file);if(!expected||hash(await readFile(file))!==expected)throw Error(`Audit source changed while bundling: ${file}`);before.set(file,expected);}
  const run=spawnSync(process.execPath,[bundle,...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
  for(const[p,expected]of before)if(hash(await readFile(p))!==expected)throw Error(`Audit implementation changed during run: ${p}`);
  const outAt=process.argv.indexOf('--output');
  if(outAt>=0&&process.argv[outAt+1]){
    const output=resolve(root,process.argv[outAt+1]);
    await writeFile(output+'.execution.json',JSON.stringify({schemaVersion:1,entry,outputSHA256:hash(await readFile(output)),exitCode:run.status??1,sourceInputs:Object.fromEntries(before),nodeVersion:process.version,esbuildVersion,implementationStable:true,releaseApproved:false},null,2)+'\n',{flag:'wx'});
  }
  process.exitCode=run.status??1;
}finally{await rm(temp,{recursive:true,force:true});}
