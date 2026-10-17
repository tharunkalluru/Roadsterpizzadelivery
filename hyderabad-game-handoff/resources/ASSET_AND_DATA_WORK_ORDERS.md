# Asset and geographic work orders for the implementation agent

Prepared 17 October 2026. Read this alongside RESOURCE_GUIDE.md, STARTER_ASSETS.md when supplied, and the master specification.

The kit supplies actual raw geographic inputs and a complete build contract. Additional acquisition, local reconstruction, code, and evidence are part of the receiving agent's job. None of the unperformed work below may be silently counted as verified.

## 1. Inputs already available

| Input | Location | What it establishes |
|---|---|---|
| Recursive three-corridor metro source | `osm/metro-network-full.json` | Imported relation members, source tags, and coordinates from the recorded snapshot. |
| Four starter-corridor street extracts | `osm/corridor-01-uppal-stadium.osm` through `osm/corridor-04-habsiguda-tarnaka.osm` | Raw roads, buildings, points, and related records within four acquisition areas. |
| Frozen source manifest | `osm/resource-acquisition-manifest.json` | Actual retrieval inputs, byte counts, and hashes. |
| Source coverage and quality report | `osm/corridor-evidence-summary.json` | Calculated counts and documented gaps. |
| Named-feature inventory | `osm/corridor-named-features.json` | Raw mapped names with source identity; these are not all shops or all current names. |
| Source queries and helpers | `../queries/` and `../scripts/` | Reproducible bounded retrieval and local inventory tools. |
| Starter material/font assets, if acquired | `STARTER_ASSETS.md` and linked manifests | The exact supplied generic files and their provenance. Use the manifest to distinguish supplied from unavailable items. |

The all-three-line metro source does not imply that all-three-line street data, artwork, imagery, or verified entrances are supplied. The four street boxes are an acquisition baseline, not the final playable road selection.

## 2. Geographic production work

| Work order | Concrete action | Required output and completion evidence |
|---|---|---|
| GEO-01: Operating network | Recheck dated official operating corridors and station naming. Reconcile operator groupings with imported stop positions. | Versioned station registry with source dates, aliases and reviewed coordinates. |
| GEO-02: Broader road source | Acquire an appropriate regional OSM PBF or another permitted full-tag source for the selected network. Cache once and clip with relation handling. | Dated raw source, hash, license/attribution, source extent and completeness report. |
| GEO-03: Freeze road selection | Select actual connected carriageways, complete junctions, useful deviations and delivery spurs near all three corridors. Preserve scale. | Frozen scope geometry, stable IDs, physical lengths and street-side review intervals. |
| GEO-04: Topology and levels | Resolve incomplete relevant relations and validate directions, turn restrictions, medians, ramps and ground/elevated connections. | Directed graph plus source/inspection evidence and executable route cases. |
| GEO-05: Widths and clearances | Inventory missing road widths, lane arrangements, support positions, structure heights and critical wire clearance. Acquire sufficient evidence. | Property-level measurements or documented estimates, methods, dates and uncertainty. |
| GEO-06: Imagery coverage | Locate permitted current-enough street images, inspect pixels and viewing directions, and identify occlusion gaps on both sides. | An actual coverage index and specific capture tasks for missing views. |
| GEO-07: Frontages and names | Inventory every visible frontage in the selected completion scope. Reconcile business identity, spelling, script, side, facing and entrance. | Name registry, frontage layout, reference links and unresolved-item list. |
| GEO-08: Destination access | Attach each mission point to an actual usable roadside entrance and supported stopping region. | Access record with surface/level/approach identity, ground arrival case and runtime evidence. |
| GEO-09: Shared world model | Generate visible roads, driving graph, collision, clearance, destination and minimap from the same coordinates. | Reproducible build, coordinate checks, geographic overlay, and matched source/game views. |
| GEO-10: Review and version | Inspect the authentic slice, extend the first corridor, then the remaining selected packages. | Dated local/independent reviews, world package hashes and current coverage denominators. |

A useful capture request specifies source or scope ID, coordinates, street side, view direction, missing property, acceptable evidence, priority and affected gameplay. Avoid vague requests such as "send more Hyderabad photos." Do not ask the user to collect information already available through an authorized source the agent can inspect.

## 3. Production asset inventory

The numbers below identify asset families, not a promise that one mesh can represent every unique location. Use variants and LODs where appropriate. Determine exact counts from the frozen world and performance evidence.

