# Roadster visual and performance review

The current **v3** pass reduces scene and material work while retaining the v2 car, camera, street presentation and game flow. It is a local, code-only continuation of survey 133. Main public Site revision 113 and the existing private preview are unchanged. The world still has zero verified storefronts/sides; the provisional gate and verified-mode lock remain.

## Run the local preview

Use Node.js 22.12 or newer. From `game`, run `npm ci`, then `qa/visual-performance/start-preview.command`. Open <http://127.0.0.1:5486/preview.html>. The server binds only to localhost. Select an order, drive to the pickup, collect the pizza, then drive to the handover.

While stopped, drag and briefly hold the view to inspect a nearby sign. Names never appear automatically during driving or flight. Inspection shows at most one compact roadside label, after a continuous 350 ms hold, with a 1.5-second reading window after release. The name comes from an already-rendered board, remains provisional, and wraps to show the full name in at most three lines; names too long for that bound stay on the physical sign and map. Full physical signs and map context remain available.

## What changed in v3

- Metro timetables still contain all 82 services. Only nearby services acquire a train rendering hierarchy; invisible trains return to a detached reserve of at most four rigs. Every visible train remains represented, regardless of the reserve size. Geometry, movement, doors, sound, headway and visibility distances are preserved.
- The same 176 traffic-signal heads use 41 spatial batches, 328 mesh objects and seven shared materials. Signal timing still comes from the simulation. Lamp buffers change only when a displayed state changes; tile bounds are refreshed then. Local tile coordinates preserve placement precision.

At the same low/standard spawn, scene nodes fell **5,896→3,409 / 6,002→3,559**, retained JavaScript heap fell **143.19→132.79 / 143.30→133.99 MB**, and triangles stayed **179,694 / 536,010**. Draw calls stayed 176 on low and fell 278→270 on standard. The 4× desktop CPU-pressure sample's mean frame work fell **5.84→4.03 / 7.75→5.84 ms**. These are matched-run snapshots, not universal savings; native timings varied across captures; both remain display-capped near 60 Hz. This is not a physical-phone FPS or total-RAM result, and computing has no zero-cost mode.

Source, exact measurements, tradeoffs and validation are recorded in the [v3 checkpoint](../../work/visual-performance-survey133/checkpoint-20261021-v3.md). [Before phone](evidence-v3/before-phone-low.png), [after phone](evidence-v3/after-phone-low.png) and [after desktop](evidence-v3/after-desktop-standard.png) retain the same appearance. Signal batch culling can submit additional offscreen triangles near tile edges; the isolated close-up checks explicitly record this tradeoff and compare the resulting pixels.

Run current checks serially against the preview on port 5486:

```sh
node qa/visual-performance/v3-profile.mjs v3-after 5486
node qa/visual-performance/v3-fidelity.mjs
node qa/visual-performance/v2-regression.mjs v3-after
node qa/visual-performance/v2-inspection.mjs v3-after
node qa/visual-performance/v2-workload.mjs v3-workload 5486
```

The exact v3 baseline is `e68ad6a55bb4a17ce178b55ca58ab12c419ee599`. A baseline server must serve that source separately; pass its port and source directory to the profiler (`node qa/visual-performance/v3-profile.mjs v3-before-matched 5487 /path/to/baseline/game`). The profiler's method wrappers and framebuffer readbacks belong only to QA. Raw profiles/logs remain scratch output. The v2 scripts now accept an optional output phase so new runs preserve the historical v2 records.

## Retained v2 presentation

| Previous pass | Current pass |
| --- | --- |
| Up to four large automatic phone name cards | One optional full roadside name, up to 60 px tall; no helpers while moving or airborne |
| High chase view and uniformly brown rear canopy | Lower stable chase view, restrained turn anticipation and smoked glass with reflected colour |
| Warm, flat road/building values | Clearer daylight contrast, charcoal road and neutral paving; source facade colours preserved |
| Large separate status cards and passive flight prose | Compact timer/cargo and boost gauge, accurate fractional reserve, critical flight feedback retained |
| Long ready instructions and score inside details | Short ready handoff with expandable controls; existing score/time/pizza condition foregrounded |
| Static transforms recomputed every render; off-tile geometry built then discarded | Completed static transforms cached; off-tile geometry emission skipped while shared road preprocessing stays intact |

