# Source ground carriageway review

Verdict: no source, exact-OSM, geometry-binding, finite-overlap, or classifier-replay counterexample was found among the actual 4,902 reclassified rows. The retained evidence supports local common-pavement equations for these overlapping ground fragments within this diagnostic source model. It does not approve the complete road model or authorize absolute zero elevations, global route-wide equality, runtime activation, or publication.

Independent checks:

- The 4,902 constraints cover 42 model road IDs, 38 complete retained source rows, 32 ordered pairs, and 27 unordered pairs.
- All 38 source rows have null whole-source level_rules and road_flags; all shared route references are unscoped. The model IDs have no surveyed/explicit elevation or expressway protection.
- All 42 model sourceXY/control sets project to their exact retained WKB within 0.06375605699178075 m. This corroborates the upstream solver binding at solve-road-profiles.py:642-680; the helper does not perform that projection itself.
- All 4,902 saved overlap points lie in both original bound model ribbons. All 497 distinct segment cells have positive literal intersection area. All 4,902 sourceProof results replay identically under the reviewed classifier source.
- Minimum local absolute tangent dot is 0.9506662073684133, above the 0.94 threshold.
- Original property-empty OpenStreetMap provenance reduces to 34 unique way@version records. All 34 exact-version reads succeeded. Every raw highway class agrees with the retained source class. None contains bridge, tunnel, layer, covered, level, ele, embankment, cutting, or location tags.
- One read-only current OSM multiget found all 34 versions unchanged. No current edits were applied retroactively. Original API JSON bytes and the current multiget bytes are retained beside this report with SHA256 receipts.
- Prior finite required gaps range from 0.010097325398659967 m to 2.3349627155168045 m. The largest is Road Number 1, d4ff93f5-9ff_0 versus 5e79dbb1-c2e_0, segments [0,10], at [-5101.011639063357,-1896.3295483906645]. No reclassification discards a 5.85 m vehicle-clearance constraint.

Algorithm findings:

- The production branch is restricted to actual finite-overlap samples and la == lb == 0. The diagnostic omits that explicit call guard, but its complete retained rows have no level rules anywhere; the official default level therefore also resolves to zero for every reviewed row. No dataset-specific parity bug was found.
- The helper checks same meaningful name, same major-road class, complete source record identifiers, nonempty WKB, common OSM road-route provenance, parallel local tangents, and no whole-source structural annotation. Its source truthiness checks rely on the independently bound upstream source/model tuple; they are not a standalone defense against arbitrary forged records.
- Common route membership and null tags do not establish surveyed absolute altitude. The implemented constraint only equates the two locally overlapping drawn pavement samples; it does not prescribe a zero datum. Whole-source annotation rejection prevents the known partially positive flyover-family counterexamples from gaining this authority.

Remaining numeric result:

- The v29 complete diagnostic remains infeasible with 1,228 direct bound conflicts. 26 direct conflict rows carry this new source proof, across 4 unordered pairs; this is unresolved bound/profile work, not acceptance evidence. No runtime/profile/published asset was modified by this review.

Artifacts:

- Receipt: /tmp/roadster-source-ground-carriageway-review-20261103/receipt.json
- Bound model SHA256: be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7
- Bound source reference SHA256: 6c7bf84daead74907d3c68b21186913a1168f7968e380baa3832d9b72b1864a6
- Bound v29 diagnostic SHA256: 1d9591703f041ec7ecbc2bfa6500c1859d600c15a2f557049f7715137ddbf3a0
- Reviewed classifier file SHA256: 5c465e28d9a5a6880529425eefc9715f62ec6928ecfb30e7605f49d713a9ee3b
