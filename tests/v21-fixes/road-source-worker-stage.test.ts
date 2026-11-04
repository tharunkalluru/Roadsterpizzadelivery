import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { World } from '../../src/world/world';
import { prepareRoadGrades } from '../../src/world/road-grades';
import { applyVerifiedSourceRoadZone, type VerifiedSourceRoadGeometry } from '../../src/world/road-source-geodesic';
import sourceData from '../../src/world/road-source-geodesic-data.json';
import { verifiedProfileData } from '../../src/world/road-profile-corrections';
import type { CoreData } from '../../src/world/types';
import { actualWorldWorker } from '../fixtures/actual-world-worker';

test('World rejects a stale source generation before constructing or conditioning a city', () => {
  const core = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()) as CoreData;
  core.sourceRoadGeometryGeneration = '0'.repeat(64);
  const before = JSON.stringify(core);
  assert.throws(() => new World(core, {}, { lowQ: true, base: 'https://road-release-fixture.invalid/city/' }), /Core source road geometry generation mismatch/);
  assert.equal(JSON.stringify(core), before);
});

test('actual worker normalizes raw source geometry before final core patches and rejects a mismatched restart generation', async t => {
  const raw = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()) as CoreData;
  const data = sourceData as unknown as VerifiedSourceRoadGeometry;
  const normalized = applyVerifiedSourceRoadZone(raw, data);
  assert.deepEqual(normalized.report.mismatched, []);
  assert.equal(normalized.report.applied.length, data.roads.filter(p => p.copies.some(c => c.kind === 'core')).length);
  const core = normalized.value;
  core.sourceRoadGeometryGeneration = data.generationID;
  core.roads = prepareRoadGrades(core.roads);
  const runtime = await actualWorldWorker({ reuseCore: core, allowInactive: true });
  try {
    assert.equal(runtime.initialization.sourceRoadGeometryGeneration, data.generationID);
    const keys = [...new Set(data.roads.flatMap(p => p.copies.filter(c => c.tile).map(c => c.tile!)))].slice(0, 3);
    let checkedEnds = 0;
    for (const key of keys) {
      const built = await runtime.build(key);
      const roads = new Map([...built.surfaceGrid.values()].flat().filter(s => s.e).map(s => [s.e!.id, s.e!]));
      for (const e of roads.values()) for (const [node, index] of [[e.from, 0], [e.to, e.pts.length - 1]] as const) {
        if (!node || !data.nodes[node]) continue;
        const target = runtime.world.modeledRoadReport.active ? verifiedProfileData.geometry?.nodes[node]?.after ?? data.nodes[node].after : data.nodes[node].after;
        assert.ok(Math.hypot(e.pts[index][0] - target[0], e.pts[index][1] - target[1]) < 1e-7, `Actual source/core/tile endpoint differs: ${e.id}`);
        checkedEnds++;
      }
    }
    assert.ok(checkedEnds > 0, 'Exercise actual emitted source-corrected road endpoints');
    const packCount = Object.keys(runtime.sourcePackHashes).length;
    runtime.initialization.sourceRoadGeometryGeneration = '0'.repeat(64);
    await assert.rejects(runtime.build(keys[0]), /Tile source road geometry generation mismatch/);
    assert.equal(Object.keys(runtime.sourcePackHashes).length, packCount, 'Reject a bad generation before fetching another pack');
    runtime.initialization.sourceRoadGeometryGeneration = data.generationID;
    const recovered = await runtime.build(keys[0]);
    assert.equal(recovered.key, keys[0], 'A valid reinitialization clears the error without poisoning cached raw packs');
    runtime.verifySources();
    t.diagnostic(JSON.stringify({ sourceGeneration: data.generationID, tiles: keys, checkedEnds, inferredModelActive: runtime.world.modeledRoadReport.active, scope: 'Explicit source-stage integration; final global model acceptance remains separate' }));
  } finally { runtime.dispose(); }
});
