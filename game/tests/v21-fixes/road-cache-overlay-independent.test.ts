import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { warmPreparedRoadProfiles, type RoadProfileCacheManifest } from '../../src/world/road-profile-cache';
import { installPreparedRoadCache, prepareRoadGrades, roadGradeReport, roadGradePatches, currentRoadGradePatches, applyRoadGradePatches, type PreparedRoadCachePayload } from '../../src/world/road-grades';
import { applyVerifiedRoadModel, applyVerifiedRoadTileGeometry, type VerifiedRoadModel } from '../../src/world/road-model-overlay';
import { roadProfileInput } from '../../src/world/road-profile-corrections';
import { transportTileRoadNodes } from '../../src/world/road-node-transport';
import { auxiliaryLane, canonicalAuxiliaryLaneEnds } from '../../src/world/expressway';
import { roadRibbon } from '../../src/world/bridge-clearance';
import { applyVerifiedSourceRoadZone, type VerifiedSourceRoadGeometry } from '../../src/world/road-source-geodesic';
import sourceRoadGeometryData from '../../src/world/road-source-geodesic-data.json';
import { actualWorldWorker } from '../fixtures/actual-world-worker';
import type { CoreData, RoadEdge } from '../../src/world/types';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const wire = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === 'number' && Object.is(item, -0) ? { $roadProfileNegativeZero: true } : item);
const road = (id: string, pts: [number, number][], from: string, to: string): RoadEdge => ({ id, seg: id, name: 'Independent overlay road', cls: 'primary', w: 7, lanes: 2, oneway: 'backward', from, to, pts, elev: null, maxspeed: 40 });
function cacheFixture() {
  const roads = [road('review-a', [[10, 10], [30, 10]], 'start', 'join'), road('review-b', [[30, 10], [50, 10]], 'join', 'end')];
  const payload: PreparedRoadCachePayload = { version: 1, sourceRoadCount: 2, patches: roads.map(e => ({ id: e.id, pts: structuredClone(e.pts), elev: [0, 1], w: e.w,
    scenerySource: { pts: [[-0, 0], [20, 0]], elev: [-0, 0], width: 8.4 } })), report: { roads: 2, repairedRoads: 2, sourceSteepSegments: 0, modelSteepSegments: 0, maxModelGrade: .05,
    protectedRoads: 0, protectedRoadsChanged: 0, separatedCrossings: 0, minCrossingSeparation: 0, joinedEndpointMaxDifference: 0, uncertainty: 'Independent synthetic cache/overlay control, not city acceptance.' } };
  return { roads, payload };
}
function pack(roads: RoadEdge[], payload: PreparedRoadCachePayload) {
  const bytes = Buffer.from(wire(payload)), gzip = gzipSync(bytes);
  const manifest: RoadProfileCacheManifest = { version: 1, enabled: true, asset: 'road-profiles-v1.pack.wasm', sourceRoadCount: roads.length,
    sourceRoadsSha256: sha(wire(roads)), sourceCorePackSha256: '1'.repeat(64), generatorInputsSha256: '2'.repeat(64), payloadSha256: sha(bytes), payloadBytes: bytes.length, gzipSha256: sha(gzip), gzipBytes: gzip.length };
  return { bytes, gzip, manifest };
}
function modelFixture() {
  const a = road('model-a', [[10, 10], [30, 10]], 'start', 'join'), b = road('model-b', [[30, 10], [50, 10]], 'join', 'end');
  const sides = [road('tile-a', [[30, 10], [30, 30]], 'join', 'north'), road('tile-b', [[30, 10], [30, -10]], 'join', 'south')];
  const core: CoreData = { roads: [a, b], nodes: { start: [10, 10], join: [30, 10], end: [50, 10] }, food: [], theatres: [], drops: [] } as any;
  const nodes = { join: { before: [30, 10] as [number, number], after: [30, 12] as [number, number], delta: [0, 2] as [number, number] } };
  const data: VerifiedRoadModel = { sourceGradeModelSHA256: 'independent-fixture', sourcePrototypeSHA256: 'independent-fixture', supersedesRoadGradeProfileIds: [], nodes,
    roads: [a, b].map((e, i) => ({ id: e.id, expected: roadProfileInput(e), model: { ...roadProfileInput(e), pts: i ? [[30, 12], [40, 11], [50, 10]] : [[10, 10], [20, 11], [30, 12]], elev: i ? [.2, .1, 0] : [0, .1, .2] }, sourceArc: [0, 10, 20] })),
    tileRoads: sides.map(e => transportTileRoadNodes(e, nodes)!) };
  return { core, data, sides, original: structuredClone(core.roads) };
}