| Asset family | Required production treatment | Source or creation direction |
|---|---|---|
| Player sports car | Recognizable requested Roadster-inspired silhouette; body, wheels and effects separated; consistent physical scale, pivot and collision; mobile LODs. | Verify the user's intended official visual reference, then create an original suitable mesh or acquire a licensed one. Record any fidelity gap. |
| Autos, bikes, cars and buses | Locally appropriate recognizable forms, wheel/suspension animation, color variants, consistent bounding geometry, simplified distant forms. | Produce or acquire licensed assets and inspect their actual suitability. |
| Pedestrians and riders | Readable human silhouettes, walking/waiting/crossing behavior and economical animation. | Original or licensed rigs/animations. Handle clothing and body variation respectfully. |
| Metro viaduct and stations | Repeat ordinary compatible components; individually reconstruct distinctive station profiles and real supports, openings and levels. | Evidence-based local modeling with modular materials and separate collision proxies. |
| Road and junction surfaces | Real curves and widths, junction polygons, curbs, medians, markings and relevant physical irregularities. | Generate from reviewed world data; use suitable generic surface textures with correct physical tiling. |
| Shop and restaurant fronts | Verified order, frontage width, awnings, shutters, names and entrances; unique landmarks individually treated. | Reconstruct from inspected permitted references. Keep sign text editable and script-correct. |
| Other building exteriors | Footprints, heights where verified, roofs, visible sides and flight-facing detail. | Data-driven massing refined with sufficient references; retain provisional states for inferred properties. |
| Wires, poles and barriers | Correct location and clearance for verified features; clear gameplay visibility and matching collision. | Reviewed permanent geometry or separately labeled scenario placements. |
| Local street props | Fruit crates, stalls, parked bikes, signposts and other relevant details placed deliberately. | Modular original/licensed props; base real locations on evidence. |
| Materials | Asphalt, concrete, plaster, metal, glass and paint that respond consistently to lighting. | Supplied starter materials where appropriate, Poly Haven, ambientCG, or original authored materials. |
| Fonts and sign textures | Correct glyph coverage and shaping, readable full strings, correct direction and resolution. | Supplied licensed font if present; otherwise choose and bundle an appropriate licensed font from an actual source. |
| Vehicle, traffic and UI audio | Separate effects/music/UI controls, bounded spatial ambience, useful flight and danger feedback. | Original or appropriately licensed recordings/synthesis. Avoid film tracks and copied dialogue. |
| UI and icons | Clear phone controls, readable resource meters, map guidance and accessibility states. | Original code/vector assets or an identified compatible licensed set. |

For each final asset record its author/source, source URL or original creation method, retrieval/creation date, exact license file, original byte hash, derivative settings, in-game units and axes, LOD/material/texture details, collision strategy, and runtime package membership. Never copy the license of a generic texture onto a branded vehicle or unrelated photograph.

Generic roughness or normal detail changes material appearance. A pothole that must affect the car also needs the corresponding world geometry and physics behavior. Inspect this relationship in play.

## 4. Resource discovery entry points

- Full-tag regional data: https://download.geofabrik.de/asia/india/southern-zone.html
- Offline clipping: https://docs.osmcode.org/osmium/latest/osmium-extract.html
- Mapillary: https://www.mapillary.com/developer
- KartaView: https://kartaview.org/landing/open-imagery
- Panoramax: https://docs.panoramax.fr/federated-catalog/
- Poly Haven: https://polyhaven.com/ and https://polyhaven.com/license
- ambientCG: https://ambientcg.com/ and https://docs.ambientcg.com/license/
- Blender: https://www.blender.org/ and https://docs.blender.org/manual/en/latest/
- Noto: https://fonts.google.com/noto
- Model optimization: https://gltf-transform.dev/
- Three.js model/texture loaders: https://threejs.org/docs/pages/GLTFLoader.html and https://threejs.org/docs/pages/KTX2Loader.html

RESOURCE_GUIDE.md records the specific source limitations already found. Check actual asset pages, image coverage, service conditions and formats. A directory URL is a discovery entry point, not a downloaded asset or guaranteed Hyderabad coverage.

## 5. Work that depends on external evidence

The agent can proceed with code, import tools, inventory, suitable asset creation, local browser play and automated checks while waiting for a specific capture or device. Provisional geometry may support labeled development work. Its status must remain visible in the project reports.

The final geographic and mobile claims still require the corresponding actual evidence. If the environment lacks a physical phone or a required street view/measurement, record the blocked acceptance ID, geographic feature, exact missing evidence, and reproducible next action. Keep the full requested scope unchanged unless the user explicitly changes it.

## 6. Handoff the receiving agent must return

Return the runnable source and lockfile, source/import scripts, prepared world packages, manifests, licenses, settings and controls, reproducible build/test commands, real browser captures, actual phone evidence, coverage reports, and remaining capture or asset tasks. Distinguish authentic playable areas from provisional or unavailable ones. A correct data import, generic material pack, or passing helper suite is one stage of the work.
