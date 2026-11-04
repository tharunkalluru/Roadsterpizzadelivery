# Independent explicit physical pavement width review

This scoped review passes for the 21 literal historical pavement profiles, **after correcting one discovered bus-lane regression**. It does not approve final heights, global geometry or release activation.

The held source is `jointBindingBaseline21-d3256b22a8a923b862f0e0e86bd95269eba9938dfd7528062f53df633f14f128.json`, with joint input `e866b9f8bf2217bd25c7a3d45f28cef541e5fc60dbd7deb353cacaea55ed4b5f`, source generation `9413c1f5f353f1f2f054717a0d461d6b1a17fc2627c0a5353ce85496985c53ac` and source data SHA `55ee3dbc0c741072e204d7560731296db086959c23ef765a9518da4a27cd237b`.

## Evidence

Use `docs/qa/evidence/reported-roads/physical-width-independent-review-9413-20261103-v2.json`, SHA256 `6ba9e2aa4adadb2dc73b97539a0165b478bad84b9461a98ccc07d69b19e517f0`.

- Eight independent test groups and TypeScript checking pass. All 134 consumed input files remain unchanged before/after verification.
- More than 7,500 absent-field scalar comparisons use `Object.is` against the literal previous width formula. Source capacity, clearance and support arithmetic retain absent-field behavior.
- Malformed physical widths (below source width, above original width, negative, nonfinite and wrong types) fail closed in owner/context transfer, prepared cache installation and atomic core overlay.
- Valid owner/context, cache and overlay transfers retain raw width/lanes, clone the width metadata, and bind it in profile matching. The actual 21 raw widths, lanes, one-way flags, coarse XYZ, sourceXY and cumulative sourceArc equal their held historical/source bindings.
- Actual rendered asphalt, finite support, graph Y, structural caps and parapet collisions use the 8.4 m physical envelope. A synthetic actual collision check rejects an invisible blocker at the old raw half-width and stops at the emitted physical parapet.
- Traffic retains its source lane-capacity rules. The physical envelope is not used to invent lanes, change density, alter clocks, or shift path XZ/yaw.

The actual-worker receipt is `docs/qa/evidence/reported-roads/physical-width-worker-independent-9413-20261103-v2.json`, SHA256 `8d307b84b9cd5bb8f9fb48b95e0f43a9bfe3eb3fbcca4445371cd6ba9884925b`. It runs the real World initialization and real tileworker with Node-only message/file adapters. Only the 21 held transports are injected in process memory into the worker's ordinary overlay stage; runtime files and release manifests remain inactive.

Across 18 actual owner/context tiles it observes 24 copies, all 21 owner roads and 132 exact historical L/R cross-sections. All **182 actual Float32 road-strip triangles equal the historical triangles exactly**. On 6,217 supported own-road graph samples, maximum Y disagreement with actual Float32 pavement is `0.00011229341441210128 m` (112.3 µm). Foreign roads cannot supply support. Raw worker pack hashes match the held joint input.

## Defect found and corrected

Adding a new `joinedPavement` profile activated a pre-existing special `busLane` branch on three real one-way roads: `a7d70aad-dd0_0`, `c5a4de33-6f9_0`, `dbb99bac-943_0`. Their bus lane shifted from 0 m to 1.2 m despite unchanged raw widths/lanes.

Root fixed this narrowly in `src/game/bus-path.ts`: an explicit physical-width override without `usableLanes` uses the original source lane rule. Absent `physicalWidth` and explicit capacity profiles retain the prior branch arithmetic. Independent controls cover all 21 actual baseline roads, absent-field profiles and explicit-capacity profiles. The original failing evidence remains at `physical-width-independent-bus-lane-negative-9413-20261103.log`.

One initial worker run detected Root's concurrent `bus-path.ts` edit and aborted without writing an acceptance receipt. Later held-source runs passed. The first completed worker receipt used per-tile support bounds; v2 combines all own-road owner/context triangles before querying and is the authoritative scoped result.

## Open gates

- **89 offset graph samples on `140dc6fc-d84_0` remain outside its own literal pavement**, all at shoulder offsets tested at ±3.8 m. These are reported finite-shape controls, not accepted support. Exact historical strip parity does not make them driveable. All paths/full bodies on final geometry still require testing.
- The producer's 52,411-core L/R parity receipt remains producer evidence. This bounded independent review verifies absent-field arithmetic and exact held bindings; it does not independently regenerate every core triangle.
- No feasible final core/tile height model exists yet. Final caps, terrain/underpass continuity, source-node joins, same-road folds/remote crossings, full Roadster/traffic body and tyres, known30, headroom, native drives and final cache/reuse/restart remain open.
- The historical baseline's 1,713 outside-ROI unmatched triangles and 18 outside-ROI stadium derivation traces remain outside this approval scope.
- The source-stage and prepared-cache manifests remain disabled; no new solved tile profiles or geometry are activated.

## Reproduce

```sh
node scripts/test-v21-fixes.mjs physical-width-independent
node scripts/qa/physical-width-worker-independent.mjs /tmp/NEW-physical-width-worker.json
node scripts/qa/review-physical-width-independent.mjs /tmp/NEW-physical-width-review.json
```

The combined reviewer uses the held v2 actual-worker receipt, verifies every consumed hash, runs the focused controls and typecheck, and rechecks hashes before creating a new report with `wx`.
