# Independent metro architecture review

Reviewer: `/root/metro_independent_review`, separate from the station producer. Reviewed 2026-11-02. No production code was edited by this reviewer. The reviewer added failure regressions; Root implemented the corrections.

## Verdict

The original candidate **failed three independent connection/clearance checks**. Root's bounded corrections now pass those checks. The architecture is a credible stylized Hyderabad metro interpretation: open concourse, covered two-flight access, intermediate rest landings, platform stairs, opaque lift shafts with landing doors, shared interchange circulation and limited station-name boards.

**Current verdict: SCOPED PASS for metro source, geometry and reviewed native visuals.** Ten independent groups pass, including the exact retained footbridge/shaft/door conflict and every final registered ground-door approach. The final corrected Bharat entry and side images were actually opened and show the door and its approach clear of the preserved footbridge tower. The open-concourse lamp intrusion is fixed and its seven focused groups pass again after the access correction. Earlier failed batches remain documented below; they do not describe the corrected held source. No phone FPS, exact entrance GPS or surveyed architectural replica is certified here.

## Independent failures and corrections

1. **Curved stairs detached from the lower concourse.** Internal flights followed curved tracks but the main concourse remained a straight tangent slab. A generated-tile audit found six retained flights with less than 0.6m usable lower-floor overlap among 227 actual emitted flights across all 59 assemblies. Habsiguda had 0.40m/0.45m; JBS/Parade Ground and RTC Cross Roads had 0.55m; both south-side Secunderabad West flights had **zero** floor support. These were actual support surfaces from packed tiles after runtime road-grade preparation, not a plan-only assertion.

   Root added a physical, clearance-checked `:concourse-landing` from each curved stair foot to its projected point inside the real concourse. The existing `platformLinks` path renders it and adds tyre support. No station, road or source coordinate moved. The retest finds no detached retained flight; all 227 lower links end on actual retained concourse slabs. A separate full-width check passes 936 samples at parapet crossings.

2. **A shifted street stair could pass a building while its horizontal link cut through it.** `flightClear` checked corrected building occupancy; `landingClear` previously checked only road/train envelopes. A regression with a visible 22m adjacent polygon reproduced the failure after lateral stair placement. Root added height-aware, conservatively padded building checks along each landing. The complete stair/rest/link candidate is now rejected or moved as a unit.

3. **A clear lift shaft could retain links inside a neighboring building.** The same omission affected its lower and upper floor links. The independent real polygon/height occupancy fixture failed before the change and passes after it. The checks cover the full link width, not just a clear shaft or center endpoint. Shared interchange links now use the same helper as well as their existing checks.

The initial three failures are reproducible in the pre-fix source; they are not reclassified as passes because the original nine producer groups passed. Their before/after logs are retained alongside this report.

## Tests independently executed

| Check | Result | Scope |
|---|---:|---|
| Initial independent regressions | 0/3, expected failures | Actual lower attachment; street/lift link building clearance |
| Post-fix independent regressions | 6/6 | Includes real floor/parapet connection, lower-link envelope and total static budget |
| Original metro-access groups | 9/9 | Source assemblies, road/train clearance, real stairwells, graded packed Ameerpet/MGBS transfers, opaque-pane regression |
| world-presentation | 10/10 | Open sightlines, finite checked architecture, shared opaque station material |
| station-board-presentation | 9/9 | Counts/orientations, all English/Telugu names fitting both quality modes, bounded atlas and disposal |
| metro-platform | 7/7 | Existing continuous car pad, curved handoff support, benches/crowds and lamp headroom |

Commands: `node scripts/test-v21-fixes.mjs metro-access-independent`, `metro-access`, `world-presentation`, `station-board-presentation`, `metro-platform`. The runner matches filename substrings; the later `metro-access` invocation also included the three independent tests present then (12 total), so it must not be counted as twelve original producer groups.

The new lower-link test independently checks **59,544 finite generated vertices** against `metroFlightClearance`. The original access envelope test checked 1,354,692 vertices but omitted `platformLinks`; the independent additional check closes that omission. All access geometry totals 1,490,700 vertices across 59 standalone plans, with the maximum 41,952 at Ameerpet, under the declared 48,000-vertex per-station budget including both upper and lower platform links. These bounds do not establish a real-phone frame rate.

