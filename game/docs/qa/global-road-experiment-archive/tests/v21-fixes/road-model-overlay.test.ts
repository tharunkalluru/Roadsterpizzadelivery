import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVerifiedRoadModel, applyVerifiedRoadTileGeometry, markVerifiedRoadModelConditioned, type VerifiedRoadModel } from '../../src/world/road-model-overlay';
import { applyVerifiedRoadProfiles, roadProfileInput } from '../../src/world/road-profile-corrections';
import { applyRoadGradePatches, currentRoadGradePatches, installPreparedRoadCache, prepareRoadGrades, roadGradeReport, rebaseRoadStops } from '../../src/world/road-grades';
import { transportTileRoadNodes } from '../../src/world/road-node-transport';
import { RoadGraph } from '../../src/game/roadgraph';
import type { CoreData, RoadEdge } from '../../src/world/types';

function fixture() {
  const a: RoadEdge = { id: 'a', seg: 'source-a', cls: 'primary', name: 'Fixture', w: 7, lanes: 2, oneway: 'backward', from: 'start', to: 'join', pts: [[10, 10], [30, 10]], elev: null, maxspeed: 40 };
  const b: RoadEdge = { ...a, id: 'b', seg: 'source-b', from: 'join', to: 'end', pts: [[30, 10], [50, 10]] };
  const side: RoadEdge = { ...a, id: 'tile-side', seg: 'source-side', w: 6, lanes: 1, from: 'join', to: 'side', pts: [[30, 10], [30, 30]] };
  const nodes = { join: { before: [30, 10] as [number, number], after: [30, 12] as [number, number], delta: [0, 2] as [number, number] } };
  const core: CoreData = { roads: [a, b], nodes: { start: [10, 10], join: [30, 10], end: [50, 10] }, food: [{ id: 'stop', tile: [0, 0], stop: [20, 14, 0, 'Fixture'] }], theatres: [], drops: [] } as any;
  const data: VerifiedRoadModel = { sourceGradeModelSHA256: 'synthetic', sourcePrototypeSHA256: 'synthetic', supersedesRoadGradeProfileIds: [], nodes,
    roads: [a, b].map((e, i) => ({ id: e.id, expected: roadProfileInput(e), model: { ...roadProfileInput(e), pts: i ? [[30, 12], [40, 11], [50, 10]] : [[10, 10], [20, 11], [30, 12]], elev: i ? [.2, .1, 0] : [0, .1, .2], scenerySource: { pts: e.pts, elev: e.elev, width: e.w } }, sourceArc: [0, 10, 20] })),
    tileRoads: [transportTileRoadNodes(side, nodes)!] };
  return { core, data, side };
}

test('core geometry, shared nodes and source-arclength stops install atomically without mutating source roads', () => {
  const { core, data } = fixture(), original = core.roads, source = JSON.stringify(original);
  const report = applyVerifiedRoadModel(core, data);
  assert.equal(report.active, true); assert.deepEqual(report.applied, ['a', 'b']); assert.deepEqual(report.mismatched, []);
  assert.deepEqual(core.nodes.join, [30, 12]); assert.deepEqual(core.roads.map(e => e.pts), data.roads.map(p => p.model.pts));
  assert.deepEqual(core.food[0].stop, [20, 15, .1, 'Fixture']); assert.equal(report.movedStops, 1);
  assert.equal(JSON.stringify(original), source); assert.deepEqual(original[0].pts, [[10, 10], [30, 10]]);
});

test('a corrected-source model cannot install or be reused on a missing or different source generation', () => {
  const { core, data } = fixture(); data.sourceRoadGeometryGeneration = 'a'.repeat(64);
  for (const generation of [undefined, 'b'.repeat(64)]) {
    core.sourceRoadGeometryGeneration = generation;
    const before = JSON.stringify(core), result = applyVerifiedRoadModel(core, data);
    assert.equal(result.active, false); assert.deepEqual(result.mismatched, ['source-stage']); assert.equal(JSON.stringify(core), before);
  }
  core.sourceRoadGeometryGeneration = data.sourceRoadGeometryGeneration;
  assert.equal(applyVerifiedRoadModel(core, data).active, true);
  core.sourceRoadGeometryGeneration = 'b'.repeat(64);
  const before = JSON.stringify(core);
  assert.deepEqual(applyVerifiedRoadModel(core, data).mismatched, ['source-stage']);
  assert.equal(markVerifiedRoadModelConditioned(core, [], data, []), false);
  assert.equal(JSON.stringify(core), before);
});

