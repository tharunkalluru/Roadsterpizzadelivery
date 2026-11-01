# Fourteen-scene development build

Branch: `codex/fourteen-cinematic-scenes`. Version21 remains untouched. All fourteen scenes are implemented and all fifteen visible appearances are independently approved. At this checkpoint the build remains unpublished. The final source-copy checks and ordinary metro-loader replay passed; a forty-active-minute frozen soak and final physical-device validation remain outstanding.

## Campaign implemented

The active content contains exactly fourteen numbered levels. Mahesh/IMAX and Rajamouli/Film City are retired from the active campaign; historical modules/assets and seven-level regression fixtures are retained. Calls, dialogue and phone gates are disabled using `callMode: NONE`, with empty scripts. Totals and restaurant progression come from the content length. Saved seven-level progress keeps its completed Pushpa/Ram prefix and reaches the new Devara level without erasing unrelated saves.

| Level | Scene | Implemented interaction | Appearance release |
| --- | --- | --- | --- |
| 1 | Pushpa Raj, highway container | Closed corrugated roof/walls, logs and reading corner; rear-proximity door/ramp opening; drive inside and hand over. Completed truck keeps its moving supports and open ramp until the full car exits. | Independently approved exact authored model |
| 2 | Ram, VVR, Vande Bharat | Connected mapped Ghatkesar–HITEC City railway; fixed coach identities, continuous roofs, terminal dwell and reverse travel without turning/reindexing the rake. Land and drive to the delivery coach. | Independently approved exact authored model |
| 3 | Devara, Hussain Sagar | Explicit Dive, controlled descent, skeleton neck-grip tableau framed ahead of the arrival heading, pizza placement, actual safe surfacing before completion. | Independently approved exact authored model |
| 4 | Srikanth Odela, Paradise | Reuses mapped public restaurant frontage; roof winch lowers a large bucket, pizza goes in, bucket rises before completion. | No visible named actor required |
| 5 | Arundhati, fictional mansion | Ground-accessible iron gate, webs, ruined property, leave pizza outside. | Independently approved exact static V15 |
| 6 | Jessie, Jubilee Hills | Slow walking route aligned with an actual quiet residential street; follow alongside for the handoff. | Independently approved exact authored model |
| 7 | Hasini, Nizam College | Ground-level existing-building entrance treatment with gate/pillar handoff. | Independently approved exact authored model |
| 8 | Bhanumathi, village street | Actual quiet street near the Shamirpet anchor, wedding decorations, bounded instanced procession crowd, dancing/handoff sequence. | Independently approved exact V41 |
| 9 | Sukumar, Film Nagar | Fictional production courtyard, painted 45-degree parking reference, stopped/grounded alignment within 8 degrees before handoff. | Independently approved exact authored model |
| 10 | Vakeel Saab, metro | Eligible existing metro service, actual roof boarding and ride, next real station stop/doors, four staggered platform exits, grounded handoff. Terminal trains and virtual navigation poses cannot bypass boarding. | Four independently approved exact authored models |
| 11 | Maruthi, Kondapur | Fictional Villa79 close to the requested public community area; existing-building entrance treatment and parked handoff. No claim to a private home address. | Independently approved exact V9 |
| 12 | Salaar, fictional compound | Tall industrial walls and physical sliding gates, clear car entry, inner-courtyard drop and exit. | No visible Prabhas required |
| 13 | Arjun Reddy, Osmania Medical College | Ground-accessible courtyard outside a classroom, deliberate handoff. | Independently approved exact authored model |
| 14 | Nani, Uppal Stadium | Reuses the actual rendered stadium turf; no duplicate floating pitch/stands. Repeating break-in-play timing window and landed handoff. | Independently approved exact authored model |

The Vande Bharat shuttle is a fictional game service on the mapped rail alignment, not a claim that this real-world passenger service runs between those stations. HITEC City here is the railway station, not the similarly named metro station. The public MMTS connection is documented by the [Press Information Bureau](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2011518&lang=2&reg=48).

## Placement and timing

All nine grounded street-scene placements fit the actual shipped city geometry, including full car approaches, with no building removal or rooftop substitution. Fictional mansion/compound anchors were moved to real clear roadside land; public labels/anchors remain. See [the measured fit report](scene-review/ground-placement-fit.json). That report verifies geometry, not surveyed architecture or phone performance.

Preparation uses a cancellable generator ahead of arrival, a soft per-frame work budget, graph/tile revision checks and failure caching. It does not change the driving timestep or ordinary camera response. Nearby scene solids affect the camera only while that scene is active; the container gets a short interior camera. All ground mechanics reject hovering, descent and jumping. Steering, Space brake, S reverse, E jump and Q flight remain intact.

