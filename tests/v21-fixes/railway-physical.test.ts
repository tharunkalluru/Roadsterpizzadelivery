import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { initTemplates } from '../../src/core/util';
import { RailTrains } from '../../src/game/rail';
import { buildRailwayRun } from '../../src/game/railway-flow';
import { buildRailwayCrossingSites } from '../../src/game/railway-crossings';
import { drawExtras } from '../../src/world/extras';
import { makeRailwayNetwork, railwayNetwork, prepareRailwayTransport } from '../../src/world/railway-geometry';
import { prepareRailwayClearance, ROAD_OVER_RAIL, RAIL_OVER_ROAD } from '../../src/world/railway-clearance';
import { railwayStationBoards, railwayStationCode } from '../../src/world/railway-stations';
import { prepareRoadGrades, roadGradeReport } from '../../src/world/road-grades';
import { roadStructureClearance } from '../../src/world/structure-clearance';
import { prepareRoadUnderpasses } from '../../src/world/road-underpasses';
import { RAILWAY_UNDERPASS_EVIDENCE } from '../../src/world/railway-evidence';
import type { RoadEdge, XZ } from '../../src/world/types';
import type { OsmFeature } from '../../src/world/extras';

function road(id: string, pts: XZ[], height: number): RoadEdge { return { id, pts, elev: pts.map(() => height), cls: 'primary', w: 10, lanes: 2, name: null, seg: id, oneway: null, from: null, to: null, maxspeed: null }; }
function railFeatures(): OsmFeature[] { return [{ id: 'rail:bridge', k: 'rail', t: { railway: 'rail', bridge: 'yes', layer: '1' }, l: [[-1000, 0], [1000, 0]] }]; }
function grade(pts: XZ[], values: number[]) { let max = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (d > .001) max = Math.max(max, Math.abs(values[i] - values[i - 1]) / d); } return max; }

test('crossing road soffit clears every actual rendered coach vertex while mapped rail XY stays exact', () => {
  initTemplates(); const network = makeRailwayNetwork(railFeatures()), input = [road('flyover', [[0, -1000], [0, 1000]], 6.2)];
  const result = prepareRailwayClearance(input, network.profiles);
  assert.equal(result.report.unresolved.length, 0); assert.ok(Math.min(...result.roads[0].elev!) >= ROAD_OVER_RAIL); assert.ok(result.report.raisedRoads>0);
  assert.equal(result.roads[0].pts, input[0].pts); assert.equal(result.profiles[0].pts, network.profiles[0].pts);
  const material = new THREE.MeshBasicMaterial(), trains = new RailTrains(material), geometry = trains.geo('#2f5d9a');
  const run = buildRailwayRun(new Map(result.profiles.map(r => [r.id, r])), result.profiles[0]);
  const car = new THREE.Mesh(geometry, material); trains.trains.push({ id: 'test', run, dir: 1, s: 0, v: 0, cars: [car] });
  try {
    for (let x = -25; x <= 25; x += 2.5) {
      trains.trains[0].s = 1000 + x + 11.25; trains.update(0, 0, 0, new Map()); car.updateMatrixWorld();
      const positions = geometry.getAttribute('position'), p = new THREE.Vector3(); let inspected = 0;
      for (let i = 0; i < positions.count; i++) {
        p.fromBufferAttribute(positions, i).applyMatrix4(car.matrixWorld);
        inspected++; assert.ok(p.y < Math.min(...result.roads[0].elev!) - .9, 'every coach vertex must remain below the bridge soffit');
      }
      if (Math.abs(x) < 10) { const box = new THREE.Box3().setFromObject(car); assert.ok(box.min.x < 5 && box.max.x > -5 && inspected > 0, 'exercise a visible coach crossing the bridge slab'); }
    }
  } finally { geometry.dispose(); material.dispose(); }
});

