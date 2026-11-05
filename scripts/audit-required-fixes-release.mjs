// Scoped release: preserve the live road inputs/pipeline; do not select the
// unfinished global reconstruction. Its separate lab gate remains unchanged.
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(await readFile(resolve(root, 'docs/qa/required-fixes-road-baseline-20261105.json')));
assert.equal(baseline.schema, 'stable-road-baseline-for-required-game-fixes-v1');
assert.equal(baseline.globalRoadReconstructionSelected, false);
assert.equal(baseline.rawPacks, 304);
for (const binding of baseline.files) {
  const bytes = await readFile(resolve(root, binding.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), binding.sha256,
    'The stable road baseline changed: ' + binding.path);
}
for (const file of ['src/world/road-profile-corrections.json', 'src/world/road-source-stage-manifest.json',
  'src/world/road-model-overlay.ts', 'src/world/accepted-native-road-cache.ts']) {
  await assert.rejects(access(resolve(root, file)), 'An unfinished road model entered the scoped release: ' + file);
}
console.log('Required-fix release: live road inputs and preparation retained; global road experiment excluded.');
