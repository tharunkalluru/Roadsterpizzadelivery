import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world/world';
import { initTemplates } from '../src/core/util';
import { TileGrid, TileValues, predictedFocus, bufferBytes } from '../src/world/streaming-utils';
import { buildTile } from '../src/world/city';
import { SignalLights } from '../src/world/signal-lights';

test('tile-owned grids publish and remove atomically without losing a shared neighbor cell', () => {
  const grid = new TileGrid<number>();
  grid.attach('a', new Map([['0,0', [1, 2]], ['1,0', [3]]]));
  grid.attach('b', new Map([['0,0', [4]]]));
  assert.deepEqual(grid.get('0,0'), [1, 2, 4]);
  const cached = grid.get('0,0'); assert.equal(grid.get('0,0'), cached);
  assert.equal(grid.size, 2); assert.deepEqual([...grid.values()], [[1, 2, 4], [3]]);
  grid.detach('a'); assert.deepEqual(grid.get('0,0'), [4]); assert.equal(grid.get('1,0'), undefined);
  grid.attach('a', new Map([['0,0', [5]]])); assert.deepEqual(grid.get('0,0'), [4, 5]);
});

test('lookahead responds to velocity and preparation latency with a bounded reach', () => {
  const p = { x: 10, z: 20, vx: 0, vz: 0, mode: 'road' as const };
  assert.deepEqual(predictedFocus(p, 4), { x: 10, z: 20 });
  assert.deepEqual(predictedFocus({ ...p, vx: 30 }, 4), { x: 130, z: 20 });
  assert.deepEqual(predictedFocus({ ...p, vx: 1000 }, 100), { x: 810, z: 20 });
  assert.deepEqual(predictedFocus({ ...p, vz: -20 }, 2), { x: 10, z: -20 });
});

test('building ID directory publication retains overlapping tile ownership', () => {
  const index = new TileValues<{ id: string; height: number }>();
  const first = { id: 'shared', height: 10 }, replacement = { id: 'shared', height: 12 };
  index.attach('a', new Map([['shared', first]])); index.attach('b', new Map([['shared', replacement]]));
  assert.equal(index.get('shared'), replacement); assert.equal(index.size, 1);
  index.detach('b'); assert.equal(index.get('shared'), first); assert.deepEqual([...index.values()], [first]);
  index.detach('a'); assert.equal(index.has('shared'), false); assert.equal(index.size, 0);
});

test('duplicate-heavy building cells yield after bounded visits rather than unique-set size', () => {
  const { world, tile, cleanup } = fixture();
  try {
    const unique = Array.from({ length: 3 }, (_, i) => ({ id: `building-${i}`, h: 10, ring: [] }));
    let visits = 0;
    // Three unique buildings are repeated in 1,000 spatial cells; Set.size never reaches 128.
    const cell = { *[Symbol.iterator]() { for (const building of unique) { visits++; yield building; } } };
    tile.buildingGrid = new Map(Array.from({ length: 1000 }, (_, i) => [`${i},0`, cell]));
    const work = (world as any).prepare(tile) as Generator<void, any>;
    let previousVisits = 0, stepsWithVisits = 0;
    for (;;) {
      const step = work.next(), delta = visits - previousVisits;
      assert.ok(delta <= 128, `one preparation job visited ${delta} building references`);
      if (delta) stepsWithVisits++;
      previousVisits = visits;
      if (step.done) { assert.equal(step.value.buildings.length, 3); break; }
    }
    assert.equal(visits, 3000); assert.ok(stepsWithVisits >= Math.ceil(3000 / 128));
  } finally { cleanup(); }
});

