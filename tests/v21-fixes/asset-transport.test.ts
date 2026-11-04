import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { packageLosslessAssets, expandedDirectoryBytes } from '../../scripts/asset-transport.mjs';
import { losslessAssetResponse, type LosslessAsset } from '../../worker/asset-transport';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const original = Buffer.from('glTF\0' + 'same approved geometry, textures, rigs and animation\n'.repeat(4000));
const compressed = gzipSync(original, { level: 9 });
const entry: LosslessAsset = { path: '/delivery/characters/actor/model.glb', storagePath: `/_lossless-assets/${sha(original)}.gz`, contentType: 'model/gltf-binary', identityBytes: original.length, gzipBytes: compressed.length, sha256: sha(original), gzipSha256: sha(compressed) };
const manifest = new Map([[entry.path, entry]]);
function assetsFixture(options: { status?: number; contentType?: string; contentLength?: string; encoding?: string; bytes?: Uint8Array; fail?: boolean; private?: boolean } = {}) {
  const calls: Request[] = [];
  const assets = { async fetch(input: Request) {
    calls.push(input); if (options.fail) throw new Error('unavailable');
    const headers = new Headers({ 'content-type': options.contentType ?? 'application/gzip', 'content-length': options.contentLength ?? String(entry.gzipBytes), vary: 'Origin', 'access-control-allow-origin': 'https://same-policy.example', 'cache-control': options.private ? 'private' : 'public' });
    if (options.encoding) headers.set('content-encoding', options.encoding);
    return new Response(input.method === 'HEAD' ? null : options.bytes ?? compressed, { status: options.status ?? 200, headers });
  } };
  return { calls, assets };
}
const request = (headers?: HeadersInit, method = 'GET', path = entry.path) => new Request(`https://game.example${path}`, { method, headers });

test('gzip and streamed identity preserve exact bytes, original MIME and isolated cache variants', async () => {
  const f = assetsFixture();
  const gzip = (await losslessAssetResponse(request({ 'accept-encoding': 'br, gzip' }), f.assets as never, manifest))!;
  assert.equal(gzip.status, 200); assert.equal(gzip.headers.get('content-encoding'), 'gzip'); assert.equal(gzip.headers.get('content-type'), 'model/gltf-binary');
  assert.deepEqual(gunzipSync(Buffer.from(await gzip.arrayBuffer())), original);
  const identity = (await losslessAssetResponse(request({ 'accept-encoding': 'identity' }), f.assets as never, manifest))!;
  assert.equal(identity.headers.get('content-encoding'), null); assert.equal(sha(new Uint8Array(await identity.arrayBuffer())), entry.sha256);
  assert.notEqual(identity.headers.get('etag'), gzip.headers.get('etag')); assert.match(identity.headers.get('vary')!, /Origin.*Accept-Encoding/);
  assert.equal(identity.headers.get('access-control-allow-origin'), 'https://same-policy.example');
  for (const call of f.calls) { assert.equal(new URL(call.url).pathname, entry.storagePath); assert.equal(call.headers.get('accept-encoding'), 'identity'); }
});

test('encoding quality exclusions, wildcards and absent headers never send forbidden gzip', async () => {
  const cases: [string | undefined, string | null, number][] = [[undefined, null, 200], ['gzip;q=0', null, 200], ['br', null, 200], ['GZip;q=1, identity;q=0', 'gzip', 200], ['gzip;q=.5', null, 200], ['*;q=1, identity;q=0', 'gzip', 200], ['gzip;q=0, identity;q=0', null, 406], ['*;q=0', null, 406]];
  for (const [accept, encoding, status] of cases) {
    const f = assetsFixture(), response = (await losslessAssetResponse(request(accept ? { 'accept-encoding': accept } : undefined), f.assets as never, manifest))!;
    assert.equal(response.status, status, accept); assert.equal(response.headers.get('content-encoding'), encoding, accept);
    if (status === 406) { assert.equal(f.calls.length, 0); assert.equal(response.headers.get('cache-control'), 'no-store'); }
    else await response.arrayBuffer();
  }
});

test('Cloudflare original client encoding overrides its normalized br,gzip header', async () => {
  for (const [original, expected] of [['identity', 200], ['gzip;q=0, identity;q=0', 406], [null, 200]] as const) {
    const input = request({ 'accept-encoding': 'br, gzip' });
    Object.defineProperty(input, 'cf', { value: { clientAcceptEncoding: original } });
    const response = (await losslessAssetResponse(input, assetsFixture().assets as never, manifest))!;
    assert.equal(response.status, expected); assert.equal(response.headers.get('content-encoding'), null);
    if (expected === 200) assert.equal(sha(new Uint8Array(await response.arrayBuffer())), entry.sha256);
  }
});

