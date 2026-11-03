# Metro architecture candidate

Status: implemented candidate, pending Root's native gameplay captures and an independent visual review. This report does not approve its own appearance or claim a surveyed replica of every station.

## Source evidence

Retrieved 2026-11-02. Only primary operator/government evidence informed architectural claims.

- [L&T station planning](https://www.ltmetro.in/about-us/project-highlights/station-planning): open-sided overlapping roofs, central median spine-and-wing structure, distinct passenger zones, stairs/escalators/lifts and accessible paths.
- [L&T station design press note, 2 September 2014](https://ltmetro.com/wp-content/uploads/2025/01/stationsdepotdetails02september2014-1.pdf): pages1–3 were downloaded and rendered for actual visual inspection. Page1 depicts covered flights with intermediate landings and side-median/footpath entrances. Page2 depicts the open concourse/fare-gate route and a typical6m side platform. Page3 explains central-median cantilever support and open station buildings. The PDF is a design reference, not current surveyed plans for all57stations.
- [Madhapur operator facilities](https://ltmetro.com/stations/madhapur/): two external lifts, two external escalators and two internal escalators; arm/direction descriptions. These do not supply precise entrance coordinates.
- [Rasoolpura operator facilities](https://ltmetro.com/stations/rasoolpura/): two external lifts and escalators, and two internal lifts/escalators; arm/direction descriptions.
- [Assembly operator facilities](https://ltmetro.com/stations/assembly/): one external lift, rather than assuming two at every station.
- [Ameerpet operator facilities](https://ltmetro.com/stations/ameerpet/): shared interchange with four external lifts/escalators, four internal lifts and twelve internal escalators. [L&T interchange release](https://ltmetro.com/wp-content/uploads/2025/01/press-release-13th-november-2017-1.pdf) documents the multi-level interchange and published Red platform reference height already retained by the game.
- [HMRL MGBS interchange release](https://hmrl.co.in/wp-content/uploads/2025/06/2020-02-06-MGBS-Interchange-Station-Write-up.pdf): integrated lower Red/upper Green corridors, shared passenger circulation,75ft Green platform reference, entry/exit and lift/escalator facilities. The existing sourced height is retained.

## Implemented

1. Replaced filled concourse boxes with a real floor slab, open passenger volume, parapets, narrow frames, fare-gate arrays and actual openings for access routes. Each lower window face is separately checked against roads and train envelopes; a flyover can no longer inherit an unchecked decorative pane across its lanes.
2. Replaced filled stair buildings/painted entrance doors with actual open two-flight steps, intermediate rest landings, side rails, covered flights and a connected upper landing into the concourse. Escalator lanes have separate metal steps, side panels and rubber handrails. Low quality retains the same actual stair silhouette; only fine tread-edge frequency is reduced.
3. Added internal concourse-to-platform flights, landing bridges and lift connections. Platform access goes through actual geometry gaps. The outer wing contains a real stairwell opening, not an uncut slab over the stairs. Its inner edge has a physical guard except at the upper landing.
4. Retained the existing continuous3.4m inner driving/handoff strip, then added the outward2.6m architectural wing to make a typical6m platform. Existing train doors, crowds, parked handoff positions and lamp rows remain valid. The outer railing and open frame moved outward; inward station signs sit at the outer edge rather than in the enlarged walkway. Existing benches remain aligned with seated NPCs.
5. Removed the extra rows of kerb-side station portal columns. Checked cantilever ribs now express the spine-and-wing form; the retained source metro pier row remains responsible for ground supports. No newly invented central pier is forced into a driveable road.
6. Added closed lift shafts with distinct ground/concourse/platform landing doors and physical landing links. Assembly uses the operator's one-external-lift exception; Ameerpet has four external positions. Exact rendered counts can be reduced by actual road/building clearance, rather than putting a shaft in traffic.
7. Ameerpet and MGBS use a checked shared transfer bank connecting the two actual modeled concourse levels. A valid shared connection suppresses duplicate secondary street stairs/lifts. Both actual packed owner tiles retain this connection after runtime road-grade preparation and corrected-building occupancy checks. JBS/Parade keeps its separate mapped station anchors.
8. Updated static flight clearance for access/lift roof caps outside the main canopy and shared interchange connectors. It remains distinct from tyre support and is indexed/precomputed, not rebuilt per frame. It covers all permitted lateral arm positions conservatively. No normal driving speed, jump, clock, camera or boarding gate was changed.
9. Preserved the bounded opaque bilingual station atlas and naming counts: two primary exterior end boards and one inward name per platform. No extra station-name signs were added at stair entrances; those have only a train pictogram.

## Accuracy boundaries

- The retained source supplies57station identities and59corridor assemblies, their mapped centres, paths and existing interchange anchors. It does **not** supply surveyed entrance coordinates. Street-arm setbacks, intermediate landing geometry, transfer-bank positions, detailed door placement and unmeasured dimensions remain explicitly clearance-fitted game interpretations.
- The model preserves existing130m platform lengths, canopy heights and previously documented game height adjustments. It does not claim to reproduce the full142m interchange buildings, all technical rooms, every emergency entrance, or the precise full equipment inventory.
- The generic arm layout is not a claim that every real station has an identical arrangement. Unsafe candidate arms are omitted, not pushed into a road, railway or visible building. A road/train-network check of all59standalone plans retains212of236candidate street arms and116lifts before shared-interchange suppression and local building exclusions. Every standalone assembly has a viable street-or-lift route and a platform route in that check. Actual tile building/road checks can change the local selection.
- AABB-only ground occupancy previously rejected the high MGBS transfer route. The replacement checks corrected visible polygon pieces and their heights; low roofs can be crossed only above their actual top. This is geometric non-intersection, not proof of a real public skywalk at that exact coordinate.
- Existing approved boards retain their visual style. Their inward face moved from7.15m to9.65m offset because the outer platform edge is now9.9m. Native train-window legibility must still be checked.

## Verification

- `node scripts/test-v21-fixes.mjs metro-access`:9groups passed. Covers all59assemblies, continuous step/rest/landing topology, road/train clearances, actual stairwell openings and full6m supported platform outside openings, shared interchange topology, actual graded packed Ameerpet/MGBS buildings, exact polygon/height occupancy, and1,354,692generated access vertices contained by the static flight envelope.
- `node scripts/test-v21-fixes.mjs world-presentation`:10groups passed, including actual curved-platform open camera sightlines, bounded opaque presentation, road/train filtering and actual Rasoolpura/Ameerpet access sections. The obsolete packed test that painted entrance art onto every old solid stair housing was replaced with actual access-envelope checks; the legacy pure decoration tests remain for API compatibility.
- `node scripts/test-v21-fixes.mjs station-board-presentation`:9groups passed. Count, orientation, aspect, both-quality text fitting, bounded atlas, update stability and disposal remain covered.
- `node scripts/test-v21-fixes.mjs metro-platform`:7groups passed. Existing handoff footprint/crowd/bench/curved-pad constraints and actual lamp-hanger clearance remain covered.
- `node scripts/test-v21-fixes.mjs main-expansion-road`:11groups passed after integration, including high-Green flight at30/60/90/120Hz/hitches and5,769actual Rasoolpura ribbon samples.
- The new browser harness was explicitly typechecked. The final whole-checkout `npm run typecheck` and `git diff --check` pass. A transient concurrent `human-body.ts` cast error was reported to Root and was resolved before this handoff. Root owns the full final integrated release check.
- Static access-only geometry is bounded below48,000vertices per standalone station in the full-network Low fixture. It shares existing tile batches/materials; no new lights, transparent transmission, per-frame station mesh generation or draw-per-step meshes are used. This is a resource bound, not a mobile FPS claim.

## Independent review handoff

`/tests/browser/metro-access.html` loads the actual packed tile, production Engine/materials and sign system. Query options: `station=st_madhapur`, `st_rasoolpura`, `st_ameerpet:red`, `st_mahatma_gandhi_bus_station:green`, `st_parade_grounds:green`; `q=low` or `q=high`. Buttons provide Overview, Street, Stair foot, Concourse, Platform and Day/night. Drag/wheel allow inspection. The stair-foot camera is only an approximate default-arm view; a clearance-shifted entrance may require orbiting.

Root must capture and a separate reviewer must assess: actually open street entry, the two flights/rest landing, connected concourse/platform route, lift-door connections, enlarged outer wing/stairwell guards, source-appropriate silhouette, both platform sign sightlines, Ameerpet/MGBS transfer connection and night contrast. Then replay actual Green flight/manual metro landing and Rasoolpura driving in the integrated game. No visual approval or real-phone performance acceptance is asserted here.
