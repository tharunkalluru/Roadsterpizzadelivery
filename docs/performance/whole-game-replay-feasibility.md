# Whole-Game replay feasibility

The complete deterministic baseline/candidate Game replay remains **unverified**. No whole-Game replay was executed, no three-pair replay result is claimed, and no headless work is counted as real-control playtesting. Production source and the coordinator's browser input were left untouched by this feasibility audit.

Later on 2026-10-28, the [browser comparison follow-up](version-comparison.md) completed three High static pairs and three stationary production-Game pairs using the unmodified production builds. It establishes bounded rendering/CPU observations while the real Game runs; actors and publication timing were not locked, so it does not close the deterministic replay requirement described below.

The checked source can seed order generation in development, and the rail subsystem now owns its random stream. This does not make the complete Game deterministic. Orders still use wall-time deadlines; Game construction loads the bus feed asynchronously; worker responses and budgeted tile publication can arrive on different ticks; traffic planning admits work according to measured CPU cost. Global random replacement would also couple rail decisions in the untouched baseline to camera, particle, audio and Three.js UUID draws.

The [machine-readable feasibility record](whole-game-replay-feasibility.json) captures source commits, file hashes, exact code evidence and a small actual-module counterexample. The unmodified `PlanningBudget` admitted 1,096 work items over eight fixed simulation ticks with a controlled 0.005 ms per-item virtual cost, versus 14 with a 0.4 ms cost. Each condition repeated identically three times. This is a scheduler determinism probe, **not a speed measurement or proof of an observed full-Game desynchronization**. It demonstrates why freezing `performance.now()` would change the work admitted by the optimization being evaluated. The temporary clock object was restored in `finally`; global `Math.random` was never overridden.

A valid full benchmark needs these harness seams before collecting timing:

1. Separate deterministic simulation/event time from real elapsed-work profiling time. Capture and replay the simulation tick at which deferred plans become authoritative.
2. Produce matching temporary baseline/candidate harness builds with explicit order, traffic, walker and rail seeds, independent visual/audio streams, fixed save/settings and a known starting clock. Retain hashes for every harness-only transform.
3. Load immutable, hashed CoreData, tiles and bus-feed fixtures to a declared quiescent residency state. For streaming tests, replay worker messages and authoritative publication ticks. A fully resident test must explicitly exclude streaming transitions.
4. Record order, route, traffic/coach, action, progress and residency events by simulation tick. Verify three repeated reference runs produce equivalent semantic sequences before comparing candidate timings. Reject pairs with different populations, inputs, resources or routes.
5. Run at least three sequential alternating baseline/candidate pairs under the same renderer/backend, quality and resolution; report median and MAD. Keep this separate from the coordinator's active-control endurance run and from physical-phone validation.

A small fully resident synthetic Game fixture could verify bounded integration behavior with explicit loader/renderer doubles. It would omit the asynchronous streaming and GPU work that dominate several requested scenarios, so passing it would still not close the full Game performance gate. Running headless rendering concurrently with the coordinator's long headed test would also contaminate the host measurements. The available trustworthy results remain the 12 exact actual-Player physics comparisons, five paired static-query CPU runs, seeded rail regression and separately labeled real-control observations.

Rerun the audit from the application root with:

```sh
node scripts/whole-game-replay-preflight.mjs --baseline /absolute/path/to/roadster-performance-baseline
```
