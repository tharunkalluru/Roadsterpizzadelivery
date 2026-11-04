# Historical cap structural datum: independent source/physics research

The historical sampler has a real film-normalization error. It subtracts the representative road's class lift from every literal triangle. The strict a679 renderer assigns junction caps the **maximum incident class lift**, while their structural support height is the **mean of the grouped endpoint heights**. These two rules must remain separate.

At `9cf108b9-a5e_0`, near `(1757.561636232969, 93.7209333517265)`, the old residential strip has literal Float32 Y `0.04500000178813934` and source paint lift `0.045`. The cap has Float32 Y `0.06199999898672104` and source paint lift `0.062`, because secondary roads join the same connector. Both structural surfaces are zero. Subtracting `0.045` from the cap invents a 17 mm structural layer.

## Literal replay and receipts

`scripts/qa/historical-cap-datum-independent.mjs` bundles every historical `src` import directly from Git revision `a679b72bacefb751057f0282a86571e8e6ef006d`. It executes the actual old `buildTile` with the same old World patches, construction, rail/metro/landmark/airfield/furniture context, matches literal Float32 triangles and reads each matched actual `Surface.paintLift` and unpainted `roadQuad`.

The authoritative replay is `docs/qa/evidence/reported-roads/historical-cap-datum-independent-9413-20261103-v2.json`, SHA256 `582052cbea5477c9bf2e889cd74b6f38614997b30753d2cc9609313ee7915d9e`.

- 101 original ambiguity witnesses, 13 actual tiles, 14 roads and 169 matched surface records.
- 58 false ambiguities disappear with the literal per-surface film.
- 43 **genuine** cap-to-own-strip structural disagreements remain. None is ignored or rounded away.
- Maximum normalized Float32 versus actual old structural-quad height error: `3.937989656588314e-9 m`.
- The actual old `supportAt` runs 144 queries. It reads unpainted `roadQuad` heights: at the real seams it selects the ground strip from `fromY=0`, and the raised cap from its corresponding cap height. These are physical inherited support steps, not merely visible paint differences.
- The source-module SHA inventory and consumed files are retained and rechecked before/after each replay.

Three independent controls pass in `tests/v21-fixes/historical-cap-datum-independent.test.ts`. They retain the wrong-film negative, the 43 real steps and actual physics evidence, and the unrelated-headroom coverage limitation.

## The 43 real disagreements are three local connected junction seams

`docs/qa/evidence/reported-roads/historical-cap-seam-source-classification-independent-9413-20261103.json`, SHA256 `cf28fef6d7391f47e62d5037b4e3f8d1bf3700373b7ee6e26be7fb1e732d116e`, binds every incident arm to exact full Overture segment and connector IDs, official endpoint geography, active source levels/flags, literal cap/strip triangles, source arcs and old physics support.

| Representative road | Exact shared connector | Witnesses | Actual cap support | Own strip |
|---|---|---:|---:|---:|
| `55d8e614-341_0` | `4a76bb46-9e12-40c3-9b63-62631e661a1c` | 9 | 0.014649114534 m | 0 m |
| `68824dbc-10e_0` | `34bacdbc-7cda-4c7c-86a8-77ea61c92b02` | 16 | 0.076052554501 m | 0 m |
| `9702ce1b-680_0` | `120f4a58-b4a7-4457-9fb6-587abf4ada13` | 18 | 0.126500707034 m | 0 m |

All ten incident arms use their exact corresponding full connector, project to the old endpoint within 7.5 cm and have no bridge/tunnel/nonzero level active at that endpoint. The `6d89f128-4c8` source does have a bridge range elsewhere, ending at fraction `0.974997681`; this exact connector is at fraction 1, outside that range. This is evidence for finite same-junction continuity, not surveyed altitude.

The first connector needed three missing retained source records. An anonymous read-only `SELECT *` against immutable Overture release `2026-10-21.0` is retained at `historical-cap-connector-source-independent-9413-20261103.json`, SHA256 `fc06053ac7f0cbf6a5b587950046658691ceb1dda6358f026305a43157076663`. No account, billing, runtime source cut or model was changed.

