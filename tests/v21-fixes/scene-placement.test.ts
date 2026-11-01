import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGroundScenePlacementJob, findGroundScenePlacement, groundScenePlacementKey } from '../../src/delivery/scene-placement';
import { RoadGraph } from '../../src/game/roadgraph';
import type { Building, RoadEdge } from '../../src/world/types';
import type { CityData } from '../../src/world/city';
import type { LevelConfig } from '../../src/delivery/core/types';
import { GateDelivery, RopeBucket, WalkingHandoff } from '../../src/delivery/modules/street-scenes';
import { DeliveryRuntime } from '../../src/delivery/runtime';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';

const road = (id = 'front-street', z = 16, vertical = false, width = 10): RoadEdge => ({ id, seg: id, name: 'Public street', cls: 'residential', w: width, lanes: 2,
  oneway: null, from: id + '-a', to: id + '-b', pts: vertical ? [[z, -200], [z, 200]] : [[-300, z], [300, z]], elev: null, maxspeed: 30 });
function city(): CityData & { rails: Map<string, any> } {
  return { group: new THREE.Group(), signs: null, lit: null, glow: null, buildingGrid: new Map(), surfaceGrid: new Map(), byBuilding: new Map(),
    obstacles: new Map(), walls: new Map(), waterGrid: new Map(), landmarkSurfaceGrid: new Map(), movingRail: [], railwayWalls: [], rails: new Map(),
    bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }, centroid: b => [b.ring[0][0], b.ring[0][1]], signals: [], lamps: [], busStops: [], walkPaths: [] };
}
function building(c: CityData, x0: number, x1: number, z0: number, z1: number, h = 12, id = 'mapped-building') {
  const b: Building = { id, name: null, cls: 'building', h, hs: 'surveyed', fc: null, rc: null, ring: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] };
  c.byBuilding.set(b.id, b);
  for (let x = Math.floor(x0 / 50); x <= Math.floor(x1 / 50); x++) for (let z = Math.floor(z0 / 50); z <= Math.floor(z1 / 50); z++) {
    const key = `${x},${z}`, list = c.buildingGrid.get(key) ?? []; list.push(b); c.buildingGrid.set(key, list);
  }
  return b;
}
function level(module = 'gateDelivery', params: Record<string, unknown> = { theme: 'college' }): LevelConfig {
  return { id: 'ground-scene', level: 1, celebrity: { name: 'Customer', movie: 'Scene', image: '/unknown.svg' },
    destination: { x: 0, z: 0, y: 45, label: 'Nizam College · Basheerbagh entrance' }, callMode: 'NONE', revealAt: 'afterDelivery', script: [], module,
    moduleParams: params, restaurantStage: 'Cart', completionLine: 'Delivered' };
}

test('ground scenes stay at street height rather than inheriting the content marker or a nearby roof', () => {
  const c = city(), graph = new RoadGraph([road()]), content = level(); building(c, 50, 70, -10, 10, 60);
  const before = JSON.stringify(content), result = findGroundScenePlacement(c, graph, content, { maxCandidates: 1 });
  assert.ok(result); assert.equal(result.destination.y, .02); assert.equal(result.destination.label, content.destination.label);
  assert.equal(JSON.stringify(content), before, 'placement must not mutate content'); assert.equal(c.byBuilding.size, 1);
});

test('full mapped building polygons block scenery, including thin overlaps between sampling points', () => {
  const c = city(), graph = new RoadGraph([road()]); building(c, -3.85, -3.8, -1.15, -1.05, 24);
  assert.equal(findGroundScenePlacement(c, graph, level(), { maxCandidates: 1 }), null);
  assert.equal(c.byBuilding.size, 1, 'the blocked building is never erased');
});

test('when the original footprint is occupied a bounded nearby clear ground location may be used, keeping the public label', () => {
  const c = city(), graph = new RoadGraph([road()]), content = level(); building(c, -8, -1, -5, 2, 40);
  const result = findGroundScenePlacement(c, graph, content); assert.ok(result);
  assert.ok(Math.hypot(result.destination.x, result.destination.z) <= 180);
  assert.ok(result.attempts <= 384); assert.equal(result.destination.y, .02); assert.equal(result.destination.label, content.destination.label);
});

test('a completely blocked footprint is preparation failure, never an elevated replacement scene', () => {
  const c = city(), graph = new RoadGraph([road()]); building(c, -500, 500, -500, 500, 8);
  assert.equal(findGroundScenePlacement(c, graph, level()), null);
});

test('blocking props cannot be installed across existing traffic streets or railway corridors', () => {
  const c = city(), graph = new RoadGraph([road(), road('rear-road', -1)]);
  assert.equal(findGroundScenePlacement(c, graph, level(), { maxCandidates: 1 }), null);
  c.rails.set('through-campus', { pts: [[-100, -1], [100, -1]] });
  assert.equal(findGroundScenePlacement(c, new RoadGraph([road()]), level(), { maxCandidates: 1 }), null);
});

