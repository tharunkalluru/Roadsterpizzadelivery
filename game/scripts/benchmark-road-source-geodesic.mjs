import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { cpus, tmpdir, platform, arch } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const at = process.argv.indexOf('--output'), output = at < 0 ? undefined : process.argv[at + 1];
if (!output) throw Error('Use --output NEW_FILE. This benchmark does not activate source corrections.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = await readFile(join(root, 'src/world/road-source-geodesic-data.json')), data = JSON.parse(bytes);
const patches = new Map(data.roads.map(p => [p.id, p])), candidates = [];
const temp = await mkdtemp(join(tmpdir(), 'source-geodesic-benchmark-'));
try {
  const file = join(temp, 'api.mjs');
  await build({ stdin: { contents: `export * from './src/world/road-source-geodesic';`, resolveDir: root, loader: 'ts' }, outfile: file, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'error' });
  const api = await import(pathToFileURL(file));
  for (const [pack, expectedHash] of Object.entries(data.sourcePackSHA256)) {
    const packed = await readFile(join(root, 'public/city', pack));
    if (hash(packed) !== expectedHash) throw Error('Source pack changed: ' + pack);
    for (const [key, zone] of Object.entries(JSON.parse(gunzipSync(packed)).tiles)) {
      const affected = zone.roads.filter(r => patches.has(r.id));
      candidates.push({ pack, tile: key, zone, affectedRoads: affected.length,
        correctedPoints: affected.reduce((sum, r) => sum + patches.get(r.id).pts.length, 0),
        hasChangedNode: Object.keys(zone.nodes).some(id => data.nodes[id]) });
    }
  }
  const chosen = [
    ['pv_bridge', candidates.find(c => c.zone.roads.some(r => r.id === '370065ed-0cb_0'))],
    ['most_affected_roads', [...candidates].sort((a, b) => b.affectedRoads - a.affectedRoads)[0]],
    ['most_corrected_points', [...candidates].sort((a, b) => b.correctedPoints - a.correctedPoints)[0]],
    ['unaffected_large_tile', candidates.filter(c => !c.affectedRoads && !c.hasChangedNode).sort((a, b) => b.zone.roads.length - a.zone.roads.length)[0]],
  ];
  const percentile = (values, p) => values[Math.min(values.length - 1, Math.floor(p * values.length))];
  function measure(fn, samples = 161, batch = 3) {
    for (let i = 0; i < 30; i++) fn();
    const times = [], cpuBefore = process.cpuUsage(), started = performance.now();
    for (let i = 0; i < samples; i++) {
      const t = performance.now();
      for (let j = 0; j < batch; j++) fn();
      times.push((performance.now() - t) / batch);
    }
    const elapsed = performance.now() - started, cpu = process.cpuUsage(cpuBefore); times.sort((a, b) => a - b);
    return { samples, batch, calls: samples * batch, medianMs: percentile(times, .5), p95Ms: percentile(times, .95), p99Ms: percentile(times, .99), maximumMs: times.at(-1), averageMs: times.reduce((a, b) => a + b, 0) / times.length,
      cpuMsPerCall: (cpu.user + cpu.system) / 1000 / (samples * batch), elapsedMs: elapsed };
  }
  const validationOnly = measure(() => { if (api.sourceRoadGeometryErrors(data).length) throw Error('Invalid data'); });
  const results = [];
  for (const [name, selected] of chosen) {
    if (!selected) throw Error('Missing representative source pack case: ' + name);
    const { zone } = selected, normalized = api.applyVerifiedSourceRoadZone(zone, data);
    if (normalized.report.mismatched.length) throw Error('Representative source stage mismatch.');
    const baseline = measure(() => zone);
    const source = measure(() => { const value = api.applyVerifiedSourceRoadZone(zone, data); if (value.report.mismatched.length) throw Error('Source mismatch'); });
    const repeated = measure(() => { const value = api.applyVerifiedSourceRoadZone(normalized.value, data); if (value.value !== normalized.value || value.report.mismatched.length) throw Error('Idempotence mismatch'); });
    results.push({ name, pack: selected.pack, tile: selected.tile, roads: zone.roads.length, affectedRoads: selected.affectedRoads, correctedPoints: selected.correctedPoints,
      nodeChanges: normalized.report.nodesApplied.length, disabledStageIdentity: baseline, rawSourceStage: source, idempotentSourceStage: repeated });
  }
  const report = { scope: 'Incremental decoded-tile source-stage cost on this desktop Node process. Excludes pack download/decompression, mesh generation, browser worker concurrency, GPU, physical-phone performance/heat and FPS.',
    generatedAt: new Date().toISOString(), environment: { platform: platform(), architecture: arch(), node: process.version, cpu: cpus()[0]?.model, logicalCPUs: cpus().length },
    generationID: data.generationID, datasetSHA256: hash(bytes), moduleSHA256: hash(await readFile(join(root, 'src/world/road-source-geodesic.ts'))), validationOnly, results };
  await writeFile(resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ validationMedianMs: validationOnly.medianMs, validationP95Ms: validationOnly.p95Ms, cases: results.map(c => ({ name: c.name, tile: c.tile, roads: c.roads, affected: c.affectedRoads, medianMs: c.rawSourceStage.medianMs, p95Ms: c.rawSourceStage.p95Ms, maxMs: c.rawSourceStage.maximumMs, bypassMedianMs: c.disabledStageIdentity.medianMs })) }, null, 2));
} finally { await rm(temp, { recursive: true, force: true }); }
