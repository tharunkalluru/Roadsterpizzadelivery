# Researched railway crossings and underpasses

Base: live release 25, source `df25f073d7f4b398c5e1982e4fb17985e249829f`, retaining the Version 21 timing, camera, controls, water and shopfront work.

## Cause and correction

The prior rail model treated every source `bridge=yes` as a 6.2 m elevated railway and spread its approaches along connected tracks. The rail/road clearance pass could then lift further rail profiles. This conflated short bridges over drains or depressed roads with elevated railway flyovers. Conventional rail now retains the local running datum; real source bridge spans keep their identity and short girder/trackbed geometry. Clearance never raises railway profiles. Supported road underpasses descend below the rail instead.

Research is recorded in [the source report](../railway-research-2026-10-29.md). Official completion/route evidence is distinct from retained map positions and estimated game depths. GHMC records support the Uppuguda, Uthamnagar, Anand Bagh, HITEC City and Thukaram Gate RUBs; Rail Nilayam has separate official historical evidence. Exact retained road IDs are used rather than converting every crossing in a neighborhood. Three established road-road facilities—Ayyappa Society, Mindspace and Chintalkunta—also receive actual depressed road profiles; upper cross-streets and their existing true flyovers remain unchanged.

At genuine level crossings, visible medians, kerbs, footpaths, shrubs and lamps, together with their physical collision walls, are clipped across the complete track corridor. Paired tracks, oblique crossings, source-split roads and tile boundaries use the same clearance. Vertically separated intersections keep their road edges and do not receive false crossing gaps or gates.

Ground and park/water area fills must leave real openings over the negative road. Local retaining walls and pavement supports follow those cuts, are owned by each intersecting tile and unload with it. Ground-level buildings and poles do not acquire phantom basements; below-ground fixtures still collide using their own bottom height. Existing signed profiles are republished to the worker when a cached core is reused, including deliberate zero profiles that remove an inherited hump.

Station correction: retain both actual Ammuguda station anchors on their separate Bolarum and Sanathnagar–Moula Ali corridors. The previous 500 m same-name merge discarded one. The close Begumpet duplicate remains deduplicated. Track XY, source identities and physical platform geometry are retained.

## Verification record

Focused checks cover actual Player descent/ascent at 30/60 Hz, support beside the roadway, exterior ground retention, overlapping cuts, long cuts across tile boundaries, area-fill holes, below-ground collision extents, worker republication and unload/disposal. Rail checks independently inspect full coach envelopes rather than merely comparing crossing centerline heights. Source bridge/order checks must also ensure that fixing the railway does not break an existing road/road bridge.

Both typechecks and all 106 focused tests plus 38 portable legacy suites pass. The strict Metro platform fixture now counts Metro platform geometry, excluding the newly rideable conventional-rail bridge decks; it still requires 26 pieces per Metro assembly.

Independent source checks inspect 11,054 full coach/road envelopes with no collision, and 12,218 retained road/road crossing samples without lost existing headroom. Repeated preparation is stable. Four verified road-underpass carriageways pass 1,183 finite overlap samples, with minimum modeled surface separation 6.386 m (5.486 m below the 0.9 m road soffit), and maximum approach grade 4.85%.

Terrain preparation is performed in the existing background tile builder; only transferable buffers and collision records are installed by World. Fine height samples are coalesced in plan for subtraction, leaving road timing/camera behavior untouched. A browser review caught and corrected accidental use of the building facade material on retaining walls; these use plain concrete street-structure material.

Simulated rates and local geometry-preparation measurements are not physical-phone FPS measurements.

### Browser observations

Chrome, local production client, Low graphics, desktop landscape viewport 1040 × 518. Used the visible area/map picker and ordinary keyboard driving; no simulation stepping, developer autopilot or hidden placement was used.

- Reached Ayyappa Society through the Cyber Towers map selection. Visually checked the depressed roadway, overhead crossing, concrete retaining walls and rising exit. The first pass drifted into the right median after sustained straight throttle; the visible recovery control was used, so that attempt is not counted as an uninterrupted traverse.
- A steering-corrected repeat drove beneath the crossing and ascended the exit ramp to ground level. The route continues around a fork; this is an underpass traversal check, not a completed delivery. Saved `output/rail-research/ayyappa-underpass-clear-ramp.jpg` shows the car within the clear concrete exit ramp.
- A local diagnostic report and independent tile reconstruction locate the earlier stop at exactly the player's collision radius from the right median. No central road blockage, stray junction cap or pole was found there. A wider six-tile audit then found that the neighboring ground-level median's collider extended 1 m below its visible pavement; the descending player's body could overlap this invisible portion by about 46 mm. That extra below-pavement collision volume is removed while the real divider remains solid. The above-ground part of the nearby divider still physically constrains a camera at this edge. Separate negative-space regressions check depressed pavement floors and finite overhead road faces; they do not establish that an obstructed curb-side camera can retain a full chase view.
- Level-crossing geometry and gate selection are covered by source checks. An actual train arrival, gate cycle and manual passage through a level crossing were not completed in this browser round.

