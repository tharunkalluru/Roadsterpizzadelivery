import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { FullMap } from '../../src/ui/map';
import { appendMapPaths, mapDataTransfers, packMapPaths, prepareMapData, MinorMapPaths, type MapPack } from '../../src/ui/map-data';
import { loadMapData } from '../../src/ui/map-loader';
import { readMapPack } from '../../src/ui/map-download';

class Path {
  commands: (string | number)[][] = [];
  moveTo(x: number, y: number) { this.commands.push(['M', x, y]); }
  lineTo(x: number, y: number) { this.commands.push(['L', x, y]); }
  closePath() { this.commands.push(['Z']); }
  rect(x: number, y: number, width: number, height: number) { this.commands.push(['R', x, y, width, height]); }
  ellipse(x: number, y: number, rx: number, ry: number) { this.commands.push(['E', x, y, rx, ry]); }
}
const finish = (job: Generator) => { let n = 0; while (!job.next().done) assert.ok(++n < 20000); };
const pack = (): MapPack => ({ areas: [{ k: 'park', r: [1.1, 2.2, 3.3, 4.4, -5.5, 6.6] }, { k: 'water', r: [-1, -2, -3, -4] }], metro: [], roads: {
  minor: [[-.00000000001, 12.3456789012345, -7.1, 8.2], [2000.1, -2000.2, 1999.9, -1.1], [-6.4, 4.3, -9.1, 8.6]],
  ter: [[.1, .2, .3, .4]], major: [[9, 8, 7, 6]], elev: [[1, 3, 5, 7]],
} });
const commands = (lines: number[][], close = false) => lines.flatMap(line => [
  ['M', line[0], line[1]], ...Array.from({ length: line.length / 2 - 1 }, (_, i) => ['L', line[i * 2 + 2], line[i * 2 + 3]]), ...(close ? [['Z']] : []),
]);

test('map worker representation retains exact Float64 coordinates, V21 cell ownership and drawing order', () => {
  const original = pack(), data = prepareMapData(original);
  assert.deepEqual(data.roads.map(r => r.kind), ['ter', 'major', 'elev']);
  for (const group of data.roads) { const path = new Path(); finish(appendMapPaths(path, group.paths)); assert.deepEqual(path.commands, commands(original.roads[group.kind])); }
  assert.deepEqual(data.minor.map(c => c.key), ['-1,0', '1,-2']);
  const first = new Path(); finish(appendMapPaths(first, data.minor[0].paths));
  assert.deepEqual(first.commands, commands([original.roads.minor[0], original.roads.minor[2]]));
  const park = new Path(); finish(appendMapPaths(park, data.park, true)); assert.deepEqual(park.commands, commands([original.areas[0].r], true));
  const transfers = mapDataTransfers(data), copy = structuredClone(data, { transfer: transfers });
  assert.ok(transfers.every(b => b.byteLength === 0), 'each buffer is transferable without a numeric-array clone');
  assert.equal(copy.minor[0].paths.points[0], -.00000000001);
  assert.equal(copy.minor[0].paths.points[1], 12.3456789012345);
});
test('native path preparation yields within 512 commands and publishes no partial cell', () => {
  const lines = [Array.from({ length: 7000 }, (_, i) => i / 3), [2, 3, 4, 5]], path = new Path(), job = appendMapPaths(path, packMapPaths(lines), true);
  let previous = 0, step;
  do { step = job.next(); assert.ok(path.commands.length - previous <= 512); previous = path.commands.length; } while (!step.done);
  assert.deepEqual(path.commands, commands(lines, true));
  const cache = new MinorMapPaths([{ key: '0,0', paths: packMapPaths(lines) }], () => new Path());
  cache.request(10, 10, 1, 100, 100); cache.step(); assert.equal(cache.ready.size, 0); assert.equal(cache.visibleReady, false);
  while (cache.step()) {} assert.equal(cache.visibleReady, true); assert.deepEqual(cache.ready.get('0,0')!.commands, commands(lines));
});
test('minor paths build only visible cells, cancel stale preparation and bound idle paths without dropping visible detail', () => {
  const data = Array.from({ length: 50 }, (_, i) => ({ key: `${i},0`, paths: packMapPaths([[i * 2000 + .1, .2, i * 2000 + 1.3, 4.5]]) }));
  const cache = new MinorMapPaths(data, () => new Path(), 3);
  cache.request(500, 500, 1, 100, 100); assert.equal(cache.pendingCount, 1); assert.equal(cache.ready.size, 0);
  cache.request(8500, 500, 1, 100, 100); assert.equal(cache.pendingCount, 1); while (cache.step()) {}
  assert.deepEqual([...cache.ready.keys()], ['4,0']);
  for (let i = 5; i < 20; i++) { cache.request(i * 2000 + 500, 500, 1, 100, 100); while (cache.step()) {} }
  assert.ok(cache.ready.size <= 4); // three idle plus the current cell
  cache.request(49000, 500, .07, 7000, 100); while (cache.step()) {}
  assert.equal(cache.ready.size, 50, 'all fifty visible cells retain their exact geometry');
  cache.request(500, 500, .06, 100, 100); assert.equal(cache.pendingCount, 0); assert.equal(cache.ready.size, 3);
});
test('the full shipped map retains every source point and per-cell source order without creating any Path2D', () => {
  const source: MapPack = JSON.parse(gunzipSync(readFileSync('public/city/map.pack.wasm')).toString());
  const data = prepareMapData(source);
  assert.equal(data.minor.reduce((n, c) => n + c.paths.offsets.length - 1, 0), source.roads.minor.length);
  const groups = new Map<string, number[][]>();
  for (const line of source.roads.minor) {
    const key = `${Math.floor(line[0] / 2000)},${Math.floor(line[1] / 2000)}`;
    (groups.get(key) || groups.set(key, []).get(key)!).push(line);
  }
  for (const cell of data.minor) {
    const lines = groups.get(cell.key)!; assert.equal(cell.paths.offsets.length, lines.length + 1);
    for (let i = 0; i < lines.length; i++) {
      assert.equal(cell.paths.offsets[i + 1] - cell.paths.offsets[i], lines[i].length);
      for (let j = 0; j < lines[i].length; j++) assert.equal(cell.paths.points[cell.paths.offsets[i] + j], lines[i][j]);
    }
  }
  assert.equal(data.polylines, source.areas.length + ['minor', 'ter', 'major', 'elev'].reduce((n, kind) => n + (source.roads[kind]?.length || 0), 0));
});

