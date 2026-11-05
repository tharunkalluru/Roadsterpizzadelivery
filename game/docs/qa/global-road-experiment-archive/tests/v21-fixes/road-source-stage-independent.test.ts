import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { applySourceRoadStage, SOURCE_ROAD_STAGE_DATA, SOURCE_ROAD_STAGE_MANIFEST } from '../../src/world/road-source-stage';
import { warmPreparedRoadProfiles, type RoadProfileCacheManifest } from '../../src/world/road-profile-cache';
import type { CoreData, RoadEdge } from '../../src/world/types';

const rawBytes = readFileSync('public/city/core.pack.wasm');
const raw = (): CoreData => JSON.parse(gunzipSync(rawBytes).toString());
const manifest = { ...SOURCE_ROAD_STAGE_MANIFEST, enabled: true };
const wire = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === 'number' && Object.is(item, -0) ? { $roadProfileNegativeZero: true } : item);
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

test('independent raw-core stage binds the reviewed corrected canonical array and remains geographically pure and idempotent', () => {
  assert.equal(sha(rawBytes), manifest.sourceCorePackSHA256);
  assert.equal(sha(readFileSync('src/world/road-source-geodesic-data.json')), manifest.dataSHA256);
  const core = raw(), before = wire(core), normalized = applySourceRoadStage(core, manifest);
  assert.equal(normalized.sourceRoadGeometryGeneration, manifest.generationID);
  assert.equal(sha(wire(normalized.roads)), '6455a4f49967643f8f3dbba6ac01f5d8fb789059482936429afdbb7f027540c0');
  assert.equal(normalized.roads.length, core.roads.length);
  for (const key of ['metro', 'food', 'theatres', 'drops', 'places', 'packs', 'trafficSignals'] as const) assert.equal(normalized[key], core[key]);
  assert.equal(wire(core), before);
  assert.equal(applySourceRoadStage(normalized, manifest), normalized);
  assert.equal(applySourceRoadStage(core, { ...manifest, enabled: false }), core, 'Disabled startup retains the legacy source by identity');
});

test('independent stage rejects missing repair roads/nodes and every stale incident arm atomically', () => {
  const expected = SOURCE_ROAD_STAGE_DATA.roads.filter(p => p.copies.some(c => c.kind === 'core'));
  for (const kind of ['missing-road', 'missing-node', 'duplicate-road', 'stale-road', 'unreviewed-arm']) {
    const core = raw();
    if (kind === 'missing-road') core.roads = core.roads.filter(e => e.id !== expected[0].id);
    if (kind === 'missing-node') delete core.nodes[Object.keys(SOURCE_ROAD_STAGE_DATA.nodes)[0]];
    if (kind === 'duplicate-road') core.roads.push(structuredClone(core.roads[0]));
    if (kind === 'stale-road') core.roads.find(e => e.id === expected[0].id)!.pts[0][0] += .2;
    if (kind === 'unreviewed-arm') core.roads.push({ ...structuredClone(core.roads.find(e => e.id === expected[0].id)!), id: 'extra-stale-arm' });
    const before = wire(core);
    assert.throws(() => applySourceRoadStage(core, manifest), /inventory|junction|binding mismatch/, kind);
    assert.equal(wire(core), before, kind);
    assert.equal(core.sourceRoadGeometryGeneration, undefined, kind);
  }
});