## Actual image review

Reviewed the 25 day capture positions listed by `evidence/main-expansion/metro-captures-v1.json`, substituting `metro-mgbs-green-concourse-rechecked-v1.png` for the stale MGBS concourse; also opened both night files and the integrated Green-hover/metro-held frames. Views are assessed by their visible content, not their filename. Capture fingerprint: `5ec3ceb7403c9d92539d1e547ff9a09ff838ba20cc0a3b6333ca6a49457670d0`, Low graphics. These images precede the lower-link correction.

- Madhapur, Rasoolpura and JBS show recognizably open station volume, blue/green trim, covered real stair treads, rails and intermediate landings. JBS platform shows open outer rails, large enough walking area and one legible inward station identity on each side.
- Ameerpet and MGBS overviews show shared multi-level circulation rather than two isolated buildings. The corrected MGBS concourse visibly has an open floor and fare-gate route, not the neighboring building seen in the stale frame. Source and packed tests support the physical shared-bank connections; the screenshots do not survey their real-world placement.
- Rasoolpura street view retains clear driving lanes under the station. The independent raised-road fixture also verifies that a lower decorative window is never placed through a flyover driving envelope.
- The two night files actually show platform views, despite their `stair-night` names. Lit fixtures and bilingual boards remain visible without transparent UI-style materials. They do not verify night stair-entry lighting.
- From one Madhapur street viewpoint, an existing road-light pole obscures part of the exterior name. This is a view-dependent legibility imperfection; the board remains bounded and legible from other views. Do not describe every approach as unobstructed.
- The integrated Green-hover frame visibly has the Roadster above the high Green canopy without clipping. A single frame cannot establish a complete flight path, manual landing, story transition or phone performance.

### Required fresh evidence

Root is adding a visible rendered-view indicator to the review harness. After selecting a view, wait until the renderer confirms that exact station/view before capture. Recheck the actual corrected Secunderabad West lower landing and a curved JBS lower stair from outside and concourse side; also capture a complete platform view and actual retained street/lift connection at Ameerpet and MGBS. Existing MGBS default stair-foot framing points at a nearby building and cannot prove its access route either way. Retain fresh integrated Green flight/manual metro landing and Rasoolpura driving evidence separately from isolated architecture images.

## Reference comparison and accuracy boundary

