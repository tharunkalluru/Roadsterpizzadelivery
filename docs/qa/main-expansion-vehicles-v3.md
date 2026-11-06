# Traffic vehicle v3 correction candidate — 2026-11-02

**Ready for a new frozen capture, not independently visually accepted.** The v1/v2 independent FAIL reports remain unchanged. This pass addresses their concrete remaining vehicle assembly defects, while preserving the v2-accepted generic motorcycle and lorry bodies.

The producer read `main-expansion-vehicles-review-v2.md` and actually inspected its rejected hatch side, sedan three-quarter, SUV side, auto front/cabin, scooter side, bus front, tanker rear, compact-truck rear, and van front/cabin/side native Chrome PNGs. The report's broader 72-image assessment belongs to the independent reviewer; this producer does not claim to have re-reviewed all 72 in this pass. The primary-reference set and source limitations remain documented in the v2 report.

## Bounded source corrections

| Reviewed defect | V3 correction |
| --- | --- |
| Hatch still looked like a sedan | Extended only the hatch roof rearward and moved its rear glass bottom close to the tail; a much more upright rear screen leaves a short deck. Other class canopies retain their successful proportions. |
| Front/rear car lamp fins | Replaced protruding tall trapezoid surrounds with shallow 25/24mm housings inset within the painted nose/tail cross-sections. Narrow lens surfaces remain attached and source anchors follow them. Tested exposed housing vertices against actual underlying painted body, rather than only checking a lens has a black backing. Tiny housing/rail-foot boxes remain low-cost parts of the existing batch. |
| Floating SUV rail rods / exposed DRL | Added two real feet per rail, embedded into the curved roof and intersecting the rail. Upper front/rear bars have shallow backing inside the painted fascia; front DRL height/width no longer extends above the tapered hood. |
| Auto head/hair intersected roof | Lowered only rickshaw driver hip .86→.76m and grips 1.15→1.05m; passenger hip .86→.78m and its cushion/backrest follow. Coordinated dedicated `rickshawDriver` / `rickshawPassenger` poses with the NPC owner so soles stay on the .33m floor rather than passing through it. Added real toe pans beside the front-wheel well because the old main pan stopped behind the actual driver's soles. Generic car/bus/goods `auto` / `bench` poses are unchanged. Exterior roof height is unchanged. |
| Hanging egg-shaped auto cowl pods | Replaced separate spheres/flat web with one continuous, shallow pressed legshield, returned sides/inner skin, conforming black lamp mask and a lower central wheel cut. Round lamps have supported rings at their updated source positions. |
| Scooter floating nacelle | Added a three-dimensional steering-neck return overlapping both apron and nacelle. Rider grip and floor/footboard coordinates remain unchanged. |
| Bus and van unsupported mirrors | Added stalks anchored in actual painted frame members: bus upper side/header to mirror, van A-pillar to mirror. The support is not anchored only in glazing or empty aperture. |
| Tanker ladder buried in end-cap | Put both rails and every rung in one clear rear plane, with stand-offs starting in the actual curved cap surface and a lower connection into the crossmember. Existing tank/cap/collision envelope retained. |
| Compact-truck plate hidden | Moved the complete rear plate to the visible rear face of the supported crossmember, clear of the tail lamp casings. |
| Van bonnet slit and outside steering wheel | Added a front return following the actual bonnet crown, closed both horizontal shoulders/corner returns, and moved driver seat, hands, wheel and column together rearward .20m. The wheel is now behind the sloped windscreen with physical clearance. Its floor/seat height and passenger bays remain. |

No traffic density, update cadence, route logic, culling/visibility, simulation timing, jump/flight/camera behavior or Roadster body/equipment/stickers were changed. The existing bus exchange schedule/path from v2 is retained.

## Verification

- Whole client TypeScript check.
- Full traffic regression run: **42/42 passed** after the v3 geometry/contact changes. Final focused production-geometry run repeated after the low-cost housing and mirror-anchor adjustments.
- `git diff --check`.
- Actual body/glazing/paint ray checks cover upright hatch rear glass, all exposed front/rear housing vertices, SUV DRL backing/rail feet, scooter neck, bus/van stalks, bonnet front and shoulder closure, steering-wheel clearance, full tanker rung visibility and rear plate occlusion.
- Auto head/hair clearance is checked against the **actual curved roof mesh** for adult shirt/kurta, elder, teen, sari/salwar/burqa and child maximum supported scales at all three passenger positions. Driver's lower fixed-scale pose is bounded by the taller tested occupants. Toe pan rays verify real .33m supporting geometry at the driver's sole locations. These structural tests do not replace the independent visual contact gate.
- Existing real prototype budgets, finite geometry, roof envelopes, bus doors/full passenger path, lamp/brake/reverse, carrier/collision and camera-orbit regressions remain.

## Current geometry sample

Same production templates and seeded models as the gallery, with the current shared NPC clothing candidate. Body-only numbers include occupants but exclude lamp/glass/decal batches, textures, JS construction arrays and city scenery.

| Model | Occupants | Body triangles | Body buffers MiB |
| --- | ---: | ---: | ---: |
| Hatch | 1 | 7,526 | .947 |
| Sedan | 2 | 10,642 | 1.340 |
| SUV | 1 | 8,724 | 1.098 |
| Cab | 2 | 10,480 | 1.319 |
| Auto | 1 | 5,458 | .687 |
| Motorcycle | 2 | 9,898 | 1.246 |
| Scooter | 1 | 6,182 | .778 |
| Bus | 5 | 19,642 | 2.473 |
| Lorry | 1 | 6,650 | .837 |
| Tanker | 1 | 7,862 | .990 |
| Compact goods truck | 1 | 6,086 | .766 |
| Passenger van | 3 | 11,546 | 1.453 |

NPC wardrobe changed since v2, including in the unmodified motorcycle/lorry bodies. These are **not** controlled v2→v3 performance deltas. The largest current bus body is below the existing 25k geometry guardrail; sample car bodies remain below 15k. New construction stays in the existing shared body/light/glazing paths and adds no real lights or new material draws. Geometry is prepared only at prototype/load time. These facts do not establish sustained gameplay FPS, heap stability or a physical-phone performance result.

## Required next evidence

Root should freeze this vehicle source with the coordinated NPC candidate and recapture changed families from all six views, including van bonnet/cockpit, auto inner headroom/cowl, car lamp edges, both bus sides and the complete rear ladder/plate. Separate reviewer must assess v3 against the actual source images and final contacts. Successful motorcycle/lorry body construction should not be reopened without new evidence.

The final integrated gates remain: accepted NPC geometry/wardrobe, actual seat/sole/hand contacts, moving bus entry/exit, night head/brake/reverse lamps, orbit persistence and jumps over bus/van, and fixed-route frame-time/memory checks. Root owns browser operation and publication. This producer has not published, self-approved visuals or asserted phone 60/90/120 FPS.
