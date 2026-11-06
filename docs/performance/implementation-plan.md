# Roadster performance implementation specification for AI agents

Implement the missing optimizations in the Hyderabad Roadster delivery game while preserving its gameplay, recognizable city, nearby visual quality and stable mobile interface. The primary target is sustained 60 FPS on representative mid-range physical Android phones. Support optional 90 and 120 FPS presentation where the browser, display and sustained workload permit it. Do not promise a device frame rate from source inspection or desktop emulation.

This is an execution specification for a future agent authorized to implement it. It is not an instruction to implement, publish or deploy during the planning conversation. When the user later requests implementation, perform the tasks below, preserve unrelated work, and report every task against its acceptance criteria. Do not stop after implementing only the easy items. External publication follows the user's applicable authorization; this specification alone does not authorize it.

## 1 Source identity and mandatory preflight

The audited baseline is hosted Version 21, commit `bd7313d6d20cb3f6a448bedb2e52bccd269b1bba`, inspected on 2026-10-28. Reverify the current source and deployment before implementation because this baseline can become outdated.

| Item | Baseline reference |
| --- | --- |
| Deployed game | https://hyderabad-pizza-picture-hall.blithe-okapi-0017.chatgpt.site/ |
| Sites project | `appgprj_6adaefe0993481918802134463afcaab` |
| Read-only audit checkout | `/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit` |
| Historical checkout hint | `/Users/tharun/Documents/Codex/2026-10-17/referenced-chatgpt-conversation-this-is-an/roadster-current` |
| Dependency versions in audit | Three.js and its types `0.170.0`; TypeScript `5.6.3`; Vite `5.4.10` |
| Application layout | Client in `src`; background geometry worker in `src/world/tileworker.ts`; separate server Worker in `worker/index.ts` |

The historical checkout did not exist during this audit. The audit checkout contains no installed `node_modules`. Its package scripts refer to regression files in `../tools`, but that directory was absent. These are known preparation issues, not passing tests.

Preflight actions:

1. Locate the authoritative checkout and read applicable `AGENTS.md` and repository instructions. Inspect branch, HEAD, remotes, status and attached worktrees. Do not reset, delete, overwrite or commit unrelated changes.
2. If using the hosted Sites source, follow the installed Sites source workflow. Verify project, active version and source commit using its tools. Do not expose repository credentials or hosting bypass tokens. Do not assume the audit snapshot is the current deployment.
3. Find the directory containing this application's `package.json`, `src/main.ts` and `src/game/game.ts`. In a monorepo it may be a `game` subdirectory. All relative paths below resolve from this application root.
4. Reconcile this plan's source map and baseline facts with the current implementation. Preserve newer fixes. Record changes to the plan's assumptions in the implementation ledger.
5. Install dependencies using the existing lockfile, normally `npm ci`. Do not bundle a Three.js upgrade or framework migration into this optimization project.
6. Recover the compatible regression suite from the authoritative repository/history. If it cannot be recovered, implement equivalent behavioral coverage in the repository and repair the test entry points explicitly. Do not delete failing scripts, replace tests with empty success commands, or claim the old suite passed.
7. Run baseline checks, recording pre-existing failures. Build the baseline and reserve it for side-by-side comparison. Inspect build scripts before running them; the audited build replaces generated `dist` output.
8. Choose an isolated implementation branch/worktree using the host's normal workflow. Keep one coordinator responsible for integration and one owner per shared file.

Baseline command discovery, run from the verified application root:

```sh
git status --short
git rev-parse HEAD
npm run
npm ci
npm run typecheck
npm run typecheck:worker
npm test
npm run test:flyovers
npm run test:route-motion
npm run build
```

The audited `npm run check` combines those checks. Adapt only to verified current script names. Missing test infrastructure is recorded as blocked coverage until repaired, never as a pass. Start previews on an available local port and do not interrupt a user-owned server.

## 2 Requirements that must remain true

These invariants apply to every task and performance comparison:

- Preserve the current Roadster model, shopfront identity and evidence, transit routes/numbers/colors, landmarks, road geometry, collision fixes and save data. No invented city facts or modified source coordinates to improve performance.
- Preserve nearby shop names, Telugu lettering, bus destination boards, lane markings, Roadster detail and recognizable landmark silhouettes. Keep current traffic/pedestrian populations for comparable benchmarks; do not inflate results by quietly removing them.
- Preserve current delivery-only gameplay. Do not restore the removed cinema/theatre business or obsolete controls. Preserve current GO, BRAKE, steering, FLY/LAND, JUMP and contextual collection/handover behavior.
- Road speed remains 120 km/h and flight speed remains 160 km/h in the audited baseline. Flight remains unlimited. Confirm these against current authorized changes before editing.
- Preserve the jump motion and cooldown. Baseline constants in `src/game/jump-motion.ts`: height `3.125` world units, airtime `5/3` seconds, cooldown `5` seconds, fallback gravity `9`. The cooldown begins after landing. Preserve the actual profile, kickflip pose and momentum-based forward travel, not just the constants. Jump must not add artificial forward speed.
- A vehicle being jumped over remains resident and visible whenever it should be in view through takeoff, the airborne phase, landing and camera settling. Correct occlusion by solid objects and normal off-screen culling remain valid.
- Preserve moving train/metro collision and roof carrying. Geometry visibility optimization must not remove active collision or support surfaces.
- Preserve successful and failed area-switch behavior, selected destination on retry, pickup and handover validity, order availability toggle, landscape-only interaction, sound and local progress.
- Preserve `src/ui/paint-safety.ts`: opaque critical panels, readable recovery prompts, modal/world blocking and the Samsung-compatible compositing treatment. Do not introduce DOM backdrop blur, transparent panel effects or new GPU-layer tricks as part of this plan.
- HUD layout remains independent of 3D resolution: minimap right aligned, speed bottom centered, current control placement and dimensions preserved, no new overlap with entering-area notifications.
- Ordinary driving must not repeatedly display a loading screen. Initial boot and explicit relocation may use the existing loading workflow. A network failure must not expose missing support geometry or silently move the player.
- Optimization flags and synthetic fixtures are development facilities. Do not expose a debug menu or verbose performance text in normal gameplay.

## 3 Baseline source map

Use symbols and behavior to locate code; line numbers from the audit are only hints.

