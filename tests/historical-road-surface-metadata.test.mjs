import test from 'node:test';
import assert from 'node:assert/strict';
import { literalHistoricalSurfaceMetadata, appendHistoricalSurfaceRecord,
  assertHistoricalMetadataParity, legacyHistoricalTriangle } from '../scripts/historical-road-surface-metadata.mjs';

const surface = (paintLift = .062) => ({ e: { id: 'mixed-class-road', pts: [[0, 0], [2, 0]], cls: 'service' }, i: 0, paintLift,
  roadQuad: [[0, 0, -1], [2, 0, -1], [2, 0, 1], [0, 0, 1]] });
const legacy = () => ({ road: 'mixed-class-road', points: [[0, .062, -1], [2, .062, -1], [2, .062, 1]],
  arc: [0, 2], centre: [[0, 0], [2, 0]], tile: '0_0', cap: false });

test('historical metadata uses the literal mixed-class Surface film, including clipped strips', () => {
  const s = surface(), metadata = literalHistoricalSurfaceMetadata(s, 'source-road', [0, 2]);
  assert.equal(metadata.paintLift, .062); // own service class must never supply .045
  assert.deepEqual(metadata.structuralQuad, s.roadQuad);
  assert.notEqual(metadata.structuralQuad, s.roadQuad);
  assert.deepEqual(metadata.sourceArc, [0, 2]);
  for (const bad of [undefined, null, NaN, Infinity]) assert.throws(() => literalHistoricalSurfaceMetadata({ ...s, paintLift: bad }, 'source-road', [0, 2]));
  assert.throws(() => literalHistoricalSurfaceMetadata({ ...s, roadQuad: [[0, 0, 0]] }, 'source-road', [0, 2]));
});

test('historical dedup checks datums before skipping equivalent owner/context origins', () => {
  const registry = new Map(), triangles = [], a = literalHistoricalSurfaceMetadata(surface(), 'source-road', [0, 2]);
  appendHistoricalSurfaceRecord(registry, triangles, 'old-token', legacy(), a);
  assert.deepEqual(appendHistoricalSurfaceRecord(registry, triangles, 'old-token', { ...legacy(), tile: '1_0' }, structuredClone(a)), { duplicate: true, distinctBinding: false });
  assert.equal(triangles.length, 1); assert.equal(triangles[0].tile, '0_0');
  const b = { ...a, paintLift: .045 };
  assert.equal(appendHistoricalSurfaceRecord(registry, triangles, 'old-token', legacy(), b).distinctBinding, true);
  const c = { ...a, structuralQuad: a.structuralQuad.map(p => [p[0], p[1] + .017, p[2]]) };
  assert.equal(appendHistoricalSurfaceRecord(registry, triangles, 'old-token', legacy(), c).distinctBinding, true);
  const d = { ...a, sourceArc: [4, 6] };
  assert.equal(appendHistoricalSurfaceRecord(registry, triangles, 'old-token', legacy(), d).distinctBinding, true);
  assert.equal(triangles[0].actualSurfaceBindings.length, 4);
  assert.deepEqual(legacyHistoricalTriangle(triangles[0]), legacy());
});

test('metadata parity rejects changed old points, order, copy hashes and ROI', () => {
  const parent = { triangles: [legacy(), { ...legacy(), road: 'second' }], roads: [{ id: 'a' }], physicalFootprints: [{ id: 'a' }],
    copies: [{ emittedSHA256: 'old-hash' }], summary: { builtTiles: 620 }, coverageRegion: { paddingM: 40 }, inputs: { original: 'old' }, generatorSHA256: 'old' };
  const replay = structuredClone(parent); replay.inputs = { current: 'new' }; replay.generatorSHA256 = 'new';
  replay.triangles.forEach(t => t.actualSurface = literalHistoricalSurfaceMetadata(surface(), 'source-road', [0, 2]));
  assert.equal(assertHistoricalMetadataParity(parent, replay).triangles, 2);
  for (const mutate of [r => r.triangles[0].points[0][0] += .001, r => r.triangles.reverse(),
    r => r.copies[0].emittedSHA256 = 'changed', r => r.coverageRegion.paddingM = 39]) {
    const r = structuredClone(replay); mutate(r); assert.throws(() => assertHistoricalMetadataParity(parent, r));
  }
});
