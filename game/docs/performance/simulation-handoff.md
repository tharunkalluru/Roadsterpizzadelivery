# Simulation optimization handoff

Application root: `/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit`. Audited base `bd7313d6d20cb3f6a448bedb2e52bccd269b1bba`. Source edits are on the shared checkout; no commit, push or deployment performed by this specialist.

## Implemented

- `src/game/dynamic-spatial-index.ts`: conservative 20 m X/Z broadphase with stable active-list ordering, duplicate stamps, reused candidate-entry list and incremental membership updates.
- `src/game/traffic.ts`: dynamic broadphase in swept traffic advance, curve entry, player hit and sequential push-out. Precise OBB/vertical tests remain. Membership updates after every successful swept step. Sequential push-out re-queries after movement and preserves the original active order.
- Complete road vehicle groups/records pooled by prototype; generation increments on reuse; all current mutable fields reset. Global idle pool capped at 96 and per-prototype pool at 6. Shared geometry remains shared.
- Bus destination boards cached by route/direction/number/destination with reference counts, 96-entry/24 MiB unused-cache eviction and proper shared texture/material disposal. Active board users are retained. `Traffic.dispose()` releases idle board cache and detached pool references; ordinary `clear()` keeps a bounded pool/cache for relocation reuse.
- Shared planning token budget now covers resumable bus and ordinary turn generators, with 30 ms/second refill, 2 ms credit, at most 0.75 ms per display update before measured cost debt. Curve road-clearance sampling and bus corridor candidate evaluation yield internally. Planning snapshots validate entity generation, graph revision, current edge and bus path before publishing. Late bus plans can join only an identical current pose/tangent; they never snap back to the snapshot. Expensive routine decision cadence near/middle/far is 10/5/2 Hz; safety motion/braking still runs each simulation update. Planning age orders pending work without changing physical movement order.
- Jump corridor participants have generation-checked pins, keep their edge/motion spans, bypass density retirement and tile-driven vehicle deletion, and retain camera sightline visibility for one second after landing. Actual camera-body overlap and correct off-screen culling remain applicable.
- `src/game/route-search-gate.ts`: coalesced route-search admission with 0.6 s retry delay, 1.2 s failed-key TTL, changed graph/target/placement/airborne immediate admission, unique search tokens and stale-result rejection.
- `src/game/physics.ts`: WeakMap deduplication stamps replace repeated building Sets; hot support/roof/collision queries use separate owned scratch arrays.
- `src/game/bus-services.ts`: cache invalidation also checks graph revision instead of relying only on edge array identity/count.

## Coordinator integration

```ts
import { RouteSearchGate } from './route-search-gate';
const gate = new RouteSearchGate();
const token = gate.allow(simTime, {
  targetKey: `${target.id || ''}:${target.x}:${target.z}`,
  graphRevision: graph.revision,
  placementRevision: player.placementRevision,
  startKey: `${edge?.e.id || ''}:${direction}:${roadLevel}`,
  airborne: player.flying || player.descending || player.jumping,
});
if (token !== null) {
  const result = graph.route(/* existing arguments */);
  if (gate.finish(token, !!result, simTime)) { /* publish valid result */ }
}
```

Call `gate.reset()` on explicit relocation/reset if needed. Apply the gate to persistent off-route and missing-road conditions; retain the existing route when replacement fails and remains valid. The coordinator owns `game.ts` and integrates this hook.

Before traffic update and before allowing tile eviction, call:

```ts
traffic.updateJumpRetention({
  jumping: player.jumping,
  x: player.pos.x, y: player.pos.y, z: player.pos.z,
  hx: player.forward.x, hz: player.forward.z,
  speed: player.speed,
}, dt);
const edges = traffic.retainedEdges(); // reused Set<GEdge>; consume without storing mutable reference
// Pin each owning tile for edge.e.id, including edge spans. Release absent pins.
```

Call `traffic.clearRetention()` on explicit relocation/reset/cancelled gameplay; `traffic.clear()` already does this. `traffic.hideNear` automatically respects these pins through landing grace. Car identity is `{id, generation}`; do not retain pooled Car object references as identity. `traffic.stats` exposes pool/cache/planning/collision counts for the performance monitor.

## Validation

`node scripts/test.mjs sim-` passes eight behavioral tests:

1. 3,000 randomized rotated-OBB queries against exhaustive reference overlaps, stable order, moving updates and removal.
2. Persistent retry admission, graph invalidation and stale area-result rejection.
3. Time-based planning credit rather than arbitrary render callback admission.
4. Complete vehicle reuse/reset with preserved mesh group and incremented generation.
5. Jump/landing participant visibility and edge retention then release.
6. Shared bus-board resource lifetime through the last release.
7. Resumable bus planning advances along a service road without stopping indefinitely or snapping to an old snapshot.
8. Indexed player push-out equality to the all-pairs reference and ground/bridge separation.

The latest full `tsc --noEmit` and `git diff --check` pass after concurrent integration. No hands-on game-loop verification performed by this specialist.

## Remaining validation and cost limits

Bus and generic turn preparation now yield internally rather than monopolizing a complete candidate search. Each generator advances under shared time credits and checks snapshot validity. A single precise `trafficPoseClear` sample and geometry-curve construction remain indivisible, so measured `traffic.stats.planningOverruns` can still expose unusually dense geometry samples. Opportunistic lane changes retain their original synchronous curve check; they are infrequent/cooldown-limited but need runtime profiling. The implementation does not claim that no slow-hardware planning slice can ever overrun.

