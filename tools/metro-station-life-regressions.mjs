// Official directed services, restrained station signs and real-dwell passenger
// component regressions. This does not replace browser readability validation.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'roadster-station-life-'));
let count = 0; const test = async (name, run) => { await run(); count++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: "export * from './game/src/world/metro-service';export * from './game/src/world/metro-geometry';export * from './game/src/world/metro-station-visuals';export * from './game/src/game/station-life';export * from './game/src/game/metro';export {initTemplates} from './game/src/core/util';export {BoxGeometry,RingGeometry,MeshBasicMaterial} from './game/node_modules/three/build/three.module.js';", resolveDir: root, loader: 'ts' }, outfile: join(temp, 'test.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { MetroTrains, MetroStationLife, metroCrowdDemand, STATION_CROWD_MODEL, METRO_SERVICE_SOURCE, metroMarqueeOffset, metroCorridors, metroServiceForRun, drawMetroStationVisuals, stationPassengerPose, initTemplates, BoxGeometry, RingGeometry, MeshBasicMaterial } = await import(pathToFileURL(join(temp, 'test.mjs')));
  initTemplates({ rbox: new BoxGeometry(1, 1, 1), ring: new RingGeometry(1, 1.35, 12) });
  const material = new MeshBasicMaterial({ vertexColors: true }), mats = { body: material, lights: material };
  const source = { lines: [{ id: 'red', pts: [[100,500],[900,500]] }], stations: [{ id:'fixture_station',name:'Fixture Station',p:[500,500],lines:['red'] }], deckHeight:11 };
  const fixture = () => new MetroTrains(source, mats);
  const core = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city/core.pack.wasm'))));
  await test('all three official services reverse origin and destination with the actual sourced run direction', () => {
    const expected={red:['Miyapur','L B Nagar'],blue:['Nagole','Raidurg'],green:['JBS Parade Ground','MG Bus Station']};
    assert.ok(METRO_SERVICE_SOURCE.urls.every(u=>/^https:\/\/(hmrl\.co\.in|ltmetro\.com)\//.test(u)));
    for(const corridor of metroCorridors(core.metro.lines)){
      const a=metroServiceForRun(corridor,1,core.metro.stations),b=metroServiceForRun(corridor,-1,core.metro.stations);
      assert.deepEqual([a.origin,a.destination].sort(),expected[corridor.lineId].slice().sort());assert.equal(a.origin,b.destination);assert.equal(a.destination,b.origin);
      assert.equal(a.text,`${a.origin} → ${a.destination}`);
    }
    const blue=metroCorridors(core.metro.lines).find(c=>c.lineId==='blue');
    assert.equal(metroServiceForRun(blue,1,core.metro.stations).text,'Raidurg → Nagole');
    assert.equal(metroServiceForRun(blue,-1,core.metro.stations).text,'Nagole → Raidurg');
  });
  await test('station geometry draws exactly two end boards and two inward platform boards with elevated bench collisions', () => {
    const boxes=[],signs=[],walls=[]; const frame={cx:500,cz:500,hx:1,hz:0};
    const result=drawMetroStationVisuals(source.stations[0],frame,11,{B:{st:{box:(...a)=>boxes.push(a)}},signs,wall:w=>walls.push(w)});
    assert.equal(signs.length,4);assert.equal(result.exterior.length,2);assert.equal(result.interior.length,2);assert.equal(result.benches,4);
    assert.equal(boxes.filter(b=>b[3]===16&&b[4]===2.25||b[3]===.14&&b[4]===1.35).length,4,'one physical backing per named board');
    for(const s of signs.filter(s=>s.id.startsWith('mst_interior_'))){const normal=[-s.right[2],s.right[0]];assert.ok(Math.abs(normal[0])<1e-9);assert.ok(normal[1]*(500-s.c[2])>0);assert.ok(s.w<=7);}
    for(const s of signs.filter(s=>s.id.startsWith('mst_exterior_')))assert.ok(Math.abs(s.c[0]-500)>68&&s.c[1]+s.h/2<9.8);
    assert.equal(walls.length,16);assert.ok(walls.every(w=>Math.abs(w.y0a-12.2)<1e-8&&Math.abs(w.y1a-13.4)<1e-8&&Math.abs(w.az-500)>6));
  });
  await test('marquee keeps short routes still, pauses at both complete ends and never scrolls beyond the text', () => {
    assert.equal(metroMarqueeOffset(600,988,100),0);assert.equal(metroMarqueeOffset(1400,988,0),0);
    const positions=Array.from({length:500},(_,i)=>metroMarqueeOffset(1400,988,i/10));
    assert.ok(positions.some(p=>p===0)&&positions.some(p=>p===412));assert.ok(positions.every(p=>p>=0&&p<=412));
    assert.ok(positions.some((p,i)=>i&&p<positions[i-1]),'the full destination returns without a discontinuous reset');
  });
  await test('both sides of every visible coach receive the current directed service and long names scroll', () => {
    const previous=globalThis.document,contexts=[];
    globalThis.document={createElement:()=>{const context={font:'',draws:[],measureText:t=>({width:t.length*40}),fillRect(){},save(){},beginPath(){},rect(){},clip(){},restore(){},fillText(text,x,y){this.draws.push({text,x,y});}};contexts.push(context);return{width:0,height:0,dataset:{},getContext:()=>context};}};
    try{
      const input={...source,lines:[{id:'green',pts:[[100,500],[900,500]]}],stations:[]},metro=new MetroTrains(input,mats),train=metro.trains.find(t=>t.run.dir===1);metro.trains=[train];
      Object.assign(train,{s:430,v:0,next:600,dwell:18,terminal:false});metro.update(0,500,500);
      assert.equal(train.mesh.userData.metroService.text,'MG Bus Station → JBS Parade Ground');
      for(const coach of train.mesh.children)assert.equal(coach.userData.metroRoutePanels.length,2);
      for(let i=0;i<20;i++)metro.update(.1,500,500);
      assert.ok(contexts.some(c=>new Set(c.draws.map(d=>d.x)).size>1),'overflowing route text actually redraws at changing offsets');
      train.run=train.run.peer;Object.assign(train,{s:430,v:0,next:200,dwell:18,terminal:false});metro.update(0,500,500);
      assert.equal(train.mesh.userData.metroService.text,'JBS Parade Ground → MG Bus Station');
      assert.ok(contexts.some(c=>c.draws.some(d=>d.text==='JBS PARADE GROUND → MG BUS STATION')));
    }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
  });
  await test('actual station arrival emits correct-platform door positions only while the train is dwelling', () => {
    const metro=fixture(),train=metro.trains.find(t=>t.run.dir===1),stop=train.run.stationStops[0].s;metro.trains=[train];
    Object.assign(train,{s:stop-1,v:3,next:stop,dwell:0,terminal:false});metro.update(0,500,500);assert.equal(metro.stationDwells.length,0);
    Object.assign(train,{s:stop-.05,v:1,next:stop,dwell:0});metro.update(.05,500,500);
    const d=metro.stationDwells[0];assert.ok(d);assert.equal(d.stationId,'fixture_station');assert.equal(d.platformSide,-1);assert.equal(d.direction,1);assert.equal(d.doors.length,9);
    assert.ok(d.doors.every(p=>Math.abs(p.z-496.55)<1e-7&&p.y===12.2));assert.ok(Math.max(...d.doors.map(p=>p.x))-Math.min(...d.doors.map(p=>p.x))>50);
    train.dwell=.01;metro.update(.05,500,500);assert.equal(metro.stationDwells.length,0,'no boarding snapshot remains at departure');
    for(const coach of train.mesh.children)for(const doors of coach.userData.metroDoorGroups.values())assert.equal(doors.visible,false);
  });
  await test('peak and off-peak crowds are bounded explicitly heuristic choices, with stationary seated waiting figures', () => {
    assert.match(STATION_CROWD_MODEL,/heuristic.*not measured/i);assert.equal(metroCrowdDemand(9*60).band,'peak');assert.equal(metroCrowdDemand(12*60).band,'off_peak');
    assert.ok(metroCrowdDemand(9*60).waitingPerSide>metroCrowdDemand(12*60).waitingPerSide);assert.ok(metroCrowdDemand(18*60).heuristic);
    const life=new MetroStationLife(source,material);life.update(0,9*60,undefined,500,500);const state=life.active.get('fixture_station');
    assert.equal(state.waiting.filter(w=>w.actor.group.visible).length,24);const before=state.waiting.map(w=>w.actor.group.position.toArray()),peakGeometry=state.waitingBatch.geometry;let disposed=false;peakGeometry.addEventListener('dispose',()=>disposed=true);
    life.update(.1,12*60,[],500,500);assert.equal(state.waiting.filter(w=>w.actor.group.visible).length,8);assert.deepEqual(state.waiting.map(w=>w.actor.group.position.toArray()),before);
    assert.equal(disposed,true,'obsolete crowd batch releases its geometry');assert.ok(peakGeometry.attributes.position.count>state.waitingBatch.geometry.attributes.position.count);
    assert.equal(state.group.children.filter(c=>c.name==='Stationary waiting passengers').length,1,'stationary crowds stay batched for phone rendering');
  });
  await test('boarding and alighting use a real dwell, freeze with zero time and clear immediately when it ends', () => {
    const metro=fixture(),train=metro.trains.find(t=>t.run.dir===1),stop=train.run.stationStops[0].s;metro.trains=[train];Object.assign(train,{s:stop,v:0,next:stop,dwell:18,terminal:false});metro.update(0,500,500);
    const life=new MetroStationLife(source,material,{lowQ:true});life.update(0,9*60,metro.stationDwells,500,500);const state=life.active.get('fixture_station');assert.equal(state.transfers.size,1);
    const actors=[...state.transfers.values()].flat();assert.equal(actors.filter(p=>p.kind==='boarding').length,5);assert.equal(actors.filter(p=>p.kind==='alighting').length,5);
    const before=actors.map(p=>p.actor.group.position.toArray());life.update(0,9*60,metro.stationDwells,500,500);assert.deepEqual(actors.map(p=>p.actor.group.position.toArray()),before);
    const frame=life.stations[0].frame,door=metro.stationDwells[0].doors[0];const a=stationPassengerPose(frame,door,-1,'boarding',0,6),b=stationPassengerPose(frame,door,-1,'boarding',0,9);
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>1);assert.equal(a.y,12.2);assert.equal(b.y,12.2);
    life.update(.1,9*60,[],500,500);assert.equal(state.transfers.size,0);assert.ok(actors.every(p=>p.actor.group.parent===null),'no moving-train passengers remain on the edge');
    life.update(.1,9*60,[],2000,2000);assert.equal(life.active.size,0);assert.equal(life.group.children.length,0);
  });
  await test('opposite runs expose opposite platform flows while leaving the physical roof/collision envelopes intact', () => {
    const metro=fixture();for(const train of metro.trains){const stop=train.run.stationStops[0].s;Object.assign(train,{s:stop,v:0,next:stop,dwell:18,terminal:false});}
    metro.update(0,500,500);assert.equal(metro.stationDwells.length,2);assert.deepEqual(metro.stationDwells.map(d=>d.platformSide).sort(),[-1,1]);
    assert.equal(metro.bodies.length,6);assert.ok(metro.bodies.every(b=>Math.abs(b.roof-15.725)<1e-8&&b.halfWidth===1.5));
  });
  await test('station crowds cannot appear on an unloaded platform and disappear when that tile unloads', () => {
    let loaded=false;const life=new MetroStationLife(source,material,{isStationLoaded:()=>loaded});life.update(0,9*60,undefined,500,500);assert.equal(life.active.size,0);
    loaded=true;life.update(0,9*60,undefined,500,500);assert.equal(life.active.size,1);const batch=life.active.get('fixture_station').waitingBatch;let disposed=false;batch.geometry.addEventListener('dispose',()=>disposed=true);
    loaded=false;life.update(.1,9*60,undefined,500,500);assert.equal(life.active.size,0);assert.equal(life.group.children.length,0);assert.equal(disposed,true);
  });
  await test('all 57 modeled stations have waiting crowds and matched real services, while unmodeled interchange services are guarded', () => {
    const metro=new MetroTrains(core.metro,mats),life=new MetroStationLife(core.metro,material,{lowQ:true});assert.equal(life.stations.length,core.metro.stations.length);
    for(const st of life.stations){
      life.update(0,12*60,undefined,st.frame.cx,st.frame.cz);assert.ok(life.active.has(st.id),`${st.id}: stationary crowds`);
      const runs=metro.runs.filter(r=>r.corridor.lineId===st.lineId&&r.stationStops.some(s=>s.id===st.id));assert.equal(runs.length,2,`${st.id}: real train service both ways`);
    }
    assert.equal(life.unmodeledServices.length,3);
    for(const gap of life.unmodeledServices){
      const st=life.stations.find(s=>s.id===gap.stationId),p={x:st.frame.cx,z:st.frame.cz,y:core.metro.deckHeight+1.2,hx:st.frame.hx,hz:st.frame.hz};
      life.update(0,9*60,[{trainId:'unmodeled-test',stationId:st.id,lineId:gap.lineId,direction:1,platformSide:-1,elapsed:5,remaining:13,doors:[p]}],p.x,p.z);
      assert.equal(life.active.get(st.id).transfers.size,0,'no people board a service with no modeled platform pair');
    }
    console.log('METRO_MODELED_PLATFORM_COVERAGE',JSON.stringify({sourceStations:life.stations.length,modeledPlatformDirections:life.stations.length*2,unmodeledInterchangeDirections:life.unmodeledServices.length*2,unmodeledServices:life.unmodeledServices,crowdModel:life.densityModel}));
  });
  console.log(`${count} metro station-life regression groups passed (offline production components).`);
}finally{await rm(temp,{recursive:true,force:true});}
