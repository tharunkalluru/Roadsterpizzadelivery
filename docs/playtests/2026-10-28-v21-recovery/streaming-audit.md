# Version 23 streaming and visual-workload audit

Recorded 2026-10-28. This is a read-only source audit and a synthetic scheduling probe. It is **not physical-phone FPS, GPU, temperature, battery, or gameplay acceptance evidence**. It identifies concrete regressions and plausible contributors; it does not attribute the user's observed phone frame drops to one measured cause.

## Revisions and scope

- Version 21 baseline: `bd7313d6d20cb3f6a448bedb2e52bccd269b1bba`, checkout `/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-baseline`.
- Version 23 optimization/hotfix archive: `ece70c6f799fe5abd7dd171fd42be531684eba4c`, checkout `/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit`.
- References below point to the archived optimization checkout, except explicit baseline references. The release checkout can subsequently restore Version 21 without changing this audit's source target.
- No game source, runtime state, browser, Git commit, remote branch, or deployment was changed by this audit. The only output files are this report and the diagnostic script.

## Confirmed mechanisms and their limits

### 1. Every-frame pump bypasses the world-update throttle

`Game.frame()` calls `city.pumpJobs()` on every callback ([game.ts:135](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/game/game.ts:135)). The pump then calls `update(..., 0, true)` whenever focus exists and fewer than two requests are pending, **even when its staged and retirement queues are empty** ([world.ts:269](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:269)). `force=true` bypasses the existing 0.4-second throttle ([world.ts:285](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:285)).

The forced path rebuilds required/leased/wanted arrays and sets, sorts build-duration samples, computes lookahead, scans loaded tiles, and may scan/request skyline tiles ([world.ts:287](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:287)). This is extra foreground work even in settled views. Version 21 normally performed its corresponding scan after accumulating 0.4 seconds ([baseline world.ts:111](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-baseline/src/world/world.ts:111)).

The preserved probe executes the actual source methods with empty queues and a synthetic clock: 120 callbacks over two simulated seconds cause **120 forced optimization updates**, versus **4 baseline scan passes**. The baseline's floating-point accumulator crosses its threshold after 25 callbacks in this probe. This demonstrates scheduling frequency, not milliseconds saved or FPS lost.

### 2. The foreground allowance excludes tail work and cannot bound atomic jobs

`pumpSpent` is updated **before** the forced update ([world.ts:268](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:268)), so that tail work is outside its nominal 1.5 ms allowance. A synthetic four-millisecond tail advances the probe's clock by four milliseconds while recorded `pumpSpent` remains zero. Four milliseconds is deliberately injected to prove accounting order; it is not a measured production update duration.

The scheduler also checks the deadline only before advancing a generator or calling activation. Upload/activation units are indivisible at that point ([world.ts:252](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:252)); publication synchronously registers signs, grids, metadata and `onTileAdded` hooks ([world.ts:513](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:513)). A separate RAF pump is scheduled at [world.ts:242](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:242), while budget accounting resets after six milliseconds of wall time rather than a shared display-frame identifier. This does not establish a strict per-rendered-frame foreground ceiling. Existing acceptance already acknowledged unbounded atomic publication ([final-report.md:94](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/docs/performance/final-report.md:94)).

### 3. Low quality gained geometry; the GPU workload comparison changed

The original `!lowQ` restrictions were removed for ordinary road markings, parapets, and rooftop detail ([city.ts:300](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/city.ts:300), [city.ts:795](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/city.ts:795), [city.ts:888](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/city.ts:888)). Added details within 180 m are protected from LOD hiding and retain shadow casting ([world.ts:217](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:217)).

The project's own paired Low observation records triangles **447,882 to 530,808**, an **18.5% increase**, despite fewer draw calls ([version-comparison.md:16](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/docs/performance/version-comparison.md:16)). CPU gains do not prove that this larger near-scene geometry workload is safe on a phone GPU. These are not equivalent original-Low workloads. No physical-phone GPU trace was collected by this audit.

### 4. Missing ground detail can freeze high-altitude flight

`movementCoverageNeed()` accepts horizontal position and velocity only; it has no altitude, flight-mode or visual-skyline readiness input ([streaming-boundary.ts:10](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/game/streaming-boundary.ts:10)). `checkStreamingBoundary()` applies it to the player without a flight-specific readiness distinction ([game.ts:77](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/game/game.ts:77)).

Recovery clears held inputs and the simulation accumulator, displays an opaque road-loading screen, and waits for full tile and render preparation ([game.ts:98](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/game/game.ts:98)). Consequently, a missing detailed ground tile can interrupt flight even when contact with the ground is not imminent. This is a source-confirmed possibility, not a reproduction on the user's handset. A future fix must separate flight visibility, support/collision safety and landing readiness; simply deleting safety checks would risk falling through missing surfaces.

### 5. Detailed streaming can starve flight's lightweight skyline

`updateSkyline()` refuses a skyline request while **any** detailed request or staged tile exists ([world.ts:589](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:589)). Skyline preparation and publication are placed in the retirement queue ([world.ts:620](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:620)), which the pump services only when no detailed staged tile remains ([world.ts:253](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:253)).

Thus the layer intended to keep flight views continuous has lower request and install priority than all detailed work. Dense traversal can delay it; duration and visible effect require a continuous moving trace.