test('unknown streaming tiles, water, underground road cuts and blocking approach walls are rejected', () => {
  const graph = new RoadGraph([road()]), c = city();
  assert.equal(findGroundScenePlacement(c, graph, level(), { isLoaded: () => false }), null);
  c.waterGrid.set('0,0', [{ ring: [[-500, -500], [500, -500], [500, 500], [-500, 500]], level: .02 }]);
  // Cover all hashed water cells for this footprint.
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) c.waterGrid.set(`${x},${z}`, c.waterGrid.get('0,0')!);
  assert.equal(findGroundScenePlacement(c, graph, level(), { maxCandidates: 1 }), null); c.waterGrid.clear();
  const cut: any = { e: null, i: 0, ax: 0, az: -10, bx: 0, bz: 20, ya: -4, yb: -4, hw: 8, kind: 'road' };
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) c.surfaceGrid.set(`${x},${z}`, [cut]);
  assert.equal(findGroundScenePlacement(c, graph, level(), { maxCandidates: 1 }), null); c.surfaceGrid.clear();
  c.walls.set('0,0', [{ ax: -20, az: 8, bx: 20, bz: 8, y0a: 0, y0b: 0, y1a: 1, y1b: 1, kind: 'median' }]);
  assert.equal(findGroundScenePlacement(c, graph, level(), { maxCandidates: 1 }), null);
});

test('Paradise reuses a mapped local building and a clear ground frontage, without constructing a duplicate facade', () => {
  const c = city(), graph = new RoadGraph([road('public-access', 8, true, 6)]); const b = building(c, -18, -6, -12, 12, 16.6);
  const content = level('ropeBucket', { roofHeight: 15 }); content.destination.label = 'Paradise Circle · Rooftop bucket';
  const result = findGroundScenePlacement(c, graph, content); assert.ok(result); assert.equal(result.reusedBuilding, b.id);
  assert.equal(result.moduleParams.useExistingFacade, true); assert.equal(result.moduleParams.roofHeight, 16.6); assert.equal(result.destination.y, .02);
  const scene = new THREE.Scene(), module = new RopeBucket();
  module.setup({ scene, destination: result.destination, player: () => ({ x: 0, y: .55, z: 0, yaw: 0, speed: 0 }), emit() {} }, result.moduleParams);
  assert.equal(module.supports.length, 0, 'the real building remains the source of facade collision');
  const bounds = new THREE.Box3().setFromObject(scene); assert.ok(bounds.max.x - bounds.min.x < 14, 'do not duplicate the 26m facade');
  assert.equal(module.target.label, content.destination.label); module.teardown(); assert.equal(c.byBuilding.size, 1);
  assert.equal(findGroundScenePlacement(city(), graph, content), null, 'a known restaurant anchor cannot silently become a generic invented building');
});

test('walking handover follows a verified quiet carriageway and does not draw a second road or invented roadside buildings', () => {
  const c = city(), graph = new RoadGraph([road('quiet-lane', 0, true)]), content = level('walkingHandoff', { walkingSpeed: .7 });
  const result = findGroundScenePlacement(c, graph, content, { maxCandidates: 1 }); assert.ok(result); assert.equal(result.moduleParams.useExistingStreet, true);
  const scene = new THREE.Scene(), module = new WalkingHandoff(); module.setup({ scene, destination: result.destination,
    player: () => ({ x: 0, y: .55, z: 0, yaw: 0, speed: 0 }), emit() {} }, { ...content.moduleParams, ...result.moduleParams });
  assert.equal(module.supports.length, 0);assert.equal(module.target.label, content.destination.label);
  const streetDetails:THREE.Mesh[]=[];scene.traverse(node=>{if(node instanceof THREE.Mesh&&node.name==='delivery-quiet-street')streetDetails.push(node);});
  assert.ok(streetDetails.length>0,'the walking route has visible curb-side lamp fixtures');
  for(const mesh of streetDetails){
    mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox!;
    assert.ok(bounds.min.y>=0,'an extra below-ground road slab was invented');
    assert.ok(bounds.max.x-bounds.min.x<1.5,'the route added broad road/building geometry instead of narrow curb fixtures');
  }
  module.teardown();
  const rotated = findGroundScenePlacement(c, new RoadGraph([road()]), content, { maxCandidates: 1 });
  assert.ok(rotated); assert.equal(rotated.moduleParams.streetYaw, Math.PI / 2, 'follow the actual road direction instead of inventing a perpendicular street');
});

