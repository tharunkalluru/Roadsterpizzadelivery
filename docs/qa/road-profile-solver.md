# Reproducing source-bound road profiles

`solve-road-profiles.py` is a build-time SciPy/HiGHS solver. Python and SciPy are not shipped to the browser. The pinned environment used for this candidate is Python 3.12, NumPy 2.5.4 and SciPy 1.18.1; install `scripts/road-profile-solver-requirements.txt` in an isolated environment when regeneration is needed.

First reproduce the immutable historical reference from all imported source modules at the accepted commit:

```sh
node scripts/export-historical-road-model.mjs \
  --commit a679b72bacefb751057f0282a86571e8e6ef006d \
  --stage world \
  --output HISTORICAL_MODEL.json \
  --footprints HISTORICAL_FOOTPRINTS.json \
  --provenance HISTORICAL_PROVENANCE.json
```

The strict conditioned reference is SHA256 `f6c08923a167644655daf166a84849bad68ae0b2d487fd3d8da6e88d1262fc64`. The tracked compact historical lowering fixture records the selected source-arclength profiles, unchanged core fingerprint and the comparison with the earlier hybrid export. These are generated model heights, not surveyed altitude.

Export one coherent candidate through the ordinary underpass/construction/rail conditioning stage, together with its actual `roadRibbon` L/R arrays and directly bound tile-only transport supplement. Use the producer's exact-input export path; do not reconstruct current or historical ribbons with a different width helper. Then run:

```sh
python scripts/solve-road-profiles.py \
  --model CONDITIONED_MODEL.json \
  --footprints ACTUAL_FOOTPRINTS.json \
  --historical-model HISTORICAL_MODEL.json \
  --historical-footprints HISTORICAL_FOOTPRINTS.json \
  --tile-transports TILE_TRANSPORTS.json \
  --fixed-tile-constraints FIXED_TILE_CONSTRAINTS.json \
  --source-geometry SOURCE_GEODESIC_DATA.json \
  --geographic-reference GEOGRAPHIC_HISTORICAL_REFERENCE.json \
  --output ROAD_SOLUTION.json \
  --ledger ROAD_CONSTRAINT_LEDGER.json
```

All source/evidence inputs have explicit CLI options and SHA256 bindings in the result. The solver defaults to 7.5% centreline grade, a bounded 10% fallback, true triangle slope below 10% with a serialization margin, grade change of 0.00625 per metre, and 8 mm model co-elevation tolerance beneath the unchanged 1 cm physical co-elevation cap. Independent Float32 headroom comparisons retain every historical gap above 1 cm, with at most 1 mm regression allowance; that separate gate is not the co-elevation tolerance. Canonical rail-conditioned, negative and mapped controls remain protected. Generated source-node/apron heights use explicit bounded modeling policies, recorded in `road-profile-apron-policy.json`: normal local redistribution is 15 cm within 30 m, two specifically authorized estimated aprons permit 30 cm, and source-bound historical lowering/shared-node reconciliation has exact per-node targets. These estimates do not acquire surveyed authority by appearing in an earlier generated model. Core-only runs keep tile-only transport heights fixed. Joint runs use the separate bound detailed-road stage described below; detailed IDs are always excluded from core output patches.

The source-geodetic dataset is applied before generic road preparation. Its official WGS84 fractions and corrected source arclength are the model's source coordinates. The bound geographic reference maps corrected positions to the exact historical full-UUID owner and its legacy arclength, including changed cut ownership. Missing or ambiguous aliases fail closed; inherited planar fractions and cumulative lengths of available siblings are not historical correspondence. A model, footprint, tile supplement or source generation mismatch is an error. Joint detailed-road source fractions use the pinned build-time GeographicLib 2.1 dependency; it is never loaded in the game.

A real shared source connector retires only its source-proved finite attached component. Neighbouring cell indices do not prove geometric connection: the clipped polygons must touch, the node seed must lie on the pavement, and a same-source continuation must meet the actual cut cross-section. Disconnected fragment unions inside one cell are excluded from automatic exemption. Explicitly authorized local junctions use connected clipped pavement polygons within their bound footprint, with exact source paths and unrelated-road negative controls. Later re-crossings and unequal local source-order spans retain independent headroom unless a separate source proof applies. The ledger records these fragments and any rejected ambiguity for independent review.

The solver initializes exact incident-node closure itself. `--component-windows` is an optional resumable build state, not a required temporary source input. Immutable overlap caching only avoids recomputing the same clipped geometry; its key binds the exact current L/R, tile and fixed-context inputs plus the polygon area cutoff. Source and solver hashes are captured before execution and checked again before output, so a mixed edit cannot produce an accepted result.

For a large connected apron, first add `--prepare-component-closure` to the same command. This writes `ROAD_SOLUTION.components.json` without solving heights. Then remove that flag and pass `--component-windows ROAD_SOLUTION.components.json` to the height solve. Preparation computes the least fixed point of the same literal physical couplings and bounded two-metre eligibility padding in memory, rather than rebuilding the city for each small advance. Protected positions seed only their existing authorized intervals; they cannot propagate permission across an untouched protected span. `scripts/qa/verify-road-component-closure.py` compares this closure with independent iterative propagation, including protected-gap and disconnected negative controls. If newly added road IDs expose another component, prepare that expanded inventory once more; do not widen the physical or source eligibility rules.

