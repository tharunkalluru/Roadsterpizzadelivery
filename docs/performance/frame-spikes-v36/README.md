# Version 36 frame-spike investigation

Baseline: `c8f8e06b16c22acff4ca731ac1209414c2d78cc7`. Work branch: `perf/frame-spikes-v36`.

## Scope and measurement interpretation

The baseline worktree is the specified commit plus the same opt-in profiler used
by the candidate. The candidate retains the existing quality presets, pixel ratio,
shadow settings, texture/model data, draw distances, effects, vehicle speed limits,
physics, populations, camera behavior and audio parameters. No lower-quality
fallback was introduced. The only city-pack edit corrects a stale byte count;
`pack-manifest-repair.json` records that all 304 streamed packs remain unchanged.

`?qaProfile=1` exposes `window.__frameProfile`. `reset()` starts a capture and
`report()` returns p50/p95/p99, maximum, counts and thresholds above 16.67/25/33.3/50
ms. Percentiles retain at most 32,768 recent samples per category; counts/maxima
cover the entire capture. Diagnostics are off by default. `frame.interval` measures
active animation-frame intervals, not presented GPU frames. JS/WebGL submit timings
do not measure GPU completion. Separate probe synchronizations are never shipped
in gameplay.

## Independently reversible changes

| Change | Commit | Runtime paths |
|---|---|---|
| Opt-in instrumentation | `838b70f`, `96d1df4` | `src/core/frame-profile.ts`, `Game.frame` / `tickFrame` |
| Environment refresh | `c3f8df3` | `src/core/engine.ts`: `applyMood`, `render`; existing `EnvironmentSkyCapture` ownership retained |
| Incremental route search | `d1f1dca` | `src/game/roadgraph.ts`: generator search, `routeJob`, `RoadRouteJob.step`; `src/game/game.ts`: request, cancel, validate and publish navigation |
| Incremental tile preparation | `5bf2b9a` | `src/world/world.ts`: `prepareTile`, `pumpPreparation`, `publishTile`, cancellation/disposal; `tileworker.ts`, `city.ts`, `parked-vehicles.ts` |
| NPC allocation reduction | `2a19b97` | `src/world/human-body.ts`: immutable source-vertex reuse in template/clothing construction |
| Guidance candidate reuse | `2aa56de` | `src/game/physics.ts`: optional `GuidanceCollisionQueries`; `route-guidance.ts`: build-local smoothing/clearance queries and phase timings |

Each runtime optimization has its own commit. Release integrity hashes in
`bc4556c` must accompany reverting the tile source files. `e187474` fixes invalid-route retention during a pending search and updates legacy
navigation fixtures. `274e7bb` verifies deferred loading with a mocked animation
frame clock. `1dc84f9` updates the
underpass test to inspect actual meshes rather than direct group-child counts.
`2e0d5c4` repairs the pre-existing Nagole pack byte-count mismatch that also failed
the unmodified baseline legacy suite; it does not change roads or geometry.

## Component results

These are host CPU experiments, not mobile FPS results. Raw samples and limits are
preserved alongside this report.

| Measured operation | Before | After | Evidence |
|---|---:|---:|---|
| Real-tile install p95 | 9.04 ms synchronously | 1.005 ms preparation slice; 1.005 ms atomic publish | `tile-install.json`: 42 exact geometry/gameplay comparisons |
| Warm real-city route p95 | 13.36 ms synchronously | 1.02 ms foreground search slice | `gps-cpu.json`: 72 exact route comparisons, 52,408 edges |
| Dusk environment captures | 140; 294.2 ms total | 23; 50.2 ms total | `env-notes.md`, standalone actual Engine/PMREM probe |
| Walker construction median | 12.56 ms | 7.81 ms | `walker-geometry.json`: 600 builds per version |
| Packed-city smoothing/clearance p95 | 26.58 ms | 15.24 ms | `guidance-cache-notes.md`: 160 calls, four exact-output routes |

Tile preparation uses a shared approximately 1 ms budget and publishes at most
one complete tile per frame. Partially prepared resources are neither rendered nor
used by physics. Worker-computed geometry bounds avoid first-use main-thread
vertex scans. Cancellation disposes resources; failed publication rolls back.
Atomic publication, subscriber callbacks and GPU uploads still have indivisible
costs. The component publication benchmark excludes those subscribers and the GPU.

Navigation uses the original traversal algorithm and retains the synchronous API
for immediate gameplay queries. Active searches yield, preserve old valid guidance,
and reject obsolete destination/graph/placement/mode results. Completion checks the
current road/height before displaying a result. The 1 ms budget is cooperative,
not a hard real-time guarantee: a cold slice reached 8.24 ms in the recorded run.

Environment reflections refresh no more often than every three seconds when the
capture key changes. Visible sky, fog, light, exposure and intensity keep their
existing update schedule. Startup, resource release and context recovery refresh
immediately. The existing reusable capture scene and target lifecycle are retained.
One same-camera dusk comparison measured mean absolute channel difference
0.886/255 across the image; this is not pixel identity or universal visual approval.

