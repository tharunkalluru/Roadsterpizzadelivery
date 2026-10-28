# Roadster performance implementation and verification

2026-10-28 · local branch `codex/mobile-performance` · baseline Version21 `bd7313d6d20cb3f6a448bedb2e52bccd269b1bba`.

Core optimizations are implemented locally. The evidence establishes **47.5 minutes of active controls and observed movement across iterations**, 32 desktop deliveries and one independent Android delivery. The latest source passes 98 behavioral tests and the production build.

Performance remains conditional: the latest High/native moving window passes its local interval gate, while the calibrated mid-tier moving window misses the 20 ms p95 target. Physical-phone FPS, heat and battery measurements await the signed-in Chrome control connection; account use is now authorized.

The [2026-10-28 old/new comparison](version-comparison.md) adds 12 sequential production-browser runs. In three stationary Low Game pairs at RTC X Roads under calibrated 4.04× CPU slowdown, median FPS rises **52.44 → 59.76** and median Game-callback CPU falls **17.8 → 8.4 ms**. Three High static pairs produce identical PNGs, with draw calls **536 → 410** and unchanged 60 FPS. These are bounded desktop observations, not deterministic driving replay or physical-phone certification. Long tasks remain, and the earlier moving-window failure remains open. [Physical access follow-up](physical-device-followup.md).

The implementation preserves city source data, shopfront identities, Roadster detail, road120km/h / flight160km/h, jump height/airtime/cooldown, and the opaque mobile interface treatment. This is **not an all-gates performance certification**. Physical-phone results, controlled whole-Game A/B gains and several exhaustive scenario gates remain open.

The authoritative working application is `/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit`. The local production Worker preview is `http://127.0.0.1:4199/`. This task has not pushed or deployed; the existing public site is not this local build.

## Implemented

- Reused minimap bases, sign atlas slots/typed buffers, temporary calculations and sky/environment resources. Static map content and unchanged signs avoid repeated construction. Nearby protected detail and existing source identities remain intact.
- Indexed nearby dynamic/static collision candidates while preserving response order and vertical tests. Added generation-aware vehicle pooling and bounded shared bus-board resources. Strategic traffic work uses per-time budgets and resumable decisions; immediate collision/braking remains responsive.
- Staged worker geometry and tile installation with byte admission, counted reservations/retirements, coherent render/support/graph publication and rollback. Loading/relocation pumps run while gameplay is paused. Velocity lookahead and a separately bounded visual skyline prepare road/flight travel.
- Fixed an area-switch readiness race: a destination could be evicted after `ensure()` resolved but before placement. Coverage leases now protect current and destination support through placement/view preparation, with focus handed to the new player before release.
- Added an essential-coverage boundary guard: unavailable known streets freeze input, physics and gameplay clocks behind opaque recovery UI. A visible Retry keeps the same position/progress and resumes coherent coverage.
- Added local tree/roof-tank instancing and projected-size cosmetic detail with protected near ranges. Restored nearby Low-preset road paint and rooftop detail; retained existing efficient merged/unique landmark geometry.
- Separated60Hz simulation from presentation, added bounded catch-up and render-only interpolation, and isolated train simulation randomness from camera/render effects. Requested60/90/120 settings are separate from measured effective presentation caps. Compatible browser callback spacing and sustained headroom govern higher targets.
- Added conservative measured Auto quality and optional gradual0.90–1.00 scene-only resolution, off by default. Manual graphics preferences and progress remain separate. Unsupported GPU timing is unknown, not invented.
- Fixed pedestrian geometry ownership: the previous cache could clear references without disposing retired uploaded geometry. Shared live appearances now use leases; unused entries have count/byte bounds and release on walker/passenger removal.
- Batched compatible fixed Roadster parts within their original animated parents. Nine real-Player/Engine view pairs preserve the appearance with only tiny float rounding differences; one ground fixture reduces draw calls318→156 with identical triangle count and jump bounds. This is a measured draw-call reduction, not a whole-game FPS claim. [Matched view report](roadster-visual-comparison.json).
- Replaced normal grounded and coarse-flight route searches with cancellable cooperative jobs, sharing about1ms per rendered frame. Results validate graph/target/placement/mode and re-anchor after the car moves. The prior synchronous result remains available for offer/distance estimates.

The [task ledger](implementation-status.json) lists exact files, dependencies, checks and remaining gates for P00–P13. The original [implementation plan](implementation-plan.md) and [unchanged acceptance thresholds](acceptance-thresholds.json) remain available.

The latest integrated build is `1e28c22` / `index-BqqcYt0B.js` / fingerprint `bb9dccbf1b887a12b44b5f3cbf37404b351beb4e7899531a8eeec63e720730d6`. It passes 98 behavioral tests, both TypeScript checks and the production build. Latest High/mid-tier/context checks pass their stated functional assertions and remain separate from the older endurance series. High/native measured p9518.5ms/p9919.5ms; Low4.04× measured p9522.5ms/p9930.5ms (p95FAIL). Both185s scripts captured zero application errors. All8 context-recovery checks passed with a live accepted order and an actual viewport resize during context loss. Final 12 baseline/candidate physics sequences match exactly (maximum numerical difference0).