test('canonical auxiliary endpoints retain mapped connections when a tile omits its ramps, with local discovery for unpatched roads', () => {
  const main = { ...road('main', [[0, 0], [300, 0], [600, 0]], 'from', 'to'), cls: 'motorway', name: 'Outer Ring Road' };
  const ramp = { ...road('ramp', [[0, 0], [0, 30]], 'from', 'exit'), cls: 'motorway_link' };
  const nearby = { ...road('nearby', [[600, -30], [600, 30]], 'near-a', 'near-b'), cls: 'motorway_link' };
  const core = [main, ramp, nearby], before = structuredClone(core), expected = roadRibbon(main, core);
  const patch = currentRoadGradePatches(core).find(p => p.id === main.id)!;
  assert.equal(patch.auxiliaryLaneEnds, 1); assert.equal(patch.name, 'Outer Ring Road'); assert.equal(patch.expressway, null);
  assert.deepEqual(auxiliaryLane(main, []), [0, 0, 0], 'ordinary unpatched roads retain local discovery');
  assert.deepEqual(auxiliaryLane(main, core), [3.5, 0, 0]);
  const context = { ...main, name: null, ctx: 1 }, installed = applyRoadGradePatches([context], structuredClone([patch]))[0];
  assert.deepEqual(roadRibbon(installed, [installed]).quads, expected.quads);
  assert.equal(installed.w, main.w); assert.deepEqual(core, before);
  assert.deepEqual(auxiliaryLane({ ...installed, cls: 'primary', name: null }, [installed]), [0, 0, 0], 'endpoint bits cannot classify another road as an expressway');
  assert.equal(currentRoadGradePatches([{ ...main, auxiliaryLaneEnds: 3 }])[0].auxiliaryLaneEnds, 0, 'stale endpoint bits cannot supply their own connection evidence');
  assert.equal(canonicalAuxiliaryLaneEnds([main, { ...ramp, to: main.to }]).get(main.id), 1, 'a ramp sharing both nodes retains the existing first-shared-node preference');
  for (const oneway of ['forward', 'backward'] as const) {
    const directed = { ...main, oneway }, inventory = [directed, ramp, nearby];
    const copy = applyRoadGradePatches([{ ...directed, name: null }], currentRoadGradePatches(inventory))[0];
    assert.deepEqual(roadRibbon(copy, [copy]).quads, roadRibbon(directed, inventory).quads, oneway);
  }
  const legacy = applyRoadGradePatches([context], [{ id: main.id, pts: main.pts, elev: null }])[0];
  assert.equal(legacy.name, null); assert.equal(legacy.auxiliaryLaneEnds, undefined);
});

test('canonical patches replace and explicitly clear expressway classification without retaining stale tile metadata', () => {
  const expressway: NonNullable<RoadEdge['expressway']> = { controlled: false, ramp: true, throughLanes: 1, sources: ['source-fixture'], sourceDate: '2026-11-03', uncertainty: 'Synthetic source metadata control' };
  const canonical = { ...road('ramp', [[0, 0], [0, 30]], 'join', 'exit'), elev: [0, 0], expressway };
  const copy = { ...canonical, name: null, expressway: undefined };
  const installed = applyRoadGradePatches([copy], currentRoadGradePatches([canonical]))[0];
  assert.deepEqual(installed.expressway, expressway); assert.equal(installed.name, canonical.name);
  const cleared = applyRoadGradePatches([{ ...installed, auxiliaryLaneEnds: 3 }], currentRoadGradePatches([{ ...canonical, name: null, expressway: undefined }]))[0];
  assert.equal(cleared.name, null); assert.equal(cleared.expressway, undefined); assert.equal(cleared.auxiliaryLaneEnds, undefined);
});

test('a null-elevation canonical road clears stale seeded expressway metadata and auxiliary pavement', () => {
  const expressway: NonNullable<RoadEdge['expressway']> = { controlled: true, ramp: false, throughLanes: 2, sources: ['source-fixture'], sourceDate: '2026-11-03', uncertainty: 'Synthetic source metadata control' };
  const main = road('main', [[0, 0], [300, 0]], 'join', 'end');
  const ramp = { ...road('ramp', [[0, 0], [0, 30]], 'join', 'exit'), cls: 'motorway_link' };
  const seed = currentRoadGradePatches([{ ...main, expressway }, ramp]);
  const canonical = { ...main, name: null }, before = structuredClone(canonical);
  const patches = currentRoadGradePatches([canonical, ramp], seed), patch = patches.find(p => p.id === main.id)!;
  assert.equal(patch.name, null); assert.equal(patch.expressway, null); assert.equal(patch.auxiliaryLaneEnds, null);
  const installed = applyRoadGradePatches([{ ...main, expressway, auxiliaryLaneEnds: 1 }, ramp], patches)[0];
  assert.equal(installed.name, null); assert.equal(installed.expressway, undefined); assert.equal(installed.auxiliaryLaneEnds, undefined);
  assert.deepEqual(auxiliaryLane(installed, [installed]), [0, 0]);
  assert.equal(installed.w, main.w); assert.equal(installed.lanes, main.lanes); assert.deepEqual(canonical, before);
});

