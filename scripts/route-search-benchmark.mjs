// Real core-graph route identity and cooperative-slice diagnostic, not game FPS.
import { build } from 'esbuild';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = process.cwd(), temporary = await mkdtemp(join(tmpdir(), 'roadster-route-search-'));
try {
  const bundle = join(temporary, 'routes.mjs');
  await build({ stdin: { contents: `export {RoadGraph} from ${JSON.stringify(resolve('src/game/roadgraph.ts'))}; export {legacyRoute} from ${JSON.stringify(resolve('tests/fixtures/sim-route-legacy.ts'))};`, loader: 'ts', resolveDir: root }, outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'error', alias: { three: resolve('node_modules/three') } });
  const { RoadGraph, legacyRoute } = await import(pathToFileURL(bundle).href);
  const bytes = await readFile('public/city/core.pack.wasm'), core = JSON.parse(bytes[0] === 31 ? gunzipSync(bytes) : bytes);
  const graph = new RoadGraph(core.roads), queries = [[0, 0, 6870, 419.6], [-15368, -4130, 6870, 419.6], [6870, 419.6, -12022, -4925], [0, 0, -15368, -4130], [6870, 419.6, 12000, 4000], [-12022, -4925, -15368, -4130]];
  const rows = [];
  // Warm both algorithms before alternating same-input timing order.
  for (const q of queries) { legacyRoute.call(graph, ...q); graph.route(...q); }
  for (let pair = 0; pair < 3; pair++) for (const q of queries) {
    let legacy, synchronous, legacyMs, synchronousMs;
    const old = () => { const start = performance.now(); legacy = legacyRoute.call(graph, ...q); legacyMs = performance.now() - start; };
    const sync = () => { const start = performance.now(); synchronous = graph.route(...q); synchronousMs = performance.now() - start; };
    if (pair % 2) { sync(); old(); } else { old(); sync(); }
    assert.deepEqual(synchronous, legacy);
    const job = graph.routeJob(...q), slices = [], started = performance.now();
    while (job.state === 'pending') {
      const before = performance.now(); job.step(1); slices.push(performance.now() - before);
      assert.ok(slices.length < 10000);
    }
    assert.deepEqual(job.result, legacy);
    rows.push({ pair, query: q, resultPoints: legacy?.pts.length || 0, complete: legacy?.complete ?? null,
      legacySyncMs: legacyMs, generatorSyncMs: synchronousMs, cooperativeTotalMs: performance.now() - started,
      sliceBudgetMs: 1, sliceCount: slices.length, sliceMs: slices, maxSliceMs: Math.max(...slices), operations: job.operations, exactLegacyResult: true });
  }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const summary = values => { const m = median(values); return { medianMs: m, madMs: median(values.map(v => Math.abs(v - m))), maxMs: Math.max(...values) }; };
  const slices = rows.flatMap(r => r.sliceMs);
  const report = { generatedAt: new Date().toISOString(), kind: 'realCoreGraphRouteSearchDiagnostic', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    graph: { edges: graph.edges.length, coreSha256: createHash('sha256').update(bytes).digest('hex') }, pairs: 3, queriesPerPair: queries.length,
    equality: { comparisons: rows.length * 2, mismatches: 0, fields: 'All points, lengths, completion flags and edge IDs compared exactly to frozen pre-change reference' },
    legacySynchronous: summary(rows.map(r => r.legacySyncMs)), generatorSynchronous: summary(rows.map(r => r.generatorSyncMs)), cooperativeSlices: summary(slices), cooperativeTotal: summary(rows.map(r => r.cooperativeTotalMs)), rows,
    limitations: ['Unthrottled Node CPU on real permanent core graph; dynamic loaded streets, browser GPU, phone and main Game guidance are excluded.', 'Cooperative1ms is a scheduling target. Individual primitive operations, garbage collection and host scheduling can overrun it; report every slice rather than hiding outliers.', 'The generator-backed synchronous wrapper retains exact outcomes but can cost more CPU. It remains only for existing offer/distance callers; normal grounded and flight route refreshes use the cooperative API.', 'These routes include different lengths; aggregate timing medians are diagnostics, not a matched whole-game percent speedup.'] };
  await writeFile('docs/performance/route-search-probe-after.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ equality: report.equality, legacySynchronous: report.legacySynchronous, generatorSynchronous: report.generatorSynchronous, cooperativeSlices: report.cooperativeSlices, cooperativeTotal: report.cooperativeTotal }, null, 2));
} finally { await rm(temporary, { recursive: true, force: true }); }
