import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficCurveRoadSupport, trafficCurveRoadWindow } from '../../src/game/traffic-curve-road-support';
import { TrafficCurve } from '../../src/game/traffic-path';
import { Traffic } from '../../src/game/traffic';
import * as THREE from 'three';
import { buildTile, type Surface } from '../../src/world/city';
import { initTemplates } from '../../src/core/util';
import { roadQuadHeight } from '../../src/world/road-surface';
import { RoadGraph } from '../../src/game/roadgraph';
import { EmittedPlayerGeometry } from '../fixtures/emitted-player-contact';
import type { RoadEdge } from '../../src/world/types';

const road = (id = 'owned'): RoadEdge => ({
  id, seg: id, cls: 'primary', name: null, w: 9.6, lanes: 3, oneway: 'no',
  from: id + 'a', to: id + 'b', maxspeed: 40,
  pts: [[100, 100], [120, 100], [140, 100], [160, 100]], elev: [0, 1, 1.6, 1.8],
});
const windows = [{ roadId: 'owned', firstSegment: 0, lastSegment: 2 }];
const quadSurface = (id: string, y: number, i = 0): Surface => ({
  e: road(id), i, kind: 'road', ax: 0, az: 0, bx: 20, bz: 0, ya: y, yb: y, hw: 4,
  roadQuad: [[0, y, -4], [20, y, -4], [20, y, 4], [0, y, 4]],
});