test('prepared caches reject lawful classification changes unsupported by their canonical source roads', () => {
  const expressway: NonNullable<RoadEdge['expressway']> = { controlled: true, ramp: false, throughLanes: 2, sources: ['source-fixture'], sourceDate: '2026-11-03', uncertainty: 'Synthetic source metadata control' };
  for (const change of ['add-expressway', 'add-orr-name', 'clear-expressway'] as const) {
    const f = cacheFixture(); f.roads[1].cls = 'motorway_link';
    if (change === 'add-expressway') f.payload.patches[0].expressway = expressway;
    if (change === 'add-orr-name') { f.roads[0].cls = 'motorway'; f.payload.patches[0].name = 'Outer Ring Road'; }
    if (change === 'clear-expressway') {
      f.roads[0].expressway = expressway;
      f.payload.patches[0].expressway = null;
      f.payload.patches[0].auxiliaryLaneEnds = 2;
    }
    const before = structuredClone(f.roads);
    assert.equal(installPreparedRoadCache(f.roads, f.payload), false, change);
    assert.equal(roadGradeReport(f.roads), undefined); assert.deepEqual(roadGradePatches(f.roads), []); assert.deepEqual(f.roads, before);
  }
  const f = cacheFixture(); f.roads[0].expressway = expressway; f.roads[1].cls = 'motorway_link';
  f.payload.patches[0].name = f.roads[0].name;
  f.payload.patches[0].expressway = { uncertainty: expressway.uncertainty, sourceDate: expressway.sourceDate, sources: [...expressway.sources], throughLanes: 2, ramp: false, controlled: true };
  f.payload.patches[0].auxiliaryLaneEnds = 2;
  assert.ok(installPreparedRoadCache(f.roads, f.payload), 'Matching canonical classification survives a different object key order');
});

test('generic grade preparation retains the canonical source road classification exactly', () => {
  const expressway: NonNullable<RoadEdge['expressway']> = { controlled: true, ramp: false, throughLanes: 2, sources: ['source-fixture'], sourceDate: '2026-11-03', uncertainty: 'Synthetic source metadata control' };
  const roads = [{ ...road('main', [[0, 0], [300, 0]], 'join', 'end'), expressway },
    { ...road('ramp', [[0, 0], [0, 30]], 'join', 'exit'), cls: 'motorway_link' },
    road('ordinary', [[400, 0], [500, 0]], 'ordinary-a', 'ordinary-b')];
  const before = structuredClone(roads), prepared = prepareRoadGrades(roads);
  assert.deepEqual(prepared.map(e => ({ id: e.id, cls: e.cls, name: e.name, expressway: e.expressway })), before.map(e => ({ id: e.id, cls: e.cls, name: e.name, expressway: e.expressway })));
  assert.deepEqual(roads, before);
});

test('prepared caches reject malformed or unsupported canonical endpoint/classification metadata atomically', () => {
  for (const value of [-1, 4, .5, Number.NaN, '1', true, [1, 0], {}, 1, 3]) {
    const f = cacheFixture(); f.roads.forEach(e => { e.cls = 'motorway'; e.name = 'Outer Ring Road'; });
    f.payload.patches.forEach(p => { p.auxiliaryLaneEnds = 0; });
    (f.payload.patches[1] as any).auxiliaryLaneEnds = value;
    const before = structuredClone(f.roads);
    assert.equal(installPreparedRoadCache(f.roads, f.payload), false, String(value));
    assert.equal(roadGradeReport(f.roads), undefined); assert.deepEqual(roadGradePatches(f.roads), []); assert.deepEqual(f.roads, before);
  }
  for (const field of ['name', 'expressway'] as const) {
    const f = cacheFixture(); (f.payload.patches[1] as any)[field] = field === 'name' ? 5 : { controlled: true, ramp: true, throughLanes: 0 };
    assert.equal(installPreparedRoadCache(f.roads, f.payload), false); assert.equal(roadGradeReport(f.roads), undefined);
  }
  const f = cacheFixture(); f.roads.forEach(e => { e.cls = 'motorway'; e.name = 'Outer Ring Road'; });
  f.payload.patches.forEach(p => { p.auxiliaryLaneEnds = 0; });
  assert.ok(installPreparedRoadCache(f.roads, f.payload));
});