test('a later stale input, missing incident road or excessive displacement leaves the whole core and stops unchanged', () => {
  for (const kind of ['stale', 'incident', 'displacement', 'scenery'] as const) {
    const { core, data } = fixture(), before = JSON.stringify(core);
    if (kind === 'stale') data.roads[1].expected = { ...data.roads[1].expected, w: 8 };
    if (kind === 'incident') data.roads.pop();
    if (kind === 'displacement') data.roads[0].model.pts[1] = [20, 17];
    if (kind === 'scenery') data.roads[0].model.scenerySource!.width = -1;
    const report = applyVerifiedRoadModel(core, data);
    assert.equal(report.active, false); assert.ok(report.mismatched.length > 0); assert.deepEqual(report.applied, []);
    assert.equal(JSON.stringify(core), before);
  }
});

test('source owners and compressed border context use final core patches plus the same public tile/node overlay', () => {
  const { core, data, side } = fixture(), source = structuredClone(core.roads), report = applyVerifiedRoadModel(core, data);
  assert.equal(report.active, true);
  const patches = structuredClone(currentRoadGradePatches(core.roads));
  for (const context of [false, true]) {
    const tileSide: any = { ...side, ...(context ? { ctx: 1 } : {}) }; if (context) delete tileSide.lanes;
    const zone: any = { i: 0, j: 0, roads: applyRoadGradePatches([...source, tileSide], patches), nodes: { join: [30, 10], side: [30, 30] }, buildings: [], boards: [], furniture: [], areas: [] };
    const before = JSON.stringify(zone), result = applyVerifiedRoadTileGeometry(zone, structuredClone(data));
    assert.deepEqual(result.report.mismatched, []); assert.deepEqual(result.zone.nodes.join, [30, 12]);
    assert.deepEqual(result.zone.roads.find(e => e.id === side.id)!.pts, data.tileRoads[0].pts);
    assert.deepEqual(result.zone.roads.find(e => e.id === side.id)!.scenerySource, data.tileRoads[0].scenerySource);
    assert.equal(JSON.stringify(zone), before);
    const graph = new RoadGraph(core.roads); graph.addRoads(result.zone.roads);
    if (!context) assert.equal(graph.nodes.get('join')!.out.length, 2, 'the core and real tile owner remain connected at one modeled endpoint/level');
  }
});

test('cache installation stays restricted to raw core IDs and feeds the exact same overlay as generic preparation', () => {
  const raw = fixture(), cached = fixture(), sourceRoads = cached.core.roads;
  raw.core.roads = prepareRoadGrades(raw.core.roads, true, false);
  const derived = prepareRoadGrades(sourceRoads, true, false), report = roadGradeReport(derived)!;
  const payload = { version: 1 as const, sourceRoadCount: sourceRoads.length, patches: currentRoadGradePatches(derived), report };
  const installed = installPreparedRoadCache(sourceRoads, structuredClone(payload)); assert.ok(installed);
  cached.core.roads = installed;
  // Exact binding is against the generic prepared geometry, including zero
  // arrays that preparation intentionally publishes.
  for (const f of [raw, cached]) f.data.roads.forEach(p => { p.expected = roadProfileInput(f.core.roads.find(e => e.id === p.id)!); });
  assert.equal(applyVerifiedRoadModel(raw.core, raw.data).active, true); assert.equal(applyVerifiedRoadModel(cached.core, cached.data).active, true);
  assert.deepEqual(cached.core, raw.core);
  const invalid = structuredClone(payload); invalid.patches.push({ id: raw.side.id, pts: raw.side.pts, elev: null });
  assert.equal(installPreparedRoadCache(sourceRoads, invalid), false, 'the tile-only supplement cannot weaken raw-core ID validation');
});