### 6. Capacity handling can evict more prefetched scenery than necessary

On an urgent admission failure, `releaseOptionalCapacity()` unloads **every** unpinned tile outside its 350 m protection set, rather than stopping after enough capacity is freed ([world.ts:190](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:190)). It similarly discards optional staged work. This is called from admission ([world.ts:319](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:319)).

In dense moving or landing regions this can discard already prepared surrounding scenery and require rebuilding it as direction changes. This is an eviction-churn risk confirmed by control flow; no physical-memory or route trace proves its frequency here.

### 7. Periodic LOD and simulation updates add allocation/upload work

Every 250 ms, tree detail scans every instance in each batch. If one instance changes classification, the implementation repartitions that entire batch, rewrites matrices/colors, and marks both meshes for GPU upload ([world.ts:210](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:210)). The pump creates a staged-array copy each iteration ([world.ts:253](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/world/world.ts:253)); each simulation tick creates retained-road arrays/sets and a fresh stream-focus object ([game.ts:958](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/src/game/game.ts:958)).

These mechanisms introduce periodic CPU work, memory churn and buffer uploads. This audit has not isolated their frame-time contribution. They should be measured separately before being retained in a replacement optimization.

## Existing measurements did not close the moving-mobile regression gate

- The headline Low comparison was a **stationary** Game with no keyboard/touch input, and actors were not locked to a deterministic matched replay ([version-comparison.md:22](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/docs/performance/version-comparison.md:22)). It cannot certify driving, flight, boundary crossings, camera turns or jump continuity.
- The previous moving-delivery **22.5 ms p95 failure** explicitly remains open ([version-comparison.md:20](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/docs/performance/version-comparison.md:20)). The final report again records the calibrated mid-tier moving failure ([final-report.md:67](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/docs/performance/final-report.md:67)).
- A passing sustained window included stationary idle after completing its route ([coverage-verdict.json:71](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/docs/performance/coverage-verdict.json:71)).
- Matched moving skyline/pop-in tests at maximum flight speed across dense regions remain open ([coverage-verdict.json:240](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/docs/performance/coverage-verdict.json:240)).
- Long tasks remained, with a worst optimized task of 86 ms in the stationary comparison ([version-comparison.md:28](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/docs/performance/version-comparison.md:28)). Shader/instance first use and atomic install work were not universally bounded; texture count variation also exceeded the existing plateau gate ([final-report.md:87](/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit/docs/performance/final-report.md:87)).
- Desktop CPU slowdown and Android emulation do not reproduce the phone GPU, thermal throttling or battery behavior. No physical-phone certification is added here.

## Recovery and subsequent investigation

Restore the exact known-good Version 21 game first while retaining the optimization branch and evidence. Reintroduce changes separately only after matched moving tests pass: (1) coalesced world updates whose full cost is budgeted, (2) equivalent original-Low geometry/residency, (3) explicit flight/landing readiness without blanket ground-detail interruption, (4) fair skyline scheduling and bounded install/eviction work, and (5) stable nearby vehicle/jump visibility.

Each candidate should be compared against Version 21 on continuous dense-city driving and maximum-speed flight with turns and landings, at the same viewport, drawing buffer, quality, route and actor conditions. Capture p95/p99 intervals, worst hitches and their causes, input continuity, residency/evictions, allocation growth, and visual evidence. Stationary FPS improvement alone is insufficient to release it.

## Reproduce the scheduling probe

```sh
node /Users/tharun/Documents/Codex/2026-10-28/roadster-release/tools/diagnostics/streaming-regression-probe.mjs
```

The optional first and second arguments override the optimization and baseline checkout paths. It imports the actual `World` classes using the optimization checkout's installed esbuild, calls prototype methods without constructing a world/renderer, restores `globalThis.performance`, writes no files, and prints source hashes and counts. The baseline scan stubs empty tile requests; the optimization scan is a counting stub to establish the pump call schedule. Neither is a production-cost benchmark.

Observed output at `2026-10-28T15:45:13.171Z`:

```json
{
  "optimizedCommit": "ece70c6f799fe5abd7dd171fd42be531684eba4c",
  "optimizedWorldSourceSha256": "d677d232351bad2faf033788dd220822380d73b48a4fcfc73968dd942a6d9b91",
  "baselineCommit": "bd7313d6d20cb3f6a448bedb2e52bccd269b1bba",
  "baselineWorldSourceSha256": "3e4cf8b4ca79f10b2dd37346703988c997ab2c2d9dc0a520af861fdfd12dcd3a",
  "callbacks": 120,
  "callbackHz": 60,
  "simulatedSeconds": 2,
  "emptyStaging": true,
  "optimizedForcedWorldUpdates": 120,
  "optimizedAllTailUpdatesPassForceTrueAndDtZero": true,
  "baselineActualWorldScanPasses": 4,
  "baselineThrottleSeconds": 0.4,
  "syntheticTailAccounting": {
    "injectedTailMilliseconds": 4,
    "clockElapsedMilliseconds": 4,
    "accountedPumpSpentMilliseconds": 0
  }
}
```

Probe exit status: 0. Synthetic scheduling findings only; no phone-performance conclusion.
