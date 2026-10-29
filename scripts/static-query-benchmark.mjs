// Synthetic CPU-query microbenchmark. No production module is modified.
import { build } from 'esbuild';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root=process.cwd(),arg=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const baseline=resolve(arg('--baseline')||'../roadster-performance-baseline');
const output=resolve(arg('--out')||'docs/performance/static-query-benchmark.json');
const source=await readFile('tests/sim-static-cache.test.ts','utf8'),begin=source.indexOf('function fixture(){'),end=source.indexOf('\ntest(',begin);
if(begin<0||end<0)throw new Error('Deterministic static fixture declaration was not found');
const fixture=source.slice(begin,end);
const code=`
const baseline=${JSON.stringify(baseline)},root=${JSON.stringify(root)};
import { staticSolidAt as originalSolid } from ${JSON.stringify(join(baseline,'src/game/spatial-safety.ts'))};
import { supportAt as originalSupport } from ${JSON.stringify(join(baseline,'src/game/physics.ts'))};
import { staticSolidAt as optimizedSolid } from ${JSON.stringify(resolve('src/game/spatial-safety.ts'))};
import { supportAt as optimizedSupport } from ${JSON.stringify(resolve('src/game/physics.ts'))};
import { staticQueryStats } from ${JSON.stringify(resolve('src/game/static-neighborhood.ts'))};
import { PerformanceMonitor } from ${JSON.stringify(resolve('src/core/performance-monitor.ts'))};
import { rng } from ${JSON.stringify(resolve('src/core/util.ts'))};
${fixture}
const median=(v:number[])=>{const a=[...v].sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};
const summary=(v:number[])=>{const m=median(v);return {medianMs:m,madMs:median(v.map(x=>Math.abs(x-m))),runsMs:v};};
const city=fixture(),r=rng(42871),queries:any[]=[];
for(let ray=0;ray<256;ray++){
 const x=r.range(-110,110),z=r.range(-110,110),y=r.range(.6,28),angle=r()*Math.PI*2,dy=r.range(-.08,.08);
 for(let i=0;i<64;i++)queries.push({x:x+Math.cos(angle)*i*.25,z:z+Math.sin(angle)*i*.25,y:y+dy*i});
}
let mismatchCount=0;
for(const p of queries){
 if(originalSolid(city,p)!==optimizedSolid(city,p))mismatchCount++;
 for(const roadOnly of [true,false]){const a=originalSupport(city,p.x,p.z,p.y,roadOnly),b=optimizedSupport(city,p.x,p.z,p.y,roadOnly);if(a.y!==b.y||a.s!==b.s||a.kind!==b.kind||a.onRoad!==b.onRoad||a.elevatedRoad!==b.elevatedRoad)mismatchCount++;}
}
if(mismatchCount)throw new Error('Reference equality failed: '+mismatchCount);
const methods=[['staticSolidAt',originalSolid,optimizedSolid],['supportAtRoadOnly',(c:any,p:any)=>originalSupport(c,p.x,p.z,p.y,true),(c:any,p:any)=>optimizedSupport(c,p.x,p.z,p.y,true)],['supportAtWithRoofs',(c:any,p:any)=>originalSupport(c,p.x,p.z,p.y,false),(c:any,p:any)=>optimizedSupport(c,p.x,p.z,p.y,false)]] as const;
let sink=0;
function measure(fn:any,count=queries.length){const start=performance.now();for(let i=0;i<count;i++){const v=fn(city,queries[i%queries.length]);sink+=typeof v==='boolean'?+v:v.y;}return performance.now()-start;}
const results:any[]=[];
for(const [name,a,b] of methods){
 for(let w=0;w<3;w++){measure(a,4096);measure(b,4096);}
 const before={...staticQueryStats},original:number[]=[],optimized:number[]=[];
 for(let run=0;run<5;run++){if(run%2){optimized.push(measure(b));original.push(measure(a));}else{original.push(measure(a));optimized.push(measure(b));}}
 const o=summary(original),v=summary(optimized),after={...staticQueryStats};
 results.push({name,queryCountPerRun:queries.length,pairedRuns:5,original:o,optimized:v,medianSpeedup:o.medianMs/v.medianMs,medianReductionPercent:100*(1-v.medianMs/o.medianMs),optimizedMicrosecondsPerQuery:v.medianMs*1000/queries.length,optimizedCounters:Object.fromEntries(Object.keys(after).map(k=>[k,after[k]-before[k]]))});
}
const count=200000,phases=['player','traffic','routing','simulation','renderSubmit','background'];
function monitorRun(enabled:boolean){const monitor=new PerformanceMonitor(1800),start=performance.now();let value=0;for(let i=0;i<count;i++){for(const phase of phases){if(enabled)monitor.begin(phase);value+=(i&3)*.00001;if(enabled)monitor.end(phase);}if(enabled){monitor.record('frameInterval',16.67);monitor.record('frameCPU',3.6);monitor.record('gpu',2);}}sink+=value;return performance.now()-start;}
monitorRun(false);monitorRun(true);const off:number[]=[],on:number[]=[];
for(let i=0;i<5;i++){if(i%2){on.push(monitorRun(true));off.push(monitorRun(false));}else{off.push(monitorRun(false));on.push(monitorRun(true));}}
const offSummary=summary(off),onSummary=summary(on);
const report={kind:'syntheticStaticCPUQueryMicrobenchmark',createdAt:new Date().toISOString(),nodeVersion:process.version,hardware:'Same host Node process; no calibrated browser throttling',physicalPhoneCertification:false,wholeGameFPS:false,baselineRoot:baseline,candidateRoot:root,fixture:{seed:471,buildings:60,walls:30,obstacles:20,surfaces:3,querySeed:42871,queries:queries.length,pattern:'256 deterministic rays x64 probes at0.25m spacing',revisionAware:true},equality:{queriesChecked:queries.length*3,mismatches:mismatchCount},warmup:'3 x4096 queries per method before five alternating-order paired runs; no forced GC',results,monitor:{kind:'microestimate',frameIterationsPerRun:count,phasePairsPerFrame:6,directRecordsPerFrame:3,off:offSummary,on:onSummary,medianExtraMillisecondsPerSyntheticFrame:(onSummary.medianMs-offSummary.medianMs)/count,limitation:'Node timing of a representative call mix. Does not certify under1% overhead inside the actual browser game or compare CPU architectures/throttling.'},sink};
export default report;
`;
const dir=await mkdtemp(join(tmpdir(),'roadster-static-profile-'));
try{
 const entry=join(dir,'benchmark.mjs');
 await build({stdin:{contents:code,loader:'ts',resolveDir:root,sourcefile:'synthetic-static-benchmark.ts'},outfile:entry,bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'error',alias:{three:resolve('node_modules/three')}});
 const {default:report}=await import(pathToFileURL(entry).href);
 report.monitor.browserFrameComparison={available:false,reason:'An unthrottled Node microbenchmark is not a matched browser monitor-enabled/disabled frameCPU comparison. No under1percent whole-game overhead certification.'};
 report.sourceSha256={};
 for(const [label,sourceRoot]of [['baseline',baseline],['candidate',root]]){report.sourceSha256[label]={};for(const p of ['src/game/physics.ts','src/game/spatial-safety.ts'])report.sourceSha256[label][p]=createHash('sha256').update(await readFile(resolve(sourceRoot,p))).digest('hex');}
 report.sourceSha256.candidate['src/game/static-neighborhood.ts']=createHash('sha256').update(await readFile(resolve('src/game/static-neighborhood.ts'))).digest('hex');
 await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({output,equality:report.equality,results:report.results.map(r=>({name:r.name,speedup:r.medianSpeedup,reduction:r.medianReductionPercent,originalMs:r.original.medianMs,optimizedMs:r.optimized.medianMs})),monitorMicrosecondsPerFrame:report.monitor.medianExtraMillisecondsPerSyntheticFrame*1000}));
}finally{await rm(dir,{recursive:true,force:true});}
