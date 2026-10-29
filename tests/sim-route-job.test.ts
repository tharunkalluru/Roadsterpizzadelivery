import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadGraph } from '../src/game/roadgraph';
import { RouteSearchGate } from '../src/game/route-search-gate';
import { rng } from '../src/core/util';
import { legacyRoute } from './fixtures/sim-route-legacy';
import type { RoadEdge } from '../src/world/types';
import * as THREE from 'three';
import { Game } from '../src/game/game';

function fixture() {
  const roads: RoadEdge[] = [], size = 14, random = rng(804512);
  for (const level of [0, 8]) for (let x = 0; x < size; x++) for (let z = 0; z < size; z++) {
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      if (x + dx >= size || z + dz >= size) continue;
      roads.push({ id: `${level}:${x}:${z}:${dx}`, seg: 'fixture', name: 'Fixture road',
        cls: random.pick(['primary', 'residential', 'service']), w: 14, lanes: 4,
        oneway: random.pick([null, null, 'forward', 'backward']), from: `${x},${z}`, to: `${x + dx},${z + dz}`,
        pts: [[x * 30, z * 30], [(x + dx) * 30, (z + dz) * 30]], elev: [level, level], maxspeed: null });
    }
  }
  return new RoadGraph(roads);
}

test('resumable and sync routes match frozen legacy outcomes over directed stacked random routes', () => {
  const graph = fixture(), random = rng(82033);
  for (let i = 0; i < 160; i++) {
    const a = random.pick(graph.edges), b = random.pick(graph.edges), source = graph.pointAt(a, random() * a.len, 1, 2);
    const target = graph.pointAt(b, random() * b.len, 1, 2);
    const car = i % 3 ? { hx: source.hx, hz: source.hz, y: source.y, edgeId: a.e.id } : undefined;
    const args: Parameters<RoadGraph['route']> = [source.x, source.z, target.x, target.z, car, target.y, source.y];
    const expected = legacyRoute.call(graph, ...args);
    assert.deepEqual(graph.route(...args), expected);
    const job = graph.routeJob(...args); let tick = 0;
    while (job.state === 'pending') {
      let virtual = 0;
      job.step(.25, () => virtual += .02, 12);
      assert.ok(++tick < 100000);
    }
    assert.deepEqual(job.result, expected, `route ${i} changed path, length or completion`);
  }
});

test('route job is lazy, bounded by operations, cancelable and invalidated by graph revision', () => {
  const graph = fixture(), job = graph.routeJob(0, 0, 390, 390);
  assert.equal(job.operations, 0);
  job.step(100, () => 0, 5);
  assert.equal(job.operations, 5); assert.equal(job.state, 'pending'); assert.equal(job.result, null);
  job.cancel(); const count = job.operations; job.step(100, () => 0);
  assert.equal(job.state, 'cancelled'); assert.equal(job.operations, count); assert.equal(job.result, null);
  const stale = graph.routeJob(0, 0, 390, 390); stale.step(100, () => 0, 5);
  graph.addRoads([{ ...graph.edges[0].e, id: 'new-streamed-road' }]); stale.step(100, () => 0);
  assert.equal(stale.state, 'invalidated'); assert.equal(stale.result, null);
});

test('route gate rejects pending target, graph, placement and mode changes before publication', () => {
  const graph = fixture();
  for (const change of [{ targetKey: 'drop:B' }, { graphRevision: graph.revision + 1 }, { placementRevision: 2 }, { airborne: true }]) {
    const gate = new RouteSearchGate(), identity = { targetKey: 'pickup:A', graphRevision: graph.revision, placementRevision: 1, startKey: 'road', airborne: false };
    const original = graph.routeJob(0, 0, 390, 390);
    assert.equal(gate.updateSearch(0, identity, () => original, 0).state, 'pending');
    const replacement = graph.routeJob(0, 0, 60, 60);
    gate.updateSearch(.1, { ...identity, ...change }, () => replacement, 0);
    assert.equal(original.state, 'cancelled'); assert.equal(original.result, null);
    gate.reset(); assert.equal(replacement.state, 'cancelled'); assert.equal(gate.hasPending, false);
  }
});

test('route gate null result retries are delayed, while changed context can start immediately', () => {
  const graph = fixture(), gate = new RouteSearchGate();
  const id = { targetKey: 'outside', graphRevision: graph.revision, placementRevision: 1 };
  const run = () => graph.routeJob(0, 0, 100000, 100000);
  const drain = (now: number, identity = id, create = run) => {
    let result = gate.updateSearch(now, identity, create, 1000), count = 0;
    while (result.state === 'pending') { result = gate.updateSearch(now, identity, undefined, 1000); assert.ok(++count < 10000); }
    return result;
  };
  const first = drain(0); assert.equal(first.state, 'failed');
  assert.equal(gate.updateSearch(.7, id, run, 1000).state, 'idle');
  assert.equal(drain(1.21).state, 'failed');
  const edge = graph.edges.find(e => !e.e.oneway)!, a = graph.pointAt(edge, 1, 1), b = graph.pointAt(edge, edge.len - 1, 1);
  const changed = drain(1.22, { ...id, targetKey: 'valid' }, () => graph.routeJob(a.x, a.z, b.x, b.z, undefined, b.y, a.y));
  assert.equal(changed.state, 'complete'); assert.ok(changed.route?.pts.length);
});

