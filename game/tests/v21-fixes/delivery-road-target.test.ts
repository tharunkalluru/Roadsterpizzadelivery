import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { RoadEdge } from '../../src/world/types';
import { RoadGraph } from '../../src/game/roadgraph';
import { DeliveryRuntime } from '../../src/delivery/runtime';
// Historical scripted-call/IMAX target fixtures; production scene content is separate.
import { loadLegacyLevels as loadLevels } from './fixtures/legacy-levels';
import { createDeliveryModule } from '../../src/delivery/modules';
import { resolveDeliveryRoadTarget } from '../../src/delivery/road-navigation-target';

const road = (id: string, y = 0, z = 0): RoadEdge => ({ id, seg: id, name: id, cls: 'primary', w: 10, lanes: 2,
  oneway: 'backward', from: `${id}:a`, to: `${id}:b`, pts: [[-100, z], [100, z]], elev: y ? [y, y] : null, maxspeed: 50 });
const city = () => ({ group: new THREE.Group(), surfaceGrid: new Map(), buildingGrid: new Map(), walls: new Map(),
  obstacles: new Map(), landmarkSurfaceGrid: new Map(), waterGrid: new Map(), movingRail: [] });

test('elevated roof and indoor targets resolve to an actual street without moving their visual marker', () => {
  const graph = new RoadGraph([road('street')]);
  for (const y of [12, 22, 30]) {
    const target = { x: 0, y, z: 30, label: 'Customer entrance' }, before = { ...target };
    assert.equal(graph.route(-80, 0, target.x, target.z, { hx: 1, hz: 0, y: .55 }, y), null,
      'the authored height cannot be treated as a street grade');
    const access = resolveDeliveryRoadTarget(graph, target, { offRoad: true })!;
    assert.ok(access); assert.equal(access.y, 0); assert.ok(Math.abs(access.z) <= 5);
    assert.deepEqual(target, before, 'flight marker, scene and drop height stay unchanged');
    const route = graph.route(-80, 0, access.x, access.z, { hx: 1, hz: 0, y: .55 }, access.y)!;
    assert.ok(route?.complete && route.pts.length >= 2);
    assert.ok(route.pts.every(point => point[1] === 0 && Math.abs(point[2]) <= 5), 'no road spur rises to the roof or crosses the compound');
  }
});

test('real bridge and ground targets retain their distinct mapped grades', () => {
  const graph = new RoadGraph([road('ground'), road('bridge', 6)]);
  const high = resolveDeliveryRoadTarget(graph, { x: 0, y: 6, z: 0 }, { offRoad: false })!;
  const low = resolveDeliveryRoadTarget(graph, { x: 0, y: 0, z: 0 }, { offRoad: false })!;
  assert.equal(high.y, 6); assert.equal(low.y, 0);
  assert.ok(graph.route(-80, 0, high.x, high.z, { hx: 1, hz: 0, y: 6.55 }, high.y));
  assert.equal(graph.route(-80, 0, high.x, high.z, { hx: 1, hz: 0, y: .55 }, high.y), null,
    'source road grade remains strict; no invented ramp joins the overlapping roads');
});

test('an off-road roof cannot accidentally select an overlapping elevated flyover', () => {
  const graph = new RoadGraph([road('ground'), road('flyover', 12)]);
  assert.equal(resolveDeliveryRoadTarget(graph, { x: 0, y: 12, z: 0 }, { offRoad: true })!.y, 0);
  assert.equal(resolveDeliveryRoadTarget(new RoadGraph([road('only-flyover', 12)]), { x: 0, y: 12, z: 0 }, { offRoad: true }), null,
    'no ground street means no invented approach');
});

test('a moving truck uses the actual road/deck base rather than the carried customer roof', () => {
  const graph = new RoadGraph([road('ground'), road('bridge', 6)]), level = loadLevels()[0];
  const runtime: any = Object.assign(Object.create(DeliveryRuntime.prototype), {
    game: { graph }, controller: { activeLevel: level, complete: false },
    target: { x: 0, y: 8.1, z: 0 }, module: { trafficBodies: [{ id: 'delivery-log-truck', y: 6 }], supports: [] },
  });
  assert.equal(runtime.roadNavigationTarget.y, 6);
  assert.equal(runtime.destination.y, 8.1, 'the actual interior target is unchanged');
});

test('road approach lookup is bounded and refuses missing or malformed road targets', () => {
  const graph = new RoadGraph([road('street')]);
  for (const target of [{ x: 0, y: 30, z: 800 }, { x: NaN, y: 12, z: 0 }, { x: 0, y: Infinity, z: 0 }])
    assert.equal(resolveDeliveryRoadTarget(graph, target, { offRoad: true }), null);
  assert.equal(resolveDeliveryRoadTarget(new RoadGraph([]), { x: 0, y: 12, z: 0 }, { offRoad: true }), null);
});

