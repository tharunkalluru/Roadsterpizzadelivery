# Main 14-level expansion: roads, flyovers and flight clearance

Baseline: `9a01bd63b76d76d334a31d76163b7de7e8549693`, branch `codex/story-realism-main`. Scope is the promoted 14-level version. No changes were made to the older Version 21 checkout, speed caps, jump distance/airtime, camera controller or global clock.

## Confirmed causes and changes

### High Green-line metro structures were absent from hover-height calculation

`roofUnder` previously checked buildings, landmarks and moving trains, but omitted the static metro deck, station canopy and overhead wires. Normal flight targeted 24m despite Green-line interchange decks reaching approximately 23.7m and station roofs exceeding 33m. The old fixed 45m probe also gave less than one second of warning at 160km/h.

The new static clearance index uses the exact `metroCorridors`, `metroDeckHeight`, `metroPlatformAssemblies` and `stationVaultHeight` geometry functions. It covers deck catenary and the full station vault in both quality modes, before adjacent render tiles are loaded. `roofUnder` also includes real finite road/deck/pad support geometry. Flight probes a vehicle-width corridor up to 3.5 seconds ahead, at its existing 0.25-second update cadence; the existing altitude easing is retained. The static index never supplies tyre contact or invented canopy landing platforms. Manual flight cancellation/descent and train/metro landing remain player actions.

### Graph IDs could incorrectly authorize a fall through a flyover seam

The old `Player.continues` exception treated matching IDs or any shared graph node as proof that a lower surface was a continuation. A connected lower street at a different local height could therefore bypass the flyover drop guard. Continuity now uses actual support height and the existing bounded road grade, including distance travelled during the tick. A discontinuous lower surface retains the last safe deck position instead of initiating free fall. Grounded state is evaluated against the support at the final position, including after that safeguard.

This is a general support-selection defect confirmed by regression fixtures. The user's exact Rasoolpura fall location has not been reproduced from GPS/bug-report coordinates; it must not be described as an exact-location reproduction.

### Long ordinary roads could disappear when a distant owner tile unloaded

The original local streaming exception applied to elevated roads and the ORR. Ungraded ordinary roads were built only by one source-owner tile even when they crossed several kilometres. Shipped trunk `2acaa4cb-b1e_0` is 4.2km long, owned by `-24_9`, with its far end in `-22_8`; that local tile contains only a context copy. `a850e63b-2f4_0` is a second real example, a 3.1km service road.

Long ungraded edges now render local context pavement, clipped from the renderer's original triangles to each tile boundary. Collision uses those same finite triangles. Kerbs, footpaths, walkers' paths, shrubs and lamps are locally owned too, avoiding duplicated whole-road geometry. Road IDs, source XY coordinates, node links and height profiles are retained. The change applies to 86 long ungraded core roads identified after grade preparation. It does not invent connections between nearby disconnected roads.

### Direction boards could extend into the road or use the wrong approach tangent

Boards were positioned 32m before a junction but used the final junction segment's heading, which is incorrect on a curved approach. Their panels extended toward the carriageway and the full-height clearance check ran only for negative-height roads. Boards now use the tangent at their actual placement point; their panels extend away from the carriageway. Both the post and complete panel footprint must clear all road/rail traffic envelopes at every level, including their owning road.

### Existing divider and merge protections retained

The baseline already clips shallow connected merges, finite parapet endpoints, actual railway crossings and real road triangle boundaries. Those paths were audited and their regression suites rerun. Valid parallel disconnected carriageways and roads on separate levels retain their barriers. Junction gaps are not created simply because two roads happen to be close in XY.

## Evidence and repeatable checks

- `node scripts/audit-main-expansion-roads.mjs --report docs/qa/main-expansion-road-inventory.json`: passes. Reads every shipped pack and validates the full source inventory and finite core road ribbons. Counts: 304 packs, 2,527 tiles, 610,516 road records, 479,853 unique tile road IDs, 52,412 core roads and 388,807 generated core ribbon quads. Zero malformed records, missing referenced tiles, nonfinite quads or zero-area core quads. Every required playable context tile exists for all 86 long ungraded core roads; clipping conserves their total rendered area.
- `node scripts/test-v21-fixes.mjs main-expansion-road`: all 11 groups pass. Dedicated production-code tests cover all 59 metro assemblies (885 canopy samples); Green-line high-station approaches; finite static flyover clearance; manual landing surface separation; same-ID/shared-node false-drop cases; continuous tile seams at 30/60/90/120Hz and bounded 50ms hitches, both travel directions and three lane offsets; full board footprint clearance; context-only long-road driving; nonplanar triangle clipping; the actual shipped long-trunk far-end context tile; and real packed Rasoolpura ribbons.
- Actual Rasoolpura Begumpet Airport flyover samples: 5,769 rendered-ribbon interior/near-seam samples, maximum support error 0.009852m, within 0.03m test tolerance.
- `node scripts/test-v21-fixes.mjs road-openings`: all eight groups pass. Includes the shipped Dallas Centre/IKEA shallow merge, disconnected parallel roads, separate-height flyovers, finite divider ends, high-speed oblique collision and genuine visible divider collision height.
- `node tests/legacy/flyover-regressions.mjs`: all nine groups pass. Prepared core maximum grade is 0.0972314, no model segments exceed 10%, shared endpoint height difference is zero, and independently classified crossings retain their existing clearance contract.
- `node scripts/test-v21-fixes.mjs road-join-driving`: all four groups pass. Actual input-driven IKEA routes, both quality modes and directions, 30/60Hz, upper-road/underpass continuity, and the full four-edge 180m continuation complete without a solid nose/body/tail contact.

These offline cadence tests execute actual Player movement, support queries and generated geometry. They establish consistency across simulation tick rates; they are not measured phone FPS.

## Boundaries and remaining validation

The complete source inventory is citywide. Generated obstacle/support playtests focus on actual Rasoolpura and IKEA locations plus representative source-independent regressions; this is not a claim that every road has been driven manually. Source end nodes (170 in the core graph) are retained as mapped boundaries/cul-de-sacs. No new underpasses, arbitrary road links or guessed railway flyovers were introduced.

The inherited road-height model reports 8,431 uncertain crossing constraints: 7,314 independent coplanar/near-level, 622 connected profile constraints that cannot meet estimated clearance, 146 parallel corridors with unverified ordering, 143 same-level crossings with unverified topology, and 206 contradictory lower-road ceilings. The inventory preserves these distinctions. It does not convert them into fabricated surveyed elevations.

The photographed horizontal station-concourse pane is assigned to the metro architecture owner. Its separate window-face clearance must be checked, not only the surrounding concourse box. This roads implementation does not modify the metro station rendering block.

Release acceptance still requires integrated desktop/touch driving, Green-line hover and deliberate landing, fast Rasoolpura flyover entry, curved-road sign inspection, real long-road streaming, story-sequence transitions and the independent reviewer's findings. No physical-phone FPS, thermal endurance or battery claim is made by this audit.
