# Previous versus optimized Roadster: browser measurements

2026-10-28, 13:58–14:18 UTC. **The optimized build improves this repeated stationary, CPU-limited Game scenario. Physical-phone testing remains blocked by the unavailable signed-in Chrome control connection.**

The complete record contains 12 sequential production-build runs: three old/new pairs for a High static city view and three pairs for a Low live Game at RTC X Roads. All were visible; none recorded an application error. Each pair alternated order: baseline/candidate, candidate/baseline, baseline/candidate.

## Live Game at RTC X Roads

| Metric: median of three runs | Version 21 | Optimized |
| --- | ---: | ---: |
| Presented FPS | 52.44 | 59.76 |
| p95 presented-frame interval (ms) | 23.50 | 18.90 |
| p99 presented-frame interval (ms) | 26.60 | 19.90 |
| Median CPU per Game callback (ms) | 17.80 | 8.40 |
| p95 CPU per Game callback (ms) | 22.60 | 11.30 |
| Median draw calls | 559 | 492 |
| Median triangles | 447,882 | 530,808 |
| Observed end JS heap (MiB; no forced GC) | 269.5 | 273.1 |

Presented FPS rises **13.9%** in this bounded observation. Median Game-callback CPU time falls **52.8%**. The optimized p95 frame interval passes the existing 20 ms stationary-window target; Version 21 misses it. The previous moving-delivery test's 22.5 ms p95 miss is retained and is not superseded by a stationary pass.

Every run uses the same public `?area=RTC%20X%20Roads&q=low&perf=1` entry, saved clock, initial car position, camera, quality, 1280 × 592 drawing buffer and 60 FPS request where supported. The real Game, traffic, metro/rail, walkers, world and interface keep running. There is no keyboard/touch input, developer autopilot, teleport or injected simulation step. The car stays at the same location in both versions. This is an **instrumented stationary production-Game observation**, not a driving benchmark or controlled deterministic actor replay. Exact traffic populations and deferred decisions were not locked or captured as an equality gate; timing differences must not be attributed to one optimization alone.

The isolated fixture save uses `total=1` only to unlock orders OFF and remove offer interruption. That is **not a completed delivery**. User progress in the existing game browser and normal Chrome profile is untouched.

Each run warms for 25 seconds, then measures 90 seconds. Frame rates are actual rendering calls over the window, not a UI FPS label. CPU measures synchronous work; it is not a GPU-completion timer. The wrapper's overhead was not independently subtracted. The summary includes each run, median absolute deviation (MAD), raw samples, residency and errors.

Long tasks remain: baseline **2** across three measured windows (worst **87 ms**); optimized **3** (worst **86 ms**). These tasks were not causally attributed. This does not pass a universal hitch-free/50 ms gate. No application exception or background-tab transition occurred.

## High static city view

| Metric: median of three runs | Version 21 | Optimized |
| --- | ---: | ---: |
| Presented FPS | 60.00 | 60.00 |
| Median render submission CPU (ms) | 4.10 | 4.10 |
| p95 render submission CPU (ms) | 5.30 | 5.40 |
| Median draw calls | 536 | 410 |
| Median triangles | 1,286,456 | 648,121 |
| Observed end JS heap (MiB; no forced GC) | 471.1 | 304.6 |
| Resident tiles | 12 | 7 |
| Uploaded geometry objects | 486 | 1,287 |

All three old/new screenshot pairs are **byte-identical PNGs**, independently checked with SHA256. Draw calls fall **23.5%** and triangles **49.6%** for this same visible output. Median render submission time remains effectively unchanged at 4.1 ms; both versions sustain 60 FPS here. No extra FPS gain is established for this view.

The public still-camera path uses `(30,6,40)` looking at `(0,2,-60)`, day mood, 650 m requested radius, 1280 × 592 at DPR 1. Each run warms for 15 seconds and measures 45 seconds. Resident tile count differs intentionally because the versions publish/retain data differently. Equal screenshots prove equivalence of this captured view, not equal full-city residency or all-city quality. More uploaded geometry objects in the optimized build reflect its different chunk/instance organization; object counts are not VRAM measurements. The lower observed static JS heap is not a retained-memory or battery claim, and the live Game heap did not decrease.

## Source and environment

- Previous source: `bd7313d6d20cb3f6a448bedb2e52bccd269b1bba`, production `index-Deiow6w-.js`, served locally at port 4201.
- Optimized source: `200af62af70dc4b682d601e11ff51db04d2f67d9`, production `index-Dtm1sKiN.js`, fingerprint `d178c429fa808a6845ded32aef78011288d4d03df898c80b3d9455fe4996fe3e`, served locally at port 4199. Application source stayed frozen during these runs; the follow-up adds diagnostics and evidence only.
- Same headed Chrome 156 on the Mac mini M4, same viewport, GPU backend and **4.04× calibrated CPU slowdown**. No Android emulator ran concurrently. Other owned gameplay remained paused. Account-connection checks and small artifact reads occurred on the host; no parallel rendering benchmark or remote-device video session ran.
- CPU slowdown approximates slower CPU execution; it does not reproduce a phone's GPU, thermals, battery or display. Neither 90 nor 120 FPS is certified by these 60 Hz observations.
- Tracked city/transit data has no Git diff between versions; core and bus-feed pack hashes match. [Integrity manifest](evidence/browser-ab-20261028/integrity.json).

## Physical-device status

Account use is authorized. The isolated test browser has no account session, and attaching to normal Chrome reports that `DevToolsActivePort` is missing. The pending action is `chrome://inspect/#remote-debugging` → **Allow remote debugging for this browser instance**, followed by any connection confirmation or human-only provider authentication. ADB currently lists no devices. No new physical-phone FPS, heat or battery result exists. [Access evidence and prepared hardware procedure](physical-device-followup.md).

## Reproduce and inspect

Start the two frozen local production previews. Open an isolated owned browser using the Playwright skill wrapper with `-s=roadster-ab open about:blank --headed`, then run `node scripts/browser-ab.mjs`. The runner creates a fresh timestamped original directory; it never modifies application source. `node scripts/summarize-browser-ab.mjs <original-directory>` produces the statistics. `--static-only` and `--full-only` restrict the suite; the full suite requires 12 results.

[Machine-readable comparison](evidence/browser-ab-20261028/summary.json) · [All original sample archives and screenshot hashes](evidence/browser-ab-20261028/integrity.json) · [Run protocol](evidence/browser-ab-20261028/manifest.json).

Original JSON/CLI callbacks and screenshots remain in `output/playwright/ab-2026-10-28T13-58-48.969Z`. Compressed JSON archives round-trip exactly to the original bytes; original PNGs are copied into the evidence directory. These benchmark minutes are separate from the earlier active-play duration ledger.