test('actual current World patches give the six ORR roads identical core, owner and context ribbons using their genuine ramp neighbors', async () => {
  const f = await actualWorldWorker({ allowInactive: true });
  try {
    const connections: Record<string, [string | null, string | null]> = {
      '515af5fd-bd4_0': ['d889b874-28a_0', 'ca271e34-763_0'],
      'c7cc1887-36e_0': ['1656d979-904_0', 'bce03595-a27_0'],
      'aa2e2270-ebc_0': [null, '059f61b3-975_0'], 'd6572402-4e2_0': ['664bfec3-f38_0', null],
      'ad427c5d-668_0': ['6be178c5-b2b_0', null], 'c32df37f-b8f_0': [null, '62e31cf5-259_0'],
    };
    const core = new Map(f.core.roads.map(e => [e.id, e])), expected = new Map<string, ReturnType<typeof roadRibbon>>();
    const seen = new Map(Object.keys(connections).map(id => [id, { owner: 0, context: 0, legacyMismatch: 0 }]));
    for (const [id, ramps] of Object.entries(connections)) {
      const e = core.get(id)!; assert.ok(e, id);
      ramps.forEach((ramp, end) => { if (!ramp) return; const neighbor = core.get(ramp)!; assert.ok(neighbor, ramp);
        assert.equal(neighbor.cls, 'motorway_link'); assert.equal(neighbor.expressway?.ramp, true);
        assert.ok([neighbor.from, neighbor.to].includes(end ? e.to : e.from), `${id}/${ramp} source node incidence`);
      });
      const mask = (ramps[0] ? 1 : 0) | (ramps[1] ? 2 : 0);
      assert.equal(canonicalAuxiliaryLaneEnds(f.core.roads).get(id), mask);
      assert.equal(f.initialization.roadGrades.find((p: any) => p.id === id).auxiliaryLaneEnds, mask);
      expected.set(id, roadRibbon(e, f.core.roads));
    }
    const legacyPatches = f.initialization.roadGrades.map(({ name, expressway, auxiliaryLaneEnds, ...p }: any) => p);
    for (const file of ['p-5_-1.pack.wasm', 'p-5_-2.pack.wasm', 'p-5_-6.pack.wasm', 'p-6_-6.pack.wasm', 'p-7_-6.pack.wasm']) {
      const path = 'public/city/packs/' + file, bytes = readFileSync(path), pack = JSON.parse(gunzipSync(bytes).toString());
      for (const raw of Object.values(pack.tiles) as any[]) {
        if (!raw.roads.some((e: RoadEdge) => expected.has(e.id))) continue;
        const normalized = f.core.sourceRoadGeometryGeneration ? applyVerifiedSourceRoadZone(raw, sourceRoadGeometryData as unknown as VerifiedSourceRoadGeometry) : { value: raw, report: { mismatched: [] } };
        assert.deepEqual(normalized.report.mismatched, []);
        const patched = applyRoadGradePatches(normalized.value.roads, f.initialization.roadGrades), legacy = applyRoadGradePatches(normalized.value.roads, legacyPatches);
        for (const e of patched) {
          const reference = expected.get(e.id); if (!reference) continue;
          const stats = seen.get(e.id)!; (e as any).ctx ? stats.context++ : stats.owner++;
          const actual = roadRibbon(e, patched); assert.deepEqual(actual.L, reference.L, `${e.id}/${raw.i}_${raw.j} L`);
          assert.deepEqual(actual.R, reference.R, `${e.id}/${raw.i}_${raw.j} R`); assert.deepEqual(actual.quads, reference.quads);
          const old = roadRibbon(legacy.find(other => other.id === e.id)!, legacy);
          const residual = Math.max(...old.R.map((p, i) => Math.hypot(p[0] - reference.R[i][0], p[1] - reference.R[i][1])));
          if (residual > 3.49) stats.legacyMismatch++;
        }
      }
      assert.equal(sha(readFileSync(path)), sha(bytes), 'Packed source remains immutable');
    }
    for (const [id, stats] of seen) { assert.ok(stats.owner > 0, `${id} owner observed`); assert.ok(stats.context > 0, `${id} context observed`); assert.ok(stats.legacyMismatch > 0, `${id} legacy 3.5m negative control`); }
    f.verifySources();
  } finally { f.dispose(); }
});