Independently read the [official L&T station-planning page](https://www.ltmetro.in/about-us/project-highlights/station-planning), opened all three rendered pages of the [2 September 2014 L&T station-design PDF](https://ltmetro.com/wp-content/uploads/2025/01/stationsdepotdetails02september2014-1.pdf), and read the [official HMRL MGBS interchange release](https://hmrl.co.in/wp-content/uploads/2025/06/2020-02-06-MGBS-Interchange-Station-Write-up.pdf). The design images support central spine-and-wing construction, open sides, covered stairs with intermediate landings, distinct concourse/platform routes and typical six-metre side platforms. These broad features are present in the candidate. The MGBS document supports shared circulation between lower Red and upper Green levels.

Those references do not establish the game's exact entry coordinates, transfer-bank position, detailed lift-door layout or every current station's equipment inventory. Retained 130m platforms and simplified interchange buildings are game dimensions. The real MGBS release describes a larger interchange and full equipment inventory which this model does not reproduce exactly. The Madhapur facilities page timed out in this independent fetch, so its current counts remain producer-sourced rather than independently reverified. Unsafe fitted access is omitted instead of forced through roads or buildings. No fabricated surveyed entrance claim is acceptable.

## Source reviewed after corrections

SHA-256 at independent retest:

- `src/world/metro-station-access.ts`: `09f63b8c9b5a88634351bdd250bcf4f6616a75ba89b717de0fcb7cd4ada0041a`
- `src/world/city.ts`: `1cd1fcda1d6680e779c9041cd4c0a16842f5f9aa5ca2da0c9a69c8a31edf3710`
- `src/world/metro-flight-clearance.ts`: `c94124d1fac49f43682236f4ee3e585a008db4c873b9cdb4dc0de5ca226e34ab`

This feature review does not approve other agents' character art, traffic, complete road network, campaign sequence or final release. Root owns final integration and fresh native gameplay evidence.

## Fresh v2 native review and newly exposed ground-entry defect

All **17** images listed in `evidence/main-expansion/metro-captures-v2.json` were actually opened and inspected. Fingerprint: `ed472b0b6aaf6c5507313d38c314a083b44b8f677efc876a8c45c8be44c9ba88` (frozen6, server4256, Low). Each image visibly identifies the station, rendered view and day/night state after rendering. No v1 stale-view assumption is used for these frames.

The Secunderabad West platform and concourse now show open usable volumes; Habsiguda's overview/concourse are coherent; Ameerpet and MGBS show shared level circulation and open concourses; JBS street/entry shows real covered flights and an intermediate rest; Rasoolpura's street is unobstructed and its day/night platform boards, lamps and outer guards are visually coherent. The JBS night street also now establishes actual night street contrast, rather than relying on a platform file with the wrong name. No new opaque-pane or road-blocking structure is visible in those views. The Secunderabad West Entrance camera is too close to a flight side and adjacent facade to establish a complete street opening; this is a fixture-framing limitation, not independently established building penetration.

The confirmed RTC Cross Roads overview has no visible external stairs/lifts, and its confirmed Entrance view shows empty ground below the end board. A production-equivalent audit confirms this is **not** just camera framing. With the actual graded tile roads, railway and metro clearance, corrected visible building polygons/heights, and shared-interchange policy, the following station identities have zero external arms and zero ground lifts:

| Station | Retained street arms | Retained lifts | Internal platform flights |
|---|---:|---:|---:|
| Bharat Nagar | 0 | 0 | 4 |
| Chikkadpally | 0 | 0 | 4 |
| Paradise | 0 | 0 | 2 |
| RTC Cross Roads | 0 | 0 | 2 |

This audit covers all56runtime station identities/59assemblies, rather than only unoccupied standalone plans. The earlier estimate of57identities counted the raw source records:57source IDs become56runtime identities because the existing `st_jbs` alias is suppressed when the retained `st_parade_grounds` Green anchor exists. No source station was newly removed. Habsiguda retains3arms/2lifts and Secunderabad West3arms/2lifts. Ameerpet's primary retains1arm/3lifts and its secondary uses the shared connection; MGBS's primary retains2arms/1lift with its shared secondary. These are modeled current counts, not real-world equipment claims.

Repro: `node scripts/test-v21-fixes.mjs metro-access-independent` now has **6 passes and 1 failure**, the group `actual packed buildings and runtime road grades retain at least one ground entry for every station identity`. The complete diagnostic and failure are retained as `evidence/main-expansion/metro-independent-ground-entry-before.log`.

### Correction required before final station acceptance

The current policy only tries lateral shifts of fixed longitudinal street/lift positions. Road-only and building-only plans individually retain routes at each of the four failures; their combined constraints eliminate those exact positions. Keep all existing road/train/building checks. Search a finite set of alternate longitudinal locations **inside the existing station envelope**, retaining the preferred current placements first. For example, ground lifts can try internal `u` positions within ±36m, with the existing7lateral positions, and check the shaft plus both complete links. Street arms can try shorter `|u|` positions within the existing37.5m bound, reusing the same two-flight/rest/landing form. A valid route must reach an actually retained concourse slab; its guard opening must use the chosen `u`, and its full generated geometry must stay inside the existing flight index and resource bound.

Use fallback placement only if ordinary cleared entrances are unavailable. Do not force a route through a building/road, invent an underpass, move the station or label fallback coordinates as surveyed. Re-run all seven independent groups plus the producer/access/board/platform suites; then capture each affected station's actual retained ground entry and its concourse connection from the corrected production plan, not the unfiltered default-arm camera. Root/producer owns the correction; this reviewer has not changed production code.

Independent finite probes found clear alternative lift/straight-link combinations within `u∈[-36,36]` (2m steps) at Bharat Nagar (43), Chikkadpally (24) and RTC (18), using the existing seven lateral setbacks and checking actual retained concourse support. These are candidate counts, not produced entrances or real coordinates. One safe alternate two-flight Chikkadpally stair was also found (`side=-1,end=1,u=28,v=-29.7`). **Paradise had zero safe alternatives in those probes**, including an additional perimeter probe at `u=±40,44,48,52` with the lower endpoint clamped to±36. A simple longitudinal shift must not be presented as a proven solution for Paradise. Its full shaft/link failure needs further production-side diagnosis and, if justified, a bounded completely checked route; the independent zero-entry failure remains until real geometry is emitted.

## Held ground-entry fixes: independent source and geometry recheck

The access and footprint producers subsequently resolved the four-station omission. Independently inspected their exact code and reports, then reran the tests:

- `metro-access-independent`: **8/8 pass**. The formerly failing packed-city ground-entry audit reports `stationIdentities:56, missingGroundEntries:[]`. Three actual alternate full-height lift banks are retained at Bharat Nagar, Chikkadpally and RTC, each side−1/u0, with two actual landing links. The eighth independent group draws those actual banks and verifies all **4,860** emitted mesh vertices are finite, do not intersect road/train clearance or corrected buildings, and remain inside indexed static flight clearance; maximum1,908vertices per bank.
- `metro-ground-access`: **5/5 pass**, independently rerun. Includes a blocked-preferred-position fixture, truthful lower-only stop geometry, rejection of an isolated floor component, actual whole-width retained floor support and **528** actual full-width lift/parapet crossing samples, including curved platform guards.
- `metro-station-footprint`: **4/4 pass**, independently rerun. Consumes the actual source feature, checks unchanged raw metadata, retains unrelated properties/changed footprints/absent stations, and accepts equivalent winding/start-point encodings.

Source assessment: alternate placement runs only after all preferred external entrances fail. Search bounds remain inside the existing static envelope; complete shaft/link/building/road/train checks remain. A lower-only lift can qualify only if its actual retained14×5floor-cell component reaches a retained internal stair landing; it cannot count an isolated floor island or invent a platform door. Current content uses full-height banks, so lower-only behavior is fixture-tested rather than claimed as a current new placement. Guard holes are derived from the physical full-width link crossing, using actual curved ten-metre platform faces.

Paradise was blocked by an overlapping transportation-source station extrusion. The replacement guard requires exact source ID `18f6a0df-e72`, the reviewed classification/height/seven footprint points and an actual nearby aligned Blue-line Paradise assembly. It preserves the raw packed feature and records the replacement reason; it does not broadly suppress nearby buildings or relax occupancy. Paradise now retains its ordinary1street arm,1lift and2internal flights. This is a narrowly justified duplicate-model correction, not evidence of surveyed entrance placement.

Held source SHA-256 values independently confirmed:

- `src/world/metro-station-access.ts`: `52897c73640466a26ffc1be1f79f82d68ddac8715eb60678bb6b40c985009aa6`
- `src/world/building-clearance.ts`: `950afe1798f146048f72784858c08af54b8eeea6ec47de36a66ef52b30dd88b5`
- `src/world/city.ts`: `c3eb099a0623b3cbfe145a0a94865a30bbae2dbc0d61354f0fba3934f1c09141`

Logs: `evidence/main-expansion/metro-independent-final-access.log`, `metro-independent-final-ground-access.log`, `metro-independent-final-footprint.log`. Final native affected-station captures will be recorded below after actual inspection. This reviewer has still made no production edits.

## V3 affected-station native inspection

Actually opened all12day images in `evidence/main-expansion/metro-ground-captures-v3.json`, fingerprint `acf9fc9bad04252c0da84f5a5b6de0091d7cc7a81e04efb1eac12ed99c692c32` (frozen9, server4259). Each visibly confirms the correct station/view after render. The repaired bank shafts and upper links are visible from the concourse views, no new bank/building/road intersection is apparent, and the duplicate Paradise wall is gone. Signs remain readable, although Chikkadpally's street pole occludes a small part of its exterior name from that one approach.

Two limits prevent closing visual acceptance on this batch alone:

1. The four `entrance` views still target the unfiltered default street arm, not the retained production access. Paradise/RTC show the unbuilt opposite end, Bharat Nagar shows an underside column, and Chikkadpally is framed inside an adjacent facade. This is a review-fixture camera defect, not evidence that those newly retained banks clip buildings. Capture one actual retained ground-entry close-up per affected station, selected from the generated station-stair/lift supports or the fully cleared production plan.
2. Chikkadpally and RTC concourse frames visibly show streetlight arms/heads projecting through the floor into passenger space. The old closed station volume masked this pre-existing lamp-placement overlap; the now-open concourse exposes it. It is separate from the cleared access banks and must not be presented as a fallback-link collision. Root has been notified for a narrow station-floor/streetlamp clearance correction or an explicit remaining visual limitation.

## V4 exact-entry and streetlamp review

Actually opened all8images in `evidence/main-expansion/metro-final-captures-v4.json`, fingerprint `97f2ee7895f9dcfc149a4087af6f507ef632f0f2d6b8e43aae541089d9ba3eec` (frozen12, server4262), plus Root's native Bharat side orbit `metro-final-st_bharat_nagar-entry-side-v4.png`. Entrance framing now uses the actual emitted ground-lift supports. RTC, Chikkadpally and Paradise ground doors appear clear. The RTC/Chikkadpally day and night concourses no longer show the penetrating streetlight heads; retained station illumination remains visible.

Independently inspected the lamp fix in `city.ts`, `street-lamps.ts`, `metro-street-lamp-clearance.ts` and the worker initialization. Exact pole/arm/housing/diffuser envelopes share drawing parameters. The immutable metro index is reused by the persistent tile worker. A final worker-only queue checks actual retained access supports before drawing, adds colliders only for accepted physical lamps and removes rejected provisional emitter references. There is no render-loop queue or per-frame station scan. Independently reran7focused lamp groups, the prior8independent access groups and5legacy lighting/gantry groups: all pass. The all51station-tile audit retains6,613fixtures with zero concourse/access/pier conflicts and matching retained emitters. These are geometry/consistency results, not phone FPS evidence.

### Bharat Nagar physical ground-entry conflict — still blocked

The white block obscuring the actual Bharat doorway is the legacy solid stair tower for mapped footbridge `w1480567593`, at source endpoint `(-7067.9,-6418.4)` in tile `-8_-7`. `extras.ts` emits its6.6m-high body and8thin fake treads, matching both native views. It registers a radius1.8ground obstacle but is neither a building-grid polygon nor a station support, so the previous access occupancy callback ignored it.

The actual emitted lift shaft is centered at `(-7065.504397806015,-6418.251100946195)`. The ninth independent test derives the shaft from actual tile supports, excludes only its own registered collider, and fails against the retained footbridge obstacle (distance to shaft rectangle0.8819m, obstacle radius1.8m). The footprint producer separately confirmed exact oriented-box intersection and that the ground-door center and approach lie inside the solid tower. The revised independent regression also checks exact tower geometry and the whole1.4mdoor width over a2mapproach, so merely clearing a smaller gameplay circle will not qualify. It requires the legitimate mapped footbridge to remain.

Required bounded correction: include immutable pre-station physical occupancy in access placement, with vertical bounds, and check the ground-door approach as well as shafts, stairs and floor links. Select another cleared entrance within the existing envelope; preserve the source footbridge and all existing road/building/train checks. The access producer owns this change. Repeat the ninth regression and native Bharat door/side views before scoped visual acceptance. Failure evidence: `evidence/main-expansion/metro-independent-bharat-tower-before.log`.

## Final physical-entry correction: independent recheck

The access producer added a copied, height-aware spatial index of existing physical obstacle proxies before generated stations emit their own objects. A conservative enclosing radius covers rectangular fixture corners. Whole shafts, flights and links use that index alongside existing road, rail, metro and corrected-building checks; lift doors reserve a real1.6m-wide2mapproach, and street stair feet reserve an approach too. The mapped footbridge is unchanged. Bharat's actual bank moves from the blocked localu0candidate to cleared localu4within the same station envelope. The temporary index is created only on station-owner tiles and is neither returned with tiles nor used per frame.

Root authorized a passive, optional synchronous `observeStationAccess` build callback. The independent tests now capture the actual retained plan and exact planning context after geometry emission, instead of reconstructing obsolete building-only inputs. Production workers do not supply that callback; its argument is not created when absent, and it adds no returned worker metadata.

Independently reran `metro-access-independent`: **10/10 pass**. All56runtime identities/59assemblies retain ground access;5actual alternate banks emit7,956finite vertices, all within combined physical/road/train/building and indexed flight bounds (maximum2,052per bank). The exact original Bharat footbridge remains, with no shaft/tower oriented-box intersection and no ground-door/approach sample inside it. The tenth group checks **all74actual emitted ground-door approaches against the final registered physical scene**, including fixtures added after station planning: zero conflicts. This closes the feedback gap that a pre-station-only check could leave.

Independently reran the dependent lamp suite after the changed access supports: **7/7 pass**,51station tiles,6,613retainedfixtures and zero concourse/access/pier conflicts. The previous5legacy lighting groups also passed independently. No additional production source edits were made by this reviewer.

Final source SHA-256 values confirmed:

- `src/world/metro-station-access.ts`: `724bd6f25e4c73709fb533ba3bc470053d3656fe4767c003f8798481e34a6ef0`
- `src/world/city.ts`: `bc6adedd9116534fb2ee32a74fc17ebe705d5ab454cba91ecf3629c50ec64a86`
- `src/world/street-lamps.ts`: `13698684ce71333c9fb7b4c852fb6aaa84a7bed07d15223d3714f1b738550b15`
- `src/world/metro-street-lamp-clearance.ts`: `86bb5929f92b48c12cf016e8d45e997cf7b91bc8079f0ecf4da403e8a63b831a`
- `src/world/building-clearance.ts`: `950afe1798f146048f72784858c08af54b8eeea6ec47de36a66ef52b30dd88b5`

Final independent logs: `evidence/main-expansion/metro-independent-final-physical-access.log` and `metro-independent-final-physical-lamps.log`. At this source-check stage, fresh final-build Bharat entry/side images were still required; their completed review follows below.

## Final corrected Bharat native sign-off

Actually opened both `evidence/main-expansion/native-scenes-v15/bharat-entry-v15.png` and `bharat-side-v15.png`. Frozen15 fingerprint: `d0701843673f99e54ba714b71cf08e3c886854da0804686409157f471f0affa6`. The visible rendered-view indicator confirms `st_bharat_nagar / entrance / day`; the second image is a native camera orbit around that same actual retained entry. This is the corrected localu4bank, not the failed v4placement.

The ground door is fully visible, with open frontage and ground approach. The original white mapped footbridge tower and its treads remain beside the lift rather than covering the doorway. The side orbit confirms separate physical bodies; no lamp arm or head cuts through the entry. The images support the corrected physical-access result; the exact two-metre/whole-width clearance and connections are established by the independent geometry checks above, not inferred from perspective alone. Earlier native concourse/stair/platform images and the independent retained-floor, guard-opening, envelope and final-obstacle tests establish the remainder of this scoped review.

Reconfirmed all five final metro source hashes above after opening these images; they remain unchanged. Root reports that subsequent frozen17changes affect story-camera, crowd and QA presentation, not this station geometry. No further test repetition was needed without a metro source change. The failed Bharat v4images remain failure evidence and are not reclassified as corrected visuals.

**Sign-off: SCOPED PASS.** The independently identified station connection, omitted-ground-entry, duplicate-shell, penetrating-lamp and physical-footbridge conflicts are resolved in the held source and the reviewed corrected native views. This sign-off approves the metro feature scope only. Full campaign/story progression, traffic/camera feel, all roads/flyovers, character likeness, physical-phone compatibility and sustained frame-rate validation remain separate integration gates owned by Root. Entrance coordinates are clearance-fitted game geometry, not surveyed real station entrances.
