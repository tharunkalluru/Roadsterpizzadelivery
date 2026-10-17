# Resource guide: Hyderabad Metro Delivery

Handoff version 3.0. Prepared 17 October 2026. This kit supplies real acquired geographic inputs, six starter material textures, a Telugu font with its license, and implementation/monitoring resources. It does not contain a completed game, a fully surveyed street scene, or every required production art asset.

The user-selected graphics target is [Whiteout](https://whiteout.plgb.chatgpt.site/). Read [GRAPHICS_REFERENCE_WHITEOUT.md](../GRAPHICS_REFERENCE_WHITEOUT.md) before choosing the final visual treatment. Earlier "near-realistic" wording is provisional when it conflicts with that reference. Only the opening screen was observed in the preparation environment; gameplay inspection remains required before claiming a visual match.

## 1. What is actually included

The resources/osm directory contains:

- A recursively acquired Hyderabad Metro network JSON snapshot with 2,450 nodes, 91 ways, and 10 relations, including directional rail routes for the three lines.
- Four overlapping OSM XML street extracts covering the Uppal, Stadium, NGRI, Habsiguda, and Tarnaka corridor areas.
- A smaller Uppal extract for a convenient initial import experiment.
- The raw parent network and route-master responses.
- A deduplicated named-feature inventory and a source-quality report.
- A manifest containing request URLs, retrieval times, original file hashes, counts, and limitations.

The four street extracts together contain 37,990 unique nodes, 8,336 ways, and 56 relations. Their acquired XML files total 10,852,026 bytes before ZIP compression. These are discovery extents around the corridor. Select the actual playable road network from them using the metro-adjacent scope rules.

The source data is OSM data under ODbL. Preserve © OpenStreetMap contributors attribution and applicable ODbL conditions. The raw snapshots preserve their original bytes so their acquisition hashes can be checked. Do not copy unnecessary contributor metadata into the runtime game or display registry.

Process raw source files with code. Do not paste megabytes of XML/JSON into the coding agent's context. Use the inventory script, targeted source-ID lookups, and small inspection summaries.

The art starter pack also contains three 1024 × 1024 maps for Aerial Asphalt 01, three 1024 × 1024 maps for Concrete Wall 006, and the original Noto Sans Telugu variable font with `OFL.txt` and upstream metadata. These files have verified source hashes. Both diffuse images were visually inspected, and the font binary was parsed. They have not been integrated into or tested in the game.

Read [STARTER_ASSETS.md](STARTER_ASSETS.md) for the exact files, authors, license conditions, texture semantics, and inspection limits. The [material manifest](materials/asset-manifest.json) and [font manifest](fonts/asset-manifest.json) record original URLs, retrieval times, and local paths. Generic surfaces and a font do not reproduce Hyderabad geometry, local storefronts, or sign spelling. [ASSET_AND_DATA_WORK_ORDERS.md](ASSET_AND_DATA_WORK_ORDERS.md) specifies the remaining acquisition and production work.

## 2. Geographic acquisition details

Bounding-box order below is west, south, east, north. Overpass QL uses a different south, west, north, east order.

| File | Acquisition bbox, west/south/east/north |
|---|---|
| corridor-01-uppal-stadium.osm | 78.551, 17.398, 78.564, 17.410 |
| corridor-02-stadium-ngri.osm | 78.542, 17.405, 78.557, 17.417 |
| corridor-03-ngri-habsiguda.osm | 78.537, 17.412, 78.550, 17.423 |
| corridor-04-habsiguda-tarnaka.osm | 78.522, 17.418, 78.544, 17.431 |
| uppal-starter-osm-map.osm | 78.556, 17.398, 78.563, 17.405 |

The requests were separately acquired over seconds on 17 October 2026. They are not one transactionally atomic global OSM snapshot. The union audit found no conflicting element versions in these four extracts. Later refreshes must check for changes rather than silently mix new and old worlds.

All referenced way nodes were present in the four-file union. Twenty-five parent relations had missing members, including relations extending outside the request boxes. One incomplete multipolygon and any other gameplay-relevant missing relation members require further acquisition or resolution. Not every incomplete administrative or regional route relation must become game content; classify relevance explicitly.

No turn-restriction relations were present in the acquired union. That means restrictions are unresolved by this import, not that every turn is allowed.

## 3. Exact metro identifiers and starter anchors

| Entity | OSM relation ID |
|---|---|
| Hyderabad Metro network | 8826295 |
| Red Line route master | 8297698 |
| Green Line route master | 8297697 |
| Blue Line route master | 13986696 |

The complete recursive query is included as queries/metro-network.overpassql. Its execution succeeded in this preparation run.

The following positions are imported rail stop positions used for orientation. They are not car delivery entrances, road centres, or independently surveyed coordinates.

| Stop label | Latitude | Longitude |
|---|---:|---:|
| Uppal | 17.4000621 | 78.5602104 |
| Stadium | 17.4073799 | 78.5542281 |
| NGRI | 17.4148047 | 78.5463149 |
| Habsiguda | 17.4201642 | 78.5405282 |
| Tarnaka | 17.4282733 | 78.5284257 |

The imported Green Line uses separate stop-position records for JBS and Parade Grounds (Green Line), while the operator's corridor table lists JBS Parade Ground within a nine-station corridor. Reconcile canonical station entities before computing station counts. Do not multiply official stations by track direction, stop positions, or platforms.

The Blue route-level name:te tag in one source record contains only నాగోల్. It cannot be copied as a verified Telugu name for the entire line. Keep original tags and reviewed display names separately.

## 4. What the source-quality audit found

Counts describe imported features in the acquisition boxes, not the final selected game scope and not unique physical streets or businesses.

| Field | Observed source count |
|---|---:|
| Highway-tagged ways, including paths/steps/footways | 1,347 |
| Highway ways with name | 165 |
| Highway ways with width | 7 |
| Highway ways with lanes | 26 |
| Highway ways with oneway | 134 |
| Highway ways with surface | 55 |
| Building-tagged features | 6,767 |
| Building features with height | 2 |
| Building features with building:levels | 26 |
| POI-tagged features in the report's amenity/shop/office/tourism categories | 269 |
| Those POI features with name | 218 |
| All named features | 632 |
| Named features with name:te | 34 |

An absent tag does not prove that the real-world feature lacks a name, lane restriction, or height. Some source names also need review, including abc, near uppal, Strret No 2, and raod no 6. Preserve source strings, flag suspect names, and obtain evidence for any display correction. Do not silently autocorrect a real proper name.

Useful source records for further inspection include Habsiguda Main Road way 29475191, Inner Ring Road ways 27953017/27953020, Uppal Skywalk ways 1350815290/1350815296, and Tarnaka Flyover ways 316767714/316767715. These source labels do not establish final lane geometry, physical height, current restrictions, or safe flight clearance.

The source-quality report and inventory are included to stop the builder from confusing a successful import with complete real-world knowledge.

## 5. Acquisition and processing resources

| Need | Resource and use | Access/limitations |
|---|---|---|
| Broad OSM source | https://download.geofabrik.de/asia/india/southern-zone.html | A full-tag Southern Zone PBF is available; page reported about 532 MB when checked. Not bundled. |
| Direct regional PBF | https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf | Download once, cache, hash, and record its data timestamp. Do not fetch repeatedly during gameplay. |
| Regional extent | https://download.geofabrik.de/asia/india/southern-zone.poly | Confirm geographic coverage before clipping. |
| India fallback | https://download.geofabrik.de/asia/india.html | Larger source if the required boundary is not covered by the selected regional extract. |
| Offline OSM processing | https://osmcode.org/osmium-tool/ | Preserve relations and tags; complete-ways extraction alone does not prove every relation is complete. |
| Extraction strategy details | https://docs.osmcode.org/osmium/latest/osmium-extract.html | Read relation-completeness behavior before choosing the strategy. |
| OSM to GeoJSON conversion | https://github.com/tyrasd/osmtogeojson | A conversion building block; canonical routing and restrictions still need preserved source semantics. |
| Public geographic queries | https://overpass-api.de/api/interpreter | Small, bounded, cached research/import jobs; endpoint can reject or time out. |
| Query language | https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL | Read bbox order, recursive relation acquisition, and output semantics. |
| Small OSM map calls | https://wiki.openstreetmap.org/wiki/API_v0.6 | The supplied small bbox XML acquisitions worked. The editing API is not the runtime backend or the bulk whole-city ingestion strategy. |
| OSM rights | https://www.openstreetmap.org/copyright | ODbL and attribution. |
| Layer semantics | https://wiki.openstreetmap.org/wiki/Key:layer | Relative stacking, not physical metres. |
| Geographic projection | https://proj.org/en/stable/operations/projections/utm.html | Convert geographic source coordinates to local metres with a documented validated transform. |

A suitable regional projection candidate for Hyderabad is WGS84 / UTM zone 44N, with a local runtime origin subtracted from projected coordinates. Validate the definition and axes in the chosen library. Store original longitude/latitude and source IDs. Elevation remains a separate evidence problem.

Example offline approach after obtaining the PBF and installing a compatible Osmium tool:

    osmium extract -b 78.515,17.395,78.568,17.434 --strategy complete_ways southern-zone-latest.osm.pbf -o uppal-tarnaka.osm.pbf
    osmium fileinfo -e uppal-tarnaka.osm.pbf

The example is a broad discovery crop, not the final road selection. Commands are documented examples and were not executed against the large PBF in this preparation run. Verify current command support, relation completeness, output integrity, and exact target boundaries. Keep full tags in a canonical source store before deriving lighter runtime assets.

Use scripts/fetch_sources.py to verify the bundled cached acquisition files. A deliberate refresh can issue the same permitted GET or POST request and create a separate dated output, so it cannot silently overwrite the frozen original. Read the script's help. The corridor Overpass query is included but was not successfully completed during preparation; the provided XML sources are the successful fallback.

## 6. Official local references

| Source | Purpose |
|---|---|
| https://ltmetro.com/metro-network-map/ | Official network orientation. A passenger schematic is not metric road geometry. |
| https://www.ltmetro.in/about-us/project-highlights/stations | Corridor and station tables. Its heading has stale totals; reconcile against current dated official network evidence. |
| https://hmrl.co.in/wp-content/uploads/2026/02/1.-Bid-Notice-for-Personal-Rapid-Transit-System-PRTS-Date-24.02.2026-1.pdf | Dated official 69 km, 57-station network baseline. |
| https://hmrl.co.in/wp-content/uploads/2025/05/HMRL-New-Fare-Chart-2025.pdf | Station-sequence cross-check. |
| https://hmrl.co.in/wp-content/uploads/2025/05/2025-03-03-Skywalks-from-Metro-stations-to-commercial-and-residential-complexes.pdf | Skywalk context; does not establish exact flight clearance. |
| https://ltmetro.com/stations/stadium/ | Stadium station-area reference. |
| https://www.ngri.res.in/cms/contact-us.php | NGRI location reference. |
| https://iict.res.in/TTFC/ | IICT location context. |
| https://www.tesla.com/en_GB/roadster | Current Roadster visual/product reference, not this game's fuel specification or a supplied licensed model. |

Do not bulk-copy official website artwork into the game without appropriate rights. These links are references, not blanket asset licenses.

## 7. Street imagery and the remaining capture work

| Provider | Starting resource | What the builder still must do |
|---|---|---|
| Mapillary | https://www.mapillary.com/ and https://www.mapillary.com/developer | Use authorized access, query relevant bounds, inspect actual pixels, dates and viewing direction, and create a frontage-coverage index. |
| Mapillary license | https://help.mapillary.com/hc/en-us/articles/115001770409-CC-BY-SA-license-for-open-data | Preserve applicable image/API/derivative terms and attribution. |
| KartaView | https://kartaview.org/landing/open-imagery and https://kartaview.org/terms | Establish actual local coverage and permitted downloads; no route-wide coverage has been verified here. |
| Panoramax | https://docs.panoramax.fr/ and https://docs.panoramax.fr/federated-catalog/ | Query available instances/federation; inspect each used image's license and coverage. |
| Google terms reference | https://cloud.google.com/maps-platform/terms | Do not extract/trace/scrape Google content into an independent game database in violation of its conditions. |

No complete street-photo set or visually reviewed facade survey is bundled. API keys are not included. Photos remain reference or licensed texture inputs; they are not collision-ready roads or reliable height measurements.

Create stable street-side audit intervals, initially around 25–50 metres where useful, covering both sides of every selected playable street. These intervals measure inventory coverage; individual images need sufficient overlap and actual visibility rather than a guaranteed fixed spacing.

For each interval, record what is visible, occlusions, date, view direction, all frontages, name uncertainties, entrances, and missing structure measurements. Mark partial or uninspected intervals. Capture tasks should specify exact location, direction, requested feature, and required evidence. Do not force a single photo to establish both sides of an occluded street.

## 8. Visual reference, supplied assets, and production art

Follow the user's [Whiteout graphics reference](../GRAPHICS_REFERENCE_WHITEOUT.md), then establish an achievable presentation for the actual Hyderabad scenes. Inspect its gameplay in a working graphics environment before deciding which observed material, lighting, vehicle, camera, and interface qualities should transfer. The link supplies a reference, not permission to copy its code, artwork, or audio. A menu inspection does not establish gameplay appearance or phone performance.

| Need | Resource | Use/constraint |
|---|---|---|
| PBR textures, HDRIs, reusable models | https://polyhaven.com/ and https://polyhaven.com/license | Assets are published under CC0; hosted API access has separate conditions. Choose mobile-appropriate resolutions. |
| Supplied road material | https://polyhaven.com/a/aerial_asphalt_01 | Three original 1K maps are bundled in `materials/aerial_asphalt_01/`: diffuse JPEG, OpenGL normal PNG, and packed ARM JPEG. Generic CC0 surface, not a Hyderabad road capture. |
| Supplied concrete material | https://polyhaven.com/a/concrete_wall_006 | Three original 1K maps are bundled in `materials/concrete_wall_006/`: diffuse JPEG, OpenGL normal PNG, and packed ARM PNG. Generic CC0 surface, not a surveyed metro material. |
| Poly Haven API conditions | https://polyhaven.com/our-api and https://github.com/Poly-Haven/Public-API/blob/master/ToS.md | Check current access and attribution rules if using the live service. |
| Surface materials and assets | https://ambientcg.com/ and https://docs.ambientcg.com/license/ | CC0 asset files; select asphalt, concrete, plaster, metal and similar materials after checking actual asset pages. |
| ambientCG API | https://docs.ambientcg.com/api/ | Discover actual download variants; do not invent asset IDs or links. |
| Asset editing | https://www.blender.org/ and https://docs.blender.org/manual/en/latest/ | Model/retopologize local assets, set realistic scale, produce LODs and collision proxies, bake economical detail. |
| Supplied Telugu font | https://github.com/google/fonts/tree/main/ofl/notosanstelugu | Original Noto Sans Telugu variable font, version 2.005, with OFL license and metadata in `fonts/noto-sans-telugu/`. The font parses; browser shaping and actual reviewed sign strings still need testing. |
| Additional script/font selection | https://fonts.google.com/noto | Acquire licensed coverage for any other scripts or font styles required by inspected signs. The supplied Telugu font does not establish support for every script or reproduce individual sign designs. |
| Font readiness | https://developer.mozilla.org/en-US/docs/Web/API/Document/fonts | Explicitly load the required fonts before baking complete shaped text runs into sign textures. |
| glTF processing | https://gltf-transform.dev/ | Reproducible inspection, compression, texture resizing, deduplication and optimization. |
| glTF runtime loading | https://threejs.org/docs/pages/GLTFLoader.html | Match loader and decoder versions; clean up image/geometry/material resources. |
| Texture compression | https://threejs.org/docs/pages/KTX2Loader.html | Detect actual device support and bundle the required transcoder when used. |

Use [STARTER_ASSETS.md](STARTER_ASSETS.md) when binding the maps. Diffuse maps need color treatment; normal and packed ARM maps carry non-color data. The asphalt ARM is the provider's original lossy JPEG, chosen for pack size, so review artifacts before final production. All source images remain unchanged. Create and measure compressed runtime derivatives separately. The original six textures and font are inputs, not finished game materials or validated signage.

No production car, auto, bus, pedestrian, custom station, shop facade, or licensed city-audio pack is supplied as finished artwork. Create or obtain these with a source/rights manifest using the [asset work orders](ASSET_AND_DATA_WORK_ORDERS.md). Do not substitute an older Roadster mesh for the requested revealed design without making that deviation explicit.

Preserve credible dimensions, geographic relationships, readable signs, and detailed nearby silhouettes. Use inspected Whiteout gameplay to resolve presentation choices instead of assuming an unobserved lighting or rendering style. Modular construction can preserve real placement. Do not repeat a distinctive real shop at invented locations or count unfinished block geometry as the final scene.

## 9. Engine, testing, and monitoring resources

| Need | Official resource |
|---|---|
| Three.js installation and reference | https://threejs.org/manual/ and https://threejs.org/docs/ |
| Current WebGL renderer | https://threejs.org/docs/pages/WebGLRenderer.html |
| Repeated geometry | https://threejs.org/docs/pages/InstancedMesh.html |
| Responsive rendering | https://threejs.org/manual/pages/responsive.html |
| Physics bodies | https://rapier.rs/docs/user_guides/javascript/rigid_bodies/ |
| Replay/determinism | https://rapier.rs/docs/user_guides/javascript/determinism/ |
| Build tooling | https://vite.dev/guide/ |
| Browser interaction tests | https://playwright.dev/docs/intro |
| Device emulation | https://playwright.dev/docs/emulation |
| Background lifecycle | https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API |

Pin actual compatible versions after checking the runtime. Use the existing repository's package manager. Browser emulation helps validate layout and interactions but is a separate evidence class from a physical phone.

The included scripts are preparation and evidence tools. They are not the game's implementation or its complete gameplay test suite. Their successful execution does not certify that the game is complete.

## 10. Resource readiness before the production claim

Acquired: metro geometry, first-corridor raw street data, source IDs/tags, named-feature inventory, reproducible acquisition details, six original 1K material textures, and the original Noto Sans Telugu variable font with OFL license and metadata. Material/font manifests record source hashes and limited file inspection. Full provider license-page HTML is not bundled; licensing-review metadata retains URLs, retrieval times and hashes, and explicitly distinguishes the external-only captures.

Still required: frozen playable road selection; current turn/lane/access review; complete relation handling; physical heights and critical clearances; real frontage inventory and name reconciliation; inspected street imagery; source-backed detailed art; final car and local vehicle assets; scene integration and optimization of the starter materials; actual sign shaping/readability tests; Whiteout gameplay inspection and supported visual comparison; working game implementation; physical-phone and local-recognition evidence.

Use [ASSET_AND_DATA_WORK_ORDERS.md](ASSET_AND_DATA_WORK_ORDERS.md) to turn these gaps into concrete outputs and [GRAPHICS_REFERENCE_WHITEOUT.md](../GRAPHICS_REFERENCE_WHITEOUT.md) for the user's visual acceptance target. The run may automate substantial portions of these tasks. Any requirement without sufficient input remains an explicit gap until the input is obtained. The release monitor must keep that gap visible.

