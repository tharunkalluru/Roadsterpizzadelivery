// Scoped real-city route-search CPU benchmark. This does not measure game FPS.
import {build} from 'esbuild';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const temporary=await mkdtemp(join(tmpdir(),'gps-budget-'));
try {
  const bundle=join(temporary,'routes.mjs');
  await build({stdin:{contents:`export {RoadGraph} from ${JSON.stringify(resolve('src/game/roadgraph.ts'))};export {v36Route} from ${JSON.stringify(resolve('tests/fixtures/route-v36-reference.ts'))};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:bundle});
  const {RoadGraph,v36Route}=await import(pathToFileURL(bundle));
  const bytes=await readFile('public/city/core.pack.wasm'),core=JSON.parse(bytes[0]===31?gunzipSync(bytes):bytes),graph=new RoadGraph(core.roads);
  const queries=[[0,0,6870,419.6],[-15368,-4130,6870,419.6],[6870,419.6,-12022,-4925],[0,0,-15368,-4130],[6870,419.6,12000,4000],[-12022,-4925,-15368,-4130]];
  const rows=[];
  for(let round=0;round<6;round++)for(const query of queries){
    let before,after,beforeMs,afterMs;
    const baseline=()=>{const t=performance.now();before=v36Route.call(graph,...query);beforeMs=performance.now()-t;};
    const candidate=()=>{const t=performance.now();after=graph.route(...query);afterMs=performance.now()-t;};
    if(round%2){candidate();baseline();}else{baseline();candidate();}
    assert.deepEqual(after,before);
    const job=graph.routeJob(...query),slices=[];const t=performance.now();
    while(job.state==='pending'){const start=performance.now();job.step(1);slices.push(performance.now()-start);assert.ok(slices.length<20000);}
    assert.deepEqual(job.result,before);
    rows.push({round,query,beforeMs,afterMs,slices,totalMs:performance.now()-t,operations:job.operations,points:before?.pts.length??0,exact:true});
  }
  const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b),percentile=p=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];return {count:sorted.length,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:sorted.at(-1),over1:values.filter(x=>x>1).length,over1_25:values.filter(x=>x>1.25).length,over2:values.filter(x=>x>2).length,over5:values.filter(x=>x>5).length};};
  const warm=rows.filter(r=>r.round>0);
  const report={baseline:'c8f8e06b16c22acff4ca731ac1209414c2d78cc7',kind:'real-city Node CPU route search; no GPU or display FPS',edges:graph.edges.length,coreSha256:createHash('sha256').update(bytes).digest('hex'),exactComparisons:rows.length*2,cold:{baseline:summarize(rows.filter(r=>r.round===0).map(r=>r.beforeMs)),synchronousCandidate:summarize(rows.filter(r=>r.round===0).map(r=>r.afterMs)),foregroundSlices:summarize(rows.filter(r=>r.round===0).flatMap(r=>r.slices))},warm:{baseline:summarize(warm.map(r=>r.beforeMs)),synchronousCandidate:summarize(warm.map(r=>r.afterMs)),foregroundSlices:summarize(warm.flatMap(r=>r.slices)),candidateTotal:summarize(warm.map(r=>r.totalMs))},rows,limitations:['Mac Node CPU, permanent real core graph only; excludes browser, GPU, streamed local streets and physical phones.','Slices target 1ms, not a hard deadline; indivisible work, GC and host scheduling can overrun. Every slice is included.','Total CPU may grow due to cooperative scheduling; the goal is reducing uninterrupted work in active guidance.','All points, edge identities, lengths and completion flags match frozen V36 exactly.']};
  await mkdir('docs/performance/frame-spikes-v36',{recursive:true});
  await writeFile('docs/performance/frame-spikes-v36/gps-cpu.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({cold:report.cold,warm:report.warm,exactComparisons:report.exactComparisons},null,2));
}finally{await rm(temporary,{recursive:true,force:true});}