test('source railway bridges keep the running datum while roads descend smoothly and true level crossings remain level', () => {
  const source: OsmFeature[] = [
    { id: 'bridge', k: 'rail', t: { railway: 'rail', bridge: 'yes' }, l: [[-50, 0], [50, 0]] },
    { id: 'left', k: 'rail', t: { railway: 'rail' }, l: [[-1000, 0], [-50, 0]] },
    { id: 'right', k: 'rail', t: { railway: 'rail' }, l: [[50, 0], [1000, 0]] },
  ];
  const base = makeRailwayNetwork(source), roads = [road('under', [[0, -500], [0, 500]], 1), road('level', [[800, -500], [800, 500]], 0)];
  const result = prepareRailwayClearance(roads, base.profiles, {underpasses:[{name:'Verified fixture',roads:['under'],rails:['bridge'],anchor:[0,0],radius:30,source:'fixture'}]});
  assert.equal(result.profiles,base.profiles,'no road conflict may change railway running levels');
  assert.ok(result.profiles.every(r=>r.elev.every(y=>y===0)));
  assert.ok(Math.min(...result.roads[0].elev!)<=-RAIL_OVER_ROAD,'the road descends beneath the source bridge');
  assert.equal(result.roads[0].elev![0],1);assert.equal(result.roads[0].elev!.at(-1),1);
  assert.ok(grade(result.roads[0].pts,result.roads[0].elev!)<=.0650001);
  for(const p of roads[0].pts)assert.ok(result.roads[0].pts.some(q=>q[0]===p[0]&&q[1]===p[1]));
  assert.deepEqual(result.roads[1].elev, roads[1].elev); const right = result.profiles.find(r => r.id === 'right')!;
  assert.equal(right.elev.at(-1), 0); for (const r of result.profiles) assert.ok(grade(r.pts, r.elev) <= .0250001);
  const bridge = result.profiles.find(r => r.id === 'bridge')!;
  assert.ok(Math.abs(bridge.elev.at(-1)! - right.elev[0]) < 1e-8);
  assert.equal(result.report.unresolved.length, 0);
  assert.equal(buildRailwayCrossingSites(result.roads, result.profiles).some(s => s.roadId === 'level'), true);
  assert.equal(buildRailwayCrossingSites(result.roads, result.profiles).some(s => s.roadId === 'under'), false);
});

test('station identity prefers the mapped railway code, with boards on exact platform footprints facing the running track', () => {
  const features: OsmFeature[] = [
    { id: 'track', k: 'rail', t: { railway: 'rail' }, l: [[-1000, 0], [1000, 0]] },
    { id: 'numeric-node', k: 'station', t: { name: 'Test Station', ref: '2', railway: 'station' }, p: [0, 0] },
    { id: 'station-node', k: 'station', t: { name: 'Test Station', 'name:te': 'స్టేషన్', ref: 'TST', railway: 'station', network: 'IR' }, p: [1, 0] },
    { id: 'platform', k: 'platform', t: { railway: 'platform', ref: '1' }, r: [[[-100, -10], [100, -10], [100, -5], [-100, -5], [-100, -10]]] },
  ];
  const network = makeRailwayNetwork(features); assert.equal(network.stations.length, 1); assert.equal(network.stations[0].id, 'station-node');
  assert.equal(railwayStationCode(network.stations[0]), 'TST'); assert.equal(railwayStationCode(features[1]), '');
  const anchors = railwayStationBoards(network, network.stations[0]); assert.equal(anchors.length, 1); assert.equal(anchors[0].platform, 'platform');
  assert.ok(anchors[0].z > -10 && anchors[0].z < -5); assert.equal(anchors[0].source, 'mapped-platform');
  const signs: any[] = [], boxes: any[] = [];
  drawExtras([network.stations[0]], { B: { st: { box: (...args: any[]) => boxes.push(args) } }, inTile: () => true, railway: network,
    nearestRoad: () => null, onRoad: () => false, inBuilding: () => false, structureClear: network.clear,
    sign: (...args: any[]) => signs.push(args), obstacle: () => {}, wall: () => {}, solid: () => {}, lamp: () => {}, pad: () => {}, lowQ: true });
  assert.ok(signs.some(s => s[1] === 'TEST · TST')); assert.ok(signs.some(s => s[1] === 'స్టేషన్'));
  assert.ok(signs.every(s => s[5][2] > 0), 'boards face from the mapped southern platform toward the track'); assert.equal(boxes.length, 3);
});

