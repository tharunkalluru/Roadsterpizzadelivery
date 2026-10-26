import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temporary = await mkdtemp(join(tmpdir(), 'roadster-reports-'));
const sqlite = new DatabaseSync(':memory:'); let groups = 0;
const test = async (name, run) => { await run(); groups++; console.log('PASS '+name); };
try {
  await build({ entryPoints: [join(root, 'game/worker/index.ts')], outfile: join(temporary, 'worker.mjs'), bundle: true, platform: 'node', format: 'esm' });
  await build({ entryPoints: [join(root, 'game/src/game/bug-report.ts')], outfile: join(temporary, 'client.mjs'), bundle: true, platform: 'node', format: 'esm' });
  await build({ entryPoints: [join(root, 'game/vite.config.ts')], outfile: join(temporary, 'config.mjs'), bundle: true, platform: 'node', format: 'esm', plugins: [{ name: 'config-api-only', setup(b) { b.onResolve({ filter: /^vite$/ }, () => ({ path: 'vite', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const defineConfig = value => value;' })); } }] });
  const { default: worker } = await import(pathToFileURL(join(temporary, 'worker.mjs'))), { gameCoordinates, reportObservations, BugReporter } = await import(pathToFileURL(join(temporary, 'client.mjs')));
  const sql = await readFile(join(root, 'game/drizzle/0000_busy_rictor.sql'), 'utf8'); sqlite.exec(sql);
  const DB = { prepare(sql) { const stmt = sqlite.prepare(sql); return { bind(...values) { return { async first() { return stmt.get(...values) || null; }, async run() { return stmt.run(...values); } }; } }; } };
  const env = { DB, ASSETS: { fetch: request => new Response('asset:'+new URL(request.url).pathname) } };
  const payload = () => ({ id: crypto.randomUUID(), session: crypto.randomUUID(), screenshot: null, context: { build: 'qa-build', area: 'Gachibowli', location: { x: -14125.757, y: 6.25, z: -3592.763, ...gameCoordinates({ lat: 17.4, lon: 78.5 }, -14125.757, -3592.763), tile: '-15_-4' }, road: { id: 'source-road', name: 'Road' }, observations: ['Cause needs review.'], recent: [], errors: [] } });
  const request = (value, extra={}) => new Request('https://game.test/api/bug-reports', { method:'POST', headers:{ 'content-type':'application/json', origin:'https://game.test' }, body:JSON.stringify(value), ...extra });
  const QUEUE='p2ph-bug-reports-v1', QUARANTINE='p2ph-bug-report-quarantine-v1';
  const offline=async()=>new Response('{}',{status:503});
  const receipt=async(_url,options)=>Response.json({id:JSON.parse(options.body).id,saved:true});
  const client=(seed=[],locks=undefined)=>{
    const memory=new Map(seed),events=new Map();
    globalThis.localStorage={getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v))};
    globalThis.sessionStorage=globalThis.localStorage;
    globalThis.addEventListener=(name,fn)=>events.set(name,[...(events.get(name)||[]),fn]);
    globalThis.location=new URL('https://game.test/');
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks}});
    globalThis.fetch=offline;return {memory,events};
  };
  await test('actual SQL migration stores precise game coordinates, source road and build; retries are idempotent', async () => {
    const p=payload(); const response=await worker.fetch(request(p),env); assert.equal(response.status,201); assert.deepEqual(await response.json(),{id:p.id,saved:true});
    const row=sqlite.prepare('SELECT * FROM bug_reports WHERE id=?').get(p.id); assert.equal(row.world_x,p.context.location.x); assert.equal(row.game_latitude,p.context.location.latitude); assert.equal(row.road_id,'source-road'); assert.equal(row.build_id,'qa-build');
    assert.equal((await worker.fetch(request(p),env)).status,200); assert.equal(sqlite.prepare('SELECT count(*) AS n FROM bug_reports WHERE id=?').get(p.id).n,1);
  });
  await test('public API cannot read reports, rejects foreign origins, malformed coordinates and oversized bodies',async()=>{
    assert.equal((await worker.fetch(new Request('https://game.test/api/bug-reports'),env)).status,405);
    const p=payload();assert.equal((await worker.fetch(request(p,{headers:{'content-type':'application/json',origin:'https://other.test'}}),env)).status,403);
    p.context.location.x='not a number';assert.equal((await worker.fetch(request(p),env)).status,400);
    assert.equal((await worker.fetch(request({data:'x'.repeat(220000)}),env)).status,413);
    const e=payload();assert.equal((await worker.fetch(request(e),{...env,DB:null})).status,503);
    assert.equal(await (await worker.fetch(new Request('https://game.test/city/core.pack.wasm'),env)).text(),'asset:/city/core.pack.wasm');
  });
  await test('per-session burst limit is bounded and does not convert a failed insert into success',async()=>{
    const session=crypto.randomUUID();for(let i=0;i<5;i++){const p=payload();p.session=session;assert.equal((await worker.fetch(request(p),env)).status,201);}
    const p=payload();p.session=session;assert.equal((await worker.fetch(request(p),env)).status,429);assert.equal(sqlite.prepare('SELECT id FROM bug_reports WHERE id=?').get(p.id),undefined);
    const badDB={prepare(){throw new Error('offline');}};assert.equal((await worker.fetch(request(payload()),{...env,DB:badDB})).status,503);
  });
  await test('concurrent SQL admissions never exceed five reports; concurrent duplicate UUID retries remain idempotent',async()=>{
    const session=crypto.randomUUID(),reports=Array.from({length:16},()=>({...payload(),session}));
    const responses=await Promise.all(reports.map(p=>worker.fetch(request(p),env)));
    assert.equal(responses.filter(r=>r.status===201).length,5);assert.equal(responses.filter(r=>r.status===429).length,11);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM bug_reports WHERE session_id=?').get(session).n,5);
    const admitted=reports[responses.findIndex(r=>r.status===201)];assert.equal((await worker.fetch(request(admitted),env)).status,200);
    const duplicate=payload(),retries=await Promise.all(Array.from({length:8},()=>worker.fetch(request(duplicate),env)));
    assert.equal(retries.filter(r=>r.status===201).length,1);assert.equal(retries.filter(r=>r.status===200).length,7);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM bug_reports WHERE id=?').get(duplicate.id).n,1);
  });
  await test('projection is city-data inverse and potential blockage is explicitly an inference',()=>{
    assert.deepEqual(gameCoordinates({lat:17.4,lon:78.5},0,0),{latitude:17.4,longitude:78.5});
    const s=Array.from({length:8},(_,time)=>({time,x:1,y:0,z:1,throttle:1}));assert.ok(reportObservations(s,'road',0,0)[0].startsWith('Possible'));
    assert.ok(reportObservations([],'road',0,0)[0].includes('requires')===false);assert.ok(reportObservations([],'road',0,0)[0].includes('reported this spot'));
  });
  await test('offline client retains frozen original report; truthful queued status and later retry use same ID',async()=>{
    const {memory}=client();
    globalThis.fetch=async()=>new Response('{}',{status:503});const reporter=new BugReporter(),p=payload();const envelope=reporter.envelope(p.context,null);p.context.location.x=999;
    assert.notEqual(envelope.context.location.x,999);assert.equal(await reporter.submit(envelope),'queued');assert.ok(memory.get('p2ph-bug-reports-v1').includes(envelope.id));
    globalThis.fetch=async(_url,options)=>{const sent=JSON.parse(options.body);return Response.json({id:sent.id,saved:true});};await reporter.flush();assert.deepEqual(JSON.parse(memory.get('p2ph-bug-reports-v1')),[]);
    globalThis.localStorage.setItem=()=>{throw new Error('full');};globalThis.fetch=async()=>{throw new Error('offline');};assert.equal(await reporter.submit(reporter.envelope(payload().context,null)),'failed');
  });
  await test('independent tab queues merge with exclusive Web Locks and the synchronous fallback',async()=>{
    for(const useLocks of [true,false]){
      let chain=Promise.resolve(),calls=0;
      const locks={request(name,options,callback){assert.equal(name,QUEUE);assert.equal(options.mode,'exclusive');calls++;const result=chain.then(callback);chain=result.catch(()=>{});return result;}};
      const {memory}=client([],useLocks?locks:undefined),a=new BugReporter(),b=new BugReporter(),p=payload(),q=payload();
      assert.deepEqual(await Promise.all([a.submit(p),b.submit(q)]),['queued','queued']);
      assert.deepEqual(JSON.parse(memory.get(QUEUE)).map(r=>r.id).sort(),[p.id,q.id].sort());
      if(useLocks)assert.ok(calls>=2);
    }
  });
  await test('a delayed flush removes only its receipt and preserves another tab\'s newly queued report',async()=>{
    const {memory}=client(),a=new BugReporter(),b=new BugReporter(),p=payload(),q=payload();assert.equal(await a.submit(p),'queued');
    let release,started;const waiting=new Promise(resolve=>{started=resolve;});
    globalThis.fetch=async(_url,options)=>{const sent=JSON.parse(options.body);if(sent.id===p.id){started();return new Promise(resolve=>{release=()=>resolve(Response.json({id:p.id,saved:true}));});}return offline();};
    const flushing=a.flush();await waiting;assert.equal(await b.submit(q),'queued');release();await flushing;
    assert.deepEqual(JSON.parse(memory.get(QUEUE)).map(r=>r.id),[q.id]);
  });
  await test('invalid cached evidence is retained in quarantine and cannot starve a valid report',async()=>{
    const invalid={id:'legacy-invalid-id',context:{road:'original-evidence'}},good=payload();
    const {memory}=client([[QUEUE,JSON.stringify([invalid,good])]]);globalThis.fetch=receipt;
    const reporter=new BugReporter();await reporter.flush();assert.deepEqual(JSON.parse(memory.get(QUEUE)),[]);
    assert.deepEqual(JSON.parse(memory.get(QUARANTINE))[0].report,invalid);
    assert.equal(JSON.parse(memory.get(QUARANTINE))[0].reason,'invalid_cached_report');
  });
  await test('permanent server rejection quarantines the full original and continues later reports',async()=>{
    const bad=payload(),good=payload(),{memory}=client([[QUEUE,JSON.stringify([bad,good])]]),sent=[];
    globalThis.fetch=async(url,options)=>{const p=JSON.parse(options.body);sent.push(p.id);return p.id===bad.id?new Response('{}',{status:400}):receipt(url,options);};
    const reporter=new BugReporter();await reporter.flush();assert.deepEqual(sent,[bad.id,good.id]);assert.deepEqual(JSON.parse(memory.get(QUEUE)),[]);
    const held=JSON.parse(memory.get(QUARANTINE));assert.equal(held.length,1);assert.deepEqual(held[0].report,bad);assert.equal(held[0].reason,'permanent_server_rejection');
  });
  await test('full quarantine preserves rejected evidence while valid reports still flush; full pending queues never evict',async()=>{
    const rejected=payload(),good=payload(),held=Array.from({length:8},(_,i)=>({report:{evidence:i},reason:'retained',quarantinedAt:'2026-10-26'}));
    const {memory}=client([[QUEUE,JSON.stringify([rejected,good])],[QUARANTINE,JSON.stringify(held)]]);
    globalThis.fetch=async(url,options)=>JSON.parse(options.body).id===rejected.id?new Response('{}',{status:413}):receipt(url,options);
    const reporter=new BugReporter();await reporter.flush();assert.deepEqual(JSON.parse(memory.get(QUEUE)),[rejected]);assert.deepEqual(JSON.parse(memory.get(QUARANTINE)),held);
    globalThis.fetch=offline;const pending=Array.from({length:8},payload);memory.set(QUEUE,JSON.stringify(pending));assert.equal(await reporter.submit(payload()),'failed');assert.deepEqual(JSON.parse(memory.get(QUEUE)),pending);
  });
  await test('queued acknowledgment requires durable verification and a receipt must match its report UUID',async()=>{
    const {memory}=client(),reporter=new BugReporter(),p=payload();globalThis.fetch=async()=>Response.json({id:crypto.randomUUID(),saved:true});
    assert.equal(await reporter.submit(p),'queued');assert.deepEqual(JSON.parse(memory.get(QUEUE)),[p]);
    globalThis.localStorage.setItem=()=>{};assert.equal(await reporter.submit(payload()),'failed');assert.deepEqual(JSON.parse(memory.get(QUEUE)),[p]);
  });
  await test('malformed stored JSON is preserved, invalid sessions are replaced and storage failure never claims queued',async()=>{
    const {memory}=client([[QUEUE,'broken['],['p2ph-report-session-v1','bad-session']]),reporter=new BugReporter();await reporter.flush();
    assert.match(reporter.session,/^[0-9a-f-]{36}$/);assert.notEqual(reporter.session,'bad-session');assert.equal(JSON.parse(memory.get(QUARANTINE))[0].report,'broken[');
    globalThis.localStorage.setItem=()=>{throw new Error('quota');};assert.equal(await reporter.submit(payload()),'failed');
  });
  await test('movement history uses wall-clock seconds, expires while paused, and rejects future samples after clock correction',()=>{
    client();const reporter=new BugReporter(),originalNow=Date.now;let now=1000000;Date.now=()=>now;
    try{
      const sample={time:0,x:1,y:0,z:1,speed:0,throttle:1,brake:0,steer:0,flying:false,surface:'road'};
      for(let i=0;i<35;i++){reporter.record(sample);now+=1000;}
      assert.equal(reporter.recent.length,30);assert.equal(reporter.recent.at(-1).time,1034);assert.ok(reporter.recent[0].time>=1005);
      now+=31000;assert.equal(reporter.recent.length,0);assert.deepEqual(reporter.envelope(payload().context,null).context.recent,[]);
      reporter.record(sample);now-=10000;reporter.record(sample);assert.equal(reporter.recent.length,1);assert.equal(reporter.recent[0].time,now/1000);
    }finally{Date.now=originalNow;}
  });
  await test('a report opened after a long pause cannot infer blockage from expired throttle history',()=>{
    client();const reporter=new BugReporter(),originalNow=Date.now;let now=1000000;Date.now=()=>now;
    try{
      const sample={time:0,x:1,y:0,z:1,speed:0,throttle:1,brake:0,steer:0,flying:false,surface:'road'};
      for(let i=0;i<8;i++){reporter.record(sample);now+=1000;}
      const before=reporter.freshRecent();assert.ok(reportObservations(before,'road',0,0)[0].startsWith('Possible'));
      before[0].throttle=0;assert.equal(reporter.freshRecent()[0].throttle,1,'caller receives a detached sample snapshot');
      now+=31000;const recent=reporter.freshRecent(),context=payload().context;context.observations=reportObservations(recent,'road',0,0);
      assert.deepEqual(recent,[]);assert.ok(context.observations.every(text=>!text.startsWith('Possible')),'observations are computed before envelope capture, without stale evidence');
      const report=reporter.envelope(context,null,recent);assert.deepEqual(report.context.recent,[]);assert.deepEqual(report.context.observations,context.observations);
    }finally{Date.now=originalNow;}
  });
  await test('build fingerprint is deterministic, path-framed, and changes when only a public city pack changes',async()=>{
    const {gameBuildFingerprint}=await import(pathToFileURL(join(temporary,'config.mjs'))),fixture=join(temporary,'build-fixture');
    for(const dir of ['src','worker','public/city/packs'])await mkdir(join(fixture,dir),{recursive:true});
    for(const [path,body] of [['src/main.ts','code'],['worker/index.ts','worker'],['package-lock.json','{}'],['public/city/packs/test.pack.wasm','original-city']])await writeFile(join(fixture,path),body);
    const first=gameBuildFingerprint(fixture);assert.equal(first,gameBuildFingerprint(fixture));
    await writeFile(join(fixture,'public/city/packs/test.pack.wasm'),'updated--city');assert.notEqual(first,gameBuildFingerprint(fixture));
    await writeFile(join(fixture,'public/city/packs/test.pack.wasm'),'original-city');assert.equal(first,gameBuildFingerprint(fixture));
    await writeFile(join(fixture,'public/city/new.json'),'{}');assert.notEqual(first,gameBuildFingerprint(fixture));
  });
  console.log(`${groups} bug-report storage, privacy and retry groups passed.`);
} finally {sqlite.close();await rm(temporary,{recursive:true,force:true});}
