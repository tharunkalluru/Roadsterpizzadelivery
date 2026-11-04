# Railway route and rendering continuity — 2026-10-30

## Diagnosis and changes

The simulation previously built a finite route from the tile-resident railway inventory at spawn. Exact mapped continuations at some station turnouts were outside the mutual-straight base chain. Coaches were hidden independently as their centers passed that route end. Separately, complete source ways could be simulated outside the currently installed city-tile rail geometry.

- Game now supplies a cached complete canonical non-service railway inventory. Tile unloading cannot shorten it or change the railway coordinates/elevations.
- Directed onward routing accepts exact shared source endpoints, compatible height and forward tangent, under permanent direction reservations and existing whole-rake swept collision checks. The base-chain pairing logic is retained. No nearby unjoined tracks, gaps, U-turns or invented line segments are inserted.
- Source limits and blocked onward paths brake the complete train before any coach leaves its route. Valid short continuations can restart a stopped rake smoothly. Only a whole distant train is retired; an occupied rear coach prevents premature cleanup.
- A bounded track-only fallback reuses the normal canonical renderer in 250m chunks where full city geometry is absent. It prepares one new chunk per frame and suppresses itself immediately when the normal 1km city tile is installed. Exact ballast, steel, bridge datum and quality-dependent sleepers are retained, without introducing terrain over real underpasses. Geometry caches are bounded and shared materials are not disposed by the layer.

## Verification

`npm run check` passed: **478 current tests, 38 portable legacy suites, client/Worker TypeScript and production build**.

New regressions include actual source continuations `w1316254560 → w826105532`, `w817723528 → w826105531`, and `w826136279 → w817584040`. Actual Player updates stay carried on all eight test coaches for 60 simulated seconds past each former route end. Both directions, changing/lost streamed inventories, 0.1m unjoined-end rejection, opposing flow, whole-rake endpoint hold, atomic cleanup and late 100m continuation restart are tested. Independent review rechecked the exact source joins and stopped-train restart.

Renderer tests inspect real canonical geometry in a tile absent from the shipped pack index, loading/unloading replacement, boundary ownership, both rakes, quality, bounded preparation/cache and geometry disposal.

### Actual browser ride

The isolated Level 2 scenario ran at 800×360, Low graphics, with touch controls. The DEV launcher skipped pickup and staged normal descent above a real rear coach; it did not attach the car, alter train speed or advance simulation time artificially. Visible diagnostics were toggled with F2.

- At 97 active seconds: the car was carried on `rail:0:12`, the rake had **13/13 visible coaches**, 63 mapped ways and about 2977m remaining. Track offset was 0.00m.
- At 171 seconds: the same rear coach remained supported, **13/13 coaches** remained visible and track offset was 0.02m.
- A later forward traversal reached coaches 11, 10, 9 and 8. The car subsequently left the roof during the high-speed traversal; that interval is not counted as continuously carried contact. The train itself retained all 13 coaches and its customer/coach identities.
- At 322 seconds: the same train had continued to **65 mapped ways**, still **13/13 visible coaches**, rather than dissolving at the former finite route end.
- After reboarding the same physical rear coach with the DEV staging button, observations at 475 and 579 seconds showed supported contact, **13/13 coaches**, 67 mapped ways and 0.02m track offset. Camera rotation retained visible train and mapped rails. The late train was safely waiting near its route boundary; these observations do not claim an uninterrupted journey beyond every source limit or blocked junction.

`ride-observations.json` and the screenshots are actual visible diagnostics and gameplay captures. The labels `ride-terminal.png` and the late observations describe the boundary check; endpoint behavior itself is established by the dedicated actual-Player regression tests.

No live campaign progress was reset. These checks establish route/rendering behavior in the browser; they are not physical-phone FPS, heat or battery measurements. The original Version 21 deployment is unchanged.
