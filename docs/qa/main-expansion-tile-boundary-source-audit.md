# Detailed-street / core boundary source audit

Status: source diagnosis only, 2026-11-03. No game code, packed source data, active correction, UI, or publication was changed by this audit. The inventory is the held `67ea0a…` model against strict historical `a679` WORLD `f6c089…`, not an assertion about the final model being developed in parallel. No driving acceptance is claimed.

## Bound inputs and coverage

The producer scanned 304 packs: 427,294 unique tile-only drivable owner roads and 44,433 endpoints incident to the core graph. Of these, 300 endpoints on 282 roads disagree with every core endpoint height by more than 2 cm. All 300 already failed this diagnostic in the strict historical baseline; none newly crossed its 1.6 m reachability band. Three became worse, three improved. At 275 endpoints, tile height matches the raw core before later height preparation. These are height diagnostics, not 300 independently reproduced player failures.

The [source response](evidence/reported-roads/tile-boundary-source-audit-20261103/retained-source-2026-10-21.json) contains all 657 requested segment prefixes from the official retained Overture `2026-10-21.0` release, with full UUIDs, source-way versions, geometry, levels, flags, access restrictions and connectors. No prefix is missing or ambiguous. Retrieval used anonymous public S3 reads and took 97.33 seconds. The [classification](evidence/reported-roads/tile-boundary-source-audit-20261103/classification.json) applies each source rule and contributor's `between` interval at the actual connector fraction; an annotation elsewhere on the segment does not authorize the junction.

Exact historical OSM coverage is deliberately narrower: 25 of 516 relevant way/version identities are in the retained caches or the nine newly fetched official historical responses. All historical OSM contributors are checked for four of the 300 endpoints, including the three worsened witnesses. No claim of a complete 516-way historical OSM audit is made. The tile geometry contributors are OpenStreetMap at 267 endpoints and TomTom at 33; an `unknown` road class is not evidence of verified unrestricted road access.

| Input | SHA-256 |
| --- | --- |
| Producer boundary inventory | `74f326ae165946b826b6456b39fdc696b940958f901fb2facde2f8250f7c4af4` |
| Held candidate WORLD | `67ea0a653339c9909a1c10bc764f0ba281123e1540edda3b3fbf3ab0f6a3075c` |
| Strict historical WORLD | `f6c08923a167644655daf166a84849bad68ae0b2d487fd3d8da6e88d1262fc64` |
| Retained source response | `5ff00c285ca24fd6553754be7ab4beee74a6011cb4ef2d37714ab6838c975f63` |

## Physical source connections and height authority

