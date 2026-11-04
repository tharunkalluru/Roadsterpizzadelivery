# Bounded WGS84 source-cut repair and integration contract

Status: focused source stage and startup/cache/worker integration implemented and tested; the source-stage manifest remains **disabled** pending the coordinated rebase and release gates. Generic heights, cached prepared roads, inferred geometry and the final LP must be regenerated against this source before publication. The old LP remains a separately retained baseline. This source repair does not solve the 300 inherited height mismatches or establish physical driving acceptance.

## Scope and source binding

The 52 witnessed XY-drift rows initially identified 49 shared connector cuts. Completing the source audit of all 23 existing inferred model nodes found one additional verified 0.316966 m cut error at `29e61023-757`. The approved extension repairs exactly that one junction as well: **50 cuts, 136 incident roads, 88 core and 48 tile-only, represented by 267 actual core/owner/context copies in 24 packs**. All 84 required full source geometries are retained from the official Overture `2026-10-21.0` release. No additional connector closure was required to keep piece ordering and nonzero lengths. No new roads, flyovers or underpasses were invented.

`src/world/road-source-geodesic-data.json` is self-contained: full source lon/lat geometry, WGS84 vertex fractions, full connector UUIDs, source provenance and relative level/flag ranges accompany the expected raw road inputs and corrected pieces. It does not require a temporary query response at runtime. Data generation ID:

`9413c1f5f353f1f2f054717a0d461d6b1a17fc2627c0a5353ce85496985c53ac`

Dataset SHA-256:

`55ee3dbc0c741072e204d7560731296db086959c23ef765a9518da4a27cd237b`

The canonical corrected raw-road-array SHA-256 is `6455a4f49967643f8f3dbba6ac01f5d8fb789059482936429afdbb7f027540c0`, using the cache's tagged-negative-zero representation. Raw pack bytes remain unchanged. The former generation `077698…`, its disabled manifest and this report's former revision are archived under `geodetic-source-repair-20261103/`. All 133 former road records and 49 former node records remain identical; the extension adds only `5a23ce42-637_0`, `5a23ce42-637_1` and `f4ca0bc7-9b6_0` at one new cut.

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

Root owns main/cache/build activation; the producer owns World/worker integration. This source implementation does not rebase the current LP. The actual-worker fixture now normalizes only fresh raw cores before generic/cache preparation, skips raw normalization when reusing a conditioned core, and passes its source generation to cache warming.

## Held model node audit

The pre-existing held model has 23 inferred node edits and 47 incident core roads. One bounded anonymous query retrieved the remaining 35 exact source prefixes: 35/35 returned, 57,005 bytes saved, 34.92 seconds; DuckDB profiling reports 282,330,110 bytes read, demonstrating that a small result does not mean a small remote scan. The completed immutable audit now covers **47/47 roads at 23/23 nodes, with zero missing source prefixes**.

It found two incidences of the same additional cut: Masjid Banda Road `5a23ce42-637_0/_1`, connector `29e61023-757d-446d-b939-9b6a9da68036`, fraction `0.35221554`. The packed endpoint `[-14420.1,-5595.8]` differs by 0.316966 m from the source point `[-14420.35481711024,-5595.988509106441]`. Its attached service road, **owner-only** `f4ca0bc7-9b6_0` in `packs/p-5_-2.pack.wasm`, tile `-15_-6`, starts at a different packed alias `[-14420.4,-5596]`. A separately authorized one-prefix query supplies its full source geometry (one row, 4,202 bytes, 27.35 seconds, 277,556,758 bytes read according to DuckDB). All three pieces now meet the same source point; the service road retains width 4.5 m, one lane, bidirectional status, private-access source metadata, and its unchanged far cut at `3f6d7946-757`.

The old held inferred target remains 4.839308 m from this corrected source point, below the inferred 5 m bound; it must still be rederived in the coordinated solve. All other checked model-node incidences have source-cut errors no greater than 0.1 m. The original partial audit and preflight remain immutable; completion evidence is in `geodetic-known-model-source-completion-20261103/`, and the one-cut extension's complete inventory is in `geodetic-source-repair-generation-2-20261103/preflight-fully-sourced.json`.

## Verification and reproducibility

Current evidence: `docs/qa/evidence/reported-roads/geodetic-source-repair-generation-2-20261103/`. Earlier generation evidence remains under `geodetic-source-repair-20261103/`.

- Ten pure source tests cover real P.V. Narasimha Rao cut continuity, source interior vertices, all 267 copy bindings, metadata, atomic/idempotent application, unchanged geographic objects, inherited negative heights, malformed/missing/stale incidence rejection, trimmed route-state handling, exact preservation of the earlier generation, and the distinct f4ca owner alias.
- Five independent stage/cache tests verify complete repaired-core/node inventories, generation and canonical-array binding, stale arm rejection, source/cache ordering and source input fingerprint coverage. Two actual-worker tests verify generation rejection/recovery and emitted source-corrected endpoints. Fifteen cache tests cover runtime/transport/generation guards. No test depends on the production source-stage flag being disabled.
- `npm run typecheck` passes.
- Regenerating from the committed fully sourced preflight and retained responses produces the dataset byte-for-byte. Generation verifies the unchanged raw core and all 24 affected source pack hashes.
- `verify-road-source-geodesic.mjs` checks all 267 actual copies across 216 decoded tiles, 88 core roads and 134 node-table updates, with raw/geographic objects unchanged and idempotence. This is source-stage evidence, not rendered gameplay acceptance.

The generation-2 incremental decoded-tile benchmark on this M4/Node process measured source-stage medians of 0.353–0.435 ms, p95 of 0.410–0.572 ms and a largest batch-averaged sample of 0.866 ms. Validation alone had median 0.249 ms and p95 0.366 ms. The disabled identity path was effectively zero. These exclude download/decode, meshes, browser worker concurrency, GPU and physical-phone behavior; they do not establish phone FPS. No validation caching or timing change was introduced. If device profiling later makes this cost material, a privately cloned/deep-frozen prepared handle per worker generation can be assessed while retaining per-input and all-arm checks; mutable-data WeakMap bypasses are unsuitable.

Run focused tests with `node scripts/test-v21-fixes.mjs road-source-geodesic`. Generate only to **new** paths:

```sh
PYTHONPATH=/tmp/tile-boundary-geodesic-deps python3 scripts/generate-road-source-geodesic.py \
  --preflight docs/qa/evidence/reported-roads/geodetic-source-repair-generation-2-20261103/preflight-fully-sourced.json \
  --output NEW_DATA_FILE --audit NEW_AUDIT_FILE
node scripts/verify-road-source-geodesic.mjs --output NEW_VERIFICATION_FILE
```

The temporary dependency target is merely an isolated installation of GeographicLib 2.1; install that version in another isolated environment if needed. All generator inputs and runtime repair data are committed repository files. Final height/tile/cache verification and actual desktop/touch drives remain required after integration.