test('the shipped network keeps every mapped point and crossing while resolving full-coach road envelopes', t => {
  const core = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()), original = railwayNetwork();
  const graded=prepareRoadGrades(core.roads), roads = prepareRoadUnderpasses(graded).roads, before = buildRailwayCrossingSites(roads, original.profiles), start = performance.now(), result = prepareRailwayTransport(roads,{underpasses:RAILWAY_UNDERPASS_EVIDENCE});
  assert.ok(result.report.atGrade>0);assert.equal(result.report.raisedRails,0);assert.deepEqual(result.patches,[]);assert.ok(result.railway.profiles.every(r=>r.elev.every(y=>y===0))); assert.equal(result.report.unresolved.length, 0); assert.equal(result.report.modeledOrder, 0);
  assert.equal(result.railway.profiles.length, original.profiles.length);
  result.railway.profiles.forEach((r, i) => { assert.equal(r.id, original.profiles[i].id); assert.deepEqual(r.pts, original.profiles[i].pts); assert.ok(grade(r.pts, r.elev) <= .0250001); });
  result.roads.forEach((r, i) => { assert.equal(r.id, roads[i].id); for(const p of roads[i].pts)assert.ok(r.pts.some(q=>q[0]===p[0]&&q[1]===p[1]),`road sourcevertex lost ${r.id}`); assert.ok(grade(r.pts, r.elev || r.pts.map(() => 0)) <= Math.max(.0650001, grade(roads[i].pts, roads[i].elev || roads[i].pts.map(() => 0)) + .000001)); });
  const after = buildRailwayCrossingSites(result.roads, result.railway.profiles);
  const ground = before.filter(s => !result.report.underpassRoadIds.includes(s.roadId) && Math.abs(s.y) < .2 && !/underpass|subway|tunnel|flyover|overpass|road over bridge/i.test(roads.find(r => r.id === s.roadId)?.name || ''));
  for (const crossing of ground) {
    const expectedY = result.report.unverifiedRoadHumps.includes(crossing.roadId) ? 0 : crossing.y;
    assert.ok(after.some(s => s.roadId === crossing.roadId && Math.hypot(s.x - crossing.x, s.z - crossing.z) < .01 && Math.abs(s.y - expectedY) < .0001), `at-grade crossing ${crossing.id} moved outside its declared datum normalization`);
  }
  const soffits = roadStructureClearance(result.roads.map(e => ({ ...e, elev: e.pts.map((_, i) => (e.elev?.[i] || 0) - .9) })), .9);
  let samples = 0; const conflicts: any[] = [];
  for (const profile of result.railway.profiles.filter(r => !r.service)) for (let i = 1; i < profile.pts.length; i += 2) {
    const a = profile.pts[i - 1], b = profile.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < .001) continue;
    const hx = (b[0] - a[0]) / len, hz = (b[1] - a[1]) / len, y = profile.elev[i] + .11, pitchAllowance = Math.abs(profile.elev[i] - profile.elev[i - 1]) / len * 11.25;
    const hits = soffits.conflicts({ x: b[0], z: b[1], hx, hz, hw: 1.57, hl: 11.25 }, y + .2 - pitchAllowance, y + 4.175 + pitchAllowance);
    if (hits.length) conflicts.push({ rail: profile.id, at: b, roads: hits }); samples++;
  }
  assert.deepEqual(conflicts, [], 'independent full-coach boxes must not intersect road deck/soffit slabs');
  for (const [id, x, z] of [['57f51bdc-476_1', 989.5, -3082.7], ['840f1b5c-8a1_0', 977.1, -3078.6]] as const) {
    const underpass = result.roads.find(r => r.id === id)!; assert.match(underpass.name!, /Underpass/i);
    const railway = result.railway.closest(x, z, 5); assert.ok(railway);
    let distance = Infinity, roadY = 0;
    for (let i = 1; i < underpass.pts.length; i++) {
      const a = underpass.pts[i - 1], b = underpass.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))), d = Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u);
      if (d < distance) { distance = d; roadY = (underpass.elev?.[i - 1] || 0) + ((underpass.elev?.[i] || 0) - (underpass.elev?.[i - 1] || 0)) * u; }
    }
    assert.ok(railway.y - roadY >= RAIL_OVER_ROAD - .02, `St Johns Road ${id} needs actual physical train clearance, not just hidden gates`);
  }
  assert.deepEqual(result.report.roadCrossings.unresolved,[],'rail clearance may not introduce a new road bridge collision');
  const at=(e:RoadEdge,x:number,z:number)=>{let distance=Infinity,y=0;for(let i=1;i<e.pts.length;i++){const a=e.pts[i-1],b=e.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(x-a[0]-dx*u,z-a[1]-dz*u);if(d<distance){distance=d;y=(e.elev?.[i-1]||0)+((e.elev?.[i]||0)-(e.elev?.[i-1]||0))*u;}}return y;};
  const oldRoads=new Map(graded.map(e=>[e.id,e])),newRoads=new Map(result.roads.map(e=>[e.id,e]));
  const roadCrossings=roadGradeReport(graded)!.bridgeClearance!.crossings;
  for(const c of roadCrossings){const old=at(oldRoads.get(c.roads[0])!,c.x,c.z)-at(oldRoads.get(c.roads[1])!,c.x,c.z);if(old>=5.2)assert.ok(at(newRoads.get(c.roads[0])!,c.x,c.z)-at(newRoads.get(c.roads[1])!,c.x,c.z)>=5.2-.01,`existing road bridge lost headroom ${c.roads.join('/')}`);}
  const again=prepareRailwayTransport(result.roads,{underpasses:RAILWAY_UNDERPASS_EVIDENCE});
  for(let i=0;i<result.roads.length;i++){assert.deepEqual(again.roads[i].pts,result.roads[i].pts);for(let j=0;j<result.roads[i].pts.length;j++)assert.ok(Math.abs((again.roads[i].elev?.[j]||0)-(result.roads[i].elev?.[j]||0))<1e-6,`repeat changed model ${result.roads[i].id}`);}
  const begumpet = result.railway.stations.filter(s => s.t.name === 'Begumpet'); assert.equal(begumpet.length, 1); assert.equal(begumpet[0].t.ref, 'BMT');
  t.diagnostic(JSON.stringify({ planAndChecksMs: performance.now() - start, finiteOverlaps: result.report.finiteOverlaps, atGrade: result.report.atGrade, separated: result.report.separated, raisedRoads: result.report.raisedRoads, raisedRails: result.report.raisedRails, loweredRoads:result.report.loweredRoads, coachSamples: samples, retainedGroundCrossings: ground.length, correctedGateSites: after.length, stations: result.railway.stations.length, mappedPlatforms: result.railway.platforms.length, roadCrossingsChecked:roadCrossings.length, derivedRoadBridgeRepairs:result.report.roadCrossings }));
});


