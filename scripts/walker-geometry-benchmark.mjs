/** Isolated CPU probe; no renderer/GPU or physical-phone FPS claim. */
import {build} from 'esbuild';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd(),dir=await mkdtemp(join(tmpdir(),'walker-geometry-'));
const before=execFileSync('git',['show','5bf2b9a:src/world/human-body.ts'],{cwd:root,encoding:'utf8'});
const source=`export {randomPerson,walkerGeometry} from './src/world/people'; export {initTemplates,rng} from './src/core/util'; export {drawContinuousBody} from './src/world/human-body';`;
function hash(g){const h=createHash('sha256');for(const name of Object.keys(g.attributes).sort()){const a=g.attributes[name];h.update(name);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));return h.digest('hex');}
function summary(rows){const a=rows.map(r=>r.ms).sort((a,b)=>a-b);return{n:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1)};}
try{
 for(const mode of ['before','after'])await build({stdin:{contents:source,resolveDir:root,loader:'ts'},outfile:join(dir,mode+'.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'error',plugins:mode==='before'?[{name:'baseline-body',setup(b){b.onLoad({filter:/\/human-body\.ts$/},()=>({contents:before,loader:'ts',resolveDir:resolve(root,'src/world')}));}}]:[]});
 const trials=[];
 for(let trial=0;trial<4;trial++){const pair={};for(const mode of trial%2?['after','before']:['before','after']){const m=await import(pathToFileURL(join(dir,mode+'.mjs')).href+'?trial='+trial);m.initTemplates();const r=m.rng(9917),rows=[];for(let i=0;i<150;i++){const spec=m.randomPerson(r),start=performance.now(),g=m.walkerGeometry(spec,true),ms=performance.now()-start;rows.push({i,kind:spec.kind,ms,body:hash(g.body),rigged:hash(g.rigged)});g.release();}pair[mode]=rows;}assert.deepEqual(pair.after.map(({ms,...r})=>r),pair.before.map(({ms,...r})=>r));trials.push(pair);}
 const coverage={};
 for(const mode of ['before','after']){const m=await import(pathToFileURL(join(dir,mode+'.mjs')).href+'?coverage');m.initTemplates();const r=m.rng(1519),rows=[];for(let i=0;i<24;i++){const spec=m.randomPerson(r);for(const low of [false,true])for(const seat of [undefined,'bike','auto','bench']){const h=createHash('sha256');m.drawContinuousBody((t,...args)=>{h.update(JSON.stringify(args));for(const key of Object.keys(t).sort()){const value=t[key];h.update(key);h.update(ArrayBuffer.isView(value)?Buffer.from(value.buffer,value.byteOffset,value.byteLength):JSON.stringify(value));}},spec,low,seat);rows.push({i,kind:spec.kind,low,seat:seat??'standing',hash:h.digest('hex')});}}coverage[mode]=rows;}
 assert.deepEqual(coverage.after,coverage.before);
 await writeFile(resolve(root,'tests/v21-fixes/human-body-baseline.json'),JSON.stringify(coverage.before,null,2));
 const result={coverageExact:coverage.before.length,description:'Alternating fresh-module host CPU probes; identical 150 seeded appearances per run. Full geometry attribute bytes exact.',before:summary(trials.flatMap(t=>t.before)),after:summary(trials.flatMap(t=>t.after)),trials};await writeFile(resolve(root,'docs/performance/frame-spikes-v36/walker-geometry.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({before:result.before,after:result.after,exactGeometry:true},null,2));
}finally{await rm(dir,{recursive:true,force:true});}
