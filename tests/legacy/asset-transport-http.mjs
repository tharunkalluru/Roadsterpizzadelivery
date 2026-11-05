// Explicit integration check against an already running compiled Worker.
// Run: node tests/legacy/asset-transport-http.mjs http://127.0.0.1:4289 [evidence.json]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { gunzipSync } from 'node:zlib';

const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:4289');
assert.ok(['http:', 'https:'].includes(origin.protocol) && !origin.username && !origin.password);
const manifest = JSON.parse(await readFile('dist/server/asset-transport.json', 'utf8')).assets;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const raw = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
  const url = new URL(path, origin), request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const outgoing = request(url, { method, headers }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    response.on('error', reject);
  });
  outgoing.setTimeout(60000, () => outgoing.destroy(new Error('Asset verification timed out')));
  outgoing.on('error', reject); outgoing.end();
});
const assets = [];
for (const entry of manifest) {
  const gzip = await raw(entry.path, { 'accept-encoding': 'gzip' });
  assert.equal(gzip.status, 200, entry.path); assert.equal(gzip.headers['content-encoding'], 'gzip');
  assert.equal(gzip.headers['content-type'], entry.contentType);
  assert.equal(sha(gzip.body), entry.gzipSha256, 'exact stored gzip: ' + entry.path);
  assert.equal(sha(gunzipSync(gzip.body)), entry.sha256, 'one gzip decode restores source: ' + entry.path);
  const decoded = await fetch(new URL(entry.path, origin));
  assert.equal(decoded.status, 200);
  assert.equal(sha(Buffer.from(await decoded.arrayBuffer())), entry.sha256, 'native fetch decoded source: ' + entry.path);
  const identity = await raw(entry.path, { 'accept-encoding': 'identity' });
  assert.equal(identity.status, 200); assert.equal(identity.headers['content-encoding'], undefined);
  assert.equal(sha(identity.body), entry.sha256, 'identity stream source: ' + entry.path);
  assets.push({ path: entry.path, identityBytes: entry.identityBytes, gzipBytes: gzip.body.length, approvedSha256: entry.sha256, rawGzipSha256: sha(gzip.body), gzipDecodedExact: true, fetchAutomaticallyDecodedExact: true, identityExact: true });
}
const entry = manifest[0], head = await raw(entry.path, { 'accept-encoding': 'gzip' }, 'HEAD');
assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(head.headers['content-encoding'], 'gzip');
const notModified = await raw(entry.path, { 'accept-encoding': 'gzip', 'if-none-match': head.headers.etag });
assert.equal(notModified.status, 304); assert.equal(notModified.body.length, 0);
const range = await raw(entry.path, { 'accept-encoding': 'gzip', range: 'bytes=0-31' });
assert.equal(range.status, 200); assert.equal(range.headers['content-range'], undefined); assert.equal(sha(gunzipSync(range.body)), entry.sha256);
assert.equal((await raw(entry.storagePath)).status, 404);
assert.equal((await raw(entry.path, {}, 'POST')).status, 405);
const noEncodingHeaders = { 'accept-encoding': 'gzip;q=0, identity;q=0' };
const unacceptable = await raw(entry.path, noEncodingHeaders);
// Local workerd's HTTP gateway can reject an impossible encoding request
// before dispatching any Worker/asset route. Require the same independent
// static/API control result rather than disguising that as our handler's 406.
let encodingRejection;
if (unacceptable.status === 415) {
  assert.equal((await raw('/build-info.json', noEncodingHeaders)).status, 415);
  assert.equal((await raw('/api/bug-reports', noEncodingHeaders)).status, 415);
  encodingRejection = 'local HTTP gateway 415 on model/static/API controls; handler 406 separately unit-tested';
} else { assert.equal(unacceptable.status, 406); encodingRejection = 'Worker 406'; }
assert.equal((await raw('/api/bug-reports')).status, 405);
const evidence = { observedAt: new Date().toISOString(), origin: origin.origin, method: 'Actual compiled Worker HTTP; raw gzip, native Node fetch decoder, identity stream. This is not a browser or phone FPS test.', assets, protocol: { headNoBody: true, conditional304: true, rangeFull200: true, internal404: true, post405: true, unacceptableEncoding: encodingRejection, existingApi405: true } };
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ assets: assets.length, models: assets.filter(asset => asset.path.endsWith('.glb')).length, exactDecodedBytes: true, protocol: evidence.protocol }, null, 2));