test('nested original-corridor metadata preserves signed coordinates/heights in both cache transports and worker patches', async () => {
  for (const decoded of [false, true]) {
    const f = cacheFixture(), encoded = pack(f.roads, f.payload), source = structuredClone(f.roads);
    assert.equal((await warmPreparedRoadProfiles('https://example.invalid/city/', f.roads, { manifest: encoded.manifest, fetcher: async () => new Response(decoded ? encoded.bytes : encoded.gzip) })).used, true);
    const cached = prepareRoadGrades(f.roads), patch = currentRoadGradePatches(cached).find(e => e.id === f.roads[0].id)!;
    for (const corridor of [cached[0].scenerySource!, patch.scenerySource!, structuredClone(patch).scenerySource!]) {
      assert.ok(Object.is(corridor.pts[0][0], -0)); assert.ok(Object.is(corridor.pts[0][1], 0));
      assert.ok(Object.is(corridor.elev![0], -0)); assert.ok(Object.is(corridor.elev![1], 0)); assert.equal(corridor.width, 8.4);
    }
    assert.deepEqual(f.roads, source);
  }
});

test('a later malformed original-corridor patch cannot partially warm the prepared-road maps', () => {
  for (const invalid of ['width', 'point', 'height', 'height-count', 'missing-height'] as const) {
    const f = cacheFixture(), source = structuredClone(f.roads), corridor = f.payload.patches[1].scenerySource!;
    if (invalid === 'width') corridor.width = 0;
    if (invalid === 'point') corridor.pts[1][0] = Number.NaN;
    if (invalid === 'height') corridor.elev![1] = Number.POSITIVE_INFINITY;
    if (invalid === 'height-count') corridor.elev = [0];
    if (invalid === 'missing-height') delete (corridor as any).elev;
    assert.equal(installPreparedRoadCache(f.roads, f.payload), false, invalid);
    assert.equal(roadGradeReport(f.roads), undefined, invalid); assert.deepEqual(roadGradePatches(f.roads), [], invalid);
    assert.deepEqual(f.roads, source, invalid); assert.equal(prepareRoadGrades(f.roads)[0].scenerySource, undefined, invalid);
  }
});

test('reused modeled cores reject appended stale incident roads and any changed road inventory atomically', () => {
  for (const kind of ['incident', 'elsewhere', 'removed'] as const) {
    const f = modelFixture(); assert.equal(applyVerifiedRoadModel(f.core, f.data).active, true);
    if (kind === 'incident') f.core.roads.push(road('stale-side', [[30, 10], [30, 30]], 'join', 'north'));
    if (kind === 'elsewhere') f.core.roads.push(road('new-elsewhere', [[200, 200], [220, 200]], 'other-a', 'other-b'));
    if (kind === 'removed') f.core.roads.pop();
    const before = structuredClone(f.core), result = applyVerifiedRoadModel(f.core, f.data);
    assert.equal(result.active, false, kind); assert.ok(result.mismatched.length, kind); assert.deepEqual(f.core, before, kind);
  }
});

test('a mixed final-core-patch tile cannot move its nodes and side streets while one core endpoint stays at source geometry', () => {
  const f = modelFixture(); assert.equal(applyVerifiedRoadModel(f.core, f.data).active, true);
  const patched = applyRoadGradePatches(f.original, currentRoadGradePatches(f.core.roads));
  patched[1] = f.original[1];
  const zone: any = { i: 0, j: 0, roads: [...patched, ...f.sides], nodes: { join: [30, 10], north: [30, 30], south: [30, -10] }, buildings: [], boards: [], furniture: [], areas: [] };
  const before = structuredClone(zone), result = applyVerifiedRoadTileGeometry(zone, f.data);
  assert.ok(result.report.mismatched.length, 'a missing final core patch must fail closed');
  assert.deepEqual(result.zone, before); assert.deepEqual(zone, before);
});

test('a later stale tile-only source keeps the entire owner/context zone unchanged', () => {
  const f = modelFixture(); assert.equal(applyVerifiedRoadModel(f.core, f.data).active, true);
  const zone: any = { i: 0, j: 0, roads: [...applyRoadGradePatches(f.original, currentRoadGradePatches(f.core.roads)), ...structuredClone(f.sides)], nodes: { join: [30, 10], north: [30, 30], south: [30, -10] }, buildings: [], boards: [], furniture: [], areas: [] };
  zone.roads.at(-1).pts[1][0] += .01;
  const before = structuredClone(zone), result = applyVerifiedRoadTileGeometry(zone, f.data);
  assert.ok(result.report.mismatched.length); assert.deepEqual(result.zone, before); assert.deepEqual(zone, before);
});
