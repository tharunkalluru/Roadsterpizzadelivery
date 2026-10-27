// Production loading contracts with deterministic clocks and worker/fetch failures.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from '../game/node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = await mkdtemp(join(tmpdir(), 'roadster-loading-'));
let checks = 0;
const test = async (label, fn) => { await fn(); checks++; console.log(`PASS ${label}`); };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
async function clock(fn) {
  const saved = { performance: Object.getOwnPropertyDescriptor(globalThis, 'performance'), setTimeout, clearTimeout, setInterval, clearInterval };
  let now = 0, id = 0; const timers = new Map();
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  const schedule = (run, ms, interval) => { const key = ++id; timers.set(key, { run, at: now + ms, interval }); return key; };
  globalThis.setTimeout = (run, ms) => schedule(run, ms, 0);
  globalThis.setInterval = (run, ms) => schedule(run, ms, ms);
  globalThis.clearTimeout = globalThis.clearInterval = (key) => timers.delete(key);
  const advance = async (ms) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      if (next[1].interval) next[1].at += next[1].interval; else timers.delete(next[0]);
      next[1].run(); await flush();
    }
    now = end; await flush();
  };
  try { await fn({ advance, timers, now: () => now }); }
  finally {
    Object.defineProperty(globalThis, 'performance', saved.performance);
    Object.assign(globalThis, { setTimeout: saved.setTimeout, clearTimeout: saved.clearTimeout, setInterval: saved.setInterval, clearInterval: saved.clearInterval });
  }
}

