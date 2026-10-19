# DATA_SOURCES: provenance, conventions and transformation history

> Handoff snapshot: validated survey revision **102**, 708 sources, 551 observations and 169 provisional storefronts. Strict verification remains zero. See [root STATUS](../STATUS.md) and the current root ASSIGNMENTS; the revision-specific narrative below is historical and does not activate work.

## Active composed world — survey revision 47 (2026-10-18)

The default package is `public/world/hyd-metro/v2/`: 10,276 road edges / 654.21 km, 80,076 original building footprints, 19,507 original front records, 37,583 named listing points and 57 metro stations. The older Uppal–Tarnaka package remains a fallback. Frozen importer records and current runtime composition use different denominators; the tables below describe the current composition. [Source accuracy](data/research/source-accuracy.md) and [street research](data/research/street-survey.md) record methods and limitations.

| Current layer | Source and transformation | Remaining uncertainty |
|---|---|---|
| Heights | 28 explicit source heights, 231 floor-derived heights, then 50,286 masked 2023 satellite estimates and 29,531 class placeholders before manual review. Current manual review replaces 20 of the latter estimates: the original-building denominator then has 50,267 satellite / 29,530 class / 20 manual estimates. | Every height label remains provisional. Satellite effective resolution is 4 m; neither inferred floors nor Hyderabad metric accuracy is established. |
| Building presence | 5,502 frozen outlines are flagged for road conflicts. Four manual presence overrides leave 5,498 omitted before recovery; safe polygon difference restores 5,485 of those parents and retains 49 extra parts. | 13 outlines remain unresolved and omitted. The final layer has 80,125 component records / 80,112 visible masses. Trimmed parts are disclosed estimates, not measured footprint corrections. |
| Businesses | Source accuracy classifies all 19,507 original front records; 7,641 support neutral placards and 11,866 stay listing-only. The separate index preserves all 37,583 named points. Revision 47 contains 159 provisional photographed front/sign records on 42 profiles. | A point or contained listing is not a tenancy or doorway. Repeated branding is not another shop. Strictly verified fronts and road sides remain zero. |
| Roads | Four source width rules, 1,309 surface rules, 2,838 unconditional speed-limit samples and 117 relative-layer rules, with original ranges/conditions retained. | 10,272 widths remain inferred; lane counts and metric terrain Z are absent. Bridges, tunnels, ramps, curbs and markings still contain authored geometry. |
| Landscape | Frozen Overture/OSM polygons yield 881 land-use and 32 water records / 921 parts, clipped to the boundary and simplified by at most 0.25 m. | Flat surface elevations and colours are visual assumptions. 36 line waterways, two water points and one tiny land-use polygon remain unapplied. |
| Roadside context | OSM 2026-10-18 snapshot retains original coordinates/tags. The composed plan applies 1,248 mapped features, two photographed features and 71 scenario features. | Fitted positions/dimensions are provisional; 68 unsafe/unusable fits are withheld. Potholes and drain scenarios are not a survey of real defects. |
| Station envelopes | `station-geometry.json` retains 11 source polygons: nine ordinary same-line station envelopes inform horizontal extents; Nagole/MGBS remain custom-layout evidence, with eight other records unmatched. | Heights, platforms, concourse detail and access are authored. The other 48 layouts retain fallback dimensions. Shared bodies/roofs and the two flyover-clearance portals are model geometry, not verified architecture. |
| Station entrances | Seven OSM points associate provisionally with Uppal (four), Paradise (one) and Rasoolpura (two). Original coordinates, node versions and timestamps remain. | A point does not specify a stair footprint, direction, rise or current accessibility; this is not seven surveyed access models. |
| Basement support | Four existing photographed opening records drive shared lower floors, descending treads, retaining walls, bounded ceilings, terrain cutouts and wheel support. | The six 0.11 m risers / 0.66 m drop are an explicit authored estimate. Full basements and interiors are not reconstructed. |

The whole network has a work inventory of 20,552 sides in 1,913 connected blocks / 57 work regions. Actual imagery review covers 59 partial sides / 3,457.79 m of observation windows; 1,552.75 m (0.119% of total side length) has a visual inventory. Its 207 sources and 273 observations are not full-map completion. No field measurement is claimed. Google Street View is reference only; no imagery is distributed as game textures.

Additional provenance is retained in `data/raw/osm-street-context/`, `data/raw/osm-metro-context/`, `data/raw/google-open-buildings-2023/`, the research manifests and batch receipts. App applies source accuracy and manual survey before attaching transport, station entrances/envelopes and public-realm plans. Rendering/collision share the final geometry; landscape is visual-only. The checkpoint identity includes every loaded layer and `safe-footprints-station-envelopes-basement-pits-v3`.

## Historical v1 acquisition and importer record

The numbered sections 1–9 below describe `public/world/hyd-uppal-tarnaka/v1/` and its original derived files. Their counts, network-access limitations and acquisition statements are historical; they do not describe revision 47. The later v2 sections preserve the frozen importer rules. Current runtime behaviour is the composed layer above.

## 1. Provenance

| Item | Value |
|---|---|
| Handoff kit | version 3.0, prepared 2026-10-17 (`hyderabad-game-handoff/kit-manifest.json`) |
| Master specification | `MASTER_PROMPT.md`, sha256 `98a0c57adf883fcf82520106c48e8f6388c4844263d5b41e1eaaa6f3808b50e9` (re-verified by `sources-manifest.json` and `validate-world.mjs`) |
| Source snapshot id | `osm-hyd-20261017` (reference date 2026-10-17) |
| Provider | OpenStreetMap contributors, via the OSM API 0.6 `map` endpoint (four street extracts) and an Overpass recursive query (metro network) |
| Acquisition | 2026-10-17, see `hyderabad-game-handoff/resources/osm/resource-acquisition-manifest.json` (request URLs, received_at times, counts, sha256) |
| Licence | Open Data Commons Open Database Licence (ODbL) 1.0, attribution "© OpenStreetMap contributors" |
| Network use by the importer | none. Overpass and Geofabrik are blocked by the environment network policy; only bundled files are read |
| `generatedAt` | 2026-10-17T20:16:44Z = `created_at` of the acquisition manifest (derived from the source snapshot, never the wall clock) |

Files actually read by `scripts/import-map.mjs` (paths relative to the repository root; sha256 values are recorded in `sources-manifest.json` and in `manifest.sourceManifest`, and match the acquisition manifest):

| File | Content | Acquisition bbox (W,S,E,N) |
|---|---|---|
| `hyderabad-game-handoff/resources/osm/corridor-01-uppal-stadium.osm` | OSM XML | 78.551, 17.398, 78.564, 17.410 |
| `.../corridor-02-stadium-ngri.osm` | OSM XML | 78.542, 17.405, 78.557, 17.417 |
| `.../corridor-03-ngri-habsiguda.osm` | OSM XML | 78.537, 17.412, 78.550, 17.423 |
| `.../corridor-04-habsiguda-tarnaka.osm` | OSM XML | 78.522, 17.418, 78.544, 17.431 |
| `.../metro-network-full.json` | Overpass JSON, relation 8826295 recursive (2,450 nodes, 91 ways, 10 relations), `osm_base_timestamp` 2026-10-17T20:07:36Z | n/a |
| `.../resource-acquisition-manifest.json` | provenance record (also used for `generatedAt` and bbox union) | n/a |

