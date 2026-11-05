import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { warmPreparedRoadProfiles, type RoadProfileCacheManifest } from '../../src/world/road-profile-cache';
import { prepareRoadGrades, roadGradePatches, roadGradeReport, type PreparedRoadCachePayload } from '../../src/world/road-grades';
import type { RoadEdge } from '../../src/world/types';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
function fixture() {
  const roads: RoadEdge[] = [{ id: 'cache-fixture', seg: 'cache-fixture', name: null, cls: 'primary', w: 7, lanes: 2, oneway: 'forward', from: 'a', to: 'b', pts: [[0, 0], [20, 0]], elev: null, maxspeed: 40 }];
  const payload: PreparedRoadCachePayload = { version: 1, sourceRoadCount: 1, patches: [{ id: roads[0].id, pts: [[0, 0], [20, 0]], elev: [0, 1], w: 7 }], report: {
    roads: 1, repairedRoads: 1, sourceSteepSegments: 0, modelSteepSegments: 0, maxModelGrade: .05, protectedRoads: 0, protectedRoadsChanged: 0, separatedCrossings: 0, minCrossingSeparation: 0, joinedEndpointMaxDifference: 0, uncertainty: 'Unit fixture, no city or visual approval.' } };
  const encode = (p = payload) => { const bytes = Buffer.from(JSON.stringify(p)), gzip = gzipSync(bytes); return { bytes, gzip, manifest: { version: 1, enabled: true, asset: 'road-profiles-v1.pack.wasm', sourceRoadCount: roads.length,
    sourceRoadsSha256: hash(JSON.stringify(roads, (_key, value) => typeof value === 'number' && Object.is(value, -0) ? { $roadProfileNegativeZero: true } : value)), sourceCorePackSha256: 'a'.repeat(64), generatorInputsSha256: 'b'.repeat(64), payloadSha256: hash(bytes), payloadBytes: bytes.length, gzipSha256: hash(gzip), gzipBytes: gzip.length } as RoadProfileCacheManifest }; };
  return { roads, payload, encode };
}

test('verified gzip and server-decoded profiles warm the ordinary preparation and worker patch/report path without mutating raw roads', async () => {
  for (const decoded of [false, true]) {
    const f = fixture(), packed = f.encode(), before = JSON.stringify(f.roads); let fetched = '';
    const result = await warmPreparedRoadProfiles('https://game.invalid/city/', f.roads, { manifest: packed.manifest, fetcher: async (url) => { fetched = String(url); return new Response(decoded ? packed.bytes : packed.gzip); } });
    assert.deepEqual(result, { used: true, reason: 'installed' });
    assert.equal(new URL(fetched).pathname, '/city/road-profiles-v1.pack.wasm');
    assert.equal(new URL(fetched).searchParams.get('v'), packed.manifest.payloadSha256);
    const model = prepareRoadGrades(f.roads);
    assert.deepEqual(model[0].elev, [0, 1]);
    assert.equal(prepareRoadGrades(model), model);
    assert.deepEqual(roadGradePatches(model), f.payload.patches);
    assert.deepEqual(roadGradeReport(model), f.payload.report);
    assert.equal(JSON.stringify(f.roads), before);
  }
});

test('a source change, disabled manifest or invalid asset path never downloads or installs another world model', async () => {
  const f = fixture(), p = f.encode(); let requests = 0, installs = 0;
  const options = { manifest: p.manifest, fetcher: async () => { requests++; return new Response(p.gzip); }, install: () => { installs++; return true; } };
  const changed = structuredClone(f.roads); changed[0].pts[1][0] += .1;
  assert.equal((await warmPreparedRoadProfiles('https://game.invalid/city/', changed, options)).reason, 'binding-mismatch');
  assert.equal((await warmPreparedRoadProfiles('https://game.invalid/city/', f.roads, { ...options, manifest: { version: 1, enabled: false } })).reason, 'disabled');
  assert.equal((await warmPreparedRoadProfiles('https://game.invalid/city/', f.roads, { ...options, manifest: { ...p.manifest, asset: '../other.pack.wasm' } })).reason, 'invalid');
  assert.equal(requests, 0); assert.equal(installs, 0);
});

