// Actual shipped micro-join geometry with production guidance and bus movement.
// The bus leg is a declared test alignment, not a claim of an agency service.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temporary = await mkdtemp(join(tmpdir(), 'roadster-construction-guidance-'));
export let constructionGuidanceSummary;
let passed = 0;
const test = (name, run) => { run(); passed++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: `export * from './src/world/construction'; export * from './src/world/road-grades'; export {buildTile} from './src/world/city';
    export {RoadGraph} from './src/game/roadgraph'; export {Traffic} from './src/game/traffic'; export {BusServices} from './src/game/bus-services';
    export {trafficPoseClear} from './src/game/traffic-path'; export {clearRoadGuidance,softenRoadCorners} from './src/game/route-guidance';
    export {rng,initTemplates} from './src/core/util'; export {BoxGeometry,RingGeometry,Scene,BufferGeometry,MeshBasicMaterial} from 'three';`,
    resolveDir: join(root, 'game'), loader: 'ts' }, outfile: join(temporary, 'production.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { planConstruction, applyConstructionRoads, constructionLane, prepareRoadGrades, roadGradePatches, applyRoadGradePatches, buildTile, RoadGraph,
    Traffic, BusServices, trafficPoseClear, clearRoadGuidance, softenRoadCorners, rng, initTemplates, BoxGeometry, RingGeometry, Scene, BufferGeometry, MeshBasicMaterial } = await import(pathToFileURL(join(temporary, 'production.mjs')));
  initTemplates({ rbox: new BoxGeometry(1, 1, 1), ring: new RingGeometry(1, 1.35, 12) });
  const bytes = await readFile(join(root, 'game/public/city/core.pack.wasm')), core = JSON.parse(gunzipSync(bytes));
  const prepared = prepareRoadGrades(core.roads), plan = planConstruction(prepared, core.origin), roads = applyConstructionRoads(prepared, plan), graph = new RoadGraph(roads);
  const pack = core.packs.find(p => p.tiles.some(([i, j]) => i === 11 && j === -1)), packBytes = await readFile(join(root, 'game/public/city', pack.file));
  const raw = JSON.parse(gunzipSync(packBytes)).tiles['11_-1'], rr = applyConstructionRoads(applyRoadGradePatches(raw.roads, roadGradePatches(prepared)), plan);
  const city = buildTile({ ...raw, roads: rr }, { lowQ: true, construction: plan, metro: core.metro });
  const baseline = buildTile({ ...raw, roads: rr }, { lowQ: true, metro: core.metro });
  const ids = ['f731633c-8b8_1', 'f731633c-8b8_2'], first = graph.byId.get(ids[0]), last = graph.byId.get(ids[1]);
  const sourceBefore = JSON.stringify(core.roads.filter(e => ids.includes(e.id)));
  assert.ok(first && last); assert.ok(Math.abs(Math.hypot(last.e.pts[1][0] - last.e.pts[0][0], last.e.pts[1][1] - last.e.pts[0][1]) - .1) < 1e-7, 'the shipped0.1m source chord is still tested');
  const startS = 2, endS = last.len - 8, start = graph.pointAt(first, startS, 1), end = graph.pointAt(last, endS, 1);
  const measure = points => {
    let maxTurnRadians = 0, backwardSegments = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[2] - a[2];
      if (dx > .01) backwardSegments++;
      if (i > 1) { const p = points[i - 2], ax = a[0] - p[0], az = a[2] - p[2]; maxTurnRadians = Math.max(maxTurnRadians, Math.abs(Math.atan2(ax * dz - az * dx, ax * dx + az * dz))); }
    }
    return { points: points.length, maxTurnRadians, backwardSegments };
  };
  let guide, normalGuide;
  test('real f731 source micro-join has no backward GPS spur or near180degree reversal after legal smoothing', () => {
    const a = graph.pointAt(first, startS, 1, constructionLane(first.e, 1)), b = graph.pointAt(last, endS, 1, constructionLane(last.e, 1));
    const route = graph.route(a.x, a.z, b.x, b.z, { hx: a.hx, hz: a.hz, y: 0, edgeId: first.e.id }, 0);
    assert.ok(route?.pts.length >= 2); const shown = clearRoadGuidance(city, softenRoadCorners(city, route.pts)); guide = { ...measure(shown.pts), blocked: shown.blocked };
    assert.equal(guide.blocked, false); assert.equal(guide.backwardSegments, 0); assert.ok(guide.maxTurnRadians < .15);
    const normal = new RoadGraph(prepared), ga = normal.byId.get(ids[0]), gb = normal.byId.get(ids[1]), pa = normal.pointAt(ga, startS, 1, 3), pb = normal.pointAt(gb, endS, 1, 3);
    const ordinary = normal.route(pa.x, pa.z, pb.x, pb.z, { hx: pa.hx, hz: pa.hz, y: 0, edgeId: ga.e.id }, 0);
    const clean = clearRoadGuidance(baseline, softenRoadCorners(baseline, ordinary.pts)); normalGuide = { ...measure(clean.pts), blocked: clean.blocked };
    assert.equal(normalGuide.blocked, false); assert.equal(normalGuide.backwardSegments, 0); assert.ok(normalGuide.maxTurnRadians < .15);
    assert.equal(JSON.stringify(core.roads.filter(e => ids.includes(e.id))), sourceBefore, 'source coordinates/elevations/IDs are unchanged');
  });
  const feed = { schema: 2, origin: core.origin, attribution: 'Independent source-geometry execution fixture', uncertainty: 'Synthetic test leg on actual roads; not an agency service',
    stops: { a: ['BEFORE', start.x, start.z], b: ['AFTER', end.x, end.z] }, patterns: [{ id: 'join-review', number: 'REVIEW', direction: '0', from: 'BEFORE', to: 'AFTER', stops: ['a', 'b'], tripId: 'review', publishedTrips: 1, alignmentIds: ['join'] }],
    alignments: { join: { status: 'inferred_legal_road_path', fromStop: 'a', toStop: 'b', steps: [{ edge: first.e.id, dir: 1, from: startS, to: first.len }, { edge: last.e.id, dir: 1, from: 0, to: endS }], pts: [[start.x, start.z], [end.x, end.z]], lengthM: first.len - startS + endS, maxStopSnapM: 0 } } };
  const buses = [];
  test('production bus span still clears the actual shipped micro-join and serves its test destination with and without work structures', () => {
    for (const [mode, world] of [['construction', city], ['withoutWorkStructures', baseline]]) {
      const geometry = new BufferGeometry(), material = new MeshBasicMaterial();
      const traffic = Object.assign(Object.create(Traffic.prototype), { cars: [], max: 0, graph, city: world, scene: new Scene(), mats: { vBody: material, vLight: material },
        byGroup: { bus: [{ group: 'bus', size: [2.5, 3.3, 11], body: geometry, lights: geometry, decals: [] }] }, r: rng(77), t: 0, plans: 0, stopsByEdge: new Map(), onHorn() {}, services: new BusServices(graph, feed) });
      const run = traffic.services.bind(first, 1, startS, 0); assert.ok(run); const car = traffic.spawnAt('bus', first, 1, startS); car.busRun = run; car.speed = car.want = 8;
      let maxYawRadiansPerFrame = 0, maxStepMetres = 0, frames = 0, dwelled = false, invalidPoses = 0;
      for (; frames < 4800; frames++) {
        const before = { x: car.x, z: car.z, hx: car.hx, hz: car.hz };
        traffic.update(1 / 60, car.x, car.z, { x: car.x + 290, z: car.z + 290, y: .55, speed: 0, hx: 1, hz: 0 }, []);
        maxYawRadiansPerFrame = Math.max(maxYawRadiansPerFrame, Math.abs(Math.atan2(before.hx * car.hz - before.hz * car.hx, before.hx * car.hx + before.hz * car.hz)));
        maxStepMetres = Math.max(maxStepMetres, Math.hypot(car.x - before.x, car.z - before.z));
        if (!trafficPoseClear(world, car, car.size)) invalidPoses++; dwelled ||= car.dwell > 0;
        if (run.ended && dwelled) break;
      }
      assert.ok(run.ended && dwelled); assert.equal(car.edge.e.id, ids[1]); assert.equal(invalidPoses, 0); assert.ok(maxYawRadiansPerFrame < .04); assert.ok(maxStepMetres < .14);
      buses.push({ mode, ended: run.ended, dwelled, simulationSeconds: frames / 60, maxYawRadiansPerFrame, maxStepMetres, invalidPoses }); traffic.clear(); geometry.dispose(); material.dispose();
    }
  });
  test('tiny-join cleanup retains uncertain pavement and different-height waypoints instead of inventing a shortcut', () => {
    const points = [[0, 0, 0], [10, 0, 0], [10.1, 0, .1], [20, 0, 0]], empty = { surfaceGrid: new Map(), walls: new Map(), obstacles: new Map(), buildingGrid: new Map() };
    assert.deepEqual(softenRoadCorners(empty, points), points);
    const raised = points.map(p => [...p]); raised[2][1] = 6; assert.deepEqual(softenRoadCorners(empty, raised), raised);
  });
  constructionGuidanceSummary = { sourceIds: ids, tile: [11, -1], pack: pack.file, coreSha256: createHash('sha256').update(bytes).digest('hex'), packSha256: createHash('sha256').update(packBytes).digest('hex'),
    sourceMicroSegmentMetres: .1, preparedGradePatches: roadGradePatches(prepared).length, sourceGeometryPreserved: true, guide, normalGuide, buses };
  console.log(`${passed} shipped construction/guidance regression groups passed (offline production execution).`);
} finally { await rm(temporary, { recursive: true, force: true }); }
