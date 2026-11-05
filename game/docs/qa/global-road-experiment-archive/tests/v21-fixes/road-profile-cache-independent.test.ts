import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { warmPreparedRoadProfiles, type RoadProfileCacheManifest } from '../../src/world/road-profile-cache';
import { installPreparedRoadCache, prepareRoadGrades, roadGradePatches, roadGradeReport, type PreparedRoadCachePayload } from '../../src/world/road-grades';
import type { RoadEdge } from '../../src/world/types';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const wireJSON = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === 'number' && Object.is(item, -0) ? { $roadProfileNegativeZero: true } : item);
const road = (id: string, z: number): RoadEdge => ({ id, seg: id, name: null, cls: 'primary', w: 7, lanes: 2, oneway: 'forward', from: id + '-a', to: id + '-b', pts: [[10, z], [110, z]], elev: null, maxspeed: 40 });
function fixture() {
  const roads = [road('independent-a', 10), road('independent-b', 50)];
  const payload: PreparedRoadCachePayload = { version: 1, sourceRoadCount: roads.length, patches: roads.map(r => ({ id: r.id, pts: r.pts, elev: [0, 1], w: r.w })), report: {
    roads: roads.length, repairedRoads: roads.length, sourceSteepSegments: 0, modelSteepSegments: 0, maxModelGrade: .01,
    protectedRoads: 0, protectedRoadsChanged: 0, separatedCrossings: 0, minCrossingSeparation: 0, joinedEndpointMaxDifference: 0, uncertainty: 'Independent bounded unit fixture.' } };
  return { roads, payload };
}
function encode(roads: RoadEdge[], payload: PreparedRoadCachePayload) {
  const bytes = Buffer.from(wireJSON(payload)), gzip = gzipSync(bytes);
  const manifest: RoadProfileCacheManifest = { version: 1, enabled: true, asset: 'road-profiles-v1.pack.wasm', sourceRoadCount: roads.length,
    sourceRoadsSha256: sha(wireJSON(roads)), sourceCorePackSha256: '1'.repeat(64), generatorInputsSha256: '2'.repeat(64),
    payloadSha256: sha(bytes), payloadBytes: bytes.length, gzipSha256: sha(gzip), gzipBytes: gzip.length };
  return { bytes, gzip, manifest };
}

test('a later invalid patch cannot partially populate any prepared-profile cache', async () => {
  for (const invalid of ['unknown-id', 'duplicate-id', 'bad-point', 'bad-elevation', 'bad-width']) {
    const f = fixture();
    const last = f.payload.patches[1];
    if (invalid === 'unknown-id') last.id = 'not-in-source';
    if (invalid === 'duplicate-id') last.id = f.payload.patches[0].id;
    if (invalid === 'bad-point') last.pts = [[1, 1], [2, Number.NaN]];
    if (invalid === 'bad-elevation') last.elev = [1];
    if (invalid === 'bad-width') last.w = 0;
    assert.equal(installPreparedRoadCache(f.roads, f.payload), false, invalid);
    assert.equal(roadGradeReport(f.roads), undefined, invalid);
    assert.deepEqual(roadGradePatches(f.roads), [], invalid);
    const generic = prepareRoadGrades(f.roads);
    assert.equal(generic[0].elev, null, invalid);
    assert.equal(generic[1].elev, null, invalid);
  }
});

test('malformed later payload metadata falls back without installing or mutating source roads', async () => {
  const f = fixture(), before = JSON.stringify(f.roads);
  (f.payload.report as unknown as { verifiedProfiles: object }).verifiedProfiles = {};
  const packed = encode(f.roads, f.payload);
  const result = await warmPreparedRoadProfiles('https://example.invalid/city/', f.roads, { manifest: packed.manifest, fetcher: async () => new Response(packed.gzip) });
  assert.equal(result.used, false);
  assert.equal(JSON.stringify(f.roads), before);
  assert.equal(roadGradeReport(f.roads), undefined);
  assert.equal(prepareRoadGrades(f.roads)[0].elev, null);
});

test('runtime bindings and representation size limits reject before any download', async () => {
  const f = fixture(), packed = encode(f.roads, f.payload); let downloads = 0, installs = 0;
  const fetcher = async () => { downloads++; return new Response(packed.gzip); };
  const install = () => { installs++; return true; };
  for (const change of [{ payloadBytes: 32 * 1024 * 1024 + 1 }, { gzipBytes: 32 * 1024 * 1024 + 1 }, { sourceRoadCount: 100001 }, { sourceRoadsSha256: 'f'.repeat(64) }]) {
    assert.equal((await warmPreparedRoadProfiles('https://example.invalid/city/', f.roads, { manifest: { ...packed.manifest, ...change }, fetcher, install })).used, false);
  }
  const changed = structuredClone(f.roads); changed[0].w += .1;
  assert.equal((await warmPreparedRoadProfiles('https://example.invalid/city/', changed, { manifest: packed.manifest, fetcher, install })).reason, 'binding-mismatch');
  assert.equal(downloads, 0); assert.equal(installs, 0);
});

test('a download resolving after timeout cannot install a late model', async () => {
  const f = fixture(), packed = encode(f.roads, f.payload); let finish!: (response: Response) => void, installs = 0;
  const fetcher = () => new Promise<Response>(resolve => { finish = resolve; });
  const result = await warmPreparedRoadProfiles('https://example.invalid/city/', f.roads, { manifest: packed.manifest, fetcher, timeoutMs: 5, install: () => { installs++; return true; } });
  assert.deepEqual(result, { used: false, reason: 'unavailable' });
  finish(new Response(packed.gzip));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(installs, 0);
  assert.equal(roadGradeReport(f.roads), undefined);
});

