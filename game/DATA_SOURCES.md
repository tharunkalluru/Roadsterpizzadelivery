# DATA_SOURCES: provenance, conventions and transformation history

Scope of this document: the generated world package `public/world/hyd-uppal-tarnaka/v1/` (Blue Line, Uppal to Tarnaka) and the files derived from it (`scope-manifest.json`, `scope.geojson`, `qa/coverage.geojson`, `name-registry.json`, `sources-manifest.json`). Every number below comes from `npm run import:map` (see `data/import-report.json`, which is regenerated and deterministic).

Nothing in this package is field verified. All geometry, names, widths, directions, heights and levels are OpenStreetMap source claims or authored provisional values, and are labelled `provisional` per property. See `CONTENT_GAPS.md` for the concrete gaps.

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
