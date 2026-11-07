# Build-local guidance collision candidates

The remaining navigation spikes include synchronous cosmetic clearance work after
route search. `softenRoadCorners` and `clearRoadGuidance` repeatedly reconstruct
nine-cell building and wall candidates for hundreds of samples. Candidate lists
are now reused within each synchronous build, in original iteration order. Exact
collision, support, sampling, smoothing, route and ribbon maths remain unchanged.

No cache persists between builds/frames. Railway gate changes, streamed buildings
and placement changes therefore cannot reuse stale candidates. Default physics
callers do not opt into the cache. Building candidate selection still precedes
position mutation, and obstacle selection still follows it. Deduplicated railway
walls retain their gate classification even with duplicated source references.

Added opt-in `gps.guidance.soften`, `gps.guidance.clearance` and
`gps.guidance.ribbon` CPU phases. Disabled diagnostics do not time the functions.

## Measurements

Real packed-city CPU fixture: `packedDriveWorld({x:0,z:0})`, four routes toward
700m cardinal targets, unchanged loaded city, 15 warmup passes then40passes (160
samples). Exact before/after output deep equality passed for all four routes;
route points93/39/64/63, guidance points483/484/534/499.

| combined smoothing + clearance | before ms | after ms |
|---|---:|---:|
| p50 |21.260|14.040|
| p95 |26.575|15.236|
| maximum |34.289|23.141|

Synthetic80building/40wall700m straight route: clearance p50 5.673→2.371ms,
p95 6.112→3.062ms. Synthetic measurements explain overhead only, not city FPS.

Reproducer: `node docs/performance/frame-spikes-v36/guidance-cache-probe.mjs`.
Before-code source pinned to2a19b975bb26751c032b819f80e9dbbf57d806d4.

Three regression tests pass: thousands of exact cached/uncached collision and
mutated-position comparisons (gates, kerbs, elevated walls, buildings, obstacles),
fresh builds observing changed gates/buildings, and wrong-city cache rejection.
Typecheck passed. Parent runs full suite and browser checks after source freeze.

## Limits

The actual polygon/surface collision maths remain synchronous. This reduces CPU
work substantially but does not enforce a1ms guidance budget or eliminate every
spike. The independent GPS search1ms budget excludes this cosmetic validation.
Further slicing must preserve dynamic gate/world invalidation and previous valid
guidance. These are CPU fixture results, not physical-phone60FPS evidence.
