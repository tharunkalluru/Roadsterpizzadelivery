import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const root = process.argv[2];
if (!root) throw new Error('Pass the original browser A/B artifact directory.');
const percentile=(xs,p)=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.max(0,Math.ceil(a.length*p)-1)]:null;};
const median=xs=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
const summary=xs=>{const m=median(xs);return {median:m,mad:m===null?null:median(xs.map(x=>Math.abs(x-m))),runs:xs};};
const runs=readdirSync(root).filter(n=>/^(static|idle-game)-\d-(baseline|candidate)\.json$/.test(n)).map(file=>{
  const d=JSON.parse(readFileSync(join(root,file),'utf8')),c=d.calls||[],f=d.frames||[];
  const intervals=c.map(x=>x.interval).filter(Number.isFinite);
  return {file,kind:d.cfg.kind,pair:d.cfg.pair,variant:d.cfg.variant,measurementSeconds:d.cfg.measureMs/1000,
    fps:c.length/(d.cfg.measureMs/1000),renderCount:c.length,renderSubmitMedianMs:median(c.map(x=>x.cpuMs)),renderSubmitP95Ms:percentile(c.map(x=>x.cpuMs),.95),
    frameIntervalMedianMs:median(intervals),frameIntervalP95Ms:percentile(intervals,.95),frameIntervalP99Ms:percentile(intervals,.99),
    frameCPUMedianMs:median(f.map(x=>x.cpuMs)),frameCPUP95Ms:percentile(f.map(x=>x.cpuMs),.95),
    medianDrawCalls:median(c.map(x=>x.calls)),medianTriangles:median(c.map(x=>x.triangles)),longTasks:d.longTasks.length,
    observedEndHeapMiB:d.after.heap/1048576,geometryCount:d.after.memory.geometries,textureCount:d.after.memory.textures,
    activeTiles:d.after.tiles.length,visibilityChanges:d.visibility.filter(x=>x.state!=='visible'),errors:d.errors,warnings:d.warnings,
    before:d.before,after:d.after,startedAt:d.startedAt,endedAt:d.endedAt,url:d.url,bundle:d.bundle,
    screenshotSha256:createHash('sha256').update(readFileSync(join(root,file.replace('.json','.png')))).digest('hex')};
}).sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
const metrics=['fps','renderSubmitMedianMs','renderSubmitP95Ms','frameIntervalP95Ms','frameIntervalP99Ms','frameCPUMedianMs','frameCPUP95Ms','medianDrawCalls','medianTriangles','observedEndHeapMiB','geometryCount','textureCount','activeTiles','longTasks'];
const groups=[];
for(const kind of ['static','idle-game']){
 const baseline=runs.filter(r=>r.kind===kind&&r.variant==='baseline'),candidate=runs.filter(r=>r.kind===kind&&r.variant==='candidate');
 if(!baseline.length&&!candidate.length)continue;
 const comparison={kind,baseline:{},candidate:{},medianChangePercent:{},pairs:[]};
 for(const name of metrics){comparison.baseline[name]=summary(baseline.map(r=>r[name]));comparison.candidate[name]=summary(candidate.map(r=>r[name]));const b=comparison.baseline[name].median,c=comparison.candidate[name].median;comparison.medianChangePercent[name]=b?100*(c-b)/b:null;}
 for(let pair=1;pair<=3;pair++){const b=baseline.find(r=>r.pair===pair),c=candidate.find(r=>r.pair===pair);if(!b||!c)continue;comparison.pairs.push({pair,exactScreenshotBytes:kind==='static'?b.screenshotSha256===c.screenshotSha256:null,matchingInitialPlayerPosition:JSON.stringify(b.before.position)===JSON.stringify(c.before.position),matchingDrawBuffer:JSON.stringify(b.before.drawBuffer)===JSON.stringify(c.before.drawBuffer),matchingQuality:b.before.lowQ===c.before.lowQ,baselineTiles:b.after.tiles,candidateTiles:c.after.tiles});}
 groups.push(comparison);
}
const out={createdAt:new Date().toISOString(),sourceDirectory:root,scope:'Controlled High static renderer and repeated Low stationary production-Game observations on the same desktop Chrome with calibrated CPU slowdown. Game traffic/rail/deferred scheduling are not a deterministic replay.',
 physicalPhone:false,midrangeGPUEmulated:false,gameplayDrivingBenchmark:false,allExpectedRunsPresent:runs.length===12,visibilityValid:runs.every(r=>!r.visibilityChanges.length),allApplicationErrors:runs.flatMap(r=>r.errors.map(error=>({file:r.file,error}))),
 aggregation:'Median of three per-run metrics; MAD is median absolute deviation. CPU is synchronous JS/render submission, not GPU completion. Heap samples do not force GC or establish retained-memory bounds.',groups,runs};
writeFileSync(join(root,'summary.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({runs:runs.length,allExpectedRunsPresent:out.allExpectedRunsPresent,visibilityValid:out.visibilityValid,errors:out.allApplicationErrors,groups:groups.map(g=>({kind:g.kind,baseline:Object.fromEntries(metrics.map(n=>[n,g.baseline[n].median])),candidate:Object.fromEntries(metrics.map(n=>[n,g.candidate[n].median])),changePercent:g.medianChangePercent,pairs:g.pairs.map(p=>({pair:p.pair,exactScreenshotBytes:p.exactScreenshotBytes,matchingInitialPlayerPosition:p.matchingInitialPlayerPosition,matchingDrawBuffer:p.matchingDrawBuffer,matchingQuality:p.matchingQuality}))}))},null,2));