Each completed delivery adds a different restaurant construction detail. Final neon and the opening ceremony wait for completion of the entire configured campaign.

## Character quality is a release blocker

**All fifteen required visible appearances have passed independent release review:** Pushpa Raj, Ram, Devara, Arundhati, Jessie, Hasini, Bhanumathi, Sukumar, Pawan Kalyan, three separately reviewed metro companions, Maruthi, Arjun Reddy and Nani. Exact models, canonical rigs, primary film references, native full-body/motion/palm views and actual night/day scene evidence are fingerprinted in `character-assets.json` and `character-reviews.json`. Earlier rejected candidates remain historical records. The final metro record binds the crown-corrected032941 model and unchanged three companion bundles; see [the four-record approval index](character-review/evidence/independent-vakeel-final-four-native-20261031/formal-approved-review-index.json).

The authored actors use native 3D body/head reconstruction, continuous anatomical volumes, explicit skin weights, articulated hands and measured palm anchors. Arundhati deliberately uses an independently approved static behind-gate pose. Synthetic appearance guides are modelling inputs, never primary film evidence.

The runtime never substitutes a generic named person. The fail-closed loader still withholds future pending/rejected models; the current configured campaign has no missing approved actor. The final scene review observed the actual metro roof ride, next station, visible four-person exit, supported parking, manual carton pass, daylight/night readability and retained relaxed pose after Next. Platform lights are actual batched fixtures borrowing an existing light slot. The stopped-scene camera stays inside the real guard and releases for normal controls and orbit.

The approved-GLB loader checks exact reviewed bytes, embedded payloads, scene/rig/pose contracts and independent approvals before loading. It prepares current/next and retained scene assets under bounded leases, clones skeletons independently, preserves authored materials and safely owns GPU resources. Its production registry now contains all fifteen approved model/rig bundles. Fourteen appearances use native reviewed portraits; Pushpa retains the previously reviewed legacy image.

Run `npm run check:release` before publication. Its character audit intentionally fails until every required appearance is approved. Passing software tests never grants visual approval. Read [the independent comparison](character-review/independent-generated-review.md), [generation provenance](character-review/candidate-attempts.json), and [the artist/export contract](character-review/gltf-rig-contract.md).

## Verification and remaining work

Automated checks cover the complete fourteen-level no-call controller sequence, save migration, physical train travel/reversals, metro boarding/next-stop gates, container entry/exit, underwater production physics, repeating drop windows, actual-city placement, cancellation, resource cleanup and fail-closed art loading. Historical call-engine tests use an explicitly labelled seven-level fixture; rejected procedural-art pose tests use a test-only candidate renderer, never the production gate.

Hands-on evidence is recorded separately in [gameplay-review](gameplay-review/README.md). Staged QA starts skip pickup/travel only; delivery actions stay manual. These browser checks and simulated 30/60/120Hz physics are not real-phone FPS, heating or battery measurements.

The final source-copy release check passed 741 current tests, 38/38 portable legacy suites, application and Worker typechecks, the production build and the 15/15 character audit. The ordinary approved-loader metro review passed High and Low; Nani passed High night, and a subsequent targeted Arundhati High/night review cleared the green arrival-haze issue. The frozen forty-active-minute soak and final physical-device validation remain outstanding. Separate assisted mechanics/appearance runs cover all fourteen scenes. An uninterrupted unassisted fourteen-level campaign and mid-range physical-phone performance are not established by those runs. Camera/foot support across all59 source station assemblies is recorded separately in [the geometry audit](gameplay-review/metro-source-geometry-final-2026-10-31/audit-summary.json).

A short physical Galaxy S25 Ultra check reached actual high-graphics city driving, touch jump and night flight using the ordinary installed Chrome browser. It did not show the previous Samsung overlay corruption. This is a high-end device, historical Chrome127 image and earlier five-approved snapshot; it does not establish final-build, mid-range or sustained performance. The exact package and observations are in [physical-device preflight evidence](gameplay-review/physical-s25-preflight-2026-10-31/observations.json). The free reservation expired before map/background-return checks.

A final physical Galaxy S25 Ultra reservation was attempted for the frozen source with build fingerprint `734431db5999dc3291b5ae6d262ce401daf5b0c738b46ef92ce1e6bebceadc62`, but the service reported the free Spark-plan minutes were exhausted and allocated no device. The prepared APK was not installed or run on a physical phone. No final-build phone FPS, thermal or battery result is claimed. See [the quota attempt](gameplay-review/physical-final-quota-2026-11-01/observations.json).
