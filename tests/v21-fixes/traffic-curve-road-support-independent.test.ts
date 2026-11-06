import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficCurveRoadSupport, trafficCurveRoadWindow } from '../../src/game/traffic-curve-road-support';
import { TrafficCurve } from '../../src/game/traffic-path';
import { Traffic } from '../../src/game/traffic';
import { RoadGraph } from '../../src/game/roadgraph';
import type { RoadEdge } from '../../src/world/types';
import type { Surface } from '../../src/world/city';

function edge(id: string, xs: number[]): RoadEdge {
  return { id, cls: 'primary', name: null, w: 16, lanes: 4, oneway: null,
    from: id + '-a', to: id + '-b', maxspeed: 40, pts: xs.map(x => [x, 100]), elev: xs.map(() => 0) };
}
function surface(roadId: string, y: number, i = 0): Surface {
  return { e: edge(roadId, [0, 20]), i, kind: 'road', ax: 0, az: 0, bx: 20, bz: 0, ya: y, yb: y, hw: 5,
    roadQuad: [[0, y, -5], [20, y, -5], [20, y, 5], [0, y, 5]] };
}

test('asymmetric reverse windows bind source segments rather than directed-distance lookalikes', () => {
  const graph = new RoadGraph([edge('nonuniform', [0, 7, 9, 30, 68, 100, 145])]), own = graph.byId.get('nonuniform')!;
  assert.deepEqual(trafficCurveRoadWindow(own, -1, 12, 29), { roadId: own.e.id, firstSegment: 4, lastSegment: 5 });
  assert.deepEqual(trafficCurveRoadWindow(own, 1, 12, 29), { roadId: own.e.id, firstSegment: 1, lastSegment: 3 });
  assert.deepEqual(trafficCurveRoadWindow(own, -1, 12, 29), trafficCurveRoadWindow(own, 1, 116, 133));
  assert.deepEqual(trafficCurveRoadWindow(own, -1, 29, 12), trafficCurveRoadWindow(own, -1, 12, 29));
  for (const dir of [1, -1] as const) {
    assert.deepEqual(trafficCurveRoadWindow(own, dir, -10, 155), { roadId: own.e.id, firstSegment: 0, lastSegment: 5 });
  }
});

test('actual bus-span planner includes every intermediate edge and clips an asymmetric reverse exit', () => {
  const roads = [edge('first', [100, 105, 112]), edge('middle', [140, 132, 126, 112]), edge('last', [190, 185, 180, 170, 155, 140])];
  const graph = new RoadGraph(roads), first = graph.byId.get('first')!, middle = graph.byId.get('middle')!, last = graph.byId.get('last')!;
  const path = [{ edge: first, dir: 1 }, { edge: middle, dir: -1 }, { edge: last, dir: -1 }];
  const car: any = { edge: first, dir: 1, s: 3, lane: 2.8, size: [2.5, 3.3, 11], group: 'bus',
    busRun: { path, step: 0, stopPosition: { edge: last, dir: -1, s: 35 }, ended: false } };
  const traffic: any = Object.assign(Object.create(Traffic.prototype), { graph, cars: [car], services: undefined });
  const captured: any[][] = [];
  traffic.curveOK = (_car: unknown, _curve: TrafficCurve, spans: any[]) => { captured.push(spans); return false; };
  assert.equal(traffic.prepareBusSpan(car), false, 'observer deliberately rejects candidates without changing production planning');
  const three = captured.filter(spans => spans.length === 3);
  assert.ok(three.length > 0, 'nonvacuous bus maneuver crosses all three directed source pieces');
  for (const spans of three) {
    assert.deepEqual(spans.map(span => [span.edge.e.id, span.dir]), [['first', 1], ['middle', -1], ['last', -1]]);
    assert.equal(spans[0].start, 3); assert.equal(spans[0].end, 12);
    assert.equal(spans[1].start, 0); assert.equal(spans[1].end, 28);
    assert.equal(spans[2].start, 0); assert.ok(spans[2].end > 0 && spans[2].end <= 35);
  }
  const clipped = three.find(spans => Math.abs(spans[2].end - 15) < 1e-9)!;
  assert.ok(clipped, '52m candidate must stop15m into the reverse exit after9m+28m');
  assert.deepEqual(trafficCurveRoadWindow(last, clipped[2].dir, clipped[2].start, clipped[2].end),
    { roadId: 'last', firstSegment: 2, lastSegment: 4 });
});

