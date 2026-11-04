import { build } from 'esbuild';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const folder = dirname(fileURLToPath(import.meta.url)), temporary = await mkdtemp(join(tmpdir(), 'traffic-curve-support-cpu-'));
try {
  const output = join(temporary, 'cpu.mjs');
  const built = await build({ entryPoints: [join(folder, 'traffic-curve-support-cpu.ts')], outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true,
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error' });
  const hash = file => readFile(file).then(bytes => createHash('sha256').update(bytes).digest('hex'));
  const hashes = Object.fromEntries(await Promise.all(Object.keys(built.metafile.inputs).filter(file => !file.includes('node_modules/')).map(async file => [file, await hash(file)])));
  const cpu = await import(pathToFileURL(output)), samples = [];
  for (let i = 0; i < 3; i++) { cpu.sample(false); cpu.sample(true); cpu.coldSample(); }
  for (let i = 0; i < 8; i++) {
    const order = i % 2 ? ['off', 'on'] : ['on', 'off'], values = {};
    for (const mode of order) values[mode] = cpu.sample(mode === 'on');
    assert.equal(values.on.queries, values.off.queries);
    samples.push({ i, order, ...values, deltaMillisecondsPer55Queries: values.on.millisecondsPerFrame - values.off.millisecondsPerFrame,
      cold: cpu.coldSample() });
  }
  for (const [file, expected] of Object.entries(hashes)) assert.equal(await hash(file), expected, 'benchmark source changed: ' + file);
  const median = values => { const sorted = [...values].sort((a, b) => a - b); return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2; };
  const report = { measuredAt: new Date().toISOString(), scope: 'Paired warmed desktop Node TrafficCurve.sample CPU on55 separately cached curves over actual buildTile finite nonlinear asphalt. Cold sampler/lookup separately measured. No Traffic.update, GPU, phone FPS, whole-world or thermal claim.',
    sourceHashes: hashes, sourcesUnchanged: true,
    summary: { samples: samples.length, queriesPerSample: samples[0].on.queries,
      onMillisecondsPer55Queries: median(samples.map(s => s.on.millisecondsPerFrame)), offMillisecondsPer55Queries: median(samples.map(s => s.off.millisecondsPerFrame)),
      pairedDeltaMillisecondsPer55Queries: median(samples.map(s => s.deltaMillisecondsPer55Queries)),
      coldMicrosecondsPerSamplerAndLookup: median(samples.map(s => s.cold.microsecondsPerColdSamplerAndLookup)) }, samples };
  await writeFile(join(folder, 'traffic-curve-support-cpu.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.summary));
} finally { await rm(temporary, { recursive: true, force: true }); }
