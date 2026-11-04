import { build } from 'esbuild';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const option = n => process.argv[process.argv.indexOf(n) + 1], output = option('--output'); assert.ok(process.argv.includes('--output') && output);
const minimum = process.argv.includes('--minimum-spread') ? Number(option('--minimum-spread')) : 0;
const folder = dirname(fileURLToPath(import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'joint-spread-xz-'));
const hash = async p => createHash('sha256').update(await readFile(p)).digest('hex');
try {
  const compiled = join(temp, 'probe.mjs');
  const built = await build({ entryPoints: [join(folder, 'export-joint-spread-xz.ts')], outfile: compiled, bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true, define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error' });
  const sourceHashes = Object.fromEntries(await Promise.all(Object.keys(built.metafile.inputs).filter(p => !p.includes('node_modules/')).map(async p => [p, await hash(p)])));
  const report = (await import(pathToFileURL(compiled))).emit(minimum);
  for (const [path, expected] of Object.entries(sourceHashes)) assert.equal(await hash(path), expected, 'imported source changed: ' + path);
  await writeFile(output, JSON.stringify({ measuredAt: new Date().toISOString(), sourceHashes, sourcesUnchanged: true, ...report }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, sha256: await hash(output), selected: report.queries.length, tiles: report.tileSummary.length, unmatched: report.unmatched.length, unresolved: report.queries.filter(q => q.unresolved.length).map(q => ({ node: q.node, reasons: q.unresolved })) }, null, 2));
} finally { await rm(temp, { recursive: true, force: true }); }