Every one of the 300 tile/core pairs references the same **full source connector UUID**, not just a matching truncated ID. In the Overture model this represents a physical connection, subject to access and turn restrictions. Different relative level values do not invalidate a shared connection; source levels approximate stacking order and do not provide surveyed elevations. This establishes source topology, not independent field verification of every road. [Official segment and connector semantics](https://docs.overturemaps.org/guides/transportation/segments-and-connectors/).

| Connector-specific group | Endpoints | Supported treatment |
| --- | ---: | --- |
| No vertical annotation on either incident source | 255 | Reconcile generated approach heights using actual shared-connector geometry, while retaining separate facility evidence. Null is not a surveyed ground constraint. |
| Positive level / bridge annotation on at least one incident source | 45 | Preserve the real bridge identity and relative order. Check ramp/continuation geometry before selecting a common junction height. |
| Negative level / tunnel annotation at the connector | 0 | Absence does not override the game's separately researched underpasses. |

The tile classes are residential 179, service 76, unknown 37, living street 5, unclassified 3. The positive group contains residential 19, unknown 19, service 4, living street 2, unclassified 1. Only two tile endpoints themselves carry a bridge annotation at their connector; six more tile endpoints belong to a source that has a positive level somewhere else, which must not be applied globally.

Eleven endpoints meet negative modeled core approaches near the separately documented Oliphant / St Johns Road, Rail Nilayam and Anand Bagh facilities. Their Overture connector annotations happen to be empty. Preserve and review the narrow facility IDs, rail IDs and geometry in `src/world/railway-evidence.ts`; do not fill those approaches or create new underpasses from this audit. This audit reviewed that retained facility evidence table, not a fresh field survey.

## The three worsened boundaries

| Tile endpoint / source node | Incident arterial | Historical core Y | Held core Y | Worsening |
| --- | --- | ---: | ---: | ---: |
| `09cb8ebf-516_0`, from `a96cfce5-abe` | `797770c0-fc1_0/1`, Sardar Patel Road | 1.889128 m | 2.391930 m | 0.502802 m |
| `09cb8ebf-516_1`, to `1528e2ce-ad7` | `3628b9ba-e52_0/1`, Sardar Patel Road | 0.250037 m | 0.752839 m | 0.502802 m |
| `15ed83ec-530_0`, from `1d8c454a-85e` | `af1d6fe6-b81_0`, `39ce69a0-3a5_0`, Old Bombay Highway | 1.752088 m | 2.365165 m | 0.613077 m |

All three tile and raw core endpoint heights are modeled zero. None of these six retained source segments declares a bridge, tunnel or level. The [five exact historical ways](evidence/reported-roads/tile-boundary-source-audit-20261103/worsened-exact-osm.json) also lack `bridge`, `layer` and `tunnel` tags:

- Residential `w352232882@1` joins primary `w28131038@15` at actual OSM node `3579912097`.
- Private, one-way service `w1557596671@1` joins primary `w288592791@10` at node `14166407688` and `w28129873@21` at node `14166407691`.

The precise shared historical OSM nodes corroborate the retained full connector identities. The service road's private/one-way status remains intact. Removing the new uniform arterial lifts is a narrowly supported way to avoid worsening these three boundaries; it would still leave the historical height mismatch and is not a complete junction repair. A final correction must join the finite surfaces and retain any separately verified crossing headroom on the same road family.

## Representative source-backed bridge and large generated rise

At Chader Ghat Bridge, tile `52186497-15c_0` shares node `afdce05f-f47` with core `6f091c5a-e90` / `829b6a0f-633`; tile `dbf0bbf4-b4d_0` shares node `8a603fdb-802` with `5c74c8ab` / `0810c74a`. Both sides carry level 1 / bridge flags at the connector. Exact historical `w1274825874@1` declares `bridge=yes`, `layer=1` and residential class. The tile endpoint heights are 0.59 / 0.98 m, while the core retains its estimated 6.8 m deck: inherited gaps of 6.21 / 5.82 m. Tile road lengths are 134.65 / 476.43 m. This supports reconciling a real bridge continuation; it does not support treating either tile road as verified ground or making the entire street elevated. Model a connected approach only after finite clearance, legal access and endpoint constraints are checked.

The largest height gap, 18.274562 m, is `12f14844-ee4_0` at node `90306e2b-541`, incident to the generated Gachibowli–Miyapur primary profile. Its raw core and tile heights were zero. Exact historical primary ways `w1190308702@8` and `w563554166@16` specify three lanes and one-way operation, without bridge/layer/tunnel tags. Residential `w354534990@3` likewise has no vertical tags. This is a generated profile rise to investigate against crossing constraints, not source evidence for an 18 m street. The [representative exact responses](evidence/reported-roads/tile-boundary-source-audit-20261103/representative-exact-osm.json) retain the tags.

## Exporter causes, including split-coordinate errors

The [retained exporter snapshot](evidence/reported-roads/tile-boundary-source-audit-20261103/retained-exporter/manifest.json) explains the original split:

1. `build_edges.py:65–117` creates game height estimates from a prior repository profile or positive relative level rules using an estimated 6.8 m deck and ramp model. Negative levels are not imported in this path. It stores `elev=null` when no positive profile is generated or the resulting height remains below 0.3 m; later cleanup can also clear it. **Null is absence of a retained modeled height profile, not a surveyed ground height.**
2. `make_core.py:22,35–40` includes only motorway through tertiary classes and their links. All five tile classes above are intentionally excluded. `export_city.py:111–115` copies the same edge `elev` into detailed tiles; it does not discard independent tile height measurements. Preparing only the core later can therefore separate incident detailed streets.
3. `fix_decks.py:27–31` assumes that two high major-road arms mean a low arm ends beneath the bridge, despite a shared node. That heuristic does not establish real grade separation and can preserve detached source connections. It must not supersede full connector and facility evidence.
4. `build_edges.py:98–115` splits raw lon/lat geometry using connector fractions through planar Shapely substring/interpolation. Official Overture fractions use **WGS84 geodetic distance in metres**, not raw degree length. [Official linear-reference calculation](https://docs.overturemaps.org/guides/transportation/linear-referencing/).

The [coordinate comparison](evidence/reported-roads/tile-boundary-source-audit-20261103/connector-geometry-comparison.json) confirms the fourth cause: 52 of these held tile/core endpoint pairs differ in packed XY by more than 0.1 m; maximum 13.446189 m at `d17394f6-d0c_0` → `370065ed-0cb` (P.V. Narasimha Rao Flyover), node `7383240e-7c8`. Raw-degree interpolation reproduces own packed core endpoints within 0.068618 m, consistent with 0.1 m rounding. Re-evaluating the same source connector fractions geodetically makes tile and core source points coincide within 0.00000145 m across all 300 cases. Thus the source topology is coherent while the old split coordinates drift. This does not license a blind global XY rewrite: a targeted correction must preserve shape, provenance, owner/context copies, scenery, traffic, rail and all physical consumers.

## Smallest supported correction sequence

1. Preserve the strict baseline, raw pack identities and this 300-row diagnostic separately from any release candidate. Do not count “a match to one core height” as proof that another source-connected arm is correctly stacked.
2. Remove the three new arterial height regressions while solving their actual shared junctions; do not lift private/residential streets to conceal them. Retain established bridge/rail clearance constraints.
3. At a repaired junction, use the full connector UUID and its WGS84-derived physical point. Reconcile each incident source interval, legal access, finite pavement, surface, supports, dividers and scenery from one correction record. Account for inherited XY drift before judging height-only fixes.
4. Handle annotated bridge continuations, unannotated generated approaches, and documented underpasses separately. Protect explicit/surveyed/expressway profiles. If required height, grade and crossing constraints conflict, report the exact component and seek better source authority rather than inventing a flyover, a tunnel or a new connecting road.
5. Re-run the all-pack inventory against the final held model and require no new mismatches, no worsening reachability, matching owner/context tile copies, and matching main-thread / worker / cache surfaces. Then drive the affected joins in both directions with the actual player at lane and shoulder positions, on desktop and touch. This source audit performs none of those acceptance drives and makes no citywide-perfect claim.

## Reproduction

Run from the repository root with a **new** output path; the scripts refuse to overwrite evidence. Classification has immutable input SHA guards and needs only Python's standard library:

```sh
python3 docs/qa/evidence/reported-roads/tile-boundary-source-audit-20261103/classify.py --output /tmp/tile-boundary-classification-recheck.json
```

`check-geometry.py --output NEW_FILE` reproduces the retained planar split. With isolated GeographicLib 2.1 available, `--method wgs84-geodetic --output NEW_FILE` reproduces the geodetic interpretation. `query.py --httpfs EXISTING_DUCKDB_HTTPFS --output NEW_FILE` optionally repeats the anonymous retained-release query with DuckDB 1.4.5; no re-query is needed to reproduce the classification. Query wall time / row order may differ. Retained exporter files are snapshots only and must not be executed as part of this read-only audit.
