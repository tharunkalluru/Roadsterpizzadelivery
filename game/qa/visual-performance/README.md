# Roadster visual and performance review

This is a local, code-only review of survey 133. It does not deploy a Site or make the provisional world fully mapped. The original geometry uses the [current Tesla Roadster](https://www.tesla.com/roadster) as a visual reference; underside/side jet positions, scale and actuation are authored game approximations, not engineering specifications. The existing flight simulation is unchanged.

## Run the preview

Use Node.js 22.12 or newer. From `game`, run `npm ci`, then `qa/visual-performance/start-preview.command`. Open <http://127.0.0.1:5486/preview.html>. The server binds only to localhost. The provisional gate is intentional; choose a job and drive to collect its pizza.

The local inspection sheet at <http://127.0.0.1:5486/qa/visual-performance/vehicle.html?view=flight> shows the original vehicle and cold-gas effect separately from gameplay. Other views are `front` and `rear`. This sheet is excluded from the production entrypoints.

## Reproduce checks

With the current preview on port 5486:

```sh
node qa/visual-performance/benchmark.mjs after 5486
node qa/visual-performance/regression.mjs
node qa/visual-performance/vehicle.mjs
```

Scripts use the installed macOS Google Chrome executable and `@playwright/test`. Adjust the executable path on other operating systems. Generated output goes to `game/output/visual-performance/`; selected review evidence is retained alongside this README.

The before benchmark uses an isolated checkout of `6485be98021aaba9d2323c2cbd111830940c0c41`, its dev server on port 5487, and the same benchmark script with arguments `before 5487`. Do not compare runs while another browser, build, or test workload is active.

## What the measurements mean

- Stationary benchmark: the same normal spawn, viewport and forced graphics setting, 2-second warm-up and 10-second render sample. Simulation is manually frozen. It measures scene rendering, not full moving gameplay.
- Separate regression: actual touch emulation for selection, cancellation, pizza collection and handover; the reference driver moves through real physics from normal spawn. Three jobs include a retry. No teleports. Orientation, accelerator/steering cancellation, original steering calibration and small-screen control hit targets are checked.
- Moving sample: 15 seconds of normal clock and real physics, then an additional 15 seconds at 4× desktop CPU throttling. Throttling is a desktop pressure test, not a model of any particular phone.
- Draw calls, triangles, renderer-owned resource counts and resolution come from Three.js. JS heap after explicit CDP garbage collection is a retained-heap diagnostic outside the timed render sample. Raw snapshots vary with GC; neither measure is peak usage, GPU bytes, total RAM, or physical-phone certification.
- Loading bytes/times come from the Vite development server and local caches. Production gzip bundle sizes are reported separately; the unchanged 49.1 MB decoded survey/core/source-accuracy/listing datasets remain a substantial loading and memory floor.
- Four repeated same-spawn resets record resources and retained heap after a moving delivery journey. A larger streamed scene than the initial spawn is expected; compare consecutive reset snapshots, not different camera locations.

The world-label pool has six reusable label containers, with at most four shown on phone widths, 80 m range and 10 Hz placement. Including their spans and root, the fixed pool contains 25 DOM elements. Exact footprint/height intersection hides labels behind loaded buildings; door/access cutouts are conservatively treated as solid. Labels repeat existing rendered sign text and preserve provisional status. They do not invent names, shops, entrances or verification evidence.

## Recorded result

The [review checkpoint](../../work/visual-performance-survey133/checkpoint-20261021.md) records the source binding, tests, frozen hashes and limitations. The [before](evidence/before-metrics.json) and [after](evidence/after-metrics.json) stationary samples remain display-capped on the test Mac. Low graphics changes from 179 to 177 draw calls and 32 to 29 textures; standard keeps 278 draw calls and changes from 35 to 31 textures. Retained JavaScript heap is effectively flat, about 139–140 MB; this is not a claim of reduced total RAM or certified phone performance.

Inspect the [before phone view](evidence/before-phone-low.png), [after phone view](evidence/after-phone-low.png), [568 px phone names](evidence/after-phone-labels-568.png), [pickup storefront name](evidence/after-pickup-names-844.png), [actual flight](evidence/after-flight-phone.png), and [vehicle inspection](evidence/after-roadster-flight.png). [Regression evidence](evidence/after-regression.json) includes three successful delivery journeys, four stable resets and the separate moving-clock samples. [Production sizes](evidence/production-code.json) are separate from development-server loading measurements.
