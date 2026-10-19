# Whole-map source accuracy — survey revision 47

This layer covers all 10,276 road segments, 80,076 building footprints and 19,507 original business attachments in the existing playable map. It preserves frozen base files and original business point coordinates; explicitly labelled runtime components may be clipped or reconstructed. At revision 47 the research layer has 159 provisional front/sign records, 42 profiles, 207 sources and 273 observations. Its 59 partial sides cover 3,457.79 m of observation windows; visual inventories cover 1,552.75 m (0.119% of total side length), while strictly verified fronts/sides remain zero. Spatial association does not establish current tenancy, entrance or street-surveyed facade.

## Runtime composition

The v2 manifest references `public/world/hyd-metro/v2/source-accuracy.json` (19,856,474 bytes) and `listings.json` (13,373,183 bytes), with SHA-256 and byte counts. The accuracy layer binds to the exact base core checksum and a digest of all sorted chunk IDs and checksums. Mismatched data is rejected when browser integrity checking is available.

`WorldLoader` applies source accuracy first; `StreetSurvey` then applies manual corrections. Researched dimensions, retained footprints and reviewed facade placement take priority. Building rendering and physical collision share final height and source minimum height. Collision also retains the 355 source courtyard holes across 211 buildings: courtyards remain open while their inner walls collide, matching the rendered polygons.

Researched stairs, landings, opening sides and rails use one shared access plan for rendering and collision. Provisional depths are fitted outside the carriageway; a necessary lower entrance recess has matching finite-height body cutouts, solid side/back boundaries and a shared ceiling. The access bodies follow chunk load/unload lifetime. Four openings—MedPlus, the brown Madhapur block, Bawarchi and Pooja—now include lower floors, genuinely descending treads, side/back walls and bounded ceilings. `accessPits.ts` supplies the same rectangles to negative wheel-height support and terrain shader cutouts; moving ground, landscape and footpaths cannot reseal a loaded opening. Unloading the chunk removes its geometry/support/mask together. Six 0.11 m risers create an explicit 0.66 m estimated drop, not a measured basement level. Full basement interiors and pedestrian accessibility remain unmodelled; no teleport or roof landing surface is added.

| Height basis before manual overrides | Buildings |
|---|---:|
| Explicit source height | 28 |
| Source floors, using the disclosed 3.2 m/floor + 0.6 m conversion | 231 |
| Presence-masked 2023 satellite estimate | 50,286 |
| Disclosed class placeholder where source/satellite evidence is unavailable | 29,531 |
| Total | 80,076 |

At revision 47 after earlier manual estimates, the original-building denominator remains 80,076: 28 source heights, 231 floor-derived heights, 50,267 satellite estimates, 29,530 class placeholders and 20 street-review estimates. Every height label remains provisional. Additional split components inherit their parent basis and are not new independent measurements.

The layer changes 71,283 heights relative to the base package. Satellite and placeholder heights have no claimed observed floor count. Source class takes precedence over broad subtype. Source metadata retains 2,066 building classes, four facade colours, 13 facade materials, ten roof shapes and one raised minimum-height record; this remains sparse architectural evidence.

Only four roads have explicit source width rules. The other 10,272 widths remain inferred. Raw source surface rules cover 1,309 selected pieces, unconditional maximum-speed rules cover 2,838, and relative-layer rules cover 117. Their original ranges and conditional metadata are retained alongside the sampled scalar facts. A relative layer is not a metric elevation. The frozen source schema has no lane-count field and its line coordinates contain no metric Z; lane counts and terrain grades stay unknown. Surveyed road-width and building-height corrections default to provisional unless explicit field-measurement evidence supports verification.

## Provisional geometry recovery

The base flags 5,502 building outlines as conflicting with inferred carriageways. Four manual imagery-backed presence corrections already retained their original bodies, leaving 5,498 omitted before generic recovery. The supplemental layer now computes polygon difference against vertically overlapping non-tunnel road ribbons with 0.45 m clearance. It keeps every valid component of at least 3.01 m², preserves holes and source attribution, and never translates a source footprint. Geometry remains explicitly provisional because road widths and many heights are estimates.

Of the 5,502 flagged source outlines, 5,485 require clipping, four already clear the tested vertical roadway, and 13 are consumed or leave no usable part. The layer retains 938,264.46 m² of the original 1,025,212.59 m² (91.52%). Twenty-seven outlines split into multiple components. Manual retained-presence evidence takes precedence over the generic reconciliation.

