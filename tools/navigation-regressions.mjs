import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = await mkdtemp(join(tmpdir(), 'roadster-navigation-'));
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: "export { RoadGraph } from './game/src/game/roadgraph'; export { clearRoadGuidance, remainingRouteDistance, navigationReadout } from './game/src/game/route-guidance';", resolveDir: root, loader: 'ts' }, outfile: join(out, 'test.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { RoadGraph, clearRoadGuidance, remainingRouteDistance, navigationReadout } = await import(pathToFileURL(join(out, 'test.mjs')));
  const arterial = { id: 'arterial', seg: 'arterial', from: 'a', to: 'b', pts: [[0, 0], [200, 0]], cls: 'primary', w: 14, lanes: 4, oneway: null, elev: null, name: 'Test Road', maxspeed: null };
  const graph = new RoadGraph([arterial]);
  test('median route stays in the left carriageway instead of following divider', () => {
    const r = graph.route(20, -3.5, 80, -3.5, { hx: 1, hz: 0, y: 0.57 });
    assert.ok(r); assert.ok(r.pts.every(p => p[2] < -2));
    assert.ok(r.pts.every(p => p[0] <= 80));
  });
  test('opposite-side destination requires a junction instead of crossing the median', () => {
    const r = graph.route(20, -3.5, 40, 3.5, { hx: 1, hz: 0, y: 0.57 });
    assert.ok(r); assert.ok(r.pts.some(p => p[0] === 200));
    for (let i = 1; i < r.pts.length; i++) {
      if (r.pts[i - 1][2] * r.pts[i][2] < 0) assert.equal(r.pts[i][0], 200);
    }
  });
  test('wrong-facing car remains on its physical side of the median', () => {
    const r = graph.route(20, -3.5, 80, -3.5, { hx: -1, hz: 0, y: 0.57 });
    assert.ok(r); assert.ok(r.pts.every(p => p[2] < -2));
    assert.ok(r.pts.every(p => p[0] >= 20));
  });
  test('lane-offset route length and HUD progress use the same geometry', () => {
    const r = graph.route(20, -3.5, 40, 3.5, { hx: 1, hz: 0, y: 0.57 });
    assert.equal(r.len, 347);
    assert.equal(remainingRouteDistance(r.pts, r.len, 50, 3.5), 10);
  });
  test('off-road live guidance does not invent a line through a compound', () => {
    assert.equal(graph.route(50, 20, 80, -3.5, { hx: 1, hz: 0, y: 0.57 }), null);
    assert.equal(graph.route(50, -9, 80, -3.5, { hx: 1, hz: 0, y: 0.57 }), null);
    assert.ok(graph.route(50, 20, 80, -3.5)); // planning may retain a coarse distance
  });
  test('unstreamed destination is marked incomplete and has no fabricated road spur', () => {
    const r = graph.route(20, -3.5, 1000, 200, { hx: 1, hz: 0, y: 0.57 });
    assert.ok(r); assert.equal(r.complete, false);
    assert.ok(r.pts.every(p => p[0] <= 200));
    assert.ok(!r.pts.some(p => p[0] === 1000 && p[2] === 200));
  });
  const emptyCity = () => ({ walls: new Map(), buildingGrid: new Map(), obstacles: new Map() });
  const wall = (kind = 'median', y = 0) => ({ ax: 50, az: -10, bx: 50, bz: 10, y0a: y, y0b: y, y1a: y + 1, y1b: y + 1, kind });
  test('ribbon stops before a solid median or bridge parapet, but permits a low kerb', () => {
    for (const kind of ['median', 'barrier']) {
      const city = emptyCity(); city.walls.set('1,0', [wall(kind)]);
      const r = clearRoadGuidance(city, [[0, 0, 0], [100, 0, 0]]);
      assert.equal(r.blocked, true); assert.ok(r.pts.at(-1)[0] < 50);
    }
    const city = emptyCity(); city.walls.set('1,0', [wall('kerb')]);
    const r = clearRoadGuidance(city, [[0, 0, 0], [100, 0, 0]]);
    assert.equal(r.blocked, false); assert.equal(r.pts.at(-1)[0], 100);
  });
  test('bridge wall does not block a ground-level road beneath it', () => {
    const city = emptyCity(); city.walls.set('1,0', [wall('barrier', 10)]);
    assert.equal(clearRoadGuidance(city, [[0, 0, 0], [100, 0, 0]]).blocked, false);
    assert.equal(clearRoadGuidance(city, [[0, 10, 0], [100, 10, 0]]).blocked, true);
  });
  test('guidance cannot draw a connector through a building facade', () => {
    const city = emptyCity(); city.buildingGrid.set('0,0', [{ h: 12, ring: [[40, -5], [60, -5], [60, 5], [40, 5]] }]);
    const r = clearRoadGuidance(city, [[0, 0, 0], [100, 0, 0]]);
    assert.equal(r.blocked, true); assert.ok(r.pts.at(-1)[0] < 40);
  });
  test('guidance uses the same wall and facade clearance as the player', () => {
    const city = emptyCity();
    city.walls.set('0,0', [{ ax: 0, az: 0.95, bx: 30, bz: 0.95, y0a: 0, y0b: 0, y1a: 2, y1b: 2, kind: 'barrier' }]);
    assert.equal(clearRoadGuidance(city, [[0, 0, 0], [25, 0, 0]]).blocked, true);
    city.walls.clear();
    city.buildingGrid.set('0,0', [{ h: 12, ring: [[0, 1.1], [30, 1.1], [30, 5], [0, 5]] }]);
    assert.equal(clearRoadGuidance(city, [[0, 0, 0], [25, 0, 0]]).blocked, true);
  });
  test('HUD distance subtracts progress equally in both axes without double counting', () => {
    assert.equal(remainingRouteDistance([[0, 0, 0], [100, 0, 0]], 100, 20, 0), 80);
    assert.equal(remainingRouteDistance([[0, 0, 0], [0, 0, 100]], 100, 0, 20), 80);
    assert.equal(remainingRouteDistance([[0, 0, 0], [-100, 0, 0]], 100, -20, 0), 80);
    assert.equal(remainingRouteDistance([[0, 0, 0], [100, 0, 0]], 100, 0, 0), 100);
  });
  test('flight and descent show beacon distance without ground-route obstruction warnings', () => {
    const route = { pts: [[0, 0, 0], [100, 0, 0]], len: 300, complete: false };
    assert.deepEqual(navigationReadout(route, true, { x: 0, z: 0 }, { x: 30, z: 40 }, true), {
      metres: 50, approximate: true, note: 'Flying · follow the destination beacon',
    });
    assert.equal(navigationReadout(null, false, { x: 0, z: 0 }, { x: 30, z: 40 }, false).note, 'Return to a road for GPS · use Back to the road if stuck');
    assert.equal(navigationReadout(route, true, { x: 0, z: 0 }, { x: 30, z: 40 }, false).note, 'Road ahead blocked · check the map');
  });
  console.log(`${checks} navigation regressions passed`);
} finally { await rm(out, { recursive: true, force: true }); }
