# Reported flyover and merge source audit

Status: implementation and independent physical verification are still in progress. This file records provenance and known limits; it is not release acceptance. No Site publication has occurred for these repairs.

## Reproduction and physical cause

The first user image exposes the car pose `(3983.1, 0.6, -2073.2)`, yaw `280.3°`. It is the Tarnaka approach, at the 3/-3 to 4/-3 tile boundary. The initial car center is on the shoulder. Following that heading enters modeled zero-height bypass `ad6f78f1-dc9_0` beside ramp `23427c8c-e37_0`, attached at source node `d6ba3a6d-36c`, `(4015.4, -2074.2)`.

The retained packed mesh originally placed overlapping asphalt surfaces at incompatible heights through the vehicle body. The support query samples the actual finite road quad; choosing the higher surface or ignoring colliders would conceal this geometry error. The independent reviewer reproduced a complete Roadster vertex inside the drawn slab against baseline `a679b72bacefb751057f0282a86571e8e6ef006d`.

The counterflow carriageway `bdf0bad3-182_0` has the same class of local conflict, with modeled ground-branch continuations at both ends. Those continuations must be traced through real attached finite overlap, rather than treating every pair of graph-connected roads as one merge. The transverse `7db1eb5a-d98_0` crossing is a real separated route and retains its surface headroom requirement.

The third user screenshot has no usable coordinate. The gray/blue merge patch is therefore covered by class-level asphalt/soffit/cap/sidewalk checks; no exact-site manual verification is claimed.

## Retained source and width provenance

The immutable packed source came from the retained public Overture release `2026-10-21.0`, queried at:

`https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-10-21.0/theme=transportation/type=segment/`

The full SQL query, requested IDs, returned source-way versions, properties and response timings are retained in the evidence JSON. The four initial full segment IDs are:

- `23427c8c-e371-447d-a62e-f68f3afd47b4`
- `bdf0bad3-1820-4372-8b41-e9579168954b`
- `ad6f78f1-dc91-4942-9a80-1d5f5ede2408`
- `38a7824d-0e1b-4b98-b11f-324c20b78c69`

All four have `width_rules = null`. The upper carriageways carry source `level_rules = 1` in their bridge interiors. Their real bridge identity and crossing order are retained. The absolute 6.8 m deck and ramp interpolation are generated height estimates, not surveyed source elevations. The relevant OSM Tarnaka ways support one-way bridge/layer identity but do not declare a lane count or width. The local two-lane usable-width correction is consequently documented as an estimate.

The original exporter `pipeline/build_edges.py` uses class-default lane counts and class widths. Its segment SELECT does not import source lane metadata; its primary one-way width formula yields `13 × .72 ≈ 9.4 m`. A class-default lane count is not source evidence. Existing Durgam Cheruvu `laneEvidence` remains protected.

## Lane-capacity binding

All 114 initially proposed width-profile edges were audited against exact historical OSM way versions. Every retained connector pair binds to the original packed edge node IDs and endpoints within 1 m. Source-way fractions are mapped to original edge arclength; varied constituent ways remain separate intervals.

- Original 114 proposed edges: 43 have numeric, one-way-supported lane tags; 71 remain inferred.
- Additional 14 known-body roads: exact lane interval bindings added.
- Combined 128-edge evidence set: 57 source-tagged, 71 inferred; zero connector binding errors.

Numeric `lanes` is used directionally only for a source way that supports one-way traffic. A bidirectional total is not treated as a per-carriageway count. `RoadEdge.oneway` describes the denied graph direction, so the mapper does not infer source forward/backward allocation from that field.

Examples that prohibit a blanket two-lane correction:

| Road | Exact source interval capacity |
| --- | --- |
| PV `b6b95ba0-d42_0` | Two lanes throughout its tagged intervals |
| Langar `6b0b1c24-f02_0` | Two lanes on tagged 67.81–809.13 m interior |
| Masab `4e324c1c-ae5_0` | Three lanes 0–79.92 m; two 79.92–890.80 m; three to 937.74 m |
| Masab `72e2e384-7c5_0` | Three lanes 0–47.67 m; two to 845.69 m; three thereafter |
| Masab ground `adb701c2-bb8_0`, `cd18974b-973_0` | Three lanes on their tagged intervals |
| Masjid Banda `c8486d6e-ac1_0` | Four lanes on its tagged interval |
| Link `19baeded-058_0` | Four lanes 0–6.74 m, then one lane to 417.63 m |
| Chandrayangutta `09584ea4-514_0` | One lane 0–20.08 m, then two lanes through 1139.89 m |