After the current manual layer, **5,485 formerly omitted parent buildings are recovered**, with 49 extra safe components; **13 unresolved bodies remain omitted**. The final corpus contains 80,125 component records / 80,112 visible masses, compared with 80,076 original source buildings. Component counts are not extra independent buildings. Original outlines remain in the unchanged 1,646 canonical chunk files and runtime audit references. Rendering, map and collision consume the same safe parts with stable parent/component IDs. The corpus check verifies every recovered polygon is valid, lies within its source outline, clears a higher-resolution same-level road buffer and does not overlap another part of the same source.

## Sourced environment and entrance points

`scripts/source_accuracy/build_context.py` exposes frozen Overture/OSM park/land-use and water polygons separately in `public/research/landscape.json`: 881 land-use records plus 32 water records / 921 polygon parts. The source outlines are clipped to the playable boundary and simplified by at most 0.25 m. Thirty-six water lines, two water points and one tiny land-use polygon stay unresolved with source IDs; no channel width/depth is invented. The flat visual surfaces and colours are cartographic assumptions, not measured terrain or water levels.

`station-entrances.json` retains seven original OSM entrance coordinates with node/version URLs and update timestamps. Four associate with Uppal, one Paradise and two Rasoolpura within 19–124 m; the next station is over 950 m away. These same-site associations remain provisional and do not define stair geometry, direction, rise or accessibility. The source snapshot is dated 2026-10-18, while individual source-node updates are older.

`station-geometry.json` separately preserves 11 OSM station exterior envelopes. Nine ordinary, same-line envelopes supply horizontal dimensions, with alignment snap offsets no greater than 5.36 m. Nagole and MGBS require custom layouts; eight other source records remain unmatched. The other 48 station layouts keep fallback dimensions. Source footprints do not establish metric heights, canopy shape, interior detail or stairs. The source association rejects inconsistent marker distance, orientation, curved alignment and mainline/MMTS evidence.

The same component helpers generate station platforms/concourse walls and roof geometry for rendering and collision. The current plan contains 6,679 solid station pieces, not 6,679 independent structures. Two explicit authored portals at Begumpet and Paradise clear the existing flyover lanes in both the visible model and physical bodies; these are provisional model reconciliations, not photographed architectural verification. Their 3.9 m clearance is an authored game allowance above the mapped road. Station vertical dimensions and all fallback shapes remain provisional.

App composes source accuracy, manual survey, mapped transport, station entrance/envelope data and public-realm plans before world physics/session/view creation. Source-mapped roadside geometry, photographed objects and scenario overlays remain distinguishable. Shared smooth signed patches drive speed-breaker/pothole rendering and wheel ground height. Saved-world identity fingerprints the source layer, survey, streetscape, transport, public-realm, landscape, station points/envelopes and the explicit `safe-footprints-station-envelopes-basement-pits-v3` collision-layout version. The current transport audit provisionally matches 82 of 192 signal points, 98 of 457 bus-stop points, two of five auto stands and 45 of 120 crossings. Unmatched points are preserved rather than snapped speculatively. Roadside-fit checks retain 87 of the matched stops and both auto stands for 3D geometry; 100 graph junctions receive sourced signal presence with game-authored timing. The composed environment currently applies 1,321 features and rejects 68 unsafe/unusable fits, producing 1,113 clear roadside solids and 40 shared surface patches: four source-mapped speed breakers plus 36 explicitly fictional residential potholes, with 35 additional scenario drain covers. A photographed pottery display and construction presence remain street-observed with approximate geometry.

The revision 34–35 eastern Madhapur additions preserve the cream/SS ESTATES source footprints and 16.4/15.0 m satellite estimates. Bata uses the existing safely trimmed component, including its clipped western alley edge, and retains the 16.2 m satellite estimate. No footprint restoration, new access bodies or height override is introduced by those profiles. The observed office/gallery/appliance elevations and stock remain provisional appearance, not metric reconstruction.

The revision 36–38 south-carriageway additions estimate Downtown-PG at 18.8 m/six visible levels and the low MedPlus/Vijaya body at 7.4 m/two levels, both explicitly provisional street-review dimensions. Xiaomi retains its 12.5 m satellite mass and source footprint, with one shared fitted raised landing and two side ascent flights (46 solid pieces / 16 treads). Its wider observed basement forecourt/descent remains unexcavated: the narrow pit primitive would misrepresent an unmeasured layout. Dated Xiaomi/TO-LET and repeated below-road fascia boards do not certify active current tenancy.