test('actual Game route publication reanchors after50m of movement while the search is pending', () => {
  const edge: RoadEdge = { id: 'straight', seg: 'fixture', name: 'Fixture', cls: 'residential', w: 8, lanes: 2, oneway: null,
    from: 'a', to: 'b', pts: [[0, 0], [0, -500]], elev: [0, 0], maxspeed: null };
  const graph = new RoadGraph([edge]), game: any = Object.create(Game.prototype);
  class DelayedGate extends RouteSearchGate {
    ticks = 0;
    updateSearch(now: number, identity: any, create?: any, budget = 1, frameId?: number) {
      return super.updateSearch(now, identity, create, ++this.ticks < 52 ? 0 : 100, frameId);
    }
  }
  const gate = new DelayedGate(), surfaceGrid = new Map();
  const surface = { e: edge, i: 0, ax: 0, az: 0, bx: 0, bz: -500, ya: 0, yb: 0, hw: 4, kind: 'road' };
  for (let z = -18; z <= 1; z++) surfaceGrid.set(`0,${z}`, [surface]);
  Object.assign(game, { graph, routeSearchGate: gate, t: 0, area: { name: 'Synthetic' },
    city: { surfaceGrid, buildingGrid: new Map(), walls: new Map(), obstacles: new Map() },
    engine: { renderer: { info: { render: { frame: 0 } } } },
    player: { pos: new THREE.Vector3(0, .55, 0), forward: new THREE.Vector3(0, 0, -1), speed: 30, placementRevision: 1 },
    routeTarget: { x: 0, y: 0, z: -400 }, route: graph.route(0, 0, 0, -400, { hx: 0, hz: -1, y: .55 }),
    routeT: .6, routeGuideT: 100, routeGuide: [], routeWasAirborne: true, routePlacementRevision: 1,
    routeGraphRevision: graph.revision, routeAlpha: 1, gps: new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()),
    performanceMonitor: { count() {} },
  });
  game.updateRoute(1 / 30);
  assert.equal(gate.hasPending, true);
  for (let tick = 1; tick <= 50; tick++) {
    game.player.pos.z = -tick; game.t = tick / 30; game.engine.renderer.info.render.frame++;
    game.updateRoute(1 / 30);
    assert.ok(game.route, 'a valid previous route should remain during replacement');
  }
  assert.equal(gate.hasPending, true);
  game.engine.renderer.info.render.frame++; game.updateRoute(1 / 30);
  assert.equal(gate.hasPending, false);
  assert.equal(gate.searches, 1, 'movement must not cause an endless stale-start replan');
  assert.ok(game.route && Math.abs(game.route.pts[0][2] + 50) < .01, 'completed route must start at actual current50m pose');
  assert.ok(Math.abs(game.route.len - 350) < .01);
  const originalJob = graph.routeJob.bind(graph); let pendingJob: ReturnType<RoadGraph['routeJob']>;
  graph.routeJob = (...args) => pendingJob = originalJob(...args);
  gate.ticks = 0; game.t += 1; game.routeWasAirborne = true; game.engine.renderer.info.render.frame++;
  game.updateRoute(1 / 30); assert.equal(gate.hasPending, true);
  graph.addRoads([{ ...edge, id: 'new-streamed-edge' }]); game.engine.renderer.info.render.frame++;
  game.updateRoute(1 / 30);
  assert.equal(pendingJob!.state, 'cancelled', 'actual Game must cancel old graph search before publication');
  assert.ok(game.route && Math.abs(game.route.pts[0][2] + 50) < .01, 'valid existing guidance survives replacement cancellation');
});

test('fixed ticks sharing a presentation frame cannot each spend a fresh route slice', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let time = 0, calls = 0;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => time += 2 } });
  try {
    const gate = new RouteSearchGate(), identity = { targetKey: 't', graphRevision: 1, placementRevision: 1 };
    const work: any = { state: 'pending', step() { calls++; return 'pending'; }, cancel() {} };
    gate.updateSearch(0, identity, () => work, 1, 10);
    for (let i = 0; i < 4; i++) gate.updateSearch(i / 60, identity, undefined, 1, 10);
    assert.equal(calls, 1);
    gate.updateSearch(.1, identity, undefined, 1, 11); assert.equal(calls, 2);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'performance', descriptor); else delete (globalThis as any).performance;
  }
});