Final file-ending cleanup is commit `200af62` / `index-Dtm1sKiN.js` / fingerprint `d178c429fa808a6845ded32aef78011288d4d03df898c80b3d9455fe4996fe3e`. All98 tests and the build pass again. The entire rebuilt JavaScript is byte-identical to the targeted Bqqc build after replacing its embedded build identifier; [equivalence evidence](evidence/final-build-equivalence.json) preserves both hashes. Earlier runs retain their actual identifiers.

## Validation and actual gameplay

The frozen build at `6390d3e` / `index-BJHn7S3q.js` passes88 behavioral tests, client/Worker TypeScript and the production build. The build log is preserved in `evidence/check-88-tests-build.txt`. The historical external `../tools` suite was absent; it is not claimed to have passed.

Actual play uses external scripts sending visible keyboard or Android touch controls with read-only diagnostics. It is **external scripted visible-control gameplay**, not human/manual play or developer autopilot. It does not teleport, assign hidden player state or step the game simulation. Synthetic fixtures, debugger pauses and deliberately injected network/WebGL faults are reported separately.

- Desktop complete deliveries reached20 before the frozen endurance series,29 after its six segments, and32 after the latest High/mid-tier and final orders-off handover checks. Completion is established by acceptance, collection, explicit handover, persistent delivery/coin/level advancement—not merely proximity or pressingE. Android independently completed one delivery; its counter is separate.
- Orders OFF preserved an accepted delivery through completion and then suppressed new requests. Saved progress survived reload and public area changes.
- Bus113Y/K: real jump began behind the bus, the physical body cleared its roof while crossing, and the car landed ahead. The same bus ID/generation stayed resident and visible when in view through landing+1.1s. Earlier failed approaches are retained as attempts. [Original jump screenshot](evidence/bus-overjump-original.png), [returned proof](evidence/bus-overjump-result.json).
- Moving metro roof: attachment stayed on the same coach while car and coach travelled66.36m for3.018s, with bounded relative drift. Regular railway carry and station passage are not proven by that single check. [Returned proof](evidence/metro-carry-result.json).
- Public RTC X Roads/Gachibowli/Uppal cycling passed30/30 selections after the lease fix and60/60 on the subsequent refresh-policy build, preserving progress and releasing settled reservations. The original Gachibowli→Uppal failure and successful diagnostic Retry remain recorded.
- Offline flight toward an uncached area triggered the boundary guard. Two seconds of attemptedW/D/Space/J input left exact position, simulation/city time and queued actions unchanged. Visible Retry after reconnection resumed coherent coverage and continuous motion. There was no active delivery and jump clocks were zero in this live check; accepted-order/nonzero-clock freezing is covered by unit fixtures. [Returned proof](evidence/offline-boundary-result.json).
- Pause/resume, map/picker close, fullscreen/landscape gating, keyboard controls, flight/landing, jump cooldown, roof recovery, orders toggle, save/relocation retry and WebGL restoration received focused checks on their recorded builds. Every popular area, every ORR exit and every jump/archetype/speed combination were not exhaustively played.

The [duration ledger](test-duration-ledger.md) calculates non-overlapping documented control/maneuver time and excludes setup, menus and uncertain Android envelopes. The final timed segments are being reconciled by the independent duration audit; do not infer40minutes from elapsed chat time.

## Performance evidence and limits

Chrome156.0.8078.73 on this Mac was calibrated using the published DevTools algorithm:4.04× mid-tier approximation and16.05× low-tier approximation. These change CPU execution, not the phone GPU, thermal throttling or battery. See [calibration and device access](device-access.md).

All values below are candidate observations, **not matched whole-Game A/B speedups**. Timed segments have a30s warmup; p95/p99 values are0.5ms histogram upper bounds. Explicit inactive overlays/loading are excluded from gameplay presentation intervals. Results vary with route, scene, traffic and view.

| Recorded build/window | CPU setting | Active measurement | p95 / p99 interval | Interpretation |
| --- | --- | --- | --- | --- |
| `BJIRiEt4`, earlier sustained window |4.04×|125.18s|19 /25ms|Meets the bounded60Hz interval gate for that window only.|
| `mkht0607`, earlier native window |1×|124.93s|19 /19.5ms|Host-native observation, not a phone result.|
| `Ctzkk17Y`, timed delivery window |4.04×|155.12s|22.5 /27.5ms|Fails the strict20ms p95 gate.|
| `BJHn7S3q`, five final mid-tier segments |4.04×|about155s each|24.5/31.5,22.5/30,22.5/29.5,20/28.5,19/23.5ms|Last two meet the p95 gate; earlier failures are retained.|
| `BJHn7S3q`, final low-tier stress |16.05×|reported in raw result|158.5 /≥200ms|Unsuitable smoothness under this CPU stress; no60FPS claim.|
| Latest `BqqcYt0B`, High native |1×|155.031s|18.5 /19.5ms|Bounded local gatePASS; no phone certification.|
| Latest `BqqcYt0B`, Low mid-tier CPU |4.04×|155.101s|22.5 /30.5ms|p95FAIL against20ms; zero captured application errors.|