These three old caps are real local support defects to repair. They must not manufacture an independent historical bridge layer. Any solver reference-envelope policy needs explicit owner authorization and must be confined to the exact source-proved finite cap+own-strip component and legacy source branches. Use an interval, not an averaged or selected old sheet. Retain independent crossing clearance outside that component and all final actual body/support checks.

## Full literal metadata re-export and independent parity

Producer supplied `/tmp/road-historical-joint-487-tile-806-context-505-core-9413-metadata-v4.json`, SHA256 `e53f5e0393d812576aedf15cc0edf7f29915c3e7d80e99e75a46d965eb7e7108`. Every record now has literal `actualSurface` metadata. Original d746 provenance remains unchanged; the fresh generation receipts and parent SHA live under `metadataExport`.

The separate independent full review is `docs/qa/evidence/reported-roads/historical-surface-metadata-independent-9413-20261103.json`, SHA256 `a0d241eb86dff712c0f70517f1a15217ae7e91e424fe8b1bfdacff7f7c275487`.

- All 31 original non-triangle fields and all 270,767 ordered legacy triangles match d746 exactly, including original generator/input provenance, copy hashes, ROI, roads, footprints and stadium derivation traces.
- All 270,768 source bindings reproduce their literal Float32 triangle from their own structural quad and paint lift, and bind the exact road/segment/centre/raw source arc.
- All 63 historical modules match literal Git source; all 305 scanned source files and 319 consumed files remain unchanged.
- The independent old City replay supplies 243 binding comparisons across the 101 witnesses. Five corruption controls reject missing/wrong paint lift, moved structural datum, shifted source arc and a lookalike source ID.

One source-footprint multiplicity is retained at triangle 490 (`57571916-420_0`, segment 366). Both bindings have exactly the same `.055` lift, source road/arc/centre and constant structural Y `1.4797942730308686`; only submillimetre quad XZ/order differs. Both emit the same unchanged Float32 triangle. Maximum source-vertex to Float32 XZ residual is `0.0008774622478863521 m`; normalized Float32 structural Y differs by `5.756605525597536e-8 m`. This is not a scalar-height ambiguity. Both source footprints remain explicit, and this metadata review does **not** approve physical traversal of that footprint. No first binding was silently discarded.

The exporter intentionally returned exit 1 for that preserved differing binding. The independent review distinguishes exact scalar datum equality from source-footprint multiplicity; it does not turn an exporter exit code into a global pass or relax the 1 mm serialization bound.

## Required exporter/sampler change

Root owns `scripts/export-historical-tile-road-model.mjs`; this review does not edit it. The matched `Surface` already supplies the needed fields.

1. Export a finite, explicit `paintLift` for **every** matched triangle and retain its exact unpainted `structuralQuad` or equivalent source support binding. Fail closed if missing. Do not derive the lift from road class, `cap: true`, or a default zero. Clipped strips can also have `cap: true`.
2. Capture structural metadata before deduplication. Identical Float32 vertices can have several source/structural associations. Preserve them or reject the ambiguity; do not silently select the first lift or source branch.
3. Add an explicit structural-datum schema marker. The new structural sampler must not silently accept old records lacking the literal fields.
4. Re-export the exact same 487 tile, 806 context and 505 core selectors, unchanged ROI and full old tile context. Require exact d746 literal triangle-key/source-branch multiset, road, copy, L/R footprint and stadium parent-arc parity. Only the datum metadata should be new. Bind the new artifact/exporter/source hashes.
5. Carry the same literal fields through the candidate emitter. Structural LP/reference sampling uses actual Float32 Y minus its own declared lift, verified against the actual unpainted support quad. Raw Float32 asphalt geometry remains intact for actual rendered/body checks.
6. Keep unknown multi-level or unbound surfaces unresolved. The 43 source-classified local seams need a separate exact finite policy/repair; they are not removed by the film fix.

## Scope remains bounded

The joint v5 report has 903 direct historical-headroom rows. Sixteen points fall in the replayed tiles, but none uses either of the 14 replayed road datums. Therefore this research validates **zero** of those old-gap/headroom values. Cap-only false gaps can occur outside the 101 ambiguity list; the full retained triangle union needs the metadata re-export.

No LP, source pack, runtime, model, profile, cache or activation file was changed. Final solved geometry, actual body/tyres/headroom and native drive gates remain open. The prior explicit-width review is unchanged, including its 89 unsupported shoulder controls.
