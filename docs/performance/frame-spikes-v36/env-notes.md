# Environment capture experiment

The shipped `Game.applyClockMood` runs every 0.5 seconds. Its `skyTop + skyHor` key changes almost every tick at dawn/dusk, issuing a complete synchronous `PMREMGenerator.fromScene` for each change. A replay of the actual `moodAt` values counted 174 captures over the 87.5-second dawn, 141 over the 70-second dusk, and 314 over the 600-second game day, including the first capture. At a three-second successful-capture interval these counts become 30, 24 and 56.

`src/core/engine.ts` now limits successful reflection recaptures to one per three seconds while retaining the existing key change test. Every mood update still applies visible sky uniforms, fog, sunlight, hemisphere lighting, exposure, emissive lighting and environment intensity. Empty keys bypass the interval at initialization, after context restoration and after explicit source release. A failed capture keeps the old target and timestamp, allowing retry. The existing `EnvironmentSkyCapture` continues to own one private source scene, geometry and material, preserving its shader program. Capture size, geometry, sigma, textures, materials, lighting quality and bloom are unchanged.

Opt-in diagnostics measure `environment.capture` and `render.submit` CPU submission durations. These measurements do not promise GPU completion. The standalone browser probe additionally invokes `gl.finish()` to measure bounded completed work; those synchronizations exist only in the probe.

## Actual WebGL probe

Chrome on Apple M4, ANGLE Metal, 800 × 450, pixel ratio 1, High graphics. Baseline port 4401 is the instrumented frozen `c8f8e06` source. Candidate port 4402 contains only the environment schedule changes relevant to this standalone scene. The probe uses the actual `Engine`, sky, composer, PMREM and three reflective spheres at roughness 0.15, 0.42 and 0.85. It advances the production mood schedule with virtual timestamps so the 70-second dusk can be replayed without changing runtime constants. It is an isolated capture benchmark, not gameplay or mobile FPS evidence. One startup capture is excluded from the timed sample.

| CPU submission measurement | Baseline | Candidate |
| --- | ---: | ---: |
| Captures during transition | 140 | 23 |
| Total milliseconds | 294.2 | 50.2 |
| p50 milliseconds | 1.9 | 2.2 |
| p95 milliseconds | 2.4 | 2.5 |
| p99 milliseconds | 2.9 | 2.8 |
| Maximum milliseconds | 20.8 | 2.8 |

The optimization reduces capture frequency by 83.6% in this sample. Individual capture costs remain similar. The baseline maximum is a single host-run outlier and cannot establish a repeatable maximum-frame improvement. Total GPU-completed sample times were 294.4 ms and 50.3 ms. Whole-game frame intervals must be assessed separately, and physical Android phones remain unverified.

`env-probe.mjs` reproduces the capture probe when the baseline/candidate Vite servers listen on 4401 and 4402. Supply `PLAYWRIGHT_MODULE` with an installed Playwright package module path if the package is unavailable on the default Node resolution path. JSON files include each capture sample, renderer, material memory and linked program count.

## Visual and regression checks

`env-baseline-dusk-2_5s.png` and `env-candidate-dusk-2_5s.png` share the same camera, viewport, visible mood and geometry. At that moment the candidate reflection is held at the preceding sample. Direct inspection shows matching sky, ground, silhouette, shadows and highlights, with a small reflection difference. `env-visual-difference.json` records a mean absolute channel difference of 0.886 out of 255 over the complete image and 1.608 over the sphere crop, with a maximum channel difference of 5. This is one sampled moment, not proof that every transition is imperceptible on physical phones. The full-game dawn/dusk replay remains the relevant final visual check. The three-second interval intentionally favors smaller reflection changes over the larger four/five-second alternatives.

Eight focused tests in `tests/v21-fixes/engine-environment-ownership.test.ts` pass. They exercise source and target ownership, uniform/program identity, exact capture inputs, failed captures/retries, release idempotence, BFCache/context recovery, the time budget, current visible lighting during held reflections and immediate recovery before the interval expires.

An individual PMREM recapture remains synchronous and can still cause a spike on slower GPUs. This change reduces its frequency without reducing its quality. No physical-phone 60 FPS claim is made.