function fixture() {
  const saved = new Map<string, any>();
  for (const key of ['document', 'Worker', 'addEventListener', 'requestAnimationFrame', 'cancelAnimationFrame']) saved.set(key, (globalThis as any)[key]);
  const ctx = new Proxy({}, { get: () => () => ({ width: 10 }) });
  (globalThis as any).document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
  class FakeWorker { onmessage: any; onerror: any; onmessageerror: any; sent: any[] = []; postMessage(m: any) { this.sent.push(m); } terminate() {} }
  (globalThis as any).Worker = FakeWorker;
  (globalThis as any).addEventListener = () => {};
  (globalThis as any).requestAnimationFrame = () => 1;
  (globalThis as any).cancelAnimationFrame = () => {};
  initTemplates();
  const core: any = { roads: [], nodes: {}, packs: [{ file: 'test.wasm', tiles: [[0, 0], [1, 0]] }], origin: { lat: 17.4, lon: 78.4 }, bounds: { minX: 0, minZ: 0, maxX: 2000, maxZ: 1000 }, metro: { lines: [], stations: [], pillars: [], deckHeight: 12 } };
  const mat = new THREE.MeshBasicMaterial(), world = new World(core, { ground: mat, st: mat }, { lowQ: true, base: 'https://example.test/' });
  const tile: any = { key: '0_0', i: 0, j: 0, roads: [], buffers: [], buildingGrid: new Map(), surfaceGrid: new Map([['0,0', [{ kind: 'road' }]]]), walls: new Map(), obstacles: new Map(), signals: [], lamps: [[10, 9, 10]], signs: [], activity: [], rails: [], busStops: [], walkPaths: [] };
  return { world, tile, cleanup() { world.worker?.terminate(); for (const [key, value] of saved) (globalThis as any)[key] = value; mat.dispose(); } };
}

test('worker completion stages data and paused/startup pump atomically publishes support', () => {
  const { world, tile, cleanup } = fixture();
  try {
    world.request('0_0');
    const request = (world.worker as any).sent.find((m: any) => m.type === 'build');
    world.onMessage({ type: 'built', key: '0_0', requestId: request.requestId, worldEpoch: world.worldEpoch, built: tile });
    assert.equal(world.tiles.size, 0); assert.equal(world.surfaceGrid.get('0,0'), undefined);
    world.pumpJobs(100);
    assert.equal(world.tiles.size, 1); assert.deepEqual(world.surfaceGrid.get('0,0'), [{ kind: 'road' }]);
    assert.equal(world.nearbyLamps(10, 10).length, 1);
    assert.equal(world.streamStats.stagedBytes, 0);
    assert.ok(world.streamStats.activationMaxMs >= 0);
    world.pinTiles('jump', ['0_0']); world.unload(world.tiles.get('0_0')!); assert.equal(world.tiles.size, 1);
    world.releasePin('jump'); world.unload(world.tiles.get('0_0')!);
    assert.equal(world.tiles.size, 0); assert.equal(world.surfaceGrid.get('0,0'), undefined); assert.equal(world.nearbyLamps(10, 10).length, 0);
    world.pumpJobs(100); assert.equal(world.streamStats.retiringBytes, 0);
  } finally { cleanup(); }
});

test('optional memory admission defers background work without poisoning required coverage', () => {
  const { world, tile, cleanup } = fixture();
  try {
    world.add(tile);
    world.request('1_0');
    const request = (world.worker as any).sent.find((m: any) => m.type === 'build' && m.key === '1_0');
    world.streamStats.activeBytes = 384 * 1024 * 1024;
    world.onMessage({ type: 'built', key: '1_0', requestId: request.requestId, built: { ...tile, key: '1_0', i: 1 } });
    assert.equal(world.streamStats.admissionFailures, 1);
    assert.equal(world.staged.size, 0); assert.equal(world.tiles.has('0_0'), true); assert.equal(world.tiles.has('1_0'), false);
    assert.equal(world.failures.get('1_0'), undefined);
    const before = (world.worker as any).sent.length;
    world.request('1_0'); assert.equal((world.worker as any).sent.length, before, 'capacity pressure does not trigger a download/reject loop');
  } finally { cleanup(); }
});