The four boxes overlap and were requested separately within seconds, so they are not one atomic snapshot. Elements are de-duplicated by id and the highest `version` wins (the kit audit found no version conflicts: 37,990 unique nodes, 8,336 ways, 56 relations). `corridor-named-features.json`, `corridor-evidence-summary.json`, `uppal-starter-osm-map.osm` and the per-line `metro-*-full.json` files are listed in `sources-manifest.json` but are not needed by the importer (they are derived from, or subsets of, the files above).

`sources-manifest.json` also lists, as sources only, the Poly Haven materials (CC0-1.0: Aerial Asphalt 01, Concrete Wall 006) and the Noto Sans Telugu font (OFL-1.1) from the two `asset-manifest.json` files. The art worker builds `assets-manifest.json` separately; these are not geographic data.

## 2. ODbL attribution and distribution obligations

- Attribute "© OpenStreetMap contributors" (https://www.openstreetmap.org/copyright) in the game credits/about screen and in the map view wherever OSM-derived geometry, names or POIs are shown. Keep a link to the ODbL 1.0 text.
- The runtime package, `scope.geojson`, `qa/coverage.geojson` and `name-registry.json` are a Derivative Database / Produced Work of OSM data. If the database (or an extraction of it) is publicly distributed, it must be offered under ODbL 1.0 (share-alike) with the notice above. Keep this file, `sources-manifest.json` and the raw bundled snapshots with any redistribution of the data.
- A Produced Work (rendered map images/screenshots, the game visuals) needs the attribution notice but is not itself share-alike. The legal classification of the game as a whole is not decided here and needs review before release (acceptance G10).
- Contributor metadata (user, uid, changeset, timestamps) and contact tags (phone, email, website) are not copied into any output; the parser keeps only geometry, tags used by the rules below, `version` and ids.
- Original game code, generic art and the font are covered by their own licences, not by ODbL.

## 3. Coordinate system and projection

Fixed origin `WORLD_ORIGIN = {lat: 17.4146, lon: 78.5484}` (never change within a world version). Local metric frame: X east (m), Y up (m), Z south (m), so `z = -northing`.

Local tangent-plane equirectangular projection on WGS84, using the radii at the origin latitude:

```
N = a / sqrt(1 - e^2 sin^2 phi0)                 = 6380050.094 m   (prime vertical)
M = a (1 - e^2) / (1 - e^2 sin^2 phi0)^1.5       = 6341141.900 m   (meridional)
x =  (lon - lon0) * cos(phi0) * N * pi/180
z = -(lat - lat0) * M * pi/180
```

Error bound: compared with the WGS84 geodesic (Vincenty), the worst relative error of any pairwise distance within a +-5 km box around the origin is 0.0245 percent (0.0060 percent for distances measured from the origin). The documented bound is therefore below 0.05 percent over +-5 km (about 5 m per 10 km). The package itself spans x -2661..1672 m, z -1880..2513 m (4.3 km by 4.4 km, including the non-routable roads). The inverse (`unproject`) is exact; lat/lon in outputs are rounded to 6 decimals (about 0.1 m).

Rounding: local coordinates, lengths, heights and elevations to 0.01 m; lat/lon to 6 decimals; headings to 4 decimals (radians). All lengths (`lengthM`) are computed from the rounded points.

## 4. Conventions (use these everywhere)

- **Heading** `h` (radians): forward vector = `(-sin h, 0, -cos h)`, i.e. `h = atan2(-dx, -dz)` for a travel direction `(dx, dz)`. `h = 0` faces -Z (north), `h = -pi/2` faces +X (east), `h = pi` faces south. Used for `facingHeading` and `metro.pillars[].heading` (the heading points along the alignment direction Nagole to Raidurg).
- **Side** (`left` / `right`, for `Building.frontSide`, `Poi.roadSide`, `DeliveryLocation.side`): relative to the edge forward direction (the order of `RoadEdge.points`), viewed from above with north up, i.e. the driver's own left when travelling along `points`. With travel direction `(dx, dz)` and displacement `(rx, rz)` to the object: left if `dx*rz - dz*rx < 0`, else right. Test case (also asserted by the validator): travelling east `(1,0)`, an object to the north (`z` negative) is on the left. The vector to the left of `(dx, dz)` is `(dz, -dx)`.
- **Directed edges**: `${roadId}:f` follows `points` order, `${roadId}:b` the reverse. One-way roads only have `:f`. A road with `oneway=-1` is stored with reversed `points` so that `:f` is always the legal direction.
- **Left-hand traffic**: a vehicle keeps to the left and reaches the left curb. For two-way roads a `DeliveryLocation.approachEdges` entry is the one directed edge on which the POI is on the driver's left (`:f` if `side == left`, else `:b`). For one-way roads it is the single legal direction (`:f`), the POI side may be either.
- **Polygon winding**: footprints and stop polygons are counter-clockwise when viewed from above (+Y) with north up. Because Z points south this is a NEGATIVE shoelace area computed on `(x, z)` (`sum(x_i*z_{i+1} - x_{i+1}*z_i)/2 < 0`). Footprints are not closed (first != last). Building holes are wound the opposite way (clockwise from above). The boundary polygon is also CCW from above.
- **Levels and elevation**: `level` is the OSM `layer` (integer, default 0) and is a relative stacking order, never metres. `elevationM` / `pointElevM` are authored provisional metres (section 6.7). Coincident x/z on different levels remain different `surfaceId`s (`s_<level>_<roadId>`).
- **Chunks**: 200 m grid, `ix = floor(x/200)`, `iz = floor(z/200)` of the building centroid; id `c_<ix>_<iz>` (negative indices appear, e.g. `c_-4_-2`). Only chunks with buildings are listed. `ChunkRef.file` and `core.file` are relative to the folder containing `manifest.json`.
- **Ids** are stable functions of OSM ids: roads `r_<wayId>_<segIndex>` (segIndex counts split segments along the original way direction), nodes `n_<osmNodeId>`, junctions `j_<osmNodeId>`, buildings `b_<wayId>` (relation buildings `b_r<relationId>[_k]`), POIs `p_node_<id>` / `p_way_<id>`, stations `st_<slug>`, deliveries `d_<slug>`, names `nm_<kind>_<slug>`.

## 5. Output files

| File | Purpose |
|---|---|
| `public/world/hyd-uppal-tarnaka/v1/manifest.json` | `WorldManifest` with sha256 and size of `core.json` and of every chunk, source file hashes, counts |
| `.../core.json` | `WorldCore` (roads, nodes, directed edges, junctions, POIs, metro, stations, deliveries, names, boundary) |
| `.../chunks/c_<ix>_<iz>.json` | `WorldChunk` (buildings) |
| `public/world/world-manifest.json` | ledger-style manifest (`kind: world_manifest`) bound to the SHA-256 of `scope-manifest.json` and to the snapshot id, for `monitoring/verify_run.py` |
| `scope-manifest.json`, `data/scope-baseline.json`, `scope.geojson`, `qa/coverage.geojson` | frozen scope inventory and its geography (section 8) |
| `name-registry.json` | all `NameRecord`s plus a metadata header |
| `sources-manifest.json` | every bundled source file with sha256, bytes, provider, date, licence, coverage and gaps |
| `data/import-report.json` | deterministic selection statistics (dropped edges and why) |

Determinism: same inputs give byte-identical outputs (sorted ids, 0.01 m rounding, no wall clock). `node scripts/validate-world.mjs --check-determinism` runs the importer twice into temporary folders and compares every output hash with each other and with the files on disk.

## 6. Transformation history and rules

Pipeline in `scripts/import-map.mjs`: parse the four OSM XML files (fast-xml-parser, contributor attributes dropped), de-duplicate by id (highest version), project, select roads, build the graph, derive elevation, buildings, POIs, metro, deliveries, names, boundary, write outputs and hashes.

### 6.1 Road selection (also summarised in `scope-manifest.json`)

1. **Drivable classes.** `highway` in motorway, trunk, primary, secondary, tertiary, their `*_link`, unclassified, residential, living_street, service. Excluded: `service=parking_aisle|driveway|drive-through`; `access=private|no` (unless `motor_vehicle`/`motorcar` explicitly allows); `motor_vehicle=no|private`; `motorcar=no|private`; `vehicle=no|private`; `area=yes`; `tunnel=building_passage`; and all other highway classes (footway, path, steps, track, cycleway, pedestrian, construction, proposed, services). Result in this snapshot: 932 drivable ways from 1,347 highway ways. Exclusions: 341 `access=private`, 57 non-car classes, 11 `motorcar=no`, 2 `motor_vehicle=no`, 1 `motor_vehicle=private`, 2 building passages, 1 parking aisle.
2. **Blue Line alignment.** Built from the ways of the two Blue route relations (8297688 Nagole to Raidurg, 5468841 Raidurg to Nagole; both are separate track ways, 513 and 502 nodes), stitched in member order, then sliced between the Uppal and Tarnaka stop positions extended by 150 m at both ends (about 5.05 km per direction). Direction one (8297688) is the primary alignment used for pillars and delivery ordering.
3. **Candidate edges.** Ways are split at junction nodes (a node used by two or more candidate way positions, or a way end) into edges `r_<wayId>_<segIndex>` (2,198 edges from the 932 ways). Each edge gets the minimum distance from its geometry (densified to 10 m) to either Blue alignment.
4. **Routable core (hard requirement).** The routable subset must be strongly connected so that every delivery has an outbound and a return route. It is evaluated on directed edges with the turn rule of section 6.3. Procedure:
   - candidates = edges within a reconnection radius R of the alignment. R starts at 500 m and grows in 250 m steps until the number of edges within 200 m that survive step 2 equals the number that would survive using the whole acquired network (target 303). R = 1000 m was needed (500 m: 59 survivors, 750 m: 161, 1000 m: 303). Edges beyond R: 43 dropped;
   - keep the largest strongly connected set, iteratively dropping any road for which any of its directions is outside it (8 iterations): 161 edges within 200 m and 315 edges beyond 200 m dropped;
   - prune edges whose every point is more than 200 m from the alignment, farthest first, unless removing one breaks strong connectivity of what remains: 1,024 pruned, 352 kept only for connectivity (23.6 km); 
   - final check: the routable subset is one strongly connected component of 1,162 directed edges.
5. **Non-routable boundary roads (weak extension).** The strongly connected core alone lost 161 of the 464 edges within 200 m of the alignment (13.7 km of 38.4 km), because one-way carriageways run out of the acquired data (sinks or sources) and the pockets reachable only through them cannot be strongly connected. That removed the Uppal X Roads and Tarnaka junction areas, the anchors of the corridor. They are now added back without inventing geometry: every edge within 200 m of the alignment that is WEAKLY connected (undirected path of edges within 500 m) to the core is kept, together with the cheapest linking edges within 500 m (154 edges within 200 m plus 7 link edges, 13,588 m). Each carries `routable: false` (core edges `routable: true`). They are drivable OSM roads with real `directed` edges and `next[]`, are not used for deliveries or by the strong-connectivity guarantee, and the router must never plan through them (their one-way ends are traffic sinks or sources, so many have an empty `next[]`). Only 7 edges within 200 m (281 m, small residential pieces with no undirected link within 500 m) remain dropped. The two Tarnaka Flyover bridge ways are now in the package (non-routable, 6.5 m provisional); the two Sitaphalmandi Flyover ways are not. Stations: nearest selected road to the station position is 7.4 m (Uppal), 4.1 m (Stadium), 4.6 m (NGRI), 7.1 m (Habsiguda), 8.8 m (Tarnaka); nearest ROUTABLE road is 167.7 m from Uppal and 312.9 m from Tarnaka (the others 4 to 7 m).
6. **Result.** 816 RoadEdges, 61,872.87 m of physical road: 655 routable edges (48,284.86 m; 24,703.74 m within 200 m in 303 edges, 23,581.07 m beyond 200 m in 352 edges kept for connectivity) and 161 non-routable boundary edges (13,588.01 m; 154 within 200 m = 13,402.19 m, 7 links). 718 graph nodes, 294 junctions (degree 3 or more), 1,406 directed edges (1,162 routable). Length convention: sum of OSM centreline lengths of the selected RoadEdges, each two-way road counted once.

### 6.2 Direction

`oneway=yes|true|1`: forward only. `oneway=-1|reverse`: points reversed, then forward only. `junction=roundabout` implies one-way. Everything else (including untagged roads and `oneway=no`) is two-way. No implicit one-way is derived from the road class (motorway/trunk links without a tag stay two-way: "follow tag only"). Direction status is always `provisional`; the provenance note records the basis ("tag oneway=yes", "junction=roundabout" or "untagged: treated two-way (unknown)"). 590 of 816 selected edges (507 of the 655 routable ones) are untagged and therefore assumed two-way.

### 6.3 Directed edges and turns

Every road has `:f`; two-way roads also have `:b`. `next[]` at `toNode` is every outgoing directed edge except the immediate U-turn onto the reverse of the same road. The U-turn is kept when it is the only option (dead end) and also when the arriving edge is the only edge arriving at that node (a two-way spur hanging off the start of a one-way road), because otherwise the reverse direction would be unreachable. Routable edges keep the `next[]` of the routable-only network plus every outgoing non-routable directed edge at their end node, so the routable subset stays strongly connected; non-routable edges use the same rule on the full network. All turns are `provisional`: the source has 0 `type=restriction` relations, which means unresolved, not permitted. Median openings and U-turns on dual carriageways are not in the source.

### 6.4 Width

`width` tag if present (none of the selected roads has one); else `lanes * 3.2 m` (52 selected roads have a lanes tag); else class default: trunk/primary one-way 10.5 m, two-way 12 m, secondary 9 m, tertiary 7.5 m, residential/unclassified 6 m, service/living_street 4.5 m, `*_link` 5.5 m. All widths are `provisional` and the provenance note states the basis. **Clamp (step 9b of the importer):** for every road whose width is not from a width tag, the centreline is sampled every 5 m or less and the half width becomes `max(floor, min(default, minClearance - 0.6 m, alignmentLimit))`, where `minClearance` is the distance to the nearest source building footprint edge (0 inside a footprint) over all 6,763 candidate footprints, and `alignmentLimit` is (distance to the Blue alignment polyline - 1.0 m) wherever the road runs within 25 degrees of it and within 12 m. The floor is 4.5 m total (3.0 m for service/living_street, never above the default). 373 of 816 roads were clamped (319 by footprints, 65 by the alignment, 262 end at the floor); the note reads "class default clamped to source footprints/metro alignment". Resulting widths: 3.0 m or less 11 roads, 3.0 to 4.5 m 12, exactly 4.5 m 314, 4.5 to 6 m 97, exactly 6 m 219, 6 to 9 m 65, 9 to 10.5 m 52, 10.5 m 46 (full histogram in `data/import-report.json`). Where the floor still overlaps a footprint, the building is kept and marked `intrudesCarriageway: true` (258 buildings along 166 roads; lists in `data/import-report.json` and `CONTENT_GAPS.md` C28).

### 6.5 Buildings

Closed `building=*` ways (not `no`) and `type=multipolygon` relations with a `building` tag when all member ways are present (one relation in the extract was incomplete and skipped). The footprint becomes a building if its centroid is within 120 m of a selected road and its area is at least 1 m2. Result: 5,297 of 6,763 candidates. Footprint CCW (section 4), not closed. `heightM`: `height` tag if present (2 buildings), else `building:levels * 3.2 + 0.6` (17 buildings), else a deterministic provisional 2 to 5 storeys from a SHA-1 of the building id (`storeys * 3.2 + 0.6`, 5,278 buildings, `levels = null`). `heightStatus` is always `provisional`. `frontRoadId` is the nearest selected edge to the centroid, `frontSide` its side (section 4).

### 6.6 POIs

Nodes and ways with `shop`, `amenity`, `office`, `tourism`, `leisure`, `craft`, `healthcare`, plus named `historic`, `man_made`, and named buildings (category `building:<value>`), excluding street-furniture amenities (bench, waste basket, parking, toilets and similar) and unnamed amenity/leisure items, within 80 m of a selected road (229 POIs, 219 named). Category is `key:value`. `buildingId` is set when the point lies inside a retained footprint. Name and geometry status `provisional`. `nameId` is only set for the delivery POIs.

### 6.7 Levels, bridges, tunnels, ramps

`level` = OSM `layer`. Provisional elevation: bridge `6.5 m * max(1, layer)`, tunnel -5 m, otherwise 0. Ramps (all provisional, `status.height` provisional on bridges): a bridge end whose single at-grade neighbour is a chain of degree-2 nodes at least 120 m long (or ending in a dead end) is approached by that chain, which ramps linearly down to 0 over min(120 m, chain length). A bridge end at a junction (two or more at-grade roads at the node), whose chain reaches a junction within 120 m, or with no connection, keeps the node at grade and the bridge edge itself ramps from 0 over its first/last max(25 percent, 30 m) (at most half of the edge); break points are inserted where a ramp starts or ends. Every incident edge therefore has the same elevation at a node, and the validator checks this (spread at most 0.011 m, report limit 0.5 m). The package contains the two Tarnaka Flyover bridge ways (non-routable); both ramp inside the bridge edge (0 to 6.5 m over about 138 m) and their approach edges stay at grade. There is no tunnel. A synthetic self-test in `validate-world.mjs` covers dead-end, long-chain, junction and free-end cases. Widths: bridge decks and samples above 2.5 m ignore the footprint and alignment clamps (section 6.4); a deck keeps its default width.

### 6.8 Metro

- `metroLines` red/blue/green: `geo` polylines from the ways of the route relations of 8297698, 13986696 and 8297697 (stitched; platform and stop nodes are skipped), lat/lon at 6 decimals. `local` polylines are the same ways in local metres clipped to the package bounds plus 300 m (Blue only has any; Red and Green are outside the package). Line colours are authored display colours, not source data.
- **Stations**: stop positions (`public_transport=stop_position`) of both directions of every route are grouped by name per line, with the suffix "(Red|Blue|Green Line)" removed; the same name within 400 m on different lines is one interchange station. Result: 27 Red + 23 Blue + 10 Green per-line stations, 57 unique (Ameerpet: Red/Blue, Mahatma Gandhi Bus Station: Red/Green, Parade Grounds: Blue/Green), matching the official unique total. `sourceName` keeps the original OSM spelling of the first line (red, blue, green order), other spellings are aliases. Position: for the five corridor stations the OSM `railway=station` node in the extract (stop positions are listed in `osmIds`), otherwise the mean stop position. `inCorridor` is true only for Uppal, Stadium, NGRI, Habsiguda and Tarnaka. `isDeliveryEntrance` is always false (Q04). The Green terminus is the source stop "JBS" and its Green neighbour is "Parade Grounds (Green Line)"; the operator's "JBS Parade Ground" naming is not reconciled by this import.
- **Pillars**: authored every 30 m along the primary Blue alignment inside the package bounds plus 300 m (226 generated). A pillar is dropped when its 1.0 m radius footprint lies within 0.5 m of any selected carriageway (distance to centreline minus half width below 1.5 m, crossing roads included): 79 dropped, 147 kept. Heading per section 4. `deckHeightM` 12.5, `deckWidthM` 9.0, `heightStatus` provisional: no measured clearance exists in the source.

### 6.9 Deliveries

Ten real named POIs (restaurants, cafes, fuel, banks, pharmacies, clinics, shops; amenity whitelist, within 35 m of a non-bridge, non-trunk edge of at least 26 m, at least 10 m from the edge ends) are picked one per tenth of the corridor length, then adjusted deterministically so that at least: 3 are on side roads (not trunk/primary/secondary), 1 is on a dead-end spur, 3 are on each side of the metro alignment, 1 main-road frontage is on each side of the alignment, 2 are on each road side; then topped up to 10 with candidates at least 250 m apart. `approachEdges`, `stopPolygon` (14 m along the road following its curvature x 4.5 m wide against the curb on the POI side, within the clamped carriageway half width; candidates whose polygon would intersect any source footprint or lie within 1.0 m of a kept pillar are rejected), `entrance` (the POI projected onto the curb line, half the road width from the centreline), `facingHeading` (heading of the approach travel at that point) follow section 4. All stop geometry is provisional: nothing was checked against imagery or a survey.

### 6.10 Names

One `NameRecord` per distinct displayed name: 48 road names, 57 stations, 3 lines, 24 neighbourhoods (`place=*` nodes inside the package area), 10 delivery POIs. `sourceName` is the OSM spelling; `displayName` collapses whitespace, capitalises the first letter and shows `;` as ` / `; typos in the source (for example "Strret No 2") are preserved. Telugu comes only from `name:te` tags (56 records have one); none was invented, and the Blue route-level `name:te` (నాగోల్) is not used as a line name. Verification is `provisional` everywhere. `name-registry.json` adds a `position` to neighbourhood records for labelling.

### 6.11 Playable boundary

`polygon` is the convex hull of all selected road points expanded by 60 m (hull of 16-gon rings around the hull vertices), CCW. This is deliberately simple: it encloses buildings but also empty land between arms of the network. The hull includes the non-routable roads. `exits` are edges touching a dead-end node of the selected network that has an unselected drivable neighbour, or that lies within 20 m of the outer edge of the acquired data (66 edges, including the non-routable one-way carriageways that leave the boxes).

## 7. Privacy

`user`, `uid`, `changeset`, `timestamp` and contact tags (phone, email, website) are never read into outputs. The named-features inventory in the kit contains such tags in its raw form; it is not used.

## 8. Scope manifest

`scope-manifest.json` follows `monitoring/scope.template.json` field for field (`frozen: true`, revision `uppal-tarnaka-r1`, `scope_extent: achieved_package_uppal_tarnaka_blue_only`, `requested_corridor_ids: [red, blue, green]`). Requested and achieved scope are separate sections (`requested_scope`, `achieved_scope`). Roads: 816 with ids, `length_metres`, `corridor_ids: [blue]`, `source_refs`, `routable` (extra field), `implemented: false`, `geometry_verified: false`; the 161 non-routable boundary roads count as implemented-as-drivable-boundary-roads work but are not field verified. Frontage: both sides of every road split into at most 100 m intervals `fi_<roadId>_<L|R>_<k>` (2,176 intervals, 123,745.74 m = 2 x road length), all `uninspected` with `inventory_complete: false`. `businesses` is empty because the inventory is unknown, not because there are none. Red, Green and the rest of Blue have `null` road inventories and null denominators (never 0 or 100 percent). Note for the ledger: `monitoring/verify_run.py` derives `roads_total_metres`, `frontage_total_metres`, `displayed_names_total`, `required_route_cases` and `required_review_views` from this file (package-only values 61,872.87; 123,745.74; 142; 86; 15; `qa/status.json` has been updated to them), so `qa/status.json` `coverage` must be set to those derived values; they describe the package, not the requested network.

## 9. How to run

```
cd game
npm run import:map                                   # regenerate everything
npm run validate:world                               # schema, ids, foreign keys, graph, hashes, scope files
node scripts/validate-world.mjs --check-determinism  # also rebuilds twice and compares hashes
```

The validator also checks: no pillar within 0.5 m (+1.0 m radius) of any carriageway, the carriageway-versus-footprint intrusion count against the `intrudesCarriageway` flags, and that stop polygons sit against the kerb and intersect no footprint or pillar.

```
```

---

# Frozen v2 importer history: Red, Blue and Green network

Everything above documents the v1 package `public/world/hyd-uppal-tarnaka/v1/` (Blue Line, Uppal to Tarnaka) and stays as history. This part documents the v2 package `public/world/hyd-metro/v2/` (`worldId` `hyd-metro`, version `2.0.0`). The shared project files (`sources-manifest.json`, `name-registry.json`, `scope-manifest.json`, `scope.geojson`, `qa/coverage.geojson`, `data/scope-baseline.json`, `public/world/world-manifest.json`) now describe v2; the v1 baseline is preserved as `data/scope-baseline-uppal-tarnaka-r1.json`. Running `npm run import:map` (v1) would overwrite the shared files with v1 content; use `npm run import:world` for v2. These sections preserve original importer rules and archived report totals. Current frozen chunks contain 19,507 original front records; older inventory/report totals of 19,508 below are historical and are not current rendered-front counts. The active overlay table at the top of this document takes precedence.

Nothing in v2 is field verified. Roads, widths, directions, turn restrictions, building heights, shop listings, skywalk dimensions and station positions are source claims or authored provisional values (see `CONTENT_GAPS.md`, part v2).

## v2.1 Sources and licences

| Source | Content | Licence in the data | Used for |
|---|---|---|---|
| Overture Maps release `2026-09-23.1`, theme `transportation` (segment, connector) | 54,883 road/footway segments, 47,226 connectors in the fetched area (after de-duplication across lines) | **ODbL-1.0**. Source entries of the frozen rows: OpenStreetMap 59,547, TomTom Orbis Maps 2,306 (their records also say ODbL-1.0); counts per dataset and licence are frozen in `data/raw/overture/2026-09-23.1/source-licences.json` | roads, directions, turn restrictions, bridges/tunnels, footways (skywalks) |
| Overture `buildings` (building) | 212,652 footprints in the fetched area, 80,076 kept | **Per record, not CDLA**: OpenStreetMap (ODbL-1.0), Microsoft ML Buildings (licence value `ODbL-1.0`), Google Open Buildings (the Overture source entry carries NO licence value). Source entries of all 212,652 footprints: OSM 140,080, Google 64,878, Microsoft 7,694. Kept footprints: OSM 54,672, Google 22,728, Microsoft 2,676 | building footprints and heights |
| Overture `places` (place) | 58,463 named listings | **CDLA-Permissive-2.0** for Overture, Meta (`meta`), Microsoft, DAC, PinMeTo entries; **Apache-2.0** for Foursquare entries; **CC0-1.0** for AllThePlaces entries | storefronts and deliveries |
| Overture `base` (land_use, water) | 1,580 land-use and 102 water polygons | **ODbL-1.0** (OpenStreetMap) | historical importer did not read them; the current source-landscape layer uses the supported polygons |
| Bundled OSM kit snapshot `metro-network-full.json` | Hyderabad Metro relation 8826295: route masters Red 8297698, Blue 13986696, Green 8297697, 10 relations, 91 ways, 2,450 nodes | ODbL-1.0 | metro alignments, 57 stations, pillars |

The lead's planning assumption that places, buildings and base are all CDLA-Permissive-2.0 is **not what this release carries**: buildings and base are ODbL (OpenStreetMap-derived) and one building source has no licence value at all. Only the Places theme (and its listing sources) is permissive.

Attribution text for the credits / map screens:

> Road network, turn restrictions, building footprints and metro alignments: (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright), distributed through the Overture Maps Foundation (release 2026-09-23.1, https://overturemaps.org); some road segments from TomTom Orbis Maps and some footprints from Microsoft ML Buildings and Google Open Buildings as recorded in the Overture source entries. Business listings: (c) Overture Maps Foundation, CDLA-Permissive-2.0, contributed by Meta, Microsoft, Foursquare (Apache-2.0), AllThePlaces (CC0-1.0), DAC and PinMeTo. Shop names are listings, not verified signs.

Obligations (ODbL section 2 above applies unchanged): the combined package merges ODbL data with permissive listings. If it is distributed publicly, the ODbL-derived database (roads, buildings, metro, and any extraction of them) must be offered under ODbL-1.0 with the attribution above; the places keep their own licences. The legal classification of the game as a whole is still open (acceptance G10). The Google Open Buildings licence value is absent from the Overture records; confirm the publisher licence before release.

## v2.2 Reproduction, freezing and size rule

```
cd game
python3 -m venv .venv-data && .venv-data/bin/pip install -r scripts/overture/requirements.txt   # pyarrow 26.0.0, shapely 2.2.0, numpy 2.5.4
npm run fetch:overture        # network needed: anonymous S3 (honours HTTPS_PROXY); normally NOT needed, the frozen snapshot is committed
npm run import:world          # preprocess.py (parquet -> data/interim NDJSON, gitignored) then import-world-v2.mjs --project-files
npm run validate:world:v2     # add  -- --check-determinism  for two fresh imports compared by hash
```

- `scripts/overture/fetch.py` reads `overturemaps-us-west-2/release/2026-09-23.1/theme=<theme>/type=<type>/` with pyarrow (bbox struct pushdown, then an exact filter of each row's bbox against the line alignment buffered by 600 m, plus a 2 km disc around each end station so end-of-line road networks close their loops). `stac.overturemaps.org` is blocked here, so the `overturemaps` CLI is not used. Places columns for contact data (phones, emails, websites, socials) are not fetched.
- Output: `data/raw/overture/2026-09-23.1/<theme>-<type>-<line>.parquet` (18 files) and `fetch-manifest.json` (bbox, buffer, terminus discs, row counts, bytes, sha256, UTC time per file). Total 39.5 MB, below the 80 MB rule, so the raw snapshot is committed (not ignored). `source-licences.json` (written by `preprocess.py`) records dataset|licence counts of the frozen rows.
- Rows overlapping between line corridors are de-duplicated by GERS id; every output is sorted by id so imports are deterministic. `data/interim/` and `.venv-data/` are gitignored.
- `generatedAt` is the latest fetch time in `fetch-manifest.json` (never the wall clock). Two fresh imports produce byte-identical output (see `validate:world:v2 -- --check-determinism`).

## v2.3 Selection (rule of EXPANSION_PLAN 1.2, as implemented)

1. Candidates: every drivable Overture segment piece (v2.4) inside the fetched area (alignment buffer 600 m or terminus disc 2 km).
2. Near set: **main classes** (motorway, trunk, primary, secondary, tertiary and their `_link`) within **300 m** of any line alignment, and **every drivable class** within **150 m**. Distance = minimum distance of the piece geometry (sampled every 10 m) to the alignment ways of all route relations of the three lines.
3. Connectivity: directed edges follow the v1 turn rule (no U-turn onto the reverse of the same road, except at dead ends or when the arriving edge is the only one at the node) minus the `prohibited_transitions` bans. The near set is joined into **one strongly connected core** by shortest forward and backward detours through the strongly connected part of the whole fetched network (`lib/select2.mjs`); components of 800 m or more are always joined, smaller ones only when the detour is at most max(1,200 m, 4 x their length). Roads that became part of the core only for connectivity are the "beyond criteria" roads. Lines are linked at the interchanges (Ameerpet, MG Bus Station, Parade Grounds) through real roads only.
4. Near-set roads that cannot join the core (one-way carriageways running out of the fetched area, etc.) are kept as **boundary roads** (`routable: false`) if they are weakly connected to the core (also via link roads within 450 m); they get real geometry, direction and `next[]` but are never used for deliveries or routes. 22 near edges are not weakly connected and are dropped.
5. Result (this import): 10,276 road edges, **630.7 km routable** (571.4 km inside the criteria + 59.3 km kept only for connectivity) and **23.5 km boundary** (23.4 km inside the criteria + 0.1 km links). Per line (nearest alignment): Red 280.6 km routable + 12.0 km boundary, Blue 255.0 + 9.6, Green 95.1 + 1.9. 6.2 km of near-set roads is not selected.

## v2.4 Overture field interpretation

| Field | Interpretation in the importer |
|---|---|
| segment `subtype` | only `road` is read. `rail` segments (metro tracks) are ignored: metro alignments come from the OSM kit snapshot |
| `class` | drivable: `motorway, trunk, primary, secondary, tertiary, unclassified, residential, living_street, service` become `RoadEdge.highway`. `footway, pedestrian, steps, path, cycleway` are only used for structures. `track` and `unknown` are excluded (`unknown` is 2,319 pieces, almost all TomTom Orbis, no name) |
| `subclass`, `subclass_rules` | `link` (or `road_flags` `is_link`) turns `motorway..tertiary` into `<class>_link`. `parking_aisle`, `driveway`, `alley` are excluded. `sidewalk`/`crosswalk` exist only on footways (ignored) |
| `connectors[{connector_id, at}]` | graph nodes. A segment is split at both ends and at every mid connector used by two or more drivable segments; the cut is the vertex that coincides with the connector point (snapped to its exact coordinate when within 2.5 m), so adjoining segments share identical node coordinates. Node id `n_<first 9 hex chars of the connector id as a decimal number>` (longer prefix is used automatically if the data would collide); road id `r_<same for the segment>_<piece index>` |
| `access_restrictions` | evaluated per piece at its mid fraction (`between`). `denied` with no `when`, or only a car-ish mode (`car, motor_vehicle, vehicle`), closes the piece. `denied` with `heading: backward` makes the piece one-way along the geometry; `heading: forward` makes it one-way against it (the geometry is stored reversed so `:f` is always the legal direction); both headings denied closes it. `allowed` with `when.recognized` (`as_private`, `as_permitted`) and a car-ish or unspecified mode is a private/permit-only road and is excluded (as v1 excluded `access=private`), unless an `allowed` rule with `using: at_destination`/`to_deliver`/`as_customer` exists. Rules with `during` (time), `vehicle` (dimensions) or `using` conditions are ignored (counted); non-car modes are ignored. Untagged direction = two-way (unknown) |
| `prohibited_transitions` | `sequence[0] = {connector_id c, segment_id T}` with `when.heading` H on the owning segment S: leaving S at connector `c` (travelling forward or backward along S, H or both) may not enter T; the banned pair is (S's directed edge that ends at c, T's directed edge that starts at c; `final_heading` picks T's direction). The pair is removed from `next[]` and the strong-connectivity analysis already respects it. Rules whose `sequence` has two or more steps cannot be expressed on directed edges and are counted, not enforced. All pairs are listed in `core.turnRestrictions` (`[fromDirectedId, toDirectedId]`) so validators can recompute `next[]` |
| `road_flags` | `is_bridge` gives `bridge: true`, `is_tunnel` gives `tunnel: true` (tunnel wins over bridge), `is_link` see `subclass`. `is_under_construction` and `is_abandoned` pieces are excluded. `is_covered` is ignored |
| `level_rules` | the value is the OSM `layer` and becomes `RoadEdge.level`; bridge elevation uses 6.5 m x max(1, level) (as v1) |
| `width_rules` | metres, used as `widthM` when present (4 selected roads), and such roads are not clamped. Otherwise class defaults of v1 (`primary/trunk/motorway` 10.5 m one-way or 12 m two-way, secondary 9, tertiary 7.5, residential/unclassified 6, service/living_street 4.5, `_link` 5.5) clamped at grade to keep 0.6 m from building footprints and 1.0 m from a parallel metro alignment (floor 4.5 m, 3.0 m for service/living_street), exactly as v1 |
| `names.primary`, `names.common['te']` | `RoadEdge.name` and the Telugu alias in the name registry; no Telugu name exists in this snapshot (0 of the 58,463 places, no road) |
| `sources` | first source gives `provenance.sourceIds` (`ovt:seg/<12 hex>` and, for OpenStreetMap records, `osm:<record id>`); `provenance.source` is `derived` |
| not used | `speed_limits`, `road_surface`, `routes`, `destinations`, `names.rules`, `subclass_rules` other than link/parking/driveway |

Places: `names.primary` verbatim (whitespace-normalised) is `Storefront.name`; `names.common['te']` would be `nameTe`; `confidence` is the listing confidence; `operating_status` `permanently_closed` is excluded (the field is empty for all but 32 rows); `sources` are the dataset names plus `Overture`; `basic_category` + `taxonomy.hierarchy` feed the category mapping (v2.9). Buildings: `height`, `num_floors`, `class`/`subtype`, `names.primary`, `is_underground` (skipped) and the first source's record id (an OSM `w123@4` becomes `osmId` `way/123`; other sources become `ovt:msml:<12 hex>` or `ovt:gob:<12 hex>`).

## v2.5 Graph, elevation, widths

- `RoadEdge`, `DirectedEdge`, `Junction`, `GraphNode` keep the v1 structure. Differences: `provenance.source` is `derived`, `status` lists only the keys that apply (all values `provisional`), and `provenance.note` is present only for explicit `width_rules` or a width clamp. Junctions are nodes of degree 3 or more; `signalled` is false in the frozen core (Overture carries no signal nodes); the current sourced transport overlay enables 100 graph junctions with provisional timing. `core.pois` is empty. `core.turnRestrictions` is new.
- Elevation reuses `lib/elevation.mjs`: bridges 6.5 m per level, 120 m approach ramps or own-edge ramps, node continuity. v2 additions: tunnels (-5 m) ramp like mirrored bridges (`rampTunnels`), and a repair pass (`repairNodeElevations`) ramps at-grade edges at nodes where Overture joins a bridge/tunnel and at-grade roads (5 nodes, 7 edges). Result: 73 bridge edges, 18 tunnel edges, 0 node-elevation violations.
- At-grade edges are simplified with Douglas-Peucker at 0.3 m (31,223 to 28,523 points); ramped, bridge and tunnel edges keep every point.
- `RoadEdge.footpath` (new, optional): true only for edges that are at grade for their whole length (`pointElevM` all 0), not bridge, not tunnel, and not `motorway`, `motorway_link` or `trunk_link`. It marks where pedestrians may spawn (10,031 of 10,276 edges).

## v2.6 Buildings

- Overture footprints whose centroid (or, for large footprints, any vertex) is within 120 m of a selected road: 80,076 of 212,662. Polygons with holes keep them; winding is CCW from above as v1.
- Heights: `height` (28), else `num_floors x 3.2 + 0.6` (231), else a provisional floor count from a hash of the id by footprint area (under 150 m2: 2 to 4; 150 to 600 m2: 3 to 5; above 600 m2: 4 to 8) x 3.2 + 0.6 (79,817). `heightStatus` is `provisional` for all.
- 29 `transportation` footprints that are elevated metro stations sitting on the alignment (for example "Ameerpet Metro Interchange") are not emitted; the station model replaces them. The current frozen archive contains 5,502 flagged outlines. The older report count is superseded by the composed recovery counts at the top of this document; 13 bodies remain omitted after manual/recovery layers.
- Chunks: 200 m grid by centroid, `c_<ix>_<iz>`, 1,646 chunk files (median 17.0 KB, p90 45 KB, max 87 KB raw). Each chunk also carries the `storefronts` of its buildings.

## v2.7 Historical storefront attachment rules and inventory

- Scope: every Overture place within 40 m of a selected routable or boundary road (27,994 places) is in `qa/storefront-inventory.json`; 19,508 are rendered as `Storefront` (status `provisional`, inventory status `provisional_listing`).
- Excluded, always with reasons: `low_confidence` (below 0.35, 7,321), `frontage_capacity` (843), `facade_not_facing_a_road` (181), `no_at_grade_road_within_40m` (172, only an elevated road within 40 m), `kiosk_inside_building` (4). No record is `permanently_closed` in this snapshot. Statuses reserved for later passes: `verified_imagery`, `verified_field`, `missing`.
- Attachment: a place goes to the nearest building exterior edge (any ring edge within 40 m, 8 m bonus when the point is inside the building) that **faces a road**: the edge is at least 3 m long, its outward normal is within 60 degrees of the direction from the edge to the nearest at-grade road foot point, and the edge is within 25 m of that road (a road is "at grade" when its surface at the foot point is at most 2.5 m). The facade is the part of that edge nearest the listing (6 m, clipped to the edge). When several shops share one edge and floor they are ordered along the road and given equal cells of the edge (at most 8 m each). Floor 0 holds retail, food and services; `office_service`, `hospital_clinic` and `education` go to floor 1 when two or more ground-floor shops already occupy the edge. Capacity per floor is floor(edge length / 3.2 m); overflow goes to the other floor, else is excluded as `frontage_capacity`. `roadId` and `side` are recomputed at the final facade mid point (the road it faces, side relative to that road's forward direction).
- `facingHeading` is the heading of the building edge's outward normal (forward = (-sin h, 0, -cos h)); the validator checks it independently (a point 0.3 m in front of the facade is outside the building).
- No facing building: a **kiosk** frontage, a straight 6 m segment parallel to the road tangent at the listing's foot point, at the kerb + 3 m on the listing's side, normal pointing at the road, `buildingId: null`, `floor: 0` (241 storefronts). A kiosk inside a building footprint is excluded.
- 19,267 storefronts sit on buildings. Rendered by group: office_service 4,837, other 3,394, education 2,001, hospital_clinic 1,519, restaurant 1,383, hotel_lodging 1,060, apparel 933, bank_atm 819, electronics_mobile 690, auto_service 679, cafe_bakery 560, worship 404, hardware 364, jewellery 319, grocery 283, pharmacy 263. Per line (nearest alignment): Red 9,348, Blue 7,738, Green 2,422; per station area (500 m): see `qa/storefront-inventory.json` summary.

## v2.8 Structures (skywalks and foot-over-bridges)

- Footway-like segments (`footway, pedestrian, path, cycleway`) flagged `is_bridge` (or `level` >= 1) within 300 m of an alignment: 56 pieces (15 more lie farther away), 42 connected components. A component is a `skywalk` when it is at least 250 m long in total and within 400 m of a station (or its only name contains "skywalk"), else a `footbridge`. One `Structure` is emitted per Overture segment (a branching skywalk is several structures that share end points).
- `elevM` 6.0 m at every path point (provisional), width 3.0 m (skywalk) or 2.4 m (footbridge), supports about every 15 m including both ends (positions inside an at-grade carriageway slide up to 6 m, else are dropped: 40 shifted, 33 dropped), stairs at free ends (heading = direction away from the deck; taken from an attached `steps` segment when there is one).
- Found: **"Uppal Skywalk" exists in the data** as a connected component of 10 pieces, 745 m of path in total (its longest piece is a 395 m named segment), 31 m from the Uppal station position. 41 other components are plain foot-over-bridges (8 to 157 m, two named "Foot Over Bridge"). See `qa/skywalks.json`. Road flyovers (Tarnaka, Khairatabad, Salarjung, ...) are roads, not structures.

## v2.9 Category mapping (Overture Places to `StoreGroup`)

Tokens are `basic_category` plus every level of `taxonomy.hierarchy`; the first rule that matches any token wins (rules in this order); no category means `other`.

| StoreGroup | Overture tokens |
|---|---|
| pharmacy | `pharmacy`, `pharmacy_and_drug_store`, `drugstore`, `medical_supply_store` |
| bank_atm | `bank_or_credit_union`, `bank`, `credit_union`, `atm` |
| hotel_lodging | `lodging`, `hotel`, `resort`, `hostel`, `lodge`, `inn`, `service_apartment`, `bed_and_breakfast`, `private_lodging`, `cabin`, `campground` |
| cafe_bakery | `cafe`, `coffee_shop`, `tea_room`, `bakery`, `dessert_shop`, `ice_cream_shop`, `smoothie_juice_bar`, `non_alcoholic_beverage_venue`, `juice_bar`, `donut_shop`, `bubble_tea_shop`, `sweet_shop` |
| restaurant | `restaurant`, `casual_eatery`, `fast_food_restaurant`, `bar`, `pub`, `lounge`, `brewery`, `alcoholic_beverage_venue`, `food_truck_stand`, `caterer`, `food_service`, `food_delivery_service`, `food_and_drink`, `dance_club`, `nightlife_venue`, any token ending `restaurant` or `eatery` |
| grocery | `grocery_store`, `organic_grocery_store`, `supermarket`, `convenience_store`, `food_and_beverage_store`, `produce_store`, `butcher_shop`, `specialty_foods_store`, `health_food_store`, `candy_store`, `farmers_market`, `market`, `warehouse_club_store`, `superstore`, `discount_store`, `liquor_store`, `wine_shop` |
| hospital_clinic | `health_care`, `hospital`, `specialty_hospital`, `outpatient_care_facility`, `doctors_office`, `dental_clinic`, `diagnostics_imaging_or_lab_service`, `medical_service`, `specialized_health_care`, `specialized_medical_facility`, `emergency_or_urgent_care_facility`, `primary_care_or_general_clinic`, `complementary_and_alternative_medicine`, `vision_or_eye_care_clinic`, `pediatric_clinic`, `behavioral_or_mental_health_clinic`, `medical_service_organization`, `home_health_care`, `senior_living_facility` |
| jewellery | `jewelry_store`, `jewelry_and_watches_manufacturer`, `watch_store`, `jewelry_and_watches_store` |
| electronics_mobile | `electronics_store`, `mobile_phone_store`, `computer_store`, `appliance_store`, `audio_visual_equipment_store`, `camera_and_photography_store`, `electronic_equipment_supplier`, `it_service_and_computer_repair`, `telecommunications_service`, `appliance_repair_service` |
| apparel | `fashion_and_apparel_store`, `clothing_store`, `shoe_store`, `womens_clothing_store`, `mens_clothing_store`, `childrens_clothing_store`, `fashion_boutique`, `fashion_accessories_store`, `fabric_store`, `textile_manufacturer`, `luggage_store` |
| auto_service | `automotive_service`, `auto_dealer`, `vehicle_dealer`, `vehicle_parts_store`, `auto_parts_store`, `automotive_repair`, `gas_station`, `fueling_station`, `vehicle_service`, `motorcycle_dealer`, `motorcycle_service`, `motorcycle_repair`, `car_rental_service`, `vehicle_rental_service`, `auto_detailing`, `car_wash`, `bike_store`, `taxi_or_ride_share_service` |
| hardware | `hardware_home_and_garden_store`, `hardware_store`, `building_supply_store`, `home_improvement_store`, `tile_store`, `kitchen_and_bath_store`, `lighting_store`, `furniture_store`, `mattress_store`, `home_goods_store` |
| education | `education`, `place_of_learning`, `educational_service`, `specialty_school`, `school`, `college_university`, `preschool`, `high_school`, `elementary_school`, `middle_school`, `tutoring_service`, `computer_coaching`, `vocational_and_technical_school`, `language_school`, `driving_school`, `library`, `educational_facility`, `research_institute`, `art_school`, `test_preparation`, `child_care_and_day_care` |
| worship | `place_of_worship`, `religious_organization`, any token ending `place_of_worship` |
| office_service | `services_and_business`, `community_and_government`, `government_office`, `professional_service`, `real_estate_service`, `corporate_or_business_office`, `financial_service`, `event_or_party_service`, `travel_service`, `home_service`, `technical_service`, `media_service`, `printing_service`, `design_service`, `legal_service`, `b2b_service`, `manufacturer`, any token starting `b2b_` |
| other | everything else (beauty and wellness, gyms, entertainment, parks, historic sites, shopping malls, `specialty_store`, uncategorised) |

## v2.10 Metro, stations, pillars, deliveries, boundary

- `metroLines`: all three lines, `local` = every route chain in local metres (both direction tracks), `geo` = lat/lon. `stations`: 57 (Red 27, Blue 23, Green 10; Ameerpet, MG Bus Station and Parade Grounds merged by name and distance), all `inCorridor: true`, never delivery entrances.
- Pillars: every 30 m along the primary route of each line (Miyapur to LB Nagar, Nagole to Raidurg, JBS to MG Bus Station); a pillar (1.0 m radius) must keep 0.5 m from every selected carriageway as in v1. v2 first slides a blocked pillar along the alignment (3, 6, 9, 12 m either way; 213 moved) before dropping it: 2,153 generated, 895 dropped, 1,258 kept (Red 563, Blue 508, Green 187).
- Deliveries: 342, six per station area (all 57 areas reach six): real named listings with confidence at least 0.6, a Latin-letter name, a destination group (not office or worship), on a routable at-grade road that is not trunk/motorway, at least 26 m long and at least 10 m from its ends, within 35 m of it, within 500 m of the nearest station; stop polygon at the kerb of the listing's side (v1 geometry, 14 m x 4.5 m), not intersecting a building or within 1 m of a pillar; picks are at least 70 m apart and favour different groups. `poiId` is the **storefront id** (`core.pois` is empty). Per line (nearest alignment): Red 154, Blue 132, Green 56.
- Boundary: polygon = union of the selected roads buffered by 60 m, closed by 150 m, simplified at 5 m (`scripts/overture/boundary.py`, shapely), CCW from above, 1,663 vertices; `warningMarginM` 60; `exits` (583) = dead-end nodes touching an unselected drivable edge or the fetched area's edge.

## v2.11 Coordinates, precision, payload

- `WORLD_ORIGIN` is unchanged. The v2 extent is x -19.5 km to +1.9 km and z -9.8 km to +8.2 km (largest coordinate 19.5 km, more than the +-12 km assumed in the brief). Local coordinates are rounded to 0.01 m; the largest float32 round-trip error of any stored coordinate is 0.00094 m (floats between 16,384 and 32,768 are spaced 0.00195 m). The equirectangular projection differs from the WGS84 geodesic (Vincenty) by at most **0.048 percent** of distance (9.9 m on a 25 km pair; 0.019 percent when measured from the origin), i.e. about 5 m per 10 km, larger than the 0.0245 percent documented for the +-5 km v1 box. Rendering code should keep float64 world positions and subtract a chunk origin before building float32 vertex data.
- Sizes: `core.json` 12.1 MiB raw (2.1 MiB gzip), 1,646 chunks 32.7 MiB raw (7.0 MiB gzip), `manifest.json` 0.4 MiB; total about 46 MiB raw and 9.1 MiB gzip. The 6 MB core target is not reachable with the v1 core structure (ids, per-edge status/provenance, `directed`, `junctions`, `nodes[].edges` for 10,276 roads); see CONTENT_GAPS W14.

The revision 43 matched-view check still finds architectural gaps: Godavari's red arched ground frontage and curved upper frame are not reproduced by its current glazing template. Enclave balcony recesses, ornament, forecourt and stairs remain approximate. Correct provisional labels do not establish exact facade reconstruction.

### Revision 46 first-pass source addition

Seventeen dated views (6 April 2026, 11 November 2025) support 525.74 m of LEFT-only partial observation windows and 20 pending observations on nine connected Raidurg–HITEC City roads. No runtime fronts/profiles, suppressions, RIGHT inventory or physical changes are added. Uncertain 131 m/168 m framing is retained without precise attribution. Combined first-pass ledgers cover 772.22 m and 40 views across revisions 45–46; their 25 second-pass issue groups are not shops. Durgam–Madhapur progress remains separately frozen and overlapping, not an additive total.

Revision 47 adds 444.68 m of LEFT-only partial quickpass observation windows on five connected roads, twelve new November 2025 views and eleven pending observations. Two reused 46 endpoint references are not counted again. No fronts/profiles, suppressions, physical changes, RIGHT review or visual completeness is added. Combined first-pass totals are 1,216.90 m / 52 views / 30 issue groups; Raidurg-only is 970.42 m. Detailed shelter, wall/foliage, TRIDENT entrance and public-access work remains pending. The separate Durgam–Madhapur progress files remain unchanged.
