# Whole-game browser comparison

Single sequential runs, desktop Chrome with Metal requested, High, 960 × 540, pixel ratio 1. Baseline c8f8e06 plus profiler; candidate runtime e187474. Candidate server restarted and served code verified after source freeze. No full test suite or competing browser session ran during these captures. Short final agent validation may overlap the first baseline startup; ordinary host apps remained open. Host load was not controlled laboratory hardware.

These are animation-frame intervals in milliseconds, not physical-phone results. One run per scenario is not a statistically certified performance gain. `summary.csv` includes p50 and every threshold count; raw reports include subsystem timings and one-second resource/speed samples.

## 1x CPU setting

| Scenario | Baseline p95 / p99 / max | Candidate p95 / p99 / max | Frames >50 ms before → after |
|---|---:|---:|---:|
| stationary | 18.3 / 18.6 / 18.8 | 16.8 / 16.9 / 17.4 | 0 → 0 |
| dusk | 18.1 / 18.5 / 18.7 | 16.8 / 16.9 / 17.0 | 0 → 0 |
| road-input-120 | 22.9 / 50.1 / 57.9 | 18.3 / 31.1 / 35.6 | 12 → 0 |
| flight-160-streaming | 23.8 / 36.3 / 68.4 | 19.6 / 26.0 / 39.7 | 1 → 0 |

## 4x CPU setting

| Scenario | Baseline p95 / p99 / max | Candidate p95 / p99 / max | Frames >50 ms before → after |
|---|---:|---:|---:|
| stationary | 38.8 / 48.6 / 62.0 | 39.2 / 49.4 / 52.6 | 4 → 4 |
| dusk | 33.0 / 39.6 / 46.8 | 32.7 / 41.4 / 49.0 | 0 → 0 |
| road-input-120 | 235.8 / 304.2 / 690.0 | 109.4 / 135.2 / 162.2 | 157 → 145 |
| flight-160-streaming | 157.7 / 186.5 / 225.9 | 114.9 / 128.2 / 143.7 | 198 → 187 |

## Coverage and limits

- Travel tests use the same selected road corridor, heading, graphics and normal W/Q controls. Road speed is seeded to 120 km/h, then normal traffic/collisions slow the car; it is **not** a sustained-120-km/h straight-line benchmark. Speed timelines are retained. Flight resets to the same corridor before takeoff and maintains 160 km/h in the sampled flight.
- Three newly built tiles were observed during the unthrottled candidate flight. Preparation p99/max was 2.9 ms and coherent publication p99/max 5.0 ms, including subscribers. Worker durations of hundreds of milliseconds are asynchronous worker work, not main-thread stalls. WebGL bufferData submission max was 1.5 ms; that does not measure GPU completion.
- Candidate unthrottled flight walkers.update p99 was 14.3 ms (baseline 24.5 ms). Cold avatar generation remains a risk; the longer component fixture has much larger outliers.
- The 4× rate is a synthetic DevTools CPU slowdown, **not** calibrated mid-tier hardware, an emulator GPU, or a physical phone. Even the optimized build falls well below 60 FPS there. Stationary/dusk tails are similar across builds; those scenarios do not establish a gain.
- Background timing and traffic vary. Models/terrain have separate exact-output checks; different draw counts in dynamic captures are not evidence of reduced detail.
- The last phase named delivery-transition in the travel raw JSON did not enter a cinematic; it is excluded here. The separate baseline-story/candidate-story probes explicitly require actual dialogue, Next, and resumed gameplay after loading.
- Full-world screenshots are observational comparisons, not pixel-identical comparisons: traffic, time, position and reflected lighting can vary. Geometry/style are preserved.

## Verified story and next-area transition

Actual Mahesh dialogue, delivered pizza, Next and resumed gameplay after loading. High desktop Chrome, no CPU throttle. Setup uses visible QA controls; delivery and progression use the ordinary runtime.

| Phase | Build | p50 | p95 | p99 | Max | >16.67 /25 /33.3 /50 ms |
|---|---|---:|---:|---:|---:|---:|
| Conversation to Next | baseline-story | 16.7 | 18.4 | 18.7 | 81.9 | 815 / 3 / 3 / 2 |
| Next to resumed play | baseline-story | 28.0 | 84.7 | 100.0 | 100.0 | 29 / 20 / 11 / 5 |
| Conversation to Next | candidate-story | 16.7 | 17.0 | 18.0 | 78.5 | 906 / 3 / 3 / 2 |
| Next to resumed play | candidate-story | 21.6 | 65.7 | 90.3 | 90.3 | 33 / 16 / 7 / 3 |

Loading-screen intervals are excluded from active frame intervals by design. `frame.cpu` is retained through loading; this does not measure perceived network-loading delay. The next-area capture waits for relocation/selection/pause/cinematic state to clear, then samples another second.