| Area | Existing files and relevant behavior |
| --- | --- |
| Startup and graphics selection | `src/main.ts`; Auto currently chooses Low from touch capability |
| Render and environment | `src/core/engine.ts`, `src/core/sky.ts`; fixed DPR caps, local lights, shadows, PMREM refresh, `prepareFrame` |
| Main update and GPS | `src/game/game.ts`; `frame`, `camera`, `updateRoute`, `drawMinimap`, `placeLampLights`, relocation flow |
| Road routing | `src/game/roadgraph.ts`, `src/game/route-guidance.ts`; route reuse and dynamic route ribbon |
| Traffic | `src/game/traffic.ts`, `traffic-path.ts`, `bus-path.ts`, `bus-services.ts`, `bus-passengers.ts` |
| Collision and support | `src/game/physics.ts`, `spatial-safety.ts`, `moving-rail.ts`, `landmark-contact.ts` |
| Player and jump | `src/game/player.ts`, `jump-motion.ts`, `takeoff-kickflip.ts`, `kickflip-camera.ts` |
| Trains and walkers | `src/game/metro.ts`, `rail.ts`, `walkers.ts`, `station-life.ts` |
| Streaming | `src/world/world.ts`; `wanted`, `update`, `request`, `ensure`, `onMessage`, `add`, `unload` |
| Worker and city data | `src/world/tileworker.ts`, `packs.ts`, `types.ts`, `city.ts` |
| Batching and signs | `src/core/util.ts`; `Batch`, `SpatialBatch`; `src/world/signs.ts`; `SignSystem.update` |
| Static models | `src/world/street-lamps.ts`, `traffic_models.ts`, landmark/model modules |
| HUD and settings | `src/ui/hud.ts`, `hud-layout.ts`, `map.ts`, `settings.ts`, `paint-safety.ts`, `loading.ts` |

Keep existing strengths: 500 m static spatial batches, textured windows, shared materials, 1 km worker-built tiles, request deduplication and retries, static collision grids, bus path caches, metro mesh pooling, change-aware HUD text and full-map cached paths.

## 4 Agent ownership and execution order

Use up to three specialist agents plus one coordinator when available. With fewer agents, execute the same dependencies serially. Specialists must not independently overwrite shared integration files.

| Owner | Responsibility and exclusive files |
| --- | --- |
| Coordinator | Contracts, baseline, integration, `src/game/game.ts`, `src/main.ts`, `src/core/engine.ts`, package scripts, final QA and ledger |
| UI and reuse agent | New minimap cache module; `src/ui/hud.ts`, `settings.ts`, `src/world/signs.ts`; propose integration changes to coordinator |
| Simulation agent | Traffic, route scheduler module, collision index, vehicle pools, bus services, moving-rail timing; player modifications by agreed ownership transfer |
| World agent | Worker protocol, `world.ts`, tile jobs, city batching/LOD, skyline, resource ownership; coordinate before changing `core/util.ts` |

Register ownership in the ledger before editing. Shared-file handoffs include the base commit, intended symbols and patch or commit. On a shared filesystem, agents should edit only owned files; the coordinator integrates hooks into `game.ts` and `engine.ts` sequentially.

Dependency order:

1. P00 preflight → P01 measurement/contracts.
2. In parallel: P02 unchanged-work cleanup, P03 route scheduling, P04 collision indexing.
3. P05 pooling and entity identity → P06 decision budgeting and jump retention. P06 also depends on P03/P04.
4. P07 staged streaming → P08 prediction and flight layers. P07 can run alongside P02–P05 after contracts are stable.
5. P09 selective instancing and P10 LOD/lighting after P07; flight LOD integrates with P08.
6. P11 simulation/presentation separation after P03–P08 behavior is stable. Coordinate interpolation needs with P10.
7. P12 measured graphics/frame targets/resolution after P01 and P09–P11.
8. P13 full integration, endurance and final evidence. Run relevant tests throughout, not only at P13.

Do not start a higher-risk rewrite to hide a failing lower-risk task. Keep reversible development flags for independent A/B evaluation. Remove abandoned paths after acceptance; never leave the new implementation permanently disabled and mark it complete.

## 5 Shared contracts and tuning policy

The following are proposed interfaces, not claims that these APIs already exist. Preserve their semantics while adapting names to the current code. Define the final versions together before parallel edits.

```ts
type EntityHandle = { id: number; generation: number };
type WorldStamp = {
  dataVersion: string;
  worldEpoch: number;
  graphRevision: number;
  placementRevision: number;
};
type FrameTarget = 60 | 90 | 120;
type FrameContext = {
  nowMs: number;
  realDeltaSeconds: number;
  simTimeSeconds: number;
  targetHz: FrameTarget;
  world: WorldStamp;
};
type StreamFocus = {
  x: number; y: number; z: number;
  vx: number; vz: number;
  headingX: number; headingZ: number;
  mode: 'road' | 'jump' | 'flight' | 'descending';
  landingBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  pinnedTileKeys: readonly string[];
};
type BudgetJob = {
  id: string;
  priority: number;
  estimatedCostMs: number;
  stamp: WorldStamp;
  step(deadlineMs: number): 'pending' | 'ready' | 'cancelled';
  cancel(): void;
};
```

All motion/geometry units are existing world metres and seconds; displayed speed converts to km/h. `performance.now()` durations are milliseconds. Use simulation time for gameplay timers that freeze when paused; wall time for profiling and network timeouts. Do not mix them.

Entity handles survive reference passing but not pool reuse: increment generation whenever a pooled slot is reused. Queued work, pins and asynchronous responses must reject mismatched entity generations and world/placement revisions. A pooled object reference alone is not identity.

Use explicit resource owners. Tile-owned buffers are released with that tile. Shared prototypes, atlas textures and referenced route boards outlive individual instances. Track acquire/release counts and dispose only when ownership permits. Temporary scratch buffers belong to a subsystem/caller; avoid a global buffer overwritten by nested queries.

Centralize tuning values in a small performance configuration module. These initial values may be changed only with recorded evidence:

