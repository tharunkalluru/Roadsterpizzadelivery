#!/usr/bin/env node
/**
 * Read-only scheduling probe. This deliberately does not construct a renderer,
 * simulate gameplay, measure FPS, or claim anything about physical-phone speed.
 *
 * node tools/diagnostics/streaming-regression-probe.mjs [optimization-checkout] [v21-checkout]
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const optimized = path.resolve(process.argv[2] || '/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit');
const baseline = path.resolve(process.argv[3] || '/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-baseline');
const { build } = createRequire(path.join(optimized, 'package.json'))('esbuild');
const worldPath = checkout => path.join(checkout, 'src/world/world.ts');
const provenance = async checkout => ({
  checkout,
  commit: execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  worldSourceSha256: createHash('sha256').update(await readFile(worldPath(checkout))).digest('hex'),
});

const source = `
import { World as OptimizedWorld } from ${JSON.stringify(worldPath(optimized))};
import { World as BaselineWorld } from ${JSON.stringify(worldPath(baseline))};

if (typeof OptimizedWorld.prototype.pumpJobs !== 'function') throw new Error('Target optimization checkout has no pumpJobs method.');
const callbacks = 120, callbackHz = 60;
let clock = 0, forcedUpdates = 0, baselineScans = 0, allForced = true;
const oldPerformance = globalThis.performance;
const makePumpWorld = update => Object.assign(Object.create(OptimizedWorld.prototype), {
  staged: new Map(), retirements: [], pumpWindow: -100, pumpSpent: 0,
  focus: [0, 0], pending: new Map(), update,
});
const optimizedWorld = makePumpWorld((x, z, dt, force) => { forcedUpdates++; allForced &&= force === true && dt === 0; });
const baselineWorld = Object.assign(Object.create(BaselineWorld.prototype), {
  t: 0, focus: null, radius: 900, tiles: new Map(), waiters: [],
  expireRequests() {}, wanted() { baselineScans++; return []; }, request() {},
});
try {
  globalThis.performance = { now: () => clock };
  for (let i = 0; i < callbacks; i++) {
    clock = i * 1000 / callbackHz;
    optimizedWorld.pumpJobs();
    baselineWorld.update(0, 0, 1 / callbackHz);
  }
  // Synthetic 4 ms tail work proves accounting order, not the runtime cost of update().
  clock = 0;
  const accountingWorld = makePumpWorld(() => { clock += 4; });
  accountingWorld.pumpJobs();
  exportResult({
    kind: 'Synthetic scheduling/control-flow probe; not gameplay, FPS, GPU, thermal, battery, or physical-phone evidence',
    callbacks, callbackHz, simulatedSeconds: callbacks / callbackHz,
    emptyStaging: true,
    optimizedForcedWorldUpdates: forcedUpdates,
    optimizedAllTailUpdatesPassForceTrueAndDtZero: allForced,
    baselineActualWorldScanPasses: baselineScans,
    baselineThrottleSeconds: 0.4,
    baselineCountNote: 'Floating-point accumulation may scan after 25 callbacks instead of 24; this is an actual source-method count.',
    syntheticTailAccounting: { injectedTailMilliseconds: 4, clockElapsedMilliseconds: clock, accountedPumpSpentMilliseconds: accountingWorld.pumpSpent },
  });
} finally { globalThis.performance = oldPerformance; }
`;

let result;
globalThis.__roadsterStreamingProbeResult = value => { result = value; };
try {
  const bundle = await build({
    stdin: { contents: `const exportResult = globalThis.__roadsterStreamingProbeResult;\n${source}`, resolveDir: optimized, sourcefile: 'streaming-scheduling-probe.ts', loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22', logLevel: 'error',
  });
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  if (!result) throw new Error('Scheduling probe did not return a result.');
  console.log(JSON.stringify({ capturedAt: new Date().toISOString(), optimized: await provenance(optimized), baseline: await provenance(baseline), ...result }, null, 2));
} finally { delete globalThis.__roadsterStreamingProbeResult; }
