import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadGraph } from '../../src/game/roadgraph';
import { RoadGraphSurfaceCache } from '../../src/game/road-graph-surface';
import { initTemplates } from '../../src/core/util';
import { buildTile } from '../../src/world/city';
import { roadRibbon } from '../../src/world/bridge-clearance';
import { legacyPointAt } from '../fixtures/legacy-roadgraph-point-at';
import { EmittedPlayerGeometry } from '../fixtures/emitted-player-contact';
import type { RoadEdge } from '../../src/world/types';

function road(id: string, count = 641, x = 100, z = 100): RoadEdge {
  return { id, cls: 'primary', name: null, w: 7.2, lanes: 2, oneway: null, from: id + '-a', to: id + '-b', maxspeed: 40,
    pts: Array.from({ length: count }, (_, i) => [x + i * .7, z + 3 * Math.sin(i / 45)]),
    elev: Array.from({ length: count }, (_, i) => 2 + .008 * i + .02 * Math.sin(i / 37)),
    joinedPavement: { sourceWidth: 9.6, originalWidth: 9.6, intervals: [[30, 60], [150, 230]], taper: 25, release: 'independent' } };
}

test('actual emitted long-road Float32 support is continuous across block seams and both ORR end flares in both directions', t => {
  initTemplates(); let samples = 0, maximumError = 0;
  for (const expressway of [false, true]) {
    const i = expressway ? 27 : -26, j = expressway ? 23 : -19;
    const own = road('own', 641, i * 1000 + 120.123, j * 1000 + 180.456);
    if (expressway) { own.cls = 'motorway'; own.expressway = { controlled: true }; own.oneway = 'forward'; }
    const ramp = (id: string, atEnd: boolean): RoadEdge => {
      const at = own.pts[atEnd ? own.pts.length - 1 : 0], y = own.elev![atEnd ? own.elev!.length - 1 : 0];
      return { ...road(id, 2), cls: 'motorway_link', joinedPavement: undefined, from: atEnd ? 'ramp-other' : own.from, to: atEnd ? own.to : 'ramp-other',
        pts: atEnd ? [[at[0] - 25, at[1] + 25], at] : [at, [at[0] + 25, at[1] + 25]], elev: [y, y] };
    };
    const ramps = expressway ? [ramp('from-ramp', false), ramp('to-ramp', true)] : [];
    const graph = new RoadGraph([own, ...ramps]), edge = graph.byId.get(own.id)!, cache = (graph as any).roadSurfaces;
    const built = buildTile({ i, j, roads: [own, ...ramps], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
    const emitted = new EmittedPlayerGeometry({ minX: i * 1000, maxX: (i + 1) * 1000, minZ: j * 1000, maxZ: (j + 1) * 1000 }); emitted.collect(built);
    // Observe only emitted triangles whose actual metadata binds this road;
    // nearby ramp triangles cannot satisfy the independent own-road check.
    for (const [key, rows] of emitted.road) emitted.road.set(key, rows.filter(t => t.roadId === own.id));
    const complete = roadRibbon(own, [own, ...ramps]).quads;
    const segments = [0, 1, 62, 63, 64, 65, 126, 127, 128, 129, 254, 255, 256, 257, 510, 511, 512, 513, 638, 639];
    for (const segment of segments) for (const fraction of [.05, .5, .95]) for (const dir of [1, -1] as const) for (const lane of [-2.4, 0, 2.4]) {
      const source = edge.cum[segment] + (edge.cum[segment + 1] - edge.cum[segment]) * fraction, s = dir === 1 ? source : edge.len - source;
      const p = graph.pointAt(edge, s, dir, lane), old = legacyPointAt(edge, s, dir, lane);
      for (const key of ['x', 'z', 'hx', 'hz'] as const) assert.ok(Object.is(p[key], old[key]));
      const support = emitted.frame(p.x, p.z).nearestSupport(p.x, p.z, p.y); assert.ok(support, `missing actual own support: ${expressway}/${segment}/${dir}/${lane}`);
      maximumError = Math.max(maximumError, Math.abs(p.y - support.y)); samples++;
      const entry = cache.entries.get(own); assert.equal(entry.arc, edge.cum);
      const block = entry.blocks.get(Math.floor(segment / 64)); assert.ok(block);
      const quad = block.quads[segment - block.start];
      for (let v = 0; v < 4; v++) for (let axis = 0; axis < 3; axis++) assert.ok(Object.is(quad[v][axis], complete[segment][v][axis]));
    }
  }
  assert.equal(samples, 720); assert.ok(maximumError < .001, `Float32 support error ${maximumError}`);
  t.diagnostic(JSON.stringify({ samples, maximumFloat32Error: maximumError }));
});

test('warm long blocks allocate no tuple iterators and do not inspect raw geometry, arc values or neighborhood state', () => {
  const own = road('warm', 6001), graph = new RoadGraph([own]), edge = graph.byId.get(own.id)!, cache = (graph as any).roadSurfaces;
  const segment = 256, scalar = (own.elev![segment] + own.elev![segment + 1]) / 2, s = (edge.cum[segment] + edge.cum[segment + 1]) / 2, p = graph.pointAt(edge, s, 1, 1.6);
  const entry = cache.entries.get(own), block = entry.blocks.get(4), points = cache.pointCount;
  Object.defineProperty(own, 'pts', { get() { throw Error('warm raw points'); } }); Object.defineProperty(own, 'elev', { get() { throw Error('warm raw elevations'); } });
  entry.arc = new Proxy(edge.cum, { get() { throw Error('warm source arc scan'); } });
  cache.nodes = new Proxy(cache.nodes, { get() { throw Error('warm neighbor inventory'); } }); cache.roads = new Proxy(cache.roads, { get() { throw Error('warm city inventory'); } });
  let arrayIterations = 0, actual: number;
  const previous = Array.prototype[Symbol.iterator]; Array.prototype[Symbol.iterator] = function () { arrayIterations++; return previous.call(this); };
  try { for (let n = 0; n < 1000; n++) actual = cache.height(own, segment, p.x, p.z, scalar, edge.cum); }
  finally { Array.prototype[Symbol.iterator] = previous; }
  assert.equal(actual!, p.y); assert.equal(arrayIterations, 0); assert.equal(entry.blocks.get(4), block); assert.equal(cache.pointCount, points);
});

test('attached-ramp lifecycle invalidates every long-road block and preserves exact re-created end geometry', () => {
  const own = { ...road('orr'), cls: 'motorway', expressway: { controlled: true } } as RoadEdge;
  const graph = new RoadGraph([own]), edge = graph.byId.get(own.id)!, cache = (graph as any).roadSurfaces;
  const warm = () => { for (const segment of [0, 130, 638]) graph.pointAt(edge, (edge.cum[segment] + edge.cum[segment + 1]) / 2, 1, 1.6); return cache.entries.get(own); };
  assert.equal(warm().blocks.size, 3);
  const end = own.pts.at(-1)!;
  const ramp: RoadEdge = { ...road('ramp', 2), cls: 'motorway_link', from: own.to, to: 'exit', pts: [end, [end[0] + 3, end[1] + 2]] };
  graph.addRoads([ramp]); assert.equal(cache.entries.has(own), false); assert.equal(cache.blocks.size, 0); assert.equal(cache.pointCount, 0);
  const withRamp = warm(); assert.equal(withRamp.blocks.size, 3);
  const full = roadRibbon(own, [own, ramp]).quads;
  for (const block of withRamp.blocks.values()) assert.deepEqual(block.quads, full.slice(block.start, block.start + block.quads.length));
  graph.removeRoads([ramp.id]); assert.equal(cache.entries.has(own), false); assert.equal(cache.blocks.size, 0); assert.equal(cache.pointCount, 0);
  const restored = warm(), original = roadRibbon(own, [own]).quads;
  for (const block of restored.blocks.values()) assert.deepEqual(block.quads, original.slice(block.start, block.start + block.quads.length));
});

test('mixed full ribbons, global block eviction and standalone owned arcs retain exact bounded accounting', () => {
  const cache = new RoadGraphSurfaceCache(), roads = Array.from({ length: 9 }, (_, n) => road('travel-' + n, 6001));
  const graph = new RoadGraph(roads), live = (graph as any).roadSurfaces;
  const check = (state: any) => {
    let sum = 0, blocks = 0;
    for (const entry of state.entries.values()) { let owned = entry.arc && !roads.some(r => graph.byId.get(r.id)?.cum === entry.arc) ? entry.arc.length : 0; if (entry.quads) owned += entry.quads.length * 4; if (entry.blocks) for (const block of entry.blocks.values()) { owned += block.points; blocks++; assert.equal(state.blocks.get(block), entry); } assert.equal(entry.points, owned); sum += owned; }
    assert.equal(state.pointCount, sum); assert.equal(state.blocks.size, blocks); assert.ok(sum <= RoadGraphSurfaceCache.MAX_POINTS); assert.ok(state.entries.size <= RoadGraphSurfaceCache.MAX_EDGES);
  };
  for (let k = 0; k < 75; k++) for (const own of roads) { const e = graph.byId.get(own.id)!, i = k * 64; graph.pointAt(e, (e.cum[i] + e.cum[i + 1]) / 2, 1, 1.6); check(live); }
  assert.equal(live.entries.size, 9); assert.ok(live.blocks.size < 9 * 75);
  for (let n = 0; n < 110; n++) { const own = road('small-' + n, 4); live.add(own); live.height(own, 0, own.pts[0][0] + .2, own.pts[0][1], own.elev![0]); check(live); }
  assert.equal(live.entries.size, 96);
  const standalone = road('standalone', 601); cache.height(standalone, 150, standalone.pts[150][0] + .2, standalone.pts[150][1], standalone.elev![150]);
  const state = cache as any, entry = state.entries.get(standalone); assert.equal(entry.arc.length, 601); check(state);
  cache.remove(standalone); assert.equal(state.entries.size, 0); assert.equal(state.blocks.size, 0); assert.equal(state.pointCount, 0);
});
