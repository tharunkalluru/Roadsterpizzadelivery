import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd(), output = resolve(process.argv[2] || '/tmp/road-cache-overlay-review');
await mkdir(output, { recursive: false });
const files = ['src/world/road-profile-cache.ts', 'src/world/road-grades.ts', 'src/world/road-model-overlay.ts', 'src/world/road-node-transport.ts', 'src/world/road-profile-corrections.ts',
  'src/world/types.ts', 'src/world/world.ts', 'src/world/tileworker.ts', 'src/main.ts', 'src/world/road-profile-corrections.json', 'src/world/road-profile-cache-manifest.json',
  'scripts/compile-road-profile-cache.mjs', 'scripts/verify-road-profile-corrections.mjs', 'scripts/build.mjs'];
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(join(root, file))).digest('hex')])));
const before = await hashes(), commands = [
  ['cache', process.execPath, ['scripts/test-v21-fixes.mjs', 'road-profile-cache'], 0],
  ['overlay', process.execPath, ['scripts/test-v21-fixes.mjs', 'road-model-overlay'], 0],
  ['independent', process.execPath, ['scripts/test-v21-fixes.mjs', 'road-cache-overlay-independent'], 0],
  ['typecheck', 'npm', ['run', 'typecheck'], 0],
  ['cache-disabled-gate', process.execPath, ['scripts/compile-road-profile-cache.mjs', '--verify'], 1],
  ['global-model-disabled-gate', process.execPath, ['scripts/verify-road-profile-corrections.mjs', '--hash-only'], 1],
];
const results = [];
for (const [name, executable, args, expected] of commands) {
  const run = spawnSync(executable, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  await writeFile(join(output, name + '.log'), run.stdout + run.stderr, { flag: 'wx' });
  results.push({ name, command: [executable, ...args], exitCode: run.status, expectedExitCode: expected, passed: run.status === expected });
}
const after = await hashes(), sourceStable = JSON.stringify(before) === JSON.stringify(after);
const result = { schemaVersion: 1, capturedAt: new Date().toISOString(), sourceCheckout: root, scope: 'Synthetic source/transport review only. Final activated geometry/cache artifact, HTTP/native and release acceptance remain open.', sourceStable, sourceHashes: after, results };
await writeFile(join(output, 'review.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, sourceStable, results: results.map(({ name, exitCode, passed }) => ({ name, exitCode, passed })) }));
if (!sourceStable || results.some(r => !r.passed)) process.exitCode = 1;