const savedGlobals = { fetch: globalThis.fetch, self: globalThis.self, location: globalThis.location, document: globalThis.document };
try {
  await build({
    stdin: { contents: "export { World } from './game/src/world/world'; export { fetchPack } from './game/src/world/packs'; export { loadCore } from './game/src/main';", resolveDir: root, loader: 'ts' },
    outfile: join(out, 'loading.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error',
    plugins: [{ name: 'explicit-boot-only', setup(b) { b.onLoad({ filter: /\/src\/main\.ts$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8');
      assert.ok(/\nboot\(\)\.catch\(/.test(source));
      return { contents: source.replace(/\nboot\(\)\.catch\([\s\S]*$/, '\n'), loader: 'ts' };
    }); } }],
  });
  globalThis.location = { search: '' };
  const { World, fetchPack, loadCore } = await import(pathToFileURL(join(out, 'loading.mjs')));
  const fakeWorld = () => Object.assign(Object.create(World.prototype), {
    tiles: new Map(), pending: new Map(), requestIds: new Map(), nextRequestId: 0,
    empty: new Set(), failures: new Map(), waiters: [], focus: [10, 20], buildMs: [], addMs: [], radius: 900, t: 0,
    worker: { postMessage() {}, terminate() {} }, workerUnavailable: false, workerFailed: false, workerRestarts: 0, workerTimer: null,
    wanted: () => ['0_0'], packOf: new Map([['0_0', 'https://city.test/one.pack.wasm']]),
    add(built) { this.tiles.set(built.key, { key: built.key }); },
  });
  const reply = (w, type, extra = {}) => w.onMessage({ type, key: '0_0', requestId: w.requestIds.get('0_0'), ...extra });
  const quiet = async (fn) => { const saved = console.error; console.error = () => {}; try { await fn(); } finally { console.error = saved; } };

  await test('plain and gzip city downloads decode once and release their timeout', () => clock(async ({ timers }) => {
    for (const body of [JSON.stringify({ ok: true }), gzipSync(JSON.stringify({ ok: true }))]) {
      globalThis.fetch = async (_url, opts) => { assert.ok(opts.signal instanceof AbortSignal); return new Response(body); };
      assert.deepEqual(await fetchPack('https://city.test/pack?secret=hidden'), { ok: true });
      assert.equal(timers.size, 0);
    }
  }));
  await test('HTTP, malformed JSON and malformed gzip fail safely without URLs or leaked timers', () => clock(async ({ timers }) => {
    const cases = [() => new Response('secret', { status: 503 }), () => new Response('{bad secret'), () => new Response(new Uint8Array([0x1f, 0x8b, 0xff]))];
    for (const response of cases) {
      globalThis.fetch = async () => response();
      await assert.rejects(fetchPack('https://city.test/?token=secret'), (e) => /city data/i.test(e.message) && !/secret|https:/.test(e.message));
      assert.equal(timers.size, 0);
    }
  }));
  await test('a stalled network or response body ends after fifteen seconds and aborts the fetch', () => clock(async ({ advance, timers }) => {
    for (const bodyStalls of [false, true]) {
      let signal;
      globalThis.fetch = (_url, opts) => { signal = opts.signal; return bodyStalls ? Promise.resolve({ ok: true, arrayBuffer: () => new Promise(() => {}) }) : new Promise(() => {}); };
      const pending = fetchPack('https://city.test/?token=secret');
      const rejection = assert.rejects(pending, /download timed out/);
      await advance(15000); await rejection;
      assert.equal(signal.aborted, true); assert.equal(timers.size, 0);
    }
  }));
  await test('startup offers an explicit retry before constructing a second game runtime', () => clock(async ({ timers }) => {
    let calls = 0; const children = [];
    const loading = { hidden: false, textContent: '', append(el) { children.push(el); } };
    globalThis.document = {
      getElementById(id) { assert.equal(id, 'loading'); return loading; },
      createElement(tag) { assert.equal(tag, 'button'); return { style: {}, addEventListener(type, fn, options) { assert.equal(type, 'click'); assert.deepEqual(options, { once: true }); this.click = fn; }, remove() { children.splice(children.indexOf(this), 1); } }; },
    };
    globalThis.fetch = async () => { calls++; return calls === 1 ? new Response('', { status: 503 }) : new Response(JSON.stringify({ packs: [] })); };
    const result = loadCore('https://city.test/'); await flush();
    assert.equal(calls, 1); assert.equal(children.length, 1); assert.match(children[0].textContent, /Retry/);
    assert.match(children[0].style.cssText, /pointer-events:auto/); // loading overlay ignores pointer input by default
    assert.equal(timers.size, 0); await flush(); assert.equal(calls, 1);
    children[0].click(); assert.deepEqual(await result, { packs: [] });
    assert.equal(calls, 2); assert.equal(children.length, 0); assert.equal(timers.size, 0);
  }));
  await test('streaming caps work at two requests and ignores stale or duplicate responses', () => clock(async ({ advance, timers }) => {
    const w = fakeWorld(), messages = []; w.worker.postMessage = (m) => messages.push(m);
    w.packOf.set('1_0', 'other'); w.packOf.set('2_0', 'third');
    w.request('0_0'); w.request('1_0'); w.request('2_0'); assert.equal(messages.length, 2);
    const staleId = messages[0].requestId;
    await advance(20000); w.expireRequests(); assert.equal(w.pending.size, 0);
    await advance(500); w.request('0_0'); const newId = w.requestIds.get('0_0'); assert.notEqual(newId, staleId);
    w.onMessage({ type: 'empty', key: '0_0', requestId: staleId });
    assert.equal(w.empty.has('0_0'), false); assert.equal(w.requestIds.get('0_0'), newId);
    reply(w, 'built', { built: { key: '0_0' }, ms: 2 });
    w.onMessage({ type: 'error', key: '0_0', requestId: newId, error: 'late duplicate' });
    assert.equal(w.tiles.has('0_0'), true); assert.equal(w.failures.has('0_0'), false); assert.equal(timers.size, 0);
  }));
  await test('three timed-out tile attempts reject once, restore the old focus and clear the ensure timer', () => clock(async ({ advance, timers }) => {
    const w = fakeWorld(), messages = []; w.worker.postMessage = (m) => messages.push(m);
    const done = w.ensure(5000, 5000), rejected = assert.rejects(done, /Could not load the streets/);
    await advance(65000); await rejected;
    assert.equal(messages.length, 3); assert.deepEqual(w.focus, [10, 20]);
    assert.equal(w.pending.size, 0); assert.equal(w.requestIds.size, 0); assert.equal(w.waiters.length, 0); assert.equal(w.empty.size, 0); assert.equal(timers.size, 0);
    await advance(100000); assert.equal(messages.length, 3);
  }));
  await test('explicit area retry clears prior failures and success releases its timer', () => clock(async ({ timers }) => quiet(async () => {
    const w = fakeWorld(); w.failures.set('0_0', { attempts: 3, retryAt: Infinity, message: 'old failure' });
    const done = w.ensure(0, 0); reply(w, 'built', { built: { key: '0_0' }, ms: 1 }); await done;
    assert.equal(w.failures.size, 0); assert.equal(w.waiters.length, 0); assert.equal(timers.size, 0);
  })));
  await test('connectivity events cannot extend the seventy-five-second area deadline', () => clock(async ({ advance, timers }) => {
    const w = fakeWorld(); w.workerUnavailable = true;
    const done = w.ensure(5000, 5000), rejected = assert.rejects(done, /took too long/);
    await advance(74000); w.retryStreaming(); assert.equal(w.waiters.length, 1);
    await advance(1000); await rejected;
    assert.equal(w.waiters.length, 0); assert.equal(timers.size, 0); assert.deepEqual(w.focus, [10, 20]);
  }));
  await test('worker restarts are bounded, and an explicit area retry can recover afterwards', () => clock(async ({ advance, timers }) => quiet(async () => {
    const w = fakeWorld(); let restarts = 0;
    w.makeWorker = () => { restarts++; throw new Error('https://secret.invalid/worker'); };
    const done = w.ensure(0, 0), rejected = assert.rejects(done, /loader could not restart/);
    w.workerError(); await advance(1500); await rejected;
    assert.equal(restarts, 2); assert.equal(w.workerFailed, true); assert.equal(w.waiters.length, 0); assert.equal(timers.size, 0);
    await advance(60000); assert.equal(restarts, 2);
    w.makeWorker = () => ({ postMessage() {}, terminate() {} });
    const retried = w.ensure(0, 0); reply(w, 'empty'); await retried;
    assert.equal(w.workerFailed, false); assert.equal(w.workerRestarts, 0); assert.equal(timers.size, 0);
  })));
  await test('old playable tiles stay loaded throughout an unsuccessful relocation', () => clock(async ({ advance }) => {
    const w = fakeWorld(); w.tiles.set('-9_-9', { key: '-9_-9' }); let removed = 0; w.unload = () => { removed++; };
    const done = w.ensure(5000, 5000), rejected = assert.rejects(done, /Could not load the streets/);
    w.update(5000, 5000, 0, true); assert.equal(removed, 0);
    await advance(65000); await rejected; assert.equal(w.tiles.has('-9_-9'), true);
  }));
  await test('aborted area waits release timers without cancelling shared tile work or replacing a newer focus', () => clock(async ({ timers }) => {
    const w=fakeWorld(), a=new AbortController(), b=new AbortController();
    const old=w.ensure(0,0,650,a.signal), rejected=assert.rejects(old,{name:'AbortError'});
    const latest=w.ensure(100,200,650,b.signal);
    a.abort(); await rejected;
    assert.deepEqual(w.focus,[100,200]); assert.equal(w.waiters.length,1); assert.equal(timers.size,1); assert.equal(w.pending.size,1);
    reply(w,'empty'); await latest; assert.equal(w.waiters.length,0); assert.equal(timers.size,0);
    const aborted=new AbortController(); aborted.abort(); const focus=w.focus;
    await assert.rejects(w.ensure(900,900,650,aborted.signal),{name:'AbortError'}); assert.equal(w.focus,focus); assert.equal(timers.size,0);
  }));
  await test('same-coordinate area waits own their focus by identity, not coordinate equality', () => clock(async () => {
    const w=fakeWorld(), a=new AbortController();
    const old=w.ensure(100,200,650,a.signal), rejection=assert.rejects(old,{name:'AbortError'}), latest=w.ensure(100,200);
    const focus=w.focus; a.abort(); await rejection; assert.equal(w.focus,focus);
    reply(w,'empty'); await latest;
  }));
  await test('retired worker events are ignored and initialization rejects terminate the new worker', () => clock(async ({ timers }) => {
    const savedWorker = globalThis.Worker, workers = []; let rejectInit = false;
    globalThis.Worker = class {
      constructor() { workers.push(this); }
      postMessage() { if (rejectInit) throw new Error('init rejected'); }
      terminate() { this.terminated = true; }
    };
    try {
      const w = fakeWorld(); w.opts = { lowQ: true }; w.core = { origin: { lat: 17.4, lon: 78.5 }, packs: [] };
      const retired = w.makeWorker(), current = w.makeWorker(); w.worker = current;
      retired.onmessage({ data: { type: 'empty', key: '0_0', requestId: 1 } });
      retired.onerror({ preventDefault() { throw new Error('retired event was not ignored'); } });
      retired.onmessageerror(); assert.equal(w.empty.size, 0); assert.equal(w.worker, current); assert.equal(timers.size, 0);
      rejectInit = true;
      assert.throws(() => w.makeWorker(), /init rejected/); assert.equal(workers.at(-1).terminated, true); assert.equal(timers.size, 0);
    } finally { globalThis.Worker = savedWorker; }
  }));
  await build({ entryPoints: [resolve(root, 'game/src/world/tileworker.ts')], outfile: join(out, 'worker.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  await test('worker evicts rejected and invalid packs, preserves request IDs, and caps decoded cache', async () => {
    const messages = [], calls = new Map();
    globalThis.self = { postMessage: (m) => messages.push(m) };
    globalThis.fetch = async (url) => {
      const attempt = (calls.get(url) || 0) + 1; calls.set(url, attempt);
      if (url === 'retry' && attempt === 1) return new Response('', { status: 503 });
      if (url === 'invalid' && attempt === 1) return new Response(JSON.stringify({ tiles: [] }));
      return new Response(JSON.stringify({ tiles: {} }));
    };
    await import(pathToFileURL(join(out, 'worker.mjs')));
    const buildEmpty = (url, requestId) => self.onmessage({ data: { type: 'build', url, key: '0_0', requestId } });
    await buildEmpty('retry', 11); await buildEmpty('retry', 12);
    await buildEmpty('invalid', 13); await buildEmpty('invalid', 14);
    assert.deepEqual(messages.map((m) => [m.type, m.requestId]), [['error', 11], ['empty', 12], ['error', 13], ['empty', 14]]);
    assert.equal(calls.get('retry'), 2); assert.equal(calls.get('invalid'), 2);
    for (let i = 0; i < 7; i++) await buildEmpty('cache-' + i, 20 + i);
    await buildEmpty('cache-6', 30); assert.equal(calls.get('cache-6'), 1);
    await buildEmpty('cache-0', 31); assert.equal(calls.get('cache-0'), 2);
    assert.ok(messages.every((m) => !m.error || !/https?:|\n\s+at/.test(m.error)));
  });
  console.log(`${checks} Version 2 loading regression groups passed.`);
} finally {
  Object.assign(globalThis, savedGlobals);
  await rm(out, { recursive: true, force: true });
}
