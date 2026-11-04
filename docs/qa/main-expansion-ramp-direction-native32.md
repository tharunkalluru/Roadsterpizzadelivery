# Native QA32 ramp traffic direction finding

**Finding: wrong-way QA staging on a one-way carriageway. No NPC one-way implementation change.** The supplied QA start faced against the permitted direction of `c32df37f-b8f_0`. The three head-on pickup offers in `canonical-ribbon-native32/02-ramp-traffic-blocked.jpg` therefore do not establish an NPC direction bug.

The frozen native target is `/tmp/roadster-final-frozen-qa-32`, runtime fingerprint `32facfce6729c09d953831f0278b0cb51d7b3f603b05d7f9a2a709537a68c8fe`, origin `http://127.0.0.1:4282`. This review used no Chrome control and changed no production source or traffic behavior.

The road runs from `(-14489,-2947.6)` to `(-14778.3,-1875.9)`. Its `oneway: backward` field names the **denied** heading: production `RoadGraph.addRoads` permits only `dir: +1`, and ordinary `Traffic.spawn` applies the same rule. Those exact direction tests also occur in the frozen QA32 index bundle; its observed SHA-256 matches the freeze manifest. Frozen/current core and nearby source-pack bytes match. The complete current build fingerprint differs from frozen QA32, so this is a narrow input/code binding, not a claim that the complete current build equals the freeze.

The actual `World`/`RoadGraph` CPU probe gives these results. Player forward is `(-sin(yaw),-cos(yaw))`; a dot product near -1 means the player faces against the legal road tangent.

| Supplied player X,Z | Yaw | Legal tangent X,Z | Player/legal dot |
| --- | ---: | --- | ---: |
| -14534.002, -2821.428 | -0.3414524 | -0.327915, +0.944707 | -0.999973 |
| -14500.16, -2916.66 | -0.3414524 | -0.430979, +0.902362 | -0.994584 |
| -14490.45, -2944.15 | -0.3978744 | -0.387460, +0.921887 | -1.000000 |

The ordinary production `Traffic.spawn` probe used the real prepared core, default RNG seed 77 and production vehicle models. Of 5,000 spawn attempts, 1,046 were accepted: zero violated their road's allowed direction and zero had a visual/path heading mismatch. All 254 accepted spawns on `c32df37f-b8f_0` used `dir: +1`. The model front is local -Z; `atan2(-hx,-hz)` points that front along the actual NPC path. This probe omitted city obstacle filtering and does not constitute a collision, native-drive or performance pass.

`CarrierMarker` owns only the pizza markers. Its selection prefers vehicles ahead and moving with the player, but opposing heading is a score penalty rather than an exclusion. With the player facing the wrong way, eligible real traffic ahead can consequently provide three head-on offers. Existing NPC following and swept-overlap checks brake for the player; the exact native NPC state/clock was not captured, so this review does not claim a frame-exact collision replay or a collision defect verdict.

Root's corrected isolated QA yaw is `2.8001402152800905` (original yaw + pi), with the other start values and frozen QA32 unchanged. Its legal-direction dot is `+0.999973`. `qaStart` and **Reset drive start** apply the supplied yaw literally, so correcting the test pose is the appropriate next step. A fresh legal-direction native drive remains separate evidence.

Evidence: [ramp-direction-read-only.json](evidence/main-expansion/canonical-ribbon-native32/ramp-direction-read-only.json), [probe source](evidence/main-expansion/canonical-ribbon-native32/ramp-direction-probe-source.ts), and the retained [blocked screenshot](evidence/main-expansion/canonical-ribbon-native32/02-ramp-traffic-blocked.jpg). The source artifact was compiled with esbuild's TypeScript stdin loader and the repository root as `resolveDir`; it is retained as the exact probe input, not a production entry point. The first road/tangent observer's full raw output remains `/tmp/native32-ramp-direction.json`.