test('nonlinear curve Y follows actual emitted own asphalt while XZ, headings and timing stay untouched', () => {
  initTemplates();
  const own = road(), foreign = { ...road('overhead'), elev: [7, 8, 8.6, 8.8] };
  const built = buildTile({ i: 0, j: 0, roads: [own, foreign], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
  const sampler = new TrafficCurveRoadSupport(built.surfaceGrid, windows), graph = new RoadGraph([own]);
  const edge = graph.byId.get(own.id)!, curve = new TrafficCurve(graph.pointAt(edge, 2, 1, 2), graph.pointAt(edge, 58, 1, 2), 56 / 3);
  const emitted = new EmittedPlayerGeometry({ minX: 90, maxX: 170, minZ: 90, maxZ: 110 });
  emitted.collect(built);
  const before = { length: curve.length, minRadius: curve.minRadius, lengths: [...curve.lengths] };
  let oldError = 0, supported = 0;
  for (let distance = .1; distance < curve.length; distance += .27) {
    const original = curve.sample(distance), value = sampler.heightAt(original.x, original.z, original.y);
    assert.notEqual(value, null, 'own finite surface should be loaded');
    const actual = emitted.frame(original.x, original.z).nearestSupport(original.x, original.z, value!);
    assert.ok(actual);
    oldError = Math.max(oldError, Math.abs(original.y - actual.y));
    assert.ok(Math.abs(value! - actual.y) < .001);
    assert.deepEqual(curve.sample(distance), original, 'lookup must not mutate the curve or sample');
    supported++;
  }
  assert.ok(oldError > .25, 'old endpoint chord must reproduce visible floating/sinking');
  assert.ok(supported > 150);
  assert.deepEqual({ length: curve.length, minRadius: curve.minRadius, lengths: curve.lengths }, before);
});

test('explicit segment ownership rejects foreign decks, loop branches, margins and ambiguous own layers', () => {
  const own = quadSurface('owned', .4), upper = quadSurface('foreign', .8), loop = quadSurface('owned', .7, 9);
  const grid = new Map([['0,0', [upper, loop, own]]]);
  const sampler = new TrafficCurveRoadSupport(grid, [{ roadId: 'owned', firstSegment: 0, lastSegment: 0 }]);
  assert.equal(sampler.heightAt(10, 0, .7), .4);
  assert.equal(sampler.heightAt(21, 0, .4), null, 'no endpoint capsule');
  assert.equal(sampler.heightAt(10, 4.1, .4), null, 'no widened pavement margin');
  assert.equal(sampler.heightAt(10, 0, 3), null, 'bounded guide correction');
  grid.set('0,0', [quadSurface('owned', -.4), quadSurface('owned', .4)]);
  assert.equal(sampler.heightAt(10, 0, 0), null, 'equal plausible sheets must not choose highest');
  grid.set('0,0', [quadSurface('foreign', .4), { ...own, e: null }]);
  assert.equal(sampler.heightAt(10, 0, .4), null, 'unowned cap/foreign road cannot impersonate intended source');
});

test('live World-style append, unload and replacement invalidate cached cells without whole-city scans', () => {
  const own = quadSurface('owned', .4), source = [own], grid = new Map([['0,0', source]]);
  const sampler = new TrafficCurveRoadSupport(grid, windows);
  assert.equal(sampler.heightAt(10, 0, .4), .4);
  source.push(quadSurface('owned', .6));
  assert.equal(sampler.heightAt(10, 0, .5), null, 'append invalidates a warm list');
  grid.set('0,0', [quadSurface('owned', .9)]);
  assert.equal(sampler.heightAt(10, 0, .9), .9);
  grid.delete('0,0');
  assert.equal(sampler.heightAt(10, 0, .9), null, 'unloaded geometry cannot remain support');
  grid.set('0,0', [own]);
  assert.equal(sampler.heightAt(10, 0, .4), .4);
  const fail = () => { throw Error('whole-city/bucket iteration on warm query'); };
  (grid as any)[Symbol.iterator] = fail; (grid as any).values = fail; (grid as any).entries = fail;
  (source as any)[Symbol.iterator] = fail;
  for (let n = 0; n < 1000; n++) assert.equal(sampler.heightAt(10, 0, .4), .4);
  assert.equal(roadQuadHeight(own.roadQuad!, 10, 0), .4);
});

test('invalid inputs, dense cells and residency limits fail closed with bounded work', () => {
  const grid = new Map<string, Surface[]>(), sampler = new TrafficCurveRoadSupport(grid, windows);
  for (let i = 0; i < 120; i++) {
    const surface = quadSurface('owned', .4);
    surface.roadQuad = surface.roadQuad!.map(p => [p[0] + i * 90, p[1], p[2]]) as Surface['roadQuad'];
    grid.set(`${i * 3},0`, [surface]);
    assert.equal(sampler.heightAt(i * 90 + 10, 0, .4), .4);
    assert.ok((sampler as any).cells.size <= TrafficCurveRoadSupport.MAX_CACHED_CELLS);
  }
  grid.set('0,0', Array.from({ length: TrafficCurveRoadSupport.MAX_CELL_SURFACES + 1 }, () => quadSurface('foreign', .4)));
  assert.equal(sampler.heightAt(10, 0, .4), null);
  for (const invalid of [[], [{ roadId: 'owned', firstSegment: 2, lastSegment: 1 }], [{ roadId: 'owned', firstSegment: 0, lastSegment: Infinity }]]) {
    assert.equal(new TrafficCurveRoadSupport(new Map([['0,0', [quadSurface('owned', .4)]]]), invalid).heightAt(10, 0, .4), null);
  }
  assert.equal(sampler.heightAt(NaN, 0, .4), null);
});

test('directed source windows are local for forward, reverse and U-turn approaches', () => {
  const own = { ...road(), pts: Array.from({ length: 11 }, (_, i) => [i * 10, 0] as [number, number]), elev: null };
  const edge = new RoadGraph([own]).byId.get(own.id)!;
  assert.deepEqual(trafficCurveRoadWindow(edge, 1, 13, 27), { roadId: own.id, firstSegment: 0, lastSegment: 3 });
  assert.deepEqual(trafficCurveRoadWindow(edge, -1, 73, 87), trafficCurveRoadWindow(edge, 1, 13, 27));
  assert.deepEqual(trafficCurveRoadWindow(edge, -1, 13, 27), { roadId: own.id, firstSegment: 6, lastSegment: 9 });
  assert.deepEqual(trafficCurveRoadWindow(edge, 1, 88, 100), trafficCurveRoadWindow(edge, -1, 0, 12));
  assert.equal(trafficCurveRoadWindow(edge, 1, NaN, 40).firstSegment, -1);
});

test('production planning binds support before clear checks and actual swept movement uses the same Y', () => {
  initTemplates();
  const own = road(), graph = new RoadGraph([own]), edge = graph.byId.get(own.id)!;
  const built = buildTile({ i: 0, j: 0, roads: [own], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
  const city = { ...built, waterGrid: new Map(), movingRail: [] }, geometry = new EmittedPlayerGeometry({ minX: 90, maxX: 170, minZ: 90, maxZ: 110 });
  geometry.collect(built);
  const a = graph.pointAt(edge, 4, 1, 2), b = graph.pointAt(edge, 56, 1, 2), curve = new TrafficCurve(a, b, 52 / 3);
  const car: any = { ...a, g: new THREE.Group(), edge, dir: 1, s: 4, size: [2, 1.4, 4.8], group: 'car', lane: 2, speed: 10 };
  const traffic: any = Object.assign(Object.create(Traffic.prototype), { graph, city, cars: [car], railwayDistance: () => Infinity, redStop: () => undefined });
  assert.equal(traffic.curveOK(car, curve, [{ edge, dir: 1, start: 4, end: 56 }]), true);
  car.motion = { kind: 'bend', curve, startS: 4, endS: 56, edge, dir: 1, lane: 2, progress: 0, cap: 10 };
  for (let n = 0; n < 120; n++) {
    traffic.advance(car, 10 / 60, { x: 900, z: 900, y: 0, speed: 0 }, []);
    const pose = curve.sample(car.motion.progress);
    for (const key of ['x', 'y', 'z', 'hx', 'hz']) assert.ok(Object.is(car[key], (pose as any)[key]));
    const support = geometry.frame(car.x, car.z).nearestSupport(car.x, car.z, car.y);
    assert.ok(support && Math.abs(support.y - car.y) < .001);
    assert.equal(car.speed, 10);
  }
  assert.ok(car.motion.progress > 19.9);
  const flat = { ...own, elev: [0, 0, 0, 0] }, flatGraph = new RoadGraph([flat]), flatEdge = flatGraph.byId.get(flat.id)!;
  const flatBuilt = buildTile({ i: 0, j: 0, roads: [flat], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
  const fa = flatGraph.pointAt(flatEdge, 2, 1, 2), fb = flatGraph.pointAt(flatEdge, 58, 1, 2), original = new TrafficCurve(fa, fb, 56 / 3), bound = new TrafficCurve(fa, fb, 56 / 3);
  bound.setRoadSupport(new TrafficCurveRoadSupport(flatBuilt.surfaceGrid, windows));
  for (let i = 0; i <= 120; i++) assert.deepEqual(bound.sample(bound.length * i / 120), original.sample(original.length * i / 120));
});