test('HEAD and conditional requests preserve representation metadata without bodies or partial-byte confusion', async () => {
  const f = assetsFixture(), head = (await losslessAssetResponse(request({ 'accept-encoding': 'gzip' }, 'HEAD'), f.assets as never, manifest))!;
  assert.equal(head.status, 200); assert.equal(head.body, null); assert.equal(head.headers.get('content-encoding'), 'gzip'); assert.equal(f.calls[0].method, 'HEAD');
  const same = (await losslessAssetResponse(request({ 'accept-encoding': 'gzip', 'if-none-match': `W/${head.headers.get('etag')}` }), f.assets as never, manifest))!;
  assert.equal(same.status, 304); assert.equal(same.body, null); assert.equal(f.calls.at(-1)!.method, 'HEAD');
  const identity = (await losslessAssetResponse(request({ 'accept-encoding': 'identity', 'if-none-match': head.headers.get('etag')! }), f.assets as never, manifest))!;
  assert.equal(identity.status, 200, 'a gzip validator never validates different identity bytes'); await identity.arrayBuffer();
  const range = (await losslessAssetResponse(request({ 'accept-encoding': 'gzip', range: 'bytes=5-20', 'if-range': 'previous-etag' }), f.assets as never, manifest))!;
  assert.equal(range.status, 200); assert.equal(range.headers.get('accept-ranges'), 'none'); assert.equal(range.headers.get('content-range'), null);
  assert.deepEqual(gunzipSync(Buffer.from(await range.arrayBuffer())), original);
  assert.equal(f.calls.at(-1)!.headers.get('range'), null); assert.equal(f.calls.at(-1)!.headers.get('if-range'), null);
});

test('missing, redirected, HTML fallback, wrong-length and re-encoded payloads fail closed rather than masquerading as models', async () => {
  for (const options of [{ status: 404 }, { status: 302 }, { contentType: 'text/html' }, { contentLength: '100' }, { encoding: 'gzip' }, { fail: true }]) {
    const response = (await losslessAssetResponse(request(), assetsFixture(options).assets as never, manifest))!;
    assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.notEqual(response.headers.get('content-type'), entry.contentType);
  }
  const missing = (await losslessAssetResponse(request({ 'if-none-match': '*' }), assetsFixture({ status: 404 }).assets as never, manifest))!;
  assert.equal(missing.status, 503, 'a validator cannot conceal missing stored bytes');
});

test('stream errors and existing client SHA validation expose corrupted bytes without full-body Worker buffering', async () => {
  const bytes = Buffer.from(compressed); bytes[bytes.length - 5] ^= 0xff;
  const identity = (await losslessAssetResponse(request(), assetsFixture({ bytes }).assets as never, manifest))!;
  await assert.rejects(identity.arrayBuffer(), 'native streaming decompression rejects corrupt gzip');
  const wrong = gzipSync(Buffer.alloc(original.length, 42));
  const encoded = (await losslessAssetResponse(request({ 'accept-encoding': 'gzip' }), assetsFixture({ bytes: wrong, contentLength: String(entry.gzipBytes) }).assets as never, manifest))!;
  assert.notEqual(sha(gunzipSync(Buffer.from(await encoded.arrayBuffer()))), entry.sha256, 'same declared headers cannot defeat the existing decoded SHA gate');
});

test('transport scope leaves unknown assets/API and private cache policy intact', async () => {
  const f = assetsFixture({ private: true });
  assert.equal(await losslessAssetResponse(request(undefined, 'GET', '/assets/game.js'), f.assets as never, manifest), null);
  assert.equal(await losslessAssetResponse(request(undefined, 'GET', '/api/bug-reports'), f.assets as never, manifest), null);
  assert.equal(f.calls.length, 0);
  const hidden = (await losslessAssetResponse(request(undefined, 'GET', entry.storagePath), f.assets as never, manifest))!; assert.equal(hidden.status, 404);
  const post = (await losslessAssetResponse(request(undefined, 'POST'), f.assets as never, manifest))!; assert.equal(post.status, 405); assert.equal(post.headers.get('allow'), 'GET, HEAD');
  const privateAsset = (await losslessAssetResponse(request(), f.assets as never, manifest))!; assert.match(privateAsset.headers.get('cache-control')!, /^private/); await privateAsset.arrayBuffer();
});

test('Worker original-URL routing uses the injected whitelist while report/API behavior remains unchanged', async () => {
  Object.defineProperty(globalThis, '__LOSSLESS_ASSETS__', { value: [entry], configurable: true });
  try {
    const { default: worker } = await import('../../worker/index');
    const f = assetsFixture(), env = { ASSETS: f.assets, DB: null };
    const response = await worker.fetch(request({ 'accept-encoding': 'gzip' }), env as never);
    assert.equal(response.headers.get('content-type'), 'model/gltf-binary'); assert.deepEqual(gunzipSync(Buffer.from(await response.arrayBuffer())), original);
    assert.equal((await worker.fetch(request(undefined, 'GET', '/api/bug-reports'), env as never)).status, 405);
    assert.equal((await worker.fetch(request(undefined, 'GET', '/api/not-found'), env as never)).status, 404);
  } finally { Reflect.deleteProperty(globalThis, '__LOSSLESS_ASSETS__'); }
});