The design review used official [Absolute Drift](https://www.absolutedrift.com/) (clear driving space and sparse accents), [art of rally](https://www.artofrally.com/) (coherent colour and directional depth), and [Horizon Chase 2](https://www.horizonchase2.com/) (car readability and compact racing feedback) references. These are principles translated into original game code, not copied assets or claims of equivalent production quality. The original white vehicle remains inspired by the [current Tesla Roadster](https://www.tesla.com/roadster); dimensions, underside jets and flight actuation are authored game approximations.

## Historical v2 checks

With the local preview running on port 5486, execute these **serially**:

```sh
node qa/visual-performance/benchmark.mjs v2-after 5486
node qa/visual-performance/v2-regression.mjs
node qa/visual-performance/v2-inspection.mjs
node qa/visual-performance/v2-workload.mjs v2-workload 5486
```

Scripts use installed macOS Google Chrome and `@playwright/test`. Adjust the executable path on other operating systems. Scratch output is in `game/output/visual-performance/`. Selected original-game screenshots and records are retained in [evidence-v2](evidence-v2/). The frozen v2 baseline is commit `39a3c306d5d3c5aa96ff03c54d7e5c1477aa817e`; reproducing that baseline requires serving that commit separately and passing its port to `benchmark.mjs v2-before PORT`.

- **Stationary benchmark:** same normal spawn, viewport and forced quality, two-second warm-up and ten-second rendered sample with manual simulation clock. The camera framing intentionally changes in v2, so draw counts are scene budgets, not an isolated optimization experiment.
- **Delivery regression:** three normal-spawn real-physics journeys using the reference driver and actual emulated touch for selection, collection/cancellation and handover; control calibration, orientation, small layouts, four resets, normal-clock driving and flight/landing.
- **Final inspection check:** passive view, two interrupted short holds, continuous hold, single roadside name and reading-window expiry. Clean screenshots hide the diagnostic panel.
- **Paired work diagnostic:** same scene with cached transforms versus temporarily restored automatic updates, 60 frames each, exact world-matrix equality and flag/method restoration. Instrumentation measures call counts, not frame-rate gains.

The source [checkpoint](../../work/visual-performance-survey133/checkpoint-20261021-v2.md) records exact validation, measurements, frozen hashes and limitations. The narrow interrupted-hold and full-name-wrapping fixes followed the complete delivery regression; final focused tests and the actual-browser inspection check validate those changes.

## Evidence and limits

Start with [before phone](evidence-v2/before-phone-low.png), [current phone](evidence-v2/after-phone-low.png), [current desktop](evidence-v2/after-desktop-standard.png), [moving](evidence-v2/moving-phone.png), [flight](evidence-v2/flight-phone.png) and [parked inspection](evidence-v2/parked-inspection.png). [Metrics](evidence-v2/after-metrics.json), [delivery regression](evidence-v2/regression.json), [inspection](evidence-v2/inspection.json) and [paired workload](evidence-v2/workload.json) retain the underlying observations.

The M2/ANGLE samples remain display-capped around 60 Hz. This does not establish a physical-phone frame-rate improvement. Retained JavaScript heap remains roughly 139–140 MB at initial spawn, and the unchanged decoded survey/core/source-accuracy/listing files total 49.1 MB. They remain necessary for streamed source reconciliation, navigation and full map/search context; this pass does not prune evidence or change the immutable package. GPU/system/peak memory, thermal behaviour and actual mid-range hardware remain unmeasured. Development-server load timing is cache-sensitive. Flat contact shadows approximate road slopes and curbs.

## Historical v1 evidence

The previous pass remains documented in [checkpoint-20261021.md](../../work/visual-performance-survey133/checkpoint-20261021.md) and the unchanged [evidence](evidence/) directory. Its six-container/four-visible automatic label design and v1 measurements are historical, superseded by v2. The [vehicle inspection sheet](http://127.0.0.1:5486/qa/visual-performance/vehicle.html?view=flight) remains available locally and is excluded from production entrypoints.