A seven-metre narrowing/taper is rejected if it touches a supported interval with more than two lanes. The resulting generic geometry has 78 localized width-profile edges, compared with the earlier 114. Unprofiled elevated roads retain the historical 8.4 m physical minimum unless exact, contiguous one-way source intervals establish one lane across the entire edge (with 10 cm allowance for packed coordinate rounding). A class-default one-lane count alone cannot narrow an unrelated road. Controlled expressway ramps retain their previous envelope. Local reviewed capacity profiles must preserve higher tagged spans and the prior conservative width of unknown one-lane spans. Conservative old scenery exclusions are carried separately so flattening/narrowing cannot reintroduce poles, buildings, or piers. Structural caps use their physical/source support width, rather than the scenery exclusion margin.

An earlier global floor-rule experiment would have changed 130 roads based on inferred class counts. That scope was rejected; `evidence/reported-roads/single-lane-physical-width-change.json` preserves the rejected candidate rather than presenting those roads as verified single-lane capacity. The conservative replacement keeps unknown roads unchanged. Final finite audits still compare derived physical boundaries, because equal stored `[w, pts, elev]` values alone do not prove equal ribbon geometry across a helper-rule change.

## Both-side source-level classification

The 21 independently confirmed body-intersection pairs were checked against all 89 cached exact historical OSM way versions on both sides. Each has bridge or positive-layer evidence on the raised road; none of its packed-zero-height counterpart ways has positive bridge/layer evidence. No pair shares an OSM source-way ID, and no pair has a tunnel/negative-layer tag. None of the counterparts has an explicit ground-level tag either.

These are therefore **21 tagged-bridge plus unknown-level branch cases**, not 21 verified-ground cases. Missing Overture levels, absent OSM bridge tags and generated zero heights do not prove terrain or physical road elevation. The complete evidence is `evidence/reported-roads/known21-both-sides-source-level-classification.json`; 24 of the 42 roads also have exact per-edge source-interval bindings. The remaining constituent-way source fractions are retained without claiming local ground proof.

No lost positive bridge tag or duplicate source-way explanation is supported by the cached data. The preferred correction remains the minimum source-faithful coupling needed at a real connected apron, without adding unsupported flyover structures to untagged streets. Any further bounded modeled lateral correction remains explicitly estimated and requires full capacity, endpoint, road/rail/metro/building/furniture and complete-vehicle verification before integration.

## Bounded source-geometry cross-check

Official current OSM `way/<id>/full.json` was fetched for eleven source ways in the PV and Masab conflict corridors. All eleven current way versions equal the exact historical versions retained by Overture. Each returned node’s version and timestamp is recorded separately, since node geometry can change without a way-version change.

Dense 2 m packed-centerline sampling and the reverse source interior-node check agree within 0.067 m. The 300–550 m shared-ribbon conflicts in these corridors are therefore not explained by coarse source centerline simplification. No source-derived lateral correction is justified by that check. Any bounded modeled corridor correction must remain explicitly identified as an estimate and must preserve the raw pack.

## Verification state

The new pavement guard suite exercises actual emitted Float32 asphalt width, unchanged source objects, conservative scenery envelopes after flattening, source-lane metadata worker transfer, and malformed cache metadata rejection. TypeScript and all nine focused tests pass.

These are not the complete road release gates. The earlier immutable candidate independently failed 21 of 30 complete-car join paths and 13 finite headroom pairs, with a further continuation conflict on the reported carriageway. Its two-road smooth constrained Tarnaka prototype passed the reviewer’s actual emitted mesh/full-car fork tests and the genuine transverse crossing check, but broad road geometry remains under design. The current generic capacity-protected export is solver input and has no overall physical acceptance.

Final acceptance requires a fresh source hold and model identity, complete-car and traffic sweeps on corrected paths, finite surviving-ribbon headroom across the city, rail/metro/building/furniture clearance, legacy regressions, and normal native driving. The source profile build binding intentionally rejects stale generated data while this work proceeds.

## Evidence identity

| Evidence file | SHA256 |
| --- | --- |
| `tarnaka-width-source-2026-10-21.json` | `ae38e406a5cd97190edb3624bedb27e365e1545b50f263d2b3ab583aeca0f9ce` |
| `joined-approach-width-source-2026-10-21.json` | `1028d234a93ee39a771dcf264de30e28dd7e95a309c80d102b302de462c2f68f` |
| `all114-exact-osm-lanes.json` | `8b1eb544e633f1856149b80d6432e5a623f7802a340c034b9b8482b91f832adc` |
| `all114-lane-intervals.json` | `ef2026173a78a759f208598e4f5319a9d90b66a8eed3af2fdaec8deacf4a1ed5` |
| `all128-lane-intervals.json` | `de56dc58628b4f900c386b7d61911183e8ee936243f0e238a8fdd188396036db` |
| `bounded-osm-full-geometry.json` | `cf6945bfbebfbfab20c0a17444cbd68c7bc46fd5c8c380e308e90e36142a9699` |