test('runtime defers blocked street scenes and prepares clear ones on ground through the actual selector', () => {
  for (const blocked of [true, false]) {
    const c = city(); if (blocked) building(c, -500, 500, -500, 500, 30);
    const events = new EventBus<DeliveryEvents>(), content = level(); let prepared: any = null, created = 0;
    const game: any = { city: c, graph: new RoadGraph([road()]), deliveryEvents: events, rail: {},
      player: { pos: { x: 0, y: .55, z: 4 }, yaw: 0, speed: 0 }, traffic: {}, hud: { root: null, pickupStatus() {}, set() {} },
      engine: { scene: new THREE.Scene() }, carriers: { clear() {} }, sound: { cue() {} }, resetInput() {}, clock: { getDelta() {} },
      routeTarget: null, setTarget(target: unknown) { game.routeTarget = target; } };
    const runtime = new DeliveryRuntime(game, { levels: [content], storage: { getItem() { return null; }, setItem() {} },
      uiFactory: () => ({ blocking: false, collectionOpen: false, setVisible() {}, update() {}, dispose() {} }),
      moduleFactory: () => { created++; return { target: { ...content.destination, y: 0 }, supports: [], movement: { mode: 'normal' },
        status: { instruction: '', canDrop: false, actionLabel: 'DELIVER' }, setup: ctx => { prepared = ctx; }, update() {}, onDrop() {}, teardown() {} }; } });
    events.emit('orderPicked', { carrierId: 'test', position: { x: 0, y: 3, z: 0 } });
    for (let frame = 0; frame < 400 && !prepared; frame++) runtime.beforePlayer(.016);
    if (blocked) { assert.equal(created, 0); assert.equal(prepared, null); } else { assert.equal(created, 1); assert.equal(prepared.destination.y, .02); }
    runtime.dispose();
  }
});

test('placement jobs bound each step, cache unchanged failures, invalidate on revisions and cancel without producing a stale result', () => {
  const c = city(), graph = new RoadGraph([road()]), content = level();
  const job = createGroundScenePlacementJob(c, graph, content); assert.equal(job.done, false);
  assert.equal(job.step(2, 1), 1); assert.equal(job.operations, 1); assert.equal(job.done, false, 'indexing does not run synchronously at creation');
  job.cancel(); const operations = job.operations; assert.equal(job.step(2, 128), 0); assert.equal(job.operations, operations); assert.equal(job.result, null);
  building(c, -500, 500, -500, 500); const failed = createGroundScenePlacementJob(c, graph, content, { revision: 'tiles-a' });
  for (let frame = 0; frame < 2000 && !failed.done; frame++) assert.ok(failed.step(2, 4) <= 4);
  assert.equal(failed.done, true); assert.equal(failed.result, null);
  const cached = createGroundScenePlacementJob(c, graph, content, { revision: 'tiles-a' }); assert.equal(cached.done, true); assert.equal(cached.operations, 0);
  const streamed = createGroundScenePlacementJob(c, graph, content, { revision: 'tiles-b' }); assert.equal(streamed.done, false);
  const key = groundScenePlacementKey(c, graph, content, 'tiles-b'); graph.addRoads([road('another-street', 80)]);
  assert.notEqual(groundScenePlacementKey(c, graph, content, 'tiles-b'), key);
  assert.equal(streamed.step(2, 64), 0); assert.equal(streamed.cancelled, true); assert.equal(streamed.result, null, 'a stale world revision must never yield a ready scene');
});

test('runtime retry and streamed-road changes cancel pending placement work without resurrecting an old delivery', () => {
  const c = city(), events = new EventBus<DeliveryEvents>(), content = level(); let created = 0;
  const game: any = { city: c, graph: new RoadGraph([road()]), deliveryEvents: events, rail: {}, traffic: {},
    player: { pos: { x: 0, y: .55, z: 4 }, yaw: 0, speed: 0 }, hud: { root: null, pickupStatus() {}, set() {} },
    engine: { scene: new THREE.Scene() }, carriers: { clear() {} }, pickupDetector: { reset() {} }, sound: { cue() {} },
    resetInput() {}, clock: { getDelta() {} }, routeTarget: null, setTarget(target: unknown) { game.routeTarget = target; } };
  const runtime = new DeliveryRuntime(game, { levels: [content], storage: { getItem() { return null; }, setItem() {} },
    uiFactory: () => ({ blocking: false, collectionOpen: false, setVisible() {}, update() {}, dispose() {} }),
    moduleFactory: () => { created++; return { target: { ...content.destination, y: 0 }, supports: [], movement: { mode: 'normal' },
      status: { instruction: '', canDrop: false, actionLabel: 'DELIVER' }, setup() {}, update() {}, onDrop() {}, teardown() {} }; } });
  const pickup = () => events.emit('orderPicked', { carrierId: 'test', position: { x: 0, y: 3, z: 0 } });
  pickup(); runtime.beforePlayer(.016); const original = (runtime as any).groundPlacement.job;
  assert.equal(created, 0, 'preparation must not synchronously drain the full search');
  runtime.retry(); assert.equal(original.cancelled, true);
  for (let frame = 0; frame < 180; frame++) runtime.beforePlayer(.016);
  assert.equal(created, 0); assert.equal(game.routeTarget, null); assert.equal(runtime.controller.state, 'ROAMING');
  pickup(); runtime.beforePlayer(.016); const beforeStream = (runtime as any).groundPlacement.job;
  game.graph.addRoads([road('streamed-street', 80)]); runtime.beforePlayer(.016);
  assert.equal(beforeStream.cancelled, true); assert.notEqual((runtime as any).groundPlacement.job, beforeStream);
  for (let frame = 0; frame < 400 && !runtime.module; frame++) runtime.beforePlayer(.016);
  assert.equal(created, 1); assert.ok(runtime.module); runtime.dispose();
});
