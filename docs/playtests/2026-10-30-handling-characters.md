# Handling, IKEA road joins and scene characters — 30 October 2026

## Delivered changes

Road acceleration is gentler while retaining the 120 km/h road limit and 160 km/h flight limit. BRAKE takes priority over GO and stops at zero. A press that begins while moving forward stays stopped until released; a fresh press from rest can reverse after a 0.35-second hold. Flight, descent, jump carry, coasting, steering and water propulsion retain their existing response.

Production `Player.update` measurements at 60 simulation updates/second, on an empty flat physics fixture:

| Measurement | Before | After |
| --- | ---: | ---: |
| 0–30 km/h | 0.93 s | 2.32 s |
| 0–60 km/h | 1.87 s | 4.63 s |
| 0–120 km/h | 3.72 s | 9.27 s |
| 60–0 | 0.88 s / 6.81 m | 0.70 s / 5.65 m |
| 120–0 | 1.72 s / 27.51 m | 1.40 s / 22.87 m |

These are deterministic control/physics measurements, **not measured device FPS**. The later stop-latch refinement preserves these first-stop results. Raw comparison: [driving-tuning-comparison.json](../delivery/evidence/handling-access/driving-tuning-comparison.json).

The IKEA stop came from an existing underpass retaining cap projecting 12 cm above a crossing upper road. It could catch and turn the car into a genuine separating median. Shared terrain preparation now trims both the visible concrete cap and its collider below actual compatible road asphalt. Deep underpass walls and genuine medians remain solid; no road location, grade, junction or underpass is invented. Detailed geometry and trace results: [IKEA road-join report](2026-10-29-ikea-road-joins.md).

Scene actors now use a CC0 neutral anatomical head derivative, adult proportions, distinct facial structure, hair, clothing, hands and scene poses. They remain **stylized characters, not celebrity scans or photoreal likenesses**. The loading screen prewarms nine production style/pose templates; their indexed CPU data totals about 3.43 MiB. Instances share immutable typed arrays but own their geometry/material wrappers, preserving independent animation and disposal. See [asset provenance and resource policy](../../src/delivery/characters/README.md) and [build metrics](../delivery/evidence/handling-access/character-build-metrics.json).

## What was actually tested

- **Manual browser play:** 667×375 phone-sized HUD, one pointer at a time. On the frozen pre-fix IKEA south snapshot, holding GO for 15 seconds stalled. After the repair, actual touch GO for 3 seconds, right steering for 0.6 seconds, GO for 2 seconds and BRAKE for 0.8 seconds advanced about 38 m; final support remained `road`. [Before](../delivery/evidence/handling-access/ikea-south-before.png) · [After on road](../delivery/evidence/handling-access/ikea-south-after-road.png).
- **Manual stopping check:** touch GO for 4 seconds followed by BRAKE for 0.8 seconds reached zero. [Stop evidence](../delivery/evidence/handling-access/touch-brake-stop.png).
- **Automated simulations:** the broader 180 m multi-edge IKEA trace, both traversal directions, 30/60 Hz update rates and both quality modes ran in Node with packed city data and production Player physics. These are not manual drives. Tuning additionally covers 30/60/120 Hz, partial throttle, conflicting inputs, stop/hold/release/repress, moving-truck handoffs, jump pickup and water behavior.
- **Integrated character play:** at 667×375, prepared a Level 6 order with the visible development QA button, then manually flew to the lake, landed, approached, completed the call, watched the character emerge and threw the pizza. The real catch animation reached the visible delivery-complete card. This verifies the call-to-handoff path; it does not claim a fresh jump pickup in this run. [Completion](../delivery/evidence/handling-access/level6-touch-complete.png).
- **3D art comparison:** reviewed the production Pushpa seated reader and standing Simhadri from front and three-quarter views against the previous primitive actors. [Pushpa](../delivery/evidence/handling-access/characters-pushpa-comparison.png) · [Simhadri](../delivery/evidence/handling-access/characters-simhadri-comparison.png). Truck and IMAX seat contacts and handoff endpoints also have mesh-vertex regressions.
- **Final combined verification:** `npm run check` passed 382 current tests, 38/38 portable legacy suites, TypeScript checks and the production build. Legacy landmark drives allow more acceleration time while retaining their distance, wheel-contact and parking assertions.

No physical-device FPS, heat or battery result is claimed. The browser trace and bounded nearby road audit do not certify every Hyderabad junction; the shared geometry repair and explicit negative cases provide broader regression coverage without removing legitimate barriers.
