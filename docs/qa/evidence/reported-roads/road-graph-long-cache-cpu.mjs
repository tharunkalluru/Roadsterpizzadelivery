// Run from the repository root with --model INPUT.json --output NEW_REPORT.json.
import { build } from 'esbuild';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const folder = dirname(fileURLToPath(import.meta.url)), temporary = await mkdtemp(join(tmpdir(), 'road-graph-long-cache-cpu-'));
try {
  const out = join(temporary, 'probe.mjs');
  const built = await build({ entryPoints: [join(folder, 'road-graph-long-cache-cpu.ts')], outfile: out, bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true,
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error' });
  const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
  const sourceHashes = Object.fromEntries(await Promise.all(Object.keys(built.metafile.inputs).filter(file => !file.includes('node_modules/')).map(async file => [file, await hash(file)])));
  const result = spawnSync(process.execPath, [out, ...process.argv.slice(2)], { cwd: process.cwd(), stdio: 'inherit' });
  assert.equal(result.status, 0, 'bounded CPU probe failed');
  for (const [file, expected] of Object.entries(sourceHashes)) assert.equal(await hash(file), expected, 'probe input changed: ' + file);
  const outputIndex = process.argv.indexOf('--output');
  assert.ok(outputIndex >= 0 && process.argv[outputIndex + 1]);
  const file = process.argv[outputIndex + 1], report = JSON.parse(await readFile(file, 'utf8'));
  report.sourceHashes = sourceHashes; report.sourcesUnchanged = true;
  await writeFile(file, JSON.stringify(report, null, 2) + '\n');
} finally { await rm(temporary, { recursive: true, force: true }); }