test('two Ammuguda stations on different retained corridors are preserved while near-duplicate Begumpet identities merge',()=>{
 const network=railwayNetwork();
 const ammuguda=network.stations.filter(s=>s.t.name==='Ammuguda');
 assert.equal(ammuguda.length,2);assert.deepEqual(ammuguda.map(s=>s.id).sort(),['n12115419835','n351715591']);
 assert.ok(ammuguda.some(s=>s.t.ref==='AMQ'));assert.ok(ammuguda.some(s=>s.p?.[0]===2878.7&&s.p?.[1]===-9135.4));
 const begumpet=network.stations.filter(s=>s.t.name==='Begumpet');assert.equal(begumpet.length,1);assert.equal(begumpet[0].t.ref,'BMT');
});

test('only source bridge spans render girders and publish rideable decks, never ordinary railway approaches',()=>{
 const features:OsmFeature[]=[{id:'bridge',k:'rail',t:{railway:'rail',bridge:'yes'},l:[[-10,0],[10,0]]},{id:'approach',k:'rail',t:{railway:'rail'},l:[[10,0],[40,0]]}];
 const railway=makeRailwayNetwork(features),boxes:any[]=[],pads:any[]=[];
 drawExtras(features,{B:{st:{box:(...args:any[])=>boxes.push(args)},foot:{box:(...args:any[])=>boxes.push(args)}},inTile:()=>true,railway,nearestRoad:()=>null,onRoad:()=>false,inBuilding:()=>false,structureClear:()=>true,sign:()=>{},obstacle:()=>{},wall:()=>{},solid:()=>{},lamp:()=>{},pad:(...args:any[])=>pads.push(args),lowQ:true} as any);
 assert.equal(pads.length,3);assert.deepEqual(pads[0],[-10,0,10,0,.18,2.6]);
 assert.ok(pads.every(p=>Math.abs(p[4]-.18)<1e-8),'bridge and approach tyre contact share the visible trackbed height');
 const girders=boxes.filter(b=>b[3]===5.2&&b[4]===1.4);assert.equal(girders.length,1);assert.equal(girders[0][0],0);
 assert.ok(boxes.some(b=>b[3]===3.4&&b[4]===.18&&b[0]>10),'ordinary approaches retain ballast instead of a flyover slab');
});


test('small unsurveyed inherited road humps remain gated level crossings instead of becoming invented flyovers',()=>{
 const network=makeRailwayNetwork([{id:'track',k:'rail',t:{railway:'rail'},l:[[-500,0],[500,0]]}]);
 const hump={...road('hump',[[0,-500],[0,-10],[0,0],[0,10],[0,500]],0),elev:[0,.5,1.41,.5,0]};
 const result=prepareRailwayClearance([hump],network.profiles);assert.ok(result.roads[0].elev!.every(y=>Math.abs(y)<1e-7));
 assert.equal(result.report.raisedRoads,0);assert.deepEqual(result.report.unverifiedRoadHumps,['hump']);assert.equal(buildRailwayCrossingSites(result.roads,result.profiles).length,1);
});

test('existing upper road bridges retain their headroom when rail clearance raises the lower road bridge',()=>{
 const network=makeRailwayNetwork([{id:'rail',k:'rail',t:{railway:'rail'},l:[[-1000,0],[1000,0]]}]);
 const roads=[road('lower-bridge',[[0,-1000],[0,1000]],4),road('upper-bridge',[[-1000,10],[1000,10]],10)];
 const result=prepareRailwayClearance(roads,network.profiles);assert.ok(Math.min(...result.roads[0].elev!)>=ROAD_OVER_RAIL);
 assert.ok(Math.min(...result.roads[1].elev!)-Math.max(...result.roads[0].elev!)>=5.2);
 assert.ok(result.report.roadCrossings.repaired>0);assert.deepEqual(result.report.roadCrossings.unresolved,[]);assert.equal(result.profiles,network.profiles);
});
