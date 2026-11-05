// Scenery changes exclusion margins only. This grants no height or fit approval.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const SHA = /^[a-f0-9]{64}$/;
const keys = ['dataSHA256', 'numericalSourceModelSHA256', 'physicalSourceGeneration',
  'sourceInputVariantPreparationGeneration', 'sourceBoundAuthoritySHA256', 'sourceCopyContractSHA256'];

export async function validateFittedHighBranchScenery({ root, preparation, geometryManifest,
  sceneryManifest, readBound }) {
  assert.equal(typeof readBound, 'function');
  const binding = sceneryManifest.binding;
  assert.deepEqual(Object.keys(binding).sort(), [...keys].sort(), 'Exact six-field scenery binding required');
  assert.ok(keys.every(key => typeof binding[key] === 'string' && SHA.test(binding[key])));
  assert.equal(binding.numericalSourceModelSHA256, geometryManifest.binding.modelInputSHA256);
  assert.equal(binding.numericalSourceModelSHA256, preparation.currentInputHashes.model);
  for (const key of ['physicalSourceGeneration', 'sourceInputVariantPreparationGeneration']) {
    assert.equal(binding[key], geometryManifest.binding[key], 'Scenery generation differs: ' + key);
  }
  assert.ok(Object.values(preparation.currentInputHashes).includes(binding.sourceBoundAuthoritySHA256),
    'Scenery bounds authority is absent from the actual numerical input tuple');
  const source = JSON.parse(await readBound(preparation.inputs.sourceCopyManifest.path,
    preparation.inputs.sourceCopyManifest.sha256));
  assert.equal(source.binding.sourceDataSHA256, preparation.currentInputHashes.source);
  assert.equal(binding.sourceCopyContractSHA256, source.binding.contractDataSHA256);
  for (const key of ['physicalSourceGeneration', 'sourceInputVariantPreparationGeneration']) {
    assert.equal(binding[key], source.binding[key]);
  }
  assert.equal(sceneryManifest.data.sha256, binding.dataSHA256);
  const declared = sceneryManifest.sourceBoundAuthority ||
    Object.entries(sceneryManifest.allSourceInputs || {}).map(([path, sha256]) => ({ path, sha256 }))
      .find(item => item.sha256 === binding.sourceBoundAuthoritySHA256);
  assert.ok(declared && declared.sha256 === binding.sourceBoundAuthoritySHA256,
    'Exact readable scenery bounds authority is required');
  await readBound(declared.path, declared.sha256);
  const bytes = await readBound(sceneryManifest.data.path, binding.dataSHA256);
  const contract = await readBound(source.runtimeContract.path, binding.sourceCopyContractSHA256);
  // Execute the current production constructor, not a caller-supplied factory.
  const temporary = await mkdtemp(join(tmpdir(), 'fitted-scenery-validation-'));
  try {
    const bundle = join(temporary, 'scenery.mjs');
    const compiledPaths = new Set();
    const compiled = await build({ absWorkingDir: root, entryPoints: [resolve(root, 'src/world/declared-high-branch-road-scenery.ts')],
      outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node22',
      metafile: true, logLevel: 'error', plugins: [{ name: 'held-scenery-source', setup(builder) {
        builder.onLoad({ filter: /\.[cm]?[jt]s$/ }, async ({ path }) => {
          const contents = await readBound(path); compiledPaths.add(resolve(path));
          return { contents, loader: path.endsWith('.ts') ? 'ts' : 'js' };
        });
      } }] });
    for (const path of Object.keys(compiled.metafile.inputs)) {
      assert.ok(compiledPaths.has(resolve(root, path)), 'A compiled scenery source escaped the held-byte loader');
    }
    for (const path of compiledPaths) await readBound(path);
    const { createDeclaredHighBranchRoadScenery } = await import(pathToFileURL(bundle));
    const stage = await createDeclaredHighBranchRoadScenery(bytes, binding, contract);
    for (const path of compiledPaths) await readBound(path);
    assert.equal(stage.requiresSeparateAcceptedFit, true);
    assert.equal(stage.noNumericalHeightOrPavementAuthority, true);
    return stage;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