test('cached profiles cannot cross source-normalization generations even for identical road arrays', async () => {
  const f = fixture(), packed = f.encode(); let requests = 0, installs = 0;
  const generation = 'c'.repeat(64), options = { manifest: { ...packed.manifest, sourceRoadGeometryGeneration: generation },
    fetcher: async () => { requests++; return new Response(packed.gzip); }, install: () => { installs++; return true; } };
  for (const sourceRoadGeometryGeneration of [undefined, 'd'.repeat(64)]) {
    assert.deepEqual(await warmPreparedRoadProfiles('https://game.invalid/city/', f.roads, { ...options, sourceRoadGeometryGeneration }), { used: false, reason: 'binding-mismatch' });
  }
  assert.equal(requests, 0); assert.equal(installs, 0);
  assert.equal((await warmPreparedRoadProfiles('https://game.invalid/city/', f.roads, { ...options,
    manifest: { ...options.manifest, sourceRoadGeometryGeneration: 'invalid' }, sourceRoadGeometryGeneration: 'invalid' })).reason, 'invalid');
  assert.equal(requests, 0); assert.equal(installs, 0);
  assert.equal((await warmPreparedRoadProfiles('https://game.invalid/city/', f.roads, { ...options, sourceRoadGeometryGeneration: generation })).used, true);
  assert.equal(requests, 1); assert.equal(installs, 1);
});

test('tagged negative zero preserves exact coordinate and elevation signs through the serialized browser path', async () => {
  const f = fixture(); f.roads[0].pts[0][0] = -0;
  const packed = f.encode();
  const document = JSON.parse(packed.bytes.toString('utf8'));
  document.patches[0].pts[0][0] = { $roadProfileNegativeZero: true };
  document.patches[0].elev[0] = { $roadProfileNegativeZero: true };
  const bytes = Buffer.from(JSON.stringify(document)), gzip = gzipSync(bytes);
  const manifest = { ...packed.manifest, payloadSha256: hash(bytes), payloadBytes: bytes.length, gzipSha256: hash(gzip), gzipBytes: gzip.length };
  assert.equal((await warmPreparedRoadProfiles('https://game.invalid/city/', f.roads, { manifest, fetcher: async () => new Response(gzip) })).used, true);
  const prepared = prepareRoadGrades(f.roads);
  assert.ok(Object.is(prepared[0].pts[0][0], -0));
  assert.ok(Object.is(prepared[0].elev![0], -0));
  const changed = structuredClone(f.roads); changed[0].pts[0][0] = 0;
  assert.equal((await warmPreparedRoadProfiles('https://game.invalid/city/', changed, { manifest, fetcher: async () => { throw new Error('A different source must not download this model.'); } })).reason, 'binding-mismatch');
});

test('corrupt transport, corrupt decoded payload, HTTP fallback and invalid road IDs retain generic preparation', async () => {
  for (const kind of ['gzip', 'decoded', 'html', 'unknown-id']) {
    const f = fixture();
    if (kind === 'unknown-id') f.payload.patches[0].id = 'not-in-this-world';
    const p = f.encode(), before = JSON.stringify(f.roads);
    const body = kind === 'gzip' ? Buffer.from(p.gzip) : kind === 'decoded' ? Buffer.from(p.bytes) : kind === 'html' ? Buffer.from('<html>fallback</html>') : p.gzip;
    if (kind === 'gzip' || kind === 'decoded') body[body.length - 1] ^= 1;
    const result = await warmPreparedRoadProfiles('https://game.invalid/city/', f.roads, { manifest: p.manifest, fetcher: async () => new Response(body) });
    assert.equal(result.used, false, kind);
    assert.equal(JSON.stringify(f.roads), before);
    assert.equal(roadGradeReport(f.roads), undefined);
    assert.deepEqual(roadGradePatches(f.roads), []);
    assert.equal(prepareRoadGrades(f.roads)[0].elev, null, 'generic preparation remains available');
  }
});

test('oversized streams are cancelled and stalled downloads time out without installing a partial model', async () => {
  const f = fixture(), p = f.encode(); let cancelled = false, installs = 0;
  const over = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(p.bytes.length + 1)); }, cancel() { cancelled = true; } });
  const install = () => { installs++; return true; };
  assert.equal((await warmPreparedRoadProfiles('https://game.invalid/city/', f.roads, { manifest: p.manifest, fetcher: async () => new Response(over), install })).used, false);
  assert.equal(cancelled, true);
  const controllerResult = await warmPreparedRoadProfiles('https://game.invalid/city/', f.roads, { manifest: p.manifest, fetcher: () => new Promise(() => {}), install, timeoutMs: 10 });
  assert.equal(controllerResult.used, false); assert.equal(installs, 0);
});
