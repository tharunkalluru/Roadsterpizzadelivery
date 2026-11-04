# Independent road/flyover review — 2026-11-02

Review owner: `roads_independent_review`, separate from implementation. Baseline `9a01bd63b76d76d334a31d76163b7de7e8549693`; development branch `codex/story-realism-main`. No production code was edited by this reviewer. Before/after review hashes are retained in `evidence/main-expansion/roads-independent-review-v1-hashes.json` and `roads-independent-review-v2-hashes.json`.

## Verdict: pass after one reviewed correction

The flight-clearance, support-continuity, direction-board and local-asphalt changes pass the reviewed code and regression checks. An independently reproduced visual streaming defect in long-road paint was sent back to Root, fixed in production, and independently rechecked. The accepted scope and remaining integrated/device limits are stated below; this is not an approval of every surveyed Hyderabad crossing or the entire game release.

### Resolved P2 — continuous boundary paint belonged to one distant segment midpoint

`src/world/city.ts`, `dash()` in lane markings, computes the full remaining source-segment length when `off === 0`, then calls `ownsRoadPoint()` only at its midpoint. The newly clipped ordinary-road asphalt is local to each tile, but a continuous yellow/white strip may still extend far outside that tile. When the owning midpoint tile is unloaded, the neighboring local asphalt can lose that paint; the boundary line can appear/disappear separately from the road. Dashed paint also has a smaller version of this ownership mismatch at tile boundaries.

The independent failing regression uses the actual shipped trunk `2acaa4cb-b1e_0` from far-end context tile `-22_8`, without its distant source owner. It reproduces a painted vertex at `x=-22061.79296875, z=9121.181640625`, more than 121m beyond the tile's north boundary. The tile's correct finite bounds are `[-22000,-21000] × [8000,9000]`.

Root's reviewed correction preserves the existing dash phase, endpoint height function and color, clips each actual long-local strip's original two triangles with `clipRoadQuadToTile()`, and emits only nonempty local fragments. Only long-local paint bypasses the prior midpoint skip, so a strip is no longer discarded when its midpoint is outside but its finite triangle intersects the tile. Roads, graph links and ordinary ownership were not changed by this correction.

Reproduce: `node scripts/test-v21-fixes.mjs main-expansion-road-independent`. Before correction: two pass, one fails. After correction: all three pass. Independently rerunning `node scripts/test-v21-fixes.mjs main-expansion-road` covers the original 11 plus the three independent groups: all 14 pass. The original failure is retained in `evidence/main-expansion/roads-independent-paint-failure-v1.log`; the final run is retained as `roads-independent-final-v2.log`. Diff whitespace checks pass for the corrected renderer and added test.

## Checks independently rerun

- `main-expansion-road`: 11 groups pass, including all 59 station canopy assemblies, finite manual landing support separation, same-ID/shared-node false-drop cases, tile seams at 30/60/90/120Hz plus bounded hitches, local asphalt ownership and 5,769 actual Rasoolpura ribbon samples. Maximum sampled support error is 0.009852m.
- `road-openings`: eight groups pass, retaining genuine disconnected/parallel and separate-height barriers while clearing actual connected merges and finite endpoints.
- `road-join-driving`: four groups pass. Production Player input follows the actual IKEA join/connector and full four-edge continuation, in both quality modes/directions and at 30/60Hz, without nose/body/tail solid contacts or unintended height changes.
- Legacy flyovers: nine groups pass. Maximum prepared core grade is 0.0972314, no model segment exceeds 10%, and modeled shared endpoint heights agree.
- New independent flight coverage: 64 trials cross both high Green-line assemblies from eight compass headings at 30/60/120Hz and bounded-hitch cadence. All 5,086 canopy samples maintain more than 1m between the car's feet and the local roof, at the existing flight speed limit. This extends the implementation suite's along-track approaches.
- New independent tile-only coverage: 84 ordinary long roads absent from the core list require 255 local playable tiles; all required copies exist. This extends the primary inventory, whose long-edge coverage was limited to 86 prepared core roads. Details are in `evidence/main-expansion/roads-independent-noncore-context-v1.json`.
- An additional all-source ownership probe inspected 479,853 unique tile road IDs. No ordinary road below the new 1000m extent threshold had a sampled source point farther than the initial 900m loading radius from all its source-owner tiles. The shipped data therefore does not expose an initial-owner-loading gap below that threshold. This is source coverage, not a statement that every physical obstacle has been driven past.