The two additional optimizations were selected only after full-game traces exposed
pedestrian spawning and guidance clearance as residual costs. NPC meshes match
all attribute bytes for 150 seeded walkers and 192 seated/standing Low/High
templates. Collision-query caches live only during one synchronous guidance build;
moving gates or changed tiles cannot reuse them on a later frame. Default physical
collision callers are unchanged.

## Whole-game comparison

See [browser/comparison.md](browser/comparison.md) and [all percentile/threshold counts](browser/summary.csv).
The unthrottled desktop driving sample improved p99 from **50.1 to 31.1 ms**;
flight at 160 km/h improved from **36.3 to 26.0 ms**. Neither candidate travel
sample exceeded 50 ms. This is a single sequential comparison, not a guarantee.

The synthetic 4× CPU slowdown still performs well below 60 FPS. Driving p99
improved from304.2 to135.2ms and flight from186.5 to128.2ms, while stationary/dusk
results were broadly similar. Therefore the work reduces measured spikes but
**does not meet a universal sustained60FPS target**. Raw outliers remain reported.

## Gameplay evidence

`gameplay/` contains reports and screenshots from Chrome desktop High and
touch-emulated Low. Scenario setup used visible QA placement/preparation controls;
subsequent interactions used the actual runtime and ordinary controls.

- Actual touch Jump emitted `orderPicked`, activated the order, restored
  the trunk box and displayed navigation, including the road ribbon after settling.
  Only initial placement beside a marked auto was assisted.
- Mahesh Level 17: decoded dialogue energy and a running audio context, delivery,
  visible Next, then a successful click/tap returning to driving on both layouts.
- Train Level 2: real rear-coach support, then cinematic entry.
- Metro Level 10: real train-roof support, then cinematic entry.
- Acceleration, braking, touch Jump and Fly worked with moving traffic present.
- No browser page errors in these scenarios.

The roof scenarios verify landing/entry, not complete train/metro deliveries.
Audio telemetry verifies decoding/progression, not what a physical phone speaker
sounds like. These observations do not certify all 19 levels or Android hardware.

## Final regression result

`npm run check` passed with exit0 on the final runtime commit `e187474`:

- `npm run typecheck`: passed.
- `npm run typecheck:worker`: passed.
- `npm test`: **1,303/1,303 current tests and38/38 legacy suites passed**.
- `npm run build`: passed, including release integrity checks.

See `validation.json` and `check.log`. The build retains its large-bundle and
runtime fonts.css warnings. Fresh-server desktop/touch gameplay, pickup and
verified story/Next probes also passed. The first resumed-play second still had a
90.3ms maximum frame interval; the matching baseline recorded100ms. This remains
an open smoothness limitation, even though the travel samples improved.

## Reproduction

Run `npm run check` for typecheck, worker typecheck, current and legacy tests, and
the production build. Focused regression files cover profiler thresholds,
environment lifecycle, search cancellation/equivalence, isolated tile preparation
and disposal, underpass meshes, exact NPC geometry, and guidance cache semantics.

Component probes:

```sh
node scripts/tile-install-benchmark.mjs /path/to/baseline
node scripts/frame-spikes-gps-benchmark.mjs
node scripts/walker-geometry-benchmark.mjs
node docs/performance/frame-spikes-v36/guidance-cache-probe.mjs
```

Browser probes require installed Chrome and Playwright. Set `PLAYWRIGHT_MODULE`
to its module entry if it is outside Node's default resolution. Serve baseline and
candidate separately on ports 4401/4402, with HMR disabled and no other benchmark
or test workloads running. Restart the candidate server after the last source edit:
disabling file watching also disables transform-cache invalidation. Verify served
modules before capturing. The initial stale-server candidate runs were discarded.
`scripts/frame-spikes-browser-probe.mjs PORT LABEL 20`
records stationary, dusk, road input and flight streaming. The recorded travel runs also contain an attempted final
scene placement that did not enter a cinematic; it is excluded from comparisons
and removed from the reusable travel probe.
Use `scripts/frame-spikes-story-probe.mjs PORT LABEL` for the separately verified
conversation-to-Next timing capture.
Set `CPU_THROTTLE=4` for a synthetic slowdown; it is not calibrated phone hardware.
`PERF_OUTPUT` selects the output directory. Gameplay/pickup probes are also in
`scripts/frame-spikes-*-probe.mjs`.

## Remaining limits

Cold NPC construction still has large tails (recorded p99 71.88 ms); guidance
clearance and tile publication are still synchronous. Route setup and an individual
PMREM capture/GPU upload can also exceed a frame budget. Frequent graph changes
can restart an unfinished search while valid previous guidance remains visible.
Further work should be driven by physical-device traces rather than reducing
graphics quality. No physical Android device or thermal/battery test was performed,
and this branch is not a sustained-60-FPS certification.
