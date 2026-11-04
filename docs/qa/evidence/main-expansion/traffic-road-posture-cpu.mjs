import { build } from 'esbuild';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const folder = dirname(fileURLToPath(import.meta.url)), temporary = await mkdtemp(join(tmpdir(), 'traffic-road-posture-cpu-'));
try {
  const output = join(temporary, 'cpu.mjs');
  const built = await build({ entryPoints: [join(folder, 'traffic-road-posture-cpu.ts')], outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true, define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error' });
  const hashes = Object.fromEntries(await Promise.all(Object.keys(built.metafile.inputs).filter(f => !f.includes('node_modules/')).map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
  const cpu = await import(pathToFileURL(output)), samples = [];
  for (let i = 0; i < 2; i++) { cpu.sample(false); cpu.sample(true); }
  for (let i = 0; i < 8; i++) {
    const order = i % 2 ? ['off', 'on'] : ['on', 'off'], values = {};
    for (const mode of order) values[mode] = cpu.sample(mode === 'off');
    assert.deepEqual(values.on.final, values.off.final, 'the measured same fleet must retain exact kinematics');
    assert.equal(values.on.seconds, values.off.seconds); assert.equal(values.on.vehicles, 55); assert.equal(values.off.vehicles, 55);
    delete values.on.final; delete values.off.final;
    samples.push({ i, order, ...values, deltaMillisecondsPerFrame: values.on.millisecondsPerFrame - values.off.millisecondsPerFrame, deltaMicrosecondsPerVehicle: values.on.microsecondsPerVehicle - values.off.microsecondsPerVehicle });
  }
  const median = values => { const a = [...values].sort((a, b) => a - b); return (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2; };
  const report = { measuredAt: new Date().toISOString(), scope: 'Paired warmed desktop Node Traffic.update CPU, same55 actual bus/auto/car fleet on1500 finite two-metre changing-grade road spans; no oracle inside any timed loop. Absolute CPU observations only, not mobile FPS.', sourceHashes: hashes,
    summary: { samples: samples.length, vehicles: 55, onMillisecondsPerFrame: median(samples.map(s => s.on.millisecondsPerFrame)), offMillisecondsPerFrame: median(samples.map(s => s.off.millisecondsPerFrame)), pairedDeltaMillisecondsPerFrame: median(samples.map(s => s.deltaMillisecondsPerFrame)), pairedDeltaMicrosecondsPerVehicle: median(samples.map(s => s.deltaMicrosecondsPerVehicle)), deltaRangeMillisecondsPerFrame: [Math.min(...samples.map(s => s.deltaMillisecondsPerFrame)), Math.max(...samples.map(s => s.deltaMillisecondsPerFrame))], exactKinematicParity: true }, samples };
  await writeFile(join(folder, 'traffic-road-posture-cpu.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report.summary));
} finally { await rm(temporary, { recursive: true, force: true }); }