class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: any; onerror: any; onmessageerror: any; terminated = 0; request: any;
  constructor(..._args: any[]) { FakeWorker.all.push(this); }
  postMessage(value: any) { this.request = value; }
  terminate() { this.terminated++; }
  reply(value = prepareMapData(pack())) { this.onmessage?.({ data: { type: 'map', data: value } }); }
}
test('worker success transfers prepared data and releases the worker; genuine failure remains retryable', async () => {
  let worker: FakeWorker;
  const pending = loadMapData('/city/map.pack.wasm', undefined, () => worker = new FakeWorker());
  assert.equal(worker!.request.url, '/city/map.pack.wasm'); worker!.reply();
  const result = await pending; assert.equal(result.source, 'worker'); assert.equal(worker!.terminated, 1); assert.equal(worker!.onmessage, null);
  const first = loadMapData('/broken', undefined, () => worker = new FakeWorker());
  worker!.onmessage({ data: { type: 'error' } }); await assert.rejects(first, /could not load/); assert.equal(worker!.terminated, 1);
  const second = loadMapData('/retry', undefined, () => worker = new FakeWorker()); worker!.reply(); assert.equal((await second).source, 'worker');
});
test('closing an in-flight request aborts and terminates its worker without starting a fallback fetch', async () => {
  const controller = new AbortController(); let worker: FakeWorker;
  const pending = loadMapData('/city/map.pack.wasm', controller.signal, () => worker = new FakeWorker());
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' }); assert.equal(worker!.terminated, 1);
  await assert.rejects(loadMapData('/city/map.pack.wasm', controller.signal, () => { throw Error('must not create'); }), { name: 'AbortError' });
});
test('worker bootstrap failure retains a working compatibility fallback with unchanged gzip coordinates', async () => {
  const oldFetch = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response(readFileSync('public/city/map.pack.wasm')); };
    const result = await loadMapData('/city/map.pack.wasm', undefined, () => { throw Error('worker unavailable'); });
    assert.equal(result.source, 'main-thread-compatibility'); assert.equal(calls, 1); assert.ok(result.data.points > 1000000);
    globalThis.fetch = async () => new Response('missing', { status: 404 });
    await assert.rejects(readMapPack('/404'), /could not load/);
    globalThis.fetch = async () => new Response('bad data');
    await assert.rejects(readMapPack('/bad'), /could not load/);
  } finally { globalThis.fetch = oldFetch; }
});