| Control | Initial value or rule |
| --- | --- |
| Target presentation | 60 Hz by default; optional 90/120 |
| Fixed simulation candidate | 60 Hz, maximum four catch-up steps per displayed frame |
| Dynamic spatial cell width | 20 m; test alternatives against candidate count and indexing cost |
| Persistent route retry interval | At least 0.6 s; one immediate search for a newly consumed major event |
| Failed-route cache | 1.2 s maximum, immediately invalidated by relevant graph/target changes |
| Routine decisions | Near 10 Hz, middle 5 Hz, far 2 Hz; urgent safety work bypasses routine cadence |
| Strategic planning allowance | Initial token bucket 30 ms CPU work/second, maximum 2 ms saved credit; per-display job slice at most 0.75 ms and within remaining foreground headroom; tune from queue deadlines and measured costs |
| Jump landing retention | Start at 1.0 s after stable contact; active support and current proximity continue normal residency |
| Installation and disposal combined budget | Initially 1.5 ms/frame at 60 Hz, 1.0 ms at 90 Hz, 0.75 ms at 120 Hz; shrink when foreground work consumes headroom |
| Initial streaming concurrency | Preserve current maximum of two pending tile requests; increase only with memory and frame-time evidence |
| Optional adaptive scene scale | 0.90–1.00 of the selected base scene resolution; default disabled |
| Resource memory limits | Establish explicit byte budgets from P01 measurements before enabling expanded flight coverage; do not infer exact free GPU RAM from browser hints |

Budget jobs must be internally bounded. A deadline outside a monolithic mesh upload, graph rebuild or search does not make that operation interruptible. If one operation exceeds the budget, subdivide its data or redesign the operation. Count loading, upload preparation and disposal against the same background allowance.

## 6 Task specifications

### P00 Establish a usable baseline

Owner: coordinator. Dependencies: none.

Complete section 1, create a baseline manifest, recover/repair tests and capture golden gameplay values and representative screenshots. Record the current application root, commit, browser version, graphics configuration, viewport CSS size, render size, DPR, seed and data revision. Capture both current High and current Auto-mobile behavior so later gains cannot be credited to starting from a different quality level.

Make test runs deterministic before recording performance baselines. In the audited code, not all randomness is controlled by the traffic seed: game initialization uses wall-clock time and some rail/camera behavior uses `Math.random`. Introduce development-only deterministic initialization with controlled RNG streams, starting game clock, save/settings snapshot, traffic/train initialization and a timestamped input schedule. Keep simulation randomness separate from rendering/camera randomness so a render optimization cannot change traffic choices. Preserve normal production behavior. Verify repeated baseline runs produce the same order/route/traffic events before comparing them. If deterministic initialization modifies source, create the baseline and candidate from the same harness-only commit. Label deterministic fixtures/replays separately from real-control playtesting.

Deliverables: `docs/performance/baseline.json`, `docs/performance/acceptance-thresholds.json`, scenario definitions and a test-infrastructure status entry. These are proposed repository paths; reuse existing equivalents where appropriate. Lock acceptance thresholds before candidate results are evaluated; record any evidence-backed revision with its reason and rerun both baseline and candidate. Do not loosen a threshold simply to relabel a failed candidate.

Exit: baseline is reproducible; each pre-existing failure has an explicit status. A missing physical phone does not prevent local work, but physical certification remains pending.

### P01 Add bounded performance measurement and development switches

Owner: coordinator. Proposed module: `src/core/performance-monitor.ts`.

Instrument CPU phases with `performance.now()` and store samples in fixed-size ring buffers. Aggregate outside the critical frame path. Include frame interval, simulation, traffic movement/planning, collision, route search, minimap/sign work, tile creation/activation/disposal and render submission. Record draw calls/triangles and estimated geometry/texture bytes without traversing the entire scene every frame.