test('warmed sampler issues exactly nine local gets without array iteration or re-filtering buckets', () => {
  const own = surface('owned', .3), rows = [own];
  let inspectSource = true, numericReads = 0, gridGets = 0, arrayIterations = 0;
  const source = new Proxy(rows, { get(target, property, receiver) {
    if (typeof property === 'string' && /^\d+$/.test(property)) { numericReads++; if (!inspectSource) throw Error('warm source bucket was re-filtered'); }
    return Reflect.get(target, property, receiver);
  } });
  const grid = new Map([['0,0', source]]), sampler = new TrafficCurveRoadSupport(grid, [{ roadId: 'owned', firstSegment: 0, lastSegment: 0 }]);
  assert.equal(sampler.heightAt(10, 0, .3), .3); inspectSource = false; numericReads = 0;
  const originalGet = grid.get.bind(grid), originalIterator = Array.prototype[Symbol.iterator];
  grid.get = key => { gridGets++; return originalGet(key); };
  const forbidden = () => { throw Error('whole-grid iteration on warm query'); };
  (grid as any).values = forbidden; (grid as any).entries = forbidden; (grid as any)[Symbol.iterator] = forbidden;
  Array.prototype[Symbol.iterator] = function () { arrayIterations++; return originalIterator.call(this); };
  let y: number | null;
  try { y = sampler.heightAt(10, 0, .3); }
  finally { Array.prototype[Symbol.iterator] = originalIterator; }
  assert.equal(y!, .3); assert.equal(gridGets, 9); assert.equal(numericReads, 0); assert.equal(arrayIterations, 0);
  inspectSource = true;
  rows.push(surface('owned', .5)); assert.equal(sampler.heightAt(10, 0, .4), null, 'same-array World append invalidates');
  grid.set('0,0', rows.filter(s => s !== own)); assert.equal(sampler.heightAt(10, 0, .5), .5, 'World unload replacement discards removed source');
  grid.delete('0,0'); assert.equal(sampler.heightAt(10, 0, .5), null);
});

test('foreign road IDs, excluded same-road loop branches and unbound caps never supply curve support', () => {
  const own = surface('owned', .2), loop = surface('owned', .65, 90), foreign = surface('owned-lookalike', .7);
  const cap = { ...surface('owned', .7), i: -1 }, noOwner = { ...surface('owned', .7), e: null };
  for (const rows of [[foreign, loop, cap, noOwner, own], [own, noOwner, cap, loop, foreign]]) {
    const grid = new Map([['0,0', rows]]), sampler = new TrafficCurveRoadSupport(grid, [{ roadId: 'owned', firstSegment: 0, lastSegment: 2 }]);
    assert.equal(sampler.heightAt(10, 0, .7), .2);
    grid.set('0,0', rows.filter(s => s !== own)); assert.equal(sampler.heightAt(10, 0, .7), null);
  }
  for (const rows of [[surface('owned', -.4), surface('owned', .4)], [surface('owned', .4), surface('owned', -.4)]]) {
    assert.equal(new TrafficCurveRoadSupport(new Map([['0,0', rows]]), [{ roadId: 'owned', firstSegment: 0, lastSegment: 0 }]).heightAt(10, 0, 0), null);
  }
});

test('all window and owned-bucket limits fail closed instead of silently accepting a partial surface list', () => {
  const own = surface('owned', .3), valid = { roadId: 'owned', firstSegment: 0, lastSegment: 0 };
  const grid = new Map([['0,0', [own]]]);
  assert.equal(new TrafficCurveRoadSupport(grid, Array.from({ length: 64 }, () => valid)).heightAt(10, 0, .3), .3);
  assert.equal(new TrafficCurveRoadSupport(grid, Array.from({ length: 65 }, () => valid)).heightAt(10, 0, .3), null);
  grid.set('0,0', Array.from({ length: 256 }, () => own));
  const sampler = new TrafficCurveRoadSupport(grid, [valid]); assert.equal(sampler.heightAt(10, 0, .3), .3);
  grid.get('0,0')!.push(own); assert.equal(sampler.heightAt(10, 0, .3), null);
  grid.set('0,0', Array.from({ length: 513 }, () => surface('foreign', .3))); assert.equal(sampler.heightAt(10, 0, .3), null);
});

test('optional support receives the immutable chord guide while horizontal sampling tables stay exact', () => {
  const a = { x: 1, y: 3, z: 4, hx: .6, hz: .8 }, b = { x: 32, y: 4, z: 35, hx: .8, hz: .6 };
  const original = new TrafficCurve(a, b, 15, 13), corrected = new TrafficCurve(a, b, 15, 13);
  let calls = 0;
  corrected.setRoadSupport({ heightAt(_x, _z, guideY) { calls++; return guideY + .4; } });
  assert.equal(corrected.length, original.length); assert.equal(corrected.minRadius, original.minRadius); assert.deepEqual(corrected.lengths, original.lengths);
  for (let n = 0; n <= 250; n++) {
    const before = original.sample(original.length * n / 250), after = corrected.sample(corrected.length * n / 250);
    for (const key of ['x', 'z', 'hx', 'hz'] as const) assert.ok(Object.is(after[key], before[key]), `${key} changed`);
    assert.ok(Object.is(after.y, before.y + .4), 'callback guide must remain the original chord; previous sampled corrections cannot accumulate');
  }
  assert.equal(calls, 251);
  corrected.setRoadSupport({ heightAt() { return null; } });
  for (let n = 0; n <= 25; n++) assert.deepEqual(corrected.sample(corrected.length * n / 25), original.sample(original.length * n / 25));
});
