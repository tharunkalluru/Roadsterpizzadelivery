# Version 21 water, railway and mobile follow-up

Base: the deployed Version 21 patch at `ed20eeb9bc6c35789ffddba01a261b0bb910dccc`. Frame timing, ground/flight speed limits, jump profile, original camera chase behavior and city/shopfront assets are retained.

## Implemented requests

- Fullscreen tool remains visible on iPhones. Native entry is checked for actual success; unsupported/denied entry offers usable help. Portrait help remains inside the landscape gate. Pending requests cannot open a modal beneath rotation/menu overlays. Safari Home Screen/standalone metadata is included; browser restrictions are not represented as successful native fullscreen.
- Water uses exact streamed lake/river polygons, independently indexed/merged/unloaded. The Roadster floats with approximately its lower third submerged, can accelerate/steer/brake and take off, and leaves two bounded wake rings. Entering water settles smoothly; bridges, solid decks and moving train roofs retain physical priority. No resolution or traffic-cadence change is involved.
- True ground railway-road crossings now have animated yellow/black gates, flashing warnings, matching player barriers, NPC stop lines and approaching train horns. Source-split roadway records share one physical gate pair. New arrivals stop; already admitted road users can clear; trains wait for clear roadway and fully closed gates. Reopening waits for the entire tail plus two seconds. Gate meshes are local, incrementally built and reused.
- Canonical railway/road profiles resolve full coach/deck envelopes with gradual connected grades. The same corrected elevations feed rendered rails, train paths, road graphs, collision and streamed tiles. Explicitly named underpasses receive physical separation. Real source XY and railway IDs are preserved.
- Railway stations retain source building/platform footprints. Station identities/codes/languages and nameboard positions use mapped platforms, instead of confusing numeric platform-like references with station identities. This remains a stylized map-derived station model rather than a surveyed architectural reproduction.
- Uppal Stadium's source-sized cricket bowl excludes at-grade through-streets in both permanent road graphs and streamed rendering/traffic. The model keeps its open outfield/pitch, seating bowl and six floodlight towers; perimeter roads remain outside. Source road assets are not deleted.
- Persistent pickup/delivery HUD panel removed; initial offer, contextual Collect/Hand over, map markers and flight guidance remain. Day and Level share a centered top row. Accept orders is compact.
- Arrow steering moved upward/inward with a larger gap. JUMP is narrower, matches BRAKE width and sits directly above it. FLY sits above GO; speed stays bottom center.
- Pause menu redesigned with a clear Resume action and grouped navigation/settings/recovery. Replay tips removed. Settings owns a top-right Done action.

## Automated verification

`npm run typecheck`, `npm run typecheck:worker`, `npm test` pass: 76 focused tests plus 38 portable legacy suites. Relevant evidence includes:

- 11,054 independent actual-source full-coach boxes against road deck/soffit slabs: zero intersections. The actual rendered coach vertex fixture clears its bridge. All source XY and railway IDs retained; modeled rail grades bounded at 2.5%; corrected road grades bounded against their existing grade or 6.5%.
- 2,925 finite overlap constraints: 243 retained genuine ground samples and 2,682 separated samples; zero unresolved/ambiguous cases in this source snapshot. Explicit St Johns Road Underpass regression verifies real physical gap, not just gate suppression. No previously separated road/road crossing lost its existing 5.2 m clearance.
- 42 genuine crossing source records form 31 physical gate pairs. Tests exercise all 5 NPC classes in both directions, bus-turn approach, safe spawn, admitted-car release, train yield, multi-train/tail occupancy, physical gate heights, local visual mesh reuse and AudioContext horn scheduling/mute/cleanup. The production Player/controller fixture verifies holding GO nose-first behind a closed arm for 20 simulation seconds in both directions at 30/60 Hz while a train passes (5 cm oriented body clearance), admitted-car clearance, and unchanged static-wall collision radius. Train roof carry and old parallel-flow fixes still pass.
- Water tests execute actual Player floating/driving/steering at 30/60/120 Hz, one-third submersion, takeoff, solid bridge/train support, and actual World tile water publication/unload. These are simulation tests, not device FPS measurements.
- Actual shipped core plus streamed Uppal roads are clipped consistently: no remaining ground route crosses the cricket bowl. Outside/elevated roads and source inputs remain intact.
- Mobile geometry/focus/gesture checks, pause→Settings→Done→pause→Resume, accepted/granted/denied fullscreen and pending portrait/menu races pass.

## Browser observations

Chrome local build on port 4217: the new pause/menu layout and top-right Settings Done were directly checked. Chrome iPhone 16 landscape emulation at 852×393 showed the fullscreen tool, centered status row, compact availability, raised arrows and aligned pedal/action columns. A native visible swipe accepted an order; FLY changed to LAND and car-relative pickup guidance remained visible with the former large task panel absent. This is compatibility emulation, not physical Safari or phone performance evidence.

Direct gameplay also reached Hussain Sagar from Lower Tank Bund using only flight, steering, throttle, brake and landing controls. The Roadster stayed afloat while parked, drove/steered at a displayed 32 km/h with wakes, and took off again. Original proof: `output/round2-qa/hussain-sagar-flotation.jpg`. A separate visible flight from Stadium Metro entered Uppal's cricket bowl: seating/outfield remained visible without streets or traffic crossing the field (`output/round2-qa/uppal-stadium-clear-bowl.jpg`). The full-map road overlay was separately checked for consistency with that exclusion (`output/round2-qa/uppal-stadium-clear-map.jpg`). Its cached world-space clipping mask removes roads/building outlines only inside the same bowl, and retains outer access streets, route overlays and markers across pan/zoom/reopen.

The Khairatabad area was reached through the public area picker, but a complete gate closure/reopening cycle was not observed in-browser. Gate/horn confidence here comes from the behavioral/source fixtures above, not a claimed manual crossing or audibly heard horn.

Original screenshots/logs are under ignored `output/round2-qa/` and `output/v21-qa/round2-final-regressions.log`. The final railway source log is `output/railway-physical-validation.log`; older exploratory audit-clearance files are not final evidence.

## Sources and limits

- Apple Home Screen web-app behavior: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
- Station/platform source interpretation: https://wiki.openstreetmap.org/wiki/Railway_stations and https://wiki.openstreetmap.org/wiki/Tag:public_transport=platform
- HCA stadium facilities/six towers: https://www.hycricket.org/stadium.html

Source heights are documented gameplay estimates. This patch improves alignment, identity and finite vehicle clearance; source coverage and automated geometry checks do not establish current citywide street surveys or photorealistic station architecture. Physical iPhone/Samsung FPS, thermal/battery and audible device-speaker validation remain unmeasured in this follow-up.