Use sampled asynchronous GPU timer queries only when supported. Poll ready results on later frames, discard disjoint samples and never block waiting. Mark GPU time unknown when unavailable; do not substitute JavaScript render-call duration. Do not call `readPixels`, `finish`, exhaustive `getError` or renderer parameter queries each frame. These restrictions follow [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

Record all active gameplay frames, including tile boundaries, jumps and stalls. Label explicit initial loading, relocation, pause and hidden-tab intervals separately. Capture allocations/GC using profiling runs; do not assume a portable per-frame GC event API. Export summary JSON on demand; keep it local unless the user authorizes telemetry collection.

Include feature flags for each independent optimization and a common build/settings fingerprint in reports. Measure instrumentation overhead with it enabled and disabled. Deep profiling and screen recording are separate diagnostic runs, not the only FPS benchmark.

Tests: percentile calculations on known samples; fixed memory bound; reset on new run; correct active/paused categorization; unsupported GPU extension; disjoint query; context loss and restoration without leaked queries.

Exit: repeatable p50/p95/p99 frame statistics and subsystem costs; monitoring overhead documented and acceptably small (initial goal under 1% of frame CPU cost for lightweight mode).

### P02 Cache minimap and signs and remove unchanged work

Owner: UI/reuse agent; coordinator integrates `drawMinimap` and camera/route hooks.

Minimap: introduce a world-aligned static base cache, initially using cached paths or small raster tiles. Separate static roads/rail from route/target/player overlays. Keys include data version, affected tile/road revisions, zoom bucket, style and raster scale. Do not globally rebuild on an unrelated distant tile event. Retain overscan for rotation and use adequate raster resolution. Compose the cached base with the current player transform every displayed frame if needed; rebuild static content only on invalidation. Keep full-map behavior intact.

Signs: separate selection changes, atlas assignment changes and text/style changes. Retain stable IDs/slots and preallocated geometry capacity; update only dirty ranges. Mark a texture dirty only when its pixels change. Remember that changing one CanvasTexture region can still upload a full page; budget painting/upload rather than assuming a partial GPU transfer. Select using movement/time/revision changes instead of 45 rendered frames. Preserve boards' source identities, floor/facade placement and Telugu text.

HUD: extend existing text comparison to redundant state/attribute/style writes. Touch feedback and animation remain responsive. Avoid a MutationObserver feedback loop with paint safety. Cache DOM geometry until layout actually changes.

Route/camera: reuse vector and numeric buffers, preserve ribbon smoothing and width, and dirty the visible route geometry only when its shape changes. Do not freeze route anchoring while moving. Update camera projection when its inputs change rather than unconditionally.

Environment: coordinator reuses one temporary sky scene/material/geometry for PMREM preparation; refresh on meaningful lighting change plus a minimum interval. Keep the visible sky continuous and dispose superseded targets and owned temporary resources. Do not run environment regeneration during an already overloaded frame unless needed for correctness.

Tests: stationary 30 s scene has zero static minimap reconstructions and zero unchanged sign geometry rebuilds after warm-up; tile/style/scale/text changes invalidate exactly affected content; rotated map has no blank corners; shop text stays correct after atlas eviction; repeated dawn/dusk and area loops do not increase owned resource counts indefinitely.

Exit: same visible output for caching/reuse changes, with reduced measured work. Any intended rendering difference must be moved to P10 and reviewed separately.

### P03 Make route searches event driven and bounded

Owner: simulation agent builds route scheduler; coordinator changes `Game.updateRoute`.

Represent route requests by destination identity, start edge/direction/road level, graph revision and placement generation. Keep one relevant pending request. Consume one immediate trigger for destination change, relocation, landing or newly available relevant road data. Apply the retry gate to persistent off-route and missing-road conditions as well as missing route state. Coalesce bursts of graph events into one latest request.

Cache unsuccessful results briefly and invalidate on relevant changes. Preserve the distinction between a disconnected loaded graph and data not yet loaded. Never cache failure indefinitely. Keep a still-valid route during replacement. Reject stale results; an old area's route must not overwrite a new area's selection.

If profiling shows a single search can exceed the foreground budget, add resumable search steps or a worker with explicit graph-version ownership. A worker result must be validated before use. Do not copy the entire graph every frame. Scope graph invalidation correctly before optimizing it further.

Tests: repeated standing off-road obeys the retry bound; unavailable tile arrival restores routing; new target triggers once; changed area discards old result; wrong-way travel, road/deck separation and landing produce legal routes; route smoothing is unchanged.

Exit: route-call counters show bounded retries, no stale route publication and no repeated identical full search on successive frames.

### P04 Add dynamic collision candidate indexing

Owner: simulation agent. Proposed module: `src/game/dynamic-spatial-index.ts`.

Index active vehicles and crossing pedestrians using reusable X/Z cells. Query conservative swept bounds including current and intended position, orientation change, full bus length, safety margin and timestep motion. Preserve existing vertical-overlap checks and precise collision algorithms. Insert/update membership as vehicles move, or index conservative motion envelopes so another vehicle never queries stale coverage.

Deduplicate candidates using reusable numeric stamps. Sort/preserve baseline active-vehicle order when collision response is order-sensitive; `pushOut` mutates position sequentially. Do not change response order accidentally by iterating hash buckets. Fast autos, U-turns, bus bends and cell-boundary crossings must be covered.

Add a test-only oracle that compares candidate/narrow-phase results with the original exhaustive scan. This must not run in production.

Tests: thousands of seeded randomized cases plus recorded real road fixtures; no omitted overlapping candidate; stacked bridges do not collide; existing swept tests retain their protection at supported speeds; pedestrian crossings and long rotating buses match the reference; pooled handle generations cannot resolve to the wrong vehicle. Broadphase coverage is not continuous collision detection: the audited player `hitTest`/`pushOut` calls use a resulting pose. If testing finds baseline tunnelling, record it separately and assign an explicit narrowphase/substep correction with expected changed outcomes. Do not claim that a swept candidate envelope alone fixes it, or require both identical reference behavior and correction of the same baseline defect.

Exit: zero broadphase false negatives in the regression corpus, unchanged collision outcomes within documented numeric tolerance, and lower total collision time in dense scenarios. A larger candidate set is acceptable; missing a possible collision is not.

### P05 Pool road vehicles and resource caches

Owner: simulation agent. Dependencies: shared entity contract and P01.

Pool complete vehicle records/groups by compatible archetype in addition to shared geometry. Provide explicit acquire/reset/release methods. Reset speed, heading, steering, route references, motion curves, stop/dwell timers, served-stop sets, passenger exchange, horn state, visibility, scene membership, collision membership and pending job IDs. Increment generation on every reuse.

Cache bus board resources by route ID, direction, displayed destination, style and texture resolution. Use refcounts and byte-bounded least-recently-used eviction for unused entries. Correctly detach passenger models and cancel entity jobs before release. A retained jump participant cannot return to the pool until its pins and active interactions release.

Reuse edge buckets, rail-body arrays, query lists and per-run metro queues. Update train order when membership/order changes; do not replace correct ordering with an invalid assumption that it never changes.

Tests: rapid spawn/release/reacquire; stale job/pin handle rejection; bus destinations in both directions; no old passenger/dwell state; no double disposal; active shared boards survive another bus's retirement; bounded pool size after repeated area changes.

Exit: resource allocation rate falls in travel scenarios and reaches a bounded steady state without changing traffic composition.

### P06 Budget decisions and preserve jump interactions

Owner: simulation agent; coordinator integrates player/camera/world pin hooks. Dependencies: P03–P05.

Replace per-render-frame planning quotas with one per-time/work-budget queue covering generic turns and `prepareBusSpan`. Order by safety deadline, intersection approach, player/jump proximity, waiting age and cost. Age queued work to avoid starvation. Prepare upcoming bus turns before they are needed; preserve safe waiting if an essential plan is genuinely unavailable.

Enforce both the shared per-second planning allowance and the per-display deadline; higher refresh must not increase the total planning allowance. Charge actual elapsed CPU time. A long strategic job must yield internally or run on a worker; it cannot consume an unlimited synchronous slice. Immediate collision/braking work remains outside the strategic quota and is always serviced. If deadline misses persist, adjust advance planning, caching or measured budget explicitly rather than letting safety work wait.

Reduce only routine decision frequency initially. Red-light braking, imminent collision avoidance, traffic integration and train contact are never postponed until a far-tier timer fires. Use closing speed and shared intersection/corridor risk to promote entities. Add enter/exit hysteresis to avoid repeated tier switching.

At jump start create an interaction token and collect entities intersecting the conservative jump/landing corridor. Refresh the corridor during the jump if steering or moving traffic changes it. Pin entity handles plus required tile/edge resources. Exempt pins from density retirement, `dropEdges` eviction and camera sightline hiding; preserve correct frustum/solid-object occlusion. Prefer camera collision correction when a camera would enter a bus.

Release jump pins after stable landing plus the configured grace. Normal support/proximity pins remain if the car is still on or near that vehicle. Cancel obsolete tokens on explicit relocation/reset/destruction. Bound orphaned tokens and record why they persist; never force-release actual player support merely to satisfy a timeout.

Tests: no planning-rate doubling at 120 Hz; no hungry/starved bus queue; routine far vehicles remain visually smooth; braking remains immediate; bus/car/auto jump at 20/60/100/120 km/h, near a tile boundary, while braking and changing camera angle; same entity handle through landing; pause/resume during jump preserves timers.

Exit: every jump visibility assertion passes; no delayed safety action or assigned-route regression; decision work obeys the shared budget.

### P07 Stage streaming installation and activation

Owner: world agent. Dependencies: P01 and agreed world/version contracts.

Preserve existing deduplication, retries, stale request checks, worker restart handling and old-area retention. Add a protocol version and world epoch so obsolete worker responses can be rejected after reset or rebuild.

Proposed message semantics:

```ts
type BuildRequest = {
  type: 'build'; protocolVersion: number; requestId: number;
  worldEpoch: number; tileKey: string; tileGeneration: number;
  dataVersion: string; contentRevision: string;
  priority: 'contact' | 'route' | 'landing' | 'surroundings' | 'skyline';
  detailProfile: string; // not a license to change near quality
};
type PreparedTile = {
  requestId: number; worldEpoch: number; tileKey: string; tileGeneration: number;
  dataVersion: string; contentRevision: string; protocolVersion: number;
  estimatedOwnedBytes: number;
  chunks: PreparedChunk[]; // bounded geometry/metadata units, typed in implementation
  dependencies: string[];
};
```

Workers compute bounds and prepare geometry plus physics/navigation metadata. Transfer buffers with explicit ownership; sender views are detached and cannot be reused without replacement. Validate payload version, identity and array lengths. If parts arrive separately, include part index/count and a terminal completion message; never mark a tile complete from its first part. Provide explicit complete/cancelled/error replies. Protocol migration must preserve current empty/error messages and `ensure` cancellation behavior.

Increment `worldEpoch` for source/configuration replacement and `tileGeneration` for a tile cancellation/replacement. Changing priority alone must not invalidate still-useful work. Content revision includes applied road-grade/construction data as well as source data. Shared border roads, buildings and rail references need stable ownership/reference counts so unloading one tile cannot remove a neighbor's object.

Use states `requested → building → staged → installing → ready → active → retiring → disposed`, with failure/cancellation transitions from each applicable state. Staged data must not enter active collision, rendering or navigation queries. Preserve whole-tile atomic activation initially while dividing preparation, transport and installation into smaller jobs. Subtile activation is a later option only if all cross-boundary gameplay dependencies are explicitly modeled and tested.

Create/install bounded geometry and texture units under the shared frame allowance. Prepare tile-local physics/road/walk indexes off to the side. Avoid a final giant merge into global grids: use prepared index deltas or tile-local indexes behind a small active-tile directory. The final activation must be a bounded reference/version swap, not thousands of synchronous operations disguised as atomic work.

Activate matching render, collision, support and graph data together at a simulation boundary; notify consumers once per committed batch and advance graph revision consistently. The same boundary must remove retired sections coherently. Consumers must never see a mixed world version. Dependencies crossing tiles retain stable IDs and enough neighboring data for valid connectivity.

Separate readiness stages to avoid circular startup waits: `ensureGameplayReady` (or the existing `ensure` with this precise meaning) resolves when required rendering objects, road graph, collision and support coverage are coherently active. Then perform placement, camera initialization and `engine.prepareFrame`; only after that rendering preparation succeeds may the loading screen release. Do not make `ensure` wait for `prepareFrame` when the caller invokes `prepareFrame` only after `ensure`.

Run a bounded streaming/install/retirement pump even while initial loading, an explicit relocation, a modal or pause blocks gameplay. The audited relocation sets paused/choosing before awaiting `city.ensure`, while `frame` returns early when inactive; placing all jobs behind the active-gameplay branch would deadlock loading. When simulation is paused, publish at a quiescent zero-simulation boundary where render/physics/navigation consumers cannot observe partial state. Movement, delivery/jump timers and input actions remain frozen. Use explicit loading/context states to control the pump and cancel it on teardown. Do not depend on user movement, idle callbacks or an active physics tick to finish initial or paused loading.

Shader preparation does not guarantee all first-use uploads are complete; bound upload units and measure first-visible-frame cost. Do not rely exclusively on idle callbacks, which may not execute during sustained gameplay.

Implement backpressure in bytes as well as request count. Stop optional prefetch when staged/active budgets are reached, prioritize needed surfaces and evict unpinned distant resources incrementally. Track ownership of transferred data to avoid keeping redundant CPU and GPU copies without reason.

Define and record separate active, staging, transient replacement/relocation and recovery reserves. Reserve estimated capacity before admitting build/install work, reconcile estimates against actual buffers, and include bounded temporary old-plus-new overlap in the total. Shared resources are counted once by owner, not once per reference. If essential target coverage cannot fit and no safe eviction is available, cancel/reject that admission promptly with a recoverable error while preserving current player support and the old valid area. Release its reservations/resources exactly once and keep the selected destination for retry. `ensure` must terminate with a bounded error, never wait indefinitely for an impossible reservation. Optional skyline/detail loses priority before essential surfaces; never bypass the limit or evict an active support pin to make progress. An oversized individual tile requires smaller preparation units and measured working-set redesign, not an unbounded exception.

Tests: cold boot and paused relocation complete without any player input; gameplay timers remain frozen during preparation; deliberately delayed/reordered responses, stale epochs, cancelled area switch, worker restart, timeout, corrupt payload, tile activation during a route search, eviction during bus travel, queue full, resize/context restore. Add nearly-full-budget relocation with retained pins and no evictable tiles; prove bounded rejection, preserved support and released reservations. Record per-job and activation durations; split any recurring over-budget indivisible job.

Exit: no visible road without matching support, no invisible active obstacle, no cross-version route, no unbounded staged queue, and no monolithic installation/disposal spike attributable to the new pipeline.

### P08 Predict travel and build a flight skyline layer

Owner: world agent; coordinator supplies `StreamFocus`. Dependencies: P07 and P06 pin hooks.

Keep the surrounding turn buffer. Add priority based on current velocity, heading, near-term route, camera view and measured fetch/build/install latency. Derive look-ahead distance from speed times conservative measured preparation latency plus margin, clamped by configured memory/distance limits. Do not make route following a requirement for loaded ground.

Priority order: active support/contact → imminent movement/landing → route/velocity corridor → surrounding turn buffer → optional skyline/detail. Deprioritize outdated requests without corrupting shared pack requests. Keep data-versioned, byte-bounded decoded-pack and prepared-tile caches.

Generate a broad lightweight skyline from existing real building massing and landmark silhouettes. Define it as visual-only. It must not silently become roof or collision support. Keep full gameplay surfaces in any reachable contact corridor, including flight descent onto buildings, trains or buses. Predict landing as a region with uncertainty, expand for sharp turns, and promote details early.

Keep the old visual representation until the replacement is ready; avoid overlapping duplicate surfaces/z-fighting and two complete detailed city copies. If preparation cannot keep up, prioritize essential contact coverage and use the existing recoverable loading/error behavior for a true failure rather than allowing the car into missing physics. Routine target scenarios must not hit this fallback.

Tests: maximum-speed road travel, repeated U-turns, flight turns through 180 degrees, immediate descent, roof/metro/bus landing, high latency, partial pack failure and region-boundary travel. Compare ready-coverage lead distance, queue bytes and first-use frame costs.

Exit: predictive prioritization is demonstrably active, ordinary scenario routes avoid recurring loaders, broad skyline persists during flight and landing coverage is ready before contact.

### P09 Selectively instance repeated geometry

Owner: world agent. Dependencies: P07; coordinator handles renderer integration.

Trial categories independently: identical lamp poles, trees, barriers and repeated building accessories. Group by local chunk, geometry identity, compatible material and shadow policy. Preserve per-instance transform/color/variant and accurate bounds. Keep irregular roads, unique landmarks and efficient existing merged groups unless a comparison justifies replacement.

Three.js `InstancedMesh` supports shared geometry/materials with different transforms; maintain updated bounds and explicit disposal. Check the installed r170 API rather than relying on a newer manual signature. See [InstancedMesh documentation](https://threejs.org/docs/pages/InstancedMesh.html).

Compare worker time, vertex/instance bytes, upload time, draw calls, shadow submissions and render time. Existing merging already reduces draw calls, so fewer objects in the scene is not sufficient evidence. Do not make one city-wide instance group that defeats spatial culling.

Tests: matched transforms/materials/lighting and camera views; chunk-boundary culling; shadow bounds; instance count/slot reuse; disposal after unload; no missing repeated objects from undersized bounds.

Exit: retain category conversions only when measured cost improves without a visual or memory regression. A rejected conversion is documented with evidence, not replaced with a nominal unused instancing class.

### P10 Introduce protected near detail and stable distant lighting

Owner: world agent; coordinator owns engine hooks; UI/reuse agent owns sign selection.

Replace global nearby-detail removal gradually with a quality policy using projected size, distance and gameplay relevance. Categories have separate thresholds. Protect Roadster detail, nearby shop/bus text, current destination boards, lane markings and recognizable landmark silhouettes. Give protected signs reserved atlas capacity; do not arbitrarily evict them because distant sign selection fills the atlas.

Define enter/exit hysteresis and a minimum residence interval for LOD. Keep collision/support independent from visual LOD. Prefer silhouette-compatible transitions; if introducing dither/crossfade shaders, compare their overdraw/shader cost and Samsung rendering behavior before acceptance. Do not add large transparent overlapping world meshes by default.

Keep the existing nearby point-light pool and emissive distant lights. Select nearby lamps through a spatial index with stable IDs and hysteresis. Add simpler shadow casters for distant geometry where visually justified; nearby cars/train/player shadows stay responsive. Do not globally freeze dynamic shadows. Tune shadow-camera movement and environment refresh only with bridge/roof/night visual checks.

Tests: slow approach/recede repeatedly across every LOD threshold, fast turns, flight view, day/night, readable nearby Telugu/English signs, detailed bus boards, standing under bridges and moving shadows. Separate structural equality tests from perceptual visual approval; LOD is not pixel-identical by definition.

Exit: near visuals meet the baseline reference, distant transitions are unobtrusive, meaningful GPU/memory savings are recorded, and no Samsung DOM compositing changes are introduced.

### P11 Separate simulation and presentation

Owner: coordinator with simulation agent. Dependencies: stable P03–P08. This is an isolated regression-sensitive change.

Introduce a 60 Hz fixed-step accumulator and previous/current poses for presentation interpolation. Sample touch/keyboard input every animation frame; apply latest continuous input at the next simulation step. Queue discrete actions with unique consumption so jump, flight toggle, accept and handover cannot run twice during catch-up.

Keep trains, player movement and moving-rail contact in one consistent simulation order. Interpolate a supported car using the same alpha/reference frame as its train, or relative support pose, to avoid sliding/jitter. Render animations and the camera smoothly without making render-only state authoritative for collisions.

Use a bounded catch-up count. After background/pause reset accumulated debt and synchronize previous/current poses. For an active stall exceeding catch-up capacity, record discarded simulation debt and avoid teleporting through unsimulated collisions; preserve explicit simulation-time gameplay timers consistently. Do not silently advance delivery deadlines while the corresponding gameplay simulation is paused/frozen. Compare this policy to the captured baseline and document any necessary correction.

Convert remaining per-frame periodic work to elapsed-time/event scheduling. Benchmark input-to-next-render estimates and steering responsiveness; interpolation latency is not automatically acceptable.

Tests: scripted inputs at 30/60/90/120 presentation schedules, irregular deltas, two-second hidden-tab pause, mid-jump pause, train carry, delivery hold, exactly-once actions and timers. Compare physical trajectories, speed, braking, jump rise/airtime/distance and cooldown to the captured baseline with stated tolerances.

Exit: presentation refresh does not alter gameplay or double AI work; no train contact jitter or meaningful steering regression. If the candidate fails, retain the prior timing path and continue correcting the candidate; do not mark P11 complete with only a disabled prototype.

### P12 Add measured quality selection and optional resolution control

Owner: coordinator plus UI/reuse agent. Dependencies: P01, P09–P11.

Extend settings with independent target frame rate, detail preference and optional adaptive scene resolution. Preserve existing sound, steering, hints and progress. Migrate stored settings defensively; manual High/Low preferences remain respected. Do not reset a user's progress or infer capability solely from touch support, browser name, core count or RAM hints.

Start Auto conservatively while maintaining protected near detail. Measure representative active-play windows after warm-up. Distinguish loading spikes, CPU pressure and GPU pressure; do not react to one slow frame. If GPU timing is unavailable, mark classification uncertain and use a controlled bounded render-scale comparison only when the user enabled that option, not an invented GPU measurement.

Use `requestAnimationFrame` and an elapsed-time presentation scheduler. Display Hz is not reliably inferred from a loaded scene. Report observed callback cadence, respect browser/OS limits and never claim to enable a hardware refresh mode. Do not offer a misleading smooth 90 FPS mode by merely dropping every fourth frame from a fixed 120 Hz cadence; select a cadence compatible with the observed display/browser behavior or explain the limit concisely.

Default to 60 FPS. Higher targets require sustained headroom and re-evaluation after fullscreen/orientation changes. Prefer lower target FPS over reducing protected visual quality when high-refresh mode cannot be sustained, while keeping the preference/result clear. Adaptive resolution remains a separate explicit option, default off.

Resolution controller: apply scale only to the 3D renderer/composer targets relative to the chosen base scene resolution. Keep DOM/HUD/minimap resolution independent. Begin at 1.00, allow 0.90–1.00 in 0.025 steps, reduce only after at least 3 s of sustained GPU pressure, and require at least 10 s of healthy headroom before increasing. These are tunable constants; avoid repeated render-target allocation on every sample. Resize all dependent postprocessing targets correctly. Reset measurement windows after target/viewport changes and suspend adaptation while hidden/paused/loading.

Changing detail policy requires ready replacements; do not rebuild all tiles synchronously mid-drive. Implement bounded profile migration or retain an explicit reload for a user-selected preset while preserving progress. Clear old GPU query/controller state on context restoration.

Tests: default scale stays 1.00; opt-out holds resolution; CPU-bound case does not automatically reduce scene quality; sustained GPU case descends within bounds and recovers slowly; no oscillation; viewport/fullscreen changes; unsupported timing; 60/90/120 cadence behavior; saved settings migration; no HUD blur or layout change.

Exit: Auto uses measured evidence, settings are independent, high-refresh targets behave honestly, and optional scale is gradual/bounded with sharp UI. No claim of 90/120 capability without measured presentation on a compatible device/browser.

### P13 Integrate and produce release evidence

Owner: coordinator. Dependencies: all applicable prior tasks and test repairs.

Run the scenario matrix below and complete the acceptance ledger. Fix regressions before broadening scope. Run all relevant unit/integration/browser suites plus production build. Verify the built preview, not only the development server. Review the diff for accidental city/data/save/UI changes and unfinished flags.

Keep each coherent workstream reviewable and reversible in version control. Do not deploy to repair a failed local test. If the user authorizes publication, use the current supported deployment workflow, record source/deployment IDs, and validate the published artifact separately. Otherwise finish with the tested local result and exact remaining validation status.

Exit: every requirement has a pass, evidence-backed not-applicable decision, or explicit unresolved blocker. Overall completion requires all engineering gates; physical-device certification is a separate status that cannot be faked by emulator results.

## 7 Test scenarios and performance protocol

Create scenario definitions from real current game data. Resolve exact start positions through current area/route data and store them in the baseline manifest; do not fabricate coordinates. Fixture initialization may be used in unit/integration benchmarks, but label it as synthetic. Hands-on acceptance uses visible game controls without hidden-state teleportation, simulation stepping or developer autopilot being described as human play. One agent owns browser input at a time; release held controls and pause/close only agent-created tabs at the end.

| ID | Scenario | Required checks |
| --- | --- | --- |
| S01 | Initial boot with cold and warm asset cache | Opaque loader until ready; fonts/shaders/world ready; no partial scene flash; startup costs separate |
| S02 | RTC X Roads and dense shop streets | Shop readability, traffic/crossings, static/dynamic collision cost, delivery loop |
| S03 | IKEA/HITEC City/Gachibowli | Flyover levels, safe supports, signs, stacked-road routing, building clearances |
| S04 | ORR at the current 120 km/h road limit | Streaming lead, exits, sudden turns, tile activation and disposal timing |
| S05 | Flight at up to 160 km/h and rapid descent | Skyline continuity, landing region, roof/street contact, bounded memory |
| S06 | Jumps over auto/car/bus at several speeds | Stable entity IDs/visibility, original arc/distance/cooldown, no bus unloading |
| S07 | Ride metro and railway train through stations | Consistent train/player interpolation, collisions, station signs and contact retention |
| S08 | Dense night route and dawn/dusk transition | Local lights, shadows, reflection refresh work, no lighting-resource growth |
| S09 | Pause/map/settings/order panels and fullscreen rotation | Samsung opaque paint, responsive controls, no overlap; gameplay correctly blocked |
| S10 | Several successful and failed area changes | Preserve selected retry destination; stale route/tile rejection; resource cleanup |
| S11 | Wrong turn, off-road stop and delayed road tile | Bounded route retries; no persistent failure cache; legal route restored |
| S12 | 30-minute mixed drive/flight/night/relocation loop | Sustained frame distribution, memory plateau, no disappearing contact participants |
| S13 | Worker failure, offline/reconnect and WebGL context restoration | Recoverable state, old-area retention, resource ownership, no stale epoch activation |
| S14 | Complete orders on and orders off sessions | Explicit accepted/collected/handed-over states; free roam without requests; progress preserved |

Benchmark rules:

- Baseline and candidate use the same seed/data/route, view, graphics, render size and population. Report intentional LOD differences separately. Repeat at least three comparable runs and use the median, retaining individual runs to expose variance.
- For representative performance routes, warm up 30 s and record at least 120 s of active gameplay. Measure cold load separately. Do not remove boundary-crossing/jump/night samples as outliers.
- Record p50/p95/p99 frame intervals, frames over 1.5× and 2× target period, subsystem timings, route/planning counts, tile jobs, draw/triangle counts and owned-resource estimates. rAF intervals are a presentation proxy, not a guarantee of physical display presentation; use browser frame diagnostics where available.
- Initial engineering target at 60 Hz: p95 interval ≤20 ms and p99 ≤33.3 ms in representative active play, with no recurring game-owned >50 ms task. For 90/120 Hz use the same explicitly stated relative limits: p95 ≤1.2× target period and p99 ≤2×. These are targets, not current measurements or blanket hardware guarantees. Keep enough CPU/GPU headroom for sustained operation.
- Set per-task success against its intended cost. Structural optimizations must retain visual equivalence and demonstrate improvement beyond observed run variance, without a material regression elsewhere. Do not invent a universal draw-call or memory budget before collecting baseline/device evidence.
- After warm-up, repeat the same area/day-cycle loop at least ten times. Resource counts and estimated owned bytes should stabilize rather than increase each cycle. Inspect GPU objects and worker caches as well as JS heap; heap alone misses rendering leaks.
- Capture matched screenshots and short recordings at fixed views for visual checks, separately from timing runs when recording overhead is material. Structural changes should match; distant LOD changes need explicit readable-sign, silhouette and popping review.

Initialize `acceptance-thresholds.json` with the following gates, then calibrate only where P00 demonstrates an existing measurement limitation. Preserve strict identity/safety gates even when numerical measurements are noisy:

| Gate | Initial acceptance rule |
| --- | --- |
| Broadphase | Zero omitted reference collision candidates; same deterministic response order and outcomes within `1e-5` world units for unchanged numeric algorithms |
| Structural geometry | Identical object identities/materials/placement; transformed vertex differences no greater than `1e-4` world units unless an explicitly reviewed float precision reason exists |
| Jump identity | Same entity handle through the tested jump and landing grace; zero premature retirements or stale-generation pin matches |
| Fixed-step jump | At 60 Hz compare against baseline: apex within 0.02 m, airtime within one simulation tick, travel within max(0.10 m, 1% of baseline distance); no added forward impulse; cooldown cannot become ready before 5 simulation seconds after landing |
| Timing invariance | Candidate replay at 30/60/90/120 presentation produces the same simulation-state sequence at matching simulation ticks; one-shot actions consumed exactly once |
| Braking and steering | Baseline/candidate controlled 60 Hz scenarios: braking/travel difference within max(0.10 m, 1%); input-to-next-render estimate median regression ≤4 ms and p95 regression ≤one simulation tick, with no added missed action |
| Performance variance | Use at least three paired runs; increase to five if an apparent gain is within normal variation. Report median and median absolute deviation. Claim a time improvement only when it exceeds max(5%, twice the normalized baseline median absolute deviation) |
| Non-target work | Investigate a p95 regression greater than max(3%, twice baseline variation) in an unaffected representative scenario; do not hide it in a global average |
| Resource plateau | After cache warm-up, repeated identical loops stay within configured resource/pool limits and within 5% of the warmed resource range, with no positive per-loop retained-object trend. Unreleased zero-reference resources are failures even if they fit the percentage |
| Budget jobs | Recurring job durations fit configured slice limits; isolated overrun is logged and investigated. No essential work waits indefinitely for impossible admission |
| Near visuals and Samsung UI | No missing/unreadable protected text, changed landmark identity, new panel transparency/striping or control overlap; review captured pixels and actual interactions |

The numerical gates distinguish unchanged structural algorithms from the separately gated simulation-timing migration. Record tolerances and exception rationale per scenario; do not average away a failed bus jump, wrong route or missed collision. Synthetic replay timing is not a physical phone certification.

Without physical mid-range hardware, run desktop browser traces, calibrated CPU-throttling comparisons and Android emulator compatibility tests. Label each environment. [Chrome's calibration](https://developer.chrome.com/docs/devtools/settings/throttling) approximates CPU performance; [Device Mode limitations](https://developer.chrome.com/docs/devtools/device-mode) explicitly distinguish it from a real phone. Neither proves mobile GPU behavior, battery duration, heat or sustained high refresh.

Physical certification should cover representative mid-range phones with differing mobile GPU families, using the actual browser and recording device/OS/browser/render resolution. Borrowed or cloud-hosted physical devices may be used when available; measure inside the browser rather than counting remote-stream video frames. Charging, ambient temperature, battery mode and cloud restrictions must be recorded. If unavailable, finish engineering work and report physical certification pending. Do not purchase access or add remote telemetry without applicable user authorization.

## 8 Required artifacts and completion ledger

Keep concise human-readable records plus machine-readable measurements under the verified repository's existing documentation/test conventions. Proposed destinations:

```text
docs/performance/implementation-plan.md
docs/performance/implementation-status.json
docs/performance/baseline.json
docs/performance/acceptance-thresholds.json
docs/performance/scenarios.json
docs/performance/final-report.md
artifacts/performance/<run-id>/manifest.json
artifacts/performance/<run-id>/metrics.json
artifacts/performance/<run-id>/screenshots/
```

Do not commit large raw traces, credentials, personal browser data or generated caches. Retain original evidence in an appropriate ignored artifact location and link it from the report. Add required tests under the repository's real test layout and wire commands into `package.json` only after preflight resolves the missing external suite.

The status file must include each P00–P13 task, dependencies, owner, status (`pending`, `in_progress`, `implemented_unverified`, `passed`, `blocked`), relevant commit/files, checks, metric comparisons, evidence paths and unresolved risks. Store visual verification, gameplay verification, local performance verification and physical-device verification as separate fields. A build pass cannot populate gameplay verification.

Requirement coverage:

| Original requirement or audited gap | Owning tasks |
| --- | --- |
| Repeated geometry and local culling | P09, P10 |
| Nearby dynamic collisions and distant decisions | P04, P06 |
| Routing retry/cache invalidation and bus planning budget | P03, P06 |
| Bus visibility through jump and landing | P05, P06, P07 |
| Predictive streaming and bounded installation/disposal | P07, P08 |
| Flight skyline and landing coverage | P08, P10 |
| Minimap cache, unchanged HUD/sign work, scratch buffers | P02, P05 |
| Vehicle/board pooling and environment cleanup | P02, P05 |
| Nearby quality, LOD transitions and local lighting | P09, P10 |
| Samsung interface stability | P02, P10, P12, P13 |
| Simulation timing and high-refresh consistency | P06, P11, P12 |
| Measured Auto and optional scene resolution | P01, P12 |
| Performance evidence and physical-device limits | P00, P01, P13 |

An agent handoff must state: current checkout/branch/commit; task ID; exact files changed; invariant risks; tests actually run; artifacts produced; unresolved issues; next task and dependencies. Preserve the ledger across context compaction and subsequent chats.

Final implementation report must state which tasks passed, actual before/after measurements under matched conditions, gameplay/visual regressions checked, exact build tested, any code left disabled, and outstanding physical-device certification. Do not write “all optimized” with missing rows, conditional flags, skipped tests or unmeasured FPS claims.

## 9 Ready to use implementation instruction

Copy the following instruction with this complete file when assigning implementation to another AI agent:

> Implement the Roadster performance implementation specification for AI agents in this file. Start with P00 and verify the authoritative current checkout; preserve newer fixes and unrelated work. Execute P00–P13 in dependency order, using specialists with exclusive file ownership where useful. Preserve every invariant, repair missing test infrastructure, and maintain the completion ledger and evidence. Do not substitute broad graphics reductions for the requested optimizations or treat a successful build as gameplay validation. Complete and verify all engineering work possible with available hardware. Clearly separate physical-phone certification if no phone is available. Do not push or deploy unless my applicable instructions authorize publication. Report the exact remaining blockers and measured results, not estimated FPS gains.
