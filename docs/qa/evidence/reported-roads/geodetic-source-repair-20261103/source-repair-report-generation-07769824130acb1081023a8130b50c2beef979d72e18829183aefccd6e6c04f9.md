# Bounded WGS84 source-cut repair and integration contract

Status: focused source stage implemented and tested; **not activated** by this work. Generic heights, cached prepared roads, inferred geometry and the final LP must be regenerated against this new source before publication. The old LP remains a separately retained baseline. This source repair does not solve the 300 inherited height mismatches or establish physical driving acceptance.

## Scope and source binding

The 52 witnessed XY-drift rows identify 49 distinct shared connector cuts. Scanning all 304 immutable raw packs finds 133 incident roads: 86 core and 47 tile-only, represented by 262 actual core/owner/context copies in 24 packs. All 82 required full source geometries were already retained in the committed Overture `2026-10-21.0` response. No additional connector closure was required to keep piece ordering and nonzero lengths. No new roads, flyovers or underpasses were invented.

`src/world/road-source-geodesic-data.json` is self-contained: full source lon/lat geometry, WGS84 vertex fractions, full connector UUIDs, source provenance and relative level/flag ranges accompany the expected raw road inputs and corrected pieces. It does not require a temporary query response at runtime. Data generation ID:

`07769824130acb1081023a8130b50c2beef979d72e18829183aefccd6e6c04f9`

Dataset SHA-256:

`1719fcb3c08b5a7d15e3c23ad7805b8cee320349a5cc883897ba2d1fb9f85347`

The correction resegments the existing source polyline at the official geodetic cut, coherently trimming/extending both adjacent pieces and keeping interior source vertices. It is not an inferred endpoint-displacement field. Maximum source-derived cut correction is 13.453257 m; it is separately justified by exact source geometry and is not subject to the 5 m bound for later inferred edits. Unselected cuts retain their prior geographic positions and exact endpoint heights. Their **declared**, actual-before and actual-after source fractions remain explicitly distinct, rather than incorrectly relabeling a legacy planar cut as an official cut.

The reason for this repair is documented in [the source audit](main-expansion-tile-boundary-source-audit.md). Overture's official linear references use WGS84 distance; the old raw-degree splitter produced the offsets. [Official calculation method](https://docs.overturemaps.org/guides/transportation/linear-referencing/).

## Pure API

`src/world/road-source-geodesic.ts` has no default dataset import and no automatic activation:

```ts
applyVerifiedSourceRoadGeometry(roads, data)
// { roads, applied, alreadyApplied, mismatched }

applyVerifiedSourceRoadZone(rawCoreOrTile, data)
// { value, report: { generationID, applied, alreadyApplied,
//                   nodesApplied, nodesAlreadyApplied, mismatched } }

sourceRoadDistanceAfter(patch, oldDistance)
// { distance, clipped } -- edge-relative route state only
```

Application is atomic for the supplied batch and idempotent **at the source stage**. Every actual owner binds its expected points, heights, class, width, lanes, direction and endpoints. Compressed context may omit lanes only when explicitly marked as context. Raw objects are not mutated. All supplied road incidences at a corrected node must belong to the reviewed incident set and end at its exact corrected point. A stale/unbound arm, missing patch, invalid node, changed input or malformed payload rejects the entire update.

This stage preserves IDs, topology, one-way rules, lanes and metadata. It does not move business/stop XZ, mapped furniture, buildings, canonical rail/metro, landmarks or actors. Node-derived road caps and clearance/scenery generation must subsequently consume the corrected node/road arrays.

## Point correspondence and heights

Each repaired road contains:

- `pts`: corrected geographic source XY; `sourceFractions`: point-aligned actual WGS84 fractions of the **full original source segment**.
- `correctedArc`: lengths on this corrected source piece. Use `pts` / `correctedArc` as the new source XY / source arc base for subsequent inferred geometry.
- `sourceArc`: explicitly a reference distance in the **former packed polyline**, aligned to corrected points. It may start below zero or end beyond the old length when the source cut extends a piece. This is an old-reference mapping, not the new inferred-stage length base.
- `legacyPointFractions`: the old normalized fractions used by the inherited height model; `cuts` records declared vs actual source extents and which cuts were repaired.

Inherited height estimates are interpolated using their original normalized source-fraction controls; unrelated endpoint heights remain exact. Null stays null, negative estimates are not clamped to ground, and all repaired endpoint heights remain unchanged in this dataset. Source relative level/bridge/tunnel ranges remain distinct full-segment metadata, not invented absolute elevations. Subsequent generic/LP work must rederive and validate their physical clearance. Width, lane, apron and source-way intervals must be mapped onto the new source fractions and final model arclength; do not reuse old raw-edge distances silently.