## Business association

Of 19,507 original fronts, 9,274 source points are contained in their assigned footprint, 9,992 are nearby but outside it, and 241 lack a supported building attachment. Additional facade checks leave 7,641 entries eligible for neutral source listing placards and 11,866 listing-only entries with no named facade geometry. Containment respects holes and boundary points. Facade eligibility additionally checks road side, source distance, actual building edge, road-facing orientation, a connected path through the footprint and road/overlap conflicts.

Passing the audit still leaves floor and tenancy unknown: neutral placards do not fabricate a shop entrance, windows, category props or upper-floor tenancy. Old category-guessed floors and synthetic named kiosks are suppressed. Manual `survey:` records retain researched presentation.

All original IDs, names and point coordinates remain. The independent listing index contains every named source point inside the playable boundary: **37,583** listings, including all original 19,507. Each record retains source attribution and licences. Its `roadId` is nearest-road orientation only, never evidence of a business entrance. Possible stale names, closures, duplicates and ambiguous tenants remain unresolved rather than being relocated speculatively. Overture existence confidence does not measure positional accuracy.

## Satellite source and limitations

Source: Google Research, [Open Buildings 2.5D Temporal](https://sites.research.google/gr/open-buildings/temporal/), 2023, using Copernicus Sentinel-2 data processed by ESA. The publisher offers CC BY 4.0 or ODbL 1.0; this derived height layer selects **CC BY 4.0**. Changes consist of an AOI crop, 4 m sampling, presence screening and footprint median aggregation.

Discovery follows Google's [official download notebook](https://colab.research.google.com/github/google-research/google-research/blob/master/building_detection/open_buildings_temporal_download_region_geotiffs.ipynb). Public COG windows from nine intersecting tiles cover only the playable AOI, without an Earth Engine account. Although native files use a 0.5 m grid, their effective information resolution is approximately 4 m. The cached 5,415 × 4,557 two-band UTM 44N raster is 93,667,100 bytes; its reproducible TIFF is ignored by Git and unnecessary at runtime. `data/raw/google-open-buildings-2023/fetch-manifest.json` retains all source URLs, bounds, projection, resolution, acquisition time and raster checksum.

Footprint samples use pixel centres inside the polygon and outside holes. Keep finite heights 2.5–100 m with presence score ≥0.5; require at least two usable pixels and ≥50% usable footprint coverage. Reject a sample when its interquartile range exceeds max(8 m, 75% of its median). Retain height median, usable/footprint counts, valid fraction, interquartile range and median presence. The presence threshold is an uncalibrated screening rule, not a probability of correctness.

Screening all 80,076 footprints accepted 50,503 samples, rejected 23,112 for insufficient pixels, 6,408 for weak presence coverage, and 53 for mixed/unstable roofs. Source dimensions supersede 217 accepted samples, leaving 50,286 applied estimates. Satellite data dates to 2023, may drift relative to footprints, can blend small adjacent roofs, and may be inaccurate for tall buildings. The published 1.5 m error evaluation covers North America, Europe and Japan; **it does not establish Hyderabad accuracy**.

## Reproduce and verify

Create a Python 3.12 environment with `python -m venv .venv-data` and install `scripts/source_accuracy/requirements.txt`. Frozen Overture Parquet inputs already exist. If intermediate records are absent, run `.venv-data/bin/python scripts/overture/preprocess.py` first.

```sh
npm run source:heights
npm run source:build
npm run source:check
.venv-data/bin/python scripts/source_accuracy/build_context.py
.venv-data/bin/python scripts/source_accuracy/build_context.py --check
npm run source:test
npx vitest run tests/unit/source-accuracy.test.ts tests/unit/geometry-reconciliation.test.ts tests/unit/source-context.test.ts tests/unit/world-identity.test.ts
npx vitest run tests/unit/basement-pits.test.ts tests/unit/terrain-cutouts.test.ts tests/unit/station-geometry.test.ts
CALIBRATE_ALL=1 npx vitest run tests/unit/missions-v2.test.ts --reporter=dot
```

`source:check` regenerates the whole association/listing layer and requires byte-identical runtime outputs and manifest references, after verifying frozen core/chunk checksums. Tests cover full-map counts, coordinate preservation, source/satellite/manual precedence, quality gates, raised collision, displaced/opposite-side/wrong-building associations, synthetic kiosks and integrity rejection. The all-40 mission report records hashes for authored input layers, survey revision, pit count and layout stamp. Its fixture composes source accuracy → manual survey → transport → station entrances/envelopes → merged mapped/photographed/scenario public realm before physics, matching App; landscape is visual-only. Test success does not verify real-world dimensions or complete the frontage survey.

Roads/buildings retain Overture per-record attribution and ODbL treatment; listings retain CDLA-Permissive-2.0, Apache-2.0 or CC0-1.0 as recorded. Google Street View imagery is research reference only and is not copied into game textures. `DATA_SOURCES.md` retains original source and licence records.

Revision 40 adds only provisional appearance/sign records for the cream corner and Madhapuram Food Court. All 80,125 applied component physical inputs and existing access plans remain unchanged from revision 39. The court's observed low open canopy still conflicts with its inherited 7 m class fallback; this is documented pending architecture, not a corrected building mass. Only the new bounded immediate median is visually inventoried; the outer shop side remains incomplete.


Revision 41 appends the r223 55–154.93 m tail without replacing its earlier prefix. Twelve provisional glass/bank frontage records and two appearance profiles retain the 19.2/20.2 m satellite masses and all existing physical geometry. The broad Madhapur Pride source-parent gap is explicit: neither a narrow source strip nor a guessed union is promoted to the missing body. Only the immediate median completes a visual inventory; northern units, floors, upper rooms and eastern source associations remain incomplete.

Revision 42 adds six retained-source appearance/signage profiles and twelve provisional records on the next 112.13 m. Happi/Arvind and Ramraj/upper records use existing safe trimmed faces; no outline, height, level, support or access is restored or changed. Nine authored fronts now sit on actually reconciled parents (previously three), while unsupported raw placards on them remain zero. Low canopies with unresolved source parents remain observations. This pass completes only the bounded immediate-median visual inventory, with both outer shop sides still incomplete.

Revision 43 adds two appearance profiles, three provisional fronts and the BALAIAH YADAV ENCLAVE name anchor across the next131.89 m. All80,125 applied component body inputs and both affected access plans remain unchanged. Two specifically contradicted public facade labels are suppressed from dated imagery evidence while original source files stay intact. Missing gas/laundry outline, clinic/canopy split, booth/stall/kiosk and temple geometry remain pending; median-only visual inventory does not certify their reconstruction.

The revision 43 matched-view check still finds architectural gaps: Godavari's red arched ground frontage and curved upper frame are not reproduced by its current glazing template. Enclave balcony recesses, ornament, forecourt and stairs remain approximate. Correct provisional labels do not establish exact facade reconstruction.

Revision 44 adds seven fronts, two appearance profiles and two structural-name anchors over114.80 m. All80,125 component body inputs and both affected access plans are unchanged. FACE CLINICS uses a retained safe source face, increasing authored fronts on actually reconciled parents from9to10, with unsupported raw plaques still0. The bus waiting shelter, benches/three bins, parking/stilt openings, shared stairs and endpoint utility remain pending; original public-realm files and physical plans are unchanged.

Revision 45 adds no reconstructed front/profile, building or road correction. It records LEFT-only first-pass windows246.48 m on three connected edges,23 dated views (2April2026 /21January2025),15 pending observations and one guarded continuation update. RIGHT/visual inventories and all physical input fields stay unchanged. One clinic facade label contradicted by the photographed reservoir utility is suppressed; raw source retained. Exact geometry, source-width alignment and detailed placement remain in the twelve-group second-pass queue.

Revision 46 adds 525.74 m of LEFT-only partial observation windows across nine connected roads, with 17 dated views (6 April 2026, 11 November 2025) and 20 pending observations. It adds no fronts/profiles, RIGHT inventory, visual completeness, suppression, geometry or source measurements. Uncertain 131 m/168 m framing is held. Combined first-pass exports total 772.22 m / 40 views / 25 deferred issue groups; the separate Durgam–Madhapur progress files remain byte-unchanged at 950.99 m and are not additive with that overlapping total.

Revision 47 adds 444.68 m of LEFT-only partial quickpass observation windows on five connected roads, twelve new November 2025 views and eleven pending observations. Two reused 46 endpoint references are not counted again. No fronts/profiles, suppressions, physical changes, RIGHT review or visual completeness is added. Combined first-pass totals are 1,216.90 m / 52 views / 30 issue groups; Raidurg-only is 970.42 m. Detailed shelter, wall/foliage, TRIDENT entrance and public-access work remains pending. The separate Durgam–Madhapur progress files remain unchanged.
