import {build} from 'esbuild';
import {readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dir=await mkdtemp(join(tmpdir(),'roadster-v21-fixes-'));
try{
 const files=(await readdir(join(root,'tests/v21-fixes'))).filter(f=>f.endsWith('.test.ts')&&f.includes(process.argv[2]||'')).sort(),outputs=[];
 if(!files.length)throw Error('No matching current Version21 repair tests');
 // These Node tests exercise the production game, outside Vite's module
 // runtime. Match Vite's production environment constants instead of leaving
 // import.meta.env undefined when a real game failure path is exercised.
 for(const [i,file] of files.entries()){const out=join(dir,i+'.test.mjs');outputs.push(out);await build({entryPoints:[join(root,'tests/v21-fixes',file)],outfile:out,bundle:true,platform:'node',format:'esm',target:'node22',define:{'import.meta.env.DEV':'false','import.meta.env.PROD':'true'},logLevel:'error'});}
 // Several real-city suites load the full map. Bound parallelism so a local
 // correctness run does not starve the interactive gameplay/visual test.
 const concurrency=Math.trunc(Math.max(1,Math.min(4,Number(process.env.ROADSTER_TEST_CONCURRENCY)||2)));
 process.exitCode=await new Promise(r=>{const p=spawn(process.execPath,['--test',`--test-concurrency=${concurrency}`,...outputs],{cwd:root,stdio:'inherit'});p.on('exit',r);});
}finally{await rm(dir,{recursive:true,force:true});}
