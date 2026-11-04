import test from 'node:test';
import assert from 'node:assert/strict';
import { actualWorldWorker } from '../fixtures/actual-world-worker';
import { verifiedProfileData } from '../../src/world/road-profile-corrections';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { applySourceRoadStage } from '../../src/world/road-source-stage';
import { prepareRoadGrades,rebaseRoadStops } from '../../src/world/road-grades';

test('actual World init and actual tileworker use real pack decode and transferred Float32 geometry',async t=>{
  const fixture=await actualWorldWorker({allowInactive:true});
  try{
    const expected=applySourceRoadStage(JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString())),original=expected.roads;
    expected.roads=prepareRoadGrades(original);const rebased=rebaseRoadStops(expected,original,expected.roads);
    assert.ok(rebased.rebased>0,'The real city must exercise the omitted generic stop-height stage');
    assert.deepEqual(fixture.startup.stopRebase,{rebased:rebased.rebased,ambiguous:rebased.ambiguous,moved:rebased.moved});
    const stopSHA256=createHash('sha256').update(JSON.stringify({food:expected.food.map(p=>p.stop),theatres:expected.theatres.map(p=>p.stop),drops:expected.drops})).digest('hex');
    assert.equal(fixture.startup.stopSHA256,stopSHA256,'Actual fixture matches main.ts source→generic→stop-rebase before World');
    assert.equal(fixture.initialization.type,'init');assert.equal(fixture.initialization.modelOverlayActive,fixture.world.modeledRoadReport.active);
    const built=await fixture.build('3_-3');assert.equal(built.key,'3_-3');assert.ok(built.buffers.length>0);assert.ok(built.surfaceGrid.size>0);
    for(const b of built.buffers){assert.ok(b.pos instanceof Float32Array);assert.ok(b.pos.length>0);assert.ok(b.pos.every(Number.isFinite));}
    assert.ok(fixture.messageTransfers.some(m=>m.type==='built'&&m.transferCount>0&&m.transferCount===m.detachedBuffers));
    assert.equal((fixture.world as any).workerTimer,null,'No retry timer is created by the successful transport adapter');fixture.verifySources();
    t.diagnostic(JSON.stringify({scope:fixture.scope,modelActive:fixture.world.modeledRoadReport.active,buffers:built.buffers.length,roadSurfaces:built.surfaceGrid.size,transfers:fixture.messageTransfers}));
  }finally{fixture.dispose();}
});

test('conditioned core reuse, clone reuse and worker restart retain active tile/node geometry without double rebasing',{skip:!verifiedProfileData.geometry?.roads.length},async t=>{
  const data=verifiedProfileData.geometry!,first=await actualWorldWorker(),owned=[first];
  const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
  const physical=(core:typeof first.core)=>sha(JSON.stringify({nodes:core.nodes,roads:core.roads.map(e=>({id:e.id,pts:e.pts,elev:e.elev,w:e.w,lanes:e.lanes,from:e.from,to:e.to,oneway:e.oneway,joinedPavement:e.joinedPavement,scenerySource:e.scenerySource})),food:core.food,theatres:core.theatres,drops:core.drops}));
  const buffers=(tile:Awaited<ReturnType<typeof first.build>>)=>{const h=createHash('sha256');for(const b of tile.buffers){h.update(b.mat);for(const a of[b.pos,b.nor,b.uv,b.col])h.update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));}return h.digest('hex');};
  try{
    assert.ok(data.tileRoads.length,'Actual reuse gate must include a moved tile-only street');const street=data.tileRoads[0].id;
    let key:string|undefined;
    for(const[file,expected]of Object.entries(data.sourcePackSHA256??{})){
      const bytes=readFileSync(file);assert.equal(sha(bytes),expected);const pack=JSON.parse(gunzipSync(bytes).toString());
      key=Object.keys(pack.tiles).find(k=>pack.tiles[k].roads.some(e=>e.id===street&&!e.ctx));if(key)break;
    }
    assert.ok(key,'Find the source-bound actual owner of the moved side street');
    const before=physical(first.core),baseline=buffers(await first.build(key!));
    const second=await actualWorldWorker({reuseCore:first.core});owned.push(second);
    assert.equal(second.world.modeledRoadReport.active,true);assert.deepEqual(second.world.modeledRoadReport.mismatched,[]);assert.equal(second.world.modeledRoadReport.movedStops,0);assert.equal(physical(second.core),before);
    assert.equal(second.initialization.modelOverlayActive,true);assert.equal(buffers(await second.build(key!)),baseline);
    const restart=await second.restart();assert.equal(restart.modelOverlayActive,true);assert.deepEqual(restart,second.initialization);assert.equal(buffers(await second.build(key!)),baseline);
    const third=await actualWorldWorker({reuseCore:structuredClone(second.core)});owned.push(third);
    assert.equal(third.world.modeledRoadReport.active,true);assert.deepEqual(third.world.modeledRoadReport.mismatched,[]);assert.equal(third.world.modeledRoadReport.movedStops,0);assert.equal(physical(third.core),before);assert.equal(buffers(await third.build(key!)),baseline);
    for(const fixture of owned)fixture.verifySources();
    t.diagnostic(JSON.stringify({street,tile:key,physicalCoreSHA256:before,emittedSHA256:baseline,reuseActive:true,cloneActive:true,restartActive:true,doubleStopRebase:false}));
  }finally{for(const fixture of owned.reverse())fixture.dispose();}
});