test('explicit essential coverage is requested ahead of optional surroundings and resolves after pump', async () => {
  const { world, tile, cleanup } = fixture();
  try {
    const ready = world.ensure(500, 500, 200);
    world.update(500, 500, 0, true);
    const builds = (world.worker as any).sent.filter((m: any) => m.type === 'build');
    assert.deepEqual(builds.map((m: any) => m.key), ['0_0'], 'outer optional tile cannot consume ensure capacity');
    world.onMessage({ type: 'built', key: '0_0', requestId: builds[0].requestId, built: tile });
    world.pumpJobs(100); await ready;
    assert.equal(world.tiles.has('0_0'), true);
    assert.equal(world.failures.size, 0);
  } finally { cleanup(); }
});

test('coverage lease closes ensure microtask eviction gap and hands off focus before postrelease pressure', async () => {
  for (const leased of [false, true]) {
    const { world, tile, cleanup } = fixture();
    try {
      world.packOf.set('-1_0', 'https://example.test/test.wasm');
      world.focus = [490, 500]; world.setStreamFocus({ x: 490, z: 500, vx: 0, vz: 0, mode: 'road' });
      world.add(tile);
      // A background response was already in flight before explicit coverage.
      world.request('-1_0');
      const optional = (world.worker as any).sent.find((m: any) => m.type === 'build' && m.key === '-1_0');
      const lease = leased ? world.acquireCoverageLease(1500, 500, 200, { x: 490, z: 500 }) : null;
      let continuationRan = false;
      const ready = world.ensure(1500, 500, 200).then(() => { continuationRan = true; });
      const target = (world.worker as any).sent.find((m: any) => m.type === 'build' && m.key === '1_0');
      world.onMessage({ type: 'built', key: '1_0', requestId: target.requestId,
        built: { ...tile, key: '1_0', i: 1, surfaceGrid: new Map([['33,0', [{ kind: 'road', target: true }]]]) } });
      world.pumpJobs(100);
      assert.equal(continuationRan, false, 'required pins are removed before the Promise continuation');
      assert.equal(world.tiles.has('1_0'), true);
      assert.equal((world as any).ensureCoverage.size, 0, 'ensure has resolved before the caller continuation');
      assert.equal(world.pending.has('-1_0'), true, 'old optional response remains in flight');
      // Fault injection: retiring resources fill the ordinary budget while an
      // old-focus optional response arrives in the same turn after ensure resolves.
      world.streamStats.retiringBytes = 264 * 1024 * 1024;
      world.onMessage({ type: 'built', key: '-1_0', requestId: optional.requestId,
        built: { ...tile, key: '-1_0', i: -1 } });
      assert.equal(world.streamStats.admissionFailures, 1, 'late optional work encounters retained-byte pressure');
      assert.equal(world.tiles.has('0_0'), true, 'committed current support survives');
      assert.equal(world.tiles.has('1_0'), leased, 'unleased baseline reproduces target loss; lease preserves readiness');
      await ready;
      if (lease) {
        assert.equal(world.streamStats.coverageLeaseCount, 1);
        assert.equal(world.streamStats.relocationReserveBytes, 96 * 1024 * 1024, 'bounded reserve survives ensure settlement through view lease');
        // Placement/view handoff occurs before releasing the lease. No simulation
        // step is needed for the next pump to protect the new current area.
        world.focus = [1500, 500]; world.setStreamFocus({ x: 1500, z: 500, vx: 0, vz: 0, mode: 'road' });
        (world as any).releaseOptionalCapacity();
        assert.equal(world.tiles.has('0_0'), true, 'old support remains leased during view preparation');
        assert.equal(world.tiles.has('1_0'), true);
        let releases = 0; const releasePin = world.releasePin.bind(world);
        world.releasePin = key => { releases++; releasePin(key); };
        lease.release(); lease.release();
        assert.equal(releases, 1); assert.equal(world.streamStats.coverageLeaseCount, 0); assert.equal(world.streamStats.relocationReserveBytes, 0);
        (world as any).releaseOptionalCapacity();
        assert.equal(world.tiles.has('1_0'), true, 'new current target survives pressure before first simulation step');
        assert.equal(world.tiles.has('0_0'), false, 'old support can retire after handoff and release');
      }
    } finally { cleanup(); }
  }
});