The coordinator must finish route-gate integration, world tile pins, full high-refresh timing and real-control QA. Tier scheduling affects strategic preparation, not collision or braking. Physical phone certification requires actual device evidence.

## Deterministic synthetic replay evidence

Added `scripts/sim-replay-runner.ts`, `scripts/sim-replay.mjs` and `tests/sim-replay.test.ts`. These initialize the actual `Player` on an infinite synthetic flat road, control input schedules and separate simulation-input RNG from visual RNG, freeze test wall-clock initialization, and restore `Math.random`, `Date.now` and the original document after each run. Particle animation is disabled; actual support/collision/player motion, jump and body pose execute. The harness never enters the production bundle.

`node scripts/test.mjs sim-replay` passes five tests covering full state sequences at 30/60/90/120 presentation rates, exact jump apex/airtime/momentum distance, five seconds from actual landing to jump readiness, one-shot flight action, baseline braking/travel golden values, isolated visual randomness and global-state restoration.

Run against the verified source baseline:

```sh
node scripts/sim-replay.mjs --baseline /Users/tharun/Documents/Codex/2026-10-28/roadster-performance-baseline --out output/playwright/synthetic-replay.json
```

This bundles actual baseline and candidate Player/utility dependencies separately and compares every simulation-tick state. All 12 comparisons pass exactly (three scenarios × four presentation rates). Report includes source commits, compiled bundle SHA256s, Node version and measured golden outcomes. Jump: 3.125 m rise, 1.6666667 s airtime, 20.8333333 m travel from a 12.5 m/s launch, ready again at 6.6666667 s. Braking scenario: 27 m/s after 3 s acceleration, 18.0077778 m to the first non-positive speed, 58.7327778 m total travel.

This is synthetic physics replay evidence, not a complete Game/traffic/delivery replay, rendered visual equivalence, browser performance comparison or physical-phone FPS proof. Both baseline/candidate physical steps use the candidate fixed-clock harness at 60 Hz; comparing them proves physics equivalence for those inputs, not baseline's original variable-step scheduling at other refresh rates.

## Camera profile follow-up

The coordinator's calibrated-CPU trace identified camera `staticSolidAt` probes as a dominant CPU cost. Added `src/game/static-neighborhood.ts`: per-city-revision neighborhood arrays keyed by the intersecting 50 m building and 30 m surface cells, a 2048-entry bound, stable geometry bounds in WeakMaps and developer counters. Unknown-revision fixtures use uncached neighborhood discovery to avoid assuming immutable data without a revision contract.

`staticSolidAt` now rejects out-of-range building/segment/height bounds before exact polygon and distance tests. Repeated probes in the same neighborhood reuse lists rather than rebuilding building arrays and wall Sets. All camera trace samples, exact narrowphase tests, roof/bridge vertical checks and camera recovery behavior remain. `supportAt` also reuses cached segment coefficients and conservative bounds; road-quad bounds include the small exterior and height envelope accepted by its barycentric tolerance.

`tests/sim-static-cache.test.ts` adds three tests: 16,000 randomized points compared against frozen exhaustive baseline camera-solid and road/full-roof support algorithms; revision invalidation/list reuse; exact sloped road quad and roof-corner boundary cases. All pass, the five physics replay tests still pass, and full TypeScript/diff checks pass. These are correctness checks; the coordinator must measure the resulting CPU reduction in the next rebuilt production preview. Query counters are available as `staticQueryStats` (neighborhood builds, AABB rejects, polygon tests and segment tests).

## Quantitative static CPU microbenchmark

Reproduce with `node scripts/static-query-benchmark.mjs --baseline /Users/tharun/Documents/Codex/2026-10-28/roadster-performance-baseline`. Evidence is `docs/performance/static-query-benchmark.json`, including raw five-run timings, median/MAD, source hashes and query counters. Actual original baseline modules and optimized modules execute on the identical 60-building/30-wall/20-obstacle/sloped-road fixture and 16,384 deterministic quarter-metre ray probes. Equality check covers 49,152 camera/support results with zero differences. Each method warms up three batches, then measures five alternating-order pairs.

| Query | Original median and MAD | Optimized median and MAD | Median CPU reduction |
| --- | --- | --- | --- |
| staticSolidAt | 114.583 ms and 11.998 ms | 6.269 ms and 0.056 ms | 94.53% |
| supportAt road only | 13.595 ms and 0.923 ms | 1.909 ms and 0.302 ms | 85.96% |
| supportAt including roofs | 32.472 ms and 2.056 ms | 21.790 ms and 0.081 ms | 32.90% |

The monitor microbenchmark uses six begin/end pairs and three direct records per synthetic frame across five 200,000-iteration pairs. Median additional cost is approximately 0.523 microseconds per synthetic frame. This is unthrottled Node CPU work on the host. It is not browser frame overhead certification, whole-game FPS, a GPU estimate or physical-phone performance; the concurrent calibrated browser QA does not provide a matched monitor on/off comparison. The camera-query reductions include all changes versus the original exhaustive baseline, including earlier road-neighborhood caching.
