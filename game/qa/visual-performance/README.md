# Roadster visual and performance review

The current **v2** pass responds to distracting driving text and refines the car, camera, street presentation and game flow. It is a local, code-only continuation of survey 133. Main public Site revision 113 and the existing private preview are unchanged. The world still has zero verified storefronts/sides; the provisional gate and verified-mode lock remain.

## Run the local preview

Use Node.js 22.12 or newer. From `game`, run `npm ci`, then `qa/visual-performance/start-preview.command`. Open <http://127.0.0.1:5486/preview.html>. The server binds only to localhost. Select an order, drive to the pickup, collect the pizza, then drive to the handover.

While stopped, drag and briefly hold the view to inspect a nearby sign. Names never appear automatically during driving or flight. Inspection shows at most one compact roadside label, after a continuous 350 ms hold, with a 1.5-second reading window after release. The name comes from an already-rendered board, remains provisional, and wraps to show the full name in at most three lines; names too long for that bound stay on the physical sign and map. Full physical signs and map context remain available.

## What changed in v2

| Previous pass | Current pass |
| --- | --- |
| Up to four large automatic phone name cards | One optional full roadside name, up to 60 px tall; no helpers while moving or airborne |
| High chase view and uniformly brown rear canopy | Lower stable chase view, restrained turn anticipation and smoked glass with reflected colour |
| Warm, flat road/building values | Clearer daylight contrast, charcoal road and neutral paving; source facade colours preserved |
| Large separate status cards and passive flight prose | Compact timer/cargo and boost gauge, accurate fractional reserve, critical flight feedback retained |
| Long ready instructions and score inside details | Short ready handoff with expandable controls; existing score/time/pizza condition foregrounded |
| Static transforms recomputed every render; off-tile geometry built then discarded | Completed static transforms cached; off-tile geometry emission skipped while shared road preprocessing stays intact |

The design review used official [Absolute Drift](https://www.absolutedrift.com/) (clear driving space and sparse accents), [art of rally](https://www.artofrally.com/) (coherent colour and directional depth), and [Horizon Chase 2](https://www.horizonchase2.com/) (car readability and compact racing feedback) references. These are principles translated into original game code, not copied assets or claims of equivalent production quality. The original white vehicle remains inspired by the [current Tesla Roadster](https://www.tesla.com/roadster); dimensions, underside jets and flight actuation are authored game approximations.

## Reproduce current checks

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
