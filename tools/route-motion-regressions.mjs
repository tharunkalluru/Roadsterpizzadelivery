// Retained route motion and legal corner smoothing against production helpers/Game.
// These offline checks are separate from visible browser acceptance.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'roadster-route-motion-'));
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: "export { Game } from './src/game/game'; export { RoadGraph } from './src/game/roadgraph'; export * from './src/game/route-guidance'; export { Vector3, Mesh, BufferGeometry, MeshBasicMaterial } from 'three';", resolveDir: join(root, 'game'), loader: 'ts' }, outfile: join(temp, 'test.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { Game, RoadGraph, advanceRoadRoute, softenRoadCorners, guidanceRibbon, GUIDE_WIDTH, Vector3, Mesh, BufferGeometry, MeshBasicMaterial } = await import(pathToFileURL(join(temp, 'test.mjs')));
  const road = (extra = {}) => ({ id: 'main', seg: 'main', name: 'Test road', cls: 'primary', w: 18, lanes: 4, oneway: 'backward', from: 'a', to: 'b', pts: [[0, 0], [1000, 0]], elev: null, maxspeed: null, ...extra });
  const cityOf = roads => {
    const surfaceGrid = new Map();
    for (const e of roads) for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], s = { e, i: i - 1, ax: a[0], az: a[1], bx: b[0], bz: b[1], ya: e.elev?.[i - 1] || 0, yb: e.elev?.[i] || 0, hw: e.w / 2, kind: 'road' };
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 15);
      for (let j = 0; j <= n; j++) { const k = `${Math.floor((a[0] + (b[0] - a[0]) * j / n) / 30)},${Math.floor((a[1] + (b[1] - a[1]) * j / n) / 30)}`; const l = surfaceGrid.get(k) || []; if (!l.includes(s)) l.push(s); surfaceGrid.set(k, l); }
    }
    return { surfaceGrid, walls: new Map(), obstacles: new Map(), buildingGrid: new Map() };
  };
  const fixture = (e = road()) => {
    const graph = new RoadGraph([e]), g = Object.create(Game.prototype), city = cityOf([e]);
    Object.assign(g, { graph, city, route: null, routeT: 0, routeGuide: [], routeGuideT: 0, routeGraphRevision: -1, routeAlpha: 0, routeWasAirborne: false, routePlacementRevision: -1, routeGuidanceBlocked: false,
      routeTarget: { x: 800, y: 0, z: -5 }, player: { pos: new Vector3(20, .55, -5), forward: new Vector3(1, 0, 0), speed: 6, placementRevision: 0, flying: false, descending: false, lastEdge: e }, gps: new Mesh(new BufferGeometry(), new MeshBasicMaterial()) });
    let calls = 0; const route = graph.route.bind(graph); graph.route = (...args) => { calls++; return route(...args); };
    return { g, graph, city, calls: () => calls };
  };
  test('route progress never jumps to a nearby later arm or another bridge level', () => {
    const r = { pts: [[0, 0, 0], [100, 0, 0], [100, 0, 1], [0, 0, 1]], len: 201 };
    const a = advanceRoadRoute(r, { x: 2, y: 0, z: 1 }, 8);
    assert.equal(a.route.pts[0][0], 2); assert.equal(a.route.pts[0][2], 0); assert.equal(a.route.len, 199);
    assert.equal(advanceRoadRoute({ pts: [[0, 9, 0], [100, 9, 0]], len: 100 }, { x: 2, y: 0, z: 0 }, 8).heightError, 9);
  });
  test('one-point and coincident terminal paths remain stable while waiting to collect', () => {
    for (const pts of [[[5, 0, 0]], [[5, 0, 0], [5, 0, 0]]]) {
      const a = advanceRoadRoute({ pts, len: 0 }, { x: 5, y: 0, z: 0 }, 8);
      assert.ok(a); assert.equal(a.distance, 0); assert.equal(a.route.len, 0);
    }
  });
  test('straight road ribbon is exactly half the old width with finite joined/capped geometry', () => {
    assert.equal(GUIDE_WIDTH, .7);
    const p = guidanceRibbon([[0, 0, 0], [20, 0, 0], [100, 0, 0]]);
    const z = p.filter((_, i) => i % 3 === 2);
    assert.ok(Math.abs(Math.max(...z) - Math.min(...z) - .7) < 1e-9);
    assert.ok(p.every(Number.isFinite)); assert.equal(p.length % 9, 0);
    assert.ok(guidanceRibbon([[0, 0, 0], [5, 0, 0], [5, 0, 5], [0, 0, 5]]).every(Number.isFinite));
  });
  test('corner fillets require same-grade loaded road and full facade/wall clearance', () => {
    const e = road({ pts: [[0, 0], [50, 0], [50, 50]], w: 14, oneway: null }), city = cityOf([e]);
    const pts = [[10, 0, -3.5], [46.5, 0, -3.5], [46.5, 0, 30]];
    assert.ok(softenRoadCorners(city, pts).length > 3);
    city.buildingGrid.set('0,-1', [{ h: 12, ring: [[43, -5], [48, -5], [48, 1], [43, 1]] }]);
    assert.deepEqual(softenRoadCorners(city, pts), pts);
    city.buildingGrid.clear(); city.surfaceGrid.clear();
    assert.deepEqual(softenRoadCorners(city, pts), pts);
  });
  test('actual Game retains a valid route across timers, progresses smoothly and reuses GPU storage', () => {
    const { g, graph, calls } = fixture(); g.updateRoute(1 / 60);
    assert.equal(calls(), 1); const initialLength = g.route.len, geometry = g.gps.geometry, attr = geometry.getAttribute('position');
    assert.ok(g.gps.visible); assert.ok(g.gps.material.opacity > 0 && g.gps.material.opacity < .6);
    for (let i = 0; i < 240; i++) { g.player.pos.x += .1; g.updateRoute(1 / 60); }
    assert.equal(calls(), 1); assert.ok(Math.abs(initialLength - g.route.len - 24) < 1e-6);
    assert.equal(g.gps.geometry, geometry); assert.equal(geometry.getAttribute('position'), attr); assert.equal(attr.count % 1, 0);
    graph.addRoads([road({ id: 'unrelated', from: 'u', to: 'v', pts: [[2000, 0], [2100, 0]] })]);
    g.updateRoute(1 / 60); assert.equal(calls(), 1, 'unrelated streamed road does not replan a complete valid route');
  });
  test('off-road departure hides guidance and does not thrash A-star while still off-road', () => {
    const { g, calls } = fixture(); g.updateRoute(.016); g.player.pos.z = 40; g.updateRoute(.016);
    assert.equal(g.route, null); assert.equal(g.gps.visible, false); const n = calls();
    for (let i = 0; i < 20; i++) g.updateRoute(.016);
    assert.equal(calls(), n);
  });
  test('opposite physical carriageway and recovery placement force a correct new route', () => {
    const e = road({ w: 14, oneway: null }), { g, calls } = fixture(e);
    g.player.pos.z = -3.5; g.routeTarget.z = -3.5; g.updateRoute(.016); assert.equal(calls(), 1);
    g.player.pos.z = 3.5; g.updateRoute(.016); assert.equal(calls(), 2);
    assert.ok(g.route.pts[0][2] > 0); g.player.placementRevision++; g.updateRoute(.016); assert.equal(calls(), 3);
  });
  test('delivery planning uses both published stop heights instead of a road below the flyover', () => {
    const deck = road({ id: 'deck', elev: [6.8, 6.8] }), ground = road({ id: 'ground', from: 'c', to: 'd' });
    const graph = new RoadGraph([ground, deck]);
    const r = graph.route(20, -3, 800, -3, undefined, 6.8, 6.8);
    assert.ok(r); assert.ok(r.pts.every(p => Math.abs(p[1] - 6.8) < .01)); assert.deepEqual(r.edgeIds, ['deck']);
  });
  test('landed route discards the stale flight overview and new obstacles clip the guide', () => {
    const { g, city, calls } = fixture(); g.updateRoute(.016); g.player.flying = true; g.updateRoute(.016); assert.equal(g.gps.visible, false);
    const n = calls(); g.player.flying = false; g.updateRoute(.016); assert.equal(calls(), n + 1);
    city.walls.set('2,-1', [{ ax: 80, az: -15, bx: 80, bz: 15, y0a: -1, y0b: -1, y1a: 2, y1b: 2, kind: 'barrier' }]);
    g.updateRoute(.8); assert.equal(g.routeGuidanceBlocked, true); assert.ok(g.routeGuide.at(-1)[0] < 80);
    city.walls.clear(); g.updateRoute(.8); assert.equal(g.routeGuidanceBlocked, false); assert.ok(g.routeGuide.at(-1)[0] > 80);
  });
  console.log(`${checks} route-motion regression groups passed`);
} finally { await rm(temp, { recursive: true, force: true }); }
await import('./construction-guidance-regressions.mjs');
