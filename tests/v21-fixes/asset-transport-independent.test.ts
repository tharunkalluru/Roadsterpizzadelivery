import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { packageLosslessAssets } from '../../scripts/asset-transport.mjs';
import { losslessAssetResponse, type LosslessAsset } from '../../worker/asset-transport';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const bytes = Buffer.from('glTF independent preservation check\n'.repeat(32000));
const gzip = gzipSync(bytes);
const asset: LosslessAsset = {
  path: '/delivery/characters/independent/model.glb',
  storagePath: `/_lossless-assets/${hash(bytes)}.gz`, contentType: 'model/gltf-binary',
  identityBytes: bytes.length, gzipBytes: gzip.length, sha256: hash(bytes), gzipSha256: hash(gzip),
};
const manifest = new Map([[asset.path, asset]]);
const request = (encoding: string) => new Request('https://example.invalid' + asset.path, { headers: { 'accept-encoding': encoding } });
const headers = () => new Headers({ 'content-type': 'application/gzip', 'content-length': String(gzip.length) });

test('RFC 9110 optional space and tab before an encoding weight do not reject a supported representation', async () => {
  const assets = { fetch: async () => new Response(gzip, { headers: headers() }) };
  for (const encoding of ['gzip ;q=1, identity;q=0', 'gzip\t;q=1, identity;q=0', 'gzip ; q=0.8, identity ;q=0']) {
    const response = (await losslessAssetResponse(request(encoding), assets as never, manifest))!;
    assert.equal(response.status, 200, encoding);
    assert.equal(response.headers.get('content-encoding'), 'gzip');
    assert.deepEqual(gunzipSync(Buffer.from(await response.arrayBuffer())), bytes);
  }
});

test('both representations return before the stored stream finishes, then preserve every byte', async () => {
  for (const encoding of ['gzip', 'identity']) {
    let control!: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>({ start(controller) { control = controller; } });
    const assets = { fetch: async () => new Response(source, { headers: headers() }) };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const response = await Promise.race([
      losslessAssetResponse(request(encoding), assets as never, manifest),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Response waited for the whole model stream')), 500); }),
    ]).finally(() => clearTimeout(timeout));
    assert.ok(response);
    const body = response.arrayBuffer();
    control.enqueue(gzip.subarray(0, 16)); control.enqueue(gzip.subarray(16)); control.close();
    const received = Buffer.from(await body);
    assert.deepEqual(encoding === 'gzip' ? gunzipSync(received) : received, bytes);
  }
});

async function fixture(entries: { url: string; sha256: string }[]) {
  const root = await mkdtemp(join(tmpdir(), 'roadster-independent-transport-'));
  const put = async (name: string, body: string | Uint8Array) => { await mkdir(dirname(join(root, name)), { recursive: true }); await writeFile(join(root, name), body); };
  await put('src/delivery/art/character-assets.json', JSON.stringify({ assets: entries.map(glb => ({ glb })) }));
  for (const entry of entries) if (!entry.url.includes('..') && !entry.url.includes('%')) await put('public' + entry.url, bytes);
  await cp(join(root, 'public'), join(root, 'dist/client'), { recursive: true });
  return { root, put, close: () => rm(root, { recursive: true, force: true }) };
}

test('a later approved-hash failure retains raw production copies already processed and all source bytes', async () => {
  const urls = ['/delivery/characters/a/model.glb', '/delivery/characters/z/model.glb'];
  const f = await fixture(urls.map((url, index) => ({ url, sha256: index ? '0'.repeat(64) : hash(bytes) })));
  try {
    await assert.rejects(packageLosslessAssets(f.root), /bytes differ/);
    for (const url of urls) {
      assert.deepEqual(await readFile(join(f.root, 'public' + url)), bytes);
      assert.deepEqual(await readFile(join(f.root, 'dist/client' + url)), bytes);
    }
  } finally { await f.close(); }
});

