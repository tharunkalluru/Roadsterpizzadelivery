# Graphics and map fidelity contract

Prepared 17 October 2026. Read with `MASTER_PROMPT.md`, [the Whiteout reference observations](GRAPHICS_REFERENCE_WHITEOUT.md), `config/project-contract.json`, `config/flight-budget.json`, and `monitoring/FORMAT.md`.

This supplement turns the user's required Whiteout visual benchmark and real Hyderabad map into production requirements. Earlier “near-realistic” wording is provisional descriptive shorthand, not an authority that overrides the user's chosen example. It preserves the master scope, shared flight rules, 82 acceptance IDs, and C0–C7 gates. Numbers identified as targets remain unmeasured design settings. This kit contains source data and instructions; it contains no completed game or validated phone benchmark.

## 1. Whiteout is the required visual reference

The user selected [Whiteout](https://whiteout.plgb.chatgpt.site/) as the graphics level to match. Its inspected visual qualities take precedence over conflicting assumed stylistic defaults. Preserve the Hyderabad geography, delivery premise, mobile requirements, and shared flight contract while matching the reference's demonstrated presentation quality.

### What has actually been observed

The preparation browser displayed the opening page: a large condensed uppercase white WHITEOUT title on near-black, thin dividers, muted controls, and visible loading, start, and settings elements. Its console identified `THREE.WebGLRenderer`, but graphics-context creation failed because the environment's GL renderer was disabled. Gameplay was not observed.

These observations establish opening-screen hierarchy and a renderer-initialization attempt. They establish no gameplay lighting, car realism, material quality, camera motion, effects, frame rate, or phone performance. Keep the detailed record in `GRAPHICS_REFERENCE_WHITEOUT.md`. Tag every reference note `observed`, `inferred`, or `proposed`; an inference never becomes a measured reference property through repetition.

### Required implementation procedure

1. Open the live reference in a working GPU-capable browser, enter gameplay, and inspect its actual presentation. Record date, browser, viewport, actions, and observed limitations. Compare mobile views when available.
2. Produce an observation sheet and explicit visual rubric covering geometry detail, materials, lighting, contrast, shadows, camera composition, animation, effects, interface hierarchy, and readability. Identify unobserved dimensions separately.
3. Capture internal comparisons through permitted tooling. Compare the running Hyderabad benchmark against the inspected reference at useful matching viewpoints and screen sizes. Derive concrete parity criteria and repair the observed differences. A matching title screen alone does not establish gameplay parity.
4. Translate demonstrated presentation quality into original Hyderabad assets. Do not copy Whiteout's branding, source, meshes, textures, soundtrack, story, or collapsing-city premise into this delivery game. Bundle the reference URL and authored observations; do not redistribute reference screenshots or assets as part of the handoff without a separate applicable authorization.
5. If the reference cannot run, keep its gameplay comparison blocked while continuing independent implementation. Do not invent its appearance or quietly replace the target with generic “near-realistic” art. A working build can remain an intermediate result with this explicit unmet comparison.

Measure this game's performance independently. Whiteout's presence online, renderer identification, or behavior on one machine cannot prove the Hyderabad build's speed on another device.

### Apply the reference to Hyderabad

Create a convincing, readable mobile driving scene whose proportions, road relationships, architecture, and frontage identify the selected Hyderabad location. Recognition should survive a neutral lighting setting: a warm color grade cannot compensate for incorrect streets or generic buildings.

| Element | Required treatment |
|---|---|
| Player car | A carefully modeled silhouette, plausible wheel size, paint, glass, visible suspension response, restrained reflections, and a consistent collision envelope. Obtain or create the required licensed asset. |
| Roads | Actual bends and junctions, reviewed cross-sections, medians, curbs, surface variation, drainage features where supported, and consistent material scale. |
| Metro | Correct alignment and level, recognizable station and deck forms, appropriately placed supports, entrances, stairs, and skywalks where included. |
| Frontage | Correct side, order, facing, entrance, sign identity, awnings, shutters, and distinguishing architectural features. |
| Traffic | Recognizable autos, bikes, buses and cars, coherent scale and motion, with detail concentrated near the player. |
| Lighting | Calibrate composition, contrast, and presentation against inspected Whiteout gameplay while keeping Hyderabad road and hazard visibility clear. Readable dry daytime remains a development starting point pending that inspection. |
| Local detail | Deliberately placed poles, wires, parking, fruit crates, repairs, and roadside activity supported by evidence or recorded as scenario overlays. |

Metallic/roughness materials are a proposed implementation starting point; calibrate the final response to inspected reference qualities. Validate color management, normals, physical texture tiling, and exposure. Three.js provides this material model in [MeshStandardMaterial: official documentation](https://threejs.org/docs/pages/MeshStandardMaterial.html). Selective baked detail, modular assets, and simplified distant geometry are compatible with the target. Flat untextured blocks and repeated fictional storefront signs remain development fixtures.

Keep generated concept images labeled as art references. Only captures of the running build can demonstrate the implemented presentation. A still image cannot establish smooth controls, sustained rendering, correct navigation, or collision.

## 2. Separate the fidelity questions

Maintain independently reviewable dimensions of quality:

| Dimension | Required evidence |
|---|---|
| Source alignment | Source IDs, transformation definition, overlays, and coordinate comparisons. |
| Road connectivity | Directed carriageways, actual junction movements, medians, restrictions, and usable deviations. |
| Physical dimensions | Supported widths, elevations, slopes, overhead envelopes, and building or structure heights. |
| Local identity | Reviewed names, frontage order, entrance association, landmark appearance, and evidence date. |
| Visual presentation | Actual build captures compared with inspected Whiteout qualities, including materials, silhouettes, lighting, readable signage, and detail. |
| Playability | Runtime driving, flight, collision, delivery access, streaming, and measured device behavior. |

Agreement with imported OSM geometry establishes source agreement at the stated tolerance. It does not establish independent survey accuracy. Do not claim centimetre precision, current business completeness, or perfect real-world reconstruction without corresponding evidence.

Use the master's property states: `verified`, `provisional`, `missing`, and `scenario_overlay`. A building may have a source-supported footprint, provisional height, and missing storefront imagery. Record what the verification establishes, the reference date, method, reviewer, and uncertainty. An attractive material does not upgrade a provisional height to verified.

## 3. What the supplied data actually establishes

The included metro snapshot covers route geometry for the three-line network. Street extracts cover acquisition areas along the starter Uppal-to-Tarnaka corridor. They are not whole-network street reconstruction.

The four street extracts' union contains the following records, as documented in [the resource guide](resources/RESOURCE_GUIDE.md) and [source-quality report](resources/osm/corridor-evidence-summary.json):

| Source inventory | Count |
|---|---:|
| Unique ways | 8,336 |
| Highway-tagged ways, including non-car paths | 1,347 |
| Highway ways carrying width tags | 7 |
| Building-tagged features | 6,767 |
| Building features carrying height tags | 2 |
| Named features across categories | 632 |
| Parent relations with missing members | 25 |

The union has complete way-node references, but gameplay-relevant incomplete relations still require resolution. No imported turn-restriction relation means restrictions remain unresolved by this import. It does not permit every turn. Suspect source strings include `abc`, `near uppal`, and apparent spelling errors. Preserve original strings and justify reviewed display values.

Re-run `scripts/inventory_osm.py` when inputs change. Preserve the acquired files and hashes; create a reviewable source refresh. Feature counts describe acquisition extents, not frozen playable inventory or verified shop totals.

## 4. Build all representations from one geographic model

### Coordinates and scale

Preserve source longitude/latitude and stable source IDs. Convert with a documented geographic library to metres, then subtract a local origin for runtime coordinates. WGS84 / UTM zone 44N is a suitable Hyderabad candidate to validate; see [PROJ: Universal Transverse Mercator](https://proj.org/en/stable/operations/projections/utm.html).

Use the master's consistent X-east, Y-up, Z-south convention. Record projection, units, axis mapping, origin, and elevation datum or provisional vertical convention. Validate round trips and known source positions. Do not feed degrees into physics, interchange latitude and longitude, or independently scale separate chunks. Rebasing must preserve object identities, replay meaning, and map positions.

### Road surfaces and connections

Preserve junction locations and topology before smoothing geometry. Do not replace a curved road with a straight connection between stations. Derive reviewed road surfaces and directed navigation from the same source records, including width transitions, median openings, permitted turns, service roads, and entrances. Account for left-side driving in the lane model.

Two crossing polylines do not establish a junction. A metro interchange does not establish a drivable connection. Treat ground roads, flyovers, and metro structures as separate surfaces and volumes. The [OpenStreetMap layer documentation](https://wiki.openstreetmap.org/wiki/Key:layer) describes relative vertical ordering; a `layer` tag is not a height in metres.

### Synchronized outputs

For each normalized feature, derive the visible mesh, road or lane graph, collision and clearance shapes, minimap placement, and destination access from common versioned geometry. Share stable road, surface, level, building, and entrance IDs.

Simplified colliders may omit cosmetic bevels, but must preserve player-relevant edges, openings, support surfaces, and clearance. Never adjust only the visible bridge, sign, median, or storefront entrance. Invalidate affected evidence after edits.

A destination must bind to a receiving entrance and stopping polygon, valid road level, and permitted approach. A pin above a flyover cannot complete a delivery on the road below. Provide a development overlay showing meshes, collider outlines, lane arrows, level IDs, entrances, and landing surfaces together.

## 5. Preserve the requested geographic scope

The requested world remains selected connected roads near the operating Red, Blue, and Green corridors. Confirm the release-date network and station nomenclature using [Hyderabad Metro: official station tables](https://www.ltmetro.in/about-us/project-highlights/stations) and the dated official references in the resource guide. Reconcile station identities rather than counting directional stop positions as separate stations.

Use the 200-metre alignment buffer and justified expansion toward 500 metres as planning defaults. Include complete real junction approaches, reconnecting deviations, and delivery spurs with return access. A buffer edge must not cut a junction into an unusable fragment.

Freeze the selected road IDs, physical-length convention, frontage review intervals, required names, and entrance inventory before reporting completion percentages. Unknown denominators remain unknown. Scenery may extend beyond the playable network, with clear early guidance at unsupported connections.

The 300–500 metre authentic scene and Uppal-to-Tarnaka corridor are internal milestones. They do not replace the full selected three-corridor commitment. Keep remaining scope visible while continuing independent work. Preserve metric scale and support shorter sessions through shorter real contracts.

## 6. Reconstruct names and frontage through inspected evidence

Use permitted street imagery or original local captures. Starting points include [Mapillary developer resources](https://www.mapillary.com/developer), [KartaView open imagery](https://kartaview.org/landing/open-imagery), and [Panoramax federation documentation](https://docs.panoramax.fr/federated-catalog/). Availability must be established by actual acquisition and inspection. No complete visually reviewed street-photo set is bundled.

For both sides of each selected street, maintain stable review intervals and image coverage. Record capture date, viewing direction, visible frontage, occlusions, entrances, and unresolved names. A nearby image coordinate is insufficient if the relevant facade is hidden. A photograph alone is not a calibrated clearance measurement.

For each business, preserve source spelling, reviewed display spelling, language, neighbors, road side, facing, building association, entrance, image references, rights, and verification state. Render real text with suitable fonts and shaping. Check readability from the player's actual approach at low quality.

Create specific capture tasks for gaps. Neutral provisional facades may support development but cannot satisfy complete real-shop coverage. Keep dated construction and permanent features separate from authored temporary stalls, potholes, parked vehicles, and queues.

Inspect image and API conditions before reuse; preserve attribution and derivative obligations. OSM's [Copyright and License](https://www.openstreetmap.org/copyright) explains its data license and attribution. Track imagery, fonts, models, textures, and factual observations separately. Do not assume a publicly viewable panorama grants permission to redistribute it as a game texture.

## 7. Flight makes vertical accuracy essential

Retain the shared 25-second default, configured 20/30-second alternatives, continuous or split usage, no ground refill, and a landing reserve within the same allowance. This supplement introduces no launch-duration cap or free descent.

Clearance checks must use the whole moving car, including expected attitude and controller uncertainty. Check the swept ascent, travel, and descent envelope against beams, station structures, skywalks, supports, signs, wires, buildings, and relevant moving objects. A single upward ray from the chassis center is insufficient.

Roofs, rail tracks, sidewalks, private compounds, opposing carriageways, and unsupported areas remain ineligible landing surfaces under the master rules. Flight camera views expose roofs, backs, and deck undersides; provide coherent visible geometry and relevant collision while retaining provisional status for unverified properties. Do not create holes that allow accidental access through scenery.

Represent thin wires visibly at gameplay viewing distances. Any readability enlargement must match the collision envelope and be documented. Quality changes cannot remove collision-relevant wires or make them visually disappear.

Keep flight inside supported connected road air areas with early feedback. A changing landing forecast must remain distinguishable from a guarantee. Unknown critical clearance remains unresolved; do not silently certify an arbitrary height. Development may use tracked conservative restrictions, but those do not establish completed geographic fidelity.

Prefetch the reachable flight and landing envelope, likely turn branches, stopping space, and reversing context. At constant speed, 25 seconds is about 313 metres at 45 km/h or 417 metres at 60 km/h; these are scale illustrations, not achieved game measurements. Choose lookahead using actual controller reach, measured load latency, and safety margin.

Install critical meshes, collision, navigation, and landing surfaces consistently before entry. If they cannot load, pause safely with the mission and resource clocks frozen. A missing chunk must not become a free fall, invisible barrier, or deadline loss.

## 8. Mobile detail and performance rules

Use low, standard, and high visual presets with the same gameplay geometry, road graph, mission state, clearance, and controls. Scale resolution, distant decoration, texture detail, shadow cost, and cosmetic effects first. Never reduce active hazards merely to improve a benchmark result.

Start with the master's targets: roughly 12 MB first-playable compressed payload, 150 draw calls and 250,000 visible triangles in an ordinary low-quality view, sustained 30 fps on selected midrange devices, and 60 fps where validated. These are starting budgets that require measurement, not universal hardware limits.

Instance appropriate repeated structures and share materials. [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) supports repeated geometry/materials with differing transforms. Partition instances so distant chunks can be culled and unloaded. Preserve distinctive real landmark placement.

Use [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) for prepared glTF assets and [KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html) where compressed texture support is configured and detected. Pin compatible loaders and decoders. Account for transcoding, shader warmup, image upload, and resource ownership in loading and profiling. The [WebGLRenderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html) provides renderer statistics and capability APIs; these do not establish complete device memory usage.

Test texture readability, shimmering, transparency sorting, dark underpasses, horizon stability, camera collisions, and landing feedback on actual phone screens. Keep reduced-motion and muted-audio play usable. Dynamic quality needs hysteresis and must preserve simulation timing.

## 9. Required benchmark and proof package

Select an authentic 300–500 metre scene containing representative real geometry and a valid short delivery. Prefer a junction, recognizable metro structure, inspected frontage, ground traffic, and a useful flight opportunity. If a required hazard or deviation does not exist there, add a linked authentic secondary test segment. Never invent a permanent feature to complete the checklist.

Run the following sequence in the actual application:

1. Start a contract, steer and brake through ordinary traffic, and follow a real turn.
2. Attempt a clearly explained unavailable launch at a real supported restriction.
3. Perform continuous flight, manual landing, later relaunch, and automatic descent using one balance.
4. Cross a chunk boundary while flying, then reverse or take a supported deviation.
5. Approach the correct delivery entrance and complete the handoff.
6. Exercise a wrong-level approach, blocked landing forecast, pause/resume, and loading interruption in suitable test conditions.

Keep two comparison sets: Hyderabad source views establish geographic and frontage fidelity; Whiteout observations establish the required presentation benchmark. Capture comparable views with directions, dates, and caveats through permitted internal tooling. Include a geographic overlay, collider/navigation overlay, actual interaction recording, and source-linked gap list. A local recognition review should identify misplaced or missing features; it is separate from a dimensional survey.

On named physical Android and iPhone devices, run at least 15 minutes of representative warm play and ten traversal loops or out-and-back runs. Record OS/browser, preset, resolution, power conditions, scenario seed, p50/p95/p99 frame times, long stalls, resource counts, loaded chunks, actor counts, and available memory evidence. Compare early and late intervals for degradation. Record unavailable measurements honestly.

[Playwright device emulation](https://playwright.dev/docs/emulation) supports simulated device settings for browser checks. Keep those results separate from physical-device testing. If hardware is unavailable, prepare the procedure and leave the relevant release gate pending.

## 10. Release evidence and honest completion

Attach this work to the existing geography, flight, mobile, performance, and monitoring acceptance records. Preserve all 82 IDs; this supplement does not replace their matrix or the checker schema.

Use Q08 and C4 for the actual visual comparison, including the Whiteout rubric and Hyderabad source views. G04, G05, and G12 retain alignment, frontage, and local-recognition obligations. P02, P03, and P05 retain measured budgets, physical-phone testing, and quality-mode fairness. Q05–Q07 bind evidence to the tested artifacts; Q09 distinguishes review methods; Q12 retains any blocked reference comparison in the release decision. Do not mark visual parity passed from an unobserved reference or from a generated concept image.

Bind evidence to the actual production build, world, configuration, scope, requirement, and scenario used. Geography edits invalidate affected comparisons and route tests; rendering edits affect visual and performance evidence. Never rewrite historical runs as fresh executions.

Report source-aligned geometry, independently reviewed physical properties, inspected frontage, names, available content, and physical-device results separately. Publish requested and achieved scope together. Uninspected frontage cannot become complete because every discovered POI was modeled.

Finish with the runnable project, reproducible asset pipeline, source and rights manifest, actual benchmark package, unresolved property inventory, and current C0–C7 status. Ledger integrity helps audit these records. It does not prove that a facade exists, a height is correct, or a phone test occurred.
