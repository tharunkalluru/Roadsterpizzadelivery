import { build } from 'esbuild';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)), output = process.argv[2];
if (!output) throw Error('Supply a new output receipt path.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), bindings = {};
async function held(file, expected) { const bytes = await readFile(file), h = sha(bytes); if (expected && h !== expected) throw Error(`Input changed ${file}`); bindings[file] = h; return bytes; }
const bindingPath = '/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/jointBindingBaseline21-d3256b22a8a923b862f0e0e86bd95269eba9938dfd7528062f53df633f14f128.json';
const binding = JSON.parse(await held(bindingPath, 'd3256b22a8a923b862f0e0e86bd95269eba9938dfd7528062f53df633f14f128'));
for (const item of [binding.coreOrdinaryManifest, binding.jointGeometryInput, ...Object.values(binding.references)]) await held(item.path, item.sha256);
for (const [file, expected] of Object.entries(binding.runtimeGeometrySourceFiles)) await held(resolve(root, file), expected);
await held(fileURLToPath(import.meta.url));
await held(resolve(root, 'src/world/road-profile-cache-manifest.json'));
await held('/tmp/road-historical-joint-487-tile-806-context-505-core-9413-v3.json', 'd746a980fcb73574f5759f779e487b68f7dac54794edaabd33f35ef6562ebd90');
const temp = await mkdtemp(join(tmpdir(), 'physical-width-independent-'));
try {
  const compiled = join(temp, 'probe.mjs');
  const built = await build({ entryPoints: [resolve(root, 'scripts/qa/physical-width-worker-independent.ts')], outfile: compiled, bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true, define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error' });
  for (const file of Object.keys(built.metafile.inputs).filter(p => !p.includes('node_modules/'))) await held(resolve(root, file));
  const result = await (await import(pathToFileURL(compiled).href)).run();
  for (const [file, expected] of Object.entries(result.sourcePackHashes)) await held(file, expected);
  for (const [file, expected] of Object.entries(bindings)) if (sha(await readFile(file)) !== expected) throw Error(`Input changed during probe: ${file}`);
  const report = { ...result, beforeAfterUnchangedInputs: bindings, nodeVersion: process.version };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, sha256: sha(await readFile(output)), pass: result.pass, summary: result.summary, failures: result.failures }));
  process.exitCode = result.pass ? 0 : 1;
} finally { await rm(temp, { recursive: true, force: true }); }
