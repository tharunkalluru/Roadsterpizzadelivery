// Harness feasibility audit only. This does not run a game or measure game FPS.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const root = process.cwd(), args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const baseline = resolve(option('--baseline', '../roadster-performance-baseline'));
const output = resolve(option('--out', 'docs/performance/whole-game-replay-feasibility.json'));
const sha = text => createHash('sha256').update(text).digest('hex');
const files = ['src/game/game.ts', 'src/game/rail.ts', 'src/game/traffic.ts', 'src/game/planning-budget.ts', 'src/world/world.ts'];
const source = {}, provenance = [];
for (const [label, directory] of [['candidate', root], ['baseline', baseline]]) {
  source[label] = {};
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim();
  for (const file of files) {
    try {
      const text = await readFile(join(directory, file), 'utf8');
      source[label][file] = text;
      provenance.push({ label, root: directory, commit, file, sha256: sha(text) });
    } catch (error) {
      if (label === 'baseline' && file.endsWith('planning-budget.ts') && error.code === 'ENOENT') continue;
      throw error;
    }
  }
}
const evidence = (label, file, pattern) => {
  const lines = source[label][file].split('\n');
  return lines.flatMap((text, index) => pattern.test(text) ? [{ line: index + 1, text: text.trim() }] : []);
};

// Concrete scheduler counterexample using the unmodified production module.
// These virtual costs are deliberately a determinism probe, NEVER a timing benchmark.
const temporary = await mkdtemp(join(tmpdir(), 'roadster-replay-preflight-'));
const schedulerProbe = [];
try {
  const bundle = join(temporary, 'planning-budget.mjs');
  await build({ entryPoints: [resolve('src/game/planning-budget.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { PlanningBudget } = await import(pathToFileURL(bundle).href);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  try {
    for (const costMs of [.005, .4]) {
      const repeats = [];
      for (let repeat = 0; repeat < 3; repeat++) {
        let virtualNow = 0, nextDecision = 0;
        Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => virtualNow } });
        const budget = new PlanningBudget(), publishedByTick = [];
        for (let tick = 0; tick < 8; tick++) {
          budget.beginFrame(1 / 60);
          const decisions = [];
          for (let candidate = 0; candidate < 200; candidate++) {
            const result = budget.run(() => { virtualNow += costMs; return nextDecision++; });
            if (result !== undefined) decisions.push(result);
          }
          publishedByTick.push(decisions.length);
        }
        repeats.push({ publishedByTick, totalPublished: nextDecision });
      }
      schedulerProbe.push({ controlledWorkCostMs: costMs, repeatable: repeats.every(r => JSON.stringify(r) === JSON.stringify(repeats[0])), repeats });
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'performance', descriptor);
    else delete globalThis.performance;
  }
} finally { await rm(temporary, { recursive: true, force: true }); }

