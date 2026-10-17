# Whiteout reference review (Q08 / C4)

Status: **blocked**. No inspection has been performed. No visual observations are recorded.

- Reference: https://whiteout.plgb.chatgpt.site/ (user-selected)
- Attempt date: 2026-10-17
- Result: the cloud environment's network policy denied the host (HTTP CONNECT 403 from the egress proxy; curl exit 56, http_code 000). Evidence: `qa/artifacts/c0/whiteout-network-denied.txt`, evidence ID `EV-Q08-WHITEOUT-DENIED` (result `blocked`, not a pass).
- All eight rubric dimensions (vehicle, scene, materials, lighting, camera, activity, effects, interface) are `not_inspected` in `qa/visual-reference-review.json`.
- This review does not establish phone performance or geographic truth.

## How to unblock

1. Allow the host `whiteout.plgb.chatgpt.site` in the cloud environment's Network access settings, then re-run the inspection in a WebGL-capable browser (headless Chromium here uses SwiftShader, which is fine for viewing).
2. Or the user supplies a gameplay recording and/or screenshots of the reference. State whether the material shows motion or only still views, and any redistribution limits. The review will disclose those limits.

## Checklist to execute once access is granted
(from `docs/handoff/GRAPHICS_REFERENCE_WHITEOUT.md` sections 2-4)

Procedure:
- [ ] Load the exact URL in a browser with working WebGL; start the game through its visible controls.
- [ ] Record date, browser/device, viewport, visible settings, and reference version only if exposed.
- [ ] Inspect the opening and several ordinary gameplay moments: vehicle at rest and in motion, a view down a street, nearby environment detail, a turn or camera transition, the playing interface, visible effects, and readability when the scene is busy.
- [ ] Classify each finding as observed, inferred (with reason), or proposed for Hyderabad. Do not infer rendering algorithms from appearance or sustained performance from brief smoothness.
- [ ] Label still-image evidence separately from motion evidence. Do not copy Whiteout assets.

Rubric (record not_inspected / below_target / comparable / exceeds_target per dimension with concrete observations):

| Dimension | Inspect in Whiteout | Apply and test in Hyderabad |
|---|---|---|
| Player vehicle | Silhouette, surface finish, wheel detail, contact and separation from surroundings | Roadster-inspired hero car with comparable finish, credible scale, readable driving/flight states |
| Road and scene depth | Scale, road detail, foreground/background separation, intersections, environment completeness | Real Hyderabad geometry, coherent complete presentation around reachable streets |
| Materials | Observed paint, glass, road and structural surface response | Consistent roughness, variation, tiling, economical original/licensed textures |
| Lighting and shadows | Player visibility, grounding, shadow stability, readability | Comparable coherence while preserving signs, junctions, wires, landing visibility |
| Camera and motion | Framing, turns, speed cues, shake, occlusion, transitions | Stable chase camera, deliberate takeoff/flight/landing transitions, reduced-shake option |
| Environmental activity | Density, variation, movement, legibility when busy | Autos, bikes, buses, people, local details without hiding the next decision |
| Effects and atmosphere | Effects actually observed, consistency, restraint | Flight, tire, dust, feedback effects within measured mobile budgets |
| Interface | Typography, spacing, hierarchy, contrast, controls, feedback | Original delivery UI: time, shared flight balance, guidance, touch controls |

Hyderabad build comparison (section 4):
- [ ] Use the 300-500 m authentic slice (real junction, metro relationship, verified frontage, valid delivery entrance, local traffic, flight/landing).
- [ ] Capture car-height and elevated views, visibility, driving through traffic, a connected deviation, an overhead restriction, manual and assisted landing, arrival at the correct entrance.
- [ ] Review standard and low presets.
- [ ] Fill `qa/visual-reference-review.json` (build_binding hashes, game_views, per-dimension observations) and register review and capture artifacts with hashes in `qa/evidence-index.json` under Q08/C4 (classes `ai_visual_review` with a comparison block, plus `source_inspection`).
- [ ] Claim "target met" only if all relevant dimensions are supported as comparable; document justified adaptations.
