# Nine tile-only side-street prototype preflight

**Traversal/non-regression gate closed: 72/72 ordinary traversals complete, 69/72 strict road-only contact cases pass.** The three remaining strict contact flags reproduce on unchanged raw roads and improve under the prototype. They are existing tight-turn excursions onto same-level shoulder, not demonstrated new endpoint-field regressions or stuck-road defects. Strict outputs remain failed; no pavement, collider or support tolerance was widened.

This is a local CPU prototype review. Final production World/worker common-path parity and the globally integrated model remain to be verified. No production/UI file was edited by this reviewer.

## Exact inputs and shared path

The tested immutable pair is under `/tmp/roadster-road-freezes/lowered-side-streets-v1/`:

- `model-fdef4f7d7c687757d0b1166f91da438f996616bfaedfa33b2c8bcd582611bb9b.json`, SHA-256 `fdef4f7d7c687757d0b1166f91da438f996616bfaedfa33b2c8bcd582611bb9b`.
- `supplement-566648b1e824a4f99e639d11d3d220d37b24cdbc15c49acbc4181a4811476df8.json`, SHA-256 `566648b1e824a4f99e639d11d3d220d37b24cdbc15c49acbc4181a4811476df8`.
- Producer provenance manifest `manifest-d68501d4dd5b28fe57740f61f78133f50ea99d48c7e3f83fac5a7d682713b319.json`.

The probe verifies both exact artifact hashes, the supplement's embedded core-model hash, raw core/pack hashes and all nine endpoint level checks. It uses public `applyTileRoadNodeTransports` and `applyModeledRoadNodePositions` directly, without reconstructing their displacement field. Each actual owner/context copy binds its expected raw source shape. All nine tile/core junction levels are zero; source records remain byte-identical after helpers and building.

Four real packed tiles are retained: `-3_0`, `-6_-3`, `-5_-3`, `20_-5`. Nine owners and the one supplied context copy are included. Actual buildings, walls, obstacles, junction caps, metro/rail context, landmarks and construction context remain in the fixture. Actual emitted Float32 road/solid buffers are collected before cleanup. Source and input drift checks pass.

## Traversal coverage

`docs/qa/evidence/main-expansion/tile-node-actual-player-preflight.json` preserves all 72 results: nine side streets x both adjacent core arms x entry/exit x 30/60 Hz. The side IDs are `d8e43417-f5b_0`, `06c3a04a-26f_0`, `105beac8-a00_1`, `7be4d085-f54_0`, `6882abe6-c07_0`, `1bc95a46-c59_0`, `96fca61c-5e1_0`, `6a870f89-bc5_0`, `625a9bf7-dae_0`.

The actual production Player receives normal throttle/brake/steer updates, with one initial placement and no per-frame pose/yaw/speed forcing, flight or recovery. The road-relative follower uses 20 m side approaches, up to 18 m core departures, 4.5 m look-ahead, steer gain 3, 4 m/s cruise and 2.4 m/s within 8 m of the node. Exact path points and controller constants are saved in the three-path classification artifacts below.

The full prototype run evaluates 37,497 Player updates and 413,860,104 actual visible mesh vertices. All 72 centres cross their connections. There are **zero centre off-road frames, real wall/building body overlaps or actual emitted-slab hits**, and no source mutation/drift or unmatched asphalt-lift metadata. The unchanged strict 1 cm tyre/finite-road gate flags three incoming turns at node `0b88cb51-464`.

## Matched raw classification

The exact flagged road-relative followers were repeated using unchanged raw core/tile geometry and raw `zone.nodes`, with no modeled XY transport, retaining the same colliders and strict oracle:

| Incoming movement | Hz | Raw missing-wheel frames | Prototype missing-wheel frames | Prototype minimum tyre support gap |
| --- | ---: | ---: | ---: | ---: |
| `17390715-e3a_0` -> `6882abe6-c07_0` | 30 | 32 | 15 | -10.477 mm |
| `17390715-e3a_0` -> `6882abe6-c07_0` | 60 | 68 | 38 | -10.451 mm |
| `34a11925-bf1_0` -> `1bc95a46-c59_0` | 60 | 10 | 7 | -10.081 mm |

All three raw and prototype centre paths complete without obstacles, slabs or centre support loss. In the prototype's first missing-wheel witnesses, the front wheel is **1.95–4.18 cm outside actual emitted asphalt**, between the two side-street ribbons. The production reachability query returns unobstructed default ground at Y=0 there, matching road support level. The wheel helper correctly refuses to invent road contact at that point; its existing all-wheel fallback accounts for the small strict tyre-gap observation. These are road-only corner-contact diagnostics on an otherwise drivable shoulder.

At the shared node, the modeled node table and all incident endpoints agree at `(-4776.5054279930455, -2259.683061677891)`; raw coordinates are `(-4776.4, -2259.3)`. Both versions emit/support eight actual cap triangles. Independent emitted-asphalt and cap-support centroid samples agree within `3e-10 m`, with no missing cap sample. Thus the shoulder witnesses do not expose asphalt/support cap disagreement or a mismatched modeled `zone.nodes` entry.

Preserved classification evidence:

- `tile-node-actual-player-corner-prototype.json`: same three prototype paths, matrices, exact controller/path points, nearest emitted asphalt triangles and default-ground reachability.
- `tile-node-actual-player-corner-original.json`: matched unchanged raw counterparts and original node-cap observations.
- `tile-node-actual-player-preflight.json`: original 72-case output remains unchanged, including all three strict failed cases.

## Reproduction

From the repository root, pass the exact frozen pair explicitly:

```sh
node docs/qa/evidence/main-expansion/tile-node-actual-player-preflight.mjs \
  --model /tmp/roadster-road-freezes/lowered-side-streets-v1/model-fdef4f7d7c687757d0b1166f91da438f996616bfaedfa33b2c8bcd582611bb9b.json \
  --model-sha fdef4f7d7c687757d0b1166f91da438f996616bfaedfa33b2c8bcd582611bb9b \
  --supplement /tmp/roadster-road-freezes/lowered-side-streets-v1/supplement-566648b1e824a4f99e639d11d3d220d37b24cdbc15c49acbc4181a4811476df8.json \
  --supplement-sha 566648b1e824a4f99e639d11d3d220d37b24cdbc15c49acbc4181a4811476df8 \
  --output docs/qa/evidence/main-expansion/tile-node-actual-player-rerun.json
```

Add `--failure-cases-only` for the three classified turns and `--raw-counterpart` for their unchanged source counterparts. The strict runner intentionally returns exit 1 for these finite-road contact flags; the traversal/non-regression classification above does not suppress them. No broader road release, final integration or device claim follows from this prototype gate.
