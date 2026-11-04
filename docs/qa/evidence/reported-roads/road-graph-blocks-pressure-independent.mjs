import { build } from 'esbuild';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const folder = dirname(fileURLToPath(import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'graph-blocks-pressure-independent-'));
const output = process.argv[process.argv.indexOf('--output') + 1]; assert.ok(process.argv.includes('--output') && output, 'supply fresh --output');
const hash = async p => createHash('sha256').update(await readFile(p)).digest('hex');
try {
  const compiled = join(temp, 'probe.mjs');
  const built = await build({ entryPoints: [join(folder, 'road-graph-blocks-pressure-independent.ts')], outfile: compiled, bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true, define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error' });
  const sourceHashes = Object.fromEntries(await Promise.all(Object.keys(built.metafile.inputs).filter(p => !p.includes('node_modules/')).map(async p => [p, await hash(p)])));
  const result = (await import(pathToFileURL(compiled))).measure();
  for (const [p, expected] of Object.entries(sourceHashes)) assert.equal(await hash(p), expected, 'imported source changed: ' + p);
  await writeFile(output, JSON.stringify({ measuredAt: new Date().toISOString(), sourceHashes, sourcesUnchanged: true, ...result }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, sha256: await hash(output), cold: result.cold, warmed: result.warmed, travel: result.travel, hotAfterEviction: result.hotAfterEviction, finalResidency: result.finalResidency, summary: result.summary }, null, 2));
} finally { await rm(temp, { recursive: true, force: true }); }
