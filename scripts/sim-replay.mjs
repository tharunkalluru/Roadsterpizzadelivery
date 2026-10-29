import { build } from 'esbuild';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=process.cwd(),arg=(name)=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const baseline=arg('--baseline');if(!baseline)throw new Error('Pass --baseline /absolute/path/to/verified/baseline/application');
const output=resolve(arg('--out')||'output/playwright/synthetic-replay.json'),entry=resolve('scripts/sim-replay-runner.ts'),dir=await mkdtemp(join(tmpdir(),'roadster-replay-'));
try {
  const modules={},bundleHashes={};
  for(const [name,source] of [['baseline',resolve(baseline)],['candidate',root]]) {
    const outfile=join(dir,`${name}.mjs`);
    await build({entryPoints:[entry],outfile,bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'error',alias:{'three/addons':resolve('node_modules/three/examples/jsm'),three:resolve('node_modules/three')},plugins:[{name:'verified-source',setup(b){b.onResolve({filter:/^\.\.\/src\/(game\/player|core\/util)$/},args=>args.importer===entry?{path:resolve(source,args.path.replace('../','')+'.ts')}:undefined);}}]});
    bundleHashes[name]=createHash('sha256').update(await readFile(outfile)).digest('hex');
    modules[name]=await import(pathToFileURL(outfile).href);
  }
  const runs=[],comparisons=[];
  for(const scenario of ['jump','drive-brake','fly-once']) {
    const reference=modules.baseline.runReplay({scenario,hz:60});
    for(const hz of [30,60,90,120]) {
      const actual=modules.candidate.runReplay({scenario,hz}),same=JSON.stringify(actual.samples)===JSON.stringify(reference.samples);
      comparisons.push({scenario,hz,ticks:actual.ticks,exactStateSequenceMatch:same,maxNumericDifference:Math.max(...actual.samples.flatMap((row,i)=>row.map((v,k)=>typeof v==='number'?Math.abs(v-reference.samples[i][k]):0)))});
      const {samples,...summary}=actual;runs.push(summary);
    }
    const {samples,...summary}=reference;runs.push({...summary,source:'baseline'});
  }
  const commit=path=>{try{return execFileSync('git',['rev-parse','HEAD'],{cwd:path,encoding:'utf8'}).trim();}catch{return null;}};
  const report={kind:'synthetic_physics_replay',physicalPhoneCertification:false,fullGameReplay:false,createdAt:new Date().toISOString(),baselineRoot:resolve(baseline),baselineCommit:commit(baseline),candidateRoot:root,candidateCommit:commit(root),nodeVersion:process.version,bundleHashes,description:'Actual baseline/candidate Player.update on an infinite synthetic flat road, fixed60Hz, deterministic input/RNG and stub canvas. Particle animation disabled. No browser rendering or real traffic/delivery evidence.',runs,comparisons,passed:comparisons.every(x=>x.exactStateSequenceMatch)};
  await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({output,passed:report.passed,comparisons:comparisons.length,runs:runs.length}));if(!report.passed)process.exitCode=1;
} finally {await rm(dir,{recursive:true,force:true});}