const blockers = [
  {
    id: 'separate-simulation-event-and-profiling-clocks',
    concreteGap: 'Offers use performance.now deadlines, while that same API meters traffic work and streaming jobs. Freezing/virtualizing it changes admitted work; leaving it real permits different publish ticks under different host load.',
    evidence: {
      candidateOffers: evidence('candidate', 'src/game/game.ts', /queueOffer\(|tickOfferQueue\(/),
      candidatePlanning: evidence('candidate', 'src/game/planning-budget.ts', /performance\.now|credit|frameLeft/),
      candidateWorld: evidence('candidate', 'src/world/world.ts', /pumpJobs\(|performance\.now\(\) < deadline|requestAnimationFrame\(/),
    },
    requiredEngineering: 'Inject a deterministic simulation/event clock separately from an actual elapsed-work profiling clock. Capture/replay the tick at which each deferred strategic plan and residency publication becomes authoritative. Do not substitute one fake global performance clock for both purposes.',
  },
  {
    id: 'common-harness-only-rng-streams',
    concreteGap: 'Candidate DEV order seed exists, but RailTrains default constructor still samples global randomness; baseline rail update consumes global randomness. A common global Math.random sequence remains coupled to camera, audio, mesh UUID and particle consumption.',
    evidence: {
      candidateOrders: evidence('candidate', 'src/game/game.ts', /r = rng\(/),
      baselineOrders: evidence('baseline', 'src/game/game.ts', /r = rng\(/),
      candidateRail: evidence('candidate', 'src/game/rail.ts', /constructor\(|Math\.random|this\.random\(/),
      baselineRail: evidence('baseline', 'src/game/rail.ts', /Math\.random/),
    },
    requiredEngineering: 'Generate matching temporary baseline/candidate harness builds with explicit seed streams for orders, traffic, walkers and rail, plus independent visual/audio streams. Hash and retain every harness-only transform; never conflate the patched baseline with untouched production.',
  },
  {
    id: 'fixed-async-service-and-world-residency',
    concreteGap: 'Game construction asynchronously loads the bus feed; world worker responses, ensure readiness and budgeted publication are not clocked by a common replay log. Preloading only a straight road can hide all of these paths rather than validate them.',
    evidence: { busFeed: evidence('candidate', 'src/game/game.ts', /fetchPack<BusFeed>|setBusFeed/), worker: evidence('candidate', 'src/world/world.ts', /new Worker|onmessage|postMessage/) },
    requiredEngineering: 'Create immutable hashed synthetic CoreData/tile/bus fixtures; wait for a declared quiescent residency snapshot. For streaming scenarios, capture immutable decoded messages plus scheduled authoritative publication ticks and replay identically in each revision. For fully resident benchmarks, state explicitly that worker/network/streaming transitions are excluded.',
  },
  {
    id: 'complete-state-and-reference-repeatability-gate',
    concreteGap: 'Existing replay compares actual Player physics only. No complete Game event recorder currently proves repeatable order acceptance, pickup/handover, route topology, vehicle/coach decisions, saved state and resource ownership on a common initial fixture.',
    requiredEngineering: 'Record semantic tick-indexed events and quantized numeric state before collecting timings. Run reference three times and verify matching hashes/event sequences. Reject a benchmark pair if event/residency/population/input identity differs; do not average dissimilar play paths.',
  },
  {
    id: 'isolated-paired-measurement-after-determinism',
    concreteGap: 'Root is running a long headed active-control test on this host. Concurrent headless rendering would introduce host contention, and a headless SwiftShader result would not represent the Mac Metal or a phone GPU.',
    requiredEngineering: 'After reference determinism passes, benchmark baseline/candidate sequentially in alternating order at equal quality, resolution, populations and residency with the same renderer/backend. Use >=3 pairs, medians and MAD; use five when improvement is within normal variance. Keep CPU, GPU, loader and native-input evidence separate.',
  },
];
const report = {
  generatedAt: new Date().toISOString(),
  status: 'whole_game_paired_benchmark_not_ready',
  scope: 'Read-only source feasibility audit plus actual PlanningBudget admission counterexample. No Game instantiated, browser opened, hidden-state gameplay performed, production source modified or full-game performance measured.',
  provenance,
  actualGameReferenceRuns: 0,
  actualGamePairedBenchmarkRuns: 0,
  repeatedReferenceEventsVerified: false,
  schedulerCostProbe: {
    purpose: 'Prove that equal ticks/input/seeds alone do not determine deferred-work admission when elapsed host work is authoritative. This does not prove a particular Game desync occurred.',
    globalRandomOverridden: false,
    performanceOverride: 'Temporary harness-only object restored in finally; deterministic virtual work costs only, never performance results.',
    runs: schedulerProbe,
    differentCostsAdmitDifferentDecisionCounts: JSON.stringify(schedulerProbe[0].repeats[0]) !== JSON.stringify(schedulerProbe[1].repeats[0]),
  },
  blockers,
  boundedFeasibleAlternative: 'A fully resident synthetic Game integration fixture with actual Player/traffic/order/rail logic and explicit engine/loader doubles could test bounded semantic behavior. It must be labeled as such; it would not close whole-city streaming, rendering, save lifecycle and paired performance gates by itself.',
  existingValidScopedEvidence: ['output/playwright/synthetic-replay.json:12 exact actual Player baseline/candidate tick traces', 'docs/performance/static-query-benchmark.json:five paired deterministic synthetic static-query CPU runs', 'tests/sim-rail-random.test.ts:seeded actual rail state independence from interleaved visual randomness'],
  claimsNotMade: ['deterministic whole Game', 'three comparable whole-Game baseline/candidate pairs', 'whole-game FPS gain', 'mid-range phone60FPS', 'headless testing counted as user-visible gameplay duration'],
};
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, status: report.status, actualGamePairedBenchmarkRuns: 0, schedulerCostProbe: schedulerProbe.map(r => ({ costMs: r.controlledWorkCostMs, repeatable: r.repeatable, total: r.repeats[0].totalPublished })) }, null, 2));
