# Bus/service legacy failure audit — 2026-11-02

The reported `3 !== 2` failure is an outdated auto-decoration fixture, **not** a bus passenger-count, door-path or dwell regression. No production source was changed in this repair.

## Reproduced cause

Running `node tests/legacy/bus-service-regressions.mjs` against the held v3 source reproduced the exact assertion at line249 after the first seventeen groups passed. The final auto-text test expected exactly two `decals`, because the earlier model only had the plate and Telugu quote. Production now correctly includes a third untextured clear-windscreen geometry in that list. The failure occurred before the imported bus-execution suite could run.

The suspected obsolete front-door fixture coordinate was not involved in this assertion. Actual bus doors remain at local z−4.7/+4.4 and the new floor/path tests retain those coordinates.

## Bounded correction

Only `tests/legacy/bus-service-regressions.mjs` was changed:

- Require exactly three surfaces, classified as one clear untextured glazing material and two printed identity materials.
- Require the actual quote material to carry the precise configured Telugu lines and the other material to carry a valid auto rear registration. This uses each material's own canvas texture instead of relying on whichever canvas happened to be allocated last.
- Require distinct quote/plate materials, rear-facing normals, positions outside the actual rear skin and vertical separation so a quote cannot replace/cover its plate.
- Preserve all ten unique quote IDs, Telugu content and cited-source checks.

This retains and strengthens the intended plate/quote checks. It does not accept an arbitrary third object or relax a bus count/timing assertion.

## Verification and boundaries

- Red before the correction: exact `3 !== 2` reproduced in the isolated legacy suite.
- Green after: **18/18 bus/service/street-text groups**, then **7/7 production bus execution groups** passed. The latter includes actual five-to-six-second RTC dwell at 30/60Hz, visible boarding/alighting, fixed bus pose throughout dwell, route/stop identity, resuming without creep/spin and cleanup.
- `node scripts/test-v21-fixes.mjs traffic`: **42/42 passed**, including four-person exchange policy, real door/floor paths, jamb clearance, lamps and collision/visibility contracts.
- `node scripts/test-v21-fixes.mjs pedestrian-geometry-lifetime`: **5/5 passed**, including bus exchange removal/geometry release and bounded retention during repeated real pedestrian spawns. `git diff --check` passed.

Held production hashes are unchanged: `traffic_models.ts` `6f071ad577d82f88b6e321d5927f769b6e829628cb48b01f2e954fb2fa44b936`; `traffic-coachwork.ts` `20f910ccaceea0005db744b452a2eb094bee9d822b759488f66ba0af6bce9ba8`; `bus-passengers.ts` `7f6db22777babb992fc4b0255ee36742d515f194758e4c7b24f081605ea6c4b3`.

The separate curved-platform legacy failure from the full run is outside this repair and remains Root-owned. This is not a claim that the whole legacy suite or integrated physical-device testing has passed. No UI/browser, publishing or commit operation was performed.