test('runtime caches a static street approach and invalidates it for streamed roads and moving targets', () => {
  const graph = new RoadGraph([road('far-street')]), level = loadLevels()[2];
  let lookups = 0; const nearest = graph.nearestEdges.bind(graph);
  graph.nearestEdges = (...args) => { lookups++; return nearest(...args); };
  const runtime: any = Object.assign(Object.create(DeliveryRuntime.prototype), {
    game: { graph }, controller: { activeLevel: level, complete: false }, target: { x: 0, y: 30, z: 30 }, module: null,
  });
  const first = runtime.roadNavigationTarget;
  for (let frame = 0; frame < 300; frame++) assert.equal(runtime.roadNavigationTarget, first);
  assert.equal(lookups, 1, 'the city is not scanned every frame');
  runtime.target.y = 50;
  assert.equal(runtime.roadNavigationTarget, first); assert.equal(lookups, 1, 'off-road vertical animation does not rescan the same street');
  graph.addRoads([road('closer-street', 0, 20)]);
  const closer = runtime.roadNavigationTarget;
  assert.equal(lookups, 2); assert.ok(closer.z > first.z + 10);
  runtime.target.x = 12;
  assert.ok(Math.abs(runtime.roadNavigationTarget.x - 12) < 1e-8); assert.equal(lookups, 3);
  runtime.controller.activeLevel = null;
  assert.equal(runtime.roadNavigationTarget, null, 'a completed or cleared order has no stale road approach');
});

test('ground arrival at a street approach requests flight rather than zero-metre straight driving to a roof', () => {
  const graph = new RoadGraph([road('street')]), level = loadLevels()[2];
  const player = { pos: new THREE.Vector3(0, .55, 0), yaw: 0, flying: false, descending: false, jumping: false };
  const runtime: any = Object.assign(Object.create(DeliveryRuntime.prototype), {
    game: { graph, player }, controller: { activeLevel: level, complete: false, canDrop: false },
    target: { x: 0, y: 30, z: 30 }, module: null,
  });
  assert.equal(runtime.localNavigation.hint, 'Fly to marker');
  runtime.target.z = 200;
  assert.equal(runtime.localNavigation.hint, 'Fly to marker', 'the off-road remainder may exceed the normal 40 m scene radius');
  assert.ok(runtime.localNavigation.metres > 190);
  player.pos.y = 30;
  runtime.target.z = 20;
  assert.equal(runtime.localNavigation.hint, 'Approach marker', 'a same-height player already inside a hall is not told to take off');
  player.pos.set(0, .55, 0); player.flying = true; runtime.target.z = 200;
  assert.equal(runtime.localNavigation, undefined, 'normal flight guidance owns airborne approach');
});

test('an open truck rear entrance retains its ramp instruction at the street approach', () => {
  const graph = new RoadGraph([road('street')]), level = loadLevels()[0];
  const runtime: any = Object.assign(Object.create(DeliveryRuntime.prototype), {
    game: { graph, player: { pos: new THREE.Vector3(0, .55, -20), yaw: Math.PI, flying: false } },
    controller: { activeLevel: level, complete: false, canDrop: true }, target: { x: 0, y: .55, z: -18 },
    module: { arrival: { side: 'rear', x: 0, y: .55, z: -8, hx: 0, hz: 1 }, supports: [], trafficBodies: [] },
  });
  assert.equal(runtime.localNavigation.hint, 'Approach ramp');
});

for (const id of ['police-rooftop', 'imax-seat-service']) test(`actual ${id} module setup keeps its high target while restoring a ground approach`, () => {
  const original = loadLevels().find(level => level.id === id)!;
  const level = { ...original, destination: { ...original.destination, x: 0, z: 30 } };
  const graph = new RoadGraph([road('street')]), c = city();
  const game: any = { graph, city: c, engine: { scene: new THREE.Scene() }, traffic: {},
    player: { pos: new THREE.Vector3(-80, .55, 0), yaw: -Math.PI / 2, speed: 0, flying: false }, sound: { cue() {} } };
  const runtime: any = Object.assign(Object.create(DeliveryRuntime.prototype), {
    game, controller: { activeLevel: level, canDrop: false, complete: false }, moduleFactory: createDeliveryModule,
    setTarget(point: any) { this.target = { ...point }; },
  });
  runtime.prepareModule(); runtime.module.update(1 / 60);
  assert.ok(runtime.destination.y >= level.destination.y);
  assert.equal(graph.route(-80, 0, runtime.destination.x, runtime.destination.z,
    { hx: 1, hz: 0, y: .55 }, runtime.destination.y), null);
  const access = runtime.roadNavigationTarget;
  assert.ok(access && access.y === 0);
  assert.ok(graph.route(-80, 0, access.x, access.z, { hx: 1, hz: 0, y: .55 }, access.y));
  runtime.module.teardown();
});
