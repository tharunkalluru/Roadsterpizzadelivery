import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadGraph } from '../../src/game/roadgraph';
import { RoadGraphSurfaceCache } from '../../src/game/road-graph-surface';
import { roadRibbon } from '../../src/world/bridge-clearance';
import { roadQuadHeight } from '../../src/world/road-surface';
import type { RoadEdge } from '../../src/world/types';
import { WholeRoadSurfaceCacheNegative } from '../fixtures/whole-road-surface-cache-negative';

const longRoad = (id: string, count = 6001): RoadEdge => ({
  id, cls: 'primary', name: null, w: 7, lanes: 2, oneway: null, from: id + 'a', to: id + 'b', maxspeed: 40,
  pts: Array.from({ length: count }, (_, i) => [100 + i * .5, 100 + 8 * Math.sin(i / 80)]),
  elev: Array.from({ length: count }, (_, i) => 2 + .02 * i),
  joinedPavement: { sourceWidth: 9.4, originalWidth: 9.4, intervals: [[40, 60], [130, 170]], taper: 30, release: 'test' },
});

test('local long-road blocks are numerically identical to complete renderer ribbons including taper and ORR auxiliary lanes', () => {
  for (const expressway of [false, true]) {
    const own = longRoad('long', 601);
    if (expressway) { own.cls = 'motorway'; own.expressway = { controlled: true } as any; own.oneway = 'forward'; }
    const ramp: RoadEdge = { ...longRoad('ramp', 3), cls: 'motorway_link', from: own.from, to: 'ramp-end' };
    const graph = new RoadGraph([own, ramp]), edge = graph.byId.get(own.id)!, cache = (graph as any).roadSurfaces;
    const complete = roadRibbon(own, [own, ramp]).quads;
    for (let i = 0; i < complete.length; i += 7) {
      const s = (edge.cum[i] + edge.cum[i + 1]) / 2, p = graph.pointAt(edge, s, 1, 1.6);
      const block = [...cache.entries.get(own).blocks.values()].find((b: any) => i >= b.start && i < b.start + b.quads.length) as any;
      assert.ok(block);
      const q = block.quads[i - block.start];
      for (let j = 0; j < 4; j++) for (let axis = 0; axis < 3; axis++) assert.ok(Object.is(q[j][axis], complete[i][j][axis]), `${expressway}/${i}/${j}/${axis}`);
      let expected = p.y, error = Infinity;
      const scalar = own.elev![i] + (own.elev![i + 1] - own.elev![i]) * .5;
      for (const offset of [0, -1, 1]) {
        const q = complete[i + offset]; if (!q) continue;
        const y = roadQuadHeight(q, p.x, p.z); if (y === null) continue;
        if (Math.abs(y - scalar) < error) { expected = y; error = Math.abs(y - scalar); }
      }
      assert.equal(p.y, expected);
    }
  }
});

test('eight longest-shape active roads keep their local blocks warm inside the original memory budget', () => {
  const roads = Array.from({ length: 8 }, (_, i) => longRoad('pressure-' + i)), graph = new RoadGraph(roads), cache = (graph as any).roadSurfaces;
  const blocks = roads.map(road => {
    const edge = graph.byId.get(road.id)!;
    graph.pointAt(edge, 35, 1, 1.6);
    const entry = cache.entries.get(road);
    assert.equal(entry.arc, edge.cum, 'reuse the graph arc array rather than duplicate every long source');
    assert.equal(entry.blocks.size, 1);
    return [...entry.blocks.values()][0];
  });
  for (let frame = 0; frame < 30; frame++) for (let i = 0; i < roads.length; i++) {
    graph.pointAt(graph.byId.get(roads[i].id)!, 35, 1, 1.6);
    assert.equal([...cache.entries.get(roads[i]).blocks.values()][0], blocks[i], 'no full-road rebuild cycle');
  }
  assert.ok(cache.pointCount < 2500);
  let points = 0; for (const entry of cache.entries.values()) points += entry.points;
  assert.equal(points, cache.pointCount);
});

test('retired whole-road policy reproduces continuous rebuilding on the same eight-road working set', () => {
  const roads = Array.from({ length: 8 }, (_, i) => longRoad('negative-' + i)), graph = new RoadGraph(roads), old = new WholeRoadSurfaceCacheNegative();
  for (let frame = 0; frame < 3; frame++) for (const road of roads) {
    const edge = graph.byId.get(road.id)!, p = graph.pointAt(edge, 35, 1, 1.6);
    let segment = 0; while (segment < edge.cum.length - 2 && edge.cum[segment + 1] < 35) segment++;
    assert.equal(old.height(road, segment, p.x, p.z, p.y), p.y);
  }
  assert.equal(old.builds, 24, 'all eight full meshes rebuild during every conceptual frame');
  assert.equal((graph as any).roadSurfaces.blocks.size, 8, 'local geometry remains warm for the same working set');
});

test('global block LRU evicts old sections without evicting every active long road or leaking accounting', () => {
  const roads = Array.from({ length: 8 }, (_, i) => longRoad('travel-' + i)), graph = new RoadGraph(roads), cache = (graph as any).roadSurfaces;
  for (const road of roads) graph.pointAt(graph.byId.get(road.id)!, .2, 1, 1.6);
  for (let step = 0; step < 94; step++) for (const road of roads) {
    const edge = graph.byId.get(road.id)!, segment = Math.min(5999, step * 64), distance = (edge.cum[segment] + edge.cum[segment + 1]) / 2;
    graph.pointAt(edge, distance, 1, 1.6);
    assert.ok(cache.pointCount <= RoadGraphSurfaceCache.MAX_POINTS);
    assert.equal(cache.entries.size, roads.length);
  }
  assert.ok(cache.blocks.size < 94 * roads.length, 'old blocks must leave residency');
  let points = 0; for (const entry of cache.entries.values()) points += entry.points;
  assert.equal(cache.pointCount, points);
  for (const road of roads) cache.remove(road);
  assert.equal(cache.pointCount, 0); assert.equal(cache.blocks.size, 0); assert.equal(cache.entries.size, 0);
});

test('warm block lookup avoids source rescans, new blocks and neighbor/city inventory access', () => {
  const own = longRoad('warm-block'), graph = new RoadGraph([own]), edge = graph.byId.get(own.id)!, cache = (graph as any).roadSurfaces;
  const p = graph.pointAt(edge, 35, 1, 1.6), segment = 68, scalar = own.elev![segment] + .01;
  const expected = cache.height(own, segment, p.x, p.z, scalar, edge.cum), count = cache.blocks.size, points = cache.pointCount;
  Object.defineProperty(own, 'pts', { get() { throw Error('warm raw-point scan'); } });
  Object.defineProperty(own, 'elev', { get() { throw Error('warm raw-elevation scan'); } });
  cache.nodes = new Proxy(cache.nodes, { get() { throw Error('warm neighbor scan'); } });
  cache.roads = new Proxy(cache.roads, { get() { throw Error('warm city scan'); } });
  for (let n = 0; n < 1000; n++) assert.equal(cache.height(own, segment, p.x, p.z, scalar, edge.cum), expected);
  assert.equal(cache.blocks.size, count); assert.equal(cache.pointCount, points);
});