test('duplicate URLs and a linked production-copy directory fail without deleting source assets', async () => {
  const duplicate = await fixture([{ url: asset.path, sha256: hash(bytes) }, { url: asset.path, sha256: hash(bytes) }]);
  try { await assert.rejects(packageLosslessAssets(duplicate.root), /Duplicate/); assert.deepEqual(await readFile(join(duplicate.root, 'public' + asset.path)), bytes); }
  finally { await duplicate.close(); }
  const linked = await fixture([{ url: asset.path, sha256: hash(bytes) }]);
  try {
    const at = 'delivery/characters/independent';
    await rm(join(linked.root, 'dist/client', at), { recursive: true });
    await symlink(join(linked.root, 'public', at), join(linked.root, 'dist/client', at));
    await assert.rejects(packageLosslessAssets(linked.root), /linked asset/);
    assert.deepEqual(await readFile(join(linked.root, 'public' + asset.path)), bytes);
  } finally { await linked.close(); }
});

test('a stored no-store response remains noncacheable after identity transformation', async () => {
  const sourceHeaders = headers(); sourceHeaders.set('cache-control', 'private, no-store');
  sourceHeaders.set('vary', 'Origin'); sourceHeaders.set('access-control-allow-origin', 'https://allowed.invalid');
  sourceHeaders.set('content-range', 'bytes 0-9/20'); sourceHeaders.set('last-modified', 'Thu, 01 Jan 1970 00:00:00 GMT');
  const assets = { fetch: async () => new Response(gzip, { headers: sourceHeaders }) };
  const response = (await losslessAssetResponse(request('identity'), assets as never, manifest))!;
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://allowed.invalid');
  assert.equal(response.headers.get('vary'), 'Origin, Accept-Encoding');
  for (const name of ['content-length', 'content-range', 'last-modified', 'content-encoding']) assert.equal(response.headers.get(name), null, name);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});

test('distinct generated game and worker modules retain their own UTF8 bytes and query-bearing original URLs',async()=>{
  const f=await fixture([{url:asset.path,sha256:hash(bytes)}]);
  const scripts=new Map([
    ['/assets/index-one.js',Buffer.from(`export const game = ${JSON.stringify('Hyderabad పాత్ర 🛵 '.repeat(6000))};\n`)],
    ['/assets/workers/tile-two.js',Buffer.from(`export const worker = ${JSON.stringify('different city geometry data '.repeat(6000))};\n`)],
  ]);
  try{
    for(const[url,body]of scripts)await f.put('dist/client'+url,body);
    const packed=await packageLosslessAssets(f.root),modules=packed.filter(p=>scripts.has(p.path));assert.equal(modules.length,2);
    assert.notEqual(modules[0].storagePath,modules[1].storagePath,'Different scripts cannot share an accidental module mapping');
    const registry=new Map(modules.map(e=>[e.path,e]));
    const assets={fetch:async(request:Request)=>{const pathname=new URL(request.url).pathname,entry=modules.find(e=>e.storagePath===pathname);assert.ok(entry);const body=await readFile(join(f.root,'dist/client'+pathname));return new Response(body,{headers:{'content-type':'application/gzip','content-length':String(body.length)}});}};
    for(const entry of modules)for(const encoding of['identity','gzip']){
      const response=(await losslessAssetResponse(new Request('https://example.invalid'+entry.path+'?v=original-hash',{headers:{'accept-encoding':encoding}}),assets as never,registry))!;
      assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'text/javascript; charset=utf-8');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      const body=Buffer.from(await response.arrayBuffer()),decoded=encoding==='gzip'?gunzipSync(body):body;
      assert.deepEqual(decoded,scripts.get(entry.path));assert.equal(hash(decoded),entry.sha256);
      assert.equal(response.headers.get('content-encoding'),encoding==='gzip'?'gzip':null);
    }
  }finally{await f.close();}
});