## Native evidence inspected

These three supplied images were opened and visually reviewed; their hashes are recorded with the source hashes.

- `green-line-manual-flight-hover-v1.png`: the Roadster is visibly above the green-edged JBS station canopy, LAND remains available, and the readout shows hover at 39.37m. Combined with Root's recorded keyboard approach, this supports that tested Green-line hover case.
- `rasoolpura-manual-fast-entry-v1.png`: the car is on the elevated carriageway at 7.35m after Root's approximately 182m keyboard drive. It supports that actual entry; the exact original user-reported failure point is still unknown. The oversized pizza marker seen here is separate from road support and has been reported to Root.
- `ikea-manual-road-join-v1.png`: the car remains at road height after the recorded approximately 37m southern-join drive. A legitimate curved continuation and its outside curb remain ahead; the image does not establish that straight driving through that curb should be permitted. The full connected continuation is covered by production-input regression checks, not by this one native screenshot.

The horizontal station-window obstruction belongs to the separate metro architecture review. Changes to that station renderer must be validated together with the road-clearance contract before release.

## Scope limits

The source inventory preserves the 170 mapped core endpoints and the inherited 8,431 uncertain crossing constraints. These are not proof of 8,431 gameplay collisions and are not permission to invent surveyed heights or underpasses. They also prevent an honest claim that all Hyderabad crossings are accurate to a physical survey. No route alignment, node link or new underpass was introduced by this review.

The tests execute real production movement/geometry, but offline cadence tests do not measure phone FPS. The three inspected native captures are desktop Low-quality cases. Full final-build integration, touch/device compatibility, sustained performance and final-source parity remain release gates owned by Root.

## Final integrated-source readiness recheck

**Result: pass for the road/physics integration scope; no new release blocker found.** This follow-up holds production source and adds only review evidence. Current fingerprints are retained in `evidence/main-expansion/roads-final-readiness-hashes.json`.

`player.ts`, `physics.ts`, `world.ts`, `road-surface.ts` and `metro-flight-clearance.ts` remain byte-identical to the previously accepted road revision. The corrected local strip-paint path is still present. Later `city.ts` changes add the independently reviewed station physical-entry planner, conditional inspection callback and worker-only fixture queue. They do not change road alignment, source connectivity, road units, speed constants or ordinary drive support selection. The moving-rail change exposes the actual read-only support identity; its contact/carry calculation is unchanged. The post-contact game speed clamp bounds externally imparted momentum without modifying coach carry or collision separation. Story-only input/collision handling is isolated from normal driving.

The exact Paradise duplicate-building omission is guarded by source identity, class, height, footprint coordinates and the actual matching metro assembly. The fixture queue checks actual generated station supports before emitting a lamp's geometry, light pool, emitter or collider. Rejected emitters are removed together, avoiding invisible pole obstacles. The physical-entry planner preserves the original Bharat footbridge instead of deleting source scenery. Those changes are consistent with the retained road-clearance contracts.

Meaningful final checks were rerun against the held integrated source, rather than inferred from earlier producer logs:

| Focused check | Result |
| --- | ---: |
| Original plus independent road expansion | 14/14 |
| Actual IKEA production-input join/continuation driving | 4/4 |
| Railway/road clearance, including physical furniture preservation | 11/11 |
| Full actual-tile metro/street fixture interaction | 7/7 |

All **36** groups pass. Logs are `evidence/main-expansion/roads-final-readiness-{main,driving,rail-clearance,lamps}.log`. In particular, the all-source long-road copy checks, actual finite paint ownership, eight-heading high Green-line crossings, same-ID/shared-node deck safety, actual packed IKEA traversal, railway crossings and actual station fixture conflicts remain covered after integration.

The 170 mapped core endpoints and 8,431 ambiguous estimated crossing constraints are still retained. This follow-up introduces no guessed roads, underpasses or surveyed height claims. It does not convert the earlier native examples into an empirical drive of every city road, certify physical-phone performance, or replace the station reviewer's requested fresh Bharat/native architecture confirmations. Those remain separately owned final release evidence.