Source-level reproducible comparisons are narrower but valid:12 exact baseline/candidate Player physics sequences at30/60/90/120 presentation schedules;16,000 randomized static-query equivalence cases; five paired query microbenchmarks;160 randomized directed/stacked route comparisons and36 real-core route comparisons. Real-core resumable search slices measured median1.0008ms/max1.8155ms in Node. The synchronous generator wrapper has overhead (median6.82ms versus frozen legacy4.44ms in the mixed diagnostic); this is disclosed rather than called a universal route speedup.

Two bounded High static day/night images matched the original baseline exactly. This does not certify every moving view, LOD transition, landmark or protected sign. [Visual fixture report](static-visual-fixtures.md).

The optional adaptive-resolution context lifecycle was subsequently corrected to discard old pressure/healthy evidence, defer lost-context resizing, and restore current viewport/scale before drawing. Six additional focused tests pass; the live accepted-order context/resize recovery also passes all 8 checks on the latest build.

## Android and physical phones

Android 15/API35 Chrome124 compatibility was tested in an agent-created Android Studio AVD with a visible software-rendered world. High/Low loading, touch GO/BRAKE, FLY/LAND, map closing, fullscreen/portrait gate, switching apps/return and explicit delivery handover were observed on their exact builds. Zero application errors were captured in the final focused window. Host-GPU purple rendering reproduced on the untouched baseline; software rendering was used for compatibility follow-up. The owned AVD was stopped and input released. [Android report](android-compatibility.md), [original High-world screenshot](evidence/android-high-world-original.png).

Samsung RTL exposed a public A-series catalog but required sign-in to use a device. BrowserStack Live redirected to sign-in. No authenticated physical session, account creation, booking or payment occurred. Thus sustained real-phone60/90/120FPS, Samsung GPU-specific rendering, heat and battery endurance remain unverified.

## Final retained-resource diagnostic

The latest build completed20 public RTC X Roads→Gachibowli→Uppal loops (60/60 correct selections), with the first 10warming and the next 10measured. Each settled checkpoint paused gameplay and explicitly requested page garbage collection; this is **not FPS or active-gameplay-duration evidence**.

Per-area post-warmup JS heap ranges were0.62–0.86%; backing-storage ranges0.001–2.72%; renderer geometry-count ranges0.91–1.35%. Tile active-byte estimates repeat exactly. Every checkpoint had zero staging/retirement/pending reservations/coverage leases/admission failures. Decoded data, bus boards, vehicle pool, skyline and unused pedestrian entries stayed within their explicit bounds. The observed pedestrian sample did not exhaust the cache;420-variant eviction is unit-test evidence.

Texture-count ranges were6.33–7.59%, above the5% gate, so the full texture/GPU-resource plateau is **not passed**. Runtime heap fields and owned-byte estimates are not total physical GPU/browser memory. See [resource diagnostic](resource-cycles.json). This adds60post-fix selections to the prior30lease and60refresh checks,150successful selections across those three recorded blocks.

The owned game is paused, all inputs released, ordersOFF, and preferences restored to Auto/60FPS/adaptive resolutionOFF. The latest local preview remains available. Agent-created auxiliary servers, fixture browser and Android emulator were stopped.

## Open acceptance gates

- Complete controlled deterministic driving/streaming whole-Game A/B replay. Three High static pairs and three stationary production-Game pairs are now recorded in the [follow-up comparison](version-comparison.md). The [feasibility audit](whole-game-replay-feasibility.md) identifies the remaining real clock/scheduler/RNG/async publication seams; these observations do not close that replay gate.
- Strict1.5ms universal foreground-job/atomic-publication bound: some graph/sign activation, first-use shader/instance work, precise safety and guidance remain synchronous. Startup emulator preparation spikes occurred behind the loading screen and are retained, not hidden as phone frame results.
- Full texture/GPU-resource plateau: the final ten post-warmup loops pass the bounded per-area JS heap/geometry ranges, but texture-count variation exceeds5%. No all-city or physical VRAM plateau is certified.
- Full ORR mainline/exit drive, regular-rail roof carry/station passage, exhaustive popular-area/LOD/night/sign/jump matrices, physical input-to-display latency, and physical-phone certification.
- Full-Game instrumentation overhead and independent runtime switches for every optimization are not complete. No whole-game percentage gain or blanket quality/FPS guarantee is made.

No push or deployment is part of this verification run. Local coherent commits and the evidence record are available for review.
