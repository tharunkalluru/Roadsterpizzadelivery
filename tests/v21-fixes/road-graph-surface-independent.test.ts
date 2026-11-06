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

const fixture = (id: string, x = 100, z = 100): RoadEdge => ({
  id, cls: 'primary', name: null, w: 12, lanes: 3, oneway: null,
  from: id + '-from', to: id + '-to',
  pts: [[x, z], [x + 27.7, z + .7], [x + 50.2, z + 15.3], [x + 82.1, z + 18.7]],
  elev: [4, 5.8, 7.6, 8.9], maxspeed: 40,
});

test('independent actual Float32 own-road support stays selected beneath foreign crossing sheets at city coordinates', () => {
  initTemplates();
  let samples = 0, maximumError = 0, maximumLegacyError = 0;
  for (const [i, j] of [[0, 0], [-26, -19], [27, 23]]) {
    const own = fixture(`own-${i}-${j}`, i * 1000 + 123.456, j * 1000 + 234.567);
    const foreign = { ...fixture(`foreign-${i}-${j}`), pts: own.pts.map(([x, z]) => [x, z] as [number, number]), elev: own.elev!.map(y => y + .12) };
    const upper = { ...foreign, id: foreign.id + '-upper', elev: own.elev!.map(y => y + 6.8) };
    const graph = new RoadGraph([foreign, upper, own]), isolated = new RoadGraph([own]);
    const edge = graph.byId.get(own.id)!, reference = isolated.byId.get(own.id)!;
    const built = buildTile({ i, j, roads: [own], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
    const geometry = new EmittedPlayerGeometry({ minX: i * 1000, maxX: (i + 1) * 1000, minZ: j * 1000, maxZ: (j + 1) * 1000 });
    geometry.collect(built);
    assert.equal(geometry.counts.missingLift, 0);
    for (const dir of [1, -1] as const) for (const lane of [-3.6, 0, 3.6]) for (let s = 1; s < edge.len - 1; s += .8) {
      const value = graph.pointAt(edge, s, dir, lane), old = legacyPointAt(edge, s, dir, lane);
      assert.deepEqual(value, isolated.pointAt(reference, s, dir, lane), 'foreign bridge/street must not supply the selected road Y');
      for (const key of ['x', 'z', 'hx', 'hz'] as const) assert.ok(Object.is(value[key], old[key]), `${key} differs from immutable pre-correction formula`);
      const support = geometry.frame(value.x, value.z).nearestSupport(value.x, value.z, value.y);
      assert.ok(support, 'must be inside independently emitted own finite asphalt');
      maximumError = Math.max(maximumError, Math.abs(value.y - support.y));
      maximumLegacyError = Math.max(maximumLegacyError, Math.abs(old.y - support.y));
      samples++;
    }
  }
  assert.ok(samples > 1500);
  assert.ok(maximumLegacyError > .01, 'unchanged scalar formula is a nonvacuous negative control');
  assert.ok(maximumError < .001, `actual Float32 error ${maximumError} exceeds 1mm`);
});

test('warmed Y lookup does not iterate arrays, rescan raw points, or inspect the city/neighbor inventory', () => {
  const e = fixture('warm'), cache = new RoadGraphSurfaceCache();
  cache.add(e);
  const expected = cache.height(e, 0, 110, 99, 4.65);
  const originalIterator = Array.prototype[Symbol.iterator];
  let arrayIterations = 0;
  const state = cache as any;
  const originalNodes = state.nodes, originalRoads = state.roads;
  Object.defineProperty(e, 'pts', { configurable: true, get() { throw Error('warm lookup rescanned raw road points'); } });
  Object.defineProperty(e, 'elev', { configurable: true, get() { throw Error('warm lookup rescanned raw road elevations'); } });
  state.nodes = new Proxy(originalNodes, { get() { throw Error('warm lookup inspected neighbor inventory'); } });
  state.roads = new Proxy(originalRoads, { get() { throw Error('warm lookup inspected city inventory'); } });
  Array.prototype[Symbol.iterator] = function () { arrayIterations++; return originalIterator.call(this); };
  let value: number;
  try { value = cache.height(e, 0, 110, 99, 4.65); }
  finally { Array.prototype[Symbol.iterator] = originalIterator; state.nodes = originalNodes; state.roads = originalRoads; }
  assert.equal(value!, expected);
  assert.equal(arrayIterations, 0, 'added hot-path triangle sampling must not allocate/iterate temporary tuple arrays');
});

test('LRU residency and exact accounting survive eviction, removed objects and same-ID replacement', () => {
  const cache = new RoadGraphSurfaceCache(), rows: RoadEdge[] = [];
  for (let n = 0; n < 120; n++) { const e = fixture('resident-' + n, 100, n * 20); rows.push(e); cache.add(e); cache.height(e, 0, 110, n * 20 - 1, 4.65); }
  const state = cache as any;
  const accounted = () => { let points = 0; for (const entry of state.entries.values()) points += entry.points; assert.equal(state.pointCount, points); assert.ok(points <= RoadGraphSurfaceCache.MAX_POINTS); assert.ok(state.entries.size <= RoadGraphSurfaceCache.MAX_EDGES); };
  accounted();
  assert.equal(state.entries.has(rows[0]), false, 'oldest entry was evicted');
  const warmed = rows.at(-1)!;
  cache.height(warmed, 0, 110, 119 * 20 - 1, 4.65);
  assert.equal(state.entries.has(warmed), true);
  for (const e of rows) cache.remove(e);
  accounted(); assert.equal(state.entries.size, 0);
  const own = { ...fixture('orr'), cls: 'motorway', expressway: { controlled: true } } as RoadEdge;
  const ramp = { ...fixture('ramp'), cls: 'motorway_link', from: own.from };
  cache.add(own); cache.add(ramp); cache.height(own, 0, 110, 99, 4.65);
  const old = state.entries.get(own).quads;
  const replacement = { ...ramp, to: own.to, from: 'changed-node' };
  cache.add(replacement);
  assert.equal(state.entries.has(own), false, 'replacement invalidated the original attached ORR ribbon');
  cache.height(own, 0, 110, 99, 4.65);
  assert.notEqual(state.entries.get(own).quads, old);
  assert.deepEqual(state.entries.get(own).quads, roadRibbon(own, [own, replacement]).quads);
  cache.remove(ramp);
  assert.equal(state.entries.has(own), true, 'stale removed object cannot invalidate a live replacement');
  cache.remove(replacement); assert.equal(state.entries.has(own), false);
  accounted();
});
