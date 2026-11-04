# Road geometry: strict references and additive connector repair

These are build-time repairs and inactive candidates. They do not enable the replacement road model, change driving timing/camera behavior or constitute a whole-city driving pass.

## Exact historical face containment

The held solver's `bary()` admits weights down to `-1e-5`. That can include a point outside a literal face and introduce a second historical height. The new standalone `scripts/qa/robust-road-containment.py` uses an orientation filter with exact rational fallback, following the error-bound method in [Shewchuk's primary reference](https://www.cs.cmu.edu/~quake/robust.html). It accepts actual edges/vertices without enlarging a triangle or projecting a point. Overflow, subnormal/cancellation cases and invalid geometry have explicit handling. It is not yet wired into the held solver or the runtime.

Independent review checked six test groups, 3,000 provided city/near-collinear cases and 5,206 additional full-exponent/city/near-collinear cases against a separate exact shoelace oracle. All 511 saved historical hit sets were replayed against the actual triangle/tile/binding bytes: 1,072 hits remain, 32 tolerance-only hits are rejected, eleven rows become single-hit references and 500 disagreements remain. A strict predicate does not authorize the remaining overlapping surfaces. Receipt: `roadster-robust-road-containment-independent-review-9413-v1.json`, SHA256 `fc95631720bca83e31ebf97d309a8bdf3427626462e7ed0c6b7e4e3223cd99c6`.

## Complete reporting inventory

The original ledger only retains the first 1,000 unclassified records. `export-complete-unclassified-road-samples.py` compiles a separately identified observation AST: exactly one reporting-list cap is removed, and a callback stops execution before numeric context/output writes or any solve. It retains every original function, classification and input guard. The source solver file remains unchanged at SHA256 `46219d8cb566ff117895507fd4e43219bc5a498a7e225cb2617a59392a0fad6e`. Four tests cover the exact transformation and pre-output stop, including rejecting other append bodies, duplicate caps and wrong capture boundaries.

The completed observation retains all original 1,000 records exactly and captures 11,987 samples across 259 pairs. Of these, 11,292 have no actual old coverage and 695 do; 9,211 have source levels `[0,0]`, and 2,776 have `[1,1]`. Every original category count and all 511 historical ambiguities remain unchanged. No fitting occurred. Artifact: `/tmp/roadster-v34-complete-unclassified-road-observation-9413-v1.json`, SHA256 `3c17b55eb32032f7c3d726e1991ecd7758213d6d06d5d1ec5366ed0162122487`.

The separate computed pre-Float32 correspondence proposal covers 234 points / 497 occurrences in the earlier capped sample. Its 461 recovered faces have exact tile/binding/Float32 reproduction and outward-rounded affine intervals. Independent strict containment excludes tolerance-only and genuinely outside cases. Actual historical coverage remains false; these intervals must not enter the old-accepted-headroom shortcut. This is not yet a complete 11,987-sample quantization proposal or a sampler implementation.

## Connector `169a3d25-212`

The current endpoint differs by 0.170790 m from the official full-WKB connector. A new all-304-pack preflight identifies three affected pieces: `09c1bfe9-5f2_0`, `09c1bfe9-5f2_1` and detailed owner `fe98bd3f-31c_0`. The exact full connector is `169a3d25-212f-46a0-a21c-fc323370e3ab`. Its source point is `[-227.829284926, 2642.005060813]`; the old packed aliases are `[-228,2642]` and `[-227.8,2642]`. Two exact retained source rows were added as evidence; no metric height is inferred from their absent elevation annotations.

A complete fresh generation also changed last bits in old calculations. The additive producer deliberately retains all 136 prior road records, 84 prior source records and 50 prior node records exactly, and adds only the three new pieces, two new source families and one node. It rejects changed raw correspondence, old official selected cuts/nodes/source metadata/packs, missing all-arm closure and reuse of an old metric family by a new piece. Unselected old legacy fractions are preserved rather than replaced with freshly recomputed values. Five adversarial tests pass.

The candidate generation is `ef93e0853f85f4875147cc0fce6b066219cbde74d682994b8a2689c07928bd5a`, data SHA256 `86775faf09c73cc7b643b1cb5fbc16bc20bb8b64dc714215be78d3acae5af89b`. `verify-road-source-geodesic.mjs` now accepts an explicit `--data` candidate; its default still reads the runtime dataset. The actual production source-normalization API applies the candidate atomically/idempotently to 90 core roads and 182 tile copies, across 225 decoded tiles and 25 packs, with 136 node-table updates. Raw and geographic objects remain unchanged. This is source-application coverage, not an actual worker, height-model rebase, cache activation or native driving acceptance.

The runtime source dataset and its disabled startup manifest remain unchanged. Independent additive-candidate review and a fresh conditioned-world/joint/footprint/canonical-mask preparation are required before fitting. Existing height-domain and historical-reference artifacts stay bound to their old tuple until explicitly reviewed against the new source frame.
