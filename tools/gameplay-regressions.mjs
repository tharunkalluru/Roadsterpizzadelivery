// Deterministic regressions for gameplay and streaming. Run after `cd game && npm ci`:
// node tools/gameplay-regressions.mjs (from repository root).
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = await mkdtemp(join(tmpdir(), 'roadster-gameplay-'));
const originalDocument = globalThis.document;
let checks = 0;
const test = async (label, fn) => { await fn(); checks++; console.log(`PASS ${label}`); };
try {
  globalThis.document = { hidden: false, documentElement: { classList: { contains: () => false } } };
  await build({
    stdin: { contents: "export { Game } from './game/src/game/game'; export { RoadGraph } from './game/src/game/roadgraph'; export { World } from './game/src/world/world';", resolveDir: root, loader: 'ts' },
    outfile: join(out, 'game.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error',
  });
  const { Game, RoadGraph, World } = await import(pathToFileURL(join(out, 'game.mjs')));
  const road = (id, from, to, pts, extra = {}) => ({ id, seg: id, from, to, pts, cls: 'residential', w: 8, lanes: 2, oneway: null, elev: null, name: id, maxspeed: null, ...extra });
  const curve = road('curve', 'a', 'b', [[0, 0], [0, 100], [100, 100]]);
  await test('GPS follows bends to a same-edge destination without overshooting', () => {
    const g = new RoadGraph([curve]);
    const r = g.route(0, 20, 80, 100, { hx: 0, hz: 1, y: 0.57 });
    assert.ok(r); assert.equal(r.len, 160);
    assert.ok(r.pts.some(([x, , z]) => x === 0 && z === 100));
    assert.ok(!r.pts.some(([x]) => x > 80));
  });
  await test('GPS includes the final partial road from a connected street', () => {
    const g = new RoadGraph([road('approach', 'c', 'a', [[-100, 0], [0, 0]]), curve]);
    const r = g.route(-50, 0, 80, 100, { hx: 1, hz: 0, y: 0 });
    assert.ok(r); assert.equal(r.len, 230);
    assert.ok(r.pts.some(([x, , z]) => x === 0 && z === 100));
  });
  await test('GPS permits only the allowed heading on a one-way destination', () => {
    const g = new RoadGraph([{ ...curve, oneway: 'backward' }]); // backward is the denied direction
    assert.equal(g.route(80, 100, 0, 20, { hx: 1, hz: 0, y: 0 }), null);
    assert.equal(g.route(0, 20, 80, 100, { hx: 0, hz: 1, y: 0 })?.len, 160);
  });
  await test('GPS does not U-turn through a divided same-edge road', () => {
    const g = new RoadGraph([road('divided', 'a', 'b', [[0, 0], [200, 0]], { cls: 'primary', w: 14 })]);
    const r = g.route(120, 0, 80, 0, { hx: 1, hz: 0, y: 0 });
    assert.ok(r); assert.equal(r.len, 210.5); // 200 along road + 7 at junction + 3.5 final approach; no car-to-lane spur
    assert.ok(r.pts.some(([x]) => x === 200));
  });
  await test('GPS distance works for an order with no car heading', () => {
    const g = new RoadGraph([curve]);
    assert.equal(g.route(0, 20, 80, 100)?.len, 160);
    assert.equal(g.route(80, 100, 0, 20)?.len, 160);
  });
  await test('pickup selection uses the chosen restaurant pool consistently', () => {
    const values = [0.1, 0.9, 0.9, 0.1];
    const food = Array.from({ length: 10 }, (_, i) => ({ pizza: i === 9, board: `shop ${i}`, name: `shop ${i}`, s: { x: 100, z: 0, y: 0, sub: '', label: `shop ${i}` } }));
    const g = Object.assign(Object.create(Game.prototype), { level: 0, totalDelivered: 0, offerSequence: 0, acceptingOrders: true, player: { pos: { x: 0, z: 0 } }, food, residences: [{ x: 350, z: 0, y: 0, label: '' }], r: () => values.shift() ?? 0.1, graph: { route: () => ({ len: 250 }) }, areaName: () => 'Hyderabad' });
    assert.equal(g.makeOffer().pickupName, 'shop 9');
  });
  await test('cancelling area selection restores the exact pending offer and its controls', () => {
    const savedDocument = globalThis.document;
    globalThis.document = { hidden: false, documentElement: { classList: { contains: () => false } } };
    const original = { state: 'offer', pickup: { x: 400, z: 300, label: 'Original kitchen', sub: 'Original road' }, drop: { label: 'Original customer' }, dist: 700, limit: 145 };
    let displayed = 'initial', buttons = [], generated = 0;
    const g = Object.assign(Object.create(Game.prototype), {
      order: original, totalDelivered: 0, acceptingOrders: true, keys: new Set(), sound: { vehicle() {} }, area: { name: 'RTC X Roads' }, level: 0, choosing: false, relocating: false,
      player: { pos: { x: 10, y: .57, z: 20 }, forward: { x: 1, z: 0 }, flying: false }, graph: { route(x, z, px, pz, car) { assert.deepEqual([x, z, px, pz], [10, 20, 400, 300]); assert.deepEqual(car, { hx: 1, hz: 0, y: .57 }); return { len: 900 }; } },
      hud: { tip() {}, resetControls() {}, modal() {}, offer(html, actions = []) { displayed = html; buttons = actions; } },
      picker: { show() {} }, clock: { getDelta() {} }, engine: { renderer: { domElement: { focus() {} } } }, makeOffer() { generated++; throw Error('must reuse pending offer'); },
    });
    try {
      g.chooseArea(false); assert.equal(displayed, null); assert.equal(g.choosing, true);
      g.picker.onClose();
      assert.equal(g.order, original); assert.equal(generated, 0);
      assert.match(displayed, /Original kitchen/); assert.match(displayed, /Original customer/);
      assert.match(displayed, /900 m to pickup/);
      assert.match(displayed, /700 m after pickup/);
      assert.match(displayed, /Delivery window: 145 s/); assert.match(displayed, /Delivery timer starts after collection/); assert.match(displayed, /84 coins/);
      assert.deepEqual(buttons.map((b) => b.label), ['Accept order (E)', 'Decline']);
      assert.equal(g.paused, false); assert.equal(g.choosing, false);
    } finally { globalThis.document = savedDocument; }
  });
  await test('delayed offers never replace active deliveries or interrupt area selection', () => {
    let generated = 0, displayed = 0;
    const g = Object.assign(Object.create(Game.prototype), {
      order: null, totalDelivered: 0, acceptingOrders: true, choosing: true, relocating: false,
      makeOffer() { generated++; return null; }, hud: { offer() { displayed++; } },
    });
    g.showOffer();
    g.choosing = false; g.relocating = true; g.showOffer();
    g.relocating = false; const active = { state: 'toDrop' }; g.order = active; g.showOffer();
    assert.equal(generated, 0); assert.equal(displayed, 0); assert.equal(g.order, active);
  });
  await test('handover and theatre interaction require the same height and grounded car', () => {
    const g = Object.assign(Object.create(Game.prototype), { player: { pos: { x: 0, y: 0.57, z: 0 }, speed: 0, flying: false, descending: false, glide: null } });
    const stop = { x: 0, z: 0, y: 0 };
    assert.equal(g.canInteractAt(stop, 8), true);
    assert.equal(g.canInteractAt({ ...stop, y: 10 }, 8), false);
    g.player.pos.y = 10; assert.equal(g.canInteractAt(stop, 8), false);
    g.player.pos.y = 0.57; g.player.descending = true; assert.equal(g.canInteractAt(stop, 8), false);
    g.player.descending = false; g.player.flying = true; assert.equal(g.canInteractAt(stop, 8), false);
    g.player.flying = false; g.player.glide = {}; assert.equal(g.canInteractAt(stop, 8), false);
  });
  await test('focus loss clears all held controls and pending interactions', () => {
    let muted = false, controlsReset = false;
    const g = Object.assign(Object.create(Game.prototype), { keys: new Set(['KeyW', 'KeyE']), flyQueued: true, actHeld: true, actTap: 1, actProgress: 0.5, dragging: true,
      sound: { vehicle(state) { muted = !state.active && state.speed === 0 && state.throttle === 0; } },
      hud: { resetControls() { controlsReset = true; } } });
    g.resetInput();
    assert.equal(g.keys.size, 0); assert.equal(g.flyQueued, false); assert.equal(g.actHeld, false);
    assert.equal(g.actTap, 0); assert.equal(g.actProgress, 0); assert.equal(g.dragging, false);
    assert.equal(controlsReset, true); assert.equal(muted, true);
  });
  const fakeWorld = () => Object.assign(Object.create(World.prototype), {
    tiles: new Map(), pending: new Map(), requestIds: new Map(), nextRequestId: 0, workerTimer: null,
    empty: new Set(), failures: new Map(), waiters: [], focus: [0, 0], buildMs: [], addMs: [],
    worker: { postMessage() {} }, wanted: () => ['0_0'], packOf: new Map([['0_0', 'test.pack.wasm']]), update() {},
  });
  await test('a transient tile error is retryable and never counts as an empty street', async () => {
    const w = fakeWorld(), messages = []; w.worker.postMessage = (m) => messages.push(m);
    const oldError = console.error; console.error = () => {};
    w.request('0_0');
    try { w.onMessage({ type: 'error', key: '0_0', requestId: messages.at(-1).requestId, error: '503' }); } finally { console.error = oldError; }
    assert.equal(w.empty.has('0_0'), false); assert.equal(w.failures.get('0_0').attempts, 1);
    w.failures.get('0_0').retryAt = 0; w.request('0_0'); assert.equal(messages.length, 2);
    const ready = w.ensure(0, 0);
    w.add = (built) => w.tiles.set(built.key, built);
    w.onMessage({ type: 'built', key: '0_0', requestId: messages.at(-1).requestId, built: { key: '0_0' }, ms: 1 });
    await ready; assert.equal(w.failures.has('0_0'), false); assert.equal(w.waiters.length, 0);
  });
  await test('three failed tile attempts reject area loading instead of silently succeeding', async () => {
    const w = fakeWorld(), ready = w.ensure(0, 0);
    const rejected = assert.rejects(ready, /Could not load the streets/);
    const oldError = console.error; console.error = () => {};
    try { for (let i = 0; i < 3; i++) {
      if (w.failures.has('0_0')) w.failures.get('0_0').retryAt = 0;
      w.request('0_0'); w.onMessage({ type: 'error', key: '0_0', requestId: w.requestIds.get('0_0'), error: 'offline' });
    } }
    finally { console.error = oldError; }
    await rejected; assert.equal(w.waiters.length, 0); assert.equal(w.empty.size, 0);
  });
  await test('failed relocation retains a destination-specific retry without placing or saving the player', async () => {
    const savedDocument = globalThis.document, oldError = console.error;
    globalThis.document = { getElementById: () => null }; console.error = () => {};
    let placed = false, picked = false, retry = null;
    const g = Object.assign(Object.create(Game.prototype), {
      zone: { bounds: { minX:-10000,minZ:-10000,maxX:10000,maxZ:10000 } }, relocating: false, keys: new Set(), area: { name: 'Original' }, player: { pos: { x: 20, z: 30 } },
      picker: { hide() {} }, hud: { tip() {}, offer() {}, modal(html) { retry=html; }, toast() {}, resetControls() {} }, sound: { vehicle() {}, cue() {} }, setTarget() {},
      city: { ensure: async () => { throw new Error('offline'); }, focus: [0, 0] },
      placeNear() { placed = true; }, chooseArea(first) { assert.equal(first, false); picked = true; },
    });
    try { await g.relocate({ name: 'Unavailable', x: 5000, z: 5000 }); }
    finally { globalThis.document = savedDocument; console.error = oldError; }
    assert.equal(placed, false); assert.equal(picked, false); assert.match(retry,/Could not move to Unavailable/); assert.match(retry,/Retry this destination/); assert.equal(g.relocating, false);
    assert.equal(g.area.name, 'Original'); assert.deepEqual(g.city.focus, [20, 30]);
  });
  await test('tile unload drops its rails while retaining shared rails in a loaded neighbor', () => {
    const w = fakeWorld();
    Object.assign(w, { rails: new Map(), group: { remove() {} }, signs: { remove() {} }, lamps: [], signals: [], busStops: [], walkPaths: [],
      buildingGrid: new Map(), surfaceGrid: new Map(), walls: new Map(), obstacles: new Map(), byBuilding: new Map(), activity: new Map(), theatreFacades: new Map(), onTileRemoved() {} });
    const tile = (key, rail) => ({ key, group: { traverse() {} }, signs: [], lamps: [], buildings: [], built: {
      rails: [rail], buildingGrid: new Map(), surfaceGrid: new Map(), walls: new Map(), obstacles: new Map(), signals: [], busStops: [], walkPaths: [], facades: [],
    } });
    const r1 = { id: 'shared', pts: [[0, 0], [100, 0]] }, r2 = { ...r1 };
    const a = tile('0_0', r1), b = tile('0_1', r2);
    w.tiles.set(a.key, a); w.tiles.set(b.key, b); w.rails.set('shared', r2);
    w.unload(b); assert.equal(w.rails.get('shared'), r1);
    w.unload(a); assert.equal(w.rails.size, 0);
  });
  await build({ entryPoints: [resolve(root, 'game/src/world/tileworker.ts')], outfile: join(out, 'worker.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  await test('tile worker evicts a rejected pack promise so a later fetch can succeed', async () => {
    const savedFetch = globalThis.fetch, savedSelf = globalThis.self;
    let calls = 0; const messages = [];
    globalThis.self = { postMessage: (m) => messages.push(m) };
    globalThis.fetch = async () => { calls++; return calls === 1 ? new Response('', { status: 503 }) : new Response(JSON.stringify({ tiles: {} })); };
    try {
      await import(pathToFileURL(join(out, 'worker.mjs')));
      await self.onmessage({ data: { type: 'build', url: 'test.pack.wasm', key: '0_0' } });
      await self.onmessage({ data: { type: 'build', url: 'test.pack.wasm', key: '0_0' } });
      assert.equal(calls, 2); assert.deepEqual(messages.map((m) => m.type), ['error', 'empty']);
    } finally { globalThis.fetch = savedFetch; globalThis.self = savedSelf; }
  });
  console.log(`${checks} gameplay/streaming regression groups passed.`);
} finally { globalThis.document = originalDocument; await rm(out, { recursive: true, force: true }); }