test('coverage leases release exactly once on abort and share one bounded reserve', async () => {
  const { world, tile, cleanup } = fixture();
  try {
    world.focus = [500, 500]; world.add(tile);
    const controller = new AbortController(), lease = world.acquireCoverageLease(1500, 500, 200, { x: 500, z: 500 }, controller.signal);
    const other = world.acquireCoverageLease(1500, 500, 200, { x: 500, z: 500 });
    assert.equal(world.streamStats.coverageLeaseCount, 2); assert.equal(world.streamStats.relocationReserveBytes, 96 * 1024 * 1024);
    const ready = world.ensure(1500, 500, 200, controller.signal);
    let releases = 0; const releasePin = world.releasePin.bind(world);
    world.releasePin = key => { releases++; releasePin(key); };
    controller.abort(); await assert.rejects(ready, { name: 'AbortError' }); lease.release();
    assert.equal(releases, 1); assert.equal(world.streamStats.coverageLeaseCount, 1);
    assert.equal(world.tiles.has('0_0'), true);
    other.release(); other.release();
    assert.equal(releases, 2); assert.equal(world.streamStats.coverageLeaseCount, 0); assert.equal(world.streamStats.relocationReserveBytes, 0);
    const aborted = world.acquireCoverageLease(1500, 500, 200, undefined, controller.signal); aborted.release();
    assert.equal(releases, 2, 'already aborted caller must never acquire a pin');
  } finally { cleanup(); }
});

test('stale worker epochs and request identities do not publish geometry', () => {
  const { world, tile, cleanup } = fixture();
  try {
    world.request('0_0'); const request = (world.worker as any).sent.find((m: any) => m.type === 'build');
    world.onMessage({ type: 'built', key: '0_0', requestId: request.requestId, worldEpoch: 0, built: tile });
    assert.equal(world.staged.size, 0); assert.equal(world.tiles.size, 0);
    world.onMessage({ type: 'built', key: '0_0', requestId: request.requestId + 10, built: tile });
    assert.equal(world.staged.size, 0);
    assert.equal(bufferBytes([]), 0);
  } finally { cleanup(); }
});

test('tree detail uses hysteresis and preserves exact nearby geometry independently of physics', () => {
  const { world, tile, cleanup } = fixture();
  try {
    const matrix = new THREE.Matrix4().makeScale(3, 3, 3).setPosition(10, 5, 10);
    tile.instances = [{ mat: 'st', template: 'ico0', matrices: new Float32Array(matrix.elements), colors: new Float32Array([.2, .5, .1]), chunk: '0,0' }];
    world.add(tile);
    const meshes = world.tiles.get('0_0')!.group.children.filter((m: any) => m.isInstancedMesh) as THREE.InstancedMesh[];
    assert.deepEqual(meshes.map(m => m.count), [1, 0]);
    const nearGeometry = meshes[0].geometry, support = world.surfaceGrid.get('0,0');
    const camera = new THREE.PerspectiveCamera(60, 2, .1, 3000); camera.position.set(10, 20, 1200);
    world.updateVisualDetail(camera, { x: 10, z: 1200 }, 0);
    assert.deepEqual(meshes.map(m => m.count), [0, 1]);
    assert.ok(meshes[1].geometry.getAttribute('position').count < nearGeometry.getAttribute('position').count);
    assert.equal(world.surfaceGrid.get('0,0'), support);
    assert.deepEqual(Array.from(meshes[1].instanceColor!.array), Array.from(tile.instances[0].colors));
    world.updateVisualDetail(camera, { x: 10, z: 20 }, 300);
    assert.deepEqual(meshes.map(m => m.count), [1, 0]);
    assert.equal(meshes[0].geometry, nearGeometry);
    assert.deepEqual(Array.from(meshes[0].instanceMatrix.array), Array.from(tile.instances[0].matrices));
  } finally { cleanup(); }
});

