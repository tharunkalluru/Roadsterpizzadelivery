# Reported-road gate using actual Player frame transforms

Staged 2026-11-03. **Current baseline: 22/22 ordinary drives complete; 8 cases fail the additional 1 cm wheel-contact gate.** No visible Player vertex enters an emitted road slab under the unchanged legacy gate. This is scoped CPU evidence, not road release, global geometry, native browser or device acceptance. No production/UI file was edited by this reviewer.

## Reusable harness and reproduction

- `tests/fixtures/actual-player.ts`: real production Player constructor, meshes/materials and update; temporary canvas-only DOM stub.
- `tests/fixtures/packed-drive-world.ts`: optional third argument `{ onBuiltTile(tile) }` observes emitted buffers immediately before cleanup. The final `retainRaisedRoadExclusions` and `conditionedWorld` stages are retained. The callback does not change the prepared model or tile data.
- `tests/fixtures/emitted-player-contact.ts`: bounded emitted Float32 road/solid triangle index and `actualPlayerContactProbe(player, geometry)`. Each measured frame updates actual `matrixWorld` and scans every visible mesh vertex, including tyres and transformed wheel bottoms. No independent steady pitch/yaw/roll matrix is constructed.
- `tests/fixtures/tarnaka-original-road-negative-control.json`: unchanged complete two-road subset of the original `a679b72bacefb751057f0282a86571e8e6ef006d` prepared model, with full original-model SHA-256 provenance. The reproducer has no `/tmp` dependency.

Run from the repository root:

```sh
node docs/qa/evidence/main-expansion/reported-road-actual-player.mjs --output docs/qa/evidence/main-expansion/reported-road-actual-player-rerun.json
```

The command returns nonzero for any gate failure, unresolved emitted-road lift metadata, or bundled-source change during the run. `--quick` selects the exact report plus bypass; `--fail-fast` explicitly stops an individual drive on its first slab collision; `--full-quality` runs the same setup with `lowQ=false`. Final verification should use the full run without `--fail-fast`. The runner bundles into a temporary directory, hashes its 86 source/lockfile inputs, records source drift and removes its bundle. It does not alter gameplay source or the old independent tests.

Preserved pre-suspension result: `docs/qa/evidence/main-expansion/reported-road-actual-player-baseline.json`. `reported-road-actual-player-current.json` contains the same final pre-edit run. The earlier six-case smoke result is `reported-road-actual-player-smoke.json` and predates promotion of the 1 cm wheel observation into an explicit additional gate.

## Coverage and oracle

The exact reported start is `(3983.1, -2073.2)`, yaw `280.3 degrees`. The controller supplies ordinary production `Input` throttle, Space-style braking with reverse disabled, and steering. It brakes/stops at +13 m and +28 m before continuing beyond +31 m. Every drive calls `place()` only once; it never writes pose, yaw, speed, world time or support after placement, and invokes no flight/jump/rescue. This is a deterministic input-level CPU drive, not native key-event evidence.

At both 30 and 60 Hz, the continuation cases traverse both directions through:

- The first 130 m of `ad6f78f1-dc9_0` from the reported shared node.
- The first 170 m of `23427c8c-e37_0` from that node.
- The last 170 m of opposite carriageway `bdf0bad3-182_0`.
- The complete connected west fork `38a7824d-0e1_0` -> `38a7824d-0e1_1` (about 165 m).
- The complete connected east fork `37e421d1-548_0` -> `37e421d1-548_1` (about 122 m).

The two 608 m roads are tested through the stated local windows, not claimed driven end-to-end. All current required continuations have finite centre and wheel support. The exact reported start/end includes the documented shoulder: its missing-wheel/off-road frames remain visible in the result and are not relabeled pavement. The exact drive still travels 28.424 m / 28.263 m on actual road support at 30/60 Hz, retaining the existing at-least-10 m road-entry requirement.

Four actual packed tiles emit 3,281 bounded road triangles and 17,698 bounded nonvertical solid triangles in the Tarnaka region; every road triangle has matched declared film-lift metadata. The emitted height and finite coverage oracle uses its own barycentric plane calculation on the Float32 coordinates. `Surface` metadata identifies only the existing paint lift, without replacing the emitted height. The legacy slab test remains `top-feet >= .45`, point at least `.02` below the actual top, actual matching soffit `.85..1.05` below it, and point more than `.02` above that soffit. Vertical parapets/buildings retain production colliders; this height oracle specifically evaluates road/slab volumes.

The additional gate requires nominal actual wheel-bottom contact within 1 cm and actual tyre mesh penetration no deeper than 1 cm relative to the declared support plane. It also reports all raw emitted-asphalt gaps; declared film lift is not silently counted as a bank/grade defect. Startup frames are included. Existing slab tolerances are unchanged.

## Negative control and current failures

The original old-road model is explicitly staged only for negative calibration at the documented +18 m witness. The actual production Player's body vertex `(4002.397343, 2.425916, -2075.916033)` is inside the actual emitted slab, bounded by asphalt `3.364604` and soffit `2.394664`. The oracle detects it in all 31 placement/settling frames. This independently reproduces the prior exact-model witness with the production Player's transforms and proves that the detector is not vacuously passing.

The pre-edit full run measures 24,446 Player updates and **269,539,488 visible vertex evaluations**, completes all 22 drives, has zero legacy slab-collision frames, no unexpected relocation/airborne motion, and no source changes during execution. The 1 cm contact gate fails in eight cases / 713 frames:

| Route and direction | Hz | Frames outside 1 cm wheel contact | Minimum actual tyre support gap |
| --- | ---: | ---: | ---: |
| Flyover forward | 30 | 74 | -11.335 mm |
| Flyover reverse traversal | 30 | 28 | -11.198 mm |
| Opposite carriageway forward | 30 | 44 | -11.061 mm |
| Opposite carriageway reverse traversal | 30 | 37 | -10.858 mm |
| Flyover forward | 60 | 188 | -12.432 mm |
| Flyover reverse traversal | 60 | 78 | -11.495 mm |
| Opposite carriageway forward | 60 | 144 | -12.581 mm |
| Opposite carriageway reverse traversal | 60 | 120 | -11.527 mm |

The worst nominal wheel-bottom gap spans -12.779 to +18.496 mm. Minimum non-tyre mesh clearance is +51.558 mm. Example first contact failure: flyover forward at 60 Hz frame 580, front-left wheel `(3964.483340, .017085, -2090.509716)` versus independently emitted support `.027378`, gap -10.293 mm. Full per-wheel points, road IDs, Player matrices and source hashes are retained in the JSON. These ordinary-road residuals are preserved as failures before any visual suspension change.

Validation completed: full runner exits 1 for the eight explicit contact failures; the original negative control is detected; `npm run typecheck` passes. Root will make any bounded production suspension change and request an independent rerun with this same held harness. Final node/tile overlay parity must use the producer's eventual common World/worker initialization path; this fixture does not reconstruct a separate transport field while that path remains inactive.