## Required atomic integration sequence

1. **Core/source loader:** verify the unchanged raw core pack hash, normalize raw roads and nodes, then capture the corrected source snapshot. Keep raw pack SHA separate from canonical corrected-road-array SHA. Warm or derive the generic cache from the corrected source array, with this generation/data/module in its input fingerprint. Do not install an old cache or apply the old LP first.
2. **Generic/cache/solver:** derive generic heights, source-relative level/lane constraints, prepared road profiles and the inferred geometry from corrected source. Anchor the 5 m inferred bound to corrected source `pts` / `correctedArc`; retain the old raw LP separately. Regenerate final core overlays, all affected tile transports, source-node bindings, worker patches and cache inputs together. Adding a source stage after a solved legacy model is invalid.
3. **Tile worker:** normalize each raw owner/context road and node table before applying final prepared-core patches, inferred tile transports, construction or rendering. Every owner/context copy uses the same reviewed source record. Reject mismatches; do not continue with a mixed corrected/legacy tile. Leave immutable pack bytes alone.
4. **Road consumers:** rebuild RoadGraph, traffic paths, bus paths, meshes, colliders, junction caps, dividers, supports and scenery exclusions from the same final corrected arrays. Preserve mapped geographic objects; regenerate procedural clearance against the corrected road. Recheck real rail/metro crossing constraints without moving the canonical corridors.
5. **Business/stop/actor state:** keep geographic XZ fixed at the source stage. Do not call the old XY-changing `rebaseRoadStops(..., sourceArcs)` for this correction. Any height-only stop update needs an unambiguous road/layer identity; report ambiguity rather than moving the shop or customer. Initialize new traffic after source normalization. If an existing actor's route-distance state must survive, use the explicit old-reference mapping and handle `clipped=true` by a reviewed route re-anchor; it must not teleport physical actors or fixed character scenes through the mapping.

Root owns main/cache/build activation; the producer owns World/worker integration. This implementation edits none of those files and does not rebase the current LP.

## Held model node audit

The pre-existing held model has 23 inferred node edits and 47 incident core roads. All available committed source query responses supply full source geometry for 11 roads at 8 of these nodes. None of those checked incidences has more than 0.1 m source-cut error (maximum 0.052179 m), and no checked held inferred target exceeds 5 m from the correct source point. These are partial source checks, not acceptance of all arms at those eight nodes. Thirty-five source prefixes remain unavailable and fifteen nodes have no checked incidence; their exact identities are in `known-model-nodes.json`. No incident road ID from this held 23-node model overlaps the focused 133-road repair. No new network query or unsupported geometry was substituted to conceal the missing coverage.

## Verification and reproducibility

Evidence: `docs/qa/evidence/reported-roads/geodetic-source-repair-20261103/`.

- Nine focused tests pass: real P.V. Narasimha Rao cut continuity, all source interior vertices, all 262 copy bindings, road metadata, atomic/idempotent application, geographic object retention, inherited negative heights, malformed/missing/stale incidence rejection and trimmed route-state handling.
- `npm run typecheck` passes.
- Regenerating from the committed preflight and retained source produces the dataset byte-for-byte. Generation verifies the unchanged raw core and all 24 affected source pack hashes.
- `verify-road-source-geodesic.mjs` exercises actual raw core and tile objects independently of the constructed test fixtures, checks all copy counts, source immutability, idempotence and unchanged geographic object references. Its result is retained separately as source-stage evidence; it is not rendered gameplay acceptance.

Run focused tests with `node scripts/test-v21-fixes.mjs road-source-geodesic`. Generate only to **new** paths:

```sh
PYTHONPATH=/tmp/tile-boundary-geodesic-deps python3 scripts/generate-road-source-geodesic.py \
  --preflight docs/qa/evidence/reported-roads/geodetic-source-repair-20261103/preflight.json \
  --output NEW_DATA_FILE --audit NEW_AUDIT_FILE
node scripts/verify-road-source-geodesic.mjs --output NEW_VERIFICATION_FILE
```

The temporary dependency target is merely an isolated installation of GeographicLib 2.1; install that version in another isolated environment if needed. All generator inputs and runtime repair data are committed repository files. Final height/tile/cache verification and actual desktop/touch drives remain required after integration.
