# Lakdikapul pilot — first small context batch

Checkpoint timestamp 2026-10-19T23:55:19Z; saved after importer preview. Worker `second-computer-01`, assignment `khairatabad-lakdi-pilot-r8306076003-3`, branch `worker/second-computer-01/khairatabad-lakdi-pilot-r8306076003-3`.

## Startup, access and exact scope

Fetched origin and reread AGENTS, SECOND_ACCOUNT_BOOTSTRAP, STATUS, ASSIGNMENTS, RESERVATIONS, WORKER_GUIDE, VALIDATION, SNAPSHOT, activation and prior checkpoint. Remote handoff and exact activation remain `50e23bd3b8162381623e8ea7bd617409f88bda54`; frozen prepared predecessor is `7145ba2b954c2ec01c67e902a44e45c6fc5d91a4`. The ACTIVE lease still names this worker and branch. Survey remains hyd-metro/2.0.0 revision102, SHA-256 `2500760b5de99102489055f7f52d1639ad64b486424fdbcbe54b5ece3d7f1e2a`; all five frozen file hashes reverified. The owner's audit106 is not the local runtime revision.

Only `r_8306076003_3` canonical left/right [20.00,168.60]m, stored-point order. Endpoint buffers [0,20) and (168.60,188.60], both junctions, branches, all other roads/carriageways and all station gates/connectors remain excluded. No fixed sampling increment exists in the assignment; this first batch stops after two angles at one camera. Other owners/reservations are unchanged.

User reported collaborator access added. The previously denied push of checkpoint `ae03591626e45ca0bbd99825ee453bce779b3210` was retried successfully, without account/permission changes or force push. `git ls-remote` read back that exact SHA on the assigned worker branch. This resolves the prior publishing blocker separately from map evidence.

## Actual imagery chain and provisional map alignment

The local Chrome session opened the known locator panorama `1fe1afaU42WEtPPcstiEIA` (Apr2026, camera17.4065353,78.4624984, h138). It remains outside the lease at approximately16.03m and is NOT a source in this batch. A click on the visible forward roadway followed by Up advanced along the same visible street to `S76aL2Sv9OLkf6WqmLbU1Q`. No branch/other carriageway was selected. The UI visibly shows **Nov2021** for the new panorama, so this transition is a capture-date break, not evidence of unchanged tenancy.

New camera:17.4064672,78.4625709. Applying game/src/world/geo.ts's WGS84 projection and origin17.4146,78.5484 gives X=-9119.249240028354, Z=900.0879171123572. Its nearest stored point on the assigned road is approximately25.978m, lateral distance2.348m; this is inside the lease. The next nearest road candidate is8.240m away. The visible continuation, southeast road direction and nearby viaduct context support provisional alignment to this edge; this is not field-survey precision. The local canonical tangent points southeast (approximately124 degrees); h48 and h228 face its left and right angular sectors respectively. Neither establishes an exact facade position or entrance.

Inspected sources, both Nov2021:

- Left-facing h48, fov65: https://www.google.com/maps/@?api=1&map_action=pano&pano=S76aL2Sv9OLkf6WqmLbU1Q&heading=48&pitch=0&fov=65 . Moving/parked traffic in the near foreground obscures parts of the far edge. Individual signs across the roadway are deliberately not inventoried as assigned tenants because their individual offsets and road-edge association are unconfirmed. No other road/carriageway frontage is surveyed.
- Right-facing h228, fov65: https://www.google.com/maps/@?api=1&map_action=pano&pano=S76aL2Sv9OLkf6WqmLbU1Q&heading=228&pitch=0&fov=65 . Immediate concrete viaduct pier/base, barriers and small vegetation are visible; the pier obscures the view. Areas, vehicles and premises beyond the immediate boundary are excluded. No connector, gate, parking area or other-carriageway frontage is inventoried.

## Immutable batch and validation

Batch `second-computer-01-khairatabad-lakdi-pilot-001-20261019`, file `game/data/research/batches/second-computer-01-khairatabad-lakdi-pilot-001-20261019.json`.

- **2 sources, 2 pending observations**, one per inspected angular sector. No storefronts, overrides, corrections, roadReviews or reviewed ranges. No named tenant, door, floor, facade bound, metric frontage span or occupancy is established. Camera position is not an entrance.
- Canonical surveyRecordHash: `8367814cde80fd0f11911d8c778740396135ad2d2233dbff4ab481c85d7841e1`.
- Node24.13.1 importer `--check` in disposable clone `/tmp/roadster-pilot-validation-20261019` at exact activation returned `validated_preview`, hypothetical revision103, hash above. Preview only: no import or shared survey modification. Full build/test suites were not rerun; known VALIDATION.md limitations remain.
- No raw reference imagery, private screenshots or browser/session data saved. Explicit batch/checkpoint paths only; staged diff/whitespace and credential-pattern scan performed before commit. Final commit SHA and remote readback are delivered in task handoff.

## Precise resume and remaining gaps

Stop here for review of this small first batch. Last inspected/resume source is **S76aL2Sv9OLkf6WqmLbU1Q, Nov2021, camera17.4064672,78.4625709, h228, fov65**, linked above. Forward orientation at the same camera is h138; it has been viewed for navigation only. No next distinct panorama has been inspected or preapproved; its ID, capture date and position remain unknown.

After parent review, re-fetch/recheck ownership, return to this same camera, orient h138 and follow only a visibly aligned continuation. Check each new actual camera against [20.00,168.60]m before authoring evidence. Stop on edge ambiguity, provider block, boundary approach or another road. Do not count the prior out-of-range locator.

The [20.00,25.978]m portion has not been continuously inventoried. Neither has the remaining segment beyond this camera. Two context records create **zero verified or visually inventoried side length**; both sides remain unreviewed for coverage. Tenant identity, exact entrances/units/floors, obscured frontage, side association of distant signs, present tenancy and field-measured geometry all remain unresolved. No complete pair, route, connector or gate claim.