`scripts/assess-tile-grade-closure.py` separately scans all detailed tile owners and builds a temporary offline graph. Given an exact source-corrected conditioned model, source dataset and bound tile supplement, it computes compatible core-anchor grade envelopes and inventories all 50 corrected source nodes. It emits a necessary endpoint-feasibility assessment and changed-road preview, not runtime profiles or physical acceptance. The full graph is not added to the startup core. Raw `road.elev` disagreements at verified negative facilities must be checked against actual underpass-generated surfaces before they are called physical defects.

```sh
python scripts/assess-tile-grade-closure.py \
  --model CONDITIONED_MODEL.json \
  --source-geometry SOURCE_GEODESIC_DATA.json \
  --tile-transports TILE_TRANSPORTS.json \
  --grades 0.065 0.1 \
  --output TILE_ENVELOPE_ASSESSMENT.json
```

The tracked source-9413 assessment is a preview bound to the ordinary input before the final height solve. Its 453-road count at 6.5% is not a final changed-profile inventory. Recompute against solved core anchors before selecting the historical tile export and producing a separate tile overlay. A short incompatible path between two core anchors requires an explicit coherent arterial/bridge-approach reconciliation; it is not resolved by forcing the intervening street to exceed the grade limit.

For the joint core/detailed solve, build the selected owner/context subset with `scripts/export-joint-road-tile-input.mjs`. Supply `--fixed-tile-constraints` so fixed source streets retain their exact original discretization. The builder verifies every copy, preserves existing transport points and heights, and binds each newly densified street to its physical pavement width before any height change. Rebuild this input against the exact ordinary model and source-capacity footprint revision; an older model hash is rejected.

Add these three options together to the solver command:

```sh
  --joint-tile-input JOINT_DETAILED_INPUT.json \
  --historical-tile-model HISTORICAL_ACTUAL_CITY_TILES.json \
  --joint-component-policy SOURCE_BOUND_PJR_POLICY.json \
  --historical-cap-seam-proof EXACT_OWN_SEAM_SOURCE_PROOF.json \
  --connected-facility-proof ACTUAL_CONNECTED_FACILITY_PROOF.json
```

This stage uses literal historical detailed-road triangles and caps instead of treating raw packed zero as a rendered altitude. Every triangle must retain `actualSurface.paintLift` captured from the strict historical emitted Surface. Owner class and `cap` flags cannot reconstruct that value: clipped strips can also carry the cap flag. An additive metadata export binds its unchanged literal geometry through `sourceHistoricalTileModelSHA256`. If deduplication preserved more than one actual Surface binding, every binding is sampled and retained.

Unknown multiple structural sheets at one point remain unresolved. The explicit historical own-seam proof permits only its exact source-node, literal triangle, film and legacy-source branch matches to retain a local structural envelope. No surface is averaged or selected. Independent historical clearance uses the minimum separation of the two envelopes, `minimum(upper) - maximum(lower)`; overlapping own envelopes do not invent an independent historical layer. All nontrivial approved envelope values and source keys remain in the ledger. This reference rule neither exempts another road nor repairs the old support seam.

Every selected physical connector receives an exact all-arm height equation, including fixed context arms; distinct retained XZ endpoints are not snapped together. A finite junction exemption still requires both owned triangles to cover the point inside the source-proved connected initial fan. Explicit fan proofs take precedence over generic recovery preservation, which otherwise reintroduces obsolete partial gaps. An existing verified negative facility may supply a canonical endpoint datum to a detailed owner only through the bound actual-surface receipt and complete full-connector proof. The canonical core profile and existing negative detailed interiors remain fixed; proximity alone supplies no facility authority.

Detailed streets retain a separate 6.5% grade limit even when the core's bounded 10% fallback is attempted. The objective weights detailed datum changes more strongly than changes to unprotected generated arterial humps. General arterial eligibility lowers only its source-proved local generated approach; the separate PJR policy releases estimated layer-to-metre seeds while preserving real local source order and independent headroom. Negative detailed approaches are confined to components attached to an existing verified negative facility. Canonical, surveyed and explicit controls remain hard. A positive ground-street result above 1.2 m is flagged for terrain/structure approval; mathematical feasibility never authorizes bridge furniture.

A successful joint run writes the complete core as `SOLUTION.model.json` and the separate exact-input-bound detailed profiles/transports as `SOLUTION.tiles.json`. `solution.roadData` contains only core roads. The tile artifact binds both the ordinary input and final core byte hashes, source generation, all source packs, requested IDs and exact profile inputs. Fixed source streets are retained as identity height profiles. No detailed roads enter the startup core cache, and no runtime resampling follows the solved arrays.

The ledger records exact clipped finite polygons, road/control/source arclengths, source node/path or relative bridge-layer authority, local smoothing bounds, and sparse infeasibility witnesses. A bridge's relative layer does not establish absolute altitude. Source-proved shallow aprons are classified spatially; a road pair is never exempted wholesale. Named opposing carriageways also require separate lane/body corridor checks.

`success: true` establishes feasibility of the stated scalar-height model. It does not approve a release. Re-export the final actual Float32 asphalt/soffits, verify final height-dependent width footprints, and run the unchanged full-car, traffic/bus, finite headroom, canonical rail/metro, tile seam and world obstacle gates. Do not Hermite-resample the solved arrays afterward. Production integration remains a separate exact-input-bound step owned by the correction generator.