test('tagged zeros preserve both signs through gzip and decoded transport and bind signed source changes', async () => {
  for (const decoded of [false, true]) {
    const f = fixture();
    f.roads[0].pts[0][0] = -0;
    f.payload.patches[0].pts[0][0] = -0;
    f.payload.patches[0].pts[0][1] = 0;
    f.payload.patches[0].elev = [-0, 0];
    const packed = encode(f.roads, f.payload); let downloads = 0;
    const fetcher = async () => { downloads++; return new Response(decoded ? packed.bytes : packed.gzip); };
    assert.equal((await warmPreparedRoadProfiles('https://example.invalid/city/', f.roads, { manifest: packed.manifest, fetcher })).used, true);
    const cached = prepareRoadGrades(f.roads);
    assert.equal(Object.is(cached[0].pts[0][0], -0), true);
    assert.equal(Object.is(cached[0].pts[0][1], 0), true);
    assert.equal(Object.is(cached[0].elev![0], -0), true);
    assert.equal(Object.is(cached[0].elev![1], 0), true);
    const changed = structuredClone(f.roads); changed[0].pts[0][0] = 0;
    assert.equal((await warmPreparedRoadProfiles('https://example.invalid/city/', changed, { manifest: packed.manifest, fetcher })).reason, 'binding-mismatch');
    assert.equal(downloads, 1);
  }
});

test('literal reserved marker objects cannot impersonate a numeric source coordinate', async () => {
  const f = fixture(); f.roads[0].pts[0][0] = -0;
  const packed = encode(f.roads, f.payload), malformed = structuredClone(f.roads);
  (malformed[0].pts[0] as unknown[])[0] = { $roadProfileNegativeZero: true };
  assert.equal(wireJSON(malformed), wireJSON(f.roads), 'the adversarial object collides before source validation');
  let downloads = 0;
  const result = await warmPreparedRoadProfiles('https://example.invalid/city/', malformed, { manifest: packed.manifest, fetcher: async () => { downloads++; return new Response(packed.gzip); } });
  assert.equal(result.used, false);
  assert.equal(result.reason, 'binding-mismatch');
  assert.equal(downloads, 0);
});

test('lookalike payload markers with extra keys or a non-true tag remain invalid coordinates', async () => {
  for (const marker of [{ $roadProfileNegativeZero: true, extra: 1 }, { $roadProfileNegativeZero: false }, { $roadProfileNegativeZero: 'true' }]) {
    const f = fixture();
    (f.payload.patches[1].pts[0] as unknown[])[0] = marker;
    const packed = encode(f.roads, f.payload);
    const result = await warmPreparedRoadProfiles('https://example.invalid/city/', f.roads, { manifest: packed.manifest, fetcher: async () => new Response(packed.bytes) });
    assert.equal(result.used, false);
    assert.equal(roadGradeReport(f.roads), undefined);
    assert.equal(prepareRoadGrades(f.roads)[0].elev, null);
  }
});

test('server-decoded serialized cache preserves derived finite profiles and their report exactly', async () => {
  const raw = [road('independent-upper', 10), road('independent-lower', 50)];
  raw[0].pts = [[10, 10], [1010, 10]]; raw[0].elev = [6.8, 6.8];
  raw[1].pts = [[510, -490], [510, 510]];
  const before = JSON.stringify(raw), derived = prepareRoadGrades(raw);
  const payload: PreparedRoadCachePayload = { version: 1, sourceRoadCount: raw.length, patches: roadGradePatches(derived), report: roadGradeReport(derived)! };
  const packed = encode(raw, payload), cloned = structuredClone(raw);
  const result = await warmPreparedRoadProfiles('https://example.invalid/city/', cloned, { manifest: packed.manifest, fetcher: async () => new Response(packed.bytes, { headers: { 'content-type': 'application/wasm', 'content-encoding': 'gzip' } }) });
  assert.equal(result.used, true);
  const cached = prepareRoadGrades(cloned);
  assert.equal(JSON.stringify(cached), JSON.stringify(derived));
  assert.equal(JSON.stringify(roadGradeReport(cached)), JSON.stringify(payload.report));
  for (let r = 0; r < derived.length; r++) for (let i = 0; i < derived[r].pts.length; i++) {
    assert.equal(Object.is(cached[r].pts[i][0], derived[r].pts[i][0]), true);
    assert.equal(Object.is(cached[r].pts[i][1], derived[r].pts[i][1]), true);
    assert.equal(Object.is(cached[r].elev?.[i], derived[r].elev?.[i]), true);
  }
  assert.equal(JSON.stringify(raw), before);
});

test('build verification rejects disabled and oversized metadata before inspecting or changing artifacts', async () => {
  // Dynamic import preserves the compiler module's own import.meta.url guard
  // when the test runner bundles this test, without invoking its CLI entry.
  const { verifyRoadProfileCache } = await import(pathToFileURL(join(process.cwd(), 'scripts/compile-road-profile-cache.mjs')).href);
  const root = await mkdtemp(join(tmpdir(), 'roadster-independent-cache-gate-'));
  try {
    await mkdir(join(root, 'src/world'), { recursive: true });
    const file = join(root, 'src/world/road-profile-cache-manifest.json');
    await writeFile(file, JSON.stringify({ version: 1, enabled: false }));
    await assert.rejects(verifyRoadProfileCache(root), /Generate and review/);
    await writeFile(file, JSON.stringify({ version: 1, enabled: true, asset: 'road-profiles-v1.pack.wasm', payloadBytes: 32 * 1024 * 1024 + 1, gzipBytes: 10 }));
    await assert.rejects(verifyRoadProfileCache(root), /bounded startup format/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