test('independent source-generation mismatches and reapplication to conditioned geometry fail without mutation', () => {
  const source = raw(), normalized = applySourceRoadStage(source, manifest);
  for (const change of [{ version: 2 }, { generationID: '0'.repeat(64) }, { sourceCorePackSHA256: '0'.repeat(64) }, { dataSHA256: 'invalid' }]) {
    assert.throws(() => applySourceRoadStage(source, { ...manifest, ...change } as typeof manifest), /generation mismatch/);
  }
  const stale = { ...source, sourceRoadGeometryGeneration: '0'.repeat(64) };
  assert.throws(() => applySourceRoadStage(stale, manifest), /generation mismatch/);
  assert.throws(() => applySourceRoadStage(normalized, { ...manifest, enabled: false }), /disabled/);
  const conditioned = structuredClone(normalized), repaired = conditioned.roads.find(e => e.id === SOURCE_ROAD_STAGE_DATA.roads.find(p => p.copies.some(c => c.kind === 'core'))!.id)!;
  repaired.elev = repaired.pts.map(() => 100);
  const before = wire(conditioned);
  assert.throws(() => applySourceRoadStage(conditioned, manifest), /binding mismatch/);
  assert.equal(wire(conditioned), before, 'Conditioned-core fixtures must skip the raw-source stage');
});

test('independent cache binding rejects missing/stale source generations before downloading and accepts the matching generation', async () => {
  const normalized = applySourceRoadStage(raw(), manifest);
  const payload = { version: 1, sourceRoadCount: normalized.roads.length, patches: [] }, bytes = Buffer.from(wire(payload)), gzip = gzipSync(bytes);
  const cache: RoadProfileCacheManifest = { version: 1, enabled: true, asset: 'road-profiles-v1.pack.wasm', sourceRoadCount: normalized.roads.length,
    sourceRoadsSha256: sha(wire(normalized.roads)), sourceCorePackSha256: sha(rawBytes), generatorInputsSha256: 'a'.repeat(64), sourceRoadGeometryGeneration: normalized.sourceRoadGeometryGeneration,
    payloadSha256: sha(bytes), payloadBytes: bytes.length, gzipSha256: sha(gzip), gzipBytes: gzip.length };
  let downloads = 0, installs = 0;
  const fetcher = async () => { downloads++; return new Response(gzip); }, install = (_roads: RoadEdge[]) => { installs++; return true; };
  assert.equal((await warmPreparedRoadProfiles('https://source-independent.invalid/city/', normalized.roads, { manifest: cache, fetcher, install })).reason, 'binding-mismatch');
  assert.equal((await warmPreparedRoadProfiles('https://source-independent.invalid/city/', normalized.roads, { manifest: cache, fetcher, install, sourceRoadGeometryGeneration: '0'.repeat(64) })).reason, 'binding-mismatch');
  assert.equal(downloads, 0); assert.equal(installs, 0);
  assert.deepEqual(await warmPreparedRoadProfiles('https://source-independent.invalid/city/', normalized.roads, { manifest: cache, fetcher, install, sourceRoadGeometryGeneration: normalized.sourceRoadGeometryGeneration }), { used: true, reason: 'installed' });
  assert.equal(downloads, 1); assert.equal(installs, 1);
});

test('source repair generator and provenance files participate in inferred model invalidation', async () => {
  const { roadProfileInputFiles } = await import(new URL('../../scripts/road-profile-inputs.mjs', `file://${process.cwd()}/tests/v21-fixes/source-independent.test.ts`).href);
  const files = await roadProfileInputFiles(process.cwd());
  for (const file of ['src/world/road-source-stage.ts', 'src/world/road-source-stage-manifest.json', 'src/world/road-source-geodesic.ts', 'src/world/road-source-geodesic-data.json',
    'scripts/preflight-road-source-geodesic.py', 'scripts/generate-road-source-geodesic.py', 'scripts/verify-road-source-geodesic.mjs', 'scripts/audit-road-source-geodesic-known-nodes.py',
    'docs/qa/evidence/reported-roads/geodetic-source-repair-20261103/preflight.json', 'docs/qa/evidence/reported-roads/tile-boundary-source-audit-20261103/retained-source-2026-10-21.json',
    'docs/qa/evidence/reported-roads/tile-boundary-source-audit-20261103/classification.json', 'docs/qa/evidence/reported-roads/all-tile-only-node-height-boundaries.json']) assert.ok(files.includes(file), file);
});