## Limits

Depths, grades and vehicle clearances are game-model estimates rather than engineering surveys. GHMC's indexed official budget text was available while direct PDF retrieval returned 403; no unsupported photographs or construction dimensions are claimed. PIB confirms Moula Ali Housing Board station's identity, but a reliable retained coordinate/platform match is still awaiting review; no station was placed at an invented coordinate. No physical-phone, thermal or battery benchmark is claimed for this correction.

## Follow-up: railway driving across an underpass and strict location evidence

The user's next screenshot exposed a railway-driving case missing from the previous checks. The bridge support plane was +0.10 m, below the retaining wall's +0.12 m lip. Actual Player driving reproduced a stop at the lip. Track approaches had visible ballast but no matching continuous physical support. The corrected trackbed and bridge deck now share +0.18 m tyre contact, matching the visible ballast top; train running heights, chase camera and timing remain unchanged. Retaining walls remain solid for cars inside the underpass.

The earlier underpass permission rule was too broad. A source rail bridge tag, a road-name substring or relative modeled height could create a depression without proving a road underpass at that location. The follow-up removes those permissions and the automatic neighboring-yard conversion. Each new railway cut now requires the exact road ID, local railway ID and bounded geographic facility region from the evidence catalog. An approach cannot silently convert an additional crossing farther along the same source way or on a connected road. Physical coplanar crossings retain train priority and gates even when their road name contains “underpass”.

Research additionally matches St Johns Road to Oliphant using official route/location records and identifies a short tunnel on the Rail Nilayam approach through the exact OpenStreetMap `tunnel=yes`, `layer=-1` way. The [research report](../railway-research-2026-10-29.md) records sources, coordinate matching and uncertainty. Unverified places stay in the review report; a model clearance conflict is not evidence for inventing an underpass.

Automated verification includes:

- Actual Player traversal in both directions at 30/60 Hz, Low/High graphics settings and a tile seam; the failing pre-fix scenarios pass after the correction.
- A track span without a source bridge tag over a verified road cut remains rideable. A car below it stays on the −6.5 m road instead of snapping to the rail deck.
- Physical contact exists at all 310 endpoints of the 155 retained source railway bridges.
- Independent examination of all 433 road/rail centerline intersections, including 78 yard/service intersections: every one of the 68 below-rail crossings has exact local catalog evidence. Four adversarial permission tests reject generic names/tags, wrong IDs, distant repeated intersections and connected-road propagation.
- The 304 retained raw tile packs contain 610,516 road records and no negative elevation profiles; no separate legacy below-ground roads bypass the core's evidenced preparation.
- Full-coach envelopes and existing road-over-road headroom still pass; repeated preparation remains stable. Gate identity and X/Z remain fixed, with explicitly reported small inherited-hump normalization checked at the running datum.

All 115 focused tests, both typechecks and all 38 legacy suites pass. The release log is `output/rail-research/v27-checks.log`; the final flyover-suite recheck is `output/rail-research/v27-flyover-recheck.log`. That older fixture assumed every support record had a road owner and crashed on the newly supported railway trackbeds. Its road selection now handles the documented nullable owner; all nine grade/render/support groups still execute and pass.

Browser checks used the visible public map picker to select the Oliphant/Chilkalguda area, drove on its underpass and exercised flight controls without console errors. A complete manual railway-span crossing and a new physical-phone session were not completed; the railway-driving claim above is an automated production-Player regression, not a manual playtest claim.

## Follow-up: railway tracks on the full map and minimap

The full map and rotating minimap now draw conventional railway tracks from the same 816 canonical track profiles used by the world. Parallel running tracks and yard/service lines retain their exact plan alignment; no transport geometry, grades or underpass locations change. Short pale dashes over a dark trackbed distinguish conventional rail from roads and the existing colored Metro lines. Yard details become subtler at wider zoom levels, with a compact Railway legend entry on the full map. Routes and Metro lines remain above the rail layer.

Full-map paths prepare in the existing bounded work slices, at most 512 native path commands between yields, and remain cached when the map closes. The minimap selects nearby cached profiles from a spatial index rather than replaying citywide railway coordinates every redraw. Tests cover exact source coordinates, long spans crossing the viewport, warm cache reuse, command budgets, canvas state restoration and the actual minimap drawing method.

Both typechecks, all 120 focused tests and all 38 legacy suites pass (`output/rail-research/v28-checks.log`). Browser QA in Low graphics verified the Chilkalguda/Secunderabad yard on the minimap and full map, zooming from street detail to a city overview, and closing/reopening the map. The Railway legend and all 816 source profiles were reported by the visible map layer; the console had no errors. This is map/layout verification, not a physical-phone FPS benchmark.