function mapFixture() {
  const nodes = new Map<string, any>(), trace: string[] = [];
  const root: any = { hidden: true, dataset: {}, attributes: {}, setAttribute(name: string, value: string) { this.attributes[name] = value; }, querySelector: (id: string) => nodes.get(id) || nodes.set(id, { hidden: false, textContent: '' }).get(id) };
  const ctx: any = { measures: [] as string[], texts: [] as string[],
    measureText: (text: string) => { ctx.measures.push(text); return { width: text.length * 7 }; },
    fillText: (text: string) => ctx.texts.push(text),
  };
  for (const key of ['setTransform', 'fillRect', 'fill', 'stroke', 'setLineDash', 'beginPath', 'arc', 'moveTo', 'lineTo', 'closePath', 'save', 'restore', 'clip', 'translate', 'rotate', 'drawImage', 'strokeRect', 'strokeText']) ctx[key] = () => {};
  const m: any = Object.assign(Object.create(FullMap.prototype), {
    root, cv: { clientWidth: 800, clientHeight: 400, width: 800, height: 400, getContext: () => ctx },
    open: false, dirty: true, focus: { show: () => trace.push('focus'), hide: () => trace.push('hide') },
    cx: 0, cz: 0, scale: .5, t: 0, bld: new Path(), layers: null, loading: false, loadError: false, buildP: null,
    mapData: null, loadAbort: null, baseJob: null, previewJob: null, preview: null, previewKey: '', outlineJob: null, outlineBuildings: null,
    minorPaths: null, minorView: '', finishBuild: null, rejectBuild: null, labelWidths: new Map(), markerView: '', areaLabelView: '', areaLabels: [],
    places: [], placeCategory: '', selectedPlace: null, markers: [], pointers: new Map(), pinch0: 0, gesture: null, pick: null,
    openStarted: 0, firstBaseDrawForOpen: false,
    mapStats: { source: 'none', slices: 0, preparationMs: 0, maxStepMs: 0, sourcePolylines: 0, sourcePoints: 0, draws: 0, firstBaseDrawMs: null },
    zone: { origin: { lat: 17.4, lon: 78.48 }, bounds: { minX: -25000, maxX: 25000, minZ: -25000, maxZ: 25000 }, roads: [{ cls: 'primary', pts: [[0, 0], [10, 10]], elev: null }], places: [], metro: { lines: [] } },
    src: { mapUrl: '/city/map.pack.wasm', buildings: () => { assert.equal(root.hidden, false); assert.equal(m.open, true); trace.push('buildings'); return []; } },
    state: () => ({ player: { x: 0, z: 0, yaw: 0 }, canMove: true, route: null, target: null, pickups: [] }), onClose: () => trace.push('close'),
  });
  return { m, ctx, trace };
}
function globals() {
  const saved = { Worker: globalThis.Worker, Path2D: globalThis.Path2D, devicePixelRatio: globalThis.devicePixelRatio };
  Object.assign(globalThis, { Worker: FakeWorker, Path2D: Path, devicePixelRatio: 1 });
  return () => Object.assign(globalThis, saved);
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('actual FullMap paints local streets while downloading, cancels on close and safely retries an immediate reopen', async () => {
  const restore = globals();
  try {
    const { m, ctx, trace } = mapFixture(); m.show(); const first = m.buildP;
    assert.equal(m.root.hidden, false); assert.deepEqual(trace, ['focus', 'buildings']);
    assert.equal(m.root.dataset.mapPhase, 'loading'); assert.equal(m.root.attributes['aria-busy'], 'true');
    m.tick(.016); assert.ok(m.preview); assert.ok(ctx.texts.includes('Local streets · loading detailed map…')); assert.equal(m.layers, null);
    assert.equal(m.root.dataset.mapPhase, 'preview'); assert.equal(m.root.dataset.mapFirstBaseDrawMs, undefined);
    const firstWorker = FakeWorker.all.at(-1)!; m.hide(); assert.equal(firstWorker.terminated, 1); assert.equal(m.open, false);
    m.show(); const second = m.buildP; assert.notEqual(second, first); await flush(); assert.equal(m.buildP, second, 'the old abort cannot clear the new request');
    const secondWorker = FakeWorker.all.at(-1)!; secondWorker.reply(); await flush();
    for (let i = 0; i < 20 && m.loading; i++) m.tick(.016);
    await second; assert.equal(m.loading, false); assert.ok(m.layers); assert.equal(m.mapPreparation.source, 'worker');
    assert.equal(m.root.dataset.mapPhase, 'ready'); assert.equal(m.root.attributes['aria-busy'], 'false');
    assert.ok(Number(m.root.dataset.mapFirstBaseDrawMs) >= 0); assert.equal(m.root.dataset.mapSourcePolylines, String(prepareMapData(pack()).polylines));
    assert.equal(secondWorker.terminated, 1); assert.equal(m.mapPreparation.visibleMinorReady, true);
    const data = m.layers, workerCount = FakeWorker.all.length; m.hide(); m.show(); m.tick(.016);
    assert.equal(m.layers, data); assert.equal(FakeWorker.all.length, workerCount, 'warm reopening does not redownload or rebuild the city');
  } finally { restore(); }
});
test('actual FullMap reports failure without reopening itself and retries through a fresh worker', async () => {
  const restore = globals(), oldConsole = console.error;
  try {
    console.error = () => {};
    const { m } = mapFixture(); m.show(); const first = m.buildP; FakeWorker.all.at(-1)!.onmessage({ data: { type: 'error' } });
    await assert.rejects(first, /could not load/); await flush(); assert.equal(m.loadError, true); assert.equal(m.root.dataset.mapPhase, 'error');
    m.hide(); assert.equal(m.root.dataset.mapPhase, 'closed'); m.tick(.5); assert.equal(m.root.hidden, true);
    m.show(); const retry = m.buildP; FakeWorker.all.at(-1)!.reply(); await flush(); for (let i = 0; i < 20 && m.loading; i++) m.tick(.016);
    await retry; assert.equal(m.root.dataset.mapPhase, 'ready'); assert.equal(m.loadError, false);
  } finally { console.error = oldConsole; restore(); }
});
test('actual FullMap pauses parsed path work while closed and retains it for reopening without another worker', async () => {
  const restore = globals();
  try {
    const { m } = mapFixture(); m.show(); FakeWorker.all.at(-1)!.reply(); await flush(); const pending = m.buildP, count = FakeWorker.all.length;
    assert.ok(m.baseJob); m.hide(); const slices = m.mapStats.slices; m.tick(1); assert.equal(m.mapStats.slices, slices); assert.equal(m.layers, null);
    m.show(); for (let i = 0; i < 20 && m.loading; i++) m.tick(.016); await pending;
    assert.equal(FakeWorker.all.length, count); assert.ok(m.layers); assert.equal(m.loading, false);
  } finally { restore(); }
});
test('actual map labels retain visible placement while offscreen measurements and unchanged-view layout are avoided', () => {
  const restore = globals();
  try {
    const { m, ctx } = mapFixture(); m.layers = { park: new Path(), water: new Path(), roads: [], minor: new Map(), metro: [] };
    m.zone.places = [{ name: 'Visible locality', kind: 'locality', p: [0, 0] }, { name: 'Offscreen locality', kind: 'locality', p: [100000, 0] }];
    m.draw(); assert.deepEqual(ctx.measures, ['Visible locality']); assert.ok(ctx.texts.includes('Visible locality'));
    m.draw(); assert.deepEqual(ctx.measures, ['Visible locality'], 'quarter-second marker refresh reuses label widths and placements');
    m.cx = 100000; m.draw(); assert.deepEqual(ctx.measures, ['Visible locality', 'Offscreen locality']);
  } finally { restore(); }
});
test('actual streamed building outlines retain exact rings, reuse stable snapshots and rebuild changed snapshots', async () => {
  const restore = globals();
  try {
    const { m } = mapFixture(); let buildings = [{ ring: [[1.1, 2.2], [3.3, 4.4], [5.5, 6.6]] }];
    m.src.buildings = () => [...buildings]; m.show(); FakeWorker.all.at(-1)!.reply(); await flush();
    for (let i = 0; i < 20 && m.loading; i++) m.tick(.016); await m.buildP;
    const previous = m.bld; assert.deepEqual(previous.commands, [['M', 1.1, 2.2], ['L', 3.3, 4.4], ['L', 5.5, 6.6], ['Z']]);
    assert.equal(m.root.dataset.mapOutlinePending, 'false'); m.hide(); m.show(); m.tick(.016); assert.equal(m.bld, previous);
    m.hide(); buildings = [{ ring: [[10, 20], [30, 40], [50, 60]] }]; m.show(); m.tick(.016);
    assert.notEqual(m.bld, previous); assert.deepEqual(m.bld.commands, [['M', 10, 20], ['L', 30, 40], ['L', 50, 60], ['Z']]);
  } finally { restore(); }
});