async function packageFixture(approved = sha(original)) {
  const root = await mkdtemp(join(tmpdir(), 'roadster-lossless-'));
  const put = async (path: string, body: string | Uint8Array) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), body); };
  await put('src/delivery/art/character-assets.json', JSON.stringify({ assets: [{ glb: { url: entry.path, sha256: approved } }] }));
  await put('public' + entry.path, original); await put('public/zones/rtc/zone.json', JSON.stringify({ sameCity: 'real retained city data '.repeat(5000) }));
  await put('public/keep.png', 'not a target'); await cp(join(root, 'public'), join(root, 'dist/client'), { recursive: true });
  return { root, put, dispose: () => rm(root, { recursive: true, force: true }) };
}

test('build packaging verifies approved bytes and lossless round trips, replaces only dist copies and preserves source/unrelated assets', async () => {
  const f = await packageFixture();
  try {
    const before = await expandedDirectoryBytes(join(f.root, 'dist/client')), packed = await packageLosslessAssets(f.root);
    assert.equal(packed.length, 2); assert.deepEqual(await readFile(join(f.root, 'public' + entry.path)), original); assert.equal(await readFile(join(f.root, 'dist/client/keep.png'), 'utf8'), 'not a target');
    for (const item of packed) { const raw = await readFile(join(f.root, 'public' + item.path)), gzip = await readFile(join(f.root, 'dist/client' + item.storagePath)); assert.deepEqual(gunzipSync(gzip), raw); assert.equal(sha(raw), item.sha256); await assert.rejects(readFile(join(f.root, 'dist/client' + item.path))); }
    assert.ok(await expandedDirectoryBytes(join(f.root, 'dist/client')) < before);
  } finally { await f.dispose(); }
});

test('packaging mismatch or linked source fails without deleting source or the unverified raw production copy', async () => {
  const f = await packageFixture('0'.repeat(64));
  try { await assert.rejects(packageLosslessAssets(f.root), /bytes differ/); assert.deepEqual(await readFile(join(f.root, 'dist/client' + entry.path)), original); assert.deepEqual(await readFile(join(f.root, 'public' + entry.path)), original); }
  finally { await f.dispose(); }
  const linked = await packageFixture();
  try { await rm(join(linked.root, 'public/delivery/characters/actor'), { recursive: true }); await symlink(join(linked.root, 'dist/client/delivery/characters/actor'), join(linked.root, 'public/delivery/characters/actor')); await assert.rejects(packageLosslessAssets(linked.root), /linked asset/); }
  finally { await linked.dispose(); }
});

test('large generated game and worker modules keep exact decoded code, original URLs and JavaScript MIME', async () => {
  const f = await packageFixture();
  const script = Buffer.from(`export const marker = ${JSON.stringify('retained module data and logic '.repeat(4000))};\n`);
  try {
    for (const name of ['game-AbCd1234.js', 'tileworker-EfGh5678.js']) await f.put('dist/client/assets/' + name, script);
    await f.put('dist/client/assets/small.js', 'export const small = 1;');
    const packed = await packageLosslessAssets(f.root), modules = packed.filter(p => p.path.endsWith('.js'));
    assert.equal(modules.length, 2);
    assert.equal(await readFile(join(f.root, 'dist/client/assets/small.js'), 'utf8'), 'export const small = 1;');
    for (const item of modules) {
      assert.equal(item.contentType, 'text/javascript; charset=utf-8'); assert.equal(item.sha256, sha(script));
      const gzip = await readFile(join(f.root, 'dist/client' + item.storagePath)); assert.deepEqual(gunzipSync(gzip), script);
      await assert.rejects(readFile(join(f.root, 'dist/client' + item.path)));
      const registry = new Map([[item.path, item]]), storage = { fetch: async () => new Response(gzip, { headers: { 'content-type': 'application/gzip', 'content-length': String(gzip.length) } }) };
      for (const encoding of ['gzip', 'identity']) {
        const response = (await losslessAssetResponse(new Request('https://game.example' + item.path, { headers: { 'accept-encoding': encoding } }), storage as never, registry))!;
        assert.equal(response.headers.get('content-type'), item.contentType); assert.equal(response.status, 200);
        const bytes = Buffer.from(await response.arrayBuffer()); assert.deepEqual(encoding === 'gzip' ? gunzipSync(bytes) : bytes, script);
      }
    }
  } finally { await f.dispose(); }
});
