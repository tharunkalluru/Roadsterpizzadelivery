// Actual road meshes, support and Player code, plus the shipped full-core grade
// model. These offline checks are separate from manual browser route coverage.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'flyovers-'));
const reportAt = process.argv.indexOf('--report'), reportPath = reportAt >= 0 ? resolve(process.argv[reportAt + 1]) : null;
let checks = 0;
const test = (label, fn) => { fn(); checks++; console.log(`PASS ${label}`); };
try {
  await build({ stdin: { contents: `export * from './src/world/road-grades'; export * from './src/world/road-surface'; export {buildTile} from './src/world/city'; export {supportAt} from './src/game/physics'; export {Player} from './src/game/player'; export {RoadGraph} from './src/game/roadgraph'; export {initTemplates} from './src/core/util'; export {BoxGeometry,RingGeometry,Vector3,Group} from 'three';`, resolveDir: join(root, 'game'), loader: 'ts' }, outfile: join(temp, 'road.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { prepareRoadGrades, roadGradePatches, roadGradeReport, applyRoadGradePatches, rebaseRoadStops, roadHeightAlong, roadQuadHeight, buildTile, supportAt, Player, RoadGraph, initTemplates, BoxGeometry, RingGeometry, Vector3, Group } = await import(pathToFileURL(join(temp, 'road.mjs')));
  initTemplates({ rbox: new BoxGeometry(1, 1, 1), ring: new RingGeometry(1, 1.35, 12) });
  const road = (id, pts, elev, extra = {}) => ({ id, seg: id, name: id, cls: 'primary', w: 14, lanes: 4, oneway: 'backward', from: id + '-a', to: id + '-b', pts, elev, maxspeed: null, ...extra });
  const zone = (roads, i = 0, j = 0) => ({ i, j, roads, nodes: Object.fromEntries(roads.flatMap(e => [[e.from, e.pts[0]], [e.to, e.pts.at(-1)]])), buildings: [], boards: [], furniture: [], areas: [], osm: [] });
  const built = (roads, i = 0, j = 0) => buildTile(zone(roads, i, j), { lowQ: true });
  const unique = grid => [...new Set([...grid.values()].flat())];
  const maxGrade = e => Math.max(0, ...e.pts.slice(1).map((p, i) => Math.abs((e.elev?.[i + 1] || 0) - (e.elev?.[i] || 0)) / (Math.hypot(p[0] - e.pts[i][0], p[1] - e.pts[i][1]) || 1)));
  test('generated near-vertical approaches ease over connected roads and keep same-level branches joined', () => {
    const source = [road('approach', [[-200, 500], [0, 500]], null, { to: 'join' }), road('deck', [[0, 500], [9, 500], [160, 500]], [0, 6.8, 6.8], { from: 'join' }), road('branch', [[0, 500], [0, 700]], null, { from: 'join' })];
    const model = prepareRoadGrades(source), report = roadGradeReport(model);
    assert.equal(source[1].elev[0], 0, 'source records are not overwritten');
    assert.ok(model.every(e => maxGrade(e) <= .100001)); assert.equal(Math.max(...model[1].elev), 6.8);
    assert.ok(model[0].elev.at(-1) > 0); assert.equal(model[0].elev.at(-1), model[1].elev[0]); assert.equal(model[2].elev[0], model[1].elev[0]);
    assert.equal(report.joinedEndpointMaxDifference, 0); assert.equal(prepareRoadGrades(model), model, 'preparing twice cannot accumulate height or vertices');
    for (const e of source) { const result = model.find(m => m.id === e.id); for (const p of e.pts) assert.ok(result.pts.includes(p), 'original mappedXY vertices are retained'); assert.equal(result.from, e.from); assert.equal(result.to, e.to); }
  });
  test('explicit surveyed profiles and source-separated ground roads do not lift into a flyover', () => {
    const upper = road('upper', [[100, 500], [900, 500]], [6.8, 6.8]), lower = road('lower', [[500, 100], [500, 900]], null, { oneway: null });
    const protectedEdge = road('orr', [[100, 100], [900, 100]], [0, 3.4], { expressway: { controlled: true, ramp: false }, elevationSource: 'survey' });
    const model = prepareRoadGrades([upper, lower, protectedEdge]); assert.equal(model[2], protectedEdge); assert.equal(model[1], lower);
    const city = built(model); assert.equal(supportAt(city, 500, 500, 0, true).y, 0); assert.equal(supportAt(city, 500, 500, 6.8, true).y, 6.8);
    assert.ok(roadGradeReport(model).minCrossingSeparation >= 6.79);
  });
  test('finite road triangles replace sticky endpoint caps and match actual curved asphalt triangles', () => {
    const e = road('ramp', [[100, 500], [110, 500], [120, 500], [130, 500]], [4, 3.5, 3, 2.5]), city = built([e]);
    let y = 4;
    for (let x = 100.2; x <= 109.8; x += .2) { const p = supportAt(city, x, 500, y, true); assert.ok(Math.abs(p.y - (4 - (x - 100) * .05)) < 1e-6); y = p.y; }
    assert.equal(supportAt(city, 98, 500, 4, true).onRoad, false, 'a standalone road cannot grow an invisible flat end ledge');
    const curved = built([road('curve', [[100, 500], [110, 500], [120, 502], [130, 507]], [4, 3.5, 3, 2.5])]);
    for (const s of unique(curved.surfaceGrid).filter(s => s.roadQuad)) {
      const q = s.roadQuad, x = (q[0][0] + q[1][0] + q[2][0]) / 3, z = (q[0][2] + q[1][2] + q[2][2]) / 3;
      assert.ok(Math.abs(roadQuadHeight(q, x, z) - (q[0][1] + q[1][1] + q[2][1]) / 3) < 1e-6);
      assert.ok(Math.abs(supportAt(curved, x, z, roadQuadHeight(q, x, z), true).y - roadQuadHeight(q, x, z)) < 1e-6);
    }
  });
  test('thin lane paint follows the grade, has no vertical lip faces and continues across dense source pieces', () => {
    const e = road('paint', Array.from({ length: 101 }, (_, i) => [100 + i * 2, 500]), Array.from({ length: 101 }, (_, i) => 6.8 - i * .065)), city = built([e]);
    let vertices = 0, maximumError = 0;
    for (const b of city.buffers.filter(b => b.mat === 'marks')) for (let i = 0; i < b.pos.length; i += 3) {
      assert.ok(b.nor[i + 1] > .98, 'paint faces upward without box side walls');
      if (Math.abs(b.pos[i + 2] - 500) > e.w / 2 - .5) continue;
      const p = supportAt(city, b.pos[i], b.pos[i + 2], 6.8, true);
      maximumError = Math.max(maximumError, Math.abs(b.pos[i + 1] - p.y - .082)); vertices++;
    }
    assert.ok(vertices > 100 && maximumError < .00001);
  });
  test('a real elevated junction pavement patch supports the same corner region that is rendered', () => {
    const a = road('in', [[100, 500], [500, 500]], [6.8, 6.8], { to: 'join' }), b = road('out', [[500, 500], [500, 900]], [6.8, 6.8], { from: 'join' });
    const city = built([a, b]), p = supportAt(city, 502, 498, 6.8, true);
    assert.equal(p.onRoad, true); assert.equal(p.y, 6.8); assert.ok(p.s.roadQuad, 'the corner has a real mesh-matching finite surface');
  });
  test('actual Player follows downhill/uphill grades without detaching or losing speed to repeated landings', () => {
    const e = prepareRoadGrades([road('drive', [[100, 500], [400, 500], [900, 500]], [6.8, 0, 0])])[0], city = built([e]);
    for (const dir of [1, -1]) {
      const x = dir === 1 ? 130 : 380, height = supportAt(city, x, 497.2, 6.8, true).y;
      const p = Object.assign(Object.create(Player.prototype), { city, pos: new Vector3(x, height + .55, 497.2), yaw: dir === 1 ? -Math.PI / 2 : Math.PI / 2, speed: 18, vy: 0, steerVis: 0, flying: false, descending: false, onRoad: true, lastSupport: height, lastKind: 'road', lastElevRoad: height > 1.2, lastEdge: e, roadPitch: 0,
        hitCooldown: 0, bump: 0, flyAlt: 24, altT: 0, kerbT: 0, glide: null, placementRevision: 0, group: new Group(), glow: new Group(), light: new Group(), wheels: [], wheelRollers: [], animateThrusters() {} });
      for (let frame = 0; frame < 180; frame++) {
        p.update(1 / 30, { throttle: .25, brake: 0, steer: 0, flyPressed: false, boost: false }, frame / 30);
        const floor = supportAt(city, p.pos.x, p.pos.z, p.pos.y - .55, true);
        assert.ok(p.onRoad); assert.ok(Math.abs(p.pos.y - floor.y - .55) < .00001); assert.equal(p.vy, 0); assert.equal(p.bump, 0);
      }
      assert.ok(Math.abs(p.roadPitch) > .001); assert.ok(p.speed > 18, 'a continuous grade does not trigger landing slowdowns');
    }
  });
  test('road-bound pickup/drop heights rebase with the model while a genuine ground stop below a deck stays grounded', () => {
    const source = [road('Approach', [[-200, 500], [0, 500]], null, { to: 'join' }), road('deck', [[0, 500], [9, 500], [160, 500]], [0, 6.8, 6.8], { from: 'join' })], model = prepareRoadGrades(source);
    const stop = [-25, 497, 0, 'Approach'], core = { food: [{ stop }], theatres: [], drops: [[-45, 497, 0, 'Approach']] };
    const changed = rebaseRoadStops(core, source, model); assert.equal(changed.rebased, 2); assert.ok(stop[2] > 1.5);
    const graph = new RoadGraph(model), fromY = roadHeightAlong(model[0], 100), route = graph.route(-100, 497, stop[0], stop[1], { hx: 1, hz: 0, y: fromY }, stop[2]);
    assert.ok(route?.complete);
    const copies = applyRoadGradePatches(source.map(e => ({ ...e, ctx: 1 })), roadGradePatches(model));
    assert.ok(copies.every(e => e.ctx === 1)); assert.deepEqual(copies.map(e => [e.pts, e.elev]), model.map(e => [e.pts, e.elev]));
    const paired = [road('Left', [[-200, 498], [0, 498]], null, { to: 'left-join' }), road('left-deck', [[0, 498], [9, 498], [160, 498]], [0, 6.8, 6.8], { from: 'left-join' }), road('Right', [[-200, 502], [0, 502]], null, { to: 'right-join' }), road('right-deck', [[0, 502], [9, 502], [160, 502]], [0, 6.8, 6.8], { from: 'right-join' })];
    const pairedModel = prepareRoadGrades(paired), unnamed = [-25, 500, 0, ''];
    const consensus = rebaseRoadStops({ food: [{ stop: unnamed }], theatres: [], drops: [] }, paired, pairedModel);
    assert.equal(consensus.rebased, 1); assert.equal(consensus.ambiguous, 0); assert.ok(unnamed[2] > 1.5, 'same-level approach consensus cannot leave an unnamed stop below both roads');
    const stacked = [road('Deck', [[100, 500], [900, 500]], [6.8, 6.8]), road('Ground', [[500, 100], [500, 900]], null)], stackedModel = prepareRoadGrades(stacked);
    const groundStop = [502, 500, 0, 'Ground'], deckStop = [500, 502, 6.8, 'Deck'];
    rebaseRoadStops({ food: [{ stop: groundStop }, { stop: deckStop }], theatres: [], drops: [] }, stacked, stackedModel);
    assert.equal(groundStop[2], 0); assert.equal(deckStop[2], 6.8, 'source grade identifies the intended level despite overlappingXY');
  });
  const sourceCore = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city/core.pack.wasm'))));
  const started = performance.now(), model = prepareRoadGrades(sourceCore.roads), preparedAt = performance.now(), report = roadGradeReport(model);
  rebaseRoadStops(sourceCore, sourceCore.roads, model);
  test('all shipped core estimates satisfy the new grade bound, crossing clearance and endpoint contracts', () => {
    assert.ok(report.sourceSteepSegments > 1000); assert.equal(report.modelSteepSegments, 0); assert.ok(report.maxModelGrade <= .100001);
    assert.ok(report.protectedRoadsChanged <= report.protectedRoads); assert.ok(report.separatedCrossings > 500); assert.ok(report.minCrossingSeparation > 4.45);
    assert.ok(report.bridgeClearance.separatedCrossings > 500 && report.bridgeClearance.minimumModelSeparation >= 5.84999);
    assert.ok(report.joinedEndpointMaxDifference <= .001001, JSON.stringify(report)); // protected ORR source rounding is1mm
    for (let i = 0; i < model.length; i++) if (sourceCore.roads[i].expressway) {
      assert.equal(model[i].id, sourceCore.roads[i].id);
      assert.ok(sourceCore.roads[i].pts.every(p => model[i].pts.includes(p)), 'estimated clearance retains every source alignment vertex');
    }
    for (let i = 0; i < model.length; i++) if (sourceCore.roads[i].name === 'Durgam Cheruvu Bridge' && sourceCore.roads[i].elev?.some(y => y >= 6.8)) assert.ok(Math.max(...model[i].elev) >= 6.8);
    console.log(JSON.stringify({ ...report, bridgeClearance: { ...report.bridgeClearance, crossings: undefined, ambiguities: undefined }, prepareMilliseconds: +(preparedAt - started).toFixed(1), gradePatches: roadGradePatches(model).length }));
  });
  test('the worst shipped Nallagandla and Telugu Talli ramps use smooth real finite tile surfaces', () => {
    for (const id of ['94e381ed-cb6_0', '67c7bb3b-da0_1', 'b2bbd573-347_0']) {
      const e = model.find(e => e.id === id); assert.ok(e && maxGrade(e) < .1);
      const i = Math.floor(e.pts[0][0] / 1000), j = Math.floor(e.pts[0][1] / 1000), city = built([e], i, j);
      const surfaces = unique(city.surfaceGrid).filter(s => s.e.id === id && s.roadQuad); assert.ok(surfaces.length > 0);
      for (const s of surfaces) { const x = (s.ax + s.bx) / 2, z = (s.az + s.bz) / 2, y = (s.ya + s.yb) / 2; assert.ok(Math.abs(supportAt(city, x, z, y, true).y - y) < .02); }
    }
  });
  if (reportPath) await writeFile(reportPath, JSON.stringify({ ...report, gradePatches: roadGradePatches(model).length }, null, 2) + '\n');
  console.log(`${checks} flyover grade/render/support regression groups passed.`);
} finally { await rm(temp, { recursive: true, force: true }); }
