# Independent historical joint baseline review

The strict a679 historical joint baseline is usable as a **bounded ROI reference**, with no release approval. This review changes no runtime, raw data, profile, LP or exporter files.

The reviewed artifact is `/tmp/road-historical-joint-487-tile-806-context-505-core-9413-v3.json`, SHA256 `d746a980fcb73574f5759f779e487b68f7dac54794edaabd33f35ef6562ebd90`.

The independent receipt is `docs/qa/evidence/reported-roads/historical-joint-baseline-independent-9413-20261103-v3.json`, SHA256 `504676201ac5f097831368d30c2d5f6eb07d2728fcfe88b8ceb2632da20d7f49`. It passed 25 source/schema/coverage checks and retains exact before/after input hashes. Earlier receipt iterations remain as evidence; use v3.

## Verified

- All 1,798 selected IDs (487 tile, 806 context, 505 core) and all 482 joint boundary road IDs have literal retained triangles and physical road records. None of the 13,285 road records is triangle-empty.
- The 63 imported historical source modules match literal Git source at `a679b72bacefb751057f0282a86571e8e6ef006d`. All scanned raw packs and the dependency lock match that revision's exact Git blobs. The selected raw-copy census is 2,401.
- Every physical-copy SHA and historical footprint SHA agrees with the exported owner. All 270,767 retained triangle coordinates are finite Float32 values with exact own-road segment centres; their legacy source intervals reconstruct immutable raw positions within the exporter's 15 cm bound.
- An independent reconstruction produces the same 13,014 full-path ROI cells. All current held candidate selected centre paths remain inside that ROI. Every retained unselected triangle intersects it.
- All 1,713 unmatched historical material triangles are **outside** this ROI. They remain unresolved and are not accepted as globally matched surfaces.
- Eighteen stadium derivation records bind 13 unique actual IDs to exact parent raw owner/index/hash and immutable parent arcs. None of those 13 IDs occurs in retained roads or triangles: these are outside-ROI provenance traces, not geometry used by this finite baseline.
- The known split `b74ec454-8b3_0` remains two disjoint parent intervals: `0..28.2711868518 m` and `221.098480809..233.862832741 m`. The removed stadium interval is not collapsed or bridged by an alias.

## Follow-up gates and limits

This bounded review did not rerun all 620 old City tiles. Literal emission origin is supported by the reviewed strict historical exporter and its source-bound emission receipt. It does not prove all retained/omitted global triangles were independently regenerated a second time.

The generic `unionPhysicalRoads` schema currently omits `contextNotRendered`. This particular artifact explicitly has zero missing contexts; consumers must enforce that stronger check for subsequent artifacts. The exporter also records some unresolved selector/footprint fields without making every field affect its process exit code; consume the actual explicit arrays rather than an exit code alone.

Historical `arc()` nearest monotonic projection is not a general loop ambiguity proof. If derived fragments enter a later ROI, require an explicit `actualRoadID -> immutable parent raw ID/arc` binding and preserve branch-specific intervals. Do not strip `:stadium` suffixes, use fragment-local arc zero, or interpolate across a removed source interval. No such fragment enters this reviewed ROI.

The current cross-road finite oracle skips equal road IDs. Therefore a separate same-road gate is required before final geometry acceptance: local own-source folded overlaps must be co-elevated; remote same-road loop crossings must preserve historical finite headroom. A cross-road finite pass cannot certify either case.

Final actual World/worker Float32 emission, changed tile profiles, 3D/terrain/underpass continuity, independent crossing headroom, full Roadster and traffic body/tyre checks, known30 routes, reuse/restart/cache parity and native driving remain open until a feasible final model is held.

## Reproduce

```sh
node scripts/qa/review-historical-joint-baseline-independent.mjs /tmp/NEW-historical-joint-independent-receipt.json
```

The reviewer reserves new evidence with `wx`, verifies the exact artifact hashes, and rechecks all consumed file hashes before writing the receipt.