test('Low restores protected minor road paint and cosmetic High roof detail without LOD collision changes', () => {
  const { world, cleanup } = fixture();
  try {
    const road: any = { id: 'minor', seg: 'minor', name: 'Test street', cls: 'residential', w: 10, lanes: 2, oneway: null, from: 'a', to: 'b', pts: [[0, 0], [100, 0]], elev: null, maxspeed: null };
    const zone: any = { i: 0, j: 0, roads: [road], nodes: { a: [0, 0], b: [100, 0] }, buildings: [{ id: 'test-building', name: 'Test building', cls: null, h: 12, hs: 'mapped', ring: [[30, 20], [50, 20], [50, 40], [30, 40]], fc: '#ffffff', rc: '#888888' }], boards: [], furniture: [], areas: [] };
    const built = buildTile(zone, { lowQ: true });
    assert.ok(built.buffers.some(b => b.mat === 'marks' && b.pos.length), 'minor-road markings are preserved in Low');
    assert.ok(built.buffers.some(b => b.detailMeters === .9), 'near parapet appearance no longer removed by Low');
    // Only load st buffers in this focused fixture; material selection is irrelevant to visibility checks.
    built.buffers = built.buffers.filter(b => b.detailMeters);
    world.add(built);
    const surface = world.surfaceGrid.get('1,0');
    const detail = world.tiles.get('0_0')!.group.children.filter((m: any) => m.userData.detailMeters) as THREE.Mesh[];
    assert.ok(detail.length);
    assert.ok(detail.every(mesh => mesh.visible), 'static High/review path retains complete cosmetics before any gameplay LOD pass');
    const camera = new THREE.PerspectiveCamera(60, 2, .1, 10000); camera.position.set(40, 20, 30);
    world.updateVisualDetail(camera, { x: 40, z: 30 }, 0); assert.ok(detail.every(mesh => mesh.visible));
    camera.position.set(40, 20, 8000); world.updateVisualDetail(camera, { x: 40, z: 8000 }, 300);
    assert.ok(detail.every(mesh => !mesh.visible));
    assert.equal(world.surfaceGrid.get('1,0'), surface, 'cosmetic visibility never changes support');
    world.updateVisualDetail(camera, { x: 40, z: 30 }, 600); assert.ok(detail.every(mesh => mesh.visible), 'near player protection overrides distant camera');
  } finally { cleanup(); }
});

test('failed sign registration rolls back its prefix without publishing invisible pinned support', () => {
  const { world, tile, cleanup } = fixture();
  try {
    const sign = (id: string) => ({ id, text: id, bg: '#fff', fg: '#000', c: [10, 3, 10], right: [1, 0, 0], up: [0, 1, 0], w: 2, h: 1 });
    tile.signs = [sign('first'), sign('fault')]; world.pinTiles('required-target', ['0_0']);
    const original = world.signs.add.bind(world.signs); let calls = 0;
    world.signs.add = (value: any) => { if (++calls === 2) throw new Error('injected registration fault'); return original(value); };
    assert.throws(() => world.add(tile), /injected registration fault/);
    assert.equal(world.tiles.has('0_0'), false); assert.equal(world.surfaceGrid.get('0,0'), undefined);
    assert.equal(world.signs.signs.length, 0); assert.equal(world.nearbyLamps(10, 10).length, 0);
    world.pumpJobs(100); assert.equal(world.streamStats.retiringBytes, 0);
  } finally { cleanup(); }
});

