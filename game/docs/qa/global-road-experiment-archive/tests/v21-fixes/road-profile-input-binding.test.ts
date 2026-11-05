import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { ROAD_PROFILE_INPUTS, roadProfileInputFingerprint } from '../../scripts/road-profile-inputs.mjs';

test('profile binding detects a newly added conditioning helper while generated profile/cache data do not self-invalidate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'road-profile-input-binding-'));
  const write = async (file: string, value: string) => { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), value); };
  try {
    for (const file of ROAD_PROFILE_INPUTS) await write(file, file);
    await write('src/world/road-grades.ts', 'initial preparation');
    const before = await roadProfileInputFingerprint(root);
    await write('src/world/new-rail-conditioning-helper.ts', 'new physical conditioning');
    const withHelper = await roadProfileInputFingerprint(root);
    assert.notEqual(withHelper, before, 'a new imported geometry helper must invalidate solved data without a manual list edit');
    await write('src/world/road-profile-corrections.json', 'generated reviewed output');
    await write('src/world/road-profile-cache-manifest.json', 'generated cache manifest');
    await write('public/city/road-profiles-v1.pack.wasm', 'generated prepared cache');
    assert.equal(await roadProfileInputFingerprint(root), withHelper, 'generated outputs cannot be circular generator inputs');
    await write('public/city/packs/p0_0.pack.wasm', 'tile-only source street');
    const withTileSource = await roadProfileInputFingerprint(root);
    assert.notEqual(withTileSource, withHelper, 'a tile-only source change must invalidate modeled node transport');
    await write('src/world/new-rail-conditioning-helper.ts', 'changed physical conditioning');
    assert.notEqual(await roadProfileInputFingerprint(root), withTileSource, 'helper implementation changes invalidate solved data');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('profile generation rejects a stale whole-world solution before touching the generated runtime data', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'road-profile-stale-solve-'));
  const generated = join(process.cwd(), 'src/world/road-profile-corrections.json');
  const before = await readFile(generated);
  try {
    const original = JSON.stringify({ roads: [], fixedCrossingDatum: 0 });
    const changed = JSON.stringify({ roads: [], fixedCrossingDatum: 1 });
    const input = join(temp, 'input.json'), solution = join(temp, 'solution.json');
    await writeFile(input, changed);
    await writeFile(solution, JSON.stringify({ success: true, roads: [], sourceModelSHA256: createHash('sha256').update(original).digest('hex') }));
    const result = spawnSync(process.execPath, ['scripts/generate-road-profile-corrections.mjs', '--solution', solution, '--input-model', input, '--stage', 'conditionedWorld'], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not bound to this exact ordinary-conditioned input model/);
    assert.deepEqual(await readFile(generated), before, 'a stale solve cannot replace the held generated data');
  } finally { await rm(temp, { recursive: true, force: true }); }
});
