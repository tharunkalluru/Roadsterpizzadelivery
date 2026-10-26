# HUD, reports and transport-clearance follow-up

This follows application commit `59e19a24a6c90a972c8d42d0a1e4b61230686973`
and release-record commit `0eff345306ab8b3cef671e8fd84b5839bffa197d`.
Existing Roadster models, delivery saves, unlimited flight, source shopfront
records and raw city packs are retained.

| Requested change | Result |
| --- | --- |
| Recheck the preceding two request sets | The [requirement matrix](prior-world-transit-requirements-audit-2026-10-26.md) separates implemented behavior from remaining source/architecture scope. Missing physical interchange assemblies and an obsolete extra Green Line stop were repaired. |
| Flight reserve inside FLY/LAND | The separate Flight/Unlimited panel is removed. The button itself fills; current unlimited flight stays full. Empty/full states are independently previewable. |
| Use freed map space | Responsive fixed-position minimap remains at the top/right and clears the task card, controls and contextual action. |
| Entering-area notification at top | Dedicated top lane replaces the bottom/speed overlap. |
| Small Accept orders toggle | The toggle has a 44px touch target; redundant idle Free roam/Explore cards are hidden. Actual GPS tasks still show. Paid first handover unlock and accepted-order preservation remain in the production Game lifecycle. |
| Bug icon, then Report, without typing | Captures the clicked game position and source road, screenshot, build fingerprint, recent driving state and errors; sends to a private-read report database. No device GPS or personal fields are requested. Offline persistence/retries show a truthful receipt. |
| BRAKE at 150% | Width and height are each 1.5 times their former size; rounded-square shape retained. Phone safe-area insets are respected. |
| Gachibowli and similar bridge conflicts | Final source/render clearance results are recorded in the machine-readable validation report; uncertain topology is never counted as a verified road join. |

The report endpoint accepts bounded same-origin JSON POSTs and returns success
only after a D1 insert or an idempotent retry receipt. Report contents are not
publicly readable through the game API. The Site owner can inspect them in the
Site database viewer (`DB`, `bug_reports`). Game coordinates are the location
inside the simulated city, not the player's real device location. A report
records a possible issue; inferred observations are not confirmed diagnoses.

Six browser component viewports have original screenshots and measured DOM
rectangles in `playtests/evidence/2026-10-26-hud-reports-bridges/`. All measured
controls, map, task, top area chip and contextual-action rectangles are in
bounds and do not overlap. Safe-inset tests are separate geometry checks.
These component scenarios are not completed deliveries or physical-phone
tests. The local report workflow was also exercised in the real game and the
stored row and scene screenshot were inspected.

Exact photo-matched replicas of every campus/mall/office, every current city
construction site and all unresolved bus route legs remain outside verified
coverage. The audit retains their concrete limits rather than marking those
older requests completely resolved.

Final check, renderer, browser and publication receipts are in
`playtests/2026-10-26-hud-reports-bridges.json`.