test('same and structured-cloned conditioned cores stay active without rebasing stops, while mixed/stale state is rejected', () => {
  const {core,data}=fixture();assert.equal(applyVerifiedRoadModel(core,data).active,true);
  const modeled=core.roads,profiles=core.roads.map(e=>({id:e.id,stage:'conditionedWorld' as const,expected:roadProfileInput(e),elev:[e.elev![0],.12,e.elev![2]]}));
  core.roads=applyVerifiedRoadProfiles(core.roads,'conditionedWorld',profiles).roads;
  const stops=rebaseRoadStops(core,modeled,core.roads);assert.equal(markVerifiedRoadModelConditioned(core,stops.changedStops,data,profiles),true);
  const snapshot=JSON.stringify(core);
  for(const candidate of [core,structuredClone(core)]){
    const result=applyVerifiedRoadModel(candidate,data,profiles);assert.equal(result.active,true);assert.equal(result.reused,true);assert.equal(result.movedStops,0);assert.equal(JSON.stringify(candidate),snapshot);
    const stage=applyVerifiedRoadProfiles(candidate.roads,'conditionedWorld',profiles);assert.deepEqual(stage.report.applied,[]);assert.deepEqual(stage.report.reused,['a','b']);assert.deepEqual(stage.report.mismatched,[]);
  }
  for(const kind of ['point','node','stop','mixed'] as const){
    const stale=structuredClone(core);
    if(kind==='point')stale.roads[0].pts[1][0]+=.01;
    if(kind==='node')stale.nodes.join[0]+=.01;
    if(kind==='stop')stale.food[0].stop[0]+=.01;
    if(kind==='mixed')stale.roads[0].elev=profiles[0].expected.elev!.slice();
    const before=JSON.stringify(stale),result=applyVerifiedRoadModel(stale,data,profiles);
    assert.equal(result.active,false);assert.deepEqual(result.mismatched,['prepared-model-binding']);assert.equal(JSON.stringify(stale),before);
  }
  assert.deepEqual(data.nodes.join.after,[30,12],'stale modeled-core mutation cannot alter the immutable correction field');
  assert.deepEqual(data.roads[0].model.pts[1],[20,11]);
});

test('a partial old/new conditioned stage cannot be installed or waived as idempotent', () => {
  const {core,data}=fixture();applyVerifiedRoadModel(core,data);
  const profiles=core.roads.map(e=>({id:e.id,stage:'conditionedWorld' as const,expected:roadProfileInput(e),elev:[e.elev![0],.12,e.elev![2]]}));
  core.roads[0]={...core.roads[0],elev:profiles[0].elev.slice()};const before=JSON.stringify(core.roads);
  const result=applyVerifiedRoadProfiles(core.roads,'conditionedWorld',profiles);
  assert.deepEqual(result.report.applied,[]);assert.deepEqual(result.report.reused,[]);assert.deepEqual(result.report.mismatched,['a','b']);assert.equal(JSON.stringify(result.roads),before);
});

test('a detailed tile endpoint offset binds its own exact source while meeting the common modeled node', () => {
  const {core,data,side}=fixture(),detailed={...side,pts:[[30,10.36],[30,30]] as [number,number][]};
  const local={join:{before:detailed.pts[0],after:data.nodes.join.after,delta:[0,1.64] as [number,number]}};
  data.tileRoads=[transportTileRoadNodes(detailed,local)!];data.tileNodeSources={'0_0':{join:[30,10.36]}};
  const source=structuredClone(core.roads);assert.equal(applyVerifiedRoadModel(core,data).active,true);
  const zone:any={i:0,j:0,roads:applyRoadGradePatches([...source,structuredClone(detailed)],currentRoadGradePatches(core.roads)),nodes:{join:[30,10.36]},buildings:[],boards:[],furniture:[],areas:[]};
  const correct=applyVerifiedRoadTileGeometry(zone,data);assert.deepEqual(correct.report.mismatched,[]);assert.deepEqual(correct.zone.nodes.join,[30,12]);
  assert.deepEqual(correct.zone.roads.find(e=>e.id===side.id)!.pts[0],[30,12]);
  for(const kind of ['node','source'] as const){
    const stale=structuredClone(zone);
    if(kind==='node')stale.nodes.join[0]+=.01;else stale.roads.find((e:RoadEdge)=>e.id===side.id)!.pts[0][0]+=.01;
    const before=JSON.stringify(stale),result=applyVerifiedRoadTileGeometry(stale,data);
    assert.ok(result.report.mismatched.length>0);assert.equal(JSON.stringify(result.zone),before);assert.deepEqual(result.report.applied,[]);
  }
  correct.zone.roads.find(e=>e.id===side.id)!.pts[0][0]+=1;
  assert.deepEqual(data.tileRoads[0].pts[0],[30,12],'a rendered owner cannot mutate the immutable transport template');
});