test('failed graph publication removes uncommitted target despite pins and preserves committed neighbor', () => {
  const { world, tile, cleanup } = fixture();
  try {
    world.add(tile); const originalSupport = world.surfaceGrid.get('0,0');
    const target = { ...tile, key: '1_0', i: 1, surfaceGrid: new Map([['20,0', [{ kind: 'road' }]]]) };
    world.pinTiles('target', ['1_0']); const graph = new Set<string>(); let removed = 0;
    world.onTileAdded = t => { graph.add(t.key); throw new Error('injected graph publication fault'); };
    world.onTileRemoved = t => { graph.delete(t.key); removed++; };
    assert.throws(() => world.add(target), /injected graph publication fault/);
    assert.equal(world.tiles.has('1_0'), false); assert.equal(world.surfaceGrid.get('20,0'), undefined); assert.equal(graph.size, 0); assert.equal(removed, 1);
    assert.equal(world.tiles.has('0_0'), true); assert.deepEqual(world.surfaceGrid.get('0,0'), originalSupport);
  } finally { cleanup(); }
});

test('cancelling prepared signal geometry releases its tile-owned material exactly once', () => {
  const { world, tile, cleanup } = fixture(); const dispose = SignalLights.prototype.dispose; let disposed = 0;
  SignalLights.prototype.dispose = function() { disposed++; dispose.call(this); };
  try {
    tile.signals = [{ approaches: [] }];
    let signalPrepared = false;
    world.prepareMesh = mesh => { if (mesh.name === 'directional traffic signal lenses') signalPrepared = true; };
    const work = (world as any).prepare(tile) as Generator<void>;
    for (let i = 0; i < 10 && !signalPrepared; i++) work.next();
    assert.equal(signalPrepared, true); work.return(); world.pumpJobs(100);
    assert.equal(disposed, 1); world.pumpJobs(100); assert.equal(disposed, 1);
  } finally { SignalLights.prototype.dispose = dispose; cleanup(); }
});

test('mesh upload hook runs once per source mesh in separate jobs before tile publication', () => {
  const { world, tile, cleanup } = fixture();
  try {
    const buffer = () => ({ mat: 'st', pos: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), nor: new Float32Array(9), uv: new Float32Array(6), col: new Float32Array(9) });
    tile.buffers = [buffer(), buffer()]; tile.signals = [{ approaches: [] }];
    tile.instances = [{ mat: 'st', template: 'ico0', matrices: new Float32Array(new THREE.Matrix4().elements), colors: new Float32Array([1, 1, 1]), chunk: '0,0' }];
    const seen = new Set<THREE.Mesh>();
    world.prepareMesh = mesh => { assert.equal(world.tiles.has(tile.key), false); assert.equal(world.surfaceGrid.get('0,0'), undefined); assert.equal(seen.has(mesh), false); seen.add(mesh); };
    world.request('0_0'); const request = (world.worker as any).sent.find((m: any) => m.type === 'build');
    world.onMessage({ type: 'built', key: '0_0', requestId: request.requestId, built: tile });
    assert.equal(seen.size, 0); world.pumpJobs(100);
    assert.equal(seen.size, 6); assert.equal(world.tiles.has('0_0'), true);
  } finally { cleanup(); }
});

test('retirement and preparation cancellation dispose owned instance attributes exactly once', () => {
  const { world, tile, cleanup } = fixture();
  const original = THREE.InstancedMesh.prototype.dispose, disposed = new Map<THREE.InstancedMesh, number>();
  THREE.InstancedMesh.prototype.dispose = function() { disposed.set(this, (disposed.get(this) || 0) + 1); original.call(this); };
  try {
    tile.instances = [{ mat: 'st', template: 'ico0', matrices: new Float32Array(new THREE.Matrix4().elements), colors: new Float32Array([1, 1, 1]), chunk: '0,0' }];
    const warmed: THREE.InstancedMesh[] = [];
    world.prepareMesh = mesh => { if ((mesh as THREE.InstancedMesh).isInstancedMesh) warmed.push(mesh as THREE.InstancedMesh); };
    world.add(tile); const loaded = world.tiles.get('0_0')!;
    assert.equal(warmed.length, 2); world.unload(loaded); world.pumpJobs(100);
    assert.ok(warmed.every(mesh => disposed.get(mesh) === 1));
    const prepared = (world as any).prepare({ ...tile, key: '1_0', i: 1 }) as Generator<void>;
    for (let i = 0; i < 12 && warmed.length < 3; i++) prepared.next();
    assert.equal(warmed.length, 3); prepared.return(); world.pumpJobs(100);
    assert.equal(disposed.size, 4); assert.ok([...disposed.values()].every(count => count === 1));
    world.pumpJobs(100); assert.ok([...disposed.values()].every(count => count === 1));
  } finally { THREE.InstancedMesh.prototype.dispose = original; cleanup(); }
});

test('skyline upload preparation runs before publication and safely defers a failed upload', () => {
  const { world, cleanup } = fixture();
  try {
    const buffer = { mat: 'st', pos: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), nor: new Float32Array(9), uv: new Float32Array(6), col: new Float32Array(9) };
    let calls = 0;
    world.prepareMesh = () => { calls++; assert.equal(world.group.children.some(g => g.name === 'visual-only skyline 1_0'), false); };
    (world as any).stageSkyline('1_0', [buffer]); world.pumpJobs(100); assert.equal(calls, 1);
    assert.equal(world.group.children.some(g => g.name === 'visual-only skyline 1_0'), true);
    const warn = console.warn; console.warn = () => {};
    try {
      world.prepareMesh = () => { throw new Error('injected warm-up fault'); };
      (world as any).stageSkyline('2_0', [buffer]); world.pumpJobs(100);
      assert.equal(world.group.children.some(g => g.name === 'visual-only skyline 2_0'), false);
      assert.equal(world.streamStats.skylineStagedBytes, 0); assert.equal(world.streamStats.skylineRetiringBytes, 0);
    } finally { console.warn = warn; }
  } finally { cleanup(); }
});

test('actual tile admission reconciles other pending build reservations', () => {
  const { world, tile, cleanup } = fixture();
  try {
    world.request('0_0'); world.request('1_0');
    assert.equal(world.streamStats.pendingReservedBytes, 32 * 1024 * 1024);
    world.streamStats.activeBytes = 236 * 1024 * 1024;
    class LargeGrid extends Map { override get size() { return 100000; } }
    const request = (world.worker as any).sent.find((m: any) => m.type === 'build' && m.key === '0_0');
    world.onMessage({ type: 'built', key: '0_0', requestId: request.requestId, built: { ...tile, buildingGrid: new LargeGrid() } });
    assert.equal(world.staged.size, 0, 'other pending reservation prevents over-admission even when current tile alone fits');
    assert.equal(world.streamStats.pendingReservedBytes, 16 * 1024 * 1024);
    assert.equal(world.failures.size, 0);
  } finally { cleanup(); }
});

test('skyline bytes are reserved while queued and remain counted until disposal finishes', () => {
  const { world, cleanup } = fixture();
  try {
    const buffer = { mat: 'st', pos: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), nor: new Float32Array(9), uv: new Float32Array(6), col: new Float32Array(9) };
    const bytes = bufferBytes([buffer]) * 2;
    (world as any).stageSkyline('1_0', [buffer]); (world as any).stageSkyline('1_0', [buffer]);
    assert.equal(world.streamStats.skylineStagedBytes, bytes, 'duplicate queued tile cannot double-reserve or allocate');
    assert.equal(world.streamStats.skylineBytes, 0); world.pumpJobs(100);
    assert.equal(world.streamStats.skylineStagedBytes, 0); assert.equal(world.streamStats.skylineBytes, bytes);
    (world as any).updateSkyline(10000, 10000);
    assert.equal(world.streamStats.skylineBytes, 0); assert.equal(world.streamStats.skylineRetiringBytes, bytes);
    world.pumpJobs(100); assert.equal(world.streamStats.skylineRetiringBytes, 0);
  } finally { cleanup(); }
});
